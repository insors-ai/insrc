<!-- insrc:artifact LLD-97e289e28841db07-S001 -->

# LLD: E2026093097e289e2:S001

## Summary

**Epic:** `enrich-docgen-generated-companion-html-artifacts`
**HLD base run:** `wf-1790758777201-f7hi9w`
**HLD effective hash:** `97e289e28841...`

Make every generated companion HTML (ER, UX mock, sequence, component-dependency) self-explanatory without opening the source markdown. Reuse the docgen shell's existing narrative-section band: each definition->IR mapper now emits a reader-facing 'Purpose' section, per-element schema/field explanations, and a legend into narrated.sections (previously empty), so the primary shell renders them for free. Add ONE additive optional field, narrated.sourceLink {label, href}, rendered as an escaped <a> in both the primary and the oversized-fallback shells (closing the fallback's parity gap), and thread the sibling artifact .md link (./HLD.md / ./LLD.md) from the finalize wiring. A plain docgen document with empty sections and no sourceLink renders byte-identically to today.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)

## 1. HLD context

**Framework:** undefined
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal

### 2.1 `erDefinitionToIr`

```typescript
(erDef: ErDefinition) => DocumentIR
```

**Parameters:**
- `erDef: ErDefinition` — The authored ER model; the mapper already parses its classes/attributes/ranges to build the diagram nodes/edges and now ALSO derives the context sections from the same parse.

