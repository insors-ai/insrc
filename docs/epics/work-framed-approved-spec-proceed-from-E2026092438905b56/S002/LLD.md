<!-- insrc:artifact LLD-38905b56cb44c4cf-s2 -->

# LLD: E2026092438905b56:S002

**Epic:** `work-framed-approved-spec-proceed-from`
**HLD base run:** `wf-1790248075351-dbqnsq`
**HLD effective hash:** `b8f0f1bf4237...`

## HLD context

**Framework:** On-demand controller guidance is delivered by two independent read-only surfaces, each reading its source of truth WHERE THAT SOURCE ALREADY LIVES, plus a steering restructure that shrinks the injected block and points at those surfaces. sc-schema (S001) is an MCP-server-side read-only tool that serves the exact input contract for a requested insrc_* tool (+phase) by slicing the tool's own registered zod inputSchema — the same object the MCP SDK validates against — so there is no copy (k1) and no round-trip. sc-guide (S002) is the daemon-IPC-first + thin-MCP-wrapper shape proven by docgen: a daemon-owned guide.get / guide.list IPC reads the canonical steering content inside the daemon and returns one workflow's section, fronted by a thin insrc_guide MCP tool. Both surfaces are per-task (k2), read-only (k5), and return structured non-throwing results with the valid options on error (k3). S003 then authors, in the canonical steering source, a thin skeleton (front-door decision tree + a catalog of the available insrc_* / IPC calls, the insrc_build_step doc, the schema-first rule, and an insrc_schema self-entry) and moves each workflow's full procedural detail into the per-workflow sections sc-guide serves — propagated to every registered repo by the existing steering-refresh (k4).
**Rollout phase:** Phase A — the two on-demand surfaces (foundational)
**Owns:** `sc2` (insrc_guide per-workflow retrieval surface (MCP tool + daemon guide IPC + section addressing))

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Private to S001: how the MCP server enumerates its own registered tools and derives a JSON Schema slice from a tool's registered zod inputSchema; the tool/phase classification (which tools are phase-based and their phase names — analyze_step/workflow_step/review_step/code_review_step/build_step/triage[start,classify]/workflow_run[start,poll] vs the one-shot workflow_approve/docgen/analyze); the dynamic-envelope rule (return the static envelope + a description pointer to the run's own inline schema for runtime-generated inner payloads); and the exact structured-error shaping for omitted/unknown tool and omitted phase. None of this internal wiring is consumed by another Story — only the sc1 result surface is. — owns `sc1`
- `s3`: Private to S003: the actual authored steering content — the compact skeleton (front-door decision tree + the catalog of available insrc_* / IPC calls, the insrc_build_step documentation, the 'call insrc_schema before guessing a shape' rule, and the insrc_schema self-entry) and the concrete decision of which minimal orientation stays inline in the skeleton versus which per-workflow detail moves into sc2's sections. It consumes sc1 (names insrc_schema + its call/response shape in the catalog and self-entry) and sc2 (the skeleton directs the controller to fetch per-workflow detail via insrc_guide, and the moved detail is authored into sc2's per-workflow section partition), and it rides the existing steering-refresh for propagation. No other Story consumes S003.

## Contract details

**Surface level:** internal-shared

### `insrc_guide`

```typescript
// MCP tool registered in buildInsrcMcpServer via registerAndRecord('insrc_guide', { title, description, inputSchema: GUIDE_INPUT }, handleInsrcGuide) — phaseless
```

**Parameters:**
- `workflow: string` _(optional)_ — The workflow whose full guidance is wanted (e.g. 'design.story'). Omit to receive the list of available workflows.

**Returns:** `InsrcGuideResult` — A structured, never-thrown MCP result wrapping InsrcGuideOk ({ workflow, guidance }) on a hit or InsrcGuideError ({ error, validWorkflows }) on a miss.

**Errors:**
- `InsrcGuideError (structured, not thrown)` when workflow omitted or unrecognized -> { error, validWorkflows } (the keys guide.list reports).

**Preconditions:**
- The daemon is reachable; the canonical steering asset ships with the daemon.

