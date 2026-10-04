<!-- insrc:artifact LLD-5f7a7cb95b643ae5-S001 -->

# LLD: E202610045f7a7cb9:S001

## Summary

**Epic:** `batch-approval-stamps-one-shared-meta`
**HLD base run:** `wf-1791123201298-2a2306`
**HLD effective hash:** `0101722b7dd1...`

A Story's change set is measured from a starting commit. Today that commit is recorded when the plan is approved, so Stories approved together share one starting point and a later Story's record lists its siblings' files. This design records the starting commit when the Story's build begins, in a small file that cannot be approved or mistaken for the Story's work, and moves it only after that build is both approved and complete. The code review measures from the same commit and leaves the workflow's own record files out of what it reviews, and if that new measurement fails it falls back to what it does today.

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

**Returns:** `'stamped' | 'kept' | 'skipped-work-exists' | 'not-written'` — `stamped`: the file now holds HEAD's full sha. `kept`: a valid stamp exists and the previous build is not finished, so it was left alone. `skipped-work-exists`: no valid stamp exists but the Story already has an unapproved BUILD record with at least one task, so HEAD may already contain its work and nothing was written. `not-written`: HEAD could not be resolved or the file could not be written; nothing was written.

**Preconditions:**
- New function in src/workflow/runners/build/range-base.ts, beside the resolver. Synchronous. Never throws.
- It reads the Story's BUILD record json and PLAN json directly from .insrc/artifacts, the way the module's existing stampedBase helper reads an artifact, and does not import src/workflow/gates.ts (that would be an import cycle through completion-record.ts).

**Postconditions:**
- A valid existing stamp is replaced only when the previous build is FINISHED, which requires all of: the BUILD record's approvedAt is later than the stamp's stampedAt; the record has at least one task; every recorded task has passed === true; and, when a PLAN json exists for the Story, every task id in the plan's body.tasks is among the record's task ids.
- When a PLAN json exists but cannot be read or parsed, the previous build counts as not finished and the stamp is kept.
- A BUILD record approved while the plan still has unbuilt tasks, or while a recorded task has not passed, never causes a re-stamp.
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

One small json file per Story: { epicHash, storyId, rangeBase (40-hex commit sha), stampedAt (ISO time) }. Written by stampBuildStart from the implement phase on every admitted route (plan-driven, Small, and Trivial before its record write); the call is fail-open, so a stamping problem never blocks a build. It is not an artifact: it has no artifact id, sits outside .insrc/artifacts, and the approval sweep cannot see it. It is a plain tracked file, so it may be committed with the Story's work, and a person can correct its rangeBase by hand.

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

No field is added or changed. New reader: stampBuildStart reads BuildRecord.meta.approvedAt and body.tasks[].{id, passed}, and the PLAN's body.tasks[].id, to decide whether the previous build is finished. Current behaviour relied on: the validate phase records one task per call with the plan task's id (plan-driven) or the storyId (standalone), and the record merge keeps earlier tasks and the approval stamp.

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
  - Response: The resolver ignores it with a warning and continues with the existing steps. The stamper treats it as absent, so a fresh stamp replaces it unless the in-flight-build skip rule applies.
  - User impact: A log line; a corrupt stamp heals at the next build start.
- **The commit named in the build-start file no longer exists in the repo (history rewritten and pruned).** (recoverable)
  - Detection: The shared reader runs `git cat-file -e <sha>^{commit}`; a non-zero exit marks the stamp invalid.
  - Response: Treated exactly like a malformed stamp.
  - User impact: The base falls to the approval-time stamp or the introducing commit, which may be wider. This is today's behaviour for such a repo.
- **The PLAN json exists but cannot be read or parsed when the stamper checks whether the previous build is finished.** (recoverable)
  - Detection: The read or JSON.parse inside the stamper's completeness check throws, or body.tasks is not an array of objects with string ids; the check catches this.
  - Response: The previous build counts as not finished; the stamp is kept.
  - User impact: A rebuild of that Story keeps its old starting point until the plan is readable. The base never moves forward on doubtful evidence.
