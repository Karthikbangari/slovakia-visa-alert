import { BLSProvider } from "../src/providers/bls.js";
import { VFSProvider } from "../src/providers/vfs.js";
import { matchesTarget, deriveConfidence, describeTarget } from "../src/detectors/validator.js";
import { sessionManager } from "../src/browser/sessionManager.js";
import type { ProviderAdapter } from "../src/types.js";

/**
 * requirement #32 — manual provider tests: `npm run check:bls|vfs|all`.
 */
async function runOne(provider: ProviderAdapter): Promise<void> {
  console.log(`=== ${provider.name} CHECK ===\n`);
  console.log(`Target:\n${describeTarget()}\n`);

  const result = await provider.checkAvailability();
  const match = matchesTarget(result);
  const confidence = deriveConfidence(result);

  console.log(`Authentication:\n${result.state === "SESSION_EXPIRED" ? "Missing/expired" : "OK (or not required)"}\n`);

  if (result.state === "SLOT_AVAILABLE" && match.matchesAll && confidence === "CONFIRMED") {
    console.log("🚨 SLOT AVAILABLE\n");
    for (const d of result.dates) {
      console.log(`Date:\n${d.date}`);
      console.log(`Time:\n${d.time ?? "N/A"}\n`);
    }
  } else {
    console.log(`Result:\n${result.state}${result.state === "NO_SLOT" ? " (no slot)" : ""}\n`);
  }

  console.log(`Confidence: ${confidence}`);
  console.log(`Raw status: ${result.rawStatus}`);
  console.log(`Checked:\n${result.checkedAt}\n`);
  console.log(`Duration:\n${result.responseTimeMs} ms\n`);
}

async function main() {
  const target = process.argv[2] ?? "all";
  const providers: ProviderAdapter[] = [];
  if (target === "bls" || target === "all") providers.push(new BLSProvider());
  if (target === "vfs" || target === "all") providers.push(new VFSProvider());

  if (providers.length === 0) {
    console.error("Usage: tsx scripts/test-provider.ts <bls|vfs|all>");
    process.exit(1);
  }

  for (const provider of providers) {
    await runOne(provider);
  }

  await sessionManager.shutdown();
}

main().catch((err) => {
  console.error("Provider check failed:", err);
  process.exit(1);
});
