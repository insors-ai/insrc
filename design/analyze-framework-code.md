# Analyze framework — Code vertical

## Target definition

A **code unit**: a function, file, module, package, or repository. Anywhere on the size spectrum from a single function (scope XS) to a multi-repo organisation (scope XL).

The code vertical leans on the indexer's existing LMDB+Lance graph as its primary source of truth:

- Entities (functions, classes, files, modules, exports) → graph nodes
- Calls / imports / inheritance → typed graph edges
- Embeddings (semantic search over entity bodies) → Lance ANN
- Manifests (package.json, go.mod, requirements.txt, ...) → already parsed by the indexer's `manifest.ts`

When the analyze scope target is not yet indexed (e.g. an external repo the user just registered), the framework triggers `repo.add` + waits for the indexer's queue to drain before classification proceeds.

## What's in scope

| Aspect | Tasks |
|---|---|
| **Functional surface** | What does it do? APIs / endpoints / CLI commands / exports / event handlers. |
| **Non-functional surface** | Platform requirements (runtime version, OS deps), security (auth flows, secret handling, crypto), observability (logging, metrics, tracing), error handling patterns. |
| **Structural layout** | Module tree, packaging, naming conventions, layering rules (if any). |
| **Integrations** | Inbound (HTTP / RPC / queue listeners), outbound (HTTP clients, queue producers, DB connections). Per-integration: protocol, format, partner. |
| **Tests** | Test types (unit/integration/E2E), framework, mocking strategy, coverage if measurable. |
| **Dependencies** | First-party (other repos in the same workspace) + third-party (npm / pypi / etc) + system (libc, native libs). |
| **Usage** | Key APIs / endpoints with I/O shapes; example invocations. |

## What's out of scope (Phase 1)

- Code review / quality scoring / smell detection
- Refactoring suggestions
- Security vulnerability scanning (CVE matching, taint analysis) — the security row covers *surface* not *vulnerabilities*
- Performance profiling
- Test coverage generation (only reading existing coverage data)
- Build-time error detection

## Discovery strategy

The code shaper's run-level pass:

1. **Resolve scope target.** From `scopeRef.kind`:
   - `repo`     → all entities WHERE `repo = scopeRef.value`
   - `module`   → entities in the file subtree
   - `file`     → entities WHERE `file = scopeRef.value`
   - `symbol`   → entities WHERE `entityId = scopeRef.value` (entity id is deterministic — `SHA256(repo + file + kind + name)`)
2. **Walk closure.** Use the indexer's `DEPENDS_ON` traversal to add transitive dependencies up to a configurable depth (default 2 for L/XL, 1 for M, 0 for S/XS).
3. **Detect families.** Walk the module tree; bucket modules by family heuristics:
   - File extension dominance (TypeScript vs Python vs Go module)
   - Presence of well-known markers (`package.json` directory, `Cargo.toml` crate, `setup.py` package)
   - Top-level naming (`/src`, `/lib`, `/cmd`, `/internal`)
4. **Surface central modules** for L/XL scopes. Centrality = (incoming `DEPENDS_ON` edges) + (incoming `IMPORTS` edges) + log(entity count in module). Top decile gets per-module deep-dives in the plan.

## Task template catalog

Templates live under `src/insrc/analyze/templates/code/`. Naming convention: `code.<family>.<action>`.

### Discovery family

| Template | Input | Output | Notes |
|---|---|---|---|
| `code.discovery.modules` | `{ scopeRef, closureDepth }` | `{ modules: Array<{ id, path, family, fileCount, entryPoints }> }` | First task on every code run except XS. |
| `code.discovery.entry-points` | `{ scopeRef, families }` | `{ entryPoints: Array<{ kind, name, file, citation }> }` | `kind`: `main` \| `http-server` \| `cli` \| `library-export` \| `worker` |
| `code.discovery.test-runners` | `{ scopeRef }` | `{ testRunners: Array<{ framework, command, configPath, citation }> }` | Reads package.json/scripts, Makefile, pyproject, etc. |

