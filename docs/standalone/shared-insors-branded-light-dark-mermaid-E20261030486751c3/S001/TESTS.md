<!-- insrc:artifact TESTS-486751c3411ceef9-S001 -->

# Tests: 486751c3411ceef9 S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 27 pass, 0 fail, 0 skipped, 0 not found; 2 reported by the builder and not run by the gate.

## t1

Run at 2026-10-30T19:44:16.264Z on commit `4afe8a18a`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/artifact-theme/__tests__/fonts.test.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | fonts.test.ts: Poppins 400/600/700 woff2 exist with the OFL license note and valid wOF2 magic | `src/artifact-theme/__tests__/fonts.test.ts` |
| pass | fonts.test.ts: copy-assets ships the fonts to out/assets/fonts (checked against the repo-root out/ tree) | `src/artifact-theme/__tests__/fonts.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/artifact-theme/__tests__/fonts.test.ts` | 0 | 2 | 0.7 s |  |

## t2

Run at 2026-10-30T19:50:55.299Z on commit `9a3d83992`. Tests check: **passed**. 14 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/artifact-theme/__tests__/theme.test.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | theme.test.ts: THEME_VERSION is stamped and brand tokens are exact | `src/artifact-theme/__tests__/theme.test.ts` |
| pass | theme.test.ts: both modes produce a Mermaid config on the 10.9.1 base theme with Poppins + strict security | `src/artifact-theme/__tests__/theme.test.ts` |
| pass | theme.test.ts: DIAGRAM_OVERRIDES_CSS is scoped to the shared wrapper and fixes ER labels in both modes | `src/artifact-theme/__tests__/theme.test.ts` |
| pass | theme.test.ts: page CSS is scoped under .insrc-viewer, has both surface variants, and never references a remote URL | `src/artifact-theme/__tests__/theme.test.ts` |
| pass | theme.test.ts: role palette + legend render only for given roles (R4) | `src/artifact-theme/__tests__/theme.test.ts` |
| pass | theme.test.ts: font-face CSS embeds the three packaged weights as base64 data URIs, no CDN | `src/artifact-theme/__tests__/theme.test.ts` |
| pass | theme.test.ts: contrast pairs exist for both modes with NFR1 targets | `src/artifact-theme/__tests__/theme.test.ts` |
| pass | theme.test.ts: viewerBootScript carries the readable clamp, theme persistence, safe re-render, export and error+source | `src/artifact-theme/__tests__/theme.test.ts` |
| pass | theme.test.ts: exportableSvg embeds background + fonts + overrides and keeps the whole diagram | `src/artifact-theme/__tests__/theme.test.ts` |

**unit: src/artifact-theme/__tests__/fonts.test.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | fonts.test.ts: Poppins 400/600/700 woff2 exist with the OFL license note and valid wOF2 magic | `src/artifact-theme/__tests__/fonts.test.ts` |
| pass | fonts.test.ts: copy-assets ships the fonts to out/assets/fonts (checked against the repo-root out/ tree) | `src/artifact-theme/__tests__/fonts.test.ts` |

**unit: src/artifact-theme/__tests__/contrast.test.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | contrast.test.ts: brand tokens are the six exact hex values | `src/artifact-theme/__tests__/contrast.test.ts` |
| pass | contrast.test.ts: every CONTRAST_PAIR meets its target ratio in both modes (NFR1) | `src/artifact-theme/__tests__/contrast.test.ts` |
| pass | contrast.test.ts: ER relationship-label pair holds in dark mode specifically (R3/R12 regression) | `src/artifact-theme/__tests__/contrast.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/artifact-theme/__tests__/contrast.test.ts` | 0 | 3 | 0.7 s |  |
| `src/artifact-theme/__tests__/fonts.test.ts` | 0 | 2 | 0.4 s |  |
| `src/artifact-theme/__tests__/theme.test.ts` | 0 | 9 | 0.5 s |  |

## t3

Run at 2026-10-30T20:17:21.652Z on commit `012a6624d`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/artifacts/companion/__tests__/shell.test.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | d9f85b3c t3 — both visuals get the toolbar, the pan/zoom runtime and its init | `src/workflow/artifacts/companion/__tests__/shell.test.ts` |
| pass | d9f85b3c t3 — a Mermaid page inlines Mermaid and the branded theme boot drives the render | `src/workflow/artifacts/companion/__tests__/shell.test.ts` |
| pass | d9f85b3c t3 — an HTML page inlines no Mermaid, fits on load and carries the visual and its CSS | `src/workflow/artifacts/companion/__tests__/shell.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/artifacts/companion/__tests__/shell.test.ts` | 0 | 12 | 0.6 s |  |

## t5

Run at 2026-10-30T20:19:13.816Z on commit `012a6624d`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

**integration: src/artifact-theme/__tests__/viewer-script.test.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | viewer-script.test.ts: the generated boot script parses (node --check) | `src/artifact-theme/__tests__/viewer-script.test.ts` |
| pass | viewer-script.test.ts: the shipped panzoom runtime parses and exposes the readable-fit floor + transform accessors | `src/artifact-theme/__tests__/viewer-script.test.ts` |
| pass | viewer-script.test.ts: boot keeps the diagram source verbatim and the readable clamp, and re-runs the same source on theme switch | `src/artifact-theme/__tests__/viewer-script.test.ts` |
| pass | viewer-script.test.ts: structural preservation — a rendered companion page carries the mermaid source byte-identical (NFR4) | `src/artifact-theme/__tests__/viewer-script.test.ts` |

**live: src/artifact-theme/__tests__/perf.integration.test.ts**

Reported by the builder, not run by the gate: **pass**. Evidence: perf.integration.test.ts green locally: n=1/50/500 policy builds all < 1000ms budget; fonts embedded once per page (3 @font-face rules) — see /tmp/t5c.log (19 pass, 0 fail across artifact-theme suite)

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/artifact-theme/__tests__/viewer-script.test.ts` | 0 | 4 | 0.7 s |  |

## t4

Run at 2026-10-30T20:21:20.955Z on commit `012a6624d`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/docgen/render/__tests__/shell.test.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | assembleShell: offline self-contained shell — runtime INLINED, no external fetch | `src/docgen/render/__tests__/shell.test.ts` |
| pass | assembleShell: the s5 fallback backend is ALSO self-contained offline (both backends, ac4) | `src/docgen/render/__tests__/shell.test.ts` |
| pass | assembleShell: the primary Mermaid shell is branded — shared classes, theme meta, fonts, controls, no theme neutral / old colors | `src/docgen/render/__tests__/shell.test.ts` |
| pass | assembleShell: the fallback subprocess shell is branded too (shared classes + meta + theme toggle + export) | `src/docgen/render/__tests__/shell.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/docgen/render/__tests__/shell.test.ts` | 0 | 7 | 0.4 s |  |

## t6

Run at 2026-10-30T21:51:21.309Z on commit `012a6624d`. Tests check: **passed**. 0 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

the gate ran no test: every named test of this Task was reported by the builder

**smoke: regen smoke**

Reported by the builder, not run by the gate: **pass**. Evidence: /tmp/smoke.mts 8/8 branded checks companion+docgen; build exit 0 /tmp/build-t6.log; affected suites /tmp/wide3.log 236/0, /tmp/t5c.log 19/0, /tmp/aw2.log 4/0, /tmp/iw3.log 4/0, /tmp/dm.log 9/0; per-file pristine-vs-mine reconciliation /tmp/disputed-pristine.log vs /tmp/disputed-mine.log, normalized diff /tmp/dm2.txt vs /tmp/dp2.txt: zero failures unique to changed tree
