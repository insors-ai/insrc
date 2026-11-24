<!-- insrc:artifact PLAN-0765b3a578e43eec-s3 -->

# Plan: STORY-0765b3a578e43eec-s3

## Summary

**Epic:** `add-dedicated-security-reviews`
**LLD run:** `wf-1795408910090-xsj3hr`
**LLD effective hash:** `60b05edbecc2...`

Building Story s3 means adding one new orchestration module (outside review-round/) that supplies review-round's existing RoundDriverHooks.security adapter, drives two full review rounds through the shared runReviewRound machinery, and assembles s1's selected model plus s2's dependency advisories into one in-memory report -- with zero new code required inside review-round/ itself. The hardest part is runSecurityReview's own invariants: binding every nested helper to the explicit repoPath (never the ambient session repo) while preserving an already-bound trusted execution context, re-verifying contentIdentity three times across the review's lifetime, and persisting exactly one execution-auditability VerificationReceipt per round under a fresh per-call attemptId so a retry never silently overwrites a prior failure's evidence. The final piece wires sc3 -- the daemon IPC method + insrc_security_review_step MCP tool -- as the actual caller-invocable trigger this Epic previously left unassigned, mirroring insrc_code_review_step's stale-index confirm_wait/resume pattern.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Implement deriveReceiptIdentity, verifyContentIdentityMatch, and s3's new error/report types | S | — | — | unit: deriveReceiptIdentity: same contentIdentity re-derives the identical pair; a different identity derives a different pair; unit: deriveReceiptIdentity's output round-trips through a REAL persistVerificationReceipt + readReceiptRecord call without being rejected by the storage layer; unit: verifyContentIdentityMatch: resolves on a match with contentStable:true; throws on identity mismatch; throws on contentStable:false even when identity matches | [[c1]] [[c2]] [[c3]] |
| 2 | **`t2`** Implement buildSecurityRoundHooks and runSecurityCodePass | S | — | — | unit: buildSecurityRoundHooks: hooks.ground always resolves to [] without I/O; hooks.security delegates to the injected code-pass function | [[c1]] [[c3]] |
| 3 | **`t3`** Implement assembleSecurityReport | M | — | `t1` | unit: assembleSecurityReport: confirmed matches map to dependency-advisory SecurityFindings with checkId:'dependency-advisory'; unresolvedDependencies/unavailableSources pass through verbatim; empty inputs produce an empty findings array; unit: assembleSecurityReport leaves receiptId unset on every dependency-advisory finding, and sets it only on the code findings produced by the matching round | [[c1]] [[c2]] [[c3]] |
| 4 | **`t4`** Implement runSecurityReview | L | — | `t1`, `t2`, `t3` | unit: a targets.entries path resolving outside repoPath throws synchronously before any I/O is attempted; integration: runSecurityReview end-to-end: round 1, correction round 2, reconciliation, a real persisted+read-back VerificationReceipt, and real checkpoint cleanup; integration: runSecurityReview refuses before any round dispatches on a contentIdentity mismatch; integration: runSecurityReview refuses before any round dispatches on modelSelection.status:'unavailable', verified via the fake CLI session never being called; integration: a clean-run case still persists a VerificationReceipt with result:'pass'; integration: runSecurityReview persists ONE VerificationReceipt per round (round1, round2), each with the correct result; a round-1 failure persists only round1's fail receipt and never dispatches round 2; integration: runSecurityReview reverifies contentIdentity before round 2 and before finalization; a repository edit injected between round 1 and round 2 is caught and aborts with ContentIdentityMismatchError, with round1's receipt already durably persisted as 'pass' from before the edit; integration: runSecurityReview run with repoPath=B while the test harness's own ambient cwd is A: writeCheckpoint/reconcileRound/renderReviewReport/finalizeAndCleanup all read/write under B, never A; integration: SecurityReviewReport.effectiveModel matches the modelSelection actually passed in, in a case where it differs from the repo's currently-configured tier default; integration: runSecurityReview invoked from inside an ALREADY-BOUND step context (a real connectionExecution set via runInStepContext in the test) succeeds; integration: two sequential runSecurityReview calls with the SAME reviewId -- the first failing a round, the second succeeding -- persist TWO distinct receipts per round slot (different attemptId); the first attempt's 'fail' receipt is never overwritten by the second's 'pass' | [[c1]] [[c2]] [[c3]] |
| 5 | **`t5`** Implement handleSecurityReviewStep + SecurityReviewStepRequest/Response types | M | — | `t4` | integration: handleSecurityReviewStep: a stale-index fresh request returns confirm_wait with a state token, never runs a round; a resumed call with proceed:true or proceed:false both reach done; epicHash/storyId supplied on the request are threaded into the persisted receipt unchanged, while an omitted pair is derived via deriveReceiptIdentity with standalone:true | [[c1]] [[c2]] [[c3]] [[c6]] |
| 6 | **`t6`** Register the insrc_security_review_step daemon IPC method + MCP tool (sc3) | S | — | `t5` | smoke: calling the registered insrc_security_review_step tool end-to-end (fresh request, fresh index) returns a next:'done' response with a real report and markdown | [[c1]] [[c6]] |

