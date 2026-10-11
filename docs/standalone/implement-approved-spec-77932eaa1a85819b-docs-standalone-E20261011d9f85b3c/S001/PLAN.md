<!-- insrc:artifact PLAN-d9f85b3cc8cc966b-S001 -->

# Plan: E20261011d9f85b3c:S001

## Summary

**Epic:** `decompose-approved-lld-d9f85b3cc8cc966b-s001-shared`
**LLD run:** `wf-1791714449161-37ufux`
**LLD effective hash:** `d9f85b3cc8cc...`

Building this Story replaces how the workflow writes its four companion pages. It first widens the definitions (and the closed schemas that validate them) with optional narrative and description fields, then adds one shared page shell with a single pan/zoom script and a header resolver, then gives each companion type a small builder that turns its definition into a picture plus description tables. Finally the four renderers and the three finalize sites are switched to the new shell, completeness LOWs are surfaced in code review, and the old render paths and their tests are removed or rewritten. The docgen tool is left untouched throughout.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add optional narrative/description fields to the four definitions and every schema that validates them | M | — | unit: er/ux/sequence/component validators: described definition (narrative + descriptions) -> no HIGH; unit: er/ux/sequence/component validators: sound undescribed definition -> []; unit: body-fields / ux-body-fields: synth property schemas admit narrative + description | [[c4]] [[c9]] [[c10]] |
| 2 | **`t2`** Shared pan/zoom runtime asset | S | — | unit: panzoom asset: no http(s)/import references; exposes init + fit entry points; smoke: headless Chrome: each generated page draws, fit-on-load applied, no console error | [[c1]] [[c3]] |
| 3 | **`t3`** Companion page shell and runtime loader | M | `t2` | unit: shell: section order + header table rows + no external URL; unit: shell view panel: toolbar controls, pan/zoom init, fit-on-load for mermaid and html visuals; html page has no Mermaid; unit: shell: escaping of all table text; null cell -> em dash; missing narrative renders only the context line; unit: shell runtime loader: missing asset -> DiagramGenerationError | [[c1]] [[c3]] [[c7]] |
| 4 | **`t4`** Resolve the companion header | M | — | unit: header: projectName override / basename fallback / malformed config ignored; unit: header: git user / OS fallback / 'unknown'; injected clock format; unit: header: malformed createdAt/epicHash/storyId -> plain id fallback, no throw; unit: header contextLine: HLD / epic-Story LLD / standalone LLD / placement-only | [[c2]] [[c7]] |
| 5 | **`t5`** ER page builder | M | `t1`, `t3` | unit: er page builder: erDiagram, PK, cardinality, self-loop (Delivery read-model fixture); unit: er page builder: entities + columns tables, null descriptions, no-columns row; unit: er page builder: hostile characters sanitised | [[c1]] [[c3]] [[c4]] [[c7]] |
| 6 | **`t6`** Sequence and component page builders | M | `t1`, `t3` | unit: sequence page builder: autonumber, labels, dashed returns, notes; participants + messages tables (Delivery-board fixture); unit: component page builder: flowchart + components table | [[c1]] [[c3]] [[c4]] |
| 7 | **`t7`** UX page builder | M | `t1`, `t3` | unit: ux page builder: stable depth-first markers match key-elements table (S002 card fixture); unit: ux page builder: Submit vs OpenUrl distinguishable; html visual | [[c1]] [[c3]] [[c4]] [[c7]] |
| 8 | **`t8`** Route the four renderers and the three finalize sites through the shell, with the render-level suites | M | `t4`, `t5`, `t6`, `t7` | integration: finalize[standalone-LLD]: four companions with header (LLD id + work item), same header values on all; integration: finalize[design.epic]: HLD id as source doc; integration: finalize: missing runtime asset -> companion skipped, artifact written; integration: finalize[standalone-LLD]: described definitions pass the HIGH gate and appear in the tables; integration: docgen shell.test.ts + docgen pipeline tests unchanged and passing | [[c1]] [[c2]] [[c6]] [[c7]] [[c9]] |
| 9 | **`t9`** Completeness findings surfaced in code review | S | `t1` | unit: completenessFindings: absent narrative / missing descriptions / fully described; integration: code-review diagram + ux dimensions: completeness LOWs recorded, verdict not block | [[c5]] |
| 10 | **`t10`** Remove the dead render paths and trim the IR-based tests | M | `t8`, `t9` | unit: tsc --noEmit passes with the removed symbols gone; integration: full companion + workflow + mcp + docgen test subsets pass | [[c6]] [[c8]] [[c9]] |

