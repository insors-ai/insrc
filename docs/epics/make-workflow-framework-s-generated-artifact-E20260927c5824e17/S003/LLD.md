<!-- insrc:artifact LLD-c5824e17eccf0c14-s3 -->

# LLD: E20260928c5824e17:S003

**Epic:** `make-workflow-framework-s-generated-artifact`
**HLD base run:** `wf-1790520092322-vpqvrh`
**HLD effective hash:** `a28e2f107661...`

## HLD context

**Framework:** Adopt a1: the artifact JSON body is the single source of truth for the new content, the existing per-type renderers are enriched to generate human-readable, audience-aware markdown from that structured body, and the three new adherence checks (functional-coverage, diagram, UX) are added as code-review dimensions that ride the existing computeReviewVerdict / codeReview.enforce completion gate without forking the verdict reducer. Diagrams and UX mocks are content-gated companion artifacts referenced from — never inlined into — the core markdown, produced through the existing docgen generateDocument seam. The four forward-only Stories layer cleanly: S001 introduces the functional-definition record + its coverage dimension; S002 makes every document navigable, audience-aware, and de-duplicated; S003 adds content-gated diagram companions; S004 unifies the selectable adherence dimensions and the UX-acceptance check.
**Rollout phase:** Phase C — content-gated design diagrams
**Owns:** `sc4` (Companion-artifact reference)
**Consumes:** `sc1` (FunctionalDefinition record (artifact body)), `sc3` (Document-structure + shared-context reference model)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Private to S001: FR-id scheme, FunctionalDefinition internals, functional-coverage provider prompt/schema. — owns `sc1`, `sc2`
- `s2`: Private to S002: per-type section layouts/renderer formatting, audience-tailoring, SharedContextRef diffing. — owns `sc3`
- `s4`: Private to S004: the multiselect adherence enum (UX, Diagram:Sequence/ER/Component, FR-coverage), the uxAcceptance flag, and the UX review dimension.

## Contract details

**Surface level:** internal-shared

### `resolveCompanionPath`

```typescript
function resolveCompanionPath(repoPath: string, identity: WorkItemIdentity, workItemKind: WorkItemKind, slug: string, companionFileName: string): string
```

**Parameters:**
- `repoPath: string` — Registered repo root.
- `identity: WorkItemIdentity` — Work-item identity the companion belongs to.
- `workItemKind: WorkItemKind` — 'epic' | 'standalone'.
- `slug: string` — Work-item slug.
- `companionFileName: string` — Safe basename of the companion file.

**Returns:** `string` — Absolute path to the companion as a SIBLING of the artifact's .md (k1/ac2).

**Errors:**
- `Error` when Story-scoped artifact missing identity.story — reuses resolveArtifactMdPath's guard (path-scheme.ts:126-132).

**Preconditions:**
- companionFileName is a validated basename.

**Postconditions:**
- Net-new helper realizing sc4's on-disk scheme; pure construction, no disk read.

### `assessDiagramNeed`

```typescript
function assessDiagramNeed(doc: { readonly kind: ArtifactKind; readonly body: unknown; readonly functionalDefinition?: FunctionalDefinition }, provider: LLMProvider): Promise<DiagramNeedAssessment>
```

**Parameters:**
- `doc: { kind: ArtifactKind; body: unknown; functionalDefinition?: FunctionalDefinition }` — The document under generation + (sc1) FR record for grounding.
- `provider: LLMProvider` — Local provider — the only path (k5/ac4).

**Returns:** `DiagramNeedAssessment` — { warranted; diagrams:[{ type:'er', ofSectionId?, rationale }] } — the content-gate; empty when no visual warranted (ac1/k3). S003 emits only 'er'.

**Errors:**
- `(fail-safe)` when Provider/parse failure resolves to { warranted:false, diagrams:[] } (never throws; k3).

**Preconditions:**
- Exactly one serial provider call.

**Postconditions:**
- An ER is authored + rendered downstream only for a returned need.

### `erDefinitionToIr`

```typescript
function erDefinitionToIr(erDef: ErDefinition): DocumentIR
```

**Parameters:**
- `erDef: ErDefinition` — The authored LinkML-shaped ER element (source of truth).

