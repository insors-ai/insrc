<!-- insrc:artifact LLD-06f196a7ff528143-s1 -->

# LLD: E2026102106f196a7:S001

## Summary

**Epic:** `scope-story-s-code-review-what`
**HLD base run:** `wf-1792558677033-6cunie`
**HLD effective hash:** `06f196a7ff52...`

A Story's code review, its diff-only review and its BUILD records now decide the Story's files from the Story's own commits, the ones carrying its Insrc-Story trailer since its range base. An uncommitted change joins only when it edits a file those commits already changed; every other uncommitted change is left out and listed as excluded on the review record. With no range base to anchor on, the review declines instead of reviewing whatever the working tree holds. The build gate's typecheck project selection follows the same Story set.

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

### 2.1 `changedFiles`

```typescript
changedFiles(repoPath: string, opts?: ChangedFilesOptions): Promise<readonly string[]>
```

**Parameters:**
- `repoPath: string` — The repository.
- `opts: ChangedFilesOptions` _(optional)_ — base (the Story's range base), storyKey (<epicHash>/<storyId>), exclude, excludeGlobs, onAttribution. With a base the Story's set is anchored on its commits; without one, today's working-tree derivation for callers that do not know a Story.

**Returns:** `Promise<readonly string[]>` — With a base: the Story's set = the paths of its units (storyChangeSet with storyKey: trailer units, else every first-parent commit restricted to the Story's own paths), plus each working-tree path (unstaged or staged) that is already in that set; minus exclude. Every other working-tree path is reported, never returned. Without a base: unchanged (the working-tree derivation), for callers outside a Story.

**Errors:**
- `NoBuildChangesError` when git fails on the anchored derivation (as today).
- `NoBuildChangesError` when opts.storyKey is given without a base: a Story's set has no anchor, so the seam refuses instead of returning the working tree (callers outside a Story pass neither and keep today's working-tree derivation).

