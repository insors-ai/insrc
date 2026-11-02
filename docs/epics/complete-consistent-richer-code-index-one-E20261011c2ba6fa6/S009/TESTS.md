<!-- insrc:artifact TESTS-c2ba6fa62a148ed1-s9 -->

# Tests: c2ba6fa62a148ed1 s9

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 12 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

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

## t3

Run at 2026-11-02T05:09:48.138Z on commit `ba35c2a89`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: C/C++ family match in the cross-file pass**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s9 t3: a C caller resolves to a function declared in an included .h read as cpp; a Python caller still never resolves to a same-named Go function | `src/indexer/__tests__/cross-file-c-family.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/indexer/__tests__/cross-file-c-family.test.ts` | 0 | 1 | 1 s |  |

## t4

Run at 2026-11-02T05:15:46.960Z on commit `effcc80ac`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: C reader**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s9 t4: a .c fixture yields its functions and types, with DEFINES, and its include and call relationships | `src/indexer/parser/__tests__/c.test.ts` |
| pass | s9 t4: a quoted include of a file on disk is an IMPORTS to that file (extracted); an angle include is an IMPORTS to a native module stub; a missing one stays pending | `src/indexer/parser/__tests__/c.test.ts` |
| pass | s9 t4: a same-file call is resolved (extracted); a call to another file stays pending for the cross-file pass | `src/indexer/parser/__tests__/c.test.ts` |
| pass | s9 t4: a fixture with a syntax error still yields the declarations outside the broken region, and its file is marked | `src/indexer/parser/__tests__/c.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/indexer/parser/__tests__/c.test.ts` | 0 | 4 | 0.7 s |  |