**Postconditions:**
- No state is mutated and no cloud/REST path is opened (k5).
- The guidance returned is the marker-bounded section from the single canonical steering asset (k1).

### `handleInsrcGuide`

```typescript
export function handleInsrcGuide(args: InsrcGuideInput, deps?: UnaryRpcDeps): Promise<{ content: { type: 'text'; text: string }[] }>
```

**Parameters:**
- `args: InsrcGuideInput` — The { workflow? } request.
- `deps: UnaryRpcDeps | undefined` _(optional)_ — Injected unary-RPC dependencies (a seam for isolated testing), mirroring handleDocgen.

**Returns:** `Promise<{ content: { type: 'text'; text: string }[] }>` — The MCP tool envelope wrapping the InsrcGuideResult as JSON text; forwards to the daemon guide clients and never throws for a miss.

**Errors:**
- `none thrown for a miss` when An omitted/unknown workflow becomes a structured InsrcGuideError in the envelope (k3).

**Preconditions:**
- Imports ONLY the daemon guide clients (guideGet/guideList) + resolveRepoPath — no direct file/DB access (daemon owns content).

**Postconditions:**
- workflow present -> forwards to guideGet; workflow omitted -> forwards to guideList and returns { error, validWorkflows }.

### `guideGet`

```typescript
export function guideGet(params: { workflow: string }, deps?: UnaryRpcDeps): Promise<InsrcGuideResult>
```

**Parameters:**
- `params: { workflow: string }` — The workflow key to retrieve.
- `deps: UnaryRpcDeps | undefined` _(optional)_ — Injected unary-RPC seam (mirrors docgenGenerate).

**Returns:** `Promise<InsrcGuideResult>` — The daemon guide.get result over unaryRpc('guide.get', params, deps).

**Errors:**
- `InsrcGuideError (in-band)` when Unknown workflow -> { error, validWorkflows } returned by the daemon (not thrown).

**Preconditions:**
- A daemon socket is available (default UnaryRpcDeps).

**Postconditions:**
- Thin passthrough; holds no partitioning logic.

### `guideList`

```typescript
export function guideList(deps?: UnaryRpcDeps): Promise<{ workflows: string[] }>
```

**Parameters:**
- `deps: UnaryRpcDeps | undefined` _(optional)_ — Injected unary-RPC seam (mirrors docgenList).

**Returns:** `Promise<{ workflows: string[] }>` — The daemon guide.list result over unaryRpc('guide.list', {}, deps) — the workflow keys whose marker pairs are present.

**Errors:**
- `none` when Always returns a (possibly empty) workflows list.

**Preconditions:**
- A daemon socket is available (default UnaryRpcDeps).

**Postconditions:**
- Thin passthrough.

### `guide.get`

```typescript
// daemon IPC method-map entry in src/daemon/index.ts: 'guide.get': async (params: { workflow: string }) => InsrcGuideResult
```

**Parameters:**
- `params: { workflow: string }` — The requested workflow key.

**Returns:** `InsrcGuideResult` — Reads the canonical steering asset inside the daemon, runs readWorkflowGuide, and returns { workflow, guidance } or { error, validWorkflows }.

**Errors:**
- `InsrcGuideError (in-band)` when readWorkflowGuide returns null (no marker pair for the key) or the key is omitted -> { error, validWorkflows }.

**Preconditions:**
- The steering asset is readable at the daemon's shipped path (resolved as steering-inject.ts resolves it).

**Postconditions:**
- Read-only; no mutation, no cloud/REST (k5).

### `guide.list`

```typescript
// daemon IPC method-map entry in src/daemon/index.ts: 'guide.list': async () => ({ workflows: string[] })
```

**Returns:** `{ workflows: string[] }` — The workflow keys whose marker pairs are present in the canonical steering asset (listWorkflowGuides).

**Errors:**
- `none` when Returns an empty list if no marker pairs are authored yet (expected in Phase A before S003).

**Preconditions:**
- The steering asset is readable at the daemon's shipped path.

**Postconditions:**
- Read-only.

### `readWorkflowGuide`

