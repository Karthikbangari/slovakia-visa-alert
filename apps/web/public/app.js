const API_BASE = window.MONITOR_API_BASE;
const REFRESH_MS = 15_000;

function fmtKolkata(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "medium" });
  } catch {
    return iso;
  }
}

async function refresh() {
  const countEl = document.getElementById("count");
  const lastSentEl = document.getElementById("last-sent");
  const dotEl = document.getElementById("online-dot");
  const textEl = document.getElementById("online-text");

  try {
    const res = await fetch(`${API_BASE}/api/notifications`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    countEl.textContent = data.totalSent;
    lastSentEl.textContent = `Last sent: ${data.lastSentAt ? `${fmtKolkata(data.lastSentAt)} IST` : "never yet"}`;

    dotEl.className = data.online ? "dot-online" : "dot-offline";
    textEl.textContent = data.online ? "bot is running" : "bot is offline";
  } catch (err) {
    countEl.textContent = "—";
    lastSentEl.textContent = "Last sent: —";
    dotEl.className = "dot-offline";
    textEl.textContent = "bot is offline (can't reach it)";
    console.error(err);
  }
}

refresh();
setInterval(refresh, REFRESH_MS);
