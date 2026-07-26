<!-- insrc:artifact LLD-e476d952c16b5abd-S001 -->

# LLD: S001

**Epic:** `fix-plan-standalone-gap-plan-workflow`
**HLD base run:** `wf-1785049564329-n5yrfj`
**HLD effective hash:** `e476d952c16b...`

## HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## Contract details

**Surface level:** internal

### `readPlanUpstream`

```typescript
readPlanUpstream(repoPath: string, epicHash: string, storyId: string): PlanUpstream
```

**Parameters:**
- `repoPath: string` — Registered repo path used to resolve the approved LLD/HLD/epic artifacts.
- `epicHash: string` — Epic hash keying the approved artifacts; for a standalone LLD it keys only the standalone story's own artifact set (no HLD/epic reads).
- `storyId: string` — Story id whose approved LLD is loaded to discover meta.standalone and drive the scope-aware upstream reads.

**Returns:** `PlanUpstream` — Upstream grounding for the plan runner. Epic-scoped story: full hldSlice + storyDependsOn (unchanged). Standalone LLD (approved lld.meta.standalone === true): hldSlice is null (HLD read skipped) and storyDependsOn is empty (epic read skipped); grounding is the approved LLD alone.

**Errors:**
- `throw` when Epic-scoped story (lld.meta.standalone !== true) with no approved HLD — retains the existing hard gate via requireApprovedHld ('HLD not found — Run design.epic'). This throw MUST NOT fire on the standalone path.
- `throw` when No approved LLD for (repoPath, epicHash, storyId) — requireApprovedLld throws as today; meta.standalone is unreadable without it.

**Preconditions:**
- The story's LLD is approved (requireApprovedLld succeeds); its meta.standalone determines whether HLD/epic reads happen.

**Postconditions:**
- When meta.standalone is true: no requireApprovedHld/requireApprovedEpic call is made; hldSlice === null and storyDependsOn is empty.
- When meta.standalone is false: behaviour is byte-for-byte the pre-change path — requireApprovedHld + requireApprovedEpic run and populate hldSlice + storyDependsOn.

## Data model changes

### `PlanUpstream` — field-modify

hldSlice becomes nullable — its type widens from the current non-null HLD slice to `HldSlice | null` (null/absent for standalone LLDs where the HLD read is skipped). storyDependsOn is permitted to be empty on the standalone path. This is the return type of readPlanUpstream (src/workflow/gates.ts:282-290); the winning alternative (a1) mirrors the requireApprovedLld standalone branch (gates.ts:227-266) rather than introducing a scope union. NOTE: the declaration site of PlanUpstream is UNCONFIRMED by indexed exploration (observed only as a gates.ts return type) and must be located directly before editing.

```
-  hldSlice: HldSlice
+  hldSlice: HldSlice | null
```

**Call sites:**
- `src/workflow/gates.ts (readPlanUpstream — producer; composes requireApprovedHld/requireApprovedEpic conditionally on lld.meta.standalone)`
- `src/workflow/runners/plan/index.ts (plan runner context.assemble — sole consumer; must guard `if (up.hldSlice)` and omit the HLD block from the prompt when the slice is null/empty; usage.example reported 0 indexed callers, so this callsite is UNCONFIRMED and must be located directly before editing)`

## Error paths

### Error cases

- **An epic-scoped story (approved lld.meta.standalone !== true) is sent through the plan runner but no approved HLD artifact exists for (repoPath, epicHash).** (recoverable)
  - Detection: On the non-standalone branch readPlanUpstream still calls requireApprovedHld, which resolves the HLD artifact path and finds no artifact with approvedAt set (file absent / unapproved).
  - Response: Throws the existing 'HLD not found — Run design.epic' exactly as today — the hard HLD gate is retained unchanged for epic-scoped stories; this Story does not soften it.
  - User impact: Plan run aborts with a directive to run design.epic first; behavior is byte-for-byte identical to the current system.
- **readPlanUpstream is called for a (repoPath, epicHash, storyId) whose LLD has not been approved, so the scope discriminator meta.standalone cannot be read.** (recoverable)
  - Detection: requireApprovedLld is invoked first — before any scope branching — and fails to load an approved LldArtifact (no approvedAt), so lld.meta.standalone is never reachable.
  - Response: requireApprovedLld throws as it does today; readPlanUpstream propagates the throw and never evaluates the standalone-vs-epic branch.
  - User impact: Plan run aborts; the user must approve the story's LLD before planning. Unchanged from current behavior.
