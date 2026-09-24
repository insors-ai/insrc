<!-- insrc:artifact DEF-38905b56cb44c4cf -->

# Epic: A controller driving the insrc MCP surface has no reliable way to know the exact contract of a call before it makes it.

**Flavor:** new-capability
**Seeded from:** `SPEC-d2ca9d399373a7bb`

## Problem

A controller driving the insrc MCP surface has no reliable way to know the exact contract of a call before it makes it. The required input shape varies by which tool it is calling and, for the multi-turn tools, by which phase of the loop it is in, and those exact shapes cannot be looked up on demand — so the controller reconstructs them from memory or inference and, when it guesses wrong (a missing required field, a wrong key, or the wrong shape for a phase it has not reached before), the call is rejected and the turn is wasted. The same gap exists for procedural guidance: the instructions for how to run each workflow are delivered as one large block of steering text injected into every repository, so a controller carries the full detail of every workflow at all times even though at any moment it is running exactly one; that block is large and costly to keep consistent, and at least one registered tool has no coverage in it at all, leaving the controller to guess there too. The cost concentrates on the most common controller actions — starting a tool and advancing it phase by phase — where a wrong guess is both frequent and immediately blocking, and it compounds because there is no single authoritative, on-demand source the controller can consult for either the message shape or the step-by-step guidance of the specific thing it is about to do.

## Non-goals

- **The schema and guidance surfaces are not hand-maintained copies or re-derivations of the tool contracts — they read the same live objects the handlers already validate against, and the same canonical steering content.** — A separate copy drifts from what the handlers actually enforce (and from the injected steering), reintroducing exactly the wrong-shape/stale-guidance problem the epic exists to remove.
- **The schema surface does not resolve or fully type the runtime-generated dynamic inner payloads of the multi-turn tools (the per-step/per-phase content generated during a run) — only the static call envelope.** — Those inner shapes are produced per-run and already handed back reactively in each response; duplicating them would drift and cannot be known ahead of the run.
- **Coverage is scoped to the registered insrc_* MCP tools only, not other MCP servers' tools.** — Only the insrc tools' contracts are under this framework's authority; other servers own their own introspection.
- **The steering content is not maintained by hand-editing individual repositories' instruction files — it is authored once in the canonical source and propagated by the existing refresh mechanism.** — The refresh is replace-only against the canonical source, so a hand-edit in a repo is silently overwritten on the next update.
- **The retrieval surfaces do not return everything by default (no full-catalog dump on a bare call) — the controller requests the specific tool+phase / workflow it is about to execute.** — On-demand, per-task retrieval is the whole point; dumping everything reproduces the size/cost problem the epic is removing from the injected steering.

## Assumptions

- `high` Every registered insrc_* MCP tool already declares an input schema at registration (and the multi-turn tools carry per-phase schemas the handlers validate against), so an introspection surface can read them rather than invent them. [[c3]]
- `high` The canonical steering content is authored in one source and pushed replace-only to every registered repo by the existing steering-refresh, so restructuring that source propagates everywhere without per-repo edits. [[c4]]
- `med` A daemon-owned capability can be exposed as an IPC method with a thin MCP wrapper (the established docgen pattern), so on-demand guide retrieval has a proven delivery shape to follow. [[c2]]
- `high` No get-schema / schema-introspection surface and no on-demand steering-retrieval surface exist today, so both are net-new (the epic does not duplicate an existing capability). [[c2]]

## Constraints

| ID | Type | Text | Source |
| :--- | :--- | :--- | :--- |
| `k1` | contract | The schema and guidance surfaces MUST read the same live objects the handlers validate against (and the same canonical steering content) — never a hand-maintained copy or re-derivation (single source of truth). | [[c1]] |
| `k2` | stakeholder | Retrieval is on-demand and per-task: the controller requests the schema for the specific tool+phase, or the guidance for the specific workflow, it is about to execute; the surfaces do not dump all shapes/guidance by default. | [[c1]] |
| `k3` | convention | Errors are returned as normal structured, machine-parseable responses (an error field plus the valid options), never thrown as tool errors — consistent with the daemon's existing result:{error} convention. | [[c1]] |
| `k4` | convention | The steering restructure (thin skeleton + per-workflow detail moved behind on-demand retrieval, plus the new documentation) is authored in the canonical steering source and propagated to every registered repo via the existing steering-refresh mechanism. | [[c4]] |
| `k5` | invariant | The new surfaces are READ-ONLY introspection/retrieval over already-loaded schema + steering content; they open no cloud/REST path and mutate no state. | [[c3]] |

## Stories

### E2026092438905b56:S001 — Look up the exact input for an insrc_* tool call before making it

**User value:** `size: M`

A controller about to call an insrc_* tool can look up the authoritative input contract for exactly the call it intends to make — for a multi-turn tool, the specific phase it is on — instead of reconstructing it from memory and getting the call rejected for a wrong or missing field.

**Acceptance criteria:**

