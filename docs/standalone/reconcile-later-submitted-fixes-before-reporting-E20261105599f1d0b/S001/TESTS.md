<!-- insrc:artifact TESTS-599f1d0bd42e0c37-s1 -->

# Tests: 599f1d0bd42e0c37 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-11-07T04:56:57.771Z on commit `3622c7780`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: New packets require a full commit reviewRevision; reject missing/symbolic/unavailable/non-commit pins. Same-attempt replay rejects changed pin; historical completed no-pin records remain readable without granting model execution.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | final pin schema requires the pin without mutating historical schemas | `src/workflow/code-review/task-review/__tests__/contracts.test.ts` |

**unit: Origin selections retain existing parent/hunk/path validation; projected scope is host-derived and cannot be supplied or forged by the caller.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | selected-change packet: commit pointers, exact ranges, committed documents and excluded same-commit changes | `src/workflow/code-review/task-review/__tests__/contracts.test.ts` |

**unit: Schema-construction regression: missing reviewRevision is rejected by the actual PacketSchema/decodeReview path, PacketSchema.required includes it, and historical StoredPacketSchema still decodes no-pin records. Cloning/replacing an optional property without rebuilding required must not satisfy this test. [[c2]]**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | final pin schema requires the pin without mutating historical schemas | `src/workflow/code-review/task-review/__tests__/contracts.test.ts` |

**unit: Non-ancestor origins, out-of-set overwrites, conflicting merge resolution, unverified renames, binary/non-UTF8 mappings and truncated/budget-exceeded reads refuse preparation without model calls or dropped scope.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | final pin validates object type and ancestry with truthful source failures | `src/workflow/code-review/task-review/__tests__/contracts.test.ts` |

**unit: New pinned zero-segment original selections reject field=scope_conflict before checkpoint replacement or provider dispatch; historical no-pin metadata records remain readable without granting new execution. Nonempty origins that become fully superseded still have complete dispositions and findingScope=none. [[c2]] [[c3]] [[c18]]**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | final pin validates object type and ancestry with truthful source failures | `src/workflow/code-review/task-review/__tests__/contracts.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/task-review/__tests__/contracts.test.ts` | 0 | 7 | 1.2 s |  |
