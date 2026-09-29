<!-- insrc:artifact PLAN-c5824e17eccf0c14-s4 -->

# Plan: E20260928c5824e17:S004

**Epic:** `make-workflow-framework-s-generated-artifact`
**LLD run:** `wf-1790604249777-g70qgy`
**LLD effective hash:** `a28e2f107661...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** UX companion module core: UxDefinition type + vendored Adaptive Cards schema + validate/toIr | M | — | unit: validateUxDefinition: schema-valid -> no HIGH; schema-invalid (unknown card element / missing required field) -> HIGH DimensionFinding; malformed vendored asset -> UxDefinitionError; unit: uxDefinitionToIr: a valid UxDefinition maps to the expected DocumentIR shape; unit: ux-schema.ts: UX_DEFINITION_PROPERTY_SCHEMA compiles under the shared ajv and the vendored adaptive-cards.schema.json asset loads (boot-time asset validator) | [[c1]] |
| 2 | **`t2`** Render the ux-mock companion + wire the renderUxCompanionForBody finalize seam | M | `t1` | unit: renderUxCompanion / renderUxCompanionForBody: present+valid uxDefinition -> kind:'ux-mock' CompanionArtifactRef; absent uxDefinition -> undefined (content gate); a stubbed assembleShell throw is caught and yields undefined (document still produced) | [[c1]] [[c2]] |
| 3 | **`t3`** Additive body fields: uxDefinition? + adherence? (+ AdherenceDimension) with admit-but-never-emit synthesizer schemas | M | `t1` | unit: body field-add: a body without uxDefinition/adherence renders byte-identical to the pre-S004 output (omit-slot); with them present the UX section + companion link appear; unit: synthesizer body schemas: additionalProperties:false preserved; uxDefinition/adherence admitted in the schema but never emitted by the synth; unit: formats.ts: the already-declared 'ux' extension section (formats.ts:87) carries the UX section/mock reference; formats.test.ts extension-section assertion stays green; unit: AdherenceDimension enum: the multiselect enum validates the recorded selection against 'ux'\\|'diagram-er'\\|'diagram-sequence'\\|'diagram-component'\\|'functional-coverage' | [[c3]] |
| 4 | **`t4`** Tighten hasDiagramReferences to exclude 'ux-mock' | S | — | unit: hasDiagramReferences(subject): VERIFY it returns false for a ux-mock-only subject (excludes 'ux-mock', counts only diagram-* kinds) | [[c6]] |
| 5 | **`t5`** First-class 'ux' ReviewDimension: union literal + judgeUx + hasUxAcceptance gate | M | `t3`, `t4` | unit: hasUxAcceptance(subject): true when the recorded adherence selection includes 'ux' OR a uxDefinition is present; false otherwise; unit: judgeUx: emits dimension:'ux' findings; HIGH when uxAcceptance is required but no uxDefinition/ux-mock evidence is present | [[c4]] [[c5]] |
| 6 | **`t6`** Lock-step wiring: expectedDimensions push + union recorded selection + DEFAULT_JUDGES 'ux' slot | M | `t5` | unit: expectedDimensions: pushes 'ux' when hasUxAcceptance(subject); UNIONS the body's recorded adherence selection with the content-derived gates; base four unchanged when neither fires; unit: buildJudgementsSchema: admits 'ux' in the judgements[].dimension enum exactly when 'ux' is in the computed dims; unit: runner DEFAULT_JUDGES / effectiveJudges: carries a 'ux' JudgeSlot; order pinned (extend runner.test.ts:273 pinned order to include 'ux' at its slot); a drift (dim present one side, absent the other) surfaces via the emitted-judgements validation (handler.test.ts negative table); unit: verdict fold: a HIGH 'ux' finding withholds completion via computeReviewVerdict + codeReview.enforce WITHOUT forking the reducer (adherence/conventions/coverage/quality/functional-coverage/diagram/ux all fold identically) | [[c4]] [[c7]] |
| 7 | **`t7`** Cross-cutting integration tests: end-to-end UX generation + completion gating | M | `t2`, `t3`, `t6` | integration: orchestrator finalize: a body with a valid uxDefinition produces a sibling ux-mock HTML companion AND a link + UX section in the core markdown (never inlined); renderUxCompanionForBody runs alongside renderErCompanionForBody so a doc with both an ER and a UX definition emits both companions; integration: code-review handler: a subject requiring uxAcceptance with an adhering build passes; with a missing/mismatched UX design the ux dimension blocks completion; a subject with neither uxDefinition nor adherence yields the base four dimensions and byte-identical behaviour | [[c2]] [[c3]] [[c6]] [[c7]] |

### E20260928c5824e17:S004:T001 — UX companion module core: UxDefinition type + vendored Adaptive Cards schema + validate/toIr

Add src/workflow/artifacts/companion/ux.ts (UxDefinition Adaptive Cards card-subset type + validateUxDefinition(uxDef:unknown, fnDef?):readonly DimensionFinding[] + uxDefinitionToIr(uxDef):DocumentIR) and ux-schema.ts (UX_DEFINITION_PROPERTY_SCHEMA + UX_CONTENT_GATE_RULE); vendor src/assets/artifacts/schemas/adaptive-cards.schema.json (no $schema meta-URI, shared draft-07 ajv, like linkml-metamodel.schema.json) + a boot-time asset validator mirroring validateLinkmlMetamodelAsset. validateUxDefinition validates via the shared validateAgainstSchema (HIGH finding on schema-invalid; UxDefinitionError only on unloadable asset). Mirrors er.ts/metamodel.ts exactly.

**Acceptance checks:**
- ux.ts exports UxDefinition, validateUxDefinition, uxDefinitionToIr; ux-schema.ts exports UX_DEFINITION_PROPERTY_SCHEMA + UX_CONTENT_GATE_RULE
- adaptive-cards.schema.json is present under src/assets/artifacts/schemas/ and loads through the shared ajv; a boot-time validator asserts it
- a schema-valid uxDefinition yields no HIGH finding; a schema-invalid one yields a HIGH DimensionFinding; an unloadable asset raises UxDefinitionError
- tsc clean; no change to er.ts/metamodel.ts behaviour

### E20260928c5824e17:S004:T002 — Render the ux-mock companion + wire the renderUxCompanionForBody finalize seam

Add renderUxCompanion(uxDef, title, destPath, opts?):Promise<CompanionArtifactRef> in companion/render.ts (deterministic HTML ux-mock via the existing docgen assembleShell, kind:'ux-mock', catches assembleShell failure -> no picture) and renderUxCompanionForBody(body, destPath, repoPath):Promise<CompanionArtifactRef|undefined> in orchestrator.ts, wired alongside renderErCompanionForBody (orchestrator.ts:1498) in the SAME finalize seam so a document can carry both an ER diagram and a UX mock. Absent uxDefinition -> undefined (content gate) -> byte-identical render. CompanionKind/CompanionArtifactRef reused unchanged.

**Acceptance checks:**
- renderUxCompanion returns a kind:'ux-mock' CompanionArtifactRef for a validated uxDefinition; a stubbed assembleShell throw is caught and yields no companion
- renderUxCompanionForBody returns undefined when uxDefinition is absent (content gate) and a linked ux-mock ref when present+valid
- finalize invokes renderUxCompanionForBody alongside renderErCompanionForBody; a body with both an ER and a UX definition emits both companions
- the ux mock is LINKED from the core markdown, never inlined (k1)

### E20260928c5824e17:S004:T003 — Additive body fields: uxDefinition? + adherence? (+ AdherenceDimension) with admit-but-never-emit synthesizer schemas

Add the two optional body fields uxDefinition?: UxDefinition and adherence?: { readonly dimensions: readonly AdherenceDimension[] } (AdherenceDimension = 'ux'|'diagram-er'|'diagram-sequence'|'diagram-component'|'functional-coverage') to the artifact body interfaces (the four doc bodies + HLD/LLD bodies where uxDefinition/adherence are authored), and admit-but-never-emit both in the synthesizer body schemas (additionalProperties:false preserved; uxDefinition content-gated like erDefinition, adherence author-selectable). SCOPE NOTE (per s3 critique): the BuildRecord body is OUT OF SCOPE unless it authors a uxDefinition; the omit-slot pattern is uniform so absent-field byte-identity holds everywhere. Absent-safe, forward-only (k6); the 'ux' doc-format extension section already exists (formats.ts:87). Mirrors the S001 functionalDefinition / S003 erDefinition four-times-shipped omit-slot pattern.

**Acceptance checks:**
- uxDefinition? and adherence? are optional on the doc/HLD/LLD body interfaces; AdherenceDimension type/enum defined; BuildRecord left unchanged
- the synthesizer body schemas admit both fields with additionalProperties:false preserved and never emit them
- a body without the fields renders byte-identical to pre-S004 output (omit-slot); with them present the UX section/companion link appears
- formats.test.ts extension-section assertion stays green

### E20260928c5824e17:S004:T004 — Tighten hasDiagramReferences to exclude 'ux-mock'

Remove the `|| c.kind === 'ux-mock'` disjunct from hasDiagramReferences (dimensions/diagram/index.ts:53) so ONLY diagram-* companion kinds trigger the 'diagram' dimension; a ux-mock-only subject must NOT trigger 'diagram' (it triggers the first-class 'ux' dimension via hasUxAcceptance). Leave the index.ts:59 unknownTypeOf ux-mock->'ux' mapping untouched (unused on the first-class path).

**Acceptance checks:**
- hasDiagramReferences returns false for a subject whose only companion is a ux-mock ref
- hasDiagramReferences still returns true for erDefinition / diagram-mermaid / diagram-html subjects (no regression)
- a regression test pins the ux-mock exclusion

### E20260928c5824e17:S004:T005 — First-class 'ux' ReviewDimension: union literal + judgeUx + hasUxAcceptance gate

Add 'ux' to the ReviewDimension union (types.ts:36). Add a judgeUx dimension judge (a dimensions/ux/ module, or alongside functional-coverage) that judges the built experience against the referenced ux-mock companion + authored uxDefinition and reports DimensionFinding{ dimension:'ux' } (HIGH when uxAcceptance required but no uxDefinition/ux-mock evidence). Add hasUxAcceptance(subject):boolean (true when the recorded adherence selection includes 'ux' OR a uxDefinition is present), mirroring hasFunctionalDefinition/hasDiagramReferences. Validate the recorded adherence selection against the AdherenceDimension set.

**Acceptance checks:**
- ReviewDimension union includes 'ux'
- judgeUx reports dimension:'ux'; emits HIGH when uxAcceptance is required but no uxDefinition/ux-mock is present
- hasUxAcceptance returns true when the adherence selection includes 'ux' or a uxDefinition is present, false otherwise
- the recorded adherence selection is validated against the AdherenceDimension set

### E20260928c5824e17:S004:T006 — Lock-step wiring: expectedDimensions push + union recorded selection + DEFAULT_JUDGES 'ux' slot

In ONE change, extend expectedDimensions (handler.ts:65) to push 'ux' when hasUxAcceptance(subject) AND union the body's recorded adherence selection with the content-derived gates; add the matching 'ux' JudgeSlot to the runner DEFAULT_JUDGES (runner.ts:114) so effectiveJudges/buildJudgementsSchema stay lock-step (buildJudgementsSchema auto-widens from the computed dims); update the runner.test.ts:273 pinned order to include 'ux' at its slot. Both sides flipped together so the emitted-judgements validation never sees a one-sided drift.

**Acceptance checks:**
- expectedDimensions pushes 'ux' when hasUxAcceptance and unions the recorded adherence selection with the content-derived gates; base four unchanged when neither fires
- DEFAULT_JUDGES carries a 'ux' JudgeSlot; effectiveJudges + buildJudgementsSchema include 'ux' iff computed; runner.test.ts pinned order updated to include 'ux'
- a HIGH 'ux' finding folds through computeReviewVerdict + codeReview.enforce WITHOUT forking the reducer (k4)
- no one-sided dimension drift: the emitted-judgements validation accepts the 'ux'-inclusive set

### E20260928c5824e17:S004:T007 — Cross-cutting integration tests: end-to-end UX generation + completion gating

Integration coverage across the orchestrator finalize seam and the code-review handler: a generated design doc with a valid uxDefinition produces a sibling ux-mock HTML companion + a UX section/link in the core markdown (never inlined); a doc with both an ER and a UX definition emits both companions; a subject requiring uxAcceptance with a missing/mismatched UX design blocks completion while an adhering build passes; a subject with neither uxDefinition nor adherence yields the base four dimensions and byte-identical behaviour.

**Acceptance checks:**
- orchestrator finalize integration test proves the linked ux-mock companion + UX section for a uxDefinition body, and both companions for an er+ux body
- code-review handler integration test proves a required-but-missing UX design blocks completion and an adhering build passes
- an absent-fields subject yields the base four dimensions and byte-identical output
- full suite green under tsx --test

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| validateUxDefinition — schema-valid uxDefinition yields no HIGH finding; schema-invalid (unknown card element / missing required field) yields a HIGH DimensionFinding; malformed vendored asset raises UxDefinitionError | `t1` |
| uxDefinitionToIr — a valid UxDefinition maps to the expected DocumentIR shape | `t1` |
| renderUxCompanion / renderUxCompanionForBody — present+valid uxDefinition returns a kind:'ux-mock' CompanionArtifactRef; absent uxDefinition returns undefined (content gate); a stubbed assembleShell throw is caught and yields undefined (document still produced) | `t2` |
| ux-schema.ts — UX_DEFINITION_PROPERTY_SCHEMA compiles under the shared ajv and the vendored adaptive-cards.schema.json asset loads (boot-time asset validator) | `t1` |
| hasUxAcceptance(subject) — true when the recorded adherence selection includes 'ux' OR a uxDefinition is present; false otherwise | `t5` |
| hasDiagramReferences(subject) — VERIFY it returns false for a ux-mock-only subject (excludes 'ux-mock', counts only diagram-* kinds) | `t4` |
| judgeUx — emits dimension:'ux' findings; HIGH when uxAcceptance is required but no uxDefinition/ux-mock evidence is present | `t5` |
| body field-add — a body without uxDefinition/adherence renders byte-identical to the pre-S004 output (omit-slot); with them present the UX section + companion link appear | `t3` |
| synthesizer body schemas — additionalProperties:false preserved; uxDefinition/adherence admitted in the schema but never emitted by the synth | `t3` |
| formats.ts — the already-declared 'ux' extension section (formats.ts:87) carries the UX section/mock reference; formats.test.ts extension-section assertion stays green | `t3` |
| AdherenceDimension enum — the multiselect enum validates the recorded selection against 'ux'\|'diagram-er'\|'diagram-sequence'\|'diagram-component'\|'functional-coverage' | `t3`, `t5` |
| expectedDimensions — pushes 'ux' when hasUxAcceptance(subject); UNIONS the body's recorded adherence selection with the content-derived gates; base four unchanged when neither fires | `t6` |
| buildJudgementsSchema — admits 'ux' in the judgements[].dimension enum exactly when 'ux' is in the computed dims | `t6` |
| runner DEFAULT_JUDGES / effectiveJudges — carries a 'ux' JudgeSlot; order pinned (extend runner.test.ts:273 pinned order to include 'ux' at its slot); a drift (dim present one side, absent the other) surfaces via the emitted-judgements validation (handler.test.ts negative table) | `t6` |
| verdict fold — a HIGH 'ux' finding withholds completion via computeReviewVerdict + codeReview.enforce WITHOUT forking the reducer (adherence/conventions/coverage/quality/functional-coverage/diagram/ux all fold identically) | `t6` |
| orchestrator finalize — a body with a valid uxDefinition produces a sibling ux-mock HTML companion AND a link + UX section in the core markdown (never inlined); renderUxCompanionForBody runs alongside renderErCompanionForBody so a doc with both an ER and a UX definition emits both companions | `t7`, `t2` |
| code-review handler — a subject requiring uxAcceptance with an adhering build passes; with a missing/mismatched UX design the ux dimension blocks completion; a subject with neither uxDefinition nor adherence yields the base four dimensions and byte-identical behaviour | `t7` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s4 dataModelChanges: 'src/workflow/artifacts/companion/ (UX peer files)' — UxDefinition + validateUxDefinition + uxDefinitionToIr + renderUxCompanion + vendored adaptive-cards schema`
- **[[c2]]** `prior-artifact` `LLD s4 contractDetails.api: renderUxCompanionForBody (new finalize seam, peer of renderErCompanionForBody at orchestrator.ts:1498)`
- **[[c3]]** `prior-artifact` `LLD s4 dataModelChanges: 'artifact body — uxDefinition? + adherence?' additive optional fields + AdherenceDimension + admit-but-never-emit synthesizer schemas`
- **[[c4]]** `prior-artifact` `LLD s4 dataModelChanges: 'ReviewDimension union (types.ts:36) + DEFAULT_JUDGES (runner.ts) + buildJudgementsSchema' — add 'ux' literal + lock-step slot`
- **[[c5]]** `prior-artifact` `LLD s4 dataModelChanges: 'UX review dimension judge + hasUxAcceptance gate' — judgeUx (dimension:'ux') + hasUxAcceptance predicate`
- **[[c6]]** `prior-artifact` `LLD s4 contractDetails.api: hasDiagramReferences (existing, verified — must exclude ux-mock; index.ts:51-55)`
- **[[c7]]** `prior-artifact` `LLD s4 contractDetails.api: expectedDimensions (reshaped — add the 'ux' conditional push + union the recorded adherence selection; handler.ts:65-70)`
