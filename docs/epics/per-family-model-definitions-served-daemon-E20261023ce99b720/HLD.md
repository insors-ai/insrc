<!-- insrc:artifact HLD-ce99b72065d03b1b -->

# HLD: per-family-model-definitions-served-daemon

## Summary

The curated catalog file shipped with insrc becomes the one place that describes the Claude CLI, Codex CLI and Ollama families: every selectable model with its aliases, effort levels and input limit, each family's tier defaults and summariser model, and the default local model. The daemon checks it at startup, every daemon thread reads it the way settings are read today, and the settings defaults are taken from it, so no model name is left in code. Clients ask the daemon for it, an unknown Claude or Codex model is used only after the user approves a check of it, and tiers become global-only. As with saved settings today, a daemon restart applies a change everywhere.

## Contents

1. [Problem context](#1-problem-context)
2. [Framework summary](#2-framework-summary)
3. [Architecture shape](#3-architecture-shape)
4. [Diagrams](#4-diagrams)
5. [Shared contracts](#5-shared-contracts)
6. [Story boundaries](#6-story-boundaries)
7. [Non-functional targets](#7-non-functional-targets)
8. [Rollout](#8-rollout)
9. [Alternatives considered](#9-alternatives-considered)
10. [References](#10-references)

## 1. Problem context

> See **DEF-ce99b72065d03b1b** § 1. Problem

## 2. Framework summary

The curated cloud catalog keeps its file (src/assets/models/cloud-model-catalog.json), its loader (validateModelCatalog, src/daemon/model-catalog.ts:162) and its boot hook (src/daemon/index.ts:381), as the DEF decided, and is extended in place; the boot hook moves ahead of the settings reconcile and the worker threads, because the settings defaults now come from the file. The file is extended into the model definitions: exactly one entry for each built-in family, each with its CLI kind (CLI families), its selectable models with aliases, accepted efforts and input limit, its tier defaults and summariser model (CLI families), the Ollama tool-loop default, and the default family. Each Ollama model's input limit is its context window and replaces the global models.shaper.ollamaNumCtx; the output cap ollamaNumPredict stays global. A ModelRegistry built from the file and the per-user approved-model store answers every model question in the daemon; each thread builds it on first use and caches it, the way it loads and caches settings today (src/config/analyze.ts:234). A daemon restart guarantees that every thread uses a changed file, approval or saved tier; until then, a thread that starts or first reads them after the change, such as a worker the supervisor replaces after a crash (src/daemon/threads/supervisor.ts:136-148), may already use it, as with settings today. That is harmless: every saved tier has passed config.write's checks and every approval a check in which the model ran. The settings catalog takes the defaults of its tier runner, tier model and local coreModel rows, and the allowed effort values, from the same file, so reconcile, the updater, the settings catalog loader and older plugins keep working unchanged and no model name stays in code. One read-only request, models.definitions, serves the definitions to clients and is the source of providers.listModels; models.resolveRole lets the TUI's review command run the model the daemon would. Unknown Claude and Codex models are checked through their CLI one call at a time and recorded only on the user's approval, and only for a check in which the model ran. A tier set to a model that is neither listed nor approved runs a tier default with a warning (decision A). Tiers become global-only; a repo keeps `tasks` and coreFloor. Settings-write safety is out of scope (ISSUE-8dc75bc5).

## 3. Architecture shape

Definitions (s1): the extended catalog file and its validator (src/daemon/model-catalog.ts:107-162), run by the existing boot hook, which moves from after the worker threads start (validateModelCatalog at src/daemon/index.ts:382, after startIndexingWorkers at :283) to before the settings reconcile (src/daemon/index.ts:154), because the settings defaults reconcile fills now come from the file; the ModelRegistry, built in each thread from the file and the approved-model store on first use and cached for the thread's life, like loadAnalyzeConfig (src/config/analyze.ts:234). So the file is validated before reconcile, before any worker starts and before the daemon listens, and every thread reads an already validated file. A worker the supervisor starts later (src/daemon/threads/supervisor.ts:136-148), or a thread whose first read comes after a change on disk, builds its registry and settings from the files as they are then; the next daemon restart brings every thread to the same values. Daemon consumers (s3): tier resolution (resolveTiers and resolveTier over DEFAULT_TIERS, src/config/analyze.ts:135-137), the summariser fallback (src/analyze/context/shaper-provider.ts:271), the effort list (TIER_EFFORTS, src/config/analyze.ts:115), CliProvider's input budget and CLI kind (src/agent/providers/cli-provider.ts:181, :202-204), the Ollama context window (src/analyze/context/shaper-provider.ts:267, :303, src/analyze/context/driver.ts:531, :833), the tool-loop model (src/analyze/context/driver.ts:1100) and the runner literals in routing, provider construction, attribution and workflow code all ask the registry. The settings catalog's tier and coreModel rows (src/config/config-catalog.ts:113-118, :142) and the local settings default (src/config/local.ts:53) take their values from the definitions; reconcile (src/config/reconcile.ts:379) keeps filling them as it does today; reconcile also removes per-repo tier overrides and prunes ollamaNumCtx, and readRepoOverride (src/config/analyze.ts:444-463) and its callers (src/daemon/workflow-rpc.ts:35, src/daemon/code-review-rpc.ts:194) go away. config.write (src/daemon/handler-runtime.ts:1278) refuses a tier set to a rejected model and reports restartRequired for a model setting. A model that is listed but not installed in Ollama fails at the call, as today (src/agent/providers/ollama.ts:375). IPC: models.definitions (s2) projects the registry, adds each listed Ollama model's installed state from the existing bounded listing (src/daemon/list-models.ts:113), and providers.listModels (src/daemon/list-models.ts:127) is drawn from it; models.check / models.approve / models.reject (s4) drive the unknown-model flow; models.resolveRole (s3) serves the TUI review (src/cli/services/workflow.ts:248-253); each new method is classified in src/daemon/threads/method-class.ts. Clients (s5-s7): the TUI model-tiers pane, review command and Setup (which drops DEFAULT_LOCAL_MODEL, src/shared/model-recommender.ts:22), the VS Code picker and repo panel, and the JetBrains model-tiers and per-repo settings render models.definitions, use the check and approval requests, show restartRequired, and offer the daemon restart where the client has one (src/cli/services/maintenance.ts:284, vscode-plugin/src/daemon/commands.ts:26). Installer: both copies take the chosen family's tier defaults and the tool-loop default from the file (scripts/insrc-daemon-install.sh:291-297, :324, :351).

## 4. Diagrams

- [ER model](docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/er-model.html)

## 5. Shared contracts

### 5.1 sc1: ModelDefinitionsFile (the curated catalog file, extended)

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`

**Purpose:** The shipped, versioned data format of src/assets/models/cloud-model-catalog.json: the only place model facts and default model choices are stated (k4). Validated at daemon start (k7); a change applies at the next restart (s1/ac2). Ollama models must be listed to be selectable.

**Interface sketch (type-level):**

```
type FamilyId = 'cli-claude' | 'cli-codex' | 'ollama';
type TierName = 'core' | 'mid' | 'cheap';
type EffortLevel = string; // the file is the authority for level names
interface InputLimit { readonly unit: 'chars' | 'tokens'; readonly max: number; } // ollama: tokens = num_ctx
interface ModelDefinition {
  readonly id: string;                           // unique within its family
  readonly aliases?: readonly string[] | undefined; // unique within its family
  readonly displayName?: string | undefined;
  readonly efforts: readonly EffortLevel[];       // [] = no effort is passed
  readonly inputLimit?: InputLimit | undefined;   // required for ollama; absent on a CLI model = the CLI's own refusal decides
}
interface TierDefault { readonly model: string; readonly effort?: EffortLevel | undefined; } // model: id or alias of the same family
interface FamilyDefinition {
  readonly id: FamilyId;
  readonly cliKind?: 'claude' | 'codex' | undefined;                    // required for CLI families
  readonly displayName: string;
  readonly models: readonly ModelDefinition[];
  readonly tierDefaults?: Readonly<Record<TierName, TierDefault>> | undefined; // required for CLI families
  readonly summariserModel?: string | undefined;                       // required for CLI families
  readonly toolLoopModel?: string | undefined;                         // ollama only, required; a listed model id
}
interface ModelDefinitionsFile { // extends CloudModelCatalogFile (src/daemon/model-catalog.ts:48)
  readonly version: number;
  readonly defaultFamily: 'cli-claude' | 'cli-codex';
  readonly families: readonly FamilyDefinition[]; // exactly one per FamilyId
}
```

**Assumptions cited:** [[c5]]

### 5.2 sc2: ModelRegistry and the approved-model store

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`

**Purpose:** The in-process view every daemon consumer asks, built from the sc1 file plus the per-user approved-model store and cached per thread like settings. Defines the store's entry shape (written by s4). Resolves aliases, accepted efforts, input limits and defaults, and applies decision A.

**Interface sketch (type-level):**

```
interface ApprovedProfile { // one entry of the per-user store under the insrc home
  readonly family: 'cli-claude' | 'cli-codex';
  readonly modelId: string;
  readonly status: 'approved' | 'rejected';
  readonly efforts: readonly EffortLevel[]; // approved only: checked AND approved levels
  readonly inputLimit?: InputLimit | undefined;
  readonly decidedAt: string;
  readonly cliVersion: string;
}
interface ResolvedModel extends ModelDefinition { readonly family: FamilyId; readonly source: 'shipped' | 'user-approved'; }
type FallbackReason = 'unlisted-model' | 'rejected-model';
interface TierResolution {
  readonly family: FamilyId;
  readonly model: ResolvedModel;
  readonly effort?: EffortLevel | undefined;
  readonly droppedEffort?: EffortLevel | undefined; // s3/ac2
  readonly fallback?: { readonly reason: FallbackReason; readonly requested: string } | undefined; // decision A
}
interface ModelRegistry {
  families(): readonly FamilyDefinition[];
  defaultFamily(): 'cli-claude' | 'cli-codex';
  models(family: FamilyId): readonly ResolvedModel[];          // listed + approved
  rejected(family: 'cli-claude' | 'cli-codex'): readonly string[];
  find(family: FamilyId, idOrAlias: string): ResolvedModel | undefined;
  tierDefault(family: 'cli-claude' | 'cli-codex', tier: TierName): TierDefault;
  summariserModel(family: 'cli-claude' | 'cli-codex'): ResolvedModel;
  toolLoopModel(): ResolvedModel;                               // ollama family's default
  cliKind(family: FamilyId): 'claude' | 'codex' | undefined;
  effortLevels(): readonly EffortLevel[];                       // union over all models (settings-catalog effort values)
  resolveTier(tier: TierName, setting: { runner: FamilyId; model: string; effort?: EffortLevel | undefined }): TierResolution;
}
```

**Assumptions cited:** [[c5]] [[c12]]

### 5.3 sc3: models.definitions IPC request

**Owner Story:** `s2`
**Consumed by:** `s4`, `s5`, `s6`, `s7`

**Purpose:** The one read-only request clients use to learn the definitions (k2): families with CLI kind and rejected ids, models with aliases, efforts and limits and whether they are shipped or user-approved, tier defaults, summariser model, tool-loop default, default family, and each listed Ollama model's installed state. providers.listModels is drawn from the same registry (s2/ac2).

**Interface sketch (type-level):**

```
// request: 'models.definitions'  params: {}
interface ModelDefinitionsResult {
  readonly version: number;
  readonly defaultFamily: 'cli-claude' | 'cli-codex';
  readonly families: readonly {
    readonly id: FamilyId;
    readonly cliKind?: 'claude' | 'codex' | undefined;
    readonly displayName: string;
    readonly tierDefaults?: Readonly<Record<TierName, TierDefault>> | undefined;
    readonly summariserModel?: string | undefined;
    readonly toolLoopModel?: string | undefined;
    readonly rejectedModels?: readonly string[] | undefined;
    readonly models: readonly {
      readonly id: string;
      readonly aliases: readonly string[];
      readonly displayName?: string | undefined;
      readonly efforts: readonly EffortLevel[];
      readonly inputLimit?: InputLimit | undefined;
      readonly source: 'shipped' | 'user-approved';
      readonly installed?: boolean | undefined; // ollama only; absent when Ollama does not answer
    }[];
  }[];
}
```

**Assumptions cited:** [[c5]]

### 5.4 sc4: Unknown-model check and approval requests

**Owner Story:** `s4`
**Consumed by:** `s5`, `s6`, `s7`

**Purpose:** Checks a Claude or Codex model that is not in the definitions through its CLI, one call at a time (k1, k3), returns per-effort evidence, and records the user's decision as an ApprovedProfile (sc2) outside the shipped file and config.json (k4, k5). Approval is accepted only for a check in which the model ran without error. A decision applies at the next daemon restart, which the result says. Ollama has no such flow: only listed Ollama models are selectable.

**Interface sketch (type-level):**

```
// 'models.check'   params: { family: 'cli-claude' | 'cli-codex'; modelId: string; claimedEfforts: EffortLevel[] }
type EffortVerdict = 'accepted' | 'rejected' | 'recognised-unconfirmed';
interface ModelCheckResult {
  readonly checkId: string;
  readonly family: 'cli-claude' | 'cli-codex';
  readonly modelId: string;
  readonly runs: boolean;
  readonly inputLimit?: InputLimit | undefined;
  readonly efforts: readonly { readonly effort: EffortLevel; readonly verdict: EffortVerdict; readonly evidence: string }[];
  readonly error?: string | undefined; // CLI unreachable, or the CLI refused the model
}
type DecisionResult =
  | { readonly ok: true; readonly restartRequired: true }
  | { readonly ok: false; readonly reason: 'unknown-check' | 'model-did-not-run' | 'invalid-efforts' | 'write-failed'; readonly detail: string };
// 'models.approve' params: { checkId: string; efforts: EffortLevel[] } -> DecisionResult
// 'models.reject'  params: { checkId: string }                       -> DecisionResult
```

**Assumptions cited:** [[c11]]

### 5.5 sc5: Settings rules and models.resolveRole

**Owner Story:** `s3`
**Consumed by:** `s5`, `s6`, `s7`

**Purpose:** What changes in settings: the settings catalog's tier runner, tier model and local coreModel defaults and the allowed effort values come from the definitions; per-repo tier overrides are removed with a warning (k6, s3/ac5); ollamaNumCtx is pruned; config.write refuses a tier set to a rejected model (s4/ac4) and reports restartRequired for model settings. models.resolveRole gives the TUI's review command the tier, model, effort and provider settings the daemon would use for a role and repo.

**Interface sketch (type-level):**

```
// config.write: request unchanged; result gains
type ConfigWriteResult =
  | { readonly ok: true; readonly restartRequired?: boolean | undefined }
  | { readonly ok: false; readonly reason?: 'invalid-path' | 'rejected-model' | undefined; readonly detail?: string | undefined };
// 'models.resolveRole' params: { role: string; repoPath: string }
interface RoleResolution {
  readonly tier: TierName;
  readonly family: FamilyId;
  readonly model: string;
  readonly effort?: EffortLevel | undefined;
  readonly inputLimit?: InputLimit | undefined;
  readonly fallback?: { readonly reason: FallbackReason; readonly requested: string } | undefined;
  readonly cli?: { readonly kind: 'claude' | 'codex' } | undefined;
  readonly ollama?: { readonly host: string; readonly numCtx: number; readonly numPredict: number } | undefined;
}
```

**Assumptions cited:** [[c12]]

## 6. Story boundaries

### 6.1 Story E20261025ce99b720:S001

**Owns:** `sc1`, `sc2`

Extending the catalog file, its types (CloudModelCatalogFile, src/daemon/model-catalog.ts:48) and its validator in place; refreshing its contents with today's models, the aliases today's tier defaults use (opus, sonnet, haiku), the Ollama models insrc ships with and their context windows, and today's coreModel as the tool-loop default; the registry and its per-thread cache; moving the boot validation ahead of the settings reconcile and the worker threads; reading the approved-model store (a malformed store is logged and treated as empty). The validator refuses a missing or malformed file, an unknown, missing or repeated family, a CLI family without its CLI kind, tier defaults or summariser model, a model without an efforts list, a duplicate id or alias, a default that is not a model of its family, an Ollama model without a token input limit, and a tool-loop default that is not listed, naming the entry (ac3). Tests: one fixture per refusal reason (ac3); a model and alias added to a fixture are served after a restart with no code change (ac2); the file is validated before the settings reconcile, before any worker starts and before listen (ac1, k7); repeated requests in one thread return the same definitions even after the file changes on disk (ac1); a replacement worker started after the file, the store or config.json changed on disk uses the new values while a surviving thread keeps its own until the restart, and a thread whose first read comes after such a change likewise uses the new values; after a daemon restart every thread resolves the same definitions, approvals and tiers; alias, effort and limit lookups; resolveTier distinguishes rejected-model from unlisted-model and falls back to the tier's family default, or the default family's for an Ollama tier.

### 6.2 Story E20261025ce99b720:S002

**Owns:** `sc3`
**Depends on:** `sc1`, `sc2`

The models.definitions handler and its method-class entry, the projection of the registry, each listed Ollama model's installed state from the existing bounded listing, and re-sourcing providers.listModels from the registry (for Ollama, listed models only). Tests: models.definitions returns every field of a fixture file (ac1); providers.listModels and models.definitions agree for every family, and an installed but unlisted Ollama model appears in neither (ac2); with Ollama not answering, installed is absent and the request still succeeds.

### 6.3 Story E20261025ce99b720:S003

**Owns:** `sc5`
**Depends on:** `sc1`, `sc2`

Moving every daemon consumer onto the registry: tier resolution, summariser selection, effort forwarding, CliProvider's input budget and CLI kind, OllamaProvider's num_ctx, the tool-loop model (an unlisted coreModel runs the tool-loop default with a warning) and the runner and model literals in routing, provider construction, attribution and workflow code; DEFAULT_TIERS, TIER_EFFORTS, SUMMARISER_CLI_FALLBACK, CODEX_INPUT_BUDGET_CHARS and ollamaNumCtx go. The settings catalog's tier and coreModel defaults and effort values are taken from the definitions; how the settings catalog reaches the file is decided in this Story's LLD and must work in every process that loads the settings catalog today (the daemon, the TUI, the updater, and the VS Code bundle until s6 drops its use). Reconcile removes per-repo tier overrides with a warning and prunes ollamaNumCtx; readRepoOverride and its callers go. config.write refuses a tier set to a rejected model and reports restartRequired. models.resolveRole and its method-class entry. Both installer copies take tier defaults and the tool-loop default from the file. Tests: an unset tier resolves to the file's default, and with a fixture whose defaults differ from today's, reconcile fills the fixture's values (ac1); an unsupported effort is dropped with a warning naming model and effort (ac2); a source scan fails on runner or model literals outside the family implementations and on any read of ollamaNumCtx (ac3); a repo's `tasks` choice applies with the global tier's model (ac4); reconcile removes per-repo tier overrides with a warning naming repo and tier and keeps `tasks` and coreFloor (ac5); an unlisted model falls back with the warning (decision A); a fixture Ollama model's input limit sets num_ctx; config.write refuses a rejected model and reports restartRequired; models.resolveRole matches the daemon's own resolution for a CLI tier and an Ollama tier; the settings catalog loader accepts the catalog and an unset JetBrains tier still shows the default family's values.

### 6.4 Story E20261025ce99b720:S004

**Owns:** `sc4`
**Depends on:** `sc1`, `sc2`, `sc3`

The per-family check procedures (Codex: the CLI's model list plus a run; Claude: a run, the input limit from the JSON output, recognised effort names), run one call at a time; telling a reachable CLI that refuses the model apart from an unreachable CLI; refusing approval unless the model ran without error; writing the store atomically and acknowledging a decision only once it is written; the method-class entries. Tests: checks against fake CLIs record each verdict and run one at a time (ac1); results list each claimed level with evidence and nothing is usable before approval (ac2); after approval and a restart only the approved levels are accepted (ac3); a rejected profile or unreachable CLI refuses the model with a reason, and approving a check whose model did not run is refused (ac4); after a restart an approved model appears in models.definitions as user-approved and a rejected one among the rejected ids (ac5); a failed store write returns write-failed and keeps the previous store.

### 6.5 Story E20261025ce99b720:S005

**Depends on:** `sc3`, `sc4`, `sc5`

The TUI model-tiers pane and its effort choices from models.definitions; the unknown-model check and approval screen; the repo settings view limited to `tasks` and coreFloor; showing restartRequired and offering maintenance.restart; the review command using models.resolveRole and building its provider from the answer instead of reading config.json; Setup recommending the definitions' tool-loop default instead of DEFAULT_LOCAL_MODEL, and saying it cannot recommend when the daemon is not running. Tests: the pane offers exactly the options of a fake models.definitions answer (ac1); saving an unknown model starts the check and shows its results (ac2); the repo view edits only `tasks` and coreFloor (ac3); the review command runs the model a fake models.resolveRole returns for a CLI and an Ollama tier; Setup recommends the fake answer's tool-loop default.

### 6.6 Story E20261025ce99b720:S006

**Depends on:** `sc3`, `sc4`, `sc5`

The VS Code model-tier picker driven by models.definitions instead of its runner list and the bundled settings catalog's effort rows; the unknown-model check and approval prompt; the Repo Configuration panel without per-tier fields; showing restartRequired and offering insrc.daemon.restart. Tests: the picker offers exactly a fake answer's options and the bundle keeps no runner or model list (ac1); an unknown model is saved only after approval (ac2); the repo panel shows only `tasks` and coreFloor (ac3).

### 6.7 Story E20261025ce99b720:S007

**Depends on:** `sc3`, `sc4`, `sc5`

The JetBrains model-tiers section driven by models.definitions instead of ModelTiersModel.PROVIDERS; the unknown-model check and approval dialog; the per-repo settings without per-tier fields; showing restartRequired. Tests: the section offers exactly a fake answer's options and the plugin keeps no runner or model list (ac1); an unknown model is saved only after approval (ac2); the per-repo settings show only `tasks` and coreFloor (ac3).

## 7. Non-functional targets

- **Performance:** The file is parsed once per thread and every model question is an in-memory lookup; models.definitions touches no CLI and makes one bounded Ollama listing call, the same one providers.listModels makes today.
- **Security:** No cloud REST call is added (k1): checks run only through the installed claude and codex CLIs. The approved-model store is a per-user file under the insrc home written only by the daemon; clients reach it only through models.approve and models.reject (k2).
- **Observability:** A bad file stops the daemon with a log naming the entry (s1/ac3); a dropped effort logs model and effort (s3/ac2); a tier fallback logs tier, requested model, reason and the default used (decision A); a tool-loop substitution logs both models; removing a per-repo tier override logs repo and tier (s3/ac5); each CLI call of a check and its verdict is logged.
- **Durability:** Approved and rejected profiles live outside the shipped file and config.json, so they survive restarts and updates; the store is replaced atomically and a decision is acknowledged only once written; a malformed store is logged and treated as empty. When an update ships a model the user had approved, the shipped definition wins. Existing `tasks`, coreFloor, ollamaNumPredict and every tier value already in config.json are kept. Between a change and the next restart, threads may differ (a replaced worker or a late first read uses the new values); the restart brings them together.

## 8. Rollout

**Phase A — definitions file and registry**

**Stories:** `s1`

s1 owns sc1 and sc2, which every other Story consumes; it has no dependencies.

**Backward compat:** The catalog file and loader stay where they are; the boot hook keeps its fail-fast refusal and runs earlier, before the settings reconcile and the worker threads, which changes nothing for a valid file. The file keeps today's Claude and Codex entries (stale ids refreshed) and adds the aliases today's tier defaults use, so every tier already set to opus, sonnet, haiku or a listed Codex id still resolves; the Ollama tool-loop default is today's coreModel default, so nothing that runs changes.

**Phase B — daemon serves and runs by the definitions**

**Stories:** `s2`, `s3`

Both depend only on s1. s2 adds models.definitions and re-sources providers.listModels; s3 moves every daemon consumer onto the registry, derives the settings defaults from the file, makes tiers global-only and adds models.resolveRole.

**Backward compat:** providers.listModels, config.write and config.catalog keep their shapes; config.write adds restartRequired and a rejected-model refusal. Settings rows keep defaults, now taken from the file with today's values, so reconcile, the updater's catalog loader and older plugins behave as before. Tier values already in config.json stay and keep running. Deliberate changes: a repo's per-repo tier override, including the core runner/model override read fresh today, is removed with a warning (k6); a tier set to an unlisted, unapproved model runs a tier default with a warning (decision A); ollamaNumCtx is pruned and each Ollama model's context window comes from the file. Until s6 lands, the VS Code bundle still carries the settings catalog.

**Phase C — unknown-model check and approval**

**Stories:** `s4`

s4 depends on s2 (approved and rejected models appear in models.definitions) and lands before the clients that drive it.

**Backward compat:** A tier that fell back keeps running its default until the user approves the requested model and the daemon restarts.

**Phase D — clients render the daemon's definitions**

**Stories:** `s5`, `s6`, `s7`

Each client Story depends on s2, s3 and s4 and on nothing from the others, so they can land in any order.

**Backward compat:** An older plugin keeps working against the new daemon because providers.listModels, config.catalog and config.write keep their shapes and keys; it shows its own lists until updated and ignores restartRequired. Until s5 lands, the TUI review resolves its model as today.

**Ordering rationale:** Owners before consumers: s1 (sc1, sc2); then s2 (sc3) and s3 (sc5), which need only s1; then s4 (sc4), which needs sc3; then the three clients. This follows the Epic's dependsOn edges.

**Risky bits**

| Area | Why | Mitigation |
| :--- | :--- | :--- |
| Settings defaults taken from the file (s3) | The settings catalog is loaded by the daemon, the TUI, the updater's catalog loader (which requires a default on every row, src/config/config-catalog-loader.ts:41) and, until s6, the VS Code bundle (vscode-plugin/src/models/model-tier-picker.ts:25); a way of reaching the file that works in one of them may fail in another. | s3's LLD decides the mechanism against all four; tests load the settings catalog through the updater's loader and check an unset JetBrains tier still shows the default family's values. |
| Wide literal migration (s3) | About 30 files import src/config/analyze.ts and 14 carry runner literals; a missed literal keeps a second source of truth. | A source scan test fails on any runner or model literal outside the family implementations and on any read of ollamaNumCtx (s3/ac3). |
| Threads using different values between a change and the restart (s1, s3) | Each thread reads the definitions, approvals and settings on first use (src/config/analyze.ts:234), and the supervisor starts replacement workers while the daemon runs (src/daemon/threads/supervisor.ts:136-148), so after a save or approval a replaced worker can run the new choice while others run the old one. | Every saved tier passed config.write's checks and every approval a check in which the model ran, so either value is valid; clients report restartRequired and offer the restart; tests pin both the early pickup and agreement after restart. |

## 9. Alternatives considered

### 9.1 a1: Extend the curated catalog into the one definitions file, read through the existing load paths — **CHOSEN**

Extend the curated catalog file, loader and boot hook in place to hold every model fact and default for all three families; daemon code reads it through a registry each thread loads and caches as settings are today, the settings catalog takes its tier and local-model defaults from it, and clients read it over IPC.

The curated catalog keeps its file, loader and boot hook (as the DEF decided) and gains, per family, its CLI kind, its selectable models with aliases, accepted efforts and input limit, its tier defaults and summariser model, the Ollama tool-loop default and the default family; it replaces the global ollamaNumCtx with each Ollama model's own context window. The boot hook, moved ahead of the settings reconcile and the worker threads, validates it before anything uses it. Each thread loads it, with the approved-model store, through one registry and caches it for its lifetime, exactly as settings are loaded and cached today, so a restart applies a change everywhere, as with settings today; a thread that starts or first reads after a change, such as a replaced worker, may use it sooner. The settings catalog takes the default of the tier runner, tier model and local coreModel rows from the same file, so reconcile, the updater's catalog loader and older plugins keep working unchanged and no model name is written in code.

One read-only IPC request serves the definitions and is the source of providers.listModels; a second resolves a role for the TUI's review command. Unknown Claude and Codex models are checked through their CLI one call at a time and recorded in a per-user store only on the user's approval, and only for a check in which the model ran. A tier set to a model that is neither listed nor approved runs its family's tier default with a warning (decision A). Tiers become global-only; a repo keeps `tasks` and coreFloor.

**Pros:**
- Every model fact and default is in one data file; adding a model, alias, effort level or limit is a file edit and a restart (s1/ac2).
- Reuses today's load-and-cache behaviour and settings defaults mechanism, so reconcile, the updater, the settings catalog loader and older plugins need no new rules.
- Clients reach the facts only over IPC (k2), so a new model or effort level needs no plugin release once s5-s7 land.

**Cons:**
- Wide but mechanical migration: about 30 files import src/config/analyze.ts and 14 carry runner literals.
- A change to the file, an approval or a saved tier is guaranteed everywhere only after a daemon restart, as saved settings are today; a worker replaced after a crash may use it sooner. Clients must say a restart is needed.
- A fresh install keeps the defaults it got at its first start, since reconcile writes them into config.json; a later default change reaches it only through aliases or a user change.

**Cost estimate:** L

### 9.2 a2: Build-time code generation from one data file

Keep one shipped data file but compile it into generated TypeScript constants that the daemon and the VS Code extension import, with JetBrains reading the same facts over IPC.

A build step turns the definitions file into a generated module of typed constants that the daemon and the VS Code extension import; JetBrains receives the same facts over IPC.

Unknown-model approvals are handled at run time by the daemon in a separate store and merged where it resolves a tier.

**Pros:**
- A model removed from the data file breaks the build where it was used.

**Cons:**
- Breaks k2 for VS Code: the extension keeps a compiled copy, so a model or effort change still needs a VS Code release.
- A data-file edit needs a regenerated module and rebuild of every TypeScript consumer.
- A hand-edited installed file is not checked at start (k7).

**Cost estimate:** M

**Rejected because:** Violates k2 and only partially meets k4 and k7.

### 9.3 a3: Definitions seeded into the user's settings

Ship a defaults file whose contents reconcile copies into each user's config.json, and read model facts from the settings every consumer already loads.

The shipped defaults describe families, models, efforts and limits; reconcile copies them into config.json on boot and update, and consumers read them from settings.

User-approved models are added to the same settings section.

**Pros:**
- Reuses the existing settings load and reconcile path.

**Cons:**
- Violates k4: model facts live in the user's config.json.
- A shipped update must be merged into every user's edited copy.
- Users can hand-edit a model's efforts, so the daemon could run a capability the model lacks (weakens k5).

**Cost estimate:** M

**Rejected because:** Violates k4 and weakens k5 and k7.

### 9.4 a4: Boot snapshot handed to every worker, with no settings defaults (HLD revisions 9-11)

As a1, but the main thread reads every model input once into a snapshot carried to each worker in its start data, the settings rows for tier and local models lose their defaults, and the design also takes on Ollama availability per operation, safe settings writes and a restart-pending state.

The main thread reads the definitions, the store and the settings once at boot into an immutable snapshot and passes it to every worker, including replacements; settings rows without a default are added so reconcile never writes a model choice; every operation that may run Ollama checks its installed list first; config.write and the updater are hardened, and clients track a restart-pending flag.

This was reviewed through review cycles 3 and 4; each round found another place the snapshot, the default-less rows or the extra scope did not reach (eagerly loaded embedder settings, the updater's catalog loader, older plugins reading row defaults, concurrent writers).

**Pros:**
- A replacement worker can never pick up a settings change before a restart.
- A fresh install's unset tiers follow later default changes.

**Cons:**
- Requires changes to the settings catalog loader, reconcile, the updater, worker start-up and every eager settings reader, and breaks older plugins that read row defaults.
- Pulls existing settings-write and Ollama-availability behaviour into this Epic, beyond the DEF.
- Three review cycles kept finding new gaps in it.

**Cost estimate:** L

**Rejected because:** Meets the constraints on paper, but only once every worker input, eager reader, settings-catalog consumer and older client is adapted, which three review cycles could not establish; it also takes on settings-write and Ollama-availability work the DEF does not ask for.

## 10. References

- **[[c1]]** `prior-artifact` `DEF-ce99b72065d03b1b` — "Approved Define for this Epic (approved with review override 2026-10-25)."
- **[[c2]]** `step-output` `s1` — "HldContext analyze bundles (definitions capability, settings defaults and their consumers, when settings apply, out-of-daemon model paths, Ollama failure reporting and catalog validation, DEF catalog "
- **[[c3]]** `code` `src/daemon/model-catalog.ts:162` — "export async function validateModelCatalog(): Promise<void> {"
- **[[c4]]** `code` `src/daemon/index.ts:381` — "await validateModelCatalog();"
- **[[c5]]** `code` `src/daemon/index.ts:378` — "missing/malformed catalog asset is a fail-fast startup refusal"
- **[[c6]]** `step-output` `s3` — "a1 and a4 both satisfy k1-k7; a2 violates k2 and a3 violates k4. Between a1 and a4, a1 meets k4 and k5 with today's load-and-cache behaviour and settings-default mechanism, so reconcile, the updater, "
- **[[c7]]** `doc` `docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/evidence/def-cli-probes.md:40` — "So no Claude CLI run shows whether a given model supports a given level."
- **[[c8]]** `stakeholder` `user 2026-10-25` — "go with A: a tier set to an unlisted, unapproved model falls back to the tier default from the definitions with a warning until the user approves it"
- **[[c9]]** `stakeholder` `user 2026-10-25` — "instead of trying to address the identified issues only, look at the entire design and assess what needs to be fixed"
- **[[c10]]** `stakeholder` `user 2026-10-25` — "yes, write another rivision and file a separate issue, then review again"
- **[[c11]]** `doc` `docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/evidence/def-cli-probes.md:20` — "For codex, a model's accepted levels must therefore come from `codex debug models`"
- **[[c12]]** `code` `src/cli/panes/model-tiers.ts:63` — "tiers[t] = resolveTier(tiering, t);"
- **[[c13]]** `code` `src/config/analyze.ts:234` — "let cached: AnalyzeConfig | undefined;"
- **[[c14]]** `code` `src/config/config-catalog.ts:33` — "readonly default: unknown;"
- **[[c15]]** `code` `src/config/reconcile.ts:379` — "writeLeaf(config, owned, keys, cloneDefault(opt.default));"
- **[[c16]]** `code` `src/config/config-catalog-loader.ts:41` — "&& 'default' in (row as object)"
- **[[c17]]** `code` `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersModel.kt:59` — "val runnerDefault = (runnerOpt?.default as? String) ?: "cli-claude""
- **[[c18]]** `code` `src/config/config-catalog.ts:116` — "{ path: 'models.tiers.mid.model',    type: 'string', default: 'sonnet',"
- **[[c19]]** `code` `src/config/analyze.ts:463` — "const tiers = isObject(entry['tiers']) ? (entry['tiers'] as Record<string, unknown>) : {};"
- **[[c20]]** `code` `src/cli/services/workflow.ts:253` — "const { provider, resolution } = router.resolveProviderForRole('review', loadAnalyzeConfig(), repoPath);"
- **[[c21]]** `code` `src/shared/model-recommender.ts:22` — "export const DEFAULT_LOCAL_MODEL = 'qwen3.6:27b';"
- **[[c22]]** `code` `src/daemon/list-models.ts:44` — "available:false + models:[] means the source could not be listed right now"
- **[[c23]]** `doc` `docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/DEF.md:69` — "The existing curated model catalog keeps its file (src/assets/models/cloud-model-catalog.json), its loader (validateModelCatalog, src/daemon/model-catalog.ts:162) and its boot hook (src/daemon/index.t"
- **[[c24]]** `prior-artifact` `ISSUE-8dc75bc5ee1aa020` — "Stop settings saves from wiping or tearing config.json"
- **[[c25]]** `code` `src/cli/services/maintenance.ts:284` — "export async function restart(onLog: LogFn, deps: RestartDeps = { stopDaemon, startDaemon }): Promise<MaintenanceResult> {"
- **[[c26]]** `code` `vscode-plugin/src/daemon/commands.ts:26` — "{ id: 'insrc.daemon.restart', title: 'insrc: Restart daemon', action: 'restart' },"
- **[[c27]]** `code` `src/daemon/threads/supervisor.ts:136` — "private async replace(spec: WorkerSpec): Promise<void> {"
- **[[c28]]** `code` `src/daemon/index.ts:154` — "const outcome = reconcileConfigFile();"
- **[[c29]]** `code` `src/daemon/index.ts:283` — "const indexingWorkers = startIndexingWorkers(workers, threadServices.indexingBlock);"
- **[[c30]]** `stakeholder` `user 2026-10-25` — "yes"
