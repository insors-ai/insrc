## insrc daemon 0.2.0 — interactive CLI + standalone installer

First tagged release of the standalone `insors-ai/insrc` repo. Two
headline changes:

1. **The `insrc` CLI is now a full-screen interactive TUI.** The old
   commander subcommand tree (`insrc daemon start`, `insrc repo add …`,
   `insrc workflow approve …`) is gone; running `insrc` opens a
   dashboard with live panes instead.
2. **A self-contained bootstrap installer** (`insrc-daemon-install.sh`)
   ships as a release asset, plus `daemon-ctl.sh` for headless
   management — both live in `scripts/` in the repo.

### The interactive CLI

Run it in a terminal:

```bash
npm run insrc        # dev (tsx); or `insrc` once built + linked
```

Four panes — switch with `1`–`4` / `Tab`, `r` refresh, `q` quit:

- **Daemon** — live health (uptime, queue, model-pull, LMDB size) and
  the full maintenance lifecycle: `s` start · `x` stop · `R` restart ·
  `u` update (git fast-forward → `npm install` if the lockfile changed →
  build) · `b` backup · `c` compact. Long ops stream a live log.
- **Repos** — registered repositories + indexing status; `a` add ·
  `d` remove · `i` reindex.
- **Workflows** — the Epic chain for the selected repo; open an Epic to
  approve / reject the next pending artifact (HLD/LLD approvals auto-push
  to the GitHub tracker) and approve / reject pending HLD amendments.
- **Setup** — hardware detect + model recommendation; `a` apply config ·
  `p` pull missing models (progress streamed inline).

It requires an interactive TTY and exits with a message otherwise.
Programmatic callers should talk to the daemon over the IPC socket
directly (or use `scripts/daemon-ctl.sh`) rather than driving the UI.

### Install

One-liner:

```bash
curl -fsSL https://github.com/insors-ai/insrc/releases/download/daemon-v0.2.0/insrc-daemon-install.sh | bash
```

The installer clones `insors-ai/insrc` into `~/.insrc/daemon`, runs
`npm install` + build, symlinks `out/node_modules`, auto-detects Ollama
(or falls back to the in-process ONNX embedder), starts the daemon, and
prints MCP-registration + TUI guidance. Flags: `--target`, `--branch`,
`--repo`, `--no-start`, `--embedder auto|ollama|onnx`, `-y`.

### Manage

- Interactively: `npm run insrc` → Daemon pane.
- Headless: `scripts/daemon-ctl.sh {start|stop|restart|update|status}`
  (targets `~/.insrc/daemon`, overridable via `INSRC_DAEMON_ROOT`).
  Now controls the daemon directly (spawn / SIGTERM drain / socket
  status) since the CLI subcommands it used to call are gone.

### Under the hood

- CLI built on [ink](https://github.com/vadimdemedes/ink) (React for
  the terminal); `commander` dropped.
- Command logic extracted into a `src/cli/services/` facade over the
  existing daemon IPC and local workflow modules — reused, not
  reinvented.
- The IPC contract, socket path, and `out/bin/insrc-mcp.js` MCP binary
  are unchanged; the IDE fork is unaffected.
