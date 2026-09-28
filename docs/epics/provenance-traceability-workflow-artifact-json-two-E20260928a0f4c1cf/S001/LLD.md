<!-- insrc:artifact LLD-a0f4c1cfe262a497-s1 -->

# LLD: E20260928a0f4c1cf:S001

**Epic:** `provenance-traceability-workflow-artifact-json-two`
**HLD base run:** `wf-1790588218844-46z20d`
**HLD effective hash:** `96dce0c1944d...`

## HLD context

**Framework:** Give every document artifact body an optional, absent-safe feedback record as structured JSON (source of truth), rendered via an additive binding, with a production key-preserving append API (daemon tool + IPC). s1 lays the whole foundation; s2 reuses it for the BUILD change-log + code feedback.
**Rollout phase:** Phase A — Feedback foundation (records + append API + document rendering)
**Owns:** `undefined` (undefined), `undefined` (undefined), `undefined` (undefined)

## Contract details

**Surface level:** internal-shared

### `FeedbackEntry / ProvenanceTarget / FeedbackRecord (sc1 vocabulary)`

```typescript
interface ProvenanceTarget { readonly file: string; readonly version?: string; readonly segment?: { readonly startLine: number; readonly endLine: number }; }
interface ProvenanceAuthorship { readonly author: string; readonly timestamp: string; }
interface FeedbackEntry extends ProvenanceAuthorship { readonly id: string; readonly target: ProvenanceTarget; readonly comment: string; readonly kind?: 'feedback' | 'suggestion' | 'comment'; }
type FeedbackRecord = readonly FeedbackEntry[];
```

**Returns:** `type-declarations` — The shared provenance vocabulary (sc1) in a new module src/workflow/artifacts/provenance/types.ts; ChangeLogEntry/ChangeLog are declared here too but consumed by s2. Attribution field-aligns with ArtifactModelAttribution (author/timestamp) + the ReviewComment anchor (file/segment) without importing either.

**Postconditions:**
- FeedbackEntry.target carries file + optional version + optional segment {startLine,endLine} (k2)
- author + timestamp are always present on an entry (k2)

### `appendFeedback (sc2 append entry point)`

```typescript
function appendFeedback(req: AppendFeedbackRequest): AppendFeedbackResult
```

**Parameters:**
- `req: AppendFeedbackRequest { readonly artifactPath: string; readonly entry: Omit<FeedbackEntry,'id'|'timestamp'> & { readonly timestamp?: string } }` — The artifact JSON path to append to, plus the feedback entry to add (id minted; timestamp minted if omitted).

**Returns:** `AppendFeedbackResult { readonly artifactPath: string; readonly entryId: string; readonly total: number }` — The minted entry id and the new total feedback-entry count after the append.

**Errors:**
- `typed error (ArtifactFeedbackError)` when artifactPath is outside the repo artifact root, does not exist, holds malformed JSON, or the entry has a blank author/comment — fail loudly, never partial-write

**Preconditions:**
- artifactPath resolves under the repo's .insrc/artifacts tree (or docs mirror)

**Postconditions:**
- The artifact JSON body.feedback array has exactly one new entry appended (append-only, lc1)
- Every pre-existing key of the {meta, body, citations} envelope is byte-preserved (k5)

### `writeArtifactJson (sc2 production key-preserving writer)`

```typescript
function writeArtifactJson(path: string, artifact: ArtifactShape): void
```

**Parameters:**
- `path: string` — Absolute artifact JSON path under the artifact root.
- `artifact: ArtifactShape (the {meta, body, citations} envelope)` — The full artifact object to serialize, with the appended feedback already in body.feedback.

**Returns:** `void` — The file is rewritten in place via JSON.stringify(artifact, null, 2), preserving every existing key and ordering.

**Errors:**
- `typed error` when path is outside the artifact root — rejected before any write

**Preconditions:**
- The artifact object was read from `path` and only its body.feedback was mutated

**Postconditions:**
- The on-disk artifact retains all meta + citations + other body fields unchanged (k5); this is the new production writer the analyze pass found missing

### `feedbackBodyLines (sc3 render binding)`

```typescript
function feedbackBodyLines(feedback: FeedbackRecord | undefined): readonly string[]
```

