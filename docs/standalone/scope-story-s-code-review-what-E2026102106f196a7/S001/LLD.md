<!-- insrc:artifact LLD-06f196a7ff528143-S001 -->

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
- A base, when given, is a commit the repository can resolve (resolveStoryRangeBase).

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

**Returns:** `AttributedStoryChangeSet` — With commits carrying the Story's trailer: those units ('story-trailer'), as today. With a storyKey and NO commit carrying it: the first-parent commits that carry NO Insrc-Story line at all ('first-parent-range', the legacy pre-trailer Story); a commit carrying another Story's trailer is left out and its paths count as excluded (sharedWithExcluded). When every commit in the range belongs to another Story, the set is empty. Without a storyKey: unchanged. The result gains perUnit: boolean — true for 'story-trailer' and for a legacy range from which at least one other-Story commit was left out; false only for an unfiltered legacy range.

**Errors:**
- `NoBuildChangesError` when git fails on rev-list or a unit's diff (as today); with strict: true, also when the trailer scan cannot read the commit messages (today it logs and falls back).

**Preconditions:**
- base resolves in the repository.

**Postconditions:**
- With a storyKey, the set never contains a unit from a commit carrying another Story's Insrc-Story trailer.
- With strict: true, the attribution is never widened by a git failure.
- perUnit is false exactly when the result equals today's unfiltered first-parent range, so the net-range read stays valid only there.

### 2.3 `storyRangeDiff`

```typescript
storyRangeDiff(repoPath: string, base: string, set: StoryChangeSet & { readonly attribution?: StoryAttribution | undefined; readonly perUnit?: boolean | undefined }, excludeGlobs: readonly string[] | undefined, run?: (repoPath: string, input: Record<string, unknown>) => Promise<DiffResult>): Promise<DiffResult>
```

**Parameters:**
- `set: StoryChangeSet & { attribution?, perUnit? }` — The Story's change set; perUnit decides the read.

**Returns:** `Promise<DiffResult>` — With set.perUnit true, every path is read from the kept units' own diffs (today's 'story-trailer' branch: shared = set.paths); otherwise unchanged (net base..HEAD for plain paths, per-unit for sharedPaths).

**Postconditions:**
- A filtered legacy range never grounds on another Story's hunks of a file both changed, nor loses this Story's change to a later revert by another Story.

### 2.4 `resolveCodeReviewSubject`

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

**Preconditions:**
- The Story's build commits carry its Insrc-Story trailer (the tracked build's commit rule).

**Postconditions:**
- changeSetAttribution is never 'working-tree' on a resolved subject.
- The module header states the rule: the Story's commits decide its scope; the working tree only adds edits of its own files.

### 2.5 `assembleDiffCodeReviewGrounding`

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

### 2.6 `collectBuildChangeLog`

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

### 2.7 `withTypecheckProjects`

```typescript
withTypecheckProjects(repoPath: string, plan: ValidationCheckPlan, base?: string, storyKey?: string): ValidationCheckPlan
```

**Parameters:**
- `repoPath: string` — The repository.
- `plan: ValidationCheckPlan` — The gate's plan; plan.testFiles still always contribute their projects.
- `base: string` _(optional)_ — The Story's range base.
- `storyKey: string` _(optional)_ — <epicHash>/<storyId>; validate.ts passes it at both call sites (the plan-driven runValidateSession and the trivial route).

**Returns:** `ValidationCheckPlan` — Stays synchronous. With a storyKey, the private changedFiles helper lists the Story's set synchronously: storyChangeSet(repoPath, base, { storyKey, strict: true }).paths plus the uncommitted and untracked paths already in that set; with a storyKey and no base, no changed files (only plan.testFiles' projects). A listing that fails is logged and contributes nothing, as today. Without a storyKey: today's three listings.

**Postconditions:**
- With a storyKey, a project that owns only unrelated uncommitted or untracked files is not added to typecheckProjects.
- The projects of plan.testFiles are always included, whatever the change set.

### 2.8 `trivialCheckPlan`

