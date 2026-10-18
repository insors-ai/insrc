<!-- insrc:artifact BUILD-315d510cb28100e2-s5 -->

# Build (plan-driven) — Story s5

**Standalone:** no  ·  **Created:** 2026-10-18T14:16:36.004Z  ·  **Updated:** 2026-10-18T15:08:22.267Z

**Commit:** 847e35d8

## Summary

Added assertMayBuild(repoPath, {epicHash, storyId, taskId?}) to src/workflow/team/author-gate.ts: it asks teamGate with action 'build' for the Task unit (or the Story unit when no taskId, i.e. standalone) and throws TeamGateRefusedError for anything other than 'allowed'. It is called in build-step implement right after resolveTaskRef and before admission/stamp, in the standalone implement after identity is derived and before admission, the build-start stamp and the Trivial record write, and in validate (planned and standalone) before any mapping, check, judge session or record. build-step/handler.ts maps TeamGateRefusedError to error code team-gate-refused with the reason. The new test gate-call-sites.test.ts seeds a real epic/plan, shows implement and validate (planned, plus standalone trivial) on a Task held by bob return team-gate-refused naming bob, with zero checks run, zero judge sessions, and an unchanged git working tree; the holder alice gets through to 'implement'. A second test shows a repo with policy 'none' builds as before with zero tracker loads and reads. Whole build-step suite: 130 pass.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✗ `t5`
- ✓ `t6`
- ✓ `t7`
- ✓ `t8`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/AMD-315d510cb28100e2-12.json` — **insrc-build** (2026-10-18T15:08:22.267Z)
- `.insrc/artifacts/PLAN-315d510cb28100e2-s5.json` — **insrc-build** (2026-10-18T15:08:22.267Z)
- `docs/epics/team-signoff-claim-based-workflow-E20261016315d510c/S005/PLAN.md` — **insrc-build** (2026-10-18T15:08:22.267Z)
- `src/cli/__tests__/gate-refusal-output.test.ts` — **insrc-build** (2026-10-18T15:08:22.267Z)
- `src/cli/command.ts` — **insrc-build** (2026-10-18T15:08:22.267Z)
- `src/daemon/steps/build-step/__tests__/gate-call-sites.test.ts` — **insrc-build** (2026-10-18T15:08:22.267Z)
- `src/daemon/steps/build-step/handler.ts` — **insrc-build** (2026-10-18T15:08:22.267Z)
- `src/daemon/steps/build-step/phases/implement.ts` — **insrc-build** (2026-10-18T15:08:22.267Z)
- `src/daemon/steps/build-step/phases/validate.ts` — **insrc-build** (2026-10-18T15:08:22.267Z)
- `src/daemon/steps/review-step/__tests__/gate-review-fix.test.ts` — **insrc-build** (2026-10-18T15:08:22.267Z)
- `src/daemon/steps/review-step/phases/verdicts.ts` — **insrc-build** (2026-10-18T15:08:22.267Z)
- `src/daemon/steps/workflow-step/__tests__/gate-call-sites.test.ts` — **insrc-build** (2026-10-18T15:08:22.267Z)
- `src/daemon/steps/workflow-step/__tests__/plan-e2e.test.ts` — **insrc-build** (2026-10-18T15:08:22.267Z)
- `src/daemon/steps/workflow-step/handler.ts` — **insrc-build** (2026-10-18T15:08:22.267Z)
- `src/daemon/steps/workflow-step/phases/plan.ts` — **insrc-build** (2026-10-18T15:08:22.267Z)
- `src/daemon/steps/workflow-step/phases/start.ts` — **insrc-build** (2026-10-18T15:08:22.267Z)
- `src/daemon/steps/workflow-step/phases/step.ts` — **insrc-build** (2026-10-18T15:08:22.267Z)
- `src/daemon/steps/workflow-step/phases/synthesize.ts` — **insrc-build** (2026-10-18T15:08:22.267Z)
- `src/daemon/workflow-rpc.ts` — **insrc-build** (2026-10-18T15:08:22.267Z)
- `src/workflow/__tests__/gate-approve.test.ts` — **insrc-build** (2026-10-18T15:08:22.267Z)
- `src/workflow/gates.ts` — **insrc-build** (2026-10-18T15:08:22.267Z)
- `src/workflow/review/__tests__/gate-resolve-finding.test.ts` — **insrc-build** (2026-10-18T15:08:22.267Z)
- `src/workflow/review/resolve.ts` — **insrc-build** (2026-10-18T15:08:22.267Z)
- `src/workflow/review/run-artifact.ts` — **insrc-build** (2026-10-18T15:08:22.267Z)
- `src/workflow/team/__tests__/gate.test.ts` — **insrc-build** (2026-10-18T15:08:22.267Z)
- `src/workflow/team/__tests__/review-fix-decision.test.ts` — **insrc-build** (2026-10-18T15:08:22.267Z)
- `src/workflow/team/approval-gate.ts` — **insrc-build** (2026-10-18T15:08:22.267Z)
- `src/workflow/team/author-gate.ts` — **insrc-build** (2026-10-18T15:08:22.267Z)
- `src/workflow/team/gate.ts` — **insrc-build** (2026-10-18T15:08:22.267Z)
- `src/workflow/tracker/__tests__/github-adapter.test.ts` — **insrc-build** (2026-10-18T15:08:22.267Z)
- `src/workflow/tracker/github-adapter.ts` — **insrc-build** (2026-10-18T15:08:22.267Z)
- `src/workflow/tracker/port.ts` — **insrc-build** (2026-10-18T15:08:22.267Z)
