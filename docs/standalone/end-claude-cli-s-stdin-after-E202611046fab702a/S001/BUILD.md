<!-- insrc:artifact BUILD-6fab702a7015853e-s1 -->

# Build (standalone trivial) — Story s1

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-11-04T05:33:21.549Z  ·  **Updated:** 2026-11-04T05:34:16.390Z

**Commit:** 31ebd07c2

## Scope

End the Claude CLI's stdin after the correlated result so the chat lock is released: add an optional endInput() seam to SpawnedProcess (vscode-plugin/src/chat/cli-adapter.ts), implement it in nodeSpawner by ending child.stdin, call it in run() when a correlated Claude turn reaches its terminal event, and add a fake-spawner unit test.

## Triage rationale

Small bugfix: one adapter module, one additive optional seam, one test.

## Summary

Added an optional endInput() to SpawnedProcess, implemented in nodeSpawner by ending the child's stdin, and called it when a correlated Claude turn reaches its own terminal result, so the CLI exits and the chat lock is released. Two fake-spawner tests added; one existing run-config argv test in cli-adapter.test.ts already failed before this change (it expects the old prompt-on-argv form) and is left alone.

## Tasks validated

- ✓ `s1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `vscode-plugin/src/chat/__tests__/cli-adapter-correlation.test.ts` — **insrc-build** (2026-11-04T05:34:16.390Z)
- `vscode-plugin/src/chat/__tests__/fixtures.ts` — **insrc-build** (2026-11-04T05:34:16.390Z)
- `vscode-plugin/src/chat/cli-adapter.ts` — **insrc-build** (2026-11-04T05:34:16.390Z)
