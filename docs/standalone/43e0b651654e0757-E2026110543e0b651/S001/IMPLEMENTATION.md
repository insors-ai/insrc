# Chat session run configuration — implementation evidence

Tracked issue: ISSUE-3fdb2b75703e6f09. Build: BUILD-43e0b651654e0757-S001.

The existing session store and open-chat path already persist and echo provider/model/effort. A fresh-store regression confirms values survive reload, A → B → A switching, and reach the next turn. No persistence schema or provider configuration changed.

Confirmed corrections in vscode-plugin/src/chat/chat-panel.ts:
- Resolve the exposed model alias when restoring controls. Show an explicit saved model rather than default when its catalog entry is absent; escape dynamic button text.
- Keep provider entries available before model definitions load or when they fail.
- Bound provider/model and effort popups to panel width; allow model panes to scroll. Consume popup clicks so slider interactions do not immediately dismiss it.

Validation: 301 affected tests passed (chat-panel, executable chat-shell, session-store, session-file-store, chat-theme). Root and plugin TypeScript checks passed. The new shell tests execute restoration and selector callbacks; the persistence test reopens a fresh file store and checks the next TurnRequest.

Live diagnosis through VS Code native UI and DevTools: the installed pre-fix extension has both handlers bound and a populated catalog. Programmatically clicking the provider button opens the menu. Reopening the saved DeepSeek session restores its model. With DevTools narrowing the editor, the old provider popup extends left beyond the webview (left -159.53px, width 573.53px). This confirms a visibility issue, but does not establish a general loss of saved provider/model/effort or explain all reported clicks. User reproduction details have been requested. Manual verification of this build is still pending; do not claim all original symptoms reproduced or resolved.

Existing unrelated docs/vscode-plugin-screen-recording-script.html changes are excluded.
