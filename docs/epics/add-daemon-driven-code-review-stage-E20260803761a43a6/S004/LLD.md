<!-- insrc:artifact LLD-761a43a6fa645815-s4 -->

# LLD: E20260803761a43a6:S004

**Epic:** `add-daemon-driven-code-review-stage`
**HLD base run:** `wf-1785741597494-lbzdo7`
**HLD effective hash:** `47535369867a...`

## HLD context

**Framework:** A hybrid code-review stage (winner a3): a code-review-specific orchestrator runs the four dimensions (adherence/conventions/coverage/quality) as an explicit SERIAL provider loop, reusing src/daemon/workflow-rpc.ts's proven machinery (buildShaperProvider resolution, synthesize-with-retry, writeAtomic, meta-stamping, optional boundary re-audit, the runStart StreamHandler shape) rather than cloning it, and mirroring the existing review vocabulary (ReviewVerdict / Severity / ReviewReport from src/workflow/review/types.ts) so the persisted CodeReviewArtifact carries a block/warn/pass verdict downstream approval already understands. The daemon-driven path and the controller-driven insrc_code_review_step (which mirrors insrc_review_step's start/emit/done/error/opaque-state envelope) share ONE orchestrator, differing only in who supplies each dimension's judgement. The stage runs after build, consumes the build record + approved LLD/PLAN as its fixed subject without re-deriving them, and never modifies the code it judges.
**Rollout phase:** Phase B — The four dimension judgements
**Consumes:** `sc1` (CodeReviewSubject), `sc2` (CodeReviewGrounding), `sc3` (DimensionFinding)

## Contract details

**Surface level:** internal-shared

### `judgeCoverage`

```typescript
export async function judgeCoverage(subject: CodeReviewSubject, grounding: CodeReviewGrounding, provider: LLMProvider): Promise<DimensionResult>
```

**Parameters:**
- `subject: CodeReviewSubject` — The fixed sc1 review subject. Coverage reads THREE of its fields: changedFiles (scope-drop), approvedPlan.body.tasks[].tests (the promised per-task tests — ac1), and buildRecord (the pass/fail signal for ac3, consumed not re-derived). approvedLld is not consulted.
- `grounding: CodeReviewGrounding` — The sc2 structured symbol summaries — the only code view (k6). grounding.symbols[].testsReaching (graph edges test-entity -> this symbol) is the ground-truth exercised/not-exercised signal for ac2; the symbol set is already scoped to the Story's new/changed symbols (ac4).
- `provider: LLMProvider` — The resolved model provider (pinned no lower than the high tier by the orchestrator, k10); the judge issues exactly one completeStructured call through it (k3/k4).

**Returns:** `Promise<DimensionResult>` — DimensionResult{dimension:'coverage', findings} — one DimensionFinding per coverage gap: a promised-but-missing test, a changed symbol with no reaching test, or a present-but-failing/weak/unverified test; each location within subject.changedFiles; empty findings[] when every changed symbol is exercised and every promised test is present and passing.

**Errors:**
- `Error (propagated from withStructuredRetry)` when The model output fails ajv validation against COVERAGE_FINDINGS_SCHEMA on all 3 attempts — the judge throws rather than returning a fabricated clean pass, so the orchestrator persists no pass record (mirrors S002/S003 / S006 ac5).

**Preconditions:**
- subject resolved ok (the caller/orchestrator has already enforced no-approved-contract→no-verdict via sc1)
- provider.capabilities.structuredOutput is available (gated by the orchestrator, not re-checked per dimension)

**Postconditions:**
- Exactly one provider.completeStructured call issued (no Promise.all; k4)
- Every returned finding.location file ∈ subject.changedFiles (pre-existing neighbour gaps excluded, ac4)
- No file on disk is modified and no test is executed (read-only; S001 ac5)
- A promised-but-missing test and a changed symbol with zero testsReaching are HIGH-severity gaps; a present-but-failing/weak/unverified test is a distinct lower-severity confidence-tagged finding (ac3)

### `buildCoveragePrompt`

```typescript
export function buildCoveragePrompt(subject: CodeReviewSubject, grounding: CodeReviewGrounding, extraNote: string | undefined): LLMMessage[]
```

