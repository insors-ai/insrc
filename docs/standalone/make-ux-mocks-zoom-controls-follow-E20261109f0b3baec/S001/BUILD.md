<!-- insrc:artifact BUILD-f0b3baec4baccdd9-s1 -->

# Build (standalone trivial) — Story s1

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-11-09T19:37:10.735Z  ·  **Updated:** 2026-11-09T19:45:56.378Z

**Commit:** 7f22642c8

## Scope

The UX mock and all zoom and pan controls must follow the selected light or dark theme, using the shared theme's colours, and stay readable in both. Zoom and pan must keep working as they do today on every page type, including the docgen fallback page. Pages that are already generated keep their current styling until they are regenerated. The fix must confirm the result by rendering real pages in both themes.

## Triage rationale

A defect with a clear approach: the shared theme already exists and three page shells compose it. The UX card styles and the zoom controls need to use it. The change is confined to styling in the companion and docgen shells and has no contract change.

## Summary

UX mock pages now run a theme-only boot script, which they lacked entirely, so their toggle works and they no longer stick on the dark stylesheet. UX card colours use the theme variables, with per-mode status colours checked for 4.5:1 contrast. The companion toolbar uses the themed iv-bar class, and both docgen shells theme svg-pan-zoom's on-diagram controls. Real UX and docgen fallback pages were rendered in both themes through the page's own toggle; screenshots are in docs/standalone/make-ux-mocks-zoom-controls-follow-E20261109f0b3baec/S001/evidence/. The primary Mermaid docgen page could not be captured visually in headless Chrome.

## Tasks validated

- ✓ `s1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/artifact-theme/theme.ts` — **insrc-build** (2026-11-09T19:45:56.378Z)
- `src/daemon/db/__tests__/fixtures/session-source-inventory.json` — **insrc-build** (2026-11-09T19:45:56.378Z)
- `src/docgen/render/__tests__/fallback.test.ts` — **insrc-build** (2026-11-09T19:45:56.378Z)
- `src/docgen/render/__tests__/shell.test.ts` — **insrc-build** (2026-11-09T19:45:56.378Z)
- `src/docgen/render/fallback.ts` — **insrc-build** (2026-11-09T19:45:56.378Z)
- `src/docgen/render/shell.ts` — **insrc-build** (2026-11-09T19:45:56.378Z)
- `src/workflow/artifacts/companion/__tests__/shell.test.ts` — **insrc-build** (2026-11-09T19:45:56.378Z)
- `src/workflow/artifacts/companion/__tests__/ux-page.test.ts` — **insrc-build** (2026-11-09T19:45:56.378Z)
- `src/workflow/artifacts/companion/shell.ts` — **insrc-build** (2026-11-09T19:45:56.378Z)
- `src/workflow/artifacts/companion/ux.ts` — **insrc-build** (2026-11-09T19:45:56.378Z)