- **On the review's graph path, the diff from the Story's base fails (the approval-time stamp names a commit git cannot resolve), or git rejects the exclusion pathspecs.** (recoverable)
  - Detection: git_diff's BODY command exits non-zero, the tool returns a failure, and changedFiles throws NoBuildChangesError; resolveCodeReviewSubject catches it. A failing numstat command alone is not detected (the tool swallows it into an empty list), but the same pathspecs go to both commands, so a rejected pathspec or range fails the body too.
  - Response: Step down: retry with the exclusions and no base; if that throws, make today's call with no options. Log a warning at each step. Only a failure of today's call yields `no-build-record`.
  - User impact: The review starts. In the fallback it reviews what it reviews today (the working tree, ledger files included) instead of the Story's range.
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
| A plan-driven Story with three tasks has validated one. Someone batch-approves the epic to approve a sibling's plan, which also approves this Story's BUILD record. The Story's next implement call arrives. | `kept`: the record is approved after the stamp, but the plan's other two task ids are not in the record, so the build is not finished. The base stays before the Story's first task and the next validate's change log still lists the first task's files. |
| A Story whose only recorded task failed validation is approved early, then implemented again. | `kept`: a recorded task has not passed. |
| A plan-driven Story with every plan task recorded as passed and its BUILD record approved is built again. | `stamped`: the stamp is replaced with the current HEAD and the new change log covers only the rebuild. |
| A standalone Story (one task, no plan) whose task passed and whose BUILD record was approved is implemented again, for instance to act on code-review findings raised after approval. | `stamped`: by the workflow's own definition approval of the BUILD record completed the Story, so this is a rebuild. The earlier files leave the change log on the next validate. Declared limitation: if the approval was premature, the first pass's files are lost from the record; they remain in git. |
| A Story is rebuilt a second time after a first rebuild, without its BUILD record being approved again. | `kept`: the record's approvedAt is earlier than the first rebuild's stamp. The second rebuild measures from the first rebuild's start. Declared limitation. |
| A Story that was mid-build when this change was installed and has already validated a task: no build-start file, an unapproved BUILD record with tasks. | `skipped-work-exists`: nothing is written and the base resolves exactly as before the change. |
| A plan-driven or Small Story that was mid-build when this change was installed, with commits but no validate yet: no build-start file and no BUILD record. | `stamped` at the current HEAD, which is after the Story's own commits; nothing on disk distinguishes this from a fresh start. Declared limitation, one-time at upgrade: that Story's change log omits its earlier commits. Remedy: set rangeBase in the build-start file to the right commit by hand. |
| Trivial route, first implement call: no stamp and no BUILD record yet. | The stamp is written first, then the route writes its task-less record. Later calls keep the stamp; the task-less record never triggers the skip rule. |
| The build-start file is committed together with the Story's source. | The BUILD writers remove it by exact path, so the change log is exactly the Story's other files. |
| The build-start file is the only uncommitted change, or is untracked, when validate runs. | The working set is empty after exclusion, so the range from the base is used and lists the Story's committed files. |
| Code review with the Story committed and only an approval-stamped artifact json uncommitted. | The ledger glob removes the json inside git, the working set is empty, and the review covers the Story's files since its base. |
| Code review where the Story changed .insrc/artifacts/templates/x.md and .insrc/conventions/y.md. | Both files are in the reviewed set. |
| Degraded review of a range whose ledger hunks alone exceed the 256 KB body cap and sort before the source hunks. | The ledger hunks are never emitted, so every changed source file gets its diff text. |
| Degraded review with a base, where the Story changed only ledger files. | The range diff succeeds and is empty; that result stands and no fallback runs. Fallback is for failure, not for emptiness. |
| Degraded review with no resolvable base and a clean tree. | The existing last-commit fallback runs, with the ledger exclusions applied. |
| git_diff called with both `path` and `exclude`. | `path` remains the positive pathspec and the exclusions narrow it. |
| A build is stamped, abandoned before any commit, and resumed after other Stories' commits have landed. | The old stamp is kept, so the change set includes those commits. Declared limitation; deleting the build-start file before resuming resets it. |

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
  - Subjects: `ac1: a Story's BUILD change log lists only that Story's files, even when its plan was approved in the same sweep as its siblings'`, `ac2: an unresolvable base yields an empty change set; no range is substituted`, `ac3: nothing moves a Story's base forward onto its own work, in particular not an approval that arrives mid-build`, `ac4: no approvable record exists earlier than today, and the build-start file is not approvable and never appears in a change log`, `ac5: the code review measures from the same base and does not review ledger files, on both of its paths, including when ledger hunks exceed the diff cap`, `ac6: user-authored files under .insrc stay reviewable`, `ac7: the code review can start in every state in which it can start today, and every caller that passes no new option behaves exactly as today`
