import { inspectProvider } from "./lib/inspect.js";
import { env } from "../src/config/env.js";
import { storageStatePath } from "../src/browser/sessionManager.js";

async function main() {
  console.log(`Inspecting BLS at ${env.blsUrl} ...`);
  console.log("(Run `npm run auth:bls` first if you want this to inspect the authenticated appointment page.)\n");

  const report = await inspectProvider({
    provider: "bls",
    url: env.blsUrl,
    storageStatePath: storageStatePath("bls"),
    headless: env.headless,
  });

  console.log(`Page URL: ${report.url}`);
  console.log(`Page title: ${report.title}\n`);

  console.log(`Found ${report.selects.length} <select> element(s):`);
  for (const s of report.selects) {
    console.log(`  - ${s.selector}  name="${s.name}"  label="${s.label}"  options=[${s.options.slice(0, 5).join(", ")}${s.options.length > 5 ? ", ..." : ""}]`);
  }

  console.log(`\nFound ${report.buttons.length} button/link label(s):`);
  console.log(`  ${report.buttons.slice(0, 20).join(" | ")}`);

  console.log(`\nCaptured ${report.jsonResponses.length} JSON API response(s) with availability-shaped keys:`);
  for (const r of report.jsonResponses) {
    console.log(`  - [${r.status}] ${r.url} -> keys: ${r.sampleKeys.join(", ")}`);
  }

  if (report.notes.length) {
    console.log("\nNotes:");
    for (const n of report.notes) console.log(`  - ${n}`);
  }

  console.log("\nNote: this only inspects the authenticated landing page (applicant list).");
  console.log("The real date/slot calendar is one click further, behind 'Book appointment',");
  console.log("which requires a fresh CAPTCHA + OTP on every attempt — confirmed live");
  console.log("2026-08-13, see src/providers/selectors/bls.selectors.json and bls.ts for");
  console.log("why this bot does not attempt to click through to it.");
}

main().catch((err) => {
  console.error("inspect:bls failed:", err);
  process.exit(1);
});
