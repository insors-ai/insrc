<!-- insrc:artifact PLAN-761a43a6fa645815-s5 -->

# Plan: E20260804761a43a6:S005

**Epic:** `add-daemon-driven-code-review-stage`
**LLD run:** `wf-1785824079379-d3tx07`
**LLD effective hash:** `47535369867a...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Create quality.ts — schema, prompt builder, judge | M | — | unit: QUALITY_FINDINGS_SCHEMA: distinctive field is counterpartRef (not expectationRef); per-finding requires severity/location/message; counterpartRef + confidence optional; additionalProperties:false; unit: buildQualityPrompt: grounding.symbols (signature/callers/callees) then output-shape reminder TRAILING; charge enumerates the four risk classes, instructs counterpartRef on duplication, caps taste at LOW | [[c1]] [[c2]] [[c3]] [[c4]] |
| 2 | **`t2`** Fake-provider unit tests for the quality judge | M | `t1` | unit: ac1: the four risk classes (correctness/complexity/duplication/unhandled-error) each map to a finding with location + severity; unit: ac2: duplication finding maps counterpartRef through naming the existing symbol (dimension:'quality'); prompt charge mentions counterpartRef + payload includes callers/callees; unit: ac3: a matter-of-taste finding maps through at LOW severity (never HIGH); charge caps taste at LOW; unit: ac4: judgeQuality issues exactly ONE completeStructured call through the injected provider (no other provider method touched); unit: out-of-changedFiles finding is dropped; unit: retry-exhaustion: invalid model output on all 3 attempts → assert.rejects (no fabricated clean pass); unit: edge: empty grounding → {dimension:'quality', findings:[]} with no error; unit: edge: no-risk fake {findings:[]} → empty result, no manufactured finding; live: judgeQuality against a real buildShaperProvider provider on a fixture with a KNOWN duplication (INSRC_LIVE_TESTS-gated, skips when unset) | [[c5]] [[c1]] |

### E20260804761a43a6:S005:T001 — Create quality.ts — schema, prompt builder, judge

Add src/workflow/code-review/dimensions/quality.ts mirroring the shipped conventions.ts/coverage.ts: (a) QUALITY_FINDINGS_SCHEMA — the adherence per-finding shape (StructuredSchema, additionalProperties:false, findings[] of {severity enum HIGH|MED|LOW, location, message}) but its distinctive optional field is counterpartRef (NOT expectationRef) + optional confidence enum 'breach'|'observation'; required=['findings'], each finding requires severity/location/message; (b) buildQualityPrompt(subject, grounding, extraNote): LLMMessage[] with the QUALITY system charge (report the FOUR risk classes correctness/avoidable-complexity/duplication/unhandled-error each with location + severity; when flagging duplication name the existing counterpart in counterpartRef, citing only symbols visible in the grounding or their callers/callees; cap matters of taste at LOW severity so they never block; no manufactured findings) and the user message placing grounding.symbols (signature/callers/callees) then the output-shape reminder TRAILING; (c) private fileOf(location) splitting on ':'; (d) judgeQuality(subject, grounding, provider): Promise<DimensionResult> — one StructuredCall over provider.completeStructured(buildQualityPrompt(...note), QUALITY_FINDINGS_SCHEMA), a StructuredValidator via validateAgainstSchema(QUALITY_FINDINGS_SCHEMA, raw), await withStructuredRetry(call, validate, 3) POSITIONAL, then map output.findings to DimensionFinding{dimension:'quality'} spreading counterpartRef/confidence conditionally (exactOptionalPropertyTypes) and dropping any finding whose fileOf(location) is outside new Set(subject.changedFiles). Reads ONLY grounding.symbols + subject.changedFiles (not approvedPlan/buildRecord). Imports use .js extensions; type-only imports use import type; no console.log; no Promise.all.

**Acceptance checks:**
- src/workflow/code-review/dimensions/quality.ts exists exporting judgeQuality, buildQualityPrompt, QUALITY_FINDINGS_SCHEMA
- QUALITY_FINDINGS_SCHEMA's distinctive optional field is counterpartRef (NOT expectationRef); each finding requires severity/location/message; counterpartRef + confidence optional; additionalProperties:false
- judgeQuality issues exactly ONE provider.completeStructured call (no Promise.all) wrapped in withStructuredRetry(call, validate, 3) and propagates the throw on 3-attempt exhaustion (no catch-to-empty)
- returned findings all carry dimension:'quality', map counterpartRef + confidence through, and every finding.location file is in subject.changedFiles (out-of-scope dropped); reads only grounding.symbols + subject.changedFiles
- buildQualityPrompt places grounding.symbols (signature/callers/callees) then the output-shape reminder at the TAIL; system charge enumerates the four risk classes, instructs counterpartRef on duplication, and caps matters of taste at LOW severity
- tsc --noEmit is clean; imports carry .js extensions and type-only imports use import type

### E20260804761a43a6:S005:T002 — Fake-provider unit tests for the quality judge

Add src/workflow/code-review/dimensions/__tests__/quality.test.ts mirroring coverage.test.ts: a fakeProvider(scripted) returning {provider, calls} cast `as unknown as LLMProvider` (only completeStructured present, so any stray method throws), a subject(changedFiles) factory stubbing approvedLld/Plan via unknown (unused by quality), and a grounding(symbols) factory producing ChangedSymbolSummary[] with populated signature/callers/callees so a duplication finding can name a counterpart. Cover: (ac1) the four risk classes (correctness/complexity/duplication/unhandled-error) each map to a finding with location + severity, plus a QUALITY_FINDINGS_SCHEMA per-finding shape assertion; (ac2) a duplication finding maps counterpartRef through naming the existing symbol (dimension==='quality'), and buildQualityPrompt's charge mentions counterpartRef + the user payload includes the callers/callees edges; (ac3) a matter-of-taste finding maps through at LOW severity (never HIGH), and the system charge caps taste at LOW; (ac4) judgeQuality issues exactly ONE completeStructured call through the injected provider (no other provider method); plus out-of-changedFiles drop, retry-exhaustion-propagation (invalid output → assert.rejects), the two empty-result edge cases (empty grounding → findings:[]; no-risk fake {findings:[]} → no manufactured finding), and a prompt-trailing assertion. No live model.

**Acceptance checks:**
- src/workflow/code-review/dimensions/__tests__/quality.test.ts runs under `npx tsx --test` with node:test + node:assert/strict and a fake LLMProvider (no live model)
- tests cover ac1-ac4 plus out-of-scope drop, retry-exhaustion propagation (assert.rejects), the two empty-result edge cases, and the prompt-trailing placement
- the full `npx tsx --test 'src/workflow/code-review/**/*.test.ts'` sweep passes (S001-S005 green; any live test skips cleanly when INSRC_LIVE_TESTS unset)

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| judgeQuality (mapping to DimensionResult{quality}; counterpartRef=existing duplication counterpart; the four risk classes with location+severity; taste at LOW; out-of-scope drop; exactly-one-call; retry-exhaustion propagation) | `t1`, `t2` |
| QUALITY_FINDINGS_SCHEMA (per-finding shape: severity/location/message required; counterpartRef+confidence optional; additionalProperties:false) | `t1`, `t2` |
| buildQualityPrompt (grounding.symbols signature/callers/callees TRAILING; charge enumerates the four risk classes, instructs counterpartRef on duplication, caps taste at LOW) | `t1`, `t2` |
| judgeQuality against a real buildShaperProvider-resolved provider | `t2` |

## Citations

- **[[c1]]** `code` `src/workflow/code-review/dimensions/conventions.ts + coverage.ts — the shipped dimension-judge template (schema/prompt/judge seams + fake-provider test harness) quality.ts mirrors`
- **[[c2]]** `prior-artifact` `LLD s5 contractDetails — sc3 counterpartRef (the duplication-counterpart field, NOT expectationRef) + sc2 signature/callers/callees the duplication signal`
- **[[c3]]** `code` `src/agent/providers/structured-output.ts — validateAgainstSchema + withStructuredRetry(call, validate, maxAttempts) positional signature the judge reuses`
- **[[c4]]** `prior-artifact` `LLD s5 contractDetails/api + errorPaths — judgeQuality + buildQualityPrompt + QUALITY_FINDINGS_SCHEMA signatures + postconditions (one serial call, scope-drop, four risk classes, counterpartRef on duplication, taste-cap at LOW)`
- **[[c5]]** `prior-artifact` `LLD s5 testStrategy — the unit + live test levels, subjects, and acceptance mapping (ac1-ac4) t2 implements`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — plan (plan)

**0 HIGH · 0 MED · 6 LOW** · model `client` · reviewed 2026-08-04T06:34:57.575Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| qp1 | citation | LOW | auto | The template conventions.ts + coverage.ts exist with the schema/prompt/judge seams t1 mirrors. | conventions.ts:53 CONVENTIONS_FINDINGS_SCHEMA, coverage.ts:105 buildCoveragePrompt, coverage.ts:150 judgeCoverage all exist — the template t1 mirrors is real. | none — verified sound |
| qp2 | semantic | LOW | auto | sc3 DimensionFinding in types.ts carries the optional counterpartRef field (the quality duplication-counterpart, distinct from expectationRef), and sc2 ChangedSymbolSummary carries signature/callers/callees. | types.ts declares counterpartRef?: string on DimensionFinding and callers (types.ts:70) + callees (types.ts:72) on ChangedSymbolSummary — quality's distinctive sc3 field and the duplication signal both exist on the shipped contracts. | none — verified sound |
| qp3 | external-contract | LOW | auto | src/agent/providers/structured-output.ts exports validateAgainstSchema and withStructuredRetry(call, validate, maxAttempts) which throws after the cap — the helpers t1 reuses with the positional maxAttempts. | structured-output.ts:80 validateAgainstSchema and :182 withStructuredRetry (throws after the cap) — the helpers t1 reuses with positional maxAttempts. | none — verified sound |
| qp4 | inventory | LOW | auto | No src/workflow/code-review/dimensions/quality.ts exists yet — t1 creates it (purely additive; no judgeQuality in src/). | judgeQuality / QUALITY_FINDINGS_SCHEMA appear only in the design docs, not in any src/ file — quality.ts does not exist yet, so t1 is purely additive. | none — verified sound |
| qp5 | citation | LOW | auto | The fake-provider test harness t2 mirrors exists in coverage.test.ts (`as unknown as LLMProvider`, node:test + node:assert/strict). | coverage.test.ts (src/) uses `as unknown as LLMProvider` and node:test is the repo-wide convention — the fake-provider harness t2 mirrors exists. | none — verified sound |
| qp6 | ordering | LOW | auto | Task ordering is acyclic and topological (t1 order 1 no deps → t2 order 2 dependsOn t1); storyDependsOn s1 is satisfied on disk (ReviewDimension incl. 'quality'). | types.ts:33 ReviewDimension includes 'quality' — storyDependsOn s1 is satisfied; t1 (order 1, no deps) → t2 (order 2, dependsOn t1) is acyclic and topological. | none — verified sound |
