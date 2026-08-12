import fs from "node:fs";
import path from "node:path";
import { env } from "../src/config/env.js";
import { storageStatePath } from "../src/browser/sessionManager.js";
import { EmailNotifier } from "../src/notifications/email.js";
import { VisaAlertDatabase } from "../src/database/db.js";

/**
 * One-shot environment sanity check: config, auth state, notification
 * channels, and database connectivity. Useful before deploying or when
 * something seems wrong.
 */
async function main() {
  console.log("=== Slovakia Visa Alert — Diagnostics ===\n");

  console.log(`Check interval: ${env.checkIntervalSeconds}s (+/- ${env.checkJitterPercent}%)`);
  console.log(`Alert cooldown: ${env.alertCooldownMinutes} minutes`);
  console.log(`Mock mode: ${env.mockProvider}`);
  console.log(`Headless browser: ${env.headless}\n`);

  console.log("Provider sessions:");
  for (const provider of ["bls", "vfs"] as const) {
    const statePath = storageStatePath(provider);
    console.log(`  ${provider.toUpperCase()}: ${fs.existsSync(statePath) ? `✅ session file present (${statePath})` : "❌ no session file"}`);
  }

  console.log("\nProvider selector verification:");
  for (const provider of ["bls", "vfs"] as const) {
    const selectorPath = path.resolve(process.cwd(), `src/providers/selectors/${provider}.selectors.json`);
    try {
      const parsed = JSON.parse(fs.readFileSync(selectorPath, "utf-8"));
      console.log(`  ${provider.toUpperCase()}: ${parsed.verified ? "✅ verified" : "⚠️ NOT verified — run npm run inspect:" + provider}`);
    } catch {
      console.log(`  ${provider.toUpperCase()}: ❌ selector file missing/unreadable`);
    }
  }

  console.log("\nNotification channel:");
  const email = new EmailNotifier();
  console.log(`  Email: ${email.configured ? `configured -> ${env.alertEmail}` : "⚠️ not configured (set SMTP_* or RESEND_API_KEY)"}`);

  console.log("\nDatabase:");
  try {
    const db = new VisaAlertDatabase();
    db.heartbeat();
    console.log(`  ✅ SQLite OK at ${env.databaseUrl}`);
    db.close();
  } catch (err) {
    console.log(`  ❌ Database error: ${err instanceof Error ? err.message : err}`);
  }

  console.log("\nDone.");
}

main();
