<!-- insrc:artifact DEF-b6c90b3e0240d36c -->

# Epic: The insrc daemon and the two IDE plugins (VS Code, JetBrains) update on independent schedules, and nothing keeps the daemon current relative to what a plugin expects.

**Flavor:** new-capability
**Seeded from:** `SPEC-85236f6960022cbc`

## Problem

The insrc daemon and the two IDE plugins (VS Code, JetBrains) update on independent schedules, and nothing keeps the daemon current relative to what a plugin expects. The daemon evolves as a rolling, unversioned codebase that a user advances by manually running the update script; a plugin, meanwhile, updates through its IDE's own marketplace channel. So a user can be running a fresh plugin against a stale daemon (or the reverse) with no in-IDE signal that the daemon has fallen behind, and no low-friction way to bring it current: today the only paths are to notice the drift themselves and run the update by hand, or to never update at all. Worse, when a plugin updates itself it does nothing about the daemon, so a plugin upgrade that assumes newer daemon behaviour can silently run against an old daemon. There is also no in-process way for a plugin to make the daemon update and come back: the daemon exposes no self-update-and-restart operation, so any update requires bypassing the live daemon entirely. The result is silent version drift between the two halves of the product, borne by the user, with no visibility and no one-click remedy from inside the IDE.

## Non-goals

- **Introducing a daemon version number / versioned releases or a self-reported semantic version compared against a published 'latest' manifest.** — The daemon deliberately ships as an unversioned rolling release (per the existing release model); freshness is judged purely by git-commit comparison, so a version scheme would be redundant surface to maintain on every daemon change.
- **A second approval prompt on the plugin-self-update path (the automatic daemon update triggered when the plugin itself updates).** — The user already approved the plugin update; a second dialog for what they experience as one 'update' action is friction. Only the startup-check path asks.
- **Adding any new daemon-autostart logic for the check.** — The check is opportunistic — it runs only when the plugin's existing connect flow already has the daemon reachable, and is skipped otherwise; starting the daemon just to check would be a surprising side effect of launching an IDE.
- **Plugin-side retry or rollback on a failed daemon update, on either path.** — The daemon owns its own lifecycle and state; a single failure notification with the raw error is surfaced and the daemon is left as-is, keeping the plugins thin and the failure semantics simple.
- **Throttling/caching the startup check, or a background periodic re-check during a session.** — The check is a lightweight remote git query and updates are infrequent + manual; an unconditional per-activation check is simplest and always fresh, and a background scheduler adds lifecycle surface for marginal gain.
- **The plugin's own update/restart blocking on the daemon update (synchronous/consolidated).** — A slow daemon rebuild must not extend the plugin's own restart latency; the daemon update is fire-and-forget with its own independent notification.
- **Plugins shelling out to daemon-ctl.sh directly or reimplementing the pull/rebuild/respawn sequence per-plugin.** — That breaks the IPC-only architectural rule and duplicates the nontrivial update sequence across two toolchains that can drift; the daemon owns the update capability once.
- **OS-level notifications, blocking startup modals, or a status-bar indicator for the 'update available' prompt.** — The prompt uses each IDE's native in-IDE notification idiom (which both plugins already have); OS toasts differ per platform, a modal is intrusive on every startup, and JetBrains has no status-bar surface.

## Assumptions

