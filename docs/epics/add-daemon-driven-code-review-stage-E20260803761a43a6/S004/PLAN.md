<!-- insrc:artifact PLAN-761a43a6fa645815-s4 -->

# Plan: E20260803761a43a6:S004

**Epic:** `add-daemon-driven-code-review-stage`
**LLD run:** `wf-1785754381044-msgah1`
**LLD effective hash:** `47535369867a...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Create coverage.ts — schema, two-input prompt builder, judge | M | — | unit: buildCoveragePrompt: grounding.symbols+testsReaching, then approvedPlan promised tests, then output-shape reminder are TRAILING; system charge distinguishes present-failing from no-test, forbids an unsupported pass-state, excludes pre-existing neighbour gaps; unit: COVERAGE_FINDINGS_SCHEMA: per-finding requires severity/location/message; expectationRef + confidence optional; additionalProperties:false; unit: judgeCoverage + buildCoveragePrompt tolerate subject.buildRecord===null (runs, returns a valid DimensionResult, prompt degrades to 'unverified') | [[c1]] [[c2]] [[c3]] [[c4]] |
| 2 | **`t2`** Fake-provider unit tests for the coverage judge | M | `t1` | unit: ac1: promised test absent from grounding → HIGH missing-promised-test finding, expectationRef=test name, confidence:'breach'; prompt embeds promised test names; unit: ac2: changed symbol with testsReaching.length===0 → HIGH not-exercised (symbol in expectationRef); symbol WITH testsReaching → no gap finding; unit: ac3: present-but-failing/unverified test → confidence:'observation' distinct from wholly-missing (confidence:'breach'); charge carries the discipline; unit: ac4: out-of-changedFiles finding dropped; charge instructs excluding pre-existing neighbour gaps; unit: judgeCoverage issues exactly ONE completeStructured call (no other provider method touched); unit: retry-exhaustion: invalid model output on all 3 attempts → assert.rejects (no fabricated clean pass); unit: edge: empty grounding + no promised tests → {dimension:'coverage', findings:[]} with no error; unit: edge: all-covered fake {findings:[]} → empty result, no manufactured finding; unit: null-buildRecord: judgeCoverage runs and returns a valid DimensionResult with subject.buildRecord===null; live: judgeCoverage against a real buildShaperProvider provider on a fixture with a KNOWN zero-testsReaching symbol + a missing promised test (INSRC_LIVE_TESTS-gated, skips when unset) | [[c5]] [[c1]] |

### E20260803761a43a6:S004:T001 — Create coverage.ts — schema, two-input prompt builder, judge

Add src/workflow/code-review/dimensions/coverage.ts mirroring the shipped conventions.ts: (a) COVERAGE_FINDINGS_SCHEMA — IDENTICAL to CONVENTIONS_FINDINGS_SCHEMA (StructuredSchema, additionalProperties:false, findings[] of {severity enum HIGH|MED|LOW, location, message, expectationRef?, confidence? enum 'breach'|'observation'}; required=['findings'], each finding requires severity/location/message); (b) buildCoveragePrompt(subject, grounding, extraNote): LLMMessage[] with the COVERAGE system charge (report each changed symbol exercised/not per testsReaching; each promised test present/missing and passing/failing/unverified; distinguish present-failing from no-test; NEVER assert a pass-state the buildRecord does not support — frame unknown as 'unverified'; exclude pre-existing gaps in touched-but-unchanged neighbours; no-manufactured-findings) and the user message placing grounding.symbols (with testsReaching) then approvedPlan.body.tasks[].tests (the promised tests) then the output-shape reminder TRAILING; tolerate a null subject.buildRecord (degrade to 'pass-state unverified'); (c) private fileOf(location) splitting on ':'; (d) judgeCoverage(subject, grounding, provider): Promise<DimensionResult> — one StructuredCall over provider.completeStructured(buildCoveragePrompt(...note), COVERAGE_FINDINGS_SCHEMA), a StructuredValidator via validateAgainstSchema(COVERAGE_FINDINGS_SCHEMA, raw), await withStructuredRetry(call, validate, 3) POSITIONAL, then map output.findings to DimensionFinding{dimension:'coverage'} spreading expectationRef/confidence conditionally (exactOptionalPropertyTypes) and dropping any finding whose fileOf(location) is outside new Set(subject.changedFiles). Imports use .js extensions; type-only imports use import type; no console.log; no Promise.all.

**Acceptance checks:**
- src/workflow/code-review/dimensions/coverage.ts exists exporting judgeCoverage, buildCoveragePrompt, COVERAGE_FINDINGS_SCHEMA
- judgeCoverage issues exactly ONE provider.completeStructured call (no Promise.all) wrapped in withStructuredRetry(call, validate, 3) and propagates the throw on 3-attempt exhaustion (no catch-to-empty)
- returned findings all carry dimension:'coverage', map expectationRef + confidence through, and every finding.location file is in subject.changedFiles (out-of-scope dropped)
- buildCoveragePrompt places grounding.symbols+testsReaching, then approvedPlan.body.tasks[].tests, then the output-shape reminder at the TAIL of the user message; system charge distinguishes present-failing from no-test, forbids asserting an unsupported pass-state, and excludes pre-existing neighbour gaps
- buildCoveragePrompt and judgeCoverage tolerate a null subject.buildRecord (the prompt degrades to 'pass-state unverified'; the judge runs without throwing)
- tsc --noEmit is clean; imports carry .js extensions and type-only imports use import type

### E20260803761a43a6:S004:T002 — Fake-provider unit tests for the coverage judge

Add src/workflow/code-review/dimensions/__tests__/coverage.test.ts mirroring conventions.test.ts: a fakeProvider(scripted) returning {provider, calls} cast `as unknown as LLMProvider` (only completeStructured present, so any stray method throws), a subject(changedFiles, promisedTests?) factory stubbing approvedPlan.body.tasks[].tests (for ac1) and a buildRecord summary (for ac3) cast via unknown, and a grounding(symbols) factory letting testsReaching be empty vs populated per symbol (for ac2), spanning ≥2 changed files. Cover: (ac1) a promised test absent from the grounding is a HIGH missing-promised-test finding naming it in expectationRef + confidence:'breach', and buildCoveragePrompt embeds the promised test names in the trailing payload; (ac2) a changed symbol with testsReaching.length===0 is a HIGH not-exercised finding (symbol in expectationRef), and a symbol WITH testsReaching yields no gap finding; (ac3) a present-but-failing/unverified test is confidence:'observation' and distinct from a wholly-missing test (confidence:'breach'), and the system charge carries the present-failing-vs-no-test + no-unsupported-pass-state discipline; (ac4) an out-of-changedFiles finding is dropped and the system charge instructs excluding pre-existing neighbour gaps; plus exactly-one-call, retry-exhaustion-propagation (invalid output → assert.rejects), the two empty-result edge cases (empty grounding+no promised tests → findings:[]; all-covered fake {findings:[]} → no manufactured finding), a null-buildRecord tolerance test (judgeCoverage runs and returns a valid result with subject.buildRecord===null), and a prompt-trailing assertion. No live model.

**Acceptance checks:**
- src/workflow/code-review/dimensions/__tests__/coverage.test.ts runs under `npx tsx --test` with node:test + node:assert/strict and a fake LLMProvider (no live model)
- tests cover ac1-ac4 plus exactly-one-call, retry-exhaustion propagation (assert.rejects), the two empty-result edge cases, a null-buildRecord tolerance (judgeCoverage runs with buildRecord===null), and the prompt-trailing placement
- the full `npx tsx --test 'src/workflow/code-review/**/*.test.ts'` sweep passes (S001-S004 green; any live test skips cleanly when INSRC_LIVE_TESTS unset)

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| judgeCoverage (mapping to DimensionResult{coverage}; expectationRef=uncovered symbol / missing promised test; confidence breach=missing vs observation=present-weak/unverified; out-of-scope drop; exactly-one-call; retry-exhaustion propagation) | `t1`, `t2` |
| COVERAGE_FINDINGS_SCHEMA (per-finding shape: severity/location/message required; expectationRef+confidence optional; additionalProperties:false) | `t1`, `t2` |
| buildCoveragePrompt (grounding.symbols+testsReaching, approvedPlan promised tests, output-shape reminder TRAILING; charge distinguishes present-failing from no-test and excludes pre-existing neighbour gaps) | `t1`, `t2` |
| judgeCoverage against a real buildShaperProvider-resolved provider | `t2` |

## Citations

- **[[c1]]** `code` `src/workflow/code-review/dimensions/conventions.ts + adherence.ts — the shipped dimension-judge template (schema/prompt/judge seams + fake-provider test harness) coverage.ts mirrors`
- **[[c2]]** `prior-artifact` `LLD s4 contractDetails — coverage's two inputs: sc2 grounding.symbols[].testsReaching (ac2) + sc1 approvedPlan.body.tasks[].tests (ac1) + buildRecord (ac3, nullable)`
- **[[c3]]** `code` `src/agent/providers/structured-output.ts — validateAgainstSchema + withStructuredRetry(call, validate, maxAttempts) positional signature the judge reuses`
- **[[c4]]** `prior-artifact` `LLD s4 contractDetails/api + errorPaths — judgeCoverage + buildCoveragePrompt + COVERAGE_FINDINGS_SCHEMA signatures + postconditions (one serial call, scope-drop, TRAILING two-input prompt, present-failing vs no-test, no unsupported pass-state)`
- **[[c5]]** `prior-artifact` `LLD s4 testStrategy — the unit + live test levels, subjects, and acceptance mapping (ac1-ac4) t2 implements`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — plan (plan)

