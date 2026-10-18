<!-- insrc:artifact BUILD-315d510cb28100e2-s5 -->

# Build (plan-driven) — Story s5

**Standalone:** no  ·  **Created:** 2026-10-18T14:16:36.004Z  ·  **Updated:** 2026-10-18T14:48:57.040Z

**Commit:** 68ff6426

## Summary

Fixed the missing-workflow bypass: authorizeApproval takes the workflow from meta.workflow, and for an artifact whose meta does not say reads it from the file-name prefix (DEF, HLD, LLD, PLAN), so a PLAN with no workflow in its meta is authorized like any plan; a test covers it (a nameless plan held by bob is refused and not stamped). On the scope remark: the optional subject parameter of TeamGateRefusedError and claimsEnforcedFor in gate.ts are s5's own file and are what this Task needs to name a Task in the refusal and to decide whether an unresolvable approval applies; no other Story's shared machinery was changed. gates.ts changes are the approval guard only. The earlier fixes stand.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✗ `t5`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/AMD-315d510cb28100e2-12.json` — **insrc-build** (2026-10-18T14:48:57.040Z)
- `.insrc/artifacts/PLAN-315d510cb28100e2-s5.json` — **insrc-build** (2026-10-18T14:48:57.040Z)
- `docs/epics/team-signoff-claim-based-workflow-E20261016315d510c/S005/PLAN.md` — **insrc-build** (2026-10-18T14:48:57.040Z)
- `src/cli/__tests__/gate-refusal-output.test.ts` — **insrc-build** (2026-10-18T14:48:57.040Z)
- `src/cli/command.ts` — **insrc-build** (2026-10-18T14:48:57.040Z)
- `src/workflow/__tests__/gate-approve.test.ts` — **insrc-build** (2026-10-18T14:48:57.040Z)
- `src/workflow/gates.ts` — **insrc-build** (2026-10-18T14:48:57.040Z)
- `src/workflow/team/__tests__/gate.test.ts` — **insrc-build** (2026-10-18T14:48:57.040Z)
- `src/workflow/team/__tests__/review-fix-decision.test.ts` — **insrc-build** (2026-10-18T14:48:57.040Z)
- `src/workflow/team/approval-gate.ts` — **insrc-build** (2026-10-18T14:48:57.040Z)
- `src/workflow/team/gate.ts` — **insrc-build** (2026-10-18T14:48:57.040Z)
- `src/workflow/tracker/__tests__/github-adapter.test.ts` — **insrc-build** (2026-10-18T14:48:57.040Z)
- `src/workflow/tracker/github-adapter.ts` — **insrc-build** (2026-10-18T14:48:57.040Z)
- `src/workflow/tracker/port.ts` — **insrc-build** (2026-10-18T14:48:57.040Z)
