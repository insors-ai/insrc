<!-- insrc:artifact BUILD-d6eb2fb5ac627b66-s1 -->

# Build (standalone trivial) — Story s1

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-11-14T17:29:44.599Z  ·  **Updated:** 2026-11-14T17:31:55.097Z

**Commit:** 180fc0b05

## Scope

Raise the VS Code dev chat's per-repository concurrent turn limit from 2 to 6: REPO_TURN_CAPACITY in vscode-plugin/src/chat/chat-queue-store.ts (used by sessionQueueWait's capacity gate and the outbox's occupied/total display in chat-outbox.ts). Update the two tests that hard-code a full house of 2 (chat-outbox.test.ts capacity projection; chat-queue-routing.test.ts 'waiting approval or retry in A allows B and full capacity queues C') so they fill REPO_TURN_CAPACITY slots instead of exactly two.

## Triage rationale

A constant change. Grounded by grep (the analyzer was unavailable earlier this session): REPO_TURN_CAPACITY is defined once and read in two places, the capacity gate in sessionQueueWait and the outbox's occupied/total. The claim (acknowledge) re-checks eligibility inside its write transaction, so no structure assumes the value 2. Only two tests hard-code a full house of two and need generalising. No new contract, no schema change, no design choice.

## Summary

REPO_TURN_CAPACITY raised from 2 to 6 (commit 180fc0b05). Three tests that assumed exactly two slots (chat-outbox, chat-queue-routing, chat-queue-store) now fill REPO_TURN_CAPACITY slots; the outbox and store tests fail if the gate is off by one. 100/100 chat queue tests pass; plugin tsc clean.

## Tasks validated

- ✗ `s1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `vscode-plugin/src/chat/__tests__/chat-outbox.test.ts` — **insrc-build** (2026-11-14T17:31:55.097Z)
- `vscode-plugin/src/chat/__tests__/chat-queue-routing.test.ts` — **insrc-build** (2026-11-14T17:31:55.097Z)
- `vscode-plugin/src/chat/__tests__/chat-queue-store.test.ts` — **insrc-build** (2026-11-14T17:31:55.097Z)
- `vscode-plugin/src/chat/chat-queue-store.ts` — **insrc-build** (2026-11-14T17:31:55.097Z)
