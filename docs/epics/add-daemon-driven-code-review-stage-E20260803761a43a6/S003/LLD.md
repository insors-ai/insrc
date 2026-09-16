<!-- insrc:artifact LLD-761a43a6fa645815-s3 -->

# LLD: E20260803761a43a6:S003

**Epic:** `add-daemon-driven-code-review-stage`
**HLD base run:** `wf-1785741597494-lbzdo7`
**HLD effective hash:** `47535369867a...`

## HLD context

**Framework:** A hybrid code-review stage (winner a3): a code-review-specific orchestrator runs the four dimensions (adherence/conventions/coverage/quality) as an explicit SERIAL provider loop, reusing src/daemon/workflow-rpc.ts's proven machinery (buildShaperProvider resolution, synthesize-with-retry, writeAtomic, meta-stamping, optional boundary re-audit, the runStart StreamHandler shape) rather than cloning it, and mirroring the existing review vocabulary (ReviewVerdict / Severity / ReviewReport from src/workflow/review/types.ts) so the persisted CodeReviewArtifact carries a block/warn/pass verdict downstream approval already understands. The daemon-driven path and the controller-driven insrc_code_review_step (which mirrors insrc_review_step's start/emit/done/error/opaque-state envelope) share ONE orchestrator, differing only in who supplies each dimension's judgement. The stage runs after build, consumes the build record + approved LLD/PLAN as its fixed subject without re-deriving them, and never modifies the code it judges.
**Rollout phase:** Phase B — The four dimension judgements
**Consumes:** `sc1` (CodeReviewSubject), `sc2` (CodeReviewGrounding), `sc3` (DimensionFinding)

## Contract details

**Surface level:** internal-shared

### `judgeConventions`

```typescript
export async function judgeConventions(subject: CodeReviewSubject, grounding: CodeReviewGrounding, provider: LLMProvider): Promise<DimensionResult>
```

**Parameters:**
- `subject: CodeReviewSubject` — The fixed sc1 review subject; only changedFiles is read here (for the scope-drop) — approvedLld/Plan/buildRecord are not consulted by the conventions dimension, which baselines on documented rules, not the approved contract.
- `grounding: CodeReviewGrounding` — The sc2 structured symbol summaries — the only view of the changed code the judge reasons over (k6, no raw dumps); provides the cross-module sampling surface for idiom-drift observations.
- `provider: LLMProvider` — The resolved model provider (pinned no lower than the high tier by the orchestrator, k10); the judge issues exactly one completeStructured call through it (k3/k4).

**Returns:** `Promise<DimensionResult>` — DimensionResult{dimension:'conventions', findings} — one DimensionFinding per breach/observation, each location within subject.changedFiles; empty findings[] when the code obeys every documented rule and no idiom drift is observed.

**Errors:**
- `Error (propagated from withStructuredRetry)` when The model output fails ajv validation against CONVENTIONS_FINDINGS_SCHEMA on all 3 attempts — the judge throws rather than returning a fabricated clean pass, so the orchestrator persists no pass record (mirrors S002 / S006 ac5).

**Preconditions:**
- subject resolved ok (the caller/orchestrator has already enforced no-approved-contract→no-verdict via sc1)
- provider.capabilities.structuredOutput is available (gated by the orchestrator, not re-checked per dimension)

**Postconditions:**
- Exactly one provider.completeStructured call issued (no Promise.all; k4)
- Every returned finding.location file ∈ subject.changedFiles
- No file on disk is modified (read-only; S001 ac5)
- findings tagged confidence:'breach' for documented-rule breaches and confidence:'observation' for thin-sample idiom drift

### `buildConventionsPrompt`

```typescript
export function buildConventionsPrompt(subject: CodeReviewSubject, grounding: CodeReviewGrounding, extraNote: string | undefined): LLMMessage[]
```

**Parameters:**
- `subject: CodeReviewSubject` — Supplies changedFiles (named in the prompt so the model scopes locations) and repoPath context.
- `grounding: CodeReviewGrounding` — grounding.symbols is serialized into the trailing structural payload — the code under review.
- `extraNote: string | undefined` — The StructuredCall's retry note (prior attempt's validation errors) appended to the system charge, exactly as buildAdherencePrompt does.

