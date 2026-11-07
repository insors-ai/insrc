# t19 verification — structured analyze request (Story 65b643840a294422/s1)

Run 2026-11-07 on `v2` after the daemon was updated and the MCP client restarted.

## Build and suites

`npm run build` passes (typecheck and copy-assets). Each suite was run once, in foreground chunks
(`--test-force-exit`). Counts are from the run, before the repairs listed below; tests / pass / fail.

| Suite | Run | Tests | Pass | Fail |
| :--- | :--- | ---: | ---: | ---: |
| analyze: `explore` + `analyze/__tests__` | 1 | 251 | 249 | 1 (`doc-relations-attach`, mine, fixed) |
| analyze: `context` | 1 | 497 | 443 | 3 (`lookup-measure` mine, fixed; `provider-bypass-audit`, `role-router-global-tiers` other work) |
| daemon-step: `daemon/steps/__tests__` | 1 | 106 | 84 | 20 (1 mine, `step-host`, fixed; rest below) plus `peer-state-store-leakfree` hang |
| daemon: `daemon/__tests__` (two halves, `search-filter` and `code-review-rpc-fallback` excluded) | 2 | 466 | 435 | 18 |
| db | 1 | 672 | 669 | 3 |
| mcp | 1 | 134 | 112 | 22 (1 mine, forwarder progress test, fixed; rest below) |

Fixed in this Story (they failed because of this change and pass now): `lookup-measure` (new `Scope:` line),
`doc-relations-attach` (area-keyed cache row), `step-host` (request-or-focus message), the forwarder progress
test in `forward-step.test.ts` (the code-review tool is no longer a forwarded tool), and the tool-surface golden
file (regenerated; it also absorbed earlier committed drift in the code-review, review and approve tools).

Inherited: the files below fail the same way on the pre-Story commit `d923f91dc` (compared per file, by failure
count: `nested-planner-memory`, `owner-measurement`, `private-cache`, `provider-diagnostics`, `root-bound-scope`,
`root-run-memory`, `step-host` (2), `task-persistence`, `tool-owner-context`, `analysis-client-refusal`,
`embedding-denial`, `freeform-owner-relay`, `in-daemon-client`, `daemon-doc-repo-table`, `handler-runtime`,
`lifecycle-wiring`, `model-literal-scan`, `repo-completeness`, `review-resolve-daemon`, `team-settle`,
`workflow-review-rpc`, the db audits, and in mcp `daemon-stream-utf8`, `import-graph`, `mcp-process-e2e`,
`repo-schema-guard`, `schema-registry`). `peer-state-store-leakfree` hangs on both commits.
By cause: the review engine being rebuilt in another session (handlers throw `PENDING REVIEW RE-IMPLEMENTATION`,
`buildAuthorParty` moved to `workflow/code-review/author.js`); source files the tests import that do not exist
(`workflow/artifacts/provenance/writer.js`, `workflow/review-pipeline/call-events.ts`); tests out of date with
their code; shutdown and watchdog lifecycle tests.

Not from this Story and not inherited from the baseline: `task-review-plan-path` passes on `d923f91dc` and fails
at HEAD. The cause is the `reviewRevision` full-commit pin check in `task-review/contracts.ts`, added by the other
session's commit `1a761053e` after the baseline; the test expects the older message. Not checked against the baseline
because it was not run there: `provider-bypass-audit`, `role-router-global-tiers`, `code-review-rpc-fallback`
(excluded as a hang) and `search-filter` (hang) were not compared per file.

## Live runs against the updated daemon

1. Module scope: `insrc_analyze_step` with `request.scopeRef = { kind: module, value: <repo>/src/analyze/context }`.
   The planning prompt showed `scopeSource: request` and `Named scope: the module ...`; `concept.resolve` returned
   `anchor.source = named-scope` with every hit under the module. The final report reads
   `Scope: module <repo>/src/analyze/context, named by the request. The lookups centred on that scope itself.`
   and `report.scope = { kind: module, named: request, anchor: named-scope }`.
2. Prompt-only: `insrc_analyze_step` with `focus` only. The intent carried `scopeSource: prompt` and a workspace
   scope. The final report reads
   `Scope: workspace <repo>, the whole repository by default: the caller named no scope.`
   and `report.scope.named = prompt`.
3. Refusals: a module path that does not exist gives `scope-not-found`; `/tmp`, in no registered repo, gives the
   existing `scope-not-indexed`.

Observed limit, as designed: `test.locate` and `symbol.locate` have no area filter, so their hits in run 1 included
files outside the named module. The follow-up Story is limited to runners that already have an area filter.
