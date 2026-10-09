# Live checks through the installed daemon (Story s7, task t17)

All runs on 2026-10-09 (UTC times below), on this repository
(`scopeRef: { kind: 'repo', value: <this repo> }`), through the installed
daemon at commit `6dc1ccca`, which holds this Story's code. Each request was
sent to the daemon's socket as `analyze.run.start` with a stated kind of
source and size, one run at a time. Models: the daemon's configured tiers
(`cli-claude` opus and sonnet). The whole result, the request and every
frame of each run are in `live/` beside this file; nothing is shortened there.

| # | Request | Started | Seconds | Outcome | Tasks ok / failed | First line of the final report |
|---|---|---|---|---|---|---|
| 1 | infra, S | 10:00 | 84 | completed, report with 6 findings | 7 / 0 | `Complete.` and the basis notes |
| 2 | data, S | 10:02 | 68 | completed, report with 3 findings | 2 / 4 | `Incomplete: 6 failed:` two lookups of the run context, then `t02` to `t05` |
| 3 | code, S | 10:03 | 150 | completed, report with 11 findings | 4 / 8 | `Incomplete: 2 incomplete: … 9 failed:` one lookup of the run context, then `t04` to `t11`, each `code.surface.functional: module entity '<dir>' not found in the graph` |
| 4 | infra, S, **empty prompt** | 10:06 | 71 | completed, report with 5 findings | 7 / 4 | `Incomplete: 4 failed: t03 — infra.inventory.ci: scopeRef.kind='file' is incompatible with target='infra' …` |
| 5a | infra, M | 10:07 | 69 | completed, report with 3 findings | 6 / 4 | `Incomplete: 4 failed: t02 — …` |
| 5b | infra, M (again) | 10:08 | 88 | completed | 6 / 4 | the same four |
| 6 | infra, L | 10:10 | 127 | completed | 8 / 8 | `Incomplete: 8 failed: t02 — …` |
| 7 | docs, S | 10:12 | 546 | **failed** at `execute`, `executor-aggregator-failed` | 10 / 1 | no report |

## What each acceptance check gets

- **An infra and a data request each complete with a final report.** Runs 1
  and 2. Run 2 has a report although four of its six tasks failed: the
  aggregate task ran on the inputs that exist.
- **A code request returns a final report whose first line names the failed
  functional-surface tasks.** Run 3: `t04` to `t11`, all
  `code.surface.functional`, are named on the first line. What those tasks
  treat as a module is Story s8's.
- **A request with an empty prompt and a stated kind of source completes.**
  Run 4. The prompt sent is the empty string; the intent returned has
  `focused: false` and no `focus`.
- **Sizes tried for a nested plan.** S (run 1), M (runs 5a and 5b) and L
  (run 6), all infra. No plan held a planner-kind task: the three plans are
  in `live/*.plan.json`, and every task of each is `kind: 'leaf'`. By the
  stakeholder's decision of 2026-10-08, the integration test over the real
  walk is then the proof of ac2: `a nested plan in which one child task
  failed gives a root report, and the answer report names the child's task
  by its path` in `src/analyze/executor/__tests__/walker-aggregate.test.ts`.
- **The docs request, the accepted exception.** Run 7. All ten docs tasks
  ran and passed; the aggregate task then failed with
  `aggregator-llm-unavailable: claude exited with 1. stderr=Error: piped
  stdin input exceeds 10MB`. The inputs of the report are larger than one
  model call accepts. This is the exception the stakeholder accepted on
  2026-10-08, and it is to be closed by Story s3. It is recorded, not a
  proof. The run record says `failed` at `execute` with the same code.

## What the runs found that is not this Story's

- Run 2: the planner gave four `data.adherence.check` tasks no constraints.
- Run 3: the functional-surface tasks do not find their module (Story s8).
- Runs 4, 5 and 6: the planner gave `infra.inventory.ci` tasks a `file`
  scope, which the infra family refuses. The refusal is the Story's, correct
  and typed (`scope-ref-kind-target-mismatch` on each failed task); the
  planner choosing that scope is not.
- Run 6: four `infra.adherence.check` tasks failed for want of constraints.

## What went wrong while running them

- The first client left out the request's `stream` flag: the daemon answered
  `unknown method` in 10 ms and called no model.
- The first infra run was started as a child of the session and was killed
  when the session ended. The daemon cancelled it and recorded `aborted`
  before `execute`; about a minute of classifying and planning was spent. Its
  files are in `live/aborted/`. Every later run was started detached.
- Size M ran twice. An earlier turn of the same session was still alive,
  unseen, and started the size M run seconds before this one did. The unseen
  turn was stopped. Both results are kept (`infra-M-first` and `infra-M`);
  the two runs wrote their frames to one file, so `infra-M.frames.jsonl`
  holds frames of both. Their results and plans are separate and whole.
