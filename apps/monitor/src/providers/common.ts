import type { Page, Response } from "playwright";
import fs from "node:fs";
import { debugScreenshotPath } from "../browser/sessionManager.js";
import { env } from "../config/env.js";

export interface ChallengeCheck {
  isCaptcha: boolean;
  isMaintenance: boolean;
  isLoginRedirect: boolean;
  isSessionExpired: boolean;
  reason?: string;
}

const CAPTCHA_MARKERS = [
  "recaptcha",
  "hcaptcha",
  "cf-turnstile",
  "captcha",
  "verify you are human",
  "checking your browser",
  "just a moment",
  "ddos protection by cloudflare",
  "attention required",
  "access denied",
];

const MAINTENANCE_MARKERS = [
  "under maintenance",
  "site is currently unavailable",
  "temporarily unavailable",
  "scheduled maintenance",
  "service unavailable",
  "we'll be back",
];

// Confirmed live against VFS on 2026-08-12: hitting application-detail
// without a session bootstrapped via VFS's normal navigation flow (cookie
// consent + country/mission selection on their homepage) renders this
// client-side "Session Expired or Invalid" message rather than redirecting
// to a login URL — see `npm run inspect:vfs` / debug/vfs-*.png.
const SESSION_EXPIRED_MARKERS = [
  "session expired or invalid",
  "session has expired",
  "session is invalid",
  "your session has expired",
];

/**
 * Generic, provider-agnostic detection of bot-protection / maintenance /
 * login-redirect pages. Deliberately does NOT attempt to solve or bypass
 * anything — it only classifies so the caller can pause and ask for human
 * help (requirement #3, #21).
 */
export async function detectChallenge(page: Page, loginUrlHint?: string): Promise<ChallengeCheck> {
  const [title, bodyText, url] = await Promise.all([
    page.title().catch(() => ""),
    page
      .locator("body")
      .innerText({ timeout: 3000 })
      .catch(() => ""),
    Promise.resolve(page.url()),
  ]);

  const haystack = `${title}\n${bodyText}`.toLowerCase();

  const captchaFrame = page.frames().some((f) => /captcha|turnstile|hcaptcha/i.test(f.url()));
  const isCaptcha = captchaFrame || CAPTCHA_MARKERS.some((m) => haystack.includes(m));
  const isMaintenance = MAINTENANCE_MARKERS.some((m) => haystack.includes(m));
  const isLoginRedirect = Boolean(loginUrlHint) && url.includes(loginUrlHint!);
  const isSessionExpired = SESSION_EXPIRED_MARKERS.some((m) => haystack.includes(m));

  let reason: string | undefined;
  if (isCaptcha) reason = "CAPTCHA/bot-protection markers detected in page title/body/frames";
  else if (isMaintenance) reason = "Maintenance-page markers detected";
  else if (isLoginRedirect) reason = `Navigated back to login URL (${loginUrlHint})`;
  else if (isSessionExpired) reason = "Page rendered a 'session expired/invalid' message client-side";

  return { isCaptcha, isMaintenance, isLoginRedirect, isSessionExpired, reason };
}

export interface CapturedResponse {
  url: string;
  status: number;
  json: unknown;
}

const INTERESTING_KEY_PATTERN = /date|slot|availab|calendar|appointment/i;

function looksInteresting(json: unknown): boolean {
  if (!json || typeof json !== "object") return false;
  const keys = JSON.stringify(Object.keys(json as object)).toLowerCase();
  return INTERESTING_KEY_PATTERN.test(keys);
}

/**
 * Attaches a listener that captures JSON API responses whose keys look
 * availability-related, per requirement #6 (prefer network/API observation
 * over fragile DOM text). Redacts nothing itself — callers must not log
 * raw responses that could contain personal data; only structural shape is
 * used for detection.
 */
export function captureAvailabilityResponses(page: Page): { responses: CapturedResponse[]; dispose: () => void } {
  const responses: CapturedResponse[] = [];

  const handler = async (response: Response) => {
    try {
      const contentType = response.headers()["content-type"] ?? "";
      if (!contentType.includes("application/json")) return;
      const status = response.status();
      const json = await response.json().catch(() => null);
      if (looksInteresting(json)) {
        responses.push({ url: response.url(), status, json });
      }
    } catch {
      // Ignore — response bodies can fail to parse for unrelated requests.
    }
  };

  page.on("response", handler);
  return {
    responses,
    dispose: () => page.off("response", handler),
  };
}

/**
 * Saves a screenshot for later diagnosis when the expected page structure
 * is missing (requirement #21/#22). Never uploaded automatically; stays on
 * local disk under debug/, which is git-ignored.
 */
export async function saveDebugScreenshot(page: Page, provider: string): Promise<string | null> {
  try {
    const filePath = debugScreenshotPath(provider);
    await page.screenshot({ path: filePath, fullPage: false });
    if (env.debugMonitor) {
      // eslint-disable-next-line no-console
      console.log(`[${provider}] saved debug screenshot: ${filePath}`);
    }
    return filePath;
  } catch {
    return null;
  }
}

export function pageFingerprint(html: string): string {
  // Cheap structural fingerprint (length + a few sampled offsets) — good
  // enough to notice "the page shape changed" without storing full HTML.
  let hash = 0;
  for (let i = 0; i < html.length; i += 97) {
    hash = (hash * 31 + html.charCodeAt(i)) | 0;
  }
  return `${html.length}:${hash}`;
}

export function loadSelectorConfig<T>(path: string, fallback: T): T & { verified?: boolean } {
  try {
    const raw = fs.readFileSync(path, "utf-8");
    return JSON.parse(raw);
  } catch {
    return fallback as T & { verified?: boolean };
  }
}
