import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { env } from "../config/env.js";
import { TARGET } from "../config/target.js";
import type { AvailabilityResult, ProviderAdapter } from "../types.js";
import { sessionManager, storageStatePath } from "../browser/sessionManager.js";
import {
  captureAvailabilityResponses,
  detectChallenge,
  loadSelectorConfig,
  pageFingerprint,
  saveDebugScreenshot,
} from "./common.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const selectors = loadSelectorConfig(path.join(__dirname, "selectors", "bls.selectors.json"), {
  verified: false,
  dashboardUrlContains: "app_india",
  loginUrlContains: "login",
  noSlotText: ["no appointment", "no slots available"],
});

/**
 * BLS Slovakia (India) provider.
 *
 * STATUS: infrastructure complete; live selectors NOT YET VERIFIED.
 * BLS requires an authenticated session (login + CAPTCHA/OTP), which this
 * bot deliberately does not automate — see requirement #3/#7. Run
 * `npm run auth:bls` once to create storage/bls-state.json, then
 * `npm run inspect:bls` to generate a selector report and fill in
 * src/providers/selectors/bls.selectors.json with real values from your
 * account's appointment page. Until that file has "verified": true, this
 * adapter will only ever return confidence UNKNOWN/LIKELY, never CONFIRMED,
 * so it can never produce a false-positive slot alert.
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

      // Prefer network/API observation (requirement #6). If the account's
      // real appointment flow issues an availability API call, it will be
      // captured here. We do not yet know BLS's real endpoint shape, so we
      // only use this if a captured payload also structurally matches our
      // exact target after inspection tooling confirms the field names.
      if (responses.length > 0 && env.debugMonitor) {
        // eslint-disable-next-line no-console
        console.log(`[bls] captured ${responses.length} availability-shaped JSON response(s) — inspect with npm run inspect:bls`);
      }

      if (!selectors.verified) {
        const html = await page.content();
        await saveDebugScreenshot(page, "bls");
        return this.result(base, startedAt, {
          state: "UNKNOWN",
          confidence: "UNKNOWN",
          rawStatus:
            "BLS selectors are not yet verified against the live site. Run `npm run inspect:bls` and update src/providers/selectors/bls.selectors.json before this adapter can classify availability.",
          errorType: "SELECTORS_UNVERIFIED",
          pageFingerprint: pageFingerprint(html),
        });
      }

      // --- DOM fallback detector (only reachable once selectors.verified === true) ---
      const bodyText = (await page.locator("body").innerText().catch(() => "")).toLowerCase();
      const noSlot = (selectors.noSlotText as string[]).some((t) => bodyText.includes(t.toLowerCase()));

      if (noSlot) {
        return this.result(base, startedAt, {
          region: TARGET.region,
          category: TARGET.category,
          visaType: TARGET.visaType,
          purpose: TARGET.purpose,
          state: "NO_SLOT",
          confidence: "CONFIRMED",
          rawStatus: "No-slot text matched on BLS appointment page",
          matchingCriteria: false,
        });
      }

      // A verified DOM implementation would read selected filter values and
      // the calendar's available-date cells here. Without a confirmed
      // selector map this branch is intentionally left as LIKELY/UNKNOWN
      // rather than guessing CONFIRMED — see requirement #45.
      return this.result(base, startedAt, {
        state: "POSSIBLE_SLOT",
        confidence: "LIKELY",
        rawStatus: "Page did not match known 'no slot' text — verify manually before booking",
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
