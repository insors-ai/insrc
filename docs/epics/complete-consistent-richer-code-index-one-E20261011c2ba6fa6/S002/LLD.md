<!-- insrc:artifact LLD-c2ba6fa62a148ed1-s2 -->

# LLD: E20261101c2ba6fa6:S002

## Summary

**Epic:** `complete-consistent-richer-code-index-one`
**HLD base run:** `wf-1791697214822-7bombm`
**HLD effective hash:** `85da4a2df479...`

This Story turns the store's unused whole-file replacement (reindexFile) into commitFile, the one write for a file's rows: a file's entities, its outgoing relationships, its pending relationships and the repository's index state change together in one LMDB transaction, or not at all. The indexer parses and embeds first and commits once, so a reader always sees the file's complete old set or its complete new set; a delete and the clean-up pass's removal use the same commit. Vectors are written after the commit and an entity is marked as embedded only once its vector is stored; the unembedded count, an open-time check of the vector table, and the reembed job (now run on start and after every index) find and fill any gap, and the repository is not complete until they have.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Diagrams](#4-diagrams)
5. [Interaction with shared contracts](#5-interaction-with-shared-contracts)
6. [Error paths](#6-error-paths)
7. [Test strategy](#7-test-strategy)
8. [Migration](#8-migration)
9. [Alternatives considered](#9-alternatives-considered)
10. [References](#10-references)
11. [Open questions](#11-open-questions)

## 1. HLD context

> See **HLD-c2ba6fa62a148ed1** § 2. Framework summary

**Rollout phase:** Phase C — the file commit
**Owns:** `sc2` (FileCommit)
**Consumes:** `sc1` (IndexState)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The rule that a relationship with an absent target becomes pending instead of being skipped, at each of the six places in src/db/relations.ts where one is lost today (the resolved write's skip on a missing endpoint and its skip on a kind with no byte, promoteToResolved, promoteResolvedBatch, and the pending write's discard of a row without its file or repository and of a row whose repository is not registered), each either kept as pending or counted as unwritable with a reason; the set of files whose parse or commit failed in a full index, persisted with their paths until they next commit; which fields of the state are recounted on open and which are persisted and carried over; the classification of a pending relationship as awaiting-target, ambiguous or no-candidate, with the external-service rows classed apart and the two endpoint passes counted in when a full index is finished; the class is stored on the pending row itself, in its existing free-form record, so no stored form changes, a row the cross-file pass has not yet attempted counts as awaiting-target, and the recount on open reads the stored class and does not run resolution again; the extension of the cross-file pass to complete relationships awaiting a target by id, for imports and the other code-symbol kinds as well as calls and inheritance, and to follow a re-exporting file to the function it re-exports; the lookup of pending rows by the id they await, with its migration step, and the pass after a file event visiting the rows that await an entity of the files just committed; the change of the reindex request so that it deletes the repository's rows in the graph store and the vector store and builds them again from every file, in place of today's skip of unchanged files, with no separate repair request, returning to pending the relationships that other repositories hold into the deleted entities, and its queuing by the migration for every repository indexed before this change, which starts as not complete; the storing of the repository entity so that the manifest step's dependency relationships are written; the measurement on this repository, before and after a repair, of the awaiting-target, ambiguous, no-candidate and unwritable counts, with unwritable expected to be zero; the IndexState row, its migration step, its recount on open, and the derivation of repository status from it, as a completeness field returned beside the unchanged status by the daemon's status and stats requests and shown in the CLI's repository pane and in both editor plugins; and the analyzer's read of it: an analyzer lookup that reads relationships of a repository that is not complete says so in its result, with the counts, so that an answer over an incomplete graph is not returned as a plain fact. The choice, in this Story's design, of the function reached only through a re-exporting file that the repair is measured on, since the issue's own example (pickScope) has been removed from the source. Raising the log level of a refused relationship from debug is internal. Until Story s2 lands, s1 applies its rule inside the existing separate writes. — owns `sc1`
- `s3`: The by-file and by-repository index of entity rows, its migration step that builds it for an existing store, and its upkeep. No single entity-row write exists today: there are seven raw put and remove sites across src/db/entities.ts and src/db/graph/migrations.ts, and the existing name index is kept in step by a helper each site must remember to call. This Story introduces one put and one remove function for entity rows that maintain the name index and the new index together, routes every raw site through them, and adds a test that fails when a raw put or remove appears outside them. Upkeep therefore sits beneath every caller, so that neither today's writers nor the file commit need to know of it and this Story does not depend on s2. The two reads (findEntitiesByFile, listEntitiesForRepo) keep their results and their callers; a new existence check answers whether a repository holds any entity, and the analyzer's scope check uses it.
- `s4`: The cause, which ISSUE-0d577569 records as not known, was reproduced on 2026-10-11 and is not the system's semaphore limit, which the library's message names, but the loss of the daemon's own file lock on the store's lock file, after which another process that opens and closes the store removes the store's semaphores; the daemon's next write then fails with the library's message about the limit, and its exit hangs in the library's close. What in the daemon closes a second descriptor on the lock file is not yet identified. First, therefore, the remedy that does not depend on finding it: the live store is opened by the daemon alone, and any other process is refused it. Second, a bound on the whole shutdown including the store's close, so that a close that hangs ends in an exit. Third, recording a store failure of this kind and stating it in the daemon's status. None of this is consumed by another Story.
- `s5`: The refusal, with a named error and its own code, of a search or analyze request about a repository whose status is indexing, at the analyzer's scope check and at the daemon's search requests, carrying the status and how far the run has got (files done of files selected, and when it began), read from the indexer's running job; the tools that rest on the analyzer (the workflow steps, triage, code review) pass that error on as it is. The order of the analyzer's run: the refusal of a scope the index does not hold comes before a size is announced, or the announcement says the size could not be counted. The named cause and error code for a failed read of the last-indexed time and for a failed lookup, and the three other defects of ISSUE-e2bcadd9 (the wrong provider named, the scope resolved before the cache, and failure text matched inside echoed output). This Story does not read IndexState: it works with the checks the analyzer has today, so that it stays independent of s1.
- `s6`: The in-process matcher of the gitignore grammar over nested ignore files and its conformance test against git; the move onto the one filter of every site that reads the list today in src/indexer/index.ts (the full walk, the start-up scan for changed files, the file event, the clean-up pass, and the two places that seed the list when a repository is registered), of the watcher, and of the analyzer's reader, its two exploration walkers and its infra walker (src/analyze/runtimes/infra/_shared.ts), each of which has its own list of names today, and of the indexer's source-root detection (src/indexer/source-roots.ts), whose own list would otherwise hide a package in a directory the filter includes; a search of the source for such lists found five more, in the daemon's four file-search tools (glob, grep, list-dir, recent under src/daemon/tools/builtins/search) and in the review probe (src/workflow/review/probe.ts), which search the working tree as text, do not decide what the index holds, and are deliberately left as they are; the filter keeps answering for a directory that holds an included file, as the analyzer's reader does now; the retirement of the bare-name list and of the ignore entry in the repository's .insrc config; the two built-in exclusions (generated or minified files, the .insrc directory) applied inside the filter so that the full walk and the file event no longer differ on them; the handling of a change to an ignore file as an event that removes and adds files, and the comparison by content hash of the clone's exclude file and the global ignore file, which the watcher cannot see, whenever the filter is used; the queued step that proposes a root ignore file with the cheap-tier model when a repository is added without one, its fallback, and the rule that an existing file is never written. Two points were decided by the stakeholder: the filter honours all three of git's ignore sources (the .gitignore files, the clone's exclude file, the user's global ignore file), and a file git tracks is indexed even when a rule matches it, so the filter takes git's list of tracked files as an input and a plain folder is filtered by the rules alone. — owns `sc4`
- `s7`: The one-byte encoding of evidence as the value of a relationship row; the points in the per-file resolver and the cross-file pass that decide 'extracted' or 'inferred' ('chosen' is reserved and not written, since an ambiguous relationship stays pending with its candidates); the passing of evidence as an argument to the store's resolved write and promote operations, so that the two endpoint passes write 'inferred' and the manifest step writes 'extracted' and no relationship written after this change reads 'unknown'; the carrying of evidence through the store's traversal reads and the daemon's caller and callee requests; the marking of inferred and chosen relationships in the analyzer's lookups and answers. No migration rewrites existing rows, since an empty value reads as 'unknown'. — owns `sc3`
- `s8`: The grouping of a complete repository's code entities into subsystems, its determinism, the tables for membership, connections and summaries and their migration step; the queued pass and its trigger on a new generation; the cheap-tier summary of a subsystem whose membership changed; the daemon request that returns subsystems; the addition of subsystem context to the analyzer's context builder; the statement that groups rest on an incomplete or older graph. Which relationships count toward grouping, and with what weight by evidence, is decided here.
- `s9`: One reader per added language (Rust, C#, C, C++) in the existing parser registry with a guarded load, as the Kotlin reader has; the structured reading of SQL in place of the whole-file document, keeping the document entity for retrieval; any entity kinds this needs, appended to the fixed byte table without renumbering; the additions to the Language union; the daemon request that lists the languages read and why any was skipped. Each language can be delivered on its own.
- `s10`: The reading of links and references between documents, and from a document to code, as relationships of the existing REFERENCES kind written in the file commit with evidence 'extracted'; the queued mid-tier pass over new or changed documents and its own table of model-proposed relationships; the hand-checked set, the measurement, and the recorded figures that switch the capability on or leave it off; the merging of model-proposed relationships into reads with evidence 'model'; the status line when no CLI provider is available.
- `s11`: Private implementation of s11: The step tools run inside the daemon, and the MCP server opens no store
- `s12`: Private implementation of s12: Every supported parser records the calls its code makes, and calls resolve within a package
- `s13`: Private implementation of s13: Settling file changes does work proportional to the changed files, never a scan of the repository or the store

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `commitFile`

```typescript
function commitFile(commit: FileCommit): Promise<FileCommitResult>
```

**Parameters:**
- `commit: FileCommit` — The file's full new state (sc2): its repository, path, content hash (null when the file is removed), parsed entities and relationship writes

**Returns:** `FileCommitResult` — What the one transaction did (sc2): the repository's new generation, entities written and removed, relationships stored, kept pending, unwritable and returned to pending, and the vectors still outstanding after the post-commit vector write

**Errors:**
- `UnregisteredRepoError` when commit.repoPath is not a registered repository; nothing is written
- `Error (store write)` when the LMDB transaction fails; withWriteTxn aborts it (childTransaction) and the file's previous rows stay as they were

**Preconditions:**
- commit.repoPath passes validateRepoPathShape; an invalid path is refused and logged as reindexFile does today
- every entity of the file carries repo == commit.repoPath and file == commit.filePath, except module stubs (kind 'module', repo '') which go to the shared-modules rows
- parsing, relation resolution and embedding have finished; nothing about the file is written before commitFile

**Postconditions:**
- In ONE write transaction: the file's previous entities that are not in commit.entities are removed (with their name_index, entity_by_file, doc summary and export_names rows), every surviving or new entity row is written with its embedding marker empty unless its stored vector is unchanged, the outgoing relationships of EVERY previous entity of the file and the file's pending rows are removed and commit.relations written by the same rules as upsertRelations (stored edge / pending row awaiting the id / counted unwritable), each incoming relationship of a removed entity whose holder survives is returned to pending awaiting the removed id, the generation is advanced, IndexState.unembedded is adjusted, and the file leaves IndexState.uncommittedFiles
- contentHash null: the same transaction with no new entities or relationships, so the file's entities, relationships and pending rows are removed together (ac4)
- a reader inside another transaction sees either all of the previous rows or all of the new rows (ac2)
- after the transaction: vectors of removed entities are deleted; vectors of entities whose marker was emptied are written (plain add for an entity first allocated in this commit, upsert otherwise), and a second transaction sets each written entity's marker to the active backend's model and lowers unembedded; a vector write failure is logged and leaves those markers empty and counted (ac3)

### 2.2 `reindexFile`

```typescript
function reindexFile(_db: DbClient, repoPath: string, filePath: string, parsed: Entity[]): Promise<void>
```

**Parameters:**
- `_db: DbClient` — unused, kept for the existing call shape
- `repoPath: string` — registered repository root
- `filePath: string` — absolute path of the file
- `parsed: Entity[]` — the file's parsed entities

**Returns:** `Promise<void>` — resolves when commitFile has finished

**Errors:**
- `UnregisteredRepoError` when as commitFile

**Preconditions:**
- as commitFile

**Postconditions:**
- equivalent to commitFile({ repoPath, filePath, contentHash: <the file entity's hash or ''>, entities: parsed, relations: [] }) -- kept as a thin wrapper so its existing tests keep pinning the entity-replacement behaviour; it is the body commitFile grows from (lc1)

### 2.3 `IndexerService.indexFile`

```typescript
protected indexFile(filePath: string, repoPath: string, cleanFirst: boolean, opts?: { readonly fresh?: boolean | undefined }): Promise<boolean>
```

**Parameters:**
- `filePath: string` — the file
- `repoPath: string` — its repository
- `cleanFirst: boolean` — true for a file event: refresh even when the stored hash matches; no longer deletes first
- `opts: { fresh?: boolean }` _(optional)_ — full index: nothing stored to compare with

**Returns:** `Promise<boolean>` — true when the file was committed, false when skipped (no parser, unreadable, or unchanged)

**Errors:**
- `UnregisteredRepoError` when the repository is not registered
- `Error` when parse, embed or commit failed; the file's previous rows are unchanged and the caller records the file as uncommitted

**Preconditions:**
- the repository's FileFilter includes the file (checked by the caller)

**Postconditions:**
- read, parse, resolve and embed run first; then exactly one commitFile call; no deleteEntitiesForFile / deleteUnresolvedForFile / upsertEntities / upsertRelations calls remain on this path

### 2.4 `updateEmbedding`

```typescript
function updateEmbedding(_db: DbClient, id: string, embedding: number[], embeddingModel: string): Promise<void>
```

**Parameters:**
- `_db: DbClient` — unused
- `id: string` — entity id
- `embedding: number[]` — the vector
- `embeddingModel: string` — the active backend's model name

**Returns:** `Promise<void>` — resolves when both writes are done

**Errors:**
- `Error (vector store)` when the vector write failed; the marker stays empty and the entity stays counted as unembedded

**Preconditions:**
- embedding is non-empty

**Postconditions:**
- ORDER REVERSED from today: the vector is written first (upsert when the marker was empty and the entity was not first allocated in the same commit; the backfill always upserts), then one transaction sets the marker and lowers IndexState.unembedded

### 2.5 `IndexerService.reembed`

```typescript
private reembed(repoPath: string): Promise<void>
```

**Parameters:**
- `repoPath: string` — the repository to backfill

**Returns:** `Promise<void>` — resolves when every selected entity with an empty marker has been tried

**Errors:**
- `none thrown for an embedding outage` when an unreachable backend sets IndexState.embeddingAvailable false and returns; the next run sets it true again on success

**Preconditions:**
- queued on daemon start for every registered repository and after every full index and clean-up

**Postconditions:**
- selects entities with an empty marker using the embed step's own selection (non-empty body), not force:true, so endpoints and module stubs are never selected or counted
- writes each vector before its marker (updateEmbedding)
- markers carry the active backend's model name (embeddingModel()), not a fixed name

### 2.6 `listUnembeddedEntities`

```typescript
function listUnembeddedEntities(_db: DbClient, repo: string): Promise<Entity[]>
```

**Parameters:**
- `_db: DbClient` — unused
- `repo: string` — repository root

**Returns:** `Entity[]` — the repository's entities with an empty marker that the embed step would select

**Postconditions:**
- reads the repository's entities through Story s3's by-repository index instead of the whole entity table
- excludes entities the embed step does not select (empty body)

## 3. Data model changes

### 3.1 `FileCommit / FileCommitResult / RelationWrite (sc2)` — new

Exported types of the store layer as sketched in the HLD. RelationWrite.target is { stored: id } for a relationship the per-file resolver resolved or { pending: UnresolvedRef } for a name/path reference; it maps onto the existing Relation.resolved / meta fields that upsertResolvedRelations and upsertUnresolvedRelations already take, so no stored form changes. RelationWrite.evidence is accepted and ignored ('unknown') until Story s7 stores it.

**Call sites:**
- `src/db/entities.ts:362-519`
- `src/db/relations.ts:116-128`
- `src/indexer/index.ts:1146-1150`

### 3.2 `EntityRow.embeddingModel (the embedding marker)` — invariant-change

Invariant becomes: non-empty ONLY if the entity's vector is stored in the vector table for that model. Today embedEntities sets it before the vector write (src/indexer/embedder.ts:187, :216) and upsertEntities / reindexFile / updateEmbedding persist it before the vector exists. After: every writer stores the row with the marker empty and sets it in a second transaction after the vector write succeeds. The stored form is unchanged.

**Call sites:**
- `src/db/graph/codec.ts:164`
- `src/indexer/embedder.ts:187`
- `src/indexer/embedder.ts:216`
- `src/db/entities.ts:304-330`
- `src/db/entities.ts:962-1010`

### 3.3 `IndexStateRow.unembedded / embeddingAvailable (sc1, consumed)` — invariant-change

unembedded becomes a live count, kept in step by every commit and every marker transaction, of the repository's entities the embed step selects whose marker is empty; recounted on open by reconcileIndexStateInTxn from the entity table. embeddingAvailable is set false by the backfill when the backend cannot be reached and true when an embed succeeds. Both fields exist (src/db/graph/codec.ts:262-263); no migration step.

**Call sites:**
- `src/db/graph/codec.ts:262-263`
- `src/db/graph/index-state-rows.ts:29-117`
- `src/db/index-state.ts:33-39`

### 3.4 `Graph-vs-vector consistency on open` — new

When the store is opened, entity ids are compared with the vector table in both directions: a vector whose entity is not stored is deleted (so a later plain add for a re-allocated id cannot meet it), and an entity whose marker is set but has no vector gets its marker cleared and is counted unembedded. Run once per open on the indexing worker, before the backfill job is queued.

**Call sites:**
- `src/db/lance/entity-vec.ts:119-149`
- `src/db/lance/entity-vec.ts:373-388`
- `src/db/entities.ts:903-918`

## 4. Diagrams

- [Sequence diagram](docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S002/sequence-diagram.html)

## 5. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc2` | implements | commitFile is the FileCommit operation: one LMDB transaction per file for entities, outgoing relationships, pending rows and IndexState; contentHash null removes the file. FileCommitResult is returned as sketched. The indexer's refresh, the delete event and the clean-up pass's removeStoredFile call it; s7, s9, s10 and s13 consume it. |
| `sc1` | consumes | Inside the commit transaction: advanceGenerationInTxn, the unembedded adjustment and the removal of the file from uncommittedFiles through updateIndexStateRowInTxn; the relationship writes reuse s1's in-transaction pending/unwritable counting unchanged. The marker transaction lowers unembedded; the backfill sets embeddingAvailable. s1's derivation of complete (unembedded == 0 \|\| !embeddingAvailable) is unchanged. |

## 6. Error paths

**Error cases**

- **The refresh fails after the file is parsed: the embed step throws, the parser throws, or the relation resolver throws (ac1)** (recoverable)
  - Detection: The exception propagates out of indexFile before commitFile is called; nothing was written because the indexer no longer deletes first
  - Response: fileEvent / the full index catch it as today, log at warn, and record the file in IndexState.uncommittedFiles (the full index via setUncommittedFiles; the file event by adding the path in its own small IndexState transaction)
  - User impact: Answers keep using the file's previous entities and relationships; the repository reads as not complete with 'N files could not be indexed' until the file next commits
- **The commit transaction itself throws part-way (a store write error, an UnregisteredRepoError found inside the transaction, a lock loss)** (recoverable)
  - Detection: withWriteTxn's childTransaction rejects; lmdb-js aborts a child transaction whose callback throws (pinned by src/db/graph/__tests__/lmdb-txn-semantics.test.ts)
  - Response: No row of the transaction is kept; commitFile rethrows; no vector work runs; the caller records the file as uncommitted as above
  - User impact: The file's previous rows stay readable (ac1); the repository is reported incomplete with the file named
- **The vector write after a successful commit fails (vector store unavailable, disk full) (ac3)** (recoverable)
  - Detection: addEntityEmbeddings / writeEntityEmbeddings reject inside commitFile's post-commit step
  - Response: Logged at warn; the markers of those entities stay empty (they were written empty in the commit), so they remain counted in IndexState.unembedded; FileCommitResult.vectorsOutstanding reports them; the backfill fills them on its next run (daemon start, after an index)
  - User impact: Semantic search lacks those entities until the backfill; the repository reads 'N entities have no vector' and is not complete
- **The marker transaction after a successful vector write fails** (recoverable)
  - Detection: the second withWriteTxn rejects
  - Response: Logged; the entity keeps an empty marker and stays counted; the backfill's upsert replaces the existing vector without duplicating it
  - User impact: Same as a vector failure; no wrong data, one redundant vector write later
- **The daemon crashes between the commit and the vector write, or between the vector write and the marker transaction (ac3)** (recoverable)
  - Detection: On the next open the graph-vs-vector comparison finds entities with an empty marker (counted unembedded by the recount on open) and, for a crash after the vector write, a vector whose entity's marker is empty
  - Response: The recount sets unembedded; the backfill job queued at start upserts the vectors and sets the markers
  - User impact: The repository is not reported complete until the vectors are written
- **A removed entity's vector delete fails after the commit, leaving an orphan vector** (recoverable)
  - Detection: deleteEntityVecsByIds rejects (logged); on the next open the comparison finds a vector whose id has no entity
  - Response: The open-time comparison deletes it before any job runs, so a later plain add for the same id (re-allocated in a first commit) cannot meet a duplicate
  - User impact: A search may briefly return a hit for a removed entity until the next open; the hit resolves to no entity and is dropped by the search's entity lookup
- **The embedding backend cannot be reached during the backfill** (recoverable)
  - Detection: embedEntities returns entities with empty embeddings / the provider call throws a ModelCallFailedError
  - Response: The backfill sets IndexState.embeddingAvailable false and stops for that repository; the next successful embed sets it true
  - User impact: The repository reads complete-with-reason ('embeddings unavailable') per s1's derivation instead of blocking indexing

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A refresh whose parsed entities are identical to the stored ones (save without change but cleanFirst true) | Entity rows are left as they are by the existing short-circuit, markers stay set, no vector is written; the outgoing relationships and pending rows of the file are still replaced (same set), and the generation advances |
| An entity whose body changed but whose id is the same | Its row is rewritten with an empty marker, its vector is upserted (not added), then the marker is set |
| An entity first allocated in this commit | Plain vector add (today's cost for a first full index), then the marker |
| A file whose new parse drops an entity that other files' relationships point at | The entity is removed and each of those incoming relationships becomes a pending row awaiting the removed id, in the same transaction; the cross-file pass (s1) completes it if the entity reappears |
| A relationship from this file to an entity of another file that is not stored yet | Kept as a pending row awaiting the id (s1's rule) inside the commit |
| Module stubs in commit.entities (kind 'module', repo '') | Ensured to exist under the shared-modules rows, never removed by a file's commit, never counted as the file's entities |
| contentHash null for a file with no stored rows | A no-op transaction apart from the generation advance and removing the path from uncommittedFiles; no error |
| An entity with an empty body (an endpoint, a module stub) | Not selected by the embed step, never counted in unembedded, never queued for the backfill |
| Two file events for the same file queued back to back | Two commits in order; the second replaces the first; readers see one complete set at any time |

**Invariants to preserve**

- reindexFile's entity-replacement behaviour (ensure-exists module stubs, last-wins dedupe with a warn, the unchanged-row short-circuit, the repoPath shape guard) stays as its tests pin it [[c1]]
- s1's relationship rule: every relationship ends as a stored edge, one pending row awaiting the target id, or a counted unwritable with a reason logged at warn -- nothing is dropped silently [[c3]]
- A removed entity takes its derived rows with it (name_index, entity_by_file, doc summary, export_names, id maps) through detachDeleteEntitiesInTxn [[c4]]
- Vectors are written after the LMDB commit and a vector failure never fails the graph write [[c5]]
- IndexState completeness is derived as today: complete = graphComplete && (unembedded == 0 || !embeddingAvailable) [[c6]]
- Model calls (embedding) stay serial; the commit itself makes no model call [[c2]]

## 7. Test strategy

**Test framework:** `node:test with node:assert/strict, run by tsx (npx tsx --test); store tests use setGraphStorePath on a temp LMDB and useTemporaryLance for vectors`

**Test levels**

- **unit** — commitFile's transaction semantics on a temp store: entity replacement, outgoing-relationship replacement, pending rows, incoming relationships returned to pending, IndexState updates, removal by contentHash null, and rollback on a throw
  - Subjects: `commitFile`, `reindexFile`
  - Fixtures: `a temp LMDB store with a registered repository and two files whose entities reference each other`, `a store write that throws part-way inside the commit transaction (a test seam on the in-txn writer) to prove rollback after a reopen`
- **integration** — the post-commit vector step, the marker ordering and the backfill against a real temp Lance table: markers stay empty when the vector write fails, the backfill fills them, the open-time comparison removes orphan vectors and clears markers without vectors, the unembedded count follows
  - Subjects: `commitFile`, `updateEmbedding`, `IndexerService.reembed`, `listUnembeddedEntities`
  - Fixtures: `useTemporaryLance with a failing vector writer injected for one call`, `a stand-in embedder returning fixed vectors and one that throws a ModelCallFailedError`
- **integration** — the indexer paths on a temp repository: a file event refreshes through one commit with no delete first; a failing parse/embed leaves the previous rows; a reader during the refresh sees the complete old or new set; the delete event and the clean-up pass remove a file in one commit
  - Subjects: `IndexerService.indexFile`, `IndexerService.reembed`
  - Fixtures: `the ProbeService pattern of src/indexer/__tests__/reconcile.test.ts (temp store, temp repo, stand-in watcher)`, `an embed step held on a promise so a concurrent read runs while the refresh is in progress`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `integration: a file event whose embed step throws after the parse leaves the file's previous entities, relationships and pending rows exactly as they were, and the file is recorded as uncommitted`, `unit: a commitFile whose transaction throws after its first writes leaves every row of the file as before (read after a reopen)` |
| `ac2` | `integration: a read of the file's entities and outgoing relationships while its refresh is held in the embed step returns the complete old set, and after the commit the complete new set -- never empty or mixed` |
| `ac3` | `integration: a commit whose vector write fails leaves the changed entities' markers empty and counted in unembedded, the repository not complete; the backfill run on start writes the vectors, sets the markers and the repository reads complete`, `integration: on open, a vector with no entity is deleted and an entity whose marker is set without a vector has its marker cleared and is counted`, `unit: updateEmbedding writes the vector before the marker; a failed vector write leaves the marker empty` |
| `ac4` | `unit: commitFile with contentHash null removes the file's entities, outgoing relationships and pending rows in one transaction and returns incoming relationships of other files to pending`, `integration: the delete event and the clean-up pass's removal of a stale file go through one commit (no separate delete calls remain)` |

## 8. Migration

**State before:** The indexer refreshes a file by three separate deletes (relationships -- a no-op -- entities, pending rows) before parsing, then embeds, then upserts entities and relationships in further separate transactions (src/indexer/index.ts:1120-1150); the delete event and the clean-up pass remove a file in two or three transactions (src/indexer/index.ts:845-849, :576-581). The whole-file replacement reindexFile exists unused and writes entities only (src/db/entities.ts:362-519). The embedding marker is stored before the vector exists (src/indexer/embedder.ts:187, src/db/entities.ts:304-330, :962-1010), IndexState.unembedded is never counted, and reembed runs only when a job is queued by hand (src/indexer/index.ts:413, :1058-1086).

**State after:** commitFile (grown from reindexFile) writes a file's entities, outgoing relationships, pending rows and IndexState in one LMDB transaction; the indexer parses and embeds first and commits once; the delete event and the clean-up pass call commitFile with contentHash null. Every entity row is written with an empty marker and the marker is set in a second transaction after its vector is stored; IndexState.unembedded counts selected entities with an empty marker; the store compares entity ids with the vector table on open; the backfill (reembed) runs on daemon start and after every full index and clean-up. No stored key, value form or kind byte changes.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Split upsertResolvedRelations and upsertUnresolvedRelations into transaction-taking bodies called by the existing functions unchanged (s1's tests pin the behaviour) — ↩ rollbackable
2. Grow reindexFile into commitFile: by-file lookup through entity_by_file, outgoing-edge and pending-row replacement, incoming relationships of removed entities returned to pending, generation advance, unembedded adjustment, removal from uncommittedFiles, contentHash-null removal; keep reindexFile as a thin wrapper — ↩ rollbackable
3. Reverse the marker order in every vector writer (commitFile's post-commit step, upsertEntities, updateEmbedding): row written with an empty marker, vector written, marker set in a second transaction; embedEntities stops setting the marker on the entity it returns — ↩ rollbackable
4. Make the recount on open count unembedded from the entity table (selected entities with an empty marker) and add the open-time graph-vs-vector comparison: delete vectors whose entity is not stored; clear the marker of an entity whose vector is missing. On an existing store this repairs rows written under the old order without a re-index — ✕ non-rollbackable
5. Move IndexerService.indexFile, the delete event and removeStoredFile onto commitFile; record a file event's failed commit in uncommittedFiles; remove the delete-then-upsert sequence — ↩ rollbackable
6. Extend reembed into the backfill (embed-step selection instead of force, vector before marker, the active backend's model name, embeddingAvailable on outage) and queue it on daemon start for every registered repository and after every full index and clean-up — ↩ rollbackable

**Backward compat:** No stored form changes, so no SCHEMA_VERSION step and no re-index. upsertEntities, upsertRelations, deleteEntitiesForFile, deleteUnresolvedForFile and reindexFile keep their signatures for their other callers. Rows written under the old marker order are repaired by step 4 on the first open: a marker set without a vector is cleared and the entity is backfilled. On that first open after the update, repositories with vectors lost earlier read as not complete ('N entities have no vector') until the backfill finishes -- the intended, more accurate state.

## 9. Alternatives considered

### 9.1 a1: Grow reindexFile into commitFile (sc2) with the vector marker set after the vector write — **CHOSEN**

One store operation commitFile(FileCommit) built from reindexFile: entities, outgoing relationships, pending rows and IndexState in one LMDB transaction; vectors after it with the marker set only once they are written; reembed extended into the backfill.

reindexFile (src/db/entities.ts:362) becomes commitFile(commit: FileCommit): Promise<FileCommitResult>, the sc2 operation, kept in the store layer. In one withWriteTxn it (1) reads the file's existing entities through Story s3's entityByFile index instead of scanning the entity table, (2) upserts the parsed entities as today (module stubs ensure-exists under the shared-modules rows), writing every entity row with its embedding marker EMPTY, (3) removes the outgoing edges of every existing entity of the file (sweepOutgoingEdges) and the file's pending rows, (4) writes the new relationships through in-transaction forms of the existing resolved and pending writers (upsertResolvedRelations / upsertUnresolvedRelations split into *InTxn bodies, so s1's keep-pending / count-unwritable rule is applied unchanged), (5) detaches the entities no longer parsed, returning each incoming relationship whose holder survives to pending awaiting the removed id (returnEdgeToPendingInTxn, as the repository delete does), (6) advances the generation and adjusts IndexState.unembedded by the number of selected entities (non-empty body) whose marker is now empty, and clears the file from uncommittedFiles. contentHash null removes the file (ac4) through the same transaction. After the commit the vectors are written (plain add for an entity first allocated in this commit, upsert otherwise; deletes for removed entities), and a second small transaction sets each written entity's marker to the active backend's model and decrements unembedded. The indexer parses, resolves and embeds BEFORE the commit and no longer deletes first; the delete event and the clean-up pass's removeStoredFile call commitFile with contentHash null. The reembed job is extended into the backfill (queued on daemon start and after an index; embed-step selection, vector first then marker, upsert), and the store compares entity ids with the vector table on open in both directions, deleting orphan vectors and clearing markers of entities without a vector.

### 9.2 a2: One outer transaction around today's separate writers

Give upsertEntities, upsertRelations and the delete functions an optional transaction argument and have the indexer call them all inside one withWriteTxn; no FileCommit operation.

Each existing writer gains a `txn?` parameter; the indexer opens one write transaction per file and calls deleteEntitiesForFile, deleteUnresolvedForFile, upsertEntities and upsertRelations inside it, after parsing and embedding. Vectors are handled as each writer handles them today. The clean-up pass and the delete event do the same with the delete functions only.

**Rejected because:** Cheaper, but it fails ac3, the owned contract sc2 and lc1.

### 9.3 a3: Staged generation with a pointer flip

Write the refreshed file's rows under a new staging key space and switch a per-file pointer to it in a final transaction.

Rows for a refresh are written keyed by (file, generation); readers resolve a file's current generation through a pointer row; the commit flips the pointer and a background sweep deletes the old generation's rows.

**Rejected because:** Buys nothing LMDB isolation does not already give and breaks the HLD's no-key-change rule.

### 9.4 a4: commitFile with vectors written before the graph commit

As a1, but write the new vectors to the vector store first and commit the graph only after they succeed.

The indexer embeds, writes the vectors (upsert) and only then calls a commitFile that sets the markers in the same transaction as the rows. A vector failure aborts the refresh, leaving the old rows.

**Rejected because:** Removes the marker gap but makes the vector store disagree with the graph on failure and blocks indexing when embeddings are down, against the HLD's durability and performance notes.

## 10. References

- **[[c1]]** `analyze-bundle` `s1.analyzeBundles[0]: the existing whole-file replacement (src/db/entities.ts:362-519)`
- **[[c2]]** `analyze-bundle` `s1.analyzeBundles[1]: the indexer's refresh and delete paths (src/indexer/index.ts:1093-1156)`
- **[[c3]]** `analyze-bundle` `s1.analyzeBundles[2]: relationship and pending-row writers (src/db/relations.ts:116-180)`
- **[[c4]]** `analyze-bundle` `s1.analyzeBundles[3]: entity cascade delete (src/db/entities.ts:1255-1295)`
- **[[c5]]** `analyze-bundle` `s1.analyzeBundles[4]: vectors and the embedding marker (src/db/entities.ts:962-1010)`
- **[[c6]]** `analyze-bundle` `s1.analyzeBundles[5]: IndexState fields (src/db/graph/codec.ts:262-263)`
- **[[c7]]** `analyze-bundle` `s1.analyzeBundles[6]: queue lanes (src/daemon/queue.ts)`
- **[[c8]]** `analyze-bundle` `s1.analyzeBundles[7]: tests to extend`
- **[[c9]]** `step-output` `s3.winnerRationale`
- **[[c10]]** `code` `src/db/graph/store.ts:1272-1297` — "withWriteTxn runs the callback in store.root.childTransaction(run), which aborts on a throw"
- **[[c11]]** `prior-artifact` `HLD-c2ba6fa62a148ed1 sc2 FileCommit and s2 boundary.internal`

## 11. Open questions

- OPEN (s8 sbdry3, s2's own HLD boundary item not yet in the contract): the queue rule 'index jobs go ahead of other jobs and a long job yields between its units, so that a commit is not held behind a model pass'. Proposed: the backfill (reembed) embeds and writes in batches (the embedder's batch size) and, between batches, returns control to the index lane so queued file / full / reconcile jobs run first, then continues. Confirm or choose another rule before the plan.
- OPEN (s8 sbdry3, HLD performance note): 'Story s2's design measures [the vector upsert] on this repository'. Proposed: record, as a smoke result in the Story's test record, the time of writeEntityEmbeddings (upsert) vs addEntityEmbeddings for this repository's vector table at a refresh-sized batch and at a backfill-sized batch, before choosing the backfill's batch size.
- NOTE (s8 alt2 partial): alternatives a3 and a4 were not scored against Epic constraints k2 and k4; both lose on acceptance criteria already, so the choice of a1 does not depend on it.

## Resolved questions

- `q199561da` — OPEN (s8 sbdry3, s2's own HLD boundary item not yet in the contract): the queue rule 'index jobs go ahead of other jobs and a long job yields between its units, so that a commit is not held behind a model pass'. Proposed: the backfill (reembed) embeds and writes in batches (the embedder's batch size) and, between batches, returns control to the index lane so queued file / full / reconcile jobs run first, then continues. Confirm or choose another rule before the plan.
  - **resolved**: (c) The backfill (reembed) moves to its own queue lane, like the document-summary lane: it runs beside the index lane, so file / full / reconcile jobs are never queued behind it and need no yield points in the backfill. — User decision 2026-11-01: per-batch yielding inside the index lane (option a) complicates job sequencing; a separate lane keeps the index lane's order simple. Accepted cost: the backfill's embedding calls may run while the index lane embeds a refreshed file, i.e. some contention on the local embedding model. _(2026-11-01T13:05:16.641Z)_

## Citations

- **[[c1]]** `analyze-bundle` `s1.analyzeBundles[0]: the existing whole-file replacement (src/db/entities.ts:362-519)`
- **[[c2]]** `analyze-bundle` `s1.analyzeBundles[1]: the indexer's refresh and delete paths (src/indexer/index.ts:1093-1156)`
- **[[c3]]** `analyze-bundle` `s1.analyzeBundles[2]: relationship and pending-row writers (src/db/relations.ts:116-180)`
- **[[c4]]** `analyze-bundle` `s1.analyzeBundles[3]: entity cascade delete (src/db/entities.ts:1255-1295)`
- **[[c5]]** `analyze-bundle` `s1.analyzeBundles[4]: vectors and the embedding marker (src/db/entities.ts:962-1010)`
- **[[c6]]** `analyze-bundle` `s1.analyzeBundles[5]: IndexState fields (src/db/graph/codec.ts:262-263)`
- **[[c7]]** `analyze-bundle` `s1.analyzeBundles[6]: queue lanes (src/daemon/queue.ts)`
- **[[c8]]** `analyze-bundle` `s1.analyzeBundles[7]: tests to extend`
- **[[c9]]** `step-output` `s3.winnerRationale`
- **[[c10]]** `code` `src/db/graph/store.ts:1272-1297` — "withWriteTxn runs the callback in store.root.childTransaction(run), which aborts on a throw"
- **[[c11]]** `prior-artifact` `HLD-c2ba6fa62a148ed1 sc2 FileCommit and s2 boundary.internal`
