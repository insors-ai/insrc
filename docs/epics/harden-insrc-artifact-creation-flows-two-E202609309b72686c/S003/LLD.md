<!-- insrc:artifact LLD-9b72686c1746af2b-s3 -->

# LLD: E202609309b72686c:S003

## Summary

**Epic:** `harden-insrc-artifact-creation-flows-two`
**HLD base run:** `wf-1790749192360-iyxm4i`
**HLD effective hash:** `a96cc61752b7...`

S003 makes the BUILD ledger record read like a changelog entry. It adds an additive, optional narrative `summary` to the BUILD record body — a plain-language 'what changed and why' rendered as a new `## Summary` omit-slot section beside the existing file-level `## Changes` list — and captures build-cycle feedback onto the record's existing `body.feedback` by reusing the proven append-only appendFeedback writer during the build. Both additions are omit-slot: a record that carries neither renders byte-identically to today (k4). It consumes the sc1 BUILD-record contract established by S002 without changing its writer's merge semantics.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Interaction with shared contracts](#4-interaction-with-shared-contracts)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Migration](#7-migration)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)

## 1. HLD context

> See **HLD-9b72686c1746af2b** § 2. Framework summary

**Rollout phase:** Phase B — BUILD-record enrichment
**Consumes:** `sc1` (BUILD ledger record contract)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Entirely private to S001: the change to the finalize render helpers so a HIGH companion-validation finding yields a finalize failure instead of a swallowed warn, routed through the existing FinalizeResult -> synthesize retryable-error path.
- `s2`: Private to S002: the build-step validate standalone branch that resolves a Small standalone story's identity without the plan-driven resolveTaskRef, so it reaches the shared BUILD record writer. — owns `sc1`

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `persistBuildRecord`

```typescript
(repoPath: string, rec: BuildRecord) => { md: string; json: string }
```

**Parameters:**
- `rec: BuildRecord` — The BUILD record to upsert; its body now carries the additive optional `summary?: string` narrative (in addition to the existing tasks/changeLog/feedback).

**Returns:** `{ md: string; json: string }` — Unchanged. The writer upserts the record via mergeWithPrior ({...prior.body, ...rec.body}); the new body.summary simply takes the new write like any other body field. The merge semantics are NOT changed (feedback keeps its existing replace-on-write behaviour under this writer; in-cycle feedback accretes via appendFeedback instead).

**Errors:**
- `(none surfaced)` when A persist failure stays fail-open at the caller (k5) exactly as today; persistBuildRecord itself is unchanged in its error behaviour.

**Preconditions:**
- rec.meta.epicHash + rec.meta.storyId are set (unchanged).

**Postconditions:**
- When rec.body.summary is a non-empty string it is written to the record and rendered; when absent the record is byte-identical to today (ac3/k4).
- The writer's mergeWithPrior + the S002-owned resolution are untouched.

### 2.2 `renderPlanBuildRecordMd`

```typescript
(rec: BuildRecord) => string
```

**Parameters:**
- `rec: BuildRecord` — The record to render; a `## Summary` section is emitted when rec.body.summary is a non-empty string.

**Returns:** `string` — The BUILD record markdown. NEW: an omit-slot `## Summary` section (the narrative paragraph) is pushed only when rec.body.summary is a non-empty string, mirroring the existing `## Changes`/`## Feedback` omit-slots; its position is after the header/commit and before/alongside `## Changes` (a reader-first ordering). A record without a summary renders byte-identically to today.

**Errors:**
- `(none)` when Pure string rendering; no error path.

**Preconditions:**
- None beyond a well-formed BuildRecord.

**Postconditions:**
- ac3/k4: with no summary and no feedback the output equals the pre-S003 render byte-for-byte (the headings are omitted, not emitted empty).

### 2.3 `appendFeedback`

```typescript
(req: AppendFeedbackRequest) => AppendFeedbackResult
```

**Parameters:**
- `req: AppendFeedbackRequest` — The artifactPath (the persisted BUILD-<hash>-<storyId>.json) + the feedback entry (author, comment, target, optional kind) to append during the build cycle.

**Returns:** `AppendFeedbackResult` — Unchanged. Appends one FeedbackEntry to body.feedback = [...existing, entry] (append-only, preserving every other key), minting an 8-char id + timestamp. S003 REUSES this existing writer to capture build-cycle feedback onto the BUILD record — no new feedback writer is introduced.

**Errors:**
- `ArtifactFeedbackError` when A missing/empty author or comment, or an artifactPath outside the artifact root (existing behaviour, unchanged).

**Preconditions:**
- The BUILD record json already exists on disk (persistBuildRecord has run).

**Postconditions:**
- The record's body.feedback carries the appended entry; renderPlanBuildRecordMd's existing `## Feedback` omit-slot then renders it (ac2).

## 3. Data model changes

### 3.1 `BuildRecord.body` — field-add

Add `readonly summary?: string | undefined` — an additive, optional top-level narrative change summary. Omit-slot: absent → no `## Summary` section → byte-identical to today (ac3/k4). It is the human-readable 'what changed and why', distinct from the per-file `changeLog`. The existing `feedback?: FeedbackRecord` field is unchanged (S003 only starts populating it in-cycle via appendFeedback). No meta changes; no removal or rename. The HLD sc1 interfaceSketch already lists this field as S003's, so no HLD amendment is required.

```
interface BuildRecord['body'] { /* existing */ ; readonly summary?: string | undefined; }
```

**Call sites:**
- `src/workflow/runners/build/standalone-record.ts:61`
- `src/workflow/runners/build/standalone-record.ts:126`
- `src/workflow/runners/build/standalone-record.ts:147`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | S003 consumes the sc1 BUILD-record contract + its writer (persistBuildRecord) established by S002 and extends the record body with the HLD-sanctioned optional `summary?` field + a `## Summary` omit-slot in renderPlanBuildRecordMd. It does NOT modify the S002-owned mergeWithPrior semantics or the standalone-resolution branch. In-cycle feedback is captured via the pre-existing appendFeedback writer against the persisted BUILD record json, so the feedback slot (already on the body) is filled without touching persistBuildRecord's merge. Byte-identity (k4) + fail-open (k5) are preserved because the writer is unchanged. |

## 5. Error paths

**Error cases**

- **In-cycle feedback capture is attempted before the BUILD record json exists on disk (appendFeedback called before persistBuildRecord).** (recoverable)
  - Detection: appendFeedback resolves the artifactPath and reads the artifact json; a missing/unreadable BUILD-<hash>-<storyId>.json makes the read fail (ArtifactFeedbackError direct / {error} over the IPC).
  - Response: The in-cycle capture is ordered AFTER persistBuildRecord has written the record; if the record is nonetheless absent, the capture caller swallows the error and continues (fail-open, k5) — a feedback-capture failure must never convert a real build verdict into an error. The narrative summary path is unaffected (it is written by persistBuildRecord itself).
  - User impact: That feedback entry is not recorded, but the build verdict + record are unaffected; the reader simply sees no `## Feedback` section for that note.
- **A feedback entry is captured with an empty/whitespace author or comment.** (recoverable)
  - Detection: appendFeedback trims author + comment and throws ArtifactFeedbackError when either is empty (existing, unchanged validation).
  - Response: The in-cycle caller treats it as a no-op (fail-open, k5): the entry is skipped and the build proceeds; no partial/blank feedback entry is written.
  - User impact: The malformed note is dropped; other valid feedback + the record are unaffected.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| rec.body.summary is an empty string (or whitespace-only). | renderPlanBuildRecordMd treats it as absent (the omit-slot check is a non-empty-string test, mirroring changeLogBodyLines/feedbackBodyLines) — no `## Summary` heading is emitted; the output stays byte-identical to a record with no summary (ac3/k4). |
| A re-validated build (upsert) whose prior record carried a summary but the new persist call omits body.summary. | mergeWithPrior computes body = {...prior.body, ...rec.body}; because rec.body has no summary key, the prior summary is PRESERVED (the spread does not delete it) — consistent with how tasks/changeLog survive a re-validate. A summary is only replaced when a new one is supplied. |
| Multiple in-cycle feedback entries captured during one build. | appendFeedback is append-only (body.feedback = [...existing, entry]), so each call accretes; all entries render in order under the single `## Feedback` omit-slot section. |
| A build with a summary but no feedback (or vice-versa). | Only the present section renders (`## Summary` XOR `## Feedback`); the absent one is omitted, not emitted empty. |

**Invariants to preserve**

- persistBuildRecord stays an upsert that preserves the original createdAt + the completion/rejection stamps via mergeWithPrior; adding the optional body.summary does not change the merge (a new body field takes the new write; omitted fields are preserved from the prior). [[c1]]
- A BUILD-record persist OR feedback-capture failure stays fail-open — it never converts a real build verdict into an error (k5). [[c1]]
- A record that carries neither a summary nor feedback renders byte-identically to the pre-S003 output: the new sections are omit-slot (heading pushed only when the binder yields content), never emitted empty (k4). [[c5]]
- The S002-owned parts of sc1 — mergeWithPrior's merge semantics, the standalone-resolution branch, and the persistBuildRecord signature — are consumed unchanged; S003 only adds an optional body field + an omit-slot render section and reuses the existing appendFeedback writer. [[c5]]

## 6. Test strategy

**Test framework:** `node:test (node --test / tsx --test), assert/strict — the repo convention used by src/workflow/**/*.test.ts and src/mcp/build-step/__tests__/*.test.ts`

**Test levels**

- **unit** — Exercise renderPlanBuildRecordMd's new `## Summary` omit-slot and the unchanged `## Feedback`/`## Changes` omit-slots directly over hand-built BuildRecords.
  - Subjects: `renderPlanBuildRecordMd with body.summary set -> a `## Summary` section carrying the narrative is present`, `renderPlanBuildRecordMd with body.summary = '' (empty/whitespace) -> NO `## Summary` section (omit-slot)`, `renderPlanBuildRecordMd with a summary XOR feedback -> only the present section renders`, `renderPlanBuildRecordMd with neither summary nor feedback -> byte-identical to the pre-S003 render (golden string compare)`
  - Fixtures: `A minimal plan-driven BuildRecord (standalone:false, one task) as the golden baseline`, `A frozen pre-S003 expected-md string (or a computed baseline with the summary field stripped)`
- **integration** — Exercise the write+render path: persistBuildRecord carries body.summary, and appendFeedback captures in-cycle feedback onto the persisted BUILD json.
  - Subjects: `persistBuildRecord with body.summary -> the json carries body.summary and the .md renders `## Summary` (ac1)`, `appendFeedback against the persisted BUILD-<hash>-<storyId>.json -> body.feedback accretes the entry and the .md renders `## Feedback` (ac2)`, `persistBuildRecord then a re-validate that omits body.summary -> mergeWithPrior PRESERVES the prior summary (upsert)`, `persistBuildRecord with neither summary nor feedback -> the .md is byte-identical to today (ac3); fail-open on a persist error is unchanged (k5)`
  - Fixtures: `A tmpdir repo + a persisted BUILD record json (reuse the build-step.test.ts persist harness)`, `An AppendFeedbackRequest fixture (author/comment/target) pointed at the BUILD json`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: renderPlanBuildRecordMd with body.summary set renders a `## Summary` section`, `integration: persistBuildRecord with body.summary -> json carries summary + md renders `## Summary`` |
| `ac2` | `integration: appendFeedback against the persisted BUILD json accretes body.feedback and the md renders `## Feedback`` |
| `ac3` | `unit: renderPlanBuildRecordMd with neither summary nor feedback is byte-identical to the pre-S003 golden render`, `integration: persistBuildRecord with neither -> the .md is byte-identical to today` |

## 7. Migration

**State before:** Per the s1 bundles: BuildRecord.body (standalone-record.ts:61-75) has no top-level narrative `summary` field — only focus?/producesLld?/tasks?/commit?/changeLog?/feedback?. renderPlanBuildRecordMd (:126-157) emits `## Tasks validated`, then the omit-slot `## Changes` (:147) and `## Feedback` (:151) sections; there is no `## Summary`. The record's `body.feedback` is populated ONLY out-of-band, post-hoc, via appendFeedback (writer.ts) — the build cycle never fills it. persistBuildRecord is a fail-open upsert (mergeWithPrior at :232) that preserves createdAt + completion stamps.

**State after:** BuildRecord.body carries an additive optional `summary?: string`. renderPlanBuildRecordMd emits a `## Summary` omit-slot section (only when body.summary is a non-empty string), mirroring `## Changes`/`## Feedback`. The build cycle captures in-cycle feedback onto the record's existing `body.feedback` by calling the unchanged append-only appendFeedback writer against the persisted BUILD json. A record with neither a summary nor feedback renders byte-identically to today (k4); persistBuildRecord's merge + fail-open behaviour are unchanged (k5).

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the optional field `readonly summary?: string | undefined` to the BuildRecord body interface (additive; no existing record has it, so all existing records remain valid). — ↩ rollbackable
2. Add a `## Summary` omit-slot section to renderPlanBuildRecordMd: push the heading + the narrative paragraph only when rec.body.summary is a non-empty (trimmed) string, using the same content-gated push pattern as `## Changes`/`## Feedback`. — ↩ rollbackable
3. Wire in-cycle feedback capture: at/after the BUILD record persist on the build path, call the existing appendFeedback writer for any build-cycle feedback against the persisted BUILD json, fail-open (swallow a capture error so it never converts a real build verdict into an error). No change to persistBuildRecord's merge. — ↩ rollbackable
4. Add the unit tests (renderPlanBuildRecordMd omit-slot for summary + the byte-identical golden) and the integration tests (persistBuildRecord with a summary; appendFeedback capture on the persisted BUILD json; the neither-present byte-identity). — ↩ rollbackable

**Backward compat:** The BuildRecord body change is a purely additive optional field, so every existing persisted BUILD record json remains valid and unchanged (no data rewrite). renderPlanBuildRecordMd's output is byte-identical for any record lacking summary + feedback (the new section is omit-slot), so existing records do not churn on re-render (k4). persistBuildRecord's signature + mergeWithPrior + fail-open behaviour and the appendFeedback signature are all unchanged — the sc1 contract owned by S002 is consumed as-is. Ships with a daemon rebuild; no in-flight state depends on the old shape.

## 8. Alternatives considered

### 8.1 a1: Additive body.summary + reuse the existing appendFeedback writer for in-cycle feedback — **CHOSEN**

Add an optional narrative body.summary rendered as a `## Summary` omit-slot; capture build-cycle feedback by calling the existing append-only appendFeedback writer on the BUILD record json — persistBuildRecord's merge is untouched.

Data: add `readonly summary?: string | undefined` to BuildRecord.body (additive, optional). Rendering: renderPlanBuildRecordMd pushes a `## Summary` section only when rec.body.summary is a non-empty string, mirroring `## Changes`/`## Feedback`. Summary source: the caller threads the narrative in as body.summary. Feedback: the record's body.feedback is populated in-cycle by REUSING the existing appendFeedback append-only writer against the persisted BUILD json — no change to persistBuildRecord's body merge.

### 8.2 a2: Unified persistBuildRecord: accept summary + feedback, with append-merge for feedback

Thread both the narrative summary and any feedback entries through persistBuildRecord, and extend mergeWithPrior to UNION feedback by id (mirroring the tasks merge) so a single writer owns the whole enriched record.

Add body.summary + accept body.feedback on the record; mergeWithPrior gains a feedback union-by-id so re-validates accrete feedback; summary takes the new write. renderPlanBuildRecordMd adds the `## Summary` omit-slot. A single persistBuildRecord call carries tasks + changeLog + summary + feedback.

**Rejected because:** Partial on sc1: it modifies the S002-owned writer's mergeWithPrior semantics (feedback union) and duplicates appendFeedback's append logic, adding shared-writer regression surface (M-cost) for no acceptance benefit over a1.

### 8.3 a3: Auto-derived summary + appendFeedback for feedback

Derive the narrative summary deterministically at persist time from the tasks + changeLog (+ verdict reason) instead of taking it as input; capture feedback via the existing appendFeedback writer.

Add body.summary but POPULATE it inside persistBuildRecord (or the validate path) by composing a one-paragraph narrative from the validated task titles, the changed-file set, and the verdict reason — no new caller-supplied input. Render the `## Summary` omit-slot. Feedback via the existing appendFeedback writer (as a1).

**Rejected because:** Partial on ac1 (a derived summary restates `## Tasks`/`## Changes` rather than delivering the human-readable 'what + why') and partial on sc1 (prose-composition logic pushed into the shared writer); effectively a1 with a lower-quality summary.

## 9. References

- **[[c1]]** `analyze-bundle` `s1 'BuildRecord body + writer' — standalone-record.ts:61 (BuildRecord.body), :126 (renderPlanBuildRecordMd), :147 (## Changes/## Feedback omit-slots), :232 (mergeWithPrior upsert, fail-open)` — "BuildRecord.body has no top-level narrative summary; renderPlanBuildRecordMd emits omit-slot ## Changes/## Feedback; persistBuildRecord is a fail-open upsert that preserves createdAt + completion stam"
- **[[c2]]** `analyze-bundle` `s1 'provenance vocabulary + binders' — provenance/types.ts:37 (FeedbackEntry), :45 (ChangeLogEntry), format/bindings.ts:74 (feedbackBodyLines), :91 (changeLogBodyLines)` — "FeedbackRecord/ChangeLog already exist; binders are omit-slot ([] -> no lines). No summaryBodyLines binder yet — S003 mirrors the omit-slot idiom for `## Summary`."
- **[[c3]]** `analyze-bundle` `s1 'appendFeedback (in-cycle capture reference)' — provenance/writer.ts appendFeedback, daemon/index.ts:614, provenance/tool.ts` — "appendFeedback is the append-only writer (body.feedback = [...existing, entry], preserving every other key); S003 reuses it to capture build-cycle feedback."
- **[[c4]]** `analyze-bundle` `s1 'existing tests' — build-step.test.ts (persistBuildRecord output), artifact-feedback-handler-contract.test.ts (appendFeedback)` — "The S003 summary + feedback + byte-identity assertions extend the existing persistBuildRecord + provenance tests."
- **[[c5]]** `convention` `s1 'omit-slot render convention' — standalone-record.ts:147-154 (heading pushed only when the binder yields content) + lc1/k4` — "Additions to the BUILD record are additive + omit-slot: a record with neither summary nor feedback renders byte-identically to today (k4)."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 8 LOW** · model `client` · reviewed 2026-09-30T07:55:28.154Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| cl1 | citation | LOW | auto | The BUILD record writer + renderer live in standalone-record.ts: persistBuildRecord (an upsert) and renderPlanBuildRecordMd around lines 126-157. | Confirmed: standalone-record.ts:126 `export function renderPlanBuildRecordMd(rec: BuildRecord): string` and :172 `export function persistBuildRecord(...)` — both the writer and renderer resolve in that file. | accept |
| cl2 | semantic | LOW | auto | BuildRecord.body today has NO top-level narrative `summary` field (only focus/producesLld/tasks/commit/changeLog/feedback); S003 adds it. | Confirmed: standalone-record.ts:70 `readonly changeLog?: ChangeLog \| undefined` and the body carries feedback? but no `summary` field — the read at :61 anchors the body interface; S003's summary is genuinely new. | accept |
| cl3 | citation | LOW | auto | renderPlanBuildRecordMd emits omit-slot `## Changes` and `## Feedback` sections via changeLogBodyLines/feedbackBodyLines (pushed only when non-empty). | Confirmed: standalone-record.ts:149 `lines.push('', '## Changes', '', ...changeLines)` and :153 `... '## Feedback' ...`, each gated on the binder yielding content — the omit-slot pattern S003 mirrors for `## Summary`. | accept |
| cl4 | citation | LOW | auto | persistBuildRecord upserts via mergeWithPrior computing body = {...prior.body, ...rec.body} (a new body field takes the new write; omitted keys are preserved). | Confirmed verbatim: standalone-record.ts:232 `function mergeWithPrior(...)` with :247 `...prior.body,` and :248 `...rec.body,` — a new body field takes the new write; omitted keys are preserved from the prior. | accept |
| cl5 | citation | LOW | auto | appendFeedback (writer.ts) is the append-only feedback writer: body.feedback = [...existing, entry], preserving every other key, minting an id + timestamp. | Confirmed verbatim: writer.ts:117 `export function appendFeedback(req): AppendFeedbackResult` and :145 `body: { ...artifact.body, feedback: [...existing, entry] }` — append-only, preserving every other key. | accept |
| cl6 | semantic | LOW | auto | The provenance vocabulary declares FeedbackEntry (id/target/comment/author/timestamp/kind?) + FeedbackRecord = readonly FeedbackEntry[] in provenance/types.ts. | Confirmed: provenance/types.ts:37 `export interface FeedbackEntry extends ProvenanceAuthorship` and :50 `export type FeedbackRecord = readonly FeedbackEntry[]` (the citation's :45 was approximate; the symbol resolves at :50). | accept |
| cl7 | citation | LOW | auto | The render binders feedbackBodyLines + changeLogBodyLines are defined in format/bindings.ts and return [] for absent/empty input (the omit-slot idiom S003 mirrors for `## Summary`). | Confirmed: format/bindings.ts:74 `export function feedbackBodyLines(...)` and :91 `export function changeLogBodyLines(...)` — the omit-slot binders (they return [] for empty input). | accept |
| cl8 | semantic | LOW | auto | appendFeedback validates non-empty author + comment and throws ArtifactFeedbackError otherwise (the fail-open-at-caller error the LLD relies on). | Confirmed: writer.ts:33 `export class ArtifactFeedbackError extends Error` and :123/:124 throw it for an empty author/comment — the typed error the LLD's fail-open error paths rely on. | accept |
