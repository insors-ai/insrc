<!-- insrc:artifact LLD-c2ba6fa62a148ed1-s1 -->

# LLD: E20261014c2ba6fa6:S001

## Summary

**Epic:** `complete-consistent-richer-code-index-one`
**HLD base run:** `wf-1791697214822-7bombm`
**HLD effective hash:** `8ec1c5d92f54...`

This Story stops the index from losing relationships and makes it say when it is incomplete. A relationship whose target is not stored yet is kept as a pending row that waits for the target's id and is completed by the cross-file pass once the target exists, including after another repository's reindex; a re-export line is stored as an EXPORTS edge plus an entry in an export-name index that the call matcher reads, so aliased re-exports resolve; and a reindex deletes everything the repository holds and builds it again from every file. Each repository gets a recorded state (IndexState) whose counts are written in the same transactions as the rows they count; its completeness is returned beside the unchanged status by the daemon's status requests, shown in the CLI and both editor plugins, and carried into every analyzer lookup that reads relationships.

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

**Rollout phase:** Phase B — nothing lost, nothing wrongly left out, fast reads
**Owns:** `sc1` (IndexState)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s2`: The extension of the existing whole-file replacement into the file commit (relationships and pending rows in the same transaction as entities; outgoing relationships of surviving entities replaced, not only those of entities that disappeared; incoming relationships of a removed entity returned to pending), the move of the indexer's refresh and delete paths and of the clean-up pass's removal of a stored file onto it, and the retirement of the separate delete-then-upsert sequence in the indexer. The handling of vectors after the commit: writing the entity row with its embedding marker empty and setting it in a second transaction only after the vector write succeeds, counting an entity with an empty marker in IndexState, comparing entity ids with the vector table on open in both directions, so that a vector left behind by a failed removal is deleted before a plain insert can meet it, and the extension of the existing reembed job to run on daemon start and after an index, with a vector write for an entity whose marker is empty made an upsert, except for an entity first allocated in the same commit, which keeps the plain insert. Three things in that job change with it: it applies the embed step's own selection instead of forcing every entity, so empty-body entities (external endpoints, module stubs) stay unselected and uncounted; its update of an embedding writes the vector first and sets the marker in a second transaction, where today it sets the marker first; and the marker carries the model of the backend that is active, not one fixed name. Which entities count as unembedded (those the embed step selects) and the separate recorded reason when the embedding backend is unavailable. The count of a file whose commit fails on a file event. The queue rule that index jobs go ahead of other jobs and that a long job yields between its units, so that a commit is not held behind a model pass. How a reader sees the old or the new set during a commit is the store's ordinary transaction isolation and needs no new mechanism. — owns `sc2`
- `s3`: The by-file and by-repository index of entity rows, its migration step that builds it for an existing store, and its upkeep. No single entity-row write exists today: there are seven raw put and remove sites across src/db/entities.ts and src/db/graph/migrations.ts, and the existing name index is kept in step by a helper each site must remember to call. This Story introduces one put and one remove function for entity rows that maintain the name index and the new index together, routes every raw site through them, and adds a test that fails when a raw put or remove appears outside them. Upkeep therefore sits beneath every caller, so that neither today's writers nor the file commit need to know of it and this Story does not depend on s2. The two reads (findEntitiesByFile, listEntitiesForRepo) keep their results and their callers; a new existence check answers whether a repository holds any entity, and the analyzer's scope check uses it.
- `s4`: The cause, which ISSUE-0d577569 records as not known, was reproduced on 2026-10-11 and is not the system's semaphore limit, which the library's message names, but the loss of the daemon's own file lock on the store's lock file, after which another process that opens and closes the store removes the store's semaphores; the daemon's next write then fails with the library's message about the limit, and its exit hangs in the library's close. What in the daemon closes a second descriptor on the lock file is not yet identified. First, therefore, the remedy that does not depend on finding it: the live store is opened by the daemon alone, and any other process is refused it. Second, a bound on the whole shutdown including the store's close, so that a close that hangs ends in an exit. Third, recording a store failure of this kind and stating it in the daemon's status. None of this is consumed by another Story.
- `s5`: The refusal, with a named error and its own code, of a search or analyze request about a repository whose status is indexing, at the analyzer's scope check and at the daemon's search requests, carrying the status and how far the run has got (files done of files selected, and when it began), read from the indexer's running job; the tools that rest on the analyzer (the workflow steps, triage, code review) pass that error on as it is. The order of the analyzer's run: the refusal of a scope the index does not hold comes before a size is announced, or the announcement says the size could not be counted. The named cause and error code for a failed read of the last-indexed time and for a failed lookup, and the three other defects of ISSUE-e2bcadd9 (the wrong provider named, the scope resolved before the cache, and failure text matched inside echoed output). This Story does not read IndexState: it works with the checks the analyzer has today, so that it stays independent of s1.
- `s6`: The in-process matcher of the gitignore grammar over nested ignore files and its conformance test against git; the move onto the one filter of every site that reads the list today in src/indexer/index.ts (the full walk, the start-up scan for changed files, the file event, the clean-up pass, and the two places that seed the list when a repository is registered), of the watcher, and of the analyzer's reader, its two exploration walkers and its infra walker (src/analyze/runtimes/infra/_shared.ts), each of which has its own list of names today, and of the indexer's source-root detection (src/indexer/source-roots.ts), whose own list would otherwise hide a package in a directory the filter includes; a search of the source for such lists found five more, in the daemon's four file-search tools (glob, grep, list-dir, recent under src/daemon/tools/builtins/search) and in the review probe (src/workflow/review/probe.ts), which search the working tree as text, do not decide what the index holds, and are deliberately left as they are; the filter keeps answering for a directory that holds an included file, as the analyzer's reader does now; the retirement of the bare-name list and of the ignore entry in the repository's .insrc config; the two built-in exclusions (generated or minified files, the .insrc directory) applied inside the filter so that the full walk and the file event no longer differ on them; the handling of a change to an ignore file as an event that removes and adds files, and the comparison by content hash of the clone's exclude file and the global ignore file, which the watcher cannot see, whenever the filter is used; the queued step that proposes a root ignore file with the cheap-tier model when a repository is added without one, its fallback, and the rule that an existing file is never written. Two points were decided by the stakeholder: the filter honours all three of git's ignore sources (the .gitignore files, the clone's exclude file, the user's global ignore file), and a file git tracks is indexed even when a rule matches it, so the filter takes git's list of tracked files as an input and a plain folder is filtered by the rules alone. — owns `sc4`
- `s7`: The one-byte encoding of evidence as the value of a relationship row; the points in the per-file resolver and the cross-file pass that decide 'extracted' or 'inferred' ('chosen' is reserved and not written, since an ambiguous relationship stays pending with its candidates); the passing of evidence as an argument to the store's resolved write and promote operations, so that the two endpoint passes write 'inferred' and the manifest step writes 'extracted' and no relationship written after this change reads 'unknown'; the carrying of evidence through the store's traversal reads and the daemon's caller and callee requests; the marking of inferred and chosen relationships in the analyzer's lookups and answers. No migration rewrites existing rows, since an empty value reads as 'unknown'. — owns `sc3`
- `s8`: The grouping of a complete repository's code entities into subsystems, its determinism, the tables for membership, connections and summaries and their migration step; the queued pass and its trigger on a new generation; the cheap-tier summary of a subsystem whose membership changed; the daemon request that returns subsystems; the addition of subsystem context to the analyzer's context builder; the statement that groups rest on an incomplete or older graph. Which relationships count toward grouping, and with what weight by evidence, is decided here.
- `s9`: One reader per added language (Rust, C#, C, C++) in the existing parser registry with a guarded load, as the Kotlin reader has; the structured reading of SQL in place of the whole-file document, keeping the document entity for retrieval; any entity kinds this needs, appended to the fixed byte table without renumbering; the additions to the Language union; the daemon request that lists the languages read and why any was skipped. Each language can be delivered on its own.
- `s10`: The reading of links and references between documents, and from a document to code, as relationships of the existing REFERENCES kind written in the file commit with evidence 'extracted'; the queued mid-tier pass over new or changed documents and its own table of model-proposed relationships; the hand-checked set, the measurement, and the recorded figures that switch the capability on or leave it off; the merging of model-proposed relationships into reads with evidence 'model'; the status line when no CLI provider is available.
- `s11`: Private implementation of s11: The step tools run inside the daemon, and the MCP server opens no store

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `upsertResolvedRelations`

```typescript
function upsertResolvedRelations(relations: Relation[]): Promise<void>
```

**Parameters:**
- `relations: Relation[]` — Resolved relationships to store (from, to are entity ids).

**Returns:** `Promise<void>` — Every input is either stored as an edge, kept as a pending row awaiting its target's id, or counted as unwritable with a reason; none is skipped silently.

**Preconditions:**
- Each relation has resolved: true. The indexer's resolved writes carry meta.repo: the per-file resolver, the manifest step's DEPENDS_ON, the cross-file Pass 1 import rewire (src/indexer/cross-file-resolver.ts:242-244) and the cross-file and endpoint passes' promotions.

**Postconditions:**
- A relation whose source and target are stored is written to out_edge and in_edge as today.
- A relation of a code-symbol kind whose source is stored and whose target is not is written as a pending row of the same kind with rawTo = the target id and meta {awaitsId: true, class: 'awaiting-target', reason: 'target-not-stored-yet', file: <source entity's file>, repo: <source entity's repository>}, keyed makeUnresolvedRelationId(repo, from, kind, <target id>) and indexed by the awaited id, so writing the same relationship again overwrites the one row; a boundary kind (CALLS_HTTP, PUBLISHES_TO, SUBSCRIBES_TO, CALLS_RPC) is kept the same way with class 'external-endpoint', left to the endpoint pass that owns it.
- meta.file of a kept-awaiting row is the ABSOLUTE path, the form the parser writes and unresolved_by_file is keyed by: the relation's own meta.file when present, otherwise rebuilt from the source entity row as toAbsolutePath(row.filePath, rootPath) (src/db/entities.ts:1209); a source with no file (the repository entity, whose DEPENDS_ON writes carry none) uses the repository root path, so only deleteUnresolvedForRepo removes it.
- A relation whose source is not stored, or whose kind has no byte, is counted as unwritable with the reason ('source-missing' or 'unknown-kind') against the repository named by its meta.repo, or, when it names none, in the daemon-wide unattributed counter; it is logged at warn (raised from debug).
- Every count change (pending by class, unwritable) is written to the repository's index_state row in the same write transaction as the rows it counts.

### 2.2 `upsertUnresolvedRelations`

```typescript
function upsertUnresolvedRelations(relations: Relation[]): Promise<void>
```

**Parameters:**
- `relations: Relation[]` — Pending relationships from the parser and per-file resolver.

**Returns:** `Promise<void>` — Each row is stored or counted as unwritable with a reason.

**Postconditions:**
- A row without meta.file or meta.repo, or whose repository is not registered, is counted as unwritable ('pending-without-file' / 'repository-not-registered') in the index_state row of the repository it names (or the daemon-wide unattributed counter when it names none) in the same transaction, and logged at warn, instead of dropped at debug.
- A stored row whose meta.awaitsId is true is also written to the unresolved_by_target index under its rawTo.
- Every stored row is counted under its meta.class in the same transaction; a code-symbol row stored without a class counts as 'awaiting-target' until the cross-file pass attempts it, and a boundary-kind row counts as 'external-endpoint'.

### 2.3 `promoteToResolved`

```typescript
function promoteToResolved(_db: DbClient, unresolved: UnresolvedRelation, targetEntityId: string): Promise<void>
```

**Parameters:**
- `unresolved: UnresolvedRelation` — The pending row to complete.
- `targetEntityId: string` — The entity id it resolved to.

**Returns:** `Promise<void>` — The edge is written and the pending row removed, or the row is kept.

**Postconditions:**
- When both endpoints are stored and the kind has a byte, the edge is written and the pending row removed, as today; the counts move in the same transaction.
- When the target is not stored, the pending row is KEPT as one row awaiting targetEntityId: in the same transaction the old row (keyed by its raw name) and its by-file entry are deleted and a row keyed makeUnresolvedRelationId(repo, from, kind, targetEntityId) is written with rawTo = targetEntityId, awaitsId true and class 'awaiting-target' (code-symbol kind) or 'external-endpoint' (boundary kind), with its by-file and by-target entries; the counts move from the old class to the new in the same transaction, so nothing is counted twice.
- The re-keyed row keeps the old row's absolute meta.file, so file-scoped deletes and reads still find it.
- When the source is not stored the row is stale: it is removed and counted as unwritable ('source-missing') with a warn log; a kind with no byte is counted 'unknown-kind' and the row kept.

### 2.4 `promoteResolvedBatch`

```typescript
function promoteResolvedBatch(_db: DbClient, items: ReadonlyArray<{ unresolved: UnresolvedRelation; targetEntityId: string }>): Promise<{ promoted: number; keptAwaiting: number; unwritable: number }>
```

**Parameters:**
- `items: ReadonlyArray<{ unresolved: UnresolvedRelation; targetEntityId: string }>` — Pending rows and the targets they resolved to.

**Returns:** `Promise<{ promoted: number; keptAwaiting: number; unwritable: number }>` — How many rows became edges, stayed pending awaiting their target, or were counted unwritable.

**Postconditions:**
- Same per-row rule as promoteToResolved, in one write transaction that also writes the counts of every repository whose rows it changed; the generation of each such repository is advanced once when promoted > 0.
- Its three callers are the cross-file pass (src/indexer/cross-file-resolver.ts:335) and the two endpoint passes (src/indexer/external-endpoints.ts:142, src/indexer/messaging-endpoints.ts:141); all await it and ignore the value today, so the return type change is compatible. A boundary row the endpoint passes cannot complete stays pending as 'external-endpoint' and does not count against graphComplete.

### 2.5 `listUnresolvedRelations`

```typescript
function listUnresolvedRelations(_db: DbClient, repo: string, scopeFile?: string, opts?: { awaiting?: readonly string[] }): Promise<UnresolvedRelation[]>
```

**Parameters:**
- `repo: string` — Repository path.
- `scopeFile: string` _(optional)_ — Restrict to rows whose source is this file (unchanged).
- `opts.awaiting: readonly string[]` _(optional)_ — Return the rows awaiting one of these entity ids, read through unresolved_by_target, from EVERY repository (repo then names the repository whose entities are awaited and is used only to check that it is registered).

**Returns:** `Promise<UnresolvedRelation[]>` — The matching pending rows.

**Postconditions:**
- With opts.awaiting the read costs in proportion to the matching rows, not to the pending table, and includes rows held by other repositories.
- Without opts the behaviour is as today (rows of repo only, optionally of one file).

### 2.6 `updateUnresolvedMetaBatch`

```typescript
function updateUnresolvedMetaBatch(_db: DbClient, items: ReadonlyArray<{ id: string; meta: Record<string, unknown> }>): Promise<void>  // src/db/relations.ts; also updateUnresolvedMeta(_db, id, meta) for one row; signatures unchanged
```

**Parameters:**
- `items: ReadonlyArray<{ id: string; meta: Record<string, unknown> }>` — Rows to reclass and the meta to apply.

**Returns:** `Promise<void>` — As today.

**Postconditions:**
- The given meta is MERGED into the row's stored meta (today it replaces it), so awaitsId, file, repo, specifier and exportedAs survive a reclass; a class it sets moves the counts from the row's old class to the new one in the same write transaction. updateUnresolvedMeta follows the same rule for one row. A class other than 'ambiguous' clears meta.candidates unless the update gives new ones. Its one caller today is Pass 2 (src/indexer/cross-file-resolver.ts:343), which already passes { ...row.meta, candidates }.

### 2.7 `deleteUnresolvedForFile`

```typescript
function deleteUnresolvedForFile(_db: DbClient, file: string): Promise<void>  // src/db/relations.ts:312; with deleteUnresolvedForRepoFile (:344) and deleteUnresolvedForRepo (:365); signatures unchanged
```

**Parameters:**
- `file: string` — The file whose pending rows are removed.

**Returns:** `Promise<void>` — As today.

**Postconditions:**
- Every pending-row delete goes through deleteUnresolvedRowInTxn, which removes the row, its unresolved_by_file and unresolved_by_target entries and decrements its class count in the owning repository's index_state row in the same transaction. This covers all callers: deleteUnresolvedForFile (src/indexer/index.ts:787, :1043; src/db/entities.ts:539), deleteUnresolvedForRepoFile (index.ts:559) and deleteUnresolvedForRepo (src/daemon/index.ts:572; src/db/repos.ts:193).

### 2.8 `resolveRelations`

```typescript
function resolveRelations(relations: Relation[], filePath: string, repo: string, entities?: Entity[]): Relation[]  // src/indexer/resolver.ts:63-68; signature unchanged
```

**Parameters:**
- `relations: Relation[]` — The parser's relations for one file.

**Returns:** `Relation[]` — As today, with classes and repositories stated.

**Postconditions:**
- A relative IMPORTS whose specifier resolves to no file (resolveImportPath returns nothing) stays unresolved with meta.class 'no-candidate' and meta.reason 'target-file-missing' instead of no class, so it does not count as awaiting a target; one that resolves to a file stays resolved to the file id as today and, if that file is not stored, is kept awaiting it by upsertResolvedRelations.
- Every resolved relation it returns carries meta.repo.
- A relative import of a file that EXISTS resolves to the file id as today, whether or not the file is indexed (resolveImportPath, resolver.ts:145-151); its classification when the file is never stored is made by the cross-file pass (below), not here, because only the full index knows which files it stores.

### 2.9 `runCrossFileResolver`

```typescript
function runCrossFileResolver(opts: CrossFileResolveOpts): Promise<CrossFileResolveResult>
```

**Parameters:**
- `opts: CrossFileResolveOpts` — As today (db, repoRoot, sourceRoots, scopeFile?), plus mode: 'full' | 'settle' | 'repository' (explicit; default 'repository') and committedFiles?: readonly string[] (required in 'settle' mode: the files committed since the last settle).

**Returns:** `Promise<CrossFileResolveResult>` — As today, plus completedById (rows promoted because their awaited target now exists) and pendingByClass (the repository's counts after the pass).

**Errors:**
- `Error` when A store failure, propagated as today (it fails a full index).

**Postconditions:**
- Pass 0 (new): promotes code-symbol rows whose awaited target is now stored, read through unresolved_by_target: in 'settle' mode, the rows awaiting an entity of committedFiles; in 'full' mode, the rows awaiting ANY entity of the repository, whichever repository holds them (a guard: no indexed kind crosses workspace repositories today, Pass 2 being single-repository, so this restores only an edge written by hand or by a future cross-repository kind); in 'repository' mode, the repository's own awaiting rows. Counts move in each owning repository's index_state row.
- Classification of a row awaiting a FILE entity id whose file is not stored, in 'full' mode after the walk and in 'settle' mode for the rows the committed files wrote, by the full index's own file-selection rule (index.ts:630-640: the repository's ignore list, a parser for the extension, not generated or minified) plus the artifact parser's skip rules (SKIP_BASENAMES and MAX_SIZE, artifact.ts:89, :117-118), extracted so the full index and the cross-file pass apply one rule: (1) the file does not pass the rule as code (no parser for its extension, generated or minified, a SKIP_BASENAMES lock file, over MAX_SIZE): class 'no-candidate', meta.reason 'target-not-code', not counted against graphComplete; (2) a parser handles it but the ignore rule excludes it: stays 'awaiting-target' with meta.reason 'target-excluded-by-ignore', counted against graphComplete and named in the reasons; (3) it passes the rule but is not stored (its parse or write failed): stays 'awaiting-target' with meta.reason 'target-not-committed', and the file is in uncommittedFiles. Story s6 replaces the ignore-list part of the rule with its filter; this Story only extracts and reuses the rule the full index applies today.
- Pass 1 rewires module-stub imports as today.
- Pass 1's import rewire writes carry meta.repo = repoRoot and meta.file = the importing file's absolute path (today they carry no meta, src/indexer/cross-file-resolver.ts:242-244), so a rewire kept awaiting is found by the file's deletes.
- Pass 1b (new): pending EXPORTS rows are resolved to the named exported entity of the file their specifier resolves to (or that file entity for rawTo '*'), promoted to EXPORTS edges with today's empty value, and in the same transaction an export_names entry (re-exporting file id, exported name) -> target id is written ('*' rows under the name '*').
- Pass 2 attempts every code-symbol kind it can resolve by name (CALLS, INHERITS, IMPLEMENTS, REFERENCES) and leaves boundary kinds to the endpoint passes; resolveCall widens a caller's candidates by looking up the call's raw name in export_names of each imported file and following '*' entries to their source files, transitively with a visited set, so an aliased re-export resolves by its exported name. An export_names entry whose target id is not stored is ignored.
- Every row Pass 2 attempts has meta.class written in EVERY mode ('full', 'settle', 'repository'): 'ambiguous' (with candidates) when several match, and 'no-candidate' (reason 'no-match') when its intent is UNRESOLVED, which is the common case of a call to a builtin or a library function; only rows awaiting an id stay 'awaiting-target'. So an edit that adds an unresolvable call leaves a complete repository complete. In 'full' mode, after Pass 2, every code-symbol row with no class and no awaitsId that Pass 2 does not attempt (any unresolved IMPORTS) is written 'no-candidate' as well. Counts and generation are written in the same transactions as the promotions and reclassifications.

### 2.10 `fullIndex`

```typescript
private fullIndex(repoPath: string): Promise<void>
```

**Parameters:**
- `repoPath: string` — The repository to index from scratch.

**Returns:** `Promise<void>` — The repository's rows in both stores are rebuilt from every file.

**Errors:**
- `Error` when A cross-file pass or store failure, as today: status 'error', lastRun 'failed'.

**Preconditions:**
- The repository is registered.

**Postconditions:**
- Before the walk: every relationship another repository holds into this repository's entities is written back as a pending row of the holding repository awaiting the entity's id (a guard: the indexer writes no such edge today); then deleteEntitiesForRepo and deleteUnresolvedForRepo remove the repository's rows in the graph store and the vector store, with its export_names entries; IndexState is reset (generation kept and advanced, counts zeroed, fullIndexFinished false). The cross-file pass runs with mode 'full'.
- The delete also removes, as deleteEntitiesForRepo does today, the repository's document summaries and its cached exploration outputs: the cache describes the old graph and must go; the summaries are regenerated from current content by the doc-summarise-repo job the full index queues at its end, with model calls (the summary tier). No other stored data of the repository survives a reindex.
- The selection loop's rule is extracted into one predicate that the cross-file pass also calls, so a file is 'outside the graph by design', 'excluded by the ignore rule' or 'selected' by the same test in both places.
- Every selected file is parsed and written (indexFile with cleanFirst semantics: no unchanged-hash skip).
- A selected file that is not stored is added to IndexState.uncommittedFiles with its path, whether its parse or write throws or indexFile returns false without throwing (its read failed: the file vanished or is unreadable; a full index makes no unchanged-hash skip, and a selected file always has a parser, so a false return always means not stored); a file that writes is removed from it.
- The manifest step's DEPENDS_ON writes carry meta.repo, so a refused one is counted against this repository.
- The repository entity (kind 'repo') is stored before the manifest step, so its DEPENDS_ON edges are written.
- After the cross-file pass and both endpoint passes, fullIndexFinished is set true and endpointPassFailed records whether either endpoint pass threw.

### 2.11 `runSettlePass`

```typescript
private runSettlePass(repoPath: string): Promise<void>  // src/indexer/index.ts:856; signature unchanged
```

**Parameters:**
- `repoPath: string` — The repository whose settled files are resolved.

**Returns:** `Promise<void>` — As today.

**Postconditions:**
- It calls runCrossFileResolver with mode 'settle' and committedFiles = the settled scope, so rows awaiting an entity of a file created or changed by a file event are promoted at the settle, not at the next full index; the per-file Pass 2 calls with scopeFile stay as today.

### 2.12 `resolveAfterReconcile`

```typescript
protected resolveAfterReconcile(repoPath: string): Promise<void>  // src/indexer/index.ts:568; signature unchanged
```

**Parameters:**
- `repoPath: string` — The repository cleaned up.

**Returns:** `Promise<void>` — As today.

**Postconditions:**
- It calls runCrossFileResolver with mode 'repository': the repository's own awaiting rows and Pass 2 as today, without the full-index 'no-candidate' sweep, the cross-repository lookup or any change to fullIndexFinished.

### 2.13 `deleteEntitiesForRepo`

```typescript
function deleteEntitiesForRepo(_db: DbClient, repo: string, opts?: { returnIncomingToPending?: boolean }): Promise<{ returnedToPending: number }>  // src/db/entities.ts:560-583; the option is added here, before its call to detachDeleteEntities (whose transaction body detachDeleteEntitiesInTxn, :1099-1131, sweeps incoming edges)
```

**Parameters:**
- `repo: string` — Repository path.
- `opts.returnIncomingToPending: boolean` _(optional)_ — When true, relationships held by entities of OTHER repositories into this repository's entities are written back as pending rows awaiting the entity id before the delete. No indexed relationship kind crosses workspace repositories today, so this guards hand-written or future cross-repository edges.

**Returns:** `Promise<{ returnedToPending: number }>` — How many relationships from other repositories were returned to pending.

**Postconditions:**
- Without the option the delete behaves as today (the repository's removal path); the repository's export_names entries go with its entities, removed by detachDeleteEntitiesInTxn for each deleted u64.

### 2.14 `indexManifest`

```typescript
private indexManifest(repoPath: string): Promise<void>  // src/indexer/index.ts; signature unchanged
```

**Parameters:**
- `repoPath: string` — The repository whose manifests are read.

**Returns:** `Promise<void>` — As today.

**Preconditions:**
- The repository entity is stored (fullIndex stores it first).

**Postconditions:**
- Each DEPENDS_ON is written with meta.repo = repoPath and meta.file = repoPath (the repository entity has no file), so it is stored, kept pending (removed only by deleteUnresolvedForRepo), or counted against this repository; none is skipped silently.

### 2.15 `IndexState`

```typescript
interface IndexState { repoPath: string; generation: number; pending: Record<PendingClass, number>; unwritable: number; reasonCounts: { unwritable: Record<string, number>; awaiting: Record<string, number> }; unembedded: number; embeddingAvailable: boolean; uncommittedFiles: string[]; fullIndexFinished: boolean; endpointPassFailed: boolean; graphComplete: boolean; complete: boolean } // read via readIndexState(repoPath): Promise<IndexState | undefined>; written only inside the store's write transactions
```

**Parameters:**
- `repoPath: string` — Repository whose state is read.

**Returns:** `IndexState | undefined` — The recorded state; undefined for a repository registered but never indexed since this change.

**Postconditions:**
- Every field, the pending counts included, is persisted in the index_state row and written in the same write transaction as the rows it counts, so an aborted transaction changes neither. On store open the pending counts are recounted from each row's stored meta.class (no resolution re-run); a difference from the stored counts is corrected in the row and logged at warn. The recount on open visits only repoIds that are registered; an index_state row of an unregistered repoId is deleted and logged.
- graphComplete = fullIndexFinished && !endpointPassFailed && uncommittedFiles.length == 0 && pending['awaiting-target'] == 0 && unwritable == 0; complete = graphComplete && (unembedded == 0 || !embeddingAvailable). unembedded stays 0 in this Story; Story s2 counts it. A relationship refused with no repository is counted in the daemon-wide unattributed counter returned by daemon.status, not in any repository's state.
- reasonCounts.awaiting counts awaiting-target rows by meta.reason ('target-not-stored-yet', 'target-excluded-by-ignore', 'target-not-committed'); reasonCounts.unwritable counts unwritables by reason. Both are written in the same transactions as the rows they count.

### 2.16 `RepoCompleteness`

```typescript
interface RepoCompleteness { complete: boolean; reasons: string[]; counts: Pick<IndexState, 'pending' | 'unwritable' | 'unembedded'> & { uncommittedFiles: number }; uncommittedFiles: string[]; generation: number } // completenessOf(state: IndexState | undefined): RepoCompleteness
```

**Parameters:**
- `state: IndexState | undefined` — The repository's state; undefined reads as not complete with reason 'not indexed since the index-state change: a reindex is needed'.

**Returns:** `RepoCompleteness` — The completeness field returned beside the status.

**Postconditions:**
- reasons has one plain line per non-zero cause, each with its count, and awaiting rows are split by reason (e.g. '12 relationships await a target that is not stored yet', '38 relationships point at files an ignore rule excludes', '3 files could not be indexed', 'the full index has not finished'); 'no-candidate' rows (including imports of files that are not code) are not a cause.

### 2.17 `repo.stats`

```typescript
'repo.stats': (params: { repoPath?: string }) => Promise<RepoStats | RepoStats[] | { error: string }>
```

**Parameters:**
- `repoPath: string` _(optional)_ — One repository; omitted for all.

**Returns:** `RepoStats (with completeness: RepoCompleteness)` — As today plus the completeness field.

**Postconditions:**
- status keeps its four values; completeness is added beside it. repo.list (RegisteredRepo[]) and daemon.status (DaemonStatus.repos) carry the same completeness field.

### 2.18 `graphCompleteness`

```typescript
function graphCompleteness(args: { returned: number; found?: number | null | undefined; limited?: readonly ReachedLimit[] | undefined; skipped?: readonly SkippedItem[] | undefined; partlyRead?: readonly PartlyReadItem[] | undefined; rule?: string | undefined; repoCompleteness?: RepoCompleteness | undefined }): Completeness
```

**Parameters:**
- `args.repoCompleteness: RepoCompleteness` _(optional)_ — The repository's completeness, passed by a lookup that reads relationships.

**Returns:** `Completeness` — As today; when repoCompleteness is given and not complete, complete is false (notEstablished) and the basis note states the repository's reasons with their counts.

**Postconditions:**
- usage.example, import.graph, class.hierarchy, data-model.trace and convention.detect pass the repoCompleteness that the executor puts on ExplorationRunnerContext for ctx.repoPath (src/analyze/explore/usage-example.ts, import-graph.ts, class-hierarchy.ts, data-model-trace.ts, convention-detect.ts).
- Only repoCompleteness is added; returned, found, limited, skipped, partlyRead and rule keep their meaning for its 19 existing call sites in 14 files.

### 2.19 `removeRepo`

```typescript
function removeRepo(_db: DbClient, path: string): Promise<void>  // src/db/repos.ts:177; signature unchanged
```

**Parameters:**
- `path: string` — The repository leaving the registry.

**Returns:** `Promise<void>` — As today.

**Preconditions:**
- repo.remove has already deleted the repository's entities (with export_names) and pending rows (with unresolved_by_target).

**Postconditions:**
- The repository's index_state row is deleted in the same transaction as its registry row, so a removed repository leaves no state behind.

## 3. Data model changes

### 3.1 `UnresolvedRow` — field-modify

No stored shape change: meta (free-form record) gains awaitsId (true when rawTo is an entity id the row awaits), class ('awaiting-target' | 'ambiguous' | 'no-candidate'; absent reads as awaiting-target, boundary kinds read as external-endpoint) and, for EXPORTS rows, specifier and exportedAs. rawTo holds an entity id when awaitsId is true. The per-file resolver writes class 'no-candidate' on a relative IMPORTS that resolves to no file. A row awaiting an id is keyed makeUnresolvedRelationId(repo, from, kind, awaitedId); a row moved from a raw name to awaiting an id is re-keyed (old row deleted, new written) in one transaction. A reclass through updateUnresolvedMeta / updateUnresolvedMetaBatch merges meta instead of replacing it. meta.file of a kept-awaiting row is the ABSOLUTE path, the form the parser writes and unresolved_by_file is keyed by: the relation's own meta.file when present, otherwise rebuilt from the source entity row as toAbsolutePath(row.filePath, rootPath) (src/db/entities.ts:1209); a source with no file (the repository entity, whose DEPENDS_ON writes carry none) uses the repository root path, so only deleteUnresolvedForRepo removes it.

```
meta: { ...today, awaitsId?: boolean, class?: 'awaiting-target'|'ambiguous'|'no-candidate', specifier?: string, exportedAs?: string }
```

**Call sites:**
- `src/db/relations.ts`
- `src/db/graph/codec.ts`
- `src/indexer/cross-file-resolver.ts`

### 3.2 `unresolved_by_target (sub-DB)` — new

dupsort index: awaited entity id (utf8) -> pending row id. Written by upsertUnresolvedRelations and by the keep-awaiting branch of the promote operations; removed with the row by deleteUnresolvedRowInTxn. Opened in getGraphStore beside unresolved_by_file.

```
+ unresolved_by_target: utf8(awaitedId) -> dupsort utf8(unresolvedId)
```

**Call sites:**
- `src/db/graph/store.ts`
- `src/db/relations.ts`

### 3.3 `export_names (sub-DB)` — new

Keyed (re-exporting file entity u64, exported name) -> target entity id; '*' rows keyed under the name '*' -> the source file entity id (dupsort for several star re-exports). Written by the cross-file pass in the same transaction as the EXPORTS edge. Upkeep sits in detachDeleteEntitiesInTxn (src/db/entities.ts:1099-1135), through which every entity delete passes (the whole-file replacement at :485, detachDeleteEntities at :1087, and so deleteEntitiesForFile, indexFile's cleanFirst delete, the file-event delete, removeStoredFile and deleteEntitiesForRepo): for each deleted u64 it removes every export_names entry keyed by that u64, in the same transaction, before the u64 mapping is removed. An entry whose target entity is deleted is left until its barrel is rewritten; resolveCall ignores an entry whose target id is not stored. Story s3 routes entity removes through one remove function; that function consumes this cleanup unchanged (this Story does not design it). Keeps an alias (`export { f as g }`) without using the edge value, which Story s7 owns.

```
+ export_names: (u64 fileId, utf8 exportedName) -> dupsort utf8(targetId)
```

**Call sites:**
- `src/db/graph/store.ts`
- `src/db/relations.ts`
- `src/indexer/cross-file-resolver.ts`
- `src/db/entities.ts`

### 3.4 `index_state (sub-DB) / IndexStateRow` — new

One row per workspace repository keyed by repoId: {generation, pending (counts by class), unwritable, reasonCounts, uncommittedFiles, fullIndexFinished, endpointPassFailed, embeddingAvailable, unembedded}. Every field is written in the same write transaction as the rows it counts; the pending counts are recounted on open as a check and corrected if they differ. Deleted by removeRepo with the registry row.

```
+ index_state: u32 repoId -> msgpack(IndexStateRow incl. pending: Record<PendingClass, number>)
```

**Call sites:**
- `src/db/graph/store.ts`
- `src/db/graph/codec.ts`
- `src/indexer/index.ts`
- `src/indexer/cross-file-resolver.ts`
- `src/db/relations.ts`
- `src/db/repos.ts`

### 3.5 `SCHEMA_VERSION / MIGRATIONS` — invariant-change

SCHEMA_VERSION 4 -> 5 with MIGRATION_V4_TO_V5: open unresolved_by_target, export_names and index_state; write an IndexStateRow with fullIndexFinished false and pending counts recounted from the existing rows for every workspace repository, so each reads as not complete ('a reindex is needed') until the daemon queues and finishes its full index. No existing key or kind byte changes.

**Call sites:**
- `src/db/graph/store.ts`
- `src/db/graph/migrations.ts`

### 3.6 `RegisteredRepo / RepoStats / DaemonStatus.repos` — field-add

completeness?: RepoCompleteness beside the unchanged status. Shown in src/cli/panes/ReposPane.tsx RepoRow, in the JetBrains RepoStatusDialog (RepoStatsDto gains the field), and in a new repository list on the VS Code Daemon tab. DaemonStatus also gains unattributedUnwritable: number, the relationships refused with no repository to count them against. VS Code: RepoRef (vscode-plugin/src/panels/types.ts:84-87) gains completeness; daemon-gateway.ts's registeredRepos (:73-78) carries it from repo.list; the Daemon tab's renderer (detail-renderers.ts) lists the repositories with status and completeness, dispatched by webview-host.ts as today.

**Call sites:**
- `src/shared/types.ts`
- `src/daemon/index.ts`
- `src/daemon/repo-stats.ts`
- `src/daemon/status.ts`
- `src/cli/panes/ReposPane.tsx`
- `vscode-plugin/src/panels/daemon-gateway.ts`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/actions/RepoStatusDialog.kt`
- `vscode-plugin/src/panels/types.ts`
- `vscode-plugin/src/panels/detail-renderers.ts`
- `vscode-plugin/src/panels/webview-host.ts`

