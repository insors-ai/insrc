<!-- insrc:artifact TESTS-c2ba6fa62a148ed1-s9 -->

# Tests: c2ba6fa62a148ed1 s9

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

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

## t2

Run at 2026-11-02T05:07:15.705Z on commit `bf7897d48`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: guarded grammar load records an unavailable reader**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s9 t2: a reader whose grammar load throws is not registered and is listed unavailable with the error; a reader loaded after it still registers | `src/indexer/parser/__tests__/registry-languages.test.ts` |

**integration: languages request**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s9 t2: the index.languages request lists python, go, typescript, javascript, java, scala and kotlin available, with their extensions; it is classed for the code-indexing worker | `src/indexer/parser/__tests__/registry-languages.test.ts` |
| pass | each indexing-class method runs on the code-indexing worker's thread id | `src/daemon/threads/__tests__/indexing-worker.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/threads/__tests__/indexing-worker.test.ts` | 0 | 4 | 12 s |  |
| `src/indexer/parser/__tests__/registry-languages.test.ts` | 0 | 2 | 1.3 s |  |
