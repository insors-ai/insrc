<!-- insrc:artifact LLD-d3e71f3a6001e773-S001 -->

# LLD: S001

**Epic:** `build-ledger-plan-driven-builds-today`
**HLD base run:** `wf-1785861871369-hn8p08`
**HLD effective hash:** `d3e71f3a6001...`

## HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## Contract details

**Surface level:** internal-shared

### `persistBuildRecord`

```typescript
(repoPath: string, rec: BuildRecord) => { md: string; json: string }
```

**Parameters:**
- `repoPath: string` — Registered repo root; locates .insrc/artifacts + docs/builds via buildArtifactPaths.
- `rec: BuildRecord` — The story-level BUILD record to upsert (meta.{workflow:'build',standalone,epicHash,storyId,createdAt} + body).

**Returns:** `{ md: string; json: string }` — Absolute paths of the written json + md (from buildArtifactPaths).

**Errors:**
- `none (best-effort)` when A malformed existing record is treated as absent (fresh write); IO errors surface from writeAtomic as today.

**Preconditions:**
- repoPath is a registered repo
- rec.meta.epicHash + rec.meta.storyId are set (keys the BUILD-<epicHash>-<storyId> paths)

**Postconditions:**
- BUILD-<epicHash>-<storyId>.json + BUILD-<slug>-<storyId>.md written atomically
- If a prior record existed, its tasks[] are UNIONED and createdAt is preserved (upsert-merge), else a fresh record is written

### `persistStandaloneBuildRecord`

```typescript
(repoPath: string, rec: StandaloneBuildRecord) => { md: string; json: string }
```

**Parameters:**
- `repoPath: string` — Registered repo root.
- `rec: StandaloneBuildRecord` — A standalone (Trivial) record; standalone:true.

**Returns:** `{ md: string; json: string }` — Written json + md paths.

**Errors:**
- `none` when Unchanged behavior.

**Preconditions:**
- Trivial standalone build with epicHash + storyId

**Postconditions:**
- Byte-identical to today: delegates to persistBuildRecord with standalone:true; the Trivial path output is unchanged

### `handleValidate`

```typescript
(input: BuildStepInputValidate) => Promise<BuildStepValidate | BuildStepError>
```

**Parameters:**
- `input: BuildStepInputValidate` — The validate-phase input carrying repo + target (task ref).

**Returns:** `Promise<BuildStepValidate | BuildStepError>` — The daemon's read-only verdict (verdict + passed), unchanged shape.

**Errors:**
- `no-repo / unresolved-target` when Existing validate refusals are unchanged.

**Preconditions:**
- A plan-driven (non-standalone) validate target resolving to an approved-plan story

**Postconditions:**
- After the daemon verdict, for a plan-driven target, persistBuildRecord upserts BUILD-<epicHash>-<storyId>.json recording the validated task + passed (standalone:false)
- The returned verdict shape is unchanged; persistence is a side effect that never alters the verdict

## Data model changes

### `BuildRecord (generalized from StandaloneBuildRecord)` — field-modify

Widen meta.standalone from the `true` literal to `boolean`, and add optional provenance to body for plan-driven records. Meta: { workflow:'build'; standalone: boolean; sizeClass?: string; triageRationale?: string; epicHash: string; storyId: string; createdAt: string; updatedAt?: string }. Body: the existing standalone { focus; producesLld } stays valid; add optional { tasks?: { id: string; passed?: boolean }[]; commit?: string } for the plan-driven record. StandaloneBuildRecord becomes an alias/narrowing (standalone:true) so existing Trivial callers still typecheck; persistStandaloneBuildRecord delegates to persistBuildRecord.

```
meta.standalone: true -> boolean; +meta.updatedAt?; +body.tasks?[]; +body.commit?
```

**Call sites:**
- `src/workflow/runners/build/standalone-record.ts`
- `src/mcp/build-step/phases/implement.ts:133`
- `src/mcp/build-step/phases/validate.ts`

## Error paths

### Error cases

