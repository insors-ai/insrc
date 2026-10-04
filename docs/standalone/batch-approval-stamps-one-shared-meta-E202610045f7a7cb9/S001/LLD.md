<!-- insrc:artifact LLD-5f7a7cb95b643ae5-S001 -->

# LLD: E202610045f7a7cb9:S001

## Summary

**Epic:** `batch-approval-stamps-one-shared-meta`
**HLD base run:** `wf-1791123735324-yqq3go`
**HLD effective hash:** `b1168f0c3850...`

A Story's change set is measured from a starting commit. Today that commit is recorded when the plan is approved, so Stories approved together share one starting point and a later Story's record lists its siblings' files. This design records the starting commit when the Story's build begins, in a small file that cannot be approved or mistaken for the Story's work, and moves it only after that build is both approved and finished. The code review measures from the same commit and leaves the workflow's own record files out of what it reviews, and if that new measurement fails it falls back to what it does today.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal

### 2.1 `resolveStoryRangeBase`

```typescript
function resolveStoryRangeBase(repoPath: string, epicHash: string, storyId: string): string | undefined
```

**Parameters:**
- `repoPath: string` — Absolute repo root.
- `epicHash: string` — The work item's hash.
- `storyId: string` — The Story id, used verbatim as the BUILD record id uses it.

**Returns:** `string | undefined` — The Story's base commit. New first step: the Story's build-start file, when it parses, names this Story, and its commit exists in the repo. Then the existing steps, unchanged in every respect: the approval-time stamp on the PLAN then LLD (returned as stored, as today), then the commit that introduced that artifact. Undefined when nothing resolves.

**Preconditions:**
- Signature, synchrony and never-throws behaviour are unchanged.

**Postconditions:**
- A build-start file that is unreadable, malformed, names another Story, or names a commit git cannot find is ignored with a logged warning and resolution continues with the existing steps.
- No fallback to HEAD^ or the empty tree is introduced.
- With no build-start file the returned value is exactly today's.

### 2.2 `stampBuildStart`

```typescript
function stampBuildStart(repoPath: string, epicHash: string, storyId: string): 'stamped' | 'kept' | 'skipped-work-exists' | 'not-written'
```

**Parameters:**
- `repoPath: string` — Absolute repo root.
- `epicHash: string` — The work item's hash.
- `storyId: string` — The Story id.

**Returns:** `'stamped' | 'kept' | 'skipped-work-exists' | 'not-written'` — `stamped`: the file now holds HEAD's full sha. `kept`: a valid stamp exists and was left alone. `skipped-work-exists`: no valid stamp exists and the Story's BUILD record shows unfinished work, so HEAD may already contain that work and nothing was written. `not-written`: HEAD could not be resolved or the file could not be written; nothing was written.

**Preconditions:**
- New function in src/workflow/runners/build/range-base.ts, beside the resolver. Synchronous. Never throws.
- It reads the Story's BUILD record json and PLAN json directly from .insrc/artifacts, the way the module's existing stampedBase helper reads an artifact. It adds no runtime import of src/workflow/gates.ts (that would be a cycle through completion-record.ts); the module's existing type-only import of gates.ts is unaffected.

**Postconditions:**
- One test, FINISHED, is used in every branch. A build is FINISHED when all hold: the BUILD record has approvedAt; it has at least one task; every recorded task has passed === true; and, when a PLAN json exists for the Story, either every task id in the plan's body.tasks is among the record's task ids, or the record holds a task whose id equals the storyId (a whole-Story validation through the standalone route). A PLAN json that exists but cannot be read or parsed makes the build not FINISHED.
- Valid stamp present: it is replaced only when the build is FINISHED and the record's approvedAt is later than the stamp's stampedAt; otherwise `kept`.
- No valid stamp: when the BUILD record has at least one task and the build is not FINISHED, nothing is written (`skipped-work-exists`), whether or not the record is approved. Otherwise (no record, a task-less record, or a FINISHED build) the stamp is written.
- Consequence: no state in which the record shows unfinished work, approved or not, puts HEAD into the stamp.
- It never writes or changes any artifact record.

### 2.3 `buildStartRelPath`

```typescript
function buildStartRelPath(epicHash: string, storyId: string): string
```

**Parameters:**
- `epicHash: string` — The work item's hash.
- `storyId: string` — The Story id.

**Returns:** `string` — The repo-relative path `.insrc/build-start/<epicHash>-<storyId>.json`. The one place the path is formed; used by the stamper, the resolver and both BUILD writers.

### 2.4 `LEDGER_EXCLUDE_GLOBS`

```typescript
const LEDGER_EXCLUDE_GLOBS: readonly string[]
```

**Returns:** `readonly string[]` — Exactly four repo-root globs: `.insrc/artifacts/*.json`, `.insrc/build-start/**`, `docs/epics/**`, `docs/standalone/**`. Exported from src/workflow/runners/build/changed-files.ts. In git's glob pathspec `*` does not cross a directory separator, so the first glob covers only json files directly inside .insrc/artifacts.

**Postconditions:**
- .insrc/templates, .insrc/feedback, .insrc/conventions, .insrc/artifacts/templates and .insrc/artifacts/formats are matched by none of the globs.

### 2.5 `git_diff`

```typescript
tool git_diff(input: { cwd; staged?; from?; to?; path?; context?; ignoreWhitespace?; maxBytes?; exclude?: string[] })
```

**Parameters:**
- `exclude: string[]` _(optional)_ — Globs, relative to the repo root, to leave out of the diff. Each is passed to git as a `:(top,exclude,glob)<glob>` pathspec on BOTH the body command and the numstat command. When no `path` is given the positive pathspec is `:(top)`; when `path` is given it stays the positive pathspec. The input is declared in the tool's closed input schema as well as read in the handler.

