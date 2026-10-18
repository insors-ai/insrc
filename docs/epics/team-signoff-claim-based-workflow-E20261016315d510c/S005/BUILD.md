<!-- insrc:artifact BUILD-315d510cb28100e2-s5 -->

# Build (plan-driven) — Story s5

**Standalone:** no  ·  **Created:** 2026-10-18T14:16:36.004Z  ·  **Updated:** 2026-10-18T14:42:11.194Z

**Commit:** eeaada81

## Summary

New src/workflow/team/approval-gate.ts: authorizeApproval(jsonPath) maps an artifact to its stage unit (Define and HLD to the Epic, LLD and plan to the Story, BUILD to the Story's Task units from its plan, or the Story when it has none or is standalone), asks teamGate for approve-local, and returns the first refusal with a subject such as 'task t2'; non-claim artifacts are unguarded; a BUILD record that does not exist yet is identified from its file name; the repo is recovered from the artifact path when the meta lacks it; an artifact whose stage cannot be told is refused only in a repo that enforces claims (or whose policy cannot be read). gates.ts: approveArtifactByJsonPath calls it right after the meta check, before any review check or stamp, and throws TeamGateRefusedError; approveWorkflowTarget authorizes each BUILD target before ensureBuildRecordOnCompletion (single and batch) and puts a refused target in skipped[] with the reason, and a TeamGateRefusedError from approveOne is also mapped into skipped[]; signatures unchanged. TeamGateRefusedError takes an optional subject. command.ts: the approve case prints '✗ not approved — <reason>' beside the review-block message. gate-approve.test.ts (integration) and gate-refusal-output.test.ts (approve part; resolve, claim and release are added by t6 and t9) carry the tests; the full workflow and cli suites pass (2183 tests).

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✗ `t5`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/AMD-315d510cb28100e2-12.json` — **insrc-build** (2026-10-18T14:42:11.194Z)
- `.insrc/artifacts/PLAN-315d510cb28100e2-s5.json` — **insrc-build** (2026-10-18T14:42:11.194Z)
- `docs/epics/team-signoff-claim-based-workflow-E20261016315d510c/S005/PLAN.md` — **insrc-build** (2026-10-18T14:42:11.194Z)
- `src/cli/__tests__/gate-refusal-output.test.ts` — **insrc-build** (2026-10-18T14:42:11.194Z)
- `src/cli/command.ts` — **insrc-build** (2026-10-18T14:42:11.194Z)
- `src/workflow/__tests__/gate-approve.test.ts` — **insrc-build** (2026-10-18T14:42:11.194Z)
- `src/workflow/gates.ts` — **insrc-build** (2026-10-18T14:42:11.194Z)
- `src/workflow/team/__tests__/gate.test.ts` — **insrc-build** (2026-10-18T14:42:11.194Z)
- `src/workflow/team/__tests__/review-fix-decision.test.ts` — **insrc-build** (2026-10-18T14:42:11.194Z)
- `src/workflow/team/approval-gate.ts` — **insrc-build** (2026-10-18T14:42:11.194Z)
- `src/workflow/team/gate.ts` — **insrc-build** (2026-10-18T14:42:11.194Z)
- `src/workflow/tracker/__tests__/github-adapter.test.ts` — **insrc-build** (2026-10-18T14:42:11.194Z)
- `src/workflow/tracker/github-adapter.ts` — **insrc-build** (2026-10-18T14:42:11.194Z)
- `src/workflow/tracker/port.ts` — **insrc-build** (2026-10-18T14:42:11.194Z)
