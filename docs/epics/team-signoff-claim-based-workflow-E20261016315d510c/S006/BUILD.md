<!-- insrc:artifact BUILD-315d510cb28100e2-s6 -->

# Build (plan-driven) — Story s6

**Standalone:** no  ·  **Created:** 2026-10-18T17:06:54.425Z  ·  **Updated:** 2026-10-18T17:52:55.111Z

**Commit:** f3252939

## Summary

Fixes for the two refusal-path findings. (1) teamContext(repo, unit, opts) in gate.ts gains opts.createIssue (default true, so every existing caller is unchanged); parkPlan calls it with createIssue: false, so a unit with no issue is reported ('no tracker issue yet') without ensureUnitIssue running, which could have created labels, recorded artifacts or created an issue. The test now stubs ensureIssue to SUCCEED and counts calls: planning a no-issue park leaves the count at 0. (2) The branch name is now resolved and validated before unitDraftFiles runs git status, so a bad pattern refuses with no git command at all: a new test case uses a directory that is not a git repository with an owned run, where a bad pattern gives 'does not identify the unit' and a good pattern runs on to fail with 'cannot read the repository's history' (proving the order). On scope: resolveBranchPattern in config/github.ts is the only way to read the repo's branchPattern (the resolved config type does not carry it) and runIsForUnit is moved, not copied, so that the offer provider and parkPlan decide 'is this run for this unit' with the same code; both are required by this task's behaviour (the branch check and run selection). All other behaviour and the earlier assertions are unchanged; handoff-park-plan passes, team suite passes, tsc clean.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✗ `t6`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/cli/__tests__/settings-modal.test.ts` — **insrc-build** (2026-10-18T17:52:55.111Z)
- `src/cli/services/index.ts` — **insrc-build** (2026-10-18T17:52:55.111Z)
- `src/config/__tests__/fixtures/repo-fields-catalog.json` — **insrc-build** (2026-10-18T17:52:55.111Z)
- `src/config/__tests__/repo-fields.test.ts` — **insrc-build** (2026-10-18T17:52:55.111Z)
- `src/config/repo-fields.ts` — **insrc-build** (2026-10-18T17:52:55.111Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-18T17:52:55.111Z)
- `src/daemon/steps/host.ts` — **insrc-build** (2026-10-18T17:52:55.111Z)
- `src/daemon/steps/workflow-step/__tests__/handoff-ownership.test.ts` — **insrc-build** (2026-10-18T17:52:55.111Z)
- `src/daemon/steps/workflow-step/__tests__/state-store-meta.test.ts` — **insrc-build** (2026-10-18T17:52:55.111Z)
- `src/daemon/steps/workflow-step/park-offer.ts` — **insrc-build** (2026-10-18T17:52:55.111Z)
- `src/daemon/steps/workflow-step/phases/start.ts` — **insrc-build** (2026-10-18T17:52:55.111Z)
- `src/daemon/steps/workflow-step/state-store.ts` — **insrc-build** (2026-10-18T17:52:55.111Z)
- `src/daemon/steps/workflow-step/state.ts` — **insrc-build** (2026-10-18T17:52:55.111Z)
- `src/workflow/config/github.ts` — **insrc-build** (2026-10-18T17:52:55.111Z)
- `src/workflow/team/__tests__/handoff-park-plan.test.ts` — **insrc-build** (2026-10-18T17:52:55.111Z)
- `src/workflow/team/__tests__/handoff-pure.test.ts` — **insrc-build** (2026-10-18T17:52:55.111Z)
- `src/workflow/team/__tests__/park-offer.test.ts` — **insrc-build** (2026-10-18T17:52:55.111Z)
- `src/workflow/team/__tests__/snapshot-upstream.test.ts` — **insrc-build** (2026-10-18T17:52:55.111Z)
- `src/workflow/team/gate.ts` — **insrc-build** (2026-10-18T17:52:55.111Z)
- `src/workflow/team/handoff.ts` — **insrc-build** (2026-10-18T17:52:55.111Z)
- `src/workflow/team/run-meta.ts` — **insrc-build** (2026-10-18T17:52:55.111Z)
