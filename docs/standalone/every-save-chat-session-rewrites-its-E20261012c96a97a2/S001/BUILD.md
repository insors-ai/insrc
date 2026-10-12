<!-- insrc:artifact BUILD-c96a97a204fac22b-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-12T09:10:47.854Z  ·  **Updated:** 2026-10-12T09:17:10.214Z

**Commit:** d73cc765

## Summary

The file store's save now handles several windows, whole-file writes, failing writes and the session cap. It records per id the rows file's size as it last left or read it; when the file has grown another writer appended, so the held object still appends only its own new rows, stays tracked, and is never handed out by get again. The rows file is written whole in three cases only: a never-tracked object for an id whose files exist, a tracked object whose transcript got shorter, and a tracked object whose head is gone or whose rows file is shorter than recorded (as after an eviction), so the session comes back complete. A save that creates a head applies the cap by savedAt, never against the session being saved. Both mutations named in the test titles were run by hand and each made its test fail.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-c96a97a204fac22b-S001.json` — **insrc-build** (2026-10-12T09:17:10.214Z)
- `vscode-plugin/src/chat/__tests__/fake-session-fs.ts` — **insrc-build** (2026-10-12T09:17:10.214Z)
- `vscode-plugin/src/chat/__tests__/session-file-store.test.ts` — **insrc-build** (2026-10-12T09:17:10.214Z)
- `vscode-plugin/src/chat/__tests__/session-store.test.ts` — **insrc-build** (2026-10-12T09:17:10.214Z)
- `vscode-plugin/src/chat/session-file-store.ts` — **insrc-build** (2026-10-12T09:17:10.214Z)
- `vscode-plugin/src/chat/session-store.ts` — **insrc-build** (2026-10-12T09:17:10.214Z)
