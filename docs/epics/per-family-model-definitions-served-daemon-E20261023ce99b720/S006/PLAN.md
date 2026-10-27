<!-- insrc:artifact PLAN-ce99b72065d03b1b-s6 -->

# Plan: E20261026ce99b720:S006

## Summary

**Epic:** `per-family-model-definitions-served-daemon`
**LLD run:** `wf-1793038432316-b0ej0d`
**LLD effective hash:** `c324f041e3e7...`

Building s6 moves the VS Code extension's model settings onto the daemon's definitions: config writes report the daemon's reasons and 'restart to apply', a restart helper reports whether the daemon really came back, the native settings stop carrying built-in model lists and native tier edits are validated against the definitions and written whole, the 'Set model tier' picker offers only what the daemon lists and checks an unlisted model before it can be saved, and the Repo Configuration panel edits only role tiers and the core floor. All of it is VS-Code-free modules with injected seams, tested over fakes and the real manifest.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Config write results carry the daemon's answer | S | — | unit: gateway.test.ts: writeKey and writeKeyPath pass through the daemon's restartRequired, reason and detail, and fall back to 'refused' for a bare { ok:false } | [[c2]] [[c7]] |
| 2 | **`t2`** Restart adapter that reports the lifecycle result | S | — | integration: commands.test.ts: restartDaemonAndReport resolves true only when the daemon is running again and reflects the result like the restart command | [[c5]] [[c8]] |
| 3 | **`t3`** Native settings without built-in model lists; key map from the manifest | M | — | unit: key-map.test.ts: buildConfigKeyMap over a manifest fixture takes type / enum / default from the manifest, maps tier keys as plain strings, skips plugin-local keys, and key-map.ts does not import the settings catalog; unit: manifest-catalog.test.ts: package.json contributes every catalog row, the tier rows without enum and with default ''; unit: sync-manifest-catalog.test.ts: the committed manifest is in sync with the generator and the generator is idempotent; smoke: vscode-bundle-catalog.test.ts: the extension type-checks and bundles without the settings catalog | [[c4]] [[c7]] [[c10]] |
| 4 | **`t4`** Native tier edits validated against the definitions and written whole | L | `t1`, `t2`, `t3` | integration: manifest-key-map-engine.test.ts: native tier edits over the real merged key map are validated against the definitions and written whole; invalid edits revert; restartRequired calls onRestartRequired once; integration: sync-engine.test.ts and per-role-engine.test.ts: existing engine behaviour unchanged | [[c6]] [[c7]] [[c8]] |
| 5 | **`t5`** Model tier picker on the definitions with whole-tier writes | M | `t1`, `t2` | unit: model-tier-picker.test.ts: the family, model and effort steps offer exactly the fake answer's options and a pick writes the whole tier once; request failures are classified; unit: model-tier-picker.test.ts: model-tier-picker.ts names no runner or model literal and imports nothing from src/config | [[c1]] [[c8]] [[c9]] |
| 6 | **`t6`** Unknown-model check, approval and restart before save | M | `t5` | unit: model-tier-picker.test.ts: unknown model — check results shown; approve writes nothing; the tier is written only after a successful restart; reject writes nothing; runs:false offers no approve | [[c1]] [[c8]] [[c9]] |
| 7 | **`t7`** Repo Configuration panel limited to role tiers and the core floor | M | `t1`, `t2` | unit: repo-config.test.ts: the form has role tier selects and a coreFloor select only; the handler writes tasks / coreFloor after consent, drops tiers writes, shows reason and detail and offers a restart | [[c3]] [[c8]] |

### 1.1 E20261026ce99b720:S006:T001 — Config write results carry the daemon's answer

createDaemonConfigGateway's writeKey / writeKeyPath return the daemon's config.write answer: restartRequired on success, and on refusal the daemon's reason and detail (falling back to 'refused' for an older daemon); ConfigWriteResult in vscode-plugin/src/config/types.ts gains restartRequired and detail. Existing callers keep reading ok and reason.

