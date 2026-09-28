<!-- insrc:artifact LLD-a71086405dc6eeb4-S001 -->

# LLD: E20260927a7108640:S001

**Epic:** `s001-back-fill-wire-functionaldefinition-functional`
**HLD base run:** `wf-1790538303806-ks3p74`
**HLD effective hash:** `a71086405dc6...`

## HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## Contract details

**Surface level:** internal

### `mintFrId`

```typescript
mintFrId(epicHash: string, createdAtISO: string, ordinal: number, storyId?: string): string
```

**Parameters:**
- `epicHash: string` — The Epic hash the FR belongs to (from the artifact meta).
- `createdAtISO: string` — The artifact createdAt timestamp, for the id's date component.
- `ordinal: number` — The sequence number assigned in deterministic order (doc-level first, then per-story in story order).
- `storyId: string` _(optional)_ — For a per-item FR, the owning story id; omitted for doc-level FRs.

**Returns:** `string` — A stable canonical FR id (E<date><hash8>[:S<nnn>]:FR<nnn>). CONSUMED UNCHANGED from src/workflow/id.ts — the synthesizer calls it to assign ids off the model.

**Preconditions:**
- Called only inside defineSynthesizer during assembly, never from a step prompt.

**Postconditions:**
- Same (epicHash, createdAt, ordinal, storyId) yields the same id — stable across regenerations given a fixed ordinal order.

### `validateFunctionalDefinition`

```typescript
validateFunctionalDefinition(fd: FunctionalDefinition | undefined, knownItemIds: ReadonlySet<string>): string | null
```

**Parameters:**
- `fd: FunctionalDefinition | undefined` — The assembled functional-definition record to validate (absent-safe).
- `knownItemIds: ReadonlySet<string>` — The story ids a per-item FR's itemRef may resolve to (the DEF's story ids).

**Returns:** `string | null` — An error message string, or null when valid. CONSUMED UNCHANGED from functional-definition.ts — the synthesizer runs it after minting to reject dup ids / dangling itemRef / malformed id before writing the artifact.

**Postconditions:**
- A non-null result fails the synthesize (the assembled FR set is invalid).

### `renderFunctionalRequirementsSection`

```typescript
renderFunctionalRequirementsSection(fd: FunctionalDefinition | undefined): string[]
```

**Parameters:**
- `fd: FunctionalDefinition | undefined` — The functional-definition record on the DEF body.

**Returns:** `string[]` — The rendered FR section lines; [] when absent/empty. CONSUMED UNCHANGED from functional-definition.ts — already invoked by renderDefineMarkdown; once the synthesizer populates functionalDefinition, this section stops rendering empty.

**Postconditions:**
- Absent/empty fd renders nothing (absent-safe).

### `defineSynthesizer`

```typescript
defineSynthesizer(intent: WorkflowIntent, stepOutputs: Readonly<Record<string, unknown>>): SynthesizerPrompt
```

**Parameters:**
- `intent: WorkflowIntent` — The define run intent (provides epicHash + createdAt for minting).
- `stepOutputs: Readonly<Record<string, unknown>>` — s1..s4 outputs incl. the elicited doc-level + per-story FR statements.

**Returns:** `SynthesizerPrompt` — The synthesize prompt + body schema. RESHAPED (orchestrator.ts:879-960): its systemPrompt gains a HARD-RULE to assemble functionalDefinition by minting ids (mintFrId) over the elicited statements in deterministic order + validating (validateFunctionalDefinition); its body schema gains optional functionalDefinition (additionalProperties:false retained).

**Errors:**
- `Error (synthesize validation)` when the assembled functionalDefinition fails validateFunctionalDefinition, or the body fails ajv because the field was elicited but the schema was not extended (lockstep guard).

**Postconditions:**
- The DEF body carries a valid functionalDefinition when FRs were elicited; absent (and the section renders empty) when none were.

## Data model changes

### `epicFrameSchema + epic.frame prompt (doc-level FR elicitation)` — field-add

Add an optional `functionalRequirements: [{ statement: string; rationale?: string }]` to epicFrameSchema (schemas.ts:109, additionalProperties:false retained) and extend the epic.frame prompt (runners/define/index.ts) to ask for the Epic's DOC-LEVEL functional requirements in outcome terms (no ids, no scope — scope is implied 'doc'). Absent-safe: omitting it is valid.

