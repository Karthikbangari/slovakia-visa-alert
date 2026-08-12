import { describe, it, expect, beforeEach } from "vitest";
import { ProviderRuntimeState } from "../src/services/providerRuntimeState.js";

describe("ProviderRuntimeState — state transitions (requirement #8/#37)", () => {
  let runtime: ProviderRuntimeState;

  beforeEach(() => {
    runtime = new ProviderRuntimeState();
  });

  it("pauses on HUMAN_ACTION_REQUIRED and alerts once", () => {
    const first = runtime.applyState("BLS", "HUMAN_ACTION_REQUIRED");
    expect(first.shouldAlertPause).toBe(true);
    expect(runtime.isPaused("BLS")).toBe(true);

    const second = runtime.applyState("BLS", "HUMAN_ACTION_REQUIRED");
    expect(second.shouldAlertPause).toBe(false); // no repeat spam
  });

  it("pauses on SESSION_EXPIRED", () => {
    const result = runtime.applyState("BLS", "SESSION_EXPIRED");
    expect(result.shouldAlertPause).toBe(true);
    expect(runtime.pauseReason("BLS")).toBe("SESSION_EXPIRED");
  });

  it("only alerts ERROR after 3 consecutive failures, not every time", () => {
    expect(runtime.applyState("VFS", "ERROR").shouldAlertError).toBe(false);
    expect(runtime.applyState("VFS", "ERROR").shouldAlertError).toBe(false);
    expect(runtime.applyState("VFS", "ERROR").shouldAlertError).toBe(true);
    expect(runtime.applyState("VFS", "ERROR").shouldAlertError).toBe(false); // no repeat spam
  });

  it("sends a recovery alert after being paused, then resolves to a healthy state", () => {
    runtime.applyState("BLS", "HUMAN_ACTION_REQUIRED");
    const recovery = runtime.applyState("BLS", "NO_SLOT");
    expect(recovery.shouldAlertRecovery).toBe(true);
    expect(runtime.isPaused("BLS")).toBe(false);
  });

  it("does not send a recovery alert if it was never down", () => {
    const result = runtime.applyState("BLS", "NO_SLOT");
    expect(result.shouldAlertRecovery).toBe(false);
  });

  it("manual resume clears pause state", () => {
    runtime.applyState("BLS", "SESSION_EXPIRED");
    expect(runtime.isPaused("BLS")).toBe(true);
    runtime.resume("BLS");
    expect(runtime.isPaused("BLS")).toBe(false);
  });

  it("tracks BLS and VFS independently", () => {
    runtime.applyState("BLS", "HUMAN_ACTION_REQUIRED");
    expect(runtime.isPaused("BLS")).toBe(true);
    expect(runtime.isPaused("VFS")).toBe(false);
  });
});
