<!-- insrc:artifact LLD-870ed3dd246225f4-s3 -->

# LLD: E20260731870ed3dd:S003

**Epic:** `documentation-generation-framework-docgen-produces-self`
**HLD base run:** `wf-1785421889464-2ayzlc`
**HLD effective hash:** `cb5b27744db2...`

## HLD context

**Framework:** IR is the hard boundary between graph-derived and LLM-narrated content; cross-cutting failure/empty/truncation reporting is one shared outcome envelope; registry-enumeration gives automatic tool/IPC/MCP parity; both the inline renderer and the D2/Graphviz fallback assemble into the identical single-file shell extending loadMermaidCdnMeta / RenderedArtifactHtml.
**Rollout phase:** Phase B — Structural extractors (component/dependency + call-sequence)
**Consumes:** `sc1` (DocumentIR), `sc2` (DocTypeRegistration), `sc3` (RenderedDocumentShell), `sc4` (DocGenOutcome)

## Contract details

**Surface level:** internal

### `CallGraphReader`

```typescript
interface CallGraphReader { revision(repoRoot: string): Promise<string | undefined>; resolveEntryPoint(scope: CallSequenceScope): Promise<CallFrameRef | undefined>; calleesOf(entityId: string): Promise<readonly CallFrameRef[]> }
```

**Parameters:**
- `revision: (repoRoot: string) => Promise<string | undefined>` — Pinned index revision (undefined when the repo is not 'ready'); same source as s1/s2 readers (listRepos).
- `resolveEntryPoint: (scope: CallSequenceScope) => Promise<CallFrameRef | undefined>` — Resolve the entry-point symbol to a function/method entity via findEntitiesByName; undefined when not indexed (ac4).
- `calleesOf: (entityId: string) => Promise<readonly CallFrameRef[]>` — 1-hop CALLS successors in recorded edge order via outNeighbors(u64,{kindFilter:['CALLS']}) + entityIdsByU64s; resolved to name+file+startLine (ac1).

**Returns:** `CallGraphReader` — Injected daemon-side read seam; a fake in tests, graph-backed in production (k2). Traversal/cycle/depth logic is NOT in the reader — only raw reads.

**Preconditions:**
- Bound to the daemon graph layer (k2) or a test fake.

**Postconditions:**
- Performs only reads; never traverses or mutates.

### `buildCallSequenceIR`

```typescript
function buildCallSequenceIR(walk: CallWalk, revision: string, scopeDescription: string): DocumentIR
```

**Parameters:**
- `walk: CallWalk` — The completed bounded-DFS result: ordered frames, ordered steps, per-step cycle-repeat flags, truncated frame ids, depthUsed.
- `revision: string` — Pinned index revision -> generatedAtRevision (determinism).
- `scopeDescription: string` — Human-readable label for the IR + rendered title.

**Returns:** `DocumentIR` — Derived-only IR: one 'call-frame' node per distinct visited entity (label 'name (file:line)', entityId citation); one 'calls' edge per step in visitation order; cycle-repeat steps kept as marked 'calls' edges to the existing frame (ac2); each truncated frame gets a derived 'truncation' marker node stating depthUsed (ac3). narrated.sections=[].

**Preconditions:**
- Pure: no graph reads; the walk is fully materialized by the DFS in makeExtract.

**Postconditions:**
- Same walk -> deep-equal IR (determinism).
- Every node/edge graph-backed with an entityId citation (k11); no fabricated frames.
- Cycle-repeat + truncation are DERIVED, not narrated (k8).

### `makeExtract`

```typescript
function makeExtract(reader: CallGraphReader): (input: Record<string, unknown>) => Promise<DocGenOutcome<DocumentIR>>
```

**Parameters:**
- `reader: CallGraphReader` — Injected graph read-seam.

**Returns:** `(input) => Promise<DocGenOutcome<DocumentIR>>` — Parses scope (repo + symbol + optional maxDepth), resolves the entry point, runs a bounded DFS over calleesOf with a visited set (termination, ac2), materializes the CallWalk, returns ok(buildCallSequenceIR(...)) or a typed sc4 failure.

**Errors:**
- `DocGenOutcome 'not-found'` when resolveEntryPoint returns undefined (ac4).
- `DocGenOutcome 'source-not-ready'` when reader.revision returns undefined.
- `DocGenOutcome 'empty-scope'` when input has no non-empty 'repo' or 'symbol'.

