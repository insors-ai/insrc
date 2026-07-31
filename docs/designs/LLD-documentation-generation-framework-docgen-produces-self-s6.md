<!-- insrc:artifact LLD-870ed3dd246225f4-s6 -->

# LLD: E20260731870ed3dd:S006

**Epic:** `documentation-generation-framework-docgen-produces-self`
**HLD base run:** `wf-1785421889464-2ayzlc`
**HLD effective hash:** `cb5b27744db2...`

## HLD context

**Framework:** docgen registers IR extractors on one sc2 DocTypeRegistry so the daemon tool registry, the IPC method table, and an MCP tool all enumerate a single source of truth (k4). Cross-cutting failure reporting is the shared sc4 DocGenOutcome envelope; reads stay daemon-side (k2).
**Rollout phase:** Phase D — Surface parity & installed-build hardening
**Consumes:** `sc1` (DocumentIR), `sc2` (DocTypeRegistration), `sc3` (RenderedDocumentShell), `sc4` (DocGenOutcome)

## Contract details

**Surface level:** public

### `generateDocument`

```typescript
function generateDocument(docType: string, input: Record<string, unknown>): Promise<ShellOutcome>
```

**Parameters:**
- `docType: string` — The registered document type to generate; resolved against docgenRegistry.get (unknown → not-found).
- `input: Record<string, unknown>` — The FULL per-request input forwarded verbatim to the resolved type's extractor (repo + any of path/symbol/base/question/maxDepth its extractorInputSchema declares). Already whole-passed to reg.extract — no signature change.

**Returns:** `Promise<ShellOutcome>` — The single generation entry point all three surfaces funnel through (k4). Reshaped internally to run the registered/indexed precondition BEFORE extraction so an unregistered/unindexed repo returns source-not-ready rather than an empty shell (ac3).

**Errors:**
- `DocGenOutcome not-found` when docType is not registered in docgenRegistry.
- `DocGenOutcome source-not-ready` when the target repo is not registered or has not finished indexing (no pinned graph revision) — the ac3 precondition, enforced once here so every surface inherits it (k11/k2).
- `DocGenOutcome empty-scope` when the extractor's parseScope rejects the input (a required per-type field like symbol/question absent) or the scope yields no entities.
- `DocGenOutcome fallback-unavailable` when the runtime asset is missing or an oversized diagram has no subprocess renderer (s5).

**Preconditions:**
- docgenRegistry is bootstrapped (daemon boot).
- Runs inside the daemon (k2) — reads never cross to the caller process.

**Postconditions:**
- The whole input flows to the extractor, so call-sequence (needs symbol) and narrative (needs base+question) become reachable identically once a surface forwards the full input (ac1).
- A non-ok outcome carries its reason/symbol verbatim for the surface to render (sc4).

### `listDocTypes`

```typescript
function listDocTypes(): readonly SerializableDocTypeRegistration[]
```

**Returns:** `readonly SerializableDocTypeRegistration[]` — The registry projected through toSerializable ({docType, capability, extractorInputSchema}) — the ONE enumeration source every surface reads to advertise capabilities + per-type input schema (k4). Unchanged signature; s6 makes all three surfaces consume it.

**Preconditions:**
- docgenRegistry bootstrapped.

**Postconditions:**
- Adding a 5th doc type later appears on all three surfaces with zero surface edits (ac4).

### `docgenTool`

```typescript
const docgenTool: Tool  // id = DOCGEN_TOOL_ID ('docgen_generate'), registered via registerDocgenTool()
```

**Returns:** `Tool` — The daemon tool-surface entry, RESHAPED: its inputSchema is generalized from the fixed {docType, repo, path} to a registry-derived shape ({docType, repo} + the union of registered extractorInputSchema properties) built from listDocTypes(), and execute() forwards the FULL validated input to generateDocument instead of reconstructing {repo, path?} — so every registered doc type is reachable via the tool (ac1/ac4). Non-ok outcomes render through the existing describeOutcome.

