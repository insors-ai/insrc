<!-- insrc:artifact BUILD-315d510cb28100e2-s5 -->

# Build (plan-driven) — Story s5

**Standalone:** no  ·  **Created:** 2026-10-18T14:16:36.004Z  ·  **Updated:** 2026-10-18T14:44:01.249Z

**Commit:** 0fac73a9

## Summary

Addressed the three findings. (1) taskIdsOf in approval-gate.ts no longer fails open: a plan file that is missing means no Tasks, but one that exists and cannot be read or has a malformed task list returns an error, and where claims are enforced (or the policy is unreadable) the BUILD is refused with that reason instead of being authorized against the Story alone; with no policy nothing changes. Test: an unreadable plan gives a skipped[] entry 'plan of Story s1 cannot be read' and no BUILD record. (2) The integration test now proves the order: a PLAN with an unresolved HIGH review and a stage held by bob gives TeamGateRefusedError (not ReviewBlockedError), and the same plan for the holder then meets ReviewBlockedError. (3) The terminal test now also exercises workflow resolve: the resolve case in command.ts prints '✗ not applied — <reason>' for a TeamGateRefusedError (the guard inside resolveReviewFinding itself is t6), and accept still prints its normal line. command.test.ts passes.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✗ `t5`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/AMD-315d510cb28100e2-12.json` — **insrc-build** (2026-10-18T14:44:01.249Z)
- `.insrc/artifacts/PLAN-315d510cb28100e2-s5.json` — **insrc-build** (2026-10-18T14:44:01.249Z)
- `docs/epics/team-signoff-claim-based-workflow-E20261016315d510c/S005/PLAN.md` — **insrc-build** (2026-10-18T14:44:01.249Z)
- `src/cli/__tests__/gate-refusal-output.test.ts` — **insrc-build** (2026-10-18T14:44:01.249Z)
- `src/cli/command.ts` — **insrc-build** (2026-10-18T14:44:01.249Z)
- `src/workflow/__tests__/gate-approve.test.ts` — **insrc-build** (2026-10-18T14:44:01.249Z)
- `src/workflow/gates.ts` — **insrc-build** (2026-10-18T14:44:01.249Z)
- `src/workflow/team/__tests__/gate.test.ts` — **insrc-build** (2026-10-18T14:44:01.249Z)
- `src/workflow/team/__tests__/review-fix-decision.test.ts` — **insrc-build** (2026-10-18T14:44:01.249Z)
- `src/workflow/team/approval-gate.ts` — **insrc-build** (2026-10-18T14:44:01.249Z)
- `src/workflow/team/gate.ts` — **insrc-build** (2026-10-18T14:44:01.249Z)
- `src/workflow/tracker/__tests__/github-adapter.test.ts` — **insrc-build** (2026-10-18T14:44:01.249Z)
- `src/workflow/tracker/github-adapter.ts` — **insrc-build** (2026-10-18T14:44:01.249Z)
- `src/workflow/tracker/port.ts` — **insrc-build** (2026-10-18T14:44:01.249Z)
