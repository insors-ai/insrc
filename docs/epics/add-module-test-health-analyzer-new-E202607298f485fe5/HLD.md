<!-- insrc:artifact HLD-8f485fe5c614fefc -->

# HLD: A new `test` analyze target/runtime family that mirrors the shipped infra family: a small set of per-DIMENSION TemplateRuntimes — test tracing, coverage, and quality — plus a terminal aggregator, registered in runtimes/bootstrap

## Framework summary

A new `test` analyze target/runtime family that mirrors the shipped infra family: a small set of per-DIMENSION TemplateRuntimes — test tracing, coverage, and quality — plus a terminal aggregator, registered in runtimes/bootstrap.ts with matching AnalyzeTaskTemplate rows in planner/templates/test/ and a new `test` value on the AnalyzeTarget enum + per-target validation. The three dimension runtimes are written ONCE against a shared LanguageTestAdapter registry that quarantines every per-language variation (test detection, coverage-report location + format parsing, quality idioms) behind one interface, so cross-language uniformity is structural rather than five-fold-duplicated, and an unrecognized language degrades through a null adapter. The module boundary resolves via a layered rule (per-repo override → language-native package/build unit → directory fallback) into a graph entity set; every dimension operates on that entity set. Coverage is hybrid and strictly read-only: a graph-reachability baseline always, enriched by ingesting already-present coverage reports when found, with the two sources never conflated. The aggregator composes a per-module TestHealthModuleBundle that the existing context synthesizer renders as the 7-layer AnalyzeContextBundle.

## Architecture shape

Layering: (1) the planner gains a `test` AnalyzeTarget enum value + validation and a TEST_TEMPLATES catalog whose produces-keys match the runtime output-Map keys (k2/k6); (2) runtimes/test/ holds testTraceRuntime, testCoverageRuntime, testQualityRuntime + testAggregateRuntime (TemplateRuntime idiom), registered in bootstrap.ts alongside the code/data/docs/infra families; (3) a shared runtimes/test/_shared layer provides ModuleScope resolution + the LanguageTestAdapter registry, reusing the infra read-only walkFiles/resolveRepoPath seam. Data flow per request: resolve target→ModuleScope (entity set); testTraceRuntime walks the CALLS/IMPORTS graph (k4) to find test entities reaching the module → TestTraceResult; testCoverageRuntime computes the reachability baseline over that trace and, if the language adapter locates a report, ingests it via strict innermost-containment with commit/index-pinned provenance (tri-state covered/uncovered/unknown, generated-code quarantined) → CoverageResult tagged source=reachability|report; testQualityRuntime scores each traced test into a per-heuristic vector + declared composite; testAggregateRuntime assembles the TestHealthModuleBundle. All work is read-only (k1); nothing is executed or written.

## Shared contracts

### sc1: TestHealthModuleBundle

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`, `s5`, `s6`

**Purpose:** The umbrella per-module output schema every dimension fills a slot of and the aggregator emits for the synthesizer (k5). Owned at the foundational Story so all dimension Stories are trivially downstream; the quality slot's shape (vector + declared composite + published weights/bands) lives here too since s5 fills it but s1 owns the bundle.

**Interface sketch (type-level):**

```
interface TestHealthModuleBundle {
  module: ModuleScope;            // sc2
  trace: TestTraceResult;         // sc3
  coverage: CoverageResult;       // sc4
  quality: TestQualityResult;     // filled by s5
  diagnostics: readonly string[]; // honest-degradation notes
}
interface TestQualityResult {
  perTest: readonly { testEntityId: string; heuristics: QualityVector; composite: number }[];
  weights: Readonly<Record<keyof QualityVector, number>>;
  bands: readonly { label: string; min: number }[];
}
interface QualityVector { assertionDensity: number; edgeErrorPath: number; mockingVsReal: number; skipFlaky: number; }
```

**Assumptions cited:** [[c1]]

### sc2: ModuleScope (boundary resolution)

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`, `s6`