**Preconditions:**
- maxDepth defaults to a fixed bound (e.g. 12); the DFS never exceeds it (termination + ac3).

**Postconditions:**
- Depth-truncation returns ok(IR-with-marker), NOT terminal sc4 'truncated', so the partial doc renders with the truncation stated (ac3); sc4 'truncated' stays available but unused by s3.
- Cycles/recursion terminate via the visited set and are shown as repetition (ac2).

### `callSequenceRegistration`

```typescript
function callSequenceRegistration(reader: CallGraphReader): DocTypeRegistration
```

**Parameters:**
- `reader: CallGraphReader` — The graph read-seam bound into extract().

**Returns:** `DocTypeRegistration` — The sc2 registration for docType 'call-sequence': capability + CALL_SEQUENCE_INPUT_SCHEMA (repo + symbol + optional maxDepth) + bound extract().

**Preconditions:**
- Registered once into docgenRegistry as the 3rd doc type, alongside type-structure (s1) + component-dependency (s2).

**Postconditions:**
- Enumerable via registry.list() -> automatic tool/IPC/MCP parity (k4).

### `documentIRToMermaid`

```typescript
function documentIRToMermaid(ir: DocumentIR): string
```

**Parameters:**
- `ir: DocumentIR` — The derived IR; dispatch on ir.docType.

**Returns:** `string` — Adds a THIRD dispatch branch: 'call-sequence' -> Mermaid 'sequenceDiagram' (participant per call-frame, A->>B per ordered 'calls' edge, Note over target for cycle-repeat + truncation markers). 'component-dependency' -> flowchart (s2); other -> classDiagram (s1) — both byte-unchanged.

**Preconditions:**
- Node aliases follow node order; labels escaped.

**Postconditions:**
- Pure + deterministic; assembleShell reused unchanged (sc3 offline shell). s1/s2 output byte-identical.

## Data model changes

### `CallWalk (s3-internal traversal result)` — new

The bounded-DFS output the pure builder consumes: { entry: CallFrameRef; frames: CallFrameRef[]; steps: {from,to,repeat}[] (ordered; repeat=true when 'to' was already on the visited path — ac2); truncatedFrameIds: string[] (cut at maxDepth — ac3); depthUsed: number }. CallFrameRef = { entityId, name, file, startLine }. Private to s3.

**Call sites:**
- `src/docgen/extract/call-sequence.ts (new)`
- `src/docgen/extract/call-graph-reader.ts (new)`

### `DocumentIR (call-sequence instance)` — invariant-change

s3 populates sc1 with docType 'call-sequence': 'call-frame' nodes + derived 'truncation' marker nodes; 'calls' edges with cycle-repeat steps kept as marked edges to the existing frame. narrated.sections stays empty (k8). No change to the sc1 TYPE — only new kind-string values the open field already permits.

**Call sites:**
- `src/docgen/extract/call-sequence.ts`
- `src/docgen/types.ts (DocumentIR, owned by s1)`

### `sc4 DocGenOutcome usage by s3` — invariant-change

DECISION: s3 uses sc4 'not-found' (ac4), 'source-not-ready', 'empty-scope', and returns ok(IR) even when depth-truncated — depth-truncation is an in-IR derived marker (ac3 requires the partial doc to render). s3 does NOT emit terminal sc4 'truncated'. Non-breaking: no sc4 field added/removed/renamed; the variant stays unused by s3. NO HLD amendment proposed.

**Call sites:**
- `src/docgen/outcome.ts (notFound/sourceNotReady/emptyScope/ok; truncated left unused by s3)`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | Derived-only DocumentIR using sc1's listed 'call-frame' node kind + 'calls' edge kind, plus a derived 'truncation' marker node kind (open string field). narrated.sections=[]; generatedAtRevision pinned. No type change. |
| `sc2` | consumes | callSequenceRegistration -> DocTypeRegistration, registered as the 3rd doc type in src/docgen/index.ts; enumerated by the single registry (k4). extractorInputSchema adds symbol + optional maxDepth. No change to sc2. |
| `sc3` | consumes | Renders through assembleShell unchanged; only a new documentIRToMermaid 'sequenceDiagram' branch is added. Same self-contained offline HTML, inlined runtimes, SVG, zoom/pan (k5/k6). |
| `sc4` | consumes | Uses 'not-found' (ac4), 'source-not-ready', 'empty-scope', and 'ok'. Deliberately does NOT use terminal 'truncated' — depth-truncation is shown in-document via a derived IR marker on ok (ac3). No change to sc4. |