```
epicFrameSchema.properties += functionalRequirements?: array<{ statement: string; rationale?: string }>
```

**Call sites:**
- `src/workflow/runners/define/schemas.ts`
- `src/workflow/runners/define/index.ts`

### `storiesComposeSchema + stories.compose prompt (per-story FR elicitation)` — field-add

Add an optional `functionalRequirements: [{ statement: string; rationale?: string }]` to each story in storiesComposeSchema (schemas.ts:176, additionalProperties:false retained) and extend the stories.compose prompt to ask for each story's functional requirements (scope implied 'item', itemRef = the story id). Absent-safe.

```
storiesComposeSchema.stories.items.properties += functionalRequirements?: array<{ statement: string; rationale?: string }>
```

**Call sites:**
- `src/workflow/runners/define/schemas.ts`
- `src/workflow/runners/define/index.ts`

### `defineSynthesizer body schema + assembly (orchestrator.ts:879-960)` — field-add

Add optional `functionalDefinition` to the defineSynthesizer body schema (currently orchestrator.ts:937 requires flavor/problem/nonGoals/assumptions/constraints/stories/openQuestions, additionalProperties:false). Add a HARD-RULE + assembly: gather the doc-level FR statements (from s2 epic.frame) and per-story FR statements (from s3 stories.compose), mint each id with mintFrId(epicHash, createdAt, ordinal, storyId?) in a fixed order (doc-level first by emission order, then per-story in story order), set scope/itemRef, run validateFunctionalDefinition(knownItemIds = story ids), and include the record only when non-empty. On the EXTEND branch (acknowledged:true), no assembly (no s2/s3).

```
defineSynthesizer body schema.properties += functionalDefinition?: FunctionalDefinition; + systemPrompt mint/validate HARD-RULE
```

**Call sites:**
- `src/workflow/orchestrator.ts`

### `defineChecklistSchema items (FR audit)` — invariant-change

Add FR audit items to the define checklist.verify prompt (runners/define/index.ts checklistItems): fr1 — when the ask has functional content, at least one functional requirement is captured; fr2 — each FR statement is outcome-worded (a capability/behaviour), not an implementation detail; fr3 — every per-story FR resolves to a real story id (no dangling itemRef). These ride the existing defineChecklistSchema (schemas.ts:261) results shape — no schema change, just added items + evidence.

```
checklistItems() += fr1/fr2/fr3 (soft items; not sb* hard-fail)
```

**Call sites:**
- `src/workflow/runners/define/index.ts`

## Error paths

### Error cases

- **FR statements are elicited but the defineSynthesizer body schema was not extended to admit functionalDefinition — additionalProperties:false rejects the field.** (recoverable)
  - Detection: The synthesize-turn ajv validation fails the DEF body because functionalDefinition is not a declared property; the whole synthesize errors.
  - Response: This story extends the body schema IN LOCKSTEP with the step-schema + assembly additions, so the field is admitted; a schema/assembly drift is caught by the define synthesize-path tests.
  - User impact: Without lockstep the define run hard-fails or silently drops FRs; with it, the assembled functionalDefinition flows into the DEF body.
- **The assembled functionalDefinition is invalid (duplicate id, malformed id, or a per-story FR whose itemRef resolves to no story id).** (recoverable)
  - Detection: defineSynthesizer runs validateFunctionalDefinition(fd, knownItemIds = story ids) after minting and gets a non-null error string.
  - Response: Fail the synthesize with the validator's message. Because ids are minted deterministically off mintFrId, dup/malformed ids indicate an assembly bug (not model output) — caught by assembly unit tests before ship.
  - User impact: A malformed FR set never reaches disk; the failure names the offending FR.
- **The model, prompted for FR statements, instead emits implementation detail or restates the problem verbatim (low-quality FRs).** (recoverable)
  - Detection: The checklist.verify FR items (fr2 outcome-worded, fr1 present-when-functional) flag it; a human sees the audit verdict at approval.
  - Response: Record the weak FRs as checklist misses / openQuestions rather than blocking synthesize; the reviewer decides. Content quality is advisory (soft items), not a hard-fail.
  - User impact: Weak FRs surface in the checklist for the reviewer instead of silently passing.
