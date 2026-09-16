<!-- insrc:artifact LLD-abd1ecf6a5f5063e-s4 -->

# LLD: E20260801abd1ecf6:S004

**Epic:** `frame-epic-new-pre-workflow-brainstorm`
**HLD base run:** `wf-1785587820064-46kctq`
**HLD effective hash:** `688a10691972...`

## HLD context

**Framework:** Brainstorm ships as a first-class workflow stage (alternative a1): a peer runner directory src/workflow/runners/brainstorm/ that self-registers through the existing executor registry and workflow/index.ts registerWorkflowRunners; a new persisted SpecArtifact peer file in src/workflow/artifacts/ with a specArtifactPaths peer in storage.ts (hash-addressed, listed, approval-stamped identically to DEF/HLD/LLD/PLAN); and an additive elicitation phase on the existing insrc_workflow_step MCP surface that reuses state-store.ts and the questions-gate primitive and preserves the opaque state token verbatim. The single cross-cutting SpecArtifact shape (intent, scope boundary, non-goals, decisions-with-ruled-out-alternatives, open items) is read unchanged by both define (s8) and standalone design.story (s9). Nothing touches the shared/chat-agent brainstorm.addIdea stub.
**Rollout phase:** Phase B — In-chat elicitation behaviour
**Consumes:** `sc2` (Brainstorm stage runner registration), `sc3` (Brainstorm MCP elicitation phase + continuation state)

## Contract details

**Surface level:** internal

### `brainstormElicitSchema`

```typescript
export const brainstormElicitSchema: Record<string, unknown>
```

**Returns:** `Record<string, unknown>` — The ajv schema the paused `elicit` step validates on resume. s4 EXTENDS the s3 converged shape { category, workingStatement, openItems, confirmed } with two additive structured fields: `decisions` (array of { chosen:string, ruledOut:string[], reason:string } capturing each resolved fork — c32/ac2) and `nonGoals` (string[] of explicit exclusions — ac3). additionalProperties:false; category enum unchanged; both new fields required (default to empty arrays for a fork-free conversation). openItems (from s3) already records ac4's unresolved items.

**Errors:**
- `ajv validation failure` when A resume payload with a malformed decisions entry (missing chosen/ruledOut/reason), a non-array nonGoals, or an unknown field is rejected by the schema on resume.

**Preconditions:**
- The `elicit` step is paused carrying this schema.

**Postconditions:**
- A validated payload carries decisions[] and nonGoals[] forward; the business rule that every decisions[].ruledOut direction also appears in nonGoals is enforced by finalize, not ajv.

### `elicit`

```typescript
const elicit: StepRunner  // { id:'elicit', workflow:'brainstorm', run(ctx): StepRunnerLlmPause, finalize(llmResponse): StepRunnerOutput | StepRunnerError }
```

**Parameters:**
- `ctx: StepRunnerContext` — Carries intent.focus and accumulating step context the buildPrompt reads.

**Returns:** `StepRunnerLlmPause | StepRunnerOutput | StepRunnerError` — s4 augments the s3 buildPrompt with fork-handling: when more than one plausible scope/approach is open, present the options WITH tradeoffs and ask the user to choose rather than silently picking (ac1); fold the chosen direction, ruled-out alternatives, and reason into decisions[] (ac2); record each explicitly-ruled-out direction as a nonGoal (ac3); leave an unanswerable question in openItems rather than assuming (ac4). The runner id, workflow, and registration stay byte-identical to s3.

