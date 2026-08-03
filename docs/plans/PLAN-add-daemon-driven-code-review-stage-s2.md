<!-- insrc:artifact PLAN-761a43a6fa645815-s2 -->

# Plan: E20260803761a43a6:S002

**Epic:** `add-daemon-driven-code-review-stage`
**LLD run:** `wf-1785746445877-nkg03b`
**LLD effective hash:** `47535369867a...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add ADHERENCE_FINDINGS_SCHEMA + the adherence prompt builder | S | — | unit: ADHERENCE_FINDINGS_SCHEMA per-finding shape maps 1:1 onto sc3 DimensionFinding (severity/location/message/expectationRef); unit: the prompt places the finding schema TRAILING (structural assertion on the assembled messages) and includes the decision-out-of-scope instruction | [[c2]] |
| 2 | **`t2`** Implement judgeAdherence (single serial call + map + scope) | M | `t1` | unit: judgeAdherence maps model findings to DimensionResult{dimension:'adherence'} with expectationRef populated (ac1); unit: empty model output => DimensionResult with findings:[] (ac2, no manufactured findings); unit: empty grounding (no symbols) => findings:[] without a wasted judgement error; unit: out-of-subject finding (location file not in changedFiles) is dropped; unit: exactly one provider.completeStructured call is issued and no other provider method is touched (serial, k4; provider-abstraction only, k3) | [[c1]] |
| 3 | **`t3`** Add the fake-provider unit tests + live-gated test | M | `t2` | unit: a faithful-but-differently-decided case yields findings:[] — the decision itself is not reported (ac3), with a prompt-content assertion the out-of-scope instruction is present; unit: invalid model output => StructuredOutputError propagates after the retry cap (no empty 'no divergence' pass); live: a real buildShaperProvider-resolved provider (CliProvider/Ollama, no cloud REST, high tier k10) produces a schema-valid DimensionResult | [[c3]] |

### E20260803761a43a6:S002:T001 — Add ADHERENCE_FINDINGS_SCHEMA + the adherence prompt builder

Create src/workflow/code-review/dimensions/adherence.ts and declare ADHERENCE_FINDINGS_SCHEMA (a StructuredSchema = Readonly<Record<string,unknown>>): an array of findings each with { severity, location, message, expectationRef } that maps 1:1 onto sc3 DimensionFinding. Add a pure prompt-builder that assembles an LLMMessage[] from subject.approvedLld + subject.approvedPlan + Story ACs + grounding.symbols, with the finding schema placed TRAILING (repo prompt-structure rule) and an explicit instruction that the approved DECISION itself is out of scope (only departures are findings).

**Acceptance checks:**
- ADHERENCE_FINDINGS_SCHEMA's per-finding shape maps 1:1 onto sc3 DimensionFinding (severity/location/message/expectationRef); dimension is fixed to 'adherence' by the judge, not the model
- the prompt builder emits an LLMMessage[] with the schema TRAILING and the decision-out-of-scope instruction present (ac3, c103/k8)
- reasons only over grounding.symbols (structured summaries), never raw file text (k6); no existing file modified

### E20260803761a43a6:S002:T002 — Implement judgeAdherence (single serial call + map + scope)

Add judgeAdherence(subject, grounding, provider): Promise<DimensionResult> that wraps ONE provider.completeStructured(messages, ADHERENCE_FINDINGS_SCHEMA) in withStructuredRetry(call, validateAgainstSchema(...), 3) — using the REAL positional maxAttempts signature, not an opts object — maps the validated findings onto DimensionResult{dimension:'adherence'} (populating expectationRef), and drops any finding whose location file is not in subject.changedFiles. Empty model output => findings:[]; empty grounding => findings:[]; a validation/provider failure after the cap PROPAGATES (never a fabricated pass). Read-only, exactly one provider call, no Promise.all.

**Acceptance checks:**
- judgeAdherence calls withStructuredRetry(call, validateAgainstSchema(...), 3) with the POSITIONAL maxAttempts (matching the real helper), not an opts object
- ac1: returns one DimensionFinding per scripted departure, each with expectationRef; ac2: no departures / empty grounding => findings:[] (no manufactured findings)
- out-of-subject findings (location file not in subject.changedFiles) are dropped
- ac4: exactly ONE completeStructured call is issued on the injected provider and no other provider method is touched (serial k4; LLMProvider-only k3)
- a schema-validation or provider failure after the retry cap propagates as StructuredOutputError — never an empty 'no divergence' pass (S006 ac5)

### E20260803761a43a6:S002:T003 — Add the fake-provider unit tests + live-gated test

Add src/workflow/code-review/dimensions/__tests__/adherence.test.ts: a fake LLMProvider (completeStructured returns scripted output; a call-counting spy) drives the offline cases — findings-with-expectationRef (ac1), empty/satisfied + empty-grounding (ac2), faithful-but-differently-decided => no finding + a prompt-content assertion the decision-out-of-scope instruction is present (ac3), exactly-one-call/no-other-method (ac4), out-of-subject drop, and an invalid-output-exhausts-retry failure case. A live case (buildShaperProvider-resolved real provider) gates behind INSRC_LIVE_TESTS.

**Acceptance checks:**
- all four ACs (ac1-ac4) have a passing offline unit test using a fake LLMProvider; no real model call in the default sweep
- the retry-exhaustion failure test asserts StructuredOutputError propagates (no fabricated pass)
- the live case skips cleanly when INSRC_LIVE_TESTS is unset

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| judgeAdherence maps model findings to DimensionResult{dimension:'adherence'} with expectationRef populated (ac1) | `t2` |
| empty model output => DimensionResult with findings:[] (ac2, no manufactured findings) | `t2` |
| out-of-subject finding (location file not in changedFiles) is dropped | `t2` |
| exactly one provider.completeStructured call is issued and no other provider method is touched (serial, k4; provider-abstraction only, k3) | `t2` |
| empty grounding (no symbols) => findings:[] without a wasted judgement error | `t2` |
| invalid model output => StructuredOutputError propagates after the retry cap (no empty 'no divergence' pass) | `t3` |
| the prompt places the finding schema TRAILING (structural assertion on the assembled messages) | `t1` |
| a real buildShaperProvider-resolved provider produces a schema-valid DimensionResult | `t3` |
| the resolved provider is a CliProvider/Ollama (no direct cloud REST) at no less than the high tier (k10) | `t3` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s2 contractDetails.api — judgeAdherence (single serial completeStructured + withStructuredRetry, map to DimensionResult{adherence}, drop out-of-subject)`
- **[[c2]]** `prior-artifact` `LLD s2 dataModelChanges — ADHERENCE_FINDINGS_SCHEMA (StructuredSchema mapping 1:1 to sc3 DimensionFinding) + the schema-trailing prompt`
- **[[c3]]** `prior-artifact` `LLD s2 testStrategy — fake-LLMProvider offline unit cases for ac1-ac4 + retry-failure + the live-gated real-provider check`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — plan (plan)

