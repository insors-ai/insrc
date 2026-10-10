<!-- insrc:artifact BUILD-7bc6e47643234665-S001 -->

# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-10-10T12:08:21.565Z  ·  **Updated:** 2026-10-10T12:20:39.036Z

**Commit:** 968dc661

## Scope

ISSUE-7bc6e476 (bugfix, small: issue then build). Group the delivery board's Epics screen by stage: each epic in the stage box of its least-advanced story (Complete only when every story is complete), the same six collapsible boxes and open/hint/fold rules as the board and Issues screens, the reader's open/closed choice kept across a refresh, and epics with no stories in a 'No stories yet' note after the boxes; rows, search, Needs attention, counts and opening an epic unchanged. Make the app bar's Refresh an icon-only button with the accessible name 'Refresh' and a tooltip; CSP, text-only rendering and theme colours unchanged.

## Triage rationale

bugfix (small): one module (the plugin's delivery board), approach chosen with the user; issue then build, no LLD.

## Summary

EpicsBody carries six stage sections (each epic at the stage of its least-advanced story, epics with no stories after the boxes), built from the shared sectionHead that the board and Issues screens also use; the webview renders them in the shared stage boxes, with 'No stories yet' from the labels table. Refresh is an icon-only button named 'Refresh' with a tooltip. Full plugin suite: 966 tests, 961 pass, 4 skipped, 1 known baseline failure.

## Tasks validated

- ✓ `S001`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `docs/standalone/delivery-board-vs-code-plugin-group-E202610107bc6e476/S001/evidence/epics-1200.jpg` — **insrc-build** (2026-10-10T12:20:39.036Z)
- `docs/standalone/delivery-board-vs-code-plugin-group-E202610107bc6e476/S001/evidence/epics-360.jpg` — **insrc-build** (2026-10-10T12:20:39.036Z)
- `vscode-plugin/src/delivery/__tests__/board-host.test.ts` — **insrc-build** (2026-10-10T12:20:39.036Z)
- `vscode-plugin/src/delivery/__tests__/board-model.test.ts` — **insrc-build** (2026-10-10T12:20:39.036Z)
- `vscode-plugin/src/delivery/__tests__/board-views.test.ts` — **insrc-build** (2026-10-10T12:20:39.036Z)
- `vscode-plugin/src/delivery/__tests__/labels.test.ts` — **insrc-build** (2026-10-10T12:20:39.036Z)
- `vscode-plugin/src/delivery/board-host.ts` — **insrc-build** (2026-10-10T12:20:39.036Z)
- `vscode-plugin/src/delivery/board-model.ts` — **insrc-build** (2026-10-10T12:20:39.036Z)
- `vscode-plugin/src/delivery/board-protocol.ts` — **insrc-build** (2026-10-10T12:20:39.036Z)
- `vscode-plugin/src/delivery/board-views.ts` — **insrc-build** (2026-10-10T12:20:39.036Z)
- `vscode-plugin/src/delivery/labels.ts` — **insrc-build** (2026-10-10T12:20:39.036Z)
