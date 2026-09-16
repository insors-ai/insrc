<!-- insrc:artifact LLD-abd1ecf6a5f5063e-s2 -->

# LLD: E20260801abd1ecf6:S002

**Epic:** `frame-epic-new-pre-workflow-brainstorm`
**HLD base run:** `wf-1785587820064-46kctq`
**HLD effective hash:** `688a10691972...`

## HLD context

**Framework:** Brainstorm ships as a first-class workflow stage (alternative a1): a peer runner directory src/workflow/runners/brainstorm/ that self-registers through the existing executor registry and workflow/index.ts registerWorkflowRunners; a new persisted SpecArtifact peer file in src/workflow/artifacts/ with a specArtifactPaths peer in storage.ts (hash-addressed, listed, approval-stamped identically to DEF/HLD/LLD/PLAN); and an additive elicitation phase on the existing insrc_workflow_step MCP surface that reuses state-store.ts and the questions-gate primitive and preserves the opaque state token verbatim. The single cross-cutting SpecArtifact shape (intent, scope boundary, non-goals, decisions-with-ruled-out-alternatives, open items) is read unchanged by both define (s8) and standalone design.story (s9). Nothing touches the shared/chat-agent brainstorm.addIdea stub.
**Rollout phase:** Phase B — In-chat elicitation behaviour
**Consumes:** `sc2` (Brainstorm stage runner registration), `sc3` (Brainstorm MCP elicitation phase + continuation state)

## Contract details

**Surface level:** internal

### `elicit`

```typescript
const elicit: StepRunner  // workflow:'brainstorm', id:'elicit' — reshaped from an output-runner (s1) into an llm-pause runner
```

**Returns:** `StepRunnerLlmPause` — On the first turn the elicit runner returns a StepRunnerLlmPause (type:'llm-pause') whose prompt instructs the controller to classify the focus into a BrainstormCategory and emit clarifying questions; the executor pauses server-side (state-store) until the controller answers. No 'output' with a spec is produced on turn one (ac1).

**Preconditions:**
- The run's intent.focus carries the rough one-line idea (from a standalone StandaloneBrainstormContext or an epic-scoped start).

**Postconditions:**
- The controller receives a prompt + schema; the outer LLM emits { category, questions[] }; the questions are surfaced to the user in chat and the run waits for answers (ac4).

### `llmPauseRunner`

```typescript
llmPauseRunner(spec: { id: string; workflow: WorkflowName; buildPrompt: (ctx: StepRunnerContext) => { prompt: string; userTurn: string }; schema: Record<string, unknown> }): StepRunner
```

**Parameters:**
- `spec: { id; workflow; buildPrompt; schema }` — The existing helper the design runners use to build an llm-pause step. s2 reuses it to build `elicit` — buildPrompt embeds the focus + category vocabulary; schema is the first-turn response shape.

**Returns:** `StepRunner` — A runner whose run() returns an llm-pause; reused verbatim from the design-story runners (no new pause mechanism).

**Preconditions:**
- Imported from the workflow runners layer (same import the design runners use).

**Postconditions:**
- The `elicit` runner surfaces its prompt through the existing step loop (k3,k8).

### `BRAINSTORM_CATEGORY_CLASSES`

```typescript
const BRAINSTORM_CATEGORY_CLASSES: readonly BrainstormCategoryClass[]  // src/shared/brainstorm-classes.ts
```

**Returns:** `readonly BrainstormCategoryClass[]` — The reused request-category vocabulary (ids requirements/design/implementation/testing/general + descriptions). s2 embeds these classes in the elicit prompt so the model picks a category and shapes questions accordingly (c33). No new taxonomy is defined.

**Preconditions:**
- Imported from src/shared/brainstorm-classes.ts.

**Postconditions:**
- The elicit prompt reflects the established categorisation (ac3).

## Data model changes

### `brainstorm first-turn elicit response { category, questions }` — new

The response schema the elicit llm-pause validates on resume: { category: BrainstormCategory; questions: readonly string[] }, in src/workflow/runners/brainstorm/schemas.ts (replacing the s1 open-object placeholder). No spec field — no spec on turn one (ac1). Emitted questions populate the existing BrainstormElicitState.openQuestions next turn (state type unchanged; owned by s1/sc3).

