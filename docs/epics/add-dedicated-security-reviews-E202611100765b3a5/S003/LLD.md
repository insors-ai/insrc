<!-- insrc:artifact LLD-0765b3a578e43eec-s3 -->

# LLD: STORY-0765b3a578e43eec-s3 — Run and report a security-only review

## Summary

**Epic:** `add-dedicated-security-reviews`
**HLD base run:** `wf-1795324517306-yi2irl`
**HLD effective hash:** `60b05edbecc2...`
**Tracker:** [insors-ai/insrc#228](https://github.com/insors-ai/insrc/issues/228)

This Story adds the module that actually runs a dedicated security review: it dispatches the code-vulnerability pass through the CLI model s1 selected, folds in the dependency advisories s2 already collected, drives the review through two rounds using the review framework's existing shared machinery, and assembles one report that clearly separates confirmed findings from gaps it could not verify. Nothing in this report is a new data shape -- it is built entirely out of the already-typed SecurityFinding and VerificationReceipt records.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Interaction with shared contracts](#4-interaction-with-shared-contracts)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)

## 1. HLD context

> See **HLD-0765b3a578e43eec** § 2. Framework summary

**Rollout phase:** Phase B -- run and report the security-only review
**Owns:** `sc3` (SecurityReviewEntryPoint)
**Consumes:** `sc1` (SecurityModelSelection), `sc2` (SecurityAdvisoryEvidence)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Model-tier resolution, availability/credential checks, and no-silent-fallback blocker-reporting stay private to s1; only SecurityModelSelection crosses its boundary. — owns `sc1`
- `s2`: pkg_audit's package-manager resolution, controller-equivalent-access dependency collection, contentIdentity computation and per-manager destination recording stay private to s2; only SecurityAdvisoryEvidence crosses its boundary. — owns `sc2`

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `runSecurityReview`

```typescript
function runSecurityReview(repoPath: string, targets: ReviewTargets, opts: { readonly reviewId: string; readonly modelSelection: SecurityModelSelection; readonly advisoryEvidence: SecurityAdvisoryEvidence; readonly now: string; readonly epicHash?: string; readonly storyId?: string }): Promise<SecurityReviewReport>
```

**Parameters:**
- `repoPath: string` — The registered repo root every targets.entries path is validated against.
- `targets: ReviewTargets` — The review's content scope; recomputed against to verify s2's pinned contentIdentity.
- `opts: { reviewId, modelSelection, advisoryEvidence, now, epicHash?, storyId? }` — The review's identity plus s1's and s2's already-resolved outputs. epicHash/storyId are OPTIONAL: supplied (reviewing inside an existing tracked Epic/Story) -> threaded directly into persistVerificationReceipt's ident with standalone left unset; omitted -> derived via deriveReceiptIdentity with standalone:true.

**Returns:** `Promise<SecurityReviewReport>` — The final, in-memory assembled report.

**Errors:**
- `ContentIdentityMismatchError` when recomputed contentIdentity does not match advisoryEvidence.contentIdentity, or contentStable is false -- checked before round 1, again before round 2, and again before finalization.
- `SecurityModelUnavailableError` when modelSelection.status is 'unavailable'.

**Preconditions:**
- modelSelection and advisoryEvidence are already resolved by s1/s2.
- targets.entries paths all resolve inside repoPath (validated before any I/O).

**Postconditions:**
- The ENTIRE body runs inside `runInStepContext({ ...currentStepContext(), cwd: repoPath, envRepo: repoPath }, ...)` (`src/shared/step-context.ts`) -- spreading the OUTER context first (preserving `connectionExecution`/`client` exactly as `src/shared/step-context.ts:195`'s own established pattern does) and overriding only `cwd`/`envRepo`. Passing `{cwd, envRepo}` alone (dropping `connectionExecution`) would make `runInStepContext` itself reject the call with `session-expired` whenever the request already carries a trusted binding (`ctx.connectionExecution !== outer` when `outer` is defined) -- this is why the spread, not a fresh literal, is required.
- contentIdentity is reverified (`verifyContentIdentityMatch`) a SECOND time immediately before round 2 dispatches and a THIRD time immediately before persisting round 2's receipt/report; any divergence detected at either point aborts the review with `ContentIdentityMismatchError`, distinct from s2's own `contentStable` (which covers only s2's OWN collection window, not s3's).
- A fresh `attemptId` (`randomBytes(8).toString('hex')`) is generated ONCE per `runSecurityReview` call -- NOT derived from `reviewId` alone, which a caller may reuse across retries. Each round's `receipt.id` is `{reviewId}-{attemptId}-round-{round}`, so a failed attempt's receipt is never silently overwritten by a later retry's receipt under the same id (`persistVerificationReceiptUnlocked` replaces any PRIOR receipt sharing the exact same id -- confirmed by reading `receipt-record.ts`'s own merge logic -- so reusing `reviewId-round-N` across attempts would erase the earlier failure's evidence).
- ONE VerificationReceipt is persisted PER ROUND, corroborating that round's OWN CLI-dispatch EXECUTION only (pass: the round's code pass completed with schema-valid output and no execution-level failure; fail: a timeout, malformed output, or a content-identity divergence caught during that round) -- an EXECUTION-auditability receipt, matching the HLD's own observability framing ("a security review's execution is auditable independent of its findings"), NOT an independent reproduction/exploit-confirmation of any specific claim. A round that throws still persists its own 'fail' receipt via a per-round try/catch before the error propagates. A refusal BEFORE any round starts persists nothing.
- receiptId is attached ONLY to the code findings a round's OWN execution actually produced: round-1 code findings get round 1's `receipt.id`, round-2 code findings get round 2's `receipt.id`. Dependency-advisory findings (s2's output, never produced by either round's CLI execution) get NO receiptId -- there is no round-execution receipt that corroborates them, and attaching one would misrepresent what was actually verified.
- On success both receipts exist and the scratch folder is cleaned up via finalizeAndCleanup; on a pre-flight refusal, neither a receipt nor a checkpoint exists.

### 2.2 `buildSecurityRoundHooks`

```typescript
function buildSecurityRoundHooks(repoPath: string, targets: ReviewTargets, modelSelection: SecurityModelSelection, reviewId: string): RoundDriverHooks<SecurityFinding>
```

**Parameters:**
- `repoPath: string` — Threaded into the security hook for path validation.
- `targets: ReviewTargets` — Closed over by the returned hooks.
- `modelSelection: SecurityModelSelection` — The pinned model identity.
- `reviewId: string` — Logging context only.

**Returns:** `RoundDriverHooks<SecurityFinding>` — {reviewKind:'code', checkpointGranularity:'round', ground: async()=>[], security: runSecurityCodePass bound to these args}.

**Preconditions:**
- modelSelection.status is 'configured'.

**Postconditions:**
- hooks.ground never performs I/O.

### 2.3 `runSecurityCodePass`

```typescript
function runSecurityCodePass(repoPath: string, targets: ReviewTargets, modelSelection: SecurityModelSelection, round: number): Promise<readonly SecurityFinding[]>
```

**Parameters:**
- `repoPath: string` — The cwd for ReadOnlySessionOpts.
- `targets: ReviewTargets` — Scopes the prompt.
- `modelSelection: SecurityModelSelection` — Supplies the pinned modelId.
- `round: number` — 1 initial, 2 correction-and-re-review.

**Returns:** `Promise<readonly SecurityFinding[]>` — Structured findings from the CLI session's schema-validated output.

**Errors:**
- `ReadOnlySessionTimeoutError` when the session exceeds its deadline.

**Preconditions:**
- This is the RoundDriverHooks.security implementation.

**Postconditions:**
- Dispatched with READ_ONLY_SESSION_READ_TOOLS + READ_ONLY_SESSION_ANALYZE_TOOLS only.

### 2.4 `verifyContentIdentityMatch`

```typescript
function verifyContentIdentityMatch(repoPath: string, targets: ReviewTargets, advisoryEvidence: SecurityAdvisoryEvidence): Promise<void>
```

**Parameters:**
- `repoPath: string` — Passed through to computeContentIdentity.
- `targets: ReviewTargets` — The SAME targets s2 was given.
- `advisoryEvidence: SecurityAdvisoryEvidence` — Carries the pinned contentIdentity and contentStable flag.

**Returns:** `Promise<void>` — Resolves silently on a match.

**Errors:**
- `ContentIdentityMismatchError` when computeContentIdentity(repoPath, targets) !== advisoryEvidence.contentIdentity, or contentStable===false.

**Preconditions:**
- Called before round 1, again before round 2, and again before finalization (runSecurityReview's own responsibility -- see § 2.1 postconditions), never just once.

### 2.5 `deriveReceiptIdentity`

```typescript
function deriveReceiptIdentity(contentIdentity: string): { readonly epicHash: string; readonly storyId: string }
```

**Parameters:**
- `contentIdentity: string` — The review's pinned content identity.

**Returns:** `{ epicHash: string; storyId: string }` — `epicHash = createHash('sha256').update('security-review:'+contentIdentity).digest('hex').slice(0,16)` -- exactly 16 lowercase hex characters, matching this codebase's own artifact-id convention (`src/workflow/tracker/resolve.ts`'s `LLD_RE`/`STORY_RE`: `/^...-([0-9a-f]{16})-(s\d+)\..../`); `storyId` = the fixed literal `'s1'` (matches the SAME regex's `(s\d+)` group and `admission.ts`'s `/^s\d+$/` check -- `'s-security'` does NOT match and was rejected by both probes this round).

**Preconditions:**
- contentIdentity is non-empty.

**Postconditions:**
- Pure and synchronous; no new persistent mapping table.
- Tested through the REAL receipt persistence/read-back path (`persistVerificationReceipt` + `readReceiptRecord`), not just as a string-shape unit test, so an id the storage layer itself rejects is caught here rather than first in production.

### 2.6 `assembleSecurityReport`

```typescript
function assembleSecurityReport(advisoryEvidence: SecurityAdvisoryEvidence, codeFindings: readonly SecurityFinding[], reconciliation: readonly ReconciliationResult[], receipts: { readonly round1: VerificationReceipt; readonly round2: VerificationReceipt }, modelSelection: SecurityModelSelection, baseReport: { readonly path: string; readonly markdown: string }): SecurityReviewReport
```

**Parameters:**
- `advisoryEvidence: SecurityAdvisoryEvidence` — Supplies confirmed matches plus unresolved/unavailable gaps.
- `codeFindings: readonly SecurityFinding[]` — Round 2's own output.
- `reconciliation: readonly ReconciliationResult[]` — Attached for audit only.
- `receipts: { round1: VerificationReceipt; round2: VerificationReceipt }` — Both rounds' persisted receipts; round 1's id is stamped onto dependency-advisory findings and round 1's code findings, round 2's id onto round 2's code findings.
- `modelSelection: SecurityModelSelection` — FR001's "record the effective model in the report" -- carried into `SecurityReviewReport.effectiveModel` and into supplementalMarkdown, never re-resolved.
- `baseReport: { path, markdown }` — renderReviewReport's own unmodified output.

**Returns:** `SecurityReviewReport` — {findings, unresolvedDependencies, unavailableSources, reconciliation, receipts, effectiveModel: {provider, modelId}, baseReportMarkdown, supplementalMarkdown} -- never persisted.

**Preconditions:**
- Called once, after both rounds and both receipts exist.

**Postconditions:**
- Round-1 and round-2 CODE findings carry `receiptId: receipts.round1.id` / `receiptId: receipts.round2.id` respectively -- the round whose OWN execution actually produced them.
- Dependency-advisory findings (from advisoryEvidence) carry NO receiptId: no round-execution receipt corroborates them, since they were never produced by either round's CLI dispatch.
- unresolvedDependencies/unavailableSources carried through verbatim.
- effectiveModel is copied from modelSelection as-dispatched (status:'configured' always, by this point) -- never re-derived from config, so the report always names the model that ACTUALLY ran, not whatever is currently configured.

### 2.7 `handleSecurityReviewStep`

```typescript
function handleSecurityReviewStep(request: SecurityReviewStepRequest): Promise<SecurityReviewStepResponse>
```

This IS `sc3` -- the daemon IPC method + MCP tool (`insrc_security_review_step`) body, mirroring `insrc_code_review_step`'s phase-driven shape and confirm_wait-on-stale-index pattern, collapsed to a single always-daemon-reviews branch.

**Parameters:**
- `request: SecurityReviewStepRequest` — A fresh `phase:'start'` request (repo/targets/epicHash?/storyId?) or a resumption after confirm_wait (`{phase:'start', state, proceed}`).

**Returns:** `Promise<SecurityReviewStepResponse>` — `{next:'confirm_wait', state, guidance}` when the repo's graph index is stale relative to the pinned content (the security model's own `insrc_analyze`/`insrc_analyze_step` drill-down tool calls would otherwise read stale data) and the caller has not yet said `proceed`; otherwise `{next:'done', report, markdown}` after running the whole review end-to-end: `resolveSecurityModel` (s1), `collectDependencyAdvisories` (s2), then `runSecurityReview` (s3's own orchestrator).

**Errors:**
- `ContentIdentityMismatchError` — propagated unchanged from `runSecurityReview`.
- `SecurityModelUnavailableError` — propagated unchanged from `runSecurityReview`.

**Preconditions:**
- This is the ONLY function the daemon IPC handler and the `insrc_security_review_step` MCP tool call -- neither registers its own orchestration logic.

**Postconditions:**
- A resume call (`state` + `proceed:false`) runs the review against the index as-is, the same as code-review's degraded/diff-based review path, never silently waiting again.
- A resume call (`state` + `proceed:true`) waits for the index to catch up (bounded) before running the review.
- epicHash/storyId on the ORIGINAL request, if supplied, are passed straight through into `runSecurityReview`'s opts unchanged; handleSecurityReviewStep itself never re-derives or second-guesses them.
- The repo-binding fix (`runInStepContext`) and the per-round receipt/content-identity logic live inside `runSecurityReview`, not duplicated here -- handleSecurityReviewStep is a thin phase/resume wrapper only.

## 3. Data model changes

### 3.1 `SecurityReviewReport` — new

The Story's own in-memory return shape, never persisted as a tracked artifact (resolved open question qfab24fea). {findings, unresolvedDependencies, unavailableSources, reconciliation, receipts: {round1, round2}, effectiveModel: {provider, modelId}, baseReportMarkdown, supplementalMarkdown}. `receipts` is a PAIR (one per round, matching the HLD's "every checkpointed round is recorded as a VerificationReceipt"); each receipt corroborates ONLY that round's own CLI-dispatch execution (pass/fail of the dispatch itself), never a specific finding's reproduction -- `findings[].receiptId` is therefore set ONLY on the code findings the corresponding round actually produced, and left unset on dependency-advisory findings. `effectiveModel` carries FR001's "record the effective model in the report" requirement, copied from the modelSelection actually dispatched, never re-resolved.

