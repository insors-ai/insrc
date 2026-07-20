<!-- insrc:artifact LLD-1cd9a4c34f403a80-s3 -->

# LLD: E202607151cd9a4c3:S003

**Epic:** `add-plan-workflow-insrc-framework-4th`
**HLD base run:** `wf-1784121669696-i1rc6r`
**HLD effective hash:** `c7645d42a9f5...`

## HLD context

**Framework:** Implement `plan` as a new fine-grained instance of the shared workflow skeleton, peer to define/design.epic/design.story. A single runner module registers a fixed six-step recipe (context.assemble -> tasks.enumerate -> tasks.critique -> tasks.finalize -> test-strategy.write -> checklist.verify) whose outputs the orchestrator's three per-workflow arms turn into a persisted, cited PlanArtifact for exactly one Story. A new gate reads the Story's approved, non-stale LLD (adding requireApprovedLld by mirroring requireApprovedHld and reusing the existing effective-hash/staleness machinery), and a new storage helper writes the artifact under the as-built slug-md + hash-json convention. Nothing about the executor, state store, approval flow, or MCP phase loop changes except a single 'plan' arm added at each existing seam.
**Rollout phase:** Phase B — Gate, persistence, and test naming
**Owns:** `sc2` (PlanArtifact)
**Consumes:** `sc1` (PlanTask)

## Contract details

**Surface level:** internal-shared

### `PlanArtifact`

```typescript
interface PlanMeta extends ArtifactMetaBase { readonly epicHash: string; readonly epicSlug: string; readonly storyId: string; readonly lldRunId: string; readonly lldEffectiveHash: string; readonly approvedAt?: string; }
interface PlanBody { readonly tasks: readonly PlanTask[]; readonly testStrategyCoverage: readonly TestStrategyCoverage[]; }
interface PlanArtifact { readonly meta: PlanMeta; readonly body: PlanBody; readonly citations: readonly Citation[]; }
```

**Returns:** `PlanArtifact` — The persisted, reviewable breakdown for one Story — sc2 verbatim. meta extends the shared ArtifactMetaBase; body holds sc1 PlanTask[] + sc4 testStrategyCoverage; citations are the shared Citation type.

**Preconditions:**
- body.tasks is the validated sc1 PlanTask[] from s1's finalize
- every claim in body maps to a citations[] entry

**Postconditions:**
- the artifact is renderable to md (with the insrc:artifact marker) and serialisable to canonical json

### `renderPlanMarkdown`

```typescript
function renderPlanMarkdown(artifact: PlanArtifact): string
```

**Parameters:**
- `artifact: PlanArtifact` — the finalized plan to render

**Returns:** `string` — Human-readable markdown that leads with artifactIdMarker(planArtifactId(...)) so it resolves back to the canonical json, then renders the ordered task table + acceptance checks + citation block — the plan peer of renderLldMarkdown.

**Preconditions:**
- artifact.meta carries epicHash + storyId so the marker id can be computed

**Postconditions:**
- the first line is the <!-- insrc:artifact PLAN-<hash>-<storyId> --> marker jsonPathForMd resolves

### `planArtifactPaths`

```typescript
function planArtifactPaths(repoPath: string, epicHash: string, storyId: string, epicSlug?: string): { readonly md: string; readonly json: string }
```

**Parameters:**
- `repoPath: string` — repo root
- `epicHash: string` — 16-hex Epic hash
- `storyId: string` — the Story
- `epicSlug: string` _(optional)_ — display slug for the md filename; falls back to hash when omitted

**Returns:** `{ md: string; json: string }` — slug-named md under a plans/ root + hash-named canonical json under .insrc/artifacts — the plan peer of lldArtifactPaths.

**Postconditions:**
- md resolves back to json via jsonPathForMd + the insrc:artifact marker

### `approveArtifactByJsonPath`

```typescript
function approveArtifactByJsonPath(jsonPath: string): ApprovalResult
```

**Parameters:**
- `jsonPath: string` — path to the PlanArtifact canonical json

**Returns:** `ApprovalResult` — Sets meta.approvedAt (clearing any rejection) on the PlanArtifact json — reused verbatim from gates.ts; no plan-specific approval code.

**Errors:**
- `ArtifactMissingError` when no json at jsonPath

**Preconditions:**
- the PlanArtifact json exists

**Postconditions:**
- meta.approvedAt is set; downstream treats an unapproved plan as absent

## Data model changes

### `PlanArtifact` — new

New artifact type (PlanMeta + PlanBody + citations) defined in a new artifacts/plan.ts, mirroring artifacts/lld.ts. PlanMeta extends ArtifactMetaBase; PlanBody wraps the sc1 PlanTask[] + sc4 testStrategyCoverage. Canonical json under .insrc/artifacts, human md under a plans/ root.

