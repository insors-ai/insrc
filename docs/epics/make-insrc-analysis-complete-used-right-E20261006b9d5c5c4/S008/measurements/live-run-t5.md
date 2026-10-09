# Story s8: the live check

One code request at size S on this repository, through the installed daemon, on 2026-10-09.

| | |
|---|---|
| Daemon | installed at `07caf563` (updated and restarted for this check; it was at `6dc1ccca`, which had none of Story s8) |
| Request | `analyze.run.start`, target `code`, size `S`, repo scope on this repository, prompt "how is the analyze framework structured" |
| Run id | `s8-live-code-S-mv10dmxn` |
| Started / ended | 13:36:04 / 13:38:53 UTC, 169 seconds |
| Result | `ok: true`, a final report, 12 tasks completed, 0 failed |

The same request on the daemon before Story s8 (run `s7-live-code-S-mv0ss6p8`, in `../../S007/measurements/live/`) returned a module list of 0 and failed every functional-surface task.

## What each task returned

The planner gave the three listing tasks a module scope on `src/analyze`, and each functional-surface task an absolute directory path.

| Task | Template | Status | Result |
|---|---|---|---|
| t01 | `code.discovery.modules` | ok | 37 modules (`src/analyze`, `src/analyze/__tests__`, `src/analyze/classifier`, ...), record complete, 37 of 37 |
| t02 | `code.discovery.entrypoints` | ok | |
| t03 | `code.structure.module-tree` | ok | 37 modules, 110 edges |
| t04 | `code.surface.functional` | ok | `src/analyze/orchestrator`: 14 exports, 34 internal helpers |
| t05 | `code.surface.functional` | ok | `src/analyze/classifier`: 14 exports, 20 internal helpers |
| t06 | `code.surface.functional` | ok | `src/analyze/context`: 80 exports, 170 internal helpers |
| t07 | `code.surface.functional` | ok | `src/analyze/explore`: 54 exports, 121 internal helpers |
| t08 | `code.surface.functional` | ok | `src/analyze/planner`: 43 exports, 41 internal helpers |
| t09 | `code.surface.functional` | ok | `src/analyze/executor`: 15 exports, 32 internal helpers |
| t10 | `code.surface.functional` | ok | `src/analyze/runtimes`: 26 exports, 130 internal helpers |
| t11 | `code.surface.functional` | ok | `src/analyze/summariser`: 3 exports, 6 internal helpers |
| t12 | `code.aggregate.report` | ok | the final report |

Every functional-surface task succeeded, and the module list is not empty.

## Evidence

Kept whole under `live/`: every frame the daemon sent (`code-S.frames.jsonl`), the request and its times (`code-S.meta.json`), the result with the final report (`code-S.result.json`), and the run's plan, run record and the twelve task records (`code-S.run/`).

## What this run does not show

One request, one prompt, one size. The planner chose a module scope on `src/analyze`, so the module list of the whole repository (209 directories at design time) was not requested by this run. No task was given a stored module entity's id or a file or symbol scope; those are covered by the tests only.
