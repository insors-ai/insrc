<!-- insrc:artifact TESTS-01ac1e4b6a6c9c2f-s1 -->

# Tests: 01ac1e4b6a6c9c2f s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 8 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-11-15T05:48:58.900Z on commit `0d569507c`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: scratch-store.test.ts: updateScratch happy path writes full text and replaces content; id validation refusal (outside-root, symlink, non-.md) → ScratchRefused; missing file → ScratchNotFound; write failure leaves destination unchanged and unlinks temp; temp path occupied by a symlink or existing file → exclusive create fails (EEXIST/ELOOP) and nothing is written outside the root**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | scratch-store.test.ts: updateScratch happy path writes full text and replaces content; id validation refusal (outside-root, symlink, non-.md) → ScratchRefused; missing file → ScratchNotFound; write failure leaves destination unchanged and unlinks temp; temp path occupied by a symlink or existing file → exclusive create fails (EEXIST/ELOOP) and nothing is written outside the root | `vscode-plugin/src/chat/__tests__/scratch-store.test.ts` |

**unit: scratch-store.test.ts: updateScratch bumps mtime so listScratches reflects the save**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | scratch-store.test.ts: updateScratch bumps mtime so listScratches reflects the save | `vscode-plugin/src/chat/__tests__/scratch-store.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/scratch-store.test.ts` | 0 | 14 | 1.4 s |  |

## t2

Run at 2026-11-15T07:27:34.516Z on commit `dc9eb4190`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: scratch-panel.test.ts: 'scratch-save' in SCRATCH_DOC_WEBVIEW_TO_HOST_TYPES and NOT in SCRATCH_DOC_HOST_TO_WEBVIEW_TYPES; 'scratch-saved' in SCRATCH_DOC_HOST_TO_WEBVIEW_TYPES and NOT in SCRATCH_DOC_WEBVIEW_TO_HOST_TYPES; both carry gen; the chat-channel protocol.ts unions/arrays are untouched (direction isolation per channel)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | scratch-panel.test.ts: 'scratch-save' in SCRATCH_DOC_WEBVIEW_TO_HOST_TYPES and NOT in SCRATCH_DOC_HOST_TO_WEBVIEW_TYPES; 'scratch-saved' in SCRATCH_DOC_HOST_TO_WEBVIEW_TYPES and NOT in SCRATCH_DOC_WEBVIEW_TO_HOST_TYPES; both carry gen; the chat-channel protocol.ts unions/arrays are untouched (direction isolation per channel) | `vscode-plugin/src/panels/__tests__/scratch-panel.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/panels/__tests__/scratch-panel.test.ts` | 0 | 18 | 10.5 s |  |

## t3

Run at 2026-11-15T07:51:00.480Z on commit `c6d67246e`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: scratch-panel.test.ts: documentBodyHtml emits <textarea id="insrc-scratchdoc"> and the save button; documentBootstrap pins the scratch-save post with gen + keydown Ctrl/Cmd+S + scratch-saved handler honoring only gen === docGeneration + textarea selectionStart/selectionEnd send-to-chat**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | scratch-panel.test.ts: documentBodyHtml emits <textarea id="insrc-scratchdoc"> and the save button; documentBootstrap pins the scratch-save post with gen + keydown Ctrl/Cmd+S + scratch-saved handler honoring only gen === docGeneration + textarea selectionStart/selectionEnd send-to-chat | `vscode-plugin/src/panels/__tests__/scratch-panel.test.ts` |

**integration: scratch-panel.test.ts behavioral: input event sets dirty (save button visible, title suffix via setTitle), 'scratch-saved' ok with matching gen clears dirty, ok=false keeps dirty and shows error, stale-gen reply ignored; scratch-content sets textarea .value (not textContent/innerHTML); send-to-chat reads selection from textarea selectionStart/selectionEnd over doc.value and posts capUtf8-capped text**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | scratch-panel.test.ts behavioral: input event sets dirty (save button visible, title suffix via setTitle), 'scratch-saved' ok with matching gen clears dirty, ok=false keeps dirty and shows error, stale-gen reply ignored; scratch-content sets textarea .value (not textContent/innerHTML); send-to-chat reads selection from textarea selectionStart/selectionEnd over doc.value and posts capUtf8-capped text | `vscode-plugin/src/panels/__tests__/scratch-panel.test.ts` |

**integration: scratch-panel.test.ts: send-to-chat post via textarea selection (selectionStart/selectionEnd) present in the new bootstrap; capUtf8 behavior untouched (existing tests); existing ISSUE-3183af2a tests (wrap() drop logging, reveal(true), popup icons) still pass**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | scratch-panel.test.ts: send-to-chat post via textarea selection (selectionStart/selectionEnd) present in the new bootstrap; capUtf8 behavior untouched (existing tests); existing ISSUE-3183af2a tests (wrap() drop logging, reveal(true), popup icons) still pass | `vscode-plugin/src/panels/__tests__/scratch-panel.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/panels/__tests__/scratch-panel.test.ts` | 0 | 21 | 2 s |  |

## t4

Run at 2026-11-15T07:56:54.770Z on commit `81f96b057`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: scratch-host.test.ts (NEW): 'scratch-save' {id,gen,text} → store.updateScratch called with exact args → replySaved(gen, {type:'scratch-saved', id, gen, ok:true, ...}) posted to the document panel + refreshBrowse + scratch-list re-pushed; store failure → ok:false with error and log.warn; malformed (non-string id/text, non-number gen) dropped with warn**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | scratch-host.test.ts (NEW): 'scratch-save' {id,gen,text} → store.updateScratch called with exact args → replySaved(gen, {type:'scratch-saved', id, gen, ok:true, ...}) posted to the document panel + refreshBrowse + scratch-list re-pushed; store failure → ok:false with error and log.warn; malformed (non-string id/text, non-number gen) dropped with warn | `vscode-plugin/src/chat/__tests__/scratch-host.test.ts` |

**integration: extension-chat-wiring.test.ts regex pins: textarea element, save button, 'scratch-save'/'scratch-saved' strings, replySaved, selectionStart present in the built sources and panel wiring; onScratchSave wiring pinned**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | extension-chat-wiring.test.ts regex pins: textarea element, save button, 'scratch-save'/'scratch-saved' strings, replySaved, selectionStart present in the built sources and panel wiring; onScratchSave wiring pinned | `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` | 0 | 77 | 3 s |  |
| `vscode-plugin/src/chat/__tests__/scratch-host.test.ts` | 0 | 1 | 1 s |  |