### 1.1 E20261011d9f85b3c:S001:T001 — Add optional narrative/description fields to the four definitions and every schema that validates them

Extend ErDefinition/ErClass/ErSlot, SequenceDefinition/participants/messages, ComponentDependencyDefinition/components (+ path), UxDefinition/elements/actions with optional narrative/description; mirror them in the four *_PROPERTY_SCHEMA objects AND the vendored closed linkml-metamodel.schema.json and adaptive-cards.schema.json; update the four *_CONTENT_GATE_RULE strings to ask for a narrative and per-element descriptions.

**Acceptance checks:**
- A definition of each kind carrying narrative + descriptions gets no HIGH from its validate*Definition.
- A sound definition without the new fields still returns [] from every validator.
- The design.story and design.epic synthesizer schemas expose the new optional fields.

### 1.2 E20261011d9f85b3c:S001:T002 — Shared pan/zoom runtime asset

Add src/assets/artifacts/companion/panzoom.js: a dependency-free, transform-based pan/zoom bound to a view panel and toolbar (zoom out, zoom %, zoom in, Fit, 1:1), with drag-pan, wheel zoom at the cursor, double-click zoom and an exposed fit() for fit-on-load. Works on any child (SVG or HTML).

**Acceptance checks:**
- The script has no external references and is shipped by copy-assets (src/assets is copied wholesale).
- It exposes an init entry the shell can call with the panel/stage/toolbar ids and a fit() hook.

### 1.3 E20261011d9f85b3c:S001:T003 — Companion page shell and runtime loader

Add src/workflow/artifacts/companion/shell.ts with CompanionPageContent / DescriptionBlock / DescriptionCell types and renderCompanionPage(header, page, runtime): Header (project, title, kind badge, table Work item / Source doc link / Date / User), Narrative (context line + optional narrative), View panel (mermaid or html visual + toolbar + pan/zoom init + fit on load; Mermaid inlined only for mermaid visuals), Description tables (all cells escaped; null -> em dash). A runtime loader reads mermaid.min.js and panzoom.js and throws DiagramGenerationError when either is missing.

**Acceptance checks:**
- Output has Header, Narrative, View, Description in order with the four header-table rows.
- Toolbar controls, pan/zoom init and fit-on-load are present for mermaid and html visuals; an html page inlines no Mermaid; no http(s) URL appears.
- All table text is escaped and null cells render as an em dash.
- A missing runtime asset raises DiagramGenerationError.

### 1.4 E20261011d9f85b3c:S001:T004 — Resolve the companion header

Add CompanionHeader to types.ts and a header module that resolves projectName (.insrc/config.json projectName, else repo basename), workItemId via safeCanonical with storyId/epicHash fallback, sourceDoc {id, href}, an injected-clock date 'YYYY-MM-DD HH:mm', user (git user.name, else OS login, else 'unknown') and the context line per source kind (HLD summary / DEF Story statement / standalone story title + LLD summary / placement only). Never throws.

**Acceptance checks:**
- projectName override and basename fallback both work; a malformed config is ignored.
- git, OS and 'unknown' user fallbacks work with stubbed lookups.
- Malformed createdAt/epicHash/storyId yields the plain id fallback without throwing.
- Context line matches each source kind.

### 1.5 E20261011d9f85b3c:S001:T005 — ER page builder

