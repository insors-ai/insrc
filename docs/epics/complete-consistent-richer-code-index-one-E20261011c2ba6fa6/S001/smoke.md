# s1/t17 smoke — ship and smoke on this repository

## Shipping

- 2026-10-18 06:24 UTC: the installed daemon (at f7304905) was stopped, the "before" counts were read with it stopped, and `maintenance.update` brought it to **8e3fe543**. It was started from ~/.insrc/daemon (pid 47509).
- The store was already at schema v5 (t1–t4 shipped 2026-10-16), so no migration step ran.
- At start every repository read not complete with "the full index has not finished", and start-up queued a full index for each of the six (t11's rule).
- This repository's full index ran 06:26–07:10 UTC: 3,376 files, 0 skipped, 2,738.8 s.
  - Every entity was re-embedded: the rebuild deletes the repository's rows first.
  - Cross-file pass: resolved 9,011; ambiguous 40; completedById 4,822 (Pass 0); returnedToPending 0.

## Before (daemon stopped, store read directly by a script that declared itself the owner)

Pending rows: 21720. By kind:
```
{
  "CALLS": 21486,
  "INHERITS": 139,
  "IMPLEMENTS": 90,
  "IMPORTS": 5
}
```
By class / reason:
```
{
  "(none)": 21715,
  "no-candidate / target-file-missing": 3,
  "awaiting-target / target-not-stored-yet": 2
}
```

IndexState: unwritable **67** {"source-missing": 67}; fullIndexFinished False.

Stored callers outside test files:
- runGrepSearch: **2** — ['/Users/subhagho/work/projects/insors/insrc/src/daemon/tools/builtins/search/grep.ts (src/daemon/tools/builtins/search/grep.ts)', 'runGrep (src/workflow/review/probe.ts)']
- stripReviewSection: **1** — ['reviewArtifactFile (src/workflow/review/run-artifact.ts)']

Document summaries: **11412**.

## After (through the daemon's IPC: repo.stats and search.callers, 07:11 UTC)

repo.stats: status **ready**, 3377 files, 32161 entities, 58624 relations.

Completeness, with the class counts:
```
{
  "complete": true,
  "reasons": [],
  "counts": {
    "pending": {
      "awaiting-target": 0,
      "ambiguous": 40,
      "no-candidate": 20972,
      "external-endpoint": 0
    },
    "unwritable": 0,
    "unembedded": 0,
    "uncommittedFiles": 0
  },
  "uncommittedFiles": [],
  "generation": 3142
}
```

- **unwritable 0** (was 67).
- **awaiting-target 0** (was 21,717: 21,715 never attempted and 2 awaiting).
- Every remaining pending row is classed: no-candidate 20,972 and ambiguous 40.
- **complete: true**.

Stored callers outside test files:
- **runGrepSearch: 4** — ['/Users/subhagho/work/projects/insors/insrc/src/daemon/tools/builtins/search/grep.ts (src/daemon/tools/builtins/search/grep.ts)', 'runConfigTrace (src/analyze/explore/config-trace.ts)', 'runGrep (src/workflow/review/probe.ts)', 'runSearchText (src/analyze/explore/search-text.ts)'] (the file entity of grep.ts is its module-level tool registration). In test files: ['/Users/subhagho/work/projects/insors/insrc/src/daemon/tools/builtins/search/__tests__/grep-core.test.ts (src/daemon/tools/builtins/search/__tests__/grep-core.test.ts)', '/Users/subhagho/work/projects/insors/insrc/src/daemon/tools/builtins/search/__tests__/grep-omitted.test.ts (src/daemon/tools/builtins/search/__tests__/grep-omitted.test.ts)'].
- **stripReviewSection: 4** — ['handleFindings (src/daemon/steps/review-step/phases/findings.ts)', 'handleStart (src/daemon/steps/review-step/phases/start.ts)', 'handleVerdicts (src/daemon/steps/review-step/phases/verdicts.ts)', 'reviewArtifactFile (src/workflow/review/run-artifact.ts)'].

## The four status surfaces (live daemon, 07:11 UTC)

1. **repo.stats**: the completeness above (complete: true for this repository).
2. **CLI Repos pane**: `RepoRow` (src/cli/panes/ReposPane.tsx) rendered with ink-testing-library from the live repo.list. This repository shows the status alone (complete); the five still queued show "incomplete" with their first cause. The last row wraps because the test renderer's width is 100 columns and that path is long.

```
  ● ready    /Users/subhagho/work/projects/insors/insrc  (indexed 10/18/2026, 12:40:51 PM)
  ● indexing incomplete /Users/subhagho/work/projects/insors-ai/insors-extraction  (indexed never)
      1 cause: the full index has not finished
  ● ready    incomplete /Users/subhagho/work/projects/FieldML  (indexed 10/16/2026, 10:29:57 PM)
      2 causes: the full index has not finished
  ● ready    incomplete /Users/subhagho/work/projects/AFM  (indexed 10/16/2026, 10:29:57 PM)
      2 causes: the full index has not finished
  ● ready    incomplete /Users/subhagho/work/projects/findme  (indexed 10/16/2026, 10:29:57 PM)
      1 cause: the full index has not finished
 ● ready    incomplete/Users/subhagho/work/projects/insors/odr-websi  (indexed 9/22/2026, 3:24:11
                      e                                             PM)
      1 cause: the full index has not finished
```

3. **JetBrains**: the live repo.stats reply decoded by `DaemonGatewayImpl.parseRepoStats` and rendered by `completenessRows` (the dialog's "Index completeness" group), in a scratch Gradle test removed after the run. The dialog itself is not headlessly bootable.

```
/Users/subhagho/work/projects/insors/insrc status=ready
Completeness: complete
```

4. **VS Code Daemon tab**: the real host and gateway over the live daemon, shot with headless Chrome. See `t17-vscode-daemon-tab-live.png`: "insrc ready" with a green "complete"; the other five with "incomplete" and their reasons; insors-extraction "indexing".

## Document summaries: NOT YET REGENERATED (open)

The rebuild deleted this repository's 11412 document summaries (LLD 2.10: "the summaries are regenerated ... by the doc-summarise-repo job the full index queues at its end, with model calls").
- The job is queued: the summary lane has depth 1.
- The summary lane runs only while the index lane is idle (Story 0f0e4f45). At 07:11 the index lane held 95 jobs: the other five repositories' full indexes, then file events.
- At about 30 s per summary on the local model (src/indexer/doc-summary-sweep.ts), regenerating 11412 summaries is days of model work.

This acceptance check is open.
