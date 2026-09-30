<!-- insrc:artifact PLAN-7c219c7471d79496-S001 -->

# Plan: E202609307c219c74:S001

## Summary

**Epic:** `lld-dev-chat-terminal-prompt-fidelity`
**LLD run:** `wf-1790742675507-x3e8ut`
**LLD effective hash:** `7c219c7471d7...`

Building this Story is a single presentation-only reshape of the eval'd renderShell webview source in chat-panel.ts, plus additive assertions to its existing *WebviewSource test suite. Two edit passes: first the input row (drop the textarea's box chrome, top-align the ❯, add the interrupt-hint placeholder), then the status bar (relocate the provider + mode selects verbatim into the header so the bar becomes a clean read-only session/edits/idle line). Every element id and the S002 send/stop control are preserved, so no protocol, persistence, or event wiring changes — the tests both prove the three deltas and regression-guard the unchanged behaviour under tsx --test.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Flush 2-line scrolling prompt + interrupt-hint placeholder (deltas 1+2) | S | — | unit: renderShell #insrc-input has no border/box chrome + overflow-y:auto + rows=2 (flush 2-line scroll); unit: renderShell #insrc-prompt is align-self:flex-start (❯ on the top line only), keeping id+role=button+tabindex; unit: renderShell #insrc-input placeholder equals 'message claude… (⌘↵ send · ^C interrupt)' (has '^C interrupt') | [[c1]] |
| 2 | **`t2`** Read-only status bar via relocating provider+mode selects to the header (delta 3) | M | `t1` | unit: renderShell .statusbar renders read-only 'session <id>' + 'edits <mode>' + '✓ idle' with no <select>; unit: renderShell emits #insrc-provider + #insrc-mode <select>s inside the header (.chrome) with ids/options preserved; unit: the 'edits <mode>' label maps manual→'review' / edit-auto→'auto-edit' / auto→'auto' | [[c2]] |
| 3 | **`t3`** Extend the renderShell *WebviewSource tests (ac1-ac4) and run the suite | S | `t1`, `t2` | unit: regression: S002 send/stop — ❯ click posts one {type:'submit-turn'}, Cmd/Ctrl+Enter sends, empty no-ops, setRunning toggles ❯↔■; unit: regression: relocated #insrc-mode change posts {type:'set-permission-mode'} + updatePermSeg auto-pill; #insrc-provider change starts a new chat; smoke: the full vscode-plugin suite runs green under tsx --test | [[c3]] |

### 1.1 E202609307c219c74:S001:T001 — Flush 2-line scrolling prompt + interrupt-hint placeholder (deltas 1+2)

In renderShell (chat-panel.ts): edit the #insrc-input CSS (:303) to drop the border/border-radius/background box chrome and its :focus border-color rule, and add overflow-y:auto while keeping rows=2 (a flush 2-line scrolling prompt); change #insrc-prompt (:291) align-self:flex-end→flex-start so the ❯ leads the top line only; and change the #insrc-input placeholder (:510) to 'message claude… (⌘↵ send · ^C interrupt)'. Presentation-only; the #insrc-prompt id/role=button/tabindex and setRunning are untouched.

**Acceptance checks:**
- renderShell's #insrc-input CSS has no border/border-radius/background box and includes overflow-y:auto, keeping rows=2
- #insrc-prompt CSS is align-self:flex-start (not flex-end)
- the #insrc-input placeholder equals 'message claude… (⌘↵ send · ^C interrupt)' and contains '^C interrupt'
- #insrc-prompt keeps id + role=button + tabindex (S002 send/stop control unchanged)

### 1.2 E202609307c219c74:S001:T002 — Read-only status bar via relocating provider+mode selects to the header (delta 3)

In renderShell (chat-panel.ts): move the #insrc-provider seg (:516) and the #insrc-modeseg span wrapping #insrc-mode (:517) verbatim out of the .statusbar and into the header .chrome region (:497) beside #insrc-history — same ids/options/classes so the :424-460 bootstrap wiring (pmode/pmseg/updatePermSeg/change-handler/session-restored) binds unchanged. Rebuild the .statusbar (:515-518) as read-only segments 'session <id>' + 'edits <mode>' + the existing '✓ idle' seg, with NO <select>. Add a mode→label map (manual→'review', edit-auto→'auto-edit', auto→'auto') for the 'edits' label and re-render it from pmode on the mode change-handler + session-restored (reusing the existing updatePermSeg path; no new message).

