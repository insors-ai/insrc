<!-- insrc:artifact LLD-abd1ecf6a5f5063e-s9 -->

# LLD: E20260802abd1ecf6:S009

**Epic:** `frame-epic-new-pre-workflow-brainstorm`
**HLD base run:** `wf-1785587820064-46kctq`
**HLD effective hash:** `688a10691972...`

## HLD context

**Framework:** Brainstorm ships as a first-class workflow stage (alternative a1): a peer runner directory src/workflow/runners/brainstorm/ that self-registers through the existing executor registry and workflow/index.ts registerWorkflowRunners; a new persisted SpecArtifact peer file in src/workflow/artifacts/ with a specArtifactPaths peer in storage.ts (hash-addressed, listed, approval-stamped identically to DEF/HLD/LLD/PLAN); and an additive elicitation phase on the existing insrc_workflow_step MCP surface that reuses state-store.ts and the questions-gate primitive and preserves the opaque state token verbatim. The single cross-cutting SpecArtifact shape (intent, scope boundary, non-goals, decisions-with-ruled-out-alternatives, open items) is read unchanged by both define (s8) and standalone design.story (s9). Nothing touches the shared/chat-agent brainstorm.addIdea stub.
**Rollout phase:** Phase D — Seed the downstream stages
**Consumes:** `sc1` (SpecArtifact record + hash-addressed persistence), `sc4` (Approved-spec-as-focus consumption contract)

## Contract details

**Surface level:** internal-shared

### `specScopeFitsStandalone`

```typescript
function specScopeFitsStandalone(sizeClass: SizeClass): boolean
```

**Parameters:**
- `sizeClass: SizeClass` — The size the triage classifier assigned to the seeded spec framing.

**Returns:** `boolean` — true when the size routes to the standalone design.story stage (feature | small), false when it belongs elsewhere (epic -> define; trivial -> build). The pure, deterministic ac3 core: `routeForSizeClass(sizeClass).startStage === 'design.story'`.

**Preconditions:**
- sizeClass is a member of SIZE_CLASSES

**Postconditions:**
- Pure + total over SizeClass; no side effects

### `routeForSizeClass`

```typescript
function routeForSizeClass(sizeClass: SizeClass): TriageRoute
```

**Parameters:**
- `sizeClass: SizeClass` — The classified size tier.

**Returns:** `TriageRoute` — The existing triage route table (classify.ts): epic -> { startStage:'define', standalone:false }, feature/small -> { startStage:'design.story', standalone:true }. Consumed unchanged by specScopeFitsStandalone.

**Preconditions:**
- Existing triage capability (s7-independent, predates this Epic)

**Postconditions:**
- Unchanged — s9 reads it, does not modify it

### `resolveStageFocus`

```typescript
function resolveStageFocus(repoPath: string, focus: string, params: Record<string, unknown>): { readonly focus: string; readonly seededFromSpec?: string }
```

**Parameters:**
- `params: Record<string, unknown>` — Standalone start params; carries the optional specHash + standalone:true.

**Returns:** `{ focus: string; seededFromSpec?: string }` — The shared s8 seeding helper, UNCHANGED. Already called by start.ts/workflow-rpc.ts for every start, so a standalone start with params.specHash gets the composed spec framing (ac1/ac2) and a plain start is a passthrough (ac4). s9 adds no code here.

**Errors:**
- `SpecNotApprovedError` when unapproved specHash (from requireApprovedSpec)
- `SpecArtifactNotFoundError` when missing specHash

**Preconditions:**
- Shipped in s8

**Postconditions:**
- No change in s9

### `finalizeStandaloneLld`

```typescript
function finalizeStandaloneLld(intent: WorkflowIntent, ...): FinalizeResult
```

**Parameters:**
- `intent: WorkflowIntent` — Carries params.specHash (the seed) so the standalone LLD meta can be stamped.

**Returns:** `FinalizeResult` — Unchanged shape; the LLD meta it builds (orchestrator.ts:1660, already carrying standalone:true + sizeClass) now ALSO spreads seededFromSpec = intent.params.specHash when present, mirroring s8's finalizeDefine. renderLldMarkdown surfaces it (ac-parity with s8 provenance).

**Preconditions:**
- Existing standalone finalizer (orchestrator.ts:1629)