```
brainstormElicitSchema := { type:'object', required:['category','questions'], properties:{ category:{ enum: BRAINSTORM_CATEGORY ids }, questions:{ type:'array', items:{ type:'string' }, minItems:1 } }, additionalProperties:false }
```

**Call sites:**
- `src/workflow/runners/brainstorm/schemas.ts`
- `src/workflow/runners/brainstorm/index.ts`

### `BrainstormElicitState` — invariant-change

No structural change (sc3 type owned by s1). s2 establishes the usage invariant: first-turn questions become openQuestions and no working statement/spec is set yet. Convergence is s3.

**Call sites:**
- `src/mcp/workflow-step/state.ts`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc2` | consumes | s2 consumes sc2 (owned by s1): converts the registered `elicit` StepRunner (src/workflow/runners/brainstorm/index.ts) from an output-runner into an llm-pause runner via the existing llmPauseRunner helper. registerBrainstormRunners / executor registration untouched (k4,k5). |
| `sc3` | consumes | s2 consumes sc3 (owned by s1): elicit surfaces questions through the EXISTING step-loop llm-pause + state-store, opaque token preserved (k8,k9). No new handler phase/store. The elicitation mechanism is the step-loop pause — an LLD refinement of sc3's 'questions-gate' wording (back-flow), honoring sc3's intent. |

## Error paths

### Error cases

- **The controller's first-turn response omits `questions` or emits an empty questions array.** (recoverable)
  - Detection: The executor validates the llm-pause response against the elicit schema on resume (the framework's structured-output validate + retry over the step schema); `questions` is required with minItems 1, so an empty/absent list fails validation.
  - Response: The structured-output retry re-issues the step prompt; if retries exhaust, the run errors rather than advancing a turn with no questions — it never fabricates a spec to move on.
  - User impact: The user is never shown an empty question turn; a transient malformed emission is retried transparently.
- **The controller emits a `category` value outside the BrainstormCategory enum (a hallucinated taxonomy).** (recoverable)
  - Detection: The elicit schema constrains `category` to the enum of BRAINSTORM_CATEGORY ids (requirements/design/implementation/testing/general); a non-member value fails schema validation.
  - Response: Retried via the same structured-output loop; the guard enforces c33 (no competing taxonomy) structurally, not by prose.
  - User impact: None visible — the corrected turn uses a real category.
- **The controller emits a converged spec / answer on the FIRST turn instead of questions.** (recoverable)
  - Detection: The first-turn elicit schema has NO spec field and requires `questions`; a spec-shaped response fails validation (there is nowhere to put it).
  - Response: Rejected + retried; the schema is the enforcement point for 'no spec on the first turn' (ac1). Convergence into a spec is a later turn (s3/s6), not this one.
  - User impact: Guarantees the first turn is always questions, never a premature spec.

### Edge cases

| Input | Expected |
| :--- | :--- |
| A blank or near-empty focus string. | The elicit prompt still asks the broadest foundational clarifying questions (what is being built, for whom, success condition) rather than erroring; still produces no spec. |
| An idea that does not clearly fit one category. | The model selects the `general` catch-all BrainstormCategory and asks general intent-gap questions; still valid per the enum. |
| A focus that is already fairly detailed (not rough). | The stage still asks clarifying questions targeting the REMAINING unstated gaps and produces no spec on turn one; deciding that no material gap remains (early convergence) is s3's job, not s2's. |
| The user provides no answers / walks away after the first questions. | The run stays paused on its opaque token; s2 persists nothing as a converged statement and never invents answers. Abandonment cleanup is s3/ac5. |

### Invariants to preserve

- No spec is produced on the first turn — enforced structurally by the elicit response schema (category + questions only, no spec field). The stage asks, it does not answer for the user (ac1). [[c2]]
- The step-loop llm-pause + state-store + opaque continuation token are reused unchanged; s2 alters only the `elicit` runner body, not the handler dispatch, the state store, or the token format (k8/k9). [[c3]]
- Questioning is shaped by the reused BrainstormCategory vocabulary (requirements/design/implementation/testing/general); no competing taxonomy is introduced (c33). [[c1]]

## Test strategy

**Test framework:** `node:test + node:assert/strict, run via `npx tsx --test` (repo convention; brainstorm suites under src/workflow/runners/brainstorm/__tests__). Live model-dependent checks gate behind INSRC_LIVE_TESTS=1 and skip cleanly when unset.`

### Test levels

- **unit** — Prove the elicit runner shape + schema deterministically, without a model.
  - Subjects: `the elicit runner's run() returns a StepRunnerLlmPause (type:'llm-pause') on the first turn, NOT an 'output' (it asks, it does not answer)`, `the elicit response schema requires `category` (enum = the BRAINSTORM_CATEGORY ids) and `questions` (array, minItems 1) and has NO spec field — a spec-shaped or empty-questions response fails ajv validation`, `buildPrompt embeds the run focus and the BRAINSTORM_CATEGORY_CLASSES descriptions so the emitted prompt reflects the reused vocabulary (c33)`, `the elicit schema's category enum is exactly the BrainstormCategory union (no invented member)`
  - Fixtures: `a StepRunnerContext stub carrying a sample focus`, `ajv (the project validator) to compile + check the schema`
- **integration** — Prove the first turn drives through the real workflow-step loop as an ask-turn.
  - Subjects: `insrc_workflow_step start with workflow:'brainstorm' → plan → step returns emit_step for `elicit` with the category+questions schema (an llm-pause), not a synthesize`, `a controller step response of { category, questions[] } validates and the run pauses (no spec artifact is written this turn)`, `the opaque continuation token round-trips unchanged across the ask turn (k8/k9)`
  - Fixtures: `the workflow-step handler harness used by define-e2e/design-story-e2e`
- **live** — Prove question QUALITY against a real core-tier model (gated).
  - Subjects: `given a rough idea leaving scope/exclusions/success unstated, the emitted questions target those gaps and are not a restatement (ac2)`, `given an idea recognisable as requirements vs design vs implementation, the chosen category + questions reflect that categorisation (ac3)`
  - Fixtures: `INSRC_LIVE_TESTS=1 + a configured core-tier provider`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: elicit.run() returns an llm-pause and the schema has no spec field — questions surfaced, no spec on turn one`, `integration: the first brainstorm step returns emit_step (ask) not synthesize, and no spec artifact is written` |
