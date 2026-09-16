<!-- insrc:artifact PLAN-d3e71f3a6001e773-S001 -->

# Plan: S001

**Epic:** `build-ledger-plan-driven-builds-today`
**LLD run:** `wf-1785861871369-hn8p08`
**LLD effective hash:** `d3e71f3a6001...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Generalize the BUILD record type (standalone true->boolean + optional provenance) | S | — | unit: StandaloneBuildRecord callers (implement.ts:133) still typecheck against the widened type | [[c2]] |
| 2 | **`t2`** Add persistBuildRecord (upsert read-merge-write) + make persistStandaloneBuildRecord a thin wrapper | M | `t1` | unit: persistBuildRecord writes a fresh BUILD-<epicHash>-<storyId>.json (standalone:false) at buildArtifactPaths when none exists; unit: a second call UNIONS tasks[] by id, preserves createdAt, refreshes updatedAt (one record, not N); unit: an existing meta.approvedAt (+ rejectedAt/reviewOverride) is PRESERVED across an upsert; unit: a malformed prior record is treated as absent (fail-open fresh write), not a throw; unit: persistStandaloneBuildRecord still writes standalone:true json + the same md via the thin wrapper | [[c2]] [[c3]] |
| 3 | **`t3`** Persist the plan-driven BUILD record from the validate phase | M | `t2` | integration: handleValidate on a plan-driven target upserts BUILD-<epicHash>-<storyId>.json (standalone:false) recording the validated task + passed, after computing the verdict; integration: a target with no resolvable epicHash/storyId SKIPS persistence (no BUILD-undefined path) and still returns the verdict; integration: a persistence failure (writeAtomic throw) is caught and the verdict is returned unchanged (persistence never fails validate) | [[c1]] [[c3]] |
| 4 | **`t4`** Tests: persistBuildRecord upsert/fail-open, Trivial regression, validate-persist integration, completion consumability | M | `t3` | unit: approveWorkflowTarget on the persisted BUILD-<epicHash>-<storyId>.json stamps meta.approvedAt (keys on the BUILD- prefix + meta.{epicHash,storyId}); unit: the record appears in the epic-batch sweep (pendingArtifactJsonPaths) like a back-filled BUILD; unit: full workflow + mcp sweeps green after the record-writer + validate-persist changes | [[c1]] [[c2]] [[c3]] [[c5]] |

### `t1` — Generalize the BUILD record type (standalone true->boolean + optional provenance)

In src/workflow/runners/build/standalone-record.ts widen the record type: introduce BuildRecord with meta.standalone: boolean (was the `true` literal), + optional meta.updatedAt and optional body.tasks?: { id: string; passed?: boolean }[] and body.commit?: string. Keep StandaloneBuildRecord as a standalone:true narrowing (alias) so existing Trivial callers (implement.ts:133) still typecheck. Strict ESM .js imports, import type, exactOptionalPropertyTypes-safe optionals.

**Acceptance checks:**
- standalone-record.ts exports BuildRecord with meta.standalone:boolean + optional meta.updatedAt + body.tasks?[]/commit?; StandaloneBuildRecord remains a standalone:true narrowing
- existing StandaloneBuildRecord callers (implement.ts:133 Trivial branch) typecheck unchanged; tsc --noEmit clean

### `t2` — Add persistBuildRecord (upsert read-merge-write) + make persistStandaloneBuildRecord a thin wrapper

Add persistBuildRecord(repoPath, rec: BuildRecord): { md; json } that READS any existing BUILD-<epicHash>-<storyId>.json (via buildArtifactPaths), MERGES on top (union body.tasks[] by id with passed refreshed, preserve createdAt + meta.approvedAt/rejectedAt/reviewOverride, refresh meta.updatedAt), and writeAtomic-writes json+md; a malformed/absent prior file fails open to a fresh write (try/catch, getLogger warn). Re-point persistStandaloneBuildRecord to delegate to persistBuildRecord with standalone:true so the Trivial output is byte-identical. Reuse buildArtifactPaths + the existing md renderer (extend it to render the plan-driven tasks/commit when present).

**Acceptance checks:**
- persistBuildRecord writes json+md at buildArtifactPaths; a prior record is read + merged (tasks unioned, createdAt + approvedAt/rejectedAt/reviewOverride preserved, updatedAt refreshed); a malformed prior file fails open to a fresh write
- persistStandaloneBuildRecord delegates to persistBuildRecord (standalone:true) with byte-identical Trivial json+md output
- tsc --noEmit clean; getLogger used (no console.log)

### `t3` — Persist the plan-driven BUILD record from the validate phase

In src/mcp/build-step/phases/validate.ts handleValidate, after computing `passed` and before `return { next:'done', verdict, passed }` (validate.ts:85), for a plan-driven target whose resolved.ref carries epicHash + storyId, call persistBuildRecord to upsert BUILD-<epicHash>-<storyId>.json (standalone:false) recording { id: resolved.ref.taskId, passed }. Gate: skip when epicHash/storyId is absent (no BUILD-undefined path). Wrap the persist in try/catch so a writeAtomic failure is logged and the verdict is returned unchanged (persistence never alters/blocks the verdict). Use the real return type (BuildStepDone | BuildStepError).

**Acceptance checks:**
- handleValidate upserts a standalone:false BUILD record recording the validated task + passed for a plan-driven target, right before returning the (unchanged) verdict
- persistence is SKIPPED when the resolved ref lacks epicHash/storyId (no BUILD-undefined write) and a persist throw is caught so the verdict is still returned
- the returned { next:'done', verdict, passed } shape is unchanged; tsc --noEmit clean

### `t4` — Tests: persistBuildRecord upsert/fail-open, Trivial regression, validate-persist integration, completion consumability

Extend src/workflow/runners/build/__tests__ with persistBuildRecord unit tests (fresh write; union tasks + preserve createdAt/approvedAt across upsert; malformed-prior fail-open) + a Trivial regression (persistStandaloneBuildRecord byte-identical). Add a build-step validate integration test using _setBuildValidateProviderForTests with a fake verdict provider (plan-driven target persists standalone:false; no-identity skips; persist-throw returns the verdict). Add a completion-consumability assertion (approveWorkflowTarget stamps approvedAt on the persisted record) reusing the approve-build-completion.test.ts patterns. node:test via npx tsx --test; run the workflow + mcp sweeps green.

**Acceptance checks:**
- unit tests cover persistBuildRecord fresh/upsert-union/preserve-approvedAt/fail-open + the Trivial byte-identical regression
- an integration test drives handleValidate with a fake provider proving plan-driven persist / no-identity skip / persist-throw-returns-verdict
- a consumability test proves approveWorkflowTarget stamps approvedAt on the persisted plan-driven record; the full workflow + mcp sweeps pass

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| persistBuildRecord writes a fresh BUILD-<epicHash>-<storyId>.json (standalone:false) at buildArtifactPaths when none exists | `t2`, `t4` |
| a second call UNIONS tasks[] by id, preserves createdAt, refreshes updatedAt (one record, not N) | `t2`, `t4` |
| an existing meta.approvedAt (+ rejectedAt/reviewOverride) is PRESERVED across an upsert | `t2`, `t4` |
| a malformed prior record is treated as absent (fail-open fresh write), not a throw | `t2`, `t4` |
| persistStandaloneBuildRecord still writes standalone:true json + the same md via the thin wrapper | `t2`, `t4` |
| StandaloneBuildRecord callers (implement.ts:133) still typecheck against the widened type | `t1`, `t4` |
| handleValidate on a plan-driven target upserts BUILD-<epicHash>-<storyId>.json (standalone:false) recording the validated task + passed, after computing the verdict | `t3`, `t4` |
| a target with no resolvable epicHash/storyId SKIPS persistence (no BUILD-undefined path) and still returns the verdict | `t3`, `t4` |
| a persistence failure (writeAtomic throw) is caught and the verdict is returned unchanged (persistence never fails validate) | `t3`, `t4` |
| approveWorkflowTarget on the persisted BUILD-<epicHash>-<storyId>.json stamps meta.approvedAt (keys on the BUILD- prefix + meta.{epicHash,storyId}) | `t4` |
| the record appears in the epic-batch sweep (pendingArtifactJsonPaths) like a back-filled BUILD | `t4` |

## Citations

- **[[c1]]** `prior-artifact` `LLD S001 contractDetails/errorPaths — handleValidate (validate.ts:85) persists the plan-driven BUILD record after the verdict; verdict shape unchanged (a1)`
- **[[c2]]** `prior-artifact` `LLD S001 dataModelChanges — BuildRecord generalized from StandaloneBuildRecord (standalone true->boolean + optional tasks[]/commit/updatedAt); persistStandaloneBuildRecord thin wrapper`
- **[[c3]]** `prior-artifact` `LLD S001 invariantsToPreserve — completion gate keys on BUILD- prefix + meta.{epicHash,storyId}; upsert preserves createdAt/approvedAt/rejectedAt/reviewOverride (gates.ts)`
- **[[c5]]** `prior-artifact` `LLD S001 testStrategy — node:test suites approve-build-completion.test.ts + runners/build/__tests__ + a validate integration test via _setBuildValidateProviderForTests`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — plan (plan)

**0 HIGH · 0 MED · 8 LOW** · model `client` · reviewed 2026-08-04T17:16:07.637Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| t3 | citation | LOW | manual | handleValidate in src/mcp/build-step/phases/validate.ts computes `passed` and returns { next:'done', verdict, passed } (near validate.ts:85) — the hook point for the plan-driven persist. | reads confirm the `const passed =` + `return { next:'done', verdict, passed }` region near validate.ts:84-85 — the plan-driven persist hook point is exactly where t3 places it. | none — verified sound. |
| t3 | citation | LOW | manual | validate.ts exports a test seam _setBuildValidateProviderForTests (+ providerOverride) so the integration test can inject a fake ValidateProvider offline. | grep resolves _setBuildValidateProviderForTests + providerOverride in validate.ts — the offline test seam t3/t4 rely on exists. | none — verified sound. |
| t1 | citation | LOW | manual | The Trivial standalone persist call is at src/mcp/build-step/phases/implement.ts:133 (persistStandaloneBuildRecord), the caller that must keep typechecking against the widened record type. | reads confirm persistStandaloneBuildRecord( at implement.ts:133 (the Trivial branch) — the caller that must keep typechecking against the widened type. | none — verified sound. |
| t2 | citation | LOW | manual | buildArtifactPaths (src/workflow/storage.ts) is the reused path mapper for BUILD-<epicHash>-<storyId>.json + md that persistBuildRecord writes through. | reads confirm export function buildArtifactPaths at storage.ts:293 + writeAtomic — the reused path mapper/writer for persistBuildRecord. | none — verified sound. |
| t4 | citation | LOW | manual | The completion gate (approveWorkflowTarget / the BUILD- prefix predicate) + pendingArtifactJsonPaths live in src/workflow/gates.ts, consumed by the t4 consumability test; approveArtifactByJsonPath stamps approvedAt. | grep resolves startsWith('BUILD-') at gates.ts:648 + approveArtifactByJsonPath + pendingArtifactJsonPaths — the completion gate the t4 consumability test drives. | none — verified sound. |
| t4 | citation | LOW | manual | The test suites the plan extends exist: src/workflow/__tests__/approve-build-completion.test.ts + src/workflow/runners/build/__tests__. | grep resolves approveWorkflowTarget in approve-build-completion.test.ts + the standalone-record suite under runners/build/__tests__ — the suites t4 extends exist. | none — verified sound. |
| cl7 | ordering | LOW | manual | The task dependency graph is a linear acyclic chain t1->t2->t3->t4 with order 1..4 a valid topological sort. | By inspection: t1[] , t2[t1], t3[t2], t4[t3] — a linear acyclic chain; order 1..4 is a valid topological sort. | none — verified sound. |
| t2 | cross-artifact | LOW | manual | Every task derivedFrom id (c1,c2,c3,c5) resolves to a citation defined in this plan; the LLD handoff deliverables (record type, upsert+gate invariants, validate persistence, tests) are collectively covered. | Every task derivedFrom id is c1/c2/c3/c5, all defined in the plan's citations[]; the LLD deliverables (record type c2, upsert+gate c3, validate persistence c1, tests c5) are collectively covered. | none — verified sound. |