**Returns:** `LLMMessage[]` — A [system, user] message pair. System = the conventions judgement charge + no-manufactured-findings + breach-vs-observation confidence discipline. User = the structural payload with the DOCUMENTED_RULES baseline and the output-shape reminder placed TRAILING (prompt-structure rule).

**Postconditions:**
- Pure — no side effects, deterministic in its inputs
- The DOCUMENTED_RULES baseline and the output-shape reminder appear at the tail of the user message, after grounding.symbols (recency-weighted structural placement)

### `CONVENTIONS_FINDINGS_SCHEMA`

```typescript
export const CONVENTIONS_FINDINGS_SCHEMA: StructuredSchema
```

**Returns:** `StructuredSchema` — ajv schema, additionalProperties:false, {findings: [{severity: enum HIGH|MED|LOW, location: string, message: string, expectationRef?: string (the violated documented-rule id or module-idiom label), confidence?: enum 'breach'|'observation'}]}. Per-finding shape mirrors ADHERENCE_FINDINGS_SCHEMA plus the confidence field; dimension is stamped by the judge, never emitted by the model.

**Postconditions:**
- required = ['findings']; each finding requires severity/location/message; expectationRef + confidence optional

## Data model changes

### `CONVENTIONS_FINDINGS_SCHEMA` — new

New per-dimension ajv schema for the model's raw conventions output, structurally 1:1 with ADHERENCE_FINDINGS_SCHEMA except it adds the optional confidence enum ('breach'|'observation') so the judge can carry the ac3/c104 low-confidence-observation distinction the sc3 DimensionFinding.confidence field already reserves. Validated via validateAgainstSchema; consumed only inside judgeConventions.

```
+ properties.findings.items.properties.confidence: { enum: ['breach','observation'] }  (vs adherence's per-finding shape; expectationRef reused to name the rule)
```

**Call sites:**
- `src/workflow/code-review/dimensions/conventions.ts (new; judgeConventions + buildConventionsPrompt)`
- `src/workflow/code-review/dimensions/adherence.ts (template mirrored)`

### `DOCUMENTED_RULES` — new

A static readonly constant enumerating the checkable CLAUDE.md coding rules the conventions dimension baselines on (import .js extension; import type; shared-types-not-SDK; getLogger not console.log; strict-mode optional/indexed handling; deterministic entity IDs; no Promise.all over LLM/serial; daemon-owns-storage; structured-grounding-not-raw-dumps; prompt-structure-trailing). Each entry pairs a stable rule id (usable as expectationRef) with its stated text. Embedded TRAILING in buildConventionsPrompt. Private to the conventions module.

**Call sites:**
- `src/workflow/code-review/dimensions/conventions.ts`
- `CLAUDE.md (source of the rule text)`

### `DimensionResult` — new

conventions.ts becomes a new PRODUCER of the existing sc3 DimensionResult{dimension:'conventions'}; the type itself is unchanged (owned at s1). Findings use expectationRef for the rule name and confidence for the breach/observation tier — both existing fields.

**Call sites:**
- `src/workflow/code-review/types.ts (sc3, unchanged)`
- `src/workflow/code-review/dimensions/conventions.ts (new producer)`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | Reads subject.changedFiles to scope-drop any finding whose location file is outside the Story's changed set; subject is otherwise treated read-only (approvedLld/Plan/buildRecord are not consulted by this dimension). |
| `sc2` | consumes | grounding.symbols is the sole code view the judge reasons over (k6). Its per-symbol file field gives the cross-module span the sampling needs; an idiom inferred from too few symbols is tagged confidence:'observation' rather than a breach (ac3/c104). |
| `sc3` | consumes | Emits DimensionResult{dimension:'conventions'} whose findings are DimensionFinding using the existing expectationRef (violated documented-rule id) and confidence ('breach'\|'observation') fields — no field added or changed; the contract is honoured exactly as owned at s1. |