**0 HIGH · 0 MED · 6 LOW** · model `client` · reviewed 2026-08-03T11:41:25.013Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| pv1 | citation | LOW | auto | The template conventions.ts (and adherence.ts) exist with the schema/prompt/judge seams t1 mirrors: CONVENTIONS_FINDINGS_SCHEMA, buildConventionsPrompt, judgeConventions. | conventions.ts:53 CONVENTIONS_FINDINGS_SCHEMA, :105 buildConventionsPrompt, :148 judgeConventions all exist — the template t1 mirrors is real. | none — verified sound |
| pv2 | semantic | LOW | auto | coverage's two inputs exist on the consumed contracts: sc2 ChangedSymbolSummary.testsReaching (types.ts) and sc1 approvedPlan whose PlanTask carries tests (plan.ts); sc1 buildRecord is nullable (StandaloneBuildRecord\|null). | types.ts has testsReaching: readonly string[] and buildRecord on CodeReviewSubject; plan.ts declares `readonly tests: readonly TaskTestRef[]` on PlanTask. coverage's two inputs (testsReaching + approvedPlan.body.tasks[].tests) plus the nullable buildRecord exist on the consumed contracts. | none — verified sound |
| pv3 | external-contract | LOW | auto | src/agent/providers/structured-output.ts exports validateAgainstSchema and withStructuredRetry(call, validate, maxAttempts) which throws after the cap — the helpers t1 reuses with the positional maxAttempts. | structured-output.ts:80 validateAgainstSchema and :182 withStructuredRetry (throws after the cap) — the helpers t1 reuses with positional maxAttempts. | none — verified sound |
| pv4 | inventory | LOW | auto | No src/workflow/code-review/dimensions/coverage.ts exists yet — t1 creates it (purely additive; no judgeCoverage in src/). | judgeCoverage / COVERAGE_FINDINGS_SCHEMA appear only in the design docs, not in any src/ file — coverage.ts does not exist yet, so t1 is purely additive. | none — verified sound |
| pv5 | citation | LOW | auto | The fake-provider test harness t2 mirrors exists in conventions.test.ts (`as unknown as LLMProvider`, node:test + node:assert/strict). | conventions.test.ts (src/) uses `as unknown as LLMProvider` and node:test is the repo-wide convention — the fake-provider harness t2 mirrors exists. | none — verified sound |
| pv6 | ordering | LOW | auto | Task ordering is acyclic and topological (t1 order 1 no deps → t2 order 2 dependsOn t1); storyDependsOn s1 is satisfied on disk (ReviewDimension incl. 'coverage' + PlanTask.tests shipped). | types.ts:33 ReviewDimension includes 'coverage' and PlanTask exists (plan.ts) — storyDependsOn s1 is satisfied; t1 (order 1, no deps) → t2 (order 2, dependsOn t1) is acyclic and topological. | none — verified sound |
