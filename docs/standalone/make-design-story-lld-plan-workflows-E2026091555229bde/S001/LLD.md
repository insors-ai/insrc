<!-- insrc:artifact LLD-55229bde990589c9-S001 -->

# LLD: S001

**Epic:** `make-design-story-lld-plan-workflows`
**HLD base run:** `wf-1789473962568-yt7gvn`
**HLD effective hash:** `55229bde9905...`

## HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## Contract details

**Surface level:** internal

### `extractHldContextSlice`

```typescript
function extractHldContextSlice(hld: HldArtifact, storyId: string): HldContextSlice
```

**Parameters:**
- `hld: HldArtifact` — the approved HLD whose storyBoundaries + sharedContracts are projected
- `storyId: string` — the story to project the slice for

**Returns:** `HldContextSlice` — same slice as today PLUS a new `adjacentBoundaries` field = every storyBoundary whose storyId !== storyId (the current story's siblings)

**Errors:**
- `Error` when the HLD has no storyBoundaries entry for `storyId` (unchanged existing behaviour)

**Postconditions:**
- adjacentBoundaries === hld.body.storyBoundaries.filter(sb => sb.storyId !== storyId) (order preserved; empty when the HLD has a single story)
- The current story's own boundary is EXCLUDED from adjacentBoundaries and still returned as `boundary`
- All existing fields (frameworkSummary, ownedContracts, consumedContracts, boundary, rolloutPhase, nonFunctional) are unchanged
- Signature is unchanged — only the returned object gains a field (backward-compatible for every caller: design-story readUpstream, gates.readPlanUpstream, orchestrator synthesize)

### `renderLldMarkdown`

```typescript
function renderLldMarkdown(artifact: LldArtifact): string
```

**Parameters:**
- `artifact: LldArtifact` — the LLD whose body.hldContextSlice now carries adjacentBoundaries

**Returns:** `string` — LLD markdown; the '## HLD context' section gains an 'Adjacent scope (owned by other stories — do NOT implement here)' subsection listing each adjacentBoundaries entry as `storyId: internal` (+ owns/depends contract ids)

**Postconditions:**
- When adjacentBoundaries is non-empty, the rendered markdown contains the adjacent-scope subsection after Owns/Consumes
- When adjacentBoundaries is empty/absent (standalone or single-story HLD), no subsection is emitted (byte-compatible with today for those artifacts)

### `findAdjacentScopeViolations`

```typescript
function findAdjacentScopeViolations(body: LldArtifact['body'], slice: HldContextSlice): BoundaryFinding[]
```

**Parameters:**
- `body: LldArtifact['body']` — the synthesized LLD body (its interactionWithShared + contractDetails)
- `slice: HldContextSlice` — the story's slice, whose adjacentBoundaries.owns give the shared-contract ids owned by sibling stories

**Returns:** `BoundaryFinding[]` — the deterministic ownership-collision findings: empty when clean; one finding per interactionWithShared entry that claims role:'implements' on a contract id owned by an adjacent boundary (a literal cross-story ownership collision)

**Postconditions:**
- Returns [] when slice.adjacentBoundaries is empty/absent (standalone stories no-op)
- A finding is produced iff body.interactionWithShared has an entry with role==='implements' whose contractId appears in some slice.adjacentBoundaries[i].owns
- Pure + deterministic (no LLM, no I/O); reuses the existing BoundaryFinding shape so the orchestrator routes it through the same boundaryHardFailure(retryable:false) path as the sbdry hard-fails
- Deliberately NARROW: a role:'consumes' on an adjacent-owned contract is legitimate and never flagged

## Data model changes

### `HldContextSlice (interface, src/workflow/artifacts/lld.ts)` — field-add

Add `readonly adjacentBoundaries: readonly StoryBoundary[]` — the sibling stories' boundaries. Additive; auto-propagates into every design.story step + the epic-scoped plan step via the existing verbatim slice injection. StoryBoundary reused from hld.ts.

**Call sites:**
- `src/workflow/artifacts/lld.ts`
- `src/workflow/runners/design-story/index.ts`
- `src/workflow/runners/plan/index.ts`
- `src/workflow/gates.ts`
- `src/workflow/orchestrator.ts`

### `design.story + plan step prompts (anti-overreach HARD RULE)` — invariant-change

Add the anti-overreach HARD RULE to the design.story step prompts + the plan step prompt so the LLM acts on adjacentBoundaries (consume, don't re-design; extend only for genuinely-uncovered capability, and flag as openQuestion/back-flow).

**Call sites:**
- `src/workflow/runners/design-story/index.ts`
- `src/workflow/runners/plan/index.ts`

### `scope-over-reach checklist item sbdry5 + orchestrator wiring` — invariant-change

Add sbdry5 to the checklist.verify prompt + 'sbdry5' to the orchestrator boundaryIds set + sbdry1-5 prose; reuses the existing LLM-judged sbdry hard-fail mechanism.

**Call sites:**
- `src/workflow/runners/design-story/index.ts`
- `src/workflow/orchestrator.ts`

### `deterministic ownership-collision guard (findAdjacentScopeViolations)` — new

New pure function in lld.ts, invoked from the orchestrator LLD validate path; flags an implements-on-adjacent-owned collision via boundaryHardFailure; no-op for standalone.

**Call sites:**
- `src/workflow/artifacts/lld.ts`
- `src/workflow/orchestrator.ts`

## Error paths

### Error cases

- **The current story's own boundary leaks into adjacentBoundaries (self-listing), which would tell the LLM its own scope is off-limits** (recoverable)
  - Detection: extractHldContextSlice's filter predicate is `sb.storyId !== storyId`; a self-listing would surface as the current storyId appearing in adjacentBoundaries — caught by the unit test asserting the current story is excluded
  - Response: Exclude self by construction (strict !== on storyId); a unit test locks the invariant
  - User impact: None when correct; a regression here would wrongly constrain the story's own design — caught by tests before ship
- **The deterministic guard false-positives on a LEGITIMATE consume of a sibling-owned contract** (recoverable)
  - Detection: findAdjacentScopeViolations inspects only interactionWithShared entries with role==='implements'; a role==='consumes' on an adjacent-owned contract is skipped
  - Response: Narrow predicate (implements-only); a unit test asserts a consumes on an adjacent-owned contract yields zero findings
  - User impact: A false hard-fail would block a valid LLD; the narrow predicate prevents it
- **A real cross-story ownership collision is detected (the LLD implements a contract a sibling owns)** (recoverable)
  - Detection: findAdjacentScopeViolations returns non-empty findings during the orchestrator LLD synthesize/validate path
  - Response: Route through boundaryHardFailure (retryable:false); the failure message names the colliding contract + owning sibling and directs the author to consume the contract or raise an HLD amendment (storyBoundary.reassignOwnership) / back-flow instead of implementing it
  - User impact: The LLD is refused until scope is corrected — exactly the intended guardrail; recoverable by re-scoping or amending the HLD
- **The checklist auditor marks sbdry5 as missed (the artifact designs an adjacent story's scope)** (recoverable)
  - Detection: The s8 checklist.verify LLM emits a `missed` verdict for sbdry5; the orchestrator boundaryIds set (now including 'sbdry5') triggers boundaryHardFailure
  - Response: Hard-fail (retryable:false) with the sbdry5 finding; the author re-drives the LLD narrowing to its own boundary + consuming adjacent contracts
  - User impact: The over-reaching LLD is blocked before approval — the intended outcome

### Edge cases

| Input | Expected |
| :--- | :--- |
| A single-story HLD (or a story that is the only boundary) | adjacentBoundaries === [] — renderLldMarkdown emits NO adjacent-scope subsection, findAdjacentScopeViolations returns [], and sbdry5 trivially passes; behaviour is byte-identical to today |
| A standalone (triage-routed) story with no HLD | gates.readPlanUpstream returns hldSlice null and the design.story standalone slice has empty/absent adjacentBoundaries — no adjacent-scope constraints apply (correct: there are no siblings to collide with), no extra HLD read is forced |
| An adjacent boundary OWNS a shared contract that this story legitimately CONSUMES | The guard does not flag it (consumes is allowed), and the prompt HARD RULE explicitly directs the author to consume that contract rather than re-implement it |
| A capability the story genuinely needs is uncovered by its own boundary, every adjacent boundary, and every shared contract | The author MAY extend to cover it, but must record it as an openQuestion / back-flow (not silently build) — sbdry5 passes (it is not adjacent scope), the extension is surfaced in openQuestions |
| A large epic with many stories (adjacentBoundaries is long) | The slice JSON grows by the sibling boundaries (compact {storyId, owns, depends, internal}) injected into each step prompt; acceptable for typical epic sizes, no truncation of the current story's own context |
| The HLD is amended mid-flight (storyBoundary.addStory / reassignOwnership) before the LLD re-runs | adjacentBoundaries is recomputed from the current storyBoundaries on the next extractHldContextSlice call — always reflects the effective HLD |

### Invariants to preserve

- extractHldContextSlice keeps all existing fields (frameworkSummary, ownedContracts, consumedContracts, boundary, rolloutPhase, nonFunctional) and its throw-on-missing-boundary behaviour; adjacentBoundaries is purely additive and the signature is unchanged, so every caller compiles and behaves as before. [[c1]]
- The HldContextSlice continues to be JSON-serialized verbatim into every design.story step's userTurn (context.assemble/alternatives/judge/contract.detail/error.paths/test.strategy/checklist) — the new field must ride that existing injection, not require a new plumbing path. [[c2]]
- Standalone stories still skip the HLD/epic reads in gates.readPlanUpstream (hldSlice null); the adjacentBoundaries addition must never force an HLD read for a standalone story. [[c3]]
- The existing sbdry1-4 hard-fails and the boundaryHardFailure(retryable:false) mechanism are unchanged; adding 'sbdry5' to the boundaryIds set and the synthesize prose only extends the set, and the LLD synthesize still injects hldContextSlice verbatim into body.hldContextSlice. [[c4]]
- renderLldMarkdown output for existing single-story / standalone artifacts stays byte-compatible — the adjacent-scope subsection is emitted only when adjacentBoundaries is non-empty. [[c1]]
- The existing extractHldContextSlice tests (owned+consumed+boundary+phase) continue to pass; the new adjacentBoundaries assertions extend, not replace, them. [[c5]]

## Test strategy

**Test framework:** `node:test (node --test / tsx --test) with node:assert/strict, matching src/workflow/__tests__/lld-artifact.test.ts and the orchestrator/runner workflow tests`

### Test levels

- **unit** — Prove extractHldContextSlice populates adjacentBoundaries correctly (siblings only, self excluded, empty for single-story) and renderLldMarkdown emits/omits the adjacent-scope section, extending the existing lld-artifact.test.ts.
  - Subjects: `extractHldContextSlice(hld, storyId).adjacentBoundaries === storyBoundaries excluding the current story`, `the current story's boundary is NOT in adjacentBoundaries and IS returned as `boundary``, `single-story HLD => adjacentBoundaries === []`, `renderLldMarkdown emits the 'Adjacent scope (owned by other stories — do NOT implement here)' subsection when non-empty, and nothing when empty (byte-compatible)`, `existing extractHldContextSlice fields (owned/consumed/boundary/phase) unchanged`
  - Fixtures: `A multi-story HLD fixture (>=3 storyBoundaries with owns/depends/internal) reusing the existing lld-artifact.test.ts HLD builder`, `A single-story HLD fixture`
- **unit** — Prove the deterministic ownership-collision guard findAdjacentScopeViolations: flags implements-on-adjacent-owned, ignores consumes, no-ops for standalone.
  - Subjects: `findAdjacentScopeViolations flags a body.interactionWithShared entry with role:'implements' whose contractId is in an adjacentBoundaries[i].owns`, `a role:'consumes' on an adjacent-owned contract yields ZERO findings`, `empty/absent adjacentBoundaries (standalone) yields ZERO findings`, `the returned finding uses the existing BoundaryFinding shape`
  - Fixtures: `An LLD body fixture with interactionWithShared entries (implements + consumes) + a slice whose adjacentBoundaries own the referenced contract ids`
- **integration** — Prove the design.story checklist gate + orchestrator wiring: sbdry5 is present in the checklist prompt and a `missed` sbdry5 verdict hard-fails (retryable:false) via the boundaryIds set; and the deterministic guard hard-fails an implements-collision LLD.
  - Subjects: `the design.story checklist.verify step prompt includes sbdry5 (and the anti-overreach HARD RULE appears in the design.story + plan step prompts)`, `orchestrator boundaryIds set includes 'sbdry5' so a missed sbdry5 verdict produces a boundary hard-fail (retryable:false), mirroring the existing sbdry1-4 hard-fail tests`, `an LLD body whose interactionWithShared implements an adjacent-owned contract is rejected via boundaryHardFailure through the synthesize/validate path`, `sbdry1-4 hard-fails still behave unchanged`
  - Fixtures: `A checklist-verdict fixture with sbdry5 missed`, `An epic-scoped LLD synthesize fixture with an adjacent-owned implements collision`, `Reuse of the existing orchestrator sbdry hard-fail test harness`
- **unit** — Prove backward-compatibility / no-op for standalone + single-story: no HLD read forced, no adjacent-scope constraints, render unchanged.
  - Subjects: `gates.readPlanUpstream returns hldSlice null for a standalone story (adjacentBoundaries never forces an HLD read)`, `a standalone LLD renders with no adjacent-scope subsection and passes sbdry5 + the guard trivially`
  - Fixtures: `A standalone (no-HLD) story fixture`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `extractHldContextSlice populates adjacentBoundaries = siblings (self excluded); single-story => []`, `renderLldMarkdown emits the 'scope owned by other stories — do NOT implement here' subsection when adjacentBoundaries is non-empty and omits it when empty` |
| `ac2` | `the design.story + plan step prompts carry the anti-overreach HARD RULE, and the checklist.verify prompt includes sbdry5`, `orchestrator boundaryIds includes 'sbdry5' so a missed sbdry5 hard-fails (retryable:false)`, `findAdjacentScopeViolations flags an implements-on-adjacent-owned collision (and hard-fails via the synthesize path); ignores consumes` |
| `ac3` | `standalone + single-story stories no-op (hldSlice null / adjacentBoundaries []): no adjacent constraints, render byte-compatible, existing sbdry1-4 + extractHldContextSlice tests still pass`, `a genuinely-uncovered capability is allowed to extend but is surfaced in openQuestions rather than silently built (sbdry5 passes; the extension is not adjacent scope)` |

## Migration

**State before:** Per s1: extractHldContextSlice (lld.ts:194) narrows the HLD to ONLY the current story's boundary + owned/consumed contracts; the slice is JSON-serialized verbatim into every design.story step + the epic-scoped plan step, so the authoring LLM never sees sibling boundaries and over-reaches. The s8 checklist enforces sbdry1-4 via the orchestrator boundaryIds set (orchestrator.ts:1479); there is no scope-over-reach gate. renderLldMarkdown emits a '## HLD context' section with no adjacent-scope subsection.

**State after:** The slice carries `adjacentBoundaries` (sibling boundaries), which auto-propagates into every design.story step + the epic-scoped plan step; the step prompts carry an explicit anti-overreach HARD RULE; a new LLM-judged sbdry5 checklist item (hard-fail via the boundaryIds set) plus a deterministic findAdjacentScopeViolations guard reject an LLD that designs/implements an adjacent story's scope; renderLldMarkdown emits the adjacent-scope subsection when non-empty. Standalone + single-story stories are unaffected (adjacentBoundaries empty / hldSlice null).

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the additive `adjacentBoundaries` field to HldContextSlice; populate it in extractHldContextSlice (siblings = storyBoundaries minus the current story); render the 'Adjacent scope — do NOT implement here' subsection in renderLldMarkdown, guarded so it is emitted only when non-empty. — ↩ rollbackable
2. Add the anti-overreach HARD RULE line to the design.story step prompts (context.assemble/alternatives.enumerate/contract.detail/error.paths/checklist.verify) and the plan step prompt. Prompt-text only; no schema change. — ↩ rollbackable
3. Add checklist item sbdry5 to the design.story checklist.verify prompt; add 'sbdry5' to the orchestrator boundaryIds set and update the synthesize prose from sbdry1-4 to sbdry1-5; add findAdjacentScopeViolations and invoke it in the LLD synthesize/validate path, routing non-empty findings through the existing boundaryHardFailure path. — ↩ rollbackable
4. No data migration: existing persisted LLD/HLD artifacts need no backfill — a next design.story run recomputes adjacentBoundaries automatically, and an already-persisted LLD without the field simply renders without the adjacent-scope subsection (renderLldMarkdown + findAdjacentScopeViolations treat an absent/empty adjacentBoundaries as a no-op). Reverting the commit restores prior behaviour. — ↩ rollbackable

**Backward compat:** All symbols are workflow-internal (surfaceLevel internal); no external/public API shape changes. extractHldContextSlice keeps its signature (only the returned object gains a field); renderLldMarkdown and findAdjacentScopeViolations tolerate an absent/empty adjacentBoundaries so LLD JSON persisted before this change still parses and renders unchanged (no adjacent-scope subsection, gate no-ops). The additive field never breaks the verbatim slice injection or the body.hldContextSlice synthesize rule. sbdry1-4 and the boundaryHardFailure mechanism are unchanged — only extended with sbdry5. Full revert of the commit restores prior behaviour with no residual state.

## Alternatives considered

### a1: Slice-propagated adjacent scope + LLM-judged sbdry5

Add adjacentBoundaries to HldContextSlice (auto-propagates to every step prompt), author the anti-overreach HARD RULE into the design.story + plan step prompts, and add a purely LLM-judged sbdry5 scope-over-reach checklist item wired into the orchestrator hard-fail set.



**Rejected because:** Rank 2: covers the dominant semantic failure mode but scores only 'partial' on gating — no deterministic backstop for the unambiguous ownership collision, the one case where certainty is cheap. Strong fallback if surface must be minimised.

### a2: Deterministic-only boundary audit

Skip the LLM sbdry5; instead a code-level audit scans the LLD's contract/interaction for references to a contract the HLD assigns to a different story and hard-fails, plus the adjacentBoundaries context.



**Rejected because:** Rank 3: 'violates' recall — it misses the dominant semantic over-reach (implementing another story's internal scope) and a green gate falsely implies boundary-safety; its one strength (the literal collision check) is subsumed by a3's deterministic guard.

### a3: Hybrid: slice context + LLM-judged sbdry5 (primary) + deterministic ownership-collision guard — **CHOSEN**

a1 in full, PLUS a cheap deterministic guard for the one reliably-catchable case — the LLD implementing/owning a shared contract the HLD assigns to a different story — so the semantic auditor and the literal check cover each other.



## Citations

- **[[c1]]** `analyze-bundle` `s1 symbol.locate — HldContextSlice type + extractHldContextSlice (lld.ts:194) + renderLldMarkdown (lld.ts:220) + StoryBoundary (hld.ts:37); the narrowing point the fix extends` — "extractHldContextSlice(hld, storyId) ... returns owned/consumed contracts + that one boundary + phase — it DROPS every sibling boundary"
- **[[c2]]** `analyze-bundle` `s1 usage.example — the design-story runner injects JSON.stringify(hldSlice) verbatim into every step userTurn (design-story/index.ts), so adjacentBoundaries propagates for free` — "adding `adjacentBoundaries` to the slice surfaces it to all steps automatically — only explicit instruction TEXT (a new HARD RULE) needs authoring"
- **[[c3]]** `analyze-bundle` `s1 usage.example — plan runner + gates.readPlanUpstream: hldSlice null for standalone (gates.ts:324), extractHldContextSlice for epic-scoped (gates.ts:327), injected into the plan step (plan/index.ts:111-112)` — "for a STANDALONE story it returns hldSlice: null ... for an epic-scoped story it calls extractHldContextSlice(hld, storyId)"
- **[[c4]]** `analyze-bundle` `s1 symbol.locate — orchestrator sbdry hard-fail set (orchestrator.ts:1479) + synthesize verbatim rule (:1385/:1394/:1422); the LLM-judged sbdry mechanism sbdry5 extends` — "const boundaryIds = new Set(['sbdry1','sbdry2','sbdry3','sbdry4']) ... Add 'sbdry5' here to make the new scope-over-reach item a hard-fail"
- **[[c5]]** `analyze-bundle` `s1 test.locate — existing extractHldContextSlice tests in lld-artifact.test.ts that the new adjacentBoundaries assertions extend` — "New unit tests extend these: assert adjacentBoundaries = the sibling boundaries (all storyBoundaries except the current)"

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.story (design.story)

**0 HIGH · 7 MED · 0 LOW** · model `client` · reviewed 2026-09-15T12:15:18.390Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| cl1 | citation | MED | manual | extractHldContextSlice + the HldContextSlice interface + renderLldMarkdown live in src/workflow/artifacts/lld.ts, and extractHldContextSlice currently narrows to the single story's boundary (find on storyId), dropping siblings. | lld.ts:194 extractHldContextSlice; :195 `storyBoundaries.find(sb => sb.storyId === storyId)` (the single-story narrowing the fix widens); :31 HldContextSlice interface; :220 renderLldMarkdown — all confirmed. |  |
| cl5 | semantic | MED | manual | StoryBoundary in src/workflow/artifacts/hld.ts is {storyId, owns: string[], depends: string[], internal: string} — the shape adjacentBoundaries reuses. | hld.ts:37 StoryBoundary with owns: readonly string[] (:39, 'shared-contract ids') and internal: string (:41) — the exact shape adjacentBoundaries reuses. |  |
| cl2 | citation | MED | manual | The design-story runner computes hldSlice via extractHldContextSlice and injects JSON.stringify(hldSlice, null, 2) verbatim into every step's userTurn, so a new slice field propagates to all steps. | design-story/index.ts has 5 matches for extractHldContextSlice(hld, storyId) / JSON.stringify(hldSlice — the per-step verbatim slice injection the new field rides for free. |  |
| cl3 | citation | MED | manual | gates.readPlanUpstream returns hldSlice null for a standalone story and extractHldContextSlice(hld, storyId) for an epic-scoped story; the plan runner injects the slice into its step prompt. | gates.ts:316 readPlanUpstream; :324 returns hldSlice:null for standalone; :327 extractHldContextSlice(hld, storyId) for epic-scoped — confirms adjacentBoundaries flows to plan (epic-scoped) and no-ops for standalone. |  |
| cl4 | citation | MED | manual | The design.story checklist hard-fail set in orchestrator.ts is new Set(['sbdry1','sbdry2','sbdry3','sbdry4']) — the set sbdry5 extends — and the LLD synthesize injects hldContextSlice verbatim into body.hldContextSlice. | orchestrator.ts:1479 `new Set(['sbdry1','sbdry2','sbdry3','sbdry4'])` is the design.story s8 hard-fail set sbdry5 extends (the :1215 twin is design.epic s6, correctly not targeted); :464 boundaryHardFailure; :1385 'body.hldContextSlice MUST be verbatim'. |  |
| cl6 | semantic | MED | manual | A BoundaryFinding type exists (the structured scope-boundary audit finding) and is the shape findAdjacentScopeViolations returns + the orchestrator's boundaryHardFailure consumes. | synthesizer.ts:43 `export interface BoundaryFinding` — the existing shape findAdjacentScopeViolations returns and boundaryHardFailure consumes. |  |
| cl7 | citation | MED | manual | src/workflow/__tests__/lld-artifact.test.ts already tests extractHldContextSlice (owned+consumed+boundary+phase) — the tests the new adjacentBoundaries assertions extend. | lld-artifact.test.ts:155 'extractHldContextSlice returns owned + consumed contracts + boundary + phase' + :175 throws-test — the existing suite the new adjacentBoundaries assertions extend. |  |
