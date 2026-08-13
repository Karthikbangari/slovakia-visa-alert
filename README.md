# Slovakia Visa Slot Alert

A notification bot that monitors BLS and VFS Global for **Slovakia D-category,
Long Term, Study visa appointments in Delhi** and emails you the instant one
opens. **It never books anything for you, never solves CAPTCHAs, and never
bypasses bot protection.** Check → detect → notify → you book manually.

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

The project's actual running instance lives here, deployed via `flyctl`:

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
flyctl secrets set SMTP_HOST=... SMTP_USER=... SMTP_PASSWORD=...
flyctl ssh console -a slovakia-visa-alert  # shell into the machine
```

To deploy a fresh instance elsewhere instead of reusing this one:

```bash
flyctl launch --name <your-app-name> --region sin --yes --dockerfile Dockerfile --internal-port 3001
flyctl volumes create visa_alert_data --region sin --size 1 --yes
flyctl secrets set FRONTEND_URL="https://<your-pages-or-vercel-domain>" ALERT_EMAIL="you@example.com"
flyctl deploy
```

Then update `apps/web/public/config.js`'s `MONITOR_API_BASE` to your new
app's `https://<name>.fly.dev` URL and redeploy the dashboard.

## 12. VPS deployment (Ubuntu)

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

## 13. Vercel frontend deployment

```bash
cd apps/web
npx vercel deploy --prod
```

`apps/web/vercel.json` points Vercel at the `public/` directory (a plain
static site — no build step required). After deploying, edit
`apps/web/public/config.js` to point `MONITOR_API_BASE` at your persistent
backend's public URL, then redeploy.

## 14. Testing

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

## 15. Mock slot testing

Simulate the whole pipeline without touching BLS/VFS:

```bash
npm run mock:no-slot   # should NOT send any email alert
npm run mock:slot      # SHOULD send a 🚨 CONFIRMED alert for
                        # Delhi / D / Long Term / Study / 17 Sep 2026 / 10:30 AM
```

Configure email first (`npm run alert:test`) to actually see the message
land in your inbox.

## 16. Troubleshooting

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

## 17. Security

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

## 18. Updating

```bash
git pull
npm install
npm run build
docker compose up -d --build   # if using Docker
# or: sudo systemctl restart slovakia-visa-alert
```

## 19. Logs

- Docker: `docker compose logs -f`
- systemd: `journalctl -u slovakia-visa-alert -f`
- `DEBUG_MONITOR=true` in `.env` enables verbose navigation/network/timing
  logs (never passwords, cookies, or tokens).

## 20. Backup

Back up `data/visa-alert.db` (history) and `storage/*.json` (auth sessions)
periodically if you care about historical stats — both are plain files, so
a simple `rsync`/`scp`/nightly `cp` to another host is enough. Never back
these up to a public location; `storage/` contains session cookies.

## 21. Selector verification (external-site validation still needed)

### VFS — important finding, confirmed live on 2026-08-12

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

### BLS — the one piece that still needs your hands-on login

BLS is a separate appointment portal from VFS and **is** a real,
account-gated appointment system (confirmed via `npm run inspect:bls`:
its login page loads hCaptcha and uses randomized/obfuscated form field
names — a real login flow, not a static contact page). Its authenticated
appointment page (VAC/category/visa-type/purpose selects + calendar) is
the one thing that genuinely cannot be inspected without you logging in
by hand (including CAPTCHA/OTP, which this project deliberately never
automates). The infrastructure to detect availability with high confidence
is fully built (network-response capture + DOM fallback + CAPTCHA/
maintenance/session detection + selector-change screenshots); until it has
seen the real, logged-in appointment page it will correctly report
`UNKNOWN`/`SELECTORS_UNVERIFIED` rather than guess — see requirement "never
fake a working detector" and `apps/monitor/tests/mockProvider.test.ts` for
what a *verified* result should look like.

To finish it:

```bash
npm run auth:bls          # log in once, manually, including CAPTCHA/OTP
npm run inspect:bls       # generates debug/bls-inspection-*.json
```

Then open the generated report, and edit
`apps/monitor/src/providers/selectors/bls.selectors.json` with the real
`<select>` names/options and calendar/availability markup you see, and set
`"verified": true`. Re-run `npm run check:bls` to confirm it now classifies
NO_SLOT vs SLOT_AVAILABLE correctly against the live site.

## 22. Disclaimer

This tool checks publicly/authentication-gated pages you already have
legitimate access to, at a conservative, jittered interval, and only ever
notifies you — it does not submit appointments, solve CAPTCHAs, bypass
Cloudflare/queues/rate limits, rotate proxies, spoof fingerprints, or create
multiple accounts. You are responsible for complying with each provider's
terms of use; if a provider's terms prohibit automated checking, disable
that provider (`BLS_ENABLED=false` / `VFS_ENABLED=false`) and check
manually instead.