**Parameters:**
- `feedback: FeedbackRecord | undefined` — The body's feedback record (may be absent on legacy artifacts).

**Returns:** `readonly string[]` — The markdown lines of the Feedback section; returns [] when feedback is undefined or empty (the companionBodyLines omit-slot pattern) so the section is omitted — byte-identical render when absent.

**Postconditions:**
- Absent/empty feedback → [] → renderer omits the section (ac2/ac4/k5)
- Each entry renders its attribution (author, timestamp, target file+segment) + comment from the structured record, never prose-authored (k1)

### `registerArtifactFeedbackTool (sc2 daemon tool wrapper)`

```typescript
function registerArtifactFeedbackTool(): void
```

**Returns:** `void` — Registers the append capability as a daemon Tool via registerTool(tool: Tool), following the registerDocgenTool idiom; mounted alongside the other builtins in daemon/tools/builtins/index.ts.

**Preconditions:**
- Called once at daemon tool-registration time

**Postconditions:**
- The append capability is available as a daemon tool

### `'artifact.feedback.append' (sc2 IPC method)`

```typescript
'artifact.feedback.append': async (params: AppendFeedbackRequest) => Promise<AppendFeedbackResult | { error: string }>
```

**Parameters:**
- `params: AppendFeedbackRequest` — The IPC request payload (artifactPath + entry).

**Returns:** `AppendFeedbackResult | { error: string }` — The append result, or a typed {error} object on a bad/out-of-tree/malformed request (repo.stats handler convention — return an error object, do not throw).

**Errors:**
- `{ error: string } response object` when artifactPath invalid/out-of-tree or artifact JSON malformed

**Preconditions:**
- Registered inline in the daemon entrypoint handler map (src/daemon/index.ts), delegating to appendFeedback

**Postconditions:**
- Pinned by a per-method contract test in the repo-stats-handler-contract.test.ts mould (registered, delegates, append-only)

## Data model changes

### `src/workflow/artifacts/provenance/ (new module)` — new

New module holding sc1 vocabulary (types.ts: ProvenanceTarget/ProvenanceAuthorship/FeedbackEntry/FeedbackRecord + ChangeLogEntry/ChangeLog for s2), sc2 writer (writer.ts: appendFeedback + writeArtifactJson + id/timestamp minting + artifact-root path guard + ArtifactFeedbackError), and the daemon tool wrapper (registerArtifactFeedbackTool). Mirrors the sibling companion/ module layout.

**Call sites:**
- `src/workflow/artifacts/companion/types.ts`
- `src/workflow/artifacts/companion/generate.ts`

### `DefineBody / HldBody / LldBody / PlanBody` — field-add

Append `readonly feedback?: FeedbackRecord | undefined;` near the tail of each body interface (S002 `summary?` spelling, exactOptionalPropertyTypes). The isXBody guard is LEFT UNTOUCHED so legacy bodies still pass. The synthesizer body schemas in orchestrator.ts admit-but-never-emit the field (HARD-RULE the model not to author it; additionalProperties:false preserved).

```
+ readonly feedback?: FeedbackRecord | undefined;  // on each of DefineBody(L74-88)/HldBody(L93-114)/LldBody(L138-163)/PlanBody(L86-93)
```

**Call sites:**
- `src/workflow/artifacts/define.ts:74`
- `src/workflow/artifacts/hld.ts:93`
- `src/workflow/artifacts/lld.ts:138`
- `src/workflow/artifacts/plan.ts:86`
- `src/workflow/orchestrator.ts`

### `renderDefineMarkdown / renderHldMarkdown / renderLldMarkdown / renderPlanMarkdown` — field-modify

Each renderer wires a `feedback` section key into its SectionBindings table handed to renderFromFormat, delegating to feedbackBodyLines(body.feedback) via the omit-slot pattern (return {lines} if non-empty else {omit:true}); a `feedback` section is added to each DocumentFormat (format/formats.ts) + its template. Must preserve the byte-identical-when-absent invariant (c1).

```
SectionBindings += feedback: () => { const l = feedbackBodyLines(body.feedback); return l.length>0 ? {lines:l} : {omit:true}; }
```

**Call sites:**
- `src/workflow/artifacts/define.ts:98`
- `src/workflow/artifacts/hld.ts:124`
- `src/workflow/artifacts/lld.ts:304`
- `src/workflow/artifacts/plan.ts:107`
- `src/workflow/artifacts/format/bindings.ts:38`
- `src/workflow/artifacts/format/formats.ts`

