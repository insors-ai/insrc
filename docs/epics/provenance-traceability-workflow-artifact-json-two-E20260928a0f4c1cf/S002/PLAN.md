<!-- insrc:artifact PLAN-a0f4c1cfe262a497-s2 -->

# Plan: E20260928a0f4c1cf:S002

**Epic:** `provenance-traceability-workflow-artifact-json-two`
**LLD run:** `wf-1790602404238-dpi15o`
**LLD effective hash:** `96dce0c1944d...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add optional changeLog?/feedback? to BuildRecord.body | S | — | unit: BuildRecord.body: a record with changeLog + feedback type-checks and round-trips through JSON | [[c1]] |
| 2 | **`t2`** Extract a shared changedFiles(repoPath) helper from realChangedFiles (extract-only) | M | — | unit: changedFiles: returns the unstaged ∪ staged git_diff set; throws NoBuildChangesError on git_diff failure; the existing code-review subject tests stay green | [[c2]] |
| 3 | **`t3`** Add collectBuildChangeLog (changed set → attributed ChangeLog) | M | `t2` | unit: collectBuildChangeLog: each changed file → one ChangeLogEntry {target.file, author, timestamp, version?}, segment omitted; empty changed set → [] | [[c2]] |
| 4 | **`t4`** Add changeLogBodyLines binding + wire Changes/Feedback into renderPlanBuildRecordMd | M | `t1` | unit: changeLogBodyLines: non-empty → section lines; undefined/empty → [] (omit-slot); unit: renderPlanBuildRecordMd: with changeLog → '## Changes'; with feedback → '## Feedback'; with neither → byte-identical to the pre-change render | [[c3]] |
| 5 | **`t5`** Populate rec.body.changeLog at the validate phase | M | `t1`, `t3` | integration: a plan-driven build over a repo with a known changed set → the BUILD json carries a changeLog with one attributed entry per changed file, and renderPlanBuildRecordMd shows the Changes section (ac1) | [[c2]] |
| 6 | **`t6`** Cross-cutting tests (re-validate preservation + integration + code feedback) | M | `t1`, `t2`, `t3`, `t4`, `t5` | unit: persistBuildRecord/mergeWithPrior: a re-validate that omits changeLog keeps the prior changeLog; a prior out-of-band feedback entry survives; a new write's recomputed changeLog replaces the prior; integration: appendFeedback on the BUILD json with a source-file ProvenanceTarget → an append-only, attributed code-feedback entry on body.feedback that renders in the Feedback section (ac2); integration: a legacy BUILD record (no changeLog/feedback) reads + re-renders byte-identically (ac4) | [[c4]] |

### E20260928a0f4c1cf:S002:T001 — Add optional changeLog?/feedback? to BuildRecord.body

Add `readonly changeLog?: ChangeLog | undefined;` and `readonly feedback?: FeedbackRecord | undefined;` to BuildRecord.body in standalone-record.ts (import ChangeLog/FeedbackRecord from provenance/types.js). Purely additive; no reader/guard change (readPriorRecord checks only meta ids). Co-locate a type-shape unit test.

**Acceptance checks:**
- BuildRecord.body carries optional changeLog?/feedback? typed from the s1 provenance vocabulary
- tsc clean under strict/exactOptionalPropertyTypes

### E20260928a0f4c1cf:S002:T002 — Extract a shared changedFiles(repoPath) helper from realChangedFiles (extract-only)

Extract the git_diff-derived changed-set derivation (realChangedFiles @ code-review/subject.ts:69, over gitDiffTool) into a small shared changedFiles(repoPath): Promise<readonly string[]> helper so the build reuses it without depending on the code-review module; re-point code-review/subject.ts to import the shared helper. STRICTLY behaviour-preserving — the existing code-review tests must stay green (no byte-behaviour drift on the code-review path).

**Acceptance checks:**
- changedFiles(repoPath) returns the unstaged ∪ staged git_diff file set; the code-review subject keeps using it unchanged (existing code-review tests green, no behaviour drift)
- NoBuildChangesError still thrown on git_diff failure

### E20260928a0f4c1cf:S002:T003 — Add collectBuildChangeLog (changed set → attributed ChangeLog)

Add collectBuildChangeLog(repoPath, ctx:{author,timestamp,version?}): Promise<ChangeLog> — for each path from changedFiles(repoPath), build a ChangeLogEntry {target:{file, version?}, author, timestamp, summary?} (segment omitted, file-level); empty/failed changed set → []. Grounded in the real git_diff set (lc1). Co-locate its unit test.

**Acceptance checks:**
- each changed file → one attributed ChangeLogEntry (file+author+timestamp+version?)
- empty changed set (or git_diff failure caught) → [] — never throws out of collectBuildChangeLog

### E20260928a0f4c1cf:S002:T004 — Add changeLogBodyLines binding + wire Changes/Feedback into renderPlanBuildRecordMd

Add changeLogBodyLines(changeLog: ChangeLog | undefined): string[] to format/bindings.ts (sc3-declared sibling; omit-slot: [] when absent/empty), mirroring feedbackBodyLines. In renderPlanBuildRecordMd, after the Tasks-validated section, push a `## Changes` block from changeLogBodyLines(rec.body.changeLog) and a `## Feedback` block from feedbackBodyLines(rec.body.feedback) — omit-slot, byte-identical when both absent. Co-locate binding + renderer tests.

