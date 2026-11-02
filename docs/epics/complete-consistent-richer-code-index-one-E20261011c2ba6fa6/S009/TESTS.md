<!-- insrc:artifact TESTS-c2ba6fa62a148ed1-s9 -->

# Tests: c2ba6fa62a148ed1 s9

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 25 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

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

## t5

Run at 2026-11-02T05:20:51.601Z on commit `b0e4f9d74`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: C++ reader**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s9 t5: a .cpp fixture yields classes, methods and functions with namespaces folded in, and its include, call and inheritance relationships | `src/indexer/parser/__tests__/cpp.test.ts` |
| pass | s9 t5: a .h header is read as cpp and its declarations are functions a caller in another file can link to | `src/indexer/parser/__tests__/cpp.test.ts` |
| pass | s9 t5: a fixture with a syntax error still yields the declarations outside the broken region, and its file is marked | `src/indexer/parser/__tests__/cpp.test.ts` |

**integration: C caller resolves to a C++ header declaration**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s9 t5: a C caller of a function declared in an included .h header resolves to it across files through the family rule | `src/indexer/__tests__/c-calls-cpp-header.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/indexer/__tests__/c-calls-cpp-header.test.ts` | 0 | 1 | 1 s |  |
| `src/indexer/parser/__tests__/cpp.test.ts` | 0 | 3 | 0.6 s |  |

## t6

Run at 2026-11-02T05:27:53.386Z on commit `d031e5656`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: Rust reader**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s9 t6: a .rs fixture yields its items and its mod/use, call and impl relationships | `src/indexer/parser/__tests__/rust.test.ts` |
| pass | s9 t6: mod util; resolves to util.rs over util/mod.rs when both exist; crate, declared-module and super paths resolve to their module files; a missing module stays pending | `src/indexer/parser/__tests__/rust.test.ts` |
| pass | s9 t6: a fixture with a syntax error still yields the declarations outside the broken region, and its file is marked | `src/indexer/parser/__tests__/rust.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/indexer/parser/__tests__/rust.test.ts` | 0 | 3 | 0.6 s |  |

## t7

Run at 2026-11-02T05:34:48.328Z on commit `b8a2832cf`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: C# reader**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s9 t7: a .cs fixture yields its types and members and its using, call and base-list relationships | `src/indexer/parser/__tests__/csharp.test.ts` |
| pass | s9 t7: a same-file call resolves (extracted); a call into another file through a namespace stays pending | `src/indexer/parser/__tests__/csharp.test.ts` |
| pass | s9 t7: a fixture with a syntax error still yields the declarations outside the broken region, and its file is marked | `src/indexer/parser/__tests__/csharp.test.ts` |

**integration: mixed Rust/C#/C/C++ repository through IndexerService**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s9 t7 (ac1): a Rust, C#, C and C++ repository indexed through IndexerService stores, per language, file, function and type entities | `src/indexer/__tests__/mixed-native-languages.test.ts` |
| pass | s9 t7 (ac1): each language stores its IMPORTS -- files for includes and Rust modules, module stubs for external crates, system headers and namespaces | `src/indexer/__tests__/mixed-native-languages.test.ts` |
| pass | s9 t7 (ac1): each language stores its CALLS -- same-file calls extracted, Rust and C-to-header calls across files inferred, a C# call through a namespace pending | `src/indexer/__tests__/mixed-native-languages.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/indexer/__tests__/mixed-native-languages.test.ts` | 0 | 3 | 1.4 s |  |
| `src/indexer/parser/__tests__/csharp.test.ts` | 0 | 3 | 0.7 s |  |
