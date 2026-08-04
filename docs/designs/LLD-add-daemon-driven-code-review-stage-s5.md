<!-- insrc:artifact LLD-761a43a6fa645815-s5 -->

# LLD: E20260804761a43a6:S005

**Epic:** `add-daemon-driven-code-review-stage`
**HLD base run:** `wf-1785741597494-lbzdo7`
**HLD effective hash:** `47535369867a...`

## HLD context

**Framework:** A hybrid code-review stage (winner a3): a code-review-specific orchestrator runs the four dimensions (adherence/conventions/coverage/quality) as an explicit SERIAL provider loop, reusing src/daemon/workflow-rpc.ts's proven machinery (buildShaperProvider resolution, synthesize-with-retry, writeAtomic, meta-stamping, optional boundary re-audit, the runStart StreamHandler shape) rather than cloning it, and mirroring the existing review vocabulary (ReviewVerdict / Severity / ReviewReport from src/workflow/review/types.ts) so the persisted CodeReviewArtifact carries a block/warn/pass verdict downstream approval already understands. The daemon-driven path and the controller-driven insrc_code_review_step (which mirrors insrc_review_step's start/emit/done/error/opaque-state envelope) share ONE orchestrator, differing only in who supplies each dimension's judgement. The stage runs after build, consumes the build record + approved LLD/PLAN as its fixed subject without re-deriving them, and never modifies the code it judges.
**Rollout phase:** Phase B — The four dimension judgements
**Consumes:** `sc1` (CodeReviewSubject), `sc2` (CodeReviewGrounding), `sc3` (DimensionFinding)

## Contract details

**Surface level:** internal-shared

### `judgeQuality`

```typescript
export async function judgeQuality(subject: CodeReviewSubject, grounding: CodeReviewGrounding, provider: LLMProvider): Promise<DimensionResult>
```

**Parameters:**
- `subject: CodeReviewSubject` — The fixed sc1 review subject; only changedFiles is read here (for the scope-drop). approvedLld/approvedPlan/buildRecord are NOT consulted — quality reasons over the changed symbols, not the approved contract or build.
- `grounding: CodeReviewGrounding` — The sc2 structured symbol summaries — the only code view (k6). Each ChangedSymbolSummary's signature + callers + callees is the evidence the judge reasons over to spot correctness/complexity/duplication/error-handling risks and to name a duplication's existing counterpart.
- `provider: LLMProvider` — The resolved model provider (pinned no lower than the high tier by the orchestrator, k10/k3 — ac4); the judge issues exactly one completeStructured call through it (k4).

**Returns:** `Promise<DimensionResult>` — DimensionResult{dimension:'quality', findings} — one DimensionFinding per risk: a correctness risk, avoidable complexity, a duplication (with its existing counterpart named in counterpartRef), or an unhandled error path; each with a location + severity; matters of taste capped at LOW so they never block; each location within subject.changedFiles; empty findings[] when the changed code carries no risk.

**Errors:**
- `Error (propagated from withStructuredRetry)` when The model output fails ajv validation against QUALITY_FINDINGS_SCHEMA on all 3 attempts — the judge throws rather than returning a fabricated clean pass, so the orchestrator persists no pass record (mirrors S002/S003/S004 / S006 ac5).

**Preconditions:**
- subject resolved ok (the caller/orchestrator has already enforced no-approved-contract→no-verdict via sc1)
- provider.capabilities.structuredOutput is available (gated by the orchestrator, not re-checked per dimension)

**Postconditions:**
- Exactly one provider.completeStructured call issued (no Promise.all; k4)
- Every returned finding.location file ∈ subject.changedFiles
- No file on disk is modified (read-only; S001 ac5)
- A duplication finding carries counterpartRef naming the existing overlapping symbol (ac2); matters of taste are emitted at severity LOW and never HIGH (ac3)

### `buildQualityPrompt`

```typescript
export function buildQualityPrompt(subject: CodeReviewSubject, grounding: CodeReviewGrounding, extraNote: string | undefined): LLMMessage[]
```

