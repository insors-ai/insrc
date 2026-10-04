<!-- insrc:artifact LLD-5f7a7cb95b643ae5-S001 -->

# LLD: E202610045f7a7cb9:S001

## Summary

**Epic:** `batch-approval-stamps-one-shared-meta`
**HLD base run:** `wf-1791121268454-htixf9`
**HLD effective hash:** `8d188708f939...`

A Story's change set is measured from a starting commit. Today that commit is recorded when the plan is approved, so Stories approved together share one starting point and a later Story's record lists its siblings' files. This design records the starting commit when the Story's build begins, in a small file that cannot be approved or mistaken for the Story's work, and makes the code review measure from the same commit while leaving the workflow's own record files out of what it reviews.

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

**Returns:** `string | undefined` — The Story's base commit. New first step: the Story's build-start file, when it parses, names this Story, and its commit exists in the repo. Then the existing steps unchanged: the approval-time stamp on the PLAN then LLD, then the commit that introduced that artifact. Undefined when nothing resolves.

**Preconditions:**
- Signature, synchrony and never-throws behaviour are unchanged.

**Postconditions:**
- A build-start file that is unreadable, malformed, names another Story, or names a commit git cannot find is ignored with a logged warning and resolution continues with the existing steps.
- No fallback to HEAD^ or the empty tree is introduced.

### 2.2 `stampBuildStart`

```typescript
function stampBuildStart(repoPath: string, epicHash: string, storyId: string): 'stamped' | 'kept' | 'skipped-work-exists' | 'no-head'
```

**Parameters:**
- `repoPath: string` — Absolute repo root.
- `epicHash: string` — The work item's hash.
- `storyId: string` — The Story id.

**Returns:** `'stamped' | 'kept' | 'skipped-work-exists' | 'no-head'` — What happened. `stamped`: the file now holds HEAD's full sha. `kept`: a valid stamp already existed for a build still in progress and was left alone. `skipped-work-exists`: no stamp existed but the Story already has an unapproved BUILD record with at least one task, so HEAD may already contain its work and nothing was written. `no-head`: HEAD could not be resolved and nothing was written.

**Preconditions:**
- New function in src/workflow/runners/build/range-base.ts, beside the resolver. Synchronous. Never throws: a failure to write the file is caught, logged, and reported as `no-head`, the outcome that means nothing was written.

**Postconditions:**
- A valid existing stamp is replaced only when the Story's BUILD record carries an approvedAt later than the stamp's stampedAt, which means the previous build finished and this is a rebuild.
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

**Returns:** `readonly string[]` — Exactly four repo-root globs: `.insrc/artifacts/*.json`, `.insrc/build-start/**`, `docs/epics/**`, `docs/standalone/**`. Exported from src/workflow/runners/build/changed-files.ts. In git's glob pathspec `*` does not cross a directory separator, so the first glob covers only json files directly inside .insrc/artifacts and leaves .insrc/artifacts/templates and .insrc/artifacts/formats alone.

**Postconditions:**
- .insrc/templates, .insrc/feedback, .insrc/conventions, .insrc/artifacts/templates and .insrc/artifacts/formats are matched by none of the globs.

### 2.5 `git_diff`

```typescript
tool git_diff(input: { cwd; staged?; from?; to?; path?; context?; ignoreWhitespace?; maxBytes?; exclude?: string[] })
```

**Parameters:**
- `exclude: string[]` _(optional)_ — Globs, relative to the repo root, to leave out of the diff. Each is passed to git as a `:(top,exclude,glob)<glob>` pathspec on BOTH the body command and the numstat command. When no `path` is given the positive pathspec is `:(top)`; when `path` is given it stays the positive pathspec.

**Returns:** `unchanged result shape` — The same body, file list and totals as today, computed over the non-excluded paths. Excluded hunks are never emitted, so they do not count toward maxBytes.

**Errors:**
- `invalid-input` when `exclude` is present but is not an array of non-empty strings.

**Preconditions:**
- Omitting `exclude`, or passing an empty array, builds exactly today's git arguments.

**Postconditions:**
- The body command and the numstat command always receive the same pathspecs.

### 2.6 `changedFiles`

```typescript
function changedFiles(repoPath: string, opts?: { base?: string; exclude?: readonly string[]; excludeGlobs?: readonly string[] }): Promise<readonly string[]>
```

