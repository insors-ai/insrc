<!-- insrc:artifact PLAN-f9ced66a0e8835b8-s1 -->

# Plan: E20261008f9ced66a:S001

## Summary

**Epic:** `story-code-review-reviews-wrong-code`
**LLD run:** `wf-1791444418716-bg9yxv`
**LLD effective hash:** `dde3c6427d60...`

The build adds an optional working directory to the CLI provider and passes the reviewed repo from every code-review judge; adds a multi-path input to git_diff; adds a git helper that lists the Story's own change units (its own commits plus edits made inside merge commits) and detects an uncommitted merge; then points the review's changed-file set and range diff at those units, and gates the build turns on the merge check. Each piece is tested against real temporary git repositories.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** CLI provider honours an optional cwd | S | — | unit: cli-subprocess.test.ts: 'completeStructured and complete run the CLI in opts.cwd when it is given'; unit: cli-subprocess.test.ts: 'completeStructured without opts.cwd runs the CLI in the inherited working directory' | [[c1]] |
| 2 | **`t2`** Code-review judges run in the reviewed repository | S | `t1` | unit: code-review-cwd.test.ts: 'every code-review dimension judge passes the reviewed repoPath as cwd' | [[c2]] |
| 3 | **`t3`** git_diff accepts a list of paths | S | — | unit: git-diff-paths.test.ts: 'git_diff limits the body and file list to the given paths, literally'; unit: git-diff-paths.test.ts: 'git_diff rejects paths together with path and an empty paths array' | [[c3]] |
| 4 | **`t4`** storyChangeSet and mergeInProgress helpers | M | — | unit: story-commits.test.ts: 'storyChangeSet lists the Story's non-merge first-parent commits and leaves out files only a merge brought in'; unit: story-commits.test.ts: 'storyChangeSet records Story edits folded into a merge commit as a merge-edit unit'; unit: story-commits.test.ts: 'storyChangeSet records a hand-resolved conflict as a merge-edit unit'; unit: story-commits.test.ts: 'storyChangeSet includes a file the Story deleted and a root commit's files'; unit: story-commits.test.ts: 'storyChangeSet is empty when the range holds only a clean merge'; unit: story-commits.test.ts: 'storyChangeSet throws NoBuildChangesError for an unresolvable base'; unit: story-commits.test.ts: 'mergeInProgress is true while MERGE_HEAD exists and false after the merge is committed'; unit: story-commits.test.ts: 'mergeInProgress is true while an uncommitted squash merge leaves SQUASH_MSG'; unit: story-commits.test.ts: 'known limit: upstream commits fast-forwarded or squash-merged into the Story are counted as Story work'; unit: story-commits.test.ts: 'an octopus merge becomes one merge-edit unit over its whole change instead of a failure' | [[c4]] |
| 5 | **`t5`** changedFiles reports only the Story's own files | M | `t4` | unit: changed-files.test.ts: 'a clean tree with a base reports only the Story's own files, not files a merge brought in'; unit: changed-files.test.ts: 'without a base the derivation is unchanged'; unit: changed-files.test.ts: 'collectBuildChangeLog with a base lists only the Story's own files after a mid-build merge'; unit: changed-files.test.ts: 'a committed ledger file stays out of the range result after a mid-build merge' | [[c5]] |
| 6 | **`t6`** The review's range diff carries only the Story's hunks | M | `t3`, `t4` | unit: diff-grounding.test.ts: 'the range diff carries full hunks for the Story files and none for merged-in files'; unit: diff-grounding.test.ts: 'a file changed by both a Story commit and the merge carries only the Story's own hunks'; unit: diff-grounding.test.ts: 'edits folded into a merge commit are reviewed and marked'; unit: diff-grounding.test.ts: 'a range with no Story change gives an empty grounding without calling git_diff'; unit: diff-grounding.test.ts: 'a shared path touched by two Story commits keeps both commits' hunks and a folded marker stays on its own file when it is not first'; unit: diff-grounding.test.ts: 'without hunksByFile buildDiffSymbols splits the body as before'; unit: diff-grounding.test.ts: 'the range diff applies the exclusions to every per-unit call'; unit: diff-grounding.test.ts: 'a truncated per-unit call marks the grounding truncated and a storyChangeSet failure steps down' | [[c6]] |
| 7 | **`t7`** Build turns refuse on an uncommitted merge; prompts state the merge rule | S | `t4` | unit: build-step.test.ts: 'implement and validate return merge-in-progress while a merge is uncommitted'; unit: render.test.ts: 'the implement prompts tell the implementer to merge upstream with --no-ff and commit the merge on its own' | [[c7]] |

### 1.1 E20261008f9ced66a:S001:T001 — CLI provider honours an optional cwd

