<!-- insrc:artifact BUILD-315d510cb28100e2-s6 -->

# Build (plan-driven) — Story s6

**Standalone:** no  ·  **Created:** 2026-10-18T17:06:54.425Z  ·  **Updated:** 2026-10-18T18:03:23.785Z

**Commit:** 2a8d1d61

## Summary

handoff.ts gains ParkResult, checkpointPath(unit) ('.insrc/handoff/story-<hash>-<id>.json' or 'epic-<hash>.json'), executePark(plan, deps) and parkDraft(repo, unit, opts, deps) (= parkPlan then executePark), both async; git runs through a small async helper over runGitAsync (60 s deadline, GIT_TERMINAL_PROMPT=0) so a slow remote never blocks the daemon. executePark: finds the remote (pickRemote; none gives a clear refusal); ls-remote the deterministic branch, and when it exists fetches it and builds on its head, otherwise on the plan's sourceHead; makes a temporary worktree in deps.tmpRoot (system temp by default) on a unique local branch 'insrc-park-tmp-<rand>'; copies the plan's draft files from the working tree into it (a deleted draft is deleted there), writes the checkpoint JSON, stages them (-f for the checkpoint), commits (--allow-empty so a repeat park with no change still records itself) and pushes 'tmp:refs/heads/<branch>'; a push rejected as non-fast-forward is reported as 'someone else parked first', any other git failure as 'park failed at <step>: <git message>'; after the push it adds ONE note through port.issueOps.comment (marker '<!-- insrc:handoff -->', branch, commit, what was parked, the team resume command) and a failed note returns ok:true with noted:false and noteFailure, the push standing. In a finally it always removes the worktree, the temporary local branch and the temp directory (and prunes), so the user's checked-out branch, index and working tree are never touched (the handoff branch is not even created locally) and the run stays in the daemon's store. Tests (real repo plus a real bare origin): test 1 parks an owned awaiting_llm_step run with an uncommitted JSON and markdown draft and checks the remote branch ref equals the returned commit, the tree holds the checkpoint and both draft files with the right contents, the checkpoint validates and carries no parker path, exactly one note naming the branch and commit, and that HEAD, branch name, status, index (ls-files -s) and both draft files are byte-identical to before, no local handoff branch, no extra worktree, no temp branch, the temp directory empty, the run still stored; test 2 covers a pre-receive hook declining the push (reason names the step and the hook message, not 'someone else', full cleanup, checkout unchanged, run kept, no note), a failed note (ok, noted false, failure kind and reason, push stands, one note tried), a second park (new draft content) whose commit is the child of the first with exactly two park commits on the base and the new content on the branch, a lost race (another clone pushes between our fetch and our push via the beforePush seam) reported as 'someone else parked first' with the other commit intact, cleanup and no extra note, a following park built directly on the other owner's commit, and a repo with no remote refusing. Team suite 84 passes; tsc clean.

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

- `docs/plans/s6-open-issues.md` — **insrc-build** (2026-10-18T18:03:23.785Z)
- `src/cli/__tests__/settings-modal.test.ts` — **insrc-build** (2026-10-18T18:03:23.785Z)
- `src/cli/services/index.ts` — **insrc-build** (2026-10-18T18:03:23.785Z)
- `src/config/__tests__/fixtures/repo-fields-catalog.json` — **insrc-build** (2026-10-18T18:03:23.785Z)
- `src/config/__tests__/repo-fields.test.ts` — **insrc-build** (2026-10-18T18:03:23.785Z)
- `src/config/repo-fields.ts` — **insrc-build** (2026-10-18T18:03:23.785Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-18T18:03:23.785Z)
- `src/daemon/steps/host.ts` — **insrc-build** (2026-10-18T18:03:23.785Z)
- `src/daemon/steps/workflow-step/__tests__/handoff-ownership.test.ts` — **insrc-build** (2026-10-18T18:03:23.785Z)
- `src/daemon/steps/workflow-step/__tests__/state-store-meta.test.ts` — **insrc-build** (2026-10-18T18:03:23.785Z)
- `src/daemon/steps/workflow-step/park-offer.ts` — **insrc-build** (2026-10-18T18:03:23.785Z)
- `src/daemon/steps/workflow-step/phases/start.ts` — **insrc-build** (2026-10-18T18:03:23.785Z)
- `src/daemon/steps/workflow-step/state-store.ts` — **insrc-build** (2026-10-18T18:03:23.785Z)
- `src/daemon/steps/workflow-step/state.ts` — **insrc-build** (2026-10-18T18:03:23.785Z)
- `src/workflow/config/github.ts` — **insrc-build** (2026-10-18T18:03:23.785Z)
- `src/workflow/team/__tests__/handoff-park-plan.test.ts` — **insrc-build** (2026-10-18T18:03:23.785Z)
- `src/workflow/team/__tests__/handoff-park.test.ts` — **insrc-build** (2026-10-18T18:03:23.785Z)
- `src/workflow/team/__tests__/handoff-pure.test.ts` — **insrc-build** (2026-10-18T18:03:23.785Z)
- `src/workflow/team/__tests__/park-offer.test.ts` — **insrc-build** (2026-10-18T18:03:23.785Z)
- `src/workflow/team/__tests__/snapshot-upstream.test.ts` — **insrc-build** (2026-10-18T18:03:23.785Z)
- `src/workflow/team/gate.ts` — **insrc-build** (2026-10-18T18:03:23.785Z)
- `src/workflow/team/handoff.ts` — **insrc-build** (2026-10-18T18:03:23.785Z)
- `src/workflow/team/run-meta.ts` — **insrc-build** (2026-10-18T18:03:23.785Z)
