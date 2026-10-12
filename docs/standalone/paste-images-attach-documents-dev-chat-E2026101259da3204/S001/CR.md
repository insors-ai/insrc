<!-- insrc:artifact CR-59da3204a44afd1b-S001 -->

# Code review: 59da3204a44afd1b:S001

⛔ **BLOCK** — HIGH 2 · MED 1 · LOW 6 · model `claude:opus`

**Changed files:** 17

## adherence — 0 finding(s)

_No findings._

## conventions — 4 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | vscode-plugin/src/chat/__tests__/chat-panel.test.ts:3784 | `attachHarness(opts: { adapter?: StreamAdapter; wrapStore?: (store: AttachmentStore) => AttachmentStore } = {})` declares optional properties without the explicit `\| undefined` the rule requires. Production code in the same module follows the rule (e.g. `runTurn` opts `suppressEcho?: boolean \| undefined`, `attachments?: readonly AttachmentRef[] \| undefined` in chat-panel.ts). Test-helper only, so low impact. |
| LOW | vscode-plugin/src/chat/__tests__/chat-shell.test.ts:40 | `runShell(opts: { attach?: boolean } = {})` declares the optional `attach` property without `\| undefined`. Test-helper only. |
| LOW | vscode-plugin/src/chat/__tests__/chat-shell.test.ts:183 | `pasteEvent(items: Array<{ kind: string; type: string; file?: { type: string; name: string; dataUrl: string } }>)` declares the optional `file` property without `\| undefined`. Test-helper only. |
| LOW | vscode-plugin/src/chat/session-store.ts:273 | `createInMemoryChatSessionStore(deps?: { now?: () => string; genId?: () => string; maxSessions?: number })` (lines 273-275, and the same shape on `MementoStoreDeps` at lines 134/135/141) omits `\| undefined` on optional properties, unlike `deriveChatTitle`'s `timeoutMs?: number \| undefined` in cli-adapter.ts. Reported as an observation, not a breach: I could not confirm this Story introduced these lines (git blame was not available), and they look like they predate the attachment work. |

## coverage — 5 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| HIGH | vscode-plugin/src/chat/cli-adapter.ts:500 | Promised live test is missing. vscode-plugin/src/chat/__tests__/live-cli.test.ts holds four live tests (terminal sc2 event for claude and codex, claude review-mode approval, claude auto mode) and none builds a request with readDirs or asks about an image and a text file in the attachments directory. The `--add-dir` argv is only checked as a string by the unit test in cli-adapter.test.ts:1342; nothing checks that a real claude reads the attached files. |
| HIGH | vscode-plugin/src/chat/cli-adapter.ts:500 | Promised live test is missing. No test in live-cli.test.ts (or anywhere under vscode-plugin/src) runs a real codex turn against files in the attachments directory. The only codex coverage for this Story is the unit test 'codex argv is unchanged by readDirs' (cli-adapter.test.ts:1395), which shows the argv is unchanged, not that codex can read the attached files. |
| MED | vscode-plugin/src/extension.ts:453 | Present but failing/unverified. I ran the whole plugin suite (`npx tsx --test 'src/**/__tests__/*.test.ts'` in vscode-plugin): 1161 tests, 1150 pass, 2 fail, 5 cancelled, 4 skipped. The 2 failures are the two manifest-catalog tests the plan excepts (794, 795). The 5 cancelled are not excepted: in src/__tests__/activation.test.ts, 'runReachabilityProbe degrades a hung probe to errored within the bounded deadline' ends with 'Promise resolution is still pending but the event loop has already resolved' and the four tests after it are cancelledByParent, including 'only extension.ts imports vscode…', which reads the extension.ts this Story changed. The same result reproduces running that file alone. activation.ts is not in this Story's changed set, so this is probably older than the Story, but I could not check git history to confirm; the promise 'every test passes apart from the two manifest-catalog tests' does not hold as run. |
| LOW | vscode-plugin/src/extension.ts:453 | Present but unverified. The in-VS-Code smoke check is manual and there is no build record, so there is no evidence it was performed. Its parts are covered separately by passing automated tests (shell paste/chips at chat-shell.test.ts:199 and :339, host submit at chat-panel.test.ts:4064, wiring at extension-chat-wiring.test.ts:291), but 'the assistant answers from their content' is only reachable through this smoke check or the two missing live tests. |
| LOW | vscode-plugin/src/chat/attachment-store.ts:1 | Grounding caveat, not a gap. The testsReaching edges are hollow for this Story: top-level `test(...)` callbacks are not graph entities, so symbols such as safeName, nextPath, writing, changePending, submitTurn, runTurn, handleMessage, base64Bytes and findAttachment show empty testsReaching although tests do drive them. I did not raise HIGH findings from those empty edges. Instead I checked the test files and ran the suite: all 26 promised unit and integration tests exist under their exact promised names (attachment-store.test.ts ×5, cli-adapter.test.ts ×2, protocol.test.ts, session-file-store.test.ts, render-registry.test.ts, chat-panel.test.ts ×12, chat-shell.test.ts ×3, extension-chat-wiring.test.ts) and all 26 passed in my run. This is by test name and pass state; I did not trace each changed symbol to an assertion. |

## quality — 0 finding(s)

_No findings._

