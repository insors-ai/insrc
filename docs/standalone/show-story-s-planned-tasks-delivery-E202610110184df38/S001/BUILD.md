<!-- insrc:artifact BUILD-0184df38314415ae-s1 -->

# Build (standalone small) — Story S001

**Size class:** small  ·  **Standalone:** yes  ·  **Created:** 2026-10-11T09:34:09.996Z  ·  **Updated:** 2026-10-11T09:38:49.739Z

**Commit:** 6b315bf9

## Triage rationale

One story in one module (vscode-plugin/src/delivery) with the approach already settled by the approved mock.

## Summary

A story's planned tasks on the Delivery board are now a table: short id, title, result pill, dependency chips (short id, full title on hover) and a checks count that opens the acceptance checks as a plain list under the row, with the open choice kept across re-renders. TaskRowView gained shortId and { shortId, title } dependencies built in taskRows.

## Tasks validated

- ✓ `S001`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `vscode-plugin/src/delivery/__tests__/board-details.test.ts` — **insrc-build** (2026-10-11T09:38:49.739Z)
- `vscode-plugin/src/delivery/__tests__/board-host.test.ts` — **insrc-build** (2026-10-11T09:38:49.739Z)
- `vscode-plugin/src/delivery/board-details.ts` — **insrc-build** (2026-10-11T09:38:49.739Z)
- `vscode-plugin/src/delivery/board-host.ts` — **insrc-build** (2026-10-11T09:38:49.739Z)
- `vscode-plugin/src/delivery/board-protocol.ts` — **insrc-build** (2026-10-11T09:38:49.739Z)
