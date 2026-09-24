<!-- insrc:artifact LLD-38905b56cb44c4cf-s1 -->

# LLD: E2026092438905b56:S001

**Epic:** `work-framed-approved-spec-proceed-from`
**HLD base run:** `wf-1790248075351-dbqnsq`
**HLD effective hash:** `b8f0f1bf4237...`

## HLD context

**Framework:** On-demand controller guidance is delivered by two independent read-only surfaces, each reading its source of truth WHERE THAT SOURCE ALREADY LIVES, plus a steering restructure that shrinks the injected block and points at those surfaces. sc-schema (S001) is an MCP-server-side read-only tool that serves the exact input contract for a requested insrc_* tool (+phase) by slicing the tool's own registered zod inputSchema — the same object the MCP SDK validates against — so there is no copy (k1) and no round-trip. sc-guide (S002) is the daemon-IPC-first + thin-MCP-wrapper shape proven by docgen: a daemon-owned guide.get / guide.list IPC reads the canonical steering content inside the daemon and returns one workflow's section, fronted by a thin insrc_guide MCP tool. Both surfaces are per-task (k2), read-only (k5), and return structured non-throwing results with the valid options on error (k3). S003 then authors, in the canonical steering source, a thin skeleton (front-door decision tree + a catalog of the available insrc_* / IPC calls, the insrc_build_step doc, the schema-first rule, and an insrc_schema self-entry) and moves each workflow's full procedural detail into the per-workflow sections sc-guide serves — propagated to every registered repo by the existing steering-refresh (k4).
**Rollout phase:** Phase A — the two on-demand surfaces (foundational)
**Owns:** `sc1` (insrc_schema shape-lookup surface)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s2`: Private to S002: how the daemon reads the canonical steering content it already loads and partitions it into per-workflow sections; the guide.get/guide.list IPC handlers on the daemon method map; the thin insrc_guide MCP wrapper that forwards to those IPCs; and the structured-error shaping for an omitted/unknown workflow. Only the sc2 surface (the MCP tool result + the section-addressing key set) is consumed downstream; the partition/read mechanism stays private. — owns `sc2`
- `s3`: Private to S003: the actual authored steering content — the compact skeleton (front-door decision tree + the catalog of available insrc_* / IPC calls, the insrc_build_step documentation, the 'call insrc_schema before guessing a shape' rule, and the insrc_schema self-entry) and the concrete decision of which minimal orientation stays inline in the skeleton versus which per-workflow detail moves into sc2's sections. It consumes sc1 (names insrc_schema + its call/response shape in the catalog and self-entry) and sc2 (the skeleton directs the controller to fetch per-workflow detail via insrc_guide, and the moved detail is authored into sc2's per-workflow section partition), and it rides the existing steering-refresh for propagation. No other Story consumes S003.

## Contract details

**Surface level:** internal-shared

### `insrc_schema`

```typescript
// MCP tool registered in buildInsrcMcpServer via server.registerTool('insrc_schema', { title, description, inputSchema: SCHEMA_INPUT }, handleInsrcSchema)
```

**Parameters:**
- `tool: string` — The insrc_* tool whose input contract the controller wants (e.g. 'insrc_workflow_step').
- `phase: string` _(optional)_ — For a multi-turn tool, the specific phase whose contract is wanted (e.g. 'plan'); ignored for a phaseless tool.

**Returns:** `InsrcSchemaResult` — A structured, never-thrown result: InsrcSchemaOk (schema + description [+ validPhases]) on a hit, or InsrcSchemaError (error + validTools|validPhases) on a miss.

**Errors:**
- `InsrcSchemaError (structured, not thrown)` when tool omitted or unrecognized -> { error, validTools }; multi-turn tool with phase omitted -> { error, validPhases }; multi-turn tool with an unknown phase -> { error, validPhases }.

**Preconditions:**
- The insrc-mcp server (buildInsrcMcpServer) is running and has registered its tools, so the side-registry is populated.

**Postconditions:**
- No state is read from disk or the daemon and none is mutated (k5).
- The returned schema is derived from the SAME zod raw shape passed to registerTool for that tool (k1) — never a hand-maintained copy.

### `handleInsrcSchema`

```typescript
export function handleInsrcSchema(input: InsrcSchemaInput, registry: InsrcToolSchemaRegistry): InsrcSchemaResult
```

**Parameters:**
- `input: InsrcSchemaInput` — The { tool, phase? } lookup request.
- `registry: InsrcToolSchemaRegistry` — The injected name->record map (a seam for isolated unit testing), populated at registration time.

**Returns:** `InsrcSchemaResult` — The pure lookup+slice result; the MCP tool wrapper adapts it into the tool response envelope.

**Errors:**
- `none thrown` when All failure modes return an InsrcSchemaError value (k3).

**Preconditions:**
- registry is the map buildInsrcMcpServer populated from the registerTool callsites.

**Postconditions:**
- Pure: depends only on input + registry; performs no I/O and no mutation.
- For a phaseless tool a spurious phase is ignored, not rejected (ac3).

### `buildInsrcMcpServer`

```typescript
export function buildInsrcMcpServer(deps?: BuildServerDeps): McpServer  // reshaped: also populates an InsrcToolSchemaRegistry from the same shapes it passes to registerTool
```

**Parameters:**
- `deps: BuildServerDeps | undefined` _(optional)_ — Existing assembly dependencies; unchanged in shape.

**Returns:** `McpServer` — The assembled insrc-mcp server, now with insrc_schema registered and the side-registry recorded from every registerTool call (including insrc_schema's own self-entry).

**Errors:**
- `none new` when Registration failures surface exactly as today; recording is in-process and additive.

**Preconditions:**
- Each existing registerTool call passes its zod raw shape as today.

**Postconditions:**
- Every registered insrc_* tool has a matching InsrcToolSchemaRecord (the registry key set == the registered tool set).
- The recorded rawShape is object-identical to the shape passed to registerTool (k1).

## Data model changes

### `InsrcToolSchemaRecord` — new

One entry per registered insrc_* tool: { name: string; description: string; rawShape: ZodRawShape; phases?: string[]; dynamicNote?: string }. rawShape is the exact object handed to registerTool (JSON Schema is derived on demand via the SDK's zod-to-json-schema, not stored). phases is the accepted phase-name list for a multi-turn tool (absent for a phaseless tool). dynamicNote is present only for a call whose inner payload is generated during the run (ac5).

```
+ interface InsrcToolSchemaRecord { name: string; description: string; rawShape: ZodRawShape; phases?: string[]; dynamicNote?: string }
```

**Call sites:**
- `src/mcp/server.ts (buildInsrcMcpServer — one record recorded per server.registerTool call, lines 130/185/316/440/501/566/635/692/757/805)`

### `InsrcToolSchemaRegistry` — new

A ReadonlyMap<string, InsrcToolSchemaRecord> (tool name -> record) built at registration time and read by handleInsrcSchema. Its key set is the authoritative validTools list returned on an unknown/omitted tool (ac4).

```
+ type InsrcToolSchemaRegistry = ReadonlyMap<string, InsrcToolSchemaRecord>
```

**Call sites:**
- `src/mcp/server.ts (populated in buildInsrcMcpServer)`
- `src/mcp/schema/handler.ts (read by handleInsrcSchema)`

### `InsrcSchemaInput / InsrcSchemaOk / InsrcSchemaError / InsrcSchemaResult` — new

The sc1 tool I/O types exactly as sketched in the HLD: InsrcSchemaInput { tool: string; phase?: string }; InsrcSchemaOk { schema: JsonSchema; description: string; validPhases?: string[] }; InsrcSchemaError { error: string; validTools?: string[]; validPhases?: string[] }; InsrcSchemaResult = InsrcSchemaOk | InsrcSchemaError; JsonSchema = Record<string, unknown>. An InsrcSchemaOk for a dynamic-inner-payload call additionally carries the dynamicNote text within/alongside description (ac5).

```
+ interface InsrcSchemaInput { tool: string; phase?: string }
+ interface InsrcSchemaOk { schema: JsonSchema; description: string; validPhases?: string[] }
+ interface InsrcSchemaError { error: string; validTools?: string[]; validPhases?: string[] }
+ type InsrcSchemaResult = InsrcSchemaOk | InsrcSchemaError
```

**Call sites:**
- `src/mcp/schema/schema.ts (type definitions)`
- `src/mcp/schema/handler.ts (handleInsrcSchema)`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | implements | S001 owns sc1 (HLD: ownedByStory s1). This contract IS sc1: insrc_schema exposes InsrcSchemaInput -> InsrcSchemaResult exactly as the HLD interfaceSketch declares, deriving InsrcSchemaOk.schema from the registered zod raw shape (k1), returning validPhases/validTools structured errors (k3), and never throwing (k5). Downstream, S003 consumes this surface by name in the steering catalog + schema-first rule + the insrc_schema self-entry — which is itself one InsrcToolSchemaRecord recorded when insrc_schema registers, so the tool is introspectable about itself. |

## Error paths

### Error cases

- **Lookup names no tool (tool field absent/empty).** (recoverable)
  - Detection: handleInsrcSchema sees input.tool is undefined/empty before any registry lookup.
  - Response: Return InsrcSchemaError { error: '<tool> is required', validTools: [...registry.keys()] } — a structured value, never thrown (k3, ac4).
  - User impact: The controller learns the exact set of valid tool names and re-asks in one follow-up call.
- **Lookup names an unrecognized tool (not a registered insrc_* tool).** (recoverable)
  - Detection: registry.get(input.tool) returns undefined.
  - Response: Return InsrcSchemaError { error: 'unknown tool <name>', validTools: [...registry.keys()] } (k3, ac4).
  - User impact: Controller sees it mistyped/guessed the tool name and corrects against the authoritative list.
- **Multi-turn tool looked up with phase omitted.** (recoverable)
  - Detection: The matched record has a non-empty phases[] but input.phase is undefined.
  - Response: Return InsrcSchemaError { error: 'phase required for <tool>', validPhases: record.phases } — no schema guessed (k2/k3, ac2).
  - User impact: Controller learns which phase names are valid and re-asks for the specific one it is on.
- **Multi-turn tool looked up with an unknown phase name.** (recoverable)
  - Detection: The matched record has phases[] and input.phase is not a member of it.
  - Response: Return InsrcSchemaError { error: 'unknown phase <phase> for <tool>', validPhases: record.phases } (k3, ac2).
  - User impact: Controller corrects the phase against the valid set in one follow-up call.
- **A registered tool's zod raw shape fails to convert to JSON Schema (zod-to-json-schema throws internally).** (recoverable)
  - Detection: The JSON-Schema derivation call is wrapped; a thrown conversion error is caught inside handleInsrcSchema.
  - Response: Return InsrcSchemaError { error: 'schema unavailable for <tool>' } rather than letting the throw escape as a tool error (k3, k5).
  - User impact: Controller gets a clean structured miss instead of an opaque tool crash; this path should not occur for the shipped shapes (guarded by a test converting every registered shape).

### Edge cases

| Input | Expected |
| :--- | :--- |
| A phaseless tool (e.g. insrc_workflow_approve / insrc_docgen / insrc_analyze) looked up WITH a spurious phase field. | The record has no phases[]; the phase is ignored and the single input contract is returned as InsrcSchemaOk (ac3) — not rejected. |
| insrc_schema looks up ITSELF (tool: 'insrc_schema'). | Its own InsrcToolSchemaRecord (recorded when it registered) is returned — the tool is self-introspectable, which S003's self-entry relies on. |
| A multi-turn call whose inner payload is generated during the run (e.g. the plan/step/bundle body a run hands back), looked up at that phase. | InsrcSchemaOk returns the fixed OUTER envelope for that phase plus the record's dynamicNote stating the run's own latest response carries the authoritative inner shape (ac5) — the outer contract reflecting what the handler enforces, not a hand-copied inner schema. |
| Tool name supplied with correct value but different casing/whitespace. | Registry lookup is exact-match on the registered tool name; a non-exact key misses and returns validTools (ac4) — consistent, no fuzzy matching that could mislead. |

## Test strategy

**Test framework:** `node:test via `npx tsx --test` (the src/mcp/__tests__/ convention, matching analyze-step-handler.test.ts).`

### Test levels

- **unit** — Prove handleInsrcSchema's pure lookup+slice logic over an injected registry across every hit/miss branch, with no live server.
  - Subjects: `handleInsrcSchema(input, registry) — phaseless hit, multi-turn hit with phase, multi-turn phase-omitted miss, multi-turn unknown-phase miss, unknown tool miss, omitted tool miss, self-lookup, dynamic-note case`, `The JSON-Schema derivation of a record's rawShape (zod-to-json-schema) yields a non-empty Record for a representative shape`
  - Fixtures: `A small hand-built InsrcToolSchemaRegistry with one phaseless record, one multi-turn record (phases[] + one phase whose rawShape is distinctive), and one dynamicNote record`
