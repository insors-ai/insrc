<!-- insrc:artifact LLD-2764c29d7ccb66a5-S001 -->

# LLD: E202610102764c29d:S001

## Summary

**Epic:** `index-never-reconciled-against-files-disk`
**HLD base run:** `wf-1791644365501-kpsmvb`
**HLD effective hash:** `4989a10d1a6e...`

The indexer gains a clean-up pass for one repository: it removes from the index every file that is no longer on disk or that lies under a directory the repository ignores, together with that file's relations and vectors. The pass runs when the daemon starts, for every repository that is already indexed, and during a full index, so an index that holds stale files today is corrected without the user doing anything. Nothing else is removed.

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

### 2.1 `processJob`

```typescript
processJob(job: IndexJob): Promise<void>
```

**Parameters:**
- `job: IndexJob` — Unchanged, with one more kind: `{ kind: 'reconcile'; repoPath: string }`, the clean-up pass for one repository.

**Returns:** `void` — For a `reconcile` job: the stored files of the repository have been compared with the disk and with the repository's ignore list, and each file that is not on disk, or that has a path segment (relative to the repository) in the ignore list, has been removed from the index for this repository only: the entities this repository holds for the file (with their edges, name index entries and vectors, by the cascade the watcher's delete also ends in, reached here through deleteEntitiesById) and this repository's unresolved relations of the file. The watcher's own file deletes are not used, because they match a path in every repository: where a registered repository lies under a directory its parent ignores, they would remove the child's entities of files that exist and that the child does not ignore. A file counts as not on disk when the check of it answers `no such file or directory` (ENOENT) or `not a directory` (ENOTDIR). When at least one file was removed, the job then, inside itself, runs the cross-file resolver once for the whole repository and the two endpoint passes (which are not fatal, as in the settle pass), and removes the repository's cached exploration results (deleteCachedExplorationsForRepo), so an analysis cannot be answered from a result computed before the clean-up. It arms no settle timer. A stored entity with an empty file path is not considered. A file that exists and is not ignored is not touched, whatever the file listing says about it. For a `file` job with the event create or update: a file that has a path segment (relative to its repository) in the repository's ignore list is not indexed; the job ends after a debug log. Today fileEvent and indexFile never consult the ignore list, and the `index.file` request of the daemon enqueues such a job for any path, so without this check a file under an ignored directory can enter the index again between two clean-ups. A delete event is handled as today. The clean-up's work is done by a method of the service, `reconcileRepo(repoPath)`, which returns the counts (files compared, removed as absent, removed as ignored, not checked); the job logs them. The check of a file's presence is a function the service holds, the real stat by default, which a test can replace through an optional constructor argument.

**Errors:**
- `Error (from the store)` when A read or a delete of the store fails. The job fails as any job does; files removed before the failure stay removed, and the next pass continues from the state it finds.

**Preconditions:**
- The repository is registered.

**Postconditions:**
- The index holds no entity of the repository whose file is absent from disk or excluded by the repository's ignore list.
- Running the pass again removes nothing.

### 2.2 `fullIndex`

```typescript
fullIndex(repoPath: string): Promise<void>
```

**Parameters:**
- `repoPath: string` — Unchanged.

**Returns:** `void` — As today, and the clean-up pass is run for the repository after its files are indexed and before the cross-file resolver, so the one resolver run of the full index also covers the removals; the clean-up runs no resolver of its own there and arms no settle timer. The full index stamps a new last-indexed time as today, which already puts the cached exploration results out of use, so a full index (also one asked for with `repo.reindex`) leaves no stale file.

**Postconditions:**
- A failure of the clean-up pass fails the full index as a failure of indexing does: the repository is marked `error` with the message.

### 2.3 `start`

```typescript
start(repos: RegisteredRepo[]): Promise<void>
```

**Parameters:**
- `repos: RegisteredRepo[]` — Unchanged.

**Returns:** `void` — As today, and for each repository that is `ready`, and for one left `indexing` that has a last-indexed time, a `reconcile` job is enqueued, whether or not the start-up comparison of modification times found changed files. A repository that gets a `full` job at start is cleaned by that job and gets no separate one.

**Postconditions:**
- Start-up does not wait for the clean-up: the job runs from the queue like any other.

## 3. Data model changes

### 3.1 `IndexJob` — field-add

The union of index jobs gains the kind `reconcile` with a `repoPath`. It is processed from the same queue as the other jobs, one job at a time, so it never runs beside a full index or a file event of the same store. The declaration is in src/shared/types.ts. The queue (src/daemon/queue.ts) counts a queued `reconcile` job as pending for its repository in depthForRepo, and enqueue keeps at most one queued `reconcile` job per repository, as it does for `full`. processJob gets a `case 'reconcile'`; its switch has no exhaustiveness check, so the dispatch is proved by the tests that call processJob.

