import { describe, expect, it } from "vitest";

import {
  analyzeRelease,
  digestPlan,
  releaseInputSchema,
} from "../server/release-domain.js";

const validInput = {
  releaseId: "release-42",
  serviceName: "payments-api",
  ciStatus: "PASS" as const,
  failedTests: 0,
  errorSummary: "No CI errors reported.",
  evidenceReferences: ["ci://run/42"],
};

describe("deterministic release analysis", () => {
  it("returns READY and LOW for passing CI with evidence", () => {
    const result = analyzeRelease(validInput);
    expect(result.decision).toBe("READY");
    expect(result.riskLevel).toBe("LOW");
    expect(result.plan.evidenceReferences).toEqual(["ci://run/42"]);
  });

  it("blocks failed CI and reports high risk", () => {
    const result = analyzeRelease({ ...validInput, ciStatus: "FAIL", failedTests: 2 });
    expect(result.decision).toBe("BLOCKED");
    expect(result.riskLevel).toBe("HIGH");
  });

  it("requires review when passing CI has no evidence", () => {
    const result = analyzeRelease({ ...validInput, evidenceReferences: [] });
    expect(result.decision).toBe("REVIEW_REQUIRED");
    expect(result.riskLevel).toBe("MEDIUM");
  });

  it("rejects invalid schemas and extra fields", () => {
    expect(releaseInputSchema.safeParse({ ...validInput, failedTests: -1 }).success).toBe(false);
    expect(releaseInputSchema.safeParse({ ...validInput, approved: true }).success).toBe(false);
  });

  it("produces a stable canonical digest and binds material plan changes", () => {
    const first = analyzeRelease(validInput).plan;
    const reordered = Object.fromEntries(Object.entries(first).reverse());
    const changed = { ...first, serviceName: "other-api" };
    expect(digestPlan(reordered)).toBe(digestPlan(first));
    expect(digestPlan(changed)).not.toBe(digestPlan(first));
  });
});
