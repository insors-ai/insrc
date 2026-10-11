<!-- insrc:artifact TESTS-d9f85b3cc8cc966b-S001 -->

# Tests: d9f85b3cc8cc966b S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 77 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

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

## t5

Run at 2026-10-11T15:52:05.210Z on commit `0a781b6e`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: er page builder: erDiagram, PK, cardinality, self-loop (Delivery read-model fixture)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | d9f85b3c t5 — the visual is a Mermaid erDiagram, never a classDiagram, and the fixture is a valid definition | `src/workflow/artifacts/companion/__tests__/er-page.test.ts` |
| pass | d9f85b3c t5 — entity boxes carry typed scalar columns, list types for multi-valued, PK for identifiers, and no class-ranged slots | `src/workflow/artifacts/companion/__tests__/er-page.test.ts` |
| pass | d9f85b3c t5 — relationship lines carry the slot name and the cardinality: many, required one, optional one, and a self-loop | `src/workflow/artifacts/companion/__tests__/er-page.test.ts` |

**unit: er page builder: entities + columns tables, null descriptions, no-columns row**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | d9f85b3c t5 — the entities table lists each entity with its description, key and relationships | `src/workflow/artifacts/companion/__tests__/er-page.test.ts` |
| pass | d9f85b3c t5 — one columns table per entity, with keys tagged and missing descriptions as null cells | `src/workflow/artifacts/companion/__tests__/er-page.test.ts` |
| pass | d9f85b3c t5 — an attribute-less entity's columns table has a single 'No columns' row | `src/workflow/artifacts/companion/__tests__/er-page.test.ts` |

**unit: er page builder: hostile characters sanitised**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | d9f85b3c t5 — names with quotes, angle brackets, colons or non-ASCII give safe erDiagram source and escaped tables | `src/workflow/artifacts/companion/__tests__/er-page.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/artifacts/companion/__tests__/er-page.test.ts` | 0 | 7 | 0.5 s |  |

## t6

Run at 2026-10-11T16:03:18.447Z on commit `6466a39d`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: sequence page builder: autonumber, labels, dashed returns, notes; participants + messages tables (Delivery-board fixture)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | d9f85b3c t6 — the sequenceDiagram is autonumbered, labels every message, dashes returns and keeps the notes | `src/workflow/artifacts/companion/__tests__/sequence-component-page.test.ts` |
| pass | d9f85b3c t6 — the participants and messages tables, in call order with kind tags | `src/workflow/artifacts/companion/__tests__/sequence-component-page.test.ts` |
| pass | d9f85b3c t6 — awkward participant ids are aliased; no truncations block when there are none | `src/workflow/artifacts/companion/__tests__/sequence-component-page.test.ts` |

**unit: component page builder: flowchart + components table**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | d9f85b3c t6 — the component flowchart has one box per component and one arrow per dependency | `src/workflow/artifacts/companion/__tests__/sequence-component-page.test.ts` |
| pass | d9f85b3c t6 — the components table lists path, depends-on and description, null when absent | `src/workflow/artifacts/companion/__tests__/sequence-component-page.test.ts` |
| pass | d9f85b3c t6 — component labels with quotes, pipes or markup cannot break the flowchart | `src/workflow/artifacts/companion/__tests__/sequence-component-page.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/artifacts/companion/__tests__/sequence-component-page.test.ts` | 0 | 6 | 0.3 s |  |

## t7

Run at 2026-10-11T16:05:55.645Z on commit `04b8d49f`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: ux page builder: stable depth-first markers match key-elements table (S002 card fixture)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | d9f85b3c t7 — key elements are numbered depth-first: top-level text, inputs, described elements and every action | `src/workflow/artifacts/companion/__tests__/ux-page.test.ts` |
| pass | d9f85b3c t7 — the markers in the card are exactly the table numbers, in the same order | `src/workflow/artifacts/companion/__tests__/ux-page.test.ts` |
| pass | d9f85b3c t7 — numbering is stable: the same definition always gives the same markers and table | `src/workflow/artifacts/companion/__tests__/ux-page.test.ts` |
| pass | d9f85b3c t7 — descriptions fill the table, and an undescribed key element gets a null cell | `src/workflow/artifacts/companion/__tests__/ux-page.test.ts` |

**unit: ux page builder: Submit vs OpenUrl distinguishable; html visual**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | d9f85b3c t7 — Submit and OpenUrl stay distinguishable in the card and the table | `src/workflow/artifacts/companion/__tests__/ux-page.test.ts` |
| pass | d9f85b3c t7 — the visual is HTML with its own card CSS, so the page inlines no Mermaid | `src/workflow/artifacts/companion/__tests__/ux-page.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/artifacts/companion/__tests__/ux-page.test.ts` | 0 | 6 | 0.5 s |  |