**Acceptance checks:**
- .statusbar renders read-only 'session <id>' + 'edits <mode>' + '✓ idle' segments and contains NO <select>
- #insrc-provider and #insrc-mode <select>s are emitted inside the header (.chrome) region, retaining their ids, options (manual/edit-auto/auto) and provider option list
- the 'edits <mode>' label maps manual→'review', edit-auto→'auto-edit', auto→'auto' and re-renders from pmode on change + session-restored
- no HostToWebview/WebviewToHost message shape changes (presentation-only)

### 1.3 E202609307c219c74:S001:T003 — Extend the renderShell *WebviewSource tests (ac1-ac4) and run the suite

Add additive assertions to vscode-plugin/src/chat/__tests__/chat-panel.test.ts over the renderShell source string: the flush-prompt CSS + top-line ❯ (ac1), the interrupt-hint placeholder (ac2), the read-only status bar + header-relocated selects + mode→label mapping (ac3), and re-run the S002 send/stop + provider/mode switching behaviour as a regression (ac4). Run `npm test` (tsx --test) and confirm green.

**Acceptance checks:**
- new unit assertions cover ac1 (flush prompt CSS + flex-start ❯), ac2 (placeholder), ac3 (read-only bar + relocated selects + label map)
- the S002 send/stop + provider/mode switching regression tests pass unchanged (ac4)
- the full vscode-plugin test suite (tsx --test) passes green

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| renderShell()'s #insrc-input CSS no longer has a border/border-radius/background box and includes overflow-y:auto with rows=2 (flush 2-line scrolling prompt) | `t1` |
| #insrc-prompt is top-aligned (align-self:flex-start), so the ❯ leads the first line only — not align-self:flex-end | `t1` |
| the #insrc-prompt element keeps id + role=button + tabindex (unchanged S002 control) | `t1` |
| the #insrc-input placeholder is exactly 'message claude… (⌘↵ send · ^C interrupt)' (contains '^C interrupt', no longer 'to send') | `t1` |
| the .statusbar renders read-only segments 'session <id>' + 'edits <mode>' + '✓ idle' and contains NO <select> (no provider/mode dropdown in the bar) | `t2` |
| the #insrc-provider + #insrc-mode <select>s are present INSIDE the header (.chrome) region of the source, retaining their ids + options (manual/edit-auto/auto) + the provider option list | `t2` |
| the 'edits <mode>' label maps the mode value to its short word (manual→'review', edit-auto→'auto-edit', auto→'auto') | `t2` |
| the existing S002 tests still pass: clicking #insrc-prompt posts one {type:'submit-turn', text}; Cmd/Ctrl+Enter still sends; empty input no-ops; setRunning toggles ❯↔■ on the one control | `t3` |
| the relocated #insrc-mode change-handler still posts {type:'set-permission-mode', mode} and updatePermSeg still applies the auto amber pill; the #insrc-provider change still starts a new chat with the picked provider | `t3` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD S001 — input-row deltas 1+2 (renderShell #insrc-input CSS :303, #insrc-prompt :291, placeholder :510)` — "Drop #insrc-input's box chrome + add overflow-y:auto (flush 2-line scroll), top-align #insrc-prompt (❯ top line only), placeholder 'message claude… (⌘↵ send · ^C interrupt)'. S002 send/stop unchanged."
- **[[c2]]** `prior-artifact` `LLD S001 — delta 3: relocate provider+mode selects to the header, read-only statusbar (renderShell :497 header, :515-518 statusbar, :424-460 mode wiring)` — "Move #insrc-provider + #insrc-modeseg/#insrc-mode verbatim into .chrome beside #insrc-history; rebuild .statusbar as read-only 'session <id> · edits <mode> · ✓ idle' with no <select>; edits label = pm"
- **[[c3]]** `prior-artifact` `LLD S001 — testStrategy (tsx --test *WebviewSource suite in vscode-plugin/src/chat/__tests__/chat-panel.test.ts)` — "Extend the renderShell source assertions for ac1-ac3 and re-run the S002 send/stop + provider/mode switching regression (ac4); the full vscode-plugin suite must pass under tsx --test."
