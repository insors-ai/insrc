<!-- insrc:artifact TESTS-d9f85b3cc8cc966b-S001 -->

# Tests: d9f85b3cc8cc966b S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 41 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

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

## t3

Run at 2026-10-11T15:47:04.734Z on commit `521e35c2`. Tests check: **passed**. 12 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: shell: section order + header table rows + no external URL**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | d9f85b3c t3 — Header, Narrative, View and Description appear in that order | `src/workflow/artifacts/companion/__tests__/shell.test.ts` |
| pass | d9f85b3c t3 — the header table has the four rows: Work item, Source doc (linked), Date, User | `src/workflow/artifacts/companion/__tests__/shell.test.ts` |
| pass | d9f85b3c t3 — no http(s) URL appears: none in the shell markup, none at all on an HTML page | `src/workflow/artifacts/companion/__tests__/shell.test.ts` |

**unit: shell view panel: toolbar controls, pan/zoom init, fit-on-load for mermaid and html visuals; html page has no Mermaid**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | d9f85b3c t3 — both visuals get the toolbar, the pan/zoom runtime and its init | `src/workflow/artifacts/companion/__tests__/shell.test.ts` |
| pass | d9f85b3c t3 — a Mermaid page inlines Mermaid and fits once the diagram is drawn | `src/workflow/artifacts/companion/__tests__/shell.test.ts` |
| pass | d9f85b3c t3 — an HTML page inlines no Mermaid, fits on load and carries the visual and its CSS | `src/workflow/artifacts/companion/__tests__/shell.test.ts` |
| pass | d9f85b3c t3 — an inlined runtime cannot close its script element early | `src/workflow/artifacts/companion/__tests__/shell.test.ts` |

**unit: shell: escaping of all table text; null cell -> em dash; missing narrative renders only the context line**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | d9f85b3c t3 — every header, narrative and table string is escaped | `src/workflow/artifacts/companion/__tests__/shell.test.ts` |
| pass | d9f85b3c t3 — a null cell renders as an em dash, and a tagged cell as its badge | `src/workflow/artifacts/companion/__tests__/shell.test.ts` |
| pass | d9f85b3c t3 — a missing narrative renders only the context line; a present one renders its paragraphs | `src/workflow/artifacts/companion/__tests__/shell.test.ts` |

**unit: shell runtime loader: missing asset -> DiagramGenerationError**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | d9f85b3c t3 — the runtime loader reads the shipped assets: pan/zoom always, Mermaid for a Mermaid visual only | `src/workflow/artifacts/companion/__tests__/shell.test.ts` |
| pass | d9f85b3c t3 — a missing runtime asset raises DiagramGenerationError | `src/workflow/artifacts/companion/__tests__/shell.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/artifacts/companion/__tests__/shell.test.ts` | 0 | 12 | 0.4 s |  |

## t4

Run at 2026-10-11T15:49:07.959Z on commit `1a0b7703`. Tests check: **passed**. 13 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: header: projectName override / basename fallback / malformed config ignored**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | d9f85b3c t4 — projectName comes from .insrc/config.json when set | `src/workflow/artifacts/companion/__tests__/header.test.ts` |
| pass | d9f85b3c t4 — projectName falls back to the repo folder name with no config, or no / an empty / a non-string projectName | `src/workflow/artifacts/companion/__tests__/header.test.ts` |
| pass | d9f85b3c t4 — a malformed config is ignored, not thrown | `src/workflow/artifacts/companion/__tests__/header.test.ts` |

**unit: header: git user / OS fallback / 'unknown'; injected clock format**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | d9f85b3c t4 — user is git user.name, else the OS login, else unknown | `src/workflow/artifacts/companion/__tests__/header.test.ts` |
| pass | d9f85b3c t4 — the real lookups do not throw outside a git repo | `src/workflow/artifacts/companion/__tests__/header.test.ts` |
| pass | d9f85b3c t4 — the date comes from the injected clock as YYYY-MM-DD HH:mm local time | `src/workflow/artifacts/companion/__tests__/header.test.ts` |
| pass | d9f85b3c t4 — the source doc is the artifact id linked to its markdown beside the companion | `src/workflow/artifacts/companion/__tests__/header.test.ts` |

**unit: header: malformed createdAt/epicHash/storyId -> plain id fallback, no throw**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | d9f85b3c t4 — a well-formed source gets the hierarchical story or epic id | `src/workflow/artifacts/companion/__tests__/header.test.ts` |
| pass | d9f85b3c t4 — a malformed createdAt, epicHash or storyId falls back to the plain id without throwing | `src/workflow/artifacts/companion/__tests__/header.test.ts` |

**unit: header contextLine: HLD / epic-Story LLD / standalone LLD / placement-only**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | d9f85b3c t4 — an HLD context line is the Epic plus the first sentence of its summary | `src/workflow/artifacts/companion/__tests__/header.test.ts` |
| pass | d9f85b3c t4 — an epic Story's LLD context line is its placement, title and value | `src/workflow/artifacts/companion/__tests__/header.test.ts` |
| pass | d9f85b3c t4 — a standalone LLD's context line is the story title and the LLD summary's first sentence | `src/workflow/artifacts/companion/__tests__/header.test.ts` |
| pass | d9f85b3c t4 — with nothing to say, the context line is placement only | `src/workflow/artifacts/companion/__tests__/header.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/artifacts/companion/__tests__/header.test.ts` | 0 | 13 | 0.4 s |  |