```typescript
trivialCheckPlan(repoPath: string, base?: string | undefined, storyKey?: string | undefined): ValidationCheckPlan
```

**Parameters:**
- `storyKey: string` _(optional)_ — <epicHash>/<storyId>, passed by validate.ts's trivial route.

**Returns:** `ValidationCheckPlan` — With a storyKey and a base, the test files are those in the Story's set (storyChangeSet with strict: true) that still exist in the checkout, instead of every file in base..HEAD (the existence filter keeps today's --diff-filter=d rule: a deleted test, or one added then removed, is never asked to run); with a storyKey and no base, the listing fails as 'no range base' (listError), failing the tests check rather than running the HEAD commit's tests. Without a storyKey: unchanged.

**Postconditions:**
- A trivial build never runs another Story's tests as its own.
- A test file the Story deleted is never in the plan.

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

**Edge cases**

| Input | Expected |
| :--- | :--- |
| An uncommitted edit to a file the Story's commits already changed. | Included: the file stays in changedFiles and its working-tree hunks join the diff-only grounding; it is not reported as excluded. |
| A Story whose work is all uncommitted (no commit carries its trailer yet). | Its committed set is empty, so every working-tree path is excluded and reported; the subject resolves with an empty changedFiles, which today's review already treats as nothing to judge. |
| A clean working tree. | Exactly today's committed-range result (attribution 'story-trailer' or 'first-parent-range'); excludedFromScope is absent, so the record is unchanged. |
| No commit carries the Story's trailer, but the range has the Story's first-parent commits (an older Story built before the trailer). | The legacy 'first-parent-range' set, restricted to first-parent commits that carry no Insrc-Story line; working-tree paths outside it are excluded as above. |
| An uncommitted change only to the workflow's own ledger files (.insrc/artifacts/*.json, docs/epics/**, docs/standalone/**). | Left out by the ledger exclusion before attribution, as today; not reported as excluded scope. |
| A caller with no Story (no base passed). | changedFiles keeps today's working-tree derivation; no review or BUILD record path calls it that way after this fix. |
| No commit carries the Story's trailer and every first-parent commit since the base carries another Story's trailer. | The set is empty: none of the other Stories' files are reviewed or logged; every uncommitted path is excluded and reported, and the review has nothing to judge. |
| The validate gate runs with unrelated uncommitted or untracked TypeScript files in another project. | That project is not added to typecheckProjects; the projects of the Story's files and of plan.testFiles are. |
| A legacy (untrailered) commit of this Story and another Story's trailered commit edit the same file, or the other Story later reverts this Story's change. | The kept unit's own diff is read (perUnit): only this Story's hunks are grounded and the file stays in its set; the file is reported in sharedWithExcluded. |
| A Story's BUILD record from before this fix carries a changeLog with unrelated files, and it is written again. | The new write carries the Story-scoped changeLog (possibly empty), which replaces the old one in the merged record. |

**Invariants to preserve**

- A clean tree's change set is byte-for-byte today's committed-range result for a range with trailer units, and for a legacy range in which no commit carries another Story's trailer. A legacy range holding another Story's trailered commits changes deliberately: those commits are left out (the existing story-commits-trailer.test.ts expectation of ['src/a.ts', 'src/b.ts'] for a Story with no carrying commit becomes ['src/a.ts']). [[c1]]
- The only decline reason of resolveCodeReviewSubject stays 'no-build-record'; CodeReviewSubjectResult's shape is unchanged. [[c2]]
- LEDGER_EXCLUDE_GLOBS and the caller's exclude list still apply to every diff the derivation runs. [[c1]]
- collectBuildChangeLog never fails a build: a git failure is still swallowed to []. [[c4]]
- Existing review records stay valid: the new excludedFromScope field is optional and absent when nothing was excluded. [[c2]]

## 5. Test strategy

**Test framework:** `node:test with node:assert/strict, run by tsx (npx tsx --test), over throwaway git repositories created per test, as src/workflow/runners/build/__tests__/changed-files.test.ts and src/workflow/code-review/__tests__/subject-attribution.test.ts do`

