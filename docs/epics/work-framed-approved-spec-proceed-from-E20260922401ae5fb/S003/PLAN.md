<!-- insrc:artifact PLAN-401ae5fb7b8537cc-s3 -->

# Plan: E20260922401ae5fb:S003

**Epic:** `work-framed-approved-spec-proceed-from`
**LLD run:** `wf-1790082091322-pefqg6`
**LLD effective hash:** `790f3d6f5efd...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add the auto-revert-on-reject branch to the ConfigSyncEngine (sc8, no signature change) | M | — | unit: applyChanges on invalid-value / {ok:false} / rpc-reject reports the reason AND reverts the SettingsStore to the last-synced value, without advancing the snapshot; unit: the revert echo is a loop-suppressed idempotent no-op (no second toast/write); no-last-synced reverts to option.default with a pre-set snapshot; a revert-write failure is swallowed | [[c1]] |
| 2 | **`t2`** Add insrc.settings.refresh to the sc3 InsrcCommandId union + package.json contributes.commands | S | — | unit: manifest + union scan: package.json contributes.commands + the InsrcCommandId union both include insrc.settings.refresh, the 7 shipped commands/ids unchanged | [[c2]] |
| 3 | **`t3`** Register the Refresh command in extension.ts (drives pullFromDaemon) | S | `t2` | unit: source-scan: extension.ts registers insrc.settings.refresh via the sc3 CommandRegistry with a body calling configSync.pullFromDaemon() | [[c2]] |
| 4 | **`t4`** Add the revert + reconcile + command tests (extend the S001/S002 fakes) | M | `t1`, `t2`, `t3` | unit: reconcile units: pullFromDaemon republishes daemon values over a stale local value + re-captures the snapshot; a daemon-unreachable refresh notifies + changes nothing + does not throw; unit: seam source-scan: the config engine imports no 'vscode' and calls only config.catalog/config.write/config.show (k1/k2/k3); unit: deferral guard: package.json does NOT declare insrc.advanced in S003 (escape-hatch deferred to a later story) | [[c1]] [[c2]] |

### E20260922401ae5fb:S003:T001 — Add the auto-revert-on-reject branch to the ConfigSyncEngine (sc8, no signature change)

In vscode-plugin/src/config/sync-engine.ts, add a small shared revert helper called from all THREE rejected-write exits of applyChanges (invalid-value pre-flight, daemon {ok:false}, rpc reject): after the existing notifier.error, write the last-known-good value back — settings.write(change.key, lastSyncedSnapshot.get(change.key) ?? entry.option.default), wrapped in try/catch (never throws). When the key has no last-known value, pre-set lastSyncedSnapshot.set(key, option.default) BEFORE the revert so the echo is a no-op. The snapshot is NOT advanced on a rejection (unchanged) and the existing top-of-applyChanges idempotent-no-op guard suppresses the revert echo. applyChanges/pullFromDaemon signatures stay void (sc8 interface unchanged).

**Acceptance checks:**
- on an invalid value, a daemon {ok:false}, and an rpc reject, applyChanges calls notifier.error AND settings.write(key, last-known-good) — the setting is reverted; the snapshot is not advanced
- when the key has no last-synced value the revert uses option.default and pre-sets the snapshot; a revert settings.write failure is swallowed (applyChanges never throws)
- the sc8 applyChanges/pullFromDaemon signatures are unchanged and the 118 existing S001/S002 plugin tests still pass (k1)

### E20260922401ae5fb:S003:T002 — Add insrc.settings.refresh to the sc3 InsrcCommandId union + package.json contributes.commands

Add 'insrc.settings.refresh' to the closed InsrcCommandId union in vscode-plugin/src/surfaces/command-registry.ts (one additive member; the 7 shipped ids unchanged) and a contributes.command entry { command:'insrc.settings.refresh', title:'Refresh insrc settings', category:'insrc' } in vscode-plugin/package.json alongside the existing 7 commands.

**Acceptance checks:**
- InsrcCommandId includes 'insrc.settings.refresh' and tsc compiles; the other 7 ids are unchanged
- package.json contributes.commands has the insrc.settings.refresh entry (title 'Refresh insrc settings', category 'insrc') and remains valid JSON with the 7 shipped commands intact

### E20260922401ae5fb:S003:T003 — Register the Refresh command in extension.ts (drives pullFromDaemon)

In vscode-plugin/src/extension.ts (the sole 'vscode' importer), register the durable command via the existing sc3 CommandRegistry: commands.register({ id:'insrc.settings.refresh', title:'Refresh insrc settings' }, () => configSync.pullFromDaemon()) — beside the existing registerDaemonCommands/registerHostCommands/registerWorkspaceCommands calls, after configSync is constructed. No new listener, no new daemon capability; the command's Disposable lands in context.subscriptions.

**Acceptance checks:**
- extension.ts registers 'insrc.settings.refresh' through the sc3 CommandRegistry with a body that calls configSync.pullFromDaemon()
- the command is registered after configSync is built; activation still never throws/blocks and the existing 7 commands + status bar are unchanged (k1)

### E20260922401ae5fb:S003:T004 — Add the revert + reconcile + command tests (extend the S001/S002 fakes)

New node:test (tsx --test) coverage over the existing fakes: (a) revert units — applyChanges on invalid-value / {ok:false} / reject reports the reason AND reverts the fake SettingsStore to the last-synced value without advancing the snapshot; the revert echo is an idempotent no-op; the no-last-synced revert uses option.default with a pre-set snapshot; a revert-write failure is swallowed; (b) reconcile units — pullFromDaemon republishes daemon values over a stale local value + re-captures the snapshot, and a daemon-unreachable refresh notifies + changes nothing + does not throw; (c) command scans — manifest has insrc.settings.refresh, the InsrcCommandId union includes it, extension.ts wires it to pullFromDaemon; the config seam still imports no 'vscode' and calls only config.catalog/config.write/config.show; (d) a deferral guard — assert insrc.advanced is NOT declared in S003 (escape-hatch deferred).

**Acceptance checks:**
- the revert unit tests cover invalid-value/{ok:false}/reject revert + loop-suppressed echo + no-last-synced default + swallowed-failure, over the fake SettingsStore/ConfigGateway/Notifier
- the reconcile units + command manifest/source scans pass; the full vscode-plugin suite (S001+S002+S003) is green and tsc is clean

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| applyChanges on an INVALID value reports the reason via Notifier AND writes the last-synced value back to the fake SettingsStore (the revert) — the setting is restored to what the daemon holds | `t1`, `t4` |
| applyChanges on a daemon {ok:false}/reject reports the reason AND reverts the SettingsStore key to the last-synced value; the snapshot is NOT advanced | `t1`, `t4` |
| the revert is loop-suppressed: re-applying the reverted value (the onDidChangeConfiguration echo) is an idempotent no-op — no second Notifier error, no second writeKey/writeKeyPath, no further revert | `t1`, `t4` |
| when the rejected key has NO last-synced value, the revert falls back to option.default and the engine pre-sets the snapshot so the default-echo is also a no-op (no unintended daemon write) | `t1`, `t4` |
| the revert's own settings.write failure is swallowed (applyChanges never throws) — the toast still fired | `t1`, `t4` |
| pullFromDaemon republishes the daemon's current values into the fake SettingsStore, overwriting a stale local value another client changed, and re-captures the snapshot (reconcile) | `t4` |
| a Refresh runs pullFromDaemon; when the gateway rejects (daemon unreachable), no settings change + a Notifier error + no throw (the command resolves) | `t3`, `t4` |
| package.json contributes.commands includes { command:'insrc.settings.refresh', title:'Refresh insrc settings', category:'insrc' } alongside the 7 shipped commands | `t2`, `t4` |
| the InsrcCommandId union in surfaces/command-registry.ts includes 'insrc.settings.refresh' (additive; the other 7 ids unchanged) | `t2`, `t4` |
| extension.ts registers 'insrc.settings.refresh' via the sc3 CommandRegistry with a body that calls configSync.pullFromDaemon() | `t3`, `t4` |
| source-scan: the config seam still imports no 'vscode' and the engine reaches the daemon only via config.catalog/config.write/config.show (k1/k2/k3 preserved) | `t4` |
| package.json declares insrc.advanced as a machine-scoped object setting (type 'object', default {}, scope:'machine') | `t4` |
| the full S001+S002 suite still passes unchanged (global sync + per-role sync green) — applyChanges/pullFromDaemon signatures unchanged (sc8 interface preserved) | `t1`, `t4` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s3 contractDetails/invariants — the auto-revert-on-reject branch INSIDE createConfigSyncEngine.applyChanges (vscode-plugin/src/config/sync-engine.ts): settings.write(key, lastSyncedSnapshot.get(key) ?? option.default) on reject, loop-suppressed by the existing idempotent-no-op guard; sc8 signatures unchanged`
- **[[c2]]** `prior-artifact` `LLD s3 — the 'insrc.settings.refresh' durable command: an additive member of the sc3 InsrcCommandId union (vscode-plugin/src/surfaces/command-registry.ts) + a package.json contributes.command + extension.ts registration whose body calls configSync.pullFromDaemon() (k6, no new daemon capability)`
