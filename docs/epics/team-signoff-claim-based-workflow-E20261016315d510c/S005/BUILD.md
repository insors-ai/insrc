<!-- insrc:artifact BUILD-315d510cb28100e2-s5 -->

# Build (plan-driven) — Story s5

**Standalone:** no  ·  **Created:** 2026-10-18T14:16:36.004Z  ·  **Updated:** 2026-10-18T15:11:50.055Z

**Commit:** c9ac9ad4

## Summary

runTeam in src/cli/command.ts now handles `team claim|release <epicHash> [storyId [taskId]]`: parseClaimUnit accepts a 16-hex epic hash, then an optional story id (s<digits>) and optional task id (t<digits>, only with a story), lowercases them, and returns an epic/story/task unit; anything else (missing, malformed, extra args, task without story) returns the usage line, which now lists claim|release and still begins 'usage: team init'. The unit goes through the services layer: new svc.team.teamClaim / teamRelease in src/cli/services/team.ts (wired in services/index.ts) call the gate's claim / release for the selected repo and print '✓ claimed|released <unit> <hash>/<story>/<task>' or '✗ not claimed|released — <describeOutcome>' (so a held stage prints 'held by bob', a non-holder release prints the only-the-holder reason, a repo without claims says so). Help text has the new line; the test fakes in command.test.ts and tui.test.ts gained the two methods. The new test team-claim-release.test.ts drives the real services with injected gate dependencies and shows: epic, story and task units reach the gate resolved correctly; claim adds the actor through addAssignee only; a bob-held claim prints 'held by bob' and adds nothing; holder release clears, stranger release is refused with no clear, administrator release clears; a no-policy repo says it does not enforce claims; seven bad-argument forms print the usage line and ask the gate nothing. All 98 cli tests pass.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✗ `t5`
- ✓ `t6`
- ✓ `t7`
- ✓ `t8`
- ✓ `t9`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/AMD-315d510cb28100e2-12.json` — **insrc-build** (2026-10-18T15:11:50.055Z)
- `.insrc/artifacts/PLAN-315d510cb28100e2-s5.json` — **insrc-build** (2026-10-18T15:11:50.055Z)
- `docs/epics/team-signoff-claim-based-workflow-E20261016315d510c/S005/PLAN.md` — **insrc-build** (2026-10-18T15:11:50.055Z)
- `src/cli/__tests__/command.test.ts` — **insrc-build** (2026-10-18T15:11:50.055Z)
- `src/cli/__tests__/gate-refusal-output.test.ts` — **insrc-build** (2026-10-18T15:11:50.055Z)
- `src/cli/__tests__/team-claim-release.test.ts` — **insrc-build** (2026-10-18T15:11:50.055Z)
- `src/cli/__tests__/tui.test.ts` — **insrc-build** (2026-10-18T15:11:50.055Z)
- `src/cli/command.ts` — **insrc-build** (2026-10-18T15:11:50.055Z)
- `src/cli/services/index.ts` — **insrc-build** (2026-10-18T15:11:50.055Z)
- `src/cli/services/team.ts` — **insrc-build** (2026-10-18T15:11:50.055Z)
- `src/daemon/steps/build-step/__tests__/gate-call-sites.test.ts` — **insrc-build** (2026-10-18T15:11:50.055Z)
- `src/daemon/steps/build-step/handler.ts` — **insrc-build** (2026-10-18T15:11:50.055Z)
- `src/daemon/steps/build-step/phases/implement.ts` — **insrc-build** (2026-10-18T15:11:50.055Z)
- `src/daemon/steps/build-step/phases/validate.ts` — **insrc-build** (2026-10-18T15:11:50.055Z)
- `src/daemon/steps/review-step/__tests__/gate-review-fix.test.ts` — **insrc-build** (2026-10-18T15:11:50.055Z)
- `src/daemon/steps/review-step/phases/verdicts.ts` — **insrc-build** (2026-10-18T15:11:50.055Z)
- `src/daemon/steps/workflow-step/__tests__/gate-call-sites.test.ts` — **insrc-build** (2026-10-18T15:11:50.055Z)
- `src/daemon/steps/workflow-step/__tests__/plan-e2e.test.ts` — **insrc-build** (2026-10-18T15:11:50.055Z)
- `src/daemon/steps/workflow-step/handler.ts` — **insrc-build** (2026-10-18T15:11:50.055Z)
- `src/daemon/steps/workflow-step/phases/plan.ts` — **insrc-build** (2026-10-18T15:11:50.055Z)
- `src/daemon/steps/workflow-step/phases/start.ts` — **insrc-build** (2026-10-18T15:11:50.055Z)
- `src/daemon/steps/workflow-step/phases/step.ts` — **insrc-build** (2026-10-18T15:11:50.055Z)
- `src/daemon/steps/workflow-step/phases/synthesize.ts` — **insrc-build** (2026-10-18T15:11:50.055Z)
- `src/daemon/workflow-rpc.ts` — **insrc-build** (2026-10-18T15:11:50.055Z)
- `src/workflow/__tests__/gate-approve.test.ts` — **insrc-build** (2026-10-18T15:11:50.055Z)
- `src/workflow/gates.ts` — **insrc-build** (2026-10-18T15:11:50.055Z)
- `src/workflow/review/__tests__/gate-resolve-finding.test.ts` — **insrc-build** (2026-10-18T15:11:50.055Z)
- `src/workflow/review/resolve.ts` — **insrc-build** (2026-10-18T15:11:50.055Z)
- `src/workflow/review/run-artifact.ts` — **insrc-build** (2026-10-18T15:11:50.055Z)
- `src/workflow/team/__tests__/gate.test.ts` — **insrc-build** (2026-10-18T15:11:50.055Z)
- `src/workflow/team/__tests__/review-fix-decision.test.ts` — **insrc-build** (2026-10-18T15:11:50.055Z)
- `src/workflow/team/approval-gate.ts` — **insrc-build** (2026-10-18T15:11:50.055Z)
- `src/workflow/team/author-gate.ts` — **insrc-build** (2026-10-18T15:11:50.055Z)
- `src/workflow/team/gate.ts` — **insrc-build** (2026-10-18T15:11:50.055Z)
- `src/workflow/tracker/__tests__/github-adapter.test.ts` — **insrc-build** (2026-10-18T15:11:50.055Z)
- `src/workflow/tracker/github-adapter.ts` — **insrc-build** (2026-10-18T15:11:50.055Z)
- `src/workflow/tracker/port.ts` — **insrc-build** (2026-10-18T15:11:50.055Z)
