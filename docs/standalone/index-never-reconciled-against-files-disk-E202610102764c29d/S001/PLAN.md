<!-- insrc:artifact PLAN-2764c29d7ccb66a5-S001 -->

# Plan: E202610102764c29d:S001

## Summary

**Epic:** `index-never-reconciled-against-files-disk`
**LLD run:** `wf-1791644365501-kpsmvb`
**LLD effective hash:** `4989a10d1a6e...`

The build adds two small store functions, a new kind of index job with its place in the queue, and the clean-up pass itself in the indexer, then wires the pass into daemon start and the full index. Most of the work, and most of the tests, are in the pass: what it removes, what it must never remove, and what it does afterwards. The last task updates the guide and checks the installed daemon's index of this repository after the update.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add the two store functions the clean-up needs | S | — | unit: the read of a repository's stored files returns each file once, only that repository's files, and no empty path; unit: the removal of one repository's unresolved relations of a file leaves another repository's unresolved relations of the same path; unit: an unregistered repository has no stored files and its removal of unresolved relations does nothing | [[c1]] |
| 2 | **`t2`** Add the clean-up job kind to the job union and the queue | S | — | unit: a queued clean-up job is counted as pending for its repository, and a second one for the same repository is not queued; integration: a clean-up job for a registered repository with nothing stored is processed without error | [[c2]] |
| 3 | **`t3`** Build the clean-up pass and keep ignored files out of file jobs | M | `t1`, `t2` | integration: the clean-up removes a file that is gone and a file under an ignored directory, with their relations and unresolved relations, and leaves every other file of the repository and every file of another repository as it was; integration: a file that exists and is not ignored is kept although the file listing leaves it out, an entity with no file path is kept, and a file whose name only contains an ignored name is kept; integration: a repository whose directory is missing loses nothing, and a file whose presence cannot be told is kept; integration: running the clean-up a second time removes nothing, and a repository with nothing stale is left as it was; integration: a clean-up that removed files runs the resolver once inside the job, leaves no settle timer armed and removes the repository's cached exploration results, and one that removed nothing leaves them; integration: a file whose parent directory became a file is removed as absent; integration: the clean-up of a repository that ignores a directory leaves the entities a nested registered repository holds for the files under it; integration: the vector rows of a removed file are gone after the clean-up and those of a kept file remain; integration: a create or update file job for a file under an ignored directory indexes nothing, and one for a file elsewhere is indexed; integration: a kept file's link into a removed entity is removed with it, and the kept file's other links and entities stay; integration: the clean-up method called directly removes the stale files, runs no resolver and removes no cached result | [[c3]] [[c6]] |
| 4 | **`t4`** Run the clean-up at daemon start and inside a full index | S | `t3` | integration: a ready repository gets a clean-up job at daemon start, one that gets a full index at start gets no separate one, and a full index runs the clean-up before it marks the repository ready; integration: a repository left indexing with a last-indexed time gets a clean-up job at daemon start | [[c4]] |
| 5 | **`t5`** Describe the clean-up in the guide and check the installed daemon | S | `t4` | smoke: on the installed daemon after the update, the files under this repository's build output and the deleted test file have no entities, a source file still has its entities, and the repository's count of JavaScript files has fallen | [[c5]] |

### 1.1 E202610102764c29d:S001:T001 — Add the two store functions the clean-up needs

In src/db/entities.ts add listEntityFilesForRepo(db, repo): for one repository, each non-empty absolute file path with the ids of that repository's entities in it, read in one pass over the entity table without building entities. In src/db/relations.ts add deleteUnresolvedForRepoFile(db, repo, file): remove one repository's unresolved relations of one file by a direct read of the index by repository and file.

**Acceptance checks:**
- listEntityFilesForRepo returns each file of the repository once with all of that repository's entity ids for it, no file of another repository and no empty path.
- deleteUnresolvedForRepoFile removes the named repository's unresolved relations of the file and leaves another repository's unresolved relations of the same path.
- An unregistered repository gives an empty map and a no-op delete.

### 1.2 E202610102764c29d:S001:T002 — Add the clean-up job kind to the job union and the queue

Add `{ kind: 'reconcile'; repoPath: string }` to IndexJob in src/shared/types.ts. In src/daemon/queue.ts count a queued `reconcile` job for its repository in depthForRepo and keep at most one queued per repository in enqueue. Add the `case 'reconcile'` to processJob in src/indexer/index.ts, calling a reconcileRepo method that this task leaves as a stub returning zero counts, so the tree compiles.

**Acceptance checks:**
- A queued clean-up job is counted as pending for its repository and not for another.
- A second clean-up job for the same repository is not queued; one for another repository is.
- processJob accepts a `reconcile` job and returns without error for a registered repository with nothing stored.

### 1.3 E202610102764c29d:S001:T003 — Build the clean-up pass and keep ignored files out of file jobs

