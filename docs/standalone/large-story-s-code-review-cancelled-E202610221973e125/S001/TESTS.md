<!-- insrc:artifact TESTS-1973e125995f971e-s1 -->

# Tests: 1973e125995f971e s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 16 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-23T04:21:09.254Z on commit `329d0b12`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: runReviewStream with idleMs: frames more often than idleMs keep the request alive past idleMs; it resolves on its final frame**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | runReviewStream with idleMs: frames more often than idleMs keep the request alive past idleMs; it resolves on its final frame | `src/shared/__tests__/review-stream.test.ts` |

**unit: runReviewStream with idleMs: no frame for idleMs fails 'timeout' naming the idle limit and cancels the transport**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | runReviewStream with idleMs: no frame for idleMs fails 'timeout' naming the idle limit and cancels the transport | `src/shared/__tests__/review-stream.test.ts` |

**unit: runReviewStream: frames do not extend timeoutMs; past it the request fails 'timeout' naming the ceiling**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | runReviewStream: frames do not extend timeoutMs; past it the request fails 'timeout' naming the ceiling | `src/shared/__tests__/review-stream.test.ts` |

**unit: runReviewStream without idleMs (or with an out-of-range idleMs): today's single wait**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | runReviewStream without idleMs (or with an out-of-range idleMs): today's single wait | `src/shared/__tests__/review-stream.test.ts` |
| pass | T11 codeReviewStream: with a daemon that never answers, it fails at its wait limit and drops the connection | `src/mcp/__tests__/review-stream.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/mcp/__tests__/review-stream.test.ts` | 0 | 16 | 0.6 s |  |
| `src/shared/__tests__/review-stream.test.ts` | 0 | 11 | 0.5 s |  |

## t2

Run at 2026-10-23T04:23:30.947Z on commit `695d12bb`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: runCodeReview emits a 'call' progress per pipeline call of a dimension, with stage, role and count in detail, between its dimension-start and dimension-done**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | runCodeReview emits a 'call' progress per pipeline call of a dimension, with stage, role and count in detail, between its dimension-start and dimension-done | `src/workflow/code-review/__tests__/call-progress.test.ts` |

**unit: runDimensionJob forwards JudgeContext.onCall to runReviewJob's onCall; without it the job runs as today**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | runDimensionJob forwards JudgeContext.onCall to runReviewJob's onCall; without it the job runs as today | `src/workflow/code-review/__tests__/call-progress.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/__tests__/call-progress.test.ts` | 0 | 2 | 0.9 s |  |

## t3

Run at 2026-10-23T04:25:05.971Z on commit `b8779cfd`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: step.call: a step tool's progress calls arrive as 'progress' frames before 'done'; a failing send does not fail the step; progress after 'done' is ignored**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | step.call: a step tool's progress calls arrive as 'progress' frames before 'done'; a failing send does not fail the step; progress after 'done' is ignored | `src/daemon/steps/__tests__/step-host.test.ts` |

**integration: MCP forwarder: a forwarded insrc_code_review_step with a progressToken emits notifications/progress for each progress frame**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | MCP forwarder: a forwarded insrc_code_review_step with a progressToken emits notifications/progress for each progress frame | `src/mcp/__tests__/forward-step.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/steps/__tests__/step-host.test.ts` | 0 | 7 | 1.4 s |  |
| `src/mcp/__tests__/forward-step.test.ts` | 0 | 6 | 0.9 s |  |

## t4

Run at 2026-10-23T04:29:17.214Z on commit `868b23c4`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: codeReviewWaitLimits reads both keys, falls back to the defaults on a bad value and clamps idle to the ceiling**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | codeReviewWaitLimits reads both keys, falls back to the defaults on a bad value and clamps idle to the ceiling | `src/daemon/steps/code-review-step/__tests__/routing.test.ts` |

**unit: reviewByDaemon passes the limits as timeoutMs and idleMs to codeReviewStream and relays every progress frame to deps.progress**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | reviewByDaemon passes the limits as timeoutMs and idleMs to codeReviewStream and relays every progress frame to deps.progress | `src/daemon/steps/code-review-step/__tests__/routing.test.ts` |
| pass | insrc_code_review_step through step.call: the step's progress is threaded into its deps, so each daemon review frame arrives as a 'progress' frame before 'done' | `src/daemon/steps/__tests__/step-host.test.ts` |

**unit: a ceiling or idle timeout answers next:'error' naming the config key to raise**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a ceiling or idle timeout answers next:'error' naming the config key to raise | `src/daemon/steps/code-review-step/__tests__/routing.test.ts` |

**unit: the config catalog declares codeReview.daemonReviewCeilingMs and codeReview.daemonReviewIdleMs with their defaults**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the config catalog declares codeReview.daemonReviewCeilingMs and codeReview.daemonReviewIdleMs with their defaults | `src/config/__tests__/config-catalog-contract.test.ts` |
| pass | the real CONFIG_CATALOG has 45 rows (flat models.* surface; shaper*/summariser* now derived; + codeReview.enforce + codeReview.freshnessTimeoutMs + codeReview.daemonReviewCeilingMs + codeReview.daemonReviewIdleMs + models.local.embeddingKeepAlive + five designReview.* rows + analyzer.dataSourceListingTimeoutMs + review.chunkTokens + daemon.threads.enabled + four daemon.maintenance.* rows) | `src/config/__tests__/config-catalog-contract.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/config/__tests__/config-catalog-contract.test.ts` | 0 | 11 | 0.4 s |  |
| `src/daemon/steps/__tests__/step-host.test.ts` | 0 | 8 | 1.2 s |  |
| `src/daemon/steps/code-review-step/__tests__/routing.test.ts` | 0 | 23 | 0.5 s |  |

## t5

Run at 2026-10-23T04:31:23.456Z on commit `2400f8c5`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: a daemon code review reporting a call every minute runs past 30 minutes and writes its record; one quiet past the idle limit fails with the idle cause and writes none**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a daemon code review reporting a call every minute runs past 30 minutes and writes its record; one quiet past the idle limit fails with the idle cause and writes none | `src/daemon/steps/code-review-step/__tests__/long-review.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/steps/code-review-step/__tests__/long-review.test.ts` | 0 | 1 | 0.6 s |  |
