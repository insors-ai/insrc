# CLAUDE.md — insrc

## Project overview

**insrc** is a local-first hybrid coding agent that builds a live Code Knowledge Graph from source code. It runs a background daemon that parses repos via tree-sitter, stores structural relationships in Kuzu (graph DB) and entity embeddings in LanceDB (vector DB), then exposes an interactive agent REPL that routes tasks between a local LLM (Ollama) and Claude.

Repository: `github.com/insors-ai/insrc`

## Tech stack

- **Language**: TypeScript (strict mode, ESM-only via `"type": "module"`)
- **Runtime**: Node.js 20+, executed with `tsx` during development
- **Module system**: NodeNext (`"module": "nodenext"` in tsconfig)
- **Databases**: Kuzu (embedded graph DB, Cypher queries), LanceDB (embedded vector DB)
- **Parsing**: tree-sitter (TypeScript, Python, Go)
- **LLM providers**: Ollama (local — qwen3-coder, qwen3-embedding), Anthropic Claude API (optional)
- **Logging**: pino + pino-pretty (CLI) + pino-roll (file rotation)
- **CLI framework**: commander
- **HTTP**: undici

## Project structure

```
src/
  shared/          Core types, paths, logger (imported by everything)
    types.ts       All shared interfaces: Entity, Relation, LLMProvider, Task, Plan, etc.
    paths.ts       ~/.insrc/ directory layout constants
    logger.ts      pino-based logging (daemon vs CLI mode)
  indexer/         Code parsing and knowledge graph construction
    parser/        tree-sitter parsers (typescript.ts, python.ts, go.ts, base.ts, artifact.ts)
    manifest.ts    Dependency manifest parsing (package.json, go.mod, etc.)
    resolver.ts    Import resolution
    embedder.ts    Ollama embedding generation
    watcher.ts     @parcel/watcher file system watcher
  db/              Database access layer
    schema.ts      Kuzu DDL statements
    client.ts      Kuzu client wrapper
    entities.ts    LanceDB entity CRUD
    relations.ts   Kuzu relation CRUD
    repos.ts       Repo registry operations
    search.ts      Hybrid vector + FTS search
    conversations.ts  Session persistence
  daemon/          Background daemon process
    server.ts      JSON-RPC over Unix socket
    lifecycle.ts   Start/stop/PID management
    queue.ts       Index job queue
  agent/           Interactive coding agent
    index.ts       Main REPL loop — entry point for agent sessions
    session.ts     Session state management
    config.ts      AgentConfig loading from ~/.insrc/config.json
    classifier/    Intent classification (LLM-based with keyword fallback)
    router.ts      Provider selection (local vs Claude)
    escalation.ts  Auto-escalation to Claude based on scope signals
    context/       Layered context management (L1-L5 budget system)
    providers/     LLM provider implementations (ollama.ts, claude.ts)
    pipeline/      4-stage pipeline: analyze → plan → execute → assemble
    tasks/         Intent-specific pipelines (implement, refactor, test, debug, etc.)
      designer/    Multi-step design pipeline with validation gates
    tools/         Agent tool system (registry, executor, validator, MCP client)
    faults/        Health monitoring and fault classification
    attachments/   File attachment handling (images, PDFs, code)
  cli/             CLI entry point and commands
    index.ts       commander setup (daemon, repo, chat commands)
    client.ts      IPC client for daemon communication
    commands/      Subcommand handlers (daemon.ts, repo.ts)
scripts/           Development/test scripts (run with `npx tsx scripts/<name>.ts`)
design/            Architecture design documents (HTML, Markdown)
```

## Build and run

```bash
npm install                          # install dependencies
npm run build                        # tsc → dist/
npm run dev                          # tsx src/index.ts
npx tsx scripts/test-indexer.ts      # smoke test (parser + manifest + resolver, no DB)
npx tsx scripts/test-classifier-live.ts  # live classifier test
npx tsx scripts/test-designer-live.ts    # live designer pipeline test
```

## Code conventions

### Imports
- Always use `.js` extension in import paths (NodeNext resolution requires it even for .ts files)
- Use `import type` for type-only imports (`verbatimModuleSyntax` is enabled)
- Shared types come from `../shared/types.js` — never import Ollama/Anthropic SDK types directly into agent logic

### TypeScript strictness
- `strict: true` with `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`
- Optional properties use `| undefined` explicitly (e.g., `tools?: ToolDefinition[] | undefined`)
- Index access results are `T | undefined` — always handle the undefined case

### Logging
- Use `getLogger('module-name')` from `../shared/logger.js` — never use `console.log`
- For injectable log functions in pipelines, use `toLogFn(log)` to adapt pino to `(msg: string) => void`
- Log levels: `INSRC_LOG_LEVEL` env var (default: `info`)

### LLM provider abstraction
- All LLM interaction goes through the `LLMProvider` interface in `shared/types.ts`
- Never import Ollama or Anthropic SDK directly in agent logic — use `providers/ollama.ts` or `providers/claude.ts`
- Embedding model: `qwen3-embedding:0.6b` (2048 dims), agent model: `qwen3-coder:latest`

### Entity IDs
- Deterministic: `SHA256(repo + file + kind + name)`, hex-32

### IPC
- Daemon communicates via JSON-RPC over Unix socket at `~/.insrc/daemon.sock`
- CLI/agent never opens Kuzu or LanceDB directly — always goes through daemon IPC

### Context management
- 5-layer budget system (L1 system, L2 summary, L3a recent, L3b semantic, L4 task, L5 response)
- Context is assembled per-turn from graph queries, not raw file dumps
- Token budgets estimated via chars-per-token ratio (default: 3)

## Intent taxonomy

Supported intents: `implement`, `refactor`, `test`, `debug`, `review`, `document`, `research`, `graph`, `plan`, `requirements`, `design`, `deploy`, `release`, `infra`

## Key architectural rules

1. **Daemon owns all DB access** — agent/CLI communicate via IPC only
2. **Local-first** — everything works without Claude; Claude is opt-in via `ANTHROPIC_API_KEY`
3. **Dependency-closure scoping** — searches span only transitive `DEPENDS_ON` closure of active repo
4. **Graph + vector** — structural queries use Kuzu Cypher; semantic queries use LanceDB ANN/FTS
5. **No raw file dumps** — context is always structured entity summaries + relations from the graph