## Error paths

### Error cases

- **The chosen entry-point symbol is not present in the indexed code (ac4).** (recoverable)
  - Detection: reader.resolveEntryPoint(scope) returns undefined because findEntitiesByName yields no 'function'/'method' entity; makeExtract checks if (entry === undefined).
  - Response: Return notFound(symbol); no traversal, no IR.
  - User impact: Told the symbol was not found rather than a fabricated sequence (k11).
- **The repo is registered but not finished indexing.** (recoverable)
  - Detection: reader.revision resolves undefined (status !== 'ready'); makeExtract checks if (revision === undefined).
  - Response: Return sourceNotReady(repo); no partial document.
  - User impact: Retriable once indexing completes.
- **The input lacks a usable repo or entry-point symbol.** (recoverable)
  - Detection: parseScope finds input['repo'] or input['symbol'] not a non-empty string; makeExtract checks if (scope === undefined).
  - Response: Return emptyScope with a 'no repo/symbol' message.
  - User impact: The malformed request is reported.
- **The offline runtime asset is missing from the build output.** (recoverable)
  - Detection: assembleShell's loadRuntime throws on readFile; caught (shared with s1/s2).
  - Response: Return fallbackUnavailable naming copy-assets; never a CDN fetch (k5).
  - User impact: Actionable build-config error, no view-time network.
- **A callee u64 has no resolvable entity id (dangling CALLS edge).** (recoverable)
  - Detection: entityIdsByU64s returns no id for a CALLS neighbor u64, so it is dropped in calleesOf.
  - Response: The dangling call is omitted; the calling frame is still emitted.
  - User impact: Only graph-backed frames appear (k11).

### Edge cases

| Input | Expected |
| :--- | :--- |
| An entry point whose CALLS form a cycle/recursion (ac2). | The visited set stops re-expanding an on-path frame; the repeating call is kept as a repeat=true 'calls' step (Note over target); generation terminates. |
| A call sequence deeper than maxDepth (ac3). | DFS stops at maxDepth; each frame with un-expanded callees is a truncatedFrameId, rendered as a derived 'truncation' marker stating depthUsed, on an ok document. |
| A symbol matching multiple indexed functions/methods. | resolveEntryPoint picks deterministically (stable (file,startLine) order); file:line disambiguates in the header (determinism + ac1). |
| An entry point that calls nothing (leaf). | A valid ok document with one participant and no 'calls' steps — not an error. |
| The same entry point documented twice with no code change. | Deep-equal IR (ordered frames/steps + pinned generatedAtRevision). |
| A frame that calls the same callee twice at the same level. | Two ordered 'calls' steps preserved (sequence multiplicity) — unlike s2's dedupe. |

### Invariants to preserve

- All call-sequence content is derived deterministically from the indexed CALLS graph; the LLM is never in this path (narrated.sections stays empty). [[c9]]
- Graph reads happen inside the daemon via the injected reader; the DFS/build performs no I/O beyond reader calls (k2). [[c10]]
- Every frame and call is graph-backed with an entityId citation — no raw dump, no invented frame; unresolved targets are dropped (k11). [[c10]]

## Test strategy

**Test framework:** `node:test + node:assert/strict, run via npx tsx --test (the repo's existing convention; mirrors type-structure.test.ts + component-dependency.test.ts).`

### Test levels

- **unit** — Prove the pure buildCallSequenceIR core over hand-built CallWalk fixtures — no graph, no daemon.
  - Subjects: `buildCallSequenceIR: frames -> 'call-frame' nodes + ordered 'calls' edges with entityId citations (ac1)`, `a repeat=true step kept as a marked 'calls' edge to the existing frame (ac2), never re-expanded`, `a truncatedFrameId yields a derived 'truncation' marker node stating depthUsed (ac3)`, `repeated calls to the same callee preserve BOTH ordered steps (no dedupe)`, `same walk -> deep-equal IR (determinism); narrated.sections=[]`
  - Fixtures: `Hand-built CallWalk fixtures: linear chain, cycle, depth-truncated frame, leaf, double-call frame`
