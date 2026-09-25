<!-- insrc:artifact LLD-b29f5fb26f3bd9fe-S001 -->

# LLD: E20260925b29f5fb2:S001

**Epic:** `after-daemon-self-update-actually-changes`
**HLD base run:** `wf-1790331939226-pgnorf`
**HLD effective hash:** `b29f5fb26f3b...`

## HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## Contract details

**Surface level:** internal

### `performUpdate (VS Code, daemon-freshness.ts)`

```typescript
async function performUpdate(deps: DaemonFreshnessDeps, priorCommit: string): Promise<void>
```

**Parameters:**
- `deps: DaemonFreshnessDeps` — Existing seam bag; gains an optional reloadWindow seam (see dataModel).
- `priorCommit: string` — Pre-update installed commit; the success branch is reached only when the installed commit advanced past it.

**Returns:** `Promise<void>` — Unchanged shape. Behaviour change: on the confirmUpdate-SUCCESS branch (currently notify('insrc daemon updated successfully.')), instead notify the MCP-reload nudge with a 'Reload Window' action; if the returned choice === 'Reload Window' and deps.reloadWindow is present, await deps.reloadWindow(). The failure branch is unchanged.

**Errors:**
- `none (best-effort)` when A reloadWindow rejection is swallowed/logged like the existing best-effort notify path; never throws out of the freshness check.

**Preconditions:**
- Reached only on a confirmed update (installed commit advanced past priorCommit) — the fire-once-per-real-update condition is inherited, not re-implemented

**Postconditions:**
- The user sees a single nudge naming the remedy (reload window / restart claude|codex session); choosing Reload Window reloads the window
- No nudge on a no-op/failed update

### `performUpdate (JetBrains, DaemonFreshnessFlow.kt)`

```typescript
private fun performUpdate(deps: FreshnessDeps, priorCommit: String)
```

**Parameters:**
- `deps: FreshnessDeps` — Existing seam bag (gateway/notify/version store); unchanged shape.
- `priorCommit: String` — Pre-update installed commit for the success check.

**Returns:** `Unit` — Behaviour change: on the success branch (currently notify.show(INFO, "insrc: the daemon was updated.", null)), change the message to the MCP-reload nudge naming the remedy ('restart your claude or codex session to refresh the insrc MCP connection'); keep the action slot null (notification-only — no misleading forced restart).

**Errors:**
- `none` when Notification-only; no action path, so no EDT/threading hazard is introduced.

**Preconditions:**
- Reached only on a confirmed update (fresh updateOutcome or installed commit advanced); setLastSeen fires once per version so the nudge shows at most once per self-update

**Postconditions:**
- A single INFO balloon naming the remedy; no action button; no nudge on no-op/failed update

## Data model changes

### `DaemonFreshnessDeps.reloadWindow (vscode-plugin/src/freshness/daemon-freshness.ts)` — field-add

Add an OPTIONAL reload seam so the nudge's 'Reload Window' action is testable + prod-wired without importing vscode into the pure flow. Production injects () => executeCommand('workbench.action.reloadWindow'); tests inject a capturing fake; when omitted, the nudge is notification-only.

```
  export interface DaemonFreshnessDeps {
    // ...existing: client, notify, versionState...
+   readonly reloadWindow?: () => Promise<void>;
  }
```

**Call sites:**
- `vscode-plugin/src/freshness/daemon-freshness.ts`

## Error paths

### Error cases

- **VS Code: the Reload Window command fails / reloadWindow seam rejects** (recoverable)
  - Detection: The awaited deps.reloadWindow() promise rejects (executeCommand throws) inside the success branch's action handler.
  - Response: Catch + best-effort log (mirroring the existing best-effort notify path); the freshness check still returns normally — the nudge already showed, so the user can reload manually.
  - User impact: Window doesn't auto-reload; the user reloads manually per the message. No crash.
- **The user dismisses the notification without choosing Reload Window** (recoverable)
  - Detection: notify(...) resolves to undefined (no action chosen).
  - Response: Do nothing — no reload; the MCP server stays stale until the user reloads/restarts their session later.
  - User impact: Expected: the nudge was informational; the stale MCP persists until the user acts.

### Edge cases