Implement reconcileRepo(repoPath) on IndexerService: guard a missing repository root; read the stored files (t1); for each, decide absent (the presence check answers ENOENT or ENOTDIR), ignored (a path segment relative to the repository is in resolveRepoIgnore's list, the rule of hasIgnoredSegment), not checked (any other error; kept) or kept; remove an absent or ignored file's entities with deleteEntitiesById and its unresolved relations with deleteUnresolvedForRepoFile. Return the counts; reconcileRepo itself runs no resolver and removes no cached result. In the `reconcile` job: when at least one file was removed, run runCrossFileResolver once for the repository and the two endpoint passes (not fatal), and call deleteCachedExplorationsForRepo; arm no settle timer; log the counts. The presence check is a function held by the service, the real stat by default, replaceable through an optional last constructor argument. In fileEvent, make a create or update for a file with an ignored segment end after a debug log; a delete is unchanged.

**Acceptance checks:**
- A file that is gone, one whose parent directory became a file, and one under an ignored directory lose their entities, edges, unresolved relations and vector rows; every other file of the repository and every file of another repository is as before.
- A file that exists and is not ignored, an entity with no file path and a file whose name only contains an ignored name are kept.
- A missing repository root removes nothing; a file whose presence cannot be told is kept and counted once as not checked.
- A nested registered repository keeps its entities for files under a directory its parent ignores.
- After removals the resolver ran once in the job, no settle timer is armed and the repository's cached exploration results are gone; with no removals they are kept and no resolver ran.
- reconcileRepo called directly removes the stale files, runs no resolver and removes no cached result; only the job does.
- A second run removes nothing.
- A create or update file job for a file under an ignored directory indexes nothing; one for a file elsewhere is indexed.
- A kept file's link into a removed entity is gone and its other links stay.

### 1.4 E202610102764c29d:S001:T004 — Run the clean-up at daemon start and inside a full index

In start(), enqueue a `reconcile` job for each repository that is `ready` with a last-indexed time, whether or not the delta found changes, and for one stored as `indexing` with a last-indexed time; none for a repository that gets a `full` job. In fullIndex(), call reconcileRepo after the files are indexed and before runCrossFileResolver, with no resolver run of its own and no settle timer; a failure fails the full index as an indexing failure does.

**Acceptance checks:**
- A ready repository gets one clean-up job at start; a pending one gets a full job and no clean-up job.
- A repository stored as indexing with a last-indexed time gets a clean-up job at start.
- A full index of a repository holding a stale stored file leaves that file out of the index and marks the repository ready.

### 1.5 E202610102764c29d:S001:T005 — Describe the clean-up in the guide and check the installed daemon

In docs/daemon.md, where indexing is described, say that the index is cleaned at start and during a full index, what is removed and what is kept, that an ignored file is not indexed by a file job, and the limit on a kept file's link into a removed entity. After the build is pushed, update and restart the installed daemon and check this repository's index before and after with search.by_file and repo.stats. The check on the installed daemon is reported by the builder with its evidence, not run by the gate; this task is validated after the push and the daemon update.

**Acceptance checks:**
- docs/daemon.md describes the clean-up, when it runs, what it removes and its one limit.
- On the installed daemon after the update, files under this repository's build output and the deleted test file have no entities, a source file still has its entities, and the count of JavaScript files has fallen (reported by the builder with evidence).

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| the clean-up removes a file that is gone and a file under an ignored directory, with their relations and unresolved relations, and leaves every other file of the repository and every file of another repository as it was | `t3` |
| a file that exists and is not ignored is kept although the file listing leaves it out, an entity with no file path is kept, and a file whose name only contains an ignored name is kept | `t3` |
| a repository whose directory is missing loses nothing, and a file whose presence cannot be told is kept | `t3` |
| running the clean-up a second time removes nothing, and a repository with nothing stale is left as it was | `t3` |
| a clean-up that removed files runs the resolver once inside the job, leaves no settle timer armed and removes the repository's cached exploration results, and one that removed nothing leaves them | `t3` |
| a file whose parent directory became a file is removed as absent | `t3` |
| the clean-up of a repository that ignores a directory leaves the entities a nested registered repository holds for the files under it | `t3` |
| the vector rows of a removed file are gone after the clean-up and those of a kept file remain | `t3` |
| a create or update file job for a file under an ignored directory indexes nothing, and one for a file elsewhere is indexed | `t3` |
| a kept file's link into a removed entity is removed with it, and the kept file's other links and entities stay | `t3` |
| a ready repository gets a clean-up job at daemon start, one that gets a full index at start gets no separate one, and a full index runs the clean-up before it marks the repository ready | `t4` |
| a repository left indexing with a last-indexed time gets a clean-up job at daemon start | `t4` |
| the read of a repository's stored files returns each file once, only that repository's files, and no empty path | `t1` |
| the removal of one repository's unresolved relations of a file leaves another repository's unresolved relations of the same path | `t1` |
| a queued clean-up job is counted as pending for its repository, and a second one for the same repository is not queued | `t2` |
| on the installed daemon after the update, the files under this repository's build output and the deleted test file have no entities, a source file still has its entities, and the repository's count of JavaScript files has fallen | `t5` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD S001 dataModelChanges: the stored files of a repository (listEntityFilesForRepo, deleteUnresolvedForRepoFile)`
- **[[c2]]** `prior-artifact` `LLD S001 dataModelChanges: IndexJob gains the kind `reconcile`; the queue counts it and keeps one per repository`
- **[[c3]]** `prior-artifact` `LLD S001 contractDetails processJob: the `reconcile` job, reconcileRepo, and the error paths and edge cases of the clean-up`
- **[[c4]]** `prior-artifact` `LLD S001 contractDetails fullIndex and start: where the clean-up runs`
- **[[c5]]** `prior-artifact` `LLD S001 migration steps 4 and 5: update the installed daemon and the guide`
- **[[c6]]** `prior-artifact` `LLD S001 dataModelChanges: what the index holds for a repository; a create or update file job skips an ignored file`