- **integration** — Prove buildInsrcMcpServer records a registry whose key set equals the actually-registered insrc_* tool set and whose recorded rawShape is object-identical to what registerTool received — the k1 no-drift guarantee — and that insrc_schema self-registers.
  - Subjects: `buildInsrcMcpServer() — registry key set == registered tool set (all 11 incl. insrc_schema)`, `Every recorded rawShape converts to JSON Schema without throwing (guards the zod-to-json-schema error path)`, `Each multi-turn record's phases[] is a subset of / equals its handler's accepted phase names (lockstep guard against phase-metadata drift)`
  - Fixtures: `The real buildInsrcMcpServer output (no external I/O; assembly is in-process)`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: handleInsrcSchema returns InsrcSchemaOk { schema, validPhases } for a multi-turn tool + valid phase, schema derived from the record's rawShape`, `integration: the multi-turn record's rawShape is object-identical to the registerTool shape (k1)` |
| `ac2` | `unit: handleInsrcSchema with a multi-turn tool and phase omitted returns InsrcSchemaError { error, validPhases } and no schema` |
| `ac3` | `unit: handleInsrcSchema for a phaseless tool with a spurious phase returns InsrcSchemaOk (phase ignored, not rejected)`, `unit: same phaseless tool with no phase returns the identical InsrcSchemaOk` |
| `ac4` | `unit: handleInsrcSchema with tool omitted returns InsrcSchemaError { error, validTools } and never throws`, `unit: handleInsrcSchema with an unknown tool name returns InsrcSchemaError { error, validTools }`, `integration: validTools equals buildInsrcMcpServer's registry key set` |
| `ac5` | `unit: handleInsrcSchema for a record carrying dynamicNote returns InsrcSchemaOk with the fixed outer envelope plus the dynamicNote text` |

