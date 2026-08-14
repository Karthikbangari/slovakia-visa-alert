import { describe, it, expect, beforeEach, vi } from "vitest";

describe("AdaptivePoller — backoff (requirement #4)", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.CHECK_INTERVAL_SECONDS = "30";
    process.env.CHECK_JITTER_PERCENT = "0"; // deterministic for these assertions
  });

  it("uses the configured interval when healthy", async () => {
    const { AdaptivePoller } = await import("../src/services/polling.js");
    const poller = new AdaptivePoller();
    poller.recordResult("NO_SLOT");
    expect(poller.nextDelayMs()).toBe(30_000);
    expect(poller.isBackingOff).toBe(false);
  });

  it("backs off exponentially on repeated ERROR", async () => {
    const { AdaptivePoller } = await import("../src/services/polling.js");
    const poller = new AdaptivePoller();
    poller.recordResult("ERROR");
    const first = poller.nextDelayMs();
    poller.recordResult("ERROR");
    const second = poller.nextDelayMs();
    expect(second).toBeGreaterThan(first);
    expect(poller.isBackingOff).toBe(true);
  });

  it("backs off much more aggressively on RATE_LIMITED than on generic ERROR", async () => {
    const { AdaptivePoller } = await import("../src/services/polling.js");
    const rateLimited = new AdaptivePoller();
    rateLimited.recordResult("RATE_LIMITED");
    const rateLimitedDelay = rateLimited.nextDelayMs();

    const errored = new AdaptivePoller();
    errored.recordResult("ERROR");
    const erroredDelay = errored.nextDelayMs();

    expect(rateLimitedDelay).toBeGreaterThan(erroredDelay);
  });

  it("resets backoff after a healthy result", async () => {
    const { AdaptivePoller } = await import("../src/services/polling.js");
    const poller = new AdaptivePoller();
    poller.recordResult("ERROR");
    poller.recordResult("ERROR");
    expect(poller.isBackingOff).toBe(true);
    poller.recordResult("NO_SLOT");
    expect(poller.isBackingOff).toBe(false);
    expect(poller.nextDelayMs()).toBe(30_000);
  });

  it("caps rate-limit backoff at 30 minutes", async () => {
    const { AdaptivePoller } = await import("../src/services/polling.js");
    const poller = new AdaptivePoller();
    for (let i = 0; i < 20; i++) poller.recordResult("RATE_LIMITED");
    expect(poller.nextDelayMs()).toBeLessThanOrEqual(30 * 60 * 1000);
  });

  it("backs off on HUMAN_ACTION_REQUIRED like rate-limiting, not a full stop", async () => {
    const { AdaptivePoller } = await import("../src/services/polling.js");
    const poller = new AdaptivePoller();
    poller.recordResult("HUMAN_ACTION_REQUIRED");
    expect(poller.isBackingOff).toBe(true);
    expect(poller.nextDelayMs()).toBeGreaterThan(30_000);
    expect(poller.nextDelayMs()).toBeLessThanOrEqual(30 * 60 * 1000);
  });

  it("does NOT back off on SESSION_EXPIRED — it's a cheap local check that must keep retrying to self-recover", async () => {
    const { AdaptivePoller } = await import("../src/services/polling.js");
    const poller = new AdaptivePoller();
    poller.recordResult("SESSION_EXPIRED");
    poller.recordResult("SESSION_EXPIRED");
    poller.recordResult("SESSION_EXPIRED");
    expect(poller.isBackingOff).toBe(false);
    expect(poller.nextDelayMs()).toBe(30_000);
  });
});