```
+ | { kind: 'reconcile'; repoPath: string }
```

**Call sites:**
- `src/shared/types.ts`
- `src/daemon/queue.ts`
- `src/indexer/index.ts`

### 3.2 `The stored files of a repository (new read in src/db/entities.ts)` — new

A read that returns, for one repository, each non-empty absolute file path the store holds together with the ids of that repository's entities in the file, without building the entities: `listEntityFilesForRepo(db, repo): Promise<Map<string, string[]>>`. It passes over the entity table once, as listEntitiesForRepo does; the removals then need no further pass over the table. A second new function removes one repository's unresolved relations of one file, `deleteUnresolvedForRepoFile(db, repo, file)` in src/db/relations.ts, by a direct read of the existing index by repository and file. An index by repository and file (ISSUE-61045de91faef1a0) would make it a direct read; this design does not need it.

```
+ export async function listEntityFilesForRepo(_db: DbClient, repo: string): Promise<Map<string, string[]>>
+ export async function deleteUnresolvedForRepoFile(_db: DbClient, repo: string, file: string): Promise<void>
```

**Call sites:**
- `src/db/entities.ts`
- `src/db/relations.ts`
- `src/indexer/index.ts`

### 3.3 `What the index holds for a repository` — invariant-change

Today the index holds whatever was ever indexed for a repository, less the files the watcher saw deleted. After the change it holds, once a clean-up pass has run, only files that exist on disk and are not excluded by the repository's ignore list as it is read at that moment (resolveRepoIgnore). The rule for `excluded` is the listing's own: a path segment of the file, relative to the repository, is in the ignore list. Counts derived from the index (a request's measured size, the repository's statistics) fall accordingly. The same rule now also guards the one write path that did not apply it, a create or update file job, so an ignored file does not come back between two clean-ups.

**Call sites:**
- `src/indexer/index.ts`
- `src/indexer/repo-ignore-config.ts`

## 4. Error paths

**Error cases**

- **The repository's own directory is not there when the pass runs (a volume that is not mounted, a repository that was moved).** (recoverable)
  - Detection: Before anything is compared, the pass checks that the repository's root exists and is a directory.
  - Response: The pass removes nothing, logs a warning that names the repository, and ends without failing. Otherwise every stored file would look deleted and the whole index of the repository would be removed.
  - User impact: The index of a repository that is temporarily away is kept as it was.
- **Whether one file exists cannot be told (a permission error, an I/O error on its directory).** (recoverable)
  - Detection: The check of the file fails with an error other than `no such file or directory` (ENOENT) and `not a directory` (ENOTDIR). Those two both mean the file is absent; the second is what the file system answers when a directory on the file's path has been replaced by a file.
  - Response: The file is treated as present: it is not removed, and it is counted in the pass's log as not checked. Only a file the file system says is absent is removed for being absent.
  - User impact: A file that is merely unreadable for a moment keeps its entities.
- **A delete in the store fails part of the way through the pass.** (recoverable)
  - Detection: One of the deletes for a file rejects.
  - Response: The job fails with that error, as any index job does. Files already removed stay removed; the pass is safe to run again and continues from what it finds. Inside a full index the failure marks the repository `error`, as a failed index does.
  - User impact: The clean-up is finished by the next daemon start or the next full index.
- **The repository's ignore list cannot be read (its config file is unparseable).** (recoverable)
  - Detection: resolveRepoIgnore falls back to the universal ignore list, as it does today for the file listing.
  - Response: The pass uses the list it is given, the same one the file listing would use at that moment.
  - User impact: The clean-up and the indexing always agree on what is ignored.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A stored file that no longer exists on disk. | Its relations, entities and unresolved relations are removed; the resolver is run once for the repository at the end of the job. |