## Alternatives considered

### a1: Registration-time side-registry inside buildInsrcMcpServer — **CHOSEN**

As each tool is registered, buildInsrcMcpServer also pushes { name, description, zodRawShape, phases?, dynamicNote? } into a local registry the insrc_schema handler slices.

buildInsrcMcpServer already calls server.registerTool(name, { description, inputSchema: <zodRawShape> }, handler) for all 10 tools. Add a thin local recorder invoked at the SAME callsite (a helper registerAndRecord, or a post-registration push) that captures, per tool, the EXACT zodRawShape object handed to registerTool plus explicit static metadata: the phase-name list for multi-turn tools (drawn from each handler's known phase router), and a dynamicNote for tools whose inner payload is generated at run time (ac5). insrc_schema's handler receives { tool, phase? } and looks the tool up in this registry: for a phaseless tool it derives JSON Schema from the raw shape via zod-to-json-schema (spurious phase ignored, ac3); for a multi-turn tool with a named phase it returns the schema + validPhases (ac1); with no phase it returns validPhases only (ac2); for a dynamic-inner-payload call it returns the outer envelope + the note (ac5); unknown/omitted tool returns validTools (ac4). The registry is single-sourced because it stores the same object passed to registerTool — no re-declaration.

### a2: Per-tool schema-descriptor module consumed by BOTH registration and lookup

Each tool's schema.ts exports a descriptor { rawShape, phases?, dynamicNote? }; server.ts registers from it and insrc_schema reads the same descriptors via an index.

Introduce a uniform per-tool descriptor: each existing *-step/schema.ts (and a small descriptor for the one-shot tools) exports describeTool() -> { rawShape, phases?, dynamicNote?, description }. buildInsrcMcpServer registers each tool FROM that descriptor's rawShape (so registration and lookup read one object), and a src/mcp/schema/catalog.ts index imports every descriptor into a name->descriptor map that the insrc_schema handler slices with the same per-case logic as a1 (ac1-ac5). This co-locates each tool's shape + phase list with the tool itself rather than at the central registry.

**Rejected because:** Functionally satisfies every criterion and is the truest single-source (registration + lookup share the descriptor), but it costs L: it requires refactoring all 10 existing per-tool schema.ts files and rewiring the working registrations, exceeding the Story's M size and risking regressions in already-shipped tools for no additional acceptance-criterion coverage over a1. Better as a later refactor than this Story's build.

### a3: Reflect the SDK McpServer's private registered-tools map at request time

insrc_schema reads the @modelcontextprotocol/sdk McpServer's internal _registeredTools map to recover each tool's schema at lookup time.

Rather than record anything at registration, the insrc_schema handler reaches into the McpServer instance's private _registeredTools (or equivalent internal field) at request time, pulls the stored zod/JSON schema for the requested tool, and returns it. Phase metadata — absent from the SDK's stored shape — would be layered from a small side-table anyway.

**Rejected because:** Weakest: it depends on a private, undocumented @modelcontextprotocol/sdk internal (_registeredTools) that can break on version bumps, and it STILL needs the same phase/dynamicNote side-metadata as a1 (ac1/ac2/ac5 only partial) — so it inherits a1's metadata cost while adding SDK-internal brittleness and a harder test setup, with no compensating benefit.

## Citations

- **[[c1]]** `analyze-bundle` `s1 capability-discovery: no get-schema surface exists (src/mcp/server.ts, src/mcp/analyze-step/handler.ts, src/daemon/tools/registry.ts)` — "NO dedicated get-schema surface exists ... The daemon built-in tool registry lists the ~110 DAEMON capability tools, NOT the insrc_* MCP tool shapes. Confirms sc1 is net-new."
- **[[c2]]** `analyze-bundle` `s1 how-does-it-work: registerTool declares a zod raw shape; phases are procedural; SDK keeps tools in a private map (src/mcp/server.ts, src/mcp/__tests__/analyze-step-handler.test.ts)` — "buildInsrcMcpServer registers 10 tools via server.registerTool(name, { inputSchema: <zodRawShape> }, handler); multi-turn tools validate phase PROCEDURALLY inside each handler; the SDK McpServer keeps"
- **[[c3]]** `analyze-bundle` `s1 structural-map: src/mcp/ per-tool subdir convention + __tests__ + the 10 registered tool names (src/mcp/server.ts, src/mcp/__tests__/)` — "src/mcp/ = server.ts + one subdir per multi-turn tool (handler.ts + schema.ts); tests in src/mcp/__tests__/ (node:test via tsx --test); a new insrc_schema follows the convention: src/mcp/schema/ + reg"
- **[[c4]]** `step-output` `s3 alternatives.judge: a1 (registration-time side-registry) chosen over a2 (L refactor) and a3 (SDK-internals) against ac1-ac5 + sc1` — "a1 is the only alternative that satisfies all five acceptance criteria AND sc1 at the Story's M size without SDK-internal coupling."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 8 LOW** · model `client` · reviewed 2026-09-24T11:32:41.459Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| contract/buildInsrcMcpServer | citation | LOW | manual | src/mcp/server.ts exports buildInsrcMcpServer, which is the single assembly site that calls server.registerTool for each insrc_* tool. | Confirmed: src/mcp/server.ts is the assembly site (buildInsrcMcpServer) and server.registerTool is called there (earlier direct grep: 10 registerTool calls in server.ts). The probe's grep hits are dominated by docs/, but the reads on server.ts resolved and the direct source check confirms the symbol. | No change — citation resolves. |
| dataModel/InsrcToolSchemaRecord | inventory | LOW | manual | server.ts registers exactly 10 insrc_* tools via server.registerTool, one InsrcToolSchemaRecord per call. | Confirmed by direct source grep: exactly 10 `server.registerTool(` calls in src/mcp/server.ts, matching the one-record-per-tool inventory. | No change — inventory resolves. |
| dataModel/InsrcToolSchemaRecord callSites | citation | LOW | manual | The 10 server.registerTool calls in src/mcp/server.ts sit at lines 130, 185, 316, 440, 501, 566, 635, 692, 757, 805. | The probe's reads on src/mcp/server.ts:130/185/316/805 all resolved (found:true); the earlier direct grep listed the registerTool calls at exactly 130/185/316/440/501/566/635/692/757/805. | No change — line anchors resolve. |
| contract/registration | external-contract | LOW | manual | server.registerTool accepts a config object with an inputSchema field (a zod raw shape), matching the call shape the LLD reshapes. | Confirmed: src/mcp/server.ts:162 (read found:true) carries `inputSchema: ANALYZE_INPUT`; the registerTool config takes an inputSchema zod raw shape as the LLD describes. | No change — registration contract resolves. |
| testStrategy/convention | citation | LOW | manual | The MCP test convention is node:test under src/mcp/__tests__/, e.g. analyze-step-handler.test.ts, which the new schema-handler test extends. | Confirmed: src/mcp/__tests__/analyze-step-handler.test.ts exists (read found:true); node:test-under-__tests__ is the convention the new schema-handler test extends. | No change — test convention resolves. |
| contract/zod-to-json-schema | external-contract | LOW | assisted | A zod-to-json-schema conversion path is available in the codebase's dependencies for deriving JSON Schema from a registered zod raw shape. | Confirmed available but with a build refinement: node_modules/zod-to-json-schema is installed, AND the MCP SDK ships its own conversion (dist/esm/server/zod-json-schema-compat.js + getZodSchemaObject/normalizeObjectSchema in mcp.js) which is exactly what the SDK uses to advertise each tool's schema. So the derivation path exists. NOTE for the build: prefer reusing the SDK's own conversion (the schema the SDK actually advertises) over a separately-imported zod-to-json-schema, so insrc_schema returns byte-identical output to the live tool schema (tightening k1) and avoids depending on a possibly-undeclared direct dependency. | Carry a build-time note: derive the JSON Schema via the SAME path the SDK uses to advertise it (getZodSchemaObject / zod-json-schema-compat), not a separate zod-to-json-schema import, to guarantee the served schema equals the enforced one (k1). |
| boundary | cross-artifact | LOW | manual | S001 owns sc1 and does not implement sc2 (owned by s2) or the steering content (owned by s3); s3 consumes sc1 downstream. | Boundary is internally consistent with the approved HLD (read of the HLD.md path failed in the probe's sandbox but the LLD's hldContextSlice is copied verbatim from the approved HLD this session authored): s1 owns sc1, s2 owns sc2, s3 depends on [sc1,sc2]. No sc2/steering scope is designed in this LLD. | No change — boundary trace holds. |
| boundary/no-existing-surface | closed-union | LOW | manual | No insrc_schema tool or handleInsrcSchema exists yet in src/mcp — the tool and its src/mcp/schema/ subdir are net-new. | Confirmed net-new: grep for handleInsrcSchema / InsrcToolSchemaRegistry finds matches ONLY in this LLD (no src/ implementation); insrc_schema as a tool implementation does not yet exist. The src/mcp/schema/ subdir is new. | No change — net-new claim resolves. |

#### Proposed fixes

- **contract/zod-to-json-schema** (assisted) — The converter is present, so the design is buildable; reusing the SDK's own conversion makes the served schema provably identical to what the SDK validates against and sidesteps a possibly-undeclared direct dep. This is a build-stage refinement, not an LLD contract change.
  - option: In the PLAN/build, derive JSON Schema through the SDK's getZodSchemaObject / zod-json-schema-compat path rather than importing zod-to-json-schema directly.
  - option: If importing zod-to-json-schema directly, add it as an explicit dependency in package.json.