**Errors:**
- `ToolResult success=false` when missing docType/repo, or any non-ok DocGenOutcome (rendered via describeOutcome, outcome carried in data).

**Preconditions:**
- registerDocgenTool() called once at daemon boot (already wired in daemon/tools/builtins/index.ts).

**Postconditions:**
- The tool advertises + accepts the same capabilities the IPC + MCP surfaces do (ac1); the finished shell rides in ToolResult.data, never the raw stores (ac2).

### `insrc_docgen`

```typescript
server.registerTool('insrc_docgen', { title, description, annotations, inputSchema }, handler): void  // new MCP registration in src/mcp/server.ts
```

**Parameters:**
- `inputSchema: Record<string, unknown>` — Derived from the registry ({docType} + repo + the union of listDocTypes()[].extractorInputSchema properties), obtained via the docgen.list IPC — the schema is the registry, hand-written nowhere (k4).
- `handler: (args, extra) => Promise<CallToolResult>` — Resolves the repo via resolveRepoPath($INSRC_REPO/cwd), then calls the docgen.generate / docgen.list IPC over the daemon socket and returns the DocGenOutcome shaped by DOCGEN_OUTCOME_SCHEMA. NEVER imports generateDocument — the read stays in the daemon (ac2).

**Returns:** `void` — Registers the missing THIRD surface: the assistant-facing MCP tool, bringing docgen to full tool/IPC/MCP parity (ac1/ac4). readOnlyHint=true, openWorldHint=false (scope is the indexed repo).

**Errors:**
- `CallToolResult isError` when the daemon IPC returns a non-ok DocGenOutcome (source-not-ready / not-found / empty-scope / fallback-unavailable), or is unreachable — surfaced with an actionable reason (ac3).

**Preconditions:**
- The daemon is running and exposes docgen.generate/docgen.list (already registered in daemon/index.ts).
- $INSRC_REPO or an explicit repo arg resolves to a registered repo.

**Postconditions:**
- A request through the MCP tool yields the SAME DocGenOutcome status as the tool + IPC surfaces for the same {docType, repo, scope} (ac1).
- The MCP process performs no store access — only the finished document/outcome crosses back (ac2).

## Data model changes

### `docgen_generate tool inputSchema + execute() input threading` — field-modify

src/docgen/tool.ts: replace the hard {docType, repo, path} inputSchema with a registry-derived schema (from listDocTypes() extractorInputSchema union) and change execute() to forward the whole validated input to generateDocument rather than reconstructing extractInput={repo}(+path). Makes call-sequence + narrative reachable via the tool (ac1). No change to Tool/ToolResult types. Backward-compatible: repo stays required, path optional.

**Call sites:**
- `src/docgen/tool.ts`

### `docgen.generate / docgen.list IPC handlers input threading` — invariant-change

src/daemon/index.ts: the docgen.generate handler forwards the whole params object (minus docType) to generateDocument instead of destructuring only {docType, repo, path}; docgen.list already returns listDocTypes(). Brings the IPC surface to parity with the tool (ac1). No IPC method rename — the IDE fork's mirrored types stay valid.

**Call sites:**
- `src/daemon/index.ts`

### `insrc_docgen MCP tool` — new

New MCP surface: a server.registerTool('insrc_docgen', …) registration + handler that resolves the repo, calls the docgen.generate/docgen.list IPC (daemon-owned read, ac2), derives its input schema from the registry, and returns outcomes shaped by DOCGEN_OUTCOME_SCHEMA. The previously-missing third surface (ac1/ac4).

**Call sites:**
- `src/mcp/server.ts`
- `src/docgen/schema.ts`
- `src/mcp/resolve-repo.ts`

### `generateDocument registered/indexed precondition (ac3)` — invariant-change

