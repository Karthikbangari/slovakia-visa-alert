# Slovakia Visa Slot Alert

A notification bot that monitors BLS and VFS Global for **Slovakia D-category,
Long Term, Study visa appointments in Delhi** and emails you the instant one
opens. **It never books anything for you, never solves CAPTCHAs, and never
bypasses bot protection.** Check → detect → notify → you book manually.

> **⚠️ Known limitation, confirmed live 2026-08-13**: neither provider's
> real slot data for this visa category is currently reachable by
> automation, by their own design — see §22 for the full findings. **VFS**
> has no self-service calendar at all for Long Stay/National (D-category)
> visas; it's a manual "contact us" process. **BLS**'s calendar sits behind
> a CAPTCHA+OTP gate that reappears on every single booking attempt, not
> just once at login. Right now this bot's honest, working job is a
> **session/health monitor** — it confirms BLS's login stays valid and
> both sites stay reachable, and emails you the moment that changes. It
> will not — and structurally cannot — autonomously detect an open slot
> for this category unless one of the providers changes their process.

---

## 1. What this project does

- Continuously polls BLS and VFS appointment pages/APIs for your target
  configuration.
- Verifies **all** of region, category, visa type, and purpose before ever
  calling something "confirmed" — see [`src/detectors/validator.ts`](apps/monitor/src/detectors/validator.ts).
- Sends a 🚨 email alert within roughly 2 seconds (internally) of a
  confirmed detection, with a direct booking link.
- Never spams: the same slot only alerts again after it closes and reopens,
  or after a configurable cooldown.
- Pauses itself (never guesses, never bypasses) when it hits a CAPTCHA or an
  expired login session, and tells you exactly what to run to fix it.
- Ships a read-only public dashboard showing how many notifications have
  been sent — live at https://karthikbangari.github.io/slovakia-visa-alert/
  — no secrets, ever.

## 2. Target visa configuration

Hardcoded in one place — [`apps/monitor/src/config/target.ts`](apps/monitor/src/config/target.ts):

| Field | Value |
|---|---|
| Destination country | Slovakia |
| Application country | India |
| Region / VAC | **Delhi only** |
| Category | **D** |
| Visa type | **Long Term** |
| Purpose | **Study** |

Everything else (Mumbai, Bangalore, tourist/business/employment visas, other
VACs, etc.) is explicitly ignored. See `tests/validator.test.ts` for the
proof.

## 3. Architecture

```
apps/web (static dashboard)  ─────────────►  Vercel (or GitHub Pages)
                                                    │  fetches
                                                    ▼
apps/monitor (persistent Node.js process)  ◄────  reads /api/status etc.
   ├── providers/bls.ts, providers/vfs.ts  ──►  BLS / VFS (Playwright)
   ├── detectors/validator.ts (matchesTarget) — the only gate for alerts
   ├── database/ (SQLite)
   ├── notifications/ (Email — sole channel)
   └── api/ (Fastify: /health, /api/status, /api/history, /api/last-slot)
```

The monitor is a **long-running Node.js process** (Docker container, VPS, or
your own machine) — not a serverless cron job. GitHub Actions is used only
for CI (lint/typecheck/test/build) and an optional low-frequency fallback
health ping; it is never the real-time polling mechanism (see requirement
around 30-second polling — serverless cron cannot do that reliably or
politely).

## 4. Requirements

- Node.js 22+
- npm
- ~1 GB free disk for Playwright's Chromium download
- An SMTP account (Gmail app password, Proton Bridge, etc.) or a Resend API
  key, for sending email alerts

## 5. Installation

```bash
git clone <this-repo-url> slovakia-visa-alert
cd slovakia-visa-alert

cp .env.example .env

npm install
npx playwright install --with-deps chromium
```

## 6. Email setup

Email is the sole notification channel. Pick one:

**Option A — SMTP** (Gmail app password, Proton Mail Bridge, or any standard
SMTP provider): fill in `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`,
`SMTP_PASSWORD`, `SMTP_FROM` in `.env`.

