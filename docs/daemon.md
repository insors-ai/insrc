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
11. [How a request's size is measured](#how-a-requests-size-is-measured)
12. [What a plan-tree run does about scope, failed tasks and runs that died](#what-a-plan-tree-run-does-about-scope-failed-tasks-and-runs-that-died)
13. [What a build records about its tests](#what-a-build-records-about-its-tests)
14. [CLI reference](#cli-reference)
15. [Troubleshooting](#troubleshooting)
16. [Uninstall](#uninstall)

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

## How a request's size is measured

Every request has a size: `XS`, `S`, `M`, `L` or `XL`. The size decides how
many tasks a plan may have, how deep a plan tree may go, and what the planning
call and the answer step are told about the request. The size is **counted by
code from what the request touches**. No model picks it, no caller sets it and
there is no default.

### The table

Two counts are taken, and each maps to a size by its own row. The request's
size is the **larger** of the two.

| Count | XS | S | M | L | XL |
|---|---|---|---|---|---|
| Files | up to 1 | up to 20 | up to 200 | up to 1,500 | more |
| Entities or items | up to 50 | up to 500 | up to 5,000 | up to 20,000 | more |

So a directory of 30 files and 60 entities is `M` (by its files), and one file
that holds 600 entities is `M` too (by its entities).

### What is counted

A request is measured twice, at two different moments, from two different
things.

**The area the request names**, before anything is planned. This is the size
the planning call is given, and for a plan-tree run it is the size of the run.

| Kind of source | Scope | What is counted |
|---|---|---|
| code, docs, generic | repo | the stored entities of the repo, and the distinct files they lie in |
| code, docs, generic | module, manifest directory, or a workspace inside a registered repo | the stored entities whose file lies under the directory |
| code, docs, generic | file | the stored entities of that file |
| code, docs, generic | symbol | the one entity |
| generic | a workspace that no registered repo contains | the sum over the registered repos under it |
| infra | repo, workspace, manifest directory | the files on disk that the infra tasks' own walk visits under the directory, walked to the end. The stored graph is not used: the infra tasks do not read it |
| data, generic | connection | the objects of the live source, through the driver's listing in its complete mode: tables of a relational source, namespaces of a document or wide-column store, files of a file source |
| data | repo, workspace, manifest directory | the sum over the connections registered at that path, each counted as above |

The objects of a data source (tables, collections, files) are compared with the
**files** row of the table: a table is the unit a data analysis reads, as a file
is for code. So a source of 40 tables is `M`.

**What the lookups returned**, after the plan of lookups has run. This is the
size the answer step is given, and it is the measure in the answer's report.
Items are the sum of what the lookups returned; files are the distinct files
those results name. The length of the results in characters is recorded beside
the counts and does not take part in the size.

A plan tree measures each **child plan** from the area that child names, when
the child is spawned. Its task band is that of its own measured size. The depth
a tree may reach is always read for the root's measured size.

### A size a caller states is a hint

A caller can state a size: the `scope` input of `insrc_analyze` and
`insrc_analyze_step`, the `scopeHint` of a run request, the `sizeHint` of a
run-level context request, the size on the intent of a plan request, and the
figure a planner model writes for a child plan. Each is recorded on the measure
as `sizeHint` and **never changes the size**. It is there so a reader can see
what was asked for beside what was found.

The classifier states no size at all: its answer has no such field, and an
answer that carries one is rejected.

### When the size cannot be determined

A count that cannot be taken is not read as zero, which would size the request
as the smallest. The measure then says `determined: false`, its size is `XL`,
the largest, its counts are 0, and its `note` gives the reason. This is the
case for:

- a scope that does not resolve, or a kind of scope its source does not accept;
- a path the index does not hold: no registered repo contains it, or the repo
  holds no stored entity;
- a read of the registry or the store that fails;
- a directory that cannot be read, or one below it (the files counted in the
  rest are in the note, not in the counts);
- a data source that cannot be reached, whose driver has no listing or answers
  that listing is not supported, or whose listing reports that it was cut;
- Redis, Valkey, KeyDB and etcd, whose listing is a sample of keys and not a
  list of what exists;
- a data request over several connections when any one of them could not be
  counted;
- a live data source that does not answer within its time limit (see below);
- a request that was cancelled while it was being measured;
- an answer whose lookups all failed or are not supported.

An empty directory inside an indexed repo is different: it is a count of zero,
so it is `XS` and determined.

Measuring does not refuse a request. A request that was refused for its scope
is still refused where it was, with the same code (see
[the scope is checked once before planning](#the-scope-is-checked-once-before-planning)).

### A live data source is given a time limit

Measuring a data request asks each live source for the complete list of its
tables, its namespaces or its files. That used to wait for as long as the
source took, with no way to stop it. Now:

- each source is given a time limit to be reached and listed, **120 seconds**
  by default. The setting is `analyzer.dataSourceListingTimeoutMs` in
  `~/.insrc/config.json`, in milliseconds; it is read each time a source is
  measured, so a change needs no restart. A value that is not a number greater
  than 0 is ignored and the default is used; a value above 2147483647 (about
  24.8 days, the longest a timer waits) is taken as that;
- a source that does not answer in time is not counted: the size is `XL`, not
  determined, with the note `the listing of '<id>' timed out: the source did
  not answer within <n> seconds`. The request goes on. Raise the setting for a
  source whose full listing is known to take longer;
- the limit is **per source**. A data request on a repository with several
  connections gives each its own, one after another: two connections that do
  not answer cost twice the limit. The other connections are still counted,
  and the note names the ones that timed out;
- a request that is cancelled stops measuring at once. Its measure is not
  determined, with a note that says the request was cancelled, and the
  connections not yet asked are not asked;
- the wait is given up, not the source's own call. The data drivers cannot be
  cancelled, so a listing that timed out may go on in the background until the
  source answers or fails. The connection may stay busy until then;
- a source whose listing is still out is not asked again. A later measure of
  it (a child plan, another request) waits for the same call under its own
  time limit, and is given the count if it arrives in time. So a source that
  does not answer has one call out, not one per request. Once the call ends
  the source is asked afresh.

A child plan that names a source its parent also named measures it again,
within its own limit: it asks the source afresh when the parent's call has
ended, and waits on the parent's call when it is still out.

### A run measures the area it names once

A run measures its request and then builds its context. The context builder
used to measure the same area a second time for its own planning call, at a
later moment, so the two sizes could differ and a slow data source was waited
on twice. The run now hands its measure to the builder, which uses it and
takes none of its own; the plan request (`analyze.plan`) does the same. A
caller that hands none, such as the one-shot `insrc_analyze` tool, is measured
by the builder as before.

### What is read for a symbol or a file

For a request scoped to one symbol the measure reads that one entity, and for
one scoped to a file the entities of that file; it no longer builds every
stored entity of the repository to pick them out. The counts are the same.

Two things are not saved yet, and are filed as `ISSUE-61045de91faef1a0`. The
store has no index by file, so reading one file's entities still passes over
the rows of the whole entity table. And the check that a code or docs scope
lies in an indexed repository still reads every entity of that repository,
once when the request is measured and again when the run builds its context
and checks its scope before planning.

### The measure in the report, and the measure line

The answer report (see [the report on the bundle](#the-report-on-the-bundle))
carries the measure:

```jsonc
"measure": {
  "source":     "lookup-results",  // or "named-area", "data-source"
  "items":      40,
  "files":      25,
  "characters": 5120,              // null for the other two sources
  "size":       "M",
  "determined": true,
  "sizeHint":   "L",               // only when a caller stated a size
  "note":       "…"                // only when there is something to say
}
```

On an answer from the lookup pipeline (`insrc_analyze`, `insrc_analyze_step`,
a workflow step's grounding) the measure is the one from what the lookups
returned. On a plan-tree run it is the measure of the area the request names;
it is also on the run's `classified` event and in its run record. A report or a
run record stored before the measure existed has none and is read as it is.

The text form of an answer has one line for it, directly under the completeness
line:

```
Complete.
Size: M, measured from what the lookups returned: 25 files, 40 items, 5,120 characters. The caller asked for L.
```

```
Size: L, measured from the area the request names: 1,204 files, 18,330 entities.
Size: M, measured from the data source: 40 objects.
Size: XL, not determined: the index holds nothing for the path /srv/app: no registered repository contains it.
```

### Note for clients

- The run-level context request (`analyze.context.buildRun`) needs no size on
  its intent. One that is sent is checked and not read; a stated size goes in
  the optional `sizeHint`. The plan and task requests still carry a whole
  intent, with its size.
- The plan and classify requests return the measure beside their result, and
  the intent or plan they return carries the measured size.
- The cached run context does not depend on a stated size: two callers that
  state different sizes for one scope share it.
- The role `analyze.scope.pick` no longer exists. A tier stored for it under
  `models.tasks`, or under a repo's `models.byRepo.<repo>.tasks`, is dropped
  when the daemon reconciles its configuration. The VS Code extension no longer
  declares a setting for it.
- The step tool's state token carries the stated size as an optional field; a
  token minted before the change still decodes.

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

A plan is held to the same rows before it runs. The catalog shown to the
planner lists, for each task that takes a scope, only its family's kinds, and a
plan in which a task carries another kind fails validation, so the planner
plans again:

```
task t02 (infra.inventory.ci): scopeRef.kind='file' is not a kind of scope the 'infra' family accepts. Accepted kinds: repo, manifest-dir, workspace.
```

Before, such a plan was accepted and the task failed when it ran, with
`scope-ref-kind-target-mismatch`. A task still refuses the kind itself when it
runs. The scope of a child plan (`childIntent.scopeRef` of a subrun task) is
held to the row of the child intent's own `target` in the same way.

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

### What a module is for the code tasks

No parser stores a module entity for a repository's own directories: each
stores one only for an imported module. So the module list
(`code.discovery.modules`), the module tree (`code.structure.module-tree`)
and the functional-surface task (`code.surface.functional`) derive a
repository's modules from what the index does store. A module is one of:

- a stored entity of kind `module` whose file lies in the area. It owns every
  source file under the directory of its file, at any depth;
- a directory that directly holds at least one **source file** (a stored
  entity of kind `file` that is not an artifact) and lies neither in nor
  under a stored module entity's directory.

The list is flat: one entry per such directory, sorted by directory, named by
its path relative to the repo (`.` for the repo's own directory). A directory
that holds source only in its sub-directories, such as `src`, is not listed;
its sub-directories are. A directory whose files the index does not hold is
not listed either. Each entry's `fileCount` counts the source files directly in
the directory within the scope's area, so under a `file` scope on a stored
module entity's own file it is 0, which does not say the directory is empty. Before, the list and the tree held stored module entities
only, which on a repository like this one is none.

The functional-surface task's `module` value has three forms:

| Form | Read as |
|---|---|
| an absolute directory path | that directory |
| a path relative to the repo (the `directory` or `name` the module list gives) | the directory under the repo that was read |
| the id of a stored module entity | that entity, exactly as before: its own repo is read whole and no scope is resolved |

A path's `.` and `..` segments are resolved first, so `src/pay/../ship` is the
directory `src/ship`.

The surface of a directory is every function, method and class of the stored
source files under it, sub-directories included, so a directory that is not in
the list (`src`) is still a valid value. A directory path is tested against
the run's scope:

- a directory outside the scope's area is refused;
- a directory under which no stored source file lies fails the task with a
  reason that says so and names the repo that was read. It is a failed task,
  not an empty module. A source directory in which no function, method or
  class is stored is an empty module, and complete.

Under a `file` or `symbol` scope the area is smaller than any directory: the
module list and the module tree hold no directory (a `file` scope that names a
stored module entity's own file still returns that entity), and the
functional-surface task refuses a directory path. An entity id is accepted
under every kind of scope.

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

`code` is one of `scope-ref-kind-target-mismatch`, `scope-ref-unresolved`,
`scope-not-indexed` and `connection-outside-scope`, and is present only for
those four. Such a task's `reason` is the error's message with no
`runtime-threw:` in front. Every other failure has no `code`, and an entry
without one has no `code` key at all. A record written before the change has
none, and nothing requires one.

`connection-outside-scope` is a task's code only: under a `connection` scope, a
task that names another connection is refused before the pool hands that
connection over. No request fails with it, so it is not in the table of a
request's error codes.

A task whose record cannot be written fails with
`task-record-unwritable: <the error>`; the tasks after it still run.

A task of a child plan keeps its own record, in its plan's directory and under
its full task path: the task `t01` of the child plan of `t02` is at
`tasks/t02/tasks/t02.t01.json`. The root plan's records stay at
`tasks/<taskId>.json`.

A planner task whose child plan wrote no report fails with the child's cause:
`child-plan-unavailable: child aggregator produced no report: its aggregate
task t02.t05 (<template>) failed: <that task's reason>`, followed by every
other task of the child that did not complete, each with its task path and its
reason.

### How an adherence check gets its constraints

An adherence check (`code.adherence.check`, `data.adherence.check`,
`infra.adherence.check`) compares a subject with the constraints the documents
state. It is given those constraints in one of three ways, read in this order;
the first that is given is used alone:

| Parameter | What the check does |
|---|---|
| `constraints` | Uses the inline list. An empty list counts as not given. |
| `constraintIds` | Uses the stored key constraints of the summarised documents with those ids. |
| `constraintTopic` | Looks the constraints up itself: it enumerates, from the documents of the repository it reads, the constraints on that topic. `maxConstraintSources` (1 to 30) says how many document sections the lookup reads. |

The topic is a subject in the documents' own words ("build and test rules for
CI workflows"), not a file path. The documents read are those of the whole
repository the check reads, whatever the check's own scope: for a scope that is
a manifest directory it is the repository that contains the directory, for a
connection the repository that declares it.

A plan must give each check one of the three. A plan whose check gives none
fails validation, so the planner plans again:

```
task t12 (infra.adherence.check): an adherence check needs constraints to check against, and this task gives none. Give `constraintTopic` (the subject to look up in the repository's documents; the check finds the constraints itself), `constraints` (a non-empty inline list), or `constraintIds` (a non-empty list of ids of summarised documents); or leave the task out of the plan.
```

A check is never given its constraints by another task. The parameter
`constraintsSource`, which named an upstream task's output, was removed: plan
validation refuses it in every plan, with a message that says to give
`constraintTopic` instead.

**One lookup per topic in a run.** The first check of a run that asks for a
topic makes the lookup and writes it to
`~/.insrc/analyze/<runId>/constraints/<key>.json`; every later check of the
run on the same topic (letters and spacing aside) and the same
`maxConstraintSources` reads that file, so the checks of one run judge against
the same list. The plans of a tree share it. The file holds the repository, the
topic, the task that made the lookup and the lookup's whole result. A lookup
that fails is not written, and the next check tries again.

**What the report carries.** The `adherence-report` holds, beside its findings,
`constraints` (the list the check judged against, each with its source
document) and `constraintSource`: `{ kind: 'documents', topic, repoPath,
retrievedSectionCount, record }`, `{ kind: 'inline' }` or
`{ kind: 'stored-documents', ids }`. What the lookup left out (a limit of
sections it reached, a section it read only in part, a search by meaning that
did not run) is in the task's completeness record.

**Why a check fails.** Each cause has its own reason on the failed task:

| Reason | Cause |
|---|---|
| `the documents of <repo> state no constraint on "<topic>" (...)` | The lookup finished and found nothing: no section matches the topic, or the sections read state no constraint. The check is not shown as passed. |
| `the constraints on "<topic>" could not be enumerated from the documents of <repo>: <cause>` | The lookup could not be made (the model that reads the sections could not be called). |
| `params.constraints holds no usable constraint` / `none of the <n> ids in params.constraintIds names a summarised document with a constraint` | An override was given and yields nothing. The topic is not tried in its place. |
| `the model call that judges adherence failed: ...` | The constraints were found and the judging call failed. The lookup's record stays. |

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

#### Several tasks may produce the same output

A plan often has several tasks that produce an output under one name: one
`functional-surface` per directory, one `inventory` per file, one `report` per
child plan. A task that consumes the name is handed **every** output produced
under it by the tasks that finished, in plan order, each with the task that
produced it (its id, its template and its parameters). It used to be handed
the last one only, so a report was written from one directory of eight and a
root report from one child plan of four, and neither said so.

- In the report task's input, a name one task produced is one section,
  `### <name>`, as before. A name several tasks produced is a section
  `### <name> (<n> outputs, one per task)` holding one sub-section per task,
  `#### <name> from task <taskId> (<template>)`, with a `params:` line that
  tells the tasks apart (it holds the directory, the file or the area).
- When one of several producers of a name failed or was skipped, the report
  task runs on the others and is told that this task's output under the name
  is absent, with the task's id and its reason, and that the other outputs
  under the name are available. It used not to be told: the name counted as
  present. When only one output of the name is left, it is still shown in the
  per-task form (`### <name> (1 output, one per task)`), so the report can say
  which task it came from.
- A task that is not the report task runs when a name it consumes has at least
  one output, and receives all that exist. It is not told which producers
  failed; that list goes to the report task only.
- `metadata.tasksAnalyzed` of a report is the number of outputs it was written
  from, summed over the names.
- A plan in which every name has one producer gives its report task the same
  input as before, byte for byte.

The report task's input now grows with the number of producers. A plan large
enough can therefore fail at its report task with the model's own reason
(`Prompt is too long`) where it used to return a report written from one
output of many. That report was wrong. An input too large for one pass is the
subject of Story s3 of the analyzer Epic (`b9d5c5c4`), which is to bound it;
nothing here shortens or splits the input.

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
