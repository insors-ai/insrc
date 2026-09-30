<!-- insrc:artifact ISSUE-c96399d148fcc0b6 -->

# Dev-chat input renders as a bordered textarea box instead of the approved flush terminal prompt

## Reproduction

Open the insrc dev-chat panel in VS Code (0.5.0). OBSERVED: the message input is a large rounded-border textarea box with the '❯' glyph sitting to its left (bottom-aligned); the placeholder reads 'message claude…  (⌘↵ to send)'; the bottom status bar reads 'claude ▾ · mode Auto ▾ · ✓ idle'. EXPECTED (the approved S002 mock): the input reads as a TRUE terminal prompt — a flush 2-line-tall view that scrolls vertically for overflow (no border/box chrome), with the '❯' indicator on the TOP line only; the placeholder reads 'message claude… (⌘↵ send · ^C interrupt)'; the status bar reads 'session <id> · edits <mode> · ✓ idle'. The leading-'❯'-is-send/stop behaviour from S002 is correct and must stay.

## Root cause

S002 (which was meant to realize this mock) was deliberately SCOPED DOWN during design to only relocate the send control: its LLD states 'Add a leading > prompt control … keep #insrc-input's id/placeholder/CSS unchanged' (S002 LLD.md), so the input row still renders the pre-S002 bordered textarea. In chat-panel.ts the '#insrc-input' textarea keeps its box chrome ('border:1px solid var(--border-lit);border-radius:9px;padding:9px 11px;min-height:40px;max-height:120px'), and the leading '#insrc-prompt' control is 'align-self:flex-end' (bottom-aligned), so it reads as a box with a glyph beside it, not a flush prompt. The placeholder literal is 'message claude…  (⌘↵ to send)' (no interrupt hint). The '.statusbar' renders the functional provider + mode dropdown segments rather than the mock's read-only 'session <id>' + 'edits <mode>' segments. Net: the build faithfully implements the reduced S002 LLD; the mock's flush 2-line prompt, its placeholder hint, and its status-bar composition were never built — a fidelity gap versus the approved mock, not a regression.

## Fix intent

Bring the dev-chat input up to the approved mock, presentation-only in the eval'd webview source (chat-panel.ts) with no event/protocol/persistence change and the S002 send/stop control unchanged: (1) the input reads as a flush terminal prompt showing a 2-line-tall view that scrolls vertically for overflow — remove the textarea's border/box chrome and top-align the '❯' so it appears on the first line only, not bottom-aligned or per-line; (2) the placeholder shows the '⌘↵ send · ^C interrupt' hint instead of '⌘↵ to send'; (3) the status bar shows a 'session <id>' segment and an 'edits <mode>' segment (mapped to the existing session id + the edit/permission mode already available to the webview) in place of the current 'claude ▾ / mode Auto ▾' segments. Whether the functional provider/mode dropdowns relocate (e.g. into the header switcher) or are otherwise preserved is a design decision for the LLD — not decided here; no send affordance or protocol shape changes.

## Citations

- **[[c1]]** `code` `vscode-plugin/src/chat/chat-panel.ts:303` — "#insrc-input{...border:1px solid var(--border-lit);border-radius:9px;padding:9px 11px;min-height:40px;max-height:120px;...} — the input keeps its bordered-box chrome (should be a flush prompt)."
- **[[c2]]** `code` `vscode-plugin/src/chat/chat-panel.ts:291` — "#insrc-prompt{...align-self:flex-end;...} — the '❯' is bottom-aligned beside the box; the mock wants it on the top line of a flush 2-line prompt."
- **[[c3]]** `code` `vscode-plugin/src/chat/chat-panel.ts` — "placeholder="message claude…  (⌘↵ to send)" — the built placeholder lacks the '^C interrupt' hint the mock shows ('⌘↵ send · ^C interrupt')."
- **[[c4]]** `code` `vscode-plugin/src/chat/chat-panel.ts:305` — ".statusbar{...} renders the provider + mode dropdown segments; the mock shows read-only 'session <id>' + 'edits <mode>' segments instead."
- **[[c5]]** `prior-artifact` `docs/epics/vs-code-dev-chat-ux-polish-E202609298e8859ca/S002/LLD.md:168` — "'Add a leading > prompt control … keep #insrc-input's id/placeholder/CSS unchanged' — S002 was scoped to only the send control, deliberately leaving the box/placeholder/status-bar unchanged."
