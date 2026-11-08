<!-- insrc:artifact BUILD-d8b2fe8e08f1d1be-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-11-08T07:05:40.423Z  ·  **Updated:** 2026-11-08T08:08:26.928Z

**Commit:** 179db4aad

## Summary

End-to-end concurrent chat and extension TypeScript checks passed. The full sweep had 1,671 passes, 19 failures, and 9 skips. Sixteen failures reproduced before the story, two isolated checks passed after rerun, and the session-lock timing failure passed in isolation. Manual VS Code verification is pending and its checklist is in VS-CODE-SMOKE.md.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✗ `t7`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `vscode-plugin/src/chat/__tests__/chat-queue-setup.test.ts` — **insrc-build** (2026-11-08T08:08:26.928Z)
- `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` — **insrc-build** (2026-11-08T08:08:26.928Z)
- `vscode-plugin/src/chat/__tests__/turn-lifecycle.test.ts` — **insrc-build** (2026-11-08T08:08:26.928Z)
- `vscode-plugin/src/chat/chat-panel.ts` — **insrc-build** (2026-11-08T08:08:26.928Z)
- `vscode-plugin/src/chat/chat-queue-setup.ts` — **insrc-build** (2026-11-08T08:08:26.928Z)
- `vscode-plugin/src/chat/cli-adapter.ts` — **insrc-build** (2026-11-08T08:08:26.928Z)
- `vscode-plugin/src/chat/session-lock.ts` — **insrc-build** (2026-11-08T08:08:26.928Z)
- `vscode-plugin/src/chat/turn-lifecycle.ts` — **insrc-build** (2026-11-08T08:08:26.928Z)
- `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` — **insrc-build** (2026-11-08T08:08:26.928Z)
- `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` — **insrc-build** (2026-11-08T08:08:26.928Z)
- `vscode-plugin/src/chat/__tests__/protocol.test.ts` — **insrc-build** (2026-11-08T08:08:26.928Z)
- `vscode-plugin/src/chat/__tests__/session-file-store.test.ts` — **insrc-build** (2026-11-08T08:08:26.928Z)
- `vscode-plugin/src/chat/protocol.ts` — **insrc-build** (2026-11-08T08:08:26.928Z)
- `vscode-plugin/src/chat/session-store.ts` — **insrc-build** (2026-11-08T08:08:26.928Z)
- `vscode-plugin/src/chat/__tests__/chat-queue-runner.test.ts` — **insrc-build** (2026-11-08T08:08:26.928Z)
- `vscode-plugin/src/chat/render-registry.ts` — **insrc-build** (2026-11-08T08:08:26.928Z)
- `vscode-plugin/src/extension.ts` — **insrc-build** (2026-11-08T08:08:26.928Z)
- `vscode-plugin/src/chat/__tests__/chat-queue-fault-injection.test.ts` — **insrc-build** (2026-11-08T08:08:26.928Z)
- `vscode-plugin/src/chat/__tests__/chat-queue-store.test.ts` — **insrc-build** (2026-11-08T08:08:26.928Z)
- `vscode-plugin/src/chat/chat-queue-store.ts` — **insrc-build** (2026-11-08T08:08:26.928Z)
- `vscode-plugin/src/chat/__tests__/chat-queue-routing.test.ts` — **insrc-build** (2026-11-08T08:08:26.928Z)
- `vscode-plugin/src/chat/__tests__/chat-queue-worker.test.ts` — **insrc-build** (2026-11-08T08:08:26.928Z)
- `vscode-plugin/src/chat/chat-queue-worker.ts` — **insrc-build** (2026-11-08T08:08:26.928Z)
- `vscode-plugin/src/chat/__tests__/chat-outbox.test.ts` — **insrc-build** (2026-11-08T08:08:26.928Z)
- `vscode-plugin/src/chat/__tests__/chat-queue-outbox-host.test.ts` — **insrc-build** (2026-11-08T08:08:26.928Z)
- `vscode-plugin/src/chat/chat-outbox.ts` — **insrc-build** (2026-11-08T08:08:26.928Z)
- `docs/standalone/allow-independent-turns-concurrent-vs-code-E20261108d8b2fe8e/S001/VS-CODE-SMOKE.md` — **insrc-build** (2026-11-08T08:08:26.928Z)
