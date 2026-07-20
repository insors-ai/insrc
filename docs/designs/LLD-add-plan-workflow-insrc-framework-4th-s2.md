<!-- insrc:artifact LLD-1cd9a4c34f403a80-s2 -->

# LLD: E202607151cd9a4c3:S002

**Epic:** `add-plan-workflow-insrc-framework-4th`
**HLD base run:** `wf-1784121669696-i1rc6r`
**HLD effective hash:** `c7645d42a9f5...`

## HLD context

**Framework:** Implement `plan` as a new fine-grained instance of the shared workflow skeleton, peer to define/design.epic/design.story. A single runner module registers a fixed six-step recipe (context.assemble -> tasks.enumerate -> tasks.critique -> tasks.finalize -> test-strategy.write -> checklist.verify) whose outputs the orchestrator's three per-workflow arms turn into a persisted, cited PlanArtifact for exactly one Story. A new gate reads the Story's approved, non-stale LLD (adding requireApprovedLld by mirroring requireApprovedHld and reusing the existing effective-hash/staleness machinery), and a new storage helper writes the artifact under the as-built slug-md + hash-json convention. Nothing about the executor, state store, approval flow, or MCP phase loop changes except a single 'plan' arm added at each existing seam.
**Rollout phase:** Phase B — Gate, persistence, and test naming
**Owns:** `sc3` (PlanUpstreamGate)

## Contract details

**Surface level:** internal-shared

### `requireApprovedLld`

```typescript
function requireApprovedLld(repoPath: string, epicHash: string, storyId: string): LldArtifact
```

**Parameters:**
- `repoPath: string` — repo root
- `epicHash: string` — 16-hex Epic hash
- `storyId: string` — the Story whose LLD is being gated

**Returns:** `LldArtifact` — The approved, non-stale LLD; the function throws rather than returns when the design is unusable, mirroring requireApprovedHld.

**Errors:**
- `ArtifactMissingError` when no LLD JSON exists at the lldArtifactPaths location for (epicHash, storyId)
- `ArtifactNotApprovedError` when meta.approvedAt is missing, meta.rejectedAt is set, OR the recomputed effective hash differs from meta.hldEffectiveHash and meta.staleAckedAt is absent (stale)

**Preconditions:**
- the Story exists in the approved Define and its LLD has been produced

**Postconditions:**
- the returned LldArtifact is approved AND either non-stale or stale-acked

### `readPlanUpstream`

```typescript
function readPlanUpstream(repoPath: string, epicHash: string, storyId: string): PlanUpstream
```

**Parameters:**
- `repoPath: string` — repo root
- `epicHash: string` — 16-hex Epic hash
- `storyId: string` — the Story to plan

**Returns:** `PlanUpstream` — { lld, hldSlice, storyDependsOn } — the approved+non-stale LLD, the HLD context slice for this Story, and the define Story dependency edges.

**Errors:**
- `ArtifactNotApprovedError` when propagated from requireApprovedLld (or requireApprovedHld) when the LLD or its HLD is unusable

**Preconditions:**
- requireApprovedLld and requireApprovedHld both succeed for (epicHash, storyId)

**Postconditions:**
- the PlanUpstream contains only approved, current inputs; s1 can enumerate directly from it without any further approval/staleness check

### `computeHldEffectiveHash`

```typescript
function computeHldEffectiveHash(baseRunId: string, approvedAmendmentIds: readonly string[]): string
```

**Parameters:**
- `baseRunId: string` — the LLD's hldBaseRunId
- `approvedAmendmentIds: readonly string[]` — currently-approved HLD amendment ids

**Returns:** `string` — The current effective hash of the HLD; compared against the LLD's stored meta.hldEffectiveHash to detect staleness. Reused verbatim from lld.ts.

**Preconditions:**
- the LLD meta carries hldBaseRunId + hldEffectiveHash

**Postconditions:**
- equality with meta.hldEffectiveHash means non-stale; inequality means stale unless staleAckedAt is set

## Data model changes

### `PlanUpstream` — new

New in-memory read-model (not persisted) bundling the approved LLD, the HLD context slice (via extractHldContextSlice), and the define Story dependsOn edges. It is sc3's return type and s1's sole input.

```
+ interface PlanUpstream { lld: LldArtifact; hldSlice: HldContextSlice; storyDependsOn: readonly string[] }
```

