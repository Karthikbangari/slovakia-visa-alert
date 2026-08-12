import { MockProvider } from "../src/providers/mock.js";
import { MonitorService } from "../src/services/monitor.js";
import type { MockScenario } from "../src/providers/mock.js";

/**
 * requirement #30 — `npm run mock:no-slot` / `npm run mock:slot`. Exercises
 * the full pipeline (validator -> dedup -> email) without ever touching
 * BLS/VFS, so you can confirm notifications work end to end.
 */
async function main() {
  const arg = process.argv[2];
  const scenario: MockScenario = arg === "slot" ? "slot" : "no-slot";

  console.log(`Running mock scenario: ${scenario}\n`);

  const bls = new MockProvider("BLS", scenario);
  const monitor = new MonitorService([bls]);

  await monitor.start();

  // Give the immediate first check (scheduled with 0 delay) time to run and
  // dispatch notifications, then shut down cleanly.
  await new Promise((r) => setTimeout(r, 3000));
  await monitor.stop();

  if (scenario === "slot") {
    console.log("\nMock SLOT_AVAILABLE result processed. Check your email for the alert.");
  } else {
    console.log("\nMock NO_SLOT result processed. No alert should have been sent (this is correct).");
  }
}

main().catch((err) => {
  console.error("mock run failed:", err);
  process.exit(1);
});
