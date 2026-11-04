<!-- insrc:artifact BUILD-7c5a1921cb45a8d8-s1 -->

# Build (standalone small) — Story s1

**Size class:** small  ·  **Standalone:** yes  ·  **Created:** 2026-11-04T19:38:13.003Z  ·  **Updated:** 2026-11-04T19:38:13.003Z

**Commit:** e673bdfb5

## Summary

The theme root is the body in every shell, so the light or dark mode reaches the whole document and the body background paints the canvas (the root has min-height 100vh and 56px top padding). Pages open in light unless a mode was stored; the OS colour-scheme preference is no longer consulted in either script. The font-face rules sit in a style element instead of showing as text. The theme switch is a fixed 32px top-right button, a direct child of the body, in the companion, docgen and fallback pages. The companion header stacks and its table shrinks at 480px and below. A live headless Chrome test (INSRC_LIVE_TESTS=1) checks the companion page at 1280px and 360px and the docgen page; screenshots are under S001/screenshots. Left out: the companion .vp-bar toolbar is still not styled by the shared .iv-bar rules (existing).

## Tasks validated

- ✓ `s1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/LLD-7c5a1921cb45a8d8-s1.json` — **insrc-build** (2026-11-04T19:38:13.003Z)
- `.insrc/artifacts/LLD-7c5a1921cb45a8d8-s1.log.jsonl` — **insrc-build** (2026-11-04T19:38:13.003Z)
- `docs/standalone/apply-artifact-page-theme-whole-document-E202611047c5a1921/S001/LLD.md` — **insrc-build** (2026-11-04T19:38:13.003Z)
- `docs/standalone/apply-artifact-page-theme-whole-document-E202611047c5a1921/S001/screenshots/companion-dark.png` — **insrc-build** (2026-11-04T19:38:13.003Z)
- `docs/standalone/apply-artifact-page-theme-whole-document-E202611047c5a1921/S001/screenshots/companion-light.png` — **insrc-build** (2026-11-04T19:38:13.003Z)
- `src/artifact-theme/__tests__/theme-browser.live.test.ts` — **insrc-build** (2026-11-04T19:38:13.003Z)
- `src/artifact-theme/__tests__/theme.test.ts` — **insrc-build** (2026-11-04T19:38:13.003Z)
- `src/artifact-theme/__tests__/viewer-script.test.ts` — **insrc-build** (2026-11-04T19:38:13.003Z)
- `src/artifact-theme/theme.ts` — **insrc-build** (2026-11-04T19:38:13.003Z)
- `src/docgen/render/__tests__/fallback.test.ts` — **insrc-build** (2026-11-04T19:38:13.003Z)
- `src/docgen/render/__tests__/shell.test.ts` — **insrc-build** (2026-11-04T19:38:13.003Z)
- `src/docgen/render/fallback.ts` — **insrc-build** (2026-11-04T19:38:13.003Z)
- `src/docgen/render/shell.ts` — **insrc-build** (2026-11-04T19:38:13.003Z)
- `src/workflow/artifacts/companion/__tests__/shell.test.ts` — **insrc-build** (2026-11-04T19:38:13.003Z)
- `src/workflow/artifacts/companion/shell.ts` — **insrc-build** (2026-11-04T19:38:13.003Z)
