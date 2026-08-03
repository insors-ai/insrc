<!-- insrc:artifact PLAN-761a43a6fa645815-s3 -->

# Plan: E20260803761a43a6:S003

**Epic:** `add-daemon-driven-code-review-stage`
**LLD run:** `wf-1785752878857-liuoe5`
**LLD effective hash:** `47535369867a...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Create conventions.ts — schema, DOCUMENTED_RULES, prompt builder, judge | M | — | unit: buildConventionsPrompt: DOCUMENTED_RULES baseline + output-shape reminder are TRAILING (after grounding.symbols); system charge forbids manufactured findings + carries breach-vs-observation discipline; unit: CONVENTIONS_FINDINGS_SCHEMA: per-finding requires severity/location/message; expectationRef + confidence optional; additionalProperties:false | [[c1]] [[c2]] [[c3]] [[c4]] [[c5]] |
| 2 | **`t2`** Fake-provider unit tests for the conventions judge | M | `t1` | unit: ac1: documented-rule breach → finding with rule id in expectationRef + confidence:'breach' + dimension:'conventions'; unit: ac2: three distinct TS-rule breaches each survive individually with correct file:line; unit: ac3: thin-sample idiom drift tagged confidence:'observation' (not breach); system charge carries the low-confidence discipline; grounding spans ≥2 files; unit: ac4: a Promise.all-over-LLM breach citing the k4 rule id survives with confidence:'breach'; unit: ac5: direct-storage (k5) + raw-dump (k6) breaches map through; an out-of-changedFiles finding is dropped; unit: judgeConventions issues exactly ONE completeStructured call (no other provider method touched); unit: retry-exhaustion: invalid model output on all 3 attempts → assert.rejects (no fabricated clean pass); unit: edge: grounding(0) → {dimension:'conventions', findings:[]} with no error; unit: edge: clean-code fake {findings:[]} → empty result, no manufactured finding; live: judgeConventions against a real buildShaperProvider provider on a fixture with a KNOWN .js-import-extension breach (INSRC_LIVE_TESTS-gated, skips when unset) | [[c6]] [[c1]] |

### E20260803761a43a6:S003:T001 — Create conventions.ts — schema, DOCUMENTED_RULES, prompt builder, judge

Add src/workflow/code-review/dimensions/conventions.ts mirroring the shipped adherence.ts: (a) CONVENTIONS_FINDINGS_SCHEMA (StructuredSchema, additionalProperties:false, findings[] of {severity enum HIGH|MED|LOW, location, message, expectationRef?, confidence? enum 'breach'|'observation'}; required=['findings'], each finding requires severity/location/message); (b) a private readonly DOCUMENTED_RULES constant — each entry {id, text} — enumerating the checkable CLAUDE.md rules (import .js extension; import type; shared-types-not-SDK; getLogger not console.log; strict-mode optional/indexed handling; deterministic entity IDs; no Promise.all over LLM/serial=k4; daemon-owns-storage=k5; structured-grounding-not-raw-dumps=k6; prompt-structure-trailing); (c) buildConventionsPrompt(subject, grounding, extraNote): LLMMessage[] with the standards-checking system charge (no-manufactured-findings + breach-vs-observation confidence discipline + multi-module sampling instruction) and the user message placing grounding.symbols then the DOCUMENTED_RULES baseline and output-shape reminder TRAILING; (d) private fileOf(location) splitting on ':'; (e) judgeConventions(subject, grounding, provider): Promise<DimensionResult> — one StructuredCall over provider.completeStructured(buildConventionsPrompt(...note), CONVENTIONS_FINDINGS_SCHEMA), a StructuredValidator via validateAgainstSchema(CONVENTIONS_FINDINGS_SCHEMA, raw), await withStructuredRetry(call, validate, 3) POSITIONAL, then map output.findings to DimensionFinding{dimension:'conventions'} spreading expectationRef/confidence conditionally (exactOptionalPropertyTypes) and dropping any finding whose fileOf(location) is outside new Set(subject.changedFiles). Imports use .js extensions; type-only imports use import type; no console.log; no Promise.all.

**Acceptance checks:**
- src/workflow/code-review/dimensions/conventions.ts exists exporting judgeConventions, buildConventionsPrompt, CONVENTIONS_FINDINGS_SCHEMA; DOCUMENTED_RULES is module-private
- judgeConventions issues exactly ONE provider.completeStructured call (no Promise.all) wrapped in withStructuredRetry(call, validate, 3) and propagates the throw on 3-attempt exhaustion (no catch-to-empty)
- returned findings all carry dimension:'conventions', map expectationRef + confidence through, and every finding.location file is in subject.changedFiles (out-of-scope dropped)
- buildConventionsPrompt places grounding.symbols, then DOCUMENTED_RULES + the output-shape reminder, at the TAIL of the user message; system charge forbids manufactured findings and carries the breach-vs-observation discipline
- tsc --noEmit is clean; imports carry .js extensions and type-only imports use import type; getLogger (not console.log) if any logging

### E20260803761a43a6:S003:T002 — Fake-provider unit tests for the conventions judge

Add src/workflow/code-review/dimensions/__tests__/conventions.test.ts mirroring adherence.test.ts: a fakeProvider(scripted) returning {provider, calls} cast `as unknown as LLMProvider` (only completeStructured present, so any other provider method call throws), a subject(changedFiles) factory (stub approvedLld/Plan cast via unknown), and a grounding(n) factory producing ChangedSymbolSummary[] spanning ≥2 files. Cover: (ac1) a documented-rule breach maps to a finding with the rule id in expectationRef + confidence:'breach' and dimension==='conventions', and buildConventionsPrompt embeds the DOCUMENTED_RULES baseline; (ac2) three distinct TS-rule breaches each survive individually with correct file:line, plus a CONVENTIONS_FINDINGS_SCHEMA per-finding shape assertion; (ac3) a thin-sample idiom finding tagged confidence:'observation' maps through as observation, and the system charge carries the low-confidence-observation discipline; (ac4) a Promise.all-over-LLM breach citing the k4 rule id survives with confidence:'breach'; (ac5) direct-storage (k5) + raw-dump (k6) breaches map through, and an out-of-changedFiles finding is dropped; plus exactly-one-call and retry-exhaustion-propagation (invalid output → assert.rejects) and a prompt-trailing assertion. ADDED per critique: (edge-a) grounding(0) still returns {dimension:'conventions', findings:[]} with no error; (edge-b) a fake returning {findings:[]} yields an empty result (no manufactured finding). No live model.

**Acceptance checks:**
- src/workflow/code-review/dimensions/__tests__/conventions.test.ts runs under `npx tsx --test` with node:test + node:assert/strict and a fake LLMProvider (no live model)
- tests cover ac1-ac5 plus exactly-one-call, retry-exhaustion propagation (assert.rejects), out-of-subject drop, the prompt-trailing placement, AND the two empty-result edge cases (empty grounding.symbols → findings:[]; clean-code fake {findings:[]} → no manufactured finding)
- the full `npx tsx --test 'src/workflow/code-review/**/*.test.ts'` sweep passes (S001 + S002 + S003 green; any live test skips cleanly when INSRC_LIVE_TESTS unset)

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| judgeConventions (mapping to DimensionResult{conventions}, expectationRef rule id, confidence tier, out-of-scope drop, exactly-one-call, retry-exhaustion propagation) | `t1`, `t2` |
| CONVENTIONS_FINDINGS_SCHEMA (per-finding shape: severity/location/message required; expectationRef+confidence optional; additionalProperties:false) | `t1`, `t2` |
| buildConventionsPrompt (DOCUMENTED_RULES + output-shape reminder TRAILING; decision/no-manufactured discipline in system message) | `t1`, `t2` |
| judgeConventions against a real buildShaperProvider-resolved provider | `t2` |

## Citations

- **[[c1]]** `code` `src/workflow/code-review/dimensions/adherence.ts — the shipped S002 judge template (schema/prompt/judge seams + fake-provider test harness) conventions.ts mirrors`
- **[[c2]]** `prior-artifact` `LLD s3 contractDetails — sc3 DimensionFinding fields (expectationRef, confidence 'observation'|'breach') the judge maps through without a contract change`
- **[[c3]]** `code` `src/agent/providers/structured-output.ts — validateAgainstSchema + withStructuredRetry(call, validate, maxAttempts) positional signature the judge reuses`
- **[[c4]]** `doc` `CLAUDE.md 'Code conventions' — the checkable documented rules the DOCUMENTED_RULES constant enumerates (k4/k5/k6/k11/k12)`
- **[[c5]]** `prior-artifact` `LLD s3 contractDetails/api — judgeConventions + buildConventionsPrompt + CONVENTIONS_FINDINGS_SCHEMA signatures + postconditions (one serial call, scope-drop, TRAILING prompt)`
- **[[c6]]** `prior-artifact` `LLD s3 testStrategy — the unit + live test levels, subjects, and acceptance mapping (ac1-ac5) t2 implements`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — plan (plan)

**0 HIGH · 0 MED · 6 LOW** · model `client` · reviewed 2026-08-03T10:46:38.960Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| pl1 | citation | LOW | auto | The template src/workflow/code-review/dimensions/adherence.ts (c1) exists with the schema/prompt/judge seams t1 mirrors: ADHERENCE_FINDINGS_SCHEMA, buildAdherencePrompt, private fileOf, judgeAdherence. | adherence.ts has every seam t1 mirrors: ADHERENCE_FINDINGS_SCHEMA (:49), buildAdherencePrompt (:74), fileOf (:109), judgeAdherence (:119). The template is real. | none — verified sound |
| pl2 | external-contract | LOW | auto | The reused helpers exist as t1 relies on: validateAgainstSchema and withStructuredRetry(call, validate, maxAttempts) with the third arg POSITIONAL (c3) in src/agent/providers/structured-output.ts. | structured-output.ts exports validateAgainstSchema (:80) and withStructuredRetry (:182) — the helpers t1 reuses with the positional maxAttempts. | none — verified sound |
| pl3 | semantic | LOW | auto | The sc3 DimensionFinding fields the judge maps through (c2) — expectationRef and confidence 'observation'\|'breach' — exist in src/workflow/code-review/types.ts unchanged, and ReviewDimension includes 'conventions'. | types.ts:48 confidence?: 'observation' \| 'breach' \| undefined; expectationRef? present; ReviewDimension (types.ts:33) includes 'conventions'. The judge maps these existing fields through with no contract change. | none — verified sound |
| pl4 | inventory | LOW | auto | The fake-provider test harness t2 mirrors exists in adherence.test.ts (c1/c6): the `as unknown as LLMProvider` fake pattern and node:test/node:assert usage. | adherence.test.ts uses `as unknown as LLMProvider` (the src/ hit at dimensions/__tests__/adherence.test.ts), and node:test + node:assert/strict is the repo-wide convention. The fake-provider harness t2 mirrors exists. | none — verified sound |
| pl5 | inventory | LOW | auto | The target module src/workflow/code-review/dimensions/conventions.ts does not exist yet — t1 creates it (purely additive; no judgeConventions in src/ before this plan). | judgeConventions / CONVENTIONS_FINDINGS_SCHEMA appear only in the design docs, not in any src/ file — conventions.ts does not exist yet, so t1 creating it is purely additive. | none — verified sound |
| pl6 | ordering | LOW | auto | Task ordering is acyclic and topological: t1 (order 1, no deps) precedes t2 (order 2, dependsOn t1); the Story's storyDependsOn s1 is already satisfied on disk. | ReviewDimension is defined in src/workflow/code-review/types.ts:33 (s1 shipped), so storyDependsOn s1 is satisfied; t1 (order 1, no deps) → t2 (order 2, dependsOn t1) is acyclic and topological. | none — verified sound |
