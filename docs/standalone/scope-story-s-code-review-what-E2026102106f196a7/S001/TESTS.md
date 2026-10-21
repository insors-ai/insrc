<!-- insrc:artifact TESTS-06f196a7ff528143-S001 -->

# Tests: 06f196a7ff528143 S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

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
