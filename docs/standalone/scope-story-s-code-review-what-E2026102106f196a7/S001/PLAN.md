<!-- insrc:artifact PLAN-06f196a7ff528143-S001 -->

# Plan: E2026102106f196a7:S001

## Summary

**Epic:** `scope-story-s-code-review-what`
**LLD run:** `wf-1792558677033-6cunie`
**LLD effective hash:** `06f196a7ff52...`

Building this fix moves the Story's scope decision onto the Story's own commits in one seam, then makes every consumer follow it. The git commit attribution (foreign trailers, strict scans, per-unit reads) and the git_diff stat failure come first; the shared change-set seam and the diff-only grounding build on them; the review subject, the BUILD records and the build gate's selection then drop their working-tree fallbacks. It ends with the observed case re-run on the installed daemon.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** git_diff fails when its stat read fails | S | — | unit: src/daemon/tools/builtins/git/__tests__/diff.test.ts: 'when the diff body command succeeds and the numstat command fails, git_diff returns success: false naming the stat failure' | [[c8]] [[c9]] |
| 2 | **`t2`** storyChangeSet: foreign commits, strict scan, perUnit | M | — | unit: src/workflow/runners/build/__tests__/story-commits-trailer.test.ts: 'with a storyKey and no commit carrying it, a commit carrying another Story's trailer is left out, and a range of only other Stories' commits gives an empty set'; unit: src/workflow/runners/build/__tests__/story-commits-trailer.test.ts: 'with strict, a trailer scan that cannot read the commit messages throws NoBuildChangesError instead of falling back to the first-parent range'; unit: src/workflow/runners/build/__tests__/story-commits-trailer.test.ts: 'a Story with no carrying commit keeps its untrailered commits and leaves out another Story's, so the range of src/a.ts and src/b.ts gives src/a.ts'; unit: src/workflow/runners/build/__tests__/story-commits-trailer.test.ts: 'a merge carrying only another Story's trailer is not a unit, two-parent or octopus, with and without a commit carrying this Story's trailer, while an untrailered merge edit still is' | [[c1]] [[c9]] |
| 3 | **`t3`** changedFiles: the Story's commits first, own-file working-tree edits, excludedUncommitted | M | `t2` | unit: src/workflow/runners/build/__tests__/changed-files.test.ts: 'with a base, an uncommitted change to a file no Story commit touched is left out and reported as excludedUncommitted, whatever else the tree holds'; unit: src/workflow/runners/build/__tests__/changed-files.test.ts: 'an uncommitted edit to a file the Story's commits changed is part of the Story's set'; unit: src/workflow/runners/build/__tests__/changed-files.test.ts: 'a clean tree gives exactly the committed-range set, trailer units and first-parent ranges alike'; unit: src/workflow/runners/build/__tests__/changed-files.test.ts: 'a storyKey without a base is refused, and collectBuildChangeLog turns it into an empty changeLog, never the working tree'; unit: src/workflow/runners/build/__tests__/changed-files.test.ts: 'a filtered legacy range reads each kept unit's own diff: a file another Story also edited, or later reverted, carries only this Story's change'; unit: src/workflow/runners/build/__tests__/changed-files.test.ts: 'a git_diff result that fails its stat read makes the anchored derivation refuse, never return an empty set' | [[c2]] [[c6]] [[c9]] |
| 4 | **`t4`** Diff-only grounding: anchored, lossless hunks | M | `t2` | integration: src/workflow/code-review/__tests__/diff-attribution.test.ts: 'the diff-only grounding carries the Story's units and the working-tree hunks of its own files only, never an unrelated file's hunks or another Story's last commit'; integration: src/workflow/code-review/__tests__/diff-attribution.test.ts: 'storyRangeDiff on a filtered legacy range grounds only the kept units' hunks of a file another Story also edited'; integration: src/workflow/code-review/__tests__/diff-attribution.test.ts: 'a Story file with distinct staged and unstaged edits keeps both sets of hunks, and its stats are their sum, in the diff-only grounding' | [[c3]] [[c5]] [[c9]] |
| 5 | **`t5`** Review subject and record: no fallbacks, excludedFromScope | M | `t3`, `t4` | integration: src/workflow/code-review/__tests__/subject-attribution.test.ts: 'a Story's review subject is its trailered commits plus edits of its own files; unrelated uncommitted files are left out and listed in excludedFromScope, and the attribution is never working-tree'; integration: src/workflow/code-review/__tests__/subject-attribution.test.ts: 'with no resolvable range base, or git failing on the anchored derivation, the review declines with no-build-record and never reviews the working tree'; integration: src/workflow/code-review/__tests__/runner.test.ts: 'the review record stamps excludedFromScope beside changedFiles when uncommitted files were left out, and omits it when none were' | [[c4]] [[c9]] |
| 6 | **`t6`** BUILD records: Story-scoped changeLog that replaces a prior one | S | `t3` | integration: src/workflow/runners/build/__tests__/changed-files.test.ts: 'a BUILD record's changeLog, from the completion writer and the validate phase, holds the Story's files and none of an unrelated uncommitted change'; integration: src/workflow/runners/build/__tests__/changed-files.test.ts: 'rewriting a BUILD record whose changeLog held unrelated files replaces it with the Story-scoped changeLog, empty included'; integration: src/daemon/steps/build-step/__tests__/build-step.test.ts: 'the validate phase's changeLog leaves out another Story's commit and replaces a stale changeLog (ISSUE-b97752e9)'; integration: src/daemon/steps/build-step/__tests__/build-step.test.ts: 'CHARACTERISATION C (TRIVIAL route — NOT a defect, re-labelled at t6): a CLEAN tree with NO upstream yields an empty changeLog and no '## Changes' section' | [[c6]] [[c9]] |
| 7 | **`t7`** Validate gate: Story-scoped typecheck projects and trivial tests | M | `t2` | unit: src/daemon/steps/build-step/__tests__/validation-checks.test.ts: 'with a storyKey, typecheckProjects holds the Story's projects and its test files' projects, and not a project that owns only unrelated uncommitted or untracked files'; unit: src/daemon/steps/build-step/__tests__/validation-checks.test.ts: 'with a storyKey, the trivial plan runs only the Story's test files, and with no base fails the listing instead of running the HEAD commit's tests'; unit: src/daemon/steps/build-step/__tests__/validation-checks.test.ts: 'with a storyKey, a trivial build that deletes a test file does not ask to run it' | [[c7]] [[c9]] |
| 8 | **`t9`** A pre-trailer Story's range ends at its recorded build commit, which never moves | M | `t2` | unit: src/workflow/runners/build/__tests__/story-commits-trailer.test.ts: 'a pre-trailer Story's range ends at its BUILD record's commit: a later untrailered commit is not its unit, and an end off the first-parent line is ignored'; unit: src/workflow/runners/build/__tests__/story-commits-trailer.test.ts: 'the missing-trailer warning names only untrailered commits, never another Story's commit whose subject reads the same story id'; unit: src/workflow/runners/build/__tests__/changed-files.test.ts: 'on a clean tree, a pre-trailer Story with a BUILD record whose commit is before HEAD leaves out the later untrailered commits'; unit: src/workflow/runners/build/__tests__/story-commits-trailer.test.ts: 'a pre-trailer Story whose recorded end equals its base (the trivial route's first record) has an empty set, even after someone else's untrailered commits'; integration: src/workflow/code-review/__tests__/subject-attribution.test.ts: 'a pre-trailer Story's review leaves out an uncommitted edit of a file only a commit after its recorded build commit touched'; integration: src/workflow/runners/build/__tests__/build-record.test.ts: 'a pre-trailer Story's BUILD record keeps its recorded commit through validate reruns and the completion rewrite after later untrailered commits, and a review after them stays bounded; a trailered commit advances it' | [[c1]] [[c6]] [[c9]] |
| 9 | **`t10`** An empty Story scope declines on every review path | S | `t5` | integration: src/workflow/code-review/__tests__/subject-attribution.test.ts: 'a Story with no attributable change declines with no-build-record on the graph path and both diff-only callers, runs no judge and writes no record' | [[c4]] [[c5]] [[c9]] |
| 10 | **`t11`** git_diff reports literal paths and complete inventories | M | `t1`, `t4` | unit: src/daemon/tools/builtins/git/__tests__/diff.test.ts: 'a renamed file is reported by its literal new path and old path, including a compact rename inside a shared directory and a path with spaces'; unit: src/daemon/tools/builtins/git/__tests__/diff.test.ts: 'a body whose capture dropped output is marked truncated even when the captured text is under the cap, and a numstat read that was truncated or ends mid-record fails the call'; unit: src/workflow/code-review/__tests__/diff-grounding.test.ts: 'splitDiffByFile keys a quoted header by its decoded literal path: tab, newline, quote, backslash and octal UTF-8 escapes'; integration: src/workflow/code-review/__tests__/diff-attribution.test.ts: 'a Story commit that renames a file, to a path with a tab in it, is reviewed at the new path, and its committed, staged and unstaged hunks are all grounded there' | [[c3]] [[c8]] [[c9]] |
| 11 | **`t12`** runShell decodes UTF-8 across chunk boundaries | S | `t11` | unit: src/daemon/tools/__tests__/shell-helper.test.ts: 'a multibyte UTF-8 character split across two output chunks is decoded whole, and the byte cap and truncation flag are unchanged'; integration: src/workflow/code-review/__tests__/diff-attribution.test.ts: 'a Story file whose path has multibyte characters is in the Story set, the review subject and the diff-only grounding with its hunks' | [[c8]] [[c9]] |
| 12 | **`t8`** Installed-daemon smoke on the observed case | S | `t1`, `t3`, `t4`, `t5`, `t6`, `t7`, `t9`, `t10`, `t11`, `t12` | smoke: Installed daemon: Epic c2ba6fa6 Story s1's code review, run while unrelated files are uncommitted, reviews only the Story's committed files and lists the unrelated ones as excludedFromScope on the record (recorded in the BUILD record) | [[c10]] [[c11]] |