## t8

Run at 2026-10-11T16:19:19.702Z on commit `76d4f441`. Tests check: **passed**. 8 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: finalize[standalone-LLD]: four companions with header (LLD id + work item), same header values on all**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | finalize[standalone-LLD]: all four companions carry the header with the LLD id and work item, identically | `src/workflow/__tests__/companion-context-finalize.test.ts` |

**integration: finalize[design.epic]: HLD id as source doc**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | finalize[design.epic]: HLD companions name the HLD as the source doc and the Epic as the work item | `src/workflow/__tests__/companion-context-finalize.test.ts` |

**integration: finalize: missing runtime asset -> companion skipped, artifact written**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | finalize: a missing runtime asset skips the companions and still writes the artifact | `src/workflow/__tests__/companion-context-finalize.test.ts` |

**integration: finalize[standalone-LLD]: described definitions pass the HIGH gate and appear in the tables**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | finalize[standalone-LLD]: described definitions pass the HIGH gate and their narrative and descriptions reach the page | `src/workflow/__tests__/companion-context-finalize.test.ts` |

**integration: docgen shell.test.ts + docgen pipeline tests unchanged and passing**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | documentIRToMermaid: classDiagram with class decls + inherit/implement arrows | `src/docgen/render/__tests__/shell.test.ts` |
| pass | assembleShell: offline self-contained shell — runtime INLINED, no external fetch | `src/docgen/render/__tests__/shell.test.ts` |
| pass | listDocTypes exposes the Phase A type-structure capability (serializable, no extract fn) | `src/docgen/__tests__/generate.test.ts` |
| pass | generateDocument with an unknown docType → not-found, without touching the graph | `src/docgen/__tests__/generate.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/docgen/__tests__/generate.test.ts` | 0 | 3 | 0.5 s |  |
| `src/docgen/render/__tests__/shell.test.ts` | 0 | 5 | 0.3 s |  |
| `src/workflow/__tests__/companion-context-finalize.test.ts` | 0 | 4 | 0.7 s |  |

## t9

Run at 2026-10-11T16:22:21.248Z on commit `e812e0b2`. Tests check: **passed**. 9 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: completenessFindings: absent narrative / missing descriptions / fully described**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | d9f85b3c t9 — an absent narrative is one LOW, and missing descriptions one LOW naming them | `src/workflow/artifacts/companion/__tests__/completeness.test.ts` |
| pass | d9f85b3c t9 — a fully described definition of each kind has no completeness findings | `src/workflow/artifacts/companion/__tests__/completeness.test.ts` |
| pass | d9f85b3c t9 — a narrative alone, or descriptions alone, leaves exactly the other LOW | `src/workflow/artifacts/companion/__tests__/completeness.test.ts` |
| pass | d9f85b3c t9 — a long list is summarised after eight names | `src/workflow/artifacts/companion/__tests__/completeness.test.ts` |
| pass | d9f85b3c t9 — the validators are unchanged: a sound undescribed definition still validates to [] | `src/workflow/artifacts/companion/__tests__/completeness.test.ts` |

**integration: code-review diagram + ux dimensions: completeness LOWs recorded, verdict not block**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | runCodeReview: a sound erDefinition runs the diagram dimension + folds to pass | `src/workflow/code-review/__tests__/diagram-conditional.test.ts` |
| pass | judgeDiagram: a sound sequence / component definition → only the completeness LOWs (LLD-d9f85b3c t9) | `src/workflow/code-review/dimensions/__tests__/diagram-handlers.test.ts` |
| pass | judgeDiagram: dispatches an erDefinition-bearing body to the ER handler (sound → only completeness LOWs) | `src/workflow/code-review/dimensions/__tests__/diagram.test.ts` |
| pass | judgeUx: a schema-valid uxDefinition → dimension:ux, only completeness LOWs | `src/workflow/code-review/dimensions/__tests__/ux.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/artifacts/companion/__tests__/completeness.test.ts` | 0 | 5 | 0.5 s |  |
| `src/workflow/code-review/__tests__/diagram-conditional.test.ts` | 0 | 7 | 0.5 s |  |
| `src/workflow/code-review/dimensions/__tests__/diagram-handlers.test.ts` | 0 | 5 | 0.4 s |  |
| `src/workflow/code-review/dimensions/__tests__/diagram.test.ts` | 0 | 8 | 0.5 s |  |
| `src/workflow/code-review/dimensions/__tests__/ux.test.ts` | 0 | 9 | 0.5 s |  |
