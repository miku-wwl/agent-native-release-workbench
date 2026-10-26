# Phase 0.5 Test Report

Date: 2026-10-27, Pacific/Auckland. Evidence directories use UTC timestamps. Inputs, accounts, approvals and evidence references in automated checks are synthetic. Browser E2E and actual human consent are not implied.

## Commands and outcomes

Commands run from the repository root unless stated otherwise. The tested application/framework version remains Agent-Native 0.220.0.

| Command / check | Exit | Actual result |
|---|---:|---|
| `git status --short`, branch/remotes/log and `git ls-remote origin HEAD refs/heads/main` | 0 | Clean baseline `main`, local/tracking/GitHub `fbbad3dc74a1cc4b5c063e8bc2eeecb509ac2845`. |
| `gh repo view miku-wwl/agent-native-release-workbench --json name,url,visibility,defaultBranchRef` | 0 | Existing expected repository, PUBLIC, default branch `main`. |
| Installed outer CLI with positional business JSON, Node 26.5.0 | 1 | Reproduced malformed positional JSON. |
| Direct public runner with valid business JSON before the store fix | 1 | Strict output-contract error: internal `denied:false` leaked into the return value; its synthetic write was already applied. |
| Direct runner forwarded to a live dev server, Node 26.5.0 | 3221226505 | Reproduced `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\\win\\async.c, line 94`. |
| `npm install --prefix data/phase05/node24 --no-save --no-package-lock node@24.22.1 node-win-x64@24.22.1` | 0 | Isolated architecture binary installed. npm 12 blocked the generic package's installer hook; the directly installed `node-win-x64` binary was used. No global upgrade. Fresh installs need only `node-win-x64@24.22.1`. |
| Portable `node.exe --version` / global `node --version` | 0 / 0 | v24.22.1 / v26.5.0. |
| `npx --yes pnpm@10.29.1 action hello --json` with a dedicated test DB | 0 | Valid JSON `{"message":"Hello, world!"}`; launcher selected Node 24.22.1. |
| `npx --yes pnpm@10.29.1 action analyze-release --input-file tests/fixtures/release-ready.json --json` with a dedicated test DB | 0 | Typed READY/LOW, persisted PROPOSED record, correct evidence and digest, no leaked internal discriminator. |
| `npx --yes pnpm@10.29.1 verify:cli` | 0 | 8 subprocess checks: hello; 3 valid analyses; invalid schema; persisted list; denied CLI approval; denied CLI execution. Successful calls exit 0, expected denials exit 1, no libuv assertion. |
| `npx --yes pnpm@10.29.1 typecheck` | 0 | Includes application and `verification/**/*.ts`. |
| `npx --yes pnpm@10.29.1 agent-native:doctor` | 0 | Clean, no findings. Non-secret local test port/path reads carry scoped reasons; no guard is disabled. |
| `npx --yes pnpm@10.29.1 test` | 0 | **26 passed, 5 files**. Original 16 retained, plus 10 real loopback HTTP adapter fixture tests. |
| `npx --yes pnpm@10.29.1 verify:integration` | 0 | **11 live application/process checks passed**, detailed below. |
| `npx --yes pnpm@10.29.1 verify:model` | 1 | Real native Ollama request returned assistant text, no `message.tool_calls`. 0 successful Action invocations, 1 failed model probe. |
| Permitted browser inventory | n/a | `[]`. No browser UI workflow was executed. |
| AIG read-only Git checks | 0 | Checkout clean; HEAD unchanged; source/tests match v0.3.0. The historical 1,626-pass suite was not rerun. |

Final CLI evidence: `data/phase05/cli/2026-10-26T17-04-37-958Z/result.json`. Each of the eight child processes used v24.22.1; the invoking machine still used v26.5.0. The three standalone business calls used distinct IDs and preserved quoted text, Unicode and shell metacharacters exactly. The live integration separately repeated forwarding three times with normal exits and identical plan digests across CLI and authenticated HTTP.

