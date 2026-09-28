<!-- insrc:artifact LLD-c5824e17eccf0c14-s1 -->

# LLD: E20260927c5824e17:S001

**Epic:** `make-workflow-framework-s-generated-artifact`
**HLD base run:** `wf-1790520092322-vpqvrh`
**HLD effective hash:** `a28e2f107661...`

## HLD context

**Framework:** Adopt a1: the artifact JSON body is the single source of truth for the new content, the existing per-type renderers are enriched to generate human-readable, audience-aware markdown from that structured body, and the three new adherence checks (functional-coverage, diagram, UX) are added as code-review dimensions that ride the existing computeReviewVerdict / codeReview.enforce completion gate without forking the verdict reducer. Diagrams and UX mocks are content-gated companion artifacts referenced from — never inlined into — the core markdown, produced through the existing docgen generateDocument seam. The four forward-only Stories layer cleanly: S001 introduces the functional-definition record + its coverage dimension; S002 makes every document navigable, audience-aware, and de-duplicated; S003 adds content-gated diagram companions; S004 unifies the selectable adherence dimensions and the UX-acceptance check.
**Rollout phase:** Phase A — functional-definition spine
**Owns:** `sc1` (FunctionalDefinition record (artifact body)), `sc2` (functional-coverage review dimension)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s2`: undefined — owns `sc3`
- `s3`: undefined — owns `sc4`
- `s4`: undefined

## Contract details

**Surface level:** internal-shared

### `mintFrId`

```typescript
mintFrId(epicHash: string, createdAtISO: string, ordinal: number, storyId?: string): string
```

**Parameters:**
- `epicHash: string` — The 16-hex epic hash; first 8 chars form the id prefix, exactly as storyWorkflowId consumes it.
- `createdAtISO: string` — The epic's createdAt ISO, giving the YYYYMMDD segment via the same utcDate path id.ts uses.
- `ordinal: number` — The 1-based FR ordinal, zero-padded to >=3 via the existing padOrdinal.
- `storyId: string` _(optional)_ — When present, produces a per-item id E<date><hash8>:S<nnn>:FR<nnn>; when absent, a doc-level id E<date><hash8>:FR<nnn>.

**Returns:** `string` — The canonical FR id string (an FrId), stable once assigned (lc1).

**Errors:**
- `Error` when epicHash is not >=8-char lowercase hex, or createdAtISO is an invalid date — same guards as hash8Of/utcDate in id.ts.

**Preconditions:**
- ordinal >= 1

**Postconditions:**
- The returned id round-trips through parseFrId and is byte-stable for the same (epicHash, createdAt, ordinal, storyId).

### `parseFrId`

```typescript
parseFrId(s: string): { date: string; hash8: string; story?: number; fr: number } | null
```

**Parameters:**
- `s: string` — A candidate FR id string to parse (canonical or slug form).

**Returns:** `{ date: string; hash8: string; story?: number; fr: number } | null` — The parsed segments, or null when the string is not an FR id — mirroring id.ts parseWorkflowId's null-on-miss contract.

**Postconditions:**
- Returns non-null iff s matches the FR-id grammar (`E<8><8>[:S<nnn>]:FR<nnn>` or its dash slug).

### `renderDefineMarkdown`

```typescript
renderDefineMarkdown(artifact: DefineArtifact): string
```

**Parameters:**
- `artifact: DefineArtifact` — The define artifact whose body now MAY carry an optional functionalDefinition to render as a Functional Requirements section.

**Returns:** `string` — The markdown, UNCHANGED byte-for-byte when body.functionalDefinition is absent; when present, a Functional Requirements section (each FR id + statement) is emitted from the record (k2).

**Postconditions:**
- An artifact with no functionalDefinition renders identically to the pre-change output (absent-safe). The peer renderers renderHldMarkdown/renderLldMarkdown/renderPlanMarkdown gain the same additive section.

### `judgeFunctionalCoverage`

```typescript
judgeFunctionalCoverage(input: { grounding: CodeReviewGrounding; expectations: readonly FunctionalCoverageExpectation[]; judgement: unknown }): DimensionResult
```

**Parameters:**
- `input: { grounding: CodeReviewGrounding; expectations: readonly FunctionalCoverageExpectation[]; judgement: unknown }` — The changed-symbol grounding plus the FR expectations (one per FrId from the subject's functionalDefinition) and the controller's emitted judgement (validated at runtime, mirroring the existing judges) — same shape as judgeCoverage.

**Returns:** `DimensionResult` — A DimensionResult with dimension:'functional-coverage' whose DimensionFindings each set expectationRef to the FR id judged unrealized/partial, folding through the existing verdict via the unchanged reducer.

**Errors:**
- `Error` when A returned finding names an expectationRef that is not one of the supplied FR ids (guarded like the existing dimension validators).

**Preconditions:**
- Called only when the subject carries a non-empty functionalDefinition (the conditional-inclusion rule).

**Postconditions:**
- Emits only DimensionFindings for dimension 'functional-coverage'; severity is the review Severity verbatim so it folds with the other dimensions.

### `buildFunctionalCoveragePrompt`

```typescript
buildFunctionalCoveragePrompt(subject: CodeReviewSubject, grounding: CodeReviewGrounding): string
```

**Parameters:**
- `subject: CodeReviewSubject` — The per-Story review subject, whose approved artifacts supply the FR records to check.
- `grounding: CodeReviewGrounding` — The daemon-served changed-symbol summaries the FR-realization judgement reasons over.

**Returns:** `string` — The narrow-LLM prompt asking whether each FR id is genuinely realized — the functional-coverage analogue of buildCoveragePrompt.

**Postconditions:**
- Produced only for the functional-coverage dimension; peripheral-role model per model-tiering.

### `validateArtifact`

```typescript
validateArtifact(a: CodeReviewArtifact, expectedDims: readonly ReviewDimension[]): string | null
```

**Parameters:**
- `a: CodeReviewArtifact` — The assembled code-review record to validate.
- `expectedDims: readonly ReviewDimension[]` — The expected dimension set — now DERIVED conditionally: the base four plus 'functional-coverage' only when the subject carries a non-empty functionalDefinition.

**Returns:** `string | null` — An error string when an expected dimension is missing/extra, else null — unchanged contract; only the expectedDims derivation feeding it changes.

**Postconditions:**
- When no functionalDefinition is present, expectedDims is exactly the existing four and validation behaves identically to today.

## Data model changes

### `FunctionalRequirement` — new

sc1 type: { id: FrId; statement: string; rationale?: string; scope: 'doc'|'item'; itemRef?: string }. FrId is the mintFrId output; itemRef binds a per-item FR to a story/task id when scope==='item'. Declared in a new src/workflow/artifacts/functional-definition.ts (or types.ts) and imported by each body.

```
+ interface FunctionalRequirement { readonly id: FrId; readonly statement: string; readonly rationale?: string; readonly scope: 'doc'|'item'; readonly itemRef?: string }
```

**Call sites:**
- `src/workflow/artifacts/define.ts`
- `src/workflow/id.ts`

### `FunctionalDefinition` — new

sc1 type: { requirements: readonly FunctionalRequirement[] }. The structured source of truth from which the Functional Requirements prose is generated (k2).

```
+ interface FunctionalDefinition { readonly requirements: readonly FunctionalRequirement[] }
```

**Call sites:**
- `src/workflow/artifacts/define.ts`

### `DefineBody` — field-add

Add optional `functionalDefinition?: FunctionalDefinition | undefined` (exactOptionalPropertyTypes). Purely additive; existing artifacts with no such field are unaffected (k6). The same additive field is added to HldBody/LldBody/PlanBody peer bodies.

```
  interface DefineBody { …; readonly functionalDefinition?: FunctionalDefinition | undefined }
