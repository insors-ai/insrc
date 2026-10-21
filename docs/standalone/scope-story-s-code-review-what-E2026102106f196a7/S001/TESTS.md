<!-- insrc:artifact TESTS-06f196a7ff528143-S001 -->

# Tests: 06f196a7ff528143 S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 47 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-21T05:47:38.616Z on commit `873c4c3e`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/daemon/tools/builtins/git/__tests__/diff.test.ts: 'when the diff body command succeeds and the numstat command fails, git_diff returns success: false naming the stat failure'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | when the diff body command succeeds and the numstat command fails, git_diff returns success: false naming the stat failure | `src/daemon/tools/builtins/git/__tests__/diff.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/builtins/git/__tests__/diff.test.ts` | 0 | 8 | 1.1 s |  |

## t2

Run at 2026-10-21T05:56:21.050Z on commit `751f13b9`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/runners/build/__tests__/story-commits-trailer.test.ts: 'with a storyKey and no commit carrying it, a commit carrying another Story's trailer is left out, and a range of only other Stories' commits gives an empty set'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | with a storyKey and no commit carrying it, a commit carrying another Story's trailer is left out, and a range of only other Stories' commits gives an empty set | `src/workflow/runners/build/__tests__/story-commits-trailer.test.ts` |

**unit: src/workflow/runners/build/__tests__/story-commits-trailer.test.ts: 'with strict, a trailer scan that cannot read the commit messages throws NoBuildChangesError instead of falling back to the first-parent range'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | with strict, a trailer scan that cannot read the commit messages throws NoBuildChangesError instead of falling back to the first-parent range | `src/workflow/runners/build/__tests__/story-commits-trailer.test.ts` |

**unit: src/workflow/runners/build/__tests__/story-commits-trailer.test.ts: 'a Story with no carrying commit keeps its untrailered commits and leaves out another Story's, so the range of src/a.ts and src/b.ts gives src/a.ts'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a Story with no carrying commit keeps its untrailered commits and leaves out another Story's, so the range of src/a.ts and src/b.ts gives src/a.ts | `src/workflow/runners/build/__tests__/story-commits-trailer.test.ts` |

**unit: src/workflow/runners/build/__tests__/story-commits-trailer.test.ts: 'a merge carrying only another Story's trailer is not a unit, two-parent or octopus, with and without a commit carrying this Story's trailer, while an untrailered merge edit still is'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a merge carrying only another Story's trailer is not a unit, two-parent or octopus, with and without a commit carrying this Story's trailer, while an untrailered merge edit still is | `src/workflow/runners/build/__tests__/story-commits-trailer.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/runners/build/__tests__/story-commits-trailer.test.ts` | 0 | 11 | 4.4 s |  |

## t3

Run at 2026-10-21T06:18:08.129Z on commit `79e66e0c`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/runners/build/__tests__/changed-files.test.ts: 'with a base, an uncommitted change to a file no Story commit touched is left out and reported as excludedUncommitted, whatever else the tree holds'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | with a base, an uncommitted change to a file no Story commit touched is left out and reported as excludedUncommitted, whatever else the tree holds | `src/workflow/runners/build/__tests__/changed-files.test.ts` |
| pass | CR-1: a tree dirty with unrelated work plus the record's own paths still derives the Story's committed range; the unrelated file is reported, the record's own paths are not | `src/workflow/runners/build/__tests__/changed-files.test.ts` |

**unit: src/workflow/runners/build/__tests__/changed-files.test.ts: 'an uncommitted edit to a file the Story's commits changed is part of the Story's set'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an uncommitted edit to a file the Story's commits changed is part of the Story's set | `src/workflow/runners/build/__tests__/changed-files.test.ts` |

**unit: src/workflow/runners/build/__tests__/changed-files.test.ts: 'a clean tree gives exactly the committed-range set, trailer units and first-parent ranges alike'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a clean tree gives exactly the committed-range set, trailer units and first-parent ranges alike | `src/workflow/runners/build/__tests__/changed-files.test.ts` |

