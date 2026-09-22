<!-- insrc:artifact DEF-401ae5fb7b8537cc -->

# Epic: insrc users working in VS Code have no in-editor way to view or change the daemon's configuration, or to observe the daemon's operational state.

**Flavor:** new-capability
**Seeded from:** `SPEC-d18668bb33798f21`

## Problem

insrc users working in VS Code have no in-editor way to view or change the daemon's configuration, or to observe the daemon's operational state. Everything a JetBrains user gets — reading and editing the global, per-role, and per-repo configuration; seeing daemon status; inspecting the workflow chain; spotting and clearing orphan processes; checking which MCP clients are wired; tailing the daemon log — is absent from the VS Code extension, which today only installs/wires/registers and shows a bare status glyph. A VS Code user who needs to change a model tier, adjust a per-repo override, or diagnose why the daemon looks unhealthy must leave the editor for the CLI/TUI or hand-edit ~/.insrc/config.json, and has no visibility into daemon/workflow/debug state at all. Because that config file is process-global and other clients write to it concurrently, any surface that lets a user edit config must also stay honest about what the daemon actually holds rather than showing a stale or optimistic value.

## Non-goals

- **Adding any new daemon-side capability — no config-changed subscribe/push IPC channel; the Epic reaches the daemon only through the existing config.catalog / config.write IPC.** — The parity gap is entirely on the VS Code client side; the daemon already exposes everything needed, and a push channel is a separate, larger concern that would broaden scope beyond a client-only Epic.
- **A trimmed first cut (config-only, read-only-only, or status-pages-only).** — The settled goal is FULL JetBrains parity in one Epic; a partial v1 would leave VS Code users with a second-class subset and force a follow-up Epic for the remainder.
- **Hand-authoring per-repo overrides as raw JSON in settings.json, or scoping them to open VS Code workspace folders.** — The daemon's registered-repo set is independent of which folders happen to be open, so a folder-scoped or raw-JSON per-repo surface would be error-prone and misrepresent the daemon's repo registry.
- **Participating in VS Code Settings Sync for the config keys.** — The config drives a machine-local daemon whose capabilities (local model availability, local paths) are per-machine; syncing values across machines could silently reconfigure a differently-capable daemon.
- **Rendering the live status/action pages (Daemon/Workflows/Debug) through native settings or a TreeView, or combining them with the editable config in one surface.** — Those pages are live status and actions, not settings; native settings and TreeView cannot render live daemon-derived state or custom actions, and merging surfaces sacrifices the idiomatic native config editing where it fits.
- **Streaming/push-based live updates into the Webview for the Daemon/Workflows sections.** — The daemon IPC is request/response; an on-demand refresh (mirroring JetBrains) meets the need without adding a subscription/push mechanism.

## Assumptions

- `high` The daemon's config.catalog (read the config schema + current values, incl. the registered-repo list) and config.write (write a single key) IPC methods are stable and sufficient to drive both the native config surface and the per-repo editor. [[c3]]
- `high` The set of roles is a static, code-defined taxonomy (so per-role tier-override keys are known at package.json build time and can be declared as static native settings), while the role→tier assignment is a user-editable override on code defaults. [[c5]]
- `high` There is no config-changed subscribe/push channel in the daemon IPC today, so keeping VS Code→daemon and daemon→VS Code sync on-demand adds no daemon capability. [[c1]]
- `high` The shipped JetBrains config editor (global/per-role/per-repo) + nested Daemon/Workflows/Debug pages (status, chain report, orphan-kill, MCP clients, log tail) are the authoritative feature set this Epic mirrors. [[c4]]

## Constraints

| ID | Type | Text | Source |
| :--- | :--- | :--- | :--- |
| `k1` | convention | Ships inside the existing in-repo vscode-plugin/ package as a stock VS Code extension (no fork), extending the shipped onboarding-first extension without regressing its lifecycle/host-wiring/registration behavior. | [[c2]] |
| `k2` | invariant | Opens no cloud path and stores no secrets; all reasoning/config access stays behind the local daemon IPC over the Unix socket. | [[c2]] |
| `k3` | contract | Reaches the daemon ONLY through the existing config.catalog / config.write IPC via the shared ipc-client; adds no new daemon-side capability. | [[c3]] |
| `k4` | invariant | Every daemon-mutating action (notably the Debug orphan-kill) is consent-gated before it runs. | [[c2]] |
| `k5` | invariant | The native config surface must stay truthful to actual daemon state: a rejected write auto-reverts to last-known-good, and external writes from other clients are reconciled via an on-demand pull-sync — the UI never shows a value the daemon does not hold. | [[c1]] |
| `k6` | convention | Every durable surface (the Detailed Status panel, the Repo Configuration panel, the Refresh action) is reachable as a first-class Command Palette command, not only via the status-bar menu. | [[c2]] |
| `k7` | stakeholder | The native config keys are machine-scoped (user-only, excluded from VS Code Settings Sync) so config stays local to each machine's daemon; per-repo overrides are keyed to the daemon's own repo registry, independent of open workspace folders. | [[c6]] |
| `k8` | stakeholder | Delivers FULL parity with the shipped JetBrains settings + nested-pages surface (read-only→editable→per-role→per-repo config plus all 3 nested pages incl. the orphan-kill mutation) as one multi-story Epic. | [[c1]] |

