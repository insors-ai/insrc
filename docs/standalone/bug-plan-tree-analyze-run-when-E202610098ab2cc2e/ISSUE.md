<!-- insrc:artifact ISSUE-8ab2cc2edb3743df -->

# Hand a consumer every output of the tasks that share an output name

## Reproduction

Run a plan in which more than one task uses the same template, followed by a task that consumes that template's output.

Observed live on 2026-10-09 through the installed daemon: a code request at size S on this repository (run `s8-live-code-S-mv10dmxn`, prompt "how is the analyze framework structured"). The plan held eight `code.surface.functional` tasks (t04 to t11), one per directory of `src/analyze`, each declaring `produces: ["functional-surface"]`, and an aggregate task t12 that consumes `functional-surface`. All eight tasks finished with status `ok`, and each task record holds its own surface (for example 80 exports for `src/analyze/context`). The final report nevertheless says: "`functional-surface` covered only `src/analyze/summariser`", and describes that one directory as "the only module with a full functional-surface breakdown". `src/analyze/summariser` is the module of t11, the last of the eight.

Expected: the aggregate task is given all eight surfaces, each attributable to the task that produced it, and the report covers all eight.

Observed: it is given one, the last to finish. Nothing is recorded as failed: `tasksCompleted` is 12 and `tasksFailed` is empty.

The evidence is kept whole in `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S008/measurements/live/` (the plan, the twelve task records and the result with the final report).

## Root cause

The plan walk keeps one map of outputs per plan, keyed by output name alone. After each task that finishes `ok` it stores each of the task's outputs with `outputs.set(name, value)` (`src/analyze/executor/walker.ts`), so a second task that produces the same name replaces the first task's value. A consuming task is then given `projectUpstream(task, outputs)`, which copies one value per name the task consumes.

Two tasks of one template always produce the same names. The plan validator's rule INV-6 requires each task's `produces` to equal the template's declared `produces` (`src/analyze/planner/validate.ts`), and the planner's instructions say the same ("`produces` must equal the template's `produces` verbatim", `src/prompts/analyze/planner.system.md`). So a plan cannot give two tasks of one template different output names, and the walk cannot keep both under one name.

The type of what a consumer receives has no room for more than one value per name: `upstreamOutputs` on `TemplateExecuteArgs` is a `ReadonlyMap<string, unknown>` from output name to value (`src/analyze/executor/types.ts`). The shared aggregate code renders that map into the prompt with one block per name (`renderUpstreamSection` in `src/analyze/runtimes/shared/aggregator.ts`), and the five per-family aggregate runtimes and the shared adherence code read the same map.

The rules that decide whether a consumer can run test only whether a name is present. `aggregateUnmet` asks whether any consumed name is in the map, and `absentInputsFor` lists a name as absent only when it is not in the map. So when one of several producers of a name fails and another succeeds, the name counts as present and the failed producer's missing output is not reported as absent.

The defect is not particular to the code family or to the functional-surface template: it applies to every template a plan may use more than once, in every family.

## Fix intent

A task that consumes an output name receives every output produced under that name by the tasks of its plan that finished `ok`, each one attributable to the task that produced it, in the order of the plan. No output of a finished task is replaced by another task's.

The aggregate task's prompt presents all of them, each with the task it came from and enough of that task's parameters to tell the outputs apart, so the report can cover every one.

When some producers of a name failed or were skipped and others succeeded, the consumer still runs on what exists, and the failed producers' outputs are reported to the aggregate task as absent, each with its task and its reason, as a wholly absent name is today.

A plan in which every output name has one producer behaves as it does today: the same prompt content for the aggregate task, the same task records, the same results.

The correction holds for every family (code, docs, infra, data, generic) and for a nested plan's report consumed by its parent.

Not in scope: changing which tasks the planner chooses, or the size of the aggregate task's input (a report over many outputs may meet the model's input limit; that limit is the subject of the epic's Story s3).

## Citations

- **[[c1]]** `code` `src/analyze/executor/walker.ts` — "for (const [name, value] of Object.entries(result.outputs)) {
					outputs.set(name, value);
				}"
- **[[c2]]** `code` `src/analyze/executor/walker.ts` — "for (const name of task.consumes ?? []) {
		if (outputs.has(name)) {
			out.set(name, outputs.get(name));
		}
	}"
- **[[c3]]** `code` `src/analyze/planner/validate.ts` — "// INV-6: produces matches template"
- **[[c4]]** `code` `src/prompts/analyze/planner.system.md` — "**`produces` must equal the template's `produces` verbatim.** The template defines the output names; you just mirror them."
- **[[c5]]** `code` `src/analyze/executor/types.ts` — "readonly upstreamOutputs: ReadonlyMap<string, unknown>;"
- **[[c6]]** `code` `src/analyze/runtimes/shared/aggregator.ts` — "function renderUpstreamSection(map: ReadonlyMap<string, unknown>): string {"
- **[[c7]]** `code` `src/analyze/executor/walker.ts` — "if (consumes.some(name => outputs.has(name))) return null;"
- **[[c8]]** `doc` `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S008/measurements/live-run-t5.md` — "Every functional-surface task succeeded, and the module list is not empty."
- **[[c9]]** `doc` `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S008/measurements/live/code-S.result.json` — "`functional-surface` covered only `src/analyze/summariser`."
