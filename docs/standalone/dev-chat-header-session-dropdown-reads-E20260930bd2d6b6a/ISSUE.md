<!-- insrc:artifact ISSUE-bd2d6b6a98f48dc6 -->

# Dev-chat session dropdown reads as two controls — its history glyph looks detached from the label and arrow

## Reproduction

Steps: (1) Install the insrc VS Code extension at 0.5.4 (the first release in which the header glyph actually renders) and open the insrc dev-chat view. (2) Start or select a session so the header switcher shows a real session name rather than the empty 'new…' placeholder. (3) Look at the session switcher in the panel header.

Observed: the header reads as two separate widgets — a small dim clock mark, a gap, and then the session name followed by a down-arrow (for example `[claude] Ass…` truncated). A user looking at it reported it as 'two history dropdowns, the older down arrow and the new one' and asked why a second control had appeared.

Expected: one control. The clock is meant to be the leading icon OF the session switcher, signalling that the dropdown selects a chat session; it should visibly belong to the label and arrow beside it.

There is in fact only one control. The header emits exactly one session `<select>`, and the rendered page contains exactly one element with that id and one CSS rule targeting it. A headless render of the real shell HTML reproduced the reported appearance exactly, confirming the doubling is purely visual.

## Root cause

Three properties of the single rule that styles the header switcher combine so that nothing visually binds the icon to the rest of the control:

1. A gap. The glyph is painted as a background layer positioned at the control's left edge at 12px wide, while the label is pushed in by a 20px left padding — so roughly 6px of empty space separates the icon from the first character of the session name.

2. A contrast step. The glyph strokes the muted grey `#6b7688` (the `--muted` token) while the label renders in `#c6cdd8` (the `--fg` token). The icon is therefore two tones dimmer than the text it belongs to.

3. No container. The shared select style renders every switcher transparent and borderless, so there is no box, fill or outline enclosing icon, label and arrow as one object.

Separately, each choice is defensible; together they remove every cue of grouping. The eye sees a dim mark, a space, then a brighter label ending in an arrow, and resolves that into two objects rather than one. The effect is strongest with a real session name, because the bright truncated label then sits between two dim marks (the clock on the left, the arrow on the right), which reinforces the split reading.

This was latent rather than new: the glyph was added two releases earlier but never painted, because the page's security policy blocked it. Fixing that policy made the glyph visible for the first time and so surfaced a grouping problem that had always been in the rule.

## Fix intent

Make the session switcher read unambiguously as a single control by giving its icon, label and arrow one shared visual container, instead of leaving three marks floating on the header background.

The chosen treatment — picked by the user from three rendered options against the real shell — is a chip: a subtle border, a faint fill and a small corner radius enclosing the whole switcher, with the icon repositioned so it sits inside that container's padding rather than at the bare left edge. This binds the parts by enclosure, which survives whatever the session name happens to be, rather than relying only on tightening the gap and lifting the icon's tone.

Two constraints on the change. It is presentation-only: the header markup, the control's behaviour, and the session list it drives all stay exactly as they are, and no new asset, symbol or style rule is introduced. And it knowingly diverges from the shared borderless switcher style used by the provider and edits controls in the footer status bar — the header switcher becomes the only enclosed one. That divergence is intended, because this is the sole control in the header and the only one carrying an icon, but it should be recorded as a deliberate departure rather than allowed to look like drift.

## Citations

- **[[c1]]** `code` `vscode-plugin/src/chat/chat-panel.ts:328` — "`.chrome #insrc-history{max-width:16ch;padding-left:20px;` +"
- **[[c2]]** `code` `vscode-plugin/src/chat/chat-panel.ts:329` — "`background-image:url("data:image/svg+xml,%3Csvg … stroke='%236b7688' stroke-width='1.4' …%3E%3C/svg%3E"),linear-gradient(45deg,transparent 50%,var(--muted) 50%),linear-gradient(135deg,var(--muted) 50"
- **[[c3]]** `code` `vscode-plugin/src/chat/chat-panel.ts:330` — "`background-position:left 2px center,calc(100% - 6px) 55%,calc(100% - 3px) 55%;background-size:12px 12px,3px 3px,3px 3px;background-repeat:no-repeat,no-repeat,no-repeat;}` +"
- **[[c4]]** `code` `vscode-plugin/src/chat/chat-panel.ts:320` — "`.segsel{appearance:none;-webkit-appearance:none;background:transparent;border:none;color:var(--fg);font-family:var(--font);font-size:12px;font-weight:500;line-height:1.2;padding:0 14px 0 2px;margin:0"
- **[[c5]]** `code` `vscode-plugin/src/chat/chat-panel.ts:266` — "`--bg:#0b0e14;--bg-alt:#10141c;--bg-inset:#0d1119;--panel:#11161f;--fg:#c6cdd8;--fg-strong:#e8edf4;--muted:#6b7688;--dim:#4a5464;` +"
- **[[c6]]** `code` `vscode-plugin/src/chat/chat-panel.ts:515` — "`<span class="right"><select id="insrc-history" class="segsel ${histCls}" aria-label="session"><option value="">new…</option></select></span>` +"
- **[[c7]]** `code` `vscode-plugin/src/chat/chat-panel.ts:536` — "`<span class="seg"><select id="insrc-provider" class="segsel ${provCls}" aria-label="provider"${provDisabled}>${providerOpts}</select></span>` +"
- **[[c8]]** `code` `vscode-plugin/src/chat/chat-panel.ts:256` — "const csp = `default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';`;"
- **[[c9]]** `prior-artifact` `docs/standalone/dev-chat-session-dropdown-history-clock-E20260930095906ba/ISSUE.md` — "Dev-chat session dropdown shows only a bare down-arrow — the history glyph is blocked by the webview CSP"
- **[[c10]]** `stakeholder` `User report with screenshot, 2026-09-30` — "now there are 2 history dropdown, the older down arrow and the new one … check the image, the selected text appears between the icon and the arrow"
