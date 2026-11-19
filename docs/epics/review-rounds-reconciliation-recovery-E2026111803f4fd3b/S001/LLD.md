<!-- insrc:artifact LLD-03f4fd3b9102aab8-s1 -->

# LLD: STORY-03f4fd3b9102aab8-s1 — Initial Review and Correction-and-Re-review share one round-driven execution process

## Summary

**Epic:** `review-rounds-reconciliation-recovery`
**HLD base run:** `wf-1794986545330-2wntv5`
**HLD effective hash:** `6d57abfa68ac...`
**Tracker:** [insors-ai/insrc#211](https://github.com/insors-ai/insrc/issues/211)

This Story adds the one shared function every review round runs through, whatever round number it is on and whatever kind of review it is. A caller supplies a small per-review-type hook set (sc1) plus the round's targets; the function always re-derives findings from scratch, never trusting a prior round's output. A review type that wants a security pass opts in with a flag on the call, defaulting to on, rather than a new kind of review -- the nested pass runs inside the same round, through the same discipline.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Interaction with shared contracts](#4-interaction-with-shared-contracts)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)
9. [Open questions](#9-open-questions)

## 1. HLD context

> See **HLD-03f4fd3b9102aab8** § 2. Framework summary

**Rollout phase:** Phase A — the shared round-driver
**Owns:** `sc1` (Review-type hook set)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s2`: Which exact per-review-type severity scales exist beyond the HIGH/MED default, and how a review type's Feedback implementation declares its own, stay internal to s2; no other Story's type depends on Finding's shape. — owns `sc2`
- `s3`: How the reconciliation LLM call is actually prompted, and how it reads the temp folder's audit trail when needed, stay internal to s3; no other Story's type depends on ReconciliationResult's internals beyond its verdict shape. — owns `sc3`
- `s4`: The exact docgen docType registration and MD rendering logic (including the resolved/still-open/contradicted annotation rule scoped to this round's own corrections) stay internal to s4; no other Story's type depends on the renderer's internals. — owns `sc4`
- `s5`: The exact per-review-type granularity mapping (round-level for design review, per-Task for code review) and the durable-copy-before-deletion mechanics stay internal to s5; no other Story's type depends on ReviewCheckpoint's internals beyond what sc1's round-driver needs to call it. — owns `sc5`

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `runReviewRound`

```typescript
function runReviewRound<F = unknown>(reviewId: string, hooks: RoundDriverHooks<F>, round: number, targets: ReviewTargets, opts?: { readonly runSecurityPass?: boolean }): Promise<RoundResult<F>>
```

**Parameters:**
- `reviewId: string` — Identifies which review this round belongs to -- threaded unchanged into every downstream call this round's cycle makes (the review-report docgen call, sc4, and the checkpoint/finalize calls, sc5, both of which require a reviewId of their own). Found missing from this signature in cross-review: without it, the round-driver had no way to construct those calls.
- `hooks: RoundDriverHooks<F>` — The per-review-type hook set (sc1): reviewKind, checkpointGranularity, the grounding/findings call, and an optional nested security pass.
- `round: number` — The round number (1 = Initial Review, >1 = Correction-and-Re-review). The only input that varies between an ac1 call and an ac2 call -- no other branching exists.
- `targets: ReviewTargets` — The full, reset-each-round scope to ground against (src/workflow/artifact-core/types.ts:345-347) -- always the entire scope, never a filtered subset of what a prior round already covered.
- `opts: { readonly runSecurityPass?: boolean }` _(optional)_ — Caller-side opt-out for the nested security pass. Defaults to true per the resolved cross-epic decision: when true and hooks.security is supplied, the security pass runs nested inside this same round, not as a separate reviewKind.

**Returns:** `Promise<RoundResult<F>>` — This round's self-contained finding set (plus any nested security findings merged in), produced solely from this call's own re-grounding -- never derived from or filtered by a prior round's output.

**Errors:**
- `RangeError` when round is not a positive integer (not Number.isInteger(round) or round < 1)

**Preconditions:**
- round >= 1
- targets is the Story's full ReviewTargets for this review, not a subset carried over from a prior round

**Postconditions:**
- hooks.ground(targets, round) is called exactly once, every round, with the complete targets and no prior-findings argument -- satisfies ac1 (round 1) and ac2 (round>1 via the identical call shape)
- When opts.runSecurityPass is not explicitly false and hooks.security is defined, hooks.security(targets, round) is also called once, nested inside this same round call, and its findings are merged into the same RoundResult -- the security pass never becomes a third reviewKind
- No submitter rationale carried on targets/the artifact is stripped, filtered or withheld before being handed to hooks.ground or hooks.security -- independence is enforced only by the hook implementation's own steering instructions (ac3/k2), never by this function removing content
- reviewId is passed through unchanged to every sc4/sc5 call this round's cycle makes (the review-report docgen call and the checkpoint/finalize calls) -- this function never derives, rewrites or substitutes a different reviewId.

## 3. Data model changes

### 3.1 `ReviewKind` — new

type ReviewKind = 'design' | 'code'; -- exactly the HLD's sc1 interfaceSketch, unchanged by the resolved security question (security runs nested, not as a third member).


### 3.2 `RoundDriverHooks` — new

interface RoundDriverHooks<F = unknown> { readonly reviewKind: ReviewKind; readonly checkpointGranularity: 'round' | 'task'; ground(targets: ReviewTargets, round: number): Promise<readonly F[]>; security?: (targets: ReviewTargets, round: number) => Promise<readonly F[]>; } -- adds .ground and optional .security to sc1's two HLD-sketched fields; F is left generic so this Story does not own Finding's shape (that is sc2, s2's contract).


### 3.3 `RoundResult` — new

interface RoundResult<F = unknown> { readonly round: number; readonly findings: readonly F[]; } -- the round-driver's own output shape; a self-contained finding set for exactly the round that was asked for, with the nested security pass's findings (when run) merged into the same array rather than kept in a separate channel.


## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | implements | RoundDriverHooks is authored here as sc1's concrete shape, implementing the HLD interfaceSketch's reviewKind + checkpointGranularity fields verbatim and adding the .ground grounding call plus the optional .security nested hook that carries the resolved cross-epic security-pass decision. s2-s5 consume this same type; none of its fields change shape for them. |

## 5. Error paths

**Error cases**

- **round is not a positive integer (zero, negative, or non-integer)** (recoverable)
  - Detection: runReviewRound validates round at entry (!Number.isInteger(round) || round < 1) before invoking any hook
  - Response: throws a RangeError synchronously, before hooks.ground or hooks.security is ever called
  - User impact: the caller gets an immediate, local failure instead of a nonsensical round number reaching a hook and silently corrupting a checkpoint or finding set keyed by round
- **hooks.ground rejects (the grounding/findings call itself fails, e.g. an LLM call errors or times out)** (recoverable)
  - Detection: the Promise returned by hooks.ground rejects
  - Response: runReviewRound propagates the rejection unchanged to the caller and does not call hooks.security for that round
  - User impact: the caller sees the round as having failed outright, rather than getting back an empty finding set indistinguishable from "nothing was found"
- **hooks.security rejects while the nested security pass is in effect (hooks.security defined, opts.runSecurityPass not false)** (recoverable)
  - Detection: the Promise returned by hooks.security rejects, after hooks.ground has already resolved
  - Response: runReviewRound propagates the rejection rather than returning hooks.ground's findings alone -- a nested pass that failed must not be silently dropped from the round's result
  - User impact: the caller sees the whole round as failed instead of receiving a RoundResult that looks complete but silently omits the security pass's coverage

**Edge cases**

| Input | Expected |
| :--- | :--- |
| targets.entries is an empty array | hooks.ground(targets, round) is still called with the empty ReviewTargets exactly as supplied; runReviewRound does not special-case or reject an empty scope |
| opts is omitted entirely | runSecurityPass behaves as true (its documented default) -- hooks.security runs whenever it is supplied, with no need for the caller to pass opts at all |
| opts.runSecurityPass is explicitly false and hooks.security is defined | hooks.security is never called for that round; RoundResult.findings contains only hooks.ground's findings |
| hooks.security is undefined (this review type has no security hook) and opts.runSecurityPass is true or omitted | runReviewRound calls nothing for the security pass and does not throw -- an absent hook is a no-op, not a misconfiguration |
| round is a large number (e.g. round=50, many correction rounds deep) | runs through the identical code path as round=1 or round=2 -- no round-number-based branching beyond passing the number itself through to hooks.ground/hooks.security |

## 6. Test strategy

**Test framework:** `node:test, run via npx tsx --test (matches this epic's and the shared-reviewcontext-data-model epic's artifact-core test convention)`

**Test levels**

- **unit** — Prove runReviewRound's one-process-per-round contract (ac1/ac2/ac3), its round-number validation, and both hooks' error propagation and the security-pass opt-out, with stub hooks -- no real LLM calls needed since hooks.ground/hooks.security are caller-supplied functions.
  - Subjects: `a round 1 call invokes hooks.ground once with the complete targets and no prior-findings argument`, `a round 2 (Correction-and-Re-review) call invokes hooks.ground through the identical call shape as round 1, differing only in the round number passed`, `hooks.ground receives the full targets/artifact unmodified -- nothing is stripped or withheld before grounding runs`, `round 0 is rejected with a RangeError before any hook is called`, `a negative round is rejected with a RangeError before any hook is called`, `a non-integer round is rejected with a RangeError before any hook is called`, `a rejecting hooks.ground propagates its rejection and hooks.security is never called for that round`, `a rejecting hooks.security propagates its rejection rather than returning hooks.ground's findings alone`, `an empty ReviewTargets.entries array is passed through to hooks.ground unchanged, with no special-casing`, `opts omitted defaults runSecurityPass to true -- hooks.security runs when it is supplied`, `opts.runSecurityPass:false suppresses hooks.security even when it is supplied`, `hooks.security undefined is a no-op, not a thrown error, when runSecurityPass is true or omitted`, `a large round number (e.g. 50) runs through the identical code path as round 1, with no round-number-based branching`, `reviewId is passed unchanged into hooks.ground/hooks.security's own arguments-free of mutation across round 1 and round 2 calls, so a caller can thread it on to sc4/sc5 calls without this function ever substituting a different value`
  - Fixtures: `a stub RoundDriverHooks with a spyable ground() that records its call count and arguments`, `a stub RoundDriverHooks with an added spyable security() for the nested-pass tests`, `a minimal ReviewTargets fixture (both populated and empty entries[])`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `a round 1 call invokes hooks.ground once with the complete targets and no prior-findings argument` |
| `ac2` | `a round 2 (Correction-and-Re-review) call invokes hooks.ground through the identical call shape as round 1, differing only in the round number passed` |
| `ac3` | `hooks.ground receives the full targets/artifact unmodified -- nothing is stripped or withheld before grounding runs` |

## 7. Alternatives considered

### 7.1 a1: Single round-driver function + plain hooks object + boolean security flag — **CHOSEN**

One exported function, `runReviewRound(hooks, round, targets, priorRound?)`, taking sc1's RoundDriverHooks object plus a `runSecurityPass` boolean (default true) that nests the security pass inside the same round when set.

A new sibling module (e.g. src/workflow/review-round/driver.ts, outside review-history/) exports one function matching sc1's interfaceSketch: `RoundDriverHooks { reviewKind: 'design'|'code'; checkpointGranularity: 'round'|'task'; ground(targets, priorFindings?): Promise<FindingSet>; }` plus an entry function `runReviewRound(hooks: RoundDriverHooks, round: number, targets: ReviewTargets, opts?: { runSecurityPass?: boolean }): Promise<RoundResult>`. `runSecurityPass` defaults to true; when true, the driver runs hooks.ground for round N exactly the same way whether round===1 or round>1 (ac1/ac2), then -- as a nested step inside that same round, not a new reviewKind -- invokes a security sub-pass through a second, equally-shaped hook if the caller's hooks object supplies one (hooks.security?), using the identical re-grounding discipline (ac3): no structural stripping of submitter rationale. reviewKind stays exactly 'design'|'code' per the resolved cross-epic question; security is purely an optional nested hook, invoked when the caller both supplies hooks.security AND does not pass runSecurityPass:false. Round number is the only thing that varies the call -- no round-1-vs-round>1 branching inside the function body beyond passing priorFindings to reconciliation (s3's contract, not s1's).

### 7.2 a2: Stateful RoundDriver class, hooks injected via constructor

A `RoundDriver` class holds hooks + accumulated round state across a review's lifetime; `driver.runRound(round, targets)` advances it.

`class RoundDriver { constructor(hooks: RoundDriverHooks); runRound(round: number, targets: ReviewTargets): Promise<RoundResult>; }`. The class retains internal round history across calls so round>1 calls can look back without the caller re-passing prior state explicitly. Security nesting would be a constructor option (`{ runSecurityPass }`) fixed for the review's lifetime rather than per-call.

**Rejected because:** Introduces unrequested statefulness (fixed-at-construction security flag, retained round history) that adds risk relative to a1 without serving any acceptance criterion or consuming Story's stated need; scored partial on ac2.

### 7.3 a3: Discriminated-union hooks keyed by reviewKind, with per-kind runner functions

`RoundDriverHooks` becomes a discriminated union (`{reviewKind:'design'; ...} | {reviewKind:'code'; ...}`), dispatched through a lookup table of per-kind runner functions instead of one shared function.

Replace sc1's flat interfaceSketch with a union so each reviewKind's hook fields are independently typed, and add a `runnersByKind: Record<ReviewKind, (hooks, round, targets) => Promise<RoundResult>>` dispatch table the entry point selects from.

**Rejected because:** A per-kind dispatch table is structurally the per-review-type divergence lc1/ac2 explicitly rule out, and it replaces sc1's approved flat interfaceSketch with a discriminated union -- violates both ac2 and sc1.

## 8. References

- **[[c1]]** `analyze-bundle` `src/workflow/artifact-core/types.ts:345-347`
- **[[c2]]** `analyze-bundle` `src/workflow/artifact-core/types.ts:353`
- **[[c3]]** `analyze-bundle` `src/workflow/artifact-core/types.ts:356-361`
- **[[c4]]** `analyze-bundle` `src/workflow/artifact-core/types.ts:364-367`
- **[[c5]]** `analyze-bundle` `src/workflow/review-history/review/design-review/admission-checkpoint.ts`
- **[[c6]]** `analyze-bundle` `src/workflow/review-history/review/design-review/preparation-checkpoint.ts`
- **[[c7]]** `analyze-bundle` `src/workflow/review-history/review/design-review/checkpoint.ts`
- **[[c8]]** `analyze-bundle` `src/workflow/review-history/code-review/task-review/admission-checkpoint.ts`
- **[[c9]]** `analyze-bundle` `src/mcp/docgen/handler.ts`
- **[[c10]]** `analyze-bundle` `src/workflow/review-history/compatibility.ts`
- **[[c11]]** `analyze-bundle` `src/workflow/review-history/index.ts`
- **[[c12]]** `prior-artifact` `HLD-03f4fd3b9102aab8#sc1`

## 9. Open questions

- cd3 (partial at audit, resolved before this synthesis): api.errors was initially left empty despite s5 documenting a concrete RangeError for an invalid round; this synthesis adds { type: 'RangeError', condition: 'round is not a positive integer' } to runReviewRound's errors so the contract and error-paths sections agree.
- Cross-review (post-synthesis) found runReviewRound's original signature omitted reviewId entirely, even though the round-driver is the one Story that must call sc4's ReviewReportDocgenCall{reviewId, round} and sc5's writeCheckpoint/readCheckpoint/finalizeReview, all of which require a reviewId. Fixed by adding reviewId: string as this function's first parameter, with a postcondition that it is threaded through unchanged to those calls.

## Resolved questions

- `q7db2a4dc` — cd3 (partial at audit, resolved before this synthesis): api.errors was initially left empty despite s5 documenting a concrete RangeError for an invalid round; this synthesis adds { type: 'RangeError', condition: 'round is not a positive integer' } to runReviewRound's errors so the contract and error-paths sections agree.
  - **ignored**: left to implementer judgment — Not an actual open design question -- it's a changelog note recording that the cd3 audit gap (api.errors left empty) was already fixed within this same synthesis call. The LLD's contract details section 2.1 already lists the RangeError. _(2026-11-19T13:38:29.498Z)_

## Citations

- **[[c1]]** `analyze-bundle` `src/workflow/artifact-core/types.ts:345-347`
- **[[c2]]** `analyze-bundle` `src/workflow/artifact-core/types.ts:353`
- **[[c3]]** `analyze-bundle` `src/workflow/artifact-core/types.ts:356-361`
- **[[c4]]** `analyze-bundle` `src/workflow/artifact-core/types.ts:364-367`
- **[[c5]]** `analyze-bundle` `src/workflow/review-history/review/design-review/admission-checkpoint.ts`
- **[[c6]]** `analyze-bundle` `src/workflow/review-history/review/design-review/preparation-checkpoint.ts`
- **[[c7]]** `analyze-bundle` `src/workflow/review-history/review/design-review/checkpoint.ts`
- **[[c8]]** `analyze-bundle` `src/workflow/review-history/code-review/task-review/admission-checkpoint.ts`
- **[[c9]]** `analyze-bundle` `src/mcp/docgen/handler.ts`
- **[[c10]]** `analyze-bundle` `src/workflow/review-history/compatibility.ts`
- **[[c11]]** `analyze-bundle` `src/workflow/review-history/index.ts`
- **[[c12]]** `prior-artifact` `HLD-03f4fd3b9102aab8#sc1`
