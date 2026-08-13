import { chromium, type Browser, type BrowserContext } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { env } from "../config/env.js";

const STORAGE_DIR = path.resolve(process.cwd(), env.storageDir);
const DEBUG_DIR = path.resolve(process.cwd(), env.debugDir);

fs.mkdirSync(STORAGE_DIR, { recursive: true });
fs.mkdirSync(DEBUG_DIR, { recursive: true });

export function storageStatePath(provider: "bls" | "vfs"): string {
  return path.join(STORAGE_DIR, `${provider}-state.json`);
}

export function debugScreenshotPath(provider: string): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(DEBUG_DIR, `${provider}-${ts}.png`);
}

/**
 * Owns one long-lived Chromium instance shared by all providers, per
 * requirement #46 (reuse browser instead of relaunching every poll) and
 * requirement #47 (graceful shutdown). Restarts periodically to bound
 * memory growth (BROWSER_RESTART_HOURS).
 */
export class BrowserSessionManager {
  private browser: Browser | null = null;
  private launchedAt = 0;
  private contexts = new Map<string, BrowserContext>();

  async getBrowser(): Promise<Browser> {
    const maxAgeMs = env.browserRestartHours * 60 * 60 * 1000;
    if (this.browser && Date.now() - this.launchedAt > maxAgeMs) {
      await this.restart();
    }
    if (!this.browser) {
      this.browser = await chromium.launch({ headless: env.headless });
      this.launchedAt = Date.now();
    }
    return this.browser;
  }

  /**
   * Returns a context for the given provider, loading its saved
   * storageState (from `npm run auth:bls`) if present. Callers must not
   * assume the context is authenticated — check via the provider's own
   * validator after navigation.
   */
  async getContext(provider: "bls" | "vfs", opts?: { forceFresh?: boolean }): Promise<BrowserContext> {
    if (opts?.forceFresh) {
      await this.closeContext(provider);
    }
    const cached = this.contexts.get(provider);
    if (cached) return cached;

    const browser = await this.getBrowser();
    const statePath = storageStatePath(provider);
    const hasState = fs.existsSync(statePath);

    const context = await browser.newContext({
      storageState: hasState ? statePath : undefined,
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
      viewport: { width: 1366, height: 900 },
    });
    this.contexts.set(provider, context);
    return context;
  }

  async closeContext(provider: string): Promise<void> {
    const ctx = this.contexts.get(provider);
    if (ctx) {
      await ctx.close().catch(() => undefined);
      this.contexts.delete(provider);
    }
  }

  async restart(): Promise<void> {
    for (const provider of this.contexts.keys()) {
      await this.closeContext(provider);
    }
    if (this.browser) {
      await this.browser.close().catch(() => undefined);
      this.browser = null;
    }
  }

  async shutdown(): Promise<void> {
    await this.restart();
  }
}

export const sessionManager = new BrowserSessionManager();
