<!-- insrc:artifact HLD-38905b56cb44c4cf -->

# HLD: On-demand controller guidance is delivered by two independent read-only surfaces, each reading its source of truth WHERE THAT SOURCE ALREADY LIVES, plus a steering restructure that shrinks the injected block and points at those surfaces

## Framework summary

On-demand controller guidance is delivered by two independent read-only surfaces, each reading its source of truth WHERE THAT SOURCE ALREADY LIVES, plus a steering restructure that shrinks the injected block and points at those surfaces. sc-schema (S001) is an MCP-server-side read-only tool that serves the exact input contract for a requested insrc_* tool (+phase) by slicing the tool's own registered zod inputSchema — the same object the MCP SDK validates against — so there is no copy (k1) and no round-trip. sc-guide (S002) is the daemon-IPC-first + thin-MCP-wrapper shape proven by docgen: a daemon-owned guide.get / guide.list IPC reads the canonical steering content inside the daemon and returns one workflow's section, fronted by a thin insrc_guide MCP tool. Both surfaces are per-task (k2), read-only (k5), and return structured non-throwing results with the valid options on error (k3). S003 then authors, in the canonical steering source, a thin skeleton (front-door decision tree + a catalog of the available insrc_* / IPC calls, the insrc_build_step doc, the schema-first rule, and an insrc_schema self-entry) and moves each workflow's full procedural detail into the per-workflow sections sc-guide serves — propagated to every registered repo by the existing steering-refresh (k4).

## Architecture shape

Three landing zones. (1) src/mcp: a new insrc_schema MCP tool (a peer of the existing tool subdirs) that reads the registry of already-registered zod inputSchemas in the MCP server process and returns the JSON-Schema slice for the requested {tool, phase}; plus a new thin insrc_guide MCP wrapper. (2) src/daemon: two new read-only IPC methods on the object-literal handler map (guide.get, guide.list) that read + partition the canonical steering content the daemon already loads for steering-refresh. (3) src/prompts/steering-block.md: restructured into a thin skeleton + per-workflow sections, propagated unchanged-in-mechanism by the existing refreshSteeringAcrossRepos marker-bounded replace-only upsert in src/daemon/steering-inject.ts (invoked by the maintenance.update CLI service). sc-schema stays MCP-side because the schemas live there; sc-guide stays daemon-side because the steering asset lives there — each surface therefore has exactly one reader of its truth. S001 and S002 are independent (no cross-dependency); S003 depends on both because the skeleton can only reference surfaces that already exist.

## Shared contracts

### sc1: insrc_schema shape-lookup surface

**Owner Story:** `s1`
**Consumed by:** `s3`

**Purpose:** The read-only lookup a controller calls to get the authoritative input contract for a specific insrc_* tool+phase (or the valid tools/phases on a miss), read from the tool's own registered schema so it never drifts. Consumed by S003 to reference insrc_schema in the steering catalog + the schema-first rule + the self-entry.

**Interface sketch (type-level):**

```
// MCP tool `insrc_schema` (read-only). JsonSchema is the JSON Schema derived from the tool's registered zod inputSchema.
interface InsrcSchemaInput { tool: string; phase?: string }
type JsonSchema = Record<string, unknown>;
interface InsrcSchemaOk { schema: JsonSchema; description: string; validPhases?: string[] }
interface InsrcSchemaError { error: string; validTools?: string[]; validPhases?: string[] }
type InsrcSchemaResult = InsrcSchemaOk | InsrcSchemaError;
```

**Assumptions cited:** [[c3]]

### sc2: insrc_guide per-workflow retrieval surface (MCP tool + daemon guide IPC + section addressing)

**Owner Story:** `s2`
**Consumed by:** `s3`

**Purpose:** The read-only retrieval a controller calls to get one workflow's full procedural guidance on demand, served daemon-side from the canonical steering content, plus the per-workflow section-addressing scheme that content is partitioned by. Consumed by S003, which authors the skeleton pointing at it and moves per-workflow detail into the sections this surface reads.

**Interface sketch (type-level):**