**Returns:** `unchanged result shape` — The same body, file list and totals as today, computed over the non-excluded paths. Excluded hunks are never emitted, so they do not count toward maxBytes.

**Errors:**
- `invalid-input` when `exclude` is present but is not an array of non-empty strings.

**Preconditions:**
- Omitting `exclude`, or passing an empty array, builds exactly today's git arguments.
- The pathspec form was verified on git 2.55.0 only. No minimum git version is asserted; a git that rejects the form fails the body command, which callers handle by the fallback described under resolveCodeReviewSubject and assembleDiffCodeReviewGrounding.

**Postconditions:**
- The body command and the numstat command always receive the same pathspecs.
- Failure handling is unchanged: a failed body command fails the tool; a failed numstat command still yields an empty file list with success.

### 2.6 `changedFiles`

```typescript
function changedFiles(repoPath: string, opts?: { base?: string; exclude?: readonly string[]; excludeGlobs?: readonly string[] }): Promise<readonly string[]>
```

**Parameters:**
- `opts.excludeGlobs: readonly string[] | undefined` _(optional)_ — Globs forwarded as git_diff's `exclude` on every diff this function runs (unstaged, staged and range).

**Returns:** `Promise<readonly string[]>` — Unchanged rule: the working-tree set when it is non-empty after exclusion, otherwise the range from `base`. `exclude` (exact paths) is still applied in code; `excludeGlobs` is applied by git.

**Errors:**
- `NoBuildChangesError` when Unchanged from today: any git_diff it runs fails.

**Postconditions:**
- With `excludeGlobs` absent the git_diff inputs are byte-identical to today's, so collectBuildChangeLog and both BUILD writers are unaffected.

### 2.7 `resolveCodeReviewSubject`

```typescript
function resolveCodeReviewSubject(repoPath: string, epicHash: string, storyId: string, deps?: SubjectDeps): Promise<...>  // SubjectDeps.changedFiles widens to (repoPath: string, opts?: ChangedFilesOptions) => Promise<readonly string[]>; SubjectDeps gains resolveRangeBase
```

**Parameters:**
- `deps.resolveRangeBase: (repoPath: string, epicHash: string, storyId: string) => string | undefined` _(optional)_ — Defaults to resolveStoryRangeBase; a seam for tests.

**Returns:** `unchanged` — The subject's changedFiles comes from the first of three attempts that does not throw NoBuildChangesError: (1) changedFiles with the Story's base and LEDGER_EXCLUDE_GLOBS; (2) changedFiles with LEDGER_EXCLUDE_GLOBS and no base; (3) changedFiles with no options, which is today's call. Each step down is logged as a warning. Only when attempt 3 throws is the result `no-build-record`, exactly as today.

**Postconditions:**
- A tree dirty only with ledger files is treated as clean and the range is used.
- The review can start in every state in which it can start today: a base that git cannot resolve, or a git that rejects the exclusion pathspecs, costs precision and never the review.
- With no resolvable base attempt 1 is attempt 2.
- A step down is visible only in the log. Nothing on the subject or the review response records it; surfacing it to the controller is left out of this Story and noted as a known gap.

### 2.8 `assembleDiffCodeReviewGrounding`

```typescript
function assembleDiffCodeReviewGrounding(repoPath: string, deps?: DiffGroundingDeps, opts?: { base?: string; excludeGlobs?: readonly string[] }): Promise<...>  // DiffGroundingDeps.workingTreeDiff and lastCommitDiff gain an optional trailing excludeGlobs parameter; DiffGroundingDeps gains rangeDiff(repoPath, base, excludeGlobs)
```

**Parameters:**
- `opts.base: string | undefined` _(optional)_ — The Story's base. When the working-tree diff is empty after exclusion and a base is given, the diff is base..HEAD.
- `opts.excludeGlobs: readonly string[] | undefined` _(optional)_ — Passed as git_diff's `exclude` on every diff.

**Returns:** `unchanged` — With opts: working-tree diff; else, with a base, the base..HEAD diff, whose result stands even when empty; else the existing last-commit fallback; all with the exclusions applied. If any diff in that sequence fails, the same three-step fallback as the review subject applies: retry the sequence without the base, then run today's sequence with no opts. Each step down is logged as a warning.

**Errors:**
- `DiffUnavailableError` when Unchanged from today: thrown only when today's sequence itself fails.

**Preconditions:**
- Called with no opts it makes exactly today's calls on its deps.

**Postconditions:**
- beginDiffOnlyReview in src/mcp/code-review-step/handler.ts, its only caller, passes { base: resolveStoryRangeBase(repo, subject.epicHash, subject.storyId), excludeGlobs: LEDGER_EXCLUDE_GLOBS }.

## 3. Data model changes

### 3.1 `Build-start file (.insrc/build-start/<epicHash>-<storyId>.json)` — new

One small json file per Story: { epicHash, storyId, rangeBase (40-hex commit sha), stampedAt (ISO time) }. Written by stampBuildStart from the implement phase on every admitted route (plan-driven, Small, and Trivial before its record write); the call is fail-open, so a stamping problem never blocks a build. It is not an artifact: it has no artifact id, sits outside .insrc/artifacts, and the approval sweep cannot see it. It is a plain tracked file, so it may be committed with the Story's work, and a person can create or correct it by hand: any file with the four fields, naming this Story and an existing commit, is accepted.

**Call sites:**
- `src/mcp/build-step/phases/implement.ts`
- `src/workflow/runners/build/range-base.ts`