```typescript
export function readWorkflowGuide(steeringText: string, workflow: string): string | null
```

**Parameters:**
- `steeringText: string` — The full canonical steering content.
- `workflow: string` — The workflow key to slice.

**Returns:** `string | null` — The text between that key's '<!-- insrc:guide:<workflow>:start -->' / ':end -->' markers, trimmed; null if the pair is absent.

**Errors:**
- `none thrown` when A missing/half-present marker pair yields null, not a throw.

**Preconditions:**
- Pure: depends only on its arguments; no I/O.

**Postconditions:**
- Deterministic slice; wording inside the section does not affect addressing.

### `listWorkflowGuides`

```typescript
export function listWorkflowGuides(steeringText: string): string[]
```

**Parameters:**
- `steeringText: string` — The full canonical steering content.

**Returns:** `string[]` — The workflow keys whose complete start/end marker pair is present, in document order.

**Errors:**
- `none thrown` when Returns [] when no complete pair exists.

**Preconditions:**
- Pure: depends only on its argument; no I/O.

**Postconditions:**
- A key with only a start or only an end marker is NOT listed (must be a complete pair).

## Data model changes

### `InsrcGuideInput / InsrcGuideOk / InsrcGuideError / InsrcGuideResult` — new

The sc2 I/O types exactly as the HLD sketches: InsrcGuideInput { workflow?: string }; InsrcGuideOk { workflow: string; guidance: string }; InsrcGuideError { error: string; validWorkflows: string[] }; InsrcGuideResult = InsrcGuideOk | InsrcGuideError. Plus GUIDE_INPUT, the insrc_guide tool's zod raw shape ({ workflow: z.string().optional() }) — workflow OPTIONAL so an omitted workflow is the ac2 structured path, not a wire rejection.

```
+ interface InsrcGuideInput { workflow?: string }
+ interface InsrcGuideOk { workflow: string; guidance: string }
+ interface InsrcGuideError { error: string; validWorkflows: string[] }
+ type InsrcGuideResult = InsrcGuideOk | InsrcGuideError
+ const GUIDE_INPUT = { workflow: z.string().optional() }
```

**Call sites:**
- `src/mcp/guide/schema.ts (type + GUIDE_INPUT definitions)`
- `src/mcp/guide/handler.ts (handleInsrcGuide)`
- `src/daemon/guide-sections.ts (result shaping)`

### `GUIDE_MARKER section-addressing convention` — new

The per-workflow marker pair keyed by workflow name: '<!-- insrc:guide:<workflowKey>:start -->' and '<!-- insrc:guide:<workflowKey>:end -->', mirroring the existing STEERING_MARKER_START/END idiom in steering-inject.ts. This is the addressing CONTRACT S003 authors its per-workflow sections against; readWorkflowGuide/listWorkflowGuides are the deterministic reader over it. Exported marker builders (guideMarkerStart(key)/guideMarkerEnd(key)) keep the convention single-sourced.

```
+ export const guideMarkerStart = (key: string): string => `<!-- insrc:guide:${key}:start -->`
+ export const guideMarkerEnd = (key: string): string => `<!-- insrc:guide:${key}:end -->`
```

**Call sites:**
- `src/daemon/guide-sections.ts (readWorkflowGuide/listWorkflowGuides + the daemon guide.get/guide.list handlers)`

### `daemon IPC method map (src/daemon/index.ts)` — field-add

Two new read-only entries added to the object-literal method map alongside docgen.generate/docgen.list: 'guide.get' and 'guide.list'. Each reads the canonical steering asset (resolved as steering-inject.ts resolves prompts/steering-block.md) and delegates to the pure readWorkflowGuide/listWorkflowGuides. Additive — no existing method changes.

```
+ 'guide.get': async (params) => { ...read asset...; return readWorkflowGuide(text, params.workflow) ?? { error, validWorkflows: listWorkflowGuides(text) } }
+ 'guide.list': async () => ({ workflows: listWorkflowGuides(readAsset()) })
```

**Call sites:**
- `src/daemon/index.ts (method map, adjacent to the docgen.generate/docgen.list entries ~lines 1358/1367)`

