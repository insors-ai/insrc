<!-- insrc:artifact TESTS-c2ba6fa62a148ed1-s2 -->

# Tests: c2ba6fa62a148ed1 s2

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-11-01T13:16:17.185Z on commit `b264851a5`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: commitFile**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | both in-transaction bodies write inside the caller's transaction and report what they did, by the same rule as the async writers | `src/db/__tests__/relations-in-txn.test.ts` |
| pass | a caller's transaction that throws after both bodies ran keeps none of their writes (read after a reopen) | `src/db/__tests__/relations-in-txn.test.ts` |
| pass | each input of a resolved write ends as an edge, one pending row awaiting the target, or a counted unwritable | `src/db/__tests__/relations-awaiting-target.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/db/__tests__/relations-awaiting-target.test.ts` | 0 | 4 | 1.4 s |  |
| `src/db/__tests__/relations-in-txn.test.ts` | 0 | 2 | 0.8 s |  |

## t2

Run at 2026-11-01T13:19:10.308Z on commit `2d50d4479`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: commitFile**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a RelationWrite with a stored target maps to a resolved Relation, and one with a pending target to an unresolved Relation with the same meta | `src/db/__tests__/file-commit-types.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/db/__tests__/file-commit-types.test.ts` | 0 | 1 | 0.6 s |  |