### 3.2 `BUILD writers' exclusion list` — invariant-change

Current behaviour: the validate phase and the completion writer each pass an `exclude` holding only their own record's json and md. Each now also adds buildStartRelPath(epicHash, storyId). A tree dirty only with the build-start file is treated as clean, so the range is used; and the file never appears in a change log whether it is uncommitted or was committed inside the range. The BUILD writers do NOT use the ledger globs; what else a change log lists is unchanged.

**Call sites:**
- `src/mcp/build-step/phases/validate.ts`
- `src/workflow/runners/build/completion-record.ts`

### 3.3 `ApprovableArtifactMeta.rangeBase (approval-time stamp)` — invariant-change

Current behaviour: it is the first source of a Story's base. It is unchanged in how it is written and read, and is now consulted only when the Story has no valid build-start file.

**Call sites:**
- `src/workflow/gates.ts`
- `src/workflow/runners/build/range-base.ts`

### 3.4 `BuildRecord and PLAN artifact (read only)` — invariant-change

No field is added or changed. New reader: stampBuildStart reads BuildRecord.meta.approvedAt and body.tasks[].{id, passed}, and the PLAN's body.tasks[].id, for the FINISHED test. Current behaviour relied on: the validate phase records one task per call, with the plan task's bare id on the plan-driven route and the storyId on the standalone route; `passed` is true only when the verdict says so and is optional on the type; the record merge unions tasks by id and keeps a prior approvedAt; and nothing prevents approval of a record with a failed, unset or missing task.

**Call sites:**
- `src/workflow/runners/build/standalone-record.ts`
- `src/mcp/build-step/phases/validate.ts`
- `src/workflow/runners/plan/schemas.ts`

## 4. Error paths

**Error cases**

- **HEAD cannot be resolved when the build starts (empty repo, or not a git repo).** (recoverable)
  - Detection: The `git rev-parse HEAD` call inside stampBuildStart exits non-zero or returns something that is not a 40-hex sha.
  - Response: Write nothing, log a warning, return `not-written`. The implement phase continues.
  - User impact: The build proceeds. The Story's base falls to the existing resolution steps, as today.
- **The build-start file cannot be written (permissions, full disk).** (recoverable)
  - Detection: The directory create or file write inside stampBuildStart throws; the function catches it.
  - Response: Log a warning naming the path and return `not-written`. The implement phase continues.
  - User impact: Same as above.
- **The build-start file exists but is unreadable, is not valid json, lacks a 40-hex rangeBase, or names a different epicHash or storyId.** (recoverable)
  - Detection: The resolver and the stamper both read it through one private reader that parses and checks the four fields against the Story asked for.
  - Response: The resolver ignores it with a warning and continues with the existing steps. The stamper treats it as absent and applies its no-valid-stamp rule: it writes a fresh stamp unless the BUILD record shows unfinished work, in which case it writes nothing.
  - User impact: A log line. For a Story with no recorded work the stamp heals at the next build start; for a Story with unfinished recorded work the base falls to the existing steps until someone corrects the file.
- **The commit named in the build-start file no longer exists in the repo (history rewritten and pruned).** (recoverable)
  - Detection: The shared reader runs `git cat-file -e <sha>^{commit}`; a non-zero exit marks the stamp invalid.
  - Response: Treated exactly like a malformed stamp.
  - User impact: The base falls to the approval-time stamp or the introducing commit, which may be wider. This is today's behaviour for such a repo.
- **The PLAN json exists but cannot be read or parsed when the stamper applies the FINISHED test.** (recoverable)
  - Detection: The read or JSON.parse inside the test throws, or body.tasks is not an array of objects with string ids; the test catches this.
  - Response: The build counts as not FINISHED: a valid stamp is kept, and with no valid stamp and recorded tasks nothing is written.
  - User impact: A rebuild of that Story keeps its old starting point until the plan is readable. The base never moves forward on doubtful evidence.
- **On the review's graph path, the diff from the Story's base fails (the approval-time stamp names a commit git cannot resolve), or git rejects the exclusion pathspecs.** (recoverable)
  - Detection: git_diff's BODY command exits non-zero, the tool returns a failure, and changedFiles throws NoBuildChangesError; resolveCodeReviewSubject catches it. A failing numstat command alone is not detected (the tool swallows it into an empty list), but the same pathspecs go to both commands, so a rejected pathspec or range fails the body too.
  - Response: Step down: retry with the exclusions and no base; if that throws, make today's call with no options. Log a warning at each step. Only a failure of today's call yields `no-build-record`.
  - User impact: The review starts. In the fallback it reviews what it reviews today (the working tree, ledger files included) instead of the Story's range, and only the log says so.
- **On the review's degraded path, a diff in the new sequence fails for the same reasons.** (recoverable)
  - Detection: The grounding's diff dep throws DiffUnavailableError; assembleDiffCodeReviewGrounding catches it while opts are in effect.
  - Response: Step down the same way: the sequence without the base, then today's sequence with no opts. Log a warning at each step. DiffUnavailableError leaves the function only when today's sequence fails.
  - User impact: The degraded review still runs, on today's last-commit diff in the worst case.
- **git_diff is called with an `exclude` that is not an array of non-empty strings.** (recoverable)
  - Detection: Input validation in the tool's handler, beside the existing input reads; the closed input schema also declares the field as an array of strings.
  - Response: Return the tool's invalid-input failure without running git.
  - User impact: None for workflow callers, which pass the constant.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Two Stories whose plans were approved in one sweep; the first is built and committed, then the second starts its build. | The second Story's build-start file holds the commit after the first Story's work. Its change log and its review list only its own files. |
