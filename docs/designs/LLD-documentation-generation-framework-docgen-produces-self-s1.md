<!-- insrc:artifact LLD-870ed3dd246225f4-s1 -->

# LLD: E20260730870ed3dd:S001

**Epic:** `documentation-generation-framework-docgen-produces-self`
**HLD base run:** `wf-1785421889464-2ayzlc`
**HLD effective hash:** `cb5b27744db2...`

## HLD context

**Framework:** Adopts a1 as the core architecture: an Intermediate Representation (IR) is the hard boundary between graph-derived content and LLM-narrated content, with a discriminated provenance flag on every IR node/edge/section so no runtime can blur the two. Cross-cutting failure/empty/truncation reporting is implemented once as a shared outcome envelope rather than per-story. a2's registry-enumeration idea is grafted in as an additive registration surface over the IR extractors (not a competing architecture), giving automatic tool/IPC/MCP parity and capability listing for one extra registry module. a3's delivery layer is adopted underneath: both the primary inline renderer and the D2/Graphviz subprocess fallback assemble into the identical single-file shell, which extends (rather than parallels) the existing `loadMermaidCdnMeta` and `RenderedArtifactHtml` primitives.
**Rollout phase:** Phase A — Foundational contracts & walking skeleton
**Owns:** `sc1` (DocumentIR), `sc2` (DocTypeRegistration), `sc3` (RenderedDocumentShell), `sc4` (DocGenOutcome)

## Contract details

**Surface level:** internal-shared

### `DocTypeRegistry.register`

```typescript
register(entry: DocTypeRegistration): void
```

**Parameters:**
- `entry: DocTypeRegistration` — The full registration record for one document type — docType key, capability description shown verbatim in enumeration on every surface, JSON schema for its scope/entry-point params, and (per the winning alternative a2) the bound extract() implementation itself.

**Returns:** `void` — Registration succeeded; entry is now visible to list() and get() and therefore to the daemon tool registry, the IPC method table, and the MCP tool surface simultaneously (k4).

**Errors:**
- `DuplicateDocTypeError` when An entry with the same entry.docType has already been registered — silent overwrite would let two extractors claim one docType and make the single-source-of-truth guarantee unverifiable.
- `InvalidRegistrationError` when entry.extractorInputSchema is not a valid JSON schema object, or entry.capability.id does not match entry.docType — a malformed record would surface as a broken capability listing on all three surfaces at once.

**Preconditions:**
- Called during daemon startup wiring only, before the first docgen tool/IPC request is served, so the registry is fully populated when any surface enumerates it.
- entry.capability.summary is the exact string every surface will display; no surface re-words it (HLD nonFunctional.observability).

**Postconditions:**
- list() includes entry; get(entry.docType) returns it.
- No second dispatch map exists anywhere: because extract() is bound into the record, resolving a docType to its extractor and resolving it to its capability description are the same lookup — the drift k4 targets is structurally absent.
- In Phase A exactly one entry is registered: the type-structure extractor.

### `DocTypeRegistry.list`

```typescript
list(): DocTypeRegistration[]
```

**Returns:** `DocTypeRegistration[]` — Every registered document type, in registration order. Callers crossing IPC/MCP must project this to the serializable subset (docType + capability + extractorInputSchema) because extract() is a function and does not cross a process boundary — this projection is the explicit cost a2 accepted for binding the extractor into the record.

**Preconditions:**
- Registry bootstrap has completed.

**Postconditions:**
- The returned array is a copy; mutating it does not alter the registry.
- Capability enumeration on the daemon tool surface, the IPC method table, and the MCP tool surface all derive from this one call, so they cannot disagree (k4).

### `DocTypeRegistry.get`

```typescript
get(docType: string): DocTypeRegistration | undefined
```

**Parameters:**
- `docType: string` — The requested document-type key, as supplied by the external caller through the daemon tool or IPC method.

**Returns:** `DocTypeRegistration | undefined` — The registration whose extract() will service the request, or undefined when no such document type exists — which the boundary maps to DocGenOutcome's not-found variant rather than throwing outward.

**Preconditions:**
- docType arrives from an untrusted external caller and is not assumed to be valid.

**Postconditions:**
- This is the single resolution path from an external request to an extractor, which is what makes ac5/k2 checkable at one place: everything downstream of get() runs inside the daemon and only the assembled shell travels back out.

### `DocTypeRegistration.extract`

```typescript
extract(input: Record<string, unknown>): Promise<DocGenOutcome<DocumentIR>>
```

**Parameters:**
- `input: Record<string, unknown>` — The caller's scope/entry-point parameters, already validated against this registration's extractorInputSchema. For the Phase A type-structure extractor this is the repo plus the chosen part of it to document (ac1).

**Returns:** `Promise<DocGenOutcome<DocumentIR>>` — On ok, a DocumentIR whose derived partition holds only graph-read nodes/edges and whose narrated partition is empty for this extractor. On empty-scope, the reason string produced at the exact graph read that yielded zero types — carried outward verbatim rather than re-worded at the boundary (ac6, k11).

