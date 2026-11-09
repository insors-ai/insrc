<!-- insrc:artifact BUILD-0d3939248a956860-s1 -->

# Build (standalone trivial) — Story s1

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-11-08T06:07:53.336Z  ·  **Updated:** 2026-11-08T06:32:29.634Z

**Commit:** 6be43781d

## Scope

Implement approved ISSUE-0d3939248a956860: (a) the chat history menu opens showing the most recent chats first whatever row is selected (incl. an unsaved draft), keyboard navigation intact; (b) no save path persists an untouched draft chat; (c) chats with no messages are excluded from the history-list feed (not deleted); (d) tests cover the opened menu's visible ordering/scroll intent and the no-empty-draft rule, including a check the fake DOM alone cannot satisfy.

## Triage rationale

bugfix/small routed issue -> build; one module (vscode-plugin/src/chat/chat-panel.ts, possibly the session stores' list()).

## Summary

Opening a chat menu now shows its top and focuses the selected row without scrolling to it, so a fresh chat's history menu shows the most recent chats instead of the oldest empty ones. Changing model/effort or edit mode on a draft no longer saves it, and the history feed leaves out chats with no message (via a new ChatSessionStore.hasMessages). The real-browser check (history-menu-browser.live.test.ts) is gated on INSRC_LIVE_TESTS=1 like the repo's other browser tests, so the gate's run skips it; it was run by the builder with INSRC_LIVE_TESTS=1 and passed (pass 1, skipped 0; log /tmp/zzh/live-final.out), and it failed with the fix reverted (menu scrollTop 727, expected 0). Scope: this Story's change is exactly commit 6be43781d (8 files under vscode-plugin/src/chat). The other working-tree modifications (vscode-plugin/package.json insrc.review.maxJsonBytes, docs/vscode-plugin-screen-recording-script.html, .insrc/artifacts/BUILD-1bd72813bfa795f4-S001.json) were already uncommitted before this Story started (present in the session-start git status) and belong to other work in this shared tree; they are deliberately not part of this build.

## Tasks validated

- ✗ `s1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` — **insrc-build** (2026-11-08T06:32:29.634Z)
- `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` — **insrc-build** (2026-11-08T06:32:29.634Z)
- `vscode-plugin/src/chat/__tests__/history-menu-browser.live.test.ts` — **insrc-build** (2026-11-08T06:32:29.634Z)
- `vscode-plugin/src/chat/__tests__/session-file-store.test.ts` — **insrc-build** (2026-11-08T06:32:29.634Z)
- `vscode-plugin/src/chat/__tests__/session-store.test.ts` — **insrc-build** (2026-11-08T06:32:29.634Z)
- `vscode-plugin/src/chat/chat-panel.ts` — **insrc-build** (2026-11-08T06:32:29.634Z)
- `vscode-plugin/src/chat/session-file-store.ts` — **insrc-build** (2026-11-08T06:32:29.634Z)
- `vscode-plugin/src/chat/session-store.ts` — **insrc-build** (2026-11-08T06:32:29.634Z)
