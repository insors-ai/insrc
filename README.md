# insrc

Backend for the insrc code-knowledge system: daemon, indexer, graph/vector storage, tool registry, MCP server, workflow framework, agent providers.

Split out from [insors-ai/insrc-ide](https://github.com/insors-ai/insrc-ide) — the IDE clones this repo into `~/.insrc/daemon/` and spawns the compiled entry.

## Layout

```
src/
  agent/         LLM provider abstraction (Ollama + CliProvider)
  analyze/       Analyze framework (context assembly + narrow LLM shapers)
  bin/           Executable entrypoints (daemon, MCP server, CLI)
  cli/           `insrc` CLI (commander)
  config/        On-disk config store
  daemon/        Daemon core (IPC, queue, lifecycle, tool registry + built-ins)
  db/            Storage (LMDB graph + LanceDB vectors + DuckDB data-driver pool)
  indexer/       Tree-sitter parsers, manifest resolution, embedder, watcher
  mcp/           MCP servers (insrc_analyze_step, insrc_workflow_step)
  shared/        Core types, paths, logger
  workflow/      Workflow framework (define → design → tracker)
```

## Build

```
npm install
npm run build
```

## Test

```
npx tsx --test src/**/__tests__/*.test.ts
```
