import type { SlotAlertPayload, SystemAlertPayload } from "../types.js";

export function confirmedSlotMessage(p: SlotAlertPayload): string {
  return [
    "🚨🚨🚨 SLOVAKIA STUDY VISA SLOT OPEN 🚨🚨🚨",
    "",
    "🇸🇰 Slovakia National Visa",
    "",
    `📍 Region: ${p.region.toUpperCase()}`,
    `🛂 Category: ${p.category}`,
    `📚 Purpose: ${p.purpose.toUpperCase()}`,
    `⏳ Type: ${p.visaType.toUpperCase()}`,
    "",
    "✅ APPOINTMENT AVAILABLE",
    "",
    `Provider: ${p.provider}`,
    `📅 Available date: ${p.date}`,
    p.time ? `⏰ Time: ${p.time}` : undefined,
    `🕐 Detected: ${p.detectedAt}`,
    "",
    "BOOK IMMEDIATELY:",
    p.bookingUrl,
    "",
    "⚠️ Availability can disappear quickly.",
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");
}

export function possibleSlotMessage(p: SlotAlertPayload): string {
  return [
    "⚠️ POSSIBLE SLOVAKIA STUDY VISA SLOT",
    "",
    p.region,
    `${p.category} Category`,
    p.visaType,
    p.purpose,
    "",
    "The monitor detected possible availability but could not fully verify it.",
    "",
    "CHECK NOW:",
    p.bookingUrl,
  ].join("\n");
}

export function slotClosedMessage(p: SlotAlertPayload): string {
  return [
    "🔴 SLOT CLOSED",
    "",
    `Provider: ${p.provider}`,
    `${p.region} / ${p.category} / ${p.visaType} / ${p.purpose}`,
    `Date: ${p.date}${p.time ? ` ${p.time}` : ""}`,
    "",
    "This slot is no longer showing as available. Monitoring continues.",
  ].join("\n");
}

export function systemAlertMessage(p: SystemAlertPayload): string {
  const icon = p.severity === "critical" ? "🛠" : p.severity === "warning" ? "⚠️" : "ℹ️";
  return `${icon} ${p.title}\n\n${p.message}`;
}

export function confirmedSlotEmailHtml(p: SlotAlertPayload): string {
  return `<!doctype html>
<html><body style="font-family:sans-serif;background:#111;color:#eee;padding:24px;">
  <h1 style="color:#ff4757;">🚨 Slovakia D Study Visa Slot Open — Delhi</h1>
  <table cellpadding="6" style="border-collapse:collapse;">
    <tr><td><b>Provider</b></td><td>${p.provider}</td></tr>
    <tr><td><b>Region</b></td><td>${p.region}</td></tr>
    <tr><td><b>Category</b></td><td>${p.category}</td></tr>
    <tr><td><b>Visa Type</b></td><td>${p.visaType}</td></tr>
    <tr><td><b>Purpose</b></td><td>${p.purpose}</td></tr>
    <tr><td><b>Available Date</b></td><td>${p.date}</td></tr>
    <tr><td><b>Time</b></td><td>${p.time ?? "N/A"}</td></tr>
    <tr><td><b>Detected At</b></td><td>${p.detectedAt}</td></tr>
  </table>
  <p style="margin-top:24px;">
    <a href="${p.bookingUrl}" style="background:#2ed573;color:#000;padding:12px 24px;text-decoration:none;font-weight:bold;border-radius:6px;">
      BOOK NOW
    </a>
  </p>
  <p style="color:#999;font-size:12px;">Availability can disappear quickly. This is an automated notification — no booking has been made on your behalf.</p>
</body></html>`;
}
