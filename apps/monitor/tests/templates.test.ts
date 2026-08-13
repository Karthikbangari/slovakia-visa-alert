import { describe, it, expect } from "vitest";
import { confirmedSlotMessage, dailyDigestMessage, possibleSlotMessage, slotClosedMessage } from "../src/notifications/templates.js";
import type { DigestProviderInfo, SlotAlertPayload } from "../src/types.js";

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

const target = { region: "Delhi", category: "D", visaType: "Long Term", purpose: "Study" };

describe("dailyDigestMessage — per-provider breakdown", () => {
  it("only mentions providers that actually have open slots, omitting zero-count ones", () => {
    const providers: DigestProviderInfo[] = [
      { provider: "BLS", enabled: true, activeSlotCount: 0, lastStatus: "MANUAL_PROCESS_ONLY", lastCheckedAt: null },
      { provider: "VFS", enabled: true, activeSlotCount: 3, lastStatus: "SLOT_AVAILABLE", lastCheckedAt: null },
    ];
    const msg = dailyDigestMessage(providers, target);
    expect(msg).toContain("VFS: 3 slot(s)");
    expect(msg).not.toContain("BLS: 0 slot(s)");
  });

  it("shows a single summary line when no provider has any open slots", () => {
    const providers: DigestProviderInfo[] = [
      { provider: "BLS", enabled: true, activeSlotCount: 0, lastStatus: "MANUAL_PROCESS_ONLY", lastCheckedAt: null },
      { provider: "VFS", enabled: true, activeSlotCount: 0, lastStatus: "MANUAL_PROCESS_ONLY", lastCheckedAt: null },
    ];
    const msg = dailyDigestMessage(providers, target);
    expect(msg).toContain("No open slots");
    expect(msg).not.toContain("slot(s)");
  });

  it("omits disabled providers from the status section", () => {
    const providers: DigestProviderInfo[] = [
      { provider: "BLS", enabled: false, activeSlotCount: 0, lastStatus: null, lastCheckedAt: null },
      { provider: "VFS", enabled: true, activeSlotCount: 0, lastStatus: "MANUAL_PROCESS_ONLY", lastCheckedAt: null },
    ];
    const msg = dailyDigestMessage(providers, target);
    expect(msg).not.toContain("BLS:");
    expect(msg).toContain("VFS:");
  });

  it("still includes the target criteria for clarity", () => {
    const providers: DigestProviderInfo[] = [{ provider: "VFS", enabled: true, activeSlotCount: 0, lastStatus: null, lastCheckedAt: null }];
    const msg = dailyDigestMessage(providers, target);
    expect(msg).toContain("Delhi");
    expect(msg).toContain("D");
    expect(msg).toContain("Long Term");
    expect(msg).toContain("Study");
  });
});
