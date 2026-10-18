<!-- insrc:artifact BUILD-315d510cb28100e2-s5 -->

# Build (plan-driven) — Story s5

**Standalone:** no  ·  **Created:** 2026-10-18T14:16:36.004Z  ·  **Updated:** 2026-10-18T15:00:11.605Z

**Commit:** c8b901a0

## Summary

Fixed the bypass: handleStart now calls assertMayAuthor right after the params are augmented and BEFORE preflightUpstreamQuestions, built from the workflow, repo path and params (not the later intent), so a held stage is refused naming the holder instead of being answered with questions. Test changes: a second test in gate-call-sites.test.ts seeds an HLD with an open question and shows the holder's start still returns resolve_questions while a start for a stage held by bob returns team-gate-refused; the first-author and no-policy starts now assert next === 'emit_plan' (not merely 'not the gate error'); and the refused start asserts the workflow state store holds only the three states the test itself saved (the refused start saved none). The named test title is unchanged (the new test is an extra case in the same file); the workflow-step suite passes.

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

- `.insrc/artifacts/AMD-315d510cb28100e2-12.json` — **insrc-build** (2026-10-18T15:00:11.605Z)
- `.insrc/artifacts/PLAN-315d510cb28100e2-s5.json` — **insrc-build** (2026-10-18T15:00:11.605Z)
- `docs/epics/team-signoff-claim-based-workflow-E20261016315d510c/S005/PLAN.md` — **insrc-build** (2026-10-18T15:00:11.605Z)
- `src/cli/__tests__/gate-refusal-output.test.ts` — **insrc-build** (2026-10-18T15:00:11.605Z)
- `src/cli/command.ts` — **insrc-build** (2026-10-18T15:00:11.605Z)
- `src/daemon/steps/review-step/__tests__/gate-review-fix.test.ts` — **insrc-build** (2026-10-18T15:00:11.605Z)
- `src/daemon/steps/review-step/phases/verdicts.ts` — **insrc-build** (2026-10-18T15:00:11.605Z)
- `src/daemon/steps/workflow-step/__tests__/gate-call-sites.test.ts` — **insrc-build** (2026-10-18T15:00:11.605Z)
- `src/daemon/steps/workflow-step/handler.ts` — **insrc-build** (2026-10-18T15:00:11.605Z)
- `src/daemon/steps/workflow-step/phases/plan.ts` — **insrc-build** (2026-10-18T15:00:11.605Z)
- `src/daemon/steps/workflow-step/phases/start.ts` — **insrc-build** (2026-10-18T15:00:11.605Z)
- `src/daemon/steps/workflow-step/phases/step.ts` — **insrc-build** (2026-10-18T15:00:11.605Z)
- `src/daemon/steps/workflow-step/phases/synthesize.ts` — **insrc-build** (2026-10-18T15:00:11.605Z)
- `src/daemon/workflow-rpc.ts` — **insrc-build** (2026-10-18T15:00:11.605Z)
- `src/workflow/__tests__/gate-approve.test.ts` — **insrc-build** (2026-10-18T15:00:11.605Z)
- `src/workflow/gates.ts` — **insrc-build** (2026-10-18T15:00:11.605Z)
- `src/workflow/review/__tests__/gate-resolve-finding.test.ts` — **insrc-build** (2026-10-18T15:00:11.605Z)
- `src/workflow/review/resolve.ts` — **insrc-build** (2026-10-18T15:00:11.605Z)
- `src/workflow/review/run-artifact.ts` — **insrc-build** (2026-10-18T15:00:11.605Z)
- `src/workflow/team/__tests__/gate.test.ts` — **insrc-build** (2026-10-18T15:00:11.605Z)
- `src/workflow/team/__tests__/review-fix-decision.test.ts` — **insrc-build** (2026-10-18T15:00:11.605Z)
- `src/workflow/team/approval-gate.ts` — **insrc-build** (2026-10-18T15:00:11.605Z)
- `src/workflow/team/author-gate.ts` — **insrc-build** (2026-10-18T15:00:11.605Z)
- `src/workflow/team/gate.ts` — **insrc-build** (2026-10-18T15:00:11.605Z)
- `src/workflow/tracker/__tests__/github-adapter.test.ts` — **insrc-build** (2026-10-18T15:00:11.605Z)
- `src/workflow/tracker/github-adapter.ts` — **insrc-build** (2026-10-18T15:00:11.605Z)
- `src/workflow/tracker/port.ts` — **insrc-build** (2026-10-18T15:00:11.605Z)