**Parameters:**
- `subject: CodeReviewSubject` — Supplies changedFiles (named in the prompt so the model scopes locations); repoPath context.
- `grounding: CodeReviewGrounding` — grounding.symbols (signature/callers/callees) is serialized into the trailing structural payload — the code under review + the neighbour edges that let the model name a duplication counterpart.
- `extraNote: string | undefined` — The StructuredCall's retry note (prior attempt's validation errors) appended to the system charge, exactly as the sibling judges do.

**Returns:** `LLMMessage[]` — A [system, user] message pair. System = the quality judgement charge: report the FOUR risk classes (correctness, avoidable complexity, duplication, unhandled error paths) each with a location + severity (ac1); when flagging duplication, name the existing counterpart in counterpartRef (ac2); cap matters of taste at LOW severity so they never block (ac3); no manufactured findings. User = the TRAILING structural payload: grounding.symbols with signature/callers/callees, then the output-shape reminder.

**Postconditions:**
- Pure — no side effects, deterministic in its inputs
- grounding.symbols and the output-shape reminder appear at the TAIL of the user message (recency-weighted structural placement)

### `QUALITY_FINDINGS_SCHEMA`

```typescript
export const QUALITY_FINDINGS_SCHEMA: StructuredSchema
```

**Returns:** `StructuredSchema` — ajv schema, additionalProperties:false, {findings: [{severity: enum HIGH|MED|LOW, location: string, message: string, counterpartRef?: string (the existing duplicated symbol), confidence?: enum 'breach'|'observation'}]}. Per-finding shape mirrors the adherence/conventions/coverage shape (severity/location/message) but its distinctive optional field is counterpartRef (not expectationRef); dimension is stamped by the judge, never emitted by the model.

**Postconditions:**
- required = ['findings']; each finding requires severity/location/message; counterpartRef + confidence optional

## Data model changes

### `QUALITY_FINDINGS_SCHEMA` — new

New per-dimension ajv schema for the model's raw quality output. Structurally the adherence per-finding shape (severity/location/message) plus the already-reserved optional counterpartRef (the existing duplication counterpart, ac2) and optional confidence; unlike adherence/conventions/coverage it emits counterpartRef rather than expectationRef. Validated via validateAgainstSchema; consumed only inside judgeQuality.

```
= adherence per-finding shape, but replace expectationRef with counterpartRef (the sc3 duplication-counterpart field); keep optional confidence. No coverage-specific/status field (a2's riskClass enum rejected to avoid an sc3 amendment).
```

**Call sites:**
- `src/workflow/code-review/dimensions/quality.ts (new; judgeQuality + buildQualityPrompt)`
- `src/workflow/code-review/dimensions/adherence.ts (template mirrored)`
- `src/workflow/code-review/dimensions/conventions.ts (template mirrored)`
- `src/workflow/code-review/dimensions/coverage.ts (template mirrored)`

### `DimensionResult` — new

quality.ts becomes a new PRODUCER of the existing sc3 DimensionResult{dimension:'quality'}; the type itself is unchanged (owned at s1). Findings use counterpartRef (duplication counterpart) + confidence + severity — all existing fields; the fourth and final dimension to fill the ReviewDimension union.

**Call sites:**
- `src/workflow/code-review/types.ts (sc3, unchanged)`
- `src/workflow/code-review/dimensions/quality.ts (new producer)`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | Reads subject.changedFiles to scope-drop any finding whose location file is outside the Story's changed set; subject is otherwise treated read-only (approvedLld/approvedPlan/buildRecord are not consulted by this dimension). |
| `sc2` | consumes | grounding.symbols (signature/callers/callees) is the sole code view the judge reasons over (k6); the neighbour edges let it name a duplication's existing counterpart in counterpartRef (ac2). No raw file contents. |
| `sc3` | consumes | Emits DimensionResult{dimension:'quality'} whose findings are DimensionFinding using the existing counterpartRef ('quality: the existing duplication counterpart') + confidence + severity fields — no field added or changed; the contract is honoured exactly as owned at s1. |

## Error paths

### Error cases