### `artifact.feedback.append IPC handler` — new

New inline entry in the daemon entrypoint handler map (src/daemon/index.ts) delegating to appendFeedback, returning a typed result-or-error object (repo.stats precedent @ index.ts:589). registerArtifactFeedbackTool mounted in daemon/tools/builtins/index.ts.

**Call sites:**
- `src/daemon/index.ts:589`
- `src/daemon/tools/registry.ts:18`
- `src/daemon/tools/builtins/index.ts`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | implements | s1 defines the provenance vocabulary (FeedbackEntry/ProvenanceTarget/ProvenanceAuthorship/FeedbackRecord) verbatim from the sc1 sketch in the new provenance module; ChangeLogEntry/ChangeLog are declared here too for s2 to consume. Attribution field-aligns with ArtifactModelAttribution + the ReviewComment anchor without importing either type (k6). |
| `sc2` | implements | s1 builds the append API: appendFeedback + the new production key-preserving writeArtifactJson writer + registerArtifactFeedbackTool + the inline 'artifact.feedback.append' IPC handler. Append-only (lc1), key-preserving (k5), path-guarded to the artifact root. |
| `sc3` | implements | s1 adds feedbackBodyLines to format/bindings.ts (omit-slot: [] when absent) and wires the `feedback` section into all four document renderers' SectionBindings + DocumentFormats, so the section renders from the structured record and is byte-identical when absent (ac2/k1/k5). |

## Error paths

### Error cases

- **appendFeedback is given an artifactPath outside the repo's artifact root (path traversal / wrong tree)** (recoverable)
  - Detection: The writer resolves the path and checks it is contained within the repo's .insrc/artifacts root (and docs mirror) before any read/write; a resolved path not under the root fails the containment check.
  - Response: Throw ArtifactFeedbackError (module fn) / return a typed { error } object (IPC handler) BEFORE opening the file — no write occurs.
  - User impact: The append is rejected with a clear message; no artifact is touched.
- **The target artifact JSON is missing or malformed (not parseable as the {meta, body, citations} envelope)** (recoverable)
  - Detection: readArtifact-style JSON.parse of the file throws, or the parsed object lacks a `body` object.
  - Response: Fail loudly with ArtifactFeedbackError (module) / { error } (IPC) and do NOT write — never emit a partial or truncated file.
  - User impact: The append fails with the parse/shape error; the on-disk artifact is untouched.
- **A feedback entry is submitted with a missing/blank author or an empty comment** (recoverable)
  - Detection: appendFeedback validates the entry: author non-empty and comment non-empty (k2 requires an attributed author); a blank field fails validation.
  - Response: Reject with ArtifactFeedbackError / { error } before appending; the record is not mutated.
  - User impact: The caller must supply author + comment; nothing is recorded until they do.
- **Concurrent appends to the same artifact race (two read-append-rewrite cycles interleave)** (recoverable)
  - Detection: The second writer's rewrite is based on a snapshot taken before the first writer's entry landed (last-writer-wins would drop an entry).
  - Response: Perform the read-append-rewrite as a single synchronous critical section per path; document that the append API is not designed for concurrent multi-writer use in this Epic (capture wiring is deferred, k4).
  - User impact: In the rare concurrent case one entry could be lost; single-caller use (the shipped scope) is unaffected.

### Edge cases

| Input | Expected |
| :--- | :--- |
| An artifact whose body has no `feedback` field yet (legacy artifact, or first-ever append) | The writer treats a missing body.feedback as an empty array and initialises it with the one new entry; the reader/renderer treats absent as [] and omits the section (ac4). |
| A document artifact carrying feedback entries is rendered | feedbackBodyLines returns the section lines; the Feedback section appears generated from the structured record (ac1/ac2). |
| A feedback entry with a target that has file but no segment (whole-document feedback) | The entry is valid (segment is optional per sc1); the renderer shows file-level attribution without a line range. |
| An entry submitted without a timestamp | appendFeedback mints an ISO timestamp; with an explicit timestamp it is used verbatim (AppendFeedbackRequest.entry.timestamp is optional). |
| A BUILD artifact passed to the doc-feedback append (out of s1 scope) | The append writer is body-shape-agnostic (writes body.feedback on any artifact); the doc-specific render wiring is only added to the four document renderers in s1 — BUILD render + code-feedback semantics are s2's, so s1 neither renders nor special-cases BUILD. |

