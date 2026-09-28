<!-- insrc:artifact LLD-c5824e17eccf0c14-s2 -->

# LLD: E20260927c5824e17:S002

**Epic:** `make-workflow-framework-s-generated-artifact`
**HLD base run:** `wf-1790520092322-vpqvrh`
**HLD effective hash:** `a28e2f107661...`

## HLD context

**Framework:** Adopt a1: the artifact JSON body is the single source of truth for the new content, the existing per-type renderers are enriched to generate human-readable, audience-aware markdown from that structured body, and the three new adherence checks (functional-coverage, diagram, UX) are added as code-review dimensions that ride the existing computeReviewVerdict / codeReview.enforce completion gate without forking the verdict reducer. Diagrams and UX mocks are content-gated companion artifacts referenced from — never inlined into — the core markdown, produced through the existing docgen generateDocument seam. The four forward-only Stories layer cleanly: S001 introduces the functional-definition record + its coverage dimension; S002 makes every document navigable, audience-aware, and de-duplicated; S003 adds content-gated diagram companions; S004 unifies the selectable adherence dimensions and the UX-acceptance check.
**Rollout phase:** Phase B — readable, audience-aware, de-duplicated documents
**Owns:** `sc3` (Document-structure + shared-context reference model)
**Consumes:** `sc1` (FunctionalDefinition record (artifact body))

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Private to S001: the exact FR-id sequence-numbering/assignment scheme and its stability guarantee, the internal shape and validation of the FunctionalDefinition body extension, how the functional-definition prose is generated from the record, and the provider prompt/schema by which the functional-coverage dimension judges genuine realization. None of these internals are consumed by other Stories — they only see the sc1 record shape and the sc2 dimension result. — owns `sc1`, `sc2`
- `s3`: Private to S003: the per-document assessment that decides whether a diagram materially aids understanding, the selection of docgen docType and the generateDocument invocation that produces the Mermaid/HTML companion, and the diagram-adherence dimension's check that a referenced diagram is present and consistent with the design. S004 consumes only the companion-reference contract (sc4), not the diagram-generation internals. — owns `sc4`
- `s4`: Private to S004: the multiselect adherence enum (UX, Diagram:Sequence/ER/Component, FR-coverage) and its per-work-item recording, the uxAcceptance flag and when it is required, the UX review dimension's judgement of the built experience against the referenced mock, and how the recorded adherence set is read by the completion check. S004 is the terminal Story and exposes no contract others consume; it unifies the dimensions S001/S003 contribute and the structure/companion contracts from S002/S003.

## Contract details

**Surface level:** internal-shared

### `loadTemplate`

```typescript
loadTemplate(kind: ArtifactKind, opts?: { repoRoot?: string }): Promise<LoadedTemplate>
```

**Parameters:**
- `kind: ArtifactKind` — The artifact type whose FORMAT template to resolve (define/hld/lld/plan).
- `opts: { repoRoot?: string }` _(optional)_ — repoRoot enables the per-repo override tier of the existing 3-tier cascade.

**Returns:** `Promise<LoadedTemplate>` — The resolved per-type FORMAT template from the existing cascade (<repo>/.insrc/artifacts/templates/<kind> -> ~/.insrc/... -> bundled). Reused seam (daemon/artifacts/template-loader.ts:156); this Story adds the bundled markdown FORMAT templates it resolves.

**Errors:**
- `Error` when no template resolves on any tier (a bundled default is always shipped, so this indicates a packaging fault).

**Postconditions:**
- A repo/user override, when present, wins over the bundled default.

### `renderFromFormat`

```typescript
renderFromFormat(format: DocumentFormat, bindings: SectionBindings, ctx: RenderCtx): string
```

**Parameters:**
- `format: DocumentFormat` — The resolved per-type format (ordered SectionSpec[] + envelope + itemFormat).
- `bindings: SectionBindings` — Map from SectionSpec.id to the function producing that section's BODY from the artifact body.
- `ctx: RenderCtx` — Envelope inputs: short H1, artifactId marker, audience, the item-scoped summary, contextRefs, and the citation list for References.

**Returns:** `string` — The full markdown: envelope (short H1, unnumbered plain-language item-scoped Summary, generated Contents/TOC) + body sections in order, each carrying an engine-computed section number (N) or nested number (N.M) as LITERAL text, rendered from its binding / a SharedContextRef reference line / S001's FR section, then a consolidated References block. The single shared engine every renderer drives.

**Errors:**
- `Error` when a required SectionSpec has no binding and no shared-ref/fr/extension source (a format/renderer mismatch).

**Postconditions:**
- Sections render in declared order; the envelope (H1/Summary/Contents) is unnumbered; body sections number from 1; a source:'shared-ref' section emits a reference line, never copied prose.

### `computeSectionNumbers`

```typescript
computeSectionNumbers(format: DocumentFormat): ReadonlyMap<string, string>
```

**Parameters:**
- `format: DocumentFormat` — The ordered per-type format whose sections + per-item slots need ordinals.

**Returns:** `ReadonlyMap<string, string>` — A deterministic map from SectionSpec.id (and per-item slot id) to its literal ordinal label ('1','2','6.1','6.2',...). Envelope sections (numbered:false) are absent. This is why numbering is portable (literal text) despite Markdown having no native decimal numbering.

**Postconditions:**
- Body sections number 1..N in declared order; ItemFormat items number parent-relative N.M; leaf lists are not numbered.

### `sectionSlug`

```typescript
sectionSlug(heading: string, ordinal?: string): string
```

**Parameters:**
- `heading: string` — Section heading to derive a stable anchor from.
- `ordinal: string` _(optional)_ — The engine-computed number to prefix the anchor (e.g. '2' -> '#2-framework-summary').

**Returns:** `string` — A deterministic lowercase-kebab slug (the SharedContextRef.sectionId anchor + the TOC link target), number-prefixed when an ordinal is supplied.