**Parameters:**
- `subject: CodeReviewSubject` — Supplies changedFiles (scope), approvedPlan.body.tasks[].tests (the promised tests serialized into the trailing payload for ac1), and a buildRecord pass/fail summary for ac3.
- `grounding: CodeReviewGrounding` — grounding.symbols (with testsReaching) is serialized into the trailing structural payload — the exercised/not-exercised signal.
- `extraNote: string | undefined` — The StructuredCall's retry note (prior attempt's validation errors) appended to the system charge, exactly as the sibling judges do.

**Returns:** `LLMMessage[]` — A [system, user] message pair. System = the coverage judgement charge: report each changed symbol exercised/not (testsReaching), each promised test present/missing and passing/failing/unverified, distinguish present-failing from no-test (ac3), exclude pre-existing neighbour gaps (ac4), never assert a pass-state the buildRecord does not support, no manufactured findings. User = the TRAILING structural payload: grounding.symbols[]+testsReaching, then the approvedPlan promised tests, then the output-shape reminder.

**Postconditions:**
- Pure — no side effects, deterministic in its inputs
- The promised-tests list, the symbols+testsReaching, and the output-shape reminder appear at the TAIL of the user message (recency-weighted structural placement)

### `COVERAGE_FINDINGS_SCHEMA`

```typescript
export const COVERAGE_FINDINGS_SCHEMA: StructuredSchema
```

**Returns:** `StructuredSchema` — ajv schema, additionalProperties:false, {findings: [{severity: enum HIGH|MED|LOW, location: string, message: string, expectationRef?: string (the uncovered symbol name or the missing promised test), confidence?: enum 'breach'|'observation'}]}. Per-finding shape mirrors the adherence/conventions shape (severity/location/message/expectationRef) plus the already-reserved confidence enum; dimension is stamped by the judge, never emitted by the model.

**Postconditions:**
- required = ['findings']; each finding requires severity/location/message; expectationRef + confidence optional

## Data model changes

### `COVERAGE_FINDINGS_SCHEMA` — new

New per-dimension ajv schema for the model's raw coverage output, structurally identical to CONVENTIONS_FINDINGS_SCHEMA (adherence shape + optional confidence enum). expectationRef names the uncovered symbol or missing promised test; confidence carries the present-weak/unverified vs wholly-missing distinction (ac3). Validated via validateAgainstSchema; consumed only inside judgeCoverage.

```
= CONVENTIONS_FINDINGS_SCHEMA per-finding shape (severity/location/message/expectationRef?/confidence?); no coverage-specific field added (a2's status enum rejected to avoid an sc3 amendment)
```

**Call sites:**
- `src/workflow/code-review/dimensions/coverage.ts (new; judgeCoverage + buildCoveragePrompt)`
- `src/workflow/code-review/dimensions/adherence.ts (template mirrored)`
- `src/workflow/code-review/dimensions/conventions.ts (template mirrored)`

### `DimensionResult` — new

coverage.ts becomes a new PRODUCER of the existing sc3 DimensionResult{dimension:'coverage'}; the type itself is unchanged (owned at s1). Findings use expectationRef (uncovered symbol / missing test) + confidence (present-weak vs missing) + severity — all existing fields.

**Call sites:**
- `src/workflow/code-review/types.ts (sc3, unchanged)`
- `src/workflow/code-review/dimensions/coverage.ts (new producer)`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | Reads subject.changedFiles (scope-drop, ac4), subject.approvedPlan.body.tasks[].tests (the promised tests checked present/missing/passing — ac1), and subject.buildRecord (the pass/fail signal for ac3, consumed not re-derived). subject is read-only; approvedLld is not consulted. |
| `sc2` | consumes | grounding.symbols[].testsReaching is the recorded test->code relationship coverage judges over (ac2/k6): testsReaching.length===0 on a changed symbol is a not-exercised gap. The symbol set is already scoped to the Story's new/changed symbols, which enforces most of ac4. |
| `sc3` | consumes | Emits DimensionResult{dimension:'coverage'} whose findings are DimensionFinding using the existing expectationRef (uncovered symbol / missing promised test) and confidence ('breach' missing vs 'observation' present-weak) fields — no field added or changed; the contract is honoured exactly as owned at s1. |

## Error paths

### Error cases