### 1.1 E2026102106f196a7:S001:T001 — git_diff fails when its stat read fails

In src/daemon/tools/builtins/git/diff.ts, a non-zero numstat exit after a successful body command returns success: false with an error naming the stat failure, instead of success with an empty file list.

**Acceptance checks:**
- A git_diff run whose numstat command fails returns success: false and an error naming the stat read.
- collectDiff and runDiff therefore reject it (no consumer change needed).

### 1.2 E2026102106f196a7:S001:T002 — storyChangeSet: foreign commits, strict scan, perUnit

In src/workflow/runners/build/story-commits.ts: the trailer scan records carrying and foreign commits (all Insrc-Story lines name other Stories); with strict: true a failed git log throws NoBuildChangesError (newestStoryCommit stays lenient); one rule for ordinary, merge-edit and octopus units (foreign never a unit, its paths to the excluded set; carrying always; untrailered merge always; untrailered ordinary only in a legacy range); the result gains perUnit. The trailer test expectation at story-commits-trailer.test.ts:101 becomes ['src/a.ts'].

**Acceptance checks:**
- With a storyKey, no unit of any kind comes from a foreign commit; untrailered merge edits are still units.
- A range of only other Stories' commits gives an empty set.
- strict: true turns a failed trailer scan into NoBuildChangesError.
- perUnit is false only for an unfiltered legacy range.