### 1.1 TASK-0765b3a578e43eec-s3-t1 — Implement deriveReceiptIdentity, verifyContentIdentityMatch, and s3's new error/report types

Add ContentIdentityMismatchError and SecurityModelUnavailableError (dataModelChanges), the in-memory SecurityReviewReport interface, deriveReceiptIdentity(contentIdentity) (pure, sha256-derived 16-hex epicHash + fixed 's1' storyId, tested through a real persistVerificationReceipt+readReceiptRecord round trip per the LLD's own postcondition), and verifyContentIdentityMatch(repoPath, targets, advisoryEvidence) (recomputes via computeContentIdentity, throws ContentIdentityMismatchError on a mismatch or on contentStable:false).

**Acceptance checks:**
- deriveReceiptIdentity(contentIdentity) returns {epicHash, storyId:'s1'} where epicHash is exactly 16 lowercase hex characters derived deterministically from contentIdentity; the SAME contentIdentity always re-derives the identical pair, a different one derives a different pair
- the derived identity round-trips through a REAL persistVerificationReceipt + readReceiptRecord call without being rejected by the storage layer's own id-shape checks
- verifyContentIdentityMatch resolves silently when computeContentIdentity(repoPath, targets) === advisoryEvidence.contentIdentity and advisoryEvidence.contentStable is true
- verifyContentIdentityMatch throws ContentIdentityMismatchError when the recomputed identity does not match advisoryEvidence.contentIdentity
- verifyContentIdentityMatch throws ContentIdentityMismatchError when contentStable is false even though the identity strings match

### 1.2 TASK-0765b3a578e43eec-s3-t2 — Implement buildSecurityRoundHooks and runSecurityCodePass

runSecurityCodePass(repoPath, targets, modelSelection, round) dispatches the code-vulnerability pass via CliProvider.runReadOnlySession with s1's pinned modelId, using READ_ONLY_SESSION_READ_TOOLS + READ_ONLY_SESSION_ANALYZE_TOOLS only, returning structured SecurityFinding[]. buildSecurityRoundHooks(repoPath, targets, modelSelection, reviewId) returns a RoundDriverHooks<SecurityFinding> with reviewKind:'code', checkpointGranularity:'round', ground:async()=>[] (a true no-op, no I/O), and security bound to runSecurityCodePass with these closed-over args -- matching the LLD's chosen alternative a1 exactly (hooks.security is the real adapter, hooks.ground is the documented no-op).

**Acceptance checks:**
- buildSecurityRoundHooks's returned hooks.ground always resolves to [] without performing any I/O
- buildSecurityRoundHooks's returned hooks.security delegates to runSecurityCodePass bound to the exact repoPath/targets/modelSelection/reviewId the factory was called with
- runSecurityCodePass dispatches CliProvider.runReadOnlySession with the pinned modelId from modelSelection, restricted to READ_ONLY_SESSION_READ_TOOLS + READ_ONLY_SESSION_ANALYZE_TOOLS
- a ReadOnlySessionTimeoutError from runReadOnlySession propagates out of runSecurityCodePass unchanged, never internally retried

### 1.3 TASK-0765b3a578e43eec-s3-t3 — Implement assembleSecurityReport

Pure function folding s2's SecurityAdvisoryEvidence (confirmed matches, unresolvedDependencies, unavailableSources), round 2's code findings, the reconciliation result, both rounds' persisted VerificationReceipts, and the dispatched modelSelection into one in-memory SecurityReviewReport. Round-1 and round-2 code findings get their OWN round's receipt.id; dependency-advisory findings get no receiptId at all (never produced by either round's CLI execution). effectiveModel is copied verbatim from modelSelection as-dispatched, never re-resolved.

**Acceptance checks:**
- confirmed advisoryEvidence.matches map to dependency-advisory SecurityFindings with checkId:'dependency-advisory' and NO receiptId set
- round-1 code findings carry receiptId === receipts.round1.id; round-2 code findings carry receiptId === receipts.round2.id
- unresolvedDependencies and unavailableSources pass through verbatim onto the returned SecurityReviewReport
- empty advisoryEvidence.matches and empty codeFindings together produce an empty findings array, never an error
- effectiveModel on the returned report equals modelSelection exactly as passed in, even when it differs from the repo's currently-configured tier default

### 1.4 TASK-0765b3a578e43eec-s3-t4 — Implement runSecurityReview

The Story's orchestrator: binds the entire call inside runInStepContext({...currentStepContext(), cwd:repoPath, envRepo:repoPath}, ...) (spreading the outer context first so an already-bound connectionExecution/client survive); checks targets.entries path containment synchronously before any I/O; refuses before any round on modelSelection.status:'unavailable' (SecurityModelUnavailableError) or on verifyContentIdentityMatch's failure; generates one fresh attemptId (randomBytes(8).toString('hex')) per call; drives round 1 and round 2 via runReviewRound with hooks from buildSecurityRoundHooks, reconciling with reconcileRound and writing a checkpoint after each; persists ONE VerificationReceipt per round under id `{reviewId}-{attemptId}-round-{round}` (via persistVerificationReceipt, using deriveReceiptIdentity's output when epicHash/storyId are not supplied on the call), with a per-round try/catch that persists a 'fail' receipt before rethrowing on that round's own execution failure; reverifies contentIdentity a second time before round 2 and a third time before final persistence, aborting with ContentIdentityMismatchError on any divergence; calls assembleSecurityReport and renderReviewReport, then finalizeAndCleanup on success.

**Acceptance checks:**
- a targets.entries path resolving outside repoPath throws synchronously before computeContentIdentity, any CLI dispatch, or any receipt persistence is attempted
- the entire call body runs under a step context bound to {cwd:repoPath, envRepo:repoPath} while preserving an outer connectionExecution exactly as src/shared/step-context.ts's own runInStepContext spread pattern requires -- a case with a REAL bound connectionExecution set beforehand (mirroring a genuine attached caller) succeeds, not just the unbound ambient-cwd case
- refuses before any round dispatches when modelSelection.status is 'unavailable', throwing SecurityModelUnavailableError with the blockerReason, and the fake CLI session is never called
- refuses before any round dispatches when the pre-flight verifyContentIdentityMatch fails, and no receipt is persisted
- persists exactly ONE VerificationReceipt per round (round1, round2), each 'pass' on a clean run; a round's own execution failure persists only that round's 'fail' receipt and never dispatches a later round
- reverifies contentIdentity immediately before round 2 and immediately before final persistence; a content change injected between round 1 and round 2 in a test fixture is caught and aborts with ContentIdentityMismatchError, with round 1's receipt already durably persisted as 'pass'
- two sequential calls with the SAME reviewId -- the first failing a round, the second succeeding -- persist TWO distinct receipts per round slot (different attemptId), both independently readable via readReceiptRecord; the first attempt's 'fail' receipt is never overwritten
- run with repoPath=B while the test harness's own ambient cwd is A: every nested helper (checkpoint, reconciliation, report render, cleanup) reads/writes under B only, never A
- epicHash/storyId supplied on the call are threaded directly into persistVerificationReceipt's ident with standalone left unset; when omitted, deriveReceiptIdentity's output is used with standalone:true
- on success both round receipts exist and finalizeAndCleanup has run; on a pre-flight refusal, neither a receipt nor a checkpoint exists

### 1.5 TASK-0765b3a578e43eec-s3-t5 — Implement handleSecurityReviewStep + SecurityReviewStepRequest/Response types

The sc3 entry-point body: on a fresh phase:'start' request, checks resolveRepoLastIndexedAt(repoPath) against the request's targets and returns {next:'confirm_wait', state, guidance} when stale and the caller has not said proceed; otherwise (or on a resumed call) resolves s1's SecurityModelSelection (resolveSecurityModel) and s2's SecurityAdvisoryEvidence (collectDependencyAdvisories) itself, then calls t4's runSecurityReview and returns {next:'done', report, markdown}. This is the ONLY function that owns the review's end-to-end sequencing of s1+s2+s3; the daemon IPC method and the MCP tool are both thin wrappers over it (t6).

**Acceptance checks:**
- a fresh request against a repo with a FRESH index reaches {next:'done'} directly, never confirm_wait
- a fresh request against a repo with a STALE index returns {next:'confirm_wait', state, guidance} without running resolveSecurityModel, collectDependencyAdvisories, or any round
- a resumed call ({phase:'start', state, proceed:true}) waits for the index before running the review end-to-end to done
- a resumed call ({phase:'start', state, proceed:false}) runs the review against the index as-is (a degraded run) and still reaches done with a fully populated report
- epicHash/storyId supplied on the ORIGINAL request are passed straight through into runSecurityReview's opts unchanged, never re-derived or second-guessed here
- ContentIdentityMismatchError and SecurityModelUnavailableError from runSecurityReview propagate out of handleSecurityReviewStep unchanged

### 1.6 TASK-0765b3a578e43eec-s3-t6 — Register the insrc_security_review_step daemon IPC method + MCP tool (sc3)

Wire handleSecurityReviewStep as the daemon's new IPC method and as the insrc_security_review_step MCP tool's phase-driven handler, mirroring insrc_code_review_step's registration shape in src/mcp/server.ts and the daemon's step-call dispatch (src/daemon/threads/router.ts, src/shared/step-context.ts's own bound-tool list) -- the actual caller-invocable entry point this HLD previously left unassigned.

**Acceptance checks:**
- insrc_security_review_step is registered as an MCP tool with the SecurityReviewStepRequest/SecurityReviewStepResponse shape, routed to handleSecurityReviewStep and nowhere else
- the daemon's step-call dispatch recognizes the new tool id the same way it already recognizes insrc_code_review_step/insrc_review_step for bound-connection-execution purposes
- calling the registered tool end-to-end (fresh request, fresh index) returns a next:'done' response with a real report and markdown, proving the registration -> handler wiring is live, not just type-checked

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| deriveReceiptIdentity -- same contentIdentity always re-derives the identical pair; different identities derive different pairs. | `t1` |
| verifyContentIdentityMatch -- resolves on a match with contentStable:true; throws on mismatch; throws on contentStable:false even when identity matches. | `t1` |
| assembleSecurityReport -- confirmed matches map to dependency-advisory SecurityFindings with checkId:'dependency-advisory' and receiptId stamped; unresolvedDependencies/unavailableSources pass through verbatim; empty inputs produce an empty findings array. | `t3` |
| buildSecurityRoundHooks -- hooks.ground always resolves to [] without I/O; hooks.security delegates to the injected code-pass function. | `t2` |
| deriveReceiptIdentity's output is exercised through the REAL persistVerificationReceipt + readReceiptRecord round trip (not just asserted as a string shape) -- catches an id the storage layer itself would reject. | `t1` |
| runSecurityReview end-to-end: round 1, correction round 2, reconciliation, a real persisted+read-back VerificationReceipt, and real checkpoint cleanup. | `t4` |
| runSecurityReview refuses before any round dispatches on a contentIdentity mismatch. | `t4` |
| runSecurityReview refuses before any round dispatches on modelSelection.status:'unavailable', verified via the fake CLI session never being called. | `t4` |
| A clean-run case still persists a VerificationReceipt with result:'pass'. | `t4` |
| handleSecurityReviewStep: a stale-index fresh request returns confirm_wait with a state token, never runs a round; a resumed call with proceed:true or proceed:false both reach done; epicHash/storyId supplied on the request are threaded into the persisted receipt unchanged (standalone unset), while an omitted pair is derived via deriveReceiptIdentity with standalone:true. | `t5` |
| runSecurityReview persists ONE VerificationReceipt per round (round1, round2), each with the correct result ('pass' on success, 'fail' on that round's own execution failure); a round-1 failure persists only round1's fail receipt and never dispatches round 2. | `t4` |
| runSecurityReview reverifies contentIdentity before round 2 and before finalization; a repository edit injected between round 1 and round 2 in the test fixture is caught and aborts with ContentIdentityMismatchError, with round1's receipt already durably persisted as 'pass' from before the edit. | `t4` |
| runSecurityReview run with repoPath=B while the test harness's own ambient cwd is A: writeCheckpoint/reconcileRound/renderReviewReport/finalizeAndCleanup all read/write under B, verified by asserting on B's own .insrc/tmp/<reviewId>/ contents, never A's -- proves the runInStepContext binding, not a global test override. | `t4` |
| SecurityReviewReport.effectiveModel matches the modelSelection actually passed in, in a case where it differs from the repo's currently-configured tier default (proving the report never re-resolves configuration). | `t4` |
| runSecurityReview invoked from inside an ALREADY-BOUND step context (a real connectionExecution set via runInStepContext in the test, mirroring a genuine attached-request caller) succeeds -- the previous ambient-cwd-only test (A vs B repos with no connectionExecution bound) would NOT have caught the session-expired rejection this fixes, since that rejection only fires when an outer binding already exists. | `t4` |
| Two sequential runSecurityReview calls with the SAME reviewId -- the first failing a round, the second succeeding -- persist TWO distinct receipts per round slot (different attemptId), both readable back via readReceiptRecord; the first attempt's 'fail' receipt is never overwritten by the second's 'pass'. | `t4` |
| assembleSecurityReport leaves receiptId unset on every dependency-advisory finding, and sets it only on the code findings produced by the matching round -- verified by asserting the field's presence/absence per finding, not just its value. | `t3` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s3 contractDetails.api`
- **[[c2]]** `prior-artifact` `LLD s3 dataModelChanges`
- **[[c3]]** `prior-artifact` `LLD s3 errorPaths`
- **[[c6]]** `prior-artifact` `LLD s3 hldContextSlice consumedContracts`
