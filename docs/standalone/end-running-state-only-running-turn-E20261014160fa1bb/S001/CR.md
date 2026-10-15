<!-- insrc:artifact CR-160fa1bb7a8604ad-S001 -->

# Code review: 160fa1bb7a8604ad:S001

✅ **PASS** — HIGH 0 · MED 0 · LOW 6 · model `claude:opus`

**Changed files:** 5

## adherence — 0 finding(s)

_No findings._

## conventions — 3 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | vscode-plugin/src/chat/__tests__/chat-panel.test.ts:4975 | presenterSpy's options parameter declares the optional prop `throwOn?: 'begin' \| 'result' \| 'end'` without `\| undefined`. Neighbouring helpers in the same file (attachHarness, and runShell in chat-shell.test.ts) spell their optional props as `?: T \| undefined`. This is test-helper code, and it may be older than this Story. |
| LOW | vscode-plugin/src/chat/__tests__/chat-panel.test.ts:5005 | presentedHarness's options parameter declares `store?:` and `hostPid?: number` without `\| undefined`. That departs from the explicit `\| undefined` idiom other harness helpers in the file use. |
| LOW | vscode-plugin/src/chat/__tests__/chat-queue-runner.test.ts:28 | spawningAdapter's `opts: { pipe?: boolean }` and harness's `{ pipe?: boolean; logs?: string[] }` (line 58) declare optional props without `\| undefined`. The test helpers are not consistent with the documented style for optional props. |

## coverage — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | vscode-plugin/src/chat/chat-panel.ts:706 | postInfo's new `info: true` on the closing done is exercised (dir-block and all-denied tests reach postInfo) but no assertion checks the flag. chat-panel.test.ts:2431 only checks that a done is posted. persistInfo's flag is asserted (chat-queue-runner.test.ts:410), and the page's `&&!m.info` branch is asserted both behaviourally (chat-shell.test.ts:641) and textually (chat-panel.test.ts:1828). If the flag were dropped from postInfo, the live-only informational lines (dir-block, all-denied, completed-batch notes) would end the running state again and no test would fail. Note: the graph's testsReaching edges were empty for all production symbols because the grounding is hollow. I judged coverage by running chat-shell, chat-queue-runner and chat-panel tests: 182/182 pass. |

## quality — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | vscode-plugin/src/chat/chat-panel.ts:715 | persistInfo posts the same closing `{ type: 'turn-event', event: { kind: 'done', turnId, ok: true }, info: true }` literal as postInfo, comment included. The fix had to be made twice, and a future change to how an informational line is closed (or a new info-posting helper) can miss one copy and bring the bug back. A small shared `closeInfo(turnId)` helper, called from both, would keep the `info` marking in one place. |
| LOW | vscode-plugin/src/chat/__tests__/chat-shell.test.ts:658 | The comment says a done with no `info` mark ends the turn "whatever its turn id", but the test never sends an unmarked done with a non-turn id such as 'queue-retry-…'. It only sends an error on 't2'. Either add that assertion, so a later change that keys the check on the turn-id prefix instead of the flag gets caught, or reword the comment to match what the test checks. |

