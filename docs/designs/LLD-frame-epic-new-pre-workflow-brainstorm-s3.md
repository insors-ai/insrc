<!-- insrc:artifact LLD-abd1ecf6a5f5063e-s3 -->

# LLD: E20260801abd1ecf6:S003

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

**Returns:** `Record<string, unknown>` — The ajv JSON Schema the paused `elicit` step validates the controller's resume payload against. s3 EVOLVES it from the s2 first-turn shape { category, questions } into the converged shape { category, workingStatement, openItems, confirmed } — additionalProperties:false, category still enum = BRAINSTORM_CATEGORY_CLASSES ids, plus workingStatement:string (the current understanding), openItems:string[] (gaps still unresolved), confirmed:boolean (whether the user has agreed to the statement).

**Errors:**
- `ajv validation failure` when The controller resumes with a payload carrying an unknown field, a bad category, a non-boolean confirmed, or (once convergence completes) a missing workingStatement — the executor rejects the resume rather than advancing.

**Preconditions:**
- The `elicit` step is paused (an llm-pause) carrying this schema.

**Postconditions:**
- A resume payload that validates completes the step; a `confirmed:false` payload is a valid intermediate turn (convergence not yet done); only a `confirmed:true` payload signals the converged statement is agreed.

### `elicit`

```typescript
const elicit: StepRunner  // { id:'elicit', workflow:'brainstorm', run(ctx): StepRunnerLlmPause, finalize(llmResponse): StepRunnerOutput }
```

**Parameters:**
- `ctx: StepRunnerContext` — Carries intent.focus (the rough idea) and the accumulating step context the buildPrompt reads.

**Returns:** `StepRunnerLlmPause | StepRunnerOutput` — run() pauses with the convergence prompt + evolved brainstormElicitSchema; finalize() returns the (possibly confirmed) converged payload as the step output. s3 reshapes the s2 buildPrompt from 'ask the first round of questions' into 'conduct the clarify -> fold -> show-understanding -> confirm conversation, re-asking only unresolved openItems each turn, and do not treat it as done until confirmed:true'. The runner id, workflow, and registration are byte-identical to s2 — only buildPrompt + schema change.

**Errors:**
- `resume rejected` when finalize receives a payload failing brainstormElicitSchema — surfaced to the controller, run stays paused.

**Preconditions:**
- registerBrainstormRunners() has run (sc2); the run is a `brainstorm` workflow whose one-step plan is `elicit`.

**Postconditions:**
- The daemon runs NO loop during convergence — it holds the single pause while the controller conducts the chat (k2); the run advances to synthesize only once the step is finalized with confirmed:true; if the step is never resumed (abandonment) nothing is recorded (ac5).

### `registerBrainstormRunners`

```typescript
export function registerBrainstormRunners(): void
```

**Returns:** `void` — Idempotently registers the `elicit` runner into the executor registry (sc2). s3 leaves this entry point and its wiring in registerWorkflowRunners() structurally untouched — s3 only edits the elicit runner body + schema, staying inside its boundary (owns nothing; consumes sc2).

**Errors:**
- `duplicate registration` when registerRunner throws on a duplicate `${workflow}/${id}` key — guarded by the idempotent `registered` flag, unchanged by s3.

**Postconditions:**
- getRunner('brainstorm','elicit') resolves to the reshaped convergence runner.

## Data model changes

### `brainstormElicitSchema` — field-modify

Evolve the s2 elicit response schema in src/workflow/runners/brainstorm/schemas.ts from { category, questions:string[] } to the convergence shape { category (enum = BRAINSTORM_CATEGORY_CLASSES ids), workingStatement:string, openItems:string[], confirmed:boolean }, additionalProperties:false. `questions` is subsumed: the opening turn's questions become the first openItems. The schema must permit intermediate turns (confirmed:false with non-empty openItems) and a final turn (confirmed:true).

```
- required: ['category','questions']
- properties.questions: { type:'array', items:{type:'string'}, minItems:1 }
+ required: ['category','workingStatement','openItems','confirmed']
+ properties.workingStatement: { type:'string', minLength:1 }
+ properties.openItems: { type:'array', items:{type:'string'} }
+ properties.confirmed: { type:'boolean' }
```

**Call sites:**
- `src/workflow/runners/brainstorm/schemas.ts`
- `src/workflow/runners/brainstorm/index.ts`

### `BrainstormElicitState` — field-modify

