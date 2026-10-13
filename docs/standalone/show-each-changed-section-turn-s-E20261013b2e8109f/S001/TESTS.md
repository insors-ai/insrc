<!-- insrc:artifact TESTS-b2e8109f42afc0dd-S001 -->

# Tests: b2e8109f42afc0dd S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 41 pass, 0 fail, 0 skipped, 0 not found; 2 reported by the builder and not run by the gate.

## t1

Run at 2026-10-13T08:48:39.843Z on commit `1c43f9ad`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: parsePatch: one entry per section, with path, ranges, counts and lines, for two sections of one file**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | parsePatch: one entry per section, with path, ranges, counts and lines, for two sections of one file | `vscode-plugin/src/chat/__tests__/diff-sections.test.ts` |

**unit: parsePatch: a new file, a deleted file, a binary file, a name with a space and a quoted name**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | parsePatch: a new file, a deleted file, a binary file, a name with a space and a quoted name | `vscode-plugin/src/chat/__tests__/diff-sections.test.ts` |

**unit: parsePatch: a section over 400 lines is cut, the rest counted in omitted, and added and removed count the whole section**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | parsePatch: a section over 400 lines is cut, the rest counted in omitted, and added and removed count the whole section | `vscode-plugin/src/chat/__tests__/diff-sections.test.ts` |

**unit: parsePatch: an empty patch gives no sections and an unreadable file part is skipped without a throw**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | parsePatch: an empty patch gives no sections and an unreadable file part is skipped without a throw | `vscode-plugin/src/chat/__tests__/diff-sections.test.ts` |

**unit: reconcileSections: a new section is added, an unchanged one gives no operation and a changed one is updated under the same id**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | reconcileSections: a new section is added, an unchanged one gives no operation and a changed one is updated under the same id | `vscode-plugin/src/chat/__tests__/diff-sections.test.ts` |

**unit: reconcileSections: sections that join update the lower id and withdraw the other, and a section that is gone is withdrawn**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | reconcileSections: sections that join update the lower id and withdraw the other, and a section that is gone is withdrawn | `vscode-plugin/src/chat/__tests__/diff-sections.test.ts` |

**unit: reconcileSections: beyond the limit new sections are kept hidden, counted in overflow, and never produce an operation later**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | reconcileSections: beyond the limit new sections are kept hidden, counted in overflow, and never produce an operation later | `vscode-plugin/src/chat/__tests__/diff-sections.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/diff-sections.test.ts` | 0 | 7 | 0.3 s |  |

## t2

Run at 2026-10-13T08:51:32.861Z on commit `78676aa7`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: git-baseline: snapshot resolves the printed index path against cwd, copies it, adds and writes a tree with GIT_INDEX_FILE set to the copy, and returns the tree id and the copy's path**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | git-baseline: snapshot resolves the printed index path against cwd, copies it, adds and writes a tree with GIT_INDEX_FILE set to the copy, and returns the tree id and the copy's path | `vscode-plugin/src/chat/__tests__/git-baseline.test.ts` |

**unit: git-baseline: changes returns an empty string for an unchanged tree, the patch for a changed one and undefined when write-tree or diff fails**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | git-baseline: changes returns an empty string for an unchanged tree, the patch for a changed one and undefined when write-tree or diff fails | `vscode-plugin/src/chat/__tests__/git-baseline.test.ts` |

**unit: git-baseline: read resolves a path with show <tree>:./<rel> and gives undefined for a path not in the tree**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | git-baseline: read resolves a path with show <tree>:./<rel> and gives undefined for a path not in the tree | `vscode-plugin/src/chat/__tests__/git-baseline.test.ts` |

**unit: git-baseline: release removes the private index, and a failed git add does not fail snapshot**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | git-baseline: release removes the private index, and a failed git add does not fail snapshot | `vscode-plugin/src/chat/__tests__/git-baseline.test.ts` |

**integration: git-baseline (real git): tracked, untracked, new, deleted, binary and ignored files in a subfolder give the expected sections, read returns start content from the tree id, and the index and status are unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | git-baseline (real git): tracked, untracked, new, deleted, binary and ignored files in a subfolder give the expected sections, read returns start content from the tree id, and the index and status are unchanged | `vscode-plugin/src/chat/__tests__/git-baseline.integration.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/git-baseline.integration.test.ts` | 0 | 1 | 0.5 s |  |
| `vscode-plugin/src/chat/__tests__/git-baseline.test.ts` | 0 | 4 | 0.3 s |  |

## t3

Run at 2026-10-13T08:54:46.910Z on commit `929eb1e1`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 2 reported by the builder and not run by the gate.

**unit: claude adapter: the result of an Edit or Write call carries editPath, and isError when the block reports an error; a command's result carries neither**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | claude adapter: the result of an Edit or Write call carries editPath, and isError when the block reports an error; a command's result carries neither | `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` |

**unit: codex adapter: a file_change item emits one applied file-edit event per changed file, one for a bare path, and '(unknown)' when it names none; a claude edit's event has no applied**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | codex adapter: a file_change item emits one applied file-edit event per changed file, one for a bare path, and '(unknown)' when it names none; a claude edit's event has no applied | `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` |