## Stories

### E20260922401ae5fb:S001 — Edit insrc's global configuration from VS Code Settings

**User value:** `size: L`

A VS Code user can read and change insrc's global daemon configuration directly in VS Code's native Settings, with each edit applied to the daemon immediately and no separate save step — instead of leaving the editor for the CLI/TUI or hand-editing the config file.

**Acceptance criteria:**

- **ac1:** Given the extension is active and the daemon is reachable, when the user opens VS Code Settings and looks up insrc, then insrc's global configuration keys are shown with their current daemon values, editable in place. _(operationalizes `k3`, `k8`, `lc1`)_
- **ac2:** Given insrc's global configuration is shown in Settings, when the user changes a value, then the change is applied to the daemon immediately, with no manual save/apply step. _(operationalizes `k3`, `lc1`)_
- **ac3:** Given insrc's configuration keys, when they are presented in Settings, then they are user-scoped and stay local to this machine, and are not carried to the user's other machines. _(operationalizes `k7`)_

**Local constraints:**

- `lc1` (invariant) insrc's configuration source of truth is the daemon's single global config; the Settings view is a live mirror/editor over it, never an independent store. [[c6]]

### E20260922401ae5fb:S002 — Edit per-role model-tier overrides in Settings

**User value:** `size: M`

A VS Code user can override which model tier serves each insrc role from native Settings, like any other setting, without editing config files — while the fixed set of roles stays stable.

**Depends on:** `s1`

**Acceptance criteria:**

- **ac1:** Given the fixed set of insrc roles, when the user opens Settings, then each role's tier override is presented as an editable choice reflecting the daemon's current assignment for that role. _(operationalizes `k3`, `k8`)_
- **ac2:** Given a role's tier override shown in Settings, when the user changes it, then the daemon applies the new per-role override immediately, under the same truthful-apply behavior as other config edits. _(operationalizes `k3`)_

### E20260922401ae5fb:S003 — Keep the Settings view truthful to the daemon

**User value:** `size: M`

A VS Code user never sees a config value the daemon didn't accept, or a stale value another client changed — rejected edits are reverted with the daemon's reason, and external changes are reconciled on demand.

**Depends on:** `s1`

**Acceptance criteria:**

- **ac1:** Given a config edit the daemon rejects (an invalid value, or the daemon is unreachable), when the user makes the edit, then the user is shown the daemon's rejection reason and the setting is restored to the value the daemon actually holds. _(operationalizes `k5`)_
- **ac2:** Given the daemon's config was changed by another client (CLI, JetBrains, or another VS Code window), when the user reactivates the extension or triggers the refresh action, then the Settings view is reconciled to the daemon's current values. _(operationalizes `k5`)_
- **ac3:** Given the reconcile/refresh action, when the user looks for it, then it is available as a first-class command. _(operationalizes `k6`)_

### E20260922401ae5fb:S004 — Open insrc's detailed status from the status bar

**User value:** `size: L`

A VS Code user has one obvious entry point for all live insrc state: clicking the insrc status-bar item (or a command) offers Detailed Status and Repo Configuration, and Detailed Status opens a panel that lands on daemon status with tabs for the other views.

**Acceptance criteria:**

- **ac1:** Given the insrc status-bar item, when the user clicks it, then a menu offers exactly two choices: Detailed Status and Repo Configuration. _(operationalizes `k6`, `k8`)_
- **ac2:** Given the user chooses Detailed Status, when it opens, then a panel appears showing daemon status as the default view, with tabs for Workflows and Debug. _(operationalizes `k8`)_
- **ac3:** Given the Detailed Status panel and the Repo Configuration panel, when the user looks in the command palette, then each panel is reachable as its own first-class command. _(operationalizes `k6`)_
- **ac4:** Given any of these surfaces opens, when it loads its data, then it reaches the daemon only over the local IPC and opens no cloud path. _(operationalizes `k2`, `k3`)_

### E20260922401ae5fb:S005 — See daemon status and the workflow chain

**User value:** `size: M`

A VS Code user can see the daemon's current status and the workflow chain report inside the status panel, refreshed on demand without needless background polling.

**Depends on:** `s4`

**Acceptance criteria:**

