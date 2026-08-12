import { describe, it, expect } from "vitest";
import { MockProvider } from "../src/providers/mock.js";
import { matchesTarget } from "../src/detectors/validator.js";

describe("MockProvider fixtures (requirement #29/#30)", () => {
  it("no-slot scenario never matches target (available=false)", async () => {
    const provider = new MockProvider("BLS", "no-slot");
    const result = await provider.checkAvailability();
    expect(result.state).toBe("NO_SLOT");
    expect(matchesTarget(result).matchesAll).toBe(false);
  });

  it("slot scenario matches target exactly: Delhi/D/Long Term/Study", async () => {
    const provider = new MockProvider("BLS", "slot");
    const result = await provider.checkAvailability();
    expect(result.state).toBe("SLOT_AVAILABLE");
    expect(result.confidence).toBe("CONFIRMED");
    const match = matchesTarget(result);
    expect(match.matchesAll).toBe(true);
    expect(result.dates[0].date).toBe("2026-09-17");
    expect(result.dates[0].time).toBe("10:30 AM");
  });

  it("captcha scenario returns HUMAN_ACTION_REQUIRED, never a false slot", async () => {
    const provider = new MockProvider("BLS", "captcha");
    const result = await provider.checkAvailability();
    expect(result.state).toBe("HUMAN_ACTION_REQUIRED");
    expect(result.available).toBe(false);
  });

  it("session-expired scenario returns SESSION_EXPIRED", async () => {
    const provider = new MockProvider("BLS", "session-expired");
    const result = await provider.checkAvailability();
    expect(result.state).toBe("SESSION_EXPIRED");
  });

  it("rate-limited scenario returns RATE_LIMITED with httpStatus 429", async () => {
    const provider = new MockProvider("VFS", "rate-limited");
    const result = await provider.checkAvailability();
    expect(result.state).toBe("RATE_LIMITED");
    expect(result.httpStatus).toBe(429);
  });

  it("possible scenario never reaches CONFIRMED-level match", async () => {
    const provider = new MockProvider("VFS", "possible");
    const result = await provider.checkAvailability();
    expect(matchesTarget(result).matchesAll).toBe(false);
  });
});