| `ac2` | `unit: the schema forbids a restatement-only/empty response (questions required, minItems 1)`, `live: emitted questions target the specific idea's unstated scope/exclusions/success gaps (gated)` |
| `ac3` | `unit: category enum == BrainstormCategory ids and buildPrompt embeds BRAINSTORM_CATEGORY_CLASSES (c33)`, `live: the chosen category + questions reflect the request's categorisation (gated)` |
| `ac4` | `integration: the elicit step pauses the run on the opaque token until the controller returns answers — the daemon never advances on its own (k2)`, `unit: elicit.run() yields an llm-pause (control returns to the controller), never a self-resolved output` |

## Alternatives considered

### a1: elicit as a single llm-pause runner: classify + ask in one turn — **CHOSEN**

Convert the s1 placeholder `elicit` into an llmPauseRunner whose prompt tells the controller to classify the focus into a BrainstormCategory and emit category-shaped clarifying questions (no spec on turn one).

The `elicit` step returns a StepRunnerLlmPause (via the existing llmPauseRunner helper) whose buildPrompt embeds the rough focus + the BRAINSTORM_CATEGORY_CLASSES vocabulary and instructs the outer LLM (controller) to pick the BrainstormCategory the idea best fits, emit clarifying QUESTIONS targeting the unstated intent gaps (scope/exclusions/success), and produce NO spec. Response schema { category, questions[] }. Answers seed BrainstormElicitState.openQuestions next turn (s3). No change to the decomposer, registration, state-store, or handler.

### a2: elicit as a deterministic output runner with per-category question templates

Keep `elicit` an output-runner (no LLM); emit a fixed template of questions keyed by a heuristically-detected category.

A deterministic function classifies the focus by keyword heuristics into a BrainstormCategory and returns a hard-coded question list, no llm-pause.

**Rejected because:** Ranked 3. VIOLATES ac2 and k13: templated questions restate generic prompts and cannot target this idea's unstated gaps, trading correctness for cost on the critical design path.

### a3: Two steps: a separate classify step, then an ask step

Split turn one into a `classify` llm-pause then an `ask` llm-pause.

The decomposer emits two steps: classify (pick BrainstormCategory) then ask (emit questions), each its own llm-pause.

**Rejected because:** Ranked 2. sc2 partial: it would require editing the s1-owned brainstormDecomposer (one-step → two-step), boundary bloat for no benefit over a1's single step.

## Citations

