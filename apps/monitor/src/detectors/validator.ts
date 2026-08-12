import { TARGET } from "../config/target.js";
import type { AvailabilityResult, Confidence } from "../types.js";

/**
 * Normalizes a free-text field for comparison: lowercases, strips diacritics,
 * collapses whitespace/punctuation. Deliberately conservative — we'd rather
 * fail to match (and stay silent) than fuzzy-match the wrong region/category.
 */
export function normalize(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const REGION_OK = new Set([normalize("Delhi"), normalize("New Delhi")]);

// Sites commonly render the D-category as "D", "National D", "D (National)",
// "Type D", "D - National Visa". Accept known equivalents only — do not
// substring-match against arbitrary text.
const CATEGORY_OK = new Set([
  normalize("D"),
  normalize("National D"),
  normalize("D National"),
  normalize("Type D"),
  normalize("D National Visa"),
  normalize("National Visa D"),
]);

const VISA_TYPE_OK = new Set([normalize("Long Term"), normalize("Long-Term"), normalize("National Long Term")]);

const PURPOSE_OK = new Set([normalize("Study"), normalize("Studies"), normalize("Student")]);

export interface MatchResult {
  isTargetRegion: boolean;
  isTargetCategory: boolean;
  isTargetVisaType: boolean;
  isTargetPurpose: boolean;
  isAvailable: boolean;
  matchesAll: boolean;
}

/**
 * The single gate every provider must pass before an alert can be sent.
 * Requirement #51/#5: ALL fields must match AND availability must be true.
 * Any missing/ambiguous field means "no", never a hopeful guess.
 */
export function matchesTarget(result: AvailabilityResult): MatchResult {
  const isTargetRegion = REGION_OK.has(normalize(result.region));
  const isTargetCategory = CATEGORY_OK.has(normalize(result.category));
  const isTargetVisaType = VISA_TYPE_OK.has(normalize(result.visaType));
  const isTargetPurpose = PURPOSE_OK.has(normalize(result.purpose));
  const isAvailable = result.available === true;

  return {
    isTargetRegion,
    isTargetCategory,
    isTargetVisaType,
    isTargetPurpose,
    isAvailable,
    matchesAll:
      isTargetRegion && isTargetCategory && isTargetVisaType && isTargetPurpose && isAvailable,
  };
}

/**
 * Derives the final confidence level for a check result. CONFIRMED is only
 * ever returned when every criterion was positively identified (not merely
 * "not contradicted"). See requirement #5.
 */
export function deriveConfidence(result: AvailabilityResult): Confidence {
  const match = matchesTarget(result);

  if (match.matchesAll && result.confidence !== "UNKNOWN") {
    // The provider itself must also claim it verified this with a strong
    // signal (API response / confirmed selected filters), not just guessed.
    return result.confidence === "CONFIRMED" ? "CONFIRMED" : "LIKELY";
  }

  if (result.available && (match.isTargetRegion || match.isTargetCategory)) {
    // Partial signal only — never enough for CONFIRMED.
    return "LIKELY";
  }

  return "UNKNOWN";
}

export function describeTarget(): string {
  return `${TARGET.region} / ${TARGET.category} / ${TARGET.visaType} / ${TARGET.purpose}`;
}
