<!-- insrc:artifact BUILD-1102dc7125ad0c07-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-17T06:56:06.405Z  ·  **Updated:** 2026-10-17T07:51:29.634Z

**Commit:** 222cc3f0

## Summary

Re-validate after code review round 1 (222cc3f0): testsReaching entries now carry the caller's test file (`<file>#<caller>`, grounding.ts) and the coverage rule judges a reaching entry by its test file's latest run in the test record, never by matching a caller name to a title (round 1's 6 MEDs came from helper names matched against titles). New case: buildCoveragePrompt join test; grounding.test.ts updated for the entry format. Two falsifying mutations each fail them. Earlier t2 behaviour (latest run by ranAt, barriers, BUILD per-task passed) unchanged; the named t2 test still passes.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/__tests__/code-review-rpc-fallback.test.ts` — **insrc-build** (2026-10-17T07:51:29.634Z)
- `src/daemon/__tests__/queue-code-index-work.test.ts` — **insrc-build** (2026-10-17T07:51:29.634Z)
- `src/daemon/code-review-rpc.ts` — **insrc-build** (2026-10-17T07:51:29.634Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-17T07:51:29.634Z)
- `src/daemon/queue.ts` — **insrc-build** (2026-10-17T07:51:29.634Z)
- `src/daemon/steps/__tests__/in-daemon-client.test.ts` — **insrc-build** (2026-10-17T07:51:29.634Z)
- `src/daemon/steps/code-review-step/__tests__/handler.test.ts` — **insrc-build** (2026-10-17T07:51:29.634Z)
- `src/daemon/steps/code-review-step/handler.ts` — **insrc-build** (2026-10-17T07:51:29.634Z)
- `src/daemon/steps/code-review-step/types.ts` — **insrc-build** (2026-10-17T07:51:29.634Z)
- `src/mcp/daemon-stream.ts` — **insrc-build** (2026-10-17T07:51:29.634Z)
- `src/shared/__tests__/review-stream-freshness.test.ts` — **insrc-build** (2026-10-17T07:51:29.634Z)
- `src/shared/__tests__/review-stream.test.ts` — **insrc-build** (2026-10-17T07:51:29.634Z)
- `src/shared/review-stream.ts` — **insrc-build** (2026-10-17T07:51:29.634Z)
- `src/workflow/code-review/__tests__/freshness.test.ts` — **insrc-build** (2026-10-17T07:51:29.634Z)
- `src/workflow/code-review/__tests__/grounding.test.ts` — **insrc-build** (2026-10-17T07:51:29.634Z)
- `src/workflow/code-review/__tests__/subject.test.ts` — **insrc-build** (2026-10-17T07:51:29.634Z)
- `src/workflow/code-review/dimensions/__tests__/coverage.test.ts` — **insrc-build** (2026-10-17T07:51:29.634Z)
- `src/workflow/code-review/dimensions/coverage.ts` — **insrc-build** (2026-10-17T07:51:29.634Z)
- `src/workflow/code-review/dimensions/test-record-view.ts` — **insrc-build** (2026-10-17T07:51:29.634Z)
- `src/workflow/code-review/freshness.ts` — **insrc-build** (2026-10-17T07:51:29.634Z)
- `src/workflow/code-review/grounding.ts` — **insrc-build** (2026-10-17T07:51:29.634Z)
- `src/workflow/code-review/runner.ts` — **insrc-build** (2026-10-17T07:51:29.634Z)
- `src/workflow/code-review/subject.ts` — **insrc-build** (2026-10-17T07:51:29.634Z)
- `src/workflow/code-review/types.ts` — **insrc-build** (2026-10-17T07:51:29.634Z)