```

**Call sites:**
- `src/workflow/artifacts/define.ts:68`
- `src/workflow/artifacts/hld.ts`
- `src/workflow/artifacts/lld.ts`
- `src/workflow/artifacts/plan.ts`

### `ReviewDimension` — field-modify

Widen the union to include 'functional-coverage'. Additive union member; the block/warn/pass reducer is not forked. DimensionFinding.expectationRef (already present) carries the FR id for functional-coverage findings — no new field on DimensionFinding.

```
- type ReviewDimension = 'adherence'|'conventions'|'coverage'|'quality'
+ type ReviewDimension = 'adherence'|'conventions'|'coverage'|'quality'|'functional-coverage'
```

**Call sites:**
- `src/workflow/code-review/types.ts:34`

### `DIMENSION_JUDGES (runner.ts) + DIMENSIONS (handler.ts)` — invariant-change

The dimension set changes from a FIXED four-member constant to a set that CONDITIONALLY includes 'functional-coverage' when the subject carries a non-empty functionalDefinition. runner.ts adds a { dimension:'functional-coverage', judge: judgeFunctionalCoverage } row consulted only under that condition; handler.ts derives its emit-schema enum + expected set the same way. Non-FR reviews keep exactly the four existing dimensions.

```
runner.ts:110-113 DIMENSION_JUDGES gains one conditional row; handler.ts:56 DIMENSIONS becomes a function of subject.functionalDefinition presence
```

**Call sites:**
- `src/workflow/code-review/runner.ts:110`
- `src/mcp/code-review-step/handler.ts:56`
- `src/workflow/code-review/runner.ts:266`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | implements | S001 owns sc1: it declares FrId/FunctionalRequirement/FunctionalDefinition, adds the optional functionalDefinition field to every <Stage>Body, mints FR ids via mintFrId (reusing id.ts padOrdinal + the canonical prefix so ids mirror the story/task sequence scheme, lc1), and renders a Functional Requirements section from the record (k2). Consumers S002/S003/S004 read the record shape only; the id/validation/prose-generation internals stay private to S001. |
| `sc2` | implements | S001 owns sc2: it adds 'functional-coverage' to ReviewDimension, a sibling dimension file (buildFunctionalCoveragePrompt/judgeFunctionalCoverage) mirroring coverage.ts, and a conditional row in the dimension orchestration so the dimension runs only when FR records exist. Findings bind to FR ids via the existing DimensionFinding.expectationRef and fold through computeReviewVerdict/effectiveReviewVerdict UNCHANGED (k4). S004 later consumes this dimension as one selectable member of its adherence enum. |

## Error paths

### Error cases

- **Two functional requirements in the same document are minted with the same ordinal, producing duplicate FR ids.** (recoverable)
  - Detection: The FunctionalDefinition assembly/validation step builds a Set over requirements[].id and finds size < length (a collision) before the artifact is persisted.
  - Response: Reject the artifact synthesis with a specific 'duplicate FR id' error naming the collided id; nothing is written (mirrors how the existing synthesizer refuses a malformed body).
  - User impact: The document is not generated until the FR ordinals are unique; the reviewer never sees a document with ambiguous FR identity.
- **A functional-coverage finding names an expectationRef that is not one of the document's FR ids.** (recoverable)
  - Detection: The dimension validation (the same validateFinding path that already checks findings per dimension in handler.ts) cross-checks each functional-coverage finding's expectationRef against the subject's FR id set.
  - Response: Return a validation error for that dimension result; the code-review record is not written (the ok:false arm), exactly as an unknown dimension is rejected today.
  - User impact: A malformed coverage judgement cannot silently pass; the review must be re-run with valid FR references.
- **An artifact carries a functionalDefinition but its meta.createdAt/epicHash is missing or malformed, so an FR id cannot be minted.** (recoverable)
  - Detection: mintFrId's hash8Of/utcDate guards (reused from id.ts) throw on non-hex hash or invalid ISO date.
  - Response: Surface the error at generation time; do NOT emit a partial/unstable id. (Unlike safeCanonical's best-effort display fallback, an FR id is load-bearing identity, so it must fail loudly rather than degrade.)
  - User impact: Generation fails fast with a clear cause instead of assigning an unstable id that would break the downstream thread.
- **A per-item FR (scope==='item') names an itemRef that no story/task in the body defines.** (recoverable)
  - Detection: The assembly validator checks each scope==='item' requirement's itemRef against the body's known story/task ids.
  - Response: Reject synthesis with a 'dangling FR itemRef' error identifying the FR id and the missing item.
  - User impact: Per-item FRs always resolve to a real item, so the reviewer's per-item functional view is never broken.

### Edge cases

| Input | Expected |
| :--- | :--- |
| functionalDefinition is present but requirements is the empty array []. | Treated identically to absent: no Functional Requirements section is rendered and functional-coverage is NOT added to the dimension set (absent-safe) — output byte-identical to today. |
| functionalDefinition present with only scope==='doc' requirements (no per-item FRs). | A document-level Functional Requirements section renders; no per-item FR anchoring is emitted. Valid. |
| The same document is regenerated with the same requirement ordinals. | mintFrId yields byte-identical FR ids (stable once assigned, lc1), so the downstream thread and any recorded expectations remain valid across regenerations (k6). |
| An FR ordinal >= 1000. | padOrdinal keeps the full width (never truncates), matching id.ts's story/task behaviour exactly. |
| A code review runs on a Story whose subject artifacts carry no functionalDefinition. | expectedDims is exactly the existing four dimensions; functional-coverage is neither expected nor judged; completion behaves identically to today. |

### Invariants to preserve

- An artifact with no functionalDefinition renders byte-for-byte identically to the pre-change output for every artifact type — the enrichment of the per-type renderers (define.ts:86 and peers) is strictly additive. [[c5]]
- The block/warn/pass verdict reduction (computeReviewVerdict / effectiveReviewVerdict) is not forked or reinterpreted; a functional-coverage HIGH folds into the verdict exactly like any other dimension's HIGH. [[c5]]
- validateArtifact's missing/extra-dimension contract is unchanged; only the derivation of expectedDims (now conditional on functionalDefinition presence) changes, so a non-FR review's expected set stays the existing four. [[c5]]
- No Promise.all over an LLM provider: the functional-coverage judge runs inside the existing serial dimension loop, preserving the sequential-await convention. [[c5]]

## Test strategy

**Test framework:** `node:test via `npx tsx --test` (*.test.ts under __tests__/), matching the workflow module's existing suite (e.g. src/workflow/__tests__/lld-artifact.test.ts, plan-artifact.test.ts) and the mcp code-review-step handler tests.`