The sc3 continuation state in src/mcp/workflow-step/state.ts { workingStatement; answered; openQuestions } is the persisted mirror of the convergence: workingStatement holds the current understanding shown each turn (ac2), answered accumulates what has been settled so it is not re-asked (ac1), openQuestions holds the gaps still to probe (ac4). s3 threads it across the controller's chat turns via the existing state-store; no new field is required, but s3 pins its convergence semantics (previously an inert s1 placeholder). It rides WorkflowStepStatePayload.brainstorm as before.

**Call sites:**
- `src/mcp/workflow-step/state.ts`
- `src/mcp/workflow-step/state-store.ts`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc2` | consumes | s3's convergence behaviour lives on the `elicit` runner that sc2's registerBrainstormRunners registers. s3 consumes the scaffold unchanged — same runner id, same registration wiring in registerWorkflowRunners() — and edits only the runner body + schema, so nothing in sc2's surface changes (boundary: owns [], depends [sc2]). |
| `sc3` | consumes | s3 consumes the MCP elicitation phase + continuation state: it evolves the brainstormElicitSchema the paused step carries and threads BrainstormElicitState across the controller's chat turns through the existing state-store, with the opaque continuation token preserved verbatim (k8/k9). The daemon runs no loop (k2) — the controller re-invokes insrc_workflow_step within the single pause until it resumes once with confirmed:true. No persisted spec artifact is written (that is s6); abandonment leaves the state unresumed and records nothing (ac5). |

## Error paths

### Error cases

- **The controller resumes the elicit step with confirmed:true but a workingStatement that is empty or is really just the verbatim rough idea (nothing was actually converged).** (recoverable)
  - Detection: brainstormElicitSchema requires workingStatement with minLength:1, so an empty string fails ajv on resume; a non-empty-but-unconverged statement is caught by the prompt's HARD RULE that confirmed:true requires openItems to be empty and the statement to have been shown-and-agreed — the executor rejects a confirmed:true payload that still carries unresolved openItems.
  - Response: The resume is rejected before the step finalizes; the run stays paused and the controller must continue the convergence conversation rather than advancing to synthesize.
  - User impact: The user is not handed a premature 'converged' statement; the conversation keeps going until intent is genuinely pinned (ac4).
- **The controller marks confirmed:true without ever showing the current understanding back to the user (skips ac2), or the user never actually said yes.** (recoverable)
  - Detection: The convergence contract is that confirmed:true encodes an explicit user agreement to a statement the user has seen; the prompt requires the working statement be presented for confirmation and treats the step as unfinished until the user confirms. A confirmed:true with no corresponding shown-statement is a controller-discipline violation surfaced in review, not a silent pass — there is no auto-confirm path in the runner.
  - Response: The runner has no server-side loop to auto-advance (k2); only the controller's explicit confirmed:true finalizes. Review/checklist flags any confirmation not preceded by a shown statement.
  - User impact: The user cannot be committed to a request they never agreed to; ac3 holds.
- **brainstormElicitSchema is evolved but a stale confirmed:false resume carries the retired `questions` field (a client still on the s2 shape).** (recoverable)
  - Detection: additionalProperties:false rejects the unknown `questions` field on resume; the executor surfaces the ajv error to the controller.
  - Response: The resume is rejected; the controller must re-emit in the converged shape (openItems, not questions). No partial/mixed-shape state is stored.
  - User impact: No corrupt continuation state; the conversation resumes cleanly once the correct shape is sent.

### Edge cases

| Input | Expected |
| :--- | :--- |
| The user answers the very first round so completely that no material gap remains — convergence in a single turn. | The runner still presents the converged workingStatement for explicit confirmation (openItems empty) and only finalizes on confirmed:true; it does not auto-finish just because openItems emptied on turn one (ac3). |
| A large, ambiguous, new-capability idea where each answer opens further gaps across many turns. | The convergence keeps folding answers into workingStatement and re-asking only the still-unresolved openItems, turn after turn, with no fixed round budget — it does not stop early to save turns/model calls (ac4, k13). The stage sits on the critical design path / core tier. |
| The user abandons mid-conversation — the elicit step is left paused and never resumed. | Nothing is recorded as a converged statement and no downstream stage can consume a half-elicited result: the run never reaches synthesize, no spec artifact is written (that is s6), and the only footprint is the transient paused state in the state-store (ac5, k12). |
| The user contradicts an earlier answer on a later turn (revises a previously-settled point). | The revised answer is folded into workingStatement, the affected point moves back into openItems if it reopens a gap, and the shown current understanding reflects the correction on that turn (ac1, ac2) — answered is not treated as immutable. |

### Invariants to preserve

- The daemon runs no autonomous elicitation loop: the single `elicit` step stays paused while the controller conducts the chat, and the run advances only on an explicit resume — s3 must not introduce a server-side convergence loop. [[c2]]
- The opaque continuation state token is preserved verbatim across every convergence turn; the state-store round-trips BrainstormElicitState unchanged and no new store is introduced. [[c8]]

## Test strategy

**Test framework:** `node:test + node:assert/strict via `npx tsx --test` (with ajv for schema assertions), matching the s1/s2 brainstorm suites under src/workflow/runners/brainstorm/__tests__/`

### Test levels

- **unit** — Prove the evolved brainstormElicitSchema structurally enforces the convergence contract: it accepts the converged shape, rejects the retired s2 shape, and gates confirmation on a real working statement.
  - Subjects: `brainstormElicitSchema accepts { category, workingStatement, openItems, confirmed:false } (a mid-convergence turn)`, `brainstormElicitSchema accepts { category, workingStatement, openItems:[], confirmed:true } (the agreed statement)`, `brainstormElicitSchema REJECTS an empty workingStatement (minLength:1)`, `brainstormElicitSchema REJECTS the retired `questions` field and any additionalProperties`, `brainstormElicitSchema REJECTS a non-boolean confirmed and a category outside BRAINSTORM_CATEGORY_CLASSES ids`
  - Fixtures: `a fresh Ajv compile of brainstormElicitSchema`
- **unit** — Prove the reshaped `elicit` runner conducts convergence within one pause and only finalizes on an explicit confirmed:true, driven through the real executor.
  - Subjects: `elicit.run() returns a StepRunnerLlmPause carrying the evolved brainstormElicitSchema (not the s2 questions schema)`, `buildPrompt instructs: fold answers into workingStatement, show the current understanding each turn, re-ask only unresolved openItems, and do not finish until confirmed`, `resumeRun with a confirmed:false payload keeps the step's semantics intact (intermediate turn) and resumeRun with confirmed:true completes the run carrying the converged { category, workingStatement, openItems, confirmed } forward as the step output`, `the runner exposes no server-side loop: run() pauses exactly once and only finalize() advances (k2)`
  - Fixtures: `a one-step brainstorm plan { id:'s1', runner:'elicit' } driven via startRun/resumeRun`, `a stub WorkflowIntent with a rough focus`
