<!-- insrc:artifact TESTS-57a2ba4d5f18c356-s1 -->

# Tests: 57a2ba4d5f18c356 S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## S001

Run at 2026-10-14T19:46:10.493Z on commit `0ad6fec4`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: chat-panel.test.ts: renderShell embeds one #insrc-progress widget above the input that is not hidden and starts idle (an idle class and the label 'idle'), and the [hidden] rule is gone**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | S002 ac3: renderShell embeds a single #insrc-progress widget above the input, not hidden and starting idle | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**unit: chat-panel.test.ts: the done/error handler, the Stop click and session-restored call setIdle, and no script path sets the widget hidden**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | S002 ac3: renderShell embeds a single #insrc-progress widget above the input, not hidden and starting idle | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S002 (ux-polish) ac1/ac2/t3: the leading ">" prompt (#insrc-prompt) is the send/stop control; the trailing #insrc-send button is retired | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | chat shell: the progress widget is never hidden: idle at the start, working after turn-running, idle after done, error, Stop and session-restored | `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` |

**unit: chat-shell.test.ts: driving the page, a turn-running message makes the widget working (no idle class, label 'working…'), a done event makes it idle with the timer stopped and the elapsed text empty, and the widget is never hidden at any step**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | chat shell: the progress widget is never hidden: idle at the start, working after turn-running, idle after done, error, Stop and session-restored | `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` |

**unit: chat-theme.test.ts: the widget keeps its background, border and dot colour, and the idle variant and its slower animation exist, with reduced motion stopping both**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | chat theme: the progress widget keeps its colours, and its idle variant has its own slower animation that reduced motion stops | `vscode-plugin/src/chat/__tests__/chat-theme.test.ts` |

**unit: chat-theme.test.ts compares the shell's selectors with chat-theme-before.json (it fails on any removed or renamed selector and pins the exact list of added ones): the removal of `#insrc-progress[hidden]` is made an intended removal (its entry in chat-theme-before.json is updated or exempted) and the new `#insrc-progress.idle` selectors and any new keyframes are added to the added-selector list**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | chat theme: every selector and element id of the shell and the row renderer from before the change is still present, the added selectors are exactly the listed ones, and the shell is still one nonce'd inline script under the same policy | `vscode-plugin/src/chat/__tests__/chat-theme.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` | 0 | 159 | 4.3 s |  |
| `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` | 0 | 11 | 0.5 s |  |
| `vscode-plugin/src/chat/__tests__/chat-theme.test.ts` | 0 | 9 | 0.4 s |  |
