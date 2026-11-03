## Cost of the subsystem pass, before and after (ISSUE-7d42b5dc S001 t5), 2026-11-03

Repository: a fresh clone of insors-ai/insors-extraction (commit 8e7e8676, 3974 tracked files, 3774 read by the index; 2110 Python), indexed once into a temporary store (HOME and store under /private/tmp; the user's checkout and ~/.insrc untouched). The same store was then grouped by the pass BEFORE this Story (a worktree at 1a000fe9d) and by the pass AFTER it (this Story's code), each in its own process, with the same saves: a comment appended to insors/extraction/db/case_access_data.py, and a new import + call in insors/extraction/db/financial_extraction_data.py. Harness: /tmp/cost-harness/cost.test.mts (a node:test file run with tsx; the real IndexerService, file job, settle and runSubsystemPass, with a stand-in summariser).

| Pass | Before (full pass every time) | After |
|---|---|---|
| First pass in the process | 935 ms, whole repository | 638-711 ms, mode full, 3774 files read |
| No save since | 0 ms (up-to-date) | 11-18 ms, unchanged, 0 files read |
| After a comment-only save | 530 ms, whole-repository read and regroup | 13-25 ms, mode unchanged, 1 file read, no regroup |
| After a save adding a cross-file call | 518 ms, whole-repository read and regroup | 67 ms, mode incremental, 1 file read, in-memory regroup |

Raw output:

```
index: 44039 ms; state {"generation":3778,"pending":{"awaiting-target":0,"ambiguous":7,"no-candidate":2394,"external-endpoint":0},"unwritable":0,"reasonCounts":{"unwritable":{},"awaiting":{}},"unembedded":32368,"embeddingAvailable":true,"uncommittedFiles":[],"fullIndexFinished":true,"endpointPassFailed":false,"repoPath":"/privat
== before (/tmp/wt-7d-before)
pass 1 (first in this process): 935 ms total; result {"ran":true,"subsystems":94}
pass 2 (nothing saved): 0 ms total; result {"ran":false,"reason":"up-to-date","subsystems":94}
after a comment-only save: 530 ms total; result {"ran":true,"subsystems":94}
after a save adding a cross-file call: 518 ms total; result {"ran":true,"subsystems":93}
== after (/Users/subhagho/work/projects/insors/insrc)
pass 1 (first in this process): 638 ms total; result {"ran":true,"mode":"full","filesRead":3774,"elapsedMs":636,"subsystems":93}
pass 2 (nothing saved): 18 ms total; result {"ran":false,"reason":"up-to-date","mode":"unchanged","filesRead":0,"elapsedMs":17,"subsystems":93}
after a comment-only save: 25 ms total; result {"ran":false,"reason":"up-to-date","mode":"unchanged","filesRead":1,"elapsedMs":25,"subsystems":93}
after a save adding a cross-file call: 12 ms total; result {"ran":false,"reason":"up-to-date","mode":"unchanged","filesRead":1,"elapsedMs":12,"subsystems":93}
== after, second cross-file target (metrics_manager.MetricValue)
pass 1 (first in this process): 711 ms total; result {"ran":true,"mode":"full","filesRead":3774,"elapsedMs":710,"subsystems":93}
pass 2 (nothing saved): 11 ms total; result {"ran":false,"reason":"up-to-date","mode":"unchanged","filesRead":0,"elapsedMs":11,"subsystems":93}
after a comment-only save: 13 ms total; result {"ran":false,"reason":"up-to-date","mode":"unchanged","filesRead":1,"elapsedMs":13,"subsystems":93}
after a save adding a cross-file call: 67 ms total; result {"ran":true,"mode":"incremental","filesRead":1,"elapsedMs":66,"subsystems":93}
```

Notes:

- The first 'after' run's cross-file save rewrote the same call the 'before' run had already stored (the harness restores the files on disk only), so it was correctly 'unchanged'; the second 'after' run used a new call target and measures a real cross-file change.
- Before, every settle advanced the generation, so each saved file paid the whole-repository pass (about 0.5 s here, the read of every entity and edge of 3774 files); after, a save costs its recorded files only.
- Deviation from the plan: the 'before' numbers were planned on the installed daemon. Its summary lane held 156 and then 399 document-summary jobs ahead of the clone's first subsystem pass, so the comparison was run in the harness on the same machine and repository instead. The installed daemon is checked after the update (smoke-t5.md).
