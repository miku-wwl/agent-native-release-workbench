import { describe, expect, it, vi } from "vitest";

import {
  AigClientError,
  requestAigPlan,
  validateAigBaseUrl,
} from "../server/aig-client.js";

const validWire = {
  state: "PlanValidated",
  plan: {
    goal: "Inspect the service record",
    target: "service-demo",
    steps: [{ tool_name: "get_service_record", tool_version: "1", arguments: { service_id: "service-demo" } }],
    risk_class: "READ_ONLY",
  },
  error: null,
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("AIG HTTP adapter (fixture tests; genuine integration is reported separately)", () => {
  it("allows only loopback HTTP origins", () => {
    expect(validateAigBaseUrl("http://127.0.0.1:8787")).toBe("http://127.0.0.1:8787");
    for (const url of [
      "https://127.0.0.1:8787",
      "http://example.com",
      "http://127.0.0.1:8787/private",
      "http://user:password@localhost:8787",
    ]) {
      expect(() => validateAigBaseUrl(url)).toThrow(AigClientError);
    }
  });

  it("accepts a plan only when it matches the pinned read-only contract", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(validWire));
    const result = await requestAigPlan("inspect service-demo", {
      baseUrl: "http://127.0.0.1:8787",
      fetchImpl: fetchImpl as typeof fetch,
    });
    expect(result.state).toBe("PlanValidated");
    expect(result.source.commit).toBe("bb8e8fb1234128613a750bee17967b225072bb14");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed or side-effecting plans", async () => {
    const malformed = { ...validWire, plan: { ...validWire.plan, risk_class: "SIDE_EFFECT" } };
    await expect(
      requestAigPlan("inspect service-demo", {
        baseUrl: "http://127.0.0.1:8787",
        fetchImpl: vi.fn(async () => jsonResponse(malformed)) as typeof fetch,
      }),
    ).rejects.toMatchObject({ errorCode: "aig_invalid_response" });
  });

  it("rejects empty and overlong intents before network access", async () => {
    const fetchImpl = vi.fn();
    await expect(requestAigPlan(" ", { baseUrl: "http://127.0.0.1:8787", fetchImpl })).rejects.toMatchObject({
      errorCode: "aig_rejected",
    });
    await expect(
      requestAigPlan("x".repeat(8193), { baseUrl: "http://127.0.0.1:8787", fetchImpl }),
    ).rejects.toMatchObject({ errorCode: "aig_rejected" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("normalizes explicit timeout and unexpected backend failures", async () => {
    const timeoutFetch: typeof fetch = async (_input, init) => {
      await new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
      return jsonResponse(validWire);
    };
    await expect(
      requestAigPlan("inspect service-demo", {
        baseUrl: "http://127.0.0.1:8787",
        fetchImpl: timeoutFetch,
        timeoutMs: 10,
      }),
    ).rejects.toMatchObject({ errorCode: "aig_timeout", statusCode: 504 });

    await expect(
      requestAigPlan("inspect service-demo", {
        baseUrl: "http://127.0.0.1:8787",
        fetchImpl: vi.fn(async () => {
          throw new Error("private backend detail");
        }) as typeof fetch,
      }),
    ).rejects.toMatchObject({ errorCode: "aig_unavailable", statusCode: 503 });
  });
});