Add cwd?: string | undefined to CompletionOpts and readonly cwd?: string | undefined to StructuredCompletionOpts. CliProvider.complete and completeStructuredOnce pass { cwd, timeoutMs: this.timeoutMs } to runClaude/runCodex when opts.cwd is set, and no override otherwise.

**Acceptance checks:**
- CompletionOpts and StructuredCompletionOpts declare an optional cwd.
- With opts.cwd set, the claude and codex subprocesses of complete and completeStructured start in that directory.
- Without opts.cwd, runClaude/runCodex are called with no ExecOverride, exactly as before.

### 1.2 E20261008f9ced66a:S001:T002 — Code-review judges run in the reviewed repository

judgeAdherence, judgeConventions, judgeCoverage, judgeFunctionalCoverage and judgeQuality pass { cwd: subject.repoPath } to their completeStructured call.

**Acceptance checks:**
- Each of the five judges' completeStructured calls receives opts.cwd equal to subject.repoPath.

### 1.3 E20261008f9ced66a:S001:T003 — git_diff accepts a list of paths

Add the optional paths input to gitDiffTool: validated as a non-empty array of non-empty strings, rejected together with path, emitted as ':(top,literal)<p>' pathspecs after '--' alongside the exclude pathspecs, for both the body and the numstat command.

**Acceptance checks:**
- With paths, the diff body and file list cover only those paths, matched literally.
- paths together with path, an empty paths array, or a non-string entry returns ok:false with '[git:diff] invalid-input'.
- Without paths the git command line is unchanged.

### 1.4 E20261008f9ced66a:S001:T004 — storyChangeSet and mergeInProgress helpers

New src/workflow/runners/build/story-commits.ts exporting StoryChangeUnit, StoryChangeSet, storyChangeSet(repoPath, base) and mergeInProgress(repoPath), as the LLD specifies: commit units from `git rev-list --first-parent --no-merges`, merge-edit units from `git merge-tree --write-tree M^1 M^2` vs M, sharedPaths and foldedPaths, an octopus merge as one whole-change merge-edit unit with a warn log, NoBuildChangesError on git failure; mergeInProgress true on MERGE_HEAD or an existing SQUASH_MSG, false (with a warn) on other git failures.

**Acceptance checks:**
- Files only a merge's merged-in side changed are absent from storyChangeSet.paths.
- Edits folded into a merge commit and hand-resolved conflicts form merge-edit units and are in foldedPaths.
- A deleted file and a root commit's files are included.
- An octopus merge yields one merge-edit unit over M^1..M instead of an error.
- An unresolvable base throws NoBuildChangesError.
- mergeInProgress is true while MERGE_HEAD exists or SQUASH_MSG exists, false otherwise.
- Neither helper changes refs, the index or the working tree.
- The known limits are pinned: upstream commits brought in by fast-forward or a committed squash merge are counted as Story work.

### 1.5 E20261008f9ced66a:S001:T005 — changedFiles reports only the Story's own files

In changedFiles' committed-range branch, keep the existing git_diff {from: base, exclude} call and intersect its paths with storyChangeSet(repoPath, base).paths before the keep filter. The BUILD changeLog narrows through collectBuildChangeLog as an intended effect.

**Acceptance checks:**
- A clean tree with a base after a mid-build merge reports only the Story's own files.
- A committed ledger file stays out of the range result after a mid-build merge.
- collectBuildChangeLog with a base lists only the Story's own files.
- Without a base the derivation is unchanged.

### 1.6 E20261008f9ced66a:S001:T006 — The review's range diff carries only the Story's hunks

Add DiffResult.hunksByFile; buildDiffSymbols prefers it. realDiffGroundingDeps.rangeDiff computes storyChangeSet: one net git_diff {from: base, paths, exclude} for paths no merge touched, per-unit git_diff {from, to, paths, exclude} for shared paths, sections appended per file in unit order, folded paths prefixed '[edited inside merge commit <short sha>]', empty change set returns an empty DiffResult without calling git_diff.

**Acceptance checks:**
- Story files carry full hunks and merged-in files are absent.
- A file changed by both a Story commit and the merge carries only the Story's own hunks.
- A shared path touched by two Story commits keeps both sections; a folded marker stays on its own file.
- Every git_diff call carries the exclusions.
- An empty change set gives an empty grounding without calling git_diff.
- Without hunksByFile buildDiffSymbols splits the body as before.
- A truncated call still marks the grounding as truncated, and a storyChangeSet failure surfaces as DiffUnavailableError so the assembler steps down as before.

### 1.7 E20261008f9ced66a:S001:T007 — Build turns refuse on an uncommitted merge; prompts state the merge rule