**Errors:**
- `DocGenOutcome<'empty-scope'>` when The graph read resolves zero types in the requested scope. Returned as a typed variant, never thrown, so no blank or misleading diagram is reachable and the reason the caller sees is the string logged where it was detected.
- `DocGenOutcome<'source-not-ready'>` when The repo is registered but indexing has not finished, so no pinned revision can be read.
- `UnregisteredRepoError` when input names a repo path absent from the repo registry — propagated from the storage layer per the project's strict registry contract; not modelled as a DocGenOutcome variant because it indicates caller misuse, not a documentable outcome.

**Preconditions:**
- input has been validated against extractorInputSchema before this call; extract() does not re-validate.
- Runs inside the daemon process with direct graph access; no store handle is reachable from the caller (ac5/k2).
- The graph index revision is resolved once at entry and every read in this call uses it, so repeated generation against unchanged code is byte-identical (HLD nonFunctional.durability).

**Postconditions:**
- Every IrNode and IrEdge in the returned IR sits under the derived partition and originates in an EntityRow / edge-props read from src/db/graph/codec.ts — no LLM is on this path (k8).
- DocumentIR.generatedAtRevision is pinned to the concrete revision read at entry.
- This method being part of the registration record — not a separate module-local dispatch map — is the amendment proposed below.

### `DocGenOutcome.flatMap`

```typescript
flatMap<T, U>(outcome: DocGenOutcome<T>, f: (value: T) => DocGenOutcome<U>): DocGenOutcome<U>
```

**Parameters:**
- `outcome: DocGenOutcome<T>` — The upstream outcome — typically the extractor's DocGenOutcome<DocumentIR>.
- `f: (value: T) => DocGenOutcome<U>` — The next stage, itself fallible — e.g. IR to RenderedDocumentShell assembly, which can itself yield truncated or fallback-unavailable.

**Returns:** `DocGenOutcome<U>` — f's outcome when the input was ok; otherwise the original non-ok variant returned unchanged, field for field.

**Preconditions:**
- f is only invoked for the ok arm.

**Postconditions:**
- Non-ok variants short-circuit outward with their payload untouched, so a reason/symbol/depthUsed produced deep in extraction reaches the caller as the same string it was logged with (k11, HLD nonFunctional.observability).
- This is the a3 graft the winning judgment prescribed: it lifts ac6 from partial to satisfied without disturbing a2's IR partition, because the envelope choice is independent of the provenance decision.

### `DocGenOutcome.map`

```typescript
map<T, U>(outcome: DocGenOutcome<T>, f: (value: T) => U): DocGenOutcome<U>
```

**Parameters:**
- `outcome: DocGenOutcome<T>` — The upstream outcome.
- `f: (value: T) => U` — An infallible transform of the ok payload.

**Returns:** `DocGenOutcome<U>` — The ok payload transformed, or the original non-ok variant unchanged.

**Preconditions:**
- f must not throw; fallible stages use flatMap instead.

**Postconditions:**
- Together with flatMap this is the only place outcome variants are handled, so s3's truncated, s5's fallback-unavailable, and s6's not-found are mapped once here rather than re-implemented per story.

### `registerTool`

```typescript
registerTool(tool: Tool): void
```

**Parameters:**
- `tool: Tool` — The single Phase A docgen capability wrapper. Its handler resolves the requested docType through DocTypeRegistry.get, runs extract() and shell assembly entirely daemon-side, and returns only the finished RenderedDocumentShell inside a DocGenOutcome.

**Returns:** `void` — The docgen tool is live on the daemon tool surface.

**Errors:**
- `(as defined by src/daemon/tools/registry.ts:18-39)` when Duplicate tool name or invalid tool definition, per the existing registry's own behaviour — this Story does not change registerTool's error contract.

**Preconditions:**
- DocTypeRegistry bootstrap has already run, so the tool's capability listing projected from list() is non-empty at registration time.
- The s1 usage.example pass found zero existing callers of registerTool (entityId 571a8536c489f3be0c4c7af1f4022aa3), so there is no precedent callsite to align with beyond the signature at src/daemon/tools/registry.ts:18-39 — this Story defines the first one and follows that signature exactly.

**Postconditions:**
- Exactly one daemon tool and one IPC method exist for document generation in Phase A, so ac5/k2 is verifiable by inspecting a single boundary crossing.
- The tool handler never returns a store handle, an EntityRow, or a DocumentIR to the caller — only DocGenOutcome<RenderedDocumentShell>.

### `loadMermaidCdnMeta`

```typescript
loadMermaidCdnMeta(): Promise<MermaidCdnMeta>
```

**Returns:** `Promise<MermaidCdnMeta>` — Metadata for the diagram runtime the shell embeds, including the version string that becomes RenderedDocumentShell.inlinedRuntimeVersion.

**Errors:**
- `DocGenOutcome<'fallback-unavailable'>` when The shipped local runtime asset is missing from the build output, so no self-contained shell can be assembled. Mapped at the assembly stage via flatMap; the remedy string names the copy-assets.mjs ship step.

