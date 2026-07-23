# insrc — Installation & Setup Guide

insrc is a **local-first** code-knowledge daemon: it indexes your repos into a
structural graph + vector store and serves citation-grounded exploration
(`analyze`) and multi-step engineering workflows (`define → design → plan →
build → test`) to a coding agent (Claude Code / Codex) over a Unix socket.

This guide covers what you must install, which models to pull, how to configure
providers, and how to drive it from the `insrc` TUI.

---

## 1. Requirements

| Component | Role | Required? |
| :--- | :--- | :--- |
| **Node.js ≥ 20** | Runtime. Native modules build against Node 22.22.1 headers; the daemon spawns under Node 22. | **Mandatory** |
| **Ollama** (running, `http://localhost:11434`) | The **semantic layer**: entity embeddings at index time + query embeddings at analyze time, and the analyze **tool-loop**. Cloud CLIs cannot do these. | **Mandatory** |
| **`claude` and/or `codex` CLI** (authenticated) | Cloud **reasoning** provider for analyze synthesis + workflow generation (higher accuracy than local models). Reached via the CLI's own OAuth — no API keys stored. | Strongly recommended |
| **`git`** | Repo indexing + tracker linkage. | Mandatory for indexing |
| **`gh` CLI** (authenticated) | GitHub tracker integration (`tracker.push/sync/post`, Task sub-issues). | Optional (only if using the tracker) |

> **Why Ollama is mandatory even when you run everything on the cloud CLI.**
> insrc is local-first by design: **embeddings never leave your machine** — the
> `claude`/`codex` CLIs don't expose an embeddings API, so the vector index +
> semantic search (`concept.resolve`, `capability.reuse-check`, `doc.mention`)
> can only run through a local embedder. Separately, the analyze **tool-loop**
> (`freeform.probe`) needs a tool-calling provider, and the one-shot CLI wrapper
> can't drive one, so that path is Ollama-only too. Cloud CLIs handle the
> *reasoning*; Ollama handles the *semantic layer*. Both are needed.

---

## 2. Install

The daemon lives at `~/.insrc/daemon`. Two paths:

**A. Release installer (recommended for users).** Download the release and run
the bundled bootstrap:

```bash
./insrc-daemon-install.sh      # clones + builds into ~/.insrc/daemon
```

**B. From source (developers / the IDE fork).**

```bash
git clone https://github.com/insors-ai/insrc ~/.insrc/daemon
cd ~/.insrc/daemon
npm install                    # builds native modules against Node 22 headers
npm run build                  # tsc + copy-assets → out/
```

Binaries after build:
- `out/cli/index.js` — the `insrc` interactive TUI
- `out/bin/insrc-mcp.js` — the MCP server a coding agent connects to
- `out/daemon/index.js` — the background daemon

> The IDE fork (`insors-ai/insrc-ide`) performs path B automatically and spawns
> the compiled daemon; the IPC socket at `~/.insrc/daemon.sock` is the only
> surface it consumes.

---

## 3. Ollama models

Pull these (or let the **Setup** pane recommend + pull them for your hardware —
see §6):

| Model | Purpose | Required? | Default id |
| :--- | :--- | :--- | :--- |
| Embedding | Semantic index + query embeddings (1024-dim) | **Mandatory** (local-only) | `qwen3-embedding:0.6b` |
| Analyzer core (shaper) | Analyze / workflow reasoning **when `shaperProvider: "ollama"`** | Only when reasoning runs locally (skip if using the claude / codex CLI) | `qwen3.6:35b-a3b` |

```bash
ollama pull qwen3-embedding:0.6b
ollama pull qwen3.6:35b-a3b        # analyzer core — skip if reasoning runs on claude/codex
```

> If you set reasoning to a CLI (`shaperProvider: "cli-claude"` / `"cli-codex"`),
> you do **not** need the shaper model — but you **still need the embedding
> model** (the semantic layer is always local).

---

## 4. Configuration

Two files under `~/.insrc/`:

### `~/.insrc/config.json` — models

```jsonc
{
  "models": {
    "providers": {
      "local": {
        "host":           "http://localhost:11434",
        "embeddingModel": "qwen3-embedding:0.6b",
        "embeddingDim":   1024,
        "coreModel":      "qwen3.6:35b-a3b"
      }
    },
    "analyze": {
      // Reasoning provider for analyze + workflows. Default "ollama".
      //   "ollama"     — local shaperModel below
      //   "cli-claude" — the claude CLI
      //   "cli-codex"  — the codex CLI
      "shaperProvider": "ollama",
      "shaperModel":    "qwen3.6:35b-a3b",   // an Ollama id; OMIT when using a cli-* provider
      "shaper": {
        "ollamaNumCtx":            32768,
        "maxToolTurns":            8,
        "structuredOutputRetries": 3
      }
    }
  }
}
```

