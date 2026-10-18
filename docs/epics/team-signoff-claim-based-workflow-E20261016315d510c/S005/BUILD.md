<!-- insrc:artifact BUILD-315d510cb28100e2-s5 -->

# Build (plan-driven) — Story s5

**Standalone:** no  ·  **Created:** 2026-10-18T14:16:36.004Z  ·  **Updated:** 2026-10-18T14:57:12.036Z

**Commit:** 01766e6a

## Summary

New src/workflow/team/author-gate.ts: authorUnitOf(intent) maps a design.epic run to the Epic and a design.story or plan run to its Story from params.epicHash and params.storyId (define mints a fresh Epic, and build, tracker, brainstorm and stub runs have no stage unit, so they are unguarded), and assertMayAuthor(intent) asks teamGate with action author and throws TeamGateRefusedError unless the outcome is allowed or the no-issue first-author exception. It is called at the start of the workflow-step start, plan, step and synthesize phases (after the state is decoded, before the prompt is prepared, the executor runs or the draft is finalized) and in runWorkflowServerSide at its start and again right before the draft pair is written, so workflow.run's runStart sends an error frame naming the holder and never a done frame. handleWorkflowStep maps TeamGateRefusedError to the error code team-gate-refused with the reason. Analyze and code review get no call. The integration test gate-call-sites.test.ts covers: each phase refused with 'held by bob' and nothing written under the repo; the first author turn (no issue, no artifact) not blocked by the gate and blocked once the artifact exists; no policy: gate not consulted past the policy read; stub unguarded; runWorkflowServerSide refused with zero provider calls and no draft; runStart error frame without a done frame. The workflow-step, workflow-rpc, draft, mcp and team suites pass (285 tests).

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✗ `t5`
- ✓ `t6`
- ✗ `t7`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/AMD-315d510cb28100e2-12.json` — **insrc-build** (2026-10-18T14:57:12.036Z)
- `.insrc/artifacts/PLAN-315d510cb28100e2-s5.json` — **insrc-build** (2026-10-18T14:57:12.036Z)
- `docs/epics/team-signoff-claim-based-workflow-E20261016315d510c/S005/PLAN.md` — **insrc-build** (2026-10-18T14:57:12.036Z)
- `src/cli/__tests__/gate-refusal-output.test.ts` — **insrc-build** (2026-10-18T14:57:12.036Z)
- `src/cli/command.ts` — **insrc-build** (2026-10-18T14:57:12.036Z)
- `src/daemon/steps/review-step/__tests__/gate-review-fix.test.ts` — **insrc-build** (2026-10-18T14:57:12.036Z)
- `src/daemon/steps/review-step/phases/verdicts.ts` — **insrc-build** (2026-10-18T14:57:12.036Z)
- `src/daemon/steps/workflow-step/__tests__/gate-call-sites.test.ts` — **insrc-build** (2026-10-18T14:57:12.036Z)
- `src/daemon/steps/workflow-step/handler.ts` — **insrc-build** (2026-10-18T14:57:12.036Z)
- `src/daemon/steps/workflow-step/phases/plan.ts` — **insrc-build** (2026-10-18T14:57:12.036Z)
- `src/daemon/steps/workflow-step/phases/start.ts` — **insrc-build** (2026-10-18T14:57:12.036Z)
- `src/daemon/steps/workflow-step/phases/step.ts` — **insrc-build** (2026-10-18T14:57:12.036Z)
- `src/daemon/steps/workflow-step/phases/synthesize.ts` — **insrc-build** (2026-10-18T14:57:12.036Z)
- `src/daemon/workflow-rpc.ts` — **insrc-build** (2026-10-18T14:57:12.036Z)
- `src/workflow/__tests__/gate-approve.test.ts` — **insrc-build** (2026-10-18T14:57:12.036Z)
- `src/workflow/gates.ts` — **insrc-build** (2026-10-18T14:57:12.036Z)
- `src/workflow/review/__tests__/gate-resolve-finding.test.ts` — **insrc-build** (2026-10-18T14:57:12.036Z)
- `src/workflow/review/resolve.ts` — **insrc-build** (2026-10-18T14:57:12.036Z)
- `src/workflow/review/run-artifact.ts` — **insrc-build** (2026-10-18T14:57:12.036Z)
- `src/workflow/team/__tests__/gate.test.ts` — **insrc-build** (2026-10-18T14:57:12.036Z)
- `src/workflow/team/__tests__/review-fix-decision.test.ts` — **insrc-build** (2026-10-18T14:57:12.036Z)
- `src/workflow/team/approval-gate.ts` — **insrc-build** (2026-10-18T14:57:12.036Z)
- `src/workflow/team/author-gate.ts` — **insrc-build** (2026-10-18T14:57:12.036Z)
- `src/workflow/team/gate.ts` — **insrc-build** (2026-10-18T14:57:12.036Z)
- `src/workflow/tracker/__tests__/github-adapter.test.ts` — **insrc-build** (2026-10-18T14:57:12.036Z)
- `src/workflow/tracker/github-adapter.ts` — **insrc-build** (2026-10-18T14:57:12.036Z)
- `src/workflow/tracker/port.ts` — **insrc-build** (2026-10-18T14:57:12.036Z)