**Preconditions:**
- Currently defined at src/daemon/artifacts-rpc.ts:308-327 and NOT exported — this Story must export it (or lift it to a shared module) to reuse it from shell assembly rather than standing up parallel plumbing (k10, ac4).
- Its source must resolve to a locally-shipped asset, not a CDN URL, before the offline guarantee in ac2 holds. The s1 concept.resolve pass ranked copy-assets.mjs at 0.486 for the asset-ship duty — below the 0.5 confidence threshold — so this anchor is recorded as a LOW-CONFIDENCE resolution to be verified in build, not treated as settled.
- No import.graph pass was run against src/daemon/artifacts-rpc.ts in the s1 bundle, so the blast radius of exporting/altering this function is unmeasured — carried forward as a gap.

**Postconditions:**
- The assembled html embeds the runtime inline; opening the document makes no request off the machine at view time (ac2).
- Diagram content is emitted as SVG, keeping labels sharp and legible at every zoom level (ac3).

### `decodeEntityRow`

```typescript
decodeEntityRow(raw: Uint8Array): EntityRow
```

**Parameters:**
- `raw: Uint8Array` — The encoded row read from the LMDB graph store. NOTE: the s1 data-model.trace pass confirmed decodeEntityRow exists in src/db/graph/codec.ts paired with encodeEntityRow but did not report its parameter type — the buffer type here is provisional and must be read off codec.ts at implementation time.

**Returns:** `EntityRow` — One indexed entity (src/db/graph/codec.ts:132-160) — the sole source of every type node the extractor emits.

**Errors:**
- `(as defined by src/db/graph/codec.ts)` when Malformed or version-mismatched row encoding; this Story does not change the codec's error contract.

**Preconditions:**
- Read inside the daemon only (ac5/k2).
- Paired with decodeEdgeProps / decodeImportsEdge / decodeCallsEdge for the inheritance and composition edges required by ac1.

**Postconditions:**
- Each decoded row yields at most one IrNode under DocumentIR.derived with provenance implied by its position in the partition — never under narrated.
- Zero decoded rows in scope is the exact point at which empty-scope is raised, with the reason string constructed there (ac6).

## Data model changes

### `DocumentIR` — invariant-change

Per the winning alternative a2, the published flat shape (nodes/edges/sections + a per-item `provenance` flag) is replaced by a provenance-PARTITIONED container: `derived: { nodes: IrNode[]; edges: IrEdge[] }` and `narrated: { sections: IrSection[] }`. The invariant this changes is enforcement location: under the published sketch nothing stops a `provenance: 'narrated'` node from sitting in `nodes` and reaching a diagram, so ac1's operative clause ('every type and every relationship taken from the indexed code rather than restated prose') rests on review. Under the partition it is a type error for s4's LLM prose to be typed into diagram structure — k8 becomes checker-enforced. The per-item `provenance` field is dropped as redundant (position in the container now carries it); `citation` stays on derived items only. `docType`, `scopeDescription`, and `generatedAtRevision` are unchanged. Trade-off accepted and recorded: this forecloses a future legitimately-narrated node/edge without a container change, and it changes a shape s2–s7 were told to consume — a back-flow note to those six stories is REQUIRED and is bundled with the sc4 change below into one pass.

```
-interface IrNode { id; label; kind; provenance: Provenance; citation?; }
-interface IrEdge { id; from; to; kind; provenance: Provenance; citation?; }
-interface IrSection { id; title; provenance: Provenance; narrativeText?; }
-interface DocumentIR { docType; scopeDescription; nodes: IrNode[]; edges: IrEdge[]; sections: IrSection[]; generatedAtRevision; }
+interface IrNode { id: string; label: string; kind: string; citation?: IrCitation | undefined; }
+interface IrEdge { id: string; from: string; to: string; kind: string; citation?: IrCitation | undefined; }
+interface IrSection { id: string; title: string; narrativeText: string; }
+interface DerivedContent { nodes: IrNode[]; edges: IrEdge[]; }
+interface NarratedContent { sections: IrSection[]; }
+interface DocumentIR {
+  docType: string;
+  scopeDescription: string;
+  derived: DerivedContent;   // graph-read only; the diagram is built from THIS and nothing else
+  narrated: NarratedContent; // LLM prose; structurally ineligible for the diagram
+  generatedAtRevision: string;
+}
```

**Call sites:**
- `src/db/graph/codec.ts (EntityRow interface at lines 132-160 plus decodeEntityRow/encodeEntityRow and the EdgeProps union with decodeEdgeProps/decodeImportsEdge/decodeCallsEdge — the only reads that populate `derived`; 11 of the module's 61 exports were selected as extractor-relevant by the s1 data-model.trace pass)`
- `src/daemon/tools/registry.ts (registerTool at lines 18-39 — the boundary that consumes the IR indirectly, never returning it to the caller)`

### `DocTypeRegistration` — field-add

Adds a bound `extract(input: Record<string, unknown>): Promise<DocGenOutcome<DocumentIR>>` member to the published record. This is a2's second win and the subject of the amendment proposal below: with the extractor bound into the registration, resolving a docType to its implementation and resolving it to its capability description are one lookup, so the module-local extractor dispatch map that a1/a3/a4 all keep beside the registry does not exist — the exact drift k4 targets. `docType`, `capability`, and `extractorInputSchema` are unchanged, and `DocTypeRegistry`'s register/list/get signatures are unchanged. Accepted cost: the record stops being plain data, so capability enumeration crossing IPC/MCP must project the serializable subset (docType + capability + extractorInputSchema) before marshalling. In Phase A exactly one registration exists — the type-structure extractor.

