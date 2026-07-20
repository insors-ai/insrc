# CLAUDE.md — insrc backend

Standalone backend for the insrc code-knowledge system. Split from
[`insors-ai/insrc-ide`](https://github.com/insors-ai/insrc-ide) on
2026-07-14. The IDE fork clones this repo into `~/.insrc/daemon/`
and spawns the compiled entry — the IPC contract is the only surface
the IDE consumes.

## Project principles

- **Accuracy is primary; cost is the least priority.** When choosing between an accurate-but-expensive path (more LLM calls, bigger context, slower pipeline) and a cheap-but-lossy one, choose accuracy. The system's value is correctness, not throughput. Cost optimizations are valid only when they preserve accuracy; otherwise the cheap path is the wrong path.
- **No direct cloud REST calls from our process.** Cloud LLM access happens through the locally-installed `claude` and `codex` CLI binaries (via `CliProvider`). Auth + quota stay with the user's CLI OAuth sessions. Direct REST providers to Anthropic / OpenAI / Gemini / Mistral must not be reintroduced.

## What lives here

- Indexer (tree-sitter parsing, manifest resolution, embedding generation)
- Daemon core (IPC, repo registry, queue, lifecycle, file-watcher)
- Storage (LMDB graph + Lance vectors, DuckDB query engine for data drivers)
- Built-in tools (~110 capability wrappers: file/git/shell/http/web/gh/k8s/pkg/ssh/test/notify/search/graph/db/data/code/cloud)
- `CliProvider` (`claude` + `codex` CLI subprocess wrapper, structured-output aware)
- `OllamaProvider` (local LLM + embeddings)
- Analyze framework (`insrc_analyze` + `insrc_analyze_step` MCP tools; 20 exploration recipes; context builder)
- Workflow framework (`define` → `design.epic` → `design.story` → `tracker` chain; `insrc_workflow_step` MCP tool)
- `insrc` interactive CLI — a full-screen ink (React) TUI with Daemon /
  Repos / Workflows / Setup panes (replaced the old commander subcommands)

The IDE fork owns: the VSCode workbench + `src/vs/workbench/contrib/insrc/`
IDE contributions (sidebar panes, service impls, RPC clients) +
`src/vs/platform/insrc/electron-main/insrcDaemonInstaller.ts` which
clones + builds this repo into `~/.insrc/daemon/`. IPC method names,
socket path (`~/.insrc/daemon.sock`), and payload shapes stay in
lock-step across the two repos via mirrored types.

## Tech stack

- **Language**: TypeScript (strict mode, ESM-only via `"type": "module"`)
- **Runtime**: Node.js 20+, executed with `tsx` during development. Native modules are built against Node 22.22.1 headers (see `.npmrc`), and the daemon spawns under Node 22 at install time.
- **Module system**: NodeNext (`"module": "nodenext"` in tsconfig)
- **Databases**: LMDB via `lmdb-js` (embedded KV; substrate for the custom graph layer in `db/graph/`), LanceDB (embedded vector DB; entity embeddings + ANN search), DuckDB via `@duckdb/node-api` (in-memory query engine *only* — backs the data-driver `db_file_*` tools; **not** used for persistent storage)
- **Parsing**: tree-sitter (TypeScript, Python, Go, Java, Scala)
- **LLM providers**: Ollama (local, qwen3-coder + qwen3-embedding) + `CliProvider`. Cloud auth is delegated to the CLI's OAuth session — no API keys stored on our side.
- **Logging**: pino + pino-pretty (CLI) + pino-roll (file rotation)
- **CLI**: ink + react — the `insrc` CLI is a full-screen interactive TUI (no commander/subcommands)
- **HTTP**: undici

## Project structure

```
src/
  shared/          Core types, paths, logger
    types.ts       Entity / Relation / LLMProvider / Tool / etc.
    paths.ts       ~/.insrc/ directory layout
    logger.ts      pino-based logging
  indexer/         Tree-sitter parsing + graph construction
  db/              Storage (LMDB graph + Lance vectors + DuckDB pool)
    graph/         Custom LMDB-backed graph layer (store, keys, codec, edges, traversal)
    lance/         LanceDB tables (entity-vec, session-vec, turn-vec, artifact-vec, config-vec, ...)
  daemon/          Background daemon process
    index.ts       Entry point + IPC handler registry
    server.ts      Unix-socket JSON-RPC server
    tools/         Tool registry + executor + ~110 built-in capability wrappers
  config/          On-disk config store + templates + feedback
  agent/
    providers/
      ollama.ts            Local provider (LLM + embeddings)
      cli-provider.ts      Subprocess wrapper for claude + codex CLI binaries
      structured-output.ts ajv + retry helpers
  analyze/         Analyze framework (20 exploration recipes, decomposer, synthesizer, context builder)
  workflow/        Workflow framework (define, design.epic, design.story, tracker, amendments, gates)
  mcp/             MCP servers (insrc_analyze_step, insrc_workflow_step)
  cli/             `insrc` interactive TUI (ink): panes/ services/ hooks/ ui/
  bin/             Executable entrypoints
  prompts/         Shaper / analyze / workflow prompt templates
  assets/          Non-TS runtime resources (shipped by copy-assets.mjs)
```

The daemon binary the IDE spawns is `out/daemon/index.js`. The MCP
binary registered with Claude Code / Codex is `out/bin/insrc-mcp.js`.

## Build and run

```bash
npm install                           # installs runtime + dev deps
npm run build                         # tsc + copy-assets.mjs
npx tsx --test 'src/**/__tests__/*.test.ts'   # full test sweep
```

Fast subsets for iteration:

```bash
npx tsx --test 'src/workflow/**/*.test.ts' 'src/mcp/**/*.test.ts'   # ~5 s
npx tsx --test 'src/db/**/*.test.ts'                                # LMDB / Lance / graph
npx tsx --test 'src/analyze/**/*.test.ts'                           # analyze framework
```

Live-service tests gate behind env vars (`INSRC_LIVE_TESTS=1` for Ollama /
CliProvider suites) and skip cleanly when unset.

## Code conventions

### Imports

- Always use `.js` extension in import paths (NodeNext resolution requires it even for `.ts` files)
- Use `import type` for type-only imports (`verbatimModuleSyntax` is enabled)
- Shared types come from `../shared/types.js` — never import SDK types directly into application logic

### TypeScript strictness

- `strict: true` with `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`
- Optional properties use `| undefined` explicitly (e.g., `tools?: ToolDefinition[] | undefined`)
- Index access results are `T | undefined` — always handle the undefined case

### Logging

- Use `getLogger('module-name')` from `../shared/logger.js` — never use `console.log`
- Log levels: `INSRC_LOG_LEVEL` env var (default: `info`)

### LLM provider abstraction

- All LLM interaction goes through the `LLMProvider` interface in `shared/types.ts`
- Two implementations: `OllamaProvider` (local) and `CliProvider` (subprocess wrapper for claude + codex)
- Never `Promise.all` anything that reaches an LLM provider (cloud or local Ollama embed / complete); always serial `for...of` with sequential awaits.

### Entity IDs

- Deterministic: `SHA256(repo + file + kind + name)`, hex-32

### IPC

- Daemon communicates via JSON-RPC over Unix socket at `~/.insrc/daemon.sock`
- CLI / MCP / workbench never opens LMDB or LanceDB directly — always goes through daemon IPC

## Key architectural rules

1. **Daemon owns all DB access** — CLI, MCP, and the IDE workbench communicate via IPC only.
2. **Local-first** — Ollama is always available (embeddings are local-only). Cloud LLM access goes through `CliProvider` (claude + codex CLI subprocesses); no direct REST.
3. **Dependency-closure scoping** — graph searches span only the transitive `DEPENDS_ON` closure of the active repo.
4. **Graph + vector** — structural queries use the LMDB graph layer's typed JS API (`findCallers / findCallees / outNeighbors / inNeighbors / transitiveClosure / unreachable`); semantic queries use LanceDB ANN. No Cypher / GQL / SQL exposed for graph traversal.
5. **No raw file dumps** — context is always structured entity summaries + relations from the graph.
6. **Repo registry is the contract** — workspace registry membership is established exclusively via the `repo.add` IPC. The storage layer never auto-allocates registry rows; an `Entity` whose `repo` path isn't registered fails the upsert with `UnregisteredRepoError`. See [`plans/repo-registry-strict-contract.md`](plans/repo-registry-strict-contract.md).
7. **Prompt structure: structural reference goes trailing.** Schemas / catalogs / manifests belong at the tail of the prompt, not the middle — recency-weighted attention (especially on qwen3-coder) hallucinates against mid-prompt structural info.

## Design documents

- [`design/indexer.html`](design/indexer.html) — indexer architecture
- [`design/analyze-framework.md`](design/analyze-framework.md) — analyze framework overall
- [`design/analyze-context-builder.md`](design/analyze-context-builder.md) — context builder
- [`design/analyze-plan-builder.md`](design/analyze-plan-builder.md) — plan builder
- [`plans/storage-migration-lmdb-lance.md`](plans/storage-migration-lmdb-lance.md) — storage substrate
- [`plans/graph-storage-lmdb.md`](plans/graph-storage-lmdb.md) — graph layer
- [`plans/repo-registry-strict-contract.md`](plans/repo-registry-strict-contract.md) — repo registry contract
- [`plans/tools.md`](plans/tools.md) — tool registry + ~110 built-ins
- [`plans/meta-workflow-framework.md`](plans/meta-workflow-framework.md) — workflow framework
- [`docs/workflow.md`](docs/workflow.md) — workflow user guide
- [`docs/daemon.md`](docs/daemon.md) — daemon usage guide

## Code exploration via `insrc_analyze` / `insrc_analyze_step` (insrc MCP server)

For ANY question about this codebase's structure, conventions,
existing capabilities, adherence to documented rules, or design
decisions, CALL one of the two insrc analyze tools FIRST before
doing any manual file exploration (`Read`, `Grep`, `Glob`, `Bash`
grep, etc.).

Both tools run the same deterministic graph queries + citation-
grounded synthesis and return the same verified 7-layer context
bundle. They are MORE accurate than manual grep + read for context
questions because:

- Every claim is grounded in a real exploration output (module
  profile, symbol locate, class hierarchy, doc constraint, etc.).
- File paths are drawn from the indexed graph — no hallucinated paths.
- Contradictions in the docs are preserved verbatim, not auto-resolved.

### Which tool to use

| Intent                                                    | Tool                    |
|-----------------------------------------------------------|-------------------------|
| Map a module / explore its tree / count entities          | `insrc_analyze_step`    |
| List conventions / naming / test layout                   | `insrc_analyze_step`    |
| List indexed data sources or infra manifests              | `insrc_analyze_step`    |
| Adherence check ("does the code follow rule X from doc?") | `insrc_analyze_step`    |
| Capability discovery ("does the codebase already do Y?")  | `insrc_analyze_step`    |
| Prose retrieval / decision trace from docs                | `insrc_analyze_step`    |
| Quick one-shot bundle (fine if you don't mind Ollama)     | `insrc_analyze`         |

- **`insrc_analyze_step`** is multi-turn: the server hands you the decomposer / synthesizer / narrow-LLM prompts + schemas via tool responses, and YOU emit the JSON as your next reasoning step. Every reasoning turn stays in this session — better accuracy, no subprocess spawn, no separate billing. Prefer this by default.
- **`insrc_analyze`** is one-shot: single tool call, server runs the whole pipeline. Inner narrow-LLM calls route to the daemon's configured `shaperProvider` (Ollama by default, slower + separate billing). Use only when you specifically want the Ollama path.

### `insrc_analyze_step` loop shape

Follow the `next` field in each response verbatim. The `guidance`
field explains the next call in one sentence; `prompt` + `schema`
are the authoritative instructions for the JSON you emit. Preserve
`state` verbatim between calls — it's a short opaque token tied
to a server-side run.

```
1. insrc_analyze_step({ phase: 'start', focus: '...' })
   -> { next: 'emit_plan', prompt, schema, state }
2. [emit JSON matching the plan schema]
   insrc_analyze_step({ phase: 'plan', plan: <JSON>, state })
   -> either { next: 'emit_narrow', ..., explorationId, state } (loop)
   -> or     { next: 'emit_bundle', ..., state }
3. [only if emit_narrow] emit JSON matching the narrow schema
   insrc_analyze_step({ phase: 'narrow', explorationId,
                        narrow: <JSON>, state })
   -> loop until emit_bundle
4. [emit JSON matching the bundle schema]
   insrc_analyze_step({ phase: 'bundle', bundle: <JSON>, state })
   -> { next: 'done', markdown } — render this to the user
```

### When NOT to use either

- Editing files (both tools are read-only).
- Running tests / builds.
- Answering non-context questions.
- When the returned bundle is empty or clearly off-topic — fall back to `Read` / `Grep` / `Glob` at that point.

### `repo` argument

If not passed, the tool uses `$INSRC_REPO` from the MCP server's
environment. Explicit `repo` overrides it. The repo must be
registered with the insrc daemon (add it via the `insrc` TUI —
Repos pane → `a` — or the `repo.add` IPC) and finished indexing.
