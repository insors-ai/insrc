<!-- insrc:artifact LLD-e2c6705fd105d4ac-s3 -->

# LLD: E20260929e2c6705f:S003

## Summary

**Epic:** `complete-generated-artifact-companion-wiring-across`
**HLD base run:** `wf-1790696212238-iuz6vo`
**HLD effective hash:** `35f2a2c76e97...`

This Story adds two new content-gated companion families — a sequence diagram and a component-dependency diagram — to the design-document companion subsystem, exactly mirroring the existing ER (data-model) and UX companions. Each family is a parallel triple: a JSON schema + content-gate rule the synthesizer sees, a definition type with a deterministic toIr mapping, and a renderer that produces an offline HTML companion via the already-shipped assembleShell/documentIRToMermaid spine (which already draws a mermaid sequenceDiagram from a 'call-sequence' DocumentIR and a flowchart from a 'component-dependency' DocumentIR). A finalize peer, renderDiagramCompanionsForBody, mirrors renderErCompanionForBody: content-gated and non-throwing, it renders and links a companion only when the body carries that definition, leaving a diagram-less document byte-identical to today. No new diagram engine is invented — only IR authorship, two schemas, two gate rules, and one finalize call. Every touch is additive.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Interaction with shared contracts](#4-interaction-with-shared-contracts)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Migration](#7-migration)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)
10. [Open questions](#10-open-questions)

## 1. HLD context

> See **HLD-e2c6705fd105d4ac** § 2. Framework summary

**Rollout phase:** Phase B — sequence + component diagram companions (net-new)
**Owns:** `sc3` (Sequence + component-dependency diagram companion families)
**Consumes:** `sc3` (Sequence + component-dependency diagram companion families)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: S1 owns the UX/ER content-gate injection into the three synth-prompt builders + one source-scan test; it introduces no new companion type, schema, renderer, or review dimension. — owns `sc1`
- `s2`: S2 owns the BUILD-record-on-completion path; it reuses persistBuildRecord + collectBuildChangeLog and does not modify the validate-phase invocation. — owns `sc2`

## 2. Contract details

**Surface level:** internal

### 2.1 `sequenceDefinitionToIr`

```typescript
export function sequenceDefinitionToIr(def: SequenceDefinition): DocumentIR
```

**Parameters:**
- `def: SequenceDefinition` — The authored sequence definition (ordered participants + directed messages, optionally recursion/truncation markers) captured in the design-document body under the content gate.

**Returns:** `DocumentIR` — An in-memory DocumentIR with docType 'call-sequence', derived.nodes of kind 'call-frame' (one per participant) plus any 'truncation' nodes, and derived.edges (one per message, with the ':repeat' id suffix for a recursion note) — the exact shape documentIRToMermaid.toSequenceDiagram consumes.

**Errors:**
- `DiagramGenerationError` when The definition references a message endpoint (from/to) that is not a declared participant — a dangling reference, thrown deterministically before render (mirrors erDefinitionToIr's dangling-ref throw).

**Preconditions:**
- def has been validated (validateSequenceDefinition returned no HIGH finding) OR the caller tolerates a throw for a structurally invalid def.

**Postconditions:**
- The returned DocumentIR is deterministic — byte-identical for a byte-identical def.

### 2.2 `componentDependencyDefinitionToIr`

```typescript
export function componentDependencyDefinitionToIr(def: ComponentDependencyDefinition): DocumentIR
```

**Parameters:**
- `def: ComponentDependencyDefinition` — The authored component-dependency definition (named component nodes + directed dependency edges) captured in the design-document body under the content gate.

**Returns:** `DocumentIR` — An in-memory DocumentIR with docType 'component-dependency', derived.nodes (one box per component) and derived.edges (one 'A --> B' per dependency) — the exact shape documentIRToMermaid.toFlowchart consumes (flowchart LR).

**Errors:**
- `DiagramGenerationError` when A dependency edge references a component id not present in the node set — a dangling reference, thrown deterministically before render.

**Preconditions:**
- def has been validated OR the caller tolerates a throw for a structurally invalid def.

**Postconditions:**
- The returned DocumentIR is deterministic for a byte-identical def.

### 2.3 `renderSequenceCompanion`

```typescript
export function renderSequenceCompanion(def: SequenceDefinition, title: string, destPath: string, opts: { readonly repoPath: string; readonly ofSectionId?: string | undefined }): Promise<CompanionArtifactRef>
```

**Parameters:**
- `def: SequenceDefinition` — The validated sequence definition to render.
- `title: string` — The companion document title.
- `destPath: string` — Absolute filesystem path the offline HTML companion is written to (a sibling of the design document).
- `opts: { repoPath: string; ofSectionId?: string | undefined }` — repoPath to make relPath repo-relative; optional ofSectionId to anchor the companion to a document section (mirrors renderErCompanion's opts).

**Returns:** `Promise<CompanionArtifactRef>` — A ref { kind: 'diagram-mermaid', relPath, title, ofSectionId? } pointing at the written HTML — identical body to renderErCompanion (sequenceDefinitionToIr → assembleShell → write HTML → ref).

**Errors:**
- `DiagramGenerationError` when assembleShell returns a non-ok DocGenOutcome (render failure), or sequenceDefinitionToIr throws on a dangling ref — no file is written.

**Preconditions:**
- destPath's parent is creatable (the renderer mkdirs it, mirroring renderErCompanion).

**Postconditions:**
- On success, exactly one HTML file exists at destPath and the returned relPath is repo-relative.
- On a thrown DiagramGenerationError, no partial file is left at destPath.

### 2.4 `renderComponentCompanion`

```typescript
export function renderComponentCompanion(def: ComponentDependencyDefinition, title: string, destPath: string, opts: { readonly repoPath: string; readonly ofSectionId?: string | undefined }): Promise<CompanionArtifactRef>
```

**Parameters:**
- `def: ComponentDependencyDefinition` — The validated component-dependency definition to render.
- `title: string` — The companion document title.
- `destPath: string` — Absolute filesystem path the offline HTML companion is written to.
- `opts: { repoPath: string; ofSectionId?: string | undefined }` — repoPath to make relPath repo-relative; optional ofSectionId to anchor the companion to a document section.

**Returns:** `Promise<CompanionArtifactRef>` — A ref { kind: 'diagram-mermaid', relPath, title, ofSectionId? } pointing at the written HTML — identical body to renderErCompanion (componentDependencyDefinitionToIr → assembleShell → write HTML → ref).

**Errors:**
- `DiagramGenerationError` when assembleShell returns a non-ok DocGenOutcome, or componentDependencyDefinitionToIr throws on a dangling ref — no file is written.

**Preconditions:**
- destPath's parent is creatable.

**Postconditions:**
- On success, exactly one HTML file exists at destPath and the returned relPath is repo-relative.
- On a thrown DiagramGenerationError, no partial file is left at destPath.

### 2.5 `renderDiagramCompanionsForBody`

```typescript
export function renderDiagramCompanionsForBody(body: { readonly sequenceDefinition?: SequenceDefinition | undefined; readonly componentDependencyDefinition?: ComponentDependencyDefinition | undefined }, destDir: string, repoPath: string): Promise<readonly CompanionArtifactRef[]>
```

**Parameters:**
- `body: { sequenceDefinition?; componentDependencyDefinition? }` — The synthesized design-document body; the finalize seam reads the two optional diagram slots.
- `destDir: string` — The directory the sibling companion HTML files are written into (the design document's own directory).
- `repoPath: string` — Repo root, threaded to each renderer so returned relPaths are repo-relative.

**Returns:** `Promise<readonly CompanionArtifactRef[]>` — The companion refs for whichever of the two definitions the body carries — [] when neither is present (content-gated); one ref per authored definition. Refs are appended to body.companions by the finalize call sites (mirrors how renderErCompanionForBody's ref is appended).

**Errors:**
- `none` when Content-gate + swallow: an absent slot yields no companion; a per-definition validation HIGH finding leaves that definition in-body with no companion; a DiagramGenerationError from a renderer is caught and that companion is skipped — finalize never throws (mirrors renderErCompanionForBody catching DiagramGenerationError → undefined).

**Preconditions:**
- destDir exists (it is the design document's own directory, already created by the writer).

**Postconditions:**
- A body carrying neither diagram slot produces [] and no file — the document is byte-identical to today (ac3).
- A body carrying a diagram slot produces exactly one sibling HTML companion for it and one ref (ac2).

### 2.6 `SEQUENCE_DEFINITION_PROPERTY_SCHEMA`

```typescript
export const SEQUENCE_DEFINITION_PROPERTY_SCHEMA: Record<string, unknown>
```

**Returns:** `Record<string, unknown>` — A JSON-schema fragment for the optional `sequenceDefinition` body property (participants[] + messages[]), admitted into the HLD + LLD synthesize body schemas alongside erDefinition/uxDefinition — OPTIONAL, never in `required` (admit-but-never-force, mirrors ER_DEFINITION_PROPERTY_SCHEMA).

**Postconditions:**
- The schema is spliced into the two body schemas at the same sites as ER/UX; additionalProperties:false already lists the diagram slots additively.

### 2.7 `SEQUENCE_CONTENT_GATE_RULE`

```typescript
export const SEQUENCE_CONTENT_GATE_RULE: string
```

**Returns:** `string` — The HARD-RULE string injected as a bare array element at the four content-gate injection sites (HLD synth, LLD synth, design-story contract.detail, design-epic framework.write) telling the synthesizer to author a `sequenceDefinition` ONLY when a behaviour/call-flow diagram materially aids THIS document (mirrors ER_CONTENT_GATE_RULE).

**Postconditions:**
- Guarded by the same source-scan admit-but-never-force test convention S1 established (k4).

### 2.8 `COMPONENT_DEFINITION_PROPERTY_SCHEMA`

```typescript
export const COMPONENT_DEFINITION_PROPERTY_SCHEMA: Record<string, unknown>
```

**Returns:** `Record<string, unknown>` — A JSON-schema fragment for the optional `componentDependencyDefinition` body property (components[] + dependencies[]), admitted into the HLD + LLD synthesize body schemas — OPTIONAL, never required (mirrors ER_DEFINITION_PROPERTY_SCHEMA).

**Postconditions:**
- Spliced into the two body schemas at the same sites as ER/UX/sequence.

### 2.9 `COMPONENT_CONTENT_GATE_RULE`

```typescript
export const COMPONENT_CONTENT_GATE_RULE: string
```

**Returns:** `string` — The HARD-RULE string injected as a bare array element at the four content-gate injection sites telling the synthesizer to author a `componentDependencyDefinition` ONLY when a component/module dependency diagram materially aids THIS document (mirrors ER_CONTENT_GATE_RULE).

**Postconditions:**
- Guarded by the same source-scan admit-but-never-force test convention (k4).

## 3. Data model changes

### 3.1 `SequenceDefinition` — new

New TypeScript interface (src/workflow/artifacts/companion/sequence.ts) + its JSON-schema twin (sequence-schema.ts). Shape: { participants: {id;label?}[]; messages: {from;to;label;kind?:'call'|'return'|'recurse';note?}[]; truncations?: {atParticipant;note}[] }. Authored under the content gate; SOURCE OF TRUTH for the generated sequence companion. Also added as an OPTIONAL field sequenceDefinition? on the HLD + LLD body types (artifacts/hld.ts, artifacts/lld.ts) next to erDefinition/uxDefinition.

**Call sites:**
- `src/workflow/orchestrator.ts:1467 (HLD synth body schema admission, next to erDefinition/uxDefinition)`
- `src/workflow/orchestrator.ts:1863 (LLD synth body schema admission)`

### 3.2 `ComponentDependencyDefinition` — new

New TypeScript interface (src/workflow/artifacts/companion/component.ts) + its JSON-schema twin (component-schema.ts). Shape: { components: {id;label?}[]; dependencies: {from;to;label?}[] }. Authored under the content gate; SOURCE OF TRUTH for the generated component-dependency companion. Also added as an OPTIONAL field componentDependencyDefinition? on the HLD + LLD body types.

**Call sites:**
- `src/workflow/orchestrator.ts:1467 (HLD synth body schema admission)`
- `src/workflow/orchestrator.ts:1863 (LLD synth body schema admission)`

### 3.3 `CompanionArtifactRef` — invariant-change

No shape change — the two new renderers REUSE the existing union member kind 'diagram-mermaid' (already in the CompanionKind union at companion/types.ts:24). No new CompanionKind is added (k1 additive).

**Call sites:**
- `src/workflow/artifacts/companion/types.ts:24`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc3` | implements | This Story OWNS sc3 (boundary.owns=['sc3'], ownedByStory='s3'). It materialises every member the sc3 interfaceSketch names: sequence-schema.ts (SEQUENCE_DEFINITION_PROPERTY_SCHEMA + SEQUENCE_CONTENT_GATE_RULE), sequence.ts (SequenceDefinition + sequenceDefinitionToIr), component-schema.ts (COMPONENT_DEFINITION_PROPERTY_SCHEMA + COMPONENT_CONTENT_GATE_RULE), component.ts (ComponentDependencyDefinition + componentDependencyDefinitionToIr), render.ts additions (renderSequenceCompanion + renderComponentCompanion), and the renderDiagramCompanionsForBody finalize peer. It CONSUMES the already-shipped render spine (DocumentIR, assembleShell, documentIRToMermaid docType dispatch) and the CompanionArtifactRef / CompanionKind types unchanged. It does NOT touch the er/ux families or renderErCompanionForBody; it only ADDS parallel peers, re-instancing the sc1 gate-injection convention for its own two gates independently of S1 (no code dependency on sc1/sc2). |

## 5. Error paths

**Error cases**

- **A sequenceDefinition message references a from/to participant id not declared in participants[] (a dangling endpoint), or a componentDependencyDefinition dependency references a component id absent from components[].** (recoverable)
  - Detection: sequenceDefinitionToIr / componentDependencyDefinitionToIr build a Set of declared ids and check each edge endpoint against it while mapping edges; an unresolved id throws DiagramGenerationError before assembleShell is reached (mirrors erDefinitionToIr's dangling-ref throw).
  - Response: Throw DiagramGenerationError with the offending id + edge. At renderDiagramCompanionsForBody the throw is caught and that companion is skipped (the definition remains in-body without a rendered picture); the workflow does not fail.
  - User impact: The design document keeps the authored definition text but shows no rendered diagram for that malformed definition; the other diagram (if authored) and the rest of the document are unaffected.
- **assembleShell returns a non-ok DocGenOutcome for a structurally valid definition (mermaid render failure inside the shared render spine).** (recoverable)
  - Detection: renderSequenceCompanion / renderComponentCompanion inspect outcome.status !== 'ok' after awaiting assembleShell (the exact check renderErCompanion uses) and throw DiagramGenerationError; no file is written.
  - Response: The renderer throws; renderDiagramCompanionsForBody catches DiagramGenerationError and skips that companion — no partial HTML file is left at destPath.
  - User impact: No diagram companion HTML for the failed definition; the document is otherwise complete and the definition stays in-body.
- **The destination directory is not writable / mkdir fails when a renderer tries to write the sibling companion HTML.** (recoverable)
  - Detection: The writeFileSync/mkdirSync inside the renderer (same sequence as renderErCompanion) throws a filesystem error, surfaced as (or wrapped in) DiagramGenerationError.
  - Response: renderDiagramCompanionsForBody catches it and skips that companion; the finalize seam never throws, so document finalization completes (mirrors renderErCompanionForBody's swallow).
  - User impact: That diagram companion is missing from the finalized document; no crash, no half-written file.
- **A per-definition validation reports a HIGH finding (validateSequenceDefinition / validateComponentDependencyDefinition rejects a structurally invalid definition before render).** (recoverable)
  - Detection: renderDiagramCompanionsForBody runs the light structural validator (participants/messages present; components/dependencies present) and inspects the returned DimensionFinding[] for a HIGH severity, exactly as renderErCompanionForBody gates on validateErDefinition.
  - Response: Skip rendering for that definition, leaving it in-body without a companion (do not throw). The other definition still renders if valid.
  - User impact: The invalid definition is preserved in the document but produces no picture; the author can see the raw definition and correct it on a re-run.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A design-document body that authors NEITHER sequenceDefinition NOR componentDependencyDefinition (the overwhelmingly common case). | renderDiagramCompanionsForBody returns [] and writes no file; the finalized document is byte-identical to today (ac3/k1). No validator or renderer is invoked. |
| A body that authors BOTH a sequenceDefinition AND a componentDependencyDefinition. | Exactly two sibling companion HTML files are written and two CompanionArtifactRefs (both kind 'diagram-mermaid') are returned and appended to body.companions — one per authored definition, independently gated. |
| A sequenceDefinition with an empty messages[] or a componentDependencyDefinition with an empty dependencies[]. | A valid-but-minimal DocumentIR is produced (nodes, zero edges) and rendered — a diagram of the participants/components with no arrows. Not an error; the content gate is the author's judgment, not a non-emptiness check on edges. |
| A sequenceDefinition using the optional recursion (kind:'recurse') or truncation markers. | sequenceDefinitionToIr emits the ':repeat' edge-id suffix / 'truncation' node the existing toSequenceDiagram already renders as a mermaid Note (shell.ts:142-160) — no new rendering code, the marker flows through the existing docType dispatch. |
| A sequenceDefinition participant/message label containing mermaid-significant characters. | The label is carried into the IR verbatim; escaping/sanitization is the responsibility of the existing toSequenceDiagram/toFlowchart render spine (consumed unchanged), not re-implemented in the toIr — the same contract erDefinitionToIr relies on. |

**Invariants to preserve**

- The companion render pipeline stays single-sourced on the existing DocumentIR → assembleShell → documentIRToMermaid docType dispatch (shell.ts:170-176): a 'call-sequence' IR renders a mermaid sequenceDiagram and a 'component-dependency' IR renders a flowchart LR. S3 adds only IR authorship (two toIr functions) and MUST NOT introduce a second diagram engine, Python, or any network/CDN path (k5). [[c3]]
- The companion contract stays a three-part family mirroring er/ux: (schema+gate) / (definition+toIr) / renderer, with the renderer body IDENTICAL to renderErCompanion (xDefinitionToIr → assembleShell → non-ok throws DiagramGenerationError → write HTML → return CompanionArtifactRef). The two new renderers reuse the existing CompanionKind 'diagram-mermaid' and add no new union member (companion/types.ts:24). [[c3]]
- The finalize seam stays content-gated and non-throwing exactly as renderErCompanionForBody (orchestrator.ts:1504-1527): an absent definition yields no companion and a byte-identical document; a validation HIGH or a DiagramGenerationError is swallowed, leaving the definition in-body without a picture — finalization never fails because a companion could not be rendered. [[c3]]

## 6. Test strategy

**Test framework:** `node:test (node --test / `npx tsx --test`) with node:assert/strict — the framework every companion + workflow suite already uses (er.test.ts, render.test.ts, er-companion-finalize.test.ts).`

**Test levels**

- **unit** — Prove each toIr mapping produces the correct DocumentIR (docType, node kinds, edges) deterministically, and that a dangling endpoint throws DiagramGenerationError before render — mirroring er.test.ts.
  - Subjects: `sequenceDefinitionToIr: participants → nodes kind 'call-frame', messages → edges, recursion → ':repeat' suffix, truncation → 'truncation' node; docType 'call-sequence'`, `componentDependencyDefinitionToIr: components → nodes, dependencies → edges; docType 'component-dependency'`, `determinism: byte-identical DocumentIR for a byte-identical def`, `dangling-ref: DiagramGenerationError`, `validateSequenceDefinition / validateComponentDependencyDefinition structural findings`
  - Fixtures: `in-memory well-formed SequenceDefinition + ComponentDependencyDefinition`, `malformed variants with a dangling endpoint`
- **unit** — Prove each renderer writes a sibling offline HTML companion + returns the right CompanionArtifactRef on success, and writes NO file + throws DiagramGenerationError on a non-ok DocGenOutcome — mirroring render.test.ts.
  - Subjects: `renderSequenceCompanion ok → HTML + ref kind 'diagram-mermaid'`, `renderComponentCompanion ok → HTML + ref`, `non-ok assembleShell → DiagramGenerationError + no file`, `opts.repoPath → repo-relative relPath; ofSectionId flows into the ref`
  - Fixtures: `a tmp dir (mkdtempSync) as destPath parent + repoPath`, `the well-formed definitions`
- **unit** — Prove the synth-body schemas ADMIT the two diagram slots but never REQUIRE them + the two content-gate rules are wired at every admitting synthesizer prompt — mirroring ux-synth-schema.test.ts (k4).
  - Subjects: `prepareSynthesize(design.epic) + prepareSynthesize(design.story standalone): body admits sequenceDefinition + componentDependencyDefinition, neither required, additionalProperties false, compiles under ajv`, `source-scan of orchestrator.ts + runners/*/index.ts: both gate rules imported + injected once per admitting prompt, co-located with ER/UX`
  - Fixtures: `readFileSync of orchestrator.ts / runners/*/index.ts`, `WorkflowIntent for design.epic (bare) + design.story (standalone params)`
- **integration** — Prove the finalize seam renders + links a sibling companion when authored, produces nothing (byte-identical) when absent, and never throws on a malformed/failed definition — mirroring er-companion-finalize.test.ts.
  - Subjects: `renderDiagramCompanionsForBody: sequence-only → one HTML + ref; component-only → one HTML + ref; both → two; neither → [], no file, byte-identical`, `swallow: a dangling-ref or validation-HIGH definition is skipped, finalize does not throw, a valid second definition still renders`
  - Fixtures: `a tmp destDir + repoPath (mkdtempSync)`, `body objects: sequence-only, component-only, both, neither, malformed`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: prepareSynthesize(design.epic/design.story) admits sequenceDefinition + componentDependencyDefinition as optional-never-required body properties`, `unit (source-scan): both content-gate rules injected at every diagram-slot-admitting synthesizer prompt + both runner step-prompt builders, co-located with the ER/UX gates` |
| `ac2` | `unit: renderSequenceCompanion / renderComponentCompanion ok → sibling HTML + CompanionArtifactRef kind 'diagram-mermaid'`, `integration: renderDiagramCompanionsForBody with a sequence-only / component-only / both body → sibling companion HTML + ref(s)` |
| `ac3` | `integration: renderDiagramCompanionsForBody with NO diagram slot → [], no file, byte-identical document`, `unit: the diagram slots are NOT in the synth body required set` |
| `ac4` | `unit: the two families expose the full three-part pattern reusing CompanionKind 'diagram-mermaid' (no new union member)`, `integration: the finalize peer mirrors renderErCompanionForBody WITHOUT altering the er/ux renderers — er/ux finalize tests still pass unchanged` |

## 7. Migration

**State before:** Today the companion subsystem ships only ER + UX families; no family authors the 'call-sequence' / 'component-dependency' docTypes though the render engine already dispatches them (shell.ts:170-176, s1 bundle 'render-pipeline-exists'). Finalize renders only ER + UX (renderErCompanionForBody orchestrator.ts:1504-1527 and its UX peer).

**State after:** Two new content-gated families (sequence, component-dependency) join ER + UX; both slots OPTIONAL in the HLD + LLD synth body schemas, each with its own content-gate rule at the four synth-prompt sites; renderDiagramCompanionsForBody renders + links a companion for whichever slot the body carries. A diagram-less document is byte-identical to today. er/ux + the render engine untouched.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the two definition modules (sequence-schema.ts, sequence.ts, component-schema.ts, component.ts) — net-new files, unreferenced. — ↩ rollbackable
2. Add renderSequenceCompanion + renderComponentCompanion to render.ts (bodies identical to renderErCompanion, kind 'diagram-mermaid') — additive exports. — ↩ rollbackable
3. Add optional sequenceDefinition? / componentDependencyDefinition? fields to the HLD + LLD body types — additive, optional; existing bodies remain valid. — ↩ rollbackable
4. Admit the two new slots into the two synth body schemas (orchestrator.ts:1467/:1863) as OPTIONAL properties — widens admission only, nothing becomes required. — ↩ rollbackable
5. Inject SEQUENCE_/COMPONENT_CONTENT_GATE_RULE as bare array elements adjacent to the ER/UX gates at the four synth-prompt sites — additive prompt lines. — ↩ rollbackable
6. Add renderDiagramCompanionsForBody and call it next to renderErCompanionForBody at the three finalize sites, appending refs to body.companions — content-gated. — ↩ rollbackable
7. Add the unit + integration tests — test-only, no runtime effect. — ↩ rollbackable

**Backward compat:** Fully backward compatible and purely additive. No existing public API signature changes: the two new slots are OPTIONAL body properties, the two renderers + finalize peer are net-new exports, and renderErCompanionForBody / the ER+UX families / the render engine are consumed unchanged. Every previously valid body stays valid; a diagram-less document is byte-identical (ac3/k1). No CompanionKind member is added. Already-approved artifacts replay unchanged.

## 8. Alternatives considered

### 8.1 a1: Two parallel families + finalize peer + review-dimension wiring — **CHOSEN**

Faithful er/ux mirror: two three-part triples (sequence-*, component-*) + renderDiagramCompanionsForBody + register the 'diagram' review dimension.

Two three-part triples exactly as the sc3 interfaceSketch names, the finalize peer, and the full pattern including the diagram/review wiring ac4 requires.

### 8.2 a2: One combined diagram module

A single diagram-schema.ts/diagram.ts with both definitions + a shared gate, instead of two parallel families.

One module with two exports + a shared DIAGRAM_CONTENT_GATE_RULE, rather than two parallel families.

**Rejected because:** Trades contract fidelity (sc3) and gate crispness (k2) for negligible file-count savings versus the faithful mirror.

### 8.3 a3: Two families, defer the review dimension

Same two families + finalize peer, but leave the code-review 'diagram' dimension registration to a follow-up.

Same two families + finalize peer, but leave the diagram review-dimension wiring to a follow-up.

**Rejected because:** ac4 names the review wiring as part of the companion pattern; deferring it leaves half the pattern unbuilt. Kept as the fallback only if the review-dimension handler cannot admit a new kind additively (see openQuestion).

## 9. References

- **[[c1]]** `analyze-bundle` `s1 bundle 'render-pipeline-exists' — src/docgen/render/shell.ts:170-176 documentIRToMermaid docType dispatch; :123-134 toFlowchart; :142-160 toSequenceDiagram` — "documentIRToMermaid DISPATCHES on ir.docType: 'call-sequence' → toSequenceDiagram; 'component-dependency' → toFlowchart (flowchart LR). The ENTIRE rendering for a sequence + a component-dependency dia"
- **[[c2]]** `analyze-bundle` `s1 bundle 'er-ux-contract-to-mirror' — src/workflow/artifacts/companion/{er-schema.ts,er.ts,render.ts,types.ts}; orchestrator.ts:1504-1527 renderErCompanionForBody` — "Each family is a three-part triple; the finalize seam content-gates on an absent definition and catches DiagramGenerationError → undefined."
- **[[c3]]** `analyze-bundle` `s1 bundle 'synth-body-admission-and-gate-sites' — orchestrator.ts:1467/:1863 (body schema admission), :1425/:1803 + design-story/index.ts:298 + design-epic/index.ts:270 (gate sites)` — "S3 admits sequenceDefinition + componentDependencyDefinition at the SAME two body-schema sites additively, and adds the two content-gate rules adjacent to ER/UX at the four gate sites."
- **[[c4]]** `analyze-bundle` `s1 bundle 'test-and-review-patterns' — companion/__tests__/{er.test.ts,render.test.ts}; workflow/__tests__/er-companion-finalize.test.ts; code-review/expected-dimensions.ts` — "Tests to mirror + the OPTIONAL content-gated 'diagram' ReviewDimension registered via a per-type handler keyed on the body carrying a diagram definition."

## 10. Open questions

- The code-review 'diagram' ReviewDimension (expected-dimensions.ts) must admit the two new diagram-definition kinds ADDITIVELY — the handler keys on the body carrying a diagram definition, mirroring how the 'ux' dimension keys on body.uxDefinition (grounded in s1 'test-and-review-patterns'). If registering the sequence/component kinds turns out to require editing shared code owned by another boundary, that slice must be raised as an HLD back-flow / follow-up (degrading to a3), NOT silently built — confirm at plan/build time whether the registration is a local additive edit.

## Resolved questions

- `q73a8dd12` — The code-review 'diagram' ReviewDimension (expected-dimensions.ts) must admit the two new diagram-definition kinds ADDITIVELY — the handler keys on the body carrying a diagram definition, mirroring how the 'ux' dimension keys on body.uxDefinition (grounded in s1 'test-and-review-patterns'). If registering the sequence/component kinds turns out to require editing shared code owned by another boundary, that slice must be raised as an HLD back-flow / follow-up (degrading to a3), NOT silently built — confirm at plan/build time whether the registration is a local additive edit.
  - **resolved**: B. Peer handlers reached by an additive body-keyed branch in the dispatcher — Confirmed a LOCAL ADDITIVE edit (so the open question resolves toward building, not degrading to a3): registry.ts reserves the peer-handler slot by name for deferred sequence/component, and dimensions/diagram/index.ts:96 already establishes body-keyed dispatch as the in-pattern way to reach a handler without touching ref routing. New handlers/sequence.ts + handlers/component.ts self-register via registerDiagramHandler; only added lines/files, handlers/er.ts untouched — no other boundary's function body changes. Keeps ac4's review-wiring half of the pattern (rejecting D/a3) and avoids the semantic edit to the sc4-owned isErCompanion that C would require. _(2026-09-29T18:16:55.468Z)_

## Citations

- **[[c1]]** `analyze-bundle` `s1 bundle 'render-pipeline-exists' — src/docgen/render/shell.ts:170-176 documentIRToMermaid docType dispatch; :123-134 toFlowchart; :142-160 toSequenceDiagram` — "documentIRToMermaid DISPATCHES on ir.docType: 'call-sequence' → toSequenceDiagram; 'component-dependency' → toFlowchart (flowchart LR). The ENTIRE rendering for a sequence + a component-dependency dia"
- **[[c2]]** `analyze-bundle` `s1 bundle 'er-ux-contract-to-mirror' — src/workflow/artifacts/companion/{er-schema.ts,er.ts,render.ts,types.ts}; orchestrator.ts:1504-1527 renderErCompanionForBody` — "Each family is a three-part triple; the finalize seam content-gates on an absent definition and catches DiagramGenerationError → undefined."
- **[[c3]]** `analyze-bundle` `s1 bundle 'synth-body-admission-and-gate-sites' — orchestrator.ts:1467/:1863 (body schema admission), :1425/:1803 + design-story/index.ts:298 + design-epic/index.ts:270 (gate sites)` — "S3 admits sequenceDefinition + componentDependencyDefinition at the SAME two body-schema sites additively, and adds the two content-gate rules adjacent to ER/UX at the four gate sites."
- **[[c4]]** `analyze-bundle` `s1 bundle 'test-and-review-patterns' — companion/__tests__/{er.test.ts,render.test.ts}; workflow/__tests__/er-companion-finalize.test.ts; code-review/expected-dimensions.ts` — "Tests to mirror + the OPTIONAL content-gated 'diagram' ReviewDimension registered via a per-type handler keyed on the body carrying a diagram definition."
