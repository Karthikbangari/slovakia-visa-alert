import { env } from "../config/env.js";
import { TARGET } from "../config/target.js";
import type { AvailabilityResult, ProviderAdapter, ProviderName } from "../types.js";
import { VisaAlertDatabase } from "../database/db.js";
import { NotificationDispatcher } from "../notifications/dispatcher.js";
import { matchesTarget, deriveConfidence } from "../detectors/validator.js";
import { keysForResult } from "../detectors/availabilityKey.js";
import { AdaptivePoller } from "./polling.js";
import { ProviderRuntimeState } from "./providerRuntimeState.js";

export interface ProviderStatusSnapshot {
  status: string;
  lastChecked: string | null;
  responseTimeMs: number | null;
  authenticated?: boolean;
  paused: boolean;
  pauseReason?: string;
}

/**
 * The continuous monitor loop — requirement #33. Each enabled provider runs
 * on its own independent timer so one broken provider never stalls another.
 */
export class MonitorService {
  private db: VisaAlertDatabase;
  private dispatcher: NotificationDispatcher;
  private runtime = new ProviderRuntimeState();
  private pollers = new Map<ProviderName, AdaptivePoller>();
  private timers = new Map<ProviderName, NodeJS.Timeout>();
  private running = false;
  private latestSnapshot = new Map<ProviderName, ProviderStatusSnapshot>();
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private pruneTimer: NodeJS.Timeout | null = null;

  constructor(
    private providers: ProviderAdapter[],
    db?: VisaAlertDatabase,
  ) {
    this.db = db ?? new VisaAlertDatabase();
    this.dispatcher = new NotificationDispatcher(this.db);
    for (const p of providers) this.pollers.set(p.name, new AdaptivePoller());
  }

  getDb(): VisaAlertDatabase {
    return this.db;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    await this.dispatcher.dispatchSystemAlert({
      severity: "info",
      title: "🟢 SLOVAKIA VISA MONITOR STARTED",
      message: [
        `📍 ${TARGET.region}`,
        `🛂 ${TARGET.category} Category`,
        `📚 ${TARGET.purpose}`,
        `⏳ ${TARGET.visaType}`,
        "",
        `Check interval: ${env.checkIntervalSeconds} seconds`,
        `Providers: ${this.providers.filter((p) => p.enabled).map((p) => p.name).join(", ") || "none enabled"}`,
        `Time: ${new Date().toISOString()}`,
      ].join("\n"),
    });

    for (const provider of this.providers) {
      if (!provider.enabled) continue;
      this.scheduleNext(provider, 0);
    }

    this.heartbeatTimer = setInterval(() => this.db.heartbeat(), 60_000);
    this.db.heartbeat();

    this.pruneTimer = setInterval(
      () => this.db.pruneOldData(env.historyRetentionDays),
      6 * 60 * 60 * 1000,
    );
  }

