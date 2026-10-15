<!-- insrc:artifact TESTS-00d80121c593053c-S001 -->

# Tests: 00d80121c593053c S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 28 pass, 0 fail, 0 skipped, 0 not found; 2 reported by the builder and not run by the gate.

## t1

Run at 2026-10-15T09:07:53.194Z on commit `95015df1`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: evaluating the highlighter module highlights TypeScript, JSON and Python text as span markup**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | evaluating the highlighter module highlights TypeScript, JSON and Python text as span markup | `vscode-plugin/src/chat/__tests__/webview-hljs.test.ts` |

**integration: the highlighter module holds no script tag and its byte length stays under 250 KB**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the highlighter module holds no script tag and its byte length stays under 250 KB | `vscode-plugin/src/chat/__tests__/webview-hljs.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/webview-hljs.test.ts` | 0 | 2 | 0.3 s |  |

## t2

Run at 2026-10-15T09:14:36.000Z on commit `14597ae6`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: the shared fake DOM's textOf joins descendants' text while textContent stays its own text and still clears children when set**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the shared fake DOM's textOf joins descendants' text while textContent stays its own text and still clears children when set | `vscode-plugin/src/chat/__tests__/fake-dom.test.ts` |
| pass | t2: ColumnSet renders as ux-columnset with its Columns as children, in order | `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` |
| pass | the shell script runs: a windowed restore shows one page at the bottom with the bar, a page request round-trips and keeps the reader's place, a live row does not move a reader who scrolled up, and an old-style restore still works | `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` | 0 | 12 | 0.4 s |  |
| `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` | 0 | 228 | 16.6 s |  |
| `vscode-plugin/src/chat/__tests__/fake-dom.test.ts` | 0 | 4 | 0.3 s |  |

## t3

Run at 2026-10-15T09:15:41.982Z on commit `5b2c314f`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: the extension is matched without regard to case and a Dockerfile has a language**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the extension is matched without regard to case and a Dockerfile has a language | `vscode-plugin/src/chat/__tests__/diff-highlight.test.ts` |

**unit: nested spans and a span that crosses a newline are flattened per line with the innermost class**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | nested spans and a span that crosses a newline are flattened per line with the innermost class | `vscode-plugin/src/chat/__tests__/diff-highlight.test.ts` |

**unit: the scanner accepts a multi-class span such as hljs-title function_ and uses its first hljs class**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the scanner accepts a multi-class span such as hljs-title function_ and uses its first hljs class | `vscode-plugin/src/chat/__tests__/diff-highlight.test.ts` |

**unit: a span with no hljs- class is read as classless text and does not reject the section**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a span with no hljs- class is read as classless text and does not reject the section | `vscode-plugin/src/chat/__tests__/diff-highlight.test.ts` |

**unit: highlighter output that is not plain spans and text falls back to plain text**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | highlighter output that is not plain spans and text falls back to plain text | `vscode-plugin/src/chat/__tests__/diff-highlight.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/diff-highlight.test.ts` | 0 | 5 | 0.3 s |  |

## t4

Run at 2026-10-15T09:18:08.185Z on commit `6a97d6ce`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: a TypeScript diff line is split into keyword, string and comment tokens carrying their classes**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a TypeScript diff line is split into keyword, string and comment tokens carrying their classes | `vscode-plugin/src/chat/__tests__/diff-tokens.test.ts` |

**unit: a block comment opened on a context line colours an added line as comment**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a block comment opened on a context line colours an added line as comment | `vscode-plugin/src/chat/__tests__/diff-tokens.test.ts` |

**unit: a removed line and an added line are each tokenised from their own side**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a removed line and an added line are each tokenised from their own side | `vscode-plugin/src/chat/__tests__/diff-tokens.test.ts` |

**unit: an unknown extension and a failing highlighter leave every line as plain text**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an unknown extension and a failing highlighter leave every line as plain text | `vscode-plugin/src/chat/__tests__/diff-tokens.test.ts` |

**unit: a diff line's text span holds no assigned markup**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a diff line's text span holds no assigned markup | `vscode-plugin/src/chat/__tests__/diff-tokens.test.ts` |

**integration: the diff widget keeps its signs, line numbers, add and del classes and collapse behaviour with highlighting on**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the diff widget keeps its signs, line numbers, add and del classes and collapse behaviour with highlighting on | `vscode-plugin/src/chat/__tests__/diff-tokens.test.ts` |
| pass | S001 (bugfix): the render source uses marked + sanitizes with guardMd (no unsanitized innerHTML) | `vscode-plugin/src/chat/__tests__/render-registry.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/diff-tokens.test.ts` | 0 | 6 | 0.3 s |  |
| `vscode-plugin/src/chat/__tests__/render-registry.test.ts` | 0 | 75 | 0.3 s |  |

