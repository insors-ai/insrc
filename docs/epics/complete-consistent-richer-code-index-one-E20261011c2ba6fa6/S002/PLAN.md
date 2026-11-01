<!-- insrc:artifact PLAN-c2ba6fa62a148ed1-s2 -->

# Plan: E20261101c2ba6fa6:S002

## Summary

**Epic:** `complete-consistent-richer-code-index-one`
**LLD run:** `wf-1793536984297-fx4r7l`
**LLD effective hash:** `85da4a2df479...`

Building s2 means growing the store's unused whole-file replacement into commitFile in two halves (entities, then relationships) on top of in-transaction forms of s1's relationship writers, then reversing the embedding marker so it is set only after a vector is stored, counting and repairing missing vectors, and moving the indexer's refresh, delete and clean-up onto the one commit. The re-embed job becomes a backfill in its own queue lane, run at start and after an index, sized from a measured upsert-versus-add cost; the work ends with a full sweep and a smoke check on the installed daemon.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Split the resolved and pending relationship writers into in-transaction bodies | S | — | unit: commitFile | [[c1]] [[c11]] |
| 2 | **`t2`** Add the FileCommit, FileCommitResult and RelationWrite types | S | — | unit: commitFile | [[c7]] |
| 3 | **`t3`** Grow reindexFile into commitFile: the entity half | M | `t1`, `t2` | unit: commitFile; unit: reindexFile | [[c1]] [[c2]] [[c7]] [[c12]] |
| 4 | **`t4`** commitFile: the relationship half | M | `t1`, `t3` | unit: commitFile | [[c1]] [[c7]] [[c12]] |
| 5 | **`t5`** Set the embedding marker only after the vector is stored | M | `t3`, `t4` | integration: commitFile; integration: updateEmbedding | [[c4]] [[c8]] [[c12]] |
| 6 | **`t6`** Count unembedded entities | M | `t5` | integration: commitFile | [[c9]] [[c12]] |
| 7 | **`t7`** Compare entity ids with the vector table at start | M | `t5`, `t6` | integration: listUnembeddedEntities; integration: IndexerService.reembed | [[c10]] [[c11]] |
| 8 | **`t8`** Move the indexer's refresh, delete and clean-up removal onto commitFile | M | `t4`, `t5` | integration: IndexerService.indexFile | [[c3]] [[c12]] |
| 9 | **`t9`** Give the backfill its own queue lane | M | — | integration: IndexerService.reembed | [[c14]] |
| 10 | **`t10`** Extend reembed into the backfill and queue it | M | `t6`, `t7`, `t9` | integration: IndexerService.reembed; integration: listUnembeddedEntities | [[c5]] [[c6]] [[c9]] [[c14]] |
| 11 | **`t11`** Measure the vector upsert against the plain add on this repository | S | `t5` | smoke: upsert vs add on this repository's vector table (two-point) | [[c15]] |
| 12 | **`t12`** Ship and smoke on the installed daemon | S | `t8`, `t10`, `t11` | smoke: installed daemon: refresh under polling, delete, backfill at start | [[c11]] [[c13]] |

### 1.1 E20261101c2ba6fa6:S002:T001 — Split the resolved and pending relationship writers into in-transaction bodies