- **On the standalone path hldSlice is null, and the plan runner's context.assemble consumes it without a null guard (the UNCONFIRMED callsite in src/workflow/runners/plan/index.ts).** (terminal)
  - Detection: context.assemble reads properties off up.hldSlice while up.hldSlice === null, producing a TypeError at prompt-assembly time on the standalone plan path.
  - Response: The consumer MUST guard with `if (up.hldSlice)` and omit the HLD block from the assembled prompt when the slice is null — no dereference of a null slice; the standalone plan run completes grounded on the LLD alone.
  - User impact: Without the guard, standalone-feature plans crash instead of planning; with the guard, they plan cleanly without an HLD block. This is the core defect the Story fixes.

### Edge cases

| Input | Expected |
| :--- | :--- |
| Approved standalone LLD (lld.meta.standalone === true) planned via readPlanUpstream. | requireApprovedHld and requireApprovedEpic are NOT called; hldSlice === null and storyDependsOn is empty; grounding is the approved LLD alone. The 'HLD not found — Run design.epic' throw never fires. |
| PlanUpstream with hldSlice === null reaches the plan runner's context.assemble. | The HLD block is omitted from the assembled prompt (guarded by `if (up.hldSlice)`); the prompt is well-formed and grounds only on the LLD — no throw, no empty/placeholder HLD block. |
| An older or hand-edited approved LLD whose meta has no `standalone` field (undefined / non-boolean). | Read as falsy, i.e. treated as epic-scoped: the full requireApprovedHld + requireApprovedEpic path runs and hldSlice is populated — matching how requireApprovedLld's existing branch already defaults on the same flag. No regression for pre-flag LLDs. |
| Approved epic-scoped LLD with meta.standalone === false. | Behavior is byte-for-byte the pre-change path: requireApprovedHld + requireApprovedEpic run, hldSlice is the non-null HLD slice, and storyDependsOn is populated from the epic. |

### Invariants to preserve

- Epic-scoped stories (lld.meta.standalone !== true) retain the full HLD+epic hard gate: readPlanUpstream still composes requireApprovedHld + requireApprovedEpic, and the 'HLD not found — Run design.epic' throw fires unchanged when the approved HLD is absent. [[c1]]
- The standalone discrimination reuses the existing lld.meta.standalone flag exactly as requireApprovedLld (gates.ts:227-266) already branches on it — no new scope union or scope flag is introduced; the winning alternative mirrors that branch. [[c2]]
- readPlanUpstream keeps its signature readPlanUpstream(repoPath, epicHash, storyId): PlanUpstream and loads the approved LLD first (requireApprovedLld) so meta.standalone is available before any HLD/epic read decision. [[c1]]
- meta.standalone is the sole scope discriminator for skipping the HLD slice and epic/storyDependsOn reads — the same flag the design.story gate already uses to skip HLD-staleness; no other signal gates the standalone path. [[c4]]
- The plan runner's context.assemble is the only consumer of PlanUpstream (usage.example reported 0 indexed callers of readPlanUpstream), so widening hldSlice to `HldSlice | null` cannot break any other caller — but that single consumer must be located and null-guarded before shipping. [[c3]]

## Test strategy

**Test framework:** `node:test (tsx --test), *.test.ts under src/**/__tests__/`

### Test levels

- **unit** — Prove readPlanUpstream's new scope-aware branching directly against real gate signatures: standalone LLD skips HLD/epic reads and grounds only on the approved LLD; epic-scoped LLD retains the full hard gate byte-for-byte.
  - Subjects: `readPlanUpstream (src/workflow/gates.ts:282-290)`, `requireApprovedHld / requireApprovedEpic conditional composition on lld.meta.standalone`, `PlanUpstream shape (hldSlice nullable, storyDependsOn empty on standalone)`
  - Fixtures: `approved standalone LLD artifact (meta.standalone === true)`, `approved epic-scoped LLD (meta.standalone === false) + approved HLD + approved epic artifacts`, `approved epic-scoped LLD with HLD artifact absent/unapproved (to assert the retained throw)`, `approved LLD whose meta omits the standalone field (undefined) — pre-flag regression case`, `plan-fixture seeding helpers reused from admit-build.test.ts (planObject L47, seedPlan L66)`