| Input | Expected |
| :--- | :--- |
| deps.reloadWindow is omitted (undefined) in VS Code | The nudge is shown notification-only (the 'Reload Window' action is not offered, or offered but a no-op guard skips the seam) — no crash; matches the notification-only fallback. |
| Update ran but was a no-op (installed commit did NOT change) | The success branch is NOT reached (confirmUpdate requires the commit to advance), so NO nudge fires — fire-only-on-real-update. |
| Update FAILED (reconnect budget exceeded / updateOutcome=failed) | The failure branch fires its existing failure message; the reload nudge does NOT fire. |
| The self-update path already ran this plugin version (setLastSeen recorded) | The freshness check does not re-enter the self-update path, so the nudge fires at most once per version — no repeat balloons. |
| JetBrains success branch | A single INFO balloon with the reload/restart-your-session message and NO action button (notification-only). |

### Invariants to preserve

- Fire-once / real-update-only: the nudge must fire ONLY on the confirmed update-success branch (installed commit advanced past priorCommit) and at most once per plugin version (setLastSeen on every terminal path) — never on a no-op or failed update. [[c1]]
- k5 failure semantics unchanged: the update FAILURE path and its failure balloon are not altered; the nudge is additive to the SUCCESS branch only. [[c2]]
- No new daemon IPC / no daemon change: the nudge reuses each plugin's existing notify seam + status/updateOutcome gateway; the daemon side is untouched. [[c3]]
- JetBrains stays notification-only on this path (no NotificationAction) so no off-EDT action-threading hazard is introduced (the S004 review had to fix exactly that for the balloon Update action). [[c4]]

## Test strategy

**Test framework:** `VS Code: node:test (tsx --test) + node:assert/strict over injected seams (the daemon-freshness / extension-wiring test convention). JetBrains: JUnit5 over seam-injected FreshnessDeps + a capturing NotifyPort fake (the DaemonFreshnessFlow test convention).`

### Test levels

- **unit** — VS Code: prove runDaemonFreshnessCheck's update-success branch emits the MCP-reload nudge with a 'Reload Window' action and invokes the reloadWindow seam only when chosen, over injected client/notify/versionState/reloadWindow fakes.
  - Subjects: `on a confirmed update (installed commit advanced), notify is called with the reload-nudge message AND a 'Reload Window' action`, `when notify resolves to 'Reload Window' and deps.reloadWindow is set, deps.reloadWindow() is invoked exactly once`, `when notify resolves to undefined (dismissed), deps.reloadWindow() is NOT invoked`, `when deps.reloadWindow is omitted, no crash (notification-only)`, `a reloadWindow rejection is swallowed — runDaemonFreshnessCheck still resolves`, `no nudge on a no-op update (commit unchanged) or a failed update`
  - Fixtures: `Existing daemon-freshness test fakes (client.status/installedCommit, capturing notify returning a scripted choice, versionState) + a capturing reloadWindow fake`
- **unit** — JetBrains: prove DaemonFreshnessFlow's success branch shows a single INFO balloon carrying the reload/restart-session message and NO action, once per version, only on a real update.
  - Subjects: `on a confirmed update, notify.show is called with NotifyKind.INFO + the reload-nudge message + null action`, `no nudge on a no-op update (commit unchanged) or a failed update (failure balloon instead)`, `the nudge fires at most once per plugin version (setLastSeen gating)`
  - Fixtures: `Existing DaemonFreshnessFlow FreshnessDeps fakes (gateway update/updateOutcome/installedCommit, capturing NotifyPort recording show(kind,msg,action), version store)`
