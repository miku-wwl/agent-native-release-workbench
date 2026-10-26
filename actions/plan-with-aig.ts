import { defineAction, fail } from "@agent-native/core/action";
import { z } from "zod";

import { currentOwner } from "../server/action-auth.js";
import { AigClientError, aigPlanOutputSchema, requestAigPlan } from "../server/aig-client.js";

export default defineAction({
  description:
    "Ask the isolated AIG v0.3.0 planner for one validated, read-only service-demo inspection plan; this does not execute the plan.",
  schema: z
    .object({
      intent: z.string().trim().min(1).max(8_192).describe("Bounded natural-language planning intent"),
    })
    .strict(),
  outputSchema: aigPlanOutputSchema,
  outputErrorStrategy: "strict",
  requiresAuth: false,
  readOnly: true,
  timeoutMs: 32_000,
  run: async ({ intent }, ctx) => {
    currentOwner(ctx);
    try {
      return await requestAigPlan(intent, { signal: ctx?.signal });
    } catch (error) {
      if (error instanceof AigClientError) {
        fail(error.message, { errorCode: error.errorCode, statusCode: error.statusCode });
      }
      throw error;
    }
  },
});
