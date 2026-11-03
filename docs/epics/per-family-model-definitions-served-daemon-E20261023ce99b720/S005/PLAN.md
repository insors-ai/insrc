<!-- insrc:artifact PLAN-ce99b72065d03b1b-s5 -->

# Plan: E20261026ce99b720:S005

## Summary

**Epic:** `per-family-model-definitions-served-daemon`
**LLD run:** `wf-1793013020516-sh4x6w`
**LLD effective hash:** `c324f041e3e7...`

Building s5 moves the terminal UI onto the daemon's model definitions. It starts with three small foundations: the shared IPC client stops hanging when the daemon drops a connection, Ollama model definitions gain an optional memory figure, and config.write refuses per-repo tier settings. On top of a new Services.models facade, the Setup recommendation, the Model Tiers pane with its unknown-model check screen, the Repos models view, the command bar and the review command are moved to the daemon's answers, and finally the TUI's temporary model lists are removed and the literal scan is widened to cover the TUI.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Shared rpc client settles on a lost connection | S | — | unit: ipc-client.test.ts: a connection lost after the request (end/close or ECONNRESET then close) rejects with DaemonDisconnectedError; pre-connect refusal and replies unchanged | [[c1]] [[c11]] |
| 2 | **`t2`** Optional memory estimate on Ollama model definitions | M | — | unit: model-catalog.test.ts: memoryMb accepted on Ollama models, refused when not a positive integer or on a CLI model; unit: model-definitions.test.ts: models.definitions carries memoryMb for an Ollama model that has it; unit: model-catalog-asset.test.ts: every shipped Ollama model has memoryMb and the build gate passes | [[c15]] |
| 3 | **`t3`** config.write refuses per-repo tier writes | S | — | unit: config-write-models.test.ts: writes adding or changing models.byRepo.<repo>.tiers (directly or through a parent object) are refused with 'per-repo-tier'; tasks / coreFloor and unrelated writes succeed | [[c14]] |
| 4 | **`t4`** Services.models facade and typed config.write result | S | `t1`, `t3` | unit: services.test.ts: Services.models calls the matching rpc methods with their params | [[c2]] |
| 5 | **`t5`** Setup recommends the definitions' tool-loop model | M | `t2`, `t4` | unit: model-recommender.test.ts: recommendModels uses the passed local model, installed flag and memoryMb, falling back to the generic estimate; unit: command.test.ts: setup show\\|apply\\|pull recommend the definitions' tool-loop model and stop with the not-running line when the daemon is down; integration: system-recommend.test.ts: the daemon's system.recommend recommends a fixture file's tool-loop model | [[c9]] [[c15]] |
| 6 | **`t6`** Pure tier overlay and edit helpers over the definitions | M | `t4` | unit: model-tiers.test.ts: computeEffectiveTiers over a fake definitions answer, with the daemon's effort precedence; unit: model-tiers.test.ts: tier edit helpers (family without tierDefaults, effort drop, alias, unserved ids) | [[c3]] [[c4]] [[c12]] |
| 7 | **`t7`** Model Tiers pane on the definitions | M | `t6` | integration: tui-models.test.ts: Model Tiers pane cycles the fake answer's families, models and efforts and writes whole tiers; unserved model has no effort edit; refusals and restart shown; integration: tui-models.test.ts: daemon down shows the not-running message in the Model Tiers pane and Setup | [[c4]] [[c11]] [[c12]] |
| 8 | **`t8`** Unknown-model check screen | M | `t7`, `t1` | integration: tui-models.test.ts: unknown model check, approve then restart then save, reject, runs:false; integration: tui-models.test.ts: interrupted check and outcome-unknown decision | [[c5]] [[c11]] [[c12]] |
| 9 | **`t9`** Repos models view and command-bar model keys | M | `t4` | integration: tui-models.test.ts: repo models view edits only tasks and coreFloor; unit: command.test.ts: config set / unset refuse model keys and report refusals and restartRequired | [[c6]] [[c7]] [[c12]] |
| 10 | **`t10`** Review command from models.resolveRole | S | `t4` | unit: review-resolve-role.test.ts: reviewArtifact builds its provider from a fake models.resolveRole answer and refuses without one | [[c8]] [[c12]] |
| 11 | **`t11`** Remove the temporary exports and widen the literal scan | S | `t5`, `t6`, `t7`, `t8`, `t10` | unit: no-default-tiers.test.ts: no file under src imports or exports DEFAULT_TIERS / TIER_EFFORTS; unit: model-literal-scan.test.ts: the scan covers src/cli and the recommender; smoke: tsc over src and the changed TUI tests; tui.test.ts passes | [[c10]] [[c13]] [[c12]] |

