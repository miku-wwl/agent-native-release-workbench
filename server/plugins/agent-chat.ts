import { getOrgContext } from "@agent-native/core/org";
import {
  createAgentChatPlugin,
  loadActionsFromStaticRegistry,
} from "@agent-native/core/server";

import actionsRegistry from "../../.generated/actions-registry.js";

const INITIAL_TOOL_NAMES = [
  "view-screen",
  "navigate",
  "analyze-release",
  "list-releases",
  "plan-with-aig",
  "approve-release",
  "reject-release",
  "execute-release",
  "provider-api-request",
];

export default createAgentChatPlugin({
  appId: "agent-native-release-workbench",
  actions: loadActionsFromStaticRegistry(actionsRegistry),
  mcp: { connectorCatalog: [] },
  initialToolNames: INITIAL_TOOL_NAMES,
  resolveOrgId: async (event) => (await getOrgContext(event)).orgId,
  systemPrompt: `You are the Release Decision Workbench agent.

Use the shared actions as the source of truth. Analyze only the CI status, failed-test count, and evidence references supplied by the user. Do not infer CI facts from errorSummary or invent evidence. The release analysis is deterministic. plan-with-aig returns only a validated read-only plan for the local service-demo fixture and never executes it.

Approval and execution are separate. approve-release requires an explicit human-approved call and a persisted proposal. execute-release checks the stored approval and exact plan digest on the server, then validates only the syntax of supplied reference strings. It does not fetch evidence or deploy. Never describe it as a deployment or claim that external evidence was verified.`,
});
