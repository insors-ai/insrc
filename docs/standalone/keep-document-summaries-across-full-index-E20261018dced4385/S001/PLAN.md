<!-- insrc:artifact PLAN-dced43851723554f-s1 -->

# Plan: E20261018dced4385:S001

## Summary

**Epic:** `keep-document-summaries-across-full-index`
**LLD run:** `wf-1792320996700-9ke9q5`
**LLD effective hash:** `66f0fd0c880f...`

Building this fix is mostly store work: a new carry table and an in-transaction conditional write in the document-summary store, a carry option on the repository delete, and a reordered full index that marks the repository unfinished before deleting and writes the carried summaries back before it finishes. A one-line guard in the summariser keeps a good summary from being replaced by an error placeholder, and a daemon IPC method restores the lost summaries from the 2026-10-16 backup. The last task ships it to the installed daemon and records the restore and a reindex as smoke evidence.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Store: doc_summary_carry, the in-transaction conditional write and the carry write-back | M | — | unit: src/db/__tests__/doc-summary-carry.test.ts: 'writeDocSummaryIfCurrent is unchanged and onlyIfAbsent never replaces a stored summary'; unit: src/db/__tests__/doc-summary-carry.test.ts: 'keepGoodSummary keeps a stored summary with no errorCode and the same contentHash, and writes over an error row or a different hash'; unit: src/db/__tests__/doc-summary-carry.test.ts: 'restoreCarriedDocSummaries writes a current carried summary under the new entity number, drops gone and changed ones and leaves no carry row'; unit: src/db/__tests__/doc-summary-carry.test.ts: 'a v5 store opened with this build has an empty doc_summary_carry and schema version 5' | [[c1]] [[c2]] [[c3]] |
| 2 | **`t2`** deleteEntitiesForRepo carries summaries, or clears the carry | S | `t1` | unit: src/db/__tests__/doc-summary-carry.test.ts: 'the delete with carryDocSummaries carries every summary it removes, the live value winning over an older carry row'; unit: src/db/__tests__/doc-summary-carry.test.ts: 'a failure inside the delete transaction rolls back the carry with the delete'; unit: src/db/__tests__/doc-summary-carry.test.ts: 'without carryDocSummaries the repository's carry rows are deleted'; unit: src/db/__tests__/doc-summary-carry.test.ts: 'repo removal of a repository with carry rows and no entities deletes the carry rows'; unit: src/db/__tests__/entities-return-to-pending.test.ts (existing, expectations gain carriedDocSummaries: 0) | [[c4]] |
| 3 | **`t3`** fullIndex: mark unfinished before the delete, carry, write back | M | `t1`, `t2` | integration: src/indexer/__tests__/full-index-rebuild.test.ts: 'a reindex keeps the summary of an unchanged document under its new entity number and drops the summaries of a changed and a deleted document'; integration: src/indexer/__tests__/full-index-rebuild.test.ts: 'after a reindex no doc_summary row is keyed by an entity number that is not stored'; integration: src/indexer/__tests__/full-index-rebuild.test.ts: 'a full index of a previously complete repository interrupted immediately after the delete leaves it unfinished, start-up queues a full index, and that index writes the carried summaries back'; integration: src/indexer/__tests__/full-index-rebuild.test.ts: 'a full index made to throw after the delete keeps the summaries carried, and the next full index writes them back'; integration: src/indexer/__tests__/full-index-rebuild.test.ts: 'after a reindex the doc-summarise-repo sweep makes no model call for a document whose kept summary is current' | [[c5]] |
| 4 | **`t4`** Summariser: the error placeholder keeps a good summary | S | `t1` | unit: src/analyze/summariser/__tests__/summarise-doc-current.test.ts: 'a summary stored while the model runs is kept when the model then fails (the placeholder is not written)'; unit: src/analyze/summariser/__tests__/summarise-doc-current.test.ts (existing, unchanged, still passes); unit: src/indexer/__tests__/doc-summary-sweep.test.ts: 'a kept-good result is counted as skipped, not failed' | [[c6]] |
| 5 | **`t5`** Backup restore: restoreDocSummariesFromBackup and the docSummary.restoreFromBackup IPC | M | `t1` | integration: src/db/__tests__/doc-summary-restore.test.ts: 'restore writes a backup summary whose document is stored with the same body, by either model, and counts already-present, gone, changed and undecodable rows'; integration: src/db/__tests__/doc-summary-restore.test.ts: 'a second restore writes nothing and the backup file is unchanged'; integration: src/db/__tests__/doc-summary-restore.test.ts: 'a backup lacking entity_string_by_u64 is rejected, nothing is written and the backup is closed'; integration: src/daemon/__tests__/doc-summary-restore-ipc.test.ts: 'docSummary.restoreFromBackup restores over IPC and rejects a relative path, a missing file and the live store path' | [[c7]] |
| 6 | **`t6`** Ship and restore on the installed daemon | S | `t3`, `t4`, `t5` | smoke: docs/standalone/keep-document-summaries-across-full-index-E20261018dced4385/S001/smoke.md | [[c8]] |