```
 interface DocTypeRegistration {
   docType: string;
   capability: DocTypeCapabilityDescription;
   extractorInputSchema: Record<string, unknown>;
+  extract(input: Record<string, unknown>): Promise<DocGenOutcome<DocumentIR>>;
 }
```

**Call sites:**
- `src/daemon/tools/registry.ts (registerTool, lines 18-39 — the docgen tool's handler resolves through DocTypeRegistry.get and invokes the bound extract; the s1 usage.example pass found 0 existing callers of registerTool, so this is the first-ever callsite)`

### `RenderedDocumentShell` — new

Shipped exactly as published — `docType`, `backend: RenderBackend`, `html`, `inlinedRuntimeVersion`, `diagramFormat: 'svg'` (literal, pinning ac3), `supportsZoomPan: true` (literal). Deliberately NOT restructured into a shared-core-plus-backend-union (a4's proposal) because this contract has all six consuming stories and no subprocess renderer exists yet in Phase A to validate a fallback arm; a4's InlinedAssetManifest is deferred to s5 where the backend it describes actually exists. Assembly EXTENDS the two existing primitives rather than paralleling them (k10, ac4): `RenderedArtifactHtml` (src/shared/artifacts.ts:67-70) and its surrounding ArtifactKind / ArtifactOpts / MermaidCdnMeta / TemplateInfo surface supply the single-file document shape, and loadMermaidCdnMeta (src/daemon/artifacts-rpc.ts:308-327) supplies the runtime metadata. Phase A produces `backend: 'primary-inline'` only. OPEN GAP: the ship path for the inlined SVG runtime + svg-pan-zoom assets resolved to copy-assets.mjs at 0.486 confidence, below the 0.5 threshold — the offline guarantee in ac2 has no named contract surface to test against in this Story and rests on that build convention.

```
+type RenderBackend = 'primary-inline' | 'fallback-subprocess';
+interface RenderedDocumentShell {
+  docType: string;
+  backend: RenderBackend;
+  html: string;              // single self-contained file, no view-time network fetch
+  inlinedRuntimeVersion: string;
+  diagramFormat: 'svg';
+  supportsZoomPan: true;
+}
```

**Call sites:**
- `src/shared/artifacts.ts (RenderedArtifactHtml interface, lines 67-70, plus ArtifactKind / ArtifactOpts / MermaidCdnMeta / TemplateInfo — the type surface sc3 extends; 27 entities in the module)`
- `src/daemon/artifacts-rpc.ts (loadMermaidCdnMeta, lines 308-327, not currently exported — the offline-shell extension point; 19 entities, 16 exports)`
- `copy-assets.mjs and src/assets (asset-ship path for the inlined runtime — LOW CONFIDENCE, 0.486, flagged not settled)`

### `DocGenOutcome` — invariant-change

Parameterized to `DocGenOutcome<T>` with the ok arm renamed from `shell` to `value` — a3's envelope grafted onto a2 exactly as the winning judgment prescribed, because the envelope choice is independent of the provenance decision and this graft is what lifts ac6 from partial to satisfied. Under the published non-generic shape the envelope only fits the outermost boundary, so empty-scope is detected at the zero-type graph read but transported inward-out by throw/sentinel and re-worded at the edge; parameterized, the extractor returns `DocGenOutcome<DocumentIR>` directly at the point of detection and flatMap short-circuits it outward with the reason string untouched. All six variants are otherwise unchanged: ok / empty-scope / not-found / truncated / fallback-unavailable / source-not-ready. Phase A exercises ok, empty-scope, not-found, and source-not-ready; truncated is s3's and fallback-unavailable is s5's, both reachable through the same combinators without re-implementation (k11). Two accepted costs: (1) the `shell` → `value` rename means s3/s5/s6 destructure a different field — folded into the same single back-flow note as the DocumentIR partition; (2) the generic union needs a hand-mirrored JSON schema for the MCP output surface under exactOptionalPropertyTypes, since the type cannot be derived automatically there.

```
-type DocGenOutcome =
-  | { status: 'ok'; shell: RenderedDocumentShell }
-  | { status: 'empty-scope'; reason: string }
-  | ...
+type DocGenOutcome<T> =
+  | { status: 'ok'; value: T }
+  | { status: 'empty-scope'; reason: string }
+  | { status: 'not-found'; symbol: string }
+  | { status: 'truncated'; depthUsed: number }
+  | { status: 'fallback-unavailable'; reason: string; remedy: string }
+  | { status: 'source-not-ready'; reason: string };
+// boundary type is now DocGenOutcome<RenderedDocumentShell>; extractor returns DocGenOutcome<DocumentIR>
```

**Call sites:**
- `src/db/graph/codec.ts (the zero-EntityRow read that raises empty-scope at the point of detection)`
- `src/daemon/tools/registry.ts (registerTool, lines 18-39 — the outermost boundary that returns DocGenOutcome<RenderedDocumentShell> to the caller)`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | implements | s1 owns DocumentIR per the HLD boundary. Implemented with a2's provenance PARTITION (`derived: { nodes, edges }` / `narrated: { sections }`) instead of the published flat shape with a per-item provenance flag, so sc1's own stated purpose — 'the type-level boundary that forces structural diagram content to be graph-derived' — is discharged by the type checker rather than by review (ac1, k8). The Phase A type-structure extractor populates `derived` exclusively from src/db/graph/codec.ts reads (EntityRow:132-160 plus the inheritance/composition edge codecs) and leaves `narrated` empty; no LLM touches this path, consistent with k8. `generatedAtRevision` is pinned once per call so repeated generation against unchanged code is byte-identical. BACK-FLOW REQUIRED to s2–s7 (all six consumers) for the shape change; bundled with the sc4 change into one note. |
| `sc2` | implements | s1 owns DocTypeRegistration and DocTypeRegistry. register/list/get ship as published; the registration record gains a bound `extract()` so the registry is the ONLY dispatch path and the daemon tool registry, IPC method table, and MCP tool surface all enumerate from list() rather than from three hand-maintained lists (k4). Phase A registers exactly one entry — the type-structure extractor — and the docgen tool is registered through the existing registerTool(tool: Tool): void at src/daemon/tools/registry.ts:18-39, whose signature is followed exactly since the s1 usage.example pass found zero precedent callsites. Capability enumeration crossing IPC/MCP projects the serializable subset of each record. The bound-extract addition is the amendment proposed below; the rest is as published, so consumers s2/s3/s4/s6 are unaffected. |
| `sc3` | implements | s1 owns RenderedDocumentShell and ships it BYTE-FOR-BYTE as published — no restructuring — precisely because it has all six consuming stories and Phase A has no subprocess renderer to validate a backend union against. Assembly extends the existing primitives rather than paralleling them (ac4, k6, k10): RenderedArtifactHtml (src/shared/artifacts.ts:67-70) for the single-file document shape and loadMermaidCdnMeta (src/daemon/artifacts-rpc.ts:308-327, which this Story must export) for the runtime metadata that becomes inlinedRuntimeVersion. The literal `diagramFormat: 'svg'` and `supportsZoomPan: true` pin ac3 at the type level; the inlined local runtime with no view-time fetch delivers ac2. RESIDUAL RISK on ac2: the asset-ship anchor (copy-assets.mjs / src/assets) resolved at 0.486 confidence, below threshold, and this Story deliberately does not stand up a4's InlinedAssetManifest to name it — that is deferred to s5. Also unmeasured: no import.graph pass ran against artifacts-rpc.ts or artifacts.ts, so the blast radius of extending those two primitives is unknown. |
| `sc4` | implements | s1 owns DocGenOutcome. Implemented as the parameterized `DocGenOutcome<T>` with the ok arm renamed `shell` → `value`, plus map/flatMap combinators — a3's envelope grafted onto a2 exactly as the winning judgment directed, since the two choices are independent. This is what makes ac6 hold in the strong sense: empty-scope is raised as a typed variant at the exact graph read that yields zero types and short-circuits outward with its reason string intact, so no blank or misleading diagram is reachable and the caller sees the same string that was logged where the condition was detected (k11, HLD nonFunctional.observability). Consumers s3 (truncated), s5 (fallback-unavailable), and s6 (not-found) then get their variants mapped once here rather than re-implemented per story. BACK-FLOW REQUIRED to s3/s5/s6 for the `value` rename; bundled with the sc1 note. The generic union needs a hand-mirrored JSON schema on the MCP output surface under exactOptionalPropertyTypes. |

## Error paths

### Error cases

- **The requested scope resolves to zero types in the graph** (recoverable)
  - Detection: extract() drives the EntityRow read for the requested scope (src/db/graph/codec.ts) and the read returns zero rows before any IrNode is constructed
  - Response: extract() returns DocGenOutcome<'empty-scope'> with a reason string built at that exact read site; DocGenOutcome.flatMap propagates it outward to the caller unchanged instead of assembling a shell
  - User impact: the caller receives a clear report that the scope is empty and why, instead of a document with a blank or misleading diagram (ac6)
- **The caller requests a docType with no matching registration** (recoverable)
  - Detection: the daemon tool/IPC handler calls DocTypeRegistry.get(docType) and it returns undefined
  - Response: the boundary maps the undefined result to DocGenOutcome<'not-found'> carrying the requested symbol, rather than throwing
  - User impact: the caller sees a typed not-found result naming the requested docType instead of an unhandled exception
- **The repo is registered but indexing has not finished when generation is requested** (recoverable)
  - Detection: extract() attempts to resolve a pinned index revision for the repo at entry and the repo registry reports indexing is not yet complete, so no revision is available to read
  - Response: returns DocGenOutcome<'source-not-ready'> with a reason string before any graph read is attempted
  - User impact: the caller is told the repo isn't ready yet rather than receiving a partial or stale document
- **The repo path named in the request is absent from the repo registry** (terminal)
  - Detection: the storage layer's read path checks the repo path against the repo registry per the project's strict registry contract and finds no matching entry
  - Response: UnregisteredRepoError propagates out of extract() outside the DocGenOutcome envelope — modelled as caller misuse rather than a documentable outcome
  - User impact: the caller gets an explicit registry error naming the repo must be added via repo.add before a document can be generated
- **The shipped local runtime asset (inlined SVG runtime / svg-pan-zoom) is missing from the build output at shell-assembly time** (recoverable)
  - Detection: shell assembly calls loadMermaidCdnMeta() and attempts to read the local asset path shipped by copy-assets.mjs; the file read fails or the resolved path does not exist
  - Response: returns DocGenOutcome<'fallback-unavailable'> with a reason and remedy string naming the copy-assets.mjs ship step, short-circuited outward via flatMap
  - User impact: the caller is told the offline runtime is missing and how to fix the build, instead of silently getting a document that fetches from a CDN or fails to render (ac2)
- **A docType is registered twice under the same key** (terminal)
  - Detection: DocTypeRegistry.register compares the incoming entry.docType against already-registered keys before inserting and finds a match
  - Response: throws DuplicateDocTypeError synchronously during daemon startup wiring, before any docgen request can be served
  - User impact: the daemon fails fast at startup with a clear duplicate-registration error instead of silently letting two extractors race for one docType
- **A registration entry has a malformed extractorInputSchema or a capability.id that doesn't match its own docType** (terminal)
  - Detection: DocTypeRegistry.register validates entry.extractorInputSchema as a JSON schema object and checks entry.capability.id === entry.docType before inserting
  - Response: throws InvalidRegistrationError at registration time
  - User impact: prevents a broken capability listing from ever reaching the daemon tool, IPC, and MCP surfaces simultaneously
- **The caller's scope/entry-point input fails validation against the resolved registration's extractorInputSchema** (recoverable)
  - Detection: the daemon tool/IPC handler validates the incoming input against DocTypeRegistry.get(docType).extractorInputSchema before invoking extract()
  - Response: the request is rejected at the boundary before extract() runs; no graph read occurs
  - User impact: the caller gets a schema validation error pinpointing the malformed field instead of the extractor crashing on unexpected input

### Edge cases

| Input | Expected |
| :--- | :--- |
| The requested scope contains types with no inheritance or composition relationships among them | the document renders with all type nodes present and zero edges; this is not treated as empty-scope since ac6 defines emptiness as zero types, not zero relationships |
| The requested scope resolves to exactly one type | the document renders a single-node diagram with no edges, following the same self-contained shell convention as a multi-type document |
| The requested scope contains a very large number of types (e.g. an entire large module) | the document still renders as one self-contained file whose SVG diagram stays sharp and legible at every zoom level when panned/zoomed (ac3); Phase A has no pagination or truncation, so document size scales with scope size |
| A type in scope has a self-referential composition relationship (e.g. a recursive tree/list node type) | the diagram represents the self-edge without the extractor or renderer failing or silently deduplicating it away |
| Two distinct types in scope share the same display name but live in different files | each becomes a distinct IrNode keyed by its deterministic entity id (SHA256 of repo+file+kind+name), so the diagram shows them as separate nodes rather than merging or colliding |
| The same scope is requested repeatedly with no intervening code changes | the resulting document is byte-identical across requests, since generatedAtRevision is pinned once per call and every read within that call uses the same resolved revision |

### Invariants to preserve

- loadMermaidCdnMeta (src/daemon/artifacts-rpc.ts:308-327) and its existing callers keep their current behavior — this Story exports/reuses it for shell assembly rather than changing its signature or return semantics. [[c3]]
- RenderedArtifactHtml and its surrounding ArtifactKind/ArtifactOpts/MermaidCdnMeta/TemplateInfo type surface (src/shared/artifacts.ts) keep serving the repository's existing self-contained documents unchanged; RenderedDocumentShell extends this surface rather than modifying it, so ac4's 'same convention, not a parallel one' holds. [[c4]]

## Test strategy

**Test framework:** `node:test via tsx --test runner (npx tsx --test 'src/**/__tests__/*.test.ts'), test files following the repo's dominant *.test naming convention per s1 convention.detect; test.locate found no analogous daemon-tool test file to model layout on, so new tests should colocate under the daemon/tools and workflow-story module's own __tests__ directory following that same *.test suffix.`

### Test levels

- **unit** — Verify DocTypeRegistry (register/list/get) and the DocGenOutcome map/flatMap combinators in isolation, with no daemon process or live graph store involved
  - Subjects: `DocTypeRegistry.register/list/get`, `DocGenOutcome.map`, `DocGenOutcome.flatMap`
  - Fixtures: `in-memory DocTypeRegistration fixtures: one valid record, one duplicate-docType record, one malformed extractorInputSchema record, one capability.id-mismatched record`
- **unit** — Verify the Phase A type-structure extractor's empty-scope detection and derived/narrated IR partitioning against mocked graph reads, without a live LMDB store
  - Subjects: `DocTypeRegistration.extract (type-structure extractor)`
  - Fixtures: `mocked decodeEntityRow/decodeEdgeProps reads returning zero rows (empty-scope case)`, `mocked reads returning a small fixed set of EntityRow + inheritance/composition edge rows`
- **integration** — Verify the extractor against a real LMDB-backed indexed repo fixture, proving derived-only IR population, graph fidelity for inheritance/composition/self-reference/duplicate-display-name cases, and the source-not-ready / unregistered-repo error paths
  - Subjects: `type-structure extractor + src/db/graph/codec.ts EntityRow/EdgeProps reads`, `repo registry source-not-ready and UnregisteredRepoError paths`
  - Fixtures: `a small registered-and-indexed fixture repo with a known type hierarchy: a base/derived class pair, a composed-field type, one recursive self-referential type, and two same-named types defined in different files`, `a repo fixture that is registered but not yet finished indexing`, `an unregistered repo path`
- **integration** — Verify shell assembly extends the existing artifact primitives (RenderedArtifactHtml, loadMermaidCdnMeta) to produce an offline self-contained, zoomable SVG document, and surfaces fallback-unavailable when the shipped runtime asset is missing
  - Subjects: `shell assembly producing RenderedDocumentShell`, `loadMermaidCdnMeta export reuse`, `RenderedArtifactHtml/ArtifactKind extension`
  - Fixtures: `a built copy-assets.mjs output with the shipped Mermaid/svg-pan-zoom runtime asset present`, `a build fixture with that shipped runtime asset deliberately removed, to exercise the fallback-unavailable path`
- **integration** — Verify the daemon tool + IPC boundary is the single resolution path from an external docType request to an extractor, and that it never leaks a store handle, EntityRow, or DocumentIR to the caller
  - Subjects: `registerTool docgen tool handler`, `DocTypeRegistry.get boundary resolution`, `not-found docType path`, `extractorInputSchema validation rejection path`
  - Fixtures: `a daemon test harness with DocTypeRegistry bootstrapped to exactly the Phase A type-structure registration`, `a docType request naming an unregistered docType`, `a scope/entry-point input payload that violates extractorInputSchema`
- **contract** — Verify the hand-mirrored JSON schema for the generic DocGenOutcome<T> union on the MCP output surface matches all six TS status variants under exactOptionalPropertyTypes
  - Subjects: `DocGenOutcome<T> MCP JSON schema`
  - Fixtures: `one sample payload per status variant: ok, empty-scope, not-found, truncated, fallback-unavailable, source-not-ready`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `extractor.test: derived.nodes/derived.edges built exclusively from EntityRow + inheritance/composition edge codec reads for a scoped repo, narrated.sections empty`, `extractor.test (integration): inheritance and composition edges present and correctly typed for the fixture repo's base/derived and composed-field types`, `extractor.test (integration): recursive self-referential type produces a self-edge, not deduplicated away`, `extractor.test (integration): two same-named types in different files produce two distinct IrNodes keyed by their deterministic entity id` |
| `ac2` | `shell-assembly.test (integration): RenderedDocumentShell.html contains no external network references (no CDN/http(s) fetch) and renders fully from the single file`, `shell-assembly.test (integration): loadMermaidCdnMeta resolves to the locally shipped copy-assets.mjs runtime asset, not a CDN URL`, `shell-assembly.test (integration): missing shipped runtime asset yields DocGenOutcome<'fallback-unavailable'> with a remedy naming the copy-assets.mjs ship step, rather than falling back to a CDN fetch` |
| `ac3` | `contract test: RenderedDocumentShell.diagramFormat is the literal 'svg' and supportsZoomPan is literal true`, `shell-assembly.test (integration): embedded document includes the inlined svg-pan-zoom runtime alongside the SVG diagram content` |
| `ac4` | `shell-assembly.test (integration): RenderedDocumentShell is assembled by extending RenderedArtifactHtml/ArtifactKind/ArtifactOpts/MermaidCdnMeta/TemplateInfo rather than a parallel document type`, `invariant test: existing RenderedArtifactHtml consumers in src/shared/artifacts.ts are unaffected by the extension` |
| `ac5` | `docgen-tool.test (integration): the registerTool handler's response contains only DocGenOutcome<RenderedDocumentShell> — never a store handle, EntityRow, or DocumentIR`, `docgen-tool.test (integration): DocTypeRegistry.get is the sole resolution path from an external docType request to its extract() implementation` |
| `ac6` | `extractor.test: zero-EntityRow scope returns DocGenOutcome<'empty-scope'> with a reason string constructed at the exact zero-row read site`, `docgen-tool.test (integration): DocGenOutcome.flatMap propagates the empty-scope reason outward to the caller unchanged, with no shell assembled` |

## Alternatives considered

### a1: Flat tagged IR, data-only registry, single generic entry point

Land sc1–sc4 exactly as the HLD sketched them, with provenance as a per-element flag and the outcome envelope applied only at the outermost daemon boundary.



**Rejected because:** Cheapest (S) and zero back-flow, since it ships sc1-sc4 byte-for-byte as published, but it is partial on both of the story's invariant-bearing criteria simultaneously: ac1 (nothing in the type system stops a `provenance: 'narrated'` node from sitting in `nodes` and reaching a diagram — k8 enforced by review, not types) and ac6 (empty-scope is detected deep but transported by throw/sentinel, so k11's 'implemented once' is not achieved). It also scores partial on sc2 (a second hand-maintained extractor dispatch map persists beside the registry — the exact drift k4 exists to remove). Under this project's accuracy-over-cost principle, saving one cost tier by leaving k8 and k11 to review discipline is the wrong trade in the one story whose entire deliverable is the contracts themselves.

