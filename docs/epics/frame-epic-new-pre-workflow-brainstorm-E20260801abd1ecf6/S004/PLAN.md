<!-- insrc:artifact PLAN-abd1ecf6a5f5063e-s4 -->

# Plan: E20260801abd1ecf6:S004

**Epic:** `frame-epic-new-pre-workflow-brainstorm`
**LLD run:** `wf-1785612928635-hd5w32`
**LLD effective hash:** `688a10691972...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Extend brainstormElicitSchema with decisions[] and nonGoals[] | S | — | unit: schema accepts a well-formed decisions[] + nonGoals[] payload and a fork-free empty-arrays payload; unit: schema REJECTS a malformed/incomplete decisions entry, empty chosen/reason, and a non-array nonGoals (additionalProperties:false); unit: schema still requires + preserves the s3 fields (category/workingStatement/openItems/confirmed) unchanged | [[c1]] [[c2]] |
| 2 | **`t2`** Add fork presentation to buildPrompt and the ruled-out-not-recorded finalize gate | M | `t1` | unit: finalize REJECTS a confirmed:true payload whose decisions[].ruledOut names a direction absent from nonGoals as a retryable 'ruled-out-not-recorded' error, leaving the run paused; unit: finalize ACCEPTS a confirmed:true payload where every ruledOut direction also appears in nonGoals (and openItems is empty); unit: finalize still REJECTS confirmed:true with non-empty openItems ('convergence-incomplete') and a confirmed:false intermediate turn passes through; unit: buildPrompt embeds the fork rule (present options + tradeoffs, do not silently pick) and the decisions/nonGoals capture instructions | [[c3]] [[c5]] |
| 3 | **`t3`** Extend the brainstorm test suite with decisions/nonGoals schema + fork-integrity cases | S | `t2` | integration: insrc_workflow_step start (workflow:'brainstorm') -> plan -> emit_step for elicit carrying the extended schema (decisions/nonGoals present); integration: a 'ruled-out-not-recorded' finalize error surfaces as {next:'error',retryable} and the opaque state token is unchanged so the controller re-sends; integration: BrainstormElicitState shape is unchanged — no new field/store introduced by s4; live: gated ac1-ac4: fork presented with tradeoffs, decisions[] carries chosen/ruledOut/reason, ruled-out -> nonGoal, deferral -> openItems | [[c4]] |

### E20260801abd1ecf6:S004:T001 — Extend brainstormElicitSchema with decisions[] and nonGoals[]

In src/workflow/runners/brainstorm/schemas.ts, add the two additive fields to the s3 converged schema: `decisions` (array of { chosen:string minLength 1, ruledOut:string[], reason:string minLength 1 }, additionalProperties:false per entry) and `nonGoals` (string[]). Add both to `required`; keep additionalProperties:false at the top level; leave category/workingStatement/openItems/confirmed and the derived category enum unchanged. Update the file doc comment to describe the s4 extension.

**Acceptance checks:**
- brainstormElicitSchema.required includes decisions and nonGoals in addition to the four s3 fields
- decisions items are objects requiring chosen/ruledOut/reason with additionalProperties:false; chosen and reason have minLength:1; ruledOut and nonGoals are string arrays
- the s3 fields (category enum, workingStatement minLength:1, openItems, confirmed) are byte-unchanged
- top-level additionalProperties stays false

### E20260801abd1ecf6:S004:T002 — Add fork presentation to buildPrompt and the ruled-out-not-recorded finalize gate

In src/workflow/runners/brainstorm/index.ts, augment the elicit buildPrompt so that at a fork (>1 plausible scope) it presents the options WITH tradeoffs and asks the user to choose rather than silently picking, folds the chosen direction/ruled-out/reason into decisions[], records each ruled-out direction as a nonGoal, and leaves an unanswerable question in openItems. Extend finalizeElicit with an ADDITIVE check: on a confirmed:true payload, compute the set difference of every decisions[].ruledOut entry against nonGoals; if any is missing, return a retryable StepRunnerError code 'ruled-out-not-recorded' (leaving the run paused). The s3 'convergence-incomplete' check (confirmed:true requires empty openItems) is unchanged and both gates compose. Runner id, workflow, registration, and workflow/index.ts wiring stay byte-identical (sc2/sc3 boundary).

**Acceptance checks:**
- buildPrompt text instructs presenting options with tradeoffs at a fork, not silently picking; folding chosen/ruledOut/reason into decisions; recording ruled-out as nonGoals; leaving unanswerable items in openItems
- finalizeElicit returns retryable code 'ruled-out-not-recorded' when a confirmed:true payload has a decisions[].ruledOut direction absent from nonGoals
- finalizeElicit still returns 'convergence-incomplete' for confirmed:true with non-empty openItems, and accepts a clean confirmed:true (openItems empty, all ruledOut recorded as nonGoals)
- the runner id 'elicit', workflow 'brainstorm', registerBrainstormRunners, and the workflow/index.ts registration are unchanged

### E20260801abd1ecf6:S004:T003 — Extend the brainstorm test suite with decisions/nonGoals schema + fork-integrity cases

In src/workflow/runners/brainstorm/__tests__/elicit.test.ts, add the schema + finalize + buildPrompt unit cases (from t1/t2) plus the integration round-trip cases, all node:test + assert/strict + ajv driven through the real executor via startRun/resumeRun. Also name the gated (INSRC_LIVE_TESTS=1) live subjects for ac1-ac4. Run the full brainstorm + workflow-step sweep and tsc.

**Acceptance checks:**
- new schema tests cover accept (valid + fork-free), reject (malformed decisions entry, empty chosen/reason, non-array nonGoals, additionalProperties), and s3-fields-unchanged
- new runner tests via startRun/resumeRun cover ac3 both ways: 'ruled-out-not-recorded' retryable rejection AND clean confirmed:true acceptance when every ruled-out direction is recorded as a nonGoal
- runner tests also cover the s3 'convergence-incomplete' gate still firing and a confirmed:false pass-through
- a buildPrompt test asserts the fork rule + decisions/nonGoals capture instructions are present
- the full brainstorm + workflow-step sweep passes and tsc is clean

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| schema accepts a payload with a well-formed decisions[] entry { chosen, ruledOut[], reason } and a nonGoals[] list | `t1` |
| schema accepts a fork-free payload with decisions:[] and nonGoals:[] | `t1` |
| schema REJECTS a decisions entry missing chosen/ruledOut/reason, and an empty chosen or reason (minLength:1) | `t1` |
| schema REJECTS additionalProperties inside a decisions entry and a non-array nonGoals | `t1` |
| schema still requires + preserves the s3 fields (category/workingStatement/openItems/confirmed) unchanged | `t1` |
| finalize REJECTS a confirmed:true payload whose decisions[].ruledOut names a direction absent from nonGoals as a retryable 'ruled-out-not-recorded' error, leaving the run paused | `t2`, `t3` |
| finalize ACCEPTS a confirmed:true payload where every ruledOut direction also appears in nonGoals (and openItems is empty) | `t2`, `t3` |
| finalize still REJECTS confirmed:true with non-empty openItems ('convergence-incomplete') — the s3 gate is unchanged and composes with s4's | `t2` |
| a confirmed:false intermediate turn carrying partial decisions passes through as the step output | `t2` |
| buildPrompt embeds the fork rule (present options + tradeoffs, do not silently pick) and the decisions/nonGoals capture instructions | `t2` |
| insrc_workflow_step start (workflow:'brainstorm') -> plan -> emit_step for `elicit` carrying the extended schema (decisions/nonGoals present) | `t3` |
| a 'ruled-out-not-recorded' finalize error surfaces as {next:'error',retryable} and the state token is unchanged so the controller re-sends | `t3` |
| BrainstormElicitState shape is unchanged — no new field/store introduced by s4 | `t3` |
| given a request with >1 plausible scope, the stage presents options WITH tradeoffs and asks the user to choose rather than silently picking (ac1) | `t3` |
| after the user chooses, decisions[] carries the chosen direction, the ruled-out alternatives, and the reason into the converged statement (ac2) | `t3` |
| an explicitly ruled-out direction appears as a nonGoal in the confirmed statement (ac3) | `t2`, `t3` |
| a question the user leaves open is recorded in openItems, not resolved by assumption (ac4) | `t3` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s4 contractDetails.api: brainstormElicitSchema (extended converged shape with decisions[]/nonGoals[])`
- **[[c2]]** `prior-artifact` `LLD s4 dataModelChanges: brainstormElicitSchema field-add (decisions {chosen,ruledOut,reason} + nonGoals)`
- **[[c3]]** `prior-artifact` `LLD s4 contractDetails.api: elicit (fork-presentation buildPrompt + ruled-out-not-recorded finalize gate)`
- **[[c4]]** `prior-artifact` `LLD s4 testStrategy: schema/finalize/integration/live suites under brainstorm/__tests__/elicit.test.ts`
- **[[c5]]** `prior-artifact` `LLD s4 interactionWithShared: sc2 (registration untouched) + sc3 (single pause + state-store, no new field/store)`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — plan (plan)

