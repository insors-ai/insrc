<!-- insrc:artifact BUILD-315d510cb28100e2-s6 -->

# Build (plan-driven) — Story s6

**Standalone:** no  ·  **Created:** 2026-10-18T17:06:54.425Z  ·  **Updated:** 2026-10-18T17:50:27.773Z

**Commit:** d9cb210f

## Summary

handoff.ts gains parkPlan(repo, unit, { runToken? }, deps?) and the types ParkPlan / ParkPlanResult / ParkDeps (deps lets tests replace the branch pattern lookup and the clock); runIsForUnit moved here from park-offer.ts (which now imports it). It only reads: it refuses, in this order, a Task unit (before the tracker is asked), a repo that does not enforce claims, a unit with no issue, nobody holding it ('claim it and continue'), the actor holding it (case-insensitive), a supplied token that is not a live run / belongs to another unit / has no owner / belongs to another user, no owned run and no uncommitted draft ('no draft or run to hand over'), and an invalid branch name (handoffBranchName: grammar, missing {id}, bad result); otherwise it chooses the actor's owned run for this unit (the supplied token, else listStates' newest touch) and assembles the checkpoint: a run checkpoint through buildRunCheckpoint (owner = actor, upstream = the entry's snapshot, parker paths made portable) or, with only a draft, a draft-only checkpoint, both with parkedBy, parkedAt, sourceHead (HEAD), repositoryId (the root commit id from rev-list --max-parents=0) and artifactPaths = the unit's uncommitted draft files. It returns the branch name, variant, runId, actor, holder, issue and port for the next task to carry out. config/github.ts gains resolveBranchPattern(repoPath) (the repo's own entry's branchPattern, else the default entry's, else undefined). The named test (real temporary git repo, real state store and gate with a fake tracker, bob as holder) covers every refusal above; an owned awaiting_llm_step run giving a run checkpoint with owner, the upstream snapshot, the root commit id, HEAD, no parker path anywhere, that passes validateCheckpoint after a JSON round trip; the default and a custom branch pattern; two owned runs choosing the newest touch, touching the older one flipping the choice, and a supplied token winning; a draft-only plan listing the untracked LLD json; a run plus a draft listing the draft in artifactPaths; and, after all of it, git status, branches and refs are unchanged and no run was stored by planning. Team and config suites pass; tsc clean.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✗ `t6`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/cli/__tests__/settings-modal.test.ts` — **insrc-build** (2026-10-18T17:50:27.773Z)
- `src/cli/services/index.ts` — **insrc-build** (2026-10-18T17:50:27.773Z)
- `src/config/__tests__/fixtures/repo-fields-catalog.json` — **insrc-build** (2026-10-18T17:50:27.773Z)
- `src/config/__tests__/repo-fields.test.ts` — **insrc-build** (2026-10-18T17:50:27.773Z)
- `src/config/repo-fields.ts` — **insrc-build** (2026-10-18T17:50:27.773Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-18T17:50:27.773Z)
- `src/daemon/steps/host.ts` — **insrc-build** (2026-10-18T17:50:27.773Z)
- `src/daemon/steps/workflow-step/__tests__/handoff-ownership.test.ts` — **insrc-build** (2026-10-18T17:50:27.773Z)
- `src/daemon/steps/workflow-step/__tests__/state-store-meta.test.ts` — **insrc-build** (2026-10-18T17:50:27.773Z)
- `src/daemon/steps/workflow-step/park-offer.ts` — **insrc-build** (2026-10-18T17:50:27.773Z)
- `src/daemon/steps/workflow-step/phases/start.ts` — **insrc-build** (2026-10-18T17:50:27.773Z)
- `src/daemon/steps/workflow-step/state-store.ts` — **insrc-build** (2026-10-18T17:50:27.773Z)
- `src/daemon/steps/workflow-step/state.ts` — **insrc-build** (2026-10-18T17:50:27.773Z)
- `src/workflow/config/github.ts` — **insrc-build** (2026-10-18T17:50:27.773Z)
- `src/workflow/team/__tests__/handoff-park-plan.test.ts` — **insrc-build** (2026-10-18T17:50:27.773Z)
- `src/workflow/team/__tests__/handoff-pure.test.ts` — **insrc-build** (2026-10-18T17:50:27.773Z)
- `src/workflow/team/__tests__/park-offer.test.ts` — **insrc-build** (2026-10-18T17:50:27.773Z)
- `src/workflow/team/__tests__/snapshot-upstream.test.ts` — **insrc-build** (2026-10-18T17:50:27.773Z)
- `src/workflow/team/gate.ts` — **insrc-build** (2026-10-18T17:50:27.773Z)
- `src/workflow/team/handoff.ts` — **insrc-build** (2026-10-18T17:50:27.773Z)
- `src/workflow/team/run-meta.ts` — **insrc-build** (2026-10-18T17:50:27.773Z)
