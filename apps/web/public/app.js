const API_BASE = window.MONITOR_API_BASE;
const REFRESH_MS = 10_000;

function fmtKolkata(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "medium" });
  } catch {
    return iso;
  }
}

function setKv(containerId, data) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.querySelectorAll("[data-field]").forEach((dd) => {
    const field = dd.getAttribute("data-field");
    let value = data ? data[field] : undefined;
    if (field === "lastChecked" || field === "firstSeenAt") value = fmtKolkata(value);
    if (field === "responseTimeMs" && typeof value === "number") value = `${value} ms`;
    if (field === "paused") value = value ? "⏸ yes" : "▶ no";
    dd.textContent = value === undefined || value === null || value === "" ? "—" : String(value);
  });
}

async function fetchJson(path) {
  const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}

async function refresh() {
  try {
    const status = await fetchJson("/api/status");

    const onlineEl = document.getElementById("online-indicator");
    onlineEl.textContent = status.online ? "🟢 Monitor Online" : "🔴 Monitor Offline";
    onlineEl.className = `indicator ${status.online ? "online" : "offline"}`;
    document.getElementById("last-heartbeat").textContent = status.lastHeartbeat
      ? `Last heartbeat: ${fmtKolkata(status.lastHeartbeat)} IST`
      : "";

    document.getElementById("target-region").textContent = status.target.region;
    document.getElementById("target-category").textContent = status.target.category;
    document.getElementById("target-visaType").textContent = status.target.visaType;
    document.getElementById("target-purpose").textContent = status.target.purpose;
    document.getElementById("target-interval").textContent = `${status.checkIntervalSeconds} seconds`;

    setKv("bls-kv", status.providers.bls);
    setKv("vfs-kv", status.providers.vfs);
  } catch (err) {
    const onlineEl = document.getElementById("online-indicator");
    onlineEl.textContent = "🔴 Monitor Offline";
    onlineEl.className = "indicator offline";
    document.getElementById("last-heartbeat").textContent = "Could not reach monitor API — check config.js MONITOR_API_BASE.";
    console.error(err);
  }

  try {
    const { slot } = await fetchJson("/api/last-slot");
    setKv("last-slot-kv", slot || { provider: "None detected yet" });
  } catch (err) {
    console.error(err);
  }

  try {
    const { checks } = await fetchJson("/api/history?limit=20");
    const tbody = document.querySelector("#recent-checks tbody");
    tbody.innerHTML = "";
    for (const c of checks) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${fmtKolkata(c.checkedAt)}</td><td>${c.provider}</td><td>${c.status}</td><td>${c.durationMs} ms</td>`;
      tbody.appendChild(tr);
    }
  } catch (err) {
    console.error(err);
  }
}

refresh();
setInterval(refresh, REFRESH_MS);
