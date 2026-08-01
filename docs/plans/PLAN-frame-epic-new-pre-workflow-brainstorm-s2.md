<!-- insrc:artifact PLAN-abd1ecf6a5f5063e-s2 -->

# Plan: E20260801abd1ecf6:S002

**Epic:** `frame-epic-new-pre-workflow-brainstorm`
**LLD run:** `wf-1785602839477-zcq43o`
**LLD effective hash:** `688a10691972...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Define the elicit first-turn response schema in schemas.ts | S | — | unit: brainstormElicitSchema (ajv) rejects a response with additional 'spec' field or with empty/absent questions, and accepts a valid {category, questions[]} payload; unit: brainstormElicitSchema category enum equals exactly the BRAINSTORM_CATEGORY_CLASSES ids (requirements/design/implementation/testing/general), no invented or missing member | [[c2]] [[c4]] [[c5]] [[c1]] [[c33]] |
| 2 | **`t2`** Convert the elicit StepRunner to an llm-pause via llmPauseRunner in index.ts | M | `t1` | unit: elicit.run() returns a StepRunnerLlmPause (type:'llm-pause') on the first turn, never an 'output' with a spec; unit: elicit buildPrompt output contains both the run's focus text and the BRAINSTORM_CATEGORY_CLASSES descriptions; integration: insrc_workflow_step start (workflow:'brainstorm') → plan → the returned step is emit_step for 'elicit' carrying brainstormElicitSchema, not a synthesize step; integration: posting a valid {category, questions[]} controller response to the elicit step validates and pauses the run without writing a spec artifact; integration: the opaque continuation state token is unchanged across the elicit ask turn; live: (gated INSRC_LIVE_TESTS=1) given a rough idea leaving scope/exclusions/success unstated, the emitted questions target those gaps and are not a restatement; live: (gated INSRC_LIVE_TESTS=1) given an idea recognisable as requirements vs design vs implementation, the chosen category and questions reflect that categorisation | [[c7]] [[c8]] [[c2]] [[c6]] [[c9]] [[c10]] [[c3]] [[c33]] [[c11]] |

### E20260801abd1ecf6:S002:T001 — Define the elicit first-turn response schema in schemas.ts

Replace the s1 open-object placeholder for the 'elicit' step in src/workflow/runners/brainstorm/schemas.ts with brainstormElicitSchema: an ajv-shape requiring category (enum = BRAINSTORM_CATEGORY_CLASSES ids from src/shared/brainstorm-classes.ts: requirements/design/implementation/testing/general) and questions (array of string, minItems 1), additionalProperties:false, and deliberately NO spec field so a converged-spec or empty-questions response fails validation on the first turn.

**Acceptance checks:**
- brainstormElicitSchema is valid ajv JSON Schema requiring exactly ['category','questions'] with additionalProperties:false
- category is an enum whose members equal exactly the BRAINSTORM_CATEGORY_CLASSES ids (requirements/design/implementation/testing/general) — no invented or missing member
- questions is typed array of string with minItems:1, so an empty or absent questions array fails validation
- the schema has no 'spec' property, so a spec-shaped response fails validation on the first turn

### E20260801abd1ecf6:S002:T002 — Convert the elicit StepRunner to an llm-pause via llmPauseRunner in index.ts

In src/workflow/runners/brainstorm/index.ts, reshape the already-registered `elicit` StepRunner from the s1 output-runner placeholder into an llm-pause runner built with the existing llmPauseRunner(spec) helper (mirroring the inline pattern used by design-story/design-epic/plan runners, not a shared import). buildPrompt embeds the run's focus plus the BRAINSTORM_CATEGORY_CLASSES vocabulary/descriptions and instructs the controller to classify the idea and emit clarifying questions targeting unstated scope/exclusions/success gaps; schema is t1's brainstormElicitSchema. registerBrainstormRunners() and the executor registration call in this same file are left structurally untouched (same runner id, same registration signature) — this task only edits the elicit runner's body. Also add an integration test proving the reshaped runner round-trips correctly through the real insrc_workflow_step dispatch, not just in isolation.

**Acceptance checks:**
- elicit.run() returns a StepRunnerLlmPause (type:'llm-pause') on the first turn, never an 'output' with a spec
- buildPrompt embeds both the run's focus and the BRAINSTORM_CATEGORY_CLASSES descriptions in the emitted prompt text
- the runner is built via the existing llmPauseRunner(spec) helper using t1's brainstormElicitSchema, following the inline pattern of the design-story/design-epic/plan runners rather than a new shared abstraction
- the diff for this task touches only the elicit runner's buildPrompt/schema wiring inside index.ts; registerBrainstormRunners' call sites and other runner ids are byte-identical to s1's output
- an integration test driving insrc_workflow_step for a standalone brainstorm run confirms: the first step returned is an ask/emit_step (not synthesize) carrying t1's brainstormElicitSchema, a valid {category, questions[]} controller response is accepted and the run pauses, and the opaque state token is unchanged across the turn

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| the elicit runner's run() returns a StepRunnerLlmPause (type:'llm-pause') on the first turn, NOT an 'output' (it asks, it does not answer) | `t2` |
| the elicit response schema requires `category` (enum = the BRAINSTORM_CATEGORY ids) and `questions` (array, minItems 1) and has NO spec field — a spec-shaped or empty-questions response fails ajv validation | `t1` |
| buildPrompt embeds the run focus and the BRAINSTORM_CATEGORY_CLASSES descriptions so the emitted prompt reflects the reused vocabulary (c33) | `t2` |
| the elicit schema's category enum is exactly the BrainstormCategory union (no invented member) | `t1` |
| insrc_workflow_step start with workflow:'brainstorm' → plan → step returns emit_step for `elicit` with the category+questions schema (an llm-pause), not a synthesize | `t2` |
| a controller step response of { category, questions[] } validates and the run pauses (no spec artifact is written this turn) | `t2` |
| the opaque continuation token round-trips unchanged across the ask turn (k8/k9) | `t2` |
| given a rough idea leaving scope/exclusions/success unstated, the emitted questions target those gaps and are not a restatement (ac2) | `t2` |
| given an idea recognisable as requirements vs design vs implementation, the chosen category + questions reflect that categorisation (ac3) | `t2` |

## Citations

- **[[c1]]** `analyze-bundle` `s1 analyze bundle — brainstorm runner placeholder conventions`
- **[[c2]]** `prior-artifact` `LLD S002 AC1`
- **[[c3]]** `analyze-bundle` `s1 analyze bundle — llmPauseRunner inline pattern (design-story/design-epic/plan)`
- **[[c4]]** `prior-artifact` `LLD S002 AC2`
- **[[c5]]** `prior-artifact` `LLD S002 AC3`
- **[[c6]]** `prior-artifact` `LLD S002 AC4`
- **[[c7]]** `prior-artifact` `LLD S002 SC2`
- **[[c8]]** `prior-artifact` `LLD S002 SC3`
- **[[c9]]** `prior-artifact` `LLD S002 K4`
- **[[c10]]** `prior-artifact` `LLD S002 K5`
- **[[c11]]** `prior-artifact` `LLD S002 A1`
- **[[c33]]** `analyze-bundle` `s1 analyze bundle — BRAINSTORM_CATEGORY_CLASSES vocabulary/descriptions`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — plan (plan)

**0 HIGH · 0 MED · 5 LOW** · model `client` · reviewed 2026-08-01T17:19:06.596Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| t1 | citation | LOW | manual | src/workflow/runners/brainstorm/schemas.ts exists with the s1 placeholder (brainstormElicitSchema) that t1 replaces with the category+questions shape. | src/workflow/runners/brainstorm/schemas.ts:1 found; brainstormElicitSchema is exported there (imported by registration.test) — the s1 placeholder t1 replaces with the category+questions shape. Confirmed. | none — verified sound |
| t1 | closed-union | LOW | manual | The BRAINSTORM_CATEGORY_CLASSES ids are exactly requirements/design/implementation/testing/general — the enum t1's schema category must equal. | src/shared/brainstorm-classes.ts:23 BRAINSTORM_CATEGORY_CLASSES; ids requirements(:25) … general(:41) — the enum (requirements/design/implementation/testing/general) t1's schema category must equal. Confirmed. | none — verified sound |
| t2 | citation | LOW | manual | The elicit StepRunner exists in src/workflow/runners/brainstorm/index.ts (s1 placeholder) for t2 to reshape into an llm-pause runner. | src/workflow/runners/brainstorm/index.ts:39 `const elicit: StepRunner` + registerBrainstormRunners wired into workflow/index.ts:27 — the s1 placeholder t2 reshapes into an llm-pause runner (registration untouched). Confirmed. | none — verified sound |
| t2 | citation | LOW | manual | llmPauseRunner is a per-module inline helper in design-story/design-epic/plan (the pattern t2 mirrors, not a shared import). | function llmPauseRunner is a PER-MODULE inline helper at design-epic/index.ts:44, design-story/index.ts:107, plan/index.ts:63 — the pattern t2 mirrors locally (not a shared import), exactly as the plan states. Confirmed. | none — verified sound |
| p2-tasks | inventory | LOW | manual | The plan enumerates exactly 2 tasks (t1, t2) with DAG t2 depends on t1. | The plan enumerates exactly two tasks t1 (schema) and t2 (runner conversion), DAG t2→t1. Confirmed. | none — verified sound |
