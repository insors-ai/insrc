<!-- insrc:artifact TESTS-c2ba6fa62a148ed1-s8 -->

# Tests: c2ba6fa62a148ed1 s8

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 31 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

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

## t4

Run at 2026-11-02T09:46:53.914Z on commit `7182d1d58`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: subsystem summaries through the cheap-tier provider**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s8 t4: summaries are written only for new memberships; an unchanged subsystem keeps its summary and causes no call | `src/indexer/__tests__/subsystem-summaries.test.ts` |
| pass | s8 t4: the summary calls are made one at a time | `src/indexer/__tests__/subsystem-summaries.test.ts` |
| pass | s8 t4: a failing call leaves that summary empty and the others written | `src/indexer/__tests__/subsystem-summaries.test.ts` |
| pass | s8 t4: a generation that advances while summaries are written stops further writes | `src/indexer/__tests__/subsystem-summaries.test.ts` |
| pass | s8 t4: a summary is stored only on the subsystem rows of the generation it was written for | `src/indexer/__tests__/subsystem-summaries.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/indexer/__tests__/subsystem-summaries.test.ts` | 0 | 5 | 3.2 s |  |

## t5

Run at 2026-11-02T09:51:03.089Z on commit `72314d819`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: subsystems job queued and run in the summary lane**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s8 t5: the subsystems job runs in the summary lane, after code work, and is handed to the summary worker | `src/indexer/__tests__/subsystems-job.test.ts` |
| pass | s8 t5: queued subsystems jobs for one repository collapse to one | `src/indexer/__tests__/subsystems-job.test.ts` |
| pass | s8 t5: a full index that leaves the graph complete enqueues one subsystems job; an incomplete one enqueues none; the job runs the pass | `src/indexer/__tests__/subsystems-job.test.ts` |
| pass | s8 t5: a settle and a clean-up that leave the graph complete enqueue the job; an incomplete graph does not | `src/indexer/__tests__/subsystems-job.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/indexer/__tests__/subsystems-job.test.ts` | 0 | 4 | 1.7 s |  |

## t6

Run at 2026-11-02T09:55:10.020Z on commit `674989914`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: index.subsystems through IndexerService**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s8 t6 (ac1): a complete, grouped repository returns its subsystems with their connections, every code entity in exactly one | `src/indexer/__tests__/subsystems-request.test.ts` |
| pass | s8 t6 (ac5): an incomplete graph says the groups rest on an incomplete graph; an older generation is stale; an ungrouped repository is not grouped yet | `src/indexer/__tests__/subsystems-request.test.ts` |
| pass | s8 t6: the index.subsystems request is classed for the code-indexing worker | `src/indexer/__tests__/subsystems-request.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/indexer/__tests__/subsystems-request.test.ts` | 0 | 3 | 2.1 s |  |

## t7

Run at 2026-11-02T10:00:37.755Z on commit `32cc19900`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: analyzer subsystem context**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s8 t7 (ac3): a request about one module names its subsystem, summary and connections, each a stored row, after the existing structure | `src/analyze/context/__tests__/subsystem-context.test.ts` |
| pass | s8 t7: only a file with a stored subsystem row selects a subsystem; other path-like text is ignored | `src/analyze/context/__tests__/subsystem-context.test.ts` |
| pass | s8 t7: without a repository or stored subsystems the bundle is unchanged | `src/analyze/context/__tests__/subsystem-context.test.ts` |
| pass | s8 t7: the cache never holds the block, and subsystems stored after a bundle was cached show on the next serve | `src/analyze/context/__tests__/subsystem-context.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/context/__tests__/subsystem-context.test.ts` | 0 | 4 | 1.6 s |  |

## t8

Run at 2026-11-02T10:48:02.439Z on commit `72bf1dc57`. Tests check: **passed**. 0 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

the gate ran no test: every named test of this Task was reported by the builder

**smoke: installed daemon: subsystems**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S008/smoke-t8.txt (installed daemon @ 2befc2d8: /tmp/insrc-s9-smoke grouped into 5 subsystems with 5 summaries at generation 28; insrc_analyze context names '#### Subsystem cpp' with its stored summary and files); full sweep in S008/full-sweep-t8.txt
