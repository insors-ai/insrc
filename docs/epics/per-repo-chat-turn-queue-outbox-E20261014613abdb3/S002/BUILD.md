<!-- insrc:artifact BUILD-613abdb351c2c738-s2 -->

# Build (plan-driven) — Story s2

**Standalone:** no  ·  **Created:** 2026-10-14T12:57:26.478Z  ·  **Updated:** 2026-10-14T12:57:26.478Z

**Commit:** 22a97654

## Summary

vscode-plugin/src/chat/chat-queue-store.ts: SCHEMA_VERSION = 2; the CREATE TABLE messages has waiting_on TEXT, so a fresh file is created with it at version 2; on open, a stored version below 2 gets `ALTER TABLE messages ADD COLUMN waiting_on TEXT` inside the open transaction and version 2 is recorded (rows kept); a newer version is still refused with 'made by a newer plugin'. QueuedMessage gains waitingOn?: 'approval' | 'selection' (rowToMessage maps the column; NewMessage omits it). ChatQueueStore gains markWaiting(seq, on) — UPDATE ... WHERE seq = ? AND state = 'processing', true only when that row changed — and resendFrom(seq, newTurnId, windowKey); resend and resendFrom share one transaction (resendTo), resendFrom using the given window key and resend the row's own. Tests: four named tests in chat-queue-store.test.ts (a v1 file is built by hand with the S001 columns). Mutations: dropping the ALTER, resendFrom keeping the old key, and markWaiting without the processing condition each fail a test. Plugin suite without force-exit: 1290 tests, 1280 pass, 8 skipped, 2 fail — the pre-existing manifest-catalog failures. Typecheck clean.

## Tasks validated

- ✓ `t1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-613abdb351c2c738-s2.json` — **insrc-build** (2026-10-14T12:57:26.478Z)
- `vscode-plugin/src/chat/__tests__/chat-queue-store.test.ts` — **insrc-build** (2026-10-14T12:57:26.478Z)
- `vscode-plugin/src/chat/chat-queue-store.ts` — **insrc-build** (2026-10-14T12:57:26.478Z)