### Test levels

- **unit** — Prove the FR-id minter/parser and the additive renderer behaviour in isolation.
  - Subjects: `mintFrId: doc-level (E<date><hash8>:FR<nnn>) and per-item (E<date><hash8>:S<nnn>:FR<nnn>) forms; padOrdinal >=3 and >=1000 width; hash8/utcDate guards throw on bad input`, `parseFrId round-trips every mintFrId output and returns null on non-FR strings`, `renderDefineMarkdown (and peer renderers) emit a Functional Requirements section from a body with functionalDefinition, and byte-identical output when it is absent/empty`
  - Fixtures: `A DefineArtifact fixture with a functionalDefinition (mix of doc + item scope)`, `A golden pre-change render snapshot per artifact type for the absent-field byte-identity assertion`
- **unit** — Prove the functional-coverage dimension and the conditional dimension-set derivation.
  - Subjects: `judgeFunctionalCoverage returns a DimensionResult with dimension 'functional-coverage' and expectationRef set to real FR ids; rejects an unknown expectationRef`, `the expectedDims derivation includes 'functional-coverage' only when the subject carries a non-empty functionalDefinition, and is exactly the base four otherwise`, `validateArtifact passes/fails against the conditionally-derived expected set`
  - Fixtures: `A CodeReviewSubject fixture with and without functionalDefinition`, `A CodeReviewGrounding fixture (changed-symbol summaries)`