```
// MCP tool `insrc_guide` (read-only) fronting daemon IPC guide.get / guide.list.
interface InsrcGuideInput { workflow?: string }
interface InsrcGuideOk { workflow: string; guidance: string }
interface InsrcGuideError { error: string; validWorkflows: string[] }
type InsrcGuideResult = InsrcGuideOk | InsrcGuideError;
interface GuideIpc {
  'guide.get'(params: { workflow: string }): InsrcGuideResult;
  'guide.list'(): { workflows: string[] };
}
type WorkflowKey = 'define' | 'design.epic' | 'design.story' | 'plan' | 'build' | 'review' | 'code-review' | 'brainstorm' | 'tracker' | 'triage';
```

**Assumptions cited:** [[c2]] [[c4]]

## Story boundaries

### Story E2026092438905b56:S001

**Owns:** `sc1`

Private to S001: how the MCP server enumerates its own registered tools and derives a JSON Schema slice from a tool's registered zod inputSchema; the tool/phase classification (which tools are phase-based and their phase names — analyze_step/workflow_step/review_step/code_review_step/build_step/triage[start,classify]/workflow_run[start,poll] vs the one-shot workflow_approve/docgen/analyze); the dynamic-envelope rule (return the static envelope + a description pointer to the run's own inline schema for runtime-generated inner payloads); and the exact structured-error shaping for omitted/unknown tool and omitted phase. None of this internal wiring is consumed by another Story — only the sc1 result surface is.

### Story E2026092438905b56:S002

**Owns:** `sc2`

Private to S002: how the daemon reads the canonical steering content it already loads and partitions it into per-workflow sections; the guide.get/guide.list IPC handlers on the daemon method map; the thin insrc_guide MCP wrapper that forwards to those IPCs; and the structured-error shaping for an omitted/unknown workflow. Only the sc2 surface (the MCP tool result + the section-addressing key set) is consumed downstream; the partition/read mechanism stays private.

### Story E2026092438905b56:S003

**Depends on:** `sc1`, `sc2`

Private to S003: the actual authored steering content — the compact skeleton (front-door decision tree + the catalog of available insrc_* / IPC calls, the insrc_build_step documentation, the 'call insrc_schema before guessing a shape' rule, and the insrc_schema self-entry) and the concrete decision of which minimal orientation stays inline in the skeleton versus which per-workflow detail moves into sc2's sections. It consumes sc1 (names insrc_schema + its call/response shape in the catalog and self-entry) and sc2 (the skeleton directs the controller to fetch per-workflow detail via insrc_guide, and the moved detail is authored into sc2's per-workflow section partition), and it rides the existing steering-refresh for propagation. No other Story consumes S003.

## Non-functional targets

- **Performance:** sc-schema is an in-process read of an already-registered schema object sliced to the requested tool+phase — negligible latency, no I/O. sc-guide is a single local daemon IPC round-trip reading steering content the daemon already holds in memory — no network, no rebuild. Neither adds standing cost to activation or to the injected steering (which shrinks).
- **Security:** Both surfaces are read-only introspection/retrieval over already-loaded schema + steering content (k5): no cloud/REST path, no new network surface, no credential handling, and no mutation of any state. The steering content served is the same content already shipped to the repo.
- **Observability:** Every result is structured and machine-parseable (k3): a success carries the schema/guidance + orientation, and an error carries the valid tools / phases / workflows so a controller can self-correct in one follow-up call rather than guessing. No thrown tool errors to obscure the failure mode.
- **Durability:** No persisted state is introduced. Single-source-of-truth (k1) is the durability property that matters: because each surface reads the live registration / canonical steering content, a change to a tool schema or the steering source is reflected on the next lookup with nothing to migrate and no copy to fall out of date.

## Rollout

### Phase A — the two on-demand surfaces (foundational)

**Stories:** `s1`, `s2`

