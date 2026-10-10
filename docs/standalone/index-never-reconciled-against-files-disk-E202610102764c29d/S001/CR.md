<!-- insrc:artifact CR-2764c29d7ccb66a5-S001 -->

# Code review: 2764c29d7ccb66a5:S001

⛔ **BLOCK** — HIGH 1 · MED 3 · LOW 8 · model `claude:opus`

**Changed files:** 9

## adherence — 0 finding(s)

_No findings._

## conventions — 0 finding(s)

_No findings._

## coverage — 3 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| HIGH | src/indexer/index.ts:412 | The promised smoke test is not in the changed set and there is no record that it was performed. It is a manual check against the installed daemon after the update: entities gone for the build output and the deleted test file, a source file still indexed, and the JavaScript file count lower. No test file, script or build record in the grounding corresponds to it, so the end-to-end behaviour on a real store is unconfirmed. |
| MED | src/indexer/__tests__/reconcile.test.ts:1 | Present but unverified: all 18 promised unit and integration tests appear with matching titles in the diff (14 in src/indexer/__tests__/reconcile.test.ts, 3 in src/db/__tests__/entity-files-for-repo.test.ts, 1 in src/daemon/__tests__/queue-depth-for-repo.test.ts). No build record is available, so none of them can be confirmed as passing. The empty testsReaching edges are not reported as gaps: the grounding is file-level diffs, and the test diffs call the changed symbols directly (listEntityFilesForRepo, deleteUnresolvedForRepoFile, IndexQueue.enqueue/depthForRepo, reconcileRepo, the 'reconcile' and 'file' paths of processJob, start, the full index). |
| LOW | src/indexer/index.ts:484 | Two new error paths have no test in the diff, and the plan promised none. First, the non-fatal catch branches in resolveAfterReconcile, where a failing external-endpoint or messaging-endpoint pass is logged and the job continues. Second, the stated behaviour that a clean-up failure inside the full index propagates like an indexing failure. Only the success paths are exercised. |

## quality — 9 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/indexer/index.ts:415 | Unhandled error path in reconcileJob: the cached exploration results are dropped only AFTER resolveAfterReconcile, and the cross-file pass inside it (runCrossFileResolver) is not wrapped in a try, unlike the two endpoint passes. If it throws, the removals are already committed but deleteCachedExplorationsForRepo never runs. The next clean-up of the repo then removes nothing (removedAbsent + removedIgnored is 0), so neither the resolver nor the cache removal is retried, and an exploration cached before the clean-up keeps answering with the removed files until the next full index. Drop the cache before the resolver run, or in a finally. |
| MED | src/indexer/index.ts:471 | The same gap one level down in reconcileRepo: each stale file is removed in its own awaited store calls inside the loop, with no try around them. If deleteEntitiesById or deleteUnresolvedForRepoFile throws on file N, files 1..N-1 are already gone, the counts are lost with the exception, and reconcileJob runs neither the resolver nor the cache removal for them. A later pass no longer sees those files as stale, so the follow-up work is never done for them. Inside fullIndex the same throw fails the whole full index, as its comment says. |
| LOW | src/indexer/index.ts:472 | The two removals for one file are separate write transactions (entities first, then that file's unresolved relations). If the process stops or the second call fails between them, the unresolved rows stay with no entity behind them. The pass finds files through listEntityFilesForRepo, which reads entities only, so a later clean-up never visits that file again and the rows are left until something else clears the repo's unresolved relations. Deleting the unresolved rows first, or both in one transaction, closes this. |
| LOW | src/indexer/index.ts:457 | Presence is decided by whether statSync succeeds, not by whether the path is still a file. A stored file whose path is now a directory stats successfully, so it is kept with its stale entities. The reverse case (a parent directory replaced by a file) is handled through ENOTDIR, but this one is not, and the guide's 'a file that is no longer on disk' does not cover it. |
| LOW | src/indexer/index.ts:449 | For a repo with nothing stale the loop over stored files has no await in it: one statSync per stored file runs back to back on the daemon's event loop, after a synchronous scan of the whole entity table in listEntityFilesForRepo. At daemon start this is queued once per ready repo, so IPC requests wait behind each pass on a large index. An async stat, or a yield every few hundred files, would avoid it. |
| LOW | src/db/entities.ts:810 | listEntityFilesForRepo scans and decodes every row of the entity table for all repos and filters by repoId in the loop, the same full-table walk as the function directly above it. At daemon start it runs once per ready repo, so the cost is (number of repos) x (all entities). The scan-and-filter loop is repeated rather than shared with the existing per-repo listing. |
| LOW | src/db/relations.ts:344 | deleteUnresolvedForRepoFile repeats the body of the existing path-wide delete: collect the ids under the unresolvedByFile key, then delete each with deleteUnresolvedRowInTxn in one write transaction. Only the repo scoping differs. The path-wide function could call the repo-scoped one per repo so the two cannot drift. It also reads the ids outside the write transaction it deletes them in. |
| LOW | src/indexer/index.ts:484 | resolveAfterReconcile is a third copy of the resolver sequence (cross-file pass, then the external-endpoint and messaging-endpoint passes, each non-fatal) that its own comment says mirrors the settle pass, and that fullIndex also runs. A resolver step added later has to be added in all three places. One shared helper taking the repo path would remove the copies. |
| LOW | src/indexer/index.ts:683 | fileEvent resolves the repo's ignore list and builds a new Set for every create or update event. If resolveRepoIgnore reads <repo>/.insrc/config.json each time, a burst of watcher events (a branch switch, a build writing many files) reads and parses the config once per file. Caching the set per repo would avoid it, but the cache would have to be dropped when the ignore list is edited. |

