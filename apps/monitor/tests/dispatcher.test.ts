import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function tmpDbPath(): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "visa-alert-test-")), "test.db");
}

const slotPayload = {
  provider: "BLS" as const,
  region: "Delhi",
  category: "D",
  visaType: "Long Term",
  purpose: "Study",
  date: "2026-09-17",
  time: "10:30 AM",
  detectedAt: "2026-08-14T10:00:00.000Z",
  bookingUrl: "https://appointment.blsslovakiavisa.com/app_india/login",
  confidence: "CONFIRMED" as const,
};

describe("NotificationDispatcher — system-alert gating (SYSTEM_ALERTS_ENABLED)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("defaults to NOT emailing system/possible-slot alerts, but always records system events", async () => {
    delete process.env.SYSTEM_ALERTS_ENABLED;
    const { NotificationDispatcher } = await import("../src/notifications/dispatcher.js");
    const { VisaAlertDatabase } = await import("../src/database/db.js");

    const db = new VisaAlertDatabase(tmpDbPath());
    const dispatcher = new NotificationDispatcher(db);
    const sendSystemAlert = vi.spyOn(dispatcher.email, "sendSystemAlert").mockResolvedValue(true);
    const sendPossibleSlotAlert = vi.spyOn(dispatcher.email, "sendPossibleSlotAlert").mockResolvedValue(true);

    await dispatcher.dispatchSystemAlert({ severity: "info", title: "test", message: "test" });
    await dispatcher.dispatchPossibleSlot(slotPayload);

    expect(sendSystemAlert).not.toHaveBeenCalled();
    expect(sendPossibleSlotAlert).not.toHaveBeenCalled();

    const events = db.db.prepare("SELECT COUNT(*) as c FROM system_events").get() as { c: number };
    expect(events.c).toBe(1); // still recorded even though not emailed

    db.close();
  });

  it("emails system/possible-slot alerts when SYSTEM_ALERTS_ENABLED=true", async () => {
    process.env.SYSTEM_ALERTS_ENABLED = "true";
    const { NotificationDispatcher } = await import("../src/notifications/dispatcher.js");
    const { VisaAlertDatabase } = await import("../src/database/db.js");

    const db = new VisaAlertDatabase(tmpDbPath());
    const dispatcher = new NotificationDispatcher(db);
    const sendSystemAlert = vi.spyOn(dispatcher.email, "sendSystemAlert").mockResolvedValue(true);
    const sendPossibleSlotAlert = vi.spyOn(dispatcher.email, "sendPossibleSlotAlert").mockResolvedValue(true);

    await dispatcher.dispatchSystemAlert({ severity: "info", title: "test", message: "test" });
    await dispatcher.dispatchPossibleSlot(slotPayload);

    expect(sendSystemAlert).toHaveBeenCalledTimes(1);
    expect(sendPossibleSlotAlert).toHaveBeenCalledTimes(1);

    db.close();
    delete process.env.SYSTEM_ALERTS_ENABLED;
  });

  it("never gates a confirmed slot alert, regardless of SYSTEM_ALERTS_ENABLED", async () => {
    delete process.env.SYSTEM_ALERTS_ENABLED;
    const { NotificationDispatcher } = await import("../src/notifications/dispatcher.js");
    const { VisaAlertDatabase } = await import("../src/database/db.js");

    const db = new VisaAlertDatabase(tmpDbPath());
    const dispatcher = new NotificationDispatcher(db);
    const sendSlotAlert = vi.spyOn(dispatcher.email, "sendSlotAlert").mockResolvedValue(true);

    const { id } = db.upsertSlot("BLS", slotPayload.date, slotPayload.time, slotPayload.detectedAt);
    await dispatcher.dispatchConfirmedSlot(slotPayload, id);

    expect(sendSlotAlert).toHaveBeenCalledTimes(1);

    db.close();
  });
});