**Postconditions:**
- Same (heading, ordinal) always yields the same slug; collisions disambiguated with a numeric suffix.

### `renderSharedContextReference`

```typescript
renderSharedContextReference(ref: SharedContextRef): string
```

**Parameters:**
- `ref: SharedContextRef` — The upstream artifact + section a document references instead of reproducing.

**Returns:** `string` — A reference line, e.g. '> See **HLD-<epicHash>** § 2. Framework summary' — the de-dup rendering (ac2), never inlining the referenced prose (k1).

**Postconditions:**
- Names the source artifact id + human heading only.

### `deriveHldContextRef`

```typescript
deriveHldContextRef(epicHash: string): SharedContextRef
```

**Parameters:**
- `epicHash: string` — The Epic hash the LLD belongs to — the HLD artifact id (HLD-<epicHash>) is derived from it via the storage id scheme.

**Returns:** `SharedContextRef` — The engine-derived default HLD-context reference { sourceArtifactId: 'HLD-<epicHash>', sectionId: '2-framework-summary' } used when the LLD body carries no explicit contextRefs — this is what makes the ac2 de-dup take effect without requiring the model to emit it.

**Postconditions:**
- Deterministic from epicHash; explicit body.contextRefs, when present, take precedence.

### `renderDefineMarkdown`

```typescript
renderDefineMarkdown(artifact: DefineArtifact): string
```

**Parameters:**
- `artifact: DefineArtifact` — The DEF, rendered via the DEF format template (loadTemplate('define') -> renderFromFormat).