### a2: Provenance-partitioned IR with registry-owned extractor dispatch — **CHOSEN**

Make the derived/narrated split structural rather than a flag, and let DocTypeRegistration carry the extractor itself so the registry is the only dispatch path.



### a3: Generic outcome envelope threaded through every layer boundary

Parameterize DocGenOutcome so extraction, rendering, and the entry point each return the same envelope, letting each failure variant be raised where it is actually detected.



**Rejected because:** The only alternative scoring `satisfies` on ac6 — parameterizing DocGenOutcome<T> lets empty-scope be raised as a typed variant at the exact zero-type graph read and propagated verbatim, serving k11 directly. But its ceiling is ac1: it keeps a1's flat provenance flag, so nothing stops a narrated node reaching a diagram (k8 stays review-enforced, partial), and it keeps the second dispatch map beside the registry (sc2 partial). It also renames sc4's ok arm from `shell` to `value`, requiring a back-flow note, while leaving the provenance invariant unguarded. Since the envelope choice is independent of the provenance decision, a3's contribution is adopted as a graft onto the winner rather than as a standalone architecture.

### a4: Backend-discriminated shell with a renderer registration and asset manifest

Split RenderedDocumentShell into a shared core plus a per-backend arm, and add a renderer registry and typed inlined-asset manifest next to the doc-type registry.



