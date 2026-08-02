<!-- insrc:artifact PLAN-abd1ecf6a5f5063e-s8 -->

# Plan: E20260802abd1ecf6:S008

**Epic:** `frame-epic-new-pre-workflow-brainstorm`
**LLD run:** `wf-1785671718263-sylld9`
**LLD effective hash:** `688a10691972...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add src/workflow/seed-focus.ts (composeSpecFocus + resolveStageFocus) + the seededFromSpec meta field | M | — | unit: seed-focus.test.ts: resolveStageFocus approved->composed focus+seededFromSpec, plain->verbatim+unset, unapproved/missing->throws; composeSpecFocus deterministic + includes intent/scope/nonGoals/decisions (covered in t4) | [[c1]] [[c2]] [[c5]] |
| 2 | **`t2`** Stamp meta.seededFromSpec in finalizeDefine + surface it in renderDefineMarkdown | S | `t1` | unit: seed-focus.test.ts: finalizeDefine with intent.params.specHash set -> meta.seededFromSpec = hash + renderDefineMarkdown contains SPEC-<hash>; unset -> absent (covered in t4) | [[c3]] [[c5]] |
| 3 | **`t3`** Wire both define entry points to call resolveStageFocus | S | `t1` | unit: seed-focus.test.ts: the plain-focus passthrough (resolveStageFocus with no specHash returns focus verbatim) proves the wiring is byte-identical for the plain path (covered in t4) | [[c1]] [[c2]] |
| 4 | **`t4`** Unit tests for the seeding helper + provenance stamping | S | `t2`, `t3` | unit: seed-focus.test.ts: resolveStageFocus (approved/plain/unapproved/missing) + composeSpecFocus (intent/scope/every nonGoal/every decision) + finalizeDefine seededFromSpec stamp/renderer + plain-focus absence (ac1/ac2/ac3/ac4) | [[c4]] [[c3]] |

### E20260802abd1ecf6:S008:T001 — Add src/workflow/seed-focus.ts (composeSpecFocus + resolveStageFocus) + the seededFromSpec meta field

Create src/workflow/seed-focus.ts: composeSpecFocus(spec: SpecArtifact): string (deterministic framing = intent + scopeBoundary + non-goals + each decision's chosen/ruledOut/reason) and resolveStageFocus(repoPath, focus, params): { focus, seededFromSpec? } (when params.specHash is a non-empty string -> requireApprovedSpec(repoPath, specHash) [gates.ts:404] then { focus: composeSpecFocus(spec), seededFromSpec: specHash }; else { focus }). In src/workflow/types.ts add the OPTIONAL `seededFromSpec?: string` to ArtifactMetaBase (peer of specHash at :340). Imports: SpecArtifact from artifacts/spec.js, requireApprovedSpec from gates.js.

**Acceptance checks:**
- seed-focus.ts exports composeSpecFocus + resolveStageFocus with the LLD signatures
- resolveStageFocus with a non-empty params.specHash returns a composed focus + seededFromSpec; with none returns the plain focus verbatim + seededFromSpec unset
- composeSpecFocus is deterministic (same spec -> same string) and includes intent/scope/every nonGoal/every decision
- an unapproved/missing specHash propagates SpecNotApprovedError/SpecArtifactNotFoundError
- ArtifactMetaBase carries optional seededFromSpec; tsc --noEmit clean

### E20260802abd1ecf6:S008:T002 — Stamp meta.seededFromSpec in finalizeDefine + surface it in renderDefineMarkdown

In src/workflow/orchestrator.ts finalizeDefine (:817), when intent.params.specHash is a non-empty string, add seededFromSpec to the DefineArtifact meta literal (alongside epicHash/epicSlug). In src/workflow/artifacts/define.ts renderDefineMarkdown (:86), when meta.seededFromSpec is set emit a `**Seeded from:** SPEC-<hash>` line in the header so the Epic identifies its source (ac3, k7). No change to the finalizeDefineExtend branch (:911) beyond what already applies.

**Acceptance checks:**
- finalizeDefine writes meta.seededFromSpec = intent.params.specHash when present; leaves it unset otherwise (ac3/ac4)
- renderDefineMarkdown emits the seeded-from line only when meta.seededFromSpec is set
- tsc --noEmit clean

### E20260802abd1ecf6:S008:T003 — Wire both define entry points to call resolveStageFocus

In src/mcp/workflow-step/phases/start.ts (:62) and src/daemon/workflow-rpc.ts (:414), call resolveStageFocus(repoPath, focus, params) just before building the WorkflowIntent and use its returned focus as intent.focus (params, which already carries specHash, is unchanged so finalizeDefine can read it). No change to the define step prompts. Preserve the plain-focus path exactly (call is a passthrough when no specHash).

**Acceptance checks:**
- both start.ts and workflow-rpc.ts build intent.focus from resolveStageFocus(...).focus
- a plain-focus start is byte-identical (no specHash -> focus unchanged) (ac4)
- tsc --noEmit clean

### E20260802abd1ecf6:S008:T004 — Unit tests for the seeding helper + provenance stamping

Add src/workflow/__tests__/seed-focus.test.ts (node:test + assert/strict, reusing the s6/s7 tmp-repo + specArtifactPaths + writeAtomic + approveArtifactByJsonPath fixtures): resolveStageFocus approved-spec -> composed focus contains intent/scope/each nonGoal/each decision + seededFromSpec set (ac1/ac2); plain focus -> verbatim + seededFromSpec unset (ac4); unapproved/missing -> throws the sc4 errors. Add a finalizeDefine test (or extend an existing one): intent.params.specHash set -> meta.seededFromSpec = hash + renderDefineMarkdown output contains SPEC-<hash>; unset -> absent (ac3/ac4).

**Acceptance checks:**
- seed-focus.test.ts covers approved/plain/unapproved/missing + composeSpecFocus decision+nonGoal inclusion (ac1/ac2/ac4)
- a finalize test proves meta.seededFromSpec stamp + renderer line (ac3) and its absence on a plain-focus run (ac4)
- full workflow + workflow-step + daemon sweep + tsc --noEmit clean

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| resolveStageFocus (shared seeding helper) | `t1`, `t4` |
| composeSpecFocus | `t1`, `t4` |
| requireApprovedSpec (sc4, s7) | `t1`, `t4` |
| finalizeDefine (orchestrator.ts) | `t2`, `t4` |
| renderDefineMarkdown (define.ts) | `t2`, `t4` |
| ArtifactMetaBase.seededFromSpec (types.ts) | `t1`, `t4` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s8 contractDetails.api.resolveStageFocus + start.ts seam` — "The shared seeding helper + the controller-driven entry point (start.ts:62) that calls it before building the WorkflowIntent."
- **[[c2]]** `prior-artifact` `LLD s8 contractDetails.api.composeSpecFocus + workflow-rpc.ts seam` — "composeSpecFocus renders the spec body into the framing focus; the daemon-driven entry point (workflow-rpc.ts:414) calls resolveStageFocus."
- **[[c3]]** `prior-artifact` `LLD s8 contractDetails.api.finalizeDefine + renderDefineMarkdown` — "finalizeDefine stamps meta.seededFromSpec from intent.params.specHash; renderDefineMarkdown surfaces it (ac3)."
- **[[c4]]** `prior-artifact` `LLD s8 testStrategy.unit` — "Unit proof of the helper + provenance: approved/plain/unapproved/missing + composeSpecFocus inclusion + finalize stamp/renderer."
- **[[c5]]** `prior-artifact` `LLD s8 dataModelChanges.ArtifactMetaBase.seededFromSpec` — "The additive optional seededFromSpec field on ArtifactMetaBase (peer to specHash/epicHash)."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — plan (plan)

