<!-- insrc:artifact ISSUE-c96a97a204fac22b -->

# Every save of a chat session rewrites its whole transcript

## Reproduction

Use a dev chat session with a long history and run a turn. Observed (from the code; not yet timed): each save writes the whole session record, every transcript row included, to VS Code global state. During a turn this happens up to every 500 ms while output is handled (the live-turn cursor save), again on each permission or selection outcome, and at the turn's end. The amount written per save grows with the session's whole history, not with what changed. Expected: a save writes an amount that depends on what changed since the last save. Not yet established: how much time a save of a large session actually takes; measure it on a real long session before choosing the fix.

## Root cause

The store keeps one record per session with the transcript inline: createMementoChatSessionStore's save() calls `memento.update(SESSION_PREFIX + session.id, session)` with the whole ChatSession (c1). The turn lifecycle's cursorTracker saves the session at most every CURSOR_SAVE_MS (500 ms) while a turn's lines are handled (c2), and the panel host saves on each outcome and at the terminal event (c3). list() also reads every stored session in full to build the history summaries (c1). None of these can write or read less than the whole record.

## Fix intent

Make the cost of a save depend on what changed, not on the length of the history, for example by keeping the transcript in separate pages from the session's head record. Existing sessions must keep working and must not be lost or corrupted by the change, including when several windows share the same global state and when a session is evicted. Building the history list should not need every transcript. The view-side paging from the earlier design (LLD-ddc4ede1dbf84626-S001) is separate and does not depend on this.

## Citations

- **[[c1]]** `code` `vscode-plugin/src/chat/session-store.ts` — "void memento.update(SESSION_PREFIX + session.id, session);"
- **[[c2]]** `code` `vscode-plugin/src/chat/turn-lifecycle.ts` — "if (Date.now() - last >= CURSOR_SAVE_MS) saveNow();"
- **[[c3]]** `code` `vscode-plugin/src/chat/chat-panel.ts` — "trySave(s); // persist the turn's transcript rows (an errored turn's too); a failing save never breaks the turn"
- **[[c4]]** `prior-artifact` `docs/standalone/page-dev-chat-transcript-show-latest-E20261012ddc4ede1/S001/LLD.md` — "Should the stored session also be split into pages (alternative a2), so a save during a turn stops rewriting the whole transcript?"
- **[[c5]]** `stakeholder` `user, 2026-10-12` — "log this as an issue"
