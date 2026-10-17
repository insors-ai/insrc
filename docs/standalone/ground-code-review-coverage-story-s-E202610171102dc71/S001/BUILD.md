<!-- insrc:artifact BUILD-1102dc7125ad0c07-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-17T06:56:06.405Z  ·  **Updated:** 2026-10-17T07:15:16.317Z

**Commit:** 5d28d6c2

## Summary

5d28d6c2: computeCodeReviewFreshness takes codeIndexWork(repoPath) and returns { isProcessing = inFlight || pending > 0, inFlight, pendingCodeIndexJobs, staleFiles (unchanged) }. The codeReview.freshness handler (src/daemon/index.ts) supplies queue.codeIndexWorkFor and returns the FreshnessResult itself as the reply, so no field can be dropped there. CodeReviewFreshnessResult and freshnessFromReply (src/shared/review-stream.ts) carry inFlight and pendingCodeIndexJobs, mapping an older reply to inFlight = isProcessing and 0; both clients use it (daemon-client.ts unchanged; mcp/daemon-stream.ts types its reply from it). Four falsifying mutations each fail a test. tsc clean; workflow, daemon, daemon/steps, MCP and shared suites 2606 pass, only the pre-existing review-decision failure.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/__tests__/queue-code-index-work.test.ts` — **insrc-build** (2026-10-17T07:15:16.317Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-17T07:15:16.317Z)
- `src/daemon/queue.ts` — **insrc-build** (2026-10-17T07:15:16.317Z)
- `src/daemon/steps/__tests__/in-daemon-client.test.ts` — **insrc-build** (2026-10-17T07:15:16.317Z)
- `src/mcp/daemon-stream.ts` — **insrc-build** (2026-10-17T07:15:16.317Z)
- `src/shared/__tests__/review-stream-freshness.test.ts` — **insrc-build** (2026-10-17T07:15:16.317Z)
- `src/shared/review-stream.ts` — **insrc-build** (2026-10-17T07:15:16.317Z)
- `src/workflow/code-review/__tests__/freshness.test.ts` — **insrc-build** (2026-10-17T07:15:16.317Z)
- `src/workflow/code-review/__tests__/subject.test.ts` — **insrc-build** (2026-10-17T07:15:16.317Z)
- `src/workflow/code-review/dimensions/__tests__/coverage.test.ts` — **insrc-build** (2026-10-17T07:15:16.317Z)
- `src/workflow/code-review/dimensions/coverage.ts` — **insrc-build** (2026-10-17T07:15:16.317Z)
- `src/workflow/code-review/dimensions/test-record-view.ts` — **insrc-build** (2026-10-17T07:15:16.317Z)
- `src/workflow/code-review/freshness.ts` — **insrc-build** (2026-10-17T07:15:16.317Z)
- `src/workflow/code-review/subject.ts` — **insrc-build** (2026-10-17T07:15:16.317Z)
- `src/workflow/code-review/types.ts` — **insrc-build** (2026-10-17T07:15:16.317Z)