### 1.1 E20261026ce99b720:S005:T001 — Shared rpc client settles on a lost connection

In src/shared/ipc-client.ts make rpc settle exactly once and add DaemonDisconnectedError (code 'disconnected', method, cause): after the request is written, any socket error (ECONNRESET, EPIPE, ...) or end / close with no reply rejects with it; ENOENT / ECONNREFUSED before the write keep the 'daemon is not running' message; a close after a reply changes nothing.

**Acceptance checks:**
- Through the connect seam: end then close with no reply rejects with DaemonDisconnectedError naming the method
- ECONNRESET after the write, then close, rejects with DaemonDisconnectedError whose cause is the ECONNRESET error
- ECONNREFUSED before connect still rejects 'daemon is not running'; a reply followed by close resolves once; an error reply rejects with the daemon's message
- The existing ipc-client tests pass unchanged

### 1.2 E20261026ce99b720:S005:T002 — Optional memory estimate on Ollama model definitions

Add an optional memoryMb (approximate memory in MB the model needs at its base context) to ModelDefinition, accepted only on Ollama models and validated as a positive integer when present (named refusal otherwise); set it for every shipped Ollama model (qwen3.6:27b = 14000, today's estimate); carry it through the registry's ResolvedModel and the models.definitions projection (sc3 additive field); the build gate (scripts/check-model-definitions.mjs) accepts the shipped file.

**Acceptance checks:**
- The validator accepts an Ollama model with memoryMb 14000 and one without it; it refuses memoryMb 0, -1, 1.5, '14000' and memoryMb on a CLI-family model, naming the entry
- Every Ollama model in the shipped file has memoryMb, and the build gate passes on it
- models.definitions returns memoryMb for an Ollama model that has it and omits it otherwise
- Existing model-catalog, registry, definitions and asset tests pass
- The VS Code manifest check (sync-manifest-catalog --check) and the JetBrains fixture test pass, regenerating the fixture if it mirrors the shipped file
- session-source-inventory.test.ts passes, refreshing only this task's entries

### 1.3 E20261026ce99b720:S005:T003 — config.write refuses per-repo tier writes

In applyConfigWrite (src/daemon/config-write.ts) refuse, before anything is written, a write whose candidate config adds or changes anything under models.byRepo.<repo>.tiers for any repo (including through a parent-object write such as models or models.byRepo), with reason 'per-repo-tier' and a detail naming each offending key; a write that leaves pre-existing per-repo tiers untouched (pruned at the next boot) is not refused; tasks and coreFloor under byRepo stay writable.

**Acceptance checks:**
- config.write of models.byRepo./w/repo.tiers.core.model, of models.byRepo with a tiers object and of models with one are refused with reason 'per-repo-tier' naming the keys, and config.json is unchanged
- models.byRepo./w/repo.tasks and .coreFloor writes succeed
- An unrelated write to a config that already holds per-repo tiers succeeds
- session-source-inventory.test.ts passes, refreshing only this task's own entries

### 1.4 E20261026ce99b720:S005:T004 — Services.models facade and typed config.write result

Add Services.models { definitions, check, approve, reject, resolveRole } over rpc in src/cli/services/index.ts (plus a small src/cli/services/models.ts), type svc.config.write as the sc5 ConfigWriteResult (with the t3 'per-repo-tier' reason), and extend the fake services used by the TUI tests.

**Acceptance checks:**
- makeServices().models methods call rpc with 'models.definitions' / 'models.check' / 'models.approve' / 'models.reject' / 'models.resolveRole' and the given params
- svc.config.write's type carries ok, restartRequired, reason and detail
- The existing TUI tests pass with the extended fake services

### 1.5 E20261026ce99b720:S005:T005 — Setup recommends the definitions' tool-loop model

recommendModels(info, local: { model, installed?, memoryMb? }) replaces DEFAULT_LOCAL_MODEL: the recommended local model and its pull flag come from the caller, the memory figure from memoryMb with the generic estimate only when absent, and params / quantization become ''. svc.setup.recommend(info, local); SetupPane and runSetup fetch models.definitions first (ollama family's toolLoopModel with installed and memoryMb) and stop with 'cannot recommend a local model: the daemon is not running' when it fails; the daemon's system.recommend passes its registry's tool-loop model and memoryMb; DEFAULT_LOCAL_MODEL is removed.

**Acceptance checks:**
- recommendModels recommends the passed model with pull from installed (or info.ollama.models when absent) and sizes with memoryMb when given, the generic estimate otherwise
- Setup pane and `setup show|apply|pull` recommend a fake answer's toolLoopModel; with models.definitions rejecting they show the not-running line and call neither apply nor pullModels
- system.recommend over a fixture definitions file recommends that file's tool-loop model
- src/shared/model-recommender.ts names no definitions model
- session-source-inventory.test.ts passes, refreshing only this task's entry for src/daemon/handler-runtime.ts

### 1.6 E20261026ce99b720:S005:T006 — Pure tier overlay and edit helpers over the definitions

computeEffectiveTiers(tiering, defs) in src/cli/panes/model-tiers.ts: default tiers from the answer's default family (canonical ids) with the daemon's effort precedence (tiering.efforts, explicit '' kept, else the tierDefault's), the 'not served' note, roles / floor / stale overrides as today. Pure edit helpers: family switch (tierDefaults[tier], else toolLoopModel with '', else first model), model switch dropping an unaccepted effort, effort choices ('' plus the model's efforts; none for an unserved model), typed-id resolution (alias to canonical; unserved CLI id asks for a check; unserved Ollama id refused). Migrate src/cli/__tests__/model-tiers.test.ts to a fake answer.

**Acceptance checks:**
- Defaults and effort choices come only from a fake answer whose values differ from the shipped file
- core.model '' with core.effort 'high' shows 'high'; explicit '' shows ''; no effort shows the tierDefault's
- Family switch to a family without tierDefaults yields its toolLoopModel with ''; an unserved configured model has no effort choices
- model-tiers.ts imports no DEFAULT_TIERS, TIER_EFFORTS, resolveTier or shippedModelRegistry

### 1.7 E20261026ce99b720:S005:T007 — Model Tiers pane on the definitions

Rework src/cli/panes/ModelTiersPane.tsx: load config.show and models.definitions together; f / m / e cycle families, models and efforts from the answer; each change writes the whole tier object with one config.write; e is disabled on an unserved model; ok:false results show reason and detail and reload; restartRequired shows the restart line and R calls svc.daemon.restart; a daemon-down or old-daemon failure shows the not-running message; n with an unserved CLI-family id hands off to the check screen (t8).

**Acceptance checks:**
- With a fake answer, f / m / e cycle exactly its families, models and efforts, each change making one config.write('models.tiers.<tier>', { runner, model, effort })
- A tier set to an unlisted model: e writes nothing and shows the hint
- ok:false shows the reason; restartRequired shows the line and R calls daemon.restart
- A rejecting models.definitions shows the not-running message and no list

### 1.8 E20261026ce99b720:S005:T008 — Unknown-model check screen

The check screen is its own component, src/cli/panes/ModelCheckScreen.tsx, rendered by the pane. The check screen: claimed efforts (default the family's effort names), models.check while showing 'checking ...', the verdict table with evidence, runs / limit / error, toggles for non-rejected levels; approve records the decision and shows 'approved — restart the daemon to use it' with R = restart then save the tier; reject saves nothing; runs:false offers only Reject / Back; DaemonDisconnectedError on check = 'interrupted — check again', on approve / reject = 'outcome unknown — reload' (reload reads models.definitions, never re-sends); failed restart and refused save after restart are shown without re-approving.

**Acceptance checks:**
- n with an unserved id calls models.check with the family's effort names and renders each verdict and its evidence
- approve calls models.approve with the toggled levels and saves nothing; R calls daemon.restart and only then config.write; a failed restart shows 'approval recorded; restart failed' with no save and no second approve; a refused save shows its reason
- reject saves nothing; runs:false offers no approve
- Disconnect on check shows 'interrupted'; on approve shows 'outcome unknown' and reload reports the model's status without calling approve again

### 1.9 E20261026ce99b720:S005:T009 — Repos models view and command-bar model keys

ReposPane keeps its four props; m opens the models view of props.selectedRepo listing each taxonomy role with the repo tier or 'global' and the repo coreFloor, writing the whole tasks map at ['models','byRepo',<repo>,'tasks'] and coreFloor at ['models','byRepo',<repo>,'coreFloor'] (no runner / model / effort field). runConfig refuses keys models, models.tiers*, models.tasks*, models.byRepo* before writing, and for other keys prints '✗ not saved: <reason> — <detail>' on ok:false and the restart hint on restartRequired.

**Acceptance checks:**
- The repo view edits only the tasks map (dotted role ids and dotted repo paths as flat literal segments) and coreFloor, and writes nothing under tiers
- App still renders ReposPane with its four props
- config set / unset refuse the model keys (including object values for models.byRepo) without calling config.write; a non-model key is written; refusals and restartRequired are printed

### 1.10 E20261026ce99b720:S005:T010 — Review command from models.resolveRole

reviewArtifact takes an optional resolveRole seam (default svc.models.resolveRole / rpc) and builds CliProvider({ kind, model, effort, chars inputBudget }) or OllamaProvider(model, host, numCtx) from the answer; 'cannot review: …' on rejection or { error }; no createRoleRouter / loadAnalyzeConfig / registry. Migrate review-source-roots-daemon.test.ts and same-party-refusal.test.ts to pass the seam; delete src/cli/shipped-model-registry.ts and src/cli/__tests__/tui-shipped-registry.test.ts.

**Acceptance checks:**
- A cli answer builds CliProvider with its kind, model, effort and chars budget; an ollama answer builds OllamaProvider with the answer's model, host and numCtx even with a config.json naming others
- A rejecting or { error } resolveRole throws 'cannot review: …' and runs no review
- The two migrated review tests keep their source-root and same-party assertions
- src/cli/shipped-model-registry.ts no longer exists

### 1.11 E20261026ce99b720:S005:T011 — Remove the temporary exports and widen the literal scan

Migrate src/config/__tests__/tier-defaults.test.ts, src/config/__tests__/config-catalog-defs.test.ts and src/daemon/__tests__/model-catalog-asset.test.ts to SHIPPED_MODEL_DEFAULTS / SHIPPED_DEFINITIONS, remove DEFAULT_TIERS and TIER_EFFORTS from src/config/analyze.ts, drop the literal scan's src/cli and model-recommender exclusions (naming an owner for any program-name exclusion it then needs), and add a scan that no file under src imports or exports DEFAULT_TIERS / TIER_EFFORTS.

**Acceptance checks:**
- No file under src (tests included) imports or exports DEFAULT_TIERS or TIER_EFFORTS
- The literal scan covers src/cli and src/shared/model-recommender.ts and passes
- The migrated test modules pass
- tsc passes over src and the changed tests

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| src/cli/__tests__/model-tiers.test.ts: computeEffectiveTiers(tiering, fakeDefs) — an unset tier shows the fake default family's tierDefault as a canonical id; a set tier shows its value; a configured model the family does not serve carries the 'not served' note; effort choices for a tier are exactly '' plus the chosen model's efforts in the fake answer; no import of DEFAULT_TIERS / TIER_EFFORTS / shippedModelRegistry; the effort regression: core.model '' with core.effort 'high' shows 'high' over a fake tierDefault effort 'low', an explicit '' shows '', and no effort shows the tierDefault's | `t6` |
| src/cli/__tests__/model-tiers.test.ts: tier edit helpers — changing family yields { runner: newFamily, model: its tierDefault model, effort: its tierDefault effort or '' }, and for a family without tierDefaults (the fake Ollama family) { model: its toolLoopModel, effort: '' }; changing model drops an effort the new model does not list; a typed id that is an alias resolves to the canonical id; an unserved id of a CLI family asks for a check; an unserved Ollama id is refused | `t6` |
| src/cli/__tests__/command.test.ts: config set / unset — keys models, models.tiers.core.runner, models.tiers, models.tasks.context.assemble, models.byRepo and models.byRepo./w/repo.coreFloor are refused with the pointer message and the fake config.write is never called (including an object value for models.byRepo); a non-model key is written; an ok:false result prints '✗ not saved: <reason> — <detail>' and never 'set'; restartRequired prints the restart hint; `setup show\|apply\|pull` fetch the fake definitions and recommend its toolLoopModel, and with models.definitions rejecting each prints 'cannot recommend a local model: the daemon is not running' and calls neither apply nor pullModels | `t5`, `t9` |
| src/shared/__tests__/model-recommender.test.ts: recommendModels(info, { model: 'fake-local:1', installed: false }) recommends that model with pull true; installed absent falls back to info.ollama.models; the module names no definitions model | `t5` |
| src/cli/services/__tests__/review-resolve-role.test.ts: reviewArtifact with a fake resolveRole — a cli answer builds CliProvider with that kind, model, effort and a chars input budget; an ollama answer builds OllamaProvider whose model, host and numCtx are the answer's even when HOME holds a config.json naming another core model and host; the model label is '<family>:<model>'; a rejecting or { error } resolveRole throws 'cannot review: …' and reviewFile is never called; the review path imports no createRoleRouter / loadAnalyzeConfig / registry; src/cli/services/__tests__/review-source-roots-daemon.test.ts and src/workflow/review/__tests__/same-party-refusal.test.ts pass the resolveRole seam and keep their source-root and same-party assertions | `t10` |
| src/__tests__/no-default-tiers.test.ts: no file under src (tests included) imports or exports DEFAULT_TIERS or TIER_EFFORTS, and src/cli/shipped-model-registry.ts does not exist | `t11` |
| src/shared/__tests__/ipc-client.test.ts: through the connect seam — end then close with no reply rejects with DaemonDisconnectedError naming the method; ECONNRESET after the write and then close rejects with DaemonDisconnectedError (cause ECONNRESET), not the raw error; ECONNREFUSED before connect still rejects 'daemon is not running'; close after a reply line does not change the resolved value; an error reply still rejects with the daemon's message | `t1` |
| src/cli/__tests__/tui-models.test.ts: Model Tiers pane — with a fake definitions answer, pressing f / m / e cycles exactly the fake families, models and efforts, and each change makes one config.write('models.tiers.<tier>', { runner, model, effort }); a restartRequired result shows the restart line and R calls daemon.restart; an ok:false result shows the reason and the pane reloads; starting from a config whose tier names an unlisted model with effort 'high', pressing e writes nothing and shows the 'pick a listed model or check it' hint | `t7` |
| src/cli/__tests__/tui-models.test.ts: unknown model — typing an unserved id with n calls models.check with the family's effort names and renders each effort's verdict and evidence; approve calls models.approve with the toggled levels and saves nothing; the screen then shows 'restart the daemon to use it' and R calls daemon.restart and only then config.write('models.tiers.<tier>', { runner, model, effort }); a fake config.write refusing with rejected-model before the restart is never reached; a failing restart shows 'approval recorded; restart failed' with no save and no second approve; a refused save after the restart shows its reason; reject calls models.reject and saves nothing; a runs:false result offers no approve | `t8` |
| src/cli/__tests__/tui-models.test.ts: repo models view — m on a repo shows roles with the repo's tier or 'global' and coreFloor; editing a role writes the whole map at ['models','byRepo',<repo>,'tasks'] with dotted role ids as flat keys; editing coreFloor writes ['models','byRepo',<repo>,'coreFloor']; the view renders no runner, model or effort field and makes no write under tiers; ReposPane keeps its four props and opens the models view of props.selectedRepo, rendered through App as today | `t9` |
| src/cli/__tests__/tui-models.test.ts: daemon down — rejecting models.definitions shows the not-running message in the Model Tiers pane and Setup, with no model list and apply / pull disabled; Setup with a fake answer recommends its ollama toolLoopModel | `t7`, `t5` |
| src/daemon/__tests__/model-literal-scan.test.ts: the src/cli and model-recommender exclusions are gone and the scan passes over src/cli and src/shared/model-recommender.ts; no source file exports or imports DEFAULT_TIERS or TIER_EFFORTS, and src/cli/shipped-model-registry.ts no longer exists | `t11` |
| src/daemon/__tests__/system-recommend.test.ts: the daemon's system.recommend over a fixture definitions file recommends that file's tool-loop model | `t5` |
| src/cli/__tests__/tui-models.test.ts: interrupted requests — a models.check rejecting with the disconnect error shows 'interrupted — check again'; a models.approve rejecting with it shows 'outcome unknown — reload', and reload reads models.definitions and reports the model as user-approved (or not) without calling approve again | `t8` |
| npx tsc --noEmit -p tsconfig.json over src (including the TUI) and a tsc pass over the changed TUI test files; the existing src/cli/__tests__/tui.test.ts suite passes | `t11` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s5 contractDetails.api rpc` — "rpc settles once; a connection lost after the request rejects with DaemonDisconnectedError."
- **[[c2]]** `prior-artifact` `LLD s5 contractDetails.api Services` — "Services.models over rpc and the sc5 ConfigWriteResult."
- **[[c3]]** `prior-artifact` `LLD s5 contractDetails.api computeEffectiveTiers` — "Pure overlay over the definitions answer with the daemon's effort precedence."
- **[[c4]]** `prior-artifact` `LLD s5 contractDetails.api ModelTiersPane` — "Families, models and efforts from the answer; whole-tier writes; no effort edit on an unserved model; restart line."
- **[[c5]]** `prior-artifact` `LLD s5 contractDetails.api models.check` — "Check screen: verdicts, approve then restart then save, reject, interrupted / outcome-unknown states."
- **[[c6]]** `prior-artifact` `LLD s5 contractDetails.api ReposPane` — "Props unchanged; models view of the selected repo edits only tasks and coreFloor."
- **[[c7]]** `prior-artifact` `LLD s5 contractDetails.api config set` — "Command bar refuses models / models.tiers* / models.tasks* / models.byRepo* and reports results."
- **[[c8]]** `prior-artifact` `LLD s5 contractDetails.api reviewArtifact` — "Provider built from the models.resolveRole answer."
- **[[c9]]** `prior-artifact` `LLD s5 contractDetails.api recommendModels / SetupPane / runSetup` — "The local model comes from the definitions; not-running message without the daemon."
- **[[c10]]** `prior-artifact` `LLD s5 dataModelChanges TUI model lists and stopgap` — "DEFAULT_TIERS, TIER_EFFORTS, DEFAULT_LOCAL_MODEL and shippedModelRegistry removed; scan exclusions dropped."
- **[[c11]]** `prior-artifact` `LLD s5 errorPaths` — "Daemon down / old daemon / refusals / failed checks and decisions / lost connections / restart failures."
- **[[c12]]** `prior-artifact` `LLD s5 testStrategy` — "Unit, integration (ink-testing-library with fake services) and smoke levels; ac1-ac3 mapping."
- **[[c13]]** `prior-artifact` `LLD s5 migration` — "Seven rollbackable steps; additive for daemon requests and config shape."
- **[[c14]]** `prior-artifact` `plan-start resolution qda996789 (sc5 open question)` — "Reject at config.write: refuse writes that add or change models.byRepo.<repo>.tiers, naming the keys."
- **[[c15]]** `prior-artifact` `plan-start resolution q4dc21996 (recommender open question)` — "Allow model-specific overrides: optional memoryMb on Ollama model definitions, set for every shipped Ollama model; the generic estimate is the fallback."
