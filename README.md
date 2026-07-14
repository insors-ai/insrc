# insrc

Standalone backend for the **insrc** code-knowledge system — a local-first
daemon that indexes your repositories into a structural graph + vector store
and exposes them for citation-grounded code exploration and multi-step
engineering workflows.

Split out from [insors-ai/insrc-ide](https://github.com/insors-ai/insrc-ide)
on 2026-07-14. The IDE fork clones this repo into `~/.insrc/daemon/`, builds
it, and spawns the compiled entry — the JSON-RPC IPC contract over the Unix
socket is the only surface the IDE consumes.

## What it does

insrc parses your code with tree-sitter, resolves cross-file relations into a
graph, embeds entities for semantic search, and serves both structural and
semantic queries through a single background daemon. On top of that store it
provides:

- **Analyze framework** — deterministic graph queries + citation-grounded
  synthesis. Every claim is anchored to a real exploration output (module
  profile, symbol locate, class hierarchy, doc constraint), so file paths come
  from the indexed graph rather than being hallucinated.
- **Workflow framework** — a `define → design.epic → design.story → tracker`
  chain for turning a goal into approved HLD/LLD artifacts and GitHub
  Epic/Story issues, with amendments and staleness gates.
- **~110 built-in tools** — capability wrappers spanning
  file/git/shell/http/web/gh/k8s/pkg/ssh/test/notify/search/graph/db/data/code/cloud.

Both frameworks are exposed as MCP tools (`insrc_analyze`,
`insrc_analyze_step`, `insrc_workflow_step`) so they can drive Claude Code,
Codex, or any MCP client.

## Design principles

- **Accuracy is primary; cost is the least priority.** Given the choice between
  an accurate-but-expensive path and a cheap-but-lossy one, insrc chooses
  accuracy.
- **Local-first.** Ollama is always available and embeddings are local-only.
- **No direct cloud REST calls.** Cloud LLM access goes exclusively through the
  locally-installed `claude` and `codex` CLI binaries (via `CliProvider`), so
  auth and quota stay with the user's CLI OAuth sessions.
- **Daemon owns all storage.** The CLI, MCP server, and IDE never open LMDB or
  LanceDB directly — everything goes through daemon IPC.

## Architecture

```
┌──────────────┐   JSON-RPC over    ┌────────────────────────────────┐
│ CLI / MCP /  │  ~/.insrc/daemon.  │            Daemon              │
│ IDE workbench │ ─── sock ──────▶  │  IPC · queue · watcher · tools │
└──────────────┘                    └───────────────┬────────────────┘
                                                     │
                     ┌───────────────────────────────┼──────────────────────┐
                     ▼                                ▼                       ▼
              ┌────────────┐                  ┌──────────────┐        ┌──────────────┐
              │  Indexer   │                  │   Storage    │        │  Providers   │
              │ tree-sitter │                 │ LMDB graph + │        │ Ollama +     │
              │ + embedder │                  │ Lance vectors│        │ CliProvider  │
              └────────────┘                  │ + DuckDB pool│        └──────────────┘
                                              └──────────────┘
```

- **Storage** — LMDB (`lmdb-js`) as the KV substrate for a custom graph layer
  (`findCallers` / `findCallees` / `transitiveClosure` / `unreachable` …),
  LanceDB for entity embeddings + ANN search, and an in-memory DuckDB pool that
  backs the data-driver `db_file_*` tools (query engine only — not persistent
  storage).
- **Scoping** — graph searches span only the transitive `DEPENDS_ON` closure of
  the active repo. Registry membership is established exclusively via the
  `repo.add` IPC; entities for unregistered repos fail the upsert.

## Project structure

```
src/
  shared/     Core types, ~/.insrc/ paths, pino logger
  indexer/    Tree-sitter parsers, manifest resolution, embedder, file-watcher
  db/         Storage — graph/ (LMDB), lance/ (vectors), DuckDB pool
  daemon/     Daemon core (IPC server, registry, queue, lifecycle) + tools/
  config/     On-disk config store, templates, feedback
  agent/      providers/ — ollama.ts, cli-provider.ts, structured-output.ts
  analyze/    Analyze framework (recipes, decomposer, synthesizer, context builder)
  workflow/   Workflow framework (define, design.epic, design.story, tracker, gates)
  mcp/        MCP servers (insrc_analyze_step, insrc_workflow_step)
  cli/        `insrc` interactive TUI (ink) — panes, services, hooks
  bin/        Executable entrypoints
  prompts/    Shaper / analyze / workflow prompt templates
  assets/     Non-TS runtime resources (copied by copy-assets.mjs)
```

Compiled outputs: the daemon binary the IDE spawns is `out/daemon/index.js`;
the MCP binary is `out/bin/insrc-mcp.js` (registered as `insrc-mcp`).

## Tech stack

- **Language** — TypeScript (strict, ESM-only, NodeNext resolution)
- **Runtime** — Node.js 20+ (`tsx` in dev); native modules build against Node
  22 headers and the daemon spawns under Node 22 at install time
- **Databases** — LMDB (`lmdb-js`), LanceDB, DuckDB (`@duckdb/node-api`)
- **Parsing** — tree-sitter (TypeScript, Python, Go, Java, Scala)
- **LLM providers** — Ollama (local, qwen3-coder + qwen3-embedding) +
  `CliProvider` (claude + codex CLI subprocesses)
- **Logging** — pino (+ pino-pretty, pino-roll)
- **CLI** — ink + react (full-screen TUI) · **HTTP** — undici

## Build

```bash
npm install        # runtime + dev deps
npm run build      # tsc + copy-assets.mjs
```

## Test

```bash
npx tsx --test 'src/**/__tests__/*.test.ts'    # full sweep
```

Fast subsets for iteration:

```bash
npx tsx --test 'src/workflow/**/*.test.ts' 'src/mcp/**/*.test.ts'   # ~5 s
npx tsx --test 'src/db/**/*.test.ts'                                # LMDB / Lance / graph
npx tsx --test 'src/analyze/**/*.test.ts'                           # analyze framework
```

Live-service tests gate behind env vars (`INSRC_LIVE_TESTS=1` for Ollama /
CliProvider suites) and skip cleanly when unset.

## CLI

`insrc` is a **full-screen interactive terminal UI** (built on
[ink](https://github.com/vadimdemedes/ink)) — there are no subcommands. Run it
in a terminal:

```bash
npm run insrc        # dev (tsx); or `insrc` once built + linked
```

It opens a dashboard with four panes (switch with `1`–`4`/`Tab`, `r` refresh,
`q` quit):

- **Daemon** — live health (uptime, queue, model-pull, LMDB size) and the full
  maintenance lifecycle: `s` start · `x` stop · `R` restart · `u` update
  (git fast-forward → `npm install` if the lockfile changed → build, mirroring
  `daemon-ctl.sh`) · `b` backup · `c` compact.
- **Repos** — registered repositories with indexing status; `a` add · `d` remove
  · `i` reindex. The highlighted repo is what the Workflows pane targets.
- **Workflows** — the Epic chain for the selected repo; open an Epic to approve
  / reject the next pending artifact (HLD/LLD approvals auto-push to the GitHub
  tracker) and approve / reject pending HLD amendments.
- **Setup** — hardware detection + model recommendation; `a` apply config · `p`
  pull missing models (progress streamed inline).

It requires an interactive TTY (it exits with a message when stdin/stdout isn't
one). Programmatic callers should talk to the daemon over the IPC socket
directly rather than driving the UI.

## MCP server

Register the compiled `insrc-mcp` binary with an MCP client (e.g. Claude Code
in `~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "insrc": {
      "command": "insrc-mcp",
      "env": { "INSRC_REPO": "/path/to/registered/repo" }
    }
  }
}
```

`INSRC_REPO` is optional — callers may pass `repo` on each tool call instead.
The repo must be registered (Repos pane → `a` add in the `insrc` TUI) and
finished indexing. When the
client declares the `sampling` capability, inner LLM calls route back through
MCP `sampling/createMessage` (single session, no subprocess); otherwise they
fall back to the daemon's configured `shaperProvider`.

## Documentation

- [`docs/daemon.md`](docs/daemon.md) — daemon usage guide
- [`docs/workflow.md`](docs/workflow.md) — workflow user guide
- [`design/analyze-framework.md`](design/analyze-framework.md) — analyze framework
- [`design/indexer.html`](design/indexer.html) — indexer architecture
- [`plans/`](plans/) — storage substrate, graph layer, repo registry contract,
  tool registry, workflow framework design notes
- [`CLAUDE.md`](CLAUDE.md) — full engineering guide and architectural rules

## License

MIT — see [LICENSE](LICENSE).
