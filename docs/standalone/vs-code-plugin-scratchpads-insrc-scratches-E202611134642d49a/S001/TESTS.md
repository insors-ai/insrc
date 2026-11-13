<!-- insrc:artifact TESTS-4642d49ab0593787-s1 -->

# Tests: 4642d49ab0593787 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 27 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

## t1

Run at 2026-11-13T11:46:42.681Z on commit `f11c7032b`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: scratch-store.test.ts: listScratches returns entries sorted by mtime desc with id/name/mtime/size (ENOENT->[], non-.md skipped, limit cap, ties id asc)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | scratch-store.test.ts: listScratches returns entries sorted by mtime desc with id/name/mtime/size (ENOENT->[], non-.md skipped, limit cap, ties id asc) | `vscode-plugin/src/chat/__tests__/scratch-store.test.ts` |

**unit: scratch-store.test.ts: createScratch writes <yyyymmdd-hhmmss>-<slug>.md via temp write + link()+unlink publication (never rename), collision ladder -2/-3, slug rules incl. all-symbol fallback 'scratch'; entry appears at list head**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | scratch-store.test.ts: createScratch writes <yyyymmdd-hhmmss>-<slug>.md via temp write + link()+unlink publication (never rename), collision ladder -2/-3, slug rules incl. all-symbol fallback 'scratch'; entry appears at list head | `vscode-plugin/src/chat/__tests__/scratch-store.test.ts` |

**unit: scratch-store.test.ts: refusal tests — ids '.', '..', traversal strings, symlinks and directories named *.md cause ScratchRefused with ZERO fs mutation calls recorded by fake-scratch-fs**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | scratch-store.test.ts: refusal tests — ids '.', '..', traversal strings, symlinks and directories named *.md cause ScratchRefused with ZERO fs mutation calls recorded by fake-scratch-fs | `vscode-plugin/src/chat/__tests__/scratch-store.test.ts` |

**unit: scratch-store.test.ts: concurrent-create race with two independent store instances over the same real tmp dir — both racing creates succeed with distinct files, contents intact (link()+unlink exclusive publication, EEXIST suffix retry)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | scratch-store.test.ts: concurrent-create race with two independent store instances over the same real tmp dir — both racing creates succeed with distinct files, contents intact (link()+unlink exclusive publication, EEXIST suffix retry) | `vscode-plugin/src/chat/__tests__/scratch-store.test.ts` |

**unit: scratch-store.test.ts: ENOENT mapping — readdir ENOENT -> []; absence before lstat and disappearance between lstat and final read/unlink -> ScratchNotFound (read) / success (delete, idempotent)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | scratch-store.test.ts: ENOENT mapping — readdir ENOENT -> []; absence before lstat and disappearance between lstat and final read/unlink -> ScratchNotFound (read) / success (delete, idempotent) | `vscode-plugin/src/chat/__tests__/scratch-store.test.ts` |

**unit: scratch-store.test.ts: readScratch opens with O_RDONLY|O_NOFOLLOW + fstat single-fd regular-file check — symlink swapped in after validation yields ELOOP -> ScratchRefused; error mapping EACCES/ENOSPC/EROFS -> ScratchStoreError**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | scratch-store.test.ts: readScratch opens with O_RDONLY\|O_NOFOLLOW + fstat single-fd regular-file check — symlink swapped in after validation yields ELOOP -> ScratchRefused; error mapping EACCES/ENOSPC/EROFS -> ScratchStoreError | `vscode-plugin/src/chat/__tests__/scratch-store.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/scratch-store.test.ts` | 0 | 11 | 0.3 s |  |

## t2

Run at 2026-11-13T09:15:43.373Z on commit `18c3cbbc3`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: protocol.test.ts: all eight new message types appear in their own direction's union + const array only, with direction-isolation and union/array-equality assertions passing (ac5)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | protocol.test.ts: all eight new message types appear in their own direction's union + const array only, with direction-isolation and union/array-equality assertions passing (ac5) | `vscode-plugin/src/chat/__tests__/protocol.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/protocol.test.ts` | 0 | 17 | 0.3 s |  |

## t3

