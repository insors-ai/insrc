<!-- insrc:artifact HLD-c2ba6fa62a148ed1 -->

# HLD: complete-consistent-richer-code-index-one

## Summary

Every change to a file's rows in the index goes through one transactional commit in the store, and a relationship whose target is not stored yet is kept as pending instead of being dropped. Each repository carries a recorded completeness state that status, the analyzer and every enrichment step read, so an index that is not complete says so. Enrichment (how a relationship was established, subsystems, document relationships) is layered on top: evidence is written with the relationship, and the rest runs as queued passes that write their own tables and never touch the commit.

## Contents

1. [Problem context](#1-problem-context)
2. [Framework summary](#2-framework-summary)
3. [Architecture shape](#3-architecture-shape)
4. [Diagrams](#4-diagrams)
5. [Shared contracts](#5-shared-contracts)
6. [Story boundaries](#6-story-boundaries)
7. [Non-functional targets](#7-non-functional-targets)
8. [Rollout](#8-rollout)
9. [Alternatives considered](#9-alternatives-considered)
10. [References](#10-references)
11. [Feedback](#11-feedback)

## 1. Problem context

> See **DEF-c2ba6fa62a148ed1** § 1. Problem

## 2. Framework summary

Three layers, each depending only on the one below. Layer 1, the file commit: the store has one write operation for a file, which in a single LMDB transaction replaces the file's entities, replaces its relationships and its pending relationships, and advances the repository's generation and completeness counters. It grows out of the existing whole-file replacement (reindexFile), which already replaces a file's entities in one transaction but removes relationships only for entities that disappeared from the file; the commit goes further and replaces the outgoing relationships of every entity of the file. The indexer's refresh, the delete event and the repair all call it; a file is selected for it by one filter built from the repository's ignore files. A relationship is never dropped in the commit: when its target is not stored it becomes a pending row, and pending rows are completed only by the passes that own them: the cross-file pass for code symbols, and the two endpoint passes of the external-services Epic for theirs. Layer 2, the recorded state: one row per repository holds the generation and what is known to be incomplete (relationships awaiting a target that is in an indexed repository, relationships that could not be written, entities without vectors). The four repository status values keep their meaning; completeness is a separate field read from this row and shown wherever status is shown, so a repository with anything outstanding does not read as fully ready. Layer 3, derived data: evidence is a one-byte value on the relationship row, written in the commit, by the cross-file pass and by every other writer of a stored relationship; subsystem grouping, subsystem summaries and model-proposed document relationships are queued passes that start only from a repository whose state is complete, write their own tables, and stamp what they wrote with the generation it was computed from. All new stored data arrives as steps on the existing migration chain (SCHEMA_VERSION 4 onward); no existing edge key or kind byte changes.

## 3. Architecture shape

FILE SELECTION. One filter per repository decides whether a path is indexed. It is built from git's own ignore sources (every .gitignore file in the repository's tree, each applying to its own directory and below, the clone's exclude file, and the user's global ignore file) by one in-process matcher of the gitignore grammar. Two built-in exclusions stand beside git's sources, by the stakeholder's decision, and are applied by the filter at every place that selects files, in a repository and in a plain folder alike: a generated or minified file, by the pattern the full walk applies today and the file event does not (isGeneratedOrMinified in src/indexer/index.ts), and anything in the daemon's own .insrc directory, tracked or not, which holds the daemon's working records and is left out today by the built-in list. The watcher's own subscription keeps leaving out .git and .insrc, so their events never reach the filter. The matcher also copies what git does without any rule: the contents of a .git directory are never listed, and a nested repository is treated as git treats it and not descended into. In a repository under version control a file that git tracks is included even when a rule matches it, as git itself treats it, and the filter takes git's list of tracked files as an input for that; in a plain folder there is no such list and the rules alone decide. The same filter object is used by every place that selects files, in a repository under version control and in a plain folder alike: the full walk, the start-up scan for changed files, the single file event, the watcher, and the clean-up pass that removes stored files it finds ignored, which would otherwise delete files the new filter includes. The analyzer has its own readers: src/analyze/context/repo-ignore-filter.ts asks git and is permissive outside it, two exploration walkers fall back to their own lists of names (src/analyze/explore/concept-resolve.ts and src/analyze/explore/module-profile.ts), and the infra walker has another (src/analyze/runtimes/infra/_shared.ts). The indexer's detection of source roots (src/indexer/source-roots.ts) walks with a list of its own as well, and its result feeds the cross-file pass, so a package under a directory that the list names would be indexed and yet never found as a source root. All five move onto the same filter, so that what the analyzer walks is what the index holds. There is deliberately one matcher and not git for the walk plus a matcher for events: two implementations are how the present disagreement arose. Its agreement with git is held by a conformance test against git's own answer on fixtures. A change to a .gitignore file inside the repository is itself an event; the clone's exclude file lies inside the .git directory the watcher leaves out and the global ignore file lies outside every repository, so no event can arrive for them, and their content is compared by hash whenever the filter is next used (each full index, clean-up pass and start-up scan). In both cases the filter is rebuilt, the file set is compared, and files that left or entered are committed as removals or refreshes. The bare-name list in the repository's .insrc config and the built-in list stop deciding anything. When a repository is added with no .gitignore at its root, a queued step proposes one with the cheap-tier model from the repository's file names and manifests, writes it, and only then lets the first index run; on a failed call a plain default is written and the result says so.

FILE COMMIT. The indexer parses a file, resolves what it can, and hands the store one FileCommit: the file's entities and its relationships, each relationship either with a stored target or as a pending reference. The store applies it in one write transaction: entity rows replaced (with the by-file and by-repository index kept in step beneath the commit, in the store's entity-row put and remove), the outgoing relationships of every entity of the file removed, surviving entities included, and the new set written with their evidence byte, incoming relationships of a surviving entity left in place, an incoming relationship whose target entity is removed turned back into a pending row for its source so that it is completed again if the target returns, pending rows for the file replaced, generation and counters advanced. A relationship the resolver marked resolved whose target row is absent is written as pending with the target's id, not skipped; that is the change that ends the loss in ISSUE-12f70133. The same rule holds at every place a relationship can be lost today, all in src/db/relations.ts: the resolved write, the two promote operations of the pending queue (which today remove the pending row even when the edge could not be written), the pending write (which today discards a row that lacks its file or repository, which the commit supplies, and a row whose repository is not registered), and the resolved write's skip of a relationship whose kind has no byte. A row the store still cannot keep is counted as unwritable, never dropped silently. Deleting a file is a commit with no entities; that covers the delete event and also the clean-up pass, whose removal of a stored file that is absent or left out (removeStoredFile in src/indexer/index.ts) is two separate writes today and becomes the same commit, so that incoming relationships return to pending and the generation advances there too. Two removals are not of a file and stay outside the commit: the removal of external endpoints that nothing refers to any more advances the generation in its own transaction, and the removal of a repository removes its state row with its rows. Parsers also return, in a file's entity list, shared module stubs that are not of the file: they carry no repository and no file, and the existing entity write routes them to the reserved shared-modules rows, which the whole-file replacement does not do today. The commit keeps that routing: a module stub is ensured to exist under the shared-modules row, is never removed by a commit, is not among 'every entity of the file', and so never enters the repository's entity reads or its by-repository index. Vectors are written after the commit as today; today the entity row is marked as embedded inside the transaction, before its vector is written, so a failed vector write leaves no trace in the graph store. The commit instead writes each new or changed entity row with its embedding marker empty, and a second small transaction sets the marker only after the vector write has succeeded. An entity with an empty marker is counted as unembedded in the repository's state, and the existing reembed job, which already reads the entities with an empty marker, is extended to run on daemon start and after each index and to write what is missing. Because an empty marker no longer means that no vector row exists (a changed entity keeps its old vector while its row is rewritten, and a crash can fall between the vector write and the marker), a vector write for an entity with an empty marker is an upsert, with one exception that keeps the cost of a first index where it is today: an entity whose id was first allocated in the same commit cannot have a vector row, and its vector is written by the plain insert. The code chose the plain insert for first embeddings on purpose, because an upsert against a growing vector table costs more with every call; the upsert is therefore confined to changed entities and to the backfill. The separate deleteEntitiesForFile / upsertEntities / upsertRelations sequence stops being used by the indexer.

COMPLETION AND REPAIR. The cross-file pass (runCrossFileResolver) remains the place pending code-symbol relationships become stored ones, now including those awaiting a target by id and those reaching a function through a re-exporting file. Two things in that pass change for it. It handles only calls and inheritance today and skips every other kind, so completion by id is extended to imports and the other code-symbol kinds. And after a file event it runs only over the pending rows whose source is a file touched in that window, so a relationship returned to pending under an untouched source file would never be visited when its target comes back: the pass therefore also visits the pending rows that await, by id, an entity of the files committed in the window, which needs pending rows to be found by the id they await. Pending rows of the four external-service kinds (CALLS_HTTP, PUBLISHES_TO, SUBSCRIBES_TO, CALLS_RPC) belong to Epic 914cbf5ea9026b92 and are completed by its two endpoint passes (src/indexer/external-endpoints.ts and src/indexer/messaging-endpoints.ts), which run after the cross-file pass. This Epic does not redesign those passes: their endpoint entities stay written outside the file commit, their rows are classed apart, and the relationships they store carry evidence 'inferred'. One more writer is outside the commit: the manifest step writes a DEPENDS_ON relationship for every dependency from an entity that stands for the repository itself, and that entity is never stored today, so every one of those writes is skipped and the dependency relationships have never existed in the graph. The repository entity is stored when the repository is indexed, so that they are written, with evidence 'extracted'; left as it is, each would count as unwritable for ever and no repository with a manifest would read complete. REINDEX. Today the reindex request (repo.reindex, the one behind the CLI's reindex key and command) queues a job that is called full and is not: it lists every file but skips each one whose stored content hash is unchanged, so on this repository it re-read 12 files of 2,252 and could not restore anything a skipped file had lost; only a single file event forces a re-read. By the stakeholder's decision there is one command and it indexes everything from scratch: a reindex first calls the delete operations on both stores for the repository, then builds again. The delete is what removing a repository does today for its index, without touching the registry row, the sessions or the conversation turns: the repository's entities with the relationships attached to them, their vectors, their document summaries and the cached lookups (deleteEntitiesForRepo in src/db/entities.ts) and its pending relationships (deleteUnresolvedForRepo in src/db/relations.ts); the tables this Epic adds for the repository (its state counts, its subsystem groups and summaries, its model-proposed document links) are cleared with them. The build then commits every selected file, embeds every entity, and runs the cross-file pass and the endpoint passes; the derived passes follow when the graph is complete. Three consequences are accepted with the decision. While a reindex runs the repository's status is indexing, and, by the stakeholder's decision, a search or analyze request about it is refused with a named error that states the indexing state; no answer is given from a half-built index. A reindex is queued at once when it is asked for. Only the repository being reindexed is offline: it goes offline when its own run starts and deletes its rows, it stays offline until that run has completed, a run that ends in an error included, and requests about every other repository are answered as usual, those waiting in the queue for their own reindex among them. This holds for any run that sets the status to indexing, a first index included. Today the analyzer refuses only when the repository holds no entity at all, and the daemon's search requests (search.query, search.callers, search.callees) make no check, so a request during a run is answered from whatever has been written so far. Every vector is computed again and every document summary is written again by its model, so a reindex costs embedding time and model calls in proportion to the whole repository. And a relationship from another repository into this one is attached to an entity that is deleted: the delete returns such a relationship to pending for its source, as the file commit does, so that it is completed again when the entity is rebuilt and is not lost. There is no separate repair request; where this design says repair it means this reindex, including the one the migration queues. Catching up on changed files without a reindex stays as it is, through the start-up scan for changed files and file events.

STATE AND STATUS. The per-repository state row separates four kinds of pending relationship: of an external-service kind, owned by the endpoint passes (counted apart, and a cause of incompleteness only when an endpoint pass failed); and, for code symbols, awaiting a target that exists in an indexed repository or not yet attempted by the cross-file pass (incomplete), ambiguous among candidates (reported apart with its candidates and not incompleteness: nothing in the resolver chooses among candidates today, this Epic adds no choosing rule, and a guessed target would be a stored wrong relationship), and with no candidate anywhere in the dependency closure, such as a call into a library that is not indexed (not incompleteness; counted and reported apart). RepoStatus keeps its four values and their meaning, so nothing that branches on status changes (the indexer's start-up decision, the document generator's readiness checks, the stored status type, the CLI's repository pane). Completeness is a separate field beside it, returned by the daemon's status and stats requests and shown next to the status in the CLI and in both editor plugins. A full index counts as finished only when the full pass, the cross-file pass and both endpoint passes have ended; an endpoint pass that fails leaves the repository incomplete with that reason. A file whose parse or commit throws, in a full index or on a file event, is today logged and skipped while the repository is still set ready; it is instead counted, with its path, until the file next commits, and the repository is incomplete while the count is not zero. Completeness has two parts. The graph is complete when nothing above is outstanding; the derived passes need only that. Vectors are complete when every entity the embed step selects has its vector: an entity with an empty body, such as an external endpoint, is never selected and never counted. When the embedding backend is disabled or cannot be reached the state records that as its own reason; it is reported, it does not make the repository incomplete, and it does not hold back the derived passes. Existing rows are counted by the same rule on the first recount. The state has two kinds of field. The counts of pending relationships and of unembedded entities can be read back from the tables, are maintained in the commit's transaction, and are recounted when the daemon opens the store. What cannot be read back from the tables is persisted in the state row and carried over a restart, never reset by the recount: the generation, whether a full index finished, whether an endpoint pass failed, the count of unwritable relationships, and the set of files that could not be committed, stored with their paths and removed from the set when the file next commits or is removed. A wrong 'complete' therefore cannot outlive a restart. A store written before this change was written by the writer that dropped relationships without a trace, so nothing in its tables shows what it lost: every repository indexed before this schema version starts as not complete, with the reason that it was indexed before relationships were kept and needs a repair, and the migration queues a reindex for each of them at once. They are reindexed one after another, and each is offline only during its own run. The recount also compares each repository's entity ids with the ids present in the vector table, in both directions: an entity without a vector is counted as unembedded, and a vector whose entity is no longer in the graph store is removed. Such a vector is left behind today when the removal of vectors, which happens after the graph transaction and outside it, fails or is cut short; since entity ids are derived from the repository, file, kind and name, the same id returns when the entity does, and the plain insert would then add a second row for it. The comparison runs before any commit can write vectors.

VERIFICATION. Each Story's design maps every one of its acceptance criteria to a test. Six are fixed here because they guard the design's own claims: a reindex of a repository that another repository calls into, after which every one of the first repository's rows and vectors was written by the reindex and the other repository's callers are returned; a called function removed by one file event and restored by a second, after which its caller is returned and the repository reads complete without a full index; a full index of a fixture with a manifest and one ambiguous call, after which the repository reads complete with the ambiguous relationship reported apart and no relationship unwritable; the conformance test of the matcher against git, a test that fails the vector write after a commit and checks that the repository does not read as complete, and the repair of this repository's index checked against a recount of the state from the tables.

DERIVED PASSES. Passes are queue jobs, one at a time, as the document summarisation jobs are today. The queue is a single first-in-first-out line with no priorities, so a file event waits behind whatever is running; index jobs (full index, file event, clean-up) are therefore given precedence over every other job, and a long pass yields between its units of work (one subsystem summary, one document), so that a commit waits for at most one unit. Subsystem grouping reads the stored relationships of a complete repository and writes membership and connection rows; it is deterministic for a given graph. Summaries are written by the cheap-tier model only for subsystems whose membership changed. Document relationships read from links and references in the text are ordinary relationships of the existing REFERENCES kind written in the file commit with evidence 'extracted'; model-proposed ones are a separate pass with the mid-tier model over new or changed documents, stored in the pass's own table with evidence 'model', and read only while the capability's recorded measurement meets the bar. Each pass records the generation it ran against; a reader that finds an older generation says the derived data is stale.

INDEPENDENT STORIES. The by-file index (s3), the daemon's store being broken by another process, and its shutdown (s4), the truthful reads of index state (s5) and the filter (s6) do not depend on the commit and can be built in any order relative to it.

## 4. Diagrams

- [ER model](docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/er-model.html)

## 5. Shared contracts

### 5.1 sc1: IndexState

**Owner Story:** `s1`
**Consumed by:** `s2`, `s7`, `s8`, `s10`

**Purpose:** The recorded per-repository state: the generation of the graph and what is known to be incomplete. Written in the same transaction as every file commit and by the cross-file pass; read by repository status, by the commit's callers, and by every derived pass to decide whether it may run and whether what it wrote is stale.

**Interface sketch (type-level):**

```
type PendingClass = 'awaiting-target' | 'ambiguous' | 'no-candidate' | 'external-endpoint';

interface IndexState {
  repoPath: string;
  generation: number;                 // advanced by every file commit and every completion
  pending: Record<PendingClass, number>;
  unwritable: number;                 // relationships refused by the store, with a stated reason
  unembedded: number;                 // entities the embed step selects (non-empty body) whose vector is not written
  embeddingAvailable: boolean;        // false when the embedding backend is disabled or cannot be reached
  uncommittedFiles: string[];         // paths of files whose parse or commit failed; persisted; a path leaves when its file next commits or is removed
  fullIndexFinished: boolean;         // the full pass, the cross-file pass and both endpoint passes have ended
  endpointPassFailed: boolean;
  graphComplete: boolean;             // derived: fullIndexFinished && !endpointPassFailed && uncommittedFiles.length == 0 && awaiting-target == 0 && unwritable == 0
  complete: boolean;                  // derived: graphComplete && (unembedded == 0 || !embeddingAvailable)
}

interface RepoCompleteness {          // returned beside RepoStatus, which keeps its four values
  complete: boolean;
  reasons: string[];                  // one line per non-zero cause
  counts: Pick<IndexState, 'pending' | 'unwritable' | 'unembedded'> & { uncommittedFiles: number };
  uncommittedFiles: string[];         // the paths that could not be committed
  generation: number;
}

interface DerivedStamp { computedAtGeneration: number; }   // carried by every row a derived pass writes
```

**Assumptions cited:** [[c4]]

### 5.2 sc2: FileCommit

**Owner Story:** `s2`
**Consumed by:** `s7`, `s9`, `s10`

**Purpose:** The one write operation for a file's rows. Everything that adds, replaces or removes a file's entities and relationships hands the store one of these and gets one transaction. The commit removes the outgoing relationships of every entity of the file before writing the new set, leaves the incoming relationships of surviving entities in place, and returns to pending any incoming relationship whose target entity it removes. Entities that are not of the file (shared module stubs) are ensured to exist under the shared-modules rows and are otherwise untouched.

**Interface sketch (type-level):**

```
interface RelationWrite {
  from: string;                        // entity id in this file
  kind: RelationKind;
  target:
    | { stored: string }               // id of an entity expected to be stored
    | { pending: UnresolvedRef };      // name/path reference for the cross-file pass
  evidence: RelationEvidence;          // see sc3; 'unknown' until Story s7 supplies it
}

interface FileCommit {
  repoPath: string;
  filePath: string;
  contentHash: string | null;          // null = the file is removed
  entities: Entity[];                  // empty when removed; module stubs (no repo, no file) are routed to the shared-modules rows
  relations: RelationWrite[];
}

interface FileCommitResult {
  generation: number;
  entitiesWritten: number;
  entitiesRemoved: number;
  relationsStored: number;
  relationsPending: number;            // includes { stored } targets found absent
  relationsUnwritable: number;
  relationsReturnedToPending: number;  // incoming relationships whose target entity was removed
  vectorsOutstanding: number;
}
```

**Assumptions cited:** [[c3]]

### 5.3 sc3: RelationEvidence

**Owner Story:** `s7`
**Consumed by:** `s8`, `s10`

**Purpose:** How a relationship was established, stored as the value of its row and returned wherever relationships are read. An empty value, which is what every existing row holds, reads as 'unknown', so no existing row is rewritten.

**Interface sketch (type-level):**

```
type RelationEvidence =
  | 'unknown'      // stored before this change (empty value)
  | 'extracted'    // read directly from the source text
  | 'inferred'     // established by resolution across files
  | 'chosen'       // one target picked among several candidates; reserved, written only if a choosing rule is added
  | 'model';       // proposed by a model

interface RelationRead {
  from: string;
  kind: RelationKind;
  to: string;
  evidence: RelationEvidence;
}
```

**Assumptions cited:** [[c1]]

### 5.4 sc4: FileFilter

**Owner Story:** `s6`

**Purpose:** The one rule for what the index leaves out, built from git's ignore sources and used by every place that selects files. The filter is composed from a list of rule sources, of which this Epic supplies one (git's); a further source is added by adding to that list, and none is added here. No other Story consumes it as a contract; it is stated here because it replaces a list that six call sites in the indexer and the watcher read today.

**Interface sketch (type-level):**

```
interface RuleSource {
  name: string;                        // 'git' is the only one supplied
  ruleFiles: string[];                 // every rule file read, root first
}

type BuiltInExclusion = 'generated-or-minified' | 'insrc-directory';   // applied whatever the sources say

interface FileFilter {
  repoPath: string;
  sources: RuleSource[];
  builtIn: BuiltInExclusion[];
  includes(absolutePath: string): boolean;   // true for an included file and for a directory that holds one
  listFiles(): string[];               // every included file under repoPath
}

interface FilterChange {
  left: string[];                      // files that are now left out
  entered: string[];                   // files that are now included
}

interface IgnoreFileProposal {
  written: boolean;
  source: 'model' | 'fallback';
  reason?: string;                     // why the fallback was used
}
```

## 6. Story boundaries

### 6.1 Story E20261011c2ba6fa6:S001

**Owns:** `sc1`

The rule that a relationship with an absent target becomes pending instead of being skipped, at each of the six places in src/db/relations.ts where one is lost today (the resolved write's skip on a missing endpoint and its skip on a kind with no byte, promoteToResolved, promoteResolvedBatch, and the pending write's discard of a row without its file or repository and of a row whose repository is not registered), each either kept as pending or counted as unwritable with a reason; the set of files whose parse or commit failed in a full index, persisted with their paths until they next commit; which fields of the state are recounted on open and which are persisted and carried over; the classification of a pending relationship as awaiting-target, ambiguous or no-candidate, with the external-service rows classed apart and the two endpoint passes counted in when a full index is finished; the class is stored on the pending row itself, in its existing free-form record, so no stored form changes, a row the cross-file pass has not yet attempted counts as awaiting-target, and the recount on open reads the stored class and does not run resolution again; the extension of the cross-file pass to complete relationships awaiting a target by id, for imports and the other code-symbol kinds as well as calls and inheritance, and to follow a re-exporting file to the function it re-exports; the lookup of pending rows by the id they await, with its migration step, and the pass after a file event visiting the rows that await an entity of the files just committed; the change of the reindex request so that it deletes the repository's rows in the graph store and the vector store and builds them again from every file, in place of today's skip of unchanged files, with no separate repair request, returning to pending the relationships that other repositories hold into the deleted entities, and its queuing by the migration for every repository indexed before this change, which starts as not complete; the storing of the repository entity so that the manifest step's dependency relationships are written; the measurement on this repository, before and after a repair, of the awaiting-target, ambiguous, no-candidate and unwritable counts, with unwritable expected to be zero; the IndexState row, its migration step, its recount on open, and the derivation of repository status from it, as a completeness field returned beside the unchanged status by the daemon's status and stats requests and shown in the CLI's repository pane and in both editor plugins; and the analyzer's read of it: an analyzer lookup that reads relationships of a repository that is not complete says so in its result, with the counts, so that an answer over an incomplete graph is not returned as a plain fact. The choice, in this Story's design, of the function reached only through a re-exporting file that the repair is measured on, since the issue's own example (pickScope) has been removed from the source. Raising the log level of a refused relationship from debug is internal. Until Story s2 lands, s1 applies its rule inside the existing separate writes.

### 6.2 Story E20261011c2ba6fa6:S002

**Owns:** `sc2`
**Depends on:** `sc1`

The extension of the existing whole-file replacement into the file commit (relationships and pending rows in the same transaction as entities; outgoing relationships of surviving entities replaced, not only those of entities that disappeared; incoming relationships of a removed entity returned to pending), the move of the indexer's refresh and delete paths and of the clean-up pass's removal of a stored file onto it, and the retirement of the separate delete-then-upsert sequence in the indexer. The handling of vectors after the commit: writing the entity row with its embedding marker empty and setting it in a second transaction only after the vector write succeeds, counting an entity with an empty marker in IndexState, comparing entity ids with the vector table on open in both directions, so that a vector left behind by a failed removal is deleted before a plain insert can meet it, and the extension of the existing reembed job to run on daemon start and after an index, with a vector write for an entity whose marker is empty made an upsert, except for an entity first allocated in the same commit, which keeps the plain insert. Three things in that job change with it: it applies the embed step's own selection instead of forcing every entity, so empty-body entities (external endpoints, module stubs) stay unselected and uncounted; its update of an embedding writes the vector first and sets the marker in a second transaction, where today it sets the marker first; and the marker carries the model of the backend that is active, not one fixed name. Which entities count as unembedded (those the embed step selects) and the separate recorded reason when the embedding backend is unavailable. The count of a file whose commit fails on a file event. The queue rule that index jobs go ahead of other jobs and that a long job yields between its units, so that a commit is not held behind a model pass. How a reader sees the old or the new set during a commit is the store's ordinary transaction isolation and needs no new mechanism.

### 6.3 Story E20261011c2ba6fa6:S003


The by-file and by-repository index of entity rows, its migration step that builds it for an existing store, and its upkeep. No single entity-row write exists today: there are seven raw put and remove sites across src/db/entities.ts and src/db/graph/migrations.ts, and the existing name index is kept in step by a helper each site must remember to call. This Story introduces one put and one remove function for entity rows that maintain the name index and the new index together, routes every raw site through them, and adds a test that fails when a raw put or remove appears outside them. Upkeep therefore sits beneath every caller, so that neither today's writers nor the file commit need to know of it and this Story does not depend on s2. The two reads (findEntitiesByFile, listEntitiesForRepo) keep their results and their callers; a new existence check answers whether a repository holds any entity, and the analyzer's scope check uses it.

### 6.4 Story E20261011c2ba6fa6:S004


The cause, which ISSUE-0d577569 records as not known, was reproduced on 2026-10-11 and is not the system's semaphore limit, which the library's message names, but the loss of the daemon's own file lock on the store's lock file, after which another process that opens and closes the store removes the store's semaphores; the daemon's next write then fails with the library's message about the limit, and its exit hangs in the library's close. What in the daemon closes a second descriptor on the lock file is not yet identified. First, therefore, the remedy that does not depend on finding it: the live store is opened by the daemon alone, and any other process is refused it. Second, a bound on the whole shutdown including the store's close, so that a close that hangs ends in an exit. Third, recording a store failure of this kind and stating it in the daemon's status. None of this is consumed by another Story.

### 6.5 Story E20261011c2ba6fa6:S005


The refusal, with a named error and its own code, of a search or analyze request about a repository whose status is indexing, at the analyzer's scope check and at the daemon's search requests, carrying the status and how far the run has got (files done of files selected, and when it began), read from the indexer's running job; the tools that rest on the analyzer (the workflow steps, triage, code review) pass that error on as it is. The order of the analyzer's run: the refusal of a scope the index does not hold comes before a size is announced, or the announcement says the size could not be counted. The named cause and error code for a failed read of the last-indexed time and for a failed lookup, and the three other defects of ISSUE-e2bcadd9 (the wrong provider named, the scope resolved before the cache, and failure text matched inside echoed output). This Story does not read IndexState: it works with the checks the analyzer has today, so that it stays independent of s1.

### 6.6 Story E20261011c2ba6fa6:S006

**Owns:** `sc4`

The in-process matcher of the gitignore grammar over nested ignore files and its conformance test against git; the move onto the one filter of every site that reads the list today in src/indexer/index.ts (the full walk, the start-up scan for changed files, the file event, the clean-up pass, and the two places that seed the list when a repository is registered), of the watcher, and of the analyzer's reader, its two exploration walkers and its infra walker (src/analyze/runtimes/infra/_shared.ts), each of which has its own list of names today, and of the indexer's source-root detection (src/indexer/source-roots.ts), whose own list would otherwise hide a package in a directory the filter includes; a search of the source for such lists found five more, in the daemon's four file-search tools (glob, grep, list-dir, recent under src/daemon/tools/builtins/search) and in the review probe (src/workflow/review/probe.ts), which search the working tree as text, do not decide what the index holds, and are deliberately left as they are; the filter keeps answering for a directory that holds an included file, as the analyzer's reader does now; the retirement of the bare-name list and of the ignore entry in the repository's .insrc config; the two built-in exclusions (generated or minified files, the .insrc directory) applied inside the filter so that the full walk and the file event no longer differ on them; the handling of a change to an ignore file as an event that removes and adds files, and the comparison by content hash of the clone's exclude file and the global ignore file, which the watcher cannot see, whenever the filter is used; the queued step that proposes a root ignore file with the cheap-tier model when a repository is added without one, its fallback, and the rule that an existing file is never written. Two points were decided by the stakeholder: the filter honours all three of git's ignore sources (the .gitignore files, the clone's exclude file, the user's global ignore file), and a file git tracks is indexed even when a rule matches it, so the filter takes git's list of tracked files as an input and a plain folder is filtered by the rules alone.

### 6.7 Story E20261011c2ba6fa6:S007

**Owns:** `sc3`
**Depends on:** `sc1`, `sc2`

The one-byte encoding of evidence as the value of a relationship row; the points in the per-file resolver and the cross-file pass that decide 'extracted' or 'inferred' ('chosen' is reserved and not written, since an ambiguous relationship stays pending with its candidates); the passing of evidence as an argument to the store's resolved write and promote operations, so that the two endpoint passes write 'inferred' and the manifest step writes 'extracted' and no relationship written after this change reads 'unknown'; the carrying of evidence through the store's traversal reads and the daemon's caller and callee requests; the marking of inferred and chosen relationships in the analyzer's lookups and answers. No migration rewrites existing rows, since an empty value reads as 'unknown'.

### 6.8 Story E20261011c2ba6fa6:S008

**Depends on:** `sc1`, `sc3`

The grouping of a complete repository's code entities into subsystems, its determinism, the tables for membership, connections and summaries and their migration step; the queued pass and its trigger on a new generation; the cheap-tier summary of a subsystem whose membership changed; the daemon request that returns subsystems; the addition of subsystem context to the analyzer's context builder; the statement that groups rest on an incomplete or older graph. Which relationships count toward grouping, and with what weight by evidence, is decided here.

### 6.9 Story E20261011c2ba6fa6:S009

**Depends on:** `sc2`

One reader per added language (Rust, C#, C, C++) in the existing parser registry with a guarded load, as the Kotlin reader has; the structured reading of SQL in place of the whole-file document, keeping the document entity for retrieval; any entity kinds this needs, appended to the fixed byte table without renumbering; the additions to the Language union; the daemon request that lists the languages read and why any was skipped. Each language can be delivered on its own.

### 6.10 Story E20261011c2ba6fa6:S010

**Depends on:** `sc1`, `sc2`, `sc3`

The reading of links and references between documents, and from a document to code, as relationships of the existing REFERENCES kind written in the file commit with evidence 'extracted'; the queued mid-tier pass over new or changed documents and its own table of model-proposed relationships; the hand-checked set, the measurement, and the recorded figures that switch the capability on or leave it off; the merging of model-proposed relationships into reads with evidence 'model'; the status line when no CLI provider is available.

## 7. Non-functional targets

- **Performance:** Reading one file's entities costs in proportion to that file's rows, and one repository's in proportion to that repository's rows. A file commit is one write transaction whose size is bounded by one file. A first full index holds more pending rows than today until the cross-file pass runs, and that pass does more work; this is accepted under the accuracy rule. Index jobs take precedence in the queue and a derived pass yields between its units of work, so a commit waits for at most one unit of a pass. Model calls are serial; the mid-tier pass sends only new or changed documents. Vector writes keep the plain insert for entities first stored in the same commit, so a first full index writes vectors at today's cost; the upsert, which costs more against a large vector table, is used only for changed entities and for the backfill, and Story s2's design measures it on this repository.
- **Security:** No store is opened outside the daemon and no model is reached except through the local provider or the CLI providers. The ignore-file proposal sends the model file names and manifest names, not file contents, and writes into the user's repository only when no root ignore file exists. Document text sent to the mid-tier model goes through the user's own CLI session, as other mid-tier calls do.
- **Observability:** Repository status carries the completeness counts and the reason a repository is incomplete. A relationship the store refuses is logged at warn with its reason and counted, not logged at debug. A fallback ignore file, a skipped language reader, a store failure after its locks were taken away, and a model-proposed capability that is off each state their cause where status is read. Each derived row carries the generation it was computed from.
- **Durability:** The file commit is atomic in LMDB: after a crash a file holds its old rows or its new rows. Vectors are written after the commit and may be missing after a crash; the gap is recorded by an empty embedding marker, checked against the vector table on open, and backfilled, and the repository reads as incomplete until it is, unless the embedding backend is unavailable, which is reported as its own reason. The IndexState fields that the tables can answer are recounted when the store is opened; the rest, including the paths of files that could not be committed, are persisted in the state row and survive a restart. Every new table and value arrives by a migration step applied on open; no existing key or kind byte changes, so an older store is brought forward without a re-index. Derived tables can be dropped and recomputed without loss.

## 8. Rollout

**Phase A — a daemon that stays up and reads that tell the truth**

**Stories:** `s4`, `s5`

Neither Story depends on another, and both remove failures that get in the way of everything after them: a daemon whose store has been broken by another process aborts whole test files and cannot be stopped, and the later phases index this repository repeatedly. s4 starts with finding the cause, so it should start first.

**Backward compat:** A refused request keeps the error code and message it has today. The daemon's stop and start commands keep their behaviour; only the bound on shutdown is new.

**Phase B — nothing lost, nothing wrongly left out, fast reads**

**Stories:** `s1`, `s3`, `s6`

s1 owns IndexState and the rule that a relationship with an absent target is kept, which every later Story builds on. s3 and s6 are independent of it and of each other, and each changes what a full index does, so they land before the write path is replaced in Phase C rather than under it. All three end with a repair of this repository's index, which is s1's acceptance measure.

**Backward compat:** Existing stores are brought forward by migration steps on open, with no re-index: the IndexState row and the by-file index are built from the rows already stored. A repository indexed before this change starts as not complete and is repaired by a queued job, which re-reads every file; until it has run the repository says that a repair is needed. The two entity reads return what they return today. RepoStatus keeps its four values, so every consumer that branches on status is unaffected; the completeness field is an addition to the daemon's status and stats replies, and the CLI and both editor plugins show it beside the status. A repository's existing .gitignore is never changed; the ignore entry in its .insrc config is no longer read.

**Phase C — the file commit**

**Stories:** `s2`

s2 replaces the indexer's separate writes with the one commit. It depends on s1's rule and state, and it is the change concentrated in the most imported store files, so it lands alone, after Phase B has made the index repairable and its completeness visible: any regression then shows as an incomplete repository rather than as silently missing rows.

**Backward compat:** The store's existing write functions stay for their other callers; only the indexer moves. No stored row changes form in this phase.

**Phase D — evidence and more languages**

**Stories:** `s7`, `s9`

Both consume the file commit and neither consumes the other. s7 owns RelationEvidence, which Phase E needs. s9 adds readers one language at a time and can proceed alongside it.

**Backward compat:** Existing relationship rows are not rewritten; their empty value reads as 'unknown'. Requests that return relationships gain an evidence field and keep every field they have. Kind bytes are appended, none renumbered. An SQL file keeps its whole-file document entity when its structure is added.

**Phase E — subsystems and document relationships**

**Stories:** `s8`, `s10`
**Flag:** `index.documentLinks.modelProposed`

Both are derived passes that need a complete graph (s1), evidence (s7) and, for s10, the commit. They are independent of each other. They come last because they are the only Stories whose output is worse than nothing if the graph under them is wrong.

**Backward compat:** Both write only their own tables, which can be dropped and recomputed. The analyzer's context gains a subsystem section and loses nothing. Model-proposed document relationships are off until the measurement meets the bar.

**Ordering rationale:** The order follows the Epic's dependency edges (s2 after s1; s7 after s1 and s2; s8 after s1 and s7; s9 after s2; s10 after s7) and contract ownership (IndexState in B, FileCommit in C, RelationEvidence in D, their consumers after). The four Stories with no edges are placed by risk, not by dependency: s4 and s5 first because a hanging daemon and misleading refusals slow every later phase, s3 and s6 with s1 because each changes the result of a full index and it is better to change that once, before the write path moves. Correctness (A to C) precedes enrichment (D, E), as constraint k7 requires; s9 is placed in D because it extends coverage and does not depend on the graph being enriched.

**Risky bits**

| Area | Why | Mitigation |
| :--- | :--- | :--- |
| The file commit in the store's most imported files (Phase C) | src/db has an import in-degree of 159 with 73 importing files; a fault in the one writer affects every indexed file, and the commit, the pending rule, the by-file index and the evidence value all meet in the same transaction. | Phases B and C are ordered so that completeness is visible before the writer changes. The store's own tests for the whole-file replacement are extended to relationships and pending rows before the indexer moves. After each phase this repository's index is repaired and checked against the issue's figures (4 callers of runGrepSearch, and the re-export case named in s1's design) and against a recount of IndexState from the tables. |
| The meaning of 'complete' (Phase B) | This repository has 20,590 unresolved rows today, most of them probably calls into code that is not indexed. If every pending row counts as incompleteness no repository is ever 'ready' and the new status says nothing; if the classification is too loose a damaged graph reads as ready, which is worse than today. | IndexState separates awaiting-target from ambiguous, no-candidate and external-endpoint rows, and only awaiting-target (with unwritable relationships, uncommitted files and unembedded entities) makes a repository incomplete; the other three are counted and reported apart. s1's design must state the classification rule and measure all three counts on this repository before and after the repair; the counters are recounted from the tables on open. |
| One matcher instead of git (Phase B, s6) | Replacing git's own listing with an in-process matcher can change which files are indexed in ways no one asked for. A matcher that disagrees with git on some grammar case, on one of the three sources, or on a tracked file a rule matches would recreate the defect this Story removes. | A conformance test compares the matcher with git's own answer on a fixture tree covering anchored rules, negations, nested files, directory-only rules, a .git directory, a nested repository, a minified file and an .insrc directory, each tracked and untracked, the clone's exclude file, a global ignore file and a tracked file that a rule matches. Before the change is switched on, the set of files selected for this repository is compared old against new and the difference is shown to the stakeholder. |

## 9. Alternatives considered

### 9.1 a1: One file commit, a recorded completeness state, and derived passes behind it — **CHOSEN**

Every change to a file's rows goes through one transactional commit in the store; the repository carries a recorded completeness state; enrichment runs as separate passes that start only from a settled graph.

The store gains one write operation for a file: in a single transaction it replaces the file's entities, removes and writes its relationships, replaces its pending relationships, and keeps the by-file and by-repository index in step. It grows out of the whole-file replacement the store already has and nothing calls. The indexer's refresh, the delete event and the repair all call it, and the separate delete and upsert calls of today stop being a write path. A relationship whose target is not stored yet is never dropped inside that commit: it is kept as pending and completed by the existing cross-file pass, which becomes the one place relationships are completed. Each relationship is written with a small value saying how it was established. The vector write stays after the commit, and its gap is closed by a recorded per-repository state rather than by a log line.

That recorded state is the second half: for each repository the store keeps what is known to be incomplete (pending relationships, relationships that could not be written, entities without vectors, enrichment not yet run), and repository status, the analyzer's scope check and every enrichment pass read it. Enrichment (subsystem grouping and summaries, document relationships) is a set of passes queued after the graph settles, each writing its own tables, each stamped with the graph state it was computed from, so it is known when it is stale. What the index leaves out comes from one filter object built from the repository's ignore files and handed to the walk, the file event and the watcher. All store changes are added as steps on the existing migration chain.

**Pros:**
- One writer removes the class of defect behind ISSUE-12f70133 and the non-atomic refresh at once: there is no order of separate calls left in which an edge can be dropped or a file left half-written.
- The by-file index of ISSUE-61045de9 has exactly one place to be kept in step, because there is exactly one writer of entity rows per file.
- Evidence is written where the relationship is written, so Story s7 adds a value to an existing write instead of a second pass over the edges.
- The recorded completeness state answers three Stories from one source: s1's status that does not read as ready, s2's vectors that were not written, and s8's groups resting on an incomplete graph.
- Enrichment that fails or is switched off (s10 below its quality bar, no CLI provider signed in) cannot damage the graph, because it never writes in the file commit.
- Reuses what exists: the whole-file replacement, the pending-relationship queue with its promote operations, the migration chain and the queue's summarisation jobs.

**Cons:**
- The file commit touches the two most imported store files (src/db has an import in-degree of 159), so the change is concentrated in the riskiest code and needs the store's own tests extended before callers move.
- Stories s1, s2, s3 and s7 all change the same commit, so they cannot be built in parallel; their order has to be fixed in the rollout.
- Moving every resolved-at-parse-time relationship through the pending queue when its target is absent makes a first full index hold more pending rows before the cross-file pass runs; the issue measured 20,590 unresolved rows on this repository already.
- A recorded completeness state is new stored data that must itself be kept right; a wrong 'complete' is worse than none.

**Cost estimate:** L

### 9.2 a2: Two-pass indexing with the existing separate writes

Keep today's separate store calls; make a full index write all entities first and all relationships second, and fix each issue where it was found.

A full index is split into two passes over the file list: the first parses every file and stores its entities, the second resolves and stores relationships, so that every target exists when an edge is written. The per-file refresh keeps its sequence of calls but is wrapped so that a failure restores what was deleted. The remaining issues are fixed in place: an index table for the two slow reads, a guard around the last-indexed read, a bound on shutdown, the ignore list replaced by a call to git for each event.

Enrichment is added inside the same indexing run: evidence is attached by a later pass that re-derives it from the resolver's output, subsystem grouping runs at the end of a full index, and document relationships are extracted while documents are parsed. Each feature decides for itself when it is out of date.

**Pros:**
- Smallest change to the store's write surface: no existing store function changes its meaning, so the 73 files that import src/db are not at risk from a changed writer.
- The two-pass order fixes the first-index edge loss of ISSUE-12f70133 directly and is easy to show with the issue's reproduction.
- Each issue's fix is independent, so Stories can be built in parallel and shipped one at a time.

**Cons:**
- The single-file refresh is not a two-pass index, so an edge from a changed file to a target that is not stored yet is still dropped there; the defect is fixed for the first index and remains for every later event.
- A refresh made of separate calls with a restore step is not all-or-nothing: a crash between the delete and the restore leaves the file empty, which is exactly Story s2's ac1 and ac2.
- Every file is parsed twice or its parse output is held in memory across the whole repository; on this repository that is 2,252 files.
- The by-file index must be kept in step by every one of the separate entity writers and deleters, which is the 'every write and delete' risk ISSUE-61045de9 names.
- Model calls for document relationships inside the indexing run make indexing wait on a CLI session, against the Story s10 criterion that indexing completes without one.

**Cost estimate:** L

**Rejected because:** Fixes the first-index loss but leaves the single-file refresh able to drop an edge and to be left half-written, so it scores partial on k1 on the path that runs most often; it also puts model calls inside the indexing run (partial on k4, k7 and k10).

### 9.3 a3: Leave the core store as it is and repair by a periodic sweep, with enrichment in overlay tables

Do not change how files are written; add a reconcile sweep that finds and restores what was lost, and keep all new information in overlay tables rebuilt from the graph.

The write path stays as today. A sweep, run after each index and on a timer, compares what the source implies with what the store holds: it re-parses files whose relationships look short, re-writes dropped edges, removes orphaned rows and re-embeds entities without vectors. The repository is reported incomplete while the sweep has work.

Everything new is an overlay: evidence, subsystem groups and document relationships live in their own tables keyed by entity or edge, are never written by the indexer's refresh, and are rebuilt whole from the graph whenever it changes. The slow reads get an overlay index built the same way. Overlays can be dropped and rebuilt at any time, so no migration of existing rows is needed.

**Pros:**
- No change to the existing entity and relationship writers, so the risk to the code paths that work today is the lowest of the three.
- Overlays need no migration of existing rows: a store written before the change is brought up by building the overlays, which satisfies the letter of the schema-version constraint.
- The sweep also repairs stores damaged before the change, which Story s1's ac2 requires in any case.

**Cons:**
- The index is wrong between a write and the next sweep; answers given in that window are partial, and the stated accuracy rule prefers a slower complete index to this.
- The sweep must re-derive what the source implies, which means re-parsing; on a repository of 2,252 files a sweep that finds nothing still costs a full parse unless it trusts the very hashes that hid the loss.
- A file refresh is still not all-or-nothing, so Story s2 is not met by this shape at all.
- Evidence kept apart from the edge it describes can disagree with it after any refresh until the overlay is rebuilt; 'unknown origin' would be the common case, not the exception.
- Rebuilding every overlay whenever the graph changes makes one edited file cost a whole-repository rebuild of groups and summaries, including model calls.

**Cost estimate:** M

**Rejected because:** Accepts a wrong index between sweeps and does not make a refresh all-or-nothing, so it violates k1; evidence kept apart from the edge it describes would read 'unknown' most of the time.

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
- **[[c10]]** `prior-artifact` `docs/standalone/defect-installed-daemon-runs-out-lmdb-E202610100d577569/ISSUE.md` — "This record does not name a cause for the exhaustion; the design that follows has to find it first."
- **[[c11]]** `prior-artifact` `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/DEF.md`
- **[[c12]]** `step-output` `s1 backFlowNotes: direct reads of src/db/graph/store.ts, src/db/graph/migrations.ts, src/db/relations.ts, src/db/entities.ts, src/indexer/index.ts, src/indexer/watcher.ts, src/analyze/context/repo-ignore-filter.ts, src/db/doc-summaries.ts and src/indexer/parser/artifact.ts`
- **[[c13]]** `code` `src/indexer/external-endpoints.ts`
- **[[c14]]** `code` `src/indexer/messaging-endpoints.ts`
- **[[c15]]** `stakeholder` `Stakeholder decisions of 2026-10-11 on this design: completeness as a separate field with the four status values kept; all three of git's ignore sources honoured; tracked files indexed even when a rule matches; the pickScope measure replaced by a function named in Story s1's design. Further decisions of the same day: generated or minified files stay left out by a named built-in rule applied at every selection site; the daemon's own .insrc directory is never indexed. Decision after approval: reindex is the one command and indexes every file from scratch; there is no separate repair. Clarified the same day: a reindex calls the delete operations on the graph store and the vector store for the repository and builds again. Also: a search or analyze request about a repository that is being indexed is refused with an error stating the indexing state.`
- **[[c16]]** `code` `src/indexer/embedder.ts` — "entity.embeddingModel = EMBEDDING_MODEL;"

## 11. Feedback

- **Subho Ghosh** (2026-10-11T07:31:05.272Z) `comment` — `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/HLD.md`: Review history, 2026-10-11: nine daemon review rounds, with blocking findings of 7, 6, 4, 3, 2, 6, 1, 1 and 2. Every finding was corrected in this design; the corrections for the ninth round (the cross-file pass after a file event visiting pending rows that await the files just committed, with completion by id extended to imports; the start-up comparison removing a vector whose entity is gone) were NOT re-reviewed. One review attempt failed on the reviewer's side (17 premises against a template limit of 16) and recorded nothing. Stakeholder decisions recorded in this design: completeness as a separate field with the four status values kept; all three git ignore sources; tracked files indexed; generated or minified files and the .insrc directory left out everywhere; ambiguous relationships reported apart and not counted as incompleteness; the repository entity stored so that manifest dependencies are written. Findings of this depth are expected to continue in each Story's own design review.
- **Subho Ghosh** (2026-10-11T07:43:12.990Z) `comment` — `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/HLD.md`: Amended after approval, 2026-10-11, on the stakeholder's decision: reindex is the one command and indexes every file from scratch, whether or not its content has changed; there is no separate repair. Today repo.reindex skips every file whose stored content hash is unchanged (src/indexer/index.ts:628 and :1004-1008). Not re-reviewed. Open for the stakeholder to confirm: unchanged text with an unchanged embedding model keeps its vector.
- **Subho Ghosh** (2026-10-11T07:46:08.679Z) `comment` — `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/HLD.md`: Clarified by the stakeholder, 2026-10-11: a reindex calls the delete operations on the graph store and the vector store for the repository and builds everything again, vectors and document summaries included. This supersedes the earlier note that unchanged text keeps its vector. Not re-reviewed.
- **Subho Ghosh** (2026-10-11T07:53:00.827Z) `comment` — `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/HLD.md`: Amended after approval, 2026-10-11, on the stakeholder's decision: while a repository is being indexed or reindexed, search and analyze requests about it return a named error that states the indexing state, and no partial answer. Carried by Story s5 (a new requirement and acceptance criterion ac4 in the definition). Not re-reviewed.
- **Subho Ghosh** (2026-10-11T07:56:39.212Z) `comment` — `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/HLD.md`: Stakeholder decision, 2026-10-11: a reindex is queued at once, for a request and for the migration alike; only the repository being reindexed is offline, from the start of its own run until that run completes, and other repositories are answered as usual. Not re-reviewed.
- **Subho Ghosh** (2026-10-11T08:16:16.235Z) `comment` — `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/HLD.md`: Amended after approval, 2026-10-11, on the stakeholder's decision: Story s4 is reworded to the cause reproduced that day. The failure is not the semaphore limit: the daemon loses its file lock on the lock file when another descriptor on it is closed in-process, and another process that opens and closes the store then removes the semaphores. The title, the first and third criteria and the first requirement of s4 now speak of the store not being broken by another process. Not re-reviewed.

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.epic (design.epic)

**2 do not hold · 0 could not be verified · 13 hold** · template `design-spec` · model `cli-claude:opus` · reviewed 2026-10-11T07:00:30.601Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

| Check item | Severity | Premise | Evidence | Action |
| --- | --- | --- | --- | --- |
| new-versus-reuse | HIGH | The existing cross-file pass, reused as it runs today, completes an incoming relationship that the commit returned to pending 'if the target returns'. | A returned-to-pending row belongs to its SOURCE file. After a file event the only cross-file run is the settle pass, and it is scoped to the files touched in the window: index.ts:833-836 `runCrossFileResolver({ ..., scopeFile: file })` for each file in `scope`; cross-file-resolver.ts:276 `listUnresolvedRelations(opts.db, opts.repoRoot, opts.scopeFile)`; relations.ts:288-298 reads only the `(repoId, fromFile)` index for that file. When the target's file is committed again (a function removed and restored, or a file deleted and recreated by a branch switch), the settle pass looks only at rows whose source is the target's file; the rows under the untouched source files are never visited. They stay 'awaiting-target' with a target that now exists, so the callers stay missing and the repository reads incomplete until a full index or a repair, which also holds back every derived pass. Pass 2 also handles only INHERITS, IMPLEMENTS and CALLS (cross-file-resolver.ts:306-313, every other kind is skipped), so the extension to 'awaiting a target by id' has to cover IMPORTS and the other kinds too. The design states neither change to the event path. [files: src/indexer/index.ts, src/indexer/cross-file-resolver.ts, src/db/relations.ts] | State in the architecture and in s1/s2's boundaries how pending rows of other files are completed after a file event: either the settle pass also visits rows awaiting, by id, an entity of the files committed in the window (which needs a lookup of pending rows by target id), or it runs unscoped for the awaiting-target class. Add a test: remove a called function, restore it by a second file event, and check that the caller is returned and the repository reads complete without a full index. |
| data-compatibility | MED | An entity whose id was first allocated in the same commit cannot have a vector row, so the plain insert is safe for it. | The vector table is keyed by the entity's string id, which is deterministic (SHA of repo, file, kind, name), not by the allocated u64. A removed entity's vector row is deleted only after the graph transaction has committed and outside it: entities.ts:1087-1091 (`withWriteTxn(...)` then `deleteEntityVecsByIds`) and :487-491 in reindexFile, with no retry and no record. If that delete fails or the daemon stops between the two, the vector row outlives the entity. When the same file and name come back, the entity is 'first allocated in the same commit' and yet a vector row with its id exists; the plain insert is `addEntityEmbeddings`, described at entities.ts:299 as 'raw .add(), no JOIN', so it adds a second row for the same id. The design's compare of entity ids with the vector table on open is stated only as a count of what is missing. [files: src/db/entities.ts] | State that the compare on open also removes vector rows whose entity id is not in the graph store, and that it runs before any plain insert can meet such a row; or record removed ids so the delete is retried. Add the case to s2's vector tests. |

#### Could not verify (does not block)

_None._
