import { describe, it, expect } from "vitest";
import { confirmedSlotMessage, possibleSlotMessage, slotClosedMessage } from "../src/notifications/templates.js";
import type { SlotAlertPayload } from "../src/types.js";

const payload: SlotAlertPayload = {
  provider: "BLS",
  region: "Delhi",
  category: "D",
  visaType: "Long Term",
  purpose: "Study",
  date: "2026-09-17",
  time: "10:30 AM",
  detectedAt: "2026-08-12T10:15:10.400Z",
  bookingUrl: "https://appointment.blsslovakiavisa.com/app_india/login",
  confidence: "CONFIRMED",
};

describe("notification formatting (requirement #10)", () => {
  it("confirmed slot message includes all required fields and the booking URL", () => {
    const msg = confirmedSlotMessage(payload);
    expect(msg).toContain("SLOVAKIA STUDY VISA SLOT OPEN");
    expect(msg).toContain("DELHI");
    expect(msg).toContain("D");
    expect(msg).toContain("STUDY");
    expect(msg).toContain("LONG TERM");
    expect(msg).toContain("2026-09-17");
    expect(msg).toContain("10:30 AM");
    expect(msg).toContain(payload.bookingUrl);
    expect(msg).toContain("BOOK IMMEDIATELY");
  });

  it("never includes credentials or secrets", () => {
    const msg = confirmedSlotMessage(payload);
    expect(msg.toLowerCase()).not.toContain("password");
    expect(msg.toLowerCase()).not.toContain("token");
  });

  it("possible slot message is visually distinct and says verify", () => {
    const msg = possibleSlotMessage(payload);
    expect(msg).toContain("POSSIBLE");
    expect(msg).toContain("CHECK NOW");
    expect(msg).not.toContain("BOOK IMMEDIATELY");
  });

  it("slot closed message identifies the specific slot", () => {
    const msg = slotClosedMessage(payload);
    expect(msg).toContain("SLOT CLOSED");
    expect(msg).toContain("2026-09-17");
  });
});
