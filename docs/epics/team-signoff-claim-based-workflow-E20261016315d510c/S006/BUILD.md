<!-- insrc:artifact BUILD-315d510cb28100e2-s6 -->

# Build (plan-driven) — Story s6

**Standalone:** no  ·  **Created:** 2026-10-18T17:06:54.425Z  ·  **Updated:** 2026-10-18T18:16:04.606Z

**Commit:** 973b836f

## Summary

handoff.ts gains verifyReceivingRepo(path, repositoryId?, deps) and resumeCheck(repo, unit, { workflow? }, deps) with the types StageWorkflow, ResumePlan, ResumeCheck (resume | restart | nothing-to-resume | refused) and ResumeDeps (adds a listRepos seam to ParkDeps; the real registry, db/repos listRepos, is imported lazily). verifyReceivingRepo: the path must equal (resolved) a registered repo, else 'is not a repository registered with the daemon'; when an id is given the repo's first commit (rev-list --max-parents=0 HEAD) must equal it, else 'is a different repository ...'. resumeCheck, in order, with no working file written: Task refused; registration; the repo must enforce claims; the stage (the given workflow, which must be design.epic/design.story/plan, fit the unit, and for plan need a committed LLD, or the stage inferred from artifacts committed at HEAD) and 'nothing-to-resume' when that stage is already committed; the author gate with the workflow (throws TeamGateRefusedError when someone else holds the unit; it claims an unassigned one, as the start phase does); the handoff branch name; no remote or no branch on the remote gives restart (told apart from a failure: a failed ls-remote is refused with git's message); the branch is fetched by URL with --no-write-fetch-head into a temporary ref (no remote-tracking ref or FETCH_HEAD is created), the checkpoint is read and validated (invalid JSON, no checkpoint file, unknown schema, other unit, outside path each refused with the specific reason), the repository identity is compared, a run checkpoint's stage must be the next stage, the whole upstream snapshot is compared with snapshotUpstream now (any difference, including revision 0 on one side, the effective HLD with approved amendments, or the Define, is refused naming each artifact as parked/now), any parked file with local changes is refused naming the file, and the parked file contents are read from the branch into the plan; the temporary ref is always dropped. A run checkpoint gives 'resume' with the plan; a draft-only one gives 'restart' with the files to restore. Tests use a real bare origin, a parker repo that really parks with parkDraft, and a second clone: the baseline resume plan with no ref, FETCH_HEAD or file left; unregistered and registry-down refusals before any fetch; a different repository that can fetch the same branch refused with nothing left behind; moved Define (3 to 4, and to 0), a pending amendment changing nothing and an approved one refusing; missing branch giving restart; a dead remote refused with git's message; LLD committed gives plan, both committed gives nothing-to-resume, explicit workflow cases; five bad checkpoints pushed by a helper clone; a dirty target file; a draft-only checkpoint's restart with its files; a holder gate refusal and a no-claims repo. Team suite passes; tsc clean.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`
- ✗ `t8`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `docs/plans/s6-open-issues.md` — **insrc-build** (2026-10-18T18:16:04.606Z)
- `src/cli/__tests__/settings-modal.test.ts` — **insrc-build** (2026-10-18T18:16:04.606Z)
- `src/cli/services/index.ts` — **insrc-build** (2026-10-18T18:16:04.606Z)
- `src/config/__tests__/fixtures/repo-fields-catalog.json` — **insrc-build** (2026-10-18T18:16:04.606Z)
- `src/config/__tests__/repo-fields.test.ts` — **insrc-build** (2026-10-18T18:16:04.606Z)
- `src/config/repo-fields.ts` — **insrc-build** (2026-10-18T18:16:04.606Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-18T18:16:04.606Z)
- `src/daemon/steps/host.ts` — **insrc-build** (2026-10-18T18:16:04.606Z)
- `src/daemon/steps/workflow-step/__tests__/handoff-ownership.test.ts` — **insrc-build** (2026-10-18T18:16:04.606Z)
- `src/daemon/steps/workflow-step/__tests__/state-store-meta.test.ts` — **insrc-build** (2026-10-18T18:16:04.606Z)
- `src/daemon/steps/workflow-step/park-offer.ts` — **insrc-build** (2026-10-18T18:16:04.606Z)
- `src/daemon/steps/workflow-step/phases/start.ts` — **insrc-build** (2026-10-18T18:16:04.606Z)
- `src/daemon/steps/workflow-step/state-store.ts` — **insrc-build** (2026-10-18T18:16:04.606Z)
- `src/daemon/steps/workflow-step/state.ts` — **insrc-build** (2026-10-18T18:16:04.606Z)
- `src/workflow/config/github.ts` — **insrc-build** (2026-10-18T18:16:04.606Z)
- `src/workflow/team/__tests__/handoff-park-plan.test.ts` — **insrc-build** (2026-10-18T18:16:04.606Z)
- `src/workflow/team/__tests__/handoff-park.test.ts` — **insrc-build** (2026-10-18T18:16:04.606Z)
- `src/workflow/team/__tests__/handoff-pure.test.ts` — **insrc-build** (2026-10-18T18:16:04.606Z)
- `src/workflow/team/__tests__/handoff-resume-check.test.ts` — **insrc-build** (2026-10-18T18:16:04.606Z)
- `src/workflow/team/__tests__/park-offer.test.ts` — **insrc-build** (2026-10-18T18:16:04.606Z)
- `src/workflow/team/__tests__/snapshot-upstream.test.ts` — **insrc-build** (2026-10-18T18:16:04.606Z)
- `src/workflow/team/gate.ts` — **insrc-build** (2026-10-18T18:16:04.606Z)
- `src/workflow/team/handoff.ts` — **insrc-build** (2026-10-18T18:16:04.606Z)
- `src/workflow/team/run-meta.ts` — **insrc-build** (2026-10-18T18:16:04.606Z)
