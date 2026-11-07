<!-- insrc:artifact TESTS-599f1d0bd42e0c37-s1 -->

# Tests: 599f1d0bd42e0c37 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 29 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

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

## t2

Run at 2026-11-07T05:14:21.146Z on commit `3a632606b`. Tests check: **passed**. 8 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: Identity/shifted-line interval mapping preserves selected text and excludes unrelated insertions and worktree canaries.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | committed projection uses identical-blob fast path and ignores HEAD/worktree changes | `src/workflow/code-review/task-review/__tests__/projection-intervals.test.ts` |
| pass | interval offsets exclude insertions inside selected spans and support negative shifts | `src/workflow/code-review/task-review/__tests__/projection-intervals.test.ts` |
| pass | all small single-edit intervals preserve exactly the selected surviving line identities | `src/workflow/code-review/task-review/__tests__/projection-intervals.test.ts` |

**unit: Changed runs split original intervals into exact surviving and superseded source parts without inventing active historical scope.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | interval projection partitions changed overlaps without granting replacement text | `src/workflow/code-review/task-review/__tests__/projection-intervals.test.ts` |
| pass | all small single-edit intervals preserve exactly the selected surviving line identities | `src/workflow/code-review/task-review/__tests__/projection-intervals.test.ts` |

**unit: Normalize overlapping final intervals with origin accounting, preserve deletion anchors including empty-file zero and never coalesce unselected gaps.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | normalization retains every origin and never coalesces unselected gaps | `src/workflow/code-review/task-review/__tests__/projection-intervals.test.ts` |
| pass | deletion anchors preserve empty-file zero and mark touched boundaries for witness verification | `src/workflow/code-review/task-review/__tests__/projection-intervals.test.ts` |

**unit: Invalid UTF-8/binary textual mapping and unprovable interval boundaries fail explicitly without dropping origin entries.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | projection refuses malformed or omitted changes, invalid UTF-8 and binary sources without invented partitions | `src/workflow/code-review/task-review/__tests__/projection-intervals.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/task-review/__tests__/projection-intervals.test.ts` | 0 | 7 | 0.9 s |  |

## t3

Run at 2026-11-07T05:33:45.029Z on commit `1c50bcfb5`. Tests check: **passed**. 11 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: Selected later ancestor-verified witnesses justify full/partial replacement or deletion; unknown, cyclic or backward witnesses and out-of-set overwrite reject.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | selected later witnesses justify complete supersession and immutable origin accounting | `src/workflow/code-review/task-review/__tests__/projection.test.ts` |
| pass | partial replacement witnesses must cover the entire changed target and deletions retain explicit witnesses | `src/workflow/code-review/task-review/__tests__/projection.test.ts` |

**unit: Actual selected rename and merge-resolution lineage maps exact final paths; unverified/colliding paths and unselected conflict resolution reject.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | selected rename chains compare exact blobs independently of rename similarity and reject unselected moves | `src/workflow/code-review/task-review/__tests__/projection.test.ts` |
| pass | unselected merge resolution rejects and explicit selected merge replacement supplies the witness | `src/workflow/code-review/task-review/__tests__/projection.test.ts` |
| pass | competing selected path moves fail instead of choosing a rename by array order | `src/workflow/code-review/task-review/__tests__/projection.test.ts` |
| pass | typed blob diff mode requires both objects and cannot fall back to HEAD or the working tree | `src/workflow/code-review/task-review/__tests__/projection.test.ts` |

**unit: Projected entry segments equal normalized active disposition union; fully superseded nonempty origins retain complete dispositions with findingScope=none.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | selected later witnesses justify complete supersession and immutable origin accounting | `src/workflow/code-review/task-review/__tests__/projection.test.ts` |
| pass | partial replacement witnesses must cover the entire changed target and deletions retain explicit witnesses | `src/workflow/code-review/task-review/__tests__/projection.test.ts` |

**unit: Projection read/byte/fragment bounds and existing input/diff truncation retain their distinct error fields, with serial reads and no preparation/model side effects on refusal.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | projection budgets refuse before exceeding limits, preserve source fields and use serial reads | `src/workflow/code-review/task-review/__tests__/projection.test.ts` |
| pass | production projection budgets accept their exact ceilings and refuse the next unit | `src/workflow/code-review/task-review/__tests__/projection.test.ts` |
| pass | actual diff truncation stays changes while oversized JSON refuses input before source/provider work | `src/workflow/code-review/task-review/__tests__/projection.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/task-review/__tests__/projection.test.ts` | 0 | 9 | 2.3 s |  |
