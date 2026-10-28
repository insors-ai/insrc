<!-- insrc:artifact PLAN-fa396bdf197b8e8b-s1 -->

# Plan: STORY-fa396bdf197b8e8b-s1

## Summary

**Epic:** `fix-code-review-freshness-gate-so`
**LLD run:** `wf-1793085995063-vangle`
**LLD effective hash:** `96a34482d75a...`

The build changes two modules and adds tests that use the real file watcher. The watcher learns to watch and scan new directories that have subdirectories, with an optional injectable subscribe so its failure path can be tested. The freshness check settles missing files first and lists every stale file the index holds, and the daemon handler queues one index request for each and re-reads the queue. A last pair of tasks proves it on a rebuilt daemon and cleans up. Everything except the live check is covered by tests the build gate runs.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Watch and scan new directories in the Watcher | L | — | — | integration: src/indexer/__tests__/watcher-new-directories.test.ts: after addRepo, mkdir -p a/b/c with a file written in it at once yields a create event for that file, and a second file written in a/b/c three seconds later yields an event too (the case that produced no event before the fix); integration: src/indexer/__tests__/watcher-new-directories.test.ts: a directory tree with files created in one call yields a create event for every file in the tree, including files in nested directories, and a symbolic link to a directory is not followed; integration: src/indexer/__tests__/watcher-new-directories.test.ts: files inside a new directory whose name is on the ignore list (node_modules) and inside an ignored subdirectory of a new directory yield no events, at creation and when written later; integration: src/indexer/__tests__/watcher-new-directories.test.ts: after a new nested directory is deleted and created again with the same path, files written in it are reported again; integration: src/indexer/__tests__/watcher-new-directories.test.ts: after close() no handler is called for later writes, and after removeRepo() the repo's per-directory subscriptions deliver nothing | [[c1]] [[c2]] [[c6]] |
| 2 | **`t2`** Make the subscribe function injectable and tolerate its failure | S | — | `t1` | integration: src/indexer/__tests__/watcher-new-directories.test.ts: a per-directory subscribe that throws is logged, does not throw out of the handler, and the files present in the new directory are still reported once; integration: src/indexer/__tests__/watcher-new-directories.test.ts: a new nested directory that cannot be read (mode 000, skipped when running as root) does not throw or stop later events for other directories | [[c2]] [[c5]] |
| 3 | **`t3`** Settle missing files and list stale held files in the freshness compute | M | — | — | unit: src/workflow/code-review/__tests__/freshness.test.ts: a changed file whose mtime is 0 (deleted or unstattable) is not stale, not in unindexedFiles, and neither the entity nor the selection seam decides it, even when selection would say selected; unit: src/workflow/code-review/__tests__/freshness.test.ts: a file with no entities and selection 'not-code' or 'excluded-by-ignore' is not stale, whatever the repo-level lastIndexed is; unit: src/workflow/code-review/__tests__/freshness.test.ts: a file with no entities and selection 'selected' is in staleFiles and unindexedFiles when it was never requested; unit: src/workflow/code-review/__tests__/freshness.test.ts: with an idle queue, a file with entities whose watermark is older than its mtime (a missed update) is in staleFiles and unindexedFiles, and the selection seam is not consulted for it; unit: src/workflow/code-review/__tests__/freshness.test.ts: a stale file requested at or after its mtime stays in staleFiles but leaves unindexedFiles, with the queue idle or busy, for both an entity-less file and a file with an older watermark; unit: src/workflow/code-review/__tests__/freshness.test.ts: a file edited after its request is in unindexedFiles again; unit: src/workflow/code-review/__tests__/freshness.test.ts: a selection seam that throws keeps an entity-less file stale and out of unindexedFiles; unit: src/workflow/code-review/__tests__/freshness.test.ts: a file with entities whose watermark is at or after its mtime is not stale and not in unindexedFiles; the compute calls no write seam; unit: src/workflow/code-review/__tests__/freshness.test.ts: the existing whole-result assertions are updated for the unindexedFiles field and still pass | [[c3]] [[c2]] [[c5]] |
| 4 | **`t4`** Queue the index request in the codeReview.freshness handler | M | — | `t3` | integration: src/daemon/__tests__/code-review-freshness-request.test.ts: the codeReview.freshness handler built by buildHandlerRuntime with a recording queue queues one 'file' job for each file in unindexedFiles, queues nothing for a second identical poll, and queues again after the file's mtime moves; integration: src/daemon/__tests__/code-review-freshness-request.test.ts: after queueing, the same reply carries isProcessing, inFlight and pendingCodeIndexJobs read from the queue after the jobs were queued; integration: src/daemon/__tests__/code-review-freshness-request.test.ts: realFreshnessGraphDeps().selection, with the indexer's parsers registered, returns 'not-code' for a .png file and package-lock.json, 'excluded-by-ignore' for a .ts file under node_modules, and 'selected' for a .ts file and a small .md file in a real temporary directory; integration: src/daemon/__tests__/code-review-freshness-request.test.ts: through the real seams, a changed .ts path that does not exist is not stale and queues nothing, while an existing entity-less .ts file is stale and queued once; integration: src/daemon/__tests__/handler-runtime.test.ts: the recorded handler key sets are unchanged because no method is added; integration: src/daemon/steps/code-review-step/__tests__/handler.test.ts: with proceed:true and a freshness that keeps reporting one stale file with an idle queue while other changed files have symbols, the wait ends at the freshness time-out in the degraded diff review (fallback reason freshness-timeout naming that file) and no full review runs; integration: src/daemon/steps/code-review-step/__tests__/routing.test.ts and long-review.test.ts, src/daemon/__tests__/code-review-rpc-fallback.test.ts and src/shared/__tests__/review-stream-freshness.test.ts pass unchanged | [[c4]] [[c2]] [[c5]] |
| 5 | **`t5`** Check the fix end to end on a rebuilt daemon (reported by the builder) | S | — | `t2`, `t4` | live: Reported by the builder, not run by the gate: with the rebuilt daemon running, create mkdir -p dir/sub with a small .ts file in it at once, then another file three seconds later, and see both indexed (codeReview.freshness reports them not stale) without a restart; then edit an already indexed file and see it fresh | [[c6]] |
| 6 | **`t6`** Clean up after the end-to-end check | S | — | `t5` | smoke: Reported by the builder: git status lists no probe file, config.json has logLevel info, and the daemon log has no debug lines after its latest start | [[c6]] |

