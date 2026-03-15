# insrc CLI Reference

> Local-first hybrid coding agent — CLI command reference

## Quick Start

```bash
insrc                          # Start interactive REPL
insrc "explain the auth flow"  # One-shot question
insrc ask "refactor utils.ts"  # Classify + execute + exit
insrc plan "add caching layer" # Generate implementation plan
```

## Global Options

All commands support:
- `--cwd <path>` — Override the working directory (defaults to `$PWD`)

---

## Default Command

```
insrc [message] [--cwd <path>]
```

Start the interactive REPL agent. If `message` is provided, processes it as a single turn and exits.

**Examples:**
```bash
insrc                                    # Interactive REPL
insrc "how does the indexer work?"       # One-shot, then exit
insrc --cwd /path/to/repo               # REPL in specific repo
```

---

## `insrc ask`

```
insrc ask <message> [options]
```

Classify intent, execute one turn, print result, and exit.

| Option | Description | Default |
|--------|-------------|---------|
| `--intent <name>` | Override classified intent (implement, refactor, test, debug, etc.) | auto-detect |
| `--claude` | Force Claude routing (skip local LLM) | false |
| `--json` | Output structured JSON | false |
| `--cwd <path>` | Repo path | cwd |

**Examples:**
```bash
insrc ask "what does parseConfig do?"
insrc ask --intent review "check auth.ts for bugs"
insrc ask --claude --json "summarize the DB schema"
```

---

## `insrc plan`

```
insrc plan <description> [options]
```

Generate an implementation plan as a markdown checklist.

| Option | Description | Default |
|--------|-------------|---------|
| `--claude` | Force Claude routing | false |
| `--json` | Output structured JSON | false |
| `--cwd <path>` | Repo path | cwd |

**Examples:**
```bash
insrc plan "add user authentication with JWT"
insrc plan --json "migrate database to PostgreSQL"
```

---

## `insrc daemon`

Manage the background indexer/search daemon.

### `insrc daemon start`

Start the daemon in the background. The daemon:
- Parses and indexes registered repos via tree-sitter
- Stores entities in Kuzu (graph DB) and LanceDB (vector DB)
- Watches for file changes and re-indexes incrementally
- Performs delta indexing on startup (mtime-based) for files changed while stopped
- Listens on `~/.insrc/daemon.sock` for JSON-RPC requests

**Logs:** `/tmp/.insrc/daemon.log` (or `~/.insrc/logs/` depending on config)

### `insrc daemon stop`

Gracefully stop the running daemon. Sends shutdown RPC and waits for PID file cleanup.

### `insrc daemon status`

Display daemon health:
- Running/stopped status with uptime
- Index job queue depth
- Embedding model readiness
- Registered repos with last indexed timestamp

**Example output:**
```
status:  running  (uptime 5m 23s)
queue:   0 job(s) pending
model:   ready
repos:
  [ready   ] /home/user/project  (last indexed: 15/3/2026, 9:33:38 pm)
```

---

## `insrc repo`

Manage indexed repositories.

### `insrc repo add <path>`

Register a local repo for indexing. The daemon will:
1. Parse all source files via tree-sitter (TypeScript, Python, Go)
2. Extract entities (functions, classes, interfaces, types)
3. Build IMPORTS, CALLS, INHERITS, IMPLEMENTS relations
4. Embed entities for vector similarity search
5. Watch for future file changes

### `insrc repo remove <path>`

Unregister a repo and remove all its graph/vector data from Kuzu and LanceDB.

### `insrc repo list`

List all registered repos with status and last indexed time.

**Statuses:** `pending` (awaiting first index), `indexing` (in progress), `ready` (up to date), `error` (indexing failed)

---

## `insrc agent`

Manage agent runs (checkpoint, resume, cleanup).

### `insrc agent list` (alias: `ls`)

List all agent runs across all repos. Shows:
- Run ID
- Agent type (designer, planner, brainstorm, pair, delegate, tester)
- Status (running, paused, completed, failed, crashed)
- Last update time
- Repo path

Crashed runs (stale heartbeat) are auto-detected and highlighted.

### `insrc agent resume <runId>`

Resume a paused or crashed agent run from its last checkpoint. The agent continues from the exact step where it stopped.

### `insrc agent discard <runId>`

Delete a run and all its artifacts (checkpoints, intermediate files).

### `insrc agent prune [--days <n>]`

Remove completed runs older than `n` days (default: 7).

**Example:**
```bash
insrc agent prune --days 3    # Remove runs completed > 3 days ago
```

---

## `insrc config`

Manage the config management framework (templates, feedback, conventions).

### `insrc config show [--global | --project]`

Display the resolved config JSON (global merged with project overrides).

| Option | Description |
|--------|-------------|
| `--global` | Show only `~/.insrc/config.json` |
| `--project` | Show only `.insrc/config.json` from the repo |
| (neither) | Show merged result |

