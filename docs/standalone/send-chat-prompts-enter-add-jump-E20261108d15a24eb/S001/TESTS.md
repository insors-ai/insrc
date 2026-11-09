<!-- insrc:artifact TESTS-d15a24eb41e0771c-s1 -->

# Tests: d15a24eb41e0771c s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 14 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

## s1

Run at 2026-11-08T20:26:33.389Z on commit `5ae36ee34`. Tests check: **passed**. 14 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

**unit: jump: hidden while following and at the end**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | jump: hidden while following and at the end | `vscode-plugin/src/chat/__tests__/transcript-pager.test.ts` |

**unit: jump: shown when the reader scrolls up and stays shown as new rows arrive**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | jump: shown when the reader scrolls up and stays shown as new rows arrive | `vscode-plugin/src/chat/__tests__/transcript-pager.test.ts` |

**unit: jump: stays hidden while a row is appended empty and then filled**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | jump: stays hidden while a row is appended empty and then filled | `vscode-plugin/src/chat/__tests__/transcript-pager.test.ts` |

**unit: jump: a click moves to the end, resumes following and hides the button**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | jump: a click moves to the end, resumes following and hides the button | `vscode-plugin/src/chat/__tests__/transcript-pager.test.ts` |

**unit: jump: hides when the reader scrolls back to the end**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | jump: hides when the reader scrolls back to the end | `vscode-plugin/src/chat/__tests__/transcript-pager.test.ts` |

**unit: jump: hidden after a session reset**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | jump: hidden after a session reset | `vscode-plugin/src/chat/__tests__/transcript-pager.test.ts` |

**integration: composer: Enter submits and prevents the line break**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | composer: Enter submits and prevents the line break | `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` |

**integration: composer: Enter on an empty box sends nothing and adds no line break**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | composer: Enter on an empty box sends nothing and adds no line break | `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` |

**integration: composer: Ctrl+Enter inserts a line at the caret and does not submit**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | composer: Ctrl+Enter inserts a line at the caret and does not submit | `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` |

**integration: composer: Cmd+Enter inserts a line and does not submit**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | composer: Cmd+Enter inserts a line and does not submit | `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` |

**integration: composer: Shift+Enter does not submit and leaves the browser's line break**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | composer: Shift+Enter does not submit and leaves the browser's line break | `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` |

**integration: composer: an Enter confirming an IME composition does not submit**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | composer: an Enter confirming an IME composition does not submit | `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` |

**integration: composer: the placeholders state the new keys**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | composer: the placeholders state the new keys | `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` |

**integration: shell: the jump button sits outside the transcript and a click returns focus to the prompt**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | shell: the jump button sits outside the transcript and a click returns focus to the prompt | `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` |

**smoke: visual: the jump button floats over the transcript's lower edge in light and dark themes**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/standalone/send-chat-prompts-enter-add-jump-E20261108d15a24eb/S001/evidence/jump-button-dark.png and jump-button-light.png (real shell in headless Chrome with stand-in theme variables), plus chrome-probe.json and chrome-probe-after-click.json in the same directory. The probe dispatched the scroll event itself and the page ran with its CSP removed. Not checked inside a VS Code window.

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` | 0 | 41 | 0.8 s |  |
| `vscode-plugin/src/chat/__tests__/transcript-pager.test.ts` | 0 | 22 | 0.7 s |  |