src/docgen/index.ts generateDocument: enforce the registered+indexed precondition centrally before extraction so an unregistered/unindexed repo returns sc4 source-not-ready with an actionable reason on every surface, rather than each extractor/surface re-checking (k11). Reuses the existing source-not-ready variant the extractors already emit for the no-revision case.

**Call sites:**
- `src/docgen/index.ts`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc2` | consumes | All three surfaces enumerate docgenRegistry via listDocTypes()/toSerializable — one source of truth for docType + capability.summary + extractorInputSchema (k4). No registry change; s6 wires it to the two existing consumers + the new MCP consumer. |
| `sc1` | consumes | Unchanged: content stays graph-derived through generateDocument's extractors; s6 only routes requests to them, never touching the IR shape or provenance (k8/k11). |
| `sc3` | consumes | Every surface returns the existing RenderedDocumentShell verbatim; the MCP surface shapes it with RENDERED_DOCUMENT_SHELL_SCHEMA. No shell change. |
| `sc4` | consumes | All surfaces resolve to the shared DocGenOutcome envelope; the ac3 registered/indexed precondition reuses its source-not-ready variant, and the MCP output is shaped by DOCGEN_OUTCOME_SCHEMA. Reporting is implemented once, not per surface (k11). |

## Error paths

### Error cases

- **A document is requested for a repo that is not registered, or is registered but has not finished indexing (no pinned graph revision).** (recoverable)
  - Detection: generateDocument runs the registered/indexed precondition before extraction: it checks the target repo against the repo registry / the presence of a pinned graph index revision and finds it absent (the extractors already surface the no-revision case as source-not-ready).
  - Response: Return sc4 source-not-ready with an actionable reason (register + finish indexing the repo); no extraction runs and no shell is produced.
  - User impact: The caller on any surface learns the repo must be registered/indexed rather than receiving an empty or partially-populated document (ac3).
- **An unknown docType is requested on any surface.** (recoverable)
  - Detection: docgenRegistry.get(docType) returns undefined inside generateDocument.
  - Response: Return sc4 not-found carrying the unknown docType symbol; surfaces render it via describeOutcome (tool) / DOCGEN_OUTCOME_SCHEMA (MCP).
  - User impact: The caller sees the exact unrecognised type and can re-enumerate the valid ones via listDocTypes (ac4).
- **A per-type required input is missing now that the surfaces forward the whole input (e.g. call-sequence without a symbol, narrative without a question/base).** (recoverable)
  - Detection: The resolved extractor's parseScope validates the forwarded input against its own requirements and returns undefined, which the extractor maps to empty-scope.
  - Response: Return sc4 empty-scope with the extractor's reason naming what the doc type needs; no partial document.
  - User impact: The caller learns which field the chosen doc type requires — a capability previously unreachable entirely on the tool/IPC surfaces (ac1).
- **The MCP tool cannot reach the daemon (socket down, daemon not started) or the IPC call errors.** (recoverable)
  - Detection: The MCP handler's unary RPC to docgen.generate/docgen.list rejects or returns a transport error over the daemon socket.
  - Response: The handler catches it and returns a CallToolResult isError with an actionable reason (daemon not reachable), never a partial/fabricated document; the read is never attempted in the MCP process (ac2).
  - User impact: The assistant caller is told the daemon is unreachable and how to recover, distinct from a content-level failure.
- **The generalized surface input schema drifts from the registry (a hand-maintained copy is introduced).** (recoverable)
  - Detection: The parity contract test asserts each surface's advertised docTypes + per-type input fields equal listDocTypes()/the docgen.list IPC output; a divergence fails the test.
  - Response: Build fails in CI before merge; the surface is forced back to enumerating the registry rather than a hand-written list (k4).
  - User impact: Prevents a capability appearing on one surface but missing/mis-described on another from ever shipping (ac1/ac4).

### Edge cases

| Input | Expected |
| :--- | :--- |
| The same {docType, repo, scope} requested through the daemon tool, the IPC method, and the MCP tool. | All three yield an equivalent document — the same DocGenOutcome status and (for ok) the same RenderedDocumentShell docType/backend — because they funnel through the one generateDocument (ac1). |
| A doc type whose only inputs are {repo} (+optional path), e.g. type-structure, requested via the generalized registry-derived schema. | Works unchanged — the union schema keeps repo required + path optional, so pre-s6 {docType,repo,path} requests remain valid (backward-compatible). |
| Capabilities enumerated on each surface before any document is generated. | All four registered doc types (type-structure, component-dependency, call-sequence, narrative) appear identically on the tool inputSchema, the docgen.list IPC, and the MCP tool, each with its capability.summary (ac4). |
| A hypothetical 5th doc type registered into docgenRegistry later. | It appears on all three surfaces with no surface-code edit, because every surface enumerates listDocTypes() (ac4). |
| A caller passes extra/unknown keys in the input object alongside the valid ones. | The whole input is forwarded; the extractor's parseScope reads only the keys it needs and ignores the rest — no hard failure from surplus keys (permissive pass-through). |

### Invariants to preserve

- The existing IPC method names (docgen.generate, docgen.list) and the daemon tool id (docgen_generate / DOCGEN_TOOL_ID) stay stable — the IDE fork + mirrored IPC types depend on them; s6 generalizes their input handling without renaming the surfaces. [[c6]]
- Pre-s6 requests using the {docType, repo, path} shape for type-structure + component-dependency keep working byte-identically — the generalized schema keeps repo required and path optional, so no previously-valid request breaks. [[c6]]
- Reads stay daemon-side: no surface (tool/IPC/MCP) imports generateDocument into its own process; the MCP tool reaches the graph only over the daemon socket, returning just the finished outcome (k2). [[c10]]
- Capability enumeration remains single-source from docgenRegistry via listDocTypes()/toSerializable — s6 adds no hand-maintained per-surface doc-type list (k4). [[c6]]

## Test strategy

**Test framework:** `node:test + node:assert/strict, run via npx tsx --test (the repo's existing docgen + MCP convention). Parity/enumeration are pure in-process assertions; the MCP handler is tested against a fake daemon-RPC seam so no live daemon is required.`

### Test levels

- **contract** — Prove all three surfaces enumerate the SAME registry (no hand-maintained list, no drift) — the k4 parity guarantee.
  - Subjects: `The daemon tool's advertised docTypes + per-type input fields equal listDocTypes() (docType + capability.summary + extractorInputSchema union)`, `The MCP tool's derived inputSchema is built from listDocTypes()/docgen.list output, not a hand-written list — same docType set + per-type fields as the tool`, `docgen.list IPC returns exactly listDocTypes(); the three advertised capability sets are identical`, `A doc type absent from one surface fails the parity assertion (drift guard)`
  - Fixtures: `The bootstrapped docgenRegistry (all four s1-s4 types)`, `A helper extracting the advertised docType set + input-field union from each surface descriptor`
- **unit** — Prove the generalized input threading + the centralized source-not-ready precondition on generateDocument, with a fake registry/extractor.
  - Subjects: `generateDocument forwards the WHOLE input to the resolved extractor, so a call-sequence request carrying {repo, symbol} and a narrative request carrying {repo, base, question} reach parseScope (no longer dropped to {repo,path})`, `generateDocument returns source-not-ready for an unregistered/unindexed repo BEFORE extraction (ac3), and not-found for an unknown docType`, `a per-type required field missing (call-sequence without symbol) surfaces empty-scope with the extractor's reason`, `the docgen_generate tool execute() forwards the full validated input (not just {repo,path}) and renders non-ok via describeOutcome`, `backward-compat: a {docType:'type-structure', repo, path} request still validates + runs unchanged`
  - Fixtures: `A fake DocTypeRegistry with a recording extractor that echoes the input it received`, `A stub repo-registry/index-revision state (registered+indexed vs absent)`
- **unit** — Prove the new MCP tool handler keeps reads daemon-side and shapes output per the schema, against a fake daemon-RPC seam.
  - Subjects: `the insrc_docgen handler resolves the repo via resolveRepoPath then calls the docgen.generate/docgen.list IPC seam — it never imports/invokes generateDocument in-process (ac2)`, `an ok DocGenOutcome from the seam is returned shaped by DOCGEN_OUTCOME_SCHEMA / RENDERED_DOCUMENT_SHELL_SCHEMA`, `a non-ok outcome (source-not-ready/not-found/empty-scope) is surfaced as a CallToolResult isError carrying the reason (ac3)`, `a daemon-unreachable RPC rejection becomes an actionable isError, not a fabricated document`
  - Fixtures: `A fake unary-RPC dep returning canned DocGenOutcome / rejection`, `A stubbed resolveRepoPath via its injectable deps`
- **integration** — Prove equivalence: the same request through each surface yields the same DocGenOutcome status against one shared in-process generateDocument.
  - Subjects: `the same {docType, repo, scope} routed through the tool execute(), the docgen.generate IPC handler, and the MCP handler (over a fake in-process daemon) yields the SAME DocGenOutcome status + (for ok) the same shell docType/backend (ac1)`, `call-sequence and narrative — previously unreachable on tool/IPC — now succeed identically on all three (ac1)`
  - Fixtures: `An in-process wiring of the three surface adapters over a single fake/real generateDocument`
- **live** — End-to-end smoke over the real daemon (gated), proving parity + daemon-owned reads against a genuinely registered+indexed repo.
  - Subjects: `against a registered+indexed repo, docgen.generate IPC + the insrc_docgen MCP tool each return an ok self-contained shell for the same request (ac1/ac2)`, `an unregistered repo path returns source-not-ready over the live IPC (ac3)`
  - Fixtures: `INSRC_LIVE_TESTS gate + a running daemon with a registered+indexed repo; skips cleanly when unset`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `contract: the tool + MCP + docgen.list IPC advertise the identical docType set + per-type input fields from listDocTypes()`, `integration: same {docType,repo,scope} through all three surfaces yields the same DocGenOutcome status; call-sequence + narrative now reachable on every surface`, `live: docgen.generate IPC + insrc_docgen MCP return equivalent ok shells for the same request` |
| `ac2` | `unit: the insrc_docgen handler calls the daemon RPC seam and never imports/runs generateDocument in-process`, `live: the MCP tool returns only the finished outcome from a registered repo, performing no store access in the MCP process` |
| `ac3` | `unit: generateDocument returns source-not-ready for an unregistered/unindexed repo before extraction; empty-scope for a missing per-type field`, `unit: the MCP handler surfaces a non-ok outcome as an actionable isError`, `live: an unregistered repo path returns source-not-ready over the live IPC` |
| `ac4` | `contract: enumerating capabilities on each surface lists all four registered doc types with their capability.summary from the single registry`, `contract: a doc type registered only in docgenRegistry appears on all three surfaces without a per-surface edit (drift guard)` |

## Alternatives considered

### a1: Shared daemon-side request boundary + registry-derived input schemas (whole-input pass-through) — **CHOSEN**

generateDocument runs the registered/indexed precondition then already forwards the WHOLE input to each extractor; all three surfaces become thin adapters that forward raw args and derive their advertised input schema from listDocTypes()[].extractorInputSchema; the MCP tool is added as the missing surface.



### a2: Per-doc-type discriminated input schema validated at each surface

Each surface generates a oneOf-over-docType input schema from the registry and validates the caller's input against the selected type's branch BEFORE calling the daemon.



**Rejected because:** Best ac4 field-level discoverability but L cost: a schema-composition + ajv validation layer wired into all three surfaces plus a requiredness-duplication risk (parseScope vs composed schema, an sc4 drift risk) the M-sized Story does not warrant.

### a3: Opaque params bag ({docType, repo, params}) with daemon-only validation

Every surface accepts a fixed {docType, repo, params} envelope and forwards params untouched; no per-type input schema advertised anywhere.



**Rejected because:** Violates ac4 — enumeration advertises no per-type inputs, so a discovering agent can't see call-sequence needs a symbol or narrative a question — and under-uses sc2's extractorInputSchema, throwing away the discoverability the registry exists to provide.

## Citations

- **[[c1]]** `code` `src/docgen/index.ts — generateDocument (resolve->extract->assembleShell; already whole-passes input to reg.extract) + listDocTypes + docgenRegistry: the single generation + enumeration entry points s6 wires to three surfaces`
- **[[c2]]** `code` `src/docgen/registry.ts toSerializable — the {docType,capability,extractorInputSchema} projection every surface enumerates (k4)`
- **[[c3]]** `code` `src/docgen/tool.ts — docgenTool/DOCGEN_TOOL_ID='docgen_generate'/registerDocgenTool/describeOutcome: the daemon tool surface whose {docType,repo,path} inputSchema + execute() s6 generalizes`
- **[[c4]]** `code` `src/daemon/index.ts (~1157) 'docgen.generate' + 'docgen.list' handlers — the IPC surface (currently destructures only {docType,repo,path}) s6 generalizes to forward the whole input`
- **[[c5]]** `code` `src/mcp/server.ts server.registerTool(name,{title,description,annotations,inputSchema},handler) — the 8-registration pattern the new insrc_docgen MCP tool follows`
- **[[c6]]** `code` `src/docgen/schema.ts RENDERED_DOCUMENT_SHELL_SCHEMA + DOCGEN_OUTCOME_SCHEMA — the hand-mirrored MCP output shape (schema.test.ts pins it)`
- **[[c7]]** `code` `src/mcp/resolve-repo.ts resolveRepoPath + src/mcp/daemon-stream.ts unary RPC helpers — the MCP-tool repo resolution + daemon-owned read path (ac2)`
- **[[c8]]** `code` `src/docgen/extract/narrative.ts NARRATIVE_INPUT_SCHEMA (repo/base/question + symbol/path/maxDepth) + src/docgen/extract/call-sequence.ts — the per-type inputs the current {repo,path} threading drops, making those types unreachable pre-s6`
- **[[c9]]** `convention` `HLD k4 (c6): the capability must be exposed as a daemon tool, an IPC method, AND an MCP tool, enumerated from one registry`
- **[[c10]]** `convention` `HLD k2 (c10): the daemon owns all DB access; MCP/tool/IPC callers reach graph content only over IPC`
- **[[c11]]** `step-output` `s8 checklist.verify — all 18 items passed (cd1-3, dm1-2, int1-2, ep1-3, ts1-2, mg1-2, alt1-2, sbdry1-4)`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 11 LOW** · model `client` · reviewed 2026-07-31T12:32:23.151Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| c1 | semantic | LOW | manual | generateDocument in src/docgen/index.ts already forwards the WHOLE input object to the resolved extractor (reg.extract(input)) rather than a reconstructed {repo,path} — the hinge that makes a1's whole-input pass-through require no generateDocument signature change. | src/docgen/index.ts:70 `const ir = await reg.extract(input);` — the whole input object is passed to the extractor; :68 docgenRegistry.get(docType). The a1 no-signature-change hinge is real. Confirmed. | none |
| c3 | citation | LOW | manual | src/docgen/tool.ts currently hard-threads only {docType,repo,path}: its execute() builds extractInput={repo}(+path) and its inputSchema fixes properties to docType/repo/path — the gap s6 generalizes. | tool.ts:68 `const extractInput: Record<string,unknown> = { repo };` + :69 adds only path; DOCGEN_TOOL_ID='docgen_generate' (:25). The {repo,path}-only threading gap is real and localized to tool.ts. Confirmed. | none |
| c4 | citation | LOW | manual | src/daemon/index.ts registers 'docgen.generate' and 'docgen.list' IPC handlers, and docgen.generate currently destructures only {docType, repo, path}. | daemon/index.ts:1157 'docgen.generate' handler, :1158 `const { docType, repo, path } = params`; :1165 'docgen.list'. The IPC surface + its {docType,repo,path} destructuring exist as described. Confirmed. | none |
| insrc_docgen | citation | LOW | manual | There is currently NO docgen MCP surface: src/mcp/ contains no docgen tool registration, so insrc_docgen is genuinely the missing third surface s6 adds. | grep insrc_docgen + docgen over src/ returns 0 hits in src/mcp (matches are docs only). No docgen MCP surface exists yet — insrc_docgen is genuinely the missing third surface. Confirmed. | none |
| c5 | citation | LOW | manual | src/mcp/server.ts registers MCP tools via server.registerTool(name, {title, description, annotations, inputSchema}, handler) — the pattern insrc_docgen follows. | src/mcp/server.ts:128 (and 7 more) `server.registerTool(` — the registration pattern insrc_docgen follows. Confirmed. | none |
| c6 | citation | LOW | manual | src/docgen/schema.ts exports RENDERED_DOCUMENT_SHELL_SCHEMA and DOCGEN_OUTCOME_SCHEMA — the hand-mirrored MCP output shapes the new tool uses. | schema.ts:17 RENDERED_DOCUMENT_SHELL_SCHEMA + DOCGEN_OUTCOME_SCHEMA (pinned by schema.test.ts). The MCP output shapes exist. Confirmed. | none |
| c7 | citation | LOW | manual | src/mcp/resolve-repo.ts exports resolveRepoPath(explicit, deps) for repo resolution and src/mcp/daemon-stream.ts exposes unary daemon RPC helpers — the daemon-owned read path the MCP handler uses (ac2). | src/mcp/resolve-repo.ts:50 `export async function resolveRepoPath(explicit, deps)`; src/mcp/daemon-stream.ts:253/265 startRun/pollRun unary RPC. The MCP daemon-owned read path exists. (Other resolveRepoPath in analyze/ are unrelated namesakes.) Confirmed. | none |
| c8 | semantic | LOW | manual | The narrative doc type requires base+question (NARRATIVE_INPUT_SCHEMA) and call-sequence requires a symbol entry-point — per-type inputs the current {repo,path} threading drops, making those types unreachable on the tool/IPC surfaces pre-s6. | narrative.ts:135 NARRATIVE_INPUT_SCHEMA, :138 `required: ['repo','base','question']` — inputs the {repo,path} threading drops, making narrative unreachable pre-s6. Confirmed. | none |
| c2 | semantic | LOW | manual | toSerializable in src/docgen/registry.ts projects {docType, capability, extractorInputSchema}, and listDocTypes maps the registry through it — the single enumeration source every surface reads, including extractorInputSchema. | registry.ts:94 toSerializable projecting :98 `extractorInputSchema: entry.extractorInputSchema`; listDocTypes maps the registry through it (daemon/index.ts:1167). Single enumeration source incl. extractorInputSchema. Confirmed. | none |
| c3 | citation | LOW | manual | registerDocgenTool() is wired into the daemon tool builtins bootstrap at src/daemon/tools/builtins/index.ts, so the tool surface is registered at daemon boot. | builtins/index.ts:37 import registerDocgenTool + :58 registerDocgenTool() — the tool surface is registered at daemon boot. Confirmed. | none |
| sc4 | semantic | LOW | manual | DocGenOutcome (sc4) already carries the source-not-ready variant that the ac3 registered/indexed precondition reuses, so no new outcome variant is introduced. | outcome.ts:48 `sourceNotReady = <T>(reason) => ({ status: 'source-not-ready', reason })` — the sc4 variant the ac3 precondition reuses already exists; no new variant. Confirmed. | none |