**Purpose:** Resolve a caller-supplied target (file / directory / package / symbol) into the concrete graph entity set that constitutes 'the module', recording which layered rule fired so scoping is auditable. One rule serves all five languages (k4). Consumed by the dimensions that operate directly on the module entity set (trace, reachability coverage, report attribution); quality operates on the traced set, not the entity set.

**Interface sketch (type-level):**

```
type ScopeResolutionRule = 'config-override' | 'language-package' | 'directory-fallback';
interface ModuleScope {
  target: string;
  language: string | null;
  resolvedBy: ScopeResolutionRule;
  entityIds: readonly string[];
}
interface ModuleScopeResolver { resolve(target: string, repoPath: string): Promise<ModuleScope>; }
```

**Assumptions cited:** [[c4]]

### sc3: TestTraceResult

**Owner Story:** `s2`
**Consumed by:** `s3`, `s5`, `s6`

**Purpose:** The set of test entities that exercise the module and, per test, which module entities it reaches via the graph — the tracing output that coverage (reachability) and quality both build on. hasTests=false is the honest 'no tests found' signal (s2.ac2).

**Interface sketch (type-level):**

```
interface TestTraceResult {
  hasTests: boolean;
  tests: readonly {
    testEntityId: string; file: string; name: string;
    reaches: readonly string[];   // module entityIds reached via CALLS/IMPORTS closure (k4)
  }[];
}
```

**Assumptions cited:** [[c4]] [[c3]]

### sc4: CoverageResult (source-tagged, fidelity-labelled)

**Owner Story:** `s3`
**Consumed by:** `s4`, `s6`

**Purpose:** Per-entity coverage that NEVER conflates the reachability approximation with ingested ground truth (k3). s3 produces the reachability variant; s4 produces the report-enriched variant of the SAME shape, with strict innermost-containment, tri-state states, commit/index-pinned provenance, and generated-code quarantine.

**Interface sketch (type-level):**

```
type CoverageSource = 'reachability' | 'report';
type CoverageState  = 'covered' | 'uncovered' | 'unknown';
type FidelityLabel  = 'exact' | 'partial' | 'unknown' | 'generated';
interface CoverageResult {
  source: CoverageSource;
  provenance: { reportPath: string; format: string; pinnedIndexHash: string } | null;
  perEntity: readonly { entityId: string; state: CoverageState; fidelity: FidelityLabel; coveredLines?: number; totalLines?: number }[];
  quarantined: readonly { entityId: string; reason: 'generated' | 'vendored' }[];
  unattributed: { lines: number; reason: string } | null;
}
```

**Assumptions cited:** [[c4]] [[c1]]

### sc5: LanguageTestAdapter (+ registry)

**Owner Story:** `s1`
**Consumed by:** `s2`, `s4`, `s5`, `s6`

**Purpose:** The single seam that quarantines every per-language variation — test detection, coverage-report discovery + format parsing, quality idioms — behind one interface, so each dimension runtime is language-agnostic and s6's uniformity is structural. get() returns null for an unrecognized language, driving honest degradation (s6.ac2). Owned at s1 (nearest common ancestor of all consumers). Consumed by the dimensions with language-variant behaviour (trace detection, coverage format, quality idioms); reachability coverage is graph-only and does not consume it.

**Interface sketch (type-level):**

```
interface LanguageTestAdapter {
  readonly language: string;
  isTestEntity(entity: Readonly<{ file: string; kind: string; name: string }>): boolean;
  locateCoverageReports(scope: ModuleScope, repoPath: string): Promise<readonly { path: string; format: string }[]>;
  parseCoverageReport(path: string, contents: string): Promise<CoverageFileMap>;
  readonly qualityIdioms: Readonly<{ assertionMatchers: readonly string[]; mockMarkers: readonly string[]; skipMarkers: readonly string[] }>;
}
interface CoverageFileMap { file: string; lines: readonly { line: number; hits: number }[]; }
interface LanguageTestAdapterRegistry { get(language: string): LanguageTestAdapter | null; }
```

