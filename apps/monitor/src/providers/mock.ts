import type { AvailabilityResult, ProviderAdapter, ProviderName } from "../types.js";
import { TARGET } from "../config/target.js";

export type MockScenario = "no-slot" | "slot" | "possible" | "error" | "captcha" | "session-expired" | "rate-limited";

/**
 * Simulates a provider without touching BLS/VFS at all — requirement #30.
 * Used by `npm run mock:no-slot` / `npm run mock:slot` and by tests.
 */
export class MockProvider implements ProviderAdapter {
  enabled = true;

  constructor(
    public name: ProviderName,
    private scenario: MockScenario = "no-slot",
  ) {}

  setScenario(scenario: MockScenario): void {
    this.scenario = scenario;
  }

  async checkAvailability(): Promise<AvailabilityResult> {
    const checkedAt = new Date().toISOString();
    const base = {
      provider: this.name,
      country: "Slovakia" as const,
      applicationCountry: "India" as const,
      checkedAt,
      responseTimeMs: 50 + Math.round(Math.random() * 150),
      bookingUrl: this.name === "BLS" ? "https://appointment.blsslovakiavisa.com/app_india/login" : "https://visa.vfsglobal.com/ind/en/svk/application-detail",
    };

    switch (this.scenario) {
      case "slot":
        return {
          ...base,
          region: TARGET.region,
          category: TARGET.category,
          visaType: TARGET.visaType,
          purpose: TARGET.purpose,
          available: true,
          dates: [{ date: "2026-09-17", time: "10:30 AM" }],
          state: "SLOT_AVAILABLE",
          confidence: "CONFIRMED",
          rawStatus: "[MOCK] Calendar shows 17 September 2026 10:30 AM as bookable for Delhi/D/Long Term/Study",
          matchingCriteria: true,
        };

      case "possible":
        return {
          ...base,
          region: TARGET.region,
          category: TARGET.category,
          visaType: null,
          purpose: TARGET.purpose,
          available: true,
          dates: [{ date: "2026-09-20" }],
          state: "POSSIBLE_SLOT",
          confidence: "LIKELY",
          rawStatus: "[MOCK] Availability text found but visa type filter could not be confirmed",
          matchingCriteria: false,
        };

      case "error":
        return {
          ...base,
          region: null,
          category: null,
          visaType: null,
          purpose: null,
          available: false,
          dates: [],
          state: "ERROR",
          confidence: "UNKNOWN",
          rawStatus: "[MOCK] simulated network timeout",
          errorType: "TIMEOUT",
          matchingCriteria: false,
        };

      case "captcha":
        return {
          ...base,
          region: null,
          category: null,
          visaType: null,
          purpose: null,
          available: false,
          dates: [],
          state: "HUMAN_ACTION_REQUIRED",
          confidence: "UNKNOWN",
          rawStatus: "[MOCK] CAPTCHA challenge detected",
          matchingCriteria: false,
        };

      case "session-expired":
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
          rawStatus: "[MOCK] redirected to login page",
          matchingCriteria: false,
        };

      case "rate-limited":
        return {
          ...base,
          region: null,
          category: null,
          visaType: null,
          purpose: null,
          available: false,
          dates: [],
          state: "RATE_LIMITED",
          confidence: "UNKNOWN",
          rawStatus: "[MOCK] HTTP 429",
          httpStatus: 429,
          matchingCriteria: false,
        };

      case "no-slot":
      default:
        return {
          ...base,
          region: TARGET.region,
          category: TARGET.category,
          visaType: TARGET.visaType,
          purpose: TARGET.purpose,
          available: false,
          dates: [],
          state: "NO_SLOT",
          confidence: "CONFIRMED",
          rawStatus: "[MOCK] Calendar shows no bookable dates for Delhi/D/Long Term/Study",
          matchingCriteria: false,
        };
    }
  }
}