## Genuine application/AIG/persistence integration

Evidence: `data/phase05/integration/2026-10-26T17-01-33-872Z/result.json`. Actual application URL was `http://127.0.0.1:8095/home`; the owned AIG instance used `http://127.0.0.1:8795`. The verifier selected separate ports and issued no termination against the pre-existing 8080/8787/11434 PIDs. Final inventory showed the original AIG/Ollama listeners on 8787/11434; 8080 was no longer listening, with no cause established by this test. All verifier-owned processes and 8095/8795 listeners were gone after cleanup. Test databases and logs were created only under the new ignored evidence directory and were retained.

The 11 checks were:

1. Authenticate through the supported local Better Auth endpoint and serve the actual `/home` route envelope. This confirms routing only; the client hydration gate prevents claiming the full screen from server HTML.
2. Confirm verification harnesses are absent from the HTTP Action surface (404).
3. Deny approval from raw HTTP and a frontend marker without the UI capability.
4. Create READY/LOW and BLOCKED/HIGH proposals; persist exact-plan approval and rejection using synthetic fixture consent.
5. Invoke the registered business Action through the CLI three times, compare its decision and plan digest with HTTP, and require exit 0 each time.
6. Await the actual public database closer, its keyed lifecycle acknowledgement, and application process exit 0.
7. Restart a new application process against the same on-disk PGlite database and reread the same APPROVED proposal, approval digest and two proposal/approval audit events.
8. Execute one approved local simulation, then deny duplicate, rejected, unapproved, missing-reference and changed-plan attempts. The tamper fixture changes a real plan input, recomputes the new plan/digest while the app is stopped, and retains the original approval digest; execution must reject it.
9. Call the registered `plan-with-aig` Action over real HTTP: Workbench -> TypeScript adapter -> isolated AIG -> existing Ollama -> `PlanValidated`. Exactly one `get_service_record/1`, target `service-demo`, risk `READ_ONLY`.
10. Stop only the owned AIG process, require `503/aig_unavailable` within five seconds, and confirm that the sole execution event remains the authorized local simulation.
11. Acknowledge and close the restarted application's database and exit normally.

Recovered release plan digest: `7dab1db4c42146ac08617ebc31ca00d47ba9133e311bef135cd1ad2cc9ca5ff4`. The isolated AIG database was hashed before and after planning and equality was asserted. Its final SHA-256 was `6a39c6483b11d87d29a66f354f37ff59b57859b27ce98fd0ebe05e96b04d255e`.

The installed Nitro development runtime can still print its redundant generic preclose-ack timeout warning. The additional application lifecycle acknowledgement is real: it occurs after `closeDbExec()` completes, before Vite/process exit and successful PGlite reopen. This workaround uses public Vite/database APIs and a transient test-process key; it adds no HTTP endpoint or normal app Action.

## Controlled fixture tests versus live evidence

The 10 added tests use actual loopback HTTP servers with controlled responses. They cover parsing, extra fields, wrong scope, side-effect risk, multiple steps, declared/streamed responses over 64 KiB, body timeout, connection refusal, malformed JSON/UTF-8, redirects and backend errors. They supplement the genuine AIG integration above; they are not real model/provider results.

The original PGlite and caller-authorization tests still pass. No failing requirement was reclassified as PASS: missing references explicitly assert their 404 contract, model text is still FAIL, and browser UI stays BLOCKED.

## Model result and next candidate

Evidence: `data/phase05/model/2026-10-26T16-54-11-002Z/result.json` and the raw synthetic response alongside it. The only installed model was `phi4-mini:latest` (2,491,876,774 bytes). The native `/api/chat` request included the actual registered Action's framework-generated schema, an allowlist containing only `analyze-release`, a 60-second budget, and deterministic sampling. Its response was assistant text describing a function/schema. There was no protocol tool call, so no tool arguments were executed and no Action result was sent back to the model.

