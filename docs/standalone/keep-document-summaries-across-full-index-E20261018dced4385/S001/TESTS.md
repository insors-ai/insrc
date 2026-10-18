<!-- insrc:artifact TESTS-dced43851723554f-S001 -->

# Tests: dced43851723554f S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 28 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

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

## t3

Run at 2026-10-18T11:59:48.678Z on commit `8ec5a00b`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/indexer/__tests__/full-index-rebuild.test.ts: 'a reindex keeps the summary of an unchanged document under its new entity number and drops the summaries of a changed and a deleted document'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a reindex keeps the summary of an unchanged document under its new entity number and drops the summaries of a changed and a deleted document | `src/indexer/__tests__/full-index-rebuild.test.ts` |

**integration: src/indexer/__tests__/full-index-rebuild.test.ts: 'after a reindex no doc_summary row is keyed by an entity number that is not stored'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | after a reindex no doc_summary row is keyed by an entity number that is not stored | `src/indexer/__tests__/full-index-rebuild.test.ts` |

**integration: src/indexer/__tests__/full-index-rebuild.test.ts: 'a full index of a previously complete repository interrupted immediately after the delete leaves it unfinished, start-up queues a full index, and that index writes the carried summaries back'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a full index of a previously complete repository interrupted immediately after the delete leaves it unfinished, start-up queues a full index, and that index writes the carried summaries back | `src/indexer/__tests__/full-index-rebuild.test.ts` |

**integration: src/indexer/__tests__/full-index-rebuild.test.ts: 'a full index made to throw after the delete keeps the summaries carried, and the next full index writes them back'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a full index made to throw after the delete keeps the summaries carried, and the next full index writes them back | `src/indexer/__tests__/full-index-rebuild.test.ts` |

**integration: src/indexer/__tests__/full-index-rebuild.test.ts: 'after a reindex the doc-summarise-repo sweep makes no model call for a document whose kept summary is current'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | after a reindex the doc-summarise-repo sweep makes no model call for a document whose kept summary is current | `src/indexer/__tests__/full-index-rebuild.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/indexer/__tests__/full-index-rebuild.test.ts` | 0 | 11 | 3.8 s |  |

## t4

Run at 2026-10-18T12:02:07.434Z on commit `a2681288`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/analyze/summariser/__tests__/summarise-doc-current.test.ts: 'a summary stored while the model runs is kept when the model then fails (the placeholder is not written)'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a summary stored while the model runs is kept when the model then fails (the placeholder is not written) | `src/analyze/summariser/__tests__/summarise-doc-current.test.ts` |

**unit: src/analyze/summariser/__tests__/summarise-doc-current.test.ts (existing, unchanged, still passes)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a summary of a document rewritten or deleted while it was summarised is not stored, and is reported as skipped body-changed or entity-gone | `src/analyze/summariser/__tests__/summarise-doc-current.test.ts` |
| pass | a summary write that throws is reported as persistence-failed | `src/analyze/summariser/__tests__/summarise-doc-current.test.ts` |
| pass | when the model fails, a placeholder write that throws keeps the model error, and one that finds the document gone or rewritten reports that instead | `src/analyze/summariser/__tests__/summarise-doc-current.test.ts` |

**unit: src/indexer/__tests__/doc-summary-sweep.test.ts: 'a kept-good result is counted as skipped, not failed'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a kept-good result is counted as skipped, not failed | `src/indexer/__tests__/doc-summary-sweep.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/summariser/__tests__/summarise-doc-current.test.ts` | 0 | 4 | 1.3 s |  |
| `src/indexer/__tests__/doc-summary-sweep.test.ts` | 0 | 9 | 0.6 s |  |

## t5

Run at 2026-10-18T12:11:49.431Z on commit `75e62369`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/db/__tests__/doc-summary-restore.test.ts: 'restore writes a backup summary whose document is stored with the same body, by either model, and counts already-present, gone, changed and undecodable rows'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | restore writes a backup summary whose document is stored with the same body, by either model, and counts already-present, gone, changed and undecodable rows | `src/db/__tests__/doc-summary-restore.test.ts` |
| pass | a backup file whose name has no extension is read as a single-file store | `src/db/__tests__/doc-summary-restore.test.ts` |

**integration: src/db/__tests__/doc-summary-restore.test.ts: 'a second restore writes nothing and the backup file is unchanged'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a second restore writes nothing and the backup file is unchanged | `src/db/__tests__/doc-summary-restore.test.ts` |

**integration: src/db/__tests__/doc-summary-restore.test.ts: 'a backup lacking entity_string_by_u64 is rejected, nothing is written and the backup is closed'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a backup lacking entity_string_by_u64 is rejected, nothing is written and the backup is closed | `src/db/__tests__/doc-summary-restore.test.ts` |

**integration: src/daemon/__tests__/doc-summary-restore-ipc.test.ts: 'docSummary.restoreFromBackup restores over IPC and rejects a relative path, a missing file and the live store path'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | docSummary.restoreFromBackup restores over IPC and rejects a relative path, a missing file and the live store path | `src/daemon/__tests__/doc-summary-restore-ipc.test.ts` |
| pass | restore refuses a relative path, a missing file, a directory and the live store, before opening anything | `src/db/__tests__/doc-summary-restore.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/doc-summary-restore-ipc.test.ts` | 0 | 1 | 2.8 s |  |
| `src/db/__tests__/doc-summary-restore.test.ts` | 0 | 5 | 1.3 s |  |