### 3.7 `EXPORTS edge` — invariant-change

The existing, unused EXPORTS kind (byte 7) is now written: from a re-exporting file entity to each entity it re-exports by name, or to the source file entity for `export * from`. The TypeScript parser's export_statement branch emits pending EXPORTS rows for re-export lines; the cross-file pass resolves them.

**Call sites:**
- `src/indexer/parser/typescript.ts`
- `src/indexer/cross-file-resolver.ts`
- `src/db/graph/keys.ts`

### 3.8 `repository entity (kind 'repo')` — invariant-change

Stored by the full index with id makeEntityId(repoPath, '', 'repo', repoPath), so the manifest step's DEPENDS_ON edges are written instead of skipped. Its DEPENDS_ON writes carry meta.repo.

**Call sites:**
- `src/indexer/index.ts`

### 3.9 `ExplorationRunnerContext` — field-add

repoCompleteness?: RepoCompleteness, filled by the executor from IndexState for ctx.repoPath at all three places it builds the context (src/analyze/explore/executor.ts around :216, :522 and :584), and passed to graphCompleteness by the five lookups that read relationships (usage-example.ts, import-graph.ts, class-hierarchy.ts, data-model-trace.ts, convention-detect.ts).

**Call sites:**
- `src/analyze/explore/types.ts`
- `src/analyze/explore/executor.ts`
- `src/analyze/explore/usage-example.ts`
- `src/analyze/explore/import-graph.ts`
- `src/analyze/explore/class-hierarchy.ts`
- `src/analyze/explore/data-model-trace.ts`
- `src/analyze/explore/convention-detect.ts`
- `src/analyze/explore/completeness-facts.ts`