**Assumptions cited:** [[c3]] [[c7]]

## Story boundaries

### Story E202607298f485fe5:S001

**Owns:** `sc1`, `sc2`, `sc5`

The `test` AnalyzeTarget enum value, the planner per-target validation for `test`, the runtimes/test family registration in bootstrap.ts, the TEST_TEMPLATES catalog + aggregator template row, and the testAggregateRuntime that composes the bundle and its regression proof that the code/data/docs/infra/generic targets are unchanged (s1.ac2). The concrete built-in LanguageTestAdapter implementations are NOT owned here — s1 owns only the adapter INTERFACE + registry seam; the per-language bodies are s6's internal work.

### Story E202607298f485fe5:S002

**Owns:** `sc3`
**Depends on:** `sc1`, `sc2`, `sc5`

The testTraceRuntime implementation: how the CALLS/IMPORTS closure from candidate test entities into the module's entity set is computed and de-duplicated, and how 'is this a test' is asked through the adapter. Private to s2; only the TestTraceResult shape is shared.

### Story E202607298f485fe5:S003

**Owns:** `sc4`
**Depends on:** `sc1`, `sc2`, `sc3`

The testCoverageRuntime reachability baseline: how reachable-from-any-test vs unreachable is derived over the traced set via the graph, and how the result is labelled source='reachability'. The report-ingestion variant is s4's internal work but reuses this owned CoverageResult shape.

### Story E202607298f485fe5:S004

**Depends on:** `sc1`, `sc2`, `sc4`, `sc5`

Report ingestion internals: locating a report through the adapter (manifest-derived path + convention fallback + per-repo override), parsing each format into a line/branch map, and mapping it onto the module's entities by strict innermost-containment with commit/index-pinned provenance + generated-code quarantine — all producing a source='report' CoverageResult. No new shared contract; it fills the s3-owned sc4 shape.

### Story E202607298f485fe5:S005

**Depends on:** `sc1`, `sc3`, `sc5`

The testQualityRuntime heuristic computation: how assertion density, edge/error-path exercise, mocking-vs-real, and skip/flaky are measured from the traced tests' indexed source via the adapter's quality idioms, and how the declared composite is derived from the vector. Fills the TestQualityResult slot of the s1-owned bundle; no new shared contract.

### Story E202607298f485fe5:S006

**Depends on:** `sc1`, `sc2`, `sc3`, `sc4`, `sc5`

The five concrete built-in LanguageTestAdapter implementations (TypeScript/node:test, Python/pytest, Go/go test, Java/JUnit, Scala/ScalaTest) registered into the sc5 registry, plus the cross-language conformance proof that all three dimensions yield the same bundle shape per language and that an unrecognized language degrades honestly. Consumes every shared contract; owns none — it populates the adapter seam s1 defined.

## Non-functional targets

- **Performance:** Deterministic and bounded: traversal stays within the active repo's dependency-closure via the typed graph API; report discovery/read is bounded by the same walkFiles cap (5000) the infra family uses. No test execution, so latency is graph + file-read only.
- **Security:** Strictly read-only (k1): no test execution, no writes, no network, no side effects. Coverage reports are read from files already present in the repo; nothing is generated.
- **Observability:** Each runtime emits a structured log.info summary (runId, taskId, module, counts, coverage source, adapter language / null-degradation) mirroring the infra runtimes, so a run is auditable end-to-end.
- **Durability:** Stateless: the analyzer persists nothing. Output is the in-memory TestHealthModuleBundle handed to the synthesizer; provenance pinning (index hash) makes a stale ingested report degrade to 'unknown' rather than silently misattribute.

## Rollout

### Phase A — Foundational target + shared contracts

**Stories:** `s1`

