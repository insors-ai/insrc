<!-- insrc:artifact BUILD-43e0b651654e0757-S001 -->

# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-11-05T11:35:38.156Z  ·  **Updated:** 2026-11-05T11:44:35.222Z

**Commit:** fc97aa815

## Scope

Fix approved ISSUE-3fdb2b75703e6f09: preserve per-session provider/model/effort on history switches and ensure new-session selectors open and work. Diagnose runtime webview failure, preserve legacy defaults, and add executable restoration/selector regression tests.

## Triage rationale

Small bugfix routed issue → build; existing per-session configuration and IPC contracts reused.

## Summary

Corrected saved-model alias/unknown-model labels, escaped dynamic button text, retained provider choices while catalog is unavailable, and bounded selector popups with inside-click handling. Added executable selector/restore and fresh-store next-turn regressions. 301 affected tests and both typechecks passed locally. Installed pre-fix history restoration worked during diagnosis; full reported reset/click failure remains unconfirmed and manual validation of this build is pending.

## Tasks validated

- ✗ `S001`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/ISSUE-3fdb2b75703e6f09.json` — **insrc-build** (2026-11-05T11:44:35.222Z)
- `docs/standalone/43e0b651654e0757-E2026110543e0b651/S001/IMPLEMENTATION.md` — **insrc-build** (2026-11-05T11:44:35.222Z)
- `docs/standalone/43e0b651654e0757-E2026110543e0b651/S001/evidence/affected-tests.tap` — **insrc-build** (2026-11-05T11:44:35.222Z)
- `docs/standalone/preserve-provider-model-effort-when-reopening-E202611053fdb2b75/ISSUE.md` — **insrc-build** (2026-11-05T11:44:35.222Z)
- `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` — **insrc-build** (2026-11-05T11:44:35.222Z)
- `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` — **insrc-build** (2026-11-05T11:44:35.222Z)
- `vscode-plugin/src/chat/chat-panel.ts` — **insrc-build** (2026-11-05T11:44:35.222Z)
