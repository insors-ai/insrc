<!-- insrc:artifact BUILD-c96a97a204fac22b-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-12T09:10:47.854Z  ·  **Updated:** 2026-10-12T09:14:01.747Z

**Commit:** 1c71c3f5

## Summary

New session-file-store.ts: the SessionFilesFs seam with its node implementation, and createFileChatSessionStore keeping each session as a head file and an append-only rows file. A save appends the rows the session object has not yet written and replaces the head through a temporary file and a rename; get reads once and hands back the same object while the files are unchanged; list reads heads only. The tests run over a new in-memory fake that records every file call. The rules for several windows, whole-file writes, failing writes and the session cap are task 3 and are not in this commit.

## Tasks validated

- ✓ `t1`
- ✓ `t2`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-c96a97a204fac22b-S001.json` — **insrc-build** (2026-10-12T09:14:01.747Z)
- `vscode-plugin/src/chat/__tests__/fake-session-fs.ts` — **insrc-build** (2026-10-12T09:14:01.747Z)
- `vscode-plugin/src/chat/__tests__/session-file-store.test.ts` — **insrc-build** (2026-10-12T09:14:01.747Z)
- `vscode-plugin/src/chat/__tests__/session-store.test.ts` — **insrc-build** (2026-10-12T09:14:01.747Z)
- `vscode-plugin/src/chat/session-file-store.ts` — **insrc-build** (2026-10-12T09:14:01.747Z)
- `vscode-plugin/src/chat/session-store.ts` — **insrc-build** (2026-10-12T09:14:01.747Z)