**Postconditions:**
- meta.seededFromSpec identifies the source spec on a seeded standalone LLD; absent on a plain-focus run (ac4)

## Data model changes

### `LldArtifact.meta.seededFromSpec (standalone path)` — invariant-change

No new field — ArtifactMetaBase.seededFromSpec was added in s8. s9 extends WHERE it is written: finalizeStandaloneLld now stamps it (from intent.params.specHash) so a spec-seeded standalone LLD carries the same provenance a spec-seeded DEF does. Additive + optional; absent on a plain-focus standalone run (the plain path is byte-identical). renderLldMarkdown surfaces it.

**Call sites:**
- `src/workflow/orchestrator.ts`
- `src/workflow/artifacts/lld.ts`
- `src/workflow/types.ts`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc4` | consumes | Consumes sc4 via the shared resolveStageFocus already wired into the start seam (s8) — a standalone start with params.specHash gets the approved spec's composed framing (ac1/ac2), refusing an unapproved spec (k12). s9 adds no new consumption path; it verifies the standalone route + adds the ac3 scope guard + provenance stamp. s9 owns no contract. |
| `sc1` | consumes | Reads the shipped s6 SpecArtifactBody through the same composeSpecFocus (intent/scope/nonGoals/decisions[].chosen). No differently-shaped spec is required for the standalone route (ac2) — the single cross-cutting record serves both consumers. |

## Error paths

### Error cases

- **A standalone feature design is seeded from a spec whose agreed scope is plainly larger than a single feature (sizes as epic).** (recoverable)
  - Detection: The seeded framing is sized by the triage classifier and specScopeFitsStandalone(size) returns false (routeForSizeClass(size).startStage !== 'design.story' — epic routes to define).
  - Response: Surface the mismatch to the user ('this spec's scope sizes as <epic> — it belongs in `define`, not a standalone feature design') and do NOT proceed into the standalone LLD; the scope is never silently narrowed to fit (ac3, k13).
  - User impact: The user is told the spec is too big for the single-feature route and pointed at define, instead of getting a design that quietly drops part of the agreed scope.
- **A standalone design.story is seeded from an unapproved or missing spec.** (recoverable)
  - Detection: resolveStageFocus (s8) calls requireApprovedSpec, which throws SpecNotApprovedError (unset approvedAt) / SpecArtifactNotFoundError (no such spec).
  - Response: The seeded start aborts before the LLD runs; the sc4 error propagates (rides the s8 behavior — no new handling in s9).
  - User impact: The user is told the spec must be approved / does not exist, rather than designing from an unapproved seed (k12).

### Edge cases

| Input | Expected |
| :--- | :--- |
| A plain focus string and no params.specHash on the standalone route. | resolveStageFocus is a pure passthrough and no scope guard runs (the guard only fires when seeded from a spec); the standalone stage behaves exactly as today (ac4, c34). |
| An approved spec that sizes as feature or small. | specScopeFitsStandalone(size) is true (routeForSizeClass -> design.story); the standalone design proceeds from the spec framing (ac1) and finalizeStandaloneLld stamps meta.seededFromSpec. |
| The SAME approved spec started once via define (Epic) and once via standalone design.story. | Both read the identical SpecArtifact through the same composeSpecFocus — same statement of intent, no differently-shaped spec required (ac2). |
| A spec that sizes as trivial seeded into a standalone design.story. | specScopeFitsStandalone('trivial') is false (routeForSizeClass -> build, not design.story) — the mismatch is surfaced (an LLD is not the right route for a trivial change) rather than silently produced. |

### Invariants to preserve

- The plain-focus standalone path is byte-identical — when no specHash is supplied the scope guard never runs and the standalone stage's behaviour + outputs are exactly as today (the spec is an ADDITIONAL input only). [[c21]]
- The seeding helper + the spec record are stage-neutral — the standalone route reuses the same resolveStageFocus/composeSpecFocus over the same SpecArtifact shape as define; no consumer-specific variant. [[c11]]
- Scope size is judged by the framework's ONE sizing authority (the triage classifier + routeForSizeClass), not a cheap heuristic, and a too-large scope is surfaced rather than narrowed — accuracy is not traded on the critical design path. [[c17]]

## Test strategy

**Test framework:** `node:test + node:assert/strict, run via `npx tsx --test` (project convention; extends the s8 seed-focus.test.ts fixture pattern in src/workflow/__tests__/)`

### Test levels

- **unit** — Prove the ac3 scope guard: specScopeFitsStandalone is true for feature/small and false for epic/trivial (mismatch surfaced, never narrowed), grounded on the same routeForSizeClass table triage uses.
  - Subjects: `specScopeFitsStandalone`, `routeForSizeClass (triage)`
  - Fixtures: `the SizeClass enum (SIZE_CLASSES) — no I/O needed; a pure-function table test`
- **unit** — Prove provenance parity: a spec-seeded standalone design.story finalize stamps meta.seededFromSpec + renderLldMarkdown surfaces it; a plain-focus standalone run leaves it unset (ac4).
  - Subjects: `finalizeStandaloneLld (orchestrator.ts)`, `renderLldMarkdown (lld.ts)`, `LldArtifact.meta.seededFromSpec`
  - Fixtures: `a standalone design.story stepOutputs fixture + a standalone intent (params.standalone:true, storyId) with params.specHash set vs unset`
- **unit** — Prove ac1/ac2/ac4 for the standalone route ride the shared s8 helper: resolveStageFocus over a standalone param bag with an approved spec yields the same composed framing as the define route; plain focus is a passthrough.
  - Subjects: `resolveStageFocus (shared, s8)`, `composeSpecFocus (shared, s8)`
  - Fixtures: `the s8 tmp-repo + approved SPEC-*.json fixture (specArtifactPaths + writeAtomic + approveArtifactByJsonPath)`, `a standalone param bag {standalone:true, specHash} vs a plain {standalone:true} bag`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: resolveStageFocus on a standalone param bag with an approved specHash returns a composed focus containing the spec's intent/scope/decisions (design proceeds from the spec, not a one-liner)` |
