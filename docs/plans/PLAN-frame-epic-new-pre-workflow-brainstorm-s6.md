<!-- insrc:artifact PLAN-abd1ecf6a5f5063e-s6 -->

# Plan: E20260802abd1ecf6:S006

**Epic:** `frame-epic-new-pre-workflow-brainstorm`
**LLD run:** `wf-1785664607438-ogsjgd`
**LLD effective hash:** `688a10691972...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add the SpecArtifact record + renderSpecMarkdown (artifacts/spec.ts) | S | — | unit: renderSpecMarkdown emits Intent / Scope boundary / Non-goals / Decisions (each with ruledOut + reason) / Open items sections and the artifactIdMarker(specArtifactId(...)) header — not a conversation transcript; unit: the SpecArtifactBody carries category (a real BrainstormCategory id) + intent + scopeBoundary + nonGoals[] + decisions[{chosen,ruledOut,reason}] + openItems[]; unit: a fork-free body (decisions:[]/nonGoals:[]) renders valid markdown with empty sections | [[c1]] [[c2]] |
| 2 | **`t2`** Add the storage peers (SPECS_DIR, specArtifactId, specArtifactPaths, specMdRel) | S | `t1` | unit: specArtifactId(specHash) === 'SPEC-<specHash>'; unit: specArtifactPaths(repoPath, specHash).json is under ARTIFACTS_DIR ('.insrc/artifacts') so it is listed identically to DEF/HLD/LLD/PLAN, and .md is under SPECS_DIR; both absolute; unit: the same specHash yields the same paths (stable identifier) | [[c2]] [[c3]] |
| 3 | **`t3`** Wire the brainstorm synthesize/finalize in orchestrator.ts | M | `t2` | integration: orchestrator prepareSynthesize(intent 'brainstorm', stepOutputs) no longer throws 'not yet supported' and returns a synth prompt/schema targeting the SpecArtifactBody; integration: finalizeArtifact for 'brainstorm' with a valid synthesized body writes exactly one SpecArtifact (json+md), body carrying intent/scopeBoundary/nonGoals/decisions/openItems, meta.approvedAt unset; integration: finalizeArtifact rejects (retryable, writes nothing) a synthesized body missing a required field (e.g. empty scopeBoundary); integration: the other workflows' synth/finalize arms are unaffected (a stub/define finalize still works) | [[c4]] [[c5]] |
| 4 | **`t4`** Add the SpecArtifact record/storage + orchestrator-seam tests | S | `t3` | unit: writing the SpecArtifact json via writeAtomic to specArtifactPaths(...).json and reading it back parses to a deep-equal record; unit: writing the same body twice (deterministic specHash) overwrites idempotently and reads back identical content; live: a full brainstorm run to convergence produces a SpecArtifact whose intent + scopeBoundary read as a genuine structured statement (not a restatement of the raw idea) and whose decisions/nonGoals reflect the conversation | [[c6]] |

### E20260802abd1ecf6:S006:T001 — Add the SpecArtifact record + renderSpecMarkdown (artifacts/spec.ts)

Create src/workflow/artifacts/spec.ts mirroring define.ts: declare SpecDecision { chosen, ruledOut[], reason }, SpecArtifactBody { category: BrainstormCategory, intent, scopeBoundary, nonGoals[], decisions: SpecDecision[], openItems[] }, and SpecArtifact = WorkflowArtifact<SpecArtifactBody> with kind 'spec' + specHash + shared meta (createdAt, optional approvedAt/review + attribution). Add renderSpecMarkdown(artifact) emitting Intent / Scope boundary / Non-goals / Decisions (each with ruledOut + reason) / Open items sections headed by artifactIdMarker(specArtifactId(...)). category reuses the REAL BrainstormCategory union from shared/brainstorm-classes.ts; SpecDecision uses `chosen`.

**Acceptance checks:**
- SpecArtifactBody has category (BrainstormCategory), intent, scopeBoundary, nonGoals[], decisions: SpecDecision[] {chosen,ruledOut[],reason}, openItems[]; SpecArtifact adds kind 'spec' + specHash + meta
- renderSpecMarkdown emits one section per body field (Intent/Scope boundary/Non-goals/Decisions/Open items) + the artifactIdMarker header, not a transcript
- a fork-free body (decisions:[]/nonGoals:[]) renders valid markdown with empty sections
- spec.ts imports WorkflowArtifact from ../types.js + artifactIdMarker/specArtifactId from ../storage.js, mirroring define.ts; tsc clean

### E20260802abd1ecf6:S006:T002 — Add the storage peers (SPECS_DIR, specArtifactId, specArtifactPaths, specMdRel)

In src/workflow/storage.ts add a SPECS_DIR const (docs dir for the spec md, peer of DEFINES_DIR/PLANS_DIR), specArtifactId(specHash)='SPEC-<specHash>' (peer of defineArtifactId), specArtifactPaths(repoPath, specHash) returning { md under SPECS_DIR, json under ARTIFACTS_DIR } (peer of defineArtifactPaths), and specMdRel(specHash) (peer of defineMdRel). Hash-addressed; the existing writeAtomic is the write path (no new write helper).

**Acceptance checks:**
- specArtifactId(specHash) === 'SPEC-<specHash>'
- specArtifactPaths(repoPath, specHash).json is under ARTIFACTS_DIR ('.insrc/artifacts') and .md is under SPECS_DIR; both absolute paths
- SPECS_DIR + specMdRel are declared as peers of the DEFINES_DIR/defineMdRel family
- tsc clean; no change to existing storage exports

### E20260802abd1ecf6:S006:T003 — Wire the brainstorm synthesize/finalize in orchestrator.ts

In src/workflow/orchestrator.ts replace the brainstorm 'not yet supported' throws: add a brainstormSynthesizer (prepareSynthesize case 'brainstorm') that emits a synth prompt+schema instructing the LLM to structure the converged elicit stepOutputs (workingStatement -> distinct intent + scopeBoundary; decisions/nonGoals/openItems 1:1) into a SpecArtifactBody; and finalizeBrainstorm (finalizeArtifact case 'brainstorm') that validates the body, computes specHash, builds the SpecArtifact (meta.createdAt + attribution, approvedAt unset), and writes {md,json} via specArtifactPaths + writeAtomic + renderSpecMarkdown — mirroring defineSynthesizer/finalizeDefine. The other workflows' arms are untouched.

**Acceptance checks:**
- prepareSynthesize('brainstorm', stepOutputs) no longer throws and returns a synth prompt+schema targeting the SpecArtifactBody
- finalizeArtifact 'brainstorm' with a valid synthesized body writes exactly one SpecArtifact (json under ARTIFACTS_DIR + md under SPECS_DIR) with meta.approvedAt unset
- finalizeArtifact 'brainstorm' rejects (retryable, writes nothing) a body missing a required field (e.g. empty scopeBoundary)
- the stub/define/design.epic/design.story/plan synth+finalize arms are unchanged; tsc clean

### E20260802abd1ecf6:S006:T004 — Add the SpecArtifact record/storage + orchestrator-seam tests

Add src/workflow/__tests__/spec-artifact.test.ts (node:test + assert/strict): render + field-set unit cases, specArtifactId/specArtifactPaths path cases, and a writeAtomic round-trip (write json -> read back deep-equal, idempotent on same specHash). Add an orchestrator wiring test: brainstorm prepareSynthesize/finalizeArtifact no longer throw and a converged elicit stepOutputs fixture yields exactly one SpecArtifact carrying intent/scopeBoundary/nonGoals/decisions/openItems (approvedAt unset), plus a rejects-under-structured-body case. Run the workflow sweep + tsc.

**Acceptance checks:**
- spec-artifact.test.ts covers render (sections + marker), paths (ARTIFACTS_DIR json + SPECS_DIR md), and writeAtomic round-trip deep-equal + idempotent re-write
- an orchestrator test proves brainstorm synth/finalize no longer throw and produce exactly one SpecArtifact from a converged stepOutputs, plus the under-structured-body rejection
- the full workflow + workflow-step sweep passes and tsc is clean

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| renderSpecMarkdown emits Intent / Scope boundary / Non-goals / Decisions (each with ruledOut + reason) / Open items sections and the artifactIdMarker(specArtifactId(...)) header — not a conversation transcript | `t1` |
| the SpecArtifactBody carries category (a real BrainstormCategory id) + intent + scopeBoundary + nonGoals[] + decisions[{chosen,ruledOut,reason}] + openItems[] | `t1` |
| a fork-free body (decisions:[]/nonGoals:[]) renders valid markdown with empty sections | `t1` |
| specArtifactId(specHash) === 'SPEC-<specHash>' | `t2` |
| specArtifactPaths(repoPath, specHash).json is under ARTIFACTS_DIR ('.insrc/artifacts') so it is listed identically to DEF/HLD/LLD/PLAN, and .md is under SPECS_DIR; both absolute | `t2` |
| the same specHash yields the same paths (stable identifier) | `t2` |
| writing the SpecArtifact json via writeAtomic to specArtifactPaths(...).json and reading it back parses to a deep-equal record | `t4` |
| writing the same body twice (deterministic specHash) overwrites idempotently and reads back identical content | `t4` |
| orchestrator prepareSynthesize(intent 'brainstorm', stepOutputs) no longer throws 'not yet supported' and returns a synth prompt/schema targeting the SpecArtifactBody | `t3` |
| finalizeArtifact for 'brainstorm' with a valid synthesized body writes exactly one SpecArtifact (json+md), body carrying intent/scopeBoundary/nonGoals/decisions/openItems, meta.approvedAt unset | `t3` |
| finalizeArtifact rejects (retryable, writes nothing) a synthesized body missing a required field (e.g. empty scopeBoundary) | `t3` |
| the other workflows' synth/finalize arms are unaffected (a stub/define finalize still works) | `t3` |
| a full brainstorm run to convergence produces a SpecArtifact whose intent + scopeBoundary read as a genuine structured statement (not a restatement of the raw idea) and whose decisions/nonGoals reflect the conversation | `t4` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s6 contractDetails.api: SpecArtifact + renderSpecMarkdown (the record family + renderer in artifacts/spec.ts)`
- **[[c2]]** `prior-artifact` `LLD s6 dataModelChanges: SpecArtifact/SpecArtifactBody/SpecDecision new record (field set + BrainstormCategory + chosen)`
- **[[c3]]** `prior-artifact` `LLD s6 dataModelChanges: specArtifactId/specArtifactPaths/specMdRel/SPECS_DIR storage peers (json under ARTIFACTS_DIR, md under SPECS_DIR, writeAtomic)`
- **[[c4]]** `prior-artifact` `LLD s6 contractDetails.api: finalizeBrainstorm (+ brainstormSynthesizer) validating + persisting the SpecArtifact, approvedAt unset`
- **[[c5]]** `prior-artifact` `LLD s6 dataModelChanges + interactionWithShared: brainstorm synth/finalize wiring replacing the orchestrator 'not yet supported' throws; sc1 implemented`
- **[[c6]]** `prior-artifact` `LLD s6 testStrategy: record/render/paths/round-trip + orchestrator-seam + live suites under src/workflow/__tests__/`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — plan (plan)