**Rejected because:** The only alternative scoring `satisfies` on ac2 — its InlinedAssetManifest turns the offline guarantee into a named, testable contract instead of an implicit copy-assets.mjs convention. But it buys that on the widest Phase A surface (L) and spends it in the wrong place: it scores partial on sc3, the contract with all six consuming stories, by restructuring the published flat shell into a shared core intersected with a backend union and committing the fallback-subprocess arm before any subprocess renderer (s5) exists to validate it. It also inherits a1's weaknesses wholesale (partial on ac1, ac6, sc2, sc4) and pins its new manifest to a 0.486-confidence resolution of the asset-ship path — below the 0.5 threshold. Highest cost, largest consumer churn, and no gain on the story's two invariant-bearing criteria; its manifest idea is deferred to s5 where the subprocess backend it describes actually exists.

## Open questions

- s5/s6's invariantsToPreserve entries (covering loadMermaidCdnMeta and RenderedArtifactHtml) each carry a `source` id of 'c3'/'c4', but these ids resolve two incompatible ways in this artifact's citation namespace: as the Story's own existingCapabilityRefs (['c3','c4']), or as s4.hld.amendmentProposal.citations, where c3/c4 instead concern registerTool's module.profile and usage.example findings — neither of which is about loadMermaidCdnMeta or RenderedArtifactHtml. The underlying invariants ARE grounded in a real s1 module.profile bundle (artifacts-rpc.ts:308-327, artifacts.ts:67-70); only the citation-id namespace is ambiguous. Disambiguate which citation scheme 'c3'/'c4' point into before approval.

