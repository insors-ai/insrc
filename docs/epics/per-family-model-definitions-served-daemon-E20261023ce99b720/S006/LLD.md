<!-- insrc:artifact LLD-ce99b72065d03b1b-s6 -->

# LLD: E20261026ce99b720:S006

## Summary

**Epic:** `per-family-model-definitions-served-daemon`
**HLD base run:** `wf-1792924917927-2y1e5h`
**HLD effective hash:** `c324f041e3e7...`

In VS Code, 'insrc: Set model tier' offers exactly the families, models and effort levels the daemon's model definitions list, and saves a tier as one whole { runner, model, effort } value. A model id the family does not list is checked through its CLI by the daemon; the user sees each effort level's verdict and evidence, and the tier is saved only after they approve and the daemon restarts. The Repo Configuration panel lets a repo choose only which tier each role uses and its core floor. Refusals and 'restart to apply' come from the daemon and are shown with a Restart action — in the picker, the panel and native settings sync alike; the extension no longer carries a runner, model or effort list, or a copy of the settings catalog, and tier settings leave the VS Code Settings UI.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Diagrams](#4-diagrams)
5. [Interaction with shared contracts](#5-interaction-with-shared-contracts)
6. [Error paths](#6-error-paths)
7. [Test strategy](#7-test-strategy)
8. [Migration](#8-migration)
9. [Alternatives considered](#9-alternatives-considered)
10. [UX](#10-ux)
11. [References](#11-references)
12. [Open questions](#12-open-questions)

## 1. HLD context

> See **HLD-ce99b72065d03b1b** § 2. Framework summary

**Rollout phase:** Phase D — clients render the daemon's definitions
**Consumes:** `sc3` (models.definitions IPC request), `sc4` (Unknown-model check and approval requests), `sc5` (Settings rules and models.resolveRole)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Extending the catalog file, its types (CloudModelCatalogFile, src/daemon/model-catalog.ts:48) and its validator in place; refreshing its contents with today's models, the aliases today's tier defaults use (opus, sonnet, haiku), the Ollama models insrc ships with and their context windows, and today's coreModel as the tool-loop default; the registry and its per-thread cache; moving the boot validation ahead of the settings reconcile and the worker threads; reading the approved-model store (a malformed store is logged and treated as empty); keeping the curated catalog's existing accessor answering providers.listModels from the new file shape until s2 replaces it. The validator refuses a missing or malformed file, an unknown, missing or repeated family, a CLI family without its CLI kind, tier defaults or summariser model, a model without an efforts list, a duplicate id or alias, a default that is not a model of its family, an Ollama model without a token input limit, and a tool-loop default that is not listed, naming the entry (ac3). Tests: one fixture per refusal reason (ac3); a model and alias added to a fixture are served after a restart with no code change (ac2); the file is validated before the settings reconcile, before any worker starts and before listen (ac1, k7); repeated requests in one thread return the same definitions even after the file changes on disk (ac1); a replacement worker started after the file, the store or config.json changed on disk uses the new values while a surviving thread keeps its own until the restart, and a thread whose first read comes after such a change likewise uses the new values; after a daemon restart every thread resolves the same definitions, approvals and tiers; providers.listModels still returns today's Claude and Codex models through the kept accessor; alias, effort and limit lookups; resolveTier distinguishes rejected-model from unlisted-model and falls back to the tier's family default, or the default family's for an Ollama tier. — owns `sc1`, `sc2`
- `s2`: The models.definitions handler and its method-class entry, the projection of the registry, each listed Ollama model's installed state from the existing bounded listing, and re-sourcing providers.listModels from the registry (for Ollama, listed models only), then removing the curated catalog accessor s1 kept. Tests: models.definitions returns every field of a fixture file (ac1); providers.listModels and models.definitions agree for every family, and an installed but unlisted Ollama model appears in neither (ac2); with Ollama not answering, installed is absent and the request still succeeds. — owns `sc3`
- `s3`: Moving every daemon consumer onto the registry: tier resolution, summariser selection, effort forwarding, CliProvider's input budget and CLI kind, OllamaProvider's num_ctx, the tool-loop model (an unlisted coreModel runs the tool-loop default with a warning) and the runner and model literals in routing, provider construction, attribution and workflow code; SUMMARISER_CLI_FALLBACK, CODEX_INPUT_BUDGET_CHARS and ollamaNumCtx go; DEFAULT_TIERS and TIER_EFFORTS stop being written in code and remain only as temporary exports drawn from the definitions for the TUI's model-tiers pane, which s5 migrates; no daemon code uses them. The settings catalog's tier and coreModel defaults and effort values are taken from the definitions; how the settings catalog reaches the file is decided in this Story's LLD and must work in every process that loads the settings catalog today (the daemon, the TUI, the updater, and the VS Code bundle until s6 drops its use). Reconcile removes per-repo tier overrides with a warning and prunes ollamaNumCtx; readRepoOverride and its callers go. config.write refuses a tier set to a rejected model and reports restartRequired. models.resolveRole and its method-class entry. Both installer copies take tier defaults and the tool-loop default from the file. Tests: an unset tier resolves to the file's default, and with a fixture whose defaults differ from today's, reconcile fills the fixture's values (ac1); an unsupported effort is dropped with a warning naming model and effort (ac2); a source scan fails on runner or model literals outside the family implementations, on any read of ollamaNumCtx, and on any daemon use of the temporary DEFAULT_TIERS or TIER_EFFORTS exports (ac3); the TUI still builds and its model-tiers pane shows the definitions' defaults; a repo's `tasks` choice applies with the global tier's model (ac4); reconcile removes per-repo tier overrides with a warning naming repo and tier and keeps `tasks` and coreFloor (ac5); an unlisted model falls back with the warning (decision A); a fixture Ollama model's input limit sets num_ctx; config.write refuses a rejected model and reports restartRequired; models.resolveRole matches the daemon's own resolution for a CLI tier and an Ollama tier; the settings catalog loader accepts the catalog and an unset JetBrains tier still shows the default family's values. — owns `sc5`
- `s4`: The per-family check procedures (Codex: the CLI's model list plus a run; Claude: a run, the input limit from the JSON output, recognised effort names), run one call at a time; telling a reachable CLI that refuses the model apart from an unreachable CLI; refusing approval unless the model ran without error; writing the store atomically and acknowledging a decision only once it is written; the method-class entries. Tests: checks against fake CLIs record each verdict and run one at a time (ac1); results list each claimed level with evidence and nothing is usable before approval (ac2); after approval and a restart only the approved levels are accepted (ac3); a rejected profile or unreachable CLI refuses the model with a reason, and approving a check whose model did not run is refused (ac4); after a restart an approved model appears in models.definitions as user-approved and a rejected one among the rejected ids (ac5); a failed store write returns write-failed and keeps the previous store. — owns `sc4`
- `s5`: The TUI model-tiers pane and its effort choices from models.definitions, removing the temporary DEFAULT_TIERS and TIER_EFFORTS exports s3 kept; the unknown-model check and approval screen; the repo settings view limited to `tasks` and coreFloor; showing restartRequired and offering maintenance.restart; the review command using models.resolveRole and building its provider from the answer instead of reading config.json; Setup recommending the definitions' tool-loop default instead of DEFAULT_LOCAL_MODEL, and saying it cannot recommend when the daemon is not running. Tests: the pane offers exactly the options of a fake models.definitions answer and no source file still exports or imports DEFAULT_TIERS or TIER_EFFORTS (ac1); saving an unknown model starts the check and shows its results (ac2); the repo view edits only `tasks` and coreFloor (ac3); the review command runs the model a fake models.resolveRole returns for a CLI and an Ollama tier; Setup recommends the fake answer's tool-loop default.
- `s7`: The JetBrains model-tiers section driven by models.definitions instead of ModelTiersModel.PROVIDERS; the unknown-model check and approval dialog; the per-repo settings without per-tier fields; showing restartRequired. Tests: the section offers exactly a fake answer's options and the plugin keeps no runner or model list (ac1); an unknown model is saved only after approval (ac2); the per-repo settings show only `tasks` and coreFloor (ac3).

## 2. Contract details

**Surface level:** internal

### 2.1 `runSetModelTier`

```typescript
runSetModelTier(deps: SetModelTierDeps): Promise<void>  // vscode-plugin/src/models/model-tier-picker.ts; SetModelTierDeps = { definitions(): Promise<ModelDefinitionsResult>; rawConfig(): Promise<Record<string, unknown>>; writeKeyPath(segments: readonly string[], value: unknown): Promise<ConfigWriteResult>; check(p: { family: 'cli-claude' | 'cli-codex'; modelId: string; claimedEfforts: readonly string[] }): Promise<ModelCheckResult | { error: string }>; approve(p: { checkId: string; efforts: readonly string[] }): Promise<DecisionResult>; reject(p: { checkId: string }): Promise<DecisionResult>; restartDaemon(): Promise<boolean>; pick<T extends QuickPickItemLike>(items: readonly T[], opts: { placeHolder: string; canPickMany?: boolean }): Promise<T | readonly T[] | undefined>; input(opts: { prompt: string; value?: string }): Promise<string | undefined>; notify(message: string, ...actions: string[]): Promise<string | undefined> }
```

**Parameters:**
- `deps: SetModelTierDeps` — Injected seams bound in vscode-plugin/src/extension.ts: models.definitions / models.check / models.approve / models.reject over the shared client, config.show and config.write through the config gateway, restartDaemon bound to restartDaemonAndReport (the controller's LifecycleResult, not the command's completion), showQuickPick (incl. canPickMany), showInputBox and showInformationMessage with actions. The listModels and catalog seams and the CONFIG_CATALOG import are removed.

**Returns:** `Promise<void>` — Flow: tier -> family (the answer's families, current marked) -> model (that family's models: id with aliases, '(user-approved)' / '(not installed)' marks, plus 'Enter another model id…' for a CLI family only) -> effort ('' = CLI default, then the chosen model's efforts; skipped when the model lists none). The current tier is config.show's models.tiers.<tier> overlaid on the default family's tierDefaults[tier] from the answer. A served pick writes ONE writeKeyPath(['models','tiers',tier], { runner, model, effort }); a typed id that is an id or alias of the family is treated as that served model; an unserved CLI id runs the check flow: claimed efforts (default: the family's effort names) -> check -> a QuickPick listing each level's verdict and evidence -> a multi-select of the non-rejected levels -> Approve / Reject / Cancel. Approve calls models.approve and saves nothing; the user is offered 'Restart daemon', and only after restartDaemon() resolves true (the lifecycle result is ok and the daemon is running) is the whole tier written (effort = the first approved level, or ''). Every write's result is shown: a refusal as 'not saved: <reason> — <detail>', restartRequired with a 'Restart daemon' action. Never throws; cancel at any step writes nothing.

**Errors:**
- `notify: daemon not running` when definitions() or rawConfig() rejects. Four distinct outcomes by the rejection: 'daemon is not running…' -> 'insrc: the daemon is not running — start it to set model tiers'; a DaemonDisconnectedError (code 'disconnected') -> 'the daemon closed the connection — try again'; a message starting 'unknown method: ' -> the text and 'update the daemon'; anything else (a handler error, 'invalid response from daemon') -> 'insrc: could not read the model definitions: <error text>'. Nothing is written in any case.
- `notify: check refused / did not run` when check() answers { error } (already served, no CLI kind) or runs:false: the error and evidence are shown, approve is not offered.
- `notify: decision refused` when approve()/reject() return ok:false: '<reason>: <detail>'; on unknown-check the user is offered 'Check again'.
- `notify: restart failed` when restartDaemon() resolves false or rejects after an approval: 'approval recorded; the daemon did not restart — the tier was not saved', with 'Restart daemon' to retry; approve is never sent again.
- `notify: outcome unknown` when a request rejects with DaemonDisconnectedError (code 'disconnected'): for check, 'the check was interrupted — check again'; for approve/reject/config.write, 'outcome unknown — reopen the picker to see the current tier'.

**Preconditions:**
- The daemon serves models.definitions, models.check, models.approve, models.reject and config.write with the sc5 result (s2-s4, s3).

**Postconditions:**
- No write sets only part of a tier; a tier names a model of its runner's family (served, or approved and the daemon restarted).
- The module imports no CONFIG_CATALOG, keeps no runner, model or effort list, and offers no free-text entry for an Ollama family.

### 2.2 `createDaemonConfigGateway`

```typescript
createDaemonConfigGateway(client: IpcClient): ConfigGateway  // vscode-plugin/src/config/gateway.ts; ConfigWriteResult (vscode-plugin/src/config/types.ts) = { ok: true; restartRequired?: boolean | undefined } | { ok: false; reason: string; detail?: string | undefined }
```

**Parameters:**
- `client: IpcClient` — The shared daemon client.

**Returns:** `ConfigGateway` — writeKey and writeKeyPath return the daemon's config.write answer: restartRequired on success; on refusal the daemon's reason ('invalid-path', 'rejected-model', 'per-repo-tier') and detail, falling back to 'refused' when an older daemon gives none. catalog() and rawConfig() are unchanged.

**Errors:**
- `rejection` when A socket failure still rejects, as today, so callers keep their unreachable-daemon handling.

**Postconditions:**
- Existing callers that read only ok and reason keep working (reason stays a string on refusal).

### 2.3 `renderRepoConfig`

```typescript
renderRepoConfig(deps: RepoConfigRendererDeps): RepoConfigRenderer  // vscode-plugin/src/panels/repo-config.ts
```

**Parameters:**
- `deps: RepoConfigRendererDeps` — registeredRepos() and rawConfig(), as today.

**Returns:** `RepoConfigRenderer` — For the selected repo: a <select> per taxonomy role (reasoningRoleTaxonomy, the same source the per-role key map uses) with 'global' plus core / mid / cheap, preselected from models.byRepo[repo].tasks[roleId], carrying data-segments ['tasks', roleId]; and a coreFloor <select> ('global', core, mid, cheap) carrying ['coreFloor']. 'global' posts value '' which the existing webview script sends as null (clear). No runner, model or effort field, and no text input.

**Errors:**
- `rejection` when registeredRepos()/rawConfig() rejection propagates to the host's degraded panel, as today.

**Postconditions:**
- Every posted write's segments start with 'tasks' or 'coreFloor'.

### 2.4 `createRepoConfigWriteHandler`

```typescript
createRepoConfigWriteHandler(deps: RepoConfigWriteDeps): (write: RepoConfigWrite) => void  // vscode-plugin/src/panels/repo-config.ts
```

**Parameters:**
- `deps: RepoConfigWriteDeps` — consent, writeKeyPath, registeredRepos, status, logger, refresh, plus offerRestart(): void (shows the 'Restart daemon' action that runs insrc.daemon.restart).

**Returns:** `(write: RepoConfigWrite) => void` — As today (shape check, registered repo, consent, write at ['models','byRepo',repoPath,...segments], status, refresh), and additionally: a write whose segments do not start with 'tasks' (exactly two segments) or 'coreFloor' (one segment) is dropped with a warning; a refusal shows '<reason> — <detail>'; restartRequired calls offerRestart().

**Errors:**
- `logged warning` when write failure or rejection, as today; never throws.

**Postconditions:**
- No write from the panel targets models.byRepo.<repo>.tiers.

### 2.5 `buildConfigKeyMap`

```typescript
buildConfigKeyMap(manifest: ManifestConfiguration = MANIFEST_CONFIGURATION): ConfigKeyMap  // vscode-plugin/src/config/key-map.ts
```

**Parameters:**
- `manifest: ManifestConfiguration` _(optional)_ — The contributes.configuration properties of the extension's package.json (bundled as JSON), default the real manifest; tests pass a fixture.

**Returns:** `ConfigKeyMap` — One entry per insrc.<path> property of the manifest except the plugin-local keys (isPluginLocalKey: insrc.chat.* and insrc.models.tasks.*, the same rule the manifest generator uses — the generator imports the predicate from key-map.ts so the two cannot drift; buildPerRoleKeyMap still builds the per-role entries), with a ConfigOption built from the property's type, enum and default (a string with enum -> 'enum', boolean, number, string), so the sync engine's validation keeps working. key-map.ts no longer imports src/config/config-catalog.ts; MERGED_KEY_MAP and CONFIG_KEY_MAP keep their shape.

**Preconditions:**
- package.json is generated from the catalog at build time (vscode-plugin/scripts/sync-manifest-catalog.mjs), so it carries every row the sync engine maps.

**Postconditions:**
- No entry maps a models.tiers.* key or a plugin-local key.

### 2.6 `restartDaemonAndReport`

```typescript
restartDaemonAndReport(deps: { controller: DaemonLifecycleController; status: StatusSurface }): Promise<boolean>  // NEW export beside registerDaemonCommands in vscode-plugin/src/daemon/commands.ts
```

**Parameters:**
- `deps: { controller: DaemonLifecycleController; status: StatusSurface }` — The same lifecycle controller and status surface registerDaemonCommands uses.

**Returns:** `Promise<boolean>` — Runs controller.run('restart'), reflects the LifecycleResult on the status surface exactly as the insrc.daemon.restart command does, and resolves true only when result.ok and result.state === 'running'. The insrc.daemon.restart command keeps its behaviour (it calls the same reflect path); the picker's restartDaemon seam and every 'Restart daemon' notification action are bound to this adapter, so success is the lifecycle result, not the command's completion.

**Errors:**
- `false` when controller.run rejects, or the result is not ok, or the state is not 'running': resolves false after reflecting what is known (a rejection is reflected as errored with its message).

**Postconditions:**
- The status surface shows the same outcome the command shows.

### 2.7 `createConfigSyncEngine`

```typescript
createConfigSyncEngine(deps: ConfigSyncDeps): ConfigSyncEngine  // vscode-plugin/src/config/sync-engine.ts; ConfigSyncDeps gains onRestartRequired(keys: readonly string[]): void
```

**Parameters:**
- `deps: ConfigSyncDeps` — As today (gateway, settings, notifier, keyMap) plus onRestartRequired, bound in vscode-plugin/src/extension.ts to an information message '<keys> saved — restart the daemon to apply' with a 'Restart daemon' action that calls restartDaemonAndReport.

**Returns:** `ConfigSyncEngine` — applyChanges keeps validation, last-synced echo suppression and revert-on-refusal; a refusal now reads 'insrc: daemon rejected '<key>' — <reason>' plus ' — <detail>' when the daemon gives one; after a batch, if any accepted write reported restartRequired, onRestartRequired is called ONCE with those native keys (e.g. a per-role tier or coreFloor change).

**Errors:**
- `notifier.error` when refusals and unreachable-daemon writes, as today, with the daemon's detail added.

**Postconditions:**
- No restartRequired answer from a native-settings write is dropped silently.

## 3. Data model changes

### 3.1 `VS Code native settings manifest (package.json contributes.configuration)` — field-remove

vscode-plugin/scripts/sync-manifest-catalog.mjs skips the catalog's models.tiers.<tier>.runner / .model / .effort rows, so insrc.models.tiers.* leave the manifest and the Settings UI; every other row is generated as before. Values a user already has under insrc.models.tiers.* in settings.json are no longer read or written (VS Code shows them as unknown); the tiers in ~/.insrc/config.json are unchanged.

```
- insrc.models.tiers.{core,mid,cheap}.{runner,model,effort}
```

**Call sites:**
- `vscode-plugin/scripts/sync-manifest-catalog.mjs`
- `vscode-plugin/package.json`
- `vscode-plugin/src/config/key-map.ts:51`

### 3.2 `ConfigWriteResult (plugin)` — field-add

Success gains restartRequired; refusal gains detail and carries the daemon's reason instead of the fixed 'invalid path' text.

```
{ ok: true } | { ok: false; reason: string }  ->  { ok: true; restartRequired?: boolean | undefined } | { ok: false; reason: string; detail?: string | undefined }
```

**Call sites:**
- `vscode-plugin/src/config/types.ts:45`
- `vscode-plugin/src/config/gateway.ts:42`
- `vscode-plugin/src/config/sync-engine.ts`

### 3.3 `RepoConfigWrite segments` — invariant-change

Panel writes are ['tasks', roleId] or ['coreFloor'] under models.byRepo[repoPath]; ['tiers', tier, field] is no longer produced or accepted.

**Call sites:**
- `vscode-plugin/src/panels/types.ts:183`
- `vscode-plugin/src/panels/repo-config.ts:93`
- `vscode-plugin/src/panels/repo-config.ts:131`

### 3.4 `Model tier picker data` — field-remove

ModelProvider union, PROVIDERS list, ModelListResult and the CONFIG_CATALOG lookups (catalogDefault, effortValues) are removed; the picker types the sc3/sc4 answers structurally (no daemon import).

**Call sites:**
- `vscode-plugin/src/models/model-tier-picker.ts:25`
- `vscode-plugin/src/models/model-tier-picker.ts:74`
- `vscode-plugin/src/models/model-tier-picker.ts:198`

## 4. Diagrams

- [Sequence diagram](docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/S006/sequence-diagram.html)

## 5. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc3` | consumes | The picker reads models.definitions for every family, model (with aliases, source and installed state), effort list and tier default; nothing is cached between runs of the command. |
| `sc4` | consumes | An unserved Claude or Codex id runs models.check; the verdicts and evidence are shown; models.approve with the chosen levels or models.reject records the decision; a restart (insrc.daemon.restart) precedes saving the tier. Ollama offers no typed id. |
| `sc5` | consumes | Tiers are written whole at models.tiers.<tier>; repo writes touch only tasks and coreFloor; config.write's reason, detail and restartRequired are shown, with a Restart action on restartRequired. |

## 6. Error paths

**Error cases**

- **The daemon is not running when 'insrc: Set model tier' starts.** (recoverable)
  - Detection: deps.definitions() or deps.rawConfig() rejects with the shared client's 'daemon is not running' error.
  - Response: notify 'insrc: the daemon is not running — start it to set model tiers'; the flow ends before any pick.
  - User impact: No tier can be chosen until the daemon runs; nothing is written.
- **An older daemon does not know models.definitions / models.check.** (recoverable)
  - Detection: The rpc rejects with the daemon's own unknown-method answer, recognised by its message starting 'unknown method: ' (src/daemon/server.ts:87).
  - Response: notify the error text and 'update the daemon (insrc: Update daemon)'; nothing is written.
  - User impact: The user learns the daemon must be updated.
- **config.write refuses the tier (rejected-model, invalid-path) or a repo write (per-repo-tier, invalid-path).** (recoverable)
  - Detection: The ConfigWriteResult has ok:false; the gateway now carries the daemon's reason and detail.
  - Response: notify 'insrc: <tier> not saved: <reason> — <detail>' (picker) or set the status line and refresh (panel).
  - User impact: The user sees why; the previous value stays.
- **A save succeeds but needs a restart to apply.** (recoverable)
  - Detection: The ConfigWriteResult has ok:true and restartRequired:true.
  - Response: notify '… saved — restart the daemon to apply' with a 'Restart daemon' action that runs insrc.daemon.restart.
  - User impact: The user can apply the change at once or later.
- **models.check answers invalid params (the id is already served by the family, or the family has no CLI kind) or a check whose model did not run.** (recoverable)
  - Detection: check() resolves { error } or a ModelCheckResult with runs:false.
  - Response: Show the error and each level's evidence; Approve is not offered (Reject and Cancel are). For an already-served id the picker re-reads models.definitions and offers it as a normal pick.
  - User impact: Nothing unusable can be approved or saved.
- **models.approve or models.reject refuses (unknown-check after a daemon restart, invalid-efforts, write-failed).** (recoverable)
  - Detection: DecisionResult ok:false.
  - Response: notify '<reason>: <detail>'; on unknown-check offer 'Check again', which reruns models.check.
  - User impact: The tier is not saved; the user can check again.
- **The restart after an approval fails.** (recoverable)
  - Detection: restartDaemon() resolves false or rejects.
  - Response: notify 'approval recorded; the daemon did not restart — the tier was not saved' with 'Restart daemon' to retry the restart and then save; models.approve is not called again.
  - User impact: The approval is kept; the tier waits for a working restart.
- **The daemon closes the connection mid-request.** (recoverable)
  - Detection: The rpc rejects with DaemonDisconnectedError (code 'disconnected').
  - Response: For check: 'the check was interrupted — check again'. For approve, reject or config.write: 'outcome unknown — reopen the picker to see the current tier' (the request may have completed).
  - User impact: The user is not told something failed that may have succeeded.
- **The repo panel receives a write whose segments are not ['tasks', roleId] or ['coreFloor'] (a stale webview or a forged message).** (recoverable)
  - Detection: createRepoConfigWriteHandler checks the first segment and the segment count before consent.
  - Response: Drop it with a logged warning; no consent prompt, no write.
  - User impact: None; per-repo tiers cannot be written from the panel.
- **The restart a 'Restart daemon' action or the picker asks for does not bring the daemon back.** (recoverable)
  - Detection: restartDaemonAndReport's LifecycleResult is not ok or its state is not 'running' (or controller.run rejects).
  - Response: The status surface shows the result as the restart command does; the picker reports 'the daemon did not restart — the tier was not saved' and offers the action again.
  - User impact: No tier is saved against a daemon that did not come back.
- **A native setting change (a per-role tier, the core floor, the local coreModel) is saved and the daemon says a restart is required.** (recoverable)
  - Detection: The gateway's ConfigWriteResult for that write has restartRequired:true.
  - Response: After the batch, onRestartRequired is called once with the changed keys; the extension shows '<keys> saved — restart the daemon to apply' with a 'Restart daemon' action.
  - User impact: Native edits that need a restart say so instead of silently not applying.
- **Any other failed request: the daemon's handler throws, the reply is malformed ('invalid response from daemon'), or another socket error.** (recoverable)
  - Detection: The rpc rejects with a message that is neither 'daemon is not running…', a DaemonDisconnectedError (code 'disconnected'), nor 'unknown method: …'.
  - Response: notify 'insrc: <what> failed: <error text>' with no update or start advice; nothing is written.
  - User impact: The user sees the real error instead of misleading advice.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A tier in config.json names a model its family no longer lists (or one that is not yet approved and restarted). | The model step marks it '(current, not listed — runs the default)' and it is not selectable; the user can pick a listed model or enter it to check. |
| A family without tierDefaults (Ollama) is chosen. | The model step preselects the family's toolLoopModel; effort is skipped when the chosen model lists no efforts and '' is written. |
| The chosen model does not accept the tier's current effort. | The effort step offers only '' and the model's efforts with none marked current; the whole-tier write carries the chosen value. |
| The user types an alias of a listed model in 'Enter another model id…'. | It resolves to the canonical id and is saved as a normal pick, with no check. |
| The answer's family list is empty or a family lists no models. | 'No models available' with Refresh (re-reads models.definitions); nothing is written. |
| A user's settings.json still has insrc.models.tiers.* values. | They are ignored by the extension (no longer in the manifest or the key map); config.json's tiers are unchanged. |
| A repo with no byRepo entry is opened in the panel. | Every role shows 'global' and coreFloor 'global'; the first change creates models.byRepo.<repo>.tasks.<role> (or coreFloor) only. |
| A repo path or role id containing dots. | Written as single literal segments via the array form, as today. |

**Invariants to preserve**

- The picker and the panel never throw into VS Code; every failure path notifies and writes nothing it did not mean to (vscode-plugin/src/models/model-tier-picker.ts:105 outer backstop; vscode-plugin/src/panels/repo-config.ts:131 never-throw handler). [[c10]]
- Per-repo writes go through the consent gate, only for a registered repo, via the config.write array form, and the panel re-renders from fresh config afterwards (vscode-plugin/src/panels/repo-config.ts:131). [[c10]]
- Native settings sync keeps validating each native value against its option's type and enum before writing, and reverts a refused or failed write (vscode-plugin/src/config/sync-engine.ts); only the source of the option metadata moves from the bundled catalog to the manifest. [[c10]]
- The per-role native keys keep writing ['models','tasks',roleId] through buildPerRoleKeyMap (vscode-plugin/src/config/key-map.ts:72). [[c10]]
- The extension reaches the definitions and settings only over daemon IPC; it imports no daemon or settings-catalog module at run time (k2). [[c4]]

## 7. Test strategy

**Test framework:** `node:test with node:assert/strict, run through npx tsx --test (vscode-plugin tests run from the repo root, e.g. npx tsx --test vscode-plugin/src/models/__tests__/model-tier-picker.test.ts); fakes for every injected seam, no vscode import.`

**Test levels**

- **unit** — The picker flow over a fake models.definitions answer whose names match nothing in the shipped file, and the check / approve / restart / save order, over fake seams.
  - Subjects: `vscode-plugin/src/models/__tests__/model-tier-picker.test.ts: the family, model and effort steps offer exactly the fake answer's families, its models (with aliases, '(user-approved)' and '(not installed)' marks) and '' plus the chosen model's efforts; a pick makes ONE writeKeyPath(['models','tiers',tier], { runner, model, effort }); an Ollama family offers no 'Enter another model id…'; a typed alias resolves to the canonical id and saves without a check; a stale configured model is marked and not selectable; a refusal shows '<reason> — <detail>' and restartRequired offers 'Restart daemon'; definitions rejecting with 'daemon is not running', a DaemonDisconnectedError, 'unknown method: models.definitions' and a plain handler error each give their own message (only the unknown-method one says to update the daemon) and write nothing`, `vscode-plugin/src/models/__tests__/model-tier-picker.test.ts: unknown model — an unserved CLI id calls check with the family's effort names, shows each level's verdict and evidence, offers only non-rejected levels; Approve calls approve with the chosen levels and writes nothing; the tier is written only after restartDaemon() resolves true; a failed restart writes nothing and a retry does not approve again; Reject calls reject and writes nothing; runs:false or { error } offers no Approve; unknown-check offers 'Check again'; a disconnected approve reports 'outcome unknown'`, `vscode-plugin/src/models/__tests__/model-tier-picker.test.ts: model-tier-picker.ts names no runner or model literal and imports nothing from src/config (source scan)`
  - Fixtures: `A fake ModelDefinitionsResult with families 'cli-claude' and 'cli-codex' plus an Ollama family, model ids unlike the shipped file (fx-a, fx-b with alias xb, loc:1), one user-approved and one not-installed model`, `Scripted fake check / approve / reject / restart seams that record calls`
- **unit** — The Repo Configuration panel and its write handler, the gateway's write result, and the key map built from the manifest.
  - Subjects: `vscode-plugin/src/panels/__tests__/repo-config.test.ts: the rendered form has a select per taxonomy role (global / core / mid / cheap, preselected from tasks) and a coreFloor select, and no runner, model, effort or tiers field; the handler writes ['models','byRepo',repo,'tasks',roleId] and ['models','byRepo',repo,'coreFloor'] after consent, drops a ['tiers', …] write without prompting, shows a refusal's reason and detail, and calls offerRestart on restartRequired`, `vscode-plugin/src/config/__tests__/gateway.test.ts: writeKey and writeKeyPath pass through the daemon's restartRequired, reason and detail, and fall back to 'refused' for a bare { ok:false }`, `vscode-plugin/src/config/__tests__/key-map.test.ts: buildConfigKeyMap over a manifest fixture yields one entry per insrc.<path> row with type / enum / default taken from the manifest, and none for models.tiers.*; key-map.ts does not import src/config/config-catalog.ts`
- **contract** — The manifest stays in lock-step with the settings catalog minus the tier rows, and the bundle no longer carries the catalog.
  - Subjects: `vscode-plugin/src/config/__tests__/manifest-catalog.test.ts: package.json contributes every catalog row except models.tiers.*, with the catalog's type, default and enum`, `vscode-plugin/src/config/__tests__/sync-manifest-catalog.test.ts: the committed manifest is in sync with the generator (which skips the tier rows) and the generator is idempotent`, `vscode-plugin/src/config/__tests__/vscode-bundle-catalog.test.ts: the extension type-checks and bundles, and the bundle contains no settings-catalog rows (no models.tiers.<tier>.runner default or effort enum) and no models definitions file`
- **integration** — The native settings sync still works with the manifest-built key map.
  - Subjects: `vscode-plugin/src/config/__tests__/sync-engine.test.ts and per-role-engine.test.ts keep passing over their fixture key maps (engine behaviour); the production map is covered by manifest-key-map-engine.test.ts`
- **integration** — The native sync engine over the REAL manifest-built merged key map, and the restart adapter.
  - Subjects: `vscode-plugin/src/config/__tests__/manifest-key-map-engine.test.ts: createConfigSyncEngine with MERGED_KEY_MAP (built from the real package.json) and a fake gateway: a global key write and a per-role write reach config.write at the right path; insrc.models.tiers.* and insrc.chat.* changes are not mapped and write nothing; an out-of-enum value is refused and reverted; a write answering restartRequired calls onRestartRequired once for the batch; a refusal's message carries the daemon's detail`, `vscode-plugin/src/daemon/__tests__/commands.test.ts: restartDaemonAndReport resolves true only for { ok:true, state:'running' }, false for not-ok, a stopped or errored state, or a rejecting controller, and reflects the result on the status surface like the restart command`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `model-tier-picker.test.ts: the family, model and effort steps offer exactly the fake answer's options and each pick writes the whole tier`, `model-tier-picker.test.ts: model-tier-picker.ts names no runner or model literal and imports nothing from src/config`, `key-map.test.ts: no entry for models.tiers.* and no import of the settings catalog`, `manifest-catalog.test.ts: the manifest contributes no models.tiers.* keys`, `vscode-bundle-catalog.test.ts: the bundle contains no settings-catalog rows or definitions file`, `manifest-key-map-engine.test.ts: tier keys are not mapped by the real merged key map and write nothing` |
| `ac2` | `model-tier-picker.test.ts: unknown model — check results shown; approve writes nothing; the tier is written only after approval and a successful restart; reject writes nothing; runs:false offers no approve`, `commands.test.ts: restartDaemonAndReport resolves true only when the daemon is running again` |
| `ac3` | `repo-config.test.ts: the form has role tier selects and coreFloor only, and the handler drops any tiers write` |

## 8. Migration

**State before:** The VS Code picker keeps its own runner list and reads tier defaults and effort values from the bundled settings catalog, lists models per provider through providers.listModels and writes a tier field by field (vscode-plugin/src/models/model-tier-picker.ts:25, :74, :198, :285). The bundle imports src/config/config-catalog.ts at run time for the native-settings key map (vscode-plugin/src/config/key-map.ts:12), and the manifest contributes insrc.models.tiers.<tier>.runner/.model/.effort with static enums and model defaults. The gateway drops config.write's reason, detail and restartRequired (vscode-plugin/src/config/gateway.ts:42). The Repo Configuration panel edits per-repo tiers.<tier>.{runner,model}, which the daemon now refuses (vscode-plugin/src/panels/repo-config.ts:93).

**State after:** The picker offers only what models.definitions lists, runs the check / approve / restart flow for an unlisted Claude or Codex id, and writes each tier whole. The bundle imports no settings catalog: the key map is built from the extension's manifest, which no longer contributes the tier keys. Write results carry the daemon's reason, detail and restartRequired, with a Restart action. The Repo Configuration panel offers a tier per role and the core floor only.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Carry config.write's restartRequired, reason and detail through the gateway's ConfigWriteResult; existing callers keep reading ok and reason. — ↩ rollbackable
2. Add restartDaemonAndReport beside the lifecycle commands, add onRestartRequired to the sync engine's deps and the daemon's refusal detail to its messages, and bind both in extension.ts. — ↩ rollbackable
3. Build the native-settings key map from the manifest's contributed properties instead of the bundled catalog; stop generating the models.tiers.* rows in the manifest and regenerate package.json; update the manifest / bundle contract tests. — ↩ rollbackable
4. Move the model-tier picker onto models.definitions with whole-tier writes and the unknown-model check flow; bind the new seams (definitions, check, approve, reject, restart, input, actioned notify) in extension.ts and extend the vscode.d.ts stub with showInputBox and canPickMany; remove the bundled-effort test. — ↩ rollbackable
5. Replace the Repo Configuration panel's per-repo tier inputs with role tier and coreFloor selects; the write handler accepts only tasks and coreFloor segments and offers a restart on restartRequired. — ↩ rollbackable

**Backward compat:** No daemon request or config shape changes; config.json keeps the same models.tiers objects (now written whole) and byRepo tasks / coreFloor. Users with insrc.models.tiers.* in their VS Code settings.json see those keys reported as unknown and no longer synced; the tiers in ~/.insrc/config.json, which the daemon uses, are unchanged and are edited with 'insrc: Set model tier'. The extension now needs a daemon that serves models.definitions / models.check (s2, s4): against an older daemon the picker says to update the daemon and writes nothing. Native settings other than the tier keys sync exactly as before.

## 9. Alternatives considered

### 9.1 a1: Picker and panel on the daemon; tier keys leave native settings; key map from the manifest — **CHOSEN**

The picker reads models.definitions and writes whole tiers (with the check flow), the repo panel edits tasks and coreFloor, write results keep the daemon's reason and restartRequired, the native tier keys are dropped, and the key map is built from the extension's own manifest so the bundle no longer imports the settings catalog.

runSetModelTier takes a definitions() seam (models.definitions) instead of listModels and the bundled catalog: tier -> family (defs.families) -> model (that family's models with aliases, plus 'Enter another model id…' for a CLI family) -> effort ('' plus the model's efforts), then ONE writeKeyPath(['models','tiers',tier], { runner, model, effort }). The tier's current value comes from config.show (rawConfig) overlaid on the family's tierDefaults from the answer. An id the family does not serve goes through models.check -> a QuickPick of per-effort verdicts with evidence -> a multi-select of the non-rejected levels -> models.approve or models.reject; on approval the user is offered insrc.daemon.restart and the tier is saved only after a successful restart (never re-approving). The Repo Configuration panel renders a select per taxonomy role (tier or 'global') writing ['models','byRepo',repo,'tasks',roleId] (null clears) and a coreFloor select writing ['models','byRepo',repo,'coreFloor'], with no runner or model field. The gateway's ConfigWriteResult becomes { ok:true; restartRequired? } | { ok:false; reason; detail? } from the daemon's answer; the picker and panel show the reason and, on restartRequired, offer insrc.daemon.restart. The manifest generator skips the models.tiers.* rows (tiers are edited only through the picker, whole), and key-map.ts builds its entries from the manifest's contributed properties (type, enum, default) instead of importing CONFIG_CATALOG; the manifest-catalog checks become 'manifest = catalog minus the tier rows'.

### 9.2 a2: Same picker and panel; keep native tier keys; key map from the daemon's config.catalog

As a1 for the picker, panel and write results, but the native tier rows stay in the manifest and the key map is built at run time from the daemon's config.catalog options.

The picker, check flow, repo panel and gateway change as in a1. The bundle drops its CONFIG_CATALOG import by building the key map from the config.catalog answer the sync engine already fetches (options carry type, enum and default). The manifest keeps insrc.models.tiers.<tier>.runner/.model/.effort, regenerated from the catalog at build time, so native edits keep writing single tier leaves.

**Rejected because:** Keeps Settings-UI tier editing but violates ac1 and only partially keeps the whole-tier rule; it also makes native sync depend on the daemon at startup.

### 9.3 a3: Picker and panel only; keep the bundled catalog as a named stopgap

Rework only the picker, check flow, repo panel and write results; leave key-map.ts importing CONFIG_CATALOG and the native tier rows as they are.

The picker and panel change as in a1 and the gateway keeps the daemon's reason and restartRequired. key-map.ts and the manifest are untouched, recorded as a stopgap for a later change.

**Rejected because:** Smallest, but fails ac1 and leaves the bundle's catalog import the Story boundary says it removes.

## 10. UX

- [UX mock](docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/S006/ux-mock.html)

## 11. References

- **[[c1]]** `prior-artifact` `HLD-ce99b72065d03b1b` — "s6 boundary: the VS Code model-tier picker driven by models.definitions, removing the bundle's import of the settings catalog; the unknown-model check and approval prompt; the Repo Configuration panel"
- **[[c2]]** `analyze-bundle` `s1 symbol.locate (the VS Code model-tier picker)`
- **[[c3]]** `code` `vscode-plugin/src/models/model-tier-picker.ts:74` — "const PROVIDERS: ReadonlyArray<{ readonly id: ModelProvider; readonly label: string }> = ["
- **[[c4]]** `prior-artifact` `DEF-ce99b72065d03b1b` — "c4: the daemon owns model facts; clients reach them only over daemon IPC (k1, k2)."
- **[[c5]]** `code` `vscode-plugin/src/config/gateway.ts:42`
- **[[c6]]** `code` `vscode-plugin/src/panels/repo-config.ts:35` — "const TIER_FIELDS = ['runner', 'model'] as const;"
- **[[c7]]** `code` `src/cli/panes/ModelCheckScreen.tsx`
- **[[c8]]** `step-output` `s3 alternatives.judge`
- **[[c9]]** `step-output` `s8 checklist.verify`
- **[[c10]]** `prior-artifact` `DEF-ce99b72065d03b1b` — "c10: the VS Code plugin's model-tier picker, native settings sync and Repo Configuration panel."
- **[[c11]]** `code` `vscode-plugin/src/config/key-map.ts:12` — "import { CONFIG_CATALOG, type ConfigOption } from '../../../src/config/config-catalog.js';"

## 12. Open questions

- Checklist alt2 (partial): Each alternative is scored against ac1-ac3 and sc3-sc5; the Epic constraints are covered through those scores (k2 via ac1, k5 via ac2, k6 via ac3) but k1, k3, k4 and k7 have no explicit score entries. k1/k3/k4/k7 concern the daemon and the definitions file, which none of the alternatives touch, so no alternative differs on them.
- Tier settings leave the VS Code Settings UI (the manifest stops contributing insrc.models.tiers.*): tiers are then edited only through 'insrc: Set model tier', whole. Keeping the native keys would mean a static runner / effort list in the extension and single-leaf tier writes. Confirm removing them?

## Resolved questions

- `q6b52f29d` — Checklist alt2 (partial): Each alternative is scored against ac1-ac3 and sc3-sc5; the Epic constraints are covered through those scores (k2 via ac1, k5 via ac2, k6 via ac3) but k1, k3, k4 and k7 have no explicit score entries. k1/k3/k4/k7 concern the daemon and the definitions file, which none of the alternatives touch, so no alternative differs on them.
  - **resolved**: Shared invariant assessment — User choice: one assessment covering k1, k3, k4 and k7 for all alternatives — none changes the daemon or the definitions file, so they do not differentiate the alternatives. _(2026-10-26T19:12:55.055Z)_
- `q7459caf6` — Tier settings leave the VS Code Settings UI (the manifest stops contributing insrc.models.tiers.*): tiers are then edited only through 'insrc: Set model tier', whole. Keeping the native keys would mean a static runner / effort list in the extension and single-leaf tier writes. Confirm removing them?
  - **resolved**: Keep native tier settings — User choice: s6 is only about which tier values are valid; the insrc.models.tiers.* settings stay in VS Code Settings. They carry no static enum or model-name default; the sync engine validates a tier edit against models.definitions (family, model of that family, effort that model accepts) and writes the whole tier (runner, model, effort from the current native values), reverting an invalid value with a message (an unlisted model points to 'insrc: Set model tier' for the check). No new review cycle (user). _(2026-10-26T19:16:08.660Z)_

## Citations

- **[[c1]]** `prior-artifact` `HLD-ce99b72065d03b1b` — "s6 boundary: the VS Code model-tier picker driven by models.definitions, removing the bundle's import of the settings catalog; the unknown-model check and approval prompt; the Repo Configuration panel"
- **[[c2]]** `analyze-bundle` `s1 symbol.locate (the VS Code model-tier picker)`
- **[[c3]]** `code` `vscode-plugin/src/models/model-tier-picker.ts:74` — "const PROVIDERS: ReadonlyArray<{ readonly id: ModelProvider; readonly label: string }> = ["
- **[[c4]]** `prior-artifact` `DEF-ce99b72065d03b1b` — "c4: the daemon owns model facts; clients reach them only over daemon IPC (k1, k2)."
- **[[c5]]** `code` `vscode-plugin/src/config/gateway.ts:42`
- **[[c6]]** `code` `vscode-plugin/src/panels/repo-config.ts:35` — "const TIER_FIELDS = ['runner', 'model'] as const;"
- **[[c7]]** `code` `src/cli/panes/ModelCheckScreen.tsx`
- **[[c8]]** `step-output` `s3 alternatives.judge`
- **[[c9]]** `step-output` `s8 checklist.verify`
- **[[c10]]** `prior-artifact` `DEF-ce99b72065d03b1b` — "c10: the VS Code plugin's model-tier picker, native settings sync and Repo Configuration panel."
- **[[c11]]** `code` `vscode-plugin/src/config/key-map.ts:12` — "import { CONFIG_CATALOG, type ConfigOption } from '../../../src/config/config-catalog.js';"