**unit: src/workflow/runners/build/__tests__/changed-files.test.ts: 'a storyKey without a base is refused, and collectBuildChangeLog turns it into an empty changeLog, never the working tree'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a storyKey without a base is refused, and collectBuildChangeLog turns it into an empty changeLog, never the working tree | `src/workflow/runners/build/__tests__/changed-files.test.ts` |

**unit: src/workflow/runners/build/__tests__/changed-files.test.ts: 'a filtered legacy range reads each kept unit's own diff: a file another Story also edited, or later reverted, carries only this Story's change'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a filtered legacy range reads each kept unit's own diff: a file another Story also edited, or later reverted, carries only this Story's change | `src/workflow/runners/build/__tests__/changed-files.test.ts` |

**unit: src/workflow/runners/build/__tests__/changed-files.test.ts: 'a git_diff result that fails its stat read makes the anchored derivation refuse, never return an empty set'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a git_diff result that fails its stat read makes the anchored derivation refuse, never return an empty set | `src/workflow/runners/build/__tests__/changed-files.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/runners/build/__tests__/changed-files.test.ts` | 0 | 40 | 4.9 s |  |

## t4

Run at 2026-10-21T06:26:10.632Z on commit `fabb2d0e`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/workflow/code-review/__tests__/diff-attribution.test.ts: 'the diff-only grounding carries the Story's units and the working-tree hunks of its own files only, never an unrelated file's hunks or another Story's last commit'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the diff-only grounding carries the Story's units and the working-tree hunks of its own files only, never an unrelated file's hunks or another Story's last commit | `src/workflow/code-review/__tests__/diff-attribution.test.ts` |
| pass | assembler: with no base the diff-only review is unavailable and no seam is called (ISSUE-b97752e9) | `src/workflow/code-review/__tests__/diff-grounding.test.ts` |
| pass | assembler: a range git failure propagates at once — no step-down to the working tree or a last commit | `src/workflow/code-review/__tests__/diff-grounding.test.ts` |

**integration: src/workflow/code-review/__tests__/diff-attribution.test.ts: 'storyRangeDiff on a filtered legacy range grounds only the kept units' hunks of a file another Story also edited'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | storyRangeDiff on a filtered legacy range grounds only the kept units' hunks of a file another Story also edited | `src/workflow/code-review/__tests__/diff-attribution.test.ts` |

**integration: src/workflow/code-review/__tests__/diff-attribution.test.ts: 'a Story file with distinct staged and unstaged edits keeps both sets of hunks, and its stats are their sum, in the diff-only grounding'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a Story file with distinct staged and unstaged edits keeps both sets of hunks, and its stats are their sum, in the diff-only grounding | `src/workflow/code-review/__tests__/diff-attribution.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/__tests__/diff-attribution.test.ts` | 0 | 5 | 1.9 s |  |
| `src/workflow/code-review/__tests__/diff-grounding.test.ts` | 0 | 24 | 2.3 s |  |

## t5

Run at 2026-10-21T06:31:25.759Z on commit `73362b2b`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/workflow/code-review/__tests__/subject-attribution.test.ts: 'a Story's review subject is its trailered commits plus edits of its own files; unrelated uncommitted files are left out and listed in excludedFromScope, and the attribution is never working-tree'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a Story's review subject is its trailered commits plus edits of its own files; unrelated uncommitted files are left out and listed in excludedFromScope, and the attribution is never working-tree | `src/workflow/code-review/__tests__/subject-attribution.test.ts` |

