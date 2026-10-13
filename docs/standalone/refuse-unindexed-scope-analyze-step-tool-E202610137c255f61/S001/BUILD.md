<!-- insrc:artifact BUILD-7c255f612a40e0eb-S001 -->

# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-10-13T16:36:10.278Z

**Commit:** d250513b

## Scope

Make insrc_analyze_step apply the analyze run's scope checks in every phase (ISSUE-7c255f612a40e0eb): for a code or docs request, a scope no registered repository contains (or a registered repository with no stored entities) is refused as not indexed; every non-generic request whose repository is being indexed is refused as today; generic is not checked. The refusal comes before anything is measured or a run state is minted, and the step tool replies with code 'scope-not-indexed', the run's message, not retryable. Keep the run's leniency (an unreadable or empty registry does not refuse).

## Triage rationale

bugfix/small: stepScope (src/daemon/steps/analyze-step/scope.ts:29) omits ensureNonEmptyClosure, which resolveTaskScope runs; the handler maps only RepoIndexingError. One module, two source files plus a test.
