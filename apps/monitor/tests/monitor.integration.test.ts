import { describe, it, expect, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MonitorService } from "../src/services/monitor.js";
import { VisaAlertDatabase } from "../src/database/db.js";
import { MockProvider } from "../src/providers/mock.js";

// Email is unconfigured in the test environment, so by default every send
// attempt reports failure (and dedup correctly does NOT suppress retries of
// a failed send — only a successful send starts the cooldown). Tests that
// specifically verify cooldown behavior stub the channel to simulate a
// successful send instead of hitting the network.

function tmpDbPath(): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "visa-alert-test-")), "test.db");
}

describe("MonitorService integration — dedup + state persistence (requirement #9/#33)", () => {
  let db: VisaAlertDatabase | undefined;

  afterEach(() => {
    db?.close();
    db = undefined;
  });

  it("NO_SLOT never creates a slot row", async () => {
    db = new VisaAlertDatabase(tmpDbPath());
    const provider = new MockProvider("BLS", "no-slot");
    const monitor = new MonitorService([provider], db);

    // @ts-expect-error accessing private for a direct, timer-free check
    await monitor.handleResult("BLS", await provider.checkAvailability());

    expect(db.lastActiveSlot()).toBeUndefined();
  });

  it("SLOT_AVAILABLE creates exactly one active slot and one recorded check", async () => {
    db = new VisaAlertDatabase(tmpDbPath());
    const provider = new MockProvider("BLS", "slot");
    const monitor = new MonitorService([provider], db);

    // @ts-expect-error accessing private for a direct, timer-free check
    await monitor.handleResult("BLS", await provider.checkAvailability());

    const slot = db.lastActiveSlot();
    expect(slot).toBeDefined();
    expect(slot!.slotDate).toBe("2026-09-17");

    const checks = db.recentChecks(10);
    expect(checks).toHaveLength(1);
    expect(checks[0].status).toBe("SLOT_AVAILABLE");
  });

  it("repeated identical SLOT_AVAILABLE results do not create duplicate slot rows", async () => {
    db = new VisaAlertDatabase(tmpDbPath());
    const provider = new MockProvider("BLS", "slot");
    const monitor = new MonitorService([provider], db);

    for (let i = 0; i < 3; i++) {
      // @ts-expect-error accessing private for a direct, timer-free check
      await monitor.handleResult("BLS", await provider.checkAvailability());
    }

    const row = db.db.prepare("SELECT COUNT(*) as c FROM slots").get() as { c: number };
    expect(row.c).toBe(1);
  });

  it("cooldown suppresses repeat alerts only after a successful send (requirement #9)", async () => {
    db = new VisaAlertDatabase(tmpDbPath());
    const provider = new MockProvider("BLS", "slot");
    const monitor = new MonitorService([provider], db);

    // Simulate email being configured and succeeding, without hitting the
    // network.
    // @ts-expect-error accessing private dispatcher for test stubbing
    vi.spyOn(monitor.dispatcher.email, "sendSlotAlert").mockResolvedValue(true);

    for (let i = 0; i < 3; i++) {
      // @ts-expect-error accessing private for a direct, timer-free check
      await monitor.handleResult("BLS", await provider.checkAvailability());
    }

    const alertRow = db.db.prepare("SELECT COUNT(*) as c FROM alerts").get() as { c: number };
    // First check sends email successfully (1 row); the next two checks see
    // the same slot within the cooldown window and are skipped.
    expect(alertRow.c).toBe(1);

    const stats = db.notificationStats();
    expect(stats.totalSent).toBe(1);
    expect(stats.lastSentAt).not.toBeNull();
  });

  it("notificationStats never counts failed sends", async () => {
    db = new VisaAlertDatabase(tmpDbPath());
    const provider = new MockProvider("BLS", "slot");
    const monitor = new MonitorService([provider], db);

    // @ts-expect-error accessing private for a direct, timer-free check
    await monitor.handleResult("BLS", await provider.checkAvailability());

    // Email is unconfigured in tests, so the send fails — the count must
    // stay at zero rather than reporting a notification that never arrived.
    const stats = db.notificationStats();
    expect(stats.totalSent).toBe(0);
    expect(stats.lastSentAt).toBeNull();
  });

  it("without a configured channel, failed sends are retried on every check (no false cooldown)", async () => {
    db = new VisaAlertDatabase(tmpDbPath());
    const provider = new MockProvider("BLS", "slot");
    const monitor = new MonitorService([provider], db);

    for (let i = 0; i < 3; i++) {
      // @ts-expect-error accessing private for a direct, timer-free check
      await monitor.handleResult("BLS", await provider.checkAvailability());
    }

    const alertRow = db.db.prepare("SELECT COUNT(*) as c FROM alerts").get() as { c: number };
    const failedRow = db.db.prepare("SELECT COUNT(*) as c FROM alerts WHERE successful = 0").get() as { c: number };
    expect(alertRow.c).toBe(3); // 3 checks x email, all unconfigured/failed
    expect(failedRow.c).toBe(3);
  });

  it("a slot disappearing marks it inactive", async () => {
    db = new VisaAlertDatabase(tmpDbPath());
    const provider = new MockProvider("BLS", "slot");
    const monitor = new MonitorService([provider], db);

    // @ts-expect-error accessing private for a direct, timer-free check
    await monitor.handleResult("BLS", await provider.checkAvailability());
    expect(db.lastActiveSlot()).toBeDefined();

    provider.setScenario("no-slot");
    // @ts-expect-error accessing private for a direct, timer-free check
    await monitor.handleResult("BLS", await provider.checkAvailability());

    expect(db.lastActiveSlot()).toBeUndefined();
  });

  it("automatically recovers from SESSION_EXPIRED once a healthy result comes back (bug fix: paused providers must keep re-checking)", async () => {
    db = new VisaAlertDatabase(tmpDbPath());
    const provider = new MockProvider("BLS", "session-expired");
    const monitor = new MonitorService([provider], db);

    // @ts-expect-error accessing private for a direct, timer-free check
    await monitor.handleResult("BLS", await provider.checkAvailability());
    // @ts-expect-error accessing private runtime state
    expect(monitor.runtime.isPaused("BLS")).toBe(true);

    // Simulate the underlying issue being fixed (e.g. a fresh session
    // uploaded) and the provider itself succeeding on its next real check.
    provider.setScenario("no-slot");
    // @ts-expect-error accessing private for a direct, timer-free check
    await monitor.handleResult("BLS", await provider.checkAvailability());

    // @ts-expect-error accessing private runtime state
    expect(monitor.runtime.isPaused("BLS")).toBe(false);
    const snapshot = monitor.getSnapshot();
    expect(snapshot.BLS.status).toBe("NO_SLOT");
    expect(snapshot.BLS.paused).toBe(false);
  });
});