- **The model returns output that fails ajv validation against COVERAGE_FINDINGS_SCHEMA on every one of the 3 attempts (malformed JSON, missing findings, wrong severity/confidence enum, additional properties).** (recoverable)
  - Detection: validateAgainstSchema(COVERAGE_FINDINGS_SCHEMA, raw) returns {ok:false} inside the StructuredValidator; withStructuredRetry re-issues with the errors as the retry note and, after the 3rd failure, throws.
  - Response: judgeCoverage lets the throw propagate to the orchestrator; it does NOT catch-and-return an empty DimensionResult, so no fabricated clean pass is produced and (per S006 ac5) no pass record is persisted.
  - User impact: The coverage dimension reports as a failure to the orchestrator; the run surfaces an error rather than a false 'fully covered' verdict.
- **The model asserts a promised test is PASSING (or a symbol is covered) when the buildRecord signal does not actually support that pass-state — a false green.** (recoverable)
  - Detection: Not a hard runtime error — mitigated by prompt discipline: the system charge forbids asserting a pass-state the buildRecord does not support and requires 'present but pass-state unverified' framing where the signal is absent; a claim beyond the supplied signal has no grounding in the trailing payload.
  - Response: The prompt constrains pass/fail claims to the buildRecord + testsReaching signal; where unknown the finding is confidence-tagged 'observation' with an 'unverified' message rather than omitted or asserted green. Residual false-green risk is guarded by the high model tier (k10) and the tests.
  - User impact: Low: the worst case is an over-cautious 'unverified' finding the human reviewer can dismiss, never a silently-swallowed real gap.
- **The model emits a finding whose location file is outside the Story's changed set (e.g. a coverage gap in a touched-but-unchanged neighbour it saw via callers/callees).** (recoverable)
  - Detection: The map step computes fileOf(finding.location) and checks membership in new Set(subject.changedFiles).
  - Response: The out-of-scope finding is dropped silently from the returned findings[]; only findings within the changed set survive (ac4/c105).
  - User impact: The verdict stays scoped to this Story's own changed behaviour; no noise about pre-existing module gaps this Story did not introduce.

### Edge cases

| Input | Expected |
| :--- | :--- |
| grounding.symbols is empty (the Story changed only non-indexed files, or the graph surfaced no symbols) AND approvedPlan has no promised tests. | The single provider call still runs with empty payloads; the model returns findings:[] (nothing to judge) and judgeCoverage returns {dimension:'coverage', findings:[]}. No error. |
| Every changed symbol has a non-empty testsReaching and every promised test is present and passing. | findings:[] — an empty result, not a manufactured finding (the no-manufactured-findings discipline). |
| A changed symbol has testsReaching.length===0 (no test reaches it). | Emitted as a HIGH-severity not-exercised gap with the symbol named in expectationRef and confidence:'breach', its file:line location — one finding per uncovered symbol (ac2). |
| A promised test named in approvedPlan.body.tasks[].tests has no corresponding test entity in the grounding. | Emitted as a HIGH-severity missing-promised-test finding naming the test in expectationRef, confidence:'breach' (ac1); distinct from a present-but-failing test. |
| A changed symbol IS reached by a test, but the buildRecord signal shows that test failing or does not confirm it passing. | Emitted as a distinct finding — present-but-failing/unverified — with confidence:'observation' and a message distinguishing it from a wholly-missing test (ac3), NOT reported as 'no test'. |

### Invariants to preserve

- Nothing that reaches an LLM provider is issued under Promise.all — judgeCoverage makes exactly one serial completeStructured call, mirroring the shipped adherence/conventions judges (the s1 sibling.template bundle shows the single-call seam). [[c17]]
- The judge reasons only over the sc2 structured symbol summaries + testsReaching edges and the sc1 approvedPlan/buildRecord — never over raw file contents; all storage access remains behind the daemon (the s1 contract.trace bundle establishes k5/k6). [[c16]]
- On unrecoverable structured-output failure the judge throws rather than returning a clean pass — withStructuredRetry never yields an invalid value (the s1 helper.locate bundle shows the throw-after-maxAttempts behaviour). [[c17]]
- The review is read-only — judgeCoverage runs no tests and modifies no file on disk; pass/fail comes from the daemon-supplied buildRecord signal, never from executing anything (the s1 sibling.template + scope.constraint bundles; consistent with S001 ac5). [[c16]]
- Coverage is scoped to the Story's changed behaviour, not the module's overall test health — findings outside subject.changedFiles are dropped and pre-existing neighbour gaps are excluded, so the dimension never duplicates the module-scoped test-health view owned elsewhere (the s1 scope.constraint bundle, c105). [[c12]]

## Test strategy

**Test framework:** `node:test + node:assert/strict via `npx tsx --test` (matching adherence.test.ts / conventions.test.ts and the repo's existing __tests__ layout)`

