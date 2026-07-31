<!-- insrc:artifact LLD-870ed3dd246225f4-s2 -->

# LLD: E20260731870ed3dd:S002

**Epic:** `documentation-generation-framework-docgen-produces-self`
**HLD base run:** `wf-1785421889464-2ayzlc`
**HLD effective hash:** `cb5b27744db2...`

## HLD context

**Framework:** Adopts a1 as the core architecture: an Intermediate Representation (IR) is the hard boundary between graph-derived content and LLM-narrated content, with a discriminated provenance flag on every IR node/edge/section so no runtime can blur the two. Cross-cutting failure/empty/truncation reporting is implemented once as a shared outcome envelope rather than per-story. a2's registry-enumeration idea is grafted in as an additive registration surface over the IR extractors (not a competing architecture), giving automatic tool/IPC/MCP parity and capability listing for one extra registry module. a3's delivery layer is adopted underneath: both the primary inline renderer and the D2/Graphviz subprocess fallback assemble into the identical single-file shell, which extends (rather than parallels) the existing loadMermaidCdnMeta and RenderedArtifactHtml primitives.
**Rollout phase:** Phase B — Structural extractors (component/dependency + call-sequence)
**Consumes:** `sc1` (DocumentIR), `sc2` (DocTypeRegistration), `sc3` (RenderedDocumentShell)

## Contract details

**Surface level:** internal

### `componentKey`

```typescript
function componentKey(fileAbs: string, repoRoot: string, path: string | undefined): string
```

**Parameters:**
- `fileAbs: string` — Absolute path of a file entity (Entity.file is absolute).
- `repoRoot: string` — Registered repo root; combined with path to form the scope base.
- `path: string | undefined` _(optional)_ — Repo-relative scope prefix; when absent the base is the repo root.

**Returns:** `string` — The component the file belongs to: the first path segment under join(repoRoot, path), or the bare relative path when the file sits directly in the scope base.

**Preconditions:**
- fileAbs should lie under the scope base; if it does not, the raw relative remainder is used as the key (defensive).

**Postconditions:**
- Deterministic pure function of its inputs (no I/O).

### `buildComponentDependencyIR`

```typescript
function buildComponentDependencyIR(files: readonly FileEntityLite[], imports: readonly FileImportEdge[], repoRoot: string, path: string | undefined, revision: string, scopeDescription: string): DocumentIR
```

**Parameters:**
- `files: readonly FileEntityLite[]` — In-scope file entities ({id, absolute file}).
- `imports: readonly FileImportEdge[]` — Resolved file->file IMPORTS edges among the in-scope files.
- `repoRoot: string` — Repo root for componentKey aggregation.
- `path: string | undefined` _(optional)_ — Scope prefix for componentKey aggregation.
- `revision: string` — Pinned graph index revision written to generatedAtRevision (determinism, ac2).
- `scopeDescription: string` — Human-readable scope label carried into the IR + the rendered title.

**Returns:** `DocumentIR` — A derived-only DocumentIR: one IrNode {kind:'component'} per distinct component, one deduped IrEdge {kind:'depends-on'} per cross-component import, narrated.sections=[].

**Preconditions:**
- Pure: performs no graph reads; all data arrives via parameters.

**Postconditions:**
- Same inputs -> deep-equal output (ac2).
- Intra-component and out-of-scope (unresolved-endpoint) imports produce no edge.
- Every component that owns a file is emitted as a node even with no edge in or out (ac3).
- Cross-component edges are deduped by (from,to).

### `makeExtract`

```typescript
function makeExtract(reader: ComponentGraphReader): (input: Record<string, unknown>) => Promise<DocGenOutcome<DocumentIR>>
```

**Parameters:**
- `reader: ComponentGraphReader` — Injected graph read-seam (revision / filesInScope / importEdges); a fake in tests, the graph-backed reader in production.

**Returns:** `(input) => Promise<DocGenOutcome<DocumentIR>>` — The bound extractor used in the DocTypeRegistration: parses scope, reads, and returns an outcome-wrapped IR.

**Errors:**
- `DocGenOutcome 'empty-scope'` when input has no non-empty 'repo' string, or no files are found in scope.
- `DocGenOutcome 'source-not-ready'` when reader.revision returns undefined (repo not finished indexing).

