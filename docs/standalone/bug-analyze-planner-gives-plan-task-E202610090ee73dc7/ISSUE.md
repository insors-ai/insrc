<!-- insrc:artifact ISSUE-0ee73dc7a00c0f11 -->

# Reject at plan validation a task scope its family does not accept

## Reproduction

Ask for an infra analysis of a repository that has several CI workflow files.

Observed live on 2026-10-09 through the installed daemon, on this repository, in three infra runs (sizes S, M and L). In the size M run the plan held four `infra.inventory.ci` tasks, each with `params.scopeRef` of kind `file` naming one workflow file (`.github/workflows/ci.yml`, `pages.yml`, `jetbrains-plugin.yml`, `vscode-plugin.yml`). The plan passed validation. When the tasks ran, each failed with:

`infra.inventory.ci: scopeRef.kind='file' is incompatible with target='infra'. Allowed kinds for this target: repo, manifest-dir, workspace.` (code `scope-ref-kind-target-mismatch`).

Four tasks failed in each of the three runs; the run with an empty prompt at size S ended `Incomplete: 4 failed`.

Expected: a plan whose task carries a kind of scope its family does not accept does not pass validation; the planner is told which kinds the task accepts and plans again.

Observed: the plan is accepted, the tasks fail when they run, and the report is written without the CI inventory of those files.

The plans and results are kept whole in `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S007/measurements/live/` (`infra-M.plan.json`, `infra-L.plan.json`, `infra-M.result.json`, `empty-prompt-infra-S.result.json`).

## Root cause

The task templates of the code, docs and infra families declare their `scopeRef` parameter with one shared schema, `SCOPE_REF_SCHEMA` (`src/analyze/planner/templates/shared-schemas.ts`), whose `kind` lists all seven kinds of scope for every family: `repo`, `module`, `file`, `symbol`, `connection`, `manifest-dir`, `workspace`. The infra templates use it six times, the code templates three times and the docs templates once.

That schema is the only thing the planner and the plan validator know about a task's scope. The catalog shown to the planner prints each template's `inputSchema` as JSON (`src/analyze/planner/render-catalog.ts`), so the planner is told that an infra task may have a `file` scope. The plan validator's rule INV-5 checks a task's parameters against the template's `inputSchema` and nothing else (`src/analyze/planner/validate.ts`), so a `file` scope on an infra task passes.

The kinds a family really accepts are in a different table, `TARGET_TO_KINDS` (`src/analyze/classifier/validate.ts`): for infra `repo`, `manifest-dir` and `workspace`. That table is applied to a task only when the task runs: the infra runtime reads `params.scopeRef` and resolves it through the one scope function for its family (`src/analyze/runtimes/infra/inventory-ci.ts`), which refuses the kind. By then the plan is fixed and the planner cannot correct it.

The same gap exists for every family that uses the shared schema: a code task may be planned with a `connection` scope and a docs task with a `symbol` scope, and each would be refused only when it runs.

## Fix intent

A plan in which a task's `scopeRef` has a kind its template's family does not accept fails plan validation, with a message that names the task, the kind it was given and the kinds its family accepts, so the planner's corrective retry can fix it.

The catalog shown to the planner lists, for each template, only the kinds of scope its family accepts.

The kinds per family come from the one existing table, so the planner, the validator and the runtime cannot disagree.

A plan whose tasks all carry accepted kinds validates and runs exactly as today. The runtime's own refusal stays as it is.

Not in scope: how the planner chooses between one task over a directory and one task per file, and the CI inventory task accepting a single file.

## Citations

- **[[c1]]** `code` `src/analyze/planner/templates/shared-schemas.ts` — "enum: ['repo', 'module', 'file', 'symbol', 'connection', 'manifest-dir', 'workspace'],"
- **[[c2]]** `code` `src/analyze/planner/templates/infra/index.ts` — "scopeRef: SCOPE_REF_SCHEMA,"
- **[[c3]]** `code` `src/analyze/planner/render-catalog.ts` — "'- **inputSchema**:\n```json\n' + JSON.stringify(t.inputSchema, null, 2) + '\n```\n'"
- **[[c4]]** `code` `src/analyze/planner/validate.ts` — "// INV-5: params validate against template inputSchema"
- **[[c5]]** `code` `src/analyze/classifier/validate.ts` — "infra:   ['repo', 'manifest-dir', 'workspace'],"
- **[[c6]]** `code` `src/analyze/runtimes/infra/inventory-ci.ts` — "const repoPath = (await resolveTaskScope(scopeRef as AnalyzeScopeRef, 'infra', TEMPLATE_ID)).lookupPath;"
- **[[c7]]** `doc` `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S007/measurements/live-runs-t17.md` — "Runs 4, 5 and 6: the planner gave `infra.inventory.ci` tasks a `file`
  scope, which the infra family refuses."
- **[[c8]]** `doc` `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S007/measurements/live/infra-M.result.json` — "infra.inventory.ci: scopeRef.kind='file' is incompatible with target='infra'. Allowed kinds for this target: repo, manifest-dir, workspace."
