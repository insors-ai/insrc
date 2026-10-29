<div align="center">

<img src="vscode-plugin/icon.png" alt="insrc" width="128" height="128">

# `insrc`

**Understand your code. Design changes. Deliver tracked work.**

insrc combines a local code and document knowledge index with a tracked
engineering workflow. Ask grounded questions, generate architecture documents,
and take features or bug fixes through design, review, implementation, and
code review using your existing Claude Code or Codex sessions.

Use it through MCP, the terminal dashboard, or companion IDE plugins.

**Local storage and embeddings. Cloud reasoning through your existing CLI login.**
Graph and vector data stay on disk. When you select a cloud model, relevant
context is sent through the `claude`, `codex` or `vibe` CLI; background document summaries
also follow the configured model tier. insrc does not require cloud LLM API keys.

[![docs](https://img.shields.io/badge/docs-insrc.insors.io-4ade80?style=flat-square)](https://insrc.insors.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict%20·%20ESM-3178c6?style=flat-square)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/Node-22.13%2B-339933?style=flat-square)](https://nodejs.org/)
[![storage](https://img.shields.io/badge/LMDB%20+%20Lance%20+%20DuckDB-embedded-f59e0b?style=flat-square)](#architecture)
[![license](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)

[Getting started](https://insrc.insors.io/getting-started.html) ·
[How it works](https://insrc.insors.io/architecture.html) ·
[Workflow](https://insrc.insors.io/workflow.html) ·
[CLI](https://insrc.insors.io/cli.html) ·
[Docs site →](https://insrc.insors.io)

</div>

---

## Start with a question or a change

From an MCP-connected assistant, ask:

- “What depends on this module, and what could break if I change it?”
- “What decisions and constraints do our design documents record?”
- “Generate a dependency diagram and explain the main components.”
- “Plan and implement this feature through the tracked workflow.”
- “Investigate this defect, record its cause, and build the fix.”

`insrc_analyze_step` keeps multi-turn reasoning in your assistant session while
retrieving structured evidence from the daemon. Answers include source evidence
and retrieval limitations; graph coverage and unresolved relationships still
matter. `insrc_analyze` also offers a one-shot daemon-side analysis path.

## What it does

insrc parses your code with tree-sitter, resolves cross-file relations into a
graph, embeds entities for semantic search, and serves both structural and
semantic queries through a single background daemon. On top of that store:

| | |
|---|---|
| **▚ Indexer** | tree-sitter parsing for TypeScript / JavaScript, Python, Go, Java, Scala & Kotlin into a typed entity/relation graph with deterministic IDs. |
| **◎ Analyze framework** | Graph queries and citation-grounded synthesis for module maps, symbol lookup, impact analysis, conventions, and document constraints, with explicit retrieval limits. |
| **Document knowledge** | Index repository documentation and sections, maintain summaries, and retrieve recorded decisions, constraints, and related prose alongside code evidence. |
| **Architecture documentation** | Generate self-contained offline HTML: type structures, component dependencies, call sequences, and graph-grounded narrative walkthroughs. |
| **⟿ Workflow framework** | Brainstorm rough ideas, triage scope, and route work through definition, design, planning, build, and code review as needed. Track artifacts and GitHub Epic/Story/Task issues with explicit approval gates and staleness amendments. |
| **⊘ Bugfix triage** | a defect fix is first-class: an `issue` stage captures reproduction + root cause, a tiered locator attaches it to the code it corrects, then it's scope-routed to build. |
| **⚒ ~110 built-in tools** | capability wrappers spanning file · git · shell · http · web · gh · k8s · pkg · ssh · test · notify · search · graph · db · data · code · cloud. |
| **▮ Interactive CLI** | a full-screen ink (React) TUI with Daemon / Repos / Workflows / Setup / Tiers / Debug panes. |
| **◱ IDE plugins** | thin VS Code & JetBrains orchestrators that install/manage the daemon, wire insrc's MCP tools into your IDE's AI assistant, and scope every call to the open project — [see below](#ide-plugins). |

These capabilities are exposed as MCP tools (`insrc_analyze`, `insrc_analyze_step`,
`insrc_triage`, `insrc_workflow_step`, `insrc_docgen`, …) so they drive Claude
Code, Codex, or any MCP client.

> Split out from [insors-ai/insrc-ide](https://github.com/insors-ai/insrc-ide)
> on 2026-07-14. The IDE fork clones this repo into `~/.insrc/daemon/`, builds
> it, and spawns the compiled entry — the JSON-RPC IPC contract over the Unix
> socket is the only surface the IDE consumes.

## Design principles

- **Accuracy is primary; cost is the least priority.** Given the choice between
  an accurate-but-expensive path and a cheap-but-lossy one, insrc chooses
  accuracy.
- **Local-first.** Embeddings run locally through Ollama or the embedded ONNX
  backend; the graph + vectors live on your disk under `~/.insrc/`.
- **No direct cloud REST calls.** Cloud LLM access goes exclusively through the
  locally-installed `claude`, `codex` and `vibe` CLI binaries (via `CliProvider`), so
  auth and quota stay with the user's CLI OAuth sessions.
- **Daemon owns all storage.** The CLI, MCP server, and IDE never open LMDB or
  LanceDB directly — everything goes through daemon IPC.
- **No raw file dumps.** Context is always structured entity summaries +
  relations from the graph, never a blind file paste.

## Architecture

Everything routes through one daemon. Clients never open a database directly —
the daemon is the single owner of the graph, the vectors, and the tool registry.

```
   claude / codex / vibe CLI  insrc TUI          IDE workbench
          │                     │                     │
          └──────────┬──────────┴──────────┬──────────┘
                     ▼                      ▼
              MCP servers            JSON-RPC over
          insrc_analyze_step       ~/.insrc/daemon.sock
          insrc_workflow_step              │
                     └──────────┬──────────┘
                                ▼
                   ┌────────────────────────┐
                   │         DAEMON          │  owns all DB access
                   │  registry · queue · fs  │
                   │  watcher · tool exec    │
                   └───────────┬────────────┘
              ┌────────────────┼────────────────┐
              ▼                ▼                 ▼
         LMDB graph      Lance vectors        DuckDB
       entities/edges   ANN / embeddings   data-driver tools
```

- **Storage** — LMDB (`lmdb-js`) as the KV substrate for a custom graph layer
  (`findCallers` / `findCallees` / `transitiveClosure` / `unreachable` …),
  LanceDB for entity embeddings + ANN search, and an in-memory DuckDB pool that
  backs the data-driver `db_file_*` tools (query engine only — not persistent
  storage).
- **Scoping** — graph searches span only the transitive `DEPENDS_ON` closure of
  the active repo. Registry membership is established exclusively via the
  `repo.add` IPC; entities for unregistered repos fail the upsert.

## Getting started

You need Git and Node.js **≥22.13.0** for a source installation. Choose local
Ollama embeddings or the embedded ONNX alternative. Reasoning can use a local
Ollama model or an authenticated `claude` / `codex` / `vibe` CLI. Model downloads and
cloud reasoning require network access.

```bash
# users — one-line release installer: clones + builds the daemon into ~/.insrc/daemon and starts it
curl -fsSL https://github.com/insors-ai/insrc/releases/latest/download/insrc-daemon-install.sh | bash
# options after `bash -s --`, e.g. --target <path> · --branch main · --no-start · --embedder auto|ollama|onnx

# launch the dashboard — add a repo from Repos (press 'a'), then wait for indexing
"$HOME/.insrc/daemon/scripts/insrc"

# then register insrc as an MCP server (see below) and ask grounded questions
# from your claude / codex session, e.g. via the insrc_analyze tool:
#   "where is the repo registry contract enforced?"
```

See [`docs/installation.md`](docs/installation.md) or the
[getting-started guide](https://insrc.insors.io/getting-started.html) for the
full walk-through.

## Build & test (from source)

```bash
npm install        # runtime + dev deps
npm run build      # tsc + copy-assets.mjs

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
  workflow/   Workflow framework (define, design.epic, design.story, plan, build, tracker, gates)
  mcp/        MCP servers (insrc_analyze_step, insrc_workflow_step, …)
  cli/        `insrc` interactive TUI (ink) — panes, services, hooks
  docgen/     Graph-derived diagrams and offline HTML documents
  bin/        Executable entrypoints
  prompts/    Shaper / analyze / workflow prompt templates
  assets/     Non-TS runtime resources (copied by copy-assets.mjs)
```

Compiled outputs: the daemon binary the IDE spawns is `out/daemon/index.js`; the
MCP binary is `out/bin/insrc-mcp.js` (registered as `insrc-mcp`).

**Tech stack** — TypeScript (strict, ESM-only, NodeNext) · Node.js ≥22.13.0 (`tsx` in
dev; native modules build against Node 22 headers) · LMDB + LanceDB + DuckDB ·
tree-sitter (TS/JS, Python, Go, Java, Scala, Kotlin) · Ollama (local LLM +
embeddings) / ONNX (local embeddings) + `CliProvider` (claude + codex + vibe CLI subprocesses) · pino logging ·
ink + react TUI · undici HTTP.

## CLI

`insrc` is a **full-screen interactive terminal UI** (built on
[ink](https://github.com/vadimdemedes/ink)) — no subcommands. Launch it in a
terminal (the launcher locates the runtime; runs from any directory):

```bash
scripts/insrc                 # or `npm run insrc`
# put it on PATH once:  ln -s "$PWD/scripts/insrc" /usr/local/bin/insrc  →  then just `insrc`
```

Six panes (switch with `1`–`6`/`Tab`, `r` refresh, `q` quit):

- **Daemon** — live health (uptime, queue, model-pull, LMDB size) + the full
  maintenance lifecycle: `s` start · `x` stop · `R` restart · `u` update
  (git fast-forward → `npm install` if the lockfile changed → build) · `b`
  backup · `c` compact.
- **Repos** — registered repositories with indexing status; `a` add · `d` remove
  · `i` reindex. The highlighted repo is what the Workflows pane targets.
- **Workflows** — the Epic chain for the selected repo; open an Epic to approve /
  reject the next pending artifact (HLD/LLD approvals auto-push to the GitHub
  tracker) and approve / reject pending HLD amendments.
- **Setup** — hardware detection + model recommendation; `a` apply config · `p`
  pull missing models (progress streamed inline).
- **Tiers** — inspect and configure model tiers for reasoning roles.
- **Debug** — inspect MCP connections and daemon logs.

Press **`:`** anywhere for a vim-style command bar (REPL-style; `Esc` closes):

```
repo     add <path> | remove <path> | reindex <path> | list
daemon   start | stop | restart | update | backup <dir> | compact | status
workflow list | chain <hash> | approve <path> | reject <path> <reason> | ack-stale <path> <reason>
config   list | get <key> | set <key> <value> | reload    # key is a dot-path, e.g. models.embeddingDim
setup    show | apply | pull
pane <name> · help · quit
```

It requires an interactive TTY. Programmatic callers should talk to the daemon
over the IPC socket directly rather than driving the UI.

## MCP server

Register the installed MCP server once with your assistant:

```bash
# Claude Code
claude mcp add insrc --scope user -- node "$HOME/.insrc/daemon/out/bin/insrc-mcp.js"

# Codex
codex mcp add insrc -- node "$HOME/.insrc/daemon/out/bin/insrc-mcp.js"
```

Use your actual install path if you changed the installer target. The MCP server
resolves registered repositories from the session's working directory. You can
also supply `repo` on a tool call or set `INSRC_REPO` explicitly. Register the
repository and let indexing finish before querying it.

The main tools include:

| Tool | Use |
|---|---|
| `insrc_analyze_step` / `insrc_analyze` | Multi-turn or one-shot grounded analysis. |
| `insrc_docgen` | Graph-derived HTML documentation and diagrams. |
| `insrc_triage` | Size and route a feature or defect. |
| `insrc_workflow_step` | Drive brainstorm, definition, design, planning, and tracker stages in-session. |
| `insrc_build_step` | Implement and validate tracked work. |
| `insrc_review_step` / `insrc_code_review_step` | Review design artifacts and built code. |
| `insrc_present` / `insrc_workflow_approve` | Present pending artifacts and record explicit user approval. |
| `insrc_schema` / `insrc_guide` | Retrieve exact tool contracts and workflow procedures. |

Design artifacts are reviewed before approval; built Stories receive code
review. Smaller changes take shorter routes. See the [workflow guide](docs/workflow.md)
for the full lifecycle.

## IDE plugins

Prefer to stay in your editor? Two companion plugins bring insrc to the IDE. Both
are **thin orchestrators that own no reasoning** — all reasoning still runs
through the insrc MCP server your assistant invokes. Each one installs and keeps
the daemon current, wires insrc's MCP tools + the tracked-workflow steering into
your AI host, and scopes every call to the open project. Consent-gated,
marker-delimited and reversed on uninstall; cloud LLM authentication stays with
your existing CLI / OAuth sessions.

- **VS Code** — [`insors.insrc-vscode`](https://marketplace.visualstudio.com/items?itemName=insors.insrc-vscode)
  on the Marketplace (search **insrc**). Coalesced first-run onboarding (install
  daemon → register workspace → wire your AI host: Claude Code, Cursor, …), every
  action also a Command-Palette command, and the daemon's full configuration
  editable from **native VS Code Settings** (`insrc.*`, machine-scoped). After a
  daemon self-update it nudges you to **Reload Window** so the MCP connection
  reconnects. It also includes an **in-editor chat preview** over your Claude /
  Codex CLI, **pending-document review**, and a **delivery board** for tracked
  work. Open these through the insrc commands in the Command Palette.
- **JetBrains** — one plugin for **IntelliJ IDEA, PyCharm, GoLand & WebStorm**
  (2024.2+) from a single install; wires JetBrains **AI Assistant** or **Junie**.
  Adds **Settings → Tools → insrc** (a live daemon-config editor with nested
  Daemon / Workflows / Debug pages), a **project-view context menu** (repo status
  + one-click register), and an **artifact-review tool window** (read, comment on
  and approve pending workflow artifacts in-IDE). On the JetBrains Marketplace
  (search **insrc**), or install a built `insrc-jetbrains-<version>.zip` from disk.

See the [plugin guide](https://insrc.insors.io/plugin.html) for setup and
first-run details.

## Documentation

- **[insrc.insors.io](https://insrc.insors.io)** — full documentation site
- [`docs/daemon.md`](docs/daemon.md) — daemon usage guide
- [`docs/workflow.md`](docs/workflow.md) — workflow user guide
- [`design/analyze-framework.md`](design/analyze-framework.md) — analyze framework
- [`design/indexer.html`](design/indexer.html) — indexer architecture
- [`docs/plans/`](docs/plans/) — storage substrate, graph layer, repo registry contract,
  tool registry, workflow framework design notes
- [`CLAUDE.md`](CLAUDE.md) — full engineering guide and architectural rules

## License

MIT — see [LICENSE](LICENSE).
