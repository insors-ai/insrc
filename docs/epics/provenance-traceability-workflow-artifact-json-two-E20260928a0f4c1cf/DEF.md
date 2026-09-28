<!-- insrc:artifact DEF-a0f4c1cfe262a497 -->

# Epic: The workflow's artifacts durably record what each stage PRODUCED — the framing, the design, the plan, the built change — but they do not record the human judgment that surrounds those outputs.

**Flavor:** enhancement

## Problem

The workflow's artifacts durably record what each stage PRODUCED — the framing, the design, the plan, the built change — but they do not record the human judgment that surrounds those outputs. When a user or an audience reviewer comments on, suggests a change to, or gives feedback about a generated document, that feedback lives in a chat log or a reviewer's memory rather than attached to the artifact it is about; there is no durable, attributed record of who said what, about which part of which version of which artifact, and when. As a result a document's evolution cannot be traced against the feedback that shaped it, and repeated or unresolved feedback is invisible on the ledger. Separately, when a build changes the codebase there is no structured record IN the build artifact of what actually changed — which files, which line ranges, at what version and time — so the build's effect on the code, and any code-related feedback on that build, are not traceable from the build record itself. The ledger therefore captures outputs but omits the attributed feedback and change provenance needed to understand why an artifact looks the way it does and what a build actually did.

## Non-goals

- **Wiring live capture of feedback from the review/IDE surfaces — automatically recording in-session user comments into the artifact.** — The stakeholder scoped this Epic to the structured records + an append API now, deferring the capture-into-review-surfaces wiring to a later story (a distinct process/UI concern).
- **Introducing a new, parallel provenance/attribution model.** — The artifact meta already carries an attribution model; the new feedback/change attribution must align with it, not duplicate it, to keep one provenance vocabulary.
- **Migrating or back-filling feedback/change records onto artifacts already written to disk.** — The change is forward-only and additive; existing artifacts stay valid without the new records (no rewrite).
- **A user interface for browsing, threading, or resolving feedback.** — This Epic ships the structured record + the append API; presentation/resolution UX is out of scope.

## Assumptions

- `high` Every artifact type's body can carry an additive, optional feedback record absent-safely, the same way prior additive body fields were introduced. [[c1]]
- `high` The existing artifact attribution model can be aligned with (or minimally extended for) the new {file, version, timestamp, segment/lines, author} entry shape without a parallel model. [[c3]]
- `med` The build stage can record the code changes it made (files + line ranges + version + time) from the build's own change information. [[c2]]
- `med` An append operation for feedback entries fits the existing daemon tool/IPC surface pattern. [[c2]]

## Constraints

| ID | Type | Text | Source |
| :--- | :--- | :--- | :--- |
| `k1` | invariant | The feedback and change-log records are STRUCTURED DATA in the artifact JSON (the single source of truth); the rendered document is generated from them, never authored in prose alone. | [[c4]] |
| `k2` | stakeholder | Every feedback entry and every change-log entry carries attribution: file, version, timestamp, segment/lines, and author. | [[c4]] |
| `k3` | stakeholder | The feedback record spans EVERY artifact type; on the document artifacts (DEF/HLD/LLD/PLAN) it captures document/audience feedback anchored to the reviewed document, and on the BUILD artifact it captures CODE-related feedback anchored to source files/lines. | [[c4]] |
| `k4` | stakeholder | Ship the structured records + an append API in this Epic; wiring live capture into the review/IDE surfaces is explicitly deferred (a non-goal here). | [[c4]] |
| `k5` | invariant | Forward-only and additive: the new records are optional + absent-safe, existing on-disk artifacts stay valid, and nothing is migrated. | [[c1]] |
| `k6` | convention | Reuse/align with the existing artifact attribution model rather than introducing a parallel provenance model. | [[c3]] |
| `k7` | stakeholder | The change-log is BUILD-specific and records the build's actual code changes ({file, version, timestamp, segment/lines}). | [[c4]] |

## Stories

### E20260928a0f4c1cf:S001 — Capture attributed audience feedback on generated documents

**User value:** `size: M`

