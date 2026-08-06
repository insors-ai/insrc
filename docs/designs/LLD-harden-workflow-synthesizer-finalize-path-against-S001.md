<!-- insrc:artifact LLD-c90f3fe60b90dd44-S001 -->

# LLD: S001

**Epic:** `harden-workflow-synthesizer-finalize-path-against`
**HLD base run:** `wf-1786021931426-mnt2ye`
**HLD effective hash:** `c90f3fe60b90...`

## HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## Contract details

**Surface level:** internal

### `safeDeriveSlug`

```typescript
function safeDeriveSlug(focus: string | undefined): string
```

**Parameters:**
- `focus: string | undefined` — The run's focus text (intent.focus). Widened from `string` to `string | undefined` — it is undefined in practice when a run is started without a focus.

**Returns:** `string` — A stable, non-empty display slug. Unchanged for a valid focus (delegates to deriveSlug, else the .slice fallback). NEW: for undefined/empty focus it returns a stable non-empty default (e.g. 'untitled') instead of dereferencing focus.slice and throwing.

**Postconditions:**
- Never throws — for any input (including undefined/'') it returns a non-empty string.
- For a non-empty focus the returned slug is byte-identical to the pre-fix behaviour (deriveSlug, else the lowercased .slice(0,40) fallback).

### `reconcileDependsFromConsumers`

```typescript
function reconcileDependsFromConsumers(body: HldBody): HldBody
```

**Parameters:**
- `body: HldBody` — The synthesized HLD body whose storyBoundaries[].depends may have drifted from sharedContracts[].consumedByStories.

**Returns:** `HldBody` — A NEW HldBody, structurally identical except each storyBoundaries[].depends is replaced by the exact inverse of consumedByStories — for each shared contract sc, every consumer in sc.consumedByStories (excluding sc.ownedByStory self-consumption) gets sc.id added to that story's depends; the result is deduped + sorted. Reuses the exact `expected`-map construction checkContractDependencyGraph's cg3 already performs (hld.ts:486-493), so applying this before cg3 makes cg3 pass by construction.

**Preconditions:**
- Called only after isHldBody(body) passes (the shape is valid).
- consumedByStories is treated as the single source of truth; depends is overwritten, not merged.

**Postconditions:**
- checkContractDependencyGraph(result, epicStories) yields ZERO cg3 issues.
- consumedByStories, sharedContracts, ownedByStory, and every other field are byte-identical to the input — only storyBoundaries[].depends values change.
- cg1 (cycle) and cg2 (downstream) outcomes are UNCHANGED vs the input, because they are computed from consumedByStories + the epic graph, which this helper does not touch.

### `finalizeDesignEpic`

```typescript
function finalizeDesignEpic(intent: WorkflowIntent, stepOutputs: Readonly<Record<string, unknown>>, runId: string, elapsedMs: number, llmResponse: Record<string, unknown>, model: string, attribution?: ArtifactModelAttribution): FinalizeResult
```

**Parameters:**
- `llmResponse: Record<string, unknown>` — The synthesizer response carrying body (HldBody) + citations. The reconcile step operates on body before the graph check.

**Returns:** `FinalizeResult` — Unchanged shape. NEW internal step: after isHldBody(body) passes (~:1193) and before checkContractDependencyGraph (~:1234), body is replaced by reconcileDependsFromConsumers(body). Downstream checks + the rendered/persisted artifact use the reconciled body, so the on-disk depends is always the exact inverse of consumedByStories. checkContractDependencyGraph still runs (cg1/cg2 gate real errors; cg3 now always passes).

**Errors:**
- `'HLD contract dependency graph inconsistent' (schema failure)` when STILL returned for a genuine cg1 cycle or cg2 non-downstream consumer — those are computed from consumedByStories, which reconcile does NOT alter. Only the cg3 (depends drift) sub-case is eliminated by construction.

**Preconditions:**
- epic = requireApprovedEpic(intent.repoPath, epicHash) resolved (unchanged).

**Postconditions:**
- A cg3-only drift no longer aborts the run after 4 retries — finalize succeeds and writes an HLD whose depends is reconciled.
- The persisted HldBody's storyBoundaries[].depends equals the inverse of consumedByStories.

### `applyAmendment (storyBoundary.addConsumer arm)`

```typescript
// existing applier arm at src/workflow/amendments/applier.ts:225 — no signature change
```

**Parameters:**
- `a: StoryBoundaryAddConsumer amendment` — Adds `a.consumer` to `a.contractId`'s consumedByStories. Post-fix, the arm must also keep depends consistent.