### Test levels

- **unit** — Prove judgeCoverage's pure mapping + scope-drop + confidence-tier + propagate-on-failure behaviour with a scripted fake LLMProvider, no live model — mirroring the shipped adherence.test.ts / conventions.test.ts.
  - Subjects: `judgeCoverage (mapping to DimensionResult{coverage}; expectationRef=uncovered symbol / missing promised test; confidence breach=missing vs observation=present-weak/unverified; out-of-scope drop; exactly-one-call; retry-exhaustion propagation)`, `COVERAGE_FINDINGS_SCHEMA (per-finding shape: severity/location/message required; expectationRef+confidence optional; additionalProperties:false)`, `buildCoveragePrompt (grounding.symbols+testsReaching, approvedPlan promised tests, output-shape reminder TRAILING; charge distinguishes present-failing from no-test and excludes pre-existing neighbour gaps)`
  - Fixtures: `A fakeProvider(scripted) that scripts completeStructured and counts calls (any other method absent, so a stray call throws)`, `A subject(changedFiles, promisedTests?) factory stubbing approvedPlan.body.tasks[].tests (for ac1) and a buildRecord pass/fail summary (for ac3), cast via unknown`, `A grounding(symbols) factory letting testsReaching be empty vs populated per symbol (for ac2), spanning the changed files`
