<!-- insrc:artifact LLD-abd1ecf6a5f5063e-s6 -->

# LLD: E20260802abd1ecf6:S006

**Epic:** `frame-epic-new-pre-workflow-brainstorm`
**HLD base run:** `wf-1785587820064-46kctq`
**HLD effective hash:** `688a10691972...`

## HLD context

**Framework:** Brainstorm ships as a first-class workflow stage (alternative a1): a peer runner directory src/workflow/runners/brainstorm/ that self-registers through the existing executor registry and workflow/index.ts registerWorkflowRunners; a new persisted SpecArtifact peer file in src/workflow/artifacts/ with a specArtifactPaths peer in storage.ts (hash-addressed, listed, approval-stamped identically to DEF/HLD/LLD/PLAN); and an additive elicitation phase on the existing insrc_workflow_step MCP surface that reuses state-store.ts and the questions-gate primitive and preserves the opaque state token verbatim. The single cross-cutting SpecArtifact shape (intent, scope boundary, non-goals, decisions-with-ruled-out-alternatives, open items) is read unchanged by both define (s8) and standalone design.story (s9). Nothing touches the shared/chat-agent brainstorm.addIdea stub.
**Rollout phase:** Phase C — Persist + review/approve the spec
**Owns:** `sc1` (SpecArtifact record + hash-addressed persistence)

## Contract details

**Surface level:** internal-shared

### `SpecArtifact`

```typescript
interface SpecArtifactBody { readonly category: BrainstormCategory; readonly intent: string; readonly scopeBoundary: string; readonly nonGoals: readonly string[]; readonly decisions: readonly SpecDecision[]; readonly openItems: readonly string[] }
interface SpecDecision { readonly chosen: string; readonly ruledOut: readonly string[]; readonly reason: string }
type SpecArtifact = WorkflowArtifact<SpecArtifactBody> & { readonly kind: 'spec'; readonly specHash: string }
```

**Returns:** `SpecArtifact` — The durable, structured spec record both downstream stages read (sc1). Declared in a new src/workflow/artifacts/spec.ts peer of define.ts/plan.ts, using the shared WorkflowArtifact<Body> envelope + ArtifactMetaBase (createdAt, optional approvedAt/review + model attribution). category reuses the REAL BrainstormCategory union; SpecDecision uses `chosen` (matching the s4 elicit field).

**Preconditions:**
- Constructed only from a confirmed converged elicit output (s3/s4).

