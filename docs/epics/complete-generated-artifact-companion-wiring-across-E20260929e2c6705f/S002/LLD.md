<!-- insrc:artifact LLD-e2c6705fd105d4ac-s2 -->

# LLD: E20260929e2c6705f:S002

## Summary

**Epic:** `complete-generated-artifact-companion-wiring-across`
**HLD base run:** `wf-1790696212238-iuz6vo`
**HLD effective hash:** `35f2a2c76e97...`

S2 makes every completed story build leave a build-ledger record, not just those that ran the dedicated validate step. It adds a small, hermetically-testable completion hook — ensureBuildRecordOnCompletion — that the BUILD approve path calls to create-or-merge a BUILD-<epicHash>-<storyId> record from the git changed set, reusing the existing writer + change-log collector unchanged. A controller-side build that skipped validate now gets its record materialised at completion; a build that did run validate merges onto the one record via the existing upsert, and an underivable change set yields an empty change-log rather than failing completion.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Interaction with shared contracts](#4-interaction-with-shared-contracts)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Migration](#7-migration)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)

## 1. HLD context

> See **HLD-e2c6705fd105d4ac** § 2. Framework summary

**Rollout phase:** Phase A — UX gate + build provenance (pure wiring)
**Owns:** `sc2` (Completion-path BUILD-record persistence)
**Consumes:** `sc2` (Completion-path BUILD-record persistence)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: S1 keeps private the exact join point and ordering of UX_CONTENT_GATE_RULE within each HARD-RULES block and the specific assertion mechanism of the source-scan guard test. It touches only the three synth-prompt builders and adds one test; it introduces no new companion type, schema, renderer, or review dimension (all already shipped) and does not alter the ER injection it mirrors. — owns `sc1`
- `s3`: S3 keeps private the internal shape of each new definition type (participant/message and node/edge structures), the DocumentIR mapping in each toIr, how each renderer assembles its offline HTML via the shared render spine, and which graph-derived docgen query feeds each diagram. It re-instances the sc1 injection convention for its two gates independently (no code dependency on S1) and adds its own finalize call without touching renderErCompanionForBody or the er/ux families. — owns `sc3`

## 2. Contract details

**Surface level:** internal

### 2.1 `ensureBuildRecordOnCompletion`

```typescript
export async function ensureBuildRecordOnCompletion(
  repoPath: string,
  ref: { readonly epicHash: string; readonly storyId: string },
  listChanged?: (repoPath: string) => Promise<readonly string[]>,
): Promise<{ readonly md: string; readonly json: string } | undefined>  // NEW: src/workflow/runners/build/completion-record.ts
```

**Parameters:**
- `repoPath: string` — The registered repo whose .insrc/artifacts holds the BUILD ledger; resolved by the approve path before the hook runs.
- `ref: { epicHash: string; storyId: string }` — The resolvable story identity keying the BUILD-<epicHash>-<storyId> record; the hook no-ops when either is empty (never writes a BUILD-undefined path), mirroring validate.ts:94.
- `listChanged: (repoPath: string) => Promise<readonly string[]>` _(optional)_ — Injectable changed-file seam threaded into collectBuildChangeLog (defaults to the real git derivation); tests stub it for a hermetic changed set — mirrors collectBuildChangeLog's own listChanged param.

**Returns:** `Promise<{ md: string; json: string } | undefined>` — The persisted record paths (from persistBuildRecord) when a record was written/merged, or undefined when the hook no-ops (unresolvable identity) or swallowed a failure. The approve path ignores the value — it is a side effect.

**Preconditions:**
- ref.epicHash and ref.storyId are both non-empty (else the hook no-ops — never a BUILD-undefined path).
- persistBuildRecord + collectBuildChangeLog are consumed UNCHANGED (no signature change); the validate-phase invocation is not modified.

**Postconditions:**
- Exactly one BUILD-<epicHash>-<storyId>.json/.md exists after the hook: created from the git changed set when absent (controller-side build), merged onto the prior record via persistBuildRecord's read-merge-write upsert when present (validate-then-complete) — k3/ac2.
- An empty/underivable change set yields a body with no changeLog slot (omit-slot), byte-identical to a no-change build; any derivation/persist failure is swallowed to a warning so completion never fails — ac3/k1.

### 2.2 `persistBuildRecord`

```typescript
persistBuildRecord(repoPath: string, rec: BuildRecord): { md: string; json: string }  // consumed unchanged — standalone-record.ts:172-189
```

**Returns:** `{ md: string; json: string }` — The read-merge-write upsert reused unchanged — THE k3 idempotency substrate; ensureBuildRecordOnCompletion builds the same BuildRecord shape as validate.ts:102-105 (meta.workflow='build', standalone:false, epicHash, storyId, createdAt/updatedAt; body.tasks:[] + changeLog when non-empty).

**Preconditions:**
- Called only with a resolved epicHash+storyId identity.

**Postconditions:**
- Exactly one on-disk BUILD-<epicHash>-<storyId> record; a completion write after a validate write merges rather than duplicates.

### 2.3 `collectBuildChangeLog`

```typescript
collectBuildChangeLog(repoPath: string, ctx: { author: string; timestamp: string; version?: string }, listChanged = changedFiles): Promise<ChangeLog>  // consumed unchanged — changed-files.ts:67-89
```

**Returns:** `Promise<ChangeLog>` — The file-level change-log derived from the git changed set; a derivation failure is already swallowed to [] inside the collector (ac3). ensureBuildRecordOnCompletion passes author:'insrc-build' + an ISO timestamp exactly as validate.ts:101, threading its own listChanged through for hermetic tests.

**Preconditions:**
- None beyond a repoPath; git failure → [] internally.

**Postconditions:**
- Returns [] on an empty/underivable change set; the caller omits the empty change-log slot from the body.

### 2.4 `approveWorkflowTarget`

```typescript
approveWorkflowTarget(req: WorkflowApproveRequest, opts?: { enforce?: boolean }): WorkflowApproveResult  // hooked — gates.ts:636-704
```

**Returns:** `WorkflowApproveResult` — The insrc_workflow_approve landing (single artifactPath OR epic-batch). S2 invokes ensureBuildRecordOnCompletion for a BUILD story target — on the single path when the resolved target is a BUILD-<hash>-<story>, and once per BUILD artifact in the batch sweep — BEFORE approveArtifactByJsonPath, so a controller-side build's record is materialised in time to be approved (no ArtifactMissingError). The existing code-review gate + approvedAt stamping are unchanged.

**Preconditions:**
- The target resolves to a BUILD story completion (BUILD- basename / meta.workflow==='build') with a resolvable epicHash+storyId.

**Postconditions:**
- The BUILD record exists (created or merged) before approvedAt is stamped; non-BUILD approvals are unaffected.

### 2.5 `approveArtifactByJsonPath`

```typescript
approveArtifactByJsonPath(jsonPath: string, opts?: { overrideReview?: string }): ApprovalResult  // unchanged — gates.ts:498-543
```

**Returns:** `ApprovalResult` — The per-artifact approve (review gate + approvedAt stamp) reused UNCHANGED; S2 does not add provenance logic here (keeping the gate artifact-kind-agnostic) — the ensure-record hook runs upstream in approveWorkflowTarget so a BUILD json exists by the time this is called.

**Preconditions:**
- The jsonPath exists (guaranteed for a BUILD target because the ensure hook ran first).

**Postconditions:**
- meta.approvedAt stamped; no build-provenance coupling introduced into this function.

## 3. Data model changes

### 3.1 `BuildRecord` — invariant-change

No schema change to BuildRecord — S2 writes the SAME shape validate.ts already persists (meta: {workflow:'build', standalone:false, epicHash, storyId, createdAt, updatedAt}; body: {tasks, changeLog?}). The only new invariant: the record is now materialised on the completion/approve path too, so 'a completed build has a BUILD-<epicHash>-<storyId> record' holds regardless of build path. A completion-path create writes body.tasks:[] (no per-task verdict off the validate path); a subsequent/prior validate write merges its tasks in via the upsert.

**Call sites:**
- `src/mcp/build-step/phases/validate.ts:102-105 (existing validate-path writer S2 mirrors)`
- `src/workflow/runners/build/standalone-record.ts:172-189 (persistBuildRecord upsert)`
- `src/workflow/gates.ts:636-704 (approveWorkflowTarget — the new completion-path invocation site)`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc2` | implements | S2 OWNS + implements sc2 (completion-path BUILD-record persistence). It adds ensureBuildRecordOnCompletion (new src/workflow/runners/build/completion-record.ts) that mirrors the validate-phase record construction and reuses persistBuildRecord + collectBuildChangeLog UNCHANGED, and invokes it from approveWorkflowTarget for BUILD story targets before approvedAt is stamped. Idempotency (k3) is the writer's existing read-merge-write upsert — create when absent (controller-side build), merge when present (validate-then-complete). It does NOT modify the validate-phase invocation, approveArtifactByJsonPath's gate logic, or any adjacent-boundary scope (sc1 synth prompts / sc3 diagram companions). |

## 5. Error paths

**Error cases**

- **The git changed-set derivation fails (not a git repo, git binary unavailable, or the diff errors) while building the completion record.** (recoverable)
  - Detection: collectBuildChangeLog wraps the changed-set derivation and catches the failure internally, returning [] (changed-files.ts:67-89, the NoBuildChangesError/derivation-failure arm) rather than throwing out.
  - Response: ensureBuildRecordOnCompletion receives [] → omits the changeLog slot from the body and still persists the record; completion proceeds (ac3).
  - User impact: The BUILD record exists with no change-log rather than the completion failing; provenance is partial but the story still completes.
- **persistBuildRecord throws while writing/merging the record (e.g. a corrupt prior BUILD json, or a filesystem/writeAtomic error).** (recoverable)
  - Detection: ensureBuildRecordOnCompletion wraps its collect+persist body in try/catch (mirroring validate.ts:95/106-111) and logs a warning on throw.
  - Response: The failure is swallowed to a getLogger warning; ensureBuildRecordOnCompletion returns undefined and the approve path continues to stamp approvedAt — a persist failure never converts a successful completion into an error (k1).
  - User impact: The story still completes; the BUILD record may be missing/stale for that build, surfaced only as a log warning.
- **The completion target resolves to a BUILD story whose epicHash or storyId is empty/unresolvable (a malformed or non-story-scoped target).** (recoverable)
  - Detection: ensureBuildRecordOnCompletion guards `ref.epicHash.length > 0 && ref.storyId.length > 0` before doing anything (mirroring validate.ts:94), so an unresolvable identity is noticed at the guard.
  - Response: The hook no-ops (returns undefined) — never writes a BUILD-undefined path; the approve path proceeds unchanged.
  - User impact: No spurious BUILD-undefined artifact is created; a genuinely malformed target simply gets no completion record.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A controller-side build (no validate run) being completed — NO BUILD-<epicHash>-<storyId>.json exists yet. | ensureBuildRecordOnCompletion CREATES the record from the git changed set (body.tasks:[] + changeLog when non-empty) before approveArtifactByJsonPath runs, so the approve no longer hits ArtifactMissingError and the story completes with a real ledger record (ac1). |
| A build that DID run validate (a BUILD record already on disk with tasks + changeLog) then completed on the approve path. | ensureBuildRecordOnCompletion's persistBuildRecord upsert MERGES onto the existing record (prior tasks/changeLog preserved, updatedAt refreshed) — exactly one BUILD record, no duplicate/conflict (ac2/k3). |
| A build that changed NO files (empty changed set) completed on the approve path. | collectBuildChangeLog returns [] → the changeLog slot is omitted → the record body is byte-identical to a no-change validate write; completion succeeds (ac3/k1). |
| An epic-batch approve (epicHash) sweeping multiple BUILD stories at once. | ensureBuildRecordOnCompletion runs once per BUILD artifact in the sweep before each is approved; each story's BUILD record is created/merged independently — no cross-story interference. |
| A non-BUILD artifact (DEF/HLD/LLD/PLAN) approved on the same path. | The completion hook is BUILD-scoped (keyed on the BUILD- basename / meta.workflow==='build', per approve-build-completion.test.ts); a non-BUILD approval is untouched — no record written. |

**Invariants to preserve**

- persistBuildRecord's read-merge-write upsert is THE idempotency substrate: a completion-path write after (or before) a validate-path write merges onto the one BUILD-<epicHash>-<storyId> record rather than duplicating — exactly one record per story build. S2 must reuse it unchanged and add NO dedup logic of its own. [[c2]]
- The validate-phase invocation (validate.ts:93-105) must NOT be modified — S2 mirrors its record-construction at the completion site but leaves the validate writer intact (the HLD 'validate-path record is untouched'). [[c2]]
- An empty/underivable change set yields a body with the changeLog slot OMITTED (omit-slot), byte-identical to a no-change build, and a derivation/persist failure is swallowed so a completion is never converted into an error — mirroring the validate-phase's swallow-and-omit behaviour. [[c2]]
- approveArtifactByJsonPath stays artifact-kind-agnostic — no build-provenance logic is coupled into the generic per-artifact approve/gate; the ensure-record hook lives upstream in approveWorkflowTarget's BUILD branch, preserving the existing review-gate + approvedAt-stamp behaviour. [[c2]]

## 6. Test strategy

**Test framework:** `node:test + node:assert/strict, *.test.ts run via `npx tsx --test`, mirroring src/workflow/__tests__/approve-build-completion.test.ts + src/workflow/runners/build/__tests__/build-record.test.ts + changed-files.test.ts (tmp-repo filesystem + injectable listChanged seam, no real git / no mocks of the writer)`

**Test levels**

- **unit** — Prove ensureBuildRecordOnCompletion create-or-merges the BUILD record with the right shape via the stubbed listChanged seam — hermetic, no real git (mirrors changed-files.test.ts + build-record.test.ts).
  - Subjects: `ensureBuildRecordOnCompletion over a tmp repo with NO prior BUILD json + a stubbed listChanged returning ['a.ts','b.ts'] → CREATES BUILD-<hash>-<story>.json with meta.workflow='build', standalone:false, epicHash/storyId, and body.changeLog carrying the two files (ac1)`, `ensureBuildRecordOnCompletion when a prior validate-written record exists (tasks + changeLog) → persistBuildRecord upsert MERGES; exactly one BUILD-<hash>-<story> record remains, prior tasks preserved, updatedAt refreshed (ac2/k3)`, `ensureBuildRecordOnCompletion with a stubbed listChanged returning [] (or throwing → collector swallows to []) → record written with the changeLog slot OMITTED, no throw (ac3)`, `ensureBuildRecordOnCompletion with ref.epicHash='' or ref.storyId='' → no-ops (returns undefined), writes no BUILD-undefined path`, `ensureBuildRecordOnCompletion when persistBuildRecord throws (monkeypatched / corrupt prior json) → swallowed to a warning, returns undefined, does not rethrow`
  - Fixtures: `a tmp repo dir with .insrc/artifacts (mkdtemp)`, `a stubbed listChanged: (repoPath) => Promise<readonly string[]> returning a fixed set / [] / a rejection`, `a hand-written prior BUILD-<hash>-<story>.json fixture (validate-shape) for the merge case`
- **integration** — Prove approveWorkflowTarget invokes the hook so a controller-side BUILD story completes with a materialised record, and non-BUILD approvals are untouched (mirrors approve-build-completion.test.ts / approve-workflow-target.test.ts).
  - Subjects: `approveWorkflowTarget on a BUILD story target with NO pre-existing BUILD json + a stubbed/derivable changed set → the record is created THEN meta.approvedAt is stamped (no ArtifactMissingError); isApproved(BUILD json) true (ac1)`, `approveWorkflowTarget epic-batch (epicHash) over two BUILD stories → each gets its own created/merged record before approval; no cross-story interference`, `approveWorkflowTarget on a non-BUILD artifact (LLD/PLAN) → no BUILD record written, approval behaviour unchanged (BUILD-scoped hook)`
  - Fixtures: `a tmp repo with hand-written pending BUILD-<hash>-<story>.json (and one WITHOUT, for the create case) + a non-BUILD LLD json`, `a stubbed changed-set seam (or a real tiny git repo) so the completion record is deterministic`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: ensureBuildRecordOnCompletion with no prior record + stubbed changed set CREATES the BUILD record with the change-log`, `integration: approveWorkflowTarget completes a controller-side BUILD story (no prior json) — record created then approvedAt stamped, no ArtifactMissingError` |
| `ac2` | `unit: ensureBuildRecordOnCompletion over a prior validate-written record → upsert MERGES, exactly one record, prior tasks preserved`, `integration: a validate-then-complete sequence yields exactly one BUILD-<hash>-<story> record` |
| `ac3` | `unit: ensureBuildRecordOnCompletion with a stubbed listChanged returning [] (and one that throws → collector → []) → record written with changeLog omitted, completion does not fail`, `unit: ensureBuildRecordOnCompletion when persistBuildRecord throws → swallowed to a warning, completion still proceeds` |

## 7. Migration

**State before:** persistBuildRecord (standalone-record.ts:172-189) + collectBuildChangeLog (changed-files.ts:67-89) are invoked from EXACTLY ONE production site: handleValidate (validate.ts:59-115, the persistBuildRecord call at :102 gated on a resolvable epicHash+storyId and wrapped in try/catch). The approve/completion path (approveWorkflowTarget gates.ts:636-704 → approveArtifactByJsonPath gates.ts:498-543) only stamps meta.approvedAt on an EXISTING artifact json (ArtifactMissingError if absent). So a controller-side build — which never runs handleValidate — produces NO BUILD-<epicHash>-<storyId>.json/.md, no change-log, no feedback, and has nothing to approve at completion (cited: s1 approve-completion-seam + record-shape-to-mirror bundles; confirmed by this epic's own S001 controller-side build).

**State after:** A new ensureBuildRecordOnCompletion (src/workflow/runners/build/completion-record.ts) mirrors the validate-phase record construction and reuses persistBuildRecord + collectBuildChangeLog UNCHANGED. approveWorkflowTarget invokes it for BUILD story targets (single + each in the epic-batch sweep) BEFORE approveArtifactByJsonPath, so a controller-side build's BUILD-<epicHash>-<storyId> record is CREATED from the git changed set (then approvedAt stamped), and a validate-then-complete sequence MERGES onto the one record via the existing upsert. An empty/underivable change set omits the change-log slot; a derivation/persist failure is swallowed so completion never fails. The validate-phase writer is untouched.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the new module src/workflow/runners/build/completion-record.ts exporting ensureBuildRecordOnCompletion(repoPath, { epicHash, storyId }, listChanged?) — mirrors the validate.ts:93-105 construction (author 'insrc-build', ISO timestamp, meta.workflow='build'/standalone:false, body.tasks:[] + changeLog when non-empty), guards on non-empty epicHash+storyId, and wraps collect+persist in try/catch (swallow to a warning). Reuses persistBuildRecord + collectBuildChangeLog unchanged. — ↩ rollbackable
2. In approveWorkflowTarget (gates.ts), before stamping approvedAt on a BUILD story target (single-artifact path when the resolved target is a BUILD-<hash>-<story>, and once per BUILD artifact in the epic-batch sweep), await ensureBuildRecordOnCompletion for that story's epicHash/storyId so the record exists/merges. Non-BUILD approvals and the review-gate/approvedAt logic are untouched. — ↩ rollbackable
3. Add the S2 tests (unit over the new module with a stubbed listChanged for create/merge/empty/failure/no-op; integration over approveWorkflowTarget for the controller-side create + validate-then-complete merge + non-BUILD-untouched cases) mirroring approve-build-completion.test.ts + build-record.test.ts + changed-files.test.ts patterns. — ↩ rollbackable

**Backward compat:** Fully backward-compatible. No public API signature changes — persistBuildRecord, collectBuildChangeLog, approveArtifactByJsonPath and approveWorkflowTarget keep their exact signatures; only a new internal side-effect call is added inside approveWorkflowTarget's BUILD branch. No BuildRecord schema change (the same shape validate.ts writes). Existing BUILD records replay unchanged; a build with no changes / no derivable set writes a body byte-identical to today's no-change validate record. A completion after a validate write merges via the existing upsert (exactly one record), and a persist failure is swallowed so no previously-succeeding completion can start failing. Non-BUILD artifact approvals are entirely unaffected.

## 8. Alternatives considered

### 8.1 a1: Extracted ensureBuildRecordOnCompletion hook invoked from the BUILD approve path — **CHOSEN**

A small, unit-testable completion-record hook that create-or-merges the BUILD record from the git changed set, invoked by approveWorkflowTarget when the target is a BUILD story completion.

Add a dedicated seam — ensureBuildRecordOnCompletion(repoPath, { epicHash, storyId }) — in a new small module under runners/build/ (mirroring the extracted-testable-seam convention: collectBuildChangeLog's injectable listChanged, the surface-bugfix mount.ts). It mirrors the validate-phase construction verbatim (author 'insrc-build', ISO timestamp, meta.workflow='build'/standalone:false, body.tasks:[] + changeLog when non-empty). Because persistBuildRecord is a read-merge-write upsert, this CREATES the BUILD-<epicHash>-<storyId> record when a controller-side build never ran validate, and MERGES onto the existing one when validate did run — exactly one record either way (k3). approveWorkflowTarget calls it for BUILD story targets BEFORE approveArtifactByJsonPath, wrapped so a failure is swallowed to a warning and never fails completion.

### 8.2 a2: Inline enrich-only inside the approveArtifactByJsonPath BUILD branch (no create)

When approveArtifactByJsonPath approves an EXISTING BUILD json, also merge in a fresh change-log — but do not create a record when none exists.

Add the collectBuildChangeLog + persistBuildRecord merge INSIDE approveArtifactByJsonPath, in the branch where the artifact is a BUILD (meta.workflow === 'build'). Enriches a validate-written BUILD record inline in gates.ts, no new module. Because approveArtifactByJsonPath requires the json to already exist, it never runs for a controller-side build that wrote no record.

**Rejected because:** PARTIAL on ac1 + sc2: enrich-only cannot materialise a missing record, leaving the exact controller-side gap S001 exposed unfixed, and it couples provenance into the kind-agnostic gate.

### 8.3 a3: Ensure-record hook invoked from the post-build code-review completion instead of approve

Materialise the BUILD record as a side effect of the post-build code review (which always runs for a completed build), rather than at approve.

Invoke ensureBuildRecordOnCompletion from the code-review completion path (the insrc_code_review_step / code-review gate that already writes a CR-<hash>-<story> record), so the BUILD record is created/merged at review time — before the user approves it. The approve path then just stamps approvedAt on the now-existing record, unchanged.

**Rejected because:** PARTIAL on ac1 + sc2: review-conditional (no record when review is off/skipped) and writes on the code-review surface rather than sc2's completion/approve path — a scope-drift risk a1 avoids.

## 9. References

- **[[c1]]** `analyze-bundle` `s1 approve-completion-seam — approveWorkflowTarget (gates.ts:636-704, the insrc_workflow_approve landing) → approveOne (:648-690) → approveArtifactByJsonPath (gates.ts:498-543, ArtifactMissingError if the json is absent, stamps meta.approvedAt); approve-build-completion.test.ts proves BUILD-as-story-completion is BUILD-scoped by the BUILD- basename / meta.workflow==='build'.`
- **[[c2]]** `analyze-bundle` `s1 record-shape-to-mirror — the SOLE production persistBuildRecord caller handleValidate (validate.ts:59-115; construction at :93-105: author 'insrc-build', meta.workflow='build'/standalone:false/epicHash/storyId/createdAt/updatedAt, body.tasks + changeLog-when-nonempty, empty change-log OMITTED, gated on non-empty ids, try/catch-swallowed); persistBuildRecord (standalone-record.ts:172-189) read-merge-write upsert = the k3 substrate; collectBuildChangeLog (changed-files.ts:67-89) injectable listChanged seam, git failure → [].`
- **[[c3]]** `analyze-bundle` `s1 test-patterns — the hermetic tmp-repo + stubbed-listChanged idioms S2's tests extend: approve-build-completion.test.ts / approve-workflow-target.test.ts (isApproved = meta.approvedAt !== undefined), build-record.test.ts + provenance-build.test.ts (upsert-merge = exactly one record), changed-files.test.ts (listChanged stub: empty → [], git failure → []).`
- **[[c4]]** `prior-artifact` `HLD sc2 (Completion-path BUILD-record persistence) + Epic constraints k1 (additive/byte-identical), k3 (exactly one BUILD record, idempotent), k5 (in-process only) — the contract S2 implements.`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 8 LOW** · model `client` · reviewed 2026-09-29T17:03:05.497Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| 2.4/c1 | citation | LOW | auto | approveWorkflowTarget is defined in src/workflow/gates.ts (around line 636) — the insrc_workflow_approve landing S2 hooks the completion record into. | READ confirms gates.ts:636 = `export function approveWorkflowTarget(` — the insrc_workflow_approve landing S2 hooks. | Confirmed — no change. |
| 2.5/c1 | citation | LOW | auto | approveArtifactByJsonPath is defined in src/workflow/gates.ts (around line 498) and throws ArtifactMissingError when the json path is absent, stamping meta.approvedAt on an existing artifact. | READ confirms gates.ts:498 = `export function approveArtifactByJsonPath(jsonPath: string, ...): ApprovalResult {`; ArtifactMissingError is present in gates.ts. Accurate. | Confirmed — no change. |
| 2.2/c2 | citation | LOW | auto | persistBuildRecord is defined in src/workflow/runners/build/standalone-record.ts (around line 172) as a read-merge-write upsert. | READ confirms standalone-record.ts:172 = `export function persistBuildRecord(repoPath: string, rec: BuildRecord): { md: string; json: string } {`. | Confirmed — no change. |
| 2.3/c2 | citation | LOW | auto | collectBuildChangeLog is defined in src/workflow/runners/build/changed-files.ts (around line 67) with an injectable listChanged parameter defaulting to changedFiles. | READ confirms changed-files.ts:67 = `export async function collectBuildChangeLog(`; grep confirms it is the single definition with the injectable listChanged param. | Confirmed — no change. |
| 3.1/c2 | inventory | LOW | auto | persistBuildRecord has EXACTLY ONE production caller — handleValidate in src/mcp/build-step/phases/validate.ts (the record-construction pattern S2 mirrors); all other callers are tests or the internal delegate. | grep `persistBuildRecord\\(` shows the only production caller is validate.ts:102; standalone-record.ts:195 is the module's own internal delegate, all others are tests. Sole-production-caller premise holds — the completion path is genuinely a NEW second invocation site. | Confirmed — the S2 completion-path invocation is a new site. |
| migration/c2 | semantic | LOW | auto | The validate-phase BuildRecord construction (validate.ts ~:102) builds meta.workflow='build', standalone:false with author 'insrc-build', and omits an empty change-log — the shape S2 mirrors at the completion site. | grep confirms validate.ts:101 uses author 'insrc-build' and validate.ts:103 builds `meta: { workflow: 'build', standalone: false, epicHash, storyId, createdAt: now, updatedAt: now }` — the exact record shape S2 mirrors at the completion site. | Confirmed — no change. |
| 5/c1 | citation | LOW | auto | A dedicated approve-build-completion.test.ts exists proving BUILD-as-story-completion is BUILD-scoped (keyed on the BUILD- basename / meta.workflow==='build'). | READ confirms src/workflow/__tests__/approve-build-completion.test.ts exists (BUILD-as-story-completion test S2's integration tests extend). | Confirmed — no change. |
| 2.1 | inventory | LOW | auto | ensureBuildRecordOnCompletion and its module src/workflow/runners/build/completion-record.ts are NET-NEW — they do not exist yet (S2 creates them), so no current source defines them. | grep `ensureBuildRecordOnCompletion` = 25 matches, all in docs (this LLD), zero in src/. The function + completion-record.ts module are genuinely net-new — S2's deliverable, not a mis-cited existing symbol. | Confirmed — net-new module, correctly not claimed to exist. |
