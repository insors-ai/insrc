<!-- insrc:artifact BUILD-613abdb351c2c738-s2 -->

# Build (plan-driven) — Story s2

**Standalone:** no  ·  **Created:** 2026-10-14T12:57:26.478Z  ·  **Updated:** 2026-10-14T13:05:44.767Z

**Commit:** e50dffe3

## Summary

vscode-plugin/src/chat/chat-panel.ts: outboxRows holds the rows from worker.onChange (undefined while the queue is off or unread); postOutbox(note?) projects them with projectOutbox for the shown chat (titles from deps.store, here = the row is this host's running queued message) and posts { type:'outbox', view }. It is called on every onChange, from postRestored (so every path that shows a chat — postInitialState on 'ready', new-chat, open-chat, the queue runner's showSession — posts the chat's outbox), and after a refused action with its note. handleMessage routes 'outbox-cancel' / 'outbox-dismiss' / 'outbox-resend' to outboxAction, which ignores a seq that is not a row of the shown chat (logged) and calls worker.act; 'outbox-retry-now' falls to the default (ignored until s4). Without deps.queue nothing is posted. Tests: five named tests in the new chat-queue-outbox-host.test.ts over real queue files and hosts (the resend test checks the attachment path reaches the CLI prompt; the rebuild test disposes the host mid-turn and builds a second over the same file with the same window key); the first also checks a switch posts the new chat's outbox at once with runningChat.here, and a no-queue host posts no outbox. Mutations: dropping the post from postRestored, dropping the refusal note, accepting another chat's seq, and here always false each fail a test. Plugin suite without force-exit: 1300 tests, 1290 pass, 8 skipped, 2 fail (pre-existing manifest-catalog). Typecheck clean.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-613abdb351c2c738-s2.json` — **insrc-build** (2026-10-14T13:05:44.767Z)
- `vscode-plugin/src/chat/__tests__/chat-outbox.test.ts` — **insrc-build** (2026-10-14T13:05:44.767Z)
- `vscode-plugin/src/chat/__tests__/chat-queue-outbox-host.test.ts` — **insrc-build** (2026-10-14T13:05:44.767Z)
- `vscode-plugin/src/chat/__tests__/chat-queue-store.test.ts` — **insrc-build** (2026-10-14T13:05:44.767Z)
- `vscode-plugin/src/chat/__tests__/chat-queue-worker.test.ts` — **insrc-build** (2026-10-14T13:05:44.767Z)
- `vscode-plugin/src/chat/__tests__/protocol.test.ts` — **insrc-build** (2026-10-14T13:05:44.767Z)
- `vscode-plugin/src/chat/chat-outbox.ts` — **insrc-build** (2026-10-14T13:05:44.767Z)
- `vscode-plugin/src/chat/chat-panel.ts` — **insrc-build** (2026-10-14T13:05:44.767Z)
- `vscode-plugin/src/chat/chat-queue-store.ts` — **insrc-build** (2026-10-14T13:05:44.767Z)
- `vscode-plugin/src/chat/chat-queue-worker.ts` — **insrc-build** (2026-10-14T13:05:44.767Z)
- `vscode-plugin/src/chat/protocol.ts` — **insrc-build** (2026-10-14T13:05:44.767Z)
