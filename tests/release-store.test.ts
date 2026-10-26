import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import * as schema from "../server/db/schema.js";
import { releaseWorkbenchMigrations } from "../server/db/migrations.js";
import type { ReleaseDb } from "../server/db/index.js";
import { releaseAnalysisOutputSchema } from "../server/release-domain.js";
import {
  approveRelease,
  analyzeAndSaveRelease,
  executeRelease,
  listReleaseWork,
  rejectRelease,
  ReleaseStoreError,
} from "../server/release-store.js";

const owner = "owner@example.test";
const input = (releaseId: string) => ({
  releaseId,
  serviceName: "payments-api",
  ciStatus: "PASS" as const,
  failedTests: 0,
  errorSummary: "Synthetic test fixture.",
  evidenceReferences: ["ci://run/test"],
});

describe("release persistence and approval guard (temporary in-memory PGlite)", () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle>;
  let releaseDb: ReleaseDb;

  beforeEach(async () => {
    client = new PGlite();
    db = drizzle(client, { schema });
    releaseDb = db as unknown as ReleaseDb;
    for (const migration of releaseWorkbenchMigrations) await client.exec(migration.sql);
  });

  afterEach(async () => {
    await client.close();
  });

  it("denies execution without approval and after rejection", async () => {
    await analyzeAndSaveRelease(releaseDb, input("release-unapproved"), owner);
    await expect(
      executeRelease(releaseDb, { releaseId: "release-unapproved", ownerEmail: owner, actor: owner }),
    ).rejects.toMatchObject({ errorCode: "approval_required" });

    await analyzeAndSaveRelease(releaseDb, input("release-rejected"), owner);
    await rejectRelease(releaseDb, { releaseId: "release-rejected", ownerEmail: owner, actor: owner });
    await expect(
      executeRelease(releaseDb, { releaseId: "release-rejected", ownerEmail: owner, actor: owner }),
    ).rejects.toMatchObject({ errorCode: "release_rejected" });

    const result = await listReleaseWork(releaseDb, owner);
    expect(result.auditEvents.map((event) => event.eventType)).toContain("DENIED");
    expect(result.auditEvents.map((event) => event.eventType)).toContain("REJECTED");
  });

  it("executes once after exact-plan approval and records a non-deployment result", async () => {
    const proposed = await analyzeAndSaveRelease(releaseDb, input("release-approved"), owner);
    expect(() => releaseAnalysisOutputSchema.parse(proposed)).not.toThrow();
    await approveRelease(releaseDb, { releaseId: "release-approved", ownerEmail: owner, actor: owner });
    const executed = await executeRelease(releaseDb, {
      releaseId: "release-approved",
      ownerEmail: owner,
      actor: owner,
    });
    expect(executed.release.status).toBe("EXECUTED");
    expect(executed.release.executionResult).toMatchObject({
      action: "LOCAL_REFERENCE_VALIDATION",
      validatedReferences: ["ci://run/test"],
      deploymentPerformed: false,
      externalEffect: "NONE",
    });
    await expect(
      executeRelease(releaseDb, { releaseId: "release-approved", ownerEmail: owner, actor: owner }),
    ).rejects.toMatchObject({ errorCode: "duplicate_execution" });

    const events = await listReleaseWork(releaseDb, owner);
    expect(events.auditEvents.map((event) => event.eventType)).toEqual(
      expect.arrayContaining(["PROPOSED", "APPROVED", "EXECUTED", "DENIED"]),
    );
  });

  it("denies invalid references and plans modified after approval", async () => {
    await expect(
      executeRelease(releaseDb, { releaseId: "missing", ownerEmail: owner, actor: owner }),
    ).rejects.toMatchObject({ errorCode: "release_not_found" });

    await analyzeAndSaveRelease(releaseDb, input("release-tampered"), owner);
    await approveRelease(releaseDb, { releaseId: "release-tampered", ownerEmail: owner, actor: owner });
    await db
      .update(schema.releaseRecords)
      .set({ plan: { schemaVersion: "release-plan/v1", releaseId: "release-tampered", serviceName: "changed" } as never })
      .where(eq(schema.releaseRecords.releaseId, "release-tampered"));

    await expect(
      executeRelease(releaseDb, { releaseId: "release-tampered", ownerEmail: owner, actor: owner }),
    ).rejects.toMatchObject({ errorCode: "plan_changed" });
    await expect(
      approveRelease(releaseDb, { releaseId: "release-tampered", ownerEmail: owner, actor: owner }),
    ).rejects.toBeInstanceOf(ReleaseStoreError);
  });

  it("scopes stored releases and audit history to the owner", async () => {
    await analyzeAndSaveRelease(releaseDb, input("release-owner"), owner);
    expect(await listReleaseWork(releaseDb, "another@example.test")).toEqual({
      releases: [],
      auditEvents: [],
    });
  });
});