| The implement phase is called again for a Story whose build is in progress (a retry, or the next task). | `kept`: the stamp is not moved. |
| A plan-driven Story with three tasks has validated one. A batch approval of the epic approves its BUILD record. Its next implement call arrives with a valid stamp. | `kept`: the record does not cover the plan, so the build is not FINISHED. The next validate's change log still lists the first task's files. |
| The same half-built, approved Story, but with NO valid stamp (it was in flight when the change was installed, or its stamp was judged invalid). | `skipped-work-exists`: the record has a task and is not FINISHED, and approval does not change that. Nothing is written; the base resolves by the existing steps. |
| A Story whose only recorded task failed validation is approved early, then implemented again, with or without a valid stamp. | With a stamp, `kept`; without, `skipped-work-exists`. A recorded task has not passed. |
| A plan-driven Story with every plan task recorded as passed and its BUILD record approved is built again. | `stamped`: the stamp is replaced with the current HEAD and the new change log covers only the rebuild. |
| A Story that has a PLAN but was validated through the standalone route, so its record holds one passed task whose id is the storyId; the record is approved and the Story is built again. | `stamped`: a whole-Story validation counts as covering the plan. |
| A standalone Story (one task, no plan) whose task passed and whose BUILD record was approved is implemented again, for instance to act on code-review findings raised after approval. | `stamped`: approval of a passed build completed the Story, so this is a rebuild. Declared limitation: if the approval was premature, the first pass's files leave the change log on the next validate; they remain in git. |
| An approved Story whose record can never be FINISHED (a task whose passed is not true, or no tasks) is rebuilt. On this repo's history that is about 31 of 72 approved records. | With a valid stamp, `kept`; with none and recorded tasks, `skipped-work-exists`. The rebuild measures from its earlier base, so its change log is a superset that can include other Stories' commits. Declared limitation, in the safe direction: nothing is dropped. Remedy: write or correct the build-start file by hand with the commit the rebuild starts from. |
| A Story is rebuilt a second time after a first rebuild, without its BUILD record being approved again. | `kept`: the record's approvedAt is earlier than the first rebuild's stamp. The second rebuild measures from the first rebuild's start. Declared limitation, same remedy. |
| A Story that was mid-build when this change was installed and has already validated a task: no build-start file, a BUILD record with tasks that is not FINISHED. | `skipped-work-exists`: nothing is written and the base resolves exactly as before the change. |
| A plan-driven or Small Story that was mid-build when this change was installed, with commits but no validate yet: no build-start file and no BUILD record. | `stamped` at the current HEAD, which is after the Story's own commits; nothing on disk distinguishes this from a fresh start. Declared limitation, one-time at upgrade: that Story's change log omits its earlier commits. Remedy: set rangeBase in the build-start file to the right commit by hand, or validate in-flight work before installing. |
| Trivial route, first implement call: no stamp and no BUILD record yet. | The stamp is written first, then the route writes its task-less record. Later calls keep the stamp; a task-less record never triggers the skip rule. |
| The build-start file is committed together with the Story's source. | The BUILD writers remove it by exact path, so the change log is exactly the Story's other files. |
| The build-start file is the only uncommitted change, or is untracked, when validate runs. | The working set is empty after exclusion, so the range from the base is used and lists the Story's committed files. |
| Code review with the Story committed and only an approval-stamped artifact json uncommitted. | The ledger glob removes the json inside git, the working set is empty, and the review covers the Story's files since its base. |
| Code review where the Story changed .insrc/artifacts/templates/x.md and .insrc/conventions/y.md. | Both files are in the reviewed set. |
| Degraded review of a range whose ledger hunks alone exceed the 256 KB body cap and sort before the source hunks. | The ledger hunks are never emitted, so every changed source file gets its diff text. |
| Degraded review with a base, where the Story changed only ledger files. | The range diff succeeds and is empty; that result stands and no fallback runs. Fallback is for failure, not for emptiness. |
| Degraded review with no resolvable base and a clean tree. | The existing last-commit fallback runs, with the ledger exclusions applied. |
| git_diff called with both `path` and `exclude`. | `path` remains the positive pathspec and the exclusions narrow it. |
| A build is stamped, abandoned before any commit or validate, and resumed after other Stories' commits have landed. | The old stamp is kept, so the change set includes those commits. Declared limitation. With no recorded task, deleting the build-start file before resuming gets a fresh stamp. |

**Invariants to preserve**

- An unresolvable base yields an empty change set; the resolver never substitutes HEAD^ or the empty tree. [[c1]]
- With no build-start file, resolveStoryRangeBase returns exactly what it returns today. [[c1]]
- changedFiles applies its exact-path exclusion before the emptiness check and again to the range, and with no excludeGlobs its git_diff inputs are today's. [[c4]]
- The code review can start in every state in which it can start today. [[c5]]
- The batch approval sweep and what it can approve are unchanged. [[c2]]

## 5. Test strategy

**Test framework:** `node:test run through tsx, node:assert/strict`

**Test levels**

- **contract** — The Story carries no enumerated acceptance criteria, so the criteria the acceptance mapping refers to are defined here. Each is a guarantee the build must prove.
  - Subjects: `ac1: a Story's BUILD change log lists only that Story's files, even when its plan was approved in the same sweep as its siblings'`, `ac2: an unresolvable base yields an empty change set; no range is substituted`, `ac3: no state in which a Story's record shows unfinished work, approved or not, moves its base forward onto its own work`, `ac4: no approvable record exists earlier than today, and the build-start file is not approvable and never appears in a change log`, `ac5: the code review measures from the same base and does not review ledger files, on both of its paths, including when ledger hunks exceed the diff cap`, `ac6: user-authored files under .insrc stay reviewable`, `ac7: the code review can start in every state in which it can start today, and every caller that passes no new option behaves exactly as today`