**integration: src/workflow/code-review/__tests__/subject-attribution.test.ts: 'with no resolvable range base, or git failing on the anchored derivation, the review declines with no-build-record and never reviews the working tree'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | with no resolvable range base, or git failing on the anchored derivation, the review declines with no-build-record and never reviews the working tree | `src/workflow/code-review/__tests__/subject-attribution.test.ts` |
| pass | T41: with NO resolvable base the review declines and the changed-file seam is never called — no base is invented | `src/workflow/code-review/__tests__/subject.test.ts` |
| pass | T43: a seam that throws on the anchored derivation -> no-build-record after ONE attempt; there is no plainer one | `src/workflow/code-review/__tests__/subject.test.ts` |

**integration: src/workflow/code-review/__tests__/runner.test.ts: 'the review record stamps excludedFromScope beside changedFiles when uncommitted files were left out, and omits it when none were'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the review record stamps excludedFromScope beside changedFiles when uncommitted files were left out, and omits it when none were | `src/workflow/code-review/__tests__/runner.test.ts` |
| pass | without a story key the diff is today's, and both diff callers record the attribution and what was left out on the subject | `src/workflow/code-review/__tests__/diff-attribution.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/__tests__/diff-attribution.test.ts` | 0 | 5 | 1.9 s |  |
| `src/workflow/code-review/__tests__/runner.test.ts` | 0 | 19 | 0.6 s |  |
| `src/workflow/code-review/__tests__/subject-attribution.test.ts` | 0 | 4 | 1.4 s |  |
| `src/workflow/code-review/__tests__/subject.test.ts` | 0 | 19 | 1.6 s |  |

## t6

Run at 2026-10-21T06:37:50.385Z on commit `666a5332`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/workflow/runners/build/__tests__/changed-files.test.ts: 'a BUILD record's changeLog, from the completion writer and the validate phase, holds the Story's files and none of an unrelated uncommitted change'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a BUILD record's changeLog, from the completion writer and the validate phase, holds the Story's files and none of an unrelated uncommitted change | `src/workflow/runners/build/__tests__/changed-files.test.ts` |
| pass | the validate phase's changeLog leaves out another Story's commit and replaces a stale changeLog (ISSUE-b97752e9) | `src/daemon/steps/build-step/__tests__/build-step.test.ts` |
| pass | t6: a DIRTY tree still yields the Story's committed change set, and an unrelated uncommitted file is left out (ISSUE-b97752e9) | `src/daemon/steps/build-step/__tests__/build-step.test.ts` |

**integration: src/workflow/runners/build/__tests__/changed-files.test.ts: 'rewriting a BUILD record whose changeLog held unrelated files replaces it with the Story-scoped changeLog, empty included'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | rewriting a BUILD record whose changeLog held unrelated files replaces it with the Story-scoped changeLog, empty included | `src/workflow/runners/build/__tests__/changed-files.test.ts` |
| pass | the validate phase's changeLog leaves out another Story's commit and replaces a stale changeLog (ISSUE-b97752e9) | `src/daemon/steps/build-step/__tests__/build-step.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/steps/build-step/__tests__/build-step.test.ts` | 0 | 64 | 12.5 s |  |
| `src/workflow/runners/build/__tests__/changed-files.test.ts` | 0 | 42 | 5.3 s |  |

## t7

Run at 2026-10-21T06:44:13.783Z on commit `a0a031cf`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/daemon/steps/build-step/__tests__/validation-checks.test.ts: 'with a storyKey, typecheckProjects holds the Story's projects and its test files' projects, and not a project that owns only unrelated uncommitted or untracked files'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | with a storyKey, typecheckProjects holds the Story's projects and its test files' projects, and not a project that owns only unrelated uncommitted or untracked files | `src/daemon/steps/build-step/__tests__/validation-checks.test.ts` |
| pass | ISSUE-b4b6b835: validate hands the check runner the other TypeScript projects the build touched; a build inside the root project names none | `src/daemon/steps/build-step/__tests__/build-step.test.ts` |