- **[[c1]]** `analyze-bundle` `s1 symbol-locate — BrainstormCategory vocabulary` — "src/shared/brainstorm-classes.ts:12 BrainstormCategory = requirements|design|implementation|testing|general + BRAINSTORM_CATEGORY_CLASSES descriptions — reused as-is to shape questions (c33)."
- **[[c2]]** `analyze-bundle` `s1 module-profile — llm-pause step mechanism` — "design runners build steps via llmPauseRunner returning a StepRunnerLlmPause (types.ts:148); the executor hands the prompt to the controller and pauses on the state store — the mechanism the elicit tu"
- **[[c3]]** `code` `src/workflow/runners/brainstorm/index.ts + src/mcp/workflow-step/state.ts (commit 212fb1c)` — "s1 landed the placeholder `elicit` StepRunner and BrainstormElicitState in the workflow-step payload; s2 converts elicit to an llm-pause without touching registration/state-store (k8/k9)."
- **[[c4]]** `analyze-bundle` `s1 capability-discovery — questions-gate is upstream + k10 stub` — "questions-gate.ts is the upstream-artifact open-questions gate, not a mid-stage user-question mechanism; the chat-agent brainstorm.addIdea offlineRpc stub stays untouched (k10)."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 6 LOW** · model `client` · reviewed 2026-08-01T17:05:02.072Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| c1 | closed-union | LOW | manual | BrainstormCategory is exactly the union requirements\|design\|implementation\|testing\|general in src/shared/brainstorm-classes.ts, and BRAINSTORM_CATEGORY_CLASSES is exported there — the reused vocabulary (no new taxonomy). | src/shared/brainstorm-classes.ts:12 `export type BrainstormCategory` (members incl. requirements:13, implementation) + BRAINSTORM_CATEGORY_CLASSES at :23 — the reused vocabulary; no new taxonomy. Confirmed. | none — verified sound |
| c2 | citation | LOW | manual | llmPauseRunner is a real helper used by the design-story runners to build llm-pause steps (the mechanism s2 reuses for elicit). | llmPauseRunner is a real helper used to build llm-pause steps — defined + used in design-epic/index.ts:44, design-story/index.ts:107, plan/index.ts:63. Note: it is a PER-MODULE private helper (not a shared export), so the build defines brainstorm's own mirroring the pattern (or inlines the StepRunnerLlmPause return) — a build detail, the mechanism is real. | Build note: define a local llmPauseRunner in brainstorm/index.ts (or inline the pause) as the other runner modules do; do not import a non-existent shared export. |
| c2 | citation | LOW | manual | StepRunnerLlmPause (type:'llm-pause') is a real member of the StepRunnerResult union in src/workflow/types.ts — the return shape the elicit runner produces. | src/workflow/types.ts:146 `interface StepRunnerLlmPause`; type:'llm-pause' handled in executor.ts:227 — the return shape the elicit runner produces is real. Confirmed. | none — verified sound |
| c3 | citation | LOW | manual | The s1 scaffold that s2 reshapes exists: a placeholder `elicit` StepRunner in src/workflow/runners/brainstorm/index.ts and BrainstormElicitState in src/mcp/workflow-step/state.ts. | The s1 seam exists: the 'elicit' runner id (brainstorm registration.test + orchestrator brainstormDecomposer enum ['elicit']) and src/mcp/workflow-step/state.ts:35 `interface BrainstormElicitState` — both landed by s1 (212fb1c). s2 reshapes elicit in place. Confirmed. | none — verified sound |
| c4 | semantic | LOW | manual | questions-gate.ts is the upstream-artifact open-questions gate (upstreamKindFor), not a mid-stage user-question mechanism — grounding the LLD's refinement that s2 uses the step-loop pause instead. | src/mcp/workflow-step/questions-gate.ts:38 `export function upstreamKindFor(workflow): QuestionArtifactKind` — confirms questions-gate is the upstream-artifact open-questions gate, grounding the LLD's refinement that s2 uses the step-loop pause instead (honors sc3 intent). Confirmed. | none — verified sound |
| s2-consume | cross-artifact | LOW | manual | s2 consumes (does not own) sc2 + sc3, which the HLD assigns ownedByStory s1 — so role:'consumes' is correct. | sc2/sc3 are ownedByStory s1 in the HLD; s2 lists them as consumes with owns:[] — role:'consumes' is correct (no false implements). Confirmed. | none — verified sound |
