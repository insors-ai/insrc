<!-- insrc:artifact BUILD-a48d81d66e4c55ee-s1 -->

# Build (standalone trivial) — Story s1

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-11-09T04:30:40.241Z  ·  **Updated:** 2026-11-09T04:33:14.665Z

**Commit:** 62579351a

## Scope

VS Code dev chat: the edits mode setting defaults to Auto, and the Manual and Edit Automatically options are disabled for now, because the approval widgets those modes depend on break the chat flow. Applies to new chats and to chats already saved with another mode.

## Triage rationale

One file, one mechanical approach with no new contract.

## Summary

Every chat now runs in Auto: the Manual and Edit Automatically options are disabled, a request for them is dropped, and a chat saved with another mode keeps that stored choice for when the modes return.

## Tasks validated

- ✓ `s1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` — **insrc-build** (2026-11-09T04:33:14.665Z)
- `vscode-plugin/src/chat/chat-panel.ts` — **insrc-build** (2026-11-09T04:33:14.665Z)
