<!-- insrc:artifact LLD-c5824e17eccf0c14-s4 -->

# LLD: E20260928c5824e17:S004

**Epic:** `make-workflow-framework-s-generated-artifact`
**HLD base run:** `wf-1790520092322-vpqvrh`
**HLD effective hash:** `a28e2f107661...`

## HLD context

**Framework:** Adopt a1: the artifact JSON body is the single source of truth for the new content, the existing per-type renderers are enriched to generate human-readable, audience-aware markdown from that structured body, and the three new adherence checks (functional-coverage, diagram, UX) are added as code-review dimensions that ride the existing computeReviewVerdict / codeReview.enforce completion gate without forking the verdict reducer. Diagrams and UX mocks are content-gated companion artifacts referenced from — never inlined into — the core markdown, produced through the existing docgen generateDocument seam. The four forward-only Stories layer cleanly: S001 introduces the functional-definition record + its coverage dimension; S002 makes every document navigable, audience-aware, and de-duplicated; S003 adds content-gated diagram companions; S004 unifies the selectable adherence dimensions and the UX-acceptance check.
**Rollout phase:** Phase D — UX integration + unified adherence
**Consumes:** `sc1` (FunctionalDefinition record (artifact body)), `sc2` (functional-coverage review dimension), `sc3` (Document-structure + shared-context reference model), `sc4` (Companion-artifact reference)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Private to S001: the exact FR-id sequence-numbering/assignment scheme and its stability guarantee, the internal shape and validation of the FunctionalDefinition body extension, how the functional-definition prose is generated from the record, and the provider prompt/schema by which the functional-coverage dimension judges genuine realization. None of these internals are consumed by other Stories — they only see the sc1 record shape and the sc2 dimension result. — owns `sc1`, `sc2`
- `s2`: Private to S002: the concrete per-type section layouts and renderer formatting that turn the structure into navigable markdown, the audience-tailoring rules that gear the DEF to a business/product reader, and the diffing/resolution that replaces verbatim upstream copy with a SharedContextRef. Other Stories consume only the DocumentStructure/section contract, not these formatting internals. — owns `sc3`
- `s3`: Private to S003: the per-document assessment that decides whether a diagram materially aids understanding, the selection of docgen docType and the generateDocument invocation that produces the Mermaid/HTML companion, and the diagram-adherence dimension's check that a referenced diagram is present and consistent with the design. S004 consumes only the companion-reference contract (sc4), not the diagram-generation internals. — owns `sc4`

## Contract details

**Surface level:** internal

### `validateUxDefinition (new UX companion peer, mirrors validateErDefinition)`

```typescript
function validateUxDefinition(uxDef: unknown, fnDef?: FunctionalDefinition): readonly DimensionFinding[]
```

**Parameters:**
- `uxDef: unknown` — The authored uxDefinition body element (an Adaptive Cards card subset) pre-validation.
- `fnDef: FunctionalDefinition | undefined` _(optional)_ — Optional functional-definition for cross-consistency (sc1), as validateErDefinition takes it.

**Returns:** `readonly DimensionFinding[]` — Review findings from validating the authored uxDefinition against the vendored Adaptive Cards JSON schema (via the shared ajv validateAgainstSchema) + structural consistency. HIGH breach on schema-invalid; observations otherwise. Mirrors validateErDefinition (companion/er.ts:102).

**Errors:**
- `UxDefinitionError (mirrors ErDefinitionError)` when the vendored Adaptive Cards schema asset is unloadable/malformed — a boot-time / load fault, not authored-content

**Preconditions:**
- The vendored Adaptive Cards JSON schema asset is present under src/assets/artifacts/schemas/ (like linkml-metamodel.schema.json)

**Postconditions:**
- A schema-invalid uxDefinition yields a HIGH DimensionFinding; the companion is NOT rendered from an invalid definition (mirrors S003)

### `uxDefinitionToIr + renderUxCompanion (new UX companion peers, mirror erDefinitionToIr + renderErCompanion)`

```typescript
function uxDefinitionToIr(uxDef: UxDefinition): DocumentIR
function renderUxCompanion(uxDef: UxDefinition, title: string, destPath: string, opts?: RenderUxCompanionOpts): Promise<CompanionArtifactRef>
```

**Parameters:**
- `uxDef: UxDefinition` — The validated Adaptive Cards subset element.
- `destPath: string` — The sibling companion path resolved via the existing path-scheme (resolveCompanionPath).

**Returns:** `Promise<CompanionArtifactRef>` — Deterministically renders the uxDefinition to an HTML ux-mock companion via the existing docgen assembleShell (as renderErCompanion does), returning a CompanionArtifactRef { kind:'ux-mock', relPath, title, ofSectionId? } — the sc4 contract reused unchanged.

**Errors:**
- `DiagramGenerationError (reused from render.ts)` when assembleShell fails — the uxDefinition stays validated in-body without a picture (mirrors S003)

**Preconditions:**
- uxDef passed validateUxDefinition with no HIGH finding

**Postconditions:**
- An HTML ux-mock sibling file is written; a CompanionArtifactRef (kind:'ux-mock') is returned to link from the core markdown (never inlined) — ac1/k1

### `renderUxCompanionForBody (new finalize seam, peer of renderErCompanionForBody)`

```typescript
function renderUxCompanionForBody(body: { readonly uxDefinition?: UxDefinition | undefined; readonly functionalDefinition?: FunctionalDefinition | undefined }, destPath: string, repoPath: string): Promise<CompanionArtifactRef | undefined>
```

