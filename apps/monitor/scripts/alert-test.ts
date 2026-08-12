import { EmailNotifier } from "../src/notifications/email.js";
import { TARGET } from "../src/config/target.js";

async function main() {
  const email = new EmailNotifier();

  const message = [
    "🧪 TEST ALERT",
    "",
    "Slovakia Visa Slot Alert is working.",
    "",
    "Target:",
    TARGET.region,
    `${TARGET.category} Category`,
    TARGET.visaType,
    TARGET.purpose,
  ].join("\n");

  const emailConfigured = email.configured;
  const emailOk = emailConfigured
    ? await email.sendSystemAlert({ severity: "info", title: "🧪 TEST ALERT", message })
    : false;

  console.log(`\nEmail:\n${emailConfigured ? (emailOk ? "✅" : "❌ send failed") : "⚠️ configuration missing (set SMTP_* or RESEND_API_KEY in .env)"}`);
}

main();
