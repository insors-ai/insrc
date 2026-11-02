<!-- insrc:artifact TESTS-c2ba6fa62a148ed1-s9 -->

# Tests: c2ba6fa62a148ed1 s9

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-11-02T05:01:33.548Z on commit `7348f340d`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: migration step for namespaces and kinds**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s9 t1: a v6 store without the new namespace rows opens at version 7 holding them, its entities and relationships read unchanged | `src/db/graph/__tests__/migration-v6-to-v7.test.ts` |
| pass | s9 t1: a fresh store holds all seven shared-modules rows | `src/db/graph/__tests__/migration-v6-to-v7.test.ts` |
| pass | s9 t1: a module stub of Rust, C#, C or C++ is stored under its namespace row | `src/db/graph/__tests__/migration-v6-to-v7.test.ts` |

**unit: table/view kinds and new languages**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s9 t1: table and view are appended kind slots 14 and 15, and every earlier slot keeps its byte | `src/db/graph/__tests__/migration-v6-to-v7.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/db/graph/__tests__/migration-v6-to-v7.test.ts` | 0 | 4 | 1.1 s |  |
