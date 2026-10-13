<!-- insrc:artifact CR-c2ba6fa62a148ed1-s11 -->

# Code review: c2ba6fa62a148ed1:s11

⚠️ **WARN** — HIGH 0 · MED 2 · LOW 6 · model `claude:opus`

**Changed files:** 73

## adherence — 0 finding(s)

_No findings._

## conventions — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/daemon/steps/analyze-oneshot.ts:47 | The optional properties of `AnalyzeOneShotArgs` (`repo?`, `target?`, `scope?`) are declared without `\| undefined`. With exactOptionalPropertyTypes on, the documented convention is to declare optional props as `\| undefined`. The `AnalyzeOneShotDeps` interface in the same file (and `ResolveRepoDeps`, `StepHostOptions` and `InDaemonClientDeps` elsewhere in this change) already follows that convention, so this interface is the inconsistent one. |
| LOW | src/daemon/steps/analyze-oneshot.ts:32 | The inline parameter type of `oneShotRunParams` declares `target?` and `scope?` without `\| undefined`, which departs from the documented optional-property convention under exactOptionalPropertyTypes. |

## coverage — 3 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/daemon/steps/host.ts:1 | Present but unverified: the review was not given a build record, so none of the promised tests has a confirmed pass. I could not run them either, because running the suites needs approval. All 28 automated promised tests exist by exact title: in-daemon-client.test.ts, step-context.test.ts, step-host.test.ts, workflow-rpc-imports.test.ts, forward-step.test.ts, import-graph.test.ts, sampling-retired.test.ts, mcp-process-e2e.test.ts, mcp-process-refused.test.ts, shared/review-stream.test.ts, lance live-vector-store-owner/no-live-vector-store-in-tests, and graph live-store-owner/live-store-refusal. The moved step suites also exist under src/daemon/steps/*/__tests__. A BUILD/TESTS record for s11 was committed in 2cd169d7 but did not reach this review's grounding, so do not read these as green. |
| MED | src/daemon/steps/daemon-client.ts:1 | The coverage evidence is empty, so it can't decide anything. All 70 changed entries are file-level diff stubs, and every testsReaching is empty, including the test files themselves and new modules that their own new tests import directly. Examples: daemon-client.ts is imported by in-daemon-client.test.ts, host.ts by step-host.test.ts, and resolve-repo.ts and analyze-oneshot.ts by step-context.test.ts. The empty testsReaching shows the graph has not been grounded yet. It does not show that the code is unexercised, so I report no HIGH not-exercised findings from it. Re-ground once the index has caught up, or judge coverage from a run of the suites. |
| LOW | src/daemon/index.ts:1923 | No unit or integration test runs the daemon's real start-up wiring: installStepDaemonClient(createInDaemonClient(rpcHandlers, streamHandlers)) and the 'step.call' entry in the stream handler map. step-host.test.ts builds its own IpcServer and handler maps instead, and the ac3 e2e test covers only a daemon without step.call. The only evidence for the production path is the three manual smoke checks of the installed daemon, recorded in S011/smoke.md (commit 284ce2c4). They are present as a record, not as runnable tests. |

## quality — 3 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/daemon/steps/analyze-oneshot.ts:65 | The allowed target and size values are written out three times in this file: the inline union types in `oneShotRunParams`, the `AnalyzeOneShotArgs` interface, and the `TARGETS`/`SIZES` arrays used by `checkOneShotArgs`. Adding a value in one place but not the others would let the runtime check reject a value the types accept, or the reverse. Derive the types from the arrays (`(typeof TARGETS)[number]`) so there is one source. |
| LOW | src/daemon/steps/daemon-client.ts:101 | `streamRequest` repeats the socket client's handling of stream frames: progress and delta go to `onFrame`, `done` resolves, an `error` frame becomes `ReviewStreamError('daemon-error', error, reason)`, and other frames are ignored. The parameter shaping for `workflow.review` and `codeReview.run` is repeated too. The shared types and reply helpers already live in `shared/review-stream.ts`, but the frame-to-failure mapping is now in two places, and the two clients could drift apart. That parity is guarded only by tests. |
| LOW | src/daemon/steps/daemon-client.ts:76 | `waitText` rounds to the nearest minute, so a 90-second limit is reported as '2 minutes' (and the test asserts this). The timeout message 'no result from the daemon within 2 minutes' then overstates how long the wait actually lasted. This only affects the wording of the message. |