- **unit** — Prove the sole downstream consumer — the plan runner's context.assemble — null-guards hldSlice and omits the HLD block from the assembled prompt when the slice is null, instead of dereferencing null (the core defect).
  - Subjects: `plan runner context.assemble (src/workflow/runners/plan/index.ts, llmPauseRunner)`, `prompt assembly under hldSlice === null`
  - Fixtures: `PlanUpstream with hldSlice === null and empty storyDependsOn`, `PlanUpstream with a populated non-null hldSlice (epic-scoped control)`
- **integration** — Exercise the end-to-end plan path so a standalone-feature story plans cleanly without an HLD, confirming the gate + runner changes compose through the real workflow-step entry.
  - Subjects: `plan-e2e path via startAndPlan helper (src/mcp/workflow-step/__tests__/plan-e2e.test.ts:123)`
  - Fixtures: `seeded standalone story with approved LLD, no HLD/epic present`, `seeded epic-scoped story with approved HLD+epic (regression control)`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `plan-gate.test.ts › standalone LLD (meta.standalone===true) skips requireApprovedHld and requireApprovedEpic and grounds only on the approved LLD`, `plan-gate.test.ts › standalone path never throws 'HLD not found — Run design.epic'` |
| `ac2` | `plan-artifact.test.ts › PlanUpstream.hldSlice === null and storyDependsOn is empty on the standalone path` |
| `ac3` | `plan-gate.test.ts › epic-scoped LLD (meta.standalone===false) still composes requireApprovedHld + requireApprovedEpic and populates hldSlice + storyDependsOn (byte-for-byte)`, `plan-gate.test.ts › epic-scoped LLD with absent/unapproved HLD throws 'HLD not found — Run design.epic'` |
| `ac4` | `plan-runner context.assemble test › omits the HLD block from the assembled prompt when hldSlice === null with no TypeError`, `plan-runner context.assemble test › includes the HLD block when hldSlice is non-null` |
| `ac5` | `plan-gate.test.ts › approved LLD with undefined meta.standalone is treated as epic-scoped (full HLD+epic path runs)`, `plan-gate.test.ts › readPlanUpstream on an unapproved LLD propagates requireApprovedLld throw before any scope branching` |
| `ac6` | `plan-e2e.test.ts › standalone-feature story plans cleanly with no HLD present`, `plan-e2e.test.ts › epic-scoped story regression: plan still requires and grounds on the approved HLD` |

## Migration

**State before:** Per s1 analyze bundles (symbol.locate + data-model.trace on src/workflow/gates.ts): readPlanUpstream(repoPath, epicHash, storyId): PlanUpstream (gates.ts:282-290) unconditionally composes requireApprovedHld(repoPath, epicHash): HldArtifact (gates.ts:185-196) and requireApprovedEpic(repoPath, epicHash): DefineArtifact (gates.ts:146-163). For a standalone (triage-routed, no-HLD) feature with an approved standalone LLD, requireApprovedHld hard-gates the HLD start point and throws 'HLD not found — Run design.epic' (search.text bundle). PlanUpstream.hldSlice is currently non-null (HldSlice) and storyDependsOn is always populated from the epic read. The sole downstream consumer is the plan runner's context.assemble in src/workflow/runners/plan/index.ts (usage.example reported 0 indexed callers — UNCONFIRMED, must be located directly), which currently always emits an HLD block in its prompt. requireApprovedLld (gates.ts:227-266) already reads lld.meta.standalone to skip HLD-staleness — the reference branch this change mirrors.

