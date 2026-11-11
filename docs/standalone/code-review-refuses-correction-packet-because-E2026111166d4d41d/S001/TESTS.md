<!-- insrc:artifact TESTS-66d4d41d99f805af-s1 -->

# Tests: 66d4d41d99f805af s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 14 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

## t1

Run at 2026-11-11T12:12:10.791Z on commit `441cd725e`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: projection identity matches the identity pinned from the code before the change**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | projection identity matches the identity pinned from the code before the change | `src/workflow/code-review/task-review/__tests__/projection-lineage.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/task-review/__tests__/projection-lineage.test.ts` | 0 | 1 | 1.7 s |  |

## t2

Run at 2026-11-11T12:18:49.344Z on commit `960da97bc`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: fullHistory lists a side-branch deletion and the merge that default history omits**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | fullHistory lists a side-branch deletion and the merge that default history omits | `src/daemon/tools/builtins/git/__tests__/git-path-history-full.test.ts` |

**unit: without fullHistory the listing is unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | without fullHistory the listing is unchanged | `src/daemon/tools/builtins/git/__tests__/git-path-history-full.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/builtins/git/__tests__/git-path-history-full.test.ts` | 0 | 2 | 1.9 s |  |

## t3

Run at 2026-11-11T12:22:38.265Z on commit `f42060471`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: pathChanges lists the commits that changed the path and refuses a failed or malformed listing as a source error**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | pathChanges lists the commits that changed the path and refuses a failed or malformed listing as a source error | `src/workflow/code-review/task-review/__tests__/projection-lineage.test.ts` |

**integration: boundedProjectionSources caches pathChanges and charges one read per uncached listing**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | boundedProjectionSources caches pathChanges and charges one read per uncached listing | `src/workflow/code-review/task-review/__tests__/projection-lineage.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/task-review/__tests__/projection-lineage.test.ts` | 0 | 3 | 4.4 s |  |

## t4

Run at 2026-11-11T12:28:52.211Z on commit `dfa56cd4b`. Tests check: **passed**. 9 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

**integration: lineage reads do not grow with interleaved commits that leave the selected path untouched**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | lineage reads do not grow with interleaved commits that leave the selected path untouched | `src/workflow/code-review/task-review/__tests__/projection-lineage.test.ts` |

**integration: a side-branch deletion merged back with the file kept still interrupts lineage**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a side-branch deletion merged back with the file kept still interrupts lineage | `src/workflow/code-review/task-review/__tests__/projection-lineage.test.ts` |

**integration: a side-branch deletion and recreation merged back still interrupts lineage**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a side-branch deletion and recreation merged back still interrupts lineage | `src/workflow/code-review/task-review/__tests__/projection-lineage.test.ts` |

**integration: a path history failure is a source error, not a projection limit or lineage conflict**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a path history failure is a source error, not a projection limit or lineage conflict | `src/workflow/code-review/task-review/__tests__/projection-lineage.test.ts` |

**integration: the read limit still refuses with projection_limit when the selected file itself changed too often**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the read limit still refuses with projection_limit when the selected file itself changed too often | `src/workflow/code-review/task-review/__tests__/projection-lineage.test.ts` |

**integration: projection identity matches the identity pinned from the code before the change**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | projection identity matches the identity pinned from the code before the change | `src/workflow/code-review/task-review/__tests__/projection-lineage.test.ts` |

**integration: identical final blobs cannot hide an unselected rename-away and recreation**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | identical final blobs cannot hide an unselected rename-away and recreation | `src/workflow/code-review/task-review/__tests__/projection.test.ts` |

**integration: selected rename chains compare exact blobs independently of rename similarity and reject unselected moves**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | selected rename chains compare exact blobs independently of rename similarity and reject unselected moves | `src/workflow/code-review/task-review/__tests__/projection.test.ts` |

**integration: production projection budgets accept their exact ceilings and refuse the next unit**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | production projection budgets accept their exact ceilings and refuse the next unit | `src/workflow/code-review/task-review/__tests__/projection.test.ts` |

**smoke: the eedc4519199b24b4/s1 correction packet prepares without projection_limit and attempt 4 re-prepares saved attempts 1-3 to their stored identities**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/standalone/code-review-refuses-correction-packet-because-E2026111166d4d41d/S001/SMOKE.md (packet admitted: 135 entries, 1088 reads, 10.89 MiB; attempts 1-3 identities match, checked offline with admission.ts:47-48 logic since the installed daemon is not yet updated)

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/task-review/__tests__/projection-lineage.test.ts` | 0 | 8 | 16.4 s |  |
| `src/workflow/code-review/task-review/__tests__/projection.test.ts` | 0 | 12 | 16.9 s |  |
