<!-- insrc:artifact ISSUE-12f70133491114c9 -->

# Stop losing cross-file import and call edges in the code graph

## Reproduction

On a repo that has had one full index (this repo, indexed 2026-07-14, status ready, no pending jobs):

1. Ask for the callers of `runGrepSearch` (the `usage.example` analyzer recipe, or the daemon request `search.callers`). Observed: 1 caller, `runGrep` in `src/workflow/review/probe.ts`. Expected: 4 call sites exist in source: `src/workflow/review/probe.ts:62`, `src/analyze/explore/search-text.ts:100`, `src/analyze/explore/config-trace.ts:100` and `src/daemon/tools/builtins/search/grep.ts:153`.
2. Ask for the callers of `pickScope`. Observed: 0. Expected: 1, at `src/analyze/orchestrator/driver.ts:194`.
3. Ask for the callees of `runSearchText`, `runConfigTrace` or `runAnalyze` (`search.callees`). Observed: only functions defined in the same file (2, 4 and 10). Expected: their cross-file callees as well.
4. Ask for the import graph of `src/analyze/explore`. Observed: 4 edges to `src/shared/logger.ts` and none to `src/daemon/tools/builtins/search/grep.ts`. Expected: 21 of the 23 files there import the logger and 2 import grep.ts.
5. Run `repo.reindex`. Observed: 2,252 files considered, 12 re-parsed, 2,240 skipped as unchanged; the cross-file pass reports resolved 3, ambiguous 1,995, stillUnresolved 20,590; the answers to 1 to 4 do not change.

The answers are returned as plain facts (`totalCallers: 1`) with nothing to say they may be partial, and `repo.stats` reports the repo as ready throughout.

## Root cause

Three faults that compound, plus one separate gap.

1. A resolved edge is silently dropped when its target is not stored yet. `upsertResolvedRelations` (`src/db/relations.ts:120-154`) looks up both endpoints and, when either is missing, counts the edge as skipped and continues, logging at debug level only. A full index (`fullIndex`, `src/indexer/index.ts:359-440`) processes files one at a time in the order `git ls-files` returns them, which is path order. The per-file resolver (`resolveRelations`, `src/indexer/resolver.ts:63-112`) turns a relative import into a resolved IMPORTS edge to the target file's entity id as soon as the target exists on disk, whether or not it has been indexed. So an import from a file that sorts earlier to one that sorts later (for example `src/analyze/...` importing `src/daemon/...` or `src/shared/...`) is written before its target entity exists and is thrown away. Because it was marked resolved it is not placed in the unresolved queue either, so nothing ever retries it.

2. Call resolution depends on those import edges. The cross-file pass (`resolveCall`, `src/indexer/cross-file-resolver.ts:465-507`) links a call only to an exported function in a file the caller's file is recorded as importing (`importsByFile`, built from stored IMPORTS edges, :361-393). With the import edge missing, the call stays unresolved.

3. A reindex cannot repair it. `indexFile` (`src/indexer/index.ts:741-761`) returns early for any file whose stored content hash is unchanged unless it is called with cleanFirst, and `fullIndex` calls it without, so the lost import edges of unchanged files are never rebuilt. The cross-file pass that follows runs only over the rows already in the unresolved queue.

Evidence that 1 is what happened here: of the 23 files in `src/analyze/explore`, 21 import the logger; the graph holds exactly 4 logger edges from that directory, and exactly 4 of those files have been edited since the first index (all 4 import the logger). The 17 that import it and were only ever indexed in the first pass have none. The one correct caller of `runGrepSearch`, in `probe.ts`, was created in October, after its target already existed. Running today's parser and per-file resolver on `search-text.ts` outside the database resolves all three of its imports, including the one to `grep.ts`.

Separate gap: a re-export line (`export { x } from './y.js'`) produces no relation. `src/analyze/classifier/index.ts`, which is only re-exports, parses to no relations at all, so a call that reaches a function through such a file (as `pickScope` is reached through `../classifier/index.js`) can never be linked.

Not established: a forced re-parse of one affected file was requested through the daemon to confirm that its import edge is then written and its call then links; that job was still queued behind the document summariser when this was recorded.

## Fix intent

No resolved edge is lost because its target has not been indexed yet: such an edge is kept and completed once the target exists. An existing index can be repaired, so a reindex rebuilds the edges of files whose content has not changed. A call that reaches a function through a re-exporting file is linked to that function. A repo whose graph is known to be incomplete does not report itself as fully ready, and an edge that cannot be written is surfaced rather than skipped silently. After the fix, on this repo the callers of `runGrepSearch` are 4 and of `pickScope` 1.

## Citations

- **[[c1]]** `code` `src/db/relations.ts` — "if (fromU64 === undefined || toU64 === undefined) {"
- **[[c2]]** `code` `src/indexer/index.ts` — "log.debug({ file: filePath }, 'skipped (unchanged)');"
- **[[c3]]** `code` `src/indexer/cross-file-resolver.ts` — "if (!importedFiles.has(e.file)) continue;"
- **[[c4]]** `code` `src/indexer/resolver.ts` — "const targetId = makeEntityId(repo, absPath, 'file', absPath);"
- **[[c5]]** `code` `src/analyze/classifier/index.ts`
- **[[c6]]** `step-output` `Live checks of 2026-10-07 on this repo: search.callers and search.callees over daemon IPC; repo.reindex (2,252 files, 12 re-parsed, 2,240 skipped; cross-file pass resolved 3, ambiguous 1,995, stillUnresolved 20,590); today's parser and resolver run in-process on search-text.ts, probe.ts, grep.ts, scope-picker.ts and classifier/index.ts; git history of the 23 files in src/analyze/explore`
- **[[c7]]** `stakeholder` `user, 2026-10-07` — "file the issue, but we will get back to it after fixing and analyzer epic"
