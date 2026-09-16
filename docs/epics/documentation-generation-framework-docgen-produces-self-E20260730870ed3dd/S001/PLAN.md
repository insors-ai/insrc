<!-- insrc:artifact PLAN-870ed3dd246225f4-s1 -->

# Plan: E20260730870ed3dd:S001

**Epic:** `documentation-generation-framework-docgen-produces-self`
**LLD run:** `wf-1785424044925-xcu2ce`
**LLD effective hash:** `cb5b27744db2...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Define shared docgen contract types | M | — | unit: type-shape fixture test: sample DocumentIR/DocTypeRegistration/RenderedDocumentShell/DocGenOutcome literals satisfy the module's exported types under exactOptionalPropertyTypes | [[c1]] [[c2]] [[c3]] [[c4]] |
| 2 | **`t2`** Implement DocGenOutcome map/flatMap combinators | S | `t1` | unit: DocGenOutcome.map: transforms ok arm's value, leaves each non-ok variant's fields unchanged; unit: DocGenOutcome.flatMap: invokes f only on ok arm and returns f's outcome; passes non-ok input through untouched | [[c4]] [[c5]] |
| 3 | **`t3`** Implement DocTypeRegistry (register/list/get) | M | `t1` | unit: DocTypeRegistry.register/list/get: valid record registers and is retrievable by get; duplicate docType throws DuplicateDocTypeError; malformed extractorInputSchema and capability.id mismatch throw InvalidRegistrationError; list() returns a mutation-safe copy in registration order; get() on an unregistered docType returns undefined | [[c2]] [[c6]] |
| 4 | **`t4`** Export loadMermaidCdnMeta for shell-assembly reuse | S | — | smoke: existing loadMermaidCdnMeta call sites still compile and return identical metadata after the export change | [[c9]] |
| 5 | **`t5`** Implement type-structure extractor over graph codec reads | L | `t1`, `t2` | unit: extractor: mocked decodeEntityRow/decodeEdgeProps returning zero rows yields DocGenOutcome<'empty-scope'> with reason built at the zero-row read site, narrated.sections stays empty; unit: extractor: mocked reads for a fixed EntityRow + inheritance/composition edge set build derived.nodes/derived.edges exclusively from those reads; integration: extractor against a real LMDB-backed indexed fixture repo: base/derived and composed-field types produce correctly-typed inheritance/composition edges; recursive self-referential type keeps its self-edge; two same-named types in different files yield two distinct IrNodes by deterministic entity id; generatedAtRevision is stable across repeated calls; integration: extractor against a registered-but-not-indexed repo fixture returns DocGenOutcome<'source-not-ready'> before any graph read; an unregistered repo path propagates UnregisteredRepoError unchanged | [[c1]] [[c7]] [[c10]] |
| 6 | **`t6`** Assemble RenderedDocumentShell extending RenderedArtifactHtml + loadMermaidCdnMeta | M | `t1`, `t2`, `t4` | integration: shell-assembly: with the shipped runtime asset present, RenderedDocumentShell.html is a single self-contained file with no external network references, diagramFormat 'svg', supportsZoomPan true, backend 'primary-inline'; integration: shell-assembly: inlinedRuntimeVersion is populated from loadMermaidCdnMeta()'s resolved metadata; integration: shell-assembly: RenderedDocumentShell is built by extending RenderedArtifactHtml/ArtifactKind/ArtifactOpts/TemplateInfo rather than a parallel document type; existing RenderedArtifactHtml consumers in src/shared/artifacts.ts are unaffected; integration: shell-assembly: with the shipped runtime asset missing, assembly returns DocGenOutcome<'fallback-unavailable'> via flatMap with a reason and remedy naming copy-assets.mjs, instead of throwing or fetching a CDN | [[c3]] [[c9]] [[c10]] |
| 7 | **`t7`** Wire docgen daemon tool + IPC boundary over DocTypeRegistry | L | `t3`, `t5`, `t6` | integration: docgen-tool: registerTool handler's response contains only DocGenOutcome<RenderedDocumentShell> — never a store handle, EntityRow, or DocumentIR — and DocTypeRegistry.get is the sole resolution path from an external docType request to its extract() implementation; integration: docgen-tool: requesting an unregistered docType returns DocGenOutcome<'not-found'> carrying the requested symbol, rather than throwing; integration: docgen-tool: an input payload violating the resolved registration's extractorInputSchema is rejected at the boundary with no graph read performed; integration: docgen-tool: an UnregisteredRepoError from the storage layer propagates to the caller unchanged rather than being modelled as a DocGenOutcome variant; integration: docgen IPC method call resolves to the same DocTypeRegistry-backed handler as the registered tool — exactly one daemon tool and one IPC method exist for document generation | [[c6]] [[c8]] [[c10]] |
| 8 | **`t8`** Mirror DocGenOutcome<T> as a hand-written MCP JSON schema | S | `t2`, `t7` | unit: hand-mirrored DocGenOutcome<T> JSON schema validates one sample payload per status variant (ok, empty-scope, not-found, truncated, fallback-unavailable, source-not-ready) under exactOptionalPropertyTypes, and is wired to the docgen tool as registered in t7's MCP output surface | [[c4]] [[c11]] |
| 9 | **`t9`** Verify offline runtime asset staging for shell assembly | S | `t4`, `t6` | integration: build-verification: copy-assets.mjs output stages the inlined SVG/svg-pan-zoom runtime asset that loadMermaidCdnMeta resolves; with it present, an assembled RenderedDocumentShell.html has no external network references; integration: build-verification: with the shipped runtime asset deliberately removed, shell assembly returns DocGenOutcome<'fallback-unavailable'> rather than a broken or silently-CDN-fetching document | [[c9]] [[c12]] |
| 10 | **`t10`** Send back-flow note to consuming stories on DocumentIR/DocGenOutcome shape changes | S | `t1` | smoke: back-flow note artifact: single note covers both the DocumentIR partition reshape and the DocGenOutcome ok-arm rename, and is addressed to s2, s3, s4, s5, s6, s7 in one delivery | [[c1]] [[c4]] |

### E20260730870ed3dd:S001:T001 — Define shared docgen contract types

Author the type-only module for DocumentIR (derived/narrated partition), DocTypeRegistration/DocTypeRegistry, RenderedDocumentShell, and the parameterized DocGenOutcome<T>, exactly matching the LLD's schemaDiffs.

**Acceptance checks:**
- DocumentIR has derived:{nodes,edges} and narrated:{sections} partitions with no per-item provenance field; IrNode/IrEdge/IrSection match the dataModelChanges schemaDiff
- DocTypeRegistration includes docType, capability, extractorInputSchema, and an extract(input): Promise<DocGenOutcome<DocumentIR>> method signature
- RenderedDocumentShell matches the schemaDiff exactly: backend, html, inlinedRuntimeVersion, diagramFormat literal 'svg', supportsZoomPan literal true
- DocGenOutcome<T> is a generic discriminated union with all 6 status variants and the ok arm named value (not shell)

### E20260730870ed3dd:S001:T002 — Implement DocGenOutcome map/flatMap combinators

Implement the generic map/flatMap helpers so downstream stages can short-circuit non-ok outcomes without re-implementing envelope handling.

**Acceptance checks:**
- map(outcome, f) transforms only the ok arm's value and returns non-ok variants unchanged, field for field
- flatMap(outcome, f) invokes f only for the ok arm and returns f's outcome; for non-ok input it returns the original variant untouched

### E20260730870ed3dd:S001:T003 — Implement DocTypeRegistry (register/list/get)

Implement the registration store with the validation and copy semantics the LLD specifies, as the single dispatch surface for docType lookups.

**Acceptance checks:**
- register() throws DuplicateDocTypeError when an entry with the same docType is already registered
- register() throws InvalidRegistrationError when extractorInputSchema is not a valid JSON schema object, or capability.id !== docType
- list() returns a copy of all registrations in registration order; mutating the returned array does not alter the registry
- get(docType) returns the matching registration or undefined for an unregistered docType

### E20260730870ed3dd:S001:T004 — Export loadMermaidCdnMeta for shell-assembly reuse

Export the existing loadMermaidCdnMeta from artifacts-rpc.ts so shell assembly can reuse it instead of standing up parallel plumbing.

**Acceptance checks:**
- loadMermaidCdnMeta is exported from src/daemon/artifacts-rpc.ts (or lifted to a shared module) with its existing signature and behavior unchanged
- existing callers of loadMermaidCdnMeta at its current call sites continue to compile and behave identically

### E20260730870ed3dd:S001:T005 — Implement type-structure extractor over graph codec reads

Build the Phase A extractor that reads EntityRow and inheritance/composition edges via the graph codec and emits a derived-only DocumentIR, including empty-scope and source-not-ready detection.

**Acceptance checks:**
- extract() builds derived.nodes exclusively from decodeEntityRow reads (src/db/graph/codec.ts) for the requested scope, leaving narrated.sections empty
- inheritance and composition edges for in-scope types are decoded and added to derived.edges with correct kind
- a scope resolving to zero types returns DocGenOutcome<'empty-scope'> with a reason string built at the zero-row read site, propagated via flatMap with no shell assembled
- a repo registered but not finished indexing returns DocGenOutcome<'source-not-ready'> before any graph read is attempted
- a recursive self-referential type produces a self-edge that is not deduplicated away
- two same-named types defined in different files produce two distinct IrNodes keyed by their deterministic entity id
- generatedAtRevision is resolved once at entry and used by every read in the call, so repeated calls against unchanged code are byte-identical

### E20260730870ed3dd:S001:T006 — Assemble RenderedDocumentShell extending RenderedArtifactHtml + loadMermaidCdnMeta

Assemble the primary-inline shell from a DocumentIR by extending the existing artifact primitives, including the missing-asset fallback-unavailable path.

**Acceptance checks:**
- shell assembly builds RenderedDocumentShell.html as a single self-contained file with no view-time network fetch, using RenderedArtifactHtml/ArtifactKind/ArtifactOpts/TemplateInfo (src/shared/artifacts.ts) as the base rather than a parallel document type
- inlinedRuntimeVersion is populated from loadMermaidCdnMeta()'s resolved metadata
- diagramFormat is the literal 'svg' and supportsZoomPan is the literal true
- when the shipped local runtime asset is missing, assembly returns DocGenOutcome<'fallback-unavailable'> with a reason and remedy naming the copy-assets.mjs ship step, via flatMap, instead of throwing or fetching a CDN
- Phase A output always has backend: 'primary-inline'

### E20260730870ed3dd:S001:T007 — Wire docgen daemon tool + IPC boundary over DocTypeRegistry

Bootstrap the registry with the type-structure extractor and register the single docgen daemon tool as the sole external resolution path, with input validation, not-found/unregistered-repo handling, and a verified single IPC boundary crossing.

**Acceptance checks:**
- the type-structure extractor is registered into DocTypeRegistry exactly once at daemon startup, before any docgen request is served
- the docgen tool is registered via registerTool(tool: Tool) at src/daemon/tools/registry.ts following its existing signature, with no second dispatch map needed to resolve a docType to its extractor
- the tool handler returns DocGenOutcome<'not-found'> carrying the requested symbol when DocTypeRegistry.get returns undefined, rather than throwing
- caller input is validated against the resolved registration's extractorInputSchema before extract() runs; a violation is rejected at the boundary with no graph read performed
- an UnregisteredRepoError from the storage layer propagates to the caller unchanged rather than being modelled as a DocGenOutcome variant
- the tool handler's response never contains a store handle, EntityRow, or DocumentIR — only DocGenOutcome<RenderedDocumentShell>
- a JSON-RPC call for the docgen IPC method (registered in the daemon's IPC handler registry, distinct from the Tool registry) resolves to the same DocTypeRegistry-backed handler as the registered tool, with no second dispatch path — verifying exactly one daemon tool and one IPC method exist for document generation

### E20260730870ed3dd:S001:T008 — Mirror DocGenOutcome<T> as a hand-written MCP JSON schema

Hand-author the JSON schema for the generic DocGenOutcome<T> union so the MCP output surface validates all six status variants under exactOptionalPropertyTypes, wired to the actual registered docgen tool.

**Acceptance checks:**
- a JSON schema exists that validates one sample payload for each of the 6 DocGenOutcome status variants (ok, empty-scope, not-found, truncated, fallback-unavailable, source-not-ready)
- the schema is wired to the MCP output surface for the docgen tool's response, against the tool as actually registered in t7

### E20260730870ed3dd:S001:T009 — Verify offline runtime asset staging for shell assembly

Resolve the LLD's flagged low-confidence copy-assets.mjs anchor by confirming at build time that the inlined SVG/svg-pan-zoom runtime is actually staged for offline shell assembly.

**Acceptance checks:**
- the build output confirms copy-assets.mjs stages the inlined SVG/svg-pan-zoom runtime asset that loadMermaidCdnMeta resolves for shell assembly
- with the shipped asset present, an assembled RenderedDocumentShell.html contains no external network references
- with the shipped asset deliberately removed, shell assembly returns DocGenOutcome<'fallback-unavailable'> rather than a broken or silently-CDN-fetching document

### E20260730870ed3dd:S001:T010 — Send back-flow note to consuming stories on DocumentIR/DocGenOutcome shape changes

Author and send a single combined back-flow note to consuming stories s2–s7 documenting the DocumentIR reshape from a flat provenance-flagged structure to the derived/narrated partition, and the DocGenOutcome ok arm rename from shell to value, per the LLD's REQUIRED backflow instruction.

**Acceptance checks:**
- a single back-flow note is authored covering both changes together: DocumentIR's flat provenance-flagged structure replaced by the derived/narrated partition, and DocGenOutcome's ok arm renamed from shell to value
- the note is sent/attached as a workflow artifact addressed to consuming stories s2, s3, s4, s5, s6, and s7
- the note is delivered in one pass rather than as separate messages per consuming story, per the winning judgment's single-note instruction

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| DocTypeRegistry.register/list/get | `t3` |
| DocGenOutcome.map | `t2` |
| DocGenOutcome.flatMap | `t2` |
| DocTypeRegistration.extract (type-structure extractor) | `t5` |
| type-structure extractor + src/db/graph/codec.ts EntityRow/EdgeProps reads | `t5` |
| repo registry source-not-ready and UnregisteredRepoError paths | `t5` |
| shell assembly producing RenderedDocumentShell | `t6`, `t9` |
| loadMermaidCdnMeta export reuse | `t6` |
| RenderedArtifactHtml/ArtifactKind extension | `t6` |
| registerTool docgen tool handler | `t7` |
| DocTypeRegistry.get boundary resolution | `t7` |
| not-found docType path | `t7` |
| extractorInputSchema validation rejection path | `t7` |
| DocGenOutcome<T> MCP JSON schema | `t8` |

## Citations

- **[[c1]]** `prior-artifact` `LLD S001 dataModelChanges: DocumentIR reshaped into derived:{nodes,edges} / narrated:{sections} partitions, replacing the flat provenance-flagged structure` — "DocumentIR with derived/narrated partition"
- **[[c2]]** `prior-artifact` `LLD S001 handoff: DocTypeRegistration/DocTypeRegistry contract — docType, capability, extractorInputSchema, bound extract() method`
- **[[c3]]** `prior-artifact` `LLD S001 schemaDiff: RenderedDocumentShell — backend, html, inlinedRuntimeVersion, diagramFormat:'svg', supportsZoomPan:true`
- **[[c4]]** `prior-artifact` `LLD S001 schemaDiff: DocGenOutcome<T> generic discriminated union across 6 status variants, ok arm renamed from shell to value`
- **[[c5]]** `prior-artifact` `LLD S001 handoff: DocGenOutcome requires map/flatMap combinators so downstream stages short-circuit non-ok outcomes`
- **[[c6]]** `prior-artifact` `LLD S001 handoff: DocTypeRegistry validation semantics — DuplicateDocTypeError / InvalidRegistrationError and single-registry dispatch requirement`
- **[[c7]]** `prior-artifact` `LLD S001 handoff: type-structure extractor must read EntityRow + inheritance/composition edges via src/db/graph/codec.ts decodeEntityRow (Buffer-based, codec.ts:165)`
- **[[c8]]** `prior-artifact` `LLD S001 handoff: docgen daemon tool must be registered via registerTool(tool: Tool) plus a matching IPC method, with DocTypeRegistry.get as the sole resolution path`
- **[[c9]]** `prior-artifact` `LLD S001 handoff: export loadMermaidCdnMeta from src/daemon/artifacts-rpc.ts for reuse in offline shell assembly (currently unexported)`
- **[[c10]]** `prior-artifact` `LLD S001 handoff: Phase A scope is fixed to backend:'primary-inline'; extractor and shell assembly must honor source-not-ready / empty-scope / not-found propagation via DocGenOutcome`
- **[[c11]]** `prior-artifact` `LLD S001 handoff: DocGenOutcome<T> has no generated JSON-schema tooling for generics — MCP output schema must be hand-mirrored for all 6 variants`
- **[[c12]]** `prior-artifact` `LLD S001 flagged low-confidence (0.486) anchor: copy-assets.mjs staging of the inlined SVG/svg-pan-zoom runtime asset for the offline-guarantee, requiring build-time verification`