**0 HIGH · 0 MED · 6 LOW** · model `client` · reviewed 2026-08-01T20:15:42.604Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| tasks | inventory | LOW | manual | The plan enumerates exactly three tasks t1/t2/t3 with the linear DAG t1 -> t2 -> t3. | The plan Tasks table enumerates t1, t2, t3 with DAG t1<-t2<-t3. Confirmed. | none — verified sound |
| t1 | citation | LOW | manual | t1's target src/workflow/runners/brainstorm/schemas.ts exists and defines the s3 converged brainstormElicitSchema (workingStatement/confirmed) that t1 extends with decisions/nonGoals. | src/workflow/runners/brainstorm/schemas.ts:42 `export const brainstormElicitSchema` — the s3 converged schema t1 extends. Confirmed. | none — verified sound |
| t2 | citation | LOW | manual | t2's target src/workflow/runners/brainstorm/index.ts defines the elicit runner with finalizeElicit returning the retryable 'convergence-incomplete' error, which t2 extends with the 'ruled-out-not-recorded' set-difference check. | src/workflow/runners/brainstorm/index.ts:88 `const finalizeElicit: StepRunnerFinalize`, :95 `code: 'convergence-incomplete'`, :106 `const elicit` — the runner + finalize gate t2 extends. Confirmed. | none — verified sound |
| t2 | semantic | LOW | manual | The elicit runner's finalize can return a retryable StepRunnerError, and resumeRun surfaces it without advancing state — the mechanism t2's new gate reuses. | src/workflow/executor.ts:154 finalize: StepRunnerFinalize, :156 `if (result.type === 'error')` returns errorTick with retryable — finalize can return a retryable error surfaced without advancing state. Confirmed. | none — verified sound |
| t3 | citation | LOW | manual | t3's target src/workflow/runners/brainstorm/__tests__/elicit.test.ts exists and drives the runner via startRun/resumeRun with ajv. | src/workflow/runners/brainstorm/__tests__/elicit.test.ts imports startRun/resumeRun + ajv and asserts convergence-incomplete (:146) — the suite t3 extends. Confirmed. | none — verified sound |
| t2 | cross-artifact | LOW | manual | The sc2 boundary t2 leaves untouched — registerBrainstormRunners in workflow/index.ts — exists. | src/workflow/index.ts:12 imports and :27 calls registerBrainstormRunners — the sc2 scaffold t2 leaves untouched. Confirmed. | none — verified sound |