### `daemon-stream clients (src/mcp/daemon-stream.ts)` — field-add

Two thin unaryRpc client wrappers added alongside docgenGenerate/docgenList: guideGet(params, deps) over unaryRpc('guide.get', params, deps) and guideList(deps) over unaryRpc('guide.list', {}, deps). Additive.

```
+ export function guideGet(params: { workflow: string }, deps?: UnaryRpcDeps): Promise<InsrcGuideResult>
+ export function guideList(deps?: UnaryRpcDeps): Promise<{ workflows: string[] }>
```

**Call sites:**
- `src/mcp/daemon-stream.ts (client wrappers)`
- `src/mcp/guide/handler.ts (consumed by handleInsrcGuide)`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc2` | implements | S002 owns sc2 (HLD: ownedByStory s2). This contract IS sc2: the daemon guide.get/guide.list IPC + thin insrc_guide MCP wrapper + the section-addressing scheme (the GUIDE_MARKER convention + the pure readWorkflowGuide/listWorkflowGuides). insrc_guide exposes InsrcGuideInput -> InsrcGuideResult exactly as the HLD interfaceSketch declares, reading the single canonical steering asset inside the daemon (k1/ac3), returning validWorkflows on a miss (k3/ac2), and mutating nothing (k5/ac4). Downstream, S003 consumes sc2 by authoring each workflow's detail wrapped in the GUIDE_MARKER pair for that key inside the same steering source and directing the skeleton to fetch it via insrc_guide. The WorkflowKey set the HLD lists is the addressing key space; the concrete authored sections are S003's, not this Story's. |

## Error paths

### Error cases

- **Guidance requested with no workflow (workflow field absent/empty).** (recoverable)
  - Detection: handleInsrcGuide sees args.workflow is undefined/empty and routes to guideList instead of guideGet.
  - Response: Return InsrcGuideError { error: 'workflow is required', validWorkflows } (validWorkflows from guide.list) — structured, never thrown (k3, ac2).
  - User impact: The controller learns the available workflow keys and re-asks for the one it needs in one follow-up call.
- **Unknown / unrecognized workflow key.** (recoverable)
  - Detection: The daemon guide.get handler's readWorkflowGuide(text, key) returns null (no complete marker pair for the key).
  - Response: Return InsrcGuideError { error: 'unknown workflow <key>', validWorkflows: listWorkflowGuides(text) } (k3, ac2).
  - User impact: Controller corrects the workflow name against the authoritative list.
- **A workflow's section has a start marker but no matching end marker (or vice-versa) — a malformed authored section.** (recoverable)
  - Detection: readWorkflowGuide finds a start marker without its paired end (or an end before a start) and treats the pair as absent; listWorkflowGuides only counts complete pairs.
  - Response: Treated as a miss: guide.get returns InsrcGuideError { error, validWorkflows } and the half-marked key does NOT appear in guide.list (k3).
  - User impact: A mis-authored section reads as 'not available' rather than returning a truncated/garbage slice; the absence is visible via guide.list.
- **The canonical steering asset cannot be read at the daemon's shipped path (missing/unreadable file).** (recoverable)
  - Detection: The daemon guide.get/guide.list handler's read of the asset throws (readFileSync fails); the handler wraps the read.
  - Response: guide.list returns { workflows: [] } and guide.get returns InsrcGuideError { error: 'guidance source unavailable', validWorkflows: [] } rather than letting the throw escape the IPC (k3, k5).
  - User impact: Controller gets a clean structured signal that no guidance is currently retrievable instead of an opaque daemon error; not expected for a normal install (the asset ships with the daemon).

### Edge cases

| Input | Expected |
| :--- | :--- |
| guide.list before S003 has authored any per-workflow sections (Phase A). | Returns { workflows: [] } (no complete marker pairs yet) — a legitimate empty result, not an error; sc2 is independently shippable in Phase A. |
| A workflow key requested with different casing/whitespace than the authored marker. | Marker matching is exact on the key text; a non-exact key misses and returns validWorkflows (ac2) — no fuzzy matching that could return the wrong section. |
| A section whose body itself contains text resembling a marker for a DIFFERENT workflow. | readWorkflowGuide slices strictly between the requested key's own start/end markers, so inner marker-like text for another key is returned verbatim as content and does not corrupt addressing (the reader keys on the exact requested marker pair). |
| insrc_guide called via the MCP tool with workflow present but the daemon socket unavailable. | The thin wrapper surfaces the transport failure the same way handleDocgen does (an isError envelope) — sc2 adds no new transport behaviour; this is the existing daemon-client failure path, not an sc2 error case. |

## Test strategy

**Test framework:** `node:test via `npx tsx --test` (src/daemon/__tests__/ for the pure reader + daemon handlers, src/mcp/__tests__/ for the thin wrapper — matching the docgen + s1 schema tests).`

### Test levels

- **unit** — Prove the pure partition reader (readWorkflowGuide / listWorkflowGuides + guideMarkerStart/End) over fixture steering text, covering hit/miss/malformed/ordering with no I/O.
  - Subjects: `readWorkflowGuide(text, key): hit returns the trimmed section between the key's start/end markers (ac1); unknown key returns null; half-present pair (start only / end only / end-before-start) returns null; inner text resembling another key's marker is returned verbatim, not mis-sliced`, `listWorkflowGuides(text): returns only keys with a COMPLETE pair, in document order; returns [] for text with no pairs (Phase-A empty case)`, `guideMarkerStart(key)/guideMarkerEnd(key) produce the exact '<!-- insrc:guide:<key>:start|end -->' strings the reader keys on`
  - Fixtures: `A fixture steering string with 2-3 complete per-workflow marker sections + one malformed (half-marked) section + a section whose body contains a decoy marker-like line`
- **unit** — Prove the guide.get/guide.list daemon handlers over an INJECTED asset-read seam (no real file), including the read-failure path.
  - Subjects: `guide.get handler: known key -> { workflow, guidance }; unknown/omitted key -> { error, validWorkflows }; asset-read throws -> { error, validWorkflows: [] } (never escapes the IPC)`, `guide.list handler: returns { workflows } from listWorkflowGuides over the injected text; asset-read throws -> { workflows: [] }`
  - Fixtures: `An injected read seam returning fixture steering text, and one that throws`
- **unit** — Prove the thin insrc_guide MCP handler routes correctly over an INJECTED UnaryRpc dep (mirrors the docgen handler test) and never throws for a miss.
  - Subjects: `handleInsrcGuide({ workflow }) -> forwards to guideGet and wraps InsrcGuideOk in { content:[{type:'text',text}] }`, `handleInsrcGuide({}) (omitted workflow) -> forwards to guideList and returns a structured InsrcGuideError { error, validWorkflows } envelope (ac2), never throws`
  - Fixtures: `An injected UnaryRpcDeps stub returning canned guide.get/guide.list results`
- **integration** — Prove insrc_guide registers on the real server (phaseless) so it appears in the s1 insrc_schema registry, and its input shape is the GUIDE_INPUT (workflow optional).
  - Subjects: `buildInsrcMcpServerWithRegistry(): the registry now includes 'insrc_guide' (phaseless: no phases); the schema-registry key-set test count reflects the added tool`, `readWorkflowGuide over the REAL canonical steering asset returns null for every WorkflowKey in Phase A (no marker pairs authored yet) and does not throw`
  - Fixtures: `The real buildInsrcMcpServerWithRegistry output + the shipped steering asset (read-only)`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: readWorkflowGuide returns the exact marker-bounded section for a known workflow from fixture steering text`, `unit: handleInsrcGuide({workflow}) returns InsrcGuideOk { workflow, guidance } via the injected guideGet` |
