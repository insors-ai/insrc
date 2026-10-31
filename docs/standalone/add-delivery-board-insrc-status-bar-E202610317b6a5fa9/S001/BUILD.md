<!-- insrc:artifact BUILD-7b6a5fa936278e5d-S001 -->

# Build (standalone small) — Story S001

**Size class:** small  ·  **Standalone:** yes  ·  **Created:** 2026-10-31T14:48:14.193Z  ·  **Updated:** 2026-10-31T15:01:20.219Z

**Commit:** 699309121

## Triage rationale

The change is an exact structural mirror of an existing, already-shipped pattern (the 'Manage Connections' menu item), touching 2 files with 1-2 small localized additions each and one obvious approach: add a MenuItem action literal, a MenuItem entry, a showStatusMenu() branch, a new optional callback field on the deps interface, and one wiring call in extension.ts. No new contract type, no storage/schema change, no new subsystem.

## Summary

Added a 5th "Delivery Board" entry to the VS Code plugin's status-bar click menu, wired through a new onOpenDeliveryBoard optional callback mirroring the existing Manage Connections pattern. registerDeliveryBoard() now returns { open(): void }, captured via a non-chained statement in extension.ts to preserve the call site's literal text shape for two existing tests.

## Tasks validated

- ✓ `S001`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `vscode-plugin/src/delivery/board-wiring.ts` — **insrc-build** (2026-10-31T15:01:20.219Z)
- `vscode-plugin/src/extension.ts` — **insrc-build** (2026-10-31T15:01:20.219Z)
- `vscode-plugin/src/panels/__tests__/webview-host.test.ts` — **insrc-build** (2026-10-31T15:01:20.219Z)
- `vscode-plugin/src/panels/types.ts` — **insrc-build** (2026-10-31T15:01:20.219Z)
- `vscode-plugin/src/panels/webview-host.ts` — **insrc-build** (2026-10-31T15:01:20.219Z)
