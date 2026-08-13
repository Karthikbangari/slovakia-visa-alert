// Public, non-secret configuration only. Points at the persistent monitor
// backend's API (see requirement #15) — deployed on Render's free tier.
// (An alternate Fly.io deployment also exists — see README §11 — but is
// stopped because it requires a paid plan for continuous runtime.)
window.MONITOR_API_BASE = window.MONITOR_API_BASE || "https://slovakia-visa-alert-5wub.onrender.com";