- **integration** — Prove the convergence round-trips through the real insrc_workflow_step dispatch: continuation token preserved verbatim across turns, no spec artifact written mid-convergence, abandonment leaves nothing.
  - Subjects: `insrc_workflow_step start (workflow:'brainstorm') -> plan -> emit_step for `elicit` carrying the evolved schema`, `posting a confirmed:false resume pauses the run again and the opaque state token is byte-identical across the turn (k8/k9)`, `BrainstormElicitState { workingStatement, answered, openQuestions } round-trips through the state-store unchanged across turns`, `a run left paused (never resumed with confirmed:true) writes no DEF/SpecArtifact and leaves only transient state-store state (ac5)`
  - Fixtures: `a temp repo intent`, `state-store helpers (_clearWorkflowStateStoreForTests / _workflowStateStoreSize)`
- **live** — Gated (INSRC_LIVE_TESTS=1) end-to-end convergence quality: the conversation folds answers, shows understanding, keeps probing an ambiguous idea until pinned, and only confirms an agreed statement.
  - Subjects: `given a vague idea, successive answers are folded into workingStatement and the next turn asks only still-unresolved openItems, not settled points (ac1)`, `each turn's workingStatement reflects the latest answers as a shown current understanding (ac2)`, `a large ambiguous new-capability idea keeps probing across many turns and does not stop early with unresolved openItems (ac4)`, `convergence presents the statement and only emits confirmed:true after agreement (ac3)`
  - Fixtures: `a live core-tier provider (INSRC_LIVE_TESTS=1)`, `a scripted ambiguous idea + canned answers`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: resumeRun with a confirmed:false answer folds into workingStatement and buildPrompt re-asks only unresolved openItems`, `integration: BrainstormElicitState.answered accumulates settled points and openQuestions shrinks across turns`, `live: successive answers are folded and settled points are not re-asked` |
| `ac2` | `unit: buildPrompt requires showing the current understanding each turn; workingStatement is present on every intermediate response`, `live: each turn's workingStatement reflects the latest answers as the shown understanding` |
| `ac3` | `unit: resumeRun does NOT complete on a confirmed:false payload even with openItems:[] — completion requires confirmed:true`, `unit: brainstormElicitSchema accepts confirmed:true only with a non-empty workingStatement`, `live: convergence presents the statement and only confirms after explicit agreement` |
| `ac4` | `unit: the runner has no fixed round budget — repeated confirmed:false resumes keep pausing until confirmed:true`, `live: a large ambiguous new-capability idea keeps probing across many turns and does not stop early` |
| `ac5` | `integration: a run left paused (never resumed with confirmed:true) writes no spec/DEF artifact and only transient state-store state remains`, `integration: no downstream stage can read a converged statement from an abandoned run` |