### `insrc config reindex [--global | --project <path>]`

Drop and rebuild the config vector store. Use after manually editing template/feedback/convention files.

| Option | Description |
|--------|-------------|
| `--global` | Reindex global config entries only |
| `--project <path>` | Reindex project config for a specific repo |

### `insrc config search <query> [options]`

Semantic search over config entries (templates, feedback, conventions).

| Option | Description | Default |
|--------|-------------|---------|
| `--namespace <ns>` | Filter: `tester`, `pair`, `delegate`, `designer`, `planner`, `common` | all |
| `--category <cat>` | Filter: `template`, `feedback`, `convention` | all |
| `--language <lang>` | Filter: `typescript`, `python`, `go` | all |
| `--limit <n>` | Max results | 10 |

**Example:**
```bash
insrc config search "vitest mock patterns" --namespace tester --language typescript
```

### `insrc config list [options]`

List config entries with filtering.

| Option | Description |
|--------|-------------|
| `--namespace <ns>` | Filter by namespace |
| `--category <cat>` | Filter by category |
| `--scope <scope>` | Filter: `global` or `project:<path>` |

### `insrc config init [--path <path>]`

Scaffold a project config directory structure:
```
<repo>/.insrc/
  config.json
  templates/
  feedback/
  conventions/
```

---

## `insrc conversation`

Manage persistent conversation history.

### `insrc conversation compact [options]`

Run tiered compression on stored conversation turns.

| Option | Description | Default |
|--------|-------------|---------|
| `--repo <path>` | Scope to one repo | all repos |
| `--hot-days <n>` | Days to keep verbatim | 7 |
| `--warm-days <n>` | Days before cold compression | 30 |
| `--cold-days <n>` | Days before archive | 90 |
| `--dry-run` | Preview without applying | false |

**Compaction tiers:**
- **Hot** (< 7 days): Kept verbatim
- **Warm** (7-30 days): Assistant response truncated to 500 chars, re-embedded
- **Cold** (30-90 days): Semantically similar turns merged into clusters
- **Archive** (> 90 days): Collapsed into per-session summaries

**Directives** (user preferences like "never use opus") are extracted and preserved across all tiers.

**Example:**
```bash
insrc conversation compact --dry-run              # Preview
insrc conversation compact --hot-days 14          # Keep 2 weeks verbatim
insrc conversation compact --repo /path/to/repo   # Single repo
```

### `insrc conversation stats [--repo <path>]`

Display conversation storage statistics:
- Total turns
- Session count
- Breakdown by type (turn, directive, summary, merged)
- Breakdown by tier (hot, warm, cold, archive)
- Breakdown by repo

---

## `insrc test`

Run the tester agent for automated test generation and execution.

### `insrc test run <files...> [options]`

Run the full tester pipeline: analyze → plan → write → execute → fix.

| Option | Description | Default |
|--------|-------------|---------|
| `--review` | Enable code review gates per test file | false |
| `--cwd <path>` | Repo path | cwd |
| `--framework <name>` | Override auto-detected framework | auto |
| `--kind <type>` | Test kind: `unit` or `live` | unit |
| `--timeout <ms>` | Per-test execution timeout | 60000 |

Non-interactive — auto-approves plan and review gates. Exits with code 0 if all tests pass, 1 otherwise.

**Examples:**
```bash
insrc test run src/agent/planner/steps.ts
insrc test run --review src/db/search.ts src/db/entities.ts
insrc test run --framework vitest --kind unit src/utils/
```

### `insrc test plan <files...> [options]`

Generate a test plan without executing. Stops after plan generation.

| Option | Description | Default |
|--------|-------------|---------|
| `--format <fmt>` | Output format: `json` or `md` | json |
| `--cwd <path>` | Repo path | cwd |
| `--framework <name>` | Override framework | auto |
| `--kind <type>` | Test kind | unit |

**Examples:**
```bash
insrc test plan src/agent/planner/steps.ts
insrc test plan --format md src/db/search.ts
```

---

## Configuration

Config file: `~/.insrc/config.json`

See `scripts/config/config.sample.json` for a complete example with all fields and defaults.

**Key sections:**
- `ollama.host` — Ollama server URL
- `models.local` — Local model name (e.g., `qwen3-coder:latest`)
- `models.tiers` — Claude model tiers (fast, standard, powerful)
- `models.context.local` — Context window size in tokens (default: 16384)
- `models.agents` — Per-agent step-level provider overrides
- `keys.anthropic` — Anthropic API key (or set `ANTHROPIC_API_KEY` env)
- `permissions.mode` — `validate` (prompt before tools) or `auto-accept`
- `routing.mode` — `static` (rule-based) or `auto` (LLM-assessed)

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API key (overrides config file) |
| `INSRC_LOG_LEVEL` | Log level: `debug`, `info` (default), `warn`, `error` |
| `INSRC_LOG_DIR` | Override log directory |

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Error or test failure |
