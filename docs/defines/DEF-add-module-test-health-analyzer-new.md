<!-- insrc:artifact DEF-8f485fe5c614fefc -->

# Epic: insrc's analyze framework can already produce grounded, evidence-backed views of a codebase's structure, its data sources, its infrastructure manifests, and its documentation — but it has no equivalent view of a module's TEST HEALTH.

**Flavor:** enhancement

## Problem

insrc's analyze framework can already produce grounded, evidence-backed views of a codebase's structure, its data sources, its infrastructure manifests, and its documentation — but it has no equivalent view of a module's TEST HEALTH. For any given module there is currently no assembled answer to three questions a reviewer, author, or planner routinely needs: which tests actually exercise this module, how much of the module's behaviour those tests reach versus leave untouched, and whether the tests themselves are meaningful rather than shallow. The raw primitives to answer these questions exist only in isolation, so the questions get answered — when they are answered at all — by manual inspection or gut feel, inconsistently and without citation. The consequence is that decisions about where testing is weak, which code is effectively unverified, and whether existing tests would actually catch a regression are made blind: the same ungrounded, un-auditable decision-making the analyze framework exists to eliminate everywhere else, still fully present for testing. The gap is widest exactly where it is most costly — a module can look 'tested' because test files mention it, while its critical paths are unreached and its tests assert almost nothing, and today the system cannot tell the difference. It also spans every language insrc indexes, yet nothing surfaces test health uniformly across them.

## Non-goals

- **Running, executing, or re-running tests — including generating fresh coverage by invoking a test runner.** — The analyzer must stay read-only and local-first; executing tests introduces side effects, environment/dependency assumptions, and non-determinism that break the analyze framework's read-only discovery contract. [[c5]]
- **Generating, scaffolding, or auto-suggesting the missing tests it identifies.** — This Epic measures and reports test health; authoring tests is a distinct capability. Conflating measurement with generation would balloon scope and mix a read-only analyzer with a code-writing one.
- **Acting as a CI quality gate that passes/fails a build on a coverage or quality threshold.** — The output is an evidence bundle for a human/agent to reason over, not a policy verdict. Thresholds and gating are downstream decisions that belong to whoever consumes the bundle.
- **Aggregating test health across the whole dependency closure or multiple repos in v1.** — v1 is scoped to a module within the active repo to stay tractable; the framework's existing dependency-closure scoping can extend it later without rework.
- **Presenting graph-reachability coverage as if it were measured line/branch coverage when no coverage report exists.** — Accuracy is primary: claiming measured precision the underlying data cannot support would be worse than an honestly-labelled approximation. [[c5]]

## Assumptions

- `high` The entity graph already links test entities to the code they exercise (imports + CALLS edges) and exposes reachability traversal, so tracing and reachability-based coverage can be derived without executing anything. [[c4]]
- `high` Per-language test-layout conventions (test-file naming, canonical test directories) are already detectable from the indexed graph, so the analyzer can identify what is a test across languages. [[c3]]
- `med` When coverage reports exist, they are present in the repo as readable files the framework's file walker can see — no execution or network needed to ingest them. [[c1]]
- `high` The indexer already parses all five target languages (TypeScript, Python, Go, Java, Scala), so entities exist for each language's modules and tests. [[c7]]
- `high` The analyze framework's per-target extension pattern (a runtime family + template rows + exploration recipes + a synthesized bundle) is stable and additive, so a new target can be added without disturbing existing targets. [[c1]]

## Constraints

