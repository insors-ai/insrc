<!-- insrc:artifact BUILD-ddc4ede1dbf84626-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-12T07:35:29.855Z  ·  **Updated:** 2026-10-12T07:36:33.075Z

**Commit:** c995dd34

## Summary

protocol.ts gains the optional firstIndex/total on session-restored, optional rowIndex on turn-event and user-row, the load-older and transcript-page messages, and their entries in the two type lists. Types only; no behaviour changes.

## Tasks validated

- ✓ `t1`
- ✓ `t2`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-ddc4ede1dbf84626-S001.json` — **insrc-build** (2026-10-12T07:36:33.075Z)
- `vscode-plugin/src/chat/__tests__/protocol.test.ts` — **insrc-build** (2026-10-12T07:36:33.075Z)
- `vscode-plugin/src/chat/__tests__/transcript-window.test.ts` — **insrc-build** (2026-10-12T07:36:33.075Z)
- `vscode-plugin/src/chat/protocol.ts` — **insrc-build** (2026-10-12T07:36:33.075Z)
- `vscode-plugin/src/chat/transcript-window.ts` — **insrc-build** (2026-10-12T07:36:33.075Z)
