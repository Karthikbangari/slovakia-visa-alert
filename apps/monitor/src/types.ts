export type ProviderName = "BLS" | "VFS";

/** Slot state machine — see requirement #8. */
export type SlotState =
  | "UNKNOWN"
  | "NO_SLOT"
  | "POSSIBLE_SLOT"
  | "SLOT_AVAILABLE"
  | "HUMAN_ACTION_REQUIRED"
  | "SESSION_EXPIRED"
  | "RATE_LIMITED"
  | "MAINTENANCE"
  | "ERROR"
  // Confirmed live against VFS on 2026-08-12: the provider's own site states
  // Long Stay/National Visa appointments are arranged by contacting VFS
  // directly, with no self-service online calendar for that category (only
  // Short Stay/Schengen visas get the "Book now" flow). This is a steady,
  // legitimate state — not an error — so it gets its own value instead of
  // being force-fit into NO_SLOT (implies a calendar exists and is empty)
  // or ERROR (implies something is broken). Never produces an alert.
  | "MANUAL_PROCESS_ONLY";

export type Confidence = "CONFIRMED" | "LIKELY" | "UNKNOWN";

export interface SlotDateTime {
  date: string; // ISO yyyy-mm-dd, Asia/Kolkata calendar date
  time?: string; // e.g. "10:30 AM"
}

/** Normalized result every provider adapter must return — requirement #2. */
export interface AvailabilityResult {
  provider: ProviderName;
  country: "Slovakia";
  applicationCountry: "India";
  region: string | null;
  category: string | null;
  visaType: string | null;
  purpose: string | null;
  available: boolean;
  dates: SlotDateTime[];
  state: SlotState;
  confidence: Confidence;
  checkedAt: string; // ISO timestamp, UTC
  responseTimeMs: number;
  bookingUrl: string;
  rawStatus: string;
  httpStatus?: number;
  errorType?: string;
  matchingCriteria: boolean;
  pageFingerprint?: string;
}

export interface ProviderAdapter {
  name: ProviderName;
  enabled: boolean;
  checkAvailability(): Promise<AvailabilityResult>;
  dispose?(): Promise<void>;
}

export interface SlotAlertPayload {
  provider: ProviderName;
  region: string;
  category: string;
  visaType: string;
  purpose: string;
  date: string;
  time?: string;
  detectedAt: string;
  bookingUrl: string;
  confidence: Confidence;
}

export interface SystemAlertPayload {
  title: string;
  message: string;
  severity: "info" | "warning" | "critical";
}

export interface DigestProviderInfo {
  provider: ProviderName;
  enabled: boolean;
  activeSlotCount: number;
  lastStatus: SlotState | null;
  lastCheckedAt: string | null;
}

export interface NotificationProvider {
  name: string;
  sendSlotAlert(payload: SlotAlertPayload): Promise<boolean>;
  sendSystemAlert(payload: SystemAlertPayload): Promise<boolean>;
}
