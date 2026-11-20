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
