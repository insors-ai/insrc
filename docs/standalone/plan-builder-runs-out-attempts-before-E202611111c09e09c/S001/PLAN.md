<!-- insrc:artifact PLAN-1c09e09cd985026b-s1 -->

# Plan: STORY-1c09e09cd985026b-s1

## Summary

**Epic:** `plan-builder-runs-out-attempts-before`
**LLD run:** `wf-1794409894097-wdlq72`
**LLD effective hash:** `e4ade4102c5b...`

The work is a small, ordered change inside the analyzer planner: first the one band table is moved into its own module, then the task-count check and the prompt's range wording are built on it, then the correction message and the retry loop learn to state the count beside another failure, and last the planner gets its own attempt limit. Each step keeps the existing tests green and adds its own tests, and the live docs regression is run after the change is installed.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Move the band table into a leaf planner module | S | — | — | unit: src/analyze/planner/__tests__/validate.test.ts: SCOPE_BAND values match the design doc; unit: src/analyze/planner/__tests__/validate.test.ts: the band module imports nothing from the validator or the renderer | [[c5]] [[c9]] |
| 2 | **`t2`** Expose the task-count check | S | — | `t1` | unit: src/analyze/planner/__tests__/validate.test.ts: the task-count check agrees with validatePlan at every band boundary; unit: src/analyze/planner/__tests__/validate.test.ts: validatePlan keeps its invariant order and results for the existing cases | [[c1]] [[c6]] [[c9]] |
| 3 | **`t3`** Print the enforced range in the depth policy | M | — | `t1` | unit: src/analyze/planner/__tests__/driver-unit.test.ts: renderDepthPolicy prints the INV-13 range for every scope and focus value, without halving wording; unit: src/analyze/planner/__tests__/driver-unit.test.ts: no duplicate band table in the renderer | [[c3]] [[c5]] |
| 4 | **`t4`** Let the correction turn state a second failure | M | — | `t2` | unit: src/analyze/planner/__tests__/driver-unit.test.ts: appendCorrectionTurn without alsoFailing is byte-identical to the pre-change fixture; unit: src/analyze/planner/__tests__/driver-unit.test.ts: appendCorrectionTurn with alsoFailing states the primary first and the count second; unit: src/analyze/planner/__tests__/driver-unit.test.ts: repetition banner follows primary failures only, including the secondary-to-primary transition | [[c2]] [[c7]] |
| 5 | **`t5`** Wire the secondary count note into the retry loop | M | — | `t2`, `t4` | integration: src/analyze/planner/__tests__/driver-unit.test.ts: with a recording stub provider, the initial prompt carries the enforced range; integration: src/analyze/planner/__tests__/driver-unit.test.ts: with a recording stub provider, the correction message sent on call 2 states INV-7 and then the count; integration: src/analyze/planner/__tests__/driver-unit.test.ts: recording-stub replay (INV-7 plus count, INV-11, valid) accepted at call 3 with primary-only feedback; integration: src/analyze/planner/__tests__/driver-unit.test.ts: through structuredStageForTest, failures and saved feedback hold primary failures only; integration: src/analyze/planner/__tests__/driver-unit.test.ts: an empty task list states the count and keeps INV-1 primary | [[c1]] [[c2]] [[c4]] [[c7]] [[c8]] |
| 6 | **`t6`** Give the planner loop its own attempt limit | S | — | `t5` | integration: src/analyze/planner/__tests__/driver-unit.test.ts: five-call acceptance and exhaustion with the planner limit; integration: src/analyze/planner/__tests__/driver-unit.test.ts: completeStructured receives the shared maxAttempts, not the planner limit | [[c4]] [[c8]] [[c9]] |
| 7 | **`t7`** Final build and full sweep | S | — | `t3`, `t6` | live: src/analyze/orchestrator/__tests__/docs-broad-live.test.ts: the broad docs request runs to a final report | [[c8]] [[c9]] |

### 1.1 TASK-1c09e09cd985026b-s1-t1 — Move the band table into a leaf planner module

Create a leaf module in src/analyze/planner that holds the band table and the focused lower bound and imports nothing from the validator or the renderer. Make validate.ts import it and keep SCOPE_BAND exported from validate.ts (re-export) so planner/index.ts, analyze/index.ts and validate.test.ts keep working. No value changes.

**Acceptance checks:**
- SCOPE_BAND values and the halved focused lower bound are identical to today's, shown by the existing 'SCOPE_BAND values match the design doc' test passing unchanged
- the leaf module has no import from validate.ts or render-catalog.ts
- tsc build and the planner tests pass

### 1.2 TASK-1c09e09cd985026b-s1-t2 — Expose the task-count check

Add an exported function that returns the INV-13 PlanValidationFailure for a plan or null, using the leaf module's band and lower bound and the same message and target as today, and make validatePlan call it at its existing INV-13 position without changing any result.

**Acceptance checks:**
- for every scope XS..XL, focused and not, at lo-1, lo, hi and hi+1, the function and validatePlan agree on INV-13 (message and target included)
- validatePlan invariant order and results are unchanged for the existing validator tests

### 1.3 TASK-1c09e09cd985026b-s1-t3 — Print the enforced range in the depth policy

Make renderDepthPolicy take its numbers from the leaf module, print the range once as the range that is enforced, remove the 'reduces the lower bound to half' wording, and delete the table copy in render-catalog.ts. Keep the scope-specific depth hints.

**Acceptance checks:**
- for every scope and both focus values the printed range equals the INV-13 band
- the output has no wording about halving
- render-catalog.ts holds no band table
- the existing renderDepthPolicy tests are updated and pass