**Preconditions:**
- reader is bound to the daemon graph layer (k2) or a test fake.

**Postconditions:**
- On success returns ok(DocumentIR); never throws for the modeled failure cases — they are returned as typed outcomes (observability).

### `componentDependencyRegistration`

```typescript
function componentDependencyRegistration(reader: ComponentGraphReader): DocTypeRegistration
```

**Parameters:**
- `reader: ComponentGraphReader` — The graph read-seam bound into the registration's extract().

**Returns:** `DocTypeRegistration` — The sc2 registration for docType 'component-dependency': capability summary + COMPONENT_DEPENDENCY_INPUT_SCHEMA + bound extract().

**Preconditions:**
- Registered exactly once into the process-wide docgenRegistry alongside s1's type-structure registration.

**Postconditions:**
- Enumerable via registry.list() -> automatic tool/IPC/MCP parity (k4).

### `documentIRToMermaid`

```typescript
function documentIRToMermaid(ir: DocumentIR): string
```

**Parameters:**
- `ir: DocumentIR` — The derived IR to render; dispatch is on ir.docType.

**Returns:** `string` — Mermaid source: a 'flowchart LR' with n<i>[label] boxes and 'from --> to' dependency arrows for docType 'component-dependency'; the existing 'classDiagram' for every other docType (type-structure output byte-unchanged).

**Preconditions:**
- Node aliases (n0, n1, …) follow node order so entity ids never clash with Mermaid identifier syntax.

**Postconditions:**
- Pure + deterministic; consumed unchanged by assembleShell to produce the sc3 RenderedDocumentShell.

## Data model changes

### `DocumentIR (component-dependency instance)` — invariant-change

s2 introduces the 'component-dependency' docType instance of sc1: derived.nodes carry kind='component' (label = componentKey), derived.edges carry kind='depends-on', narrated.sections is always empty. No structural change to the sc1 type itself — s2 only populates it. NOTE: sc1's HLD sketch listed a 'composes' edge kind; s2 does not emit it because the code graph records no composition edge — only IMPORTS-derived depends-on. This is a documented back-flow note, not a contract change.

**Call sites:**
- `src/docgen/extract/component-dependency.ts (buildComponentDependencyIR)`
- `src/docgen/types.ts (DocumentIR definition, owned by s1)`

### `FileEntityLite / FileImportEdge / ComponentScope` — new

Three s2-internal read-seam DTOs: FileEntityLite {id, file:absolute}, FileImportEdge {fromFileId, toFileId}, ComponentScope {repoRoot, path?}. They decouple the pure aggregation core from the daemon graph layer so the core is testable with fixtures.

**Call sites:**
- `src/docgen/extract/component-dependency.ts`
- `src/docgen/extract/component-graph-reader.ts`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | Produces a valid derived-only DocumentIR (narrated.sections=[]); node/edge kinds ('component','depends-on') fall within sc1's open kind strings. Populates generatedAtRevision from the reader for the ac2 determinism guarantee. Consumes the as-built structural derived/narrated partition (not the HLD's per-item provenance flag). |
| `sc2` | consumes | Plugs in via componentDependencyRegistration -> DocTypeRegistration and is register()'d as the 2nd doc type in src/docgen/index.ts, so it is enumerated by the single registry that drives tool/IPC/MCP surfaces (k4). No change to sc2. |
| `sc3` | consumes | Renders through the shared assembleShell unchanged; the only extension is documentIRToMermaid dispatching a flowchart body for this docType. The resulting RenderedDocumentShell (single self-contained offline HTML, inlined runtimes, SVG, zoom/pan) satisfies ac4 identically to s1. |

## Error paths

### Error cases

- **The repo is registered but has not finished indexing (no pinned revision).** (recoverable)
  - Detection: reader.revision(repoRoot) resolves undefined because listRepos finds the repo with status !== 'ready'; makeExtract checks if (revision === undefined).
  - Response: Return DocGenOutcome 'source-not-ready' naming the repo; no IR is built and no partial document is written.
  - User impact: Caller is told the source isn't ready yet rather than getting an empty or wrong diagram; retriable once indexing completes.
