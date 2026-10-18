<!-- insrc:artifact BUILD-315d510cb28100e2-s5 -->

# Build (plan-driven) — Story s5

**Standalone:** no  ·  **Created:** 2026-10-18T14:16:36.004Z  ·  **Updated:** 2026-10-18T15:14:28.687Z

**Commit:** 6d34aade

## Summary

Added src/workflow/__tests__/gate-guarded-entry-points.test.ts: a table of 15 guarded entry points (handleStart/Plan/Step/Synthesize, runWorkflowServerSide, runStart, handleImplement, handleStandaloneImplement, handleValidate, handleStandaloneValidate, approveArtifactByJsonPath, approveWorkflowTarget, resolveReviewFinding, the daemon review's handleVerdicts and reviewArtifactFile), each with the gate call it must make and a minimum count (synthesize and the workflow driver need two: the recheck before writing). The test reads each function with the TypeScript AST and counts call expressions inside its body (nested closures included, which covers approveWorkflowTarget's refuseBeforeRecord), so deleting a call fails it; I confirmed that by removing the synthesize recheck, which failed with 'must call assertMayAuthor at least 2 time(s); it calls it 1', then restored the file. It also checks that any file in the workflow-step and build-step phases dirs that calls a gate function is listed, and that analyze-step, code-review-step, analyze-oneshot, analyze-rpc and code-review-rpc neither import the team gate modules nor call a gate function and are not on the inventory. Added a test with the exact title 'the terminal approve and resolve commands print the refusal naming the holder, formatted beside the review-block message' to gate-refusal-output.test.ts: approve, resolve, and (via the real team services with injected gate deps) claim and release print cross-prefixed lines naming the holder, beside the review-block line.

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
- ✓ `t10`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/AMD-315d510cb28100e2-12.json` — **insrc-build** (2026-10-18T15:14:28.687Z)
- `.insrc/artifacts/PLAN-315d510cb28100e2-s5.json` — **insrc-build** (2026-10-18T15:14:28.687Z)
- `docs/epics/team-signoff-claim-based-workflow-E20261016315d510c/S005/PLAN.md` — **insrc-build** (2026-10-18T15:14:28.687Z)
- `src/cli/__tests__/command.test.ts` — **insrc-build** (2026-10-18T15:14:28.687Z)
- `src/cli/__tests__/gate-refusal-output.test.ts` — **insrc-build** (2026-10-18T15:14:28.687Z)
- `src/cli/__tests__/team-claim-release.test.ts` — **insrc-build** (2026-10-18T15:14:28.687Z)
- `src/cli/__tests__/tui.test.ts` — **insrc-build** (2026-10-18T15:14:28.687Z)
- `src/cli/command.ts` — **insrc-build** (2026-10-18T15:14:28.687Z)
- `src/cli/services/index.ts` — **insrc-build** (2026-10-18T15:14:28.687Z)
- `src/cli/services/team.ts` — **insrc-build** (2026-10-18T15:14:28.687Z)
- `src/daemon/steps/build-step/__tests__/gate-call-sites.test.ts` — **insrc-build** (2026-10-18T15:14:28.687Z)
- `src/daemon/steps/build-step/handler.ts` — **insrc-build** (2026-10-18T15:14:28.687Z)
- `src/daemon/steps/build-step/phases/implement.ts` — **insrc-build** (2026-10-18T15:14:28.687Z)
- `src/daemon/steps/build-step/phases/validate.ts` — **insrc-build** (2026-10-18T15:14:28.687Z)
- `src/daemon/steps/review-step/__tests__/gate-review-fix.test.ts` — **insrc-build** (2026-10-18T15:14:28.687Z)
- `src/daemon/steps/review-step/phases/verdicts.ts` — **insrc-build** (2026-10-18T15:14:28.687Z)
- `src/daemon/steps/workflow-step/__tests__/gate-call-sites.test.ts` — **insrc-build** (2026-10-18T15:14:28.687Z)
- `src/daemon/steps/workflow-step/__tests__/plan-e2e.test.ts` — **insrc-build** (2026-10-18T15:14:28.687Z)
- `src/daemon/steps/workflow-step/handler.ts` — **insrc-build** (2026-10-18T15:14:28.687Z)
- `src/daemon/steps/workflow-step/phases/plan.ts` — **insrc-build** (2026-10-18T15:14:28.687Z)
- `src/daemon/steps/workflow-step/phases/start.ts` — **insrc-build** (2026-10-18T15:14:28.687Z)
- `src/daemon/steps/workflow-step/phases/step.ts` — **insrc-build** (2026-10-18T15:14:28.687Z)
- `src/daemon/steps/workflow-step/phases/synthesize.ts` — **insrc-build** (2026-10-18T15:14:28.687Z)
- `src/daemon/workflow-rpc.ts` — **insrc-build** (2026-10-18T15:14:28.687Z)
- `src/workflow/__tests__/gate-approve.test.ts` — **insrc-build** (2026-10-18T15:14:28.687Z)
- `src/workflow/__tests__/gate-guarded-entry-points.test.ts` — **insrc-build** (2026-10-18T15:14:28.687Z)
- `src/workflow/gates.ts` — **insrc-build** (2026-10-18T15:14:28.687Z)
- `src/workflow/review/__tests__/gate-resolve-finding.test.ts` — **insrc-build** (2026-10-18T15:14:28.687Z)
- `src/workflow/review/resolve.ts` — **insrc-build** (2026-10-18T15:14:28.687Z)
- `src/workflow/review/run-artifact.ts` — **insrc-build** (2026-10-18T15:14:28.687Z)
- `src/workflow/team/__tests__/gate.test.ts` — **insrc-build** (2026-10-18T15:14:28.687Z)
- `src/workflow/team/__tests__/review-fix-decision.test.ts` — **insrc-build** (2026-10-18T15:14:28.687Z)
- `src/workflow/team/approval-gate.ts` — **insrc-build** (2026-10-18T15:14:28.687Z)
- `src/workflow/team/author-gate.ts` — **insrc-build** (2026-10-18T15:14:28.687Z)
- `src/workflow/team/gate.ts` — **insrc-build** (2026-10-18T15:14:28.687Z)
- `src/workflow/tracker/__tests__/github-adapter.test.ts` — **insrc-build** (2026-10-18T15:14:28.687Z)
- `src/workflow/tracker/github-adapter.ts` — **insrc-build** (2026-10-18T15:14:28.687Z)
- `src/workflow/tracker/port.ts` — **insrc-build** (2026-10-18T15:14:28.687Z)
