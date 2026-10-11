<!-- insrc:artifact LLD-d9f85b3cc8cc966b-S001 -->

# LLD: E20261011d9f85b3c:S001

## Summary

**Epic:** `implement-approved-spec-77932eaa1a85819b-docs-standalone`
**HLD base run:** `wf-1791714449161-37ufux`
**HLD effective hash:** `d9f85b3cc8cc...`

Every companion page the workflow generates (ER model, UX mock, sequence diagram, component dependencies) is rendered through one companion-owned page shell instead of docgen's diagram shell and the separate UX emitter. The page has a header (project name, work item, source doc, date, user), a narrative (a context line from the source document plus the visual's own narrative), a view panel with one pan/zoom for every visual, and per-type description tables. Each definition module supplies only typed page content; the shell owns layout, escaping and the inlined runtimes. The ER visual becomes a real entity-relationship diagram and sequence arrows carry their real labels; definitions gain optional description and narrative fields whose absence raises a LOW finding.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)
9. [Open questions](#9-open-questions)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal

### 2.1 `renderErCompanion`

```typescript
renderErCompanion(erDef: ErDefinition, title: string, destPath: string, opts: RenderErCompanionOpts & { readonly header: CompanionHeader }): Promise<CompanionArtifactRef>
```

**Parameters:**
- `erDef: ErDefinition` — The validated ER definition (source of truth).
- `title: string` — Page title shown in the header.
- `destPath: string` — Sibling path of the source .md to write er-model.html to.
- `opts: RenderErCompanionOpts & { header: CompanionHeader }` — repoPath/ofSectionId as today; header carries project, work item, source doc, date, user and context line. sourceLink is superseded by header.sourceDoc.

**Returns:** `Promise<CompanionArtifactRef>` — kind 'diagram-mermaid' ref to the written page, unchanged shape.

**Errors:**
- `DiagramGenerationError` when The vendored Mermaid or pan/zoom runtime asset cannot be read; nothing is written.
- `NodeJS.ErrnoException` when Writing destPath fails (propagates as today).

**Preconditions:**
- erDef passed firstCompanionValidationFailure (no HIGH findings).
- header was resolved for the source document being finalized.

**Postconditions:**
- destPath holds one self-contained HTML page with Header, Narrative, View (erDiagram + pan/zoom) and Description (entities table + one columns table per entity).
- No external URL is referenced; Mermaid and pan/zoom are inlined.
- Missing class/slot descriptions render as an em dash.

### 2.2 `renderUxCompanion`

```typescript
renderUxCompanion(uxDef: UxDefinition, title: string, destPath: string, opts: RenderUxCompanionOpts & { readonly header: CompanionHeader }): Promise<CompanionArtifactRef>
```

**Parameters:**
- `uxDef: UxDefinition` — The validated Adaptive Cards subset.
- `title: string` — Page title.
- `destPath: string` — Where ux-mock.html is written.
- `opts: RenderUxCompanionOpts & { header: CompanionHeader }` — As above.

**Returns:** `Promise<CompanionArtifactRef>` — kind 'ux-mock' ref, unchanged shape.

**Errors:**
- `DiagramGenerationError` when The pan/zoom runtime asset cannot be read; nothing is written.
- `NodeJS.ErrnoException` when Writing destPath fails.

**Preconditions:**
- uxDef passed firstCompanionValidationFailure.

**Postconditions:**
- The card renders inside the same pan/zoom view panel as diagrams, with numbered markers on key elements matching the rows of the key-elements table.
- No Mermaid runtime is inlined for a UX page.

### 2.3 `renderSequenceCompanion`

```typescript
renderSequenceCompanion(seqDef: SequenceDefinition, title: string, destPath: string, opts: RenderDiagramCompanionOpts & { readonly header: CompanionHeader }): Promise<CompanionArtifactRef>
```

**Parameters:**
- `seqDef: SequenceDefinition` — The validated sequence definition.
- `title: string` — Page title.
- `destPath: string` — Where sequence-diagram.html is written.
- `opts: RenderDiagramCompanionOpts & { header: CompanionHeader }` — As above.

**Returns:** `Promise<CompanionArtifactRef>` — kind 'diagram-mermaid' ref, unchanged shape.

**Errors:**
- `DiagramGenerationError` when A runtime asset cannot be read; nothing is written.

**Preconditions:**
- seqDef passed firstCompanionValidationFailure.

**Postconditions:**
- The sequenceDiagram is autonumbered, each arrow carries the message label, returns are dashed, recursion and truncation notes are preserved.
- Description holds a participants table and an ordered messages table.

### 2.4 `renderComponentCompanion`

```typescript
renderComponentCompanion(compDef: ComponentDependencyDefinition, title: string, destPath: string, opts: RenderDiagramCompanionOpts & { readonly header: CompanionHeader }): Promise<CompanionArtifactRef>
```

**Parameters:**
- `compDef: ComponentDependencyDefinition` — The validated component definition.
- `title: string` — Page title.
- `destPath: string` — Where component-dependency.html is written.
- `opts: RenderDiagramCompanionOpts & { header: CompanionHeader }` — As above.

**Returns:** `Promise<CompanionArtifactRef>` — kind 'diagram-mermaid' ref, unchanged shape.

**Errors:**
- `DiagramGenerationError` when A runtime asset cannot be read; nothing is written.

**Preconditions:**
- compDef passed firstCompanionValidationFailure.

**Postconditions:**
- A flowchart with one box per component and labelled dependency arrows.
- Description holds a components table (component, path/label, depends on, description).

## 3. Data model changes

### 3.1 `CompanionHeader` — new

New type in src/workflow/artifacts/companion/types.ts: { projectName: string; workItemId: string; sourceDoc: { id: string; href: string }; date: string; user: string; contextLine: string }. Resolved once per finalize site by a new header module: projectName = `<repo>/.insrc/config.json` key `projectName` when a non-empty string, else basename(repoPath); workItemId = safeCanonical(() => <epic or story workflow id from epicHash, anchorCreatedAt, storyId>) (src/workflow/id.ts), falling back to the plain storyId (LLD) or epicHash (HLD) when the minters would throw on a malformed createdAt / epicHash / storyId; sourceDoc.id = hldArtifactId / lldArtifactId, href = './' + basename(source md); date = injectable clock formatted 'YYYY-MM-DD HH:mm' local time; user = `git config user.name` in the repo, else os.userInfo().username, else 'unknown'; contextLine (deterministic, per the SPEC 'Epic/Story placement plus HLD Summary or Story statement'): for an HLD source, 'Epic <slug>' + the first sentence of the HLD body.summary.prose; for an epic-Story LLD, 'Story <Snnn> of Epic <slug>' + the Story's title and userValue first sentence read from the Epic's DEF (the same DEF the LLD finalize already resolves); for a standalone LLD, 'Standalone story <Snnn>' + the story title persisted in body.hldContextSlice.boundary.internal (set from the triage storyTitle by standaloneStoryContext in src/workflow/runners/design-story/standalone.ts) and the first sentence of the LLD body.summary.prose. When none is available the line is placement only.

**Call sites:**
- `src/workflow/orchestrator.ts`
- `src/workflow/id.ts`
- `src/workflow/storage.ts`
- `src/indexer/repo-ignore-config.ts`
- `src/workflow/runners/design-story/standalone.ts`

### 3.2 `CompanionPageContent` — new

New type returned by a pure per-kind builder in each of er.ts / ux.ts / sequence.ts / component.ts: { kindLabel: string; narrative?: string; visual: { kind: 'mermaid'; source: string } | { kind: 'html'; html: string }; description: readonly DescriptionBlock[] }. DescriptionBlock = { heading?: string; lead?: string; columns: readonly string[]; rows: readonly (readonly DescriptionCell[])[] }, DescriptionCell = string | { tag: 'pk' | 'fk' | 'call' | 'return' | 'marker'; text: string } | null (null renders as an em dash). The UX html visual is produced by the existing card emitter in ux.ts (already escaped); every other string is escaped by the shell.

**Call sites:**
- `src/workflow/artifacts/companion/render.ts`
- `src/workflow/artifacts/companion/er.ts`
- `src/workflow/artifacts/companion/ux.ts`
- `src/workflow/artifacts/companion/sequence.ts`
- `src/workflow/artifacts/companion/component.ts`

### 3.3 `ErDefinition` — field-add

Optional `narrative?: string` on the definition; optional `description?: string` on ErClass and on ErSlot. ER_DEFINITION_PROPERTY_SCHEMA gains the same optional properties. validateErDefinition validates against the VENDORED, CLOSED LinkML subset (src/assets/artifacts/schemas/linkml-metamodel.schema.json: additionalProperties:false at root, ErClass and ErSlot), so that asset must also gain `narrative` (root, string), `description` (class, string) and `description` (slot, string); without it every definition using the fields would get a HIGH 'LinkML metamodel violation' and finalize would re-prompt forever. `narrative` is an insrc extension (not LinkML-native); `description` is LinkML-native.

```
+ narrative?: string (root)
+ classes.<C>.description?: string
+ classes.<C>.attributes.<s>.description?: string
```

**Call sites:**
- `src/workflow/artifacts/companion/er-schema.ts`
- `src/assets/artifacts/schemas/linkml-metamodel.schema.json`
- `src/workflow/artifacts/companion/er.ts`
- `src/workflow/runners/design-story/schemas.ts`
- `src/workflow/runners/design-epic/schemas.ts`

### 3.4 `SequenceDefinition` — field-add

Optional `narrative?: string`; optional `description?: string` on SequenceParticipant and SequenceMessage. SEQUENCE_DEFINITION_PROPERTY_SCHEMA updated to match.

```
+ narrative?: string
+ participants[].description?: string
+ messages[].description?: string
```

**Call sites:**
- `src/workflow/artifacts/companion/sequence-schema.ts`

### 3.5 `ComponentDependencyDefinition` — field-add

Optional `narrative?: string`; optional `description?: string` and `path?: string` on Component. COMPONENT_DEFINITION_PROPERTY_SCHEMA updated to match.

```
+ narrative?: string
+ components[].description?: string
+ components[].path?: string
```

**Call sites:**
- `src/workflow/artifacts/companion/component-schema.ts`

### 3.6 `UxDefinition` — field-add

Optional `narrative?: string` on the card and optional `description?: string` on every UxElement variant and on UxAction. validateUxDefinition validates against the VENDORED, CLOSED Adaptive Cards subset (src/assets/artifacts/schemas/adaptive-cards.schema.json: additionalProperties:false at the root and on every element and action def), not against UX_DEFINITION_PROPERTY_SCHEMA. So the vendored schema gains `narrative` at the root and `description` on every element/action def, and UX_DEFINITION_PROPERTY_SCHEMA gains root `narrative`. Decided now, not deferred to build.

```
+ narrative?: string (root)
+ body[*].description?: string (every element def)
+ actions[*].description?: string
```

**Call sites:**
- `src/workflow/artifacts/companion/ux-schema.ts`
- `src/assets/artifacts/schemas/adaptive-cards.schema.json`
- `src/workflow/artifacts/companion/ux.ts`

### 3.7 `Completeness findings (missing narrative / descriptions)` — new

The validators (validateErDefinition, validateUxDefinition, validateSequenceDefinition, validateComponentDependencyDefinition) KEEP their documented contract (an EMPTY array for a sound definition) and are not changed. A new pure function per kind, `completenessFindings(def)`, returns at most two LOW DimensionFindings: one when `narrative` is absent, one listing the elements missing a `description`. It is called ONLY from the code-review diagram/ux dimensions (diagram/handlers/er.ts, sequence.ts, component.ts and ux/index.ts), so the LOWs surface in the code-review record where authors see them; they are LOW so they never block. firstCompanionValidationFailure and finalize are unchanged (they never see these findings).

**Call sites:**
- `src/workflow/code-review/dimensions/diagram/handlers/er.ts`
- `src/workflow/code-review/dimensions/diagram/handlers/sequence.ts`
- `src/workflow/code-review/dimensions/diagram/handlers/component.ts`
- `src/workflow/code-review/dimensions/ux/index.ts`
- `src/workflow/artifacts/companion/er.ts`
- `src/workflow/artifacts/companion/ux.ts`
- `src/workflow/artifacts/companion/sequence.ts`
- `src/workflow/artifacts/companion/component.ts`

### 3.8 `generateErCompanions (dead seam)` — invariant-change

src/workflow/artifacts/companion/generate.ts calls renderErCompanion without a header, but generateErCompanions has no production caller (only __tests__/generate.test.ts); the finalize path in orchestrator.ts supersedes it. It is REMOVED with its test rather than given a header (CompanionGenCtx has no source doc to build one). assess.ts (the content gate) is kept.

**Call sites:**
- `src/workflow/artifacts/companion/generate.ts`
- `src/workflow/artifacts/companion/__tests__/generate.test.ts`

### 3.9 `Companion test suites (rewrite / trim inventory)` — invariant-change

Suites that call render*Companion without a header or import the removed IR lowerings / renderUxMockDocument, and how each is handled: REWRITTEN to the new shell (pass a fixture CompanionHeader, assert Header/Narrative/View/Description instead of the old narrative band / classDiagram): render.test.ts, diagram-render.test.ts, ux-render.test.ts, ux-integration.test.ts, ux-mock-render.test.ts, context-sections.test.ts. TRIMMED (keep validator + schema tests; replace the *DefinitionToIr cases with tests of the new per-kind page builders): er.test.ts, sequence.test.ts, component.test.ts, ux.test.ts. fixtures/er-parity.ts: kept as an ER definition fixture; its IR-parity expectations are removed with erDefinitionToIr. DELETED: generate.test.ts (with the dead generateErCompanions seam). src/workflow/__tests__/companion-context-finalize.test.ts is REWRITTEN: its old back-link assertion (`View the source document (LLD.md)` from the narrative band) becomes an assertion on the header's Source doc link (`./LLD.md`, labelled with the LLD id). The other finalize suites (companion-validation-gate, diagram-companion-finalize, er-companion-finalize) assert only refs/paths/validation and keep passing (grep for old page markup found none in them).

**Call sites:**
- `src/workflow/artifacts/companion/__tests__/render.test.ts`
- `src/workflow/artifacts/companion/__tests__/diagram-render.test.ts`
- `src/workflow/artifacts/companion/__tests__/ux-render.test.ts`
- `src/workflow/artifacts/companion/__tests__/ux-integration.test.ts`
- `src/workflow/artifacts/companion/__tests__/ux-mock-render.test.ts`
- `src/workflow/artifacts/companion/__tests__/context-sections.test.ts`
- `src/workflow/artifacts/companion/__tests__/er.test.ts`
- `src/workflow/artifacts/companion/__tests__/sequence.test.ts`
- `src/workflow/artifacts/companion/__tests__/component.test.ts`
- `src/workflow/artifacts/companion/__tests__/ux.test.ts`
- `src/workflow/artifacts/companion/__tests__/fixtures/er-parity.ts`
- `src/workflow/artifacts/companion/__tests__/generate.test.ts`
- `src/workflow/__tests__/companion-context-finalize.test.ts`

## 4. Error paths

**Error cases**

- **The vendored Mermaid bundle or the new pan/zoom script is missing from out/assets at render time.** (recoverable)
  - Detection: The shell's runtime loader catches the readFile ENOENT when loading the asset manifest or bundle.
  - Response: Throw DiagramGenerationError('fallback-unavailable', <asset + copy-assets remedy>); the existing finalize helpers already catch it and leave the definition in-body without a picture.
  - User impact: The artifact is written without that companion link; a warn log names the missing asset.
- **`git config user.name` fails (git missing, not a repo, or no user configured).** (recoverable)
  - Detection: execFile rejects or returns an empty/whitespace stdout.
  - Response: Fall back to os.userInfo().username; if that throws (no passwd entry in a container), use 'unknown'. Never throws out of the header resolver.
  - User impact: Header shows the OS login or 'unknown' instead of the git name.
- **`<repo>/.insrc/config.json` is unreadable or not valid JSON, or `projectName` is not a non-empty string.** (recoverable)
  - Detection: readFile/JSON.parse throws, or typeof check fails.
  - Response: Ignore the override and use basename(repoPath); log at debug.
  - User impact: Project name falls back to the folder name.
- **Mermaid fails to render the emitted source in the browser (e.g. an unexpected character in an entity or message label).** (recoverable)
  - Detection: The inline init script's mermaid.run promise rejects.
  - Response: The page shows a visible 'diagram render failed: <error>' line inside the view panel; the header, narrative and description tables still render because they are static HTML.
  - User impact: Reader still sees all tables and text; only the picture is missing.
- **Work-item identity cannot be minted (malformed createdAt, epicHash or storyId in meta).** (recoverable)
  - Detection: The minters behind deriveWorkItemIdentity throw (id.ts workflowId validation); the header resolver calls them through safeCanonical, which returns undefined.
  - Response: Use the plain storyId (LLD) or epicHash (HLD) as the Work item value; the header resolver never throws, so finalize (which rethrows anything but DiagramGenerationError) is never aborted by header resolution.
  - User impact: Header shows a shorter work-item id; the companion still renders.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A definition with no `narrative` and no element descriptions (every pre-existing definition). | Page renders with only the context line in Narrative and em dashes in every description cell; completenessFindings returns two LOW findings (surfaced by the code-review dimensions; the validators still return []); nothing is gated. |
| ER class with no attributes, or an entity with no identifier slot. | Entity box renders empty in the erDiagram; entities table shows Key as em dash; columns table for that entity shows a single 'no columns' row. |
| ER self-relationship (e.g. DeliveryItem.parentId -> DeliveryItem) and multivalued class-ranged slots. | erDiagram draws a self-loop labelled with the slot name; cardinality uses \|\|--o{ for multivalued, \|\|--\|\| for required single, \|\|--o\| for optional single. |
| Entity, slot, participant or label text containing quotes, angle brackets, colons, or non-ASCII. | Mermaid source is sanitised per diagram type (identifiers aliased, labels quoted/escaped); HTML tables escape &, <, >, " so no markup is injected. |
| Sequence definition with recurse messages and truncations. | Recursion keeps its 'recursion' note, truncations keep their Note over <participant>; messages table lists kind 'recurse' rows. |
| A UX card with nested Containers/ColumnSets and actions. | Numbered markers go on key elements (inputs, actions, top-level text blocks, containers with a description); layout-only Columns are unnumbered and omitted from the table; numbering is depth-first and stable for the same definition. |
| A document carrying several definitions (ER + UX + sequence). | Each companion page gets the same header values (one resolved CompanionHeader per finalize site) and differs only in title, kind badge, visual and description. |

**Invariants to preserve**

- The docgen tool's output is unchanged: assembleShell, buildHtml, renderNarrativeBand and assembleFallbackShell keep their behaviour and tests (generateDocument in src/docgen/index.ts still calls assembleShell). [[c1]]
- Companions are never inlined into the core markdown; render*Companion still returns the same CompanionArtifactRef kinds and relPath semantics. [[c2]]
- Finalize gates only on HIGH companion-validation findings (firstCompanionValidationFailure) before any render/write; LOW findings never block, and a DiagramGenerationError leaves the definition in-body without a picture. [[c4]]
- The companion HTML is self-contained and offline: no CDN or external URL; runtimes are inlined from local assets. [[c1]]
- Definition JSON stays the source of truth: the page is derived from the definition, and validation never reads the rendered page. [[c3]]

## 5. Test strategy

**Test framework:** `node:test via tsx (npx tsx --test), assert/strict — matching src/workflow/artifacts/companion/__tests__ and src/workflow/__tests__`

**Test levels**

- **unit** — Pure page-content builders and the shell: structure, escaping, em-dash cells, Mermaid source per type, marker numbering.
  - Subjects: `companion shell renderCompanionPage (header table, narrative, view panel, description blocks, inlined runtimes, no external URL)`, `ER page builder: erDiagram source (typed columns, PK, labelled relationships with ||--o{ / ||--|| / ||--o| cardinality, self-loop) + entities/columns tables`, `sequence page builder: autonumber, real labels, dashed returns, recursion/truncation notes + participants/messages tables`, `component page builder: flowchart + components table`, `UX page builder: card HTML with depth-first stable markers + key-elements table`, `header resolver: projectName override vs basename, git user vs OS fallback vs 'unknown', injected clock formatting, workItemId/sourceDoc derivation`, `validators: a definition of each kind CARRYING narrative + descriptions (ER classes/slots, UX elements/actions, sequence participants/messages, components) returns no HIGH from validateErDefinition / validateUxDefinition / validateSequenceDefinition / validateComponentDependencyDefinition (proves the vendored LinkML and Adaptive Cards schemas were extended)`, `completenessFindings: absent narrative -> one LOW; missing descriptions -> one LOW naming them; fully described -> []`, `header contextLine: HLD summary for HLD sources, DEF Story statement for epic-Story LLDs, boundary.internal story title + LLD summary for standalone LLDs, placement-only fallback`, `header resolver: malformed createdAt / epicHash / storyId -> Work item falls back to storyId / epicHash and nothing throws`, `validators unchanged: a sound definition WITHOUT narrative/descriptions still returns [] from every validate*Definition (empty-when-sound contract kept)`, `shell view panel: for every page kind (er, ux, sequence, component) the output contains the toolbar controls (zoom out, zoom %, zoom in, Fit, 1:1), the inlined pan/zoom runtime, its init hook wiring drag-pan / wheel-zoom / double-click zoom, and a fit-on-load call (after mermaid.run for diagrams, immediately for UX)`
  - Fixtures: `the Delivery read-model ER, Delivery-board sequence and S002 UX card used by the approved mocks`, `a temp repo dir with/without .insrc/config.json`, `stubbed git/os lookups`
- **integration** — Finalize paths write the new page with a resolved header at all three sites; docgen tool unchanged.
  - Subjects: `standalone LLD finalize writes er-model.html / ux-mock.html / sequence-diagram.html / component-dependency.html containing the header table with the LLD id and work-item id`, `design.epic HLD finalize uses the HLD id as source doc`, `missing runtime asset → DiagramGenerationError swallowed, artifact still written without that companion ref`, `src/docgen/render/__tests__/shell.test.ts and the docgen pipeline tests pass unchanged`, `finalize[standalone-LLD]: a body whose definitions carry narrative + descriptions passes the HIGH gate and renders the four companions with those descriptions in the tables`, `code-review diagram/ux dimensions: completeness LOWs appear in the record for an undescribed definition and never change the verdict to block`
  - Fixtures: `existing finalize harnesses in src/workflow/__tests__/companion-validation-gate.test.ts and diagram-companion-finalize.test.ts`
- **smoke** — Rendered pages actually draw in a browser.
  - Subjects: `headless Chrome renders each generated page: Mermaid diagram present, fit-on-load applied, no console error (manual/optional, gated like other live checks)`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `shell: every page has Header (project, work item, source doc link, date, user), Narrative, View, Description in that order`, `finalize[standalone-LLD]: all four companions carry the same header values`, `header contextLine follows the SPEC per source kind (HLD summary / DEF Story statement / standalone story title + LLD summary)` |
| `ac2` | `shell: one pan/zoom runtime inlined for mermaid AND html visuals; UX page inlines no Mermaid; no http(s) URL in output`, `shell view panel: toolbar controls + pan/zoom init hook + fit-on-load present for all four page kinds` |
| `ac3` | `er builder: erDiagram (not classDiagram), PK markers, labelled relationship lines with cardinality`, `er builder: entities table + per-entity columns table with descriptions / em dash` |
| `ac4` | `sequence builder: autonumber, message labels, dashed returns, notes preserved; participants + messages tables` |
| `ac5` | `validators: definitions carrying narrative + descriptions get no HIGH (all four kinds, incl. vendored-schema extensions)`, `completenessFindings: missing narrative -> one LOW; missing descriptions -> one LOW naming them; firstCompanionValidationFailure unaffected`, `code-review dimensions surface the completeness LOWs without blocking`, `shell: missing narrative renders only the context line` |
| `ac6` | `header: projectName override, basename fallback, git user, OS fallback, 'unknown', injected date format` |
| `ac7` | `docgen shell.test.ts unchanged and passing; generateDocument still uses assembleShell` |

## 6. Migration

**State before:** Per s1 (c1, c2): the ER, sequence and component companions render via docgen assembleShell into a Mermaid page (ER as a classDiagram with inheritance arrows, sequence arrows labelled 'call') with an LLM narrative band and a back-link; the UX companion renders via renderUxMockDocument as a static card page without pan/zoom. Definitions carry no description/narrative fields. About 20 companion HTML files in the old format are committed under docs/.

**State after:** All four companions render through the companion-owned shell: header (project, work item, source doc, date, user), narrative (context line + optional per-visual narrative), one pan/zoom view panel, per-type description tables. Definitions accept optional description/narrative fields; their absence yields LOW findings. The docgen tool is unchanged. Existing committed companions stay in the old format until their artifact is re-finalized.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add optional description/narrative (and component path) fields to the four definition TS types, their *_PROPERTY_SCHEMA objects, AND the vendored closed schemas they are validated against (linkml-metamodel.schema.json, adaptive-cards.schema.json); existing stored definitions remain valid because every new field is optional. — ↩ rollbackable
2. Add the pan/zoom runtime asset under src/assets and include it in the copy-assets step so out/assets ships it next to the existing docgen Mermaid bundle. — ↩ rollbackable
3. Introduce the companion header resolver, page-content builders and the companion shell alongside the existing render path. — ↩ rollbackable
4. Switch the four render*Companion functions and the three orchestrator finalize sites to resolve a header and render through the new shell; stop calling docgen assembleShell from companion code. — ↩ rollbackable
5. Add per-kind completenessFindings (LOW only) and call them from the code-review diagram/ux dimensions; leave the validators' empty-when-sound contract unchanged; update the synthesizer content-gate rules to ask for descriptions and a narrative. — ↩ rollbackable
6. Remove the now-unused companion IR lowering functions (erDefinitionToIr, sequenceDefinitionToIr, componentDependencyDefinitionToIr, uxDefinitionToIr), the old renderUxMockDocument page wrapper, and the dead generateErCompanions seam (generate.ts + generate.test.ts), after confirming no remaining importers. Rewrite/trim/delete the companion __tests__ suites per the 'Companion test suites' inventory in the same change. — ↩ rollbackable

**Backward compat:** Internal surface only. The render*Companion functions keep their names, return type and CompanionArtifactRef shape; their opts gain a required `header` (all production callers are the three orchestrator finalize sites; the only other caller, the dead generateErCompanions seam, is removed, updated in the same change) and `sourceLink` is superseded by header.sourceDoc. Stored artifact JSON needs no rewrite: the new definition fields are optional. The VS Code review pane reads the projected definitions and only links companion files, so it is unaffected. The docgen tool keeps assembleShell unchanged.

## 7. Alternatives considered

### 7.1 a1: Companion shell + typed plug-in contract (off docgen) — **CHOSEN**

A new companion-owned page shell takes a CompanionHeader + a CompanionPlugin output {visual, descriptionHtml, narrative}; each definition module exports its plug-in; docgen's assembleShell is no longer used by companions.

New module src/workflow/artifacts/companion/shell.ts exports renderCompanionPage(header: CompanionHeader, page: CompanionPageContent, runtime): string, where CompanionPageContent = { kindLabel, title, contextLine, narrative?, visual: {kind:'mermaid', source} | {kind:'html', html}, description: DescriptionBlock[] } and DescriptionBlock = {heading?, lead?, table: {columns, rows}} (cells are escaped text or a small tagged-token union, never raw HTML from the definition). Each of er.ts / ux.ts / sequence.ts / component.ts adds a pure toCompanionPage(def) returning CompanionPageContent (ER emits erDiagram Mermaid; sequence emits labelled autonumbered sequenceDiagram; component a flowchart; UX the existing card HTML plus numbered markers). A new header.ts resolves CompanionHeader {projectName, workItemId, sourceDoc{id, href}, date, user} with injectable clock + git/os lookups. render.ts's four functions keep their signatures but gain a required header option and call renderCompanionPage. A vendored transform-based pan/zoom script (src/assets/artifacts/companion/panzoom.js) is inlined for every page; mermaid stays inlined from src/assets/docgen. Definition types + *_PROPERTY_SCHEMA gain optional description/narrative; missing narrative/descriptions yield LOW findings (refined in §3.7: via completenessFindings, validators unchanged).

### 7.2 a2: Extend docgen assembleShell with a companion mode

Add header/description/panel options to docgen's DocumentIR + buildHtml so companions and the docgen tool share one shell.

Widen NarratedContent with optional header + descriptionBlocks, teach buildHtml/assembleFallbackShell to render them when present, swap svg-pan-zoom for the transform runtime in both, add erDiagram emission to documentIRToMermaid, and lower UX into an html-visual IR variant. Companions keep calling assembleShell.

**Rejected because:** Violates docgen no-regression and blurs the DocumentIR provenance partition, at L cost.

### 7.3 a3: String template file + slot substitution

Ship companion.html as an asset with @@SLOT@@ placeholders (like src/assets/artifacts/templates) and fill them from each definition.

A bundled template with @@PROJECT@@, @@HEADER_TABLE@@, @@NARRATIVE@@, @@VISUAL@@, @@DESCRIPTION@@, @@RUNTIME@@ slots, loaded via a template loader with repo/user override layers; each definition module produces pre-rendered HTML fragments for its slots.

**Rejected because:** Workable but weaker on escaping discipline and adds override machinery the spec did not ask for.

## 8. References

- **[[c1]]** `step-output` `s1`
- **[[c2]]** `step-output` `s4`
- **[[c3]]** `prior-artifact` `SPEC-77932eaa1a85819b`
- **[[c4]]** `code` `src/workflow/orchestrator.ts`
- **[[c5]]** `code` `src/workflow/artifacts/companion/render.ts`
- **[[c6]]** `code` `src/docgen/index.ts`
- **[[c7]]** `doc` `docs/plans/companion-template-mocks/er-model.html`

## 9. Open questions

- ts1 (partial): the standalone Story has no Epic acceptance criteria; ac1-ac7 are LLD-local, derived from SPEC-77932eaa1a85819b.

## Resolved questions

- `q57b32444` — ts1 (partial): the standalone Story has no Epic acceptance criteria; ac1-ac7 are LLD-local, derived from SPEC-77932eaa1a85819b.
  - **resolved**: Trace each ac back to a SPEC clause — Standalone Story: the approved SPEC is the source of truth; citing the SPEC clause per ac closes the trace without adding a Define stage. _(2026-10-11T11:20:43.456Z)_

## Citations

- **[[c1]]** `step-output` `s1`
- **[[c2]]** `step-output` `s4`
- **[[c3]]** `prior-artifact` `SPEC-77932eaa1a85819b`
- **[[c4]]** `code` `src/workflow/orchestrator.ts`
- **[[c5]]** `code` `src/workflow/artifacts/companion/render.ts`
- **[[c6]]** `code` `src/docgen/index.ts`
- **[[c7]]** `doc` `docs/plans/companion-template-mocks/er-model.html`
