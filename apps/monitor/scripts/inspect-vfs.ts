import { inspectProvider } from "./lib/inspect.js";
import { env } from "../src/config/env.js";
import { storageStatePath } from "../src/browser/sessionManager.js";

async function main() {
  console.log(`Inspecting VFS at ${env.vfsUrl} ...\n`);

  const report = await inspectProvider({
    provider: "vfs",
    url: env.vfsUrl,
    storageStatePath: storageStatePath("vfs"),
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

  console.log("\nNext step: open the saved JSON report in debug/, then update");
  console.log("src/providers/selectors/vfs.selectors.json with the real select/field");
  console.log('names you see above, and set "verified": true.');
  console.log("\nIf VFS redirected to a login page, the authenticated flow needs its own");
  console.log("storage/vfs-state.json — this project currently only ships an auth helper");
  console.log("for BLS (npm run auth:bls). Tell your engineer to add an equivalent");
  console.log("`npm run auth:vfs` using scripts/auth-bls.ts as a template if VFS requires login.");
}

main().catch((err) => {
  console.error("inspect:vfs failed:", err);
  process.exit(1);
});
