# Story s2: the live check of task t9

Two plan-tree runs through the installed daemon, one after the other, each started detached, with no other session running a request. The daemon was at commit `67b5ca52` (updated and restarted for this check; a model-free request confirmed it runs the Story's code). The runs spent the stakeholder's Claude quota, on the stakeholder's word.

Both requests are the same except for their scope: `analyze.run.start`, kind of source `code`, stated size `M`, prompt "What does this code do, and how are its parts connected?". The client is `live/run.mjs`. Every frame the daemon sent, the result, the run record and the plan of each run are in `live/`, whole.

| | Scope | Started (UTC) | Seconds | Result | Measured size | Counts | Stated | Plan |
|---|---|---|---|---|---|---|---|---|
| `directory` | module `src/analyze/classifier` | 2026-10-09 20:06:27 | 87 | ok | **S** | 9 files, 44 entities | M | 5 tasks, all ok |
| `repo` | repo (the whole repository) | 2026-10-09 20:08:13 | 504 | ok | **XL** | 4,584 files, 41,943 entities | M | 22 tasks: 18 ok, 4 failed |

## What the check asks, and what was observed

**The same request on one directory and on the whole repository returns different measured sizes, each with its counts in the report.** Observed: S and XL. The measure is in each run's answer report, in its run record and on its progress frame (`classified: code/S`, `classified: code/XL`):

```json
{ "source": "named-area", "items": 44,    "files": 9,    "characters": null, "size": "S",  "determined": true, "sizeHint": "M" }
{ "source": "named-area", "items": 41943, "files": 4584, "characters": null, "size": "XL", "determined": true, "sizeHint": "M" }
```

The second line of each final report is the measure line:

```
Size: S, measured from the area the request names: 9 files, 44 entities. The caller asked for M.
Size: XL, measured from the area the request names: 4,584 files, 41,943 entities. The caller asked for M.
```

The stated size, M in both, is recorded as the hint and is neither run's size.

**No model call picks a size.** The installed build's plan-tree driver and classifier module contain no call to the size picker (a search of `out/analyze/orchestrator/driver.js` and `out/analyze/classifier/index.js` for its name finds none), and the role it ran under is gone from the taxonomy. In both runs the `classified` frame follows `classify started` directly. Each run's intent reads `target hinted via slash command (classifier skipped)`, so no classifier ran either: the size on the intent can only have come from the measure.

**The plan follows the measured size.** The directory run's plan has 5 tasks, inside the band of S for a request with a focus (5 to 20). The repository run's plan has 22, inside the band of XL for a request with a focus (20 to 80). Stated as M, both would have been planned in the band of M.

**A child plan is measured from the area it names.** The repository run's plan has four planner tasks. The planner model wrote a size for each child; the plan each child got was built for the child's measured size:

| Task | Area | The model's figure | Built for | Plan attempts |
|---|---|---|---|---|
| t18 | `src` | L | L | 1 |
| t19 | `jetbrains-plugin` | M | **L** | 2: the first, of 13 tasks, was refused for L (15 to 60) |
| t20 | `vscode-plugin` | M | M | 2: the first, of 8 tasks, was refused for M (10 to 40) |
| t21 | `camon` | M | M | 1 |

For t19 the model's figure and the measured size differ, and the plan was held to the measured one.

## What else the repository run showed

These are not what the check asks about. They are recorded because the run showed them.

1. **Three of the four child plans gave no report** (`t18`, `t20`, `t21`: `child-plan-unavailable: child aggregator produced no report`). The answer says so: its completeness line names all three, and the run is reported incomplete. The cause is not in this Story's code. A task's output is stored under the run's id and the task's id alone (`taskOutputPathFor(runId, taskId)` in `src/analyze/executor/cache.ts`), and a child plan is executed under its parent's run id, so a child's task `t10` and the root's task `t10` are one file. In this run the file `t10.json` holds a functional-surface output where the child of `t20` expected its own aggregate report. The executor's walk and its cache were last changed in Story s7. This Story makes the defect reachable in ordinary use: a whole-repository request is now measured XL, and an XL plan spawns child plans; stated as M it spawned none. It is related to, and wider than, the filed defect on same-named outputs (ISSUE-8ab2cc2e). It is not filed yet.
2. **One task failed for its scope** (`t16`, `code.surface.functional` on `scripts`: no stored source file lies under that directory). That is the coded refusal Story s7 added, working as designed.
3. **The run context was incomplete**, as its report says: one lookup skipped a file that is in the index and no longer on disk, two reached their limits, and one was skipped for an empty prerequisite.
4. **The installed daemon's build directory still holds the removed picker's compiled files and prompt** (`out/analyze/classifier/scope-picker.*`, `out/prompts/analyze/scope-picker.system.md`). The build does not delete outputs whose source is gone. Nothing imports or reads them.

## Result

The live test of task t9 **passes**: different measured sizes for the two scopes, each with its counts in the report, and no model call picks a size.
