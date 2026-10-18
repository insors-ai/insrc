<!-- insrc:artifact BUILD-315d510cb28100e2-s6 -->

# Build (plan-driven) — Story s6

**Standalone:** no  ·  **Created:** 2026-10-18T17:06:54.425Z  ·  **Updated:** 2026-10-18T18:10:25.283Z

**Commit:** 2645648d

## Summary

Removal is now attempted two ways before anything is called a leftover. After the worktree is removed and pruned, 'git branch -D <temp>' runs and, if it fails, 'git update-ref -d refs/heads/<temp>' drops the same branch by another route; only if the branch is still listed after both does the result carry a leftover (cleanupWarning on a successful park, or '; cleanup also failed: ...' on a failed one). The second named test now shows: (a) 'branch -D' failing on its own during a successful park leaves nothing (no warning, assertClean passes, so the fallback really removed the branch); (b) every earlier failure path still ends clean (hook-declined push, half-made worktree from a failing post-checkout hook, git rm failure on a deleted draft, lost race, no remote); and (c) the one scenario that cannot end clean, where BOTH removal commands are made to fail by the test seam, is reported rather than hidden, the test then removing the branch itself. I kept (c) because it checks the honest behaviour when git's own deletion tools are broken; the requirement 'a git failure removes the worktree and local branch' holds for every failure of the park's own steps (add, rm, stage, commit, push), which the other cases show, and for a failure of the removal itself it holds through the second route. Team suite passes; tsc clean.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `docs/plans/s6-open-issues.md` — **insrc-build** (2026-10-18T18:10:25.283Z)
- `src/cli/__tests__/settings-modal.test.ts` — **insrc-build** (2026-10-18T18:10:25.283Z)
- `src/cli/services/index.ts` — **insrc-build** (2026-10-18T18:10:25.283Z)
- `src/config/__tests__/fixtures/repo-fields-catalog.json` — **insrc-build** (2026-10-18T18:10:25.283Z)
- `src/config/__tests__/repo-fields.test.ts` — **insrc-build** (2026-10-18T18:10:25.283Z)
- `src/config/repo-fields.ts` — **insrc-build** (2026-10-18T18:10:25.283Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-18T18:10:25.283Z)
- `src/daemon/steps/host.ts` — **insrc-build** (2026-10-18T18:10:25.283Z)
- `src/daemon/steps/workflow-step/__tests__/handoff-ownership.test.ts` — **insrc-build** (2026-10-18T18:10:25.283Z)
- `src/daemon/steps/workflow-step/__tests__/state-store-meta.test.ts` — **insrc-build** (2026-10-18T18:10:25.283Z)
- `src/daemon/steps/workflow-step/park-offer.ts` — **insrc-build** (2026-10-18T18:10:25.283Z)
- `src/daemon/steps/workflow-step/phases/start.ts` — **insrc-build** (2026-10-18T18:10:25.283Z)
- `src/daemon/steps/workflow-step/state-store.ts` — **insrc-build** (2026-10-18T18:10:25.283Z)
- `src/daemon/steps/workflow-step/state.ts` — **insrc-build** (2026-10-18T18:10:25.283Z)
- `src/workflow/config/github.ts` — **insrc-build** (2026-10-18T18:10:25.283Z)
- `src/workflow/team/__tests__/handoff-park-plan.test.ts` — **insrc-build** (2026-10-18T18:10:25.283Z)
- `src/workflow/team/__tests__/handoff-park.test.ts` — **insrc-build** (2026-10-18T18:10:25.283Z)
- `src/workflow/team/__tests__/handoff-pure.test.ts` — **insrc-build** (2026-10-18T18:10:25.283Z)
- `src/workflow/team/__tests__/park-offer.test.ts` — **insrc-build** (2026-10-18T18:10:25.283Z)
- `src/workflow/team/__tests__/snapshot-upstream.test.ts` — **insrc-build** (2026-10-18T18:10:25.283Z)
- `src/workflow/team/gate.ts` — **insrc-build** (2026-10-18T18:10:25.283Z)
- `src/workflow/team/handoff.ts` — **insrc-build** (2026-10-18T18:10:25.283Z)
- `src/workflow/team/run-meta.ts` — **insrc-build** (2026-10-18T18:10:25.283Z)
