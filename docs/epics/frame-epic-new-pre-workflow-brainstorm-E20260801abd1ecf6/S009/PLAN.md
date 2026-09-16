<!-- insrc:artifact PLAN-abd1ecf6a5f5063e-s9 -->

# Plan: E20260802abd1ecf6:S009

**Epic:** `frame-epic-new-pre-workflow-brainstorm`
**LLD run:** `wf-1785674788330-77cw4a`
**LLD effective hash:** `688a10691972...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add the pure specScopeFitsStandalone(sizeClass) guard to seed-focus.ts | S | — | unit: seed-focus.test.ts: specScopeFitsStandalone table — feature/small true, epic/trivial false (covered in t3) | [[c1]] [[c3]] |
| 2 | **`t2`** Stamp meta.seededFromSpec in finalizeStandaloneLld + surface it in renderLldMarkdown | S | — | unit: seed-focus.test.ts: finalizeArtifact('design.story') standalone+specHash -> meta.seededFromSpec = hash + renderLldMarkdown contains SPEC-<hash>; plain -> unset (covered in t3) | [[c2]] [[c4]] |
| 3 | **`t3`** Unit tests for the ac3 guard + standalone provenance parity | S | `t1`, `t2` | unit: seed-focus.test.ts: specScopeFitsStandalone table (ac3) + finalizeStandaloneLld seededFromSpec stamp/renderer + plain-absence (ac4) + resolveStageFocus standalone-vs-define parity (ac1/ac2) | [[c5]] [[c1]] [[c2]] |

### E20260802abd1ecf6:S009:T001 — Add the pure specScopeFitsStandalone(sizeClass) guard to seed-focus.ts

In src/workflow/seed-focus.ts add `export function specScopeFitsStandalone(sizeClass: SizeClass): boolean` returning `routeForSizeClass(sizeClass).startStage === 'design.story'` (true for feature/small; false for epic/trivial). Import routeForSizeClass from './triage/classify.js' + SizeClass from './triage/types.js'. Pure + total over SizeClass. This is the deterministic ac3 core the standalone seeding path consults to surface a scope-too-large mismatch (never narrow).

**Acceptance checks:**
- seed-focus.ts exports specScopeFitsStandalone with the LLD signature
- specScopeFitsStandalone('feature')===true, ('small')===true, ('epic')===false, ('trivial')===false (matches routeForSizeClass)
- tsc --noEmit clean

### E20260802abd1ecf6:S009:T002 — Stamp meta.seededFromSpec in finalizeStandaloneLld + surface it in renderLldMarkdown

In src/workflow/orchestrator.ts finalizeStandaloneLld (:1629, meta literal ~:1660), when intent.params.specHash is a non-empty string spread ...{seededFromSpec} into the LLD meta (beside standalone:true/sizeClass), mirroring s8's finalizeDefine (:867). In src/workflow/artifacts/lld.ts renderLldMarkdown (:220), when (meta as {seededFromSpec?:string}).seededFromSpec is set emit a `**Seeded from:** SPEC-<hash>` header line (mirroring define.ts:97). ArtifactMetaBase.seededFromSpec already exists (types.ts:347) — no type change.

**Acceptance checks:**
- finalizeStandaloneLld writes meta.seededFromSpec = intent.params.specHash when present; leaves it unset otherwise (ac4)
- renderLldMarkdown emits the seeded-from line only when meta.seededFromSpec is set
- tsc --noEmit clean

### E20260802abd1ecf6:S009:T003 — Unit tests for the ac3 guard + standalone provenance parity

Extend src/workflow/__tests__/seed-focus.test.ts (or a peer): (ac3) specScopeFitsStandalone table — epic/trivial false, feature/small true; (ac4/provenance) finalizeArtifact('design.story') with a standalone intent (params.standalone:true, storyId, sizeClass:'feature', specHash) + a minimal standalone LLD body -> meta.seededFromSpec = hash + renderLldMarkdown contains SPEC-<hash>; a plain (no specHash) standalone run -> unset + no seeded-from line; (ac1/ac2) resolveStageFocus over a {standalone:true, specHash} bag yields the same composed framing as the define-shape bag (reuse s8 tmp-repo/approved-spec fixtures).

**Acceptance checks:**
- a pure table test proves specScopeFitsStandalone across all four SizeClasses (ac3)
- a finalize test proves meta.seededFromSpec stamp + renderer line on a seeded standalone LLD and its absence on a plain run (ac4)
- a parity test proves resolveStageFocus composes the same framing for the standalone param bag as for define (ac1/ac2)
- full workflow + workflow-step sweep + tsc --noEmit clean

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| specScopeFitsStandalone | `t1`, `t3` |
| routeForSizeClass (triage) | `t1`, `t3` |
| finalizeStandaloneLld (orchestrator.ts) | `t2`, `t3` |
| renderLldMarkdown (lld.ts) | `t2`, `t3` |
| LldArtifact.meta.seededFromSpec | `t2`, `t3` |
| resolveStageFocus (shared, s8) | `t3` |
| composeSpecFocus (shared, s8) | `t3` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s9 contractDetails.api.specScopeFitsStandalone (seed-focus.ts)` — "The pure ac3 guard specScopeFitsStandalone(sizeClass)=routeForSizeClass(sizeClass).startStage==='design.story', landing in seed-focus.ts beside resolveStageFocus."
- **[[c2]]** `prior-artifact` `LLD s9 contractDetails.api.finalizeStandaloneLld + dataModel.seededFromSpec` — "finalizeStandaloneLld spreads seededFromSpec from intent.params.specHash; renderLldMarkdown surfaces the Seeded-from line."
- **[[c3]]** `prior-artifact` `LLD s9 contractDetails.api.routeForSizeClass (triage/classify.ts)` — "The existing triage route table (epic->define, feature/small->design.story) the guard compares against."
- **[[c4]]** `prior-artifact` `LLD s9 contractDetails.api.specScopeFitsStandalone.SizeClass (triage/types.ts)` — "SizeClass / SIZE_CLASSES — the size vocabulary the guard is total over."
- **[[c5]]** `prior-artifact` `LLD s9 testStrategy.unit` — "Unit proof: the guard table (ac3), the finalize provenance stamp + renderer (ac4), and the standalone resolveStageFocus parity (ac1/ac2)."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — plan (plan)

