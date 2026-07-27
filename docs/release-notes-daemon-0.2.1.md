## insrc daemon 0.2.1 — installer refresh (per-role tiers, single-scope MCP)

This release re-cuts the **bootstrap installer** (`insrc-daemon-install.sh`) and
`daemon-ctl.sh`. The changes are small and scoped to first-install / bootstrap.

> **The daemon's feature work is NOT delivered by this release.** An installed
> daemon updates continuously via `scripts/daemon-ctl.sh update` (git
> fast-forward → `npm install` if the lockfile changed → rebuild) or the TUI
> Daemon pane → `u`. All the substantial post-0.2.0 work — the workflow MCP
> tools (`triage` / `workflow-run` / `workflow-step` / `review-step` / `approve`,
> plus the `plan` and `build` workflows), per-role model tiering, the
> schema-driven config reconcile, and the native GitHub tracker — reaches
> existing installs on their next `update`, with no re-install and no new
> installer release. This 0.2.1 tag only refreshes what a *fresh* bootstrap does.

### What the installer now does differently

- **Preferred-CLI + per-role tier prompt (Step 4b).** The installer asks
  `claude` vs `codex` and writes a `models.analyze.tiers` map into the fresh
  `~/.insrc/config.json` — `core` / `mid` on the chosen CLI (claude → opus /
  sonnet; codex → gpt-5.5 / gpt-5.5) and `cheap` on local Ollama, with
  `coreFloor: core`. This seeds the RoleRouter so the daemon routes each role to
  the right capability tier out of the box.
- **Config-first, canonical shape.** Both the ONNX and Ollama embedder branches
  now write a config keyed on `models.providers.local.*` + `models.analyze.tiers`
  and no longer emit the legacy `analyze.shaperProvider` / `shaperModel` (those
  are superseded and are pruned by the daemon's reconcile anyway).
- **Single-scope MCP registration.** Post-install guidance now registers the MCP
  once at user scope with no per-repo pin — repo resolution is session-aware
  (the server matches its working directory against your registered repos):

  ```bash
  claude mcp add insrc --scope user -- node ~/.insrc/daemon/out/bin/insrc-mcp.js
  codex  mcp add insrc             -- node ~/.insrc/daemon/out/bin/insrc-mcp.js
  ```

  (Previously each client was registered per-repo with `INSRC_REPO=…`.)
- **TUI launcher.** Points at `~/.insrc/daemon/scripts/insrc` (with a
  `/usr/local/bin/insrc` symlink suggestion) and mentions the new `:` command
  bar (`repo add …`, `daemon restart`, `config list`, `config set …`).
- **Lockfile-churn tolerance.** The installer's own update path (and
  `daemon-ctl.sh`) discard `package-lock.json` churn before the fast-forward
  guard, so a re-run over an existing install no longer refuses as "dirty".
- **`daemon-ctl.sh start` fully detaches** the spawned daemon, so `start` can't
  hang the calling shell / CI step.

### Install

One-liner (unchanged shape; new tag):

```bash
curl -fsSL https://github.com/insors-ai/insrc/releases/download/daemon-v0.2.1/insrc-daemon-install.sh | bash
```

Flags unchanged: `--target`, `--branch`, `--repo`, `--no-start`,
`--embedder auto|ollama|onnx`, `-y`.

### Upgrading an existing install

You do **not** need this installer to get the daemon's newer features — just:

```bash
~/.insrc/daemon/scripts/daemon-ctl.sh update    # or: TUI Daemon pane → u
```

which fast-forwards the checkout, rebuilds, and (on the next restart) runs the
config reconcile that carries your existing `~/.insrc/config.json` forward.