| `ac2` | `unit: guide.get handler with an unknown/omitted key returns { error, validWorkflows } and never throws`, `unit: handleInsrcGuide({}) returns a structured InsrcGuideError { error, validWorkflows } envelope (no throw)` |
| `ac3` | `unit: readWorkflowGuide over two DIFFERENT fixture strings (simulating an edited canonical source) returns the correspondingly different section — proving the served guidance tracks the single source with no copy`, `integration: the daemon guide.get reads the canonical asset path (resolved as steering-inject does), so a source change is reflected on the next call` |
| `ac4` | `unit: the reader + handlers perform no writes (pure functions + read-only asset access) and open no network — asserted by the injected-seam tests exercising only reads`, `unit: guide.get/guide.list handlers use only the injected read seam (no socket/REST), confirming read-only` |

## Alternatives considered

### a1: Marker-pair partitioning of the single canonical steering asset — **CHOSEN**

sc2 defines per-workflow marker pairs ('<!-- insrc:guide:<key>:start -->' / ':end -->') inside the one canonical steering-block.md; guide.get/list read that daemon-side asset and slice between markers.

sc2 owns a small marker convention keyed by workflow name, mirroring the existing STEERING_MARKER_START/END idiom in steering-inject.ts. A PURE partition reader takes the steering text + a workflow key and returns the text between that key's start/end markers (or null); given just the text it enumerates the keys whose marker pairs are present. The daemon `guide.get` / `guide.list` handlers read the SAME canonical asset the daemon ships for steering-refresh (out/prompts/steering-block.md, resolved exactly as steering-inject.ts resolves it) and run the pure reader; guide.get returns { workflow, guidance } on a hit or { error, validWorkflows } on a miss, guide.list returns { workflows }. A thin insrc_guide MCP handler forwards to the daemon guideGet/guideList clients (docgen precedent). S003 later authors each workflow's detail wrapped in the corresponding marker pair inside the same file. Until then guide.list legitimately returns few/no keys (expected in Phase A).

