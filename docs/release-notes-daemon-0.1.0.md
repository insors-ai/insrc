## insrc daemon 0.1.0

First public release of the insrc daemon — a local, always-on
code-knowledge-graph indexer that exposes its graph over MCP so
Claude Code and Codex CLI can answer citation-grounded questions
about your codebase without hallucinating file paths or
paraphrasing docs.

Everything runs on your machine. No cloud API calls, no API keys
to manage — cloud model reasoning goes through the locally-
installed `claude` / `codex` CLI binaries via `CliProvider`, so
auth stays with your CLI OAuth session.

### Install

**One-liner** (macOS + Linux):

```bash
curl -fsSL https://github.com/insors-ai/insrc-ide/releases/download/daemon-v0.1.0/insrc-daemon-install.sh | bash
```

**Or download and inspect first**:

```bash
curl -fsSL https://github.com/insors-ai/insrc-ide/releases/download/daemon-v0.1.0/insrc-daemon-install.sh -o install.sh
less install.sh
bash install.sh --help
bash install.sh
```

The installer clones the repo into `~/.insrc/daemon`, builds the
daemon, and starts it. See [`docs/daemon.md`](https://github.com/insors-ai/insrc-ide/blob/release/1.96/docs/daemon.md)
for prerequisites, MCP setup, and the full CLI reference.

### What's in this release

- **Indexer**: tree-sitter parsing for TypeScript / Python / Go /
  Java / Scala, manifest resolution, entity embeddings via Ollama.
- **Daemon core**: LMDB-backed graph, LanceDB vectors, DuckDB
  query engine (data drivers only), Unix-socket JSON-RPC, file
  watcher.
- **Analyze framework**: 18 deterministic exploration recipes
  covering structural-map / adherence-check / decision-trace /
  prose-retrieval / capability-discovery / how-does-it-work /
  data-inventory / infra-inventory intents. Every bundle claim
  cites a real exploration output.
- **MCP surface**: two tools —
  - `insrc_analyze` (one-shot, Ollama-backed).
  - `insrc_analyze_step` (multi-turn — the client's own LLM does
    every reasoning step; no subprocess spawn, no Ollama billing
    for narrow-LLM calls).
- **~110 read-only built-in tools** the shaper's `freeform.probe`
  fallback loop can call (graph / db / file / search / code /
  data / git / docs). No mutation surface exposed to the LLM.

### Prerequisites

- Node.js ≥ 20
- git
- Ollama (recommended) at `http://localhost:11434` with:
  `ollama pull qwen3-embedding:0.6b && ollama pull qwen3-coder:latest`

### Known limits worth calling out

- **Multi-token queries can tie on ranking.** `concept.resolve`
  scores currently use `pathMatchNorm + nameMatchNorm +
  entityDensity` (path-depth signal was removed as a bad prior
  in this release). Distinct query tokens hitting different
  candidates one-at-a-time all score identically, and lexicographic
  path order breaks the tie. An IDF / per-token specificity
  signal is the intended follow-up.
- **Multi-turn state token is server-side, memory-only.** If the
  daemon restarts mid-run, active analyze sessions die (LRU cap:
  100 concurrent, TTL: 1 h). Same failure mode as one-shot
  Ollama runs.
- **The `insrc` CLI is not on `PATH`.** Drive the daemon via
  `~/.insrc/daemon/scripts/daemon-ctl.sh` or via `npx --no-install
  tsx cli/index.ts <cmd>` from `~/.insrc/daemon/src/insrc`.

### Rolling back

`~/.insrc/daemon/scripts/daemon-ctl.sh stop` then
`rm -rf ~/.insrc` clears everything the daemon owns. See the
[Uninstall](https://github.com/insors-ai/insrc-ide/blob/release/1.96/docs/daemon.md#uninstall)
section of the docs for a full sequence.

### Full changelog

This is the initial release. Subsequent releases will list
commits against the previous tag.