- **integration** — Prove the dimension folds through the existing verdict + gate end-to-end without forking the reducer.
  - Subjects: `The code-review-step handler runs functional-coverage when FR records exist and a functional-coverage HIGH folds to a block verdict via computeReviewVerdict`, `A subject with no functionalDefinition drives exactly the four existing dimensions and completes byte-identically (absent-safe)`
  - Fixtures: `The existing mcp/code-review-step handler test harness (reviewSpy/runReview) extended with an FR-bearing subject`
- **contract** — Prove sc1/sc2 shapes hold for downstream consumers.
  - Subjects: `FunctionalDefinition/FunctionalRequirement on every <Stage>Body type-check under exactOptionalPropertyTypes`, `DimensionFinding.expectationRef carries an FR id and folds into the existing DimensionResult/CodeReviewBody verdict counts unchanged`
  - Fixtures: `Type-level fixtures for each <Stage>Body carrying functionalDefinition`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: renderDefineMarkdown emits a Functional Requirements section listing each FR id + statement from a body.functionalDefinition (discrete, individually-identified, reviewer-facing)`, `unit: mintFrId assigns discrete stable ids per requirement` |
| `ac2` | `unit: mintFrId is byte-stable for the same (epicHash, createdAt, ordinal, storyId) so a downstream body carries identical FR ids`, `contract: a downstream <Stage>Body carrying the same functionalDefinition ids type-checks and renders the same identities (thread continuity)` |
| `ac3` | `unit: judgeFunctionalCoverage emits expectationRef-bound findings and the conditional expectedDims includes functional-coverage only when FRs exist`, `integration: a functional-coverage HIGH folds to a block verdict through the existing gate, while a no-FR subject completes with the four existing dimensions unchanged` |

## Migration

**State before:** Per s1 bundles: the per-stage bodies (DefineBody define.ts:68-76 and peers HldBody/LldBody/PlanBody) carry no functional-requirement data, and the renderers (renderDefineMarkdown define.ts:86 + peers) emit a fixed set of sections. src/workflow/id.ts mints only epic/story/task ids (no FR minter). The code-review dimension set is a FIXED four-member list — ReviewDimension = 'adherence'|'conventions'|'coverage'|'quality' (code-review/types.ts:34), DIMENSION_JUDGES (runner.ts:110-113), DIMENSIONS (handler.ts:56) — and validateArtifact (runner.ts:266) requires exactly that expected set. DimensionFinding.expectationRef already exists (used by adherence).

**State after:** Each <Stage>Body carries an optional functionalDefinition; the renderers emit an additive Functional Requirements section only when it is present (byte-identical output otherwise). id.ts gains mintFrId/parseFrId producing stable `<epicId>[:S<nnn>]:FR<nnn>` ids via the existing padOrdinal. ReviewDimension includes 'functional-coverage'; a new dimension file (buildFunctionalCoveragePrompt/judgeFunctionalCoverage) mirrors coverage.ts; the dimension set is derived conditionally so functional-coverage is expected/judged only when the subject carries a non-empty functionalDefinition, folding through the unchanged verdict reducer + gate.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Declare the sc1 types (FrId, FunctionalRequirement, FunctionalDefinition) in a new module and add mintFrId/parseFrId to id.ts, reusing padOrdinal/hash8Of/utcDate. Pure additive code; nothing consumes it yet. — ↩ rollbackable
2. Add the optional `functionalDefinition?: FunctionalDefinition | undefined` field to each <Stage>Body type. Additive optional field; existing artifacts and callers compile and behave unchanged. — ↩ rollbackable
3. Enrich each per-type renderer to emit a Functional Requirements section from body.functionalDefinition, guarded so an absent/empty record produces byte-identical output to today (verified by golden snapshots). — ↩ rollbackable
4. Widen the ReviewDimension union with 'functional-coverage' and add the dimension file (buildFunctionalCoveragePrompt/judgeFunctionalCoverage) mirroring coverage.ts. Union widening is additive; the judge is not yet wired into the loop. — ↩ rollbackable
5. Make the dimension set conditional: add the functional-coverage row to DIMENSION_JUDGES (runner.ts) and derive DIMENSIONS (handler.ts) + validateArtifact's expectedDims from whether the subject carries a non-empty functionalDefinition. A subject with no FRs yields exactly the existing four dimensions. — ↩ rollbackable

**Backward compat:** All changes are additive and absent-safe. Existing artifacts on disk carry no functionalDefinition and render byte-for-byte identically (k6 forward-only). The renderer signatures (renderDefineMarkdown etc.) and validateArtifact's signature are unchanged — only their internal behaviour extends when new data is present. A code review of non-FR work expects and judges exactly the four existing dimensions, so completion behaviour for all existing work is unchanged. The verdict reducer (computeReviewVerdict/effectiveReviewVerdict) is untouched.

## Alternatives considered

### a1: First-class FR level in the WorkflowId union

Extend id.ts's WorkflowId with an 'fr' level and a frWorkflowId minter/regex, and carry the full FunctionalDefinition record on every <Stage>Body.

sc1's FrId becomes a fourth level of the existing hierarchical id: WorkflowId.level gains 'fr', CANONICAL_RE/SLUG_RE learn an optional `:FR<nnn>` segment, and a frWorkflowId minter plus parentId/epicOf handling are added so an FR id round-trips through parseWorkflowId like a story/task id. Each <Stage>Body gains the full FunctionalDefinition; functional-coverage is a conditional dimension.

**Rejected because:** Matches a2 on every acceptance/contract score but pays a disproportionate blast radius: widening the WorkflowId union forces re-auditing every `level` switch in a heavily-reused pure module, more than S001 needs since FR ids never navigate a child hierarchy.

### a2: Isolated FR-id minter + full record per body — **CHOSEN**

Add a small standalone mintFrId helper reusing padOrdinal (leaving the WorkflowId union untouched), carry the full FunctionalDefinition on each body, and make functional-coverage a conditional dimension.

Leave id.ts's WorkflowId struct/union as-is. Add a pure mintFrId(epicHash, createdAtISO, ordinal, storyId?) composing the epic/story canonical prefix + `:FR<nnn>` via padOrdinal, plus parseFrId/isFrId. FunctionalDefinition attaches optionally to each <Stage>Body; the generating stage authors records and downstream stages carry the same ids (ac2). functional-coverage is added to ReviewDimension and included only when the subject carries a non-empty functionalDefinition; findings bind via expectationRef and fold through the unchanged reducer.

### a3: Doc-authoritative record + downstream by-reference

Author the full FunctionalDefinition only on the first (DEF) body; downstream bodies carry only functionalRefs (FrId[]) that resolve back to it.

The full record lives on the earliest body only; each downstream <Stage>Body carries a lightweight functionalRefs?: readonly FrId[] resolved back to the authoritative record for rendering. FR-id minter is the isolated helper as in a2. functional-coverage resolves refs and judges per FR id.

**Rejected because:** Violates sc1 (the record must live on every body) and only partially meets ac2 (a downstream document can't render its functional section standalone); it also risks overreaching into S002's sc3 de-dup boundary by authoring bespoke ref-resolution.

## Citations

- **[[c2]]** `prior-artifact` `.insrc/artifacts/SPEC-46b20c2f0459e807.json` — "FR source of truth is structured JSON with prose generated from it; FR ids use `<epicId>:FRxxx` sequence numbering; forward-only."
- **[[c4]]** `code` `src/config/config-catalog.ts:90` — "codeReview.enforce — the blocking completion gate the functional-coverage dimension rides via approveWorkflowTarget."
- **[[c5]]** `analyze-bundle` `insrc_analyze + direct reads: id.ts, artifacts/define.ts, code-review/types.ts, runner.ts, handler.ts` — "id.ts canonical E<YYYYMMDD><hash8>[:S<nnn>][:T<nnn>] + padOrdinal (110-113); DefineBody define.ts:68 + renderDefineMarkdown define.ts:86; ReviewDimension four-member union code-review/types.ts:34 + Di"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 7 LOW** · model `client` · reviewed 2026-09-27T15:18:41.176Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| mintFrId | citation | LOW | manual | id.ts provides the reuse primitives mintFrId depends on: padOrdinal, hash8Of/utcDate guards, storyWorkflowId, and the parseWorkflowId null-on-miss pattern. | grep resolves padOrdinal (16), storyWorkflowId (50), parseWorkflowId (30) in id.ts — the reuse primitives mintFrId composes; confirmed by direct read of id.ts:110-113 this turn. | No change — verified against source. |
| sc1 | citation | LOW | manual | DefineBody is declared around src/workflow/artifacts/define.ts:68 and rendered by renderDefineMarkdown at define.ts:86 — the attach point for the optional functionalDefinition field and the additive FR section. | grep 'interface DefineBody' (2) and 'function renderDefineMarkdown' (2) resolve in src/workflow/artifacts/define.ts; direct read confirmed DefineBody at :68 and renderDefineMarkdown at :86. | No change — verified against source. |
| ReviewDimension | closed-union | LOW | manual | ReviewDimension is a four-member union ('adherence'\|'conventions'\|'coverage'\|'quality') declared at src/workflow/code-review/types.ts:34, and DimensionFinding already carries an optional expectationRef the functional-coverage dimension reuses. | grep 'type ReviewDimension =' (4) and 'expectationRef?' (14) resolve; direct read of code-review/types.ts confirmed the four-member union at :34 and DimensionFinding.expectationRef? at :45. | No change — verified against source. |
| DIMENSION_JUDGES | citation | LOW | manual | runner.ts lists the four dimension judges in a table around line 110 and validates the expected dimension set via validateArtifact at runner.ts:266. | grep 'judge: judgeCoverage' (1) confirms the DIMENSION_JUDGES table (runner.ts:110-113) and 'function validateArtifact' (1) confirms the validator at runner.ts:266. | No change — verified against source. |
| DIMENSIONS | citation | LOW | manual | The MCP code-review handler fixes DIMENSIONS = ['adherence','conventions','coverage','quality'] at src/mcp/code-review-step/handler.ts:56, driving the emit-judgements schema enum and validation — the constant the conditional-set change derives. | grep 'const DIMENSIONS' (1) resolves to src/mcp/code-review-step/handler.ts:56 — the fixed four-member constant the conditional-set change derives from. | No change — verified against source. |
| invariants | citation | LOW | manual | The block/warn/pass verdict reducer the LLD must not fork exists: computeReviewVerdict (src/workflow/review/review.ts) and effectiveReviewVerdict (src/workflow/review/resolve.ts). | grep resolves computeReviewVerdict (15) and effectiveReviewVerdict (20) — the block/warn/pass reducer the LLD explicitly does not fork exists. | No change — verified against source. |
| sc2 | citation | LOW | manual | coverage.ts is the sibling-dimension pattern the functional-coverage file mirrors, exporting buildCoveragePrompt + judgeCoverage. | grep resolves buildCoveragePrompt and judgeCoverage — the sibling-dimension export pattern the functional-coverage file mirrors. | No change — verified against source. |