**Returns:** `DocumentIR` — A docgen DocumentIR: classes->entity nodes, class-ranged slots->relationship edges with crow's-foot cardinality from required/multivalued/min/max_cardinality. Pure deterministic transform (no graph, no provider).

**Errors:**
- `ErDefinitionError` when A relationship slot whose range names a class absent from erDef.classes (referential integrity).

**Preconditions:**
- erDef passed validateErDefinition.

**Postconditions:**
- Same erDef -> same IR; feeds assembleShell unchanged.

### `renderErCompanion`

```typescript
function renderErCompanion(erDef: ErDefinition, title: string, destPath: string): Promise<CompanionArtifactRef>
```

**Parameters:**
- `erDef: ErDefinition` — The authored ER element to visualize.
- `title: string` — Companion title.
- `destPath: string` — Sibling path from resolveCompanionPath.

**Returns:** `CompanionArtifactRef` — { kind:'diagram-mermaid', relPath, title, ofSectionId? } — the sc4 reference the markdown links, never inlines (ac2/k1); a pure visualization of erDef.

**Errors:**
- `DiagramGenerationError` when Wraps a non-ok DocGenOutcome from assembleShell so the caller omits the diagram.

**Preconditions:**
- erDefinitionToIr succeeded; assembleShell is the ONLY render path — no cloud REST, no Python (ac4/k5).

**Postconditions:**
- The shell HTML is written to destPath as a sibling; relPath is repo-relative.

### `assembleShell`

```typescript
function assembleShell(ir: DocumentIR): ShellOutcome
```

**Parameters:**
- `ir: DocumentIR` — The IR to render (from erDefinitionToIr, not a graph extractor).

**Returns:** `ShellOutcome` — DocGenOutcome<RenderedDocumentShell> — self-contained HTML w/ inlined SVG (render/shell.ts). CONSUMED unchanged; the SEPARABLE render seam reused without generateDocument.

**Errors:**
- `DocGenOutcome (non-ok)` when fallback-unavailable — returned as data.

**Preconditions:**
- EXISTING symbol (src/docgen/render/shell.ts, imported docgen/index.ts:32); S003 does not modify it.

**Postconditions:**
- Bundled mermaid/svg assets inline the diagram; local-only (ac4/k5).

### `validateErDefinition`

```typescript
function validateErDefinition(erDef: unknown, fnDef?: FunctionalDefinition): readonly DimensionFinding[]
```

**Parameters:**
- `erDef: unknown` — The erDefinition body element to validate (the JSON ELEMENT, not the rendered doc).
- `fnDef: FunctionalDefinition` _(optional)_ — (sc1) FR record for the ER<->FR consistency check.

**Returns:** `readonly DimensionFinding[]` — Three layers: (1) LinkML-metamodel schema validity via validateAgainstSchema vs the vendored metamodel; (2) referential integrity (relationship slot ranges resolve to defined classes, identifiers present); (3) FR/data-model consistency. Empty when sound.

**Preconditions:**
- Runs against the structured JSON element — NEVER parses the rendered companion (stakeholder direction).

**Postconditions:**
- A HIGH 'breach' finding folds through the un-forked verdict/enforce gate (ac3/k4).

### `judgeDiagram`

```typescript
const judgeDiagram: (subject: CodeReviewSubject, grounding: CodeReviewGrounding, provider: LLMProvider) => Promise<DimensionResult>
```

**Parameters:**
- `subject: CodeReviewSubject` — Carries the approved body (erDefinition + companion refs).
- `grounding: CodeReviewGrounding` — Assembled grounding.
- `provider: LLMProvider` — Local provider (the ER handler is deterministic and does not use it).

**Returns:** `DimensionResult` — { dimension:'diagram', findings } — THIN DISPATCHER over diagramHandlerFor(type); the ER handler calls validateErDefinition. NO inline type switch. Mirrors judgeFunctionalCoverage.

**Errors:**
- `(per-handler isolation)` when A handler failing yields a LOW 'observation', never aborts the dimension.

**Preconditions:**
- Registered as a peer JudgeSlot in DEFAULT_JUDGES, included only when hasDiagramReferences(subject); handlers serial.

**Postconditions:**
- findings ride the SAME computeReviewVerdict/foldVerdict + enforceCodeReviewGate — no forked gate (ac3/k4).

### `registerDiagramHandler`

