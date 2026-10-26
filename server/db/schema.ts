import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import type {
  AuditEventType,
  ExecutionResult,
  ReleaseDecision,
  ReleasePlan,
  ReleaseStatus,
  RiskLevel,
} from "../release-domain.js";

export const releaseRecords = pgTable(
  "release_records",
  {
    id: text("id").primaryKey(),
    ownerEmail: text("owner_email").notNull(),
    releaseId: text("release_id").notNull(),
    serviceName: text("service_name").notNull(),
    ciStatus: text("ci_status").notNull(),
    failedTests: integer("failed_tests").notNull(),
    errorSummary: text("error_summary").notNull(),
    evidenceReferences: jsonb("evidence_references").$type<string[]>().notNull(),
    decision: text("decision").$type<ReleaseDecision>().notNull(),
    riskLevel: text("risk_level").$type<RiskLevel>().notNull(),
    reasons: jsonb("reasons").$type<string[]>().notNull(),
    recommendedActions: jsonb("recommended_actions").$type<string[]>().notNull(),
    plan: jsonb("plan").$type<ReleasePlan>().notNull(),
    planDigest: text("plan_digest").notNull(),
    approvalPlanDigest: text("approval_plan_digest"),
    status: text("status").$type<ReleaseStatus>().notNull(),
    approvedBy: text("approved_by"),
    executionResult: jsonb("execution_result").$type<ExecutionResult | null>(),
    version: integer("version").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    ownerReleaseUnique: uniqueIndex("release_records_owner_release_unique").on(
      table.ownerEmail,
      table.releaseId,
    ),
    ownerCreatedIndex: index("release_records_owner_created_idx").on(
      table.ownerEmail,
      table.createdAt,
    ),
  }),
);

export const releaseAuditEvents = pgTable(
  "release_audit_events",
  {
    id: text("id").primaryKey(),
    ownerEmail: text("owner_email").notNull(),
    releaseId: text("release_id").notNull(),
    eventType: text("event_type").$type<AuditEventType>().notNull(),
    actor: text("actor").notNull(),
    detail: text("detail").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    ownerReleaseCreatedIndex: index("release_audit_owner_release_created_idx").on(
      table.ownerEmail,
      table.releaseId,
      table.createdAt,
    ),
  }),
);
