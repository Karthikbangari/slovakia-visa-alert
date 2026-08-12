import { chromium, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEBUG_DIR = path.resolve(__dirname, "../../debug");
fs.mkdirSync(DEBUG_DIR, { recursive: true });

const REDACT_KEYS = /pass|token|auth|cookie|secret|otp|captcha/i;
const REDACT_QUERY_PARAMS = /token|auth|key|session|password/i;

function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    for (const key of Array.from(u.searchParams.keys())) {
      if (REDACT_QUERY_PARAMS.test(key)) u.searchParams.set(key, "[REDACTED]");
    }
    return u.toString();
  } catch {
    return url;
  }
}

export interface InspectionReport {
  provider: string;
  inspectedAt: string;
  url: string;
  title: string;
  selects: Array<{ selector: string; name: string | null; id: string | null; label: string | null; options: string[] }>;
  buttons: string[];
  formFields: Array<{ tag: string; name: string | null; id: string | null; type: string | null }>;
  networkRequests: Array<{ method: string; url: string; resourceType: string }>;
  jsonResponses: Array<{ url: string; status: number; contentType: string; sampleKeys: string[] }>;
  notes: string[];
}

/**
 * requirement #44 — provider discovery tool. Uses Playwright to describe the
 * page's structure and network shape without ever printing secrets. Saves a
 * JSON report to debug/ for the developer to use when filling in
 * src/providers/selectors/{provider}.selectors.json.
 */
export async function inspectProvider(opts: {
  provider: "bls" | "vfs";
  url: string;
  storageStatePath?: string;
  headless?: boolean;
}): Promise<InspectionReport> {
  const browser = await chromium.launch({ headless: opts.headless ?? true });
  const hasState = opts.storageStatePath && fs.existsSync(opts.storageStatePath);
  const context = await browser.newContext({
    storageState: hasState ? opts.storageStatePath : undefined,
  });
  const page = await context.newPage();

  const networkRequests: InspectionReport["networkRequests"] = [];
  const jsonResponses: InspectionReport["jsonResponses"] = [];

  page.on("request", (req) => {
    networkRequests.push({ method: req.method(), url: redactUrl(req.url()), resourceType: req.resourceType() });
  });

  page.on("response", async (res) => {
    const contentType = res.headers()["content-type"] ?? "";
    if (!contentType.includes("application/json")) return;
    try {
      const json = await res.json();
      const sampleKeys = json && typeof json === "object" ? Object.keys(json as object).filter((k) => !REDACT_KEYS.test(k)) : [];
      jsonResponses.push({ url: redactUrl(res.url()), status: res.status(), contentType, sampleKeys });
    } catch {
      // non-JSON or empty body — ignore
    }
  });

  const notes: string[] = [];

  try {
    await page.goto(opts.url, { waitUntil: "networkidle", timeout: 45000 });
  } catch (err) {
    notes.push(`Navigation did not reach networkidle within timeout: ${err instanceof Error ? err.message : err}`);
  }

  const title = await page.title().catch(() => "");
  const url = page.url();

  const selects = await extractSelects(page);
  const buttons = await extractButtonLabels(page);
  const formFields = await extractFormFields(page);

  if (!hasState && opts.storageStatePath) {
    notes.push(`No saved session found at ${opts.storageStatePath} — this inspection ran unauthenticated. If the real flow requires login, run npm run auth:bls first.`);
  }

  await browser.close();

  const report: InspectionReport = {
    provider: opts.provider,
    inspectedAt: new Date().toISOString(),
    url,
    title,
    selects,
    buttons,
    formFields,
    networkRequests: networkRequests.slice(0, 200),
    jsonResponses,
    notes,
  };

  const reportPath = path.join(DEBUG_DIR, `${opts.provider}-inspection-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  return { ...report, notes: [...notes, `Full report saved to ${reportPath}`] };
}

async function extractSelects(page: Page) {
  return page.$$eval("select", (elements) =>
    elements.map((el) => {
      const label =
        el.closest("label")?.textContent?.trim() ??
        (el.id ? document.querySelector(`label[for="${el.id}"]`)?.textContent?.trim() : null) ??
        null;
      return {
        selector: el.tagName.toLowerCase() + (el.id ? `#${el.id}` : ""),
        name: el.getAttribute("name"),
        id: el.id || null,
        label,
        options: Array.from(el.options).map((o) => o.textContent?.trim() ?? "").filter(Boolean),
      };
    }),
  );
}

async function extractButtonLabels(page: Page) {
  return page.$$eval("button, input[type=submit], a.btn, [role=button]", (elements) =>
    elements
      .map((el) => (el as HTMLElement).innerText?.trim() || el.getAttribute("value") || el.getAttribute("aria-label") || "")
      .filter(Boolean)
      .slice(0, 60),
  );
}

async function extractFormFields(page: Page) {
  return page.$$eval("input, textarea", (elements) =>
    elements
      .filter((el) => (el as HTMLInputElement).type !== "password")
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        name: el.getAttribute("name"),
        id: el.id || null,
        type: el.getAttribute("type"),
      })),
  );
}
