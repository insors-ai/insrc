<!-- insrc:artifact HLD-ce99b72065d03b1b -->

# HLD: per-family-model-definitions-served-daemon

## Summary

Every fact about the model families insrc runs (Claude CLI, Codex CLI, Ollama) moves into one definitions file shipped with insrc, listing every model that may be selected together with its own settings: aliases, effort levels, input limit and output budget, plus each family's tier defaults and summariser model. The daemon checks the file at startup and every thread that runs models builds the same registry from it; Ollama's own listing only says which listed models are installed, and the old global Ollama settings are gone. A Claude or Codex model the user has checked and approved is added from a separate per-user store, takes effect without a restart, and a model that is neither listed nor approved is never run. Clients get the whole picture from one daemon request and keep no lists of their own.

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

A revisioned model-definitions registry, grown from the curated cloud catalog and built in every daemon thread that runs models. One shipped JSON file (replacing src/assets/models/cloud-model-catalog.json and the global models.shaper.ollamaNumCtx / ollamaNumPredict settings) lists, per family, its runner identity and CLI kind and every selectable model with its aliases, accepted effort levels, input limit and output budget, plus the family's core/mid/cheap tier defaults and summariser model, and names the family a fresh install defaults to. Ollama models are listed like the others; Ollama's live listing only reports which listed models are installed. The main thread validates the file before it starts the worker threads (src/daemon/index.ts:205) and before it listens; every model-running thread builds the registry at its start. User-approved Claude and Codex models live in a per-user store owned by the main thread, written atomically, and published to every thread as a new registry revision only after the write succeeds; every cache that holds a resolved model is rebuilt on a new revision. A tier set to a model that is neither listed nor approved, or to a listed Ollama model that is not installed, runs a tier default with a warning (user decision A). One read-only IPC request serves the merged view; providers.listModels is drawn from it. Tier settings become global-only; role assignments stay persisted under `tasks` and coreFloor stays a tier name.

## 3. Architecture shape

