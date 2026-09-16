<!-- insrc:artifact LLD-761a43a6fa645815-s2 -->

# LLD: E20260803761a43a6:S002

**Epic:** `add-daemon-driven-code-review-stage`
**HLD base run:** `wf-1785741597494-lbzdo7`
**HLD effective hash:** `47535369867a...`

## HLD context

**Framework:** A hybrid code-review stage: a code-review orchestrator runs the four dimensions as an explicit SERIAL provider loop, reusing workflow-rpc.ts machinery and mirroring the review vocabulary (ReviewVerdict/Severity/ReviewReport). It consumes the build record + approved LLD/PLAN as its fixed subject and never modifies the code it judges.
**Rollout phase:** Phase B — The four dimension judgements
**Consumes:** `sc1` (CodeReviewSubject), `sc2` (CodeReviewGrounding), `sc3` (DimensionFinding)

## Contract details

**Surface level:** internal

### `judgeAdherence`

```typescript
(subject: CodeReviewSubject, grounding: CodeReviewGrounding, provider: LLMProvider) => Promise<DimensionResult>
```

**Parameters:**
- `subject: CodeReviewSubject` — the fixed review subject (sc1): approvedLld + approvedPlan + changedFiles — the approved contract the code is judged against
- `grounding: CodeReviewGrounding` — the sc2 structured symbol summaries of the changed code (never raw file text)
- `provider: LLMProvider` — the model seam, resolved by the orchestrator via buildShaperProvider at the review/high tier; injected so the judge is pure + testable

**Returns:** `DimensionResult` — { dimension: 'adherence', findings } — one DimensionFinding per place the changed code departs from an approved expectation, each carrying expectationRef; an empty findings[] when the code satisfies every expectation (ac2)

**Errors:**
- `StructuredOutputError` when the provider's completeStructured output fails schema validation after withStructuredRetry's ≤3 attempts — propagated (the run reports a failure, never a fabricated pass; S006 ac5)

**Preconditions:**
- provider is resolved at no less than the high/critical tier (k10) and reaches the model only via the LLMProvider abstraction — no direct cloud REST (k3)
- subject.approvedLld and subject.approvedPlan are present (guaranteed by resolveCodeReviewSubject having returned ok:true)

**Postconditions:**
- read-only — the judge invokes only provider.completeStructured, never a write/edit tool (S001 ac5)
- exactly ONE provider call is issued (serial, no Promise.all — k4)
- every finding names the approved expectation it failed via expectationRef (ac1); no finding is raised merely because the reviewer would have decided differently (ac3, c103/k8)

### `completeStructured`

```typescript
<T>(messages: LLMMessage[], schema: StructuredSchema, opts?: CompletionOpts) => Promise<T>
```

**Parameters:**
- `messages: LLMMessage[]` — the adherence prompt (approved LLD + plan tasks + ACs + grounding symbols) with the finding schema TRAILING
- `schema: StructuredSchema` — the adherence-findings schema the model output is validated against
- `opts: CompletionOpts` _(optional)_ — completion options

**Returns:** `T` — the validated structured findings payload; existing LLMProvider method (src/shared/types.ts:216)

**Errors:**
- `ProviderError` when the underlying CLI/Ollama provider call fails — surfaced to withStructuredRetry

**Preconditions:**
- reached through the LLMProvider abstraction only (k3)

**Postconditions:**
- no store access; pure model call

### `withStructuredRetry`

```typescript
<T>(attempt: (feedback?: string) => Promise<T>, validate: (raw: unknown) => T, opts?: { maxAttempts?: number }) => Promise<T>
```

**Parameters:**
- `attempt: (feedback?: string) => Promise<T>` — the completeStructured call, re-issued with validation feedback on retry
- `validate: (raw: unknown) => T` — validateAgainstSchema for the adherence findings
- `opts: { maxAttempts?: number }` _(optional)_ — retry cap (default ≤3, mirroring workflow-rpc.ts synth retry)

**Returns:** `T` — the validated payload, or throws after the attempt cap; existing helper (src/agent/providers/structured-output.ts:182)

**Errors:**
- `StructuredOutputError` when validation still fails after maxAttempts

**Preconditions:**
- each attempt is a single serial provider call (k4)

**Postconditions:**
- at most maxAttempts serial calls; no parallelism

## Data model changes

### `ADHERENCE_FINDINGS_SCHEMA (internal structured schema)` — new