**State after:** readPlanUpstream first resolves the approved LLD via requireApprovedLld and inspects lld.meta.standalone. When standalone === true, it skips both requireApprovedHld and requireApprovedEpic, returns hldSlice === null and an empty storyDependsOn, and grounds only on the approved LLD — the 'HLD not found — Run design.epic' throw never fires on this path. When standalone !== true, behaviour is byte-for-byte unchanged: requireApprovedHld + requireApprovedEpic run and populate hldSlice + storyDependsOn, retaining the existing hard gate. PlanUpstream.hldSlice is widened to HldSlice | null. The plan runner's context.assemble guards on the slice and omits the HLD block from its prompt when hldSlice is null/empty; the epic-scoped prompt is unchanged.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Locate the declaration site of PlanUpstream and the artifact types (HldArtifact/DefineArtifact/LldArtifact) — UNCONFIRMED by indexed exploration (observed only as gates.ts return types per s1 data-model.trace); confirm before editing. No behaviour change. — ↩ rollbackable
2. Widen PlanUpstream.hldSlice from HldSlice to nullable (HldSlice | null) at its declaration site, so a null/absent slice is representable. Additive-nullable type widening; existing epic-scoped producers/consumers still satisfy the wider type. — ↩ rollbackable
3. In readPlanUpstream (gates.ts:282-290), load the approved LLD via requireApprovedLld and branch on lld.meta.standalone, mirroring the existing standalone branch in requireApprovedLld (gates.ts:227-266). On the standalone-true branch, skip requireApprovedHld and requireApprovedEpic, and return hldSlice as null with an empty storyDependsOn. Keep the epic-scoped branch (standalone !== true) calling requireApprovedHld + requireApprovedEpic exactly as today. — ↩ rollbackable _(needs: `lld.meta.standalone`)_
4. Locate the plan runner's context.assemble callsite in src/workflow/runners/plan/index.ts (UNCONFIRMED — usage.example reported 0 indexed callers per s1) and add a guard that omits the HLD block from the assembled prompt when hldSlice is null/empty, leaving the epic-scoped prompt path unchanged. — ↩ rollbackable
5. Add standalone-LLD coverage to src/workflow/__tests__/plan-gate.test.ts and src/workflow/__tests__/plan-artifact.test.ts asserting that a standalone LLD skips HLD/epic reads, yields hldSlice === null + empty storyDependsOn, and does not throw 'HLD not found — Run design.epic'; assert the epic-scoped path is unchanged. Reuse plan-fixture seeding helpers (planObject/seedPlan) from admit-build.test.ts. Test-only, no runtime effect. — ↩ rollbackable

**Backward compat:** Surface is internal (not a public/exported API contract), so no external consumers break. Within the codebase: PlanUpstream.hldSlice widens from HldSlice to HldSlice | null — a type widening on the producer, so every existing epic-scoped caller keeps receiving a non-null slice and is unaffected. The single internal consumer (plan runner context.assemble) must be updated in lock-step to guard on null before reading hldSlice (step 4); until that guard lands, a standalone plan run would dereference a null slice. The epic-scoped path (lld.meta.standalone !== true) is preserved byte-for-byte — same requireApprovedHld/requireApprovedEpic calls, same populated hldSlice + storyDependsOn, and the 'HLD not found — Run design.epic' throw still fires for epic-scoped stories lacking an approved HLD. No error-message or throw-condition change on the existing path.

## Alternatives considered

### a1: Nullable hldSlice + empty storyDependsOn (mirror the LLD gate's standalone branch) — **CHOSEN**

readPlanUpstream branches on lld.meta.standalone; PlanUpstream.hldSlice becomes HldSlice | null and storyDependsOn returns [] for standalone.

Keep the single PlanUpstream shape and the single readPlanUpstream(repoPath, epicHash, storyId) signature. After requireApprovedLld, read lld.meta.standalone (the same discriminator requireApprovedLld already branches on at gates.ts:227-266). When true, SKIP requireApprovedHld and requireApprovedEpic entirely and return { hldSlice: null, storyDependsOn: [] } grounded only on the approved LLD; when false, keep the existing hard HLD+epic reads. Change the PlanUpstream type so hldSlice is nullable (HldSlice | null) and document that storyDependsOn may be empty. The plan runner's context.assemble omits the HLD prompt block when hldSlice == null.

### a2: Scope-discriminated union PlanUpstream (tagged epic | standalone)

PlanUpstream becomes a tagged union { scope: 'epic', hldSlice, storyDependsOn } | { scope: 'standalone', ... } so the empty-HLD case is impossible to construct wrong.

