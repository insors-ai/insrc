<!-- insrc:artifact LLD-7d42b5dceb62afec-S001 -->

# LLD: E202611037d42b5dc:S001

## Summary

**Epic:** `subsystem-pass-regroups-whole-repository-after`
**HLD base run:** `wf-1793712130091-0po013`
**HLD effective hash:** `f009825f00df...`

The subsystem pass stops re-reading the whole repository after every saved file. The store records which files' cross-file relationships changed, in the same transaction as the change; the pass recomputes only those files' contributions to the file graph, regroups in memory only when a contribution actually changed, and otherwise just restamps the current groups. Passes for one repository are paced to at most one per minute, and a pass whose summaries failed is re-queued on a bounded back-off (1 minute doubling to 30 minutes), still one model call at a time after code work.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal

### 2.1 `runSubsystemPass`

```typescript
runSubsystemPass(opts: { readonly db: DbClient; readonly repoPath: string } & SubsystemPassDeps): Promise<SubsystemPassResult>
```

**Parameters:**
- `opts: { db: DbClient; repoPath: string } & SubsystemPassDeps` — The repository and the model/queue seams, unchanged.

**Returns:** `SubsystemPassResult` — As today, plus mode: 'full' | 'incremental' | 'unchanged' (how the groups were obtained), filesRead: number (files whose contributions were computed), elapsedMs: number (the pass's grouping work, before summaries). ran stays true only when groups were rewritten; reason 'up-to-date' also covers mode 'unchanged'.

**Errors:**
- `store error` when A read fails, or the publication transaction throws: the pass throws as today; nothing it computed is published, the record is not consumed, and the next pass repeats the work.

**Preconditions:**
- The repository is registered.

**Postconditions:**
- Graph incomplete: nothing grouped, as today.
- Endpoints are exactly the full pass's (fileOfU64 at src/indexer/subsystem-pass.ts:172-180): a source or target is a code entity (CODE_KINDS) or a file entity of the repository, in a file that holds at least one code entity, and source and target are in different files. IMPORTS between file entities (src/indexer/cross-file-resolver.ts:295-300) therefore count, as today.
- Mode 'full' when there are no contribution rows for the repository, when the stored groups have computedAtGeneration null, or on the first pass for the repository in this daemon process: today's whole-repository read, which also writes every code file's contribution row and consumes the repository's changed-file record.
- Otherwise mode 'incremental' or 'unchanged'. Each recorded file is recomputed from the store: its code and file entities through the entity_by_file index, their grouping-kind out-neighbours with evidence, each target's file and kind from its entity row. A contribution keeps every edge to a code or file entity of another file of the repository WHATEVER that file's code status, so a target that later gains (or loses) its first code entity needs no recompute of the unchanged files pointing at it. A recorded file with no code entity left gets entityCount 0 (its row is kept while other rows may point at it, and its own out-edges are dropped).
- Regroup: the file set is the files whose row has entityCount > 0; an edge counts only when both ends are in that set (the full pass's rule, applied when grouping instead of when reading), weighted as today; directoryHubs and groupSubsystems run over that set. Mode 'unchanged' when every recomputed row equals the stored one AND the file set is unchanged; mode 'incremental' otherwise.
- Publication is one write transaction: the recomputed contribution rows, the groups (the replacement writeSubsystems performs, in an in-transaction form) or, in mode 'unchanged', the restamp of computedAtGeneration, and the conditional consumption of the record entries read (each deleted only if its stamp is still the one read). A failure anywhere before or in that transaction leaves contributions, groups and the record exactly as they were, so the next pass recomputes the same files and publishes.
- The groups any mode stores equal what mode 'full' would compute from the same store (same file set, same pair weights and kind counts, same hubs, so the same ids and kept summaries).
- Summaries for groups without one are then written as today (one call at a time, after code work).

### 2.2 `IndexerService.subsystemPass`

```typescript
protected subsystemPass(repoPath: string): Promise<{ summariesFailed: number; stopped: boolean }>
```

**Parameters:**
- `repoPath: string` — The repository whose pass the subsystems job runs.

**Returns:** `Promise<{ summariesFailed: number; stopped: boolean }>` — Runs runSubsystemPass and resolves its outcome, which IndexerService.processJob resolves for a subsystems job. It schedules nothing itself: with daemon threads it runs on the document-summary worker, whose IndexerService has no queue it may enqueue to (SummaryWorkerLink.enqueue throws).

**Postconditions:**
- Logs mode, filesRead, elapsedMs, subsystems, summariesWritten and summariesFailed in one line.
- Resolves { summariesFailed, stopped } from the pass's result.

### 2.3 `enqueueSubsystemsIfComplete`

```typescript
protected enqueueSubsystemsIfComplete(repoPath: string): Promise<void>
```

**Parameters:**
- `repoPath: string` — The repository to queue a pass for.

**Returns:** `Promise<void>` — Queues the subsystems job now, or arms the pacing timer.

**Preconditions:**
- Called after a full index, a clean-up, a settle, or by the retry timer.

**Postconditions:**
- Runs on the IndexerService that owns the index queue (the code-indexing worker's, or the daemon's when threads are off): the one scheduling owner of subsystems jobs. Its per-repository state is the time a subsystems job was last queued, the pacing timer, the consecutive-failure count and the retry timer.
- Graph not complete: nothing queued, as today.
- No subsystems job queued for the repository within the minimum interval (60 s): the job is queued now and the time recorded (the queue still collapses a duplicate that is queued).
- One queued within the interval: a per-repository pacing timer is armed (if none is) to call it again when the interval has elapsed; further requests in the interval are absorbed by that timer.
- A timer that fires while the queue is stopping does nothing. Pacing and retry timers are unref'd and are cleared by the scheduler's dispose, called from both stop paths (src/daemon/index.ts:351, src/daemon/threads/indexing-worker.ts:167-172). They never call the model.

### 2.4 `runIndexJob`

```typescript
runIndexJob(job: IndexJob, summaries: SummaryRunner | undefined, processJob: (job: IndexJob) => Promise<unknown>): Promise<unknown>
```

**Parameters:**
- `job: IndexJob` — The job the queue drives, unchanged.

**Returns:** `Promise<unknown>` — The job's outcome: for a subsystems job, { summariesFailed, stopped }, whether it ran here (processJob) or on the summary worker (SummaryRunner.run).

**Errors:**
- `Error` when The job failed, or the summary worker went away before replying (SummaryRunner.run rejects, as today).

**Postconditions:**
- The subsystems job's outcome crosses the worker boundary in the summary-job reply: the summary worker's serveJobs reply carries the value its run resolved (a new optional result on the reply envelope), and SummaryRunner.run resolves it.
- Both queue drivers (src/daemon/index.ts:350 and src/daemon/threads/indexing-worker.ts:161-164) hand a subsystems job's outcome -- or its failure, counted as a failed pass -- to the queue-owning IndexerService's scheduler, which arms the retry timer when summariesFailed > 0 or the job failed, and stopped is false: delay 60 s x 2^(consecutive failing passes - 1), capped at 30 minutes, firing enqueueSubsystemsIfComplete; a pass with summariesFailed === 0 and stopped false resets the count and clears the timer; a stopped pass changes nothing.

### 2.5 `commitFile`

```typescript
commitFile(commit: FileCommit): Promise<FileCommitResult>
```

**Parameters:**
- `commit: FileCommit` — One file's entities and relationships, unchanged.

**Returns:** `Promise<FileCommitResult>` — Unchanged.

**Postconditions:**
- In the commit's transaction the committed file (repository-relative) is added to its repository's changed-file record once, covering its swept and rewritten outgoing edges and its code-entity count.
- Each other file whose entity held an edge into a removed entity of the committed file (the incoming sweep that returns it to pending) is added to the record.

### 2.6 `putEdgeInTxn`

```typescript
putEdgeInTxn(s: GraphStore, fromU64: bigint, kindByte: number, toU64: bigint, evidence: RelationEvidence | undefined, rel: Relation): void (internal)
```

**Parameters:**
- `fromU64: bigint` — The edge's source entity.

**Returns:** `void` — Unchanged edge write.

**Postconditions:**
- For a grouping kind (IMPORTS, CALLS, INHERITS, IMPLEMENTS, REFERENCES) written outside a file commit (the cross-file pass's promotions, upsertRelations), the source's repository and file are added to the changed-file record in the same transaction. The caller supplies them where it already holds them (a pending row's repoId and fromFile); otherwise they are read from the source's entity row.

### 2.7 `deleteResolvedRelations`

```typescript
deleteResolvedRelations(db: DbClient, items: ReadonlyArray<{ from: string; kind: RelationKind; to: string }>): Promise<void>
```

**Parameters:**
- `items: ReadonlyArray<{ from; kind; to }>` — Edges to remove, unchanged.

**Returns:** `Promise<void>` — Unchanged.

**Postconditions:**
- Each removed grouping-kind edge adds its source's repository and file to the changed-file record in the same transaction.

### 2.8 `returnInferredSqlReferencesToPending`

```typescript
returnInferredSqlReferencesToPending(db: DbClient, targets: readonly string[], excludeHolders: ReadonlySet<string>): Promise<number>
```

**Parameters:**
- `targets: readonly string[]` — Unchanged.

**Returns:** `Promise<number>` — Unchanged.

**Postconditions:**
- Each removed edge adds its holder's repository and file (from the holder row it already reads) to the changed-file record.

## 3. Data model changes

### 3.1 `subsystem changed-file record (new store table subsystem_dirty)` — new

Key repoId u32 BE ++ repository-relative file path; value: a change stamp that increases with every write of the entry (a per-store counter). An entry means the file's grouping inputs (its outgoing grouping-kind edges, or its code entities) changed since the subsystem pass last published its contribution. Written in the same transaction as every such change (the edge sites and commitFile); consumed by the pass's publication transaction, each entry deleted only if its stamp still equals the one the pass read, so a change made while the pass ran stays recorded. Removed with the repository's other subsystem rows when the repository is removed.

**Call sites:**
- `src/db/relations.ts:189`
- `src/db/relations.ts:242`
- `src/db/relations.ts:578`
- `src/db/relations.ts:662`
- `src/db/relations.ts:770-780`
- `src/db/entities.ts:1534`
- `src/db/entities.ts:1567`
- `src/indexer/subsystem-pass.ts:148`
- `src/db/subsystems.ts:55`

### 3.2 `subsystem file contribution (new store table subsystem_file)` — new

Key repoId u32 BE ++ repository-relative file path; value: { entityCount: number (its code entities); out: Array<{ to: string (repository-relative file); weight: number; kinds: Partial<Record<RelationKind, number>> }> } -- the file's outgoing edges from its code and file entities to code or file entities of other files of the repository, aggregated per target file as the full pass aggregates byPair (kind weight x evidence weight, per-kind counts), kept whatever the target file's code status. Written in the pass's publication transaction (all rows in mode 'full', the recomputed rows otherwise). When grouping, only files with entityCount > 0 are nodes and only edges between two such files count -- the full pass's codeFiles / fileOfU64 rule. A file with entityCount 0 and no edges into it is removed. Ownership: one row per (repository, file), owned by the subsystem pass; direction: from the row's file to each target file.

**Call sites:**
- `src/indexer/subsystem-pass.ts:164`
- `src/indexer/subsystem-pass.ts:172-201`
- `src/db/subsystems.ts:55`
- `src/indexer/cross-file-resolver.ts:295-300`

### 3.3 `SubsystemRow.computedAtGeneration (subsystem table)` — invariant-change

Today it is written only when the groups are recomputed. Mode 'unchanged' now restamps it at the current generation without rewriting the groups, meaning 'these groups are what the graph at this generation groups into'. Summaries and ids are untouched by a restamp. The restamp is written in the same publication transaction as the contributions and the record consumption.

**Call sites:**
- `src/db/subsystems.ts:55`
- `src/indexer/subsystem-pass.ts:158`

## 4. Error paths

**Error cases**

- **A file is changed (an edge written, or a commit) while a pass is recomputing that same file, after the pass read its edges but before it clears the file's record entry** (recoverable)
  - Detection: Each changed-file entry carries a change stamp (a value that increases with every write of the entry, for example the LMDB transaction's sequence or a per-store counter); the pass remembers the stamp it read and, in the write transaction that stores the recomputed row, deletes the entry only when its stamp is still the one it read
  - Response: A newer stamp means the file changed again: the entry stays and the next pass recomputes the file. (This refines the data model's 'empty value' to a stamp.)
  - User impact: None: the groups catch up on the next pass instead of silently missing the change.
- **The store write that records a changed file fails** (recoverable)
  - Detection: The record is written inside the same write transaction as the edge or commit; the transaction throws
  - Response: The whole transaction (edge change and record) rolls back together, as any store failure does today; no edge change is ever unrecorded.
  - User impact: Unchanged from today: the write that failed is reported by its caller.
- **A read of the recorded files' entities or edges fails mid-pass, the publication transaction fails, or the process stops before publishing** (recoverable)
  - Detection: An awaited store read throws, or withWriteTxn throws for the publication transaction, or shutdown stops the summary lane
  - Response: Nothing is published: contributions, groups and the record stay as they were (they change only together, in the one publication transaction), and the next pass recomputes the same files and publishes.
  - User impact: The groups lag until the next pass; they are never left inconsistent with the contributions.
- **The summary model fails (CLI logged out, provider down) during a pass** (recoverable)
  - Detection: summariseSubsystem throws a non-SummaryStop error; the pass returns summariesFailed > 0 with stopped false
  - Response: IndexerService.subsystemPass arms the retry timer (60 s, then 120 s, 240 s ... capped at 30 min); each retry is an ordinary subsystems job in the summary lane, so it waits for code work and runs one model call at a time. A pass with no failure resets the back-off.
  - User impact: Empty summaries are filled within the back-off after the model returns, without an edit or a restart.
- **The indexer stops while a pacing or retry timer is armed** (recoverable)
  - Detection: The indexer's stop path clears the per-repository timers (as it clears settle timers)
  - Response: No job is queued after stop; the timers are unref'd so they never keep the process alive.
  - User impact: None.
- **The document-summary worker exits while running a subsystems job** (recoverable)
  - Detection: SummaryRunner.run rejects ('the document-summary worker is gone'); the queue driver catches the failure
  - Response: Counted as a failed pass by the scheduler: the retry timer is armed with the back-off, and the replacement worker runs the retried job.
  - User impact: Summaries are retried without an edit or a restart.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| First pass after the update on a repository whose subsystems were stored before this change (no contribution rows) | Mode 'full': today's whole-repository read, which also writes every contribution row and clears the repository's record; later passes are incremental. |
| A saved file whose edit changes no cross-file relationship (a comment, a body change that calls the same functions) | The commit records the file; the pass recomputes that one file's contribution, finds it equal to the stored row, restamps the groups at the current generation (mode 'unchanged'): no regroup, no subsystem rewrite, no summary call. |
| A saved file that adds a call to a function in another file | Mode 'incremental': the file's row changes, the table is read and regrouped in memory; the groups equal what a full pass would compute. |
| The settle's cross-file pass resolves another (unsaved) file's pending call to the saved file | The promotion's putEdgeInTxn records the holder's file, so it is recomputed too. |
| A file deleted, or a file whose last code entity is removed | The commit records the file; its row gets entityCount 0 (removed when nothing points at it); it leaves the file set, so edges into it stop counting at regroup without recomputing the importers; files whose edges pointed into its removed entities were recorded by the incoming sweep. |
| An unchanged file A imports B; B (no code entities, only its file entity) gains its first function, later loses it, then regains it | A is not recomputed: its row kept the A->B import all along. B's commit records B; its entityCount goes 1, 0, 1, and the regroup counts A->B exactly while B is a code file, as the full pass would. |
| A new code file appears | Recorded by its commit; it gets a row, and the regroup includes it (a new file changes the file set and directory hubs, so the groups are recomputed). |
| An edge to another repository's entity, to a module stub or to an external endpoint | Its source file is recorded (cheap, harmless); the recompute ignores the target because it is not a code entity of the same repository, as the full pass does. |
| A burst of ten saves within a minute | At most one pass starts per repository per 60 s; the requests during the interval are absorbed by one pacing timer, and the pass after it sees every file recorded during the burst. |
| The model fails on every retry for hours | Retries continue at the 30-minute cap; each costs only the summary attempts for still-empty groups (mode 'unchanged' grouping). |
| A pass stopped by a new generation (SummaryStop) | Not counted as a failure: no back-off; the next settle's pass (paced) resumes the summaries. |
| A full index of the repository | Every file is committed and recorded; the next pass recomputes every file (equivalent to a full pass) and converges. |
| A repository whose graph is not complete | No pass runs (unchanged); the record keeps accumulating entries (one per changed file at most) until the graph is complete, then the first pass consumes them. |

**Invariants to preserve**

- A pass runs only on a graph-complete repository, and summaries are written one model call at a time, each after code work, stopping on shutdown or a new generation. [[c2]]
- The summary lane runs subsystems jobs one at a time and only while the index lane is idle, so model calls never run concurrently and code work keeps priority; a queued duplicate is still collapsed. [[c4]]
- The file graph is built from IMPORTS, CALLS, INHERITS, IMPLEMENTS and REFERENCES edges whose source and target are code entities or file entities of two different code files of the repository (src/indexer/subsystem-pass.ts:172-180), weighted by kind and evidence, plus directory hub edges; the stored groups (and their ids, so their summaries) are exactly what that graph groups into. [[c1]]
- writeSubsystems replaces a repository's set in one transaction and keeps the summary of a group whose membership id was stored before. [[c5]]
- The job is queued after a full index, a clean-up and every settle, and only when the graph is complete. [[c3]]

## 5. Test strategy

**Test framework:** `node:test with node:assert/strict, run by npx tsx --test (tests co-located in __tests__)`

**Test levels**

- **integration** — Changed-file record: over a temporary store, every edge site records its source file in the same transaction -- commitFile (the committed file and the files whose edges into its removed entities were swept), the cross-file pass's promotion, upsertRelations, deleteResolvedRelations, returnInferredSqlReferencesToPending -- and a non-grouping kind records nothing; the stamped entry is cleared only when its stamp is unchanged (an interleaved write keeps it).
  - Subjects: `the subsystem changed-file record and its write sites`, `commitFile`, `putEdgeInTxn`, `deleteResolvedRelations`, `returnInferredSqlReferencesToPending`
  - Fixtures: `temporary LMDB store (setGraphStorePath) and temp Lance, as src/indexer/__tests__/subsystem-pass.test.ts`
- **integration** — Incremental pass equals the full pass: over real TypeScript files read by the reader, committed and cross-file resolved, a sequence of edits (a comment-only edit, a new cross-file call, a removed call, a new file, a deleted file, a file losing its last code entity, a settle that resolves another file's pending call) is followed after each by runSubsystemPass; the stored groups, ids and per-file contribution rows equal those of a full pass computed from the same store into a second repository copy (or by forcing mode 'full'), and the reported mode is 'unchanged' only for the comment-only edit. The first pass on a store without contribution rows is mode 'full'. filesRead counts only the recorded files. The sequence also covers an unchanged importer whose target file gains, loses and regains its only code entity (the importer is not recorded, and the groups still equal the full pass's), and file-to-file IMPORTS from the cross-file pass counted in the weights as today.
  - Subjects: `runSubsystemPass`, `the subsystem file contribution table`, `SubsystemRow.computedAtGeneration restamp`
  - Fixtures: `temporary store and repository with a few TypeScript files in two directories`
- **integration** — Publication is atomic: a fault injected after the contributions are computed and during the publication transaction (a failing write in the in-transaction writeSubsystems) leaves contributions, groups and the changed-file record exactly as before; the next pass publishes groups equal to the full pass's. An edge written between the pass's read and its publication keeps its record entry (stamp check).
  - Subjects: `runSubsystemPass publication`, `the subsystem changed-file record`
  - Fixtures: `temporary store; a fault seam in the publication transaction`
- **integration** — Pacing and retry across the worker boundary: with the real SummaryRunner and summary-worker link over a MessageChannel (the summary side runs runSubsystemPass with an injected provider), the queue-owning IndexerService queues one subsystems job for two settles within the interval and one more after it; a pass whose summaries fail returns its outcome through the reply and the scheduler arms the retry (60 s, 120 s, 240 s, capped at 30 min, driven by mock timers); the summary side never enqueues; a job rejected because the summary worker went is retried; dispose (both stop paths) clears every timer and a timer firing while the queue is stopping queues nothing. The same scheduling is checked with threads off (one IndexerService).
  - Subjects: `enqueueSubsystemsIfComplete`, `runIndexJob`, `IndexerService.subsystemPass`
  - Fixtures: `SummaryRunner and SummaryWorkerLink over a node:worker_threads MessageChannel; mock timers; injected provider`
- **integration** — Retry end to end after an outage: with an injected provider that fails while 'down' and succeeds after, a pass leaves summaries empty and its outcome arms the retry on the queue owner; when the retry job runs after the provider is up, the summaries are written; summary calls never overlap (a provider that counts concurrent calls sees at most one) and each waits for code work.
  - Subjects: `IndexerService.subsystemPass`, `runSubsystemPass summaries`
  - Fixtures: `injected LLMProvider double with an outage switch and a concurrency counter`
- **smoke** — Cost bound on the installed daemon: on the largest graph-complete registered repository, the pass's log line before the change (whole-repository read per settle, elapsed measured from the job's start and end) and after (mode, filesRead, elapsedMs) for a comment-only save and for a save that adds a cross-file call; recorded as evidence with the numbers.
  - Subjects: `the installed daemon's subsystem pass`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `integration: incremental pass equals the full pass, and a comment-only edit is mode 'unchanged' with filesRead 1 (no whole-repository re-read, no regroup)` |
| `ac2` | `integration: across the worker boundary, two settles within the pacing interval queue one subsystems job, and the pacing timer queues the next after it` |
| `ac3` | `integration: incremental pass equals the full pass after each edit in the sequence`, `integration: an interleaved write keeps its changed-file entry (stamp check)`, `integration: every edge site records its source file in the same transaction`, `integration: a fault in the publication transaction leaves contributions, groups and the record unchanged, and the next pass converges`, `integration: an unchanged importer stays correct while its target gains, loses and regains code entities` |
| `ac4` | `integration: a failed summary's outcome crosses the worker boundary and arms the bounded back-off on the queue owner; a rejected job (summary worker gone) is retried`, `integration: after the outage a retry writes the summaries; summary calls never overlap and wait for code work` |
| `ac5` | `smoke: cost of the pass before and after on the largest graph-complete repository` |

## 6. Migration

**State before:** Every settle on a graph-complete repository queues a subsystems job (src/indexer/index.ts:1036); each settle advances the generation, so runSubsystemPass finds its groups older and re-reads every entity and every grouping-kind edge of the repository and regroups from scratch (src/indexer/subsystem-pass.ts:148, src/indexer/subsystem-pass.ts:164). Back-to-back settles run back-to-back passes (the queue collapses only a job still queued, src/daemon/queue.ts:275-276). A failed summary stays empty until a full index, settle or clean-up queues the job again (src/indexer/index.ts:655-662 discards summariesFailed).

**State after:** The store records, in the same transaction, each file whose grouping inputs change (subsystem_dirty, stamped) and the pass keeps per-file contributions (subsystem_file). A pass recomputes only recorded files and regroups in memory only when a contribution changed; otherwise it restamps the groups. The first pass for each repository in a daemon process is a full pass (self-healing after a downgrade, a restore or any unrecorded change). Passes are paced to at most one per repository per 60 s, and a pass with failed summaries re-queues itself on a 60 s doubling back-off capped at 30 minutes.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Open two new named sub-databases, subsystem_dirty and subsystem_file, beside subsystem and subsystem_by_file (13 of MAX_DBS 64 are open). They are created empty on open, so no schema-version bump and no data migration: SCHEMA_VERSION stays 8, and an older daemon opening the store ignores them. — ↩ rollbackable
2. Start recording changed files at the six edge sites and in commitFile. Additive: writes go to the new table inside existing transactions. — ↩ rollbackable
3. The incremental pass: the first pass per repository in a process is mode 'full' (rebuilds subsystem_file and clears subsystem_dirty for the repository); later passes are incremental. A store written by an older daemon (no contribution rows, or contributions that an older daemon left stale while it changed edges without recording them) is therefore corrected by the first pass after the update. — ↩ rollbackable
4. Pacing and retry state on the queue-owning IndexerService, in memory only; the summary-job reply gains an optional result (the pass outcome). Both are internal to the daemon's own processes. — ↩ rollbackable

**Backward compat:** No IPC, request or stored-row format change for existing tables; index.subsystems answers the same groups (they equal the full pass's). SubsystemPassResult gains fields (mode, filesRead, elapsedMs), internal to the daemon. computedAtGeneration may now be restamped without a regroup; its meaning (the groups are current for that generation) is unchanged for readers. Downgrading to an older daemon is safe: it never reads the new tables, and on re-upgrade the first pass per repository is full. The summary-job reply's new result field is optional and read only by the code-indexing worker of the same daemon build.

## 7. Alternatives considered

### 7.1 a1: Incremental file graph: per-file contributions + changed-file record + pacing + retry back-off — **CHOSEN**

Store each code file's outgoing file-graph contribution and a per-repository record of files whose grouping inputs changed; a pass recomputes only those files, regroups in memory only when a contribution changed, runs at most once per minimum interval, and a failed summary schedules a bounded back-off re-queue.

The store records, in the same write transaction, the repository-relative file of the source entity of every grouping-kind edge it writes or removes (the six edge sites) and every file a commit changes (its code-entity count), in a new per-repository changed-file record. A new per-file contribution table holds, for each code file, its code-entity count and its outgoing weighted file-pair edges (target file, weight, per-kind counts), written by the subsystem pass. The pass: graph incomplete -> unchanged; no contribution table (first run, upgrade) or a full index -> today's full read, which writes the whole table and clears the record; otherwise read the changed-file record, recompute contributions for those files only (their entities via the entity_by_file index, their out-neighbours, each target's file from its entity row), and compare with the stored rows. When none differs, restamp the stored groups at the current generation and only retry summaries; when one differs, update those rows, read the whole contribution table (one range read, O(files)), regroup in memory with groupSubsystems and writeSubsystems (summaries kept by membership id). Record entries read are cleared; ones written during the pass stay, so groups converge. Pacing: enqueueSubsystemsIfComplete queues at most one pass per repository per minimum interval (a trailing per-repo timer, like settleTimers). Retry: a pass that ends with summariesFailed > 0 (not stopped) arms a per-repo re-queue timer with exponential back-off (1 min doubling to a 30 min cap), reset by a pass with no failure; the job still runs in the summary lane, one at a time, after code work.

### 7.2 a2: Change flag: skip unchanged settles, full regroup otherwise + pacing + retry

The store sets a per-repository 'grouping inputs changed' flag at the edge write sites; the pass skips (restamps) when the flag is clear and does today's full read and regroup when it is set; pacing and retry as in a1.

Same edge-site hooks as a1 but writing one flag per repository instead of the files. The pass reads and clears the flag: clear -> restamp the generation and retry summaries; set -> today's whole-repository path. Pacing by a minimum interval and retry back-off as in a1.

**Rejected because:** Meets the no-op case but leaves the common case (a save that changes a call or an import) at full cost.

### 7.3 a3: Pacing only + retry

Keep the full pass; run it at most once per minimum interval per repository (trailing), and retry failed summaries with back-off.

enqueueSubsystemsIfComplete arms a trailing per-repo timer so at most one subsystems job runs per interval (for example five minutes); the pass itself is unchanged. Retry back-off as in a1.

**Rejected because:** Bounds the rate only; each run remains a whole-repository read.

## 8. References

- **[[c1]]** `code` `src/indexer/subsystem-pass.ts:164` — "const entities = await listEntitiesForRepo(db, repoPath);"
- **[[c2]]** `code` `src/indexer/subsystem-pass.ts:255-262` — "log.warn({ repo: repoPath, subsystem: sub.id, name: sub.name, err: err instanceof Error ? err.message : String(err) }, 'subsystem pass: a summary call failed; it stays empty until the next pass');"
- **[[c3]]** `code` `src/indexer/index.ts:669-671` — "if ((await readIndexState(repoPath))?.graphComplete === true) this.queue.enqueue({ kind: 'subsystems', repoPath });"
- **[[c4]]** `code` `src/daemon/queue.ts:275-276` — "if (queue.some(j => j.kind === 'subsystems' && j.repoPath === job.repoPath)) return;"
- **[[c5]]** `code` `src/db/subsystems.ts:55` — "export async function writeSubsystems(repoPath: string, generation: number, groups: readonly SubsystemGroupRow[]): Promise<void> {"
- **[[c6]]** `prior-artifact` `docs/standalone/subsystem-pass-regroups-whole-repository-after-E202611027d42b5dc/ISSUE.md`
- **[[c7]]** `code` `src/db/graph/store.ts:85` — "export const MAX_DBS = 64;"

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.story (design.story)

**5 do not hold · 0 could not be verified · 2 hold** · template `design-issue` · model `cli-codex:gpt-6.1-sol` · reviewed 2026-11-03T13:30:03.768Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

| Check item | Severity | Premise | Evidence | Action |
| --- | --- | --- | --- | --- |
| fix-targets-defect | HIGH | Clearing dirty entries atomically with contribution writes guarantees recovery from store errors and convergence of stored groups. | Section 2.1 writes contributions and clears dirty entries before regrouping and calling writeSubsystems. In src/db/subsystems.ts:55-71, writeSubsystems opens its own transaction: 'await withWriteTxn(s => {'. If that later transaction fails, contributions are already updated and dirty entries consumed, while old groups remain. The next pass can find no changed contributions and restamp those incorrect groups. The first-pass-per-process rebuild does not recover a failure within the running process. [files: src/db/subsystems.ts, src/db/graph/store.ts, src/indexer/subsystem-pass.ts, docs/standalone/subsystem-pass-regroups-whole-repository-after-E202611027d42b5dc/S001/LLD.md] | Specify atomic publication of contributions, groups/restamp and conditional dirty consumption, or retain a durable regroup-required marker until group publication succeeds. Add fault injection between contribution persistence and group publication. |
| change-sites | HIGH | Changes confined to the listed IndexerService methods can implement production pacing, retry enqueueing and timer shutdown. | indexing-worker.ts constructs one IndexerService and routes summary jobs through runIndexJob to another IndexerService constructed in summary-worker.ts. Consequently, subsystemPass records start times in the summary worker, while settle/full-index enqueue requests execute in the code worker. Their in-memory pacing maps are separate. Furthermore, SummaryWorkerLink.enqueue explicitly throws: 'the document-summary worker does not enqueue; jobs come from the code-indexing worker'. The proposed retry therefore throws when it tries to enqueue. IndexerService currently has no stop method; indexing-worker.ts shutdown stops the queue and watcher without an indexer timer-cleanup hook. [files: src/indexer/index.ts, src/daemon/threads/indexing-worker.ts, src/daemon/threads/summary-worker.ts, src/daemon/threads/summary-link.ts] | Add the worker channel and lifecycle change sites. Define one scheduling owner, transport pass-start/result information and retry requests across the worker boundary, and wire timer disposal into shutdown. Document that interaction explicitly; a small sequence diagram would help. |
| preserved-behaviour | HIGH | Restricting incremental relationship targets to code entities preserves the full pass's file graph. | The full pass explicitly includes both code entities and file entities: 'CODE_KINDS.has(e.kind) \|\| e.kind === \\'file\\'' at subsystem-pass.ts:175. The same fileOfU64 map identifies sources and targets. cross-file-resolver.ts:295-300 writes IMPORTS with 'to: r.targetFileId'. Section 2.1's code-entity-only target filter drops these file-to-file imports. Existing subsystem-pass.test.ts expects a connection containing both IMPORTS and CALLS, so this changes established graph weights and potentially memberships and summary ids. [files: src/indexer/subsystem-pass.ts, src/indexer/cross-file-resolver.ts, src/indexer/__tests__/subsystem-pass.test.ts] | Specify the exact existing endpoint rule for both sources and targets: code entities plus file entities belonging to files containing code, same repository, different files. Correct the relationship prose; the otherwise explicit ownership and direction do not require an ERD. |
| preserved-behaviour | HIGH | Recording changed outgoing edges and incoming edges into removed entities is sufficient when a file gains or loses its last code entity. | The full pass's target eligibility depends on 'const codeFiles = new Set(code.map(...))'. commitFile:652-660 processes incoming holders only for 'existing.filter(u64 => !seen.has(u64))'. A surviving file entity is not removed when its file gains its first code entity. For example, A imports an otherwise empty B; recomputing A omits B because B has no contribution row. Adding a function to B records B, but neither rewrites A's import nor removes B's file entity. A remains unrecorded, so its cached contribution still lacks an import that a full pass now includes. [files: src/indexer/subsystem-pass.ts, src/db/entities.ts, src/indexer/cross-file-resolver.ts, docs/standalone/subsystem-pass-regroups-whole-repository-after-E202611027d42b5dc/S001/LLD.md] | Define invalidation for target-file eligibility transitions, or retain outgoing candidate file edges independently of current target eligibility and filter them during regrouping. Test an unchanged importer while its target gains, loses and regains code entities. |
| tests | MED | The proposed tests adequately prove production pacing/retry and convergence acceptance criteria. | Section 5 maps ac2/ac4 to IndexerService subclasses, mock timers and an injected provider. The referenced subsystems-job.test.ts runs a local service; its worker check verifies forwarding through a fake SummaryRunner, not communication between the two real service instances. Such tests can pass while production retry enqueueing throws and pacing state is split. The ac3 edit sequence and stamp test also omit failure after contribution publication but before group publication, and target eligibility changes with an unchanged importer. [files: src/indexer/__tests__/subsystems-job.test.ts, src/indexer/__tests__/subsystem-pass.test.ts, src/daemon/threads/summary-link.ts, docs/standalone/subsystem-pass-regroups-whole-repository-after-E202611027d42b5dc/S001/LLD.md] | Add a worker-boundary pacing/outage-recovery test, a group-publication failure recovery test, and an unchanged-importer target-eligibility test. Keep the proposed full/incremental comparison, clock-driven back-off checks and before/after cost measurement. |

#### Could not verify (does not block)

_None._