- **The scope resolves to zero in-scope files (empty repo, or a path prefix that matches nothing).** (recoverable)
  - Detection: reader.filesInScope returns an empty array; makeExtract checks if (files.length === 0).
  - Response: Return DocGenOutcome 'empty-scope' naming the scope location; no nodes/edges fabricated.
  - User impact: Caller sees an explicit empty-scope reason instead of a blank diagram; fix by choosing a populated scope.
- **The input carries no usable repo (missing or empty 'repo').** (recoverable)
  - Detection: parseScope returns undefined because input['repo'] is not a non-empty string; makeExtract checks if (scope === undefined).
  - Response: Return DocGenOutcome 'empty-scope' with a 'no repo in scope input' message.
  - User impact: Caller is told the request was malformed rather than silently getting nothing.
- **An in-scope file imports an external/unresolved module (bare package or unindexed path).** (recoverable)
  - Detection: In the reader, entityIdsByU64s has no id for the neighbor u64, so the edge is skipped; in the pure core, componentByFileId.get(toFileId) is undefined for any endpoint not in scope.
  - Response: The import produces no depends-on edge (silently dropped as out-of-scope); the source component is still emitted as a node.
  - User impact: External dependencies never pollute an intra-repo module picture; nothing is invented (k11).
- **The offline runtime asset is missing from the build output (e.g. copy-assets did not stage mermaid/svg-pan-zoom).** (recoverable)
  - Detection: assembleShell's loadRuntime throws on readFile; caught and mapped.
  - Response: Return DocGenOutcome 'fallback-unavailable' naming the copy-assets ship step; never falls back to a CDN fetch (k5).
  - User impact: Caller gets an actionable build-config error instead of a document that would try to reach the network at view time.

### Edge cases

| Input | Expected |
| :--- | :--- |
| A component that neither imports nor is imported by any other in-scope component (isolated module). | It is emitted as an edge-less IrNode and rendered as a lone flowchart box (ac3) — never dropped. |
| Two or more files in component A each import files in component B. | A single deduped A->B depends-on edge (dedupe by (from,to)), not one per file pair. |
| A file imports another file in the SAME component (intra-directory import). | No edge (a===b is skipped); the component still appears as a node. |
| A file that sits directly in the scope base (e.g. src/config.ts under scope 'src'). | componentKey returns the bare filename ('config.ts') as its own single-file component node. |
| A component label containing Mermaid-hostile characters (quotes, angle brackets, newlines). | escapeLabel strips quotes/backticks/newlines for the Mermaid alias label, and escapeHtml escapes the whole Mermaid source in the <pre>; the browser decodes it before Mermaid reads textContent, so the diagram still renders (ac4). |
| Whole-repo scope (no path) vs a drilled-in subtree (path prefix). | The same extractor serves both; componentKey is computed relative to the scope base, so component granularity shifts to the next segment under the chosen path. |

### Invariants to preserve

- All structural content is derived deterministically from the indexed graph (file entities + IMPORTS edges); the LLM is never in the component/dependency path (narrated.sections stays empty). [[c9]]
- Graph reads happen inside the daemon via the injected reader; the pure core performs no I/O, so callers reach the data only through the daemon (over IPC for CLI/MCP/IDE). [[c10]]
- Every path and component shown is graph-backed — no raw file dump and no invented node or edge; out-of-scope/unresolved endpoints are dropped rather than guessed. [[c10]]

## Test strategy

**Test framework:** `node:test + node:assert/strict, run via npx tsx --test (the repo's existing convention; mirrors src/docgen/extract/__tests__/type-structure.test.ts).`

### Test levels

- **unit** — Prove the pure aggregation core and the Mermaid flowchart emission in isolation, with fixtures — no graph, no daemon.
  - Subjects: `componentKey (segment-under-scope logic, bare-file fallback)`, `buildComponentDependencyIR (cross-module edge, intra-component drop, out-of-scope drop, isolated-node, dedupe, determinism deep-equal)`, `documentIRToMermaid (flowchart LR body, n<i>[label] boxes, from --> to arrows, no classDiagram)`
  - Fixtures: `Hand-built FileEntityLite[] under a synthetic /repo root (src/db/*, src/config/*, src/lonely/*)`, `Hand-built FileImportEdge[] covering cross-module, intra-module, duplicate, and out-of-scope endpoints`
