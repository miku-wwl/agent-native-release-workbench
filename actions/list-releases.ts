import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { currentOwner } from "../server/action-auth.js";
import { getDb } from "../server/db/index.js";
import { releaseListOutputSchema } from "../server/release-domain.js";
import { listReleaseWork } from "../server/release-store.js";

export default defineAction({
  description: "List the signed-in user's release decisions and audit timeline.",
  schema: z.object({}).strict(),
  outputSchema: releaseListOutputSchema,
  outputErrorStrategy: "strict",
  http: { method: "GET" },
  requiresAuth: false,
  readOnly: true,
  run: async (_input, ctx) => listReleaseWork(getDb(), currentOwner(ctx)),
});
