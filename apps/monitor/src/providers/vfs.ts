import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../config/env.js";
import { TARGET } from "../config/target.js";
import type { AvailabilityResult, ProviderAdapter } from "../types.js";
import { sessionManager } from "../browser/sessionManager.js";
import {
  captureAvailabilityResponses,
  detectChallenge,
  loadSelectorConfig,
  pageFingerprint,
  saveDebugScreenshot,
} from "./common.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const selectors = loadSelectorConfig(path.join(__dirname, "selectors", "vfs.selectors.json"), {
  verified: false,
  loginUrlContains: "login",
  noSlotText: ["no appointment slots", "no slots available"],
});

// Confirmed live against VFS on 2026-08-12 (see debug/3-book-an-appointment
// screenshot captured during inspection): VFS's own "Book an appointment"
// page explicitly states Long Stay/National Visa appointments — i.e.
// exactly our D-category target — are arranged by contacting VFS directly,
// with only Short Stay/Schengen visas getting the self-service "Book now"
// online calendar. This checks for that specific combination of phrases
// rather than guessing from either alone.
function isManualProcessOnlyPage(bodyText: string): boolean {
  const haystack = bodyText.toLowerCase();
  return haystack.includes("long stay") && haystack.includes("national visa") && haystack.includes("contact us");
}

/**
 * VFS Global Slovakia (India) provider.
 *
 * STATUS: VFS_URL now points at the real, publicly-reachable
 * "book-an-appointment" page (confirmed via `npm run inspect:vfs` plus
 * manual navigation from vfs.global's homepage — the originally-guessed
 * "application-detail" deep link renders "Session Expired or Invalid"
 * without a session bootstrapped through VFS's normal site flow first).
 *
 * That page states Long Stay/National Visa (our D-category target)
 * appointments are arranged by contacting VFS directly — there is no
 * confirmed self-service online calendar for this category, only for
 * Short Stay/Schengen visas. This adapter detects and reports that state
 * (`MANUAL_PROCESS_ONLY`) honestly rather than guessing at slot data that
 * may not exist. If VFS ever adds a self-service Long Stay calendar, or if
 * you obtain a different URL (e.g. a private link from VFS after emailing
 * them) where one exists, update VFS_URL and re-run `npm run inspect:vfs`
 * to capture its real selectors, then set "verified": true below.
 */
export class VFSProvider implements ProviderAdapter {
  name = "VFS" as const;
  enabled = env.vfsEnabled;

  async checkAvailability(): Promise<AvailabilityResult> {
    const startedAt = Date.now();
    const checkedAt = new Date().toISOString();
    const base = {
      provider: this.name,
      country: "Slovakia" as const,
      applicationCountry: "India" as const,
      checkedAt,
      bookingUrl: env.vfsUrl,
    };

    const context = await sessionManager.getContext("vfs");
    const page = await context.newPage();
    const { responses, dispose } = captureAvailabilityResponses(page);

    try {
      // 45s rather than the usual 30s — observed live on Render's free
      // tier taking 25-27s some checks (slow egress from a resource-
      // constrained host), which left too little margin against 30s and
      // caused intermittent spurious ERROR/timeout results.
      const navResponse = await page.goto(env.vfsUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
      const httpStatus = navResponse?.status();

      // VFS's application-detail page is an Angular SPA — confirmed via
      // `npm run inspect:vfs`, which captured a loading-spinner screenshot
      // at domcontentloaded. Give the app a chance to bootstrap before
      // reading anything from the DOM. This is a bounded wait (never
      // indefinite) so a WAF holding the connection open can't hang checks.
      if (httpStatus && httpStatus < 400) {
        await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => undefined);
      }

      if (httpStatus === 429 || httpStatus === 403) {
        return this.result(base, startedAt, {
          state: "RATE_LIMITED",
          confidence: "UNKNOWN",
          rawStatus: `VFS returned HTTP ${httpStatus}`,
          httpStatus,
        });
      }
      if (httpStatus && httpStatus >= 500) {
        return this.result(base, startedAt, {
          state: "ERROR",
          confidence: "UNKNOWN",
          rawStatus: `VFS returned HTTP ${httpStatus}`,
          httpStatus,
          errorType: "SERVER_ERROR",
        });
      }

      const challenge = await detectChallenge(page, selectors.loginUrlContains);
      if (challenge.isCaptcha) {
        await saveDebugScreenshot(page, "vfs");
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
          rawStatus: "VFS requires login to view this page — authenticated VFS flow is not yet configured.",
        });
      }
      if (challenge.isSessionExpired) {
        // Confirmed live 2026-08-12: hitting VFS_URL directly (without
        // first going through VFS's homepage cookie-consent/country-select
        // flow) renders a client-side "Session Expired or Invalid" page.
        // This is not a text match to guess from — VFS is telling us
        // directly that this deep link has no valid session.
        return this.result(base, startedAt, {
          state: "SESSION_EXPIRED",
          confidence: "UNKNOWN",
          rawStatus:
            "VFS rendered 'Session Expired or Invalid' — this deep link needs a session bootstrapped via VFS's normal navigation flow (homepage -> cookie consent -> country/mission selection) before application-detail will load real content.",
        });
      }
      if (challenge.isMaintenance) {
        return this.result(base, startedAt, {
          state: "MAINTENANCE",
          confidence: "UNKNOWN",
          rawStatus: `VFS maintenance page detected: ${challenge.reason}`,
        });
      }

