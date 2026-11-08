<!-- insrc:artifact TESTS-546198e11c24c1e3-s1 -->

# Tests: 546198e11c24c1e3 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 12 pass, 0 fail, 0 skipped, 0 not found; 4 reported by the builder and not run by the gate.

## s1

Run at 2026-11-07T15:29:02.808Z on commit `2cf58b873`. Tests check: **passed**. 12 pass, 0 fail, 0 skipped, 0 not found; 4 reported by the builder and not run by the gate.

**unit: vscode-plugin/src/chat/chat-panel.ts:2383 mitem row render (innerHTML contains pico SVG string)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | E202611031bd72813:S001 t4 (now Story 546198e11c24c1e3/s1): a rendered menu row and both triggers inline the REAL provider SVG (not a source string), and the empty active trigger reads "no active work" | `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` |
| pass | E202611031bd72813:S001 t4 (now Story 546198e11c24c1e3/s1): an unknown provider falls back to an empty .pico (no broken SVG or image) | `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` |

**unit: vscode-plugin/src/chat/chat-panel.ts:2537 insrc-active trigger**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | E202611031bd72813:S001 t4 (now Story 546198e11c24c1e3/s1): a rendered menu row and both triggers inline the REAL provider SVG (not a source string), and the empty active trigger reads "no active work" | `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` |

**unit: vscode-plugin/src/chat/chat-panel.ts:2538 insrc-history trigger**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | E202611031bd72813:S001 t4 (now Story 546198e11c24c1e3/s1): a rendered menu row and both triggers inline the REAL provider SVG (not a source string), and the empty active trigger reads "no active work" | `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` |

**unit: vscode-plugin/src/chat/chat-panel.ts:2367 active activation**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | E202611031bd72813:S001 t4 (now Story 546198e11c24c1e3/s1): activating a row writes the selection optimistically (both triggers re-render to the chosen chat before any host reply) and posts open-chat/new-chat | `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` |

**unit: vscode-plugin/src/chat/chat-panel.ts:2422 history activation**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | E202611031bd72813:S001 t4 (now Story 546198e11c24c1e3/s1): activating a persisted history row posts open-chat (not new-chat) even when that chat is absent from the active list | `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` |

**unit: vscode-plugin/src/chat/chat-panel.ts:2474 session-restored reconcile**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | E202611031bd72813:S001 t4 (now Story 546198e11c24c1e3/s1): session-restored settles BOTH triggers on the restored chat (and clears one absent from a list) | `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` |
| pass | E202611031bd72813:S001 t4 (now Story 546198e11c24c1e3/s1): session-restored-before-list ordering settles BOTH triggers once the lists arrive | `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` |

**unit: vscode-plugin/src/chat/chat-panel.ts:2488 history-list reconcile (rejected open-chat recovery)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | E202611031bd72813:S001 t4 (now Story 546198e11c24c1e3/s1): a history-list-only response (a rejected open-chat) recovers BOTH triggers to the confirmed session | `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` |

**unit: vscode-plugin/src/chat/chat-panel.ts:2493 active-list reconcile**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | E202611031bd72813:S001 t4 (now Story 546198e11c24c1e3/s1): active-list reconcile re-settles the active trigger to the confirmed session (dropped from active -> cleared) | `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` |

**unit: vscode-plugin/src/chat/chat-panel.ts:2394-2395 menu keyboard/focus (roving-focus index)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | E202611031bd72813:S001 t4 (now Story 546198e11c24c1e3/s1): the menu keyboard moves the roving tabindex (ArrowDown/ArrowUp/Home/End) and Escape closes | `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` |

**unit: vscode-plugin/src/chat/__tests__/chat-panel.test.ts:5928 migrate existing native options/change assertions**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ISSUE-6ae99f6e: the header holds ONLY the chat triggers (active + session); the provider + mode selects live in the footer status bar | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**smoke: vscode-plugin/src/chat/chat-panel.ts header render**

Reported by the builder, not run by the gate: **pass**. Evidence: /tmp/insrc-smoke-546198e11c24c1e3-s1.json

**smoke: vscode-plugin/src/chat/chat-panel.ts both chat menus open + per-row provider SVG render**

Reported by the builder, not run by the gate: **pass**. Evidence: /tmp/insrc-smoke-546198e11c24c1e3-s1.json

**smoke: vscode-plugin/src/chat/chat-panel.ts focus entry/return + keyboard navigation + outside-click dismissal**

Reported by the builder, not run by the gate: **pass**. Evidence: /tmp/insrc-smoke-546198e11c24c1e3-s1.json

**smoke: vscode-plugin/src/chat/chat-panel.ts active trigger empty-state 'no active work'**

Reported by the builder, not run by the gate: **pass**. Evidence: /tmp/insrc-smoke-546198e11c24c1e3-s1.json

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` | 0 | 221 | 14.1 s |  |
| `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` | 0 | 25 | 0.5 s |  |