**Option B — Resend**: set `RESEND_API_KEY` in `.env` (takes priority over
SMTP if both are set).

Either way, `ALERT_EMAIL` is where alerts are delivered (defaults to
`info.foreignland@proton.me`). Confirm it works:

```bash
npm run alert:test
```

You should see `Email: ✅` in the output and receive a `🧪 TEST ALERT` email.

Never paste SMTP passwords or API keys anywhere public (issues, chat logs,
screenshots).

## 7. BLS authentication

BLS requires a logged-in session, and login involves CAPTCHA/OTP that this
project **deliberately does not automate**. Instead:

```bash
npm run auth:bls
```

This opens a real, visible browser. Log in yourself (including any
CAPTCHA/OTP), then press Enter in the terminal. The script verifies you
reached an authenticated page and saves the session to
`storage/bls-state.json` (git-ignored). The monitor reuses this file — it
never sees your password.

If the session later expires, the monitor pauses BLS checks and emails you
telling you to re-run `npm run auth:bls`.

VFS does not require this step for the default `VFS_URL` — see §20 for what
was found there (Long Stay/National visa appointments are a manual "contact
us" process on VFS, not a self-service calendar).

## 8. Environment variables

See [`.env.example`](.env.example) for the full, commented list. Key ones:

| Variable | Purpose | Default |
|---|---|---|
| `CHECK_INTERVAL_SECONDS` | Polling interval (15/30/60/120/300 only) | `30` |
| `CHECK_JITTER_PERCENT` | Randomized +/- jitter on every poll | `10` |
| `ALERT_COOLDOWN_MINUTES` | Suppress repeat alerts for the same slot | `10` |
| `MOCK_PROVIDER` | Simulate providers instead of hitting BLS/VFS | `false` |
| `ALERT_EMAIL` | Where email alerts go | `info.foreignland@proton.me` |
| `SMTP_*` / `RESEND_API_KEY` | Email transport (either works) | — |
| `DATABASE_URL` | SQLite file path | `./data/visa-alert.db` |
| `FRONTEND_URL` | Allowed CORS origin(s) for the public API | `http://localhost:3000` |

**Never commit `.env`.**

## 9. Local running

```bash
npm run dev        # monitor, with auto-reload
```

In a second terminal, serve the dashboard:

```bash
cd apps/web && npm run dev   # http://localhost:3000
```

Edit `apps/web/public/config.js` so `MONITOR_API_BASE` points at your
monitor (`http://localhost:3001` locally).

## 10. Docker running

```bash
docker compose up -d
docker compose logs -f
docker compose restart
docker compose down
```

The container installs Playwright's Chromium with all OS dependencies via
the official `mcr.microsoft.com/playwright` base image, exposes `:3001`, and
has a healthcheck against `/health`. `data/`, `storage/`, and `debug/` are
bind-mounted so your BLS session and history survive rebuilds.

## 11. Fly.io deployment (this project's live instance)

The dashboard at https://karthikbangari.github.io/slovakia-visa-alert/
currently points here. Required a payment method on file (Fly.io's free
trial caps machine runtime at 5 minutes; once a card was added, this runs
continuously with no time limit).

- **URL**: https://slovakia-visa-alert.fly.dev
- **Region**: `sin` (Singapore — closest available region to India with
  reliable capacity at deploy time)
- **Config**: [`fly.toml`](fly.toml) — `min_machines_running = 1` and
  `auto_stop_machines = 'off'` are load-bearing: this is a continuous
  background poller, not a request-driven web app, so it must never scale
  to zero the way a typical Fly app does by default.
- **Persistent volume**: `visa_alert_data`, mounted at `/app/persist`. The
  database, BLS auth session (`storage/`), and debug screenshots all live
  there via `DATABASE_URL` / `STORAGE_DIR` / `DEBUG_DIR` env overrides (see
  `.env.example`) — without this, a redeploy would wipe BLS's login and
  reset the notification counter, since container filesystems are
  otherwise ephemeral.

Common commands (flyctl was installed to `~/.fly/bin/flyctl` — add it to
your `PATH`, or use the full path):

```bash
flyctl status -a slovakia-visa-alert       # is it running?
flyctl logs -a slovakia-visa-alert         # tail logs
flyctl deploy                              # redeploy after code changes
flyctl secrets set RESEND_API_KEY=... SMTP_FROM="..." ALERT_EMAIL=...
flyctl ssh console -a slovakia-visa-alert  # shell into the machine
```

### Uploading a BLS session to the volume

`npm run auth:bls` only ever runs on a machine with a real display (your
own computer) — there's no way to complete a CAPTCHA/OTP login on a
headless server. So after logging in locally, upload the resulting file
to Fly's volume, then restart the machine so the already-running process
picks it up (it caches the browser context in memory and won't notice a
new file on disk until it restarts):

```bash
# if a file already exists at the destination, remove it first — sftp put
# refuses to overwrite for safety
flyctl ssh console -a slovakia-visa-alert -C "rm /app/persist/storage/bls-state.json"
flyctl ssh sftp put apps/monitor/storage/bls-state.json /app/persist/storage/bls-state.json -a slovakia-visa-alert
flyctl machine restart <machine-id> -a slovakia-visa-alert
```

One real gotcha hit doing exactly this: BLS rejected a freshly-uploaded
session within minutes (bounced back to `SESSION_EXPIRED` on the very next
check). Root cause — `scripts/auth-bls.ts` (the login-time browser) was
launching with Playwright's default user-agent, while
`src/browser/sessionManager.ts` (the check-time browser) used a different,
hardcoded one. Some sites treat a user-agent change mid-session as a
hijacking signal and force re-login. Both now share the same
`SHARED_USER_AGENT`/`SHARED_VIEWPORT` constants exported from
`sessionManager.ts` — after that fix, a session captured in India held up
fine from Fly's Singapore host, so IP/region mismatch was not actually the
blocker some might expect it to be.

To deploy a fresh instance elsewhere instead of reusing this one:

```bash
flyctl launch --name <your-app-name> --region sin --yes --dockerfile Dockerfile --internal-port 3001
flyctl volumes create visa_alert_data --region sin --size 1 --yes
flyctl secrets set FRONTEND_URL="https://<your-pages-or-vercel-domain>" ALERT_EMAIL="you@example.com"
flyctl deploy
```

Then update `apps/web/public/config.js`'s `MONITOR_API_BASE` to your new
app's `https://<name>.fly.dev` URL and redeploy the dashboard.

## 12. Render deployment (alternate — still running, not linked from the dashboard)

Kept as a free, card-free fallback. Still deployed and still auto-deploys
on every push to `main`, but `apps/web/public/config.js` no longer points
at it — the public dashboard reads from Fly.io (§11) instead, since Fly
has real persistent storage and Render doesn't (see below). `BLS_ENABLED`
is set to `false` here (see `render.yaml`) since a restart wipes any saved
BLS login anyway.

- **URL**: https://slovakia-visa-alert-5wub.onrender.com
- **Config**: [`render.yaml`](render.yaml) (a Render "Blueprint") — deployed
  via Render's dashboard: New → Blueprint → select this repo → Apply.
  Secrets (`ALERT_EMAIL`, `FRONTEND_URL`, `SMTP_*`/`RESEND_API_KEY`) are
  marked `sync: false` in the blueprint, so Render prompts for them in its
  dashboard instead of storing real values in the repo.
- **Known limitation — no persistent disk**: Render's free tier doesn't
  support disks. `DATABASE_URL`/`STORAGE_DIR`/`DEBUG_DIR` all live on the
  container's ephemeral filesystem, so a restart or redeploy wipes the
  SQLite history and any saved BLS login. The Fly.io setup (§11) doesn't
  have this problem.
- **Known limitation — sleeps after 15 minutes of no inbound HTTP
  traffic**, which would silently pause the whole polling loop (the
  internal 30-second timer doesn't count as "traffic" to Render). The
  GitHub Actions `fallback-health-check` job (`.github/workflows/ci.yml`,
  every 10 minutes) doubles as a keep-alive ping for this, via the
  `MONITOR_HEALTH_URL` repo secret.

To switch the public dashboard back to Render: edit `MONITOR_API_BASE` in
`apps/web/public/config.js` and push.

## 13. VPS deployment (Ubuntu)

### Option A — Docker (recommended)

```bash
sudo apt update && sudo apt install -y docker.io docker-compose-plugin
git clone <repo-url> slovakia-visa-alert && cd slovakia-visa-alert
cp .env.example .env   # fill in real values
docker compose up -d
```

### Option B — systemd (no Docker)

```bash
sudo apt update && sudo apt install -y nodejs npm
git clone <repo-url> slovakia-visa-alert && cd slovakia-visa-alert
cp .env.example .env   # fill in real values
npm install && npx playwright install --with-deps chromium
npm run build

sudo useradd -m -s /bin/bash visaalert || true
sudo cp -r . /home/visaalert/slovakia-visa-alert
sudo chown -R visaalert:visaalert /home/visaalert/slovakia-visa-alert

sudo cp deploy/slovakia-visa-alert.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now slovakia-visa-alert
journalctl -u slovakia-visa-alert -f
```

## 14. Vercel frontend deployment

```bash
cd apps/web
npx vercel deploy --prod
```

`apps/web/vercel.json` points Vercel at the `public/` directory (a plain
static site — no build step required). After deploying, edit
`apps/web/public/config.js` to point `MONITOR_API_BASE` at your persistent
backend's public URL, then redeploy.

## 15. Testing

```bash
npm run typecheck
npm run test
npm run build
```

Tests cover (see `apps/monitor/tests/`): Delhi-only filtering, D-category
filtering, Study-purpose filtering, the exact "Mumbai+Study=no alert /
Delhi+Tourist=no alert / Delhi+D+Employment=no alert /
Delhi+D+LongTerm+Study+Available=ALERT" matrix, deduplication, state
transitions (pause/resume/error-dedup), notification formatting, adaptive
backoff, and an end-to-end mock-provider integration test.

## 16. Mock slot testing

Simulate the whole pipeline without touching BLS/VFS:

```bash
npm run mock:no-slot   # should NOT send any email alert
npm run mock:slot      # SHOULD send a 🚨 CONFIRMED alert for
                        # Delhi / D / Long Term / Study / 17 Sep 2026 / 10:30 AM
```

Configure email first (`npm run alert:test`) to actually see the message
land in your inbox.

## 17. Troubleshooting

### Session expired
You'll get a `🔐 SESSION EXPIRED` email. Run `npm run auth:bls` again on the
server, log in, and monitoring resumes automatically on the next check.

### CAPTCHA encountered
You'll get an email saying the provider needs human action. This bot will
**not** attempt to solve it. Log into the site manually in a browser to
clear the challenge, then re-run `npm run auth:bls` if it's an authenticated
flow.

### Selector changed
If BLS/VFS changes their page layout, checks will report
`SELECTORS_UNVERIFIED`/structural-change state instead of guessing, and save
a screenshot under `debug/`. Run `npm run inspect:bls` or `npm run inspect:vfs`,
review the generated report, and update
`src/providers/selectors/{bls,vfs}.selectors.json`.

### Nothing happens on mock:slot
Check `npm run alert:test` succeeds first — if email isn't configured, the
dispatcher silently no-ops (by design, so missing config never crashes the
monitor).

## 18. Security

- `.env`, `storage/` (Playwright session cookies), `data/` (SQLite), and
  `debug/` (screenshots) are all git-ignored — **never commit them.**
- The public API (`/health`, `/api/status`, `/api/history`, `/api/last-slot`)
  is read-only and never returns credentials, cookies, tokens, or session
  state — see `src/config/env.ts#assertNoSecretsInLogs` and
  `src/api/server.ts`.
- Helmet security headers, rate limiting, and a strict CORS allow-list
  (`FRONTEND_URL`) are applied to the API.
- No CAPTCHA bypass, fingerprint spoofing, proxy rotation, credential
  stuffing, or access-control circumvention exists anywhere in this
  codebase, by design.

## 19. Updating

```bash
git pull
npm install
npm run build
docker compose up -d --build   # if using Docker
# or: sudo systemctl restart slovakia-visa-alert
```

## 20. Logs

- Docker: `docker compose logs -f`
- systemd: `journalctl -u slovakia-visa-alert -f`
- `DEBUG_MONITOR=true` in `.env` enables verbose navigation/network/timing
  logs (never passwords, cookies, or tokens).

## 21. Backup

Back up `data/visa-alert.db` (history) and `storage/*.json` (auth sessions)
periodically if you care about historical stats — both are plain files, so
a simple `rsync`/`scp`/nightly `cp` to another host is enough. Never back
these up to a public location; `storage/` contains session cookies.

## 22. Live findings from both providers

### VFS — confirmed live on 2026-08-12

VFS Global's own "Book an appointment" page for Slovakia/India
(`https://visa.vfsglobal.com/ind/en/svk/book-an-appointment`, now the
default `VFS_URL`) states:

> "To book an appointment for submission of your **Long Stay (National
> Visa)** application, please... **contact us**."
>
> "If you're ready to arrange your **Short stay** application appointment,
> see below... **[Book now]**"

In other words: VFS's self-service online calendar ("Book now") is
confirmed to exist only for **Short Stay/Schengen** visas. **Long Stay/
National — our D-category target — routes to a manual "contact us"
process instead.** There is no evidence of a public, pollable slot
calendar for this category on VFS. This isn't a selector problem to fix;
it's what the site itself says. The `VFSProvider` now detects this exact
condition and reports it as `MANUAL_PROCESS_ONLY` (not an error, never
alerts, but also never CONFIRMED) instead of guessing.

If you have a different VFS URL for this — e.g. a private booking link
VFS emailed you after contacting them, or you know their process has
changed — update `VFS_URL` in `.env` and re-run `npm run inspect:vfs` to
capture its real structure, then follow the steps below to verify it.

### BLS — confirmed live on 2026-08-13, with a real logged-in session

BLS is a separate appointment portal from VFS and **is** a real,
account-gated system (its login page loads hCaptcha and uses randomized/
obfuscated form field names — a genuine anti-automation login flow). Login
via `npm run auth:bls` works correctly and the saved session stays valid
across checks.

But the actual date/slot calendar is one click further than the
authenticated landing page: clicking "Book appointment" for an applicant
leads to an "Appointment Booking Form" that requires solving a
distorted-digit image CAPTCHA **plus** a mobile OTP before you can
continue — and this check reappears on **every single booking attempt**,
not once at login. There is no selector work that fixes this; the
calendar itself is unreachable by automation, by BLS's design.

`BLSProvider` reflects this honestly: once authenticated with no
challenge on the landing page, it reports `MANUAL_PROCESS_ONLY` (session
healthy, but slot data is unreachable) rather than pretending to see a
calendar it never reached. It still correctly detects and pauses on
`SESSION_EXPIRED`, `HUMAN_ACTION_REQUIRED` (login-time CAPTCHA), and
`MAINTENANCE`/`RATE_LIMITED` — so you'll always know if the login itself
needs attention. See `apps/monitor/src/providers/bls.ts` and
`src/providers/selectors/bls.selectors.json` for the full writeup.

If BLS ever removes or changes this per-attempt verification step (or you
find a different, non-tokenized way to reach the calendar), re-run
`npm run inspect:bls` and revisit `bls.ts` — the inspection tooling and
`npm run check:bls` are still there and working.

## 23. Disclaimer

This tool checks publicly/authentication-gated pages you already have
legitimate access to, at a conservative, jittered interval, and only ever
notifies you — it does not submit appointments, solve CAPTCHAs, bypass
Cloudflare/queues/rate limits, rotate proxies, spoof fingerprints, or create
multiple accounts. You are responsible for complying with each provider's
terms of use; if a provider's terms prohibit automated checking, disable
that provider (`BLS_ENABLED=false` / `VFS_ENABLED=false`) and check
manually instead.
