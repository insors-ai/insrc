<!-- insrc:artifact BUILD-315d510cb28100e2-s5 -->

# Build (plan-driven) — Story s5

**Standalone:** no  ·  **Created:** 2026-10-18T14:16:36.004Z  ·  **Updated:** 2026-10-18T14:34:47.859Z

**Commit:** 202cc695

## Summary

gate.ts gains claim, release, reviewFixDecision and ReviewFixMode. claim reads the holder, refuses another holder naming them, takes an unassigned stage only through addAssignee (never setAssignee), and refuses a failed add (state unknown) or a result with more than one assignee as contested, removing nobody; contention is reported when observed. release consults the hook once (a hook-originated call skips it), lets the holder or a policy administrator clear the stage through setAssignee(null) (an administrator needs no read, so a contested multi-assignee stage can be cleared), refuses anyone else naming the holder with no write, treats an unassigned stage as nothing to release, and reports a failed clear as state unknown. reviewFixDecision returns apply-auto-fixes when the gate allows review-fix and report-only otherwise (non-holder, failed read, thrown dependency); a review takes no claim. Tests: two in gate.test.ts (including the interleaving where the earlier claimant returned allowed and only the later one sees contention, and the earlier one finds out on its next gate read) and review-fix-decision.test.ts.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✗ `t4`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/AMD-315d510cb28100e2-12.json` — **insrc-build** (2026-10-18T14:34:47.859Z)
- `.insrc/artifacts/PLAN-315d510cb28100e2-s5.json` — **insrc-build** (2026-10-18T14:34:47.859Z)
- `docs/epics/team-signoff-claim-based-workflow-E20261016315d510c/S005/PLAN.md` — **insrc-build** (2026-10-18T14:34:47.859Z)
- `src/workflow/team/__tests__/gate.test.ts` — **insrc-build** (2026-10-18T14:34:47.859Z)
- `src/workflow/team/__tests__/review-fix-decision.test.ts` — **insrc-build** (2026-10-18T14:34:47.859Z)
- `src/workflow/team/gate.ts` — **insrc-build** (2026-10-18T14:34:47.859Z)
- `src/workflow/tracker/__tests__/github-adapter.test.ts` — **insrc-build** (2026-10-18T14:34:47.859Z)
- `src/workflow/tracker/github-adapter.ts` — **insrc-build** (2026-10-18T14:34:47.859Z)
- `src/workflow/tracker/port.ts` — **insrc-build** (2026-10-18T14:34:47.859Z)
