/**
 * The single source of truth for what counts as "the appointment we want".
 * Every provider, detector, and test imports this instead of hardcoding
 * strings — see requirement #52.
 */
export const TARGET = {
  destinationCountry: "Slovakia",
  applicationCountry: "India",
  region: "Delhi",
  category: "D",
  visaType: "Long Term",
  purpose: "Study",
} as const;

export type Target = typeof TARGET;

/** Regions we explicitly never alert for, kept for diagnostics/logging only. */
export const IGNORED_REGIONS = [
  "Mumbai",
  "Bangalore",
  "Bengaluru",
  "Chennai",
  "Hyderabad",
  "Kolkata",
  "Pune",
  "Ahmedabad",
];
