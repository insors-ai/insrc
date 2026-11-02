<!-- insrc:artifact BUILD-64703b708590bd68-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-11-01T19:44:06.175Z  ·  **Updated:** 2026-11-01T20:49:15.075Z

**Commit:** 3106197a5

## Summary

Full sweep run once (1141 files, four at a time) and compared by test name with the tree before the fix (e87df83c2): 167 failures are in both trees, nine failed only under load (three shutdown files pass alone; indexing-port daemon.status fails alone in the old tree too), no new skipped test. The outcome (deviations, scope decision, installed daemon, open items) is docs/plans/repo-gate-outcome.md; repo-gate-sweep-record.test.ts pins it. The sweep itself cannot be a test.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`
- ✓ `t8`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `docs/plans/repo-call-audit.md` — **insrc-build** (2026-11-02T05:36:23.548Z)
- `src/daemon/__tests__/repo-call-audit.test.ts` — **insrc-build** (2026-11-02T05:36:23.548Z)
- `src/daemon/repo-call-audit.ts` — **insrc-build** (2026-11-02T05:36:23.548Z)
- `src/daemon/__tests__/repo-call-gate.test.ts` — **insrc-build** (2026-11-02T05:36:23.548Z)
- `src/daemon/__tests__/repo-call-table.test.ts` — **insrc-build** (2026-11-02T05:36:23.548Z)
- `src/daemon/repo-call-gate.ts` — **insrc-build** (2026-11-02T05:36:23.548Z)
- `src/cli/__tests__/cli-sends-repo.test.ts` — **insrc-build** (2026-11-02T05:36:23.548Z)
- `src/cli/__tests__/cli-services-daemon-errors.test.ts` — **insrc-build** (2026-11-02T05:36:23.548Z)
- `src/cli/__tests__/cli-services-no-spawn.test.ts` — **insrc-build** (2026-11-02T05:36:23.548Z)
- `src/cli/__tests__/workflow-approve-versioning.test.ts` — **insrc-build** (2026-11-02T05:36:23.548Z)
- `src/cli/services/workflow.ts` — **insrc-build** (2026-11-02T05:36:23.548Z)
- `src/mcp/__tests__/approve-absolute-repo.test.ts` — **insrc-build** (2026-11-02T05:36:23.548Z)
- `src/mcp/__tests__/fixtures/tool-surface.golden.json` — **insrc-build** (2026-11-02T05:36:23.548Z)
- `src/mcp/forward-step.ts` — **insrc-build** (2026-11-02T05:36:23.548Z)
- `src/mcp/server.ts` — **insrc-build** (2026-11-02T05:36:23.548Z)
- `src/daemon/__tests__/approve-repo-gate.test.ts` — **insrc-build** (2026-11-02T05:36:23.548Z)
- `src/daemon/__tests__/handler-runtime.test.ts` — **insrc-build** (2026-11-02T05:36:23.548Z)
- `src/daemon/__tests__/lifecycle-wiring.test.ts` — **insrc-build** (2026-11-02T05:36:23.548Z)
- `src/daemon/__tests__/workflow-approve-followon.test.ts` — **insrc-build** (2026-11-02T05:36:23.548Z)
- `src/daemon/handler-runtime.ts` — **insrc-build** (2026-11-02T05:36:23.548Z)
- `src/daemon/workflow-approve.ts` — **insrc-build** (2026-11-02T05:36:23.548Z)
- `src/workflow/__tests__/helpers/approve-pipeline.ts` — **insrc-build** (2026-11-02T05:36:23.548Z)
- `src/workflow/__tests__/review-decision.test.ts` — **insrc-build** (2026-11-02T05:36:23.548Z)
- `src/daemon/__tests__/artifact-feedback-handler-contract.test.ts` — **insrc-build** (2026-11-02T05:36:23.548Z)
- `src/daemon/__tests__/repo-gate-dispatch.test.ts` — **insrc-build** (2026-11-02T05:36:23.548Z)
- `src/daemon/repo-convert.ts` — **insrc-build** (2026-11-02T05:36:23.548Z)
- `src/daemon/tracker-attach.ts` — **insrc-build** (2026-11-02T05:36:23.548Z)
- `src/daemon/tracker-sync-comments.ts` — **insrc-build** (2026-11-02T05:36:23.548Z)
- `src/daemon/workflow-rpc.ts` — **insrc-build** (2026-11-02T05:36:23.548Z)
- `src/daemon/__tests__/feedback-wiring.test.ts` — **insrc-build** (2026-11-02T05:36:23.548Z)
- `src/daemon/feedback-handlers.ts` — **insrc-build** (2026-11-02T05:36:23.548Z)
- `src/daemon/__tests__/step-repo-gate.test.ts` — **insrc-build** (2026-11-02T05:36:23.548Z)
- `src/daemon/steps/host.ts` — **insrc-build** (2026-11-02T05:36:23.548Z)
- `src/mcp/__tests__/mcp-process-e2e.test.ts` — **insrc-build** (2026-11-02T05:36:23.548Z)
- `docs/daemon.md` — **insrc-build** (2026-11-02T05:36:23.548Z)
- `src/daemon/__tests__/daemon-doc-repo-table.test.ts` — **insrc-build** (2026-11-02T05:36:23.548Z)
- `docs/plans/repo-gate-outcome.md` — **insrc-build** (2026-11-02T05:36:23.548Z)
- `src/daemon/__tests__/repo-gate-sweep-record.test.ts` — **insrc-build** (2026-11-02T05:36:23.548Z)
- `docs/standalone/reject-file-modifying-daemon-calls-do-E2026110164703b70/S001/SELF-REVIEW.md` — **insrc-build** (2026-11-02T05:36:23.548Z)
- `.insrc/artifacts/TASKS-64703b708590bd68-s1.log.jsonl` — **insrc-build** (2026-11-02T05:36:23.548Z)
