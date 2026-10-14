<!-- insrc:artifact CR-613abdb351c2c738-s5 -->

# Code review: 613abdb351c2c738:s5

⚠️ **WARN** — HIGH 0 · MED 2 · LOW 5 · model `claude:opus`

**Changed files:** 12

## adherence — 0 finding(s)

_No findings._

## conventions — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | vscode-plugin/src/chat/__tests__/chat-queue-outbox-host.test.ts:69 | The test helper `host(...)` declares its options as `{ closed?: boolean; noCli?: boolean; busy?: boolean }` with no explicit `\| undefined`. The rule says optional properties are written as `?: T \| undefined` (the plugin's tsconfig has exactOptionalPropertyTypes on), and the code this story changed in the same module follows it: `attachHarness` opts and `startTurn`/`runTurn` opts in chat-panel.ts. This line was added by this story (5bffd27f). It is a test-only helper, so the risk is small. |

## coverage — 3 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | vscode-plugin/src/chat/__tests__/chat-queue-outbox-host.test.ts:303 | The live hand check was not run, so it is present but unverified. The build commit 675c4596 says 'live hand check not run', and no reported result or evidence is recorded for it. This check is the only one that covers, against the real VS Code host: a review-pane decision waiting in the outbox behind a running turn, the chat opening when its panel is closed, and the chat not being offered when the queue is unavailable. |
| LOW | vscode-plugin/src/chat/__tests__/chat-queue-outbox-host.test.ts:303 | All 11 automated promised tests are present, each with a matching title: chat-queue-outbox-host.test.ts:303/332/356/373/394, docs-review-decision.test.ts:457, chat-queue-setup.test.ts:84, extension-chat-wiring.test.ts:348/361, review-wiring.test.ts:23 and attachment-store.test.ts:184. No build record was supplied, so none of them is confirmed as passing. Their pass state is unverified, not failing. |
| LOW | vscode-plugin/src/chat/chat-panel.ts:1 | The graph grounding for coverage looks hollow. It records testsReaching edges only between helpers inside test files. Every production symbol has an empty testsReaching list, including createChatPanelHost, createQueueFactory, classifyOpenFailure, chatIsOffered, createDocsReviewHost's decideNow/decisionResultLine and activate. Yet the promised tests that exercise these paths exist and are named for them (for example chat-queue-setup.test.ts:84 and chat-queue-outbox-host.test.ts:303-394). These are therefore not reported as HIGH not-exercised breaches. To confirm coverage, run the vscode-plugin suite rather than rely on the empty edges. |

## quality — 3 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | vscode-plugin/src/chat/chat-panel.ts:2150 | sendTyped still has the old direct path. When `worker` is undefined, it denies the waiting approvals (supersedeQueuedApprovals) and starts runTurn straight away, skipping the queue. Story S005 says there is no direct path when the queue cannot be opened (chat-queue-setup.ts header; extension.ts comment near line 584). In production the chat is gated off by chatIsOffered, so this branch only runs for a host built without `deps.queue`, mainly test harnesses. Two problems follow. The production send path and the path most tests use are different. And if the host is ever built without a queue, it silently goes back to the removed path instead of refusing. The `worker === undefined` cases at lines 2124 and 2206 refuse with 'unavailable'; this branch should do the same, or the dependency should be required. |
| LOW | vscode-plugin/src/chat/chat-queue-setup.ts:108 | The notice is chosen with a nested ternary inside the notify call, which also strips a hard-coded store message prefix with a regex. If the store's wording changes, the prefix silently stays in the notice. A small map from QueueOpenFailure to notice would be easier to read, and classifyOpenFailure could return the cleaned reason. This is readability only. |
| LOW | vscode-plugin/src/chat/chat-queue-setup.ts:34 | `err instanceof Error ? err.message : String(err)` is written out twice in this file (lines 34 and 105). The same logic already exists as a helper in another changed file. |

