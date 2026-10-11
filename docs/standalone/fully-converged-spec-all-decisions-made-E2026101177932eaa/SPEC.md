<!-- insrc:artifact SPEC-77932eaa1a85819b -->

# Spec: Rework the generated companion artifact HTML (er-model, ux-mock, sequence-diagram, component-dependency) into ONE shared page shell with per-type plug-ins; each plug-in supplies only its visual and its description tables.

**Category:** design

## Intent

Rework the generated companion artifact HTML (er-model, ux-mock, sequence-diagram, component-dependency) into ONE shared page shell with per-type plug-ins; each plug-in supplies only its visual and its description tables. Approved mocks: docs/plans/companion-template-mocks/{er-model,ux-mock,sequence-diagram,component-dependency}.html (the real renderer inlines mermaid; the mocks load it by relative path).

HEADER: project name (repo folder basename, optionally overridden by per-repo .insrc config), title, type badge, and a reference table: Work item (canonical work-item id); Source doc (source artifact id, linking the sibling .md, replacing the old narrative-band back-link); Date (render date, injected so tests can pin it); User (git user.name, falling back to OS login).

NARRATIVE: a deterministic context line from the source artifact (Epic/Story placement plus HLD Summary or Story statement), plus an OPTIONAL per-visual `narrative` field authored into each definition in the same synthesis pass (no extra LLM call). A missing narrative leaves only the context line and emits a LOW finding.

VIEW: a framed view panel with toolbar (zoom out / % / zoom in / Fit / 1:1), drag-pan, wheel-zoom, double-click zoom, and fit on load. One transform-based pan/zoom runtime is applied identically to all four visuals, including the UX mock, and replaces svg-pan-zoom for companions.

DESCRIPTION (per-type tables):
- ER: entities table (entity, description, key, relationships) plus a per-entity columns table (column, type, required, multi-valued, PK/FK, description).
- UX: key-elements table (#, element, type, id/target, description), with numbered markers on the mock matching the rows.
- Sequence: participants table plus an ordered messages table (step, from->to, message, call/return, description).
- Component: components table (component, path, depends on, description).

VISUAL FIXES: the ER visual becomes a real Mermaid erDiagram (typed columns, PK markers, labelled relationship lines with crow's-foot cardinality), replacing today's classDiagram that draws relationships as inheritance arrows. Sequence arrows carry the real message labels, autonumbered, with returns dashed (today every arrow reads 'call').

## Scope boundary

Stops at the companion renderer, the shared page template/shell, the pan/zoom runtime, and the definition-schema additions. OPTIONAL `description` fields are added on ER classes/slots, UX elements, sequence participants/messages, and component nodes; a missing description renders '—', emits a LOW finding, and never blocks rendering. Already-generated companions under docs/ are left in their old format; no new visual types are introduced.

## Non-goals

- Migrating or regenerating existing companions under docs/
- Adding new visual types
- Any per-type pan/zoom deviation (all four visuals share one runtime)
- Making narrative or descriptions required

## Citations

- **[[c1]]** `step-output` `s1`
- **[[c2]]** `doc` `docs/plans/companion-template-mocks/er-model.html`
- **[[c3]]** `code` `src/workflow/artifacts/companion/render.ts`
- **[[c4]]** `code` `src/docgen/render/shell.ts`
