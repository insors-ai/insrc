<!-- insrc:artifact TESTS-7c5a1921cb45a8d8-s1 -->

# Tests: 7c5a1921cb45a8d8 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 14 pass, 0 fail, 0 skipped, 0 not found; 2 reported by the builder and not run by the gate.

## s1

Run at 2026-11-04T19:38:13.003Z on commit `e673bdfb5`. Tests check: **passed**. 14 pass, 0 fail, 0 skipped, 0 not found; 2 reported by the builder and not run by the gate.

**unit: pageStyleTags and pageCssFor in src/artifact-theme/theme.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | theme.test.ts: pageStyleTags puts the font-face rules inside a style element | `src/artifact-theme/__tests__/theme.test.ts` |
| pass | theme.test.ts: pageCssFor gives .insrc-viewer the surface background, min-height:100vh, box-sizing:border-box and padding-top:56px in light and dark, and no rule gives html a background | `src/artifact-theme/__tests__/theme.test.ts` |
| pass | theme.test.ts: pageCssFor makes the theme switch a fixed 32px top-right control with a z-index in both modes | `src/artifact-theme/__tests__/theme.test.ts` |
| pass | theme.test.ts: pageStyleTags is the one shared page-style composition for every shell (R1) | `src/artifact-theme/__tests__/theme.test.ts` |

**unit: viewerBootScript in src/artifact-theme/theme.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | viewer-script.test.ts: the boot script defaults to light and does not consult prefers-color-scheme, and a stored mode still wins | `src/artifact-theme/__tests__/viewer-script.test.ts` |
| pass | viewer-script.test.ts: run in a stub DOM, a throwing localStorage read and a throwing write fall back without error, an invalid stored value is ignored, and a missing #iv-theme is tolerated | `src/artifact-theme/__tests__/viewer-script.test.ts` |
| pass | theme.test.ts: viewerBootScript carries the readable clamp, theme persistence, safe re-render, export and error+source | `src/artifact-theme/__tests__/theme.test.ts` |

**unit: renderCompanionPage in src/workflow/artifacts/companion/shell.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | companion/__tests__/shell.test.ts: the companion page carries class insrc-viewer, data-theme and the export CSS on the body | `src/workflow/artifacts/companion/__tests__/shell.test.ts` |
| pass | companion/__tests__/shell.test.ts: the companion layout rule targets the page inside the theme root | `src/workflow/artifacts/companion/__tests__/shell.test.ts` |
| pass | companion/__tests__/shell.test.ts: the theme switch is a direct child of the body in the companion page, and the companion CSS has the max-width:480px rule for header.hdr and table.ref | `src/workflow/artifacts/companion/__tests__/shell.test.ts` |
| pass | companion/__tests__/shell.test.ts: the export CSS attribute still carries the fonts and the diagram overrides unchanged | `src/workflow/artifacts/companion/__tests__/shell.test.ts` |

**unit: assembleShell in src/docgen/render/shell.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | docgen/render/__tests__/shell.test.ts: the docgen page keeps the theme root on the body and docgenPageStyle has no .insrc-viewer html rule | `src/docgen/render/__tests__/shell.test.ts` |

**unit: assembleFallbackShell in src/docgen/render/fallback.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | docgen/render/__tests__/fallback.test.ts: the fallback script defaults to light, does not consult prefers-color-scheme and uses the same storage key as the shared script | `src/docgen/render/__tests__/fallback.test.ts` |
| pass | docgen/render/__tests__/fallback.test.ts: the theme switch is a direct child of the body in the fallback page | `src/docgen/render/__tests__/fallback.test.ts` |

**live: A generated ER companion page opened in headless Chrome at desktop and 360px widths**

Reported by the builder, not run by the gate: **pass**. Evidence: INSRC_LIVE_TESTS=1 npx tsx --test src/artifact-theme/__tests__/theme-browser.live.test.ts: both tests pass (2026-11-05); screenshots docs/standalone/apply-artifact-page-theme-whole-document-E202611047c5a1921/S001/screenshots/companion-light.png and companion-dark.png

**live: A generated docgen page opened in headless Chrome**

Reported by the builder, not run by the gate: **pass**. Evidence: INSRC_LIVE_TESTS=1 npx tsx --test src/artifact-theme/__tests__/theme-browser.live.test.ts: the docgen test passes (2026-11-05)

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/artifact-theme/__tests__/theme.test.ts` | 0 | 16 | 0.4 s |  |
| `src/artifact-theme/__tests__/viewer-script.test.ts` | 0 | 6 | 0.6 s |  |
| `src/docgen/render/__tests__/fallback.test.ts` | 0 | 17 | 0.7 s |  |
| `src/docgen/render/__tests__/shell.test.ts` | 0 | 9 | 0.5 s |  |
| `src/workflow/artifacts/companion/__tests__/shell.test.ts` | 0 | 17 | 0.6 s |  |