### a2: Per-workflow files under src/prompts/guide/

A src/prompts/guide/<workflowKey>.md file set; guide.get reads the file for the key, guide.list is the directory listing.

Introduce a new per-workflow content directory (src/prompts/guide/), one markdown file per workflow key, shipped as assets. guide.get(workflow) reads <key>.md; guide.list() enumerates the directory. S003 authors each workflow's detail as its own file.

**Rejected because:** Functionally serves per-workflow guidance but only partial on ac1/ac3/sc2: it introduces a second content location distinct from steering-block.md, weakening single-source (k1) and diverging from the HLD's 'partition the canonical steering source'. Physically cleaner, but the drift risk between skeleton and detail is exactly what the epic exists to avoid.

### a3: Heading-convention partitioning (## heading text -> workflow key)

guide.get keys sections by a '## ' heading whose text maps to a workflow name, returning content from that heading to the next '##'.

No new markers: sc2 maps each workflow key to a heading in steering-block.md (by a naming/tag convention) and slices from that heading to the next same-level heading. guide.list derives keys from the recognized headings.

**Rejected because:** Shares a1's single-source read but is only partial on ac2/ac3/sc2: addressing is coupled to heading WORDING (a routine doc edit silently breaks retrieval), and the current headings are topic- not workflow-keyed, forcing a fragile text->key table. Strictly more brittle than a1's explicit markers for the same cost.

## Citations

