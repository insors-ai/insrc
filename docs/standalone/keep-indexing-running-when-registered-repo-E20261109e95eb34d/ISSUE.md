<!-- insrc:artifact ISSUE-e95eb34da3769143 -->

# Keep indexing running when a registered repo's folder is missing

## Reproduction

1. Register a repository with the daemon.
2. Delete its folder while it stays registered (on 2026-11-09 a reboot cleared `/tmp`, removing a registered temp folder).
3. Start the daemon.

Observed: the daemon log shows `the indexing worker did not start: No such file or directory`, followed by the supervisor replacing the worker. Indexing stops for every registered repository, not only the missing one, and the `repo.remove` request for the stale repository cannot be served. Three daemon processes in a row logged the same failure.

Expected: the daemon reports the missing repository, skips it, keeps indexing the others, and the stale repository can be removed.

## Root cause

The startup loop in `src/indexer/index.ts` awaits `this.watcher.addRepo(repo.path, ...)` for each registered repository with no per-repository error handling. `addRepo` in `src/indexer/watcher.ts` awaits a filesystem subscription on the repository's folder, so a missing folder rejects, and that rejection ends indexer startup. `src/daemon/threads/workers.ts` then reports that the worker did not start, and `src/daemon/threads/supervisor.ts` replaces it, which meets the same failure on the next attempt.

`repo.remove` is classed as an indexing request in `src/daemon/threads/method-class.ts`, so the worker that cannot start is the one that would serve it.

The failing call is inferred from reading the startup path and from the observed recovery, not from a stack trace: the log gives only the message, and recreating the folder as an empty directory let the worker start and `repo.remove` succeed. Why successive daemon processes exited is not established.

## Fix intent

A registered repository whose folder is missing no longer stops the indexing worker from starting. The daemon reports that repository, skips it, and keeps indexing the others. The stale repository can be removed through the normal request while its folder is missing, without recreating the folder first.

## Citations

- **[[c1]]** `code` `src/indexer/index.ts:290` — "await this.watcher.addRepo(repo.path, this.refreshedFileFilter(repo.path));"
- **[[c2]]** `code` `src/indexer/watcher.ts:111` — "const sub = await this.subscribe(repoPath, filter, ignored);"
- **[[c3]]** `code` `src/daemon/threads/workers.ts:89`
- **[[c4]]** `code` `src/daemon/threads/supervisor.ts:97`
- **[[c5]]** `code` `src/daemon/threads/method-class.ts:44` — "['repo.remove', 'indexing', false],"
- **[[c6]]** `stakeholder` `User report on 2026-11-09 of the daemon crash loop, and the daemon log from that incident`
