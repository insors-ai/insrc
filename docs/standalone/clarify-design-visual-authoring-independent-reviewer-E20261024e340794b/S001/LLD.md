<!-- insrc:artifact LLD-e340794b16e4d4b3-s1 -->

# LLD: E20261024e340794b:S001

## Summary

**Epic:** `clarify-design-visual-authoring-independent-reviewer`
**HLD base run:** `wf-1792827584869-aclja2`
**HLD effective hash:** `f30e4a293303...`

Correct design artifact relevance guidance across author, builder and reviewer prompts, with no schema changes. Isolated class implementation changes that do not affect relationships need no ERD. Relationship changes, even simple ones, must document endpoints, direction, cardinality/ownership and compatibility where applicable; use a concise table/text for a clearly understandable change or an ERD when it materially clarifies the model. Sequence/component diagrams explain interaction or boundary changes; UX mocks explain changed layouts, states or flows. Reviewers independently assess necessity even when no definition is supplied, inspect generated links/files/rendered content and consistency, and report unavailable rendering honestly. Advisory means narrative advice, NOT a warn verdict or a does-not-hold/LOW finding. Keep existing verdict semantics unchanged: confirmed material inadequacy is does-not-hold with MED/HIGH and blocks; genuinely unavailable evidence is could-not-verify and warns; an adequate design can hold with optional improvement advice in evidence/action. Never label a confirmed failure unverified or assert a missing artifact exists. An optional visual not required for assessment is not a failed requirement. Missing relationship documentation remains a defect even when no diagram is needed. Builders maintain relevant artifacts when implementation changes the approved relationships/UX, without inventing scope. This prompt-only change itself needs no visual artifact.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Error paths](#3-error-paths)
4. [Test strategy](#4-test-strategy)
5. [Migration](#5-migration)
6. [Alternatives considered](#6-alternatives-considered)
7. [References](#7-references)

## 1. HLD context

**Framework:** Standalone correction under approved ISSUE-e340794b16e4d4b3; no HLD or adjacent boundaries.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal

## 3. Error paths

**Error cases**

- **Missing necessary companion or broken/generated mismatch** (recoverable)
  - Detection: Independent review of design semantics and actual linked companion
  - Response: Material missing relationship documentation or necessary artifact: does-not-hold MED/HIGH with cited evidence. Adequate design with optional visual improvement: narrative suggestion under the supported adequacy premise, not a failure or warning verdict.
  - User impact: Proportional judgment without changing outcome/severity contracts or mislabeling evidence.
- **Rendering tools unavailable** (recoverable)
  - Detection: Reviewer cannot render linked HTML/diagram
  - Response: Read source/definition when possible and report could-not-verify visual rendering rather than claim success
  - User impact: Evidence limits remain honest

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Class-local method change without external entity/relationship impact | No ERD required solely because a class changed |
| Single new foreign key or relationship cardinality change | Document changed relationship; select table/prose or ERD proportionally |
| No erDefinition or uxDefinition supplied | Reviewer still independently assesses relevance |
| Third review round already completed | Stop and request explicit user permission before fourth review |

**Invariants to preserve**

- Canonical steering and guide content remain synchronized with shipped copies [[c1]]
- Review adapter retains existing answer schema and premise budget [[c2]]

## 4. Test strategy

**Test framework:** `Existing node:test with tsx; extend steering/review prompt suites and run TypeScript build. No live LLM call needed; tests establish instruction delivery rather than judgment quality.`

**Test levels**

- **unit** — Regression guard on emitted guidance, not model behavior guarantee
  - Subjects: `Author/build guides distinguish isolated edits from relationship documentation and select relevant definitions`, `Reviewer prompt independently assesses artifact necessity without existing definitions and qualifies rendering`, `Steering copies and three-round rule remain synchronized`
  - Fixtures: `Canonical steering text and generated review prompt with design lacking companion definitions`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `Author/build guides distinguish isolated edits from relationship documentation and select relevant definitions` |
| `ac2` | `Reviewer prompt independently assesses artifact necessity without existing definitions and qualifies rendering` |
| `ac3` | `Steering copies and three-round rule remain synchronized` |

## 5. Migration

**State before:** Steering hides companion selection; review prompt lacks independent relevance/rendered-artifact checks.

**State after:** Existing schemas and rendering unchanged; shipped instructions clarify proportional author/build/reviewer judgment.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Ship updated canonical prompt assets and synchronized steering copies through existing build/refresh mechanisms; preserve unrelated local instructions. — ↩ rollbackable

**Backward compat:** No persisted schema or public API migration; old designs remain readable and reviewer handles missing definitions by assessing relevance.

## 6. Alternatives considered

### 6.1 a1: Shared relevance guidance through existing prompts — **CHOSEN**

Preserve companion contracts and teach conditional selection and verification.

Update canonical steering, author/build/reviewer guidance and existing review prompt checklist wording; reuse structured definitions and deterministic rendering with unchanged schemas.

### 6.2 a2: Mandatory artifact checklist and schema

Require explicit artifact decisions in every design record.

Add structured mandatory artifact-decision fields and review gating even for designs without visual changes, while retaining existing renderers.

## 7. References

- **[[c1]]** `code` `src/prompts/steering-block.md`
- **[[c2]]** `code` `src/workflow/review-pipeline/design-review.ts`
- **[[c3]]** `prior-artifact` `docs/standalone/clarify-design-visual-authoring-independent-reviewer-E20261024e340794b/ISSUE.md`
- **[[c4]]** `stakeholder` `User clarification: isolated class change without entity impact needs no ERD; relationship changes even simple require documentation.`

## Review revision: concrete change inventory

- `src/prompts/steering-block.md` — Update front-door routing plus design.epic, design.story, build and review/code-review guides: existing-code docgen versus proposed-design structured definitions; proportional relevance and independent reviewer inspection. Preserve three-round limit.
- `src/workflow/review/template.ts` — Extend shared reviewer system prompt and existing checklist wording for independent necessity even without definitions, linked file/content/render checks, missing rendering limits and honest adequacy/advisory outcomes. Preserve item IDs, schemas and premise budget.
- `src/workflow/artifacts/companion/er-schema.ts` — Clarify ER_CONTENT_GATE_RULE relevance examples and documentation obligations; preserve structured definition as source and generated companions as framework-owned.
- `src/workflow/artifacts/companion/ux-schema.ts` — Clarify UX_CONTENT_GATE_RULE relevance examples and documentation obligations; preserve structured definition as source and generated companions as framework-owned.
- `src/workflow/artifacts/companion/sequence-schema.ts` — Clarify SEQUENCE_CONTENT_GATE_RULE relevance examples and documentation obligations; preserve structured definition as source and generated companions as framework-owned.
- `src/workflow/artifacts/companion/component-schema.ts` — Clarify COMPONENT_CONTENT_GATE_RULE relevance examples and documentation obligations; preserve structured definition as source and generated companions as framework-owned.
- `src/workflow/runners/design-epic/index.ts` — Existing consumer of shared content gates; inspect/verify prompt propagation; no duplicated policy.
- `src/workflow/runners/design-story/index.ts` — Existing consumer of shared content gates; inspect/verify prompt propagation; no duplicated policy.
- `src/workflow/orchestrator.ts` — Existing author/synthesis gate consumers and companion renderer; verify shared guidance propagates; no rendering behavior change.
- `src/workflow/review-pipeline/design-review.ts` — Existing consumer of buildTemplateReviewPrompt; verify both reviewer routes consume shared instructions, no separate policy.
- `vscode-plugin/assets/steering-block.md` — Synchronize shipped steering from canonical source.
- `AGENTS.md` — Refresh only generated steering block; retain unrelated local instructions.
- `CLAUDE.md` — Refresh only generated steering block; retain unrelated local instructions.
- `src/workflow/review/verdict.ts` — Unchanged: preserve severityForOutcome and computeVerdict semantics; regression test their actual behavior.
- `src/daemon/steps/review-step/phases/findings.ts` — Unchanged shared answer-validation consumer; verify no divergent policy.

## Advisory outcome policy

Advisory means narrative advice, NOT a warn verdict or a does-not-hold/LOW finding. Keep existing verdict semantics unchanged: confirmed material inadequacy is does-not-hold with MED/HIGH and blocks; genuinely unavailable evidence is could-not-verify and warns; an adequate design can hold with optional improvement advice in evidence/action. Never label a confirmed failure unverified or assert a missing artifact exists. An optional visual not required for assessment is not a failed requirement. Missing relationship documentation remains a defect even when no diagram is needed.

## Acceptance criteria

- **ac1**: Authors/builders distinguish isolated class edits from relationship changes; document all relationship changes and use relevant ER/sequence/component/UX definitions without blanket diagram mandates.
- **ac2**: Reviewer prompt independently assesses necessity with no definitions; checks linked files/content/rendered consistency and honestly reports unavailable rendering.
- **ac3**: Advisory improvements do not misuse defect outcomes; unchanged verdict normalization, copy synchronization and three-round cap are preserved.

## Explicit regression assertions

- src/mcp/__tests__/review-rule-text.test.ts: assert front-door existing-code/proposed-design routing and design/build/review guide relevance examples; relationship documentation versus optional ERD; all three-round clauses retained; plugin steering equals canonical source.
- src/workflow/review/__tests__/template.test.ts: generate prompt for design with no companion definitions; assert unconditional necessity assessment, linked-file existence/content/design consistency checks, visual-render verification and could-not-verify fallback. Assert instructions request author regeneration, not reviewer-authored replacement.
- src/workflow/review/__tests__/template.test.ts: assert shared content gates include isolated-class/no-relationship counterexample, relationship-change documentation, UI/interaction relevance and framework-owned companions; verify design runner/orchestrator consumers use these constants.
- src/workflow/review/__tests__/template.test.ts: pass complete valid answers through validateTemplateAnswer then computeVerdict(DEFAULT_BLOCK_ON). Adequacy holds with optional visual advice remains LOW/pass; does-not-hold severity LOW remains MED/block; HIGH remains HIGH/block; could-not-verify remains LOW/warn. Prove confirmed missing relationship documentation uses failure rather than unverified.
- Instruction assertions fail when added clauses are removed; behavioral fixtures preserve existing schema/verdict contract. These tests establish prompt delivery/normalization, not probabilistic LLM judgment or actual browser rendering.

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 do not hold · 0 could not be verified · 8 hold** · template `design-issue` · model `cli-codex:gpt-6.1-sol` · reviewed 2026-10-24T07:53:46.534Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

_None._