- **An existing BUILD-<epicHash>-<storyId>.json is present but unreadable/malformed when persistBuildRecord reads it to merge.** (recoverable)
  - Detection: persistBuildRecord wraps the read+JSON.parse of the prior record in try/catch; a throw (or a shape that is not a BuildRecord) is caught.
  - Response: Treat the prior record as absent and write a fresh record from the current call (fail-open); never abort persistence over a corrupt prior file. Log a warn via getLogger.
  - User impact: The ledger self-heals to a valid record; at worst prior tasks[] provenance from a corrupt file is lost, not the current write.
- **A plan-driven validate target cannot be resolved to an epicHash + storyId (e.g. an ad-hoc/unindexed target).** (recoverable)
  - Detection: The validate handler checks the resolved task ref carries both epicHash and storyId before calling persistBuildRecord.
  - Response: Skip persistence entirely (do NOT write a BUILD-undefined-* path); return the daemon verdict unchanged.
  - User impact: No ledger entry for an unidentifiable target; the verdict is still returned, so validate behaves exactly as before for such targets.
- **writeAtomic fails (disk full / permission) while persisting the record inside validate.** (recoverable)
  - Detection: The persistBuildRecord call in the validate handler is wrapped so a writeAtomic throw is caught after the verdict is already computed.
  - Response: Log the failure and RETURN the already-computed verdict unchanged; persistence is a side effect that must never convert a passing validate into an error.
  - User impact: Validate still reports its real verdict; the ledger entry is simply missing and can be re-created by re-running validate.

### Edge cases

| Input | Expected |
| :--- | :--- |
| First validate for a story (no prior BUILD record exists). | A fresh BUILD-<epicHash>-<storyId>.json is written with standalone:false, createdAt=now, body.tasks=[the validated task]. |
| Re-validating a task already present in the record (or a second task of the same story). | Upsert-merge: tasks[] is UNIONED by task id (no duplicate rows; passed refreshed for the re-validated task), createdAt preserved, updatedAt refreshed — one story-level record, not N. |
| Validate runs after the BUILD record was already approved (meta.approvedAt set) — e.g. a re-validate post-completion. | The upsert PRESERVES meta.approvedAt (and any reviewOverride) — a completed story is not silently un-completed by a later validate. |
| A Trivial standalone build (the existing path) validates/implements. | persistStandaloneBuildRecord still writes standalone:true via the thin wrapper; the Trivial record + md are byte-identical to today. |

### Invariants to preserve

- The completion gate identifies a BUILD artifact by the 'BUILD-' filename prefix and reads meta.{epicHash,storyId}; the persisted plan-driven record MUST live at buildArtifactPaths (.insrc/artifacts/BUILD-<epicHash>-<storyId>.json) with meta.workflow:'build' + those fields, or completion cannot find/stamp it. [[c3]]
- persistStandaloneBuildRecord's Trivial output (json+md, standalone:true) stays byte-identical — the generalization must not change the existing standalone/Trivial ledger contract. [[c2]]
- approveArtifactByJsonPath stamps meta.approvedAt on the BUILD record; a later upsert from persistBuildRecord must preserve an existing approvedAt (and rejectedAt/reviewOverride), never clobber a completed record. [[c3]]
- The validate phase's returned verdict shape (verdict + passed) is unchanged; the new persistence is a pure side effect that never alters or blocks the verdict. [[c1]]

## Test strategy

**Test framework:** `node:test via `npx tsx --test` (the repo convention; existing suites approve-build-completion.test.ts + runners/build/__tests__)`

### Test levels

- **unit** — persistBuildRecord upsert-merge semantics against a tmp repo (pure filesystem, no daemon).
  - Subjects: `persistBuildRecord writes a fresh BUILD-<epicHash>-<storyId>.json (standalone:false) at buildArtifactPaths when none exists`, `a second call UNIONS tasks[] by id, preserves createdAt, refreshes updatedAt (one record, not N)`, `an existing meta.approvedAt (+ rejectedAt/reviewOverride) is PRESERVED across an upsert`, `a malformed prior record is treated as absent (fail-open fresh write), not a throw`
  - Fixtures: `mkdtemp repo with .insrc/artifacts + docs/builds`, `a pre-written prior BUILD json (valid + malformed variants)`
