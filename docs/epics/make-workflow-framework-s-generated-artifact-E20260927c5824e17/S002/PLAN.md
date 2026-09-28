<!-- insrc:artifact PLAN-c5824e17eccf0c14-s2 -->

# Plan: E20260928c5824e17:S002

**Epic:** `make-workflow-framework-s-generated-artifact`
**LLD run:** `wf-1790535602476-cum1lu`
**LLD effective hash:** `a28e2f107661...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** sc3 types + optional body fields | M | — | unit: sc3 types compile + optional summary/contextRefs are absent-safe on each body type | [[c1]] [[c2]] |
| 2 | **`t2`** Shared render engine + helpers | L | `t1` | unit: renderFromFormat: envelope + ordered sections + References; throws on missing required binding; unit: computeSectionNumbers: body 1..N, per-item N.M, envelope unnumbered; unit: sectionSlug: determinism + numeric-suffix disambiguation + number-prefixed anchors; unit: renderSharedContextReference + deriveHldContextRef: reference-line shape, engine-derived HLD ref, degraded literal on malformed id | [[c1]] [[c3]] |
| 3 | **`t3`** Bundled per-type FORMAT templates + default DocumentFormats | M | `t1` | unit: per-type DocumentFormat constants: summary SectionSpec audience tag + numbered:false; section order matches the reviewed mocks; integration: loadTemplate: resolves each bundled kind, per-repo override wins, missing/corrupt template throws | [[c1]] [[c2]] |
| 4 | **`t4`** Reshape DEF + HLD renderers via the engine | L | `t2`, `t3` | unit: renderDefineMarkdown: new numbered format + short H1 (defect #4) + audience-tagged Summary binding foregrounding sc1 FRs; unit: renderHldMarkdown: new numbered format heading-literal suite | [[c2]] [[c5]] |
| 5 | **`t5`** Reshape LLD + PLAN renderers + HLD-context de-dup | L | `t2`, `t3` | unit: renderLldMarkdown: HLD-context reference (defect #13) + Summary binding + explicit-contextRefs precedence; unit: renderPlanMarkdown: per-task sub-template + numbering heading-literal suite | [[c2]] [[c5]] |
| 6 | **`t6`** Summary/audience/contextRefs elicitation across phases | L | `t1` | unit: step schemas (epic.frame/framework.write/contract.detail/tasks.finalize) admit summary(+audience); unit: synthesizer bodies (define/design.epic/design.story/plan) admit summary/contextRefs; a step-emitted summary flows through; define FR fields untouched | [[c1]] [[c2]] |
| 7 | **`t7`** Boundary-regex update + end-to-end integration tests | M | `t4`, `t5`, `t6` | integration: BOUNDARY_RULES admit new constructs + still reject real scope leakage over the new rendered output; integration: end-to-end synthesize of DEF/HLD/LLD/PLAN with elicited summary; absent-safe no-optional-data artifact renders fully | [[c3]] [[c4]] [[c5]] |

### E20260928c5824e17:S002:T001 — sc3 types + optional body fields

Add the sc3 model in a new src/workflow/artifacts/format/ module: Audience, SharedContextRef, SectionSpec (incl. numbered flag + source union), ItemFormat, DocumentFormat. Add optional summary {prose, audience?} to Define/Hld/Lld/Plan bodies and contextRefs to LldBody. Additive types only; additionalProperties:false retained; no behavior change yet.

**Acceptance checks:**
- Audience/SharedContextRef/SectionSpec/ItemFormat/DocumentFormat exported from format/
- optional summary on each body type + contextRefs on LldBody; existing bodies still type-check
- tsc clean

### E20260928c5824e17:S002:T002 — Shared render engine + helpers

Author renderFromFormat (envelope + ordered sections + References), computeSectionNumbers (literal section/nested ordinals; envelope unnumbered), sectionSlug (number-prefixed, collision-disambiguated), renderSharedContextReference (reference line + degraded literal), deriveHldContextRef (engine-derived HLD ref from epicHash). Fail-fast on a required section with no binding.

**Acceptance checks:**
- renderFromFormat emits envelope + ordered numbered sections; throws on missing required binding
- computeSectionNumbers: 1..N body, N.M items, envelope absent
- deriveHldContextRef returns {sourceArtifactId:'HLD-<epicHash>', sectionId:'2-framework-summary'}

### E20260928c5824e17:S002:T003 — Bundled per-type FORMAT templates + default DocumentFormats

Add src/assets/artifacts/templates/{define,hld,lld,plan}.md + the default DocumentFormat constant per kind (section order, content guidance, audience, per-item sub-templates, named S003/S004 extension points), resolved via the existing loadTemplate cascade; wire copy-assets.mjs.

**Acceptance checks:**
- loadTemplate resolves each bundled kind; a per-repo override wins
- the four DocumentFormat constants match the reviewed mocks (docs/epics/.../S002/mocks/)
- missing/corrupt template throws a descriptive Error

### E20260928c5824e17:S002:T004 — Reshape DEF + HLD renderers via the engine

Reshape renderDefineMarkdown + renderHldMarkdown to render via loadTemplate(kind) + renderFromFormat with per-section bindings (short H1, item-scoped Summary, TOC, numbering, References; DEF Summary audience business|product + bound sc1 FR section). Update the define/hld heading-literal test suites to the new format.

**Acceptance checks:**
- DEF/HLD render the new numbered envelope; H1 no longer duplicates the first body paragraph (defect #4)
- DEF Summary is audience-tagged + foregrounds sc1 FR outcomes; FR section binds renderFunctionalRequirementsSection unchanged
- define/hld heading-literal suites updated + green

### E20260928c5824e17:S002:T005 — Reshape LLD + PLAN renderers + HLD-context de-dup

Reshape renderLldMarkdown (HLD-context rendered as a deriveHldContextRef reference — the ac2 de-dup, defect #13) + renderPlanMarkdown via the engine. Update the lld/plan heading-literal suites.

**Acceptance checks:**
- LLD HLD-context is a SharedContextRef reference line, not the copied framework-summary; explicit contextRefs take precedence over the engine-derived default
- PLAN renders per-task sub-template + numbering
- lld/plan heading-literal suites updated + green

### E20260928c5824e17:S002:T006 — Summary/audience/contextRefs elicitation across phases

Extend the step prompts + step schemas (define epic.frame, design.epic framework.write, design.story contract.detail, plan tasks.finalize) to elicit summary(+audience); extend the four synthesizer body schemas in orchestrator.ts to admit summary/audience (+ contextRefs for LLD) keeping additionalProperties:false; add per-phase checklist items. Add runner + synthesize-path tests. Do NOT touch the S001 functionalDefinition elicitation (already shipped).

**Acceptance checks:**
- each extended step schema admits summary(+audience); each synthesizer body admits summary/contextRefs (a step-emitted summary flows through, not rejected)
- checklist items added per phase
- runner + synthesize-path tests green

### E20260928c5824e17:S002:T007 — Boundary-regex update + end-to-end integration tests

Update the synthesizer.ts:151 BOUNDARY_RULES to admit the new constructs (References block, TOC, numbered headings, per-item checkboxes) while still rejecting genuine scope leakage; add integration tests proving a full synthesize of each type produces the new format + a populated Summary + the HLD-context reference and passes the updated validators; a no-optional-data artifact stays absent-safe.

**Acceptance checks:**
- BOUNDARY_RULES admit the new constructs; real scope leakage still rejected
- integration: full synthesize of DEF/HLD/LLD/PLAN passes end-to-end
- absent-safe: an artifact with no summary/contextRefs/functionalDefinition renders fully

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| renderFromFormat (ordered sections, envelope, References, required-binding throw) | `t2` |
| computeSectionNumbers (1..N body, N.M items, envelope unnumbered) | `t2` |
| sectionSlug (determinism + numeric-suffix disambiguation + number-prefixed anchors) | `t2` |
| renderSharedContextReference + deriveHldContextRef (reference-line shape; engine-derived HLD ref; degraded literal on malformed id) | `t2` |
| renderDefineMarkdown | `t4` |
| renderHldMarkdown | `t4` |
| renderLldMarkdown | `t5` |
| renderPlanMarkdown | `t5` |
| renderDefineMarkdown Summary binding | `t4` |
| renderLldMarkdown Summary binding | `t5` |
| the per-type DocumentFormat summary SectionSpec (audience tag + numbered:false) | `t3` |
| runners/design-epic framework.write schema | `t6` |
| runners/design-story contract.detail schema | `t6` |
| runners/plan tasks.finalize schema | `t6` |
| runners/define epic.frame schema | `t6` |
| defineSynthesizer/designEpicSynthesizer/designStorySynthesizer/planSynthesizer body schemas (orchestrator.ts) | `t6` |
| loadTemplate (bundled default + per-repo override tier) | `t3` |
| BOUNDARY_RULES over the new rendered output (synthesizer.ts:151) | `t7` |
| the missing-template throw path | `t3` |
| end-to-end synthesize of DEF/HLD/LLD/PLAN with elicited summary | `t7` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s2 contractDetails — sc3 API surface (loadTemplate/renderFromFormat/computeSectionNumbers/sectionSlug/renderSharedContextReference/deriveHldContextRef) + surfaceLevel`
- **[[c2]]** `prior-artifact` `LLD s2 dataModelChanges — sc3 types, per-type FORMAT templates, body summary/audience + LldBody.contextRefs, renderer invariant-change, elicitation entries`
- **[[c3]]** `prior-artifact` `LLD s2 errorPaths — required-binding fail-fast, missing-template throw, malformed contextRef degraded literal, boundary-regex trip`
- **[[c4]]** `prior-artifact` `LLD s2 testStrategy — unit + integration levels; acceptance mapping ac1/ac2/ac3`
- **[[c5]]** `prior-artifact` `LLD s2 migration — 7 rollbackable steps: types → engine → templates → renderers → elicitation → synth schemas → boundary regexes`
