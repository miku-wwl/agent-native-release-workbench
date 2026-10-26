import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { PGlite } from "@electric-sql/pglite";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../../server/db/schema.js";
import { aigPlanOutputSchema } from "../../server/aig-client.js";
import { analyzeRelease, digestPlan, releaseAnalysisOutputSchema, releaseListOutputSchema, transitionOutputSchema } from "../../server/release-domain.js";

// This is an authenticated HTTP integration test with synthetic consent.
// It does not drive a browser and must never be reported as React UI E2E.
const directory = path.resolve("data/phase05/integration", new Date().toISOString().replace(/[:.]/g, "-"));
await mkdir(directory, { recursive: true });
const checks: { name: string; status: "PASS"; detail?: unknown }[] = [];
const pass = (name: string, detail?: unknown) => { checks.push({ name, status: "PASS", detail }); console.log(`PASS ${name}`); };
async function availablePort(preferred: number) {
  const probe = createServer();
  await new Promise<void>((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(preferred, "127.0.0.1", () => resolve());
  });
  const address = probe.address();
  assert(address && typeof address === "object");
  const port = address.port;
  await new Promise<void>((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  return port;
}
const appPort = await availablePort(Number(process.env.PHASE05_PORT ?? 8095)).catch(() => availablePort(0)); // guard:allow-env-credential — non-secret local test port.
const aigPort = await availablePort(8795).catch(() => availablePort(0));
const origin = `http://127.0.0.1:${appPort}`;
const aigOrigin = `http://127.0.0.1:${aigPort}`;
console.log(`Evidence: ${path.relative(process.cwd(), directory)}; workbench: ${origin}/home; AIG: ${aigOrigin}`);
const dbDirectory = path.join(directory, "workbench-db");
const aigDb = path.join(directory, "aig.sqlite3");
const env = {
  ...process.env,
  DATABASE_URL: `pglite:${dbDirectory.replace(/\\/g, "/")}`,
  AIG_API_BASE_URL: aigOrigin,
  NODE_ENV: "development",
  AUTH_DISABLED: "false",
  BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
  AGENT_NATIVE_PHASE05_SHUTDOWN_KEY: randomBytes(32).toString("hex"),
  BETTER_AUTH_URL: origin,
  APP_URL: origin,
  PHASE05_PORT: String(appPort),
  AGENT_NATIVE_NO_OPEN: "1",
  NITRO_DEV_RUNNER: "node-process",
};
const serverNode = process.platform === "win32" && Number(process.versions.node.split(".")[0]) >= 26
  ? path.resolve("data/phase05/node24/node_modules/node-win-x64/bin/node.exe")
  : process.execPath;
await access(serverNode);
const children = new Set<ChildProcess>();
const logs: ReturnType<typeof createWriteStream>[] = [];
const childLogs = new Map<ChildProcess, ReturnType<typeof createWriteStream>>();
function launch(command: string, args: string[], childEnv: NodeJS.ProcessEnv, name: string, ipc = false) {
  const log = createWriteStream(path.join(directory, `${name}.log`), { flags: "a" });
  logs.push(log);
  const child = spawn(command, args, { cwd: process.cwd(), env: childEnv, shell: false, stdio: ipc ? ["ignore", "pipe", "pipe", "ipc"] : ["ignore", "pipe", "pipe"] });
  children.add(child);
  childLogs.set(child, log);
  child.stdout?.pipe(log, { end: false });
  child.stderr?.pipe(log, { end: false });
  child.once("close", () => children.delete(child));
  return child;
}
async function waitFor(url: string, child: ChildProcess, timeoutMs = 90_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    assert.equal(child.exitCode, null, `Owned server exited before ready; see ignored logs in ${path.relative(process.cwd(), directory)}`);
    try { await fetch(url, { signal: AbortSignal.timeout(10_000), redirect: "manual" }); return; } catch { await delay(750); }
  }
  throw new Error(`Owned server readiness timed out: ${url}`);
}
async function stop(child: ChildProcess, graceful: boolean) {
  if (child.exitCode !== null || !children.has(child)) return;
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => child.once("close", (code, signal) => resolve({ code, signal })));
  if (graceful && child.connected) child.send("shutdown"); else child.kill("SIGTERM");
  const result = await Promise.race([exited, delay(25_000, null, { ref: false })]);
  if (!result) { child.kill("SIGKILL"); await exited; throw new Error("Owned server did not stop within budget."); }
  if (graceful) assert.equal(result.code, 0, "Workbench must stop cleanly for persistence evidence.");
  await new Promise<void>((resolve, reject) => childLogs.get(child)!.write("", (error) => error ? reject(error) : resolve()));
}
let app: ChildProcess | undefined;
let aig: ChildProcess | undefined;
const cookies = new Map<string, string>();
async function request(endpoint: string, method = "GET", body?: unknown, mode: "frontend" | "http" | "unproven" = "frontend") {
  const headers: Record<string, string> = { origin, "content-type": "application/json" };
  if (mode !== "http") headers["x-agent-native-frontend"] = "1";
  const pairs = [...cookies].filter(([name]) => mode !== "unproven" || name !== "agent-native-ui-capability");
  if (pairs.length) headers.cookie = pairs.map(([name, value]) => `${name}=${value}`).join("; ");
  const response = await fetch(`${origin}${endpoint}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(40_000), redirect: "manual" });
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(";", 1)[0];
    const split = pair.indexOf("=");
    cookies.set(pair.slice(0, split), pair.slice(split + 1));
  }
  const text = await response.text();
  let value: any;
  try { value = JSON.parse(text); } catch { value = null; }
  return { status: response.status, value, text };
}
async function action(name: string, body: unknown = {}, mode: "frontend" | "http" | "unproven" = "frontend") {
  return request(`/_agent-native/actions/${name}`, name === "list-releases" ? "GET" : "POST", name === "list-releases" ? undefined : body, mode);
}
const fixture = (releaseId: string) => ({ releaseId, serviceName: "payments-api", ciStatus: "PASS" as const, failedTests: 0, errorSummary: "Synthetic Phase 0.5 integration fixture.", evidenceReferences: ["ci://phase05/run/42", "tests://phase05/suite/42"] });
async function create(input: ReturnType<typeof fixture> | { ciStatus: "FAIL"; failedTests: number; releaseId: string; serviceName: string; errorSummary: string; evidenceReferences: string[] }) {
  const response = await action("analyze-release", input);
  assert.equal(response.status, 200, response.text);
  return releaseAnalysisOutputSchema.parse(response.value).release;
}
async function transition(name: string, releaseId: string) {
  const response = await action(name, { releaseId });
  assert.equal(response.status, 200, response.text);
  return transitionOutputSchema.parse(response.value).release;
}
async function denied(name: string, releaseId: string, code: string, status = 409) {
  const response = await action(name, { releaseId });
  assert.equal(response.status, status, response.text);
  assert.equal(response.value.errorCode, code, response.text);
}

try {
  const aigProject = path.resolve(process.env.AIG_PROJECT_DIR ?? "../agentic-intent-gate"); // guard:allow-env-credential — local read-only source path, never a credential.
  const python = path.join(aigProject, ".venv", "Scripts", "python.exe");
  await access(python);
  aig = launch(python, ["-m", "agentic_intent_gate.main"], {
    ...process.env,
    PYTHONDONTWRITEBYTECODE: "1",
    AIG_DB_PATH: aigDb,
    API_HOST: "127.0.0.1",
    API_PORT: String(aigPort),
    AIG_LLM_PROVIDER: "ollama",
    AIG_LLM_MODEL: "phi4-mini:latest",
    LOCAL_LLM_BASE_URL: "http://127.0.0.1:11434/v1",
    LOCAL_LLM_MODEL: "phi4-mini:latest",
    MODEL_TIMEOUT_SECONDS: "28",
  }, "aig");
  await waitFor(`${aigOrigin}/api/plans`, aig);
  const aigHashBefore = createHash("sha256").update(await readFile(aigDb)).digest("hex");
  app = launch(serverNode, ["verification/phase05/dev-server.mjs"], env, "workbench-first", true);
  await waitFor(`${origin}/`, app);
  const login = await request("/_agent-native/auth/local-dev", "POST");
  assert.equal(login.status, 200, "Synthetic local dev session must use the supported auth endpoint.");
  const page = await request("/home");
  assert.equal(page.status, 200);
  assert(page.text.includes("Agent Native Release Workbench"), "The app-specific document title must be served.");
  assert(page.text.includes("/app/routes/home.tsx"), "The actual home route module must be served.");
  pass("Authenticated workbench route envelope (supplemental; hydration/UI unverified)");
  assert.equal((await action("verify-integration")).status, 404, "Verification harnesses must not become app Actions.");
  pass("Verification harness is absent from HTTP Action surface");
  const ready = await create(fixture("phase05-ready"));
  assert.equal(ready.decision, "READY");
  assert.equal(ready.riskLevel, "LOW");
  const unproven = await action("approve-release", { releaseId: ready.releaseId }, "unproven");
  assert.equal(unproven.status, 403);
  const direct = await action("approve-release", { releaseId: ready.releaseId }, "http");
  assert([403, 409].includes(direct.status));
  pass("Raw HTTP and unproven frontend marker cannot approve");
  const capability = await request("/_agent-native/ui-capability");
  assert.equal(capability.status, 200);
  assert.equal(capability.value.ok, true);
  await create(fixture("phase05-unapproved"));
  await create(fixture("phase05-rejected"));
  await create(fixture("phase05-tampered"));
  const blocked = await create({ ...fixture("phase05-blocked"), ciStatus: "FAIL", failedTests: 3 });
  assert.equal(blocked.decision, "BLOCKED");
  assert.equal(blocked.riskLevel, "HIGH");
  await denied("execute-release", "phase05-unapproved", "approval_required");
  await denied("approve-release", "phase05-blocked", "release_blocked");
  const approved = await transition("approve-release", ready.releaseId);
  await transition("approve-release", "phase05-tampered");
  await transition("reject-release", "phase05-rejected");
  await transition("reject-release", "phase05-blocked");
  assert.equal(approved.approvalPlanDigest, ready.planDigest);
  pass("Safe/unsafe proposals and persisted exact-plan approval/rejection");

  const sharedFile = path.join(directory, "shared-cli.json");
  await writeFile(sharedFile, JSON.stringify(fixture("phase05-ready")));
  for (let index = 1; index <= 3; index++) {
    const cli = spawnSync(process.execPath, ["cli/action.mjs", "analyze-release", "--json", "--input-file", sharedFile], { env: { ...env, AGENT_USER_EMAIL: `phase05-cli-${index}@example.test` }, shell: false, encoding: "utf8", timeout: 60_000 });
    assert.equal(cli.status, 0, cli.stderr);
    const cliRelease = releaseAnalysisOutputSchema.parse(JSON.parse(cli.stdout)).release;
    assert.equal(cliRelease.planDigest, ready.planDigest);
    assert.equal(cliRelease.decision, ready.decision);
  }
  pass("Three forwarded CLI invocations match the authenticated HTTP plan/digest and exit 0");
  const before = releaseListOutputSchema.parse((await action("list-releases")).value);
  const approvalEvents = before.auditEvents.filter((event) => event.releaseId === ready.releaseId);
  await stop(app, true);
  app = undefined;
  assert((await readFile(path.join(directory, "workbench-first.log"), "utf8")).includes("[workbench-db] Database connections closed."), "The application database close hook must finish before reopening PGlite.");
  pass("First application process stopped cleanly");

  const client = new PGlite(dbDirectory);
  try {
    const changed = fixture("phase05-tampered");
    changed.errorSummary = "Synthetic changed input after approval.";
    const plan = analyzeRelease(changed).plan;
    const db = drizzle(client, { schema });
    const updated = await db.update(schema.releaseRecords).set({ errorSummary: changed.errorSummary, plan, planDigest: digestPlan(plan) }).where(and(eq(schema.releaseRecords.ownerEmail, "dev@local.test"), eq(schema.releaseRecords.releaseId, changed.releaseId))).returning({ id: schema.releaseRecords.id });
    assert.equal(updated.length, 1);
  } finally { await client.close(); }

  app = launch(serverNode, ["verification/phase05/dev-server.mjs"], env, "workbench-restart", true);
  await waitFor(`${origin}/`, app);
  const afterResponse = await action("list-releases");
  assert.equal(afterResponse.status, 200);
  const after = releaseListOutputSchema.parse(afterResponse.value);
  const recovered = after.releases.find((release) => release.releaseId === ready.releaseId);
  assert(recovered);
  assert.equal(recovered.status, "APPROVED");
  assert.equal(recovered.planDigest, ready.planDigest);
  assert.equal(recovered.approvalPlanDigest, ready.planDigest);
  assert.deepEqual(after.auditEvents.filter((event) => event.releaseId === ready.releaseId), approvalEvents);
  pass("PGlite proposal, approval, SHA-256 digest and audit survive process restart", { planDigest: ready.planDigest, approvalEvents: approvalEvents.length });
  assert.equal((await request("/_agent-native/ui-capability")).status, 200);
  const executed = await transition("execute-release", ready.releaseId);
  assert.equal(executed.status, "EXECUTED");
  assert.equal(executed.executionResult?.deploymentPerformed, false);
  assert.equal(executed.executionResult?.externalEffect, "NONE");
  await denied("execute-release", ready.releaseId, "duplicate_execution");
  await denied("execute-release", "phase05-rejected", "release_rejected");
  await denied("execute-release", "phase05-unapproved", "approval_required");
  await denied("execute-release", "phase05-missing", "release_not_found", 404);
  await denied("execute-release", "phase05-tampered", "plan_changed");
  pass("Approved simulation, duplicate/rejected/unapproved/missing/changed-plan denials");

  const live = await action("plan-with-aig", { intent: "Read the service-demo record" });
  assert.equal(live.status, 200, live.text);
  const plan = aigPlanOutputSchema.parse(live.value);
  assert.equal(plan.plan.steps.length, 1);
  assert.equal(plan.plan.target, "service-demo");
  const aigHashAfter = createHash("sha256").update(await readFile(aigDb)).digest("hex");
  assert.equal(aigHashAfter, aigHashBefore, "Planning must not persist an execution or mutate the isolated AIG DB.");
  pass("Real Workbench Action -> TypeScript adapter -> isolated AIG -> Ollama -> PlanValidated", { source: plan.source, riskClass: plan.plan.risk_class, tool: plan.plan.steps[0].tool_name, isolatedDatabaseHashUnchanged: true });
  await stop(aig, false);
  aig = undefined;
  const unavailableStart = Date.now();
  const unavailable = await action("plan-with-aig", { intent: "Read the service-demo record" });
  assert.equal(unavailable.status, 503, unavailable.text);
  assert.equal(unavailable.value.errorCode, "aig_unavailable");
  assert(Date.now() - unavailableStart < 5_000);
  const final = releaseListOutputSchema.parse((await action("list-releases")).value);
  assert.equal(final.auditEvents.filter((event) => event.eventType === "EXECUTED").length, 1);
  pass("Owned AIG stop yields bounded connection failure and no accidental execution");
  await stop(app, true);
  app = undefined;
  assert((await readFile(path.join(directory, "workbench-restart.log"), "utf8")).includes("[workbench-db] Database connections closed."));
  pass("Restarted application stopped cleanly");
  const result = { status: "PASS", mechanism: "authenticated HTTP integration with synthetic fixture consent", browserUiE2E: "BLOCKED", origin, aigOrigin, checks, evidence: path.relative(process.cwd(), directory) };
  await writeFile(path.join(directory, "result.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  await writeFile(path.join(directory, "result.json"), JSON.stringify({ status: "FAIL", checks, error: error instanceof Error ? error.message : String(error) }, null, 2));
  throw error;
} finally {
  for (const child of [...children]) await stop(child, Boolean(child.connected)).catch(() => { child.kill("SIGKILL"); });
  for (const log of logs) log.end();
}
