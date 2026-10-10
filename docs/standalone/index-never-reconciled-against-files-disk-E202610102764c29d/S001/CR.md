<!-- insrc:artifact CR-2764c29d7ccb66a5-S001 -->

# Code review: 2764c29d7ccb66a5:S001

⛔ **BLOCK** — HIGH 1 · MED 5 · LOW 8 · model `claude:opus`

**Changed files:** 9

## adherence — 0 finding(s)

_No findings._

## conventions — 0 finding(s)

_No findings._

## coverage — 6 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| HIGH | src/indexer/index.ts:313 | The promised smoke test has no corresponding test in the grounding. Nothing in the changed set checks the installed daemon after the update: that the build-output files and the deleted test file have no entities, that a source file keeps its entities, and that the JavaScript file count has fallen. The daemon-start clean-up is covered only at integration level, against a temp store with a stand-in watcher. If the smoke check was run by hand, no record of it was supplied. |
| MED | src/indexer/__tests__/reconcile.test.ts:1 | Present but unverified: the 18 promised unit and integration tests are all in the diff under their exact promised titles (3 in src/db/__tests__/entity-files-for-repo.test.ts, 1 in src/daemon/__tests__/queue-depth-for-repo.test.ts, 14 in src/indexer/__tests__/reconcile.test.ts). No build record was supplied, so none of them can be confirmed as passing. Every testsReaching list is empty, but the entries are file-level diff entities with no graph edges, and the test diffs call the changed symbols directly (listEntityFilesForRepo, deleteUnresolvedForRepoFile, IndexQueue.enqueue/depthForRepo with 'reconcile', processJob for reconcile/full/file jobs, reconcileRepo, start). I therefore did not report the changed symbols as not exercised. |
| LOW | src/indexer/index.ts:441 | No test in the grounding exercises the branch in reconcileJob where the clean-up fails part-way and the following resolver run also fails (the first failure is rethrown, the second only logged). The two failures are each tested separately, never together. |
| LOW | src/indexer/index.ts:531 | No test in the grounding exercises the non-fatal handling in resolveAfterReconcile when the external-endpoint or messaging-endpoint pass throws. The ProbeService override only fails the whole method, so the two inner try/catch branches are not reached. |
| LOW | src/indexer/index.ts:487 | No test in the grounding reaches the event-loop yield in reconcileInto (every RECONCILE_YIELD_EVERY = 500 compared files). The largest fixture stores a handful of files. |
| LOW | src/indexer/index.ts:313 | The daemon-start test covers a ready repository with no changed files (lastIndexed set in the future). No test covers a ready repository that does have changed files, where the delta file jobs and the reconcile job should both be queued. |

## quality — 8 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/indexer/index.ts:473 | Correctness risk: the only guard against a missing repo is that the root is a directory. An unmounted volume commonly leaves its mount point behind as an empty directory (Linux mounts, network shares, a recreated empty checkout directory). The guard then passes, every stored file stats ENOENT, and the pass removes the repo's whole index; at daemon start it also drops the exploration cache. docs/daemon.md promises that an unmounted volume removes nothing. Consider refusing, or requiring a full index, when every compared file or a very large share of them comes back absent, or checking a marker such as `.git` or `.insrc` under the root. |
| MED | src/indexer/index.ts:510 | Unhandled error path: the removed counts rise only after `removeStoredFile` returns. If `deleteEntitiesById` throws after removing some or all of the file's entities (for example the graph rows go and the vector delete then fails), the file is not counted. When it is the only stale file, `reconcileJob` sees zero removals, so it neither drops the cached exploration results nor runs the resolver. If the entities are in fact gone, the next pass no longer lists the file, so that follow-up never happens. The comment in `reconcileJob` describes this hazard for earlier files but not for the file that failed. Counting an attempted removal before the store call, or treating any failure as 'something may have been removed', would close it. |
| MED | src/indexer/index.ts:434 | Unhandled error path: `deleteCachedExplorationsForRepo` is awaited outside any try block. If it throws after `reconcileInto` already failed, the original store failure held in `failure` is discarded and never logged, the resolver run for the files already removed is skipped, and the `index clean-up complete` line with the counts is not written. The resolver call just below it is guarded; this call is not. |
| MED | src/db/entities.ts:810 | Correctness and performance risk: `listEntityFilesForRepo` walks the whole entity table, across all repos, synchronously, decoding every row, with no yield. The pass is queued at daemon start for every indexed repo and runs inside every full index, so start-up costs (number of repos × all entities) of blocking work. The `RECONCILE_YIELD_EVERY` yield in `reconcileInto` covers only the stat loop, so IPC requests are still held behind this scan on a large store. A per-repo key range, or a periodic yield inside the scan, would avoid it. |
| LOW | src/db/entities.ts:802 | Duplication: `listEntityFilesForRepo` repeats the repo-filtered full scan of the entity table that `listEntitiesForRepo`, directly above it, already performs (same repo-id lookup, same `getRange` loop and row filter); it differs only in collecting ids by file instead of building entities. A shared row iterator would keep the two scans from drifting apart. |
| LOW | src/db/relations.ts:344 | Duplication: `deleteUnresolvedForRepoFile` is the body of `deleteUnresolvedForFile` restricted to one repo id (collect ids from `unresolvedByFile`, then `deleteUnresolvedRowInTxn` in one write transaction). The existing function could take an optional repo, or both could share one helper that works on a single repo id. As in the original, the ids are read outside the write transaction. |
| LOW | src/indexer/index.ts:530 | Duplication: `resolveAfterReconcile` writes out the cross-file pass followed by the two non-fatal endpoint passes again; its own comment says it is 'as in the settle pass', and `fullIndex` runs the same sequence. That makes three copies of the resolver sequence and its error handling, so a pass added later has to be added in three places. One shared helper for the sequence would remove the copies. |
| LOW | src/indexer/index.ts:730 | Avoidable cost: every create or update file event now calls `resolveRepoIgnore(repoPath)` and builds a new Set before indexing. If `resolveRepoIgnore` reads `<repo>/.insrc/config.json` from disk, that is one synchronous config read per watcher event, which adds up during a burst such as a branch switch or a build. A per-repo ignore set cached and invalidated when the config changes would avoid it. Also worth confirming: for a file under a nested registered repo, the `repoPath` resolved for the event must be the innermost repo; otherwise the parent's ignore list (for example `vendor`) would silently stop the child's files from being indexed by events. |

