import { describe, it, expect } from "vitest";
import { availabilityKey, keysForResult } from "../src/detectors/availabilityKey.js";
import { fixtures } from "./fixtures.js";

describe("availabilityKey / dedup (requirement #9)", () => {
  it("is stable for the same provider+date+time", () => {
    const a = availabilityKey("BLS", { date: "2026-09-17", time: "10:30 AM" });
    const b = availabilityKey("BLS", { date: "2026-09-17", time: "10:30 AM" });
    expect(a).toBe(b);
  });

  it("differs when the date changes", () => {
    const a = availabilityKey("BLS", { date: "2026-09-17", time: "10:30 AM" });
    const b = availabilityKey("BLS", { date: "2026-09-18", time: "10:30 AM" });
    expect(a).not.toBe(b);
  });

  it("differs when the provider changes", () => {
    const a = availabilityKey("BLS", { date: "2026-09-17" });
    const b = availabilityKey("VFS", { date: "2026-09-17" });
    expect(a).not.toBe(b);
  });

  it("keysForResult returns empty for unavailable results", () => {
    expect(keysForResult(fixtures.noSlotDelhiStudy)).toEqual([]);
  });

  it("keysForResult returns one key per date for available results", () => {
    const keys = keysForResult(fixtures.delhiDLongTermStudyAvailable);
    expect(keys).toHaveLength(1);
    expect(keys[0]).toContain("2026-09-17");
  });
});