## t5

Run at 2026-10-15T09:21:40.637Z on commit `f76285bb`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: the shell inlines the highlighter source once, holds no script tag in it, and the CSP is unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the shell inlines the highlighter source once, holds no script tag in it, and the CSP is unchanged | `vscode-plugin/src/chat/__tests__/chat-theme.test.ts` |
| pass | diff widget: a diff row in a session-restored window and in a transcript-page is appended as a widget | `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` |

**integration: the token classes take their colours from existing :root names with no new --vscode- name in the widget rules, and the added selectors are listed exactly**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the token classes take their colours from existing :root names with no new --vscode- name in the widget rules, and the added selectors are listed exactly | `vscode-plugin/src/chat/__tests__/chat-theme.test.ts` |
| pass | chat theme: every selector and element id of the shell and the row renderer from before the change is still present, the added selectors are exactly the listed ones, and the shell is still one nonce'd inline script under the same policy | `vscode-plugin/src/chat/__tests__/chat-theme.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` | 0 | 12 | 0.5 s |  |
| `vscode-plugin/src/chat/__tests__/chat-theme.test.ts` | 0 | 11 | 0.3 s |  |

## t6

Run at 2026-10-15T09:25:11.509Z on commit `2c3b52fa`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: a click on an added or context line posts open-code-ref with its path and new-side line**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a click on an added or context line posts open-code-ref with its path and new-side line | `vscode-plugin/src/chat/__tests__/diff-click.test.ts` |

**unit: a click on a removed line posts the new-side line it sat before**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a click on a removed line posts the new-side line it sat before | `vscode-plugin/src/chat/__tests__/diff-click.test.ts` |

**unit: a click on the header's path posts the section's first new-side line, and a click on the rest of the header still toggles the widget**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a click on the header's path posts the section's first new-side line, and a click on the rest of the header still toggles the widget | `vscode-plugin/src/chat/__tests__/diff-click.test.ts` |

**integration: a clicked diff line is opened by the host in the editor group the review pane uses, and a deleted file is refused**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a clicked diff line is opened by the host in the editor group the review pane uses, and a deleted file is refused | `vscode-plugin/src/chat/__tests__/diff-click.test.ts` |
| pass | the host opens a clicked code reference in the column chooseReviewColumn picks, and Beside when it picks none | `vscode-plugin/src/chat/__tests__/link-opener.test.ts` |
| pass | the chat registry hands a clicked link to the open-link sink | `vscode-plugin/src/chat/__tests__/link-markup.test.ts` |
| pass | chat theme: every selector and element id of the shell and the row renderer from before the change is still present, the added selectors are exactly the listed ones, and the shell is still one nonce'd inline script under the same policy | `vscode-plugin/src/chat/__tests__/chat-theme.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-theme.test.ts` | 0 | 11 | 0.4 s |  |
| `vscode-plugin/src/chat/__tests__/diff-click.test.ts` | 0 | 4 | 0.3 s |  |
| `vscode-plugin/src/chat/__tests__/link-markup.test.ts` | 0 | 11 | 0.3 s |  |
| `vscode-plugin/src/chat/__tests__/link-opener.test.ts` | 0 | 7 | 0.3 s |  |

## t7

Run at 2026-10-15T09:31:33.572Z on commit `2c3b52fa`. Tests check: **passed**. 0 pass, 0 fail, 0 skipped, 0 not found; 2 reported by the builder and not run by the gate.

the gate ran no test: every named test of this Task was reported by the builder

**live: a diff in the chat is coloured by syntax, readable in a light and a dark theme, and a file of an unknown type stays plain**

Reported by the builder, not run by the gate: **pass**. Evidence: Reported by the user on 2026-10-15 in the installed plugin (0.5.14). The diff of a TypeScript change is coloured by syntax and readable in a light and a dark theme. For the unknown type, a scratch file (scratch-plain-check.txt, inside the workspace, since a /tmp file outside it drew no diff widget) was created with two plain lines; the user's reply was 'work', which I read as the plain diff showing correctly. That reading is the builder's, not a quoted observation; the logic is also covered by the automated test 'an unknown extension and a failing highlighter leave every line as plain text'. The scratch file was deleted afterwards.

**live: clicking a diff line opens the file at that line beside or in the editor group the review pane uses**

Reported by the builder, not run by the gate: **pass**. Evidence: Reported by the user on 2026-10-15 in the installed plugin: clicking an added and a removed diff line opens the file at the line, the header path opens the file while the rest of the header still toggles the widget, selecting text opens nothing, and the file lands in the right editor group (the review pane's, else beside the chat).
