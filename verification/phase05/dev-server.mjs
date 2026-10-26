import { createServer } from "vite";
import { randomUUID } from "node:crypto";

// Test-only plain Node host for the existing Vite/Agent-Native configuration. It never
// disables authentication and never opens or drives a browser.
if (!process.env.DATABASE_URL?.startsWith("pglite:")) {
  throw new Error("Set DATABASE_URL to a dedicated Phase 0.5 PGlite directory.");
}
const port = Number(process.env.PHASE05_PORT ?? 8095); // guard:allow-env-credential — non-secret local test port.
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid PHASE05_PORT.");
const server = await createServer({ server: { host: "127.0.0.1", port, strictPort: true, open: false } });
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  if (process.env.AGENT_NATIVE_PHASE05_SHUTDOWN_KEY) {
    const hot = server.environments.nitro.hot;
    const requestId = randomUUID();
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { hot.off("workbench:database-closed", received); reject(new Error("Application database close was not acknowledged.")); }, 5_000);
      function received(message) {
        if (message.requestId !== requestId) return;
        clearTimeout(timer);
        hot.off("workbench:database-closed", received);
        if (message.error) reject(new Error(message.error)); else resolve();
      }
      hot.on("workbench:database-closed", received);
      hot.send({ type: "custom", event: "workbench:close-database", data: { requestId, key: process.env.AGENT_NATIVE_PHASE05_SHUTDOWN_KEY } });
    });
  }
  await server.close();
  console.log("Phase 0.5: Vite.close() completed.");
  // Framework terminal/background handles can outlive Vite. Exit only after
  // its awaited server/Nitro close lifecycle, never while requests are active.
  if (process.connected) process.send({ closed: true }, () => process.exit(0));
  else process.exit(0);
}
process.on("message", (message) => { if (message === "shutdown") void close(); });
process.on("SIGINT", () => void close());
process.on("SIGTERM", () => void close());
await server.listen();
console.log(`Phase 0.5 isolated workbench: http://127.0.0.1:${port}/home`);
process.send?.({ ready: true, origin: `http://127.0.0.1:${port}` });
