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
- `store error` when A read or write of the store fails: the pass throws as today; the changed-file record is cleared only in the transaction that writes the recomputed contributions, so nothing is lost and the next pass recomputes the same files.

**Preconditions:**
- The repository is registered.

**Postconditions:**
- Graph incomplete: nothing grouped, as today.
- No contribution rows for the repository (first pass, or a store written before this change), or stored groups with computedAtGeneration null: mode 'full' -- today's whole-repository read; it also writes every code file's contribution row and clears the repository's changed-file record.
- Otherwise: mode 'incremental' or 'unchanged'. The files in the changed-file record are recomputed from the store (their entities through the entity_by_file index, their grouping-kind out-neighbours with evidence, each target's file from its entity row, only targets that are code entities of the same repository). A file with no code entities left has its row removed. When every recomputed row equals the stored one: mode 'unchanged', the stored groups are restamped at the current generation (no regroup, no subsystem rewrite). Otherwise: mode 'incremental', the changed rows are written, the repository's whole contribution table is read (one range read), groupSubsystems regroups it with directoryHubs over the current file set, and writeSubsystems stores the groups (summaries kept by membership id).
- The files consumed from the changed-file record are cleared in the same transaction as their recomputed rows; a file recorded after the pass read the record stays recorded, so the next pass sees it (convergence).
- The groups any mode stores equal what mode 'full' would compute from the same store (same file set, same pair weights and kind counts, same hubs).
- Summaries for groups without one are then written as today (one call at a time, after code work).

### 2.2 `IndexerService.subsystemPass`

```typescript
protected subsystemPass(repoPath: string): Promise<void>
```

**Parameters:**
- `repoPath: string` — The repository whose pass the subsystems job runs.

**Returns:** `Promise<void>` — Runs runSubsystemPass and acts on its result.

**Postconditions:**
- Records the pass's start time for pacing.
- When the result has summariesFailed > 0 and stopped is false, arms the repository's retry timer: delay = 60 s x 2^(consecutive failing passes - 1), capped at 30 minutes; when it fires it calls enqueueSubsystemsIfComplete.
- When the result has summariesFailed === 0 and stopped is false, the consecutive-failure count resets and an armed retry timer is cleared.
- Logs mode, filesRead, elapsedMs, subsystems, summariesWritten and summariesFailed in one line.

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
- Graph not complete: nothing queued, as today.
- No pass started for the repository within the minimum interval (60 s): the job is queued now (the queue still collapses a duplicate that is queued).
- A pass started within the interval: a per-repository pacing timer is armed (if none is) to call it again when the interval has elapsed; further requests during the interval are absorbed by that timer.
- Pacing and retry timers are unref'd and cleared when the indexer stops; they never call the model themselves.

### 2.4 `commitFile`

```typescript
commitFile(commit: FileCommit): Promise<FileCommitResult>
```

**Parameters:**
- `commit: FileCommit` — One file's entities and relationships, unchanged.

**Returns:** `Promise<FileCommitResult>` — Unchanged.

**Postconditions:**
- In the commit's transaction the committed file (repository-relative) is added to its repository's changed-file record once, covering its swept and rewritten outgoing edges and its code-entity count.
- Each other file whose entity held an edge into a removed entity of the committed file (the incoming sweep that returns it to pending) is added to the record.

### 2.5 `putEdgeInTxn`

```typescript
putEdgeInTxn(s: GraphStore, fromU64: bigint, kindByte: number, toU64: bigint, evidence: RelationEvidence | undefined, rel: Relation): void (internal)
```

**Parameters:**
- `fromU64: bigint` — The edge's source entity.

**Returns:** `void` — Unchanged edge write.

**Postconditions:**
- For a grouping kind (IMPORTS, CALLS, INHERITS, IMPLEMENTS, REFERENCES) written outside a file commit (the cross-file pass's promotions, upsertRelations), the source's repository and file are added to the changed-file record in the same transaction. The caller supplies them where it already holds them (a pending row's repoId and fromFile); otherwise they are read from the source's entity row.

### 2.6 `deleteResolvedRelations`

```typescript
deleteResolvedRelations(db: DbClient, items: ReadonlyArray<{ from: string; kind: RelationKind; to: string }>): Promise<void>
```

**Parameters:**
- `items: ReadonlyArray<{ from; kind; to }>` — Edges to remove, unchanged.

**Returns:** `Promise<void>` — Unchanged.

**Postconditions:**
- Each removed grouping-kind edge adds its source's repository and file to the changed-file record in the same transaction.

### 2.7 `returnInferredSqlReferencesToPending`

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

Key repoId u32 BE ++ repository-relative file path, empty value: a file whose grouping inputs (its outgoing grouping-kind edges or its code entities) changed since the subsystem pass last recomputed it. Written in the same transaction as every such change (the six edge sites and commitFile); read and cleared by runSubsystemPass, entry by entry in the transaction that writes the recomputed contribution. Removed with the repository's other subsystem rows when the repository is removed. A plain set: writing an existing key is idempotent.

**Call sites:**
- `src/db/relations.ts:189`
- `src/db/relations.ts:242`
- `src/db/relations.ts:578`
- `src/db/relations.ts:662`
- `src/db/relations.ts:770-780`
- `src/db/entities.ts:1534`
- `src/db/entities.ts:1567`
- `src/indexer/subsystem-pass.ts:148`

### 3.2 `subsystem file contribution (new store table subsystem_file)` — new

Key repoId u32 BE ++ repository-relative code file, value: { entityCount: number; out: Array<{ to: string (repository-relative file); weight: number; kinds: Partial<Record<RelationKind, number>> }> } -- exactly the per-file slice of what the full pass aggregates today (byPair entries whose a is this file, and entityCount). Written by runSubsystemPass (all rows in mode 'full', changed rows in mode 'incremental'); a row is removed when its file has no code entity left. Read whole (one range read per repository) to regroup. Edges to a file without a row (not a code file) are ignored when regrouping, as the full pass ignores them.

**Call sites:**
- `src/indexer/subsystem-pass.ts:164`
- `src/indexer/subsystem-pass.ts:177-201`
- `src/db/subsystems.ts:55`

### 3.3 `SubsystemRow.computedAtGeneration (subsystem table)` — invariant-change

Today it is written only when the groups are recomputed. Mode 'unchanged' now restamps it at the current generation without rewriting the groups, meaning 'these groups are what the graph at this generation groups into'. Summaries and ids are untouched by a restamp.

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
- **Reading the changed files' entities or edges fails mid-pass, or the process stops** (recoverable)
  - Detection: The pass awaits the store reads and throws; or shutdown stops the summary lane
  - Response: No record entry is cleared (clearing happens only in the transaction that writes the recomputed rows), the stored groups and contributions stay as they were, and the next pass recomputes the same files.
  - User impact: The groups lag until the next pass.
- **The summary model fails (CLI logged out, provider down) during a pass** (recoverable)
  - Detection: summariseSubsystem throws a non-SummaryStop error; the pass returns summariesFailed > 0 with stopped false
  - Response: IndexerService.subsystemPass arms the retry timer (60 s, then 120 s, 240 s ... capped at 30 min); each retry is an ordinary subsystems job in the summary lane, so it waits for code work and runs one model call at a time. A pass with no failure resets the back-off.
  - User impact: Empty summaries are filled within the back-off after the model returns, without an edit or a restart.
- **The indexer stops while a pacing or retry timer is armed** (recoverable)
  - Detection: The indexer's stop path clears the per-repository timers (as it clears settle timers)
  - Response: No job is queued after stop; the timers are unref'd so they never keep the process alive.
  - User impact: None.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| First pass after the update on a repository whose subsystems were stored before this change (no contribution rows) | Mode 'full': today's whole-repository read, which also writes every contribution row and clears the repository's record; later passes are incremental. |
| A saved file whose edit changes no cross-file relationship (a comment, a body change that calls the same functions) | The commit records the file; the pass recomputes that one file's contribution, finds it equal to the stored row, restamps the groups at the current generation (mode 'unchanged'): no regroup, no subsystem rewrite, no summary call. |
| A saved file that adds a call to a function in another file | Mode 'incremental': the file's row changes, the table is read and regrouped in memory; the groups equal what a full pass would compute. |
| The settle's cross-file pass resolves another (unsaved) file's pending call to the saved file | The promotion's putEdgeInTxn records the holder's file, so it is recomputed too. |
| A file deleted, or a file whose last code entity is removed | The commit records the file; the pass finds no code entity and removes its row; files whose edges pointed into it were recorded by the incoming sweep and lose those edges. |
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
- The file graph is built from IMPORTS, CALLS, INHERITS, IMPLEMENTS and REFERENCES edges between code entities of two files of the repository, weighted by kind and evidence, plus directory hub edges; the stored groups (and their ids, so their summaries) are exactly what that graph groups into. [[c1]]
- writeSubsystems replaces a repository's set in one transaction and keeps the summary of a group whose membership id was stored before. [[c5]]
- The job is queued after a full index, a clean-up and every settle, and only when the graph is complete. [[c3]]

## 5. Test strategy

**Test framework:** `node:test with node:assert/strict, run by npx tsx --test (tests co-located in __tests__)`

**Test levels**

- **integration** — Changed-file record: over a temporary store, every edge site records its source file in the same transaction -- commitFile (the committed file and the files whose edges into its removed entities were swept), the cross-file pass's promotion, upsertRelations, deleteResolvedRelations, returnInferredSqlReferencesToPending -- and a non-grouping kind records nothing; the stamped entry is cleared only when its stamp is unchanged (an interleaved write keeps it).
  - Subjects: `the subsystem changed-file record and its write sites`, `commitFile`, `putEdgeInTxn`, `deleteResolvedRelations`, `returnInferredSqlReferencesToPending`
  - Fixtures: `temporary LMDB store (setGraphStorePath) and temp Lance, as src/indexer/__tests__/subsystem-pass.test.ts`
- **integration** — Incremental pass equals the full pass: over real TypeScript files read by the reader, committed and cross-file resolved, a sequence of edits (a comment-only edit, a new cross-file call, a removed call, a new file, a deleted file, a file losing its last code entity, a settle that resolves another file's pending call) is followed after each by runSubsystemPass; the stored groups, ids and per-file contribution rows equal those of a full pass computed from the same store into a second repository copy (or by forcing mode 'full'), and the reported mode is 'unchanged' only for the comment-only edit. The first pass on a store without contribution rows is mode 'full'. filesRead counts only the recorded files.
  - Subjects: `runSubsystemPass`, `the subsystem file contribution table`, `SubsystemRow.computedAtGeneration restamp`
  - Fixtures: `temporary store and repository with a few TypeScript files in two directories`
- **integration** — Pacing and retry through the IndexerService seams (as src/indexer/__tests__/subsystems-job.test.ts): two settles within the interval queue one job and arm one pacing timer that queues the next after the interval; a pass with summariesFailed > 0 arms a retry timer with the back-off sequence 60 s, 120 s, 240 s, capped at 30 min, and a pass without failure clears it; a stopped pass arms nothing; stop() clears every timer. Time is driven by an injected clock / mock timers so the test does not sleep.
  - Subjects: `IndexerService.subsystemPass`, `enqueueSubsystemsIfComplete`
  - Fixtures: `IndexerService test subclass with the subsystemPass / subsystemProvider seams and mock timers`
- **integration** — Retry end to end: with an injected provider that fails while 'down' and succeeds after, a pass leaves summaries empty and arms the retry; when the retry job runs after the provider is up, the summaries are written; summary calls never overlap (a provider that records concurrent calls sees at most one) and each waits for code work.
  - Subjects: `IndexerService.subsystemPass`, `runSubsystemPass summaries`
  - Fixtures: `injected LLMProvider double with an outage switch and a concurrency counter`
- **smoke** — Cost bound on the installed daemon: on the largest graph-complete registered repository, the pass's log line before the change (whole-repository read per settle, elapsed measured from the job's start and end) and after (mode, filesRead, elapsedMs) for a comment-only save and for a save that adds a cross-file call; recorded as evidence with the numbers.
  - Subjects: `the installed daemon's subsystem pass`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `integration: incremental pass equals the full pass, and a comment-only edit is mode 'unchanged' with filesRead 1 (no whole-repository re-read, no regroup)` |
| `ac2` | `integration: two settles within the pacing interval run one pass; the pacing timer queues the next after the interval` |
| `ac3` | `integration: incremental pass equals the full pass after each edit in the sequence`, `integration: an interleaved write keeps its changed-file entry (stamp check)`, `integration: every edge site records its source file in the same transaction` |
| `ac4` | `integration: a failed summary arms the retry with the bounded back-off and a later retry writes it after the outage`, `integration: summary calls never overlap and wait for code work` |
| `ac5` | `smoke: cost of the pass before and after on the largest graph-complete repository` |

## 6. Migration

**State before:** Every settle on a graph-complete repository queues a subsystems job (src/indexer/index.ts:1036); each settle advances the generation, so runSubsystemPass finds its groups older and re-reads every entity and every grouping-kind edge of the repository and regroups from scratch (src/indexer/subsystem-pass.ts:148, src/indexer/subsystem-pass.ts:164). Back-to-back settles run back-to-back passes (the queue collapses only a job still queued, src/daemon/queue.ts:275-276). A failed summary stays empty until a full index, settle or clean-up queues the job again (src/indexer/index.ts:655-662 discards summariesFailed).

**State after:** The store records, in the same transaction, each file whose grouping inputs change (subsystem_dirty, stamped) and the pass keeps per-file contributions (subsystem_file). A pass recomputes only recorded files and regroups in memory only when a contribution changed; otherwise it restamps the groups. The first pass for each repository in a daemon process is a full pass (self-healing after a downgrade, a restore or any unrecorded change). Passes are paced to at most one per repository per 60 s, and a pass with failed summaries re-queues itself on a 60 s doubling back-off capped at 30 minutes.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Open two new named sub-databases, subsystem_dirty and subsystem_file, beside subsystem and subsystem_by_file (13 of MAX_DBS 64 are open). They are created empty on open, so no schema-version bump and no data migration: SCHEMA_VERSION stays 8, and an older daemon opening the store ignores them. — ↩ rollbackable
2. Start recording changed files at the six edge sites and in commitFile. Additive: writes go to the new table inside existing transactions. — ↩ rollbackable
3. The incremental pass: the first pass per repository in a process is mode 'full' (rebuilds subsystem_file and clears subsystem_dirty for the repository); later passes are incremental. A store written by an older daemon (no contribution rows, or contributions that an older daemon left stale while it changed edges without recording them) is therefore corrected by the first pass after the update. — ↩ rollbackable
4. Pacing and retry timers in the indexer: in-memory only, nothing persisted. — ↩ rollbackable

**Backward compat:** No IPC, request or stored-row format change for existing tables; index.subsystems answers the same groups (they equal the full pass's). SubsystemPassResult gains fields (mode, filesRead, elapsedMs), internal to the daemon. computedAtGeneration may now be restamped without a regroup; its meaning (the groups are current for that generation) is unchanged for readers. Downgrading to an older daemon is safe: it never reads the new tables, and on re-upgrade the first pass per repository is full.

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
