<!-- insrc:artifact BUILD-1102dc7125ad0c07-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-17T06:56:06.405Z  ·  **Updated:** 2026-10-17T07:22:14.986Z

**Commit:** cf468dc3

## Summary

cf468dc3: CodeReviewFallbackReason (src/workflow/code-review/types.ts) is built at beginDiffOnlyReview's three callers (freshness-timeout with waitedMs/inFlight/pendingCodeIndexJobs/staleFiles from the last freshness answer; declined; hollow-grounding). Controller path: saved in CodeReviewStepStatePayload.fallbackReason, passed by the judgements turn to runCodeReview opts, stamped by buildArtifact as optional CodeReviewBody.fallbackReason and rendered as one .md line; done frame carries it. Daemon path: passed in CodeReviewStreamParams.fallbackReason to the daemon client and onto the done frame (codeReviewRequestParams + codeReview.run are t6). A record without the field renders as before (asserted for the full review). Twelve falsifying mutations each fail the named tests. tsc clean; wider suites 2608 pass, only the pre-existing review-decision failure.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/__tests__/queue-code-index-work.test.ts` — **insrc-build** (2026-10-17T07:22:14.986Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-17T07:22:14.986Z)
- `src/daemon/queue.ts` — **insrc-build** (2026-10-17T07:22:14.986Z)
- `src/daemon/steps/__tests__/in-daemon-client.test.ts` — **insrc-build** (2026-10-17T07:22:14.986Z)
- `src/daemon/steps/code-review-step/__tests__/handler.test.ts` — **insrc-build** (2026-10-17T07:22:14.986Z)
- `src/daemon/steps/code-review-step/handler.ts` — **insrc-build** (2026-10-17T07:22:14.986Z)
- `src/daemon/steps/code-review-step/types.ts` — **insrc-build** (2026-10-17T07:22:14.986Z)
- `src/mcp/daemon-stream.ts` — **insrc-build** (2026-10-17T07:22:14.986Z)
- `src/shared/__tests__/review-stream-freshness.test.ts` — **insrc-build** (2026-10-17T07:22:14.986Z)
- `src/shared/review-stream.ts` — **insrc-build** (2026-10-17T07:22:14.986Z)
- `src/workflow/code-review/__tests__/freshness.test.ts` — **insrc-build** (2026-10-17T07:22:14.986Z)
- `src/workflow/code-review/__tests__/subject.test.ts` — **insrc-build** (2026-10-17T07:22:14.986Z)
- `src/workflow/code-review/dimensions/__tests__/coverage.test.ts` — **insrc-build** (2026-10-17T07:22:14.986Z)
- `src/workflow/code-review/dimensions/coverage.ts` — **insrc-build** (2026-10-17T07:22:14.986Z)
- `src/workflow/code-review/dimensions/test-record-view.ts` — **insrc-build** (2026-10-17T07:22:14.986Z)
- `src/workflow/code-review/freshness.ts` — **insrc-build** (2026-10-17T07:22:14.986Z)
- `src/workflow/code-review/runner.ts` — **insrc-build** (2026-10-17T07:22:14.986Z)
- `src/workflow/code-review/subject.ts` — **insrc-build** (2026-10-17T07:22:14.986Z)
- `src/workflow/code-review/types.ts` — **insrc-build** (2026-10-17T07:22:14.986Z)