### Invariants to preserve

- The isXBody type guards (isDefineBody/isHldBody/isLldBody/isPlanBody) must stay unchanged so a legacy artifact body without the feedback field still validates — the additive field is never asserted by the guard (proven by the S002/S003 body-fields.test.ts tolerance test). [[c1]]
- A rendered document with no feedback must be byte-identical to today's output — the feedback section is omitted (feedbackBodyLines returns []), mirroring the companionBodyLines omit-slot behaviour. [[c1]]
- The production writer must preserve every existing key of the {meta, body, citations} envelope and only grow body.feedback — append-only, never editing or removing an existing entry (lc1) and never dropping meta/citations (k5). [[c1]]
- Feedback attribution must field-align with the existing ArtifactModelAttribution model (author/timestamp) rather than introduce a parallel provenance model (k6). [[c3]]

## Test strategy

**Test framework:** `node:test (tsx --test), *.test.ts — the repo convention (matches the S002/S003 body-fields.test.ts + er-companion-finalize.test.ts suites)`

### Test levels

- **unit** — Prove the sc1 vocabulary + sc3 render binding + sc2 writer/validation in isolation, mirroring the S002/S003 body-field test pattern.
  - Subjects: `feedbackBodyLines: non-empty feedback → section lines with attribution; undefined/empty → [] (omit-slot)`, `appendFeedback: mints id + timestamp, appends one entry, returns {entryId,total}; blank author/comment rejected; out-of-tree path rejected; malformed JSON rejected`, `writeArtifactJson: round-trip preserves every meta/citations/body key and only grows body.feedback`, `isDefineBody/isHldBody/isLldBody/isPlanBody: a body WITH feedback still validates AND a legacy body WITHOUT it still validates (guard untouched)`
  - Fixtures: `in-memory DefineBody/HldBody/LldBody/PlanBody fixtures with and without feedback`, `a temp-dir artifact JSON file under a fake .insrc/artifacts root for the writer round-trip`
- **unit** — Prove each of the four document renderers emits the Feedback section from the structured record and is byte-identical when absent.
  - Subjects: `renderDefineMarkdown / renderHldMarkdown / renderLldMarkdown / renderPlanMarkdown: with feedback → Feedback section present; without feedback → output byte-identical to the pre-change render`
  - Fixtures: `a golden pre-change render per type (or the same artifact rendered with feedback undefined) to assert byte-identity`
- **contract** — Pin the daemon IPC method the same way repo.stats is pinned — registered in the index.ts handler map, delegates to appendFeedback, append-only.
  - Subjects: `artifact.feedback.append handler: registered in the daemon index.ts handler map; delegates to the provenance append fn; returns a typed {error} object (not a throw) on a bad/out-of-tree request`, `registerArtifactFeedbackTool: mounted among the builtins`
  - Fixtures: `a source-scan fixture over daemon/index.ts (repo-stats-handler-contract.test.ts mould)`, `a temp artifact JSON for the delegate round-trip`