**Returns:** `HldBody` — The amended body. NEW: after appending a.consumer to the contract's consumedByStories, the arm reconciles depends (either by adding a.contractId to a.consumer's storyBoundary.depends, or by routing the amended body through reconcileDependsFromConsumers) so the two tables stay inverse-consistent — matching the finalize invariant.

**Preconditions:**
- The contract a.contractId exists and a.consumer is a real story id (existing applier guards, unchanged).

**Postconditions:**
- consumedByStories AND depends both reflect the new consumer edge — no drift introduced by the amendment.

## Data model changes

### `StoryBoundary.depends (src/workflow/artifacts/hld.ts)` — invariant-change

No shape change — depends stays `readonly string[]` (shared-contract ids). The INVARIANT changes from 'the synthesizer must emit depends as the exact inverse of consumedByStories, else cg3 rejects' to 'depends is DERIVED at finalize from consumedByStories (the single source of truth), so it is the exact inverse by construction'. cg3 shifts from a gate that can abort to a post-condition that always holds.

```
hld.ts: + export function reconcileDependsFromConsumers(body: HldBody): HldBody  // reuses the cg3 `expected` map (486-493)
orchestrator.ts finalizeDesignEpic (~:1193..:1234): + const body2 = reconcileDependsFromConsumers(body); // then validate + render body2 instead of body
```

**Call sites:**
- `src/workflow/orchestrator.ts`
- `src/workflow/artifacts/hld.ts`
- `src/workflow/amendments/applier.ts`

### `safeDeriveSlug (src/workflow/orchestrator.ts)` — invariant-change

Param widened `string` -> `string | undefined`; the function now guarantees a non-empty return for ANY input, including undefined/''. deriveSlug (slug.ts) is untouched. The four callers (finalizeDefine:867, finalizeDesignEpic:1224, finalizeDesignStory:1492, finalizeStandaloneLld:1640) pass intent.focus unchanged and compile unchanged (widening is source-compatible).

```
orchestrator.ts:1298: - function safeDeriveSlug(focus: string): string { try { return deriveSlug(focus); } catch { return focus.slice(0,40)... }
+ function safeDeriveSlug(focus: string | undefined): string { if (!focus) return 'untitled'; try { return deriveSlug(focus); } catch { return focus.slice(0,40)... || 'untitled' } }
```

**Call sites:**
- `src/workflow/orchestrator.ts`

## Error paths

### Error cases

- **A genuine cg1 dependency cycle in consumedByStories (two Stories each consume a contract owned by the other).** (recoverable)
  - Detection: checkContractDependencyGraph's cg1 findGraphCycle over the induced consumer->owner graph (hld.ts:463-467) — computed from consumedByStories, which reconcileDependsFromConsumers does NOT modify.
  - Response: finalizeDesignEpic STILL returns the 'HLD contract dependency graph inconsistent' schema failure with the cg1 message. Reconciliation does not mask it — it only touches depends, never consumedByStories or the epic graph.
  - User impact: A real, unbuildable design error is still surfaced with the narrow-consumedByStories fix hint — unchanged from today.
- **A genuine cg2 inversion (a consumer that is NOT downstream of the contract owner in the Epic Story graph).** (recoverable)
  - Detection: checkContractDependencyGraph's cg2 loop (hld.ts:471-483) against transitiveDependents(epicStories) — also computed from consumedByStories + the epic graph, untouched by reconcile.
  - Response: finalizeDesignEpic STILL returns the schema failure with the cg2 re-ownership hint. Only the cg3 (depends drift) sub-case is eliminated by construction.
  - User impact: A Story consuming a contract it cannot legally reach is still caught — unchanged.

### Edge cases

