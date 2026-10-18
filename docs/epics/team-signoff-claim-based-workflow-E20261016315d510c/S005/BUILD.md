<!-- insrc:artifact BUILD-315d510cb28100e2-s5 -->

# Build (plan-driven) — Story s5

**Standalone:** no  ·  **Created:** 2026-10-18T14:16:36.004Z  ·  **Updated:** 2026-10-18T14:27:16.123Z

**Commit:** 6b6b6657

## Summary

Added src/workflow/team/gate.ts: GuardedAction, GateOutcome, ClaimState, TeamGateRefusedError (with describeOutcome), a test seam _setGateDepsForTests, and teamGate(repo, unit, action). teamGate reads the policy (an unreadable policy refuses; none, teamMode false or claimsEnforced false is allowed with no tracker call, as is an unknown action); otherwise it resolves the unit's issue locally, loads the tracker with the claim capability, makes its own whoAmI call, reads the assignee live, and decides: the assignee is the holder (case-insensitive), another holder gives held-by-other naming them, several assignees and every port failure give refused with the reason, and an unassigned stage is allowed (author and build take the implicit claim through addAssignee and return implicitClaim true; a failed or contested add refuses and removes nobody; approve-local and review-fix, the action used when a finding is applied, take no claim). Non-allowed outcomes are logged with unit, action and reason; the whole function is wrapped so it never throws. A stage with no issue returns refused here; the no-issue outcome and the first-author exception are t3. Four unit tests in gate.test.ts cover the acceptance checks against a fake port.

## Tasks validated

- ✓ `t1`
- ✗ `t2`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/AMD-315d510cb28100e2-12.json` — **insrc-build** (2026-10-18T14:27:16.123Z)
- `.insrc/artifacts/PLAN-315d510cb28100e2-s5.json` — **insrc-build** (2026-10-18T14:27:16.123Z)
- `docs/epics/team-signoff-claim-based-workflow-E20261016315d510c/S005/PLAN.md` — **insrc-build** (2026-10-18T14:27:16.123Z)
- `src/workflow/team/__tests__/gate.test.ts` — **insrc-build** (2026-10-18T14:27:16.123Z)
- `src/workflow/team/gate.ts` — **insrc-build** (2026-10-18T14:27:16.123Z)
- `src/workflow/tracker/__tests__/github-adapter.test.ts` — **insrc-build** (2026-10-18T14:27:16.123Z)
- `src/workflow/tracker/github-adapter.ts` — **insrc-build** (2026-10-18T14:27:16.123Z)
- `src/workflow/tracker/port.ts` — **insrc-build** (2026-10-18T14:27:16.123Z)