S001 (sc1 schema-lookup) and S002 (sc2 guide retrieval) have no dependencies on each other or anything else and each owns one shared contract the terminal story consumes — so they land first, in either order or in parallel. Both are self-contained read-only surfaces with their own tests; nothing else must exist for them to ship and be independently useful (a controller can already look up shapes and fetch a workflow's guidance).

**Backward compat:** Additive only — two new read-only surfaces; no existing tool, IPC, or steering content changes in this phase, so existing controller behaviour is unaffected.

### Phase B — thin steering skeleton (consumer)

**Stories:** `s3`

S003 depends on both sc1 and sc2 (Epic dependsOn [s1,s2]): the restructured skeleton must reference insrc_schema (sc1) in its catalog + schema-first rule + self-entry, and must direct the controller to fetch per-workflow detail via insrc_guide (sc2) while authoring the moved detail into sc2's per-workflow section partition. It therefore lands after Phase A so the skeleton only points at surfaces that already exist.

**Backward compat:** The injected steering block changes shape (skeleton + detail behind on-demand retrieval). Preserve the existing marker-bounded, replace-only steering-refresh mechanism so already-registered repos upgrade cleanly on the next refresh, and ensure no workflow's guidance is lost — every section that leaves the skeleton must be reachable via insrc_guide.

**Ordering rationale:** Owner-before-consumer + Epic dependsOn edges: sc1 (owned by s1) and sc2 (owned by s2) must exist before s3 consumes them, and s3 dependsOn [s1,s2]. s1 and s2 are mutually independent, so they share Phase A; s3 is the sole Phase B. This also front-loads the two independently-valuable surfaces (immediate payoff for controllers) and defers the steering restructure — the only change with a backward-compat surface — until its referenced surfaces are proven.

### Risky bits

| Area | Why | Mitigation |
| :--- | :--- | :--- |
| Per-tool+phase schema slicing (S001) | The phase-based tools nest their per-phase sub-shapes inside one registered zod inputSchema object; serving the correct per-phase static envelope means mapping each tool's phase names to the right sub-shape, and getting the dynamic-envelope tools right (return the envelope, not the run-generated inner payload). | Derive every slice from the SAME registered zod inputSchema the MCP SDK validates against (never a copy), and unit-test each tool+phase lookup against its known-good envelope + the omitted-phase/omitted-tool error listings, so any classification gap is caught deterministically. |
| Steering section addressing vs authored content (S002 ↔ S003) | sc2 partitions the canonical steering into per-workflow sections keyed by workflow name, and S003 must author content matching that key set exactly — a mismatch would make a workflow's guidance unretrievable or mis-keyed. | Define the section-addressing (markers/keys) as part of sc2 and author S003's sections against it; expose guide.list so the actual section key set is enumerable and a missing/misnamed section is immediately observable in a test. |
| Steering-refresh propagation of the restructured block (S003) | The restructure changes the size/shape of the injected block; it must ride the existing replace-only, marker-bounded upsert without corrupting a repo's surrounding CLAUDE.md or dropping a workflow's guidance. | Keep the steering-refresh mechanism unchanged (only the content between the existing markers changes), and verify a refresh over a repo that already carries the old block cleanly replaces it with the skeleton, with every moved section reachable via insrc_guide. |

## Alternatives considered

### a1: Two read-only surfaces, each single-sourced where its data already lives (schema MCP-side, guide daemon-IPC-first) — **CHOSEN**

sc-schema reads the registered tool schemas in the MCP server directly; sc-guide follows the docgen daemon-IPC + thin-MCP-wrapper pattern over the daemon-owned steering content; the thin skeleton moves per-workflow detail behind the guide.

Split the epic along where each source of truth already lives. The insrc_* tool input schemas live in the MCP server process (server.registerTool declares each tool's zod inputSchema, and the MCP SDK already derives JSON Schema from them), so sc-schema (S001) is an MCP-server-side read-only tool that slices the registered zod inputSchema for the requested tool+phase and serves it — no round-trip and no copy, because the schemas are right there. The steering content is a daemon-owned asset (the daemon reads the canonical steering template at inject/refresh time), so sc-guide (S002) follows the established docgen shape: a daemon-owned guide.get / guide.list IPC that reads the canonical steering content INSIDE the daemon and returns just the requested workflow's section, fronted by a thin insrc_guide MCP wrapper that forwards the call. Both surfaces are read-only, return structured non-throwing results, and never dump everything by default.

The steering restructure (S003) then authors, in the canonical template, a compact skeleton (front-door decision tree + a catalog of the available insrc_* / IPC calls incl. the previously-uncovered tool, the schema-first rule, and the insrc_schema self-entry) and moves each workflow's full procedural detail into the per-workflow sections the guide IPC serves — so the injected block shrinks while the detail stays single-sourced and reachable on demand, propagated by the existing steering-refresh. Guide granularity is per-workflow (the controller knows which workflow it is about to run and asks for that one), matching the story's unit.

**Pros:**
- Each surface reads its own live source with zero duplication: schemas from the MCP server's own registration, steering from the daemon's own asset — directly satisfying k1 (single source of truth) with no copy to drift.
- sc-guide reuses a proven in-repo pattern verbatim (the docgen daemon-IPC + thin-MCP-wrapper at src/mcp/docgen/handler.ts + docgen.generate/list in src/daemon/index.ts), lowering design + review risk for S002.
- Honors the project's 'daemon owns content access' architecture: the MCP server stays thin for the daemon-owned steering, while only the schemas (which genuinely live MCP-side) are served MCP-side.
- Per-workflow guide granularity keeps each retrieval a single, self-contained unit the controller can act on, and keeps the skeleton catalog short.

**Cons:**
- Two different delivery shapes to maintain (an MCP-side reader for schema, a daemon-IPC+wrapper for guide) rather than one uniform mechanism.
- S003 depends on both S001 and S002 landing first (the skeleton can only point at surfaces that exist), so the steering restructure is gated last.

**Cost estimate:** L

### a2: Uniform daemon-IPC-first for both surfaces (schema.get + guide.get IPCs, thin MCP wrappers)

Both sc-schema and sc-guide are thin MCP wrappers over daemon IPCs; the daemon holds both the tool-schema registry and the steering content.

Make both surfaces uniform docgen-style: a daemon-owned schema.get/schema.list IPC and a guide.get/guide.list IPC, each fronted by a thin insrc_schema / insrc_guide MCP wrapper that just forwards. The appeal is one consistent pattern for the whole epic and one place (the daemon) that answers every introspection question.

The problem is that the insrc_* tool input schemas are registered in the MCP SERVER process (server.registerTool), not in the daemon. For a daemon-owned schema.get to serve them, the daemon would need its own copy of every tool+phase schema, or the MCP server would have to push its registrations to the daemon at startup. Either way the schema truth now lives in two places and can drift — exactly what k1 forbids. The steering half (guide) is fine daemon-side, but the schema half is forced off its real source.

**Pros:**
- One uniform pattern (daemon IPC + thin MCP wrapper) for both surfaces — slightly less conceptual surface to document.
- A single daemon-side introspection point could later serve other clients (the TUI) the same schema/guide answers.

**Cons:**
- Violates k1 for the schema surface: the daemon does not hold the registered tool schemas, so serving them daemon-side requires a copy or a push, creating a second source that drifts from what the MCP server actually validates against.
- Adds an extra process hop (MCP → daemon → back) for schemas the MCP server already has in memory, for no benefit.
- Larger blast radius: a schema-registration change would now have to be mirrored into a daemon-side registry, coupling two processes that are otherwise independent.

**Cost estimate:** L

**Rejected because:** Violates k1 for the schema surface: the daemon does not own the registered tool schemas, so serving them daemon-side forces a copy/push and a drift risk — the exact single-source rule the epic exists to uphold. Also adds a needless MCP→daemon hop for schemas the MCP server already holds.

### a3: Uniform MCP-server-side for both surfaces (no new daemon IPC; MCP reads the steering asset from disk)

Both sc-schema and sc-guide live entirely in the MCP server; sc-guide loads the canonical steering asset from disk in the MCP process.

Keep everything in the MCP server: sc-schema reads the registered schemas (as in a1), and sc-guide reads the canonical steering template directly from disk in the MCP process and returns the requested workflow's section. No new daemon IPC at all, so the whole epic is a pure src/mcp change.

The cost is architectural: the steering content is a daemon-owned asset, and the project's rule is that the daemon owns content/asset access while the MCP server stays a thin client. Having the MCP server also open and parse the steering file duplicates the daemon's load path, diverges from the docgen precedent (where the daemon owns the content and the MCP tool is thin), and risks the MCP process and the daemon disagreeing about which steering content is current.

**Pros:**
- Smallest moving-parts count: no new daemon IPC, the whole epic lands under src/mcp.
- Both surfaces share one process and one error/response convention with no cross-process plumbing.

**Cons:**
- Diverges from the 'daemon owns content access' architecture and from the docgen precedent, weakening k1 for the guide (two readers of the steering asset that can disagree on what is current).
- The MCP server would carry steering-file path/parse logic that properly belongs to the daemon, duplicating the inject/refresh reader.
- Harder to later reuse the guide answers for the daemon's own tooling (TUI), since the retrieval logic sits in the MCP process rather than the daemon that owns the content.

**Cost estimate:** M

**Rejected because:** Only partial on k1/k4: having the MCP process open + parse the daemon-owned steering asset creates a second reader that can disagree with the daemon on what is current, diverging from the daemon-owns-content architecture and the docgen precedent, with no offsetting constraint benefit over a1.

## Citations

- **[[c1]]** `analyze-bundle` `s1 capability-discovery: no get-schema / on-demand steering-retrieval surface exists (src/mcp/server.ts, src/mcp/analyze-step/handler.ts, src/daemon/tools/registry.ts)` — "NO get-schema surface and NO on-demand steering-retrieval surface exist; both sc-schema and sc-guide are net-new."
- **[[c2]]** `analyze-bundle` `s1 structural-map: the MCP surface + daemon IPC map + steering delivery (src/mcp/server.ts, src/daemon/index.ts, src/prompts/steering-block.md, src/daemon/steering-inject.ts)` — "server.ts registers all 10 tools; the daemon IPC registry is the object-literal method map in src/daemon/index.ts; steering ships from src/prompts/steering-block.md and is propagated to registered repos by refreshSteeringAcrossRepos in src/daemon/steering-inject.ts (invoked by the maintenance.update CLI service);"
- **[[c3]]** `analyze-bundle` `s1 structural-map: server.registerTool(name, {inputSchema: zod}, handler) — the registered zod inputSchema (nested per-phase zod objects) is the single live schema source (src/mcp/server.ts, per-step src/mcp/*-step/schema.ts)` — "the registered zod inputSchema is the ONE live source of truth sc-schema reads/serves, sliced to the requested tool+phase, rather than a hand-maintained copy."
- **[[c4]]** `analyze-bundle` `s1 usage-example: the docgen daemon-IPC + thin-MCP-wrapper precedent (src/mcp/docgen/handler.ts forwards to docgen.generate/docgen.list in src/daemon/index.ts) sc-guide follows` — "insrc_docgen is a thin MCP wrapper forwarding to the daemon-owned docgen.generate IPC + docgen.list — the exact daemon-IPC-first + thin-MCP-wrapper shape insrc_guide reuses."

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.epic (design.epic)

**0 HIGH · 1 MED · 6 LOW** · model `client` · reviewed 2026-09-24T11:20:16.361Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| c2 | citation | MED | assisted | The canonical steering content ships from src/prompts/steering-block.md and is propagated to registered repos by scripts/daemon-ctl.sh steering-refresh (marker-bounded, replace-only). | Partially inaccurate. The canonical steering source IS src/prompts/steering-block.md (confirmed: steering-inject.ts:60/67 reads prompts/steering-block.md; 291 lines). BUT there is NO 'steering-refresh' subcommand in scripts/daemon-ctl.sh (grep finds zero 'steering' references in scripts/). The actual marker-bounded, replace-only propagation is refreshSteeringAcrossRepos() in src/daemon/steering-inject.ts (REPLACE-only via refreshMarkedSection), invoked by the maintenance.update CLI service (src/cli/services/maintenance.ts:224) — not by a daemon-ctl.sh subcommand. The DESIGN (keep the refresh mechanism unchanged; only the content between markers changes) is sound; only the named entrypoint is wrong. | Correct the propagation entrypoint reference so S003's LLD authors against the real mechanism: refreshSteeringAcrossRepos in src/daemon/steering-inject.ts (invoked by the maintenance.update service), not 'scripts/daemon-ctl.sh steering-refresh'. |
| c3 | citation | LOW | manual | The MCP server registers each insrc_* tool via server.registerTool(name, {inputSchema: <zod>}, handler) in src/mcp/server.ts, so the registered zod inputSchema is the single live schema source sc-schema slices — no hand-maintained copy. | Confirmed in src/mcp/server.ts: exactly 10 server.registerTool(...) calls, each passing an inputSchema (10 inputSchema occurrences). The registered zod inputSchema is the live schema object as claimed. | No change — citation resolves. |
| c4 | citation | LOW | manual | insrc_docgen is a thin MCP wrapper (src/mcp/docgen/handler.ts) that forwards to the daemon-owned docgen.generate + docgen.list IPC methods in src/daemon/index.ts — the daemon-IPC-first + thin-MCP-wrapper precedent sc-guide reuses. | Confirmed: src/mcp/docgen/handler.ts exists and forwards to the daemon 'docgen.generate' IPC (handler.ts:12,64,70); the thin-MCP-wrapper precedent holds. | No change — precedent citation resolves. |
| c2 | citation | LOW | manual | The daemon IPC registry is an object-literal method map in src/daemon/index.ts, to which two new read-only methods guide.get/guide.list are added. | Confirmed: src/daemon/index.ts registers 'docgen.generate' (line 1358) and 'docgen.list' (line 1367) in the object-literal IPC method map, so adding guide.get/guide.list there is consistent. | No change — citation resolves. |
| c1 | closed-union | LOW | manual | No get-schema surface and no on-demand steering-retrieval surface currently exist in the codebase — both insrc_schema (sc1) and insrc_guide (sc2) are net-new. | Confirmed net-new: grep for insrc_schema / insrc_guide / guide.get / schema.get across src/ finds NO existing implementation — every match is in the new epic's own docs (HLD/DEF). Both surfaces are genuinely absent today. | No change — capability-absence claim resolves. |
| c3 | inventory | LOW | manual | The MCP server registers 10 insrc_* tools (analyze, analyze_step, build_step, code_review_step, docgen, review_step, triage, workflow_approve, workflow_run, workflow_step), of which the phase-based ones nest per-phase sub-shapes in one registered zod inputSchema. | Confirmed: src/mcp/server.ts registers exactly 10 insrc_* tools (analyze, analyze_step, workflow_step, build_step, review_step, code_review_step, triage, workflow_run, workflow_approve, docgen) — matching the inventory; phase-based tools nest per-phase sub-shapes in one inputSchema. | No change — inventory resolves. |
| s3 | ordering | LOW | manual | S003 (steering skeleton) depends on both S001 (sc1) and S002 (sc2) because the skeleton can only reference the insrc_schema and insrc_guide surfaces once they exist; S001 and S002 are mutually independent. | Ordering consistent: the DEF frames 3 stories with S003 depending on S001+S002; S001 and S002 own sc1/sc2 respectively with no cross-dependency, so the Phase A / Phase B split is internally consistent. | No change — ordering resolves. |

#### Proposed fixes

- **c2** (assisted) — The refresh mechanism the HLD relies on exists and is correctly characterized (marker-bounded, replace-only, across registered repos); only the named entrypoint is inaccurate. Fixing the reference prevents S003 from targeting a non-existent daemon-ctl.sh subcommand.
  - option: Reword the architecture/backward-compat references from 'scripts/daemon-ctl.sh steering-refresh' to 'the refreshSteeringAcrossRepos marker-bounded replace-only propagation in src/daemon/steering-inject.ts (invoked by the maintenance.update CLI service)'.
  - option: Accept-with-note: leave the HLD prose and pin the correct mechanism (refreshSteeringAcrossRepos / steering-inject.ts) in S003's LLD, where the concrete edit lands.
