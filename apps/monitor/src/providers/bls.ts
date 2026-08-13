import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { env } from "../config/env.js";
import { TARGET } from "../config/target.js";
import type { AvailabilityResult, ProviderAdapter } from "../types.js";
import { sessionManager, storageStatePath } from "../browser/sessionManager.js";
import { captureAvailabilityResponses, detectChallenge, loadSelectorConfig, saveDebugScreenshot } from "./common.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const selectors = loadSelectorConfig(path.join(__dirname, "selectors", "bls.selectors.json"), {
  loginUrlContains: "login",
});

/**
 * BLS Slovakia (India) provider.
 *
 * STATUS: confirmed live 2026-08-13 — real slot data is unreachable by
 * design, not just unverified. Login works fine (see `npm run auth:bls`),
 * and the authenticated applicant-list page loads normally. But BLS's
 * actual booking form (reached via "Book appointment" for an applicant)
 * requires solving a distorted-digit CAPTCHA image plus a mobile OTP —
 * and this isn't a one-time login gate, it reappears on every single
 * booking attempt. There is no way to view the date/slot calendar without
 * a human passing that check at that exact moment, which this project
 * deliberately never automates (see requirement #3/#45 — never fake a
 * working detector, never bypass CAPTCHA).
 *
 * So this adapter's honest job is a session/health monitor: confirm the
 * saved login still works and the site is reachable, and alert you the
 * moment that stops being true (session expired, CAPTCHA/rate-limit/
 * maintenance hit). It will never — and structurally cannot — report a
 * confirmed open slot. If BLS ever changes this flow (e.g. adds a
 * self-service calendar that doesn't require per-attempt verification),
 * re-run `npm run inspect:bls` and revisit this file.
 */
export class BLSProvider implements ProviderAdapter {
  name = "BLS" as const;
  enabled = env.blsEnabled;

  async checkAvailability(): Promise<AvailabilityResult> {
    const startedAt = Date.now();
    const checkedAt = new Date().toISOString();
    const base = {
      provider: this.name,
      country: "Slovakia" as const,
      applicationCountry: "India" as const,
      checkedAt,
      bookingUrl: env.blsUrl,
    };

    if (!fs.existsSync(storageStatePath("bls"))) {
      return {
        ...base,
        region: null,
        category: null,
        visaType: null,
        purpose: null,
        available: false,
        dates: [],
        state: "SESSION_EXPIRED",
        confidence: "UNKNOWN",
        rawStatus: "No saved BLS session found. Run: npm run auth:bls",
        matchingCriteria: false,
        responseTimeMs: Date.now() - startedAt,
      };
    }

    const context = await sessionManager.getContext("bls");
    const page = await context.newPage();
    const { responses, dispose } = captureAvailabilityResponses(page);

    try {
      await page.goto(env.blsUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

      const challenge = await detectChallenge(page, selectors.loginUrlContains);
      if (challenge.isCaptcha) {
        await saveDebugScreenshot(page, "bls");
        return this.result(base, startedAt, {
          state: "HUMAN_ACTION_REQUIRED",
          confidence: "UNKNOWN",
          rawStatus: `CAPTCHA/bot-protection encountered: ${challenge.reason}`,
        });
      }
      if (challenge.isLoginRedirect) {
        return this.result(base, startedAt, {
          state: "SESSION_EXPIRED",
          confidence: "UNKNOWN",
          rawStatus: "Redirected to BLS login — saved session has expired. Run: npm run auth:bls",
        });
      }
      if (challenge.isMaintenance) {
        return this.result(base, startedAt, {
          state: "MAINTENANCE",
          confidence: "UNKNOWN",
          rawStatus: `BLS maintenance page detected: ${challenge.reason}`,
        });
      }

      // Kept for completeness / in case BLS changes its flow, but nothing
      // has ever been observed here in practice — see the class doc above.
      if (responses.length > 0 && env.debugMonitor) {
        // eslint-disable-next-line no-console
        console.log(`[bls] captured ${responses.length} availability-shaped JSON response(s) — inspect with npm run inspect:bls`);
      }

      // Reaching here means: authenticated, no CAPTCHA/maintenance/login-
      // redirect on the landing page — i.e. the session is healthy. That's
      // the most this adapter can honestly confirm; see class doc for why.
      return this.result(base, startedAt, {
        state: "MANUAL_PROCESS_ONLY",
        confidence: "UNKNOWN",
        available: false,
        rawStatus:
          "BLS session is valid and the site is reachable, but the actual date/slot calendar sits behind a CAPTCHA+OTP gate that reappears on every booking attempt (confirmed live 2026-08-13) — not something this bot will automate past. Check BLS manually to see real availability.",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return this.result(base, startedAt, {
        state: "ERROR",
        confidence: "UNKNOWN",
        rawStatus: `BLS check failed: ${message}`,
        errorType: "EXCEPTION",
      });
    } finally {
      dispose();
      await page.close().catch(() => undefined);
    }
  }

  private result(
    base: { provider: "BLS"; country: "Slovakia"; applicationCountry: "India"; checkedAt: string; bookingUrl: string },
    startedAt: number,
    extra: Partial<AvailabilityResult> & Pick<AvailabilityResult, "state" | "confidence" | "rawStatus">,
  ): AvailabilityResult {
    return {
      ...base,
      state: extra.state,
      confidence: extra.confidence,
      rawStatus: extra.rawStatus,
      region: extra.region ?? null,
      category: extra.category ?? null,
      visaType: extra.visaType ?? null,
      purpose: extra.purpose ?? null,
      available: extra.available ?? extra.state === "SLOT_AVAILABLE",
      dates: extra.dates ?? [],
      matchingCriteria: extra.matchingCriteria ?? false,
      responseTimeMs: Date.now() - startedAt,
      errorType: extra.errorType,
      httpStatus: extra.httpStatus,
      pageFingerprint: extra.pageFingerprint,
    };
  }

  async dispose(): Promise<void> {
    await sessionManager.closeContext("bls");
  }
}