s1 stands up the `test` AnalyzeTarget enum value + validation, the runtimes/test family registration + aggregator, and the three cross-cutting contracts every dimension consumes (sc1 TestHealthModuleBundle, sc2 ModuleScope resolution, sc5 LanguageTestAdapter interface + registry). Nothing else can land until the bundle schema, module-scope resolver, and adapter seam exist. Ships a working (if empty-of-dimensions) test-health target end-to-end.

**Backward compat:** The code/data/docs/infra/generic targets must answer exactly as before — the new target enum value + template family are additive only (k2); regression-test the existing targets in this phase.

### Phase B — Test tracing

**Stories:** `s2`

s2 owns sc3 TestTraceResult and is the first dimension: it needs sc1/sc2/sc5 from Phase A, and both coverage (s3) and quality (s5) build on the traced test set, so it must land before them.

### Phase C — Coverage (reachability baseline + report enrichment)

**Stories:** `s3`, `s4`

s3 owns sc4 CoverageResult and provides the always-available reachability baseline over s2's trace; s4 enriches the SAME sc4 shape with ingested reports and depends on s3. They ship together as the coverage dimension, baseline first then enrichment.

### Phase D — Test-case quality

**Stories:** `s5`

s5 (quality heuristics) depends only on s2's trace + the sc5 adapter idioms, so it is independent of the coverage phase and could run in parallel with Phase C; sequenced here to keep each dimension a distinct, separately-reviewable slice.

### Phase E — Cross-language adapters + conformance

**Stories:** `s6`

s6 provides the five concrete LanguageTestAdapter implementations + the cross-language conformance proof; it depends on all three dimensions (s2/s3/s5) being defined against the adapter interface, so it lands last and generalizes them from the Phase-A/B reference language to all five.

**Backward compat:** Honest degradation must hold for any language/format the adapters do not recognize (s6.ac2) — an unknown language returns a null adapter, never an error or fabricated data.

**Ordering rationale:** Phases follow the Epic dependency DAG and shared-contract ownership: A (s1) owns sc1/sc2/sc5 so it is first; B (s2) owns sc3 and is the trace both later dimensions need; C (s3→s4) owns sc4 and consumes the trace; D (s5) also consumes only the trace so it is independent of C but sequenced after B; E (s6) consumes every contract and generalizes all dimensions across languages, so it is last. No feature flag is needed: the whole target is additive and read-only, so each phase ships a strictly larger, non-breaking slice — the target is already useful after B and grows richer through C–E.

### Risky bits

| Area | Why | Mitigation |
| :--- | :--- | :--- |
| The LanguageTestAdapter interface (sc5) — a new seam with no exact precedent in the other families. | All three dimension runtimes are written against it; if the interface is wrong, every dimension and all five adapters churn. | Land sc5 in Phase A together with ONE concrete reference adapter (TypeScript/node:test) and drive s2's tracing through it, so the interface is validated against a real dimension + language before the other four adapters are built in Phase E. |
| Coverage→entity attribution fidelity across five report formats (k3 honesty). | Mis-mapping report lines onto entities, or presenting a stale/partial mapping as measured, would violate the accuracy-first invariant that ground truth is never faked. | Strict innermost-containment + commit/index-pinned provenance that degrades to 'unknown' on drift, generated-code quarantine excluded from denominators, and per-format golden-fixture tests asserting exact/partial/unknown labelling — all owned in Phase C before per-language breadth in Phase E. |
| Cross-language drift (s6) — five adapters silently diverging in what they report. | The Epic's whole-language uniformity goal fails if, say, Go quality and Scala quality measure subtly different things or shapes. | A single shared conformance test suite that runs all three dimensions across a fixture module per language and asserts identical bundle shape + identical honest-degradation behaviour, so any divergence is caught structurally rather than by inspection. |

## Alternatives considered

### a1: Per-dimension runtimes over a shared language-adapter layer — **CHOSEN**