Every model-running thread: (1) a ModelRegistry built at thread start from the validated definitions file plus the current approved-model set, carrying a revision; it answers every model question: families, listed models and aliases, accepted efforts, a model's input limit and output budget, a family's tier defaults and summariser model, the runner and CLI kind of a family, and what a tier setting resolves to (with the fallback of decision A). (2) Every consumer asks the registry instead of DEFAULT_TIERS, TIER_EFFORTS, SUMMARISER_CLI_FALLBACK, CODEX_INPUT_BUDGET_CHARS and the global Ollama settings: tier resolution (resolveTier and the role router's default fallback), shaper and summariser provider selection (including the summary worker's path, src/analyze/summariser/driver.ts:195 and :211), CliProvider's input budget and effort forwarding, OllamaProvider's num_ctx (src/agent/providers/ollama.ts:444, set today at src/analyze/context/shaper-provider.ts:267, :303 and src/analyze/context/driver.ts:531, :833), and the output budget of the synthesizer, planner, aggregator and tool-loop calls (src/analyze/context/synthesizer.ts:142, src/analyze/planner/driver.ts:227, src/analyze/runtimes/shared/aggregator.ts:126, src/analyze/context/driver.ts:554, :852). (3) The caches that hold resolved models (the analyze config, src/config/analyze.ts:234, and the role router's provider map, src/analyze/context/role-router.ts:196-201) are keyed by the registry revision and rebuilt when it changes, so already-built CliProviders are replaced. Main thread only: (4) validation of the definitions file before the thread services start and before the socket listens; (5) the approved-model store and the unknown-model check service, which probes the installed CLIs one call at a time, writes the store atomically and only then publishes the new revision to every worker over the hub channel (src/daemon/threads/main-services.ts:154, src/daemon/threads/channel.ts:124); (6) the config reconcile rules that remove per-repo tier overrides and prune the retired global Ollama settings (src/config/reconcile.ts:316). IPC: models.definitions returns the merged view with each Ollama model's installed state; providers.listModels keeps its shape but is drawn from the registry; models.check / models.approve / models.reject drive the unknown-model flow; each new method is classified in src/daemon/threads/method-class.ts. Clients: the TUI model-tiers pane, the VS Code model-tier picker and repo panel, and the JetBrains model-tiers and per-repo sections render models.definitions and call the check/approve requests; none keeps a runner, model or effort list. Installer: both copies of the install script take the chosen family's tier defaults from the definitions file.

## 4. Diagrams

- [ER model](docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/er-model.html)

## 5. Shared contracts

### 5.1 sc1: ModelDefinitionsFile

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`

**Purpose:** The shipped, versioned data format listing every selectable model of every family with its own settings (k4): aliases, accepted efforts, input limit and output budget. It replaces the global Ollama settings; Ollama models must be listed to be selectable. Validated before the daemon starts its workers or listens (k7).

**Interface sketch (type-level):**

```
type FamilyId = 'cli-claude' | 'cli-codex' | 'ollama';
type TierName = 'core' | 'mid' | 'cheap';
type EffortLevel = string; // the file is the authority for the level names
interface InputLimit { readonly unit: 'chars' | 'tokens'; readonly max: number; } // tokens for ollama = its num_ctx
interface ModelDefinition {
  readonly id: string;                          // canonical id, unique within its family
  readonly aliases?: readonly string[] | undefined; // other names the CLI accepts (e.g. 'haiku'); unique within the family
  readonly displayName?: string | undefined;
  readonly efforts: readonly EffortLevel[];      // accepted effort levels ([] = no effort passed)
  readonly inputLimit?: InputLimit | undefined;  // required for ollama models; absent on a CLI model = the CLI's own refusal decides
  readonly outputBudget: number;                 // max output tokens for any call that runs this model
}
interface TierDefault { readonly model: string; readonly effort?: EffortLevel | undefined; } // model: an id or alias of THIS family
interface FamilyDefinition {
  readonly id: FamilyId;
  readonly cliKind?: 'claude' | 'codex' | undefined;  // absent for ollama
  readonly displayName: string;
  readonly models: readonly ModelDefinition[];        // the ONLY selectable models of the family, Ollama included
  readonly tierDefaults?: Readonly<Record<TierName, TierDefault>> | undefined; // required for the CLI families
  readonly summariserModel?: string | undefined;      // id or alias of this family; required for the CLI families
}
interface ModelDefinitionsFile {
  readonly version: number;
  readonly defaultFamily: 'cli-claude' | 'cli-codex'; // the family a fresh install, an unset tier and every fallback use
  readonly families: readonly FamilyDefinition[];
}
```

**Assumptions cited:** [[c5]]

### 5.2 sc2: ModelRegistry (one per model-running thread, revisioned)

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`

**Purpose:** The only in-process source of model facts and settings, built at the start of every model-running thread from the validated sc1 file plus the current approved-model set, so every thread answers identically. It carries a revision that every cache holding a resolved model keys on, resolves aliases, reports Ollama installation, and applies user decision A: a tier set to a model that is neither listed nor approved, or to a listed Ollama model that is not installed, resolves to a tier default, flagged as a fallback.

**Interface sketch (type-level):**

```
interface ResolvedModel extends ModelDefinition {
  readonly family: FamilyId;
  readonly source: 'shipped' | 'user-approved';
}
interface ApprovedModelSet { readonly profiles: readonly ApprovedProfile[]; readonly revision: number; }
type FallbackReason = 'unlisted-model' | 'rejected-model' | 'not-installed';
interface TierResolution {
  readonly family: FamilyId;
  readonly model: ResolvedModel;               // canonical model actually run
  readonly effort?: EffortLevel | undefined;   // dropped when the model does not accept it (s3/ac2)
  readonly droppedEffort?: EffortLevel | undefined;
  readonly fallback?: { readonly reason: FallbackReason; readonly requested: string } | undefined; // decision A
}
interface ModelRegistry {
  readonly revision: number;                   // changes on every published approved set
  families(): readonly FamilyDefinition[];
  defaultFamily(): 'cli-claude' | 'cli-codex';
  models(family: FamilyId): readonly ResolvedModel[];             // listed + approved overlay
  find(family: FamilyId, idOrAlias: string): ResolvedModel | undefined;
  acceptsEffort(family: FamilyId, idOrAlias: string, effort: EffortLevel): boolean;
  inputLimit(family: FamilyId, idOrAlias: string): InputLimit | undefined;
  outputBudget(family: FamilyId, idOrAlias: string): number;
  tierDefault(family: FamilyId, tier: TierName): TierDefault | undefined; // undefined for ollama
  summariserModel(family: 'cli-claude' | 'cli-codex'): ResolvedModel;
  cliKind(family: FamilyId): 'claude' | 'codex' | undefined;
  resolveTier(setting: { family: FamilyId; model?: string | undefined; effort?: EffortLevel | undefined } | undefined, tier: TierName, installedOllama: ReadonlySet<string>): TierResolution;
  applyApproved(set: ApprovedModelSet): void;  // replaces the overlay and advances revision; later revisions win
}
```

**Assumptions cited:** [[c5]] [[c12]]

### 5.3 sc3: models.definitions IPC request

**Owner Story:** `s2`
**Consumed by:** `s4`, `s5`, `s6`, `s7`

**Purpose:** The one read-only daemon request every client uses to learn families, listed models with aliases, per-model efforts, limits and output budgets, each family's tier defaults and summariser model, the default family, and which listed Ollama models are installed (k2). Carries user-approved models marked as such (s4/ac5). providers.listModels is drawn from the same registry and agrees with it (s2/ac2).

**Interface sketch (type-level):**

```
// request: 'models.definitions'  params: {}
interface ModelDefinitionsResult {
  readonly version: number;
  readonly revision: number;
  readonly defaultFamily: 'cli-claude' | 'cli-codex';
  readonly families: readonly {
    readonly id: FamilyId;
    readonly displayName: string;
    readonly tierDefaults?: Readonly<Record<TierName, TierDefault>> | undefined;
    readonly summariserModel?: string | undefined;
    readonly models: readonly {
      readonly id: string;
      readonly aliases: readonly string[];
      readonly displayName?: string | undefined;
      readonly efforts: readonly EffortLevel[];
      readonly inputLimit?: InputLimit | undefined;
      readonly outputBudget: number;
      readonly source: 'shipped' | 'user-approved';
      readonly installed?: boolean | undefined;   // ollama only: from Ollama's live listing; absent when Ollama is unreachable
    }[];
  }[];
}
```

**Assumptions cited:** [[c5]]

### 5.4 sc4: Unknown-model check and approval requests

**Owner Story:** `s4`
**Consumed by:** `s5`, `s6`, `s7`

**Purpose:** The daemon flow that checks a Claude or Codex model not in the definitions through its CLI, one call at a time (k1, k3), returns per-effort evidence, and stores the user's decision in a per-user store (k5) outside the shipped file and config.json (k4). Ollama has no such flow: only listed Ollama models are selectable. The store is written atomically; a new revision is published to every thread only after the write succeeds, and a failed write is reported, never acknowledged.

**Interface sketch (type-level):**

```
// request: 'models.check'   params: { family: 'cli-claude' | 'cli-codex'; modelId: string; claimedEfforts: EffortLevel[] }
type EffortVerdict = 'accepted' | 'rejected' | 'recognised-unconfirmed'; // last: Claude, support not confirmable by the CLI
interface ModelCheckResult {
  readonly family: 'cli-claude' | 'cli-codex';
  readonly modelId: string;
  readonly runs: boolean;
  readonly inputLimit?: InputLimit | undefined;
  readonly outputBudget?: number | undefined;   // from the CLI's own output where it states one
  readonly efforts: readonly { readonly effort: EffortLevel; readonly verdict: EffortVerdict; readonly evidence: string }[];
  readonly checkId: string;
  readonly error?: string | undefined;     // the CLI could not be reached (s4/ac4)
}
type DecisionResult = { readonly ok: true; readonly revision: number } | { readonly ok: false; readonly reason: 'unknown-check' | 'write-failed' | 'invalid-efforts'; readonly detail: string };
// request: 'models.approve' params: { checkId: string; efforts: EffortLevel[] } -> DecisionResult
// request: 'models.reject'  params: { checkId: string }                         -> DecisionResult
interface ApprovedProfile {
  readonly family: 'cli-claude' | 'cli-codex';
  readonly modelId: string;
  readonly status: 'approved' | 'rejected';
  readonly efforts: readonly EffortLevel[];  // approved: only checked AND approved levels (s4/ac3)
  readonly inputLimit?: InputLimit | undefined;
  readonly outputBudget: number;
  readonly decidedAt: string;               // ISO time
  readonly cliVersion: string;
}
// hub message main -> worker, sent only after the store write succeeded: { kind: 'approved-models'; set: ApprovedModelSet }
```

**Assumptions cited:** [[c11]]

### 5.5 sc5: Global-only tier settings (persisted shape)

**Owner Story:** `s3`
**Consumed by:** `s5`, `s6`, `s7`

**Purpose:** The settings shape clients write after k6, matching today's on-disk keys: tier runner, model and effort exist only globally; a repo may only assign roles to tiers under `tasks` (src/config/analyze.ts:404) and set the core floor, which stays a tier name (src/config/analyze.ts:144). The daemon ignores and removes per-repo tier overrides (s3/ac5), keeps every existing `tasks` and coreFloor value, and prunes the retired global Ollama settings.

**Interface sketch (type-level):**

```
interface GlobalTierSetting { readonly runner: FamilyId; readonly model: string; readonly effort?: EffortLevel | undefined; } // model: id or alias
interface PersistedModels { // config.json `models`
  readonly tiers?: Partial<Record<TierName, GlobalTierSetting>> | undefined;
  readonly tasks?: Readonly<Record<string, TierName>> | undefined;      // role -> tier (parsed internally as roleTiers)
  readonly coreFloor?: TierName | undefined;
  readonly byRepo?: Readonly<Record<string, PersistedRepoModels>> | undefined;
  // retired, pruned by reconcile: shaper.ollamaNumCtx, shaper.ollamaNumPredict
}
interface PersistedRepoModels { // models.byRepo[repo]
  readonly tasks?: Readonly<Record<string, TierName>> | undefined;
  readonly coreFloor?: TierName | undefined;
  // no `tiers`: a stale models.byRepo[repo].tiers entry is removed by reconcile
}
```

**Assumptions cited:** [[c12]]

## 6. Story boundaries

### 6.1 Story E20261025ce99b720:S001

**Owns:** `sc1`, `sc2`

The definitions file contents (seeded from the curated catalog with current ids such as the Claude haiku the CLI resolves today, the CLI aliases the tier defaults use, and the Ollama models insrc ships with, each with its context window and output budget taken from today's defaults), the validator (missing file, malformed JSON, unknown family, duplicate id or alias in a family, a tier default or summariser model that is not an id or alias of its family, an Ollama model without a token input limit, a model without an output budget, a defaultFamily without tier defaults; each failure names the entry), its run in the main thread before the thread services start and before the socket listens, and building the revisioned registry at the start of the main thread and of each model-running worker. Both installer copies take the chosen family's tier defaults from the file. Retires the curated catalog asset and its loader. Tests: a validator suite with one fixture per refusal reason (ac3); a data-only addition test that adds a model, alias and output budget to a fixture and reads them back through the registry with no code change (ac2); a boot-order test that the file is validated before thread services start and before listen (ac1, k7); the main thread and a worker build equal registries; the existing model-catalog and model-catalog-asset suites are adapted.

### 6.2 Story E20261025ce99b720:S002

**Owns:** `sc3`
**Depends on:** `sc1`, `sc2`

The handler for models.definitions, the projection of the registry into the result (with each listed Ollama model's installed state from Ollama's live listing), its entry in src/daemon/threads/method-class.ts, and re-sourcing providers.listModels from the registry so the two answers agree; for Ollama, providers.listModels returns only listed models. Tests: models.definitions returns every family, model, alias, effort list, limit, output budget, tier default and summariser model of a fixture file (ac1); providers.listModels and models.definitions agree for every family, and an installed but unlisted Ollama model appears in neither (ac2); the method-class coverage test passes; the existing list-models suite is adapted.

### 6.3 Story E20261025ce99b720:S003

**Owns:** `sc5`
**Depends on:** `sc1`, `sc2`

Moving every daemon consumer, in the main thread and the workers, onto the registry: resolveTier and the role router's default fallback, the summariser selection including the summary worker's path, the effort list (TIER_EFFORTS and the config catalog's effort rows), CliProvider's input budget and effort forwarding, OllamaProvider's num_ctx, and the output budget of every synthesizer, planner, aggregator and tool-loop call, plus the runner/CLI-kind literals in routing, provider construction, attribution and workflow code. Keys the analyze-config cache and the role router's provider cache on the registry revision so a new revision rebuilds them. Applies decision A at resolution and logs a warning naming the tier, the requested model, the reason and the default used. Also the settings parse and reconcile rules: read and keep `tasks` and coreFloor, stop reading then remove per-repo tier overrides with a warning naming repo and tier, and prune shaper.ollamaNumCtx and shaper.ollamaNumPredict (with their config-catalog rows). Tests: an unset tier resolves to the family's tier default from a fixture (ac1); an unsupported effort is not passed and a warning names model and effort (ac2); a source scan fails on runner or model literals outside the family implementations (ac3); a repo's `tasks` choice applies while the tier's model comes from global settings (ac4); reconcile removes per-repo tier overrides, warns with repo and tier, keeps `tasks` and coreFloor, and prunes the two Ollama settings (ac5); an unlisted model and a not-installed Ollama model fall back with the warning (decision A); changing a fixture model's input limit and output budget changes the num_ctx and maxTokens a provider is built with; after caches are populated, a new revision makes the next call use the newly resolved model; the summariser in a worker resolves the same model as in the main thread; the existing analyze-tiering, tier-defaults and core-floor suites are adapted.

### 6.4 Story E20261025ce99b720:S004

**Owns:** `sc4`
**Depends on:** `sc1`, `sc2`, `sc3`

The per-family check procedures for the two CLI families (Codex: model list from the CLI plus a run; Claude: a run, input limit and output budget from the JSON output, recognised effort names), their serial execution, the approved-model store under the insrc home (approved and rejected profiles) with atomic write by temporary file and rename and its validation on read, publishing a new revision to the main thread's registry and over the hub channel to every worker only after a successful write, a later-started worker reading the store at its start, the method-class entries for models.check, models.approve and models.reject, and refusing to set a tier to a model whose profile is rejected or whose check could not reach the CLI. Tests: per-family checks against fake CLIs record each verdict and run one call at a time (ac1); results list each claimed level with evidence and nothing is usable before approval (ac2); an approved profile admits only the passed and approved levels (ac3); a rejected profile or an unreachable CLI refuses the model with a reason (ac4); an approved model appears in models.definitions marked user-approved (ac5); a failed store write returns write-failed, publishes no revision and leaves the previous store intact after a restart; an approval and a rejection reach a worker's registry; a malformed store is reported and ignored without stopping the daemon; the method-class coverage test passes.

### 6.5 Story E20261025ce99b720:S005

**Depends on:** `sc3`, `sc4`, `sc5`

The TUI model-tiers pane and its effort cycle driven by models.definitions (Ollama models offered only when listed, marked when not installed), the unknown-model check and approval screen for the CLI families, and the repo settings view limited to `tasks` and coreFloor. Tests: the pane offers exactly the families, models and effort levels of a fake models.definitions answer and holds no list of its own (ac1); saving an unknown CLI model starts the check and shows its results for approval (ac2); the repo view edits only `tasks` and coreFloor (ac3); the existing model-tiers pane suites are adapted.

### 6.6 Story E20261025ce99b720:S006

**Depends on:** `sc3`, `sc4`, `sc5`

The VS Code model-tier picker driven by models.definitions instead of its runner union and compiled config-catalog effort rows, the unknown-model check and approval prompt for the CLI families, and the Repo Configuration panel without per-tier runner or model fields, writing role assignments under `tasks`. Tests: the picker offers exactly the options of a fake models.definitions answer and the extension bundle keeps no runner or model list (ac1); confirming an unknown CLI model shows the check results and saves only after approval (ac2); the repo panel shows only `tasks` and coreFloor (ac3); the existing model-tier-picker suite is adapted.

### 6.7 Story E20261025ce99b720:S007

**Depends on:** `sc3`, `sc4`, `sc5`

The JetBrains model-tiers settings section driven by models.definitions instead of ModelTiersModel.PROVIDERS, the unknown-model check and approval dialog for the CLI families, and the per-repo settings without per-tier runner or model fields, writing role assignments under `tasks`. Tests: the section offers exactly the options of a fake models.definitions answer and the plugin keeps no runner or model list (ac1); applying an unknown CLI model shows the check results and saves only after approval (ac2); the per-repo settings show only `tasks` and coreFloor (ac3); the existing ModelTiersModel and settings tests are adapted.

## 7. Non-functional targets

- **Performance:** The definitions file is parsed and validated once in the main thread at boot and read once more by each worker at its start; every later model question is an in-memory lookup. models.definitions touches no CLI; it asks Ollama for its installed list with the same bounded timeout providers.listModels uses today. An approval reaches every worker in one hub message, and caches are rebuilt only when the revision changes.
- **Security:** No cloud REST call is added (k1): checks run only through the installed claude and codex CLIs, and Ollama is only asked which models are installed. The approved-model store is a per-user file under the insrc home, written only by the daemon's main thread; clients reach it only through models.approve and models.reject (k2).
- **Observability:** A bad definitions file stops the daemon with a log naming the faulty entry (s1/ac3). Dropping an unsupported effort logs the model and effort (s3/ac2). Every fallback logs the tier, the requested model, the reason (unlisted, rejected, not installed) and the default used (decision A). Removing a per-repo tier override logs the repo and tier, and pruning the retired Ollama settings logs each path (s3/ac5). Each unknown-model check logs every CLI call and its verdict; a failed store write is logged with its cause.
- **Durability:** Approved and rejected profiles survive restarts and insrc updates because they live outside the shipped file and outside config.json; the store is replaced atomically, so a crash mid-write leaves the previous store, and a decision is acknowledged only after it is durable. When an update ships a model a user had approved, the shipped definition wins. A malformed store is reported and ignored rather than stopping the daemon. Existing `tasks` and coreFloor values are kept when per-repo tier overrides are removed.

## 8. Rollout

**Phase A — definitions file and per-thread registry**

**Stories:** `s1`

s1 owns sc1 and sc2, which every other Story consumes; it has no dependencies.

**Backward compat:** providers.listModels keeps answering the same Claude and Codex models: the definitions file is seeded from the curated catalog (stale ids refreshed) and adds the aliases today's tier defaults use, so every tier already set to opus, sonnet, haiku or a catalogued Codex id still resolves. The Ollama models insrc ships with are listed with today's context window and output budget, so analysis behaves as before. Fail-fast startup is kept and now runs before the worker threads start.

**Phase B — daemon serves and runs by the definitions**

**Stories:** `s2`, `s3`

Both depend only on s1. s2 adds models.definitions and re-sources providers.listModels; s3 moves every daemon consumer, in every thread, onto the registry, rebuilds caches on a new revision, retires the global Ollama settings, applies the fallback and makes tiers global-only.

**Backward compat:** providers.listModels keeps its request and result shape. A tier set to a listed model or alias keeps running it; only an effort its model does not accept is dropped, with a warning. A tier set to a model that is neither listed nor approved, or to an Ollama model that is listed but not installed, runs a tier default with a warning naming the tier, the requested model, the reason and the default (decision A). Per-repo tier overrides are removed with a warning naming repo and tier; `tasks` and coreFloor values are kept. A user who had set ollamaNumCtx or ollamaNumPredict sees the prune logged; those values are now set per model in the definitions file.

**Phase C — unknown-model check and approval**

**Stories:** `s4`

s4 depends on s2 (approved models appear in models.definitions) and must land before the client Stories that drive its check and approval requests.

**Backward compat:** Until a user approves a fallen-back Claude or Codex model, its tier keeps running the default; approving it makes the tier run the requested model in every thread without a restart.

**Phase D — clients render the daemon's definitions**

**Stories:** `s5`, `s6`, `s7`

Each client Story depends on s2, s3 and s4 and on nothing else from the others, so the TUI, VS Code and JetBrains migrations can land in any order.

**Backward compat:** An older plugin keeps working against the new daemon because providers.listModels and the config write path keep their shapes and keys (including `tasks`); it simply shows its own lists until updated.

**Ordering rationale:** Owners land before consumers: s1 (sc1, sc2) first; then s2 (sc3) and s3 (sc5), which need only s1; then s4 (sc4), which needs sc3 to expose approved models; then the three clients, which consume sc3, sc4 and sc5. This follows the Epic's dependsOn edges exactly.

**Risky bits**

| Area | Why | Mitigation |
| :--- | :--- | :--- |
| Stale resolved models after an approval (s3, s4) | The analyze config is cached for the process lifetime, the role router memoises built providers, and CliProvider fixes its model at construction (src/config/analyze.ts:234, src/analyze/context/role-router.ts:196-201, src/agent/providers/cli-provider.ts:205-206), in every thread. | Every such cache is keyed by the registry revision and rebuilt on change; the revision is published only after the store write succeeds; tests populate the caches first, then approve, and check that the next call runs the new model in the main thread and in a worker. |
| Daemon-wide literal and setting removal (s3) | 30 non-test files import src/config/analyze.ts, 14 carry runner literals and five call sites read the global Ollama budgets; a missed site keeps a stale default, effort or budget. | s3 adds a source scan test that fails on runner or model literals outside the family implementations and on any remaining read of the retired Ollama settings, and keeps resolveTier's signature so callers change only where they read literals. |
| Upgrade of existing settings (s1, s3) | Users have tiers set to aliases, to catalogued ids, to unlisted models and to Ollama models insrc does not list, plus tuned global Ollama budgets; silently changing what runs would surprise them, and running an unlisted model would break k5. | The definitions keep today's aliases and catalogued ids and list the shipped Ollama models with today's budgets; every fallback and every pruned setting is logged with the reason; per-repo overrides are removed only with a logged warning, keeping `tasks` and coreFloor. |

## 9. Alternatives considered

### 9.1 a1: One definitions registry per daemon thread, grown from the curated catalog — **CHOSEN**

Replace the curated cloud catalog and the global Ollama settings with one shipped definitions file listing every selectable model of all three families with its own settings, validated once at boot and loaded into a revisioned registry in every model-running thread, with user-approved CLI models in a separate daemon-owned store pushed to every thread.

The curated catalog becomes the single model-definitions file: per family its runner identity and CLI kind, and every model that may be selected, each with its aliases, accepted effort levels, input limit and output budget, plus the family's own tier defaults and summariser model and the family a fresh install defaults to. Ollama models are listed like the others; Ollama's live listing only says which listed models are installed, and an unlisted installed model is never offered or run. The global ollamaNumCtx and ollamaNumPredict settings are retired: every call takes its context window and output budget from the model it runs. The main thread validates the file before it starts the worker threads and before it listens. Each model-running thread builds the same registry from the validated file at its start; the registry carries a revision, and everything that caches a resolved model (the analyze config, the role router's providers) is rebuilt when the revision changes.

User-approved unknown Claude and Codex models are per-user facts, kept in a daemon-owned store under the insrc home and written atomically; the main thread publishes a new revision to every worker over the hub channel only after the write succeeds. A tier set to a model that is neither listed nor approved runs a tier default from the definitions, with a warning, until the user approves it. One read-only IPC request returns the merged view, providers.listModels is derived from it, and the unknown-model check probes the CLIs one call at a time. Clients render the IPC answer; tiers become global-only, with the role assignments still persisted under `tasks`.

**Pros:**
- One source for every model fact and setting: adding a model, alias, effort level, limit or output budget is a data-file edit and a daemon restart, with no code change and no user setting to keep in step.
- Every thread resolves the same model with the same settings, and an approval takes effect in already-built providers because caches follow the registry revision.
- Clients reach facts only over IPC (k2), so a new model or effort level needs no VS Code or JetBrains release.
- Shipped facts (k4) and per-user approvals (k5) stay apart, and an approval is never acknowledged before it is durable.

**Cons:**
- Widest migration: 30 non-test files import src/config/analyze.ts, 14 carry runner literals, and five call sites read the global Ollama budgets.
- Users who tuned ollamaNumCtx or ollamaNumPredict lose that knob; a different value needs a definitions-file edit.
- Approval changes must reach worker threads and invalidate their caches, adding a message type and a rebuild path that tests must cover.

**Cost estimate:** L

### 9.2 a2: Build-time code generation from one data file

Keep one shipped data file but compile it into generated TypeScript constants that the daemon and the VS Code extension import at build time, with JetBrains reading the same facts over IPC.

A build step turns the shipped definitions file into a generated module of typed constants (families, models, aliases, effort levels, limits, tier defaults). The daemon, in every thread, and the VS Code extension import the generated module, so every literal in code is replaced by a typed reference and the compiler catches a removed model. JetBrains receives the same facts over a daemon IPC request.

Unknown-model approvals are handled at runtime by the daemon in a separate store and merged where the daemon resolves a tier. VS Code uses the generated constants for its lists and asks the daemon only for approved models.

**Pros:**
- Typed references: a model removed from the data file breaks the build where it was used.
- No boot-time parse, so threads need no registry initialisation step.

**Cons:**
- Breaks k2 for VS Code: the extension keeps its own compiled copy, so a model or effort change still needs a VS Code release.
- Two delivery paths for the same facts (generated constants for TypeScript, IPC for JetBrains), so clients can disagree between releases.
- A data-file edit needs a regenerated module and a rebuild of every TypeScript consumer, weakening s1/ac2.

**Cost estimate:** M

**Rejected because:** Typed constants, but VS Code keeps a compiled copy (violates k2), a data edit needs a rebuild (partial k4) and a hand-edited installed file is not checked at start (partial k7).

### 9.3 a3: Definitions seeded into the user's settings

Ship a defaults file whose contents the config reconcile step copies into each user's config.json, then let every consumer read model facts from the settings it already loads.

The shipped defaults describe families, models, effort levels and limits; on daemon boot and update the existing config reconcile step fills them into the user's config.json, and every consumer, in any thread, reads them through the settings path it already uses.

User-approved models are added to the same settings section, and the per-repo tier override removal is another reconcile rule.

**Pros:**
- Reuses the existing settings load and reconcile path, which every thread already reads.
- Users can see every model fact in one place.

**Cons:**
- Violates k4: model-level facts would live in the user's config.json.
- A shipped model update must be merged into every user's edited copy, so drift moves into each user's settings.
- Users can hand-edit a model's effort levels, so the daemon could again run a model with a capability it lacks.

**Cost estimate:** M

**Rejected because:** Model facts in the user's config.json violate k4, and editable capabilities weaken k5.

### 9.4 a4: Keep facts in place and add a consistency check

Leave the literals where they are and add a test that fails when the daemon, the config catalog, the installer and the clients disagree.

No new source of truth: the existing literals stay in the daemon, the config catalog, the installer and both plugins, and a cross-file test compares them and fails the build when they drift. Per-model effort levels and input limits are added as further literals.

Unknown models are handled by letting the user pick any effort the CLI recognises, with no stored profile.

**Pros:**
- Smallest change; nothing moves and no client behaviour changes.
- Drift between existing copies is caught in CI.

**Cons:**
- Does not meet k4 or k2: facts stay in code and clients keep their own lists.
- Cannot satisfy s4 or k5: there is nowhere to store an approved profile.
- The check only compares copies it knows about.

**Cost estimate:** S

**Rejected because:** Facts stay in code and in each client, with nowhere to keep an approval: fails k2, k4 and k5.

## 10. References

- **[[c1]]** `prior-artifact` `DEF-ce99b72065d03b1b` — "Approved Define for this Epic (approved with review override 2026-10-25)."
- **[[c2]]** `step-output` `s1` — "HldContext analyze bundles (capability discovery, import graph, structural maps, manifests, conventions)."
- **[[c3]]** `code` `src/daemon/model-catalog.ts:162` — "export async function validateModelCatalog(): Promise<void> {"
- **[[c4]]** `code` `src/daemon/index.ts:381` — "await validateModelCatalog();"
- **[[c5]]** `code` `src/daemon/index.ts:377` — "missing/malformed catalog asset is a fail-fast startup refusal"
- **[[c6]]** `code` `src/daemon/index.ts:205` — "const threadServices = threadsEnabled()"
- **[[c7]]** `doc` `docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/evidence/def-cli-probes.md:40` — "So no Claude CLI run shows whether a given model supports a given level."
- **[[c8]]** `step-output` `s3` — "a1 is the only alternative that satisfies all seven constraints. a2 violates k2 and only partially meets k4 and k7; a3 violates k4 and only partially meets k5 and k7; a4 violates k2, k4 and k5. Listin"
- **[[c9]]** `code` `src/daemon/threads/main-services.ts:154` — "hubPort: port2"
- **[[c10]]** `stakeholder` `user 2026-10-25` — "go with A: a tier set to an unlisted, unapproved model falls back to the tier default from the definitions with a warning until the user approves it"
- **[[c11]]** `doc` `docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/evidence/def-cli-probes.md:20` — "For codex, a model's accepted levels must therefore come from `codex debug models`"
- **[[c12]]** `code` `src/cli/panes/model-tiers.ts:63` — "tiers[t] = resolveTier(tiering, t);"
- **[[c13]]** `code` `src/config/analyze.ts:144` — "readonly coreFloor?: TierName | undefined;"
- **[[c14]]** `code` `src/daemon/threads/method-class.ts:148` — "['providers.listModels', 'session', false],"
- **[[c15]]** `stakeholder` `user 2026-10-25` — "ollama models need to be pre-registered in the disributed config. only models specified in the config should be avaiable for selection"
- **[[c16]]** `stakeholder` `user 2026-10-25` — "remove the global settings, add per model settings"
- **[[c17]]** `code` `src/config/analyze.ts:234` — "let cached: AnalyzeConfig | undefined;"
- **[[c18]]** `code` `src/config/analyze.ts:404` — "if (isObject(src['tasks'])) {"
