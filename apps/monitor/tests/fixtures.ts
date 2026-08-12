import type { AvailabilityResult } from "../src/types.js";

function base(overrides: Partial<AvailabilityResult>): AvailabilityResult {
  return {
    provider: "BLS",
    country: "Slovakia",
    applicationCountry: "India",
    region: null,
    category: null,
    visaType: null,
    purpose: null,
    available: false,
    dates: [],
    state: "NO_SLOT",
    confidence: "UNKNOWN",
    checkedAt: new Date().toISOString(),
    responseTimeMs: 100,
    bookingUrl: "https://appointment.blsslovakiavisa.com/app_india/login",
    rawStatus: "fixture",
    matchingCriteria: false,
    ...overrides,
  };
}

export const fixtures = {
  noSlotDelhiStudy: base({
    region: "Delhi",
    category: "D",
    visaType: "Long Term",
    purpose: "Study",
    available: false,
    state: "NO_SLOT",
    confidence: "CONFIRMED",
  }),

  mumbaiStudyAvailable: base({
    region: "Mumbai",
    category: "D",
    visaType: "Long Term",
    purpose: "Study",
    available: true,
    dates: [{ date: "2026-09-01" }],
    state: "SLOT_AVAILABLE",
    confidence: "CONFIRMED",
  }),

  delhiTouristAvailable: base({
    region: "Delhi",
    category: "C",
    visaType: "Short Term",
    purpose: "Tourism",
    available: true,
    dates: [{ date: "2026-09-01" }],
    state: "SLOT_AVAILABLE",
    confidence: "CONFIRMED",
  }),

  delhiDEmploymentAvailable: base({
    region: "Delhi",
    category: "D",
    visaType: "Long Term",
    purpose: "Employment",
    available: true,
    dates: [{ date: "2026-09-01" }],
    state: "SLOT_AVAILABLE",
    confidence: "CONFIRMED",
  }),

  delhiDLongTermStudyAvailable: base({
    provider: "BLS",
    region: "Delhi",
    category: "D",
    visaType: "Long Term",
    purpose: "Study",
    available: true,
    dates: [{ date: "2026-09-17", time: "10:30 AM" }],
    state: "SLOT_AVAILABLE",
    confidence: "CONFIRMED",
  }),

  possibleSlotMissingVisaType: base({
    region: "Delhi",
    category: "D",
    visaType: null,
    purpose: "Study",
    available: true,
    dates: [{ date: "2026-09-20" }],
    state: "POSSIBLE_SLOT",
    confidence: "LIKELY",
  }),

  unverifiedSelectors: base({
    state: "UNKNOWN",
    confidence: "UNKNOWN",
    errorType: "SELECTORS_UNVERIFIED",
  }),

  captcha: base({
    state: "HUMAN_ACTION_REQUIRED",
    confidence: "UNKNOWN",
  }),

  sessionExpired: base({
    state: "SESSION_EXPIRED",
    confidence: "UNKNOWN",
  }),

  manualProcessOnly: base({
    provider: "VFS",
    region: "Delhi",
    category: "D",
    visaType: "Long Term",
    purpose: "Study",
    available: false,
    state: "MANUAL_PROCESS_ONLY",
    confidence: "UNKNOWN",
  }),
};
