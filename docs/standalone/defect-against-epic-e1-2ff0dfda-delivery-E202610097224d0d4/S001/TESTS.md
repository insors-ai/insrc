<!-- insrc:artifact TESTS-7224d0d4493d01d5-s1 -->

# Tests: 7224d0d4493d01d5 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 9 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-10T14:36:42.231Z on commit `664caba2`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: snapshot.test.ts: an epic's problem and summary, a story's purpose and size, and an issue's reproduction, root cause and fix intent are published from their records**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an epic's problem and summary, a story's purpose and size, and an issue's reproduction, root cause and fix intent are published from their records | `src/workflow/delivery/__tests__/snapshot.test.ts` |

**unit: snapshot.test.ts: missing, blank or wrongly typed values read not recorded, and a value that does not apply to a kind is absent**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | missing, blank or wrongly typed values read not recorded, and a value that does not apply to a kind is absent | `src/workflow/delivery/__tests__/snapshot.test.ts` |

**unit: snapshot.test.ts: a story added by an extension takes its purpose from the EXT, and a standalone story reads not recorded**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a story added by an extension takes its purpose from the EXT, and a standalone story reads not recorded | `src/workflow/delivery/__tests__/snapshot.test.ts` |

**integration: types.test.ts: the delivery IPC types list exactly the sketched members**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the delivery IPC types list exactly the sketched members | `src/workflow/delivery/__tests__/types.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/delivery/__tests__/snapshot.test.ts` | 0 | 8 | 0.5 s |  |
| `src/workflow/delivery/__tests__/types.test.ts` | 0 | 5 | 0.3 s |  |

## t2

Run at 2026-10-10T14:30:33.696Z on commit `db463d44`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: snapshot.test.ts: feedback from an item's own design records is listed read-only, in order, and malformed entries are noticed**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | feedback from an item's own design records is listed read-only, in order, and malformed entries are noticed | `src/workflow/delivery/__tests__/snapshot.test.ts` |

**unit: snapshot.test.ts: two snapshots of the same store, with equal timestamps, are identical in order and counts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | two snapshots of the same store, with equal timestamps, are identical in order and counts | `src/workflow/delivery/__tests__/snapshot.test.ts` |

**integration: contract.test.ts: the JetBrains sample snapshot is plain JSON and equals what the assembler produces**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the JetBrains sample snapshot is plain JSON and equals what the assembler produces | `src/workflow/delivery/__tests__/contract.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/delivery/__tests__/contract.test.ts` | 0 | 2 | 0.9 s |  |
| `src/workflow/delivery/__tests__/snapshot.test.ts` | 0 | 8 | 0.4 s |  |

## t3

Run at 2026-10-10T14:36:26.836Z on commit `664caba2`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: contract.test.ts: the VS Code plugin type-checks against the published delivery types**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the VS Code plugin type-checks against the published delivery types | `src/workflow/delivery/__tests__/contract.test.ts` |

**integration: handlers.test.ts: a 1,000-record store forming 500 work items is served within 500 ms**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a 1,000-record store forming 500 work items is served within 500 ms | `src/workflow/delivery/__tests__/handlers.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/delivery/__tests__/contract.test.ts` | 0 | 2 | 1 s |  |
| `src/workflow/delivery/__tests__/handlers.test.ts` | 0 | 7 | 0.8 s |  |