### Surface family

| Template | Input | Output | Notes |
|---|---|---|---|
| `code.surface.functional` | `{ scopeRef, depth }` | `{ surface: Array<{ kind, name, signature?, summary, citations[] }> }` | XS/S: per-symbol; M/L/XL: per-module aggregated. |
| `code.surface.http-endpoints` | `{ scopeRef }` | `{ endpoints: Array<{ method, path, handler, params, citations[] }> }` | Scans for express / fastify / fastapi / gin / etc patterns. |
| `code.surface.cli-commands` | `{ scopeRef }` | `{ commands: Array<{ name, description, flags, citations[] }> }` | commander / argparse / cobra / clap patterns. |
| `code.surface.events` | `{ scopeRef }` | `{ events: Array<{ kind, name, payload?, citations[] }> }` | Producer (publish/emit) and consumer (subscribe/on) listings. |
| `code.surface.exports` | `{ scopeRef }` | `{ exports: Array<{ name, kind, signature, citations[] }> }` | Library-mode export surface. |

### Structure family

| Template | Input | Output | Notes |
|---|---|---|---|
| `code.structure.layout` | `{ scopeRef }` | `{ layout: Tree<{ name, kind, summary, citations[] }> }` | Module tree with one-line per node. |
| `code.structure.dependency-graph` | `{ scopeRef, scope: 'internal' | 'external' | 'both' }` | `{ nodes, edges, citations[] }` | First-party + third-party. |
| `code.structure.layer-rules` | `{ scopeRef }` | `{ layers, violations, citations[] }` | Looks for layering conventions (e.g. `daemon/` must not import `agent/`). Records what's enforced; not used to flag PRs. |

### Integration family

| Template | Input | Output | Notes |
|---|---|---|---|
| `code.integration.inbound` | `{ scopeRef }` | `{ integrations: Array<{ protocol, format, source, surface, citations[] }> }` | HTTP / gRPC / queue listeners / file watchers. |
| `code.integration.outbound` | `{ scopeRef }` | `{ integrations: Array<{ protocol, format, target, surface, citations[] }> }` | HTTP clients, DB clients, queue producers, file emitters, SDK calls. |

### Quality / non-functional family

| Template | Input | Output | Notes |
|---|---|---|---|
| `code.nonfunc.platform-requirements` | `{ scopeRef }` | `{ runtime, os, archDeps, citations[] }` | Runtime version pins, native deps, OS-specific code paths. |
| `code.nonfunc.security-surface` | `{ scopeRef }` | `{ authFlows, secretsHandling, cryptoUsage, citations[] }` | Surface-level. Not a vulnerability scan. |
| `code.nonfunc.observability` | `{ scopeRef }` | `{ logging, metrics, tracing, citations[] }` | What's wired, not what should be. |
| `code.nonfunc.error-handling` | `{ scopeRef }` | `{ patterns: Array<{ pattern, frequency, examples: citations[] }> }` | Try/catch density, error type usage, panic patterns. |

### Tests family

| Template | Input | Output | Notes |
|---|---|---|---|
| `code.tests.inventory` | `{ scopeRef }` | `{ types, framework, mocking, fileCount, citations[] }` | Types: unit / integration / E2E / smoke / golden / property. |
| `code.tests.coverage` | `{ scopeRef }` | `{ coverage?: { line, branch, source, asOf }, citations[] }` | Best-effort: reads coverage reports in the repo if present. |

### Usage family

| Template | Input | Output | Notes |
|---|---|---|---|
| `code.usage.examples` | `{ scopeRef, surface }` | `{ examples: Array<{ description, code, citations[] }> }` | Consumes a `surface` output, finds example invocations in tests / README / examples directories. |
| `code.usage.invocation-shapes` | `{ scopeRef, surface }` | `{ shapes: Array<{ entrypoint, inputs, outputs, errors, citations[] }> }` | I/O shape per public entrypoint. |