### 1.3 E2026102106f196a7:S001:T003 — changedFiles: the Story's commits first, own-file working-tree edits, excludedUncommitted

In src/workflow/runners/build/changed-files.ts: with a base, read the Story's set first (storyChangeSet with storyKey and strict), choosing per-unit diffs by set.perUnit; then add working-tree paths already in that set and report the rest as excludedUncommitted on ChangeSetAttributionReport; a storyKey without a base throws NoBuildChangesError; collectBuildChangeLog forwards ctx.storyKey. Without a base, unchanged.

**Acceptance checks:**
- With a base, an unrelated uncommitted file is never returned and is listed in excludedUncommitted.
- An uncommitted edit to a Story file is returned.
- A clean tree gives the committed-range result.
- A storyKey without a base is refused, and collectBuildChangeLog turns it into [].
- The changed-files.test.ts cases asserting that a dirty tree wins over the range are rewritten to the anchored rule.

### 1.4 E2026102106f196a7:S001:T004 — Diff-only grounding: anchored, lossless hunks

In src/workflow/code-review/grounding.ts: splitDiffByFile appends every section per path; workingTreeDiff sums staged and unstaged stats; storyRangeDiff chooses per-unit reads by set.perUnit; assembleDiffCodeReviewGrounding reads the Story's units (strict) plus the working-tree hunks of files in that set, reports excludedFromScope, and drops the working-tree-first and last-commit steps (no base or a git failure raises DiffUnavailableError).

