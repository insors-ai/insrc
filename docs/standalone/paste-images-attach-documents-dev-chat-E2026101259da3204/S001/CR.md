<!-- insrc:artifact CR-59da3204a44afd1b-s1 -->

# Code review: 59da3204a44afd1b:S001

⚠️ **WARN** — HIGH 0 · MED 3 · LOW 2 · model `claude:opus`

**Changed files:** 19

## adherence — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | vscode-plugin/src/chat/chat-panel.ts:1418 | The open-attachment handler resolves the id and calls att.open(ref.path) without first checking that the file still exists. The injected opener in extension.ts runs vscode.open directly and only logs a rejected command. For an attachment that is gone from disk, the click is therefore handed to VS Code (which may show its own file-not-found editor) rather than being detected by the host, logged and dropped. ChatAttachmentDeps has no stat seam and the host makes no stat call on the resolved path. |

## conventions — 0 finding(s)

_No findings._

## coverage — 4 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | vscode-plugin/src/chat/__tests__/chat-panel.test.ts:3828 | All 28 promised unit, integration and live tests are present by exact title in the changed test files (attachment-store, cli-adapter, protocol, session-file-store, render-registry, chat-panel, chat-shell, extension-chat-wiring, live-cli), but they are present but unverified: no build record is available and the suite was not run in this review, so no pass-state can be asserted. |
| MED | vscode-plugin/src/chat/__tests__/live-cli.test.ts:136 | The two promised live tests (live claude, live codex) are present but unverified: both are skip-gated on the LIVE flag and on the CLI binary being installed, so a default suite run skips them, and there is no build record showing they ran or passed. |
| MED | vscode-plugin/src/chat/chat-panel.ts:1 | The two promised smoke checks have no automated test in the changed set and no build record recording that they were carried out: the manual VS Code check (paste a screenshot, attach a document, chips, answer from content, chip click opens the file) and the whole-plugin-suite run. Both are unverified, not confirmed missing — they are manual or run-level checks by nature. |
| LOW | vscode-plugin/src/chat/attachment-store.ts:1 | The testsReaching grounding is hollow for this Story, so the empty edges are not reported as HIGH not-exercised gaps. The graph links only named helper functions; the top-level test(...) callbacks are anonymous and carry no edges, so symbols such as safeName, dirOf, nextPath, writing, changePending, submitTurn, runTurn, handleMessage, base64Bytes, findAttachment, postPending and the claude/codex argv builders show empty testsReaching even though titled tests in attachment-store.test.ts, chat-panel.test.ts, chat-shell.test.ts and cli-adapter.test.ts target exactly that behaviour (confirmed by a title search of the test files, not by reading test bodies or running them). Per-symbol coverage therefore cannot be confirmed from the graph; running the plugin suite is the way to settle it. |

## quality — 0 finding(s)

_No findings._

