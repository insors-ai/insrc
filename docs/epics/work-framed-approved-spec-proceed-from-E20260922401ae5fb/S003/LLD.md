<!-- insrc:artifact LLD-401ae5fb7b8537cc-s3 -->

# LLD: E20260922401ae5fb:S003

**Epic:** `work-framed-approved-spec-proceed-from`
**HLD base run:** `wf-1790073320669-iy7sqb`
**HLD effective hash:** `790f3d6f5efd...`

## HLD context

**Framework:** The Epic re-expresses the shipped JetBrains settings + nested-pages surface on the VS Code side as two net-new injectable seams layered over the extension's existing sc1-sc7 contracts, following the exact S001-S006 convention: small VS-Code-free cores behind injected boundaries, with extension.ts the SOLE 'vscode' importer and every core unit-testable off the editor API via node:test. Editable config lives in native VS Code Settings (a statically-declared, machine-scoped contributes.configuration for the stable global + fixed per-role keys) driven by ONE ConfigSync engine that keeps the native surface truthful to the daemon (pull on activation/refresh, live-push each change with pre-flight validate and revert-on-reject). The read-only Daemon/Workflows/Debug pages and the per-repo editor live behind ONE WebviewPanelHost (a tabbed Detailed Status panel + a separate Repo Configuration panel) fed by a read-only DaemonData gateway over the existing daemon IPC. Everything reaches the daemon only through the existing config.catalog/config.write + read IPC via sc1; no new daemon capability is added.
**Rollout phase:** Phase B — Config editing complete (per-role + truthful sync)
**Consumes:** `sc8` (ConfigSync)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The exact set of stable global config keys declared in contributes.configuration (machine scope) and the mapping from config.catalog paths to those native keys; the last-synced snapshot representation; and the internal validate→write→revert mechanics of the ConfigSync engine. Only the sc8 ConfigSyncEngine + its injected boundary types are exposed; how the pull and the per-change diff are computed is private. — owns `sc8`
- `s2`: How the fixed RoleId taxonomy is enumerated into per-role tier-override keys and rendered as enum (core/mid/cheap) native settings, and how a role's effective tier (default vs override, clamped by coreFloor) is displayed. Consumes sc8 for the actual apply/truthful-sync; adds no new contract.
- `s4`: The status-bar item's 2-item QuickPick menu, the concrete Webview panel lifecycle, the in-panel tab framework + host↔webview postMessage protocol, the durable palette commands for both panels, and the DaemonDataGateway's concrete IPC/log/process-scan wiring. Only the sc9 WebviewPanelHost + DaemonDataGateway types are exposed; the panel internals are private. — owns `sc9`
- `s5`: The Daemon status view and the Workflows chain-report rendering inside their tabs, and each view's on-demand refresh control. Consumes sc9's host + gateway; adds no new contract and does no background polling.
- `s6`: The Debug tab: the MCP-clients list rendering, the continuous polling-ticker live log tail, and the consent-gated orphan-process cleanup via the shipped sc4 ConsentGate. Consumes sc9; the ticker + confirm UX are private.
- `s7`: The Repo Configuration panel's repo picker and the per-repo overrides editor form, plus its own per-repo config writes over the existing sc1 config.write. Consumes sc9 for the panel host + repo list; the form layout + per-repo write handling are private.

## Contract details

**Surface level:** internal-shared

### `ConfigSyncEngine.applyChanges`

```typescript
applyChanges(changed: readonly ChangedKey[]): Promise<void>
```

**Parameters:**
- `changed: readonly ChangedKey[]` — The native keys (with new values) that changed; unchanged sc8 signature.

**Returns:** `Promise<void>` — The EXISTING sc8 method, signature UNCHANGED. S003 adds the auto-revert branch INSIDE it: after the notifier.error on a rejected write (validation failure / daemon {ok:false} / rpc reject), the engine restores the setting to last-known-good — settings.write(key, lastSyncedSnapshot.get(key) ?? entry.option.default) — so the native surface never keeps a value the daemon didn't accept (ac1/k5). The toast (reason) was already produced; only the revert is new. Loop-suppressed by the existing idempotent-no-op guard (the reverted value equals the un-advanced snapshot). Where there is no last-known value, the engine sets lastSyncedSnapshot.set(key, option.default) before reverting so the echo is also a no-op.