| ID | Type | Text | Source |
| :--- | :--- | :--- | :--- |
| `k1` | invariant | The analyzer MUST be strictly read-only: no test execution, no writes, no side effects — consistent with the analyze framework's read-only discovery contract. | [[c5]] |
| `k2` | contract | The new `test` target MUST register through the existing extension surfaces (runtime family, template rows + aggregator, target enum + per-target validation, synthesized bundle) WITHOUT breaking the existing code/data/docs/infra/generic targets — additive only. | [[c6]] |
| `k3` | invariant | Coverage output MUST distinguish the always-available graph-reachability APPROXIMATION from ingested-report GROUND TRUTH, and never present the former as measured line/branch coverage. | [[c5]] |
| `k4` | convention | All structural/coverage traversal MUST go through the graph layer's typed JS API (findCallers / findCallees / outNeighbors / transitiveClosure / unreachable) — no SQL/Cypher/GQL for graph queries. | [[c5]] |
| `k5` | contract | The per-module test-health output MUST be a structured bundle of entity summaries + relations consumed by the context builder/synthesizer — no raw file dumps. | [[c5]] |
| `k6` | convention | The new runtime family MUST mirror the established runtime-family conventions (camelCase functions, PascalCase classes, kebab-case files, the TemplateRuntime idiom, produces-key === emitted output-Map key). | [[c6]] |

## Stories

### E202607298f485fe5:S001 — Ask for any module's test health through the same analyzer interface as every other target

**User value:** `size: M`

A reviewer, author, or planner can request a module's test health the same way they already ask for its structure, data, or infra — and get back a single structured per-module test-health bundle — so test health becomes a first-class, grounded analyzer surface rather than something assembled by hand.

**Extends:** [[c1]]

**Acceptance criteria:**

- **ac1:** Given a module in the active, indexed repo, when a user requests that module's test health through the analyze interface, then the system returns a structured per-module test-health bundle (entity summaries + relations, same discipline as other targets), not an error and not a raw file dump. _(operationalizes `k2`, `k5`, `k6`)_
- **ac2:** Given the existing code, data, docs, infra, and generic analyzer targets, when the new test-health target is available, then every existing target continues to answer exactly as before, with no regression to their behaviour. _(operationalizes `k2`)_

### E202607298f485fe5:S002 — See which tests exercise a given module

**User value:** `size: M`

For any module, the user sees exactly which test files and cases actually exercise it — established through the code graph, not filename coincidence — so 'is this tested, and by what?' has a grounded, cited answer.

**Depends on:** `s1`

**Extends:** [[c2]] [[c1]]

**Acceptance criteria:**

- **ac1:** Given a module that has tests exercising it, when test health is requested, then the bundle lists the test files/cases that exercise the module, linked through the graph (imports + call relations), each traceable to a real entity. _(operationalizes `k4`, `k5`)_
- **ac2:** Given a module with no tests exercising it, when test health is requested, then the bundle honestly reports that no tests were found rather than inventing coverage or returning nothing. _(operationalizes `k5`)_

### E202607298f485fe5:S003 — See which of a module's behaviour tests reach and which they leave unverified

**User value:** `size: L`

Even with no coverage report anywhere, the user sees which of a module's entities are reachable from some test versus effectively unverified — an always-available baseline — so under-tested code is visible on every repo, honestly labelled as an approximation.

**Depends on:** `s2`

**Extends:** [[c1]]

**Acceptance criteria:**

- **ac1:** Given a module whose tests have been traced and no coverage report is present, when coverage is reported, then the bundle shows which module entities are reachable from a test and which are unreachable, explicitly labelled as a graph-reachability approximation. _(operationalizes `k3`, `k4`)_
- **ac2:** Given the reachability-based coverage result, when it is presented in the bundle, then it is never labelled or reported as measured line/branch coverage. _(operationalizes `k3`)_

### E202607298f485fe5:S004 — Get accurate coverage when the repo already has coverage reports

**User value:** `size: L`

When a repo already contains coverage output, the user gets real measured line/branch coverage mapped onto the module's entities — without anything being run — so the picture is as accurate as the data available, and clearly distinguished from the approximation.

**Depends on:** `s3`

**Extends:** [[c1]]

**Acceptance criteria:**

