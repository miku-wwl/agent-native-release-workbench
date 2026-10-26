import { createHash } from "node:crypto";
import { z } from "zod";

export const releaseInputSchema = z
  .object({
    releaseId: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/),
    serviceName: z.string().trim().min(1).max(120),
    ciStatus: z.enum(["PASS", "FAIL", "UNKNOWN"]),
    failedTests: z.number().int().min(0).max(100_000),
    errorSummary: z.string().trim().max(2_000),
    evidenceReferences: z.array(z.string().trim().min(1).max(240)).max(20),
  })
  .strict();

export const decisionSchema = z.enum(["READY", "REVIEW_REQUIRED", "BLOCKED"]);
export const riskSchema = z.enum(["LOW", "MEDIUM", "HIGH"]);
export const releaseStatusSchema = z.enum([
  "PROPOSED",
  "APPROVED",
  "REJECTED",
  "EXECUTED",
]);

export const releasePlanSchema = z
  .object({
    schemaVersion: z.literal("release-plan/v1"),
    releaseId: releaseInputSchema.shape.releaseId,
    serviceName: releaseInputSchema.shape.serviceName,
    ciStatus: releaseInputSchema.shape.ciStatus,
    failedTests: releaseInputSchema.shape.failedTests,
    errorSummary: releaseInputSchema.shape.errorSummary,
    evidenceReferences: releaseInputSchema.shape.evidenceReferences,
    decision: decisionSchema,
    riskLevel: riskSchema,
    reasons: z.array(z.string().min(1).max(240)).max(10),
    recommendedActions: z.array(z.string().min(1).max(240)).max(10),
    localAction: z.literal("VERIFY_RELEASE_EVIDENCE"),
  })
  .strict();

export const executionResultSchema = z
  .object({
    releaseId: releaseInputSchema.shape.releaseId,
    outcome: z.literal("SUCCEEDED"),
    action: z.literal("LOCAL_REFERENCE_VALIDATION"),
    validatedReferences: releaseInputSchema.shape.evidenceReferences,
    completedAt: z.string().datetime(),
    deploymentPerformed: z.literal(false),
    externalEffect: z.literal("NONE"),
  })
  .strict();

export const auditEventTypeSchema = z.enum([
  "PROPOSED",
  "APPROVED",
  "REJECTED",
  "EXECUTED",
  "DENIED",
]);

export const releaseRecordSchema = z
  .object({
    id: z.string().uuid(),
    releaseId: releaseInputSchema.shape.releaseId,
    serviceName: releaseInputSchema.shape.serviceName,
    ciStatus: releaseInputSchema.shape.ciStatus,
    failedTests: releaseInputSchema.shape.failedTests,
    errorSummary: releaseInputSchema.shape.errorSummary,
    evidenceReferences: releaseInputSchema.shape.evidenceReferences,
    decision: decisionSchema,
    riskLevel: riskSchema,
    reasons: z.array(z.string()),
    recommendedActions: z.array(z.string()),
    plan: releasePlanSchema,
    status: releaseStatusSchema,
    planDigest: z.string().regex(/^[a-f0-9]{64}$/),
    approvalPlanDigest: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
    approvedBy: z.string().nullable(),
    executionResult: executionResultSchema.nullable(),
    version: z.number().int().nonnegative(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const auditEventSchema = z
  .object({
    id: z.string().uuid(),
    releaseId: releaseInputSchema.shape.releaseId,
    eventType: auditEventTypeSchema,
    actor: z.string().max(320),
    detail: z.string().max(240),
    createdAt: z.string().datetime(),
  })
  .strict();

export const releaseAnalysisOutputSchema = z
  .object({
    release: releaseRecordSchema,
    auditEvents: z.array(auditEventSchema),
  })
  .strict();

export const releaseListOutputSchema = z
  .object({
    releases: z.array(releaseRecordSchema),
    auditEvents: z.array(auditEventSchema),
  })
  .strict();

export const transitionOutputSchema = z
  .object({
    release: releaseRecordSchema,
    auditEvents: z.array(auditEventSchema),
  })
  .strict();

export type ReleaseInput = z.infer<typeof releaseInputSchema>;
export type ReleaseDecision = z.infer<typeof decisionSchema>;
export type RiskLevel = z.infer<typeof riskSchema>;
export type ReleaseStatus = z.infer<typeof releaseStatusSchema>;
export type ReleasePlan = z.infer<typeof releasePlanSchema>;
export type ExecutionResult = z.infer<typeof executionResultSchema>;
export type AuditEventType = z.infer<typeof auditEventTypeSchema>;
export type ReleaseRecord = z.infer<typeof releaseRecordSchema>;
export type AuditEvent = z.infer<typeof auditEventSchema>;

export function analyzeRelease(input: ReleaseInput) {
  const parsed = releaseInputSchema.parse(input);
  const reasons: string[] = [];
  let decision: ReleaseDecision;

  if (parsed.ciStatus !== "PASS" || parsed.failedTests > 0) {
    decision = "BLOCKED";
    if (parsed.ciStatus !== "PASS") {
      reasons.push(`CI status is ${parsed.ciStatus}.`);
    }
    if (parsed.failedTests > 0) {
      reasons.push(`${parsed.failedTests} failed test(s) were reported.`);
    }
  } else if (parsed.evidenceReferences.length === 0) {
    decision = "REVIEW_REQUIRED";
    reasons.push("No evidence references were provided.");
  } else {
    decision = "READY";
    reasons.push("CI passed, no failed tests were reported, and evidence is attached.");
  }

  const riskLevel: RiskLevel =
    decision === "BLOCKED" ? "HIGH" : decision === "REVIEW_REQUIRED" ? "MEDIUM" : "LOW";
  const recommendedActions =
    decision === "BLOCKED"
      ? ["Investigate the CI failures", "Keep the release blocked"]
      : decision === "REVIEW_REQUIRED"
        ? ["Attach traceable CI evidence", "Ask an owner to review the release"]
        : ["Review the attached evidence", "Approve the local verification when ready"];

  const plan = releasePlanSchema.parse({
    schemaVersion: "release-plan/v1",
    ...parsed,
    decision,
    riskLevel,
    reasons,
    recommendedActions,
    localAction: "VERIFY_RELEASE_EVIDENCE",
  });

  return { decision, riskLevel, reasons, recommendedActions, plan };
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  throw new TypeError("Plan contains a value outside the JSON contract.");
}

export function digestPlan(plan: unknown): string {
  return createHash("sha256").update(canonicalJson(plan), "utf8").digest("hex");
}

export function expectedPlanForRecord(record: {
  releaseId: string;
  serviceName: string;
  ciStatus: string;
  failedTests: number;
  errorSummary: string;
  evidenceReferences: string[];
}): ReleasePlan {
  const input = releaseInputSchema.parse({
    releaseId: record.releaseId,
    serviceName: record.serviceName,
    ciStatus: record.ciStatus,
    failedTests: record.failedTests,
    errorSummary: record.errorSummary,
    evidenceReferences: record.evidenceReferences,
  });
  return analyzeRelease(input).plan;
}

export function localVerificationResult(plan: ReleasePlan, completedAt = new Date()): ExecutionResult {
  return executionResultSchema.parse({
    releaseId: plan.releaseId,
    outcome: "SUCCEEDED",
    action: "LOCAL_REFERENCE_VALIDATION",
    validatedReferences: plan.evidenceReferences,
    completedAt: completedAt.toISOString(),
    deploymentPerformed: false,
    externalEffect: "NONE",
  });
}
