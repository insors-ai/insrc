<!-- insrc:artifact ISSUE-fa396bdf197b8e8b -->

# Fix the code-review freshness gate so changed files can become fresh and the wait cannot deadlock

## Reproduction

1. Create new small source files in a registered repo, for example scripts/__tests__/fixtures/forms/direct-spawn.ts, as part of a Story's commits, then let the daemon sit with an empty index queue. 2. Call insrc_code_review_step phase 'start' for that Story. Observed: it returns confirm_wait listing the new files as 'not freshly indexed' while isProcessing is false. 3. Answer proceed:true. Observed: the call waits until the 3000 s review limit and fails with daemon-review-daemon-error ('review session passed its time limit'); no review is recorded. Expected: the changed files are brought up to date (or recognised as not indexable) and the review runs. Seen on 2026-10-27 on Story s7 of the tool-registry Epic with 10 fixture files; repo lastIndexed was 2026-10-26 16:29 while the files were written on 2026-10-27.

## Root cause

Two causes together. (1) The freshness compute decides a changed file with no indexed entities by comparing the repo-level lastIndexed with the file's mtime (src/workflow/code-review/freshness.ts:84-86). The repo-level lastIndexed comes from the registered-repo row (src/daemon/handler-runtime.ts:614-620) and advances when a full index run completes, so for a file that has no entities an incremental update never makes it fresh: only a full reindex can. A file the index does not hold entities for, whether because it has no code entities, is skipped by the indexer's file selection or was never picked up by the watcher, stays stale. I did not establish which of these applied to the 10 fixture files. (2) The wait loop in the code-review step handler re-reads freshness until the files are fresh or a timeout (src/daemon/steps/code-review-step/handler.ts:305-320) but never asks the daemon to index the stale files, and freshness itself is documented read-only (src/workflow/code-review/freshness.ts:27-29). With an idle queue nothing can change, so the wait cannot succeed. The index.file request that would index a single file exists (src/daemon/handler-runtime.ts:1189-1193) and the indexer's selection rule that says whether a file is code exists (src/indexer/file-selection.ts:57-75), but the gate uses neither.

## Fix intent

A changed file that the index should hold must become fresh without a full reindex, and a changed file the index will never hold must not count as stale. The gate must not wait on work nobody has requested: when files are stale and the queue is idle, the wait asks for those changed files to be indexed and then checks again, and it ends in the existing degraded diff review if they still do not become fresh. The per-file freshness decision for a file with no entities must stop depending on the repo-level lastIndexed alone. The existing behaviour for files that do have entities, and the existing tests of the handler and the RPC fallback, must keep working. Which mechanism to use (a per-file marker, the file-selection rule, or an index request before polling) is left to the design.

## Citations

- **[[c1]]** `code` `src/workflow/code-review/freshness.ts:77-87` — "if (repoLastIndexed < mtime) staleFiles.push(file);"
- **[[c2]]** `code` `src/daemon/handler-runtime.ts:608-622`
- **[[c3]]** `code` `src/daemon/steps/code-review-step/handler.ts:305-320`
- **[[c4]]** `code` `src/daemon/handler-runtime.ts:1189-1193` — "queue.enqueue({ kind: 'file', filePath, event: event ?? 'update' });"
- **[[c5]]** `code` `src/indexer/file-selection.ts:57-75`
