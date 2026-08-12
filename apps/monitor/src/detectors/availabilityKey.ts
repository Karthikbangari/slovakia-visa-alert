import type { AvailabilityResult, SlotDateTime } from "../types.js";
import { TARGET } from "../config/target.js";

/**
 * Unique key identifying "this exact slot" so we can deduplicate alerts.
 * Requirement #9: provider + region + category + purpose + date + time.
 */
export function availabilityKey(provider: string, dt: SlotDateTime): string {
  return [provider, TARGET.region, TARGET.category, TARGET.purpose, dt.date, dt.time ?? ""]
    .map((v) => v.toLowerCase())
    .join("|");
}

export function keysForResult(result: AvailabilityResult): string[] {
  if (!result.available || result.dates.length === 0) return [];
  return result.dates.map((dt) => availabilityKey(result.provider, dt));
}
