<!-- insrc:artifact TESTS-c2ba6fa62a148ed1-s7 -->

# Tests: c2ba6fa62a148ed1 s7

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 10 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

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
