<!-- insrc:artifact PLAN-0765b3a578e43eec-s3 -->

# Plan: STORY-0765b3a578e43eec-s3

## Summary

**Epic:** `add-dedicated-security-reviews`
**LLD run:** `wf-1795614445720-3htwai`
**LLD effective hash:** `4da1f568aafd...`

Finishes Story s3 by implementing the two remaining Tasks (t5: the sc3 entry-point body handleSecurityReviewStep, t6: wiring it as the insrc_security_review_step daemon IPC method + MCP tool) on top of the now-genuinely-built t1-t4. t1-t4 are carried forward with their real, already-verified acceptance checks and test names restored from git history after an earlier re-plan incorrectly replaced them with a false 'already built' placeholder.

## Contents

1. [Epic impact analysis](#1-epic-impact-analysis)
2. [Tasks](#2-tasks)
3. [Test-strategy coverage](#3-test-strategy-coverage)
4. [References](#4-references)

## 1. Epic impact analysis

**Stories covered:** `s1`, `s2`

Unchanged: s1's SecurityModelSelection and s2's dependency-advisory collection remain untouched by this re-plan -- it only corrects t4/t5/t6's stored acceptanceChecks/tests text to their real original content and reflects t3/t4's genuine completion.

**Sources:**
- /home/subho/work/dev/insors/insrc/.insrc/artifacts/BUILD-0765b3a578e43eec-s1.json
- /home/subho/work/dev/insors/insrc/.insrc/artifacts/BUILD-0765b3a578e43eec-s2.json
- /home/subho/work/dev/insors/insrc/.insrc/artifacts/BUILD-0765b3a578e43eec-s3.json

## 2. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Implement deriveReceiptIdentity, verifyContentIdentityMatch, and s3's new error/report types | S | draft r2 | — | unit: deriveReceiptIdentity: same contentIdentity re-derives the identical pair; a different identity derives a different pair; unit: deriveReceiptIdentity's output round-trips through a REAL persistVerificationReceipt + readReceiptRecord call without being rejected by the storage layer; unit: verifyContentIdentityMatch: resolves on a match with contentStable:true; throws on identity mismatch; throws on contentStable:false even when identity matches | [[c4]] |
| 2 | **`t2`** Implement buildSecurityRoundHooks and runSecurityCodePass | M | draft r2 | — | unit: buildSecurityRoundHooks: hooks.ground always resolves to [] without I/O; hooks.security delegates to the injected code-pass function; unit: CapabilityQualificationTable lookup for 'cli-claude' (qualified), 'cli-codex' (not qualified), 'ollama' (qualified trivially); unit: CliProvider.runReadOnlySession throwing UnqualifiedCapabilityPolicyError for an unqualified provider + capabilityPolicy:'strict-read-analyze' before spawning any subprocess | [[c1]] [[c2]] [[c3]] |
| 3 | **`t3`** Implement assembleSecurityReport | M | draft r2 | `t1` | unit: assembleSecurityReport: confirmed matches map to dependency-advisory SecurityFindings with checkId:'dependency-advisory'; unresolvedDependencies/unavailableSources pass through verbatim; empty inputs produce an empty findings array; unit: assembleSecurityReport leaves receiptId unset on every dependency-advisory finding, and sets it only on the code findings produced by the matching round | [[c4]] |
| 4 | **`t4`** Implement runSecurityReview | L | draft r2 | `t1`, `t2`, `t3` | unit: a targets.entries path resolving outside repoPath throws synchronously before any I/O is attempted; integration: runSecurityReview invoked from inside an ALREADY-BOUND step context (a real connectionExecution set via runInStepContext in the test) succeeds; integration: runSecurityReview refuses before any round dispatches on modelSelection.status:'unavailable', verified via the fake CLI session never being called; integration: runSecurityReview refuses before any round dispatches on a contentIdentity mismatch; integration: runSecurityReview persists ONE VerificationReceipt per round (round1, round2), each with the correct result; a round-1 failure persists only round1's fail receipt and never dispatches round 2; integration: runSecurityReview reverifies contentIdentity before round 2 and before finalization; a repository edit injected between round 1 and round 2 is caught and aborts with ContentIdentityMismatchError, with round1's receipt already durably persisted as 'pass' from before the edit; integration: runSecurityReview run with repoPath=B while the test harness's own ambient cwd is A: writeCheckpoint/reconcileRound/renderReviewReport/finalizeAndCleanup all read/write under B, never A; integration: SecurityReviewReport.effectiveModel matches the modelSelection actually passed in, in a case where it differs from the repo's currently-configured tier default; integration: two sequential runSecurityReview calls with the SAME reviewId -- the first failing a round, the second succeeding -- persist TWO distinct receipts per round slot (different attemptId); the first attempt's 'fail' receipt is never overwritten | [[c1]] [[c2]] [[c3]] |
| 5 | **`t5`** Implement handleSecurityReviewStep + SecurityReviewStepRequest/Response types | M | draft r2 | `t4` | integration: handleSecurityReviewStep: a stale-index fresh request returns confirm_wait with a state token, never runs a round; a resumed call with proceed:true or proceed:false both reach done; epicHash/storyId supplied on the request are threaded into the persisted receipt unchanged, while an omitted pair is derived via deriveReceiptIdentity with standalone:true | [[c1]] [[c6]] |
| 6 | **`t6`** Register the insrc_security_review_step daemon IPC method + MCP tool (sc3) | S | draft r2 | `t5` | smoke: calling the registered insrc_security_review_step tool end-to-end (fresh request, fresh index) returns a next:'done' response with a real report and markdown | [[c1]] [[c6]] |

### 2.1 TASK-0765b3a578e43eec-s3-t1 — Implement deriveReceiptIdentity, verifyContentIdentityMatch, and s3's new error/report types

Built and passed (commit 78f2e8441). Adds ContentIdentityMismatchError and SecurityModelUnavailableError, the in-memory SecurityReviewReport interface, deriveReceiptIdentity(contentIdentity), and verifyContentIdentityMatch(repoPath, targets, advisoryEvidence).

**Acceptance checks:**
- deriveReceiptIdentity(contentIdentity) returns {epicHash, storyId:'s1'} where epicHash is exactly 16 lowercase hex characters derived deterministically from contentIdentity; the SAME contentIdentity always re-derives the identical pair, a different one derives a different pair
- the derived identity round-trips through a REAL persistVerificationReceipt + readReceiptRecord call without being rejected by the storage layer's own id-shape checks
- verifyContentIdentityMatch resolves silently when computeContentIdentity(repoPath, targets) === advisoryEvidence.contentIdentity and advisoryEvidence.contentStable is true
- verifyContentIdentityMatch throws ContentIdentityMismatchError when the recomputed identity does not match advisoryEvidence.contentIdentity
- verifyContentIdentityMatch throws ContentIdentityMismatchError when contentStable is false even though the identity strings match

### 2.2 TASK-0765b3a578e43eec-s3-t2 — Implement buildSecurityRoundHooks and runSecurityCodePass

Built and passed (commits 2005164f4, 0354f78f5, plus the capabilityPolicy widening 92129cd47..8fb5a6f44).

**Acceptance checks:**
- buildSecurityRoundHooks's returned hooks.ground always resolves to [] without performing any I/O
- buildSecurityRoundHooks's returned hooks.security delegates to runSecurityCodePass bound to the exact repoPath/targets/modelSelection/reviewId the factory was called with
- runSecurityCodePass dispatches CliProvider.runReadOnlySession with capabilityPolicy:'strict-read-analyze', the pinned modelId from modelSelection, restricted to READ_ONLY_SESSION_READ_TOOLS + READ_ONLY_SESSION_ANALYZE_TOOLS
- a ReadOnlySessionTimeoutError from runReadOnlySession propagates out of runSecurityCodePass unchanged, never internally retried
- a pinned provider that fails qualification (e.g. cli-codex) causes runSecurityCodePass to propagate UnqualifiedCapabilityPolicyError unchanged, never silently substituting a different provider/model

### 2.3 TASK-0765b3a578e43eec-s3-t3 — Implement assembleSecurityReport

Built and passed (commit e08a38ca3).

**Acceptance checks:**
- confirmed advisoryEvidence.matches map to dependency-advisory SecurityFindings with checkId:'dependency-advisory' and NO receiptId set
- round-1 code findings carry receiptId === receipts.round1.id; round-2 code findings carry receiptId === receipts.round2.id
- unresolvedDependencies and unavailableSources pass through verbatim onto the returned SecurityReviewReport
- empty advisoryEvidence.matches and empty codeFindings together produce an empty findings array, never an error
- effectiveModel on the returned report equals modelSelection exactly as passed in, even when it differs from the repo's currently-configured tier default

### 2.4 TASK-0765b3a578e43eec-s3-t4 — Implement runSecurityReview

Built and passed (commits 358e14013, 087fee3ae).

**Acceptance checks:**
- a targets.entries path resolving outside repoPath throws synchronously before computeContentIdentity, any CLI dispatch, or any receipt persistence is attempted
- the entire call body runs under a step context bound to {cwd:repoPath, envRepo:repoPath} while preserving an outer connectionExecution exactly as src/shared/step-context.ts's own runInStepContext spread pattern requires -- a case with a REAL bound connectionExecution set beforehand succeeds, not just the unbound ambient-cwd case
- refuses before any round dispatches when modelSelection.status is 'unavailable', throwing SecurityModelUnavailableError with the blockerReason, and the fake CLI session is never called
- refuses before any round dispatches when the pre-flight verifyContentIdentityMatch fails, and no receipt is persisted
- persists exactly ONE VerificationReceipt per round (round1, round2), each 'pass' on a clean run; a round's own execution failure persists only that round's 'fail' receipt and never dispatches a later round
- reverifies contentIdentity immediately before round 2 and immediately before final persistence; a content change injected between round 1 and round 2 in a test fixture is caught and aborts with ContentIdentityMismatchError, with round 1's receipt already durably persisted as 'pass'
- two sequential calls with the SAME reviewId -- the first failing a round, the second succeeding -- persist TWO distinct receipts per round slot (different attemptId), both independently readable via readReceiptRecord; the first attempt's 'fail' receipt is never overwritten
- run with repoPath=B while the test harness's own ambient cwd is A: every nested helper (checkpoint, reconciliation, report render, cleanup) reads/writes under B only, never A
- epicHash/storyId supplied on the call are threaded directly into persistVerificationReceipt's ident with standalone left unset; when omitted, deriveReceiptIdentity's output is used with standalone:true
- on success both round receipts exist and finalizeAndCleanup has run; on a pre-flight refusal, neither a receipt nor a checkpoint exists

### 2.5 TASK-0765b3a578e43eec-s3-t5 — Implement handleSecurityReviewStep + SecurityReviewStepRequest/Response types

The sc3 entry-point body: on a fresh phase:'start' request, checks resolveRepoLastIndexedAt(repoPath) against the request's targets and returns {next:'confirm_wait', state, guidance} when stale and the caller has not said proceed; otherwise (or on a resumed call) resolves s1's SecurityModelSelection (resolveSecurityModel) and s2's SecurityAdvisoryEvidence (collectDependencyAdvisories) itself, then calls t4's runSecurityReview and returns {next:'done', report, markdown}.

**Acceptance checks:**
- a fresh request against a repo with a FRESH index reaches {next:'done'} directly, never confirm_wait
- a fresh request against a repo with a STALE index returns {next:'confirm_wait', state, guidance} without running resolveSecurityModel, collectDependencyAdvisories, or any round
- a resumed call ({phase:'start', state, proceed:true}) waits for the index before running the review end-to-end to done
- a resumed call ({phase:'start', state, proceed:false}) runs the review against the index as-is (a degraded run) and still reaches done with a fully populated report
- epicHash/storyId supplied on the ORIGINAL request are passed straight through into runSecurityReview's opts unchanged, never re-derived or second-guessed here
- ContentIdentityMismatchError and SecurityModelUnavailableError from runSecurityReview propagate out of handleSecurityReviewStep unchanged

### 2.6 TASK-0765b3a578e43eec-s3-t6 — Register the insrc_security_review_step daemon IPC method + MCP tool (sc3)

Wire handleSecurityReviewStep as the daemon's new IPC method and as the insrc_security_review_step MCP tool's phase-driven handler, mirroring insrc_code_review_step's registration shape.

**Acceptance checks:**
- insrc_security_review_step is registered as an MCP tool with the SecurityReviewStepRequest/SecurityReviewStepResponse shape, routed to handleSecurityReviewStep and nowhere else
- the daemon's step-call dispatch recognizes the new tool id the same way it already recognizes insrc_code_review_step/insrc_review_step for bound-connection-execution purposes
- calling the registered tool end-to-end (fresh request, fresh index) returns a next:'done' response with a real report and markdown, proving the registration -> handler wiring is live, not just type-checked

## 3. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| CapabilityQualificationTable lookup for 'cli-claude' (qualified), 'cli-codex' (not qualified), 'ollama' (qualified trivially) | `t2` |
| CliProvider.runReadOnlySession throwing UnqualifiedCapabilityPolicyError for an unqualified provider + capabilityPolicy:'strict-read-analyze' before spawning any subprocess | `t2` |
| CliProvider.runReadOnlySession dispatching normally for a qualified provider + capabilityPolicy:'strict-read-analyze' | `t2` |
| ReadOnlySessionOpts with capabilityPolicy omitted behaving identically to today (no qualification check runs) | `t2` |
| CliProvider.readOnlySessionOnce's retry attempts all carrying the identical capabilityPolicy value as the original call | `t2` |

## 4. References

- **[[c1]]** `prior-artifact` `LLD s3 contractDetails: runSecurityReview / capabilityPolicy dataModelChanges`
- **[[c2]]** `prior-artifact` `LLD s3 dataModelChanges: UnqualifiedCapabilityPolicyError`
- **[[c3]]** `prior-artifact` `LLD s3 dataModelChanges: CapabilityQualificationTable`
- **[[c4]]** `prior-artifact` `LLD s3 (pre-amendment revision): SecurityReviewReport, deriveReceiptIdentity, verifyContentIdentityMatch, assembleSecurityReport`
- **[[c6]]** `prior-artifact` `LLD s3 hldContextSlice.ownedContracts sc3 (SecurityReviewEntryPoint)`
