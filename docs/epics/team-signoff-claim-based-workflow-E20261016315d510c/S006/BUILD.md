<!-- insrc:artifact BUILD-315d510cb28100e2-s6 -->

# Build (plan-driven) — Story s6

**Standalone:** no  ·  **Created:** 2026-10-18T17:06:54.425Z  ·  **Updated:** 2026-10-18T17:55:03.121Z

**Commit:** b76ab903

## Summary

Both findings addressed. (1) handoffBranchName now refuses a branch name in which ANY slash-separated component ends in .lock (or starts with a dot), as git does, not just a name that ends in .lock: 'foo.lock/{id}', 'x/y.lock/{id}', '{id}.lock' and '{id}/.hidden' are refused; the pure branch-name test lists them, and the parkPlan test's invalid-pattern loop now includes 'foo.lock/{id}' and 'x/y.lock/{id}' and expects ok:false with the branch reason. (2) Scope: I reverted src/daemon/steps/workflow-step/park-offer.ts to exactly its t5 content (git diff against t5's commit is empty), so this task no longer touches the sibling. parkPlan therefore has its own non-exported copy of the 'is this run for this unit' check, and the duplication is logged as open issue S6-1 in docs/plans/s6-open-issues.md (to be merged once the Story is built). The earlier t6 fixes stand: the planner reads the tracker context with createIssue false so it never creates an issue, and the branch is validated before any git command. config/github.ts's resolveBranchPattern remains, as the only way to read the repo's branchPattern. Pure, park-plan and park-offer tests pass; tsc clean.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✗ `t6`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `docs/plans/s6-open-issues.md` — **insrc-build** (2026-10-18T17:55:03.121Z)
- `src/cli/__tests__/settings-modal.test.ts` — **insrc-build** (2026-10-18T17:55:03.121Z)
- `src/cli/services/index.ts` — **insrc-build** (2026-10-18T17:55:03.121Z)
- `src/config/__tests__/fixtures/repo-fields-catalog.json` — **insrc-build** (2026-10-18T17:55:03.121Z)
- `src/config/__tests__/repo-fields.test.ts` — **insrc-build** (2026-10-18T17:55:03.121Z)
- `src/config/repo-fields.ts` — **insrc-build** (2026-10-18T17:55:03.121Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-18T17:55:03.121Z)
- `src/daemon/steps/host.ts` — **insrc-build** (2026-10-18T17:55:03.121Z)
- `src/daemon/steps/workflow-step/__tests__/handoff-ownership.test.ts` — **insrc-build** (2026-10-18T17:55:03.121Z)
- `src/daemon/steps/workflow-step/__tests__/state-store-meta.test.ts` — **insrc-build** (2026-10-18T17:55:03.121Z)
- `src/daemon/steps/workflow-step/park-offer.ts` — **insrc-build** (2026-10-18T17:55:03.121Z)
- `src/daemon/steps/workflow-step/phases/start.ts` — **insrc-build** (2026-10-18T17:55:03.121Z)
- `src/daemon/steps/workflow-step/state-store.ts` — **insrc-build** (2026-10-18T17:55:03.121Z)
- `src/daemon/steps/workflow-step/state.ts` — **insrc-build** (2026-10-18T17:55:03.121Z)
- `src/workflow/config/github.ts` — **insrc-build** (2026-10-18T17:55:03.121Z)
- `src/workflow/team/__tests__/handoff-park-plan.test.ts` — **insrc-build** (2026-10-18T17:55:03.121Z)
- `src/workflow/team/__tests__/handoff-pure.test.ts` — **insrc-build** (2026-10-18T17:55:03.121Z)
- `src/workflow/team/__tests__/park-offer.test.ts` — **insrc-build** (2026-10-18T17:55:03.121Z)
- `src/workflow/team/__tests__/snapshot-upstream.test.ts` — **insrc-build** (2026-10-18T17:55:03.121Z)
- `src/workflow/team/gate.ts` — **insrc-build** (2026-10-18T17:55:03.121Z)
- `src/workflow/team/handoff.ts` — **insrc-build** (2026-10-18T17:55:03.121Z)
- `src/workflow/team/run-meta.ts` — **insrc-build** (2026-10-18T17:55:03.121Z)
