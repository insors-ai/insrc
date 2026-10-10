<!-- insrc:artifact ISSUE-8f90988572f4d5b2 -->

# A child plan's task records overwrite its parent's, and a failed child's cause does not reach its parent

## Reproduction

Run a plan-tree analysis whose plan has planner tasks, for example a code request on a whole large repository (it is measured XL, and an XL plan spawns child plans).

1. The records. Observed in the live run s2-live-repo-mv1edxtn of 2026-10-09: the root plan has 22 tasks and four child plans. After the run the files `tasks/t10.json`, `tasks/t12.json`, `tasks/t15.json` and `tasks/t16.json` of the run hold records written by child plans, and the root's own records for its tasks t10, t12, t15 and t16 are gone. Two children that both have a task `t10` also share that one file, so the earlier child's record is gone too. Expected: every task of every plan of the tree keeps its own record.

2. The cause of a failed child. In the same run three child plans failed because their aggregate task failed (`aggregator-llm-unavailable: claude exited with 1. Prompt is too long`). The parent's planner tasks t18, t20 and t21 are recorded, listed in the run's failed tasks and named in the answer report with only `child-plan-unavailable: child aggregator produced no report`. Expected: the parent's failure says which task of the child failed and why, so that a reader of the answer learns the cause without opening files on disk.

Both can be shown without a model: execute a plan tree whose root and child each have a task `t01` with stand-in runtimes and read the task record files; and make the child's aggregate runtime throw and read the planner task's record.

## Root cause

1. A task's record is stored at a path made from the run id and the task id alone. The plan walk executes a child plan with the same run id as its parent and writes each task's record through that one function, so task ids, which are unique only within one plan, collide across the plans of a tree. The walk already knows where it is in the tree (it carries the parent task path for its events), but the record's path does not use it.

2. When the child plan's result has no final report, the planner task is failed with a fixed sentence. The child's result, which holds each child task's record and the failures of the child plan, is at hand at that point and is not read for the cause.

The walk writes these records and does not read them back during a run, so the first defect loses records and does not by itself change an answer. It hid the cause of the second: the child aggregator's real error was found only in a file named after another task.

Not part of this defect: that the aggregate task's prompt can exceed the model's limit on a large area. That is the subject of Story s3 of the analyzer Epic (handling results too large for one pass).

## Fix intent

Every task of every plan in a tree keeps its own record: the record of a child plan's task is stored apart from its parent's and from its sibling plans', and a root plan's records stay where they are today. Removing a run still removes all of them.

A planner task whose child plan produced no report fails with the child's cause: which task of the child failed, and that task's reason. The cause appears wherever the planner task's failure appears today: its record, the run's list of failed tasks and the answer report. The failure keeps its code, `child-plan-unavailable`.

The size of the aggregate prompt is not changed here.

## Citations

- **[[c1]]** `code` `src/analyze/executor/cache.ts` — "return PATHS.analyzeTaskOutput(runId, taskId);"
- **[[c2]]** `code` `src/analyze/executor/walker.ts` — "const childResult = await executePlan(childNode, intent, runId, opts);"
- **[[c3]]** `code` `src/analyze/executor/walker.ts` — "const reason = 'child-plan-unavailable: child aggregator produced no report';"
- **[[c4]]** `code` `src/analyze/executor/walker.ts` — "writeTaskOutput(runId, record);"
- **[[c5]]** `prior-artifact` `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/measurements/live-run-t9.md` — "A child plan's task records share files with its parent's."
- **[[c6]]** `step-output` `The live run s2-live-repo-mv1edxtn (2026-10-09): the child aggregators' records, copied to S002/measurements/live/repo.run/children/shared-file-t12.json and shared-file-t16.json, carry 'aggregator-llm-unavailable: claude exited with 1. Prompt is too long'; the planner tasks' records t18, t20 and t21 carry only 'child-plan-unavailable: child aggregator produced no report'.`
