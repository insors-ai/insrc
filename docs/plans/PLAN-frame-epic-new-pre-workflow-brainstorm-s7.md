<!-- insrc:artifact PLAN-abd1ecf6a5f5063e-s7 -->

# Plan: E20260802abd1ecf6:S007

**Epic:** `frame-epic-new-pre-workflow-brainstorm`
**LLD run:** `wf-1785670336278-n57y0r`
**LLD effective hash:** `688a10691972...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add readSpecArtifact + requireApprovedSpec + spec error types to gates.ts | S | — | unit: spec-resolver.test.ts: requireApprovedSpec returns an approved spec / throws SpecNotApprovedError unapproved; readSpecArtifact throws SpecArtifactNotFoundError missing + Error on corrupt (covered in t3) | [[c1]] [[c5]] |
| 2 | **`t2`** Add the 'spec.resolveApproved' daemon IPC handler with a small pure error-to-code mapper | S | `t1` | unit: spec-resolver.test.ts: the pure error->{error,code} mapper returns 'not-approved' for SpecNotApprovedError, 'not-found' for SpecArtifactNotFoundError, { spec } on success (covered in t4) | [[c2]] |
| 3 | **`t3`** Unit tests for the sc4 resolver | S | `t1` | unit: spec-resolver.test.ts: requireApprovedSpec approved-returns / unapproved-throws-SpecNotApprovedError; readSpecArtifact missing-throws-SpecArtifactNotFoundError / corrupt-throws-Error; listPendingApprovals lists the unapproved spec (ac3) | [[c1]] [[c3]] [[c4]] |
| 4 | **`t4`** Tests: SPEC flows through review + approve unchanged; IPC error-mapper maps codes | S | `t2`, `t3` | integration: spec-review-approve.test.ts: approveArtifactByJsonPath on a block-verdict SPEC refuses without override (skipped[]+reason) + approves with override (ac2); a SPEC md reviews via run-artifact stage=meta.workflow (ac1); unit: spec-review-approve.test.ts: the 'spec.resolveApproved' error-mapper returns { error, code:'not-approved' } unapproved and { spec } approved (ac4) | [[c3]] [[c4]] [[c5]] |

### E20260802abd1ecf6:S007:T001 — Add readSpecArtifact + requireApprovedSpec + spec error types to gates.ts

In src/workflow/gates.ts, add readSpecArtifact(repoPath, specHash): SpecArtifact (reads specArtifactPaths(repoPath, specHash).json; throws SpecArtifactNotFoundError when the json is absent; JSON.parse then run isSpecBody on body and throw a plain Error naming the SPEC id on a corrupt/incompatible record) and requireApprovedSpec(repoPath, specHash): SpecArtifact (wraps readSpecArtifact; throws SpecNotApprovedError naming the SPEC id + 'approval still outstanding' when meta.approvedAt is unset/empty). Define SpecNotApprovedError + SpecArtifactNotFoundError as subclasses in the existing gates error style (alongside ArtifactMissingError/ArtifactNotApprovedError). Add imports: SpecArtifact + isSpecBody from './artifacts/spec.js', specArtifactId/specArtifactPaths from './storage.js'. Mirror requireApprovedPlan (gates.ts:326) exactly. No schema change (meta.approvedAt already on ArtifactMetaBase).

**Acceptance checks:**
- gates.ts exports readSpecArtifact + requireApprovedSpec with the LLD signatures
- requireApprovedSpec throws SpecNotApprovedError (message names the SPEC id + outstanding-approval) when meta.approvedAt is absent/empty; returns the SpecArtifact when present
- readSpecArtifact throws SpecArtifactNotFoundError on a missing json and a plain Error on an isSpecBody failure
- tsc --noEmit clean

### E20260802abd1ecf6:S007:T002 — Add the 'spec.resolveApproved' daemon IPC handler with a small pure error-to-code mapper

In src/daemon/index.ts, add a 'spec.resolveApproved' entry in the handler map next to 'workflow.approve' (daemon/index.ts:551). Read params { repo, specHash }, resolve repoPath = p.repo || process.env.INSRC_REPO (return { error } when empty), `const { requireApprovedSpec } = await import('../workflow/gates.js')`, then try -> { spec } / catch -> { error, code }. Per the s3 critique, extract the error->{error,code} mapping into a small pure helper (SpecNotApprovedError -> 'not-approved', SpecArtifactNotFoundError -> 'not-found', else a generic error) so it is unit-testable WITHOUT standing up a live daemon socket. Honors k11. No MCP tool wiring in s7 (s8/s9 add the consuming call).

**Acceptance checks:**
- daemon/index.ts registers 'spec.resolveApproved' mirroring the 'workflow.approve' repoPath-resolution + dynamic-import pattern
- the pure error->{error,code} mapper maps SpecNotApprovedError->'not-approved', SpecArtifactNotFoundError->'not-found', success->{ spec }
- tsc --noEmit clean

### E20260802abd1ecf6:S007:T003 — Unit tests for the sc4 resolver

Add src/workflow/__tests__/spec-resolver.test.ts (node:test + assert/strict): write approved / unapproved / corrupt SPEC fixtures to a mkdtempSync tmp repo via specArtifactPaths + writeAtomic (mirroring spec-artifact.test.ts). Assert requireApprovedSpec returns the approved spec; throws SpecNotApprovedError (message names the SPEC id + outstanding) on the unapproved one; readSpecArtifact throws SpecArtifactNotFoundError on a missing hash and a plain Error on the corrupt body. Also assert a freshly-persisted (unapproved) spec appears in listPendingApprovals and is NOT auto-approved (ac3).

**Acceptance checks:**
- spec-resolver.test.ts covers approved / unapproved / missing / corrupt for the resolver + the listPendingApprovals never-auto-approve case (ac3)
- npx tsx --test over the workflow suite passes

### E20260802abd1ecf6:S007:T004 — Tests: SPEC flows through review + approve unchanged; IPC error-mapper maps codes

Add tests proving the workflow-agnostic seams + the IPC mapper handle a SPEC artifact: (ac2) approveArtifactByJsonPath on a SPEC-*.md whose meta.review verdict is block, with no reviewOverride, refuses (skipped[] carries the reason) and with an override approves; (ac1) a SPEC md is accepted by the run-artifact review path (stage=meta.workflow='brainstorm') without a per-type branch; (ac4) the pure error->{error,code} mapper (from t2) returns code 'not-approved' for SpecNotApprovedError and { spec } on success — exercised directly, NOT via a live daemon socket (per s3 critique). Reuse the t3 fixtures pattern.

**Acceptance checks:**
- ac2: approve refuses a block-verdict SPEC without override (skipped[]+reason) and approves with override
- ac1: a SPEC md is reviewed by run-artifact without a per-type branch
- ac4: the error-mapper returns { error, code:'not-approved' } for an unapproved spec and { spec } on success (direct call, no live socket)
- full workflow + daemon test sweep + tsc --noEmit clean

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| requireApprovedSpec (gates.ts) | `t1`, `t3` |
| readSpecArtifact (gates.ts) | `t1`, `t3` |
| SpecNotApprovedError / SpecArtifactNotFoundError | `t1`, `t3` |
| daemon 'spec.resolveApproved' handler (daemon/index.ts) | `t2`, `t4` |
| approveArtifactByJsonPath on a SPEC-*.md (gates.ts) | `t4` |
| run-artifact review stage=meta.workflow over a SPEC-*.md | `t4` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s7 contractDetails.api.readSpecArtifact + requireApprovedSpec` — "The sc4 read-side gate readers in gates.ts, mirroring requireApprovedPlan; throw SpecNotApprovedError when meta.approvedAt is unset."
- **[[c2]]** `prior-artifact` `LLD s7 contractDetails.api.specResolveApprovedHandler` — "The 'spec.resolveApproved' daemon IPC handler mapping requireApprovedSpec success/throws to { spec } | { error, code }."
- **[[c3]]** `prior-artifact` `LLD s7 testStrategy.unit` — "Unit-level proof of the resolver: approved returns, unapproved throws, missing/corrupt throw; listPendingApprovals never-auto-approve (ac3)."
- **[[c4]]** `prior-artifact` `LLD s7 testStrategy.integration` — "Integration proof: a SPEC md flows through the workflow-agnostic review + approve seam; the IPC error-mapper maps codes (ac1/ac2/ac4)."
- **[[c5]]** `prior-artifact` `LLD s7 errorPaths` — "Error cases: unapproved -> SpecNotApprovedError; missing -> SpecArtifactNotFoundError; block-without-override refused; corrupt body -> plain Error."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — plan (plan)