```typescript
function registerDiagramHandler(handler: DiagramAdherenceHandler): void; function diagramHandlerFor(type: string): DiagramAdherenceHandler | undefined
```

**Parameters:**
- `handler: DiagramAdherenceHandler` — A self-contained per-type handler; S003 registers the 'er' handler only.

**Returns:** `void | DiagramAdherenceHandler | undefined` — The per-type handler REGISTRY (Map<string,DiagramAdherenceHandler>) mirroring docgen's InMemoryDocTypeRegistry — the extensibility seam S004's UX handler (and deferred sequence/component) register into as peers.

**Errors:**
- `DuplicateDiagramHandlerError` when A second registration for the same type — fail-fast (mirrors DuplicateDocTypeError, registry.ts:26-33).

**Preconditions:**
- S003 registers only 'er' at module load.

**Postconditions:**
- judgeDiagram dispatches through diagramHandlerFor — the per-type-handler constraint realized here.

### `hasDiagramReferences`

```typescript
function hasDiagramReferences(subject: CodeReviewSubject): boolean
```

**Parameters:**
- `subject: CodeReviewSubject` — The code-review subject.

**Returns:** `boolean` — True when the approved body carries an erDefinition and/or >=1 diagram CompanionArtifactRef — the inclusion GATE, mirroring hasFunctionalDefinition.

**Preconditions:**
- Drives effectiveJudges (runner.ts:125) + expectedDimensions (handler.ts:64) in lockstep.

**Postconditions:**
- A document with no ER/diagram runs exactly the base dimensions.

## Data model changes

### `ErDefinition (LinkML-shaped authored body element)` — new

The stakeholder-directed source of truth: a LinkML SchemaDefinition SUBSET — classes (entities) whose slots are SlotDefinitions with LinkML cardinality (required/multivalued/minimum_cardinality/maximum_cardinality) and a range (scalar type = attribute, another class = relationship). New src/workflow/artifacts/companion/er.ts. Authored when the content-gate warrants an ER; validated against the vendored LinkML metamodel schema (ajv). The JSON element is validated and visualized — the companion is derived from it, never the reverse.

```
+ interface ErDefinition { readonly id?: string; readonly classes: Record<string, ErClass> }
+ interface ErClass { readonly attributes?: Record<string, ErSlot> }
+ interface ErSlot { readonly range?: string; readonly required?: boolean; readonly multivalued?: boolean; readonly minimum_cardinality?: number; readonly maximum_cardinality?: number; readonly identifier?: boolean }
```

**Call sites:**
- `src/workflow/artifacts/companion/er.ts`
- `src/workflow/artifacts/hld.ts`
- `src/workflow/artifacts/lld.ts`

### `Vendored LinkML metamodel JSON Schema (bundled asset)` — new

A static JSON Schema of the LinkML metamodel (ClassDefinition/SlotDefinition + cardinality) vendored under src/assets/ + shipped via copy-assets, used by validateAgainstSchema — no Python/LinkML toolchain at runtime (k5). Boot asset-check mirrors docgen's asset-validator.

```
+ src/assets/artifacts/schemas/linkml-metamodel.schema.json (bundled)
```

**Call sites:**
- `src/workflow/artifacts/companion/er.ts`

### `CompanionArtifactRef + HldBody/LldBody companions + erDefinition fields` — field-add

sc4 CompanionArtifactRef (new companion/types.ts). Additive absent-safe `companions?: readonly CompanionArtifactRef[]` AND `erDefinition?: ErDefinition` on HLD+LLD bodies (the types with S002 diagram extension slots). Absent -> the S002 extension section renders empty (forward-only, k6).

```
  interface HldBody/LldBody { ...; readonly erDefinition?: ErDefinition; readonly companions?: readonly CompanionArtifactRef[] | undefined }
```

**Call sites:**
- `src/workflow/artifacts/companion/types.ts`
- `src/workflow/artifacts/hld.ts`
- `src/workflow/artifacts/lld.ts`

### `ReviewDimension` — invariant-change

Extend the flat union (code-review/types.ts:36) with 'diagram' — ONE new dimension; the per-type split (ER now; UX/sequence/component peers) lives below in the handler registry.

```
+ '...|functional-coverage|diagram'
```