- **An epicHash or createdAt needed for minting is missing/blank in the intent at assembly time.** (recoverable)
  - Detection: defineSynthesizer reads intent/meta before minting; a missing epicHash or createdAt is detected there (mintFrId needs both).
  - Response: Skip FR assembly and omit functionalDefinition (absent-safe) rather than minting a malformed id; log a warning. The DEF still writes with an empty FR section.
  - User impact: A run lacking mint inputs degrades to no-FRs instead of failing or producing malformed ids.

### Edge cases

| Input | Expected |
| :--- | :--- |
| A define run whose ask has no functional content (neither epic.frame nor stories.compose emits functionalRequirements). | functionalDefinition is omitted entirely; renderFunctionalRequirementsSection returns [] and the FR section renders empty — identical to today's output (absent-safe, byte-compatible for no-FR DEFs). |
| Only doc-level FRs elicited (no per-story), or only per-story FRs (no doc-level). | The synthesizer assembles whichever were elicited; mintFrId is called with storyId only for per-item FRs; the record validates and the renderer groups accordingly (doc-level list then per-item groups, empty groups omitted). |
| The EXTEND branch of define (scope.assess decided extend; acknowledged:true; no s2/s3). | No FR assembly runs (there is no epic.frame/stories.compose on the extend path); functionalDefinition is absent; the extend artifact is unaffected. |
| Two FR statements with identical text under the same story. | Each still gets a distinct minted id (ordinal differs), so validateFunctionalDefinition does not flag a dup id; the duplication is a content nit the checklist may note, not an error. |
| A story reordered between runs. | Because ordinals are assigned in a fixed order (doc-level first, then per-story in story order), FR ids shift only if the story order changes — a known, documented consequence of sequence-numbering; ids are stable when the story order is stable. |

### Invariants to preserve

- The FR record's types, validation, rendering, and id scheme are S001's and stay UNCHANGED — this story only elicits statements + assembles/mints via the existing functional-definition.ts (validateFunctionalDefinition, renderFunctionalRequirementsSection) and id.ts (mintFrId); it does not alter the FR-id format, the record shape, or the renderer. Per the s1 code bundle on the shipped FR seams. [[c2]]
- The define body schema stays additionalProperties:false and functionalDefinition is OPTIONAL — existing DEFs without FRs still validate and render exactly as before (absent-safe); the change is forward-only and rewrites nothing on disk. Per the s1 code bundle on the defineSynthesizer body schema (orchestrator.ts:937). [[c1]]
- FR ids are minted deterministically by the synthesizer (off the model) so they stay stable + sequence-numbered as S001 designed — the model never emits an id. Per the s1 code bundle on mintFrId + the grounding doc's stable-id intent. [[c2]]

## Test strategy

**Test framework:** `node:test + node:assert/strict (tsx), co-located under src/workflow/runners/define/__tests__/ and src/workflow/__tests__/ — matching the existing define-runner + orchestrator synthesizer tests and the S001 functional-definition suites.`

### Test levels

- **unit** — Prove the extended step schemas accept + shape the elicited FR statements: epicFrameSchema admits optional doc-level functionalRequirements; storiesComposeSchema admits optional per-story functionalRequirements; both keep additionalProperties:false and stay valid when the field is omitted.
  - Subjects: `epicFrameSchema (functionalRequirements optional)`, `storiesComposeSchema story item (functionalRequirements optional)`
  - Fixtures: `an epic.frame output with + without doc-level FR statements`, `a stories.compose output with per-story FR statements + one story with none`
- **unit** — Prove the defineSynthesizer FR assembly: mints ids via mintFrId in the fixed order (doc-level first, then per-story in story order), sets scope/itemRef from the elicitation site, runs validateFunctionalDefinition, and only includes functionalDefinition when non-empty; the body schema admits it (additionalProperties:false retained).
  - Subjects: `defineSynthesizer assembly (mint + scope + validate)`, `defineSynthesizer body schema (functionalDefinition admitted)`
  - Fixtures: `stepOutputs with doc-level + per-story FR statements + known story ids`, `stepOutputs with NO FR statements (asserts functionalDefinition omitted)`, `an epicHash + createdAt for deterministic mint assertion`, `an EXTEND-branch stepOutputs (asserts no assembly)`
