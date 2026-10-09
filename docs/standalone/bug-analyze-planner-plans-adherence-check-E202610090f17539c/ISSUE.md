<!-- insrc:artifact ISSUE-0f17539c98aa78ee -->

# Plan no adherence check that has no constraints to check

## Reproduction

Ask for a data or an infra analysis of a repository.

Observed live on 2026-10-09 through the installed daemon, on this repository:

- A data request at size S (run `s7-live-data-S-mv0sqby9`). The plan held four `data.adherence.check` tasks (t02 to t05), each with a `dataSubject` and `maxSourceExcerpts` and no constraint parameter. The plan passed validation. All four failed when they ran; two of the plan's six tasks completed.
- An infra request at size L. The plan held four `infra.adherence.check` tasks (t12 to t15), each with `params` of `{ infraSubject: <one workflow file> }` and nothing else. The plan passed validation. All four failed when they ran.

Each failed with:

`no constraints available. Provide one of: params.constraintsSource (upstream taskId of a docs.constraint.enumerate task), params.constraints (inline list), OR params.constraintIds (list of doc-summary entity ids -- the runtime hydrates their keyConstraints from the LiveProjectContext).`

Expected: a plan does not contain an adherence check that has nothing to check; where the request calls for one, the plan can obtain the constraints it checks against.

Observed: the plan is accepted, the tasks fail when they run, and the report is written without any adherence finding.

The results are kept whole in `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S007/measurements/live/` (`data-S.result.json`, `infra-L.plan.json`, `infra-L.result.json`).

## Root cause

Three things combine.

1. A task with no constraint source passes plan validation. The adherence templates of the code, data and infra families require only the subject (for infra, `required: ['infraSubject']`); `constraintsSource`, `constraints` and `constraintIds` are all optional (`src/analyze/planner/templates/infra/index.ts`, and the same in the code and data template files). The plan validator's rule INV-5 checks a task's parameters against that schema (`src/analyze/planner/validate.ts`), so a task with none of the three is valid. The runtime then finds no constraints and throws (`resolveConstraints` in `src/analyze/runtimes/shared/adherence.ts`).

2. The source the templates point to cannot be planned. Each adherence template's description says its constraints come from an upstream `docs.constraint.enumerate` task. That template belongs to the docs family (`src/analyze/planner/templates/docs/index.ts`). A plan's catalog holds only the templates of the plan's own target, unless the target is `generic` (`getTemplatesForTarget` in `src/analyze/planner/templates/registry.ts`), and the validator's rule INV-4 rejects a task whose template has another target (`isTargetCompatible` in `src/analyze/planner/validate.ts`). So a code, data or infra plan cannot contain the task that would produce its constraints.

3. The runtime does not read the source the way the templates describe it. `constraintsSource` is described as the task id of the upstream task (`src/analyze/planner/templates/code/index.ts`), and the runtime looks that value up in the task's upstream outputs, which are keyed by output name, not by task id (`src/analyze/runtimes/shared/adherence.ts`, `src/analyze/executor/types.ts`). A task id given there finds nothing.

That leaves the planner two usable ways to give an adherence task its constraints: write them inline, or name the ids of stored document summaries. Whether the planner is shown those ids, or any document content to write constraints from, was not established for this record.

## Fix intent

A plan does not contain an adherence-check task that has no constraints to check: such a plan fails validation with a message that names the task and says what a constraint source is, so the planner's corrective retry can either give the task a source or leave the task out.

Where a request calls for an adherence check in a code, data or infra plan, the plan has a way that works to obtain the constraints it checks against, and the template's description names only the ways that work.

A constraint source given to an adherence task is read as the template describes it; a source that names something the task does not receive fails with a reason that says so.

A plan whose adherence tasks carry inline constraints or document ids that resolve behaves as it does today.

Which way a plan of another family obtains constraints (holding the docs task, being given the stored constraints, or another) is a decision for the design, not for this record.

Not in scope: the quality of the adherence check itself, and the planner's choice to plan one adherence task per file.

## Citations

- **[[c1]]** `code` `src/analyze/planner/templates/infra/index.ts` — "required:             ['infraSubject'],"
- **[[c2]]** `code` `src/analyze/planner/templates/infra/index.ts` — "constraints come from an upstream docs.constraint.enumerate task OR params.constraints inline."
- **[[c3]]** `code` `src/analyze/planner/validate.ts` — "// INV-5: params validate against template inputSchema"
- **[[c4]]** `code` `src/analyze/planner/templates/registry.ts` — "return getTemplateCatalog().filter(t => t.target === planTarget);"
- **[[c5]]** `code` `src/analyze/planner/validate.ts` — "if (planTarget === templateTarget) return true;
	if (planTarget === 'generic') return true;
	return false;"
- **[[c6]]** `code` `src/analyze/planner/templates/docs/index.ts` — "id:          'docs.constraint.enumerate',"
- **[[c7]]** `code` `src/analyze/planner/templates/code/index.ts` — "taskId of the upstream docs.constraint.enumerate task whose output feeds constraints."
- **[[c8]]** `code` `src/analyze/runtimes/shared/adherence.ts` — "const upstream = args.upstreamOutputs.get(source);"
- **[[c9]]** `code` `src/analyze/executor/types.ts` — "`upstreamOutputs` is a Map from produces-name to materialized"
- **[[c10]]** `doc` `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S007/measurements/live-runs-t17.md` — "Run 2: the planner gave four `data.adherence.check` tasks no constraints."
- **[[c11]]** `doc` `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S007/measurements/live/infra-L.result.json` — "runtime-threw: infra.adherence.check: no constraints available."
