<!-- insrc:artifact BUILD-315d510cb28100e2-s4 -->

# Build (plan-driven) — Story s4

**Standalone:** no  ·  **Created:** 2026-10-18T05:01:29.552Z  ·  **Updated:** 2026-10-18T12:48:45.174Z

**Commit:** c96933e0

## Summary

The race test is now truly interleaved: daemon B's whole call (both lookups stale, so it creates, lists and breaks the tie) runs in the gap right after daemon A's create and before A's listing, through an afterCreate hook on the shared fake tracker. It asserts two creates, one open issue (the lowest, #1), #2 closed by B, and both Define records naming #1. On the pending amendment: AMD-315d510cb28100e2-10 is the user-gated sc1 proposal recorded in docs/plans/team-workflow.md; per the approved plan this task runs against a fake port until it is agreed, and the code reads findIssues through a local optional type so it is inert on today's real port.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✗ `t3`
- ✗ `t4`
- ✗ `t5`
- ✓ `t6`
- ✓ `t7`
- ✓ `t8`
- ✗ `t9`
- ✓ `t10`
- ✓ `t11`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/AMD-315d510cb28100e2-10.json` — **insrc-build** (2026-10-18T12:48:45.174Z)
- `.insrc/artifacts/AMD-315d510cb28100e2-9.json` — **insrc-build** (2026-10-18T12:48:45.174Z)
- `.insrc/artifacts/CR-315d510cb28100e2-s4.json` — **insrc-build** (2026-10-18T12:48:45.174Z)
- `.insrc/artifacts/PLAN-315d510cb28100e2-s4.json` — **insrc-build** (2026-10-18T12:48:45.174Z)
- `.insrc/build-start/315d510cb28100e2-s1.json` — **insrc-build** (2026-10-18T12:48:45.174Z)
- `.insrc/build-start/315d510cb28100e2-s2.json` — **insrc-build** (2026-10-18T12:48:45.174Z)
- `.insrc/build-start/315d510cb28100e2-s3.json` — **insrc-build** (2026-10-18T12:48:45.174Z)
- `docs/epics/team-signoff-claim-based-workflow-E20261016315d510c/S004/CR.md` — **insrc-build** (2026-10-18T12:48:45.174Z)
- `docs/epics/team-signoff-claim-based-workflow-E20261016315d510c/S004/PLAN.md` — **insrc-build** (2026-10-18T12:48:45.174Z)
- `docs/plans/team-workflow.md` — **insrc-build** (2026-10-18T12:48:45.174Z)
- `src/cli/__tests__/run-readiness-notice.test.ts` — **insrc-build** (2026-10-18T12:48:45.174Z)
- `src/cli/command.ts` — **insrc-build** (2026-10-18T12:48:45.174Z)
- `src/cli/services/workflow.ts` — **insrc-build** (2026-10-18T12:48:45.174Z)
- `src/daemon/__tests__/draft-issues-synthesize.test.ts` — **insrc-build** (2026-10-18T12:48:45.174Z)
- `src/daemon/steps/code-review-step/handler.ts` — **insrc-build** (2026-10-18T12:48:45.174Z)
- `src/daemon/steps/review-step/__tests__/verdicts-revision.test.ts` — **insrc-build** (2026-10-18T12:48:45.174Z)
- `src/daemon/steps/review-step/phases/findings.ts` — **insrc-build** (2026-10-18T12:48:45.174Z)
- `src/daemon/steps/review-step/phases/verdicts.ts` — **insrc-build** (2026-10-18T12:48:45.174Z)
- `src/daemon/steps/workflow-step/phases/synthesize.ts` — **insrc-build** (2026-10-18T12:48:45.174Z)
- `src/daemon/steps/workflow-step/types.ts` — **insrc-build** (2026-10-18T12:48:45.174Z)
- `src/daemon/workflow-rpc.ts` — **insrc-build** (2026-10-18T12:48:45.174Z)
- `src/mcp/daemon-stream.ts` — **insrc-build** (2026-10-18T12:48:45.174Z)
- `src/workflow/__tests__/approve-fallback-issues.test.ts` — **insrc-build** (2026-10-18T12:48:45.174Z)
- `src/workflow/__tests__/artifact-write-inventory.test.ts` — **insrc-build** (2026-10-18T12:48:45.174Z)
- `src/workflow/__tests__/artifact-writer.test.ts` — **insrc-build** (2026-10-18T12:48:45.174Z)
- `src/workflow/__tests__/draft-issues.test.ts` — **insrc-build** (2026-10-18T12:48:45.174Z)
- `src/workflow/__tests__/draft-write-revision.test.ts` — **insrc-build** (2026-10-18T12:48:45.174Z)
- `src/workflow/__tests__/gates-revision.test.ts` — **insrc-build** (2026-10-18T12:48:45.174Z)
- `src/workflow/__tests__/meta-only-body-unchanged.test.ts` — **insrc-build** (2026-10-18T12:48:45.174Z)
- `src/workflow/__tests__/redraft-preserves-tracker.test.ts` — **insrc-build** (2026-10-18T12:48:45.174Z)
- `src/workflow/artifact-write-inventory.ts` — **insrc-build** (2026-10-18T12:48:45.174Z)
- `src/workflow/artifacts/provenance/writer.ts` — **insrc-build** (2026-10-18T12:48:45.174Z)
- `src/workflow/bugfix/stamp.ts` — **insrc-build** (2026-10-18T12:48:45.174Z)
- `src/workflow/code-review/__tests__/record-revision.test.ts` — **insrc-build** (2026-10-18T12:48:45.174Z)
- `src/workflow/code-review/runner.ts` — **insrc-build** (2026-10-18T12:48:45.174Z)
- `src/workflow/draft-issues.ts` — **insrc-build** (2026-10-18T12:48:45.174Z)
- `src/workflow/gates.ts` — **insrc-build** (2026-10-18T12:48:45.174Z)
- `src/workflow/orchestrator.ts` — **insrc-build** (2026-10-18T12:48:45.174Z)
- `src/workflow/questions.ts` — **insrc-build** (2026-10-18T12:48:45.174Z)
- `src/workflow/resolve-comment.ts` — **insrc-build** (2026-10-18T12:48:45.174Z)
- `src/workflow/review/__tests__/review-revision.test.ts` — **insrc-build** (2026-10-18T12:48:45.174Z)
- `src/workflow/review/resolve.ts` — **insrc-build** (2026-10-18T12:48:45.174Z)
- `src/workflow/review/run-artifact.ts` — **insrc-build** (2026-10-18T12:48:45.174Z)
- `src/workflow/runners/build/__tests__/build-record.test.ts` — **insrc-build** (2026-10-18T12:48:45.174Z)
- `src/workflow/runners/build/__tests__/test-record-revision.test.ts` — **insrc-build** (2026-10-18T12:48:45.174Z)
- `src/workflow/runners/build/__tests__/test-record.test.ts` — **insrc-build** (2026-10-18T12:48:45.174Z)
- `src/workflow/runners/build/standalone-record.ts` — **insrc-build** (2026-10-18T12:48:45.174Z)
- `src/workflow/runners/build/test-record.ts` — **insrc-build** (2026-10-18T12:48:45.174Z)
- `src/workflow/storage.ts` — **insrc-build** (2026-10-18T12:48:45.174Z)
- `src/workflow/tracker-auto.ts` — **insrc-build** (2026-10-18T12:48:45.174Z)
- `src/workflow/tracker/__tests__/github-adapter.test.ts` — **insrc-build** (2026-10-18T12:48:45.174Z)
- `src/workflow/tracker/__tests__/unit-extras.test.ts` — **insrc-build** (2026-10-18T12:48:45.174Z)
- `src/workflow/tracker/__tests__/unit-issue.test.ts` — **insrc-build** (2026-10-18T12:48:45.174Z)
- `src/workflow/tracker/github-adapter.ts` — **insrc-build** (2026-10-18T12:48:45.174Z)
- `src/workflow/tracker/github.ts` — **insrc-build** (2026-10-18T12:48:45.174Z)
- `src/workflow/tracker/port.ts` — **insrc-build** (2026-10-18T12:48:45.174Z)
- `src/workflow/tracker/refs.ts` — **insrc-build** (2026-10-18T12:48:45.174Z)
- `src/workflow/tracker/unit-issue.ts` — **insrc-build** (2026-10-18T12:48:45.174Z)
- `src/workflow/types.ts` — **insrc-build** (2026-10-18T12:48:45.174Z)
