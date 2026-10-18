<!-- insrc:artifact BUILD-315d510cb28100e2-s6 -->

# Build (plan-driven) — Story s6

**Standalone:** no  ·  **Created:** 2026-10-18T17:06:54.425Z  ·  **Updated:** 2026-10-18T17:58:42.749Z

**Commit:** dbaaaf5c

## Summary

The remaining finding was another git branch rule (a leading hyphen). handoffBranchName now also refuses a name that starts with '-', and rather than keep finding rules one at a time the pure test now cross-checks the function against git itself: it generates 11 x 11 x 6 patterns from tricky pieces (empty, '-', '.', 'a.lock', '.h', 'a.', 'x..y', {slug}, {type}, '/', '.x') and for every pattern handoffBranchName accepts it runs 'git check-ref-format --branch <name>', which throws (failing the test) if git rejects the name, so an accepted name is always one git accepts; 'git check-ref-format' confirmed '-bad', 'foo.lock/x', 'a..b' and 'x/.h' invalid and the two default-style names valid. '-{id}' and '-x/{id}' are in the explicit refusal lists of both the pure and the park-plan tests. On scope: the diff touches gate.ts only to add the optional createIssue flag to teamContext (every existing caller is unchanged; parkPlan needs it so that planning a park can never create a tracker issue, which the previous round required) and the t4 pure test only because it tests handoffBranchName, which this round fixes again; park-offer.ts is untouched. Earlier fixes stand (branch validated before any tracker or git access, no-write assertions on the tracker, repo and run store). Pure, park-plan and park-offer tests pass; tsc clean.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `docs/plans/s6-open-issues.md` — **insrc-build** (2026-10-18T17:58:42.749Z)
- `src/cli/__tests__/settings-modal.test.ts` — **insrc-build** (2026-10-18T17:58:42.749Z)
- `src/cli/services/index.ts` — **insrc-build** (2026-10-18T17:58:42.749Z)
- `src/config/__tests__/fixtures/repo-fields-catalog.json` — **insrc-build** (2026-10-18T17:58:42.749Z)
- `src/config/__tests__/repo-fields.test.ts` — **insrc-build** (2026-10-18T17:58:42.749Z)
- `src/config/repo-fields.ts` — **insrc-build** (2026-10-18T17:58:42.749Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-18T17:58:42.749Z)
- `src/daemon/steps/host.ts` — **insrc-build** (2026-10-18T17:58:42.749Z)
- `src/daemon/steps/workflow-step/__tests__/handoff-ownership.test.ts` — **insrc-build** (2026-10-18T17:58:42.749Z)
- `src/daemon/steps/workflow-step/__tests__/state-store-meta.test.ts` — **insrc-build** (2026-10-18T17:58:42.749Z)
- `src/daemon/steps/workflow-step/park-offer.ts` — **insrc-build** (2026-10-18T17:58:42.749Z)
- `src/daemon/steps/workflow-step/phases/start.ts` — **insrc-build** (2026-10-18T17:58:42.749Z)
- `src/daemon/steps/workflow-step/state-store.ts` — **insrc-build** (2026-10-18T17:58:42.749Z)
- `src/daemon/steps/workflow-step/state.ts` — **insrc-build** (2026-10-18T17:58:42.749Z)
- `src/workflow/config/github.ts` — **insrc-build** (2026-10-18T17:58:42.749Z)
- `src/workflow/team/__tests__/handoff-park-plan.test.ts` — **insrc-build** (2026-10-18T17:58:42.749Z)
- `src/workflow/team/__tests__/handoff-pure.test.ts` — **insrc-build** (2026-10-18T17:58:42.749Z)
- `src/workflow/team/__tests__/park-offer.test.ts` — **insrc-build** (2026-10-18T17:58:42.749Z)
- `src/workflow/team/__tests__/snapshot-upstream.test.ts` — **insrc-build** (2026-10-18T17:58:42.749Z)
- `src/workflow/team/gate.ts` — **insrc-build** (2026-10-18T17:58:42.749Z)
- `src/workflow/team/handoff.ts` — **insrc-build** (2026-10-18T17:58:42.749Z)
- `src/workflow/team/run-meta.ts` — **insrc-build** (2026-10-18T17:58:42.749Z)
