<!-- insrc:artifact ISSUE-7c255f612a40e0eb -->

# Refuse an unindexed scope in the analyze step tool before any size is announced

## Reproduction

Against a running daemon (seen on the installed daemon at commit d250513b):
1. Create a directory that no registered repository contains, e.g. /tmp/isc-unindexed with one source file.
2. Call insrc_analyze_step with phase='start', repo='/tmp/isc-unindexed', target='code', focus='how is this code laid out'.

Observed: the call succeeds with next='emit_plan', mints a run state, and its user turn announces the request's size as "XL". Calling phase='plan' with a plan of one module.profile lookup runs the lookup over the file system and returns next='emit_bundle' (size now XS). The request is never refused.

Expected: the start phase refuses the request with code 'scope-not-indexed' and the same message the analyze run gives for this scope, before any size is measured or announced and without minting a run state; the plan and narrow phases refuse likewise. For comparison, the same request sent to the daemon as analyze.context.buildRun is refused with code 'scope-not-indexed' and no size: "Scope /tmp/isc-unindexed produced an empty graph closure. No registered repo contains this path. ..."

## Root cause

Every phase of the step tool resolves its scope through stepScope (src/daemon/steps/analyze-step/scope.ts:29); the start phase calls it at phases/start.ts:64 and then measures the scope at phases/start.ts:69, and the plan and narrow phases call it at phases/plan.ts:112 and phases/narrow.ts:205. stepScope resolves the scope and then runs only ensureRepoQueryable (src/analyze/context/invariants.ts:325), the check for a repository being indexed. It never runs ensureNonEmptyClosure (src/analyze/context/invariants.ts:234), the check that the scope is held by the index, whose only caller is the analyze run's resolveTaskScope (src/analyze/runtimes/shared/task-scope.ts:61), which runs it for the families that read the stored graph (code and docs). So a scope no registered repository contains is resolved and measured as if it were indexed. Story s5 of Epic c2ba6fa6 assumed in its LLD (section 2.1) that the context builder's own checks still covered the step tools; they do not, since the step tools do not go through that entry point. In addition, the step handler (src/daemon/steps/analyze-step/handler.ts:111) maps only RepoIndexingError to its own code; a ScopeNotIndexedError (src/analyze/context/invariants.ts:69) thrown there would surface as code 'internal'.

## Fix intent

Make the step tool apply the same scope checks as the analyze run, for every phase: for a code or docs request, a scope no registered repository contains (or a registered repository with no stored entities) is refused as not indexed; for every non-generic request, a repository being indexed is refused as today; a generic request is not checked. The refusal happens before anything is measured, read from the cache or looked up, and before a run state is minted at the start phase. The step tool replies with code 'scope-not-indexed' and the same message the analyze run gives, as a non-retryable error. The leniency the run keeps (a registry that cannot be read, or that holds no repository, does not refuse) is kept.

## Citations

- **[[c1]]** `code` `src/daemon/steps/analyze-step/scope.ts:29` — "if (intent.target !== 'generic') await ensureRepoQueryable(scope, deps);"
- **[[c2]]** `code` `src/daemon/steps/analyze-step/phases/start.ts:64` — "const resolvedScope = await stepScope(unsized);"
- **[[c3]]** `code` `src/daemon/steps/analyze-step/phases/start.ts:69` — "const area = await measureResolvedScope(resolvedScope, target, input.scope);"
- **[[c4]]** `code` `src/analyze/runtimes/shared/task-scope.ts:61`
- **[[c5]]** `code` `src/analyze/context/invariants.ts:234`
- **[[c6]]** `code` `src/daemon/steps/analyze-step/handler.ts:111` — "if (err instanceof RepoIndexingError) return errorResult('repo-indexing', err.message, true);"
- **[[c7]]** `code` `src/analyze/context/invariants.ts:69`
- **[[c8]]** `analyze-bundle` `insrc_analyze_step run on stepScope / resolveTaskScope / ensureNonEmptyClosure (2026-10-13): ensureNonEmptyClosure's only caller is resolveTaskScope`
- **[[c9]]** `prior-artifact` `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S005/LLD.md:69` — "runShaper keeps its own checks for every other entry point (analyze.context.buildRun, the step tools)."
- **[[c10]]** `code` `src/daemon/steps/analyze-step/phases/plan.ts:112`
- **[[c11]]** `code` `src/daemon/steps/analyze-step/phases/narrow.ts:205`
