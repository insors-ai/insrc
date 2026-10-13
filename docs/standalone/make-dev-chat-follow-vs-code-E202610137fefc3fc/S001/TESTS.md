<!-- insrc:artifact TESTS-7fefc3fc5c51793e-S001 -->

# Tests: 7fefc3fc5c51793e S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 9 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

## S001

Run at 2026-10-13T06:59:58.048Z on commit `f2289cf0`. Tests check: **passed**. 9 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

**unit: chat theme: the chat's own style has no hex, rgb, rgba, hsl or color-mix value, no radial gradient, no var() with a literal fallback, and no forced colour scheme; a linear gradient is built only from names and transparent**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | chat theme: the chat's own style has no hex, rgb, rgba, hsl or color-mix value, no radial gradient, no var() with a literal fallback, and no forced colour scheme; a linear gradient is built only from names and transparent | `vscode-plugin/src/chat/__tests__/chat-theme.test.ts` |

**unit: chat theme: every name used in the shell style, the row renderer style and the chat's markdown rules is defined in the named layer**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | chat theme: every name used in the shell style, the row renderer style and the chat's markdown rules is defined in the named layer | `vscode-plugin/src/chat/__tests__/chat-theme.test.ts` |

**unit: chat theme: the named layer refers only to the theme variables of the approved mapping, and every optional one falls back to another theme variable**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | chat theme: the named layer refers only to the theme variables of the approved mapping, and every optional one falls back to another theme variable | `vscode-plugin/src/chat/__tests__/chat-theme.test.ts` |

**unit: chat theme: each component uses the name the mapping gives it (bars, transcript, user and assistant bubbles, tool row, markers, diff lines, approval card and buttons, decided badge, selection card, input, selects, pill, attachment chips, progress, markdown)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | chat theme: each component uses the name the mapping gives it (bars, transcript, user and assistant bubbles, tool row, markers, diff lines, approval card and buttons, decided badge, selection card, input, selects, pill, attachment chips, progress, markdown) | `vscode-plugin/src/chat/__tests__/chat-theme.test.ts` |

**integration: chat theme: the history chip is one wrapper around the select with a masked icon in the current text colour; the select keeps its id and options, and every image source the shell declares is allowed by its content security policy**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | chat theme: the history chip is one wrapper around the select with a masked icon in the current text colour; the select keeps its id and options, and every image source the shell declares is allowed by its content security policy | `vscode-plugin/src/chat/__tests__/chat-theme.test.ts` |
| pass | UI: the #insrc-history session dropdown carries a leading history/clock glyph so its purpose reads | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S001 (74bc0120) ac5: the session dropdown cap doubles to 36ch; the rest of the chip is untouched | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**integration: chat theme: selectors, class names and element ids of the shell and the row renderer are the same as before the change, and the shell is still one nonce'd inline script under the same policy**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | chat theme: selectors, class names and element ids of the shell and the row renderer are the same as before the change, and the shell is still one nonce'd inline script under the same policy | `vscode-plugin/src/chat/__tests__/chat-theme.test.ts` |

**integration: chat theme: the docs-review panel's rendered document, the shared token sheet and the docs-review markdown rules are byte-identical to before the change**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | chat theme: the docs-review panel's rendered document, the shared token sheet and the docs-review markdown rules are byte-identical to before the change | `vscode-plugin/src/chat/__tests__/chat-theme.test.ts` |

**smoke: in VS Code: with a dark, a light and a high-contrast theme the chat follows the theme with no leftover dark panel, user and assistant messages are told apart, markers are distinct, the approval and selection cards, diff, tool rows, attachment chips, selects and markdown read well, and switching theme repaints the open chat**

Reported by the builder, not run by the gate: **pass**. Evidence: /tmp/insrc-validate-output/chat-theme-smoke.md: after install of 0.5.14 from f2289cf0 and a reload the user wrote 'checked with different themes, working fine'. The user did not say which themes, so a high-contrast theme is not confirmed by eye; its behaviour rests on the unit tests. Whole plugin suite on f2289cf0: /tmp/insrc-validate-output/chat-theme-plugin-suite.tap (1172 tests, 1164 pass, 6 skipped, 2 fail: the manifest-catalog tests that failed before).

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` | 0 | 148 | 2.7 s |  |
| `vscode-plugin/src/chat/__tests__/chat-theme.test.ts` | 0 | 7 | 0.4 s |  |