- **ac1:** Given the controller is about to make a call to a multi-turn insrc_* tool at a specific phase of that tool's loop, when it looks up that tool and phase, then it receives the authoritative input contract for that phase together with the tool's list of valid phases, drawn from what the tool actually enforces rather than a separate copy. _(operationalizes `k1`, `k2`)_
- **ac2:** Given a multi-turn insrc_* tool, when the controller looks it up without naming a phase, then it receives a structured response listing that tool's valid phase names so it can re-ask for the one it needs, with no shape guessed on its behalf. _(operationalizes `k2`, `k3`)_
- **ac3:** Given an insrc_* tool that has a single fixed input shape (no phases), when the controller looks it up, with or without naming a phase, then it receives that tool's single input contract as normal (a spurious phase is ignored, not rejected). _(operationalizes `k1`, `k2`)_
- **ac4:** Given a lookup that names no tool or an unrecognized tool name, when the controller calls it, then it receives a structured, machine-parseable response listing the valid insrc_* tool names, never a thrown error. _(operationalizes `k2`, `k3`)_
- **ac5:** Given a call whose inner payload is generated during the run and handed back in the tool's own responses, when the controller looks up that call's shape, then it receives the fixed outer contract plus an explicit note that the run's own latest response carries the authoritative inner shape — the outer contract reflecting what the handler enforces, never a hand-maintained copy. _(operationalizes `k1`, `k5`)_

### E2026092438905b56:S002 — Retrieve a specific workflow's full guidance on demand

**User value:** `size: M`

A controller about to run a particular workflow can fetch just that workflow's full step-by-step guidance when it needs it, instead of every repo carrying the complete detail of every workflow at all times.

**Acceptance criteria:**

- **ac1:** Given the controller is about to run a specific insrc workflow, when it requests that workflow's guidance, then it receives the full procedural instructions for that one workflow, sourced from the same canonical steering content everything else is authored in. _(operationalizes `k1`, `k2`)_
- **ac2:** Given a guidance request that names no workflow or an unrecognized one, when the controller calls it, then it receives a structured response listing the available workflows, never a thrown error. _(operationalizes `k2`, `k3`)_
- **ac3:** Given the canonical steering content is later changed, when the controller next retrieves a workflow's guidance, then the retrieved guidance reflects the change with no per-repo edit, because it reads the same single source. _(operationalizes `k1`, `k4`)_
- **ac4:** Given any guidance retrieval, when it is performed, then nothing is mutated and no cloud/REST path is opened — it is a read of already-loaded steering content. _(operationalizes `k5`)_

### E2026092438905b56:S003 — Slim the injected steering to a thin skeleton with the detail on demand

**User value:** `size: M`

A registered repo receives a compact steering block — the front-door decision tree plus a catalog of the available calls — with the per-workflow detail reachable on demand, so controllers carry less standing instruction, every registered tool is represented, and they are told to look up a call's shape before guessing it.

**Depends on:** `s1`, `s2`

**Acceptance criteria:**

- **ac1:** Given a repo registered or refreshed after this change, when its steering block is written, then the block is a compact skeleton (the front-door decision tree plus a catalog of the available insrc_* / IPC calls), not the full per-workflow procedural detail. _(operationalizes `k2`, `k4`)_
- **ac2:** Given the compact skeleton, when a controller needs a workflow's full step-by-step detail, then the skeleton directs it to fetch that detail on demand rather than carrying it inline. _(operationalizes `k2`)_
- **ac3:** Given the steering catalog, when it is authored, then every registered insrc_* tool is represented (including the one that previously had no coverage), the controller is instructed to look up a call's exact shape before emitting one it is unsure of, and the shape-lookup surface itself is documented so its own use never has to be guessed. _(operationalizes `k4`)_
- **ac4:** Given the restructured steering, when it is authored, then it is authored once in the canonical steering source and propagates to every registered repo through the existing refresh mechanism, with no hand-edited per-repo copies. _(operationalizes `k4`)_

## Citations

- **[[c1]]** `prior-artifact` `SPEC-d2ca9d399373a7bb (approved brainstorm spec)` — "insrc_schema reads the live handler schema objects (never a copy); on-demand per-task retrieval; structured non-throwing errors; 3-pillar direction."
- **[[c2]]** `analyze-bundle` `capability-discovery (insrc_analyze_step): no get-schema / on-demand steering-retrieval surface exists; docgen is the daemon-IPC + thin-MCP-wrapper precedent` — "No dedicated schema-introspection / get-schema surface exists for the insrc_* MCP tools."
- **[[c3]]** `code` `src/mcp/server.ts (+ per-step src/mcp/*-step/schema.ts)` — "registers the 10 insrc_* MCP tools with their inputSchemas — the live source an introspection surface reads; read-only, no cloud path."
- **[[c4]]** `code` `src/prompts/steering-block.md + scripts/daemon-ctl.sh (steering-refresh)` — "the canonical injected steering template propagated replace-only to every registered repo via steering-refresh."