**Parameters:**
- `opts.excludeGlobs: readonly string[] | undefined` _(optional)_ — Globs forwarded as git_diff's `exclude` on every diff this function runs (unstaged, staged and range).

**Returns:** `Promise<readonly string[]>` — Unchanged rule: the working-tree set when it is non-empty after exclusion, otherwise the range from `base`. `exclude` (exact paths) is still applied in code; `excludeGlobs` is applied by git.

**Errors:**
- `NoBuildChangesError` when Unchanged from today.

**Postconditions:**
- With `excludeGlobs` absent the git_diff inputs are byte-identical to today's.

### 2.7 `resolveCodeReviewSubject`

```typescript
function resolveCodeReviewSubject(repoPath: string, epicHash: string, storyId: string, deps?: SubjectDeps): Promise<...>  // SubjectDeps.changedFiles widens to (repoPath: string, opts?: ChangedFilesOptions) => Promise<readonly string[]>; SubjectDeps gains resolveRangeBase
```

**Parameters:**
- `deps.resolveRangeBase: (repoPath: string, epicHash: string, storyId: string) => string | undefined` _(optional)_ — Defaults to resolveStoryRangeBase; a seam for tests.

**Returns:** `unchanged` — The subject's changedFiles is now changedFiles(repoPath, { base: <the Story's base>, excludeGlobs: LEDGER_EXCLUDE_GLOBS }): the Story's non-ledger working-tree changes, or when there are none, its non-ledger files since its base.

**Postconditions:**
- A tree dirty only with ledger files is treated as clean and the range is used.
- With no resolvable base and a clean (after exclusion) tree the result is what changedFiles returns today for that case; no range is substituted.

### 2.8 `assembleDiffCodeReviewGrounding`

```typescript
function assembleDiffCodeReviewGrounding(repoPath: string, deps?: DiffGroundingDeps, opts?: { base?: string; excludeGlobs?: readonly string[] }): Promise<...>  // DiffGroundingDeps.workingTreeDiff and lastCommitDiff gain a trailing excludeGlobs parameter; DiffGroundingDeps gains rangeDiff(repoPath, base, excludeGlobs)
```

**Parameters:**
- `opts.base: string | undefined` _(optional)_ — The Story's base. When the working-tree diff is empty after exclusion and a base is given, the diff is base..HEAD.
- `opts.excludeGlobs: readonly string[] | undefined` _(optional)_ — Passed as git_diff's `exclude` on every diff.

**Returns:** `unchanged` — Order: working-tree diff; else, with a base, the base..HEAD diff, whose result stands even when empty; else, with no base, the existing last-commit fallback. All three with the exclusions applied.

**Errors:**
- `DiffUnavailableError` when Unchanged from today.

**Preconditions:**
- Called with no opts it behaves exactly as today.

**Postconditions:**
- beginDiffOnlyReview in src/mcp/code-review-step/handler.ts passes { base: resolveStoryRangeBase(repo, subject.epicHash, subject.storyId), excludeGlobs: LEDGER_EXCLUDE_GLOBS }.

## 3. Data model changes

### 3.1 `Build-start file (.insrc/build-start/<epicHash>-<storyId>.json)` — new

One small json file per Story: { epicHash, storyId, rangeBase (40-hex commit sha), stampedAt (ISO time) }. Written by stampBuildStart from the implement phase on every admitted route (plan-driven, Small, and Trivial before its record write); the call is fail-open, so a stamping problem never blocks a build. It is not an artifact: it has no artifact id, sits outside .insrc/artifacts, and the approval sweep cannot see it. It is a tracked file like any other, so it may be committed with the Story's work.

**Call sites:**
- `src/mcp/build-step/phases/implement.ts`
- `src/workflow/runners/build/range-base.ts`

### 3.2 `BUILD writers' exclusion list` — invariant-change

The validate phase and the completion writer each pass an `exclude` holding their own record's json and md. Each now also adds buildStartRelPath(epicHash, storyId). Consequences: a tree dirty only with the build-start file is treated as clean, so the range is used; and the file never appears in a change log whether it is uncommitted or was committed inside the range. The BUILD writers do NOT use the ledger globs; what else a change log lists is unchanged.

**Call sites:**
- `src/mcp/build-step/phases/validate.ts`
- `src/workflow/runners/build/completion-record.ts`

