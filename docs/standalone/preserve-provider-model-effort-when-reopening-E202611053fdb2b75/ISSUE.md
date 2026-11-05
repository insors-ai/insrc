<!-- insrc:artifact ISSUE-3fdb2b75703e6f09 -->

# Preserve provider, model and effort when reopening chat history

## Reproduction

In VS Code, select a non-default provider/model/effort and send a chat message. Open a different session, then reopen the original from history. User reports settings display defaults instead of the original configuration. Expected: each session restores its own provider/model/effort and the next turn uses those settings. Repeat across providers, active-chat switching and extension reload.

Related report: select a new session. The provider/model/effort controls show defaults, and clicking them does not open the provider/model menu or effort selector. Expected: new-session controls open and allow configuration before the first message.

## Root cause

Diagnosis is partial: ChatSession has per-session provider/model/effort; vscode-plugin/src/chat/session-file-store.ts headOf/sessionOf retain them, and vscode-plugin/src/chat/chat-panel.ts open-chat calls postRestored, which emits run-config. Thus missing persistence fields are not established as the cause. A confirmed presentation defect is that server and webview model labels resolve only exact catalog IDs and display 'default' for any unmatched saved nonempty model (including aliases or catalog-unavailable models). Existing tests check emitted configuration and script text rather than executing history-switch restoration end to end. The precise cause of the reported effort/provider reset still requires reproduction; do not treat the label defect as explaining all three fields.

The user also reports unresponsive new-session controls. The click handlers for both selectors exist in vscode-plugin/src/chat/chat-panel.ts; the runtime cause of their failure is not yet established. Investigate this together with restoration, including webview initialization and popup visibility; do not assume the label fallback explains unresponsive controls.

## Fix intent

Restore and display each session's existing run configuration consistently when switching history/active sessions and reloading. Show an explicit saved model even if its catalog entry is unavailable; preserve valid aliases. Diagnose and correct the remaining reported reset with executable regression coverage of the actual restore path and next-turn request. Legacy sessions without model/effort continue using defaults. Keep runtime/provider configuration unchanged. Ensure a new session exposes working provider/model and effort selectors before its first turn, and cover selector opening and selection in executable webview tests.

## Citations

- **[[c1]]** `code` `vscode-plugin/src/chat/chat-panel.ts`
- **[[c2]]** `code` `vscode-plugin/src/chat/session-store.ts`
- **[[c3]]** `code` `vscode-plugin/src/chat/session-file-store.ts`
- **[[c4]]** `stakeholder` `User report in this chat: switching chat sessions from history always defaults provider/model/effort.`
- **[[c5]]** `stakeholder` `User report in this chat: new-session provider/model/effort controls show defaults and clicking them does not open selections.`
