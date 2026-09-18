<!-- insrc:artifact LLD-1703991c69967193-s1 -->

# LLD: E202609181703991c:S001

**Epic:** `add-bugfix-triage-category-insrc-framework`
**HLD base run:** `wf-1789726188697-irhvw2`
**HLD effective hash:** `e08e0c0d9f7b...`

## HLD context

**Framework:** Bugfix becomes a first-class, scope-gated category that reuses the existing stage/artifact/approve/tracker machinery end-to-end. Triage gains a new `bugfix` SizeClass carrying a magnitude (a small fix vs an M/L fix) and a route that is NOT a single fixed startStage but branches on that magnitude. The flow's first stage is a new first-class `issue` workflow whose synthesized IssueArtifact — reproduction + root cause + fix intent — is the single source of truth serving both the internal chain record and, later, the GitHub issue body. A tiered parent-locator (deterministic ref-resolver → graph code-ownership → semantic match → user prompt → standalone) attaches the fix to the epic/story whose behaviour it corrects, recording which tier decided and at what confidence, with auto-attach only above a high threshold. A scope-gated orchestrator then routes a small fix issue→build and an M/L fix issue→design→plan→build, with the existing post-build code-review gating completion; where a tracker is configured a GitHub issue is created from the same issue content, linked to the located parent, and closed on completion. All five constraints k1–k6 are satisfied by conforming to the framework's own conventions rather than inventing a parallel mechanism.
**Rollout phase:** Phase A — bugfix category + scope-gated route
**Owns:** `sc1` (BugfixTriageResult)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s2`: The `issue` stage's multi-turn step machinery — its decomposer plan, per-step runners, synthesizer, prompt templates, and the storage/path-scheme/gates wiring plus the review/approve gate for the IssueArtifact — is private to s2. Downstream stories see only the finished, approvable IssueArtifact shape, never how its reproduction/root-cause/fix-intent fields are elicited and synthesized. — owns `sc2`
- `s3`: The tiered resolver internals stay private to s3: the deterministic ref-resolver reuse, the graph code-ownership scoring over candidate stories, the semantic embedding match against epic/story artifacts, the per-tier high-confidence auto-attach thresholds, and the user-prompt interaction and its standalone fallback. Consumers see only the ParentLocation decision (tier + parentRef + confidence + evidence), not the scoring that produced it. — owns `sc3`
- `s4`: The scope-gated orchestration is private to s4: how the chain/orchestrator sequences the bugfix stages (small: issue→build; sized: issue→design→plan→build), how gates.ts enforces an approved+fresh IssueArtifact and a resolved ParentLocation before proceeding, and how the existing post-build code-review is wired as the completion gate. s4 introduces no new shared type — it composes sc1's route, sc2's approved issue, and sc3's parent into the run sequence and reuses the existing build + code-review stages verbatim.
- `s5`: The GitHub integration path is private to s5: rendering the issue body from the IssueArtifact content via the existing tracker create/link surface, linking the created issue to the ParentLocation (or leaving it standalone), closing it on completion, and the tracker-not-configured no-op branch. s5 reuses tracker/github.ts, refs.ts, link.ts, sync.ts, and setup.ts rather than adding any new external path (k5/k6) and defines no new shared type.

## Contract details

**Surface level:** internal-shared

### `routeForSizeClass`

```typescript
export function routeForSizeClass(sizeClass: SizeClass, magnitude?: BugfixMagnitude): TriageRoute
```

**Parameters:**
- `sizeClass: SizeClass` — The classified size tier. Extended union now includes 'bugfix'.
- `magnitude: BugfixMagnitude` _(optional)_ — The bugfix sub-magnitude ('small' | 'sized'). Required when sizeClass === 'bugfix'; ignored (and normally omitted) for the four existing tiers.

**Returns:** `TriageRoute` — The workflow entry for the tier. For 'bugfix': { startStage: 'issue', standalone: true, needsPlan: magnitude === 'sized', producesLld: magnitude === 'sized' }. The four existing tiers return their current literals unchanged.

**Errors:**
- `Error (invariant guard)` when sizeClass === 'bugfix' && magnitude === undefined — a bugfix route requires a magnitude; the function throws rather than silently defaulting, so a magnitude-less bugfix can never route.

**Preconditions:**
- When sizeClass === 'bugfix', magnitude MUST be provided.
- For sizeClass in {epic,feature,small,trivial}, magnitude is not consulted.

**Postconditions:**
- epic/feature/small/trivial return byte-for-byte identical TriageRoute literals to the pre-change function (ac1).
- The switch stays exhaustive over the extended SizeClass union (a compile-time assertNever on the default arm keeps a future member from silently falling through).
- bugfix small -> issue->build (needsPlan:false, producesLld:false); bugfix sized -> issue->design->plan->build (needsPlan:true, producesLld:true) (ac2, k2).

### `buildClassifyPrompt`

```typescript
export function buildClassifyPrompt(input: ClassifyPromptInput): { readonly system: string; readonly user: string }
```

**Parameters:**
- `input: ClassifyPromptInput` — Focus + grounding, extended with a declaredBugfix signal so the classifier knows the request is a user-declared defect fix and must size the magnitude rather than pick from the four feature tiers.

**Returns:** `{ readonly system: string; readonly user: string }` — The classification turn's prompt pair. When declaredBugfix is set, the SYSTEM text instructs the turn to return sizeClass 'bugfix' + a magnitude ('small' vs 'sized'); otherwise it is unchanged from today.

**Preconditions:**
- input.focus is the request text; input.grounding may be empty.

**Postconditions:**
- When input.declaredBugfix is false/absent, the emitted prompt is unchanged from the current four-tier behaviour (ac1).
- When true, the prompt guides the turn to bugfix + magnitude sizing (ac2).

## Data model changes

### `SizeClass` — field-add

Add the 'bugfix' member to the closed union: 'epic' | 'feature' | 'small' | 'trivial' | 'bugfix'. Additive — existing members unchanged.

```
-export type SizeClass = 'epic' | 'feature' | 'small' | 'trivial';
+export type SizeClass = 'epic' | 'feature' | 'small' | 'trivial' | 'bugfix';
```

**Call sites:**
- `src/workflow/triage/classify.ts:29 (routeForSizeClass switch)`
- `src/workflow/seed-focus.ts:79 (specScopeFitsStandalone(sizeClass: SizeClass))`
- `src/workflow/triage/__tests__/classify.test.ts (per-size + loop assertions)`

### `SIZE_CLASSES` — field-add

Append 'bugfix' to the readonly array so it stays in lockstep with the SizeClass union. CLASSIFY_SCHEMA.properties.sizeClass.enum derives from [...SIZE_CLASSES], so the classification schema enum auto-gains 'bugfix'.

```
-export const SIZE_CLASSES: readonly SizeClass[] = ['epic', 'feature', 'small', 'trivial'];
+export const SIZE_CLASSES: readonly SizeClass[] = ['epic', 'feature', 'small', 'trivial', 'bugfix'];
```

**Call sites:**
- `src/workflow/triage/classify.ts:57 (CLASSIFY_SCHEMA sizeClass enum)`
- `src/workflow/triage/__tests__/classify.test.ts (loop over SIZE_CLASSES)`

### `BugfixMagnitude` — new

New type alias `export type BugfixMagnitude = 'small' | 'sized'` in triage/types.ts. 'small' -> skip design (issue->build); 'sized' -> M/L design path (issue->design->plan->build). The single sub-axis that gates the bugfix route.

```
+export type BugfixMagnitude = 'small' | 'sized';
```

**Call sites:**
- `src/workflow/triage/classify.ts (routeForSizeClass bugfix arm; CLASSIFY_SCHEMA magnitude prop)`
- `consumed by s2/s3/s4 via sc1`

### `TriageResult` — field-add

Add `readonly magnitude?: BugfixMagnitude` — present iff sizeClass === 'bugfix'. Optional so the four existing tiers keep emitting today's shape. This realizes sc1's BugfixTriageResult ({ sizeClass:'bugfix', magnitude }) as a discriminated extension of TriageResult rather than a separate type.

```
 export interface TriageResult {
   readonly sizeClass: SizeClass;
   readonly route: TriageRoute;
   readonly rationale: string;
   readonly signals: readonly TriageSignal[];
   readonly storyTitle: string;
+  /** Present iff sizeClass === 'bugfix'; the sub-magnitude that drives the route. */
+  readonly magnitude?: BugfixMagnitude;
 }