Run at 2026-11-13T09:21:35.810Z on commit `40c2fa8b3`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: webview-host.test.ts + chat-shell.test.ts: existing CSP/nonce tests preserved when the shell is extracted to panels/shell.ts (shell output byte-identical, all existing assertions pass unmodified)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | webview-host.test.ts + chat-shell.test.ts: existing CSP/nonce tests preserved when the shell is extracted to panels/shell.ts (shell output byte-identical, all existing assertions pass unmodified) | `vscode-plugin/src/panels/__tests__/webview-host.test.ts` |
| pass | shell: the attach button is icon-only with an aria-label, sits first in the status bar, and the content security policy is unchanged | `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` | 0 | 42 | 0.5 s |  |
| `vscode-plugin/src/panels/__tests__/webview-host.test.ts` | 0 | 45 | 0.4 s |  |

## t4

Run at 2026-11-13T11:31:23.838Z on commit `e5f820bc6`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: chat-panel.test.ts: #insrc-scratch sibling button with class attachbtn + inline SVG + title exists next to #insrc-attach (ac2, ac5)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | chat-panel.test.ts: #insrc-scratch sibling button with class attachbtn + inline SVG + title exists next to #insrc-attach (ac2, ac5) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**integration: chat-panel.test.ts: #insrc-scratchmenu .popup.chatmenu renders recent items + New scratchpad + Browse all from a scratch-list push, incl. empty-state hint and error row (ac2)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | chat-panel.test.ts: #insrc-scratchmenu .popup.chatmenu renders recent items + New scratchpad + Browse all from a scratch-list push, incl. empty-state hint and error row (ac2) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**integration: chat-panel.test.ts: bootstrap click on #insrc-scratch posts {type:'scratch-open-menu'} (ac2)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | chat-panel.test.ts: bootstrap click on #insrc-scratch posts {type:'scratch-open-menu'} (ac2) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**integration: chat-panel.test.ts: host insert-into-input handler inserts into #insrc-input (:2784) per the deterministic rule — caret mid-draft in a non-empty draft, and an active range selection replaced — existing content preserved, focuses it, no submit-turn/cancel-turn posted (ac4)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | chat-panel.test.ts: host insert-into-input handler inserts into #insrc-input (:2784) per the deterministic rule — caret mid-draft in a non-empty draft, and an active range selection replaced — existing content preserved, focuses it, no submit-turn/cancel-turn posted (ac4) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**integration: chat-panel.test.ts + scratch-panel.test.ts: every button in the new UI is icon-only with a title attribute — no visible text content on buttons (ac5)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | chat-panel.test.ts + scratch-panel.test.ts: every button in the new UI is icon-only with a title attribute — no visible text content on buttons (ac5) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | chat-panel.test.ts + scratch-panel.test.ts: every button in the new UI is icon-only with a title attribute — no visible text content on buttons (ac5) | `vscode-plugin/src/panels/__tests__/scratch-panel.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` | 0 | 283 | 10.7 s |  |
| `vscode-plugin/src/panels/__tests__/scratch-panel.test.ts` | 0 | 10 | 0.4 s |  |

## t5

Run at 2026-11-13T11:39:37.442Z on commit `0a9a87f55`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: scratch-panel.test.ts: browse viewType insrc.scratchpads renders a table with Name and Modified columns (ac3)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | scratch-panel.test.ts: browse viewType insrc.scratchpads renders a table with Name and Modified columns (ac3) | `vscode-plugin/src/panels/__tests__/scratch-panel.test.ts` |

**integration: scratch-panel.test.ts: each row has icon-only Open/Delete buttons (title hover text, data-id) posting scratch-open/scratch-delete (ac3, ac5)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | scratch-panel.test.ts: each row has icon-only Open/Delete buttons (title hover text, data-id) posting scratch-open/scratch-delete (ac3, ac5) | `vscode-plugin/src/panels/__tests__/scratch-panel.test.ts` |

**integration: scratch-panel.test.ts: empty list renders a hint row; create-or-reveal reuses a single panel instance; panel-factory failure returns undefined + logged and next click retries (ac3)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | scratch-panel.test.ts: empty list renders a hint row; create-or-reveal reuses a single panel instance; panel-factory failure returns undefined + logged and next click retries (ac3) | `vscode-plugin/src/panels/__tests__/scratch-panel.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/panels/__tests__/scratch-panel.test.ts` | 0 | 10 | 0.4 s |  |

## t6

