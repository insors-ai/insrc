<!-- insrc:artifact TESTS-c2ba6fa62a148ed1-s8 -->

# Tests: c2ba6fa62a148ed1 s8

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 15 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

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

## t2

Run at 2026-11-02T09:33:49.424Z on commit `98f28962f`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: subsystem grouping**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s8 t2: every file is in exactly one group | `src/indexer/__tests__/subsystem-grouping.test.ts` |
| pass | s8 t2: the same graph gives the same groups, also with its edges and files shuffled | `src/indexer/__tests__/subsystem-grouping.test.ts` |
| pass | s8 t2: two dense clusters joined by one weak edge are two groups; a file with no relationships joins its directory through the same-directory edge | `src/indexer/__tests__/subsystem-grouping.test.ts` |
| pass | s8 t2: ids are the hash of the sorted members, names the longest common directory, and connections sum the edges between groups | `src/indexer/__tests__/subsystem-grouping.test.ts` |
| pass | s8 t2: a file tied between two groups joins the smaller one, whatever the edge order | `src/indexer/__tests__/subsystem-grouping.test.ts` |
| pass | s8 t2: groups aggregate: modules strongly linked in pairs end as one group per pair | `src/indexer/__tests__/subsystem-grouping.test.ts` |
| pass | s8 t2: connections count only relationships, never the same-directory edges, even between groups of one directory | `src/indexer/__tests__/subsystem-grouping.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/indexer/__tests__/subsystem-grouping.test.ts` | 0 | 7 | 0.5 s |  |

## t3

Run at 2026-11-02T09:39:41.527Z on commit `90a7d68c2`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: subsystem pass over a stored graph**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s8 t3: an incomplete graph is not grouped and nothing is written | `src/indexer/__tests__/subsystem-pass.test.ts` |
| pass | s8 t3: the stored set follows the stored relationships and their evidence; module stubs and other repositories are not edges | `src/indexer/__tests__/subsystem-pass.test.ts` |
| pass | s8 t3: a second pass at one generation does nothing; after a file changes, the new generation is regrouped | `src/indexer/__tests__/subsystem-pass.test.ts` |
| pass | s8 t3: every code entity of the repository has exactly one subsystem, through its file | `src/indexer/__tests__/subsystem-pass.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/indexer/__tests__/subsystem-pass.test.ts` | 0 | 4 | 2.2 s |  |