When a user or an audience reviewer comments on, suggests a change to, or gives feedback about a generated document (DEF/HLD/LLD/PLAN), the workflow records that feedback as a structured, attributed entry on the artifact — who said it, about which section/line-range of which version of which document, and when — renders it in the document from that structured record, and lets a user append such an entry through a provided API. Feedback survives beyond chat, and a document's evolution can be traced against the feedback that shaped it.

**Extends:** [[c1]] [[c3]]

**Acceptance criteria:**

- **ac1:** Given a generated document artifact (DEF/HLD/LLD/PLAN), when a feedback entry is recorded on it, then the artifact JSON carries a structured feedback entry attributed with file, version, segment/lines, author, and timestamp, and the rendered document shows that feedback. _(operationalizes `k1`, `k2`, `k3`)_
- **ac2:** Given a document artifact carrying feedback entries, when the document is rendered, then the feedback section is generated from the structured record (never authored in prose alone), and an artifact with no feedback renders exactly as before. _(operationalizes `k1`, `k5`)_
- **ac3:** Given a user wants to add feedback to an artifact, when they invoke the provided append API with a feedback entry for that artifact, then the entry is appended to that artifact's feedback record with its attribution and nothing already recorded is lost. _(operationalizes `k4`, `lc1`)_
- **ac4:** Given an existing artifact written before the feedback record existed, when it is read or re-rendered, then it stays valid and renders unchanged (forward-only, absent-safe). _(operationalizes `k5`)_
- **ac5:** Given a feedback entry's attribution, when the entry is created, then its attribution aligns with the existing artifact attribution model rather than a parallel provenance model. _(operationalizes `k6`)_

**Local constraints:**

- `lc1` (invariant) Feedback entries are append-only — a durable audit trail: an entry is added, never silently edited or removed, so the record of who-said-what-when stays trustworthy. [[c4]]

### E20260928a0f4c1cf:S002 — Record build changes and code feedback on the build artifact

**User value:** `size: M`

When a build changes the codebase, the build artifact records what actually changed — each change attributed to a source file, version, line-range, and time — and captures code-related feedback on the build anchored to the source. A reviewer or auditor can see the build's effect on the code, and any feedback about that code, directly from the build record instead of reconstructing it from git or chat.

**Depends on:** `s1`

**Extends:** [[c2]]

**Acceptance criteria:**

- **ac1:** Given a build that changed code, when the build artifact is produced, then the build JSON records a change-log with one attributed entry per change (file, version, segment/lines, timestamp) reflecting the actual changed set. _(operationalizes `k7`, `k2`, `lc1`)_
- **ac2:** Given the build artifact, when code-related feedback is recorded on it, then it is captured as a feedback entry anchored to the source file/line-range (reusing the shared feedback record and append API from s1), attributed and append-only. _(operationalizes `k3`, `k2`)_
- **ac3:** Given a build artifact carrying a change-log and/or code feedback, when the build document is rendered, then both are generated from the structured build JSON, and a build artifact without them renders as before. _(operationalizes `k1`, `k5`)_
- **ac4:** Given an existing build artifact written before these records existed, when it is read or re-rendered, then it stays valid and renders unchanged (forward-only). _(operationalizes `k5`)_

**Local constraints:**

- `lc1` (invariant) The build change-log reflects the build's ACTUAL code changes (grounded in the real changed set), not a hand-authored summary, so the record is a faithful trace of what the build did. [[c4]]

## Citations

- **[[c1]]** `analyze-bundle` `s1 bundle — artifact bodies + type guards + renderers (define/hld/lld/plan.ts) + synthesizer body schemas (orchestrator.ts) + format/bindings.ts; additive absent-safe body-field pattern (S002 summary / S003 companions)` — "A shared optional feedback field on all four doc bodies + the BUILD body, each guard + synth schema tolerating it, rendered as an additive section."
- **[[c2]]** `analyze-bundle` `s1 bundle — BUILD artifact shape + producer: src/mcp/build-step/{types,render,handler}.ts + src/workflow/runners/build/{schemas,standalone-record}.ts + gates.ts` — "The BUILD change-log + code-feedback attach to the BUILD body + are populated/rendered by the build-step."
- **[[c3]]** `analyze-bundle` `s1 bundle — existing attribution model src/workflow/types.ts:290 ArtifactMetaBase.attribution / ArtifactModelAttribution + src/workflow/attribution.ts` — "Align the new {file,version,timestamp,segment/lines,author} contract with the existing attribution model rather than duplicating it."
- **[[c4]]** `stakeholder` `User spec + clarifications (2026-09-28): feedback record on the core body of every artifact type anchored to the reviewed artifact; BUILD captures code-related feedback; append API now + capture-into-review-surfaces deferred; BUILD change-log with {file,version,timestamp,segment/lines}` — "There should be a feedback section in the core JSON structure that captures the user/audience feedback (along with attribution: file, version, timestamp, segment/lines) ... The build JSON should recor"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — define (define)