- **The model returns output that fails ajv validation against QUALITY_FINDINGS_SCHEMA on every one of the 3 attempts (malformed JSON, missing findings, wrong severity/confidence enum, additional properties).** (recoverable)
  - Detection: validateAgainstSchema(QUALITY_FINDINGS_SCHEMA, raw) returns {ok:false} inside the StructuredValidator; withStructuredRetry re-issues with the errors as the retry note and, after the 3rd failure, throws.
  - Response: judgeQuality lets the throw propagate to the orchestrator; it does NOT catch-and-return an empty DimensionResult, so no fabricated clean pass is produced and (per S006 ac5) no pass record is persisted.
  - User impact: The quality dimension reports as a failure to the orchestrator; the run surfaces an error rather than a false 'no risks' verdict.
- **The model raises a matter of taste (naming, formatting preference) at HIGH severity, which would map to a blocking verdict at S006.** (recoverable)
  - Detection: Not a hard runtime error — mitigated by prompt discipline: the system charge instructs that matters of taste are capped at LOW severity and never HIGH; a taste finding emitted at HIGH has no grounding in a stated risk class.
  - Response: The prompt caps taste at LOW so it cannot block (ac3); residual mis-severity risk is guarded by the high model tier (k10/ac4) and the tests. The judge does not itself re-write severity — it trusts the prompt-constrained model, exactly as the shipped dimensions do.
  - User impact: Low: a rare over-severitied taste finding is a warn the human reviewer can dismiss; it never silently blocks and never modifies code.
- **The model flags a duplication but names a counterpart symbol that is not present in the grounding (an invented or hallucinated counterpart).** (recoverable)
  - Detection: Not a hard runtime error — the counterpartRef is free-text; the prompt instructs that only symbols visible in the provided grounding (or their named callers/callees) may be cited as a counterpart, so an invented counterpart has no supporting edge in the trailing payload.
  - Response: The finding remains structurally valid and is surfaced; ac2's value is that the reader can CHECK the named counterpart. A counterpart that does not resolve is a low-cost false positive the reviewer dismisses — the high tier (k10) is the mitigation, not a runtime resolve step (which would require graph access this read-only judge does not perform).
  - User impact: Low: the reader follows the counterpartRef, finds no real overlap, and dismisses the finding; never a code change.
- **The model emits a finding whose location file is outside the Story's changed set (a risk it noticed in a neighbour via callers/callees).** (recoverable)
  - Detection: The map step computes fileOf(finding.location) and checks membership in new Set(subject.changedFiles).
  - Response: The out-of-scope finding is dropped silently from the returned findings[]; only findings within the changed set survive.
  - User impact: The verdict stays scoped to this Story's own changed code; no noise about neighbours the Story did not change.

### Edge cases

| Input | Expected |
| :--- | :--- |
| grounding.symbols is empty (the Story changed only non-indexed files, or the graph surfaced no symbols). | The single provider call still runs with an empty symbol payload; the model returns findings:[] (nothing to judge) and judgeQuality returns {dimension:'quality', findings:[]}. No error. |
| The changed code carries no correctness/complexity/duplication/error-handling risk. | findings:[] — an empty result, not a manufactured finding (the no-manufactured-findings discipline). |
| A changed symbol reimplements behaviour an existing symbol already provides, and that counterpart appears among the symbol's callees/callers in the grounding. | Emitted as a duplication finding with the existing symbol named in counterpartRef, a file:line location, and a severity reflecting the risk (ac2). |
| A finding is a genuine risk (unhandled error path) rather than taste. | Emitted at MED or HIGH severity as warranted (ac1) — the taste-cap applies only to matters of taste, not to real risks. |
| A finding is purely a matter of taste (a naming or layout preference). | Emitted at severity LOW (never HIGH), optionally confidence:'observation', so the S006 verdict never maps it to block (ac3). |

### Invariants to preserve

- Nothing that reaches an LLM provider is issued under Promise.all — judgeQuality makes exactly one serial completeStructured call, mirroring the three shipped judges (the s1 sibling.template bundle shows the single-call seam). [[c17]]
- The judge reasons only over the sc2 structured symbol summaries (signature/callers/callees) and never over raw file contents; all storage access remains behind the daemon (the s1 contract.trace bundle establishes k5/k6). [[c16]]
- On unrecoverable structured-output failure the judge throws rather than returning a clean pass — withStructuredRetry never yields an invalid value (the s1 helper.locate bundle shows the throw-after-maxAttempts behaviour). [[c17]]
- The review is read-only — judgeQuality and buildQualityPrompt modify no file on disk; the Story's changed files stay byte-for-byte unchanged (consistent with the three sibling judges, s1 sibling.template bundle). [[c16]]
- Matters of taste are capped at LOW severity so the persisted verdict (HIGH→block, S006) never blocks the Story on a preference — severity is reused verbatim from src/workflow/review/types.ts (the s1 scope.constraint bundle). [[c2]]