- **unit** — The stamping rules and the resolver's new first step, each against a real temporary git repo.
  - Subjects: `T1 stampBuildStart: no stamp, no BUILD record -> `stamped`; file holds HEAD's full sha and the Story's ids`, `T2 stampBuildStart: valid stamp, HEAD moved, no BUILD record -> `kept`; file bytes unchanged`, `T3 stampBuildStart, mid-build approval: plan with tasks t1,t2,t3; record has t1 passed and approvedAt later than stampedAt -> `kept`; file bytes unchanged`, `T4 stampBuildStart: record approved after the stamp but its one task has passed false -> `kept``, `T5 stampBuildStart: record approved after the stamp but task-less -> `kept``, `T6 stampBuildStart, finished plan-driven build: plan tasks t1,t2; record has both passed and approvedAt later than stampedAt -> `stamped` at the new HEAD`, `T7 stampBuildStart, finished standalone build: no PLAN json; record has one passed task and approvedAt later than stampedAt -> `stamped``, `T8 stampBuildStart: record complete and approved, but approvedAt EARLIER than stampedAt -> `kept``, `T9 stampBuildStart: PLAN json present but malformed, record complete and approved -> `kept``, `T10 stampBuildStart: no stamp and an unapproved BUILD record with one task -> `skipped-work-exists`, no file`, `T11 stampBuildStart: no stamp and a task-less BUILD record -> `stamped``, `T12 stampBuildStart: repo with no commits -> `not-written`, no file; unwritable directory -> `not-written`, no throw`, `T13 stampBuildStart: malformed file, file naming another Story, file naming a missing commit -> replaced by a fresh stamp`, `T14 resolveStoryRangeBase: a valid build-start file wins over a different approval-time stamp on the PLAN`, `T15 resolveStoryRangeBase: malformed, wrong-Story and missing-commit files are ignored and the approval-time stamp is returned`, `T16 resolveStoryRangeBase: no build-start file -> every existing range-base test passes unchanged, including the one asserting undefined when nothing resolves`, `T17 range-base.ts does not import gates.ts (asserted on the module's import statements)`
  - Fixtures: `mkCleanGitRepo temp repo with at least two commits`, `PLAN json fixtures: with meta.rangeBase, with a task list, malformed`, `BUILD record json fixtures: task-less, one failed task, partial against the plan, complete, approved before and after the stamp`
- **unit** — git-level exclusion in the git_diff tool and the globs, run against real git so the glob semantics are git's and not a re-implementation.
  - Subjects: `T18 git_diff with `exclude`: an excluded file is absent from BOTH the body and the file list; a kept file is present in both`, `T19 git_diff with no `exclude` and with an empty array: the git argument vectors equal today's (asserted on the argument builders)`, `T20 git_diff with `path` and `exclude` together: the path is still the positive pathspec`, `T21 git_diff with a non-array or empty-string `exclude`: invalid-input, git not run; and the tool's input schema declares `exclude``, `T22 LEDGER_EXCLUDE_GLOBS against one commit touching every location: the exact kept set is [.insrc/artifacts/formats/f.md, .insrc/artifacts/templates/t.json, .insrc/conventions/c.md, .insrc/feedback/fb.md, .insrc/templates/tp.md, docs/epics-notes/n.md, src/a.ts] and the exact dropped set is [.insrc/artifacts/LLD-x.json, .insrc/build-start/x-S001.json, docs/epics/e/S001/LLD.md, docs/standalone/s/S001/BUILD.md]`, `T23 the same globs when git_diff's cwd is a subdirectory of the repo: identical result`, `T24 changedFiles with excludeGlobs: a tree dirty only with an artifact json falls through to the range`, `T25 changedFiles without excludeGlobs: the recorded git_diff inputs equal today's; collectBuildChangeLog passes no excludeGlobs`
  - Fixtures: `temp git repo with the listed files committed in one commit over a base commit`