**Preconditions:**
- A base, when given, is a CANDIDATE commit (resolveStoryRangeBase checks only the build-start stamp with commitExists; an upstream artifact's meta.rangeBase is returned unchecked). One that does not resolve makes git fail, which is the NoBuildChangesError decline below, never a wider set.

**Postconditions:**
- With a base, the result never contains a working-tree path outside the Story's committed set, whatever the working tree holds.
- The order no longer depends on whether the tree is dirty: the Story's units are always read first.
- onAttribution reports attribution ('story-trailer' | 'first-parent-range'), sharedWithExcluded and excludedUncommitted (the working-tree paths left out, sorted).
- When opts.storyKey is given, storyChangeSet is called with strict: true, so a failed trailer scan fails the derivation instead of widening it to the first-parent range.
- The anchored read selects per-unit diffs by set.perUnit, not by attribution === 'story-trailer': a filtered legacy range reads each kept unit's own diff, so a file another Story also edited (or later reverted) carries only this Story's change.

### 2.2 `storyChangeSet`

```typescript
storyChangeSet(repoPath: string, base: string, opts?: { readonly storyKey?: string | undefined; readonly strict?: boolean | undefined }): AttributedStoryChangeSet
```

**Parameters:**
- `repoPath: string` — The repository.
- `base: string` — The Story's range base.
- `opts.storyKey: string` _(optional)_ — <epicHash>/<storyId>: the trailer the Story's commits carry.
- `opts.strict: boolean` _(optional)_ — Anchored use (changedFiles with a storyKey, the diff-only grounding, the validate gate's selection): a trailer scan that cannot read the commit messages throws instead of falling back to the first-parent range. newestStoryCommit keeps the lenient scan.

**Returns:** `AttributedStoryChangeSet` — With commits carrying the Story's trailer: those units ('story-trailer'), as today. With a storyKey and NO commit carrying it: the first-parent commits that carry NO Insrc-Story line at all ('first-parent-range', the legacy pre-trailer Story); a commit carrying another Story's trailer is left out and its paths count as excluded (sharedWithExcluded). When every commit in the range belongs to another Story, the set is empty. Without a storyKey: unchanged. The result gains perUnit: boolean — true for 'story-trailer' and for a legacy range from which at least one other-Story commit was left out; false only for an unfiltered legacy range. FOREIGN COMMITS: the trailer scan records, besides the commits carrying the Story's trailer, the 'foreign' commits whose Insrc-Story lines all name other Stories. One rule then applies to every first-parent commit kind — an ordinary commit, a two-parent merge's merge-edit unit, and an octopus merge's whole-change unit: a foreign commit is never a unit (its paths are added to the excluded set and surface in sharedWithExcluded); a commit carrying the Story's trailer is a unit; an untrailered commit is a unit for a merge always (today's rule: merge edits are Story work unless they say otherwise) and, for an ordinary commit, only when no commit carries the Story's trailer (the legacy range). Leaving out a foreign commit makes perUnit true. PRE-TRAILER END (amendment 2026-10-21, after the t8 smoke on Epic c2ba6fa6 Story s1): in the legacy case (a storyKey and no commit carrying it), the range also ENDS at the Story's recorded build commit, resolveStoryRangeEnd: a first-parent commit after it is never a unit (it is later work, typically another person's untrailered commit such as 7d0e6402), its paths count as excluded, and perUnit is true. An end that does not resolve, or is not on the first-parent line of base..HEAD, is ignored with a warning (the legacy range runs to HEAD, as before). With a carrying commit the end is not consulted. An end EQUAL to the base is valid and means the Story has committed nothing attributable yet: the trivial implement route (src/daemon/steps/build-step/phases/implement.ts) persists the first BUILD record right after noting the build start, so its body.commit is the base. The legacy set is then empty (every first-parent commit since the base is after the end) and the review declines with 'no-build-record'. An end that is neither the base nor on the first-parent line of base..HEAD is ignored with a warning.

**Errors:**
- `NoBuildChangesError` when git fails on rev-list or a unit's diff (as today); with strict: true, also when the trailer scan cannot read the commit messages (today it logs and falls back).

**Preconditions:**
- base resolves in the repository.

**Postconditions:**
- With a storyKey, the set never contains a unit from a commit carrying another Story's Insrc-Story trailer.
- With strict: true, the attribution is never widened by a git failure.
- perUnit is false exactly when the result equals today's unfiltered first-parent range, so the net-range read stays valid only there.
- No unit of any kind (commit, merge-edit, octopus) comes from a foreign commit; untrailered merge edits are still kept, so today's 'only commits carrying the Story's trailer and merge edits are units' test is unchanged.
- For a pre-trailer Story with a resolvable recorded end, no unit comes from a commit after that end, so an uncommitted edit of a file only a later commit touched is excluded, not joined.
- The 'names this Story but lacks its trailer' warning fires only for an untrailered commit, never for a foreign one whose subject happens to read `<storyId>/`.
- A recorded end equal to the base yields an empty legacy set, never the whole range; since a pre-trailer end never moves, an untrailered build begun on the trivial route is never attributed later untrailered work (the build prompt requires the trailer, which switches it to trailer attribution).

### 2.3 `resolveStoryRangeEnd`

```typescript
resolveStoryRangeEnd(repoPath: string, epicHash: string, storyId: string): string | undefined
```

**Parameters:**
- `repoPath: string` — The repository.
- `epicHash: string` — The Story's epic (or standalone) hash.
- `storyId: string` — The Story.

**Returns:** `string | undefined` — The full sha of the commit the Story's BUILD record names (body.commit: for a pre-trailer Story, HEAD when its record was last persisted), when it resolves to a commit; undefined when there is no record, no commit field, or it does not resolve. Read-only; never throws. Lives in src/workflow/runners/build/range-base.ts beside resolveStoryRangeBase.

**Postconditions:**
- Used only by storyChangeSet's legacy case; a trailered Story never reads it.
- The end is stable across every rewrite (validate reruns, completion, approval): persistBuildRecord computes body.commit as `rec.body.commit ?? storyCommit(...) ?? (prior.body.commit when it still resolves to a commit) ?? headShortSha(repoPath)` (an unresolvable prior value, such as a rewritten-away sha, falls back to HEAD as today), so once a pre-trailer Story's record names a commit it is never refreshed to a later HEAD. It advances only with evidence of new Story work: a commit carrying the Story's trailer, which also switches the Story to trailer attribution, where the end is not read. Checks, changeLog and the persisted record therefore all use the same end.
- The existing case 'an explicitly SUPPLIED commit wins for that write; a later persist REFRESHES to HEAD' in src/workflow/runners/build/__tests__/build-record.test.ts is replaced: a later persist without a trailered commit KEEPS a prior commit that resolves, and refreshes to HEAD only when the prior one does not resolve.

### 2.4 `storyRangeDiff`

```typescript
storyRangeDiff(repoPath: string, base: string, set: StoryChangeSet & { readonly attribution?: StoryAttribution | undefined; readonly perUnit?: boolean | undefined }, excludeGlobs: readonly string[] | undefined, run?: (repoPath: string, input: Record<string, unknown>) => Promise<DiffResult>): Promise<DiffResult>
```

**Parameters:**
- `set: StoryChangeSet & { attribution?, perUnit? }` — The Story's change set; perUnit decides the read.

**Returns:** `Promise<DiffResult>` — With set.perUnit true, every path is read from the kept units' own diffs (today's 'story-trailer' branch: shared = set.paths); otherwise unchanged (net base..HEAD for plain paths, per-unit for sharedPaths).

**Postconditions:**
- A filtered legacy range never grounds on another Story's hunks of a file both changed, nor loses this Story's change to a later revert by another Story.

### 2.5 `resolveCodeReviewSubject`

```typescript
resolveCodeReviewSubject(repoPath: string, epicHash: string, storyId: string, deps?: SubjectDeps): Promise<CodeReviewSubjectResult>
```

**Parameters:**
- `repoPath: string` — The repository.
- `epicHash: string` — The Story's epic (or standalone) hash.
- `storyId: string` — The Story.

**Returns:** `Promise<CodeReviewSubjectResult>` — The subject's changedFiles is the anchored set (base + storyKey + ledger exclusion); it carries changeSetAttribution, sharedWithExcluded and excludedFromScope (the working-tree paths left out).

**Errors:**
- `{ ok: false, reason: 'no-build-record' }` when No range base resolves for the Story, or git fails on the anchored derivation: the review declines; the two working-tree fallbacks are removed, so a failure never turns into a review of the working tree.
- `{ ok: false, reason: 'no-build-record' }` when Amendment: the anchored set is EMPTY (the Story has no attributable change: a pre-trailer Story bounded to nothing, or a range of only other Stories' work). Nothing is reviewed and no record is written; today an empty set runs every judge and writes a vacuous pass record (src/workflow/code-review/runner.ts runs `for (const slot of judges)` unconditionally).

**Preconditions:**
- The Story's build commits carry its Insrc-Story trailer (the tracked build's commit rule).

**Postconditions:**
- changeSetAttribution is never 'working-tree' on a resolved subject.
- The module header states the rule: the Story's commits decide its scope; the working tree only adds edits of its own files.
- A resolved subject always has at least one changed file. The existing case 'resolveCodeReviewSubject: empty diff is a valid trivial subject (not an error)' in src/workflow/code-review/__tests__/subject.test.ts is replaced by the decline.

### 2.6 `assembleDiffCodeReviewGrounding`

```typescript
assembleDiffCodeReviewGrounding(repoPath: string, deps?: DiffGroundingDeps, opts?: DiffGroundingOptions): Promise<DiffGroundingResult>
```

**Parameters:**
- `repoPath: string` — The repository.
- `opts: DiffGroundingOptions` _(optional)_ — base, excludeGlobs, storyKey, as the daemon RPC's degraded path and the controller step's diff-only path pass them.

**Returns:** `Promise<DiffGroundingResult>` — Per-file pseudo-symbols with hunks for the Story's set: its units' hunks, plus the working-tree hunks of files already in that set; changedFiles, changeSetAttribution, sharedWithExcluded and excludedFromScope.

**Errors:**
- `DiffUnavailableError` when No base was given, or git fails on the anchored derivation: the diff-only review is unavailable; the working-tree-first step and the last-commit step are removed.

**Preconditions:**
- Callers pass the Story's base and storyKey (both callers already do).

**Postconditions:**
- The diff-only review never grounds on a working-tree hunk of a file outside the Story's committed set, nor on another Story's last commit.
- Amendment: both diff-only callers treat an empty changedFiles as the same 'nothing to review' outcome — src/daemon/code-review-rpc.ts ends the stream with an error whose reason is 'no-build-record', and src/daemon/steps/code-review-step/handler.ts returns errorResult('no-build-record', ...) — before any judge runs or any record is written. The assembler itself still returns an empty grounding (a valid value), so its own tests are unchanged.

### 2.7 `collectBuildChangeLog`

```typescript
collectBuildChangeLog(repoPath: string, ctx: { author: string; timestamp: string; version?: string; base?: string; exclude?: readonly string[]; storyKey?: string }, listChanged?: (repoPath: string, opts?: ChangedFilesOptions) => Promise<readonly string[]>): Promise<ChangeLog>
```

**Parameters:**
- `ctx.storyKey: string` _(optional)_ — <epicHash>/<storyId>, forwarded so the BUILD record's changeLog follows the same anchored rule (trailer units).

**Returns:** `Promise<ChangeLog>` — The BUILD record's file-level changeLog of the Story's set; unchanged swallow of a git failure to [].

**Postconditions:**
- The completion record and the validate phase pass the Story's storyKey, so an unrelated uncommitted file never enters a BUILD record's changeLog.
- With ctx.storyKey and no ctx.base (resolveStoryRangeBase returned undefined), the seam refuses (NoBuildChangesError) and the swallow yields an empty changeLog: a Story's BUILD record never falls back to the working tree.
- Both writers (completion-record.ts and validate.ts) write changeLog whenever they pass a storyKey, even when it is empty, instead of omitting an empty one: mergeWithPrior's { ...prior.body, ...rec.body } then replaces a prior changeLog (including one contaminated by the old working-tree derivation) rather than keeping it. The md renderer already omits the ## Changes section for an empty changeLog.
- Change site (amendment): src/workflow/runners/build/standalone-record.ts persistBuildRecord prefers the prior record's body.commit over HEAD when the Story has no trailered commit; neither writer changes.

### 2.8 `withTypecheckProjects`

```typescript
withTypecheckProjects(repoPath: string, plan: ValidationCheckPlan, base?: string, storyKey?: string): ValidationCheckPlan
```

**Parameters:**
- `repoPath: string` — The repository.
- `plan: ValidationCheckPlan` — The gate's plan; plan.testFiles still always contribute their projects.
- `base: string` _(optional)_ — The Story's range base.
- `storyKey: string` _(optional)_ — <epicHash>/<storyId>; src/daemon/steps/build-step/phases/validate.ts passes it at its one call, inside the shared runValidateSession that both the plan-driven and the standalone routes enter. The trivial route's own selection is trivialCheckPlan, which validate.ts also calls with the key.

**Returns:** `ValidationCheckPlan` — Stays synchronous. With a storyKey, the private changedFiles helper lists the Story's set synchronously: storyChangeSet(repoPath, base, { storyKey, strict: true }).paths plus the uncommitted and untracked paths already in that set; with a storyKey and no base, no changed files (only plan.testFiles' projects). A listing that fails is logged and contributes nothing, as today. Without a storyKey: today's three listings.

