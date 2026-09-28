<!-- insrc:artifact PLAN-c5824e17eccf0c14-s1 -->

# Plan: E20260927c5824e17:S001

**Epic:** `make-workflow-framework-s-generated-artifact`
**LLD run:** `wf-1790521391567-sqdzvt`
**LLD effective hash:** `a28e2f107661...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** sc1 types + FR-id minter/parser in id.ts | M | — | unit: mintFrId emits doc-level and per-item canonical forms, is byte-stable, handles ordinal>=1000, and throws on bad hash/date; unit: parseFrId round-trips every mintFrId output and returns null on non-FR strings | [[c1]] [[c2]] |
| 2 | **`t2`** Optional functionalDefinition field on each <Stage>Body + assembly validation | M | `t1` | unit: FunctionalDefinition/FunctionalRequirement on every <Stage>Body type-check under exactOptionalPropertyTypes (with and without the field); unit: assembly validation rejects duplicate FR ids and dangling per-item itemRefs, and accepts an empty requirements[] as absent | [[c2]] [[c5]] |
| 3 | **`t3`** Enrich the per-type renderers to emit the additive Functional Requirements section | M | `t2` | unit: renderDefineMarkdown (and hld/lld/plan peers) emit a Functional Requirements section from functionalDefinition, and produce byte-identical output to the golden snapshot when it is absent/empty | [[c1]] [[c2]] |
| 4 | **`t4`** Widen ReviewDimension + add the functional-coverage dimension file | M | `t1` | unit: judgeFunctionalCoverage returns a functional-coverage DimensionResult with expectationRef set to real FR ids and rejects an unknown expectationRef; unit: a DimensionFinding.expectationRef FR id folds into the existing DimensionResult/CodeReviewBody verdict counts unchanged (reducer untouched) | [[c3]] |
| 5 | **`t5`** Make the dimension set conditional on functionalDefinition presence | M | `t2`, `t4` | unit: expectedDims derivation includes 'functional-coverage' only when the subject carries a non-empty functionalDefinition (else exactly the base four), and validateArtifact passes/fails against it; integration: the code-review-step handler runs functional-coverage when FR records exist and a HIGH folds to a block verdict; a no-FR subject drives exactly the four existing dimensions and completes byte-identically | [[c3]] [[c4]] |

### E20260927c5824e17:S001:T001 — sc1 types + FR-id minter/parser in id.ts

Declare FrId/FunctionalRequirement/FunctionalDefinition in a new functional-definition types module, and add pure mintFrId(epicHash, createdAtISO, ordinal, storyId?) + parseFrId to id.ts that compose the existing padOrdinal/hash8Of/utcDate and the canonical prefix (doc-level E<date><hash8>:FR<nnn>, per-item E<date><hash8>:S<nnn>:FR<nnn>). No WorkflowId union change.

**Acceptance checks:**
- mintFrId produces the doc-level and per-item canonical forms and is byte-stable for identical inputs
- parseFrId round-trips every mintFrId output and returns null on non-FR strings
- mintFrId throws via the id.ts hash8Of/utcDate guards on a non-hex epicHash or invalid ISO date
- an ordinal >= 1000 keeps full width (padOrdinal not truncated)

### E20260927c5824e17:S001:T002 — Optional functionalDefinition field on each <Stage>Body + assembly validation

Add `functionalDefinition?: FunctionalDefinition | undefined` to DefineBody and the peer HldBody/LldBody/PlanBody. Add the record-assembly validation: unique FR ids (Set-size check), scope==='item' itemRef resolves to a real story/task id, and fail-loud when an id cannot be minted.

**Acceptance checks:**
- each <Stage>Body type-checks with and without functionalDefinition under exactOptionalPropertyTypes
- duplicate FR ids are rejected with a 'duplicate FR id' error before persistence
- a scope==='item' FR with a dangling itemRef is rejected
- an empty requirements [] is accepted and treated as absent

### E20260927c5824e17:S001:T003 — Enrich the per-type renderers to emit the additive Functional Requirements section

Enrich renderDefineMarkdown and the peer renderers (hld/lld/plan) to emit a Functional Requirements section from body.functionalDefinition (each FR id + statement, per-item FRs grouped under their item), guarded so an absent/empty record produces byte-identical output to today. Prove byte-identity against a golden pre-change snapshot for EACH of define/hld/lld/plan before enriching.

**Acceptance checks:**
- a body with functionalDefinition renders a Functional Requirements section listing each FR id + statement
- a body with no/empty functionalDefinition renders byte-identically to the pre-change golden snapshot, for EACH of define/hld/lld/plan
- per-item FRs render under their referenced story/task

### E20260927c5824e17:S001:T004 — Widen ReviewDimension + add the functional-coverage dimension file

Add 'functional-coverage' to the ReviewDimension union and create dimensions/functional-coverage.ts exporting buildFunctionalCoveragePrompt + judgeFunctionalCoverage mirroring coverage.ts; findings bind to FR ids via the existing DimensionFinding.expectationRef and carry the review Severity verbatim. Not yet wired into the loop.

**Acceptance checks:**
- ReviewDimension includes 'functional-coverage' and the union still type-checks across existing consumers
- judgeFunctionalCoverage returns a DimensionResult(dimension:'functional-coverage') with expectationRef set to supplied FR ids
- a finding whose expectationRef is not a supplied FR id is rejected
- the verdict reducer computeReviewVerdict/effectiveReviewVerdict is left untouched

### E20260927c5824e17:S001:T005 — Make the dimension set conditional on functionalDefinition presence

Add the { dimension:'functional-coverage', judge: judgeFunctionalCoverage } row to runner.ts DIMENSION_JUDGES and derive handler.ts DIMENSIONS + validateArtifact's expectedDims from whether the review subject carries a non-empty functionalDefinition, so functional-coverage is expected/judged only then and non-FR reviews keep exactly the four existing dimensions.

**Acceptance checks:**
- a subject WITH a non-empty functionalDefinition drives five dimensions and a functional-coverage HIGH folds to a block verdict through the existing gate
- a subject with NO functionalDefinition drives exactly the four existing dimensions and completes byte-identically
- validateArtifact passes/fails against the conditionally-derived expected set
- the emit-judgements schema enum reflects the conditional dimension set

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| mintFrId: doc-level (E<date><hash8>:FR<nnn>) and per-item (E<date><hash8>:S<nnn>:FR<nnn>) forms; padOrdinal >=3 and >=1000 width; hash8/utcDate guards throw on bad input | `t1` |
| parseFrId round-trips every mintFrId output and returns null on non-FR strings | `t1` |
| renderDefineMarkdown (and peer renderers) emit a Functional Requirements section from a body with functionalDefinition, and byte-identical output when it is absent/empty | `t3` |
| judgeFunctionalCoverage returns a DimensionResult with dimension 'functional-coverage' and expectationRef set to real FR ids; rejects an unknown expectationRef | `t4` |
| the expectedDims derivation includes 'functional-coverage' only when the subject carries a non-empty functionalDefinition, and is exactly the base four otherwise | `t5` |
| validateArtifact passes/fails against the conditionally-derived expected set | `t5` |
| The code-review-step handler runs functional-coverage when FR records exist and a functional-coverage HIGH folds to a block verdict via computeReviewVerdict | `t5` |
| A subject with no functionalDefinition drives exactly the four existing dimensions and completes byte-identically (absent-safe) | `t5` |
| FunctionalDefinition/FunctionalRequirement on every <Stage>Body type-check under exactOptionalPropertyTypes | `t2` |
| DimensionFinding.expectationRef carries an FR id and folds into the existing DimensionResult/CodeReviewBody verdict counts unchanged | `t4` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s1 contractDetails — mintFrId/parseFrId + renderDefineMarkdown API signatures` — "mintFrId(epicHash, createdAtISO, ordinal, storyId?) + parseFrId reuse id.ts padOrdinal; renderDefineMarkdown emits the additive Functional Requirements section."
- **[[c2]]** `prior-artifact` `LLD s1 dataModelChanges — FunctionalRequirement/FunctionalDefinition + DefineBody field-add` — "New FunctionalRequirement{id,statement,rationale?,scope,itemRef?}/FunctionalDefinition; optional functionalDefinition field additive on every <Stage>Body."
- **[[c3]]** `prior-artifact` `LLD s1 sc2 / dataModelChanges — ReviewDimension widening + functional-coverage dimension + orchestration` — "Add 'functional-coverage' to ReviewDimension; new dimension file mirroring coverage.ts; conditional row in runner.ts DIMENSION_JUDGES; reducer un-forked."
- **[[c4]]** `prior-artifact` `LLD s1 contractDetails — validateArtifact conditional expectedDims + handler DIMENSIONS` — "validateArtifact's expectedDims derived conditionally; handler.ts:56 DIMENSIONS becomes a function of subject.functionalDefinition presence."
- **[[c5]]** `prior-artifact` `LLD s1 errorPaths — FR-record assembly validation (duplicate id, dangling itemRef, mint-fail)` — "Set-size collision check for duplicate FR ids; itemRef membership check; fail-loud when an id cannot be minted."