- **integration** — Prove the end-to-end append→read→render loop on a real on-disk artifact, plus forward-only safety on a legacy artifact.
  - Subjects: `append a feedback entry to a written DEF/HLD/LLD/PLAN JSON, re-read, and assert the entry is present with full attribution and renders in the doc`, `a legacy artifact (no feedback field) reads + re-renders unchanged, then accepts a first append that initialises the record`
  - Fixtures: `temp-dir artifacts of each of the four doc types, written via the {meta,body,citations} envelope`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: appendFeedback stores an entry with file+version+segment+author+timestamp on body.feedback`, `integration: append→read→render shows the attributed feedback in the rendered DEF/HLD/LLD/PLAN` |
| `ac2` | `unit: feedbackBodyLines non-empty → section from the structured record`, `unit: each renderer with feedback absent → byte-identical to pre-change output (omit-slot)` |
| `ac3` | `unit: appendFeedback appends one entry and preserves prior entries (nothing lost)`, `contract: artifact.feedback.append IPC delegates to appendFeedback and returns {entryId,total}` |
| `ac4` | `unit: isXBody validates a legacy body without feedback`, `integration: a legacy artifact reads + re-renders unchanged (forward-only, absent-safe)` |
| `ac5` | `unit: a created FeedbackEntry carries author+timestamp field-aligned with ArtifactModelAttribution (no parallel model / no import of the review type)` |

## Migration

**State before:** The four document artifact bodies carry no feedback field; readArtifact exists in production (throwing + nullable) but there is NO production writer — only test helpers write the {meta,body,citations} envelope. No daemon tool or IPC method exists for appending feedback.

**State after:** Each document body carries an optional `feedback?: FeedbackRecord` (absent on every existing artifact); the four renderers emit a Feedback section from it (omitted when absent); a new provenance module provides the sc1 vocabulary + the production key-preserving appendFeedback/writeArtifactJson writer; a daemon tool + inline IPC method let a caller append an attributed entry. Nothing is migrated.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the new src/workflow/artifacts/provenance/ module (sc1 vocabulary + sc2 writer + tool wrapper) — purely additive, imported by nothing yet. — ↩ rollbackable
2. Add the optional `feedback?: FeedbackRecord | undefined` field to DefineBody/HldBody/LldBody/PlanBody, leaving each isXBody guard untouched. — ↩ rollbackable
3. Add the feedbackBodyLines binding and wire a `feedback` section into each of the four renderers' SectionBindings + each DocumentFormat/template via the omit-slot pattern. — ↩ rollbackable
4. Admit-but-never-emit the feedback field in the four document synthesizer body schemas in orchestrator.ts. — ↩ rollbackable
5. Register the daemon tool + inline 'artifact.feedback.append' IPC handler in daemon/index.ts delegating to appendFeedback, with its per-method contract test. — ↩ rollbackable

**Backward compat:** Fully backward compatible: the feedback field is optional + absent-safe (k5), the isXBody guards are unchanged so every existing artifact still validates, and the renderers omit the Feedback section when feedback is absent so existing documents render byte-identically. The append writer only grows body.feedback and preserves all other keys; no existing public API signature changes (the new tool + IPC method are purely additive to the daemon surface).

## Alternatives considered

### a1: HLD-literal: top-level feedback? field + fresh ProvenanceTarget + new provenance module — **CHOSEN**

Exactly the HLD sketch — top-level optional feedback? on each body, fresh ProvenanceTarget, new provenance module, inline daemon IPC + tool + feedbackBodyLines binding.

New provenance module (sc1 vocabulary + sc2 key-preserving append writer + tool wrapper); top-level feedback? on the four doc bodies (guards untouched, synthesizer admits-but-never-emits); feedbackBodyLines omit-slot binding wired into the four renderers + DocumentFormats; registerArtifactFeedbackTool + inline artifact.feedback.append IPC handler pinned by a repo.stats-style contract test. Fresh ProvenanceTarget field-aligns with ArtifactModelAttribution + the ReviewComment anchor without importing either.

### a2: Reuse ReviewComment['anchor'] as the FeedbackEntry target type

Define FeedbackEntry's target as the existing ReviewComment anchor shape rather than a fresh ProvenanceTarget.

Same module/writer/binding/body wiring as a1, but the target type reuses the backend ReviewComment['anchor'] shape from the review slice.

**Rejected because:** Best k6/ac5 reuse but couples the durable record to the review anchor lifecycle and may miss the full k2 attribution the sc1 sketch specifies (ac1/sc1 partial); loses to a1's decoupled sketch-literal target.

### a3: Grouped provenance? container on the body instead of top-level feedback?/changeLog?

Nest both records under one optional provenance? {feedback?; changeLog?} body field.

Same vocabulary/writer/binding/daemon surface as a1, but the body carries a single provenance? container instead of top-level feedback? (and s2's changeLog?).

**Rejected because:** Functionally satisfies every criterion but deviates from the approved top-level-field sketch and the established precedent for a purely cosmetic grouping gain; a1 delivers the same outcome without the deviation.

## Citations

- **[[c1]]** `analyze-bundle` `s1 symbol.locate — the four body triples + S002/S003 additive-optional-field pattern (define/hld/lld/plan.ts line spans; companion/__tests__/body-fields.test.ts; er-companion-finalize.test.ts) + format/bindings.ts companionBodyLines omit-slot` — "declare the field optional + | undefined near the interface tail; leave the isXBody guard UNTOUCHED; read behind a presence check via a binding returning [] when absent; pin present+absent branches wi"
- **[[c2]]** `analyze-bundle` `s1 structural-map — renderFromFormat engine @ format/engine.ts:103-142 + the 4 renderers; ArtifactShape (5 local views) + readArtifact (resolve-comment.ts:254 / tracker/resolve.ts:104); NO production writeArtifact (only test helpers write {meta,body,citations})` — "Section content is contributed as string[] by *BodyLines producers; there is NO production artifact-JSON writer — sc2 must introduce the key-preserving read-append-rewrite writer."
- **[[c3]]** `analyze-bundle` `s1 structural-map — daemon Tool @ tools/types.ts:96-152 + registerTool @ tools/registry.ts:18 + register<Name>Tool idiom (registerDocgenTool @ docgen/tool.ts:83); inline IPC handler map @ daemon/index.ts:589 (repo.stats) + repo-stats-handler-contract.test.ts; ArtifactModelAttribution @ types.ts:295 + attribution.ts` — "New tools register via registerTool exposed by a register<Name>Tool() wrapper; a new IPC method is an inline entry in daemon/index.ts delegating to a thin fn, returning a typed {error} object, pinned "

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 7 LOW** · model `client` · reviewed 2026-09-28T10:07:10.908Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| dataModel | citation | LOW | manual | The four document body interfaces exist at the cited files (define/hld/lld/plan.ts) to receive the optional feedback field. | Confirmed: export interface DefineBody @ define.ts:74, HldBody @ hld.ts:93, LldBody @ lld.ts:138, PlanBody @ plan.ts:86 — all four attach points exist as cited. | none — verified sound. |
| sc3 | citation | LOW | manual | format/bindings.ts holds the companionBodyLines omit-slot producer that feedbackBodyLines mirrors. | Confirmed: export function companionBodyLines @ format/bindings.ts:38 — the omit-slot producer feedbackBodyLines mirrors. | none — verified sound. |
| sc2 | citation | LOW | manual | registerTool is the daemon tool-registration seam and repo.stats is an inline handler in daemon/index.ts — the two patterns the append tool + IPC follow. | Confirmed: export function registerTool @ tools/registry.ts:18 and the inline 'repo.stats': async (params) => handler @ daemon/index.ts:589 (pinned by repo-stats-handler-contract.test.ts) — both patterns the append tool + IPC follow exist as cited. | none — verified sound. |
| sc2 | semantic | LOW | manual | readArtifact is production code but there is no production writeArtifact (only test helpers) — the writer sc2 introduces is genuinely new. | Confirmed: readArtifact is real (resolve-comment.ts:254 returns ArtifactShape) and neither `export function readArtifact` nor `export function writeArtifact` matches — there is no exported production writer. The 'writer sc2 introduces is genuinely new' premise holds. | none — verified sound; sc2 correctly introduces the production writer. |
| sc1 | citation | LOW | manual | ArtifactModelAttribution (the model the new attribution field-aligns with) exists in types.ts with helpers in attribution.ts. | Confirmed: export interface ArtifactModelAttribution @ types.ts:295 + export function singleModelAttribution @ attribution.ts:50 — the attribution model the new vocabulary field-aligns with exists as cited. | none — verified sound. |
| sc2 | citation | LOW | manual | The register<Name>Tool wrapper idiom exists (registerDocgenTool @ docgen/tool.ts) as the pattern registerArtifactFeedbackTool follows. | Confirmed: export function registerDocgenTool @ docgen/tool.ts:83 — the register<Name>Tool wrapper idiom exists as cited. | none — verified sound. |
| s1/s2 | ordering | LOW | manual | s1 owns sc1/sc2/sc3 and stays within its boundary; the BUILD change-log + code-feedback wiring is left to s2 (no cross-boundary build). | Internally consistent: the LLD confines s1 to the four document bodies/renderers + the shared sc1/sc2/sc3 it owns, and explicitly leaves the BUILD change-log + code-feedback wiring to s2 (the writer is body-shape-agnostic but s1 adds no BUILD wiring). No cross-boundary build. | none — boundary/ordering self-consistent. |