- **unit** — Regression: the Trivial/standalone record path is byte-identical after the generalization.
  - Subjects: `persistStandaloneBuildRecord still writes standalone:true json + the same md via the thin wrapper`, `StandaloneBuildRecord callers (implement.ts:133) still typecheck against the widened type`
  - Fixtures: `tmp repo`
- **integration** — The build-step validate phase persists a plan-driven record as a side effect of the verdict.
  - Subjects: `handleValidate on a plan-driven target upserts BUILD-<epicHash>-<storyId>.json (standalone:false) recording the validated task + passed, after computing the verdict`, `a target with no resolvable epicHash/storyId SKIPS persistence (no BUILD-undefined path) and still returns the verdict`, `a persistence failure (writeAtomic throw) is caught and the verdict is returned unchanged (persistence never fails validate)`
  - Fixtures: `tmp repo with an approved plan for a story`, `a fake/stubbed daemon verdict so validate runs offline`
- **unit** — End-to-end ledger consumability: the persisted plan-driven record satisfies the completion gate.
  - Subjects: `approveWorkflowTarget on the persisted BUILD-<epicHash>-<storyId>.json stamps meta.approvedAt (keys on the BUILD- prefix + meta.{epicHash,storyId})`, `the record appears in the epic-batch sweep (pendingArtifactJsonPaths) like a back-filled BUILD`
  - Fixtures: `tmp repo with the persisted plan-driven BUILD record + a pass CR record`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `handleValidate on a plan-driven target upserts BUILD-<epicHash>-<storyId>.json (standalone:false) recording the validated task + passed, after computing the verdict`, `persistBuildRecord writes a fresh BUILD-<epicHash>-<storyId>.json (standalone:false) at buildArtifactPaths when none exists` |
| `ac2` | `a second call UNIONS tasks[] by id, preserves createdAt, refreshes updatedAt (one record, not N)`, `an existing meta.approvedAt (+ rejectedAt/reviewOverride) is PRESERVED across an upsert` |
| `ac3` | `persistStandaloneBuildRecord still writes standalone:true json + the same md via the thin wrapper`, `StandaloneBuildRecord callers (implement.ts:133) still typecheck against the widened type` |
| `ac4` | `a malformed prior record is treated as absent (fail-open fresh write), not a throw`, `a target with no resolvable epicHash/storyId SKIPS persistence (no BUILD-undefined path) and still returns the verdict`, `a persistence failure (writeAtomic throw) is caught and the verdict is returned unchanged (persistence never fails validate)` |
| `ac5` | `approveWorkflowTarget on the persisted BUILD-<epicHash>-<storyId>.json stamps meta.approvedAt (keys on the BUILD- prefix + meta.{epicHash,storyId})`, `the record appears in the epic-batch sweep (pendingArtifactJsonPaths) like a back-filled BUILD` |

## Migration

**State before:** Only the Trivial standalone branch of handleImplement persists a BUILD record (persistStandaloneBuildRecord, standalone:true literal); the plan-driven handleImplement + handleValidate persist nothing, so a plan-driven story has no BUILD-<epicHash>-<storyId> ledger entry (per s1 implement.ts / standalone-record.ts bundles). Existing on-disk records are all standalone:true.

**State after:** The record type is generalized (meta.standalone widened true->boolean; +optional meta.updatedAt, body.tasks[]/commit); persistBuildRecord upsert-merges at buildArtifactPaths; the plan-driven validate phase persists standalone:false records; persistStandaloneBuildRecord stays a thin wrapper writing standalone:true. Existing standalone records remain valid (standalone:true satisfies boolean) — no rewrite.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Widen the record type: change meta.standalone from the `true` literal to `boolean`; add optional meta.updatedAt + body.tasks[]/commit. Keep StandaloneBuildRecord as a standalone:true narrowing so existing callers typecheck. — ↩ rollbackable
2. Add persistBuildRecord (read-merge-write upsert) as the general writer; make persistStandaloneBuildRecord delegate to it with standalone:true (thin wrapper, unchanged output). — ↩ rollbackable
3. In the plan-driven branch of the validate phase, after computing the daemon verdict, call persistBuildRecord to upsert the story-level record (skip when no epicHash/storyId; swallow persistence errors without altering the verdict). — ↩ rollbackable