**Acceptance checks:**
- A Story file with staged and unstaged edits keeps both sets of hunks and summed stats.
- The grounding never carries an unrelated file's hunks or another Story's last commit.
- No base raises DiffUnavailableError.
- The diff-grounding.test.ts and diff-attribution.test.ts cases asserting working-tree-first or last-commit grounding are rewritten: no base and a git failure raise DiffUnavailableError.

### 1.5 E2026102106f196a7:S001:T005 — Review subject and record: no fallbacks, excludedFromScope

In src/workflow/code-review/subject.ts remove the two working-tree attempts (decline with 'no-build-record' on no base or a git failure), carry excludedFromScope, and restate the module header; add excludedFromScope to CodeReviewSubject and CodeReviewBody.subject in src/workflow/code-review/types.ts; stamp it in src/workflow/code-review/runner.ts; thread the diff-only result's excludedFromScope at src/daemon/code-review-rpc.ts:157 and src/daemon/steps/code-review-step/handler.ts:400-412.

**Acceptance checks:**
- A resolved subject's attribution is never 'working-tree'.
- Unrelated uncommitted files are listed in excludedFromScope on the subject and the record, absent when none.
- No base or a git failure declines with 'no-build-record'.
- The subject.test.ts and subject-attribution.test.ts cases asserting a step-down to the working-tree attempts are rewritten to declines.
- A Story whose resolveStoryRangeBase returns undefined declines with 'no-build-record'.

### 1.6 E2026102106f196a7:S001:T006 — BUILD records: Story-scoped changeLog that replaces a prior one

src/workflow/runners/build/completion-record.ts and src/daemon/steps/build-step/phases/validate.ts pass storyKey to collectBuildChangeLog and write changeLog whenever they pass it, even empty, so a re-write replaces a contaminated prior changeLog.

**Acceptance checks:**
- A BUILD record's changeLog holds the Story's files and none of an unrelated uncommitted change.
- Re-writing a record whose changeLog held unrelated files replaces it.

### 1.7 E2026102106f196a7:S001:T007 — Validate gate: Story-scoped typecheck projects and trivial tests

In src/daemon/steps/build-step/validation-checks.ts: withTypecheckProjects and trivialCheckPlan take an optional storyKey and, with it, select from the Story's set synchronously (storyChangeSet strict plus own-file uncommitted and untracked paths; trivial tests filtered to files that still exist; no base fails the trivial listing); validate.ts passes the storyKey at 348 and 389.

**Acceptance checks:**
- A project owning only unrelated uncommitted or untracked files is not in typecheckProjects; Story and test-file projects are.
- A trivial build runs only the Story's existing test files; a deleted test is never asked to run.
- Without a storyKey, results are unchanged.

### 1.8 E2026102106f196a7:S001:T009 — A pre-trailer Story's range ends at its recorded build commit, which never moves

