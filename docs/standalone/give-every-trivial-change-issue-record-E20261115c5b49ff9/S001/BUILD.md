<!-- insrc:artifact BUILD-c5b49ff953a9a295-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-11-15T06:48:26.527Z  ·  **Updated:** 2026-11-15T08:08:16.889Z

**Commit:** 52fea3d7d

## Summary

Tests prove backfilled Stories settle by the completion rule (pre-cutoff completes, post-cutoff without a code review is held, draft not settled) and a part-way backfill is finished by the next run. Legacy approvedAt is now read as approved. Deviation: the plan's test name says a pre-cutoff approval is held; settle completes it, so the test is titled for the real rule. Post-deploy migration not run.

## Tasks validated

- ✗ `t1`
- ✗ `t2`
- ✓ `t3`
- ✗ `t4`
- ✗ `t5`
- ✗ `t6`
- ✗ `t7`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/db/__tests__/fixtures/session-source-inventory.json` — **insrc-build** (2026-11-15T08:08:16.889Z)
- `src/workflow/__tests__/issue-artifact.test.ts` — **insrc-build** (2026-11-15T08:08:16.889Z)
- `src/workflow/artifacts/issue.ts` — **insrc-build** (2026-11-15T08:08:16.889Z)
- `src/workflow/orchestrator.ts` — **insrc-build** (2026-11-15T08:08:16.889Z)
- `src/workflow/runners/issue/index.ts` — **insrc-build** (2026-11-15T08:08:16.889Z)
- `src/workflow/triage/types.ts` — **insrc-build** (2026-11-15T08:08:16.889Z)
- `src/workflow/types.ts` — **insrc-build** (2026-11-15T08:08:16.889Z)
- `src/workflow/__tests__/bugfix-orchestration.test.ts` — **insrc-build** (2026-11-15T08:08:16.889Z)
- `src/workflow/bugfix/next-after-issue.ts` — **insrc-build** (2026-11-15T08:08:16.889Z)
- `src/daemon/steps/build-step/__tests__/build-start.test.ts` — **insrc-build** (2026-11-15T08:08:16.889Z)
- `src/daemon/steps/build-step/__tests__/build-step.test.ts` — **insrc-build** (2026-11-15T08:08:16.889Z)
- `src/daemon/steps/build-step/__tests__/gate-call-sites.test.ts` — **insrc-build** (2026-11-15T08:08:16.889Z)
- `src/daemon/steps/build-step/__tests__/standalone-implement.test.ts` — **insrc-build** (2026-11-15T08:08:16.889Z)
- `src/daemon/steps/build-step/__tests__/validate-anchor.test.ts` — **insrc-build** (2026-11-15T08:08:16.889Z)
- `src/daemon/steps/build-step/phases/implement.ts` — **insrc-build** (2026-11-15T08:08:16.889Z)
- `src/daemon/steps/build-step/phases/validate.ts` — **insrc-build** (2026-11-15T08:08:16.889Z)
- `src/workflow/__tests__/helpers/approved-issue.ts` — **insrc-build** (2026-11-15T08:08:16.889Z)
- `src/workflow/__tests__/standalone-story.test.ts` — **insrc-build** (2026-11-15T08:08:16.889Z)
- `src/workflow/runners/build/admission.ts` — **insrc-build** (2026-11-15T08:08:16.889Z)
- `src/workflow/runners/build/schemas.ts` — **insrc-build** (2026-11-15T08:08:16.889Z)
- `src/daemon/steps/build-step/__tests__/trivial-change-e2e.test.ts` — **insrc-build** (2026-11-15T08:08:16.889Z)
- `src/daemon/steps/triage-step/__tests__/handler.test.ts` — **insrc-build** (2026-11-15T08:08:16.889Z)
- `src/daemon/steps/triage-step/phases/classify.ts` — **insrc-build** (2026-11-15T08:08:16.889Z)
- `src/workflow/triage/__tests__/classify.test.ts` — **insrc-build** (2026-11-15T08:08:16.889Z)
- `src/workflow/triage/classify.ts` — **insrc-build** (2026-11-15T08:08:16.889Z)
- `docs/plans/feature-triage-router.md` — **insrc-build** (2026-11-15T08:08:16.889Z)
- `src/mcp/__tests__/fixtures/tool-surface.golden.json` — **insrc-build** (2026-11-15T08:08:16.889Z)
- `src/mcp/__tests__/review-rule-text.test.ts` — **insrc-build** (2026-11-15T08:08:16.889Z)
- `src/mcp/server.ts` — **insrc-build** (2026-11-15T08:08:16.889Z)
- `src/prompts/steering-block.md` — **insrc-build** (2026-11-15T08:08:16.889Z)
- `src/workflow/code-review/task-review/__tests__/documents-contract.test.ts` — **insrc-build** (2026-11-15T08:08:16.889Z)
- `src/workflow/convert/__tests__/repair-backfill-issue.test.ts` — **insrc-build** (2026-11-15T08:08:16.889Z)
- `src/workflow/convert/__tests__/repair-settle.test.ts` — **insrc-build** (2026-11-15T08:08:16.889Z)
- `src/workflow/convert/backfill-issue.ts` — **insrc-build** (2026-11-15T08:08:16.889Z)
- `src/workflow/convert/plan.ts` — **insrc-build** (2026-11-15T08:08:16.889Z)
- `src/workflow/convert/repair.ts` — **insrc-build** (2026-11-15T08:08:16.889Z)
- `src/workflow/convert/types.ts` — **insrc-build** (2026-11-15T08:08:16.889Z)
- `src/workflow/convert/settle.ts` — **insrc-build** (2026-11-15T08:08:16.889Z)
