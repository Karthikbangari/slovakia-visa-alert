import { EmailNotifier } from "../src/notifications/email.js";
import { VisaAlertDatabase } from "../src/database/db.js";
import { TARGET } from "../src/config/target.js";
import { env } from "../src/config/env.js";
import type { DigestProviderInfo } from "../src/types.js";

/**
 * Sends a real digest email right now, using whatever is actually in the
 * database. Manual/on-demand only — the monitor does NOT send this
 * automatically (per the user's request, the only automatic email is a
 * confirmed slot alert). Run this yourself whenever you want a status
 * snapshot in your inbox.
 */
async function main() {
  const db = new VisaAlertDatabase();
  const email = new EmailNotifier();

  const providerNames = ["BLS", "VFS"] as const;
  const providers: DigestProviderInfo[] = providerNames.map((name) => {
    const snap = db.digestSnapshot(name);
    return {
      provider: name,
      enabled: name === "BLS" ? env.blsEnabled : env.vfsEnabled,
      activeSlotCount: snap.activeSlotCount,
      lastStatus: (snap.lastStatus as DigestProviderInfo["lastStatus"]) ?? null,
      lastCheckedAt: snap.lastCheckedAt,
    };
  });

  const ok = await email.sendDailyDigest(providers, {
    region: TARGET.region,
    category: TARGET.category,
    visaType: TARGET.visaType,
    purpose: TARGET.purpose,
  });

  console.log(ok ? "✅ Daily digest sent." : "❌ Failed to send — check Email config (npm run alert:test) and logs above.");
  db.close();
}

main().catch((err) => {
  console.error("digest:test failed:", err);
  process.exit(1);
});