      if (responses.length > 0 && env.debugMonitor) {
        // eslint-disable-next-line no-console
        console.log(`[vfs] captured ${responses.length} availability-shaped JSON response(s) — inspect with npm run inspect:vfs`);
      }

      const bodyTextForManualCheck = await page.locator("body").innerText().catch(() => "");
      if (isManualProcessOnlyPage(bodyTextForManualCheck)) {
        return this.result(base, startedAt, {
          region: TARGET.region,
          category: TARGET.category,
          visaType: TARGET.visaType,
          purpose: TARGET.purpose,
          state: "MANUAL_PROCESS_ONLY",
          confidence: "UNKNOWN",
          available: false,
          rawStatus:
            "VFS states Long Stay/National Visa appointments (this includes our D-category target) are arranged by contacting VFS directly — no self-service online calendar was found for this category. Only Short Stay/Schengen visas have a 'Book now' self-service flow. This is not an error; it means VFS likely has nothing to poll for this visa type unless you obtain a different process/URL from them.",
        });
      }

      if (!selectors.verified) {
        const html = await page.content();
        await saveDebugScreenshot(page, "vfs");
        return this.result(base, startedAt, {
          state: "UNKNOWN",
          confidence: "UNKNOWN",
          rawStatus:
            "VFS selectors are not yet verified against the live site. Run `npm run inspect:vfs` and update src/providers/selectors/vfs.selectors.json before this adapter can classify availability.",
          errorType: "SELECTORS_UNVERIFIED",
          pageFingerprint: pageFingerprint(html),
        });
      }

      const bodyText = bodyTextForManualCheck.toLowerCase();
      const noSlot = (selectors.noSlotText as string[]).some((t) => bodyText.includes(t.toLowerCase()));

      if (noSlot) {
        return this.result(base, startedAt, {
          region: TARGET.region,
          category: TARGET.category,
          visaType: TARGET.visaType,
          purpose: TARGET.purpose,
          state: "NO_SLOT",
          confidence: "CONFIRMED",
          rawStatus: "No-slot text matched on VFS appointment page",
          matchingCriteria: false,
        });
      }

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
        rawStatus: `VFS check failed: ${message}`,
        errorType: "EXCEPTION",
      });
    } finally {
      dispose();
      await page.close().catch(() => undefined);
    }
  }

  private result(
    base: { provider: "VFS"; country: "Slovakia"; applicationCountry: "India"; checkedAt: string; bookingUrl: string },
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
    await sessionManager.closeContext("vfs");
  }
}
