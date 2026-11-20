# Batch 04 — retired-review test migration

Approved ISSUE/LLD/PLAN: `03bd849749a52b41/s1`. This record grows per validated task; it does not claim the whole batch is complete.

## t1: boundary, client and label controls

| Prior assertion | Current control |
| --- | --- |
| Review stream returns fake successful data/progress | Review client rejects exact Design/Code unavailable response without input/prototype/dependency access. Real generic dispatcher stream preserves progress and done data. |
| Review stream synchronous handler failure, unknown method and wait cleanup | Generic dispatcher error/unknown-method controls complete and drain the request; cancellation observes abort, drops late frames and retains registered cleanup until settled. Retired review creates no active review request. |
| Grounding/freshness success or declined response | Retired client/socket-facing helpers reject exact Code response without handler/route work; unary success/null/error/throw formatting remains covered by supported cwd lookup. |
| codeReview freshness inFlight/pending fields | Obsolete active-review output; no current review reply exists. Existing indexing-port queue behavior is handled in t2 through its supported direct API, without reinstating review freshness. |
| workflowReviewStart obtains LifecycleService and emits done | Exact Design rejection before provider/lifecycle/review callbacks or frames. Existing human approval, actor identity, durable log, log-ahead-head refusal and registry checks remain in the same lifecycle suite. |
| Review implementation constructs model label | Active workflow attribution, role tier/floor/fallback and historical model rendering assertions remain; retired wrapper delegates to unavailable. |
| MCP review connections resolve repo/connect | Exact nonretryable review-unavailable envelopes preserve family/name/message with zero input getter reads and zero connect/resolve calls. |

Implementation changes tests only. The in-daemon review API no longer exposes an active stream transport; generic transport intent is therefore tested on real `directDispatch` with explicitly test-only methods, not synthetic success on review names. All original wait-text and inherited-property-method cases remain.

Baseline `74edb219-77b6-4119-8a4f-398720266f3c`: 12 tests, 7 pass/5 fail, no skips/cancellations. Final `f7ca31f0-4e21-4e20-9d4d-8d53f7f047fc`: all 12 pass, no skips/cancellations. Both used fresh full build and serial files on supported Node22; actual counts, fingerprints, TAP hashes and confirmed actor closure are in [before](review-test-evidence-2026-11-20/t1-before-results.json) and [final](review-test-evidence-2026-11-20/t1-final-results.json). An intermediate run exposed errors in the newly authored test import and error-envelope/async assertions; these were corrected without production changes. The final pass is a fresh owned run, not a sum of iterations.

No live provider, production automatic review, RPC classification change, qualification refresh or deprecated IDE compatibility was introduced. The issue-based tracker binding remains unavailable. Later tasks and final BUILD approval remain pending.

## t2: worker/token controls

| Prior assertion | Current control |
| --- | --- |
| Main-thread codeReview.freshness returns indexing work | Actual IndexingPortClient.codeIndexWorkFor still queries the real indexing worker and returns its work snapshot; retired freshness throws exact Code message without querying the port. |
| Code-review turns execute on shared-state worker | Retired review and review-step requests reject locally with the exact error and start no session worker; model check/approval still share one worker and supported analyze steps retain session-worker placement. |
| All four old token kinds survive idle release, including stable review tokens | Current analyze/workflow tokens mint/read/update across actual worker idle release; updates invalidate old tokens and preserve the other session's distinct payload. Both retired kinds reject with no result/token. |

The continuation hub intentionally shares saved state across workers; the new test proves separate tokens/payloads and worker ownership, not an invented cross-session saved-token secrecy guarantee. No production token kind, router classification or worker policy changed. No fake successful code-review handler remains in the router fixture.

Focused baseline `4e277f5d-7d43-4c8d-9ae7-a89118daaf4e` selected four relevant tests: one pass/three failures. Corrected focused run `2a90076f-f02e-49a7-b391-591e9e49db1e` passed all four with confirmed cleanup. Selection used an explicit test-name pattern; this is not a full-file suite result. The build gate will execute the complete mapped files, including real-worker tests. Exact scoped counts/TAP and selection notes are retained in the evidence directory.

The t2 gate subsequently passed root typecheck and all three full mapped files, including the real-daemon s3 session/CPU/idle-release/parity tests. [Gate evidence](review-test-evidence-2026-11-20/t2-gate-results.json) retains each test result from the daemon record; this is a separate execution from the focused four-test run.