```
+ interface PlanMeta extends ArtifactMetaBase { epicHash; epicSlug; storyId; lldRunId; lldEffectiveHash; approvedAt? }
+ interface PlanBody { tasks: PlanTask[]; testStrategyCoverage: TestStrategyCoverage[] }
+ interface PlanArtifact { meta; body; citations }
```

**Call sites:**
- `src/workflow/artifacts/lld.ts (the peer module renderPlanMarkdown/artifactIdMarker mirror)`
- `src/workflow/storage.ts (planArtifactPaths added beside lldArtifactPaths)`
- `src/mcp/workflow-step/phases/synthesize.ts (pathsForWorkflow arm writes the plan md + json via writeAtomic)`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc2` | implements | s3 owns and implements sc2: it defines PlanArtifact/PlanMeta/PlanBody, renderPlanMarkdown (with the insrc:artifact marker), and planArtifactPaths, and wires the synthesize-phase persistence to writeAtomic + the reuse of approveArtifactByJsonPath. All rendering/persistence internals stay private to s3; other Stories see only the PlanArtifact type. |
| `sc1` | consumes | s3 embeds the sc1 PlanTask[] verbatim as PlanBody.tasks and renders them into the md table; it never reshapes or re-validates PlanTask (that is s1's finalize responsibility). |

## Error paths

### Error cases

- **A body claim cites a citation id that is not present in citations[].** (recoverable)
  - Detection: The synthesizer's validateBodyAndCitations pass finds a [[cN]] reference with no matching citations[] entry.
  - Response: Return a retryable synthesize failure (the same citation-grounding rejection the other artifacts use); no plan md/json is written.
  - User impact: None visible; the run retries. ac2 traceability is never violated in a persisted plan.
- **A mid-write crash between writing the md and the json (or vice versa).** (recoverable)
  - Detection: writeAtomic writes to <path>.tmp then renames; a crash before rename leaves the .tmp, never a half-written canonical file.
  - Response: The previous canonical json (if any) stays intact; the partial .tmp is ignored on the next run.
  - User impact: The plan is simply not updated; re-running regenerates it. No corruption.
- **The slug-named md cannot be resolved back to its canonical json.** (recoverable)
  - Detection: jsonPathForMd reads the md head and finds no insrc:artifact marker (e.g. a hand-edited md that dropped it).
  - Response: jsonPathForMd falls back to the legacy dir+extension swap, or the caller surfaces a resolution error — same behaviour as for LLD/HLD md files.
  - User impact: Approval-by-md-path may fail on a marker-stripped file; approving by json path still works.

### Edge cases

| Input | Expected |
| :--- | :--- |
| A PlanBody with a single task and empty testStrategyCoverage (s4 not yet run in an early integration fixture). | renderPlanMarkdown still renders the task table and an empty coverage section; the artifact persists and is approvable. |
| An epicSlug omitted when computing planArtifactPaths. | The md filename falls back to the hash (same fallback as lldArtifactPaths); the json is unaffected. |
| Re-persisting an already-approved plan (a re-run). | The new write overwrites the canonical json; approval is not implicitly carried — re-approval goes through approveArtifactByJsonPath again, consistent with the other artifacts. |

### Invariants to preserve

- The PlanArtifact md must lead with the insrc:artifact marker so jsonPathForMd resolves a slug-named md back to its hash-named json — the same resolution contract every other artifact honors. [[c1]]
- Persistence goes through writeAtomic (write-temp-then-rename); the canonical json is the source of truth and the md is regenerable from it, so no consumer ever reads a half-written file. [[c1]]
- Approval is the shared approveArtifactByJsonPath writing meta.approvedAt; the plan must not introduce a bespoke approval path, so 'unapproved is treated as absent downstream' holds uniformly. [[c2]]
- Every body claim must map to a citations[] entry (validateBodyAndCitations); the plan must not weaken this grounding discipline. [[c3]]

## Test strategy

**Test framework:** `node:test (tsx --test), mirroring src/workflow/__tests__/lld-artifact.test.ts + the gates approve/reject tests`

### Test levels

- **unit** — Exercise the renderer + storage-path + approval reuse over hand-built PlanArtifact fixtures, mirroring the lld-artifact test.
  - Subjects: `renderPlanMarkdown leads with the insrc:artifact PLAN- marker and renders the ordered task table + citation block`, `planArtifactPaths returns slug-md (plans/ root) + hash-json (.insrc/artifacts); falls back to hash md when epicSlug omitted`, `jsonPathForMd resolves a rendered plan md back to its canonical json via the marker`, `approveArtifactByJsonPath sets meta.approvedAt on a PlanArtifact json (reused gate, no plan-specific code)`, `the synthesizer rejects a PlanArtifact whose body cites an id missing from citations[]`
  - Fixtures: `a valid PlanArtifact fixture (PlanMeta + PlanBody with one PlanTask + citations)`, `a PlanArtifact fixture with a dangling [[cN]] reference`
- **integration** — Confirm the plan workflow persists + is approvable through the MCP phase loop.
  - Subjects: `a full plan run writes both the plan md (with marker) and the canonical json at planArtifactPaths`, `the written md resolves to the json and approveArtifactByJsonPath marks it approved`, `an unapproved plan is treated as absent by a downstream reader (approval-gate check)`
  - Fixtures: `seeded approved+non-stale LLD so the plan run reaches synthesize`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: renderPlanMarkdown embeds the marker + planArtifactPaths returns slug-md/hash-json`, `unit: jsonPathForMd resolves the plan md back to its json`, `integration: a plan run writes both md + json at the plan paths` |