| A stored file under a directory that is in the repository's ignore list (this repository's `out/`). | Removed in the same way, although the file exists on disk. |
| A stored file that exists and is not ignored, but that the git listing leaves out or the full pass skips as generated or minified. | Kept. A file is removed only when it is absent or ignored. |
| A stored entity with an empty file path (an external endpoint). | Not considered and not removed. |
| A repository with nothing stale. | Nothing is removed, no resolver is run and the cached exploration results are kept; the pass logs that it compared the files and removed none. |
| A repository with several hundred stale files (this one: the build output indexed in July). | All are removed in one pass, followed by one resolver run for the repository, not one per file. The removals use the entity ids read at the start, so none of them passes over the entity table again; all of it runs inside the queued job and does not hold up daemon start. |
| A file whose name equals an ignored directory's name only in part (`outline.ts`, `src/output/a.ts` with `out` ignored). | Kept: the rule compares whole path segments, as the file listing does. |
| A file deleted from disk while the daemon was running and watching. | Removed by the watcher's delete event as today; the next clean-up pass finds nothing to do for it. |
| A directory added to the ignore list while the daemon is running. | Its stored files are removed at the next daemon start or the next full index; the pass is not triggered by an edit of the config file. |
| A repository that is `pending`, `error` or was interrupted before its first checkpoint at daemon start. | It gets a `full` job as today, which runs the clean-up itself; no separate `reconcile` job is enqueued. |
| A stored file whose parent directory has been replaced by a file of the same name. | Removed as absent: the file system answers `not a directory`, which the pass treats like `no such file or directory`. |
| A registered repository that lies under a directory its registered parent ignores (the parent ignores `vendor`, the child is `<parent>/vendor/lib`), where the parent still holds entities for those files. | The parent's clean-up removes the parent's entities for those files and leaves the child's entities for the same paths. |
| A repository left `indexing` with a last-indexed time at daemon start (the daemon stopped during a second full index). | Today it gets no job at start. It now gets a `reconcile` job and is cleaned. That it stays `indexing` and is not indexed again is an existing defect which this design leaves as it is. |
| A create or update file job (from the watcher or from the daemon's `index.file` request) for a file under an ignored directory. | Nothing is indexed. A delete job for such a file removes what the index holds for it, as today. |
| A kept file that has a resolved link to an entity of a removed file. | The link goes with the removed entity; the kept file's other links stay. No unresolved relation is put back for it, so the link is not tried again until the kept file is next indexed. This is the limit the watcher's delete has today, and the design keeps it. Measured on the running index of this repository before the design was approved: of 116 entities in seven build-output files, none had a caller outside the build output. |

**Invariants to preserve**

- An entity is removed with its edges, name index entries and vectors by one cascade (detachDeleteEntities); the clean-up reaches it through deleteEntitiesById and adds no second cascade. It differs from the watcher's delete on purpose in two things: it removes only the entities of the repository it is cleaning, and it runs the resolver once for the repository inside the job, where the watcher schedules a settle per file. [[c1]]
- What is ignored is decided by one rule, a path segment relative to the repository that is in the repository's ignore list; the clean-up and the file listing use the same rule and the same list. [[c1]]
- The repository's ignore list is read through resolveRepoIgnore, which never fails and falls back to the universal list. [[c2]]
- Entities with no file path are not owned by any file and are not removed by a file-level delete. [[c3]]
- Index jobs run one at a time from one queue; a pass that changes the store does not run beside another. The clean-up therefore does its resolver run inside the job and arms no settle timer, because the settle pass runs on a timer outside the queue. [[c1]]
- A repository is registered and removed only through the registry; the clean-up never removes or re-registers a repository. [[c1]]
- The entities a registered repository holds for a file that exists and that it does not ignore are never removed by the clean-up of another repository. [[c1]]

## 5. Test strategy

**Test framework:** `node:test with node:assert/strict, run by `npx tsx --test` under Node 22; test files are `__tests__/*.test.ts` beside the code, against a temporary graph store set with setGraphStorePath and a temporary vector store set with setLanceConnPath, closed in teardown (as src/indexer/__tests__/cross-file-resolver-lmdb.test.ts). Every test that removes entities or runs a full index sets both, because the removal of an entity always opens the vector table, whose path is the live store unless it is set`

**Test levels**

- **integration** — The clean-up removes what is gone or ignored, with what was derived from it, and nothing else.
  - Subjects: `the clean-up removes a file that is gone and a file under an ignored directory, with their relations and unresolved relations, and leaves every other file of the repository and every file of another repository as it was`, `a file that exists and is not ignored is kept although the file listing leaves it out, an entity with no file path is kept, and a file whose name only contains an ignored name is kept`, `a repository whose directory is missing loses nothing, and a file whose presence cannot be told is kept`, `running the clean-up a second time removes nothing, and a repository with nothing stale is left as it was`, `a clean-up that removed files runs the resolver once inside the job, leaves no settle timer armed and removes the repository's cached exploration results, and one that removed nothing leaves them`, `a file whose parent directory became a file is removed as absent`, `the clean-up of a repository that ignores a directory leaves the entities a nested registered repository holds for the files under it`, `the vector rows of a removed file are gone after the clean-up and those of a kept file remain`, `a create or update file job for a file under an ignored directory indexes nothing, and one for a file elsewhere is indexed`, `a kept file's link into a removed entity is removed with it, and the kept file's other links and entities stay`
  - Fixtures: `a temporary graph store with two registered repositories in temporary directories, entities and relations stored for files that exist, files that were then deleted, and files under a directory named in the repository's ignore list`, `the indexer service built with a stand-in watcher and queue, so that jobs are processed by direct calls`, `a cached exploration result stored for each of the two repositories`, `a stand-in for the check of a file's presence, handed to the service in place of the real stat, that answers with a permission error for one file; the test asserts that the pass reports exactly one file as not checked and removed none`, `a third registered repository nested under a directory the first one ignores, with entities stored by both for the same files`, `a temporary vector store set with setLanceConnPath, holding vector rows for the entities of a stale file and of a kept file (as src/db/__tests__/entities-lance-integration.test.ts)`
- **integration** — The clean-up runs when the daemon starts and at the end of a full index.
  - Subjects: `a ready repository gets a clean-up job at daemon start, one that gets a full index at start gets no separate one, and a full index runs the clean-up before it marks the repository ready`, `a repository left indexing with a last-indexed time gets a clean-up job at daemon start`
  - Fixtures: `a stand-in queue that records the jobs enqueued`, `a temporary repository with one source file and one stale stored file`, `a temporary graph store and a temporary vector store, as in the first level`
- **unit** — The read of a repository's stored files.
  - Subjects: `the read of a repository's stored files returns each file once, only that repository's files, and no empty path`, `the removal of one repository's unresolved relations of a file leaves another repository's unresolved relations of the same path`
  - Fixtures: `a temporary graph store with entities of two repositories, several entities per file, and one entity with an empty file path`
- **unit** — The queue knows the clean-up job (src/daemon/__tests__/queue-depth-for-repo.test.ts, which checks each kind of job).
  - Subjects: `a queued clean-up job is counted as pending for its repository, and a second one for the same repository is not queued`
  - Fixtures: `the queue of src/daemon/queue.ts with jobs enqueued and not drained`
- **smoke** — The installed daemon's index of this repository is corrected.
  - Subjects: `on the installed daemon after the update, the files under this repository's build output and the deleted test file have no entities, a source file still has its entities, and the repository's count of JavaScript files has fallen`
  - Fixtures: `the running daemon, asked with its `search.by_file` and `repo.stats` requests before and after; no model is called`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `the clean-up removes a file that is gone and a file under an ignored directory, with their relations and unresolved relations, and leaves every other file of the repository and every file of another repository as it was`, `on the installed daemon after the update, the files under this repository's build output and the deleted test file have no entities, a source file still has its entities, and the repository's count of JavaScript files has fallen`, `a clean-up that removed files runs the resolver once inside the job, leaves no settle timer armed and removes the repository's cached exploration results, and one that removed nothing leaves them`, `a file whose parent directory became a file is removed as absent`, `a create or update file job for a file under an ignored directory indexes nothing, and one for a file elsewhere is indexed` |
| `ac2` | `the clean-up removes a file that is gone and a file under an ignored directory, with their relations and unresolved relations, and leaves every other file of the repository and every file of another repository as it was`, `the vector rows of a removed file are gone after the clean-up and those of a kept file remain`, `a kept file's link into a removed entity is removed with it, and the kept file's other links and entities stay` |
| `ac3` | `a ready repository gets a clean-up job at daemon start, one that gets a full index at start gets no separate one, and a full index runs the clean-up before it marks the repository ready`, `running the clean-up a second time removes nothing, and a repository with nothing stale is left as it was`, `a queued clean-up job is counted as pending for its repository, and a second one for the same repository is not queued`, `a repository left indexing with a last-indexed time gets a clean-up job at daemon start` |
| `ac4` | `a file that exists and is not ignored is kept although the file listing leaves it out, an entity with no file path is kept, and a file whose name only contains an ignored name is kept`, `a repository whose directory is missing loses nothing, and a file whose presence cannot be told is kept`, `the read of a repository's stored files returns each file once, only that repository's files, and no empty path`, `the clean-up of a repository that ignores a directory leaves the entities a nested registered repository holds for the files under it`, `the removal of one repository's unresolved relations of a file leaves another repository's unresolved relations of the same path` |

## 6. Migration

**State before:** The indexer adds and updates and never compares the index with the disk: its full pass and its start-up comparison of modification times index the files of the listing, and the entities of a file are removed only on the watcher's delete event (s1: the reading of src/indexer/index.ts). The running index of this repository holds entities for build output indexed in July 2026 and for a test file that is no longer on disk (s1: the live check).

**State after:** The indexer has a clean-up job for one repository that removes from the index every stored file that is absent from disk or excluded by the repository's ignore list, for that repository only, then runs the resolver once and removes the repository's cached exploration results. It is enqueued at daemon start for each ready repository and run inside a full index, before that index's resolver. After the daemon is updated and restarted, the index of every registered repository holds only files that exist and are not ignored.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add to the store the read of a repository's stored files with their entity ids, and the removal of one repository's unresolved relations of one file. — ↩ rollbackable
2. Add the clean-up job to the job union (src/shared/types.ts), to the queue (counted per repository, at most one queued per repository) and to the indexer's dispatch; after removals run the resolver once and remove the cached exploration results; guard it against a repository whose directory is missing and against a file whose presence cannot be told. — ↩ rollbackable
3. Enqueue the job at daemon start for each ready repository and for one left `indexing` with a last-indexed time, and run the removals in a full index before its cross-file resolver. Make a create or update file job skip a file that the repository's ignore list excludes. — ↩ rollbackable
4. Update the installed daemon and restart it; its first start runs the clean-up for every ready repository. Check this repository's index before and after. The removals themselves cannot be undone by going back to the old code: the removed entities return only if the files are indexed again, which for a deleted or ignored file is not wanted. — ✕ non-rollbackable
5. Update the guide (docs/daemon.md, where it describes indexing) to say that the index is cleaned at start and on a full index, and what is removed. — ↩ rollbackable

**Backward compat:** No public API changes; the job kind and the store read are internal. What a user sees change: the counts that come from the index fall for a repository that held stale files (its statistics, the size a request is measured as, the files an analysis or a search can return). For this repository the entities of about five hundred build-output files go. No stored record changes shape and no schema version changes. An older daemon started on the cleaned store works as before.

## 7. Alternatives considered

### 7.1 a1: A reconcile job that removes what is gone or ignored — **CHOSEN**

A new job reads the stored files of a repo and removes the entities of each file that is not on disk or lies under an ignored directory; it runs at daemon start for a ready repo and at the end of a full index.

The indexer gains a job kind `reconcile` for one repo. It reads the distinct file paths the store holds for the repo, and for each file that does not exist on disk, or that has a path segment in the repo's ignore list (the rule the file listing already uses), removes this repo's entities and unresolved relations of the file (by entity id, so another registered repo's entities for the same path are untouched), then runs the cross-file resolver once for the repo inside the job and removes the repo's cached exploration results. Entities with no file path are left alone. The job is enqueued at daemon start for every repo that is `ready`, and fullIndex runs the same removals before its cross-file resolver, so `repo.reindex` cleans up too. A file is removed only for one of the two stated reasons, never merely because the listing does not hold it.

### 7.2 a2: Make the full index authoritative

fullIndex removes every stored file that is not in its own list of files to index.

At the end of fullIndex, every file the store holds for the repo that is not among the files the pass just indexed is removed. Nothing changes at daemon start: a ready repo is cleaned only when it is fully indexed again, which the user asks for with `repo.reindex`.

**Rejected because:** Simple, but it does not clean a repository that is already indexed and it removes more than the issue names.

### 7.3 a3: Filter stale entities where they are read

The store's reads drop entities whose file is gone or ignored; nothing is deleted.

listEntitiesForRepo and the other reads check each entity's file against the disk and the ignore list and leave stale ones out. The index keeps them.

**Rejected because:** Deletes nothing wrongly because it deletes nothing; the index stays wrong and every read pays for it.

## 8. References

- **[[c1]]** `code` `src/indexer/index.ts` — "const files = listRepoFiles(repoPath, resolveRepoIgnore(repoPath));"
- **[[c2]]** `code` `src/indexer/repo-ignore-config.ts` — "export function resolveRepoIgnore(repoRoot: string): string[] {"
- **[[c3]]** `code` `src/db/entities.ts` — "export async function deleteEntitiesForFile(_db: DbClient, filePath: string): Promise<void> {"
- **[[c4]]** `prior-artifact` `docs/standalone/index-never-reconciled-against-files-disk-E202610102764c29d/ISSUE.md` — "The indexer adds and updates; it does not reconcile."
- **[[c5]]** `stakeholder` `The acceptance criteria this design states, from the issue's fix intent` — "ac1: after the clean-up the index holds entities only for files that exist on disk and are not excluded by the repository's ignore list. ac2: a removed file's entities go together with their relations"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 do not hold · 0 could not be verified · 8 hold** · template `design-issue` · model `cli-claude:opus` · reviewed 2026-10-10T15:17:06.985Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

_None._