**Postconditions:**
- With a storyKey, a project that owns only unrelated uncommitted or untracked files is not added to typecheckProjects.
- The projects of plan.testFiles are always included, whatever the change set.

### 2.9 `trivialCheckPlan`

```typescript
trivialCheckPlan(repoPath: string, base?: string | undefined, storyKey?: string | undefined): ValidationCheckPlan
```

**Parameters:**
- `storyKey: string` _(optional)_ — <epicHash>/<storyId>, passed by validate.ts's trivial route.

**Returns:** `ValidationCheckPlan` — With a storyKey and a base, the test files are those in the Story's set (storyChangeSet with strict: true) that still exist in the checkout, instead of every file in base..HEAD (the existence filter keeps today's --diff-filter=d rule: a deleted test, or one added then removed, is never asked to run); with a storyKey and no base, the listing fails as 'no range base' (listError), failing the tests check rather than running the HEAD commit's tests. Without a storyKey: unchanged.

**Postconditions:**
- A trivial build never runs another Story's tests as its own.
- A test file the Story deleted is never in the plan.

### 2.10 `splitDiffByFile`

```typescript
splitDiffByFile(body: string): Map<string, string>
```

**Parameters:**
- `body: string` — A unified-diff body, possibly the concatenation of several git diff outputs (unstaged, staged, per-unit).

**Returns:** `Map<string, string>` — Per new (b/) path, every section for that path in body order, joined with a newline; a later section is appended, never replacing an earlier one (today map.set keeps only the last). Header paths are decoded the way git writes them: an unquoted `diff --git a/<old> b/<new>` line, or a quoted one, `diff --git "a/<old>" "b/<new>"`, which git uses for a path with a tab, newline, double quote, backslash or (with core.quotePath) a non-ASCII byte; the quoted form's C escapes (\t, \n, \", \\ and octal \nnn bytes, decoded as UTF-8) are undone, so the section is keyed by the literal new path that git_diff's -z numstat reports.

**Postconditions:**
- A file with both staged and unstaged edits keeps both sets of hunks in the diff-only grounding.
- Every file git_diff lists has its hunks found by its literal path, including a renamed file and a path git quotes, so no Story file falls back to `[no hunk text for ...]` while the diff body is complete. When git_diff's body cap (256 KB by default) truncates the body, a file past the cap may still carry no hunk text; the grounding is then marked `[diff truncated — reviewed over a bounded slice]`, as today, and that limit stands.

### 2.11 `realDiffGroundingDeps().workingTreeDiff`

```typescript
workingTreeDiff(repoPath: string, excludeGlobs?: readonly string[]): Promise<DiffResult>
```

**Parameters:**
- `repoPath: string` — The repository.
- `excludeGlobs: readonly string[]` _(optional)_ — Ledger exclusions, as today.

**Returns:** `Promise<DiffResult>` — The union of the unstaged and staged diffs: per path, the file stats are summed (insertions and deletions of both), not overwritten by the staged entry; the body keeps both sections, which the accumulating splitDiffByFile then keeps per file. The anchored grounding keeps only the paths in the Story's set.

**Errors:**
- `DiffUnavailableError` when Either git diff read fails (runDiff rejects), as today.

**Postconditions:**
- No staged or unstaged hunk of a Story file is lost or double-counted when the two are combined with the Story's committed hunks. (within an untruncated body; see splitDiffByFile)

### 2.12 `runShell`

```typescript
runShell(argv: readonly string[], options?: ShellOptions): Promise<ShellResult>
```

**Parameters:**
- `argv: readonly string[]` — The command, as today.

**Returns:** `Promise<ShellResult>` — Amendment (cycle 3 round 2): stdout and stderr are decoded with a node:string_decoder StringDecoder per stream (decoder.write per chunk, decoder.end at close) instead of `chunk.toString('utf8')`, so a multibyte UTF-8 character split across two chunks is decoded whole. Byte accounting for maxBytes and stdoutTruncated is unchanged; a chunk past the cap is still dropped, and the decoder is ended so a partial character at the cut is not emitted as replacement text silently past the truncation flag.

**Postconditions:**
- A path containing multibyte characters reaches git_diff's parser exactly as git wrote it, so Story membership and hunk lookup agree for it. src/daemon/tools/shell-helper.ts is the change site; every runShell caller benefits unchanged.

### 2.13 `gitDiffTool.execute`

```typescript
gitDiffTool.execute(input: GitDiffInput, deps: ToolDeps): Promise<ToolResult>
```

**Parameters:**
- `input: GitDiffInput` — As today (cwd, from/to, staged, paths, exclusions).

**Returns:** `Promise<ToolResult>` — When the numstat command exits non-zero (the body command succeeded), the result is success: false with error naming the numstat failure, instead of success: true with an empty file list. Its consumers (changed-files.ts collectDiff and grounding.ts runDiff) already reject an unsuccessful result, so a failed stat read becomes NoBuildChangesError / DiffUnavailableError and the review declines. RENAME-SAFE PATHS (amendment, review round 3): the numstat command runs with -z, and the parser reads its NUL-delimited records: `<ins>\t<del>\t<path>\0` for a file, and `<ins>\t<del>\t\0<old path>\0<new path>\0` for a rename or copy. path is the literal new path and origPath the literal old path, never git's compact display form `dir/{a => b}/file` (which the current parser at src/daemon/tools/builtins/git/diff.ts:311 splits into `b}/file`). Paths with spaces, tabs or ` => ` in them are read literally too. CAPTURE LIMITS (amendment, cycle 3 round 1): runShell drops a whole chunk once output passes its cap and reports stdoutTruncated (src/daemon/tools/shell-helper.ts:90-115), so (a) GitDiffData.truncated is `diff.stdoutTruncated || diff.stdout.length >= maxBytes` (today it reads only the captured length, so a dropped chunk below the cap goes unmarked), and (b) a numstat read with stat.stdoutTruncated, or whose NUL-delimited records end mid-record, returns success: false naming the incomplete file list, which collectDiff and runDiff already turn into NoBuildChangesError / DiffUnavailableError.

**Errors:**
- `{ success: false, error }` when git cannot be spawned, the diff body command fails (as today), or the numstat command fails (new).
- `{ success: false, error }` when The numstat output was truncated by the capture cap, or its NUL-delimited records are incomplete: the file inventory cannot be trusted.

