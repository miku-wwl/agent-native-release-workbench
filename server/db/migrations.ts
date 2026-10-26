import type { MigrationEntry } from "@agent-native/core/db";

export const releaseWorkbenchMigrations: MigrationEntry[] = [
  {
    version: 1,
    name: "release-records-and-audit-v1",
    sql: `
      CREATE TABLE IF NOT EXISTS release_records (
        id TEXT PRIMARY KEY,
        owner_email TEXT NOT NULL,
        release_id TEXT NOT NULL,
        service_name TEXT NOT NULL,
        ci_status TEXT NOT NULL CHECK (ci_status IN ('PASS', 'FAIL', 'UNKNOWN')),
        failed_tests INTEGER NOT NULL CHECK (failed_tests >= 0),
        error_summary TEXT NOT NULL,
        evidence_references JSONB NOT NULL,
        decision TEXT NOT NULL CHECK (decision IN ('READY', 'REVIEW_REQUIRED', 'BLOCKED')),
        risk_level TEXT NOT NULL CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH')),
        reasons JSONB NOT NULL,
        recommended_actions JSONB NOT NULL,
        plan JSONB NOT NULL,
        plan_digest TEXT NOT NULL CHECK (plan_digest ~ '^[a-f0-9]{64}$'),
        approval_plan_digest TEXT CHECK (approval_plan_digest IS NULL OR approval_plan_digest ~ '^[a-f0-9]{64}$'),
        status TEXT NOT NULL CHECK (status IN ('PROPOSED', 'APPROVED', 'REJECTED', 'EXECUTED')),
        approved_by TEXT,
        execution_result JSONB,
        version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (owner_email, release_id)
      );
      CREATE INDEX IF NOT EXISTS release_records_owner_created_idx
        ON release_records (owner_email, created_at DESC);
      CREATE TABLE IF NOT EXISTS release_audit_events (
        id TEXT PRIMARY KEY,
        owner_email TEXT NOT NULL,
        release_id TEXT NOT NULL,
        event_type TEXT NOT NULL CHECK (event_type IN ('PROPOSED', 'APPROVED', 'REJECTED', 'EXECUTED', 'DENIED')),
        actor TEXT NOT NULL,
        detail TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS release_audit_owner_release_created_idx
        ON release_audit_events (owner_email, release_id, created_at);
    `,
  },
];
