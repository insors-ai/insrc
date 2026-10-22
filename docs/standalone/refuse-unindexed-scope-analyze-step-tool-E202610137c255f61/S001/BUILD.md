<!-- insrc:artifact BUILD-7c255f612a40e0eb-s1 -->

# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-10-13T16:36:10.278Z  ·  **Updated:** 2026-10-13T17:15:49.488Z

**Commit:** d4b0371e

## Scope

Make insrc_analyze_step apply the analyze run's scope checks in every phase (ISSUE-7c255f612a40e0eb): for a code or docs request, a scope no registered repository contains (or a registered repository with no stored entities) is refused as not indexed; every non-generic request whose repository is being indexed is refused as today; generic is not checked. The refusal comes before anything is measured or a run state is minted, and the step tool replies with code 'scope-not-indexed', the run's message, not retryable. Keep the run's leniency (an unreadable or empty registry does not refuse).

## Triage rationale

bugfix/small: stepScope (src/daemon/steps/analyze-step/scope.ts:29) omits ensureNonEmptyClosure, which resolveTaskScope runs; the handler maps only RepoIndexingError. One module, two source files plus a test.

## Summary

stepScope makes the analyze run's own index-state check in every phase of insrc_analyze_step through ensureScopeQueryable, the per-family rule resolveTaskScope now uses too: not-indexed for code and docs, under-index for data and infra, none for generic. The handler replies to every scope error through scopeErrorMapping (scopeErrorResult), so a scope the index does not hold is 'scope-not-indexed' and no scope error comes back as 'internal'; only 'repo-indexing' is retryable. Code-review MED (duplicated mapping) and LOW (copied rule) resolved in d4b0371e. Nine falsifying mutations across the two commits each fail the tests.

## Tasks validated

- ✓ `S001`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/ISSUE-61045de91faef1a0.json` — **insrc-build** (2026-10-13T17:15:49.488Z)
- `vscode-plugin/package-lock.json` — **insrc-build** (2026-10-13T17:15:49.488Z)

## Feedback

- **subho@insors.io (decision, recorded by the controller)** (2026-10-13T17:15:47.298Z) `comment` — `src/daemon/steps/analyze-step/scope.ts`: Code review CR-7c255f612a40e0eb-s1 (warn, degraded grounding): MED at scope.ts:41 ACCEPTED WITH NOTE (stakeholder decision 2026-10-13). On every code or docs turn of insrc_analyze_step the not-indexed check reads the repository's entities through listEntitiesForRepo, which decodes the whole entity table: measured about 200 ms per turn on an 84,000-entity store (37,000 for the repository), 0 ms for an unregistered path. The analyze run already pays the same cost per plan task through resolveTaskScope. The real fix is ISSUE-61045de9 (the store has no index of entities by repository), which removes the full scan for every caller; the step tool's per-turn call is added there as evidence. The four LOW findings (test-local optional props without '| undefined', hand-written fixture entity ids, one extra blank line in task-scope.ts, coverage unverified by the review but run by the gate: 4/4 pass) are accepted as they stand.