| `ac2` | `unit: synthesizer rejects a plan whose body cites a missing citation id`, `integration: the persisted plan's tasks each carry derivedFrom citations present in citations[]` |
| `ac3` | `unit: approveArtifactByJsonPath sets meta.approvedAt on the PlanArtifact json`, `integration: an unapproved plan is treated as absent by the downstream approval-gate check` |

## Migration

**State before:** Today the artifact family covers stub/define/HLD/LLD/tracker: artifacts/lld.ts defines the LLD types + renderLldMarkdown + the insrc:artifact marker, storage.ts has lldArtifactPaths (slug-md + hash-json) + writeAtomic, gates.ts has approveArtifactByJsonPath/rejectArtifactByJsonPath, and the synthesize phase resolves paths per workflow — but there is NO PlanArtifact type, no renderPlanMarkdown, and no planArtifactPaths [[c1]]. Task breakdowns are not persisted as a first-class artifact.

**State after:** A new artifacts/plan.ts defines PlanArtifact/PlanMeta/PlanBody + renderPlanMarkdown (with the marker), storage.ts gains planArtifactId + planArtifactPaths (slug-md under a plans/ root + hash-json under .insrc/artifacts), and the synthesize phase's pathsForWorkflow gains a 'plan' arm. Approval reuses approveArtifactByJsonPath unchanged. All existing artifacts are untouched.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add artifacts/plan.ts (PlanArtifact/PlanMeta/PlanBody + PLAN_SCHEMA_VERSION + renderPlanMarkdown), mirroring artifacts/lld.ts. Pure addition. — ↩ rollbackable
2. Add planArtifactId + planArtifactPaths + the plans/ dir constant to storage.ts beside lldArtifactPaths. Additive; existing path helpers unchanged. — ↩ rollbackable
3. Add a 'plan' branch to the synthesize phase pathsForWorkflow so the finalized PlanArtifact writes its md + json via the existing writeAtomic. Additive switch case; existing arms unchanged. — ↩ rollbackable
4. No data backfill and no reuse-code change to gates: approveArtifactByJsonPath/rejectArtifactByJsonPath/jsonPathForMd already work on any artifact json with the marker. — ↩ rollbackable

**Backward compat:** No existing public API changes: artifacts/lld.ts, lldArtifactPaths, writeAtomic, approveArtifactByJsonPath, and the synthesize phase for existing workflows keep their signatures + behaviour. The new plan artifact module + storage helper + synthesize arm are purely additive and only reached for the 'plan' workflow.

## Alternatives considered

### a1: Dedicated artifacts/plan.ts mirroring artifacts/lld.ts — **CHOSEN**

PlanArtifact/PlanMeta/PlanBody + renderPlanMarkdown live in a new artifacts/plan.ts, and planArtifactPaths in storage.ts, each a direct peer of the LLD equivalents; approval reuses approveArtifactByJsonPath verbatim.

Add artifacts/plan.ts defining PlanArtifact (meta: PlanMeta extends ArtifactMetaBase + epicHash/epicSlug/storyId/lldRunId/lldEffectiveHash; body: PlanBody { tasks: PlanTask[]; testStrategyCoverage }; citations: Citation[]) and PLAN_SCHEMA_VERSION, plus renderPlanMarkdown that leads with artifactIdMarker(planArtifactId(...)) and renders the task table + citation block. storage.ts gains planArtifactId + planArtifactPaths(repoPath, epicHash, storyId, epicSlug?) returning slug-md under a plans/ root + hash-json under .insrc/artifacts. Persistence goes through the existing writeAtomic in the synthesize phase; approval/rejection go through the existing approveArtifactByJsonPath/rejectArtifactByJsonPath unchanged; jsonPathForMd already resolves the slug md back to the hash json via the marker.

### a2: Store the plan under the existing designs dir as a LLD-adjacent file

Reuse lldArtifactPaths' docs/designs location with a PLAN- prefix instead of adding a plans/ dir + planArtifactPaths.

Rather than a new plans/ root, write the plan md/json alongside the LLD under docs/designs / .insrc/artifacts with a PLAN-<slug>-<storyId> / PLAN-<hash>-<storyId> naming, reusing the existing path-helper shape with a different prefix. Renderer + approval are the same as a1.

**Rejected because:** Functionally equivalent but partial on k1 (tier blur) and contradicts the meta doc's dedicated plans/ root; the small storage saving is not worth muddying the tier separation, so a1 wins on tier-fidelity.
