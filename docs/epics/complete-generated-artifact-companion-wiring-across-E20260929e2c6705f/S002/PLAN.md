<!-- insrc:artifact PLAN-e2c6705fd105d4ac-s2 -->

# Plan: E20260929e2c6705f:S002

## Summary

**Epic:** `complete-generated-artifact-companion-wiring-across`
**LLD run:** `wf-1790700756608-bn4hqt`
**LLD effective hash:** `35f2a2c76e97...`

Building S2 adds a small completion-record hook and wires it into the approve path so every completed story build leaves a BUILD ledger entry — including controller-side builds that skip the validate step. The new ensureBuildRecordOnCompletion module mirrors the validate-phase record construction and reuses the existing writer + change-log collector unchanged; approveWorkflowTarget becomes async so the record is created (or merged, idempotently) from the git changed set before the artifact is approved. All new behaviour is proven hermetically over a tmp repo with a stubbed changed-set seam — no real git.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add the ensureBuildRecordOnCompletion module (create-or-merge the BUILD record) | M | — | unit: completion-record: create — no prior BUILD json + stubbed listChanged ['a.ts','b.ts'] → BUILD-<hash>-<story>.json with meta.workflow='build'/standalone:false + body.changeLog carrying the two files (ac1); unit: completion-record: empty/failure — stubbed listChanged → [] (and a rejecting stub → collector swallows to []) → record written with changeLog OMITTED, no throw (ac3); unit: completion-record: no-op + swallow — empty epicHash/storyId → returns undefined, no BUILD-undefined path; persistBuildRecord throw → warning, returns undefined, no rethrow | [[c1]] [[c2]] |
| 2 | **`t2`** Wire ensureBuildRecordOnCompletion into the BUILD approve/completion path (approveWorkflowTarget → async) | M | `t1` | integration: approve-completion: controller-side create — single-artifact approve of a BUILD- target with NO prior json (stubbed changed set) creates the record THEN stamps approvedAt; isApproved true, no ArtifactMissingError (ac1); integration: approve-completion: epic-batch over two BUILD stories → each record created/merged before approval, no cross-story interference; validate-then-complete = exactly one merged record (ac2/k3); integration: approve-completion: non-BUILD artifact (LLD/PLAN) approved → no BUILD record written, approve + code-review-gate behaviour byte-for-byte unchanged | [[c1]] [[c3]] [[c4]] |
| 3 | **`t3`** Add the unit + integration tests for the completion-path record | M | `t1`, `t2` | unit: completion-record: merge — prior validate-written record (tasks + changeLog) → persistBuildRecord upsert MERGES, exactly one record, prior tasks preserved, updatedAt refreshed (ac2/k3); unit: completion-record: buildArtifactId→parse round-trip incl. a hyphen-bearing id → { epicHash, storyId } recovered exactly (no mis-split); integration: approve-completion: whole workflow+mcp sweep stays green — the existing approve-build-completion / approve-workflow-target / build-record suites pass unchanged under the now-async approveWorkflowTarget | [[c3]] |

### 1.1 E20260929e2c6705f:S002:T001 — Add the ensureBuildRecordOnCompletion module (create-or-merge the BUILD record)

Add src/workflow/runners/build/completion-record.ts exporting `ensureBuildRecordOnCompletion(repoPath, { epicHash, storyId }, listChanged?)`. It mirrors the validate.ts:93-105 construction: guard on non-empty epicHash+storyId (no-op returning undefined otherwise, never a BUILD-undefined path); now = ISO timestamp; changeLog = await collectBuildChangeLog(repoPath, { author: 'insrc-build', timestamp: now }, listChanged); persistBuildRecord(repoPath, { meta: { workflow: 'build', standalone: false, epicHash, storyId, createdAt: now, updatedAt: now }, body: { tasks: [], ...(changeLog.length > 0 ? { changeLog } : {}) } }). Wrap collect+persist in try/catch → getLogger warning, return undefined (never rethrow). Import BuildRecord + persistBuildRecord (standalone-record.ts), collectBuildChangeLog (changed-files.ts), getLogger (shared/logger.js). No signature change to any reused symbol.

