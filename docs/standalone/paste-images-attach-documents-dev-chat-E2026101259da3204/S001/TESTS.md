<!-- insrc:artifact TESTS-59da3204a44afd1b-S001 -->

# Tests: 59da3204a44afd1b S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 23 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-12T10:25:29.172Z on commit `744692cd`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: attachment store: addBytes and addFile write into the session's own directory under a safe numbered name and return id, original name, kind, size and path**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | attachment store: addBytes and addFile write into the session's own directory under a safe numbered name and return id, original name, kind, size and path | `vscode-plugin/src/chat/__tests__/attachment-store.test.ts` |

**unit: attachment store: an oversize paste or file, a mime outside the image list and a source that is not a regular file are refused with AttachmentRefused and nothing is written**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | attachment store: an oversize paste or file, a mime outside the image list and a source that is not a regular file are refused with AttachmentRefused and nothing is written | `vscode-plugin/src/chat/__tests__/attachment-store.test.ts` |

**unit: attachment store: remove ignores an id that is not a plain file name in the session's directory, and remove and removeSession succeed when the target is gone**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | attachment store: remove ignores an id that is not a plain file name in the session's directory, and remove and removeSession succeed when the target is gone | `vscode-plugin/src/chat/__tests__/attachment-store.test.ts` |

**unit: attachment store: sweep removes only directories of sessions not kept whose files are all older than the age**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | attachment store: sweep removes only directories of sessions not kept whose files are all older than the age | `vscode-plugin/src/chat/__tests__/attachment-store.test.ts` |

**unit: attachment store: a failed write leaves no partial file**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | attachment store: a failed write leaves no partial file | `vscode-plugin/src/chat/__tests__/attachment-store.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/attachment-store.test.ts` | 0 | 5 | 0.3 s |  |

## t2

Run at 2026-10-12T10:26:41.260Z on commit `a6d0523c`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: claude argv: readDirs adds --add-dir with each directory before the permission flags and the prompt stays last after --; without readDirs the argv is byte-identical to today**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | claude argv: readDirs adds --add-dir with each directory before the permission flags and the prompt stays last after --; without readDirs the argv is byte-identical to today | `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` |

**unit: codex argv is unchanged by readDirs**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | codex argv is unchanged by readDirs | `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` | 0 | 78 | 1 s |  |

## t3

Run at 2026-10-12T10:27:54.366Z on commit `d4b9cda4`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: protocol: the four new webview messages and attachments-pending are in the type lists, and user-row carries attachments**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | protocol: the four new webview messages and attachments-pending are in the type lists, and user-row carries attachments | `vscode-plugin/src/chat/__tests__/protocol.test.ts` |

**unit: session file store: a user row with attachments round-trips unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | session file store: a user row with attachments round-trips unchanged | `vscode-plugin/src/chat/__tests__/session-file-store.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/protocol.test.ts` | 0 | 9 | 0.3 s |  |
| `vscode-plugin/src/chat/__tests__/session-file-store.test.ts` | 0 | 19 | 0.3 s |  |

## t4

Run at 2026-10-12T10:29:58.252Z on commit `645bbd99`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: render registry: a user row with attachments renders a chip per attachment with textContent only, a click calls the open sink with the attachment's id, and a row without attachments renders as today**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | render registry: a user row with attachments renders a chip per attachment with textContent only, a click calls the open sink with the attachment's id, and a row without attachments renders as today | `vscode-plugin/src/chat/__tests__/render-registry.test.ts` |
| pass | parity: eval(webview toViewModel) equals host toViewModel for every sample (drift fails build) | `vscode-plugin/src/chat/__tests__/render-registry.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/render-registry.test.ts` | 0 | 71 | 0.3 s |  |

## t5

Run at 2026-10-12T10:33:34.975Z on commit `7b24b330`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: host: attach-image and pick-attachments add to the active session's pending list and post attachments-pending; remove-attachment removes one; errors are posted as one sentence and the list is unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | host: attach-image and pick-attachments add to the active session's pending list and post attachments-pending; remove-attachment removes one; errors are posted as one sentence and the list is unchanged | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**integration: host: ready, new-chat and open-chat post each session's own pending list; an unknown or foreign attachment id in remove or open does nothing; open-attachment opens the resolved path of a row's or a pending attachment**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | host: ready, new-chat and open-chat post each session's own pending list; an unknown or foreign attachment id in remove or open does nothing; open-attachment opens the resolved path of a row's or a pending attachment | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**integration: host without the attachments seams: the shell has no attach button or chip row and the four messages are ignored**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | host without the attachments seams: the shell has no attach button or chip row and the four messages are ignored | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**integration: host: an attach-image whose base64 length implies more than the limit is refused without decoding and without calling the store**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | host: an attach-image whose base64 length implies more than the limit is refused without decoding and without calling the store | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**integration: host: a dismissed dialog posts nothing, and a pick over the limit keeps the first ten and posts one error sentence**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | host: a dismissed dialog posts nothing, and a pick over the limit keeps the first ten and posts one error sentence | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` | 0 | 141 | 2.3 s |  |

## t6

Run at 2026-10-12T10:37:43.920Z on commit `4f93626c`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: host: a submit stores the user's text with the attachments on the row, echoes them on user-row, sends a prompt that ends with the attached-files block of absolute paths, passes readDirs, and clears the pending list**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | host: a submit stores the user's text with the attachments on the row, echoes them on user-row, sends a prompt that ends with the attached-files block of absolute paths, passes readDirs, and clears the pending list | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**integration: host: a submit with blank text and an attachment runs a turn and names the chat from the attachment; with blank text and none it is a no-op**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | host: a submit with blank text and an attachment runs a turn and names the chat from the attachment; with blank text and none it is a no-op | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**integration: host: a submit waits for an attachment still being written, and the message carries every chip in order**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | host: a submit waits for an attachment still being written, and the message carries every chip in order | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**integration: host: a later turn of a session with an attachment still passes readDirs, a session with none passes none, and a grant re-run keeps it**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | host: a later turn of a session with an attachment still passes readDirs, a session with none passes none, and a grant re-run keeps it | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**integration: host: a grant re-run and a selection continuation leave the pending list untouched and attach nothing**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | host: a grant re-run and a selection continuation leave the pending list untouched and attach nothing | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**integration: host: a submit with blank text and an attachment supersedes queued approvals**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | host: a submit with blank text and an attachment supersedes queued approvals | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**integration: host: a chat switch while a submit waits drops the submit and keeps the chips on their session, and a second submit runs after the first**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | host: a chat switch while a submit waits drops the submit and keeps the chips on their session, and a second submit runs after the first | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` | 0 | 148 | 2.7 s |  |
