import "dotenv/config";

function str(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined) return fallback;
  return v.toLowerCase() === "true" || v === "1";
}

function int(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

const ALLOWED_INTERVALS = [15, 30, 60, 120, 300];

function checkInterval(): number {
  const requested = int("CHECK_INTERVAL_SECONDS", 30);
  if (ALLOWED_INTERVALS.includes(requested)) return requested;
  // Fall back to the closest allowed value rather than hammering the site
  // with an arbitrary interval.
  const closest = ALLOWED_INTERVALS.reduce((a, b) =>
    Math.abs(b - requested) < Math.abs(a - requested) ? b : a,
  );
  // eslint-disable-next-line no-console
  console.warn(
    `[config] CHECK_INTERVAL_SECONDS=${requested} is not one of ${ALLOWED_INTERVALS.join(", ")}. Using ${closest}s instead.`,
  );
  return closest;
}

export const env = {
  nodeEnv: str("NODE_ENV", "development"),
  port: int("PORT", 3001),
  isProd: str("NODE_ENV", "development") === "production",

  checkIntervalSeconds: checkInterval(),
  checkJitterPercent: Math.min(Math.max(int("CHECK_JITTER_PERCENT", 10), 0), 50),
  alertCooldownMinutes: int("ALERT_COOLDOWN_MINUTES", 10),
  // Off by default per the user's request: startup/pause/error/recovery/
  // possible-slot emails were flapping roughly every ~30min on Render's
  // free tier (VFS checks intermittently timing out there → ERROR →
  // recovery on the next successful check). A confirmed slot alert is
  // never gated by this — only this secondary "system is doing something"
  // chatter is. Still recorded to the database/logs either way, just not
  // emailed, unless explicitly enabled. (There's also a digest email, but
  // per the user's request it's manual-only via `npm run digest:test` —
  // nothing auto-sends it, so it needs no gate here.)
  systemAlertsEnabled: bool("SYSTEM_ALERTS_ENABLED", false),
  browserRestartHours: int("BROWSER_RESTART_HOURS", 6),
  historyRetentionDays: int("HISTORY_RETENTION_DAYS", 30),

  blsEnabled: bool("BLS_ENABLED", true),
  vfsEnabled: bool("VFS_ENABLED", true),
  blsUrl: str("BLS_URL", "https://appointment.blsslovakiavisa.com/app_india/login"),
  // Confirmed live 2026-08-12 (see README "Selector verification"): the
  // originally-guessed application-detail deep link renders "Session
  // Expired or Invalid" without a bootstrapped session. book-an-appointment
  // is the real, publicly-reachable page that states Long Stay/National
  // Visa (D-category) appointments require contacting VFS directly.
  vfsUrl: str("VFS_URL", "https://visa.vfsglobal.com/ind/en/svk/book-an-appointment"),
  blsEmail: str("BLS_EMAIL"),
  blsPassword: str("BLS_PASSWORD"),
  headless: bool("HEADLESS", true),

  mockProvider: bool("MOCK_PROVIDER", false),

  alertEmail: str("ALERT_EMAIL", "info.foreignland@proton.me"),
  smtpHost: str("SMTP_HOST"),
  smtpPort: int("SMTP_PORT", 587),
  smtpSecure: bool("SMTP_SECURE", false),
  smtpUser: str("SMTP_USER"),
  smtpPassword: str("SMTP_PASSWORD"),
  smtpFrom: str("SMTP_FROM", "Slovakia Visa Alert <alerts@example.com>"),
  resendApiKey: str("RESEND_API_KEY"),

  databaseUrl: str("DATABASE_URL", "./data/visa-alert.db"),
  // Playwright auth-state (storage/) and debug screenshots (debug/) —
  // overridable so a deployment can point them at a mounted persistent
  // volume instead of the container's ephemeral filesystem.
  storageDir: str("STORAGE_DIR", "./storage"),
  debugDir: str("DEBUG_DIR", "./debug"),

  frontendUrl: str("FRONTEND_URL", "http://localhost:3000"),

  debugMonitor: bool("DEBUG_MONITOR", false),
};

export function assertNoSecretsInLogs(payload: unknown): void {
  // Defense-in-depth guard used by the API layer before responding — see
  // requirement #16/#38 (frontend/API must never leak secrets).
  const banned = [env.blsPassword, env.smtpPassword, env.resendApiKey].filter(Boolean);
  const json = JSON.stringify(payload);
  for (const secret of banned) {
    if (secret && json.includes(secret)) {
      throw new Error("Refusing to emit response that contains a configured secret value");
    }
  }
}
