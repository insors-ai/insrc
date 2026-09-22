# insrc for VS Code

Grounded code-knowledge and the tracked insrc workflow, wired into your AI
assistant — the VS Code counterpart to the insrc JetBrains plugin.

insrc runs a local daemon that indexes your repositories into a graph + vector
store and exposes a citation-grounded analyze/workflow toolset over a local Unix
socket. This extension is a **thin orchestrator**: it installs and manages that
daemon, wires insrc into your AI host's MCP config, and registers your workspace
— all consent-gated, all reversible. It opens **no cloud path** and stores **no
secrets**; every capability reaches the daemon over the local socket.

## First run

On first activation the extension runs one coalesced onboarding flow, prompting
(each step independently, and only when needed) to:

1. **Install the insrc daemon** into `~/.insrc/`.
2. **Register this workspace** with the daemon (`repo.add`) so it gets indexed.
3. **Wire your AI host** (Claude Code, Cursor, …) so insrc's MCP tools are
   available to your assistant.

Skipped a prompt? Every action is also a durable command in the Command Palette:

- `insrc: Install daemon` / `Start` / `Stop` / `Restart` / `Update daemon`
- `insrc: Wire AI hosts`
- `insrc: Register workspace`

Uninstalling the extension runs a `vscode:uninstall` hook that removes the insrc
entries from every host config it wrote.

## Configure insrc

The daemon's configuration is editable directly from **native VS Code Settings**
(search `insrc`) — every option is a typed, machine-scoped setting, so it never
syncs off this machine:

- **Global options** (`insrc.*`) — log level, Ollama host, permission mode,
  model tiers, plan depth, embeddings, and more, each with the daemon's current
  value.
- **Per-role model tiers** (`insrc.models.tasks.*`) — override which tier
  (`cheap` / `mid` / `core`) serves each insrc reasoning role.

The Settings view stays **truthful to the daemon**: an edit the daemon rejects is
reverted with its reason, and external changes (from the CLI, JetBrains, or
another window) are reconciled on demand via **`insrc: Refresh insrc settings`**
in the Command Palette. All config access is over the local daemon socket — no
cloud path.

## Building & packaging (maintainers)

```bash
cd vscode-plugin
npm install
npm test          # the node:test (tsx --test) suite — the local gate
npm run bundle    # esbuild -> out/extension.js + out/uninstall.js (CJS)
npm run package   # npx @vscode/vsce package -> a single .vsix
```

The bundle inlines the shared IPC client and marks `vscode` external, so the
`.vsix` is self-contained and ships no repo source (see `.vscodeignore`).

## Publishing (maintainers)

Publishing is a **deliberate, manually-triggered** action — never a per-push CI
job — and targets the **VS Code Marketplace only**:

1. Set the `publisher` field in `package.json` to your Marketplace publisher id
   (currently `insors`).
2. Add a Marketplace Personal Access Token as the `VSCE_PAT` GitHub Actions
   secret (it lives only as a secret — never in the repo).
3. Bump the `version` in `package.json`.
4. Run the **vscode-plugin** workflow from the GitHub Actions tab
   (`workflow_dispatch`). It bundles, packages, and `vsce publish`es to the
   Marketplace.

## License

MIT — see [LICENSE](LICENSE).
