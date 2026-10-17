<!-- insrc:artifact BUILD-1102dc7125ad0c07-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-17T06:56:06.405Z  ·  **Updated:** 2026-10-17T07:30:22.039Z

**Commit:** 35a3a1ea

## Summary

35a3a1ea: codeReviewRequestParams (src/shared/review-stream.ts) forwards fallbackReason; codeReview.run (src/daemon/code-review-rpc.ts) adds CodeReviewRunParams.fallbackReason, validates it in parseFallbackReason (refusing malformed reasons and one sent with a full review) and passes it to the degraded runCodeReview, whose buildArtifact stamps body.fallbackReason (t5). The step-to-daemon test drives the real handler, the real serializer over a JSON wire and the real codeReview.run and asserts the record's body.fallbackReason equals the done frame's. Seven falsifying mutations each fail a test. tsc clean. Full sweep 5578 pass; the 3 failures are pre-existing (sqlite-driver, review-decision) or the known MCPSection.test.ts sweep-load flake (passes 3/3 alone).

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/__tests__/code-review-rpc-fallback.test.ts` — **insrc-build** (2026-10-17T07:30:22.039Z)
- `src/daemon/__tests__/queue-code-index-work.test.ts` — **insrc-build** (2026-10-17T07:30:22.039Z)
- `src/daemon/code-review-rpc.ts` — **insrc-build** (2026-10-17T07:30:22.039Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-17T07:30:22.039Z)
- `src/daemon/queue.ts` — **insrc-build** (2026-10-17T07:30:22.039Z)
- `src/daemon/steps/__tests__/in-daemon-client.test.ts` — **insrc-build** (2026-10-17T07:30:22.039Z)
- `src/daemon/steps/code-review-step/__tests__/handler.test.ts` — **insrc-build** (2026-10-17T07:30:22.039Z)
- `src/daemon/steps/code-review-step/handler.ts` — **insrc-build** (2026-10-17T07:30:22.039Z)
- `src/daemon/steps/code-review-step/types.ts` — **insrc-build** (2026-10-17T07:30:22.039Z)
- `src/mcp/daemon-stream.ts` — **insrc-build** (2026-10-17T07:30:22.039Z)
- `src/shared/__tests__/review-stream-freshness.test.ts` — **insrc-build** (2026-10-17T07:30:22.039Z)
- `src/shared/__tests__/review-stream.test.ts` — **insrc-build** (2026-10-17T07:30:22.039Z)
- `src/shared/review-stream.ts` — **insrc-build** (2026-10-17T07:30:22.039Z)
- `src/workflow/code-review/__tests__/freshness.test.ts` — **insrc-build** (2026-10-17T07:30:22.039Z)
- `src/workflow/code-review/__tests__/subject.test.ts` — **insrc-build** (2026-10-17T07:30:22.039Z)
- `src/workflow/code-review/dimensions/__tests__/coverage.test.ts` — **insrc-build** (2026-10-17T07:30:22.039Z)
- `src/workflow/code-review/dimensions/coverage.ts` — **insrc-build** (2026-10-17T07:30:22.039Z)
- `src/workflow/code-review/dimensions/test-record-view.ts` — **insrc-build** (2026-10-17T07:30:22.039Z)
- `src/workflow/code-review/freshness.ts` — **insrc-build** (2026-10-17T07:30:22.039Z)
- `src/workflow/code-review/runner.ts` — **insrc-build** (2026-10-17T07:30:22.039Z)
- `src/workflow/code-review/subject.ts` — **insrc-build** (2026-10-17T07:30:22.039Z)
- `src/workflow/code-review/types.ts` — **insrc-build** (2026-10-17T07:30:22.039Z)