**Errors:**
- `ruled-out-not-recorded` when finalize receives a confirmed:true payload where some decisions[].ruledOut direction is absent from nonGoals — returned as a RETRYABLE StepRunnerError so the run stays paused and the controller re-records the exclusion (reuses s3's convergence-incomplete mechanism).

**Preconditions:**
- registerBrainstormRunners() has run (sc2); the run is a `brainstorm` workflow whose one-step plan is `elicit`.

**Postconditions:**
- The daemon runs no loop (k2); the run advances to synthesize only on a confirmed:true payload with empty openItems (s3) AND every ruled-out direction recorded as a nonGoal (s4).

## Data model changes

### `brainstormElicitSchema` — field-add

Add `decisions` and `nonGoals` to the converged elicit response schema in src/workflow/runners/brainstorm/schemas.ts. `decisions` is an array of objects { chosen:string(minLength 1), ruledOut:string[], reason:string(minLength 1) } — the structured narrowing record (c32). `nonGoals` is string[]. Both required; additionalProperties:false at both the top level and inside each decisions entry. Additive only — s3's category/workingStatement/openItems/confirmed are unchanged.

```
  required: [...'category','workingStatement','openItems','confirmed']
+ required: [...,'decisions','nonGoals']
+ properties.decisions: { type:'array', items:{ type:'object', required:['chosen','ruledOut','reason'], additionalProperties:false, properties:{ chosen:{type:'string',minLength:1}, ruledOut:{type:'array',items:{type:'string'}}, reason:{type:'string',minLength:1} } } }
+ properties.nonGoals: { type:'array', items:{ type:'string' } }
```

**Call sites:**
- `src/workflow/runners/brainstorm/schemas.ts`
- `src/workflow/runners/brainstorm/index.ts`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc2` | consumes | s4's option/tradeoff behaviour lives on the same `elicit` runner registered by sc2's registerBrainstormRunners. s4 edits only the runner's buildPrompt + finalize + the schema; the runner id, registration, and decomposer are untouched (boundary: owns [], depends [sc2]). |
| `sc3` | consumes | s4 consumes the MCP elicitation phase + continuation state: it grows the brainstormElicitSchema the paused step carries and reuses the single llm-pause + state-store with the opaque token preserved (k8/k9). No new BrainstormElicitState field or store is introduced. The daemon runs no loop (k2); the persisted SpecArtifact record type that ultimately holds decisions/non-goals/open-items is owned by s6, not s4. |

## Error paths

### Error cases

- **The controller resumes confirmed:true but a direction listed in some decisions[].ruledOut is not present in nonGoals — a ruled-out option was about to be dropped rather than recorded.** (recoverable)
  - Detection: finalize() computes the set difference of every decisions[].ruledOut entry against nonGoals; if any ruled-out direction is missing, it returns a RETRYABLE StepRunnerError 'ruled-out-not-recorded' (reusing the s3 convergence-incomplete mechanism), which resumeRun -> handleStep surfaces as {next:'error',retryable} without advancing the stored state.
  - Response: The run stays paused on the same state token; the controller re-records the missing exclusion as a nonGoal and re-sends. No advance to synthesize.
  - User impact: An explicitly ruled-out direction cannot silently vanish — it is forced into the record as a non-goal (ac3, c32).
- **A resume payload contains a decisions entry missing `chosen`, `ruledOut`, or `reason`, or an empty `chosen`/`reason` string, or a non-array nonGoals.** (recoverable)
  - Detection: ajv validation against brainstormElicitSchema on resume: required + minLength + item-type checks on the decisions object and nonGoals array fail before finalize runs.
  - Response: The resume is rejected as a schema error; the run stays paused and the controller re-emits a well-formed decision record.
  - User impact: A half-captured decision (a choice with no reason, or a malformed exclusion) cannot enter the record — the narrowing reasoning is captured completely or not at all (c32).
- **The conversation reaches a genuine fork (>1 plausible scope) but the model silently picks one and folds it into workingStatement without presenting options or recording a decision.** (recoverable)
  - Detection: Not machine-detectable from a single payload (a fork that was never surfaced leaves no trace); it is caught by the buildPrompt HARD RULE forbidding silent selection and by the live tests that assert options-with-tradeoffs are presented at a fork (ac1). It is a prompt-adherence risk, not a silent code pass.
  - Response: The prompt mandates presenting options and asking the user to choose at any fork; the core-tier model (k13) and the live acceptance tests guard adherence.
  - User impact: If it regressed, a scoping choice would be made for the user without their input — the exact failure ac1 exists to prevent; covered by the live test rather than a runtime gate.

### Edge cases

| Input | Expected |
| :--- | :--- |
| A fork-free conversation — the request has a single obvious scope, no options were weighed. | decisions:[] and nonGoals:[] are valid; the run confirms on the s3 rules alone. The additive s4 fields do not force a decision that was never made. |
| One decision rules out multiple directions at once (decisions[].ruledOut has several entries). | finalize requires ALL of them to appear in nonGoals; a confirm missing any one is rejected 'ruled-out-not-recorded'. Every ruled-out direction is recorded (ac3). |
| The user leaves a fork itself unresolved — cannot pick between the presented options and wants to defer. | The undecided fork is recorded in openItems (ac4) rather than being forced into a decisions[] entry with an arbitrary chosen; the prompt records the deferral as open, not resolved by assumption. |
| The same direction is both chosen in one decision and ruled out in another (revised across turns). | The latest fold governs: the running workingStatement + decisions reflect the final choice, and only genuinely-excluded directions land in nonGoals; a stale contradictory entry is corrected before confirm, consistent with s3's re-fold-on-revision behaviour. |

### Invariants to preserve

- s3's convergence gate is unchanged: a confirmed:true payload must still carry empty openItems ('convergence-incomplete'). s4's 'ruled-out-not-recorded' gate is ADDITIVE and composes with it — both must pass before the run advances to synthesize. [[c30]]
- The elicit runner adds no new BrainstormElicitState field and no new store; the s3 single llm-pause + state-store + opaque-token round-trip is preserved verbatim (k8/k9). s4 only grows the response schema and the prompt/finalize. [[c31]]

## Test strategy

**Test framework:** `node:test + node:assert/strict via `npx tsx --test` (with ajv for schema assertions), matching the s3 brainstorm suites under src/workflow/runners/brainstorm/__tests__/`

### Test levels

- **unit** — Prove the extended brainstormElicitSchema structurally captures decisions + nonGoals and rejects a half-captured decision, while leaving the s3 shape intact.
  - Subjects: `schema accepts a payload with a well-formed decisions[] entry { chosen, ruledOut[], reason } and a nonGoals[] list`, `schema accepts a fork-free payload with decisions:[] and nonGoals:[]`, `schema REJECTS a decisions entry missing chosen/ruledOut/reason, and an empty chosen or reason (minLength:1)`, `schema REJECTS additionalProperties inside a decisions entry and a non-array nonGoals`, `schema still requires + preserves the s3 fields (category/workingStatement/openItems/confirmed) unchanged`
  - Fixtures: `a fresh Ajv compile of the extended brainstormElicitSchema`
- **unit** — Prove the elicit finalize gate enforces fork-integrity (every ruled-out direction must be a non-goal) additively with the s3 convergence gate, driven through the real executor.
  - Subjects: `finalize REJECTS a confirmed:true payload whose decisions[].ruledOut names a direction absent from nonGoals as a retryable 'ruled-out-not-recorded' error, leaving the run paused`, `finalize ACCEPTS a confirmed:true payload where every ruledOut direction also appears in nonGoals (and openItems is empty)`, `finalize still REJECTS confirmed:true with non-empty openItems ('convergence-incomplete') — the s3 gate is unchanged and composes with s4's`, `a confirmed:false intermediate turn carrying partial decisions passes through as the step output`, `buildPrompt embeds the fork rule (present options + tradeoffs, do not silently pick) and the decisions/nonGoals capture instructions`
  - Fixtures: `a one-step brainstorm plan { id:'s1', runner:'elicit' } driven via startRun/resumeRun`, `a stub WorkflowIntent with a rough focus`
- **integration** — Prove the extended turn round-trips through the real insrc_workflow_step dispatch with the opaque token preserved and no new store.
  - Subjects: `insrc_workflow_step start (workflow:'brainstorm') -> plan -> emit_step for `elicit` carrying the extended schema (decisions/nonGoals present)`, `a 'ruled-out-not-recorded' finalize error surfaces as {next:'error',retryable} and the state token is unchanged so the controller re-sends`, `BrainstormElicitState shape is unchanged — no new field/store introduced by s4`
  - Fixtures: `a temp repo intent`, `state-store helpers (_clearWorkflowStateStoreForTests / _workflowStateStoreSize)`
- **live** — Gated (INSRC_LIVE_TESTS=1) end-to-end option/tradeoff quality: forks are surfaced, the choice + reasoning is captured, exclusions become non-goals, and deferrals stay open.
  - Subjects: `given a request with >1 plausible scope, the stage presents options WITH tradeoffs and asks the user to choose rather than silently picking (ac1)`, `after the user chooses, decisions[] carries the chosen direction, the ruled-out alternatives, and the reason into the converged statement (ac2)`, `an explicitly ruled-out direction appears as a nonGoal in the confirmed statement (ac3)`, `a question the user leaves open is recorded in openItems, not resolved by assumption (ac4)`
  - Fixtures: `a live core-tier provider (INSRC_LIVE_TESTS=1)`, `a scripted multi-scope idea + canned choices/deferrals`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: buildPrompt embeds the fork rule (present options+tradeoffs, do not silently pick)`, `live: given a >1-scope request, options with tradeoffs are presented and the user is asked to choose` |
| `ac2` | `unit: schema accepts a well-formed decisions[] entry { chosen, ruledOut, reason }; a payload carrying it round-trips as the step output`, `live: after the user chooses, decisions[] carries chosen + ruledOut + reason into the converged statement` |
| `ac3` | `unit: finalize rejects confirmed:true when a decisions[].ruledOut direction is absent from nonGoals ('ruled-out-not-recorded'), and accepts when all are present`, `live: an explicitly ruled-out direction appears as a nonGoal in the confirmed statement` |
| `ac4` | `unit: a deferred/undecided fork is representable in openItems and a confirm with unresolved openItems is still rejected by the s3 gate`, `live: a question the user leaves open is recorded in openItems, not resolved by assumption` |

## Alternatives considered

### a1: Structured decision-capture fields on the same elicit output + fork-integrity finalize gate — **CHOSEN**

Extend brainstormElicitSchema with decisions[] {chosen, ruledOut[], reason} and nonGoals[]; buildPrompt presents options+tradeoffs at a fork; finalize enforces that a ruled-out direction is recorded as a non-goal.

Continue s3's single-pause pattern. Extend the converged elicit output schema (src/workflow/runners/brainstorm/schemas.ts) with two additive structured fields: `decisions` (array of { chosen:string, ruledOut:string[], reason:string }) capturing each fork the user resolved (ac2/c32), and `nonGoals` (string[]) capturing explicit exclusions (ac3). openItems already carries ac4's unresolved items. buildPrompt (src/workflow/runners/brainstorm/index.ts) gains fork-handling: when more than one plausible scope/approach is open, present the options WITH their tradeoffs and ask the user to choose rather than silently picking (ac1, k2/k13); fold the chosen direction, ruled-out alternatives, and the reason into decisions, and every explicitly-ruled-out direction into nonGoals. Reuse s3's retryable-finalize mechanism for a fork-integrity invariant: a confirmed:true payload whose decisions[].ruledOut names a direction absent from nonGoals is rejected as retryable 'ruled-out-not-recorded' so the run stays paused and the controller re-records it. Same single pause, controller-conducted (k2); no new BrainstormElicitState field/store (sc3); the persisted record type stays owned by s6.

### a2: Free-text prose capture inside workingStatement (no structured fields)

Record the chosen direction, ruled-out alternatives, and reasons as prose woven into the existing workingStatement string, adding no new schema fields.

Leave brainstormElicitSchema at s3's shape and instruct buildPrompt to narrate the option/tradeoff reasoning inside workingStatement prose (e.g. 'chose X over Y because Z; not doing W'). No decisions[] or nonGoals[] fields; the downstream SpecArtifact would parse structure out of prose later.

**Rejected because:** Abandons structural capture — the exact thing c32/ac3/ac4 require. A ruled-out direction lives as prose (ac3 violates) with no enforcement point, and downstream re-parsing is lossy. Ranked 2nd.

### a3: A dedicated `options` executor step/phase for fork presentation

Add a separate first-class executor step that presents options and records the decision, distinct from the elicit convergence step.

Introduce an `options` runner/step in the brainstorm plan that pauses specifically to present a fork and capture the choice, alongside the elicit step, so decision-capture is its own stage in the plan.

**Rejected because:** Mis-models dynamic forks (a fixed step fires spuriously or misses forks), requires editing the s1-owned decomposer (sc2 partial), and splits the working statement across two pauses breaking the single-pause model (sc3 partial). Ranked lowest.

## Citations

- **[[c1]]** `analyze-bundle` `s1 symbol-locate — s3's converged brainstormElicitSchema { category, workingStatement, openItems, confirmed } + the elicit llm-pause with finalize gate (schemas.ts, index.ts), commit aeea535`
- **[[c3]]** `prior-artifact` `HLD sc2 — Brainstorm stage runner registration (owned by s1, consumed by s4)`
- **[[c14]]** `prior-artifact` `HLD sc3 — Brainstorm MCP elicitation phase + continuation state (owned by s1, consumed by s4)`
- **[[c22]]** `stakeholder` `Story S004 local constraint c32 — the narrowing reasoning (directions ruled out, tradeoffs weighed, option chosen) must be captured, not just the final wording`
- **[[c23]]** `analyze-bundle` `s1 data-model-trace — the SpecArtifact body shape { intent, scope boundary, non-goals, decisions-with-ruled-out-alternatives, open items } is owned by s6; s4 only populates the elicit output (artifacts/define.ts, hld.ts)`
- **[[c24]]** `analyze-bundle` `s1 usage-example — s3's retryable-finalize mechanism (StepRunnerError surfaced by resumeRun->handleStep without advancing state) that s4 reuses for fork-integrity (index.ts, phases/step.ts, state.ts)`
- **[[c30]]** `prior-artifact` `s3 LLD/build (commit aeea535) — the convergence gate: confirmed:true requires empty openItems ('convergence-incomplete'), with which s4's fork-integrity gate composes`
- **[[c31]]** `analyze-bundle` `s1 usage-example + HLD sc3 — the single llm-pause + state-store + opaque-token round-trip (k8/k9); s4 adds no new BrainstormElicitState field/store`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 7 LOW** · model `client` · reviewed 2026-08-01T19:41:49.126Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| dataModel/brainstormElicitSchema | citation | LOW | manual | brainstormElicitSchema is an exported const in src/workflow/runners/brainstorm/schemas.ts currently at the s3 converged shape { category, workingStatement, openItems, confirmed } that s4 extends with decisions + nonGoals. | src/workflow/runners/brainstorm/schemas.ts:42 `export const brainstormElicitSchema` — the s3 converged schema s4 extends. Confirmed. | none — verified sound |
| contract/elicit | citation | LOW | manual | The `elicit` StepRunner (id 'elicit', workflow 'brainstorm') in src/workflow/runners/brainstorm/index.ts has a finalize that already returns a retryable StepRunnerError (s3's 'convergence-incomplete'), the mechanism s4 reuses. | src/workflow/runners/brainstorm/index.ts:106 `const elicit = llmPauseRunner`, :88 `const finalizeElicit: StepRunnerFinalize`, :95 `code: 'convergence-incomplete'` — the s3 retryable-finalize mechanism s4 reuses. Confirmed. | none — verified sound |
| contract/elicit | semantic | LOW | manual | StepRunnerFinalize may return StepRunnerError with a `retryable` flag, and resumeRun (executor.ts) surfaces a finalize error via handleStep (phases/step.ts) as {next:'error',retryable} without advancing the stored state — the basis of the s4 fork-integrity gate. | src/workflow/executor.ts:154 `const finalize: StepRunnerFinalize`, :156 `if (result.type === 'error') return errorTick(...result.retryable)`; src/mcp/workflow-step/phases/step.ts:51 resumeRun -> surfaces the error without advancing. The retryable-error-leaves-paused mechanism holds. Confirmed. | none — verified sound |
| interaction/sc3 | semantic | LOW | manual | BrainstormElicitState { workingStatement, answered, openQuestions } is defined in src/mcp/workflow-step/state.ts and s4 adds no new field/store to it. | src/mcp/workflow-step/state.ts:44 `export interface BrainstormElicitState` { workingStatement, answered, openQuestions } — s4 adds no field/store to it. Confirmed. | none — verified sound |
| interaction/sc2 | cross-artifact | LOW | manual | registerBrainstormRunners is the sc2 scaffold registered in src/workflow/index.ts registerWorkflowRunners(), which s4 leaves structurally untouched (edits only the elicit runner body + schema). | src/workflow/runners/brainstorm/index.ts:161 registerBrainstormRunners, called at src/workflow/index.ts:27 inside registerWorkflowRunners() — the sc2 scaffold s4 leaves untouched. Confirmed. | none — verified sound |
| dataModel/brainstormElicitSchema | closed-union | LOW | manual | The category enum s4 keeps unchanged is BRAINSTORM_CATEGORY_CLASSES ids in src/shared/brainstorm-classes.ts. | src/shared/brainstorm-classes.ts:23 BRAINSTORM_CATEGORY_CLASSES with ids from :25 'requirements' onward — the enum s4 keeps unchanged. Confirmed. | none — verified sound |
| testStrategy | citation | LOW | manual | The brainstorm test suite s4 extends lives at src/workflow/runners/brainstorm/__tests__/elicit.test.ts and drives schema + runner via startRun/resumeRun with node:test + ajv. | src/workflow/runners/brainstorm/__tests__/elicit.test.ts imports startRun/resumeRun (executor) + BRAINSTORM_CATEGORY_CLASSES + ajv and asserts convergence-incomplete (:146) — the suite s4 extends. Confirmed. | none — verified sound |
