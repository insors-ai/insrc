# insrc daemon — usage guide

The insrc daemon is a local, always-on background process that
indexes your codebases into a **code knowledge graph** and serves
that graph over a Unix-socket RPC surface. It's what makes the
`insrc_analyze` / `insrc_analyze_step` MCP tools work in Claude
Code and Codex CLI, and what powers the analyze framework's
citation-grounded context bundles.

Everything the daemon does happens **locally on your machine**:

- Tree-sitter parsing → entity graph (LMDB) + entity embeddings (LanceDB)
- Ollama-hosted embedding + core model calls (never leaves localhost)
- Data-driver queries against local databases + files (DuckDB)
- IPC over a Unix domain socket at `~/.insrc/daemon.sock` (only your user account can connect)

The daemon does **not**:

- Call cloud APIs directly. Cloud-model reasoning goes through the
  locally-installed `claude` / `codex` CLI binaries via
  `CliProvider`, so auth + quota stay with your CLI OAuth
  session. There are no API-key fields anywhere in the daemon
  config.
- Store secrets. There is no `.env` file, no keychain access,
  nothing to leak.
- Modify your workspace. It only reads.

---

## Contents

1. [Prerequisites](#prerequisites)
2. [Install & build](#install--build)
3. [Data + config layout](#data--config-layout)
4. [Starting, stopping, checking status](#starting-stopping-checking-status)
5. [Managing repos (add / remove / list / reindex)](#managing-repos)
6. [Configuration](#configuration)
7. [Usage via Ollama (one-shot analyzer)](#usage-via-ollama)
8. [Usage via Claude Code (MCP)](#usage-via-claude-code)
9. [Usage via Codex CLI (MCP)](#usage-via-codex-cli)
10. [CLI reference](#cli-reference)
11. [Troubleshooting](#troubleshooting)
12. [Uninstall](#uninstall)

---

## Prerequisites

- **Node.js 20 or newer** on `PATH`. Verify with `node -v`.
- **Git** on `PATH` (used at install time + by the indexer's
  `.gitignore` awareness).
- **~500 MB free disk** for `~/.insrc/` (grows with indexed repo
  size — see [Data + config layout](#data--config-layout)).
- **Ollama is OPTIONAL.** The daemon auto-detects Ollama at boot;
  if it's not reachable (or the configured embedding model isn't
  installed), the daemon falls back to an **in-process ONNX
  embedder** — `nomic-embed-text-v1.5` at 768-dim, ~140 MB
  quantised weights downloaded once to `~/.insrc/models/hf-cache`
  on first use. Vector search and doc retrieval keep working.

You can run in one of three modes:

| Mode | Embedder | Shaper narrow-LLM | Best for |
| :--- | :--- | :--- | :--- |
| Full Ollama | qwen3-embedding via Ollama | qwen3.6 via Ollama (`shaperProvider: ollama`) | Local, offline, no CLI OAuth session |
| Hybrid | qwen3-embedding via Ollama | Claude Code / Codex session (`shaperProvider: cli-claude` / `cli-codex`, or via multi-turn `insrc_analyze_step`) | Best quality — big shaper LLM lives in the CLI |
| ONNX-only | nomic-embed-text-v1.5 in-process | Claude Code / Codex session (multi-turn only) | Minimal footprint — no Ollama install |

Recommended Ollama models (full or hybrid mode only):

```
ollama pull qwen3-embedding:0.6b     # embeddings (~700 MB)
ollama pull qwen3-coder:latest       # core / indexer  (~10 GB)
ollama pull qwen3.6:35b-a3b          # analyze shaper (~20 GB, optional if you're only using cli-claude / cli-codex)
```

### Choosing ONNX-only mode

For ONNX-only mode, no Ollama install needed — the daemon boots,
detects Ollama is absent, and initialises the ONNX embedder
automatically. **BUT** the default `config.json` targets Ollama's
qwen3-embedding at 1024-dim, and ONNX (nomic) is 768-dim. On
first-time install this is fine (empty Lance store, no schema to
mismatch). If you're migrating an existing install from Ollama to
ONNX, update `~/.insrc/config.json` first:

```json
{
  "models": {
    "providers": {
      "local": {
        "embeddingModel": "nomic-ai/nomic-embed-text-v1.5",
        "embeddingDim":   768
      }
    }
  }
}
```

Then wipe the Lance store and reindex:

```bash
~/.insrc/daemon/scripts/daemon-ctl.sh stop
rm -rf ~/.insrc/lance
~/.insrc/daemon/scripts/daemon-ctl.sh start
# then repo remove + repo add for each registered repo
```

If you skip the migration, the daemon boots into `disabled` state
for vector operations (deterministic queries still work) and
logs a clear error explaining the dim mismatch + recovery steps.

---

## Install & build

The daemon lives in the `insrc-ide` monorepo under `src/insrc/`
and installs to `~/.insrc/daemon/` (a git clone of the same
repo, kept in sync with `origin`).

### First-time install

```bash
# Clone into the canonical install location:
git clone https://github.com/insors-ai/insrc-ide.git ~/.insrc/daemon
cd ~/.insrc/daemon/src/insrc
npm install
npm run build
```

That produces `~/.insrc/daemon/out/insrc/` — the compiled
JavaScript the daemon executes at runtime. Prompt files + assets
are copied into `out/insrc/prompts` and `out/insrc/assets`
automatically.

### Updating an existing install

Use the ctl script bundled with the repo:

```bash
cd ~/.insrc/daemon/scripts
./daemon-ctl.sh update      # git fetch + fast-forward, npm install if lock changed, npm run build
./daemon-ctl.sh restart     # graceful stop (waits for full drain), then start
```

The ctl script pins the target to `~/.insrc/daemon` regardless of
where you invoke it from (override with `INSRC_DAEMON_ROOT=/path`).
It handles the daemon's ~20 s queue-drain window on shutdown so
`restart` doesn't race the old process.

---

## Data + config layout

Everything the daemon owns lives under `~/.insrc/`:

```
~/.insrc/
├── config.json           ← your config (created on first `insrc daemon start`; safe to edit)
├── daemon.sock           ← Unix domain socket the daemon listens on
├── daemon.pid            ← PID file (cleaned up on graceful shutdown)
├── graph.lmdb/           ← LMDB: entities, relations, repos, sessions, todos, config
├── lance/                ← LanceDB: entity + session + turn + config vectors
├── daemon/               ← the git checkout the daemon runs from
├── templates/            ← optional user-authored config templates
├── feedback/             ← optional feedback logs
├── conventions/          ← optional convention overrides
└── tmp/                  ← ephemeral pane scratch files (safe to delete on daemon-stop)

/tmp/.insrc/
├── daemon.log            ← current daemon log (pino JSON, rotated)
├── agent.<N>.log         ← rotated older logs
└── insrc/                ← ctl-script logs, build logs
```

The `graph.lmdb` directory is a directory-form LMDB with a
sparse map size up to 1 TiB. Actual disk usage tracks the sum of
your indexed repo sizes — expect ~150-300 MB per medium repo.

---

## Starting, stopping, checking status

Everything routes through `daemon-ctl.sh`:

```bash
./daemon-ctl.sh start      # sync origin, install if lock changed, build, start
./daemon-ctl.sh stop       # graceful stop, waits for queue drain
./daemon-ctl.sh restart    # stop → wait → start
./daemon-ctl.sh update     # sync + install + build (no restart)
./daemon-ctl.sh status     # daemon dir + branch + HEAD + registered repos
./daemon-ctl.sh --help
```

Or drive the underlying CLI directly if you want more granularity:

```bash
cd ~/.insrc/daemon/src/insrc
npx --no-install tsx cli/index.ts daemon start
npx --no-install tsx cli/index.ts daemon stop
npx --no-install tsx cli/index.ts daemon status
npx --no-install tsx cli/index.ts daemon compact       # reclaim LMDB free pages
npx --no-install tsx cli/index.ts daemon backup <dir>  # snapshot LMDB + Lance to a directory
```

### Auto-start on login (macOS launchd)

Create `~/Library/LaunchAgents/ai.insors.daemon.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>ai.insors.daemon</string>
  <key>ProgramArguments</key><array>
    <string>/bin/bash</string>
    <string>-c</string>
    <string>~/.insrc/daemon/scripts/daemon-ctl.sh start</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><false/>
  <key>StandardOutPath</key><string>/tmp/.insrc/launchd.stdout.log</string>
  <key>StandardErrorPath</key><string>/tmp/.insrc/launchd.stderr.log</string>
</dict></plist>
```

Load with `launchctl load ~/Library/LaunchAgents/ai.insors.daemon.plist`.

### Auto-start on login (Linux systemd)

`~/.config/systemd/user/insrc-daemon.service`:

```ini
[Unit]
Description=insrc daemon
After=network.target

[Service]
Type=forking
ExecStart=%h/.insrc/daemon/scripts/daemon-ctl.sh start
ExecStop=%h/.insrc/daemon/scripts/daemon-ctl.sh stop
Restart=on-failure

[Install]
WantedBy=default.target
```

`systemctl --user enable --now insrc-daemon.service`.

---

## Managing repos

The daemon holds a **repo registry**: an explicit list of local
directories you want indexed. There is no auto-discovery. Every
`Entity` the storage layer writes must belong to a registered
repo, or the write fails with `UnregisteredRepoError`.

```bash
cd ~/.insrc/daemon/src/insrc

# Add a repo (indexing begins in the background):
npx --no-install tsx cli/index.ts repo add /path/to/my/repo

# List all registered repos + their status (ready / indexing / failed):
npx --no-install tsx cli/index.ts repo list

# Remove a repo (deletes entities + relations + sessions + turns):
npx --no-install tsx cli/index.ts repo remove /path/to/my/repo
```

### Re-indexing

The daemon watches every registered repo via `@parcel/watcher` and
re-indexes on file changes. If you want to force a full reindex
(e.g. after tightening `.gitignore` or fixing a parser bug):

```bash
npx --no-install tsx cli/index.ts repo remove /path/to/my/repo
npx --no-install tsx cli/index.ts repo add    /path/to/my/repo
```

### What gets indexed

- Files that `git ls-files --cached --others --exclude-standard`
  would return. `.gitignored` files are skipped by construction.
- Generated / minified files (`*.min.js`, `*.bundle.js`, etc.)
  are dropped early — see `indexer/index.ts` for the pattern
  list.
- Currently supported languages: TypeScript, Python, Go, Java,
  Scala. Everything else is captured as a `file` entity without
  structural sub-entities.

---

## Configuration

Config lives at `~/.insrc/config.json`. The daemon creates it on
first start with defaults; safe to edit while the daemon is
stopped (a restart picks up changes).

Minimal shape:

```json
{
  "models": {
    "providers": {
      "local": {
        "host":           "http://localhost:11434",
        "embeddingModel": "qwen3-embedding:0.6b",
        "embeddingDim":   1024,
        "coreModel":      "qwen3-coder:latest",
        "charsPerToken":  3
      }
    },
    "analyze": {
      "shaperProvider": "ollama",
      "shaperModel":    "qwen3.6:35b-a3b",
      "shaper": {
        "structuredOutputRetries": 3,
        "maxToolTurns":             8
      }
    }
  }
}
```

Key knobs:

| Field | Purpose | Default |
| :--- | :--- | :--- |
| `models.providers.local.host` | Ollama HTTP endpoint | `http://localhost:11434` |
| `models.providers.local.embeddingModel` | Embedding model for the entity vector store | `qwen3-embedding:0.6b` |
| `models.providers.local.embeddingDim` | Vector dimensionality (pins the Lance schema — changing this requires a full reindex) | `1024` |
| `models.providers.local.coreModel` | Used by the indexer's embedder for structural summaries | `qwen3-coder:latest` |
| `models.analyze.shaperProvider` | Where inner narrow-LLM calls route: `ollama` \| `cli-claude` \| `cli-codex` | `ollama` |
| `models.analyze.shaperModel` | Ollama model used when `shaperProvider = ollama` | `qwen3.6:35b-a3b` |
| `models.analyze.shaper.structuredOutputRetries` | Attempts for ajv-guided retry when the LLM emits malformed JSON | `3` |
| `models.analyze.shaper.maxToolTurns` | Cap on freeform.probe's tool-loop turns | `8` |

Change `shaperProvider` to `cli-claude` or `cli-codex` if you'd
rather use your CLI OAuth session for the narrow-LLM calls
instead of a local Ollama model. That path uses `CliProvider`,
which spawns a `claude --print` / `codex exec` subprocess per
LLM call.

### Environment overrides

- `INSRC_LOG_LEVEL` = `trace | debug | info | warn | error`
  (default `info`)
- `INSRC_REPO` = default absolute repo path the MCP server uses
  when the tool call omits `repo` (set per MCP registration)

---

## Usage via Ollama

The default (`shaperProvider = ollama`, no MCP client) is
end-to-end local. Every analyze call from the CLI or from a
custom script routes through Ollama for embeddings + shaper LLM
work.

Concrete one-shot from an mjs script:

```javascript
import { spawn } from 'node:child_process';

const child = spawn('node', [
  '/Users/YOU/.insrc/daemon/out/insrc/bin/insrc-mcp.js'
], {
  stdio: ['pipe', 'pipe', 'inherit'],
  env:   { ...process.env, INSRC_REPO: '/path/to/registered/repo' },
});

// Send an initialize + tools/call over stdio-JSON-RPC.
// (See scripts under scripts/ for a working smoke-test template.)
```

Or, for interactive local use, you can drive the same one-shot
through Claude Code / Codex if you have them installed — the
tool goes through Ollama for the inner LLM calls when the client
has no sampling capability.

The one-shot bundle typically takes 30-120 s end-to-end depending
on how many narrow-LLM steps the recipe emits and how big your
shaper model is. Ollama startup + first-inference is the
dominant cost.

---

## Usage via Claude Code

Claude Code discovers the daemon via **MCP** (Model Context
Protocol). One-time registration:

```bash
claude mcp add insrc \
  -e INSRC_REPO=/absolute/path/to/your/main/repo \
  -- node $HOME/.insrc/daemon/out/insrc/bin/insrc-mcp.js
```

Then verify:

```bash
claude mcp list
# insrc: node /Users/YOU/.insrc/daemon/out/insrc/bin/insrc-mcp.js - ✔ Connected
```

The MCP subprocess exposes two tools:

| Tool | When to use |
| :--- | :--- |
| `insrc_analyze_step` | **Preferred.** Multi-turn: each reasoning step (decompose plan, extract narrow-LLM output, synthesize bundle) stays in Claude's session. No subprocess spawns, no Ollama billing. |
| `insrc_analyze` | One-shot: Claude fires one tool call; the daemon runs the whole pipeline server-side, routing narrow-LLM calls to Ollama. Use when you want the Ollama path deliberately. |

### Steering Claude Code to prefer the analyzer

Add the block from `src/insrc/mcp/steering-template.md` to your
project's `CLAUDE.md`. It tells Claude:

- For code-structure / conventions / adherence / capability
  questions → call the analyzer FIRST, before manual Read/Grep.
- Prefer `insrc_analyze_step` (multi-turn) by default.
- Fall back to Read/Grep when the returned bundle is empty or
  clearly off-topic.

The steering block includes the multi-turn loop shape so Claude
knows how to preserve the opaque `state` token verbatim across
turns.

### Pre-approve the tools (optional)

To skip per-call permission prompts, add to
`.claude/settings.local.json`:

```json
{
  "permissions": {
    "allow": [
      "mcp__insrc__insrc_analyze",
      "mcp__insrc__insrc_analyze_step"
    ]
  }
}
```

### Analyzing multiple repos from one Claude session

`INSRC_REPO` is the *default* repo; the tool accepts an
explicit `repo` argument to override:

```
insrc_analyze_step({
  phase: 'start',
  focus: '...',
  repo:  '/path/to/some/other/registered/repo'
})
```

Every repo you name this way must be registered with the daemon
(`insrc repo add`) and finished indexing.

---

## Usage via Codex CLI

Same shape as Claude Code, different registration command:

```bash
codex mcp add insrc \
  --env INSRC_REPO=/absolute/path/to/your/main/repo \
  -- node $HOME/.insrc/daemon/out/insrc/bin/insrc-mcp.js
```

Confirm:

```bash
codex mcp list
# insrc  ... enabled  Unsupported
```

Codex reads its steering from **`AGENTS.md`** in the current
working directory (not `CLAUDE.md`). Copy the same block as
above into each project's `AGENTS.md` where you want Codex to
reach for the analyzer.

**A subtle gotcha** worth knowing: Codex only walks up from `cwd`
looking for `AGENTS.md`, and does NOT read `CLAUDE.md`. If you
skip the `AGENTS.md` step, Codex will happily use `shell` /
`file_read` and never touch the analyzer, even though the MCP is
registered.

### Codex + explicit repo argument

Because Codex sessions often span multiple projects, and
`INSRC_REPO` is baked into the MCP registration, **best
practice** is to pass `repo` explicitly on every tool call:

```
insrc_analyze_step({
  phase: 'start',
  focus: '...',
  repo:  '/absolute/path/to/repo/you/want/analyzed'
})
```

The per-project `AGENTS.md` should call this out so Codex learns
the pattern.

---

## CLI reference

All CLI subcommands live under `~/.insrc/daemon/src/insrc/`.
Drive them with `npx --no-install tsx cli/index.ts <subcommand>`
(or wrap in your shell aliases).

### `daemon`

| Subcommand | Effect |
| :--- | :--- |
| `daemon start` | Start the background daemon. Writes `~/.insrc/daemon.pid`. |
| `daemon stop` | Send graceful shutdown RPC. Waits up to 5 s. |
| `daemon status` | Print running status, queue depth, model pull progress, LMDB size, and every registered repo's state. |
| `daemon backup <dir>` | Snapshot LMDB + Lance to `<dir>`. Safe on a running daemon (LMDB copy is transactional). |
| `daemon compact` | Reclaim LMDB free pages after heavy churn. Runs online. |

### `repo`

| Subcommand | Effect |
| :--- | :--- |
| `repo add <path>` | Register `<path>` and start indexing. Idempotent. |
| `repo remove <path>` | Unregister + purge entities, relations, sessions, turns. |
| `repo list` | List registered repos + last-indexed timestamps. |

---

## Troubleshooting

### `daemon start` says `already running — exiting`

An old daemon process is still on the socket. Two causes:

- Your last `daemon stop` timed out and the process is still
  draining (see next entry). Wait 20 s and try again.
- A pid file is stale (daemon crashed without cleanup). Remove
  `~/.insrc/daemon.pid` and `~/.insrc/daemon.sock`, then start.

`daemon-ctl.sh restart` handles both cases automatically.

### Analyze calls return empty bundles

Almost always: the repo isn't finished indexing, or the wrong
repo path was passed.

```bash
npx --no-install tsx cli/index.ts daemon status
# → [ready   ] means indexing finished
# → [indexing] means still working
# → [failed  ] means the indexer errored (check /tmp/.insrc/daemon.log)
```

Confirm `INSRC_REPO` (in the MCP registration) and any explicit
`repo` argument match a `[ready]` path exactly.

### Ollama-backed calls hang for 30+ s

First inference on a model always cold-starts. If it never
returns, check that Ollama is actually running:

```bash
curl http://localhost:11434/api/tags
# should list your installed models
```

If `shaperProvider = ollama` and Ollama is down, adherence-check
/ prose-retrieval / capability-discovery pipelines all block on
the shaper. Structural-map runs fine — it uses only deterministic
graph queries.

### `ReadOnlyToolRegistryMismatch` at boot

Was a real bug fixed in commit `f194a57`. If you still see it,
your install is outdated:

```bash
./daemon-ctl.sh update
./daemon-ctl.sh restart
```

### LMDB grew past a few GB

Occasional heavy indexing (large repos, many edits) can bloat
the LMDB file. Reclaim with:

```bash
npx --no-install tsx cli/index.ts daemon compact
```

Runs online; typically takes < 10 s.

### Where are the logs?

- **Current session:** `/tmp/.insrc/daemon.log` (pino-JSON, one
  event per line, tail with `tail -f /tmp/.insrc/daemon.log |
  npx pino-pretty --colorize`).
- **Rotated:** `/tmp/.insrc/agent.<N>.log`. The live file is the
  one with the most recent `mtime`, NOT necessarily `.1`.
- **daemon-ctl.sh:** `/tmp/insrc/daemon-ctl-YYYYMMDD-HHMMSS-<pid>.log`
  per invocation.

Increase verbosity with `INSRC_LOG_LEVEL=debug ./daemon-ctl.sh restart`.

### Multi-turn state token seems corrupted

The `insrc_analyze_step` server holds run state in memory keyed
by a 22-char opaque token. State evaporates if:

- The MCP subprocess restarted between turns.
- Run TTL (60 min) expired.
- LRU eviction fired (>100 concurrent runs — extremely rare).

Restart with `phase='start'`. Not a bug in your prompt — it's
the state-store contract.

---

## Uninstall

```bash
# Stop the daemon:
~/.insrc/daemon/scripts/daemon-ctl.sh stop

# Remove the MCP registrations:
claude mcp remove insrc     # if you registered with Claude Code
codex  mcp remove insrc     # if you registered with Codex

# Remove auto-start plumbing (if you added any):
launchctl unload ~/Library/LaunchAgents/ai.insors.daemon.plist   # macOS
rm -f              ~/Library/LaunchAgents/ai.insors.daemon.plist
systemctl --user disable --now insrc-daemon.service              # Linux

# Delete everything:
rm -rf ~/.insrc          # daemon install, LMDB, Lance, config, sockets, pid files
rm -rf /tmp/.insrc       # logs
```

That fully removes the daemon and every trace of its data. Your
indexed repos on disk are untouched — the daemon never wrote to
them.
