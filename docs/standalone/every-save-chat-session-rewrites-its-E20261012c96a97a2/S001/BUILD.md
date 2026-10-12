<!-- insrc:artifact BUILD-c96a97a204fac22b-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-12T09:10:47.854Z  ·  **Updated:** 2026-10-12T09:21:45.177Z

**Commit:** 923ae9c7

## Summary

extension.ts now runs migrateChatSessionsFromMemento over context.globalState first, builds the chat store with createFileChatSessionStore over join(PATHS.insrc, 'chat-sessions') with the same cap of 200 and the same onEvict, and gives the output sweep the store's ids plus the ids the migration left in globalState. It no longer constructs the Memento store. The wiring test's pinned assertions were updated and one test added for the order and the keep set. The migration is synchronous and runs once at activation; its cost on the user's real 29.6 MB state has not been measured yet.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-c96a97a204fac22b-S001.json` — **insrc-build** (2026-10-12T09:21:45.177Z)
- `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` — **insrc-build** (2026-10-12T09:21:45.177Z)
- `vscode-plugin/src/chat/__tests__/fake-session-fs.ts` — **insrc-build** (2026-10-12T09:21:45.177Z)
- `vscode-plugin/src/chat/__tests__/session-file-store.test.ts` — **insrc-build** (2026-10-12T09:21:45.177Z)
- `vscode-plugin/src/chat/__tests__/session-store.test.ts` — **insrc-build** (2026-10-12T09:21:45.177Z)
- `vscode-plugin/src/chat/session-file-store.ts` — **insrc-build** (2026-10-12T09:21:45.177Z)
- `vscode-plugin/src/chat/session-store.ts` — **insrc-build** (2026-10-12T09:21:45.177Z)
- `vscode-plugin/src/extension.ts` — **insrc-build** (2026-10-12T09:21:45.177Z)
