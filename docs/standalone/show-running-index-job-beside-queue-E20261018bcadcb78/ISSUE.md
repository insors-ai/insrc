<!-- insrc:artifact ISSUE-bcadcb78b94f3630 -->

# Show the running index job beside the queue count

## Reproduction

Queue a full reindex of a large repository (repo.reindex) and watch the insrc TUI. Observed: the Daemon pane reads 'queue 0 job(s)' and the header 'queue 0' for the whole run; on 2026-10-18 a 42-minute full reindex of this repository (3,385 files) looked like an idle daemon, and the user concluded nothing was running. The VS Code daemon status line ('queue N') and the JetBrains daemon settings row ('Queue depth') show the same number. Expected: while a job runs, every daemon surface shows that one is running, which repository, and how far it has got.

## Root cause

Every surface shows the daemon status's queueDepth, the number of jobs waiting to start; the job being worked on is never counted in it (src/cli/panes/DaemonPane.tsx:111, src/cli/app.tsx:190, vscode-plugin/src/panels/daemon-gateway.ts:59, jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/ops/DaemonConfigurable.kt:74). The status's per-lane field reports the index lane only as { depth, running }, with no repository or progress (src/shared/types.ts:979-980, src/daemon/status.ts:86), while the summary lane already carries its sweep's progress. The full index's progress (repository, files selected, files done) is kept in daemon memory (src/indexer/run-record.ts:21-28, :57) and read only for refusal messages (src/analyze/context/invariants.ts:369), so no surface can show it.

## Fix intent

While the daemon works on an index job, every daemon surface (the TUI's Daemon pane and header, the VS Code daemon status and the JetBrains daemon settings) shows that a job is running beside the waiting count, which repository it is for, and for a full index how many files are done of how many selected. An idle daemon still reads as it does today. The waiting count keeps its meaning; nothing that reads it today changes behaviour.

## Citations

- **[[c1]]** `code` `src/cli/panes/DaemonPane.tsx:111` — "queue     <Text bold>{s.queueDepth}</Text> job(s)"
- **[[c2]]** `code` `src/cli/app.tsx:190` — "queue {d.status.queueDepth}"
- **[[c3]]** `code` `vscode-plugin/src/panels/daemon-gateway.ts:59` — "`queue ${raw.queueDepth}`"
- **[[c4]]** `code` `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/ops/DaemonConfigurable.kt:74` — "row("Queue depth", s.queueDepth.toString())"
- **[[c5]]** `code` `src/shared/types.ts:979-980` — "export interface QueueLanes { index:   { depth: number; running: boolean };"
- **[[c6]]** `code` `src/daemon/status.ts:86` — "...(src.queueLanes !== undefined && { queueLanes: src.queueLanes() }),"
- **[[c7]]** `code` `src/indexer/run-record.ts:21-28` — "export interface IndexRunView { readonly repoPath: string; ... readonly filesSelected?: number | undefined; readonly filesDone: number; }"
- **[[c8]]** `code` `src/analyze/context/invariants.ts:369` — "const view = (indexRun ?? readIndexRun)(repo.path);"
- **[[c9]]** `stakeholder` `user, 2026-10-18` — "the TUI is showing 0 jobs in queue"