### Cross-reference family (XS / focused-intent only)

| Template | Input | Output | Notes |
|---|---|---|---|
| `code.xref.callers` | `{ entityId }` | `{ callers: Array<{ caller, citation }> }` | For XS-on-symbol when intent is "where is this used?" |
| `code.xref.callees` | `{ entityId }` | `{ callees: Array<{ callee, citation }> }` | Same, outward direction. |
| `code.xref.related-by-embedding` | `{ entityId, topK }` | `{ related: Array<{ entity, score, citation }> }` | Lance ANN over the entity's embedding. |

### Aggregator (terminal)

| Template | Input | Output | Notes |
|---|---|---|---|
| `code.aggregate.report` | `{ scopeRef, scope, intent }` + every upstream output | `{ sections: Array<{ heading, body, citations[] }> }` | Always the last task. Section shape varies by scope bucket (see below). |

## Citation primitives

Code citations use all three Citation kinds:

- `kind: 'entity'` — preferred when pointing at a function / class / module. Stable across line renumbering; cheap to validate. Used everywhere a discovered entity backs the claim.
- `kind: 'source'` — for spans the indexer doesn't track as a single entity (a particular branch inside a function, a config block in a non-source file, an inline comment). The aggregator validates by re-reading.
- `kind: 'doc'` — for external references (RFC, npm package docs, vendor SDK page). Surfaced as "external reference" in the report so reader knows it's unverified-by-us.

A typical surface claim:

```jsonc
{
  "kind": "http-endpoint",
  "name": "POST /api/auth/login",
  "summary": "Validates credentials and issues a session token.",
  "citations": [
    { "kind": "entity", "entityId": "b209...8442" },          // the handler fn
    { "kind": "source", "file": "src/auth/login.ts",
      "lineStart": 42, "lineEnd": 78 },                        // the route binding
    { "kind": "doc", "url": "https://jwt.io/introduction" }    // token spec
  ]
}
```

## Report shape per scope bucket

### XS / S report

```
## <one-line description of the unit>

### Functional surface
- <claim with citations>
- ...

### Non-functional notes
- platform: ...
- security: ...
- observability: ...

### Integrations
- inbound: ...
- outbound: ...

### Tests
- ...

### Dependencies
- first-party: ...
- third-party: ...

### Usage
- <examples + I/O shapes>

### Related
- <cross-references; only for XS-focused>
```

### M report

```
## <repo / subsystem name>

### Overview
- <1-2 paragraph summary>

### Component map
- <module tree summary, one line per central module>

### Per-component surface  (only central components -- top decile by centrality)
#### <module 1>
  - functional surface
  - integrations
  - tests
#### <module 2>
  ...

### Cross-component interaction
- <call graph summary, message flow>

### Dependencies
- ...

### Test posture
- ...
```

### L / XL report

```
## <repo / org name>

### Architecture
- <layered overview>

### Family map
- <one section per detected family: web-services / workers / libraries / CLIs / etc>
  for each family:
    - summary
    - representative components
    - dominant patterns

### Integration topology
- inbound: <map>
- outbound: <map>
- internal: <module-to-module dependency map>

### Platform + non-functional posture
- <runtime, OS deps, security stance, observability stance>

### Test posture
- <inventory across families>

### Dependency posture
- first-party (intra-repo)
- third-party (npm/pypi/etc summary)

### Child Plan reports  (XL only)
- <link to each child Plan's report under tasks/<task-path>/>

### Cross-partition topology  (XL only)
- <how the partitions interact>
```

## Worked example: XS / focused

User: `insrc analyze --scope src/auth/login.ts:authenticate "what does this function actually do"`

