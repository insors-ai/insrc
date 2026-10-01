<!-- insrc:artifact ISSUE-85e6a58693579b6d -->

# The experience mock is published as a diagram of the card's JSON, not as a mock of the interface

## Reproduction

Author any document whose body carries a `uxDefinition`, approve it, and open the generated `ux-mock.html` sibling.

Observed: the page shows a Mermaid node graph whose boxes are labelled with ELEMENT TYPE NAMES — `TextBlock: "insrc docs review — a pending…"`, `Container`, `ColumnSet` — wired together by containment arrows, followed by a prose section that re-lists the same elements as bullets (`TextBlock: "…" — read-only display text`). Nothing on the page resembles a user interface: no laid-out text, no input controls, no buttons, no columns.

Concretely, the mock generated for Epic bfe98ff7's own HLD renders as a single row of small near-identical boxes above a large empty area, over an "Elements & roles" bullet list. A reviewer opening it to see what the feature will look like learns only what JSON the author wrote.

Expected: a reader opens the experience mock and sees an approximation of the interface — text laid out as text, inputs as input controls, an action set as buttons, a column set as side-by-side columns. That is what both the ref kind (`ux-mock`) and the document section ("Experience mock" / "UX") promise.

## Root cause

The UX companion shares the DIAGRAM pipeline with the ER, sequence and component companions, and that pipeline has no layout path.

`uxDefinitionToIr` (src/workflow/artifacts/companion/ux.ts:275-303) returns a `DocumentIR` and fills it with graph primitives, not layout. It seeds a root node for the card, then walks the element tree pushing one node per element and one edge per parent/child relationship — `nodes.push({ id, label: labelFor(el), kind: el.type })` at :288 and `edges.push({ id: ..., from: parentId, to: id, kind: 'contains' })` at :289 — and returns them as `derived: { nodes, edges }` at :298. That is the same shape `erDefinitionToIr` (er.ts:273) and `componentDependencyDefinitionToIr` (component.ts:207) produce.

`labelFor` (ux.ts:191-202) is the clearest evidence the output is an inventory of the JSON rather than a rendering of it: for each element it returns a string naming the element's own type — `TextBlock: "<text>"`, `Container`, `ColumnSet`, `Column (<width>)`, `Input.Text #<id>`. The element's content becomes a caption on a graph node instead of becoming content.

`assembleShell` (src/docgen/render/shell.ts:255) then renders that IR, and it is unconditionally a diagram shell: it loads the Mermaid runtime, and for an oversized IR falls back to `toGraphvizDot(ir)` rendered as SVG. Both branches draw a graph; neither lays out a document. So the IR a UX definition produces could not render as a mock even in principle.

Finally, nothing in the repository can render an Adaptive Card. Only the Adaptive Cards JSON SCHEMA ships, loaded by `loadAdaptiveCardsSchema` (adaptive-cards.ts) for ajv validation — the card is validated for well-formedness and then diagrammed.

This is pre-existing and affects every ux-mock ever generated. It is not introduced by Epic bfe98ff7; it was surfaced by inspecting the companion that Epic's own HLD produced.

## Fix intent

Make the experience mock show the experience: the generated companion should present the authored card as an approximation of the interface, where each element appears as the thing it denotes rather than as a labelled node — text as laid-out text, an input as an input control, an action set as buttons, a column set as side-by-side columns, a container as a visually grouped region — preserving the card's nesting and element order.

The companion must keep the properties the surrounding system already relies on: a single self-contained offline file with no network fetches, deterministic output for a given definition, and the existing reference contract by which a document links to its companion rather than inlining it. Every element type the UX schema admits must render as something; an element the renderer does not understand must degrade visibly rather than vanish, so a reviewer is never shown a mock that silently omits part of the authored design.

The explanatory prose the companion already carries should remain available, because it is the part a reviewer reads to understand intent — but it should accompany the rendered mock rather than substitute for it.

DELIBERATELY NOT DECIDED HERE: whether to vendor an existing Adaptive Cards renderer, author a deterministic wireframe emitter, or extend the document-generation shell with a layout document type. Those have materially different costs in bundle size, fidelity and ongoing maintenance, and choosing between them is the design stage's job. The routing title attached to this record leans toward one of the three; the design stage should score all three on their merits rather than treat that phrasing as a decision already taken.

Sequencing: this must land before Epic bfe98ff7's Story S004, which displays this artifact in the review pane — shipping that Story against the current renderer would put a node graph behind a label reading "experience mock".

## Citations

- **[[c1]]** `code` `src/workflow/artifacts/companion/ux.ts:275` — "export function uxDefinitionToIr(uxDef: UxDefinition): DocumentIR {"
- **[[c2]]** `code` `src/workflow/artifacts/companion/ux.ts:288` — "nodes.push({ id, label: labelFor(el), kind: el.type });"
- **[[c3]]** `code` `src/workflow/artifacts/companion/ux.ts:289` — "edges.push({ id: `${parentId}->${id}`, from: parentId, to: id, kind: 'contains' });"
- **[[c4]]** `code` `src/workflow/artifacts/companion/ux.ts:298` — "derived:             { nodes, edges },"
- **[[c5]]** `code` `src/workflow/artifacts/companion/ux.ts:193` — "case 'TextBlock':       return `TextBlock: "${truncate(el.text)}"`;"
- **[[c6]]** `code` `src/workflow/artifacts/companion/ux.ts:199` — "case 'ColumnSet':       return 'ColumnSet';"
- **[[c7]]** `code` `src/docgen/render/shell.ts:255` — "export async function assembleShell("
- **[[c8]]** `code` `src/docgen/render/shell.ts:270` — "const result = await renderer.renderSvg(toGraphvizDot(ir));"
- **[[c9]]** `code` `src/workflow/artifacts/companion/er.ts:273` — "export function erDefinitionToIr(erDef: ErDefinition): DocumentIR {"
- **[[c10]]** `code` `src/workflow/artifacts/companion/render.ts:131` — "renderUxCompanion("
- **[[c11]]** `code` `src/workflow/artifacts/companion/er-schema.ts:62` — "kind:        { enum: ['diagram-mermaid', 'diagram-html', 'ux-mock'] },"
- **[[c12]]** `analyze-bundle` `insrc_analyze_step how-does-it-work over src/workflow/artifacts/companion (6 explorations, repoIndexedAt 2026-10-01T11:41:00Z)` — "The decisive fact is the RETURN TYPE of the first function: DocumentIR. That is the same intermediate representation the diagram mappers in this module produce"
- **[[c13]]** `prior-artifact` `docs/epics/build-vs-code-plugin-ui-integration-E20260929bfe98ff7/HLD.md — UX section` — "Experience mock — s4, sc4 slot labelled 'experience', peer to the diagram"
