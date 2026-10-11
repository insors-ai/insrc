<!-- insrc:artifact TESTS-d9f85b3cc8cc966b-S001 -->

# Tests: d9f85b3cc8cc966b S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 16 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

## t1

Run at 2026-10-11T15:39:50.029Z on commit `1b3e512a`. Tests check: **passed**. 11 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: er/ux/sequence/component validators: described definition (narrative + descriptions) -> no HIGH**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | d9f85b3c t1 — er: a described definition (narrative + descriptions) gets no HIGH | `src/workflow/artifacts/companion/__tests__/descriptions.test.ts` |
| pass | d9f85b3c t1 — ux: a described definition (narrative + descriptions) gets no HIGH | `src/workflow/artifacts/companion/__tests__/descriptions.test.ts` |
| pass | d9f85b3c t1 — sequence: a described definition (narrative + descriptions) gets no HIGH | `src/workflow/artifacts/companion/__tests__/descriptions.test.ts` |
| pass | d9f85b3c t1 — component: a described definition (narrative + descriptions) gets no HIGH | `src/workflow/artifacts/companion/__tests__/descriptions.test.ts` |
| pass | d9f85b3c t1 — the closed schemas still reject an unknown field, so the additions are deliberate | `src/workflow/artifacts/companion/__tests__/descriptions.test.ts` |

**unit: er/ux/sequence/component validators: sound undescribed definition -> []**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | d9f85b3c t1 — er: a sound definition without the new fields still returns [] | `src/workflow/artifacts/companion/__tests__/descriptions.test.ts` |
| pass | d9f85b3c t1 — ux: a sound definition without the new fields still returns [] | `src/workflow/artifacts/companion/__tests__/descriptions.test.ts` |
| pass | d9f85b3c t1 — sequence: a sound definition without the new fields still returns [] | `src/workflow/artifacts/companion/__tests__/descriptions.test.ts` |
| pass | d9f85b3c t1 — component: a sound definition without the new fields still returns [] | `src/workflow/artifacts/companion/__tests__/descriptions.test.ts` |

**unit: body-fields / ux-body-fields: synth property schemas admit narrative + description**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | d9f85b3c t1 — design.story and design.epic synth schemas admit narrative + descriptions on ER, sequence and component definitions | `src/workflow/artifacts/companion/__tests__/body-fields.test.ts` |
| pass | d9f85b3c t1 — design.story and design.epic synth schemas admit a UX card narrative and described elements | `src/workflow/artifacts/companion/__tests__/ux-body-fields.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/artifacts/companion/__tests__/body-fields.test.ts` | 0 | 3 | 0.5 s |  |
| `src/workflow/artifacts/companion/__tests__/descriptions.test.ts` | 0 | 9 | 0.5 s |  |
| `src/workflow/artifacts/companion/__tests__/ux-body-fields.test.ts` | 0 | 7 | 0.5 s |  |

## t2

Run at 2026-10-11T15:43:01.214Z on commit `f6e03b84`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

**unit: panzoom asset: no http(s)/import references; exposes init + fit entry points**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | d9f85b3c t2 — the panzoom asset references nothing outside itself | `src/workflow/artifacts/companion/__tests__/panzoom.test.ts` |
| pass | d9f85b3c t2 — the asset exposes window.insrcPanZoom.init, which returns fit() and reset() | `src/workflow/artifacts/companion/__tests__/panzoom.test.ts` |
| pass | d9f85b3c t2 — fit-on-load centres the stage at the scale that fits the viewport, and labels it | `src/workflow/artifacts/companion/__tests__/panzoom.test.ts` |
| pass | d9f85b3c t2 — the toolbar zooms about the centre and 1:1 resets; missing controls are skipped | `src/workflow/artifacts/companion/__tests__/panzoom.test.ts` |
| pass | d9f85b3c t2 — a missing viewport or stage yields a no-op handle instead of throwing | `src/workflow/artifacts/companion/__tests__/panzoom.test.ts` |

**smoke: headless Chrome: each generated page draws, fit-on-load applied, no console error**

Reported by the builder, not run by the gate: **pass**. Evidence: At t2 (before any page generator exists): /tmp/pz-smoke/page.html with the approved mock's view-panel markup, the shipped panzoom.js inlined and the vendored mermaid.min.js, loaded in google-chrome --headless=new --dump-dom --virtual-time-budget=8000. The DOM shows the Mermaid SVG drawn and the stage transformed by fit() after render: 'translate(395.247px, 16.8px) scale(0.782186) | 78%'. chrome.log has 0 console errors. The same check is rerun over every generated companion page once the builders land (t8).

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/artifacts/companion/__tests__/panzoom.test.ts` | 0 | 5 | 0.3 s |  |