**live: live claude: an Edit of a file in a temporary repository yields a tool-result with editPath and the baseline's changes hold the edited section**

Reported by the builder, not run by the gate: **pass**. Evidence: /tmp/insrc-validate-output/diff-widget-t3-live.txt (INSRC_LIVE_TESTS=1 run of vscode-plugin/src/chat/__tests__/live-cli.test.ts on 2026-10-13, claude 2.1.296: pass in 7.3 s)

**live: live codex: a patch of two files in a temporary repository yields two applied file-edit events with those files' paths**

Reported by the builder, not run by the gate: **pass**. Evidence: /tmp/insrc-validate-output/diff-widget-t3-live.txt (INSRC_LIVE_TESTS=1 run of vscode-plugin/src/chat/__tests__/live-cli.test.ts on 2026-10-13, codex-cli 0.162.1: pass in 10.6 s)

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` | 0 | 82 | 1.3 s |  |

## t4

Run at 2026-10-13T08:57:09.782Z on commit `09512a99`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: transcript window: a diff row is given with the content of the last later row that replaces its sid, wherever those rows sit; a withdrawn one as withdrawn; a row with replaces as it is; firstIndex and the row count do not change**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | transcript window: a diff row is given with the content of the last later row that replaces its sid, wherever those rows sit; a withdrawn one as withdrawn; a row with replaces as it is; firstIndex and the row count do not change | `vscode-plugin/src/chat/__tests__/transcript-window.test.ts` |

**unit: toViewModel: a diff row maps to the diff kind in the host and in the webview mirror**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | toViewModel: a diff row maps to the diff kind in the host and in the webview mirror | `vscode-plugin/src/chat/__tests__/render-registry.test.ts` |
| pass | parity: eval(webview toViewModel) equals host toViewModel for every sample (drift fails build) | `vscode-plugin/src/chat/__tests__/render-registry.test.ts` |

**integration: session file store: a diff row, a row that replaces it and a withdrawing row are appended by separate saves, with another writer's rows appended between them, and a new store over the same files reads them back so that pageBefore gives the latest version at the first row's place**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | session file store: a diff row, a row that replaces it and a withdrawing row are appended by separate saves, with another writer's rows appended between them, and a new store over the same files reads them back so that pageBefore gives the latest version at the first row's place | `vscode-plugin/src/chat/__tests__/session-file-store.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/render-registry.test.ts` | 0 | 72 | 0.4 s |  |
| `vscode-plugin/src/chat/__tests__/session-file-store.test.ts` | 0 | 20 | 0.4 s |  |
| `vscode-plugin/src/chat/__tests__/transcript-window.test.ts` | 0 | 6 | 0.3 s |  |

## t5

Run at 2026-10-13T09:03:32.805Z on commit `48de54bd`. Tests check: **passed**. 9 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: diff widget: header, line numbers, signs and classes are drawn from a diff row; 8 lines show until the header or the button is used**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | diff widget: header, line numbers, signs and classes are drawn from a diff row; 8 lines show until the header or the button is used | `vscode-plugin/src/chat/__tests__/render-registry.test.ts` |

**unit: diff widget: 8 lines or fewer has no chevron and no button; a binary row, a new file, a deleted file and an omitted count are labelled; a row with replaces or withdrawn appends nothing**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | diff widget: 8 lines or fewer has no chevron and no button; a binary row, a new file, a deleted file and an omitted count are labelled; a row with replaces or withdrawn appends nothing | `vscode-plugin/src/chat/__tests__/render-registry.test.ts` |

**unit: transcript-row: a diff row without replaces appends a widget stamped with its row index; one with replaces redraws the widget of that sid and keeps it open; a withdrawn one hides it; one for an unknown or trimmed sid changes nothing**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | transcript-row: a diff row without replaces appends a widget stamped with its row index; one with replaces redraws the widget of that sid and keeps it open; a withdrawn one hides it; one for an unknown or trimmed sid changes nothing | `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` |

**unit: transcript-row: a marker row appends the same line a restored marker row draws**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | transcript-row: a marker row appends the same line a restored marker row draws | `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` |

**unit: diff widget: a diff row in a session-restored window and in a transcript-page is appended as a widget**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | diff widget: a diff row in a session-restored window and in a transcript-page is appended as a widget | `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` |

**unit: tool result: a short output is drawn with no chevron and a long one folds**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | tool result: a short output is drawn with no chevron and a long one folds | `vscode-plugin/src/chat/__tests__/render-registry.test.ts` |

**unit: chat theme: the transcript's children do not shrink, the diff widget's rules name only the shell's theme names, and the .insrc-term-diff rule still out-ranks the shared sheet (__tests__/chat-theme.test.ts; replaces the three has() lines on .insrc-diff-add, .insrc-diff-del and .insrc-diff-actions button, and the seven .insrc-diff-* selectors leave chat-theme-before.json while the widget's selectors join the test's list of added selectors)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | chat theme: the transcript's children do not shrink, the diff widget's rules name only the shell's theme names, and the .insrc-term-diff rule still out-ranks the shared sheet | `vscode-plugin/src/chat/__tests__/chat-theme.test.ts` |
| pass | chat theme: every selector and element id of the shell and the row renderer from before the change is still present, the added selectors are exactly the listed ones, and the shell is still one nonce'd inline script under the same policy | `vscode-plugin/src/chat/__tests__/chat-theme.test.ts` |
| pass | chat theme: each component uses the name the mapping gives it (bars, transcript, user and assistant bubbles, tool row, markers, diff lines, approval card and buttons, decided badge, selection card, input, selects, pill, attachment chips, progress, markdown) | `vscode-plugin/src/chat/__tests__/chat-theme.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` | 0 | 8 | 0.5 s |  |
| `vscode-plugin/src/chat/__tests__/chat-theme.test.ts` | 0 | 8 | 0.4 s |  |
| `vscode-plugin/src/chat/__tests__/render-registry.test.ts` | 0 | 75 | 0.4 s |  |

## t6

Run at 2026-10-13T09:12:37.601Z on commit `08c30702`. Tests check: **passed**. 14 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: governor: check passes the reconciled operations to showSections and calls nothing when nothing changed**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | governor: check passes the reconciled operations to showSections and calls nothing when nothing changed | `vscode-plugin/src/chat/__tests__/edit-governor.test.ts` |

**unit: governor: checks run one at a time, a call made during a check causes exactly one more, and its promise resolves after that one**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | governor: checks run one at a time, a call made during a check causes exactly one more, and its promise resolves after that one | `vscode-plugin/src/chat/__tests__/edit-governor.test.ts` |

**unit: governor: an unreadable check calls sectionsUnreadable once per turn and a later check still shows sections**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | governor: an unreadable check calls sectionsUnreadable once per turn and a later check still shows sections | `vscode-plugin/src/chat/__tests__/edit-governor.test.ts` |

**unit: governor: sectionPaths holds the path of every known section, shown or hidden, and is empty after beginTurn**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | governor: sectionPaths holds the path of every known section, shown or hidden, and is empty after beginTurn | `vscode-plugin/src/chat/__tests__/edit-governor.test.ts` |

**unit: governor: no snapshot or the editor view means sectionsActive is false and check does nothing; in the chat view observe does nothing**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | governor: no snapshot or the editor view means sectionsActive is false and check does nothing; in the chat view observe does nothing | `vscode-plugin/src/chat/__tests__/edit-governor.test.ts` |

**unit: governor: a check that ends after a newer turn began shows nothing, and resolveTurn runs a last check then releases the snapshot**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | governor: a check that ends after a newer turn began shows nothing, and resolveTurn runs a last check then releases the snapshot | `vscode-plugin/src/chat/__tests__/edit-governor.test.ts` |

**unit: governor: abandonTurn makes sectionsActive false at once, releases the snapshot without a last check, and a check in flight shows nothing**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | governor: abandonTurn makes sectionsActive false at once, releases the snapshot without a last check, and a check in flight shows nothing | `vscode-plugin/src/chat/__tests__/edit-governor.test.ts` |

**unit: protocol: transcript-row is a host message and edit-prompt is not**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | protocol: transcript-row is a host message and edit-prompt is not | `vscode-plugin/src/chat/__tests__/protocol.test.ts` |

**unit: chat wiring: the governance deps carry relPath and no computeDiff, and git is run with the given environment (__tests__/extension-chat-wiring.test.ts; replaces the assertion on `computeDiff: defaultComputeDiff` at line 89)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | chat wiring: the governance deps carry relPath and no computeDiff, and git is run with the given environment | `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` |

**integration: diff sections: an added section is pushed as a diff row with a sid and posted as transcript-row with its row index; an update and a withdraw are pushed as rows that name that sid, and no earlier row is changed**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | diff sections: an added section is pushed as a diff row with a sid and posted as transcript-row with its row index; an update and a withdraw are pushed as rows that name that sid, and no earlier row is changed | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**integration: diff sections: a check is requested after every tool-result and file-edit event and once more at the end of the turn, and the session is saved after late rows**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | diff sections: a check is requested after every tool-result and file-edit event and once more at the end of the turn, and the session is saved after late rows | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**integration: diff sections: overflow and unreadable push one marker row each and post it as transcript-row**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | diff sections: overflow and unreadable push one marker row each and post it as transcript-row | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**integration: diff sections: with no snapshot, or with the editor view, no diff state is made and the rows and messages are those of today**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | diff sections: with no snapshot, or with the editor view, no diff state is made and the rows and messages are those of today | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**integration: diff sections: the restored window and an older page carry each section's latest version at its first row's place**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | diff sections: the restored window and an older page carry each section's latest version at its first row's place | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` | 0 | 149 | 3.1 s |  |
| `vscode-plugin/src/chat/__tests__/edit-governor.test.ts` | 0 | 14 | 0.4 s |  |
| `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` | 0 | 22 | 0.4 s |  |
| `vscode-plugin/src/chat/__tests__/protocol.test.ts` | 0 | 10 | 0.3 s |  |