### 1.1 E20261018dced4385:S001:T001 — Store: doc_summary_carry, the in-transaction conditional write and the carry write-back

Add the docSummaryCarry field to GraphStore and open doc_summary_carry beside doc_summary (src/db/graph/store.ts:301, :624-625), key repoId u32 BE || UTF-8 entity id, value encodeDocSummary. In src/db/doc-summaries.ts factor writeDocSummaryIfCurrent's body into writeDocSummaryIfCurrentInTxn(s, entityId, summary, { onlyIfAbsent?, keepGoodSummary? }) taking the repo id from the stored entity row; declare the two public overloads so the no-options call keeps Promise<DocSummaryWriteOutcome>; add restoreCarriedDocSummaries(repo), which writes back the repository's carry rows in batches of 500 per write transaction, removing each carry row in the same transaction as its outcome.

**Acceptance checks:**
- A store opened from an existing v5 file gains an empty doc_summary_carry and SCHEMA_VERSION stays 5.
- writeDocSummaryIfCurrent without options returns exactly 'written' | 'entity-gone' | 'body-changed' as before (existing tests unchanged).
- onlyIfAbsent leaves a stored summary in place ('already-present'); keepGoodSummary leaves a stored summary with no errorCode and the same contentHash in place ('kept-good').
- restoreCarriedDocSummaries writes a carried summary whose document body still hashes to its contentHash under the document's current entity number, counts entity-gone and body-changed rows, and leaves no carry row for the repository.

### 1.2 E20261018dced4385:S001:T002 — deleteEntitiesForRepo carries summaries, or clears the carry

Add opts.carryDocSummaries to deleteEntitiesForRepo (src/db/entities.ts:567-602): when true, copy every doc_summary row of the repository's entities into doc_summary_carry inside the detachDeleteEntities before hook (the delete's own transaction), combined with the existing returnIncomingToPending hook; when absent, delete the repository's carry rows in a write transaction of deleteEntitiesForRepo's own that runs even with no entities. Return { returnedToPending, carriedDocSummaries } and update the two exact-result assertions in src/db/__tests__/entities-return-to-pending.test.ts.

**Acceptance checks:**
- With the option, every summary the delete removes is in doc_summary_carry under (repoId, entity id) after it commits, and carriedDocSummaries equals their number.
- With a carry row already present for an id that also has a doc_summary row, the delete with carryDocSummaries leaves the doc_summary value in the carry; a carry row with no live summary is kept.
- A failure inside the delete transaction leaves the entities, the summaries and the carry as they were.
- Without the option the repository has no carry rows afterwards, also when it has no entities left.
- entities-return-to-pending.test.ts passes with carriedDocSummaries: 0 in both expectations.

### 1.3 E20261018dced4385:S001:T003 — fullIndex: mark unfinished before the delete, carry, write back

Add markFullIndexUnfinished(repoPath) to src/db/index-state.ts (sets only fullIndexFinished = false via updateState). In fullIndex (src/indexer/index.ts:612-617) call it before deleteEntitiesForRepo, pass carryDocSummaries: true, add a test seam on IndexerService called right after the delete (like _settlePassesDoneForTest), call restoreCarriedDocSummaries(repoPath) after reconcileRepo and before finishFullIndexState (src/indexer/index.ts:724), log its counts, and correct the comment that says summaries are regenerated.

**Acceptance checks:**
- A reindex keeps the summary of an unchanged document under its new entity number and drops the summaries of a changed and a deleted document.
- After a reindex no doc_summary row is keyed by an entity number that is not stored, and doc_summary_by_repo has exactly one entry per stored summary.
- A full index of a previously complete repository made to throw immediately after the delete leaves fullIndexFinished false; start-up queues a full index, and that index writes the carried summaries back.
- A full index made to throw late (reconcileRepo) keeps the carry, and the next full index writes it back.
- After a reindex the doc-summarise-repo sweep makes no model call for a document whose kept summary is current.

### 1.4 E20261018dced4385:S001:T004 — Summariser: the error placeholder keeps a good summary

