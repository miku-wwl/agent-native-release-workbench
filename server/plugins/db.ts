import { closeDbExec, runMigrations } from "@agent-native/core/db";

import { releaseWorkbenchMigrations } from "../db/migrations.js";

const migrate = runMigrations(releaseWorkbenchMigrations, {
  table: "release_workbench_migrations",
});

async function closeWorkbenchDatabase() {
  await closeDbExec();
  console.info("[workbench-db] Database connections closed.");
}

// The installed Nitro Vite worker does not run runtime close hooks on exit.
// Compose a test-only Vite HMR lifecycle using public APIs, without an HTTP
// shutdown endpoint or a new app Action. Its transient key is never persisted.
const hot = import.meta.hot;
const shutdownKey = process.env.AGENT_NATIVE_PHASE05_SHUTDOWN_KEY;
if (process.env.NODE_ENV === "development" && hot && shutdownKey) {
  const onClose = async (message: { requestId?: string; key?: string }) => {
    if (message.key !== shutdownKey || typeof message.requestId !== "string") return;
    try {
      await closeWorkbenchDatabase();
      hot.send("workbench:database-closed", { requestId: message.requestId });
    } catch {
      hot.send("workbench:database-closed", { requestId: message.requestId, error: "Database close failed." });
    }
  };
  hot.on("workbench:close-database", onClose);
  hot.dispose(() => hot.off("workbench:close-database", onClose));
}

export default async function databasePlugin(app: Parameters<typeof migrate>[0]) {
  await migrate(app);
  // Use the public database lifecycle on a real Nitro close as well as the
  // framework's dev-HMR handshake. CLI startup supplies no server hooks.
  app?.hooks?.hook("close", closeWorkbenchDatabase);
}
