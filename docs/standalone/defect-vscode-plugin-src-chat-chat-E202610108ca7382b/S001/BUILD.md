<!-- insrc:artifact BUILD-8ca7382b0952a539-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-10-11T05:30:46.538Z  ·  **Updated:** 2026-10-11T06:38:08.380Z

**Commit:** ce7b8ee5

## Summary

Switched createChatPanelHost to turn-lifecycle.ts: runTurn keeps the echo, title and request and hands the turn to turns.start with a TurnSink; followLiveTurn uses turns.follow; cancel-turn, chat switches, dispose and adopt use stop/detach/invalidate; decide uses turns.live. The moved turn state and functions left the closure (chat-panel.ts 1220 -> 948 lines). No test file or extension.ts changed.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/ISSUE-8ca7382b0952a539.json` — **insrc-build** (2026-10-11T06:38:08.380Z)
