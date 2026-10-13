<!-- insrc:artifact TESTS-59da3204a44afd1b-S001 -->

# Tests: 59da3204a44afd1b S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 27 pass, 0 fail, 0 skipped, 0 not found; 4 reported by the builder and not run by the gate.

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

## t7

Run at 2026-10-12T10:43:04.770Z on commit `4c483b3c`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: shell script: the attach button posts pick-attachments, an image paste posts attach-image with its base64 and is prevented, a text paste is untouched, chips render from attachments-pending with a remove control, and a blank box with chips submits**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | shell script: the attach button posts pick-attachments, an image paste posts attach-image with its base64 and is prevented, a text paste is untouched, chips render from attachments-pending with a remove control, and a blank box with chips submits | `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` |

**integration: shell: the attach button is icon-only with an aria-label, sits first in the status bar, and the content security policy is unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | shell: the attach button is icon-only with an aria-label, sits first in the status bar, and the content security policy is unchanged | `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` |

**integration: shell script: a chip click on a sent message posts open-attachment, and the error sentence is shown and cleared**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | shell script: a chip click on a sent message posts open-attachment, and the error sentence is shown and cleared | `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` | 0 | 5 | 0.4 s |  |

## t8

Run at 2026-10-12T10:45:00.921Z on commit `35d6a888`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: extension wiring: the store is built on ~/.insrc/chat-attachments, the picker and opener are injected, onEvict removes a session's attachments and the start-up sweep uses the same keep set**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | extension wiring: the store is built on ~/.insrc/chat-attachments, the picker and opener are injected, onEvict removes a session's attachments and the start-up sweep uses the same keep set | `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` | 0 | 21 | 0.3 s |  |

## t9

Run at 2026-10-12T12:17:54.221Z on commit `bdd0a0ef`. Tests check: **passed**. 0 pass, 0 fail, 0 skipped, 0 not found; 4 reported by the builder and not run by the gate.

the gate ran no test: every named test of this Task was reported by the builder

**live: live claude: with the argv the adapter builds for a request with readDirs, a prompt naming an image and a text file in that directory is answered from their content**

Reported by the builder, not run by the gate: **pass**. Evidence: /tmp/insrc-validate-output/attachments-live-claude.ndjson: argv from the adapter (-p --output-format=stream-json --verbose --add-dir /tmp/insrc-live-att/live-session --permission-prompts host -- <prompt>), run from /tmp/insrc-live-cwd; two Read tool calls, result 'The image is red, and the code word is PERIWINKLE-4471.' The image is a solid red PNG and the text file holds that code word.

**live: live codex: with the argv the adapter builds, a prompt naming an image and a text file in the attachments directory is answered from their content**

Reported by the builder, not run by the gate: **pass**. Evidence: /tmp/insrc-validate-output/attachments-live-codex.ndjson: argv from the adapter (exec --json -- <prompt>), codex-cli 0.162.1. First run from a directory that is not a git repository was refused by codex itself ('Not inside a trusted directory'); second run from /home/subho/work/dev/insors/insrc, which does not hold the files, answered 'The image is red, and the code word is PERIWINKLE-4471.'

**smoke: in VS Code: pasting a screenshot and attaching a document show chips, the message shows them after sending, the assistant answers from their content, and a chip click opens the file**

Reported by the builder, not run by the gate: **pass**. Evidence: /tmp/insrc-validate-output/attachments-t9-smoke.md: after install of 0.5.13 (commit bdd0a0ef) and a reload, the user sent 'paste works, file attach also. check' from the panel with a pasted screenshot and an attached document; the assistant received the attached-files block and read both files; the stored row holds the user's text with the two attachments; the user then confirmed 'yes, click opens in editor'. The user's first attempt, before bdd0a0ef, failed ('Paste is not working').

**smoke: whole plugin suite: every test passes apart from the two manifest-catalog tests that failed before this Story**

Reported by the builder, not run by the gate: **pass**. Evidence: /tmp/insrc-validate-output/attachments-t9-plugin-suite.tap: run on commit bdd0a0ef; 1161 tests, 1155 pass, 4 skipped, 2 fail (not ok 794 and 795, the two manifest-catalog tests in the config suite, failing before this Story).