**0 HIGH · 0 MED · 5 LOW** · model `client` · reviewed 2026-08-03T10:14:56.969Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| t2/c1 | citation | LOW | manual | withStructuredRetry's real signature takes a POSITIONAL maxAttempts number (call, validate, maxAttempts), not an opts object — the correction t2 pins. | withStructuredRetry<T> at src/agent/providers/structured-output.ts:182 with `maxAttempts:  number` at :185 — the POSITIONAL signature t2 pins is correct (the LLD's opts-object sketch was rightly corrected). | none — verified sound |
| t2/c1 | citation | LOW | manual | provider.completeStructured (LLMProvider) + validateAgainstSchema exist — the two structured-output symbols t2 composes. | completeStructured<T> at src/shared/types.ts:216 (read found; implemented in cli-provider/mcp-sampling providers) and validateAgainstSchema<T> at structured-output.ts:80 — the two structured-output symbols t2 composes exist. | none — verified sound |
| t1/c2 | semantic | LOW | manual | sc3 DimensionFinding carries the fields the ADHERENCE_FINDINGS_SCHEMA maps 1:1 onto (severity, location, message, expectationRef) and dimension is fixed to 'adherence'. | DimensionFinding at src/workflow/code-review/types.ts:37 with location (:41), message (:42), expectationRef (:44) — the fields ADHERENCE_FINDINGS_SCHEMA maps 1:1 onto exist exactly. | none — verified sound |
| t3/c3 | citation | LOW | manual | buildShaperProvider exists — the resolver the live test uses to obtain a real high-tier CliProvider/Ollama provider. | buildShaperProvider at src/analyze/context/shaper-provider.ts:277 — the resolver the live test uses exists. | none — verified sound |
| t1 | semantic | LOW | manual | src/workflow/code-review/dimensions/ (adherence.ts) does not exist yet — t1 creates it; the plan lists exactly 3 tasks (t1-t3). | grep for dimensions/adherence and judgeAdherence returns 0 src matches — confirming the adherence module is genuinely new (t1 creates it); the plan lists exactly T001-T003 for this Story. | none — verified sound |