**Errors:**
- `(revert write failure)` when settings.write during the revert rejects (rare host failure) — caught so applyChanges never throws; the toast still surfaced the rejection.

**Preconditions:**
- pullFromDaemon has run so lastSyncedSnapshot holds the last-known-good values.

**Postconditions:**
- A rejected key is reverted to the value the daemon holds (or the option default); a valid change is persisted; the surface stays truthful (k5).

### `ConfigSyncEngine.pullFromDaemon`

```typescript
pullFromDaemon(): Promise<void>
```

**Returns:** `Promise<void>` — The EXISTING sc8 reconcile method S003 drives on demand: it re-reads the daemon (config.catalog + config.show) and republishes the last-synced snapshot into the native settings, so external changes from another client are reconciled (ac2/k5). ac2's 'reactivate the extension' path is ALREADY the S001 activation pullFromDaemon; S003 adds the on-demand 'Refresh insrc settings' command that calls this same method. Never throws.

**Errors:**
- `(daemon unreachable)` when catalog()/rawConfig() rejects — caught + surfaced via Notifier; the mirror keeps its last-known values, and the Refresh command returns without error.

**Preconditions:**
- The extension is active and the engine is bound (S001).

**Postconditions:**
- Every insrc.* key reflects the daemon's current value; the snapshot equals what the daemon holds (k5).

### `CommandRegistry.register`

```typescript
register(descriptor: CommandDescriptor, run: () => Promise<void>): void
```

**Parameters:**
- `descriptor: CommandDescriptor = { id: InsrcCommandId; title: string }` — The 'insrc.settings.refresh' command with title 'Refresh insrc settings'; id added to the InsrcCommandId union.
- `run: () => Promise<void>` — The command body: () => configSync.pullFromDaemon() (the on-demand reconcile).

**Returns:** `void` — The EXISTING sc3 CommandRegistry (epic ad0d45c9, vscode-plugin/src/surfaces/command-registry.ts) that makes a command palette-reachable + auto-disposed. S003 registers 'insrc.settings.refresh' here in extension.ts beside the shipped registerDaemonCommands/registerHostCommands (k6). Duplicate-id throws (existing guard).

**Errors:**
- `(duplicate command id)` when 'insrc.settings.refresh' already registered — the existing sc3 guard throws; only fires on a programming error.

**Preconditions:**
- 'insrc.settings.refresh' added to the InsrcCommandId union + declared in package.json contributes.commands.

**Postconditions:**
- The Refresh command is first-class + palette-reachable (ac3/k6); its Disposable is in context.subscriptions.

### `InsrcCommandId`

```typescript
type InsrcCommandId = 'insrc.daemon.install' | ... | 'insrc.workspace.register' | 'insrc.settings.refresh'
```