### 3.3 `ApprovableArtifactMeta.rangeBase (approval-time stamp)` — invariant-change

Unchanged in how it is written. It is no longer the first source of a Story's base: it is consulted only when the Story has no valid build-start file.

**Call sites:**
- `src/workflow/gates.ts`
- `src/workflow/runners/build/range-base.ts`

## 4. Error paths

**Error cases**

- **HEAD cannot be resolved when the build starts (empty repo, or not a git repo).** (recoverable)
  - Detection: The `git rev-parse HEAD` call inside stampBuildStart exits non-zero or returns something that is not a 40-hex sha.
  - Response: Write nothing, log a warning, return `no-head`. The implement phase continues.
  - User impact: The build proceeds. The Story's base falls to the existing resolution steps, as today.
- **The build-start file cannot be written (permissions, full disk).** (recoverable)
  - Detection: The directory create or file write inside stampBuildStart throws; the function catches it.
  - Response: Log a warning naming the path and return `no-head` (the outcome that means nothing was written). The implement phase continues.
  - User impact: Same as above: the build proceeds on today's base resolution.
- **The build-start file exists but is unreadable, is not valid json, lacks a 40-hex rangeBase, or names a different epicHash or storyId.** (recoverable)
  - Detection: The resolver and the stamper both read it through one private reader that parses and checks the four fields against the Story asked for.
  - Response: The resolver ignores it with a warning and continues with the existing steps. The stamper treats it as absent, so its normal rules apply and a fresh stamp replaces it unless the in-flight-build rule says to skip.
  - User impact: None beyond a log line; a corrupt stamp heals at the next build start.
- **The stamped commit no longer exists in the repo (history rewritten and pruned).** (recoverable)
  - Detection: The shared reader runs `git cat-file -e <sha>^{commit}`; a non-zero exit marks the stamp invalid.
  - Response: Treated exactly like a malformed stamp.
  - User impact: The base falls to the approval-time stamp or the introducing commit, which may be wider. This is today's behaviour for such a repo.