**Acceptance checks:**
- A daemon answer { ok:true, restartRequired:true } reaches the caller with restartRequired
- A refusal { ok:false, reason:'rejected-model', detail } reaches the caller with that reason and detail; a bare { ok:false } gives reason 'refused'
- A socket failure still rejects
- Existing sync-engine, repo-config and picker tests pass

### 1.2 E20261026ce99b720:S006:T002 — Restart adapter that reports the lifecycle result

New restartDaemonAndReport({ controller, status }) beside registerDaemonCommands in vscode-plugin/src/daemon/commands.ts: runs controller.run('restart'), reflects the result on the status surface as the restart command does, resolves true only for ok and state 'running'.

**Acceptance checks:**
- Resolves true only for { ok:true, state:'running' }
- Resolves false for not ok, a stopped or errored state, or a rejecting controller
- The status surface shows the same outcome the insrc.daemon.restart command shows; the command's behaviour is unchanged

### 1.3 E20261026ce99b720:S006:T003 — Native settings without built-in model lists; key map from the manifest

The manifest generator (vscode-plugin/scripts/sync-manifest-catalog.mjs) writes the models.tiers.* rows with no enum and default '' (description points to the daemon's definitions and 'insrc: Set model tier') and takes the plugin-local rule from an exported isPluginLocalKey in vscode-plugin/src/config/key-map.ts; package.json is regenerated. buildConfigKeyMap builds its entries from the manifest's contributed properties (type, enum, default) instead of importing CONFIG_CATALOG, skipping plugin-local keys; MERGED_KEY_MAP keeps its shape. The manifest / bundle contract tests are updated.

**Acceptance checks:**
- vscode-plugin/src/config/key-map.ts imports nothing from src/config/config-catalog.ts
- The manifest's tier rows have no enum and default ''; every other catalog row matches the catalog
- The key map has one entry per catalog-backed manifest key (tier keys included as plain strings) and none for insrc.chat.* or the manifest's per-role keys
- sync-manifest-catalog --check passes on the regenerated package.json; the extension type-checks and bundles

### 1.4 E20261026ce99b720:S006:T004 — Native tier edits validated against the definitions and written whole

createConfigSyncEngine gains definitions() and onRestartRequired(keys) deps. A change to an insrc.models.tiers.<tier> key is checked against models.definitions (runner a family; model an id or alias of it, or empty -> the family's default for the tier; effort '' or one the model takes, dropped on a family switch) and written once as the whole tier; an invalid edit is reverted with a message (an unlisted CLI model points to 'insrc: Set model tier'); a definitions failure reverts with its classified message. Refusals carry the daemon's detail; restartRequired after a batch calls onRestartRequired once. extension.ts binds definitions() and onRestartRequired (notice with a 'Restart daemon' action calling restartDaemonAndReport).

**Acceptance checks:**
- A native tier edit to a served model writes ONE whole tier at ['models','tiers',tier] and updates the native keys to the written values
- A runner-only change writes the new family's default model and drops an effort it does not take
- An unserved model, a wrong-family model or an untaken effort writes nothing and the changed key is reverted with its message
- definitions() rejecting reverts the edit with the classified message
- A write answering restartRequired calls onRestartRequired once per batch; a refusal's message includes the daemon's detail
- Non-tier keys sync exactly as before (existing engine tests pass)

### 1.5 E20261026ce99b720:S006:T005 — Model tier picker on the definitions with whole-tier writes

runSetModelTier takes definitions / rawConfig / writeKeyPath / restartDaemon / pick / notify seams: family, model and effort steps from models.definitions (current tier = config.show overlaid on the default family's tierDefaults), one whole-tier write at ['models','tiers',tier], refusals as '<reason> — <detail>', restartRequired with a 'Restart daemon' action (restartDaemonAndReport), and the four classified request failures (not running, disconnected, 'unknown method: …', other). The ModelProvider / PROVIDERS / CONFIG_CATALOG lookups go; the vscode.d.ts stub gains canPickMany; extension.ts binds the seams; tier-effort.test.ts is removed.

**Acceptance checks:**
- The family, model and effort steps offer exactly a fake answer's options (aliases, user-approved and not-installed marks) and a pick writes the whole tier once
- An Ollama family offers no typed-id entry; a stale configured model is marked and not selectable
- 'daemon is not running', a disconnect, 'unknown method: …' and a plain error each give their own message and write nothing
- model-tier-picker.ts names no runner or model literal and imports nothing from src/config

### 1.6 E20261026ce99b720:S006:T006 — Unknown-model check, approval and restart before save

'Enter another model id…' for a CLI family: an id or alias of the family saves as a normal pick; an unserved id runs models.check (claimed efforts default to the family's effort names) -> a QuickPick of each level's verdict and evidence -> a multi-select of the non-rejected levels -> Approve / Reject. Approve calls models.approve and saves nothing; the tier is written only after restartDaemon() resolves true, never re-approving; Reject calls models.reject; runs:false or { error } offers no approve (an already-served id re-reads the definitions and is offered as a pick); unknown-check offers 'Check again'; a disconnected approve reports 'outcome unknown'. The vscode.d.ts stub gains showInputBox and extension.ts binds check / approve / reject / input.

**Acceptance checks:**
- An unserved CLI id calls check with the family's effort names and shows each level's verdict and evidence; only non-rejected levels can be chosen
- Approve writes nothing; the tier is written only after restartDaemon() resolves true; a failed restart writes nothing and a retry does not approve again
- Reject writes nothing; runs:false or { error } offers no approve; a typed alias saves without a check

### 1.7 E20261026ce99b720:S006:T007 — Repo Configuration panel limited to role tiers and the core floor

renderRepoConfig renders a select per taxonomy role (global / core / mid / cheap, from tasks) and a coreFloor select, with no runner, model or effort field; createRepoConfigWriteHandler accepts only ['tasks', roleId] and ['coreFloor'] writes (others dropped with a warning before consent), shows the daemon's reason and detail, and on restartRequired calls offerRestart (bound in extension.ts to a 'Restart daemon' action using restartDaemonAndReport).

**Acceptance checks:**
- The form has a role-tier select per taxonomy role and a coreFloor select, and no tiers field
- tasks and coreFloor writes reach writeKeyPath under ['models','byRepo',repo] after consent; a ['tiers', …] write is dropped without a prompt
- A refusal shows reason and detail; restartRequired calls offerRestart

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| vscode-plugin/src/models/__tests__/model-tier-picker.test.ts: the family, model and effort steps offer exactly the fake answer's families, its models (with aliases, '(user-approved)' and '(not installed)' marks) and '' plus the chosen model's efforts; a pick makes ONE writeKeyPath(['models','tiers',tier], { runner, model, effort }); an Ollama family offers no 'Enter another model id…'; a typed alias resolves to the canonical id and saves without a check; a stale configured model is marked and not selectable; a refusal shows '<reason> — <detail>' and restartRequired offers 'Restart daemon'; definitions rejecting with 'daemon is not running', a DaemonDisconnectedError, 'unknown method: models.definitions' and a plain handler error each give their own message (only the unknown-method one says to update the daemon) and write nothing | `t5` |
| vscode-plugin/src/models/__tests__/model-tier-picker.test.ts: unknown model — an unserved CLI id calls check with the family's effort names, shows each level's verdict and evidence, offers only non-rejected levels; Approve calls approve with the chosen levels and writes nothing; the tier is written only after restartDaemon() resolves true; a failed restart writes nothing and a retry does not approve again; Reject calls reject and writes nothing; runs:false or { error } offers no Approve; unknown-check offers 'Check again'; a disconnected approve reports 'outcome unknown' | `t6` |
| vscode-plugin/src/models/__tests__/model-tier-picker.test.ts: model-tier-picker.ts names no runner or model literal and imports nothing from src/config (source scan) | `t5` |
| vscode-plugin/src/panels/__tests__/repo-config.test.ts: the rendered form has a select per taxonomy role (global / core / mid / cheap, preselected from tasks) and a coreFloor select, and no runner, model, effort or tiers field; the handler writes ['models','byRepo',repo,'tasks',roleId] and ['models','byRepo',repo,'coreFloor'] after consent, drops a ['tiers', …] write without prompting, shows a refusal's reason and detail, and calls offerRestart on restartRequired | `t7` |
| vscode-plugin/src/config/__tests__/gateway.test.ts: writeKey and writeKeyPath pass through the daemon's restartRequired, reason and detail, and fall back to 'refused' for a bare { ok:false } | `t1` |
| vscode-plugin/src/config/__tests__/key-map.test.ts: buildConfigKeyMap over a manifest fixture yields one entry per insrc.<path> row with type / enum / default taken from the manifest, and the models.tiers.* keys as plain strings without enum; no entry for insrc.chat.* or the per-role keys from the manifest; key-map.ts does not import src/config/config-catalog.ts | `t3` |
| vscode-plugin/src/config/__tests__/manifest-catalog.test.ts: package.json contributes every catalog row with the catalog's type, default and enum, except that the models.tiers.* rows carry no enum and default '' | `t3` |
| vscode-plugin/src/config/__tests__/sync-manifest-catalog.test.ts: the committed manifest is in sync with the generator (tier rows without enum or model default) and the generator is idempotent | `t3` |
| vscode-plugin/src/config/__tests__/vscode-bundle-catalog.test.ts: the extension type-checks and bundles, and the bundle contains no settings-catalog rows (no models.tiers.<tier>.runner default or effort enum) and no models definitions file | `t3` |
| vscode-plugin/src/config/__tests__/sync-engine.test.ts and per-role-engine.test.ts keep passing over their fixture key maps (engine behaviour); the production map is covered by manifest-key-map-engine.test.ts | `t4` |
| vscode-plugin/src/config/__tests__/manifest-key-map-engine.test.ts: createConfigSyncEngine with MERGED_KEY_MAP (built from the real package.json) and a fake gateway: a global key write and a per-role write reach config.write at the right path; insrc.chat.* changes are not mapped and write nothing; a native tier edit to a served model writes ONE whole tier at ['models','tiers',tier]; a runner-only change writes the new family's default model and drops an untaken effort; an unserved model, a wrong-family model or an untaken effort is reverted with its message and writes nothing; definitions rejecting reverts the edit; an out-of-enum value is refused and reverted; a write answering restartRequired calls onRestartRequired once for the batch; a refusal's message carries the daemon's detail | `t4` |
| vscode-plugin/src/daemon/__tests__/commands.test.ts: restartDaemonAndReport resolves true only for { ok:true, state:'running' }, false for not-ok, a stopped or errored state, or a rejecting controller, and reflects the result on the status surface like the restart command | `t2` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s6 contract: runSetModelTier`
- **[[c2]]** `prior-artifact` `LLD s6 contract: createDaemonConfigGateway / ConfigWriteResult`
- **[[c3]]** `prior-artifact` `LLD s6 contract: renderRepoConfig and createRepoConfigWriteHandler`
- **[[c4]]** `prior-artifact` `LLD s6 contract: buildConfigKeyMap from the manifest`
- **[[c5]]** `prior-artifact` `LLD s6 contract: restartDaemonAndReport`
- **[[c6]]** `prior-artifact` `LLD s6 contract: createConfigSyncEngine (tier edits validated and written whole, onRestartRequired)`
- **[[c7]]** `prior-artifact` `LLD s6 dataModelChanges: manifest tier rows, ConfigWriteResult, RepoConfigWrite segments, picker data`
- **[[c8]]** `prior-artifact` `LLD s6 errorPaths`
- **[[c9]]** `prior-artifact` `LLD s6 testStrategy`
- **[[c10]]** `prior-artifact` `LLD s6 migration`