**Call sites:**
- `src/workflow/code-review/types.ts`
- `src/workflow/code-review/runner.ts`
- `src/mcp/code-review-step/handler.ts`

### `DiagramAdherenceHandler / diagram handler registry` — new

interface DiagramAdherenceHandler { readonly type: string; appliesTo(ref|body): boolean; judge(subject, grounding, provider): Promise<readonly DimensionFinding[]> }. Map<string,handler> registry (register/for, fail-fast dup) mirroring docgen's InMemoryDocTypeRegistry (registry.ts:54). S003 ships ONLY the 'er' handler. Keyed by a type string so peers (UX=S004, sequence/component=deferred) register without S003 enumerating them.

```
+ interface DiagramAdherenceHandler { type; appliesTo; judge }
+ registry: Map<string, DiagramAdherenceHandler>  // S003 registers 'er'
```

**Call sites:**
- `src/workflow/code-review/dimensions/diagram/registry.ts`
- `src/workflow/code-review/dimensions/diagram/handlers/er.ts`
- `src/workflow/code-review/runner.ts`

### `DiagramNeedAssessment` — new

Content-gate result { warranted; diagrams:[{type,ofSectionId?,rationale}] }; empty when no visual warranted (ac1/k3). S003 emits only type:'er'.

```
+ interface DiagramNeedAssessment { readonly warranted: boolean; readonly diagrams: readonly { type: string; ofSectionId?: string; rationale: string }[] }
```

