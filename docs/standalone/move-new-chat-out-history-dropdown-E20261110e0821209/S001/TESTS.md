<!-- insrc:artifact TESTS-e0821209d94791d0-s1 -->

# Tests: e0821209d94791d0 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## s1

Run at 2026-11-11T04:37:48.073Z on commit `d7affcde9`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: vscode-plugin/src/chat/__tests__/chat-panel.test.ts — update the 'regression: the history trigger still opens/new-chats…' test (lines ~2011-2021): newChatPick still posts {type:'new-chat',provider:curProv||''}, now triggered by the #insrc-newchat click listener; renderHistoryMenu output contains no 'new…'/'starts a new chat' row**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | regression: the history trigger still opens/new-chats, and session-restored still clears + replays | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**unit: vscode-plugin/src/chat/__tests__/chat-panel.test.ts — update the '#insrc-history session dropdown' markup test (line ~2337): .right contains <button id="insrc-newchat"> BEFORE <span class="histchip">; the button carries the bubble-plus SVG in its .pico slot and aria-label/title 'new chat'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | UI: the #insrc-history session dropdown carries a leading history/clock glyph so its purpose reads | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**unit: vscode-plugin/src/chat/__tests__/chat-panel.test.ts — add assertions: doesNotMatch 'starts a new chat'; match on id="insrc-newchat" click wiring calling newChatPick; match on the bubble path + plus strokes of the icon SVG**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | regression: the history trigger still opens/new-chats, and session-restored still clears + replays | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | UI: the #insrc-history session dropdown carries a leading history/clock glyph so its purpose reads | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**integration: vscode-plugin/src/chat/__tests__/chat-panel.test.ts — existing new-chat host tests (representative sample: lines 229, 648, 659, 735, 792, 869, 1101, 1144, 1573, 3514, 3952, 4431, 4505, 4524, 4619) run unchanged; the guarantee is ac5’s full-suite run, not this enumerated list. Cross-file note: chat-shell.test.ts:717-724 renders the same .right/.histchip chrome with an index-based assertion (histAt > rightAt) that still holds after the insertion — verified unaffected**

Not mapped: no test case was named for this test, and nothing was run for it.

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` | 0 | 233 | 10.7 s |  |