## 4. Diagrams

- [ER model](docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S001/er-model.html)

## 5. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | implements | This Story owns IndexState: the index_state row and its migration step, the pending counts written in the same transactions as the rows they count and recounted on open as a check, the daemon-wide unattributed counter for a relationship refused with no repository, completenessOf deriving RepoCompleteness, and every write that keeps it current (the relationship writes and promotions, the per-file resolver's classes, the cross-file pass, the full index). DerivedStamp is defined for Stories s8 and s10 but written by none here. Until s2 replaces the separate writes with the file commit, the state is advanced inside today's separate transactions; unembedded is defined and stays 0 until s2 counts it. |

## 6. Error paths

**Error cases**

- **A resolved relationship's source entity is not stored when upsertResolvedRelations or a promote operation writes it (the source file failed to parse, or was removed between parse and write).** (recoverable)
  - Detection: The id-to-u64 lookup for `from` returns undefined inside the write transaction (today's skip at src/db/relations.ts:135-138 and the promote skips at :397-403 and :433-437).
  - Response: The relationship is not written and no pending row is kept (a row with no stored source has nothing to hang on). It is counted as unwritable with reason 'source-missing' against the repository named by its meta.repo (every resolved write of the indexer carries one), or in the daemon-wide unattributed counter when it names none, in the same write transaction; a warn log names the kind, the source id and the file. A pending row being promoted whose source is gone is deleted as stale and counted the same way.
  - User impact: The repository reads not complete ('N relationships could not be stored') until a reindex rebuilds it, or daemon.status shows the unattributed count; the relationship is never silently lost.
- **A relationship of a kind with no entry in RELATION_KIND_BYTE reaches a write (a parser emitting a kind added to the type but not to keys.ts).** (recoverable)
  - Detection: RELATION_KIND_BYTE[kind] is undefined at the encode step (src/db/relations.ts:139-143).
  - Response: Counted as unwritable with reason 'unknown-kind' and logged at warn; a pending row with such a kind is kept rather than deleted so that a later build with the byte can promote it.
  - User impact: Repository reads not complete with the count; a developer sees the warn line naming the kind.
- **A pending relationship arrives without meta.file or meta.repo, or names a repository that is not registered.** (recoverable)
  - Detection: upsertUnresolvedRelations finds meta.file/meta.repo missing, or the registry lookup for meta.repo returns no repoId (today's debug drops at src/db/relations.ts:223-229 and :253-263).
  - Response: Counted as unwritable ('pending-without-file' or 'repository-not-registered') in the IndexState of the repository it names, or in a daemon-wide counter when it names none, and logged at warn instead of debug.
  - User impact: The owning repository reads not complete; the daemon-wide counter appears in the daemon log and daemon.status.
- **A file's parse or write throws during a full index.** (recoverable)
  - Detection: The per-file try/catch in the full-index loop catches the error.
  - Response: The file's path is added to IndexState.uncommittedFiles (and removed when a later write of it succeeds); the full index continues with the next file as today.
  - User impact: Completeness lists '1 file could not be indexed' with the path; analyzer lookups that read relationships say completeness is not established.
- **A selected file cannot be read during a full index (it vanished between listing and read, or is unreadable).** (recoverable)
  - Detection: indexFile returns false from its read catch (src/indexer/index.ts:1027-1029); the full-index loop sees the false return (today it only counts it as skipped, :655-656).
  - Response: The path is added to IndexState.uncommittedFiles like a file whose parse throws; rows awaiting its file id stay 'awaiting-target' with reason 'target-not-committed'.
  - User impact: Completeness lists the file as not indexed; a reindex or the file's next event retries it.
- **The external-endpoint or messaging-endpoint pass throws at the end of a full index.** (recoverable)
  - Detection: The existing try/catch around each endpoint pass in fullIndex.
  - Response: IndexState.endpointPassFailed is set true and fullIndexFinished set true; the repository's status follows today's rule. graphComplete is therefore false.
  - User impact: The repository reads not complete with reason 'the endpoint pass failed'; a reindex retries it.
- **The cross-file pass fails part-way (store error in a promotion transaction).** (recoverable)
  - Detection: The error propagates out of runCrossFileResolver into fullIndex, as today.
  - Response: Status 'error' and lastRun 'failed' as today; fullIndexFinished stays false because it is written only after the pass and both endpoint passes end. Promotions already committed keep their IndexState updates, since each was written in its own transaction with its count.
  - User impact: The repository reads under index ('error') and not complete; the analyzer refuses it with 'repo-indexing' (not retryable) as s5 defined.
- **A write transaction that changes pending rows or counts unwritables aborts (store error, or the daemon stops mid-transaction).** (recoverable)
  - Detection: withWriteTxn rejects, or on the next open the recount from the stored classes is compared with the index_state row's pending counts.
  - Response: The rows and the counts were written in the same LMDB transaction, so both are rolled back together and the state matches the rows. The recount on open is a check: a difference (which only a defect can cause) is corrected in the row and logged at warn.
  - User impact: None beyond the failed write itself; completeness never reports counts the store does not hold.
- **The daemon stops or crashes in the middle of a full index, after the repository's rows were deleted and before the rebuild ended.** (recoverable)
  - Detection: On the next open the persisted IndexState row has fullIndexFinished false.
  - Response: The repository reads not complete ('the full index has not finished'); the daemon's start-up queues a full index for every repository whose fullIndexFinished is false.
  - User impact: Answers about the repository are marked not established until the queued index ends; nothing is presented as complete.
- **The V4->V5 migration fails on open (store error while opening the new sub-DBs or writing the IndexState rows).** (recoverable)
  - Detection: The migration's run() throws inside the migration transaction in getGraphStore.
  - Response: The transaction rolls back and the stored schema version stays 4; the open fails with the migration's named error as every other migration step does, and the daemon logs it. No partly migrated store is left.
  - User impact: The daemon does not start until the cause is fixed; the store is unchanged.
- **Returning cross-repository incoming relationships to pending fails before the repository's rows are deleted in a reindex.** (recoverable)
  - Detection: deleteEntitiesForRepo with returnIncomingToPending throws from its write transaction.
  - Response: The transaction rolls back, so neither the pending rows nor the delete are applied; the full index fails with status 'error' as today, and the repository keeps its previous rows.
  - User impact: The reindex is reported failed; the other repository's relationships are not lost.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A relative import whose target file exists on disk but is not stored yet (the per-file resolver writes a resolved IMPORTS to the file id, src/indexer/resolver.ts:104-110). | Kept as a pending IMPORTS row awaiting the file entity's id; Pass 0 of the cross-file pass promotes it once the file is stored. |
| A relative import whose specifier resolves to no file (`import x from './missing.js'`, a Python `from . import missing`). | resolveRelations keeps it unresolved with class 'no-candidate' and reason 'target-file-missing'; it does not block completeness. |
| A relative import of an existing file that is outside the graph by design: `import logo from './logo.png'` (no parser), `import x from './vendor/lib.min.js'` (minified), `import data from './big.json'` over 256 KB, a lock file. | It resolves to the file id, which is never stored; the cross-file pass applies the full index's selection rule, classes it 'no-candidate' with reason 'target-not-code', and the repository can read complete. |
| A relative import of a source file a parser handles that the ignore rule excludes (e.g. a nested 'build' directory on the default list, or a gitignored generated .ts file). | It stays 'awaiting-target' with reason 'target-excluded-by-ignore'; the repository reads not complete with a separate reason line naming the count. Imports of .css and .json files are not in this case: the artifact parser indexes them. |
| A code-symbol pending row with no class and no awaitsId left after a full index's Pass 2 (any kind the pass cannot resolve by name). | Pass 2 writes it 'no-candidate', so no unattempted row remains to count as awaiting-target after the full index. |
| A relationship whose target is never stored (the target file is excluded, or the id was computed for an entity the parser never emits). | It stays pending with class 'awaiting-target' and is counted; the repository reads not complete with that count. It is not deleted and not promoted to a dangling edge. |
| Two pending rows awaiting the same entity id. | Both are found through the dupsort unresolved_by_target index and both are promoted in the same pass. |
| A barrel re-exporting a barrel (`export * from './a'` where a.ts itself does `export { f } from './b'`), and a cycle of re-exports (a re-exports b, b re-exports a). | resolveCall follows EXPORTS edges transitively and finds f in b.ts; the visited set stops the cycle, and a name found through no file stays unresolved as 'no-candidate'. |
| `export { f as g } from './b'` and a call g() in a file importing the barrel. | The pending EXPORTS row carries rawTo 'f' and exportedAs 'g'; the cross-file pass writes the EXPORTS edge (empty value) and an export_names entry (barrel, 'g') -> f; resolveCall looks up 'g' in export_names of the imported barrel and resolves g() to b.ts's f. |
| A call name with two candidate entities among the imported and re-exported files. | The row stays pending with class 'ambiguous' and its candidates in meta; it does not count against graphComplete (only awaiting-target rows do). |
| Boundary-kind pending rows (CALLS_HTTP, PUBLISHES_TO, SUBSCRIBES_TO, CALLS_RPC) left after the endpoint passes. | They read as class 'external-endpoint' and do not count against completeness; a boundary relation whose target is absent at a resolved write or promotion is kept with that class and left to the endpoint pass that owns it, never promoted by Pass 0. |
| A repository registered before this change and never reindexed since. | The migration writes its IndexState with fullIndexFinished false; completeness reads not complete with 'a reindex is needed', and the daemon queues its full index. |
| repo.stats or repo.list for a repository with no IndexState row (registered between the migration and its first index). | completenessOf(undefined) returns not complete with the reason 'not indexed since the index-state change: a reindex is needed'. |
| A repository with zero indexable files. | The full index ends with no rows; fullIndexFinished is true and every count 0, so it reads complete; the analyzer's empty-closure refusal (s5) still answers requests about it. |
| A store opened with an embedding provider unavailable. | embeddingAvailable false; complete = graphComplete, as unembedded is counted only by Story s2 and stays 0 here. |
| A reindex of repository B while repository A holds an edge into B's entities (no indexer writes such an edge today; it arises from a hand-written edge or a future cross-repository kind). | A's edges are written back as pending rows of A awaiting the B entity ids before B is deleted. B's cross-file Pass 0, run after B's full index, reads through unresolved_by_target the rows awaiting any entity of B whichever repository holds them, and promotes A's rows once B's entities are rewritten with the same deterministic ids; A's counts move in A's index_state row. A does not need a reindex. |
| A refused DEPENDS_ON from indexManifest. | It carries meta.repo = the repository, so it is counted against that repository; with the repository entity now stored it is normally written. |
| The same relationship reaches the store twice while its target is absent: once kept awaiting by a promotion that re-keyed its raw-name row, and once through upsertResolvedRelations' keep-awaiting branch. | Both write the key makeUnresolvedRelationId(repo, from, kind, awaitedId), so there is one row and the awaiting-target count is 1. |
| A file event creates the target of rows awaiting its id; the settle pass runs. | runSettlePass calls the cross-file pass in 'settle' mode with the settled files, and Pass 0 promotes those rows at the settle. |
| A clean-up removes files and resolveAfterReconcile runs. | The cross-file pass runs in 'repository' mode: no full-mode sweep of unattempted rows and no change to fullIndexFinished; rows Pass 2 attempts and cannot resolve are still written 'no-candidate', as in every mode. |
| A reindex of a repository with document summaries and cached exploration outputs. | Both are deleted with the repository's rows; the cache is rebuilt on demand by later analyzer runs, and the summaries by the doc-summarise-repo job queued at the end of the full index, which makes model calls. Until it runs, summary-backed answers lack the summaries. |
| Pass 2 reclasses an awaiting or EXPORTS row to 'ambiguous' or 'no-candidate' through updateUnresolvedMetaBatch. | The new class is merged into the stored meta; awaitsId, specifier and exportedAs are kept, and the counts move in the same transaction. |
| A repository is removed (repo.remove). | Its pending rows and their counts, its export_names entries and its index_state row are all deleted; no state of a removed repository is recounted on the next open. |
| An edit adds a call to a builtin or library function (e.g. `JSON.parse(x)`, `readFileSync(p)`) to a file of a complete repository; the settle runs. | Pass 2 attempts the new CALLS row, finds no match, and writes 'no-candidate' (reason 'no-match'); the repository stays complete. |
| A barrel is re-indexed (its entities replaced) or deleted. | detachDeleteEntitiesInTxn removes the export_names entries keyed by the old file u64 in the same transaction; a re-index writes new entries under the new u64 in the cross-file pass. No entry is left under an old u64; an entry pointing at a deleted target is ignored by resolveCall. |

**Invariants to preserve**

- RepoStatus keeps exactly its four values ('pending' | 'indexing' | 'ready' | 'error'); completeness is an added field beside it, so every consumer that branches on status is unaffected. [[c7]]
- A change to what is stored comes with a migration step applied when the daemon opens the store; SCHEMA_VERSION advances 4 -> 5 and the V1->V2, V2->V3 and V3->V4 steps are unchanged. [[c5]]
- Existing relation kind bytes are never renumbered: EXPORTS is written with its existing byte 7 and no new byte is added in this Story. [[c11]]
- A resolved relationship whose target is not stored yet is never silently dropped; it is kept until its target exists or it is counted. [[c4]]
- A reindex is the one command: it deletes the repository's rows in the graph store and the vector store and indexes every file from scratch; there is no separate repair. [[c15]]
- Only the daemon opens the stores; IndexState is read and written inside the daemon and reaches the CLI and the plugins through its status and stats requests. [[c11]]
- runCrossFileResolver keeps its signature shape and its existing Pass 1 (module-stub rewiring) and Pass 2 behaviour for the kinds it handles today; new options and results are additions. [[c6]]
- Entity ids stay deterministic (SHA256 of repo, file, kind and name), so pending rows awaiting an id are completed by the same id after a rebuild. [[c1]]
- A stored edge's value stays empty in this Story: the re-export's exported name lives in export_names, not in the edge value, which Story s7 owns for evidence. [[c1]]
- graphCompleteness keeps its existing parameters (returned, found, limited, skipped, partlyRead, rule) for its existing callers; only repoCompleteness is added. [[c11]]

## 7. Test strategy

**Test framework:** `node:test with node:assert/strict, run through tsx (`npx tsx --test 'src/**/__tests__/*.test.ts'`), under Node 22; store tests open a temporary LMDB store via setGraphStorePath and a temporary Lance directory via useTemporaryLance; no test reaches a model.`

**Test levels**

- **unit** — The per-row rules of the relationship writes and promotions, the pending-row class, the completeness derivation and the re-export resolution, each against a temporary store with hand-written entities and relations.
  - Subjects: `upsertResolvedRelations: both endpoints stored -> edge; target absent -> pending row of the same kind awaiting the target id (meta.awaitsId, class 'awaiting-target', indexed in unresolved_by_target); source absent -> unwritable 'source-missing' against meta.repo, or the daemon-wide unattributed counter when there is none; kind without byte -> unwritable 'unknown-kind' (src/db/__tests__/relations-awaiting-target.test.ts)`, `upsertUnresolvedRelations: row without meta.file/meta.repo and row of an unregistered repository counted unwritable with reason, not dropped`, `promoteToResolved and promoteResolvedBatch: absent target keeps the row rewritten to await the id (row NOT deleted); absent source deletes the stale row and counts it; returned {promoted, keptAwaiting, unwritable}`, `listUnresolvedRelations with opts.awaiting reads through unresolved_by_target; two rows awaiting one id are both returned`, `completenessOf: undefined state -> not complete with 'a reindex is needed'; each non-zero cause yields one reason line with its count; ambiguous and external-endpoint rows do not make the graph incomplete; complete = graphComplete when embeddingAvailable is false (src/db/__tests__/index-state.test.ts)`, `IndexState pending counts recounted on store open from each row's stored meta.class, with persisted fields carried over across closeGraphStore/reopen`, `TypeScript parser emits pending EXPORTS rows for `export { f } from`, `export { f as g } from` and `export * from` with rawTo, specifier and exportedAs (src/indexer/parser/__tests__/typescript-reexports.test.ts)`, `graphCompleteness with an incomplete repoCompleteness returns notEstablished with the repository's reasons in the basis note; with a complete one returns as today`, `transactional counts: a write transaction made to throw after its row writes leaves both the pending rows and the index_state counts unchanged; a store whose index_state counts are edited by hand is corrected on open from the stored classes with a warn log`, `resolveRelations: a relative IMPORTS of './missing.js' (no file on disk) is returned unresolved with meta.class 'no-candidate' and reason 'target-file-missing'; one of an existing file resolves to its file id as today; every resolved relation carries meta.repo`, `graphCompleteness: existing callers' arguments (returned, found, limited, skipped, partlyRead, rule) give the same Completeness as before; only repoCompleteness changes the result`, `updateUnresolvedMetaBatch merges meta (awaitsId and specifier survive a reclass) and moves the class counts; each of deleteUnresolvedForFile, deleteUnresolvedForRepoFile and deleteUnresolvedForRepo decrements the counts it removes (mutation check: the replace-meta behaviour restored loses awaitsId)`, `path form of kept-awaiting rows: a relation kept awaiting by upsertResolvedRelations (with and without its own meta.file), by a promotion and by a Pass 1 rewire is removed by deleteUnresolvedForFile(<absolute path>) and its count decremented; a DEPENDS_ON kept awaiting is removed only by deleteUnresolvedForRepo (mutation check: building meta.file from the entity row's repo-relative filePath leaves the row and the test fails)`
  - Fixtures: `temporary graph store (setGraphStorePath into mkdtemp) with a registered repository via addRepo`, `hand-written Entity rows with deterministic ids`, `useTemporaryLance()`
- **integration** — The indexer end to end on small on-disk repositories: the full index, the cross-file pass with its new passes, the reindex from scratch, the migration step and the status requests.
  - Subjects: `ac1 fixture: a.ts imports and calls b.ts's fn (a sorts before b); a first full index stores the IMPORTS and the CALLS, findCallers(fn) returns a.ts's call site, and IndexState reads complete (src/indexer/__tests__/first-index-order.test.ts)`, `re-export fixture: c.ts calls f() imported from index.ts which does `export { f } from './b'`; plus `export { f as g } from './b'` with a call g(), a barrel of a barrel, `export * from`, and a two-file re-export cycle; findCallers(f) returns the call sites through the barrel including g(), export_names holds (barrel, 'g') -> f, the stored EXPORTS edge value is empty, and the cycle terminates with the name left 'no-candidate' (src/indexer/__tests__/reexport-callers.test.ts)`, `runCrossFileResolver Pass 0: a pending row awaiting an id is promoted once the target's file is indexed, with committedFiles given (settle) and omitted (full index); counts in CrossFileResolveResult.completedById and pendingByClass`, `fullIndex reindex: a store with a deliberately lost cross-file edge (an edge deleted by hand, the file hashes unchanged) is rebuilt by repo.reindex with the edge back; the unchanged-hash skip does not apply; uncommittedFiles records a file whose parse throws; the repository entity is stored and a DEPENDS_ON edge is written for a two-repository manifest fixture`, `cross-repository restore (a guard; no indexer writes such an edge today, so the fixture WRITES A's CALLS edge into B's entity by hand with upsertRelations): B is reindexed while A is not; A's edge is returned to pending before B's delete and restored by B's 'full' Pass 0 through unresolved_by_target; A's counts return to zero awaiting; a forced failure of the return-to-pending transaction leaves B's rows and A's edge untouched`, `interruption: fullIndexFinished false after a full index made to throw part-way, and the daemon start-up path queues a full index for that repository`, `MIGRATION_V4_TO_V5 on a V4 store built with today's code: sub-DBs opened, an IndexState row with fullIndexFinished false per workspace repository, SCHEMA_VERSION 5 stored, earlier steps untouched; a failing run leaves the version at 4 (src/db/graph/__tests__/migration-v4-to-v5.test.ts)`, `repo.stats, repo.list and daemon.status handlers return completeness beside an unchanged four-value status (src/daemon/__tests__/repo-completeness.test.ts)`, `executor puts repoCompleteness on ExplorationRunnerContext; usage.example, import.graph, class.hierarchy, data-model.trace and convention.detect outputs read notEstablished with the counts for an incomplete repository (extends src/analyze/explore/__tests__/completeness-all-lookups.test.ts)`, `completeness and file-target classes, one fixture repository: imports of './missing.js', './logo.png', './vendor/lib.min.js' and a JSON over 256 KB read 'no-candidate' (reasons 'target-file-missing' / 'target-not-code') and the repository reads complete; adding an import of a .ts file in a directory the ignore list excludes makes it read not complete with the reason line '1 relationship points at files an ignore rule excludes'; an import of a .css file resolves to the stored file entity (mutation check: with the selection rule not applied, the .png import keeps the repository incomplete)`, `endpoint passes: a boundary relation kept with class 'external-endpoint' when its target is absent does not make the repository incomplete and is not promoted by Pass 0; external-endpoints and messaging-endpoints suites still pass with promoteResolvedBatch's new return`, `unattributed refusal: a resolved relation with no meta.repo and an unstored source increments DaemonStatus.unattributedUnwritable and no repository's state`, `settle: a file event that creates the target of awaiting rows; runSettlePass promotes them at the settle (mutation check: with committedFiles not passed they stay pending)`, `reconcile: resolveAfterReconcile runs in 'repository' mode and leaves fullIndexFinished and the classes a full index set unchanged`, `one row per relationship: a raw-name row re-keyed by a promotion that keeps it awaiting, then the same relationship written through upsertResolvedRelations' keep-awaiting branch, leaves one row and an awaiting-target count of 1 (mutation check: re-keying removed gives 2)`, `meta.repo on Pass 1's import rewire: a refused rewire is counted against the repository, not the unattributed counter`, `the executor sets repoCompleteness at all three context constructions in executor.ts, and each of the five relationship lookups reports notEstablished for an incomplete repository (extends completeness-all-lookups.test.ts; mutation check: one construction left without it fails)`, `repo.remove leaves no index_state row, export_names entry or unresolved_by_target entry for the removed repository, and a store reopened afterwards does not recount it`, `settle: a file event adds a file importing './logo.png'; after the settle the row is 'no-candidate' with reason 'target-not-code', by the same rule the full index applies`, `unreadable file: a selected file whose read fails during a full index (removed between listing and read via an injected listing, or with its permissions removed) is in uncommittedFiles and the repository reads not complete (mutation check: with only thrown errors recorded, the test fails)`, `completeness after a settle: in a repository that reads complete, a file event adds a call to `JSON.parse` and to an unknown library function; after the settle both rows are 'no-candidate' (reason 'no-match') and the repository still reads complete (mutation check: with Pass 2 leaving UNRESOLVED rows unclassed outside 'full' mode, it reads incomplete and the test fails)`, `export_names upkeep: re-index a barrel (content changed) and then delete it; after each, no export_names entry remains under its old u64, and after the re-index the entries under the new u64 resolve calls as before (mutation check: without the cleanup in detachDeleteEntitiesInTxn, an entry remains and the test fails)`
  - Fixtures: `small TypeScript repositories written to mkdtemp directories (ac1 order pair, re-export barrels, two repositories with a manifest dependency)`, `a V4 store produced by opening with the pre-change MIGRATIONS list`, `Indexer instance over the temporary store with the embedder stubbed (no model)`
- **contract** — The completeness field crosses every consumer of the status replies unchanged in shape.
  - Subjects: `RepoCompleteness shape in src/shared/types.ts matches the mirrored DTOs: vscode-plugin daemon-gateway type and JetBrains RepoStatsDto deserialization (a JSON fixture of a repo.stats reply decoded by each plugin's existing test harness)`, `CLI ReposPane RepoRow renders 'incomplete' with the count beside the status for an incomplete repository and nothing extra for a complete one (ink-testing-library render)`, `VS Code Daemon tab lists the repositories with status and completeness (webview source test plus a headless-Chrome screenshot per the webview visual verification recipe)`, `VS Code: RepoRef carries completeness from registeredRepos, and the Daemon tab renderer in detail-renderers.ts lists each repository with status and completeness (webview source test plus a headless-Chrome screenshot read by eye)`
  - Fixtures: `a recorded repo.stats JSON reply with one complete and one incomplete repository`
- **smoke** — The acceptance measure on this repository with the installed daemon after the update.
  - Subjects: `before: record findCallers counts for runGrepSearch (expected 0 today) and stripReviewSection (1 today) and the grep counts (4 and 4)`, `before the reindex: record the count of pending rows by kind for this repository (today's store holds no class)`, `repo.reindex of this repository without removing it; after it ends: runGrepSearch has 4 callers outside test files (src/daemon/tools/builtins/search/grep.ts:222, probe.ts:62, config-trace.ts:104, search-text.ts:104) and stripReviewSection has 4 (start.ts:72, findings.ts:90 and verdicts.ts:92 through src/workflow/review/index.ts, run-artifact.ts:84)`, `after the reindex: repo.stats for this repository reports the four class counts (awaiting-target, ambiguous, no-candidate, external-endpoint) and unwritable, with unwritable expected 0 and awaiting-target 0; any non-zero awaiting-target is listed by row and explained in smoke.md`, `repo.stats for this repository shows completeness with its reasons and counts; the CLI, the JetBrains RepoStatusDialog and the VS Code Daemon tab show it`, `the record of the run is written to the Story folder's smoke.md`, `after the reindex: the doc-summarise-repo job for this repository runs to completion and the repository's summaries are present again (count before and after recorded in smoke.md)`, `callers in test files (__tests__ or *.test.ts) are counted apart: runGrepSearch's calls from grep-core.test.ts and grep-omitted.test.ts, if stored, are reported separately and do not change the measure of 4, which the issue states for production call sites`
  - Fixtures: `the installed daemon updated to the build commit and restarted from ~/.insrc/daemon`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `src/indexer/__tests__/first-index-order.test.ts: a first full index of the a.ts -> b.ts fixture stores the IMPORTS and the CALLS and findCallers returns a.ts's call site`, `src/db/__tests__/relations-awaiting-target.test.ts: a resolved relationship with an absent target is kept as a pending row awaiting the id, and Pass 0 promotes it once the target is stored`, `mutation check: with the keep-awaiting branch removed from upsertResolvedRelations the ac1 test fails` |
| `ac2` | `integration: a store with a hand-deleted cross-file edge and unchanged file hashes is rebuilt by repo.reindex with the edge back (the unchanged-hash skip removed is the falsifying mutation)`, `smoke: repo.reindex of this repository, after which findCallers(runGrepSearch) = 4 outside test files and findCallers(stripReviewSection) = 4, matching the text-search counts, recorded in S001/smoke.md`, `integration (guard, hand-written edge): cross-repository return to pending and restore after a reindex of B without reindexing A` |
| `ac3` | `src/indexer/__tests__/reexport-callers.test.ts: callers of f reached only through `export { f } from './b'` return the call site through the barrel; aliased, nested and cyclic re-exports covered`, `src/indexer/__tests__/reexport-callers.test.ts: g() through `export { f as g } from './b'` resolves to f via export_names (mutation check: with the export_names lookup removed the alias case fails)`, `src/indexer/parser/__tests__/typescript-reexports.test.ts: the parser emits the pending EXPORTS rows`, `mutation check: with resolveCall not following EXPORTS edges the re-export test fails` |
| `ac4` | `src/db/__tests__/index-state.test.ts: unwritable and awaiting-target counts make completenessOf report not complete with the count`, `src/daemon/__tests__/repo-completeness.test.ts: repo.stats, repo.list and daemon.status return the completeness field beside the unchanged status for such a repository`, `contract: the CLI ReposPane, the JetBrains RepoStatsDto/RepoStatusDialog and the VS Code Daemon tab show the incomplete state with the count (screenshot read for the webview)`, `src/analyze/explore/__tests__/completeness-all-lookups.test.ts: lookups that read relationships report notEstablished with the counts`, `integration: the fixture with missing, non-code and ignore-excluded import targets reads complete until the ignore-excluded import is added, then not complete with that reason and count (mutation check: with every never-stored target classed 'no-candidate', the ignore-excluded case reads complete and the test fails)`, `smoke: repo.stats on this repository after the reindex shows unwritable 0 and the class counts, recorded in S001/smoke.md` |

## 8. Migration

**State before:** Per the s1 bundles (store at SCHEMA_VERSION 4, src/db/graph/store.ts:128; MIGRATIONS [V1_TO_V2, V2_TO_V3, V3_TO_V4], src/db/graph/migrations.ts:406-410): a resolved relationship whose target is not stored is skipped with a debug count (src/db/relations.ts:135-143), a pending row without meta.file/meta.repo or of an unregistered repository is dropped (:223-229, :253-263), and promoteToResolved / promoteResolvedBatch delete the pending row even when the edge is skipped (:397-403, :433-437). Pending rows are indexed only by (repoId, fromFile) in unresolved_by_file; nothing finds the rows awaiting a given target. The per-file resolver makes a relative import resolved as soon as the target exists on disk (src/indexer/resolver.ts:104-110), so it is lost when the target is not stored yet. The TypeScript parser emits nothing for a re-export (typescript.ts:189-196) and the EXPORTS kind (byte 7) is never written; the cross-file pass resolves only INHERITS, IMPLEMENTS and CALLS, and a call resolves only into a file the caller has a stored IMPORTS edge to (cross-file-resolver.ts:310-312, :487-500). fullIndex skips files whose hash is unchanged (index.ts:1031-1036), so a repository that lost relationships keeps losing them; the repository entity is never stored, so every DEPENDS_ON is skipped (index.ts:1095); deleteEntitiesForRepo (src/db/entities.ts:560-583) removes the repository's entities through detachDeleteEntities, whose transaction body detachDeleteEntitiesInTxn (entities.ts:1099-1131) sweeps incoming edges of other repositories with no return to pending. Repository state is only RepoStatus (four values) and lastRun; repo.list, repo.stats and daemon.status return no completeness; VS Code shows no repository status; analyzer lookups that read relationships have no repository state on ExplorationRunnerContext. Measured: runGrepSearch 0 stored callers against 4 in source; stripReviewSection 1 against 4.

**State after:** Store at SCHEMA_VERSION 5 with three new sub-DBs: unresolved_by_target (awaited entity id -> pending row id, dupsort), export_names ((re-exporting file id, exported name) -> target id) and index_state (repoId -> IndexStateRow, counts written in the same transactions as the rows they count). No relationship is dropped silently: an absent target keeps a pending row awaiting the id; an unwritable one is counted with its reason in IndexState and logged at warn. The cross-file pass promotes awaiting rows (Pass 0), promotes rows another repository holds into a reindexed repository in that repository's own pass, resolves pending EXPORTS rows into EXPORTS edges and export_names entries (Pass 1b), and resolves calls through re-exporting files by exported name, aliases included; unresolvable relative imports are 'no-candidate'; every attempted row carries meta.class. A full index (repo.reindex) returns other repositories' incoming relationships to pending, deletes the repository's rows in both stores, stores the repository entity and indexes every file with no unchanged-hash skip. Each repository has an IndexState with fullIndexFinished, uncommittedFiles, unwritable and recounted pending counts; RepoCompleteness is returned beside the unchanged status by repo.list, repo.stats and daemon.status, shown in the CLI ReposPane, the JetBrains RepoStatusDialog and a new VS Code repository list, and passed to the lookups that read relationships, which say completeness is not established for an incomplete repository. After the queued reindex of this repository, runGrepSearch has 4 stored callers and stripReviewSection 4.

**Zero downtime:** no — **Data rewrite:** yes

**Steps**

1. Add the code paths behind no flag: the keep-awaiting and count-unwritable branches in the relationship writes and promotions, meta.class on pending rows, the TypeScript re-export rows and the export_names writes, the per-file resolver's 'no-candidate' class and meta.repo on the indexer's resolved writes, the cross-file Pass 0 and Pass 1b and the EXPORTS-following call match, IndexState reads and writes, the reindex-from-scratch full index, and the completeness field on the status replies. Rows written by earlier code read correctly: a pending row with no meta.class reads as 'awaiting-target' (or 'external-endpoint' for boundary kinds), and an edge's value is unchanged. The cross-file pass gains an explicit mode ('full' from fullIndex, 'settle' from runSettlePass with the settled files, 'repository' otherwise, including resolveAfterReconcile); a row kept awaiting an id is re-keyed by that id. The full index's file-selection rule is extracted into one predicate shared with the cross-file pass, which classes rows awaiting a never-stored file by it. — ↩ rollbackable
2. Bump SCHEMA_VERSION 4 -> 5 and append MIGRATION_V4_TO_V5 to the registry: in one write transaction, open unresolved_by_target, export_names and index_state, and write one IndexStateRow per workspace repository with fullIndexFinished false, generation 0, zero unwritable and pending counts recounted from the existing rows (rows written before the change have no class and count under their kind's default). The version advances in the same transaction, so a failure leaves the store at 4 and unchanged. No existing key, value or kind byte is rewritten. — ✕ non-rollbackable
3. On store open after the migration, recount each repository's pending counts by class from the pending table (reading each row's stored meta.class, no resolution re-run) and compare them with the persisted counts; a difference is corrected in the row and logged at warn. The other persisted fields are carried over. — ↩ rollbackable
4. Extend the daemon start-up rule that queues a full index (pending, error, or indexing-without-lastIndexed rows, src/indexer/index.ts:286-300) to also queue one for every repository whose IndexState has fullIndexFinished false. After the migration this queues a full index for every repository once; until each ends, the repository reads not complete with 'a reindex is needed'. The queue's per-repository dedup keeps one job per repository. Each queued full index also deletes the repository's document summaries and exploration cache (as deleteEntitiesForRepo does today) and queues doc-summarise-repo, so after the migration every registered repository's summaries are regenerated once, with model calls; the jobs run one after another behind the index jobs. — ↩ rollbackable
5. Ship the readers of the new field: the CLI ReposPane row, the JetBrains RepoStatsDto and RepoStatusDialog, and the VS Code Daemon tab's repository list. Each treats an absent completeness as unknown and shows the status alone, so a plugin built before the daemon update, or a daemon before the plugin update, keeps working. — ↩ rollbackable
6. Update the installed daemon (maintenance update + restart from ~/.insrc/daemon), let the queued full index of this repository end, and record the acceptance measure (runGrepSearch 4, stripReviewSection 4, completeness shown) in S001/smoke.md. — ↩ rollbackable

**Backward compat:** RepoStatus keeps its four values and every existing field of RegisteredRepo, RepoStats and DaemonStatus stays; completeness (and DaemonStatus.unattributedUnwritable) are optional additions, so a consumer that does not read them is unaffected, and a plugin that reads completeness treats an absent field as unknown. upsertRelations (and the private upsertResolvedRelations / upsertUnresolvedRelations behind it), promoteToResolved, resolveRelations, indexManifest and listUnresolvedRelations keep their signatures; promoteResolvedBatch now returns a counts object where it returned void, and its three callers (the cross-file pass, src/indexer/cross-file-resolver.ts:335, and the two endpoint passes, src/indexer/external-endpoints.ts:142 and src/indexer/messaging-endpoints.ts:141) await it and ignore the value, so none changes; the endpoint passes see one behaviour change: a boundary relation whose target is absent is kept pending as 'external-endpoint' rather than its row deleted. listUnresolvedRelations and deleteEntitiesForRepo gain optional trailing options whose absence keeps today's behaviour (the repository removal path still sweeps incoming edges, now for a repository that is gone, and also removes its export_names entries). runCrossFileResolver's options and result gain optional fields only. graphCompleteness keeps all its parameters for its 19 call sites and gains only repoCompleteness. Existing edges, pending rows and kind bytes are read unchanged; EXPORTS uses its existing byte 7 with today's empty edge value. The store migration is forward-only: a store at version 5 opened by a daemon built before this change is refused by today's version check (LmdbStoreSchemaVersionMismatch, src/db/graph/store.ts:611-613) rather than read wrongly, so a rollback of the code means restoring the earlier build together with a reindex of a fresh store. Callers of the lookups that read relationships see a completeness of notEstablished, with reasons, where they saw an unqualified result before; the result fields themselves are unchanged. runCrossFileResolver's new mode defaults to 'repository', which matches today's whole-repository behaviour for any caller that does not pass it. updateUnresolvedMeta and updateUnresolvedMetaBatch keep their signatures but now merge meta; their one caller, Pass 2 (src/indexer/cross-file-resolver.ts:343), already passes `{ ...row.meta, candidates }`, so the merge gives it the same row, and a reclass that sets a class other than 'ambiguous' clears a stale candidates list. removeRepo additionally deletes the repository's index_state row.

## 9. Alternatives considered

### 9.1 a1: Pending-by-id rows completed by the cross-file pass, IndexState in its own table with transactional counts, re-exports as EXPORTS edges plus an export-name index — **CHOSEN**

A resolved relationship whose target is not stored becomes a pending row that awaits the target's id, found through a new by-target index and completed by the cross-file pass, across repositories after a reindex; IndexState is a separate per-repository row whose counts are written in the same transactions as the rows they count; a re-export line is stored as an EXPORTS edge plus an entry in an export-name index that the call matcher reads.

Absent target: in upsertResolvedRelations, promoteToResolved and promoteResolvedBatch (called by the cross-file pass and both endpoint passes), a relationship whose target id is not stored (and whose source is) is written as a pending row of the same kind with rawTo = the target id and meta {awaitsId: true, class: 'awaiting-target', file, repo}, keyed makeUnresolvedRelationId(repo, from, kind, awaitedId); when a promotion keeps a row awaiting, the old row is deleted and the re-keyed row written in the same transaction with its by-file and by-target entries and the count change, so one relationship is always one row; a missing source entity, a kind with no byte, a pending row with no file or repository, or a repository that is not registered is counted as unwritable with its reason and logged at warn. The repository a resolved relationship is counted against is its meta.repo; the indexer's resolved writes (the per-file resolver, the manifest step's DEPENDS_ON, the cross-file Pass 1 import rewire, the passes) all carry meta.repo, and a relationship that still names no repository is counted in a daemon-wide unattributed counter returned by daemon.status. A new dupsort sub-DB unresolved_by_target (awaited id -> pending row id), added by a migration step, finds the rows that await a given id in any repository. The cross-file pass runs in one of three explicit modes: 'full' (from fullIndex), 'settle' (from runSettlePass, given the settled files as committedFiles in one call) and 'repository' (from resolveAfterReconcile and any other caller). Its Pass 0 promotes rows whose awaited target now exists: in 'repository' mode, the repository's own awaiting rows; after a settle, the rows awaiting an entity of the committed files; after a full index of repository B, the rows awaiting ANY entity of B, read through unresolved_by_target whichever repository holds them, so the relationships returned to pending by B's reindex are restored in B's own pass and each promoted row's counts are moved in its owning repository's state. Classification: every pending row carries meta.class when written or attempted: rows awaiting an id are 'awaiting-target'; a relative import that resolves to no file is written 'no-candidate' (reason 'target-file-missing') by the per-file resolver; a row awaiting a FILE id whose file exists but is not stored is classed by the full index's own file-selection rule (index.ts:630-640: the repository's ignore list, a parser for the extension, not generated or minified) plus the artifact parser's skip rules (SKIP_BASENAMES and MAX_SIZE, artifact.ts:89, :117-118), extracted so the full index and the cross-file pass apply one rule: a file outside the graph by design (no parser, generated or minified, a lock file, over the size limit) is 'no-candidate' (reason 'target-not-code') and does not block completeness, while a file a parser handles that the ignore rule excludes stays 'awaiting-target' (reason 'target-excluded-by-ignore'), because the graph is really missing it; the cross-file pass writes 'ambiguous' (with candidates) or 'no-candidate' on the rows it attempts; boundary-kind rows are 'external-endpoint'; a row with no class and no awaitsId that the pass has not attempted counts under its kind's default: code-symbol kinds the pass attempts read 'awaiting-target' only until the full index's pass has run, after which unattempted rows are attempted. IndexState: a new sub-DB index_state keyed by repoId holding {generation, pending counts by class, unwritable count, reasonCounts (unwritable and awaiting rows by reason), uncommittedFiles, fullIndexFinished, endpointPassFailed, unembedded, embeddingAvailable}; every write that adds, removes or reclasses a pending row, or counts an unwritable, updates the row in the SAME LMDB write transaction, so an aborted transaction leaves both unchanged; on open the pending counts are recounted from the stored classes and the row corrected if it differs (logged), the rest persisted. RepoCompleteness is derived from it and returned beside the unchanged status by repo.list, repo.stats and daemon.status, shown in the CLI's Repos pane, the JetBrains status dialog and a new VS Code repositories list. Re-exports: the TypeScript parser emits, for `export { a, b as c } from './y.js'`, pending EXPORTS rows from the re-exporting file entity with rawTo = the local name in the source file and meta {specifier, exportedAs}, and for `export * from './y.js'` one row with rawTo '*'. The cross-file pass resolves each to the named entity in the resolved file (or to that file entity for '*'), stores an EXPORTS edge (the existing, unused kind, byte 7, with today's empty value, which Story s7 owns) and, in the same transaction, an entry in a new sub-DB export_names keyed (re-exporting file id, exported name) -> target entity id ('*' entries keyed by the name '*' -> the source file id). resolveCall widens a caller file's candidates: for each imported file it looks up the call's raw name in export_names (and follows '*' entries to their source files), transitively with a visited set, so `export { f as g }` makes g() resolve to f. Reindex: no indexed relationship kind crosses workspace repositories today (Pass 2 is single-repository), so the following is a guard the HLD requires for any that does, such as a hand-written or future cross-repository edge: every full job first writes every relationship that another repository holds into the repository's entities back as a pending row of the holding repository awaiting the entity's id, then deletes the repository's rows in both stores (deleteEntitiesForRepo, deleteUnresolvedForRepo, export_names entries, its IndexState counters) and builds from every file. The repository entity is stored in the full index so the manifest's DEPENDS_ON edges are written. The analyzer's runner context carries the repository's completeness, and graphCompleteness (its existing parameter {returned, found?, limited?, skipped?, partlyRead?, rule?}) gains only repoCompleteness?, so lookups that read relationships mark completeness as not established with the counts when the repository is not complete.

### 9.2 a2: Completion inside the entity write, IndexState folded into the repository row

Relationships awaiting a target are completed in the same transaction that stores the target entity, and the state fields are added to RepoRow instead of a separate table.

upsertEntities, after writing each entity, looks up pending rows awaiting its id (same by-target index) and promotes them in the same LMDB transaction, so no pass is needed for awaiting-by-id rows. IndexState fields (generation, counts, uncommittedFiles, flags) are added as optional fields of RepoRow and written with updateRepoStatus. Re-exports are handled as in a1. Reindex and the repository entity as in a1.

**Rejected because:** Meets the criteria but violates sc1's completion rule and steps into s2's transaction.

### 9.3 a3: Re-exports followed by reading the barrel's source in the cross-file pass, state recomputed on demand

No stored re-export relationship: the cross-file pass re-reads each imported file that consists of re-export lines to find the function; completeness is computed on each status read by scanning the pending table.

Absent-target rows and their completion as in a1. In resolveCall, when an imported file has no matching exported function, the pass reads that file from disk, parses its re-export lines and follows them to the named function. IndexState is not stored: repo.list / repo.stats / daemon.status scan the repository's pending rows and classify them on each call; unwritable is kept as an in-memory counter.

**Rejected because:** Cheapest, but reads raw files in the pass, scans 20,590 pending rows on each polled status read, and loses persisted state.

## 10. References

- **[[c1]]** `analyze-bundle` `s1 bundle (how-does-it-work): indexFile, reindexFile, upsertEntities, findEntitiesByFile, listEntitiesForRepo, upsertRelations, upsertResolvedRelations; 0 callers of reindexFile; no community detection; empty edge values`
- **[[c2]]** `analyze-bundle` `s1 bundle (structural-map): src/db, src/db/graph (store.ts, migrations.ts, keys.ts, codec.ts, edges.ts, traversal.ts), src/indexer and src/indexer/parser; import in-degree 159 for src/db`
- **[[c3]]** `code` `src/db/entities.ts` — "export async function reindexFile("
- **[[c4]]** `prior-artifact` `docs/standalone/bug-code-graph-missing-most-cross-E2026100712f70133/ISSUE.md` — "A resolved edge is silently dropped when its target is not stored yet."
- **[[c5]]** `code` `src/db/graph/store.ts` — "export const SCHEMA_VERSION = 4;"
- **[[c6]]** `code` `src/indexer/cross-file-resolver.ts` — "export async function runCrossFileResolver("
- **[[c7]]** `code` `src/shared/types.ts` — "export type RepoStatus = 'pending' | 'indexing' | 'ready' | 'error';"
- **[[c8]]** `code` `src/db/relations.ts` — "export async function deleteRelationsForFile(_db: DbClient, _filePath: string): Promise<void> {"
- **[[c9]]** `code` `src/indexer/index.ts` — "return relative(repoPath, file).split(sep).some(seg => ignoreSet.has(seg));"
- **[[c10]]** `prior-artifact` `docs/standalone/defect-installed-daemon-runs-out-lmdb-E202610100d577569/ISSUE.md`
- **[[c11]]** `prior-artifact` `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/DEF.md`
- **[[c12]]** `step-output` `HLD s1 backFlowNotes: direct reads of the store, migration, relations, entities and indexer files`
- **[[c13]]** `code` `src/indexer/external-endpoints.ts`
- **[[c14]]** `code` `src/indexer/messaging-endpoints.ts`
- **[[c15]]** `stakeholder` `Stakeholder decisions of 2026-10-11 on the HLD: completeness as a separate field with the four status values kept; reindex is the one command and indexes every file from scratch, deleting the repository's rows in the graph store and the vector store; the pickScope measure replaced by a function named in Story s1's design.`
- **[[c16]]** `code` `src/indexer/embedder.ts` — "entity.embeddingModel = EMBEDDING_MODEL;"
- **[[c17]]** `step-output` `s1 context.assemble (five analyze bundles, 2026-10-14, plus one direct-read bundle of the facts the first review rested on)`
- **[[c18]]** `step-output` `s2 alternatives and s3 judge`
- **[[c19]]** `step-output` `s4 contract.detail`
- **[[c20]]** `step-output` `s5 error.paths`
- **[[c21]]** `step-output` `s6 test.strategy`
- **[[c22]]** `step-output` `s7 migration.write`
- **[[c23]]** `step-output` `s8 checklist.verify`
- **[[c24]]** `prior-artifact` `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S001/LLD.md (earlier versions; daemon reviews 2026-10-14: block 2H/5M; 0H/5M; 0H/3M; 0H/3M; 0H/1M; 0H/2M; 0H/2M; 0H/1M; 0H/1M)`

## 11. Open questions

- dm1 (partial): src/db/graph/keys.ts, named as a call site of the EXPORTS edge entry, is not cited by the s1 bundles; it is cited by HLD c2 and holds RELATION_KIND_BYTE (EXPORTS=7). It is a read-only reference: no change is made to it [c2] [c19].
- ep3 (partial): invariantsToPreserve cite HLD reference ids because the schema allows only c-ids; the s1 bundles that show each: c1, c5 -> bundle 3 (migration chain, SCHEMA_VERSION 4); c7 -> bundle 4 (RepoStatus); c6 -> bundle 2 (the cross-file passes); c4 -> bundle 1 (the six loss points); the graphCompleteness invariant -> bundle 6 [c17] [c20].
- sc1 amendment (proposed in s4): sharedContract.fieldAdd reasonCounts { unwritable, awaiting } on IndexState, so completeness can name each cause with its count. Additive; s1 owns sc1. It must be approved with this LLD [c19].

## Resolved questions

- `qf111c4f4` — sc1 amendment (proposed in s4): sharedContract.fieldAdd reasonCounts { unwritable, awaiting } on IndexState, so completeness can name each cause with its count. Additive; s1 owns sc1. It must be approved with this LLD [c19].
  - **resolved**: Approve fieldAdd with this LLD — Already decided: the stakeholder approved AMD-c2ba6fa62a148ed1-2 (reasonCounts on sc1) together with the LLD on 2026-10-14 (commit 19bbc6d1); duplicates AMD-3..6 rejected. _(2026-10-14T08:42:44.715Z)_
- `q4a94ad8f` — dm1 (partial): src/db/graph/keys.ts, named as a call site of the EXPORTS edge entry, is not cited by the s1 bundles; it is cited by HLD c2 and holds RELATION_KIND_BYTE (EXPORTS=7). It is a read-only reference: no change is made to it [c2] [c19].
  - **resolved**: Accept HLD citation as sufficient — Stakeholder decision 2026-10-14: keys.ts is read-only (EXPORTS keeps byte 7), cited by HLD c2; the plan treats it as a reference with no task. _(2026-10-14T08:44:48.779Z)_
- `q25ae42a3` — ep3 (partial): invariantsToPreserve cite HLD reference ids because the schema allows only c-ids; the s1 bundles that show each: c1, c5 -> bundle 3 (migration chain, SCHEMA_VERSION 4); c7 -> bundle 4 (RepoStatus); c6 -> bundle 2 (the cross-file passes); c4 -> bundle 1 (the six loss points); the graphCompleteness invariant -> bundle 6 [c17] [c20].
  - **resolved**: Keep c-id citations + bundle crosswalk note — Stakeholder decision 2026-10-14: keep the HLD c-ids; the plan carries the crosswalk c4->bundle 1, c6->2, c1/c5->3, c7->4, graphCompleteness->6. _(2026-10-14T08:46:10.872Z)_

## Citations

- **[[c1]]** `analyze-bundle` `s1 bundle (how-does-it-work): indexFile, reindexFile, upsertEntities, findEntitiesByFile, listEntitiesForRepo, upsertRelations, upsertResolvedRelations; 0 callers of reindexFile; no community detection; empty edge values`
- **[[c2]]** `analyze-bundle` `s1 bundle (structural-map): src/db, src/db/graph (store.ts, migrations.ts, keys.ts, codec.ts, edges.ts, traversal.ts), src/indexer and src/indexer/parser; import in-degree 159 for src/db`
- **[[c3]]** `code` `src/db/entities.ts` — "export async function reindexFile("
- **[[c4]]** `prior-artifact` `docs/standalone/bug-code-graph-missing-most-cross-E2026100712f70133/ISSUE.md` — "A resolved edge is silently dropped when its target is not stored yet."
- **[[c5]]** `code` `src/db/graph/store.ts` — "export const SCHEMA_VERSION = 4;"
- **[[c6]]** `code` `src/indexer/cross-file-resolver.ts` — "export async function runCrossFileResolver("
- **[[c7]]** `code` `src/shared/types.ts` — "export type RepoStatus = 'pending' | 'indexing' | 'ready' | 'error';"
- **[[c8]]** `code` `src/db/relations.ts` — "export async function deleteRelationsForFile(_db: DbClient, _filePath: string): Promise<void> {"
- **[[c9]]** `code` `src/indexer/index.ts` — "return relative(repoPath, file).split(sep).some(seg => ignoreSet.has(seg));"
- **[[c10]]** `prior-artifact` `docs/standalone/defect-installed-daemon-runs-out-lmdb-E202610100d577569/ISSUE.md`
- **[[c11]]** `prior-artifact` `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/DEF.md`
- **[[c12]]** `step-output` `HLD s1 backFlowNotes: direct reads of the store, migration, relations, entities and indexer files`
- **[[c13]]** `code` `src/indexer/external-endpoints.ts`
- **[[c14]]** `code` `src/indexer/messaging-endpoints.ts`
- **[[c15]]** `stakeholder` `Stakeholder decisions of 2026-10-11 on the HLD: completeness as a separate field with the four status values kept; reindex is the one command and indexes every file from scratch, deleting the repository's rows in the graph store and the vector store; the pickScope measure replaced by a function named in Story s1's design.`
- **[[c16]]** `code` `src/indexer/embedder.ts` — "entity.embeddingModel = EMBEDDING_MODEL;"
- **[[c17]]** `step-output` `s1 context.assemble (five analyze bundles, 2026-10-14, plus one direct-read bundle of the facts the first review rested on)`
- **[[c18]]** `step-output` `s2 alternatives and s3 judge`
- **[[c19]]** `step-output` `s4 contract.detail`
- **[[c20]]** `step-output` `s5 error.paths`
- **[[c21]]** `step-output` `s6 test.strategy`
- **[[c22]]** `step-output` `s7 migration.write`
- **[[c23]]** `step-output` `s8 checklist.verify`
- **[[c24]]** `prior-artifact` `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S001/LLD.md (earlier versions; daemon reviews 2026-10-14: block 2H/5M; 0H/5M; 0H/3M; 0H/3M; 0H/1M; 0H/2M; 0H/2M; 0H/1M; 0H/1M)`
