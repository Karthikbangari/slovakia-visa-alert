// Public, non-secret configuration only. Points at the persistent monitor
// backend's API (see requirement #15) — deployed on Fly.io (region sin),
// which has real persistent storage for BLS's login session and history.
// (Render's free-tier deployment also still exists — see README §12 — but
// has no persistent disk, so a restart there wipes BLS's saved login.)
window.MONITOR_API_BASE = window.MONITOR_API_BASE || "https://slovakia-visa-alert.fly.dev";
