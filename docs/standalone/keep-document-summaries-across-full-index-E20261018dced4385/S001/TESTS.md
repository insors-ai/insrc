<!-- insrc:artifact TESTS-dced43851723554f-S001 -->

# Tests: dced43851723554f S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

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
