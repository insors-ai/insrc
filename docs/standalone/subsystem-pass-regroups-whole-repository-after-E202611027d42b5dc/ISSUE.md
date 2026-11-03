<!-- insrc:artifact ISSUE-7d42b5dceb62afec -->

# Subsystem pass regroups the whole repository after every saved file and never retries failed summaries in a running daemon

## Reproduction

(Cost) In a large registered repository whose graph is complete, save one source file. After the settle, the subsystems job runs: it lists every entity of the repository, reads every file-level relationship, regroups all files from scratch and rewrites the subsystem tables. Save another file and the same full pass runs again. Observed: whole-repository work per saved file, even when the edit changed no relationship between files. Expected: the pass's cost is bounded per settle (no full re-read and regroup when nothing it depends on changed, or not more often than a bounded rate).
(Retry) Make the cheap-tier model unavailable (CLI logged out or provider down) while a new grouping is summarised; the summaries fail and stay empty. Restore the model and leave the daemon running without editing the repository. Observed: the summaries stay empty until the next daemon start, edit or clean-up. Expected: a running daemon retries failed summaries after the outage, with a bounded back-off.

## Root cause

(Cost) Every settle that leaves the graph complete queues a subsystems job (src/indexer/index.ts:1036, inside runSettlePass at src/indexer/index.ts:993; also src/indexer/index.ts:643 and src/indexer/index.ts:885), and the summary-lane queue only collapses duplicates that are still queued (src/daemon/queue.ts:275-276). When the stored groups are of an older generation, runSubsystemPass lists all of the repository's entities and relationships and regroups from scratch (src/indexer/subsystem-pass.ts:148, src/indexer/subsystem-pass.ts:164); each settle advances the generation, so each saved file pays the full pass. (Retry) The pass reports failed summaries (summariesFailed, src/indexer/subsystem-pass.ts:57, src/indexer/subsystem-pass.ts:267) but nothing re-queues the job on failure; the job is queued again only by a full index, a settle, or a clean-up (src/indexer/index.ts:497, src/indexer/index.ts:643, src/indexer/index.ts:885, src/indexer/index.ts:1036), the clean-up being queued at daemon start or on an ignore-filter refresh.

## Fix intent

The subsystem pass's cost per settle is bounded: a saved file that changes nothing the grouping depends on does not trigger a whole-repository re-read and regroup, and bursts of saves do not run the full pass back to back; the stored groups still converge to the current graph. A running daemon retries failed subsystem summaries after a failure, with a bounded back-off, without starving code work or calling the model concurrently. The cost bound is measured on a large repository before and after.

## Citations

- **[[c1]]** `code` `src/indexer/index.ts:1036` — "await this.enqueueSubsystemsIfComplete(repoPath);"
- **[[c2]]** `code` `src/indexer/index.ts:669` — "protected async enqueueSubsystemsIfComplete(repoPath: string): Promise<void> { if ((await readIndexState(repoPath))?.graphComplete === true) this.queue.enqueue({ kind: 'subsystems', repoPath }); }"
- **[[c3]]** `code` `src/daemon/queue.ts:275-276` — "if (job.kind === 'subsystems') { if (queue.some(j => j.kind === 'subsystems' && j.repoPath === job.repoPath)) return;"
- **[[c4]]** `code` `src/indexer/subsystem-pass.ts:164` — "const entities = await listEntitiesForRepo(db, repoPath);"
- **[[c5]]** `code` `src/indexer/subsystem-pass.ts:267` — "return { summariesWritten: written, summariesFailed: failed, stopped: false };"
- **[[c6]]** `code` `src/indexer/index.ts:497` — "await attempt('queueing the subsystem pass', () => this.enqueueSubsystemsIfComplete(repoPath));"
- **[[c7]]** `prior-artifact` `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S008/BUILD.md`