**Parameters:**
- `body: { uxDefinition?; functionalDefinition? }` — The artifact body; optional uxDefinition is the CONTENT GATE (undefined → undefined return, no companion).

**Returns:** `Promise<CompanionArtifactRef | undefined>` — The finalize/body path: validate → skip-on-HIGH → renderUxCompanion → attach the ux-mock ref, mirroring renderErCompanionForBody (orchestrator.ts:1498). Wired alongside renderErCompanionForBody in the same finalize seam so a document can carry both an ER diagram and a UX mock.

**Preconditions:**
- Called from the finalize seam that already invokes renderErCompanionForBody

**Postconditions:**
- absent uxDefinition → undefined → no companion, byte-identical (content-gated, k3-style); present+valid → a linked ux-mock companion

### `expectedDimensions (existing, reshaped — add the 'ux' conditional push + read the recorded adherence selection)`

```typescript
function expectedDimensions(subject: CodeReviewSubject): readonly ReviewDimension[]
```

**Parameters:**
- `subject: CodeReviewSubject` — The review subject whose body carries the recorded adherence selection + uxDefinition.

**Returns:** `readonly ReviewDimension[]` — The base four + the conditional dimensions. S004 adds, after the diagram push (handler.ts:68), `if (hasUxAcceptance(subject)) dims.push('ux')` AND unions the body's explicitly recorded adherence selection so a selected-but-content-derivable dimension is enforced. hasUxAcceptance reads the recorded adherence selection (includes 'ux') / a uxDefinition presence.

**Preconditions:**
- ReviewDimension union (types.ts:36) widened with 'ux'; DEFAULT_JUDGES (runner.ts) carries a matching 'ux' JudgeSlot in lock-step (handler.ts:57-58)

**Postconditions:**
- 'ux' is present exactly when the work item requires UX; buildJudgementsSchema (handler.ts:128) then admits 'ux' in the judgements[].dimension enum; the ux judge's findings ride computeReviewVerdict un-forked (ac2/k4)

### `hasDiagramReferences (existing, verified — must exclude ux-mock)`

```typescript
function hasDiagramReferences(subject: CodeReviewSubject): boolean
```

**Parameters:**
- `subject: CodeReviewSubject` — The gate predicate for the 'diagram' dimension.