**Call sites:**
- `src/workflow/artifacts/companion/assess.ts`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc4` | implements | S003 owns sc4: CompanionArtifactRef + resolveCompanionPath + the companions?/erDefinition? body fields + the general AUTHORED-companion mechanism (structured body element -> deterministic visualization -> validate the JSON element). S004 reuses the SAME mechanism for ux-mock as a peer. |
| `sc1` | consumes | Consumes FunctionalDefinition (S001) read-only in validateErDefinition for the ER<->FR consistency check; never modifies FR ids/record. |
| `sc3` | consumes | Consumes S002's DocumentStructure — the existing 'diagrams'(HLD)/'diagramsEr'(LLD) extension slots — to render the CompanionArtifactRef as a link; no format re-design. |

## Error paths

### Error cases

- **The authored erDefinition is invalid against the LinkML metamodel.** (recoverable)
  - Detection: validateErDefinition runs validateAgainstSchema(erDef) against the vendored metamodel; ajv returns errors.
  - Response: HIGH 'breach' finding on the 'diagram' dimension; folds to block, withholds completion under enforce (ac3/k4). Validation targets the JSON element, not the doc.
  - User impact: A malformed ER model is caught against the structured element with a precise message before it can mislead a reviewer.
- **A relationship slot's range names a class not defined in erDefinition.classes.** (recoverable)
  - Detection: validateErDefinition / erDefinitionToIr resolves each class-ranged slot against erDef.classes and finds it absent.
  - Response: HIGH 'breach' naming the slot+range; the ER render is not emitted for a broken model.
  - User impact: An ER referencing a non-existent entity is caught against the JSON, not rendered as a misleading diagram.
- **erDefinition is schema-valid but inconsistent with the FR/data-model.** (recoverable)
  - Detection: validateErDefinition cross-checks entities/relationships against the consumed FunctionalDefinition (sc1).
  - Response: A finding describing the ER<->FR mismatch; folds through the shared gate.
  - User impact: The designed data model and the FRs are kept in agreement.
- **assembleShell returns a non-ok DocGenOutcome for a valid erDefinition.** (recoverable)
  - Detection: renderErCompanion inspects the DocGenOutcome discriminant before writing.
  - Response: Omit the companion (no file, no ref) + surface DiagramGenerationError; the erDefinition stays validated in-body.
  - User impact: A render hiccup yields a doc whose ER model is still present + validated, just without the picture — no broken link.
- **The content-gate provider call fails / returns unparseable output.** (recoverable)
  - Detection: assessDiagramNeed wraps its single provider call in withStructuredRetry; caught inside.
  - Response: Fail safe to { warranted:false, diagrams:[] } — no ER authored/rendered.
  - User impact: A transient hiccup yields a diagram-less document (k3), not a failed generation.
- **A body carries an erDefinition but its referenced companion file is missing at review time.** (recoverable)
  - Detection: The ER handler sees hasDiagramReferences true and a CompanionArtifactRef whose relPath resolves to no sibling.
  - Response: HIGH 'breach' (referenced-but-absent companion) — satisfying ac3; folds through the enforce gate.
  - User impact: A doc claiming an ER it does not ship is caught (blocks under enforce).
- **Duplicate handler registration for a diagram type, or ran-set != expected-set.** (terminal)
  - Detection: registerDiagramHandler finds the type already in the Map (fail-fast); validateArtifact (runner.ts:281-306) compares ran vs expected dimensions.
  - Response: Throw DuplicateDiagramHandlerError / fail validateArtifact — dev-time errors kept green by the conditional-dimension test.
  - User impact: None in production: wiring/gate drift caught in dev/CI.
- **The vendored LinkML metamodel schema asset is missing/corrupt at runtime.** (terminal)
  - Detection: A boot-time asset check (mirroring docgen's asset-validator.ts) verifies the bundled schema before the ER handler runs.
  - Response: Fail loudly at boot with a rebuild/copy-assets message; never silently skip validation.
  - User impact: A packaging fault is caught at startup, not by passing an unvalidated ER model.

### Edge cases

| Input | Expected |
| :--- | :--- |
| A document the content-gate deems needs NO ER diagram. | No erDefinition authored, no companion, hasDiagramReferences false -> the 'diagram' dimension not run; base dimensions only (ac1/k3). |
| An erDefinition with a single entity and zero relationships. | Valid: renders a single-entity ER (attributes only); the ER handler passes. |
| A body whose companions[] contains a 'ux-mock' entry (added later by S004). | The ER handler's appliesTo ignores non-ER companions; diagramHandlerFor('ux') is unregistered in S003 -> a LOW 'observation' until S004 registers its peer. S003 builds no UX logic. |
| An older artifact with neither erDefinition nor companions. | The S002 extension section renders empty, hasDiagramReferences false, base dimensions only — forward-only (k6). |
| An erDefinition slot whose range is a scalar type vs another class. | erDefinitionToIr renders scalar-range slots as attributes and class-range slots as relationships with crow's-foot cardinality — deterministic. |

### Invariants to preserve

- The authored erDefinition JSON element is the SOURCE OF TRUTH: the ER companion is a deterministic visualization derived from it, and adherence/validation runs against the JSON element, never by parsing the rendered doc (stakeholder direction; consistent with k2). [[c2]]
- The code-review verdict reducer is never forked: diagram findings flow through the same computeReviewVerdict/foldVerdict + enforceCodeReviewGate as the base dimensions. [[c6]]
- The base dimensions run exactly as before for work with no ER/diagram: effectiveJudges only ADDS 'diagram' when hasDiagramReferences, ran-set==expected-set. [[c3]]
- The ER companion is rendered ONLY via docgen's assembleShell render seam (local bundled assets) — generateDocument/graph extraction is NOT used for ER, no Python, no cloud REST (k5). [[c1]]
- The core markdown never inlines companion content: the ER visualization lives only as a sibling file referenced by relPath; the erDefinition stays a structured body element (k1). [[c5]]
- Every added provider call (the content-gate) is serial under withStructuredRetry; the ER validation + render are deterministic and provider-free. [[c4]]

## Test strategy

**Test framework:** `node:test + node:assert/strict (tsx), co-located under src/workflow/**/__tests__/ and src/workflow/code-review/__tests__/, matching functional-coverage-conditional.test.ts + the docgen/path-scheme suites; live provider tests gate behind INSRC_LIVE_TESTS.`

### Test levels

- **unit** — Prove ER validation runs against the JSON element (LinkML-metamodel + referential integrity + FR-consistency), never the rendered doc.
  - Subjects: `validateErDefinition: metamodel-valid -> no findings; shape/cardinality violation -> HIGH breach (ajv vs vendored metamodel)`, `validateErDefinition: dangling relationship range -> HIGH referential-integrity breach`, `validateErDefinition: ER<->FR mismatch -> finding when FunctionalDefinition supplied`, `validateErDefinition never reads a rendered file (assert no companion fs read)`
  - Fixtures: `valid + invalid ErDefinition fixtures`, `the vendored linkml-metamodel.schema.json`, `FunctionalDefinition fixtures`
- **unit** — Prove the deterministic visualization + content-gate + companion path without cloud access.
  - Subjects: `erDefinitionToIr: classes->entities, scalar slots->attributes, class slots->relationships w/ crow's-foot cardinality; deterministic`, `renderErCompanion: builds IR + spied assembleShell + writes sibling; non-ok -> no file + DiagramGenerationError`, `resolveCompanionPath sibling-of-.md; throws for story-scoped missing story`, `assessDiagramNeed: empty/no-visual, type:'er' when warranted, fail-safe on provider error (one serial call)`, `ErDefinition/companions/erDefinition fields optional + absent-safe`
  - Fixtures: `ErDefinition fixtures`, `spied/fake assembleShell (ok + non-ok)`, `stub LLMProvider (canned + throwing)`, `temp repo + WorkItemIdentity fixtures`
