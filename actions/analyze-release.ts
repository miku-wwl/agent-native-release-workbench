import { defineAction, fail } from "@agent-native/core/action";

import { currentOwner } from "../server/action-auth.js";
import { getDb } from "../server/db/index.js";
import {
  releaseAnalysisOutputSchema,
  releaseInputSchema,
} from "../server/release-domain.js";
import { analyzeAndSaveRelease, ReleaseStoreError } from "../server/release-store.js";

export default defineAction({
  description:
    "Analyze supplied CI facts deterministically, save a release proposal, and return its risk, evidence, plan, and audit event.",
  schema: releaseInputSchema,
  outputSchema: releaseAnalysisOutputSchema,
  outputErrorStrategy: "strict",
  requiresAuth: false,
  audit: { recordInputs: false },
  run: async (input, ctx) => {
    try {
      return await analyzeAndSaveRelease(getDb(), input, currentOwner(ctx));
    } catch (error) {
      if (error instanceof ReleaseStoreError) {
        fail(error.message, { errorCode: error.errorCode, statusCode: error.statusCode });
      }
      throw error;
    }
  },
});