- **integration** — The defect and the earlier review findings, end to end through the real implement and validate phases and the real approval gate.
  - Subjects: `T26 Two Stories under one epic, plans approved in one batch (the approval rewrite committed). Build and commit Story 1, then implement+commit+validate Story 2: Story 2's BUILD change log is EXACTLY its own files, and Story 1's is exactly its own`, `T27 The same flow with the build-start file committed alongside the Story's source: exact-set change log, build-start file absent`, `T28 The same flow with the build-start file left uncommitted and nothing else dirty: the range is used, exact-set change log`, `T29 Mid-build approval end to end: a plan-driven Story with two tasks implements, commits and validates task 1; a batch approval by epicHash approves its BUILD record; it implements, commits and validates task 2: the change log is EXACTLY the files of task 1 and task 2`, `T30 Rebuild: a Story with every task passed has its BUILD approved; implement again (stamp replaced), commit a new file, validate: the change log is exactly the new file`, `T31 After an implement call on the plan-driven and Small routes no BUILD record exists for the Story; a batch approval by epicHash at that moment approves no BUILD record for it`, `T32 Completion writer with a committed build-start file: exact-set change log`, `T33 A Story with no resolvable base and a clean tree: validate writes an empty change log`
  - Fixtures: `mkCleanGitRepo`, `two PLAN fixtures under one epicHash, one with two tasks`, `the build-step test harness in src/mcp/build-step/__tests__/build-step.test.ts`
- **integration** — The code review measures from the Story's base, never reviews ledger files, and never loses the ability to start.
  - Subjects: `T34 resolveCodeReviewSubject, real changedFiles: Story committed, only an approval-stamped artifact json dirty -> changedFiles is exactly the Story's source files`, `T35 resolveCodeReviewSubject: a Story that edited .insrc/artifacts/templates/t.json -> that file is in changedFiles`, `T36 resolveCodeReviewSubject, real git: the resolved base names a commit that does not exist -> ok is true and changedFiles equals what today's no-option call returns; one warning logged`, `T37 resolveCodeReviewSubject with a changedFiles dep that throws whenever excludeGlobs is passed -> the third attempt is called with no options and its result is returned`, `T38 resolveCodeReviewSubject with a dep that always throws -> `no-build-record`, as today`, `T39 assembleDiffCodeReviewGrounding with real git: a base..HEAD range whose ledger files total more than 256 KB and sort before src/ -> every src file has a pseudo-symbol with non-empty diff text and no ledger path appears; the same fixture WITHOUT excludeGlobs loses src text (shows the test can fail)`, `T40 assembleDiffCodeReviewGrounding: base given and only ledger files changed -> empty result; lastCommitDiff not called`, `T41 assembleDiffCodeReviewGrounding: rangeDiff throws -> the sequence is retried without the base; exclusions throw too -> today's sequence runs with no excludeGlobs argument`, `T42 assembleDiffCodeReviewGrounding: no opts -> the calls made on the deps, including their arguments, equal today's; existing diff-grounding tests pass unchanged`, `T43 beginDiffOnlyReview: the grounding dep receives the Story's resolved base and LEDGER_EXCLUDE_GLOBS`
  - Fixtures: `temp git repo with a generated >256 KB artifact json and docs markdown committed in the range`, `subject and handler test deps that record their arguments and can be made to throw`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `T26`, `T27`, `T28`, `T30`, `T32` |
| `ac2` | `T16`, `T33` |
| `ac3` | `T2`, `T3`, `T4`, `T5`, `T8`, `T9`, `T10`, `T29` |
| `ac4` | `T31`, `T27`, `T28`, `T32` |
| `ac5` | `T34`, `T39`, `T40`, `T43`, `T18`, `T24` |
| `ac6` | `T22`, `T23`, `T35` |
| `ac7` | `T36`, `T37`, `T38`, `T41`, `T42`, `T19`, `T25` |