A private StructuredSchema describing the model's adherence output: an array of findings each with { severity, location, message, expectationRef } that maps 1:1 onto sc3 DimensionFinding (dimension is fixed to 'adherence' by the judge, not the model). Passed to completeStructured + validateAgainstSchema. No new persisted/domain type — the judge emits the existing sc3 DimensionResult.

**Call sites:**
- `src/workflow/code-review/types.ts`
- `src/agent/providers/structured-output.ts`
- `src/shared/types.ts`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | judgeAdherence reads subject.approvedLld + subject.approvedPlan + subject.changedFiles as the approved contract the code is judged against — the fixed subject, never re-derived. |
| `sc2` | consumes | judgeAdherence reads grounding.symbols (ChangedSymbolSummary) as the sole view of the changed code — structured summaries, never raw file dumps (k6). |
| `sc3` | consumes | judgeAdherence EMITS DimensionResult{dimension:'adherence', findings:DimensionFinding[]} — the sc3 vocabulary, with expectationRef populated for ac1. S002 does not own sc3 (S001 does); it produces values of that shape for the aggregate (s6). |

## Error paths

### Error cases

- **The model's adherence output never validates against the findings schema.** (recoverable)
  - Detection: validateAgainstSchema rejects each completeStructured attempt; withStructuredRetry exhausts its ≤3 attempts and throws StructuredOutputError.
  - Response: Propagate the StructuredOutputError — the adherence dimension reports a FAILURE, never a fabricated empty/pass result (S006 ac5 folds this into the run's failure, not a spurious 'no divergence').
  - User impact: The reviewer learns the adherence judgement could not be produced this run, rather than a misleading clean verdict.
- **The provider (CLI claude/codex or Ollama) call itself fails mid-judgement (subprocess crash / timeout).** (recoverable)
  - Detection: provider.completeStructured rejects with a ProviderError, surfaced into withStructuredRetry's attempt.
  - Response: withStructuredRetry re-issues the single serial call; if still failing after the cap, the ProviderError propagates as a run failure (never a pass).
  - User impact: Same as above — an honest failure, retried first; the Story is not marked adhering on a crashed judgement.
- **The model returns a finding whose location is OUTSIDE the Story's changed set (a hallucinated or wider-repo reference).** (recoverable)
  - Detection: After validation, the judge checks each finding.location's file against subject.changedFiles.
  - Response: Drop findings whose file is not in changedFiles — the adherence judgement is scoped to exactly this Story's own changes; unrelated code is not judged (k9/S001).
  - User impact: Findings stay attributable to the Story's author; no noise about untouched code.

### Edge cases

| Input | Expected |
| :--- | :--- |
| The Story's grounding has no symbols (the change touched only non-code files, so sc2 produced an empty symbol set). | The judge returns DimensionResult{dimension:'adherence', findings:[]} — there is no changed code behaviour to weigh against the contract; a valid empty result, not an error. |
| The changed code satisfies every approved expectation. | DimensionResult{dimension:'adherence', findings:[]} — no manufactured findings (ac2). |
| One change departs from several approved expectations at once. | One finding per departed expectation, each with its own expectationRef — not collapsed into a single finding nor double-counted. |
| The code faithfully implements a design decision the reviewer would have chosen differently. | No finding — the decision itself is out of scope (ac3, c103/k8); only DEPARTURES from the approved expectation are reported. |

### Invariants to preserve

- All model reasoning goes through the LLMProvider abstraction (buildShaperProvider) via the locally-installed CLI OAuth session — no direct cloud REST is introduced (k3), and the provider is pinned at no less than the high/critical tier (k10). [[c14]]
- The adherence judge issues exactly ONE provider call per run and never fans out under Promise.all — provider calls stay serial (k4). [[c17]]
- The judge reasons only over the sc2 structured symbol summaries, never raw file contents (k6); and it is read-only, invoking no write/edit tool. [[c16]]
- Findings use the sc3 Severity + DimensionResult vocabulary verbatim, so adherence findings fold into the one aggregate record vocabulary (s6). [[c2]]

## Test strategy

**Test framework:** `node:test + node:assert/strict, run via `npx tsx --test 'src/**/__tests__/*.test.ts'` (live/provider-touching suites gate behind INSRC_LIVE_TESTS and skip cleanly when unset)`

### Test levels

- **unit** — Prove judgeAdherence's mapping + scoping logic against a FAKE LLMProvider whose completeStructured returns canned model output — no real model call, fully offline.
  - Subjects: `judgeAdherence maps model findings to DimensionResult{dimension:'adherence'} with expectationRef populated (ac1)`, `empty model output => DimensionResult with findings:[] (ac2, no manufactured findings)`, `out-of-subject finding (location file not in changedFiles) is dropped`, `exactly one provider.completeStructured call is issued and no other provider method is touched (serial, k4; provider-abstraction only, k3)`, `empty grounding (no symbols) => findings:[] without a wasted judgement error`
  - Fixtures: `a fake LLMProvider whose completeStructured returns a scripted findings array (and an empty variant)`, `a small CodeReviewSubject (approvedLld/Plan stubs + changedFiles) and CodeReviewGrounding fixture`, `a call-counting spy on the fake provider to assert exactly one call + method used`
- **unit** — Prove the retry/failure path: a fake provider that returns invalid output exhausts withStructuredRetry and the judge propagates a failure (never a fabricated pass).
  - Subjects: `invalid model output => StructuredOutputError propagates after the retry cap (no empty 'no divergence' pass)`, `the prompt places the finding schema TRAILING (structural assertion on the assembled messages)`
  - Fixtures: `a fake LLMProvider whose completeStructured yields schema-invalid output every attempt`
- **live** — Exercise judgeAdherence against a REAL high-tier provider on a tiny fixture, asserting the tier + no-cloud-REST path end to end.
  - Subjects: `a real buildShaperProvider-resolved provider produces a schema-valid DimensionResult`, `the resolved provider is a CliProvider/Ollama (no direct cloud REST) at no less than the high tier (k10)`
  - Fixtures: `INSRC_LIVE_TESTS=1 + a configured CLI/Ollama provider`, `a tiny approved LLD/PLAN + grounding fixture`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: judgeAdherence returns one DimensionFinding per scripted departure, each with expectationRef naming the approved clause` |
| `ac2` | `unit: a fake provider returning no departures yields DimensionResult{dimension:'adherence', findings:[]} — no manufactured findings`, `unit: empty grounding also yields findings:[] (nothing to judge)` |
| `ac3` | `unit: a scripted 'faithful-but-differently-decided' case (the model, per the prompt, raises nothing) yields findings:[] — the decision itself is not reported; plus a prompt-content assertion that the decision-out-of-scope instruction (c103/k8) is present` |
| `ac4` | `unit: the judge issues exactly ONE completeStructured call on the injected provider and touches no other provider method (serial k4; LLMProvider-abstraction-only k3)`, `live: the orchestrator-resolved provider is a CliProvider/Ollama at no less than the high tier (k10), no cloud REST (INSRC_LIVE_TESTS)` |

## Migration

**State before:** Per s1 grounding: the code-review module (S001) exists — src/workflow/code-review/types.ts declares sc1/sc2/sc3 (ReviewDimension incl. 'adherence', DimensionFinding with expectationRef, DimensionResult, CodeReviewSubject, CodeReviewGrounding), subject.ts/grounding.ts resolve the subject + grounding, and the codeReview.grounding IPC serves them — but there is NO dimension judge of any kind. buildShaperProvider (shaper-provider.ts:277), LLMProvider.completeStructured (shared/types.ts:216), and withStructuredRetry (structured-output.ts:182) all exist. Nothing yet consumes sc1/sc2/sc3 to produce a DimensionResult.

**State after:** A new src/workflow/code-review/dimensions/adherence.ts declares ADHERENCE_FINDINGS_SCHEMA and judgeAdherence(subject, grounding, provider): Promise<DimensionResult>, which builds the adherence prompt (approved LLD + plan tasks + ACs + grounding symbols, schema trailing), issues ONE serial completeStructured call via the injected provider (wrapped in withStructuredRetry), drops any out-of-subject findings, and returns DimensionResult{dimension:'adherence'}. sc1/sc2/sc3, the provider seams, and everything else are READ but unchanged.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add a new module src/workflow/code-review/dimensions/adherence.ts exporting ADHERENCE_FINDINGS_SCHEMA (a StructuredSchema) and judgeAdherence, which composes the prompt from the sc1 subject + sc2 grounding, calls the injected LLMProvider.completeStructured once through withStructuredRetry, maps the validated findings onto sc3 DimensionResult{dimension:'adherence'} (fixing dimension itself, populating expectationRef), and drops findings whose location falls outside subject.changedFiles. Purely additive new module. — ↩ rollbackable
2. Add the unit + live-gated tests under src/workflow/code-review/dimensions/__tests__/adherence.test.ts, injecting a fake LLMProvider for the offline cases and gating the real-provider case behind INSRC_LIVE_TESTS. Additive test file. — ↩ rollbackable

**Backward compat:** Purely additive: no existing type, function, IPC method, or on-disk record is modified. judgeAdherence is a new internal function that only CONSUMES the existing sc1/sc2/sc3 contracts and the LLMProvider seam; the orchestrator that will call it does not exist yet (s6), so there is no consumer to break. Removing the new module fully reverts the state.

## Alternatives considered

### a1: Single-call structured adherence judge (provider injected) — **CHOSEN**

One judgeAdherence(subject, grounding, provider) making a single completeStructured call over the whole approved contract + grounding, returning DimensionResult{dimension:'adherence'}.



### a2: Per-expectation fan-out (one call per approved expectation)

One provider call per expectation (rejected: fragments the judgement, partial on ac2/ac3, strains k4 for no accuracy gain).



### a3: Two-phase: extract expectation catalog, then judge against it

A catalog-extraction call then a judging call (rejected: a second call + catalog-drift failure mode for a precision gain a1 already achieves via expectationRef).



## Citations

- **[[c1]]** `code` `src/workflow/code-review/types.ts — sc1/sc2/sc3 (CodeReviewSubject, CodeReviewGrounding, DimensionFinding/DimensionResult, ReviewDimension incl. 'adherence', expectationRef) the judge consumes/emits`
- **[[c2]]** `code` `src/analyze/context/shaper-provider.ts:277 buildShaperProvider — role-tiering provider resolution (high/critical tier k10, CliProvider/Ollama no cloud REST k3)`
- **[[c14]]** `code` `src/shared/types.ts:216 LLMProvider.completeStructured + src/agent/providers/structured-output.ts:182 withStructuredRetry — the single serial structured call + validate/retry the judge reuses`
- **[[c16]]** `doc` `CLAUDE.md Key architectural rules — grounding is structured entity summaries not raw file dumps (k6); read-only review`
- **[[c17]]** `doc` `CLAUDE.md Code conventions — never Promise.all over an LLM provider; serial calls (k4)`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 6 LOW** · model `client` · reviewed 2026-08-03T10:07:44.730Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| c14 | citation | LOW | manual | LLMProvider.completeStructured exists in src/shared/types.ts (~line 216) — the wire-layer structured call judgeAdherence issues. | LLMProvider at src/shared/types.ts:177 and completeStructured<T> read at :216 (found=true) — the structured call the judge issues exists as cited. | none — verified sound |
| c14 | citation | LOW | manual | withStructuredRetry is exported from src/agent/providers/structured-output.ts (~line 182) — the ≤3-attempt validate+retry loop the judge wraps its call in. | withStructuredRetry<T> at src/agent/providers/structured-output.ts:182 — the retry loop the judge wraps its call in exists. | none — verified sound |
| c14 | citation | LOW | manual | validateAgainstSchema is exported from src/agent/providers/structured-output.ts (~line 80) — the validator the retry loop applies to the adherence findings. | validateAgainstSchema<T> at src/agent/providers/structured-output.ts:80 — the validator exists. | none — verified sound |
| c2 | citation | LOW | manual | buildShaperProvider is exported from src/analyze/context/shaper-provider.ts (~line 277) — the role-tiering provider resolver the orchestrator uses to pin the high tier (k10) with no cloud REST (k3). | buildShaperProvider at src/analyze/context/shaper-provider.ts:277 — the role-tiering provider resolver exists (also referenced by the provider-bypass-audit test). | none — verified sound |
| c1 | citation | LOW | manual | The sc1/sc2/sc3 types the judge consumes/emits (CodeReviewSubject, CodeReviewGrounding, DimensionResult, DimensionFinding with expectationRef, ReviewDimension including 'adherence') exist in src/workflow/code-review/types.ts. | CodeReviewSubject:89, CodeReviewGrounding:78, DimensionResult:52, expectationRef:44 all in src/workflow/code-review/types.ts — the sc1/sc2/sc3 vocabulary the judge consumes/emits exists exactly as cited. | none — verified sound |
| migration | semantic | LOW | manual | No dimension judge exists yet — src/workflow/code-review/dimensions/ (adherence.ts) is a new module S002 adds; nothing currently emits a DimensionResult. | grep for judgeAdherence and dimensions/adherence returns 0 src matches — confirming the adherence judge is a genuinely new module (nothing yet emits a DimensionResult), matching the migration's stateBefore. | none — verified sound |
