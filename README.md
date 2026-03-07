# insrc

A local-first hybrid coding agent that understands your codebase through a live Code Knowledge Graph — not just file search.

insrc runs a background indexer daemon that parses source code across multiple repositories, extracts entities and relationships, and stores them in a graph + vector database. The agent queries this graph to build precise, minimal context for each task, then routes work to a local LLM or Claude depending on complexity.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  CLI  (insrc <command>)                                         │
│  Agent session (REPL)                                           │
└────────────────────┬────────────────────────────────────────────┘
                     │ JSON-RPC over Unix socket
                     │ (~/.insrc/daemon.sock)
┌────────────────────▼────────────────────────────────────────────┐
│  Daemon  (background process, survives CLI exit)                │
│                                                                 │
│  ┌─────────────┐  ┌──────────────────────────────────────────┐  │
│  │ IPC Server  │  │ Indexer Pipeline                         │  │
│  │ (JSON-RPC)  │  │  Watcher → Parser → Resolver → Embedder  │  │
│  └─────────────┘  └────────────────────┬─────────────────────┘  │
│                                        │                        │
│  ┌─────────────────────────────────────▼─────────────────────┐  │
│  │ SurrealDB  (surrealkv://~/.insrc/db)                      │  │
│  │  Code Knowledge Graph  +  Vector Index  +  History Store  │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                     │
       ┌─────────────┴──────────────┐
       │                            │
┌──────▼──────┐             ┌───────▼──────┐
│   Ollama    │             │  Claude API  │
│ (local LLM) │             │  (optional)  │
└─────────────┘             └──────────────┘
```

**Key design principles:**

- **Daemon-owned DB** — SurrealDB is opened exclusively by the daemon. The CLI and agent communicate via IPC, never touching the DB directly.
- **Local-first** — all indexing, embeddings, and routine agent tasks run on-device. Claude is opt-in.
- **Dependency-closure search** — searches span only the transitive `DEPENDS_ON` closure of the active repo, not all registered repos. Relevant without noise.
- **Graph + vector** — structural queries (callers, dependents, inheritance) use the graph; semantic queries use vector similarity. Most useful answers combine both.

---

## Indexer

The indexer is the foundational subsystem. It parses source code across registered repositories, extracts a **Code Knowledge Graph**, and keeps it live as files change.

### What it builds

- **Entity nodes** — functions, classes, interfaces, types, files, repos — with vector embeddings for semantic search
- **Relation edges** — `CALLS`, `IMPORTS`, `DEFINES`, `INHERITS`, `IMPLEMENTS`, `DEPENDS_ON`, `EXPORTS`, `REFERENCES`
- **Cross-repo links** — `DEPENDS_ON` edges between repos, resolved from `package.json`, `go.mod`, `pyproject.toml`

### Languages supported

| Language | Parser | Notes |
|---|---|---|
| TypeScript / JavaScript | tree-sitter | Includes JSX/TSX |
| Python | tree-sitter | |
| Go | tree-sitter | Implicit interface satisfaction via method-set matching |

### Key behaviours

- **Incremental indexing** — content-hashed files; only changed files are re-parsed
- **Native file watching** — `@parcel/watcher` (inotify / FSEvents / kqueue) for large repos
- **Auto model install** — checks and pulls `qwen3-embedding:0.6b` on daemon startup if missing
- **Single shared DB** — one SurrealDB instance for all repos; `repo` field namespaces every entity

**Design doc:** [design/indexer.html](design/indexer.html)

---

## Agent

The agent is a local-first hybrid assistant. Routine coding tasks are handled entirely by a local LLM. Complex design and architecture tasks are escalated to Claude — always transparently.

### Task routing

| Task type | Provider |
|---|---|
| Inline completion, explain, test, small edit | `qwen3-coder:latest` via Ollama |
| Multi-file refactor, architecture, design docs | Claude (if API key set) |
| Graph queries (callers, dependents, impact) | SurrealDB directly — no LLM |

Escalation to Claude is triggered explicitly (`@claude ...`), by agent suggestion, or automatically when scope signals fire (> 3 files, > 1 repo, task kind = `design`).

### Context & memory

The agent assembles structured context from the graph each turn — never raw file dumps. The 64K Ollama context window is managed through a layered memory model:

| Layer | Budget | Contents |
|---|---|---|
| L1 System | ~1K | Agent persona, active repo, dependency closure list |
| L2 Summary | ~3K | Rolling compressed summary of older turns |
| L3a Recent | ~4K | Last 5 turns, recency-weighted verbatim |
| L3b Semantic | ~4K | Relevant older turns retrieved via embedding search |
| L4 Task context | ~16K | Graph-fetched entities, replaced every turn |
| L5 Response | ~8K | Reserved — never used for input |

Session summaries are persisted across sessions per repo (30-day TTL, capped at 20 per repo), giving the agent memory of past decisions without replaying raw history.

**Design doc:** [design/agent.html](design/agent.html)

---

## LLM Dependencies

insrc uses three LLM roles, all routed through Ollama for local execution. Claude is the only external dependency, and it is fully optional.

### Embedding — `qwen3-embedding:0.6b`

| Property | Value |
|---|---|
| Role | Code and conversation turn embeddings |
| Context window | 32K tokens |
| Dimensions | 2048 |
| Runtime | Ollama (local) |
| Auto-installed | Yes — daemon pulls on first start if missing |

Used for: entity vector search (code graph), semantic history retrieval (L3b), dependency closure scoping.

Instruction-aware: query embeddings use a task prefix; document embeddings (indexed code) do not.

### Local agent — `qwen3-coder:latest`

| Property | Value |
|---|---|
| Role | Routine coding tasks, rolling summarization |
| Context window | 64K tokens |
| Runtime | Ollama (local) |
| Auto-installed | Yes — daemon pulls on first start if missing |

Handles the majority of agent interactions: completions, explanations, test generation, single-file edits, and L2 summarization of evicted conversation turns.

### Cloud agent — Claude (Anthropic)

| Property | Value |
|---|---|
| Role | Complex reasoning, design, multi-repo refactor |
| Models | `claude-sonnet-4-6` (default), `claude-opus-4-6`, `claude-haiku-4-5` |
| Context window | 200K tokens |
| Runtime | Anthropic API (requires `ANTHROPIC_API_KEY`) |
| Required | No — agent operates fully locally without it |

Receives structured graph context (entity summaries + relations), not raw source files. Every Claude invocation is announced to the user before the API call is made. Code never leaves the machine if no API key is set.

---

## User Data Directory

All runtime state is stored under `~/.insrc/`:

```
~/.insrc/
  db/           SurrealDB database (surrealkv, daemon-exclusive)
  daemon.pid    PID of the running daemon process
  daemon.sock   Unix socket for CLI ↔ daemon IPC
  logs/
    daemon.log  Daemon stdout/stderr
```

---

## CLI

```bash
# Daemon
insrc daemon start
insrc daemon stop
insrc daemon status

# Repo registry
insrc repo add <path>
insrc repo remove <path>
insrc repo list

# Agent session
insrc chat                   # start interactive session for current repo
insrc chat --repo <path>     # explicit repo
```

---

## Development

```bash
npm install
npm run dev       # run with tsx (no build step)
npm run build     # compile TypeScript to dist/
npm start         # run compiled output
```

**Runtime requirements:**
- Node.js 20+
- [Ollama](https://ollama.com) running locally
- `ANTHROPIC_API_KEY` environment variable (optional — enables Claude escalation)