**Test levels**

- **unit** — The anchored rule in the shared seam, on real git repositories with trailered commits and a dirty working tree.
  - Subjects: `src/workflow/runners/build/__tests__/changed-files.test.ts: 'with a base, an uncommitted change to a file no Story commit touched is left out and reported as excludedUncommitted, whatever else the tree holds'`, `src/workflow/runners/build/__tests__/changed-files.test.ts: 'an uncommitted edit to a file the Story's commits changed is part of the Story's set'`, `src/workflow/runners/build/__tests__/changed-files.test.ts: 'a clean tree gives exactly the committed-range set, trailer units and first-parent ranges alike'`, `src/workflow/runners/build/__tests__/story-commits-trailer.test.ts: 'with a storyKey and no commit carrying it, a commit carrying another Story's trailer is left out, and a range of only other Stories' commits gives an empty set'`, `src/workflow/runners/build/__tests__/story-commits-trailer.test.ts: 'with strict, a trailer scan that cannot read the commit messages throws NoBuildChangesError instead of falling back to the first-parent range'`, `src/workflow/runners/build/__tests__/changed-files.test.ts: 'a storyKey without a base is refused, and collectBuildChangeLog turns it into an empty changeLog, never the working tree'`, `src/daemon/steps/build-step/__tests__/validation-checks.test.ts: 'with a storyKey, typecheckProjects holds the Story's projects and its test files' projects, and not a project that owns only unrelated uncommitted or untracked files'`, `src/daemon/steps/build-step/__tests__/validation-checks.test.ts: 'with a storyKey, the trivial plan runs only the Story's test files, and with no base fails the listing instead of running the HEAD commit's tests'`, `src/workflow/runners/build/__tests__/story-commits-trailer.test.ts: 'a Story with no carrying commit keeps its untrailered commits and leaves out another Story's, so the range of src/a.ts and src/b.ts gives src/a.ts'`, `src/workflow/runners/build/__tests__/changed-files.test.ts: 'a filtered legacy range reads each kept unit's own diff: a file another Story also edited, or later reverted, carries only this Story's change'`, `src/daemon/steps/build-step/__tests__/validation-checks.test.ts: 'with a storyKey, a trivial build that deletes a test file does not ask to run it'`
  - Fixtures: `a git repository with a base commit, two commits carrying the Story's Insrc-Story trailer, one carrying another Story's, and unstaged, staged and untracked-then-added changes inside and outside the Story's files`, `a range where the only commits carry other Stories' trailers; a repository whose git log fails (for example, a corrupted object in the range) for the strict scan; a nested project with its own tsconfig.json holding an unrelated untracked file`
- **integration** — Every consumer follows the rule: the review subject, the diff-only grounding, the BUILD records.
  - Subjects: `src/workflow/code-review/__tests__/subject-attribution.test.ts: 'a Story's review subject is its trailered commits plus edits of its own files; unrelated uncommitted files are left out and listed in excludedFromScope, and the attribution is never working-tree'`, `src/workflow/code-review/__tests__/subject-attribution.test.ts: 'with no resolvable range base, or git failing on the anchored derivation, the review declines with no-build-record and never reviews the working tree'`, `src/workflow/code-review/__tests__/diff-attribution.test.ts: 'the diff-only grounding carries the Story's units and the working-tree hunks of its own files only, never an unrelated file's hunks or another Story's last commit'`, `src/workflow/runners/build/__tests__/changed-files.test.ts: 'a BUILD record's changeLog, from the completion writer and the validate phase, holds the Story's files and none of an unrelated uncommitted change'`, `src/workflow/code-review/__tests__/runner.test.ts: 'the review record stamps excludedFromScope beside changedFiles when uncommitted files were left out, and omits it when none were'`, `src/workflow/code-review/__tests__/diff-attribution.test.ts: 'storyRangeDiff on a filtered legacy range grounds only the kept units' hunks of a file another Story also edited'`, `src/workflow/runners/build/__tests__/changed-files.test.ts: 'rewriting a BUILD record whose changeLog held unrelated files replaces it with the Story-scoped changeLog, empty included'`
  - Fixtures: `the same repository fixture, with approved LLD and PLAN artifacts for the Story`