| Input | Expected |
| :--- | :--- |
| The synthesizer emits storyBoundaries[].depends that DRIFTS from consumedByStories (extra edge, missing edge, or a story that consumes nothing but lists a depend). | reconcileDependsFromConsumers overwrites each depends with the exact inverse of consumedByStories BEFORE checkContractDependencyGraph, so cg3 finds zero issues and finalize succeeds — the run no longer aborts after 4 retries. |
| A shared contract whose consumedByStories includes its own ownedByStory (self-consumption). | reconcile skips the self-edge exactly as cg3's expected map does (owner == consumer continue), so the owner's depends does NOT gain its own contract — identical to the validator's expectation. |
| A Story that consumes no contract. | Its depends is set to the empty array [] by reconcile; cg3 passes (nothing expected, nothing present). |
| finalize reached with intent.focus === undefined (a run started without a focus). | safeDeriveSlug(undefined) returns the stable default 'untitled' instead of throwing; finalize proceeds and the artifact carries a non-empty epicSlug. |
| intent.focus is a valid, non-empty string (the normal case). | safeDeriveSlug returns the identical slug it returned before the fix (deriveSlug, else the lowercased .slice(0,40) fallback) — no behavioural change for the happy path. |
| An amendment adds a consumer to a contract (storyBoundary.addConsumer). | The applier appends to consumedByStories AND reconciles depends so the consumer story's depends gains the contract id — the two tables stay inverse-consistent, matching the finalize invariant. |

### Invariants to preserve

- cg1 (acyclicity) and cg2 (downstream-ownership) remain hard-failing semantic gates computed from consumedByStories + the epic Story graph; reconcileDependsFromConsumers touches ONLY storyBoundaries[].depends and must not alter consumedByStories, sharedContracts, ownedByStory, or the cg1/cg2 outcomes. [[c3]]
- The reconciliation MUST use the exact same inverse-of-consumedByStories construction that cg3 already computes (skip self-consumption, dedup) — so reconcile(body) provably makes checkContractDependencyGraph's cg3 pass; the two must not drift apart. [[c3]]
- HldBody's shape is unchanged — depends stays a required readonly string[] of shared-contract ids; only its VALUE at finalize is derived. No emit-schema / isHldBody / renderer change. [[c3]]
- safeDeriveSlug's happy path is byte-identical for a non-empty focus (deriveSlug, else lowercased .slice(0,40)); the guard only adds a stable non-empty default for undefined/'' — the four callers (finalizeDefine, finalizeDesignEpic, finalizeDesignStory, finalizeStandaloneLld) pass intent.focus unchanged. [[c1]]
- The depends/consumedByStories consistency must hold wherever consumedByStories is written — not only at finalize but also in the amendment applier's addConsumer arm — so downstream readers of depends never see a drifted projection. [[c5]]

## Test strategy

**Test framework:** `node:test via `npx tsx --test`, extending src/workflow/__tests__/hld-artifact.test.ts (checkContractDependencyGraph + the new reconcileDependsFromConsumers over hand-built HldBody + EpicStoryDep fixtures) and src/workflow/__tests__/slug.test.ts (safeDeriveSlug undefined/''/valid/throwing-focus cases). Pure functions — no daemon, LLM, or wall-clock.`

### Test levels

