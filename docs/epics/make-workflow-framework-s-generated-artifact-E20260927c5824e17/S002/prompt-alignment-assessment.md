# S002 — LLM prompt alignment assessment

Design collateral for S002. Assesses the per-phase LLM prompts against the
framework this epic is updating (readable, audience-aware, functionally-complete
documents), and lists the prompt/schema changes required to align them.

> **Method:** mapped via `insrc_analyze` (workflow prompt sites), then read the
> runner + synthesizer sources directly. All anchors below are `file:line`.

## How the generation pipeline actually works

Each workflow phase is a set of **`StepRunner`s**. A step returns an `llm-pause`
with a **`prompt` + `schema`**; the model emits JSON matching that schema; the
step output is stored. After all steps, a **synthesizer** assembles the step
outputs into the artifact **body**, under its own **body schema** — and every one
of those body schemas is **`additionalProperties: false`** (40 such gates in
[orchestrator.ts](../../../../src/workflow/orchestrator.ts)). Finally the
per-type **renderers** ([artifacts/*.ts](../../../../src/workflow/artifacts/))
turn the body into markdown.

Consequence: **a renderer can only render body fields that a step prompt elicited
AND the synthesizer's body schema admits.** A field that no prompt asks for — or
that `additionalProperties: false` rejects — never reaches the document, and its
template section renders empty.

Prompt sites, per phase:

| Phase | Step prompts | Synthesizer |
| :--- | :--- | :--- |
| define | [runners/define/index.ts](../../../../src/workflow/runners/define/index.ts) — `scope.assess`, `epic.frame`, `stories.compose`, `checklist.verify` | `defineSynthesizer` — [orchestrator.ts:879](../../../../src/workflow/orchestrator.ts) |
| design.epic | [runners/design-epic/index.ts](../../../../src/workflow/runners/design-epic/index.ts) — `context.assemble`, `alternatives.enumerate`, `alternatives.judge`, `framework.write`, `rollout.overview`, `checklist.verify` | `designEpicSynthesizer` — [orchestrator.ts:1301](../../../../src/workflow/orchestrator.ts) |
| design.story | [runners/design-story/index.ts](../../../../src/workflow/runners/design-story/index.ts) — `context.assemble`, `alternatives.enumerate`, `alternatives.judge`, `contract.detail`, `error.paths`, `test.strategy`, `migration.write`, `checklist.verify` | `designStorySynthesizer` — orchestrator.ts |
| plan | [runners/plan/index.ts](../../../../src/workflow/runners/plan/index.ts) — `context.assemble`, `tasks.enumerate`, `tasks.critique`, `tasks.finalize`, `test-strategy.write`, `checklist.verify` | `planSynthesizer` — orchestrator.ts |

## Core finding — the new content has no upstream source

Grepping every runner prompt and every synthesizer schema:

- **`functionalDefinition` (S001):** present only in the body types, the
  renderers, and the code-review dimension
  ([artifacts/functional-definition.ts](../../../../src/workflow/artifacts/functional-definition.ts),
  [code-review/dimensions/functional-coverage.ts](../../../../src/workflow/code-review/dimensions/functional-coverage.ts)).
  **No step prompt asks the model to produce it, and no synthesizer body schema
  includes it** — `defineSynthesizer`'s body requires exactly
  `flavor/problem/nonGoals/assumptions/constraints/stories/openQuestions` with
  `additionalProperties: false` ([orchestrator.ts:937](../../../../src/workflow/orchestrator.ts)),
  which would actively **reject** a `functionalDefinition` even if a step emitted
  one. → **The functional-requirement thread is inert end-to-end**: the FR section
  renders empty on every real run. S001 shipped the data structure + renderer +
  review gate but the *elicitation* (prompt + synth schema) was never wired.
- **Plain-language `summary` / abstract (S002):** the only `summary` in any synth
  schema is the `stub`/`brainstorm` one ([orchestrator.ts:315](../../../../src/workflow/orchestrator.ts)).
  The DEF/HLD/LLD/PLAN bodies have none → the Summary section the S002 templates
  lead with renders empty.
- **`audience` (S002):** not elicited anywhere.
- **`contextRefs` / `SharedContextRef` (S002 de-dup):** not elicited; not in any
  synth body → the LLD cannot carry the HLD-context *reference*, so the renderer
  falls back to the embedded copy and **defect #13 (verbatim HLD framework-summary
  in every LLD) persists** despite the template supporting a reference line.
- **Section / nested numbering (S002):** correctly **engine-side** — computed by
  `renderFromFormat` over the ordered sections, not authored by the model. **No
  prompt change needed**; the renderer/synthesizer computes the ordinals.

**Net:** the S002 templates are the *rendering* half; without the prompt+schema
changes below they render hollow. Prompt alignment is a prerequisite for the
epic's outcome, not an optional polish.

## Required changes, per phase

Each change is a tuple: **(step prompt text) + (step schema) + (synth body schema
field) + (synth HARD-RULE carry) + (checklist item)**. Numbering needs none of
these — it is a renderer concern.

### define
- **`epic.frame`** — elicit a plain-language, Epic-scoped **`summary`**
  (audience business/product; outcome terms; foregrounds the functional
  requirements; no implementation). Add `summary` to `epicFrameSchema`.
- **`stories.compose`** (and/or `epic.frame` for doc-level) — elicit
  **`functionalDefinition`**: discrete FRs with stable ids (doc-level +
  per-story), outcome-worded. Add to `storiesComposeSchema`. *(This closes the
  S001 gap.)*
- **`defineSynthesizer`** — add `summary` + `functionalDefinition` to the body
  schema (optional for `functionalDefinition` to stay absent-safe), add verbatim
  carry rules, keep `additionalProperties: false` otherwise.
- **`checklist.verify`** — add: summary is plain-language + business/product
  legible; FRs present, outcome-form, stable ids.

### design.epic
- **`framework.write`** — elicit a plain-language-lead **`summary`** (the chosen
  decision, audience product|technical).
- **Problem-context reference** — the HLD references the DEF's problem. Prefer
  **engine-derived** (the renderer knows the Epic's DEF id) over eliciting; only
  elicit `contextRefs` if per-section references beyond the DEF are needed.
- **`designEpicSynthesizer`** — add `summary` to the body schema (+ verbatim
  rule + checklist item).

### design.story
- **`contract.detail`** (or a light dedicated turn) — elicit a plain-language,
  **Story-scoped `summary`** (what this story delivers + chosen approach) and
  the per-story **`functionalDefinition`**.
- **HLD-context de-dup** — default the LLD's `contextRefs` to an
  **engine-derived** `SharedContextRef` at the HLD framework-summary (the id is
  known from `epicHash`); allow optional model-supplied additions. This is what
  makes defect #13 actually go away.
- **`designStorySynthesizer`** — add `summary`, `functionalDefinition`,
  `contextRefs` to the body schema (+ verbatim/derive rules).
- **`checklist.verify`** — add: summary present + story-scoped + plain-language;
  HLD context is a reference (no verbatim framework-summary copy).

### plan
- **`tasks.finalize`** (or synth) — elicit a plain-language **`summary`** (what
  the build delivers + task count/ordering).
- **`planSynthesizer`** — add `summary` to the body schema (+ checklist item).

## Scope decision this surfaces

This assessment reveals two things the current S002 LLD does **not** cover:

1. **An S001 gap** — the functional-requirement *elicitation* (prompt + synth
   schema) was never wired, so S001's FR thread is currently inert. Options:
   fold the FR-elicitation fix into S002, or a small S001 follow-up/back-fill.
2. **Genuine S002 additions** — the summary/audience/contextRefs *elicitation*
   (prompt + schema) belongs with the templates, because without it the templates
   render hollow. This **expands S002's task set** (the plan) beyond "renderers +
   templates" to include the runner-prompt + synthesizer-schema changes above.

Neither is in the reviewed LLD's contract/data-model/tasks. Recommended: treat
prompt+schema alignment as **in-scope for S002** (it is the elicitation half of
the same readability contract) and back-fill the S001 FR-elicitation as part of
it — but this is a scope call for the human, and may warrant a one-line HLD note
that S002 owns the elicitation prompts as well as the renderers.

## DECISION (2026-09-28) — SPLIT

The human chose **split**:

- **S002 absorbs the `summary` / `audience` / `contextRefs` elicitation.** S002
  now owns BOTH halves of the readability contract: the renderers + templates
  **and** the runner-prompt + synthesizer-schema changes that produce the
  summary, audience tag, and the HLD-context de-dup reference. Specifically, in
  S002 scope: `framework.write` summary (design.epic); `contract.detail` summary
  + engine-derived `contextRefs` (design.story); `tasks.finalize`/synth summary
  (plan); DEF `epic.frame` summary (define); the matching synthesizer body-schema
  fields + verbatim/derive rules + checklist items. Section/nested numbering
  stays engine-side in `renderFromFormat`.
  → This **expands S002's contract + data-model + task set** beyond the reviewed
  LLD, so the S002 LLD will be **regenerated** (in the pending one-pass) to add
  the elicitation contract, and carry a **one-line HLD note** that S002 owns the
  elicitation prompts as well as the renderers.

- **S001 `functionalDefinition` elicitation is a SEPARATE small S001 back-fill.**
  The unwired FR elicitation (define `epic.frame`/`stories.compose` prompts +
  `defineSynthesizer` body schema + FR checklist items) is S001's unfinished
  wiring, tracked as its own follow-up (route via triage/design.story when
  started). **Not** part of S002. Until it lands, the FR section stays absent-safe
  (renders empty), which S002's templates already handle.