- **smoke** — The observed failure, on the installed daemon: a Story's review with unrelated uncommitted files in the tree.
  - Subjects: `Installed daemon: Epic c2ba6fa6 Story s1's code review, run while unrelated files are uncommitted, reviews only the Story's committed files and lists the unrelated ones as excludedFromScope on the record (recorded in the BUILD record)`
  - Fixtures: `the installed daemon updated to this fix`, `an uncommitted change outside Story s1's files`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `src/workflow/runners/build/__tests__/changed-files.test.ts: 'with a base, an uncommitted change to a file no Story commit touched is left out and reported as excludedUncommitted, whatever else the tree holds'`, `src/workflow/code-review/__tests__/subject-attribution.test.ts: 'a Story's review subject is its trailered commits plus edits of its own files; unrelated uncommitted files are left out and listed in excludedFromScope, and the attribution is never working-tree'`, `src/workflow/code-review/__tests__/runner.test.ts: 'the review record stamps excludedFromScope beside changedFiles when uncommitted files were left out, and omits it when none were'`, `src/workflow/runners/build/__tests__/story-commits-trailer.test.ts: 'with a storyKey and no commit carrying it, a commit carrying another Story's trailer is left out, and a range of only other Stories' commits gives an empty set'`, `src/workflow/runners/build/__tests__/story-commits-trailer.test.ts: 'a Story with no carrying commit keeps its untrailered commits and leaves out another Story's, so the range of src/a.ts and src/b.ts gives src/a.ts'` |
| `ac2` | `src/workflow/runners/build/__tests__/changed-files.test.ts: 'an uncommitted edit to a file the Story's commits changed is part of the Story's set'`, `src/workflow/runners/build/__tests__/changed-files.test.ts: 'a clean tree gives exactly the committed-range set, trailer units and first-parent ranges alike'`, `src/workflow/runners/build/__tests__/changed-files.test.ts: 'a filtered legacy range reads each kept unit's own diff: a file another Story also edited, or later reverted, carries only this Story's change'` |
| `ac3` | `src/workflow/code-review/__tests__/subject-attribution.test.ts: 'with no resolvable range base, or git failing on the anchored derivation, the review declines with no-build-record and never reviews the working tree'`, `src/workflow/runners/build/__tests__/story-commits-trailer.test.ts: 'with strict, a trailer scan that cannot read the commit messages throws NoBuildChangesError instead of falling back to the first-parent range'`, `src/workflow/runners/build/__tests__/changed-files.test.ts: 'a storyKey without a base is refused, and collectBuildChangeLog turns it into an empty changeLog, never the working tree'` |
| `ac4` | `src/workflow/code-review/__tests__/diff-attribution.test.ts: 'the diff-only grounding carries the Story's units and the working-tree hunks of its own files only, never an unrelated file's hunks or another Story's last commit'`, `src/workflow/runners/build/__tests__/changed-files.test.ts: 'a BUILD record's changeLog, from the completion writer and the validate phase, holds the Story's files and none of an unrelated uncommitted change'`, `src/daemon/steps/build-step/__tests__/validation-checks.test.ts: 'with a storyKey, typecheckProjects holds the Story's projects and its test files' projects, and not a project that owns only unrelated uncommitted or untracked files'`, `src/daemon/steps/build-step/__tests__/validation-checks.test.ts: 'with a storyKey, the trivial plan runs only the Story's test files, and with no base fails the listing instead of running the HEAD commit's tests'`, `src/workflow/code-review/__tests__/diff-attribution.test.ts: 'storyRangeDiff on a filtered legacy range grounds only the kept units' hunks of a file another Story also edited'`, `src/daemon/steps/build-step/__tests__/validation-checks.test.ts: 'with a storyKey, a trivial build that deletes a test file does not ask to run it'`, `src/workflow/runners/build/__tests__/changed-files.test.ts: 'rewriting a BUILD record whose changeLog held unrelated files replaces it with the Story-scoped changeLog, empty included'` |
| `ac5` | `Installed daemon: Epic c2ba6fa6 Story s1's code review, run while unrelated files are uncommitted, reviews only the Story's committed files and lists the unrelated ones as excludedFromScope on the record (recorded in the BUILD record)` |