**unit: src/daemon/steps/build-step/__tests__/validation-checks.test.ts: 'with a storyKey, the trivial plan runs only the Story's test files, and with no base fails the listing instead of running the HEAD commit's tests'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | with a storyKey, the trivial plan runs only the Story's test files, and with no base fails the listing instead of running the HEAD commit's tests | `src/daemon/steps/build-step/__tests__/validation-checks.test.ts` |
| pass | on the standalone routes: a wrong mapping on a small build is refused with 'invalid-test-mapping', a good one is planned by subject, and `tests` is ignored on a trivial build | `src/daemon/steps/build-step/__tests__/build-step.test.ts` |

**unit: src/daemon/steps/build-step/__tests__/validation-checks.test.ts: 'with a storyKey, a trivial build that deletes a test file does not ask to run it'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | with a storyKey, a trivial build that deletes a test file does not ask to run it | `src/daemon/steps/build-step/__tests__/validation-checks.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/steps/build-step/__tests__/build-step.test.ts` | 0 | 64 | 11.5 s |  |
| `src/daemon/steps/build-step/__tests__/validation-checks.test.ts` | 0 | 31 | 9.2 s |  |

## t9

Run at 2026-10-21T08:59:36.959Z on commit `3983ca96`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/runners/build/__tests__/story-commits-trailer.test.ts: 'a pre-trailer Story's range ends at its BUILD record's commit: a later untrailered commit is not its unit, and an end off the first-parent line is ignored'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a pre-trailer Story's range ends at its BUILD record's commit: a later untrailered commit is not its unit, and an end off the first-parent line is ignored | `src/workflow/runners/build/__tests__/story-commits-trailer.test.ts` |

**unit: src/workflow/runners/build/__tests__/story-commits-trailer.test.ts: 'the missing-trailer warning names only untrailered commits, never another Story's commit whose subject reads the same story id'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the missing-trailer warning names only untrailered commits, never another Story's commit whose subject reads the same story id | `src/workflow/runners/build/__tests__/story-commits-trailer.test.ts` |

**unit: src/workflow/runners/build/__tests__/changed-files.test.ts: 'on a clean tree, a pre-trailer Story with a BUILD record whose commit is before HEAD leaves out the later untrailered commits'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | on a clean tree, a pre-trailer Story with a BUILD record whose commit is before HEAD leaves out the later untrailered commits | `src/workflow/runners/build/__tests__/changed-files.test.ts` |

