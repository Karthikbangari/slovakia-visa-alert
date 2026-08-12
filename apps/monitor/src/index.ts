import { env } from "./config/env.js";
import { MonitorService } from "./services/monitor.js";
import { buildApiServer } from "./api/server.js";
import { BLSProvider } from "./providers/bls.js";
import { VFSProvider } from "./providers/vfs.js";
import { MockProvider } from "./providers/mock.js";
import { sessionManager } from "./browser/sessionManager.js";
import type { ProviderAdapter } from "./types.js";

function buildProviders(): ProviderAdapter[] {
  if (env.mockProvider) {
    // eslint-disable-next-line no-console
    console.log("[index] MOCK_PROVIDER=true — using simulated providers, BLS/VFS will not be contacted");
    return [new MockProvider("BLS", "no-slot"), new MockProvider("VFS", "no-slot")];
  }
  return [new BLSProvider(), new VFSProvider()];
}

async function main(): Promise<void> {
  const providers = buildProviders();
  const monitor = new MonitorService(providers);
  await monitor.start();

  const app = buildApiServer(monitor);
  await app.listen({ port: env.port, host: "0.0.0.0" });
  // eslint-disable-next-line no-console
  console.log(`[index] API listening on :${env.port} (health: /health, status: /api/status)`);

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    // eslint-disable-next-line no-console
    console.log(`[index] received ${signal}, shutting down gracefully...`);
    await app.close().catch(() => undefined);
    await monitor.stop().catch(() => undefined);
    await sessionManager.shutdown().catch(() => undefined);
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[index] fatal startup error:", err);
  process.exit(1);
});
