<!-- insrc:artifact PLAN-abd1ecf6a5f5063e-s3 -->

# Plan: E20260801abd1ecf6:S003

**Epic:** `frame-epic-new-pre-workflow-brainstorm`
**LLD run:** `wf-1785607362893-gb4dsy`
**LLD effective hash:** `688a10691972...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Evolve brainstormElicitSchema to the converged shape | S | — | unit: brainstormElicitSchema accepts { category, workingStatement, openItems, confirmed:false } (a mid-convergence turn); unit: brainstormElicitSchema accepts { category, workingStatement, openItems:[], confirmed:true } (the agreed statement); unit: brainstormElicitSchema REJECTS an empty workingStatement (minLength:1); unit: brainstormElicitSchema REJECTS the retired `questions` field and any additionalProperties; unit: brainstormElicitSchema REJECTS a non-boolean confirmed and a category outside BRAINSTORM_CATEGORY_CLASSES ids | [[c1]] [[c3]] |
| 2 | **`t2`** Reshape the elicit runner body for single-pause convergence | M | `t1` | unit: elicit.run() returns a StepRunnerLlmPause carrying the evolved brainstormElicitSchema (not the s2 questions schema); unit: buildPrompt instructs: fold answers into workingStatement, show the current understanding each turn, re-ask only unresolved openItems, and do not finish until confirmed; unit: resumeRun with a confirmed:false payload keeps the step's semantics intact (intermediate turn) and resumeRun with confirmed:true completes the run carrying the converged { category, workingStatement, openItems, confirmed } forward as the step output; unit: the runner exposes no server-side loop: run() pauses exactly once and only finalize() advances (k2); unit: finalize() rejects a schema-valid resume payload with confirmed:true and non-empty openItems, leaving the run paused and re-prompting on the remaining openItems; integration: insrc_workflow_step start (workflow:'brainstorm') -> plan -> emit_step for `elicit` carrying the evolved schema; live: given a vague idea, successive answers are folded into workingStatement and the next turn asks only still-unresolved openItems, not settled points (ac1); live: each turn's workingStatement reflects the latest answers as a shown current understanding (ac2); live: a large ambiguous new-capability idea keeps probing across many turns and does not stop early with unresolved openItems (ac4); live: convergence presents the statement and only emits confirmed:true after agreement (ac3) | [[c2]] [[c4]] [[c5]] [[c6]] [[c11]] [[c12]] |
| 3 | **`t3`** Wire BrainstormElicitState to carry real convergence data across turns | S | `t2` | integration: posting a confirmed:false resume pauses the run again and the opaque state token is byte-identical across the turn (k8/k9); integration: BrainstormElicitState { workingStatement, answered, openQuestions } round-trips through the state-store unchanged across turns; integration: a run left paused (never resumed with confirmed:true) writes no DEF/SpecArtifact and leaves only transient state-store state (ac5) | [[c7]] [[c8]] [[c9]] [[c10]] [[c12]] |

### E20260801abd1ecf6:S003:T001 — Evolve brainstormElicitSchema to the converged shape

In src/workflow/runners/brainstorm/schemas.ts, open the file alongside index.ts first to confirm the exact current s2 { category, questions } shape, then replace it with the converged { category, workingStatement, openItems, confirmed } schema: additionalProperties:false, category enum unchanged (BRAINSTORM_CATEGORY_CLASSES ids), workingStatement string with minLength:1, openItems string[], confirmed boolean, all four required. The retired `questions` field is fully removed, not deprecated. The business rule that a confirmed:true payload must carry zero openItems is NOT enforced here in ajv (schema-shape only) — it is owned by t2's finalize() logic.

**Acceptance checks:**
- brainstormElicitSchema no longer contains a `questions` property; the retired field is fully removed, not just made optional
- brainstormElicitSchema requires category, workingStatement, openItems, confirmed and sets additionalProperties:false
- workingStatement has minLength:1; confirmed is typed boolean; openItems is string[]; category enum stays BRAINSTORM_CATEGORY_CLASSES ids, unchanged from s2

### E20260801abd1ecf6:S003:T002 — Reshape the elicit runner body for single-pause convergence

In src/workflow/runners/brainstorm/index.ts, rewrite buildPrompt (and the run/finalize wiring) so the single paused `elicit` step conducts the entire clarify -> fold -> show-understanding -> confirm conversation within one llm-pause: fold each answer into workingStatement, present the current understanding every turn, re-ask only unresolved openItems, keep probing with no fixed round budget, and only finalize the step when the resume payload validates t1's evolved brainstormElicitSchema with confirmed:true. Beyond ajv schema-validity, finalize() must independently reject (leave paused, re-prompting on the still-open items) a resume payload that is schema-valid but has confirmed:true together with a non-empty openItems array — this is the LLD's dedicated error-path requirement and is NOT covered by t1's schema. Runner id ('elicit'), workflow name ('brainstorm'), and registerBrainstormRunners/registerWorkflowRunners wiring stay byte-identical to s2 — sc2's scaffold is out of this story's boundary.

**Acceptance checks:**
- elicit.run() returns a StepRunnerLlmPause carrying t1's evolved brainstormElicitSchema, not the s2 questions schema
- buildPrompt instructs folding answers into workingStatement, showing the current understanding each turn, re-asking only unresolved openItems, and not finishing until confirmed:true — with no fixed round budget
- finalize() leaves the run paused on a confirmed:false or schema-invalid resume payload, and only completes the step on a schema-valid confirmed:true payload
- finalize() additionally leaves the run paused (re-prompting on the remaining openItems) when a resume payload is schema-valid but has confirmed:true with a non-empty openItems array, distinct from and in addition to the plain schema-validity check
- registerBrainstormRunners, the runner id ('elicit'), and the 'brainstorm' workflow registration in workflow/index.ts remain structurally unchanged (sc2 boundary respected)

### E20260801abd1ecf6:S003:T003 — Wire BrainstormElicitState to carry real convergence data across turns

In src/mcp/workflow-step/state.ts and state-store.ts, pin the convergence semantics of the existing BrainstormElicitState { workingStatement, answered, openQuestions } continuation shape: update its type-level doc comment from the s1 'inert placeholder' description to document the real fold/reask invariants (workingStatement is the running fold, answered tracks settled answers, openQuestions mirrors the runner's remaining openItems), and verify the existing state-store read/write (pack/unpack) path for this state correctly persists and returns t2's real per-turn values end-to-end rather than the previously-unused placeholder defaults. No new field or new store is introduced — this is a semantics/verification task on existing code paths, not a shape change.

**Acceptance checks:**
- BrainstormElicitState round-trips through the existing state-store (state.ts/state-store.ts) unchanged in shape — no new field or new store introduced
- The opaque continuation state token is preserved byte-identical across a convergence turn
- state.ts's BrainstormElicitState doc comment no longer describes it as an 's1 inert placeholder' and instead documents the fold/reask semantics; a state-store round-trip test using t2's runner-produced values confirms workingStatement/answered/openQuestions are written and read back exactly (not dropped, renamed, or defaulted) across a paused-turn boundary

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| brainstormElicitSchema accepts { category, workingStatement, openItems, confirmed:false } (a mid-convergence turn) | `t1` |
| brainstormElicitSchema accepts { category, workingStatement, openItems:[], confirmed:true } (the agreed statement) | `t1` |
| brainstormElicitSchema REJECTS an empty workingStatement (minLength:1) | `t1` |
| brainstormElicitSchema REJECTS the retired `questions` field and any additionalProperties | `t1` |
| brainstormElicitSchema REJECTS a non-boolean confirmed and a category outside BRAINSTORM_CATEGORY_CLASSES ids | `t1` |
| elicit.run() returns a StepRunnerLlmPause carrying the evolved brainstormElicitSchema (not the s2 questions schema) | `t2` |
| buildPrompt instructs: fold answers into workingStatement, show the current understanding each turn, re-ask only unresolved openItems, and do not finish until confirmed | `t2` |
| resumeRun with a confirmed:false payload keeps the step's semantics intact (intermediate turn) and resumeRun with confirmed:true completes the run carrying the converged { category, workingStatement, openItems, confirmed } forward as the step output | `t2` |
| the runner exposes no server-side loop: run() pauses exactly once and only finalize() advances (k2) | `t2` |
| insrc_workflow_step start (workflow:'brainstorm') -> plan -> emit_step for `elicit` carrying the evolved schema | `t2` |
| posting a confirmed:false resume pauses the run again and the opaque state token is byte-identical across the turn (k8/k9) | `t3` |
| BrainstormElicitState { workingStatement, answered, openQuestions } round-trips through the state-store unchanged across turns | `t3` |
| a run left paused (never resumed with confirmed:true) writes no DEF/SpecArtifact and leaves only transient state-store state (ac5) | `t3` |
| given a vague idea, successive answers are folded into workingStatement and the next turn asks only still-unresolved openItems, not settled points (ac1) | `t2` |
| each turn's workingStatement reflects the latest answers as a shown current understanding (ac2) | `t2` |
| a large ambiguous new-capability idea keeps probing across many turns and does not stop early with unresolved openItems (ac4) | `t2` |
| convergence presents the statement and only emits confirmed:true after agreement (ac3) | `t2` |

## Citations

- **[[c1]]** `prior-artifact` `LLD S003 dataModelChanges: brainstormElicitSchema evolved shape`
- **[[c2]]** `prior-artifact` `LLD S003 contractDetails.api: elicit runner`
- **[[c3]]** `prior-artifact` `LLD S003 contractDetails.api: brainstormElicitSchema`
- **[[c4]]** `prior-artifact` `LLD S003 hldContextSlice.boundary: s3`
- **[[c5]]** `prior-artifact` `LLD S003 errorPaths.errorCases[0]`
- **[[c6]]** `prior-artifact` `LLD S003 keyDecisions: k2 — no server-side loop, single pause`
- **[[c7]]** `prior-artifact` `LLD S003 dataModelChanges: BrainstormElicitState`
- **[[c8]]** `prior-artifact` `LLD S003 stateChanges: sc3`
- **[[c9]]** `prior-artifact` `LLD S003 keyDecisions: k8 — opaque state token byte-identical across turns`
- **[[c10]]** `prior-artifact` `LLD S003 keyDecisions: k9 — state round-trip persistence across turns`
- **[[c11]]** `prior-artifact` `LLD S003 stateChanges: sc2 — scaffold/registration boundary unchanged`
- **[[c12]]** `prior-artifact` `LLD S003 acceptanceCriteria: ac1–ac5 convergence behavior`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — plan (plan)

**0 HIGH · 0 MED · 7 LOW** · model `client` · reviewed 2026-08-01T19:24:50.610Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| tasks | inventory | LOW | manual | The plan enumerates exactly three tasks: t1 (evolve brainstormElicitSchema), t2 (reshape elicit runner), t3 (wire BrainstormElicitState). | The plan Tasks table enumerates exactly t1, t2, t3 with the DAG t1 -> t2 -> t3. Confirmed. | none — verified sound |
| t1 | citation | LOW | manual | t1's target file src/workflow/runners/brainstorm/schemas.ts exists and currently defines the s2 { category, questions } brainstormElicitSchema that t1 evolves. | src/workflow/runners/brainstorm/schemas.ts:30 `export const brainstormElicitSchema` currently carries the s2 `questions` field — the exact shape t1 evolves. Confirmed. | none — verified sound |
| t2 | citation | LOW | manual | t2's target file src/workflow/runners/brainstorm/index.ts exists and defines the `elicit` llm-pause runner (buildPrompt + run/finalize) that t2 reshapes. | src/workflow/runners/brainstorm/index.ts:69 `const elicit = llmPauseRunner({` with buildPrompt (:71) and finalize (inside llmPauseRunner :53) — the runner body t2 reshapes. Confirmed. | none — verified sound |
| t3 | citation | LOW | manual | t3's target files src/mcp/workflow-step/state.ts and state-store.ts exist and BrainstormElicitState { workingStatement, answered, openQuestions } is defined there. | src/mcp/workflow-step/state.ts:35 `export interface BrainstormElicitState` with answered (:37) + openQuestions; state.ts/state-store.ts are the t3 targets. Confirmed. | none — verified sound |
| tasks | ordering | LOW | manual | The task DAG is t1 -> t2 -> t3 (t2 depends on t1, t3 depends on t2). | The plan's Depends-on column shows t2 depends on t1 and t3 depends on t2 — a linear t1->t2->t3 DAG matching the schema-before-runner-before-state ordering. Confirmed. | none — verified sound |
| t1 | closed-union | LOW | manual | The category enum t1 keeps unchanged is BRAINSTORM_CATEGORY_CLASSES ids (requirements/design/implementation/testing/general), defined in src/shared/brainstorm-classes.ts. | src/shared/brainstorm-classes.ts:23 BRAINSTORM_CATEGORY_CLASSES, ids :25 'requirements' … :41 'general' — the enum t1 keeps unchanged. Confirmed. | none — verified sound |
| t2 | semantic | LOW | manual | t2 keeps registerBrainstormRunners, the runner id 'elicit', and the 'brainstorm' registration in workflow/index.ts structurally unchanged (sc2 boundary) — these already exist. | src/workflow/runners/brainstorm/index.ts:108 registerBrainstormRunners, called in src/workflow/index.ts:27 — the sc2 scaffold t2 leaves unchanged already exists. Confirmed. | none — verified sound |