- `high` The daemon is a git working copy (cloned under the user's insrc home) whose default branch is the single upstream the update pulls from, so 'a daemon update is available' is exactly 'the installed HEAD commit differs from the remote default-branch commit'. [[c4]]
- `high` Both plugins already establish a daemon IPC connection as part of their normal activation flow, so the startup check can piggyback on an already-reachable daemon without adding autostart. [[c5]]
- `high` The existing daemon.status IPC is the natural additive surface for the daemon to report its installed git commit to a plugin over the socket. [[c3]]
- `high` The existing daemon-ctl.sh update sequence (fetch + fast-forward merge + rebuild, and its HEAD-vs-origin commit comparison) is the reusable core that a new daemon-owned update capability wraps, with self-restart/respawn added on top. [[c4]]

## Constraints

| ID | Type | Text | Source |
| :--- | :--- | :--- | :--- |
| `k1` | convention | Freshness is judged purely by git-commit comparison against the daemon repo's default branch — no daemon version number / versioned release / self-reported semver is introduced. | [[c6]] |
| `k2` | contract | The daemon owns the update+restart execution: both plugins invoke it through a single daemon-owned IPC (no shelling out to daemon-ctl.sh from the plugin, no per-plugin reimplementation of the pull/rebuild/respawn sequence) — the IPC-only architectural rule. | [[c2]] |
| `k3` | invariant | The daemon-owned update capability must perform UPDATE and RESTART — pull, rebuild, AND self-restart/respawn so the plugin reconnects to the fresh daemon. Restart-after-update over IPC is net-new (only daemon.shutdown exists today) and is the load-bearing part. | [[c2]] |
| `k4` | stakeholder | Only the startup-check path asks for the user's approval (an in-IDE Update/Dismiss notification). The plugin-self-update path triggers the daemon update automatically (notify-after), without a second prompt, and fire-and-forget (never blocking the plugin's own update/restart). | [[c1]] |
| `k5` | stakeholder | On a daemon-update failure (either path) the plugin surfaces a single failure notification with the raw error summary, leaves the daemon in whatever state the failed update left it, and does NOT retry or roll back — the daemon owns its own state. | [[c1]] |
| `k6` | stakeholder | The startup check runs on every plugin activation, unconditionally (no throttle/cache, no background re-check), but only opportunistically when the daemon is already reachable via the plugin's existing connect flow — no new autostart, and skipped for an activation where the daemon is unreachable. | [[c1]] |
| `k7` | stakeholder | The 'update available' notification uses each IDE's native in-IDE notification idiom with inline Update/Dismiss actions and no modal (VS Code showInformationMessage; JetBrains the insrc Notifications balloon) — not an OS toast, a startup modal, or a status-bar indicator. | [[c1]] |

## Stories

### E20260923b6c90b3e:S001 — Update and restart the daemon from a single request

**User value:** `size: L`

The daemon can bring itself current and restart in response to one in-process request, so any caller can update the daemon without bypassing it, shelling out to a script, or reimplementing the update sequence — and the caller can reconnect to the fresh daemon afterward.

**Acceptance criteria:**

- **ac1:** Given a running daemon whose repository has newer commits available upstream on its default branch, when the daemon receives a request to update itself, then the daemon brings itself current, rebuilds, and restarts so the caller can reconnect to the now-current daemon, and reports the update succeeded. _(operationalizes `k2`, `k3`)_
- **ac2:** Given a request to update the daemon, when the update cannot complete (the pull conflicts, the rebuild fails, or the restart does not come back), then the daemon reports a single failure with the underlying error and leaves itself in whatever state the failed update produced — it does not retry and does not roll back. _(operationalizes `k3`, `k5`)_
- **ac3:** Given a request to update the daemon, when the update runs, then the daemon itself performs the update+restart (the caller does not shell out to the update script or reimplement the pull/rebuild/restart sequence). _(operationalizes `k2`)_

### E20260923b6c90b3e:S002 — Report the daemon's installed commit for freshness checks

**User value:** `size: S`

A caller can read which build of the daemon is currently installed over the existing status channel, so it can tell whether the running daemon has fallen behind upstream without introducing any version scheme.

**Extends:** [[c3]]

**Acceptance criteria:**

- **ac1:** Given a running daemon, when a caller reads the daemon's status, then the status reports the daemon's currently-installed source commit, identifying the exact build in a way that can be compared against upstream. _(operationalizes `k1`)_

### E20260923b6c90b3e:S003 — Keep the daemon current from VS Code

**User value:** `size: M`

A VS Code user is told inside the IDE when their insrc daemon has fallen behind upstream and can bring it current in one click, and a VS Code plugin update also brings the daemon current — no manual script-running, no silent drift.

**Depends on:** `s1`, `s2`

**Extends:** [[c5]]

**Acceptance criteria:**