- **unit** — Prove makeExtract's outcome routing (the daemon-facing extractor) against an injected fake ComponentGraphReader without a real Ollama/graph.
  - Subjects: `makeExtract -> 'source-not-ready' when reader.revision is undefined`, `makeExtract -> 'empty-scope' when filesInScope is empty`, `makeExtract -> ok(DocumentIR) with the expected edge count on a populated fake reader`
  - Fixtures: `A reader() helper returning canned {revision, files, imports} (already in component-dependency.test.ts)`
- **smoke** — Prove the full generateDocument path end-to-end against the live indexed graph produces a real, offline, edge-bearing document (the guard against a green-unit / broken-integration gap).
  - Subjects: `generateDocument('component-dependency', {repo, path:'src'}) -> ok shell with component nodes + depends-on edges`, `The rendered HTML contains the flowchart arrows (as escaped --&gt;, decoded by the browser) and no <script src= (offline)`
  - Fixtures: `The insrc repo itself, indexed and 'ready' in the daemon registry`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `buildComponentDependencyIR: files -> component nodes; cross-module import -> depends-on edge`, `documentIRToMermaid renders a component IR as a FLOWCHART with --> arrows`, `smoke: generateDocument on live graph yields 15 components + 44 depends-on edges, each traceable to a real IMPORTS relation` |
| `ac2` | `same input -> deep-equal IR (determinism)`, `makeExtract ok-case returns a DocumentIR with generatedAtRevision pinned from the reader` |
| `ac3` | `an isolated component (no imports in/out) is still a node (ac3)` |
| `ac4` | `smoke: rendered HTML is a single self-contained file with no <script src= (runtimes inlined) and SVG zoom/pan wired via assembleShell — shared with s1's shell tests which assert the inlined-runtime / svg / zoom-pan shell shape` |

## Alternatives considered

### a1: File-import aggregation to directory-level components (AS BUILT) — **CHOSEN**

A component = the first path segment under the scope base; a component A depends-on B iff any file in A has a file->file IMPORTS edge to a file in B.



### a2: Module-entity-level components (use indexed 'module' entities directly)

Skip directory aggregation; treat each indexed module/package entity as a node and read module->module dependency edges directly.



**Rejected because:** Fails ac1 (violates): the graph records no intra-repo module->module dependency edges — file->file IMPORTS is the substrate and repo->package DEPENDS_ON is external-only — so local components would draw an edgeless diagram or re-derive from file imports anyway. Would also require an amendment to the shipped contract.

### a3: Per-file nodes with import edges (no aggregation)

Every source file is its own node; every file->file IMPORTS edge is drawn directly, no directory collapse.



**Rejected because:** Violates ac4: at repo scope the file-level graph is far too large for a single legible SVG and immediately trips the s5 oversized-fallback path; answers 'which file imports which' (partial ac1) not the story's 'how do modules depend on one another'.

## Citations