**0 HIGH · 0 MED · 6 LOW** · model `client` · reviewed 2026-08-02T13:18:14.024Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| t1 | citation | LOW | manual | seed-focus.ts exists (s8) — the module t1 adds specScopeFitsStandalone into, exporting resolveStageFocus. | CONFIRMED: src/workflow/seed-focus.ts:73 export function resolveStageFocus — the module exists (s8); t1 adds specScopeFitsStandalone alongside it. | none — verified sound. |
| t1 | citation | LOW | manual | routeForSizeClass + SizeClass are importable from triage/classify.ts + triage/types.ts, and routeForSizeClass returns startStage 'design.story' for feature/small (the guard's basis). | CONFIRMED: classify.ts:29 routeForSizeClass, types.ts:16 SizeClass = 'epic'\|'feature'\|'small'\|'trivial', classify.ts:36/39 feature/small -> startStage 'design.story' — the guard's route table + vocabulary. | none — verified sound. |
| t2 | citation | LOW | manual | finalizeStandaloneLld is at orchestrator.ts:1629 (where t2 spreads seededFromSpec into the LLD meta) and finalizeDefine's stamp pattern is nearby. | CONFIRMED (read found): src/workflow/orchestrator.ts:1629 function finalizeStandaloneLld — where t2 spreads seededFromSpec into the standalone LLD meta. | none — verified sound. |
| t2 | citation | LOW | manual | renderLldMarkdown is at artifacts/lld.ts:220 (where t2 adds the Seeded-from header line). | CONFIRMED (read found): src/workflow/artifacts/lld.ts:220 export function renderLldMarkdown — where t2 adds the Seeded-from header line. | none — verified sound. |
| t2 | semantic | LOW | manual | ArtifactMetaBase.seededFromSpec already exists (types.ts) so t2 writes it without a type change. | CONFIRMED: seededFromSpec?: string is read by src/workflow/__tests__/seed-focus.test.ts:157/167 and the field is on ArtifactMetaBase (types.ts:347, added s8) — t2 writes it with no type change. | none — verified sound. |
| t3 | citation | LOW | manual | The s8 seed-focus.test.ts fixture pattern (specArtifactPaths + writeAtomic + approveArtifactByJsonPath + resolveStageFocus) exists for t3 to reuse. | CONFIRMED: src/workflow/__tests__/seed-focus.test.ts exists (authored in s8) and uses the specArtifactPaths + writeAtomic + approveArtifactByJsonPath + resolveStageFocus fixtures t3 reuses. The grep returned 50 docs+src matches; the file + helpers are present. | none — verified sound. |
