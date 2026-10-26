import { defineAction, fail } from "@agent-native/core/action";
import { z } from "zod";

import { currentOwner, requireInteractiveApproval } from "../server/action-auth.js";
import { getDb } from "../server/db/index.js";
import { transitionOutputSchema } from "../server/release-domain.js";
import { executeRelease, ReleaseStoreError } from "../server/release-store.js";

const schema = z.object({ releaseId: z.string().trim().min(1).max(80) }).strict();

export default defineAction({
  description:
    "Run bounded local syntax validation of supplied evidence-reference strings only after the saved plan is approved; never fetches evidence or deploys.",
  schema,
  outputSchema: transitionOutputSchema,
  outputErrorStrategy: "strict",
  requiresAuth: true,
  needsApproval: true,
  authorize: requireInteractiveApproval,
  timeoutMs: 5_000,
  audit: { recordInputs: false },
  run: async ({ releaseId }, ctx) => {
    const actor = currentOwner(ctx);
    try {
      return await executeRelease(getDb(), { releaseId, ownerEmail: actor, actor });
    } catch (error) {
      if (error instanceof ReleaseStoreError) {
        fail(error.message, { errorCode: error.errorCode, statusCode: error.statusCode });
      }
      throw error;
    }
  },
});