**Returns:** `string` — The DEF rendered to its template: short H1 (fixing defect #4), a business/product-tagged plain-language Epic-scoped Summary (ac3), Contents/TOC, then numbered body sections (Problem, Functional requirements via S001, Non-goals/Assumptions/Constraints, Stories with nested-numbered per-story sub-template), consolidated References, Open questions.

**Postconditions:**
- Peer renderers renderHldMarkdown/renderLldMarkdown/renderPlanMarkdown are reshaped the same way; renderLldMarkdown renders the HLD-context as a deriveHldContextRef reference (ac2).

## Data model changes

### `DocumentFormat / SectionSpec / ItemFormat (sc3 format model)` — new

Declarative per-type format model. SectionSpec = { id, heading, contentGuidance, audience?: Audience, required: boolean, numbered: boolean (envelope=false, body=true), source: 'body'|'shared-ref'|'fr'|'extension' }. ItemFormat = { itemKind: 'story'|'task', sections: SectionSpec[] } (repeatable per-item sub-layout, nested-numbered). DocumentFormat = { kind, h1, summary: SectionSpec, sections: readonly SectionSpec[], itemFormat? }. New src/workflow/artifacts/format/ module; the bundled markdown templates encode the same structure for the loader cascade.

```
+ interface SectionSpec { readonly id; readonly heading; readonly contentGuidance; readonly audience?: Audience; readonly required: boolean; readonly numbered: boolean; readonly source: 'body'|'shared-ref'|'fr'|'extension' }
+ interface ItemFormat { readonly itemKind: 'story'|'task'; readonly sections: readonly SectionSpec[] }
+ interface DocumentFormat { readonly kind: ArtifactKind; readonly h1: string; readonly summary: SectionSpec; readonly sections: readonly SectionSpec[]; readonly itemFormat?: ItemFormat }
```

**Call sites:**
- `src/workflow/artifacts/define.ts`
- `src/daemon/artifacts/template-loader.ts`

### `Audience + SharedContextRef (sc3 types)` — new

Audience = 'business'|'product'|'technical' (tags a SectionSpec's reader). SharedContextRef = { sourceArtifactId, sectionId } names an upstream artifact (storage.ts DEF-/HLD-/LLD- scheme) + a number-prefixed section slug, rendered as a reference line (ac2).

```
+ type Audience = 'business'|'product'|'technical'
+ interface SharedContextRef { readonly sourceArtifactId: string; readonly sectionId: string }
```

**Call sites:**
- `src/workflow/artifacts/lld.ts`
- `src/workflow/storage.ts`

### `Per-type FORMAT templates (bundled) — define/hld/lld/plan` — new

Four bundled markdown FORMAT templates under src/assets/artifacts/templates/ resolved by the loadTemplate cascade, each declaring: short H1; a plain-language item-scoped Summary (audience business|product for DEF, product|technical for HLD/LLD/PLAN); generated Contents/TOC; numbered body sections in a human-first order with nested-numbered per-story/per-task sub-templates; the LLD's HLD-context as a reference line; consolidated References; and NAMED extension-point sections for S003 diagrams / S004 UX. The reviewed mocks (docs/epics/.../S002/mocks/) are the authoring reference. Ship via copy-assets.mjs.

```
src/assets/artifacts/templates/{define,hld,lld,plan}.md (+ default DocumentFormat per kind)
```

**Call sites:**
- `src/workflow/artifacts/define.ts`
- `src/workflow/artifacts/hld.ts`
- `src/workflow/artifacts/lld.ts`
- `src/workflow/artifacts/plan.ts`

### `Artifact body: summary + audience fields (Define/Hld/Lld/Plan bodies)` — field-add

Add optional `summary?: { prose: string; audience?: Audience } | undefined` to each artifact body type — the plain-language, item-scoped abstract the templates lead with. Additive + absent-safe: when absent the Summary section renders empty (older artifacts unaffected).

```
  interface DefineBody/HldBody/LldBody/PlanBody { ...; readonly summary?: { readonly prose: string; readonly audience?: Audience } | undefined }
```

**Call sites:**
- `src/workflow/artifacts/define.ts`
- `src/workflow/artifacts/hld.ts`
- `src/workflow/artifacts/lld.ts`
- `src/workflow/artifacts/plan.ts`

### `LldBody.contextRefs` — field-add

Add optional `contextRefs?: readonly SharedContextRef[] | undefined`. When absent, the renderer uses deriveHldContextRef(epicHash) so the HLD-context de-dup (ac2) takes effect by default; the embedded hldContextSlice DATA stays, only its RENDERING becomes a reference.

```
  interface LldBody { ...; readonly contextRefs?: readonly SharedContextRef[] | undefined }
```

**Call sites:**
- `src/workflow/artifacts/lld.ts`

### `Summary/audience/contextRefs ELICITATION — runner step prompts` — invariant-change

S002 extends the per-phase step prompts + step schemas to ELICIT the new content so the templates are not hollow: define `epic.frame` (Epic-scoped business/product summary), design.epic `framework.write` (Epic-scoped product|technical summary), design.story `contract.detail` (Story-scoped summary; contextRefs optional, else engine-derived), plan `tasks.finalize` (Story-scoped build summary). Each adds a `summary` (+ audience) to its step schema. NOTE: the S001 `functionalDefinition` elicitation is explicitly NOT in this Story (separate S001 back-fill).

```
runners/{define,design-epic,design-story,plan}/index.ts + schemas.ts: add summary/audience to the relevant step prompt + schema
```

**Call sites:**
- `src/workflow/runners/define/index.ts`
- `src/workflow/runners/design-epic/index.ts`
- `src/workflow/runners/design-story/index.ts`
- `src/workflow/runners/plan/index.ts`

### `Summary/audience/contextRefs ELICITATION — synthesizer body schemas` — invariant-change

The per-workflow synthesizers in orchestrator.ts (defineSynthesizer, designEpicSynthesizer, designStorySynthesizer, planSynthesizer) add `summary` (+ audience) — and for the LLD `contextRefs` — to their body schemas with verbatim/derive carry rules, while KEEPING additionalProperties:false. Without this the fields are rejected at synthesize even if a step emits them (the current gate at orchestrator.ts:937). Checklist.verify items are added per phase (summary present + plain-language + item-scoped; LLD HLD-context is a reference, not a verbatim copy).

```
orchestrator.ts synthesizer body schemas: + summary (+ audience), + contextRefs (LLD); + verbatim/derive HARD-RULES; + checklist items
```

**Call sites:**
- `src/workflow/orchestrator.ts`

### `renderDefineMarkdown / renderHldMarkdown / renderLldMarkdown / renderPlanMarkdown` — invariant-change

Each renderer is reshaped to render via its per-type template (loadTemplate(kind) -> renderFromFormat with per-section bindings), emitting the envelope + engine-computed section/nested numbering + item-scoped Summary + de-dup reference. This DELIBERATELY changes rendered output, so the heading-literal tests across define/hld/lld/plan suites AND the BOUNDARY_RULES regexes (synthesizer.ts:151) are updated to admit the new constructs (References block, TOC, numbered headings, per-item checkboxes) — intentional, not byte-identical. (renderLldMarkdown is sync today; template loading is async — error.paths pins preload vs async renderer.)

```
renderers delegate to renderFromFormat(loadTemplate(kind), bindings, ctx); heading-literal tests + BOUNDARY_RULES updated
```

**Call sites:**
- `src/workflow/artifacts/define.ts`
- `src/workflow/artifacts/hld.ts`
- `src/workflow/artifacts/lld.ts`
- `src/workflow/artifacts/plan.ts`
- `src/workflow/synthesizer.ts`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc3` | implements | S002 owns sc3 and realizes BOTH halves of the readability contract. RENDERING: the DocumentFormat/SectionSpec/ItemFormat model + Audience + SharedContextRef types; the per-type bundled FORMAT templates on the existing template-loader cascade; a shared renderFromFormat engine + computeSectionNumbers (literal section/nested numbering, since Markdown has none) + sectionSlug + renderSharedContextReference + deriveHldContextRef (engine-derived HLD-context de-dup). ELICITATION: S002 also extends the per-phase step prompts + the orchestrator synthesizer body schemas + checklist items to elicit summary/audience/contextRefs so the templates are populated, not hollow. This realizes the HLD's a1 (renderers still generate markdown from the structured body — now via editable per-type templates) and is consistent with the HLD frameworkSummary + review-doc piece B, so no formal amendment is required. HLD NOTE (per stakeholder decision 2026-09-28): S002 owns the elicitation prompts as well as the renderers — recorded here in the LLD rather than as a structural amendment (no contract shape changes). Consumers S003/S004 attach to NAMED extension-point sections. The S001 functionalDefinition elicitation is explicitly OUT of this Story (separate S001 back-fill). |
| `sc1` | consumes | The DEF template's Summary + Functional requirements sections consume sc1's functionalDefinition record via S001's renderFunctionalRequirementsSection UNCHANGED. S002 reads the record shape only; it never modifies FR ids, the minter, or the record, and stays absent-safe (empty FR section) until the separate S001 FR-elicitation back-fill wires the define prompts. |

## Error paths

### Error cases

- **A per-type FORMAT template fails to resolve on any cascade tier (bundled default missing or a per-repo override unreadable/corrupt).** (recoverable)
  - Detection: loadTemplate walks the 3-tier cascade and finds no readable template for the kind; a bundled default always ships, so a total miss is a packaging/asset fault (same class the docgen boot-time asset validator guards).
  - Response: Throw a descriptive Error naming the kind + tiers tried, surfaced through the existing synthesize error path; never silently emit an unstructured document.
  - User impact: Generation of that one artifact fails loudly with an actionable message; other artifacts unaffected.
- **A required SectionSpec has no binding and no shared-ref/fr/extension source (format/renderer drift after a template edit).** (recoverable)
  - Detection: renderFromFormat iterates the ordered sections and finds a required section with source:'body' but no entry in the SectionBindings map.
  - Response: Throw an Error naming the offending section id + kind (fail-fast at render); caught by the co-located renderer tests before ship.
  - User impact: A format/renderer mismatch is caught in dev/CI, never emitting a document with a silently-dropped required section.
- **A step emits a `summary` (or `contextRefs`) but the synthesizer body schema was not extended to admit it — additionalProperties:false rejects the field at synthesize.** (recoverable)
  - Detection: The synthesize-turn schema validation (ajv) fails the artifact because the field is not in the body schema; the whole synthesize errors.
  - Response: This Story's build extends each synthesizer body schema (defineSynthesizer/designEpicSynthesizer/designStorySynthesizer/planSynthesizer) IN LOCKSTEP with the step-schema additions, so the elicited field is admitted; a schema/step drift is caught by the synthesize-path tests.
  - User impact: Without the lockstep change the elicited summary/contextRefs would be silently lost or the synthesize would hard-fail; with it, the field flows through to the body.
- **An LLD carries a contextRefs entry whose sourceArtifactId does not match the storage.ts id scheme (DEF-/HLD-/LLD-) or whose sectionId slug is unknown on the referenced type.** (recoverable)
  - Detection: renderSharedContextReference validates the id prefix against the known artifact-id scheme and the sectionId against the target type's computed section slugs; a malformed id or unknown slug is detected at render.
  - Response: Render a plain-text degraded reference line (the id verbatim) AND record a synthesize-time warning; never crash the document over one bad reference and never inline copied prose as a fallback (k1).
  - User impact: A stale/typo'd reference degrades to a visible literal the reviewer can follow, instead of failing the document or re-embedding upstream content.
- **A new format construct (References block, TOC, numbered heading, per-item checkbox) trips an existing BannedPattern boundary regex in synthesizer.ts (e.g. HLD 'no task lists' or DEF 'no code fences') on the newly-shaped output.** (recoverable)
  - Detection: The BOUNDARY_RULES validators (synthesizer.ts:151) run over the rendered markdown after renderFromFormat and flag a pattern the new format legitimately introduces.
  - Response: The boundary regexes are updated as part of THIS story to admit the intended new constructs while still rejecting genuine scope violations; the regex change ships with the format change (same PR).
  - User impact: Legitimate new sections are not rejected as boundary violations, and real scope leakage is still caught.

### Edge cases

| Input | Expected |
| :--- | :--- |
| An artifact body with no summary, no functionalDefinition, and no contextRefs (an older/absent-data artifact, or a phase whose elicitation has not run). | Summary section renders empty; FR section renders empty (renderFunctionalRequirementsSection returns [] per S001); HLD-context falls back to deriveHldContextRef(epicHash) for the LLD. The document still renders fully in the new numbered format. Absent-safety applies to the optional DATA fields only, NOT to the format/numbering (always applied). |
| A DEF whose functionalDefinition holds only doc-level FRs (no per-item), with the business/product Summary asked to foreground functional outcomes. | The Summary foregrounds the doc-level FR statements; the per-item FR grouping is empty and omitted — no empty '### item' stubs. |
| Two sections resolve to the same base slug, or a section is unnumbered (envelope) vs numbered (body). | computeSectionNumbers assigns ordinals only to numbered:true sections (envelope absent); sectionSlug disambiguates collisions with a numeric suffix; TOC + anchors stay unique and stable across regenerations. |
| A PLAN with zero tasks, or an HLD with zero shared contracts (valid but unusual). | The ItemFormat loop emits nothing; the section renders its heading + number + an explicit 'None' line (no dangling heading), and the TOC/numbering stay consistent. |
| An LLD body carries an explicit contextRefs list in addition to the derivable HLD reference. | Explicit body.contextRefs take precedence over deriveHldContextRef; the engine-derived default is used only when contextRefs is absent. |

### Invariants to preserve

- No document reproduces upstream shared context verbatim — later documents reference it (SharedContextRef), foregrounding what is specific to them. The de-dup replaces the LLD's re-embedded HLD framework-summary (lld.ts:293) with a reference; per the s1 doc bundle (docs/artifact-document-template-review.md defect #13) and ac2. [[c2]]
- All content/generation goes through the local CliProvider/Ollama and the existing docgen/template-loader seams — no direct cloud REST, no new external surface; per the HLD nonFunctional.security (k5). The prompt+schema elicitation changes stay within the existing StepRunner/synthesizer seams (runners/*/index.ts + orchestrator.ts), adding no provider surface. [[c5]]
- Forward-only: the change applies to newly generated artifacts and migrates nothing on disk; existing artifact JSON bodies stay valid because summary/contextRefs/functionalDefinition are all optional; per the HLD nonFunctional.durability (k6). [[c6]]
- The functional-requirement record + its rendering (S001's renderFunctionalRequirementsSection + FR-id scheme) are consumed UNCHANGED — S002 reads sc1's shape only, never modifies FR ids/minter/record, and does NOT wire the S001 FR-elicitation (separate back-fill). The FR section stays the single source of the functional thread. [[c2]]

## Test strategy

**Test framework:** `node:test + node:assert/strict (tsx), co-located under src/workflow/artifacts/__tests__/, src/workflow/__tests__/, and src/workflow/runners/*/__tests__/ — matching the existing define/hld/lld/plan-artifact heading-literal suites, synthesizer tests, and runner tests.`

### Test levels

- **unit** — Prove the format model + shared engine + helpers: section ordering, envelope (short H1 distinct from body, item-scoped Summary, generated TOC, References), engine-computed section + nested numbering as literal text, slug determinism, fail-fast on a missing required binding.
  - Subjects: `renderFromFormat (ordered sections, envelope, References, required-binding throw)`, `computeSectionNumbers (1..N body, N.M items, envelope unnumbered)`, `sectionSlug (determinism + numeric-suffix disambiguation + number-prefixed anchors)`, `renderSharedContextReference + deriveHldContextRef (reference-line shape; engine-derived HLD ref; degraded literal on malformed id)`
  - Fixtures: `A minimal DocumentFormat with body/shared-ref/fr/extension sections + an ItemFormat`, `a SectionBindings map with one omitted binding (throw)`, `sample DEF/HLD/LLD/PLAN bodies with and without summary/functionalDefinition/contextRefs`
- **unit** — Prove each reshaped renderer emits its NEW numbered per-type format: updated heading-literal suites assert short H1, unnumbered item-scoped Summary, Contents/TOC, numbered body sections + nested-numbered per-item sub-templates, consolidated References; assert the H1 no longer duplicates the first body paragraph (defect #4) and the LLD HLD-context is a reference not the copied framework-summary (defect #13 / ac2).
  - Subjects: `renderDefineMarkdown`, `renderHldMarkdown`, `renderLldMarkdown`, `renderPlanMarkdown`
  - Fixtures: `Golden DEF/HLD/LLD/PLAN bodies (updated from the existing artifact suites)`, `an LLD body with epicHash for the engine-derived HLD reference`, `an LLD body with explicit contextRefs (precedence test)`
- **unit** — Prove the audience-scoped Summary (ac3): the Summary is tagged (business|product for DEF; product|technical for HLD/LLD/PLAN), plain-language, item-scoped (Epic for DEF/HLD, Story for LLD/PLAN), and no implementation detail on the DEF; binds S001's renderFunctionalRequirementsSection unchanged.
  - Subjects: `renderDefineMarkdown Summary binding`, `renderLldMarkdown Summary binding`, `the per-type DocumentFormat summary SectionSpec (audience tag + numbered:false)`
  - Fixtures: `DEF body with a business/product summary + doc-level and per-item FRs`, `LLD body with a story-scoped summary`
- **unit** — Prove the ELICITATION prompt+schema changes: each extended step schema requires/admits summary (+ audience), and each synthesizer body schema admits summary/contextRefs while keeping additionalProperties:false (a field a step emits now flows through instead of being rejected). S001 FR fields remain NOT elicited here (define stays unchanged for FRs).
  - Subjects: `runners/design-epic framework.write schema`, `runners/design-story contract.detail schema`, `runners/plan tasks.finalize schema`, `runners/define epic.frame schema`, `defineSynthesizer/designEpicSynthesizer/designStorySynthesizer/planSynthesizer body schemas (orchestrator.ts)`
  - Fixtures: `A step output carrying a summary + audience`, `a synthesize-turn fixture asserting the field is admitted (not rejected by additionalProperties:false)`, `a fixture asserting define FR fields are still absent (S001 back-fill not in scope)`
- **integration** — Prove the template cascade + boundary regexes end-to-end: loadTemplate resolves the bundled per-type format (per-repo override wins); a full synthesize of each type produces the new numbered format with a populated Summary + HLD-context reference AND passes the UPDATED BOUNDARY_RULES validators (new References/TOC/checkbox/numbered constructs admitted, real scope leakage still rejected).
  - Subjects: `loadTemplate (bundled default + per-repo override tier)`, `BOUNDARY_RULES over the new rendered output (synthesizer.ts:151)`, `the missing-template throw path`, `end-to-end synthesize of DEF/HLD/LLD/PLAN with elicited summary`
  - Fixtures: `Bundled per-type template assets under src/assets/artifacts/templates/`, `a temp repoRoot with an override template`, `a temp repoRoot with a corrupt/missing template to assert the loud failure`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `renderFromFormat emits envelope (short H1, Summary, generated TOC, References) + ordered numbered sections`, `computeSectionNumbers assigns 1..N body + N.M per-item ordinals; envelope unnumbered`, `updated renderDefine/Hld/Lld/Plan heading-literal suites assert the navigable numbered structure incl. per-item sub-templates`, `integration: full synthesize of each type passes the updated BOUNDARY_RULES`, `PLAN/HLD zero-item edge case renders heading + number + 'None'` |
| `ac2` | `renderLldMarkdown renders HLD-context as a SharedContextRef reference line, NOT the copied framework-summary (defect #13)`, `deriveHldContextRef builds the engine-derived HLD reference from epicHash; explicit contextRefs take precedence`, `renderSharedContextReference degraded-literal test on a malformed/unknown ref (never inlines copied prose)`, `absent-safety edge case: no contextRefs -> engine-derived reference still used` |
| `ac3` | `renderDefineMarkdown Summary foregrounds sc1 functional-outcome statements in outcome terms with the business/product audience tag and no implementation detail`, `elicitation: epic.frame/framework.write/contract.detail/tasks.finalize step schemas require summary (+ audience); synthesizer bodies admit it`, `doc-level-only FR edge case: Summary uses doc-level FRs, no empty per-item stubs`, `FR section binds S001 renderFunctionalRequirementsSection unchanged` |

## Migration

**State before:** Per-type renderers (define/hld/lld/plan.ts — s1 code bundle) build markdown by pushing literal '## ' headings onto a lines[] array: no declared section schema, no short H1 (H1 duplicates the first body paragraph — defect #4), no Summary/abstract, no Contents/TOC, no consolidated References, and every LLD re-embeds the HLD framework-summary verbatim in '## HLD context' (lld.ts:293 — defect #13). BannedPattern boundary validators run over the rendered markdown (synthesizer.ts:151). Crucially, no step prompt elicits a summary/audience/contextRefs and no DEF/HLD/LLD/PLAN synthesizer body schema admits them (additionalProperties:false, orchestrator.ts:937), so the new content has no upstream source. Markdown has no native decimal section numbering.

**State after:** A declarative per-type DocumentFormat + bundled markdown FORMAT templates on the existing template-loader cascade drive one renderFromFormat engine that emits a short distinct H1, a plain-language item-scoped Summary (audience-tagged), a generated Contents/TOC, human-first body sections with engine-computed section + nested numbering (literal text), per-story/per-task sub-templates, an engine-derived SharedContextRef reference for the LLD HLD-context (de-dup), and a consolidated References block. The per-phase step prompts + synthesizer body schemas + checklists are extended to elicit summary/audience/contextRefs so the templates are populated. Forward-only: only newly generated artifacts change; nothing on disk is rewritten. The S001 functionalDefinition elicitation is left for a separate S001 back-fill; the FR section stays absent-safe.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the sc3 types (Audience, SharedContextRef, SectionSpec incl. numbered flag, ItemFormat, DocumentFormat) and the optional body fields (summary on each body; contextRefs on LldBody) — additive types only, no behavior change yet. — ↩ rollbackable
2. Author the shared engine: renderFromFormat + computeSectionNumbers (literal section/nested ordinals) + sectionSlug (number-prefixed) + renderSharedContextReference + deriveHldContextRef, each with unit tests, before wiring any renderer. — ↩ rollbackable
3. Add the bundled per-type FORMAT templates + default DocumentFormat constants (define/hld/lld/plan) under src/assets/artifacts/templates/, resolved through the existing loadTemplate cascade; wire copy-assets.mjs. — ↩ rollbackable
4. Reshape each renderer (define, then hld/lld/plan) to render via loadTemplate(kind) + renderFromFormat with per-section bindings, one type at a time, updating that type's heading-literal test suite in the same step; wire the LLD HLD-context to deriveHldContextRef (de-dup). — ↩ rollbackable
5. Extend the runner step prompts + step schemas to ELICIT summary/audience (epic.frame, framework.write, contract.detail, tasks.finalize) and contextRefs (contract.detail, optional), with matching runner tests. — ↩ rollbackable
6. Extend the synthesizer body schemas (defineSynthesizer/designEpicSynthesizer/designStorySynthesizer/planSynthesizer) to admit summary/audience (+ contextRefs for LLD) with verbatim/derive carry rules, keeping additionalProperties:false; add the per-phase checklist.verify items; verify a step-emitted summary now flows through synthesize. — ↩ rollbackable
7. Update the synthesizer.ts:151 BOUNDARY_RULES regexes to admit the new constructs (References block, Contents/TOC, numbered headings, per-item checkboxes) while still rejecting genuine scope leakage, verified by the integration synthesize tests. — ↩ rollbackable

**Backward compat:** The renderer functions renderDefineMarkdown/renderHldMarkdown/renderLldMarkdown/renderPlanMarkdown keep their names (a renderer may become async to await loadTemplate; if so its callers in the synthesize path are updated in lock-step — the only signature-level change, contained within the workflow package). The step + synthesizer SCHEMAS gain optional fields only (additive; additionalProperties:false retained) so existing runs that omit summary/contextRefs still validate. Existing artifact JSON bodies remain valid: summary, contextRefs, and functionalDefinition are all optional — an artifact lacking them still renders fully (empty Summary/FR sections; LLD HLD-context via the engine-derived reference). The RENDERED OUTPUT deliberately changes (new envelope, numbering, section order, de-dup), so the heading-literal test suites + BOUNDARY_RULES are updated as part of this story — that is the compat contract here, not byte-stable output. No stored artifact is migrated or invalidated.

## Alternatives considered

### a1: Declarative per-type FormatSpec + shared envelope/section engine (in-code)

One in-code DocumentFormat spec per artifact type (ordered sections with heading/content-guidance/audience/required + a per-item sub-format), rendered by a shared envelope + section engine the four renderers drive.

Introduce a declarative DocumentFormat per artifact type as in-code spec objects: an ordered SectionSpec[] with { id, heading, contentGuidance, audience?, required } plus an ItemFormat per-item sub-layout. A shared engine emits the envelope (short H1, plain-language item-scoped Summary, generated Contents/TOC, consolidated References) and walks the sections, emitting engine-computed section + nested numbers (N, N.M) as literal text. The elicitation half rides along: the runner step prompts + synthesizer body schemas gain summary/audience/contextRefs so the sections have content. The spec lives in TypeScript, not editable files.

**Rejected because:** Delivers the same ACs + summary + numbering in one engine and needs no new file surface, but the format lives as in-code spec objects — not the editable, inspectable templates the stakeholder explicitly asked for. Strong fallback if we chose to avoid the cascade.

### a2: Externalized per-type template files on the template-loader cascade — **CHOSEN**

Each type's format lives in an editable markdown FORMAT template resolved by the existing template-loader 3-tier cascade, filled from the structured body by one renderFromFormat engine that also emits summaries + engine-computed numbering; plus the prompt+schema elicitation of summary/audience/contextRefs.

Each artifact type gets a bundled FORMAT template resolved via daemon/artifacts/template-loader loadTemplate (<repo>/.insrc/artifacts/templates/<kind> -> ~/.insrc/... -> bundled), declaring the section order + per-item sub-layout + a data-binding contract. A shared renderFromFormat engine fills it from the body, emits the plain-language item-scoped Summary + audience tag, computes and emits section + nested numbering as literal text, and renders the HLD-context as an engine-derived SharedContextRef reference (de-dup). S002 also extends the runner step prompts (framework.write/contract.detail/tasks.finalize/epic.frame) + the synthesizer body schemas + checklist items to ELICIT summary/audience/contextRefs, so the templates are not hollow. Format + house style become per-repo/per-user overridable data.

### a3: Per-type FormatSpec as an advisory contract; renderers keep bespoke rendering

Declare the per-type section order + numbering + summary rules as a spec object, but leave each renderer's bespoke lines.push logic in place, conforming to the spec inline.

Declare a DocumentFormat spec per type as documentation/contract, and have each renderer add the missing sections (short H1, Summary, TOC, References), the numbering, and the elicited summary/contextRefs inline, referencing the spec for order. No shared render engine; each renderer emits its own envelope and its own numbering.

**Rejected because:** Adds the sections/summary/numbering but keeps bespoke per-renderer logic and treats the spec as advisory — duplicates the envelope + numbering across four renderers (the scattered-lines.push problem the review doc names) and offers neither the single-source engine nor editable templates. Same test-rewrite cost, least benefit.

## Citations

- **[[c1]]** `analyze-bundle` `s1 code bundle: src/workflow/artifacts/define.ts, hld.ts, lld.ts, plan.ts — current per-type section inventory (lines.push, no envelope)` — "Each renderer pushes literal '## ' headings onto a lines[] array (no template engine, no declared section schema)."
- **[[c2]]** `doc` `docs/artifact-document-template-review.md piece B + defects #4/#13` — "one format spec per document type, covering its TOC, summary/abstract, problem definition, references, and the repeatable story/task sub-templates ... a human-first content order"
- **[[c3]]** `code` `src/workflow/synthesizer.ts:151 (BOUNDARY_RULES) + heading-literal suites + src/workflow/storage.ts id scheme + src/workflow/artifacts/functional-definition.ts:87 + daemon/artifacts/template-loader.ts:156` — "Scope-boundary validators are BannedPattern regexes over the RENDERED markdown; tests assert EXACT heading literals; loadTemplate is the existing 3-tier cascade."
- **[[c4]]** `prior-artifact` `HLD-c5824e17eccf0c14: framework a1, sc3 (owned s2) + sc1 (owned s1), nonFunctional security(k5)/durability(k6)` — "the existing per-type renderers are enriched to generate human-readable, audience-aware markdown from that structured body"
- **[[c5]]** `stakeholder` `User (2026-09-27/28): 'add corresponding rendering templates for each'; 'summary in each doc contextualized to the story under work'; 'add section numbering and nested numbering'; 'assess the prompts given to the LLM for each phase and align them'` — "assess the prompts given to the LLM for each phase and include the changes required to align them with the framework"
- **[[c6]]** `step-output` `s2 alternatives + s3 judgment: winnerId a2 (editable per-type template files on the template-loader cascade)` — "a2 delivers concrete, editable per-type templates + the elicitation that populates them"
- **[[c7]]** `code` `prompt-alignment finding: runners/{define,design-epic,design-story,plan}/index.ts step prompts + orchestrator.ts synthesizer body schemas (defineSynthesizer body at :937, stub summary at :315) — additionalProperties:false gates omit summary/audience/contextRefs/functionalDefinition` — "no step prompt elicits a summary/audience/contextRefs and no DEF/HLD/LLD/PLAN synthesizer body schema admits them"

## Amendments

### Build-time refinements — a2 realization (post-approval, 2026-09-28)

The build implemented the approved alternative **a2** (editable per-type FORMAT
template files on a 3-tier loader cascade). Four realization choices refine the
LLD's letter while honouring its intent (no contract-shape change; sc3's model,
the editable per-repo/user-overridable template files, and the elicitation are
all as designed). Recorded here as the artifact of record.

1. **Parallel workflow-scoped loader instead of literal `loadTemplate` reuse.**
   The contract entry `loadTemplate` cited reuse of `daemon/artifacts/template-loader.ts:156`.
   That loader is keyed on the **docgen** `ArtifactKind` enum, resolves `.html`,
   and runs an HTML lint — none of which fit the workflow markdown FORMATS. The
   build adds a **parallel** `loadDocumentFormat` in `src/workflow/artifacts/format/template-loader.ts`
   that reuses the same 3-tier cascade + mtime-cache + degrade-to-bundled
   *pattern* for the workflow doc formats (`.md`, workflow kinds, no HTML lint).
   The `loadTemplate` citation stands as the pattern source, not a literal call.

2. **Synchronous loader + in-renderer resolve instead of async renderers.** The
   data-model note "renderLldMarkdown is sync today; template loading is async —
   error.paths pins preload vs async renderer" flagged this tension. The build
   resolves it with a **sync** `loadDocumentFormat` (readFileSync + mtime cache)
   and has each renderer resolve its format via `resolveDocumentFormat(kind,
   artifact.meta.repoPath)` at its final `renderFromFormat`. The renderers stay
   sync — no async ripple through the 15 render call sites — and a per-repo/user
   override is honoured on **every** render path (generation, relink, tail).

3. **Template-file encoding (left open by the LLD).** A format file is editable
   markdown where each section is an `<!-- insrc:section id=… source=… audience=…
   required numbered -->` directive + heading + guidance prose. `formatToTemplate`
   / `parseFormatTemplate` round-trip; the in-code `defaultFormat(kind)` constants
   remain the oracle (the bundled files are generated from them and a round-trip
   test asserts equality, so an edit to `formats.ts` flags the file for regen).

4. **Missing/corrupt semantics.** The promised test named "missing/corrupt
   template throws". The build realizes this more robustly: a corrupt/malformed
   **override** (repo/user tier) degrades to the next tier with a warn (mirroring
   the docgen loader — never a silent no-render); only a **total miss** throws;
   `parseFormatTemplate` itself throws on malformed input. `resolveDocumentFormat`
   wraps the loader with the in-code default as a defensive final fallback so a
   packaging fault can never blank a document.

Verification: full sweep 3738 pass (sole failure the pre-existing better-sqlite3
native-ABI red herring); post-build code review **warn 0H/0M** on both the
t6+t7 and the a2 changed sets (all LOW observations). See `CR.md`.

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 12 LOW** · model `client` · reviewed 2026-09-27T19:13:35.753Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| contract/loadTemplate | citation | LOW | manual | A loadTemplate function (the 3-tier template cascade) exists at src/daemon/artifacts/template-loader.ts around line 156. | CONFIRMED exact: `export async function loadTemplate(` at src/daemon/artifacts/template-loader.ts:156. | None — citation sound. |
| data/renderers | citation | LOW | manual | The four per-type renderers renderDefineMarkdown/renderHldMarkdown/renderLldMarkdown/renderPlanMarkdown exist in src/workflow/artifacts/{define,hld,lld,plan}.ts. | CONFIRMED existence, minor line drift: renderHldMarkdown@hld.ts:109, renderPlanMarkdown@plan.ts:101, renderLldMarkdown@lld.ts (grep shows ~220/282 across contexts), renderDefineMarkdown@define.ts:86 — all four exist; the LLD cites the files (no exact lines), so no drift in the artifact itself. | None required — symbols resolve. |
| migration/defect13 | citation | LOW | assisted | The LLD renderer re-embeds the HLD framework-summary in a '## HLD context' section around src/workflow/artifacts/lld.ts:293 (defect #13, the de-dup target). | SUBSTANTIVELY CONFIRMED, line drift: the review doc (docs/artifact-document-template-review.md:17) confirms renderLldMarkdown's '## HLD context' section (cited at lld.ts:282); the exact line 293 reads `const eh = meta.epicHash;`, so the de-dup target sits ~282-293, not precisely 293. | None required — the defect + de-dup target are real; anchor is approximate. Build locates the actual '## HLD context' emit. |
| interaction/sc1 | citation | LOW | manual | S001's renderFunctionalRequirementsSection exists in src/workflow/artifacts/functional-definition.ts (near line 87) and is consumed unchanged. | CONFIRMED exact: `export function renderFunctionalRequirementsSection(fd: FunctionalDefinition...)` at functional-definition.ts:87; consumed unchanged as designed. | None — citation sound. |
| errorpaths/boundary | citation | LOW | manual | Scope-boundary validators (BannedPattern regexes over rendered markdown) live in src/workflow/synthesizer.ts around line 151. | CONFIRMED exact: `const BOUNDARY_RULES: Partial<Record<WorkflowName, readonly BannedPattern[]>>` at synthesizer.ts:151 — the boundary validators exist where cited and must be updated for the new constructs. | None — citation sound. |
| elicitation/synth-gate | citation | LOW | manual | The defineSynthesizer body schema in src/workflow/orchestrator.ts (around line 937) requires flavor/problem/nonGoals/assumptions/constraints/stories/openQuestions under additionalProperties:false and does NOT include summary/functionalDefinition/contextRefs — so those fields have no upstream source today. | CONFIRMED exact: orchestrator.ts:937 reads `required: ['flavor','problem','nonGoals','assumptions','constr...` — the defineSynthesizer (function@879) body schema; it omits summary/functionalDefinition/contextRefs under additionalProperties:false. This grounds the core elicitation-gap finding. | None — the gap is real and correctly cited; the build extends this schema. |
| elicitation/no-summary-in-synth | semantic | LOW | manual | No DEF/HLD/LLD/PLAN synthesizer body schema currently elicits a 'summary'; the only 'summary' in any orchestrator synthesizer schema is the stub/brainstorm one (around orchestrator.ts:315). | CONFIRMED: orchestrator.ts:315 reads `required: ['title','summary','bulletList']` and :291 is the `stub` synthesizer — the only synthesizer 'summary' is the stub/brainstorm one, as claimed; DEF/HLD/LLD/PLAN bodies have none. | None — semantic claim verified. |
| elicitation/runner-prompts | citation | LOW | manual | The per-phase step prompts S002 will extend exist as StepRunners in the runner index files (define epic.frame, design-epic framework.write, design-story contract.detail, plan tasks.finalize). | CONFIRMED: the step ids epic.frame / framework.write / contract.detail / tasks.finalize appear in the runner sources (and the plan HLD enumerates the plan recipe incl. tasks.finalize). The prompts S002 extends exist. | None — citation sound. |
| data/storage-id-scheme | semantic | LOW | manual | The artifact-id scheme (DEF-/HLD-/LLD- prefixes) that SharedContextRef.sourceArtifactId + deriveHldContextRef point at is defined in src/workflow/storage.ts. | SUPPORTED: grep shows storage.ts artifact-id peers (defineArtifactId/planArtifactId, SPEC-<hash>), establishing the prefix scheme deriveHldContextRef + SharedContextRef rely on. DEF-/HLD-/LLD- follow the same pattern. | None required — build reads the exact HLD- const in storage.ts. |
| interaction/sc-ownership | cross-artifact | LOW | manual | Per the HLD, sc3 is owned by S002 (implements) and sc1 is owned by S001 (consumed only); the LLD implements only sc3 and consumes sc1. | CONSISTENT with the embedded HLD context slice (workflow-guaranteed verbatim): sc3 ownedByStory s2 (implements), sc1 ownedByStory s1 (consumed only). No probe needed. | None — ownership trace holds. |
| alternatives/chosen | closed-union | LOW | manual | Exactly three alternatives (a1, a2, a3) were considered and a2 (externalized per-type template files on the template-loader cascade) is chosen. | SELF-CONTAINED + consistent: exactly a1/a2/a3, a2 chosen, matching the stakeholder request + the s3 judgment. | None — alternatives set complete. |
| scope/s001-split | semantic | LOW | manual | The S001 functionalDefinition elicitation (define epic.frame/stories.compose prompts + defineSynthesizer schema) is explicitly OUT of S002 scope — a separate S001 back-fill — and the FR section stays absent-safe until then. | CONSISTENT: functionalDefinition exists in the HLD + artifacts (S001), and the LLD explicitly scopes the FR-elicitation OUT to a separate S001 back-fill while consuming renderFunctionalRequirementsSection unchanged (absent-safe). A deliberate, documented scope decision, not a gap. | None — scope split is explicit and honoured. |
