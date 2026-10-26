import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const worker = process.argv[2] === "--worker";
if (!worker) {
  const directory = path.resolve("data/phase05/model", new Date().toISOString().replace(/[:.]/g, "-"));
  await mkdir(directory, { recursive: true });
  const result = spawnSync(process.execPath, ["--import", "tsx", "verification/phase05/model.ts", "--worker", directory], {
    env: { ...process.env, DATABASE_URL: `pglite:${path.join(directory, "db").replace(/\\/g, "/")}`, AGENT_NATIVE_NO_OPEN: "1" },
    shell: false, encoding: "utf8", timeout: 150_000, maxBuffer: 1024 * 1024,
  });
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  if (result.error) console.error(result.error.message);
  process.exitCode = result.status ?? 1;
} else {
  const directory = process.argv[3];
  console.log = (...values: unknown[]) => console.error(...values);
  const { closeDbExec } = await import("@agent-native/core/db");
  const { default: registeredAction } = await import("../../actions/analyze-release.js");
  const { default: registeredList } = await import("../../actions/list-releases.js");
  const { releaseInputSchema, releaseAnalysisOutputSchema } = await import("../../server/release-domain.js");
  let successCount = 0;
  const evidence: Record<string, unknown> = { provider: "ollama", endpoint: "http://127.0.0.1:11434/api/chat", action: "analyze-release", actionSource: "actions/analyze-release.ts", mechanism: "real native Ollama tool loop invoking the existing registered Action; in-app chat/browser unverified" };
  async function chat(body: unknown) {
    const response = await fetch("http://127.0.0.1:11434/api/chat", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(60_000),
    });
    assert.equal(response.status, 200, "Local model request must succeed.");
    const text = await response.text();
    assert(Buffer.byteLength(text) <= 128 * 1024, "Bounded model response required.");
    return JSON.parse(text) as any;
  }
  try {
    const tags = await (await fetch("http://127.0.0.1:11434/api/tags", { signal: AbortSignal.timeout(5_000) })).json() as { models: { name: string; size: number }[] };
    evidence.installedModels = tags.models.map(({ name, size }) => ({ name, size }));
    const model = tags.models.find((item) => item.name === "phi4-mini:latest")?.name;
    assert(model, "The already installed model must be available; do not download another model.");
    evidence.model = model;
    const fixture = { releaseId: "phase05-model-probe", serviceName: "payments-api", ciStatus: "PASS", failedTests: 0, errorSummary: "Synthetic model tool-call fixture.", evidenceReferences: ["ci://phase05/model/1"] };
    const tools = [{ type: "function", function: { name: "analyze-release", description: registeredAction.tool.description, parameters: registeredAction.tool.parameters } }];
    const messages: any[] = [
      { role: "system", content: "Use the provided analyze-release tool to analyze supplied CI facts. Use a protocol tool call, preserve every supplied field exactly, and do not invent evidence. After receiving its result, report the release ID and exact decision." },
      { role: "user", content: `Analyze this synthetic release using the analyze-release tool: ${JSON.stringify(fixture)}` },
    ];
    const first = await chat({ model, messages, tools, stream: false, options: { temperature: 0, num_predict: 512, num_ctx: 4096 } });
    await writeFile(path.join(directory, "model-first-response.json"), JSON.stringify(first, null, 2));
    const calls = first.message?.tool_calls;
    evidence.responseType = Array.isArray(calls) && calls.length ? "protocol_tool_calls" : "assistant_text";
    evidence.contentPreview = String(first.message?.content ?? "").slice(0, 500);
    assert(Array.isArray(calls) && calls.length === 1, "No single protocol-level tool call was returned; text JSON is not a tool call.");
    assert.equal(calls[0]?.function?.name, "analyze-release");
    const args = releaseInputSchema.parse(calls[0].function.arguments);
    assert.deepEqual(args, fixture, "The model must preserve supplied facts exactly.");
    const { default: migrate } = await import("../../server/plugins/db.js");
    await (migrate as (app: unknown) => Promise<unknown>)({});
    const context = { caller: "tool" as const, userEmail: "phase05-model@example.test", actionName: "analyze-release" };
    const result = releaseAnalysisOutputSchema.parse(await registeredAction.run(args, context));
    assert.equal(result.release.decision, "READY");
    const persisted = await registeredList.run({}, { ...context, actionName: "list-releases" });
    assert(persisted.releases.some((release) => release.releaseId === fixture.releaseId && release.planDigest === result.release.planDigest));
    successCount = 1;
    evidence.actionResult = { releaseId: result.release.releaseId, decision: result.release.decision, status: result.release.status, planDigest: result.release.planDigest, persisted: true };
    messages.push(first.message, { role: "tool", tool_name: "analyze-release", content: JSON.stringify(result) });
    const second = await chat({ model, messages, stream: false, options: { temperature: 0, num_predict: 256, num_ctx: 4096 } });
    await writeFile(path.join(directory, "model-result-response.json"), JSON.stringify(second, null, 2));
    const finalContent = String(second.message?.content ?? "");
    assert(finalContent.includes("READY") && finalContent.includes(fixture.releaseId), "The final model answer must communicate the observed Action decision and release ID.");
    evidence.finalModelAnswer = finalContent;
    evidence.status = "PASS";
  } catch (error) {
    evidence.status = "FAIL";
    evidence.error = error instanceof Error ? error.message : String(error);
    process.exitCode = 1;
  } finally {
    evidence.toolCallSuccessCount = successCount;
    evidence.toolCallFailureCount = evidence.status === "PASS" ? 0 : 1;
    evidence.evidence = path.relative(process.cwd(), directory);
    await writeFile(path.join(directory, "result.json"), JSON.stringify(evidence, null, 2));
    process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
    await closeDbExec();
  }
}