Three dimension runtimes (test.trace, test.coverage, test.quality) + an aggregator under one `test` target, each dispatching the language-specific bits to a shared per-language adapter registry.

The `test` target mirrors the infra family's shape (discovery + per-family inventory + aggregate): one TemplateRuntime per analysis DIMENSION (tracing, coverage, quality) plus a terminal aggregator, registered in bootstrap.ts with matching template rows in planner/templates/test/. The module boundary resolves to a graph entity set; each dimension runtime consumes it and produces its slice keyed by a stable produces-key; the aggregator composes the 7-layer bundle. The cross-language matrix is factored OUT into a shared LanguageTestAdapter registry keyed by the entity's language, so each dimension is written once and works for all five languages, with an unrecognized language degrading via a null adapter.

**Pros:**
- One implementation per dimension — tracing/coverage/quality written and tested once, not five times.
- Per-language surface quarantined to small adapters, so cross-language uniformity falls out by construction and unknown languages degrade honestly.
- Mirrors the shipped infra family (discovery+inventory+aggregate), satisfying k6 against a known-good precedent.
- Stories map ~1:1 onto dimension runtimes for clean incremental rollout.

**Cons:**
- Introduces a new internal seam (the LanguageTestAdapter registry) with no exact precedent, so its interface must be designed carefully up front.
- A language-specific escape hatch must extend the shared interface rather than special-casing.

**Cost estimate:** L

### a2: Per-language runtimes, each covering all three dimensions

One runtime per language (test.ts, test.python, test.go, test.java, test.scala) that does tracing+coverage+quality for its language, plus an aggregator that merges them.

The `test` target is decomposed by LANGUAGE: each language gets its own TemplateRuntime that performs all three analyses end-to-end for modules in that language and emits that language's slice; an aggregator merges the slices. Cross-language uniformity becomes a shared-output-TYPE discipline rather than a shared code path — every runtime must emit the same bundle shape but implements the three dimensions independently.

**Pros:**
- Each language's full behaviour lives in one file, so fixing one language touches exactly one runtime.
- No new cross-cutting adapter seam — the only shared contract is the output bundle type.
- A broken/unrecognized language is naturally isolated: its runtime simply isn't registered.

**Cons:**
- The three dimension algorithms are re-implemented five times, multiplying build effort and the surface for silent per-language divergence — at odds with the uniformity goal.
- Each per-dimension story smears across five files, so no single story is a self-contained slice.
- k3's approximation-vs-ground-truth labelling must be re-asserted in five places.

**Cost estimate:** L

**Rejected because:** Constraint-clean except k3, which drops to partial because the coverage honesty labelling + fidelity states are re-implemented in all five language runtimes and one can silently mislabel. Also fights the cross-language uniformity goal and smears each per-dimension story across five files, hurting incremental review.

### a3: Dimension exploration-recipes + a thin planner target

Implement tracing/coverage/quality as new deterministic explore recipes (beside test-locate) and give the `test` target a thin template set that just sequences those recipes.

The analysis lives in the exploration layer: new recipes under src/analyze/explore/ (test.trace, test.coverage, test.quality) built like the reused test-locate.ts, each emitting a typed output. The `test` target is a thin planner construct — a target enum value + template rows composing those recipes + synthesizer wiring. Language variance is an in-recipe switch. The runtime family is minimal/absent.

**Pros:**
- Maximizes reuse of the exploration/executor + synthesizer pipeline.
- test-locate.ts is the exact precedent for a new recipe, so tracing is a low-risk extension.
- Keeps the planner target genuinely thin, minimizing the additive surface.

**Cons:**
- Under-delivers the registered runtime FAMILY the DEF/k2 frame, diverging from the k6 convention.
- In-recipe language switch re-creates the five-way duplication without a1's shared-adapter factoring.
- Coverage's multi-format file parsing strains the exploration-recipe abstraction, built for graph/doc probes.

