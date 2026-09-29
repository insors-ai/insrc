<!-- insrc:artifact LLD-e2c6705fd105d4ac-s1 -->

# LLD: E20260929e2c6705f:S001

## Summary

**Epic:** `complete-generated-artifact-companion-wiring-across`
**HLD base run:** `wf-1790696212238-iuz6vo`
**HLD effective hash:** `35f2a2c76e97...`

S1 wires the already-shipped-but-dead UX content-gate into the design-document authoring prompts. It adds the existing UX_CONTENT_GATE_RULE string as a HARD-RULE line at the same four prompt sites that already carry its ER twin, plus a source-scan guard test so the wiring can never silently drop out again. No schema, renderer, or review-dimension changes — those all shipped; a non-UX document stays byte-identical.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Interaction with shared contracts](#3-interaction-with-shared-contracts)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)

## 1. HLD context

> See **HLD-e2c6705fd105d4ac** § 2. Framework summary

**Rollout phase:** Phase A — UX gate + build provenance (pure wiring)
**Owns:** `sc1` (UX content-gate injection into the synthesize prompts)
**Consumes:** `sc1` (UX content-gate injection into the synthesize prompts)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s2`: S2 keeps private the precise completion/approve call site (build-approve handler vs. a completion hook), how it resolves the epicHash/storyId + repoPath at that point, and how it threads the author/timestamp context into collectBuildChangeLog. It reuses persistBuildRecord and collectBuildChangeLog unchanged and does not modify the validate-phase invocation. — owns `sc2`
- `s3`: S3 keeps private the internal shape of each new definition type (participant/message and node/edge structures), the DocumentIR mapping in each toIr, how each renderer assembles its offline HTML via the shared render spine, and which graph-derived docgen query feeds each diagram. It re-instances the sc1 injection convention for its two gates independently (no code dependency on S1) and adds its own finalize call without touching renderErCompanionForBody or the er/ux families. — owns `sc3`

## 2. Contract details

**Surface level:** internal

### 2.1 `UX_CONTENT_GATE_RULE`

```typescript
export const UX_CONTENT_GATE_RULE: string  // src/workflow/artifacts/companion/ux-schema.ts
```

**Returns:** `string` — The existing, already-exported HARD-RULE string telling the synthesizer WHEN to author a uxDefinition (content-gated). S1 consumes it unchanged — no edit to ux-schema.ts.

**Preconditions:**
- UX_CONTENT_GATE_RULE is already exported from ux-schema.ts (shipped by the artifact-docs-readability epic); S1 does not define or modify it.

**Postconditions:**
- The constant is imported into orchestrator.ts (extend the existing ux-schema.js import at :122) and into the two runner index.ts files (new sibling import next to the er-schema.js import).

### 2.2 `designEpicSynthesizer`

```typescript
function designEpicSynthesizer(intent: WorkflowIntent, stepOutputs: Readonly<Record<string, unknown>>): SynthesizerPrompt  // orchestrator.ts:1408
```

**Returns:** `SynthesizerPrompt` — The HLD synthesize prompt. S1 adds `UX_CONTENT_GATE_RULE,` as a bare array element in the systemPrompt `[...].join('\n')` block adjacent to `ER_CONTENT_GATE_RULE,` at :1424. No signature change; the emitted body schema already admits `uxDefinition` at :1467.

**Preconditions:**
- ER_CONTENT_GATE_RULE is already spliced at orchestrator.ts:1424; the HLD body schema admits uxDefinition at :1467.

**Postconditions:**
- The HLD synthesize systemPrompt carries the UX content-gate; a warranted HLD authors a uxDefinition, an unwarranted one does not (content-gated).

### 2.3 `designStorySynthesizer`

```typescript
function designStorySynthesizer(...): SynthesizerPrompt  // orchestrator.ts (LLD synth, injection at :1801)
```

**Returns:** `SynthesizerPrompt` — The LLD synthesize prompt. S1 adds `UX_CONTENT_GATE_RULE,` adjacent to `ER_CONTENT_GATE_RULE,` at :1801. No signature change; the emitted body schema already admits `uxDefinition` at :1863.

**Preconditions:**
- ER_CONTENT_GATE_RULE is already spliced at orchestrator.ts:1801; the LLD body schema admits uxDefinition at :1863.

**Postconditions:**
- The LLD synthesize systemPrompt carries the UX content-gate.

### 2.4 `ER_CONTENT_GATE_RULE`

```typescript
// injection sites in the two runner step prompts: design-story/index.ts:297 (contract.detail s4), design-epic/index.ts:268 (framework.write s4)
```

**Returns:** `string` — The ER twin whose four injection sites S1 mirrors. At the two runner s4-step prompts, S1 adds `UX_CONTENT_GATE_RULE,` adjacent to the existing `ER_CONTENT_GATE_RULE,` element (importing UX_CONTENT_GATE_RULE from '../../artifacts/companion/ux-schema.js'), so the author is cued about the UX mock at the framework/contract step as well as at synthesize.

**Preconditions:**
- ER_CONTENT_GATE_RULE is spliced at design-story/index.ts:297 and design-epic/index.ts:268 as a bare array element.

**Postconditions:**
- Both runner s4-step prompts carry the UX gate adjacent to the ER gate; the four-site parity matches the sc1 contract.

## 3. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | implements | S1 OWNS and implements sc1 (UX content-gate injection). It injects the existing UX_CONTENT_GATE_RULE at the four ER injection sites (orchestrator.ts:1424 HLD-synth + :1801 LLD-synth, design-story/index.ts:297, design-epic/index.ts:268) and adds a count-based source-scan guard test mirroring feedback-synth-schema.test.ts — asserting UX_CONTENT_GATE_RULE is imported + present at every site where UX_DEFINITION_PROPERTY_SCHEMA admits the uxDefinition slot, keyed to the ER twin's presence. It consumes the pre-shipped uxDefinition slot (ux-schema.ts), renderUxCompanion (render.ts), and the 'ux' review dimension (code-review/dimensions/ux) as-is, changing none of them. |

## 4. Error paths

**Error cases**

- **A future edit adds or moves a synth-prompt that admits the uxDefinition slot but forgets to inject UX_CONTENT_GATE_RULE (the exact class of drift this epic was created to fix).** (recoverable)
  - Detection: The source-scan guard test readFileSync's orchestrator.ts (+ the two runner index.ts) and counts UX_CONTENT_GATE_RULE occurrences vs the ER twin / uxDefinition-slot admissions; a mismatch fails the assertion at test time.
  - Response: The guard test fails in CI/local sweep, blocking the change until the gate is re-injected — the drift never reaches a shipped prompt.
  - User impact: None at runtime; the failure is caught in the test suite before merge.
- **The UX_CONTENT_GATE_RULE import path is wrong (e.g. missing the .js extension required by NodeNext) in one of the runner files.** (recoverable)
  - Detection: tsc (strict, NodeNext) fails to resolve the module at compile time; the build errors before any test runs.
  - Response: Fix the import specifier to the correct relative '../../artifacts/companion/ux-schema.js' path; tsc passes.
  - User impact: None at runtime; caught at build.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A design document that designs NO user-facing experience (e.g. this very wiring LLD, or a pure data/infra story). | The content-gated rule instructs the synthesizer to author a uxDefinition ONLY when a UX layout materially aids the document, so no uxDefinition is authored and the emitted body is byte-identical to today's output (ac2). |
| A design document that already carries an authored uxDefinition being re-synthesized. | Unchanged by S1 — the body schema already admits uxDefinition (admit-but-never-force), so a re-synthesize validates; the gate only affects WHEN authoring is prompted, not schema acceptance. |
| A standalone LLD (no HLD upstream) for a user-facing story. | The LLD synthesizer prompt (orchestrator.ts:1801) carries the UX gate the same as the epic-attached LLD path, so a warranted UX mock is prompted (ac1 covers 'including a standalone LLD'). |

**Invariants to preserve**

- The uxDefinition slot, renderUxCompanion renderer, and the 'ux' code-review dimension are pre-shipped and MUST remain untouched — S1 only makes the prompt carry the author-gate; it defines/edits no schema, renderer, or dimension. [[c1]]
- Content-gated authoring is preserved: a companion/definition is produced ONLY when it materially aids the specific document; the injected rule is a content-gate, never a forced-emit, so non-UX documents stay byte-identical. [[c1]]
- The ER injection S1 mirrors must be left intact at all four sites — UX_CONTENT_GATE_RULE is added ADJACENT to ER_CONTENT_GATE_RULE, not replacing it, preserving the existing ER content-gate wiring. [[c1]]

## 5. Test strategy

**Test framework:** `node:test + node:assert/strict (+ ajv for schema compilation), *.test.ts run via `npx tsx --test`, mirroring src/workflow/__tests__/feedback-synth-schema.test.ts`

**Test levels**

- **unit** — Source-scan guard: assert UX_CONTENT_GATE_RULE is imported + injected at every prompt that admits the uxDefinition slot, keyed to the ER twin's presence — mirroring feedback-synth-schema.test.ts so the gate can never silently drift out (k4/ac4).
  - Subjects: `readFileSync orchestrator.ts → assert UX_CONTENT_GATE_RULE occurrence count matches ER_CONTENT_GATE_RULE at the two synthesizer prompts (:1424 HLD, :1801 LLD) plus the import at :122`, `readFileSync design-story/index.ts → assert UX_CONTENT_GATE_RULE is imported (ux-schema.js) + present adjacent to ER_CONTENT_GATE_RULE at the s4 contract.detail prompt`, `readFileSync design-epic/index.ts → assert UX_CONTENT_GATE_RULE is imported + present adjacent to ER_CONTENT_GATE_RULE at the s4 framework.write prompt`, `co-location assertion: every occurrence of `uxDefinition: UX_DEFINITION_PROPERTY_SCHEMA` in orchestrator.ts (:1467, :1863) has a UX_CONTENT_GATE_RULE in the same synthesizer builder`
  - Fixtures: `the real source files read via readFileSync + fileURLToPath/dirname (no mocks) — exactly as feedback-synth-schema.test.ts does`
- **unit** — Prove admit-but-never-force: the HLD + LLD synthesize body schemas still admit uxDefinition and a body WITHOUT uxDefinition validates unchanged (ac2 backward-compat) — compiled via ajv like feedback-synth-schema.test.ts.
  - Subjects: `prepareSynthesize(intent, {}) for workflow='design.epic' → body schema admits uxDefinition, additionalProperties:false preserved, a body with no uxDefinition validates`, `prepareSynthesize for workflow='design.story' → same, LLD body`, `a body carrying a valid uxDefinition still validates (re-synthesize of a doc with an authored mock is not rejected)`
  - Fixtures: `a WorkflowIntent literal per workflow`, `a minimal valid body literal with and without a uxDefinition`
- **integration** — Prove the downstream renderer + review dimension light up once a uxDefinition is present (ac3) — consuming the pre-shipped machinery unchanged; reuses the existing ux companion finalize/dimension tests as the proof surface.
  - Subjects: `finalize path: a synthesized body carrying a valid uxDefinition renders a ux-mock CompanionArtifactRef (existing renderUxCompanion / ux companion finalize behaviour, unchanged by S1)`, `code-review: a subject whose body carries a uxDefinition engages the 'ux' dimension (existing judgeUx / computeExpectedDimensions, unchanged by S1)`
  - Fixtures: `a temp artifact dir with a doc body carrying a uxDefinition (reuse the existing ux-integration fixture)`, `a CodeReviewSubject fixture carrying a uxDefinition`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit source-scan: the two synthesizer prompts (orchestrator.ts:1424/:1801) AND the two runner s4-step prompts carry UX_CONTENT_GATE_RULE, so a user-facing doc is prompted to author a UX mock at both authoring moments`, `unit: co-location assertion ties the gate to every uxDefinition-slot admission` |
| `ac2` | `unit (ajv): a body with NO uxDefinition validates against both synthesize body schemas with additionalProperties:false preserved — byte-identical, content-gated, no forced emit`, `edge: a non-UX document authors no uxDefinition` |
| `ac3` | `integration: a body carrying a valid uxDefinition renders a ux-mock companion (renderUxCompanion, pre-shipped)`, `integration: a subject carrying a uxDefinition engages the 'ux' review dimension (judgeUx, pre-shipped)` |
| `ac4` | `unit source-scan guard: assert UX_CONTENT_GATE_RULE occurrence count across orchestrator.ts + the two runner index.ts matches the ER twin / uxDefinition-slot admissions — fails if any gated prompt drops the rule` |

## 6. Migration

**State before:** UX_CONTENT_GATE_RULE (ux-schema.ts:39) is defined and exported but has ZERO source usages — it is never imported or injected into any synth-prompt builder, while its twin ER_CONTENT_GATE_RULE is spliced at four sites (orchestrator.ts:1424 HLD-synth + :1801 LLD-synth, design-story/index.ts:297, design-epic/index.ts:268). The synth body schemas already admit the uxDefinition slot (orchestrator.ts:1467/:1863) and the renderer + 'ux' review dimension are shipped, but because the author-gate never reaches any prompt, no uxDefinition is ever authored, so the whole UX companion + review chain is dark (cited: s1 injection-sites + already-shipped-slot bundles).

**State after:** UX_CONTENT_GATE_RULE is imported into orchestrator.ts (extend the existing ux-schema.js import) + the two runner index.ts files, and spliced as a bare array element adjacent to ER_CONTENT_GATE_RULE at all four sites. A source-scan guard test pins the injection to every uxDefinition-slot-admitting prompt. The synthesizer is now told WHEN to author a uxDefinition; a warranted design doc authors one (lighting up the pre-shipped renderer + 'ux' dimension), a non-UX doc authors none and stays byte-identical.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the UX_CONTENT_GATE_RULE import: extend the existing ux-schema.js import in orchestrator.ts, and add a sibling ux-schema.js import next to the er-schema.js import in design-story/index.ts and design-epic/index.ts. — ↩ rollbackable
2. Splice `UX_CONTENT_GATE_RULE,` as a bare array element immediately adjacent to `ER_CONTENT_GATE_RULE,` in each of the four synth-prompt HARD-RULES blocks (orchestrator.ts:1424 + :1801, design-story/index.ts:297, design-epic/index.ts:268). — ↩ rollbackable
3. Add the source-scan guard test (mirroring feedback-synth-schema.test.ts) asserting UX_CONTENT_GATE_RULE is imported + present at every prompt that admits the uxDefinition slot, plus an ajv check that a body without uxDefinition still validates (admit-but-never-force). — ↩ rollbackable

**Backward compat:** Fully backward-compatible. No public API signature changes — the builders keep their exact signatures; only a rule string is appended to internal prompt arrays. The synth body schemas are unchanged (uxDefinition was already admitted). A design document that does not warrant a UX mock authors none and its emitted body is byte-identical to today's output; existing artifacts with no uxDefinition replay unchanged. The change only affects WHEN the synthesizer is prompted to author, never schema acceptance.

## 7. Alternatives considered

### 7.1 a1: Mirror ER exactly — inject UX_CONTENT_GATE_RULE at all four ER sites + a count-based source-scan guard — **CHOSEN**

Add `UX_CONTENT_GATE_RULE,` adjacent to `ER_CONTENT_GATE_RULE,` at each of the four existing sites and extend the source-scan guard to count it.

For each of the four sites where ER_CONTENT_GATE_RULE is already spliced as a bare array element into a `[...].join('\n')` system prompt — orchestrator.ts:1424 (designEpicSynthesizer / HLD synth), orchestrator.ts:1801 (designStorySynthesizer / LLD synth), design-story/index.ts:297 (contract.detail s4), design-epic/index.ts:268 (framework.write s4) — add `UX_CONTENT_GATE_RULE,` on the adjacent line, and add the import to each file that does not already have it. The guard test mirrors feedback-synth-schema.test.ts: source-scan the files and assert UX_CONTENT_GATE_RULE appears once per injection site plus its import, keyed so the count tracks the ER twin's presence.

### 7.2 a2: Inject only at the two synthesizer prompts that admit the uxDefinition slot

Add the gate only at orchestrator.ts:1424/:1801 (the HLD+LLD synthesizers whose body schema admits uxDefinition), leaving the s4 step prompts untouched.

Restrict the injection to the two designEpicSynthesizer/designStorySynthesizer prompts in orchestrator.ts, because those are the only prompts whose emitted body schema actually admits `uxDefinition: UX_DEFINITION_PROPERTY_SCHEMA` (at :1467 / :1863). The two runner s4-step prompts are left as-is. The guard test source-scans orchestrator.ts only.

**Rejected because:** PARTIAL-scores ac1 (loses the earlier s4 UX cue ER gets) and sc1 (diverges from the contract's explicit four-site mandate) — a deviation from the owned contract that a1 avoids at negligible extra cost (S vs XS).

## 8. References

- **[[c1]]** `analyze-bundle` `s1 injection-sites + guard-test-pattern + already-shipped-slot bundles: ER_CONTENT_GATE_RULE spliced as a bare array element at orchestrator.ts:1424 (designEpicSynthesizer) + :1801 (designStorySynthesizer) + design-story/index.ts:297 + design-epic/index.ts:268; UX_CONTENT_GATE_RULE (ux-schema.ts:39) has zero source usages; UX_DEFINITION_PROPERTY_SCHEMA admitted at orchestrator.ts:1467/:1863; renderUxCompanion (render.ts:106) + judgeUx (code-review/dimensions/ux/index.ts, runner.ts:124) pre-shipped; the source-scan guard mirrors src/workflow/__tests__/feedback-synth-schema.test.ts.`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 6 LOW** · model `client` · reviewed 2026-09-29T16:02:16.144Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| 2.2/2.3 | citation | LOW | auto | ER_CONTENT_GATE_RULE is spliced as a bare array element in the two orchestrator.ts synthesizer prompts (designEpicSynthesizer ~:1424 HLD, designStorySynthesizer ~:1801 LLD), the sites S1 adds UX_CONTENT_GATE_RULE adjacent to. | READ confirms orchestrator.ts:1424 = `\\t\\tER_CONTENT_GATE_RULE,` and grep confirms :1801 too (defined er-schema.ts:71, imported :121). The two synthesizer injection sites S1 targets are accurate. | Confirmed — no change. |
| 2.4 | citation | LOW | auto | ER_CONTENT_GATE_RULE is spliced in the two runner step prompts: design-story/index.ts:297 (contract.detail s4) and design-epic/index.ts:268 (framework.write s4). | READ confirms design-story/index.ts:297 and design-epic/index.ts:268 both = `ER_CONTENT_GATE_RULE,` (imported at :31 / :39). The two runner s4-step injection sites are accurate. | Confirmed — no change. |
| 2.1 | citation | LOW | auto | UX_CONTENT_GATE_RULE is exported from src/workflow/artifacts/companion/ux-schema.ts and currently has no injection usage (dead gate S1 wires). | READ confirms ux-schema.ts:39 = `export const UX_CONTENT_GATE_RULE =`; the only src/ occurrence is this definition, confirming the dead-gate premise. | Confirmed — no change. |
| migration | semantic | LOW | auto | UX_DEFINITION_PROPERTY_SCHEMA is admitted into the synth body as `uxDefinition: UX_DEFINITION_PROPERTY_SCHEMA` at the two synthesizer sites (orchestrator.ts:1467 HLD, :1863 LLD), so the slot the gate governs already exists. | grep `uxDefinition:\\s*UX_DEFINITION_PROPERTY_SCHEMA` returns exactly the two admission sites orchestrator.ts:1467 (HLD) + :1863 (LLD). The slot the gate governs already exists. | Confirmed — no change. |
| 5/test-strategy | citation | LOW | auto | The guard test S1 mirrors exists at src/workflow/__tests__/feedback-synth-schema.test.ts (source-scan pattern via readFileSync of orchestrator.ts). | READ confirms feedback-synth-schema.test.ts:58 = the source-scan test 'all four synthesizer schemas wire feedback + carry the NEVER-author rule (source-scan)' — the exact guard pattern S1 mirrors. | Confirmed — no change. |
| 3/ac3 | citation | LOW | auto | The pre-shipped downstream S1 consumes unchanged exists: renderUxCompanion (render.ts) and the 'ux' review dimension judge judgeUx (code-review/dimensions/ux/index.ts, wired in runner.ts). | grep confirms renderUxCompanion at render.ts:106 (already imported into orchestrator.ts:119) and judgeUx at code-review/dimensions/ux/index.ts:94 (wired into runner.ts:124). The pre-shipped downstream S1 consumes unchanged exists as cited. | Confirmed — no change. |
