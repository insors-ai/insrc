<!-- insrc:artifact PLAN-7d42b5dceb62afec-S001 -->

# Plan: E202611037d42b5dc:S001

## Summary

**Epic:** `subsystem-pass-regroups-whole-repository-after`
**LLD run:** `wf-1793712130091-0po013`
**LLD effective hash:** `f009825f00df...`

Building this Story adds two store tables and records, in the store's own transactions, every file whose cross-file relationships change; then makes the subsystem pass recompute only those files, publish its results in one guarded transaction, and skip the regroup when nothing changed. Scheduling moves to the one IndexerService that owns the queue, which paces passes by their real start time and retries failed summaries on a bounded back-off across the worker boundary. The last task measures the cost before and after on the installed daemon and runs the full sweep.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Store tables and the changed-file record | M | — | integration: S001 t1: every change site records its source file in the same transaction, and a non-grouping kind records nothing; integration: S001 t1: entity-row removal records its file on every path, and a whole-repository delete drops the contributions and bumps the reset counter; integration: S001 t1: a record entry is consumed only while its stamp is unchanged | [[c2]] [[c3]] [[c4]] |
| 2 | **`t2`** Incremental contributions and modes | M | `t1` | integration: S001 t2: after each edit in the sequence the incremental pass stores what a forced full pass stores, and a comment-only edit is unchanged with one file read; integration: S001 t2: an unchanged importer stays correct while its target gains, loses and regains code entities; integration: S001 t2: the first pass in a process and the first after a full index are full, including after an isolated file vanished without a watcher event | [[c1]] [[c3]] |
| 3 | **`t3`** Atomic publication and the reset guard | M | `t2` | integration: S001 t3: a fault in the publication transaction changes nothing, and the next pass converges; integration: S001 t3: an edge written while the pass runs keeps its record entry; integration: S001 t3: a pass held across a full index publishes nothing, and the next full pass drops the deleted file | [[c1]] [[c6]] |
| 4 | **`t4`** One scheduling owner: start-based pacing and summary retry across the worker boundary | M | `t3` | integration: S001 t4: across the worker link, passes are paced by their actual starts, even when the lane or a held hand-over delays a start; integration: S001 t4: failed summaries re-queue on the bounded back-off at the queue owner, a clean pass resets it, and a rejected job is retried; integration: S001 t4: after an outage a retry writes the summaries, one call at a time after code work; integration: S001 t4: dispose clears the timers on both stop paths, and a timer firing while stopping queues nothing | [[c5]] [[c6]] |
| 5 | **`t5`** Cost measurement on the installed daemon and the full sweep | S | `t1`, `t2`, `t3`, `t4` | smoke: S001 t5: on the installed daemon a comment-only save no longer re-reads the repository, and a cross-file save reads only the changed files | [[c7]] [[c8]] |

### 1.1 E202611037d42b5dc:S001:T001 — Store tables and the changed-file record

