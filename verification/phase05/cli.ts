import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { releaseAnalysisOutputSchema, releaseListOutputSchema } from "../../server/release-domain.js";

const runId = new Date().toISOString().replace(/[:.]/g, "-");
const directory = path.resolve("data/phase05/cli", runId);
await mkdir(directory, { recursive: true });
const env = {
  ...process.env,
  DATABASE_URL: `pglite:${path.join(directory, "db").replace(/\\/g, "/")}`,
  AGENT_USER_EMAIL: "phase05-cli@example.test",
  AGENT_NATIVE_NO_OPEN: "1",
};
const checks: { name: string; exitCode: number | null; signal: string | null; durationMs: number; actionRuntime: string }[] = [];

function invoke(name: string, args: string[], expectedExit: number) {
  const start = Date.now();
  const result = spawnSync(process.execPath, ["cli/action.mjs", name, "--json", ...args], {
    env,
    shell: false,
    encoding: "utf8",
    timeout: 60_000,
    maxBuffer: 1024 * 1024,
  });
  checks.push({ name, exitCode: result.status, signal: result.signal, durationMs: Date.now() - start, actionRuntime: result.stderr?.match(/runtime: (v[\d.]+)/)?.[1] ?? process.version });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, expectedExit, result.stderr);
  assert.doesNotMatch(result.stderr, /UV_HANDLE_CLOSING|Assertion failed/);
  if (expectedExit !== 0) {
    assert.equal(result.stdout.trim(), "");
    return result.stderr;
  }
  return JSON.parse(result.stdout) as unknown;
}

try {
  assert.deepEqual(invoke("hello", [], 0), { message: "Hello, world!" });
  const fixture = JSON.parse(await readFile("tests/fixtures/release-ready.json", "utf8"));
  for (let index = 1; index <= 3; index++) {
    const inputFile = path.join(directory, `input-${index}.json`);
    await writeFile(inputFile, JSON.stringify({ ...fixture, releaseId: `phase05-cli-${index}`, errorSummary: 'Synthetic "quotes"; $() & | < > 检查' }));
    const output = releaseAnalysisOutputSchema.parse(invoke("analyze-release", ["--input-file", inputFile], 0));
    assert.equal(output.release.decision, "READY");
    assert.equal(output.release.status, "PROPOSED");
    assert.equal(output.release.errorSummary, 'Synthetic "quotes"; $() & | < > 检查');
  }
  const invalidFile = path.join(directory, "invalid.json");
  await writeFile(invalidFile, JSON.stringify({ ...fixture, failedTests: -1 }));
  assert.match(String(invoke("analyze-release", ["--input-file", invalidFile], 1)), /failedTests|validation|Too small/i);
  const list = releaseListOutputSchema.parse(invoke("list-releases", [], 0));
  assert.equal(list.releases.length, 3);
  assert.equal(list.auditEvents.filter((event) => event.eventType === "PROPOSED").length, 3);
  for (const name of ["approve-release", "execute-release"]) {
    assert.match(String(invoke(name, ["--releaseId", "phase05-cli-1"], 1)), /authorization|signed-in|approved agent/i);
  }
  await writeFile(path.join(directory, "result.json"), JSON.stringify({ status: "PASS", node: process.version, checks }, null, 2));
  console.log(JSON.stringify({ status: "PASS", node: process.version, checks, evidence: path.relative(process.cwd(), directory) }, null, 2));
} catch (error) {
  await writeFile(path.join(directory, "result.json"), JSON.stringify({ status: "FAIL", node: process.version, checks, error: error instanceof Error ? error.message : String(error) }, null, 2));
  throw error;
}
