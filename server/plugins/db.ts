import { runMigrations } from "@agent-native/core/db";

import { releaseWorkbenchMigrations } from "../db/migrations.js";

export default runMigrations(releaseWorkbenchMigrations, {
  table: "release_workbench_migrations",
});
