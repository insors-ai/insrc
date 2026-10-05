<!-- insrc:artifact CR-1716f77ba9ba017b-S001 -->

# Code review: 1716f77ba9ba017b:S001

⚠️ **WARN** — HIGH 0 · MED 1 · LOW 6 · model `claude:opus`

**Changed files:** 74

## adherence — 0 finding(s)

_No findings._

## conventions — 0 finding(s)

_No findings._

## coverage — 4 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/daemon/__tests__/workflow-review-rpc.test.ts:1 | Missing or unverifiable: the two promised live-level tests have no test in the changed set. No changed test file is gated on INSRC_LIVE_TESTS for this Story; the only live suites under the daemon and review test directories are analyze-rpc.live.test.ts and calibration.live.test.ts, both pre-existing and unrelated. If these were run by hand, the evidence would sit in the build record, and none was supplied. The 10 minute limit this check was meant to time was later raised to 30 minutes (commit 1739ed1). |
| LOW | src/mcp/review-step/__tests__/review-step-routing.test.ts:139 | Present but differs from the promise: the plan promised a wait limit of 11 minutes for a design and 10 for a DEF. The test asserts 11 minutes for a design and 30 minutes for a DEF, matching commit 1739ed1. The test follows the code, so the plan's promised name is stale rather than the behaviour untested; the plan or LLD should be amended to record the 30 minute limit. |
| LOW | src/workflow/__tests__/other-party-review-gate.test.ts:1 | Present but unverified: every other promised test (T1-T18) was found by name in the changed test files, but no pass-state is confirmed. No build record was supplied and my attempt to run the suites was denied by the permission mode. This includes the promise that the workflow and MCP suites pass with every approving test moved onto the helper: 17 seed/write helpers do call stampOtherPartyReview, but the suites were not run. Run `npx tsx --test 'src/workflow/**/*.test.ts' 'src/mcp/**/*.test.ts' 'src/daemon/**/*.test.ts'` under Node 22 to confirm. |
| LOW | src/workflow/gates.ts:1 | Grounding caveat, not a coverage gap: most changed production symbols show an empty testsReaching (approveArtifactByJsonPath, otherPartyReviewGap, reviewerPartyOf, handleReviewStep, handleStart, reviewByDaemon, reviewArtifactFile, reviewStreamRequest, stampAuthor and others), but the graph records only calls made from named helper functions, not from top-level test() callbacks. Named tests that exercise them directly were found: other-party-review-gate.test.ts (T5-T8, T18), party.test.ts (T1), review-step-routing.test.ts (T9, T11, T12, T14), same-party-refusal.test.ts (T15), review-stream.test.ts (T11), author-stamp.test.ts (T2). I therefore raised no not-exercised HIGH findings from the empty edges. |

## quality — 3 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/daemon/code-review-rpc.ts:215 | Duplication: `modelLabelFor(cfg, repoOverride, clientDefault): string` has the same signature and the same single callee (`resolveShaperKind`) as the function of the same name in src/daemon/workflow-rpc.ts:570. Two private copies of the provider-to-model-label mapping can drift, so a review record and a workflow artifact could label the same resolved provider differently. Export one and import it in the other. Rated LOW because the bodies were not compared and the summaries do not show whether this Story introduced the copy. |
| LOW | src/mcp/daemon-stream.ts:430 | Duplication: `reviewStreamRequest` carries its own socket-lifecycle helpers (`finish`, `onAbort`, `failWith`) alongside the `cleanup`/`finish`/`onAbort`/`onData` set that `runWorkflowStream` already has in the same file. The two NDJSON stream clients look like parallel implementations of connect, frame-parse, abort and settle-once, so a fix to one (for example a partial-line or abort race) will not reach the other. Consider one shared stream core parameterised by the terminal-frame handler. Inferred from the call edges only; the bodies were not compared. |
| LOW | src/mcp/workflow-step/phases/synthesize.ts:133 | Duplication: `formatFailure` here renders a `ValidationResult` failure, and src/daemon/workflow-rpc.ts:585 has a `formatFailure` over the same structural shape (`ok`/`message`/`details`). The controller synthesize path and the daemon run path therefore format the same finalize failure with separate code, and the retry message a model sees can differ by party. Likely predates this Story; sharing one helper would remove the drift. |

