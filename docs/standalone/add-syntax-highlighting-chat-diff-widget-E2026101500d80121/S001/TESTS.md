<!-- insrc:artifact TESTS-00d80121c593053c-S001 -->

# Tests: 00d80121c593053c S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

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

Run at 2026-10-15T09:11:18.368Z on commit `038144e5`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: the shared fake DOM's textContent joins its children and still clears them when set**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the shared fake DOM's textContent joins its children and still clears them when set | `vscode-plugin/src/chat/__tests__/fake-dom.test.ts` |
| pass | t2: ColumnSet renders as ux-columnset with its Columns as children, in order | `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` |
| pass | the shell script runs: a windowed restore shows one page at the bottom with the bar, a page request round-trips and keeps the reader's place, a live row does not move a reader who scrolled up, and an old-style restore still works | `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` | 0 | 12 | 0.4 s |  |
| `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` | 0 | 228 | 16.9 s |  |
| `vscode-plugin/src/chat/__tests__/fake-dom.test.ts` | 0 | 4 | 0.3 s |  |
