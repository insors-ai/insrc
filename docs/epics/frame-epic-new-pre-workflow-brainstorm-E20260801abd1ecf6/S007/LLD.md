<!-- insrc:artifact LLD-abd1ecf6a5f5063e-s7 -->

# LLD: E20260802abd1ecf6:S007

**Epic:** `frame-epic-new-pre-workflow-brainstorm`
**HLD base run:** `wf-1785587820064-46kctq`
**HLD effective hash:** `688a10691972...`

## HLD context

**Framework:** Brainstorm ships as a first-class workflow stage (alternative a1): a peer runner directory src/workflow/runners/brainstorm/ that self-registers through the existing executor registry and workflow/index.ts registerWorkflowRunners; a new persisted SpecArtifact peer file in src/workflow/artifacts/ with a specArtifactPaths peer in storage.ts (hash-addressed, listed, approval-stamped identically to DEF/HLD/LLD/PLAN); and an additive elicitation phase on the existing insrc_workflow_step MCP surface that reuses state-store.ts and the questions-gate primitive and preserves the opaque state token verbatim. The single cross-cutting SpecArtifact shape (intent, scope boundary, non-goals, decisions-with-ruled-out-alternatives, open items) is read unchanged by both define (s8) and standalone design.story (s9). Nothing touches the shared/chat-agent brainstorm.addIdea stub.
**Rollout phase:** Phase C — Persist + review/approve the spec
**Owns:** `sc4` (Approved-spec-as-focus consumption contract)
**Consumes:** `sc1` (SpecArtifact record + hash-addressed persistence)

## Contract details

**Surface level:** internal-shared

### `readSpecArtifact`

```typescript
function readSpecArtifact(repoPath: string, specHash: string): SpecArtifact
```

**Parameters:**
- `repoPath: string` — Registered repo root; resolves the on-disk artifact location.
- `specHash: string` — The SpecArtifact identity (meta.specHash, 16-hex) minted by the brainstorm stage in s6.

**Returns:** `SpecArtifact` — The parsed s6 SpecArtifact record (approved or not); mirrors readDefineArtifact/readHldArtifact.

**Errors:**
- `SpecArtifactNotFoundError` when No JSON exists at specArtifactPaths(repoPath, specHash).json.
- `Error` when The JSON is present but its body fails isSpecBody (corrupt/incompatible record).

**Preconditions:**
- repoPath is a registered repo

**Postconditions:**
- Returns the record without mutating disk

### `requireApprovedSpec`

```typescript
function requireApprovedSpec(repoPath: string, specHash: string): SpecArtifact
```

**Parameters:**
- `repoPath: string` — Registered repo root.
- `specHash: string` — The SpecArtifact identity to resolve as an approved seed.

**Returns:** `SpecArtifact` — The SpecArtifact ONLY when meta.approvedAt is a non-empty string; otherwise it throws. Mirrors requireApprovedEpic/Hld/Lld/Plan.

**Errors:**
- `SpecNotApprovedError` when meta.approvedAt is unset/empty — a distinct named error whose message names the SPEC id and states approval is still outstanding, so the caller relays it to the user (ac4).
- `SpecArtifactNotFoundError` when The spec JSON does not exist (propagated from readSpecArtifact).

**Preconditions:**
- The spec has been persisted by the brainstorm stage (s6)

**Postconditions:**
- A returned value is guaranteed approved (meta.approvedAt present)
- An unapproved spec is never returned as a consumable seed (k12)

### `specResolveApprovedHandler`

```typescript
'spec.resolveApproved': (params: { repo: string; specHash: string }) => { spec: SpecArtifact } | { error: string; code: 'not-approved' | 'not-found' }
```

**Parameters:**
- `repo: string` — Absolute registered repo path (daemon-side resolution; consumers never open disk, k11).
- `specHash: string` — The SpecArtifact identity to resolve.

**Returns:** `{ spec: SpecArtifact } | { error: string; code: 'not-approved' | 'not-found' }` — On success the approved SpecArtifact; otherwise a structured error carrying the outstanding-approval (or not-found) reason for the consumer to surface (ac4). Mirrors the existing 'workflow.approve' IPC shape in daemon/index.ts.

**Errors:**
- `structured-error-result` when requireApprovedSpec threw — mapped to { error, code:'not-approved' }; a missing spec maps to { error, code:'not-found' }.

**Preconditions:**
- The daemon owns all DB/disk access (k11)

**Postconditions:**
- s8/s9 obtain an approved spec ONLY through this IPC, never by reading the artifact file directly

## Data model changes

### `SpecArtifact.meta.approvedAt` — invariant-change

