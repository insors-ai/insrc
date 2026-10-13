<!-- insrc:artifact CR-c2ba6fa62a148ed1-s11 -->

# Code review: c2ba6fa62a148ed1:s11

⚠️ **WARN** — HIGH 0 · MED 2 · LOW 4 · model `claude:opus`

**Changed files:** 73

## adherence — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/mcp/server.ts:37 | The plan's t10 and the LLD's sampling-retirement entry say to delete src/mcp/progress-forward.ts and src/mcp/__tests__/progress-forward.test.ts, because nothing outside the tests uses them. Both files are still in the tree. server.ts now imports mcpProgressSink from it to pass the forwarders' progress frames to the client. The reuse may be reasonable, but it departs from the approved deletion, and the plan does not record the change. Either delete the module and move the relay into forward-step.ts, or record the decision to keep it. |

## conventions — 0 finding(s)

_No findings._

## coverage — 3 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/mcp/__tests__/mcp-process-e2e.test.ts:67 | Every promised test is present, but none can be confirmed as passing. There is no build record, and running the suite here was refused by the permission gate. All 28 promised repo-level tests were found by title. Examples: in-daemon-client.test.ts (timeout, abort, daemon-error, no-loopback), step-context.test.ts, step-host.test.ts, forward-step.test.ts, import-graph.test.ts, sampling-retired.test.ts, review-stream.test.ts, live-store-owner/refusal, live-vector-store-owner, no-live-*-in-tests, mcp-process-refused.test.ts and mcp-process-e2e.test.ts (ac2/ac3/ac5/lsof). Their pass-state is unverified, not failing. |
| MED | src/daemon/index.ts:1899 | Not confirmed whether any test reaches the production wiring in index.ts: the step.call stream registration, the lazy getStepCallHandler, and installStepDaemonClient(createInDaemonClient(rpcHandlers, streamHandlers)) before new IpcServer. step-host.test.ts copies this registration by hand ('as index.ts registers them') rather than loading index.ts. Only the real-daemon e2e (mcp-process-e2e ac2/ac5) would reach it, and whether it boots this entry point, and whether it passes, is unverified. testsReaching is empty, but that grounding is file-level diff entities and is hollow, so this is not a breach. |
| LOW | src/mcp/forward-step.ts:1 | The three promised smoke tests have no test in the grounding and no build record shows that they were run. They are: an analysis through a restarted client session; a workflow step continuing after an MCP restart; and lsof showing only the daemon on the store files and the lance directory. They are manual installed-daemon checks, not repo tests, so their absence from the repo is expected. Still, nothing records them as done. |

## quality — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/daemon/steps/__tests__/step-host.test.ts:190 | The test helpers `untilAborted`, `CREATED`, `GROUNDING` and the code-review subject/deps fixture (`crDeps`) are copied almost verbatim from in-daemon-client.test.ts. If the fixture shape changes, the two copies can drift apart. They could move into a shared __tests__/helpers module. This is a maintenance point and does not affect behaviour. |
| LOW | src/daemon/steps/host.ts:72 | `{ ...table, ...opts.tools }` spreads a `Partial<Record<string, StepToolRunner>>`, so a key passed with the value `undefined` overwrites a real runner. `Object.hasOwn(table, tool)` then still accepts that tool, and `table[p.tool]!` is undefined at the call. The resulting TypeError is caught and reported as an unclear 'step-failed' instead of 'step-unknown-tool'. This only affects the test seam. Removing undefined entries before the spread, or checking `typeof run === 'function'`, would fix it. |

