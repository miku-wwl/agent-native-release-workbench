import { createServer, type ServerResponse } from "node:http";
import { describe, expect, it } from "vitest";
import { requestAigPlan } from "../server/aig-client.js";

const wire = { state: "PlanValidated", plan: { goal: "Read service-demo", target: "service-demo", steps: [{ tool_name: "get_service_record", tool_version: "1", arguments: { service_id: "service-demo" } }], risk_class: "READ_ONLY" }, error: null };
async function fixture(handler: (response: ServerResponse) => void, check: (baseUrl: string) => Promise<void>) {
  const server = createServer((_request, response) => handler(response));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No fixture port.");
  try { await check(`http://127.0.0.1:${address.port}`); }
  finally { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); }
}

describe("AIG adapter over real loopback HTTP (controlled fixtures, not a model backend)", () => {
  it("parses the supported response", async () => {
    await fixture((response) => response.end(JSON.stringify(wire)), async (baseUrl) => {
      expect((await requestAigPlan("Read service-demo", { baseUrl })).state).toBe("PlanValidated");
    });
  });
  it.each([
    { ...wire, unexpected: true },
    { ...wire, plan: { ...wire.plan, target: "other-service" } },
    { ...wire, plan: { ...wire.plan, risk_class: "SIDE_EFFECT" } },
    { ...wire, plan: { ...wire.plan, steps: [wire.plan.steps[0], wire.plan.steps[0]] } },
  ])("rejects schema, scope, side-effect and step-count mismatch %#", async (body) => {
    await fixture((response) => response.end(JSON.stringify(body)), async (baseUrl) => {
      await expect(requestAigPlan("Read service-demo", { baseUrl })).rejects.toMatchObject({ errorCode: "aig_invalid_response" });
    });
  });
  it("rejects declared and streamed oversized responses", async () => {
    for (const declared of [true, false]) {
      await fixture((response) => {
        if (declared) response.setHeader("content-length", "70000");
        response.write(" ".repeat(35000)); response.end(" ".repeat(35000));
      }, async (baseUrl) => {
        await expect(requestAigPlan("Read service-demo", { baseUrl })).rejects.toMatchObject({ errorCode: "aig_invalid_response", message: expect.stringContaining("allowed size") });
      });
    }
  });
  it("handles a timeout after response headers", async () => {
    await fixture((response) => { response.writeHead(200); response.flushHeaders(); }, async (baseUrl) => {
      await expect(requestAigPlan("Read service-demo", { baseUrl, timeoutMs: 30 })).rejects.toMatchObject({ errorCode: "aig_timeout", statusCode: 504 });
    });
  });
  it("normalizes connection refusal", async () => {
    let closedOrigin = "";
    await fixture((response) => response.end(), async (baseUrl) => { closedOrigin = baseUrl; });
    await expect(requestAigPlan("Read service-demo", { baseUrl: closedOrigin })).rejects.toMatchObject({ errorCode: "aig_unavailable", statusCode: 503 });
  });
  it("rejects malformed JSON and invalid UTF-8", async () => {
    for (const body of [Buffer.from("not json"), Buffer.from([0xff, 0xfe])]) {
      await fixture((response) => response.end(body), async (baseUrl) => {
        await expect(requestAigPlan("Read service-demo", { baseUrl })).rejects.toMatchObject({ errorCode: "aig_invalid_response" });
      });
    }
  });
  it("never reports success for unexpected backend errors or redirects", async () => {
    for (const status of [302, 500, 504]) {
      await fixture((response) => { response.writeHead(status, { location: "/elsewhere" }); response.end(JSON.stringify({ error: "synthetic backend failure" })); }, async (baseUrl) => {
        await expect(requestAigPlan("Read service-demo", { baseUrl })).rejects.toMatchObject({ statusCode: status === 504 ? 504 : 503 });
      });
    }
  });
});