- **unit** — Prove the cg3 reconciliation repairs drift while cg1/cg2 still gate, and safeDeriveSlug never throws — all as pure functions over hand-built HldBody fixtures, no daemon/LLM.
  - Subjects: `reconcileDependsFromConsumers(body) with a DRIFTED depends (extra edge / missing edge / story-with-no-consumption listing a depend) -> checkContractDependencyGraph(result).cg3 issues == 0`, `reconcileDependsFromConsumers is a pure inverse: for each contract sc, every non-self consumer's depends gains sc.id; a no-consumption story's depends becomes []; result is deduped+sorted; consumedByStories/sharedContracts/ownedByStory byte-identical to input`, `reconcile does NOT mask a genuine cg1 cycle: a body with two mutually-consuming stories still yields a cg1 issue after reconcile`, `reconcile does NOT mask a genuine cg2 inversion: a consumer not downstream of the owner still yields a cg2 issue after reconcile`, `safeDeriveSlug(undefined) and safeDeriveSlug('') return a stable non-empty default without throwing`, `safeDeriveSlug('a valid focus string') returns the identical slug as before the fix (deriveSlug happy path) and safeDeriveSlug('!!') (deriveSlug throws) returns the lowercased .slice fallback, non-empty`, `the amendment applier storyBoundary.addConsumer arm leaves depends inverse-consistent (the consumer story's depends gains the contract id, matching its updated consumedByStories)`
  - Fixtures: `Hand-built HldBody fixtures in the style of src/workflow/__tests__/hld-artifact.test.ts: a clean 3-story/2-contract body; a drifted-depends variant; a cg1-cycle variant; a cg2-inversion variant`, `An EpicStoryDep[] fixture matching the fixtures so checkContractDependencyGraph's cg2 has a real epic graph`, `A storyBoundary.addConsumer amendment fixture for the applier test`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: safeDeriveSlug(undefined) -> stable non-empty default, no throw`, `unit: safeDeriveSlug('') -> stable non-empty default, no throw`, `unit: safeDeriveSlug(valid focus) byte-identical to pre-fix; safeDeriveSlug('!!') -> non-empty .slice fallback` |
| `ac2` | `unit: reconcileDependsFromConsumers repairs a drifted/omitted depends so checkContractDependencyGraph cg3 == 0`, `unit: reconcile is the exact inverse (per-contract consumer edges, self-skip, dedup+sort, no-consumption story -> []) and leaves consumedByStories/sharedContracts unchanged` |
| `ac3` | `unit: reconcile does NOT mask a genuine cg1 cycle (cg1 issue still raised)`, `unit: reconcile does NOT mask a genuine cg2 non-downstream consumer (cg2 issue still raised)` |
| `ac4` | `unit: the applier storyBoundary.addConsumer arm keeps depends inverse-consistent with the updated consumedByStories` |

## Migration

**State before:** src/workflow/orchestrator.ts + src/workflow/artifacts/hld.ts today: (1) safeDeriveSlug(focus: string) (orchestrator.ts:1298) dereferences focus.slice in its catch, so finalize throws 'Cannot read properties of undefined (reading slice)' when intent.focus === undefined (c1). (2) finalizeDesignEpic (orchestrator.ts:1179) runs checkContractDependencyGraph (:1234), whose cg3 (hld.ts:485-503) REJECTS when storyBoundaries[].depends is not the exact inverse of consumedByStories; the LLM must hand-mirror the two tables across the 8-story fan-out and exhausts all 4 retries. The validator already computes the correct depends deterministically (the `expected` map, hld.ts:486-493) but uses it only to reject, not to repair (c3). The amendment applier's addConsumer arm (applier.ts:225) appends to consumedByStories without mirroring depends (c5).

**State after:** (1) safeDeriveSlug accepts string | undefined and returns a stable non-empty default for undefined/'' before touching .slice — finalize never throws on a missing focus; the happy path is byte-identical (c1). (2) finalizeDesignEpic derives depends deterministically: reconcileDependsFromConsumers(body) rebuilds each storyBoundaries[].depends as the exact inverse of consumedByStories (reusing cg3's own `expected` construction) BEFORE checkContractDependencyGraph, so cg3 passes by construction and design.epic no longer aborts on drift; cg1/cg2 still gate genuine cycles/inversions (c3). The amendment applier keeps depends inverse-consistent when it adds a consumer (c5).

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Widen safeDeriveSlug's parameter from `focus: string` to `focus: string | undefined` and add a leading guard that returns a stable non-empty default (e.g. 'untitled') when focus is undefined/empty, before deriveSlug or .slice is reached. Leave the deriveSlug happy path + the .slice fallback (now guarded by a non-empty focus) intact. — ↩ rollbackable
2. Add an exported pure helper reconcileDependsFromConsumers(body: HldBody): HldBody in src/workflow/artifacts/hld.ts that rebuilds each storyBoundaries[].depends as the exact inverse of consumedByStories — reusing the same construction cg3's `expected` map already performs (skip self-consumption, dedup, sort) — returning a new body with consumedByStories/sharedContracts/ownedByStory untouched. — ↩ rollbackable
3. In finalizeDesignEpic, after isHldBody(body) passes and before checkContractDependencyGraph, replace body with reconcileDependsFromConsumers(body) so all downstream validation, rendering, and persistence use the reconciled body. checkContractDependencyGraph still runs unchanged (cg1/cg2 gate real errors; cg3 is now always satisfied). — ↩ rollbackable
4. Update the amendment applier's storyBoundary.addConsumer arm (applier.ts:225) to keep depends inverse-consistent after appending a consumer to consumedByStories — either add the contract id to the consumer story's storyBoundary.depends or route the amended body through reconcileDependsFromConsumers. — ↩ rollbackable
5. Extend src/workflow/__tests__/slug.test.ts (safeDeriveSlug undefined/''/valid/throwing-focus) and src/workflow/__tests__/hld-artifact.test.ts (reconcile repairs cg3 drift; cg1 cycle + cg2 inversion still reject after reconcile; applier keeps depends consistent). — ↩ rollbackable

**Backward compat:** safeDeriveSlug is an internal helper; widening its param to string | undefined is source-compatible with all four callers (finalizeDefine:867, finalizeDesignEpic:1224, finalizeDesignStory:1492, finalizeStandaloneLld:1640), which pass intent.focus unchanged, and its output is byte-identical for any non-empty focus. reconcileDependsFromConsumers is a NEW additive export — no existing signature changes. HldBody's shape is unchanged (depends stays a required readonly string[]); only the depends VALUE written at finalize is now derived rather than trusted, so any previously-VALID HLD (whose depends already equalled the inverse) is byte-identical, and any previously-INVALID (drifted) HLD that would have aborted now finalizes with a corrected depends. No IPC/schema/emit-schema change; existing approved HLD artifacts on disk are unaffected (they are not re-finalized).

## Alternatives considered

### a1: Guard safeDeriveSlug + derive depends in finalizeDesignEpic (reuse the validator's expected map) — **CHOSEN**

Widen safeDeriveSlug to accept undefined (stable default before .slice), and in finalizeDesignEpic rebuild each storyBoundary.depends as the exact inverse of consumedByStories via a shared helper before checkContractDependencyGraph runs.

Fix 1: change safeDeriveSlug(focus: string) to (focus: string | undefined); at the top, if focus is undefined/empty, return a stable non-empty default (e.g. 'untitled') so neither deriveSlug nor .slice ever sees undefined. All four callers pass intent.focus unchanged. Fix 2: export the inverse computation as a tiny pure helper (e.g. reconcileDependsFromConsumers(body): HldBody) placed alongside checkContractDependencyGraph in hld.ts — it reuses the exact `expected` construction (skip self-consumption, dedup, sort) that cg3 already performs, returning a new HldBody with each storyBoundary.depends replaced by its derived set. finalizeDesignEpic calls it right after isHldBody passes and before checkContractDependencyGraph, so cg3 is satisfied by construction. cg1/cg2 run unchanged over consumedByStories + the epic graph. The amendment applier's addConsumer path also calls the same helper (or appends the mirrored depends edge) to stay consistent.

### a2: Relax cg3 to a warning + guard slug inline

Leave depends as the LLM emitted it but downgrade cg3 from a hard reject to a non-blocking warning (keep cg1/cg2 hard); guard safeDeriveSlug inline.

Fix 1 identical to a1. Fix 2: instead of reconciling, change finalizeDesignEpic so cg3 issues are collected but do NOT fail the finalize (cg1/cg2 still fail). The emitted depends is persisted as-is even if it drifts from consumedByStories.

**Rejected because:** Cheapest but violates table consistency — downgrading a correctness check to a warning contradicts 'accuracy is primary'; it stops checking rather than repairing (rank 2).

### a3: Force the synthesizer to omit depends + always derive it

Drop depends from the synthesizer output schema entirely and always compute it at finalize from consumedByStories.

Fix 1 identical to a1. Fix 2: remove depends from the design.epic emit schema so the LLM never emits it, and populate it purely from consumedByStories at finalize. cg3 becomes vacuous (or is removed).

**Rejected because:** Reaches the same end-state as a1 but only by changing the emit schema (M cost, wide blast radius) — unnecessary churn when a1 achieves it with the shape unchanged (rank 3).

## Citations

- **[[c1]]** `analyze-bundle` `s1 usage.example — safeDeriveSlug crash on undefined focus (src/workflow/orchestrator.ts:1298)` — "the catch dereferences `focus.slice`, so when finalize is reached with intent.focus === undefined the fallback itself throws 'Cannot read properties of undefined (reading slice)'. Called from finalize"
- **[[c2]]** `analyze-bundle` `s1 symbol.locate — deriveSlug (src/workflow/slug.ts:40)` — "deriveSlug turns a focus string into a display slug and THROWS on a too-short / all-stopword focus ... The fix stays entirely inside safeDeriveSlug (orchestrator.ts) — deriveSlug itself is untouched."
- **[[c3]]** `analyze-bundle` `s1 data-model.trace + usage.example — checkContractDependencyGraph cg1/cg2/cg3 + the expected map (src/workflow/artifacts/hld.ts:447,485-503, orchestrator.ts:1179)` — "cg3 (485-503) builds an `expected` map (486-493) as the exact inverse of consumedByStories, then flags any storyBoundary.depends that differs ... Because `expected` is already the deterministic ground"
- **[[c4]]** `analyze-bundle` `s1 test.locate — src/workflow/__tests__/hld-artifact.test.ts + slug.test.ts` — "hld-artifact.test.ts already exercises checkContractDependencyGraph (cg1 cycle, cg2 downstream, cg3 inverse) over hand-built HldBody fixtures ... slug.test.ts exercises deriveSlug/safeDeriveSlug. Fram"
- **[[c5]]** `analyze-bundle` `s1 symbol.locate — amendment applier addConsumer arm (src/workflow/amendments/applier.ts:225)` — "it appends to consumedByStories but does NOT mirror the edge into the consumer story's depends. Post-fix, depends is a derived projection, so an amendment that adds a consumer must also add the contra"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 9 LOW** · model `client` · reviewed 2026-08-06T13:19:14.432Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| cl1 | citation | LOW | auto | safeDeriveSlug is defined in src/workflow/orchestrator.ts and its catch fallback dereferences focus.slice (crash on undefined focus). | read orchestrator.ts:1298 -> FOUND `function safeDeriveSlug(focus: string): string {`; grep confirms the `return focus.slice(0, 40)` fallback exists — the undefined-crash site is real. | None — citation verified. |
| cl2 | citation | LOW | auto | safeDeriveSlug is called by four finalize arms passing intent.focus: finalizeDefine, finalizeDesignEpic, finalizeDesignStory, finalizeStandaloneLld. | grep `safeDeriveSlug(intent.focus)` -> 6 matches; reads confirm the finalizeDesignEpic (:1224) and finalizeStandaloneLld (:1640) call sites verbatim. | None — all four caller sites are real. |
| cl3 | citation | LOW | auto | deriveSlug is defined in src/workflow/slug.ts and takes a string focus (the slugger safeDeriveSlug wraps; untouched by this story). | read slug.ts:40 -> FOUND `export function deriveSlug(focus: string): string {` — the wrapped slugger is real and untouched. | None — citation verified. |
| cl4 | citation | LOW | auto | checkContractDependencyGraph in src/workflow/artifacts/hld.ts computes cg3's `expected` map as the exact inverse of consumedByStories (skip self-consumption) and flags depends drift. | checkContractDependencyGraph + the `const expected: Record<string, Set<string>>` map + the cg3 'exact inverse of consumedByStories' message all resolve (hld.ts:486, :501). The deterministic expected-map the reconcile reuses is real. | None — the cg3 expected-map construction is confirmed. |
| cl5 | citation | LOW | auto | cg1 (findGraphCycle) and cg2 (transitiveDependents downstream check) are computed from consumedByStories + the epic graph in checkContractDependencyGraph — the semantic gates the reconcile must not affect. | hld.ts:464 findGraphCycle (cg1) + :470 transitiveDependents (cg2) confirmed — both computed from consumedByStories/epic graph, so the reconcile (depends-only) provably leaves them unchanged. | None — semantic premise verified. |
| cl6 | semantic | LOW | auto | StoryBoundary.depends is a readonly string[] of shared-contract ids and consumedByStories is a readonly string[] of story ids — the two inverse tables; HldBody shape is unchanged by this story. | hld.ts:40 `readonly depends: readonly string[]; // shared-contract ids` + :33 `readonly consumedByStories: readonly string[]; // story ids` — the two inverse tables exist with the stated shapes; no shape change needed. | None — citation verified. |
| cl7 | citation | LOW | auto | finalizeDesignEpic in src/workflow/orchestrator.ts calls checkContractDependencyGraph and rejects with 'HLD contract dependency graph inconsistent' — the site where reconcile is inserted before the check. | finalizeDesignEpic + `checkContractDependencyGraph(body, epic.body.stories)` at orchestrator.ts:1234 + the 'HLD contract dependency graph inconsistent' rejection all resolve — the insertion site (before this call) is real. | None — the reconcile insertion site is confirmed. |
| cl8 | citation | LOW | auto | The amendment applier's storyBoundary.addConsumer arm (src/workflow/amendments/applier.ts) appends to consumedByStories without mirroring depends — the consistency site this story updates. | applier.ts:229 `c.id === a.contractId ? { ...c, consumedByStories: [...c.consumedByStories, a.consumer] } : c` — the addConsumer arm appends to consumedByStories without mirroring depends, exactly as described. | None — the applier consistency site is real. |
| cl9 | citation | LOW | auto | The test suites the new tests extend exist: src/workflow/__tests__/hld-artifact.test.ts (checkContractDependencyGraph) and src/workflow/__tests__/slug.test.ts (deriveSlug/safeDeriveSlug). | Both test suites exist (hld-artifact.test.ts + slug.test.ts) and heavily reference checkContractDependencyGraph/deriveSlug (34 hits each) — the patterns the new tests extend are real. | None — the test subjects are confirmed. |