- **ac1:** Given the Detailed Status panel, when the Daemon view is shown, then the daemon's current operational status is displayed. _(operationalizes `k8`)_
- **ac2:** Given the Workflows tab, when it is shown, then the workflow chain report is displayed. _(operationalizes `k8`)_
- **ac3:** Given the Daemon or Workflows view, when the user opens it, switches to it, or clicks its refresh control, then its data is re-read from the daemon at that moment, and there is no continuous background polling for these two views. _(operationalizes `k3`)_

### E20260922401ae5fb:S006 — Inspect and clean up daemon runtime state (Debug)

**User value:** `size: M`

A VS Code user can, from the Debug tab, see which MCP clients are wired, watch the daemon log tail live, and clear orphaned insrc processes — with the destructive cleanup confirmed before it runs.

**Depends on:** `s4`

**Acceptance criteria:**

- **ac1:** Given the Debug tab, when it is shown, then the currently wired MCP clients are listed. _(operationalizes `k8`)_
- **ac2:** Given the Debug tab's log section, when it is open, then the daemon log tails live and keeps updating while the tab stays open. _(operationalizes `k8`)_
- **ac3:** Given orphaned insrc processes exist, when the user triggers the cleanup action, then the user must explicitly confirm before any process is terminated. _(operationalizes `k4`)_

### E20260922401ae5fb:S007 — Edit per-repo configuration overrides

**User value:** `size: M`

A VS Code user can pick any repo the daemon has registered — regardless of which folders are open in the window — and edit that repo's per-repo configuration overrides from a dedicated panel, rather than hand-writing JSON.

**Depends on:** `s4`

**Acceptance criteria:**

- **ac1:** Given the Repo Configuration panel, when it opens, then it offers a picker of the daemon's registered repos, independent of which workspace folders are currently open. _(operationalizes `k7`, `lc1`)_
- **ac2:** Given a repo selected in the picker, when the user edits that repo's overrides, then the changes are applied to the daemon for that specific repo. _(operationalizes `k3`)_
- **ac3:** Given the per-repo overrides, when the user edits them, then they are authored through the panel's fields, not by hand-editing raw JSON in Settings. _(operationalizes `k7`, `lc1`)_

**Local constraints:**

- `lc1` (stakeholder) Per-repo overrides are keyed to the daemon's registered-repo set, independent of which VS Code workspace folders are open. [[c6]]

## Citations

- **[[c1]]** `prior-artifact` `Approved SpecArtifact SPEC-d18668bb33798f21 (docs/standalone/bring-insrc-settings-config-ui-vs-E20260922d18668bb/SPEC.md)` — "Full JetBrains parity as one multi-story epic; native contributes.configuration (machine scope) + live-push/toast-auto-revert/pull-sync; status-bar 2-item menu (Detailed Status tabbed panel / Repo Con"
- **[[c2]]** `prior-artifact` `Completed VS Code extension epic ad0d45c9 (docs/epics/build-insrc-vs-code-extension-v1-E20260921ad0d45c9/) — the onboarding-first extension this Epic extends; source of the stock-extension / no-cloud / consent-gate / palette-reachability constraints.` — "Stock VS Code extension under vscode-plugin/; k2 no cloud path; invasive actions consent-gated; durable actions are first-class commands; the settings UI was deferred to a later release."
- **[[c3]]** `code` `src/daemon/index.ts (config.catalog / config.write handlers) + src/config/__tests__/settings-catalog.test.ts; consumed by jetbrains-plugin DaemonGateway (METHOD_CONFIG_CATALOG)` — "config.catalog reads the config schema + values (incl. registered repos); config.write writes a single key — the existing IPC the VS Code surface reuses."
- **[[c4]]** `prior-artifact` `Shipped JetBrains settings epics: expose-all-daemon-config-settings (b5f333f8, config editor incl. PerRoleSection/PerRepoSection) + expand-jetbrains-plugin-s-insrc-settings (57298940, nested Daemon/Workflows/Debug pages incl. OrphanProcess orphan-kill)` — "The JetBrains config editor + nested Daemon/Workflows/Debug pages are the authoritative parity target this VS Code Epic mirrors."
- **[[c5]]** `code` `src/config/role-taxonomy.ts (RoleId static taxonomy), src/analyze/context/role-router.ts (createRoleRouter), src/config/core-floor-guard.ts (applyCoreFloor) — roleTiers override map + models.coreFloor` — "The role SET is a static RoleId taxonomy; role→tier is a user-editable override (roleTiers) clamped by the coreFloor — so per-role keys are known at build time yet user-editable."
- **[[c6]]** `convention` `client-provider-resolution memory / config-reconcile — config is global (one ~/.insrc/config.json), independent of the VS Code workspace` — "Config is global — one ~/.insrc/config.json; the daemon's repo registry (and its config) is independent of which folders are open in the editor."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — define (define)

**0 HIGH · 0 MED · 0 LOW** · model `client` · reviewed 2026-09-22T10:30:14.989Z

_No load-bearing premises were extracted._
