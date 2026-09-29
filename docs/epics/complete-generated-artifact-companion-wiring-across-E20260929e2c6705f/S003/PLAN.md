<!-- insrc:artifact PLAN-e2c6705fd105d4ac-s3 -->

# Plan: E20260929e2c6705f:S003

## Summary

**Epic:** `complete-generated-artifact-companion-wiring-across`
**LLD run:** `wf-1790703806654-5jbgnb`
**LLD effective hash:** `35f2a2c76e97...`

Building S003 means copying the established ER/UX companion pattern twice: two net-new definition families (sequence, component-dependency), each a schema+gate module plus a definition+toIr module, and two renderers appended to render.ts whose bodies are identical to renderErCompanion. The two optional body slots are admitted into the HLD+LLD synth schemas and their content-gate rules injected at the four synth-prompt sites, then a renderDiagramCompanionsForBody finalize peer renders + links a companion for whichever slot a document authors. Finally the code-review 'diagram' dimension gains two additive peer handlers (Option B) so an authored sequence/component definition is judged for adherence. Nothing in the existing er/ux families or the docgen render engine changes.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Sequence companion family: schema + definition + toIr | M | — | unit: sequence.test.ts — sequenceDefinitionToIr: participants→'call-frame' nodes, messages→edges, recursion→':repeat', truncation→'truncation' node, docType 'call-sequence', deterministic; unit: sequence.test.ts — sequenceDefinitionToIr dangling message endpoint throws DiagramGenerationError; validateSequenceDefinition structural findings | [[c1]] [[c2]] |
| 2 | **`t2`** Component-dependency companion family: schema + definition + toIr | M | — | unit: component.test.ts — componentDependencyDefinitionToIr: components→nodes, dependencies→edges, docType 'component-dependency', deterministic; unit: component.test.ts — componentDependencyDefinitionToIr dangling dependency edge throws DiagramGenerationError; validateComponentDependencyDefinition structural findings | [[c1]] [[c2]] |
| 3 | **`t3`** Two renderers in render.ts | S | `t1`, `t2` | unit: diagram-render.test.ts — renderSequenceCompanion / renderComponentCompanion ok→one sibling HTML + ref kind 'diagram-mermaid', repo-relative relPath, ofSectionId flows through; unit: diagram-render.test.ts — non-ok assembleShell DocGenOutcome throws DiagramGenerationError and writes no file | [[c1]] [[c2]] |
| 4 | **`t4`** Admit the two optional body slots (types + synth schemas) | S | `t1`, `t2` | unit: diagram-synth-schema.test.ts — prepareSynthesize(design.epic + design.story standalone) admits both diagram slots, neither required, additionalProperties:false, compiles under ajv (admit-but-never-force) | [[c3]] |
| 5 | **`t5`** Inject the two content-gate rules at the four synth-prompt sites | S | `t1`, `t2` | unit: diagram-synth-schema.test.ts — source-scan: SEQUENCE_/COMPONENT_CONTENT_GATE_RULE imported + injected once at each of the four synth-prompt sites (orchestrator HLD/LLD, design-story, design-epic), co-located with ER/UX (k4 guard mirroring ux-synth-schema.test.ts) | [[c3]] |
| 6 | **`t6`** renderDiagramCompanionsForBody finalize peer + wire the three finalize sites | M | `t3`, `t4` | integration: diagram-companion-finalize.test.ts — renderDiagramCompanionsForBody: sequence-only→one HTML+ref, component-only→one HTML+ref, both→two, neither→[] + no file (byte-identical); integration: diagram-companion-finalize.test.ts — swallow: a dangling-ref / non-ok / validation-HIGH definition is skipped, finalize does not throw, a valid second definition still renders | [[c2]] [[c3]] |
| 7 | **`t7`** Code-review 'diagram' dimension: additive sequence/component peer handlers (Option B) | M | `t1`, `t2`, `t4` | unit: diagram-handlers.test.ts — a body carrying only a sequenceDefinition (resp. componentDependencyDefinition) makes hasDiagramReferences true and dispatches to the new sequence (resp. component) handler; handlers/er.ts unchanged | [[c4]] |

### 1.1 E20260929e2c6705f:S003:T001 — Sequence companion family: schema + definition + toIr

Add src/workflow/artifacts/companion/sequence-schema.ts (SEQUENCE_DEFINITION_PROPERTY_SCHEMA — optional participants[]+messages[]+truncations?; SEQUENCE_CONTENT_GATE_RULE HARD-RULE string) and sequence.ts (SequenceDefinition interface, validateSequenceDefinition returning DimensionFinding[] via a light structural check, sequenceDefinitionToIr(def)->DocumentIR with docType 'call-sequence', nodes kind 'call-frame' + edges, ':repeat' suffix for recursion + 'truncation' nodes, dangling-endpoint throws DiagramGenerationError). Mirror er-schema.ts/er.ts; consume DocumentIR unchanged.