**0 HIGH · 0 MED · 9 LOW** · model `client` · reviewed 2026-09-28T09:27:35.640Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| c3 | citation | LOW | auto | src/workflow/types.ts defines an artifact attribution model — ArtifactMetaBase.attribution and an ArtifactModelAttribution type — that the new feedback/change attribution is to align with. | Confirmed: src/workflow/types.ts:295 declares `interface ArtifactModelAttribution` and :331 `ArtifactMetaBase.attribution?: ArtifactModelAttribution`. The DEF's :290 anchor lands on the aggregate's doc-comment header (exact interface at 295). Attribution model exists as cited. | None — citation resolves; DEF aligns with the real attribution model. |
| c3 | citation | LOW | auto | src/workflow/attribution.ts exists as the attribution helper module the new contract reuses. | Confirmed: src/workflow/attribution.ts exists and exports singleModelAttribution / attributionOf / modelSummary over ArtifactModelAttribution + ArtifactMetaBase. | None — the attribution helper module exists as cited. |
| c1 | inventory | LOW | auto | The four document-artifact renderers exist as src/workflow/artifacts/{define,hld,lld,plan}.ts, the surfaces the shared feedback field is rendered from. | Confirmed: src/workflow/artifacts/{define,hld,lld,plan}.ts all exist (direct file check OK for all four). | None — all four document renderers exist. |
| c1 | citation | LOW | auto | src/workflow/artifacts/format/bindings.ts exists and carries the additive body-slot binding pattern (S002 summary / S003 companions) the feedback section rides on. | Confirmed: src/workflow/artifacts/format/bindings.ts exists and exports companionBodyLines (the S002/S003 additive body-slot binding), referenced by companion tests. | None — the additive-slot binding surface exists. |
| c2 | inventory | LOW | auto | The BUILD-step producer files src/mcp/build-step/{types,render,handler}.ts exist — where the change-log + code-feedback attach to the BUILD body and are rendered. | Confirmed: src/mcp/build-step/{types,render,handler}.ts all exist (direct file check OK). | None — the BUILD-step producer files exist. |
| c2 | inventory | LOW | auto | The build runner files src/workflow/runners/build/{schemas,standalone-record}.ts exist — the BUILD artifact shape + standalone record producer. | Confirmed: src/workflow/runners/build/{schemas,standalone-record}.ts both exist; standalone-record.ts renders the BUILD record (renderPlanBuildRecordMd). | None — the build runner files exist. |
| c2 | citation | LOW | auto | src/workflow/gates.ts exists — the gate surface referenced for the BUILD change-log grounding. | Confirmed: src/workflow/gates.ts exists (direct file check OK). | None — the gate surface exists. |
| c1 | semantic | LOW | auto | An additive, absent-safe optional body field precedent already exists in the artifact synthesizer body schemas (S002 `summary`, S003 `erDefinition`), proving a new optional feedback field can be added the same way. | Confirmed: the additive absent-safe optional body-field precedent is live — design-epic/schemas.ts includes optional `summary` (S002) and `erDefinition` (S003, via ER_DEFINITION_PROPERTY_SCHEMA); orchestrator.ts authors erDefinition content-gated. A new optional feedback field follows the same proven pattern. | None — the additive-field pattern is real and precedented. |
| s1/s2 | ordering | LOW | auto | Story s2 (build change-log + code feedback) depends on s1 (shared feedback record + append API) because s2 reuses the shared feedback record and append API that s1 owns. | Internally consistent: s2 declares dependsOn s1 and its ac2 explicitly reuses the shared feedback record + append API that s1 owns; the ordering is sound. | None — dependency ordering is self-consistent. |
