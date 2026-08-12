import { describe, it, expect } from "vitest";
import { matchesTarget, deriveConfidence, normalize } from "../src/detectors/validator.js";
import { fixtures } from "./fixtures.js";

describe("matchesTarget — critical filter guarantee (requirement #29/#51)", () => {
  it("Mumbai + Study available => NO ALERT (wrong region)", () => {
    const match = matchesTarget(fixtures.mumbaiStudyAvailable);
    expect(match.matchesAll).toBe(false);
    expect(match.isTargetRegion).toBe(false);
  });

  it("Delhi + Tourist available => NO ALERT (wrong category/purpose)", () => {
    const match = matchesTarget(fixtures.delhiTouristAvailable);
    expect(match.matchesAll).toBe(false);
    expect(match.isTargetPurpose).toBe(false);
  });

  it("Delhi + D + Employment available => NO ALERT (wrong purpose)", () => {
    const match = matchesTarget(fixtures.delhiDEmploymentAvailable);
    expect(match.matchesAll).toBe(false);
    expect(match.isTargetPurpose).toBe(false);
    expect(match.isTargetRegion).toBe(true);
    expect(match.isTargetCategory).toBe(true);
  });

  it("Delhi + D + Long Term + Study + Available => ALERT", () => {
    const match = matchesTarget(fixtures.delhiDLongTermStudyAvailable);
    expect(match.matchesAll).toBe(true);
  });

  it("No-slot Delhi/Study result never matches (available=false)", () => {
    const match = matchesTarget(fixtures.noSlotDelhiStudy);
    expect(match.matchesAll).toBe(false);
    expect(match.isAvailable).toBe(false);
  });

  it("normalize() is diacritic/case/punctuation insensitive", () => {
    expect(normalize("  Long-Term ")).toBe(normalize("Long Term"));
    expect(normalize("DELHI")).toBe(normalize("delhi"));
  });
});

describe("deriveConfidence", () => {
  it("returns CONFIRMED only when all fields match and provider claims CONFIRMED", () => {
    expect(deriveConfidence(fixtures.delhiDLongTermStudyAvailable)).toBe("CONFIRMED");
  });

  it("never returns CONFIRMED for a partial/possible match", () => {
    expect(deriveConfidence(fixtures.possibleSlotMissingVisaType)).not.toBe("CONFIRMED");
  });

  it("never returns CONFIRMED for the wrong region even if provider claims CONFIRMED", () => {
    expect(deriveConfidence(fixtures.mumbaiStudyAvailable)).not.toBe("CONFIRMED");
  });

  it("returns UNKNOWN for unverified-selector results (never guesses)", () => {
    expect(deriveConfidence(fixtures.unverifiedSelectors)).toBe("UNKNOWN");
  });

  it("never returns CONFIRMED for MANUAL_PROCESS_ONLY (VFS Long Stay has no self-service calendar)", () => {
    expect(deriveConfidence(fixtures.manualProcessOnly)).not.toBe("CONFIRMED");
    expect(matchesTarget(fixtures.manualProcessOnly).matchesAll).toBe(false);
  });
});