**Cost estimate:** L

**Rejected because:** Partial on k2 and k6 — it under-delivers the registered runtime family the DEF/contract name, replacing it with recipes — and partial on k3 because an in-recipe language switch duplicates the labelling logic. Coverage's multi-format file parsing also strains the exploration-recipe abstraction.

## Citations

- **[[c1]]** `analyze-bundle` `s1 structural-map — analyze extension surface (runtimes/bootstrap.ts, planner/templates/registry.ts, planner/validate.ts, planner/schema.ts, explore/test-locate.ts)` — "A new `test` target adds a runtimes/test family, planner template rows + a target enum value + validation, and explore recipes beside the reused test-locate."
- **[[c2]]** `analyze-bundle` `s1 how-does-it-work — TemplateRuntime contract + family registration idiom (executor/types.ts, runtimes/infra/index.ts, runtimes/infra/_shared.ts, planner/templates/infra/index.ts)` — "A runtime is a TemplateRuntime with templateId + async execute(): Promise<{ outputs: Map }>; each family exports a readonly runtime array registered in bootstrap.ts, mirrored by a template catalog who"
- **[[c3]]** `analyze-bundle` `s1 how-does-it-work — 7-layer AnalyzeContextBundle + Entity fields (analyze/context, shared/types.ts)` — "The synthesizer emits a 7-layer bundle of structured entity summaries + relations — no raw file dumps; entities carry file, startLine/endLine, language."
- **[[c4]]** `analyze-bundle` `s1 how-does-it-work — graph traversal API + read-only walk seam (db/graph/traversal.ts, db/graph/edges.ts, runtimes/infra/_shared.ts)` — "Traversal goes through the typed JS graph API (transitiveClosure/unreachable/findCallers/findCallees); coverage-report ingestion is a read-only file read via the walkFiles seam."
- **[[c5]]** `analyze-bundle` `s1 capability-discovery — no existing test-health analyzer (daemon/tools/builtins/test/index.ts, analyze/context/tool-surface.ts)` — "Only `test_coverage` as a built-in tool name; no assembled per-module test-health analyzer — the capability is net-new."
- **[[c7]]** `convention` `CLAUDE.md — tree-sitter parses TypeScript, Python, Go, Java, Scala` — "Parsing: tree-sitter (TypeScript, Python, Go, Java, Scala)."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.epic (design.epic)

