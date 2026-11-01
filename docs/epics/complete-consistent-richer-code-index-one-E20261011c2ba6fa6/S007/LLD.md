<!-- insrc:artifact LLD-c2ba6fa62a148ed1-s7 -->

# LLD: E20261101c2ba6fa6:S007

## Summary

**Epic:** `complete-consistent-richer-code-index-one`
**HLD base run:** `wf-1791697214822-7bombm`
**HLD effective hash:** `85da4a2df479...`

Every stored relationship gains a one-byte record of how it was established: read straight from the source ('extracted'), established by resolution across files ('inferred'), chosen among candidates (reserved, never written) or proposed by a model (written later by s10). The indexer's writers stamp it as they store a relationship, pending rows carry it until their target appears, and the caller, callee, import and inheritance reads, the daemon's requests and the analyzer's lookups return it, so an answer can say which relationships were inferred. Relationships stored before this change read as of unknown origin until their file is next indexed; nothing is migrated.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Interaction with shared contracts](#4-interaction-with-shared-contracts)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Migration](#7-migration)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)
10. [Open questions](#10-open-questions)

## 1. HLD context

> See **HLD-c2ba6fa62a148ed1** § 2. Framework summary

**Rollout phase:** Phase D — evidence and more languages
**Owns:** `sc3` (RelationEvidence)
**Consumes:** `sc1` (IndexState), `sc2` (FileCommit)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The rule that a relationship with an absent target becomes pending instead of being skipped, at each of the six places in src/db/relations.ts where one is lost today (the resolved write's skip on a missing endpoint and its skip on a kind with no byte, promoteToResolved, promoteResolvedBatch, and the pending write's discard of a row without its file or repository and of a row whose repository is not registered), each either kept as pending or counted as unwritable with a reason; the set of files whose parse or commit failed in a full index, persisted with their paths until they next commit; which fields of the state are recounted on open and which are persisted and carried over; the classification of a pending relationship as awaiting-target, ambiguous or no-candidate, with the external-service rows classed apart and the two endpoint passes counted in when a full index is finished; the class is stored on the pending row itself, in its existing free-form record, so no stored form changes, a row the cross-file pass has not yet attempted counts as awaiting-target, and the recount on open reads the stored class and does not run resolution again; the extension of the cross-file pass to complete relationships awaiting a target by id, for imports and the other code-symbol kinds as well as calls and inheritance, and to follow a re-exporting file to the function it re-exports; the lookup of pending rows by the id they await, with its migration step, and the pass after a file event visiting the rows that await an entity of the files just committed; the change of the reindex request so that it deletes the repository's rows in the graph store and the vector store and builds them again from every file, in place of today's skip of unchanged files, with no separate repair request, returning to pending the relationships that other repositories hold into the deleted entities, and its queuing by the migration for every repository indexed before this change, which starts as not complete; the storing of the repository entity so that the manifest step's dependency relationships are written; the measurement on this repository, before and after a repair, of the awaiting-target, ambiguous, no-candidate and unwritable counts, with unwritable expected to be zero; the IndexState row, its migration step, its recount on open, and the derivation of repository status from it, as a completeness field returned beside the unchanged status by the daemon's status and stats requests and shown in the CLI's repository pane and in both editor plugins; and the analyzer's read of it: an analyzer lookup that reads relationships of a repository that is not complete says so in its result, with the counts, so that an answer over an incomplete graph is not returned as a plain fact. The choice, in this Story's design, of the function reached only through a re-exporting file that the repair is measured on, since the issue's own example (pickScope) has been removed from the source. Raising the log level of a refused relationship from debug is internal. Until Story s2 lands, s1 applies its rule inside the existing separate writes. — owns `sc1`
- `s2`: The extension of the existing whole-file replacement into the file commit (relationships and pending rows in the same transaction as entities; outgoing relationships of surviving entities replaced, not only those of entities that disappeared; incoming relationships of a removed entity returned to pending), the move of the indexer's refresh and delete paths and of the clean-up pass's removal of a stored file onto it, and the retirement of the separate delete-then-upsert sequence in the indexer. The handling of vectors after the commit: writing the entity row with its embedding marker empty and setting it in a second transaction only after the vector write succeeds, counting an entity with an empty marker in IndexState, comparing entity ids with the vector table on open in both directions, so that a vector left behind by a failed removal is deleted before a plain insert can meet it, and the extension of the existing reembed job to run on daemon start and after an index, with a vector write for an entity whose marker is empty made an upsert, except for an entity first allocated in the same commit, which keeps the plain insert. Three things in that job change with it: it applies the embed step's own selection instead of forcing every entity, so empty-body entities (external endpoints, module stubs) stay unselected and uncounted; its update of an embedding writes the vector first and sets the marker in a second transaction, where today it sets the marker first; and the marker carries the model of the backend that is active, not one fixed name. Which entities count as unembedded (those the embed step selects) and the separate recorded reason when the embedding backend is unavailable. The count of a file whose commit fails on a file event. The queue rule that index jobs go ahead of other jobs and that a long job yields between its units, so that a commit is not held behind a model pass. How a reader sees the old or the new set during a commit is the store's ordinary transaction isolation and needs no new mechanism. — owns `sc2`
- `s3`: The by-file and by-repository index of entity rows, its migration step that builds it for an existing store, and its upkeep. No single entity-row write exists today: there are seven raw put and remove sites across src/db/entities.ts and src/db/graph/migrations.ts, and the existing name index is kept in step by a helper each site must remember to call. This Story introduces one put and one remove function for entity rows that maintain the name index and the new index together, routes every raw site through them, and adds a test that fails when a raw put or remove appears outside them. Upkeep therefore sits beneath every caller, so that neither today's writers nor the file commit need to know of it and this Story does not depend on s2. The two reads (findEntitiesByFile, listEntitiesForRepo) keep their results and their callers; a new existence check answers whether a repository holds any entity, and the analyzer's scope check uses it.
- `s4`: The cause, which ISSUE-0d577569 records as not known, was reproduced on 2026-10-11 and is not the system's semaphore limit, which the library's message names, but the loss of the daemon's own file lock on the store's lock file, after which another process that opens and closes the store removes the store's semaphores; the daemon's next write then fails with the library's message about the limit, and its exit hangs in the library's close. What in the daemon closes a second descriptor on the lock file is not yet identified. First, therefore, the remedy that does not depend on finding it: the live store is opened by the daemon alone, and any other process is refused it. Second, a bound on the whole shutdown including the store's close, so that a close that hangs ends in an exit. Third, recording a store failure of this kind and stating it in the daemon's status. None of this is consumed by another Story.
- `s5`: The refusal, with a named error and its own code, of a search or analyze request about a repository whose status is indexing, at the analyzer's scope check and at the daemon's search requests, carrying the status and how far the run has got (files done of files selected, and when it began), read from the indexer's running job; the tools that rest on the analyzer (the workflow steps, triage, code review) pass that error on as it is. The order of the analyzer's run: the refusal of a scope the index does not hold comes before a size is announced, or the announcement says the size could not be counted. The named cause and error code for a failed read of the last-indexed time and for a failed lookup, and the three other defects of ISSUE-e2bcadd9 (the wrong provider named, the scope resolved before the cache, and failure text matched inside echoed output). This Story does not read IndexState: it works with the checks the analyzer has today, so that it stays independent of s1.
- `s6`: The in-process matcher of the gitignore grammar over nested ignore files and its conformance test against git; the move onto the one filter of every site that reads the list today in src/indexer/index.ts (the full walk, the start-up scan for changed files, the file event, the clean-up pass, and the two places that seed the list when a repository is registered), of the watcher, and of the analyzer's reader, its two exploration walkers and its infra walker (src/analyze/runtimes/infra/_shared.ts), each of which has its own list of names today, and of the indexer's source-root detection (src/indexer/source-roots.ts), whose own list would otherwise hide a package in a directory the filter includes; a search of the source for such lists found five more, in the daemon's four file-search tools (glob, grep, list-dir, recent under src/daemon/tools/builtins/search) and in the review probe (src/workflow/review/probe.ts), which search the working tree as text, do not decide what the index holds, and are deliberately left as they are; the filter keeps answering for a directory that holds an included file, as the analyzer's reader does now; the retirement of the bare-name list and of the ignore entry in the repository's .insrc config; the two built-in exclusions (generated or minified files, the .insrc directory) applied inside the filter so that the full walk and the file event no longer differ on them; the handling of a change to an ignore file as an event that removes and adds files, and the comparison by content hash of the clone's exclude file and the global ignore file, which the watcher cannot see, whenever the filter is used; the queued step that proposes a root ignore file with the cheap-tier model when a repository is added without one, its fallback, and the rule that an existing file is never written. Two points were decided by the stakeholder: the filter honours all three of git's ignore sources (the .gitignore files, the clone's exclude file, the user's global ignore file), and a file git tracks is indexed even when a rule matches it, so the filter takes git's list of tracked files as an input and a plain folder is filtered by the rules alone. — owns `sc4`
- `s8`: The grouping of a complete repository's code entities into subsystems, its determinism, the tables for membership, connections and summaries and their migration step; the queued pass and its trigger on a new generation; the cheap-tier summary of a subsystem whose membership changed; the daemon request that returns subsystems; the addition of subsystem context to the analyzer's context builder; the statement that groups rest on an incomplete or older graph. Which relationships count toward grouping, and with what weight by evidence, is decided here.
- `s9`: One reader per added language (Rust, C#, C, C++) in the existing parser registry with a guarded load, as the Kotlin reader has; the structured reading of SQL in place of the whole-file document, keeping the document entity for retrieval; any entity kinds this needs, appended to the fixed byte table without renumbering; the additions to the Language union; the daemon request that lists the languages read and why any was skipped. Each language can be delivered on its own.
- `s10`: The reading of links and references between documents, and from a document to code, as relationships of the existing REFERENCES kind written in the file commit with evidence 'extracted'; the queued mid-tier pass over new or changed documents and its own table of model-proposed relationships; the hand-checked set, the measurement, and the recorded figures that switch the capability on or leave it off; the merging of model-proposed relationships into reads with evidence 'model'; the status line when no CLI provider is available.
- `s11`: Private implementation of s11: The step tools run inside the daemon, and the MCP server opens no store
- `s12`: Private implementation of s12: Every supported parser records the calls its code makes, and calls resolve within a package
- `s13`: Private implementation of s13: Settling file changes does work proportional to the changed files, never a scan of the repository or the store

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `RelationEvidence`

```typescript
type RelationEvidence = 'unknown' | 'extracted' | 'inferred' | 'chosen' | 'model';
```

**Returns:** `type` — How a relationship was established (sc3). 'unknown' = stored before this change (empty row value) or an unrecognised byte; 'extracted' = read directly from the source text (the per-file resolver, the manifest step); 'inferred' = established by resolution across files (the cross-file pass, the endpoint passes); 'chosen' = one target picked among several candidates, reserved and never written by this Epic; 'model' = proposed by a model (written by s10, not here).

**Postconditions:**
- src/shared/types.ts:696 widens from 'unknown' alone to the five values; RelationWrite.evidence keeps its type name

### 2.2 `RelationRead`

```typescript
interface RelationRead { from: string; kind: RelationKind; to: string; evidence: RelationEvidence }
```

**Returns:** `interface` — sc3's read shape. In this Story it is realised on the single-kind neighbour reads as the returned entity plus its evidence (the request supplies from/kind; the entity is `to` or `from`), since an edge key is unique per (from, kind, to).

**Postconditions:**
- exported from src/shared/types.ts for s8/s10 to consume

### 2.3 `upsertResolvedRelationsInTxn`

```typescript
function upsertResolvedRelationsInTxn(s: GraphStore, relations: readonly Relation[], now?: number): RelationWriteCounts
```

**Parameters:**
- `relations: readonly Relation[]` — each Relation may now carry `evidence?: RelationEvidence`; its byte is written as the value of both edge rows

**Returns:** `RelationWriteCounts` — unchanged

**Errors:**
- `none new` when an unrecognised evidence string is written as empty (reads 'unknown') and logged; it never refuses the relationship

**Preconditions:**
- called inside the caller's write transaction (unchanged)

**Postconditions:**
- a stored relationship's out_edge and in_edge rows both hold the evidence byte (empty when the relation carried none)
- a relationship kept pending because its target is not stored keeps its evidence in the pending row's meta.evidence
- rewriting an existing edge overwrites its byte with the new evidence

### 2.4 `promoteResolvedBatch`

```typescript
function promoteResolvedBatch(db: DbClient, items: ReadonlyArray<{ unresolved: UnresolvedRelation; targetEntityId: string; exportName?: string | undefined; evidence?: RelationEvidence | undefined }>): Promise<PromoteResult>
```

**Parameters:**
- `items[].evidence: RelationEvidence | undefined` _(optional)_ — the evidence to store; when absent, the pending row's stored meta.evidence is used, else empty ('unknown')

**Returns:** `Promise<PromoteResult>` — unchanged

**Postconditions:**
- the promoted edge rows hold the item's evidence, or the row's carried evidence when the item has none
- a target still absent keeps the row awaiting with its evidence in meta

### 2.5 `promoteToResolved`

```typescript
function promoteToResolved(db: DbClient, unresolved: UnresolvedRelation, targetEntityId: string, evidence?: RelationEvidence): Promise<void>
```

**Parameters:**
- `evidence: RelationEvidence` _(optional)_ — passed through to promoteResolvedBatch

**Returns:** `Promise<void>` — unchanged

**Postconditions:**
- same as promoteResolvedBatch for one item

### 2.6 `returnEdgeToPendingInTxn`

```typescript
function returnEdgeToPendingInTxn(s: GraphStore, fromU64: bigint, kindByte: number, toU64: bigint): boolean
```

**Returns:** `boolean` — unchanged

**Preconditions:**
- called before the edge rows are deleted (unchanged order in commitFile and deleteEntitiesForRepo)

**Postconditions:**
- the awaiting row it writes carries the returned edge's evidence in meta.evidence, so Pass 0 restores it with the same evidence

### 2.7 `resolveRelations`

```typescript
function resolveRelations(relations: Relation[], filePath: string, repo: string, entities?: Entity[]): Relation[]
```

**Returns:** `Relation[]` — each relation it resolves (parser-resolved, same-file CALLS, relative IMPORTS to a file) carries evidence 'extracted'; relations it leaves pending carry no evidence

**Postconditions:**
- no relation it returns as resolved lacks evidence

### 2.8 `writeOfRelation`

```typescript
function writeOfRelation(r: Relation): RelationWrite
```

**Returns:** `RelationWrite` — evidence = r.evidence ?? 'unknown' (today always 'unknown')

**Postconditions:**
- a resolver decision reaches the file commit with its evidence

### 2.9 `relationOfWrite`

```typescript
function relationOfWrite(w: RelationWrite): Relation
```

**Returns:** `Relation` — carries w.evidence onto the Relation (omitted when 'unknown') instead of dropping it

**Postconditions:**
- the commit's in-transaction writers receive the evidence

### 2.10 `findCallers`

```typescript
function findCallers(db: DbClient, entityId: string): Promise<Array<Entity & { evidence: RelationEvidence }>>
```

**Returns:** `Promise<Array<Entity & { evidence: RelationEvidence }>>` — each caller with the evidence of its CALLS relationship to the entity

**Postconditions:**
- callers stored before this change carry 'unknown'
- findCallees, findDefinedIn and findImports are reshaped the same way (one kind each, so one relationship per neighbour)

### 2.11 `findCallees`

```typescript
function findCallees(db: DbClient, entityId: string): Promise<Array<Entity & { evidence: RelationEvidence }>>
```

**Returns:** `Promise<Array<Entity & { evidence: RelationEvidence }>>` — each callee with the evidence of the CALLS relationship

### 2.12 `outNeighbors`

```typescript
function outNeighbors(from: bigint, opts?: NeighborOpts): Promise<bigint[]>; function outNeighbors(from: bigint, opts: NeighborOpts & { withEvidence: true }): Promise<Array<{ u64: bigint; kind: RelationKind; evidence: RelationEvidence }>>
```

**Parameters:**
- `opts.withEvidence: true` _(optional)_ — return one row per stored relationship (not deduped across kinds) with its kind and evidence, for the analyzer's class-hierarchy and import-graph lookups

**Returns:** `see signature` — without withEvidence: unchanged; inNeighbors mirrors it

**Postconditions:**
- traversals (bfs/dfs/closure/scc) and every existing caller keep the unchanged id-only form

### 2.13 `search.callers`

```typescript
IPC 'search.callers' { entityId: string } -> Array<Entity & { evidence: RelationEvidence }>
```

**Returns:** `Array<Entity & { evidence: RelationEvidence }>` — additive field on each returned entity; search.callees and search.callers_nhop (each hop's caller) likewise, and the graph_callers / graph_callees tools include evidence in each short entity

**Postconditions:**
- no field is removed or renamed; clients that ignore evidence are unaffected

## 3. Data model changes

### 3.1 `out_edge / in_edge row value` — field-modify

The value of both rows of a stored relationship, today always an empty buffer, becomes the evidence: empty or 0x00 = 'unknown', 0x01 = 'extracted', 0x02 = 'inferred', 0x03 = 'chosen', 0x04 = 'model'; any other byte decodes to 'unknown'. Both rows of an edge always hold the same byte. Keys, kind bytes and SCHEMA_VERSION are unchanged and no migration step is added: every existing row reads 'unknown' until its relationship is next written (lc1, ac3). Encoding/decoding lives beside the other row codecs in src/db/graph/codec.ts.

```
out_edge[from|kind|to] = <> (empty)  ->  out_edge[from|kind|to] = <1 byte evidence | empty>
in_edge[to|kind|from]   = <> (empty)  ->  in_edge[to|kind|from]   = <same byte>
```

**Call sites:**
- `src/db/relations.ts:183-184`
- `src/db/relations.ts:564-565`
- `src/db/graph/edges.ts:41-60`
- `src/db/search.ts:327-348`

### 3.2 `Relation` — field-add

Optional `evidence?: RelationEvidence | undefined` on the writers' Relation shape (src/shared/types.ts), set by the per-file resolver, the cross-file pass's Pass 1 rewire and the manifest step; absent means the writer does not know (stored empty).

**Call sites:**
- `src/indexer/resolver.ts:63-118`
- `src/indexer/cross-file-resolver.ts:379`
- `src/indexer/index.ts:1245-1258`
- `src/db/file-commit.ts:19`
- `src/db/file-commit.ts:27`

### 3.3 `UnresolvedRow.meta.evidence` — field-add

A pending row may carry `evidence` in its existing free-form meta record: written when a resolved relationship is kept awaiting an absent target, when promoteResolvedBatch keeps a row awaiting, and when returnEdgeToPendingInTxn returns an edge (its byte decoded). Pass 0 promotes such a row with the carried value; Pass 1b, Pass 2 and the endpoint passes pass 'inferred' explicitly. No stored form changes (meta is already free-form).

**Call sites:**
- `src/db/relations.ts:682`
- `src/db/relations.ts:552-556`
- `src/db/relations.ts:603-610`
- `src/indexer/cross-file-resolver.ts:221`
- `src/indexer/cross-file-resolver.ts:482`
- `src/indexer/cross-file-resolver.ts:585`
- `src/indexer/external-endpoints.ts:142`
- `src/indexer/messaging-endpoints.ts:141`

### 3.4 `usage.example / class-hierarchy / import-graph exploration results` — field-add

Each listed caller (usage.example), parent/child (class-hierarchy) and importer/importee (import-graph) carries its relationship's evidence, and the exploration's summary states how many of the listed relationships are inferred or chosen and how many are of unknown origin, so the synthesized answer can say which (ac4).

**Call sites:**
- `src/analyze/explore/usage-example.ts:146-183`
- `src/analyze/explore/class-hierarchy.ts:125-128`
- `src/analyze/explore/import-graph.ts:134-151`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc3` | implements | Defines the five-value RelationEvidence and RelationRead in src/shared/types.ts, stores evidence as the one-byte value of both edge rows, writes it at every writer of a stored relationship (per-file resolver and manifest step 'extracted'; cross-file Pass 1/1b/2 and both endpoint passes 'inferred'; Pass 0 the carried value; 'chosen' never written), and returns it on the caller/callee/defined-in/imports reads, the daemon's search.callers/callees/callers_nhop, the graph tools and the analyzer's usage.example, class-hierarchy and import-graph lookups. |
| `sc2` | consumes | Fills RelationWrite.evidence (which s2 defined as 'unknown') through writeOfRelation from the resolver's decision, and relationOfWrite stops dropping it, so the file commit's in-transaction writers store it. The commit's shape and transaction are unchanged. |
| `sc1` | consumes | No IndexState field changes. Promotions keep advancing the generation as today; s8 and s10 read evidence and IndexState together. |

## 5. Error paths

**Error cases**

- **A stored edge row holds a byte outside the defined values (written by a newer daemon, or damaged)** (recoverable)
  - Detection: The evidence decoder in src/db/graph/codec.ts meets a value that is not empty and not 0x00-0x04
  - Response: Decode it as 'unknown'; never throw from a read
  - User impact: The relationship reads as of unknown origin rather than failing the request
- **The out_edge and in_edge rows of one relationship hold different bytes (a crash cannot cause it -- both are written in one transaction -- but a future writer could)** (recoverable)
  - Detection: Not checked on read; each read takes the byte of the row it iterates (callers read in_edge, callees out_edge)
  - Response: Both writers always write the same byte to both rows; a test asserts both rows of every written edge agree
  - User impact: None while the writers hold the rule
- **A writer passes an evidence string that is not one of the five values (a typo through an untyped path, e.g. JSON from a test or a meta record)** (recoverable)
  - Detection: The encoder finds no byte for the string
  - Response: Store the edge with an empty value (reads 'unknown'), log at warn with the edge, never refuse the relationship
  - User impact: The relationship is stored; its origin reads unknown
- **A pending row's meta.evidence is not a valid value (an older or hand-edited row)** (recoverable)
  - Detection: Pass 0 reads meta.evidence and the encoder finds no byte
  - Response: Promote with empty evidence ('unknown')
  - User impact: The completed relationship reads unknown instead of a guessed origin

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A store written before this change (every edge value empty), opened by the new daemon | No migration runs; every read returns evidence 'unknown'; no re-index is needed (ac3) |
| A file refreshed after the change whose relationships were stored before it | The file commit sweeps and rewrites its outgoing relationships, so they now carry 'extracted' or, once the cross-file pass runs, 'inferred'; incoming relationships other files hold keep 'unknown' until those files are refreshed |
| A call that matches several candidate targets across files | It stays a pending row classed 'ambiguous' with its candidates (s1); no edge is written, so no 'chosen' value appears anywhere (ac2) |
| A same-file call whose name matches two entities of the file | The per-file resolver leaves it pending (unchanged); if the cross-file pass later resolves it uniquely it is stored 'inferred' |
| A relative import resolved by the per-file resolver to a file not yet stored | Kept awaiting the file id with meta.evidence 'extracted'; Pass 0 later stores it 'extracted', not 'inferred' |
| An incoming relationship whose target entity is removed by a file commit, then the entity comes back | returnEdgeToPendingInTxn records the edge's evidence on the awaiting row; Pass 0 restores the edge with the same evidence |
| The same relationship written twice with different evidence (e.g. a file refresh rewrites an edge the cross-file pass stored) | The last write's byte wins on both rows |
| A neighbour reached by two kinds in an outNeighbors({ withEvidence: true }) read | One row per stored relationship, each with its own kind and evidence (not deduped); the id-only form keeps deduping as today |
| An analyzer usage.example answer where every caller is 'unknown' (an un-refreshed store) | The summary says the callers' origin is unknown rather than implying they were read from the source |

**Invariants to preserve**

- Edge keys, relation kind bytes and SCHEMA_VERSION do not change; only the row value is used, and an empty value (every existing row) reads 'unknown' [[c1]]
- Both rows of a stored relationship are written in the same transaction by the same writer (upsertResolvedRelationsInTxn, promoteResolvedBatch); the evidence byte is written by those same two puts [[c1]]
- RelationWrite keeps its shape; the file commit remains one transaction and its result counts are unchanged [[c2]]
- A relationship whose target is not stored is never dropped: it is kept pending (now with its evidence in meta), as s1 established [[c5]]
- Traversals (bfs, dfs, transitiveClosure, scc, unreachable) and every id-only neighbour read keep their results and cost; only the opt-in withEvidence form and the single-kind find* reads read row values [[c6]]
- The daemon's caller/callee responses only gain a field; no field is removed or renamed, so the IDE clients keep working [[c6]]

## 6. Test strategy

**Test framework:** `node:test with node:assert/strict, run with `npx tsx --test` (co-located __tests__ files)`

**Test levels**

- **unit** — The evidence byte encoding and decoding, including the empty and unrecognised values
  - Subjects: `evidence codec in src/db/graph/codec.ts`
- **integration** — The writers store the byte on both edge rows, carry it through pending, and the reads return it, against a real temporary graph store
  - Subjects: `upsertResolvedRelationsInTxn`, `promoteResolvedBatch`, `returnEdgeToPendingInTxn`, `findCallers`, `findCallees`, `outNeighbors withEvidence`
  - Fixtures: `temporary graph store (setGraphStorePath) and useTemporaryLance, as src/db/__tests__/relations-in-txn.test.ts`
- **integration** — Through the real IndexerService on real files: the per-file resolver stamps 'extracted', the cross-file pass 'inferred', Pass 0 keeps the carried value, an ambiguous call writes no edge
  - Subjects: `resolveRelations`, `cross-file Pass 0/1/1b/2`, `manifest DEPENDS_ON`
  - Fixtures: `two-file TypeScript repository with a same-file call, a cross-file call, an ambiguous name and a relative import of a file indexed second`
- **integration** — A store written before the change (empty edge values) is read with evidence 'unknown' and no migration
  - Subjects: `findCallers on a pre-change store`
  - Fixtures: `edges written with an empty value directly through the store, as an older daemon wrote them`
- **integration** — The daemon's caller/callee requests and the analyzer's lookups return and report evidence
  - Subjects: `search.callers`, `search.callees`, `search.callers_nhop`, `usage.example`, `class-hierarchy`, `import-graph`
  - Fixtures: `handler runtime over a seeded store, as existing handler tests do`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `integration: a file with a same-file call and a call resolved across files, indexed through IndexerService -- findCallees returns the first 'extracted' and the second 'inferred'`, `integration: both edge rows of every written relationship hold the same evidence byte` |
| `ac2` | `integration: a call matching several candidate targets stays a pending row classed 'ambiguous' with its candidates and no edge exists for it; no stored edge in the fixture decodes to 'chosen'` |
| `ac3` | `integration: edges written with an empty value (a pre-change store), reopened -- findCallers/findCallees return them with evidence 'unknown'; SCHEMA_VERSION is unchanged and no migration step runs`, `unit: empty, 0x00 and an unrecognised byte decode to 'unknown'` |
| `ac4` | `integration: usage.example over a target with one 'extracted', one 'inferred' and one 'unknown' caller -- each listed caller carries its evidence and the summary states how many are inferred or chosen and how many of unknown origin`, `integration: search.callers returns each caller with its evidence field` |

## 7. Migration

**State before:** Every stored relationship's out_edge and in_edge rows hold an empty value, written at the only two edge-write sites (src/db/relations.ts:183-184, :564-565); RelationEvidence is the single value 'unknown' (src/shared/types.ts:696) and the file commit drops it (src/db/file-commit.ts:19); reads yield neighbour ids only (src/db/graph/edges.ts:41-60) and the caller/callee requests return plain entities (src/db/search.ts:186-212, src/daemon/handler-runtime.ts:956-966).

**State after:** Both rows of every relationship written from now on hold a one-byte evidence value; rows written before keep their empty value and read 'unknown'; pending rows carry the evidence of the relationship they hold; the single-kind reads, the daemon's caller/callee requests, the graph tools and the analyzer's usage.example, class-hierarchy and import-graph lookups return evidence beside each relationship.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Widen RelationEvidence to its five values and add RelationRead and the optional Relation.evidence; add the byte codec. Nothing reads or writes them yet. — ↩ rollbackable
2. Make the two edge writers write the evidence byte (empty when a relation carries none) and carry evidence through pending rows and the return of an edge to pending. A daemon rolled back to the previous build ignores the byte (it never reads edge values), so rows written in this step stay valid for it. — ↩ rollbackable
3. Stamp evidence at each decision point: the per-file resolver and the manifest step 'extracted'; cross-file Pass 1, 1b, 2 and both endpoint passes 'inferred'; Pass 0 the carried value; and let the file commit carry it (writeOfRelation / relationOfWrite). — ↩ rollbackable
4. Return evidence from the single-kind find* reads and the opt-in outNeighbors/inNeighbors withEvidence form, then add the field to search.callers / search.callees / search.callers_nhop and the graph tools, and mark it in the analyzer's lookups. — ↩ rollbackable
5. No data step: existing rows are not rewritten; each relationship takes its evidence the next time its file is indexed or the cross-file pass writes it. — ↩ rollbackable

**Backward compat:** No key, kind byte or SCHEMA_VERSION change and no migration step: a store written before the change opens unchanged and its relationships read 'unknown'; an older daemon opening a store written after it ignores edge values, as it does today. The daemon's search.callers / search.callees / search.callers_nhop responses and the graph tools only gain an `evidence` field on each entity, so the VS Code and JetBrains clients and MCP callers that ignore it are unaffected. RelationWrite keeps its shape; Relation.evidence is optional, so every existing writer compiles and stores 'unknown' until it is updated.

## 8. Alternatives considered

### 8.1 a1: Byte on the edge row; reads annotate the returned entities — **CHOSEN**

Evidence is the one-byte value of both edge rows, passed into the two writers; the existing caller/callee reads return each neighbour with the evidence of the relationship that reached it.

RelationEvidence (sc3) gains 'extracted' | 'inferred' | 'chosen' | 'model'. Relation gets an optional evidence field; the two edge writes in src/db/relations.ts write its byte (empty when absent, so a writer not yet updated still reads 'unknown'), upsertResolvedRelationsInTxn takes it from the relation and promoteResolvedBatch from each item. A relationship kept pending stores its evidence in the pending row's meta, Pass 0 promotes with the stored value, and returnEdgeToPendingInTxn copies the edge's byte into the row it creates. The per-file resolver marks its decisions 'extracted', the cross-file passes and both endpoint passes 'inferred', the manifest step 'extracted'; writeOfRelation/relationOfWrite carry it through the file commit. Reads: neighborsSync yields the byte alongside the neighbour; findCallers/findCallees (and the other neighbour reads in src/db/search.ts) return Entity values carrying the evidence of the reaching relationship, so search.callers/callees, callers_nhop and the graph tools return it unchanged in shape apart from the added field; usage.example marks callers whose relationship is inferred or chosen.

### 8.2 a2: Byte on the edge row; a separate RelationRead API

Same storage and writers as a1, but reads go through a new relations-of operation returning sc3's RelationRead (from, kind, to, evidence), and consumers that must show evidence are moved onto it.

Storage, writers, pending carry and evidence decisions as in a1. A new store read, relationsOf(entityId, kinds, direction) in src/db/search.ts, returns RelationRead[] with one row per stored relationship; findCallers/findCallees keep returning plain entities. The daemon's search.callers/callees and callers_nhop add the relationship list to their answer (or a new request returns it), the graph tools and usage.example call relationsOf and join the entities themselves.

**Rejected because:** Also meets every criterion, but every consumer that shows evidence needs a second read and a join, and the daemon requests and tools change shape more than a1's added field; its advantage (no choice between evidences of one neighbour) buys nothing for the single-kind reads the Story covers.

### 8.3 a3: Evidence in a side table keyed by edge

Edge rows stay empty; a new sub-database maps an edge key to its evidence byte, written beside every edge write and read on demand.

A new LMDB sub-database edge_evidence keyed like out_edge holds the byte; the two writers put it in the same transaction, every edge delete removes it, reads look it up per neighbour; a migration step creates the empty table (absent row = unknown).

**Rejected because:** Violates the HLD's stored form for sc3 and adds a second structure every edge removal must keep in step with.

## 9. References

- **[[c1]]** `analyze-bundle` `s1 symbol.locate: the stored relationship row and its value` — "A stored relationship is a pair of LMDB keys (out_edge from|kind|to, in_edge to|kind|from); its value is written as an empty buffer at exactly two sites, both in src/db/relations.ts: upsertResolvedRel"
- **[[c2]]** `analyze-bundle` `s1 symbol.locate: the evidence type as it stands` — "src/shared/types.ts:696 declares `type RelationEvidence = 'unknown'` (added by Story s2 t2) and RelationWrite carries `readonly evidence: RelationEvidence` (src/shared/types.ts:712). src/db/file-commi"
- **[[c3]]** `analyze-bundle` `s1 usage.example: where a relationship is decided read-from-source` — "resolveRelations (src/indexer/resolver.ts:63-118) is the per-file resolver: a relation the parser already marked resolved (DEFINES, CONTAINS, external-module IMPORTS) passes through; a CALLS whose cal"
- **[[c4]]** `analyze-bundle` `s1 usage.example: where a relationship is decided by resolution across files` — "The cross-file pass (src/indexer/cross-file-resolver.ts) writes stored relationships in four places: Pass 0 runPass0 (:204, promoteResolvedBatch at :221) completes rows whose awaited target is now sto"
- **[[c5]]** `analyze-bundle` `s1 data-model.trace: pending rows and the return of an edge to pending` — "A pending row (UnresolvedRow, src/db/graph/codec.ts:225-240) has a free-form meta record. A resolved relationship whose target is not stored is kept as an awaiting row built from the relation's meta ("
- **[[c6]]** `analyze-bundle` `s1 symbol.locate: where relationships are read` — "neighborsSync (src/db/graph/edges.ts:41-60) iterates the edge keys and yields neighbour u64s only; outNeighbors/inNeighbors (src/db/graph/edges.ts:87-117) dedupe them. findCallers/findCallees/findDefi"
- **[[c7]]** `analyze-bundle` `s1 test.locate: tests to extend` — "Relationship writers: src/db/__tests__/relations-lmdb.test.ts, relations-in-txn.test.ts, relations-awaiting-target.test.ts, relations-pending-upkeep.test.ts; the file commit: src/db/__tests__/file-com"
- **[[c8]]** `prior-artifact` `HLD-c2ba6fa62a148ed1 sc3 RelationEvidence and the s7 boundary`
- **[[c9]]** `prior-artifact` `DEF-c2ba6fa62a148ed1 Story s7 acceptance criteria ac1-ac4 and lc1`
- **[[c10]]** `step-output` `s3 alternatives.judge: a1 chosen`
- **[[c11]]** `step-output` `s8 checklist.verify: cd3 partial, alt2 partial, sbdry3 interpretation note`

## 10. Open questions

- NOTE (s8 cd3 partial): no new error type is introduced; an invalid evidence value is stored empty (reads 'unknown') and logged, never refused, following s1's never-drop rule.
- NOTE (s8 alt2 partial): alternatives were scored against ac1-ac4, lc1 and sc1-sc3; the Epic constraints k1, k5 and k6 are the ones those criteria operationalize and were not scored separately.
- NOTE (s8 sbdry3 interpretation): the HLD's 'carrying of evidence through the store's traversal reads' is read as the reads that return relationships (the single-kind find* reads and the opt-in neighbour form with evidence); closure/BFS/SCC traversals return entity sets and stay id-only. Confirm or widen before the plan.

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 do not hold · 0 could not be verified · 13 hold** · template `design-spec` · model `cli-claude:claude-sonnet-5` · reviewed 2026-11-01T18:47:36.942Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

_None._