### 1.4 TASK-1c09e09cd985026b-s1-t4 — Let the correction turn state a second failure

First capture the pre-change correction turn text for an INV-7 failure, with and without a prior failure, as a fixture, before the signature is changed. Then add the optional alsoFailing parameter to appendCorrectionTurn: after the primary failure and its hint, render the INV-13 failure and ask for both to be fixed. Without it the text is unchanged. The repetition banner keeps comparing the primary failure only.

**Acceptance checks:**
- the pre-change fixture was captured before the signature change, and without alsoFailing the turn is byte-identical to it
- with alsoFailing the primary comes first and the count second
- a count that was a secondary note and then becomes the primary failure gets no repetition banner; a primary INV-13 repeated on the next attempt still does

### 1.5 TASK-1c09e09cd985026b-s1-t5 — Wire the secondary count note into the retry loop

In runPlanner, when the first failure is not INV-13, run the count check on the same stamped plan and pass a non-null result to appendCorrectionTurn. failures[], the feedback files and the thrown error keep the primary failure only. Add the recording-stub-provider tests and, separately, the structuredStageForTest history and persistence tests from the LLD.

**Acceptance checks:**
- recording-stub group: with a recording stub provider, the message sent on call 2 states INV-7 first and the count second; call 3 names INV-11 only, with no count section and no banner
- hook group: through structuredStageForTest, failures[], feedback.json and the thrown error hold primary failures only
- the INV-1 case states the count as well and keeps INV-1 primary

### 1.6 TASK-1c09e09cd985026b-s1-t6 — Give the planner loop its own attempt limit

First search the planner and orchestrator tests for PlanBuilderExhausted, attempts.length and structuredOutputRetries assumptions. Then add a named constant of 5 in the planner and use it for the correction loop only; keep cfg.shaper.structuredOutputRetries as the wire-level maxAttempts given to completeStructured and for every other user. Update only the tests that follow from the new limit.

**Acceptance checks:**
- the tests that assumed three attempts are listed and each is updated or left with a stated reason
- a script valid only on the fifth reply is accepted on the fifth call
- a script that never passes throws PlanBuilderExhausted with five primary failures after exactly five calls
- every completeStructured call receives the shared structuredOutputRetries value as maxAttempts

### 1.7 TASK-1c09e09cd985026b-s1-t7 — Final build and full sweep

Run tsc and the planner and analyze test sweeps. The live docs-broad regression (INSRC_LIVE_TESTS=1, docs-broad-live.test.ts) needs the new code running in the daemon, so it is run after the push and daemon update, and its outcome is stated in the BUILD record as a reported live result, not a gate-run test. A failure after the count and the exact range were shown triggers the band revisit written in the LLD.

**Acceptance checks:**
- tsc build passes and the planner and analyze tests pass, with unrelated pre-existing failures named separately
- the live regression is recorded as a reported result with its outcome (final report reached, or the failing stage and invariant), or recorded as not yet run with the reason

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| task-count check against validatePlan INV-13 at the lower and upper bound of XS..XL, focused and not | `t2` |
| appendCorrectionTurn without alsoFailing is byte-identical to today's; with alsoFailing the primary comes first and the count second | `t4` |
| repetition banner: a count that was a secondary note and then becomes the primary failure gets no banner; a primary INV-13 repeated on the next attempt still gets one | `t4` |
| renderDepthPolicy prints for every scope and both focus values the same range as the INV-13 band, once, with no 'half' wording | `t3` |
| no band table remains in render-catalog.ts, and the table module imports nothing from the validator or the renderer | `t1`, `t3` |
| validatePlan order and results unchanged for the existing invariant cases | `t1`, `t2` |
| call 1 receives the initial prompt whose depth policy shows the enforced range; its scripted reply has 15 docs tasks with INV-7 plus the count | `t5` |
| call 2 receives a messages array whose last user turn states INV-7 first and the count second; its reply has 20 or more tasks and INV-11 still present | `t5` |
| call 3 receives a last user turn naming INV-11 only, with no count section and no repeated-failure banner; its valid in-band docs reply is accepted at attempt 3 | `t5` |
| failures[], feedback.json and the thrown error hold primary failures only (INV-7, INV-11) | `t5` |
| every completeStructured call receives maxAttempts equal to the shared structuredOutputRetries value, not the planner limit | `t6` |
| a script that is valid only on the fifth reply is accepted on the fifth call, and one that never passes throws PlanBuilderExhausted with five primary failures after exactly five calls | `t6` |
| scripted failures through the hook: failures passed to the stage hold primary failures only | `t5` |
| saved-mode feedback and plan attempt files hold one primary failure per attempt | `t5` |
| src/analyze/orchestrator/__tests__/docs-broad-live.test.ts with INSRC_LIVE_TESTS=1; a failure after the count and the exact range were shown triggers the band revisit written into the design | `t7` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s1 contractDetails validatePlan`
- **[[c2]]** `prior-artifact` `LLD s1 contractDetails appendCorrectionTurn`
- **[[c3]]** `prior-artifact` `LLD s1 contractDetails renderDepthPolicy`
- **[[c4]]** `prior-artifact` `LLD s1 contractDetails runPlanner`
- **[[c5]]** `prior-artifact` `LLD s1 dataModelChanges SCOPE_BAND`
- **[[c6]]** `prior-artifact` `LLD s1 dataModelChanges PlanValidationFailure`
- **[[c7]]** `prior-artifact` `LLD s1 errorPaths`
- **[[c8]]** `prior-artifact` `LLD s1 testStrategy`
- **[[c9]]** `prior-artifact` `LLD s1 migration`