**0 HIGH · 0 MED · 9 LOW** · model `client` · reviewed 2026-07-30T07:39:45.065Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| architectureShape | citation | LOW | auto | The infra runtime family is the precedent being mirrored: src/analyze/runtimes/infra/ exports an INFRA_RUNTIMES array and src/analyze/planner/templates/infra/ exports INFRA_TEMPLATES, with a _shared.ts read-only walk seam. | CONFIRMED: INFRA_RUNTIMES (bootstrap.ts:29,54) + INFRA_TEMPLATES (planner/templates/infra/index.ts:195) with the parity test asserting both length 8. The infra family is a real precedent to mirror. (The path-glob probe 'runtimes/infra/_shared' matched only docs — grep artifact; the file exists per cl6.) | None — the infra family precedent is accurate. |
| sc-idiom | citation | LOW | auto | The TemplateRuntime contract (TemplateExecuteArgs / TemplateExecuteResult / TemplateRuntime with templateId + async execute returning { outputs: Map }) is defined in src/analyze/executor/types.ts. | CONFIRMED: TemplateRuntime + TemplateExecuteResult defined in src/analyze/executor/types.ts:59/70 with templateId + async execute(args): Promise<TemplateExecuteResult>. The idiom the test family mirrors is real. | None. |
| architectureShape | citation | LOW | auto | Runtime families are registered in src/analyze/runtimes/bootstrap.ts via registerBuiltinRuntimes. | CONFIRMED: registerBuiltinRuntimes exported at src/analyze/runtimes/bootstrap.ts:44, re-exported analyze/index.ts:107. Family registration site is accurate. | None. |
| architectureShape | citation | LOW | assisted | The planner defines the AnalyzeTarget enum + per-target validation (validatePlan) and getTemplatesForTarget for the template catalog. | CONFIRMED with a location nuance: the AnalyzeTarget enum is in src/shared/analyze-types.ts:27 ('code'\|'data'\|'infra'\|'generic'\|'docs'), getTemplatesForTarget is used at orchestrator/driver.ts:298, and plan validation is validatePlanShape/validatePlannedTaskShape at planner/schema.ts:133/147 (not a literal 'validatePlan'). All exist; the exact symbol/paths differ slightly from the loose HLD references. | LLD s1 must target the exact locations: add the 'test' value to AnalyzeTarget in src/shared/analyze-types.ts and extend validatePlanShape in planner/schema.ts (not a 'validatePlan' in planner/validate.ts). |
| k4 | citation | LOW | assisted | The typed graph traversal API used for tracing + reachability (transitiveClosure, unreachable, findCallers, findCallees) exists in src/db/graph. | CONFIRMED with a location nuance: transitiveClosure is in src/db/graph/traversal.ts:134, but findCallers/findCallees/unreachableEntities live in src/db/search.ts:186/193/281 (the HLD citation c4 said db/graph/edges.ts). The typed traversal API exists; the callers/callees helpers are in db/search.ts. | LLD s2/s3 should import findCallers/findCallees from src/db/search.ts and transitiveClosure/unreachable from src/db/graph/traversal.ts — still satisfies k4 (typed JS API, no SQL). |
| nonFunctional | citation | LOW | assisted | The infra read-only walk seam _shared.ts exposes walkFiles (cap 5000) + resolveRepoPath + readScopeRef, reused by the new test family. | CONFIRMED with a location nuance: walkFiles + DEFAULT_FILE_CAP=5000 are in src/analyze/runtimes/infra/_shared.ts:106/90, but resolveRepoPath lives in code/_shared.ts:58 + context/driver.ts:954, not infra/_shared.ts. The read-only walk seam is real; resolveRepoPath is a sibling helper. | LLD s1's runtimes/test/_shared should reuse walkFiles from infra/_shared.ts and import/relocate resolveRepoPath from its actual home rather than assuming it sits in infra/_shared.ts. |
| s6 | external-contract | LOW | auto | The indexer parses all five target languages (TypeScript, Python, Go, Java, Scala) via tree-sitter, so entities + a language field exist per language. | CONFIRMED: src/indexer/parser/{typescript,python,go,java,scala}.ts each require the matching tree-sitter grammar. All five languages parse, so per-language entities + language field exist (s6). | None. |
| sc4 | semantic | LOW | auto | Indexed entities carry startLine/endLine (declared span) and a language field — the fields coverage attribution + per-language dispatch rely on. | CONFIRMED: startLine/endLine fields exercised throughout context/analyze tests; the language field is declared (explore/types.ts:160 et al). Coverage attribution's span+language dependency is grounded. | None — LLD s4 can attribute report lines to entity startLine/endLine spans as designed. |
| k5 | closed-union | LOW | assisted | The synthesizer output is the 7-layer AnalyzeContextBundle (system, focus, summary, structure, surface, artefacts, upstream) the new bundle must fit. | CONFIRMED with a naming nuance: the literal identifier 'AnalyzeContextBundle' appears only in docs, but the 7 layers (system/focus/summary/structure/surface/artefacts/upstream) are real in src/analyze/context/{bundle.ts:42,schema.ts:48,types.ts:88} and asserted in driver.live.test.ts:325. The output contract the new bundle must fit is accurate; the code type may carry a different name. | LLD s1 should confirm the actual bundle type name in src/analyze/context/ (bundle.ts/schema.ts/types.ts) and fit TestHealthModuleBundle into that 7-layer shape. |
