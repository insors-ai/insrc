<!-- insrc:artifact CR-7fefc3fc5c51793e-S001 -->

# Code review: 7fefc3fc5c51793e:S001

⛔ **BLOCK** — HIGH 1 · MED 2 · LOW 3 · model `claude:opus`

**Changed files:** 7

## adherence — 0 finding(s)

_No findings._

## conventions — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | vscode-plugin/src/chat/__tests__/chat-panel.test.ts:824 | The `editPrompts` return type declares the optional property `review?: boolean` without the explicit `\| undefined` the strict-optional rule requires (the same shape is repeated in the cast on line 825). Other changed signatures in this Story follow the rule (e.g. `runTurn` opts `suppressEcho?: boolean \| undefined`, `attachHarness` opts `adapter?: StreamAdapter \| undefined`). Test-only helper, so impact is low; whether this line was introduced by this Story or predates it was not verified. |

## coverage — 4 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| HIGH | vscode-plugin/src/chat/render-registry.ts | `toViewModel(entry)` has an empty testsReaching set and no callers at all in the graph, so no test reaches it directly or transitively. render-registry.test.ts reaches only `renderRegistryWebviewSource` (via `makeRegistry`). If this Story changed the row view-model mapping, that change is not exercised. |
| MED | vscode-plugin/src/chat/chat-panel.ts | The theme-carrying shell path — `renderShell`, `attr`, and `renderMarkdownStyle` in markdown-style.ts — has empty testsReaching. It is reachable only transitively: chat-theme.test.ts `shellHtml` -> `createChatPanelHost` -> `renderShell` -> `renderMarkdownStyle`/`attr`. Coverage is present but unverified: no test reaches these symbols directly, and with no build record the pass-state of chat-theme.test.ts cannot be confirmed. |
| MED | vscode-plugin/src/chat/chat-panel.ts | `handleMessage` and `run` have empty testsReaching and no callers in the graph; the other closures inside `createChatPanelHost` (for example `runTurn`, `submitTurn`, `postInitialState`, `wireChannel`, `enqueueApproval`, `changePending`) also have empty testsReaching and are reachable only transitively through `createChatPanelHost` <- `shellHtml`. The grounding looks hollow rather than showing a real gap: the chat-panel.test.ts helpers (`mk`, `fidelityHtml`, `attachHarness`) show no `createChatPanelHost` callee edge, so callback-dispatched paths are probably not captured by the graph. Treat as present but unverified, not as no test; running the suite is needed to confirm. |
| LOW | vscode-plugin/src/chat/__tests__/chat-theme.test.ts | No build record is available, so the pass-state of every reaching test (chat-theme.test.ts, chat-panel.test.ts, render-registry.test.ts) is unverified. The tests that reach `createChatPanelHost` and `renderRegistryWebviewSource` are present but unverified, not confirmed passing. |

## quality — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | vscode-plugin/src/chat/__tests__/chat-theme.test.ts:1 | Possible duplication, judged from symbol summaries only (no line number was available, so the location is anchored to the top of the file). `shellHtml(): string` builds the chat shell HTML from an in-memory session store, which looks like the same setup as `fidelityHtml(): string` in chat-panel.test.ts (and `mk`, which wires the same store/channel/adapter/registry). If the two fixtures really do the same thing, a shared test helper would stop them drifting apart. This is a test-only maintenance note, not a correctness risk, and should not block the Story. |