**0 HIGH · 0 MED · 7 LOW** · model `client` · reviewed 2026-08-02T12:07:34.543Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| t1 | citation | LOW | manual | requireApprovedSpec exists in gates.ts (the s7 sc4 reader t1's resolveStageFocus imports + consumes). | CONFIRMED: src/workflow/gates.ts:404 export function requireApprovedSpec(repoPath, specHash): SpecArtifact. | none — verified sound. |
| t1 | citation | LOW | manual | SpecArtifact + isSpecBody exist in artifacts/spec.ts (composeSpecFocus reads the spec body). | CONFIRMED: src/workflow/artifacts/spec.ts:66 SpecArtifact + :156 isSpecBody — the record composeSpecFocus reads. | none — verified sound. |
| t2 | citation | LOW | manual | finalizeDefine is at orchestrator.ts:817 (t2 stamps meta.seededFromSpec there); finalizeDefineExtend is the separate extend branch. | CONFIRMED: src/workflow/orchestrator.ts:817 finalizeDefine + :911 finalizeDefineExtend (separate extend branch) — t2 stamps meta at :817. | none — verified sound. |
| t2 | citation | LOW | manual | renderDefineMarkdown is in artifacts/define.ts (t2 adds the Seeded-from header line). | CONFIRMED: src/workflow/artifacts/define.ts:86 export function renderDefineMarkdown — t2 adds the Seeded-from header line here. | none — verified sound. |
| t3 | citation | LOW | manual | Both define entry points build the WorkflowIntent (start.ts:62 + workflow-rpc.ts:414) — the two sites t3 wires to call resolveStageFocus. | CONFIRMED: src/daemon/workflow-rpc.ts:414 + src/mcp/workflow-step/phases/start.ts:62 both build `const intent: WorkflowIntent =` — the two sites t3 wires. | none — verified sound. |
| t1 | semantic | LOW | manual | ArtifactMetaBase is in types.ts (t1 adds the optional seededFromSpec field, peer to specHash). | CONFIRMED: src/workflow/types.ts:288 interface ArtifactMetaBase; the specHash? optional field peer confirmed at types.ts:340 earlier this session — seededFromSpec is added as its peer. | none — verified sound. |
| t4 | citation | LOW | manual | The s6/s7 tmp-repo fixture pattern (specArtifactPaths + writeAtomic + approveArtifactByJsonPath) exists in src/workflow/__tests__/ for t4 to reuse. | CONFIRMED: src/workflow/__tests__/spec-resolver.test.ts exists (authored in s7) and uses the specArtifactPaths + writeAtomic + approveArtifactByJsonPath tmp-repo fixture pattern t4 reuses. The grep returned 50 docs+src matches; the file + helpers are present. | none — verified sound. |
