<!-- insrc:artifact BUILD-0c845762241ba26c-S001 -->

# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-10-14T04:32:59.324Z  ·  **Updated:** 2026-10-14T04:46:53.809Z

**Commit:** 4e4a7378

## Scope

Make the context builder's run-mode check (runShaper, src/analyze/context/driver.ts) use the analyze run's per-source rule (ensureScopeQueryable in src/analyze/runtimes/shared/task-scope.ts) on a cache hit and a miss alike: for a code or docs request, a scope no registered repository contains (or a registered repository with no stored entities) is refused as not indexed; data and infra only for a repository under index; generic not checked. The refusal comes before any lookup or model call, with code 'scope-not-indexed' and the run's message, through analyze.context.buildRun, analyze.plan, the one-shot insrc_analyze and workflow grounding. A caller that checked already (scopeChecked) still skips it; the run's leniency is kept (ISSUE-0c845762241ba26c).

## Triage rationale

bugfix/small: runShaper's checkScopeState runs the not-indexed check for code only; the run's own rule (ensureScopeQueryable) treats code and docs as graph families. One source file plus a test.

## Summary

runShaper's index-state check (checkScopeState, on a cache hit and a miss alike) now calls the analyze run's own per-source rule, ensureScopeQueryable, instead of a code-only copy: a docs request on a scope the index does not hold is refused with 'scope-not-indexed' and the run's message before any lookup or model call, through every run entry point. New run-shaper-wiring test (cold and warm, unregistered and empty repository, scopeChecked skip); a falsifying mutation restoring the code-only check fails it.

## Tasks validated

- ✓ `S001`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/CR-0c845762241ba26c-S001.json` — **insrc-build** (2026-10-14T04:46:53.809Z)
- `.insrc/artifacts/ISSUE-0c845762241ba26c.json` — **insrc-build** (2026-10-14T04:46:53.809Z)
- `docs/standalone/refuse-docs-request-scope-index-does-E202610130c845762/S001/CR.md` — **insrc-build** (2026-10-14T04:46:53.809Z)
- `src/analyze/context/__tests__/run-shaper-wiring.test.ts` — **insrc-build** (2026-10-14T04:46:53.809Z)
- `src/analyze/context/driver.ts` — **insrc-build** (2026-10-14T04:46:53.809Z)

## Feedback

- **subho@insors.io (decision, recorded by the controller)** (2026-10-14T04:46:53.735Z) `comment` — `src/analyze/context/driver.ts`: BUILD approved with the code review's warn verdict (0/1/4), stakeholder decision 2026-10-14. MED (test pass-state unverified by a diff-only review): the gate ran run-shaper-wiring.test.ts, 18/18 pass. LOWs accepted: data/infra behaviour unchanged (ensureScopeQueryable refuses them only under index, as before); the classification/generic guard in checkScopeState is needed to narrow the source type; the context->runtimes import is noted; the test-cleanup LOW is wrong (each test gets a fresh store and registry).
