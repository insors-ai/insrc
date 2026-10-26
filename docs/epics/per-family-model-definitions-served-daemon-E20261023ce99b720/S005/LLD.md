<!-- insrc:artifact LLD-ce99b72065d03b1b-s5 -->

# LLD: E20261026ce99b720:S005

## Summary

**Epic:** `per-family-model-definitions-served-daemon`
**HLD base run:** `wf-1792924917927-2y1e5h`
**HLD effective hash:** `c324f041e3e7...`

s5 moves the terminal UI onto the daemon's model definitions. The Model Tiers pane offers only the families, models and effort levels models.definitions returns, saves a whole tier at once, and sends a model the family does not serve through the unknown-model check and approval screen. The Repos pane gains a per-repo models view that edits only the role-to-tier map and coreFloor, and the command bar refuses per-repo tier keys and shows config.write refusals and restartRequired. The review command runs the model models.resolveRole names, Setup recommends the definitions' tool-loop model, and the TUI's own model lists (DEFAULT_TIERS, TIER_EFFORTS, DEFAULT_LOCAL_MODEL, the shipped-registry stopgap) are removed.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Interaction with shared contracts](#4-interaction-with-shared-contracts)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Migration](#7-migration)
8. [Alternatives considered](#8-alternatives-considered)
9. [UX](#9-ux)
10. [References](#10-references)
11. [Open questions](#11-open-questions)

## 1. HLD context

> See **HLD-ce99b72065d03b1b** § 2. Framework summary

**Rollout phase:** Phase D — clients render the daemon's definitions
**Consumes:** `sc3` (models.definitions IPC request), `sc4` (Unknown-model check and approval requests), `sc5` (Settings rules and models.resolveRole)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Extending the catalog file, its types (CloudModelCatalogFile, src/daemon/model-catalog.ts:48) and its validator in place; refreshing its contents with today's models, the aliases today's tier defaults use (opus, sonnet, haiku), the Ollama models insrc ships with and their context windows, and today's coreModel as the tool-loop default; the registry and its per-thread cache; moving the boot validation ahead of the settings reconcile and the worker threads; reading the approved-model store (a malformed store is logged and treated as empty); keeping the curated catalog's existing accessor answering providers.listModels from the new file shape until s2 replaces it. The validator refuses a missing or malformed file, an unknown, missing or repeated family, a CLI family without its CLI kind, tier defaults or summariser model, a model without an efforts list, a duplicate id or alias, a default that is not a model of its family, an Ollama model without a token input limit, and a tool-loop default that is not listed, naming the entry (ac3). Tests: one fixture per refusal reason (ac3); a model and alias added to a fixture are served after a restart with no code change (ac2); the file is validated before the settings reconcile, before any worker starts and before listen (ac1, k7); repeated requests in one thread return the same definitions even after the file changes on disk (ac1); a replacement worker started after the file, the store or config.json changed on disk uses the new values while a surviving thread keeps its own until the restart, and a thread whose first read comes after such a change likewise uses the new values; after a daemon restart every thread resolves the same definitions, approvals and tiers; providers.listModels still returns today's Claude and Codex models through the kept accessor; alias, effort and limit lookups; resolveTier distinguishes rejected-model from unlisted-model and falls back to the tier's family default, or the default family's for an Ollama tier. — owns `sc1`, `sc2`
- `s2`: The models.definitions handler and its method-class entry, the projection of the registry, each listed Ollama model's installed state from the existing bounded listing, and re-sourcing providers.listModels from the registry (for Ollama, listed models only), then removing the curated catalog accessor s1 kept. Tests: models.definitions returns every field of a fixture file (ac1); providers.listModels and models.definitions agree for every family, and an installed but unlisted Ollama model appears in neither (ac2); with Ollama not answering, installed is absent and the request still succeeds. — owns `sc3`
- `s3`: Moving every daemon consumer onto the registry: tier resolution, summariser selection, effort forwarding, CliProvider's input budget and CLI kind, OllamaProvider's num_ctx, the tool-loop model (an unlisted coreModel runs the tool-loop default with a warning) and the runner and model literals in routing, provider construction, attribution and workflow code; SUMMARISER_CLI_FALLBACK, CODEX_INPUT_BUDGET_CHARS and ollamaNumCtx go; DEFAULT_TIERS and TIER_EFFORTS stop being written in code and remain only as temporary exports drawn from the definitions for the TUI's model-tiers pane, which s5 migrates; no daemon code uses them. The settings catalog's tier and coreModel defaults and effort values are taken from the definitions; how the settings catalog reaches the file is decided in this Story's LLD and must work in every process that loads the settings catalog today (the daemon, the TUI, the updater, and the VS Code bundle until s6 drops its use). Reconcile removes per-repo tier overrides with a warning and prunes ollamaNumCtx; readRepoOverride and its callers go. config.write refuses a tier set to a rejected model and reports restartRequired. models.resolveRole and its method-class entry. Both installer copies take tier defaults and the tool-loop default from the file. Tests: an unset tier resolves to the file's default, and with a fixture whose defaults differ from today's, reconcile fills the fixture's values (ac1); an unsupported effort is dropped with a warning naming model and effort (ac2); a source scan fails on runner or model literals outside the family implementations, on any read of ollamaNumCtx, and on any daemon use of the temporary DEFAULT_TIERS or TIER_EFFORTS exports (ac3); the TUI still builds and its model-tiers pane shows the definitions' defaults; a repo's `tasks` choice applies with the global tier's model (ac4); reconcile removes per-repo tier overrides with a warning naming repo and tier and keeps `tasks` and coreFloor (ac5); an unlisted model falls back with the warning (decision A); a fixture Ollama model's input limit sets num_ctx; config.write refuses a rejected model and reports restartRequired; models.resolveRole matches the daemon's own resolution for a CLI tier and an Ollama tier; the settings catalog loader accepts the catalog and an unset JetBrains tier still shows the default family's values. — owns `sc5`
- `s4`: The per-family check procedures (Codex: the CLI's model list plus a run; Claude: a run, the input limit from the JSON output, recognised effort names), run one call at a time; telling a reachable CLI that refuses the model apart from an unreachable CLI; refusing approval unless the model ran without error; writing the store atomically and acknowledging a decision only once it is written; the method-class entries. Tests: checks against fake CLIs record each verdict and run one at a time (ac1); results list each claimed level with evidence and nothing is usable before approval (ac2); after approval and a restart only the approved levels are accepted (ac3); a rejected profile or unreachable CLI refuses the model with a reason, and approving a check whose model did not run is refused (ac4); after a restart an approved model appears in models.definitions as user-approved and a rejected one among the rejected ids (ac5); a failed store write returns write-failed and keeps the previous store. — owns `sc4`
- `s6`: The VS Code model-tier picker driven by models.definitions instead of its runner list and the bundled settings catalog's effort rows, removing the bundle's import of the settings catalog; the unknown-model check and approval prompt; the Repo Configuration panel without per-tier fields; showing restartRequired and offering insrc.daemon.restart. Tests: the picker offers exactly a fake answer's options and the bundle keeps no runner or model list (ac1); an unknown model is saved only after approval (ac2); the repo panel shows only `tasks` and coreFloor (ac3).
- `s7`: The JetBrains model-tiers section driven by models.definitions instead of ModelTiersModel.PROVIDERS; the unknown-model check and approval dialog; the per-repo settings without per-tier fields; showing restartRequired. Tests: the section offers exactly a fake answer's options and the plugin keeps no runner or model list (ac1); an unknown model is saved only after approval (ac2); the per-repo settings show only `tasks` and coreFloor (ac3).

## 2. Contract details

**Surface level:** internal

### 2.1 `Services`

```typescript
interface Services { /* existing */ readonly models: { definitions(): Promise<ModelDefinitionsResult>; check(p: { family: CliFamilyId; modelId: string; claimedEfforts: EffortLevel[] }): Promise<ModelCheckResult | { error: string; recoverable: false }>; approve(p: { checkId: string; efforts: EffortLevel[] }): Promise<DecisionResult>; reject(p: { checkId: string }): Promise<DecisionResult>; resolveRole(p: { role: string; repoPath: string }): Promise<RoleResolution | { error: string; recoverable: false }> }; readonly config: { /* show, reload unchanged */ write(path: string | string[], value: unknown): Promise<ConfigWriteResult> } } // src/cli/services/index.ts
```

**Parameters:**
- `models: object of rpc wrappers` — The TUI's only route to the definitions, the check and approval requests and role resolution (sc3, sc4, sc5); tests replace it with a fake.
- `config.write result: ConfigWriteResult` — The sc5 result (ok + restartRequired, or ok:false + reason + detail) instead of { ok: boolean }.

**Returns:** `Services` — makeServices() wires each method to rpc('models.definitions' | 'models.check' | 'models.approve' | 'models.reject' | 'models.resolveRole' | 'config.write'); no method computes anything locally.

**Errors:**
- `Error (rejected promise)` when The daemon socket is unreachable or the request is unknown to an older daemon (rpc rejects); callers show 'the daemon is not running' and keep their previous state.

**Preconditions:**
- The daemon is running for any model data to be shown.

**Postconditions:**
- src/cli imports no getModelRegistry, shippedModelRegistry, DEFAULT_TIERS or TIER_EFFORTS.

### 2.2 `computeEffectiveTiers`

```typescript
computeEffectiveTiers(tiering: AnalyzeTiering, defs: ModelDefinitionsResult): EffectiveTiers  // src/cli/panes/model-tiers.ts
```

**Parameters:**
- `tiering: AnalyzeTiering` — The global tiers, roleTiers and coreFloor from config.show (parseTiering).
- `defs: ModelDefinitionsResult` — The daemon's definitions: default family, each family's tierDefaults, models and efforts.

**Returns:** `EffectiveTiers` — Per tier: the configured {runner, model, effort} when set, else the default family's tierDefault resolved to the model's canonical id (source 'default'); plus a per-tier note when the configured model is not served by its family (it will run the tier default until approved and the daemon restarted). Roles, coreFloor and stale overrides as today.

**Preconditions:**
- defs came from models.definitions.

**Postconditions:**
- Pure: no I/O and no list of its own; DEFAULT_TIERS / resolveTier / the shipped registry are no longer used.

### 2.3 `ModelTiersPane`

```typescript
ModelTiersPane(): ReactElement  // src/cli/panes/ModelTiersPane.tsx — tier row actions: f (family), m (model), n (new model id), e (effort), R (restart daemon)
```

**Returns:** `ReactElement` — Loads config.show and models.definitions together. Family cycles over defs.families; model cycles over the chosen family's models (id, with aliases shown); effort cycles over '' and the chosen model's efforts. Every change writes the whole tier object { runner, model, effort } with one svc.config.write('models.tiers.<tier>', …); changing family picks that family's tierDefault model and effort, changing model drops an effort the new model does not accept. 'n' takes a typed model id: an id the family serves is saved like a pick; an unserved id of a CLI family opens the check screen (an Ollama family refuses: only listed Ollama models are selectable).

**Errors:**
- `toast 'the daemon is not running — start it to edit model tiers'` when models.definitions or config.show fails; no edit is offered.
- `toast '✗ <reason>: <detail>'` when config.write returns ok:false (e.g. rejected-model); nothing is saved locally and the view reloads.

**Preconditions:**
- The daemon answers models.definitions.

**Postconditions:**
- After a save with restartRequired the pane shows 'restart the daemon to apply' with R, which calls svc.daemon.restart and reloads.
- The pane renders no runner, model or effort literal of its own.

### 2.4 `models.check`

```typescript
check screen (in ModelTiersPane): models.check → table → models.approve(checkId, chosen efforts) | models.reject(checkId)
```

**Parameters:**
- `claimedEfforts: EffortLevel[]` — Default: every effort name the family's models list in the definitions; the user may edit the list before the check runs.

**Returns:** `ModelCheckResult then DecisionResult` — Shows 'checking <model> through the <kind> CLI…' while the request runs, then each claimed effort with its verdict (accepted / recognised — unconfirmed / rejected) and evidence, plus runs / inputLimit / error. The user toggles which non-rejected levels to allow and approves (then the tier is saved with that model and the first allowed effort or '') or rejects (nothing saved). Approval is offered only when runs is true.

**Errors:**
- `screen text 'the <kind> CLI could not be reached / refused the model: …'` when The check result has runs:false; only Reject and Back are offered.
- `toast '✗ <reason>: <detail>'` when models.approve / models.reject returns ok:false (unknown-check after a daemon restart, invalid-efforts, write-failed); the screen stays so the user can retry or go back.

**Preconditions:**
- The family has a CLI kind.

**Postconditions:**
- A successful decision shows restartRequired and the restart key (k5: the model is usable only after approval and restart).

### 2.5 `ReposPane`

```typescript
ReposPane(): ReactElement  // src/cli/panes/ReposPane.tsx — 'm' on a selected repo opens its models view
```

**Returns:** `ReactElement` — The models view of the selected repo lists every taxonomy role with the repo's tier (from models.byRepo[<repo>].tasks) or 'global', and the repo coreFloor (or 'global'). Editing a role writes the whole map to ['models','byRepo',<repo>,'tasks'] via nextRoleTiers (clear = drop the key); editing coreFloor writes ['models','byRepo',<repo>,'coreFloor'] (clear = null). The global tier models are shown read-only beside each tier name. There is no runner, model or effort field.

**Errors:**
- `toast '✗ <reason>: <detail>'` when config.write returns ok:false.

**Preconditions:**
- A registered repo is selected.

**Postconditions:**
- No write from this view targets models.byRepo.<repo>.tiers (k6, ac3).

### 2.6 `config set`

```typescript
runConfig('set' | 'unset', [key, ...value], svc): Promise<string[]>  // src/cli/command.ts
```

**Parameters:**
- `key: string` — A dot path; a key under models.byRepo.<repo> other than tasks / tasks.* / coreFloor is refused before any write.

**Returns:** `string[]` — 'set <key> = <value>' plus '(restart the daemon to apply)' when restartRequired; on ok:false '✗ not saved: <reason> — <detail>'; a refused per-repo key: '✗ per-repo settings take only tasks and coreFloor; tiers are global (models.tiers.<tier>)'.

**Errors:**
- `string line` when A rejected write or a refused per-repo key; nothing is written.

**Postconditions:**
- The command bar never reports success for a write the daemon refused (HLD override item 2).

### 2.7 `reviewArtifact`

```typescript
reviewArtifact(repoPath: string, artifactPath: string, reviewFile?: typeof reviewArtifactFile, resolveRole?: Services['models']['resolveRole']): Promise<ReviewArtifactResult>  // src/cli/services/workflow.ts
```

**Parameters:**
- `resolveRole: (p: { role: string; repoPath: string }) => Promise<RoleResolution | { error }>` _(optional)_ — The daemon's resolution of role 'review' for the repo (test seam; default: rpc models.resolveRole).

**Returns:** `ReviewArtifactResult` — Builds the provider from the answer only: cli → new CliProvider({ kind, model, effort, inputBudgetChars from a chars inputLimit }); ollama → new OllamaProvider(model, host, numCtx); model label '<family>:<model>'. No config.json read, no router or registry in the TUI process.

**Errors:**
- `Error('cannot review: the daemon is not running')` when resolveRole rejects.
- `Error('cannot review: <error>')` when resolveRole answers { error }.

**Preconditions:**
- The daemon is running.

**Postconditions:**
- The review runs the family, model and effort the daemon would use (sc5).

### 2.8 `recommendModels`

```typescript
recommendModels(info: SystemInfo, local: { readonly model: string; readonly installed?: boolean | undefined }): ModelRecommendation  // src/shared/model-recommender.ts
```

**Parameters:**
- `local: { model: string; installed?: boolean }` — The definitions' tool-loop model (and its installed state when Ollama answered); replaces DEFAULT_LOCAL_MODEL.

**Returns:** `ModelRecommendation` — coder.model = local.model; coder.pull = installed === false, or not in info.ollama.models when installed is absent; the VRAM note and context sizing keep the existing estimate, now named a generic local-model estimate; params / quantization become '' (unknown) rather than another model's facts.

**Preconditions:**
- The caller obtained the tool-loop model from the daemon (TUI: models.definitions; daemon system.recommend: its registry's toolLoopModel()).

**Postconditions:**
- src/shared/model-recommender.ts names no model of the definitions.

### 2.9 `SetupPane`

```typescript
SetupPane(): ReactElement  // src/cli/panes/SetupPane.tsx; Services.setup.recommend(info, defs) async
```

**Returns:** `ReactElement` — Fetches models.definitions; recommends the ollama family's toolLoopModel with its installed flag. When the daemon does not answer it shows 'cannot recommend a local model: the daemon is not running' and disables apply and pull.

**Errors:**
- `rendered notice` when models.definitions rejects.

**Postconditions:**
- No local model name is chosen by the TUI.

## 3. Data model changes

### 3.1 `TUI model lists and stopgap` — field-remove

Removes the temporary DEFAULT_TIERS and TIER_EFFORTS exports (src/config/analyze.ts:120, src/config/analyze.ts:132) and their derivation-only uses, src/cli/shipped-model-registry.ts and its test, DEFAULT_LOCAL_MODEL, EFFORT_CYCLE's static list and the pane's runner literals. The literal scan drops its src/cli and src/shared/model-recommender.ts exclusions (owner s5), keeping one named exclusion for the `ollama` program name in src/cli/services/setup.ts if the scan flags it.

**Call sites:**
- `src/config/analyze.ts:120`
- `src/config/analyze.ts:132`
- `src/cli/panes/model-tiers.ts:102`
- `src/cli/shipped-model-registry.ts:20`
- `src/cli/services/workflow.ts:250`
- `src/shared/model-recommender.ts:22`
- `src/daemon/__tests__/model-literal-scan.test.ts:30`
- `src/daemon/__tests__/model-literal-scan.test.ts:35`

### 3.2 `Tier writes from the TUI` — invariant-change

A tier is written as one object { runner, model, effort } at models.tiers.<tier> (one config.write) instead of three field writes, so a runner is never saved without a model of its family; the effort written is one the chosen model lists, or ''. Per-repo writes from any TUI path are limited to models.byRepo.<repo>.tasks and .coreFloor.

```
- config.write models.tiers.<tier>.{runner|model|effort}
+ config.write models.tiers.<tier> = { runner, model, effort }
```

**Call sites:**
- `src/cli/panes/ModelTiersPane.tsx:91`
- `src/cli/panes/ModelTiersPane.tsx:125`
- `src/cli/command.ts:390`
- `src/cli/command.ts:398`

### 3.3 `Daemon system.recommend` — field-modify

The daemon's system.recommend handler passes getModelRegistry().toolLoopModel().id to recommendModels; its result shape is unchanged.

**Call sites:**
- `src/daemon/handler-runtime.ts:1202`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc3` | consumes | The pane, the check screen's default claimed efforts, the repo view's read-only tier models and Setup read models.definitions; nothing is cached across pane reloads. |
| `sc4` | consumes | The check screen calls models.check / models.approve / models.reject as sketched and shows each effort's verdict and evidence, refusals and restartRequired. |
| `sc5` | consumes | config.write's ok / restartRequired / reason / detail are shown by the pane, the repo view and the command bar; the review command uses models.resolveRole. The daemon still accepts a models.byRepo.<repo>.tiers write (pruned at the next boot); the TUI never sends one, and a daemon-side refusal is left to sc5's owner (open question). |

## 5. Error paths

**Error cases**

- **The daemon is not running when the Model Tiers pane, the repo models view or Setup opens.** (recoverable)
  - Detection: svc.models.definitions() or svc.config.show() rejects (the rpc client cannot connect to the socket).
  - Response: The pane shows 'the daemon is not running — start it to edit model tiers' with r to retry; Setup shows 'cannot recommend a local model: the daemon is not running' and disables apply and pull. No list is shown from any other source.
  - User impact: The user cannot pick a model without the daemon, but is told why and how to recover.
- **An older daemon does not know models.definitions / models.check / models.resolveRole.** (recoverable)
  - Detection: rpc rejects with the daemon's unknown-method error.
  - Response: Shown like the daemon-down case with the error text, suggesting `daemon update`; nothing is written.
  - User impact: The user learns the daemon must be updated.
- **config.write refuses a tier, repo or command-bar write (rejected-model, invalid-path).** (recoverable)
  - Detection: The ConfigWriteResult has ok:false; reason and detail are read from it.
  - Response: Toast / command output '✗ not saved: <reason> — <detail>'; the pane reloads from config.show so it never shows the refused value as saved.
  - User impact: A refused save is never reported as saved (override item 2).
- **The unknown-model check fails: CLI unreachable, model refused, or unreadable output.** (recoverable)
  - Detection: The ModelCheckResult has runs:false and an error string.
  - Response: The check screen shows the error and every effort's evidence, offers only Reject and Back, and saves no tier.
  - User impact: The user sees why the model cannot be used; k5 holds.
- **models.approve / models.reject refuses (unknown-check after a restart or eviction, invalid-efforts, write-failed).** (recoverable)
  - Detection: The DecisionResult has ok:false with reason and detail.
  - Response: Toast with reason and detail; on unknown-check the screen offers 'check again'; no tier is saved.
  - User impact: The decision is not recorded and the user can retry.
- **models.check answers invalid-params (the id is already served, or the family has no CLI kind).** (recoverable)
  - Detection: The reply has an error field starting 'invalid-params:'.
  - Response: Shown on the screen; for an already-served id the pane offers to save it as a normal pick.
  - User impact: No check runs for a model the daemon already knows.
- **The review command cannot resolve the review role.** (recoverable)
  - Detection: svc.models.resolveRole rejects or answers { error }.
  - Response: reviewArtifact throws 'cannot review: …'; the command prints it and runs no review.
  - User impact: No review runs on a model the daemon would not use.
- **The daemon restart offered after a save fails.** (recoverable)
  - Detection: svc.daemon.restart resolves a MaintenanceResult with ok false, or rejects.
  - Response: Toast with the failure; the 'restart to apply' line stays.
  - User impact: The user knows the change is not yet in force.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| config.json sets a tier to a model its family does not serve (unlisted, or approved but before a restart). | The pane shows the configured model with a note that the tier runs its default until the model is approved and the daemon restarted; it does not invent efforts for it (effort cycle offers only ''). |
| A tier's configured effort is not accepted by its model. | Shown with a 'not accepted — runs at the CLI default' note; cycling effort offers only the model's efforts and ''. |
| Changing a tier's family. | One write sets runner, the new family's tierDefault model and its effort (or ''), never a runner with the old family's model. |
| A typed model id equals an alias of a served model. | Saved as that model (no check); the pane shows the canonical id. |
| An unknown id typed for the Ollama family. | Refused with 'only listed Ollama models are selectable'; no check. |
| A model the user had rejected is typed again. | models.check runs (the daemon allows re-checking); a later approval supersedes the rejection after a restart. |
| Ollama did not answer, so a listed Ollama model's installed is absent. | The pane and Setup show the model without an installed mark; Setup's pull falls back to the local install check. |
| A repo with no byRepo entry is opened in the repo models view. | Every role shows 'global' and coreFloor 'global'; the first edit creates models.byRepo.<repo>.tasks (or coreFloor) only. |
| Role ids contain dots (e.g. context.assemble). | The repo view writes the whole tasks map at an array path so dotted role ids stay flat keys. |
| `config set models.byRepo./w/repo.tiers.core.model x` in the command bar. | Refused before any write with the per-repo message; `config set models.byRepo./w/repo.coreFloor core` is written. |

**Invariants to preserve**

- Role ids keep their dots as flat keys: a role-tier map is always written whole at a dotless or array path, never per role at a dotted path (nextRoleTiers / ROLE_TIERS_PATH). [[c10]]
- The TUI never opens daemon-owned state: config, definitions and approvals come only through daemon requests (Services facade), and the review command no longer reads config.json. [[c2]]
- computeEffectiveTiers stays pure and is the one source the pane renders and edits against, so what is shown and what is saved cannot diverge. [[c3]]
- No model name, runner literal or effort list is held in src/cli or src/shared/model-recommender.ts; the literal scan enforces it once its s5 exclusions are removed. [[c8]]
- An unknown model is saved to a tier only after the user approves its check (k5); a failed check offers no approval. [[c1]]

## 6. Test strategy

**Test framework:** `node:test + node:assert/strict via tsx; TUI components rendered with ink-testing-library against a fakeServices() object (src/cli/__tests__/tui.test.ts); pure pane logic and the command bar tested directly (src/cli/__tests__/model-tiers.test.ts, src/cli/__tests__/command.test.ts)`

**Test levels**

- **unit** — The pure tier overlay over a fake definitions answer, the recommender with a passed-in local model, the command-bar guard and result rendering, and the review command's provider construction.
  - Subjects: `src/cli/__tests__/model-tiers.test.ts: computeEffectiveTiers(tiering, fakeDefs) — an unset tier shows the fake default family's tierDefault as a canonical id; a set tier shows its value; a configured model the family does not serve carries the 'not served' note; effort choices for a tier are exactly '' plus the chosen model's efforts in the fake answer; no import of DEFAULT_TIERS / TIER_EFFORTS / shippedModelRegistry`, `src/cli/__tests__/model-tiers.test.ts: tier edit helpers — changing family yields { runner: newFamily, model: its tierDefault model, effort: its tierDefault effort or '' }; changing model drops an effort the new model does not list; a typed id that is an alias resolves to the canonical id; an unserved id of a CLI family asks for a check; an unserved Ollama id is refused`, `src/cli/__tests__/command.test.ts: config set / unset — a models.byRepo.<repo>.tiers... key is refused with the per-repo message and the fake config.write is never called; models.byRepo.<repo>.coreFloor and .tasks are written; an ok:false result prints '✗ not saved: <reason> — <detail>' and never 'set'; restartRequired prints the restart hint`, `src/shared/__tests__/model-recommender.test.ts: recommendModels(info, { model: 'fake-local:1', installed: false }) recommends that model with pull true; installed absent falls back to info.ollama.models; the module names no definitions model`, `src/cli/services/__tests__/review-resolve-role.test.ts: reviewArtifact with a fake resolveRole — a cli answer builds CliProvider with that kind, model, effort and a chars input budget; an ollama answer builds OllamaProvider with that model, host and numCtx; the model label is '<family>:<model>'; a rejecting or { error } resolveRole throws 'cannot review: …' and reviewFile is never called; config.json is not read (HOME points at a directory without one)`
  - Fixtures: `A fake ModelDefinitionsResult whose families, models and efforts differ from the shipped file (so a match can only come from the answer)`, `Fake Services with recording config.write, models.* and daemon.restart`
- **integration** — The panes rendered as the user sees them, driven by keystrokes against fake services.
  - Subjects: `src/cli/__tests__/tui-models.test.ts: Model Tiers pane — with a fake definitions answer, pressing f / m / e cycles exactly the fake families, models and efforts, and each change makes one config.write('models.tiers.<tier>', { runner, model, effort }); a restartRequired result shows the restart line and R calls daemon.restart; an ok:false result shows the reason and the pane reloads`, `src/cli/__tests__/tui-models.test.ts: unknown model — typing an unserved id with n calls models.check with the family's effort names, renders each effort's verdict and evidence, approve calls models.approve with the toggled levels then saves the tier, reject calls models.reject and saves nothing; a runs:false result offers no approve; a failed approve shows its reason`, `src/cli/__tests__/tui-models.test.ts: repo models view — m on a repo shows roles with the repo's tier or 'global' and coreFloor; editing a role writes the whole map at ['models','byRepo',<repo>,'tasks'] with dotted role ids as flat keys; editing coreFloor writes ['models','byRepo',<repo>,'coreFloor']; the view renders no runner, model or effort field and makes no write under tiers`, `src/cli/__tests__/tui-models.test.ts: daemon down — rejecting models.definitions shows the not-running message in the Model Tiers pane and Setup, with no model list and apply / pull disabled; Setup with a fake answer recommends its ollama toolLoopModel`, `src/daemon/__tests__/model-literal-scan.test.ts: the src/cli and model-recommender exclusions are gone and the scan passes over src/cli and src/shared/model-recommender.ts; no source file exports or imports DEFAULT_TIERS or TIER_EFFORTS, and src/cli/shipped-model-registry.ts no longer exists`, `src/daemon/__tests__/system-recommend.test.ts: the daemon's system.recommend over a fixture definitions file recommends that file's tool-loop model`
  - Fixtures: `ink-testing-library render of App with fakeServices() extended with models.* and the new config.write result`, `A temp INSRC_MODEL_CATALOG_DIR fixture whose tool-loop model differs from the shipped one`
- **smoke** — The TUI still builds and starts.
  - Subjects: `npx tsc --noEmit -p tsconfig.json over src (including the TUI) and a tsc pass over the changed TUI test files; the existing src/cli/__tests__/tui.test.ts suite passes`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `model-tiers.test.ts: computeEffectiveTiers(tiering, fakeDefs) — defaults and effort choices from the fake answer only`, `tui-models.test.ts: Model Tiers pane — f / m / e cycle exactly the fake families, models and efforts and write one tier object`, `model-literal-scan.test.ts: src/cli and the recommender scanned; no DEFAULT_TIERS / TIER_EFFORTS / shipped registry` |
| `ac2` | `model-tiers.test.ts: an unserved id of a CLI family asks for a check; an Ollama id is refused`, `tui-models.test.ts: unknown model — check, verdict table, approve saves the tier, reject saves nothing, runs:false offers no approve` |
| `ac3` | `tui-models.test.ts: repo models view edits only the tasks map and coreFloor and writes nothing under tiers`, `command.test.ts: config set refuses models.byRepo.<repo>.tiers keys and writes tasks / coreFloor` |

## 7. Migration

**State before:** The Model Tiers pane overlays config onto DEFAULT_TIERS and resolves tiers through the shipped-only registry stopgap (src/cli/panes/model-tiers.ts:59, src/cli/shipped-model-registry.ts:20); runner, model and effort are three free-text / cycle field writes validated against literals (src/cli/panes/ModelTiersPane.tsx:91-131) and the effort cycle is the static TIER_EFFORTS list (src/cli/panes/model-tiers.ts:102). The review command resolves its model in the TUI process from config.json (src/cli/services/workflow.ts:244). Setup recommends the fixed DEFAULT_LOCAL_MODEL (src/shared/model-recommender.ts:22), also used by the daemon's system.recommend (src/daemon/handler-runtime.ts:1202). There is no per-repo settings view, and `config set|unset` ignores config.write's result (src/cli/command.ts:390-400). The literal scan excludes src/cli and the recommender (src/daemon/__tests__/model-literal-scan.test.ts:30-36).

**State after:** The TUI holds no model list: the Model Tiers pane, the check screen, the repo models view and Setup read models.definitions through Services.models; tiers are written whole; an unserved model goes through models.check / approve / reject; the review command builds its provider from models.resolveRole; recommendModels takes the local model from the caller (the TUI from the definitions, the daemon from its registry). The Repos pane has a models view limited to tasks and coreFloor, and the command bar refuses per-repo tier keys and reports refusals and restartRequired. DEFAULT_TIERS, TIER_EFFORTS, DEFAULT_LOCAL_MODEL and the shipped-registry stopgap are gone, and the literal scan covers src/cli and the recommender.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add Services.models (definitions, check, approve, reject, resolveRole) over rpc and type config.write's result as ConfigWriteResult; update the fake services used by the TUI tests. — ↩ rollbackable
2. Make computeEffectiveTiers take the definitions answer and rework the Model Tiers pane to cycle families, models and efforts from it, write whole tiers, show refusals and restartRequired with a restart key, and add the unknown-model check screen. — ↩ rollbackable
3. Add the repo models view to the Repos pane and the per-repo key guard plus result reporting to `config set|unset`. — ↩ rollbackable
4. Switch the review command to models.resolveRole and build its provider from the answer; delete src/cli/shipped-model-registry.ts and its test. — ↩ rollbackable
5. Make recommendModels take the local model; Setup fetches it from models.definitions (and says it cannot recommend without the daemon); the daemon's system.recommend passes its registry's tool-loop model; remove DEFAULT_LOCAL_MODEL. — ↩ rollbackable
6. Remove the DEFAULT_TIERS and TIER_EFFORTS exports and drop the literal scan's src/cli and model-recommender exclusions (naming any remaining program-name exclusion with its owner). — ↩ rollbackable

**Backward compat:** No daemon request or config shape changes: config.json keeps the same models.tiers objects (now written whole rather than field by field) and byRepo tasks / coreFloor. The daemon's system.recommend keeps its result shape, now recommending the definitions' tool-loop model. Internal exports removed (DEFAULT_TIERS, TIER_EFFORTS, DEFAULT_LOCAL_MODEL, shippedModelRegistry) have no consumers outside src/cli after s3 (pinned by the literal scan); the VS Code and JetBrains plugins do not import them. A TUI run against a daemon older than s2/s4 shows 'update the daemon' instead of a model list.

## 8. Alternatives considered

### 8.1 a1: Definitions-driven pane and services; repo rule enforced in the command bar only

The TUI fetches models.definitions and models.resolveRole through a new Services.models facade; the pane offers families, models and efforts from the answer; unknown models go through models.check / approve / reject; per-repo model writes are guarded only in `config set`.

Services gains `models: { definitions(), check(params), approve(params), reject(params), resolveRole(params) }` over rpc, and config.write's typed result ({ ok, restartRequired? } | { ok:false, reason, detail }). computeEffectiveTiers(tiering, defs) takes the ModelDefinitionsResult instead of DEFAULT_TIERS + shippedModelRegistry: an unset tier shows its default family's tierDefault (canonical id), a set tier shows its value, efforts come from the chosen model. The pane edits a tier by choosing a family (cycle over defs.families), a model (cycle over that family's models, or enter an id) and an effort (cycle over that model's efforts, '' first), writing the whole tier object {runner, model, effort} with one config.write so no half-edited tier is saved. An entered id the family does not serve opens a check screen: claimed efforts (default: the family's effort names), svc.models.check, a table of effort / verdict / evidence, toggles for the non-rejected levels, approve (then save the tier) or reject; Ollama has no such flow. Every successful save or decision that reports restartRequired shows a 'restart to apply' line with a key that runs svc.daemon.restart. The review command calls svc.models.resolveRole({ role: 'review', repoPath }) and builds CliProvider / OllamaProvider from the answer. Setup's recommendation takes the local model from the definitions' toolLoopModel (and its installed flag), and says it cannot recommend when the daemon is not answering; recommendModels takes the local model as a parameter and the daemon's system.recommend passes its registry's tool-loop model. DEFAULT_TIERS, TIER_EFFORTS, DEFAULT_LOCAL_MODEL and src/cli/shipped-model-registry.ts are removed; the literal scan drops its src/cli and model-recommender exclusions. ac3: `config set|unset` refuses any models.byRepo.<repo> key other than tasks / coreFloor, and prints a refusal reason and restartRequired.

**Rejected because:** Meets ac1, ac2 and every contract, but ac3 only partially: the TUI still shows no repo settings.

### 8.2 a2: a1 plus a repo model-settings view limited to tasks and coreFloor — **CHOSEN**

As a1, and the Repos pane gains a per-repo model view that shows and edits only the repo's role→tier map and coreFloor.

Everything in a1. In addition the Repos pane gets a 'models' view for the selected repo (key `m`): it reads models.byRepo[<repo>] from config.show, lists each taxonomy role with the repo's tier override (or 'global'), and lets the user set a role's tier (core / mid / cheap or clear) and the repo coreFloor. Writes go to the array path ['models','byRepo',<repo>,'tasks'] (the whole map, as the pane already does for global tasks) and ['models','byRepo',<repo>,'coreFloor']. The view has no runner, model or effort field; tier models are shown read-only from the global tiers so the user sees what a role will run. The command-bar guard of a1 stays, so no TUI path writes a per-repo tier.

### 8.3 a3: Client-side registry over the definitions answer

The TUI builds a ModelRegistry from the models.definitions answer and keeps using resolveTier, the role router and loadAnalyzeConfig locally.

A TUI adapter turns ModelDefinitionsResult back into a ModelDefinitionsFile + approved profiles and calls buildModelRegistry, so computeEffectiveTiers, the review command's createRoleRouter and the pane keep their current code with this registry in place of shippedModelRegistry; config comes from config.show instead of reading config.json.

**Rejected because:** Smallest diff but violates sc5 and k2 and leaves ac2 and ac3 unaddressed.

## 9. UX

- [UX mock](docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/S005/ux-mock.html)

## 10. References

- **[[c1]]** `prior-artifact` `HLD-ce99b72065d03b1b` — "s5 boundary: the TUI model-tiers pane from models.definitions, the unknown-model check and approval screen, the repo settings view limited to tasks and coreFloor, restartRequired, the review command v"
- **[[c2]]** `analyze-bundle` `s1 symbol.locate (Daemon requests and services the TUI reaches)` — "The TUI reaches the daemon only through rpc behind the Services facade (src/cli/services/index.ts), which tests replace with a fake."
- **[[c3]]** `code` `src/cli/panes/model-tiers.ts:59` — "export function computeEffectiveTiers(tiering: AnalyzeTiering): EffectiveTiers {"
- **[[c4]]** `code` `src/cli/panes/ModelTiersPane.tsx:91` — "const v = input.trim();"
- **[[c5]]** `code` `src/cli/services/workflow.ts:244` — "export async function reviewArtifact("
- **[[c6]]** `code` `src/cli/command.ts:390` — "case 'set': {"
- **[[c7]]** `code` `src/shared/model-recommender.ts:108` — "export function recommendModels(info: SystemInfo): ModelRecommendation {"
- **[[c8]]** `code` `src/daemon/__tests__/model-literal-scan.test.ts:30` — "{ file: 'src/cli/', owner: 's5', why: 'the TUI moves to models.definitions / models.resolveRole in s5' },"
- **[[c9]]** `step-output` `s3` — "winnerId a2: satisfies ac1, ac2 and ac3 with sc3, sc4, sc5, k2, k5 and k6."
- **[[c10]]** `code` `src/cli/panes/model-tiers.ts:129` — "export function nextRoleTiers("

## 11. Open questions

- Checklist ep3 (partial): the k5 invariant (an unknown model is saved only after approval) is a DEF constraint carried by the HLD (c1); its code evidence is the s4 check result shape (src/daemon/model-check.ts), not an s1 analyze bundle.
- sc5 (owner s3): config.write still accepts models.byRepo.<repo>.tiers and only the next boot's reconcile prunes it. s5 never sends such a write from the TUI; should config.write refuse it so every client (VS Code s6, JetBrains s7, a hand-written request) is held to k6?
- recommendModels keeps a generic VRAM estimate for the local model to size the context shape; the definitions carry no memory figure for an Ollama model. Should the definitions gain one, or is the estimate acceptable?
