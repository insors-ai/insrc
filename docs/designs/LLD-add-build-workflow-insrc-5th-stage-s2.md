<!-- insrc:artifact LLD-185807ba9a6b35d3-s2 -->

# LLD: s2

**Epic:** `add-build-workflow-insrc-5th-stage`
**HLD base run:** `wf-1784289418318-fl5y3m`
**HLD effective hash:** `6d130af6ef10...`
**Tracker:** [insors-ai/insrc#3](https://github.com/insors-ai/insrc/issues/3)

## HLD context

**Framework:** Chosen framework: **a2 — a registered `build` stage that delegates each Task's editing work to a CliProvider subprocess, while the daemon keeps sequencing and verification on its own side.** The stage is added exactly where the sibling stages live: a `src/workflow/runners/build/` subdir (index.ts + schemas.ts, one exported `registerBuildRunners(): void`, no classes, no base class — mirroring the confirmed design-story shape) plus a `src/workflow/artifacts/build.ts` artifact definition, reusing the parent module's `hash.ts` / `slug.ts` writers and `gates.ts` rather than adding skeleton machinery. The `insrc_workflow_step` surface gains a `build` phase handler mirroring `phases/plan.ts`, so the developer-facing turn shape (start → decompose → synthesize → finalize) is unchanged.

Why a2 over the field: it is the only alternative with no partial or unknown across all nine constraints. It removes the k9 dependency instead of absorbing it — the multi-turn edit/test/repair loop does **not** live inside the synthesize seam that is proven only for one-JSON-document-per-turn; it lives behind a one-Task-at-a-time subprocess boundary, so `executor.ts`/`orchestrator.ts` are asked only to do what they already demonstrably do (host a stage, run a gate, finalize an artifact). It keeps k2 enforcement daemon-side: the daemon decides advancement from a test run and a tree diff it performs itself, so a non-cooperating implementer cannot advance the run — unlike the advisory-order failure the Epic's problem statement names. And k8 is satisfied by construction rather than by special pleading: CliProvider is CLAUDE.md's sanctioned cloud path and one-subprocess-at-a-time is serial by definition.

Two items are carried into design as unproven, not settled. (1) **CliProvider's structured-output path is built for JSON returns, not for supervising a long free-form editing session** — that usage is unverified and may require provider-level work; the design must inspect `src/agent/providers/cli-provider.ts` directly, since no analyze bundle touched it (k8 is carried verbatim from CLAUDE.md). (2) Per the coverage-gap bundle, `gates.ts`, `hash.ts` and `slug.ts` are cited at **module level only** — no exploration located an entity in them by name — so k1's gate shape and k3's writer contract are unread APIs that must be read directly, alongside k9's required reading of `executor.ts` and `orchestrator.ts`. The scope phase's "clear match" verdict on `src/workflow` answers "does the skeleton exist?" (yes) and is not license to assume those files fit a code-editing workload.
**Rollout phase:** Phase B — admission gate
**Owns:** `sc3` (BuildAdmissionResult)
**Consumes:** `sc1` (BuildStageRegistration), `sc2` (WorkflowStepInputBuild)

## Contract details

**Surface level:** internal-shared

### `admitBuild`

```typescript
admitBuild(repoPath: string, storyId: string): BuildAdmissionResult
```

**Parameters:**
- `repoPath: string` — Registered repo root the build stage is starting in; the store from which the plan, its recorded upstream, and the current design.story artifact are read.
- `storyId: string` — Story whose approved plan is being admitted for build. Combined internally with the resolved epicHash to locate the PlanArtifact and its recorded upstream (plan resolution stays private to s2 per the boundary).

**Returns:** `BuildAdmissionResult` — The sc3 verdict, returned at the start turn before any work list is materialized. `{admitted:true, plan:{planArtifactId,planArtifactHash,storyId}}` when the plan is approved and non-drifted (ac1); otherwise `{admitted:false, refusal}` with reason 'plan-missing' (ac4) | 'plan-unapproved' (ac2) | 'plan-stale' (ac3, carrying the drift hashes). Non-throwing for all four modeled conditions — mirrors scanLldStaleness's return-a-typed-verdict-don't-throw rule (winner a1).

**Errors:**
- `none (non-throwing for modeled conditions)` when approved+fresh / unapproved / stale / missing are all encoded in the returned union, never thrown — this is what makes ac2/ac3/ac4 typed refusals and treeUntouched structural.
- `propagates (unmodeled)` when underlying artifact store unreadable/corrupt in a way outside the four modeled conditions is not caught here; not a normal-path error.

**Preconditions:**
- The `build` stage is registered via sc1 (registerBuildRunners) so this runs as the stage's start-turn gate.
- repoPath is a registered insrc repo (UnregisteredRepoError contract holds upstream of this call).

**Postconditions:**
- Read-only: no file in the working tree or artifact store is modified — so on any `admitted:false` result `refusal.treeUntouched === true` holds by construction, not by assertion (ac2/ac3/ac4).
- On `admitted:true` the returned plan pointer is thin — exactly {planArtifactId, planArtifactHash, storyId} per the HLD sketch (s3/s5 do not receive the full PlanArtifact; a4's thickening was rejected).
- The plan-vs-design.story drift comparator used to reach 'plan-stale' stays private to src/workflow/runners/build/ — never re-exported (boundary: how drift is detected is s2's alone).

### `readPlanUpstream`

```typescript
readPlanUpstream(repoPath: string, epicHash: string, storyId: string): PlanUpstream
```

**Parameters:**
- `repoPath: string` — Repo root passed through from admitBuild.
- `epicHash: string` — Epic identity hash resolved internally (via computeEpicHash), matching how runners/plan/index.ts::upstream resolves it at gate time.
- `storyId: string` — Story whose recorded plan upstream is being read.

**Returns:** `PlanUpstream` — Existing first-class record (gates.ts:250-254 / :261-269) already consumed by runners/plan/index.ts::upstream. s2 consumes it to obtain the plan's recorded upstream design hash — the baseline half of the ac3 drift comparison. No new persistence is introduced (confirmed in backFlowNotes).

**Errors:**
- `missing-plan (family: ArtifactMissingError)` when no plan recorded for (epicHash, storyId); admitBuild guards this and returns reason:'plan-missing' (ac4). Exact throw-vs-return behavior against the plan artifact is unread (c1) and must be confirmed before finalizing the map.

**Preconditions:**
- epicHash has been resolved for the Story.

**Postconditions:**
- Read-only; the recorded design hash is compared but not mutated (ackStaleArtifact is the only staleness mutator and is out of scope for the gate).

### `requireApprovedLld`

```typescript
requireApprovedLld(repoPath: string, epicHash: string, storyId: string): /* approved artifact */ (throws ArtifactMissingError | ArtifactNotApprovedError)
```

**Parameters:**
- `repoPath: string` — Repo root.
- `epicHash: string` — Resolved epic identity hash.
- `storyId: string` — Story whose plan approval state is being read.

**Returns:** `approved-artifact | throws` — Existing throwing approval accessor family (gates.ts). s2 REUSES its approval semantics but in a NON-THROWING form — the thin build-private wrapper a1 requires — so that ArtifactNotApprovedError → 'plan-unapproved' (ac2) and ArtifactMissingError → 'plan-missing' (ac4) become returned refusal reasons, not thrown control flow. This is the one open dependency called out in the winner: a contained wrapper, NOT a shared-surface change (no HLD amendment).

**Errors:**
- `ArtifactNotApprovedError (gates.ts:51-56)` when plan exists but was never approved → wrapper yields reason:'plan-unapproved' (ac2).
- `ArtifactMissingError (gates.ts:44-49)` when plan artifact absent → wrapper yields reason:'plan-missing' (ac4).

**Preconditions:**
- c1 gate: the exact accessor shape and whether requireApprovedLld (or a plan-specific reader) applies to the PLAN artifact is unread and MUST be confirmed against gates.ts before this behaviour is finalized (coverage-gap item 1).

**Postconditions:**
- Approval is read, never granted or mutated here (approve/reject mutators are out of scope for the gate).

### `readLldArtifact`

```typescript
readLldArtifact(repoPath: string, epicHash: string, storyId: string): /* LldArtifact */
```

**Parameters:**
- `repoPath: string` — Repo root.
- `epicHash: string` — Resolved epic identity hash.
- `storyId: string` — Story whose current design.story (LLD) artifact is read.

**Returns:** `LldArtifact` — Existing design.story artifact reader (bundle: readDefineArtifact/readHldArtifact/readLldArtifact/readBaseHld). s2 consumes it to obtain the CURRENT design.story artifact hash — the second operand of the ac3 drift comparison. hash.ts computes only epicHash and has NO design.story-artifact hash function, so the current design hash comes from the artifact itself, not hash.ts (backFlowNotes).

**Errors:**
- `missing (family: ArtifactMissingError)` when design.story artifact absent — treated as an upstream-integrity failure. Exact reader shape unread (c1).

**Preconditions:**
- epicHash resolved for the Story.

**Postconditions:**
- Read-only.

### `scanLldStaleness`

```typescript
scanLldStaleness(repoPath: string, epicHash: string, baseHld: HldArtifact): readonly StaleLldEntry[]
```

**Parameters:**
- `repoPath: string` — Repo root.
- `epicHash: string` — Epic identity hash.
- `baseHld: HldArtifact` — The base HLD the existing engine scans LLD drift against.

**Returns:** `readonly StaleLldEntry[]` — Existing staleness ENGINE (staleness.ts:60-119), but it scans LLD-vs-HLD — NOT the plan-vs-design.story comparison ac3 needs. s2 MIRRORS its shape (return a typed verdict array, do not throw, caller decides refusal) inside a build-private comparator; it does NOT call scanLldStaleness directly and does NOT generalize it (a3 was rejected precisely for pushing drift detection into shared amendments/staleness.ts — boundary violation). This entry documents the pattern source, not a consumed call.

**Errors:**
- `none` when returns a typed verdict array, never throws — the exact discipline s2's comparator adopts, keeping sc3.staleness an inline literal rather than a shared staleness.ts export.

**Preconditions:**
- None — pattern reference only.

**Postconditions:**
- Its existing callers (chain.ts::readStoryLldStatus, cli/services/workflow.ts::staleness) are UNCHANGED — s2 does not touch this shared function, so no regression to those call sites.

### `computeEpicHash`

```typescript
computeEpicHash(defineRunId: string): string
```

**Parameters:**
- `defineRunId: string` — Define-run identity used to derive the epic identity hash.

**Returns:** `string` — Epic identity hash (hash.ts). s2 consumes it to resolve the epicHash argument for readPlanUpstream / readLldArtifact, mirroring how runners/plan/index.ts::upstream resolves epicHash+storyId at gate time. NOTE: hash.ts hashes epic identity ONLY — it does NOT supply the design.story artifact hash used for drift; that comparand comes from readLldArtifact.

**Errors:**
- `assertEpicHash` when the produced/passed hash is malformed (isEpicHash/assertEpicHash guards in hash.ts).

**Preconditions:**
- The Story's define-run identity is resolvable.

**Postconditions:**
- Pure/deterministic; no side effects.

## Data model changes

### `BuildAdmissionResult` — new

The sc3 discriminated union s2 OWNS — the start-turn gate verdict. Implemented verbatim from the HLD interfaceSketch: a flat BuildRefusalReason enum ('plan-missing' | 'plan-unapproved' | 'plan-stale'), a thin BuildAdmissionAccepted ({planArtifactId, planArtifactHash, storyId}), and BuildAdmissionRefusal with the treeUntouched:true invariant. Lives in src/workflow/runners/build/schemas.ts. admitBuild returns it; the build phase handler turns admitted:false into next:'refused' (sc2). Kept thin on the accepted branch — no full PlanArtifact (a4 rejected).

```
// src/workflow/runners/build/schemas.ts (NEW)
export type BuildRefusalReason = 'plan-missing' | 'plan-unapproved' | 'plan-stale';
export interface BuildAdmissionAccepted {
  readonly planArtifactId: string;
  readonly planArtifactHash: string;
  readonly storyId: string;
}
export type BuildAdmissionResult =
  | { readonly admitted: true;  readonly plan: BuildAdmissionAccepted }
  | { readonly admitted: false; readonly refusal: BuildAdmissionRefusal };
```

**Call sites:**
- `src/workflow/runners/build/index.ts (admitBuild returns it — the new runner mirrors runners/plan/index.ts, cited in bundles)`
- `src/mcp/workflow-step/phases/build.ts (the phase handler that maps admitted:false → next:'refused', mirroring phases/plan.ts::handlePlan, cited in bundles)`

### `BuildAdmissionRefusal` — new

The refusal member of sc3. `message` is s2's wording (refusal-message authorship is explicitly s2's per the boundary). `staleness` is an INLINE literal {planRecordedDesignHash, currentDesignHash} — populated only for reason:'plan-stale' from readPlanUpstream's recorded hash vs readLldArtifact's current design.story hash — deliberately NOT typed from a shared staleness.ts export (that would be a3's boundary breach). `treeUntouched: true` is a structural invariant: the gate is read-only and runs before any work list exists.

```
export interface BuildAdmissionRefusal {
  readonly reason: BuildRefusalReason;
  readonly message: string;              // s2 owns the wording
  readonly staleness?: {                 // present only for 'plan-stale'
    readonly planRecordedDesignHash: string;
    readonly currentDesignHash: string;
  } | undefined;
  readonly treeUntouched: true;          // structural, not asserted
}
```

**Call sites:**
- `src/workflow/runners/build/index.ts (populated by admitBuild's build-private plan-vs-design comparator)`
- `src/mcp/workflow-step/types.ts (WorkflowStepOutputBuild.refusal carries it across the insrc_workflow_step turn — sc2, owned by s1)`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc3` | implements | s2 is the HLD owner of sc3 (ownedByStory: s2, consumedByStories: s3, s5). admitBuild returns BuildAdmissionResult verbatim as the HLD sketches it — flat BuildRefusalReason enum, thin BuildAdmissionAccepted, treeUntouched invariant. All four acceptance criteria fall straight out of the union: ac1→admitted:true, ac2→'plan-unapproved', ac3→'plan-stale' (with staleness detail), ac4→'plan-missing'. The plan-vs-design.story comparator that reaches 'plan-stale' stays private to src/workflow/runners/build/ — siblings see only the verdict. |
| `sc1` | consumes | Owned by s1 (BuildStageRegistration). admitBuild runs as the start-turn gate of the `build` stage that registerBuildRunners() wires into the chain — s2 adds no second registration and no sibling-stage mutation. The gate consumes the registered stage's start turn; the registration contract itself is unchanged. |
| `sc2` | consumes | Owned by s1 (WorkflowStepInputBuild / WorkflowStepOutputBuild). On refusal, admitBuild's thin, serializable BuildAdmissionRefusal flows into WorkflowStepOutputBuild.refusal, and the build phase handler (mirroring phases/plan.ts::handlePlan) emits next:'refused' across the insrc_workflow_step turn. s2 adds no bespoke command, IPC method, or UI — the developer-facing turn shape is s1's. |

## Error paths

### Error cases

- **The Story's define-run identity resolves to an epic-identity hash that is not a well-formed epicHash (corrupted or truncated define-run id).** (terminal)
  - Detection: computeEpicHash / assertEpicHash (hash.ts) run isEpicHash before any artifact read; a value that fails the format guard makes assertEpicHash throw at hash-resolution time, before readPlanUpstream/readLldArtifact are ever called.
  - Response: admitBuild does NOT catch this — it is outside the four modeled refusal conditions and propagates as an internal error. It is not remapped to 'plan-missing'/'plan-unapproved'/'plan-stale'.
  - User impact: The build stage aborts with a hard internal error instead of a typed refusal. Because the throw happens before any work list is materialized, the working tree is still untouched, but the developer sees a raw failure rather than a clean refusal reason.
- **The approval accessor (the requireApprovedLld family reused in non-throwing form) throws an error that is NEITHER ArtifactMissingError NOR ArtifactNotApprovedError — e.g. an underlying store/IO error while reading the plan's approval state.** (terminal)
  - Detection: The build-private non-throwing wrapper catches by error class: `instanceof ArtifactMissingError` → reason 'plan-missing', `instanceof ArtifactNotApprovedError` → reason 'plan-unapproved'. An error matching neither class falls through the discriminator and is re-thrown rather than mapped to a refusal.
  - Response: Re-throw (propagate). The wrapper must not swallow an unrelated failure into a modeled refusal reason, because doing so would report a misleading cause.
  - User impact: The developer sees the real underlying store failure instead of a false 'plan-unapproved'/'plan-missing' verdict. Tree untouched (gate is read-only).
- **The plan record exists on disk but its serialized body cannot be decoded into PlanUpstream (corrupt/partially-written plan artifact) — distinct from the plan being absent.** (terminal)
  - Detection: readPlanUpstream throws a deserialization/parse error that is NOT ArtifactMissingError; the record is present (so 'plan-missing' does not apply) but its bytes do not decode into the PlanUpstream shape.
  - Response: Propagates as an unmodeled error — it is not one of the four admission conditions and is deliberately not caught by the reason switch.
  - User impact: Hard failure surfaced to the developer; tree untouched because the read precedes any code-touch. Distinguished from the clean ac4 'plan-missing' path so a corrupt plan is never silently reported as merely absent.
- **The plan is present and approved, but the CURRENT design.story (LLD) artifact needed as the second operand of the ac3 drift comparison cannot be read.** (terminal)
  - Detection: readLldArtifact throws ArtifactMissingError for the DESIGN artifact AFTER the approval wrapper has already confirmed the plan is approved — i.e. the missing artifact is the design.story the plan was derived from, not the plan itself.
  - Response: Treated as an upstream-integrity failure, not a modeled refusal: the drift comparison has no current operand to compare against, so admitBuild does not fabricate a 'plan-stale' verdict and does not silently admit. The missing-design error propagates.
  - User impact: Build refuses to start via a hard error naming the absent design rather than admitting an unverifiable-freshness run. Tree untouched.

### Edge cases

| Input | Expected |
| :--- | :--- |
| A Story whose plan exists, has NEVER been approved, AND whose recorded upstream design hash also differs from the current design.story hash (both the unapproved and the would-be-stale conditions hold at once). | Refusal with reason 'plan-unapproved' — approval is evaluated before staleness, so the drift comparison is not even computed once approval fails. Only one reason is returned (the discriminated union is single-reason), and treeUntouched === true. |
| An approved Story plan whose recorded upstream design hash is exactly equal to the current design.story artifact hash (the equality boundary of the drift comparison). | admitted:true — equality means fresh, not drifted (ac1). The returned plan pointer is the thin {planArtifactId, planArtifactHash, storyId}, with no PlanArtifact body attached. |
| An approved plan whose recorded upstream (readPlanUpstream) is present but whose recorded-design-hash field is empty/absent, so freshness cannot be positively established. | Conservative refusal with reason 'plan-stale', staleness = {planRecordedDesignHash: (empty), currentDesignHash: <present>}. The gate refuses rather than admits when it cannot prove the plan is fresh, and no file is modified. |
| A Story that has a current design.story artifact but no plan record at all for (epicHash, storyId). | Refusal with reason 'plan-missing' naming the missing upstream (ac4) — never an empty admitted run, and 'plan-missing' takes precedence over any staleness reasoning since there is no recorded upstream to compare. |

### Invariants to preserve

- scanLldStaleness and its two existing callers (chain.ts::readStoryLldStatus, cli/services/workflow.ts::staleness) must remain unchanged: s2 MIRRORS its return-a-typed-verdict-don't-throw shape inside a build-private comparator and does NOT call or generalize the shared engine (a3 was rejected as a boundary breach). Analyze bundle (how-does-it-work, staleness.ts:60-119) established scanLldStaleness scans LLD-vs-HLD, not plan-vs-design.story, and named its callers. [[c1]]
- admitBuild must be non-throwing for all four modeled conditions (admitted / plan-missing / plan-unapproved / plan-stale) — mirroring the typed-verdict-array discipline of scanLldStaleness so that treeUntouched is structural, not asserted. Analyze bundle (capability-discovery + how-does-it-work) established the winning rule 'return a typed verdict, don't throw; caller decides refusal'. [[c1]]
- readPlanUpstream (gates.ts:250-269) stays the SOLE reader of the plan's recorded upstream and no new persistence is introduced for the ac3 inputs. Analyze bundle (how-does-it-work of readPlanUpstream/PlanUpstream) and backFlowNotes confirmed the recorded upstream design hash is already first-class and consumed by runners/plan/index.ts::upstream. [[c1]]
- No design.story-artifact hash function may be added to the shared hash.ts — it computes epic-identity hash ONLY (computeEpicHash/isEpicHash/assertEpicHash). The current design hash for the ac3 comparison comes from the design.story artifact via readLldArtifact, not from hash.ts. Analyze bundle (how-does-it-work, hash.ts NARROW/3-entities) established hash.ts has no design-artifact hash function. [[c1]]
- The plan-vs-design.story drift comparator that reaches 'plan-stale' stays PRIVATE to src/workflow/runners/build/ and is never re-exported; siblings (s3, s5) see only the BuildAdmissionResult verdict. Analyze bundle (concept.resolve of the phase-handler analogues) and the s4 boundary established 'how drift is detected is s2's alone'. [[c1]]
- The existing throwing approval accessors (requireApprovedLld family; ArtifactMissingError gates.ts:44-49, ArtifactNotApprovedError gates.ts:51-56) keep their throwing semantics for their current callers — s2 wraps them in a contained non-throwing form rather than changing the shared surface (no HLD amendment). Analyze bundle (symbol.locate on gates.ts) established these as already-typed constructs mapping to ac4/ac2. [[c1]]

## Test strategy

**Test framework:** `node:test (via `tsx --test`, discovered under `src/**/__tests__/*.test.ts` — matches the pattern-source suite `src/workflow/amendments/__tests__/effective-and-staleness.test.ts` cited in s1)`

### Test levels

- **unit** — Exercise admitBuild directly against a seeded artifact store to prove all four modeled conditions produce the correct BuildAdmissionResult verdict non-throwingly, and that treeUntouched is structural (never a thrown control path) for every refusal.
  - Subjects: `admitBuild (src/workflow/runners/build/index.ts)`, `BuildAdmissionResult / BuildAdmissionRefusal (src/workflow/runners/build/schemas.ts)`
  - Fixtures: `A registered temp insrc repo (repo.add) so reads resolve and UnregisteredRepoError never masks the gate`, `Artifact-store seeder that writes a plan record for (epicHash, storyId) in states: approved+fresh, approved+stale, exists-but-unapproved, absent`, `A design.story (LLD) artifact whose current hash can be set equal to / different from the plan's recorded upstream design hash`, `A PlanUpstream record whose recordedDesignHash can be present, differing, or empty/absent`, `A helper asserting the working tree is byte-identical before and after the call (proves treeUntouched by observation, not just the literal flag)`
- **unit** — Isolate the build-private non-throwing approval wrapper and the build-private plan-vs-design.story drift comparator: prove ArtifactNotApprovedError→'plan-unapproved', ArtifactMissingError→'plan-missing', that an unrelated store/IO error re-throws (not swallowed into a modeled reason), and that the comparator mirrors scanLldStaleness's return-a-typed-verdict-don't-throw discipline without calling or generalizing the shared engine.
  - Subjects: `build-private non-throwing approval wrapper over requireApprovedLld family`, `build-private plan-vs-design.story drift comparator (private to src/workflow/runners/build/)`
  - Fixtures: `Stubbed approval accessor that can throw ArtifactMissingError, ArtifactNotApprovedError, or an unrelated Error class on demand`, `Recorded-design-hash vs current-design-hash pairs: equal, differing, and empty-recorded`, `A guard test importing src/workflow/runners/build/ public surface to assert the comparator is NOT re-exported (boundary: drift detection stays private)`
- **integration** — Drive the build phase handler through the insrc_workflow_step turn (mirroring phases/plan.ts::handlePlan) to prove that an admitted:false verdict surfaces as next:'refused' at the start turn with the serializable refusal payload, and that admitted:true lets the stage proceed — confirming sc2 wiring carries the s2 verdict without any bespoke command/IPC.
  - Subjects: `src/mcp/workflow-step/phases/build.ts (build phase handler)`, `WorkflowStepOutputBuild.refusal round-trip (src/mcp/workflow-step/types.ts)`
  - Fixtures: `In-process insrc_workflow_step harness seeded with the registered build stage (registerBuildRunners) from sc1`, `The same artifact-store seeder covering approved-fresh / unapproved / stale / missing plan states`, `JSON serialization assertion on the emitted WorkflowStepOutputBuild (refusal must survive the turn boundary intact)`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `admitBuild returns {admitted:true} when the plan is approved and its recorded upstream design hash equals the current design.story hash`, `admitBuild admitted:true carries only the thin plan pointer {planArtifactId, planArtifactHash, storyId} and no PlanArtifact body`, `admitBuild admits at the equality boundary — recorded design hash exactly equal to current design.story hash counts as fresh, not drifted`, `build phase handler lets the stage proceed (no next:'refused') when admitBuild returns admitted:true` |
| `ac2` | `admitBuild returns {admitted:false, refusal:{reason:'plan-unapproved'}} when the plan exists but was never approved`, `admitBuild refusal reports treeUntouched===true and the working tree is byte-identical after a 'plan-unapproved' refusal`, `approval is evaluated before staleness: an unapproved AND drifted plan yields the single reason 'plan-unapproved' (drift comparison not computed)`, `build phase handler emits next:'refused' carrying the 'plan-unapproved' refusal message across the insrc_workflow_step turn` |
| `ac3` | `admitBuild returns {admitted:false, refusal:{reason:'plan-stale'}} when an approved plan's recorded upstream design hash differs from the current design.story hash`, `admitBuild 'plan-stale' refusal carries staleness={planRecordedDesignHash, currentDesignHash} inline and treeUntouched===true with tree byte-identical`, `admitBuild conservatively refuses with 'plan-stale' when the recorded design hash is empty/absent so freshness cannot be positively established`, `build phase handler emits next:'refused' with the 'plan-stale' message across the insrc_workflow_step turn` |
| `ac4` | `admitBuild returns {admitted:false, refusal:{reason:'plan-missing'}} naming the missing upstream when no plan record exists for (epicHash, storyId)`, `admitBuild 'plan-missing' refusal reports treeUntouched===true and the tree is byte-identical — never an empty admitted run`, `'plan-missing' takes precedence over staleness: a Story with a current design but no plan record returns 'plan-missing', not 'plan-stale'`, `build phase handler emits next:'refused' with the 'plan-missing' message across the insrc_workflow_step turn` |

## Migration

**State before:** Today the `build` stage has no start-turn admission gate, so nothing stops a developer from implementing against an unapproved or drifted plan. The two halves of the precondition exist but do not compose: the approval half lives in src/workflow/gates.ts as THROWING accessors (requireApprovedLld with ArtifactMissingError at gates.ts:44-49 and ArtifactNotApprovedError at gates.ts:51-56), and the staleness half lives in src/workflow/amendments/staleness.ts as scanLldStaleness (staleness.ts:60-119), which compares LLD-vs-HLD, NOT plan-vs-design.story. The plan's recorded upstream is already first-class (readPlanUpstream, gates.ts:250-269, consumed only by runners/plan/index.ts::upstream), but no module reads it, compares it against the current design.story artifact, and returns a non-throwing verdict [capability-discovery bundle: no single module unifies approved-AND-fresh; how-does-it-work bundle on hash.ts: NO design.story-artifact hash exists]. src/workflow/runners/build/ does not exist yet, and src/mcp/workflow-step has no build phase handler [concept.resolve bundle]. Net: starting `build` today materializes a work list with no approved/non-stale check.

**State after:** The `build` stage runs a read-only start-turn gate, admitBuild(repoPath, storyId), before any work list is materialized. It returns the new BuildAdmissionResult discriminated union: admitted:true with a thin {planArtifactId, planArtifactHash, storyId} pointer when the plan is approved and non-drifted (ac1), or admitted:false with a BuildAdmissionRefusal carrying reason 'plan-missing' (ac4) | 'plan-unapproved' (ac2) | 'plan-stale' (ac3, with inline {planRecordedDesignHash, currentDesignHash}) and treeUntouched:true. The build phase handler (src/mcp/workflow-step/phases/build.ts, mirroring phases/plan.ts::handlePlan) maps admitted:false to next:'refused'. All four modeled conditions are typed returns, never thrown. Existing shared machinery — scanLldStaleness and its callers (chain.ts::readStoryLldStatus, cli/services/workflow.ts::staleness), readPlanUpstream, and requireApprovedLld — is untouched; s2 adds only build-private code.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the new file src/workflow/runners/build/schemas.ts defining the BuildRefusalReason enum ('plan-missing' | 'plan-unapproved' | 'plan-stale'), the thin BuildAdmissionAccepted record, the BuildAdmissionRefusal interface (with the treeUntouched:true structural invariant and the optional inline staleness detail), and the BuildAdmissionResult discriminated union. Purely additive new module — no existing type changes. — ↩ rollbackable
2. Before designing behaviour, confirm the c1 gate against the real machinery: read gates.ts to verify the exact shape of requireApprovedLld (or whether a plan-specific approval reader applies to the PLAN artifact) and how it distinguishes missing vs unapproved, and read staleness.ts:60-119 to confirm the return-a-typed-verdict-don't-throw discipline. No code produced by this step; it de-risks steps 3-5 and does not alter any file. — ↩ rollbackable
3. Add a build-private, non-throwing approval wrapper inside src/workflow/runners/build/ that calls the existing requireApprovedLld against the plan artifact and catches ArtifactNotApprovedError to yield reason:'plan-unapproved' (ac2) and ArtifactMissingError to yield reason:'plan-missing' (ac4). Contained wrapper only — does NOT modify gates.ts and does NOT change requireApprovedLld's throwing contract for its existing callers. — ↩ rollbackable
4. Add a build-private plan-vs-design.story drift comparator inside src/workflow/runners/build/ that reads the plan's recorded upstream design hash via the existing readPlanUpstream, reads the current design.story artifact hash via the existing readLldArtifact, and compares them, mirroring scanLldStaleness's return-a-verdict-don't-throw shape. It does NOT call scanLldStaleness and does NOT generalize it into shared amendments/staleness.ts (rejected boundary breach a3). The comparator stays private to src/workflow/runners/build/ and is never re-exported. — ↩ rollbackable
5. Add src/workflow/runners/build/index.ts exporting admitBuild(repoPath, storyId), which resolves epicHash via the existing computeEpicHash (mirroring runners/plan/index.ts::upstream), then composes the approval wrapper (step 3) and the drift comparator (step 4) to return BuildAdmissionResult — admitted:true with the thin plan pointer, or admitted:false with the appropriate BuildAdmissionRefusal (staleness detail populated only for 'plan-stale'). New runner file mirroring runners/plan/index.ts; adds no second stage registration. — ↩ rollbackable
6. Wire the build phase handler in src/mcp/workflow-step/phases/build.ts (owned by s1's driving surface) to invoke admitBuild at the start turn and translate admitted:false into next:'refused', carrying BuildAdmissionRefusal in WorkflowStepOutputBuild.refusal — mirroring phases/plan.ts::handlePlan. This is the step that makes the refusal behaviour observable; because it runs inside the newly registered build stage (s1), no existing stage's behaviour changes. Reverting this handler wiring restores the pre-gate behaviour without touching any other stage. — ↩ rollbackable

**Backward compat:** No existing public API changes signature or contract, so no consumer migration is required. The reused accessors keep their current behaviour for their current callers: requireApprovedLld remains throwing (the non-throwing form is a contained build-private wrapper, not a shared-surface change — no HLD amendment), readPlanUpstream and readLldArtifact are consumed read-only, and scanLldStaleness is neither modified nor called, so chain.ts::readStoryLldStatus and cli/services/workflow.ts::staleness are unaffected. The only new externally-observable surface is additive: the build stage's start turn can now return next:'refused' with a BuildAdmissionRefusal — a new outcome on a newly-registered stage (s1), not a changed outcome on an existing one. BuildAdmissionResult/BuildAdmissionRefusal are new types; nothing previously depended on them.

## Alternatives considered

### a1: Build-local composed verdict (mirror the staleness pattern) — **CHOSEN**

One build-owned admission function sequences missing→unapproved→stale, returns the sketched BuildAdmissionResult, throws nothing — mirroring scanLldStaleness's return-a-typed-verdict rule.

sc3 stays exactly as the HLD sketches it: a discriminated union `{admitted:true, plan}` | `{admitted:false, refusal}` with `BuildRefusalReason` as a flat enum. A single private `admitBuild(repoPath, storyId): BuildAdmissionResult` in `src/workflow/runners/build/` composes the three upstream conditions in fixed order — resolve the PlanArtifact (missing → `plan-missing`), read its approval state via the gates.ts reader (unapproved → `plan-unapproved`), then run a NEW build-local comparator that reads `readPlanUpstream(repoPath, epicHash, storyId)`'s recorded design hash against the current design.story artifact hash (drift → `plan-stale`, populating `staleness.{planRecordedDesignHash,currentDesignHash}`). The comparator lives beside the gate, not in gates.ts or staleness.ts. It returns a verdict; it never throws — the caller (s1's build phase handler) turns `admitted:false` into `next:'refused'`. `treeUntouched:true` is structural because the function is pure/read-only and runs before any work list exists.

### a2: Catch-to-verdict adapter over gates.ts throwing accessors

Reuse gates.ts's existing typed errors (ArtifactMissingError→plan-missing, ArtifactNotApprovedError→plan-unapproved) by wrapping requireApproved* in try/catch and mapping each error to a BuildRefusalReason; only the stale check is new.

sc3's union is unchanged, but its computation leans maximally on the already-typed error taxonomy in gates.ts (ArtifactMissingError at gates.ts:44-49, ArtifactNotApprovedError at gates.ts:51-56). `admitBuild` calls the existing require-approved accessor against the PLAN artifact inside a try/catch; a catch on `ArtifactMissingError` yields `{admitted:false, refusal:{reason:'plan-missing'...}}`, a catch on `ArtifactNotApprovedError` yields `plan-unapproved`. Only the stale branch is bespoke: on successful approval, run the plan-vs-design hash comparison and, on drift, return `plan-stale`. The error→reason mapping is the whole of the missing/unapproved logic — s2 writes almost no new detection code for ac2/ac4, only the ac3 comparator.

**Rejected because:** Ranked 2. Smallest net-new surface (S) and guarantees 'approved'/'missing' definitions are identical to siblings by reusing gates.ts's errors. But it uses exceptions as control flow for the normal refusal path and couples tightly to gates.ts's private error classes whose fit against the plan artifact is unverified (k9), and it mixes throw-for-approval with return-for-stale in one function — less linear and harder to test than a1's uniform returned verdict. ac2/ac4 carry an adaptation risk (partial) that a1 avoids by composing read-only conditions directly.

### a3: Generalize the staleness engine into a shared amendments/staleness sibling

Add a hash-pair staleness primitive to amendments/staleness.ts that both the existing LLD-vs-HLD scan and s2's plan-vs-design check call, and let BuildAdmissionResult's staleness detail reuse a shared StaleEntry-shaped type.

Rather than a build-private comparator, push the plan-vs-design drift check into `src/workflow/amendments/staleness.ts` as a sibling export alongside `scanLldStaleness` — a narrow `isPlanStale(recordedDesignHash, currentDesignHash): StalePlanEntry | null` (or a small generalization of the existing engine to a `(recorded,current)` pair). sc3's `staleness` field is then typed from a shared stale type exported by staleness.ts instead of an inline literal. The build gate consumes this shared primitive; approval/missing still come from gates.ts. This treats staleness detection as one reusable concept across LLD-vs-HLD and plan-vs-design.

**Rejected because:** Ranked 4 (last). Widest blast radius: it edits shared amendments/staleness.ts, which the boundary explicitly forbids s2 from doing for drift detection, and generalizing scanLldStaleness (currently (repoPath, epicHash, baseHld)) into a bare hash-pair is flagged unverified (coverage-gap item 3), risking regressions in the existing chain.ts / cli/services/workflow.ts callers s2 would then own. sc3.staleness would be retyped from a shared staleness.ts export rather than the inline literal, breaking the Story boundary's explicit rule that HOW drift is detected stays private to s2 (sc3 partial). The reuse upside doesn't outweigh violating the privacy boundary that all three cleaner alternatives respect.

### a4: Thick accepted verdict carrying the resolved PlanArtifact

Same refusal union, but the admitted branch returns the fully-read PlanArtifact object (not just id+hash) so downstream Stories consume the plan s2 already resolved instead of re-reading it.

Refusal side of sc3 is unchanged from a1; the variation is the `BuildAdmissionAccepted` payload. Instead of the thin `{planArtifactId, planArtifactHash, storyId}` the HLD sketches, the accepted branch carries the resolved artifact — `{plan: PlanArtifact, planArtifactHash, storyId}` — because s2 must read the plan anyway to check approval and staleness. s3 (sequencing) and s5 consume that handle directly rather than re-resolving the PlanArtifact from disk. Detection composition can follow a1 (build-local, non-throwing); the distinguishing decision is the shape and richness of the verdict s2 hands its consumers.

**Rejected because:** Ranked 3. The read-elimination benefit (s3/s5 reuse the already-resolved plan, tightening the authorization-boundary NFR) is real, but it changes sc3's accepted shape away from the HLD's authoritative thin sketch ({planArtifactId,planArtifactHash,storyId}), couples consumers to the full PlanArtifact schema, and adds serialization weight (sc3 partial, sc2 partial). The refusal path fully satisfies ac1–ac4, but the contract deviation on an owned-but-HLD-specified type — arguably a back-flow note to s1 rather than a unilateral s2 decision — ranks it below a1/a2.

## Open questions

- s3's constraint scoring (s8/alt2, verdict: partial) scored every alternative against all four Story acceptance criteria (ac1-ac4) and all three HLD shared contracts (sc1,sc2,sc3) as discrete rows, but the Story-local constraint c1 and the Epic k-constraints (k5/k9 etc.) appear only in the prose rationale, not as scored rows per alternative — so 'every Story + Epic constraint' is not structurally scored per alternative and should be confirmed before build if that per-constraint traceability is required.
- Coverage-gap / c1 gate (carried into build): the exact parameter/return shape of requireApprovedLld and whether it (or a plan-specific approval reader) applies to the PLAN artifact — and how it distinguishes missing vs unapproved — is unread and MUST be confirmed against gates.ts before the non-throwing approval-wrapper behaviour is finalized (migration step 2).
