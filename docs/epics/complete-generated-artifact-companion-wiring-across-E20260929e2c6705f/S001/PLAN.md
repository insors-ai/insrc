<!-- insrc:artifact PLAN-e2c6705fd105d4ac-s1 -->

# Plan: E20260929e2c6705f:S001

## Summary

**Epic:** `complete-generated-artifact-companion-wiring-across`
**LLD run:** `wf-1790697308834-6e7xwa`
**LLD effective hash:** `35f2a2c76e97...`

Building S1 is a small, additive wiring change: import the already-shipped UX_CONTENT_GATE_RULE into the three synth-prompt files and splice it as a HARD-RULE line beside its ER twin at the four sites that admit the uxDefinition slot, then add one guard test that source-scans those files (plus an ajv admit-but-never-force check) so the wiring can never silently drift. No schema, renderer, or review-dimension code changes — the downstream UX machinery is pre-shipped and consumed as-is.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Import + splice UX_CONTENT_GATE_RULE at the four ER injection sites | S | — | unit: ux-synth-schema: source-scan orchestrator.ts asserts UX_CONTENT_GATE_RULE present at :1424 (HLD) + :1801 (LLD) adjacent to ER + imported (the co-location assertion re-derives the wiring t1 lands); unit: ux-synth-schema: source-scan design-story/index.ts + design-epic/index.ts assert UX_CONTENT_GATE_RULE imported (ux-schema.js) + present adjacent to ER at the two s4-step prompts | [[c1]] [[c2]] |
| 2 | **`t2`** Add the source-scan guard test + ajv admit-but-never-force check | S | `t1` | unit: ux-synth-schema: co-location assertion — every `uxDefinition: UX_DEFINITION_PROPERTY_SCHEMA` in orchestrator.ts (:1467/:1863) has a UX_CONTENT_GATE_RULE in the same synthesizer builder; count-keyed to ER so the gate cannot drift (ac4/k4); unit: ux-synth-schema: ajv — prepareSynthesize design.epic + design.story body schemas admit uxDefinition, keep additionalProperties:false, and a body with NO uxDefinition validates (ac2); a body carrying a valid uxDefinition still validates; integration: PRE-SHIPPED (re-run in the sweep, not authored by S1): ux companion finalize renders a ux-mock CompanionArtifactRef + the 'ux' dimension engages on an authored uxDefinition (ac3) | [[c3]] [[c4]] |

### 1.1 E20260929e2c6705f:S001:T001 — Import + splice UX_CONTENT_GATE_RULE at the four ER injection sites

Add UX_CONTENT_GATE_RULE to the companion-schema import in orchestrator.ts (alongside the existing UX_DEFINITION_PROPERTY_SCHEMA import) and add a sibling ux-schema.js import in design-story/index.ts and design-epic/index.ts. Then splice `UX_CONTENT_GATE_RULE,` as a bare array element immediately adjacent to `ER_CONTENT_GATE_RULE,` in each of the four synth-prompt HARD-RULES blocks: orchestrator.ts:1424 (designEpicSynthesizer/HLD synth) + :1801 (designStorySynthesizer/LLD synth), design-story/index.ts:297 (contract.detail s4), design-epic/index.ts:268 (framework.write s4). No builder signature change; the ER injection stays intact adjacent (not replaced).

**Acceptance checks:**
- UX_CONTENT_GATE_RULE is imported in all three files (orchestrator.ts via the ux-schema.js import, design-story/index.ts + design-epic/index.ts via a sibling '../../artifacts/companion/ux-schema.js' import) with the .js extension (NodeNext).
- UX_CONTENT_GATE_RULE appears as a bare array element adjacent to ER_CONTENT_GATE_RULE at orchestrator.ts:1424, orchestrator.ts:1801, design-story/index.ts:297, design-epic/index.ts:268 — the ER element is preserved, not replaced.
- tsc (strict, NodeNext) compiles clean; the existing suite is unaffected (no schema/renderer/dimension change).

### 1.2 E20260929e2c6705f:S001:T002 — Add the source-scan guard test + ajv admit-but-never-force check