## t3: non-green at blocker discovery (historical checkpoint)

Owned baseline `41db5e1d-3777-41d7-9971-b492067cd2b8` fails before running the matrix because the removed provenance writer module cannot load. The fixture now imports current `writeArtifact`, retains the same hostile-payload refusal assertion, and adds an explicit saved artifact write/read-back positive control.

A direct source-only diagnostic (no overlapping harness/build) reaches the real current API and fails at the unchanged privacy check: `prepareArtifactWrite` reads the payload getter before the `writeAtomic` persistence guard. Expected `unsupported-temporary`; observed private test canary exception. Saved artifact write/read-back passes before that assertion. [Retained failing TAP](review-test-evidence-2026-11-20/t3-current-writer-failure.tap) records the stack at workflow/storage.ts:279. Later matrix assertions have not executed and are not claimed passing.

This production defect is separately triaged as small bugfix [ISSUE-81be53b2b0f003a7](../standalone/refuse-temporary-artifact-preparation-before-payload-E2026112081be53b2/ISSUE.md), pending human approval. Proposed scope: early reuse of the current temporary-persistence guard before artifact payload/filesystem inspection, with poisoned-input and saved lifecycle/revision compatibility controls. No production fix is included in Batch04's test-only changes.

At blocker discovery, t1/t2 had passed validation; t3 remained non-green and dependent t4/t5 had not begun. No Batch04 BUILD approval is requested. The plan explicitly forbids weakening canary checks or marking a blocked task green; after the separately approved defect is fixed, resume the remaining matrix and inventory work.

## t3: resumed after the separately approved guard fix

ISSUE-81be53b2b0f003a7 is approved; commit `0d3505056` adds the early shared preparation guard and passed its independent build validation. Its BUILD still requires final human approval.

With that guard, the original persistence matrix passes in owned run `4ad062d7-7bd6-4128-8937-5eeb0e4e9a13`: one parent test, one nested matrix, zero failures/skips/cancellations, complete coverage and confirmed actor closure. [Results/TAP](review-test-evidence-2026-11-20/t3-final-results.json). The late runtime/session-expiry, hostile getter, executor refusal, task/cache/checkpoint/history/trace/graph/Lance canary checks remain unchanged and now all execute. The new current artifact saved write/read-back also succeeds. No obsolete writer export or production review work was restored, and no privacy assertion was weakened.

This supersedes the earlier blocked status for t3's local test outcome; task gate validation and t4/t5 still follow. The two matrix layers are not counted as independent top-level tests.

## t4: review isolation inventory replacements

The nine removed review fixture entries are explicitly mapped in `src/db/graph/__tests__/review-store-isolation.test.ts`:

- old review probe → current before-work unavailable contract;
- old code/workflow RPC suites → current endpoint refusal and human lifecycle wiring;
- old review step/routing suites → current MCP and in-daemon client refusal/transport controls;
- old spec approval, review, same-party and template suites → retained history readers and current human lifecycle/build completion gates.

The seven distinct replacement suites run serially in fresh temporary HOMEs, with positive TAP counts, zero fail/cancel/skip/todo, successful normal child completion and no default graph or Lance files. The audit uses managed children and no test-force-exit flag. Actual graph/Lance default-opening fixtures falsify both absence checks in their own temporary HOMEs; both are detected. These are nine child runs within one top-level audit, not nine independent top-level passes.

The unrelated general graph inventory stays in its original file with its valid analyze assertions intact. Its remaining failure is the existing analyze-step-handler child (two schema/state assertions), retained for Batch11. Moving the coherent retired-review portion to a focused audit allows its result to be assessed separately; no unrelated failing check was skipped or declared fixed. The unchanged vector audit passed on its full budget, so the historical 60-second cancellation is retained as an audit limit, not called a repaired defect.

Baseline `b96feb79-a04a-42ec-8496-a256dba356bf`: graph audit2pass/3fail and vector audit2pass, no skips/cancellations, confirmed cleanup. After `1d346e15-388e-46e1-8e77-a5e52f6caf0f`: general graph3pass/1fail plus replacement review audit1pass, no skips/cancellations, confirmed cleanup. The latter run remains non-green overall. Exact [before](review-test-evidence-2026-11-20/t4-before-results.json) and [after](review-test-evidence-2026-11-20/t4-after-results.json) evidence retains TAP/hash/fingerprint details.
