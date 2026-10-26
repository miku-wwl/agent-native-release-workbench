import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";

import type { ReleaseDb } from "./db/index.js";
import { releaseAuditEvents, releaseRecords } from "./db/schema.js";
import {
  analyzeRelease,
  auditEventSchema,
  canonicalJson,
  digestPlan,
  expectedPlanForRecord,
  localVerificationResult,
  releaseInputSchema,
  releaseRecordSchema,
  releaseStatusSchema,
  type AuditEvent,
  type AuditEventType,
  type ReleaseInput,
  type ReleaseRecord,
  type ReleaseStatus,
} from "./release-domain.js";

export class ReleaseStoreError extends Error {
  constructor(
    message: string,
    readonly errorCode: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = "ReleaseStoreError";
  }
}

function recordOutput(row: typeof releaseRecords.$inferSelect): ReleaseRecord {
  return releaseRecordSchema.parse({
    id: row.id,
    releaseId: row.releaseId,
    serviceName: row.serviceName,
    ciStatus: row.ciStatus,
    failedTests: row.failedTests,
    errorSummary: row.errorSummary,
    evidenceReferences: row.evidenceReferences,
    decision: row.decision,
    riskLevel: row.riskLevel,
    reasons: row.reasons,
    recommendedActions: row.recommendedActions,
    plan: row.plan,
    status: row.status,
    planDigest: row.planDigest,
    approvalPlanDigest: row.approvalPlanDigest,
    approvedBy: row.approvedBy,
    executionResult: row.executionResult,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

function auditOutput(row: typeof releaseAuditEvents.$inferSelect): AuditEvent {
  return auditEventSchema.parse({
    id: row.id,
    releaseId: row.releaseId,
    eventType: row.eventType,
    actor: row.actor,
    detail: row.detail,
    createdAt: row.createdAt.toISOString(),
  });
}

async function writeAudit(
  db: ReleaseDb,
  event: {
    ownerEmail: string;
    releaseId: string;
    eventType: AuditEventType;
    actor: string;
    detail: string;
  },
) {
  const [row] = await db
    .insert(releaseAuditEvents)
    .values({ id: randomUUID(), ...event })
    .returning();
  return auditOutput(row);
}

export async function listReleaseWork(db: ReleaseDb, ownerEmail: string) {
  const rows = await db
    .select()
    .from(releaseRecords)
    .where(eq(releaseRecords.ownerEmail, ownerEmail))
    .orderBy(desc(releaseRecords.createdAt))
    .limit(50);
  if (rows.length === 0) return { releases: [], auditEvents: [] };

  const events = await db
    .select()
    .from(releaseAuditEvents)
    .where(
      and(
        eq(releaseAuditEvents.ownerEmail, ownerEmail),
        inArray(
          releaseAuditEvents.releaseId,
          rows.map((row) => row.releaseId),
        ),
      ),
    )
    .orderBy(releaseAuditEvents.createdAt);

  return {
    releases: rows.map(recordOutput),
    auditEvents: events.map(auditOutput),
  };
}

export async function analyzeAndSaveRelease(
  db: ReleaseDb,
  inputValue: ReleaseInput,
  ownerEmail: string,
) {
  const input = releaseInputSchema.parse(inputValue);
  const result = analyzeRelease(input);
  const planDigest = digestPlan(result.plan);

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: releaseRecords.id })
      .from(releaseRecords)
      .where(
        and(
          eq(releaseRecords.ownerEmail, ownerEmail),
          eq(releaseRecords.releaseId, input.releaseId),
        ),
      )
      .limit(1);
    if (existing) {
      await tx.insert(releaseAuditEvents).values({
        id: randomUUID(),
        ownerEmail,
        releaseId: input.releaseId,
        eventType: "DENIED",
        actor: ownerEmail,
        detail: "Duplicate release ID was refused.",
      });
      return { denied: true as const };
    }

    const [row] = await tx
      .insert(releaseRecords)
      .values({
        id: randomUUID(),
        ownerEmail,
        ...input,
        decision: result.decision,
        riskLevel: result.riskLevel,
        reasons: result.reasons,
        recommendedActions: result.recommendedActions,
        plan: result.plan,
        planDigest,
        status: "PROPOSED",
        approvalPlanDigest: null,
        approvedBy: null,
        executionResult: null,
        version: 0,
      })
      .returning();
    await tx.insert(releaseAuditEvents).values({
      id: randomUUID(),
      ownerEmail,
      releaseId: input.releaseId,
      eventType: "PROPOSED",
      actor: ownerEmail,
      detail: "Deterministic release analysis saved as a proposal.",
    });
    const [createdEvent] = await tx
      .select()
      .from(releaseAuditEvents)
      .where(
        and(
          eq(releaseAuditEvents.ownerEmail, ownerEmail),
          eq(releaseAuditEvents.releaseId, input.releaseId),
        ),
      )
      .orderBy(desc(releaseAuditEvents.createdAt))
      .limit(1);
    return {
      denied: false as const,
      release: recordOutput(row),
      auditEvents: createdEvent ? [auditOutput(createdEvent)] : [],
    };
  }).then((result) => {
    if (result.denied) {
      throw new ReleaseStoreError(
        "That release ID already exists in your workbench.",
        "duplicate_release",
        409,
      );
    }
    return { release: result.release, auditEvents: result.auditEvents };
  });
}