## Test strategy

**Test framework:** `node:test + node:assert/strict via `npx tsx --test` (matching conventions.test.ts / coverage.test.ts and the repo's existing __tests__ layout)`

### Test levels

- **unit** — Prove judgeQuality's pure mapping + scope-drop + counterpartRef pass-through + propagate-on-failure behaviour with a scripted fake LLMProvider, no live model — mirroring the shipped conventions.test.ts / coverage.test.ts.
  - Subjects: `judgeQuality (mapping to DimensionResult{quality}; counterpartRef=existing duplication counterpart; the four risk classes with location+severity; taste at LOW; out-of-scope drop; exactly-one-call; retry-exhaustion propagation)`, `QUALITY_FINDINGS_SCHEMA (per-finding shape: severity/location/message required; counterpartRef+confidence optional; additionalProperties:false)`, `buildQualityPrompt (grounding.symbols signature/callers/callees TRAILING; charge enumerates the four risk classes, instructs counterpartRef on duplication, caps taste at LOW)`
  - Fixtures: `A fakeProvider(scripted) that scripts completeStructured and counts calls (any other method absent, so a stray call throws)`, `A subject(changedFiles) factory stubbing approvedLld/Plan via unknown (unused by quality)`, `A grounding(symbols) factory producing ChangedSymbolSummary[] with populated signature/callers/callees so a duplication finding can name a counterpart`