- **unit** — The stamping rules and the resolver's new first step, each against a real temporary git repo.
  - Subjects: `T1 stampBuildStart: no stamp, no BUILD record -> `stamped`; file holds HEAD's full sha and the Story's ids`, `T2 stampBuildStart: valid stamp, HEAD moved, no BUILD record -> `kept`; file bytes unchanged`, `T3 valid stamp, mid-build approval: plan t1,t2,t3; record has t1 passed, approvedAt later than stampedAt -> `kept`; file bytes unchanged`, `T4 valid stamp: record approved after the stamp, its one task has passed false -> `kept`; same with passed absent -> `kept``, `T5 valid stamp: record approved after the stamp but task-less -> `kept``, `T6 valid stamp, finished plan-driven build: plan t1,t2; record has both passed, approvedAt later than stampedAt -> `stamped` at the new HEAD`, `T7 valid stamp, finished standalone build: no PLAN json; record has one passed task, approvedAt later than stampedAt -> `stamped``, `T8 valid stamp, whole-Story validation of a planned Story: plan t1,t2; record has one passed task whose id is the storyId, approved after the stamp -> `stamped``, `T9 valid stamp: record finished, but approvedAt EARLIER than stampedAt -> `kept``, `T10 valid stamp: PLAN json present but malformed, record otherwise finished -> `kept``, `T11 no stamp: UNAPPROVED record with one task -> `skipped-work-exists`, no file`, `T12 no stamp: APPROVED record covering one of three plan tasks -> `skipped-work-exists`, no file`, `T13 no stamp: APPROVED record whose one task has passed false -> `skipped-work-exists`, no file`, `T14 no stamp: finished record -> `stamped``, `T15 no stamp: task-less record, approved or not -> `stamped``, `T16 repo with no commits -> `not-written`, no file; unwritable directory -> `not-written`, no throw`, `T17 invalid stamp (malformed, naming another Story, naming a missing commit) and no recorded tasks -> replaced by a fresh stamp; the same invalid stamps with an unfinished record -> `skipped-work-exists``, `T18 resolveStoryRangeBase: a valid build-start file wins over a different approval-time stamp on the PLAN; a hand-written file with the four fields is accepted`, `T19 resolveStoryRangeBase: malformed, wrong-Story and missing-commit files are ignored and the approval-time stamp is returned`, `T20 resolveStoryRangeBase: no build-start file -> every existing range-base test passes unchanged, including the one asserting undefined when nothing resolves`, `T21 range-base.ts has no runtime import of gates.ts (asserted on the module's import statements, type-only imports excluded)`
  - Fixtures: `mkCleanGitRepo temp repo with at least two commits`, `PLAN json fixtures: with meta.rangeBase, with a task list, malformed`, `BUILD record json fixtures: task-less, one failed task, one task with passed absent, partial against the plan, storyId-task against a plan, complete; each approved and unapproved, before and after the stamp`
- **unit** — git-level exclusion in the git_diff tool and the globs, run against real git so the glob semantics are git's and not a re-implementation.
  - Subjects: `T22 git_diff with `exclude`: an excluded file is absent from BOTH the body and the file list; a kept file is present in both`, `T23 git_diff with no `exclude` and with an empty array: the git argument vectors equal today's (asserted on the argument builders)`, `T24 git_diff with `path` and `exclude` together: the path is still the positive pathspec`, `T25 git_diff with a non-array or empty-string `exclude`: invalid-input, git not run; and the tool's input schema declares `exclude``, `T26 LEDGER_EXCLUDE_GLOBS against one commit touching every location: the exact kept set is [.insrc/artifacts/formats/f.md, .insrc/artifacts/templates/t.json, .insrc/conventions/c.md, .insrc/feedback/fb.md, .insrc/templates/tp.md, docs/epics-notes/n.md, src/a.ts] and the exact dropped set is [.insrc/artifacts/LLD-x.json, .insrc/build-start/x-S001.json, docs/epics/e/S001/LLD.md, docs/standalone/s/S001/BUILD.md]`, `T27 the same globs when git_diff's cwd is a subdirectory of the repo: identical result`, `T28 changedFiles with excludeGlobs: a tree dirty only with an artifact json falls through to the range`, `T29 changedFiles without excludeGlobs: the recorded git_diff inputs equal today's; collectBuildChangeLog passes no excludeGlobs`
  - Fixtures: `temp git repo with the listed files committed in one commit over a base commit`
- **integration** — The defect and the earlier review findings, end to end through the real implement and validate phases and the real approval gate.
  - Subjects: `T30 Two Stories under one epic, plans approved in one batch (the approval rewrite committed). Build and commit Story 1, then implement+commit+validate Story 2: Story 2's BUILD change log is EXACTLY its own files, and Story 1's is exactly its own`, `T31 The same flow with the build-start file committed alongside the Story's source: exact-set change log, build-start file absent`, `T32 The same flow with the build-start file left uncommitted and nothing else dirty: the range is used, exact-set change log`, `T33 Mid-build approval end to end: a plan-driven Story with two tasks implements, commits and validates task 1; a batch approval by epicHash approves its BUILD record; it implements, commits and validates task 2: the change log is EXACTLY the files of task 1 and task 2`, `T34 The same mid-build approval with the build-start file deleted before task 2's implement call: no file is written, and the change log after task 2 equals what the pre-change resolver gives for that Story`, `T35 Rebuild: a Story with every task passed has its BUILD approved; implement again (stamp replaced), commit a new file, validate: the change log is exactly the new file`, `T36 After an implement call on the plan-driven and Small routes no BUILD record exists for the Story; a batch approval by epicHash at that moment approves no BUILD record for it`, `T37 Completion writer with a committed build-start file: exact-set change log`, `T38 A Story with no resolvable base and a clean tree: validate writes an empty change log`
  - Fixtures: `mkCleanGitRepo`, `two PLAN fixtures under one epicHash, one with two tasks`, `the build-step test harness in src/mcp/build-step/__tests__/build-step.test.ts`
