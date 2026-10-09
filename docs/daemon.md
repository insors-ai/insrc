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
10. [What an answer says about its completeness](#what-an-answer-says-about-its-completeness)
11. [What a plan-tree run does about scope, failed tasks and runs that died](#what-a-plan-tree-run-does-about-scope-failed-tasks-and-runs-that-died)
12. [What a build records about its tests](#what-a-build-records-about-its-tests)
13. [CLI reference](#cli-reference)
14. [Troubleshooting](#troubleshooting)
15. [Uninstall](#uninstall)

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
| Full Ollama | qwen3-embedding via Ollama | qwen3.6 via Ollama (`tiers.core = { runner: ollama, ... }`) | Local, offline, no CLI OAuth session |
| Hybrid | qwen3-embedding via Ollama | Claude Code / Codex session (`tiers.core = { runner: cli-claude / cli-codex }`, or via multi-turn `insrc_analyze_step`) | Best quality — big shaper LLM lives in the CLI |
| ONNX-only | nomic-embed-text-v1.5 in-process | Claude Code / Codex session (multi-turn only) | Minimal footprint — no Ollama install |

Recommended Ollama models (full or hybrid mode only):

```
ollama pull qwen3-embedding:0.6b     # embeddings (~700 MB)
ollama pull qwen3-coder:latest       # core / indexer  (~10 GB)
ollama pull qwen3.6:27b          # analyze shaper (~20 GB, optional if you're only using cli-claude / cli-codex)
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
    "local": {
      "embeddingModel": "nomic-ai/nomic-embed-text-v1.5",
      "embeddingDim":   768
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
    "tiers": {
      "core":  { "runner": "cli-claude", "model": "opus" },
      "mid":   { "runner": "cli-claude", "model": "sonnet" },
      "cheap": { "runner": "ollama",     "model": "qwen3.6:27b" }
    },
    "shaper": {
      "structuredOutputRetries": 3,
      "maxToolTurns":             8
    },
    "local": {
      "host":           "http://localhost:11434",
      "embeddingModel": "qwen3-embedding:0.6b",
      "embeddingDim":   1024,
      "coreModel":      "qwen3.6:27b",
      "charsPerToken":  3
    }
  }
}
```

Key knobs:

| Field | Purpose | Default |
| :--- | :--- | :--- |
| `models.local.host` | Ollama HTTP endpoint | `http://localhost:11434` |
| `models.local.embeddingModel` | Embedding model for the entity vector store | `qwen3-embedding:0.6b` |
| `models.local.embeddingDim` | Vector dimensionality (pins the Lance schema — changing this requires a full reindex) | `1024` |
| `models.local.coreModel` | Local core/summariser model used by the indexer's embedder for structural summaries | `qwen3.6:27b` |
| `models.shaper.structuredOutputRetries` | Attempts for ajv-guided retry when the LLM emits malformed JSON | `3` |
| `models.shaper.maxToolTurns` | Cap on freeform.probe's tool-loop turns | `8` |

**Models are named in exactly one place — the three `models.tiers` entries**
(see [Model tiering](#model-tiering)). There is no separate `shaperProvider` /
`shaperModel` knob: the interactive shaper is **derived** from `tiers.core` and
the background summariser from `tiers.cheap`. `models.local.*` is the separate
local/embedder surface (not a reasoning tier).

> **Config shape note.** The config is a flat `models.*` surface. Older configs
> that used `models.analyze.*` / `models.providers.local` are **migrated
> automatically** on the next daemon boot / `daemon-ctl.sh update` — no manual
> edit needed (the boot reconcile relocates the keys and prunes the old
> nesting, reporting a `migrated`/`pruned` count in its log).

### Model tiering

Not every operation needs the strongest model. Design, review, build,
and validation are **accuracy-critical** and should run on a high-end
model; synthesis and grounding are fine on a mid model; classification,
narrow probes, tracker rendering, and summaries can run on a cheap local
model. The daemon resolves a **model per reasoning role** through a single
`RoleRouter` choke point — no operation bypasses it, so cloud access is
always via the `claude`/`codex` CLI subprocess (never a direct REST call).

**Three tiers.** Each maps a `runner` (`ollama` \| `cli-claude` \|
`cli-codex` — no REST target) to a `model`:

| Tier | Built-in default | Serves |
| :--- | :--- | :--- |
| `core` (high) | `cli-claude` / `opus` | design, review, build, validate, define — the critical roles |
| `mid` | `cli-claude` / `sonnet` | synthesis, grounding/context assembly, HLD framework/rollout |
| `cheap` | `ollama` / `qwen3.6:27b` | classification, narrow probes, tracker rendering, summaries |

These built-in defaults apply out of the box — with **no** tiering config,
critical roles already resolve to `opus`, mid to `sonnet`, and peripheral
to the local model. The installer preconfigures `models.tiers` for
your chosen CLI (Claude → `opus`/`sonnet`; Codex → `gpt-5.5`); `cheap`
stays local either way.

**Config shape** (flat under `models.*`; every key optional):

```json
"models": {
  "coreFloor": "core",
  "tiers": {
    "core":  { "runner": "cli-claude", "model": "opus" },
    "mid":   { "runner": "cli-claude", "model": "sonnet" },
    "cheap": { "runner": "ollama",     "model": "qwen3.6:27b" }
  },
  "tasks": { "analyze.synthesize": "cheap" },
  "byRepo": {
    "/abs/path/to/repo": { "tasks": { "review": "core" }, "coreFloor": "core" }
  }
}
```

- `tiers.<core|mid|cheap>.{runner,model}` — the model backing each tier.
  **This is the only place a model is named**; the shaper (`tiers.core`) and
  summariser (`tiers.cheap`) are derived from it.
- `tasks.<roleId>` — pin a specific task/role to a tier, overriding its
  taxonomy default (e.g. run `analyze.synthesize` on `cheap`).
- `coreFloor` — the minimum tier for **critical** roles (default `mid`
  when unset). A critical role assigned below the floor is clamped **up**
  to it (peripheral roles are never clamped — they may run cheaper).
- `byRepo.<absPath>.*` — the same knobs (`tiers` / `tasks` / `coreFloor`)
  scoped to one repo; they win over the global values for that repo only.

**Resolution precedence** (the router applies this at one place):

1. **Tier for the role**: `byRepo.tasks[role]` → `tasks[role]` →
   the role's taxonomy `defaultTier`.
2. **coreFloor clamp**: if the role is critical and its tier ranks below
   the effective `coreFloor` (`byRepo.coreFloor` → global `coreFloor` →
   built-in `mid`), raise it to the floor and log the clamp
   (`reason: below-core-floor`).
3. **Model for that tier**: `byRepo.tiers[tier]` → global `tiers[tier]` →
   the built-in `DEFAULT_TIERS[tier]`.

Every resolved `runner` is one of `ollama` \| `cli-claude` \| `cli-codex`;
there is no path to a direct cloud REST provider at any tier. Each
workflow artifact records which model actually served each step — see
*Per-output model attribution* in [workflow.md](workflow.md).

### Environment overrides

- `INSRC_LOG_LEVEL` = `trace | debug | info | warn | error`
  (default `info`)
- `INSRC_REPO` = default absolute repo path the MCP server uses
  when the tool call omits `repo` (set per MCP registration)

---

## Usage via Ollama

With an all-local config (`tiers.core.runner = ollama`, no MCP client) it is
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

## What an answer says about its completeness

Every answer states whether it is complete, and code writes that statement,
never a model. Each lookup, and each task of a plan-tree run, returns a
*completeness record* for its own result: how many items it returned, how
many exist where that is known, every limit it reached, everything it
skipped, every item it read only in part, and what the result is based on
(the stored graph, a text search, the documentation index, the file system,
a data source, or a model's own choice of what to look at). A lookup that
cannot run is reported as **failed**, with its reason; it is not reported as
an empty result.

### The report on the bundle

The bundle (`AnalyzeContextBundle`, schema version 2) carries an optional
`report` beside its seven layers and `meta`. It is derived from the records
of the lookups that ran for the request:

```jsonc
"report": {
  "completeness": {
    "complete":   false,
    "incomplete": [{ "sourceId": "search.text [e2]", "sourceKind": "lookup",
                     "reason": "limit of 30 hits reached (the search stops at 30 hits)" }],
    "failed":     [{ "sourceId": "symbol.locate [e3]", "sourceKind": "lookup",
                     "reason": "the graph store is closed" }],
    "basisNotes": ["…"]          // optional: each distinct note of the sources, once
  },
  "answerFailure": "…"           // set only on a failed answer step (see below)
}
```

- `complete` is true only when every source is complete and none failed.
- A source is named `<lookup type> [<lookup id>]`; in a plan-tree run a task
  is named by its path (`t02.t01` is task `t01` of the child plan of `t02`),
  and the sources of the run's first step are prefixed `run context / `.
- A model is never shown a schema that contains `report`, and a bundle in
  which a model or an agent supplied one is rejected (`bundle-schema` from
  `insrc_analyze_step`).
- Only a run-mode bundle carries a `report`: it is the one built from
  lookups. A classification or a task bundle has none. A run-mode bundle or
  a run record lacks it in one case only, when it was stored before the
  report existed. No report is invented for those.

A plan-tree run (`analyze.run.start`) returns the same `report` on its result
and stores it in the run record.

### The completeness line

The text form of an answer starts with one line written from the report:

```
Complete.
Incomplete: 1 incomplete: search.text [e2] — limit of 30 hits reached (the search stops at 30 hits). 1 failed: symbol.locate [e3] — the graph store is closed.
```

It is the first line of the markdown `insrc_analyze` and `insrc_analyze_step`
return, and the first line of a plan-tree run's final report (`summary`). Where
there is no report, the line reads `Completeness was not recorded for this
answer.` (or `… for this run.`). Read this line before the findings: an answer
that starts with `Incomplete:` names what it leaves out, and a statement such
as "X is not used anywhere" is only as strong as the lookups behind it.

### Note for the IDE repository

The IDE mirrors these types and is not changed from here. It needs:

- the optional `report` on its mirrored bundle type, and on the result of
  `analyze.run.start` (a mirror that rejects unknown fields rejects a
  version-2 bundle until then);
- `SCHEMA_VERSION` 2 for the bundle;
- the `data` member of the error payload for `answer-step-failed` and
  `shaper-prompt-missing` (see the error-code table under Troubleshooting);
- the optional `error.data` on the output of `insrc_analyze_step`.

---

## What a plan-tree run does about scope, failed tasks and runs that died

A plan-tree run (`analyze.run.start`) classifies the request, builds a run
context, plans a list of tasks, runs them and writes one final report. The
rules below hold from 2026-10-09.

### The kinds of scope each family of tasks accepts

Every plan task turns its scope into a repo, a path, an entity or a
connection through one function, and accepts exactly the kinds its family's
row gives:

| Family | Kinds of scope accepted |
|---|---|
| code | `repo`, `module`, `file`, `symbol`, `manifest-dir`, `workspace` |
| docs | `repo`, `module`, `file`, `workspace` |
| infra | `repo`, `manifest-dir`, `workspace` |
| data | `connection`, `repo`, `manifest-dir`, `workspace` |

Before, the code and docs tasks accepted `repo` and `manifest-dir` only, and
no data task accepted a `connection`.

- A code or docs task keeps to the **area** the scope names: for a `module`
  scope the entities or documents whose file lies under that directory, for a
  `file` scope that file's, for a `symbol` scope the one entity. For a
  `repo`, `manifest-dir` or `workspace` scope the area is the directory, as
  before.
- The docs constraint and decision tasks keep to the area when they retrieve:
  sections are selected, ranked and counted within it, by keywords and by
  vector search alike.
- A data task with a `connection` scope works on that connection alone. For
  the other kinds it opens the connection pool at the scope's own directory,
  as before.
  The connection-listing task's optional `scopeRefValue` parameter decides
  where the pool is opened and nothing else: the scope's kind is still
  checked, and under a `connection` scope the task still lists that
  connection alone.
- A code or docs task needs its scope indexed. An infra or data task does not
  read the stored graph and is not checked for an index.

### The code on a failed task

A task that refuses its scope fails with the scope error's own code. The task
record (`tasks/<taskId>.json`) and each entry of `tasksFailed`, on a plan's
result, on the run's result, in the run record and in the daemon's response,
carry an optional `code`:

```jsonc
"tasksFailed": [
  { "taskId": "t01", "reason": "Scope /r/app/src produced an empty graph closure.", "code": "scope-not-indexed" },
  { "taskId": "t02", "reason": "runtime-threw: the graph store is closed" }
]
```

`code` is one of `scope-ref-kind-target-mismatch`, `scope-ref-unresolved` and
`scope-not-indexed`, and is present only for those three. Such a task's
`reason` is the error's message with no `runtime-threw:` in front. Every other
failure has no `code`, and an entry without one has no `code` key at all. A
record written before the change has none, and nothing requires one.

A task whose record cannot be written fails with
`task-record-unwritable: <the error>`; the tasks after it still run.

### The final report is written from the inputs that exist

The last task of every plan writes the report. It used to be skipped as soon
as one task before it had failed, so a run with one failed task returned no
report at all. Now:

- it is skipped in one case only: it consumes at least one input and **none**
  of them was produced. The run then fails with `executor-aggregator-failed`,
  as before;
- otherwise it runs on the inputs that exist, and is told which are absent:
  each one's name, the task that should have produced it and why it did not.
  It is instructed to state nothing about an absent input except that it is
  absent;
- every other task with a missing input is skipped as before
  (`skipped-dependency-unavailable`).

So a report can now be written although a task failed. Read its first line:
the completeness line (see above) names every failed and skipped task, by its
path for a task of a child plan, and it is written by code, not by the model.
A child plan with a failed task still returns its report to its parent.

### A run that stops says so

- An error that nothing inside the run catches no longer leaves the run
  record reading `in-progress`: the record is written as `failed` at the stage
  the run had reached, with `internal-error` and the error's message, and that
  failure is the run's result. An error before any stage has started is
  reported at `classify`. A record that already says how its run ended
  (`ok` or `failed`) is left as it is, and so is a record shared with another
  run still going under the same id: that run writes it.
- `run-abandoned`: a run record that is `in-progress` means a run is live in
  the daemon. A record left `in-progress` with no live run behind it (the
  daemon was restarted, or the run's process died) is **abandoned**. The
  status request (`analyze.run.status`) rewrites it as `failed` with
  `run-abandoned` at the stage it had reached and returns it so; the purge
  request (`analyze.run.purge`) removes it without `force`. A record of a run
  that is live is returned unchanged and its purge is refused with
  `run-in-progress`, as before. A record that is `ok` or `failed` is never
  changed by a reader.
- Starting a run under the id of a record left `in-progress` replaces that
  record with the new run's first record; a completed run asked for again
  returns its stored result, as before.
- For an error that escapes the run altogether, the daemon's response carries
  the stage of the run record where it used to say `classify` always.

### The scope is checked once before planning

After the run context is built and before the planner is asked, the run
resolves its scope for its kind of source. In practice this ends one case
early: a **docs** run on a scope that no registered repo contains, or one
with no stored entities, now fails at stage `plan` with `scope-not-indexed`
and no plan is made. Before, it was planned and then failed in every task. A
generic run is not checked here. A pairing the table refuses still fails at
stage `classify` with `scope-ref-kind-target-mismatch`.

### A request with no prompt

`analyze.run.start` accepts the empty string as `userPrompt` when `targetHint`
states the kind of source: the run is then unfocused. With no `targetHint` the
empty string is refused with `invalid-params`, and the message says a kind of
source must be stated, because there would be nothing to classify. A prompt of
only white space is not empty and is accepted in both cases, as before.

### Note for clients that mirror these types

The plan of this work called this the note for the IDE repository. That
repository is no longer maintained; the clients are the VS Code and JetBrains
plugins in this repository, and neither calls the plan-tree run requests
today. A client
that mirrors the daemon's types needs:

- the optional `code` on each entry of `tasksFailed` and on a task record (a
  mirror that rejects unknown fields rejects an entry that carries one);
- `run-abandoned` and `internal-error` as codes a run record's `error` can
  carry when the status request returns it;
- `invalid-params` for an empty `userPrompt` with no `targetHint`, and an
  empty `userPrompt` being valid with one.

---

## What a build records about its tests

When a Task (or a standalone Story) is submitted to the build validation gate
(`insrc_build_step`, `phase: 'validate'`), the daemon runs the typecheck and the
tests itself, and keeps what the tests did in the Story's **test record**:
`TESTS.md` in the Story's folder, beside `PLAN.md` and `BUILD.md`, with its
data in `.insrc/artifacts/TESTS-<epicHash>-<storyId>.json`.

### Telling the gate which tests carry each planned test

A plan names its tests in prose. At the validate turn the builder passes
`tests`, one entry per named test:

```json
{ "name": "<the test's text, exactly as the plan states it>",
  "cases": [ { "file": "src/x/__tests__/x.test.ts", "title": "<the test's title, as the file declares it>" } ] }
```

The daemon runs each mapped file on its own and reads a result for every case:

| Result | Meaning | Does the Task pass the tests check? |
|---|---|---|
| `pass` | the test of that title ran and passed | yes |
| `fail` | it ran and failed | no |
| `skipped` | the runner skipped it (a skip or a todo) | no: a skipped test proves nothing |
| `not found` | no test of that title ran in that file | no |

The check also fails when a file exits with a non-zero code, times out, or
when a named test has no case at all. A title is matched at any depth of
nesting, by its own title.

For a `live` or `smoke` test the daemon cannot run (it needs a model, a running
daemon or a person), the entry carries `reported` in place of, or beside, its
cases: `{ "result": "pass" | "fail", "evidence": "<where the proof is>" }`. It
is recorded as reported by the builder, not run by the gate, and is shown apart
in the record. A reported `fail` fails the check. A reported result on a test of
any other level is refused.

Other rules:

- A later validate turn of the same Task may omit `tests`: the mapping stored
  in the record is used. A supplied mapping replaces it.
- Without a mapping, a test name that begins with `<file>.test.ts:` is run by
  that file, as before; any other name has nothing to run and fails the check.
- A wrong mapping (a name the Task does not have, a file that is not a tracked
  `.test.ts` file of the repository, an empty title, a key the shape does not
  have) is refused with the error `invalid-test-mapping`, which lists every
  fault. Nothing is run and nothing is written.
- A Trivial standalone build names no tests: `tests` is ignored and the test
  files its commit touched are run.

### What the record holds

One section per Task, replaced when that Task is validated again: the commit
and time of the run, whether the tests check passed, each named test with its
cases and their results, the results reported by the builder with their
evidence, each file run with its exit code, and any test that failed in those
files outside the named cases. The whole output of each file's run is written
to a file under the system's temporary directory, and its path is returned in
the verdict's evidence; nothing is cut from it.

The record is written straight after the tests are run, before the verdict is
judged, so it is there also when the judging session fails. `BUILD.md` links to
it and holds no results of its own.

The test record is a record of what was run. It cannot be approved or rejected:
`insrc_workflow_approve` returns its path in `skipped[]` with a reason that
begins `not-approvable:`.

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

### An analyze request fails: what its error code means

A request that cannot proceed reports the actual cause. `shaper-llm-unavailable`
is reported only when a call to a model failed, and its message names the
call (`planning` or `answer writing`) and carries the provider's own words,
whichever provider served it (Ollama, the `claude` or `codex` CLI, or an MCP
sampling client).

| Code | Meaning |
|---|---|
| `scope-ref-kind-target-mismatch` | The kind of scope does not go with the kind of source (for example a code request on a data connection). The message lists the kinds allowed. |
| `scope-ref-unresolved` | The scope does not resolve: a path that does not exist; a symbol not written as `<absolute file path>#<entity name>`, or whose name matches no stored entity (or several); a connection registered in no repo (or in several). |
| `scope-not-indexed` | The scope's repo is not registered or has no indexed entities. A symbol scope always needs the index. |
| `shaper-prompt-missing` | A prompt file is missing from the install. The message names the file. When it is the answer prompt, the lookups have already run: `data` is `{ results, report }`. A missing planning prompt carries no `data`. |
| `shaper-schema-unrecoverable` | The tool loop's structured output could not be produced in the required shape. |
| `shaper-llm-unavailable` | The planning call to a model failed. No lookup has run. |
| `shaper-tool-loop-exhausted` | A free-form search reached its turn limit. What its tool calls returned is not cut and is not sent with the failure: it is written in full to a temporary JSON file (an array of `{ source, content }`), the message names the file, and `data` is `{ toolResultsFile, toolResultCount, toolResultChars }`. Only if the file could not be written does `data` carry the results themselves, as `{ toolResults }`. |
| `invalid-input` | The request was built wrongly (unknown kind of source, no intent). |
| `no-plan-for-request` | The plan for the request has no lookups. |
| `answer-step-failed` | The lookups ran and the answer could not be written. `data` is `{ reason, results, report }`: `reason` is `model-failed` (the answer-writing call failed), `invalid-answer` (its output was not in the required shape) or `invalid-bundle` (the assembled bundle failed validation); `results` is what each lookup returned; `report` is the answer report with `answerFailure` set. No other way of answering is tried. |
| `run-abandoned` | On a run record returned by `analyze.run.status`: the record was left `in-progress` and no live run stands behind it (the daemon was restarted, or the run died). The record is rewritten as failed at the stage it had reached. Raised from 2026-10-09. |

`no-plan-for-request`, `answer-step-failed` and `run-abandoned` were added on
2026-10-07 to both of the daemon's code lists (`RunErrorCode` and
`AnalyzeRpcErrorCode`). A client that mirrors those lists (the IDE repository)
needs the three new members. Two behaviours also changed for a client that
matches on codes: failures that used to arrive as `shaper-llm-unavailable`
without a model having been called now arrive under their own code, and a
plan-tree run reports the validator's own code where it used to report
`classifier-validation-exhausted`.

`answer-step-failed` is raised from 2026-10-08. Three failures changed their
code with it: a failed answer-writing call used to arrive as
`shaper-llm-unavailable`, and an invalid answer or an invalid bundle as
`shaper-schema-unrecoverable`. A client that matched the old codes for those
cases must match the new one. What the lookups found is in `data`: the
one-shot tool prints the completeness line and the reason before the code and
message, and a workflow run fails its step with the code, the reason and the
report. `insrc_analyze_step` reports a missing answer prompt under its own
code `answer-prompt-missing`, not retryable, with `error.data = { results,
report }` and a message that starts with the completeness line; no other error
of that tool has a `data` member.

### Ollama-backed calls hang for 30+ s

First inference on a model always cold-starts. If it never
returns, check that Ollama is actually running:

```bash
curl http://localhost:11434/api/tags
# should list your installed models
```

If the shaper tier runs on `ollama` and Ollama is down, adherence-check
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
