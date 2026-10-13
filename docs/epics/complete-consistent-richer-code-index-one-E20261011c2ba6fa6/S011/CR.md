<!-- insrc:artifact CR-c2ba6fa62a148ed1-s11 -->

# Code review: c2ba6fa62a148ed1:s11

⚠️ **WARN** — HIGH 0 · MED 1 · LOW 6 · model `claude:opus`

**Changed files:** 73

## adherence — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/daemon/index.ts:1924 | The LLD says the daemon should build the in-daemon client from the two handler maps and hand it to the step host when the host is created. The code builds the client from those maps but does not pass it to the host. Instead it sets a module-level global with installStepDaemonClient(...), and the moved handlers read that global through stepDaemonClient() in src/daemon/steps/daemon-client.ts. As a result, createStepCallHandler()/stepToolTable() in src/daemon/steps/host.ts take no client. Any step handler run in a process that never called the installer throws 'no daemon client is installed', and the tests have to install the global and remove it again (step-host.test.ts, in-daemon-client.test.ts). Each call still reaches the same handler functions in-process, so behaviour is the same; the departure is in how the client is wired, not in what it does. |

## conventions — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/daemon/steps/analyze-oneshot.ts:86 | The inline return type of `runAnalyzeOneShot` declares `isError?: boolean` without `\| undefined`. The repo's documented convention under exactOptionalPropertyTypes is to declare optional properties as `\| undefined` explicitly, and the interfaces in this same change do so (e.g. `StepEnvelope.isError?: boolean \| undefined` in host.ts). The function is returned from the `insrc_analyze` entry in the host's `StepToolRunner` table, so this return shape should match the `StepEnvelope` declaration. |
| LOW | src/daemon/index.ts:67 | The `_stepCallHandler` module variable and the `getStepCallHandler` function are declared partway through the import block: the `import { listModels } ...` statement and the imports after it follow them. The module's layout puts all imports first and declarations after. ES imports are hoisted, so this works, but it breaks the file's structure. Move the two declarations below the last import. |

## coverage — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/daemon/steps/__tests__/step-host.test.ts:1 | Present but unverified, not missing. All 31 promised tests have a matching test in the tree: step-context, in-daemon-client, step-host and workflow-rpc-imports under src/daemon/steps/__tests__; forward-step, import-graph, sampling-retired, mcp-process-refused and mcp-process-e2e under src/mcp/__tests__; the live-store and live-vector-store owner and refusal tests under src/db; and src/shared/__tests__/review-stream.test.ts. Their pass state could not be confirmed. No build record was supplied, and this sandbox refused to run the suites. Every testsReaching list is empty, and that is a known gap in the graph grounding for newly created or moved files (the diff entries are whole files, with no symbol rows). It is not evidence that the changed code goes untested. Each changed module is directly imported and exercised by the new tests: host.ts, daemon-client.ts, analyze-oneshot.ts, resolve-repo.ts, the stepCwd change in scope.ts, and currentClientProviderKind in shaper-provider.ts. The deleted sampling provider and its tests need no coverage. Before completion, run the listed files under Node 22 to confirm they pass. |

## quality — 3 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/daemon/steps/daemon-client.ts:99 | createInDaemonClient's streamRequest re-implements the review-stream state machine of the socket client: the timeout with a waitText message, outer-signal abort mapped to 'aborted', 'progress'/'delta' forwarded to onFrame, 'done' resolving, and an 'error' frame mapped to ReviewStreamError('daemon-error', error, reason). The per-method param shaping for workflow.review and codeReview.run is copied too. The shared parts (groundingFromReply, freshnessFromReply, unavailableFromError) were moved into src/shared/review-stream.ts, but the frame-to-failure mapping was not. If someone changes a failure code, the timeout wording or the param shape in one client and not the other, the two transports drift apart. in-daemon-client.test.ts only checks that they are equivalent for today's cases. Suggested fix: move the frame classifier (a frame in, resolve/reject/onFrame out) and the request-param builders into src/shared/review-stream.ts, and have both transports call them. |
| LOW | src/daemon/steps/host.ts:63 | stepToolTable passes the step.call stream signal only to the review and code-review runners. insrc_analyze, insrc_analyze_step, insrc_workflow_step, insrc_build_step and insrc_triage drop it, so when the MCP forwarder disconnects or cancels, these handlers keep running in the daemon. That includes long serial LLM pipelines such as a one-shot analyze or a workflow synthesize. Before this change they ran in the MCP process and died with it. The daemon now holds a run that nobody will read, and a retried call starts a second run alongside it. The comment says this is deliberate, but it is a real change in behaviour. |
| LOW | src/daemon/steps/__tests__/step-host.test.ts:192 | The test helpers untilAborted() (a stream handler that blocks until its signal is aborted) and the crDeps / crSubject code-review deps fixture are copied almost word for word in both new test files. A shared helper under src/daemon/steps/__tests__/helpers would keep the two cancellation suites in step. |