upsertResolvedRelations and upsertUnresolvedRelations each get a synchronous *InTxn body that takes the open GraphStore and returns its counts; the existing async functions call it inside their own withWriteTxn, so their behaviour (s1's keep-pending / count-unwritable rule) is unchanged.

**Acceptance checks:**
- the existing relations test files pass unchanged
- both in-transaction bodies can be called inside a caller's withWriteTxn and their writes roll back with it

### 1.2 E20261101c2ba6fa6:S002:T002 — Add the FileCommit, FileCommitResult and RelationWrite types

Export the sc2 types from the store layer and the mapping of RelationWrite (stored / pending target, evidence accepted and ignored) onto the existing Relation shape the writers take.

**Acceptance checks:**
- the types match the HLD sc2 sketch field for field
- a RelationWrite with a stored target maps to a resolved Relation and one with a pending target to an unresolved Relation with the same meta

### 1.3 E20261101c2ba6fa6:S002:T003 — Grow reindexFile into commitFile: the entity half

One withWriteTxn: read the file's existing entities through entityByFile, upsert the parsed entities (module stubs ensure-exists), detach entities no longer parsed, advance the generation and drop the file from uncommittedFiles; contentHash null removes the file's entities. reindexFile becomes a thin wrapper. Returns FileCommitResult.

**Acceptance checks:**
- the file's previous entities are found through entityByFile, not a scan of the entity table
- a commit that throws part-way leaves every row of the file as before, read after a reopen
- contentHash null removes the file's entities in one transaction
- the generation advances and the file leaves uncommittedFiles in the same transaction
- reindex-file-lmdb tests still pass through the wrapper

### 1.4 E20261101c2ba6fa6:S002:T004 — commitFile: the relationship half

Inside commitFile's transaction: remove the outgoing edges of every previous entity of the file and the file's pending rows, write commit.relations through t1's in-transaction bodies, and return each incoming relationship of a removed entity whose holder survives to pending awaiting the removed id.

**Acceptance checks:**
- a refresh replaces the file's outgoing relationships and pending rows in the same transaction as its entities
- incoming relationships of surviving entities are left in place
- contentHash null removes the file's entities, relationships and pending rows together and returns incoming relationships of other files to pending (ac4)
- a relationship whose target is not stored becomes a pending row awaiting the id (s1's rule, unchanged)

### 1.5 E20261101c2ba6fa6:S002:T005 — Set the embedding marker only after the vector is stored

Every writer stores entity rows with an empty marker; after the commit the vectors are written (plain add for an entity first allocated in this commit, upsert otherwise; deletes for removed entities) and a second transaction sets the written entities' markers to the active backend's model. upsertEntities and updateEmbedding get the same order; embedEntities no longer sets the marker on the entity.

**Acceptance checks:**
- a failed vector write leaves the changed entities' markers empty
- a successful write sets each marker to the active backend's model name
- updateEmbedding writes the vector before the marker
- a first-allocated entity uses the plain add, a changed one the upsert
- FileCommitResult.vectorsOutstanding reports the entities whose vector was not written

### 1.6 E20261101c2ba6fa6:S002:T006 — Count unembedded entities

IndexState.unembedded is adjusted in the commit transaction and the marker transaction for entities the embed step selects (non-empty body), and recounted from the entity table by reconcileIndexStateInTxn on open.

**Acceptance checks:**
- after a commit whose vector write failed, unembedded equals the number of selected entities without a vector and the repository is not complete
- empty-body entities (endpoints, module stubs) are never counted
- the recount on open corrects a wrong stored count

### 1.7 E20261101c2ba6fa6:S002:T007 — Compare entity ids with the vector table at start

On the indexing worker at start, before any backfill is queued: delete vectors whose entity is not stored, and clear the marker (and count unembedded) of an entity whose marker is set but whose vector is missing.

**Acceptance checks:**
- an orphan vector is deleted before a plain add for the same id can run
- an entity with a set marker and no vector has its marker cleared and is counted unembedded

### 1.8 E20261101c2ba6fa6:S002:T008 — Move the indexer's refresh, delete and clean-up removal onto commitFile

IndexerService.indexFile reads, parses, resolves and embeds, then calls commitFile once (no delete first); the delete branch of fileEvent and removeStoredFile call commitFile with contentHash null; a file event whose parse, embed or commit fails records the file in uncommittedFiles.

**Acceptance checks:**
- a file event whose embed throws leaves the previous rows and records the file as uncommitted (ac1)
- an integration test that holds the embed step on a promise and reads the file's entities and outgoing relationships through the store in the meantime gets the complete old set, and after the commit the complete new set (ac2)
- no deleteEntitiesForFile / deleteUnresolvedForFile / upsertEntities / upsertRelations call remains on the refresh path

### 1.9 E20261101c2ba6fa6:S002:T009 — Give the backfill its own queue lane

A third IndexQueue lane takes the reembed jobs, running beside the index lane so file, full and reconcile jobs are never queued behind it; the status board publishes it with the other two lanes.

**Acceptance checks:**
- a reembed job never delays a file job queued after it
- the lane's depth and processing state are published
- depthForRepo still counts a queued reembed for its repository

### 1.10 E20261101c2ba6fa6:S002:T010 — Extend reembed into the backfill and queue it

reembed selects with the embed step's own selection (not force), reads through the by-repository index (listUnembeddedEntities), writes vector then marker, names the active backend's model, and sets embeddingAvailable false on an outage / true on success; it is queued for every registered repository at start (after t6) and after every full index and clean-up.

**Acceptance checks:**
- after a commit whose vector write failed, the backfill at start writes the vectors, sets the markers and the repository reads complete (ac3)
- an unreachable backend sets embeddingAvailable false without failing the job
- empty-body entities are never selected

### 1.11 E20261101c2ba6fa6:S002:T011 — Measure the vector upsert against the plain add on this repository

Two-point smoke: time writeEntityEmbeddings vs addEntityEmbeddings on this repository's vector table at a refresh-sized and a backfill-sized batch, record both in the Story's test record, and set the backfill's batch size from them.

**Acceptance checks:**
- both timings at both sizes are recorded as a smoke result in the test record
- the backfill batch size is set from the measurement and stated with it

### 1.12 E20261101c2ba6fa6:S002:T012 — Ship and smoke on the installed daemon

Full sweep once, update the installed daemon, and on this repository check a refresh under load, a delete, and the backfill at start (unembedded goes to zero and the repository reads complete).

**Acceptance checks:**
- full sweep shows no failure caused by this Story
- on the installed daemon: while one indexed file of this repository is edited repeatedly, every poll of search.by_file for it returns the file's entities (recorded), a deleted file's rows are gone in one step, and unembedded reaches zero after the backfill at start with the repository reading complete

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| commitFile | `t1`, `t2`, `t3`, `t4`, `t5`, `t6` |
| reindexFile | `t3` |
| updateEmbedding | `t5` |
| IndexerService.reembed | `t7`, `t9`, `t10` |
| listUnembeddedEntities | `t7`, `t10` |
| IndexerService.indexFile | `t8` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s2 contractDetails.api[0] commitFile`
- **[[c2]]** `prior-artifact` `LLD s2 contractDetails.api[1] reindexFile (thin wrapper)`
- **[[c3]]** `prior-artifact` `LLD s2 contractDetails.api[2] IndexerService.indexFile`
- **[[c4]]** `prior-artifact` `LLD s2 contractDetails.api[3] updateEmbedding (vector before marker)`
- **[[c5]]** `prior-artifact` `LLD s2 contractDetails.api[4] IndexerService.reembed (backfill)`
- **[[c6]]** `prior-artifact` `LLD s2 contractDetails.api[5] listUnembeddedEntities`
- **[[c7]]** `prior-artifact` `LLD s2 dataModelChanges[0] FileCommit / FileCommitResult / RelationWrite (sc2)`
- **[[c8]]** `prior-artifact` `LLD s2 dataModelChanges[1] EntityRow.embeddingModel invariant (marker only after the vector)`
- **[[c9]]** `prior-artifact` `LLD s2 dataModelChanges[2] IndexStateRow.unembedded / embeddingAvailable`
- **[[c10]]** `prior-artifact` `LLD s2 dataModelChanges[3] graph-vs-vector consistency on open`
- **[[c11]]** `prior-artifact` `LLD s2 migration (steps 1-6, backwardCompat)`
- **[[c12]]** `prior-artifact` `LLD s2 errorPaths (errorCases, edgeCases, invariantsToPreserve)`
- **[[c13]]** `prior-artifact` `LLD s2 testStrategy (acceptanceMapping ac1-ac4)`
- **[[c14]]** `prior-artifact` `LLD s2 resolved question q199561da: the backfill runs in its own queue lane (user, 2026-11-01)`
- **[[c15]]** `prior-artifact` `LLD s2 resolved question q957956d1: two-point upsert-vs-add smoke on this repository (user, 2026-11-01)`
