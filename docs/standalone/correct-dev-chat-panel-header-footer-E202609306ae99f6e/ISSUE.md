<!-- insrc:artifact ISSUE-6ae99f6e97a4150e -->

# Fix dev-chat panel header/footer layout: session dropdown alone in the header, provider + mode in the footer

## Reproduction

Open the dev-chat panel (insrc.chat.enabled). Observed vs expected in the panel chrome:
1. HEADER shows a 'session' label + the active-session TITLE text + the session dropdown, AND the provider dropdown (claude) AND the edits/mode dropdown — crowded and, together with the status bar below, the session is shown twice.
2. The FOOTER status bar is a read-only line 'session <id> · edits <mode> · ✓ idle' — the 'session <id>' duplicates the header's session dropdown selection, and '✓ idle' duplicates what the progress/spinner status already conveys.
Expected: HEADER = only the session dropdown, right-aligned (no extra session text). FOOTER = the interactive provider dropdown then the approval-mode (edits) dropdown, left-to-right; no session-id text, no idle marker.

## Root cause

The terminal-prompt-fidelity change (ISSUE-c96399d1) relocated the functional provider + mode <select>s INTO the header .chrome .right and rebuilt the footer .statusbar as a read-only mirror line. In renderShell the header row emits, in order, a 'session' seglabel + the #insrc-sesstitle active-name span + the #insrc-history session dropdown, then the #insrc-provider select and the #insrc-modeseg/#insrc-mode select; the status bar emits a read-only #insrc-statussess 'session <id>' segment, a #insrc-statusedits 'edits <mode>' segment, and a '✓ idle' ok segment. So the header carries three controls plus redundant session text, and the footer redundantly re-states the session + an idle marker — the misplacement + duplication the report describes.

## Fix intent

Rebalance the panel chrome so the header holds ONLY the session dropdown (right-aligned) and the footer holds the interactive provider + approval-mode dropdowns. Intent (not the diff): (1) keep the session history dropdown alone in the header and drop the redundant 'session' seglabel + active-name text; (2) move the provider select and the mode/edits select from the header into the footer status bar, left-to-right (provider then edits), preserving their element ids so the existing change-handlers + permission-mode wiring keep working; (3) delete the read-only session + edits status segments and the '✓ idle' marker, and remove the now-dead JS that fed them. No behavior/contract/IPC change — presentation only.

## Citations

- **[[c1]]** `code` `vscode-plugin/src/chat/chat-panel.ts:520 (renderShell header .chrome .right)` — "<span class="right"><span class="seglabel">session</span><span class="sesstitle" id="insrc-sesstitle"></span><select id="insrc-history" ...> ... <select id="insrc-provider" ...> ... <span class="seg" "
- **[[c2]]** `code` `vscode-plugin/src/chat/chat-panel.ts:541 (renderShell .statusbar)` — "<div class="statusbar"><span class="seg">session <b id="insrc-statussess"></b></span><span class="seg">edits <b id="insrc-statusedits">review</b></span><span class="seg ok">✓ idle</span>"
- **[[c3]]** `code` `vscode-plugin/src/chat/chat-panel.ts:444 (updSessSeg / updatePermSeg + #insrc-sesstitle wiring)` — "function updSessSeg(){if(seSess)seSess.textContent=...} ; function updatePermSeg(){if(pmseg)pmseg.className=...;if(seEdits)seEdits.textContent=editsLabel(pmode);} — seSess=#insrc-statussess, seEdits=#"