function bindingIsValid(row: typeof releaseRecords.$inferSelect): boolean {
  try {
    const expectedPlan = expectedPlanForRecord(row);
    const expectedDigest = digestPlan(expectedPlan);
    const storedDigest = digestPlan(row.plan);
    return (
      expectedDigest === row.planDigest &&
      storedDigest === row.planDigest &&
      row.decision === expectedPlan.decision &&
      row.riskLevel === expectedPlan.riskLevel &&
      canonicalJson(row.reasons) === canonicalJson(expectedPlan.reasons) &&
      canonicalJson(row.recommendedActions) === canonicalJson(expectedPlan.recommendedActions) &&
      row.planDigest.length === 64
    );
  } catch {
    return false;
  }
}

type TransitionResult =
  | { denied: true; errorCode: string; statusCode: number; message: string }
  | { denied: false; release: ReleaseRecord; auditEvents: AuditEvent[] };

async function transitionRelease(
  db: ReleaseDb,
  input: { releaseId: string; ownerEmail: string; actor: string },
  transition: "approve" | "reject" | "execute",
): Promise<TransitionResult> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(releaseRecords)
      .where(
        and(
          eq(releaseRecords.ownerEmail, input.ownerEmail),
          eq(releaseRecords.releaseId, input.releaseId),
        ),
      )
      .limit(1);

    const deny = async (message: string, errorCode: string, statusCode: number) => {
      const [event] = await tx
        .insert(releaseAuditEvents)
        .values({
          id: randomUUID(),
          ownerEmail: input.ownerEmail,
          releaseId: input.releaseId,
          eventType: "DENIED",
          actor: input.actor,
          detail:
            errorCode === "release_not_found"
              ? "An operation referenced a missing release."
              : `A ${transition} request was denied: ${message}`,
        })
        .returning();
      return {
        denied: true as const,
        errorCode,
        statusCode,
        message,
        event: auditOutput(event),
      };
    };

    if (!row) return deny("Release not found.", "release_not_found", 404);

    const currentStatus = releaseStatusSchema.parse(row.status);
    const validBinding = bindingIsValid(row);
    if (transition === "approve") {
      if (currentStatus !== "PROPOSED") {
        return deny("Only a proposed release can be approved.", "invalid_transition", 409);
      }
      if (row.decision === "BLOCKED") {
        return deny("A blocked release cannot be approved.", "release_blocked", 409);
      }
      if (!validBinding) {
        return deny("The saved plan no longer matches the proposed release.", "plan_changed", 409);
      }
    } else if (transition === "reject") {
      if (currentStatus !== "PROPOSED") {
        return deny("Only a proposed release can be rejected.", "invalid_transition", 409);
      }
    } else {
      if (currentStatus === "EXECUTED") {
        return deny("This release has already been executed.", "duplicate_execution", 409);
      }
      if (currentStatus === "REJECTED") {
        return deny("A rejected release cannot execute.", "release_rejected", 409);
      }
      if (currentStatus !== "APPROVED") {
        return deny("Approve this release before running local verification.", "approval_required", 409);
      }
      if (!validBinding || row.approvalPlanDigest !== row.planDigest) {
        return deny("The approved plan changed; approve a fresh proposal.", "plan_changed", 409);
      }
    }

    const nextStatus: ReleaseStatus =
      transition === "approve"
        ? "APPROVED"
        : transition === "reject"
          ? "REJECTED"
          : "EXECUTED";
    const eventType: AuditEventType =
      transition === "approve"
        ? "APPROVED"
        : transition === "reject"
          ? "REJECTED"
          : "EXECUTED";
    const [updated] = await tx
      .update(releaseRecords)
      .set({
        status: nextStatus,
        approvalPlanDigest: transition === "approve" ? row.planDigest : row.approvalPlanDigest,
        approvedBy: transition === "approve" ? input.actor : row.approvedBy,
        executionResult:
          transition === "execute"
            ? localVerificationResult(row.plan)
            : row.executionResult,
        version: row.version + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(releaseRecords.id, row.id),
          eq(releaseRecords.status, currentStatus),
          eq(releaseRecords.version, row.version),
        ),
      )
      .returning();

    if (!updated) {
      return deny("The release changed during this request.", "stale_release", 409);
    }

    const [event] = await tx
      .insert(releaseAuditEvents)
      .values({
        id: randomUUID(),
        ownerEmail: input.ownerEmail,
        releaseId: input.releaseId,
        eventType,
        actor: input.actor,
        detail:
          transition === "approve"
            ? "The exact saved plan was approved."
            : transition === "reject"
              ? "The proposal was rejected by its owner."
              : "Local reference syntax validation completed; no external check or deployment was performed.",
      })
      .returning();

    return {
      denied: false as const,
      release: recordOutput(updated),
      auditEvents: [auditOutput(event)],
    };
  });
}

export async function approveRelease(db: ReleaseDb, input: { releaseId: string; ownerEmail: string; actor: string }) {
  return settleTransition(await transitionRelease(db, input, "approve"));
}

export async function rejectRelease(db: ReleaseDb, input: { releaseId: string; ownerEmail: string; actor: string }) {
  return settleTransition(await transitionRelease(db, input, "reject"));
}

export async function executeRelease(db: ReleaseDb, input: { releaseId: string; ownerEmail: string; actor: string }) {
  return settleTransition(await transitionRelease(db, input, "execute"));
}

function settleTransition(result: TransitionResult) {
  if (result.denied) {
    throw new ReleaseStoreError(result.message, result.errorCode, result.statusCode);
  }
  return { release: result.release, auditEvents: result.auditEvents };
}