**0 HIGH · 0 MED · 6 LOW** · model `client` · reviewed 2026-08-02T11:14:47.788Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| tasks | inventory | LOW | manual | The plan enumerates exactly four tasks t1/t2/t3/t4 with the linear DAG t1 -> t2 -> t3 -> t4. | The plan Tasks table enumerates t1/t2/t3/t4 with DAG t1<-t2<-t3<-t4. Confirmed. | none — verified sound |
| t1 | citation | LOW | manual | The artifact record+renderer template t1 mirrors (define.ts importing artifactIdMarker + WorkflowArtifact) exists, and no artifacts/spec.ts exists yet. | src/workflow/artifacts/define.ts:20/:23 import artifactIdMarker + WorkflowArtifact (the record+renderer template); no artifacts/spec.ts exists in src yet — exactly what t1 creates. Confirmed. | none — verified sound |
| t2 | citation | LOW | manual | storage.ts holds defineArtifactId/defineArtifactPaths/defineMdRel + ARTIFACTS_DIR + writeAtomic (the peers t2 mirrors); no specArtifactId/specArtifactPaths/SPECS_DIR exists yet. | src/workflow/storage.ts:147 defineArtifactId, :194 defineArtifactPaths, :50 ARTIFACTS_DIR present; no specArtifactId/SPECS_DIR in src yet — the additive peers t2 adds. Confirmed. | none — verified sound |
| t3 | citation | LOW | manual | orchestrator.ts prepareSynthesize + finalizeArtifact throw 'not yet supported' for brainstorm (the arms t3 replaces), and finalizeDefine is the pattern; category at :137 already routes brainstorm in prepareDecompose. | src/workflow/orchestrator.ts routes brainstorm (case :137) and defines finalizeDefine (:649); prepareSynthesize/finalizeArtifact throw 'not yet supported' for brainstorm (the arms t3 replaces, mirroring finalizeDefine). Confirmed. | none — verified sound |
| t1 | closed-union | LOW | manual | BrainstormCategory (reused for SpecArtifactBody.category) is defined in src/shared/brainstorm-classes.ts. | src/shared/brainstorm-classes.ts:12 `export type BrainstormCategory` — the union reused for SpecArtifactBody.category. Confirmed. | none — verified sound |
| t4 | citation | LOW | manual | The workflow artifact test home exists (src/workflow/__tests__/ with define-artifact.test.ts) where t4's spec-artifact.test.ts lands. | src/workflow/__tests__/define-artifact.test.ts imports from ../artifacts/define.js — the artifact-test home t4's spec-artifact.test.ts joins. Confirmed. | none — verified sound |