  async stop(): Promise<void> {
    this.running = false;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.pruneTimer) clearInterval(this.pruneTimer);
    for (const provider of this.providers) {
      await provider.dispose?.().catch(() => undefined);
    }
    this.db.close();
  }

  getSnapshot(): Record<string, ProviderStatusSnapshot> {
    const out: Record<string, ProviderStatusSnapshot> = {};
    for (const [name, snap] of this.latestSnapshot.entries()) out[name] = snap;
    return out;
  }

  lastHeartbeat(): string | null {
    return this.db.lastHeartbeat();
  }

  private scheduleNext(provider: ProviderAdapter, delayMs: number): void {
    const timer = setTimeout(() => this.runCheck(provider), delayMs);
    this.timers.set(provider.name, timer);
  }

  private async runCheck(provider: ProviderAdapter): Promise<void> {
    if (!this.running) return;
    const poller = this.pollers.get(provider.name)!;

    if (this.runtime.isPaused(provider.name)) {
      // Still record a lightweight heartbeat-style status so the dashboard
      // shows the pause reason, but skip real interaction with the site.
      this.latestSnapshot.set(provider.name, {
        status: this.runtime.pauseReason(provider.name) ?? "HUMAN_ACTION_REQUIRED",
        lastChecked: new Date().toISOString(),
        responseTimeMs: null,
        paused: true,
        pauseReason: this.runtime.pauseReason(provider.name),
      });
      this.scheduleNext(provider, 60_000);
      return;
    }

    let result: AvailabilityResult;
    try {
      result = await provider.checkAvailability();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.db.recordSystemEvent("ERROR", `${provider.name} check threw: ${message}`, provider.name);
      poller.recordResult("ERROR");
      this.scheduleNext(provider, poller.nextDelayMs());
      return;
    }

    await this.handleResult(provider.name, result);
    poller.recordResult(result.state);
    this.scheduleNext(provider, poller.nextDelayMs());
  }

  private async handleResult(providerName: ProviderName, result: AvailabilityResult): Promise<void> {
    const match = matchesTarget(result);
    const confidence = deriveConfidence(result);
    const finalResult: AvailabilityResult = { ...result, confidence };

    this.db.recordCheck(finalResult, match.matchesAll);

    const transition = this.runtime.applyState(providerName, finalResult.state);

    // Set the snapshot AFTER applying the transition so `paused` reflects
    // the pause this very check may have just triggered, instead of
    // lagging one cycle behind the `status` field.
    this.latestSnapshot.set(providerName, {
      status: finalResult.state,
      lastChecked: finalResult.checkedAt,
      responseTimeMs: finalResult.responseTimeMs,
      paused: this.runtime.isPaused(providerName),
      pauseReason: this.runtime.pauseReason(providerName),
    });

    if (transition.shouldAlertPause) {
      const label = finalResult.state === "HUMAN_ACTION_REQUIRED" ? "CAPTCHA / verification" : "session expiry";
      await this.dispatcher.dispatchSystemAlert({
        severity: "critical",
        title: finalResult.state === "SESSION_EXPIRED" ? "🔐 SESSION EXPIRED" : `🛑 ${providerName} NEEDS HUMAN ACTION`,
        message:
          finalResult.state === "SESSION_EXPIRED"
            ? `${providerName} session expired.\n\nOpen the server and run:\nnpm run auth:bls\n\nMonitoring for ${providerName} has been paused until authentication is restored.`
            : `${providerName} hit ${label}: ${finalResult.rawStatus}\n\nAutomated interaction with ${providerName} has been paused. Complete verification manually, then monitoring will resume automatically once a normal response is seen (or resume it yourself after re-authenticating).`,
      });
      return;
    }

    if (transition.shouldAlertError) {
      await this.dispatcher.dispatchSystemAlert({
        severity: "warning",
        title: `⚠️ ${providerName} MONITOR ERROR`,
        message: `${providerName} has failed 3+ consecutive checks. Latest: ${finalResult.rawStatus}`,
      });
    }

    if (transition.shouldAlertRecovery) {
      await this.dispatcher.dispatchSystemAlert({
        severity: "info",
        title: `✅ ${providerName} MONITOR RECOVERED`,
        message: `${providerName} is responding normally again.`,
      });
    }

    const activeKeys = keysForResult(finalResult);

    if (finalResult.state === "SLOT_AVAILABLE" && match.matchesAll) {
      await this.handleConfirmedAvailability(finalResult, confidence);
    } else if (finalResult.state === "POSSIBLE_SLOT") {
      await this.dispatcher.dispatchPossibleSlot({
        provider: providerName,
        region: TARGET.region,
        category: TARGET.category,
        visaType: TARGET.visaType,
        purpose: TARGET.purpose,
        date: finalResult.dates[0]?.date ?? "unknown",
        time: finalResult.dates[0]?.time,
        detectedAt: finalResult.checkedAt,
        bookingUrl: finalResult.bookingUrl,
        confidence: "LIKELY",
      });
    }

    // Close out slots that disappeared (requirement #9: 🔴 SLOT CLOSED).
    const { closedKeys } = this.db.deactivateStaleSlots(providerName, activeKeys, finalResult.checkedAt);
    for (const key of closedKeys) {
      const [, , , , date, time] = key.split("|");
      await this.dispatcher.dispatchSlotClosed({
        provider: providerName,
        region: TARGET.region,
        category: TARGET.category,
        visaType: TARGET.visaType,
        purpose: TARGET.purpose,
        date,
        time: time || undefined,
        detectedAt: finalResult.checkedAt,
        bookingUrl: finalResult.bookingUrl,
        confidence: "CONFIRMED",
      });
    }
  }

  private async handleConfirmedAvailability(result: AvailabilityResult, confidence: AvailabilityResult["confidence"]): Promise<void> {
    for (const dt of result.dates) {
      const { id, isNew, key } = this.db.upsertSlot(result.provider, dt.date, dt.time, result.checkedAt);

      const lastAlert = this.db.lastAlertForKey(key);
      const cooldownMs = env.alertCooldownMinutes * 60 * 1000;
      const withinCooldown = lastAlert && Date.now() - new Date(lastAlert.sentAt).getTime() < cooldownMs;

      // New slot (never alerted, or reopened after being closed) always
      // fires immediately regardless of cooldown — requirement #9.
      if (!isNew && withinCooldown) continue;

      const payload = {
        provider: result.provider,
        region: TARGET.region,
        category: TARGET.category,
        visaType: TARGET.visaType,
        purpose: TARGET.purpose,
        date: dt.date,
        time: dt.time,
        detectedAt: result.checkedAt,
        bookingUrl: result.bookingUrl,
        confidence,
      };

      if (confidence === "CONFIRMED") {
        await this.dispatcher.dispatchConfirmedSlot(payload, id);
      } else {
        await this.dispatcher.dispatchPossibleSlot(payload);
      }
    }
  }
}
