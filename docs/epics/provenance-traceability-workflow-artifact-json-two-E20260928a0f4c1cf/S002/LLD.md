<!-- insrc:artifact LLD-a0f4c1cfe262a497-s2 -->

# LLD: E20260928a0f4c1cf:S002

**Epic:** `provenance-traceability-workflow-artifact-json-two`
**HLD base run:** `wf-1790588218844-46z20d`
**HLD effective hash:** `96dce0c1944d...`

## HLD context

**Framework:** s2 reuses s1's foundation to record the BUILD change-log from the build's actual git_diff changed set and BUILD code-anchored feedback — additive, absent-safe, byte-identical when absent. Consumes sc1 (ChangeLogEntry/ChangeLog/FeedbackRecord), sc2 (appendFeedback), sc3 (render bindings); owns no new contract.
**Rollout phase:** Phase B — BUILD change-log + code feedback
**Consumes:** `undefined` (undefined), `undefined` (undefined), `undefined` (undefined)

## Contract details

**Surface level:** internal

### `renderPlanBuildRecordMd`

```typescript
function renderPlanBuildRecordMd(rec: BuildRecord): string
```

**Parameters:**
- `rec: BuildRecord` — The plan-driven BUILD record (its body may now carry changeLog?/feedback?).

**Returns:** `string` — The BUILD markdown; gains a `## Changes` section (from changeLogBodyLines) and a `## Feedback` section (from feedbackBodyLines) via the sc3 omit-slot bindings. Byte-identical to today when both are absent.

**Preconditions:**
- rec is the plan-driven (standalone:false) record; the Trivial renderStandaloneBuildRecordMd is unchanged

**Postconditions:**
- Changes/Feedback sections are generated from body.changeLog/body.feedback; absent → sections omitted → byte-identical (ac3/ac4/k1/k5)

### `persistBuildRecord`

```typescript
function persistBuildRecord(repoPath: string, rec: BuildRecord): { md: string; json: string }
```

**Parameters:**
- `repoPath: string` — The repo whose BUILD ledger record is written.
- `rec: BuildRecord` — The record whose body now optionally carries changeLog (populated at the validate phase).

**Returns:** `{ md: string; json: string }` — The written md + json paths. mergeWithPrior's `{...prior.body, ...rec.body}` merge preserves changeLog + any out-of-band appended feedback across a re-validate upsert.

**Preconditions:**
- Unchanged signature; s2 only enriches rec.body before the call

**Postconditions:**
- changeLog and appended feedback survive re-validate (append-only, lc1/k5)

### `appendFeedback (sc2, consumed)`

```typescript
function appendFeedback(req: AppendFeedbackRequest): AppendFeedbackResult
```

**Parameters:**
- `req: AppendFeedbackRequest` — artifactPath = the BUILD json; entry.target = a source-file ProvenanceTarget (code feedback).

**Returns:** `AppendFeedbackResult` — s2 REUSES s1's appendFeedback UNCHANGED to record BUILD code feedback — it is body-shape-agnostic (writes body.feedback on any artifact JSON, incl. the BUILD record). No new writer.

**Errors:**
- `ArtifactFeedbackError (s1)` when out-of-tree BUILD path / malformed json / blank author or comment — unchanged from s1

**Preconditions:**
- The BUILD json path resolves under the artifact root

**Postconditions:**
- A code-anchored feedback entry is appended to the BUILD body.feedback, attributed + append-only (ac2/k2/k3)

### `changeLogBodyLines / feedbackBodyLines (sc3, consumed)`

```typescript
function changeLogBodyLines(changeLog: ChangeLog | undefined): readonly string[]
function feedbackBodyLines(feedback: FeedbackRecord | undefined): readonly string[]
```

**Parameters:**
- `changeLog / feedback: ChangeLog | undefined  /  FeedbackRecord | undefined` — The BUILD body's structured records; [] when absent (omit-slot).

