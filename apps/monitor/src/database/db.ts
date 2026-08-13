import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../config/env.js";
import { TARGET } from "../config/target.js";
import type { AvailabilityResult, ProviderName } from "../types.js";
import { availabilityKey } from "../detectors/availabilityKey.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveDbPath(url: string): string {
  // DATABASE_URL is a plain filesystem path for SQLite (e.g. ./data/visa-alert.db)
  const p = url.startsWith("./") || url.startsWith("../") ? path.resolve(process.cwd(), url) : url;
  fs.mkdirSync(path.dirname(p), { recursive: true });
  return p;
}

export class VisaAlertDatabase {
  db: Database.Database;

  constructor(dbPath = env.databaseUrl) {
    const resolved = resolveDbPath(dbPath);
    this.db = new Database(resolved);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.migrate();
  }

  private migrate(): void {
    const schemaPath = path.join(__dirname, "schema.sql");
    const schema = fs.readFileSync(schemaPath, "utf-8");
    this.db.exec(schema);
  }

  recordCheck(result: AvailabilityResult, matchesAll: boolean): number {
    const stmt = this.db.prepare(`
      INSERT INTO monitor_checks
        (provider, status, checked_at, duration_ms, http_status, criteria_match, confidence, error_type, details)
      VALUES (@provider, @status, @checkedAt, @durationMs, @httpStatus, @criteriaMatch, @confidence, @errorType, @details)
    `);
    const info = stmt.run({
      provider: result.provider,
      status: result.state,
      checkedAt: result.checkedAt,
      durationMs: result.responseTimeMs,
      httpStatus: result.httpStatus ?? null,
      criteriaMatch: matchesAll ? 1 : 0,
      confidence: result.confidence,
      errorType: result.errorType ?? null,
      details: result.rawStatus.slice(0, 500),
    });
    return Number(info.lastInsertRowid);
  }

  upsertSlot(provider: ProviderName, date: string, time: string | undefined, nowIso: string): {
    id: number;
    isNew: boolean;
    key: string;
  } {
    const key = availabilityKey(provider, { date, time });
    const existing = this.db
      .prepare(`SELECT id, active FROM slots WHERE availability_key = ?`)
      .get(key) as { id: number; active: number } | undefined;

    if (existing) {
      this.db
        .prepare(`UPDATE slots SET last_seen_at = ?, active = 1 WHERE id = ?`)
        .run(nowIso, existing.id);
      return { id: existing.id, isNew: existing.active === 0, key };
    }

    const info = this.db
      .prepare(
        `INSERT INTO slots
          (availability_key, provider, region, category, visa_type, purpose, slot_date, slot_time, first_seen_at, last_seen_at, active)
         VALUES (@key, @provider, @region, @category, @visaType, @purpose, @date, @time, @now, @now, 1)`,
      )
      .run({
        key,
        provider,
        region: TARGET.region,
        category: TARGET.category,
        visaType: TARGET.visaType,
        purpose: TARGET.purpose,
        date,
        time: time ?? null,
        now: nowIso,
      });
    return { id: Number(info.lastInsertRowid), isNew: true, key };
  }

  deactivateStaleSlots(provider: ProviderName, activeKeys: string[], nowIso: string): { closedKeys: string[] } {
    const rows = this.db
      .prepare(`SELECT id, availability_key FROM slots WHERE provider = ? AND active = 1`)
      .all(provider) as { id: number; availability_key: string }[];
    const closedKeys: string[] = [];
    const activeSet = new Set(activeKeys);
    for (const row of rows) {
      if (!activeSet.has(row.availability_key)) {
        this.db.prepare(`UPDATE slots SET active = 0, last_seen_at = ? WHERE id = ?`).run(nowIso, row.id);
        closedKeys.push(row.availability_key);
      }
    }
    return { closedKeys };
  }

