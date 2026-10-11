<!-- insrc:artifact CR-d6a4bc79bece9d1f-s1 -->

# Code review: d6a4bc79bece9d1f:s1

⚠️ **WARN** — HIGH 0 · MED 1 · LOW 3 · model `claude:opus`

**Changed files:** 13

## adherence — 0 finding(s)

_No findings._

## conventions — 0 finding(s)

_No findings._

## coverage — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | vscode-plugin/src/chat/session-lock.ts:1 | Caveat, not a coverage gap. The graph grounding has no test edges for any production symbol in this Story (session-lock.ts, cli-adapter.ts, chat-panel.ts, markers.ts, extension.ts): testsReaching is empty even for symbols the tests clearly exercise, like createMemorySessionLocks, createFileSessionLocks, stopProcess, runLeased, makeStreamAdapter and markerFor. The index has not linked the test files to the code they test, so I judged coverage by running the suite instead. All 15 tests the plan promised are present by exact name: session-lock.test.ts lines 56/92/153/225/280/309, cli-adapter.test.ts 252/277/318, markers.test.ts 164, chat-panel.test.ts 2279/2304/2331, and extension-chat-wiring.test.ts 217/233. The five changed test files ran 209 tests: 209 passed, 0 failed, 0 skipped. There is no build record, so these pass results come from this review's own run, not from the build. |

## quality — 3 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | vscode-plugin/src/chat/chat-panel.ts:123 | Avoidable complexity: createChatPanelHost is a single closure of about 900 lines (123 to ~1051) that directly calls 25 symbols. Session leasing (acquireSessionLease, runLeased), turn streaming (runTurn, appendEvent), title derivation (applyTitle, sanitizeTitle), permission and selection recording, and webview wiring all share one mutable closure scope. The concurrency-sensitive lease and generation logic (runTurn/acquireSessionLease with myGen) is therefore tangled with UI posting, so it is hard to reason about and to test in isolation. Consider moving the lease/turn lifecycle into its own module. |
| LOW | vscode-plugin/src/chat/session-lock.ts:365 | Complexity: createFileSessionLocks defines about 15 nested helpers (claimFile, stopHolder, fileLease, removeFile, unlinkIfUnchanged, holderAlive, goneWithin, sleep, etc.) inside one factory. It also wraps createMemorySessionLocks. The recent series of code-review fix commits (take-over and lease-token races) suggests this state machine is fragile. Lifting the pure helpers (recordText, parseRecord, sameProcess) to module scope would narrow the stateful core. |
| LOW | vscode-plugin/src/chat/cli-adapter.ts:1 | Taste: cli-adapter.ts and chat-panel.ts each define an inner `forget()`, and deriveChatTitle uses an inner helper named `stop(val)` that calls cancel. stopProcess and stopTurnProcess also exist, so these generic names make call-graph reading ambiguous. This is naming only, not a risk. |

## diagram — 0 finding(s)

_No findings._