### 1.1 TASK-fa396bdf197b8e8b-s1-t1 — Watch and scan new directories in the Watcher

In src/indexer/watcher.ts keep the repo's ignore list per repo and a Map of per-directory subscriptions. On a create event for a directory under a watched repo (not a symbolic link, no ignored segment), when it has subdirectories subscribe to it first, then walk its tree and push a create event for every file, skipping ignored directories and symbolic links; events from the new subscription go through the same debounce and handlers and a create event for a directory inside it is handled the same way. Release the subscription on a delete event for the directory, and release them all in removeRepo (those under the repo) and close. Add src/indexer/__tests__/watcher-new-directories.test.ts with the real @parcel/watcher in temporary directories; every wait polls for the expected event with a time limit instead of sleeping a fixed time.

**Acceptance checks:**
- After addRepo, mkdir -p a/b/c with a file written at once yields a create event for that file, and a file written in a/b/c three seconds later yields an event too
- A tree created in one call yields a create event for every file in it, including nested ones, and a symbolic link to a directory is not followed
- Files in a new node_modules directory or in an ignored subdirectory of a new directory yield no events, at creation or when written later
- After a new nested directory is deleted and created again with the same path, files written in it are reported again
- After close() no handler is called for later writes, and after removeRepo() the repo's per-directory subscriptions deliver nothing
- The public methods addRepo, removeRepo and close keep their signatures and the {type, path} event shape, and src/daemon/index.ts and src/daemon/threads/indexing-worker.ts need no edit
- The watcher test file waits by polling with a time limit and passes in three consecutive runs

### 1.2 TASK-fa396bdf197b8e8b-s1-t2 — Make the subscribe function injectable and tolerate its failure

Give the Watcher an optional subscribe function argument that defaults to the real @parcel/watcher subscribe, so a test can force the per-directory subscribe to fail. When it fails, log a warning with the directory, keep no entry for it, and still scan so the files present are reported once. Tolerate a throwing readdir or lstat during the scan by skipping that entry. Add the failure-injection test and the unreadable-directory test (mode 000, skipped as root) to watcher-new-directories.test.ts.

**Acceptance checks:**
- With a subscribe function that throws for the per-directory call, addRepo and later events do not throw, a warning is logged, and the files present in the new directory are still reported once
- A new nested directory that cannot be read does not throw and does not stop later events for other directories
- new Watcher() with no argument still uses the real subscribe, as both existing callers do

### 1.3 TASK-fa396bdf197b8e8b-s1-t3 — Settle missing files and list stale held files in the freshness compute

In src/workflow/code-review/freshness.ts add the selection and requestedAt seams to FreshnessDeps and unindexedFiles to FreshnessResult. Settle a file whose mtime is 0 first (not stale, not listed, no seam consulted). Keep the watermark comparison for a file with entities and list it as unindexed when stale unless requestedAt is at or after its mtime. Class a file without entities with the selection seam: not-code and excluded-by-ignore are not stale, selected is stale and listed unless requested, a throwing selection keeps it stale and unlisted. Add the real selection seam to realFreshnessGraphDeps, built on selectFile and resolveRepoIgnore with the parsers loaded. Update the whole-result assertions in freshness.test.ts and add the unit cases.