```typescript
interface SecurityReviewReport {
	readonly findings: readonly SecurityFinding[];
	readonly unresolvedDependencies: readonly string[];
	readonly unavailableSources: readonly string[];
	readonly reconciliation: readonly ReconciliationResult[];
	readonly receipts: { readonly round1: VerificationReceipt; readonly round2: VerificationReceipt };
	readonly effectiveModel: { readonly provider: string; readonly modelId?: string };
	readonly baseReportMarkdown: string;
	readonly supplementalMarkdown: string;
}
```

**Call sites:**
- `src/workflow/review-round/finding.ts`
- `src/workflow/review-round/receipt-record.ts:42`
- `src/workflow/review-round/reconciliation.ts:30`

### 3.2 `ContentIdentityMismatchError` — new

Thrown by verifyContentIdentityMatch on a recomputed-identity mismatch or advisoryEvidence.contentStable===false, at any of the three points runSecurityReview checks it.

**Call sites:**
- `docs/epics/add-dedicated-security-reviews-E202611100765b3a5/S002/LLD.md`

### 3.3 `SecurityReviewStepRequest` / `SecurityReviewStepResponse` — new

The daemon IPC method's and insrc_security_review_step MCP tool's own request/response shapes (sc3's interfaceSketch). A fresh request carries repo/targets/epicHash?/storyId?; a resumption after confirm_wait carries state+proceed. The response is either confirm_wait (with a state token to resume) or done (with the SecurityReviewReport and its rendered markdown).

**Call sites:**
- `src/daemon/steps/analyze-step/phases/start.ts:77`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | runSecurityReview reads modelSelection as-is, refusing with blockerReason on 'unavailable', otherwise threading modelId into buildSecurityRoundHooks -> runSecurityCodePass, and into assembleSecurityReport's effectiveModel. |
| `sc2` | consumes | verifyContentIdentityMatch recomputes identity against advisoryEvidence (at entry, before round 2, and before finalization); assembleSecurityReport maps matches/unresolvedDependencies/unavailableSources through unchanged. |
| `sc3` | implements | handleSecurityReviewStep IS sc3: it is the daemon IPC method + MCP tool body. On a fresh request it checks the repo's index freshness via resolveRepoLastIndexedAt(repoPath) against the request's targets; if stale, it returns confirm_wait with a state token rather than silently running the model's drill-down tools against outdated graph data. Otherwise -- or on a resumed proceed:true/false call -- it resolves sc1 (resolveSecurityModel) and sc2 (collectDependencyAdvisories) itself, then calls runSecurityReview and returns done. |

## 5. Error paths

**Error cases**

- **Recomputed contentIdentity over targets does not match advisoryEvidence.contentIdentity (at entry).** (recoverable)
  - Detection: verifyContentIdentityMatch compares the two strings byte-for-byte before any round runs.
  - Response: Throw ContentIdentityMismatchError(expected, actual, contentStable); no round dispatches, no receipt persisted.
  - User impact: The review is refused outright; the caller must re-run s2's collection against current content.
- **advisoryEvidence.contentStable is false.** (recoverable)
  - Detection: verifyContentIdentityMatch checks this flag even when identity strings match.
  - Response: Throw ContentIdentityMismatchError with contentStable:false; same refusal path.
  - User impact: The review is refused; the caller re-runs s2's collection for a stable read.
- **modelSelection.status is 'unavailable'.** (recoverable)
  - Detection: runSecurityReview checks status before constructing any hooks.
  - Response: Throw SecurityModelUnavailableError(blockerReason); no fallback model is attempted.
  - User impact: The review reports the exact blocker instead of silently using a different model.
- **runSecurityCodePass's CliProvider.runReadOnlySession call exceeds its deadline.** (recoverable)
  - Detection: ReadOnlySessionTimeoutError thrown by runReadOnlySession itself, never internally retried.
  - Response: Propagated out of runSecurityCodePass -> hooks.security -> runReviewRound, but FIRST caught by runSecurityReview's own per-round try/catch: a result:'fail' VerificationReceipt is persisted for THAT round (round1 or round2, whichever was executing) before the error is rethrown. No automatic resumption is attempted: round-1 findings are never durably cached anywhere resumable (writeCheckpoint stores only {reviewId, lastCompletedUnit}, not the findings themselves), so a retry of the WHOLE runSecurityReview call restarts cleanly at round 1 -- this is a deliberate restart-always design, not an unintended gap: readCheckpoint is read only for observability (surfacing that a prior attempt existed), never to skip a round.
  - User impact: The review fails for that round, but the failure itself is now durably recorded (a 'fail' receipt), not silently lost; a retry always restarts at round 1, deterministically, rather than attempting a partial resume the design cannot actually support.
- **contentIdentity, reverified immediately before round 2 or before persisting round 2's receipt/report, no longer matches the value verified before round 1 (a persistent edit during round 1 or between rounds).** (recoverable)
  - Detection: verifyContentIdentityMatch is called a second and third time (not just once before round 1); a mismatch at either point is detected the same way as the original pre-flight check.
  - Response: Throw ContentIdentityMismatchError; a result:'fail' VerificationReceipt is persisted for the round that was executing when the divergence was caught, then the error propagates -- the review never finalizes a report against content different from what round 1 (and s2's advisories) actually reviewed.
  - User impact: A review is aborted mid-run rather than silently producing a report whose findings describe two different trees; the caller must restart once the repository is back to a stable state.
- **The caller's own session repo (whatever resolveRepoPath(undefined) would resolve to) differs from the explicit repoPath this review targets.** (recoverable)
  - Detection: Without binding, checkpoint.ts/reconciliation.ts/review-report.ts's own ambient resolveRepoPath(undefined) calls would silently resolve to the CALLER's repo, not repoPath.
  - Response: runSecurityReview wraps its entire body in runInStepContext({ ...currentStepContext(), cwd: repoPath, envRepo: repoPath }, ...) (src/shared/step-context.ts) -- spreading the outer context FIRST so an already-bound connectionExecution/client survive unchanged, and overriding only cwd/envRepo -- so every nested helper call binds to the SAME explicit repoPath, never the ambient session repo, WITHOUT dropping a trusted execution binding the request already carried (a bare {cwd, envRepo} literal would make runInStepContext itself reject the call with session-expired whenever the request is already bound).
  - User impact: A caller working in repo A can request (and get) a review correctly scoped to a different repo B -- findings, checkpoints, reports and receipts never split across repositories, and an already-attached/bound request is never rejected as a side effect of this fix.
- **A caller retries runSecurityReview with the SAME reviewId after an earlier attempt's round failed (e.g. after the timeout case above).** (recoverable)
  - Detection: persistVerificationReceiptUnlocked (receipt-record.ts) replaces any PRIOR receipt sharing the exact same id -- confirmed by reading its own merge logic (kept = prior.receipts.filter(r => r.id !== receipt.id)); reusing {reviewId}-round-N across attempts would silently erase the earlier failure's receipt.
  - Response: Each runSecurityReview call generates a fresh attemptId (randomBytes(8).toString('hex')) once, and every receipt.id for that call is {reviewId}-{attemptId}-round-{round} -- a retry's receipts never collide with a prior attempt's, so both the failed attempt's 'fail' receipt and the successful retry's 'pass' receipt persist as distinct entries in the Story's RECEIPTS record.
  - User impact: The full execution history (failed attempt, successful retry) stays auditable in one RECEIPTS record, rather than the retry's success silently overwriting evidence that an earlier attempt failed.
- **finalizeAndCleanup's durable-copy step throws.** (recoverable)
  - Detection: finalizeAndCleanup's own documented contract leaves the scratch folder intact on a durable-copy failure.
  - Response: Propagated unchanged; the already-persisted VerificationReceipts are not rolled back.
  - User impact: The caller sees the persistence failure, but the receipts and round outputs are not lost.
- **reconcileRound returns a verdicts array whose length does not match priorFindings.length.** (terminal)
  - Detection: reconcileRound's own internal check throws before returning.
  - Response: Propagated unchanged; s3 does not paper over a reconciliation-module internal-contract violation.
  - User impact: The review fails with the reconciliation module's own error.
- **targets.entries contains a path outside repoPath.** (recoverable)
  - Detection: s3's own path-containment check, run before any I/O.
  - Response: Throw synchronously before computeContentIdentity or any CLI dispatch.
  - User impact: The review is refused immediately with a clear out-of-scope-path message.
- **The repo's graph index is stale relative to the pinned content when handleSecurityReviewStep's first phase:'start' call is made.** (recoverable)
  - Detection: resolveRepoLastIndexedAt(repoPath) returns a timestamp older than the content the request targets.
  - Response: Return {next:'confirm_wait', state, guidance} instead of running any round; the caller must re-call with {phase:'start', state, proceed} to continue.
  - User impact: The controller is asked whether to wait for a fresh index (more accurate drill-down) or proceed anyway (degraded, since the model's own insrc_analyze/insrc_analyze_step tool calls would read stale data) -- never silently one or the other.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| The code pass finds zero findings and advisoryEvidence.matches is also empty. | SecurityReviewReport.findings is empty; a VerificationReceipt pair with result:'pass' is still persisted (one per round). |
| advisoryEvidence.matches is non-empty but unresolvedDependencies is also non-empty. | Both reported distinctly: confirmed matches become findings, unresolvedDependencies carried through verbatim, never merged. |
| Round 2 finds zero findings where round 1 found some. | reconcileRound classifies round 1's findings 'no-longer-surfaced'; findings reflect round 2's own result. |
| targets.entries is empty. | computeContentIdentity still produces a stable identity; the code pass is expected to return zero findings -- a well-defined degenerate review, not an error. |
| A manager has mode:'unsupported' alongside others that succeeded. | supplementalMarkdown surfaces the unsupported manager as an explicit coverage gap, distinct from successfully-audited managers' findings. |
| A resumed call supplies proceed:false. | handleSecurityReviewStep runs the review against the index as-is; this is a DEGRADED run (equivalent to code-review's diff-only path), not an error -- the report is still fully populated, just potentially grounded on stale drill-down data for the model's own tool calls. |
| Two concurrent runSecurityReview calls target different repos (A and B) from sessions that otherwise share the same ambient cwd. | Each call's own runInStepContext scope is independent (AsyncLocalStorage, not a global/process-wide override) -- A's helpers resolve to A, B's to B, even though both run concurrently in the same process. |

**Invariants to preserve**

- The reviewer runs with the same host access as the controller itself -- no sandboxing, egress restriction, or filesystem confinement beyond CliProvider.runReadOnlySession's own tool allowlist. [[c1]]
- Cloud inference for the security review's code pass uses the installed CLI provider, never a direct REST call. [[c2]]

## 6. Test strategy

**Test framework:** `node:test`

**Test levels**

- **unit** — Exercise s3's own pure/deterministic logic without any real CLI session, filesystem, or network I/O.
  - Subjects: `deriveReceiptIdentity -- same contentIdentity always re-derives the identical pair; different identities derive different pairs.`, `verifyContentIdentityMatch -- resolves on a match with contentStable:true; throws on mismatch; throws on contentStable:false even when identity matches.`, `assembleSecurityReport -- confirmed matches map to dependency-advisory SecurityFindings with checkId:'dependency-advisory' and the correct round's receiptId stamped; unresolvedDependencies/unavailableSources pass through verbatim; empty inputs produce an empty findings array; effectiveModel copied verbatim from the passed-in modelSelection.`, `buildSecurityRoundHooks -- hooks.ground always resolves to [] without I/O; hooks.security delegates to the injected code-pass function.`, `deriveReceiptIdentity's output is exercised through the REAL persistVerificationReceipt + readReceiptRecord round trip (not just asserted as a string shape) -- catches an id the storage layer itself would reject.`
- **integration** — Exercise runSecurityReview's full orchestration against the real review-round/ machinery, with only the CLI session faked via an injected test double.
  - Subjects: `runSecurityReview end-to-end: round 1, correction round 2, reconciliation, a real persisted+read-back VerificationReceipt pair, and real checkpoint cleanup.`, `runSecurityReview refuses before any round dispatches on a contentIdentity mismatch.`, `runSecurityReview refuses before any round dispatches on modelSelection.status:'unavailable', verified via the fake CLI session never being called.`, `A clean-run case still persists a VerificationReceipt pair with result:'pass'.`, `handleSecurityReviewStep: a stale-index fresh request returns confirm_wait with a state token, never runs a round; a resumed call with proceed:true or proceed:false both reach done; epicHash/storyId supplied on the request are threaded into the persisted receipt unchanged (standalone unset), while an omitted pair is derived via deriveReceiptIdentity with standalone:true.`, `runSecurityReview persists ONE VerificationReceipt per round (round1, round2), each with the correct result ('pass' on success, 'fail' on that round's own execution failure); a round-1 failure persists only round1's fail receipt and never dispatches round 2.`, `runSecurityReview reverifies contentIdentity before round 2 and before finalization; a repository edit injected between round 1 and round 2 in the test fixture is caught and aborts with ContentIdentityMismatchError, with round1's receipt already durably persisted as 'pass' from before the edit.`, `runSecurityReview run with repoPath=B while the test harness's own ambient cwd is A: writeCheckpoint/reconcileRound/renderReviewReport/finalizeAndCleanup all read/write under B, verified by asserting on B's own .insrc/tmp/<reviewId>/ contents, never A's -- proves the runInStepContext binding, not a global test override.`, `SecurityReviewReport.effectiveModel matches the modelSelection actually passed in, in a case where it differs from the repo's currently-configured tier default (proving the report never re-resolves configuration).`, `runSecurityReview invoked from inside an ALREADY-BOUND step context (a real connectionExecution set via runInStepContext in the test, mirroring a genuine attached-request caller) succeeds -- the previous ambient-cwd-only test (A vs B repos with no connectionExecution bound) would NOT have caught the session-expired rejection this fixes, since that rejection only fires when an outer binding already exists.`, `Two sequential runSecurityReview calls with the SAME reviewId -- the first failing a round, the second succeeding -- persist TWO distinct receipts per round slot (different attemptId), both readable back via readReceiptRecord; the first attempt's 'fail' receipt is never overwritten by the second's 'pass'.`, `assembleSecurityReport leaves receiptId unset on every dependency-advisory finding, and sets it only on the code findings produced by the matching round -- verified by asserting the field's presence/absence per finding, not just its value.`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac3` | `unit: assembleSecurityReport separates confirmed matches from unresolved/unavailable gaps`, `integration: runSecurityReview end-to-end populates SecurityFinding/VerificationReceipt unchanged`, `unit: supplementalMarkdown surfaces fixability/evidence/coverage gaps`, `integration: handleSecurityReviewStep end-to-end -- a fresh request with a fresh index reaches done directly; a stale index reaches confirm_wait first (proves ac3's 'when a user requests a security review' actually has a caller-invocable trigger).`, `integration: runSecurityReview persists a per-round VerificationReceipt pair with correctly-formatted (16-hex epicHash, s\d+ storyId) identity, readable back through readReceiptRecord, and the report carries effectiveModel -- closing all four HIGH + two MED findings from the revision-2 review.`, `integration: runSecurityReview inside an already-bound step context succeeds (preserves connectionExecution); a failed-then-retried attempt under the same reviewId leaves both receipts intact; receiptId is attached only where a round's own execution actually produced the finding -- closing the revision-3 review's 2 HIGH + 1 MED findings.` |

## 7. Alternatives considered

### 7.1 a1: Security-hook adapter, no-op ground — **CHOSEN**

Supply hooks.security as the real CliProvider.runReadOnlySession adapter (matching the HLD's own literal framing) and hooks.ground as a trivial, zero-cost function that always resolves to [] -- runReviewRound's unconditional ground call costs nothing extra since it never performs I/O.

s3's new orchestrator module builds one RoundDriverHooks<SecurityFinding> object per review: ground=async()=>[] (a one-line, synchronous-resolving no-op -- a security-only review has no general code-quality ground pass to run, and review-round's own ground pass belongs to a sibling Story, out of scope here), security=the real adapter that resolves s1's SecurityModelSelection, builds the code-review prompt/schema, calls CliProvider.runReadOnlySession with s1's pinned modelId against repoPath/targets, and maps the structured result into SecurityFinding[] (plus s2's SecurityAdvisoryEvidence folded in as dependency-advisory SecurityFindings). The module calls runReviewRound(reviewId, hooks, round, targets) for round 1 and round 2 (correction-and-re-review), reconcileRound between them, writeCheckpoint after each, renderReviewReport for the base report, persistVerificationReceipt once per round (ident derived from contentIdentity per q860d1b4e, or threaded from the caller), finalizeAndCleanup last. This is the ONLY alternative whose wiring matches the HLD's own stated framework text verbatim ('supplies review-round's existing RoundDriverHooks.security hook as a thin adapter').

**Rejected because:** Winner -- not rejected.

### 7.2 a2: Real logic in ground, security left undefined

Put the real CliProvider adapter in hooks.ground directly and leave hooks.security undefined, since ground always runs and the field names are otherwise interchangeable at the type level.

Same orchestrator and same runReviewRound/reconcileRound/checkpoint/report/receipt calls as a1, but the roles of ground and security are swapped: hooks.ground is the real adapter, hooks.security is omitted (driver.ts's own code treats hooks.security as optional and skips calling it when undefined, exactly mirroring a1's no-op case from the other side).

**Rejected because:** Functionally equivalent to a1 but contradicts the HLD's literal hooks.security framing for no compensating benefit.

### 7.3 a3: Bypass runReviewRound with a dedicated security-review loop

Write s3's own round-loop, reconciliation-call, and checkpoint-call sequencing directly, instead of going through the shared runReviewRound entry point.

s3 implements its own async function that performs the same sequence runReviewRound already performs (call the security logic for round N, concatenate results) but inline, without calling driver.ts's runReviewRound at all -- reasoning that a security-only review has no 'ground' concept and the two-hook abstraction is unnecessary overhead for a caller that only ever wants one kind of finding.

**Rejected because:** Bypasses and duplicates the already-built, shared runReviewRound/RoundDriverHooks machinery the HLD explicitly says to reuse.

## 8. References

- **[[c1]]** `code` `src/workflow/review-round/driver.ts:24`
- **[[c2]]** `code` `src/workflow/review-round/reconciliation.ts:242`
- **[[c3]]** `code` `src/workflow/review-round/checkpoint.ts:33`
- **[[c4]]** `code` `src/workflow/review-round/review-report.ts:1`
- **[[c5]]** `code` `src/workflow/review-round/receipt-record.ts:42`
- **[[c6]]** `code` `src/agent/providers/cli-provider.ts:526`
- **[[c7]]** `code` `src/workflow/review-round/security-finding.ts:1`
- **[[c8]]** `prior-artifact` `LLD-0765b3a578e43eec-s2`
- **[[c9]]** `code` `src/daemon/steps/analyze-step/phases/start.ts:77`
- **[[c10]]** `code` `src/mcp/server.ts:668`
- **[[c11]]** `code` `src/shared/step-context.ts:139`
- **[[c12]]** `code` `src/workflow/tracker/resolve.ts:84`
- **[[c13]]** `code` `src/workflow/review-round/checkpoint.ts:66`
- **[[c14]]** `stakeholder` `External reviewer finding (revision 2 review, 4 HIGH + 2 MED): invalid receipt identity format, checkpoint mistaken for verification execution, no mid-review content-identity revalidation, shared helpers resolving the wrong repository, checkpoint-recovery contradiction, missing effective-model in the report. All six confirmed against real code this round and fixed in revision 3.`
- **[[c15]]** `code` `src/shared/step-context.ts:195`
- **[[c16]]** `code` `src/workflow/review-round/receipt-record.ts:175`
- **[[c17]]** `stakeholder` `External reviewer finding (revision 3 review, 2 HIGH + 1 MED): runInStepContext dropped the outer connectionExecution binding, VerificationReceipt corroboration was attached to findings it never verified, and fixed receipt ids collided across retries under the same reviewId. All three confirmed against real code this round and fixed in revision 4.`

## Citations

- **[[c1]]** `code` `src/workflow/review-round/driver.ts:24`
- **[[c2]]** `code` `src/workflow/review-round/reconciliation.ts:242`
- **[[c3]]** `code` `src/workflow/review-round/checkpoint.ts:33`
- **[[c4]]** `code` `src/workflow/review-round/review-report.ts:1`
- **[[c5]]** `code` `src/workflow/review-round/receipt-record.ts:42`
- **[[c6]]** `code` `src/agent/providers/cli-provider.ts:526`
- **[[c7]]** `code` `src/workflow/review-round/security-finding.ts:1`
- **[[c8]]** `prior-artifact` `LLD-0765b3a578e43eec-s2`
- **[[c9]]** `code` `src/daemon/steps/analyze-step/phases/start.ts:77`
- **[[c10]]** `code` `src/mcp/server.ts:668`
- **[[c11]]** `code` `src/shared/step-context.ts:139`
- **[[c12]]** `code` `src/workflow/tracker/resolve.ts:84`
- **[[c13]]** `code` `src/workflow/review-round/checkpoint.ts:66`
- **[[c14]]** `stakeholder` `External reviewer finding (revision 2 review, 4 HIGH + 2 MED): invalid receipt identity format, checkpoint mistaken for verification execution, no mid-review content-identity revalidation, shared helpers resolving the wrong repository, checkpoint-recovery contradiction, missing effective-model in the report. All six confirmed against real code this round and fixed in revision 3.`
- **[[c15]]** `code` `src/shared/step-context.ts:195`
- **[[c16]]** `code` `src/workflow/review-round/receipt-record.ts:175`
- **[[c17]]** `stakeholder` `External reviewer finding (revision 3 review, 2 HIGH + 1 MED): runInStepContext dropped the outer connectionExecution binding, VerificationReceipt corroboration was attached to findings it never verified, and fixed receipt ids collided across retries under the same reviewId. All three confirmed against real code this round and fixed in revision 4.`