**Call sites:**
- `src/workflow/gates.ts (new requireApprovedLld + readPlanUpstream live beside requireApprovedHld)`
- `src/workflow/artifacts/lld.ts (extractHldContextSlice reused to build hldSlice)`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc3` | implements | s2 owns and implements sc3: requireApprovedLld is the throwing gate (mirroring requireApprovedHld) and readPlanUpstream composes it with requireApprovedHld + extractHldContextSlice + the Define storyDependsOn to return the PlanUpstream. All approval/staleness mechanics stay private to these two functions; s1 sees only the assembled PlanUpstream or a thrown ArtifactNotApprovedError. |

## Error paths

### Error cases

- **The Story's LLD is not approved yet (meta.approvedAt missing).** (recoverable)
  - Detection: requireApprovedLld reads the LLD JSON and finds meta.approvedAt absent.
  - Response: Throw ArtifactNotApprovedError naming the Story + the approve command, exactly as requireApprovedHld does.
  - User impact: The plan run stops before enumeration; the user is told to approve the LLD.
- **The Story's LLD was rejected (meta.rejectedAt set).** (recoverable)
  - Detection: requireApprovedLld sees meta.rejectedAt present.
  - Response: Throw ArtifactNotApprovedError reporting the rejection.
  - User impact: The plan run stops; the user must re-run/re-approve design.story.
- **The LLD is approved but stale (its HLD effective state changed after approval).** (recoverable)
  - Detection: requireApprovedLld recomputes computeHldEffectiveHash(meta.hldBaseRunId, currentApprovedAmendmentIds) and finds it differs from meta.hldEffectiveHash, with meta.staleAckedAt absent.
  - Response: Throw ArtifactNotApprovedError reporting the staleness (same reason string shape scanLldStaleness emits).
  - User impact: The plan run stops; the user re-runs design.story against the current HLD or ack-stales it.
- **No LLD JSON exists for the Story at all.** (recoverable)
  - Detection: requireApprovedLld finds no file at the lldArtifactPaths(epicHash, storyId) location.
  - Response: Throw ArtifactMissingError telling the user to run design.story first.
  - User impact: The plan run stops; the user must design the Story before planning it.

### Edge cases

| Input | Expected |
| :--- | :--- |
| An approved-but-stale LLD whose meta.staleAckedAt is set (a human consciously overrode the staleness). | requireApprovedLld returns the LLD (stale-ack allows it), so planning proceeds — identical to how scanLldStaleness treats an acked-stale artifact. |
| An approved, non-stale LLD with zero approved HLD amendments (Phase D case: hldEffectiveHash == sha256(hldBaseRunId)). | computeHldEffectiveHash matches meta.hldEffectiveHash; the gate passes and readPlanUpstream assembles the PlanUpstream. |
| An approved LLD whose Story has no dependsOn edges in the Define. | readPlanUpstream returns storyDependsOn = [] (empty is valid, not an error). |

### Invariants to preserve

- Staleness is defined in exactly one place: requireApprovedLld reuses computeHldEffectiveHash + the scanLldStaleness comparison and honors meta.staleAckedAt; it must never introduce a second, divergent notion of 'stale'. [[c1]]
- The gate signals refusal by THROWING ArtifactNotApprovedError, exactly like requireApprovedEpic/requireApprovedHld, so downstream error handling stays uniform across all gates. [[c1]]
- readPlanUpstream sources every input from the same approved DEF-/HLD-/LLD- artifacts the other gates read (via extractHldContextSlice + the Define story.dependsOn); it introduces no new data source. [[c2]]

## Test strategy

**Test framework:** `node:test (tsx --test), extending src/workflow/amendments/__tests__/effective-and-staleness.test.ts + the gates test patterns`

### Test levels

- **unit** — Exercise requireApprovedLld directly over seeded LLD-meta fixtures, mirroring effective-and-staleness.test.ts.
  - Subjects: `requireApprovedLld returns the LLD when approved + non-stale`, `requireApprovedLld throws ArtifactNotApprovedError when meta.approvedAt is missing`, `requireApprovedLld throws ArtifactNotApprovedError when meta.rejectedAt is set`, `requireApprovedLld throws when the recomputed effective hash != meta.hldEffectiveHash and staleAckedAt is absent`, `requireApprovedLld returns the LLD when stale but meta.staleAckedAt is set`, `requireApprovedLld throws ArtifactMissingError when no LLD file exists`, `readPlanUpstream assembles { lld, hldSlice, storyDependsOn } from approved artifacts (storyDependsOn defaults to [])`
  - Fixtures: `seeded LLD metas: approved/non-stale, unapproved, rejected, stale, stale-acked`, `an approved HLD + Define fixture so extractHldContextSlice + story.dependsOn resolve`
- **integration** — Confirm the plan workflow refuses at the gate through the MCP phase loop.
  - Subjects: `a plan run whose Story LLD is unapproved returns an error (no PlanArtifact written)`, `a plan run whose Story LLD is stale (no ack) returns an error`, `a plan run whose Story LLD is approved+non-stale proceeds past the gate`
  - Fixtures: `seeded approved+non-stale, unapproved, and stale LLD variants on disk`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: requireApprovedLld throws ArtifactNotApprovedError on missing approvedAt`, `unit: requireApprovedLld throws on rejectedAt`, `integration: plan run over an unapproved LLD errors with no artifact written` |