**Postconditions:**
- An apparently empty file list from git_diff always means git reported no changed file, never a failed read.
- Every path git_diff reports is a real repository path, so membership checks against storyChangeSet's paths (diff-tree names) and the per-file hunk lookup by the body's `b/` path agree for renamed files.
- A body that lost output is always marked truncated, and a file list that lost output is never returned as complete.

## 3. Data model changes

### 3.1 `ChangeSetAttributionReport` — field-add

excludedUncommitted: readonly string[] — the working-tree paths the anchored derivation left out because no Story commit touched them (sorted). Empty when none.

**Call sites:**
- `src/workflow/runners/build/changed-files.ts:88-92`
- `src/workflow/code-review/subject.ts:150-213`

### 3.2 `CodeReviewSubject` — field-add

excludedFromScope?: readonly string[] — the uncommitted paths left out of this review; absent when none, so a clean tree's subject is unchanged.

**Call sites:**
- `src/workflow/code-review/types.ts:166-188`
- `src/workflow/code-review/subject.ts:150-213`
- `src/daemon/code-review-rpc.ts`
- `src/daemon/steps/code-review-step/handler.ts:399-423`

### 3.3 `CodeReviewBody.subject` — field-add

excludedFromScope?: readonly string[] stamped on the review record next to changedFiles, changeSetAttribution and sharedWithExcluded, so a reader sees what was left out and why; absent when none (existing records stay valid).

**Call sites:**
- `src/workflow/code-review/runner.ts:292-310`
- `src/workflow/code-review/types.ts:231`

### 3.4 `CodeReviewSubject.changeSetAttribution` — invariant-change

A resolved subject's attribution is 'story-trailer' or 'first-parent-range'; 'working-tree' stays in the type for records written before this fix but is never produced for a Story's review.

**Call sites:**
- `src/workflow/code-review/types.ts:166-170`

## 4. Error paths

**Error cases**

- **No range base resolves for the Story (no BUILD start stamp, no resolvable commit).** (recoverable)
  - Detection: resolveStoryRangeBase returns undefined in resolveCodeReviewSubject (and the diff-only callers pass no base).
  - Response: The review declines with today's reason 'no-build-record' (the diff-only path raises DiffUnavailableError); nothing is reviewed and no record is written. It never falls back to the working tree.
  - User impact: The reviewer is told the Story has no anchored change set, instead of receiving a review of someone else's edits.
