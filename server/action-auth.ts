import { fail, type ActionRunContext } from "@agent-native/core/action";

export function currentOwner(ctx?: ActionRunContext): string {
  const ownerEmail = ctx?.userEmail?.trim().toLowerCase();
  if (ownerEmail) return ownerEmail;
  // The local CLI has no interactive identity. Give its safe, non-approval
  // workflows a single isolated workspace owner; mutation gates still require
  // an authenticated frontend or explicitly approved agent call.
  if (ctx?.caller === "cli") return "release-workbench-cli@localhost";
  fail("Sign in to use the release workbench.", {
    errorCode: "authentication_required",
    statusCode: 401,
  });
}

export function requireInteractiveApproval(
  _args: unknown,
  ctx?: ActionRunContext,
): void {
  const signedIn = Boolean(ctx?.userEmail?.trim());
  const approvedSurface =
    ctx?.caller === "frontend" ||
    (ctx?.caller === "tool" && Boolean(ctx.approvedToolCallKey));
  if (!signedIn || !approvedSurface) {
    fail("Approval and execution controls require the signed-in workbench or an explicitly approved agent call.", {
      errorCode: "interactive_authorization_required",
      statusCode: 403,
    });
  }
}
