# Phase 0 AIG Reuse Audit

Audit date: 2026-10-26. All reads against the sibling `../agentic-intent-gate` checkout were read-only. Its working tree was clean on `main`; HEAD was `7f635adf13f105cf4ed8408766c47e612048773c`. The v0.2.0 tag resolves to `7261fdd2f47d2b15fabe8faac527eeee37338eb1`; v0.3.0 resolves to `bb8e8fb1234128613a750bee17967b225072bb14`. The code under test is the v0.3.0 source. The repository's full current suite passed **1,626 tests, 5 deselected**. An isolated instance was started on `127.0.0.1:8787` with a SQLite file under the system temporary directory and no writes to the original AIG database.

## Findings and reuse matrix

| Component | Source path | Version / runtime | Evidence | Dependencies | Reuse method | Difficulty | Originality impact |
|---|---|---|---|---|---|---|---|
| `POST /api/plans` | `src/agentic_intent_gate/api/local_http.py`; `tests/test_plans_api.py` | v0.3.0, Python / FastAPI | Current suite passed; live isolated request with `phi4-mini:latest` returned `PlanValidated` and a valid single read-only step | Existing AIG service and selected local model | **WRAPPER_REQUIRED** | Low; bounded JSON over loopback | Credits a pre-existing planning backend; new product workflow remains separate |
| Intent parsing and bounds | `src/agentic_intent_gate/domain/contracts.py`; API tests | Python | Contract tests in the current suite; live intent produced a parsed plan | AIG package | **DIRECT_REUSE** through HTTP | Low | Existing AIG behavior |
| Plan schema | `src/agentic_intent_gate/domain/contracts.py` | Python dataclasses/contracts | Current contract suite; live response matches the documented wire schema | AIG package | **WRAPPER_REQUIRED**; TypeScript adapter mirrors only the accepted subset | Low | Schema is attributed to AIG |
| Semantic/allowlist validation | `src/agentic_intent_gate/domain/validation.py` | Python | Current suite includes plan validation/security tests; live response accepted by AIG | AIG catalog and validator | **DIRECT_REUSE** at the isolated HTTP boundary | Low | AIG retains its own trust boundary |
| Provider selection | `src/agentic_intent_gate/configuration.py`; runtime/provider factories | Python | 1,626-test suite includes provider configuration tests; active isolated run selected Ollama | Ollama or provider credential for cloud modes | **DO_NOT_REUSE** inside this repository; leave provider configuration in AIG | Medium | Avoids porting/duplicating provider lifecycle |
| Ollama adapter | `src/agentic_intent_gate/infrastructure/llm/local_openai.py` | Python, OpenAI-compatible Ollama endpoint | Real isolated AIG planning request succeeded with `phi4-mini:latest` | Existing Ollama install/model | **DIRECT_REUSE** as a service capability | Low | Pre-existing local model integration |
| OpenAI adapter | Provider implementation under `src/agentic_intent_gate/infrastructure/llm/` | Python | Mocked adapter/error tests passed within current suite; no live paid call was made | OpenAI credential and network | **DO_NOT_REUSE** in Phase 0 | Medium; credential and spend boundary | Pre-existing only; not exercised live |
| Anthropic adapter | Provider implementation under `src/agentic_intent_gate/infrastructure/llm/` | Python | Mocked adapter/error tests passed within current suite; no live paid call was made | Anthropic credential and network | **DO_NOT_REUSE** in Phase 0 | Medium; credential and spend boundary | Pre-existing only; not exercised live |
| Planning/model budgets | `src/agentic_intent_gate/application/generate_plan.py`; configuration and provider adapters | Python | Suite covers timeout/error states; live request completed within the configured 28-second model / 30-second route bounds | Local or cloud provider | **DIRECT_REUSE** by calling service endpoint | Low | Remains owned by AIG |
| Single-step execution, Approval/Authorization and replay controls | AIG runtime, `src/agentic_intent_gate/application/`, domain, infrastructure and consumer tests | Python | Current suite covers them; not invoked during this Phase 0 integration | AIG state and action adapters | **DO_NOT_REUSE** in this app | High; separate durable state and effect boundary | Keep AIG's established execution system distinct |
| Error handling, request isolation and audit/observability | `src/agentic_intent_gate/api/`, application and infrastructure layers | Python | Current suite exercises malformed requests, isolated requests, and failure outcomes; live endpoint returned a valid structured response | AIG service | **WRAPPER_REQUIRED**; adapter normalizes errors and validates bounded responses | Low | Existing AIG internals remain separate |

Classification terms follow the requested audit vocabulary. Source and current tests establish implementation evidence; the one live planning request establishes only this local path. It does not establish cloud-provider availability or real plan execution.

## v0.2.0 versus v0.3.0

The v0.2.0 tag is the stable baseline and includes the plan endpoint. v0.3.0 keeps the planning contract while adding provider selection and further execution-boundary work. The selected plan contract is `POST /api/plans` with `{"text":"..."}` and a `PlanValidated` response containing `goal`, `target`, `steps`, and `risk_class`. This consumer uses only one pinned `get_service_record/1` read-only step for `service-demo`. It rejects additional fields, other targets/tools/versions, side-effect risk, malformed JSON, oversized bodies, redirect responses, and requests exceeding its 30-second budget.

The current v0.3.0 source was separately tested; the v0.2.0 results were not used as proof that v0.3.0 passes. The audit identified no need to copy Python code or the AIG repository into this TypeScript application.

## Architecture choice

**Selected: Option A — HTTP Backend Reuse**, restricted to planning. The code is independently runnable, the endpoint is tested, and an isolated instance with temporary state was started safely. The live request returned a validated read-only plan. `AIG_API_BASE_URL` is a project-local, non-secret setting and is accepted only as an HTTP loopback origin. No AIG plan is executed from this application.

Option B, a selective TypeScript port, duplicates parsing and semantic validation while creating drift risk. Option C would avoid the AIG dependency but discard the existing tested intent-to-plan service. Both could reduce short-term operational coupling, but the audited API and isolated integration make the narrow Option A wrapper the lowest-risk evidence-backed choice for Phase 0.

Operational limitations: both processes must run locally; the AIG worker uses the existing Ollama model; its response time can make UI planning slower than the deterministic release Action; and the AIG endpoint is not exposed beyond loopback. Cloud providers were not contacted. A later hosted design would need authenticated service-to-service transport, deployment operations, and independent threat review.

## Phase 0.5 additional evidence — 2026-10-27

The selected architecture is unchanged. The registered Workbench `plan-with-aig` Action was now invoked over authenticated HTTP and successfully traversed the actual TypeScript adapter to an owned AIG instance on `127.0.0.1:8795`, using an isolated database under ignored `data/phase05/integration/2026-10-26T17-01-33-872Z/`. It returned `PlanValidated`, one `get_service_record/1` step for `service-demo`, and `READ_ONLY`. The isolated AIG database hash was unchanged by planning. After stopping that owned backend, the Workbench returned a bounded `503/aig_unavailable` and performed no execution.

The AIG source checkout remains clean and source/tests still match the v0.3.0 tag. Its full test suite was not rerun; the 1,626-pass result above remains historical. This new result establishes the **live adapter** gate, while React display and browser E2E remain BLOCKED. See `PHASE05-TEST-REPORT.md` for the distinction between controlled fixtures, live HTTP integration, and missing browser evidence.
