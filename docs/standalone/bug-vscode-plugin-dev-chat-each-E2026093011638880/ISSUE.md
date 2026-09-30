<!-- insrc:artifact ISSUE-1163888072faa9f2 -->

# Dev-chat renders each tool command twice and never collapses long commands

## Reproduction

In the VS Code dev-chat, ask the agent to run a multi-line Bash command. Observed: a boxed '▸ TOOL' row appears with '$ <command>' in full; when the tool finishes, a SECOND row appears that repeats '$ <command>' in full, followed by a separator and the collapsed (3-line preview) output. A long command is therefore shown twice, uncollapsed. Expected: one row per tool call — the command shown once (long commands collapsed to a short preview with the chevron) with the output attached beneath it, collapsed; a restored (replayed) chat shows the same single-row shape.

## Root cause

The live 'tool-call' TurnEvent maps to view-model kind 'tool-command' (collapsible:false) and is rendered by toolRow as a bordered box with the command. The subsequent 'tool-result' TurnEvent (which the claude/codex adapter correlates back to the command via tool_use_id) maps to kind 'tool-result' and is rendered by toolResultRow as an independent new row that re-emits '$ <command>' before the output. Nothing links the result to the already-rendered tool row, so the command is drawn twice. The command span is never wrapped in the sc1 collapsible primitive (only the result output is), so long commands are always shown in full. On replay, appendEvent persists the tool-call as a flat marker (tool label only) and the tool-result as a role:'tool-result' row carrying the command, so the restored shape differs from the live one.

## Fix intent

Render one row per tool invocation: when a tool result arrives, attach its (collapsed) output to the pending tool row for that call instead of drawing a new row that repeats the command; fall back to a standalone result row only when no pending tool row exists. Make the command itself collapsible when it exceeds ~2 lines, using the existing chevron collapse primitive. Keep the restored-chat rendering consistent with the live single-row shape. No change to TurnEvent kinds, transcript storage shape, or daemon IPC; bump the extension 0.5.2 -> 0.5.3.

## Citations

- **[[c1]]** `code` `vscode-plugin/src/chat/render-registry.ts` — "if (entry.kind === 'tool-call') { ... return { kind: 'tool-command', text: label, collapsible: false }; }"
- **[[c2]]** `code` `vscode-plugin/src/chat/render-registry.ts` — "function toolResultRow(vm,host){ ... wrap.appendChild(host.collapsible(out,{defaultCollapsed:true}));return wrap;}"
- **[[c3]]** `code` `vscode-plugin/src/chat/render-registry.ts` — "function toolRow(vm){ ... box.appendChild(cmd);wrap.appendChild(box);return wrap;}"
- **[[c4]]** `code` `vscode-plugin/src/chat/chat-panel.ts` — "if (ev.kind === 'tool-result') { s.transcript.push({ role: 'tool-result', ... output: ev.output, at: now() });"
- **[[c5]]** `code` `vscode-plugin/src/chat/cli-adapter.ts` — "command from the preceding tool_use (via tool_use_id) when we tracked one"
- **[[c6]]** `code` `vscode-plugin/src/chat/markers.ts` — "case 'tool-call': return { cssClass: MARKER_CLASS.tool, label: ... event.tool };"