- **live** — Optional end-to-end judgement against a real provider on a fixture with a KNOWN duplication (a changed symbol reimplementing an existing counterpart visible in its callees) to confirm the prompt elicits the duplication finding with counterpartRef naming the counterpart — gated behind INSRC_LIVE_TESTS per the repo convention.
  - Subjects: `judgeQuality against a real buildShaperProvider-resolved provider`
  - Fixtures: `A small subject+grounding fixture embodying one changed symbol that duplicates an existing counterpart`, `INSRC_LIVE_TESTS=1 gate (skips cleanly when unset)`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: 'the four risk classes each map to a finding with location + severity' — fake returns four findings (correctness, complexity, duplication, unhandled-error) across changed-file locations; assert all four survive with severity + location`, `unit: 'QUALITY_FINDINGS_SCHEMA requires severity/location/message per finding' — schema-shape assertion` |
| `ac2` | `unit: 'a duplication finding maps counterpartRef through naming the existing symbol' — fake returns a duplication finding with counterpartRef set; assert res.findings[0].counterpartRef is that symbol and dimension==='quality'`, `unit: 'buildQualityPrompt instructs naming the existing counterpart in counterpartRef and serializes callers/callees' — assert the system charge mentions counterpartRef and the user payload includes the neighbour edges` |
| `ac3` | `unit: 'a matter-of-taste finding maps through at LOW severity, never HIGH' — fake returns a taste finding at LOW; assert severity==='LOW'`, `unit: 'buildQualityPrompt charge caps matters of taste at LOW severity' — assert the system message instructs never raising taste at HIGH` |
| `ac4` | `unit: 'judgeQuality issues exactly ONE completeStructured call through the injected provider (no other provider method, no Promise.all)' — the provider is supplied by the orchestrator at the high tier (k10/k3); the judge only uses it, proven by the exactly-one-call assertion over the fake` |

## Migration

**State before:** The code-review stage has THREE dimension judges shipped: src/workflow/code-review/dimensions/adherence.ts (S002), conventions.ts (S003), coverage.ts (S004), each exporting <DIM>_FINDINGS_SCHEMA + build<Dim>Prompt + judge<Dim> over the same seam (s1 sibling.template bundle). The sc1/sc2/sc3 contracts and the ReviewDimension union (including 'quality') already exist in src/workflow/code-review/types.ts (s1 contract.trace bundle) — sc3 DimensionFinding already carries the optional counterpartRef ('quality: the existing duplication counterpart') and sc2 ChangedSymbolSummary already carries signature/callers/callees — and the structured-output helpers are in place (s1 helper.locate bundle). No quality judge exists yet; the s6 orchestrator (unbuilt) will call each of the four dimension judges in a serial loop. This story is purely additive — it introduces the fourth and final sibling module and no existing exported symbol changes.

**State after:** A new src/workflow/code-review/dimensions/quality.ts sits beside adherence.ts, conventions.ts and coverage.ts, exporting judgeQuality + buildQualityPrompt + QUALITY_FINDINGS_SCHEMA. It produces the existing sc3 DimensionResult{dimension:'quality'} with no change to any shared type, consuming grounding.symbols (signature/callers/callees) and using the already-reserved counterpartRef field to name a duplication counterpart. adherence.ts, conventions.ts, coverage.ts and every other module are untouched. All four ReviewDimension branches now have a producer; the s6 orchestrator (later) imports judgeQuality alongside the other three.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the new module src/workflow/code-review/dimensions/quality.ts (schema + prompt builder + judge). No existing file is edited; the addition is inert until s6 wires it into the orchestrator loop. — ↩ rollbackable
2. Add the unit test file src/workflow/code-review/dimensions/__tests__/quality.test.ts. Test-only; no runtime surface change. — ↩ rollbackable

**Backward compat:** No backward-compatibility concern: the story adds a new internal-shared module and touches no existing public or exported API. sc1/sc2/sc3 and ReviewDimension are consumed exactly as owned at s1 — no field added, removed, or renamed — so no existing consumer (the three sibling judges, the future orchestrator, the persisted record shape) is affected. Removing quality.ts would cleanly restore the prior state.

## Alternatives considered

### a1: Mirror-siblings, single call, reuse counterpartRef + severity-cap — **CHOSEN**

A structural clone of the three shipped judges: QUALITY_FINDINGS_SCHEMA reuses counterpartRef (the existing duplication counterpart) + optional confidence, enumerates the four risk classes in the charge, and caps matters of taste at LOW severity; one prompt over grounding.symbols (signature/callers/callees).



### a2: Structured risk-class + taste enum in the emitted schema

Same single-call seam, but QUALITY_FINDINGS_SCHEMA adds a typed riskClass enum ('correctness'|'complexity'|'duplication'|'error-handling') and an isTaste boolean so ac1's four classes and ac3's taste flag are first-class fields rather than free-text + severity convention.



**Rejected because:** Only partial on sc3: riskClass has no home on the s1-owned sc3 DimensionFinding — to reach the s6 aggregator it needs a new sc3 field (amends the shipped contract, the churn ownership placement avoids), or it is folded into message and the typed field dies cosmetic at the mapping boundary. Diverges from the sibling per-finding shape at higher cost for distinctions a1 already carries via message + the severity cap.

### a3: Duplication as a dedicated second pass

Split the judgement into two calls — a general quality pass (correctness/complexity/error-handling) and a dedicated duplication pass that reasons hard over callers/callees to name counterparts — unioned into one DimensionResult.



**Rejected because:** No contract violation, but TWO provider calls diverge from the one-serial-call sibling seam the s6 orchestrator's uniform per-dimension invocation relies on, doubling cost and latency for marginal duplication precision the high tier (k10) already largely delivers on a single combined call.

## Citations

- **[[c2]]** `prior-artifact` `DEF/HLD 761a43a6fa645815 — the persisted record mirrors the existing artifact-review report shape (ReviewVerdict/Severity/ReviewReport), source of k1; the Severity reuse behind sc3 and the HIGH→block taste-cap invariant`
- **[[c9]]** `prior-artifact` `DEF/HLD 761a43a6fa645815 — the stage runs after build and consumes the build record + approved LLD/PLAN as the fixed subject (source of k9); assumption behind sc1`
- **[[c10]]** `prior-artifact` `DEF/HLD 761a43a6fa645815 — no-approved-contract→no-verdict; the subject requires an approved LLD + PLAN; assumption behind sc1`
- **[[c16]]** `prior-artifact` `DEF/HLD 761a43a6fa645815 — the daemon owns all DB access and grounding is structured entity summaries (signature/callers/callees) not raw file dumps (source of k5/k6); assumption behind sc2 and the read-only invariant`
- **[[c17]]** `prior-artifact` `DEF/HLD 761a43a6fa645815 — nothing reaching an LLM provider runs under Promise.all (serial calls) and implementation follows the repo TS conventions (source of k4/k11); assumption behind sc3 and the serial-call invariant`
- **[[c20]]** `analyze-bundle` `s1 sibling.template — src/workflow/code-review/dimensions/adherence.ts + conventions.ts + coverage.ts (the three shipped judge seams mirrored verbatim)`
- **[[c21]]** `analyze-bundle` `s1 contract.trace — src/workflow/code-review/types.ts (sc3 counterpartRef reserved for quality; sc2 signature/callers/callees the duplication signal)`
- **[[c22]]** `analyze-bundle` `s1 helper.locate — src/agent/providers/structured-output.ts (validateAgainstSchema, withStructuredRetry throw-after-maxAttempts)`
- **[[c23]]** `analyze-bundle` `s1 scope.constraint — src/workflow/review/types.ts Severity (HIGH→block) the ac3 taste-cap rides + the shared changedFiles scope-drop`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 8 LOW** · model `client` · reviewed 2026-08-04T06:21:51.336Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| qc1 | citation | LOW | auto | The three sibling template judges adherence.ts, conventions.ts, coverage.ts all exist and export their judge<Dim> — the seam judgeQuality clones. | adherence.ts:119 judgeAdherence, conventions.ts:148 judgeConventions, coverage.ts:150 judgeCoverage all exist in src — the three sibling seams judgeQuality clones are real. | none — verified sound |
| qc2 | semantic | LOW | auto | sc3 DimensionFinding in types.ts carries the optional counterpartRef field (reserved 'quality: the existing duplication counterpart') that the quality judge maps through — no new field. | src/workflow/code-review/types.ts declares interface DimensionFinding with the optional counterpartRef?: string field — the sc3 field reserved for quality's duplication counterpart; the judge maps it through with no contract change. | none — verified sound |
| qc3 | semantic | LOW | auto | sc2 ChangedSymbolSummary in types.ts carries signature, callers, and callees — the duplication signal the quality judge reasons over. | types.ts:70 callers and :72 callees (readonly string[]) plus signature on ChangedSymbolSummary — the duplication signal the quality judge reasons over is on the sc2 contract. | none — verified sound |
| qc4 | external-contract | LOW | auto | src/agent/providers/structured-output.ts exports validateAgainstSchema and withStructuredRetry(call, validate, maxAttempts) which throws after the cap — the helpers the judge reuses. | structured-output.ts:80 validateAgainstSchema and :182 withStructuredRetry (throws after the cap) — the helpers the judge reuses, unchanged from S002/S003/S004. | none — verified sound |
| qc5 | closed-union | LOW | auto | The ReviewDimension union in types.ts includes 'quality' (so no new union member is introduced) — quality is the fourth branch. | types.ts:33 ReviewDimension = 'adherence' \| 'conventions' \| 'coverage' \| 'quality' — 'quality' is already a union member; no new member introduced. | none — verified sound |
| qc6 | external-contract | LOW | auto | Severity is defined in src/workflow/review/types.ts as 'HIGH'\|'MED'\|'LOW' — the scale the ac3 taste-cap and the HIGH→block verdict ride on. | Severity ('HIGH'\|'MED'\|'LOW') is defined in src/workflow/review/types.ts — the scale the ac3 taste-cap and the HIGH→block verdict ride on, reused verbatim as the LLD states. | none — verified sound |
| qc7 | inventory | LOW | auto | No src/workflow/code-review/dimensions/quality.ts exists yet — this Story creates it as the fourth and final sibling module (purely additive; no judgeQuality in src/). | judgeQuality / QUALITY_FINDINGS_SCHEMA appear only in the LLD-s5 doc, not in any src/ file — quality.ts does not exist yet, so the Story creating it is purely additive. | none — verified sound |
| qc8 | citation | LOW | auto | The fake-provider unit-test harness the quality tests reuse exists in conventions.test.ts / coverage.test.ts (`as unknown as LLMProvider`, node:test + node:assert/strict). | coverage.test.ts (src/) uses `as unknown as LLMProvider` and node:test is the repo-wide convention — the fake-provider harness the quality tests reuse exists. | none — verified sound |
