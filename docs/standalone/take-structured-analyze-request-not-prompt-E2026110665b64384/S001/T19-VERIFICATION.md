# t19 verification — structured analyze request (Story 65b643840a294422/s1)

Run 2026-11-07 on `v2` after the daemon was updated and the MCP client restarted.

## Build and suites

`npm run build` passes (typecheck and copy-assets). Suites were run once each in foreground chunks.
Every failure listed below also fails on the pre-Story commit `d923f91dc` (compared per file);
none touches the analyzer request path.

Fixed in this Story (failed because of this change, pass now): `lookup-measure` (new `Scope:` line),
`doc-relations-attach` (area-keyed cache row), `step-host` (request-or-focus message),
`forward-step` progress test (code-review tool is no longer a forwarded tool),
tool-surface golden file (regenerated; it also absorbed earlier committed drift in the
code-review, review and approve tools).

Inherited, by cause:

- Review engine being rebuilt in another session (handlers throw `PENDING REVIEW RE-IMPLEMENTATION`;
  `buildAuthorParty` moved to `workflow/code-review/author.js`): `T11 codeReviewStream` and
  `reviewArtifactStream` (16), `in-daemon review client`, `review-resolve-daemon`,
  `workflow-review-rpc`, `code-review-rpc`, `code-review-freshness-request`, `step-host` review
  progress and equivalence, `no-live-store-in-tests` (3).
- Source files the tests import do not exist: `workflow/artifacts/provenance/writer.js`
  (`CM-S3-*` connection-management tests, `task-persistence`), `workflow/review-pipeline/call-events.ts`
  (`model-literal-scan`).
- Out-of-date tests: `handler-runtime`, `lifecycle-wiring`, `daemon-doc-repo-table`, `present-steering`,
  `schema-registry`, `repo-schema-guard`, `import-graph`, `mcp-process-e2e`, `repo-completeness`,
  `team-settle`, `provider-bypass-audit`, `role-router-global-tiers`.
- Environmental or lifecycle: shutdown and watchdog tests, `search request contract` (passes alone),
  `entity.closure under index` (180 s timeout).
- Hang past 9 minutes on both commits, excluded: `peer-state-store-leakfree`, `search-filter`.
- `task-review-plan-path` (task-review code, other session) failed in one run and passed on the baseline run.

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
