<!-- insrc:artifact DEF-9b72686c1746af2b -->

# Epic: harden-insrc-artifact-creation-flows-two

## Summary

**Flavor:** enhancement

This Epic hardens the two ways the insrc workflow's generated artifacts quietly fall short of being self-describing and reviewable. Design documents will stop referencing diagrams and UX mocks that silently failed to render: when an authored visual definition does not conform to its schema, the specific errors are reported back and the author repairs it, instead of the picture being dropped without a trace. And every build — including small standalone fixes — will leave a complete BUILD record on the ledger that reads like a changelog: a plain-language summary of what changed plus any feedback raised during the build. The outcome is artifacts a reviewer can trust to be complete.

## Contents

1. [Problem](#1-problem)
2. [Functional requirements](#2-functional-requirements)
3. [Non-goals](#3-non-goals)
4. [Assumptions](#4-assumptions)
5. [Constraints](#5-constraints)
6. [Stories](#6-stories)
7. [References](#7-references)

## 1. Problem

The insrc workflow produces design and build artifacts that are meant to be self-describing and reviewable, but two silent failure modes erode that trust. First, when a design artifact's authored companion definition (a diagram or a UX mock) does not conform to its strict schema, the picture is discarded with no signal reaching its author: the reader is left with a document that references a visual which never rendered, and the author never learns the definition was rejected, so the same malformed shape recurs on the next attempt. Second, a small standalone (bugfix-routed) story can pass its build and code review yet leave no BUILD ledger record at all, so the story cannot be formally completed on the ledger and its change trace is missing entirely; and even where a BUILD record is written it records only a file-level list of what changed — not a human-readable summary of the change, and not any feedback exchanged during the build — so a later reader cannot tell from the record what was done or why.

## 2. Functional requirements

- **E202609309b72686c:FR001** — When an authored companion definition fails its strict schema, the workflow returns the specific validation errors to the author and re-requests the synthesize turn so the definition can be repaired, rather than dropping the companion. _(Stops documents from silently referencing visuals that never rendered and gives the author a feedback loop to fix the definition.)_
- **E202609309b72686c:FR002** — Every story built through the framework, including a small standalone (bugfix-routed) story, produces a BUILD ledger record that the completion gate can approve. _(A story cannot be formally completed on the ledger without a BUILD record; today small standalone stories get none.)_
- **E202609309b72686c:FR003** — The BUILD record carries a human-readable summary of the change alongside the existing file-level change list. _(A reader must be able to tell what was done and why from the record alone, not just which files changed.)_
- **E202609309b72686c:FR004** — Feedback exchanged during the build cycle is captured on the BUILD record. _(Preserves the build-time dialogue as durable provenance instead of losing it once the session ends.)_

**s1:**

- **E202609309b72686c:S001:FR001** — A companion definition that fails its strict schema causes the specific validation errors to be returned to the author and the synthesize turn to be retried, for every companion kind. _(Turns a silent drop into an actionable repair loop so documents stop referencing visuals that never rendered.)_

**s2:**

- **E202609309b72686c:S002:FR001** — A small standalone story produces a BUILD ledger record on validation, carrying the file-level change list, so the completion gate can approve it. _(Closes the regression where a small standalone story completes build + review but leaves no record to approve.)_

**s3:**

- **E202609309b72686c:S003:FR001** — The BUILD record carries a human-readable change summary alongside the file-level change list. _(A reader must understand what was done and why from the record, not just which files changed.)_
- **E202609309b72686c:S003:FR002** — Feedback exchanged during the build cycle is captured on the BUILD record. _(Preserves the build-time dialogue as durable provenance.)_

## 3. Non-goals

- **Changing the daemon-driven async run path (insrc_workflow_run).** — That path is not the mandated driver (the framework drives workflows turn-by-turn via insrc_workflow_step); hardening it is out of scope.
- **Adding new companion TYPES or a new diagram/render engine.** — The render + markdown-link machinery already exists and works; this Epic hardens validation feedback and the build record, not the companion catalog.
- **Machine auto-rewriting a malformed companion definition.** — The authored definition is the source of truth; the author (the reasoning model) repairs it on retry. A silent auto-fix would mask real modeling errors and violate the source-of-truth invariant.
- **Back-filling BUILD records for already-completed historical stories.** — Scope is the go-forward flow; retroactive ledger rewrites are a separate concern.

## 4. Assumptions

- `high` The companion author-gates, strict validators, and finalize renderers already exist and function; the gap is the feedback loop on validation failure, not the rendering. [[c2]]
- `high` The BUILD record structure already carries changeLog and feedback fields and an upsert writer; the gap is that a standalone Small story never reaches the writer, plus the absent narrative summary and in-cycle feedback capture. [[c1]]
- `high` The client-driven insrc_workflow_step synthesize path is the mandated driver and routes through the same finalizeArtifact that renders companions. [[c6]]
- `high` A standalone Small story reaches neither build-record writer today (implement persists only for trivial; validate rejects the standalone target before persisting). [[c3]]

## 5. Constraints

| ID | Type | Text | Source |
| :--- | :--- | :--- | :--- |
| `k1` | stakeholder | A companion-definition schema-validation failure MUST be surfaced to the author with its specific errors and the synthesize turn re-requested (retry), never silently swallowed. | [[c7]] |
| `k2` | invariant | The authored companion definition remains the SOURCE OF TRUTH and is rendered deterministically by the daemon; the framework must not machine-rewrite the author's definition. | [[c2]] |
| `k3` | contract | Every completed story — including a small standalone one — must have a BUILD ledger record for the completion gate to approve. | [[c1]] |
| `k4` | convention | Additions to the BUILD record must be additive + omit-slot (byte-identity preserved for a record that carries no summary/feedback), so existing records do not churn. | [[c5]] |
| `k5` | invariant | A BUILD-record persist failure must never convert a real build/verdict into an error (fail-open, as today). | [[c1]] |

## 6. Stories

### 6.1 E202609309b72686c:S001 — Surface companion-definition validation errors and retry the synth turn instead of dropping the companion

**User value:** `size: M`

When a design document's authored diagram or UX mock does not conform to its schema, the author is told exactly what is wrong and asked to fix it, so the document ends up with the visual it references instead of silently missing one.

**Extends:** [[c2]]

**Acceptance criteria:**

- **ac1:** Given an authored companion definition (a UX mock or a diagram) that violates its strict schema, when the synthesize turn for that design artifact is submitted, then the workflow returns the specific validation errors to the author and re-requests the synthesize turn, rather than accepting the artifact with the companion silently dropped. _(operationalizes `k1`)_
- **ac2:** Given an author who corrects the flagged definition on the retry, when the corrected artifact is re-submitted and the definition now conforms, then the companion renders and is linked in the artifact's markdown as normal. _(operationalizes `k1`)_
- **ac3:** Given an authored companion definition that already conforms to its strict schema, when the synthesize turn is submitted, then the artifact is accepted and the companion renders with no extra prompting or retry (no regression to the valid path). _(operationalizes `k1`, `k2`)_
- **ac4:** Given a companion definition that fails validation, when the errors are surfaced for repair, then the framework does not machine-rewrite the author's definition — the author remains the source of truth and repairs it themselves. _(operationalizes `k2`)_

**Local constraints:**

- `lc1` (invariant) The surface-and-retry behaviour applies uniformly to every authored companion kind (UX mock, ER, sequence, component-dependency), not only the UX mock. [[c2]]

### 6.2 E202609309b72686c:S002 — Persist a BUILD ledger record for a small standalone story so it can be completed

**User value:** `size: S`

A small standalone (bugfix-routed) story that has been built and reviewed leaves a BUILD record on the ledger, so it can be formally completed and its change trace is preserved — today it leaves none.

**Extends:** [[c1]]

**Acceptance criteria:**

- **ac1:** Given a small standalone story whose build has been implemented and validated, when the build's validation completes, then a BUILD ledger record for that story is persisted (keyed to its story identity). _(operationalizes `k3`)_
- **ac2:** Given a persisted BUILD record for a small standalone story, when the completion gate runs for that story, then the gate finds the pending BUILD record and can approve it to complete the story. _(operationalizes `k3`)_
- **ac3:** Given the BUILD record for the standalone story, when it is written, then it carries the file-level change list of the build's changed set (the same change trace a plan-driven record gets). _(operationalizes `k3`)_
- **ac4:** Given a failure while persisting the BUILD record, when the build's validation runs, then the build verdict is still returned and the build is not turned into an error (fail-open). _(operationalizes `k5`)_

### 6.3 E202609309b72686c:S003 — Enrich the BUILD record with a change summary and build-cycle feedback

**User value:** `size: M`

The BUILD record reads like a changelog entry: a plain-language summary of what changed plus any feedback raised during the build, so a later reader understands the change from the record alone.

**Depends on:** `s2`

**Extends:** [[c1]] [[c5]]

**Acceptance criteria:**

- **ac1:** Given a completed build with a change set, when its BUILD record is written, then the record carries a human-readable summary of the change alongside the existing file-level change list. _(operationalizes `k3`)_
- **ac2:** Given feedback raised during the build cycle, when the build completes and its record is written, then that feedback is captured on the BUILD record. _(operationalizes `k3`)_
- **ac3:** Given a build that produced neither a summary nor any feedback, when its record is written, then the record is byte-identical to today's output (the new sections are omitted, not empty). _(operationalizes `k4`)_

**Local constraints:**

- `lc1` (convention) The summary and feedback are additive omit-slot sections of the BUILD record — a record without them renders exactly as before. [[c5]]

## 7. References

- **[[c1]]** `code` `src/mcp/build-step/phases/validate.ts:64+102, implement.ts:133, src/workflow/runners/build/standalone-record.ts` — "validate calls resolveTaskRef (no standalone branch) and bails before persistBuildRecord:102; implement persists only for trivial standalone; BuildRecord.body already has changeLog + feedback but no n"
- **[[c2]]** `code` `src/workflow/orchestrator.ts:1548 (renderUxCompanionForBody), :1587 (renderDiagramCompanionsForBody), :1557; src/workflow/artifacts/companion/ux-schema.ts:24` — "The emit-schema keeps body.items loose ({type:object}); the strict validation runs at finalize and a HIGH finding is swallowed with a warn, dropping the companion and leaving the definition in-body."
- **[[c3]]** `step-output` `s1 scope.assess grounding (analyze + reproduction this session)` — "A standalone Small story reaches neither build-record writer; a reran validateUxDefinition on a hand-authored card returned multiple HIGH violations and the companion was correctly dropped."
- **[[c4]]** `prior-artifact` `Epic complete-generated-artifact-companion-wiring-across (e2c6705fd105d4ac)` — "Wired the companion author-gates + render/attach + markdown-link for ER/UX/sequence/component."
- **[[c5]]** `prior-artifact` `Epic provenance-traceability-workflow-artifact-json-two (a0f4c1cfe262a497)` — "Added the BUILD change-log from git_diff + the append-only feedback field, each an omit-slot section preserving byte-identity."
- **[[c6]]** `code` `src/mcp/workflow-step/phases/synthesize.ts:46 (finalizeArtifact)` — "The client-driven insrc_workflow_step synthesize phase calls the same finalizeArtifact that renders + attaches companions."
- **[[c7]]** `stakeholder` `User directive (2026-09-30): 'schema validation errors should be surfaced and retried.'` — "schema validation errors should be surfaced and retried."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — define (define)

**0 HIGH · 0 MED · 9 LOW** · model `client` · reviewed 2026-09-30T06:19:13.562Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| c1/S002 | citation | LOW | auto | build-step validate.ts resolves its target via resolveTaskRef (the plan-driven resolver with no standalone branch) and returns early on failure, before reaching persistBuildRecord. | Confirmed: validate.ts:64 `const resolved = resolveTaskRef(repoPath, input.target, input.epicHash)` (the plan-driven resolver) and :102 `persistBuildRecord(...)` sits after it; on an unresolved target validate returns before reaching :102. | Accept — citation resolves; no change needed. |
| c1/S002 | citation | LOW | auto | build-step implement.ts persists a standalone BUILD record only on the trivial (no-LLD) branch, not for a Small standalone story. | Confirmed: implement.ts:133 `persistStandaloneBuildRecord(repoPath, {...})` sits inside the else (trivial, !producesLld) branch; a Small standalone (producesLld=true) does not persist here. | Accept — citation resolves; no change needed. |
| c1/S003 | semantic | LOW | auto | The BuildRecord body type already carries changeLog and feedback fields but has no narrative summary field. | Confirmed by direct read of standalone-record.ts body (lines 61-75): fields are focus/producesLld/tasks/commit/changeLog/feedback — changeLog + feedback present, NO summary field. (The repo-wide `summary` grep hits are unrelated contexts.) | Accept — semantic claim holds; no change needed. |
| c2/S001 | citation | LOW | auto | renderUxCompanionForBody validates the authored uxDefinition and, on a HIGH finding, swallows it (returns undefined, logs a warn) instead of surfacing the error. | Confirmed: orchestrator.ts:1548 renderUxCompanionForBody, :1557 `validateUxDefinition(uxDef, body.functionalDefinition)`; the 'leaving it in-body without a companion' warn confirms the HIGH-finding swallow. | Accept — citation resolves; no change needed. |
| c2/S001 | citation | LOW | auto | renderDiagramCompanionsForBody applies the same validate-then-swallow behaviour for the sequence + component-dependency companions. | Confirmed: orchestrator.ts:1587 renderDiagramCompanionsForBody with validateSequenceDefinition + validateComponentDependencyDefinition — same validate-then-swallow for sequence/component. | Accept — citation resolves; no change needed. |
| c2/S001 | semantic | LOW | auto | The synth emit-schema UX_DEFINITION_PROPERTY_SCHEMA keeps body.items loose ({type:'object'}), so a strict Adaptive Cards shape is not enforced at emit time. | Confirmed: ux-schema.ts:33 `items: { type: 'object' }` inside UX_DEFINITION_PROPERTY_SCHEMA — the emit-schema is loose, strict shape not enforced at emit. | Accept — semantic claim holds; no change needed. |
| c6/S001 | citation | LOW | auto | The client-driven insrc_workflow_step synthesize phase calls finalizeArtifact (the same finalize that renders + attaches companions). | Confirmed: synthesize.ts:46 `const result = await finalizeArtifact(...)` — the client-driven synthesize phase routes through the same finalize. | Accept — citation resolves; no change needed. |
| lc1/S001 | closed-union | LOW | auto | The authored companion definition kinds finalize renders are exactly four: ER, UX, sequence, and component-dependency (the set the surface-and-retry behaviour must cover). | Confirmed: all four renderers exist — renderErCompanionForBody, renderUxCompanionForBody, renderSequenceCompanion, renderComponentCompanion — so the authored companion kinds are exactly ER/UX/sequence/component. | Accept — closed union holds; no change needed. |
| c4+c5 | cross-artifact | LOW | auto | The two prior epics this Epic builds on exist as DEF artifacts: companion-wiring e2c6705fd105d4ac and provenance/feedback a0f4c1cfe262a497. | Confirmed: both prior-epic hashes resolve in the tree (e2c6705fd105d4ac 25 hits, a0f4c1cfe262a497 11 hits) — the cross-artifact references are real. | Accept — cross-artifact refs resolve; no change needed. |