- **unit** — Prove stability + validation: the same stepOutputs mint the same FR ids across two runs (stable); a per-story FR's itemRef always resolves to a real story id (never dangling by construction); a forced malformed/duplicate assembled record makes validateFunctionalDefinition return non-null and the synthesize fail.
  - Subjects: `mintFrId determinism over fixed ordinal order`, `validateFunctionalDefinition integration in the assembly path`
  - Fixtures: `two identical stepOutputs (id-stability assertion)`, `a hand-built invalid FunctionalDefinition (dup id / dangling itemRef)`
- **integration** — Prove the end-to-end define path: a full define synthesize with elicited FRs writes a DEF whose body carries functionalDefinition AND whose rendered markdown shows a populated Functional requirements section (renderFunctionalRequirementsSection no longer empty); a define run with no FRs renders exactly as before (absent-safe).
  - Subjects: `define synthesize -> DEF body.functionalDefinition`, `renderDefineMarkdown Functional requirements section (populated vs empty)`
  - Fixtures: `a define run fixture with FR statements`, `a define run fixture with none (byte-compatible-empty assertion)`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `epicFrameSchema + storiesComposeSchema admit optional functionalRequirements (present + omitted)`, `defineSynthesizer assembles functionalDefinition from doc-level + per-story statements`, `integration: define synthesize writes body.functionalDefinition and renderDefineMarkdown shows a populated Functional requirements section (no longer inert)` |
| `ac2` | `defineSynthesizer mints ids via mintFrId in fixed order (doc-level first, then per-story in story order)`, `id-stability: identical stepOutputs mint identical FR ids across runs`, `validateFunctionalDefinition runs in the assembly path; a malformed/dup assembled record fails the synthesize`, `per-story FR itemRef always resolves to a real story id (no dangling by construction)` |
| `ac3` | `no-FR define run: functionalDefinition omitted, FR section renders empty — byte-compatible with today`, `defineSynthesizer body schema keeps additionalProperties:false and functionalDefinition optional`, `EXTEND-branch run performs no FR assembly`, `S001's functional-definition.ts + id.ts are consumed unchanged (no edits to those files)` |

## Migration

**State before:** Per the s1 code bundle: the define runner's epic.frame + stories.compose steps (runners/define/index.ts + schemas.ts) elicit no functional requirements, and defineSynthesizer's body schema (orchestrator.ts:937) requires exactly flavor/problem/nonGoals/assumptions/constraints/stories/openQuestions under additionalProperties:false — so even if FRs were elicited they'd be rejected at synthesize. S001's functionalDefinition field, mintFrId, validateFunctionalDefinition, renderFunctionalRequirementsSection, and the functional-coverage dimension all exist but are inert: the DEF FR section renders empty on every real run.

**State after:** epic.frame elicits doc-level FR statements and stories.compose elicits per-story FR statements (both optional, additionalProperties:false retained); defineSynthesizer assembles a FunctionalDefinition by minting stable ids via mintFrId in a fixed order (doc-level first, then per-story in story order), setting scope/itemRef from the elicitation site, validating via validateFunctionalDefinition, and including functionalDefinition in the body only when non-empty; the define checklist.verify gains FR audit items. DEFs with functional content now render a populated Functional requirements section; DEFs without render exactly as before. Forward-only; nothing on disk rewritten.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the optional functionalRequirements array to epicFrameSchema and storiesComposeSchema (per-story), keeping additionalProperties:false — additive, no behavior change until the synthesizer reads them. — ↩ rollbackable
2. Extend the epic.frame + stories.compose prompts to ask for doc-level / per-story functional requirements in outcome terms (no ids). — ↩ rollbackable
3. Add optional functionalDefinition to the defineSynthesizer body schema (additionalProperties:false retained) and add the assembly HARD-RULE: mint ids via mintFrId in fixed order, set scope/itemRef, validate via validateFunctionalDefinition, include only when non-empty; skip on the EXTEND branch. Land with the assembly + synthesize-path unit tests in the same step. — ↩ rollbackable
4. Add the fr1/fr2/fr3 audit items to the define checklist.verify prompt (soft items, existing defineChecklistSchema shape — no schema change). — ↩ rollbackable
5. Add the integration test proving a full define synthesize writes body.functionalDefinition + a populated rendered FR section, and a no-FR run stays byte-compatible-empty. — ↩ rollbackable

