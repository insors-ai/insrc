<!-- insrc:artifact BUILD-2ab0484d51a0556c-S001 -->

# Build (standalone small) — Story S001

**Size class:** small  ·  **Standalone:** yes  ·  **Created:** 2026-10-30T16:57:07.771Z  ·  **Updated:** 2026-10-30T16:57:07.771Z

**Commit:** 88b18069d

## Triage rationale

Reuses an already-fully-built feature (vscode-plugin/src/connections/* + command insrc.openDataSources) with zero new backend/data model work. The change is mechanical and has one obvious approach (add a MenuItem row + a switch branch + a PanelHost method that delegates to the existing command), but it touches 3 files across what are effectively 2 concerns (the panels module's menu/host surface, and extension.ts's wiring of panelHost to the connections host), which is more than a single-file trivial guard/rename/constant.

## Tasks validated

- ✓ `S001`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `vscode-plugin/src/extension.ts` — **insrc-build** (2026-10-30T16:57:07.771Z)
- `vscode-plugin/src/panels/__tests__/webview-host.test.ts` — **insrc-build** (2026-10-30T16:57:07.771Z)
- `vscode-plugin/src/panels/types.ts` — **insrc-build** (2026-10-30T16:57:07.771Z)
- `vscode-plugin/src/panels/webview-host.ts` — **insrc-build** (2026-10-30T16:57:07.771Z)