handleImplement and handleValidate return { next: 'error', error: { code: 'merge-in-progress', retryable: true } } right after resolving repoPath when mergeInProgress(repoPath). implement-task.md and renderStandaloneImplementPrompt gain the rule: merge upstream with `git merge --no-ff` (or `git pull --no-rebase --no-ff`), commit the merge on its own before further Story changes, never squash-merge or fast-forward upstream into the Story.

**Acceptance checks:**
- implement and validate return merge-in-progress while a merge is uncommitted, before any other work.
- Both implement prompts state the --no-ff merge rule and that the merge is committed on its own.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| story-commits.test.ts: 'storyChangeSet lists the Story's non-merge first-parent commits and leaves out files only a merge brought in' | `t4` |
| story-commits.test.ts: 'storyChangeSet records Story edits folded into a merge commit as a merge-edit unit' | `t4` |
| story-commits.test.ts: 'storyChangeSet records a hand-resolved conflict as a merge-edit unit' | `t4` |
| story-commits.test.ts: 'storyChangeSet includes a file the Story deleted and a root commit's files' | `t4` |
| story-commits.test.ts: 'storyChangeSet is empty when the range holds only a clean merge' | `t4` |
| story-commits.test.ts: 'storyChangeSet throws NoBuildChangesError for an unresolvable base' | `t4` |
| story-commits.test.ts: 'mergeInProgress is true while MERGE_HEAD exists and false after the merge is committed' | `t4` |
| story-commits.test.ts: 'mergeInProgress is true while an uncommitted squash merge leaves SQUASH_MSG' | `t4` |
| story-commits.test.ts: 'known limit: upstream commits fast-forwarded or squash-merged into the Story are counted as Story work' | `t4` |
| story-commits.test.ts: 'an octopus merge becomes one merge-edit unit over its whole change instead of a failure' | `t4` |
| changed-files.test.ts: 'a clean tree with a base reports only the Story's own files, not files a merge brought in' | `t5` |
| changed-files.test.ts: 'without a base the derivation is unchanged' | `t5` |
| changed-files.test.ts: 'collectBuildChangeLog with a base lists only the Story's own files after a mid-build merge' | `t5` |
| diff-grounding.test.ts: 'the range diff carries full hunks for the Story files and none for merged-in files' | `t6` |
| diff-grounding.test.ts: 'a file changed by both a Story commit and the merge carries only the Story's own hunks' | `t6` |
| diff-grounding.test.ts: 'edits folded into a merge commit are reviewed and marked' | `t6` |
| diff-grounding.test.ts: 'a range with no Story change gives an empty grounding without calling git_diff' | `t6` |
| git-diff-paths.test.ts: 'git_diff limits the body and file list to the given paths, literally' | `t3` |
| git-diff-paths.test.ts: 'git_diff rejects paths together with path and an empty paths array' | `t3` |
| diff-grounding.test.ts: 'a shared path touched by two Story commits keeps both commits' hunks and a folded marker stays on its own file when it is not first' | `t6` |
| diff-grounding.test.ts: 'without hunksByFile buildDiffSymbols splits the body as before' | `t6` |
| changed-files.test.ts: 'a committed ledger file stays out of the range result after a mid-build merge' | `t5` |
| diff-grounding.test.ts: 'the range diff applies the exclusions to every per-unit call' | `t6` |
| cli-subprocess.test.ts: 'completeStructured and complete run the CLI in opts.cwd when it is given' | `t1` |
| cli-subprocess.test.ts: 'completeStructured without opts.cwd runs the CLI in the inherited working directory' | `t1` |
| code-review-cwd.test.ts: 'every code-review dimension judge passes the reviewed repoPath as cwd' | `t2` |
| build-step.test.ts: 'implement and validate return merge-in-progress while a merge is uncommitted' | `t7` |
| render.test.ts: 'the implement prompts tell the implementer to merge upstream with --no-ff and commit the merge on its own' | `t7` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s1 CliProvider.complete / CliProvider.completeStructured + CompletionOpts / StructuredCompletionOpts cwd field`
- **[[c2]]** `prior-artifact` `LLD s1 judgeAdherence / judgeConventions / judgeCoverage / judgeFunctionalCoverage / judgeQuality`
- **[[c3]]** `prior-artifact` `LLD s1 gitDiffTool paths input`
- **[[c4]]** `prior-artifact` `LLD s1 storyChangeSet + mergeInProgress`
- **[[c5]]** `prior-artifact` `LLD s1 changedFiles`
- **[[c6]]** `prior-artifact` `LLD s1 realDiffGroundingDeps + buildDiffSymbols + DiffResult.hunksByFile`
- **[[c7]]** `prior-artifact` `LLD s1 handleImplement / handleValidate + implement prompts`
