<!-- insrc:artifact PLAN-55229bde990589c9-S001 -->

# Plan: S001

**Epic:** `make-design-story-lld-plan-workflows`
**LLD run:** `wf-1789473962568-yt7gvn`
**LLD effective hash:** `55229bde9905...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** adjacentBoundaries on HldContextSlice + extractor + render section | M | — | unit: extractHldContextSlice populates adjacentBoundaries = siblings, excluding the current story (order preserved); unit: the current story's own boundary is excluded from adjacentBoundaries and still returned as `boundary`; existing owned/consumed/boundary/phase fields unchanged; unit: single-story HLD => adjacentBoundaries === []; unit: renderLldMarkdown emits the adjacent-scope subsection when adjacentBoundaries non-empty and nothing when empty (byte-compatible) | [[c1]] [[c2]] |
| 2 | **`t2`** Anti-overreach HARD RULE (shared constant) in the design.story + plan step prompts | S | `t1` | integration: the anti-overreach HARD RULE (ANTI_OVERREACH_RULE) appears in each of the five design.story step prompts and the plan step prompt | [[c3]] |
| 3 | **`t3`** sbdry5 checklist gate + deterministic findAdjacentScopeViolations guard + orchestrator wiring | M | `t1` | unit: findAdjacentScopeViolations flags an interactionWithShared role:'implements' whose contractId is in an adjacentBoundaries[i].owns (returns a BoundaryFinding of the existing shape); unit: findAdjacentScopeViolations ignores a role:'consumes' on an adjacent-owned contract (zero findings); unit: findAdjacentScopeViolations returns [] for empty/absent adjacentBoundaries (standalone no-op); integration: the design.story checklist.verify step prompt includes sbdry5; integration: orchestrator design.story boundaryIds includes 'sbdry5' so a missed sbdry5 verdict hard-fails (retryable:false), mirroring the sbdry1-4 hard-fail tests; integration: an LLD body implementing an adjacent-owned contract is rejected via boundaryHardFailure through the synthesize/validate path | [[c4]] |
| 4 | **`t4`** Tests: slice/render + guard + sbdry5 hard-fail + epic-untouched + standalone no-op | M | `t1`, `t2`, `t3` | integration: existing sbdry1-4 hard-fails still behave unchanged (regression); unit: gates.readPlanUpstream returns hldSlice null for a standalone story (adjacentBoundaries never forces an HLD read); unit: a standalone LLD renders with no adjacent-scope subsection and passes sbdry5 + the guard trivially; integration: the design.epic s6 boundaryIds set is unchanged (still only sbdry1-4; sbdry5 does not leak into the epic gate) | [[c5]] |

### `t1` — adjacentBoundaries on HldContextSlice + extractor + render section

In src/workflow/artifacts/lld.ts: add `readonly adjacentBoundaries: readonly StoryBoundary[]` to the HldContextSlice interface (:31); populate it in extractHldContextSlice (:194) as hld.body.storyBoundaries.filter(sb => sb.storyId !== storyId), leaving all existing fields + the throw-on-missing-boundary behaviour unchanged; and in renderLldMarkdown (:220) emit an 'Adjacent scope (owned by other stories — do NOT implement here)' subsection after Owns/Consumes, guarded so it renders ONLY when adjacentBoundaries is non-empty. StoryBoundary reused from hld.ts.

**Acceptance checks:**
- extractHldContextSlice(hld, storyId).adjacentBoundaries deep-equals the storyBoundaries with the current story excluded (order preserved); single-story HLD => []
- the current story's own boundary is NOT in adjacentBoundaries and IS still returned as `boundary`; all existing slice fields unchanged
- renderLldMarkdown emits the adjacent-scope subsection when non-empty and NOTHING when empty (byte-compatible for single-story/standalone)
- tsc clean; the additive field does not break the verbatim slice injection or any existing caller

### `t2` — Anti-overreach HARD RULE (shared constant) in the design.story + plan step prompts

Author the anti-overreach HARD RULE ONCE as a shared exported constant (ANTI_OVERREACH_RULE) and interpolate it at all six prompt sites so consistency is structural, not manual: the design.story step prompts (context.assemble, alternatives.enumerate, contract.detail, error.paths, checklist.verify in src/workflow/runners/design-story/index.ts) and the plan step prompt (src/workflow/runners/plan/index.ts). Rule text: scope owned by an adjacentBoundaries story OR by a shared contract is OUT OF SCOPE — consume the contract, never re-design it; extend ONLY for a capability genuinely uncovered by your boundary, every adjacent boundary, and every contract, and even then flag it as an openQuestion/back-flow, never a silent build. Prompt-text only; no schema change. If a single cross-file constant is awkward across the two runner files, define it once per runner file.

**Acceptance checks:**
- the rule lives in a single shared constant (ANTI_OVERREACH_RULE), defined once (or once per runner file) and interpolated — not copy-pasted — at all six sites
- each of the five design.story step prompts and the plan step prompt renders the anti-overreach HARD RULE referencing adjacentBoundaries + consume-don't-redesign + extend-only-if-uncovered + flag-as-openQuestion/back-flow
- no schema/JSON-contract change; tsc clean

### `t3` — sbdry5 checklist gate + deterministic findAdjacentScopeViolations guard + orchestrator wiring

Two independent enforcement mechanisms sharing the same boundaryHardFailure sink, landed as one task (same orchestrator file). (a) LLM-judged: add checklist item sbdry5 to the design.story checklist.verify prompt ('[HARD] No scope belonging to an adjacent boundary is designed/implemented here — consume its contract or raise an openQuestion/back-flow instead'), add 'sbdry5' to the design.story s8 boundaryIds set (orchestrator.ts:1479), and change the synthesize prose 'sbdry1-4' → 'sbdry1-5' (:1394); LEAVE the design.epic s6 boundaryIds set (:1215) untouched. (b) Deterministic: add a new pure export findAdjacentScopeViolations(body, slice): BoundaryFinding[] in lld.ts (flags an interactionWithShared role:'implements' on a contract in some adjacentBoundaries[i].owns; ignores consumes; [] when adjacentBoundaries empty) and invoke it in the orchestrator LLD synthesize/validate path, routing non-empty findings through the existing boundaryHardFailure(retryable:false).

**Acceptance checks:**
- (a) LLM-judged gate: the design.story checklist.verify prompt lists sbdry5; the design.story boundaryIds set (:1479) includes 'sbdry5' so a missed sbdry5 verdict triggers boundaryHardFailure (retryable:false); the :1394 prose reads sbdry1-5; the design.epic :1215 set is NOT touched (still sbdry1-4)
- (b) deterministic guard: findAdjacentScopeViolations flags an implements-on-adjacent-owned collision (BoundaryFinding), ignores a consumes on an adjacent-owned contract, and returns [] for empty/absent adjacentBoundaries (standalone no-op)
- the guard is wired into the LLD synthesize/validate path so an adjacent-owned implements-collision LLD is refused via boundaryHardFailure; the existing sbdry1-4 behaviour is unchanged
- tsc clean

### `t4` — Tests: slice/render + guard + sbdry5 hard-fail + epic-untouched + standalone no-op

Extend src/workflow/__tests__/lld-artifact.test.ts with adjacentBoundaries assertions (siblings/self-excluded/single-story-empty), the renderLldMarkdown adjacent-scope section (present/absent), and findAdjacentScopeViolations (implements-flag / consumes-ignore / standalone-no-op, using the existing BoundaryFinding shape). Add an orchestrator test for a missed-sbdry5 boundary hard-fail + an adjacent-owned implements-collision rejection (reusing the existing sbdry hard-fail harness), PLUS a guard test asserting the design.epic s6 boundary behaviour is unchanged (its boundaryIds set still contains only sbdry1-4; sbdry5 is a design.story-only gate). Add a standalone/single-story no-op test (gates.readPlanUpstream null path; render byte-compatible; existing extractHldContextSlice + sbdry1-4 tests still green).

**Acceptance checks:**
- new + existing tests pass under node:test; extractHldContextSlice/renderLldMarkdown/findAdjacentScopeViolations covered incl. the standalone/single-story no-op
- the orchestrator sbdry5 hard-fail (missed verdict + implements-collision) is proven retryable:false, and sbdry1-4 hard-fails still pass unchanged
- a test locks that the design.epic s6 path is unaffected (its boundaryIds set still only sbdry1-4; sbdry5 does not leak into the epic gate)
- the full workflow test sweep stays green (no regression to lld-artifact.test.ts or the orchestrator/runner tests)

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| extractHldContextSlice(hld, storyId).adjacentBoundaries === storyBoundaries excluding the current story | `t1` |
| the current story's boundary is NOT in adjacentBoundaries and IS returned as `boundary` | `t1` |
| single-story HLD => adjacentBoundaries === [] | `t1` |
| renderLldMarkdown emits the 'Adjacent scope (owned by other stories — do NOT implement here)' subsection when non-empty, and nothing when empty (byte-compatible) | `t1` |
| existing extractHldContextSlice fields (owned/consumed/boundary/phase) unchanged | `t1` |
| findAdjacentScopeViolations flags a body.interactionWithShared entry with role:'implements' whose contractId is in an adjacentBoundaries[i].owns | `t3` |
| a role:'consumes' on an adjacent-owned contract yields ZERO findings | `t3` |
| empty/absent adjacentBoundaries (standalone) yields ZERO findings | `t3` |
| the returned finding uses the existing BoundaryFinding shape | `t3` |
| the design.story checklist.verify step prompt includes sbdry5 (and the anti-overreach HARD RULE appears in the design.story + plan step prompts) | `t2`, `t3` |
| orchestrator boundaryIds set includes 'sbdry5' so a missed sbdry5 verdict produces a boundary hard-fail (retryable:false), mirroring the existing sbdry1-4 hard-fail tests | `t3` |
| an LLD body whose interactionWithShared implements an adjacent-owned contract is rejected via boundaryHardFailure through the synthesize/validate path | `t3` |
| sbdry1-4 hard-fails still behave unchanged | `t4` |
| gates.readPlanUpstream returns hldSlice null for a standalone story (adjacentBoundaries never forces an HLD read) | `t4` |
| a standalone LLD renders with no adjacent-scope subsection and passes sbdry5 + the guard trivially | `t4` |

## Citations

- **[[c1]]** `prior-artifact` `LLD S001 contractDetails.api extractHldContextSlice/renderLldMarkdown + invariantsToPreserve (additive adjacentBoundaries field; render subsection only when non-empty; existing fields + throw-on-missing unchanged; single-story/standalone byte-compatible)`
- **[[c2]]** `prior-artifact` `LLD S001 dataModelChanges HldContextSlice field-add + invariant 'the HldContextSlice continues to be JSON-serialized verbatim into every design.story step + the epic-scoped plan step' (adjacentBoundaries auto-propagates via the existing verbatim slice injection)`
- **[[c3]]** `prior-artifact` `LLD S001 dataModelChanges 'design.story + plan step prompts (anti-overreach HARD RULE)' invariant-change (consume-don't-redesign; extend only for genuinely-uncovered capability; flag as openQuestion/back-flow) across the design-story + plan runners`
- **[[c4]]** `prior-artifact` `LLD S001 dataModelChanges 'scope-over-reach checklist item sbdry5' + 'deterministic ownership-collision guard (findAdjacentScopeViolations)' + errorPaths (sbdry5 in boundaryIds:1479, sbdry1-5 prose:1394, design.epic:1215 untouched, guard routes through boundaryHardFailure retryable:false)`
- **[[c5]]** `prior-artifact` `LLD S001 testStrategy testLevels + invariant 'existing extractHldContextSlice tests continue to pass; new adjacentBoundaries assertions extend, not replace' (unit slice/render/guard + integration sbdry5 hard-fail + standalone/single-story no-op)`

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — plan (plan)

**0 HIGH · 1 MED · 12 LOW** · model `client` · reviewed 2026-09-15T13:16:27.544Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| t1 | semantic | MED | assisted | The HldContextSlice is JSON-serialized verbatim into the design.story step prompts, so an additive field auto-propagates without new plumbing. | The premise 'HldContextSlice is JSON-serialized VERBATIM into EVERY design.story step' is FALSE for the contract.detail step (s4): design-story/index.ts:253 injects only `JSON.stringify([...hldSlice.ownedContracts, ...hldSlice.consumedContracts], null, 2)` — NOT the full slice. The full slice IS injected at s1(:164), s2(:207), s5(:304), s8(:515). So t1's additive `adjacentBoundaries` field auto-propagates into four of the five steps but NOT into contract.detail — the very step where the LLM DETAILS contracts and is most prone to re-designing a sibling's owned contract. t2 does add the anti-overreach RULE text to contract.detail's prompt, but that rule instructs the LLM to consult adjacentBoundaries data that is not shown at that step (an incoherence: rule present, data absent). | In t1 (or t2), also surface adjacentBoundaries into the contract.detail step prompt — either inject the full hldSlice at design-story/index.ts:253 alongside the owned/consumed contracts, or append `hldSlice.adjacentBoundaries` to that step's JSON payload — so the anti-overreach rule at the contract-design step has the sibling-ownership data it references. Add a t2/t4 assertion that the contract.detail prompt exposes adjacentBoundaries (not just owned/consumed). |
| t1 | citation | LOW | manual | HldContextSlice is an interface in src/workflow/artifacts/lld.ts (the target for the additive adjacentBoundaries field). | src/workflow/artifacts/lld.ts:31 `export interface HldContextSlice {` — confirmed verbatim. | none — verified sound |
| t1 | citation | LOW | manual | extractHldContextSlice is exported from src/workflow/artifacts/lld.ts and uses hld.body.storyBoundaries with a boundary lookup keyed on storyId. | lld.ts:194 `export function extractHldContextSlice(hld, storyId)`; :195 `const boundary = hld.body.storyBoundaries.find(sb => sb.storyId === storyId)`; :198 throw-on-missing. Extractor + storyId lookup confirmed. | none — verified sound; the filter(sb=>sb.storyId!==storyId) sibling addition is coherent with the existing find() |
| t1 | citation | LOW | manual | renderLldMarkdown is exported from src/workflow/artifacts/lld.ts and emits an '## HLD context' section (the anchor for the new adjacent-scope subsection). | lld.ts:220 `export function renderLldMarkdown`; :245 `lines.push('## HLD context')` — the render anchor for the new adjacent-scope subsection is present. | none — verified sound |
| t1 | citation | LOW | manual | StoryBoundary is an interface defined in src/workflow/artifacts/hld.ts with fields storyId/owns/depends/internal (reused for adjacentBoundaries). | src/workflow/artifacts/hld.ts:37 `export interface StoryBoundary {` — the reused type is confirmed. | none — verified sound |
| t2 | inventory | LOW | manual | The design.story runner (src/workflow/runners/design-story/index.ts) contains the five step ids context.assemble, alternatives.enumerate, contract.detail, error.paths, and checklist.verify (the five prompt sites for the anti-overreach rule). | design-story/index.ts defines all five step ids: context.assemble (:135), alternatives.enumerate (:185), contract.detail (:273), error.paths (:324), checklist.verify (:473). The five prompt sites exist. | none — verified sound |
| t2 | citation | LOW | manual | The plan runner src/workflow/runners/plan/index.ts injects the HLD context slice into its step prompt (the sixth anti-overreach rule site). | plan/index.ts:23 imports readPlanUpstream; :88 destructures hldSlice; :111-112 injects `JSON.stringify(hldSlice, null, 2)` under a `hldSlice !== null` guard — the sixth anti-overreach site + the null-standalone no-op are both confirmed. | none — verified sound |
| t3 | inventory | LOW | manual | The orchestrator (src/workflow/orchestrator.ts) defines a design.story boundaryIds Set containing sbdry1..sbdry4 (the set sbdry5 is added to). | orchestrator.ts:1479 `const boundaryIds = new Set(['sbdry1','sbdry2','sbdry3','sbdry4'])` is the design.story s8 set; :1481/:1486 gate + boundaryHardFailure. sbdry5 addition target confirmed. | none — verified sound |
| t3 | citation | LOW | manual | boundaryHardFailure is a function in src/workflow/orchestrator.ts producing a non-retryable (retryable:false) failure, the sink both sbdry5 and the deterministic guard route through. | orchestrator.ts:464 `function boundaryHardFailure(message, findings?): ValidationResult`; s8 path :1486 calls it with boundaryFindings(failed). The non-retryable sink both mechanisms route through is confirmed. | none — verified sound |
| t3 | citation | LOW | manual | BoundaryFinding is a type in src/workflow/synthesizer.ts (the return-shape reused by findAdjacentScopeViolations). | synthesizer.ts:43 `export interface BoundaryFinding` — the reused return shape for findAdjacentScopeViolations is confirmed. | none — verified sound |
| t3 | closed-union | LOW | manual | There are two distinct boundaryIds sets in the orchestrator — a design.story one (gets sbdry5) and a design.epic one (must stay sbdry1-4) — so the sbdry5 addition can be scoped to the story path only. | Confirmed TWO sbdry sets: design.story s8 at :1479 (sbdry5 target) and design.epic s6 at :1215 (must stay sbdry1-4). NOTE there are additionally sb1-3 sets at :844/:944 (design.epic s4 cross-cutting, a separate namespace) — the plan does not touch those and correctly does not conflate them. The two sbdry sets the plan names are distinct and correctly scoped. | none — verified sound (the extra sb1-3 sets are a different item namespace and out of scope) |
| t4 | semantic | LOW | manual | gates.readPlanUpstream (src/workflow/gates.ts) returns a null hldSlice for a standalone story so the adjacentBoundaries feature no-ops without forcing an HLD read. | plan/index.ts:112 renders the slice only when `hldSlice !== null`; readPlanUpstream is the null source for standalone. gates.readPlanUpstream standalone-null path is the documented no-op (consistent with [[plan-standalone-gap]] fix). | none — verified sound |
| t4 | citation | LOW | manual | The existing test file src/workflow/__tests__/lld-artifact.test.ts exists and exercises extractHldContextSlice (the file t4 extends). | src/workflow/__tests__/lld-artifact.test.ts exists and exercises extractHldContextSlice (existing tests the summary references at :155/:166/:175). The extend target is real. | none — verified sound |

#### Proposed fixes

- **t1** (assisted) — The feature's core intent is that the LLM sees sibling scope while designing. contract.detail is the contract-authoring step and the primary over-reach site; leaving adjacentBoundaries out of its prompt is the one place the auto-propagation premise leaks. Extend the s4 injection to include adjacentBoundaries (or the full slice) so the rule and its data are co-located.
  - edit: `populate it in extractHldContextSlice (:194) as hld.body.storyBoundaries.filter(sb => sb.storyId !== storyId), leaving all existing fields + the throw-on-missing-boundary behaviour unchanged;` → `populate it in extractHldContextSlice (:194) as hld.body.storyBoundaries.filter(sb => sb.storyId !== storyId), leaving all existing fields + the throw-on-missing-boundary behaviour unchanged; ALSO surface adjacentBoundaries into the contract.detail (s4) step prompt (design-story/index.ts:253 currently injects only ownedContracts+consumedContracts, NOT the full slice) so the adjacent-scope data reaches the contract-authoring step;`