- **[[c1]]** `analyze-bundle` `s1 how-does-it-work: the docgen daemon-IPC + thin-MCP-wrapper precedent (src/mcp/docgen/handler.ts forwards to docgen.generate; daemon-stream.ts clients; src/daemon/index.ts method map)` — "insrc_docgen is a thin MCP wrapper forwarding to the daemon docgen.generate IPC via daemon-stream clients; sc2 mirrors this: guide.get/guide.list daemon methods + guideGet/guideList clients + a thin i"
- **[[c2]]** `analyze-bundle` `s1 structural-map: the canonical steering asset loading + marker idiom (src/prompts/steering-block.md, src/daemon/steering-inject.ts STEERING_MARKER_START/END, src/daemon/index.ts)` — "steering-inject.ts resolves + readFileSync's prompts/steering-block.md and delimits regions with '<!-- insrc:steering:start/end -->'; sc2 defines per-workflow '<!-- insrc:guide:<key>:start/end -->' ma"
- **[[c3]]** `analyze-bundle` `s1 structural-map: test locations + seams (src/daemon/__tests__/, src/mcp/__tests__/, docgen handler test) sc2 extends` — "pure partition reader tested over fixture text; guide handlers tested via an injected read seam; the thin insrc_guide handler tested with an injected UnaryRpc dep; insrc_guide is phaseless so it lands"
- **[[c4]]** `step-output` `s3 alternatives.judge (a1 chosen): marker-pair partitioning of the single canonical asset over per-workflow files (a2) and heading-convention (a3)` — "a1 is the only alternative that scores 'satisfies' on ALL of ac1-ac4 and sc2; a2/a3 are partial on ac1/ac2/ac3/sc2."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 7 LOW** · model `client` · reviewed 2026-09-24T12:10:20.609Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| c1 | citation | LOW | manual | src/mcp/docgen/handler.ts is a thin MCP wrapper that forwards to the daemon docgen.generate IPC via a daemon-stream client (docgenGenerate) — the precedent handleInsrcGuide mirrors. | Confirmed: src/mcp/docgen/handler.ts imports docgenGenerate from ../daemon-stream.js (line 22) and forwards to it (line 83) — the thin-MCP-wrapper precedent handleInsrcGuide mirrors. | No change — citation resolves. |
| c1 | citation | LOW | manual | src/mcp/daemon-stream.ts holds thin unaryRpc client wrappers (docgenGenerate/docgenList) that guideGet/guideList mirror. | Confirmed: src/mcp/daemon-stream.ts defines the unaryRpc<T>(method, params, deps) helper (line 202) and the thin client-wrapper idiom over it (workflow.run.start/poll, workflow.approve, docgenGenerate imported by the docgen handler) — guideGet/guideList mirror this shape. | No change — citation resolves. |
| c1 | citation | LOW | manual | The daemon IPC handler registry is an object-literal method map in src/daemon/index.ts containing 'docgen.generate' and 'docgen.list', beside which 'guide.get'/'guide.list' are added. | Confirmed: src/daemon/index.ts registers 'docgen.generate' (line 1358) and 'docgen.list' (line 1367) in the object-literal method map, beside which guide.get/guide.list are added. | No change — citation resolves. |
| c2 | citation | LOW | manual | src/daemon/steering-inject.ts resolves and readFileSync's the canonical prompts/steering-block.md asset and delimits regions with STEERING_MARKER_START/END ('<!-- insrc:steering:start/end -->'), the marker idiom the GUIDE_MARKER convention mirrors. | Confirmed: src/daemon/steering-inject.ts exports STEERING_MARKER_START '<!-- insrc:steering:start -->' (line 41) and resolves the canonical prompts/steering-block.md asset (line 60) — the marker idiom + asset resolution the GUIDE_MARKER convention and the daemon guide handlers mirror. | No change — citation resolves. |
| c2 | citation | LOW | manual | The canonical steering source src/prompts/steering-block.md exists and is the single content the guide surface reads. | Confirmed: src/prompts/steering-block.md exists and is the single canonical steering source the guide surface reads. | No change — citation resolves. |
| boundary | closed-union | LOW | manual | No insrc_guide tool, guide.get/guide.list IPC, or guide-sections reader exists yet in the codebase — sc2 is net-new. | Confirmed net-new: grep across src/ finds NO insrc_guide, NO 'guide.get'/'guide.list' IPC, and NO readWorkflowGuide/listWorkflowGuides/guide-sections — every match is in the epic's own docs. sc2 is entirely new work. | No change — capability-absence claim resolves. |
| contract | cross-artifact | LOW | manual | insrc_guide is registered via the s1 registerAndRecord recorder in buildInsrcMcpServer (shipped in S001), so being phaseless it also lands in the insrc_schema registry. | Confirmed: S001 shipped buildInsrcMcpServerWithRegistry (src/mcp/server.ts:185) + the registerAndRecord recorder (206/223), so registering insrc_guide via registerAndRecord (phaseless) automatically lands it in the insrc_schema registry — the cross-story reuse the LLD relies on holds. | No change — cross-artifact trace holds. |
