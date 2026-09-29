<!-- insrc:artifact PLAN-8e8859ca0ca83612-s2 -->

# Plan: E202609298e8859ca:S002

## Summary

**Epic:** `vs-code-dev-chat-ux-polish`
**LLD run:** `wf-1790682912046-cmle6g`
**LLD effective hash:** `f5c70630aa71...`

Building S002 reshapes the dev-chat input row in the one eval'd webview source in chat-panel.ts so it reads as a terminal prompt: a leading '>' becomes the send control (and the stop control while a turn runs) reusing the existing doSubmit()/submit-turn path unchanged, the redundant trailing send button is retired, and the assistant bubble is widened from 88% to ~90%. The work is pure webview markup/CSS/click-wiring with no event, protocol, or persistence change, verified through the existing eval'd *WebviewSource fakeChannel test pattern.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add leading '>' terminal-prompt control + CSS before the textarea | S | — | unit: panel HTML renders a leading '>' prompt control before #insrc-input | [[c1]] |
| 2 | **`t2`** Wire the '>' control to doSubmit / cancel-turn and relocate the setRunning send/stop indicator | S | `t1` | unit: clicking '>' with non-empty input posts exactly one {type:'submit-turn', text} identical to the old send button; unit: clicking '>' with empty/whitespace input posts nothing (reused doSubmit guard); unit: Cmd/Ctrl+Enter in the textarea still sends via the unchanged keydown path; unit: while running, activating '>' posts cancel-turn and setRunning toggles the one control's send/stop state | [[c1]] |
| 3 | **`t3`** Remove the trailing #insrc-send button and its now-unused CSS | S | `t2` | unit: panel HTML no longer renders the separate trailing #insrc-send button | [[c1]] |
| 4 | **`t4`** Bump .insrc-bubble--assistant max-width 88% -> ~90% | S | — | unit: .insrc-bubble--assistant max-width is ~90% and user bubble (82%) + .insrc-msg wrapper (100%) widths are unchanged | [[c1]] |

### 1.1 E202609298e8859ca:S002:T001 — Add leading '>' terminal-prompt control + CSS before the textarea

In the eval'd webview source in chat-panel.ts, add a leading '>' prompt control element (e.g. id 'insrc-prompt') before #insrc-input and add its terminal-prompt CSS (green shell-prompt look, a comfortably clickable target). Keep #insrc-input's id/placeholder/CSS unchanged.

**Acceptance checks:**
- The input-row HTML renders a leading '>' prompt control positioned before #insrc-input.
- The '>' control is styled as a terminal-green shell prompt and is a comfortably clickable target.
- #insrc-input's id, placeholder, and existing CSS are unchanged.

### 1.2 E202609298e8859ca:S002:T002 — Wire the '>' control to doSubmit / cancel-turn and relocate the setRunning send/stop indicator

Wire the leading '>' control's click to the EXISTING doSubmit() when idle (send) and to cancel-turn while a turn is running (stop), and relocate the setRunning send/stop state indicator from #insrc-send onto the '>' control. Leave doSubmit, the submit-turn message/payload, and the Cmd/Ctrl+Enter keydown path untouched.

**Acceptance checks:**
- Clicking the '>' control with non-empty input calls the existing doSubmit() and posts exactly one {type:'submit-turn', text} identical to the old send button.
- Clicking the '>' control while a turn is running posts cancel-turn (the existing stop path).
- setRunning(r) toggles the '>' control's send/stop state (send at rest, stop while running); doSubmit and the Cmd/Ctrl+Enter path are unchanged.

### 1.3 E202609298e8859ca:S002:T003 — Remove the trailing #insrc-send button and its now-unused CSS

Remove the trailing #insrc-send button element and its now-unused CSS from the input row so there is exactly one send/stop control (the leading '>'); the Cmd/Ctrl+Enter keydown path is unchanged.

**Acceptance checks:**
- The trailing #insrc-send button element no longer renders in the panel HTML.
- The #insrc-send CSS is removed (no dead rule).
- Exactly one send/stop control exists after removal (the leading '>'), with no send/stop state drift between two controls.

### 1.4 E202609298e8859ca:S002:T004 — Bump .insrc-bubble--assistant max-width 88% -> ~90%

In the panel style string, bump the .insrc-bubble--assistant max-width from 88% to ~90% (CSS only). Leave .insrc-bubble--user (82%) and the .insrc-msg wrapper (100%) widths unchanged.

**Acceptance checks:**
- .insrc-bubble--assistant max-width is ~90% in the panel style string.
- .insrc-bubble--user (82%) and .insrc-msg wrapper (100%) widths are unchanged.
- No structural/render-model change — CSS-only.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| The eval'd panel HTML renders a leading '>' prompt control before #insrc-input and no longer renders the separate trailing #insrc-send button (ac1). | `t1`, `t3` |
| Clicking the leading '>' control with non-empty input posts exactly one {type:'submit-turn', text:<box value>} on the fake channel — identical payload to the pre-change send button (ac2/lc1). | `t2` |
| Clicking '>' with an empty/whitespace input posts nothing (doSubmit guard reused). | `t2` |
| Cmd/Ctrl+Enter in the textarea still sends (the keydown path is unchanged). | `t2` |
| While a turn is running, activating the leading control posts cancel-turn (the stop path), and setRunning toggles the ONE control's send/stop state (no second control). | `t2`, `t3` |
| .insrc-bubble--assistant max-width is ~90% in the panel style string (bumped from 88%). | `t4` |
| .insrc-bubble--user (82%) and .insrc-msg wrapper (100%) widths are unchanged (only the assistant cap moved). | `t4` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s2 — S002 input-row terminal-prompt + send/stop wiring + trailing-button removal + assistant bubble width bump (contractDetails.api + migration steps 1-4 + invariantsToPreserve)` — "The send intent is unchanged: activating the leading '>' calls the EXISTING doSubmit() which posts the same {type:'submit-turn', text} message; ... Exactly one send/stop control exists after the chang"