**unit: src/workflow/runners/build/__tests__/story-commits-trailer.test.ts: 'a pre-trailer Story whose recorded end equals its base (the trivial route's first record) has an empty set, even after someone else's untrailered commits'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a pre-trailer Story whose recorded end equals its base (the trivial route's first record) has an empty set, even after someone else's untrailered commits | `src/workflow/runners/build/__tests__/story-commits-trailer.test.ts` |

**integration: src/workflow/code-review/__tests__/subject-attribution.test.ts: 'a pre-trailer Story's review leaves out an uncommitted edit of a file only a commit after its recorded build commit touched'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a pre-trailer Story's review leaves out an uncommitted edit of a file only a commit after its recorded build commit touched | `src/workflow/code-review/__tests__/subject-attribution.test.ts` |

**integration: src/workflow/runners/build/__tests__/build-record.test.ts: 'a pre-trailer Story's BUILD record keeps its recorded commit through validate reruns and the completion rewrite after later untrailered commits, and a review after them stays bounded; a trailered commit advances it'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a pre-trailer Story's BUILD record keeps its recorded commit through validate reruns and the completion rewrite after later untrailered commits, and a review after them stays bounded; a trailered commit advances it | `src/workflow/runners/build/__tests__/build-record.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/__tests__/subject-attribution.test.ts` | 0 | 5 | 1.8 s |  |
| `src/workflow/runners/build/__tests__/build-record.test.ts` | 0 | 43 | 1.9 s |  |
| `src/workflow/runners/build/__tests__/changed-files.test.ts` | 0 | 43 | 5.3 s |  |
| `src/workflow/runners/build/__tests__/story-commits-trailer.test.ts` | 0 | 14 | 4.9 s |  |

## t10

Run at 2026-10-21T09:02:40.553Z on commit `c66188c6`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/workflow/code-review/__tests__/subject-attribution.test.ts: 'a Story with no attributable change declines with no-build-record on the graph path and both diff-only callers, runs no judge and writes no record'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a Story with no attributable change declines with no-build-record on the graph path and both diff-only callers, runs no judge and writes no record | `src/workflow/code-review/__tests__/subject-attribution.test.ts` |
| pass | resolveCodeReviewSubject: an empty Story set declines with no-build-record — nothing attributable to review (ISSUE-b97752e9) | `src/workflow/code-review/__tests__/subject.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/__tests__/subject-attribution.test.ts` | 0 | 6 | 2.3 s |  |
| `src/workflow/code-review/__tests__/subject.test.ts` | 0 | 19 | 1.5 s |  |

## t11

Run at 2026-10-21T09:06:42.228Z on commit `ec90553f`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/daemon/tools/builtins/git/__tests__/diff.test.ts: 'a renamed file is reported by its literal new path and old path, including a compact rename inside a shared directory and a path with spaces'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a renamed file is reported by its literal new path and old path, including a compact rename inside a shared directory and a path with spaces | `src/daemon/tools/builtins/git/__tests__/diff.test.ts` |

**unit: src/daemon/tools/builtins/git/__tests__/diff.test.ts: 'a body whose capture dropped output is marked truncated even when the captured text is under the cap, and a numstat read that was truncated or ends mid-record fails the call'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a body whose capture dropped output is marked truncated even when the captured text is under the cap, and a numstat read that was truncated or ends mid-record fails the call | `src/daemon/tools/builtins/git/__tests__/diff.test.ts` |

**unit: src/workflow/code-review/__tests__/diff-grounding.test.ts: 'splitDiffByFile keys a quoted header by its decoded literal path: tab, newline, quote, backslash and octal UTF-8 escapes'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | splitDiffByFile keys a quoted header by its decoded literal path: tab, newline, quote, backslash and octal UTF-8 escapes | `src/workflow/code-review/__tests__/diff-grounding.test.ts` |

**integration: src/workflow/code-review/__tests__/diff-attribution.test.ts: 'a Story commit that renames a file, to a path with a tab in it, is reviewed at the new path, and its committed, staged and unstaged hunks are all grounded there'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a Story commit that renames a file, to a path with a tab in it, is reviewed at the new path, and its committed, staged and unstaged hunks are all grounded there | `src/workflow/code-review/__tests__/diff-attribution.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/builtins/git/__tests__/diff.test.ts` | 0 | 10 | 2.3 s |  |
| `src/workflow/code-review/__tests__/diff-attribution.test.ts` | 0 | 6 | 1.8 s |  |
| `src/workflow/code-review/__tests__/diff-grounding.test.ts` | 0 | 25 | 2.2 s |  |

## t12

Run at 2026-10-21T09:09:57.673Z on commit `d995207c`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/daemon/tools/__tests__/shell-helper.test.ts: 'a multibyte UTF-8 character split across two output chunks is decoded whole, and the byte cap and truncation flag are unchanged'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a multibyte UTF-8 character split across two output chunks is decoded whole, and the byte cap and truncation flag are unchanged | `src/daemon/tools/__tests__/shell-helper.test.ts` |

**integration: src/workflow/code-review/__tests__/diff-attribution.test.ts: 'a Story file whose path has multibyte characters is in the Story set, the review subject and the diff-only grounding with its hunks'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a Story file whose path has multibyte characters is in the Story set, the review subject and the diff-only grounding with its hunks | `src/workflow/code-review/__tests__/diff-attribution.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/__tests__/shell-helper.test.ts` | 0 | 1 | 0.7 s |  |
| `src/workflow/code-review/__tests__/diff-attribution.test.ts` | 0 | 7 | 2 s |  |
