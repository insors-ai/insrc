<!-- insrc:artifact BUILD-793b8230cdbc616e-s1 -->

# Build (standalone trivial) — Story s1

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-11-19T12:47:50.231Z  ·  **Updated:** 2026-11-19T12:58:03.216Z

**Commit:** 171f2093c

## Scope

Fix two defects in the insrc Ink TUI: clear the terminal screen when the TUI launches, and provide a discoverable global action to clear all operation output/status messages without changing pane state, daemon status, modal capture, or IPC contracts.

## Triage rationale

Triage classified this as a small bugfix. It is a no-LLD issue-routed build localized to the CLI presentation layer; the no-LLD standalone gate uses the trivial route class while the approved ISSUE retains the bugfix magnitude and rationale.

## Summary

Clears the terminal immediately before Ink mounts and adds a discoverable uppercase C shortcut that removes all displayed operation messages while preserving the active pane, daemon state, and captured modal input. Focused unit and Ink tests cover the terminal escape sequence, real error clearing, pane preservation, and modal capture.

## Tasks validated

- ✓ `s1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/cli/__tests__/tui.test.ts` — **insrc-build** (2026-11-19T12:58:03.216Z)
- `src/cli/app.tsx` — **insrc-build** (2026-11-19T12:58:03.216Z)
- `src/cli/index.tsx` — **insrc-build** (2026-11-19T12:58:03.216Z)
- `src/cli/ui/__tests__/messages.test.ts` — **insrc-build** (2026-11-19T12:58:03.216Z)
- `src/cli/ui/__tests__/terminal.test.ts` — **insrc-build** (2026-11-19T12:58:03.216Z)
- `src/cli/ui/messages.ts` — **insrc-build** (2026-11-19T12:58:03.216Z)
- `src/cli/ui/terminal.ts` — **insrc-build** (2026-11-19T12:58:03.216Z)