resolveStoryRangeEnd in src/workflow/runners/build/range-base.ts (the BUILD record's body.commit when it resolves). storyChangeSet, in the legacy case, leaves out first-parent commits after that end; an end equal to the base gives an empty set; an end off the line is ignored with a warning; the missing-trailer warning fires only for untrailered commits. persistBuildRecord keeps a prior body.commit that still resolves when the Story has no trailered commit, and the existing 'later persist REFRESHES to HEAD' expectation is replaced.

**Acceptance checks:**
- A pre-trailer Story's later untrailered commits (after its recorded commit) are not its units, on a clean tree too.
- An end equal to the base gives an empty set.
- The recorded commit survives validate reruns and the completion rewrite; a trailered commit advances it.
- The warning never names a foreign commit.

### 1.9 E2026102106f196a7:S001:T010 — An empty Story scope declines on every review path

resolveCodeReviewSubject declines an empty anchored set with 'no-build-record'; src/daemon/code-review-rpc.ts and src/daemon/steps/code-review-step/handler.ts end an empty diff-only grounding with the same reason before any judge or write. The 'empty diff is a valid trivial subject' expectation is replaced.

**Acceptance checks:**
- An empty Story scope runs no judge and writes no record, on the graph path and both diff-only callers.

### 1.10 E2026102106f196a7:S001:T011 — git_diff reports literal paths and complete inventories

In src/daemon/tools/builtins/git/diff.ts: numstat with -z (literal old/new paths for renames), body truncated from the shell's stdoutTruncated flag, a truncated or incomplete numstat read fails the call. In src/workflow/code-review/grounding.ts splitDiffByFile decodes git-quoted diff headers.

**Acceptance checks:**
- A renamed file, including a compact rename and a path with spaces or a tab, is reported and grounded at its literal new path with committed, staged and unstaged hunks.
- A dropped chunk marks the body truncated; a truncated or incomplete numstat read fails.

### 1.11 E2026102106f196a7:S001:T012 — runShell decodes UTF-8 across chunk boundaries

In src/daemon/tools/shell-helper.ts decode stdout and stderr with a StringDecoder per stream, byte cap and truncation flag unchanged.

**Acceptance checks:**
- A multibyte character split across chunks is decoded whole; a Story file with a multibyte path is in its set, subject and grounding.

### 1.12 E2026102106f196a7:S001:T008 — Installed-daemon smoke on the observed case

Update the installed daemon to the fix and run Epic c2ba6fa6 Story s1's code review while unrelated files are uncommitted; record that only the Story's committed files were reviewed and the unrelated ones are listed in excludedFromScope.

**Acceptance checks:**
- The installed daemon's commit contains t12's commit before the review runs.
- The review record's changedFiles hold none of the unrelated uncommitted files, and excludedFromScope lists them.
- The result is recorded in the BUILD record.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| src/workflow/runners/build/__tests__/changed-files.test.ts: 'with a base, an uncommitted change to a file no Story commit touched is left out and reported as excludedUncommitted, whatever else the tree holds' | `t3` |
| src/workflow/runners/build/__tests__/changed-files.test.ts: 'an uncommitted edit to a file the Story's commits changed is part of the Story's set' | `t3` |
| src/workflow/runners/build/__tests__/changed-files.test.ts: 'a clean tree gives exactly the committed-range set, trailer units and first-parent ranges alike' | `t3` |
| src/workflow/runners/build/__tests__/story-commits-trailer.test.ts: 'with a storyKey and no commit carrying it, a commit carrying another Story's trailer is left out, and a range of only other Stories' commits gives an empty set' | `t2` |
| src/workflow/runners/build/__tests__/story-commits-trailer.test.ts: 'with strict, a trailer scan that cannot read the commit messages throws NoBuildChangesError instead of falling back to the first-parent range' | `t2` |
| src/workflow/runners/build/__tests__/changed-files.test.ts: 'a storyKey without a base is refused, and collectBuildChangeLog turns it into an empty changeLog, never the working tree' | `t3` |
| src/daemon/steps/build-step/__tests__/validation-checks.test.ts: 'with a storyKey, typecheckProjects holds the Story's projects and its test files' projects, and not a project that owns only unrelated uncommitted or untracked files' | `t7` |
| src/daemon/steps/build-step/__tests__/validation-checks.test.ts: 'with a storyKey, the trivial plan runs only the Story's test files, and with no base fails the listing instead of running the HEAD commit's tests' | `t7` |
| src/workflow/runners/build/__tests__/story-commits-trailer.test.ts: 'a Story with no carrying commit keeps its untrailered commits and leaves out another Story's, so the range of src/a.ts and src/b.ts gives src/a.ts' | `t2` |
| src/workflow/runners/build/__tests__/changed-files.test.ts: 'a filtered legacy range reads each kept unit's own diff: a file another Story also edited, or later reverted, carries only this Story's change' | `t3` |
| src/daemon/steps/build-step/__tests__/validation-checks.test.ts: 'with a storyKey, a trivial build that deletes a test file does not ask to run it' | `t7` |
| src/daemon/tools/builtins/git/__tests__/diff.test.ts: 'when the diff body command succeeds and the numstat command fails, git_diff returns success: false naming the stat failure' | `t1` |
| src/workflow/runners/build/__tests__/changed-files.test.ts: 'a git_diff result that fails its stat read makes the anchored derivation refuse, never return an empty set' | `t3` |
| src/workflow/runners/build/__tests__/story-commits-trailer.test.ts: 'a merge carrying only another Story's trailer is not a unit, two-parent or octopus, with and without a commit carrying this Story's trailer, while an untrailered merge edit still is' | `t2` |
| src/workflow/runners/build/__tests__/story-commits-trailer.test.ts: 'a pre-trailer Story's range ends at its BUILD record's commit: a later untrailered commit is not its unit, and an end off the first-parent line is ignored' | `t9` |
| src/workflow/runners/build/__tests__/story-commits-trailer.test.ts: 'the missing-trailer warning names only untrailered commits, never another Story's commit whose subject reads the same story id' | `t9` |
| src/workflow/runners/build/__tests__/changed-files.test.ts: 'on a clean tree, a pre-trailer Story with a BUILD record whose commit is before HEAD leaves out the later untrailered commits' | `t9` |
| src/daemon/tools/builtins/git/__tests__/diff.test.ts: 'a renamed file is reported by its literal new path and old path, including a compact rename inside a shared directory and a path with spaces' | `t11` |
| src/workflow/code-review/__tests__/diff-grounding.test.ts: 'splitDiffByFile keys a quoted header by its decoded literal path: tab, newline, quote, backslash and octal UTF-8 escapes' | `t11` |
| src/workflow/runners/build/__tests__/story-commits-trailer.test.ts: 'a pre-trailer Story whose recorded end equals its base (the trivial route's first record) has an empty set, even after someone else's untrailered commits' | `t9` |
| src/daemon/tools/builtins/git/__tests__/diff.test.ts: 'a body whose capture dropped output is marked truncated even when the captured text is under the cap, and a numstat read that was truncated or ends mid-record fails the call' | `t11` |
| src/daemon/tools/__tests__/shell-helper.test.ts: 'a multibyte UTF-8 character split across two output chunks is decoded whole, and the byte cap and truncation flag are unchanged' | `t12` |
| src/workflow/code-review/__tests__/subject-attribution.test.ts: 'a Story's review subject is its trailered commits plus edits of its own files; unrelated uncommitted files are left out and listed in excludedFromScope, and the attribution is never working-tree' | `t5` |
| src/workflow/code-review/__tests__/subject-attribution.test.ts: 'with no resolvable range base, or git failing on the anchored derivation, the review declines with no-build-record and never reviews the working tree' | `t5` |
| src/workflow/code-review/__tests__/diff-attribution.test.ts: 'the diff-only grounding carries the Story's units and the working-tree hunks of its own files only, never an unrelated file's hunks or another Story's last commit' | `t4` |
| src/workflow/runners/build/__tests__/changed-files.test.ts: 'a BUILD record's changeLog, from the completion writer and the validate phase, holds the Story's files and none of an unrelated uncommitted change' | `t6` |
| src/workflow/code-review/__tests__/runner.test.ts: 'the review record stamps excludedFromScope beside changedFiles when uncommitted files were left out, and omits it when none were' | `t5` |
| src/workflow/code-review/__tests__/diff-attribution.test.ts: 'storyRangeDiff on a filtered legacy range grounds only the kept units' hunks of a file another Story also edited' | `t4` |
| src/workflow/runners/build/__tests__/changed-files.test.ts: 'rewriting a BUILD record whose changeLog held unrelated files replaces it with the Story-scoped changeLog, empty included' | `t6` |
| src/workflow/code-review/__tests__/diff-attribution.test.ts: 'a Story file with distinct staged and unstaged edits keeps both sets of hunks, and its stats are their sum, in the diff-only grounding' | `t4` |
| src/workflow/code-review/__tests__/subject-attribution.test.ts: 'a pre-trailer Story's review leaves out an uncommitted edit of a file only a commit after its recorded build commit touched' | `t9` |
| src/workflow/runners/build/__tests__/build-record.test.ts: 'a pre-trailer Story's BUILD record keeps its recorded commit through validate reruns and the completion rewrite after later untrailered commits, and a review after them stays bounded; a trailered commit advances it' | `t9` |
| src/daemon/steps/build-step/__tests__/build-step.test.ts: 'the validate phase's changeLog leaves out another Story's commit and replaces a stale changeLog (ISSUE-b97752e9)' | `t6` |
| src/daemon/steps/build-step/__tests__/build-step.test.ts: 'CHARACTERISATION C (TRIVIAL route — NOT a defect, re-labelled at t6): a CLEAN tree with NO upstream yields an empty changeLog and no '## Changes' section' | `t6` |
| src/workflow/code-review/__tests__/diff-attribution.test.ts: 'a Story commit that renames a file, to a path with a tab in it, is reviewed at the new path, and its committed, staged and unstaged hunks are all grounded there' | `t11` |
| src/workflow/code-review/__tests__/subject-attribution.test.ts: 'a Story with no attributable change declines with no-build-record on the graph path and both diff-only callers, runs no judge and writes no record' | `t10` |
| src/workflow/code-review/__tests__/diff-attribution.test.ts: 'a Story file whose path has multibyte characters is in the Story set, the review subject and the diff-only grounding with its hunks' | `t12` |
| Installed daemon: Epic c2ba6fa6 Story s1's code review, run while unrelated files are uncommitted, reviews only the Story's committed files and lists the unrelated ones as excludedFromScope on the record (recorded in the BUILD record) | `t8` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD-06f196a7ff528143-S001 contractDetails.api storyChangeSet`
- **[[c2]]** `prior-artifact` `LLD-06f196a7ff528143-S001 contractDetails.api changedFiles`
- **[[c3]]** `prior-artifact` `LLD-06f196a7ff528143-S001 contractDetails.api storyRangeDiff, splitDiffByFile, realDiffGroundingDeps().workingTreeDiff`
- **[[c4]]** `prior-artifact` `LLD-06f196a7ff528143-S001 contractDetails.api resolveCodeReviewSubject + dataModelChanges (CodeReviewSubject, CodeReviewBody.subject, changeSetAttribution)`
- **[[c5]]** `prior-artifact` `LLD-06f196a7ff528143-S001 contractDetails.api assembleDiffCodeReviewGrounding`
- **[[c6]]** `prior-artifact` `LLD-06f196a7ff528143-S001 contractDetails.api collectBuildChangeLog + dataModelChanges ChangeSetAttributionReport`
- **[[c7]]** `prior-artifact` `LLD-06f196a7ff528143-S001 contractDetails.api withTypecheckProjects, trivialCheckPlan`
- **[[c8]]** `prior-artifact` `LLD-06f196a7ff528143-S001 contractDetails.api gitDiffTool.execute`
- **[[c9]]** `prior-artifact` `LLD-06f196a7ff528143-S001 errorPaths`
- **[[c10]]** `prior-artifact` `LLD-06f196a7ff528143-S001 testStrategy`
- **[[c11]]** `prior-artifact` `LLD-06f196a7ff528143-S001 migration`