## Error paths

### Error cases

- **The model returns output that fails ajv validation against CONVENTIONS_FINDINGS_SCHEMA on every one of the 3 attempts (malformed JSON, missing findings, wrong severity/confidence enum, additional properties).** (recoverable)
  - Detection: validateAgainstSchema(CONVENTIONS_FINDINGS_SCHEMA, raw) returns {ok:false} inside the StructuredValidator; withStructuredRetry re-issues with the errors as the retry note and, after the 3rd failure, throws.
  - Response: judgeConventions lets the throw propagate to the orchestrator; it does NOT catch-and-return an empty DimensionResult, so no fabricated clean pass is produced and (per S006 ac5) no pass record is persisted.
  - User impact: The conventions dimension reports as a failure to the orchestrator; the run surfaces an error rather than a false 'no violations' verdict.
- **The model emits a finding whose location file is outside the Story's changed set (e.g. it flags a rule breach in an unchanged neighbour it saw via callers/callees in the grounding).** (recoverable)
  - Detection: The map step computes fileOf(finding.location) and checks membership in new Set(subject.changedFiles).
  - Response: The out-of-scope finding is dropped silently from the returned findings[]; only findings within the changed set survive.
  - User impact: The verdict stays scoped to this Story's own changes; no noise about code the Story did not touch.
- **The model manufactures a breach with no real basis, or invents a rule not in DOCUMENTED_RULES, to appear thorough.** (recoverable)
  - Detection: Not a hard runtime error — mitigated by prompt discipline: the system charge forbids manufactured findings and instructs that only the enumerated DOCUMENTED_RULES (and observed cross-module idioms) may be cited; a fabricated rule id has no matching entry.
  - Response: The prompt constrains expectationRef to the enumerated rule ids; findings citing an unknown rule remain structurally valid but are the residual false-positive risk the high model tier (k10) and the test suite guard against.
  - User impact: Low: a rare spurious finding is a warn/observation the human reviewer can dismiss, never a silent code change.

### Edge cases

| Input | Expected |
| :--- | :--- |
| grounding.symbols is empty (the Story changed only non-indexed files, or the graph surfaced no symbols). | The single provider call still runs with an empty symbol payload; the model returns findings:[] (nothing to judge) and judgeConventions returns {dimension:'conventions', findings:[]}. No error. |
| The changed code obeys every documented rule and shows no idiom drift. | findings:[] — an empty result, not a manufactured finding (the no-manufactured-findings discipline). |
| A convention idiom is inferred but from too few sampled symbols to be confident. | The finding is emitted with confidence:'observation' (and typically severity LOW), NOT confidence:'breach' — the ac3/c104 low-confidence rule. |
| A documented-rule breach (e.g. a missing .js import extension) is found. | Emitted with confidence:'breach', the rule id in expectationRef, and its file:line location — one finding per breach, individually (ac2). |

### Invariants to preserve

- Nothing that reaches an LLM provider is issued under Promise.all — judgeConventions makes exactly one serial completeStructured call, mirroring the shipped adherence judge (the s1 sibling.template bundle shows the single-call seam). [[c17]]
- The judge reasons only over the sc2 structured symbol summaries and never over raw file contents; all storage access remains behind the daemon (the s1 standards.baseline + contract.trace bundles establish k5/k6). [[c16]]
- On unrecoverable structured-output failure the judge throws rather than returning a clean pass — withStructuredRetry never yields an invalid value (the s1 helper.locate bundle shows the throw-after-maxAttempts behaviour). [[c17]]
- The review is read-only — judgeConventions and buildConventionsPrompt modify no file on disk; the Story's changed files stay byte-for-byte unchanged (consistent with the sibling adherence judge, s1 sibling.template bundle). [[c16]]

## Test strategy

**Test framework:** `node:test + node:assert/strict via `npx tsx --test` (matching adherence.test.ts and the repo's existing __tests__ layout)`

### Test levels

