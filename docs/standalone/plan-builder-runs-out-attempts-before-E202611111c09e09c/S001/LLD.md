<!-- insrc:artifact LLD-1c09e09cd985026b-s1 -->

# LLD: STORY-1c09e09cd985026b-s1 — Plan builder reports task-count errors early and fits the docs band (fix for ISSUE-1c09e09cd985026b)

## Summary

**Epic:** `plan-builder-runs-out-attempts-before`
**HLD base run:** `wf-1794409894097-wdlq72`
**HLD effective hash:** `e4ade4102c5b...`

The plan builder now tells the model about a wrong task count in the same correction turn as any other failure, shows the model the exact task-count range that the validator will enforce (no 'halve it' wording, one table for both), and allows more correction attempts for the plan than the shared retry setting does. The task-count band values, the invariant order, the failure type, the stored feedback files and the shared retry setting are unchanged; the reason the band is kept is written into the design and checked by the live regression.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)
9. [Open questions](#9-open-questions)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal

### 2.1 `validatePlan`

```typescript
validatePlan(plan: PlanTask, catalog: readonly AnalyzeTaskTemplate[], opts?: ValidateOpts): PlanValidationFailure | null
```

**Parameters:**
- `plan: PlanTask` — The stamped plan to check
- `catalog: readonly AnalyzeTaskTemplate[]` — Templates the plan may use
- `opts: ValidateOpts` _(optional)_ — focused / isChildPlan flags

**Returns:** `PlanValidationFailure | null` — The first failing invariant, or null. Unchanged by this Story.

**Preconditions:**
- plan has passed the wire-shape check

**Postconditions:**
- Invariant order and the result for any plan are unchanged

### 2.2 `appendCorrectionTurn`

```typescript
appendCorrectionTurn(prior: LLMMessage[], rejected: PlanTask, failure: PlanValidationFailure, priorFailures: readonly PlanValidationFailure[], alsoFailing?: PlanValidationFailure | undefined): LLMMessage[]
```

**Parameters:**
- `prior: LLMMessage[]` — The conversation so far
- `rejected: PlanTask` — The plan just rejected
- `failure: PlanValidationFailure` — The first failing invariant; the primary message, and the only one the repetition banner compares
- `priorFailures: readonly PlanValidationFailure[]` — Earlier primary failures, for the repetition banner
- `alsoFailing: PlanValidationFailure | undefined` _(optional)_ — The task-count failure (INV-13), stated after the primary one in the same turn

**Returns:** `LLMMessage[]` — The conversation with the correction turn appended; with alsoFailing the turn names it after the primary failure and asks for both to be fixed

**Preconditions:**
- alsoFailing, when given, has invariantId INV-13 and failure does not

**Postconditions:**
- Without alsoFailing the text is exactly what it is today
- The repetition banner is decided by failure and priorFailures only; alsoFailing never enters failures[] or the banner

### 2.3 `renderDepthPolicy`

```typescript
renderDepthPolicy(scope: 'XS' | 'S' | 'M' | 'L' | 'XL', focused: boolean): string
```

**Parameters:**
- `scope: 'XS' | 'S' | 'M' | 'L' | 'XL'` — The plan's size
- `focused: boolean` — Whether the intent is focused

**Returns:** `string` — The depth-policy block of the planner prompt. It states the one range that validatePlan enforces for this scope and focus, taken from the same table, and no longer says that a focused intent 'reduces the lower bound to half'.

**Postconditions:**
- The range printed is the range INV-13 checks, for every scope and both focus values
- No band table is kept in the renderer

### 2.4 `runPlanner`

```typescript
runPlanner(args: RunPlannerArgs): Promise<PlanTask>
```

**Parameters:**
- `args: RunPlannerArgs` — { input: PlanBuilderInput; opts: PlanBuilderOpts; provider?: LLMProvider | undefined }

**Returns:** `PlanTask` — The accepted plan. Unchanged.

**Errors:**
- `PlanBuilderExhausted` when No attempt passed all invariants within the planner's attempt limit; carries the primary failures

**Postconditions:**
- The correction loop runs up to the planner's own attempt limit (a named constant in the planner, 5: the first reply plus four corrections) instead of cfg.shaper.structuredOutputRetries
- The wire-level maxAttempts given to completeStructured, and every other user of cfg.shaper.structuredOutputRetries, are unchanged
- When the first failure is not INV-13 and the count is outside the band, the correction turn also states the count failure

## 3. Data model changes

### 3.1 `SCOPE_BAND` — invariant-change

Values unchanged (XS 3-8, S 10-20, M 20-40, L 30-60, XL 40-80; focused lower bound halved). The table and the focused lower bound move to a leaf module in the planner that imports nothing from the validator or the renderer, so both can import it and the duplicate in the renderer is deleted. Retention reason, from the docs catalog and the run: the six docs templates take parameters, so 20 or more meaningful tasks are reachable (inventory, one summary per family, one deep-dive per area, decision.trace and constraint.enumerate where the question needs them, aggregator); the failed run has simpler candidate explanations than an unreachable band: a count error shown only on the last attempt, band wording that is ambiguous next to an already-halved number (the plan's reasoning says 10-80; how it got 10 is not stated), and a tight attempt budget. Revisit trigger: a live run in which the model was told the count and the exact range and still cannot produce a valid plan.

**Call sites:**
- `src/analyze/planner/validate.ts:61`
- `src/analyze/planner/validate.ts:163`
- `src/analyze/planner/render-catalog.ts:79`

### 3.2 `PlanValidationFailure` — invariant-change

No field change. The task-count check is exposed as a function returning a PlanValidationFailure for INV-13 or null, with the same band, lower bound and message as the check inside validatePlan, which calls it at its INV-13 position; the retry loop calls it for the secondary note.

**Call sites:**
- `src/analyze/planner/validate.ts:40`
- `src/analyze/planner/validate.ts:418`
- `src/analyze/planner/driver.ts:325`

## 4. Error paths

**Error cases**

- **A plan fails an ordering invariant and also has a task count outside the band** (recoverable)
  - Detection: After validatePlan returns a failure whose invariantId is not INV-13, the retry loop runs the task-count check on the same stamped plan and gets a non-null INV-13 failure
  - Response: The correction turn states the primary failure first and the count failure second and asks for both to be fixed; failures[] and feedback.json record only the primary failure
  - User impact: None visible; the run needs fewer attempts
- **The count was a secondary note on one attempt and is the primary failure on the next** (recoverable)
  - Detection: validatePlan returns INV-13 as the first failure while the last entry of failures[] is a different invariant
  - Response: No repetition banner, because the banner compares primary failures only and the count was never recorded as one; the correction turn is the same as today's for an INV-13 failure
  - User impact: None
- **No attempt in the planner's limit passes every invariant** (terminal)
  - Detection: The loop ends after the planner's attempt limit with failures.length equal to the limit
  - Response: PlanBuilderExhausted with the primary failures, as today; the run fails with plan-invariant-failed
  - User impact: The run fails at the plan stage as today, after at most four corrections instead of two
- **The range shown to the model and the range validated differ** (recoverable)
  - Detection: Both come from one table in a leaf module; a unit test compares the printed range with the INV-13 band for every scope and both focus values
  - Response: Fails in tests; nothing to handle at run time
  - User impact: None

**Edge cases**

| Input | Expected |
| :--- | :--- |
| The first failure is INV-13 itself | No also-failing section; the turn text is identical to today's |
| The first failure is INV-1 (empty task list) | The count failure is also stated (0 tasks is outside every band) and the primary failure stays INV-1 |
| A focused plan at XL | The depth policy prints 20-80 once, without wording about halving, and INV-13 checks 20-80 |
| A child plan with a smaller scope | The count check and the printed range use the plan's own scope band, as validatePlan does |
| The count is inside the band | No also-failing section; turn text identical to today's |
| Planner limit and the shared retry setting differ | The loop uses the planner limit; completeStructured still receives the shared setting as its own maxAttempts |

**Invariants to preserve**

- validatePlan returns the first failing invariant in numeric order, and its result for any plan is unchanged [[c1]]
- failures[], feedback.json, PlanBuilderExhausted and the orchestrator error carry primary failures only, one per attempt, and the repetition banner compares only those [[c2]]
- cfg.shaper.structuredOutputRetries keeps its value and its other users (classifier, aggregator, adherence runtime, wire-level schema repair) [[c3]]
- SCOPE_BAND values and the halved focused lower bound are unchanged [[c1]]
- The plan is stamped with the intent's scope before validation, so the model cannot choose its own band [[c3]]

## 5. Test strategy

**Test framework:** `node:test via tsx (npx tsx --test), assert/strict, as in the existing planner tests`

**Test levels**

- **unit** — ac1 (count stated beside the primary failure, with banner and history rules kept) and ac2 (the range shown is the range enforced, from one table)
  - Subjects: `task-count check against validatePlan INV-13 at the lower and upper bound of XS..XL, focused and not`, `appendCorrectionTurn without alsoFailing is byte-identical to today's; with alsoFailing the primary comes first and the count second`, `repetition banner: a count that was a secondary note and then becomes the primary failure gets no banner; a primary INV-13 repeated on the next attempt still gets one`, `renderDepthPolicy prints for every scope and both focus values the same range as the INV-13 band, once, with no 'half' wording`, `no band table remains in render-catalog.ts, and the table module imports nothing from the validator or the renderer`, `validatePlan order and results unchanged for the existing invariant cases`
  - Fixtures: `PlanTask builders used by validate.test.ts`
- **integration** — ac3 on the driver's real wiring: the reproduced sequence is recovered inside the planner's limit. The tests pass a recording stub LLMProvider as RunPlannerArgs.provider, so runPlanner builds its real initial messages and calls completeStructured; the stub records every messages array and options object it receives and replies from a script. structuredStageForTest is NOT used for these, because it bypasses message building and the provider call
  - Subjects: `call 1 receives the initial prompt whose depth policy shows the enforced range; its scripted reply has 15 docs tasks with INV-7 plus the count`, `call 2 receives a messages array whose last user turn states INV-7 first and the count second; its reply has 20 or more tasks and INV-11 still present`, `call 3 receives a last user turn naming INV-11 only, with no count section and no repeated-failure banner; its valid in-band docs reply is accepted at attempt 3`, `failures[], feedback.json and the thrown error hold primary failures only (INV-7, INV-11)`, `every completeStructured call receives maxAttempts equal to the shared structuredOutputRetries value, not the planner limit`, `a script that is valid only on the fifth reply is accepted on the fifth call, and one that never passes throws PlanBuilderExhausted with five primary failures after exactly five calls`
  - Fixtures: `recording stub LLMProvider in driver-unit.test.ts style`, `registered docs templates (src/analyze/planner/templates/docs/index.ts)`
- **integration** — Failure history and persistence through the production retry loop, using structuredStageForTest, which is suited to what it can observe
  - Subjects: `scripted failures through the hook: failures passed to the stage hold primary failures only`, `saved-mode feedback and plan attempt files hold one primary failure per attempt`
  - Fixtures: `structuredStageForTest scripted replies`, `temporary run directory`
- **live** — ac3 on a real model: the broad docs request runs to a final report
  - Subjects: `src/analyze/orchestrator/__tests__/docs-broad-live.test.ts with INSRC_LIVE_TESTS=1; a failure after the count and the exact range were shown triggers the band revisit written into the design`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `validate.test.ts: the task-count check agrees with validatePlan at every band boundary`, `driver-unit.test.ts: appendCorrectionTurn states the count after the primary failure and is unchanged without it`, `driver-unit.test.ts: repetition banner follows primary failures only, including the secondary-to-primary transition`, `driver-unit.test.ts: with a recording stub provider, the correction message sent on call 2 states INV-7 and then the count` |
| `ac2` | `driver-unit.test.ts: renderDepthPolicy prints the INV-13 range for every scope and focus value, without halving wording`, `driver-unit.test.ts: no duplicate band table in the renderer`, `driver-unit.test.ts: with a recording stub provider, the initial prompt carries the enforced range` |
| `ac3` | `driver-unit.test.ts: recording-stub replay (INV-7 plus count, INV-11, valid) accepted at call 3 with primary-only feedback`, `driver-unit.test.ts: five-call acceptance and exhaustion with the planner limit, and completeStructured receiving the shared maxAttempts`, `docs-broad-live.test.ts: broad docs request reaches a final report (live)` |

## 6. Migration

**State before:** validatePlan reports only the first failing invariant, so the task count (INV-13) shows only after INV-7, INV-11 and INV-12 are cleared (src/analyze/planner/validate.ts:418). renderDepthPolicy keeps a second copy of the band table and tells a focused plan that the lower bound is 'reduced to half' next to a number that is already halved, which is ambiguous (src/analyze/planner/render-catalog.ts:79); the failed run's plan reasoned about a 10-80 band. The retry loop allows cfg.shaper.structuredOutputRetries attempts, 3 by default, one correction turn per failure (src/analyze/planner/driver.ts:241).

**State after:** The first failure stays the primary message and the same correction turn also states the task-count failure when the count is outside the band. The prompt prints the exact range that INV-13 enforces from the one table, without halving wording. The correction loop has its own named attempt limit of 5. SCOPE_BAND values, invariant order, PlanValidationFailure, stored feedback files and the shared retry setting are unchanged.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Move the band table and the focused lower bound into a leaf planner module; make validatePlan and the renderer import it, with no change to any value — ↩ rollbackable
2. Rewrite the depth-policy text to print the enforced range once, without the halving wording, and delete the renderer's copy of the table — ↩ rollbackable
3. Expose the task-count check as a function that validatePlan calls at its existing INV-13 position, with no change to its result — ↩ rollbackable
4. Extend the correction-turn builder to accept an optional count failure rendered after the primary failure; with none given the text is unchanged — ↩ rollbackable
5. In the retry loop, when the first failure is not INV-13, run the count check on the same plan and pass a non-null result to the correction-turn builder; keep primary-only history, feedback and banner — ↩ rollbackable
6. Give the correction loop its own named attempt limit of 5 and keep the shared setting for the wire-level call and every other user — ↩ rollbackable

**Backward compat:** No public API, wire shape, stored file shape or config key changes. The observable changes are the wording of the depth-policy block and of the correction message in the planner prompt, and up to four corrections instead of two before a plan fails. Persisted feedback.json files and PlanBuilderExhausted keep the same fields; PlanBuilderExhausted can now carry up to five failures. Anything that read the attempt count as the shared setting must read the planner limit.

## 7. Alternatives considered

### 7.1 a1: Count check ahead of the ordering checks

Return the task-count failure first so a wrong count is told to the model in attempt 1.

Move the INV-13 check so validatePlan evaluates the task-count band before the ordering invariants (INV-7, INV-11, INV-12), keeping one failure per attempt. A plan with a wrong count and an ordering error is told about the count first; the ordering error comes once the count is right.

**Rejected because:** Changes which error is shown first instead of removing the hiding, reorders documented invariants, and ignores two of the three candidate causes in the run.

### 7.2 a2: Count as a secondary note on the correction turn

Keep the first failure as primary and state the count problem in the same turn, without entering the failure history.

Expose the task-count check as its own function, called by validatePlan at its INV-13 position and by the retry loop when the first failure is something else. appendCorrectionTurn gets an optional second failure rendered after the primary one. failures[], feedback files and the repetition banner keep primary-only semantics: the banner compares only primary failures, so a count that was a secondary note and then becomes primary does not trigger a banner.

**Rejected because:** Right fix for the hidden count, but leaves the ambiguous wording that may have produced the wrong count and leaves no slack in the budget.

### 7.3 a3: Secondary note, one exact band, and a planner attempt budget — **CHOSEN**

a2, plus the band stated to the model exactly as it is validated, plus a planner-specific attempt limit; band values stay as they are.

Do a2. In addition: (1) the depth-policy text takes its numbers from the same table the validator uses and states the final range once, without the 'reduces the lower bound to half' wording, which is ambiguous next to a number that is already halved (the failed plan reasoned about 10-80; applying the halving twice is a plausible explanation, not a demonstrated one); the duplicated table is removed so the two cannot drift. (2) The planner's correction loop gets its own attempt limit, a named constant in the planner, used for the loop only; the shared structuredOutputRetries stays the budget of the classifier, aggregator, adherence runtime and the wire-level schema repair. SCOPE_BAND values are retained, with the catalog-based reason recorded: the docs catalog has six templates that take parameters, so a plan of 20 or more meaningful tasks is reachable (inventory, one summary per family, one deep-dive per area, decision.trace and constraint.enumerate where the question asks for them, aggregator), and the one observed failure is explained by the hidden count error, the ambiguous band wording and the tight budget.

### 7.4 a4: Change the XL band for docs plans

Give plans built from the docs catalog a lower task-count band.

Replace the single band lookup with one that depends on the template family, so docs plans are held to a floor the docs catalog supports, while code families keep 40-80 (20 focused).

**Rejected because:** Changes shared policy to fit one observation that has simpler candidate explanations; the catalog supports 20 or more parameterised tasks. Revisit only if a live run that was told the count and the exact band still cannot reach the floor.

## 8. References

- **[[c1]]** `code` `src/analyze/planner/validate.ts:418` — "INV-13: scope policy adherence -- task count within the band."
- **[[c2]]** `code` `src/analyze/planner/driver.ts:524` — "function repetitionBannerFor("
- **[[c3]]** `code` `src/analyze/planner/driver.ts:241` — "const maxAttempts = cfg.shaper.structuredOutputRetries;"
- **[[c4]]** `code` `src/analyze/planner/render-catalog.ts:79` — "export function renderDepthPolicy(scope: 'XS' | 'S' | 'M' | 'L' | 'XL', focused: boolean): string {"
- **[[c5]]** `step-output` `~/.insrc/analyze/docs-broad-live-mwc5fz8p/plan.attempts/03.plan.json` — "use 15 tasks, within its focused 10–80 band"

## 9. Open questions

- The Story has no formal acceptance criteria: ac1-ac3 are expectations derived from the ISSUE's fix intent (early count feedback, a band shown as validated, a recoverable reproduced sequence with a documented band and budget decision). A reviewer should confirm they reflect the ISSUE.
- invariantsToPreserve cite c1..c3, which map to the code citations in References (validate.ts:418, driver.ts:524, driver.ts:241); the s1 bundles carry no ids of their own.
- The planner attempt limit of 5 gives the reproduced sequence two attempts of slack; it is not measured. The live regression and the stated band revisit trigger cover it.

## Resolved questions

- `q32542bdb` — The Story has no formal acceptance criteria: ac1-ac3 are expectations derived from the ISSUE's fix intent (early count feedback, a band shown as validated, a recoverable reproduced sequence with a documented band and budget decision). A reviewer should confirm they reflect the ISSUE.
  - **resolved**: Confirm derived criteria — User approved resolving all three as recommended. _(2026-11-11T15:52:48.291Z)_

## Citations

- **[[c1]]** `code` `src/analyze/planner/validate.ts:418` — "INV-13: scope policy adherence -- task count within the band."
- **[[c2]]** `code` `src/analyze/planner/driver.ts:524` — "function repetitionBannerFor("
- **[[c3]]** `code` `src/analyze/planner/driver.ts:241` — "const maxAttempts = cfg.shaper.structuredOutputRetries;"
- **[[c4]]** `code` `src/analyze/planner/render-catalog.ts:79` — "export function renderDepthPolicy(scope: 'XS' | 'S' | 'M' | 'L' | 'XL', focused: boolean): string {"
- **[[c5]]** `step-output` `~/.insrc/analyze/docs-broad-live-mwc5fz8p/plan.attempts/03.plan.json` — "use 15 tasks, within its focused 10–80 band"