## 6. Migration

**State before:** A Story's base comes from a stamp written when its plan (or standalone LLD) is approved, else from the commit that introduced that artifact (range-base.ts, gates.ts). Stories approved in one sweep share one base, so a later Story's change log lists its siblings' files. The code review does not use a base: its graph path takes the working tree and its degraded path takes the working tree or else the last commit, so an uncommitted approval-stamped artifact json becomes the whole reviewed set (subject.ts, grounding.ts, handler.ts). The git_diff tool cannot exclude paths and its body is capped at 256 KB, which ledger hunks alone can exceed (diff.ts).

**State after:** The implement phase records HEAD in a per-Story build-start file when a Story's build starts, and replaces it only after a build that is both approved and complete. The resolver reads that file first and otherwise behaves as today. The BUILD writers exclude the Story's build-start file by exact path. The code review, on both paths, measures from the Story's base and excludes four ledger globs inside git, and falls back step by step to today's derivation if the new one fails. No approvable record is written earlier than today, and the approval sweep is unchanged.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the optional `exclude` input to the git_diff tool (handler and closed input schema), applied as git exclude pathspecs to both its body and numstat commands; with the input absent or empty the argument vectors are today's. — ↩ rollbackable
2. Add the `excludeGlobs` option to changedFiles and export the ledger glob constant beside it; no existing caller passes the option. — ↩ rollbackable
3. Add the build-start path helper, the shared stamp reader, the finished-build check and stampBuildStart to range-base.ts, and make the resolver consult a valid build-start file first. — ↩ rollbackable
4. Call stampBuildStart from the implement phase on each admitted route, fail-open, before the Trivial route's record write. — ↩ rollbackable
5. Add the Story's build-start path to the exact-path exclusion list in the validate phase and the completion writer. — ↩ rollbackable
6. Make the review subject resolver pass the Story's base and the ledger globs with its three-step fallback; add the base and globs options and the same fallback to the diff grounding, and pass them from the degraded review path. — ↩ rollbackable
7. Add the tests in the test strategy; confirm each new assertion fails when its production change is reverted. — ↩ rollbackable

**Backward compat:** Every changed signature is additive and optional: git_diff's `exclude`, changedFiles' `excludeGlobs`, the grounding's third parameter and the widened test seams. Callers that pass nothing get today's behaviour. No existing artifact is rewritten and no stored field changes meaning. A Story with no build-start file resolves its base exactly as today; that covers everything built before this change and any build in flight that has already validated a task. One class of in-flight build is NOT preserved and is a declared limitation: a plan-driven or Small Story with commits but no validate yet has no BUILD record, so its next implement call stamps the current HEAD and its change log omits its earlier commits; the remedy is to correct rangeBase in its build-start file by hand, or to validate in-flight work before installing the change. Reverting the code leaves build-start files on disk as inert json that nothing reads. The intended behaviour change for existing users: a code review no longer lists files under docs/epics, docs/standalone, .insrc/build-start or the json files directly inside .insrc/artifacts, and when a Story's base resolves it reviews the Story's range rather than only the last commit.

## 7. Alternatives considered

### 7.1 a1: Build-start file; re-stamp only after an approved AND complete build; review falls back to today's derivation on any failure — **CHOSEN**

The third revision's design, with the re-stamp rule tightened to require a complete build and the review guarded so it can never fail to start in a way it cannot today.

Keep the non-approvable build-start file, the BUILD writers' exact-path exclusion of it, and the git-level exclusion of four ledger globs from the review. Change two things. (1) A valid stamp is replaced only when the Story's BUILD record is approved after the stamp was taken AND the build is complete: the record has at least one task, every recorded task passed, and, when the Story has a plan, every task id in the plan is among the recorded tasks. A record approved while tasks remain is therefore kept. (2) On both review paths, if the new derivation (base plus exclusions) fails, log a warning and run today's derivation unchanged, so the review has no new failure mode.

### 7.2 a2: Never replace a stamp automatically

Stamp once per Story and keep it for the Story's life; a rebuild keeps the original starting point.