In summariseDoc's placeholder branch (src/analyze/summariser/driver.ts:238-242) call writeDocSummaryIfCurrent with { keepGoodSummary: true } and return { ok: false, skipped: 'kept-good', errorCode, errorMessage } for 'kept-good'; add 'kept-good' to SummariseDocResult.skipped (src/analyze/summariser/driver.ts:157) with its doc comment. The successful-write branch (:278-281) and the sweep classification (src/indexer/doc-summary-sweep.ts:56-58) stay as they are.

**Acceptance checks:**
- A summary stored while the model runs is kept when the model then fails, and the result is skipped 'kept-good'.
- A failing model with no stored summary still writes the placeholder as before.
- The sweep counts a kept-good result as skipped, not failed.
- The existing summarise-doc-current tests pass unchanged.

### 1.5 E20261018dced4385:S001:T005 — Backup restore: restoreDocSummariesFromBackup and the docSummary.restoreFromBackup IPC

Add restoreDocSummariesFromBackup(backupPath) beside the store code: open the backup as a separate read-only lmdb environment (noSubdir), check doc_summary and entity_string_by_u64 exist, walk doc_summary, map each u64 to its string id, decode the value (undecodable on failure), and write through writeDocSummaryIfCurrentInTxn with onlyIfAbsent in batches of 500 per write transaction; close the backup environment in a finally. Register 'docSummary.restoreFromBackup' in the daemon handler map (src/daemon/index.ts, beside repo.reindex at :839) validating backupPath (absolute, a regular file, not the live store's path from getGraphStorePath) before opening anything; return the six counts.

**Acceptance checks:**
- From a test-built backup, restore writes a summary whose document is stored with the same body by either model, and counts already-present, entity-gone, body-changed and undecodable rows.
- A second restore writes nothing and the backup file's bytes are unchanged.
- A restore whose backup lacks entity_string_by_u64 rejects, writes nothing and leaves the backup environment closed (a second open of the file succeeds).
- The IPC call restores over a seeded daemon and rejects a relative path, a missing file and the live store path without writing.

### 1.6 E20261018dced4385:S001:T006 — Ship and restore on the installed daemon

Update and restart the installed daemon, wait until every repository's full index has finished, run docSummary.restoreFromBackup with /Users/subhagho/.insrc/backup/graph.lmdb.schema-v4.2026-10-16T16-59-39-955Z, then reindex this repository; record per-outcome counts and per-repository summary counts before and after in docs/standalone/keep-document-summaries-across-full-index-E20261018dced4385/S001/smoke.md.

**Acceptance checks:**
- smoke.md records the restore's six counts and each repository's summary count before and after the restore.
- smoke.md records this repository's summary count before and after a reindex, and the difference equals the documents changed or deleted in between.
- A second restore on the installed daemon writes 0.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| src/db/__tests__/doc-summary-carry.test.ts: deleteEntitiesForRepo({ carryDocSummaries }), restoreCarriedDocSummaries, writeDocSummaryIfCurrentInTxn | `t1`, `t2` |
| src/indexer/__tests__/full-index-rebuild.test.ts: new cases beside the t11 ones | `t3` |
| src/db/__tests__/doc-summary-restore.test.ts: restoreDocSummariesFromBackup | `t5` |
| src/daemon/__tests__/doc-summary-restore-ipc.test.ts: the 'docSummary.restoreFromBackup' handler over a seeded daemon (src/daemon/__tests__/helpers/seeded-daemon.ts) | `t5` |
| docs/standalone/keep-document-summaries-across-full-index-E20261018dced4385/S001/smoke.md | `t6` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD S001 dataModelChanges: doc_summary_carry (new LMDB named database)`
- **[[c2]]** `prior-artifact` `LLD S001 contractDetails: writeDocSummaryIfCurrent and writeDocSummaryIfCurrentInTxn`
- **[[c3]]** `prior-artifact` `LLD S001 contractDetails: restoreCarriedDocSummaries`
- **[[c4]]** `prior-artifact` `LLD S001 contractDetails: deleteEntitiesForRepo`
- **[[c5]]** `prior-artifact` `LLD S001 dataModelChanges: fullIndex ordering`
- **[[c6]]** `prior-artifact` `LLD S001 errorPaths: the summariser's model call fails for a document whose summary was restored or written back while the model was running`
- **[[c7]]** `prior-artifact` `LLD S001 contractDetails: docSummary.restoreFromBackup`
- **[[c8]]** `prior-artifact` `LLD S001 migration: migrationSteps 1-3`
