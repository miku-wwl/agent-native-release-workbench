import { describe, expect, it } from "vitest";

import { currentOwner, requireInteractiveApproval } from "../server/action-auth.js";

describe("action identity and server-side approval checks", () => {
  it("assigns a dedicated local CLI owner but requires identity elsewhere", () => {
    expect(currentOwner({ caller: "cli" } as never)).toBe("release-workbench-cli@localhost");
    expect(currentOwner({ caller: "frontend", userEmail: "Owner@Example.test" } as never)).toBe(
      "owner@example.test",
    );
    expect(() => currentOwner({ caller: "http" } as never)).toThrow();
  });

  it("does not treat needsApproval or direct CLI invocation as authorization", () => {
    expect(() => requireInteractiveApproval({}, { caller: "cli" } as never)).toThrow();
    expect(() => requireInteractiveApproval({}, { caller: "http" } as never)).toThrow();
    expect(() =>
      requireInteractiveApproval({}, { caller: "frontend", userEmail: "owner@example.test" } as never),
    ).not.toThrow();
    expect(() =>
      requireInteractiveApproval(
        {},
        { caller: "tool", userEmail: "owner@example.test", approvedToolCallKey: "approved-call" } as never,
      ),
    ).not.toThrow();
  });
});
