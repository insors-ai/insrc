<!-- insrc:artifact LLD-c2ba6fa62a148ed1-s8 -->

# LLD: E20261102c2ba6fa6:S008

## Summary

**Epic:** `complete-consistent-richer-code-index-one`
**HLD base run:** `wf-1791697214822-7bombm`
**HLD effective hash:** `85da4a2df479...`

Once a repository's graph is complete, a queued pass groups its code files into subsystems. The grouping reads the stored relationships between files (imports, calls, inheritance, references), weighted by how each was established, and gives the same groups for the same graph. Each subsystem records its member files, its connections to the other subsystems, and a summary the cheap-tier model writes when its membership is new. A daemon request returns the subsystems, and says when they rest on an incomplete or older graph. The analyzer's context gains a code-written block naming the subsystems a request touches, with their summaries and connections.

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

**Rollout phase:** Phase E — subsystems and document relationships
**Consumes:** `sc1` (IndexState), `sc3` (RelationEvidence)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The rule that a relationship with an absent target becomes pending instead of being skipped, at each of the six places in src/db/relations.ts where one is lost today (the resolved write's skip on a missing endpoint and its skip on a kind with no byte, promoteToResolved, promoteResolvedBatch, and the pending write's discard of a row without its file or repository and of a row whose repository is not registered), each either kept as pending or counted as unwritable with a reason; the set of files whose parse or commit failed in a full index, persisted with their paths until they next commit; which fields of the state are recounted on open and which are persisted and carried over; the classification of a pending relationship as awaiting-target, ambiguous or no-candidate, with the external-service rows classed apart and the two endpoint passes counted in when a full index is finished; the class is stored on the pending row itself, in its existing free-form record, so no stored form changes, a row the cross-file pass has not yet attempted counts as awaiting-target, and the recount on open reads the stored class and does not run resolution again; the extension of the cross-file pass to complete relationships awaiting a target by id, for imports and the other code-symbol kinds as well as calls and inheritance, and to follow a re-exporting file to the function it re-exports; the lookup of pending rows by the id they await, with its migration step, and the pass after a file event visiting the rows that await an entity of the files just committed; the change of the reindex request so that it deletes the repository's rows in the graph store and the vector store and builds them again from every file, in place of today's skip of unchanged files, with no separate repair request, returning to pending the relationships that other repositories hold into the deleted entities, and its queuing by the migration for every repository indexed before this change, which starts as not complete; the storing of the repository entity so that the manifest step's dependency relationships are written; the measurement on this repository, before and after a repair, of the awaiting-target, ambiguous, no-candidate and unwritable counts, with unwritable expected to be zero; the IndexState row, its migration step, its recount on open, and the derivation of repository status from it, as a completeness field returned beside the unchanged status by the daemon's status and stats requests and shown in the CLI's repository pane and in both editor plugins; and the analyzer's read of it: an analyzer lookup that reads relationships of a repository that is not complete says so in its result, with the counts, so that an answer over an incomplete graph is not returned as a plain fact. The choice, in this Story's design, of the function reached only through a re-exporting file that the repair is measured on, since the issue's own example (pickScope) has been removed from the source. Raising the log level of a refused relationship from debug is internal. Until Story s2 lands, s1 applies its rule inside the existing separate writes. — owns `sc1`
- `s2`: The extension of the existing whole-file replacement into the file commit (relationships and pending rows in the same transaction as entities; outgoing relationships of surviving entities replaced, not only those of entities that disappeared; incoming relationships of a removed entity returned to pending), the move of the indexer's refresh and delete paths and of the clean-up pass's removal of a stored file onto it, and the retirement of the separate delete-then-upsert sequence in the indexer. The handling of vectors after the commit: writing the entity row with its embedding marker empty and setting it in a second transaction only after the vector write succeeds, counting an entity with an empty marker in IndexState, comparing entity ids with the vector table on open in both directions, so that a vector left behind by a failed removal is deleted before a plain insert can meet it, and the extension of the existing reembed job to run on daemon start and after an index, with a vector write for an entity whose marker is empty made an upsert, except for an entity first allocated in the same commit, which keeps the plain insert. Three things in that job change with it: it applies the embed step's own selection instead of forcing every entity, so empty-body entities (external endpoints, module stubs) stay unselected and uncounted; its update of an embedding writes the vector first and sets the marker in a second transaction, where today it sets the marker first; and the marker carries the model of the backend that is active, not one fixed name. Which entities count as unembedded (those the embed step selects) and the separate recorded reason when the embedding backend is unavailable. The count of a file whose commit fails on a file event. The queue rule that index jobs go ahead of other jobs and that a long job yields between its units, so that a commit is not held behind a model pass. How a reader sees the old or the new set during a commit is the store's ordinary transaction isolation and needs no new mechanism. — owns `sc2`
- `s3`: The by-file and by-repository index of entity rows, its migration step that builds it for an existing store, and its upkeep. No single entity-row write exists today: there are seven raw put and remove sites across src/db/entities.ts and src/db/graph/migrations.ts, and the existing name index is kept in step by a helper each site must remember to call. This Story introduces one put and one remove function for entity rows that maintain the name index and the new index together, routes every raw site through them, and adds a test that fails when a raw put or remove appears outside them. Upkeep therefore sits beneath every caller, so that neither today's writers nor the file commit need to know of it and this Story does not depend on s2. The two reads (findEntitiesByFile, listEntitiesForRepo) keep their results and their callers; a new existence check answers whether a repository holds any entity, and the analyzer's scope check uses it.
- `s4`: The cause, which ISSUE-0d577569 records as not known, was reproduced on 2026-10-11 and is not the system's semaphore limit, which the library's message names, but the loss of the daemon's own file lock on the store's lock file, after which another process that opens and closes the store removes the store's semaphores; the daemon's next write then fails with the library's message about the limit, and its exit hangs in the library's close. What in the daemon closes a second descriptor on the lock file is not yet identified. First, therefore, the remedy that does not depend on finding it: the live store is opened by the daemon alone, and any other process is refused it. Second, a bound on the whole shutdown including the store's close, so that a close that hangs ends in an exit. Third, recording a store failure of this kind and stating it in the daemon's status. None of this is consumed by another Story.
- `s5`: The refusal, with a named error and its own code, of a search or analyze request about a repository whose status is indexing, at the analyzer's scope check and at the daemon's search requests, carrying the status and how far the run has got (files done of files selected, and when it began), read from the indexer's running job; the tools that rest on the analyzer (the workflow steps, triage, code review) pass that error on as it is. The order of the analyzer's run: the refusal of a scope the index does not hold comes before a size is announced, or the announcement says the size could not be counted. The named cause and error code for a failed read of the last-indexed time and for a failed lookup, and the three other defects of ISSUE-e2bcadd9 (the wrong provider named, the scope resolved before the cache, and failure text matched inside echoed output). This Story does not read IndexState: it works with the checks the analyzer has today, so that it stays independent of s1.
- `s6`: The in-process matcher of the gitignore grammar over nested ignore files and its conformance test against git; the move onto the one filter of every site that reads the list today in src/indexer/index.ts (the full walk, the start-up scan for changed files, the file event, the clean-up pass, and the two places that seed the list when a repository is registered), of the watcher, and of the analyzer's reader, its two exploration walkers and its infra walker (src/analyze/runtimes/infra/_shared.ts), each of which has its own list of names today, and of the indexer's source-root detection (src/indexer/source-roots.ts), whose own list would otherwise hide a package in a directory the filter includes; a search of the source for such lists found five more, in the daemon's four file-search tools (glob, grep, list-dir, recent under src/daemon/tools/builtins/search) and in the review probe (src/workflow/review/probe.ts), which search the working tree as text, do not decide what the index holds, and are deliberately left as they are; the filter keeps answering for a directory that holds an included file, as the analyzer's reader does now; the retirement of the bare-name list and of the ignore entry in the repository's .insrc config; the two built-in exclusions (generated or minified files, the .insrc directory) applied inside the filter so that the full walk and the file event no longer differ on them; the handling of a change to an ignore file as an event that removes and adds files, and the comparison by content hash of the clone's exclude file and the global ignore file, which the watcher cannot see, whenever the filter is used; the queued step that proposes a root ignore file with the cheap-tier model when a repository is added without one, its fallback, and the rule that an existing file is never written. Two points were decided by the stakeholder: the filter honours all three of git's ignore sources (the .gitignore files, the clone's exclude file, the user's global ignore file), and a file git tracks is indexed even when a rule matches it, so the filter takes git's list of tracked files as an input and a plain folder is filtered by the rules alone. — owns `sc4`
- `s7`: The one-byte encoding of evidence as the value of a relationship row; the points in the per-file resolver and the cross-file pass that decide 'extracted' or 'inferred' ('chosen' is reserved and not written, since an ambiguous relationship stays pending with its candidates); the passing of evidence as an argument to the store's resolved write and promote operations, so that the two endpoint passes write 'inferred' and the manifest step writes 'extracted' and no relationship written after this change reads 'unknown'; the carrying of evidence through the store's traversal reads and the daemon's caller and callee requests; the marking of inferred and chosen relationships in the analyzer's lookups and answers. No migration rewrites existing rows, since an empty value reads as 'unknown'. — owns `sc3`
- `s9`: One reader per added language (Rust, C#, C, C++) in the existing parser registry with a guarded load, as the Kotlin reader has; the structured reading of SQL in place of the whole-file document, keeping the document entity for retrieval; any entity kinds this needs, appended to the fixed byte table without renumbering; the additions to the Language union; the daemon request that lists the languages read and why any was skipped. Each language can be delivered on its own.
- `s10`: The reading of links and references between documents, and from a document to code, as relationships of the existing REFERENCES kind written in the file commit with evidence 'extracted'; the queued mid-tier pass over new or changed documents and its own table of model-proposed relationships; the hand-checked set, the measurement, and the recorded figures that switch the capability on or leave it off; the merging of model-proposed relationships into reads with evidence 'model'; the status line when no CLI provider is available.
- `s11`: Private implementation of s11: The step tools run inside the daemon, and the MCP server opens no store
- `s12`: Private implementation of s12: Every supported parser records the calls its code makes, and calls resolve within a package
- `s13`: Private implementation of s13: Settling file changes does work proportional to the changed files, never a scan of the repository or the store

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `index.subsystems`

```typescript
request 'index.subsystems' (params: { repoPath: string }) => SubsystemsAnswer
```

**Parameters:**
- `repoPath: string` — The registered repository.

**Returns:** `SubsystemsAnswer` — { repoPath; generation: number; computedAtGeneration: number | null; graphComplete: boolean; stale: boolean; note?: string; subsystems: SubsystemView[] }, where SubsystemView = { id; name; files: string[]; entityCount: number; summary: string | null; connections: { to: string; weight: number; kinds: Record<RelationKind, number> }[] }. The note says 'the groups rest on an incomplete graph' when graphComplete is false, 'the groups rest on an older graph' when computedAtGeneration < generation, and 'not grouped yet' when nothing is stored.

**Errors:**
- `RepoNotRegisteredError` when repoPath is not a registered repository (answered { error }, as repo.stats does)

**Preconditions:**
- Classed 'indexing' in methodClasses, beside repo.stats (src/daemon/threads/method-class.ts:46).

**Postconditions:**
- Read-only: reads IndexState and the two subsystem tables.
- Every code entity of the repository is in exactly one subsystem: each code file is in exactly one, and an entity is in its file's.

### 2.2 `groupSubsystems`

```typescript
function groupSubsystems(graph: FileGraph): SubsystemGroup[]
```

**Parameters:**
- `graph: FileGraph` — { files: string[] (code files, repo-relative); edges: { a: string; b: string; weight: number; kinds: Record<RelationKind, number> }[] }, built from the stored relationships.

**Returns:** `SubsystemGroup[]` — A partition of graph.files: { id: string (sha256 of sorted member paths, hex-32); name: string (the longest common directory of the members, or the single file's path); files: string[] (sorted) }, sorted by id. Connections are computed from the same edges.

**Preconditions:**
- Pure: no store access, no clock, no randomness.

**Postconditions:**
- The same graph gives the same groups (ac2): nodes are visited in path order, ties go to the smaller group, and aggregation repeats until no move improves modularity.

### 2.3 `runSubsystemPass`

```typescript
function runSubsystemPass(opts: { repoPath: string; provider?: LLMProvider }): Promise<SubsystemPassResult>
```

**Parameters:**
- `repoPath: string` — The repository to group.
- `provider: LLMProvider` _(optional)_ — The summariser provider; defaults to buildSummariserProvider(cfg) (tiers.cheap). Injected in tests.

**Returns:** `Promise<SubsystemPassResult>` — { ran: boolean; reason?: 'graph-incomplete' | 'up-to-date'; generation: number; subsystems: number; summariesWritten: number; summariesFailed: number }

**Errors:**
- `SubsystemSummaryError` when a summary call fails: logged and counted, and the subsystem keeps summary null; the pass goes on

**Preconditions:**
- Runs as the queued job { kind: 'subsystems', repoPath } in the summary lane (src/daemon/queue.ts:35), which starts only while the index lane is idle.

**Postconditions:**
- Does nothing unless readIndexState(repoPath).graphComplete (lc1); does nothing when the stored computedAtGeneration equals the state's generation.
- Builds the FileGraph from the stored relationships between code entities of different files of the repository: IMPORTS, CALLS, INHERITS, IMPLEMENTS and REFERENCES. Weight by kind: INHERITS and IMPLEMENTS 2, the rest 1. Multiplied by evidence: extracted 1, inferred 0.8, unknown 0.6. Plus 0.1 between files of one directory.
- Writes the subsystem and subsystem_by_file rows in one transaction, stamped computedAtGeneration = the generation read, replacing the previous set; a subsystem whose id was already stored keeps its summary.
- Then writes a summary for each subsystem with summary null, one completeStructured call at a time (never Promise.all), yielding to the queue between calls. Before each write it re-reads the generation; if it advanced, it stops (a new pass is queued).

### 2.4 `readSubsystems`

```typescript
function readSubsystems(repoPath: string, opts?: { files?: readonly string[] }): Promise<StoredSubsystems>
```

**Parameters:**
- `repoPath: string` — The repository.
- `files: readonly string[]` _(optional)_ — Only the subsystems containing these files (absolute or repo-relative), through subsystem_by_file.

**Returns:** `Promise<StoredSubsystems>` — { computedAtGeneration: number | null; subsystems: SubsystemView[] }

**Preconditions:**
- Used by the index.subsystems request and by the analyzer.

**Postconditions:**
- Reads only the two subsystem tables.

### 2.5 `withSubsystemContext`

```typescript
function withSubsystemContext(bundle: AnalyzeContextBundle, repoPath: string | null, scopePath: string | undefined): Promise<AnalyzeContextBundle>
```

**Parameters:**
- `bundle: AnalyzeContextBundle` — The bundle runShaper is about to return to its caller, on every path: a cache hit (src/analyze/context/driver.ts:462-465), the pipeline path after writeBundle (:549-557), and the legacy path after writeBundle (:620-626).
- `repoPath: string | null` — The bundle's repository (meta.repoPath).
- `scopePath: string | undefined` _(optional)_ — The request's scope path, when it names a file or directory.

**Returns:** `Promise<AnalyzeContextBundle>` — The bundle with a 'Subsystems' block appended to its structure layer. For each subsystem holding a code file under scopePath, or a file the bundle cites as path:line: its name, summary, connections (named subsystems, with weights) and member paths. It is followed by the IndexState note when the groups rest on an incomplete or older graph.

**Preconditions:**
- Applied at serve time, after any cache read or write: runShaper's result is wrapped as it returns, so the block is never written into the bundle cache and is computed from the stored subsystems on every serve, cache hits included. A subsystem pass that completes after a bundle was cached is therefore reflected on the next request, without invalidating the cache.

**Postconditions:**
- Code-written, never by a model. Every name in it is a stored subsystem with stored member paths (ac3).
- The bundle is returned unchanged when repoPath is null or no subsystem is stored. The block never removes or rewrites existing layer text.
- The cached bundle (writeBundle, readBundle) never contains the block, so the cache key and staleness rules (servedFromCache / isStaleByIndexer, src/analyze/context/driver.ts:407-420) are unchanged.

### 2.6 `MIGRATION_V7_TO_V8`

```typescript
const MIGRATION_V7_TO_V8: MigrationStep
```

**Returns:** `MigrationStep` — Opens the 'subsystem' and 'subsystem_by_file' databases; SCHEMA_VERSION becomes 8.

**Preconditions:**
- Applied on open, without a re-index (k5).

**Postconditions:**
- Adds tables only; existing rows are untouched. Repositories have no subsystems until their next pass.

### 2.7 `IndexJob.subsystems`

```typescript
type IndexJob = ... | { kind: 'subsystems'; repoPath: string }
```

**Parameters:**
- `repoPath: string` — The repository.

**Returns:** `IndexJob` — A summary-lane job; a queued one per repository is not duplicated.

**Postconditions:**
- Enqueued after a full index, and after a settle or clean-up, when the repository's state is graph-complete at a generation newer than its stored subsystems.

## 3. Data model changes

### 3.1 `subsystem (new table)` — new

Key: (repoId, subsystem id). Value: { name; files: repo-relative paths (sorted); entityCount; connections: { to: subsystem id; weight; kinds }[] (sorted by to); summary: string | null; summaryModel?: string; computedAtGeneration }. Relationship: a subsystem has 1..n member files; each connection points to another subsystem of the same repository (directed by edge direction, weights summed per pair). Dropped and rewritten whole by each pass; never written by the file commit.

```
+ db 'subsystem'
```

**Call sites:**
- `src/db/graph/migrations.ts`
- `src/db/graph/store.ts`

### 3.2 `subsystem_by_file (new table)` — new

Key: (repoId, repo-relative file path). Value: subsystem id. Exactly one row per code file of the repository (cardinality file 1 -> 1 subsystem, subsystem 1 -> n files). An entity's subsystem is its file's. Rewritten whole with the subsystem table.

```
+ db 'subsystem_by_file'
```

**Call sites:**
- `src/db/graph/migrations.ts`
- `src/db/graph/store.ts`

### 3.3 `SCHEMA_VERSION` — field-modify

7 -> 8 with MIGRATION_V7_TO_V8 on the existing chain (k5). Current behaviour: SCHEMA_VERSION 7 from s9; the namespace inventory test counts the open databases and moves from 37 to 39.

**Call sites:**
- `src/db/graph/store.ts`
- `src/db/graph/migrations.ts`
- `src/understanding/__tests__/storage.test.ts:35`

## 4. Diagrams

- [ER model](docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S008/er-model.html)

## 5. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | readIndexState(repoPath).graphComplete gates the pass (lc1). Its generation is stamped as computedAtGeneration and compared on read to say 'stale' (the HLD's DerivedStamp). completenessOf gives the request's note. |
| `sc3` | consumes | outNeighbors(..., { withEvidence: true }) supplies each relationship's evidence, which weights its edge (extracted 1, inferred 0.8, unknown 0.6). |

## 6. Error paths

**Error cases**

- **A summary call fails (provider down, schema retries exhausted, CLI not signed in)** (recoverable)
  - Detection: completeStructured throws inside runSubsystemPass's per-subsystem loop
  - Response: Logged with the subsystem id, counted in summariesFailed; the subsystem keeps summary null and the next pass retries it
  - User impact: That subsystem shows no summary until the next pass; grouping and connections are unaffected
- **The graph changes while summaries are being written** (recoverable)
  - Detection: Before each summary write, runSubsystemPass re-reads readIndexState(repoPath).generation and compares it with the generation it grouped
  - Response: Stops writing; the enqueue on the new generation runs a fresh pass
  - User impact: Summaries for the old grouping may be partial; the request reports the groups stale until the new pass
- **The pass is asked to run on an incomplete graph** (recoverable)
  - Detection: readIndexState(repoPath).graphComplete is false
  - Response: Returns { ran: false, reason: 'graph-incomplete' } and writes nothing (lc1)
  - User impact: Any stored groups stay from the older complete generation and are reported stale or incomplete
- **The store transaction writing the two tables fails** (recoverable)
  - Detection: withWriteTxn throws
  - Response: Nothing is written (one transaction), the job fails and is logged; the next generation's job retries
  - User impact: The previous groups remain

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A repository with no cross-file relationships | Groups follow directories (the 0.1 same-directory edges); every code file is still in exactly one subsystem |
| A code file with no relationships alone in its directory | Its own single-file subsystem, named by its path |
| Two runs over the same stored graph | Identical ids, names, members and connections (ac2) |
| A file added to an existing subsystem | That subsystem's id changes (its members changed), so its summary is rewritten; untouched subsystems keep their ids and summaries |
| A repository that is a DEPENDS_ON closure member of another | Grouping covers only the repository's own files; relationships into other repositories are not edges |
| A relationship to a module stub or an external endpoint | Not an edge: only relationships between code entities of two files of the repository count |
| An analyzer request whose scope is a directory with no code files, or a repository not grouped yet | The bundle is returned unchanged |
| index.subsystems on a repository whose graph is incomplete but whose earlier groups are stored | Returns those groups with graphComplete false and the note 'the groups rest on an incomplete graph' (ac5) |

**Invariants to preserve**

- A derived pass reads graphComplete and stamps the generation it read; a reader comparing generations says when the derived data is stale [[c1]]
- Relationships are read with their evidence (outNeighbors withEvidence), never rewritten by the pass [[c2]]
- Summary-lane jobs start only while the index lane is idle, and model calls are made one at a time [[c3]]
- The analyzer bundle's existing layers keep their text: the subsystem block is appended, nothing is removed [[c4]]
- Summaries use the cheap tier (k9's 'local model') [[c5]]
- A store change arrives as a step on the migration chain, applied on open without a re-index [[c6]]

## 7. Test strategy

**Test framework:** `node:test with node:assert/strict, run by tsx (npx tsx --test), over real temporary LMDB stores (useTemporaryLance) and the real IndexerService, as in src/indexer/__tests__/sql-index.test.ts; model calls through an injected recording LLMProvider`

**Test levels**

- **unit** — groupSubsystems: a partition of the files; deterministic for one graph (run twice, and with the input edges shuffled); ids are the hash of the sorted members; directory edges place unconnected files; names are the longest common directory
  - Subjects: `subsystem grouping`
- **integration** — runSubsystemPass over a real store: the file graph is built from stored relationships weighted by evidence; tables are written stamped with the generation; it does nothing on an incomplete graph; summaries come from an injected provider, one call at a time, only for new ids; a failure leaves summary null; a generation change stops the summaries
  - Subjects: `subsystem pass over a stored graph`
  - Fixtures: `a temporary store with a registered repository, entities in several files and relationships with evidence`, `a recording provider that counts concurrent calls`
- **integration** — Through IndexerService and the request: a fully indexed repository gets subsystems; every code entity is in exactly one; connections are listed; an incomplete graph is reported
  - Subjects: `index.subsystems through IndexerService`
  - Fixtures: `a temporary repository of a few TypeScript files in two directories`
- **integration** — The analyzer: withSubsystemContext adds, for a request scoped to one module, the subsystem's name, summary, connections and member paths, all from stored rows; existing layer text is kept; nothing changes without stored groups
  - Subjects: `analyzer subsystem context`
- **smoke** — On the installed daemon: index this repository, run the pass, request index.subsystems, and build one analyzer context
  - Subjects: `installed daemon: subsystems`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `integration: index.subsystems through IndexerService -- every code entity is in exactly one subsystem and each lists its connections` |
| `ac2` | `unit: subsystem grouping -- the same graph, run twice and with its edges shuffled, gives the same groups`, `integration: subsystem pass over a stored graph -- two passes over one generation write identical rows` |
| `ac3` | `integration: analyzer subsystem context -- a request about one module names its subsystem, summary and connections, each a stored row` |
| `ac4` | `integration: subsystem pass over a stored graph -- summaries go through the summariser (cheap-tier) provider, never two calls at once` |
| `ac5` | `integration: index.subsystems through IndexerService -- an incomplete graph is reported as 'the groups rest on an incomplete graph'` |

## 8. Migration

**State before:** The store is at SCHEMA_VERSION 7 (src/db/graph/store.ts, bundle c6) with 37 named databases; no subsystem data exists. The full index ends by enqueuing the doc-summary and backfill jobs (src/indexer/index.ts:848-849, bundle c3). The analyzer bundle has seven layers, with no subsystem context (src/analyze/context/types.ts:40, bundle c4).

**State after:** SCHEMA_VERSION 8 adds 'subsystem' and 'subsystem_by_file'. A summary-lane job { kind: 'subsystems' } groups a graph-complete repository and writes summaries for new subsystems. The request 'index.subsystems' returns them with completeness and staleness, and the analyzer's structure layer gains a code-written subsystem block when groups are stored.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add MIGRATION_V7_TO_V8: open the two new databases; SCHEMA_VERSION 7 -> 8. No existing row is touched — ✕ non-rollbackable
2. Add the 'subsystems' job kind to the queue's summary lane, and enqueue it after a full index, a settle and a clean-up when the state is graph-complete at a newer generation — ↩ rollbackable
3. Add the 'index.subsystems' request (classed 'indexing') and the analyzer's subsystem block — ↩ rollbackable
4. Existing repositories gain subsystems on their next full index or settle that leaves them graph-complete; nothing is backfilled at migration — ↩ rollbackable

**Backward compat:** Additive. The new request, job kind and tables are new; no request, field or layer is removed or renamed. The analyzer's structure layer may carry more text. An older daemon cannot open a store migrated to 8, as with every forward step of the chain.

## 9. Alternatives considered

### 9.1 a1: File-level deterministic modularity grouping, stored tables, queued pass, code-written context block — **CHOSEN**

Group a complete repository's code files with a deterministic Louvain-style modularity pass over an evidence-weighted file graph. Store membership and connections in their own tables, write summaries with the cheap-tier model only for new memberships, answer a daemon request, and add a code-written subsystem block to the analyzer's structure layer.



### 9.2 a2: Directory-tree grouping

Subsystems are directories (top source directories, merged where they are small), and connections are counted from stored relationships between them.



**Rejected because:** Violates sc3: groups come from the directory layout and evidence plays no part (FR001 asks for grouping from stored relationships).

### 9.3 a3: Grouping computed per request, no tables

Compute the groups when they are requested or when the analyzer builds a context, and keep nothing stored.



**Rejected because:** Violates ac4: summaries would need model calls on the request path, not queued one at a time.

### 9.4 a4: Entity-level label propagation

Group entities, not files, by deterministic label propagation over entity relationships.



**Rejected because:** Partial on ac2: label propagation needs a round cap that the result then depends on, and entity graphs are an order of magnitude larger.

## 10. References

- **[[c1]]** `code` `src/db/index-state.ts:44` — "export async function readIndexState(repoPath: string): Promise<IndexState | undefined> {"
- **[[c2]]** `code` `src/db/graph/edges.ts:105` — "export async function outNeighbors(from: bigint, opts: NeighborOpts & { readonly withEvidence: true }): Promise<NeighborRelation[]>;"
- **[[c3]]** `code` `src/indexer/index.ts:848` — "this.queue.enqueue({ kind: 'doc-summarise-repo', repoPath });"
- **[[c4]]** `code` `src/analyze/context/driver.ts:599` — "const bundle: AnalyzeContextBundle = {"
- **[[c5]]** `code` `src/analyze/context/shaper-provider.ts:366` — "export function buildSummariserProvider(cfg: AnalyzeConfig, overrides?: Pick<ShaperProviderOverrides, 'registry'>, execution?: ConnectionExecutionContext): LLMProvider {"
- **[[c6]]** `code` `src/daemon/threads/method-class.ts:46` — "['repo.stats', 'indexing', false],"
- **[[c7]]** `code` `src/config/role-taxonomy.ts:94` — "// (C) Indexing — PERIPHERAL → cheap (the cheapest CLI model by default)."
- **[[c8]]** `code` `src/daemon/queue.ts:35` — "job.kind === 'doc-summarise-repo' || job.kind === 'doc-summarise-entity';"
- **[[c9]]** `code` `src/analyze/context/types.ts:108` — "export type BundleLayerName ="

## 11. Open questions

- NOTE (s8 cd1 partial): index.subsystems, groupSubsystems, runSubsystemPass, readSubsystems, withSubsystemContext, MIGRATION_V7_TO_V8 and the 'subsystems' job kind are new names this Story introduces. Its boundary owns the request, tables and pass, and it owns no shared contract.
- NOTE (s8 alt2 partial): alternatives were scored against ac1-ac5, sc1 and sc3. The Epic constraints the criteria operationalize (k1-k4, k9) were not scored separately, as on s2/s7/s9.
- RESOLVED (user decision 2026-11-02): subsystem summaries use the cheap tier, through buildSummariserProvider, as document summaries do, whatever runner the tier is configured with. ac4's 'the local model' and k9's 'local model' are read as 'the cheap-tier model'; calls stay one at a time. The user's direction is that the local model is to be removed in the future, so no Ollama-specific path is added.

## Resolved questions

- `qa64cd4f3` — NOTE (s8 cd1 partial): index.subsystems, groupSubsystems, runSubsystemPass, readSubsystems, withSubsystemContext, MIGRATION_V7_TO_V8 and the 'subsystems' job kind are new names this Story introduces. Its boundary owns the request, tables and pass, and it owns no shared contract.
  - **resolved**: Accept as LLD-concrete (adopt as canonical) — These are s8's own names (its boundary owns the request, tables and pass); the plan builds them. Same default as the equivalent note on s9, stated to the user 2026-11-02. _(2026-11-02T09:16:46.359Z)_
- `qf13df71f` — NOTE (s8 alt2 partial): alternatives were scored against ac1-ac5, sc1 and sc3. The Epic constraints the criteria operationalize (k1-k4, k9) were not scored separately, as on s2/s7/s9.
  - **resolved**: Defer and flag as known gap — As for the same note on s2, s7 and s9: k1-k4/k9 are the constraints ac1-ac5 operationalize (the DEF's own 'operationalizes' fields), so their scores follow from the criteria. Default stated to the user 2026-11-02. _(2026-11-02T09:17:42.283Z)_

## Citations

- **[[c1]]** `code` `src/db/index-state.ts:44` — "export async function readIndexState(repoPath: string): Promise<IndexState | undefined> {"
- **[[c2]]** `code` `src/db/graph/edges.ts:105` — "export async function outNeighbors(from: bigint, opts: NeighborOpts & { readonly withEvidence: true }): Promise<NeighborRelation[]>;"
- **[[c3]]** `code` `src/indexer/index.ts:848` — "this.queue.enqueue({ kind: 'doc-summarise-repo', repoPath });"
- **[[c4]]** `code` `src/analyze/context/driver.ts:599` — "const bundle: AnalyzeContextBundle = {"
- **[[c5]]** `code` `src/analyze/context/shaper-provider.ts:366` — "export function buildSummariserProvider(cfg: AnalyzeConfig, overrides?: Pick<ShaperProviderOverrides, 'registry'>, execution?: ConnectionExecutionContext): LLMProvider {"
- **[[c6]]** `code` `src/daemon/threads/method-class.ts:46` — "['repo.stats', 'indexing', false],"
- **[[c7]]** `code` `src/config/role-taxonomy.ts:94` — "// (C) Indexing — PERIPHERAL → cheap (the cheapest CLI model by default)."
- **[[c8]]** `code` `src/daemon/queue.ts:35` — "job.kind === 'doc-summarise-repo' || job.kind === 'doc-summarise-entity';"
- **[[c9]]** `code` `src/analyze/context/types.ts:108` — "export type BundleLayerName ="