## Alternatives considered

### a1: Controller-conducted convergence within the single elicit pause; elicit output evolves to the converged statement — **CHOSEN**

Keep ONE `elicit` llm-pause; its prompt tells the controller to run the whole clarify→fold→show→confirm conversation in chat, threading BrainstormElicitState, and resume the step ONCE with the confirmed converged statement.

The elicit step stays a single llm-pause (no plan/decomposer change). Its buildPrompt (extending s2's) instructs the controller to: fold the user's answers into a working statement, show that current understanding each turn, ask only still-open gaps, keep probing a large/ambiguous request until intent is pinned (no early stop), and — only when no material gap remains — present the converged statement for the user's EXPLICIT confirmation before finishing. brainstormElicitSchema evolves from s2's { category, questions } to { category, workingStatement, openItems, confirmed:boolean } (the elicit turn's final output). The daemon stays paused throughout and runs no loop (k2); BrainstormElicitState.workingStatement/answered/openQuestions is the controller's working memory, surfaced each chat turn. Abandonment = the controller never resumes the step, so nothing is recorded.

### a2: Fixed N-round convergence as N plan steps from the decomposer

Have brainstormDecomposer emit a fixed number of converge steps (e.g. 3 rounds), each an executor llm-pause.

The decomposer plans N `converge` steps; the executor pauses/resumes once per step, giving N ask-answer rounds before synthesize.

**Rejected because:** A fixed round count cannot 'keep probing until intent is pinned' — it either stops early (violates ac4) or wastes rounds — and it requires editing the s1-owned brainstormDecomposer (sc2 partial); confirm-before-done does not map onto a fixed step count (ac3 partial). Ranked below a1.

### a3: Reuse the resolve_question artifact loop for convergence

Drive convergence through the existing resolve_question phase (returns next question or 'ready').

Adapt src/mcp/workflow-step/phases/resolve-question.ts (the dynamic next-question-or-ready loop) to run the brainstorm convergence.

**Rejected because:** resolve_question mutates/commits an upstream artifact as it loops — it persists before confirmation (violates ac5) and re-renders as it goes rather than waiting for one explicit confirmation (violates ac3); it is a pre-run artifact gate, the wrong lifecycle for a mid-run working statement. Ranked lowest.

## Citations

- **[[c1]]** `analyze-bundle` `s1 symbol-locate — the s2 elicit seam s3 evolves + the sc3 BrainstormElicitState it threads (brainstorm/index.ts, schemas.ts, state.ts)`
- **[[c2]]** `analyze-bundle` `s1 module-profile — executor pause/resume: a single step cannot re-pause itself; convergence must be controller-conducted within one pause, daemon runs no loop (executor.ts, step.ts, orchestrator.ts)`
- **[[c3]]** `prior-artifact` `HLD sc2 — Brainstorm stage runner registration (owned by s1, consumed by s3)`
- **[[c4]]** `prior-artifact` `HLD sc3 — Brainstorm MCP elicitation phase + continuation state (owned by s1, consumed by s3)`
- **[[c5]]** `prior-artifact` `Story E20260801abd1ecf6:S003 acceptance criteria ac1–ac5`
- **[[c6]]** `analyze-bundle` `s1 module-profile — resolve_question loop is the closest dynamic multi-turn precedent but mutates an upstream artifact (resolve-question.ts, questions.ts)`
- **[[c7]]** `prior-artifact` `s2 LLD/build (commit b292dd2) — the first-turn elicit llm-pause + brainstormElicitSchema { category, questions } that s3 evolves`
- **[[c8]]** `analyze-bundle` `s1 capability-discovery — controller-driven, no daemon loop; opaque state token preserved verbatim via state-store; k10 addIdea stub untouched (state-store.ts, daemon/index.ts)`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 10 LOW** · model `client` · reviewed 2026-08-01T18:14:41.142Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| contract/brainstormElicitSchema | citation | LOW | manual | brainstormElicitSchema is an exported const in src/workflow/runners/brainstorm/schemas.ts (the s2 shape { category, questions } that s3 evolves). | src/workflow/runners/brainstorm/schemas.ts:30 `export const brainstormElicitSchema: Record<string, unknown> = {` — the s2 shape s3 evolves. Confirmed. | none — verified sound |
| contract/elicit | citation | LOW | manual | The `elicit` StepRunner (id 'elicit', workflow 'brainstorm') is defined in src/workflow/runners/brainstorm/index.ts as an llm-pause runner with run()+finalize(). | src/workflow/runners/brainstorm/index.ts:69 `const elicit = llmPauseRunner({`, :70 `id: 'elicit'`, :43 `workflow: 'brainstorm'` — the llm-pause runner s3 reshapes. Confirmed. | none — verified sound |
| contract/registerBrainstormRunners | citation | LOW | manual | registerBrainstormRunners() is exported from src/workflow/runners/brainstorm/index.ts and idempotently registers the elicit runner via registerRunner, guarded by a `registered` flag. | src/workflow/runners/brainstorm/index.ts:108 `export function registerBrainstormRunners(): void`, :104 `let registered = false`, :110 `registerRunner(elicit)` — idempotent, mirroring define/design-epic/design-story (each has its own `let registered`). Confirmed. | none — verified sound |
| dataModel/BrainstormElicitState | semantic | LOW | manual | BrainstormElicitState { workingStatement; answered; openQuestions } is defined in src/mcp/workflow-step/state.ts and rides WorkflowStepStatePayload.brainstorm. | src/mcp/workflow-step/state.ts:35 `export interface BrainstormElicitState`, :36 `readonly workingStatement: string`, :59 `readonly brainstorm?: BrainstormElicitState` on WorkflowStepStatePayload. Confirmed. | none — verified sound |
| contract/brainstormElicitSchema | closed-union | LOW | manual | The category enum in brainstormElicitSchema is derived from BRAINSTORM_CATEGORY_CLASSES ids (requirements/design/implementation/testing/general), not hand-listed. | src/shared/brainstorm-classes.ts:23 `export const BRAINSTORM_CATEGORY_CLASSES`, ids :25 'requirements' … :41 'general'; schemas.ts and index.ts import it (derived, not hand-listed). Confirmed. | none — verified sound |
| hld/executor | semantic | LOW | manual | The executor's resumeRun feeds the controller's turn to the paused step's finalize and advances; a single fixed-plan step cannot re-pause itself, so multi-round convergence must be controller-conducted within the single elicit pause. | The exact pattern `export function resumeRun` did not match (resumeRun is exported in another declaration form), but executor.ts's resumeRun is imported by elicit.test.ts (`import { startRun, resumeRun } from '../../../executor.js'`) and llm-pause/finalize are pervasive — the pause/resume architecture the premise leans on holds. Confirmed (probe pattern over-strict, not an artifact defect). | none — verified sound |
| hld/state-store | citation | LOW | manual | The state-store (src/mcp/workflow-step/state-store.ts) persists the paused run and preserves the opaque continuation token verbatim across turns; the elicit convergence reuses it with no new store. | src/mcp/workflow-step/state-store.ts exports saveState/loadState and the test helpers _clearWorkflowStateStoreForTests + _workflowStateStoreSize (:72); the brainstorm convergence reuses this store with no new store. Confirmed. | none — verified sound |
| alternatives/a3 | citation | LOW | manual | resolve_question is a repeated-call loop in src/mcp/workflow-step/phases/resolve-question.ts that operates on an upstream artifact's open questions (re-renders + commits it via workflow/questions.ts) — the wrong lifecycle for mid-run convergence. | src/mcp/workflow-step/phases/resolve-question.ts exists (dispatched from handler.ts:15) and returns `{ next: 'ready' }` at :90 — the upstream-artifact question loop a3 was rejected for reusing. Confirmed. | none — verified sound |
| nonFunctional/k10 | semantic | LOW | manual | The brainstorm workflow-stage runner never imports the daemon layer nor invokes the chat-agent brainstorm.addIdea offlineRpc stub (k10). | `addIdea` appears only in src/daemon/index.ts:1354 (`'brainstorm.addIdea': offlineRpc(...)`) and the registration.test.ts k10 guard; it is NOT imported or called in src/workflow/runners/brainstorm/index.ts, and no `from '...daemon...'` import exists in the brainstorm runner. k10 holds. Confirmed. | none — verified sound |
| interaction/registerWorkflowRunners | cross-artifact | LOW | manual | registerBrainstormRunners is wired into registerWorkflowRunners() in src/workflow/index.ts (sc2), left structurally untouched by s3. | src/workflow/index.ts:12 imports registerBrainstormRunners and :27 calls it inside registerWorkflowRunners() — the sc2 wiring, structurally untouched by s3. Confirmed. | none — verified sound |