- **ac1:** Given a repo that already contains a coverage report for the module's language, when test health is requested, then the bundle enriches coverage with the report's measured data mapped onto the module's entities, labelled as ground truth distinct from the reachability approximation. _(operationalizes `k1`, `k3`)_
- **ac2:** Given no coverage report is present in the repo, when test health is requested, then coverage falls back to the reachability baseline with no error, and no test is executed and nothing is written. _(operationalizes `k1`, `k3`)_

### E202607298f485fe5:S005 — See how good a module's tests are, not just whether they exist

**User value:** `size: L`

The user sees a heuristic judgement of test quality — whether tests assert meaningfully, exercise edge/error paths, lean on mocks vs real behaviour, and whether any are skipped or flaky — so a module that merely 'has tests' can be distinguished from one that is genuinely well tested.

**Depends on:** `s2`

**Extends:** [[c1]]

**Acceptance criteria:**

- **ac1:** Given a module with tests, when test quality is assessed, then the bundle scores the tests on heuristics (assertion density, edge/error-path exercise, mocking-vs-real, skip/flaky markers) derived from the indexed source, without executing anything. _(operationalizes `k1`, `k5`)_
- **ac2:** Given a test that references the module but asserts little or nothing of substance, when quality is assessed, then the bundle flags it as low-quality rather than crediting it as meaningful verification. _(operationalizes `k5`)_

### E202607298f485fe5:S006 — Get consistent test-health reporting across every language insrc indexes

**User value:** `size: XL`

The user gets the same three-dimensional test-health picture whether the module is TypeScript, Python, Go, Java, or Scala — each read through its own test conventions and coverage format — so test health is uniform across a polyglot codebase rather than TypeScript-only.

**Depends on:** `s2`, `s3`, `s5`

**Extends:** [[c2]] [[c1]]

**Acceptance criteria:**

- **ac1:** Given modules in each indexed language (TypeScript, Python, Go, Java, Scala), when test health is requested for each, then tracing, coverage, and quality are all reported using that language's test conventions and coverage format, in the same bundle shape. _(operationalizes `k1`, `k5`)_
- **ac2:** Given a module whose test framework or coverage format is not recognized, when test health is requested, then the bundle degrades honestly — reporting what it can and noting what it could not — rather than failing or fabricating. _(operationalizes `k5`)_

## Open questions

- Coverage-report discovery (from the med-confidence assumption, checklist a2): where in the repo are coverage reports expected to live, and what is the recognized per-language format set (lcov, coverage.xml/coverage.py, istanbul/nyc json, jacoco XML, scoverage)? How does the analyzer locate them read-only without a configured path?
- Module delimitation: for test-health scoping, is 'a module' a single source file, a directory, or a language package — and how is that boundary chosen per language?
- Quality scoring shape: how are the per-test heuristics (assertion density, edge/error-path, mocking-vs-real, skip/flaky) combined — a single score, a per-heuristic vector, or both — and are any thresholds surfaced or left entirely to the reader?
- Coverage→entity mapping fidelity: when an ingested report gives line/branch data, how is it attributed to graph entities (by line range), and how are partial-overlap and generated-code cases represented honestly?

## Resolved questions

- `q91a9c51b` — Coverage-report discovery (from the med-confidence assumption, checklist a2): where in the repo are coverage reports expected to live, and what is the recognized per-language format set (lcov, coverage.xml/coverage.py, istanbul/nyc json, jacoco XML, scoverage)? How does the analyzer locate them read-only without a configured path?
  - **resolved**: Build-manifest-derived paths, convention fallback — Accuracy-first: ground report discovery in where the path is actually declared (jest/vitest/nyc, pyproject/setup.cfg, pom/gradle jacoco, build.sbt scoverage), fall back to the per-language convention glob for zero-config, let explicit per-repo config override both, and content-sniff only to confirm a located file's format. Stays strictly read-only (k1). _(2026-07-29T11:54:49.380Z)_
