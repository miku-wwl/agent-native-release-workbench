# Phase 0.5 Recovery Report

Date: 2026-10-27, Pacific/Auckland. Scope: recover the existing Phase 0 vertical slice. No scaffold regeneration, new repository, Phase 1 feature expansion, cloud deployment, paid inference, or AIG source change occurred.

## Baseline reconciliation

The request's uncommitted/secret-scan/push context was stale. The actual starting checkout was clean `main` at `fbbad3dc74a1cc4b5c063e8bc2eeecb509ac2845`, and GitHub `main` matched it. The expected HTTPS repository exists, is **PUBLIC**, and has `main` as its default branch. Visibility and Git history were preserved.

Agent-Native remains 0.220.0. AIG remains a separate HTTP planning service. The AIG checkout is clean at `7f635adf13f105cf4ed8408766c47e612048773c`; `git diff v0.3.0..HEAD -- src tests` is empty. Its implementation therefore matches the audited v0.3.0 source at `bb8e8fb1234128613a750bee17967b225072bb14`. The previous 1,626-pass AIG suite is historical Phase 0 evidence, not a newly rerun suite.

## Failure causes and recovery

| Problem | Observed cause | Recovery / status |
|---|---|---|
| Windows CLI JSON corruption | The installed outer CLI uses a Windows shell subprocess. The same JSON works at the public runner boundary but fails positional parsing through the outer shell. | App-owned CLI enters the public `runScript` directly; `--input-file` avoids fragile shell JSON, and `--json` provides structured stdout. Framework internals were not edited. |
| Real business Action still failed after quoting was removed | `analyzeAndSaveRelease` returned its internal `denied:false` discriminator. The Action's strict output schema rejected the extra field after the write committed. Store-only tests had missed this boundary. | Return only `release` and `auditEvents`; strict contract regression plus actual CLI and HTTP Action calls pass. The initial synthetic failed-write record was preserved in its separate test DB. |
| Windows libuv assertion | Node 26.5.0 reproduced `UV_HANDLE_CLOSING`, exit `3221226505`, after forwarding to a live dev server. Standalone calls did not reproduce it. Exact C++ causation is not established. | Isolated Node 24.22.1 passes the same forwarding path. The launcher selects it for Windows Node 26 and waits for child `close`; `.node-version` records the tested runtime. Global Node remains 26.5.0. |
| UI workflow lacked review/recovery controls | Source inspection found no saved-release selector, no saved-plan/digest disclosure, and no query-error recovery display. The form's CI type was narrower than its actual enum. | Added those controls, derived form types from the shared input type, and suppressed overlapping submissions. The page continues to use shared Action hooks. Actual browser invocation remains BLOCKED. |
| Persistence was unverified | Earlier tests used only in-memory PGlite. | The real app creates/approves proposals in a dedicated on-disk DB; an actual app process closes and restarts, then rereads the same approval, digest and audit. HTTP simulation/denial cases pass. |
| Dev DB shutdown confirmation | Installed Nitro's Vite worker has an empty runtime `onClose`; the framework's preclose HMR acknowledgement times out. A runtime close hook alone was not observed. | Composed a development-only Vite HMR lifecycle with public `closeDbExec`, an in-memory transient key, and a real completion acknowledgement. The verifier requires that acknowledgement before exit/reopen. No shutdown HTTP route or new app Action was added. The upstream redundant preclose warning can still appear. |
| Adapter had no live Workbench proof | Phase 0 called AIG directly and supplemented it with fixtures. | The registered Workbench `plan-with-aig` Action now calls the real adapter, isolated AIG, and existing Ollama model successfully. The returned plan is pinned to one read-only `service-demo` step. |
| Local model Tool Calling | The only installed model, `phi4-mini:latest`, returned JSON-looking assistant text with no native `message.tool_calls`. | FAIL retained. No text parsing was used as a substitute, no Action was invoked, and no model was downloaded. |
| Browser policy | Earlier native Edge control was refused for URL confidence. The permitted browser inventory now returns `[]`. | No native Edge retry or alternate automation mechanism was used. UI and E2E remain BLOCKED; manual instructions are provided. |

## Recovery harness issues corrected

The initial Vite host was loaded through `tsx`, which interfered with Nitro's package resolution; it now runs as plain `.mjs`. Verification programs initially placed at the root of `scripts/` were auto-discovered as Actions. They were moved to `verification/phase05/`, and the final live test requires the old verification Action URL to return 404. No verification program remains in the app Action catalog. The missing-release HTTP test was corrected to assert the source contract's **404** plus `release_not_found`, rather than an incorrect 409. These failed attempts and their dedicated data were retained locally.

## Architecture and security boundary

The architecture is unchanged: React/CLI/agent capabilities share the same registered Actions; deterministic release logic and owner-scoped SQL state stay in TypeScript; AIG stays separate and planning-only. Approval is persisted against the exact SHA-256 plan digest. Execution rechecks owner, state, current plan binding, approved digest, and replay status. It validates only local reference syntax and records `externalEffect=NONE`, `deploymentPerformed=false`.

Authenticated HTTP tests mint a genuine throwaway local Better Auth session and the framework's UI capability. This is **synthetic fixture consent**, not an observed person clicking approve. The lifecycle test key and auth secret are generated in memory, never printed or saved to the repository, and do not disable authentication or approval.

The adapter's declared source metadata is the consumer's expected baseline, not a signed backend attestation. Actual source identity was verified separately through the clean sibling checkout and its source parity with v0.3.0. Production service authentication and hosting remain outside this spike.

## Provenance

**PRE_EXISTING_AIG_WORK**: Python planning contracts, validation, provider adapters, bounded runtime, and the broader execution system remain in AIG. No Python source or repository was copied or changed.

**HACKATHON_NEW_WORK**: the existing Agent-Native release UI/Actions/storage, this recovery's strict output fix, CLI/runtime composition, UI review/error controls, dedicated process/HTTP/persistence verification, lifecycle composition, and recovery documents. Phase 0 reports are retained as historical evidence.

## Changed scope

- `actions/run.ts`, `cli/action.mjs`, `.node-version`, `package.json`: bounded file input, structured output, public dispatch, and local runtime selection.
- `server/release-store.ts`, `server/plugins/db.ts`: correct output contract and explicit database shutdown completion.
- `server/aig-client.ts`: cancel a declared oversized response body before rejecting it.
- `app/components/home/ReleaseWorkbenchPage.tsx`: shared form types, saved-plan review, saved-record selection, overlap guards and query retry.
- `verification/phase05/`, `tests/aig-http.test.ts`, `tests/fixtures/`, `tests/release-store.test.ts`, `tsconfig.json`: meaningful process/HTTP/model checks and strict contract regression.
- README, AGENTS and Phase 0.5 reports: current instructions and evidence. Two Phase 0 documents retain their findings with relative source paths and an appended live-adapter result.

Portable Node, databases, raw model responses, failed-attempt evidence and logs remain ignored local artifacts. No temporary directory or original user dataset was deleted.

## Remaining recovery

Establish a permitted browser surface and observe `/home` submitting, reviewing, approving/rejecting, executing the safe local action, and displaying persisted audit. Then separately verify a genuinely tool-capable local model. Phase 1 remains deferred; these are recovery tasks, not new product features.