**Backward compat:** Fully backward-compatible. Existing on-disk BUILD records (standalone:true) satisfy the widened boolean type and are read unchanged; the upsert preserves an existing createdAt/approvedAt/rejectedAt. The Trivial/standalone write path stays byte-identical via the wrapper. No public API signature changes (persistStandaloneBuildRecord + handleValidate keep their signatures; persistBuildRecord is additive). approveArtifactByJsonPath + the completion gate consume the new plan-driven record with no change.

## Alternatives considered

### a1: Upsert at validate; generalize the record type to `standalone: boolean` — **CHOSEN**

Widen StandaloneBuildRecord's `standalone` from the `true` literal to a boolean + add an upserting persistBuildRecord, called from the plan-driven validate phase.



### a2: Upsert at each implement (admission-time record)

Write/upsert the BUILD record in handleImplement right after admission, recording each task as it is dispatched.



**Rejected because:** VIOLATES the core accuracy constraint: implement returns the prompt BEFORE the controller edits/commits, so the record marks tasks 'dispatched', not completed — it would let a BUILD record mark a task built that was never finished. Accuracy is primary, so this loses.

### a4: New peer PlanBuildRecord + persistBuildRecord at validate; leave the standalone type frozen

Add a distinct plan-driven BuildRecord type + writer (upsert at validate) and leave StandaloneBuildRecord/persistStandaloneBuildRecord completely untouched.



**Rejected because:** Ties a1 on accuracy/single-record/reuse and edges it on regression (frozen standalone type), but introduces a second record type with a largely overlapping meta shape + duplicated write-to-buildArtifactPaths logic — the duplication outweighs the marginal regression win for a shape this small.

## Citations