```

**Call sites:**
- `consumed by s2/s3/s4 via sc1 (they read sizeClass === 'bugfix' then magnitude)`

### `ClassifyPromptInput` — field-add

Add `readonly declaredBugfix?: boolean` so the classify turn is told the request is a user-declared defect fix (ac1 'a change the user has declared to be a defect fix'). When set, buildClassifyPrompt emits bugfix+magnitude guidance; the caller (insrc_triage) supplies the flag. Default false keeps existing behaviour.

```
 export interface ClassifyPromptInput {
   readonly focus: string;
   readonly grounding: string;
+  /** True when the user has declared the request a defect fix; routes classification to bugfix+magnitude. */
+  readonly declaredBugfix?: boolean;
 }
```

**Call sites:**
- `src/workflow/triage/classify.ts (buildClassifyPrompt / SYSTEM)`

### `CLASSIFY_SCHEMA` — invariant-change

sizeClass enum auto-extends via [...SIZE_CLASSES]. Add an optional `magnitude` property (enum ['small','sized']) and a validation rule that magnitude is REQUIRED when sizeClass === 'bugfix' (and absent otherwise), so a bugfix classification without a magnitude fails schema validation before it can reach routeForSizeClass.

```
 properties: {
   sizeClass: { type: 'string', enum: [...SIZE_CLASSES] },
+  magnitude: { type: 'string', enum: ['small', 'sized'] },
   ...
 }