**Backward compat:** All three schema touches (epicFrameSchema, storiesComposeSchema, defineSynthesizer body) add only OPTIONAL fields and retain additionalProperties:false, so existing define runs that omit functionalRequirements/functionalDefinition still validate. functionalDefinition is optional on the DEF body and renderFunctionalRequirementsSection is already []-safe, so existing DEFs on disk stay valid and render unchanged (empty FR section) — forward-only, no rewrite. defineSynthesizer keeps its signature; only its internal assembly + schema grow. The consumed S001 files (functional-definition.ts, id.ts) are not modified. The one visible change is intentional: DEFs authored WITH functional content now render a populated FR section where before it was always empty.

## Alternatives considered

### a1: Elicit FR statements in the steps; mint stable ids in the synthesizer — **CHOSEN**

epic.frame elicits doc-level FR statements and stories.compose elicits per-story FR statements (no ids); defineSynthesizer mints stable FR ids via mintFrId, assembles + validates the functionalDefinition, and admits it to the body schema.

Extend epicFrameSchema with an optional `functionalRequirements: [{ statement, rationale? }]` (doc-level) and its prompt to ask for the epic's functional requirements in outcome terms. Extend storiesComposeSchema so each story carries an optional `functionalRequirements: [{ statement, rationale? }]` and its prompt to ask for that story's FRs. Neither step emits ids or scope — scope is implied by WHERE the FR was elicited (epic.frame => 'doc'; per-story => 'item' with itemRef = story id). defineSynthesizer then assembles a single FunctionalDefinition: it mints each id with mintFrId(epicHash, createdAt, ordinal, storyId?) in a deterministic order, sets scope + itemRef, runs validateFunctionalDefinition(knownItemIds = story ids), and includes functionalDefinition in the body (schema extended, additionalProperties:false retained). checklist.verify gains FR audit items.

### a2: Elicit full FR objects (with ids) in the steps; synthesizer carries verbatim

The steps emit complete FunctionalRequirement objects (id, statement, scope, itemRef) and the synthesizer copies them verbatim into functionalDefinition.

Extend the step schemas to require full FunctionalRequirement objects including the id, and have the model emit ids directly (e.g. following the FR-id shape). defineSynthesizer copies the union verbatim and validates.

**Rejected because:** Near-passthrough synthesizer but the model invents ids — unstable, collision-prone, leaks the id scheme, and repeatedly fails validateFunctionalDefinition.

### a3: Per-story FRs only; no doc-level elicitation

Only stories.compose elicits per-story FR statements; there is no doc-level FR elicitation at epic.frame.

Extend only storiesComposeSchema + its prompt to elicit per-story FR statements; defineSynthesizer mints ids (scope 'item') and assembles. epic.frame is left unchanged, so DEFs carry no document-level functional requirements.

**Rejected because:** Smallest change and correct for per-story FRs, but drops doc-level FRs which the record + S002 Summary need.

## Citations