- **unit** — Prove makeExtract's bounded DFS + outcome routing against an injected fake CallGraphReader (cycle-termination + depth-capping).
  - Subjects: `makeExtract -> 'not-found' when resolveEntryPoint returns undefined (ac4)`, `makeExtract -> 'source-not-ready' / 'empty-scope'`, `makeExtract over a CYCLIC fake reader terminates and marks the repeat step (ac2)`, `makeExtract over a deeper-than-maxDepth fake reader stops at the cap, records truncatedFrameIds + depthUsed, returns ok (ac3)`, `makeExtract drops a dangling callee but keeps the calling frame (k11)`
  - Fixtures: `A fake CallGraphReader with a cyclic adjacency, a deep chain, and a dangling callee; canned revision + entry point`
- **unit** — Prove the new sequenceDiagram render branch without regressing s1/s2.
  - Subjects: `documentIRToMermaid(call-sequence IR) starts with 'sequenceDiagram' + A->>B per ordered 'calls' edge`, `cycle-repeat + truncation markers render as Note over the target`, `type-structure (classDiagram) + component-dependency (flowchart) output stay byte-identical`
  - Fixtures: `A small call-sequence IR with repeat + truncation markers; existing s1/s2 IRs for the byte-identical check`
- **smoke** — Prove the full generateDocument path end-to-end against the live indexed graph.
  - Subjects: `generateDocument('call-sequence', {repo, symbol, maxDepth}) -> ok shell with a sequenceDiagram, entity-cited`, `rendered HTML is a single self-contained file, no <script src=, states depth/truncation when the cap is hit`
  - Fixtures: `The insrc repo indexed + 'ready'; a known real entry-point symbol with non-trivial fan-out`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `buildCallSequenceIR: frames -> 'call-frame' nodes + ordered 'calls' edges with citations`, `documentIRToMermaid emits sequenceDiagram A->>B in order`, `smoke: entity-cited live call sequence, every step a real CALLS relation` |
| `ac2` | `buildCallSequenceIR: repeat step kept + marked, not re-expanded`, `makeExtract over a cyclic fake reader terminates and marks repetition`, `documentIRToMermaid renders the cycle repeat as a Note` |
| `ac3` | `buildCallSequenceIR: truncatedFrameId -> derived 'truncation' marker stating depthUsed`, `makeExtract over a deeper-than-maxDepth reader stops + returns ok(IR-with-marker)`, `smoke: a depth-capped live document states the truncation point + depth used` |
| `ac4` | `makeExtract -> 'not-found' when resolveEntryPoint returns undefined (no fabricated sequence)` |

## Alternatives considered

### a1: Depth-limited DFS + sequenceDiagram + in-IR derived truncation/cycle markers — **CHOSEN**

Bounded DFS over CALLS from the resolved entry point; render as a Mermaid sequenceDiagram; cycle-repetition and depth-truncation are DERIVED marker nodes/edges inside the ok IR; sc4 not-found for a missing entry point.



### a2: Depth-limited DFS + reuse s2's flowchart call-tree + in-IR markers

Same DFS + markers, but render as a flowchart call-tree instead of a sequenceDiagram.



**Rejected because:** Only PARTIAL on ac1 (a flowchart loses call ORDER, which ac1 requires) and ac2 (a cycle reads as an ordinary back-edge, weakening 'shown as such'). k3 (accuracy over cost) tips against the small shell saving.

### a3: Literal sc4 terminal outcomes for truncation (no in-IR marker)

Depth-truncation returns the terminal sc4 'truncated' outcome and cycles are silently collapsed.



**Rejected because:** Violates ac3 (the terminal 'truncated' carries no shell -> NO document on truncation) and ac2 (silent cycle collapse hides repetition). Contract-literal but requirement-breaking.

## Citations

