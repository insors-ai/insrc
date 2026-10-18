<!-- insrc:artifact BUILD-315d510cb28100e2-s6 -->

# Build (plan-driven) — Story s6

**Standalone:** no  ·  **Created:** 2026-10-18T17:06:54.425Z  ·  **Updated:** 2026-10-18T18:08:32.995Z

**Commit:** 6c6a224b

## Summary

Unchecked git results fixed. (1) A deleted draft is removed on the branch with 'git rm' and its result is now checked: a failure returns 'park failed at removing a deleted draft file: <git message>' and the usual cleanup runs. (2) Cleanup is no longer fire-and-forget: executePark now splits the work into an inner attempt and an outer step that always runs 'worktree remove --force', removes the directory, 'worktree prune', 'branch -D <temp>', and then VERIFIES what is left (git worktree list --porcelain must not list the directory, git branch --list must not show the temp branch, the directory must not exist); anything left is reported: on a successful park as ParkResult.cleanupWarning ('the temporary branch insrc-park-tmp-... could not be removed; remove it by hand ...'), on a failed one appended to its reason ('...; cleanup also failed: ...'). ParkDeps gains the test seam failGit(args), which makes a chosen git command of a park fail with given text. The second named test now also covers: git rm failing on a deleted tracked draft (exact reason, clean afterwards), then the same park without the fault deleting the file on the branch (present in the parent's tree, deleted by this commit, absent from the parked tree); branch -D failing after a successful park (ok:true with cleanupWarning naming the leftover branch); and push failing together with branch -D failing (reason 'park failed at pushing the handoff branch: push exploded; cleanup also failed: the temporary branch ... could not be removed'); the leftover branches are then removed by the test and assertClean passes. Everything earlier in both tests (hook-declined push, half-made worktree from a failing post-checkout hook, failed note, second park on top, lost race, no remote, checkout snapshots unchanged) still passes; team suite passes; tsc clean.

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

- `docs/plans/s6-open-issues.md` — **insrc-build** (2026-10-18T18:08:32.995Z)
- `src/cli/__tests__/settings-modal.test.ts` — **insrc-build** (2026-10-18T18:08:32.995Z)
- `src/cli/services/index.ts` — **insrc-build** (2026-10-18T18:08:32.995Z)
- `src/config/__tests__/fixtures/repo-fields-catalog.json` — **insrc-build** (2026-10-18T18:08:32.995Z)
- `src/config/__tests__/repo-fields.test.ts` — **insrc-build** (2026-10-18T18:08:32.995Z)
- `src/config/repo-fields.ts` — **insrc-build** (2026-10-18T18:08:32.995Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-18T18:08:32.995Z)
- `src/daemon/steps/host.ts` — **insrc-build** (2026-10-18T18:08:32.995Z)
- `src/daemon/steps/workflow-step/__tests__/handoff-ownership.test.ts` — **insrc-build** (2026-10-18T18:08:32.995Z)
- `src/daemon/steps/workflow-step/__tests__/state-store-meta.test.ts` — **insrc-build** (2026-10-18T18:08:32.995Z)
- `src/daemon/steps/workflow-step/park-offer.ts` — **insrc-build** (2026-10-18T18:08:32.995Z)
- `src/daemon/steps/workflow-step/phases/start.ts` — **insrc-build** (2026-10-18T18:08:32.995Z)
- `src/daemon/steps/workflow-step/state-store.ts` — **insrc-build** (2026-10-18T18:08:32.995Z)
- `src/daemon/steps/workflow-step/state.ts` — **insrc-build** (2026-10-18T18:08:32.995Z)
- `src/workflow/config/github.ts` — **insrc-build** (2026-10-18T18:08:32.995Z)
- `src/workflow/team/__tests__/handoff-park-plan.test.ts` — **insrc-build** (2026-10-18T18:08:32.995Z)
- `src/workflow/team/__tests__/handoff-park.test.ts` — **insrc-build** (2026-10-18T18:08:32.995Z)
- `src/workflow/team/__tests__/handoff-pure.test.ts` — **insrc-build** (2026-10-18T18:08:32.995Z)
- `src/workflow/team/__tests__/park-offer.test.ts` — **insrc-build** (2026-10-18T18:08:32.995Z)
- `src/workflow/team/__tests__/snapshot-upstream.test.ts` — **insrc-build** (2026-10-18T18:08:32.995Z)
- `src/workflow/team/gate.ts` — **insrc-build** (2026-10-18T18:08:32.995Z)
- `src/workflow/team/handoff.ts` — **insrc-build** (2026-10-18T18:08:32.995Z)
- `src/workflow/team/run-meta.ts` — **insrc-build** (2026-10-18T18:08:32.995Z)
