<!-- insrc:artifact DEF-e2c6705fd105d4ac -->

# Epic: complete-generated-artifact-companion-wiring-across

## Summary

**Flavor:** enhancement

The workflow framework already builds machinery to enrich its design and build artifacts — UX mock-ups and data-model diagrams on design docs, a per-build change-log and feedback record on the build ledger, and companion diagrams reviewers can check against. But three parts of that machinery are incompletely wired, so in practice those enrichments never actually appear: design docs get no UX mock even when one is warranted, controller-side builds record no change-log or feedback, and there is no way to attach sequence or component diagrams to a design doc at all. This epic closes those gaps so the artifacts carry the visual and provenance content the framework was built to produce.

## Contents

1. [Problem](#1-problem)
2. [Functional requirements](#2-functional-requirements)
3. [Non-goals](#3-non-goals)
4. [Assumptions](#4-assumptions)
5. [Constraints](#5-constraints)
6. [Stories](#6-stories)
7. [References](#7-references)

## 1. Problem

The framework was built to produce richer design and build artifacts — design documents that can carry a UX mock-up or a data-model diagram, a build ledger record that logs the exact set of changed files and any reviewer feedback, and companion diagrams that make a design checkable at a glance. In practice three of these never materialise. Design documents for user-facing work never gain a UX mock even when the layout would clearly aid understanding. Builds performed by the controller (rather than the dedicated validate step) leave no build record at all — no change-log, no feedback — so the ledger that was meant to capture what each build touched is silently empty. And design documents cannot carry a sequence or component diagram at all: those diagrams are only obtainable as a separate, manual document-generation step, never embedded where a reviewer reads the design. The net effect is that the artifacts consistently under-deliver the visual and provenance content the framework promises, and the gap is invisible because nothing errors — the content is simply absent.

## 2. Functional requirements

- **E20260929e2c6705f:FR001** — For a design document that designs a user-facing experience whose layout would materially aid understanding, the system prompts the author to produce a UX mock, so a UX companion is rendered and the UX review dimension engages. _(Closes the dead UX gate so the shipped UX-mock + review machinery is actually reachable.)_
- **E20260929e2c6705f:FR002** — Every completed story build records a build-ledger entry capturing the changed-file set and any reviewer feedback, regardless of whether the build ran through the dedicated validate step or the controller path. _(Makes build provenance reliable rather than dependent on which build path was used.)_
- **E20260929e2c6705f:FR003** — A design document can carry a sequence diagram and a component-dependency diagram as companions, produced under the same content-gated authoring as the existing data-model and UX companions. _(Extends the design artifacts to the two diagram kinds reviewers most need for behaviour + structure, embedded where the design is read.)_
- **E20260929e2c6705f:FR004** — The wiring for each authored companion/definition is protected by an automated guard so a gate or injection cannot silently disappear from a prompt. _(Prevents recurrence of the exact dead-gate class of defect this epic fixes.)_

**s1:**

- **E20260929e2c6705f:S001:FR001** — A user-facing design document is prompted to author a UX mock under a content-gate, producing a UX companion and engaging the UX review dimension. _(Makes the already-shipped UX-mock + review machinery reachable.)_
- **E20260929e2c6705f:S001:FR002** — A design document with no user-facing experience produces no UX mock and is unchanged. _(Content-gated, backward-compatible.)_

**s2:**

- **E20260929e2c6705f:S002:FR001** — Every completed story build records a build-ledger entry with its changed-file set and any reviewer feedback, independent of the build path taken. _(Reliable build provenance.)_
- **E20260929e2c6705f:S002:FR002** — Build-record persistence is idempotent — exactly one record per story build even when both the validate step and the completion path run. _(No duplicate/conflicting ledger rows.)_

**s3:**

- **E20260929e2c6705f:S003:FR001** — A design document can author a sequence diagram companion under a content-gate, rendered and linked from the document. _(Behaviour diagrams embedded where the design is read.)_
- **E20260929e2c6705f:S003:FR002** — A design document can author a component-dependency diagram companion under a content-gate, rendered and linked from the document. _(Structure diagrams embedded where the design is read.)_
- **E20260929e2c6705f:S003:FR003** — A design document that authors no diagram is unchanged. _(Content-gated, backward-compatible.)_

## 3. Non-goals

- **Do NOT change how the standalone document-generation surface (call-sequence / component-dependency / type-structure) works on its own.** — That surface is fine as a manual tool; the epic is about EMBEDDING diagram/mock/provenance content into the tracked design/build artifacts, not reworking the standalone generator.
- **Do NOT force a diagram, UX mock, or definition onto every artifact.** — The established convention is content-gated authoring — a companion is produced ONLY when it materially aids the specific document; blanket generation would bloat artifacts and erode signal.
- **Do NOT alter the underlying model behaviour that emits the marker/definition content, or introduce any cloud/REST path.** — Prompt-steering of the model is a separate concern outside these artifacts, and the project forbids direct cloud REST from the process; the epic wires existing in-process machinery only.
- **Do NOT rework the existing er/ux companion behaviour or the shipped code-review dimensions.** — Those already work; the epic consumes their established pattern for the new wiring, and only extends it — reworking them would be scope creep and risk regressions.

## 4. Assumptions

- `high` The synthesize schemas already admit the UX definition slot and the content-gate rule constant already exists, so closing the UX gap is wiring an existing rule into the prompt, not new design. [[c1]]
- `high` The build-record writer and change-log collector already exist and work; the gap is that they are only invoked from the dedicated validate step, so a completion-path invocation is the missing wiring. [[c2]]
- `med` The companion system's er/ux pattern (a definition, a content-gate, a renderer, an optional review dimension) is a repeatable template that a sequence and a component diagram companion can follow. [[c3]]
- `high` The two prior epics that built this machinery (companion subsystem + provenance/feedback) are complete and shipped, so this is a fresh tracked epic that consumes their outputs rather than reopening them. [[c4]]

## 5. Constraints

| ID | Type | Text | Source |
| :--- | :--- | :--- | :--- |
| `k1` | invariant | Every change is additive and backward-compatible: existing artifacts that carry no UX mock / no diagram / no build record keep their exact current shape and replay unchanged; consumers ignoring the new content are unaffected. | [[c4]] |
| `k2` | convention | Authoring of any companion/definition stays CONTENT-GATED: a UX mock, sequence, or component diagram is produced ONLY when it materially aids the specific document, mirroring the established er/ux gate; never forced. | [[c3]] |
| `k3` | invariant | Build-record persistence on the completion path must be idempotent and must not double-write or conflict when the dedicated validate step also runs — exactly one BUILD record per story build. | [[c2]] |
| `k4` | convention | A source-scan guard test must pin each wiring so a gate rule / injection can never silently drift out of a prompt again (the convention established for the feedback synth wiring). | [[c1]] |
| `k5` | contract | No direct cloud/REST path and no change to model-side steering; the epic wires existing in-process framework machinery only. | [[c4]] |

## 6. Stories

### 6.1 E20260929e2c6705f:S001 — Author a UX mock on design docs when it materially aids understanding

**User value:** `size: S`

As a reviewer of a design document for a user-facing feature, I get a UX mock companion and a UX review dimension when the design's layout matters, so the visual intent is captured and checkable instead of silently omitted.

**Extends:** [[c1]]

**Acceptance criteria:**

- **ac1:** Given a design document (HLD or LLD, including a standalone LLD) is being authored for a user-facing experience whose layout would materially aid understanding, when the author composes the document, then the author is prompted by the same kind of content-gate guidance the data-model companion already uses, so a UX mock is produced when warranted. _(operationalizes `k2`, `lc1`)_
- **ac2:** Given a design document that does NOT design a user-facing experience, when the author composes it, then no UX mock is produced and the document is byte-identical to today's output. _(operationalizes `k1`, `k2`)_
- **ac3:** Given a design document that carries an authored UX mock, when its companion is finalized and the code review runs, then a UX mock companion is rendered and the UX review dimension engages against it. _(operationalizes `lc1`)_
- **ac4:** Given the set of design-document synthesize prompts that admit a UX mock, when the guard runs, then each such prompt is confirmed to carry the UX content-gate guidance, so it can never silently disappear again. _(operationalizes `k4`)_

**Local constraints:**

- `lc1` (invariant) Closing the gap is wiring an EXISTING content-gate rule into the synthesize prompts wherever the UX-mock slot is already admitted; no schema change and no new companion type — the UX-mock slot, renderer, and review dimension already exist. [[c1]]

### 6.2 E20260929e2c6705f:S002 — Record a build-ledger entry (change-log + feedback) for every completed build

**User value:** `size: M`

As someone auditing what a build changed, I can rely on a build-ledger record with the changed-file set and any reviewer feedback for every completed story build, regardless of which build path was used — not only builds that went through the dedicated validate step.

**Extends:** [[c2]]

**Acceptance criteria:**

- **ac1:** Given a story build has produced changes and is being completed, when the build is completed/approved, then a build-ledger record is written capturing the changed-file set and any reviewer feedback, even when the build did not run through the dedicated validate step. _(operationalizes `lc2`)_
- **ac2:** Given a build that DID run through the dedicated validate step (which already writes a record), when it is also completed on the completion path, then exactly one build-ledger record exists for that story build — no duplicate and no conflicting record. _(operationalizes `k3`)_
- **ac3:** Given a completed build whose changed set cannot be derived, when the record is written, then the record is still created with an empty change-log rather than failing the completion. _(operationalizes `lc2`)_

**Local constraints:**

- `lc2` (invariant) The build-record writer and the change-log collector already exist and are proven on the validate path; this Story invokes them at the completion/approve path, reusing them unchanged rather than reimplementing provenance. [[c2]]

### 6.3 E20260929e2c6705f:S003 — Attach sequence and component-dependency diagrams to design docs

**User value:** `size: L`

As a reviewer of a design document, I can see a sequence diagram (behaviour) and a component-dependency diagram (structure) embedded in the document when they aid understanding, instead of having to run a separate manual generator, so the design is checkable at a glance.

**Extends:** [[c3]]

**Acceptance criteria:**

- **ac1:** Given a design document (HLD or LLD) whose behaviour or component structure would materially aid understanding, when the author composes the document, then the author can author a sequence diagram and/or a component-dependency diagram companion under the same content-gate discipline as the existing data-model and UX companions. _(operationalizes `k2`, `lc3`)_
- **ac2:** Given a design document that authors a sequence or component diagram definition, when its companion is finalized, then a rendered sequence / component-dependency diagram companion is produced and linked from the document. _(operationalizes `lc3`)_
- **ac3:** Given a design document that authors NO diagram definition, when it is composed and finalized, then no diagram companion is produced and the document is unchanged from today. _(operationalizes `k1`, `k2`)_
- **ac4:** Given the new diagram companion types, when they are added, then they follow the established companion pattern (a definition, a content-gate, a renderer, and the diagram/review wiring) without reworking the existing data-model or UX companions. _(operationalizes `lc3`)_

**Local constraints:**

- `lc3` (contract) The new sequence + component diagram companions EXTEND the established companion pattern (definition + content-gate + renderer + review/diagram wiring) that the data-model and UX companions already use; they consume the existing graph-derived diagram sources rather than inventing a new diagram engine. [[c3]]

## 7. References

- **[[c1]]** `analyze-bundle` `(A) UX content-gate dead-code bundle — UX_DEFINITION_PROPERTY_SCHEMA wired at orchestrator.ts:1467 (HLD) / :1863 (LLD); UX_CONTENT_GATE_RULE (ux-schema.ts:39) has zero source usages while ER_CONTENT_GATE_RULE is injected at orchestrator.ts:1424/:1801 + design-story/index.ts:297 + design-epic/index.ts:268; the 'ux' review dimension (code-review/dimensions/ux/index.ts) keys on body.uxDefinition.`
- **[[c2]]** `analyze-bundle` `(B) BUILD-record provenance bundle — persistBuildRecord (runners/build/standalone-record.ts) + collectBuildChangeLog (runners/build/changed-files.ts, from git_diff) + FeedbackRecord (artifacts/provenance/types.ts) invoked only from mcp/build-step/phases/validate.ts:99-103; controller-side builds skip validate so no BUILD record is written.`
- **[[c3]]** `analyze-bundle` `(C) diagram-companion gap bundle — companion/ has only er.ts + ux.ts (+ render.ts/assess.ts/metamodel.ts); no sequence/component companion; call-sequence + component-dependency exist only as separate insrc_docgen docTypes, never authored as HLD/LLD companions.`
- **[[c4]]** `prior-artifact` `The shipped artifact-docs-readability epic (companion subsystem: er/ux content-gates + code-review dimensions, bbbbf7a) and the provenance/feedback epic (BUILD change-log + attributed feedback, fcca379) — both COMPLETE; this epic consumes and completes their wiring.`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — define (define)

**0 HIGH · 0 MED · 8 LOW** · model `client` · reviewed 2026-09-29T15:36:18.591Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| c1 | citation | LOW | auto | UX_CONTENT_GATE_RULE is defined in src/workflow/artifacts/companion/ux-schema.ts (around line 39). | READ confirmed src/workflow/artifacts/companion/ux-schema.ts:39 = `export const UX_CONTENT_GATE_RULE =`. Citation resolves verbatim. | Confirmed — no change needed. |
| c1 | inventory | LOW | auto | UX_CONTENT_GATE_RULE has ZERO non-test source usages: it is exported/defined but never imported or injected into any synthesize prompt builder. | grep UX_CONTENT_GATE_RULE = 7 matches: the sole src/ hit is the DEFINITION site ux-schema.ts:39; the other six are docs (this DEF + the S004 LLD/PLAN of the prior epic). No import or injection of UX_CONTENT_GATE_RULE anywhere in non-test source. The zero-source-usage (dead-gate) premise holds. | Confirmed — dead-code premise is accurate; this is the S1 wiring target. |
| c1 | inventory | LOW | auto | ER_CONTENT_GATE_RULE (the ER twin of UX_CONTENT_GATE_RULE) IS injected into the synthesize prompt builders in orchestrator.ts, design-story/index.ts, and design-epic/index.ts. | grep ER_CONTENT_GATE_RULE confirms injection at orchestrator.ts:1424 + :1801, design-epic/index.ts:268, design-story/index.ts:297 (plus the er-schema.ts:71 definition + three imports). The ER twin IS wired exactly as cited. | Confirmed — the ER-parallel wiring sites named in c1 are accurate. |
| c1 | citation | LOW | auto | The 'ux' code-review dimension lives at src/workflow/code-review/dimensions/ux/index.ts and keys on the body carrying a uxDefinition. | src/workflow/code-review/dimensions/ux/index.ts exists; judgeUx defined at :94, wired into runner.ts:124; READ at :72 = "includes 'ux', OR the body carries a uxDefinition, OR a ux-mock companion is..." — the dimension keys on body uxDefinition (or adherence/ux-mock) exactly as cited. | Confirmed — no change needed. |
| c1 | semantic | LOW | auto | UX_DEFINITION_PROPERTY_SCHEMA is referenced in orchestrator.ts to admit a uxDefinition slot in the HLD and LLD synthesize body schemas. | grep UX_DEFINITION_PROPERTY_SCHEMA confirms the slot is admitted in the synth body schemas at orchestrator.ts:1467 (HLD) + :1863 (LLD), imported at :122; defined at ux-schema.ts:24. The schema-admits-but-nothing-prompts framing is exactly right. | Confirmed — no change needed. |
| c2 | citation | LOW | auto | persistBuildRecord is defined in src/workflow/runners/build/standalone-record.ts and collectBuildChangeLog in src/workflow/runners/build/changed-files.ts. | grep confirms persistBuildRecord defined at src/workflow/runners/build/standalone-record.ts:172 and collectBuildChangeLog at src/workflow/runners/build/changed-files.ts:67. Both citations resolve. | Confirmed — no change needed. |
| c2 | inventory | LOW | auto | persistBuildRecord is invoked only from the build-step validate phase (src/mcp/build-step/phases/validate.ts); no other production call site invokes it. | grep `persistBuildRecord\\(` = the only production invocation is src/mcp/build-step/phases/validate.ts:102 (standalone-record.ts:195 is the module's own internal delegate; all other hits are tests/docs). collectBuildChangeLog is likewise only called from validate.ts:101. The 'only invoked from validate' premise holds — controller-side builds that skip validate write no record. | Confirmed — the missing completion-path invocation is the S2 target. |
| c3 | inventory | LOW | auto | The companion directory src/workflow/artifacts/companion/ contains er and ux companion renderers but no sequence or component-dependency companion renderer. | grep `sequenceDefinition\|componentDefinition\|componentDependencyDefinition` = 0 matches across the tree. No sequence or component-dependency companion definition exists; companion/ carries only er + ux. The net-new S3 gap is confirmed. | Confirmed — no such companion exists; S3 is genuinely net-new. |