## 6. Migration

**State before:** changedFiles returns the whole working-tree diff as the Story's change set whenever the tree is dirty, and reads the Story's trailered commits only on a clean tree (src/workflow/runners/build/changed-files.ts:142-178, c1). The review subject steps down from the anchored derivation to two working-tree-only derivations on a git failure (src/workflow/code-review/subject.ts:150-213, c2); the diff-only grounding reads the working tree first and, with no base, the last commit (src/workflow/code-review/grounding.ts:282-320, c3). The BUILD record writers call collectBuildChangeLog without a storyKey, and the validate gate lists typecheck projects from base..HEAD plus every uncommitted and untracked file (c4). On 2026-10-21 this reviewed six unrelated ontology files as Epic c2ba6fa6 Story s1 (ISSUE-b97752e9c7cee6fe).

**State after:** With a Story's base, changedFiles always anchors on the Story's commits (trailer units, else its first-parent own paths) and adds only working-tree edits of files in that set; every other uncommitted path is reported (excludedUncommitted) and, on a review, stamped on the subject and the record as excludedFromScope. The review subject and the diff-only grounding have no working-tree or last-commit fallback: without a base, or when git fails, they decline. The BUILD records pass the Story's storyKey, and the validate gate selects typecheck projects from the same Story set. A clean tree's results are unchanged.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Change the shared seam's order for callers that pass a base: anchor on the Story's units, then add working-tree paths already in the set, and report the rest; add excludedUncommitted to the attribution report. storyChangeSet gains strict and, with a storyKey but no carrying commit, leaves out commits carrying another Story's trailer; changedFiles refuses a storyKey without a base. It also returns perUnit, which changedFiles uses to choose per-unit diffs. — ↩ rollbackable
2. Remove the review subject's two working-tree fallbacks, carry excludedFromScope on the subject, and update its module header to the new rule. — ↩ rollbackable
3. Apply the same rule in the diff-only grounding (Story units plus own-file working-tree hunks; no working-tree-first or last-commit step) and in both diff-only callers. storyRangeDiff selects per-unit reads by set.perUnit. — ↩ rollbackable
4. Stamp excludedFromScope on the review record (optional field, absent when none). — ↩ rollbackable
5. Pass the Story's storyKey from the BUILD completion writer and the validate phase (an unresolved base then yields an empty changeLog), and pass it to withTypecheckProjects and trivialCheckPlan (both stay synchronous, through storyChangeSet with strict) at both validate.ts call sites. Both writers write the changeLog even when empty, so a re-write replaces a contaminated prior one; trivialCheckPlan keeps only Story test files that still exist. — ↩ rollbackable
6. Update the tests (including validation-checks.test.ts's uncommitted/untracked expectations, now only without a storyKey) that asserted working-tree-first scoping; rebuild and update the installed daemon; re-run the observed case (a review with unrelated uncommitted files) on it. — ↩ rollbackable

**Backward compat:** No IPC payload or public signature changes: changedFiles, resolveCodeReviewSubject, assembleDiffCodeReviewGrounding and collectBuildChangeLog keep their signatures (one optional ctx field, storyKey, is added to collectBuildChangeLog). New record fields (excludedFromScope, excludedUncommitted) are optional and absent when nothing is excluded, so existing records validate. 'working-tree' stays in the ChangeSetAttribution type so older records still parse. Behaviour change by design: a review that used to judge a dirty tree now judges the Story's commits and lists the rest; a review with no resolvable base now declines. Deliberate behaviour change for legacy ranges containing other Stories' trailered commits; the affected trailer-test expectation is updated.

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
