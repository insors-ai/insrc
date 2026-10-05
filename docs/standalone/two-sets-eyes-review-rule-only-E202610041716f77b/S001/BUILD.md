<!-- insrc:artifact BUILD-1716f77ba9ba017b-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-05T09:32:49.002Z  ·  **Updated:** 2026-10-05T09:52:08.247Z

**Commit:** 5866461

## Summary

t4: the daemon side refuses to review daemon-authored work. reviewArtifactFile throws a same-party error before any provider call (covers the TUI review service); the daemon run reports review-skipped instead of reviewing its own artifact; the daemon code review refuses daemon-authored code with an error frame.

## Tasks validated

- ✗ `t1`
- ✗ `t2`
- ✗ `t3`
- ✗ `t4`

## Changes

- `.insrc/artifacts/PLAN-1716f77ba9ba017b-S001.json` — **insrc-build** (2026-10-05T09:52:08.247Z)
- `src/daemon/__tests__/code-review-rpc.test.ts` — **insrc-build** (2026-10-05T09:52:08.247Z)
- `src/daemon/__tests__/workflow-rpc.test.ts` — **insrc-build** (2026-10-05T09:52:08.247Z)
- `src/daemon/code-review-rpc.ts` — **insrc-build** (2026-10-05T09:52:08.247Z)
- `src/daemon/workflow-rpc.ts` — **insrc-build** (2026-10-05T09:52:08.247Z)
- `src/mcp/build-step/__tests__/build-step.test.ts` — **insrc-build** (2026-10-05T09:52:08.247Z)
- `src/mcp/build-step/__tests__/standalone-implement.test.ts` — **insrc-build** (2026-10-05T09:52:08.247Z)
- `src/mcp/build-step/phases/implement.ts` — **insrc-build** (2026-10-05T09:52:08.247Z)
- `src/mcp/build-step/phases/validate.ts` — **insrc-build** (2026-10-05T09:52:08.247Z)
- `src/mcp/code-review-step/__tests__/handler.test.ts` — **insrc-build** (2026-10-05T09:52:08.247Z)
- `src/mcp/code-review-step/handler.ts` — **insrc-build** (2026-10-05T09:52:08.247Z)
- `src/mcp/review-step/__tests__/review-step-findings.test.ts` — **insrc-build** (2026-10-05T09:52:08.247Z)
- `src/mcp/review-step/__tests__/review-step.test.ts` — **insrc-build** (2026-10-05T09:52:08.247Z)
- `src/mcp/review-step/phases/findings.ts` — **insrc-build** (2026-10-05T09:52:08.247Z)
- `src/mcp/review-step/phases/verdicts.ts` — **insrc-build** (2026-10-05T09:52:08.247Z)
- `src/mcp/workflow-step/__tests__/handler.test.ts` — **insrc-build** (2026-10-05T09:52:08.247Z)
- `src/mcp/workflow-step/phases/synthesize.ts` — **insrc-build** (2026-10-05T09:52:08.247Z)
- `src/workflow/__tests__/author-stamp.test.ts` — **insrc-build** (2026-10-05T09:52:08.247Z)
- `src/workflow/code-review/__tests__/runner.test.ts` — **insrc-build** (2026-10-05T09:52:08.247Z)
- `src/workflow/code-review/runner.ts` — **insrc-build** (2026-10-05T09:52:08.247Z)
- `src/workflow/code-review/types.ts` — **insrc-build** (2026-10-05T09:52:08.247Z)
- `src/workflow/orchestrator.ts` — **insrc-build** (2026-10-05T09:52:08.247Z)
- `src/workflow/review/__tests__/party.test.ts` — **insrc-build** (2026-10-05T09:52:08.247Z)
- `src/workflow/review/__tests__/same-party-refusal.test.ts` — **insrc-build** (2026-10-05T09:52:08.247Z)
- `src/workflow/review/__tests__/template-review.test.ts` — **insrc-build** (2026-10-05T09:52:08.247Z)
- `src/workflow/review/index.ts` — **insrc-build** (2026-10-05T09:52:08.247Z)
- `src/workflow/review/party.ts` — **insrc-build** (2026-10-05T09:52:08.247Z)
- `src/workflow/review/run-artifact.ts` — **insrc-build** (2026-10-05T09:52:08.247Z)
- `src/workflow/review/types.ts` — **insrc-build** (2026-10-05T09:52:08.247Z)
- `src/workflow/runners/build/__tests__/completion-record.test.ts` — **insrc-build** (2026-10-05T09:52:08.247Z)
- `src/workflow/runners/build/standalone-record.ts` — **insrc-build** (2026-10-05T09:52:08.247Z)
- `src/workflow/types.ts` — **insrc-build** (2026-10-05T09:52:08.247Z)
