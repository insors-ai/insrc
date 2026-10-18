<!-- insrc:artifact TESTS-dced43851723554f-S001 -->

# Tests: dced43851723554f S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 12 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-18T11:37:51.234Z on commit `de2915cb`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/db/__tests__/doc-summary-carry.test.ts: 'writeDocSummaryIfCurrent is unchanged and onlyIfAbsent never replaces a stored summary'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | writeDocSummaryIfCurrent is unchanged and onlyIfAbsent never replaces a stored summary | `src/db/__tests__/doc-summary-carry.test.ts` |

**unit: src/db/__tests__/doc-summary-carry.test.ts: 'keepGoodSummary keeps a stored summary with no errorCode and the same contentHash, and writes over an error row or a different hash'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | keepGoodSummary keeps a stored summary with no errorCode and the same contentHash, and writes over an error row or a different hash | `src/db/__tests__/doc-summary-carry.test.ts` |

**unit: src/db/__tests__/doc-summary-carry.test.ts: 'restoreCarriedDocSummaries writes a current carried summary under the new entity number, drops gone and changed ones and leaves no carry row'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | restoreCarriedDocSummaries writes a current carried summary under the new entity number, drops gone and changed ones and leaves no carry row | `src/db/__tests__/doc-summary-carry.test.ts` |
| pass | restoreCarriedDocSummaries works through more carry rows than one batch, and touches no other repository's carry | `src/db/__tests__/doc-summary-carry.test.ts` |

**unit: src/db/__tests__/doc-summary-carry.test.ts: 'a v5 store opened with this build has an empty doc_summary_carry and schema version 5'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a v5 store opened with this build has an empty doc_summary_carry and schema version 5 | `src/db/__tests__/doc-summary-carry.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/db/__tests__/doc-summary-carry.test.ts` | 0 | 5 | 6 s |  |

## t2

Run at 2026-10-18T11:42:35.906Z on commit `6cf6945e`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/db/__tests__/doc-summary-carry.test.ts: 'the delete with carryDocSummaries carries every summary it removes, the live value winning over an older carry row'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the delete with carryDocSummaries carries every summary it removes, the live value winning over an older carry row | `src/db/__tests__/doc-summary-carry.test.ts` |

**unit: src/db/__tests__/doc-summary-carry.test.ts: 'a failure inside the delete transaction rolls back the carry with the delete'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a failure inside the delete transaction rolls back the carry with the delete | `src/db/__tests__/doc-summary-carry.test.ts` |

**unit: src/db/__tests__/doc-summary-carry.test.ts: 'without carryDocSummaries the repository's carry rows are deleted'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | without carryDocSummaries the repository's carry rows are deleted | `src/db/__tests__/doc-summary-carry.test.ts` |

**unit: src/db/__tests__/doc-summary-carry.test.ts: 'repo removal of a repository with carry rows and no entities deletes the carry rows'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | repo removal of a repository with carry rows and no entities deletes the carry rows | `src/db/__tests__/doc-summary-carry.test.ts` |

**unit: src/db/__tests__/entities-return-to-pending.test.ts (existing, expectations gain carriedDocSummaries: 0)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | with returnIncomingToPending, a hand-written edge from repository A into B is a pending row of A awaiting the entity after B is deleted, counted in A's state; B's own edge is not returned | `src/db/__tests__/entities-return-to-pending.test.ts` |
| pass | a failure inside the delete transaction leaves both B's rows and A's edge untouched | `src/db/__tests__/entities-return-to-pending.test.ts` |
| pass | without the option the delete is as before: the edge is removed and nothing is returned to pending | `src/db/__tests__/entities-return-to-pending.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/db/__tests__/doc-summary-carry.test.ts` | 0 | 9 | 6.7 s |  |
| `src/db/__tests__/entities-return-to-pending.test.ts` | 0 | 3 | 1 s |  |
