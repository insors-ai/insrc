<!-- insrc:artifact CR-57a2ba4d5f18c356-s1 -->

# Code review: 57a2ba4d5f18c356:S001

⛔ **BLOCK** — HIGH 1 · MED 0 · LOW 5 · model `claude:opus`

**Changed files:** 5

## adherence — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | vscode-plugin/src/chat/chat-panel.ts:1013 | The idle style only changes the dots' animation (insrc-breathe, opacity .20 to .65). It does not give the idle dots the muted colour: they keep `background:var(--progress)` from the base `#insrc-progress .spin i` rule, so the idle dots are the same colour as the working ones, only dimmer. The label already inherits `color:var(--muted)` from the widget in both states, so idle has no distinct muted colour of its own. Fix: add `background:var(--muted)` to the `#insrc-progress.idle .spin i` rule. Alternatively, if 'muted' meant only the dimmer opacity, record that reading in the LLD. |

## conventions — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | vscode-plugin/src/chat/__tests__/chat-panel.test.ts:4975 | The `presenterSpy` options object declares `throwOn?:` without an explicit `\| undefined`. The documented rule requires optional properties to be written `\| undefined` under exactOptionalPropertyTypes. This test helper may be older than this Story. |
| LOW | vscode-plugin/src/chat/__tests__/chat-panel.test.ts:5005 | The `presentedHarness` options object declares `store?:` and `hostPid?: number` without an explicit `\| undefined`. Other helpers in the same file follow the rule, for example `attachHarness` (`adapter?: StreamAdapter \| undefined`) and chat-shell's `runShell`. This test helper may be older than this Story. |

## coverage — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| HIGH | vscode-plugin/src/chat/chat-panel.ts:1381 | The Story's changed behaviour is all in the webview shell that renderShell emits: the progress widget is no longer hidden and starts with class 'progress idle' and the label 'idle'; the idle 'breathe' CSS and its reduced-motion override are new; and setIdle() replaces hideProgress() on done/error, session-restored and user cancel. In the provided grounding renderShell (and its enclosing createChatPanelHost) has an EMPTY testsReaching, so no test is shown reaching it. The test-side harnesses that build this HTML (chat-shell.test.ts runShell, chat-theme.test.ts shellHtml) carry no edge to renderShell or createChatPanelHost, so the graph cannot confirm that any test exercises the always-visible/idle widget. This may be a missing graph edge rather than a real gap, but on the evidence provided it counts as not exercised. No build record is available, so no test's pass state can be confirmed. |

## quality — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | vscode-plugin/src/chat/chat-panel.ts:1273 | The idle state is written in two places: the initial markup at line 1385 (class="progress idle", label 'idle') and setIdle() at line 1273. If one changes and the other doesn't, the first paint and later idle states will differ. Calling setIdle() once at script start (beside setRunning(false)) would leave only one definition. This is a drift risk, not a current defect. |
| LOW | vscode-plugin/src/chat/chat-panel.ts:1262 | The edited comment now reads '...setIdle puts it in its idle state (it is never hidden). It is never written to the transcript', so 'It is never' appears twice in a row and is easy to misread. Wording only. |