- **[[c1]]** `analyze-bundle` `s1 code bundle: define runner + schemas + defineSynthesizer body schema (runners/define/index.ts, runners/define/schemas.ts, orchestrator.ts:937)` — "defineSynthesizer body schema (orchestrator.ts:937) requires exactly flavor/problem/nonGoals/assumptions/constraints/stories/openQuestions under additionalProperties:false — so functionalDefinition is"
- **[[c2]]** `analyze-bundle` `s1 code bundle: S001's shipped FR seams (functional-definition.ts:26/38/54/87, id.ts:295)` — "mintFrId(epicHash, createdAtISO, ordinal, storyId?); validateFunctionalDefinition rejects dup ids/dangling itemRef/malformed id; renderFunctionalRequirementsSection returns [] when absent."
- **[[c3]]** `doc` `docs/epics/make-workflow-framework-s-generated-artifact-E20260927c5824e17/S002/prompt-alignment-assessment.md (scope split + inert FR thread)` — "S001 shipped the functionalDefinition field + renderer + functional-coverage dimension but never wired the elicitation; this FR-elicitation is a SEPARATE small S001 back-fill."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 9 LOW** · model `client` · reviewed 2026-09-27T20:00:01.379Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| contract/mintFrId | citation | LOW | manual | mintFrId(epicHash, createdAtISO, ordinal, storyId?) exists in src/workflow/id.ts around line 295 and is consumed unchanged to mint FR ids. | CONFIRMED exact: `export function mintFrId(epicHash, createdAtISO, ordinal, storyId?)` at src/workflow/id.ts:295. | None — citation sound. |
| contract/validate | citation | LOW | manual | validateFunctionalDefinition(fd, knownItemIds) exists in src/workflow/artifacts/functional-definition.ts around line 54 and is consumed unchanged. | CONFIRMED exact: `export function validateFunctionalDefinition(` at functional-definition.ts:54. | None — citation sound. |
| contract/render | citation | LOW | manual | renderFunctionalRequirementsSection(fd) exists in functional-definition.ts around line 87, is []-safe, and is already invoked by renderDefineMarkdown. | CONFIRMED exact at functional-definition.ts:87, and the grep shows it is already invoked by renderDefineMarkdown (define.ts:119) + hld.ts:128 + lld.ts:312 + plan.ts:116 — the consumed, []-safe renderer. | None — citation sound. |
| contract/defineSynth-gate | citation | LOW | manual | defineSynthesizer's body schema at orchestrator.ts:937 requires flavor/problem/nonGoals/assumptions/constraints/stories/openQuestions under additionalProperties:false and omits functionalDefinition; defineSynthesizer is defined at orchestrator.ts:879. | CONFIRMED exact: orchestrator.ts:937 reads `required: ['flavor','problem','nonGoals','assumptions','constraints','stories','openQuestions']` (no functionalDefinition), and defineSynthesizer is at orchestrator.ts:879 — grounds the elicitation-gap + the schema this story extends. | None — citation sound. |
| data/epicFrameSchema | citation | LOW | manual | epicFrameSchema exists in src/workflow/runners/define/schemas.ts around line 109 with additionalProperties:false (the doc-level FR field is added here). | CONFIRMED exact: `export const epicFrameSchema = {` at schemas.ts:109. | None — citation sound. |
| data/storiesComposeSchema | citation | LOW | manual | storiesComposeSchema exists in schemas.ts around line 176 with per-story items (the per-story FR field is added here). | CONFIRMED exact: `export const storiesComposeSchema = {` at schemas.ts:176. | None — citation sound. |
| data/defineChecklistSchema | citation | LOW | manual | defineChecklistSchema exists in schemas.ts around line 261 and its results shape hosts the added fr1/fr2/fr3 audit items (no schema change). | CONFIRMED exact: `export const defineChecklistSchema = {` at schemas.ts:261. | None — citation sound. |
| data/FR-types | semantic | LOW | manual | FunctionalRequirement { id; statement; rationale?; scope:'doc'\|'item'; itemRef? } and FunctionalDefinition { requirements[] } are the record shapes the synthesizer assembles, defined in functional-definition.ts. | CONFIRMED: FunctionalRequirement (functional-definition.ts:26) + FunctionalDefinition (:38) + scope:'doc'\|'item' (:32) are the real record shapes the assembly targets. | None — semantic claim verified against the real types. |
| scope/reuse-unchanged | semantic | LOW | manual | This story consumes S001's functional-definition.ts + id.ts UNCHANGED (no edits) and stays within the define phase; it does not touch the renderer or the FR-id scheme. | No probe was run (it is a forward design commitment, not a citation), but it is verified by construction: cl1-cl3 confirm functional-definition.ts + id.ts export the consumed symbols, and the LLD references them as CONSUMED (mint/validate/render) with no dataModel entry touching those files — all four dataModel changes target runners/define/* + orchestrator.ts only. | None — no statable failure; the no-edit-to-S001-files scope is honoured by the design and checked again at code-review. |