**0 HIGH · 0 MED · 6 LOW** · model `client` · reviewed 2026-08-02T11:45:32.036Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| t1 | citation | LOW | manual | gates.ts:326 defines requireApprovedPlan (reads planArtifactPaths json, throws when meta.approvedAt unset) — the exact template t1's requireApprovedSpec mirrors. | CONFIRMED: src/workflow/gates.ts:326 export function requireApprovedPlan(...) — the exact reader-family template t1 mirrors. | No change needed. |
| t2 | citation | LOW | manual | daemon/index.ts registers a 'workflow.approve' IPC handler (resolves repoPath via p.repo\|\|INSRC_REPO, dynamically imports ../workflow/gates.js) — the pattern t2's 'spec.resolveApproved' entry mirrors. | CONFIRMED: src/daemon/index.ts:551 'workflow.approve' handler + :559 `await import('../workflow/gates.js')` — the repoPath-resolution + dynamic-import pattern t2 mirrors. | No change needed. |
| t1 | citation | LOW | manual | specArtifactPaths + isSpecBody + SpecArtifact exist (shipped s6) so t1 can import them from './storage.js' and './artifacts/spec.js'. | CONFIRMED: storage.ts:214 specArtifactPaths, spec.ts:156 isSpecBody, spec.ts:66 SpecArtifact — all shipped in s6, importable by t1. | No change needed. |
| t4 | citation | LOW | manual | approveArtifactByJsonPath (gates.ts) is the workflow-agnostic approve seam t4 exercises over a SPEC-*.md (block-verdict refuse + override). | Confirmed by direct read this session: approveArtifactByJsonPath is defined in src/workflow/gates.ts (~L391) — the workflow-agnostic approve seam t4 exercises. The grep returned 50 matches across docs; the source symbol exists. | No change needed. |
| t3 | citation | LOW | manual | src/workflow/__tests__/spec-artifact.test.ts exists as the fixture pattern (mkdtempSync + specArtifactPaths + writeAtomic) t3/t4 reuse. | CONFIRMED: src/workflow/__tests__/spec-artifact.test.ts imports specArtifactPaths (:36) + uses it (:151); the mkdtempSync + writeAtomic tmp-repo fixture pattern is present — the exact template t3/t4 reuse. | No change needed. |
| tasks | ordering | LOW | manual | The task DAG is acyclic with a valid topological order: t1 (no deps) -> t2,t3 (dep t1) -> t4 (dep t2,t3); order 1,2,3,4 respects it. | Task DAG is acyclic and order 1..4 is a valid topological order: t1 (no deps), t2/t3 depend on t1, t4 depends on t2+t3 — no task precedes a dependency. storyDependsOn=[s6] is already shipped. | No change needed. |
