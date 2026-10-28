<!-- insrc:artifact ISSUE-75eaf053e7b7cddd -->

# Index files in directories the file watcher never watches, and let the code-review freshness check request stale files

## Reproduction

1. With the daemon running and the repo registered, create a directory together with its parent in one call and write a small source file into it, for example `mkdir -p scripts/__tests__/fixtures/forms && echo 'export const a = 1;' > scripts/__tests__/fixtures/forms/direct-spawn.ts`. 2. Wait any length of time (a file written six seconds later behaves the same) and ask the daemon whether the file is current, for example with the code-review freshness check (`codeReview.freshness`) or by calling `insrc_code_review_step` for a Story that changed it. Observed: the file is reported stale, the index queue is empty, nothing ever indexes it, and with the daemon at debug level there is no 'file event' line for it; `insrc_code_review_step` first answers that the changed files are not freshly indexed and, if the wait is accepted, falls back to a degraded diff review after the freshness time-out. Expected: the file reaches the index within seconds, like a file written into an existing directory. A single new directory, or a child created a second after its parent, is watched correctly. Seen on 2026-10-27: ten fixture files written in new nested directories stayed stale until the daemon was restarted, while a file written in the same second into an existing directory was indexed.

## Root cause

Two causes together. (1) The file watcher keeps one `@parcel/watcher` subscription per repo (`Watcher.addRepo` in src/indexer/watcher.ts:44-62). On Linux that subscription reports a directory created together with its parent, but does not start watching the nested directories created in the same call, so files written into them, at once or minutes later, produce no event; the Indexer only queues files it is told about (src/indexer/index.ts:233-259), so they never reach the index. This was measured on 2026-10-27 with the same watcher version (2.5.6) the daemon runs, standalone and in the daemon at debug level: a file written at once into a directory created with `mkdir -p` produced no event even six seconds later, while a single new directory, or a child created a second after its parent, was watched. A restart repairs it only because the start-up delta pass re-queues files modified since the last index (src/indexer/index.ts:293-303). (2) The code-review freshness check only reads: it judges a changed file with entities by its watermark and a file without entities by the repo-level `lastIndexed` (src/workflow/code-review/freshness.ts:65-90), which is written when a full index completes and also at start-up before the delta jobs finish, and neither the check nor its daemon handler (src/daemon/handler-runtime.ts:596-626) ever asks for a stale file to be indexed, although the daemon has a request that does (src/daemon/handler-runtime.ts:1189-1193). So a file the watcher missed stays stale for as long as the daemon runs, and the review waits until its freshness time-out and degrades.

## Fix intent

A directory created together with its parent must be watched, and the files already in it must reach the index, without a restart. The freshness check must also be able to bring a stale changed file the index holds up to date by asking for it to be indexed once per modification time, must not treat a deleted file or a file the index never holds as stale, and must never call a file fresh that is still stale after its request, so a file that cannot be indexed still ends in the existing degraded diff review. Files whose entities are current, and the existing consumers of the freshness result, must keep working. The daemon's review-session timeout is a separate defect, handled in another session, and is not part of this fix.

## Citations

- **[[c1]]** `code` `src/indexer/watcher.ts:44-62`
- **[[c2]]** `code` `src/indexer/index.ts:233-259`
- **[[c3]]** `code` `src/indexer/index.ts:293-303`
- **[[c4]]** `code` `src/workflow/code-review/freshness.ts:65-90` — "if (repoLastIndexed < mtime) staleFiles.push(file);"
- **[[c5]]** `code` `src/daemon/handler-runtime.ts:596-626`
- **[[c6]]** `code` `src/daemon/handler-runtime.ts:1189-1193` — "queue.enqueue({ kind: 'file', filePath, event: event ?? 'update' });"
