<!-- insrc:artifact BUILD-c96a97a204fac22b-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-12T09:10:47.854Z  ·  **Updated:** 2026-10-12T09:20:05.206Z

**Commit:** 38ce31e0

## Summary

migrateChatSessionsFromMemento, in session-file-store.ts, moves each indexed session from the memento into the store's files: it writes rows then head when no head exists, appends the missing rows when the files hold a prefix, writes nothing when the files hold more, then reads the files back and compares them with the memento's copy before it removes the memento key. A session that fails, disagrees or is not a session is left untouched, logged and returned in kept; the index is rewritten to the kept ids or removed. A memento write that fails later is logged rather than left as an unhandled rejection. Nothing calls the migration yet; that is task 5.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-c96a97a204fac22b-S001.json` — **insrc-build** (2026-10-12T09:20:05.206Z)
- `vscode-plugin/src/chat/__tests__/fake-session-fs.ts` — **insrc-build** (2026-10-12T09:20:05.206Z)
- `vscode-plugin/src/chat/__tests__/session-file-store.test.ts` — **insrc-build** (2026-10-12T09:20:05.206Z)
- `vscode-plugin/src/chat/__tests__/session-store.test.ts` — **insrc-build** (2026-10-12T09:20:05.206Z)
- `vscode-plugin/src/chat/session-file-store.ts` — **insrc-build** (2026-10-12T09:20:05.206Z)
- `vscode-plugin/src/chat/session-store.ts` — **insrc-build** (2026-10-12T09:20:05.206Z)