| `ac2` | `unit: requireApprovedLld throws when effective hash differs and staleAckedAt is absent`, `unit: requireApprovedLld allows a stale-acked LLD`, `integration: plan run over a stale (un-acked) LLD errors` |

## Migration

**State before:** Today gates.ts has requireApprovedEpic + requireApprovedHld (throwing ArtifactNotApprovedError) and ackStaleArtifact, and LLD staleness is computed by scanLldStaleness in amendments/staleness.ts against computeHldEffectiveHash — but there is NO requireApprovedLld and no PlanUpstream read-model [[c1]]. Nothing gates an LLD for downstream consumption by a plan stage.

**State after:** gates.ts gains two additive functions — requireApprovedLld (a throwing peer of requireApprovedHld that also checks staleness via the existing computeHldEffectiveHash comparison, honoring staleAckedAt) and readPlanUpstream (composing them into the PlanUpstream read-model). No existing gate is modified.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the PlanUpstream interface (in-memory read-model) beside the existing gate types. Pure addition. — ↩ rollbackable
2. Add requireApprovedLld to gates.ts, reusing readHldArtifact-style reads, the ArtifactNotApprovedError type, and computeHldEffectiveHash + the scanLldStaleness comparison (honoring staleAckedAt). Additive; existing gates untouched. — ↩ rollbackable
3. Add readPlanUpstream to gates.ts, composing requireApprovedLld + requireApprovedHld + extractHldContextSlice + the Define story.dependsOn. Additive. — ↩ rollbackable
4. No data backfill: existing LLD/HLD/Define artifacts already carry hldBaseRunId/hldEffectiveHash, so the staleness recompute works on them as-is. — ↩ rollbackable

**Backward compat:** No existing public API changes: requireApprovedEpic/requireApprovedHld/ackStaleArtifact/scanLldStaleness keep their signatures and behaviour. The two new functions are purely additive and only invoked by the plan runner; nothing else calls them, so no existing caller is affected.

## Alternatives considered

### a1: Two functions: strict requireApprovedLld + composing readPlanUpstream — **CHOSEN**

requireApprovedLld does the throw-on-unusable check (unapproved/rejected/stale, honoring staleAckedAt); readPlanUpstream calls it then assembles the PlanUpstream (LLD + HLD slice + storyDependsOn).

requireApprovedLld(repoPath, epicHash, storyId) reads the LLD JSON, throws ArtifactNotApprovedError when meta.approvedAt is missing or meta.rejectedAt is set, then recomputes the effective hash via computeHldEffectiveHash and compares it to meta.hldEffectiveHash exactly as scanLldStaleness does; on mismatch it throws unless meta.staleAckedAt is present. readPlanUpstream calls requireApprovedLld, then reads the approved HLD (via requireApprovedHld) to build the HLD slice with extractHldContextSlice, and reads the approved Define's story.dependsOn, returning a PlanUpstream. The two mirror the existing requireApprovedHld / readUpstream split in design.story.

### a2: Single readPlanUpstream that returns a discriminated result

One function returns { ok: true, upstream } | { ok: false, reason: 'unapproved'|'rejected'|'stale' } instead of throwing.

readPlanUpstream performs the approval + staleness checks inline and returns a discriminated union rather than throwing; the plan runner branches on ok. Staleness still reuses computeHldEffectiveHash + the scanLldStaleness comparison and honors staleAckedAt.

**Rejected because:** Functionally refuses correctly but diverges from sc3's declared throwing requireApprovedLld (returns LldArtifact) and the framework-wide throw-based gate convention (partial on sc3/k7); a1 wins on contract-fidelity and convention-consistency.
