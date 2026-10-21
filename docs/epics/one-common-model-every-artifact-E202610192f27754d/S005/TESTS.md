<!-- insrc:artifact TESTS-2f27754d4ad00b8e-s5 -->

# Tests: 2f27754d4ad00b8e s5

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-21T12:07:40.117Z on commit `91263a04`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: feedback-reply-shape.test.ts: History.validateFeedback accepts inReplyTo as a non-empty string other than its own id and refuses a reply that carries nested replies**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | History.validateFeedback accepts inReplyTo as a non-empty string other than its own id and refuses a reply that carries nested replies | `src/workflow/artifact-core/__tests__/feedback-reply-shape.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/artifact-core/__tests__/feedback-reply-shape.test.ts` | 0 | 2 | 0.5 s |  |

## t2

Run at 2026-10-21T12:14:11.102Z on commit `adbac821`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: addresses-rule.test.ts: ArtifactStore.write stamps addresses 'all' on a revision that moves the revision number, honours a list, refuses ids that are not roots or are already addressed, and addresses nothing on an identical rewrite or a lifecycle operation**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ArtifactStore.write stamps addresses 'all' on a revision that moves the revision number, honours a list, refuses ids that are not roots or are already addressed, and addresses nothing on an identical rewrite or a lifecycle operation | `src/workflow/artifact-core/__tests__/addresses-rule.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/artifact-core/__tests__/addresses-rule.test.ts` | 0 | 2 | 1.2 s |  |
