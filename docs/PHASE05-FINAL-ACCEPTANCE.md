# Phase 0.5 Final Acceptance

Date: 2026-10-27, Pacific/Auckland. **PHASE05_STATUS=PARTIAL; publication is user-authorized**. Phase 1 has not started.

| Gate | Result | Evidence and limit |
|---|---|---|
| Shared Action CLI | PASS | Valid structured business output, invalid-schema refusal, 3 standalone and 3 forwarded successes, normal exits using verified Node 24.22.1. Windows Node 26 forwarding assertion remains reproducible without the runtime workaround. |
| Shared Action React UI | BLOCKED | Source uses the same Action hooks and the correct `/home` route is served. No permitted browser surface is connected, so no actual UI Action invocation is claimed. |
| Live AIG adapter | PASS | Registered Workbench Action -> real TypeScript adapter -> isolated AIG -> Ollama -> one allowed `PlanValidated` step. AIG DB hash unchanged. |
| Persistence | PASS | Real application DB-close acknowledgement, normal process exit, fresh process, identical stored approval/digest and audit. |
| Approval | PASS | Unapproved, rejected, duplicate, missing, changed-plan, CLI and unproven HTTP attempts refused; exactly one bounded local simulation recorded. Automated consent was synthetic. |
| Unit / controlled HTTP fixtures | PASS | 26/26 tests in 5 files; typecheck and doctor exit 0. |
| Live application/process integration | PASS | 11 checks, including real backend call, outage behavior and restart recovery. |
| Real model Tool Calling | FAIL | Native phi4-mini returned assistant text, no protocol tool call; 0 successes, 1 failure. |
| Browser E2E | BLOCKED | No supported browser connection; native Edge policy restriction was respected. |
| Source security review | PASS | Scoped credential patterns and manual review found no publishable secrets/data; ignored test/runtime artifacts remain local. Finite scan coverage is documented. |

```text
PROJECT=Release Decision Workbench
PHASE=0.5
REPOSITORY_STATUS=EXISTING_PRESERVED
REMOTE_STATUS=PASS_EXPECTED_HTTPS
GITHUB_VISIBILITY=PUBLIC_UNCHANGED
BASELINE_COMMIT=fbbad3dc74a1cc4b5c063e8bc2eeecb509ac2845
FINAL_COMMIT=RECORDED_IN_GIT_HISTORY
NODE_STATUS=PASS_ISOLATED_24.22.1_GLOBAL_26.5.0_UNCHANGED
WINDOWS_LIBUV_STATUS=NODE26_FORWARDING_REPRODUCED_NODE24_WORKAROUND_VERIFIED
SHARED_ACTION_CLI_GATE=PASS
SHARED_ACTION_UI_GATE=BLOCKED
AIG_LIVE_ADAPTER_GATE=PASS
AIG_INTEGRATION_MODE=HTTP
PERSISTENCE_GATE=PASS
APPROVAL_GATE=PASS
REAL_LLM_GATE=FAIL
REAL_TOOL_CALL_STATUS=FAIL_0_SUCCESS_1_FAILURE
UNIT_TEST_STATUS=PASS_26_OF_26
INTEGRATION_TEST_STATUS=PASS_11_LIVE_CHECKS
E2E_GATE=BLOCKED
SECRET_SCAN_STATUS=PASS_SCOPED_PATTERN_AND_MANUAL_REVIEW
GIT_STATUS=PHASE05_CHANGES_PUSHED_TO_MAIN
GITHUB_PUSH_STATUS=PASS_DIRECT_USER_AUTHORIZATION
CORE_ACCEPTANCE=PARTIAL
PHASE05_STATUS=PARTIAL
PHASE1_READINESS=RECOVERY_ONLY
```

The starting repository was already committed/pushed; the request's older `8f06e6c`/dirty/no-push context was superseded by the live baseline. Publication was initially deferred because the actual React workflow and required browser E2E were still unverified. The user then directly authorized pushing these Phase 0.5 changes; they are published to `main` while acceptance remains **PARTIAL**. No tag, release, visibility change or deployment was made.

**Recommendation: recovery only.** Establish a permitted browser connection and complete the exact manual checklist in `PHASE05-TEST-REPORT.md`. Then, with separate authorization for its download if needed, test a local tool-capable model. Do not represent either missing result as PASS or begin Phase 1 automatically.

Reports: `PHASE05-RECOVERY-REPORT.md` explains causes and changes; `PHASE05-TEST-REPORT.md` records commands, evidence directories, limits, and manual instructions. Original Phase 0 findings remain in their existing documents.
