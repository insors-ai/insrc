<!-- insrc:artifact PLAN-03f4fd3b9102aab8-s1 -->

# Plan: STORY-03f4fd3b9102aab8-s1

## Summary

**Epic:** `review-rounds-reconciliation-recovery`
**LLD run:** `wf-1795095121944-ody2m8`
**LLD effective hash:** `6d57abfa68ac...`

Building this Story means adding one brand-new module, src/workflow/review-round/, with no existing code to extend: a types file for the three shared shapes (ReviewKind, RoundDriverHooks, RoundResult) and a driver file for the one function, runReviewRound, that every review round -- whatever round number, whatever review kind -- runs through. The second task adds the full named test suite proving round-number validation, both hooks' call/error behavior, the security-pass opt-out, and that reviewId passes through unchanged for downstream Stories to use.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add ReviewKind, RoundDriverHooks, RoundResult and the runReviewRound function | M | approved r1 | — | unit: a round 1 call invokes hooks.ground once with the complete targets and no prior-findings argument | [[c1]] [[c2]] [[c3]] |
| 2 | **`t2`** Add the full named test suite for runReviewRound | M | approved r1 | `t1` | unit: a round 1 call invokes hooks.ground once with the complete targets and no prior-findings argument; unit: a round 2 (Correction-and-Re-review) call invokes hooks.ground through the identical call shape as round 1, differing only in the round number passed; unit: hooks.ground receives the full targets/artifact unmodified -- nothing is stripped or withheld before grounding runs; unit: round 0 is rejected with a RangeError before any hook is called; unit: a negative round is rejected with a RangeError before any hook is called; unit: a non-integer round is rejected with a RangeError before any hook is called; unit: a rejecting hooks.ground propagates its rejection and hooks.security is never called for that round; unit: a rejecting hooks.security propagates its rejection rather than returning hooks.ground's findings alone; unit: an empty ReviewTargets.entries array is passed through to hooks.ground unchanged, with no special-casing; unit: opts omitted defaults runSecurityPass to true -- hooks.security runs when it is supplied; unit: opts.runSecurityPass:false suppresses hooks.security even when it is supplied; unit: hooks.security undefined is a no-op, not a thrown error, when runSecurityPass is true or omitted; unit: a large round number (e.g. 50) runs through the identical code path as round 1, with no round-number-based branching; unit: reviewId never appears in hooks.ground's or hooks.security's own call arguments across round 1 and round 2, and is left available unchanged for the caller to thread on to the sc4/sc5 calls, never substituted for a different value | [[c4]] |

### 1.1 TASK-03f4fd3b9102aab8-s1-t1 — Add ReviewKind, RoundDriverHooks, RoundResult and the runReviewRound function

Create the new src/workflow/review-round/ module: types.ts exporting ReviewKind, RoundDriverHooks<F>, RoundResult<F> exactly as the LLD's dataModel section specifies, and driver.ts exporting runReviewRound(reviewId, hooks, round, targets, opts?) per the contract -- round validation (RangeError for non-positive-integer round), hooks.ground called once per round with the full targets, the optional nested hooks.security pass gated by opts.runSecurityPass, rejection propagation from both hooks, and reviewId threaded through unchanged with no re-derivation.

**Acceptance checks:**
- ReviewKind, RoundDriverHooks<F>, RoundResult<F> are exported exactly as the dataModel section specifies, with no extra or missing field
- runReviewRound throws a RangeError synchronously for round=0, a negative round, or a non-integer round, before any hook is called
- runReviewRound calls hooks.ground(targets, round) exactly once per call, with the complete targets and no prior-findings argument, for both round=1 and round>1
- When opts.runSecurityPass is not explicitly false and hooks.security is defined, hooks.security(targets, round) is also called once and its findings are merged into the same RoundResult
- A rejecting hooks.ground propagates its rejection and hooks.security is never called for that round; a rejecting hooks.security propagates its rejection rather than returning hooks.ground's findings alone
- reviewId is never derived, rewritten or substituted -- it is the same value the caller supplied, available for the caller to thread onward to sc4/sc5 calls

### 1.2 TASK-03f4fd3b9102aab8-s1-t2 — Add the full named test suite for runReviewRound

One it() per testStrategy.testLevels subject (14 total) in a new src/workflow/review-round/__tests__/driver.test.ts, matching ac1/ac2/ac3's acceptanceMapping.provingTests verbatim, using stub RoundDriverHooks with spyable ground()/security() and a minimal ReviewTargets fixture (populated and empty entries[]).

**Acceptance checks:**
- All 14 named test subjects from testStrategy.testLevels[0].subjects exist as individual it() cases with matching titles
- ac1, ac2 and ac3's acceptanceMapping.provingTests all pass
- npx tsx --test for the new test file passes with zero failures

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| a round 1 call invokes hooks.ground once with the complete targets and no prior-findings argument | `t1`, `t2` |
| a round 2 (Correction-and-Re-review) call invokes hooks.ground through the identical call shape as round 1, differing only in the round number passed | `t2` |
| hooks.ground receives the full targets/artifact unmodified -- nothing is stripped or withheld before grounding runs | `t2` |
| round 0 is rejected with a RangeError before any hook is called | `t2` |
| a negative round is rejected with a RangeError before any hook is called | `t2` |
| a non-integer round is rejected with a RangeError before any hook is called | `t2` |
| a rejecting hooks.ground propagates its rejection and hooks.security is never called for that round | `t2` |
| a rejecting hooks.security propagates its rejection rather than returning hooks.ground's findings alone | `t2` |
| an empty ReviewTargets.entries array is passed through to hooks.ground unchanged, with no special-casing | `t2` |
| opts omitted defaults runSecurityPass to true -- hooks.security runs when it is supplied | `t2` |
| opts.runSecurityPass:false suppresses hooks.security even when it is supplied | `t2` |
| hooks.security undefined is a no-op, not a thrown error, when runSecurityPass is true or omitted | `t2` |
| a large round number (e.g. 50) runs through the identical code path as round 1, with no round-number-based branching | `t2` |
| reviewId never appears in hooks.ground's or hooks.security's own call arguments across round 1 and round 2, and is left available unchanged for the caller to thread on to the sc4/sc5 calls, never substituted for a different value | `t2` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s1 contractDetails.api[0] (runReviewRound)`
- **[[c2]]** `prior-artifact` `LLD s1 dataModelChanges (ReviewKind, RoundDriverHooks, RoundResult)`
- **[[c3]]** `prior-artifact` `LLD s1 errorPaths`
- **[[c4]]** `prior-artifact` `LLD s1 testStrategy`