**Acceptance checks:**
- A file whose mtime is 0 is not stale, not in unindexedFiles, and neither the entity nor the selection seam decides it
- A file with no entities and selection not-code or excluded-by-ignore is not stale whatever lastIndexed is; a selected one is in staleFiles and unindexedFiles when never requested
- With an idle queue, a file whose watermark is older than its mtime is in staleFiles and unindexedFiles and the selection seam is not consulted for it
- A stale file requested at or after its mtime stays in staleFiles but leaves unindexedFiles; a file edited after its request is listed again
- A throwing selection seam keeps an entity-less file stale and out of unindexedFiles; the compute calls no write seam
- The existing whole-result assertions in freshness.test.ts are updated for unindexedFiles and pass

### 1.4 TASK-fa396bdf197b8e8b-s1-t4 — Queue the index request in the codeReview.freshness handler

In src/daemon/handler-runtime.ts keep an in-memory request map for the codeReview.freshness handler, supply requestedAt from it, queue one 'file' job (event update) for each file in unindexedFiles with its request time recorded, and re-read the queue state so the same reply shows the work. If buildHandlerRuntime cannot be driven with fake dependencies, put the request step in a small function that takes the queue, the request map and the compute result and have the handler call it; that extraction is then the only production change beyond the handler. Add src/daemon/__tests__/code-review-freshness-request.test.ts (the handler or that function with a recording queue; the real selection seam with the indexer parsers registered) and a contract case in src/daemon/steps/code-review-step/__tests__/handler.test.ts for a stale file with an idle queue in a mixed set.

**Acceptance checks:**
- The request step queues one file job for each file in unindexedFiles, queues nothing for a second identical poll, and queues again after the file's mtime moves
- After queueing, the same reply carries isProcessing, inFlight and pendingCodeIndexJobs read from the queue after the jobs were queued
- The real selection seam returns not-code for a .png and package-lock.json, excluded-by-ignore for a .ts under node_modules, and selected for a .ts and a small .md; a nonexistent changed .ts path is not stale and queues nothing while an existing entity-less .ts file is stale and queued once
- With proceed true and a freshness that keeps reporting one stale file with an idle queue while other files have symbols, the wait ends at the freshness time-out in the degraded diff review and no full review runs
- src/daemon/__tests__/handler-runtime.test.ts and the routing, long-review, RPC fallback and review-stream-freshness tests pass unchanged

### 1.5 TASK-fa396bdf197b8e8b-s1-t5 — Check the fix end to end on a rebuilt daemon (reported by the builder)

Rebuild the daemon and restart it, then with it running create mkdir -p dir/sub with a small .ts file at once and another file three seconds later, and see both indexed without a restart; then edit an already indexed file and see it fresh. The build gate cannot run this, so the builder reports the result with the codeReview.freshness replies as evidence.

**Acceptance checks:**
- codeReview.freshness reports a file written at once into a directory created with mkdir -p as not stale within seconds, and the file written three seconds later too, with no restart in between
- An edit of an already indexed file is reported fresh after the gate's request
- The reply of each check is quoted in the report

### 1.6 TASK-fa396bdf197b8e8b-s1-t6 — Clean up after the end-to-end check

Remove the probe files and directories created for t5, confirm config.json has logLevel info, and confirm the daemon is running at the info level.

