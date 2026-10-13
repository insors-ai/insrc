<!-- insrc:artifact ISSUE-0c845762241ba26c -->

# Refuse a docs request on a scope the index does not hold at every run entry point

## Reproduction

In a store whose registry holds at least one repository:
1. Create a directory that no registered repository contains.
2. Send an analyze run request for docs on it, e.g. analyze.context.buildRun with intent { target: 'docs', scopeRef: { kind: 'repo', value: <that directory> } }.

Observed (2026-10-13, while testing ISSUE-7c255f61): the request is not refused. It runs the docs lookups and calls a model (the claude CLI; the synthesizer logged 'bundle emitted'), then answers as if the scope were indexed. The same request with target 'code' is refused with code 'scope-not-indexed'.

Expected: the docs request is refused with code 'scope-not-indexed' and the same message the analyze run gives for the scope, before any lookup or model call. This should hold for every entry point that reaches the context builder's run mode: analyze.context.buildRun, the one-shot insrc_analyze, the analyze grounding of workflow steps, and analyze.plan. It already holds for the orchestrated run, analyze.classify and the analyze step tool.

## Root cause

The context builder's run-mode entry, runShaper (src/analyze/context/driver.ts:380), makes its own scope check before any model call (driver.ts:441-446) unless the caller has checked already. That check runs the not-indexed check, ensureNonEmptyClosure, only when the source is code (driver.ts:443). Every other non-generic source, docs included, gets only ensureRepoQueryable, the check for a repository being indexed. The analyze run's own rule (ensureScopeQueryable in src/analyze/runtimes/shared/task-scope.ts, used by resolveTaskScope) treats code and docs together as the sources that read the stored graph. The same driver also treats them together elsewhere (driver.ts:1698). The orchestrated run (src/analyze/orchestrator/driver.ts:319) and analyze.classify (src/daemon/analyze-rpc.ts:360) check docs through resolveTaskScope before they reach runShaper. The entry points that rely on runShaper's own check let docs through: analyze.context.buildRun (src/daemon/analyze-rpc.ts:291), analyze.plan (src/daemon/analyze-rpc.ts:453), the one-shot insrc_analyze (src/daemon/steps/analyze-oneshot.ts:123) and workflow-step grounding (src/daemon/workflow-rpc.ts:609), all of which go through runShaper (called from src/analyze/context/index.ts:95, 115 and 140).

## Fix intent

Make the context builder's run-mode check use the same per-source rule as the analyze run: for a code or docs request, a scope no registered repository contains (or a registered repository with no stored entities) is refused as not indexed; for data and infra, only a repository being indexed is refused; a generic request is not checked. The refusal comes before any lookup or model call and carries code 'scope-not-indexed' and the run's message, through every entry point that reaches it. A caller that has made the check already still skips it, and the run's leniency (a registry that cannot be read, or that holds no repository, does not refuse) is kept.

## Citations

- **[[c1]]** `code` `src/analyze/context/driver.ts:443` — "if (shaperId === 'code') {"
- **[[c2]]** `code` `src/analyze/context/driver.ts:380`
- **[[c3]]** `code` `src/analyze/context/driver.ts:1698` — "shaperId === 'code'  || shaperId === 'docs'"
- **[[c4]]** `code` `src/analyze/runtimes/shared/task-scope.ts:93`
- **[[c5]]** `code` `src/analyze/orchestrator/driver.ts:319`
- **[[c6]]** `code` `src/daemon/analyze-rpc.ts:360`
- **[[c7]]** `code` `src/daemon/analyze-rpc.ts:291`
- **[[c8]]** `code` `src/daemon/analyze-rpc.ts:453`
- **[[c9]]** `code` `src/daemon/steps/analyze-oneshot.ts:123`
- **[[c10]]** `code` `src/daemon/workflow-rpc.ts:609`
- **[[c11]]** `code` `src/analyze/context/index.ts:95`
- **[[c12]]** `analyze-bundle` `insrc_analyze_step run on runShaper / buildRun / plan / runAnalyzeOneShot (2026-10-13): the not-indexed branch is code-only at driver.ts:443; the graph records no callers of buildRun or runShaper, text search finds them`
- **[[c13]]** `prior-artifact` `docs/standalone/refuse-unindexed-scope-analyze-step-tool-E202610137c255f61/ISSUE.md`
