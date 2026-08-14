import { chromium } from "playwright";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { env } from "../src/config/env.js";
import { storageStatePath, SHARED_USER_AGENT, SHARED_VIEWPORT } from "../src/browser/sessionManager.js";
import { detectChallenge } from "../src/providers/common.js";

/**
 * requirement #7/#43 — manual, human-in-the-loop authentication. This never
 * attempts to fill CAPTCHA/OTP fields or auto-submit login; it opens a real,
 * visible browser and waits for YOU to complete login, then saves the
 * resulting storageState (cookies + localStorage) for the monitor to reuse.
 */
async function main() {
  console.log("Opening BLS...\n");
  console.log("Please manually complete login/CAPTCHA/OTP in the browser window.");
  console.log("After successful login, come back here and press Enter.\n");

  const browser = await chromium.launch({ headless: false });
  // Match the monitor's own check-time browser fingerprint (user-agent,
  // viewport) so the session we capture here doesn't look like it changed
  // devices the moment the monitor starts using it.
  const context = await browser.newContext({ userAgent: SHARED_USER_AGENT, viewport: SHARED_VIEWPORT });
  const page = await context.newPage();
  await page.goto(env.blsUrl, { waitUntil: "domcontentloaded" });

  if (env.blsEmail) {
    console.log(`(Tip: your BLS_EMAIL is set to ${env.blsEmail} — you can use it to fill the email field manually.)`);
  }

  const rl = readline.createInterface({ input: stdin, output: stdout });
  await rl.question("Press Enter once you have finished logging in... ");
  rl.close();

  const challenge = await detectChallenge(page, "login");
  if (challenge.isLoginRedirect || challenge.isCaptcha) {
    console.error("\n❌ It looks like login was not completed (still on login page or a challenge is showing).");
    console.error(`   Reason: ${challenge.reason ?? "still on login URL"}`);
    console.error("   Finish login in the browser window, then re-run: npm run auth:bls");
    await browser.close();
    process.exit(1);
  }

  const path = storageStatePath("bls");
  await context.storageState({ path });
  await browser.close();

  console.log(`\n✅ BLS authentication saved securely to ${path}`);
  console.log("This file is git-ignored and contains session cookies — never commit or share it.");
  console.log("The monitoring service will now use this session for BLS checks.");
}

main().catch((err) => {
  console.error("auth:bls failed:", err);
  process.exit(1);
});
