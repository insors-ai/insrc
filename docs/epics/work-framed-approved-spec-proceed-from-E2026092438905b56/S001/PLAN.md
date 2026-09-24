<!-- insrc:artifact PLAN-38905b56cb44c4cf-s1 -->

# Plan: E2026092438905b56:S001

**Epic:** `work-framed-approved-spec-proceed-from`
**LLD run:** `wf-1790249048427-otx3js`
**LLD effective hash:** `b8f0f1bf4237...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** sc1 types module (src/mcp/schema/schema.ts) | S | — | unit: schema-handler.test.ts (types) — tsc/type-shape smoke: SCHEMA_INPUT is a valid zod raw shape and the exported types compile (covered implicitly by the handler unit suite importing them) | [[c1]] [[c2]] |
| 2 | **`t2`** handleInsrcSchema pure handler (src/mcp/schema/handler.ts) | M | `t1` | unit: schema-handler.test.ts: handleInsrcSchema across every hit/miss branch — phaseless hit, multi-turn hit with phase (ac1), multi-turn phase-omitted miss (ac2), multi-turn unknown-phase miss (ac2), unknown tool miss (ac4), omitted tool miss (ac4), self-lookup, dynamic-note case (ac5); asserts never throws (k3); unit: schema-handler.test.ts: phaseless tool with a spurious phase returns InsrcSchemaOk == no-phase result (ac3); unit: schema-handler.test.ts: JSON-Schema derivation of a record's rawShape yields a non-empty Record for a representative shape (via the SDK conversion path) | [[c1]] [[c3]] [[c4]] |
| 3 | **`t3`** Record the side-registry + register insrc_schema in buildInsrcMcpServer | M | `t1`, `t2` | integration: schema-registry.test.ts: buildInsrcMcpServer() registry key set == registered tool set (all 11 incl. insrc_schema); validTools equals the registry key set (ac4); integration: schema-registry.test.ts: every recorded rawShape converts to JSON Schema without throwing (guards the conversion error path); the multi-turn record's rawShape is object-identical to the registerTool shape (k1, ac1); integration: schema-registry.test.ts: each multi-turn record's authored phases[] equals its handler's accepted phase-name set (lockstep guard against phase-metadata drift) | [[c1]] [[c2]] |

### E2026092438905b56:S001:T001 — sc1 types module (src/mcp/schema/schema.ts)

Add src/mcp/schema/schema.ts defining the sc1 I/O + registry types: InsrcSchemaInput { tool: string; phase?: string }, JsonSchema = Record<string, unknown>, InsrcSchemaOk { schema; description; validPhases? }, InsrcSchemaError { error; validTools?; validPhases? }, InsrcSchemaResult union, InsrcToolSchemaRecord { name; description; rawShape: ZodRawShape; phases?; dynamicNote? }, and InsrcToolSchemaRegistry = ReadonlyMap<string, InsrcToolSchemaRecord>. Also the SCHEMA_INPUT zod raw shape for the insrc_schema tool itself ({ tool: z.string(), phase: z.string().optional() }).

**Acceptance checks:**
- src/mcp/schema/schema.ts exports InsrcSchemaInput/Ok/Error/Result, InsrcToolSchemaRecord, InsrcToolSchemaRegistry, and SCHEMA_INPUT, matching the LLD interfaceSketch verbatim.
- tsc passes under strict + exactOptionalPropertyTypes (optionals typed as `| undefined`).

### E2026092438905b56:S001:T002 — handleInsrcSchema pure handler (src/mcp/schema/handler.ts)

Add src/mcp/schema/handler.ts exporting handleInsrcSchema(input, registry): InsrcSchemaResult — the pure lookup+slice. Branches: omitted/empty tool -> { error, validTools }; unknown tool -> { error, validTools }; matched phaseless record (spurious phase ignored) -> { schema, description }; matched multi-turn record with valid phase -> { schema, description, validPhases }; phase omitted -> { error, validPhases }; unknown phase -> { error, validPhases }; dynamicNote record -> { schema (outer), description incl. the note, validPhases? }. Derives JSON Schema from record.rawShape via the SDK's own conversion (getZodSchemaObject / zod-json-schema-compat), wrapped in try/catch -> { error: 'schema unavailable' } on conversion failure. Never throws (k3).

**Acceptance checks:**
- handleInsrcSchema returns a value for every branch and never throws.
- InsrcSchemaOk.schema is derived from record.rawShape via the SDK conversion path (not a hand-copied schema).
- A phaseless record ignores a spurious phase (ac3); multi-turn phase-omitted/unknown returns validPhases (ac2); unknown/omitted tool returns validTools (ac4); dynamicNote surfaces in the Ok result (ac5).

### E2026092438905b56:S001:T003 — Record the side-registry + register insrc_schema in buildInsrcMcpServer

Reshape src/mcp/server.ts buildInsrcMcpServer to populate an InsrcToolSchemaRegistry as it registers tools: add a local registerAndRecord(name, config, handler) helper (or per-callsite push) that calls server.registerTool AND records { name, description: config.description, rawShape: config.inputSchema, phases?, dynamicNote? } for each of the 10 existing tools, storing the SAME inputSchema object (k1). Author the static per-tool phases[] (multi-turn tools) + dynamicNote (run-generated-payload tools) metadata. Register the new insrc_schema tool (readOnlyHint: true) with SCHEMA_INPUT and a handler that calls handleInsrcSchema(args, registry) — recording insrc_schema's own self-entry. Expose the built registry to the handler (closure/return). The phases[] authored per multi-turn tool MUST match that tool's handler phase router (verified by the t3 integration lockstep test).

**Acceptance checks:**
- buildInsrcMcpServer registers insrc_schema (11 tools total) and the registry key set equals the registered insrc_* tool set incl. insrc_schema.
- Each record's rawShape is the exact object passed to registerTool (object-identity, k1).
- Existing 10 registrations are unchanged in behaviour (additive recording only).
- Each multi-turn record's authored phases[] equals its handler's accepted phase-name set (lockstep guard, deterministically tested).

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| handleInsrcSchema(input, registry) — phaseless hit, multi-turn hit with phase, multi-turn phase-omitted miss, multi-turn unknown-phase miss, unknown tool miss, omitted tool miss, self-lookup, dynamic-note case | `t2` |
| The JSON-Schema derivation of a record's rawShape (zod-to-json-schema) yields a non-empty Record for a representative shape | `t2` |
| buildInsrcMcpServer() — registry key set == registered tool set (all 11 incl. insrc_schema) | `t3` |
| Every recorded rawShape converts to JSON Schema without throwing (guards the zod-to-json-schema error path) | `t3` |
| Each multi-turn record's phases[] is a subset of / equals its handler's accepted phase names (lockstep guard against phase-metadata drift) | `t3` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s1 contractDetails + dataModelChanges + interactionWithShared: sc1 = insrc_schema tool + handleInsrcSchema + InsrcToolSchemaRecord/Registry + the InsrcSchema I/O types (implements sc1)` — "insrc_schema exposes InsrcSchemaInput -> InsrcSchemaResult, deriving InsrcSchemaOk.schema from the registered zod raw shape (k1), returning validPhases/validTools structured errors (k3), never throwin"
- **[[c2]]** `analyze-bundle` `plan s1 how-does-it-work: buildInsrcMcpServer registration structure in src/mcp/server.ts (10 registerTool calls; inputSchema is the zod raw shape) + the SDK conversion path` — "buildInsrcMcpServer(): McpServer calls server.registerTool(name, { description, inputSchema: <zodRawShape> }, handler) 10 times; the recorder stores the SAME inputSchema object; JSON Schema is derived"
- **[[c3]]** `prior-artifact` `LLD s1 errorPaths: the handleInsrcSchema branch/edge behaviour (omitted/unknown tool -> validTools; phase omitted/unknown -> validPhases; phaseless ignores spurious phase; dynamicNote; conversion-failure guard)` — "All failure modes return an InsrcSchemaError value (k3); a phaseless tool ignores a spurious phase (ac3); a dynamic-inner-payload call returns the outer envelope + dynamicNote (ac5)."
- **[[c4]]** `step-output` `LLD s3 alternatives.judge (a1 chosen): registration-time side-registry deriving JSON Schema from the same zod raw shape, no SDK-internal reflection` — "a1 is the only alternative that satisfies all five acceptance criteria AND sc1 at the Story's M size without SDK-internal coupling."