- **ac1:** Given the daemon is reachable when VS Code activates and its installed commit differs from the upstream default-branch commit, when the plugin activates, then the plugin shows an in-IDE notification that a daemon update is available with inline Update/Dismiss actions (no modal), and updates the daemon only if the user chooses Update. _(operationalizes `k1`, `k4`, `k6`, `k7`)_
- **ac2:** Given the daemon is either already up to date or not reachable when VS Code activates, when the plugin activates, then no update notification is shown and nothing is changed — the check is simply skipped for that activation (no daemon is started just to check). _(operationalizes `k6`)_
- **ac3:** Given a newly-updated version of the VS Code plugin activates for the first time, when it starts, then it triggers a daemon update automatically without asking for a second approval and without blocking its own startup, and informs the user afterward that the daemon was updated too. _(operationalizes `k4`)_
- **ac4:** Given an approved or self-update-triggered daemon update, when that update fails, then the plugin shows a single failure notification with the raw error and does not retry or roll back. _(operationalizes `k5`)_

### E20260923b6c90b3e:S004 — Keep the daemon current from JetBrains

**User value:** `size: M`

A JetBrains user is told inside the IDE when their insrc daemon has fallen behind upstream and can bring it current in one click, and a JetBrains plugin update also brings the daemon current — matching the VS Code behaviour for cross-plugin parity.

**Depends on:** `s1`, `s2`

**Extends:** [[c5]]

**Acceptance criteria:**

- **ac1:** Given the daemon is reachable when the JetBrains IDE activates the plugin and its installed commit differs from the upstream default-branch commit, when the plugin activates, then the plugin shows an in-IDE notification (balloon) that a daemon update is available with inline Update/Dismiss actions (no modal), and updates the daemon only if the user chooses Update. _(operationalizes `k1`, `k4`, `k6`, `k7`)_
- **ac2:** Given the daemon is either already up to date or not reachable when the plugin activates, when the plugin activates, then no update notification is shown and nothing is changed — the check is simply skipped for that activation (no daemon is started just to check). _(operationalizes `k6`)_
- **ac3:** Given a newly-updated version of the JetBrains plugin activates for the first time, when it starts, then it triggers a daemon update automatically without asking for a second approval and without blocking its own startup, and informs the user afterward that the daemon was updated too. _(operationalizes `k4`)_
- **ac4:** Given an approved or self-update-triggered daemon update, when that update fails, then the plugin shows a single failure notification with the raw error and does not retry or roll back. _(operationalizes `k5`)_

## Citations

- **[[c1]]** `prior-artifact` `Approved SPEC-85236f6960022cbc (brainstorm) — the 7 settled decisions + non-goals for the daemon-auto-update feature.` — "git-commit detection; automatic notify-after self-update; daemon-owned maintenance.update IPC doing pull+rebuild+respawn; in-IDE toast/balloon notify with inline Update/Dismiss; every-startup uncondit"
- **[[c2]]** `code` `src/daemon/index.ts — the daemon IPC handler map registers only daemon.{status,shutdown,backup,compact,debug-status}; no update/restart/respawn IPC exists (the update+self-restart capability is net-new).` — "The daemon handler map today has no maintenance.* / daemon.update / daemon.restart / daemon.respawn; only daemon.shutdown is a lifecycle op."
- **[[c3]]** `code` `src/daemon/index.ts:922 — the existing 'daemon.status' IPC handler (the additive surface for an installed-git-commit field).` — "'daemon.status': async () => { ... }"
- **[[c4]]** `code` `scripts/daemon-ctl.sh — the update sequence: git -C $DAEMON_ROOT fetch origin <branch> + merge --ff-only + rev-parse HEAD vs origin/branch (lines ~81-104).` — "git -C fetch origin <branch>; merge --ff-only; current=rev-parse HEAD, incoming=rev-parse origin/branch — the unversioned rolling-release + commit-comparison mechanism."
- **[[c5]]** `code` `vscode-plugin/src/daemon/controller.ts:16 (LifecycleAction 'update') + jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonLifecycleContracts.kt:45 (UPDATE→daemon-ctl.sh update) — both plugins' existing daemon-update action + connect flow.` — "VS Code LifecycleAction 'update'; JetBrains UPDATE -> daemon-ctl.sh update — the plugins already have a daemon-update action and an existing daemon-connect flow."
- **[[c6]]** `convention` `The existing release model — the daemon ships via daemon-ctl.sh update (git pull + rebuild), unversioned, not by cutting a versioned release.` — "daemon features ship via daemon-ctl.sh update, not by cutting a release."