**Acceptance checks:**
- No probe file or directory remains in the repo and git status shows no stray file from the check
- config.json has logLevel info and the daemon's log shows no debug lines after its latest start

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| src/indexer/__tests__/watcher-new-directories.test.ts: after addRepo, mkdir -p a/b/c with a file written in it at once yields a create event for that file, and a second file written in a/b/c three seconds later yields an event too (the case that produced no event before the fix) | `t1` |
| src/indexer/__tests__/watcher-new-directories.test.ts: a directory tree with files created in one call yields a create event for every file in the tree, including files in nested directories, and a symbolic link to a directory is not followed | `t1` |
| src/indexer/__tests__/watcher-new-directories.test.ts: files inside a new directory whose name is on the ignore list (node_modules) and inside an ignored subdirectory of a new directory yield no events, at creation and when written later | `t1` |
| src/indexer/__tests__/watcher-new-directories.test.ts: after a new nested directory is deleted and created again with the same path, files written in it are reported again | `t1` |
| src/indexer/__tests__/watcher-new-directories.test.ts: after close() no handler is called for later writes, and after removeRepo() the repo's per-directory subscriptions deliver nothing | `t1` |
| src/indexer/__tests__/watcher-new-directories.test.ts: a new nested directory that cannot be read (mode 000, skipped when running as root) does not throw or stop later events for other directories | `t2` |
| src/workflow/code-review/__tests__/freshness.test.ts: a changed file whose mtime is 0 (deleted or unstattable) is not stale, not in unindexedFiles, and neither the entity nor the selection seam decides it, even when selection would say selected | `t3` |
| src/workflow/code-review/__tests__/freshness.test.ts: a file with no entities and selection 'not-code' or 'excluded-by-ignore' is not stale, whatever the repo-level lastIndexed is | `t3` |
| src/workflow/code-review/__tests__/freshness.test.ts: a file with no entities and selection 'selected' is in staleFiles and unindexedFiles when it was never requested | `t3` |
| src/workflow/code-review/__tests__/freshness.test.ts: with an idle queue, a file with entities whose watermark is older than its mtime (a missed update) is in staleFiles and unindexedFiles, and the selection seam is not consulted for it | `t3` |
| src/workflow/code-review/__tests__/freshness.test.ts: a stale file requested at or after its mtime stays in staleFiles but leaves unindexedFiles, with the queue idle or busy, for both an entity-less file and a file with an older watermark | `t3` |
| src/workflow/code-review/__tests__/freshness.test.ts: a file edited after its request is in unindexedFiles again | `t3` |
| src/workflow/code-review/__tests__/freshness.test.ts: a selection seam that throws keeps an entity-less file stale and out of unindexedFiles | `t3` |
| src/workflow/code-review/__tests__/freshness.test.ts: a file with entities whose watermark is at or after its mtime is not stale and not in unindexedFiles; the compute calls no write seam | `t3` |
| src/workflow/code-review/__tests__/freshness.test.ts: the existing whole-result assertions are updated for the unindexedFiles field and still pass | `t3` |
| src/daemon/__tests__/code-review-freshness-request.test.ts: the codeReview.freshness handler built by buildHandlerRuntime with a recording queue queues one 'file' job for each file in unindexedFiles, queues nothing for a second identical poll, and queues again after the file's mtime moves | `t4` |
| src/daemon/__tests__/code-review-freshness-request.test.ts: after queueing, the same reply carries isProcessing, inFlight and pendingCodeIndexJobs read from the queue after the jobs were queued | `t4` |
| src/daemon/__tests__/code-review-freshness-request.test.ts: realFreshnessGraphDeps().selection, with the indexer's parsers registered, returns 'not-code' for a .png file and package-lock.json, 'excluded-by-ignore' for a .ts file under node_modules, and 'selected' for a .ts file and a small .md file in a real temporary directory | `t4`, `t3` |
| src/daemon/__tests__/code-review-freshness-request.test.ts: through the real seams, a changed .ts path that does not exist is not stale and queues nothing, while an existing entity-less .ts file is stale and queued once | `t4` |
| src/daemon/__tests__/handler-runtime.test.ts: the recorded handler key sets are unchanged because no method is added | `t4` |
| src/daemon/steps/code-review-step/__tests__/handler.test.ts: with proceed:true and a freshness that keeps reporting one stale file with an idle queue while other changed files have symbols, the wait ends at the freshness time-out in the degraded diff review (fallback reason freshness-timeout naming that file) and no full review runs | `t4` |
| src/daemon/steps/code-review-step/__tests__/routing.test.ts and long-review.test.ts, src/daemon/__tests__/code-review-rpc-fallback.test.ts and src/shared/__tests__/review-stream-freshness.test.ts pass unchanged | `t4` |
| Reported by the builder, not run by the gate: with the rebuilt daemon running, create mkdir -p dir/sub with a small .ts file in it at once, then another file three seconds later, and see both indexed (codeReview.freshness reports them not stale) without a restart; then edit an already indexed file and see it fresh | `t5`, `t6` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s1 Watcher.addRepo, Watcher.removeRepo and Watcher.close contract and the Watcher per-directory subscriptions data model`
- **[[c2]]** `prior-artifact` `LLD s1 error paths, edge cases and invariants to preserve`
- **[[c3]]** `prior-artifact` `LLD s1 computeCodeReviewFreshness and realFreshnessGraphDeps contract, FreshnessDeps and FreshnessResult data model`
- **[[c4]]** `prior-artifact` `LLD s1 codeReview.freshness handler contract and the index request map data model`
- **[[c5]]** `prior-artifact` `LLD s1 test strategy and acceptance mapping ac1 to ac9`
- **[[c6]]** `prior-artifact` `LLD s1 migration steps, including the rebuild and restart of the daemon`
