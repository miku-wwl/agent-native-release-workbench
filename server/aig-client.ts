import { z } from "zod";

const AIG_RELEASE = "v0.3.0";
const AIG_COMMIT = "bb8e8fb1234128613a750bee17967b225072bb14";
const MAX_INTENT_BYTES = 8 * 1024;
const MAX_RESPONSE_BYTES = 64 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;

const serviceIdSchema = z.literal("service-demo");

export const aigPlanSchema = z
  .object({
    goal: z.string().trim().min(1).max(512),
    target: serviceIdSchema,
    steps: z
      .array(
        z
          .object({
            tool_name: z.literal("get_service_record"),
            tool_version: z.literal("1"),
            arguments: z.object({ service_id: serviceIdSchema }).strict(),
          })
          .strict(),
      )
      .length(1),
    risk_class: z.literal("READ_ONLY"),
  })
  .strict();

const aigWireResponseSchema = z
  .object({
    state: z.literal("PlanValidated"),
    plan: aigPlanSchema,
    error: z.null(),
  })
  .strict();

export const aigPlanOutputSchema = z
  .object({
    state: z.literal("PlanValidated"),
    plan: aigPlanSchema,
    source: z
      .object({
        release: z.literal(AIG_RELEASE),
        commit: z.literal(AIG_COMMIT),
      })
      .strict(),
  })
  .strict();

export type AigPlanOutput = z.infer<typeof aigPlanOutputSchema>;

export class AigClientError extends Error {
  constructor(
    readonly errorCode:
      | "aig_not_configured"
      | "aig_timeout"
      | "aig_unavailable"
      | "aig_rejected"
      | "aig_invalid_response",
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "AigClientError";
  }
}

export function validateAigBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AigClientError(
      "aig_not_configured",
      503,
      "Set AIG_API_BASE_URL to the isolated local AIG server.",
    );
  }
  const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]);
  if (
    url.protocol !== "http:" ||
    !loopback.has(url.hostname.toLowerCase()) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new AigClientError(
      "aig_not_configured",
      503,
      "AIG_API_BASE_URL must be an HTTP loopback origin without credentials or a path.",
    );
  }
  return url.origin;
}

function configuredBaseUrl(): string {
  const configured = process.env.AIG_API_BASE_URL; // guard:allow-env-credential — non-secret loopback service origin, validated before use.
  if (!configured) {
    throw new AigClientError(
      "aig_not_configured",
      503,
      "AIG_API_BASE_URL is not configured for this project.",
    );
  }
  return validateAigBaseUrl(configured);
}

async function readBoundedBody(response: Response): Promise<string> {
  const declared = response.headers.get("content-length");
  if (declared !== null) {
    const length = Number(declared);
    if (!Number.isSafeInteger(length) || length < 0 || length > MAX_RESPONSE_BYTES) {
      throw new AigClientError(
        "aig_invalid_response",
        502,
        "AIG returned a response outside the allowed size.",
      );
    }
  }
  if (!response.body) {
    throw new AigClientError(
      "aig_invalid_response",
      502,
      "AIG returned an empty response.",
    );
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new AigClientError(
          "aig_invalid_response",
          502,
          "AIG returned a response outside the allowed size.",
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new AigClientError(
      "aig_invalid_response",
      502,
      "AIG returned a response that was not valid UTF-8.",
    );
  }
}

export async function requestAigPlan(
  intentValue: string,
  options: {
    baseUrl?: string;
    fetchImpl?: typeof fetch;
    signal?: AbortSignal;
    timeoutMs?: number;
  } = {},
): Promise<AigPlanOutput> {
  const intent = z.string().trim().min(1).max(8192).safeParse(intentValue);
  if (!intent.success || new TextEncoder().encode(intent.data ?? "").byteLength > MAX_INTENT_BYTES) {
    throw new AigClientError(
      "aig_rejected",
      400,
      "Enter an intent of 1 to 8192 characters.",
    );
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > DEFAULT_TIMEOUT_MS) {
    throw new AigClientError("aig_unavailable", 503, "The AIG request budget is invalid.");
  }
  const baseUrl = validateAigBaseUrl(options.baseUrl ?? configuredBaseUrl());
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeoutSignal])
    : timeoutSignal;

  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(new URL("/api/plans", baseUrl), {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ text: intent.data }),
      signal,
      redirect: "error",
      cache: "no-store",
    });
  } catch (error) {
    if (signal.aborted) {
      const callerAborted = options.signal?.aborted;
      throw new AigClientError(
        callerAborted ? "aig_unavailable" : "aig_timeout",
        callerAborted ? 499 : 504,
        callerAborted ? "The AIG request was cancelled." : "AIG did not respond within the allowed time.",
      );
    }
    throw new AigClientError(
      "aig_unavailable",
      503,
      "The isolated AIG service is unavailable.",
    );
  }

  let body: unknown;
  try {
    const text = await readBoundedBody(response);
    body = JSON.parse(text);
  } catch (error) {
    if (error instanceof AigClientError) throw error;
    if (signal.aborted) {
      const callerAborted = options.signal?.aborted;
      throw new AigClientError(
        callerAborted ? "aig_unavailable" : "aig_timeout",
        callerAborted ? 499 : 504,
        callerAborted ? "The AIG request was cancelled." : "AIG did not respond within the allowed time.",
      );
    }
    throw new AigClientError(
      "aig_invalid_response",
      502,
      "AIG returned malformed JSON.",
    );
  }

  if (!response.ok) {
    const code = response.status === 504 ? "aig_timeout" : "aig_rejected";
    const statusCode = response.status === 504 ? 504 : response.status >= 500 ? 503 : 422;
    throw new AigClientError(
      code,
      statusCode,
      response.status === 504
        ? "AIG planning timed out."
        : "AIG rejected the intent or could not produce a validated plan.",
    );
  }

  const parsed = aigWireResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new AigClientError(
      "aig_invalid_response",
      502,
      "AIG returned a plan that did not match the supported read-only contract.",
    );
  }

  return aigPlanOutputSchema.parse({
    state: parsed.data.state,
    plan: parsed.data.plan,
    source: { release: AIG_RELEASE, commit: AIG_COMMIT },
  });
}
