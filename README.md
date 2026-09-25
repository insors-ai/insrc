<div align="center">

# `insrc`

**local-first code-knowledge daemon**

insrc parses your repos into a graph + vector store, answers questions with
**citation-grounded** context, and drives an autonomous
`define → design → plan → build` workflow — all through your local
`claude` / `codex` CLI sessions.

**No API keys. No data leaves your box.**

[![docs](https://img.shields.io/badge/docs-insrc.insors.io-4ade80?style=flat-square)](https://insrc.insors.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict%20·%20ESM-3178c6?style=flat-square)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/Node-20%2B-339933?style=flat-square)](https://nodejs.org/)
[![storage](https://img.shields.io/badge/LMDB%20+%20Lance%20+%20DuckDB-embedded-f59e0b?style=flat-square)](#architecture)
[![license](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)

[Getting started](https://insrc.insors.io/getting-started.html) ·
[How it works](https://insrc.insors.io/architecture.html) ·
[Workflow](https://insrc.insors.io/workflow.html) ·
[CLI](https://insrc.insors.io/cli.html) ·
[Docs site →](https://insrc.insors.io)

</div>

---

Ask a real question from your `claude` / `codex` session, get a grounded answer —
every path and symbol comes from the indexed graph, not a guess:

```console
▸ insrc_analyze  "how does the workflow tracker push issues to GitHub?"
◆ decompose → 3 explorations · module.profile · symbol.locate · doc.constraint
◆ grounding on the dependency-closure graph … 41 entities, 7 relations
◆ synthesizing (citation-grounded) …

The tracker chain lives in src/workflow/tracker-auto.ts. On approval,
autoPushEpicOnHld / autoPushStoryOnLld / autoPushTasksOnPlan create typed
issues (Epic ▸ Story ▸ Task) as native sub-issues, committing the artifacts
and linking the blobs back from each issue. [tracker-auto.ts:112]
```

## What it does

insrc parses your code with tree-sitter, resolves cross-file relations into a
graph, embeds entities for semantic search, and serves both structural and
semantic queries through a single background daemon. On top of that store:

| | |
|---|---|
| **▚ Indexer** | tree-sitter parsing for TypeScript, Python, Go, Java, Scala & Kotlin into a typed entity/relation graph with deterministic IDs. |
| **◎ Analyze framework** | deterministic graph queries + citation-grounded synthesis — every claim anchored to a real exploration output (module profile, symbol locate, class hierarchy, doc constraint), so paths come from the graph, never hallucinated. |
| **⟿ Workflow framework** | an autonomous `define → design.epic → design.story → plan → build` chain that turns a goal into approved HLD/LLD artifacts, GitHub Epic/Story/Task issues, and code — with approval + review gates, open-question resolution, and staleness amendments. |
| **⊘ Bugfix triage** | a defect fix is first-class: an `issue` stage captures reproduction + root cause, a tiered locator attaches it to the code it corrects, then it's scope-routed to build. |
| **⚒ ~110 built-in tools** | capability wrappers spanning file · git · shell · http · web · gh · k8s · pkg · ssh · test · notify · search · graph · db · data · code · cloud. |
| **▮ Interactive CLI** | a full-screen ink (React) TUI with Daemon / Repos / Workflows / Setup panes. |
| **◱ IDE plugins** | thin VS Code & JetBrains orchestrators that install/manage the daemon, wire insrc's MCP tools into your IDE's AI assistant, and scope every call to the open project — [see below](#ide-plugins). |

Both frameworks are exposed as MCP tools (`insrc_analyze`, `insrc_analyze_step`,
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
- **Local-first.** Ollama is always available and embeddings are local-only; the
  graph + vectors live on your disk under `~/.insrc/`.
- **No direct cloud REST calls.** Cloud LLM access goes exclusively through the
  locally-installed `claude` and `codex` CLI binaries (via `CliProvider`), so
  auth and quota stay with the user's CLI OAuth sessions.
- **Daemon owns all storage.** The CLI, MCP server, and IDE never open LMDB or
  LanceDB directly — everything goes through daemon IPC.
- **No raw file dumps.** Context is always structured entity summaries +
  relations from the graph, never a blind file paste.

## Architecture

Everything routes through one daemon. Clients never open a database directly —
the daemon is the single owner of the graph, the vectors, and the tool registry.

```
   claude / codex CLI        insrc TUI          IDE workbench
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

## 60-second start

```bash
# users — one-line release installer: clones + builds the daemon into ~/.insrc/daemon and starts it
curl -fsSL https://github.com/insors-ai/insrc/releases/latest/download/insrc-daemon-install.sh | bash
# options after `bash -s --`, e.g. --target <path> · --branch main · --no-start · --embedder auto|ollama|onnx

# launch the interactive TUI — add a repo from the Repos pane (press 'a')
insrc

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
  bin/        Executable entrypoints
  prompts/    Shaper / analyze / workflow prompt templates
  assets/     Non-TS runtime resources (copied by copy-assets.mjs)
```

Compiled outputs: the daemon binary the IDE spawns is `out/daemon/index.js`; the
MCP binary is `out/bin/insrc-mcp.js` (registered as `insrc-mcp`).

**Tech stack** — TypeScript (strict, ESM-only, NodeNext) · Node.js 20+ (`tsx` in
dev; native modules build against Node 22 headers) · LMDB + LanceDB + DuckDB ·
tree-sitter (TS, Python, Go, Java, Scala, Kotlin) · Ollama (local LLM +
embeddings) + `CliProvider` (claude + codex CLI subprocesses) · pino logging ·
ink + react TUI · undici HTTP.

## CLI

`insrc` is a **full-screen interactive terminal UI** (built on
[ink](https://github.com/vadimdemedes/ink)) — no subcommands. Launch it in a
terminal (no `node`/`npm` needed; runs from any directory):

```bash
scripts/insrc                 # or `npm run insrc`
# put it on PATH once:  ln -s "$PWD/scripts/insrc" /usr/local/bin/insrc  →  then just `insrc`
```

Four panes (switch with `1`–`4`/`Tab`, `r` refresh, `q` quit):

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

Register the compiled `insrc-mcp` binary with an MCP client (e.g. Claude Code in
`~/.claude/settings.json`):

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

`INSRC_REPO` is optional — callers may pass `repo` on each tool call instead. The
repo must be registered (Repos pane → `a` add in the `insrc` TUI) and finished
indexing. When the client declares the `sampling` capability, inner LLM calls
route back through MCP `sampling/createMessage` (single session, no subprocess);
otherwise they fall back to the daemon's configured `shaperProvider`.

## IDE plugins

Prefer to stay in your editor? Two companion plugins bring insrc to the IDE. Both
are **thin orchestrators that own no reasoning** — all reasoning still runs
through the insrc MCP server your assistant invokes. Each one installs and keeps
the daemon current, wires insrc's MCP tools + the tracked-workflow steering into
your AI host, and scopes every call to the open project. Consent-gated,
marker-delimited and fully reversed on uninstall; **no cloud path, no stored
secrets** — auth stays with your existing CLI / OAuth sessions.

- **VS Code** — [`insors.insrc-vscode`](https://marketplace.visualstudio.com/items?itemName=insors.insrc-vscode)
  on the Marketplace (search **insrc**). Coalesced first-run onboarding (install
  daemon → register workspace → wire your AI host: Claude Code, Cursor, …), every
  action also a Command-Palette command, and the daemon's full configuration
  editable from **native VS Code Settings** (`insrc.*`, machine-scoped). After a
  daemon self-update it nudges you to **Reload Window** so the MCP connection
  reconnects.
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
- [`plans/`](plans/) — storage substrate, graph layer, repo registry contract,
  tool registry, workflow framework design notes
- [`CLAUDE.md`](CLAUDE.md) — full engineering guide and architectural rules

## License

MIT — see [LICENSE](LICENSE).