| `ac2` | `unit: resolveStageFocus produces the byte-identical composed focus for the SAME approved spec whether the param bag is the define shape or the standalone shape (same statement of intent; same SpecArtifact shape, no consumer-specific variant)` |
| `ac3` | `unit: specScopeFitsStandalone('epic') === false and specScopeFitsStandalone('trivial') === false (mismatch surfaced) while 'feature'/'small' === true — the guard fires for a too-large spec rather than narrowing` |
| `ac4` | `unit: resolveStageFocus on a standalone param bag with NO specHash returns the plain focus verbatim + seededFromSpec unset; finalizeStandaloneLld leaves meta.seededFromSpec unset on a plain-focus standalone run` |

## Alternatives considered

### a1: Classifier-fed scope guard (reuse triage sizer) + provenance parity — **CHOSEN**

A pure specScopeFitsStandalone(sizeClass) guard (routeForSizeClass(sizeClass).startStage === 'design.story') fed by the existing triage classifier over the seeded spec framing; surfaces a mismatch when the spec sizes epic, and stamps meta.seededFromSpec on the standalone LLD.



### a2: Deterministic heuristic on the spec body (no classifier)

Infer scope-too-large from a deterministic signal on the SpecArtifact body (e.g. decisions/non-goals count or category) instead of the triage classifier.



**Rejected because:** Only PARTIAL on ac3 (a count/category heuristic is a poor proxy for scope size — misjudges the very 'plainly larger than a feature' case) and VIOLATES k13: it trades accuracy for a cheap heuristic on the critical design path and forks a second, divergent sizing notion from the triage sizer the rest of the framework trusts.

### a3: Provenance stamp only — no scope guard

Add only the meta.seededFromSpec stamp; rely on triage/the user to have sized correctly upstream, with no standalone-start mismatch check.



**Rejected because:** VIOLATES ac3 outright — a user who directly starts a standalone feature design from an epic-scoped spec gets the scope silently narrowed with no mismatch surfaced, exactly what ac3 forbids; ac3 is s9's net-new value beyond s8.

## Citations

