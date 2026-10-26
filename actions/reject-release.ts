import { defineAction, fail } from "@agent-native/core/action";
import { z } from "zod";

import { currentOwner, requireInteractiveApproval } from "../server/action-auth.js";
import { getDb } from "../server/db/index.js";
import { transitionOutputSchema } from "../server/release-domain.js";
import { rejectRelease, ReleaseStoreError } from "../server/release-store.js";

const schema = z.object({ releaseId: z.string().trim().min(1).max(80) }).strict();

export default defineAction({
  description: "Reject a proposed release so its local execution path stays closed.",
  schema,
  outputSchema: transitionOutputSchema,
  outputErrorStrategy: "strict",
  requiresAuth: true,
  needsApproval: true,
  authorize: requireInteractiveApproval,
  audit: { recordInputs: false },
  run: async ({ releaseId }, ctx) => {
    const actor = currentOwner(ctx);
    try {
      return await rejectRelease(getDb(), { releaseId, ownerEmail: actor, actor });
    } catch (error) {
      if (error instanceof ReleaseStoreError) {
        fail(error.message, { errorCode: error.errorCode, statusCode: error.statusCode });
      }
      throw error;
    }
  },
});
