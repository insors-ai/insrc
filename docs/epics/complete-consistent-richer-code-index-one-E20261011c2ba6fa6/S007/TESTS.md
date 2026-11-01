<!-- insrc:artifact TESTS-c2ba6fa62a148ed1-s7 -->

# Tests: c2ba6fa62a148ed1 s7

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 22 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-11-01T19:07:14.344Z on commit `71b4348d2`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: evidence codec round-trip and unknown decoding**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s7 t1: every evidence value round-trips through the edge-row codec; unknown is the empty value and the others are one distinct byte | `src/db/graph/__tests__/evidence-codec.test.ts` |
| pass | s7 t1: an empty value, 0x00 and a byte no value uses decode to unknown; a string that is not a value encodes empty and is reported invalid | `src/db/graph/__tests__/evidence-codec.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/db/graph/__tests__/evidence-codec.test.ts` | 0 | 2 | 0.5 s |  |

## t2

Run at 2026-11-01T19:11:49.297Z on commit `3537ca63c`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: upsertResolvedRelationsInTxn evidence on both rows**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s7 t2: upsertResolvedRelationsInTxn writes the evidence byte to both edge rows, and a rewrite with another evidence replaces it on both | `src/db/__tests__/relations-evidence.test.ts` |
| pass | s7 t2: an evidence that is not a value stores the relationship with an empty value and a warn log; it is not refused | `src/db/__tests__/relations-evidence.test.ts` |

**integration: promoteResolvedBatch evidence and carried meta.evidence**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s7 t2: a relationship kept awaiting its target carries its evidence, and promoteResolvedBatch without an evidence stores the carried one; a given evidence wins | `src/db/__tests__/relations-evidence.test.ts` |

**integration: returnEdgeToPendingInTxn keeps evidence**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s7 t2: an edge returned to pending when its target is removed keeps its evidence, and is promoted again with it | `src/db/__tests__/relations-evidence.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/db/__tests__/relations-evidence.test.ts` | 0 | 4 | 1.6 s |  |

## t3

Run at 2026-11-01T19:16:43.355Z on commit `45155b01d`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: resolveRelations evidence 'extracted' through the file commit**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s7 t3: a call to a function of the same file, indexed through the file commit, is stored extracted | `src/indexer/__tests__/evidence-extracted.test.ts` |
| pass | s7 t3: a relative import of a file not stored yet waits with its evidence, and is stored extracted when the file arrives (Pass 0) | `src/indexer/__tests__/evidence-extracted.test.ts` |
| pass | s7 t3: every relation resolveRelations returns as resolved carries evidence extracted; the ones it leaves pending carry none | `src/indexer/__tests__/evidence-extracted.test.ts` |

**integration: manifest DEPENDS_ON evidence**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s7 t3: the repository's DEPENDS_ON edges from its manifest are stored extracted | `src/indexer/__tests__/evidence-extracted.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/indexer/__tests__/evidence-extracted.test.ts` | 0 | 4 | 1.4 s |  |

## t4

Run at 2026-11-01T19:22:06.745Z on commit `d896047e2`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: cross-file passes evidence 'inferred'; Pass 0 keeps the carried value**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s7 t4: a call resolved to a function of another file is stored inferred, beside the same-file call stored extracted (ac1) | `src/indexer/__tests__/evidence-inferred.test.ts` |
| pass | s7 t4: Pass 0 restores an awaiting relationship with the evidence it carried, not inferred | `src/indexer/__tests__/evidence-inferred.test.ts` |
| pass | s7 t4: an import of a module stub that Pass 1 rewires to the in-tree file is stored inferred | `src/indexer/__tests__/evidence-inferred.test.ts` |
| pass | s7 t4: the external-service and messaging endpoint passes store their edges inferred | `src/indexer/__tests__/evidence-inferred.test.ts` |
| pass | the stored EXPORTS edge holds the evidence inferred (Epic c2ba6fa6 s7) and export_names holds (barrel, g) -> f and the star entries | `src/indexer/__tests__/reexport-callers.test.ts` |

**integration: ambiguous call stays pending; no 'chosen'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s7 t4: a call matching several candidates stays pending, classed ambiguous with its candidates, and no edge is written; no stored edge reads chosen (ac2) | `src/indexer/__tests__/evidence-inferred.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/indexer/__tests__/evidence-inferred.test.ts` | 0 | 5 | 1.6 s |  |
| `src/indexer/__tests__/reexport-callers.test.ts` | 0 | 3 | 1.6 s |  |

## t5

Run at 2026-11-01T19:30:26.290Z on commit `37054280a`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: findCallers/findCallees evidence**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s7 t5: findCallers and findCallees return each entity with the evidence of the relationship that reached it | `src/db/__tests__/search-evidence.test.ts` |

**integration: pre-change store reads 'unknown'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s7 t5: edges written with an empty value, as before s7, read unknown after a reopen with no migration and the schema version unchanged (ac3) | `src/db/__tests__/search-evidence.test.ts` |

**integration: outNeighbors withEvidence**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s7 t5: outNeighbors with withEvidence returns one row per stored relationship across kinds with its kind and evidence; the id-only form still dedupes | `src/db/__tests__/search-evidence.test.ts` |
| pass | s7 t5: a transitive closure is the same whatever evidence its edges hold | `src/db/__tests__/search-evidence.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/db/__tests__/search-evidence.test.ts` | 0 | 4 | 1.3 s |  |

## t6

Run at 2026-11-01T19:45:32.101Z on commit `383398e2b`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: search.callers / search.callees / search.callers_nhop evidence**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s7 t6: search.callers, search.callees and every hop of search.callers_nhop return each entity with its relationship evidence, existing fields unchanged | `src/daemon/__tests__/search-evidence-rpc.test.ts` |

**integration: graph tools evidence**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s7 t6: graph_callers and graph_callees include the evidence in each short entity | `src/daemon/__tests__/search-evidence-rpc.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/search-evidence-rpc.test.ts` | 0 | 2 | 1.1 s |  |
