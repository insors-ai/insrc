<!-- insrc:artifact BUILD-86197ac660732ceb-s1 -->

# Build (plan-driven) — Story s1

**Standalone:** no  ·  **Created:** 2026-10-21T15:03:00.014Z  ·  **Updated:** 2026-10-21T15:59:53.674Z

**Commit:** c93a6782

## Summary

Added src/daemon/threads/step-state.ts: SharedStepStateStore with today's per-kind lifecycles (LocalStepStateStore on the main thread: 100-entry cap evicting the least recently touched, 1-hour idle TTL swept on mint, read refreshing the expiry; analyze and workflow rotate tokens, review keeps its token and requires it to exist, code-review consumes and mints per stage), payloads stored as a structured clone; stepStateHubHandlers and HubStepStateStore so a worker uses the same interface over the hub; getStepStateStore/installStepStateStore. Nothing calls it yet (t8/t9 move the four state-store modules onto it). Tests in src/daemon/threads/__tests__/step-state.test.ts, including real workers, a payload of each kind crossing the hub unchanged, an unclonable payload failing with DataCloneError, and state minted in one worker read by another after the first exits. Four lifecycle mutations each fail the lifecycle test.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`
- ✓ `t8`
- ✓ `t9`
- ✓ `t10`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/db/graph/__tests__/helpers/lmdb-open-close.mjs` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/db/graph/__tests__/helpers/lmdb-worker.mjs` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/db/graph/__tests__/worker-thread-lock.test.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/db/__tests__/helpers/store-guard-worker.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/db/__tests__/store-guard.test.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/db/store-guard.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/daemon/threads/__tests__/channel.test.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/daemon/threads/__tests__/helpers/hub-worker.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/daemon/threads/channel.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/daemon/threads/__tests__/helpers/board-worker.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/daemon/threads/__tests__/registry-board.test.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/daemon/threads/registry.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/daemon/threads/status-board.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/db/graph/__tests__/helpers/health-worker.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/db/graph/__tests__/store-health-threads.test.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/db/graph/store.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/daemon/threads/store-health-hub.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/db/graph/__tests__/helpers/health-hub-worker.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/daemon/db/duckdb-pool.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/db/__tests__/cross-thread-stores.test.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/db/__tests__/helpers/duckdb-query-worker.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/db/__tests__/helpers/lance-reader-worker.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/db/lance/conn.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/daemon/threads/__tests__/helpers/step-state-worker.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/daemon/threads/__tests__/step-state.test.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/daemon/threads/step-state.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/daemon/steps/__tests__/analyze-step-answer-prompt-missing.test.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/daemon/steps/__tests__/analyze-step-bundle-report.test.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/daemon/steps/__tests__/analyze-step-failed-lookup.test.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/daemon/steps/__tests__/analyze-step-measure.test.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/daemon/steps/__tests__/analyze-step-narrow.test.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/daemon/steps/__tests__/analyze-step-scope.test.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/daemon/steps/__tests__/analyze-step-state.test.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/daemon/steps/__tests__/step-host.test.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/daemon/steps/analyze-step/phases/bundle.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/daemon/steps/analyze-step/phases/narrow.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/daemon/steps/analyze-step/phases/plan.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/daemon/steps/analyze-step/phases/start.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/daemon/steps/analyze-step/state-store.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/daemon/steps/analyze-step/state.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/daemon/steps/workflow-step/__tests__/amendments-e2e.test.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/daemon/steps/workflow-step/__tests__/brainstorm-state.test.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/daemon/steps/workflow-step/__tests__/define-e2e.test.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/daemon/steps/workflow-step/__tests__/define-extend-e2e.test.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/daemon/steps/workflow-step/__tests__/design-epic-e2e.test.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/daemon/steps/workflow-step/__tests__/design-story-e2e.test.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/daemon/steps/workflow-step/__tests__/handler.test.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/daemon/steps/workflow-step/__tests__/plan-e2e.test.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/daemon/steps/workflow-step/__tests__/questions-gate-e2e.test.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/daemon/steps/workflow-step/__tests__/state-store.test.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/daemon/steps/workflow-step/__tests__/tracker-e2e.test.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/daemon/steps/workflow-step/__tests__/tracker-tasks-coarse.test.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/daemon/steps/workflow-step/phases/plan.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/daemon/steps/workflow-step/phases/start.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/daemon/steps/workflow-step/phases/step.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/daemon/steps/workflow-step/phases/synthesize.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/daemon/steps/workflow-step/state-store.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/daemon/steps/workflow-step/state.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/daemon/__tests__/code-review-rpc-fallback.test.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/daemon/steps/__tests__/in-daemon-client.test.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/daemon/steps/__tests__/peer-state-store-leakfree.test.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/daemon/steps/code-review-step/__tests__/coverage-normalized-paths.test.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/daemon/steps/code-review-step/__tests__/handler.test.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/daemon/steps/code-review-step/__tests__/routing.test.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/daemon/steps/code-review-step/__tests__/ux-handler.test.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/daemon/steps/code-review-step/handler.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/daemon/steps/code-review-step/state-store.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/daemon/steps/review-step/__tests__/review-step-findings.test.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/daemon/steps/review-step/__tests__/review-step-routing.test.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/daemon/steps/review-step/__tests__/review-step.test.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/daemon/steps/review-step/handler.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/daemon/steps/review-step/phases/claims.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/daemon/steps/review-step/phases/findings.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/daemon/steps/review-step/phases/start.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/daemon/steps/review-step/phases/verdicts.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/daemon/steps/review-step/state-store.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/workflow/code-review/__tests__/diff-attribution.test.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/workflow/code-review/__tests__/subject-attribution.test.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/daemon/threads/__tests__/helpers/store-worker.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/daemon/threads/__tests__/worker-stores.test.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
- `src/daemon/threads/worker-entry.ts` — **insrc-build** (2026-10-21T15:59:53.674Z)
