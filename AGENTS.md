# Release Decision Workbench — Agent Guide

`/home` is the Release Decision Workbench. `/` enters the shared authentication flow, and Chat remains at `/chat`. Phase 0.5 recovers the existing deterministic release workflow; Phase 1 requires explicit authorization.

## Shared Actions

| Action | Purpose and boundary |
|---|---|
| `analyze-release` | Validate supplied CI facts, produce the deterministic decision, and save one owner-scoped proposal. |
| `list-releases` | Read the current owner's proposals and audit history. |
| `plan-with-aig` | Call the separate loopback AIG planner; accept one read-only `service-demo` step; never execute an AIG plan. |
| `approve-release` / `reject-release` | Require an authenticated interactive/approved agent caller and enforce the stored proposal state. |
| `execute-release` | Require the exact persisted approval/digest; validate local reference syntax once; perform no deployment. |

Verify a write by rereading its persisted row or returned state. The React page and model tools must call these Actions; do not duplicate CI decision logic in a component or model prompt.

## Windows runtime and verification

Use Node 24.22.1 for the tested Windows runtime. Node 26.5.0 reproduced a libuv exit assertion after CLI forwarding. `cli/action.mjs` selects the ignored project-local Node 24 binary on Windows Node 26; it does not change the global installation. See README for its local installation command.

`pnpm action <name> --input-file <file.json> --json` uses the public framework `runScript` dispatcher with bounded file input. Keep verification executables in `verification/phase05/`: root-level TypeScript files in `scripts/` can be auto-discovered as app Actions and imported at runtime.

Required recovery checks: `pnpm typecheck`, `pnpm agent-native:doctor`, `pnpm test`, `pnpm verify:cli`, `pnpm verify:integration`, and the separately classified `pnpm verify:model`. The integration verifier uses new data under ignored `data/phase05`, a loopback app/AIG service, synthetic authenticated fixture consent, and owned-process cleanup. Its database-close HMR key is generated in memory and is available only to the isolated development lifecycle.

Authenticated HTTP tests, model-loop probes, and SSR responses do not prove a React browser workflow or actual human approval. If permitted browser control is unavailable, keep UI/E2E `BLOCKED` and use the manual checklist in `docs/PHASE05-TEST-REPORT.md`.

## Skills

Search with `rg --hidden --follow`; read the exact linked guide before deeper work. `.agents/skills/build-an-app/SKILL.md` — start here for vague requests to create a domain app. `.agents/skills/adding-a-feature/SKILL.md` — cross-area feature checklist. Data/integrations: `.agents/skills/actions/SKILL.md`, `.agents/skills/storing-data/SKILL.md`, `.agents/skills/security/SKILL.md`, `.agents/skills/secrets/SKILL.md`, `.agents/skills/sharing/SKILL.md`. UI: `.agents/skills/frontend-design/SKILL.md`, `.agents/skills/shadcn-ui/SKILL.md`, `.agents/skills/client-side-routing/SKILL.md`. Agent context/workflows: `.agents/skills/context-awareness/SKILL.md`, `.agents/skills/real-time-sync/SKILL.md`, `.agents/skills/reliable-mutations/SKILL.md`, `.agents/skills/performance/SKILL.md`, `.agents/skills/delegate-to-agent/SKILL.md`. Framework: `.agents/skills/agent-native-docs/SKILL.md`, `.agents/skills/agent-native-toolkit/SKILL.md`, `.agents/skills/customizing-agent-native/SKILL.md`.

Use local docs only (no web research): `pnpm action docs-search --query "<topic>"`, `pnpm action docs-search --slug "<slug>"`, `pnpm action docs-search --list`, `pnpm action source-search --query "<pattern>"`, `pnpm action source-search --path <path>`, or `pnpm action source-search --list`. For external-agent integrations, read `pnpm action docs-search --slug "external-agents"`.

## Core rules

- UI feedback: target 100 ms, never exceed 400 ms; acknowledge before network work.
- Normal app data must flow through actions. Keep actions deterministic and focused; use agent chat/AgentSidebar for AI work and follow-ups in the same thread. Keep structured state in SQL and large files in configured storage; persist references only.
- For external integrations, inspect the workspace/provider connection catalog first; reuse its scoped resolver. Never hardcode credentials, webhook URLs, or private/customer data.
- Never fabricate. Report failures and recover; verify writes by reading the row or screen. Navigation is in `<current-screen>`; use `view-screen` for fresh visible-record details.

For custom branding, keep `server/plugins/agent-native-email-branding.ts` aligned: `app.name` appears in transactional email and optional `app.logoUrl` must be an absolute HTTPS URL.

## Application state

- `navigation` describes the view and selected ids. Chat is `chat` at `/chat` and `/chat/<threadId>`; the Workbench is `home` at `/home`; `/` opens shared sign-in/signup.
- Use `navigate` when supported and `view-screen` for a fresh read of visible details; basic navigation is already in `<current-screen>`.

## Building a domain app

Choose the primary workflow and route before editing. Add a domain route under `app/routes/` and set `app.homePath` in `server/plugins/agent-native-email-branding.ts` with `defineAppConfig`. The default Get started page lives at `/home`, and Chat stays at `/chat`; edit `app/routes/home.tsx` when replacing that page with a domain-specific home. Add a static link in `app/components/layout/Sidebar.tsx` before `ChatThreadsSection`; `Header.tsx` uses `APP_TITLE` elsewhere. Shared sidebar and AgentInspector remain.

Use `adding-a-feature` for functional parity and `frontend-design` for a user-facing screen. Preserve the design system. Run the scoped recovery checks above and a browser smoke when permitted, including authenticated landing and overlap behavior. Report unsupported or blocked coverage honestly; skip production deployment/build work unless requested.

Before building common workspace or agent UI, read `agent-native-toolkit`; for supported customization, read `customizing-agent-native`.

- Guarded verification: run `pnpm agent-native:doctor`; fix findings before done.