The next candidate for a separately authorized probe is [Ollama qwen3:4b](https://ollama.com/library/qwen3:4b), whose official catalog advertises tools and a 2.5 GB Q4_K_M model. Plan on about 2.5 GB additional download/disk and roughly 4–8 GB runtime RAM at a modest context as an **unmeasured engineering estimate**. It is not installed or tested here; no download or paid request occurred.

## Security and publication review

Candidate publication files were reviewed for credentials, real user data, absolute private paths, local DBs, logs, caches, and files outside the project. `rg -l -i --hidden` scans matched common OpenAI/GitHub/Slack/AWS token forms, private-key headers and long credential assignments, excluding dependencies, `.git`, generated files and ignored runtime data. No matching candidate files were found (ripgrep exit 1 means no match). `.env`, `node_modules`, and `data/phase05` are ignored. Historical machine-specific AIG paths were rewritten to sibling-relative references. No runtime token, database, log, model output or portable executable is intended for staging.

This is a finite pattern scan plus manual review, not proof that every possible secret format is detectable. Ignored runtime logs/model responses and dependency binaries were not published or included in that source review. There are no Phase 0.5 staged files or commits while the core UI acceptance remains blocked.

## Manual browser verification (not yet performed)

Use a browser surface permitted by the tool policy, or perform this checklist personally. Do not bypass the earlier native Edge restriction with another automation mechanism. Use separate terminals; retain the existing dataset and any occupied ports.

Start a dedicated workbench:

```powershell
$env:DATABASE_URL = 'pglite:./data/phase05/manual-db'
$env:AIG_API_BASE_URL = 'http://127.0.0.1:8795'
$env:PHASE05_PORT = '8095'
$env:NITRO_DEV_RUNNER = 'node-process'
npx --yes pnpm@10.29.1 dev:phase05
```

For the optional live plan preview, start AIG from the Workbench directory in a second terminal, using its existing environment:

```powershell
$phase05Python = Join-Path (Resolve-Path '../agentic-intent-gate') '.venv/Scripts/python.exe'
$env:PYTHONDONTWRITEBYTECODE = '1'
$env:AIG_DB_PATH = Join-Path (Get-Location) 'data/phase05/manual-aig.sqlite3'
$env:API_HOST = '127.0.0.1'
$env:API_PORT = '8795'
$env:AIG_LLM_PROVIDER = 'ollama'
$env:AIG_LLM_MODEL = 'phi4-mini:latest'
$env:LOCAL_LLM_BASE_URL = 'http://127.0.0.1:11434/v1'
$env:LOCAL_LLM_MODEL = 'phi4-mini:latest'
$env:MODEL_TIMEOUT_SECONDS = '28'
& $phase05Python -m agentic_intent_gate.main
```

With the existing Ollama service running, open **http://127.0.0.1:8095/home**. If 8095/8795 is occupied, select free ports and keep the Workbench AIG URL aligned; do not terminate the occupant.

1. Use local development sign-in if shown. Confirm the Workbench form, not only the welcome page.
2. Submit a fresh synthetic release ID with PASS, zero failed tests, and two references. Observe loading, READY/LOW, reasons, references, PROPOSED status and the audit event.
3. Expand **Review saved plan** and inspect the JSON and SHA-256 digest. Approve it, then run local reference validation. Require EXECUTED, the local-only result and separate approval/execution audit entries.
4. Create another fresh release, reject it, and verify there is no execute control. Create a FAIL/three-failed-tests release; require BLOCKED/HIGH and disabled approval.
5. Select previous releases with **Saved release**, reload the page, then stop/restart only this workbench against the same manual DB. Verify the same states/digests/audit remain.
6. Request `Read the service-demo record` in AIG preview. Require the read-only structured plan. Stop only the AIG process started in this manual terminal and retry; require a bounded error and no execution.
7. Check a narrow viewport, keyboard navigation, error recovery, and no overlapping submission. Record actual observed results; none of these browser steps has been marked PASS by automation here.
