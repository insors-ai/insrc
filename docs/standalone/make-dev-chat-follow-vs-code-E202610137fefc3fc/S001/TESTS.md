<!-- insrc:artifact TESTS-7fefc3fc5c51793e-S001 -->

# Tests: 7fefc3fc5c51793e S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 9 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

## S001

Run at 2026-10-13T07:11:30.909Z on commit `2967b2b1`. Tests check: **passed**. 9 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

**unit: chat theme: the chat's own style has no hex, rgb, rgba or hsl value, no radial gradient and no var() with a literal fallback; its only color-mix is the assistant message's ground, declared once; the colour scheme follows the theme kind; a linear gradient is built only from names and transparent**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | chat theme: the chat's own style has no hex, rgb, rgba or hsl value, no radial gradient and no var() with a literal fallback; its only color-mix is the assistant message's ground, declared once; the colour scheme follows the theme kind; a linear gradient is built only from names and transparent | `vscode-plugin/src/chat/__tests__/chat-theme.test.ts` |

**unit: chat theme: every name used in the shell style, the row renderer style and the chat's markdown rules is defined in the named layer**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | chat theme: every name used in the shell style, the row renderer style and the chat's markdown rules is defined in the named layer | `vscode-plugin/src/chat/__tests__/chat-theme.test.ts` |

**unit: chat theme: every name but the one derived ground holds a theme variable of this design's mapping, and every optional one falls back to another theme variable**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | chat theme: every name but the one derived ground holds a theme variable of this design's mapping, and every optional one falls back to another theme variable | `vscode-plugin/src/chat/__tests__/chat-theme.test.ts` |

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

**integration: chat theme: every selector and element id of the shell and the row renderer from before the change is still present, the added selectors are exactly the listed ones, and the shell is still one nonce'd inline script under the same policy**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | chat theme: every selector and element id of the shell and the row renderer from before the change is still present, the added selectors are exactly the listed ones, and the shell is still one nonce'd inline script under the same policy | `vscode-plugin/src/chat/__tests__/chat-theme.test.ts` |

**integration: chat theme: the shared token sheet and the docs-review markdown rules are byte-identical to before the change, and the docs-review panel uses none of the chat's three style sources**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | chat theme: the shared token sheet and the docs-review markdown rules are byte-identical to before the change, and the docs-review panel uses none of the chat's three style sources | `vscode-plugin/src/chat/__tests__/chat-theme.test.ts` |

**smoke: in VS Code: in the user's own theme and the other themes the user tries, the chat follows the theme with no leftover dark panel, both message bubbles have a visible edge, and the rows, cards and controls read well**

Reported by the builder, not run by the gate: **pass**. Evidence: /tmp/insrc-validate-output/chat-theme-smoke.md: in the user's own theme (Atom Material) the user first reported the assistant message had no outline; after the darker ground (5744d9e3) and the shared message border (f2289cf0) and a reload the user wrote 'checked with different themes, working fine'. The user did not name the other themes; a high-contrast theme is not confirmed by eye, which the revised design does not require. Whole plugin suite on a68b0832: /tmp/insrc-validate-output/chat-theme-plugin-suite.tap (1172 tests, 1164 pass, 6 skipped, 2 fail: the manifest-catalog tests that failed before).

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` | 0 | 148 | 2.7 s |  |
| `vscode-plugin/src/chat/__tests__/chat-theme.test.ts` | 0 | 7 | 0.4 s |  |