Run at 2026-11-13T10:06:39.666Z on commit `76ccce876`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: scratch-panel.test.ts: document viewType insrc.scratchpad renders content via textContent only (ac4)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | scratch-panel.test.ts: document viewType insrc.scratchpad renders content via textContent only (ac4) | `vscode-plugin/src/panels/__tests__/scratch-panel.test.ts` |

**integration: scratch-panel.test.ts: selectionchange with non-empty selection shows the floating icon-only Send-to-chat button (title) which posts send-to-chat {text}; selection-to-button click preserves the captured selection across focus/selectionchange (ac4, ac5)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | scratch-panel.test.ts: selectionchange with non-empty selection shows the floating icon-only Send-to-chat button (title) which posts send-to-chat {text}; selection-to-button click preserves the captured selection across focus/selectionchange (ac4, ac5) | `vscode-plugin/src/panels/__tests__/scratch-panel.test.ts` |

**integration: scratch-panel.test.ts: A->B document switching asserts setTitle(B) on the SAME panel instance alongside content, with reversed read completion (generation guard)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | scratch-panel.test.ts: A->B document switching asserts setTitle(B) on the SAME panel instance alongside content, with reversed read completion (generation guard) | `vscode-plugin/src/panels/__tests__/scratch-panel.test.ts` |

**integration: scratch-panel.test.ts: stale ENOENT, deleting a non-displayed document, delete invalidates pending opens of the deleted id, closing/reopening the document panel during an outstanding read (dispose invalidates the generation, late read dropped)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | scratch-panel.test.ts: stale ENOENT, deleting a non-displayed document, delete invalidates pending opens of the deleted id, closing/reopening the document panel during an outstanding read (dispose invalidates the generation, late read dropped) | `vscode-plugin/src/panels/__tests__/scratch-panel.test.ts` |

**integration: scratch-panel.test.ts: UTF-8 cap — final inserted string incl. ellipsis within 65,536 bytes, with a multibyte boundary case**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | scratch-panel.test.ts: UTF-8 cap — final inserted string incl. ellipsis within 65,536 bytes, with a multibyte boundary case | `vscode-plugin/src/panels/__tests__/scratch-panel.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/panels/__tests__/scratch-panel.test.ts` | 0 | 9 | 0.5 s |  |

## t7

Run at 2026-11-13T11:35:02.462Z on commit `ae1d3633c`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

**integration: extension-chat-wiring.test.ts: extension.ts constructs createScratchStore with root join(PATHS.insrc, 'scratches') (ac1)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | extension-chat-wiring.test.ts: extension.ts constructs createScratchStore with root join(PATHS.insrc, 'scratches') (ac1) | `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` |

**integration: extension-chat-wiring.test.ts: scratch-new title acquisition end-to-end — prompt cancelled -> no create + unchanged list; prompt answered -> create + list refresh + document open**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | extension-chat-wiring.test.ts: scratch-new title acquisition end-to-end — prompt cancelled -> no create + unchanged list; prompt answered -> create + list refresh + document open | `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` |

**integration: extension-chat-wiring.test.ts: scratch-list error field renders the unavailable row and a later success recovers; host switch cases for all six webview->host messages and both host->webview pushes**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | extension-chat-wiring.test.ts: scratch-list error field renders the unavailable row and a later success recovers; host switch cases for all six webview->host messages and both host->webview pushes | `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` |

**integration: extension-chat-wiring.test.ts: send-to-chat reveals the chat panel, awaits the ready handshake, then pushes insert-into-input capped at 65,536 UTF-8 bytes; disposed chat drops silently**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | extension-chat-wiring.test.ts: send-to-chat reveals the chat panel, awaits the ready handshake, then pushes insert-into-input capped at 65,536 UTF-8 bytes; disposed chat drops silently | `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` |

**smoke: manual/optional smoke: click scratchpad button in the chat status bar, create a scratchpad, browse all, select text, Send to chat (only if a display/VS Code harness is available; otherwise covered by the integration fake-dom suite — no live LLM or daemon calls)**

Reported by the builder, not run by the gate: **pass**. Evidence: No display/VS Code harness in this environment; covered by the integration fake-dom suite (runShell + createScratchHost + createScratchPanels over fakes) in extension-chat-wiring.test.ts — 72/72 pass, tsc clean @ae1d3633c.

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` | 0 | 72 | 0.7 s |  |