**Acceptance checks:**
- changeLogBodyLines non-empty → section lines; undefined/empty → []
- renderPlanBuildRecordMd shows Changes/Feedback when present; byte-identical to pre-change when both absent (ac3/ac4/k5)

### E20260928a0f4c1cf:S002:T005 — Populate rec.body.changeLog at the validate phase

In the validate phase (phases/validate.ts, before the persistBuildRecord call at :96), call collectBuildChangeLog(repoPath, ctx) (async) and set rec.body.changeLog; a git_diff failure → empty change-log, never aborts the build. No signature change to handleValidate/persistBuildRecord.

**Acceptance checks:**
- a plan-driven build persists a BUILD json whose body.changeLog reflects the real changed set (ac1/lc1)
- git_diff failure leaves changeLog empty and the build still succeeds

### E20260928a0f4c1cf:S002:T006 — Cross-cutting tests (re-validate preservation + integration + code feedback)

Add the cross-cutting tests: mergeWithPrior/persistBuildRecord preserve a prior changeLog + out-of-band appended feedback across a re-validate (append-only); an integration append→read→render of BUILD code feedback via s1 appendFeedback with a source-file target; a legacy BUILD record (no changeLog/feedback) re-renders byte-identically. Confirm ac1-ac4 mapped + full sweep green (tsc clean).

**Acceptance checks:**
- re-validate keeps prior changeLog + feedback (append-only)
- BUILD code feedback appends via appendFeedback and renders; legacy record byte-identical; ac1-ac4 each have ≥1 passing test; full sweep green

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| collectBuildChangeLog: each changed file → one ChangeLogEntry {target.file, author, timestamp, version?}, segment omitted; empty changed set → [] | `t3` |
| renderPlanBuildRecordMd: with changeLog → '## Changes' section; with feedback → '## Feedback' section; with neither → output byte-identical to the pre-change render | `t4` |
| changeLogBodyLines: non-empty → section lines; undefined/empty → [] (omit-slot) | `t4` |
| persistBuildRecord/mergeWithPrior: a re-validate that omits changeLog keeps the prior changeLog; a prior out-of-band feedback entry survives; a new write's recomputed changeLog replaces the prior | `t6` |
| a plan-driven build over a repo with a known changed set → the BUILD json carries a changeLog with one attributed entry per changed file, and renderPlanBuildRecordMd shows the Changes section (ac1) | `t5` |
| appendFeedback on the BUILD json with a source-file target → a code feedback entry lands on body.feedback and renders in the Feedback section (ac2) | `t6` |
| a legacy BUILD record (no changeLog/feedback) reads + re-renders byte-identically (ac4) | `t6` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s2 — dataModelChanges: optional changeLog?/feedback? on BuildRecord.body (import from s1 provenance/types — sc1)`
- **[[c2]]** `prior-artifact` `LLD s2 — the git_diff changed-set (realChangedFiles → shared changedFiles helper) + collectBuildChangeLog + validate-phase population (grounded in the real changed set, lc1)`
- **[[c3]]** `prior-artifact` `LLD s2 — sc3 render binding: changeLogBodyLines sibling + Changes/Feedback omit-slot sections in renderPlanBuildRecordMd`
- **[[c4]]** `prior-artifact` `LLD s2 — testStrategy + migration: re-validate preservation (mergeWithPrior append-only) + integration append→render + legacy byte-identity + code feedback via s1 appendFeedback`