**Acceptance checks:**
- completion-record.ts exports ensureBuildRecordOnCompletion with the LLD signature; imports BuildRecord + persistBuildRecord + collectBuildChangeLog unchanged; tsc clean.
- The persisted record matches the validate shape (meta.workflow='build', standalone:false, epicHash/storyId, createdAt/updatedAt; body.tasks:[] + changeLog only when non-empty); an empty change-set omits the changeLog slot.
- The persistBuildRecord upsert is reused as-is for idempotency — a create writes a fresh BUILD-<epicHash>-<storyId>, a second call merges onto it (no duplicate); no dedup logic is added.
- Failure paths swallow to a warning: an empty-id ref no-ops, a collector/persist throw is caught and returns undefined without rethrowing.

### 1.2 E20260929e2c6705f:S002:T002 — Wire ensureBuildRecordOnCompletion into the BUILD approve/completion path (approveWorkflowTarget → async)

Invoke ensureBuildRecordOnCompletion for a BUILD story target BEFORE the record is approved so a controller-side build's BUILD-<hash>-<story> record is materialised in time (no ArtifactMissingError). RESOLVED design decision (per s3 critique): approveWorkflowTarget (gates.ts:636) becomes ASYNC (Promise<WorkflowApproveResult>) — the create MUST be awaited before the single-artifact existsSync at :694, so awaiting inside the LLD-named seam is the correct placement. This is a KNOWN, backward-compatible-for-awaiting-callers refinement of the LLD's 'no signature change to approveWorkflowTarget' assertion (recorded as a plan note, not a silent drift). For a BUILD- target: single path parses epicHash/storyId from the BUILD-<epicHash>-<storyId> basename via a deterministic inverse of buildArtifactId (reuse a storage.ts helper if one exists, else add one keyed on the BUILD- prefix + fixed id shape so a hyphen-in-id can't mis-split); batch path uses readArtifactMeta per pending BUILD artifact. Await ensureBuildRecordOnCompletion, then proceed to existsSync/approveOne. Update EVERY approveWorkflowTarget caller (daemon approve IPC handler + any MCP/CLI approve) to await. Non-BUILD approvals + the code-review gate/withhold + approvedAt stamping + approveArtifactByJsonPath stay unchanged.

**Acceptance checks:**
- approveWorkflowTarget is async (Promise<WorkflowApproveResult>) and EVERY caller is updated to await it; tsc clean, no un-awaited/floating-promise lint — the create is awaited BEFORE the existsSync (no race).
- A single-artifact insrc_workflow_approve of a BUILD-<hash>-<story> target whose json does NOT yet exist create-materialises the record (change-log from the changed set) THEN stamps meta.approvedAt — no ArtifactMissingError (ac1).
- The BUILD- basename → { epicHash, storyId } parse is the exact inverse of buildArtifactId (round-trips even with a hyphen in an id) and the batch path resolves ids via readArtifactMeta per pending BUILD artifact; a validate-then-complete sequence yields exactly one merged BUILD record (ac2/k3).
- A non-BUILD artifact approval writes no BUILD record and its approve behaviour + the code-review withhold/gate logic are byte-for-byte unchanged (BUILD-scoped by the BUILD- prefix).

### 1.3 E20260929e2c6705f:S002:T003 — Add the unit + integration tests for the completion-path record

Add unit tests over completion-record.ts (tmp repo + stubbed listChanged): create (no prior record + ['a.ts','b.ts'] → BUILD json with the change-log), merge (prior validate-written record → exactly one merged record, prior tasks preserved), empty/failure (listChanged → [] or rejects → changeLog omitted, no throw), empty-id no-op, persist-throw swallow, and a buildArtifactId→parse round-trip (incl. a hyphen-bearing id). Add integration tests over the wired (now-async) approve path: controller-side create-then-approve (isApproved true, no ArtifactMissingError), epic-batch two-story create/merge, non-BUILD untouched. Mirror approve-build-completion.test.ts + build-record.test.ts + changed-files.test.ts scaffolds (mkdtemp + injectable listChanged, no real git).

**Acceptance checks:**
- Unit tests cover ac1 (create), ac2/k3 (merge = exactly one record), ac3 (empty-set omit + collector/persist failure swallowed), the empty-id no-op, AND the buildArtifactId→parse round-trip (hyphen-in-id can't mis-split) — all hermetic via the stubbed listChanged.
- Integration tests cover ac1 (controller-side complete on the wired async approve path), ac2 (validate-then-complete = one record), and the non-BUILD-untouched guard.
- The new tests pass under `npx tsx --test`, and the whole workflow + mcp sweep stays green with no regression to the existing approve-build-completion / approve-workflow-target / build-record suites.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| ensureBuildRecordOnCompletion over a tmp repo with NO prior BUILD json + a stubbed listChanged returning ['a.ts','b.ts'] → CREATES BUILD-<hash>-<story>.json with meta.workflow='build', standalone:false, epicHash/storyId, and body.changeLog carrying the two files (ac1) | `t1`, `t3` |
| ensureBuildRecordOnCompletion when a prior validate-written record exists (tasks + changeLog) → persistBuildRecord upsert MERGES; exactly one BUILD-<hash>-<story> record remains, prior tasks preserved, updatedAt refreshed (ac2/k3) | `t3` |
| ensureBuildRecordOnCompletion with a stubbed listChanged returning [] (or throwing → collector swallows to []) → record written with the changeLog slot OMITTED, no throw (ac3) | `t1`, `t3` |
| ensureBuildRecordOnCompletion with ref.epicHash='' or ref.storyId='' → no-ops (returns undefined), writes no BUILD-undefined path | `t1`, `t3` |
| ensureBuildRecordOnCompletion when persistBuildRecord throws (monkeypatched / corrupt prior json) → swallowed to a warning, returns undefined, does not rethrow | `t1`, `t3` |
| approveWorkflowTarget on a BUILD story target with NO pre-existing BUILD json + a stubbed/derivable changed set → the record is created THEN meta.approvedAt is stamped (no ArtifactMissingError); isApproved(BUILD json) true (ac1) | `t2`, `t3` |
| approveWorkflowTarget epic-batch (epicHash) over two BUILD stories → each gets its own created/merged record before approval; no cross-story interference | `t2`, `t3` |
| approveWorkflowTarget on a non-BUILD artifact (LLD/PLAN) → no BUILD record written, approval behaviour unchanged (BUILD-scoped hook) | `t2`, `t3` |

## 3. References

- **[[c1]]** `analyze-bundle` `s1 wiring-site-shape — approveWorkflowTarget (gates.ts:636-704) is sync; approveOne reads meta via readArtifactMeta (:709); the single-artifact branch throws ArtifactMissingError at :694 before approveOne, the batch branch sweeps only existing pendingArtifactJsonPaths; the BUILD-completion withhold keys on basename startsWith('BUILD-') at :675. The create must complete (await) before existsSync → approveWorkflowTarget becomes async.`
- **[[c2]]** `prior-artifact` `LLD s2 contractDetails + migration — the ensureBuildRecordOnCompletion signature + the validate.ts:93-105 record shape it mirrors (author 'insrc-build', meta.workflow='build'/standalone:false, body.tasks:[] + changeLog-when-nonempty, empty-set omit-slot, try/catch swallow); reuses persistBuildRecord (standalone-record.ts:172) + collectBuildChangeLog (changed-files.ts:67) unchanged.`
- **[[c3]]** `analyze-bundle` `s1 reusables + test-scaffold — imports BuildRecord (standalone-record.ts:45) + buildArtifactId (storage.ts, the BUILD-<epicHash>-<storyId> id builder whose inverse t2 parses); the hermetic scaffolds S2's tests copy: mkdtemp tmp repo, injectable listChanged stub (changed-files.test.ts), validate-shape BUILD fixture (provenance-build.test.ts), isApproved via meta.approvedAt (approve-workflow-target.test.ts).`
- **[[c4]]** `prior-artifact` `LLD s2 hldContextSlice — sc2 (completion-path BUILD-record persistence) + the Epic constraints k1 (additive/byte-identical), k3 (exactly one BUILD record via the upsert), k5 (in-process only) that the wiring implements; the invariant that the validate-phase writer + approveArtifactByJsonPath stay untouched.`
