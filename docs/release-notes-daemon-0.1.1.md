## insrc daemon 0.1.1 — Ollama is now optional

Patch release with one headline change: **the daemon no longer
requires Ollama.** If Ollama isn't installed or reachable at boot,
the daemon falls back to an in-process ONNX embedder
(`nomic-embed-text-v1.5`, 768-dim, ~140 MB downloaded once on
first use). Vector search + doc retrieval keep working. Pair with
Claude Code's multi-turn `insrc_analyze_step` or Codex CLI for
the shaper LLM step and you have a fully-functional local code
knowledge graph with zero Ollama dependency.

### Install

One-liner:

```bash
curl -fsSL https://github.com/insors-ai/insrc-ide/releases/download/daemon-v0.1.1/insrc-daemon-install.sh | bash
```

The installer now **auto-detects Ollama** and writes an
appropriate first-boot config:

- **Ollama detected:** daemon boots into Ollama mode. Guidance
  prints the `ollama pull qwen3-embedding:0.6b` reminder.
- **Ollama not detected:** installer writes
  `~/.insrc/config.json` with `embeddingModel:
  nomic-ai/nomic-embed-text-v1.5`, `embeddingDim: 768`,
  `shaperProvider: cli-claude`. Daemon boots into pure-ONNX mode.
  Guidance prints instructions for the Claude Code / Codex flow.

Neither branch requires manual config editing on the target
machine.

### What changed since 0.1.0

- **Automatic ONNX embedder fallback.** New at
  `agent/providers/onnx-embedder.ts`. Wraps
  `@huggingface/transformers`' feature-extraction pipeline;
  applies nomic's `search_query:` / `search_document:` prefixes;
  mean-pools + L2-normalises outputs.
- **Boot-time backend selection.** `daemon/lifecycle.ts`
  `bootstrapEmbeddingModel` picks Ollama when reachable + model
  installed, falls back to ONNX otherwise, and refuses to enable
  vector ops (with a clear error message) if a dim mismatch is
  detected on a returning install.
- **Installer probes Ollama** and writes a fitting first-boot
  config on machines where it's absent. Pre-existing
  `~/.insrc/config.json` is never overwritten.
- **`docs/daemon.md`** now documents the three run modes
  (Full Ollama / Hybrid / ONNX-only) and the migration flow.

### Prerequisites

Just **Node.js ≥ 20** and **git**. That's it. Ollama is optional.

### Full changelog

- 398429f5588 `feat(embedder): in-process ONNX fallback via nomic-embed-text-v1.5`
- (this release) `fix(installer): auto-write ONNX config on Ollama-less machines`

### Rolling back

`~/.insrc/daemon/scripts/daemon-ctl.sh stop && rm -rf ~/.insrc`
clears everything the daemon owns. See the [Uninstall](https://github.com/insors-ai/insrc-ide/blob/release/1.96/docs/daemon.md#uninstall)
section of the docs for the full sequence.