- **[[c1]]** `code` `src/docgen/extract/component-dependency.ts (commit 77f4296) — componentKey, buildComponentDependencyIR, makeExtract, componentDependencyRegistration, the read-seam DTOs, COMPONENT_DEPENDENCY_INPUT_SCHEMA`
- **[[c2]]** `code` `src/docgen/extract/component-graph-reader.ts — graph-backed ComponentGraphReader (listEntitiesByKinds ['file'] + outNeighbors IMPORTS + entityIdsByU64s; revision from listRepos)`
- **[[c3]]** `code` `src/docgen/render/shell.ts — documentIRToMermaid docType dispatch (toFlowchart / toClassDiagram) + assembleShell; src/docgen/index.ts registration of the 2nd doc type`
- **[[c4]]** `code` `src/docgen/types.ts — DocumentIR structural derived/narrated partition (sc1 as built by s1); src/docgen/README.md back-flow notes`
- **[[c5]]** `code` `src/docgen/extract/__tests__/component-dependency.test.ts — the 9 unit tests (componentKey, aggregation, dedupe, determinism, isolated-node, flowchart render, outcome routing)`
- **[[c9]]** `convention` `HLD assumption c9 (k8): structural diagram content derived deterministically from the indexed graph, LLM confined to narrative`
- **[[c10]]** `convention` `HLD assumption c10 (k2/k11): daemon owns DB access; no raw file dumps, every path/symbol graph-backed`
- **[[c6]]** `step-output` `s8 checklist.verify — all 18 items passed (cd1-3, dm1-2, int1-2, ep1-3, ts1-2, mg1-2, alt1-2, sbdry1-4)`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 9 LOW** · model `client` · reviewed 2026-07-31T05:00:18.271Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| cl1 | citation | LOW | manual | src/docgen/extract/component-dependency.ts exports componentKey, buildComponentDependencyIR, makeExtract, componentDependencyRegistration, and COMPONENT_DEPENDENCY_DOCTYPE. | component-dependency.ts: componentKey:60, buildComponentDependencyIR:74, makeExtract:128, componentDependencyRegistration:150 all resolve as exported functions; COMPONENT_DEPENDENCY_DOCTYPE present. | none — verified sound |
| cl2 | semantic | LOW | manual | buildComponentDependencyIR emits a derived-only DocumentIR: IrNode kind 'component', IrEdge kind 'depends-on', and empty narrated.sections. | component-dependency.ts:87 sets kind:'component', :99 pushes kind:'depends-on', :106 narrated:{sections:[]}. Derived-only IR confirmed. | none — verified sound |
| cl3 | semantic | LOW | manual | buildComponentDependencyIR dedupes cross-component edges and skips intra-component (a===b) imports. | component-dependency.ts:95 `if (a === undefined \|\| b === undefined \|\| a === b) continue` and the seen.has/seen.add dedupe set are present in the file. | none — verified sound |
| cl4 | citation | LOW | manual | The graph-backed ComponentGraphReader in component-graph-reader.ts uses listEntitiesByKinds(['file']), outNeighbors with IMPORTS kindFilter, entityIdsByU64s, and reads revision from listRepos. | component-graph-reader.ts:18 imports listEntitiesByKinds/entityU64ForId/entityIdsByU64s; :45 calls listEntitiesByKinds(undefined, FILE_KINDS, {repo}); :57 outNeighbors(u64,{kindFilter:['IMPORTS']}); listRepos used for revision. | none — verified sound |
| cl5 | citation | LOW | manual | documentIRToMermaid in shell.ts dispatches on docType: a flowchart for 'component-dependency' and classDiagram otherwise. | shell.ts:111 documentIRToMermaid dispatches; :114 comment 'component-dependency -> flowchart; every other docType -> classDiagram'; :92 'flowchart LR'; :76 'classDiagram'. | none — verified sound |
| cl6 | citation | LOW | manual | src/docgen/index.ts registers componentDependencyRegistration(componentGraphReader) as a second doc type alongside typeStructureRegistration. | index.ts:34 registers typeStructureRegistration(graphTypeReader) // s1 and :35 componentDependencyRegistration(componentGraphReader) // s2 — the 2nd doc type as claimed. | none — verified sound |
| cl7 | inventory | LOW | manual | component-dependency.test.ts contains the s2 unit tests (componentKey, aggregation, dedupe, determinism, isolated-node, flowchart render, extract outcomes). | component-dependency.test.ts contains 9 top-level test() cases covering componentKey, aggregation, intra/out-of-scope drop, isolated-node, dedupe, determinism, flowchart render, and extract outcomes — matching the LLD's test strategy. | none — verified sound |
| cl8 | semantic | LOW | manual | makeExtract returns typed DocGenOutcome failures ('source-not-ready' when revision is undefined, 'empty-scope' when no repo or no files) rather than throwing. | component-dependency.ts:135 returns sourceNotReady(...) when revision undefined; emptyScope imported and returned for no-repo/no-files; outcomes are returned, not thrown. | none — verified sound |
| cl9 | semantic | LOW | manual | assembleShell in shell.ts returns fallback-unavailable when the offline runtime asset is missing and never references a CDN script src. | shell.ts:175 returns fallbackUnavailable on the loadRuntime (:41) catch; the HTML uses inline <script> blocks with no external src — offline guarantee holds. | none — verified sound |