**Acceptance checks:**
- sequenceDefinitionToIr returns a DocumentIR with docType 'call-sequence', one 'call-frame' node per participant, one edge per message, byte-identical for a byte-identical def
- a message endpoint not in participants[] throws DiagramGenerationError before any render
- SEQUENCE_DEFINITION_PROPERTY_SCHEMA is a valid optional JSON-schema fragment (never lists itself as required); SEQUENCE_CONTENT_GATE_RULE is a non-empty string
- tsc --noEmit clean

### 1.2 E20260929e2c6705f:S003:T002 — Component-dependency companion family: schema + definition + toIr

Add component-schema.ts (COMPONENT_DEFINITION_PROPERTY_SCHEMA — optional components[]+dependencies[]; COMPONENT_CONTENT_GATE_RULE) and component.ts (ComponentDependencyDefinition interface, validateComponentDependencyDefinition, componentDependencyDefinitionToIr(def)->DocumentIR with docType 'component-dependency', one node per component + one 'A-->B' edge per dependency, dangling-edge throws DiagramGenerationError). Mirror t1; consume DocumentIR unchanged.

**Acceptance checks:**
- componentDependencyDefinitionToIr returns a DocumentIR with docType 'component-dependency', one node per component, one edge per dependency, deterministic
- a dependency referencing an undeclared component id throws DiagramGenerationError before render
- COMPONENT_DEFINITION_PROPERTY_SCHEMA is optional-never-required; COMPONENT_CONTENT_GATE_RULE is a non-empty string
- tsc --noEmit clean

### 1.3 E20260929e2c6705f:S003:T003 — Two renderers in render.ts

Append renderSequenceCompanion + renderComponentCompanion to companion/render.ts with bodies IDENTICAL to renderErCompanion (xDefinitionToIr -> assembleShell -> non-ok throws DiagramGenerationError -> mkdir + writeFile -> return CompanionArtifactRef{kind:'diagram-mermaid', relPath, title, ofSectionId?}). No new CompanionKind member (reuse 'diagram-mermaid' at types.ts:24). renderErCompanion/renderUxCompanion untouched.

**Acceptance checks:**
- renderSequenceCompanion / renderComponentCompanion on a valid def write exactly one sibling offline HTML at destPath and return a ref of kind 'diagram-mermaid' with a repo-relative relPath
- a non-ok assembleShell DocGenOutcome throws DiagramGenerationError and leaves no partial file
- types.ts CompanionKind union is unchanged (no member added)
- tsc --noEmit clean

### 1.4 E20260929e2c6705f:S003:T004 — Admit the two optional body slots (types + synth schemas)

Add optional sequenceDefinition? / componentDependencyDefinition? fields to the HLD + LLD body TYPES (artifacts/hld.ts, artifacts/lld.ts) next to erDefinition/uxDefinition, and admit sequenceDefinition: SEQUENCE_DEFINITION_PROPERTY_SCHEMA + componentDependencyDefinition: COMPONENT_DEFINITION_PROPERTY_SCHEMA into the two synth body schemas (orchestrator.ts:1467 HLD, :1863 LLD) under the existing additionalProperties:false — additive, never required.

**Acceptance checks:**
- prepareSynthesize(design.epic) and prepareSynthesize(design.story standalone) both expose sequenceDefinition + componentDependencyDefinition as body properties, neither in required, body still additionalProperties:false and compiles under ajv
- the HLD + LLD body types type-check with the two new optional fields
- tsc --noEmit clean

### 1.5 E20260929e2c6705f:S003:T005 — Inject the two content-gate rules at the four synth-prompt sites

Inject SEQUENCE_CONTENT_GATE_RULE + COMPONENT_CONTENT_GATE_RULE as bare array elements adjacent to the ER/UX gates at the four sites: orchestrator.ts:1425 (HLD synth), :1803 (LLD synth), runners/design-story/index.ts:298 (contract.detail), runners/design-epic/index.ts:270 (framework.write). Import from the two -schema.ts modules. Mirrors S1's UX-gate wiring convention (k4).

**Acceptance checks:**
- both gate rules are imported and injected once at every one of the four synth-prompt sites, co-located with the ER/UX gates (a source-fact invariant)
- the gate injection is a bare array element in each HARD-RULES join list, matching the ER/UX pattern
- tsc --noEmit clean

### 1.6 E20260929e2c6705f:S003:T006 — renderDiagramCompanionsForBody finalize peer + wire the three finalize sites

