<!-- insrc:artifact CR-2764c29d7ccb66a5-S001 -->

# Code review: 2764c29d7ccb66a5:S001

⛔ **BLOCK** — HIGH 1 · MED 5 · LOW 10 · model `claude:opus`

**Changed files:** 9

## adherence — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/indexer/index.ts:537 | reconcileInto adds a guard the approved design does not have: when at least one stored file looks absent and not one stored file is on disk (`absent > 0 && !anyOnDisk`), the pass returns without removing anything, although the repository root exists and is a directory. In that state absent files stay in the index, and so do ignored files (the test 'a repository whose directory is there but holds none of the stored files loses nothing' asserts 'not even the ignored file is removed'). The LLD's only 'remove nothing' condition is a root that does not exist or is not a directory; its postcondition is unconditional once the root check passes. docs/daemon.md itself records the consequence: a repository whose every indexed file really was deleted is never cleaned by the pass. The same guard applies inside fullIndex, so a full index can also leave stale files, against 'a full index ... leaves no stale file'. |
| LOW | src/indexer/index.ts:446 | reconcileJob decides whether to run the resolver and drop the cached exploration results on `progress.removalStarted`, which is set before the first store write, not on a file having been removed. When the removal of the only stale file fails, the job still drops the repository's cached explorations and runs the whole-repo resolver with zero files removed (the test 'a failure on the only stale file still drops the cached results and runs the resolver' asserts `removed` is empty and `resolverRuns` is [repoA]). The approved condition is 'when at least one file was removed', and the approved response to a store failure is only that the job fails with that error. |

## conventions — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/indexer/index.ts:438 | The `attempt` helper in `reconcileJob` builds its log message with a template literal (`index clean-up: ${what} failed after an earlier failure`). Every other log call in the changed code keeps the message a fixed string and puts the variable parts in the structured fields object (e.g. `log.warn({ repo, err }, 'external-endpoint pass after index clean-up failed (non-fatal)')`). Passing `what` as a field (`{ repo, step: what, err }`) with a fixed message would match. Sampled only from the log calls visible in this diff, so reported as an observation. |

## coverage — 7 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| HIGH | src/indexer/__tests__/reconcile.test.ts:1 | Promised smoke test has no corresponding test in the grounding. None of the three changed test files contains a case that checks the installed daemon after the update (no entities for build-output files and the deleted test file, a source file keeps its entities, the JavaScript file count falls). If this was done as a manual check recorded elsewhere, that record is not in the changed set given to me, so I cannot confirm it exists or passed. |
| MED | src/indexer/__tests__/reconcile.test.ts:1 | Present but unverified: all 14 promised integration tests are in this file under their exact promised titles, but there is no build record, so none can be confirmed passing. testsReaching is empty for src/indexer/index.ts and src/shared/types.ts, yet these tests call processJob({kind:'reconcile'}), reconcileRepo, start, the full-index path and the file-event ignore check directly, so I am not reporting those symbols as not exercised. |
| MED | src/db/__tests__/entity-files-for-repo.test.ts:1 | Present but unverified: the three promised unit tests for listEntityFilesForRepo and deleteUnresolvedForRepoFile are in this file under their exact promised titles, but there is no build record to confirm they pass. testsReaching is empty for src/db/entities.ts and src/db/relations.ts, yet the tests import and call both functions directly, so I am not reporting them as not exercised. |
| MED | src/daemon/__tests__/queue-depth-for-repo.test.ts:59 | Present but unverified: the promised unit test is here and exercises both changes in src/daemon/queue.ts (the 'reconcile' case in depthForRepo and the per-repo dedupe in enqueue), but there is no build record to confirm it passes. |
| LOW | src/indexer/index.ts:497 | No test in the changed set reaches the event-loop yield in reconcileInto: it fires only at every 500th compared file (RECONCILE_YIELD_EVERY) and the largest fixture stores a handful of files. |
| LOW | src/indexer/index.ts:571 | The two non-fatal catch branches in resolveAfterReconcile (a failing external-endpoint or messaging-endpoint pass is logged and the job still succeeds) are not exercised. ProbeService only makes the whole override throw, which tests the fatal path. |
| LOW | src/indexer/index.ts:432 | The second-failure branch of reconcileJob's attempt helper (a later step fails after an earlier one, is logged, and the first failure stays the job's error) is not exercised. No test sets failRemovalOf and failResolver together. |

## quality — 6 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/db/entities.ts:810 | Avoidable cost on a hot path: listEntityFilesForRepo walks the WHOLE entity table (every repo's rows) synchronously and decodes each row, with no yield. The start-up clean-up now calls it once per already-indexed repo, so daemon start costs (number of repos x total entities) of blocking work on the event loop. reconcileInto yields every 500 stats precisely so IPC is not held behind a large repo, but this scan in front of it holds IPC for the full table walk and defeats that. The store has no index of entities by repo (the gap already filed as ISSUE-61045de9); until it has one, the scan should at least yield, or the start-up pass should read the table once for all repos. |
| LOW | src/indexer/index.ts:770 | Avoidable repeated work: every create/update file event now calls resolveRepoIgnore(repoPath), which reads and parses <repo>/.insrc/config.json from disk synchronously, and builds a new Set, per event. A branch switch or the start-up delta queues thousands of file jobs, each paying a synchronous file read. The ignore set could be held per repo and refreshed when the config file changes (the doc already says an edit to the list takes effect at the next start or full index, so a cached list would not change the stated behaviour of the clean-up). |
| LOW | src/indexer/index.ts:571 | Duplication: resolveAfterReconcile is a third copy of the same resolver sequence (runCrossFileResolver, then resolveExternalEndpoints and resolveMessagingEndpoints each wrapped as non-fatal) that runSettlePass and fullIndex already carry. A resolver pass added to one of the three will be missed in the others. The sequence could be one private method taking the log label. |
| LOW | src/db/relations.ts:344 | Duplication: deleteUnresolvedForRepoFile repeats the body of deleteUnresolvedForFile (collect ids from unresolvedByFile for a (repoId, file) key, then delete them in one write transaction); the only difference is one repo id against all of them. The older function could loop over the repo ids and share one helper. Both also read the ids outside the write transaction, which is safe only while the queue is the single writer. |
| LOW | src/db/entities.ts:802 | Duplication: listEntityFilesForRepo repeats the scan loop of listEntitiesForRepo directly above it (repo id lookup, getRange over the entity table, decodeEntityRow, filter by repoId, lookupStringIdByU64). A shared row iterator for one repo would serve both and give one place to fix the full-table scan. |
| LOW | src/indexer/index.ts:453 | Error-path reporting: reconcileJob logs 'index clean-up complete' at info with the counts also when the pass failed part-way and the job is about to rethrow, so the log reads as a success with partial counts. The docs name this line as the pass's result line. Also, `failure === undefined` is used as the 'nothing failed yet' marker, so a step that rejects with undefined would be swallowed; a separate boolean would close that. |