  recordAlert(slotId: number | null, channel: string, sentAt: string, successful: boolean, error?: string, latencyMs?: number): void {
    this.db
      .prepare(
        `INSERT INTO alerts (slot_id, channel, sent_at, successful, error, latency_ms) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(slotId, channel, sentAt, successful ? 1 : 0, error ?? null, latencyMs ?? null);
  }

  lastAlertForKey(key: string): { sentAt: string } | undefined {
    return this.db
      .prepare(
        `SELECT a.sent_at as sentAt FROM alerts a
         JOIN slots s ON s.id = a.slot_id
         WHERE s.availability_key = ? AND a.successful = 1
         ORDER BY a.sent_at DESC LIMIT 1`,
      )
      .get(key) as { sentAt: string } | undefined;
  }

  recordSystemEvent(eventType: string, message: string, provider?: ProviderName): void {
    this.db
      .prepare(`INSERT INTO system_events (event_type, provider, message, created_at) VALUES (?, ?, ?, ?)`)
      .run(eventType, provider ?? null, message, new Date().toISOString());
  }

  heartbeat(): void {
    this.db.prepare(`INSERT INTO heartbeats (created_at) VALUES (?)`).run(new Date().toISOString());
    // Keep the table small — only the latest row matters for liveness.
    this.db.exec(`DELETE FROM heartbeats WHERE id NOT IN (SELECT id FROM heartbeats ORDER BY id DESC LIMIT 20)`);
  }

  lastHeartbeat(): string | null {
    const row = this.db.prepare(`SELECT created_at as createdAt FROM heartbeats ORDER BY id DESC LIMIT 1`).get() as
      | { createdAt: string }
      | undefined;
    return row?.createdAt ?? null;
  }

  setSessionStatus(provider: ProviderName, authenticated: boolean, nowIso: string): void {
    this.db
      .prepare(
        `INSERT INTO provider_sessions (provider, authenticated, last_verified_at)
         VALUES (?, ?, ?)
         ON CONFLICT(provider) DO UPDATE SET authenticated = excluded.authenticated, last_verified_at = excluded.last_verified_at`,
      )
      .run(provider, authenticated ? 1 : 0, nowIso);
  }

  getSessionStatus(provider: ProviderName): { authenticated: boolean; lastVerifiedAt: string | null } {
    const row = this.db
      .prepare(`SELECT authenticated as authenticated, last_verified_at as lastVerifiedAt FROM provider_sessions WHERE provider = ?`)
      .get(provider) as { authenticated: number; lastVerifiedAt: string | null } | undefined;
    return { authenticated: !!row?.authenticated, lastVerifiedAt: row?.lastVerifiedAt ?? null };
  }

  latestCheck(provider: ProviderName): Record<string, unknown> | undefined {
    return this.db
      .prepare(
        `SELECT provider, status, checked_at as checkedAt, duration_ms as durationMs, confidence
         FROM monitor_checks WHERE provider = ? ORDER BY checked_at DESC LIMIT 1`,
      )
      .get(provider) as Record<string, unknown> | undefined;
  }

  recentChecks(limit = 50): Record<string, unknown>[] {
    return this.db
      .prepare(
        `SELECT provider, status, checked_at as checkedAt, duration_ms as durationMs, confidence
         FROM monitor_checks ORDER BY checked_at DESC LIMIT ?`,
      )
      .all(limit) as Record<string, unknown>[];
  }

  lastActiveSlot(): Record<string, unknown> | undefined {
    return this.db
      .prepare(
        `SELECT provider, slot_date as slotDate, slot_time as slotTime, first_seen_at as firstSeenAt
         FROM slots WHERE active = 1 ORDER BY first_seen_at DESC LIMIT 1`,
      )
      .get() as Record<string, unknown> | undefined;
  }

  /**
   * All-time count of notifications the bot has actually sent successfully
   * (i.e. slot alerts that reached email), plus when the last one went out.
   * This is the "how many notifications has the bot sent" figure — counts
   * only the confirmed-slot alert channel, not possible-slot/system emails.
   */
  notificationStats(): { totalSent: number; lastSentAt: string | null } {
    const totalSent = (
      this.db
        .prepare(`SELECT COUNT(*) as c FROM alerts WHERE channel = 'email' AND successful = 1 AND slot_id IS NOT NULL`)
        .get() as { c: number }
    ).c;
    const lastSentAt = (
      this.db
        .prepare(
          `SELECT sent_at as sentAt FROM alerts WHERE channel = 'email' AND successful = 1 AND slot_id IS NOT NULL ORDER BY sent_at DESC LIMIT 1`,
        )
        .get() as { sentAt: string } | undefined
    )?.sentAt ?? null;
    return { totalSent, lastSentAt };
  }

  /**
   * Per-provider breakdown for the daily digest: how many currently-active
   * slots each provider has, plus its most recent status. Deliberately
   * per-provider (not a single combined number) so the digest can report
   * "VFS found 2, BLS found 0" — or omit a provider entirely when it has
   * nothing to report, per the digest's own formatting rules.
   */
  digestSnapshot(provider: ProviderName): { activeSlotCount: number; lastStatus: string | null; lastCheckedAt: string | null } {
    const activeSlotCount = (
      this.db.prepare(`SELECT COUNT(*) as c FROM slots WHERE provider = ? AND active = 1`).get(provider) as { c: number }
    ).c;
    const latest = this.db
      .prepare(`SELECT status, checked_at as checkedAt FROM monitor_checks WHERE provider = ? ORDER BY checked_at DESC LIMIT 1`)
      .get(provider) as { status: string; checkedAt: string } | undefined;
    return {
      activeSlotCount,
      lastStatus: latest?.status ?? null,
      lastCheckedAt: latest?.checkedAt ?? null,
    };
  }

  stats(sinceIso: string): { totalChecks: number; successfulChecks: number; failedChecks: number; slotsDetected: number } {
    const totalChecks = (
      this.db.prepare(`SELECT COUNT(*) as c FROM monitor_checks WHERE checked_at >= ?`).get(sinceIso) as { c: number }
    ).c;
    const failedChecks = (
      this.db
        .prepare(`SELECT COUNT(*) as c FROM monitor_checks WHERE checked_at >= ? AND status IN ('ERROR','RATE_LIMITED','MAINTENANCE')`)
        .get(sinceIso) as { c: number }
    ).c;
    const slotsDetected = (
      this.db.prepare(`SELECT COUNT(*) as c FROM slots WHERE first_seen_at >= ?`).get(sinceIso) as { c: number }
    ).c;
    return { totalChecks, successfulChecks: totalChecks - failedChecks, failedChecks, slotsDetected };
  }

  pruneOldData(retentionDays: number): void {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
    this.db.prepare(`DELETE FROM monitor_checks WHERE checked_at < ?`).run(cutoff);
    this.db.prepare(`DELETE FROM system_events WHERE created_at < ?`).run(cutoff);
    this.db
      .prepare(`DELETE FROM alerts WHERE sent_at < ? AND slot_id IN (SELECT id FROM slots WHERE active = 0)`)
      .run(cutoff);
  }

  close(): void {
    this.db.close();
  }
}