Add src/workflow/__tests__/ux-synth-schema.test.ts mirroring feedback-synth-schema.test.ts: (a) readFileSync orchestrator.ts + the two runner index.ts and assert UX_CONTENT_GATE_RULE is imported + present at every prompt that admits the uxDefinition slot, keyed to the ER twin / `uxDefinition: UX_DEFINITION_PROPERTY_SCHEMA` count so it cannot silently drift (ac4/k4); (b) via prepareSynthesize + ajv, assert the design.epic + design.story body schemas still admit uxDefinition, keep additionalProperties:false, and a body WITHOUT uxDefinition validates (admit-but-never-force, ac2). Per the s3 critique, ac3 (renderer + 'ux' dimension light up on an authored uxDefinition) is covered by the PRE-SHIPPED ux-integration / ux-dimension suites S1 does not touch — the whole-sweep-green acceptanceCheck re-runs them rather than adding a redundant new integration test.

**Acceptance checks:**
- The new test source-scans orchestrator.ts + design-story/index.ts + design-epic/index.ts and fails if any uxDefinition-slot-admitting prompt drops UX_CONTENT_GATE_RULE (ac4/k4).
- An ajv compile of both synthesize body schemas confirms uxDefinition is admitted, additionalProperties:false is preserved, and a body with no uxDefinition validates (ac2).
- The test passes under `npx tsx --test src/workflow/__tests__/ux-synth-schema.test.ts` and the whole workflow sweep stays green — transitively re-running the pre-shipped ux-integration / ux-dimension suites that cover ac3.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| readFileSync orchestrator.ts → assert UX_CONTENT_GATE_RULE occurrence count matches ER_CONTENT_GATE_RULE at the two synthesizer prompts (:1424 HLD, :1801 LLD) plus the import at :122 | `t1`, `t2` |
| readFileSync design-story/index.ts → assert UX_CONTENT_GATE_RULE is imported (ux-schema.js) + present adjacent to ER_CONTENT_GATE_RULE at the s4 contract.detail prompt | `t1`, `t2` |
| readFileSync design-epic/index.ts → assert UX_CONTENT_GATE_RULE is imported + present adjacent to ER_CONTENT_GATE_RULE at the s4 framework.write prompt | `t1`, `t2` |
| co-location assertion: every occurrence of `uxDefinition: UX_DEFINITION_PROPERTY_SCHEMA` in orchestrator.ts (:1467, :1863) has a UX_CONTENT_GATE_RULE in the same synthesizer builder | `t2` |
| prepareSynthesize(intent, {}) for workflow='design.epic' → body schema admits uxDefinition, additionalProperties:false preserved, a body with no uxDefinition validates | `t2` |
| prepareSynthesize for workflow='design.story' → same, LLD body | `t2` |
| a body carrying a valid uxDefinition still validates (re-synthesize of a doc with an authored mock is not rejected) | `t2` |
| finalize path: a synthesized body carrying a valid uxDefinition renders a ux-mock CompanionArtifactRef (existing renderUxCompanion / ux companion finalize behaviour, unchanged by S1) | `t2` |
| code-review: a subject whose body carries a uxDefinition engages the 'ux' dimension (existing judgeUx / computeExpectedDimensions, unchanged by S1) | `t2` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s1 contractDetails + migration: the four ER injection sites (orchestrator.ts:1424 HLD-synth + :1801 LLD-synth, design-story/index.ts:297, design-epic/index.ts:268) that S1 splices UX_CONTENT_GATE_RULE adjacent to; the bare-array-element splice shape in the `[...].join('\n')` prompts.`
- **[[c2]]** `analyze-bundle` `s1 injection-sites-sized: orchestrator.ts already imports UX_DEFINITION_PROPERTY_SCHEMA (:122) + renderUxCompanion (:119), so only UX_CONTENT_GATE_RULE is added to an import; the two runner files import ER from er-schema.js (:31 / :39) and gain a sibling ux-schema.js import.`
- **[[c3]]** `prior-artifact` `LLD s1 testStrategy: the source-scan guard mirroring feedback-synth-schema.test.ts + the ajv admit-but-never-force check on the design.epic/design.story synthesize body schemas (uxDefinition admitted, additionalProperties:false, no-uxDefinition body validates).`
- **[[c4]]** `prior-artifact` `LLD s1 errorPaths + invariants: ac3 (renderer + 'ux' review dimension) exercises PRE-SHIPPED renderUxCompanion + judgeUx that S1 does not touch, covered by the existing ux-integration / ux-dimension suites re-run in the workflow sweep.`