**Provider-selection rules (one decision, applied consistently):**
- **Explicit `shaperProvider` set** → that provider is used for all reasoning.
- **Not set** → reasoning follows the invoking coding agent (Claude Code →
  claude, Codex → codex); Ollama is the fallback for standalone use.
- Regardless of the above, **Ollama is always used for embeddings + the
  tool-loop** (see §1).

> **Note on local (Ollama) structured output:** the local path constrains JSON
> via Ollama's grammar engine, which can reject some strict schemas
> (`"failed to parse grammar"`). For the analyze/workflow reasoning, prefer a
> `cli-*` provider until that's hardened; embeddings are unaffected.

### `~/.insrc/github.json` — tracker (optional)

GitHub Issues integration. **Opt-in** — absent/`"type": "none"` disables it.

```jsonc
{
  "default": {
    "type":  "github",          // or "none" to disable
    "owner": "myorg",
    "repo":  "myrepo",
    "epicLabel":     "insrc:epic",     // defaults shown
    "storyLabel":    "insrc:story",
    "taskLabel":     "insrc:task",
    "useMilestones": false,
    "pushTasks":     false,     // push Task-tier issues (type Task, sub-issues of the Story)
    "taskIssueType": "Task"     // org must have this issue type; falls back to untyped
  },
  "repos": {
    "/abs/path/to/repo": { "type": "github", "owner": "…", "repo": "…" }
  }
}
```

Requires an authenticated `gh` CLI (`gh auth login`). `pushTasks` + typed
sub-issues also need the org to have GitHub **issue types** + **sub-issues**
enabled (both degrade gracefully if absent).

---

## 5. Connecting a coding agent (Claude Code / Codex)

Register the insrc MCP server so the agent can call `insrc_analyze` /
`insrc_analyze_step` / `insrc_workflow_step`:

```bash
# Claude Code (per-project, from the repo root):
claude mcp add insrc --scope local --env INSRC_REPO="$PWD" -- node "$HOME/.insrc/daemon/out/bin/insrc-mcp.js"
```

You don't need to paste anything: when you register a repo (`insrc` TUI → Repos →
`a`, or the `repo.add` IPC), insrc **offers to install the steering block** into
the repo's `CLAUDE.md` (Claude Code) and/or `AGENTS.md` (Codex) — a safe,
idempotent `insrc:steering` marked section, never clobbered on re-add — so the
agent routes context questions to analyze and build requests through the
workflow chain. To install it by hand instead, copy
[`src/prompts/steering-block.md`](../src/prompts/steering-block.md) into the file
wrapped in those markers.

> The MCP tools load on a **fresh** agent session — after registering, restart
> Claude Code / Codex.

---

## 6. Using the `insrc` TUI

Launch the interactive TUI (requires a real terminal / TTY):

```bash
insrc                 # if built + on PATH
# or, from ~/.insrc/daemon:
npm run insrc         # dev (tsx)
```

**Global keys:** `Tab` / `Shift+Tab` or `1`–`4` switch panes · `r` refresh ·
`:` command · `?` help · `q` quit.

| Pane | Purpose | Keys |
| :--- | :--- | :--- |
| **Daemon** | Health + lifecycle. | `s` start · `x` stop · `u` update (git FF → install-if-changed → build → restart) · `b` backup · `c` compact |
| **Repos** | Register + index repositories (membership is established here). | `a` add · `i` reindex · `d` remove |
| **Workflows** | Per-Epic chain status; approve/reject artifacts. | `a` approve · `x` reject |
| **Setup** | Detects CPU/RAM/Ollama, recommends models for your hardware, writes config + pulls models. | `a` apply recommended config · `p` pull missing models |

**Fastest first-run:** open **Setup** → `a` to write a hardware-matched
`config.json` → `p` to pull any missing Ollama models → **Daemon** → `s` to
start → **Repos** → `a` to add + index your repo.

---

## 7. Verify

1. **Daemon** pane shows *running* + a bound socket (`~/.insrc/daemon.sock`).
2. **Repos** pane shows your repo *indexed* (queue depth 0).
3. From a registered agent session, ask a codebase question — `insrc_analyze`
   should return a citation-grounded bundle with real file paths.

If analyze returns "Local Ollama unavailable", confirm `ollama serve` is running
and the embedding model is pulled (§3).

---

## Reference

- [`docs/daemon.md`](daemon.md) — daemon usage
- [`docs/workflow.md`](workflow.md) — the workflow chain
- Config loaders: [`src/config/analyze.ts`](../src/config/analyze.ts),
  [`src/config/local.ts`](../src/config/local.ts),
  [`src/workflow/config/github.ts`](../src/workflow/config/github.ts)
