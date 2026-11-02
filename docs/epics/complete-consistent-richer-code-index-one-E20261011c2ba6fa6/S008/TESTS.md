<!-- insrc:artifact TESTS-c2ba6fa62a148ed1-s8 -->

# Tests: c2ba6fa62a148ed1 s8

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-11-02T09:26:38.830Z on commit `f1c1e5b0a`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: subsystem tables and migration to schema 8**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s8 t1: a v7 store opens at version 8 with the subsystem tables and its rows unchanged; a fresh store has them | `src/db/__tests__/subsystem-tables.test.ts` |
| pass | s8 t1: a write replaces the set in one transaction, stamped with the generation; a subsystem whose id was stored keeps its summary | `src/db/__tests__/subsystem-tables.test.ts` |
| pass | s8 t1: readSubsystems returns a repository set or the subsystems holding the given files, and nothing of another repository | `src/db/__tests__/subsystem-tables.test.ts` |
| pass | s8 t1: a write that fails part-way leaves the previous set intact | `src/db/__tests__/subsystem-tables.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/db/__tests__/subsystem-tables.test.ts` | 0 | 4 | 1.5 s |  |