**Returns:** `type InsrcCommandId (union)` — The EXISTING closed command-id union in vscode-plugin/src/surfaces/command-registry.ts (sc3, epic ad0d45c9). S003 ADDS the 'insrc.settings.refresh' member — a small additive edit to the shipped surface (not this epic's sc8). No existing member changes.

**Postconditions:**
- The new command id type-checks through createCommandRegistry.register + the sc3 duplicate-id guard.

### `SettingsStore.write`

```typescript
write(key: string, value: unknown): Promise<void>
```

**Parameters:**
- `key: string` — The native key to restore (the rejected key).
- `value: unknown` — The last-known-good value to write back (from lastSyncedSnapshot, or the option default).

**Returns:** `Promise<void>` — The EXISTING sc8 SettingsStore boundary (bound in extension.ts to workspace.getConfiguration().update at the Global/machine target). S003 uses it as the REVERT mechanism — writing the last-known-good value back restores the native setting. A revert to `undefined` (VS Code Reset Setting semantics) is used only when option.default is itself the target.

**Preconditions:**
- The insrc.* keys are declared machine-scoped (S001).

**Postconditions:**
- The reverted native value equals what the daemon holds; the revert write is loop-suppressed by the engine's idempotent guard.

### `config.write`

```typescript
'config.write': (params: { path: string | string[]; value: unknown }) => Promise<{ ok: boolean }>
```

**Parameters:**
- `path: string | string[]` — For the insrc.advanced escape-hatch: an arbitrary daemon config path (segment array) not covered by the static schema.
- `value: unknown` — The forward-compat value to persist.

**Returns:** `{ ok: boolean }` — The EXISTING daemon IPC (src/daemon/index.ts:1353) the insrc.advanced escape-hatch writes through — no new capability (k3). Rejection is surfaced + reverted by the same engine path.

**Errors:**
- `{ ok: false }` when Invalid/empty path — refused; reported + (for a mapped key) reverted.

**Preconditions:**
- Daemon reachable.

**Postconditions:**
- A forward-compat key is persisted via the existing IPC.

## Data model changes

### `vscode-plugin/src/config/sync-engine.ts createConfigSyncEngine.applyChanges (revert-on-reject branch)` — invariant-change

Behavioural addition INSIDE applyChanges (signature UNCHANGED, sc8 preserved): on every rejected-write path that currently only calls notifier.error (validation failure, daemon {ok:false}, rpc reject), ALSO revert — settings.write(change.key, lastSyncedSnapshot.get(change.key) ?? entry.option.default). Preserves the existing invariants: the snapshot is NOT advanced on a rejection, and the idempotent-no-op guard suppresses the revert echo. Realizes the k5 revert S001's LLD explicitly deferred to S003; the k5 invariant stays with the snapshot in the one engine.

```
// applyChanges: on reject -> notifier.error(...) + settings.write(key, lastSyncedSnapshot.get(key) ?? entry.option.default)
```

**Call sites:**
- `vscode-plugin/src/config/sync-engine.ts`

### `InsrcCommandId union + package.json contributes.commands (insrc.settings.refresh)` — field-add

Add 'insrc.settings.refresh' to the closed InsrcCommandId union (vscode-plugin/src/surfaces/command-registry.ts, sc3 / epic ad0d45c9) and a contributes.command entry { command:'insrc.settings.refresh', title:'Refresh insrc settings', category:'insrc' }. Additive to the shipped 7 commands; no existing command changes.

```
type InsrcCommandId = ... | 'insrc.settings.refresh'
```

**Call sites:**
- `vscode-plugin/src/surfaces/command-registry.ts`
- `vscode-plugin/package.json`
- `vscode-plugin/src/extension.ts`

### `vscode-plugin/package.json contributes.configuration (insrc.advanced escape-hatch)` — new

A single machine-scoped object setting `insrc.advanced` (JSON-schema type 'object', default {}) for daemon-version-drift forward-compat: leaves the user adds are written to the daemon via config.write (segment form) through the same engine path, so a newer daemon's keys are reachable without a plugin release. MINIMAL by design — write-through only; it is NOT a second raw-JSON editor for the statically-declared keys (those keep their typed widgets, S001/S002). scope:'machine' (k7).

**Call sites:**
- `vscode-plugin/package.json`
- `vscode-plugin/src/config/gateway.ts`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc8` | consumes | S003 CONSUMES the sc8 ConfigSyncEngine (owned by S001) and realizes the truthful-sync UX S001 explicitly deferred to it, WITHOUT changing the sc8 interface (applyChanges + pullFromDaemon signatures are unchanged — the revert is an internal behavioural addition where the snapshot lives, keeping the k5 invariant in the one engine). (1) Auto-revert: applyChanges, on a rejected write, writes lastSyncedSnapshot's last-known-good value back via the sc8 SettingsStore boundary; loop-suppressed by the existing idempotent-no-op guard (no new flag, no re-entrancy hole). (2) Reconcile: the new 'insrc.settings.refresh' durable command (registered via the shipped sc3 CommandRegistry, whose closed InsrcCommandId union gains the id additively — that is the ad0d45c9 epic's surface, not this epic's sc8) calls the existing sc8 pullFromDaemon; ac2's activation reconcile is already the S001 activation pull. (3) insrc.advanced escape-hatch writes via the existing config.write. NO sc8 signature change, NO new daemon capability (k3), and NO scope from s2 (per-role keys) or the panel track (s4-s7) is re-designed — only the deferred revert/refresh UX + the forward-compat escape-hatch are added. |

## Error paths

### Error cases

- **A config edit is rejected client-side (invalid value: wrong type / outside enumValues).** (recoverable)
  - Detection: applyChanges pre-flight-validates the ChangedKey against its ConfigOption (the existing S001 validateAgainstOption) BEFORE any write; an invalid value returns a reason.
  - Response: notifier.error(reason) (already shipped) AND the new S003 revert: settings.write(key, lastSyncedSnapshot.get(key) ?? entry.option.default) restores the native setting to what the daemon holds. The revert write re-enters applyChanges with the reverted value == the un-advanced snapshot -> idempotent no-op (no second toast, no daemon call).
  - User impact: The user sees why the edit was rejected and the setting snaps back to the daemon's actual value — the surface never shows an unaccepted value (ac1/k5).
- **The daemon rejects a config write ({ok:false} invalid path) or is unreachable (rpc reject) during applyChanges.** (recoverable)
  - Detection: ConfigGateway.writeKey/writeKeyPath resolves {ok:false} or the rpc rejects — the existing S001/S002 catch/inspect path.
  - Response: notifier.error('daemon rejected/unreachable ...') (shipped) AND revert to lastSyncedSnapshot.get(key). The snapshot is NOT advanced for the key, so the reverted value matches it -> idempotent no-op suppresses the echo.
  - User impact: The user is told the daemon rejected/couldn't take the edit and the setting reverts to the last-known-good — truthful (ac1/k5).
- **The Refresh command runs while the daemon is unreachable.** (recoverable)
  - Detection: pullFromDaemon's catalog()/rawConfig() rejects — caught inside pullFromDaemon (existing S001/S002 behavior).
  - Response: notifier.error surfaces the failure; the native mirror keeps its last-known values; the command run body's promise resolves without throwing (the sc3 registry awaits run()). No settings are changed.
  - User impact: The user is told the refresh couldn't reach the daemon; the view is unchanged (not falsely blanked); a later refresh reconciles. No data loss.
- **The revert's settings.write itself fails (a rare VS Code host failure).** (recoverable)
  - Detection: The revert settings.write promise rejects; applyChanges wraps the revert in try/catch (like the pull's per-key write).
  - Response: The failure is swallowed so applyChanges never throws (k1); the toast already surfaced the original rejection. The setting may transiently still show the bad value until the next pull/refresh reconciles it.
  - User impact: Worst case the bad value lingers until a refresh; the rejection reason was still shown. Rare; recoverable via Refresh.

### Edge cases

| Input | Expected |
| :--- | :--- |
| A rejected key has NO last-known value in lastSyncedSnapshot (e.g. its pull was skipped because rawConfig failed, or a hand-added key). | The revert falls back to entry.option.default, and the engine sets lastSyncedSnapshot.set(key, default) BEFORE the revert write so the revert echo (which carries the default) still hits the idempotent no-op guard — no unintended daemon write of the default. |
| The user edits a setting to the SAME value the daemon already holds (no real change). | The existing idempotent-no-op guard short-circuits applyChanges before any validate/write/revert — no toast, no revert, no daemon call (unchanged S001 behavior). |
| The Refresh command reconciles when another client changed a value the user has NOT locally edited. | pullFromDaemon republishes the daemon's current value into the native setting (overwriting the stale local mirror) and re-captures the snapshot — the pull's snapshot-published-before-writes keeps its own writes from echoing (S001 MED-1). The Settings view now matches the daemon (ac2). |
| insrc.advanced holds a leaf whose path the daemon config.write refuses (invalid path). | The write is reported via notifier.error like any other rejected write; the escape-hatch is write-through forward-compat only, so a refused leaf is surfaced, not silently dropped. (The escape-hatch does not participate in the typed-key revert since it is a free-form object.) |
| A revert restores a value equal to the option default where the daemon also holds the default. | settings.write(key, default) resets the native setting to its declared default (VS Code Reset semantics); effective value == daemon value; the pre-set snapshot suppresses the echo. Truthful. |

### Invariants to preserve

- The sc8 ConfigSyncEngine INTERFACE stays unchanged: applyChanges + pullFromDaemon keep their signatures (void). S003 only adds an internal revert branch + reuses pullFromDaemon; S001's global sync and S002's per-role sync (the 118 existing plugin tests) remain green (k1). The k5 revert stays with the snapshot in the one engine. [[c1]]
- The last-synced snapshot is the SINGLE source of the last-known-good value; a rejection NEVER advances it, so the revert always restores exactly what the daemon holds and the revert echo is a value-equality no-op (no explicit suppression flag, no re-entrancy window). The daemon's ~/.insrc/config.json remains the source of truth (lc1). [[c1]]
- The Refresh command reuses the EXISTING pullFromDaemon reconcile + the shipped sc3 CommandRegistry (palette-reachable, auto-disposed) and adds NO new daemon capability; the escape-hatch writes via the existing config.write (k3/k6). [[c3]]

## Test strategy

**Test framework:** `node:test (tsx --test 'src/**/__tests__/*.test.ts') — the same runner S001-S002 use for vscode-plugin/, driving the VS-Code-free engine over injected fakes (fake SettingsStore records writes / ConfigGateway scripted reject / Notifier captures reasons), plus manifest + command source-scans; no @types/vscode.`

### Test levels

- **unit** — Prove the auto-revert-on-reject inside applyChanges (ac1/k5) over the injected fakes.
  - Subjects: `applyChanges on an INVALID value reports the reason via Notifier AND writes the last-synced value back to the fake SettingsStore (the revert) — the setting is restored to what the daemon holds`, `applyChanges on a daemon {ok:false}/reject reports the reason AND reverts the SettingsStore key to the last-synced value; the snapshot is NOT advanced`, `the revert is loop-suppressed: re-applying the reverted value (the onDidChangeConfiguration echo) is an idempotent no-op — no second Notifier error, no second writeKey/writeKeyPath, no further revert`, `when the rejected key has NO last-synced value, the revert falls back to option.default and the engine pre-sets the snapshot so the default-echo is also a no-op (no unintended daemon write)`, `the revert's own settings.write failure is swallowed (applyChanges never throws) — the toast still fired`
- **unit** — Prove the reconcile path (ac2/k5) — pullFromDaemon reconciles external changes and the command drives it.
  - Subjects: `pullFromDaemon republishes the daemon's current values into the fake SettingsStore, overwriting a stale local value another client changed, and re-captures the snapshot (reconcile)`, `a Refresh runs pullFromDaemon; when the gateway rejects (daemon unreachable), no settings change + a Notifier error + no throw (the command resolves)`
- **unit** — Prove the Refresh command is a first-class, palette-reachable command (ac3/k6) via source + manifest scans.
  - Subjects: `package.json contributes.commands includes { command:'insrc.settings.refresh', title:'Refresh insrc settings', category:'insrc' } alongside the 7 shipped commands`, `the InsrcCommandId union in surfaces/command-registry.ts includes 'insrc.settings.refresh' (additive; the other 7 ids unchanged)`, `extension.ts registers 'insrc.settings.refresh' via the sc3 CommandRegistry with a body that calls configSync.pullFromDaemon()`, `source-scan: the config seam still imports no 'vscode' and the engine reaches the daemon only via config.catalog/config.write/config.show (k1/k2/k3 preserved)`
  - Fixtures: `a read of vscode-plugin/package.json + surfaces/command-registry.ts + extension.ts`
- **unit** — Guard the insrc.advanced escape-hatch (minimal forward-compat) + no regression to S001/S002.
  - Subjects: `package.json declares insrc.advanced as a machine-scoped object setting (type 'object', default {}, scope:'machine')`, `the full S001+S002 suite still passes unchanged (global sync + per-role sync green) — applyChanges/pullFromDaemon signatures unchanged (sc8 interface preserved)`
  - Fixtures: `the existing fake SettingsStore / ConfigGateway / Notifier from the S001/S002 suites`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: applyChanges on an invalid value reports the reason via Notifier AND reverts the SettingsStore to the last-synced value — proves 'shown the reason + restored to what the daemon holds'`, `unit: applyChanges on a daemon {ok:false}/unreachable reports + reverts to the last-synced value without advancing the snapshot; the revert is a loop-suppressed idempotent no-op`, `unit: the no-last-synced revert falls back to option.default with a pre-set snapshot (no unintended write)` |
| `ac2` | `unit: pullFromDaemon republishes the daemon's current values over a stale local value and re-captures the snapshot — proves the reconcile to daemon values`, `unit: the Refresh command body calls pullFromDaemon; a daemon-unreachable refresh notifies + changes nothing + does not throw` |
| `ac3` | `unit (manifest scan): package.json contributes.commands includes insrc.settings.refresh (title 'Refresh insrc settings') — proves a first-class palette command`, `unit (source scan): the InsrcCommandId union + extension.ts registration wire the command through the sc3 CommandRegistry to pullFromDaemon` |

## Alternatives considered

### a1: Revert inside the engine (applyChanges auto-reverts on reject), idempotent-guard loop-suppression; Refresh drives pullFromDaemon — **CHOSEN**

On a rejected write, applyChanges writes lastSyncedSnapshot.get(key) back into the SettingsStore (the auto-revert), loop-suppressed by the EXISTING idempotent-no-op guard; a new 'insrc.settings.refresh' durable command calls the existing pullFromDaemon; insrc.advanced is a minimal object escape-hatch.

The k5 auto-revert lives WITH the snapshot, inside the engine (the S001-sanctioned home): in applyChanges, after the notifier.error on a rejected write, the engine writes the last-known-good value back to the native setting — settings.write(key, lastSyncedSnapshot.get(key) ?? entry.option.default). No change to the sc8 ConfigSyncEngine.applyChanges signature (the revert is internal). Loop-suppression reuses the existing FIRST guard: the revert write fires onDidChangeConfiguration -> applyChanges([{key, revertedValue}]) -> revertedValue === lastSyncedSnapshot.get(key) -> idempotent no-op. Reconcile: ac2's activation reconcile is ALREADY the S001 activation pullFromDaemon; S003 adds the on-demand 'insrc.settings.refresh' command (via the sc3 CommandRegistry, extending its closed InsrcCommandId union additively + a package.json contributes.command) whose body is () => configSync.pullFromDaemon(). insrc.advanced: a single machine-scoped object setting, write-through forward-compat only.

### a2: Return-based revert: applyChanges returns rejected keys, extension.ts performs the revert

applyChanges returns an ApplyOutcome (the rejected keys); extension.ts's listener reverts each by re-writing from an engine-exposed last-known-good value, keeping the revert UX in the binding layer.

Change the sc8 ConfigSyncEngine.applyChanges signature to return a readonly RejectedKey[] (or ApplyOutcome), and expose the last-known-good value (a new engine method lastKnownValue(key) or exposing the snapshot). extension.ts's onDidChangeConfiguration listener, after awaiting applyChanges, reverts each rejected key via settings.write(key, engine.lastKnownValue(key)). The reconcile command + manifest + escape-hatch are as in a1.

**Rejected because:** Matches a1 on all acceptance criteria but is only PARTIAL on sc8: it changes applyChanges's signature and leaks the private snapshot for no functional gain, widening the blast radius to S001/S002 consumers. Worse than a1's internal, signature-preserving revert.

### a3: Explicit suppression-flag revert (isReverting guard) inside the engine

Like a1 but the engine sets an isReverting flag around the revert write so the re-entrant applyChanges is skipped wholesale, rather than relying on the idempotent value-equality guard.

As a1 (revert inside applyChanges, Refresh command, escape-hatch), but instead of relying on the idempotent-no-op guard for loop-suppression, the engine holds a private isReverting flag: it is set before the revert settings.write and cleared after, and applyChanges early-returns while it is set. This is the 'suppression-flag guard, the S006 pattern' the HLD riskyBits mention.

**Rejected because:** Adds a redundant mutable flag (the idempotent guard already suppresses the revert echo for every scalar value incl. NaN via Object.is) and its wholesale early-return introduces a re-entrancy window that can drop a concurrent edit — marginally weakening ac1/k5 truthfulness for no benefit over a1.

## Open questions

- insrc.advanced escape-hatch scope: S003 declares a minimal machine-scoped object setting whose leaves are write-through to config.write (forward-compat only), NOT a pulled/round-tripped raw-JSON editor. Confirm this minimal shape is acceptable, or defer the escape-hatch entirely to a later story (it is boundary-internal but not named in ac1/ac2/ac3).
- sc3 command-union edit: the Refresh command requires adding insrc.settings.refresh to the closed InsrcCommandId union in the shipped ad0d45c9 CommandRegistry (surfaces/command-registry.ts) — a small additive edit to another epic surface (not this epic sc8). Confirm at approval.

## Resolved questions

- `q1d25cad6` — insrc.advanced escape-hatch scope: S003 declares a minimal machine-scoped object setting whose leaves are write-through to config.write (forward-compat only), NOT a pulled/round-tripped raw-JSON editor. Confirm this minimal shape is acceptable, or defer the escape-hatch entirely to a later story (it is boundary-internal but not named in ac1/ac2/ac3).
  - **resolved**: Defer escape-hatch to a later story — No S003 AC names insrc.advanced, and a write-only-not-pulled setting would contradict S003's own truthful-sync (k5) guarantee — the shown value could drift from the daemon with no correction. S003 covers only ac1/ac2/ac3 (reject/revert/reconcile); a later story that names the escape-hatch in its ACs picks it up. _(2026-09-22T13:17:01.640Z)_

## Citations

- **[[c1]]** `code` `vscode-plugin/src/config/sync-engine.ts createConfigSyncEngine.applyChanges — today reports a rejection via Notifier + does NOT advance the snapshot + does NOT revert; the idempotent-no-op guard (Object.is vs lastSyncedSnapshot) is the S001 MED-1 loop-suppression S003 reuses for the revert echo`
- **[[c2]]** `code` `vscode-plugin/src/extension.ts — the onDidChangeConfiguration insrc listener that re-enters applyChanges (the revert echo path); the sole vscode importer where the Refresh command + engine bindings are wired`
- **[[c3]]** `code` `vscode-plugin/src/surfaces/command-registry.ts — sc3 CommandRegistry (epic ad0d45c9): createCommandRegistry.register + the CLOSED InsrcCommandId union S003 extends additively with insrc.settings.refresh (palette-reachable, k6)`
- **[[c4]]** `code` `src/daemon/index.ts:1353/:1358 config.write path:string|string[] — the existing IPC the insrc.advanced escape-hatch writes through (no new capability, k3)`
- **[[c5]]** `prior-artifact` `S001 LLD contractDetails — explicitly deferred the toast/auto-revert/loop-suppression UX and the Refresh command to S003; sc8 ConfigSyncEngine + SettingsStore/lastSyncedSnapshot are the sanctioned home for the k5 revert`
- **[[c6]]** `doc` `SPEC-d18668bb (approved brainstorm) — the insrc.advanced object escape-hatch is forward-compat only (daemon-version-drift), NOT a raw-JSON editor for the statically-declared keys`