- **git rejects the exclusion pathspecs or the range (very old git, or a base it cannot resolve).** (recoverable)
  - Detection: git_diff's body or numstat command exits non-zero; the tool already returns a failure for that.
  - Response: Unchanged handling: changedFiles and the diff grounding surface the failure the way they do today for a failed diff (an empty set for the BUILD writers' range step, DiffUnavailableError for the degraded review). No retry without the exclusions.
  - User impact: The review reports that the diff is unavailable rather than silently reviewing ledger files.
- **git_diff is called with an `exclude` that is not an array of non-empty strings.** (recoverable)
  - Detection: Input validation at the top of the tool's handler, beside the existing input reads.
  - Response: Return the tool's invalid-input failure without running git.
  - User impact: None for workflow callers, which pass the constant.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Two Stories whose plans were approved in one sweep; the first is built and committed, then the second starts its build. | The second Story's build-start file holds the commit after the first Story's work. Its change log and its review list only its own files. |
| The implement phase is called again for a Story whose build is in progress (a retry, or the next task). | `kept`: the stamp is not moved, even though HEAD may now include the Story's own commits. |
| A Story whose BUILD record was approved is built again. | The record's approvedAt is later than the stamp's stampedAt, so the stamp is replaced with the current HEAD and the new change log covers only the rebuild. |
| A Story that was already mid-build when this change was installed: no build-start file, an unapproved BUILD record with tasks. | `skipped-work-exists`: nothing is written, and the base resolves by the existing steps exactly as before the change. |
| Trivial route, first implement call: no stamp and no BUILD record yet. | The stamp is written first, then the route writes its task-less BUILD record. A later implement call sees a valid stamp and keeps it; the task-less record never triggers the skip rule. |
| The build-start file is committed together with the Story's source. | It is inside base..HEAD, and the BUILD writers remove it by exact path, so the change log is exactly the Story's other files. |
| The build-start file is the only uncommitted change when validate runs. | After exact-path exclusion the working set is empty, so the range from the base is used and lists the Story's committed files. |
| The build-start file is untracked when validate runs. | Plain git diff never reports it; the result is the same as the previous case. |
| Code review with the Story committed and only an approval-stamped artifact json uncommitted. | The ledger glob removes the json inside git, the working set is empty, and the review covers the Story's files since its base. |
| Code review where the Story changed .insrc/artifacts/templates/x.md and .insrc/conventions/y.md. | Both files are in the reviewed set: no ledger glob matches them. |
| Degraded review of a range whose ledger hunks alone exceed the 256 KB body cap and sort before the source hunks. | The ledger hunks are never emitted, so the source hunks are within the cap and every changed source file gets its diff text. |
| Degraded review with a base, where the Story changed only ledger files. | The range diff is empty after exclusion and that empty result stands; the last-commit fallback is not used. |
| Degraded review with no resolvable base and a clean tree. | The existing last-commit fallback runs, with the ledger exclusions applied. |
| git_diff called with both `path` and `exclude`. | `path` remains the positive pathspec and the exclusions narrow it. |
| A build is stamped, abandoned before any commit, and resumed after other Stories' commits have landed. | The old stamp is kept, so the change set includes those other commits. Accepted limitation; deleting the build-start file before resuming resets it. |

## 5. Test strategy

**Test framework:** `node:test run through tsx, node:assert/strict`

**Test levels**

- **unit** — The stamping rules and the resolver's new first step, each against a real temporary git repo.
  - Subjects: `stampBuildStart: no stamp, no BUILD record -> `stamped`, file holds HEAD's full sha and the Story's ids`, `stampBuildStart: valid stamp, HEAD moved -> `kept`, file bytes unchanged`, `stampBuildStart: valid stamp and a BUILD record whose approvedAt is later than stampedAt -> `stamped` at the new HEAD`, `stampBuildStart: no stamp and an unapproved BUILD record with one task -> `skipped-work-exists`, no file`, `stampBuildStart: no stamp and a task-less BUILD record -> `stamped``, `stampBuildStart: repo with no commits -> `no-head`, no file; unwritable directory -> `no-head`, no throw`, `stampBuildStart: malformed file, file naming another Story, file naming a missing commit -> replaced by a fresh stamp`, `resolveStoryRangeBase: a valid build-start file wins over a different approval-time stamp on the PLAN`, `resolveStoryRangeBase: malformed, wrong-Story and missing-commit files are ignored and the approval-time stamp is returned`, `resolveStoryRangeBase: no build-start file -> every existing range-base test still passes unchanged`
  - Fixtures: `mkCleanGitRepo temp repo with at least two commits`, `a PLAN json carrying meta.rangeBase`, `BUILD record json fixtures: task-less, with tasks, approved`
- **unit** — git-level exclusion in the git_diff tool and the globs, run against real git so the glob semantics are git's and not a re-implementation.
  - Subjects: `git_diff with `exclude`: an excluded file is absent from BOTH the body and the file list; a kept file is present in both`, `git_diff with no `exclude` and with an empty array: the git argument vectors equal today's (asserted on the argument builder)`, `git_diff with `path` and `exclude` together: the path is still the positive pathspec`, `git_diff with a non-array or empty-string `exclude`: invalid-input, git not run`, `LEDGER_EXCLUDE_GLOBS against one commit touching every location: the exact kept set is [.insrc/artifacts/formats/f.md, .insrc/artifacts/templates/t.json, .insrc/conventions/c.md, .insrc/feedback/fb.md, .insrc/templates/tp.md, src/a.ts] and the exact dropped set is [.insrc/artifacts/LLD-x.json, .insrc/build-start/x-S001.json, docs/epics/e/S001/LLD.md, docs/standalone/s/S001/BUILD.md]`, `the same globs when git_diff's cwd is a subdirectory of the repo: the result is identical (proves the `top` anchoring)`, `changedFiles with excludeGlobs: a tree dirty only with an artifact json falls through to the range; without excludeGlobs the recorded git_diff inputs equal today's`
  - Fixtures: `temp git repo with the listed files committed in one commit over a base commit`
- **integration** — The defect and both earlier review findings, end to end through the real implement and validate phases and the real approval gate.
  - Subjects: `Two Stories under one epic, plans approved in one batch (the approval rewrite committed). Build and commit Story 1, then implement+commit+validate Story 2: Story 2's BUILD change log is EXACTLY its own files, and Story 1's is exactly its own`, `The same flow with the build-start file committed alongside the Story's source: exact-set change log, build-start file absent`, `The same flow with the build-start file left uncommitted and nothing else dirty: the range is used, exact-set change log`, `Rebuild: approve Story 1's BUILD, call implement again (stamp replaced), commit a new file, validate: the change log is exactly the new file`, `After an implement call on the plan-driven and Small routes no BUILD record exists for the Story; a batch approval by epicHash at that moment approves no BUILD record and the Story is not complete`, `Completion writer (completion-record) with a committed build-start file: exact-set change log`
  - Fixtures: `mkCleanGitRepo`, `two PLAN fixtures under one epicHash`, `the build-step test harness in src/mcp/build-step/__tests__/build-step.test.ts`
- **integration** — The code review measures from the Story's base and never reviews ledger files, on both of its paths.
  - Subjects: `resolveCodeReviewSubject, real changedFiles: Story committed, only an approval-stamped artifact json dirty -> changedFiles is exactly the Story's source files`, `resolveCodeReviewSubject: a Story that edited .insrc/artifacts/templates/t.json -> that file is in changedFiles`, `assembleDiffCodeReviewGrounding with real git: a base..HEAD range whose ledger files total more than 256 KB and sort before src/ -> every src file has a pseudo-symbol with non-empty diff text, and no ledger path appears; the same fixture WITHOUT excludeGlobs loses the src text (shows the test can fail)`, `assembleDiffCodeReviewGrounding: base given and only ledger files changed -> empty result, lastCommitDiff not called`, `assembleDiffCodeReviewGrounding: no opts -> the calls made on the deps equal today's`, `beginDiffOnlyReview: the grounding dep receives the Story's resolved base and LEDGER_EXCLUDE_GLOBS`
  - Fixtures: `temp git repo with a generated >256 KB artifact json and docs markdown committed in the range`, `handler test deps recording their arguments`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `Two Stories approved in one batch: Story 2's BUILD change log is exactly its own files`, `resolveCodeReviewSubject: only an artifact json dirty -> changedFiles is exactly the Story's source files`, `Degraded review over a >256 KB ledger range: every src file has diff text` |

## 6. Migration

**State before:** A Story's base comes from a stamp written when its plan (or standalone LLD) is approved, else from the commit that introduced that artifact (range-base.ts, gates.ts). Stories approved in one sweep share one base, so a later Story's change log lists its siblings' files. The code review does not use a base at all: its graph path takes the working tree, and its degraded path takes the working tree or else the last commit; an uncommitted approval-stamped artifact json therefore becomes the whole reviewed set (subject.ts, grounding.ts, handler.ts). The git_diff tool cannot exclude paths, and its body is capped at 256 KB, which ledger hunks alone can exceed (diff.ts).

**State after:** The implement phase records HEAD in a per-Story build-start file the first time a Story's build starts; the resolver reads that file first and falls back to the existing steps. The BUILD writers exclude the Story's build-start file by exact path. The code review, on both paths, measures from the Story's base and excludes four ledger globs inside git, so ledger files are neither listed nor counted against the body cap, while user-authored files under .insrc stay reviewable. No approvable record is written earlier than today, and the approval sweep is unchanged.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the optional `exclude` input to the git_diff tool, applied as git exclude pathspecs to both its body and numstat commands; with the input absent or empty the argument vectors are today's. — ↩ rollbackable
2. Add the `excludeGlobs` option to changedFiles and export the ledger glob constant beside it; no existing caller passes the option yet. — ↩ rollbackable
3. Add the build-start path helper, the shared stamp reader and stampBuildStart to range-base.ts, and make the resolver consult a valid build-start file first. — ↩ rollbackable
4. Call stampBuildStart from the implement phase on each admitted route, fail-open, before the Trivial route's record write. — ↩ rollbackable
5. Add the Story's build-start path to the exact-path exclusion list in the validate phase and the completion writer. — ↩ rollbackable
6. Pass the Story's base and the ledger globs from the review subject resolver, and add the base and globs options to the diff grounding and pass them from the degraded review path. — ↩ rollbackable
7. Add the tests in the test strategy; confirm each new assertion fails when its production change is reverted. — ↩ rollbackable

**Backward compat:** Every changed signature is additive and optional: git_diff's `exclude`, changedFiles' `excludeGlobs`, the grounding's third parameter and the widened test seams. Callers that pass nothing get today's behaviour. No existing artifact is rewritten and no stored field changes meaning. Stories with no build-start file (everything built before this change, and builds in flight when it lands) resolve their base exactly as today. Reverting the code leaves build-start files on disk as inert json that nothing reads. The one behaviour change for existing users is intended: a code review no longer lists files under docs/epics, docs/standalone, .insrc/build-start or the json files directly inside .insrc/artifacts.

## 7. Alternatives considered

### 7.1 a1: Build-start file, excluded by the BUILD writers; ledger excluded from the review at the git level — **CHOSEN**

A non-approvable build-start file carries the base; the BUILD writers exclude it by exact path; the review excludes one precise list of ledger globs inside git itself, so they leave both the file list and the capped diff body.

Keep the non-approvable build-start file and its stamping rules. Close the two gaps the second review found. (1) The BUILD writers add the Story's build-start file to the exact-path exclusion they already use for their own record, so it can neither stand in for the Story's work nor appear in the change log, whether it is uncommitted, committed with the work, or untracked. (2) The git_diff builtin gains an optional list of exclusion globs applied as git exclude pathspecs to both its body and its file-list commands. One constant names the ledger globs precisely: json files directly inside .insrc/artifacts/, everything under .insrc/build-start/, docs/epics/ and docs/standalone/. The review's graph path and degraded path both pass the Story's base and those globs, so ledger hunks are removed before the body cap is applied and user-authored files under .insrc stay reviewable.

### 7.2 a2: Same carrier, but filter ledger files after the diff, per file

Leave git_diff alone; the review filters the file list in code and fetches the diff body one kept file at a time.

Keep the build-start file and the BUILD writers' exact-path exclusion as in a1. For the review, filter the returned file list with a matcher in code, and on the degraded path call git_diff once per kept file using its existing single `path` input so each file gets its own body cap.

**Rejected because:** Reaches the same result but with two mechanisms and a process per file on the degraded path.

### 7.3 a3: Keep the build-start file out of git instead of excluding it

Have the workflow add .insrc/build-start/ to the repo's .gitignore so the file is never tracked.

Keep the carrier, and solve the change-log leak by writing an ignore rule for the build-start directory into each repo, relying on plain git diff not reporting untracked or ignored files. The review half is as in a1.

**Rejected because:** Makes the change log's correctness depend on repository configuration and edits a user-owned file.

## 8. References

- **[[c1]]** `code` `src/workflow/runners/build/range-base.ts` — "export function resolveStoryRangeBase(repoPath: string, epicHash: string, storyId: string): string | undefined {"
- **[[c2]]** `code` `src/workflow/gates.ts` — "const re = new RegExp(`^(DEF|HLD|LLD|PLAN|BUILD)-${epicHash}(-.*)?\\.json$`);"
- **[[c3]]** `code` `src/mcp/build-step/phases/implement.ts` — "function handleStandaloneImplement("
- **[[c4]]** `code` `src/workflow/runners/build/changed-files.ts` — "export async function changedFiles(repoPath: string, opts?: ChangedFilesOptions): Promise<readonly string[]> {"
- **[[c5]]** `code` `src/workflow/code-review/subject.ts` — "changedFiles = await deps.changedFiles(repoPath);"
- **[[c6]]** `code` `src/workflow/code-review/grounding.ts` — "export async function assembleDiffCodeReviewGrounding("
- **[[c7]]** `code` `src/mcp/code-review-step/handler.ts` — "const diff = await deps.assembleDiffGrounding(repo);"
- **[[c8]]** `code` `src/daemon/tools/builtins/git/diff.ts` — "if (o.path) { base.push('--', o.path); }"
- **[[c9]]** `prior-artifact` `ISSUE-5f7a7cb95b643ae5`
- **[[c10]]** `stakeholder` `user decisions, 2026-10-04` — "revise the design"
- **[[c11]]** `step-output` `s1`
- **[[c12]]** `step-output` `s3`

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.story (design.story)

**0 HIGH · 4 MED · 5 LOW** · model `client` · reviewed 2026-10-04T13:51:23.510Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| 4 error case 5 | semantic | MED | assisted | When git rejects the pathspecs or the range, git_diff's body or numstat command exits non-zero and the tool already returns a failure for that; changedFiles and the diff grounding then surface it as they do today, which for the code review means the diff is reported unavailable. | Two statements in this error case do not match the code. (1) 'body or numstat command exits non-zero; the tool already returns a failure for that': only the body does (diff.ts:116). A failed numstat is swallowed into an empty file list at :126 and the tool still reports success. With identical pathspecs on both commands a rejection fails the body too, so the outcome holds, but the stated mechanism is half wrong. (2) 'The review reports that the diff is unavailable': true for the degraded path only. On the graph path a failed range diff throws NoBuildChangesError (changed-files.ts:69), which the subject resolver maps to { ok:false, reason:'no-build-record' } (subject.ts:99-100), and the handler turns that into a 'no-subject' error (handler.ts:248): the review cannot start. Today the review passes no base, so it cannot fail this way. The design validates only the build-start stamp with `git cat-file`; the approval-time fallback is returned as stored (range-base.ts:66), so a fallback base that git can no longer resolve now blocks the review outright. | Say what the graph path does when the range diff fails (decline as designed, or fall back to the working-tree set), and either validate the fallback bases the same way as the stamp or accept the decline explicitly. Correct the numstat sentence. |
| 2.2 postcondition 1 | ordering | MED | manual | A BUILD record's approvedAt being later than the build-start stamp means the previous build finished, so replacing the stamp in that state never puts the base on the Story's own in-progress work. | The rule equates 'approvedAt later than the stamp' with 'the previous build finished'. The code does not guarantee that. The batch sweep lists every unapproved BUILD record under the epic (gates.ts:693, :700) and approves each (:783-788); the only withhold is under enforcement, which is off by default (:749). So a Story with one validated task and more to build is approved whenever someone batch-approves a sibling's LLD or PLAN. Its next implement call then sees approvedAt later than stampedAt, replaces the stamp with the current HEAD, and the base now sits after the Story's own first task. The following validate writes a change log for the later task only, and because the new body replaces the prior one field by field (standalone-record.ts:370-371) the first task's files drop off the record. The early approval is an existing hole, not something this design creates, but the re-stamp rule turns it into a moved base, which is the state the issue says must not happen. | Name this state in the edge table and decide it: either tie the re-stamp to something an early sweep cannot produce, or accept it as a consequence of the existing sweep behaviour and say so. |
| 6 backward compat | semantic | MED | assisted | Stories with no build-start file, including builds in flight when the change lands, resolve their base exactly as today. | Contradicted for one class of in-flight build. The plan-driven and Small routes write no BUILD record at implement (implement.ts:62-82 return the prompt; the only write is the Trivial one at :133); the record first appears at validate (validate.ts:253). A Story that has committed work but has not yet run a validate when the change lands therefore has no record and no stamp, so the skip rule cannot fire and its next implement call stamps the current HEAD, after its own commits. Its base does not resolve 'exactly as today'. The previous draft listed this as a declared limitation; this draft dropped the row and replaced it with the stronger sentence. | Restore the limitation (edge table and backward compat) or narrow the sentence to in-flight builds that already have a validated task. |
| 5 acceptance mapping | cross-artifact | MED | assisted | The acceptance mapping covers the Story's acceptance criteria, including the issue's two preserved constraints (an unresolvable base yields an empty change set; nothing moves an existing base forward). | LLD.md:265-267 map a single criterion, ac1, to three tests. The issue's two preserved constraints (an unresolvable base yields an empty set, range-base.ts:114; nothing moves an existing base forward) and 'no approvable record earlier than today' each have tests in section 5 but no criterion, where the previous draft carried six. Anything that checks the build against the acceptance mapping will check only the sibling case. | Restore the criteria for the preserved constraints, the no-early-record guarantee and the review scoping, and map the existing tests to them. |
| 3.2 | semantic | LOW | manual | Both BUILD writers pass an exact-path `exclude` holding their own record's json and md, applied in changedFiles before the emptiness check and to the range, so adding buildStartRelPath to it keeps the build-start file out of the change log whether it is uncommitted, committed in range, or untracked. | validate.ts:250 and completion-record.ts:74 both pass `exclude: [own.json, own.md]`; changed-files.ts:91 turns that list into the drop set, :104 applies it to the working set before the emptiness check and :113 applies it to the range. Adding the build-start path to the same list covers the three states the design names (uncommitted, committed in range, untracked). The previous HIGH is resolved. | none — verified sound |
| 2.5 / c8 | external-contract | LOW | manual | git_diff builds its body and numstat argument vectors in two builders that append `-- <path>` only when a path is given, so an `exclude` list can be appended to both as `:(top,exclude,glob)` pathspecs; in git's glob pathspec `*` does not cross `/`, `top` anchors at the repo root regardless of cwd, and exclusions combine with a positive path. | diff.ts:187 and :195 are the two builders, each appending `-- <path>` only when a path is given, and :104-105 run them as separate commands, so the same pathspecs can be appended to both. The git semantics are outside the repo; I checked them by running git 2.55.0 in a throwaway repository rather than from these reads: with `:(top)` plus the four `:(top,exclude,glob)` specs, `.insrc/artifacts/templates/t.json` and `.insrc/artifacts/formats/f.md` were kept and `.insrc/artifacts/LLD-x.json`, the build-start file and everything under docs/epics and docs/standalone were dropped; a sibling `docs/epics-notes/n.md` was kept; the result was identical from a subdirectory; a positive `src` path combined with the exclusions; and the body carried no excluded hunk. Two things for the build: the tool's input schema is closed (:74 additionalProperties:false), so `exclude` must be added there as well as in the handler, and the oldest git version this must work on is not stated. | none — verified sound (state a minimum git version if one matters) |
| 2.6 / 2.7 / 2.8 | closed-union | LOW | manual | The callers affected by the changed signatures are exactly: changedFiles via the review subject seam and collectBuildChangeLog; assembleDiffCodeReviewGrounding via the review-step handler's degraded path; resolveCodeReviewSubject's callers all receive the base and ledger exclusion through its defaults. | subject.ts:97 is the one changedFiles call on the review side; changed-files.ts:162 is collectBuildChangeLog's call, which builds its options from base and exclude only and so stays byte-identical; handler.ts:344 is the only assembleDiffGrounding call. resolveCodeReviewSubject has three callers (handler via its dep, daemon/code-review-rpc.ts:73, daemon/index.ts:753), all through the default deps, so the daemon-driven review gets the same base and exclusion. git_diff is also on the analyze tool surface (tool-surface.ts:137); the new input is optional there. | none — verified sound |
| 2.8 | semantic | LOW | manual | The degraded grounding reads a working-tree diff and otherwise the last commit through two deps, splitting one size-capped body per file; excluding ledger globs inside git on each of those diffs and adding a range diff keeps source hunks within the cap. | grounding.ts:212 and :215 are the working-tree and last-commit reads, :225 splits the single body per file, and :270 is the one git_diff call both deps go through; diff.ts:129-130 apply the cap to git's stdout. Excluding inside git means excluded hunks never reach that stdout, so the earlier body-cap finding is resolved. | none — verified sound |
| 3.1 / c2 / c3 | citation | LOW | manual | The approval sweep matches only DEF/HLD/LLD/PLAN/BUILD ids under .insrc/artifacts and implement writes a BUILD record only on the Trivial branch, so a build-start file under .insrc/build-start is not approvable and stamping before the Trivial record write means that route's task-less record never triggers the skip rule. | gates.ts:691-693 scan .insrc/artifacts for the five id prefixes only. implement.ts:116 admits, :133 writes the Trivial record and :139 shows its body has no tasks, so with the stamp taken first a later call finds a valid stamp and returns 'kept'; a task-less record cannot satisfy the skip rule. | none — verified sound |

#### Proposed fixes

- **4 error case 5** (assisted) — A new hard-decline path for the review is introduced without being named.
  - option: Apply the commit-exists check to every base the resolver returns
  - option: In the subject resolver, treat a failed range diff as 'no base' and return the working-tree set
  - option: Keep the decline and document it as intended

- **2.2 postcondition 1** (manual) — The rebuild signal is weaker than the design states.
  - option: Re-stamp only when the approved record's task set already contains the task now being implemented (a genuine rebuild), not when a new task id is starting
  - option: Keep the rule and list premature batch approval as a known cause of a moved base
  - option: Fix the sweep separately (skip a BUILD whose plan has unvalidated tasks) and reference that issue here

- **6 backward compat** (assisted) — The claim is stronger than the stamping rules support; the behaviour itself is a one-time migration effect.
  - option: Reword to: builds in flight with at least one validated task resolve as today; a build with commits but no validated task is stamped at its next implement and can miss those commits
  - option: Also skip stamping when an approval-time base exists and commits since it touch files other than ledger files (heavier)

- **5 acceptance mapping** (assisted) — The tests exist; the mapping lost them.
  - option: Re-add ac2-ac6 from the previous draft with the current test names
  - option: Keep one criterion and state that the unit and integration lists are all required