- **integration** — The code review measures from the Story's base, never reviews ledger files, and never loses the ability to start.
  - Subjects: `T39 resolveCodeReviewSubject, real changedFiles: Story committed, only an approval-stamped artifact json dirty -> changedFiles is exactly the Story's source files`, `T40 resolveCodeReviewSubject: a Story that edited .insrc/artifacts/templates/t.json -> that file is in changedFiles`, `T41 resolveCodeReviewSubject, real git: the resolved base names a commit that does not exist -> ok is true and changedFiles equals what today's no-option call returns; one warning logged`, `T42 resolveCodeReviewSubject with a changedFiles dep that throws whenever excludeGlobs is passed -> the third attempt is called with no options and its result is returned`, `T43 resolveCodeReviewSubject with a dep that always throws -> `no-build-record`, as today`, `T44 assembleDiffCodeReviewGrounding with real git: a base..HEAD range whose ledger files total more than 256 KB and sort before src/ -> every src file has a pseudo-symbol with non-empty diff text and no ledger path appears; the same fixture WITHOUT excludeGlobs loses src text (shows the test can fail)`, `T45 assembleDiffCodeReviewGrounding: base given and only ledger files changed -> empty result; lastCommitDiff not called`, `T46 assembleDiffCodeReviewGrounding: rangeDiff throws -> the sequence is retried without the base; exclusions throw too -> today's sequence runs with no excludeGlobs argument`, `T47 assembleDiffCodeReviewGrounding: no opts -> the calls made on the deps, including their arguments, equal today's; existing diff-grounding tests pass unchanged`, `T48 beginDiffOnlyReview: the grounding dep receives the Story's resolved base and LEDGER_EXCLUDE_GLOBS`
  - Fixtures: `temp git repo with a generated >256 KB artifact json and docs markdown committed in the range`, `subject and handler test deps that record their arguments and can be made to throw`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `T30`, `T31`, `T32`, `T35`, `T37` |
| `ac2` | `T20`, `T38` |
| `ac3` | `T2`, `T3`, `T4`, `T5`, `T9`, `T10`, `T11`, `T12`, `T13`, `T17`, `T33`, `T34` |
| `ac4` | `T36`, `T31`, `T32`, `T37` |
| `ac5` | `T39`, `T44`, `T45`, `T48`, `T22`, `T28` |
| `ac6` | `T26`, `T27`, `T40` |
| `ac7` | `T41`, `T42`, `T43`, `T46`, `T47`, `T23`, `T29` |

## 6. Migration

**State before:** A Story's base comes from a stamp written when its plan (or standalone LLD) is approved, else from the commit that introduced that artifact (range-base.ts, gates.ts). Stories approved in one sweep share one base, so a later Story's change log lists its siblings' files. The code review does not use a base: its graph path takes the working tree and its degraded path takes the working tree or else the last commit, so an uncommitted approval-stamped artifact json becomes the whole reviewed set (subject.ts, grounding.ts, handler.ts). The git_diff tool cannot exclude paths and its body is capped at 256 KB, which ledger hunks alone can exceed (diff.ts).

**State after:** The implement phase records HEAD in a per-Story build-start file when a Story's build starts. One finished-build test decides every later case: the stamp is replaced only after a build that is approved and finished, and is never written while the record shows unfinished work. The resolver reads that file first and otherwise behaves as today. The BUILD writers exclude the Story's build-start file by exact path. The code review, on both paths, measures from the Story's base and excludes four ledger globs inside git, and falls back step by step to today's derivation if the new one fails. No approvable record is written earlier than today, and the approval sweep is unchanged.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the optional `exclude` input to the git_diff tool (handler and closed input schema), applied as git exclude pathspecs to both its body and numstat commands; with the input absent or empty the argument vectors are today's. — ↩ rollbackable
2. Add the `excludeGlobs` option to changedFiles and export the ledger glob constant beside it; no existing caller passes the option. — ↩ rollbackable
3. Add the build-start path helper, the shared stamp reader, the finished-build test and stampBuildStart to range-base.ts, and make the resolver consult a valid build-start file first. — ↩ rollbackable
4. Call stampBuildStart from the implement phase on each admitted route, fail-open, before the Trivial route's record write. — ↩ rollbackable
5. Add the Story's build-start path to the exact-path exclusion list in the validate phase and the completion writer. — ↩ rollbackable
6. Make the review subject resolver pass the Story's base and the ledger globs with its three-step fallback; add the base and globs options and the same fallback to the diff grounding, and pass them from the degraded review path. — ↩ rollbackable
7. Add the tests in the test strategy; confirm each new assertion fails when its production change is reverted. — ↩ rollbackable