**Returns:** `boolean` — Must count ONLY diagram-* companion kinds, NOT 'ux-mock' — so a UX-only document triggers the first-class 'ux' dimension (via hasUxAcceptance), not 'diagram'. S004 VERIFIES/adjusts this predicate (index.ts:51-55) to filter kind to diagram-mermaid|diagram-html. (The registry's index.ts:59 ux-mock→'ux' key mapping is for the diagram-dimension path and is NOT used here since UX is first-class.)

**Postconditions:**
- a ux-mock-only subject → hasDiagramReferences false, hasUxAcceptance true

## Data model changes

### `src/workflow/artifacts/companion/ (UX peer files)` — new

New peer files mirroring the ER set: a UxDefinition type (Adaptive Cards card subset) + validateUxDefinition + uxDefinitionToIr in ux.ts; ux-schema.ts (UX_DEFINITION_PROPERTY_SCHEMA + UX_CONTENT_GATE_RULE); renderUxCompanion in render.ts (or ux-render.ts); a vendored Adaptive Cards JSON-schema asset at src/assets/artifacts/schemas/adaptive-cards.schema.json (no $schema meta-URI, per the shared draft-07 ajv, like linkml-metamodel.schema.json); a boot-time asset validator like validateLinkmlMetamodelAsset. CompanionArtifactRef/CompanionKind reused UNCHANGED (ux-mock already in the union).

```
interface UxDefinition { /* Adaptive Cards subset: type:'AdaptiveCard', version, body: elements[] */ }
```

**Call sites:**
- `src/workflow/artifacts/companion/er.ts:51`
- `src/workflow/artifacts/companion/render.ts:59`
- `src/workflow/orchestrator.ts:1498`

### `artifact body (HLD/LLD bodies) — uxDefinition? + adherence?` — field-add

Two additive optional body fields: `uxDefinition?: UxDefinition` (the authored Adaptive Cards element, content gate for the ux-mock companion) and `adherence?: { readonly dimensions: readonly AdherenceDimension[] }` (the explicit recorded selectable set; AdherenceDimension = 'ux'|'diagram-er'|'diagram-sequence'|'diagram-component'|'functional-coverage'). Both admit-but-never-emit in the synthesizer body schemas (uxDefinition content-gated like erDefinition; adherence author-selectable). Absent-safe, forward-only (k6). The 'ux' doc-format extension section already exists (formats.ts:87).

```
+ readonly uxDefinition?: UxDefinition | undefined;
+ readonly adherence?: { readonly dimensions: readonly AdherenceDimension[] } | undefined;
```

**Call sites:**
- `src/workflow/artifacts/format/formats.ts:87`
- `src/workflow/orchestrator.ts:1498`

### `ReviewDimension union (types.ts:36) + DEFAULT_JUDGES (runner.ts) + buildJudgementsSchema` — field-add

Add the 'ux' literal to the ReviewDimension union (src/workflow/code-review/types.ts:36). Add a matching 'ux' JudgeSlot to DEFAULT_JUDGES in runner.ts (LOCK-STEP with the handler list per handler.ts:57-58 — locate the DEFAULT_JUDGES site first). buildJudgementsSchema (handler.ts:128-166) already builds from the computed dims, so widening the union + the expectedDimensions push widens the emitted schema; the multiselect adherence enum on the body is validated against the same AdherenceDimension set.

```
type ReviewDimension = ... | 'ux';  // + DEFAULT_JUDGES gains a { dimension:'ux', judge: judgeUx } slot
```

**Call sites:**
- `src/workflow/code-review/types.ts:36`
- `src/workflow/code-review/runner.ts:64`
- `src/mcp/code-review-step/handler.ts:61`

### `UX review dimension judge + hasUxAcceptance gate` — new

A new first-class 'ux' dimension judge (a dimensions/ux/ module, or a judgeUx alongside functional-coverage) that judges the built experience against the referenced ux-mock companion + the authored uxDefinition, reporting DimensionFinding{ dimension:'ux' } (mirrors the S003 'diagram' shape but its OWN literal). A hasUxAcceptance(subject):boolean gate predicate (mirrors hasFunctionalDefinition/hasDiagramReferences) reads the recorded adherence selection (includes 'ux') / uxDefinition presence. Wired into expectedDimensions + DEFAULT_JUDGES + effectiveJudges exactly as functional-coverage/diagram were.

```
function judgeUx(subject, grounding, provider): Promise<DimensionResult>  // dimension:'ux'
function hasUxAcceptance(subject: CodeReviewSubject): boolean
```

**Call sites:**
- `src/workflow/code-review/dimensions/diagram/index.ts:68`
- `src/mcp/code-review-step/handler.ts:65`
- `src/workflow/code-review/runner.ts:127`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | Consumes FunctionalDefinition unchanged — 'functional-coverage' is one member of the AdherenceDimension set the recorded selection can require; validateUxDefinition optionally takes fnDef for consistency (as validateErDefinition does). |
| `sc2` | consumes | Reuses the functional-coverage dimension inside the unified selectable adherence set; the ux dimension is added alongside it and both ride computeReviewVerdict un-forked (k4). No change to the functional-coverage judge. |
| `sc3` | consumes | Uses the DocumentStructure + the already-declared 'ux' extension section (formats.ts:87) to place the UX section that describes the intended experience and links the ux-mock companion (ac1). |
| `sc4` | consumes | Reuses CompanionArtifactRef/CompanionKind UNCHANGED — the ux mock is a kind:'ux-mock' companion (already in the union) linked from the markdown, rendered via the same assembleShell path-scheme seam as an S003 diagram; renderUxCompanionForBody is the finalize peer of renderErCompanionForBody. NOTE: hasDiagramReferences is verified to EXCLUDE ux-mock so a UX doc triggers the first-class 'ux' dimension, not 'diagram'. |

## Error paths

### Error cases

- **The authored uxDefinition body element does not conform to the vendored Adaptive Cards card subset (unknown element type, missing required field, wrong shape).** (recoverable)
  - Detection: validateUxDefinition runs the shared ajv validator against the vendored adaptive-cards.schema.json and the compiled validate() returns false with ajv errors (the same seam validateErDefinition uses).
  - Response: Emit a HIGH DimensionFinding describing the schema breach and DO NOT render the ux-mock companion from the invalid definition; the uxDefinition stays in-body for the author to correct.
  - User impact: The design shows a UX-adherence HIGH finding (which withholds completion via the existing gate) rather than shipping a broken/misleading mock; the author sees exactly which card field is wrong.
- **renderUxCompanion's docgen assembleShell call fails while turning a VALID uxDefinition into the HTML ux-mock file (I/O, docgen internal error).** (recoverable)
  - Detection: renderUxCompanion awaits assembleShell inside a try/catch and catches the thrown DiagramGenerationError (mirroring renderErCompanion's failure handling in render.ts).
  - Response: Swallow to a no-companion outcome: renderUxCompanionForBody returns undefined so no CompanionArtifactRef is attached; the validated uxDefinition remains in the body. The document is still produced (never aborted on a companion-render failure).
  - User impact: The document generates without the UX picture but keeps the validated UX definition; the reviewer loses the rendered mock but not the design intent, and generation does not fail.
- **The recorded adherence selection includes 'ux' (or the item is flagged uxAcceptance-required) but the artifact carries NO uxDefinition / no ux-mock companion to judge against.** (recoverable)
  - Detection: expectedDimensions computes 'ux' from the recorded selection (hasUxAcceptance true), the judgeUx dimension judge is invoked, and it finds no ux-mock CompanionArtifactRef + no uxDefinition on the subject.
  - Response: The ux judge emits a HIGH finding ('UX acceptance required but no UX design/mock present'); the finding folds through the existing computeReviewVerdict and the block-verdict withholds completion via codeReview.enforce.
  - User impact: A work item declared to have a user-facing experience cannot be completed until the intended experience is actually captured — exactly the enforcement ac2/ac3 ask for.
- **The 'ux' dimension is present in one lock-step list but not the other (e.g. added to expectedDimensions/buildJudgementsSchema but the runner's DEFAULT_JUDGES has no matching 'ux' JudgeSlot, or vice-versa).** (recoverable)
  - Detection: The handler's existing emitted-judgements validation (handler.ts:523) checks the returned judgements[].dimension set against expectedDimensions, and effectiveJudges (runner.ts:127) reconciles slots against the computed dims — a drift surfaces as a missing/unknown-dimension validation error (the negative table handler.test.ts:208-212 already covers).
  - Response: Fail fast at review-setup with the existing 'missing/unknown dimension' error rather than silently skipping the UX check; the lock-step comment (handler.ts:57-58) is honoured by adding 'ux' to BOTH the union/handler side and DEFAULT_JUDGES in the same change.
  - User impact: A wiring mistake is caught by the existing dimension-seam guard at setup, not by a UX check that silently never runs — the enforcement guarantee cannot be quietly lost.

### Edge cases

| Input | Expected |
| :--- | :--- |
| An artifact with neither a uxDefinition nor an adherence selection (the overwhelmingly common pre-existing document). | hasUxAcceptance returns false, no 'ux' dimension is added, no ux-mock companion is rendered, and the markdown renders byte-identical to today (additive optional fields absent → omit-slot). |
| A document that carries BOTH an authored erDefinition (S003) and an authored uxDefinition (S004). | Both companions render as sibling files with their own refs; hasDiagramReferences is true (er) so 'diagram' is added AND hasUxAcceptance is true so 'ux' is added — the two dimensions are independent and both fold through the one verdict reducer un-forked. |
| A ux-mock CompanionArtifactRef is present but no diagram-* companion ref exists. | hasDiagramReferences returns FALSE (it filters kind to the diagram-* kinds and excludes 'ux-mock'), so the 'diagram' dimension is NOT spuriously added; the UX evidence is judged only by the first-class 'ux' dimension. |
| An adherence selection whose dimensions array is empty ([]), with a uxDefinition present. | expectedDimensions unions the (empty) recorded selection with the content-derived gates; the present uxDefinition still makes hasUxAcceptance true, so 'ux' is enforced from content even though the explicit selection listed nothing. |
| An adherence selection that lists a dimension whose triggering content is absent (e.g. selects 'diagram-er' but the body has no erDefinition). | The recorded selection is authoritative for what must be enforced: expectedDimensions unions it in, so the dimension is expected and its judge reports a HIGH 'declared adherence but no artifact to judge' finding — a recorded expectation is never silently dropped just because the content gate did not also fire. |

### Invariants to preserve

- The review verdict reducer (computeReviewVerdict / effectiveReviewVerdict) is NEVER forked: the new 'ux' dimension contributes DimensionFindings that fold through the SAME reducer and the SAME codeReview.enforce completion gate as adherence/conventions/coverage/quality/functional-coverage/diagram, so UX enforcement rides the existing block-verdict path (per the s1 handler.ts:65-70/523 + runner.ts:127-135 structural map showing conditional dimensions added via guarded pushes with no reducer change). [[c4]]
- Companion content (the ux mock, like the S003 diagram) is REFERENCED via a CompanionArtifactRef sibling file and never inlined into the core markdown; the reusable sc4 CompanionKind/CompanionArtifactRef vocabulary ('ux-mock' already in the union) and its on-disk path-scheme are consumed UNCHANGED (per the s1 companion/types.ts + render.ts structural map). [[c8]]
- The structured artifact JSON body stays the single source of truth and the additive optional fields (uxDefinition, adherence) are absent-safe and forward-only: an artifact without them renders byte-identical and no on-disk migration occurs, exactly as the S001 functionalDefinition / S003 erDefinition body extensions do (per the s1 structural map showing the admit-but-never-emit synthesizer-schema + omit-slot renderer pattern already shipped four times). [[c2]]

## Test strategy

**Test framework:** `node:test (tsx --test), the repo-wide convention — colocated __tests__/*.test.ts run via `npx tsx --test`; live/provider suites gate behind INSRC_LIVE_TESTS and skip when unset.`

### Test levels

- **unit** — Prove the new UX companion peer (validate/toIr/render) and the schema/gate helpers behave like their S003 ER analogues: schema-valid vs schema-invalid uxDefinition, content-gate absence, and the assembleShell-failure swallow.
  - Subjects: `validateUxDefinition — schema-valid uxDefinition yields no HIGH finding; schema-invalid (unknown card element / missing required field) yields a HIGH DimensionFinding; malformed vendored asset raises UxDefinitionError`, `uxDefinitionToIr — a valid UxDefinition maps to the expected DocumentIR shape`, `renderUxCompanion / renderUxCompanionForBody — present+valid uxDefinition returns a kind:'ux-mock' CompanionArtifactRef; absent uxDefinition returns undefined (content gate); a stubbed assembleShell throw is caught and yields undefined (document still produced)`, `ux-schema.ts — UX_DEFINITION_PROPERTY_SCHEMA compiles under the shared ajv and the vendored adaptive-cards.schema.json asset loads (boot-time asset validator)`, `hasUxAcceptance(subject) — true when the recorded adherence selection includes 'ux' OR a uxDefinition is present; false otherwise`, `hasDiagramReferences(subject) — VERIFY it returns false for a ux-mock-only subject (excludes 'ux-mock', counts only diagram-* kinds)`, `judgeUx — emits dimension:'ux' findings; HIGH when uxAcceptance is required but no uxDefinition/ux-mock evidence is present`
  - Fixtures: `a valid Adaptive Cards subset uxDefinition literal`, `an invalid uxDefinition literal (unknown element type)`, `a subject with a ux-mock CompanionArtifactRef and no diagram-* ref`, `a subject with both an erDefinition and a uxDefinition`, `a stub assembleShell that throws`
- **unit** — Prove the additive optional body fields (uxDefinition, adherence) are absent-safe and forward-only across the four doc bodies + BuildRecord, and that the synthesizer body schemas admit-but-never-emit them (the four-times-shipped omit-slot pattern).
  - Subjects: `body field-add — a body without uxDefinition/adherence renders byte-identical to the pre-S004 output (omit-slot); with them present the UX section + companion link appear`, `synthesizer body schemas — additionalProperties:false preserved; uxDefinition/adherence admitted in the schema but never emitted by the synth`, `formats.ts — the already-declared 'ux' extension section (formats.ts:87) carries the UX section/mock reference; formats.test.ts extension-section assertion stays green`, `AdherenceDimension enum — the multiselect enum validates the recorded selection against 'ux'|'diagram-er'|'diagram-sequence'|'diagram-component'|'functional-coverage'`
  - Fixtures: `a doc body JSON with and without the uxDefinition/adherence fields`
- **unit** — Prove the ReviewDimension union + expectedDimensions + buildJudgementsSchema + runner DEFAULT_JUDGES stay lock-step with the first-class 'ux' dimension conditionally gated, and that a selected-but-uncontented dimension is still enforced.
  - Subjects: `expectedDimensions — pushes 'ux' when hasUxAcceptance(subject); UNIONS the body's recorded adherence selection with the content-derived gates; base four unchanged when neither fires`, `buildJudgementsSchema — admits 'ux' in the judgements[].dimension enum exactly when 'ux' is in the computed dims`, `runner DEFAULT_JUDGES / effectiveJudges — carries a 'ux' JudgeSlot; order pinned (extend runner.test.ts:273 pinned order to include 'ux' at its slot); a drift (dim present one side, absent the other) surfaces via the emitted-judgements validation (handler.test.ts negative table)`, `verdict fold — a HIGH 'ux' finding withholds completion via computeReviewVerdict + codeReview.enforce WITHOUT forking the reducer (adherence/conventions/coverage/quality/functional-coverage/diagram/ux all fold identically)`
  - Fixtures: `a subject flagged uxAcceptance-required`, `a subject with an adherence selection listing 'diagram-er' but no erDefinition (declared-but-uncontented)`, `a judgements payload with a UX HIGH finding`
- **integration** — Prove end-to-end that a generated design document with a user-facing experience references its mock + describes the intended experience, and that the completion gate blocks on a failing UX check — across the orchestrator finalize seam and the code-review handler.
  - Subjects: `orchestrator finalize — a body with a valid uxDefinition produces a sibling ux-mock HTML companion AND a link + UX section in the core markdown (never inlined); renderUxCompanionForBody runs alongside renderErCompanionForBody so a doc with both an ER and a UX definition emits both companions`, `code-review handler — a subject requiring uxAcceptance with an adhering build passes; with a missing/mismatched UX design the ux dimension blocks completion; a subject with neither uxDefinition nor adherence yields the base four dimensions and byte-identical behaviour`
  - Fixtures: `a temp artifact dir with a doc body carrying a uxDefinition`, `a CodeReviewSubject fixture with a recorded adherence selection including 'ux'`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `renderUxCompanion / renderUxCompanionForBody — present+valid uxDefinition returns a kind:'ux-mock' CompanionArtifactRef`, `orchestrator finalize — a body with a valid uxDefinition produces a sibling ux-mock HTML companion AND a link + UX section in the core markdown (never inlined)`, `body field-add — with uxDefinition/adherence present the UX section + companion link appear` |
| `ac2` | `judgeUx — HIGH when uxAcceptance is required but no uxDefinition/ux-mock evidence is present`, `verdict fold — a HIGH 'ux' finding withholds completion via computeReviewVerdict + codeReview.enforce WITHOUT forking the reducer`, `code-review handler — a subject requiring uxAcceptance with a missing/mismatched UX design blocks completion; an adhering build passes` |
| `ac3` | `AdherenceDimension enum — the multiselect enum validates the recorded selection against 'ux'|'diagram-er'|'diagram-sequence'|'diagram-component'|'functional-coverage'`, `expectedDimensions — UNIONS the body's recorded adherence selection with the content-derived gates`, `runner DEFAULT_JUDGES / effectiveJudges — a selected-but-uncontented dimension is still expected and enforced (declared-but-uncontented fixture)` |

## Migration

**State before:** Today the code-review dimension set is the base four plus two content-gated conditionals: expectedDimensions (handler.ts:65-70) pushes 'functional-coverage' when hasFunctionalDefinition (S001) and 'diagram' when hasDiagramReferences (S003), and the runner DEFAULT_JUDGES (runner.ts, lock-step with handler.ts:57-58; order pinned in runner.test.ts:273 as ['adherence','conventions','coverage','quality','functional-coverage','diagram']) carries a matching slot for each. There is NO 'ux' ReviewDimension literal in the union (types.ts:36) and NO 'uxAcceptance' / adherence-selection identifier anywhere in the tree. The companion module (companion/types.ts:24) already declares the 'ux-mock' CompanionKind and CompanionArtifactRef, and the diagram registry (dimensions/diagram/index.ts:59) already maps a ux-mock ref to a 'ux' handler key, but no UX companion authoring path exists: there is no uxDefinition body element, no ux-schema.ts, no vendored Adaptive Cards asset, no validateUxDefinition/uxDefinitionToIr/renderUxCompanion, and no renderUxCompanionForBody finalize seam (only renderErCompanionForBody at orchestrator.ts:1498-1521). The 'ux' doc-format extension section already exists (formats.ts:87; formats.test.ts:53 asserts LLD extension sections === ['diagramsEr','ux']). Every existing artifact body validates and renders with none of these fields present.

**State after:** The artifact body carries two additive optional fields — uxDefinition (an Adaptive Cards card subset, content gate for a kind:'ux-mock' companion) and adherence.dimensions (the explicit recorded selectable set over AdherenceDimension = 'ux'|'diagram-er'|'diagram-sequence'|'diagram-component'|'functional-coverage'). A new UX companion authoring path (ux.ts + ux-schema.ts + vendored adaptive-cards.schema.json + validateUxDefinition/uxDefinitionToIr/renderUxCompanion + a renderUxCompanionForBody finalize seam beside renderErCompanionForBody) renders the mock as a linked sibling HTML file, never inlined. 'ux' is a first-class ReviewDimension: expectedDimensions pushes it when hasUxAcceptance(subject) and additionally unions the body's recorded adherence selection with the content-derived gates; a judgeUx judge reports dimension:'ux' and its findings fold through the unchanged computeReviewVerdict + codeReview.enforce gate; DEFAULT_JUDGES gains a matching 'ux' slot. An artifact carrying none of the new fields behaves byte-identically to before.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the two optional body fields (uxDefinition?, adherence?) to the artifact body interfaces and admit-but-never-emit them in the synthesizer body schemas (additionalProperties:false preserved). Add nullable/optional only — no existing body is required to carry them. — ↩ rollbackable
2. Vendor the Adaptive Cards JSON-schema asset under src/assets/artifacts/schemas/ and add a boot-time asset validator (mirroring the LinkML-metamodel validator); add ux-schema.ts (UX_DEFINITION_PROPERTY_SCHEMA + UX_CONTENT_GATE_RULE) and the UX companion authoring functions (validateUxDefinition, uxDefinitionToIr, renderUxCompanion). Purely additive new files. — ↩ rollbackable
3. Wire the renderUxCompanionForBody finalize seam alongside renderErCompanionForBody so a present+valid uxDefinition renders a linked ux-mock companion and an absent one returns undefined (content gate = no companion, byte-identical render). — ↩ rollbackable
4. Verify/adjust hasDiagramReferences to exclude the 'ux-mock' kind (count only diagram-* kinds) so a UX-only document does not spuriously trigger the 'diagram' dimension. — ↩ rollbackable
5. Add the 'ux' literal to the ReviewDimension union and add the judgeUx dimension judge + hasUxAcceptance gate predicate; add 'ux' to the AdherenceDimension enum used to validate the recorded selection. — ↩ rollbackable
6. In the SAME change, extend expectedDimensions to push 'ux' when hasUxAcceptance and to union the recorded adherence selection, and add the matching 'ux' JudgeSlot to the runner DEFAULT_JUDGES (lock-step) — both sides flipped together so the emitted-judgements validation never sees a one-sided drift. Update the runner.test.ts pinned-order expectation to include 'ux' at its slot. — ↩ rollbackable

**Backward compat:** No existing PUBLIC API signature changes: validateUxDefinition/renderUxCompanion/judgeUx/hasUxAcceptance are new symbols, and the two body fields are additive optionals. The one behaviour-adjacent surface is expectedDimensions/hasDiagramReferences (internal to the code-review flow): a subject with none of the new fields yields exactly the prior dimension set, so existing callers and existing artifacts are unaffected. hasDiagramReferences is only tightened to exclude 'ux-mock' (a kind no prior artifact carried), so no previously-'diagram'-triggering subject changes classification. The runner order literal grows by one entry ('ux' appended), matched in lock-step so the emitted-judgements guard stays consistent.

## Alternatives considered

### a1: Explicit adherence selection on the artifact body + first-class ux dimension + Adaptive Cards ux-mock companion — **CHOSEN**

Record an explicit selectable AdherenceSelection on the artifact body; add a first-class 'ux' ReviewDimension gated by uxAcceptance; author a uxDefinition (Adaptive Cards subset) body element validated against a vendored Adaptive Cards JSON schema and rendered as an HTML ux-mock companion — mirroring S003's ER pattern.

THREE layered pieces, all body-is-source-of-truth (epic a1/k1). (1) UX companion peer, mirroring S003's ER pattern in src/workflow/artifacts/companion/: a `uxDefinition?` body element authored as an Adaptive Cards card subset; ux-schema.ts (UX_DEFINITION_PROPERTY_SCHEMA + UX_CONTENT_GATE_RULE), a vendored Adaptive Cards JSON-schema asset validated via the shared ajv (validateAgainstSchema), validateUxDefinition (schema + consistency → DimensionFinding[]), uxDefinitionToIr → renderUxCompanion via assembleShell → an HTML ux-mock CompanionArtifactRef (kind:'ux-mock', already in the sc4 union), wired into a renderUxCompanionForBody finalize seam alongside renderErCompanionForBody. The 'ux' doc-format extension section already exists (formats.ts:87). (2) First-class 'ux' ReviewDimension: add 'ux' to the ReviewDimension union (types.ts:36), a handlers/ux.ts ux-adherence handler that judges the built experience against the referenced ux-mock (registered like er.ts but reporting dimension:'ux'), and lock-step the runner DEFAULT_JUDGES + handler expectedDimensions/buildJudgementsSchema so 'ux' is a conditional dimension. (3) Explicit, selectable adherence set: a recorded `adherence?: { readonly dimensions: readonly AdherenceDimension[] }` on the artifact body (AdherenceDimension = 'ux'|'diagram-er'|'diagram-sequence'|'diagram-component'|'functional-coverage'), with uxAcceptance = the selection includes 'ux'. expectedDimensions UNIONS the recorded selection with the existing content-derived gates (hasFunctionalDefinition/hasDiagramReferences) so a selected-but-unmet dimension is enforced; the completion check reads the recorded set and each dimension rides the existing computeReviewVerdict fold un-forked (k4). ac3's 'explicit, selectable set ... recorded for a work item' is literal; content-derivation stays the enforced floor.

### a2: Pure content-derivation — no explicit recorded adherence set (ux gate = uxDefinition presence)

Skip the recorded AdherenceSelection; derive every dimension (incl. 'ux') purely from body content as S001/S003 do — a uxDefinition/uxAcceptance flag on the body gates the 'ux' dimension.

Same UX companion peer + first-class 'ux' dimension as a1, but do NOT add a recorded adherence-selection field. Instead follow the exact S001/S003 shape: a `uxAcceptance?: boolean` (or the presence of an authored uxDefinition) on the body drives a `hasUxAcceptance(subject)`-gated push of 'ux' in expectedDimensions, exactly like hasFunctionalDefinition/hasDiagramReferences. The 'selectable set' is then implicit — it is whatever content the document carries (a uxDefinition → ux; an erDefinition → diagram; an FR record → coverage).

**Rejected because:** Smallest surface and identical to the proven S001/S003 pattern, but ac3 partial: the selectable adherence set stays implicit/derived rather than an explicit record the completion check reads — and it cannot require a dimension before its content exists. Loses only on the ac3 clause a1 makes literal.

### a3: Explicit adherence selection on the code-review subject/gate config (not the artifact body)

Record the selectable adherence set in the code-review subject / gate configuration rather than the artifact JSON body; same ux dimension + Adaptive Cards companion.

Same UX companion peer + first-class 'ux' dimension as a1, but the explicit selectable adherence set is recorded on the CodeReviewSubject (or a gate-config row) that expectedDimensions/effectiveJudges read, instead of on the artifact body. The completion check reads the subject's recorded selection; the artifact body carries only the authored uxDefinition + companion reference.

**Rejected because:** Keeps the body minimal but splits adherence provenance out of the artifact JSON — against the epic's body-is-source-of-truth principle (k1) — and makes ac3's 'recorded for a work item' weaker (subject/config, recomputed). ac3 partial + a provenance-split con; loses to a1.

## Citations

- **[[c1]]** `analyze-bundle` `s1 structural-map: diagram-adherence registry (registry.ts/index.ts/handlers/er.ts) + diagram.test.ts`
- **[[c2]]** `analyze-bundle` `s1 structural-map: companion authored-element ER pattern (companion/types.ts/er.ts/render.ts/generate.ts, orchestrator.ts:1498)`
- **[[c3]]** `analyze-bundle` `s1 structural-map: ReviewDimension union + expectedDimensions/buildJudgementsSchema + DEFAULT_JUDGES (types.ts:36, handler.ts, runner.ts, formats.ts:87)`
- **[[c4]]** `prior-artifact` `HLD framework a1 + consumed contracts sc1-sc4 (artifact-docs-readability HLD context slice)`
- **[[c5]]** `stakeholder` `User decisions: UX schema = Adaptive Cards; UX modeling = first-class ux ReviewDimension`
- **[[c6]]** `convention` `node:test (tsx --test) colocated __tests__/*.test.ts; INSRC_LIVE_TESTS-gated live suites`
- **[[c7]]** `step-output` `s3 judgments + winnerId a1; s8 checklist all-passed`
- **[[c8]]** `prior-artifact` `S003 sc4 CompanionArtifactRef/CompanionKind (ux-mock in union) + assembleShell path-scheme`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 14 LOW** · model `client` · reviewed 2026-09-28T14:38:16.997Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| cl1 | citation | LOW | auto | validateErDefinition exists in src/workflow/artifacts/companion/er.ts around line 102 and is the ER-companion validator whose signature the new validateUxDefinition mirrors. | Confirmed: read of src/workflow/artifacts/companion/er.ts:102 returns `export function validateErDefinition(erDef: unknown, fnDef?: FunctionalDefinition): readonly DimensionFinding[]` — the exact signature the new validateUxDefinition mirrors. | No change needed — citation resolves verbatim. |
| cl2 | citation | LOW | auto | renderErCompanionForBody is the finalize/body seam in src/workflow/orchestrator.ts around line 1498, the peer alongside which renderUxCompanionForBody is wired. | Confirmed: read of src/workflow/orchestrator.ts:1498 returns `async function renderErCompanionForBody(` — the finalize/body seam is present at the cited anchor. | No change needed. |
| cl3 | citation | LOW | auto | ReviewDimension is a union type declared in src/workflow/code-review/types.ts around line 36, to which the new 'ux' literal is added. | Confirmed: src/workflow/code-review/types.ts:36 = `export type ReviewDimension = 'adherence' \| 'conventions' \| 'coverage' \| 'quality' \| 'functional-coverage' \| 'diagram';` — the union exists and carries no 'ux' literal yet, exactly as the LLD states. | No change needed. |
| cl4 | closed-union | LOW | auto | The current ReviewDimension set enforced by expectedDimensions is the base four ('adherence','conventions','coverage','quality') plus the two content-gated conditionals 'functional-coverage' and 'diagram'; there is NO 'ux' literal in the tree yet. | Confirmed: handler.ts:61 DIMENSIONS = base four; runner.test.ts:273 pins the full six-entry order incl functional-coverage+diagram; every 'ux' match is in docs only, none in src — the closed union is accurate. | No change needed. |
| cl5 | citation | LOW | auto | expectedDimensions in src/mcp/code-review-step/handler.ts appends conditional dimensions via guarded pushes: hasFunctionalDefinition -> 'functional-coverage' and hasDiagramReferences -> 'diagram' (around lines 65-70). | Confirmed: expectedDimensions is at src/mcp/code-review-step/handler.ts:65 and hasFunctionalDefinition/hasDiagramReferences guarded pushes exist — the conditional-dimension seam the LLD extends. | No change needed. |
| cl6 | citation | LOW | auto | buildJudgementsSchema in src/mcp/code-review-step/handler.ts (around lines 128-166) builds the judgements[].dimension enum from the computed dims, and an emitted-judgements validation (around handler.ts:523) checks returned dimensions against expectedDimensions. | Confirmed via direct grep: buildJudgementsSchema is defined at src/mcp/code-review-step/handler.ts:128 and consumed at :396; the emitted-judgements validation seam is real. | No change needed. |
| cl7 | citation | LOW | auto | The code-review runner (src/workflow/code-review/runner.ts) defines a JudgeSlot-based DEFAULT_JUDGES and effectiveJudges (around runner.ts:127) that must stay lock-step with the handler dimension list. | Confirmed via direct grep: runner.ts defines DEFAULT_JUDGES at :114, effectiveJudges at :127 (drops the conditional last dimension), and DEFAULT_DEPS.judges at :140 — the lock-step seam is exactly as described. | No change needed. |
| cl8 | citation | LOW | auto | runner.test.ts pins the judge/dimension order as ['adherence','conventions','coverage','quality','functional-coverage','diagram'] (around line 273), which S004 extends to include 'ux'. | Confirmed: src/workflow/code-review/__tests__/runner.test.ts:273 asserts DEFAULT_DEPS.judges.map(dimension) === ['adherence','conventions','coverage','quality','functional-coverage','diagram'] — the pinned order S004 must extend with 'ux'. | No change needed — the LLD correctly notes this test must be updated. |
| cl9 | citation | LOW | auto | formats.ts already declares a 'ux' doc-format extension section (heading 'UX', source 'extension') around line 87, named for S004. | Confirmed: src/workflow/artifacts/format/formats.ts:87 = the 'ux' extension section (heading 'UX', source 'extension', contentGuidance names S004) — the doc-format slot already exists. | No change needed. |
| cl10 | semantic | LOW | auto | CompanionKind in src/workflow/artifacts/companion/types.ts already includes the 'ux-mock' literal (with CompanionArtifactRef), so S004 reuses the sc4 companion vocabulary unchanged. | Confirmed via direct grep: src/workflow/artifacts/companion/types.ts:24 = `export type CompanionKind = 'diagram-mermaid' \| 'diagram-html' \| 'ux-mock';` — 'ux-mock' is already in the source union, so sc4 is reused unchanged. | No change needed. |
| cl11 | citation | LOW | auto | The diagram registry index (src/workflow/code-review/dimensions/diagram/index.ts) defines hasDiagramReferences (around lines 51-55) and derives a registry key mapping a ux-mock ref to a 'ux' key (around line 59). | Confirmed and materially important: src/workflow/code-review/dimensions/diagram/index.ts:51 defines hasDiagramReferences, and its body (:53) CURRENTLY includes `c.kind === 'ux-mock'` in the OR — so today a ux-mock ref WOULD trigger 'diagram'. The LLD correctly flags this as a real adjustment (exclude ux-mock) rather than a mis-citation; the :59 unknownTypeOf ux-mock->'ux' mapping is also present. | No change needed — the LLD's 'verify/adjust hasDiagramReferences to exclude ux-mock' is a correctly-scoped, necessary change confirmed by current source. |
| cl12 | citation | LOW | auto | handlers/er.ts self-registers its handler via registerDiagramHandler and reports dimension:'diagram' — the pattern a UX peer/judge mirrors. | Confirmed via direct grep: src/workflow/code-review/dimensions/diagram/handlers/er.ts:26 imports registerDiagramHandler and :88 self-registers erDiagramHandler — the registration pattern a UX peer/judge mirrors. | No change needed. |
| cl13 | cross-artifact | LOW | auto | S004 owns no shared contract (boundary.owns is empty) and consumes sc1/sc2/sc3/sc4, matching the HLD ownedByStory (sc1/sc2->s1, sc3->s2, sc4->s3); no contract owned by an adjacent boundary is re-designed. | Confirmed: the HLD exists (HLD-c5824e17eccf0c14) and the LLD's hldContextSlice is verbatim — boundary.owns is empty and sc1-sc4 are all role:consumes matching ownedByStory (sc1/sc2->s1, sc3->s2, sc4->s3); no adjacent-boundary scope is re-designed. | No change needed — scope discipline holds. |
| cl14 | semantic | LOW | auto | A vendored JSON-schema asset validated by a shared ajv already exists for S003 (linkml-metamodel.schema.json under src/assets/artifacts/schemas/), the pattern the new vendored adaptive-cards.schema.json mirrors. | Confirmed via direct grep/ls: src/assets/artifacts/schemas/linkml-metamodel.schema.json exists and companion/metamodel.ts + er.ts load/validate it — the vendored-schema+shared-ajv pattern the new adaptive-cards.schema.json mirrors is real. | No change needed. |
