import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { env } from "../config/env.js";
import { TARGET } from "../config/target.js";
import type { MonitorService } from "../services/monitor.js";

const START_TIME = Date.now();
const HEARTBEAT_STALE_MS = 3 * 60 * 1000;

/**
 * Public, read-only API — requirement #15/#48/#49. Never exposes secrets,
 * credentials, cookies, or session state; only aggregate status.
 */
export function buildApiServer(monitor: MonitorService) {
  const app = Fastify({ logger: env.debugMonitor });

  const allowedOrigins = env.frontendUrl.split(",").map((s) => s.trim()).filter(Boolean);

  app.register(helmet, { global: true });
  app.register(cors, {
    origin: allowedOrigins.length ? allowedOrigins : false,
    methods: ["GET"],
  });
  app.register(rateLimit, {
    max: 60,
    timeWindow: "1 minute",
  });

  function isHeartbeatFresh(): boolean {
    const last = monitor.lastHeartbeat();
    if (!last) return false;
    return Date.now() - new Date(last).getTime() < HEARTBEAT_STALE_MS;
  }

  app.get("/health", async (_req, reply) => {
    const healthy = isHeartbeatFresh();
    const snapshot = monitor.getSnapshot();
    const body = {
      status: healthy ? "ok" : "unhealthy",
      uptime: Math.round((Date.now() - START_TIME) / 1000),
      lastMonitorHeartbeat: monitor.lastHeartbeat(),
      providers: Object.fromEntries(Object.entries(snapshot).map(([k, v]) => [k.toLowerCase(), v.status])),
    };
    reply.code(healthy ? 200 : 503).send(body);
  });

  app.get("/api/status", async () => {
    const snapshot = monitor.getSnapshot();
    return {
      online: isHeartbeatFresh(),
      lastHeartbeat: monitor.lastHeartbeat(),
      target: {
        region: TARGET.region,
        category: TARGET.category,
        visaType: TARGET.visaType,
        purpose: TARGET.purpose,
      },
      checkIntervalSeconds: env.checkIntervalSeconds,
      providers: {
        bls: snapshot.BLS ?? { status: "UNKNOWN", lastChecked: null, responseTimeMs: null, paused: false },
        vfs: snapshot.VFS ?? { status: "UNKNOWN", lastChecked: null, responseTimeMs: null, paused: false },
      },
    };
  });

  app.get("/api/history", async (req) => {
    const query = req.query as { limit?: string };
    const limit = Math.min(Math.max(Number.parseInt(query.limit ?? "50", 10) || 50, 1), 200);
    return { checks: monitor.getDb().recentChecks(limit) };
  });

  app.get("/api/last-slot", async () => {
    return { slot: monitor.getDb().lastActiveSlot() ?? null };
  });

  app.get("/api/stats", async () => {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    return monitor.getDb().stats(since.toISOString());
  });

  return app;
}