- `q22564658` — Module delimitation: for test-health scoping, is 'a module' a single source file, a directory, or a language package — and how is that boundary chosen per language?
  - **resolved**: Layered resolution: native unit → directory fallback → per-repo override — Mirrors the precedence model chosen for report-path discovery: explicit per-repo config first, then the language-native package/build unit when manifests/declarations determine it, then the containing directory as a universal fallback, recording which rule fired so scoping stays auditable and never fails on odd layouts. The module resolves to a graph entity set (satisfies k4/k5). _(2026-07-29T11:55:59.786Z)_
- `q796a7d7f` — Quality scoring shape: how are the per-test heuristics (assertion density, edge/error-path, mocking-vs-real, skip/flaky) combined — a single score, a per-heuristic vector, or both — and are any thresholds surfaced or left entirely to the reader?
  - **resolved**: Vector + derived composite, weights and bands published — Accuracy-first argues against collapsing four distinct signals into one opaque number: the per-heuristic vector is the authoritative, actionable output; the composite is a declared, reproducible function of it for ranking; publishing the weight table + threshold bands (per-repo overridable) keeps scoring auditable rather than a black-box verdict. _(2026-07-29T11:56:53.342Z)_
- `q8f4ff79b` — Coverage→entity mapping fidelity: when an ingested report gives line/branch data, how is it attributed to graph entities (by line range), and how are partial-overlap and generated-code cases represented honestly?
  - **resolved**: Containment + commit-pinned provenance + generated-code quarantine — Directly serves k3 + accuracy-first: strict innermost-containment reports only measured lines (no synthesized proportional smearing); a tri-state covered/uncovered/unknown makes stale or ambiguous line-maps legible (report pinned to the commit/index snapshot it was produced against, degrading to unknown on drift); generated/vendored spans are tagged, excluded from coverage denominators, but still listed so exclusion is visible, never silent. _(2026-07-29T11:57:31.158Z)_

## Citations

- **[[c1]]** `analyze-bundle` `s1 analyzeBundles[0] — structural-map of the analyze extension surface (runtimes/planner/explore)` — "The framework exposes three registries a new target must touch: runtime families under src/analyze/runtimes/, the AnalyzeTaskTemplate catalog under src/analyze/planner/, and exploration recipes under "
- **[[c2]]** `analyze-bundle` `s1 analyzeBundles[1] — capability-discovery: no existing test-health analyzer` — "The tracing + reachability primitives exist (test-locate.ts, the CALLS graph) but there is no assembled per-module test-health analyzer — the capability is net-new."
- **[[c3]]** `code` `src/analyze/explore/test-locate.ts` — "Deterministic test→subject exploration recipe, path-filtered by canonical test paths (tests/, __tests__/, test_*, *_test, *.spec, *.test)."
- **[[c4]]** `code` `src/db/graph (findCallers / findCallees / outNeighbors / transitiveClosure / unreachable)` — "Structural queries use the LMDB graph layer's typed JS API for callers/callees/closure/unreachable traversal."
- **[[c5]]** `convention` `CLAUDE.md — Project principles + Key architectural rules (accuracy-first; read-only analyze; graph-only traversal; no raw file dumps)` — "Accuracy is primary; cost is the least priority. Both analyze tools are read-only. No raw file dumps — context is structured entity summaries + relations. Graph traversal uses the typed JS API, no Cyp"
- **[[c6]]** `code` `src/analyze/runtimes/bootstrap.ts + src/analyze/planner/{schema.ts,validate.ts,templates}` — "Runtime families are registered in bootstrap.ts; per-target AnalyzeTaskTemplate rows + the target enum + per-target validation live in the planner; the infra family is the convention to mirror."
- **[[c7]]** `convention` `CLAUDE.md — Tech stack (tree-sitter parses TypeScript, Python, Go, Java, Scala)` — "Parsing: tree-sitter (TypeScript, Python, Go, Java, Scala)."
