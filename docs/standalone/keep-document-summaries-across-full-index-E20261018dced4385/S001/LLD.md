<!-- insrc:artifact LLD-dced43851723554f-s1 -->

# LLD: E20261018dced4385:S001

## Summary

**Epic:** `keep-document-summaries-across-full-index`
**HLD base run:** `wf-1792320996700-9ke9q5`
**HLD effective hash:** `66f0fd0c880f...`

A full index no longer throws away document summaries. In the same transaction that deletes the repository's rows, every summary is moved into a carry table keyed by the document's stable string id; once the rebuild has stored the documents again, each carried summary is written back only if its document still exists with the same content hash, and its carry row is removed in that same transaction, so a full index that is interrupted keeps its summaries for the full index start-up queues next. A one-time daemon IPC method reads the 2026-10-16 backup read-only and restores its summaries the same way, never overwriting a summary the live store already holds.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Diagrams](#4-diagrams)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Migration](#7-migration)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)
10. [Open questions](#10-open-questions)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `deleteEntitiesForRepo`

```typescript
deleteEntitiesForRepo(db: DbClient, repo: string, opts?: { readonly returnIncomingToPending?: boolean | undefined; readonly carryDocSummaries?: boolean | undefined }): Promise<{ returnedToPending: number; carriedDocSummaries: number }>
```

**Parameters:**
- `db: DbClient` — Unchanged.
- `repo: string` — The repository whose rows are deleted.
- `opts.carryDocSummaries: boolean | undefined` _(optional)_ — When true, every doc_summary row of the repository's entities is copied into doc_summary_carry inside the delete's own write transaction (the existing `before` hook of detachDeleteEntities), before the per-entity cascade removes it; with no entities there is nothing to carry and existing carry rows are kept. When false or absent, the repository's carry rows are deleted in a write transaction of deleteEntitiesForRepo's own that runs whether or not the repository has entities (detachDeleteEntities returns before its hook when the entity list is empty, src/db/entities.ts:1104), so repo.remove after an interrupted full index leaves nothing behind.

**Returns:** `{ returnedToPending: number; carriedDocSummaries: number }` — carriedDocSummaries is the number of summaries copied into the carry by this call (0 without the option).

**Errors:**
- `Error (from LMDB)` when A failure inside the delete transaction rolls back the delete and the carry together; nothing is lost.

**Preconditions:**
- The repository is registered (an unregistered repository returns { returnedToPending: 0, carriedDocSummaries: 0 } as today).

**Postconditions:**
- With carryDocSummaries: for every summary deleted from doc_summary for this repository there is a doc_summary_carry row with the same DocSummary under (repoId, the entity's string id); a carry row already present from an interrupted full index is kept (a doc_summary row for the same id overwrites it, being newer).
- Without it: the repository has no doc_summary_carry rows.
- deleteDocSummariesForRepo still runs; its per-repository sweep is unchanged.

### 2.2 `writeDocSummaryIfCurrent`

```typescript
writeDocSummaryIfCurrent(db: DbClient, entityId: string, repo: string, summary: DocSummary, opts?: { readonly keepGoodSummary?: boolean | undefined }): Promise<DocSummaryWriteOutcome | 'kept-good'>  // without opts unchanged; its body is factored into writeDocSummaryIfCurrentInTxn(s: GraphStore, entityId: string, summary: DocSummary, opts?: { readonly onlyIfAbsent?: boolean | undefined; readonly keepGoodSummary?: boolean | undefined }): DocSummaryWriteOutcome | 'already-present' | 'kept-good'
```

**Parameters:**
- `s: GraphStore` — The caller's write transaction (in-txn variant only).
- `entityId: string` — The document's deterministic string id.
- `summary: DocSummary` — The summary to write; its contentHash is checked against sha256 of the stored body.
- `opts.onlyIfAbsent: boolean | undefined` _(optional)_ — When true, a document that already has a doc_summary row is left as it is ('already-present'). Used by the backup restore so a live summary is never replaced by an older one.
- `opts.keepGoodSummary: boolean | undefined` _(optional)_ — When true, a stored summary with no errorCode and the same contentHash as the one being written is left as it is ('kept-good'), checked inside the write transaction. Passed by summariseDoc for its error placeholder (src/analyze/summariser/driver.ts:238-240), so a summary restored or written back while the model was running is never replaced by a placeholder when the model fails.

**Returns:** `DocSummaryWriteOutcome | 'already-present'` — 'written', 'entity-gone', 'body-changed' as today; 'already-present' only with onlyIfAbsent; 'kept-good' only with keepGoodSummary. The in-txn variant takes the repository id from the stored entity row, not from a caller-supplied path.

**Errors:**
- `Error` when The public function keeps its current throw for an unregistered repo.

**Preconditions:**
- Called inside a write transaction (in-txn variant).

**Postconditions:**
- Without opts the public function behaves exactly as before for its callers; the summariser's successful write (src/analyze/summariser/driver.ts:278) passes no option, so a fresh summary still replaces whatever is stored. The public function is declared with two overloads, so the no-options call keeps its exact return type: writeDocSummaryIfCurrent(db, entityId, repo, summary): Promise<DocSummaryWriteOutcome> and writeDocSummaryIfCurrent(db, entityId, repo, summary, opts: { readonly keepGoodSummary: true }): Promise<DocSummaryWriteOutcome | 'kept-good'>; the successful-write branch at src/analyze/summariser/driver.ts:278-281 compiles unchanged. In the placeholder branch (src/analyze/summariser/driver.ts:240-242) summariseDoc returns { ok: false, skipped: 'kept-good', errorCode, errorMessage } for 'kept-good': SummariseDocResult.skipped (src/analyze/summariser/driver.ts:157) gains 'kept-good', documented as 'the model failed but a good summary of the same body was stored meanwhile and kept'. The sweep's classification (src/indexer/doc-summary-sweep.ts:56-58) counts it as skipped through its existing `res.skipped !== undefined` branch, unchanged.

### 2.3 `restoreCarriedDocSummaries`

```typescript
restoreCarriedDocSummaries(repo: string): Promise<{ written: number; entityGone: number; bodyChanged: number }>
```

**Parameters:**
- `repo: string` — The repository whose carry rows are written back.

**Returns:** `{ written: number; entityGone: number; bodyChanged: number }` — How many carried summaries were written back and how many were dropped because the document is gone or its body changed.

**Errors:**
- `Error (from LMDB)` when A failed batch transaction leaves that batch's carry rows in place for the next full index.

**Preconditions:**
- Called by fullIndex after the index clean-up (reconcileRepo) and before finishFullIndexState, so every document the rebuild stores is stored.

**Postconditions:**
- Each carry row is removed in the same write transaction as its write-back (batches of 500 rows per transaction), so a row is never both lost and uncarried.
- The repository has no doc_summary_carry rows when it returns.

### 2.4 `docSummary.restoreFromBackup`

```typescript
IPC 'docSummary.restoreFromBackup' (params: { backupPath: string }) => Promise<{ read: number; written: number; alreadyPresent: number; entityGone: number; bodyChanged: number; undecodable: number }>
```

**Parameters:**
- `backupPath: string` — Absolute path of a single-file LMDB store (noSubdir) holding doc_summary and entity_string_by_u64, e.g. /Users/subhagho/.insrc/backup/graph.lmdb.schema-v4.2026-10-16T16-59-39-955Z.

**Returns:** `{ read; written; alreadyPresent; entityGone; bodyChanged; undecodable }` — Counts over every doc_summary row of the backup: written to the live store, skipped because the live store already holds a summary for the document, skipped because the document is not stored or its body changed, or skipped because the row or its id mapping could not be read.

**Errors:**
- `Error` when backupPath is missing, not absolute, not a file, or is the live store's own path.
- `Error` when The backup cannot be opened read-only or lacks the doc_summary or entity_string_by_u64 database.

**Preconditions:**
- The daemon owns the live store; the backup is opened as a separate read-only environment and closed when the call returns.

**Postconditions:**
- The backup file is not modified.
- Every write goes through writeDocSummaryIfCurrentInTxn with onlyIfAbsent: true, in batches of 500 rows per write transaction; summaries by the previous model are written as they are (the summariser's model rule replaces them in time).
- Running it twice writes nothing the second time (every row is then alreadyPresent, entityGone or bodyChanged).

## 3. Data model changes

### 3.1 `doc_summary_carry (new LMDB named database)` — new

Key: repoId u32 big-endian || UTF-8 string entity id. Value: encodeDocSummary(summary), the same encoding as doc_summary. Written only by deleteEntitiesForRepo({ carryDocSummaries: true }); read and removed by restoreCarriedDocSummaries; removed for a repository by deleteEntitiesForRepo without the option. Opened in openGraphStore beside doc_summary through open_ (an empty database on first open), so the v5 layout and SCHEMA_VERSION are unchanged.

```
+ docSummaryCarry: open_('doc_summary_carry')  // GraphStore field
```

**Call sites:**
- `src/db/graph/store.ts:624-625`
- `src/db/entities.ts:567-602`
- `src/db/doc-summaries.ts:200-232`
- `src/indexer/index.ts:617`
- `src/indexer/index.ts:724`
- `src/db/__tests__/entities-return-to-pending.test.ts:80`
- `src/db/__tests__/entities-return-to-pending.test.ts:115`
- `src/analyze/summariser/driver.ts:238-240`
- `src/analyze/summariser/driver.ts:157`
- `src/analyze/summariser/driver.ts:278-281`
- `src/indexer/doc-summary-sweep.ts:56-58`

### 3.2 `fullIndex ordering` — invariant-change

fullIndex first writes fullIndexFinished = false for the repository (a new markFullIndexUnfinished(repoPath) in src/db/index-state.ts that sets only that flag) BEFORE deleteEntitiesForRepo, so a crash at any point after the delete leaves the repository unfinished and start-up queues a full index (src/indexer/index.ts:261-267); beginFullIndexState stays where it is and keeps its counter reset. It then passes carryDocSummaries: true to deleteEntitiesForRepo and calls restoreCarriedDocSummaries(repoPath) after the index clean-up and before finishFullIndexState; the comment that says the summaries are regenerated is corrected. This closes a window the Epic c2ba6fa6 s1 rebuild already had (deleteEntitiesForRepo and deleteUnresolvedForRepo run before beginFullIndexState), which the carry depends on. The doc-summarise-repo job is still queued at the end and now skips every written-back document (same contentHash and model).

**Call sites:**
- `src/indexer/index.ts:612-617`
- `src/indexer/index.ts:724`
- `src/indexer/index.ts:758`

### 3.3 `daemon IPC handler registry` — field-add

One new handler, 'docSummary.restoreFromBackup', registered beside 'repo.reindex'.

**Call sites:**
- `src/daemon/index.ts:839`

## 4. Diagrams

- [ER model](docs/standalone/keep-document-summaries-across-full-index-E20261018dced4385/S001/er-model.html)

## 5. Error paths

**Error cases**

- **The full index is interrupted (daemon stop, crash, a thrown pass) after the delete and before restoreCarriedDocSummaries.** (recoverable)
  - Detection: fullIndexFinished is false from markFullIndexUnfinished, written before the delete (so the window before beginFullIndexState is covered too), and start-up queues a full index again; the carry rows of the repository are still in doc_summary_carry.
  - Response: The re-queued full index deletes again with carryDocSummaries (the repository now has few or no doc_summary rows, so little is added) and its restoreCarriedDocSummaries writes back every carried row, the ones from the interrupted run included.
  - User impact: None: the summaries come back when the next full index finishes.
- **A write-back batch transaction fails inside restoreCarriedDocSummaries.** (recoverable)
  - Detection: withWriteTxn throws; the error propagates out of fullIndex like any indexing failure, so the repository's status is 'error' and fullIndexFinished stays false.
  - Response: The failed batch's carry rows are rolled back with it and stay carried; earlier batches are written and removed. The next full index writes back the rest.
  - User impact: The repository reads not complete until the next full index; no summary is lost.
- **docSummary.restoreFromBackup is given a path that is missing, not absolute, not a regular file, or the live store's own file.** (recoverable)
  - Detection: The handler checks isAbsolute, statSync().isFile() and compares realpath against the live graph store path before opening anything.
  - Response: Reject the call with an Error naming the reason; nothing is opened or written.
  - User impact: A clear error; the store is untouched.
- **The backup opens but lacks doc_summary or entity_string_by_u64, or cannot be opened read-only.** (recoverable)
  - Detection: open() with readOnly: true throws, or the named database is not present in the backup's main database listing.
  - Response: Close the backup environment and reject with an Error; nothing is written.
  - User impact: A clear error; the store is untouched.
- **A backup row's value cannot be decoded by decodeDocSummary, or its u64 has no entity_string_by_u64 mapping in the backup.** (recoverable)
  - Detection: decodeDocSummary throws, or the mapping lookup returns undefined.
  - Response: Skip the row and count it as undecodable; continue with the rest.
  - User impact: That one summary is regenerated by the sweep in time.
- **A carried or backup summary's document is no longer stored, or its body changed.** (recoverable)
  - Detection: writeDocSummaryIfCurrentInTxn finds no entity_id_by_string entry or entity row ('entity-gone'), or sha256(body) differs from summary.contentHash ('body-changed').
  - Response: Do not write it; a carry row is removed in the same transaction; the outcome is counted.
  - User impact: None: the summary would be wrong for the current body; the sweep summarises the document afresh.
- **The summariser's model call fails for a document whose summary was restored or written back while the model was running.** (recoverable)
  - Detection: summariseDoc's catch block (src/analyze/summariser/driver.ts:232-240) writes its placeholder with keepGoodSummary; inside the write transaction the stored row has no errorCode and the same contentHash.
  - Response: The placeholder is not written ('kept-good'); the good summary stays.
  - User impact: None: the document keeps its summary instead of an error row.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A repository with no summaries is fully indexed. | carriedDocSummaries 0; restoreCarriedDocSummaries returns all zeros; behaviour as today. |
| A full index of a repository after an interrupted one, where the live doc_summary holds a summary for an id that is also carried. | The doc_summary row overwrites the carry row in the delete transaction (it is the newer one); one write-back. |
| repo.remove of a repository that has carry rows (an interrupted full index, then removal). | deleteEntitiesForRepo without the option deletes that repository's carry rows; none remain. |
| A carried summary whose document is stored by the rebuild under the same string id but a new entity number. | Written back under the new number with a doc_summary_by_repo entry; the sweep then skips the document when the summary's model is the configured one. |
| docSummary.restoreFromBackup while a full index of that repository is running. | A document not yet stored is 'entity-gone' (not written); a document whose live summary was already written back is 'already-present'. Run again after the index finishes to restore the rest; the call is idempotent. |
| docSummary.restoreFromBackup while the summary sweep runs. | Write transactions are serialised by LMDB. The restore never replaces a summary the sweep wrote (onlyIfAbsent). If the restore lands while the model is running on that document: a successful model call replaces it with a fresh summary of the same body (correct); a failed one writes its error placeholder with keepGoodSummary, so the restored summary is kept ('kept-good'). A restored current-model summary makes the sweep skip that document when it reaches it later. |
| A backup summary written by the previous model (qwen3.6:35b-a3b). | Restored as it is; the summariser regenerates it when the sweep reaches it, and readers have a summary meanwhile. |
| docSummary.restoreFromBackup run a second time. | written 0; every row is alreadyPresent, entityGone, bodyChanged or undecodable. |

**Invariants to preserve**

- Every summary written by the summariser's conditional path, the carry write-back and the backup restore is stored only for a document whose stored body hashes to the summary's contentHash, checked inside the write transaction (writeDocSummaryIfCurrent, Story b94cf2c9). The unconditional writeDocSummary keeps its current behaviour for its existing callers and tests (src/db/__tests__/doc-summaries-lmdb.test.ts). [[c5]]
- The summariser's skip rule is unchanged: same contentHash, same modelId, no errorCode means skip; anything else is summarised. [[c5]]
- A full index still deletes every entity row of the repository and rebuilds it from scratch (Epic c2ba6fa6 s1); only the summaries are carried, and they are re-keyed to the new entity numbers. [[c1]]
- The per-entity summary cascade (deleteDocSummaryInTxn) and the per-repository sweep (deleteDocSummariesForRepo) still run; doc_summary never holds a row for an entity number that is not stored. [[c2]]
- The daemon alone writes the store: the restore runs inside the daemon over IPC and opens the backup as a separate read-only environment. [[c7]]

## 6. Test strategy

**Test framework:** `node:test with node:assert/strict, run with npx tsx --test under Node 22 (PATH=/opt/homebrew/opt/node@22/bin:$PATH); temporary graph stores via setGraphStorePath and useTemporaryLance, as in src/indexer/__tests__/full-index-rebuild.test.ts`

**Test levels**

- **unit** — The carry and the conditional write-back at the store layer: the carry is written in the delete's transaction and rolled back with it; without the option the repository's carry rows are removed; the write-back writes a current summary under the new entity number, drops a gone or changed one and removes every carry row in the same transaction; writeDocSummaryIfCurrent is unchanged for its callers; onlyIfAbsent never replaces a live summary.
  - Subjects: `src/db/__tests__/doc-summary-carry.test.ts: deleteEntitiesForRepo({ carryDocSummaries }), restoreCarriedDocSummaries, writeDocSummaryIfCurrentInTxn`
  - Fixtures: `A temporary graph store with two registered repositories, document entities with known bodies and DocSummary rows whose contentHash is sha256 of the body`
- **integration** — The real full index keeps summaries: a reindex of a repository with an unchanged document, a changed document and a deleted document keeps exactly the unchanged one's summary (re-keyed to its new entity number); a full index made to throw after the delete and then run again ends with the summary written back; the doc-summarise-repo sweep makes no model call for a written-back current-model summary.
  - Subjects: `src/indexer/__tests__/full-index-rebuild.test.ts: new cases beside the t11 ones`
  - Fixtures: `A temporary repository with three markdown files; summaries seeded with writeDocSummaryIfCurrent after the first full index; the Interrupted subclass pattern already in the file (late interruption, from reconcileRepo); and a test seam on IndexerService called immediately after deleteEntitiesForRepo (like _settlePassesDoneForTest), which a test sets to throw, for the early window on a repository whose previous full index finished`
- **integration** — The backup restore end to end: from a backup environment built in a temporary file (noSubdir, with doc_summary and entity_string_by_u64), restore writes rows whose document is stored with the same body, counts alreadyPresent / entityGone / bodyChanged / undecodable, writes previous-model rows as they are, writes nothing on a second run and never modifies the backup; the IPC handler rejects a relative path, a missing file and the live store's own path.
  - Subjects: `src/db/__tests__/doc-summary-restore.test.ts: restoreDocSummariesFromBackup`, `src/daemon/__tests__/doc-summary-restore-ipc.test.ts: the 'docSummary.restoreFromBackup' handler over a seeded daemon (src/daemon/__tests__/helpers/seeded-daemon.ts)`
  - Fixtures: `A backup LMDB file written by the test with lmdb-js open({ noSubdir: true }) and the same named databases and encodings as the store (encodeEntityKey, encodeDocSummary)`
- **smoke** — On the installed daemon: run docSummary.restoreFromBackup with /Users/subhagho/.insrc/backup/graph.lmdb.schema-v4.2026-10-16T16-59-39-955Z and record the counts per outcome and the summary count per repository before and after; then reindex this repository and record that its summary count after the reindex is the count before it minus the changed and deleted documents.
  - Subjects: `docs/standalone/keep-document-summaries-across-full-index-E20261018dced4385/S001/smoke.md`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `src/indexer/__tests__/full-index-rebuild.test.ts: 'a reindex keeps the summary of an unchanged document under its new entity number and drops the summaries of a changed and a deleted document'`, `src/indexer/__tests__/full-index-rebuild.test.ts: 'after a reindex the doc-summarise-repo sweep makes no model call for a document whose kept summary is current'` |
| `ac2` | `src/indexer/__tests__/full-index-rebuild.test.ts: 'a full index made to throw after the delete keeps the summaries carried, and the next full index writes them back'`, `src/db/__tests__/doc-summary-carry.test.ts: 'a failure inside the delete transaction rolls back the carry with the delete'`, `src/db/__tests__/doc-summary-carry.test.ts: 'without carryDocSummaries the repository's carry rows are deleted'`, `src/indexer/__tests__/full-index-rebuild.test.ts: 'a full index of a previously complete repository interrupted immediately after the delete leaves it unfinished, start-up queues a full index, and that index writes the carried summaries back'`, `src/db/__tests__/doc-summary-carry.test.ts: 'repo removal of a repository with carry rows and no entities deletes the carry rows'` |
| `ac3` | `src/db/__tests__/doc-summary-restore.test.ts: 'restore writes a backup summary whose document is stored with the same body, by either model, and counts already-present, gone, changed and undecodable rows'`, `src/db/__tests__/doc-summary-restore.test.ts: 'a second restore writes nothing and the backup file is unchanged'`, `src/daemon/__tests__/doc-summary-restore-ipc.test.ts: 'docSummary.restoreFromBackup restores over IPC and rejects a relative path, a missing file and the live store path'`, `docs/standalone/keep-document-summaries-across-full-index-E20261018dced4385/S001/smoke.md` |
| `ac4` | `src/db/__tests__/doc-summary-carry.test.ts: 'writeDocSummaryIfCurrent is unchanged and onlyIfAbsent never replaces a stored summary'`, `src/analyze/summariser/__tests__/summarise-doc-current.test.ts (existing, unchanged, still passes)`, `src/analyze/summariser/__tests__/summarise-doc-current.test.ts: 'a summary stored while the model runs is kept when the model then fails (the placeholder is not written)'`, `src/indexer/__tests__/doc-summary-sweep.test.ts: 'a kept-good result is counted as skipped, not failed'` |

## 7. Migration

**State before:** A full index deletes every summary of the repository: the per-entity cascade deleteDocSummaryInTxn (src/db/entities.ts:1139) and the repository sweep deleteDocSummariesForRepo (src/db/entities.ts:601-602), called from fullIndex at src/indexer/index.ts:617; summaries are keyed by the entity number, which the rebuild reassigns, and the doc-summarise-repo sweep regenerates each at about 35 s. The live store (schema v5) holds no summaries for the six repositories after the reindex of 2026-10-18; the 2026-10-16 schema-v4 backup holds 22,216.

**State after:** The store has a doc_summary_carry database; a full index carries the repository's summaries through the rebuild and writes back each one whose document is unchanged, so the sweep only summarises changed or new documents. The live store's lost summaries are restored from the backup for every document whose current body has the same content hash.

**Zero downtime:** yes — **Data rewrite:** yes

**Steps**

1. Ship the code: the GraphStore opens the new doc_summary_carry database on the next daemon start (an empty named database; SCHEMA_VERSION stays 5, no layout step). Update the installed daemon with the maintenance update and restart it. — ↩ rollbackable
2. Run docSummary.restoreFromBackup once over IPC with /Users/subhagho/.insrc/backup/graph.lmdb.schema-v4.2026-10-16T16-59-39-955Z after every repository's full index has finished (repo.list completeness), and record the counts in the smoke evidence. The call writes only summaries whose document has no summary now and whose body matches; it can be run again safely. — ✕ non-rollbackable
3. Reindex this repository once and record that the summary count after the reindex equals the count before it less the documents that changed or were deleted (the carry works end to end). — ↩ rollbackable

**Backward compat:** deleteEntitiesForRepo keeps its signature with one more optional option and one more field in its result ({ returnedToPending, carriedDocSummaries }); its two other callers (repo.remove in src/daemon/index.ts:576 and src/db/repos.ts:192) pass no option and behave as before, now also clearing the repository's carry rows. The existing test src/db/__tests__/entities-return-to-pending.test.ts asserts the exact result ({ returnedToPending: 1 } and { returnedToPending: 0 }); both expectations gain carriedDocSummaries: 0, its pending-edge assertions unchanged. writeDocSummaryIfCurrent is unchanged for its callers. The new IPC method is additive; no IDE plugin calls it. An older daemon build opening a store that has doc_summary_carry ignores the extra named database.

## 8. Alternatives considered

### 8.1 a1: In-memory snapshot and conditional rewrite, plus a restore IPC

fullIndex reads the repository's (entityId, summary) pairs before the delete and rewrites each through writeDocSummaryIfCurrent once the files are indexed; a daemon IPC method restores from a backup file the same way.

Add listDocSummaryPairsForRepo(db, repo) to src/db/doc-summaries.ts (zipping listDocSummariesForRepo with listDocSummaryEntityIdsForRepo inside one read). In fullIndex (src/indexer/index.ts) call it before deleteEntitiesForRepo, hold the pairs in memory, and after the file walk (before the summary job is queued at :758) call writeDocSummaryIfCurrent for each pair, counting written / entity-gone / body-changed. For the lost summaries add a daemon IPC method docSummary.restoreFromBackup { backupPath } that opens the backup LMDB file read-only, walks doc_summary, maps each u64 to its string id through entity_string_by_u64, takes the repository from the live entity row and calls writeDocSummaryIfCurrent; it skips a row whose live summary is already current. No storage layout change.

**Rejected because:** Smallest, but the in-memory snapshot repeats the defect on any interrupted full index, which a full index of a large repository (hours) makes likely.

### 8.2 a2: Durable carry table written in the delete transaction, plus a restore IPC — **CHOSEN**

deleteEntitiesForRepo moves the repository's summaries, keyed by string entity id, into a doc_summary_carry sub-DB in the same transaction as the delete; fullIndex rewrites them conditionally after the walk and clears the carry; the restore IPC is as in a1.

Add a doc_summary_carry sub-DB (string entity id -> DocSummary, plus the repository) opened beside doc_summary, and an option { carryDocSummaries: true } on deleteEntitiesForRepo that, inside its write transaction, copies each summary it deletes into the carry. fullIndex passes the option, and after the file walk rewrites every carried row of the repository through writeDocSummaryIfCurrent and deletes it from the carry (in the same transaction as the write). A full index interrupted part-way leaves the carry in place; the re-queued full index at start-up appends nothing new (the summaries are already gone from doc_summary) and rewrites the carried rows when it finishes. The restore IPC is the a1 method. Adding a sub-DB is additive (an empty sub-DB on open), but a new named database in a v5 store must be checked against the schema-version rule.

### 8.3 a3: Key summaries by string entity id so the delete need not touch them

Change doc_summary's key from the entity u64 to the deterministic string id, and stop the full index deleting summaries; a stale summary is skipped by the existing contentHash check.

Re-key doc_summary and doc_summary_by_repo by the string id (a v6 layout step migrating every row), drop the deleteDocSummaryInTxn and deleteDocSummariesForRepo calls from the full-index path, and rely on the summariser's contentHash rule plus a sweep that removes summaries whose entity is not stored after a full index. The restore copies backup rows straight into the new layout when the body hash matches.

**Rejected because:** Robust by construction but needs a v6 layout migration and an orphan pass, far beyond the defect.

## 9. References

- **[[c1]]** `code` `src/indexer/index.ts:617` — "const { returnedToPending } = await deleteEntitiesForRepo(this.db, repoPath, { returnIncomingToPending: true });"
- **[[c2]]** `code` `src/db/entities.ts:1139` — "deleteDocSummaryInTxn(s, u64);"
- **[[c3]]** `code` `src/db/entities.ts:601-602` — "await deleteDocSummariesForRepo(null as unknown as DbClient, repo);"
- **[[c4]]** `code` `src/db/doc-summaries.ts:200-219` — "export async function writeDocSummaryIfCurrent("
- **[[c5]]** `code` `src/analyze/summariser/driver.ts:196-202` — "existing.contentHash === contentHash && existing.modelId === modelId && existing.errorCode === undefined"
- **[[c6]]** `prior-artifact` `docs/standalone/keep-document-summaries-across-full-index-E20261018dced4385/ISSUE.md` — "A full index keeps every document summary whose document is still stored after the rebuild with the same body"
- **[[c7]]** `stakeholder` `stakeholder decision 2026-10-18` — "A: one bugfix ISSUE covering both parts (keep summaries across a full index; one-time restore from the 2026-10-16 backup)"
- **[[c8]]** `step-output` `s3` — "a2 is the only alternative scoring 'satisfies' on every constraint: it keeps fix-intent 1 across an interrupted full index (a1 scores only 'partial' there) and needs no layout change (a3 'violates' th"
- **[[c9]]** `code` `src/db/entities.ts:1103-1113` — "await withWriteTxn(s => { before?.(s); detachDeleteEntitiesInTxn(s, u64s); });"
- **[[c10]]** `code` `src/db/graph/store.ts:624-625` — "docSummary:         open_('doc_summary'),"

## 10. Open questions

- Acceptance criteria (the Story carries none; derived from the ISSUE's fix intent, c1-c7): ac1 a full index keeps the summary of every document still stored with the same body, under its new entity number, and drops the rest; ac2 a full index interrupted after the delete loses no summary, and the next full index writes the carried ones back; ac3 docSummary.restoreFromBackup restores the backup's summaries for every document whose current body has the same content hash, by either model, never replaces a stored summary and is idempotent; ac4 writeDocSummaryIfCurrent without options and the summariser's skip rule are unchanged, and the summariser's error placeholder never replaces a stored summary with no errorCode for the same contentHash.
- cd1 partial: restoreCarriedDocSummaries, writeDocSummaryIfCurrentInTxn, markFullIndexUnfinished, restoreDocSummariesFromBackup (the store-level function behind the IPC handler) and the IPC method docSummary.restoreFromBackup are new names; there is no HLD to own them (standalone fix).

## Resolved questions

- `qd56b3f85` — Acceptance criteria (the Story carries none; derived from the ISSUE's fix intent, c1-c7): ac1 a full index keeps the summary of every document still stored with the same body, under its new entity number, and drops the rest; ac2 a full index interrupted after the delete loses no summary, and the next full index writes the carried ones back; ac3 docSummary.restoreFromBackup restores the backup's summaries for every document whose current body has the same content hash, by either model, never replaces a stored summary and is idempotent; ac4 writeDocSummaryIfCurrent without options and the summariser's skip rule are unchanged, and the summariser's error placeholder never replaces a stored summary with no errorCode for the same contentHash.
  - **resolved**: Adopt four grouped criteria — Stakeholder decision 2026-10-18: ac1-ac4 as stated; the approved LLD's test mapping already maps every proving test to them. _(2026-10-18T11:25:28.913Z)_
- `q6880ca99` — cd1 partial: restoreCarriedDocSummaries, writeDocSummaryIfCurrentInTxn, markFullIndexUnfinished, restoreDocSummariesFromBackup (the store-level function behind the IPC handler) and the IPC method docSummary.restoreFromBackup are new names; there is no HLD to own them (standalone fix).
  - **resolved**: Define contracts in S001 LLD — Stakeholder decision 2026-10-18: the standalone S001 LLD is the authority for the four store functions and the docSummary.restoreFromBackup IPC method; its section 2 already gives their signatures, behaviour and errors. _(2026-10-18T11:26:29.313Z)_

## Citations

- **[[c1]]** `code` `src/indexer/index.ts:617` — "const { returnedToPending } = await deleteEntitiesForRepo(this.db, repoPath, { returnIncomingToPending: true });"
- **[[c2]]** `code` `src/db/entities.ts:1139` — "deleteDocSummaryInTxn(s, u64);"
- **[[c3]]** `code` `src/db/entities.ts:601-602` — "await deleteDocSummariesForRepo(null as unknown as DbClient, repo);"
- **[[c4]]** `code` `src/db/doc-summaries.ts:200-219` — "export async function writeDocSummaryIfCurrent("
- **[[c5]]** `code` `src/analyze/summariser/driver.ts:196-202` — "existing.contentHash === contentHash && existing.modelId === modelId && existing.errorCode === undefined"
- **[[c6]]** `prior-artifact` `docs/standalone/keep-document-summaries-across-full-index-E20261018dced4385/ISSUE.md` — "A full index keeps every document summary whose document is still stored after the rebuild with the same body"
- **[[c7]]** `stakeholder` `stakeholder decision 2026-10-18` — "A: one bugfix ISSUE covering both parts (keep summaries across a full index; one-time restore from the 2026-10-16 backup)"
- **[[c8]]** `step-output` `s3` — "a2 is the only alternative scoring 'satisfies' on every constraint: it keeps fix-intent 1 across an interrupted full index (a1 scores only 'partial' there) and needs no layout change (a3 'violates' th"
- **[[c9]]** `code` `src/db/entities.ts:1103-1113` — "await withWriteTxn(s => { before?.(s); detachDeleteEntitiesInTxn(s, u64s); });"
- **[[c10]]** `code` `src/db/graph/store.ts:624-625` — "docSummary:         open_('doc_summary'),"