Classifier emits:
```jsonc
{
  "target": "code",
  "scope": "XS",
  "focused": true,
  "focus": "what does this function actually do",
  "scopeRef": { "kind": "symbol", "value": "b209...8442" },
  "reasoning": "Single function pointed at; intent is detail-level."
}
```

Plan Builder emits (catalog summary trimmed):
```jsonc
{
  "goal": "Detailed functional + integration analysis of authenticate()",
  "target": "code",
  "scope": "XS",
  "tasks": [
    { "taskId": "t01", "template": "code.surface.functional",
      "params": { "scopeRef": ..., "depth": "deep" },
      "produces": ["surface"], "rationale": "extract the function's behavioural surface" },
    { "taskId": "t02", "template": "code.integration.outbound",
      "params": { "scopeRef": ... },
      "produces": ["outbound"], "rationale": "what does it call?" },
    { "taskId": "t03", "template": "code.nonfunc.security-surface",
      "params": { "scopeRef": ... },
      "produces": ["security"], "rationale": "auth function -- security surface mandatory" },
    { "taskId": "t04", "template": "code.nonfunc.error-handling",
      "params": { "scopeRef": ... },
      "produces": ["errors"], "rationale": "error-path completeness" },
    { "taskId": "t05", "template": "code.xref.callers",
      "params": { "entityId": "b209...8442" },
      "produces": ["callers"], "rationale": "who calls it -- caller invariants tighten focus" },
    { "taskId": "t06", "template": "code.usage.examples",
      "params": { "scopeRef": ..., "surface": "@t01.surface" },
      "consumes": ["surface"],
      "produces": ["examples"], "rationale": "example invocations from tests + callers" },
    { "taskId": "t07", "template": "code.aggregate.report",
      "params": { "scopeRef": ..., "scope": "XS", "intent": { "focused": true, "focus": "..." } },
      "consumes": ["surface", "outbound", "security", "errors", "callers", "examples"],
      "produces": ["report"], "rationale": "stitch into XS focused report" }
  ],
  "reasoning": "XS-focused on an auth-domain function. Surface first; security + error paths
     mandatory; callers tighten the I/O shape; examples ground the claims."
}
```

The executor runs t01..t07 serially. Total: 7 tasks, low-tier model for the discovery + surface tasks, medium-tier for security + errors, high-tier for the aggregate. Wall-clock ~3-5 minutes on Haiku-class.

## Failure surface

| Failure | Cause | Recovery |
|---|---|---|
| `scope-not-indexed` | `scopeRef` resolves but indexer has no entity rows for it | Auto-trigger `repo.add` + wait up to 5 minutes for indexer; retry classification once |
| `entity-not-found` | Planner emitted a `params.entityId` that's not in the graph | Per-task validation fails; downstream consumers short-circuit |
| `closure-overflow` | Closure depth produces > 10k entities | Per-template: M/L/XL fall back to first 1000 by centrality, surface a `truncated: true` warning in the report; XS / S fail hard |
| `non-source file in span` | Source citation points at a binary / large generated file | Validator rejects; task retries (LLM gets `INV-CIT: file appears generated; cite the source, not the artefact`) |

## Configuration

```jsonc
{
  "models": {
    "analyze": {
      "code": {
        "closureDepth": { "XS": 0, "S": 0, "M": 1, "L": 2, "XL": 2 },
        "centralityTopN": 10,                  // central modules to deep-dive on M/L
        "embedRelatedTopK": 8,
        "skipFamilies": ["test"],              // detected families to omit from
                                               //   structural analysis (still
                                               //   covered by code.tests.*)
        "perTemplateModelClass": {             // override the planner's default routing
          "code.aggregate.report": "high"
        }
      }
    }
  }
}
```

## See also

- `design/analyze-framework.md` — overall framework
- `design/analyze-context-builder.md` — the `code-shaper`
- `design/analyze-plan-builder.md` — what produces the task list
- `design/indexer.html` — the LMDB graph that backs entity citations
- `plans/tools.md` — the surviving tool registry that some code templates use