- **unit** — Prove judgeConventions's pure mapping + scope-drop + confidence-tier + propagate-on-failure behaviour with a scripted fake LLMProvider, no live model — mirroring src/workflow/code-review/dimensions/__tests__/adherence.test.ts.
  - Subjects: `judgeConventions (mapping to DimensionResult{conventions}, expectationRef rule id, confidence tier, out-of-scope drop, exactly-one-call, retry-exhaustion propagation)`, `CONVENTIONS_FINDINGS_SCHEMA (per-finding shape: severity/location/message required; expectationRef+confidence optional; additionalProperties:false)`, `buildConventionsPrompt (DOCUMENTED_RULES + output-shape reminder TRAILING; decision/no-manufactured discipline in system message)`
  - Fixtures: `A fakeProvider(scripted) that scripts completeStructured and counts calls (any other method absent, so a stray call throws)`, `A subject(changedFiles) factory with stub approvedLld/Plan cast via unknown`, `A grounding(n) factory producing ChangedSymbolSummary[] across ≥2 files for the cross-module-sampling case`
- **live** — Optional end-to-end judgement against a real provider on a fixture with a KNOWN documented-rule breach (e.g. a missing .js import extension) to confirm the prompt actually elicits the breach with confidence:'breach' and the rule id — gated behind INSRC_LIVE_TESTS per the repo convention.
  - Subjects: `judgeConventions against a real buildShaperProvider-resolved provider`
  - Fixtures: `A small grounding fixture whose symbols embody one documented-rule breach`, `INSRC_LIVE_TESTS=1 gate (skips cleanly when unset)`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: 'documented-rule breach is mapped to a finding naming the rule in expectationRef with confidence:breach' — fake returns a breach citing a DOCUMENTED_RULES id; assert res.findings[0].expectationRef is that id and dimension==='conventions'`, `unit: 'buildConventionsPrompt embeds the DOCUMENTED_RULES baseline' — assert the user message contains the rule ids/text as the baseline` |
| `ac2` | `unit: 'each TS-rule breach is reported individually with its location' — fake returns 3 findings (missing .js ext, value import of a type, console.log) across distinct locations; assert all three survive with correct file:line`, `unit: 'CONVENTIONS_FINDINGS_SCHEMA requires severity/location/message per finding' — schema-shape assertion` |
| `ac3` | `unit: 'thin-sample idiom drift is tagged confidence:observation, not breach' — fake returns an idiom finding with confidence:'observation'; assert it maps through with confidence:'observation'`, `unit: 'buildConventionsPrompt instructs multi-module sampling over grounding.symbols and the observation-vs-breach rule' — assert the system charge carries the low-confidence-observation discipline; grounding fixture spans ≥2 files` |
| `ac4` | `unit: 'a Promise.all-over-LLM breach in the reviewed code is reported as a serial-calls-rule breach' — fake returns a finding citing the no-Promise.all-over-LLM rule id; assert it survives with that expectationRef and confidence:'breach'` |
| `ac5` | `unit: 'direct-storage and raw-file-dump breaches are reported as daemon-owns-storage / structured-grounding rule breaches' — fake returns two findings citing the k5 and k6 rule ids; assert both map through with those expectationRefs`, `unit: 'out-of-subject finding is dropped' — a finding whose location file is outside changedFiles is filtered out, keeping the verdict scoped` |

## Migration

**State before:** The code-review stage has one dimension judge shipped: src/workflow/code-review/dimensions/adherence.ts (S002, commit 6115a3c) exporting ADHERENCE_FINDINGS_SCHEMA + buildAdherencePrompt + judgeAdherence (s1 sibling.template bundle). The sc1/sc2/sc3 contracts and the ReviewDimension union (including 'conventions') already exist in src/workflow/code-review/types.ts (s1 contract.trace bundle), and the structured-output helpers are in place (s1 helper.locate bundle). No conventions judge exists yet; the s6 orchestrator (unbuilt) will call each dimension judge in a serial loop. This story is purely additive — it introduces a new sibling module and no existing exported symbol changes.

**State after:** A new src/workflow/code-review/dimensions/conventions.ts sits beside adherence.ts, exporting judgeConventions + buildConventionsPrompt + CONVENTIONS_FINDINGS_SCHEMA and the private DOCUMENTED_RULES constant. It produces the existing sc3 DimensionResult{dimension:'conventions'} with no change to any shared type. adherence.ts and every other module are untouched. The s6 orchestrator (later) imports judgeConventions alongside judgeAdherence.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the new module src/workflow/code-review/dimensions/conventions.ts (schema + prompt builder + judge + DOCUMENTED_RULES). No existing file is edited; the addition is inert until s6 wires it into the orchestrator loop. — ↩ rollbackable
2. Add the unit test file src/workflow/code-review/dimensions/__tests__/conventions.test.ts. Test-only; no runtime surface change. — ↩ rollbackable

**Backward compat:** No backward-compatibility concern: the story adds a new internal-shared module and touches no existing public or exported API. sc1/sc2/sc3 and ReviewDimension are consumed exactly as owned at s1 — no field added, removed, or renamed — so no existing consumer (adherence.ts, the future orchestrator, the persisted record shape) is affected. Removing conventions.ts would cleanly restore the prior state.

## Alternatives considered

### a1: Mirror-adherence with confidence tier — **CHOSEN**

A structural clone of S002's judge; CONVENTIONS_FINDINGS_SCHEMA reuses expectationRef for the rule name and adds an optional confidence field, with the CLAUDE.md rule list embedded as a static prompt constant.



### a2: Dedicated conventionRef field

Add a distinct conventionRef to the emitted schema (and to sc3 DimensionFinding) so the violated standard is named in its own field rather than overloading expectationRef.



**Rejected because:** Violates sc3: adds conventionRef to the s1-owned, already-shipped-and-approved DimensionFinding, which the approved HLD sketch does not contain — needs an HLD amendment and reopens a shipped story, the exact churn ownership placement avoided. Marginal clarity over a1's naming convention.

### a3: Split breaches/observations output

The model emits two separate arrays — hard breaches and low-confidence observations — instead of one findings[] tagged by confidence.



**Rejected because:** Only partial on sc3: the two-array output shape diverges from the single-findings[] every other dimension emits, forcing an s6 special-case, and encodes the breach/observation distinction redundantly (array membership AND the confidence field). Loses the one-mental-model benefit of the S002 template.

## Citations

- **[[c2]]** `prior-artifact` `DEF/HLD 761a43a6fa645815 — the persisted record mirrors the existing artifact-review report shape (ReviewVerdict/Severity/ReviewReport), source of k1; the assumption behind sc3's Severity reuse`
- **[[c9]]** `prior-artifact` `DEF/HLD 761a43a6fa645815 — the stage runs after build and consumes the build record as the fixed subject (source of k9); assumption behind sc1`
- **[[c10]]** `prior-artifact` `DEF/HLD 761a43a6fa645815 — no-approved-contract→no-verdict; the subject requires an approved LLD + PLAN; assumption behind sc1`
- **[[c16]]** `prior-artifact` `DEF/HLD 761a43a6fa645815 — the daemon owns all DB access and grounding is structured entity summaries not raw file dumps (source of k5/k6); assumption behind sc2 and the read-only invariant`
- **[[c17]]** `prior-artifact` `DEF/HLD 761a43a6fa645815 — nothing reaching an LLM provider runs under Promise.all (serial calls) and implementation follows the repo TS conventions (source of k4/k11/k12); assumption behind sc3 and the serial-call invariant`
- **[[c20]]** `analyze-bundle` `s1 sibling.template — src/workflow/code-review/dimensions/adherence.ts (the shipped S002 judge seams mirrored verbatim)`
- **[[c21]]** `analyze-bundle` `s1 contract.trace — src/workflow/code-review/types.ts (sc1/sc2/sc3; DimensionFinding.confidence already reserved)`
- **[[c22]]** `analyze-bundle` `s1 helper.locate — src/agent/providers/structured-output.ts (validateAgainstSchema, withStructuredRetry throw-after-maxAttempts)`
- **[[c23]]** `doc` `CLAUDE.md 'Code conventions' — the documented-rule baseline (k11/k12) the conventions dimension checks against`
- **[[c24]]** `analyze-bundle` `s1 convention.detect — src/workflow/review/run-artifact.ts (single-file sampling below confidence → observation-vs-breach split, c104/ac3)`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 8 LOW** · model `client` · reviewed 2026-08-03T10:41:46.430Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| cl1 | citation | LOW | auto | src/workflow/code-review/dimensions/adherence.ts exists and exports ADHERENCE_FINDINGS_SCHEMA, buildAdherencePrompt, and judgeAdherence — the shipped S002 template judgeConventions mirrors. | adherence.ts exports all three symbols: ADHERENCE_FINDINGS_SCHEMA (adherence.ts:49), buildAdherencePrompt (adherence.ts:74), judgeAdherence (adherence.ts:119). The S002 template the LLD mirrors exists exactly as described. | none — verified sound |
| cl2 | semantic | LOW | auto | src/workflow/code-review/types.ts declares DimensionFinding with an optional confidence field whose values are 'observation'\|'breach', plus expectationRef — both fields the conventions judge reuses without a contract change. | src/workflow/code-review/types.ts:37 declares interface DimensionFinding with expectationRef?: string \| undefined (types.ts:44) and confidence?: 'observation' \| 'breach' \| undefined (types.ts:48). Both fields the conventions judge reuses exist without any contract change. | none — verified sound |
| cl3 | closed-union | LOW | auto | The ReviewDimension union in types.ts includes 'conventions' (so no new union member is introduced by this Story). | src/workflow/code-review/types.ts:33 defines ReviewDimension = 'adherence' \| 'conventions' \| 'coverage' \| 'quality' — 'conventions' is already a union member; no new member introduced. | none — verified sound |
| cl4 | external-contract | LOW | auto | src/agent/providers/structured-output.ts exports validateAgainstSchema and withStructuredRetry(call, validate, maxAttempts) which throws after the attempt cap (never returns an invalid value) — the propagate-on-exhaustion mechanism the judge relies on. | src/agent/providers/structured-output.ts:80 exports validateAgainstSchema<T>, and :182 exports async withStructuredRetry<T> whose signature takes maxAttempts — the propagate-on-exhaustion helper the judge relies on exists as cited. | none — verified sound |
| cl5 | semantic | LOW | auto | The shipped adherence judge issues exactly one provider.completeStructured call wrapped in withStructuredRetry — the single-serial-call seam (k4) the conventions judge replicates. | The withStructuredRetry + completeStructured seam is present in the shipped adherence module (judgeAdherence at adherence.ts:119; the module uses both, as the S002 LLD at LLD-...-s2.md:66/112 corroborates). The single-serial-call pattern the conventions judge replicates is real. | none — verified sound |
| cl6 | inventory | LOW | auto | No src/workflow/code-review/dimensions/conventions.ts exists yet — this Story creates it as a new sibling module (purely additive). | The only judgeConventions / CONVENTIONS_FINDINGS_SCHEMA matches are inside the LLD-s3 doc itself — no src/workflow/code-review/dimensions/conventions.ts exists yet. The Story is purely additive (creates the new sibling module) exactly as the migration section states. | none — verified sound |
| cl7 | citation | LOW | auto | The existing adherence unit test file src/workflow/code-review/dimensions/__tests__/adherence.test.ts exists and uses node:test + node:assert/strict via a fake LLMProvider — the layout the conventions test mirrors. | src/workflow/code-review/dimensions/__tests__/adherence.test.ts:35 uses `as unknown as LLMProvider` (the fake-provider pattern), and node:test + node:assert/strict is the repo-wide test convention. The test layout the conventions test mirrors exists. | none — verified sound |
| cl8 | semantic | LOW | auto | adherence.ts drops findings whose location file is outside subject.changedFiles (the scope-drop the conventions judge replicates) via a fileOf(location) split and a changedFiles membership check. | adherence.ts:109 defines function fileOf(location: string), and the changedFiles scope-drop is present in the shipped judge. The scope-drop seam the conventions judge replicates is real. | none — verified sound |
