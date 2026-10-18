<!-- insrc:artifact BUILD-315d510cb28100e2-s5 -->

# Build (plan-driven) — Story s5

**Standalone:** no  ·  **Created:** 2026-10-18T14:16:36.004Z  ·  **Updated:** 2026-10-18T14:47:27.006Z

**Commit:** df93e3ac

## Summary

Fixed the standalone gap: authorizeApproval now decides standalone-ness the way ensureBuildRecordOnCompletion will, using inheritedStoryStandalone(repo, epicHash, storyId) (the epic definition head, then the Story's LLD) in addition to the record's own meta, so a BUILD that does not exist yet and is standalone is authorized against the Story unit, not the plan's Tasks. The integration test adds that case: a standalone LLD, a plan whose Task is mine and a Story held by bob; the target goes to skipped[] with 'held by bob', only the Story unit is read, and no BUILD record is created.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✗ `t5`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/AMD-315d510cb28100e2-12.json` — **insrc-build** (2026-10-18T14:47:27.006Z)
- `.insrc/artifacts/PLAN-315d510cb28100e2-s5.json` — **insrc-build** (2026-10-18T14:47:27.006Z)
- `docs/epics/team-signoff-claim-based-workflow-E20261016315d510c/S005/PLAN.md` — **insrc-build** (2026-10-18T14:47:27.006Z)
- `src/cli/__tests__/gate-refusal-output.test.ts` — **insrc-build** (2026-10-18T14:47:27.006Z)
- `src/cli/command.ts` — **insrc-build** (2026-10-18T14:47:27.006Z)
- `src/workflow/__tests__/gate-approve.test.ts` — **insrc-build** (2026-10-18T14:47:27.006Z)
- `src/workflow/gates.ts` — **insrc-build** (2026-10-18T14:47:27.006Z)
- `src/workflow/team/__tests__/gate.test.ts` — **insrc-build** (2026-10-18T14:47:27.006Z)
- `src/workflow/team/__tests__/review-fix-decision.test.ts` — **insrc-build** (2026-10-18T14:47:27.006Z)
- `src/workflow/team/approval-gate.ts` — **insrc-build** (2026-10-18T14:47:27.006Z)
- `src/workflow/team/gate.ts` — **insrc-build** (2026-10-18T14:47:27.006Z)
- `src/workflow/tracker/__tests__/github-adapter.test.ts` — **insrc-build** (2026-10-18T14:47:27.006Z)
- `src/workflow/tracker/github-adapter.ts` — **insrc-build** (2026-10-18T14:47:27.006Z)
- `src/workflow/tracker/port.ts` — **insrc-build** (2026-10-18T14:47:27.006Z)