**Backward compat:** Every changed signature is additive and optional: git_diff's `exclude`, changedFiles' `excludeGlobs`, the grounding's third parameter and the widened test seams. Callers that pass nothing get today's behaviour. No existing artifact is rewritten and no stored field changes meaning. A Story with no build-start file resolves its base exactly as today; that covers everything built before this change and any build in flight whose record shows unfinished work. Declared limitations: (1) a plan-driven or Small Story in flight at install with commits but no validate yet has no BUILD record, so its next implement call stamps the current HEAD and its change log omits its earlier commits; (2) an approved Story whose record is not finished (a task not passed, or no tasks; about 31 of this repo's 72 approved records) keeps its earlier base when rebuilt, so that rebuild's change log is a superset; (3) a finished single-task Story reworked after approval is treated as a rebuild; (4) a second rebuild without re-approval measures from the first rebuild's start; (5) a review that falls back says so only in the log. For (1), (2) and (4) the remedy is to write or correct rangeBase in the Story's build-start file by hand. Reverting the code leaves build-start files on disk as inert json that nothing reads. The intended behaviour change for existing users: a code review no longer lists files under docs/epics, docs/standalone, .insrc/build-start or the json files directly inside .insrc/artifacts, and when a Story's base resolves it reviews the Story's range rather than only the last commit.

## 7. Alternatives considered

### 7.1 a1: Strict finished-build test, applied whether or not a stamp exists; records that cannot pass it are declared — **CHOSEN**

One finished-build test decides every stamping case; it stays strict so the base only ever errs toward staying put, and the approved records it can never pass are a declared limitation with a manual remedy.

Keep the build-start file, the BUILD writers' exact-path exclusion, the git-level ledger exclusion and the review's three-step fallback. One test, `finished`, is true when the BUILD record is approved, has at least one task, every task has passed === true, and (when a PLAN exists) either every plan task id is recorded or the record holds a task whose id is the storyId (a whole-Story validation through the standalone route). The stamper uses it in both branches: with a valid stamp, replace it only when finished and approved after the stamp; with no valid stamp, write nothing when the record has tasks and is not finished, whether or not it is approved. Approved records that are not finished (a task not passed, or no tasks) never trigger a re-stamp; that is declared, with the remedy of setting rangeBase by hand.

### 7.2 a2: Relaxed test: approval alone means finished, apart from plan coverage

Drop the passed requirement; an approved record that covers its plan is finished.

Same as a1, but `finished` ignores `passed`: approved, at least one task, and plan coverage. Approval is treated as the human's completion act.

**Rejected because:** Better rebuild coverage, bought by breaking the invariant the issue asks to preserve.

### 7.3 a3: Never replace a stamp automatically

Stamp once per Story; rebuilds keep the original starting point.

Same carrier and review changes, but no finished-build test at all: a valid stamp is never replaced and a Story with any recorded task and no stamp is never stamped.

**Rejected because:** Reintroduces the Story's defect for every rebuild.

## 8. References

- **[[c1]]** `code` `src/workflow/runners/build/range-base.ts` — "export function resolveStoryRangeBase(repoPath: string, epicHash: string, storyId: string): string | undefined {"
- **[[c2]]** `code` `src/workflow/gates.ts` — "const re = new RegExp(`^(DEF|HLD|LLD|PLAN|BUILD)-${epicHash}(-.*)?\\.json$`);"
- **[[c3]]** `code` `src/mcp/build-step/phases/implement.ts` — "function handleStandaloneImplement("
- **[[c4]]** `code` `src/workflow/runners/build/changed-files.ts` — "export async function changedFiles(repoPath: string, opts?: ChangedFilesOptions): Promise<readonly string[]> {"
- **[[c5]]** `code` `src/workflow/code-review/subject.ts` — "changedFiles = await deps.changedFiles(repoPath);"
- **[[c6]]** `code` `src/workflow/code-review/grounding.ts` — "export async function assembleDiffCodeReviewGrounding("
- **[[c7]]** `code` `src/mcp/code-review-step/handler.ts` — "const diff = await deps.assembleDiffGrounding(repo);"
- **[[c8]]** `code` `src/daemon/tools/builtins/git/diff.ts` — "const files = stat.code === 0 ? parseNumstat(stat.stdout) : [];"
- **[[c9]]** `code` `src/workflow/runners/build/standalone-record.ts` — "export interface BuildRecordTask {"
- **[[c10]]** `code` `src/mcp/build-step/phases/validate.ts` — "tasks: [{ id: taskId, passed }],"
- **[[c11]]** `prior-artifact` `ISSUE-5f7a7cb95b643ae5`
- **[[c12]]** `stakeholder` `user decisions, 2026-10-04` — "fix the design"
- **[[c13]]** `step-output` `s1`
- **[[c14]]** `step-output` `s3`

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.story (design.story)

**0 HIGH · 1 MED · 5 LOW** · model `client` · reviewed 2026-10-04T14:29:48.461Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| 6 backward compat (1)-(5) / 4 edge rows 9 and 12 | inventory | MED | assisted | The declared limitations are complete and accurately counted: the only state that stamps HEAD after a Story's own commits is a plan-driven or Small Story in flight at install with no BUILD record, and the approved records that can never be FINISHED are those with a task not passed or with no tasks, about 31 of this repo's 72 approved records. | The list is neither complete nor correctly counted, though the behaviour behind it is as designed. (a) Count and category. A read-only recount of this repo's 72 approved BUILD records under the revised rule gives 38 FINISHED and 34 not: 26 with a task not passed, 5 with no tasks, and 3 whose tasks all passed but cover only part of their PLAN and hold no story-id task (BUILD-61d8c73edb68041a-s3, -s4 and -s5, each recording only its last plan task). The artifact says 'a task not passed, or no tasks; about 31'. The third category is missing and the figure is 34. The six-record group in my previous report was three story-id records, which the new clause admits, and these three, which it does not; that report described all six as the story-id kind, which was wrong. (b) The stamp-after-own-commits class is wider than limitation (1). The limitation names a plan-driven or Small Story in flight at install with no BUILD record. The same outcome is reached on the Trivial route, where implement writes a task-less record (implement.ts:133, :139) and 'a task-less record' is in the stamp-anyway list; and at any time, not only at install, when a Story has commits but no recorded task and its stamp is judged invalid or has been deleted, which the error table describes as 'the stamp heals at the next build start'. | Correct the figure and add the partial-plan category to limitation (2) and its edge row; widen limitation (1) to 'no valid stamp, no recorded task, commits already landed', covering the Trivial route and an invalidated or deleted stamp. |
| 2.2 postconditions | closed-union | LOW | manual | With the single FINISHED test used in both branches, no state in which the Story's BUILD record shows unfinished work (at least one task and not FINISHED), approved or not, causes stampBuildStart to write HEAD into the stamp. | Traced through both branches against the reads. The sweep can approve any record (gates.ts:700, :788), so approval carries no information about completeness; the revised rule no longer leans on it. A record with a task is written only by validate (validate.ts:234), tasks accumulate by union (standalone-record.ts:349) and a prior approvedAt is kept (:364). Valid stamp: replaced only when FINISHED and approved after the stamp, so a partial, failed or task-less record keeps it. No valid stamp: a record with at least one task that is not FINISHED writes nothing, approved or not, which closes the approved-partial state from the last review. I found no state in which a record that shows unfinished work leads to a write. The statement is scoped to what the record shows, and it holds as scoped. | none — verified sound |
| 2.2 / 4 edge row 7 | semantic | LOW | manual | A BUILD record holding a task whose id equals the storyId is a whole-Story validation through the standalone route, so it can stand in for plan coverage. | validate.ts:117-123 is the standalone branch: it renders the standalone validate prompt for the Story and passes the story id as the task id, which :234 records. Plan-driven task ids are the bare tN form (resolve.ts:438) and story ids are sN or S001, so a task id can equal the story id only through the standalone branch. The clause therefore identifies a standalone-route validation correctly. Two things it cannot tell apart, both worth a sentence in the design: because tasks merge by union (standalone-record.ts:349), a record holding a plan task and a story-id task together also satisfies it; and a standalone validate that was run before the Story's last task still records the story id. A read-only scan of this repo's records found no mixed record, and three approved records that the clause newly admits. | none — verified sound (optional: say that the clause trusts a passed standalone verdict to mean the whole Story) |
| 3.1 / remedy | semantic | LOW | manual | A hand-written or hand-corrected build-start file with the four fields, naming this Story and an existing commit, is accepted by the shared reader and then left alone by stampBuildStart, so it works as the remedy for limitations (1), (2) and (4). | The existing helpers the new reader is modelled on check a string field (range-base.ts:66) and a 40-hex sha (:80), and the design's reader adds the Story match and a commit-exists check, so a hand-written file with the four fields is accepted. I then walked each remedy through the stamping rule. Limitation (1), no record: valid stamp, not FINISHED, kept. Limitation (2), a record that can never be FINISHED: kept in every later call. Limitation (4), a FINISHED record approved before the first rebuild's stamp: kept as long as the file's stampedAt stays later than the record's approvedAt. That last condition is the one thing the design does not say: a hand-edited file whose stampedAt is set earlier than approvedAt on a FINISHED record is replaced at the next implement call. The design also does not say what the reader does with an unparseable stampedAt. | none — verified sound (state that a hand edit should leave stampedAt at the time of the edit, and how an unparseable stampedAt is treated) |
| 5 T34 | ordering | LOW | manual | T34 is coherent: after a mid-build batch approval with the build-start file deleted, the next implement writes no file, and the validate's change log is what today's resolution gives (the approval-time base on the PLAN), with the deleted build-start path excluded by the BUILD writers. | The expectation is coherent. With the file deleted, the record holds task 1 and does not cover the two-task plan, so the no-valid-stamp branch writes nothing. The resolver then falls to its first existing step (range-base.ts:96), the approval-time base stamped at gates.ts:607. If the file had been committed, its deletion is a working-tree change, but the BUILD writers exclude that path before the emptiness check (changed-files.ts:104, with the path added beside validate.ts:250) and from the range (:113), so the range is used. One note on the assertion: 'equals what the pre-change resolver gives' is a relative expectation where the neighbouring tests assert exact sets. The range from the approval-time base also contains the approval rewrite the fixture commits (gates.ts:618 writes the PLAN json after the base was read), and the BUILD writers do not exclude ledger files, so the exact set is both tasks' files plus those committed PLAN jsons. | none — verified sound (optional: state T34's expected set exactly) |
| 3.4 / c9 / c10 | citation | LOW | manual | The current-code statements in 3.4 hold: validate records one task per call with passed true only when the verdict says so; passed is optional on the type; the merge unions tasks by id and keeps a prior approvedAt; and approval does not inspect tasks. | validate.ts:165 sets passed from the verdict and :234 records one task; standalone-record.ts:35-37 declare the task with an optional passed; :349 unions tasks and :364 keeps a prior approvedAt; gates.ts:592-610 stamp approvedAt without reading the body. Each statement in section 3.4 matches, and c9 and c10 quote their lines verbatim. | none — verified sound |

#### Proposed fixes

- **6 backward compat (1)-(5) / 4 edge rows 9 and 12** (assisted) — A reader relying on the limitations list would miss three records in this repo and two routes into the declared class; nothing about the design changes.
  - option: Reword (2) to 'a task not passed, no tasks, or tasks that do not cover the plan; 34 of this repo's 72 approved records' and (1) to cover any route and any time the stamp is absent or invalid while commits exist and no task is recorded
  - option: Keep the wording and add the two omissions as separate rows in the edge table
