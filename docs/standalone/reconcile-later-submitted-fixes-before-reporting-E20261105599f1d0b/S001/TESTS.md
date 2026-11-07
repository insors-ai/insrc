<!-- insrc:artifact TESTS-599f1d0bd42e0c37-s1 -->

# Tests: 599f1d0bd42e0c37 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 10 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-11-07T05:08:26.091Z on commit `816d06a0a`. Tests check: **passed**. 10 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: Required-pin PacketSchema/decodeReview rejects absent or symbolic pins and fresh before blocks; historical schemas decode unchanged old packets.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | final pin schema requires the pin without mutating historical schemas | `src/workflow/code-review/task-review/__tests__/contracts.test.ts` |

**unit: Pinned commit object and ancestry checks reject unavailable, noncommit or nonancestor input and preserve source/transport/integrity errors.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | final pin validates object type and ancestry with truthful source failures | `src/workflow/code-review/task-review/__tests__/contracts.test.ts` |

**unit: Original parent, changed-hunk and safe-path validation remains strict; caller-supplied projection metadata is rejected.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | selected-change packet: commit pointers, exact ranges, committed documents and excluded same-commit changes | `src/workflow/code-review/task-review/__tests__/contracts.test.ts` |
| pass | final pin schema requires the pin without mutating historical schemas | `src/workflow/code-review/task-review/__tests__/contracts.test.ts` |

**unit: New pinned zero-segment origins reject scope_conflict before source work, checkpoint replacement or provider dispatch; historical metadata decoding remains unchanged.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | zero-segment fresh admission rejects before history source work, checkpoint replacement or provider dispatch on both routes | `src/workflow/code-review/task-review/__tests__/admission.test.ts` |
| pass | selected-change packet preserves deletion rename and non-textual limits without invented ranges | `src/workflow/code-review/task-review/__tests__/contracts.test.ts` |

**unit: Same-attempt resume rejects a changed pin; interrupted no-pin history cannot execute and its checkpoint bytes remain unchanged.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | recovery admission: saved pins, latest-only resume, contiguous attempts and immutable prior sections | `src/workflow/code-review/task-review/__tests__/admission.test.ts` |
| pass | interrupted unpinned attempts remain readable but cannot execute on resume | `src/workflow/code-review/task-review/__tests__/admission.test.ts` |

**unit: Strict pending/accepted/failed and accepted/unmapped schema branches require their own fields and refuse cross-branch fields.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | accepted attribution decision unions retain only permitted fields | `src/workflow/code-review/task-review/__tests__/final-scope-contracts.test.ts` |
| pass | permanent snapshot branches cannot fabricate accepted rows for unmapped failure | `src/workflow/code-review/task-review/__tests__/final-scope-contracts.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/task-review/__tests__/admission.test.ts` | 0 | 4 | 2.3 s |  |
| `src/workflow/code-review/task-review/__tests__/contracts.test.ts` | 0 | 7 | 1.2 s |  |
| `src/workflow/code-review/task-review/__tests__/final-scope-contracts.test.ts` | 0 | 2 | 0.5 s |  |
