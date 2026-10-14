<!-- insrc:artifact CR-613abdb351c2c738-s2 -->

# Code review: 613abdb351c2c738:s2

✅ **PASS** — HIGH 0 · MED 0 · LOW 8 · model `claude:opus`

**Changed files:** 2

## adherence — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | vscode-plugin/src/chat/chat-panel.ts:1245 | The '⌘/Ctrl+Enter to queue' hint is no longer its own element beside the message box. It is now written into the textarea's placeholder in setRunning, and the #insrc-qhint span and its .qhint styles are removed. A placeholder only shows while the box is empty, so the hint disappears as soon as the user starts typing the message they want to queue mid-turn, which is the moment it matters. The plan asks for the hint to be shown beside the message box while a turn runs. The test in chat-shell.test.ts was also changed to assert the placeholder and no longer checks for a separate hint element present only when the queue is on. |

## conventions — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | vscode-plugin/src/chat/__tests__/chat-shell.test.ts:503 | This changed assertion is indented with 4 spaces, while the lines around it in the same test block use 2. Whitespace only, with no effect on behaviour. |
| LOW | vscode-plugin/src/chat/chat-panel.ts:1245 | The idle placeholder text 'message claude… (⌘↵ send · ^C interrupt)' is now written twice: once in the static textarea markup at line 1379 and again as a \u-escaped literal inside setRunning. If either copy is edited alone, the placeholder shown after a turn finishes will differ from the one shown on first load. Reading it back from the textarea at startup, or using one shared constant, would keep a single copy. |

## coverage — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | vscode-plugin/src/chat/__tests__/chat-shell.test.ts:498 | The queue hint now replaces the input's placeholder instead of using a separate #insrc-qhint span. The queue-on path is covered: the placeholder swaps to '⌘/Ctrl+Enter to queue' while a turn runs and is restored to '⌘↵ send' after the turn ends and after a queued submit. The queue-off path is no longer covered. The removed 'insrc-qhint' check had no replacement, so nothing asserts that without the queue the shell html leaves out the queue placeholder text or setRunning's placeholder swap. A fix: add 'Ctrl+Enter to queue' to the list of strings that must be absent. All 18 promised tests were checked. The 16 automated ones are present and pass locally: chat-shell 9/9; chat-queue-store, chat-queue-worker, chat-queue-outbox-host, chat-outbox and protocol 30/30. The two smoke items are manual and were not checked. |

## quality — 3 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | vscode-plugin/src/chat/chat-panel.ts:1245 | The idle placeholder text is now written in two places: as the textarea's static `placeholder` attribute in the shell markup (line 1379, as literal ⌘↵/…/·) and again, \u-escaped, inside setRunning's restore branch. If one copy changes and the other doesn't, the placeholder after the first queued-mode turn will differ from the one first shown, and the S001 placeholder test (chat-panel.test.ts:1945) only checks the static copy. Suggested fix: build both strings from one host-side constant, or have setRunning read the textarea's initial placeholder (for example, store `ib.dataset.idle` at load). |
| LOW | vscode-plugin/src/chat/__tests__/chat-shell.test.ts:503 | Layout only: the 'the band sits above the input bar' assert is indented by 4 spaces instead of 2. This is a leftover from removing the qhint assertions. |
| LOW | vscode-plugin/src/chat/__tests__/chat-shell.test.ts:498 | The test is still named for a queue shortcut hint that is 'present only with the queue', but the no-queue branch no longer checks that the hint is absent. Before this change it asserted that 'insrc-qhint' was missing. The equivalent check now would be that the no-queue HTML never contains 'Ctrl+Enter to queue', so setRunning cannot swap in the queue placeholder when the queue is off. Without it, a regression that drops the `queueOn` gate would pass. |

## ux — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | uxDefinition:description | 2 elements of uxDefinition have no description and show an em dash on its companion page: #1 insrc chat — outbox (Epic 613abdb3 S002), #9 Theme colours only (VS Code variables); rows are drawn wi.... |

