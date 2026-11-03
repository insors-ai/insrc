## Installed-daemon smoke (ISSUE-7d42b5dc S001 t5), 2026-11-03

Installed daemon updated to 1f1c2ebf and restarted (the update skipped npm install on the install marker). Log: /tmp/.insrc/daemon.log (times UTC).

### First pass per repository after the restart: full (by design)

```
[16:06:32] subsystem pass: done  repo /Users/subhagho/work/projects/insors-ai/insors-extraction  mode full  filesRead 3761  elapsedMs 1397  subsystems 87
[16:06:32] subsystem pass: done  repo /Users/subhagho/work/projects/FieldML  mode full  filesRead 645  elapsedMs 226  subsystems 22
[16:06:33] subsystem pass: done  repo /Users/subhagho/work/projects/AFM  mode full  filesRead 391  elapsedMs 126  subsystems 13
```

### A comment-only save in a large graph-complete repository

Repository /private/tmp/insrc-cost-repo (a clone of insors-extraction registered with the daemon under its real path; the user's checkout was not edited). A comment was appended to insors/extraction/db/case_access_data.py at 16:06:53.

```
[16:06:53] file event  insors/extraction/db/case_access_data.py  update
[16:07:10] cross-file settle pass complete  repo /private/tmp/insrc-cost-repo
[16:07:34] subsystem pass: done  repo /private/tmp/insrc-cost-repo  mode full  filesRead 3774  elapsedMs 1248  subsystems 94  summariesWritten 2
[16:08:41] subsystem pass: grouped  repo /private/tmp/insrc-cost-repo  mode unchanged  filesRead 1  elapsedMs 47  subsystems 94
```

Result: pass. The first pass for the clone in the new process is full (the self-healing first pass); the next pass, paced 67 s after it began and after code work, re-reads the one recorded file, finds its contribution unchanged and restamps the 94 groups without regrouping: 47 ms, against a whole-repository read and regroup of every settle before this Story (about 0.5-1.4 s for this repository; see cost-t5.md).

### A save adding a cross-file call, on the same repository

An import of insors.core.utils.metrics.metrics_manager.MetricValue and a function calling it were appended to insors/extraction/db/financial_extraction_data.py at 16:32:54.

```
[16:33:23] cross-file settle pass complete  repo /private/tmp/insrc-cost-repo
[16:45:16] subsystem pass: grouped  repo /private/tmp/insrc-cost-repo  generation 3781  mode incremental  filesRead 1  files 1599  subsystems 93  elapsedMs 248
```

Result: pass. The pass re-read only the saved file, found its contribution changed (a new edge to another file), and regrouped in memory from the stored rows: 94 groups became 93, in 248 ms, without reading the repository's entities. (The pass waited for the summary lane, which held up to 131 document-summary jobs, and for the 60 s pacing.)
