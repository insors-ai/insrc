# insrc

A local-first hybrid coding agent that understands your codebase through a live Code Knowledge Graph — not just file search.

insrc runs a background indexer daemon that parses source code across multiple repositories, extracts entities and relationships, and stores them in an embedded graph + vector database. The agent queries this graph to build precise, minimal context for each task, then routes work to a local LLM or Claude depending on complexity.

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
│            ┌───────────────────────────┴──────────────┐         │
│            │                                          │         │
│  ┌─────────▼──────────────────┐  ┌───────────────────▼───────┐  │
│  │ Kuzu  (~/.insrc/graph/)    │  │ LanceDB (~/.insrc/lance/)  │  │
│  │  Code Knowledge Graph      │  │  Entity store + Embeddings │  │
│  │  (IMPORTS, DEFINES, CALLS, │  │  Vector search + FTS       │  │
│  │   INHERITS, DEPENDS_ON…)   │  │                           │  │
│  └────────────────────────────┘  └───────────────────────────┘  │
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

- **Daemon-owned DB** — Kuzu and LanceDB are opened exclusively by the daemon. The CLI and agent communicate via IPC, never touching the databases directly.
- **Local-first** — all indexing, embeddings, and routine agent tasks run on-device. Claude is opt-in.
- **Dependency-closure search** — searches span only the transitive `DEPENDS_ON` closure of the active repo, not all registered repos. Relevant without noise.
- **Graph + vector** — structural queries (callers, dependents, inheritance chains) use Kuzu (Cypher); semantic queries use LanceDB vector/FTS. Most useful answers combine both.

---

## Storage Design

Two embedded databases — each handling what it does best:

### Kuzu — Code Knowledge Graph

Stores the structural relationships between code entities as a property graph. Queried with Cypher.

**Node tables** (one per entity kind):

| Table | Key fields |
|---|---|
| `File` | `id`, `repo`, `path`, `hash`, `indexedAt` |
| `Function` | `id`, `repo`, `file`, `name`, `startLine`, `endLine` |
| `Class` | `id`, `repo`, `file`, `name`, `startLine`, `endLine` |
| `Interface` | `id`, `repo`, `file`, `name`, `startLine`, `endLine` |
| `TypeAlias` | `id`, `repo`, `file`, `name`, `startLine`, `endLine` |
| `Module` | `id`, `name` |
| `Repo` | `id`, `path`, `name`, `addedAt`, `status` |

**Relation tables:**

| Relation | From → To | Meaning |
|---|---|---|
| `IMPORTS` | File → File\|Module | `import` statement, resolved to file or external module |
| `DEFINES` | File → Function\|Class\|Interface\|TypeAlias | Entity defined in this file |
| `CALLS` | Function → Function | Direct function call (same or cross-file) |
| `INHERITS` | Class → Class | `extends` |
| `IMPLEMENTS` | Class → Interface | `implements` |
| `DEPENDS_ON` | Repo → Module | Dependency declared in manifest |
| `EXPORTS` | File → Function\|Class\|Interface\|TypeAlias | Re-exported symbol |

Example Cypher queries:
```cypher
-- All functions a given function transitively calls
MATCH (f:Function {name: 'indexFile'})-[:CALLS*1..5]->(g:Function)
RETURN DISTINCT g.name, g.file

-- Files that import a changed module
MATCH (f:File)-[:IMPORTS]->(m:Module {name: 'node:fs'})
RETURN f.path
```

### LanceDB — Entity Store + Search

Stores every entity with its embedding vector and body text. Supports:
- **Vector similarity search** — ANN over 2048-dim embeddings
- **Full-text search (BM25)** — keyword search over `name` and `body` fields
- **Hybrid reranking** — combine vector + FTS scores

**`entities` table schema:**

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | SHA-256 hash of (repo, file, kind, name) |
| `kind` | `string` | `file`, `function`, `class`, `interface`, `type`, `module` |
| `name` | `string` | Symbol name or file path |
| `repo` | `string` | Absolute repo root path |
| `file` | `string` | Absolute file path |
| `startLine` | `int32` | |
| `endLine` | `int32` | |
| `body` | `string` | Source text (capped at 8 000 chars) |
| `language` | `string` | `typescript`, `python`, `go` |
| `hash` | `string` | Content hash (16-char SHA-256 prefix) |
| `embeddingModel` | `string` | Model used for embedding |
| `indexedAt` | `string` | ISO 8601 |
| `vector` | `fixed_size_list<float32>[2048]` | Embedding — zero vector if not yet embedded |

---

## Indexer

The indexer is the foundational subsystem. It parses source code across registered repositories, extracts a **Code Knowledge Graph**, and keeps it live as files change.

### What it builds

- **Entity records** in LanceDB — functions, classes, interfaces, types, files — with vector embeddings for semantic search
- **Relation edges** in Kuzu — `CALLS`, `IMPORTS`, `DEFINES`, `INHERITS`, `IMPLEMENTS`, `DEPENDS_ON`, `EXPORTS`
- **Cross-repo links** — `DEPENDS_ON` edges from Repo to Module nodes, resolved from `package.json`, `go.mod`, `pyproject.toml`, `requirements.txt`

### Languages supported

| Language | Parser | Notes |
|---|---|---|
| TypeScript / JavaScript | tree-sitter | Includes JSX/TSX |
| Python | tree-sitter | |
| Go | tree-sitter | |

### Key behaviours

- **Incremental indexing** — content-hashed files; only changed files are re-parsed
- **Native file watching** — `@parcel/watcher` (inotify / FSEvents / ReadDirectoryChangesW)
- **Auto model install** — checks and pulls `qwen3-embedding:0.6b` on daemon startup if missing
- **Repo-namespaced** — `repo` field on every entity; graph queries can filter or span repos

---

## Agent

The agent is a local-first hybrid assistant. Routine coding tasks are handled entirely by a local LLM. Complex design and architecture tasks are escalated to Claude — always transparently.

### Task routing

| Task type | Provider |
|---|---|
| Inline completion, explain, test, small edit | `qwen3-coder:latest` via Ollama |
| Multi-file refactor, architecture, design docs | Claude (if API key set) |
| Graph queries (callers, dependents, impact) | Kuzu Cypher — no LLM |
| Semantic search | LanceDB vector/FTS — no LLM |

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

Used for: entity vector search (LanceDB ANN), semantic history retrieval (L3b), dependency closure scoping.

Instruction-aware: query embeddings use a task prefix; document embeddings (indexed code) do not.

### Local agent — `qwen3-coder:latest`

| Property | Value |
|---|---|
| Role | Routine coding tasks, rolling summarization |
| Context window | 64K tokens |
| Runtime | Ollama (local) |
| Auto-installed | Yes — daemon pulls on first start if missing |

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
  graph/        Kuzu database (Code Knowledge Graph, daemon-exclusive)
  lance/        LanceDB database (entity embeddings + FTS, daemon-exclusive)
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
npx tsx scripts/test-indexer.ts   # smoke test: parser + manifest + resolver (no DB)
npm run build                     # compile TypeScript to dist/
```

**Runtime requirements:**
- Node.js 20+
- [Ollama](https://ollama.com) running locally
- `ANTHROPIC_API_KEY` environment variable (optional — enables Claude escalation)

**Platform support:** Linux (glibc 2.23+), macOS (Intel + Apple Silicon), Windows x64.