Add renderDiagramCompanionsForBody(body, destDir, repoPath) mirroring renderErCompanionForBody (orchestrator.ts:1504): content-gated (absent slot -> no companion), validates each authored def via validateSequenceDefinition/validateComponentDependencyDefinition (HIGH finding -> leave in-body, no render), calls the matching renderer, catches DiagramGenerationError -> skip; returns the refs for whichever slots are present. Invoke it at the three finalize points (HLD ~:1670, LLD :2014, LLD :2162) next to the ER/UX ForBody calls and append its refs to body.companions. renderErCompanionForBody untouched.

**Acceptance checks:**
- a finalized body carrying a sequenceDefinition and/or componentDependencyDefinition writes the corresponding sibling HTML companion(s) and appends one ref per authored def to body.companions
- a body carrying neither diagram slot yields no companion and no file (document byte-identical to today)
- a dangling-ref / non-ok / validation-HIGH definition is swallowed (finalize never throws) and any valid second definition still renders
- renderErCompanionForBody / renderUxCompanionForBody bodies are unchanged
- tsc --noEmit clean

### 1.7 E20260929e2c6705f:S003:T007 — Code-review 'diagram' dimension: additive sequence/component peer handlers (Option B)

Add net-new src/workflow/code-review/dimensions/diagram/handlers/sequence.ts + component.ts that self-register via registerDiagramHandler (registry.ts:46, the reserved peer slot). Extend hasDiagramReferences (dimensions/diagram/index.ts:55) to also return true on body.sequenceDefinition / componentDependencyDefinition, and add two body-keyed dispatch branches at index.ts:97 mirroring the erDefinition branch. Reads the body.sequenceDefinition / componentDependencyDefinition fields added in t4. handlers/er.ts + isErCompanion UNTOUCHED (purely additive — the resolved open-question Option B).

**Acceptance checks:**
- a code-review subject whose body carries a sequenceDefinition (resp. componentDependencyDefinition) engages the 'diagram' dimension and routes to the new sequence (resp. component) handler
- hasDiagramReferences returns true for a body carrying only a sequence/component definition
- handlers/er.ts and its isErCompanion are unchanged (no edit to the sc4-owned ref routing)
- tsc --noEmit clean

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| sequenceDefinitionToIr: participants → nodes kind 'call-frame', messages → edges, recursion → ':repeat' suffix, truncation → 'truncation' node; docType 'call-sequence' | `t1` |
| componentDependencyDefinitionToIr: components → nodes, dependencies → edges; docType 'component-dependency' | `t2` |
| determinism: byte-identical DocumentIR for a byte-identical def | `t1`, `t2` |
| dangling-ref: DiagramGenerationError | `t1`, `t2` |
| validateSequenceDefinition / validateComponentDependencyDefinition structural findings | `t1`, `t2` |
| renderSequenceCompanion ok → HTML + ref kind 'diagram-mermaid' | `t3` |
| renderComponentCompanion ok → HTML + ref | `t3` |
| non-ok assembleShell → DiagramGenerationError + no file | `t3` |
| opts.repoPath → repo-relative relPath; ofSectionId flows into the ref | `t3` |
| prepareSynthesize(design.epic) + prepareSynthesize(design.story standalone): body admits sequenceDefinition + componentDependencyDefinition, neither required, additionalProperties false, compiles under ajv | `t4` |
| source-scan of orchestrator.ts + runners/*/index.ts: both gate rules imported + injected once per admitting prompt, co-located with ER/UX | `t5` |
| renderDiagramCompanionsForBody: sequence-only → one HTML + ref; component-only → one HTML + ref; both → two; neither → [], no file, byte-identical | `t6` |
| swallow: a dangling-ref or validation-HIGH definition is skipped, finalize does not throw, a valid second definition still renders | `t6` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s3 contractDetails — sequenceDefinitionToIr / componentDependencyDefinitionToIr + the render spine (s1 bundle 'render-pipeline-exists': shell.ts:170 documentIRToMermaid docType dispatch, :142-160 toSequenceDiagram, :123-134 toFlowchart)`
- **[[c2]]** `prior-artifact` `LLD s3 contractDetails — renderSequenceCompanion / renderComponentCompanion + renderDiagramCompanionsForBody mirroring renderErCompanion / renderErCompanionForBody (s1 bundle 'er-ux-contract-to-mirror': render.ts, orchestrator.ts:1504-1527, types.ts:24 CompanionKind)`
- **[[c3]]** `prior-artifact` `LLD s3 dataModelChanges + migration — the two optional body slots admitted at orchestrator.ts:1467/:1863 and the two content-gate rules injected at the four synth-prompt sites (s1 bundle 'synth-body-admission-and-gate-sites')`
- **[[c4]]** `prior-artifact` `LLD s3 open question (resolved Option B) — the additive code-review 'diagram' dimension peer handlers via registerDiagramHandler + body-keyed dispatch (s1 bundle 'test-and-review-patterns': code-review/dimensions/diagram/index.ts, registry.ts)`