No schema change. meta.approvedAt already exists on ArtifactMetaBase and is stamped by the workflow-agnostic approveArtifactByJsonPath (the same gate that stamps DEF/HLD/LLD/PLAN). s7 adds the READ-SIDE invariant that a spec is consumable as a seed only when this field is present; it does not add or alter any stored field.

**Call sites:**
- `src/workflow/gates.ts`
- `src/workflow/artifacts/spec.ts`
- `src/workflow/types.ts`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc4` | implements | requireApprovedSpec + the 'spec.resolveApproved' daemon IPC ARE sc4's read-side: they accept a specHash, return the approved SpecArtifact, and refuse an unapproved one through daemon IPC (k11, k12). s7 is the HLD owner of sc4. The consuming SpecFocusInput/StageFocus wiring in define(s8)/design.story(s9) calls this resolver; s7 provides the resolver + IPC, not the per-stage focus plumbing. |
| `sc1` | consumes | Reads the s6 SpecArtifact through specArtifactPaths(repoPath, specHash).json + isSpecBody. Binds to the SHIPPED s6 shape (body.decisions[].chosen + the real BrainstormCategory union + meta.specHash identity), which supersedes this HLD's sc1 interfaceSketch (choice / spec\|architecture\|how-to-build / top-level specHash) — a read of sc1's on-disk reality, not a contract change. |

## Error paths

### Error cases

- **A downstream stage (define s8 / design.story s9) is pointed at a spec that has not been approved.** (recoverable)
  - Detection: requireApprovedSpec reads the spec JSON and sees meta.approvedAt is absent or an empty string.
  - Response: Throw SpecNotApprovedError naming the SPEC id and stating approval is still outstanding; the 'spec.resolveApproved' IPC maps it to { error, code:'not-approved' } and the consuming stage relays that to the user instead of seeding its focus.
  - User impact: The user is told the spec is not yet approved and no design work is built on an unreviewed spec (ac4, k12).
- **A specHash is resolved but no artifact exists at that identity (never persisted / wrong hash).** (recoverable)
  - Detection: readSpecArtifact finds no file at specArtifactPaths(repoPath, specHash).json.
  - Response: Throw SpecArtifactNotFoundError; the IPC maps it to { error, code:'not-found' } for the consumer to surface.
  - User impact: The user learns the referenced spec does not exist rather than getting a silent empty seed.
- **Approval is attempted on a spec whose independent review returned a block verdict, without an explicit override.** (recoverable)
  - Detection: approveArtifactByJsonPath reads meta.review and sees a block verdict while no reviewOverride was supplied.
  - Response: Approval is refused (the existing workflow-agnostic block-verdict enforcement); the blocking reason is returned in the approve result's skipped[] and relayed to the user.
  - User impact: A spec the review flagged cannot be approved silently; the user sees why and must resolve or explicitly override (ac2).
- **The spec JSON is present but its body no longer matches the SpecArtifact shape (corrupt / hand-edited).** (terminal)
  - Detection: readSpecArtifact runs isSpecBody on the parsed body and it returns false.
  - Response: Throw a plain Error describing the malformed spec record; do not return a partial artifact.
  - User impact: The consumer fails loudly on a corrupt spec rather than seeding design work from garbage.

### Edge cases

| Input | Expected |
| :--- | :--- |
| A spec that IS approved (meta.approvedAt set) AND carries a block review verdict that was explicitly overridden at approve time (reviewOverride recorded). | requireApprovedSpec returns it — approval is the gate, and the override was already recorded on the artifact; the resolver does not re-litigate the review verdict. |
| insrc_review_step is pointed at the spec's SPEC-*.md path. | The workflow-agnostic run-artifact review runs unchanged (stage = meta.workflow = 'brainstorm'), returns findings for the user to resolve, and stamps meta.review — no per-type branch (ac1). |
| A specHash whose slug-named .md was moved/renamed but the hash-named .json is intact. | Resolution is unaffected — requireApprovedSpec reads the hash-named JSON, not the slug .md; only the review step (which needs the .md) would report the md missing. |

### Invariants to preserve

- Consumers reach the SpecArtifact only through daemon IPC ('spec.resolveApproved'); the MCP/consumer layer never opens the artifact file directly. [[c15]]
- An unapproved spec is never returned as a consumable seed — approval (meta.approvedAt) is the sole gate, and approval is never auto-granted by the controller. [[c16]]
- The plain-string focus path is byte-identical — sc4 is additive; a stage given a raw focus string behaves exactly as before, unaffected by the spec-resolution path. [[c11]]

## Test strategy

**Test framework:** `node:test + node:assert/strict, run via `npx tsx --test` (the project-wide convention; no test files exist yet for gates.ts / daemon IPC, so these establish the pattern)`

### Test levels

- **unit** — Prove the sc4 read-side resolver: requireApprovedSpec returns an approved spec, throws SpecNotApprovedError on an unapproved one, and SpecArtifactNotFoundError on a missing hash; readSpecArtifact rejects a corrupt body.
  - Subjects: `requireApprovedSpec (gates.ts)`, `readSpecArtifact (gates.ts)`, `SpecNotApprovedError / SpecArtifactNotFoundError`
  - Fixtures: `a tmp repo dir with an approved SPEC-*.json (meta.approvedAt set) written via specArtifactPaths + writeAtomic`, `a peer unapproved SPEC-*.json (meta.approvedAt absent)`, `a corrupt SPEC-*.json whose body fails isSpecBody`
- **integration** — Prove the 'spec.resolveApproved' daemon IPC maps requireApprovedSpec success/throws to { spec } | { error, code } so consumers resolve through IPC (k11), and that a SPEC md flows through the workflow-agnostic review + approve seam unchanged (block refuses without override; explicit approve stamps).
  - Subjects: `daemon 'spec.resolveApproved' handler (daemon/index.ts)`, `approveArtifactByJsonPath on a SPEC-*.md (gates.ts)`, `run-artifact review stage=meta.workflow over a SPEC-*.md`
  - Fixtures: `a registered tmp repo with a persisted SPEC artifact (approved + unapproved variants)`, `a SPEC artifact whose meta.review carries a block verdict`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `integration: pointing the review at a SPEC-*.md runs the workflow-agnostic run-artifact pipeline (stage='brainstorm') and returns findings + stamps meta.review, without any per-type branch` |
| `ac2` | `integration: approveArtifactByJsonPath on a SPEC whose meta.review verdict is block, with no reviewOverride, refuses approval and surfaces the blocking reason (skipped[]); with an explicit override it approves` |
| `ac3` | `unit: a freshly persisted spec has meta.approvedAt unset and appears in listPendingApprovals — nothing auto-approves it; only an explicit approveArtifactByJsonPath call stamps approvedAt` |
| `ac4` | `unit: requireApprovedSpec on an unapproved spec throws SpecNotApprovedError naming the SPEC id + outstanding-approval message`, `integration: 'spec.resolveApproved' on an unapproved spec returns { error, code:'not-approved' } (never { spec }) so the consuming stage relays it instead of seeding` |

## Alternatives considered

### a1: Typed requireApprovedSpec gate-reader + peer daemon read-IPC — **CHOSEN**

Mirror the existing requireApproved* family: a typed requireApprovedSpec(repoPath, specHash) in gates.ts that throws a distinct SpecNotApprovedError, exposed via a new 'spec.resolveApproved' daemon IPC (k11).



### a2: Generic requireApprovedArtifact(jsonPath) + thin spec wrapper

Introduce ONE generic approved-read helper keyed on a json path and make sc4 a thin specHash->jsonPath->requireApprovedArtifact wrapper.



**Rejected because:** The DRY generic reader drops the typed SpecArtifact return + the distinct not-approved error (partial on ac4/sc4), and refactoring the existing requireApproved* family onto it is M-sized scope creep for an S story; leaving them un-refactored splits the codebase into two idioms.

### a3: Inline approval-check in each consuming stage start

No dedicated resolver — define(s8) + design.story(s9) each read the spec json and check approvedAt inline at start.



**Rejected because:** Duplicates the approval check + ac4 message across s8 and s9 (drift risk), risks a direct MCP-layer disk read (k11 hazard), and pushes s7's owned behavior into s8/s9 — violates the HLD story-boundary that sc4 is owned by s7 (scored violates on sc4).

## Citations

- **[[c1]]** `code` `src/workflow/gates.ts` — "approveArtifactByJsonPath enforces the review block-verdict + stamps/preserves meta.approvedAt; jsonPathForMd + listPendingApprovals are workflow-agnostic; the requireApproved* reader family is the te"
- **[[c2]]** `code` `src/workflow/review/run-artifact.ts` — "stage = artifact.meta.workflow — the review is artifact-type-agnostic, so a SPEC md reviews unchanged (ac1)."
- **[[c3]]** `code` `src/workflow/artifacts/spec.ts` — "The shipped s6 SpecArtifact record (SpecArtifactBody + isSpecBody) that requireApprovedSpec reads and binds to."
- **[[c4]]** `code` `src/workflow/storage.ts` — "specArtifactPaths(repoPath, specHash) -> {md,json}; the hash-addressed identity the resolver reads."
- **[[c5]]** `code` `src/daemon/index.ts` — "'workflow.approve' handler via approveWorkflowTarget — the IPC shape the new 'spec.resolveApproved' read handler mirrors (k11)."
- **[[c6]]** `step-output` `s3` — "a1 is the only shape that satisfies all four ACs + both contracts + k11/k12/k1; a2 partial on ac4/sc4, a3 violates sc4."
- **[[c11]]** `prior-artifact` `DEF-abd1ecf6a5f5063e:k1` — "The artifact is a cross-cutting contract: consumable as focus by BOTH define and standalone design.story, not specialised to either — the plain-focus path stays byte-identical."
- **[[c15]]** `prior-artifact` `DEF-abd1ecf6a5f5063e:k11` — "The MCP layer never touches LMDB or LanceDB directly; all artifact reads/writes go through daemon IPC."
- **[[c16]]** `prior-artifact` `DEF-abd1ecf6a5f5063e:k12` — "The artifact passes the independent review step and requires explicit user approval before a downstream stage consumes it; approval is never auto-granted by the controller."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 8 LOW** · model `client` · reviewed 2026-08-02T11:40:26.686Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| cl1 | citation | LOW | manual | gates.ts exports approveArtifactByJsonPath (enforces review block-verdict + stamps meta.approvedAt), jsonPathForMd, and listPendingApprovals — the workflow-agnostic approve seam requireApprovedSpec + the SPEC review/approve flow lean on. | Confirmed by direct read this session: gates.ts defines approveArtifactByJsonPath (~L391, enforces review block-verdict + stamps/preserves meta.approvedAt), jsonPathForMd (~L562), and listPendingApprovals (~L468). The grep preview surfaced docs matches first but the symbols exist in src/workflow/gates.ts. | No change needed — the workflow-agnostic approve seam exists as cited. |
| cl2 | inventory | LOW | manual | gates.ts already has the requireApproved* reader family (requireApprovedEpic/Hld/Lld/Plan) that requireApprovedSpec mirrors. | CONFIRMED by grep: src/workflow/gates.ts:146 requireApprovedEpic, :185 requireApprovedHld, :227 requireApprovedLld, :326 requireApprovedPlan — the reader family requireApprovedSpec mirrors. | No change needed. |
| cl3 | citation | LOW | manual | review/run-artifact.ts derives the review stage from meta.workflow (artifact-type-agnostic), so a SPEC md reviews through the same pipeline unchanged (ac1). | Confirmed by direct read this session: run-artifact.ts:70-71 sets `const stage = typeof artifact.meta.workflow === 'string' ? artifact.meta.workflow : 'unknown'` — artifact-type-agnostic, so a SPEC md reviews unchanged (ac1). Grep over-matched the LLD doc but the source is as cited. | No change needed. |
| cl4 | citation | LOW | manual | src/workflow/artifacts/spec.ts (shipped by s6) exports the SpecArtifact record + isSpecBody guard that requireApprovedSpec reads and binds to. | CONFIRMED by grep: src/workflow/artifacts/spec.ts:66 export type SpecArtifact = WorkflowArtifact<SpecArtifactBody>; :156 export function isSpecBody. The record requireApprovedSpec binds to exists (shipped s6). | No change needed. |
| cl5 | citation | LOW | manual | storage.ts exports specArtifactPaths(repoPath, specHash) -> {md,json}, the hash-addressed identity the resolver reads (shipped s6). | CONFIRMED by grep: src/workflow/storage.ts:214 export function specArtifactPaths(repoPath, specHash, slug?) — the hash-addressed identity the resolver reads. | No change needed. |
| cl6 | citation | LOW | manual | daemon/index.ts registers a 'workflow.approve' IPC handler (via approveWorkflowTarget) whose shape the new 'spec.resolveApproved' read handler mirrors. | Confirmed by direct read this session: daemon/index.ts:551 registers 'workflow.approve' delegating to approveWorkflowTarget (gates.ts) — the IPC shape 'spec.resolveApproved' mirrors. Grep over-matched the LLD doc but the handler exists in src/daemon/index.ts. | No change needed. |
| cl7 | semantic | LOW | manual | meta.approvedAt already exists on ArtifactMetaBase (types.ts), so the read-side approval gate needs no new stored field. | Confirmed by direct read this session: ArtifactMetaBase in src/workflow/types.ts declares `readonly approvedAt?: string` (set by the approve gate). No new stored field needed — the read-side gate is additive. | No change needed. |
| cl8 | cross-artifact | LOW | manual | The HLD assigns ownership of sc4 to s7 and sc1 to s6, so this LLD implementing sc4 + consuming sc1 matches the HLD story-boundary. | Confirmed by direct read this session of .insrc/artifacts/HLD-abd1ecf6a5f5063e.json: sc4 ownedByStory='s7' (consumedByStories s8,s9), sc1 ownedByStory='s6'. The probe's regex (\\s* on JSON) and src/-scoped read returned no match, but the ownership is as the LLD states — this LLD implements sc4 + consumes sc1 per the HLD boundary. | No change needed — cross-artifact ownership matches the HLD. |