- **git fails on the anchored derivation (rev-list, trailer scan or a unit's diff).** (recoverable)
  - Detection: storyChangeSet or collectDiff throws NoBuildChangesError (DiffUnavailableError on the diff-only path).
  - Response: The subject declines with 'no-build-record' (the diff-only review is unavailable); the step-down to a plain working-tree derivation is removed. A BUILD changeLog still swallows the failure to [] as today.
  - User impact: A broken git state ends the review clearly rather than silently reviewing the tree.
- **The working tree holds uncommitted changes outside the Story's committed set (another person's work, another Story's in-progress edits).** (recoverable)
  - Detection: The working-tree diff is read after the Story's units; each path not in the Story's set is set aside.
  - Response: Left out of changedFiles and the grounding; reported on the subject and the review record as excludedFromScope (sorted); logged once per review with the count.
  - User impact: The review judges only the Story; the reader sees exactly which uncommitted files were left out.
- **The trailer scan cannot read the commit messages (git log fails) on an anchored derivation.** (recoverable)
  - Detection: storyChangeSet's scanTrailers throws instead of returning undefined, because the anchored callers pass strict: true.
  - Response: NoBuildChangesError: the review declines with 'no-build-record' (DiffUnavailableError on the diff-only path), the BUILD changeLog is empty, and the gate's typecheck selection adds no changed-file projects. The derivation never widens to the first-parent range on a failure.
  - User impact: A git failure cannot turn into a review of other Stories' commits.
- **A Story's BUILD record is written but no range base resolves for the Story.** (recoverable)
  - Detection: resolveStoryRangeBase returns undefined in completion-record.ts or validate.ts; collectBuildChangeLog is called with storyKey and no base.
  - Response: changedFiles refuses (NoBuildChangesError) and collectBuildChangeLog swallows it to []: the record carries no changeLog rather than the working tree's files.
  - User impact: The BUILD record says nothing about files rather than claiming unrelated ones.
- **The git_diff builtin's diff body command succeeds but its numstat command fails.** (recoverable)
  - Detection: stat.code !== 0 in src/daemon/tools/builtins/git/diff.ts.
  - Response: The tool returns success: false; collectDiff throws NoBuildChangesError and runDiff rejects, so the review declines with 'no-build-record' (DiffUnavailableError on the diff-only path) and a BUILD changeLog is empty.
  - User impact: A partial git failure can no longer pass as 'the Story changed nothing'.
- **The Story's anchored change set is empty.** (recoverable)
  - Detection: resolveCodeReviewSubject's changedFiles, or the diff-only grounding's changedFiles, has no entry.
  - Response: Decline with 'no-build-record' (the diff-only callers end with that reason); no judge runs and no record is written.
  - User impact: A Story with nothing attributable gets no vacuous pass verdict.
- **git_diff's numstat output is cut by the capture cap (very many files) or ends mid-record.** (recoverable)
  - Detection: stat.stdoutTruncated, or the last NUL-delimited record is incomplete.
  - Response: git_diff returns success: false; the anchored derivation declines ('no-build-record' / DiffUnavailableError) instead of reviewing a partial file list.
  - User impact: A huge change cannot silently lose files from its review.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| An uncommitted edit to a file the Story's commits already changed. | Included: the file stays in changedFiles and its working-tree hunks join the diff-only grounding; it is not reported as excluded. |
| A Story whose work is all uncommitted (no commit carries its trailer yet). | Its committed set is empty, so every working-tree path is excluded and the review declines with 'no-build-record' (graph and diff-only paths alike): no judge runs and no record is written. |
| A clean working tree. | Exactly today's committed-range result (attribution 'story-trailer' or 'first-parent-range'); excludedFromScope is absent, so the record is unchanged. |
| No commit carries the Story's trailer, but the range has the Story's first-parent commits (an older Story built before the trailer). | The legacy 'first-parent-range' set, restricted to first-parent commits that carry no Insrc-Story line; working-tree paths outside it are excluded as above. |
| An uncommitted change only to the workflow's own ledger files (.insrc/artifacts/*.json, docs/epics/**, docs/standalone/**). | Left out by the ledger exclusion before attribution, as today; not reported as excluded scope. |
| A caller with no Story (no base passed). | changedFiles keeps today's working-tree derivation; no review or BUILD record path calls it that way after this fix. |
| No commit carries the Story's trailer and every first-parent commit since the base carries another Story's trailer. | The set is empty: none of the other Stories' files are reviewed or logged; every uncommitted path is excluded and reported, and the review has nothing to judge. |
| The validate gate runs with unrelated uncommitted or untracked TypeScript files in another project. | That project is not added to typecheckProjects; the projects of the Story's files and of plan.testFiles are. |
| A legacy (untrailered) commit of this Story and another Story's trailered commit edit the same file, or the other Story later reverts this Story's change. | The kept unit's own diff is read (perUnit): only this Story's hunks are grounded and the file stays in its set; the file is reported in sharedWithExcluded. |
| A Story's BUILD record from before this fix carries a changeLog with unrelated files, and it is written again. | The new write carries the Story-scoped changeLog (possibly empty), which replaces the old one in the merged record. |
| A file in the Story's set has committed hunks, staged hunks and different unstaged hunks. | The diff-only grounding carries all three sets for that file; its stats are the sums. |
| A two-parent merge, or an octopus merge, whose message carries only another Story's Insrc-Story trailer, with or without commits carrying this Story's trailer in the range. | Its merge-edit (or whole-change) unit is left out and its paths are reported in sharedWithExcluded; an untrailered merge's edit is kept as today. |
| A pre-trailer Story (no commit carries its trailer) whose BUILD record names its build commit, with later untrailered commits by others on main (Epic c2ba6fa6 Story s1: 7d0e6402 added the ontology PRD on 2026-10-20 after s1's record at d0da1c19 on 2026-10-18). | Commits after the recorded commit are not the Story's; the ontology files are not in its set, so their uncommitted edits are excluded and listed in excludedFromScope. |
| A pre-trailer Story with no BUILD record, no commit on it, or a commit that is not on the first-parent line. | The end is ignored with a warning and the legacy range runs to HEAD, as before; untrailered commits interleaved with the Story's own build window always count (stated limit: that history carries no attribution). |
| A pre-trailer Story's BUILD record is rewritten (a validate rerun, the completion writer or an approval) after later untrailered commits landed. | Its body.commit keeps the recorded build commit; a review after the rewrite is bounded exactly as before it. |
| A Story commit renames a file, and the renamed file then has staged and unstaged edits. The new path may contain a tab or another character git quotes. | The committed unit, the review subject and the diff-only grounding all name the new path; the uncommitted edits at the new path join as the Story's (not excluded), and both sets of hunks are kept. |
| A Story started on the trivial route (first BUILD record written at implement time, body.commit equal to the base), followed by someone else's untrailered commits, with no commit carrying the Story's trailer. | The recorded end equals the base, so the legacy set is empty and the review declines with 'no-build-record'; the later untrailered commits are never the Story's. |
| A Story diff larger than git_diff's body cap. | Files past the cap are listed but may carry no hunk text, and the grounding says it is truncated; this stated limit is unchanged by this fix. |

**Invariants to preserve**

- A clean tree's change set is byte-for-byte today's committed-range result for a range with trailer units, and for a legacy range in which no commit carries another Story's trailer. A legacy range holding another Story's trailered commits changes deliberately: those commits are left out (the existing story-commits-trailer.test.ts expectation of ['src/a.ts', 'src/b.ts'] for a Story with no carrying commit becomes ['src/a.ts']). Likewise a range holding a merge whose message carries only another Story's trailer changes deliberately: that merge's edit (or octopus change) is left out. A range with no foreign commit of any kind is unchanged. Also changed deliberately: a legacy range shortened by the Story's recorded build commit (a pre-trailer Story with a BUILD record whose commit is before HEAD) leaves out the commits after it, on a clean tree too; the existing clean legacy tests have no BUILD record and are unchanged. [[c1]]
- The only decline reason of resolveCodeReviewSubject stays 'no-build-record'; CodeReviewSubjectResult's shape is unchanged. [[c2]]
- LEDGER_EXCLUDE_GLOBS and the caller's exclude list still apply to every diff the derivation runs. [[c1]]
- collectBuildChangeLog never fails a build: a git failure is still swallowed to []. [[c4]]
- Existing review records stay valid: the new excludedFromScope field is optional and absent when nothing was excluded. [[c2]]
- A trailered Story's set never depends on its BUILD record; the recorded end is read only when no commit carries the Story's trailer. [[c1]]

## 5. Test strategy

**Test framework:** `node:test with node:assert/strict, run by tsx (npx tsx --test), over throwaway git repositories created per test, as src/workflow/runners/build/__tests__/changed-files.test.ts and src/workflow/code-review/__tests__/subject-attribution.test.ts do`

**Test levels**

- **unit** — The anchored rule in the shared seam, on real git repositories with trailered commits and a dirty working tree.
  - Subjects: `src/workflow/runners/build/__tests__/changed-files.test.ts: 'with a base, an uncommitted change to a file no Story commit touched is left out and reported as excludedUncommitted, whatever else the tree holds'`, `src/workflow/runners/build/__tests__/changed-files.test.ts: 'an uncommitted edit to a file the Story's commits changed is part of the Story's set'`, `src/workflow/runners/build/__tests__/changed-files.test.ts: 'a clean tree gives exactly the committed-range set, trailer units and first-parent ranges alike'`, `src/workflow/runners/build/__tests__/story-commits-trailer.test.ts: 'with a storyKey and no commit carrying it, a commit carrying another Story's trailer is left out, and a range of only other Stories' commits gives an empty set'`, `src/workflow/runners/build/__tests__/story-commits-trailer.test.ts: 'with strict, a trailer scan that cannot read the commit messages throws NoBuildChangesError instead of falling back to the first-parent range'`, `src/workflow/runners/build/__tests__/changed-files.test.ts: 'a storyKey without a base is refused, and collectBuildChangeLog turns it into an empty changeLog, never the working tree'`, `src/daemon/steps/build-step/__tests__/validation-checks.test.ts: 'with a storyKey, typecheckProjects holds the Story's projects and its test files' projects, and not a project that owns only unrelated uncommitted or untracked files'`, `src/daemon/steps/build-step/__tests__/validation-checks.test.ts: 'with a storyKey, the trivial plan runs only the Story's test files, and with no base fails the listing instead of running the HEAD commit's tests'`, `src/workflow/runners/build/__tests__/story-commits-trailer.test.ts: 'a Story with no carrying commit keeps its untrailered commits and leaves out another Story's, so the range of src/a.ts and src/b.ts gives src/a.ts'`, `src/workflow/runners/build/__tests__/changed-files.test.ts: 'a filtered legacy range reads each kept unit's own diff: a file another Story also edited, or later reverted, carries only this Story's change'`, `src/daemon/steps/build-step/__tests__/validation-checks.test.ts: 'with a storyKey, a trivial build that deletes a test file does not ask to run it'`, `src/daemon/tools/builtins/git/__tests__/diff.test.ts: 'when the diff body command succeeds and the numstat command fails, git_diff returns success: false naming the stat failure'`, `src/workflow/runners/build/__tests__/changed-files.test.ts: 'a git_diff result that fails its stat read makes the anchored derivation refuse, never return an empty set'`, `src/workflow/runners/build/__tests__/story-commits-trailer.test.ts: 'a merge carrying only another Story's trailer is not a unit, two-parent or octopus, with and without a commit carrying this Story's trailer, while an untrailered merge edit still is'`, `src/workflow/runners/build/__tests__/story-commits-trailer.test.ts: 'a pre-trailer Story's range ends at its BUILD record's commit: a later untrailered commit is not its unit, and an end off the first-parent line is ignored'`, `src/workflow/runners/build/__tests__/story-commits-trailer.test.ts: 'the missing-trailer warning names only untrailered commits, never another Story's commit whose subject reads the same story id'`, `src/workflow/runners/build/__tests__/changed-files.test.ts: 'on a clean tree, a pre-trailer Story with a BUILD record whose commit is before HEAD leaves out the later untrailered commits'`, `src/daemon/tools/builtins/git/__tests__/diff.test.ts: 'a renamed file is reported by its literal new path and old path, including a compact rename inside a shared directory and a path with spaces'`, `src/workflow/code-review/__tests__/diff-grounding.test.ts: 'splitDiffByFile keys a quoted header by its decoded literal path: tab, newline, quote, backslash and octal UTF-8 escapes'`, `src/workflow/runners/build/__tests__/story-commits-trailer.test.ts: 'a pre-trailer Story whose recorded end equals its base (the trivial route's first record) has an empty set, even after someone else's untrailered commits'`, `src/daemon/tools/builtins/git/__tests__/diff.test.ts: 'a body whose capture dropped output is marked truncated even when the captured text is under the cap, and a numstat read that was truncated or ends mid-record fails the call'`, `src/daemon/tools/__tests__/shell-helper.test.ts: 'a multibyte UTF-8 character split across two output chunks is decoded whole, and the byte cap and truncation flag are unchanged'`
  - Fixtures: `a git repository with a base commit, two commits carrying the Story's Insrc-Story trailer, one carrying another Story's, and unstaged, staged and untracked-then-added changes inside and outside the Story's files`, `a range where the only commits carry other Stories' trailers; a repository whose git log fails (for example, a corrupted object in the range) for the strict scan; a nested project with its own tsconfig.json holding an unrelated untracked file`, `a git_diff run whose numstat command is made to fail while the body command succeeds (an injected exec seam)`, `a repository with untrailered Story commits, a BUILD record whose body.commit names the last of them, and a later untrailered commit by someone else touching other files`
- **integration** — Every consumer follows the rule: the review subject, the diff-only grounding, the BUILD records.
  - Subjects: `src/workflow/code-review/__tests__/subject-attribution.test.ts: 'a Story's review subject is its trailered commits plus edits of its own files; unrelated uncommitted files are left out and listed in excludedFromScope, and the attribution is never working-tree'`, `src/workflow/code-review/__tests__/subject-attribution.test.ts: 'with no resolvable range base, or git failing on the anchored derivation, the review declines with no-build-record and never reviews the working tree'`, `src/workflow/code-review/__tests__/diff-attribution.test.ts: 'the diff-only grounding carries the Story's units and the working-tree hunks of its own files only, never an unrelated file's hunks or another Story's last commit'`, `src/workflow/runners/build/__tests__/changed-files.test.ts: 'a BUILD record's changeLog, from the completion writer and the validate phase, holds the Story's files and none of an unrelated uncommitted change'`, `src/workflow/code-review/__tests__/runner.test.ts: 'the review record stamps excludedFromScope beside changedFiles when uncommitted files were left out, and omits it when none were'`, `src/workflow/code-review/__tests__/diff-attribution.test.ts: 'storyRangeDiff on a filtered legacy range grounds only the kept units' hunks of a file another Story also edited'`, `src/workflow/runners/build/__tests__/changed-files.test.ts: 'rewriting a BUILD record whose changeLog held unrelated files replaces it with the Story-scoped changeLog, empty included'`, `src/workflow/code-review/__tests__/diff-attribution.test.ts: 'a Story file with distinct staged and unstaged edits keeps both sets of hunks, and its stats are their sum, in the diff-only grounding'`, `src/workflow/code-review/__tests__/subject-attribution.test.ts: 'a pre-trailer Story's review leaves out an uncommitted edit of a file only a commit after its recorded build commit touched'`, `src/workflow/runners/build/__tests__/build-record.test.ts: 'a pre-trailer Story's BUILD record keeps its recorded commit through validate reruns and the completion rewrite after later untrailered commits, and a review after them stays bounded; a trailered commit advances it'`, `src/daemon/steps/build-step/__tests__/build-step.test.ts: 'the validate phase's changeLog leaves out another Story's commit and replaces a stale changeLog (ISSUE-b97752e9)'`, `src/daemon/steps/build-step/__tests__/build-step.test.ts: 'CHARACTERISATION C (TRIVIAL route — NOT a defect, re-labelled at t6): a CLEAN tree with NO upstream yields an empty changeLog and no '## Changes' section'`, `src/workflow/code-review/__tests__/diff-attribution.test.ts: 'a Story commit that renames a file, to a path with a tab in it, is reviewed at the new path, and its committed, staged and unstaged hunks are all grounded there'`, `src/workflow/code-review/__tests__/subject-attribution.test.ts: 'a Story with no attributable change declines with no-build-record on the graph path and both diff-only callers, runs no judge and writes no record'`, `src/workflow/code-review/__tests__/diff-attribution.test.ts: 'a Story file whose path has multibyte characters is in the Story set, the review subject and the diff-only grounding with its hunks'`
  - Fixtures: `the same repository fixture, with approved LLD and PLAN artifacts for the Story`
- **smoke** — The observed failure, on the installed daemon: a Story's review with unrelated uncommitted files in the tree.
  - Subjects: `Installed daemon: Epic c2ba6fa6 Story s1's code review, run while unrelated files are uncommitted, reviews only the Story's committed files and lists the unrelated ones as excludedFromScope on the record (recorded in the BUILD record)`
  - Fixtures: `the installed daemon updated to this fix`, `an uncommitted change outside Story s1's files`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `src/workflow/runners/build/__tests__/changed-files.test.ts: 'with a base, an uncommitted change to a file no Story commit touched is left out and reported as excludedUncommitted, whatever else the tree holds'`, `src/workflow/code-review/__tests__/subject-attribution.test.ts: 'a Story's review subject is its trailered commits plus edits of its own files; unrelated uncommitted files are left out and listed in excludedFromScope, and the attribution is never working-tree'`, `src/workflow/code-review/__tests__/runner.test.ts: 'the review record stamps excludedFromScope beside changedFiles when uncommitted files were left out, and omits it when none were'`, `src/workflow/runners/build/__tests__/story-commits-trailer.test.ts: 'with a storyKey and no commit carrying it, a commit carrying another Story's trailer is left out, and a range of only other Stories' commits gives an empty set'`, `src/workflow/runners/build/__tests__/story-commits-trailer.test.ts: 'a Story with no carrying commit keeps its untrailered commits and leaves out another Story's, so the range of src/a.ts and src/b.ts gives src/a.ts'`, `src/workflow/runners/build/__tests__/story-commits-trailer.test.ts: 'a merge carrying only another Story's trailer is not a unit, two-parent or octopus, with and without a commit carrying this Story's trailer, while an untrailered merge edit still is'`, `src/workflow/runners/build/__tests__/story-commits-trailer.test.ts: 'a pre-trailer Story's range ends at its BUILD record's commit: a later untrailered commit is not its unit, and an end off the first-parent line is ignored'`, `src/workflow/code-review/__tests__/subject-attribution.test.ts: 'a pre-trailer Story's review leaves out an uncommitted edit of a file only a commit after its recorded build commit touched'`, `src/workflow/runners/build/__tests__/build-record.test.ts: 'a pre-trailer Story's BUILD record keeps its recorded commit through validate reruns and the completion rewrite after later untrailered commits, and a review after them stays bounded; a trailered commit advances it'`, `src/workflow/runners/build/__tests__/story-commits-trailer.test.ts: 'a pre-trailer Story whose recorded end equals its base (the trivial route's first record) has an empty set, even after someone else's untrailered commits'` |
| `ac2` | `src/workflow/runners/build/__tests__/changed-files.test.ts: 'an uncommitted edit to a file the Story's commits changed is part of the Story's set'`, `src/workflow/runners/build/__tests__/changed-files.test.ts: 'a clean tree gives exactly the committed-range set, trailer units and first-parent ranges alike'`, `src/workflow/runners/build/__tests__/changed-files.test.ts: 'a filtered legacy range reads each kept unit's own diff: a file another Story also edited, or later reverted, carries only this Story's change'`, `src/workflow/code-review/__tests__/diff-attribution.test.ts: 'a Story file with distinct staged and unstaged edits keeps both sets of hunks, and its stats are their sum, in the diff-only grounding'`, `src/workflow/runners/build/__tests__/changed-files.test.ts: 'on a clean tree, a pre-trailer Story with a BUILD record whose commit is before HEAD leaves out the later untrailered commits'`, `src/daemon/tools/builtins/git/__tests__/diff.test.ts: 'a renamed file is reported by its literal new path and old path, including a compact rename inside a shared directory and a path with spaces'`, `src/workflow/code-review/__tests__/diff-attribution.test.ts: 'a Story commit that renames a file, to a path with a tab in it, is reviewed at the new path, and its committed, staged and unstaged hunks are all grounded there'`, `src/workflow/code-review/__tests__/diff-grounding.test.ts: 'splitDiffByFile keys a quoted header by its decoded literal path: tab, newline, quote, backslash and octal UTF-8 escapes'`, `src/daemon/tools/__tests__/shell-helper.test.ts: 'a multibyte UTF-8 character split across two output chunks is decoded whole, and the byte cap and truncation flag are unchanged'`, `src/workflow/code-review/__tests__/diff-attribution.test.ts: 'a Story file whose path has multibyte characters is in the Story set, the review subject and the diff-only grounding with its hunks'` |
| `ac3` | `src/workflow/code-review/__tests__/subject-attribution.test.ts: 'with no resolvable range base, or git failing on the anchored derivation, the review declines with no-build-record and never reviews the working tree'`, `src/workflow/runners/build/__tests__/story-commits-trailer.test.ts: 'with strict, a trailer scan that cannot read the commit messages throws NoBuildChangesError instead of falling back to the first-parent range'`, `src/workflow/runners/build/__tests__/changed-files.test.ts: 'a storyKey without a base is refused, and collectBuildChangeLog turns it into an empty changeLog, never the working tree'`, `src/daemon/tools/builtins/git/__tests__/diff.test.ts: 'when the diff body command succeeds and the numstat command fails, git_diff returns success: false naming the stat failure'`, `src/workflow/runners/build/__tests__/changed-files.test.ts: 'a git_diff result that fails its stat read makes the anchored derivation refuse, never return an empty set'`, `src/workflow/code-review/__tests__/subject-attribution.test.ts: 'a Story with no attributable change declines with no-build-record on the graph path and both diff-only callers, runs no judge and writes no record'`, `src/daemon/tools/builtins/git/__tests__/diff.test.ts: 'a body whose capture dropped output is marked truncated even when the captured text is under the cap, and a numstat read that was truncated or ends mid-record fails the call'` |
| `ac4` | `src/workflow/code-review/__tests__/diff-attribution.test.ts: 'the diff-only grounding carries the Story's units and the working-tree hunks of its own files only, never an unrelated file's hunks or another Story's last commit'`, `src/workflow/runners/build/__tests__/changed-files.test.ts: 'a BUILD record's changeLog, from the completion writer and the validate phase, holds the Story's files and none of an unrelated uncommitted change'`, `src/daemon/steps/build-step/__tests__/validation-checks.test.ts: 'with a storyKey, typecheckProjects holds the Story's projects and its test files' projects, and not a project that owns only unrelated uncommitted or untracked files'`, `src/daemon/steps/build-step/__tests__/validation-checks.test.ts: 'with a storyKey, the trivial plan runs only the Story's test files, and with no base fails the listing instead of running the HEAD commit's tests'`, `src/workflow/code-review/__tests__/diff-attribution.test.ts: 'storyRangeDiff on a filtered legacy range grounds only the kept units' hunks of a file another Story also edited'`, `src/daemon/steps/build-step/__tests__/validation-checks.test.ts: 'with a storyKey, a trivial build that deletes a test file does not ask to run it'`, `src/workflow/runners/build/__tests__/changed-files.test.ts: 'rewriting a BUILD record whose changeLog held unrelated files replaces it with the Story-scoped changeLog, empty included'`, `src/workflow/runners/build/__tests__/story-commits-trailer.test.ts: 'the missing-trailer warning names only untrailered commits, never another Story's commit whose subject reads the same story id'`, `src/daemon/steps/build-step/__tests__/build-step.test.ts: 'the validate phase's changeLog leaves out another Story's commit and replaces a stale changeLog (ISSUE-b97752e9)'`, `src/daemon/steps/build-step/__tests__/build-step.test.ts: 'CHARACTERISATION C (TRIVIAL route — NOT a defect, re-labelled at t6): a CLEAN tree with NO upstream yields an empty changeLog and no '## Changes' section'` |
| `ac5` | `Installed daemon: Epic c2ba6fa6 Story s1's code review, run while unrelated files are uncommitted, reviews only the Story's committed files and lists the unrelated ones as excludedFromScope on the record (recorded in the BUILD record)` |

## 6. Migration

**State before:** changedFiles returns the whole working-tree diff as the Story's change set whenever the tree is dirty, and reads the Story's trailered commits only on a clean tree (src/workflow/runners/build/changed-files.ts:142-178, c1). The review subject steps down from the anchored derivation to two working-tree-only derivations on a git failure (src/workflow/code-review/subject.ts:150-213, c2); the diff-only grounding reads the working tree first and, with no base, the last commit (src/workflow/code-review/grounding.ts:282-320, c3). The BUILD record writers call collectBuildChangeLog without a storyKey, and the validate gate lists typecheck projects from base..HEAD plus every uncommitted and untracked file (c4). On 2026-10-21 this reviewed six unrelated ontology files as Epic c2ba6fa6 Story s1 (ISSUE-b97752e9c7cee6fe). Build progress at this amendment (2026-10-21): migration steps for the shared seam, review subject, diff-only grounding, record field, BUILD writers and validate gate are built (plan tasks t1-t7, commits 873c4c3e..a0a031cf); the pre-trailer range end, the stable recorded end and rename-safe git_diff paths are the remaining work, followed by the installed-daemon smoke.

**State after:** With a Story's base, changedFiles always anchors on the Story's commits (trailer units, else its first-parent own paths) and adds only working-tree edits of files in that set; every other uncommitted path is reported (excludedUncommitted) and, on a review, stamped on the subject and the record as excludedFromScope. The review subject and the diff-only grounding have no working-tree or last-commit fallback: without a base, or when git fails, they decline. The BUILD records pass the Story's storyKey, and the validate gate selects typecheck projects from the same Story set. A clean tree's results are unchanged.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Change the shared seam's order for callers that pass a base: anchor on the Story's units, then add working-tree paths already in the set, and report the rest; add excludedUncommitted to the attribution report. storyChangeSet gains strict and, with a storyKey but no carrying commit, leaves out commits carrying another Story's trailer; changedFiles refuses a storyKey without a base. It also returns perUnit, which changedFiles uses to choose per-unit diffs. The trailer scan also records foreign commits, and the foreign rule applies to merge-edit and octopus units too. — ↩ rollbackable
2. Add resolveStoryRangeEnd and end a pre-trailer Story's legacy range at its recorded build commit inside storyChangeSet; restrict the missing-trailer warning to untrailered commits. persistBuildRecord keeps a prior body.commit instead of refreshing it to HEAD when the Story has no trailered commit, so the end never moves for a pre-trailer Story. — ↩ rollbackable
3. Read git_diff's numstat with -z so a renamed file is reported by its literal paths. splitDiffByFile decodes git's quoted diff headers so hunks are keyed by the same literal paths. git_diff marks the body truncated from the shell's stdoutTruncated flag and fails a truncated or incomplete numstat read. runShell decodes output with a StringDecoder so multibyte paths survive chunk boundaries. — ↩ rollbackable
4. Remove the review subject's two working-tree fallbacks, carry excludedFromScope on the subject, and update its module header to the new rule. — ↩ rollbackable
5. Apply the same rule in the diff-only grounding (Story units plus own-file working-tree hunks; no working-tree-first or last-commit step) and in both diff-only callers. storyRangeDiff selects per-unit reads by set.perUnit. splitDiffByFile accumulates every section per file and workingTreeDiff sums staged and unstaged stats. — ↩ rollbackable
6. Stamp excludedFromScope on the review record (optional field, absent when none). — ↩ rollbackable
7. Pass the Story's storyKey from the BUILD completion writer and the validate phase (an unresolved base then yields an empty changeLog), and pass it to withTypecheckProjects and trivialCheckPlan (both stay synchronous, through storyChangeSet with strict) at both validate.ts call sites. Both writers write the changeLog even when empty, so a re-write replaces a contaminated prior one; trivialCheckPlan keeps only Story test files that still exist. — ↩ rollbackable
8. Make the git_diff builtin fail (success: false) when its numstat command fails. — ↩ rollbackable
9. Decline an empty anchored set with 'no-build-record' in resolveCodeReviewSubject and both diff-only callers; replace the 'empty diff is a valid trivial subject' and 'later persist REFRESHES to HEAD' expectations. — ↩ rollbackable
10. Update the tests (including validation-checks.test.ts's uncommitted/untracked expectations, now only without a storyKey) that asserted working-tree-first scoping; rebuild and update the installed daemon; re-run the observed case (a review with unrelated uncommitted files) on it. — ↩ rollbackable

**Backward compat:** No IPC payload or public signature changes: changedFiles, resolveCodeReviewSubject, assembleDiffCodeReviewGrounding and collectBuildChangeLog keep their signatures (one optional ctx field, storyKey, is added to collectBuildChangeLog). New record fields (excludedFromScope, excludedUncommitted) are optional and absent when nothing is excluded, so existing records validate. 'working-tree' stays in the ChangeSetAttribution type so older records still parse. Behaviour change by design: a review that used to judge a dirty tree now judges the Story's commits and lists the rest; a review with no resolvable base now declines. Deliberate behaviour change for legacy ranges containing other Stories' trailered commits; the affected trailer-test expectation is updated. git_diff now reports a failed numstat read as a failure; every consumer already handles success: false. Amendment: a pre-trailer Story's legacy range now ends at its recorded build commit, so later untrailered commits leave its set; trailered Stories are unaffected.

## 7. Alternatives considered

### 7.1 a1: The Story's commits decide the scope; uncommitted changes join only through its own files — **CHOSEN**

Derive the Story's set from its trailer-scoped commits first; add an uncommitted change only when it touches a file in that set; report every other uncommitted path as excluded; no blind fallback.

One rule in the shared seam (changedFiles), used by every caller that knows the Story. With a base and a storyKey, the Story's set is its trailer-scoped units (storyChangeSet), exactly as today's clean-tree path computes it; the working-tree diff is then read and split: a changed path already in the Story's set is added (an in-progress edit of the Story's own file), every other path is excluded and reported through onAttribution as excludedUncommitted. The attribution says 'story-trailer' (or 'first-parent-range' when no commit carries the trailer). Without a resolvable base the Story has no committed work to anchor on: the review declines rather than reviewing the tree. The code-review subject drops its two working-tree fallbacks (a git failure on the anchored derivation declines with today's 'no-build-record'), carries excludedFromScope on the subject and the record, and its header states the new rule. The diff-only grounding applies the same rule to its hunks (Story units, plus uncommitted hunks of the Story's own files) and loses its working-tree-first and last-commit steps. The BUILD record collectors pass the storyKey so their changeLog follows the same rule.

### 7.2 a2: Attribute uncommitted files also by the Story's own records

As a1, but an uncommitted file also counts as the Story's when its PLAN tasks or BUILD record name it, so pre-commit work can be reviewed.

Everything in a1, plus a second attribution source for uncommitted paths: the files the approved PLAN's tasks or the BUILD record's changeLog name. An uncommitted path is the Story's when its commits touched it OR its records name it; everything else is excluded and reported. This lets a review run before the Story's first commit, provided its records name the files.

**Rejected because:** Meets the intent but adds an attribution source the intent does not ask for, and the BUILD changeLog source is circular.

### 7.3 a3: Refuse to review a dirty tree

Keep today's derivation, but when the working tree has any uncommitted change outside the ledger, decline the review and list the dirty paths.

The subject resolver and the diff-only path check the working tree first; any non-ledger uncommitted path makes the review decline with a new reason naming the paths. A clean tree reviews the Story's trailer-scoped range as today.

**Rejected because:** Refuses instead of scoping: it does not exclude unrelated changes from the scope, it stops the review.

## 8. References

- **[[c1]]** `analyze-bundle` `s1.analyzeBundles[0]: How the Story's change set is derived today (the shared seam)`
- **[[c2]]** `analyze-bundle` `s1.analyzeBundles[1]: The code-review subject's resolution and its blind fallbacks`
- **[[c3]]** `analyze-bundle` `s1.analyzeBundles[2]: The diff-only (degraded) grounding's own sequence and its callers`
- **[[c4]]** `analyze-bundle` `s1.analyzeBundles[3]: The BUILD records that share the derivation`
- **[[c5]]** `analyze-bundle` `s1.analyzeBundles[4]: Existing tests that pin today's working-tree-first behaviour`
- **[[c6]]** `stakeholder` `s1.analyzeBundles[5]: The rule the fix must follow`
- **[[c7]]** `prior-artifact` `ISSUE-b97752e9c7cee6fe`
- **[[c8]]** `step-output` `s2 alternatives`
- **[[c9]]** `step-output` `s3 judge`
- **[[c10]]** `step-output` `s4 contract`
- **[[c11]]** `step-output` `s5 error paths`
- **[[c12]]** `step-output` `s6 test strategy`
- **[[c13]]** `step-output` `s7 migration`
- **[[c14]]** `step-output` `s8 checklist`