Same carrier and review changes as a1, but stampBuildStart never replaces a valid stamp. The base can then never move forward for any reason. A Story rebuilt after completion reports everything since its first build started.

**Rejected because:** Strongest on never moving the base, but reintroduces the Story's own defect for rebuilds.

### 7.3 a3: Close the early-approval hole in the sweep instead

Keep the approved-means-finished rule and stop the batch sweep approving a BUILD record whose Story has tasks left.

Same carrier and review changes as a1. Keep the third revision's re-stamp rule unchanged and instead change the batch approval sweep to skip a BUILD record that does not cover its plan's tasks.

**Rejected because:** Leaves the stamp rule exposed to approval by path and reaches outside the Story.

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

**0 HIGH · 2 MED · 6 LOW** · model `client` · reviewed 2026-10-04T14:21:12.985Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| 2.2 postcondition 1 / 3.4 | semantic | MED | assisted | A finished build is recognisable from the records: an approved BUILD record of a completed Story has at least one task, every recorded task has passed === true, and when a PLAN exists every plan task id is among the record's task ids. | The code allows what the rule assumes away. validate.ts:165 records passed as true only when the verdict says so, :234 stores it per task, and the validate prompt tells the judge 'If you are unsure, fail' (validate-task.md:42); BuildRecordTask.passed is optional (standalone-record.ts:37); the completion writer contributes no tasks (completion-record.ts:63). Nothing stops a BUILD record with a failed or unset task from being approved. I checked the rule against the records on disk in this repo (read-only script over .insrc/artifacts): of 72 approved BUILD records, 35 satisfy the finished rule and 37 do not: 26 have at least one task whose passed is not true, 6 have all tasks passed but do not cover their PLAN's task ids (a Story that has a PLAN but was built through the standalone route records the story id, e.g. PLAN t1..t5 against a record holding 'S001'), and 5 have no tasks. So about half of the Stories this repo treats as complete would never count as finished. The failure direction is safe for the base (the stamp is kept, never moved onto the Story's work), but a later rebuild of such a Story keeps its first build's starting point and its change log lists everything since, which is the outcome the design rejects alternative a2 for. | Decide what 'finished' means given that approved records with non-passed tasks are common: relax the passed requirement, or keep it and add the never-re-stamps case to the declared limitations with its remedy (delete or edit the build-start file). |
| 2.2 / ac3 | closed-union | MED | assisted | With the finished-build rule, no state remains in which stampBuildStart writes HEAD for a Story whose own work is already committed, other than the limitations the edge table declares. | One state is not named. The finished check guards only the REPLACEMENT of a valid stamp. With no valid stamp the rules are: skip when the BUILD record is unapproved and has a task, otherwise stamp. A Story whose record has tasks, is not finished, and IS approved falls through to 'stamp' at the current HEAD, after its own commits. The sweep produces exactly that record: gates.ts:700 lists every unapproved record and :783-788 approve each, so a mid-build Story is approved whenever a sibling is batch-approved. It then needs only to have no valid stamp: it was in flight when the change was installed, or its stamp was judged invalid (malformed, or its commit pruned), which the error table says is 'replaced by a fresh stamp unless the skip rule applies'. The design's own edge rows cover in-flight with an UNAPPROVED record (skipped) and in-flight with NO record (declared limitation), not in-flight with an approved partial record. | Either apply the same finished test on the no-stamp path (skip when the record has tasks and is not finished, whether or not it is approved), or add this state to the declared limitations. |
| 3.4 | semantic | LOW | manual | On the plan-driven route validate records the plan task's id, which is in the same id space as the PLAN's body.tasks[].id; on the standalone route it records the storyId; and the record merge keeps earlier tasks and the approval stamp. | resolve.ts:438 derives the task id with ordinalToTaskId, the bare form (t1, t2), and the PLAN files on disk use the same form in body.tasks[].id, so the id spaces match on the plan-driven route. validate.ts:234 writes one task per call. standalone-record.ts:349 unions prior and new tasks by id and :372 writes the union; :364 keeps a prior approvedAt. The merge does keep earlier tasks. The one mismatch is not in the id space but in the route: a Story with a PLAN that is validated through the standalone branch records the story id (see v1). | none — verified sound |
| 2.7 / 2.8 / ac7 | ordering | LOW | manual | The three-step fallback on both review paths means the review can start in every state in which it can start today, and a failure of the new derivation is distinguishable from a clean result. | Today's only failure paths are the ones cited: changed-files.ts:69 throws, subject.ts:100 maps it to no-build-record, handler.ts:248 turns that into no-subject; grounding.ts:272 throws on the degraded path. With attempt 3 being today's exact call, the review declines only where it declines today, so the earlier finding is resolved and no existing caller receives a new failure. On masking: a step down is recorded as a log warning only. The subject and the response carry nothing that says the range or the exclusion was abandoned, so a review that fell back to the working tree (ledger files included) or to the last commit looks the same to the controller as one scoped to the Story. That is no worse than today's behaviour, and the design does not claim otherwise. | none — verified sound (optional: carry the fallback step on the subject or the response so it is visible outside the log) |
| 2.2 precondition 2 / T17 | citation | LOW | manual | range-base.ts cannot import gates.ts at runtime because gates.ts imports completion-record.ts, which imports range-base.ts; today range-base.ts has no import of gates.ts, so a test asserting on its import statements passes. | gates.ts:60 imports completion-record.ts and completion-record.ts:22 imports range-base.ts, so a runtime import of gates from range-base would be a cycle, as stated; range-base.ts:60 is the stampedBase helper the design says it will mirror. One detail for T17: range-base.ts:48 already has `import type { ApprovableArtifactMeta } from '../../gates.js'`. It is erased at compile and is not a cycle, but a test that scans import statements for 'gates.js' will fail on it unless it excludes type-only imports. | none — verified sound (word T17 as 'no runtime import of gates.ts') |
| 2.5 / c8 | citation | LOW | manual | git_diff fails only when its body command fails; a failed numstat yields an empty file list with success; and its input schema is closed, so `exclude` must be declared there. | diff.ts:116 fails the tool on a non-zero body exit; :126 turns a failed numstat into an empty list and continues; :74 closes the input schema. The corrected sentences in section 2.5 and the error table match these lines, and c8 quotes :126 verbatim. | none — verified sound |
| 6 backward compat / 4 edge rows 8-9 | semantic | LOW | manual | The in-flight class with commits but no validate is declared as a limitation, and the 'exactly as today' statement is limited to Stories with no build-start file, which matches the code: no BUILD record exists before validate on the plan-driven and Small routes. | implement.ts:82 goes straight to rendering the prompt on the plan-driven route with no record write, and validate.ts:253 is where the record is first persisted. The restored limitation and the narrowed 'exactly as today' sentence now describe that correctly. | none — verified sound |
| 5 acceptance mapping | cross-artifact | LOW | manual | Seven acceptance criteria are defined and each maps to numbered tests that exist in the test levels, covering the two preserved constraints, the no-early-record guarantee and the review scoping. | LLD.md:305-311 map ac1 through ac7 to numbered tests, and each number appears in the test levels above the table: ac2 to T16 and T33, ac3 to the stamping tests and T29, ac7 to the fallback and unchanged-call tests. The earlier finding is resolved. | none — verified sound |

#### Proposed fixes

- **2.2 postcondition 1 / 3.4** (assisted) — The rule is stricter than the records the workflow actually produces, so its fallback (a2's behaviour) will be the common case for rebuilds.
  - option: Finished = approved after the stamp AND every plan task id recorded (or, with no plan, at least one task); drop the passed === true requirement, since approval is the human's completion act
  - option: Keep passed === true and declare: a Story approved with a failed, unset or differently-keyed task is never re-stamped; remedy is to delete its build-start file before rebuilding
  - option: Treat a record whose single task id equals the story id as covering the plan (the standalone-route-with-a-plan case)

- **2.2 / ac3** (assisted) — The skip rule keys on 'unapproved', which the early sweep defeats; the finished test already exists and can be reused.
  - option: No valid stamp: skip when the record has at least one task and the build is not finished; stamp only when there is no record, a task-less record, or a finished one
  - option: Keep the rule and declare: an in-flight Story that was batch-approved early and has no valid stamp is stamped at its next implement