**Returns:** `DocumentIR` — Unchanged type. NEW: narrated.sections is now populated (previously []) with a 'Purpose' section + a per-class field-explanation section (each attribute: name, range, required/identifier, and crow's-foot relationship meaning) + a 'Legend' section. derived nodes/edges + scopeDescription unchanged. The 3 sibling mappers (uxDefinitionToIr, sequenceDefinitionToIr, componentDependencyDefinitionToIr) mirror this per-kind.

**Errors:**
- `ErDefinitionError` when Unchanged — a dangling relationship range still throws; the section build reuses the already-validated parse.

**Preconditions:**
- The definition has already passed its validator (finalize gate).

**Postconditions:**
- narrated.sections is non-empty for a well-formed definition; the derived diagram content is unchanged.
- The stored/in-body definition is not mutated (read-only derivation).

### 2.2 `buildHtml`

```typescript
(title: string, mermaidSource: string, mermaid: string, svgPanZoom: string, sections: readonly IrSection[], sourceLink?: { readonly label: string; readonly href: string }) => string
```

**Parameters:**
- `sections: readonly IrSection[]` — The context/narrative sections rendered in the existing band (now populated for companions).
- `sourceLink: { readonly label: string; readonly href: string } | undefined` _(optional)_ — NEW optional back-reference to the source artifact markdown; rendered as an escaped <a href> in the context band. Absent -> no link element.

**Returns:** `string` — Self-contained offline HTML. NEW: when sourceLink is present an escaped <a> is rendered in the context band (renderNarrative extended). When sections is empty AND sourceLink absent, output is byte-identical to today.

**Errors:**
- `(none)` when Pure string assembly; href + label are escapeHtml'd so no injection/remote URL is introduced.

**Preconditions:**
- Called by assembleShell with the IR-derived sections + ir.narrated.sourceLink.

**Postconditions:**
- No external URL anywhere in the output.
- Byte-identity holds for the empty-sections + no-sourceLink case.

### 2.3 `assembleShell`

```typescript
(ir: DocumentIR, renderer?: SubprocessRenderer) => Promise<DocGenOutcome<RenderedDocumentShell>>
```

**Parameters:**
- `ir: DocumentIR` — assembleShell now forwards ir.narrated.sourceLink to buildHtml (primary) and to assembleFallbackShell (oversized).

**Returns:** `Promise<DocGenOutcome<RenderedDocumentShell>>` — Unchanged shape. Primary path forwards sourceLink to buildHtml; oversized path forwards it to assembleFallbackShell for parity.

**Errors:**
- `fallback-unavailable` when Unchanged — missing runtime asset or oversized diagram with no subprocess renderer.

**Preconditions:**
- The offline runtime assets are shipped (unchanged).

**Postconditions:**
- Both primary and oversized-fallback outputs carry the same context band + optional source link (parity).

### 2.4 `assembleFallbackShell`

```typescript
(ir: DocumentIR, svg: string, svgPanZoom: string, svgPanZoomVersion: string) => RenderedDocumentShell
```

**Parameters:**
- `ir: DocumentIR` — Provides narrated.sections + narrated.sourceLink so the oversized-path HTML carries the SAME context band + link as the primary shell.

**Returns:** `RenderedDocumentShell` — Oversized-subprocess HTML. NEW: renders the same narrative sections + escaped source-link region as buildHtml (was svg-only). Byte-identical to today when sections empty and sourceLink absent.

**Errors:**
- `(none)` when Pure string assembly; inline styles + escaped content preserve the offline invariant.

**Preconditions:**
- Reached only on the oversized dispatch (unchanged).

**Postconditions:**
- An oversized companion carries the context + source link, matching the primary shell.

### 2.5 `renderErCompanion`

```typescript
(erDef: ErDefinition, title: string, destPath: string, opts?: RenderErCompanionOpts) => Promise<CompanionArtifactRef>
```

**Parameters:**
- `opts: RenderErCompanionOpts` _(optional)_ — Gains a NEW optional sourceLink?: { label, href }; when present the renderer sets it onto ir.narrated.sourceLink before assembleShell. repoPath/ofSectionId unchanged.

**Returns:** `Promise<CompanionArtifactRef>` — Unchanged shape {kind, relPath, title, ofSectionId?}. Written HTML now carries context sections + optional source link. The 3 sibling renderers gain the same opt.

**Errors:**
- `DiagramGenerationError` when Unchanged — a non-ok DocGenOutcome still throws + writes nothing.

**Preconditions:**
- The definition has passed its validator.

**Postconditions:**
- The sibling HTML is written with the context band; nothing is inlined into the .md.

### 2.6 `renderErCompanionForBody`

```typescript
(body, destPath: string, repoPath: string) => Promise<CompanionArtifactRef | undefined>
```

**Parameters:**
- `destPath: string` — The companion HTML path (sibling of the artifact .md). The finalizer derives the source-doc link from the .md path already computed (./HLD.md / ./LLD.md) and passes it as the sourceLink opt.

**Returns:** `Promise<CompanionArtifactRef | undefined>` — Unchanged. NEW: passes { repoPath, sourceLink: { label, href: <relative sibling .md> } } to renderErCompanion. renderUxCompanionForBody / renderDiagramCompanionsForBody mirror this.

**Errors:**
- `(none surfaced)` when A DiagramGenerationError stays swallowed as today (infra failure).

**Preconditions:**
- The finalizer has the artifact .md path (hldMd/lldMd) in scope.

**Postconditions:**
- Every rendered companion carries a working relative link back to its source .md.

## 3. Data model changes

### 3.1 `DocumentIR.narrated` — field-add

Add an additive optional readonly sourceLink?: { readonly label: string; readonly href: string } to NarratedContent. Rendered as an escaped <a> in buildHtml + assembleFallbackShell; absent -> no link (byte-identical). Additionally the four companion toIr mappers now POPULATE narrated.sections (purpose + field-explanations + legend) instead of leaving it []. No field removed or renamed; a plain docgen document that sets neither is unchanged.

```
interface NarratedContent { readonly sections: readonly IrSection[]; readonly sourceLink?: { readonly label: string; readonly href: string } | undefined; }
```

**Call sites:**
- `src/docgen/types.ts:76`
- `src/docgen/render/shell.ts:204`
- `src/docgen/render/shell.ts:189`
- `src/docgen/render/fallback.ts:200`
- `src/workflow/artifacts/companion/render.ts:65`

### 3.2 `companion DocumentIR narrated.sections (per-kind population)` — invariant-change

Previously every companion toIr returned narrated:{sections:[]} (diagram-only HTML). Now each mapper populates narrated.sections with a 'Purpose' + per-element field-explanation + 'Legend' section, derived read-only from the same definition parse that builds the diagram. Changes rendered companion HTML but not the derived diagram nodes/edges; a docgen document that still emits empty sections is unaffected. renderNarrative escape/offline invariants preserved.

**Call sites:**
- `src/workflow/artifacts/companion/er.ts`
- `src/workflow/artifacts/companion/render.ts:71`
- `src/docgen/render/shell.ts:189`

## 4. Error paths

**Error cases**

- **assembleShell returns a non-ok DocGenOutcome for a valid companion definition (oversized diagram with no subprocess renderer, or missing inlined runtime asset).** (recoverable)
  - Detection: renderErCompanion (and siblings) branch on outcome.ok===false after awaiting assembleShell; the enriched IR does not change this check.
  - Response: Throw DiagramGenerationError and write no file. Context sections are built in-IR before assembleShell so they never partially write.
  - User impact: Companion HTML not produced; finalize swallows the DiagramGenerationError with a warn (unchanged) and the .md is still written without that companion link.
- **A companion definition is malformed (HIGH-severity validator finding).** (recoverable)
  - Detection: The pre-render gate firstCompanionValidationFailure(body) runs the 4 validators and short-circuits the finalizer BEFORE any toIr/enrichment runs.
  - Response: finalize returns {ok:false, failure}; the synth turn is retried; enrichment never reached for an invalid definition.
  - User impact: The author is asked to fix the definition (retry loop); no half-enriched HTML is emitted.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A structurally-valid but empty definition (0 classes/elements/messages/nodes). | toIr still emits Purpose + Legend; the per-element field-explanation section is omitted/empty (no throw); the diagram is empty as today. |
| A caller other than the finalizer (plain docgen doc, or a companion without the new opt) supplies no sourceLink. | ir.narrated.sourceLink undefined; buildHtml + assembleFallbackShell render no <a>; the band still renders from sections; byte-identical when sections also empty. |
| A field/element name or description with HTML-special chars (Map<K,V>, a & b). | renderNarrative escapeHtml's every section's text and the sourceLink label/href are escaped, so characters render literally with no markup injection. |
| A definition with a very large field/element count. | All rows render in the band; the page scrolls natively; no truncation, no new scroll region. |

**Invariants to preserve**

- A plain docgen document with empty narrated.sections AND no narrated.sourceLink renders byte-identically to today (renderNarrative returns ''); existing docgen callers/tests do not churn. [[c1]]
- The generated HTML stays fully offline/self-contained: no remote URL; all context text escapeHtml'd; sourceLink.href is a relative path (sibling .md), escaped when rendered as an <a>. [[c2]]
- Context-section derivation is read-only: the authored definition in the artifact body is not mutated by the toIr mappers. [[c3]]
- Primary/fallback parity: assembleFallbackShell renders the same context band + optional source link as buildHtml. [[c4]]

## 5. Test strategy

**Test framework:** `node:test via `tsx --test` with node:assert/strict`

**Test levels**

- **unit** — Each companion toIr populates narrated.sections (Purpose + field-explanation + Legend), read-only.
  - Subjects: `erDefinitionToIr sections`, `uxDefinitionToIr sections`, `sequenceDefinitionToIr sections`, `componentDependencyDefinitionToIr sections`, `empty-but-valid def -> Purpose+Legend, field section omitted`, `read-only: input definition not mutated`
- **unit** — Shell renders escaped source-link region; fallback parity; byte-identity for no-context case.
  - Subjects: `buildHtml renders escaped <a> when sourceLink present`, `buildHtml empty-sections+no-sourceLink byte-identical golden`, `assembleFallbackShell parity + empty-case byte-identical golden`, `HTML-special chars escape with no injection`
- **unit** — renderXCompanion threads the optional sourceLink; existing throw/no-file unchanged.
  - Subjects: `renderErCompanion with opts.sourceLink writes escaped link (+ 3 siblings)`, `renderErCompanion without sourceLink still writes HTML (backward-safe)`, `non-ok DocGenOutcome still throws DiagramGenerationError + no file`
- **integration** — Through finalize wiring, rendered companion HTML carries purpose + relative sibling-.md link + legend and stays offline.
  - Subjects: `renderErCompanionForBody/renderUxCompanionForBody/renderDiagramCompanionsForBody via finalizeArtifact: Purpose text + relative ./HLD.md (design.epic) / ./LLD.md (design.story + standalone-LLD) link + Legend present`, `no remote URL; nothing inlined into the .md`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `erDefinitionToIr emits Purpose section (unit)`, `3 sibling toIr emit Purpose section (unit)`, `finalize integration: HTML contains Purpose text (integration)` |
| `ac2` | `buildHtml renders escaped <a> when sourceLink present (unit)`, `renderErCompanion threads opts.sourceLink (unit)`, `finalize integration: relative link to sibling ./HLD.md / ./LLD.md (integration)` |
| `ac3` | `erDefinitionToIr emits per-class attribute-explanation + crow's-foot Legend (unit)`, `each sibling toIr emits per-kind field-explanation + legend (unit)`, `empty-but-valid def still emits Purpose + Legend (unit)`, `finalize integration: HTML contains Legend + field explanations (integration)` |
| `ac4` | `buildHtml empty-sections+no-sourceLink byte-identity golden (unit)`, `assembleFallbackShell parity + empty-case byte-identity golden (unit)`, `renderErCompanion without sourceLink still writes + non-ok still throws (unit)`, `HTML-special chars escape with no injection (unit)`, `read-only: toIr does not mutate input def (unit)` |

## 6. Migration

**State before:** Companion HTML is diagram-only: toIr mappers return narrated:{sections:[]}; DocumentIR.narrated has no back-reference field; assembleFallbackShell renders only the svg. Grounded in s1 (shell.ts:189/204, render.ts:65, fallback.ts:200, er.ts).

**State after:** toIr populates narrated.sections (Purpose+field+Legend); DocumentIR.narrated carries additive-optional sourceLink; buildHtml + assembleFallbackShell render it + the band (parity); renderXCompanion opts + finalize helpers thread the sibling-.md link. Plain docgen documents byte-identical.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add additive optional sourceLink {label, href} to NarratedContent on DocumentIR (types.ts). — ↩ rollbackable
2. Extend renderNarrative + buildHtml to render the optional sourceLink as an escaped <a>, preserving empty-case byte-identity. — ↩ rollbackable
3. Bring assembleFallbackShell to parity (render band + escaped link), guarded for empty-case byte-identity. — ↩ rollbackable
4. Populate narrated.sections in the four companion toIr mappers (Purpose + field-explanation + Legend), read-only. — ↩ rollbackable
5. Add optional sourceLink to the four renderXCompanion opts; set onto ir.narrated.sourceLink before assembleShell. — ↩ rollbackable
6. Thread the sibling-.md relative link from the orchestrator finalize helpers using the .md path already in scope. — ↩ rollbackable
7. Extend unit + finalize-integration tests (byte-identity, link rendering, per-kind sections, finalize assertions). — ↩ rollbackable

**Backward compat:** buildHtml/assembleFallbackShell are internal render functions; buildHtml gains an appended optional param and the renderXCompanion opts gain an optional field — every existing caller that omits them compiles and behaves as before. DocumentIR.narrated.sourceLink is additive-optional. Only observable change is richer companion HTML; a plain docgen document renders byte-identically and already-generated files are unaffected (regenerated on next finalize).

## 7. Alternatives considered

### 7.1 a1: undefined — **CHOSEN**





### 7.2 a2: undefined





### 7.3 a3: undefined





## 8. References

- **[[c1]]** `code` `src/docgen/render/shell.ts:189`
- **[[c2]]** `code` `src/docgen/render/shell.ts:204`
- **[[c3]]** `code` `src/workflow/artifacts/companion/er.ts`
- **[[c4]]** `code` `src/docgen/render/fallback.ts:200`
- **[[c5]]** `code` `src/workflow/artifacts/companion/render.ts:65`
- **[[c6]]** `code` `src/workflow/orchestrator.ts:1568`
- **[[c7]]** `code` `src/docgen/types.ts:76`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 12 LOW** · model `client` · reviewed 2026-09-30T09:13:28.037Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| p1 | citation | LOW | auto | buildHtml is defined in src/docgen/render/shell.ts around line 204 and assembles the offline HTML. | grep + read confirm `function buildHtml(` at src/docgen/render/shell.ts:204; call site at :293 passes ir.narrated.sections (no sourceLink yet), consistent with the current state. | Confirmed — no change. |
| p2 | citation | LOW | auto | renderNarrative is defined in src/docgen/render/shell.ts around line 189 and renders ir.narrated.sections as a self-contained band, escaping narrativeText. | read confirms `function renderNarrative(sections: readonly IrSection[]): string` at src/docgen/render/shell.ts:189. | Confirmed — no change. |
| p3 | citation | LOW | auto | assembleShell is defined in src/docgen/render/shell.ts (around line 266) and returns a DocGenOutcome<RenderedDocumentShell>. | read confirms `export async function assembleShell(` at src/docgen/render/shell.ts:266. | Confirmed — no change. |
| p4 | citation | LOW | auto | assembleFallbackShell is defined in src/docgen/render/fallback.ts around line 200 and today renders only the svg (no narrative band). | grep + read confirm `export function assembleFallbackShell(` at src/docgen/render/fallback.ts:200. | Confirmed — no change. |
| p5 | citation | LOW | auto | The four companion renderers renderErCompanion/renderUxCompanion/renderSequenceCompanion/renderComponentCompanion live in src/workflow/artifacts/companion/render.ts (renderErCompanion around line 65). | read confirms `export async function renderErCompanion(` at src/workflow/artifacts/companion/render.ts:65; the sibling renderers exist in the same module. | Confirmed — no change. |
| p6 | citation | LOW | auto | renderErCompanionForBody is defined in src/workflow/orchestrator.ts around line 1512 and computes the companion destPath as a sibling of the artifact .md. | renderErCompanionForBody resolves but at src/workflow/orchestrator.ts:1568, not :1512 (line 1512 now lands on firstCompanionValidationFailure). The three ...ForBody finalize call sites are :1791 (design.epic), :2147 (design.story), :2303 (standalone-LLD). Symbol is correct; the reference line drifted. | Update reference c6 line from 1512 to 1568; the design is unaffected. |
| p7 | citation | LOW | auto | DocumentIR (with a narrated field) is declared in src/docgen/types.ts around line 76. | read confirms `export interface DocumentIR {` at src/docgen/types.ts:76. | Confirmed — no change. |
| p8 | citation | LOW | auto | erDefinitionToIr is defined in src/workflow/artifacts/companion/er.ts and returns a DocumentIR with narrated.sections currently set to []. | grep confirms `export function erDefinitionToIr(erDef: ErDefinition): DocumentIR` at src/workflow/artifacts/companion/er.ts:214 (prior epic HLD sc3/c3 also confirmed it returns sections:[]). | Confirmed — no change. |
| p9 | inventory | LOW | auto | There are exactly four companion definition->IR mappers, one per companion kind: erDefinitionToIr, uxDefinitionToIr, sequenceDefinitionToIr, componentDependencyDefinitionToIr. | grep confirms exactly the four mappers: erDefinitionToIr (er.ts:214), uxDefinitionToIr (ux.ts:215), sequenceDefinitionToIr (sequence.ts:186), componentDependencyDefinitionToIr (component.ts:155). | Confirmed — no change. |
| p10 | semantic | LOW | auto | The narrated content on DocumentIR currently exposes a sections array of IrSection and has no sourceLink/back-reference field (the LLD adds sourceLink additively). | read confirms DocumentIR at types.ts:76; grep for `sourceLink` across src/docgen and src/workflow/artifacts/companion returns no matches, so the field is genuinely additive. | Confirmed — no change. |
| p11 | semantic | LOW | auto | renderErCompanion (and siblings) branch on a non-ok DocGenOutcome (outcome.ok === false) and throw DiagramGenerationError, writing no file. | DiagramGenerationError is the non-ok-outcome throw in render.ts (per prior epic S003 CR); the toIr dangling-ref throws are the per-module *DefinitionError types, which the LLD's api section names correctly (ErDefinitionError for erDefinitionToIr). No contradiction. | Confirmed — no change. |
| p12 | semantic | LOW | auto | firstCompanionValidationFailure is an exported pre-render gate in src/workflow/orchestrator.ts that runs the companion validators before render. | grep confirms `export function firstCompanionValidationFailure(body: {` at src/workflow/orchestrator.ts:1516, invoked at the three finalize sites (:1789, :2145, :2301). | Confirmed — no change. |

#### Proposed fixes

- **p6** (auto) — Point the c6 citation at the actual renderErCompanionForBody declaration.
  - edit: ``code` `src/workflow/orchestrator.ts:1512`` → ``code` `src/workflow/orchestrator.ts:1568``