- **unit** — Prove the per-type registry + thin dispatcher + conditional wiring (no mega-switch).
  - Subjects: `registerDiagramHandler/diagramHandlerFor: S003 registers 'er'; duplicate throws DuplicateDiagramHandlerError`, `judgeDiagram dispatches the ER companion to the 'er' handler (spy) + aggregates; an unregistered type yields a LOW observation`, `effectiveJudges/expectedDimensions/buildJudgementsSchema include 'diagram' iff hasDiagramReferences; validateArtifact accepts ran==expected, rejects drift`
  - Fixtures: `fresh registry with the 'er' handler`, `CodeReviewSubject fixtures with/without erDefinition`
- **integration** — Prove the dimension rides the existing verdict + gate end-to-end (un-forked).
  - Subjects: `runCodeReview over a valid-erDefinition subject folds a DimensionResult{diagram} into the verdict (pass)`, `an invalid/inconsistent erDefinition folds to block + enforceCodeReviewGate withholds under enforce=true, advisory-warn under false`, `a no-ER subject runs base dimensions; CR record byte-shape-compatible with pre-S003`, `boot asset-check fails loudly when the vendored metamodel schema is absent`
  - Fixtures: `temp repo with an approved HLD/LLD body carrying/omitting an erDefinition`, `stub grounding assembler`, `codeReview.enforce true/false fixtures`, `a temp assets dir missing the metamodel schema`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: assessDiagramNeed empty for no-visual + type:'er' when warranted`, `unit: assessDiagramNeed fail-safe on provider error`, `integration: a no-ER subject omits the companion + the 'diagram' dimension` |
| `ac2` | `unit: resolveCompanionPath sibling of the .md`, `unit: renderErCompanion returns a linked reference; erDefinition stays in-body, companion out-of-body (never inlined)` |
| `ac3` | `unit: validateErDefinition HIGH breach on invalid/dangling/ER<->FR-inconsistent JSON element`, `unit: ER handler flags a referenced-but-absent companion`, `integration: those findings fold to block + enforceCodeReviewGate withholds under enforce=true` |
| `ac4` | `unit: renderErCompanion renders ONLY via assembleShell (local docgen seam) — no generateDocument, no Python, no cloud REST`, `unit: validateErDefinition validates via ajv against the vendored bundled metamodel (no external toolchain)` |

## Migration

**State before:** Per-type renderers emit markdown from the body (S002); the S002 formats declare diagram extension slots (HLD 'diagrams', LLD 'diagramsEr') that nothing fills. Code-review runs the base four + conditional functional-coverage via DEFAULT_JUDGES/effectiveJudges (runner.ts:113-128), folding through computeReviewVerdict/foldVerdict + enforceCodeReviewGate. docgen exposes generateDocument (graph path) AND a SEPARABLE assembleShell render seam (render/shell.ts, imported docgen/index.ts:32); there is NO ER extractor. path-scheme has resolveArtifactMdPath but NO companion helper. HLD/LLD bodies carry no erDefinition/companions. validateAgainstSchema (structured-output.ts:80) is the ajv seam.

**State after:** The artifact body carries an authored erDefinition (LinkML-shaped) as the ER source of truth; a content-gate decides per document whether an ER is warranted; when so, erDefinitionToIr + assembleShell render it into a SIBLING companion referenced by a CompanionArtifactRef the S002 slot links. A new 'diagram' code-review dimension — a thin dispatcher over a per-type registry whose only S003 member is the 'er' handler — validates the erDefinition JSON element and rides the same verdict/enforce gate. Forward-only; code-derived diagrams deferred; UX a peer in S004.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add sc4 CompanionArtifactRef + ErDefinition types (LinkML subset) + additive absent-safe erDefinition?/companions? on HldBody/LldBody. — ↩ rollbackable
2. Vendor the LinkML metamodel JSON Schema asset + wire copy-assets + a boot asset-check. — ↩ rollbackable
3. Add the net-new resolveCompanionPath helper. — ↩ rollbackable
4. Add erDefinitionToIr + renderErCompanion (assembleShell) + assessDiagramNeed; wire generation into the doc path, inert until the gate warrants. — ↩ rollbackable
5. Add validateErDefinition + the DiagramAdherenceHandler registry with the 'er' handler (keyed by type string for later peers). — ↩ rollbackable
6. Extend ReviewDimension with 'diagram', add judgeDiagram + its JudgeSlot, gate via hasDiagramReferences in effectiveJudges AND MCP expectedDimensions/buildJudgementsSchema (lockstep). — ↩ rollbackable
7. Add ER validation/transform/render/content-gate units, registry/dispatcher units, the conditional-dimension test, and the integration + boot-asset-check tests. — ↩ rollbackable

**Backward compat:** No existing public API signature changes: generateDocument, assembleShell, resolveArtifactMdPath, validateAgainstSchema, computeReviewVerdict, enforceCodeReviewGate consumed unchanged; every new symbol is additive. erDefinition?/companions? and the 'diagram' dimension are optional/conditional, so pre-S003 artifacts render identically and get exactly the base dimensions — no stored artifact migrated or invalidated (k6). The ER generation-source is a refinement of the HLD wording (assembleShell render seam vs the generateDocument graph path), raised as an open question, not a breaking change.

## Alternatives considered

### a1: Authored LinkML erDefinition body element + deterministic Mermaid render via assembleShell + per-type registry — **CHOSEN**

The erDefinition is a LinkML-metamodel-shaped structured element in the artifact body (source of truth); a deterministic transform renders it to a Mermaid ER companion via docgen's assembleShell; the ER adherence handler (a peer in the per-type registry) validates the JSON element, never the rendered doc.

The chosen design (see contract details): erDefinition body element + validateErDefinition (ajv vs vendored LinkML metamodel + referential integrity + FR-consistency) + erDefinitionToIr + assembleShell render + the per-type diagram handler registry (ER handler now) riding the un-forked verdict/gate.

### a2: Full LinkML toolchain at runtime (Python generators)

Shell out to LinkML's Python generators to validate + render.

Author the erDefinition as LinkML and invoke the official generators as a subprocess for the JSON Schema + Mermaid outputs.

**Rejected because:** s3 ac4='violates' — a Python/LinkML runtime dependency breaks k5 (local-first). Rank 3.

### a3: Bespoke minimal ER schema (not LinkML)

A hand-rolled ER JSON instead of the LinkML metamodel.

A compact custom ER body element + its own JSON Schema, same render/validate/registry wiring as a1.

**Rejected because:** Sound and passes every AC/contract, but forgoes the stakeholder's explicit LinkML choice. Rank 2.

### a4: Keep ER code-derived via docgen type-structure (superseded prior design)

Generate the ER from the code graph via docgen type-structure and validate the rendered companion.

Map ER->type-structure, call generateDocument, validate the rendered companion.

**Rejected because:** s3 ac3='violates' — validates the doc not the JSON element and cannot model a designed data model. Rank 4.

## Open questions

- ER generation-source refinement vs the HLD: the HLD framework summary says diagrams are 'produced through the existing docgen generateDocument seam,' but ER is now produced by reusing docgen's assembleShell RENDER seam from the authored erDefinition (NOT the generateDocument graph-extractor path). assembleShell is itself a docgen seam, so this is a wording refinement, not a new external surface. No structural amendment type fits a framework-summary wording change. Confirm the refinement (recommended) or back-flow the HLD framework summary to say 'produced through the existing docgen seams — assembleShell render for authored diagrams, generateDocument for code-derived.'
- Scope confirmation (recorded, not blocking): S003 implements the authored-structured-companion model for ER only + establishes the reusable mechanism; UX schema (Adaptive Cards vs JSON Forms) is decided + wired by S004 as a peer handler; code-derived sequence/component diagrams are deferred to a later story.

## Resolved questions

- `q0b479f8b` — ER generation-source refinement vs the HLD: the HLD framework summary says diagrams are 'produced through the existing docgen generateDocument seam,' but ER is now produced by reusing docgen's assembleShell RENDER seam from the authored erDefinition (NOT the generateDocument graph-extractor path). assembleShell is itself a docgen seam, so this is a wording refinement, not a new external surface. No structural amendment type fits a framework-summary wording change. Confirm the refinement (recommended) or back-flow the HLD framework summary to say 'produced through the existing docgen seams — assembleShell render for authored diagrams, generateDocument for code-derived.'
  - **resolved**: Confirm the refinement in the LLD (no HLD change) — User accepted the ER generation-source shift as a wording note (2026-09-28): assembleShell is itself a docgen seam, so no new external surface and no structural amendment type applies; the LLD carries the precision. Do NOT back-flow the HLD. _(2026-09-28T06:48:34.593Z)_
- `qbf10bc29` — Scope confirmation (recorded, not blocking): S003 implements the authored-structured-companion model for ER only + establishes the reusable mechanism; UX schema (Adaptive Cards vs JSON Forms) is decided + wired by S004 as a peer handler; code-derived sequence/component diagrams are deferred to a later story.
  - **resolved**: Confirm as recorded (ER handler + reusable registry) — Matches the approved S003 LLD boundary + its PASS review: ER handler + reusable per-type registry now; UX schema (Adaptive Cards vs JSON Forms) decided + wired by S004 as a peer; sequence/component deferred. Confirmed by the user's ER-and-UX-for-now / S003-sets-pattern-S004-picks decisions. _(2026-09-28T06:49:06.528Z)_

## Citations

- **[[c1]]** `analyze-bundle` `s1 docgen bundle — generateDocument (src/docgen/index.ts:95) + the SEPARABLE assembleShell render seam (src/docgen/render/shell.ts, imported index.ts:32) + RenderedDocumentShell (types.ts:119); registered docTypes have no ER extractor` — "assembleShell turns a DocumentIR into a self-contained HTML shell; reused for ER without any graph extractor."
- **[[c2]]** `analyze-bundle` `s1 ajv bundle — validateAgainstSchema (src/agent/providers/structured-output.ts:80), Ajv draft 2020-12; used to validate the erDefinition vs a vendored LinkML metamodel schema (no Python)` — "validateAgainstSchema(schema, raw) is the ajv-backed validator reused to validate the erDefinition JSON element."
- **[[c3]]** `analyze-bundle` `s1 dimension-registry bundle — JudgeSlot/DEFAULT_JUDGES (runner.ts:63,113-119) + effectiveJudges (runner.ts:125) + validateArtifact (runner.ts:281-306) + ReviewDimension (types.ts:36)` — "Dimensions are a flat LIST of handler objects; conditional inclusion is a predicate filter; ran-set==expected-set enforced."
- **[[c4]]** `analyze-bundle` `s1 functional-coverage pattern bundle — dimensions/functional-coverage.ts (judge:141, schema:54, hasFunctionalDefinition:89) + functional-coverage-conditional.test.ts` — "The 4-point conditional-dimension wiring the diagram dimension mirrors, one serial provider call under withStructuredRetry."
- **[[c5]]** `analyze-bundle` `s1 path-scheme bundle — resolveArtifactMdPath (path-scheme.ts:119), STORY_SCOPED (:68); NO companion/sibling helper exists` — "There is no existing helper for a sibling/companion file next to the .md — sc4's scheme is net-new."
- **[[c6]]** `analyze-bundle` `s1 verdict/gate bundle — computeReviewVerdict (review/review.ts:110), foldVerdict (runner.ts:232), codeReview.enforce (config-catalog.ts:90), enforceCodeReviewGate (gate.ts:66)` — "The shared reducer + enforce gate the diagram findings ride without forking."
- **[[c8]]** `prior-artifact` `HLD-c5824e17eccf0c14 sc4 Companion-artifact reference (ownedByStory s3, consumedByStories s4) + assumption c8` — "The single contract for referencing an out-of-body companion file, including its on-disk path scheme."
