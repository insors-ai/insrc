<!-- insrc:artifact BUILD-315d510cb28100e2-s6 -->

# Build (plan-driven) — Story s6

**Standalone:** no  ·  **Created:** 2026-10-18T17:06:54.425Z  ·  **Updated:** 2026-10-18T18:04:56.321Z

**Commit:** a0943606

## Summary

The finding was right: cleanup was gated on flags set after 'git worktree add' succeeded, but git can fail that command after it made the branch and directory (I confirmed with a failing post-checkout hook: exit 1 and both the worktree and the branch remain). executePark's finally now always runs, with no flags: 'git worktree remove --force <dir>', then remove the directory, then 'git worktree prune' (after the directory is gone), then 'git branch -D <tmp branch>'; each step is harmless when there is nothing to remove, so a half-made worktree is cleaned like any other. The second named test now installs a post-checkout hook that exits 1 in the parker's repo and parks: the result is 'park failed at making the temporary worktree', and assertClean shows only the main worktree in 'git worktree list', no 'insrc-park-tmp-*' branch, an empty temp directory, with the checkout snapshot (HEAD, branch, status, index, draft files) unchanged and the run still in the store; the hook is then removed and the rest of that test (failed note, second park on top, lost race, no remote) runs as before. Both named tests pass; team suite passes; tsc clean.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✗ `t7`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `docs/plans/s6-open-issues.md` — **insrc-build** (2026-10-18T18:04:56.321Z)
- `src/cli/__tests__/settings-modal.test.ts` — **insrc-build** (2026-10-18T18:04:56.321Z)
- `src/cli/services/index.ts` — **insrc-build** (2026-10-18T18:04:56.321Z)
- `src/config/__tests__/fixtures/repo-fields-catalog.json` — **insrc-build** (2026-10-18T18:04:56.321Z)
- `src/config/__tests__/repo-fields.test.ts` — **insrc-build** (2026-10-18T18:04:56.321Z)
- `src/config/repo-fields.ts` — **insrc-build** (2026-10-18T18:04:56.321Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-18T18:04:56.321Z)
- `src/daemon/steps/host.ts` — **insrc-build** (2026-10-18T18:04:56.321Z)
- `src/daemon/steps/workflow-step/__tests__/handoff-ownership.test.ts` — **insrc-build** (2026-10-18T18:04:56.321Z)
- `src/daemon/steps/workflow-step/__tests__/state-store-meta.test.ts` — **insrc-build** (2026-10-18T18:04:56.321Z)
- `src/daemon/steps/workflow-step/park-offer.ts` — **insrc-build** (2026-10-18T18:04:56.321Z)
- `src/daemon/steps/workflow-step/phases/start.ts` — **insrc-build** (2026-10-18T18:04:56.321Z)
- `src/daemon/steps/workflow-step/state-store.ts` — **insrc-build** (2026-10-18T18:04:56.321Z)
- `src/daemon/steps/workflow-step/state.ts` — **insrc-build** (2026-10-18T18:04:56.321Z)
- `src/workflow/config/github.ts` — **insrc-build** (2026-10-18T18:04:56.321Z)
- `src/workflow/team/__tests__/handoff-park-plan.test.ts` — **insrc-build** (2026-10-18T18:04:56.321Z)
- `src/workflow/team/__tests__/handoff-park.test.ts` — **insrc-build** (2026-10-18T18:04:56.321Z)
- `src/workflow/team/__tests__/handoff-pure.test.ts` — **insrc-build** (2026-10-18T18:04:56.321Z)
- `src/workflow/team/__tests__/park-offer.test.ts` — **insrc-build** (2026-10-18T18:04:56.321Z)
- `src/workflow/team/__tests__/snapshot-upstream.test.ts` — **insrc-build** (2026-10-18T18:04:56.321Z)
- `src/workflow/team/gate.ts` — **insrc-build** (2026-10-18T18:04:56.321Z)
- `src/workflow/team/handoff.ts` — **insrc-build** (2026-10-18T18:04:56.321Z)
- `src/workflow/team/run-meta.ts` — **insrc-build** (2026-10-18T18:04:56.321Z)