Reshape PlanUpstream into a discriminated union keyed on a `scope: 'epic' | 'standalone'` tag. The 'epic' variant carries the present-day hldSlice: HldSlice and storyDependsOn: StoryDep[]; the 'standalone' variant carries neither HLD field (only the LLD grounding), so an absent HLD slice is representable only in the standalone variant. readPlanUpstream reads lld.meta.standalone and constructs the corresponding variant, skipping requireApprovedHld/requireApprovedEpic for standalone. The plan runner switches on up.scope to decide whether to assemble the HLD block — no nullish check.

**Rejected because:** Most type-safe in the abstract (invalid 'epic scope but no HLD' state is unrepresentable, exhaustive compiler-checked narrowing), but the wrong altitude for this fix: it is an M-bucket reshape of a contract the Story scoped as 'make hldSlice nullable', forces every existing PlanUpstream consumer to narrow on `scope` when only one callsite is confirmed and the declaration site is still UNCONFIRMED (backFlowNotes), and diverges from the requireApprovedLld boolean-branch reference pattern, reducing local consistency. Over-shaping with unknown blast radius outweighs the type-safety gain here. (winnerRank 3)

### a3: Explicit standalone flag on PlanUpstream + sentinel-empty HLD fields

Add PlanUpstream.standalone: boolean; keep hldSlice/storyDependsOn always present but empty for standalone, so scope is one explicit flag.

Keep hldSlice and storyDependsOn structurally present (empty object/array sentinels for standalone) and add a single `standalone: boolean` field to PlanUpstream set from lld.meta.standalone. readPlanUpstream skips requireApprovedHld/requireApprovedEpic when standalone is true and fills the sentinel empties. The plan runner's context.assemble omits the HLD block when up.standalone === true (a single authoritative predicate, independent of whether the empties happen to be non-null).

**Rejected because:** Sound engineering — one explicit `standalone` predicate avoids both null-guarding and two-signal drift, and hldSlice stays non-nullable. But it directly contradicts the Story's explicit 'make hldSlice nullable' directive, substituting an empty-sentinel HLD slice that is a weaker absence signal than null and can be mistaken for a real-but-empty HLD. It also duplicates lld.meta.standalone into a second field that can independently be wrong. Ranked above a2 because it stays in the S bucket and touches only the runner, but below a1 for fighting the stated contract shape. (winnerRank 2)

## Open questions

- Invariant `source` fields cite undefined labels c1/c2/c3/c4 rather than naming the analyze bundle that grounds each invariant (s8 ep3 verdict: partial). The invariant substance is grounded in s1 prose, but the formal bundle citation is missing and should be reconciled during build so each invariant points at its real analyze source.
- PlanUpstream declaration site and the artifact types (HldArtifact/DefineArtifact/LldArtifact) are UNCONFIRMED by indexed exploration — observed only as gates.ts return types; their file must be located directly before widening hldSlice to `HldSlice | null`.
- The plan runner's context.assemble callsite in src/workflow/runners/plan/index.ts is UNCONFIRMED (usage.example reported 0 indexed callers of readPlanUpstream); the exact site that must guard `if (up.hldSlice)` and omit the HLD prompt block must be located directly before editing.

## Citations