- **live** — Optional end-to-end judgement against a real provider on a fixture with a KNOWN uncovered changed symbol (zero testsReaching) + a missing promised test, to confirm the prompt elicits both as HIGH-severity gaps with the right expectationRef — gated behind INSRC_LIVE_TESTS per the repo convention.
  - Subjects: `judgeCoverage against a real buildShaperProvider-resolved provider`
  - Fixtures: `A small subject+grounding fixture embodying one zero-testsReaching symbol and one missing promised test`, `INSRC_LIVE_TESTS=1 gate (skips cleanly when unset)`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: 'a promised test present in the plan but absent from the grounding is a HIGH missing-promised-test finding naming the test in expectationRef, confidence:breach' — fake returns that finding over a subject stubbing approvedPlan.body.tasks[].tests`, `unit: 'buildCoveragePrompt serializes the approvedPlan promised tests into the trailing payload' — assert the user message contains the promised test names` |
| `ac2` | `unit: 'a changed symbol with testsReaching.length===0 is reported not-exercised (HIGH, symbol in expectationRef)' — grounding fixture has one zero-testsReaching symbol`, `unit: 'a changed symbol WITH testsReaching yields no not-exercised finding' — grounding fixture has a populated testsReaching symbol; assert no gap finding for it` |
| `ac3` | `unit: 'a present-but-failing/unverified test is confidence:observation and distinct from a wholly-missing test (confidence:breach)' — fake returns one of each; assert the two are distinguished by confidence + message`, `unit: 'buildCoveragePrompt charge instructs distinguishing present-failing from no-test and forbids asserting an unsupported pass-state' — assert the system message carries the discipline` |
| `ac4` | `unit: 'a finding whose location file is outside changedFiles is dropped' — fake returns an in-scope gap + an out-of-scope neighbour gap; assert only the in-scope one survives`, `unit: 'pre-existing neighbour gap exclusion is in the prompt charge' — assert the system message instructs excluding gaps in touched-but-unchanged neighbours` |

## Migration

**State before:** The code-review stage has two dimension judges shipped: src/workflow/code-review/dimensions/adherence.ts (S002) and conventions.ts (S003), each exporting <DIM>_FINDINGS_SCHEMA + build<Dim>Prompt + judge<Dim> over the same seam (s1 sibling.template bundle). The sc1/sc2/sc3 contracts and the ReviewDimension union (including 'coverage') already exist in src/workflow/code-review/types.ts (s1 contract.trace bundle) — sc2 ChangedSymbolSummary already carries testsReaching and sc1 CodeReviewSubject already carries approvedPlan + buildRecord — and the structured-output helpers are in place (s1 helper.locate bundle). No coverage judge exists yet; the s6 orchestrator (unbuilt) will call each dimension judge in a serial loop. This story is purely additive — it introduces a new sibling module and no existing exported symbol changes.

**State after:** A new src/workflow/code-review/dimensions/coverage.ts sits beside adherence.ts and conventions.ts, exporting judgeCoverage + buildCoveragePrompt + COVERAGE_FINDINGS_SCHEMA. It produces the existing sc3 DimensionResult{dimension:'coverage'} with no change to any shared type, consuming testsReaching (sc2) + approvedPlan.body.tasks[].tests + buildRecord (sc1). adherence.ts, conventions.ts and every other module are untouched. The s6 orchestrator (later) imports judgeCoverage alongside judgeAdherence + judgeConventions.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the new module src/workflow/code-review/dimensions/coverage.ts (schema + prompt builder + judge). No existing file is edited; the addition is inert until s6 wires it into the orchestrator loop. — ↩ rollbackable
2. Add the unit test file src/workflow/code-review/dimensions/__tests__/coverage.test.ts. Test-only; no runtime surface change. — ↩ rollbackable

**Backward compat:** No backward-compatibility concern: the story adds a new internal-shared module and touches no existing public or exported API. sc1/sc2/sc3 and ReviewDimension are consumed exactly as owned at s1 — no field added, removed, or renamed — so no existing consumer (adherence.ts, conventions.ts, the future orchestrator, the persisted record shape) is affected. Removing coverage.ts would cleanly restore the prior state.

## Alternatives considered

### a1: Mirror-siblings, single call, reuse existing fields — **CHOSEN**

A structural clone of the adherence/conventions judges: COVERAGE_FINDINGS_SCHEMA reuses expectationRef (names the uncovered symbol or missing promised test) and confidence, encodes the ac3 present-failing-vs-missing distinction in severity+message, and passes BOTH approvedPlan.body.tasks[].tests and grounding.symbols[].testsReaching into one prompt.



### a2: Coverage status enum in the emitted schema

Same single-call seam, but COVERAGE_FINDINGS_SCHEMA adds a coverage-specific status enum ('missing'|'failing'|'weak') to each finding so the ac3 distinction is a first-class typed field, not a severity convention.



**Rejected because:** Only partial on sc3: to carry status to the s6 aggregator it needs a new sc3 DimensionFinding field (amends the shipped s1-owned contract, the churn ownership placement avoids), or the status field is folded into message and dies cosmetic at the mapping boundary. Diverges from the sibling per-finding shape at higher cost for a distinction a1 already expresses via severity+confidence.

### a3: Deterministic gap pre-compute + LLM only for weak-assertion

Compute the objective gaps deterministically in TS (missing promised tests by name-diff; changed symbols with zero testsReaching) and call the LLM only to judge whether a reaching test actually exercises the changed behaviour.



**Rejected because:** Partial on ac1 (name-diffing promised tests against grounding entities is brittle — a present test under a differently-worded name reads as 'missing') and ac3 (pass/fail is NOT deterministically available since the judge cannot run tests, re-introducing the ambiguity a3 tried to remove). The two-phase structure also breaks the one-serial-call sibling seam the s6 orchestrator relies on, at the highest cost (L).

## Citations

- **[[c2]]** `prior-artifact` `DEF/HLD 761a43a6fa645815 — the persisted record mirrors the existing artifact-review report shape (ReviewVerdict/Severity/ReviewReport), source of k1; the assumption behind sc3's Severity reuse`
- **[[c9]]** `prior-artifact` `DEF/HLD 761a43a6fa645815 — the stage runs after build and consumes the build record + approved LLD/PLAN as the fixed subject (source of k9); assumption behind sc1 and the ac1 promised-tests / ac3 pass-fail signal`
- **[[c10]]** `prior-artifact` `DEF/HLD 761a43a6fa645815 — no-approved-contract→no-verdict; the subject requires an approved LLD + PLAN; assumption behind sc1`
- **[[c12]]** `prior-artifact` `DEF/HLD 761a43a6fa645815 — a module-scoped read-only test-health view is owned elsewhere, so coverage is scoped to the Story's changed behaviour (source of c105/ac4); the invariant behind the scope-drop`
- **[[c16]]** `prior-artifact` `DEF/HLD 761a43a6fa645815 — the daemon owns all DB access and grounding is structured entity summaries (incl. testsReaching edges) not raw file dumps (source of k5/k6); assumption behind sc2 and the read-only invariant`
- **[[c17]]** `prior-artifact` `DEF/HLD 761a43a6fa645815 — nothing reaching an LLM provider runs under Promise.all (serial calls) and implementation follows the repo TS conventions (source of k4/k11/k12); assumption behind sc3 and the serial-call invariant`
- **[[c20]]** `analyze-bundle` `s1 sibling.template — src/workflow/code-review/dimensions/adherence.ts + conventions.ts (the shipped judge seams mirrored verbatim)`
- **[[c21]]** `analyze-bundle` `s1 contract.trace — src/workflow/code-review/types.ts (sc2 testsReaching) + src/workflow/artifacts/plan.ts (approvedPlan.body.tasks[].tests), coverage's two inputs`
- **[[c22]]** `analyze-bundle` `s1 helper.locate — src/agent/providers/structured-output.ts (validateAgainstSchema, withStructuredRetry throw-after-maxAttempts)`
- **[[c23]]** `analyze-bundle` `s1 test.locate — src/workflow/code-review/dimensions/__tests__/adherence.test.ts + conventions.test.ts (the fake-provider harness reused)`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 8 LOW** · model `client` · reviewed 2026-08-03T11:01:15.862Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| cv1 | citation | LOW | auto | The sibling template judges src/workflow/code-review/dimensions/adherence.ts and conventions.ts both exist and export their <DIM>_FINDINGS_SCHEMA + build<Dim>Prompt + judge<Dim> — the seam judgeCoverage clones. | adherence.ts:119 judgeAdherence and conventions.ts:148 judgeConventions + conventions.ts:105 buildConventionsPrompt + conventions.ts:53 CONVENTIONS_FINDINGS_SCHEMA all exist — the sibling seams judgeCoverage clones are real. | none — verified sound |
| cv2 | semantic | LOW | auto | sc2 ChangedSymbolSummary in src/workflow/code-review/types.ts carries testsReaching: readonly string[] — coverage's ac2 exercised/not-exercised signal. | src/workflow/code-review/types.ts:74 declares testsReaching: readonly string[] on interface ChangedSymbolSummary (types.ts:62). The ac2 exercised signal is on the sc2 contract as stated. | none — verified sound |
| cv3 | semantic | LOW | auto | sc1 CodeReviewSubject in types.ts carries approvedPlan and buildRecord — coverage's ac1 (promised tests) and ac3 (pass/fail signal) inputs. | src/workflow/code-review/types.ts:89 interface CodeReviewSubject carries approvedPlan and buildRecord — coverage's ac1 (promised tests) and ac3 (pass/fail) inputs are on the sc1 contract. | none — verified sound |
| cv4 | semantic | LOW | auto | The approved PlanArtifact's body.tasks[] each carry a tests[] of {level, name} — the 'promised tests' list ac1 checks; PlanTask.tests exists in the plan artifact type. | src/workflow/artifacts/plan.ts:55 interface PlanTask carries tests: readonly TaskTestRef[] (plan.ts:64), each {level, name}. approvedPlan.body.tasks[].tests — the promised-tests list ac1 checks — exists in source exactly as the LLD states. | none — verified sound |
| cv5 | external-contract | LOW | auto | src/agent/providers/structured-output.ts exports validateAgainstSchema and withStructuredRetry(call, validate, maxAttempts) which throws after the cap — the propagate-on-exhaustion helper the judge reuses. | structured-output.ts:80 validateAgainstSchema and :182 withStructuredRetry (throws after the cap) — the propagate-on-exhaustion helpers the judge reuses, unchanged from S002/S003. | none — verified sound |
| cv6 | closed-union | LOW | auto | The ReviewDimension union in types.ts includes 'coverage' (so no new union member is introduced) and DimensionFinding carries expectationRef + confidence (reused, no new field). | types.ts:33 ReviewDimension includes 'coverage'; DimensionFinding carries expectationRef? and confidence? (types.ts). No new union member and no new field — zero contract change. | none — verified sound |
| cv7 | inventory | LOW | auto | No src/workflow/code-review/dimensions/coverage.ts exists yet — this Story creates it as a new sibling module (purely additive; no judgeCoverage in src/ before this plan). | judgeCoverage / COVERAGE_FINDINGS_SCHEMA appear only in the LLD-s4 doc, not in any src/ file — coverage.ts does not exist yet, so the Story creating it is purely additive. | none — verified sound |
| cv8 | citation | LOW | auto | The fake-provider unit-test harness the coverage tests reuse exists in adherence.test.ts / conventions.test.ts (`as unknown as LLMProvider`, node:test + node:assert/strict). | conventions.test.ts (src/) uses `as unknown as LLMProvider` and node:test + node:assert/strict is the repo-wide convention — the fake-provider harness the coverage tests reuse exists. | none — verified sound |