- **integration** — VS Code source/wiring: the production DaemonFreshnessDeps wires reloadWindow to executeCommand('workbench.action.reloadWindow') (a wiring/source-scan test, since the real vscode command host isn't available headlessly — same rationale as the existing extension-wiring test).
  - Subjects: `extension wiring passes a reloadWindow seam that calls workbench.action.reloadWindow`
  - Fixtures: `Extend vscode-plugin/src/freshness/__tests__/extension-wiring.test.ts`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `VS Code unit: success branch notifies the reload nudge + 'Reload Window' action`, `JetBrains unit: success branch shows INFO nudge message (notification-only)` |
| `ac2` | `VS Code unit: choosing 'Reload Window' invokes reloadWindow() once; dismiss does not`, `VS Code integration: production wires reloadWindow -> workbench.action.reloadWindow` |
| `ac3` | `VS Code unit: no nudge on no-op/failed update`, `JetBrains unit: no nudge on no-op/failed update + fires at most once per version` |
| `ac4` | `VS Code unit: reloadWindow omitted -> notification-only, no crash`, `VS Code unit: reloadWindow rejection is swallowed` |

## Migration

**State before:** On a confirmed daemon self-update, VS Code daemon-freshness.ts fires notify('insrc daemon updated successfully.') (~:194) and JetBrains DaemonFreshnessFlow.kt fires notify.show(INFO, "insrc: the daemon was updated.", null) (~:128). Neither tells the user that the running claude/codex MCP server is now stale against the new build, and neither offers a reload — so a long-lived session keeps the old insrc-mcp until the user happens to reload.

**State after:** Both success messages become an MCP-reload nudge naming the remedy. VS Code adds an optional reloadWindow seam to DaemonFreshnessDeps and offers a 'Reload Window' action (invokes executeCommand('workbench.action.reloadWindow') on choice; notification-only if the seam is absent). JetBrains changes the success message to the nudge text, notification-only (no action). Fire-once-per-real-update is inherited from the existing success gating; the failure path is unchanged.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the optional reloadWindow seam to VS Code DaemonFreshnessDeps and change the success branch to notify the reload nudge + 'Reload Window' action, invoking the seam on choice (best-effort, swallow rejection). — ↩ rollbackable
2. Wire the production reloadWindow seam in the VS Code extension activation to executeCommand('workbench.action.reloadWindow'). — ↩ rollbackable
3. Change the JetBrains success-branch message (DaemonFreshnessFlow.performUpdate) to the reload nudge text, keeping the action slot null (notification-only). — ↩ rollbackable
4. Extend the VS Code + JetBrains freshness unit tests (and the VS Code extension-wiring source-scan) to assert the nudge message + VS Code action/seam behaviour + fire-once/no-op guards. — ↩ rollbackable

**Backward compat:** reloadWindow is added as an OPTIONAL field on DaemonFreshnessDeps, so every existing constructor/test of DaemonFreshnessDeps keeps compiling (omit → notification-only). No public/exported signature changes: performUpdate/runDaemonFreshnessCheck keep their signatures; the JetBrains FreshnessDeps shape is unchanged (only the message string changes). No daemon IPC / wire / persisted-state change. The only user-visible change is the wording of the post-update success notification + a new optional VS Code action.

## Alternatives considered

### a1: In-place nudge on the existing success path; VS Code gets a Reload action, JetBrains notification-only — **CHOSEN**

On each freshness flow's update-SUCCESS branch, replace the bland 'updated' message with the MCP-reload nudge; VS Code offers a 'Reload Window' action via a new reload() seam, JetBrains is notification-only with guidance text.

VS Code (daemon-freshness.ts): add a reloadWindow?: () => Promise<void> seam to DaemonFreshnessDeps (prod = executeCommand('workbench.action.reloadWindow')); on the confirmUpdate-success branch call notify(nudgeMsg, 'Reload Window') and, if the returned choice is 'Reload Window', invoke the seam. JetBrains (DaemonFreshnessFlow.kt): on the success branch pass the nudge message to notify.show(INFO, msg, null) — notification-only. Both messages name the real remedy. Fire-once inherited from the existing success gating.

### a2: Extract a per-plugin ReloadMcpNudge helper

Introduce a small dedicated nudge unit in each plugin that the freshness flow calls on success, encapsulating message + action + reload seam.

Add a ReloadMcpNudge (TS) / ReloadMcpNudge.kt (Kotlin) owning the message + host reload action + availability gating; the freshness success branch delegates to it.

**Rejected because:** dc3 PARTIAL: adds a new unit + wiring per plugin for a 3-line notify, duplicating the freshness flow's existing seam-injected test harness (YAGNI, no reuse consumer yet). Rank 3.

### a3: Actionable on both: VS Code Reload Window + JetBrains Restart IDE

Same as a1 but JetBrains also offers a 'Restart IDE' NotificationAction (ApplicationManager restart).

VS Code as in a1; JetBrains passes a 'Restart IDE' NotificationAction that calls ApplicationManagerEx.restartApplication (off-EDT).

**Rejected because:** dc2 VIOLATES: a full IDE restart is heavy and may not even recycle a terminal/external claude|codex session, so the action misleads; also reintroduces the off-EDT restart-action hazard the S004 review had to fix (dc3 partial). Rank 2.

## Citations

- **[[c1]]** `analyze-bundle` `vscode-plugin/src/freshness/daemon-freshness.ts + jetbrains-plugin/.../freshness/DaemonFreshnessFlow.kt` — "confirmUpdate proves success by the installed commit advancing past priorCommit; setLastSeen runs on every terminal path so the self-update path fires at most once per plugin version."
- **[[c2]]** `analyze-bundle` `vscode-plugin/src/freshness/daemon-freshness.ts` — "The failure branch fires its existing failure message; the nudge attaches to the SUCCESS branch only (~:194)."
- **[[c3]]** `analyze-bundle` `vscode-plugin/src/freshness/daemon-freshness.ts + jetbrains-plugin/.../freshness/DaemonFreshnessFlow.kt` — "The nudge reuses each plugin's existing notify seam + status/updateOutcome gateway — no new daemon IPC."
- **[[c4]]** `prior-artifact` `daemon-auto-update epic S004 (JetBrains freshness flow) cold review` — "The balloon Update NotificationAction ran the blocking update+reconnect on the EDT → IDE freeze; fixed by off-EDT re-dispatch. Notification-only avoids that hazard."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 7 LOW** · model `client` · reviewed 2026-09-25T10:32:10.742Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| cl1 | citation | LOW | auto | VS Code daemon-freshness.ts performUpdate has a success branch that currently calls deps.notify('insrc daemon updated successfully.') — the point the nudge attaches to. | Confirmed: 'updated successfully' present + performUpdate at daemon-freshness.ts; read :194 confirmed the success-branch notify. | Confirmed — no change needed. |
| cl2 | citation | LOW | auto | JetBrains DaemonFreshnessFlow.kt performUpdate success branch currently calls deps.notify.show(NotifyKind.INFO, "insrc: the daemon was updated.", null) — the 3rd arg is a nullable action slot. | Confirmed: 'the daemon was updated' + fun performUpdate + NotifyKind; read :128 confirmed the success-branch notify.show(INFO, msg, null). | Confirmed — no change needed. |
| cl3 | semantic | LOW | auto | The VS Code success branch is reached only when the installed commit advanced past priorCommit (confirmUpdate), so it already implies a real update — the nudge's fire-only-on-real-update gating is inherited. | Confirmed: confirmUpdate + a literal `installedCommit !== priorCommit` check gate the VS Code success branch on a real commit advance. | Confirmed — no change needed. |
| cl4 | citation | LOW | auto | The VS Code notify seam FreshnessNotify is (message: string, ...actions: string[]) => Promise<string \| undefined>, so a 'Reload Window' action + choice handling is expressible without a new API. | Confirmed: type FreshnessNotify with actions: string[] => Promise<string\|undefined> at :49 — a 'Reload Window' action + choice handling needs no new API. | Confirmed — no change needed. |
| cl5 | semantic | LOW | auto | DaemonFreshnessDeps is the injected seam bag and does NOT currently carry a reloadWindow field (so adding it as optional is additive/backward-compatible). | Confirmed: interface DaemonFreshnessDeps exists and has 0 reloadWindow occurrences — so adding it OPTIONAL is additive/backward-compatible. | Confirmed — no change needed. |
| cl6 | semantic | LOW | auto | JetBrains fires the self-update path at most once per plugin version because setLastSeen runs on every terminal path. | Confirmed: setLastSeen present (9 hits) — the self-update path is once-per-version, so the nudge inherits fire-once. | Confirmed — no change needed. |
| cl7 | citation | LOW | assisted | The VS Code freshness extension-wiring test exists (the source-scan home to extend for the reloadWindow production wiring). | The extension-wiring test file exists (:1 confirmed). The symbol grep (reloadWindow\|runDaemonFreshnessCheck\|DaemonFreshnessDeps) returned 0 — the wiring test references the flow via other names (or reloadWindow doesn't exist yet, which is expected). Non-blocking: the build will add the reloadWindow wiring assertion here. | Confirmed the file is the right home; the build adds the assertion. |