In er.ts add a pure builder from ErDefinition to CompanionPageContent: Mermaid erDiagram with typed scalar columns, PK markers from identifier slots, relationship lines labelled with the slot name and cardinality (||--o{ multivalued, ||--|| required single, ||--o| optional single, self-loops), sanitised identifiers/labels; an entities table (entity, description, key, relationships) and one columns table per entity (column, type, required, multi-valued, PK/FK, description).

**Acceptance checks:**
- Source starts with erDiagram, never classDiagram.
- Cardinality, self-loop and PK rendering match the LLD edge cases.
- Missing descriptions become null cells; an attribute-less entity gets a 'no columns' row.
- Entity/slot names with quotes, angle brackets, colons or non-ASCII produce sanitised erDiagram source and escaped table cells.

### 1.6 E20261011d9f85b3c:S001:T006 — Sequence and component page builders

In sequence.ts: autonumbered sequenceDiagram with real message labels, dashed returns, recursion and truncation notes, plus participants and ordered messages tables. In component.ts: flowchart LR with one box per component and labelled dependency arrows, plus a components table (component, path, depends on, description).

**Acceptance checks:**
- Sequence source contains autonumber, every message label, -->> for returns, and the recursion/truncation notes.
- Messages table is in call order with call/return/recurse tags.
- Components table lists path, depends-on and description (null when absent).

### 1.7 E20261011d9f85b3c:S001:T007 — UX page builder

In ux.ts: reuse the existing card element emitter for the html visual, adding depth-first stable numbered markers on key elements (inputs, actions, top-level text blocks, described containers; layout-only columns unnumbered), plus a key-elements table (#, element, type, id/target, description) whose numbers match the markers.

**Acceptance checks:**
- Marker numbers in the card match the table rows and are stable for the same definition.
- Submit vs OpenUrl actions stay distinguishable.
- Visual kind is html, so the page inlines no Mermaid.

### 1.8 E20261011d9f85b3c:S001:T008 — Route the four renderers and the three finalize sites through the shell, with the render-level suites

Change renderErCompanion / renderUxCompanion / renderSequenceCompanion / renderComponentCompanion to take a required header, build page content via t5-t7 and render via renderCompanionPage (no more assembleShell). In orchestrator.ts resolve one CompanionHeader per finalize site (HLD, epic-Story LLD, standalone LLD) and thread it through renderErCompanionForBody / renderUxCompanionForBody / renderDiagramCompanionsForBody, replacing siblingSourceLink. In the same change rewrite render, diagram-render, ux-render, ux-integration, ux-mock-render, context-sections and companion-context-finalize tests to the new shell.

**Acceptance checks:**
- Finalize at all three sites writes companions whose header shows the right source doc id and work item.
- CompanionArtifactRef kinds and relPaths are unchanged.
- A missing runtime asset still leaves the artifact written without that companion ref.
- The rewritten render-level and finalize suites pass, and src/docgen/render/__tests__/shell.test.ts passes unchanged.

### 1.9 E20261011d9f85b3c:S001:T009 — Completeness findings surfaced in code review

Add a pure completenessFindings(def) per kind returning at most two LOW DimensionFindings (missing narrative; elements missing a description) and call it from the code-review diagram handlers (er, sequence, component) and the ux dimension. Validators and firstCompanionValidationFailure stay unchanged.

**Acceptance checks:**
- Absent narrative -> one LOW; missing descriptions -> one LOW naming them; fully described -> [].
- Code-review records show these LOWs and the verdict never becomes block because of them.

### 1.10 E20261011d9f85b3c:S001:T010 — Remove the dead render paths and trim the IR-based tests

Delete erDefinitionToIr / sequenceDefinitionToIr / componentDependencyDefinitionToIr / uxDefinitionToIr, the old renderUxMockDocument page wrapper and generate.ts (+ generate.test.ts) once nothing imports them; trim er, sequence, component and ux tests and fixtures/er-parity.ts of IR expectations, keeping their validator/schema coverage.

**Acceptance checks:**
- No import of the removed symbols remains (tsc passes).
- Every suite in the LLD test inventory is rewritten (t8), trimmed or deleted as listed.
- Full companion + workflow + docgen test subsets pass.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| companion shell renderCompanionPage (header table, narrative, view panel, description blocks, inlined runtimes, no external URL) | `t3` |
| ER page builder: erDiagram source (typed columns, PK, labelled relationships with \|\|--o{ / \|\|--\|\| / \|\|--o\| cardinality, self-loop) + entities/columns tables | `t5` |
| sequence page builder: autonumber, real labels, dashed returns, recursion/truncation notes + participants/messages tables | `t6` |
| component page builder: flowchart + components table | `t6` |
| UX page builder: card HTML with depth-first stable markers + key-elements table | `t7` |
| header resolver: projectName override vs basename, git user vs OS fallback vs 'unknown', injected clock formatting, workItemId/sourceDoc derivation | `t4` |
| validators: a definition of each kind CARRYING narrative + descriptions (ER classes/slots, UX elements/actions, sequence participants/messages, components) returns no HIGH from validateErDefinition / validateUxDefinition / validateSequenceDefinition / validateComponentDependencyDefinition (proves the vendored LinkML and Adaptive Cards schemas were extended) | `t1` |
| completenessFindings: absent narrative -> one LOW; missing descriptions -> one LOW naming them; fully described -> [] | `t9` |
| header contextLine: HLD summary for HLD sources, DEF Story statement for epic-Story LLDs, boundary.internal story title + LLD summary for standalone LLDs, placement-only fallback | `t4` |
| header resolver: malformed createdAt / epicHash / storyId -> Work item falls back to storyId / epicHash and nothing throws | `t4` |
| validators unchanged: a sound definition WITHOUT narrative/descriptions still returns [] from every validate*Definition (empty-when-sound contract kept) | `t1` |
| shell view panel: for every page kind (er, ux, sequence, component) the output contains the toolbar controls (zoom out, zoom %, zoom in, Fit, 1:1), the inlined pan/zoom runtime, its init hook wiring drag-pan / wheel-zoom / double-click zoom, and a fit-on-load call (after mermaid.run for diagrams, immediately for UX) | `t2`, `t3` |
| standalone LLD finalize writes er-model.html / ux-mock.html / sequence-diagram.html / component-dependency.html containing the header table with the LLD id and work-item id | `t8` |
| design.epic HLD finalize uses the HLD id as source doc | `t8` |
| missing runtime asset → DiagramGenerationError swallowed, artifact still written without that companion ref | `t3`, `t8` |
| src/docgen/render/__tests__/shell.test.ts and the docgen pipeline tests pass unchanged | `t8`, `t10` |
| finalize[standalone-LLD]: a body whose definitions carry narrative + descriptions passes the HIGH gate and renders the four companions with those descriptions in the tables | `t8` |
| code-review diagram/ux dimensions: completeness LOWs appear in the record for an undescribed definition and never change the verdict to block | `t9` |
| headless Chrome renders each generated page: Mermaid diagram present, fit-on-load applied, no console error (manual/optional, gated like other live checks) | `t2` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD S001 contractDetails (render*Companion signatures + postconditions)`
- **[[c2]]** `prior-artifact` `LLD S001 dataModelChanges CompanionHeader`
- **[[c3]]** `prior-artifact` `LLD S001 dataModelChanges CompanionPageContent`
- **[[c4]]** `prior-artifact` `LLD S001 dataModelChanges ErDefinition / SequenceDefinition / ComponentDependencyDefinition / UxDefinition field-adds`
- **[[c5]]** `prior-artifact` `LLD S001 dataModelChanges Completeness findings`
- **[[c6]]** `prior-artifact` `LLD S001 dataModelChanges generateErCompanions dead seam + Companion test suites inventory`
- **[[c7]]** `prior-artifact` `LLD S001 errorPaths`
- **[[c8]]** `prior-artifact` `LLD S001 testStrategy`
- **[[c9]]** `prior-artifact` `LLD S001 migration`
- **[[c10]]** `prior-artifact` `SPEC-77932eaa1a85819b (acceptance criteria ac1-ac7 trace to its Header / Narrative / View / Description / optional-fields clauses)`