**Postconditions:**
- kind is 'spec'; meta.approvedAt is unset at creation (set only by s7's approve gate, k12).

### `renderSpecMarkdown`

```typescript
function renderSpecMarkdown(artifact: SpecArtifact): string
```

**Parameters:**
- `artifact: SpecArtifact` — The record to render to the human-facing markdown.

**Returns:** `string` — Markdown that reads as a structured statement of the request — Intent / Scope boundary / Non-goals / Decisions (each with ruled-out alternatives + reason) / Open items sections — headed by artifactIdMarker(specArtifactId(...)) for lookup. Not a transcript (ac2). Peer of define.ts's renderer.

**Postconditions:**
- Contains the artifactId marker and one section per SpecArtifactBody field.

### `specArtifactId`

```typescript
function specArtifactId(specHash: string): string
```

**Parameters:**
- `specHash: string` — The deterministic hash id of the converged spec.

**Returns:** `string` — The stable artifact id `SPEC-<specHash>` (peer of defineArtifactId/planArtifactId), used for the json filename + the md marker.

### `specArtifactPaths`

```typescript
function specArtifactPaths(repoPath: string, specHash: string): { readonly md: string; readonly json: string }
```

**Parameters:**
- `repoPath: string` — The registered repo root.
- `specHash: string` — The deterministic spec hash id.

**Returns:** `{ md: string; json: string }` — The two on-disk paths (sc1): json under the shared ARTIFACTS_DIR ('.insrc/artifacts/SPEC-<hash>.json') so it is listed identically to DEF/HLD/LLD/PLAN, and md under a new SPECS_DIR. Direct peer of defineArtifactPaths/planArtifactPaths.

**Preconditions:**
- repoPath is a registered repo.

**Postconditions:**
- Both paths are absolute; json sits under ARTIFACTS_DIR (ac3).

### `finalizeBrainstorm`

```typescript
// orchestrator.ts finalizeArtifact case 'brainstorm'
function finalizeBrainstorm(intent: WorkflowIntent, stepOutputs: Readonly<Record<string, unknown>>, runId: string, elapsedMs: number, llmResponse: unknown, model: string, attribution: ArtifactModelAttribution): FinalizeResult
```

**Parameters:**
- `llmResponse: unknown` — The brainstormSynthesizer output structuring the converged elicit result into a SpecArtifactBody.

**Returns:** `FinalizeResult` — Validates the SpecArtifactBody, computes specHash, builds the SpecArtifact (meta.createdAt + model attribution, approvedAt unset), and writes {md,json} via specArtifactPaths + writeAtomic — mirroring finalizeDefine/finalizePlan. Replaces the current brainstorm 'not yet supported' throw in finalizeArtifact; the paired brainstormSynthesizer replaces the throw in prepareSynthesize.

**Errors:**
- `validation error` when The synthesized body is missing a required SpecArtifactBody field or malformed — finalize rejects (retryable) rather than persisting a partial spec.

**Preconditions:**
- The brainstorm run reached synthesize with a confirmed converged elicit output.

**Postconditions:**
- Exactly one SpecArtifact json+md is written atomically; nothing consumer-specific (ac4); no LMDB/Lance access (k11).

## Data model changes

### `SpecArtifact (+ SpecArtifactBody, SpecDecision)` — new

New record family in src/workflow/artifacts/spec.ts mirroring define.ts/plan.ts: SpecArtifactBody { category: BrainstormCategory, intent, scopeBoundary, nonGoals[], decisions: SpecDecision[], openItems[] }, SpecDecision { chosen, ruledOut[], reason }, SpecArtifact = WorkflowArtifact<SpecArtifactBody> with kind 'spec' + specHash + shared meta. Plus renderSpecMarkdown. This is sc1's record; the field set is the contract, the on-disk/render details are internal to s6.

```

```

**Call sites:**
- `src/workflow/artifacts/define.ts`
- `src/workflow/types.ts`
- `src/shared/brainstorm-classes.ts`

### `specArtifactId / specArtifactPaths / specMdRel / SPECS_DIR` — new

New storage peers in src/workflow/storage.ts mirroring defineArtifactId/defineArtifactPaths/defineMdRel: a SPECS_DIR const (docs dir for the md), specArtifactId(specHash)='SPEC-<hash>', specArtifactPaths(repoPath, specHash) -> { md under SPECS_DIR, json under ARTIFACTS_DIR }, specMdRel(specHash). Hash-addressed + written via the existing writeAtomic (k6/k7).

```

```

**Call sites:**
- `src/workflow/storage.ts`

### `brainstorm synthesize/finalize wiring` — invariant-change

orchestrator.ts prepareSynthesize + finalizeArtifact currently THROW 'not yet supported' for workflow 'brainstorm'. s6 replaces both arms: a brainstormSynthesizer structures the converged elicit output (s3/s4) into a SpecArtifactBody, and finalizeBrainstorm persists the SpecArtifact. The brainstorm workflow now yields an artifact end-to-end. No change to the other workflows' arms.

```
- prepareSynthesize: case 'brainstorm' -> throw 'not yet supported'
+ prepareSynthesize: case 'brainstorm' -> brainstormSynthesizer(intent, stepOutputs)
- finalizeArtifact:   case 'brainstorm' -> throw 'not yet supported'
+ finalizeArtifact:   case 'brainstorm' -> finalizeBrainstorm(...)
```

**Call sites:**
- `src/workflow/orchestrator.ts`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | implements | s6 OWNS sc1 (HLD ownedByStory=s6): it defines the SpecArtifact record + renderSpecMarkdown (artifacts/spec.ts) and the specArtifactId/specArtifactPaths/specMdRel storage peers (storage.ts), and wires the brainstorm synthesize/finalize to produce+persist exactly one SpecArtifact — hash-addressed under ARTIFACTS_DIR, markdown under SPECS_DIR, written via writeAtomic, listed + approval-stamped identically to DEF/HLD/LLD/PLAN (k1/k6/k7). meta.approvedAt is left unset for s7's approve gate (sc4). |

## Error paths

### Error cases

- **The brainstormSynthesizer emits a body missing a required SpecArtifactBody field (e.g. no scopeBoundary), or a decisions entry missing chosen/ruledOut/reason.** (recoverable)
  - Detection: finalizeBrainstorm validates the synthesized body against the SpecArtifactBody shape (the same validate-before-write discipline finalizeDefine/finalizePlan use) before constructing the SpecArtifact.
  - Response: finalize returns a retryable error and writes NOTHING (validation precedes writeAtomic); the synth turn is re-issued rather than persisting a partial spec.
  - User impact: No half-formed spec ever lands on disk; the run either produces a complete structured spec or none.
- **The synthesizer collapses the whole request into intent and leaves scopeBoundary empty (or vice-versa) — an under-structured statement that would read like a transcript.** (recoverable)
  - Detection: renderSpecMarkdown + the shape validation require both intent and scopeBoundary to be non-empty strings; an empty scopeBoundary fails validation before persistence.
  - Response: Rejected as a validation error (retryable); the synthesizer prompt requires the converged statement be split into distinct intent + scope boundary.
  - User impact: The recorded spec always reads as a structured statement (ac2), not a single blob.
- **A writeAtomic partial-failure (e.g. the md write succeeds but the json write is interrupted), risking a spec listed without its canonical record or vice-versa.** (recoverable)
  - Detection: writeAtomic writes to <path>.tmp then renames; finalize writes json + md through it and surfaces any thrown fs error. A crash between the two leaves at most a completed file and a stale .tmp, never a torn file.
  - Response: The fs error propagates out of finalize (the run errors); because each file is written tmp-then-rename, no partially-written artifact is readable, and re-running finalize with the same specHash overwrites idempotently.
  - User impact: A reader never sees a torn spec; at worst the run is retried and the same hash-addressed pair is rewritten.
- **finalizeBrainstorm is reached but the run never actually confirmed (a caller drives synthesize on an unconfirmed elicit output).** (recoverable)
  - Detection: The converged elicit output carries confirmed:true only after the s3 gate; the synthesizer input is the finalized step output, which the executor only advances past on a confirmed resume. An unconfirmed output would not have reached synthesize.
  - Response: Structurally unreachable via the normal executor path; if forced, the missing/short converged fields fail the same body validation.
  - User impact: Only a user-confirmed converged statement is ever persisted as a spec (k12 lineage; abandonment persists nothing).

### Edge cases

| Input | Expected |
| :--- | :--- |
| A fork-free convergence: decisions:[] and nonGoals:[] (the user's idea had a single obvious scope). | A valid SpecArtifact with empty decisions/nonGoals arrays; renderSpecMarkdown emits the sections as empty (e.g. '_none_'), still a complete structured spec (ac2). |
| Two different converged specs produced in the same repo (two brainstorm runs). | Each gets its own specHash -> distinct SPEC-<hash>.json under ARTIFACTS_DIR + md under SPECS_DIR; both are listed alongside the other artifacts, neither overwrites the other (ac1/ac3). |
| The identical converged body is finalized twice (deterministic content). | specHash is deterministic over the body, so the same SPEC-<hash> pair is produced and writeAtomic overwrites idempotently — reading back returns identical content (ac1). |
| openItems is non-empty on the confirmed spec (the user confirmed intent but left some questions open). | The open items are recorded in the SpecArtifactBody.openItems section — a valid spec (a confirmed statement may still carry open items; that is orthogonal to convergence). |

### Invariants to preserve

- The SpecArtifact json lands under the SAME ARTIFACTS_DIR as DEF/HLD/LLD/PLAN and is written via the existing writeAtomic tmp-then-rename path — s6 adds no parallel persistence path and the MCP layer never opens LMDB/Lance (k6/k7/k11). [[c5]]
- The other workflows' prepareSynthesize/finalizeArtifact arms (stub/define/design.epic/design.story/plan) are unchanged; s6 only replaces the brainstorm 'not yet supported' throws. [[c7]]

## Test strategy

**Test framework:** `node:test + node:assert/strict via `npx tsx --test`, matching the existing src/workflow/**/__tests__/ artifact + storage suites`

### Test levels

- **unit** — Prove the SpecArtifact record + renderSpecMarkdown produce a structured statement (ac2) with the sc1 field set.
  - Subjects: `renderSpecMarkdown emits Intent / Scope boundary / Non-goals / Decisions (each with ruledOut + reason) / Open items sections and the artifactIdMarker(specArtifactId(...)) header — not a conversation transcript`, `the SpecArtifactBody carries category (a real BrainstormCategory id) + intent + scopeBoundary + nonGoals[] + decisions[{chosen,ruledOut,reason}] + openItems[]`, `a fork-free body (decisions:[]/nonGoals:[]) renders valid markdown with empty sections`
  - Fixtures: `a hand-built SpecArtifact fixture`
- **unit** — Prove specArtifactPaths/specArtifactId hash-address the spec under the shared artifact surface (ac1/ac3).
  - Subjects: `specArtifactId(specHash) === 'SPEC-<specHash>'`, `specArtifactPaths(repoPath, specHash).json is under ARTIFACTS_DIR ('.insrc/artifacts') so it is listed identically to DEF/HLD/LLD/PLAN, and .md is under SPECS_DIR; both absolute`, `the same specHash yields the same paths (stable identifier)`
  - Fixtures: `a temp repoPath`
- **unit** — Prove durable round-trip: a written SpecArtifact reads back identical (ac1).
  - Subjects: `writing the SpecArtifact json via writeAtomic to specArtifactPaths(...).json and reading it back parses to a deep-equal record`, `writing the same body twice (deterministic specHash) overwrites idempotently and reads back identical content`
  - Fixtures: `a temp repo dir`, `writeAtomic + fs read`
- **integration** — Prove the brainstorm synthesize/finalize seam produces exactly one structured SpecArtifact from a converged elicit output (ac2/ac4) and no longer throws.
  - Subjects: `orchestrator prepareSynthesize(intent 'brainstorm', stepOutputs) no longer throws 'not yet supported' and returns a synth prompt/schema targeting the SpecArtifactBody`, `finalizeArtifact for 'brainstorm' with a valid synthesized body writes exactly one SpecArtifact (json+md), body carrying intent/scopeBoundary/nonGoals/decisions/openItems, meta.approvedAt unset`, `finalizeArtifact rejects (retryable, writes nothing) a synthesized body missing a required field (e.g. empty scopeBoundary)`, `the other workflows' synth/finalize arms are unaffected (a stub/define finalize still works)`
  - Fixtures: `a converged elicit stepOutputs fixture`, `a temp repo intent`
- **live** — Gated (INSRC_LIVE_TESTS=1) end-to-end: a real converged brainstorm run yields a well-structured SpecArtifact.
  - Subjects: `a full brainstorm run to convergence produces a SpecArtifact whose intent + scopeBoundary read as a genuine structured statement (not a restatement of the raw idea) and whose decisions/nonGoals reflect the conversation`
  - Fixtures: `a live core-tier provider (INSRC_LIVE_TESTS=1)`, `a scripted converged conversation`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: writing the SpecArtifact json via writeAtomic + reading it back is deep-equal (durable, stable id)`, `unit: the same specHash yields the same paths and idempotent overwrite reads back identical content`, `unit: specArtifactId is the stable 'SPEC-<specHash>' identifier` |
| `ac2` | `unit: renderSpecMarkdown emits the Intent/Scope/Non-goals/Decisions(+ruledOut/reason)/Open-items sections, not a transcript`, `integration: the synthesized SpecArtifactBody carries the distinct structured fields; finalize rejects an under-structured body (empty scopeBoundary)`, `live: a real run's intent + scopeBoundary read as a structured statement` |
| `ac3` | `unit: specArtifactPaths(...).json is under the shared ARTIFACTS_DIR (same listing/lookup as the other artifacts) with the md under SPECS_DIR`, `unit: renderSpecMarkdown carries the artifactIdMarker for lookup` |
| `ac4` | `integration: a converged elicit output produces exactly ONE SpecArtifact whose single body serves both downstream entries — no consumer-specific variant is written`, `unit: SpecArtifactBody has no consumer-tagged fields (one shape)` |

## Alternatives considered

### a1: Peer SpecArtifact record + storage peer, structured body, wired through the brainstorm synthesize/finalize seam — **CHOSEN**

A new src/workflow/artifacts/spec.ts (record + renderer) + storage.ts peers (SPECS_DIR/specArtifactId/specArtifactPaths/specMdRel) mirroring define/plan; the brainstorm synthesizer structures the converged elicit output into the single SpecArtifactBody { intent, scopeBoundary, nonGoals, decisions, openItems } and finalize persists it hash-addressed via writeAtomic.

Realize sc1 exactly as the HLD prescribes. (1) src/workflow/artifacts/spec.ts declares SpecArtifactBody { category, intent, scopeBoundary, nonGoals, decisions:[{chosen,ruledOut,reason}], openItems }, SpecArtifact = WorkflowArtifact<SpecArtifactBody> with kind 'spec' + specHash + meta (createdAt, optional approvedAt/review/model), and renderSpecMarkdown emitting the structured sections + artifactIdMarker (peer of define.ts/plan.ts). (2) storage.ts gains SPECS_DIR, specArtifactId(specHash), specArtifactPaths(repoPath, specHash) -> { md under SPECS_DIR, json under ARTIFACTS_DIR }, specMdRel. (3) orchestrator.ts: a brainstormSynthesizer (prepareSynthesize case) prompts the LLM to STRUCTURE the converged workingStatement into distinct intent + scopeBoundary and carry decisions/nonGoals/openItems 1:1; finalizeBrainstorm (finalizeArtifact case) validates, computes specHash, writes {md,json} via specArtifactPaths+writeAtomic, stamps meta.createdAt + attribution, leaving approvedAt unset (s7's gate). The 'not yet supported' brainstorm arms are removed. ONE artifact, no consumer variant; listed + approval-gated exactly like DEF/HLD/LLD/PLAN. Category reuses the REAL BrainstormCategory union (recorded refinement).

### a2: Persist the raw converged elicit output verbatim as the artifact body

Store the s3/s4 elicit output shape { category, workingStatement, openItems, confirmed, decisions, nonGoals } directly as the SpecArtifact body, skipping the intent/scopeBoundary structuring.

Add the spec.ts record + storage peers, but set SpecArtifactBody = the elicit output as-is (a single workingStatement blob + decisions/nonGoals/openItems), and have finalize persist that without a synthesizer restructuring step.

**Rejected because:** Under-structures the body: a single workingStatement blob is not the { intent, scopeBoundary, ... } structured statement ac2/k1 require (ac2 violates), and it forces each downstream consumer to re-parse the blob, inviting a consumer-specific variant (ac4 partial). Ranked 2nd.

### a3: A bespoke spec store / on-disk format separate from the artifact module

Persist the spec in its own dedicated store or format (not a peer artifact file), with a bespoke lookup rather than the shared artifact listing.

Introduce a spec-specific persistence path (e.g. a separate directory + index) and a dedicated read/list API for the spec, outside the define/plan artifact+storage template.

**Rejected because:** A bespoke store/lookup is the exact 'separate place to go looking' ac3 forbids (ac3 violates) and diverges from the storage.ts peer + established-artifact-shape sc1 requires (sc1 violates, k6/k7). Ranked lowest.

## Citations

- **[[c1]]** `analyze-bundle` `s1 module-profile — define.ts/plan.ts artifact record + renderer template (WorkflowArtifact<Body>, ArtifactMetaBase, artifactIdMarker) that SpecArtifact mirrors`
- **[[c5]]** `analyze-bundle` `s1 symbol-locate — storage.ts hash-addressing: <t>ArtifactId/<t>ArtifactPaths/<t>MdRel, ARTIFACTS_DIR (:50), writeAtomic (:71 tmp-then-rename) that specArtifactPaths mirrors`
- **[[c6]]** `prior-artifact` `HLD sc1 — SpecArtifact record + hash-addressed persistence (owned by s6; consumed by s7/s8/s9)`
- **[[c7]]** `analyze-bundle` `s1 usage-example — orchestrator.ts prepareSynthesize (:263) + finalizeArtifact (:374) throw 'not yet supported' for brainstorm; finalizeDefine/finalizePlan are the pattern the brainstorm arms follow`
- **[[c8]]** `analyze-bundle` `s1 data-model-trace — the converged elicit output { category, workingStatement, decisions, nonGoals, openItems } (brainstorm/schemas.ts) mapped into SpecArtifactBody; the REAL BrainstormCategory union (brainstorm-classes.ts)`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 6 LOW** · model `client` · reviewed 2026-08-02T10:05:34.061Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| contract/SpecArtifact | citation | LOW | manual | define.ts and plan.ts are the artifact record+renderer template s6's new spec.ts mirrors (typed body + renderer importing artifactIdMarker + WorkflowArtifact). | src/workflow/artifacts/define.ts:20 imports artifactIdMarker+defineArtifactId, :23 imports WorkflowArtifact; declares the typed body + renderer — the template SpecArtifact/spec.ts mirrors. Confirmed. | none — verified sound |
| contract/specArtifactPaths | citation | LOW | manual | storage.ts holds the <t>ArtifactId/<t>ArtifactPaths/<t>MdRel family + ARTIFACTS_DIR + writeAtomic that specArtifactId/specArtifactPaths/specMdRel/SPECS_DIR mirror; no spec* peer exists yet. | src/workflow/storage.ts:194 defineArtifactPaths, :50 ARTIFACTS_DIR, :71 writeAtomic present; no specArtifactPaths/SPECS_DIR in src yet (all matches in docs) — exactly the additive peers s6 introduces. Confirmed. | none — verified sound |
| dataModel/wiring | citation | LOW | manual | orchestrator.ts prepareSynthesize + finalizeArtifact currently throw 'not yet supported' for workflow 'brainstorm' (the arms s6 replaces); finalizeDefine/finalizePlan are the pattern. | src/workflow/orchestrator.ts routes brainstorm (case at :137) and defines finalizeDefine (:649); prepareSynthesize/finalizeArtifact throw 'not yet supported' for brainstorm (the arms s6 replaces, mirroring finalizeDefine/finalizePlan). Confirmed. | none — verified sound |
| contract/SpecArtifact | semantic | LOW | manual | WorkflowArtifact<Body> is the generic artifact envelope in types.ts that SpecArtifact specializes. | src/workflow/types.ts:396 `export interface WorkflowArtifact<Body = unknown>` — the generic envelope SpecArtifact specializes. Confirmed. | none — verified sound |
| dataModel/SpecArtifactBody | closed-union | LOW | manual | BrainstormCategory (the real union reused for SpecArtifactBody.category) is defined in src/shared/brainstorm-classes.ts. | src/shared/brainstorm-classes.ts:12 `export type BrainstormCategory` + :23 BRAINSTORM_CATEGORY_CLASSES — the real union reused for SpecArtifactBody.category. Confirmed. | none — verified sound |
| dataModel/mapping | semantic | LOW | manual | The converged elicit output the synthesizer maps from is { category, workingStatement, openItems, confirmed, decisions[{chosen,ruledOut,reason}], nonGoals } in brainstorm/schemas.ts. | The probe over-capped on docs (50 matches all in md artifacts), but the shipped s3/s4 brainstormElicitSchema in src/workflow/runners/brainstorm/schemas.ts carries workingStatement/openItems/confirmed/decisions{chosen,ruledOut,reason}/nonGoals (commits aeea535/b48d53a) — the converged output the synthesizer maps from. Confirmed via the shipped schema. | none — verified sound |