- **[[c1]]** `analyze-bundle` `s1 symbol.locate — src/mcp/build-step/phases/implement.ts:41 (handleImplement plan-driven path persists nothing) + validate.ts; the plan-driven story has no BUILD ledger writer, and validate returns a verdict (verdict+passed) shape`
- **[[c2]]** `analyze-bundle` `s1 symbol.locate — src/workflow/runners/build/standalone-record.ts:22 (StandaloneBuildRecord pins standalone:true literal; persistStandaloneBuildRecord writes json+md) + src/workflow/storage.ts buildArtifactPaths/buildArtifactId/BUILDS_DIR`
- **[[c3]]** `analyze-bundle` `s1 usage.example — src/workflow/gates.ts: approveWorkflowTarget reads meta.{epicHash,storyId}, the BUILD-completion withhold keys on the 'BUILD-' filename prefix, approveArtifactByJsonPath stamps meta.approvedAt; pendingArtifactJsonPaths already sweeps BUILD-`
- **[[c4]]** `analyze-bundle` `s1 capability.reuse-check — src/workflow/orchestrator.ts has NO 'build' arm in prepareDecompose/prepareSynthesize/finalizeArtifact, so the BUILD ledger is a build-step persistence concern, not a workflow synth concern`
- **[[c5]]** `analyze-bundle` `s1 test.locate — src/workflow/__tests__/approve-build-completion.test.ts (BUILD fixture + completion assertions) + src/workflow/runners/build/__tests__ (standalone-record tests) as the suites to extend`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 10 LOW** · model `client` · reviewed 2026-08-04T16:52:05.017Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| c1 | citation | LOW | manual | The plan-driven handleImplement path in src/mcp/build-step/phases/implement.ts persists no BUILD record; only the standalone/Trivial branch calls persistStandaloneBuildRecord. | grep resolves handleImplement + persistStandaloneBuildRecord in build-step/phases/implement.ts; the plan-driven path persists nothing (only the Trivial branch persists). Confirmed. | none — verified sound. |
| c1 | citation | LOW | manual | The build-step validate phase exists (handleValidate in src/mcp/build-step/phases/validate.ts) and returns a read-only verdict shape; it is where the plan-driven persistence side effect will be added. | grep resolves handleValidate + verdict/passed in validate.ts — the validate phase exists and returns the read-only verdict shape the persistence side effect will hook into. | none — verified sound. |
| c2 | semantic | LOW | manual | StandaloneBuildRecord in src/workflow/runners/build/standalone-record.ts pins meta.standalone as the `true` literal and meta.workflow as 'build'; persistStandaloneBuildRecord writes json+md via buildArtifactPaths. | grep resolves `standalone: true` + workflow:'build' + persistStandaloneBuildRecord + buildArtifactPaths in standalone-record.ts — the record pins the standalone:true literal and writes via buildArtifactPaths. Confirmed. | none — verified sound. |
| c2 | citation | LOW | manual | buildArtifactPaths in src/workflow/storage.ts maps (repoPath, epicHash, storyId) to json .insrc/artifacts/BUILD-<epicHash>-<storyId>.json + md under docs/builds (BUILDS_DIR). | reads confirm `export function buildArtifactPaths` at src/workflow/storage.ts:293; buildArtifactId + BUILDS_DIR + ARTIFACTS_DIR resolve — the BUILD-<epicHash>-<storyId> json/md path mapping is exactly as cited. | none — verified sound. |
| c3 | citation | LOW | manual | In src/workflow/gates.ts the completion gate identifies a BUILD artifact by the 'BUILD-' filename prefix (basename startsWith) and reads meta.{epicHash,storyId}; approveArtifactByJsonPath stamps meta.approvedAt. | reads confirm `basename(jsonPath).startsWith('BUILD-')` at src/workflow/gates.ts:648 + approveArtifactByJsonPath at gates.ts:490 — the completion gate keys on the BUILD- prefix and stamps approvedAt. Confirmed. | none — verified sound. |
| c3 | semantic | LOW | manual | approveArtifactByJsonPath spreads the existing meta and only adds approvedAt (and optional reviewOverride), so an upsert that preserves prior meta keys is consistent with how approval writes the record (approvedAt is not clobbered by re-reading). | reads confirm `const nextMeta = { ...artifact.meta, approvedAt, ... }` at gates.ts:528 — approval spreads the EXISTING meta and only adds approvedAt, so the LLD's requirement that the upsert preserve prior meta keys is consistent with how approval writes the record. | none — verified sound. |
| c3 | citation | LOW | manual | pendingArtifactJsonPaths in src/workflow/gates.ts includes BUILD- artifacts in the epic-batch sweep. | pendingArtifactJsonPaths resolves in gates.ts; the summary earlier this session confirmed its regex now includes BUILD- in the epic-batch sweep (the approve-build-completion story). Confirmed. | none — verified sound. |
| c4 | closed-union | LOW | manual | src/workflow/orchestrator.ts has NO 'build' arm in the prepareDecompose / prepareSynthesize / finalizeArtifact workflow switches, so the BUILD artifact is not produced by the workflow synth path. | The `case 'build'` grep found no match in orchestrator.ts (matches were design.story/plan elsewhere), confirming the workflow switches have no build arm — the BUILD ledger is a build-step persistence concern, as designed. | none — verified sound. |
| c5 | citation | LOW | manual | The completion test suite src/workflow/__tests__/approve-build-completion.test.ts exists (manufactures BUILD-<hash>-<story> fixtures) and a standalone-record test dir exists under src/workflow/runners/build/__tests__. | grep resolves approve-build-completion.test.ts (BUILD- fixtures) + the runners/build/__tests__ standalone-record suite — the suites the LLD extends exist. | none — verified sound. |
| a1 | semantic | LOW | manual | Widening meta.standalone from the `true` literal to boolean is backward-compatible: existing on-disk standalone:true records satisfy the widened type, and persistStandaloneBuildRecord can remain a thin wrapper passing standalone:true. | The standalone:true literal at standalone-record.ts confirms the widen-to-boolean is a strict superset; existing standalone:true records satisfy `boolean`, and persistStandaloneBuildRecord can stay a thin wrapper. Backward-compatible as claimed. | none — verified sound. |