+ // + conditional: required ['magnitude'] when sizeClass === 'bugfix'
```

**Call sites:**
- `src/workflow/triage/classify.ts:52 (CLASSIFY_SCHEMA)`
- `insrc_triage tool hands this schema to the outer classification turn`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | implements | s1 owns sc1 (BugfixTriageResult). This contract realizes it exactly as the HLD sketch: SizeClass gains 'bugfix', a separate BugfixMagnitude axis is carried as TriageResult.magnitude (present iff bugfix), and routeForSizeClass(sizeClass, magnitude?) returns the scope-gated route (startStage 'issue'; needsPlan/producesLld = magnitude==='sized'). s2/s3/s4 consume this by discriminating on sizeClass === 'bugfix' then reading magnitude/route — no re-design on their side. |

## Error paths

### Error cases

- **A bugfix classification arrives with no magnitude (sizeClass === 'bugfix', magnitude undefined).** (recoverable)
  - Detection: ajv validation of the classification turn against CLASSIFY_SCHEMA fails: the conditional rule 'required [magnitude] when sizeClass === bugfix' rejects the payload before any route is derived. As a defense-in-depth backstop, routeForSizeClass's bugfix arm also checks magnitude and throws rather than defaulting.
  - Response: Reject the classification result; the structured-output retry loop re-prompts the turn (existing ajv+retry path). routeForSizeClass never produces a route from an under-specified bugfix.
  - User impact: The classifier re-runs; the user never sees a bugfix routed without a size. No silent mis-route.
- **The classification turn emits an out-of-enum magnitude (e.g. 'medium') or an out-of-enum sizeClass.** (recoverable)
  - Detection: ajv enum validation on CLASSIFY_SCHEMA.properties.magnitude (enum ['small','sized']) and .sizeClass (enum [...SIZE_CLASSES]) rejects the value.
  - Response: Same structured-output retry path rejects and re-prompts; the value never reaches the typed SizeClass/BugfixMagnitude union at runtime.
  - User impact: Transparent retry; no invalid tier or magnitude propagates downstream.
- **A future SizeClass member is added to the union but no case is added to routeForSizeClass.** (recoverable)
  - Detection: Compile-time: the switch is exhaustive with no fall-through return, so an unhandled member leaves a code path with no return value (and an `assertNever(sizeClass)` default arm makes it a type error).
  - Response: The build fails at tsc rather than shipping a route that returns undefined at runtime.
  - User impact: None at runtime — caught before ship; protects the taxonomy's single-source-of-truth guarantee.

### Edge cases

| Input | Expected |
| :--- | :--- |
| routeForSizeClass called with a magnitude for a non-bugfix size, e.g. routeForSizeClass('small', 'sized'). | magnitude is ignored; returns the current 'small' literal { startStage:'design.story', standalone:true, needsPlan:false, producesLld:true } unchanged. The param is only consulted in the bugfix arm (ac1 preserved for existing tiers). |
| A request the user did NOT declare a defect fix (declaredBugfix false/absent). | buildClassifyPrompt emits today's four-tier prompt unchanged; the classifier cannot pick 'bugfix' as an ordinary sizing outcome, so behaviour is byte-for-byte the current behaviour (ac1). |
| A declared bugfix that the analyze grounding shows is genuinely large (many callers / a schema boundary). | Still sizeClass 'bugfix' (category is user-declared, not sizing-derived) with magnitude 'sized' — routes issue->design->plan->build so the large correction still gets design (ac2, k2). Magnitude, not sizeClass, absorbs the M/L judgment. |
| The sole non-test caller specScopeFitsStandalone is invoked with sizeClass 'bugfix'. | It reads route.standalone which is true for bugfix, so it reports the bugfix as fitting standalone — semantically correct (a bugfix runs outside an Epic DEF/HLD). Its result for the four existing sizes is unchanged. |

### Invariants to preserve

- The four existing tiers must return byte-for-byte identical TriageRoute literals: epic->{define,false,true,true}, feature->{design.story,true,true,true}, small->{design.story,true,false,true}, trivial->{build,true,false,false}. Adding the bugfix arm and the optional magnitude param must not touch these four returns (ac1). [[c1]]
- SIZE_CLASSES must stay in lockstep with the SizeClass union (both gain 'bugfix'), because CLASSIFY_SCHEMA.properties.sizeClass.enum derives from [...SIZE_CLASSES]; drift would let the schema and the type disagree. [[c1]]
- routeForSizeClass stays a pure, exhaustive, no-default switch — the single source of truth for the taxonomy; the bugfix arm must be added as an explicit case, not a default fallthrough. [[c1]]
- The only non-test caller, specScopeFitsStandalone at src/workflow/seed-focus.ts:79-81, reads route.standalone; its behaviour for epic/feature/small/trivial must be unchanged, and the classify.test.ts loop invariants (`standalone === sc!=='epic'`, `producesLld === sc!=='trivial'`) must be re-expressed to accommodate bugfix without weakening the four-tier assertions. [[c2]]

## Test strategy

**Test framework:** `node:test (tsx --test) with node:assert — matches src/workflow/triage/__tests__/classify.test.ts`

### Test levels

- **unit** — Prove routeForSizeClass maps every tier correctly — the four existing tiers byte-for-byte unchanged, and the new bugfix arm gated by magnitude — as a pure table, no LLM.
  - Subjects: `routeForSizeClass('epic'|'feature'|'small'|'trivial') returns the exact current literals (regression)`, `routeForSizeClass('bugfix','small') -> { startStage:'issue', standalone:true, needsPlan:false, producesLld:false }`, `routeForSizeClass('bugfix','sized') -> { startStage:'issue', standalone:true, needsPlan:true, producesLld:true }`, `routeForSizeClass('bugfix') with no magnitude throws (invariant guard)`, `routeForSizeClass('small','sized') ignores magnitude and returns the small literal (param only read on bugfix arm)`, `the classify.test.ts SIZE_CLASSES loop invariants re-expressed so 'bugfix' is covered without weakening `standalone===sc!=='epic'` / `producesLld===sc!=='trivial'` for the four existing tiers`
- **unit** — Prove the classification-schema + prompt changes: bugfix is a valid classification with a required magnitude, and the four-tier behaviour is untouched when the fix is not declared a bugfix.
  - Subjects: `CLASSIFY_SCHEMA validates a { sizeClass:'bugfix', magnitude:'small'|'sized', ... } payload`, `CLASSIFY_SCHEMA REJECTS { sizeClass:'bugfix' } with no magnitude (conditional required)`, `CLASSIFY_SCHEMA rejects an out-of-enum magnitude (e.g. 'medium')`, `CLASSIFY_SCHEMA.sizeClass.enum includes 'bugfix' (auto-derived from SIZE_CLASSES)`, `buildClassifyPrompt({..., declaredBugfix:true}) emits bugfix+magnitude guidance in SYSTEM; buildClassifyPrompt without declaredBugfix emits the current four-tier prompt unchanged`
  - Fixtures: `a minimal ClassifyPromptInput literal`, `a valid + an invalid classification payload for ajv validation`
- **contract** — Prove the sc1 shape other stories consume: TriageResult carries magnitude iff sizeClass==='bugfix', and the route matches the magnitude — the discrimination s2/s3/s4 rely on.
  - Subjects: `A TriageResult with sizeClass 'bugfix' has a magnitude and route.startStage 'issue'`, `A TriageResult with any of the four existing sizes has no magnitude field and its current route`, `BugfixMagnitude type admits exactly 'small' | 'sized'`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `routeForSizeClass('epic'|'feature'|'small'|'trivial') returns the exact current literals (regression)`, `CLASSIFY_SCHEMA.sizeClass.enum includes 'bugfix' as a distinct member alongside the existing four`, `buildClassifyPrompt without declaredBugfix emits the current four-tier prompt unchanged`, `specScopeFitsStandalone behaviour for the four existing sizes is unchanged (route.standalone regression via the routeForSizeClass literals)` |
| `ac2` | `routeForSizeClass('bugfix','small') -> issue/standalone/needsPlan:false/producesLld:false (small skips design)`, `routeForSizeClass('bugfix','sized') -> issue/standalone/needsPlan:true/producesLld:true (M/L gets design->plan)`, `CLASSIFY_SCHEMA validates a bugfix payload with a required magnitude and rejects one without`, `A TriageResult with sizeClass 'bugfix' carries magnitude and a matching route (contract test)` |

## Migration

**State before:** Per s1 structural-map: SizeClass is the four-member closed union 'epic'|'feature'|'small'|'trivial' (types.ts:16) with SIZE_CLASSES the matching array (types.ts:18); routeForSizeClass(sizeClass) (classify.ts:29-44) is a pure exhaustive switch with no default and no magnitude concept; TriageResult (types.ts:46-55) has no magnitude field; CLASSIFY_SCHEMA.sizeClass.enum derives from [...SIZE_CLASSES] and has no magnitude property; buildClassifyPrompt/ClassifyPromptInput carry only focus+grounding and the SYSTEM prompt describes only the four tiers. Per s1 regression-surface: the sole non-test caller is specScopeFitsStandalone (seed-focus.ts:79-81, reads route.standalone) and classify.test.ts asserts per-size routes plus two SIZE_CLASSES loop invariants.

**State after:** SizeClass + SIZE_CLASSES gain 'bugfix'; a new BugfixMagnitude ('small'|'sized') type exists; routeForSizeClass(sizeClass, magnitude?) has a bugfix arm returning { startStage:'issue', standalone:true, needsPlan/producesLld = magnitude==='sized' } and an assertNever default; TriageResult gains optional magnitude (present iff bugfix); CLASSIFY_SCHEMA gains an optional magnitude enum + a conditional-required rule when sizeClass==='bugfix'; ClassifyPromptInput gains optional declaredBugfix and the SYSTEM prompt gains bugfix+magnitude guidance emitted only when declaredBugfix. The four existing tiers are byte-for-byte unchanged; the 'issue' WorkflowName literal is present (per the pending Phase-A enabling amendment).

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the 'issue' string literal to the WORKFLOW_NAMES/WorkflowName closed union (name only) so TriageRoute.startStage can reference it. Gated by the pending HLD amendment (s1 Phase-A enabling change). — ↩ rollbackable _(needs: `bugfixCategory`)_
2. Add 'bugfix' to the SizeClass union and to the SIZE_CLASSES array (kept in lockstep). This auto-extends CLASSIFY_SCHEMA.sizeClass.enum. Additive union growth. — ↩ rollbackable _(needs: `bugfixCategory`)_
3. Add the BugfixMagnitude type alias and the optional TriageResult.magnitude field. — ↩ rollbackable _(needs: `bugfixCategory`)_
4. Widen routeForSizeClass to accept an optional magnitude and add the explicit 'bugfix' case (issue; standalone; needsPlan/producesLld = magnitude==='sized') plus a magnitude-required guard and an assertNever default. Leave the four existing case bodies untouched. — ↩ rollbackable _(needs: `bugfixCategory`)_
5. Add the optional magnitude property + conditional-required rule to CLASSIFY_SCHEMA; add declaredBugfix to ClassifyPromptInput; extend the SYSTEM prompt with bugfix+magnitude guidance emitted only when declaredBugfix is set. — ↩ rollbackable _(needs: `bugfixCategory`)_
6. Update classify.test.ts: re-express the two SIZE_CLASSES loop invariants so 'bugfix' is covered without weakening the four existing tiers, and add the new bugfix route/schema/prompt assertions. — ↩ rollbackable

**Backward compat:** routeForSizeClass and buildClassifyPrompt are existing exported (module-internal) APIs. Both changes are additive and backward-compatible: routeForSizeClass gains an OPTIONAL second param consulted only on the new bugfix arm, so every existing call `routeForSizeClass(sizeClass)` for the four tiers returns byte-for-byte identical results and the sole caller specScopeFitsStandalone is unaffected. buildClassifyPrompt gains an optional declaredBugfix field defaulting to off, so existing callers get the unchanged four-tier prompt. TriageResult.magnitude and CLASSIFY_SCHEMA.magnitude are optional/absent for non-bugfix results. No existing consumer must change. The only non-additive touch is the test file, which is updated in lockstep.

## Alternatives considered

### a1: Magnitude as a companion field + optional route param (the sc1 sketch shape) — **CHOSEN**

Extend SizeClass/SIZE_CLASSES with 'bugfix', add a separate BugfixMagnitude axis carried as an optional field on TriageResult, and widen routeForSizeClass to (sizeClass, magnitude?).

types.ts: SizeClass gains 'bugfix' and SIZE_CLASSES gains 'bugfix'; add `type BugfixMagnitude = 'small' | 'sized'`; TriageResult gains `readonly magnitude?: BugfixMagnitude` (present only when sizeClass === 'bugfix'). classify.ts: routeForSizeClass becomes `routeForSizeClass(sizeClass: SizeClass, magnitude?: BugfixMagnitude): TriageRoute` — the four existing cases return exactly their current literals (magnitude ignored), and a new `case 'bugfix':` reads magnitude to return { startStage: 'issue', standalone: true, needsPlan: magnitude === 'sized', producesLld: magnitude === 'sized' }. The classify LLM turn is told (out of band, by the insrc_triage caller) that the request is a declared defect fix and sizes ONLY the magnitude; sizeClass 'bugfix' + magnitude are validated by CLASSIFY_SCHEMA. Keeps sizeClass a single flat concept exactly as HLD sc1 sketched. Requires the enabling 'issue' WORKFLOW_NAMES member per the backFlowNote.

### a2: Encode magnitude into the SizeClass union as two members

Drop the separate axis: SizeClass gains 'bugfix-small' and 'bugfix-sized' as two members, keeping routeForSizeClass single-arg.

types.ts: SizeClass gains 'bugfix-small' | 'bugfix-sized' (two members) and SIZE_CLASSES gains both; no BugfixMagnitude type, no new TriageResult field. classify.ts: routeForSizeClass keeps its single `(sizeClass)` signature and adds two cases returning { startStage:'issue', standalone:true, needsPlan:false, producesLld:false } for 'bugfix-small' and { ...needsPlan:true, producesLld:true } for 'bugfix-sized'. The classify LLM picks one of the two bugfix members directly.

**Rejected because:** Cheap and ac1/ac2-clean, but VIOLATES the owned contract sc1: downstream consumers expect sizeClass==='bugfix' + a magnitude field, which two union members ('bugfix-small'/'bugfix-sized') do not provide — the discrimination s2/s3/s4 consume breaks and it would force an HLD amendment for a cosmetic simplification.

### a3: Companion field + a dedicated routeForBugfix function

Carry magnitude on TriageResult like a1, but leave routeForSizeClass untouched and add a separate routeForBugfix(magnitude) the caller dispatches to.

types.ts: same as a1 (SizeClass+SIZE_CLASSES gain 'bugfix', add BugfixMagnitude, TriageResult gains optional magnitude). classify.ts: routeForSizeClass keeps its exact current `(sizeClass)` signature and its four cases UNCHANGED; a new `export function routeForBugfix(magnitude: BugfixMagnitude): TriageRoute` returns the issue->build vs issue->design->plan->build routes. The triage orchestration calls routeForBugfix when sizeClass==='bugfix', else routeForSizeClass.

**Rejected because:** Matches sc1's data model and gives the strongest ac1 guarantee, but is only PARTIAL on sc1: adding a second routeForBugfix entry deviates from the single routeForSizeClass(sizeClass, magnitude?) surface the contract sketches and leaks the dispatch decision into callers, splitting the taxonomy's single source of truth.

## Open questions

- HLD amendment (pending approval): s1's bugfix route must return startStage:'issue', but the 'issue' WorkflowName literal is bundled into sc2 (owned by s2, Phase B) while s1 lands alone in Phase A. Proposed fix: move ONLY the bare 'issue' union-member literal into s1/Phase A (storyBoundary.reassignOwnership, additive/non-breaking); sc2 keeps all issue-stage machinery. Alternative: rollout.reorder so s2's union addition precedes s1. Decision needed before build.

## Citations

- **[[c1]]** `analyze-bundle` `s1 structural-map — src/workflow/triage/types.ts:16/18/21-32/46-55, classify.ts:29-44/57` — "SizeClass = 'epic'|'feature'|'small'|'trivial' (types.ts:16); SIZE_CLASSES matching array (types.ts:18); routeForSizeClass is a pure exhaustive switch with no default; CLASSIFY_SCHEMA.sizeClass.enum ="
- **[[c2]]** `analyze-bundle` `s1 regression-surface — src/workflow/seed-focus.ts:79-81, src/workflow/triage/__tests__/classify.test.ts` — "routeForSizeClass has exactly ONE non-test caller: specScopeFitsStandalone (reads route.standalone); classify.test.ts asserts per-size routes plus two SIZE_CLASSES loop invariants."
- **[[c3]]** `code` `src/workflow/types.ts:86 (WorkflowName union) and src/workflow/triage/types.ts:13 (import type WorkflowName)` — "WorkflowName is imported into triage/types.ts and typed on TriageRoute.startStage; 'issue' is not yet a member."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 0 LOW** · model `client` · reviewed 2026-09-18T11:54:46.216Z

_No load-bearing premises were extracted._
