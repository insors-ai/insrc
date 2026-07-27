## insrc daemon 0.2.1 — workflow tools, per-role model tiering, config reconcile

A large roll-up since 0.2.0 (which shipped the interactive CLI + standalone
installer). The IPC contract, socket path, and `out/bin/insrc-mcp.js` binary
remain compatible; everything below is additive. Headline changes:

1. **The whole define → design → plan → build → tracker pipeline is now driven
   through MCP tools**, controller-first and independently reviewed.
2. **Per-role model tiering** — accuracy-first routing that guarantees the
   critical roles run on a high tier while peripheral roles may use cheaper
   local models.
3. **Schema-driven config reconcile** — a config that predates a schema change
   is carried forward, repaired, and (now) pruned automatically on daemon boot
   and on update.

### Workflow framework as MCP tools

The framework is now a first-class tool surface the invoking CLI (Claude Code /
Codex) drives turn-by-turn:

- **`insrc_triage`** — classification-first entry. Sizes a feature request
  (epic / feature / small / trivial), grounded on real `insrc_analyze_step`
  passes, and returns the exact next call so every feature — big or small — is
  tracked without the smallest ones drowning in ceremony.
- **`insrc_workflow_run`** — run a workflow server-side in the daemon, async:
  START → POLL for streamed progress → done. Drives decompose → steps →
  synthesize → review over the configured `LLMProvider`.
- **`insrc_workflow_step`** — the multi-turn variant where the controller emits
  each step's JSON in-session (better accuracy, no subprocess).
- **`insrc_review_step`** — controller-driven **independent** review ("two sets
  of eyes"): the server re-runs deterministic probes against real source and the
  controller judges the verdicts, off the model that authored the artifact.
- **`insrc_workflow_approve`** — in-CLI approval gate (single artifact or a
  whole-epic batch); stamps `approvedAt` and enforces the review block-verdict.
- **New `plan` and `build` workflows** — `plan` breaks one approved Story LLD
  into N ordered, sized, dependency-labelled Tasks; `build` consumes them one at
  a time behind an admission gate that refuses an unapproved / missing / stale
  plan.

Supporting machinery: `define` split into a new-vs-extend first step; a grounded
post-stage review-cycle engine with a materiality-gated severity rubric and a
surgical audit-correction loop; open-question resolution at every stage
boundary; hierarchical workflow ids embedded in artifacts + tracker issues.

### Per-role model tiering

Model selection is now per-step, per-role rather than one global provider
(design docs: `docs/daemon.md#model-tiering`).

- Config schema `models.analyze.{tiers, roleTiers, coreFloor, byRepo}` with a
  reasoning-role taxonomy (critical → core/peripheral roles).
- **RoleRouter** resolves each role's provider; **CoreFloorGuard** clamps the
  critical roles (design / review / build / validate) up to the `coreFloor` so
  accuracy is never traded on the roles that carry correctness, while peripheral
  roles (classification, narrow probes, tracker rendering, summaries) may use
  cheaper local models.
- Per-output `meta.attribution` records which tier/runner/model produced each
  artifact (the scalar `meta.model` is retired).
- Built-in tier defaults + an installer that prompts claude vs codex; a
  **Model Tiers TUI pane** to view/edit the per-role tiering.

### Config reconcile + consolidation

- **Boot + update reconcile** — the daemon reconciles `~/.insrc/config.json`
  against a catalog on every boot (authoritative) and on update: absent keys are
  filled with defaults, type-invalid ones repaired, and the dynamic namespaces
  (per-role tiers, per-repo overrides) preserved untouched — so a config that
  predates a schema change no longer breaks the daemon.
- **Retired-key prune + two canonical model surfaces** — the legacy top-level
  model block (`models.local` / `embedding` / `embeddingDim` / `tiers.*` /
  `context.*` / `agents`) was write-only and is now stripped on reconcile,
  leaving `models.providers.local.*` (local) and `models.analyze.*`
  (cloud/tiering) as the only places models are specified.
- Client-resolution chain for the analyze shaper: per-repo > global config >
  per-run caller > Ollama. `config list / get / set` command bar in the TUI.

### GitHub tracker

- Epics, Stories, and Tasks push as **native typed GitHub issues**, with Stories
  and Tasks linked as sub-issues of their parent.
- The independent review report posts as an issue comment on approval; an
  LLM-driven `tracker setup` command wires a repo's tracker target from its own
  git remote (never a global default).
- A read-side task query/list handler.

### MCP + repo registration

- The insrc MCP auto-registers with a client (Claude Code / Codex) when that
  repo's steering block is approved; `repo.add` installs the steering block into
  `CLAUDE.md` / `AGENTS.md`.
- Session-aware repo resolution across concurrent repos (falls back to
  `$INSRC_REPO`).

### Reliability + fixes

- `CliProvider` retries transient upstream API errors (connection drop, 5xx,
  rate limit) and the default CLI timeout is 120s → 600s.
- Indexer honours a per-repo externalized ignore config and skips `out/` +
  `.insrc/` (stops doc-summariser churn); review derives source roots from the
  indexed graph instead of a hardcoded `src/`.
- `design.epic` validates the shared-contract dependency graph and now guides
  cross-cutting-contract ownership to the nearest common ancestor; the `plan`
  workflow grounds correctly for standalone (no-HLD) LLDs; `maintenance.update`
  tolerates `package-lock.json` churn before its dirty guard.

### Docs

- A TUI-styled documentation + installation site at
  [insrc.insors.io](https://insrc.insors.io).

### Install / manage

Unchanged from 0.2.0 — the release installer (`insrc-daemon-install.sh`) and
`scripts/daemon-ctl.sh {start|stop|restart|update|status}`. An existing install
picks this up with `daemon-ctl.sh update` (or the TUI Daemon pane → `u`), which
also runs the config reconcile described above on the next restart.