Open subsystem_dirty and subsystem_file in the graph store. Record (repoId, repository-relative file) with an increasing stamp in the same transaction at every grouping-input change: commitFile (the committed file once), putEdgeInTxn outside a commit (promotions with the row's repoId/fromFile; upsertRelations from the source row), deleteResolvedRelations, returnInferredSqlReferencesToPending, the out/in sweeps, and entity-row removal (removeEntityRowInTxn) on every path. deleteEntitiesForRepo deletes the repository's contribution rows and record entries and increments its reset counter (reserved key repoId ++ 0x00) in its transaction. Store helpers to read the record with stamps, read/write contribution rows, read the reset counter, and consume entries conditionally inside a given transaction.

**Acceptance checks:**
- Each change site records its source file in the same transaction; a non-grouping kind records nothing
- Entity-row removal records its file on commitFile, detachDeleteEntities and deleteEntitiesForRepo paths
- deleteEntitiesForRepo drops the repository's contribution rows and record and increments its reset counter
- A conditional consume deletes an entry only when its stamp equals the one read

### 1.2 E202611037d42b5dc:S001:T002 — Incremental contributions and modes

runSubsystemPass computes per-file contribution rows with the full pass's endpoint rule (sources and targets are code or file entities of the repository in different files; edges kept whatever the target file's code status) and chooses mode 'full' (no contribution rows, null computedAtGeneration, or the first pass per repository in this process), 'incremental' (a recorded file's row or the file set changed: regroup over files with entityCount > 0) or 'unchanged' (restamp only). The result gains mode, filesRead, elapsedMs and startedAt; one log line with them. Publication in this task may use the existing writeSubsystems; t3 makes it one guarded transaction.

**Acceptance checks:**
- After each edit in the sequence (comment-only, new call, removed call, new file, deleted file, last code entity removed, another file's call resolved by a settle) the stored groups, ids and contribution rows equal a forced full pass
- A comment-only edit is mode 'unchanged' with filesRead 1 and no subsystem rewrite
- An unchanged importer stays correct while its target gains, loses and regains code entities
- The first pass per repository in a process, and the first after a full index, is mode 'full'

### 1.3 E202611037d42b5dc:S001:T003 — Atomic publication and the reset guard

Publish the recomputed contribution rows, the groups (an in-transaction form of writeSubsystems) or the restamp, and the conditional record consumption in ONE write transaction that first re-reads the repository's reset counter and publishes nothing when it differs from the value read at the pass's start.

**Acceptance checks:**
- A fault in the publication transaction leaves contributions, groups and record unchanged; the next pass converges to the forced full pass
- An edge written between the pass's read and its publication keeps its record entry
- A pass held before publication across a full index publishes nothing, and the next (full) pass equals a forced full pass with the deleted file absent

### 1.4 E202611037d42b5dc:S001:T004 — One scheduling owner: start-based pacing and summary retry across the worker boundary

IndexerService.subsystemPass and processJob resolve { summariesFailed, stopped, startedAt } for a subsystems job; the summary worker's reply carries it (ReplyEnvelope.result), SummaryRunner.run and runIndexJob resolve it, and both queue drivers hand it (or a failure) to the queue-owning IndexerService. That scheduler tracks queued/in-flight, the last actual start, the pacing timer (queue only when none queued or in flight and the last actual start >= 60 s ago) and the retry timer (60 s doubling, capped at 30 min, reset by a clean pass, a failed job counted as a failure starting at its rejection); timers are unref'd, do nothing while the queue is stopping, and are disposed from both stop paths.

**Acceptance checks:**
- Across the real worker link, two settles within the interval queue one job; consecutive actual starts are at least 60 s apart even when the summary lane or a held hand-over delays a start
- A pass with failed summaries arms the retry with the 60 s / 120 s / 240 s ... 30 min back-off on the queue owner; a clean pass clears it; a stopped pass changes nothing; a rejected job is retried
- After an outage a retry writes the summaries; summary calls never overlap and each waits for code work
- Dispose on both stop paths clears every timer; a timer firing while the queue is stopping queues nothing

### 1.5 E202611037d42b5dc:S001:T005 — Cost measurement on the installed daemon and the full sweep

First, while the installed daemon still runs its current commit (the old pass), measure the subsystem pass on the largest graph-complete registered repository (job start to end, entities read) for a comment-only save and a save adding a cross-file call. Then, after the push, update and restart the installed daemon and measure the same saves from the pass's log line (mode, filesRead, elapsedMs). Record both as evidence; then run the full sweep per directory and classify every failure.

**Acceptance checks:**
- Evidence file with before (old pass) and after numbers for both saves on the same repository
- Full sweep recorded with every failure classified

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| the subsystem changed-file record and its write sites | `t1` |
| commitFile | `t1` |
| putEdgeInTxn | `t1` |
| deleteResolvedRelations | `t1` |
| returnInferredSqlReferencesToPending | `t1` |
| runSubsystemPass | `t2` |
| the subsystem file contribution table | `t1`, `t2` |
| SubsystemRow.computedAtGeneration restamp | `t2` |
| runSubsystemPass publication | `t3` |
| the subsystem changed-file record | `t1`, `t3` |
| enqueueSubsystemsIfComplete | `t4` |
| runIndexJob | `t4` |
| IndexerService.subsystemPass | `t4` |
| runSubsystemPass summaries | `t4` |
| the installed daemon's subsystem pass | `t5` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD S001 contractDetails runSubsystemPass`
- **[[c2]]** `prior-artifact` `LLD S001 dataModelChanges subsystem changed-file record (subsystem_dirty)`
- **[[c3]]** `prior-artifact` `LLD S001 dataModelChanges subsystem file contribution (subsystem_file)`
- **[[c4]]** `prior-artifact` `LLD S001 contractDetails commitFile, putEdgeInTxn, deleteResolvedRelations, returnInferredSqlReferencesToPending, deleteEntitiesForRepo`
- **[[c5]]** `prior-artifact` `LLD S001 contractDetails enqueueSubsystemsIfComplete, runIndexJob, IndexerService.subsystemPass`
- **[[c6]]** `prior-artifact` `LLD S001 errorPaths`
- **[[c7]]** `prior-artifact` `LLD S001 testStrategy`
- **[[c8]]** `prior-artifact` `LLD S001 migration`