**Returns:** `readonly string[]` — The Changes/Feedback section lines. feedbackBodyLines already exists (s1); changeLogBodyLines is the sibling ChangeLogSectionBinding declared by sc3 — s1 left it unbuilt (no document consumer needs it), so s2 adds it in format/bindings.ts as the sc3-declared sibling (still sc3's shape, not a new contract).

**Postconditions:**
- Absent/empty → [] → section omitted (byte-identical, k5)

### `realChangedFiles / changedFiles (existing capability, reused)`

```typescript
function changedFiles(repoPath: string): Promise<readonly string[]>
```

**Parameters:**
- `repoPath: string` — The repo whose working-tree changed set is derived via the git_diff builtin.

**Returns:** `Promise<readonly string[]>` — The real changed file set (unstaged ∪ staged), the lc1 grounding for the change-log. Reused from realChangedFiles (code-review/subject.ts:69), extracted into a small shared helper so the build does not depend on the code-review module.

**Errors:**
- `NoBuildChangesError (existing)` when git_diff fails / returns no data — the build handles it as 'no change-log' (empty changeLog), never a hard failure

**Preconditions:**
- Called at the validate phase before persistBuildRecord

**Postconditions:**
- Each returned path becomes one file-level ChangeLogEntry (segment omitted; line-ranges deferred)

## Data model changes

### `BuildRecord.body` — field-add

Add `readonly changeLog?: ChangeLog | undefined;` and `readonly feedback?: FeedbackRecord | undefined;` to BuildRecord.body (importing ChangeLog/FeedbackRecord from src/workflow/artifacts/provenance/types.js — consuming sc1). Both optional + absent-safe; mergeWithPrior already carries them through `{...prior.body, ...rec.body}`. No guard change (BuildRecord has no isXBody guard; readPriorRecord only checks meta.epicHash/storyId).

```
+ readonly changeLog?: ChangeLog | undefined;      // BUILD-only (k7)
+ readonly feedback?:  FeedbackRecord | undefined;  // BUILD code feedback (k3)
```

**Call sites:**
- `src/workflow/runners/build/standalone-record.ts:43`
- `src/workflow/artifacts/provenance/types.ts:45`

### `renderPlanBuildRecordMd` — field-modify

After the Tasks-validated section, append a `## Changes` block from changeLogBodyLines(rec.body.changeLog) and a `## Feedback` block from feedbackBodyLines(rec.body.feedback), each via the omit-slot pattern (push lines only when non-empty). Byte-identical when both absent (existing BUILD records unchanged).

```
lines.push(...changeLogBodyLines(rec.body.changeLog)); lines.push(...feedbackBodyLines(rec.body.feedback))  // omit-slot
```

**Call sites:**
- `src/workflow/runners/build/standalone-record.ts:116`
- `src/workflow/artifacts/format/bindings.ts`

### `collectBuildChangeLog (new s2-internal helper)` — new

A new helper that maps the changed set to a ChangeLog: for each path in changedFiles(repoPath), build a ChangeLogEntry { target:{file: path, version: commit?}, author: <build actor>, timestamp: <build time>, summary?: undefined }. segment omitted (file-level). Lives in the build runner (near persistBuildRecord) or the provenance module; grounded in lc1.

```
collectBuildChangeLog(repoPath, ctx: { author: string; timestamp: string; version?: string }): Promise<ChangeLog>
```

**Call sites:**
- `src/workflow/runners/build/standalone-record.ts:151`
- `src/workflow/code-review/subject.ts:69`

### `build validate phase (handleValidate)` — field-modify

At the validate phase, before constructing/persisting the BuildRecord, call collectBuildChangeLog (async) and set rec.body.changeLog. git_diff failure → empty change-log, never aborts the build. No signature change to handleValidate.

```
rec.body.changeLog = await collectBuildChangeLog(repoPath, ctx)  // before persistBuildRecord
```

**Call sites:**
- `src/mcp/build-step/phases/validate.ts`
- `src/mcp/build-step/handler.ts:23`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | s2 imports ChangeLogEntry/ChangeLog/FeedbackRecord from s1's provenance/types (already declared) and attaches optional changeLog?/feedback? to BuildRecord.body — no vocabulary change, pure consumption. |
| `sc2` | consumes | s2 reuses appendFeedback UNCHANGED for BUILD code feedback (body-shape-agnostic; writes body.feedback on the BUILD json) with a source-file ProvenanceTarget. No new writer/tool/IPC. |
| `sc3` | consumes | s2 calls feedbackBodyLines + changeLogBodyLines (the sc3-declared bindings) from renderPlanBuildRecordMd via the omit-slot pattern; changeLogBodyLines (the BUILD-changes sibling s1 left unbuilt) is added in format/bindings.ts as the sc3-declared shape — consumer wiring, not a re-design of s1's feedbackBodyLines. |

## Error paths

### Error cases

- **The git_diff builtin fails or returns no data at the validate phase (no repo, git error)** (recoverable)
  - Detection: changedFiles(repoPath) rejects with NoBuildChangesError (the existing realChangedFiles path throws when git_diff.execute returns !success or no data).
  - Response: The build catches it and treats it as an EMPTY change-log (rec.body.changeLog left undefined/[]); the build never fails on change-log derivation — a missing change-log is absent-safe, not an error.
  - User impact: The BUILD record persists without a Changes section; the build itself succeeds.
- **A re-validate rewrites the BuildRecord and could drop a previously-recorded change-log or an out-of-band appended feedback entry** (recoverable)
  - Detection: persistBuildRecord→mergeWithPrior reads the prior on-disk record; if the new rec.body omits changeLog/feedback the spread `{...prior.body, ...rec.body}` would normally let the new (absent) value win only if present.
  - Response: Rely on the existing mergeWithPrior semantics: `...prior.body` is spread FIRST so a prior changeLog/feedback survives when the new write omits it; a new write that recomputes changeLog replaces it (still the real changed set). Feedback appended out-of-band via appendFeedback is on prior.body and is preserved. Confirm with a re-validate test.
  - User impact: No loss of prior change-log or feedback across re-validate (append-only, lc1).
- **Code feedback is recorded on a BUILD json that is out-of-tree or malformed** (recoverable)
  - Detection: appendFeedback (s1, unchanged) resolves+guards the path and JSON.parses — an out-of-tree path / malformed json / blank author or comment throws ArtifactFeedbackError before any write.
  - Response: The typed error surfaces (or the IPC handler returns {error}); the BUILD json is untouched. s2 adds no new error path — it inherits s1's.
  - User impact: The feedback append is rejected with a clear message; the BUILD record is unchanged.

### Edge cases

| Input | Expected |
| :--- | :--- |
| A build that changed NO files (empty changed set) | collectBuildChangeLog returns [] → rec.body.changeLog is [] or omitted → the Changes section is omitted (byte-identical) — no empty '## Changes' heading. |
| An existing BUILD record written before s2 (no changeLog/feedback field) | It reads + re-renders unchanged (optional fields absent → omit-slot → byte-identical); mergeWithPrior tolerates the missing fields (ac4/k5). |
| A Trivial standalone build (standalone:true) | Routes through renderStandaloneBuildRecordMd which stays byte-identical — s2 does not add Changes/Feedback there (scoped to the plan-driven path; Trivial parity deferred). |
| A changed file with a very long path or an unusual character | It becomes one ChangeLogEntry.target.file verbatim (the git_diff path); the renderer prints it as-is — no parsing/escaping beyond markdown. |
| The build commit sha is unknown at validate time | ChangeLogEntry.target.version is omitted (optional in sc1); the entry is still valid with file+author+timestamp. |

### Invariants to preserve

- The BUILD change-log MUST be grounded in the real git_diff changed set (unstaged ∪ staged), not a hand-authored or plan/task-derived summary — the same git_diff source the code-review subject already trusts (realChangedFiles @ code-review/subject.ts:69) (lc1). [[c2]]
- mergeWithPrior must keep spreading `...prior.body` before `...rec.body` so changeLog + out-of-band appended feedback survive a re-validate upsert (append-only, never un-recording). [[c2]]
- A BUILD record with no changeLog/feedback must render byte-identical to today (omit-slot), and the Trivial renderStandaloneBuildRecordMd stays byte-identical — existing records unchanged (k5). [[c2]]
- Code feedback on the BUILD artifact reuses s1's appendFeedback UNCHANGED (append-only, key-preserving, path-guarded); s2 introduces no parallel writer (k6/lc1). [[c2]]

## Test strategy

**Test framework:** `node:test (tsx --test), *.test.ts — the repo convention (src/workflow/runners/build convention.detect: camelCase fns, *.test files; matches the S001 provenance suites)`

### Test levels

- **unit** — Prove collectBuildChangeLog maps the changed set to attributed ChangeLogEntries and the BUILD renderer emits Changes/Feedback via the sc3 omit-slot, byte-identical when absent.
  - Subjects: `collectBuildChangeLog: each changed file → one ChangeLogEntry {target.file, author, timestamp, version?}, segment omitted; empty changed set → []`, `renderPlanBuildRecordMd: with changeLog → '## Changes' section; with feedback → '## Feedback' section; with neither → output byte-identical to the pre-change render`, `changeLogBodyLines: non-empty → section lines; undefined/empty → [] (omit-slot)`
  - Fixtures: `an in-memory BuildRecord fixture with/without changeLog + feedback`, `a stub changedFiles returning a fixed path list`
- **unit** — Prove the upsert preserves changeLog + appended feedback across a re-validate (append-only).
  - Subjects: `persistBuildRecord/mergeWithPrior: a re-validate that omits changeLog keeps the prior changeLog; a prior out-of-band feedback entry survives; a new write's recomputed changeLog replaces the prior`
  - Fixtures: `a temp-dir prior BUILD json with changeLog + feedback, then a second persist with a new body`
- **integration** — Prove the end-to-end BUILD provenance: a build with real changes records the change-log, code feedback appends via sc2, both render, and a legacy record is unchanged.
  - Subjects: `a plan-driven build over a repo with a known changed set → the BUILD json carries a changeLog with one attributed entry per changed file, and renderPlanBuildRecordMd shows the Changes section (ac1)`, `appendFeedback on the BUILD json with a source-file target → a code feedback entry lands on body.feedback and renders in the Feedback section (ac2)`, `a legacy BUILD record (no changeLog/feedback) reads + re-renders byte-identically (ac4)`
  - Fixtures: `a temp git repo with a controlled working-tree diff (a couple of changed files)`, `a written BUILD json envelope for the append+render path`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: collectBuildChangeLog maps each changed file to an attributed ChangeLogEntry (file+author+timestamp+version?)`, `integration: a build with a known changed set → BUILD json changeLog has one entry per changed file, grounded in the real git_diff set (lc1)` |
| `ac2` | `integration: appendFeedback on the BUILD json with a source-file ProvenanceTarget → an append-only, attributed code-feedback entry on body.feedback`, `unit: renderPlanBuildRecordMd shows the Feedback section from body.feedback` |
| `ac3` | `unit: renderPlanBuildRecordMd with changeLog and/or feedback present → Changes/Feedback sections generated from the structured body`, `unit: renderPlanBuildRecordMd with neither → byte-identical to the pre-change render` |
| `ac4` | `unit: mergeWithPrior/persistBuildRecord preserve a legacy record's absence of changeLog/feedback (reads + re-renders unchanged)`, `integration: a pre-s2 BUILD json re-renders byte-identically (forward-only)` |

## Migration

**State before:** BuildRecord.body (src/workflow/runners/build/standalone-record.ts:43-66) carries focus?/producesLld?/tasks?/commit? and no change-log or feedback; renderPlanBuildRecordMd (:116) renders only the header + Tasks-validated section; persistBuildRecord/mergeWithPrior (:151/:211) upsert-merge the body. There is no build-time changed-set producer — the only git_diff-derived collector is realChangedFiles (code-review/subject.ts:69, files only, private to code-review). S001 already declared ChangeLogEntry/ChangeLog + FeedbackRecord in provenance/types.ts and shipped appendFeedback (body-shape-agnostic).

**State after:** BuildRecord.body carries optional changeLog?/feedback? (absent on every existing record). At the validate phase the plan-driven build derives the real git_diff changed set and records a file-level, attributed change-log; renderPlanBuildRecordMd shows Changes + Feedback sections via the shared sc3 bindings (byte-identical when absent). Code feedback rides s1's appendFeedback unchanged. Nothing is migrated; existing BUILD records stay valid and render identically. Trivial renderStandaloneBuildRecordMd is unchanged.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add optional changeLog?/feedback? fields to BuildRecord.body (import ChangeLog/FeedbackRecord from the s1 provenance types) — purely additive; no reader/guard change (readPriorRecord only checks meta ids). — ↩ rollbackable
2. Extract the git_diff-derived changed-set derivation (realChangedFiles) into a small shared changedFiles(repoPath) helper (or export it) so the build can reuse it without depending on the code-review module. — ↩ rollbackable
3. Add the collectBuildChangeLog helper: map each changed file to an attributed ChangeLogEntry (file, author, timestamp, version?; segment omitted). — ↩ rollbackable
4. In the validate phase, before persistBuildRecord, populate rec.body.changeLog from collectBuildChangeLog (git_diff failure → empty change-log, never aborts). — ↩ rollbackable
5. Wire the '## Changes' + '## Feedback' omit-slot sections into renderPlanBuildRecordMd via changeLogBodyLines/feedbackBodyLines (byte-identical when both absent); add changeLogBodyLines to format/bindings.ts if s1 did not. — ↩ rollbackable

**Backward compat:** Fully backward compatible: changeLog?/feedback? are optional + absent-safe, so every existing BUILD record (and the Trivial standalone renderer) reads + renders byte-identically; mergeWithPrior already tolerates and preserves the new fields across a re-validate (append-only). persistBuildRecord + renderPlanBuildRecordMd keep their signatures; changedFiles is a reuse of an existing capability (extract-only, no behaviour change to the code-review path). No existing public API signature changes.

## Alternatives considered

### a1: File-level change-log from the git_diff changed set (reuse the realChangedFiles capability) — **CHOSEN**

Add changeLog?/feedback? to BuildRecord.body; populate a one-entry-per-changed-file change-log at the validate phase from the existing git_diff-derived changed set (segment omitted, optional); feedback via sc2 unchanged; render both via sc3 in renderPlanBuildRecordMd.

Add changeLog?/feedback? to BuildRecord.body (import from s1 provenance types — sc1). Extract realChangedFiles into a shared changedFiles helper and reuse it at the validate phase. Map each changed file to a ChangeLogEntry {target:{file, version:commit?}, author, timestamp, summary?} — segment omitted (file-level; sc1 allows). persistBuildRecord/mergeWithPrior carry it through. Code feedback reuses sc2 appendFeedback unchanged; render via sc3 omit-slot bindings in renderPlanBuildRecordMd. Scope to the plan-driven path; Trivial renderer byte-identical.

### a2: Line-range change-log by parsing git-diff hunks into segment{startLine,endLine}

Same wiring as a1 but derive per-change LINE-RANGES from git diff hunks so each ChangeLogEntry carries target.segment, fully realising k7's {segment/lines}.

As a1, but add a diff-hunk parser over git diff that yields per-file {startLine,endLine} hunk ranges and emit one ChangeLogEntry per hunk with target.segment populated. Everything else matches a1.

**Rejected because:** Meets every constraint and is technically richer, but at L cost with a new brittle diff-hunk parser for a detail sc1 makes OPTIONAL. Better as a deferred enhancement on top of a1 than the first cut.

### a3: Change-log derived from the plan's validated tasks (body.tasks)

Build the change-log from the BuildRecord's already-tracked validated tasks rather than the git changed set.

Reuse body.tasks[] and synthesize a ChangeLogEntry per task using the task id/title as the change description. No git_diff needed.

**Rejected because:** Rejected — violates ac1/lc1 (a task-derived log is exactly the hand-authored summary the invariant forbids) and misuses ChangeLogEntry (sc1 partial). Cheap but wrong provenance.

## Citations

- **[[c1]]** `prior-artifact` `S001 provenance vocabulary (sc1) — ChangeLogEntry/ChangeLog/FeedbackRecord in src/workflow/artifacts/provenance/types.ts; appendFeedback (sc2) + feedbackBodyLines (sc3) already shipped`
- **[[c2]]** `analyze-bundle` `s2 s1-context — BuildRecord.body + renderPlanBuildRecordMd + persistBuildRecord/mergeWithPrior (standalone-record.ts:43/116/151/211); realChangedFiles git_diff changed set (code-review/subject.ts:69); the validate phase (mcp/build-step/handler.ts:23 → phases/validate.ts)` — "The BUILD body is BuildRecord.body; the change-log is grounded in the git_diff-derived changed set (file-level, segment optional); populated at the validate phase; mergeWithPrior preserves body across"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 7 LOW** · model `client` · reviewed 2026-09-28T13:47:43.595Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| dataModel | citation | LOW | manual | BuildRecord (the persisted BUILD body the change-log/feedback attach to) is declared in src/workflow/runners/build/standalone-record.ts with a body carrying focus?/producesLld?/tasks?/commit?, and mergeWithPrior spreads {...prior.body, ...rec.body}. | Confirmed: export interface BuildRecord @ standalone-record.ts:43; mergeWithPrior @ :211 with `...prior.body` @ :226 (spread before rec.body). The BUILD body + upsert-preserve semantics are as cited. | none — verified sound. |
| dataModel | citation | LOW | manual | renderPlanBuildRecordMd + persistBuildRecord are the plan-driven BUILD renderer + writer in standalone-record.ts (the section-assembly + persist seam s2 modifies). | Confirmed: renderPlanBuildRecordMd @ standalone-record.ts:116 and persistBuildRecord @ :151 — the renderer + writer seam s2 modifies. | none — verified sound. |
| contract | citation | LOW | manual | realChangedFiles derives the changed set from the git_diff builtin (returns file paths) in src/workflow/code-review/subject.ts — the lc1 changed-set grounding s2 reuses. | Confirmed: realChangedFiles @ code-review/subject.ts:69 derives the changed set via gitDiffTool (diff.ts:54). The lc1 changed-set grounding s2 reuses exists as cited. | none — verified sound. |
| sc1 | citation | LOW | manual | ChangeLogEntry/ChangeLog and FeedbackRecord are already declared in the provenance types module (from S001) for s2 to import. | Confirmed: ChangeLogEntry @ provenance/types.ts:45, ChangeLog @ :51, FeedbackRecord @ :50 — all shipped by S001, ready for s2 to import. | none — verified sound. |
| sc2 | semantic | LOW | manual | appendFeedback (s1) is body-shape-agnostic (writes body.feedback on any artifact JSON), so s2 reuses it UNCHANGED for BUILD code feedback with no new writer. | Confirmed: appendFeedback @ provenance/writer.ts:117 writes body.feedback (body-shape-agnostic per the S001 tests); s2 reuses it unchanged for BUILD code feedback — no parallel writer. | none — verified sound. |
| sc3 | semantic | LOW | manual | feedbackBodyLines already exists in format/bindings.ts (s1) but changeLogBodyLines is NOT yet implemented — s2 adds the sc3-declared changeLogBodyLines sibling. | Confirmed: feedbackBodyLines @ format/bindings.ts:56 exists; `export function changeLogBodyLines` has ZERO hits — exactly as the LLD states, so s2 adds the sc3-declared changeLogBodyLines sibling (consumer wiring, not a re-design). | none — verified sound; the not-yet-built claim holds. |
| validate | citation | LOW | manual | The build validate phase (handleValidate, dispatched from mcp/build-step/handler.ts) is where the BuildRecord is persisted — the async seam where the change-log is populated before persistBuildRecord. | Confirmed: handleValidate is dispatched from build-step/handler.ts:44 and persistBuildRecord is called at phases/validate.ts:96 — the validate phase is the async seam where s2 populates the change-log before persist. | none — verified sound. |
