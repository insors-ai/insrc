<!-- insrc:artifact BUILD-1716f77ba9ba017b-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-05T09:32:49.002Z  ·  **Updated:** 2026-10-05T10:08:30.287Z

**Commit:** eab036e

## Summary

t7: insrc_review_step routes by author. Daemon-authored work keeps the controller loop; controller-authored or unknown-author work goes to the daemon's workflow.review with an 11 minute (design) or 10 minute wait limit. A failed daemon review is an error with no controller loop. The verdicts and findings phases refuse controller-authored work.

## Tasks validated

- ✗ `t1`
- ✗ `t2`
- ✗ `t3`
- ✗ `t4`
- ✗ `t5`
- ✗ `t6`
- ✗ `t7`

## Changes

- `.insrc/artifacts/PLAN-1716f77ba9ba017b-S001.json` — **insrc-build** (2026-10-05T10:08:30.287Z)
- `src/daemon/__tests__/code-review-rpc.test.ts` — **insrc-build** (2026-10-05T10:08:30.287Z)
- `src/daemon/__tests__/workflow-review-rpc.test.ts` — **insrc-build** (2026-10-05T10:08:30.287Z)
- `src/daemon/__tests__/workflow-rpc.test.ts` — **insrc-build** (2026-10-05T10:08:30.287Z)
- `src/daemon/code-review-rpc.ts` — **insrc-build** (2026-10-05T10:08:30.287Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-05T10:08:30.287Z)
- `src/daemon/workflow-review-rpc.ts` — **insrc-build** (2026-10-05T10:08:30.287Z)
- `src/daemon/workflow-rpc.ts` — **insrc-build** (2026-10-05T10:08:30.287Z)
- `src/mcp/__tests__/review-stream.test.ts` — **insrc-build** (2026-10-05T10:08:30.287Z)
- `src/mcp/build-step/__tests__/build-step.test.ts` — **insrc-build** (2026-10-05T10:08:30.287Z)
- `src/mcp/build-step/__tests__/standalone-implement.test.ts` — **insrc-build** (2026-10-05T10:08:30.287Z)
- `src/mcp/build-step/phases/implement.ts` — **insrc-build** (2026-10-05T10:08:30.287Z)
- `src/mcp/build-step/phases/validate.ts` — **insrc-build** (2026-10-05T10:08:30.287Z)
- `src/mcp/code-review-step/__tests__/handler.test.ts` — **insrc-build** (2026-10-05T10:08:30.287Z)
- `src/mcp/code-review-step/handler.ts` — **insrc-build** (2026-10-05T10:08:30.287Z)
- `src/mcp/daemon-stream.ts` — **insrc-build** (2026-10-05T10:08:30.287Z)
- `src/mcp/review-step/__tests__/review-step-findings.test.ts` — **insrc-build** (2026-10-05T10:08:30.287Z)
- `src/mcp/review-step/__tests__/review-step-routing.test.ts` — **insrc-build** (2026-10-05T10:08:30.287Z)
- `src/mcp/review-step/__tests__/review-step.test.ts` — **insrc-build** (2026-10-05T10:08:30.287Z)
- `src/mcp/review-step/handler.ts` — **insrc-build** (2026-10-05T10:08:30.287Z)
- `src/mcp/review-step/phases/findings.ts` — **insrc-build** (2026-10-05T10:08:30.287Z)
- `src/mcp/review-step/phases/start.ts` — **insrc-build** (2026-10-05T10:08:30.287Z)
- `src/mcp/review-step/phases/verdicts.ts` — **insrc-build** (2026-10-05T10:08:30.287Z)
- `src/mcp/review-step/types.ts` — **insrc-build** (2026-10-05T10:08:30.287Z)
- `src/mcp/workflow-step/__tests__/handler.test.ts` — **insrc-build** (2026-10-05T10:08:30.287Z)
- `src/mcp/workflow-step/phases/synthesize.ts` — **insrc-build** (2026-10-05T10:08:30.287Z)
- `src/workflow/__tests__/author-stamp.test.ts` — **insrc-build** (2026-10-05T10:08:30.287Z)
- `src/workflow/code-review/__tests__/runner.test.ts` — **insrc-build** (2026-10-05T10:08:30.287Z)
- `src/workflow/code-review/runner.ts` — **insrc-build** (2026-10-05T10:08:30.287Z)
- `src/workflow/code-review/types.ts` — **insrc-build** (2026-10-05T10:08:30.287Z)
- `src/workflow/orchestrator.ts` — **insrc-build** (2026-10-05T10:08:30.287Z)
- `src/workflow/review/__tests__/party.test.ts` — **insrc-build** (2026-10-05T10:08:30.287Z)
- `src/workflow/review/__tests__/same-party-refusal.test.ts` — **insrc-build** (2026-10-05T10:08:30.287Z)
- `src/workflow/review/__tests__/template-review.test.ts` — **insrc-build** (2026-10-05T10:08:30.287Z)
- `src/workflow/review/index.ts` — **insrc-build** (2026-10-05T10:08:30.287Z)
- `src/workflow/review/party.ts` — **insrc-build** (2026-10-05T10:08:30.287Z)
- `src/workflow/review/run-artifact.ts` — **insrc-build** (2026-10-05T10:08:30.287Z)
- `src/workflow/review/types.ts` — **insrc-build** (2026-10-05T10:08:30.287Z)
- `src/workflow/runners/build/__tests__/completion-record.test.ts` — **insrc-build** (2026-10-05T10:08:30.287Z)
- `src/workflow/runners/build/standalone-record.ts` — **insrc-build** (2026-10-05T10:08:30.287Z)
- `src/workflow/types.ts` — **insrc-build** (2026-10-05T10:08:30.287Z)
