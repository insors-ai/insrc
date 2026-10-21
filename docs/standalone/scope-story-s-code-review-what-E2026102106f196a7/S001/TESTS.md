<!-- insrc:artifact TESTS-06f196a7ff528143-S001 -->

# Tests: 06f196a7ff528143 S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 17 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

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