## Resolved questions

- `qfe895586` — s5/s6's invariantsToPreserve entries (covering loadMermaidCdnMeta and RenderedArtifactHtml) each carry a `source` id of 'c3'/'c4', but these ids resolve two incompatible ways in this artifact's citation namespace: as the Story's own existingCapabilityRefs (['c3','c4']), or as s4.hld.amendmentProposal.citations, where c3/c4 instead concern registerTool's module.profile and usage.example findings — neither of which is about loadMermaidCdnMeta or RenderedArtifactHtml. The underlying invariants ARE grounded in a real s1 module.profile bundle (artifacts-rpc.ts:308-327, artifacts.ts:67-70); only the citation-id namespace is ambiguous. Disambiguate which citation scheme 'c3'/'c4' point into before approval.
  - **resolved**: Cite the grounding evidence directly — Consistent with the S001 LLD review resolution: drop the ambiguous 'c3'/'c4' ids from the two invariantsToPreserve entries and point source at the verified s1 module.profile anchors — src/daemon/artifacts-rpc.ts:308-327 for loadMermaidCdnMeta (independently confirmed by the review as present-but-unexported) and src/shared/artifacts.ts:67-70 for RenderedArtifactHtml (confirmed export). The invariants then stand on verifiable file:line evidence with no namespace indirection; no design/code change. _(2026-07-30T16:53:46.887Z)_

## Citations

- **[[c1]]** `doc` `HLD context slice for Epic 870ed3dd246225f4, Story s1` — "Adopts a1 as the core architecture: an Intermediate Representation (IR) is the hard boundary between graph-derived content and LLM-narrated content..."
- **[[c2]]** `step-output` `s2.alternatives (a1-a4)`
- **[[c3]]** `step-output` `s3.judgments + winnerId/winnerRationale (a2 selected)`
- **[[c4]]** `step-output` `s4.api`
- **[[c5]]** `step-output` `s4.dataModel`
- **[[c6]]** `step-output` `s4.interactionWithShared`
- **[[c7]]** `step-output` `s5.errorCases / s5.edgeCases / s5.invariantsToPreserve`
- **[[c8]]** `step-output` `s6.testLevels / s6.acceptanceMapping / s6.testFramework`
- **[[c9]]** `step-output` `s8.results[itemId=ep3] — ambiguous verdict on invariantsToPreserve citation ids`