- **[[c1]]** `code` `src/workflow/seed-focus.ts` — "The shared s8 resolveStageFocus/composeSpecFocus, wired unconditionally into start.ts — a standalone start with params.specHash already gets the composed spec framing (ac1/ac2/ac4 ride this)."
- **[[c2]]** `code` `src/workflow/orchestrator.ts` — "finalizeStandaloneLld (:1629; meta at :1660 carries standalone:true + sizeClass) — s9 spreads seededFromSpec from intent.params.specHash for provenance parity with finalizeDefine."
- **[[c3]]** `code` `src/workflow/triage/classify.ts` — "routeForSizeClass: the pure size->route table (epic->define, feature/small->design.story) that specScopeFitsStandalone compares against for the ac3 guard."
- **[[c4]]** `code` `src/workflow/triage/types.ts` — "SizeClass / SIZE_CLASSES — the size vocabulary specScopeFitsStandalone is total over."
- **[[c5]]** `code` `src/workflow/artifacts/lld.ts` — "renderLldMarkdown surfaces meta.seededFromSpec on a seeded standalone LLD (mirroring renderDefineMarkdown's Seeded-from header)."
- **[[c11]]** `prior-artifact` `DEF-abd1ecf6a5f5063e:k1` — "The artifact is a cross-cutting contract consumable as focus by BOTH define and standalone design.story, not specialised to either — the seeding helper + spec record are stage-neutral."
- **[[c17]]** `prior-artifact` `DEF-abd1ecf6a5f5063e:k13` — "Accuracy governs this stage: it must not trade correctness for cheaper calls — scope size is judged by the framework's one sizing authority, and a too-large scope is surfaced, never narrowed."
- **[[c21]]** `prior-artifact` `DEF-abd1ecf6a5f5063e:c34` — "The spec is an ADDITIONAL input to the standalone feature-design stage; its behaviour + outputs given a plain focus string are unchanged."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 7 LOW** · model `client` · reviewed 2026-08-02T12:52:35.560Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| sc4 | citation | LOW | manual | seed-focus.ts (s8) exports resolveStageFocus + composeSpecFocus — the shared helper the standalone route reuses (ac1/ac2/ac4). | CONFIRMED: src/workflow/seed-focus.ts:49 export function composeSpecFocus + :73 export function resolveStageFocus — the shared s8 helper the standalone route reuses. | none — verified sound. |
| s9 | citation | LOW | manual | finalizeStandaloneLld exists in orchestrator.ts (the standalone LLD finalizer s9 stamps seededFromSpec into). | CONFIRMED: src/workflow/orchestrator.ts:1629 function finalizeStandaloneLld — the standalone LLD finalizer s9 stamps seededFromSpec into. | none — verified sound. |
| ac3 | citation | LOW | manual | routeForSizeClass exists in triage/classify.ts and maps epic->define / feature\|small->design.story — the ac3 guard's route table. | CONFIRMED: src/workflow/triage/classify.ts:29 routeForSizeClass; :33 epic->startStage 'define' (standalone:false); :36/:39 feature/small->startStage 'design.story' (standalone:true) — the ac3 guard's route table. | none — verified sound. |
| ac3 | citation | LOW | manual | SizeClass / SIZE_CLASSES are defined in triage/types.ts — the size vocabulary specScopeFitsStandalone is total over. | CONFIRMED: src/workflow/triage/types.ts:16 type SizeClass = 'epic'\|'feature'\|'small'\|'trivial' + :18 SIZE_CLASSES — the size vocabulary specScopeFitsStandalone is total over. | none — verified sound. |
| s9 | citation | LOW | manual | renderLldMarkdown exists in artifacts/lld.ts — where the seeded-from provenance is surfaced on the standalone LLD. | CONFIRMED: src/workflow/artifacts/lld.ts:220 export function renderLldMarkdown — where the seeded-from provenance is surfaced on the standalone LLD. | none — verified sound. |
| dataModel | semantic | LOW | manual | ArtifactMetaBase.seededFromSpec already exists (added in s8) — s9 only extends WHERE it is written (no new field). | CONFIRMED: src/workflow/types.ts:347 readonly seededFromSpec?: string — the field already exists (added in s8, also used by artifacts/define.ts:97). s9 only extends where it is written; no new field. | none — verified sound. |
| boundary | cross-artifact | LOW | manual | The HLD assigns s9 no owned contracts and lists it as consumer of sc1 + sc4, matching this LLD (owns=[], consumes sc1/sc4). | Confirmed by direct read this session of .insrc/artifacts/HLD-abd1ecf6a5f5063e.json: the s9 storyBoundary is owns=[], depends [sc1, sc4], matching this LLD. The probe returned 0/not-found because its regex used \\s* against the 2-space-indented JSON and the scan is scoped to src/ (the artifact lives under .insrc/), not because the ownership differs. | none — cross-artifact ownership matches the HLD. |