- **[[c1]]** `code` `src/db/graph/edges.ts:87 outNeighbors + src/shared/types.ts:532 CALLS RelationKind + src/db/search.ts:193 findCallees — the CALLS traversal primitives`
- **[[c2]]** `code` `src/db/entities.ts:578 findEntitiesByName + :553 getEntity + src/shared/types.ts:519-520 'function'/'method' kinds — entry-point resolution (ac4)`
- **[[c3]]** `code` `src/shared/types.ts:556 Entity.startLine + name + file — participant identity for ac1 labels/citations`
- **[[c4]]** `code` `src/docgen/outcome.ts:46-47 notFound/truncated constructors + sc4 DocGenOutcome variants (ok/empty-scope/not-found/source-not-ready)`
- **[[c5]]** `code` `src/docgen/extract/type-structure.ts + component-dependency.ts + render/shell.ts + index.ts — the s1/s2 extractor+reader+shell-dispatch pattern s3 extends`
- **[[c6]]** `code` `src/assets/docgen/mermaid.min.js — vendored Mermaid 10.9.1 supports 'sequenceDiagram' (the a1 render form)`
- **[[c7]]** `code` `src/db/graph/traversal.ts:134 transitiveClosure — rejected as unbounded + cycle-collapsing; s3 needs its own bounded DFS`
- **[[c9]]** `convention` `HLD assumption c9 (k8): structural content derived deterministically from the indexed graph, LLM confined to narrative`
- **[[c10]]** `convention` `HLD assumption c10 (k2/k11): daemon owns DB access; no raw dumps, every frame/call graph-backed`
- **[[c8]]** `step-output` `s8 checklist.verify — all 18 items passed (cd1-3, dm1-2, int1-2, ep1-3, ts1-2, mg1-2, alt1-2, sbdry1-4)`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 9 LOW** · model `client` · reviewed 2026-07-31T05:30:18.711Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| cl1 | citation | LOW | manual | outNeighbors exists in src/db/graph/edges.ts and accepts a kindFilter option (used with ['CALLS']), and CALLS is a RelationKind in src/shared/types.ts. | outNeighbors at edges.ts:87; kindFilter option + 'CALLS' RelationKind both present. The CALLS traversal primitive the design leans on exists. | none — verified sound |
| cl2 | citation | LOW | manual | findCallees is a real domain wrapper (1-hop CALLS successors) in src/db/search.ts. | findCallees at search.ts:193 (1-hop CALLS successors) exists as cited. | none — verified sound |
| cl3 | citation | LOW | manual | findEntitiesByName exists in src/db/entities.ts for resolving an entry-point symbol (ac4), and getEntity exists there too. | findEntitiesByName:578, getEntity, entityIdsByU64s, entityU64ForId all exist in entities.ts — entry-point resolution (ac4) + u64 mapping are real. | none — verified sound |
| cl4 | citation | LOW | manual | 'function' and 'method' are valid EntityKind values in src/shared/types.ts (the entry-point kinds), and Entity carries startLine. | 'function'/'method' EntityKind values + Entity.startLine present in types.ts — participant identity (ac1) is graph-backed. | none — verified sound |
| cl5 | citation | LOW | manual | The sc4 DocGenOutcome constructors notFound/truncated/sourceNotReady/emptyScope/ok exist in src/docgen/outcome.ts. | sc4 constructors notFound, truncated, sourceNotReady, emptyScope all exported from outcome.ts — the outcome variants s3 routes to exist. | none — verified sound |
| cl6 | citation | LOW | manual | documentIRToMermaid in src/docgen/render/shell.ts currently dispatches classDiagram (type-structure) vs flowchart (component-dependency); s3 adds a third sequenceDiagram branch. | documentIRToMermaid at shell.ts:111 with flowchart LR + classDiagram branches present — s3's third sequenceDiagram branch extends a real dispatch. | none — verified sound |
| cl7 | external-contract | LOW | manual | The vendored Mermaid runtime (src/assets/docgen/mermaid.min.js) supports 'sequenceDiagram', so the a1 render form is available offline. | 'sequenceDiagram' appears in the vendored mermaid.min.js (11 matches) — the a1 render form is available offline. | none — verified sound |
| cl8 | citation | LOW | manual | transitiveClosure exists in src/db/graph/traversal.ts (correctly rejected by the design as unbounded/cycle-collapsing in favor of a bounded DFS). | transitiveClosure at traversal.ts:134 exists; the design correctly rejects it (unbounded/cycle-collapsing) in favor of a bounded DFS — a sound, evidence-based rejection. | none — verified sound |
| cl9 | semantic | LOW | manual | sc1 DocumentIR's IrNode.kind and IrEdge.kind are open string fields already listing 'call-frame' and 'calls', so s3's new kind values need no type change. | types.ts has interface IrNode/IrEdge with open string kind fields and already references 'call-frame'; s3's new kind values need no type change. | none — verified sound |
