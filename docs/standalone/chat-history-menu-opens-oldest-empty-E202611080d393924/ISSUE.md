<!-- insrc:artifact ISSUE-0d3939248a956860 -->

# Chat history menu opens on the oldest, empty chats so titles look missing and switching looks broken

## Reproduction

1. Have a chat history that includes some empty chats (no messages) titled "new chat" — e.g. the 8 such chats from 2026-09-26 in ~/.insrc/chat-sessions.
2. Open (or reload) the VS Code insrc chat panel. It starts on a new, unsaved chat.
3. Click the session (history) dropdown at the top right.

Observed: the menu opens scrolled to the bottom. Only the oldest entries are visible — provider icons next to "new chat" — and the most recent, titled chats are scrolled out of view above. Clicking one of those rows opens an empty chat that looks identical to the fresh one, so it seems nothing switched.
Expected: the menu opens showing the most recent chats (with their titles) first, and empty chats never appear in history.

Reproduced in headless Chrome by replaying the host's real messages (history-list with 21 entries from a copy of ~/.insrc/chat-sessions) into the real webview shell: the open menu showed only "new chat" rows with the selected "new…" row focused at the bottom. Once a chat has been started, the selected row is that chat (at the top), and the menu opens at the top — which is why it "starts working" after the first message.

## Root cause

Two cooperating causes.

(1) Menu scroll position. When the panel opens, the active session is an unsaved draft, so it is not in the history list and the only selected row is the trailing "new…" row that renderHistoryMenu appends after every history entry (vscode-plugin/src/chat/chat-panel.ts:2410). openChatMenu calls focusMenu (vscode-plugin/src/chat/chat-panel.ts:2413-2414), which focuses the selected row; focusing an element inside the height-capped, scrollable menu scrolls it into view, so the menu opens scrolled to the very bottom. The unit tests run the webview script against a fake DOM with no layout or scrolling, so they never saw this.

(2) Empty chats in history. The history feed is the store's full list, posted unfiltered by postHistory (vscode-plugin/src/chat/chat-panel.ts:586), so sessions that were saved without ever having a message appear as "new chat" rows. Such sessions still get written: the set-edit-mode handler saves the active session unconditionally (vscode-plugin/src/chat/chat-panel.ts:3123), which persists a draft that has had no turn, while the sibling save at vscode-plugin/src/chat/chat-panel.ts:3228 is guarded by `deps.store.get(session.id) !== undefined`. Draft sessions are meant to enter history only on their first turn (the comment at vscode-plugin/src/chat/chat-panel.ts:1919-1921).

## Fix intent

(a) Opening the history menu always shows the most recent chats first, whatever row is selected — including when the active chat is a new, unsaved one — while keyboard navigation of the menu keeps working.
(b) A new chat is never written to history before its first message: no save path persists an untouched draft.
(c) Chats with no messages do not appear in the history list, so the empty "new chat" sessions already on disk stop showing up (they are not deleted).
(d) Tests cover the opened menu's visible ordering/scroll intent and the no-empty-draft rule, including a check that cannot be satisfied by the fake DOM alone.

## Citations

- **[[c1]]** `code` `vscode-plugin/src/chat/chat-panel.ts:2410` — "function renderHistoryMenu(){histMenu.innerHTML='';for(var i=0;i<histEntries.length;i++)histMenu.appendChild(historyRow(histEntries[i]));histMenu.appendChild(mitem(histSel==='','new…','starts a new ch"
- **[[c2]]** `code` `vscode-plugin/src/chat/chat-panel.ts:2413-2414` — "function focusMenu(menu){var rows=chatRows(menu);var sel=null;...var target=sel||rows[0]||null;if(target)focusRow(rows,target);"
- **[[c3]]** `code` `vscode-plugin/src/chat/chat-panel.ts:586` — "const postHistory = (): void => post({ type: 'history-list', chats: [...deps.store.list()] });"
- **[[c4]]** `code` `vscode-plugin/src/chat/chat-panel.ts:3123` — "deps.store.save(session);"
- **[[c5]]** `code` `vscode-plugin/src/chat/chat-panel.ts:3228` — "if (deps.store.get(session.id) !== undefined) deps.store.save(session);"
- **[[c6]]** `code` `vscode-plugin/src/chat/chat-panel.ts:1919-1921` — "A DRAFT session (in-memory, not persisted): opening the chat does not save an empty session to history; it enters the store only on the first turn"
- **[[c7]]** `prior-artifact` `BUILD-546198e11c24c1e3-s1` — "Story 546198e11c24c1e3/s1: custom button triggers + role=menu panels for the history and active-chat dropdowns"