- **[[c1]]** `step-output` `s1.analyzeBundles[symbol.locate] — readPlanUpstream(repoPath, epicHash, storyId): PlanUpstream at src/workflow/gates.ts:282-290 composing requireApprovedHld (185-196) + requireApprovedEpic (146-163)` — "Edit target: readPlanUpstream(repoPath: string, epicHash: string, storyId: string): PlanUpstream (L282–290) — it currently composes requireApprovedHld(repoPath, epicHash): HldArtifact (L185–196) and r"
- **[[c2]]** `step-output` `s1.analyzeBundles[symbol.locate] — requireApprovedLld standalone branch at src/workflow/gates.ts:227-266 is the reference pattern to mirror` — "The pattern to MIRROR is requireApprovedLld(repoPath, epicHash, storyId): LldArtifact (L227–266), the design.story gate that already branches on lld.meta.standalone to skip HLD-staleness."
- **[[c3]]** `step-output` `s1.analyzeBundles[usage.example] — readPlanUpstream has 0 indexed callers; sole consumer is src/workflow/runners/plan/index.ts context.assemble (UNCONFIRMED)` — "The usage.example probe (e5) for readPlanUpstream returned 0 indexed callers (totalCallers: 0) ... The Story requires that runner's context.assemble to omit the HLD block from its prompt when the slic"
- **[[c4]]** `step-output` `s1.analyzeBundles[search.text] — meta.standalone is the scope discriminator reused from requireApprovedLld to skip the HLD slice + epic/storyDependsOn reads` — "meta.standalone is the scope discriminator: requireApprovedLld (L227–266) already branches on lld.meta.standalone to skip HLD-staleness, and the fix reuses that same flag to conditionally skip the HLD"
- **[[c5]]** `step-output` `s3.winnerId — a1 chosen; s2 alternatives a1/a2/a3 with s3 rankings` — "winnerId: a1 ... a1 alone satisfies the literal directive ('make hldSlice nullable') AND mirrors the requireApprovedLld standalone branch it was told to mirror, at the smallest surface"
- **[[c6]]** `step-output` `s4.dataModel[PlanUpstream] — field-modify widening hldSlice to HldSlice | null` — "hldSlice becomes nullable — its type widens from the current non-null HLD slice to `HldSlice | null` ... schemaDiff: -  hldSlice: HldSlice / +  hldSlice: HldSlice | null"
- **[[c7]]** `step-output` `s7.migration — stateBefore/stateAfter + 5 rollbackable migrationSteps; backwardCompat preserves epic path byte-for-byte` — "PlanUpstream.hldSlice is widened to HldSlice | null. The plan runner's context.assemble guards on the slice and omits the HLD block from its prompt when hldSlice is null/empty; the epic-scoped prompt "
- **[[c8]]** `step-output` `s8.results[ep3] — partial verdict: invariant sources cite undefined c1-c4 labels rather than the analyze bundle` — "the `source` fields cite undefined labels `c1`/`c2`/`c3`/`c4` rather than naming the analyze bundle showing the invariant. The substance is grounded; the formal citation mechanism the item asks for (c"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 6 LOW** · model `client` · reviewed 2026-07-26T08:38:13.587Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| c1 | citation | LOW | manual | readPlanUpstream in src/workflow/gates.ts composes requireApprovedLld + requireApprovedHld + requireApprovedEpic (the unconditional HLD/epic reads to be made scope-aware). | `function readPlanUpstream` = 1 match in gates.ts; requireApprovedHld( (7) and requireApprovedEpic( (13) are called. The edit target composes the unconditional HLD+epic reads as the LLD states. | none — verified sound |
| c2 | citation | LOW | manual | requireApprovedLld in gates.ts already branches on lld.meta.standalone (the reference pattern to mirror). | `function requireApprovedLld` = 1; `lld.meta.standalone` = 1; `meta.standalone === true` = 1. The reference branch the fix mirrors exists exactly as described. | none — verified sound |
| c3 | citation | LOW | manual | The plan runner's context.assemble in src/workflow/runners/plan/index.ts is the sole consumer that reads hldSlice from the plan upstream (the site to null-guard). | plan/index.ts:88 read found=true (the `const { lld, hldSlice, storyDependsOn } = upstream(ctx)` destructure); hldSlice appears 38x, context.assemble present. The sole consumer to null-guard is confirmed — resolves the LLD's 'UNCONFIRMED consumer' open question. | none — verified sound |
| c6 | semantic | LOW | manual | PlanUpstream is a type with an hldSlice field (currently non-null) returned by readPlanUpstream. | `interface PlanUpstream` = 1 match with an hldSlice field. The declaration site exists — resolves the LLD's 'PlanUpstream declaration UNCONFIRMED' open question; hldSlice is the field to widen. | none — verified sound |
| c4 | citation | LOW | manual | meta.standalone is a field on the workflow artifact meta (ArtifactMetaBase) that flags a standalone (no-HLD) LLD. | `readonly standalone?:` at src/workflow/types.ts:359 (read found=true). The scope discriminator the fix keys on exists on the artifact meta. | none — verified sound |
| c1 | citation | LOW | manual | requireApprovedHld throws an 'HLD not found — Run design.epic' style error when the HLD is absent. | requireApprovedHld (1) + 'HLD not found' (1) + 'Run design.epic' (1) all present in gates.ts — the retained epic-scoped throw the fix must NOT fire on the standalone path. | none — verified sound |
