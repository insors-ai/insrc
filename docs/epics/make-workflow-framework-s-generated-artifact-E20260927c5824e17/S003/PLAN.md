<!-- insrc:artifact PLAN-c5824e17eccf0c14-s3 -->

# Plan: E20260928c5824e17:S003

**Epic:** `make-workflow-framework-s-generated-artifact`
**LLD run:** `wf-1790576670511-dxpseq`
**LLD effective hash:** `a28e2f107661...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** sc4 companion types + ErDefinition (LinkML subset) types + absent-safe body fields | S | — | unit: ErDefinition/companions/erDefinition body fields are optional + absent-safe (older bodies type-check + render unchanged) | [[c1]] [[c2]] |
| 2 | **`t2`** Vendor the LinkML metamodel JSON Schema asset + boot asset-check | S | `t1` | integration: boot asset-check fails loudly when the vendored metamodel schema is absent | [[c3]] |
| 3 | **`t3`** resolveCompanionPath sibling-path helper | S | `t1` | unit: resolveCompanionPath sibling-of-.md; throws for story-scoped missing story | [[c4]] |
| 4 | **`t4`** validateErDefinition (ajv metamodel + referential integrity + FR-consistency) | M | `t1`, `t2` | unit: validateErDefinition: metamodel-valid -> no findings; shape/cardinality violation -> HIGH breach (ajv vs vendored metamodel); unit: validateErDefinition: dangling relationship range -> HIGH referential-integrity breach; unit: validateErDefinition: ER<->FR mismatch -> finding when FunctionalDefinition supplied; unit: validateErDefinition never reads a rendered file (assert no companion fs read) | [[c2]] [[c3]] [[c5]] |
| 5 | **`t5`** erDefinitionToIr + renderErCompanion (deterministic assembleShell render) | M | `t3`, `t4` | unit: erDefinitionToIr: classes->entities, scalar slots->attributes, class slots->relationships w/ crow's-foot cardinality; deterministic; unit: renderErCompanion: builds IR + spied assembleShell + writes sibling; non-ok -> no file + DiagramGenerationError; unit: renderErCompanion renders ONLY via assembleShell (local docgen seam) — no generateDocument, no Python, no cloud REST | [[c1]] [[c5]] [[c6]] |
| 6 | **`t6`** assessDiagramNeed content-gate | S | `t1` | unit: assessDiagramNeed: empty/no-visual, type:'er' when warranted, fail-safe on provider error (one serial call) | [[c7]] |
| 7 | **`t7`** DiagramAdherenceHandler registry + the 'er' handler | M | `t4` | unit: registerDiagramHandler/diagramHandlerFor: S003 registers 'er'; duplicate throws DuplicateDiagramHandlerError | [[c8]] [[c5]] |
| 8 | **`t8`** 'diagram' ReviewDimension + judgeDiagram dispatcher + hasDiagramReferences gate wiring | M | `t7` | unit: judgeDiagram dispatches the ER companion to the 'er' handler (spy) + aggregates; an unregistered type yields a LOW observation; unit: effectiveJudges/expectedDimensions/buildJudgementsSchema include 'diagram' iff hasDiagramReferences; validateArtifact accepts ran==expected, rejects drift | [[c8]] [[c6]] |
| 9 | **`t9`** Wire the content-gate + render into document generation + render the sc4 reference in S002 slots (strictly additive) | M | `t5`, `t6` | unit: renderErCompanion returns a linked reference; erDefinition stays in-body, companion out-of-body (never inlined); integration: a no-ER subject omits the companion + the 'diagram' dimension | [[c1]] [[c4]] |
| 10 | **`t10`** Tests: ER validation/transform/render/content-gate + registry/dispatcher + conditional-dimension + integration + boot-asset-check | M | `t8`, `t9` | integration: runCodeReview over a valid-erDefinition subject folds a DimensionResult{diagram} into the verdict (pass); integration: an invalid/inconsistent erDefinition folds to block + enforceCodeReviewGate withholds under enforce=true, advisory-warn under false; integration: a no-ER subject runs base dimensions; CR record byte-shape-compatible with pre-S003; unit: ER handler flags a referenced-but-absent companion (ac3) | [[c9]] |

### E20260928c5824e17:S003:T001 — sc4 companion types + ErDefinition (LinkML subset) types + absent-safe body fields

Add src/workflow/artifacts/companion/types.ts (CompanionArtifactRef, CompanionKind) and companion/er.ts type block (ErDefinition/ErClass/ErSlot). Add absent-safe optional erDefinition?/companions? to HldBody + LldBody. Additive types only, no behaviour yet.

**Acceptance checks:**
- CompanionArtifactRef + ErDefinition/ErClass/ErSlot compile with the LLD field shapes
- erDefinition?/companions? are optional + absent-safe on HldBody/LldBody (older bodies still type-check)
- tsc clean; no renderer/behaviour change yet

### E20260928c5824e17:S003:T002 — Vendor the LinkML metamodel JSON Schema asset + boot asset-check

Add src/assets/artifacts/schemas/linkml-metamodel.schema.json (pinned LinkML metamodel subset for ClassDefinition/SlotDefinition + cardinality) and a boot-time asset validator mirroring docgen/asset-validator.ts that fails loudly if it is missing/unparseable. copy-assets already ships src/assets.

**Acceptance checks:**
- the vendored schema file is present + parseable + records the LinkML version
- boot asset-check throws an actionable error when the schema is absent/corrupt
- the schema validates a known-good ErDefinition and rejects a malformed one via ajv

### E20260928c5824e17:S003:T003 — resolveCompanionPath sibling-path helper

Add resolveCompanionPath to path-scheme.ts returning a sibling of resolveArtifactMdPath's directory, reusing the story-scoped guard (path-scheme.ts:126-132). Pure construction, no disk read.

**Acceptance checks:**
- returns a path in the same directory resolveArtifactMdPath computes for the same identity
- throws for a story-scoped kind missing identity.story
- rejects a companionFileName containing path separators

### E20260928c5824e17:S003:T004 — validateErDefinition (ajv metamodel + referential integrity + FR-consistency)

In companion/er.ts, add validateErDefinition(erDef, fnDef?) returning DimensionFinding[]: (1) validateAgainstSchema vs the vendored metamodel; (2) referential integrity (relationship slot ranges resolve to defined classes; identifiers present); (3) FR/data-model consistency using the consumed sc1 FunctionalDefinition. Operates on the JSON element only — never reads a rendered file.

**Acceptance checks:**
- metamodel-invalid erDef -> HIGH breach; sound erDef -> no findings
- dangling relationship range -> HIGH referential-integrity breach
- ER<->FR mismatch -> finding when a FunctionalDefinition is supplied
- no filesystem read of any companion occurs during validation

### E20260928c5824e17:S003:T005 — erDefinitionToIr + renderErCompanion (deterministic assembleShell render)

In companion/er.ts + companion/render.ts, add erDefinitionToIr(erDef): DocumentIR (classes->entity nodes, scalar slots->attributes, class-ranged slots->relationship edges w/ crow's-foot cardinality) and renderErCompanion(erDef, title, destPath) that builds the IR + awaits docgen assembleShell + writes the sibling HTML + returns a CompanionArtifactRef. Deterministic; non-ok DocGenOutcome -> DiagramGenerationError + omit.

**Acceptance checks:**
- erDefinitionToIr is deterministic (same erDef -> same IR) and maps scalar vs class-ranged slots correctly
- renderErCompanion writes the sibling via assembleShell and returns a diagram-mermaid CompanionArtifactRef
- a non-ok assembleShell outcome yields DiagramGenerationError + no file written
- no generateDocument, no Python, no cloud REST is exercised

### E20260928c5824e17:S003:T006 — assessDiagramNeed content-gate

In companion/assess.ts, add assessDiagramNeed(doc, provider): one serial provider call returning DiagramNeedAssessment { warranted, diagrams:[{type:'er',ofSectionId?,rationale}] }; empty when no visual warranted; fail-safe to {warranted:false,diagrams:[]} on provider/parse error. S003 emits only type 'er'.

**Acceptance checks:**
- returns empty for a doc needing no visual and a type:'er' need when warranted
- fails safe to no-diagram on a provider/parse error (never throws)
- exactly one serial provider call (no Promise.all over the provider)

### E20260928c5824e17:S003:T007 — DiagramAdherenceHandler registry + the 'er' handler

Add src/workflow/code-review/dimensions/diagram/registry.ts (Map<string,DiagramAdherenceHandler> + registerDiagramHandler/diagramHandlerFor, fail-fast DuplicateDiagramHandlerError mirroring docgen registry.ts) and handlers/er.ts (the 'er' handler wrapping validateErDefinition). Register only 'er' at module load.

**Acceptance checks:**
- diagramHandlerFor('er') resolves the ER handler; a duplicate registration throws DuplicateDiagramHandlerError
- the 'er' handler delegates to validateErDefinition (no inline type switch)
- registry is keyed by a type string so a future peer (UX/sequence) can register without editing the ER handler

### E20260928c5824e17:S003:T008 — 'diagram' ReviewDimension + judgeDiagram dispatcher + hasDiagramReferences gate wiring

Extend ReviewDimension (types.ts:36) with 'diagram'; add dimensions/diagram/index.ts (judgeDiagram thin dispatcher over diagramHandlerFor + hasDiagramReferences predicate); wire the JudgeSlot into DEFAULT_JUDGES + the effectiveJudges branch (runner.ts) and MCP expectedDimensions + buildJudgementsSchema (handler.ts:64) in lockstep. Rides computeReviewVerdict/enforce un-forked.

**Acceptance checks:**
- judgeDiagram dispatches each companion to its per-type handler + aggregates; an unregistered type yields a LOW observation, never throws
- effectiveJudges + expectedDimensions include 'diagram' iff hasDiagramReferences; validateArtifact accepts ran==expected and rejects drift
- diagram findings fold through computeReviewVerdict/foldVerdict + enforceCodeReviewGate (no forked gate)

### E20260928c5824e17:S003:T009 — Wire the content-gate + render into document generation + render the sc4 reference in S002 slots (strictly additive)

Wire assessDiagramNeed + renderErCompanion into the document-generation path so a warranted ER is authored + rendered + referenced; render the CompanionArtifactRef as a link in S002's existing 'diagrams'(HLD)/'diagramsEr'(LLD) extension slots. STRICTLY ADDITIVE: only FILL the already-declared extension slots — do NOT re-shape the S002 DocumentFormat/renderer internals (s2's owned boundary). Inert until the gate warrants an ER; forward-only + absent-safe; never inlined (k1/ac2).

**Acceptance checks:**
- a warranted ER is authored into the body, rendered to a sibling companion, and linked in the S002 extension slot
- a not-warranted document produces no erDefinition/companion and renders unchanged
- the core markdown links the companion, never inlines its content (k1/ac2)
- no change to the S002 DocumentFormat/renderer internals — only the extension slots are filled

### E20260928c5824e17:S003:T010 — Tests: ER validation/transform/render/content-gate + registry/dispatcher + conditional-dimension + integration + boot-asset-check

Co-located node:test suites, ONE named test per subject, reusing the functional-coverage-conditional.test.ts structure for the dimension-wiring test; an integration test over runCodeReview + the enforce gate; explicit ac1-ac4 mapping.

**Acceptance checks:**
- every S003 acceptance criterion (ac1-ac4) has >=1 proving test, mapped explicitly
- the full sweep is green (except the pre-existing better-sqlite3 native-ABI red herring)
- the conditional-dimension test mirrors functional-coverage-conditional.test.ts rather than re-inventing

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| validateErDefinition: metamodel-valid -> no findings; shape/cardinality violation -> HIGH breach (ajv vs vendored metamodel) | `t4` |
| validateErDefinition: dangling relationship range -> HIGH referential-integrity breach | `t4` |
| validateErDefinition: ER<->FR mismatch -> finding when FunctionalDefinition supplied | `t4` |
| validateErDefinition never reads a rendered file (assert no companion fs read) | `t4` |
| erDefinitionToIr: classes->entities, scalar slots->attributes, class slots->relationships w/ crow's-foot cardinality; deterministic | `t5` |
| renderErCompanion: builds IR + spied assembleShell + writes sibling; non-ok -> no file + DiagramGenerationError | `t5` |
| resolveCompanionPath sibling-of-.md; throws for story-scoped missing story | `t3` |
| assessDiagramNeed: empty/no-visual, type:'er' when warranted, fail-safe on provider error (one serial call) | `t6` |
| ErDefinition/companions/erDefinition fields optional + absent-safe | `t1` |
| registerDiagramHandler/diagramHandlerFor: S003 registers 'er'; duplicate throws DuplicateDiagramHandlerError | `t7` |
| judgeDiagram dispatches the ER companion to the 'er' handler (spy) + aggregates; an unregistered type yields a LOW observation | `t8` |
| effectiveJudges/expectedDimensions/buildJudgementsSchema include 'diagram' iff hasDiagramReferences; validateArtifact accepts ran==expected, rejects drift | `t8` |
| runCodeReview over a valid-erDefinition subject folds a DimensionResult{diagram} into the verdict (pass) | `t10` |
| an invalid/inconsistent erDefinition folds to block + enforceCodeReviewGate withholds under enforce=true, advisory-warn under false | `t10` |
| a no-ER subject runs base dimensions; CR record byte-shape-compatible with pre-S003 | `t10` |
| boot asset-check fails loudly when the vendored metamodel schema is absent | `t2` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s3 — sc4 CompanionArtifactRef + the authored-companion mechanism (structured body element -> deterministic visualization -> validate the JSON element)`
- **[[c2]]** `prior-artifact` `LLD s3 — ErDefinition (LinkML subset) body element + absent-safe erDefinition?/companions? on HLD/LLD bodies`
- **[[c3]]** `prior-artifact` `LLD s3 — vendored LinkML metamodel JSON Schema bundled asset + boot asset-check`
- **[[c4]]** `prior-artifact` `LLD s3 — net-new resolveCompanionPath sibling-path helper on path-scheme.ts`
- **[[c5]]** `prior-artifact` `LLD s3 — validateErDefinition (ajv vs metamodel + referential integrity + FR-consistency; validates the JSON element, not the doc)`
- **[[c6]]** `prior-artifact` `LLD s3 — erDefinitionToIr + renderErCompanion via docgen assembleShell (deterministic render; no generateDocument/Python/cloud REST)`
- **[[c7]]** `prior-artifact` `LLD s3 — assessDiagramNeed content-gate (one serial provider call; fail-safe; ac1/k3)`
- **[[c8]]** `prior-artifact` `LLD s3 — 'diagram' ReviewDimension + judgeDiagram thin dispatcher + DiagramAdherenceHandler registry ('er' handler) + hasDiagramReferences gate wiring`
- **[[c9]]** `prior-artifact` `LLD s3 — test strategy (unit/integration levels + ac1-ac4 acceptance mapping)`
