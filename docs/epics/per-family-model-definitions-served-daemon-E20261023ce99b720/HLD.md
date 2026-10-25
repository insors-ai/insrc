<!-- insrc:artifact HLD-ce99b72065d03b1b -->

# HLD: per-family-model-definitions-served-daemon

## Summary

Every fact about the model families insrc runs (Claude CLI, Codex CLI, Ollama) moves into the curated catalog file shipped with insrc, extended to list every model that may be selected with its aliases, effort levels and input limit, plus each family's tier defaults, summariser model and, for Ollama, the default tool-loop model. The daemon checks the file at startup and every thread that runs models, and the terminal UI's review command, builds the same registry from it; Ollama is asked at the start of each operation which listed models are installed, and the global Ollama context-window setting is replaced by each model's own. A Claude or Codex model the user has checked, seen run and approved is added from a separate per-user store; that approval, any saved tier change, a catalog changed by an update and any change in what Ollama has installed takes effect on the next operation without a restart, while a model that is neither listed nor approved is never run. Clients get the whole picture from one daemon request and keep no lists of their own.

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

A revisioned model-definitions registry built from the curated cloud catalog, which keeps its file (src/assets/models/cloud-model-catalog.json), its loader (validateModelCatalog, src/daemon/model-catalog.ts:162) and its boot hook (src/daemon/index.ts:381) and is extended in place, as the DEF decided. The file lists, per family, its runner identity and CLI kind and every selectable model with its aliases, accepted effort levels and input limit, plus the family's core/mid/cheap tier defaults and summariser model, the Ollama family's tool-loop default model, and the family a fresh install defaults to; it replaces the global models.shaper.ollamaNumCtx setting. Ollama models are listed like the others; whether Ollama answers and which listed models it has installed is asked through the bounded listing at the start of each operation that may run an Ollama model. The output cap models.shaper.ollamaNumPredict stays a global setting (user decision 2026-10-25). The main thread validates the file before it starts the worker threads (src/daemon/index.ts:205) and before it listens; every model-running thread builds the registry at its start, and the TUI's review command builds its registry from the daemon's definitions answer, which carries every fact the registry holds, including each family's CLI kind. User-approved Claude and Codex models live in a per-user store owned by the main thread, written atomically, and published to every thread as a new registry revision only after the write succeeds; an approval is accepted only for a check in which the model ran without error. Every saved settings change (config.write, config.reload) replaces the settings file atomically and advances a settings revision that the main thread pushes to every worker; a settings file that fails to parse keeps the last good configuration, and config.write refuses to save over a settings file it cannot read or parse. Every process-lifetime cache that holds a resolved model or a model choice is keyed on both revisions and on the Ollama availability the operation saw, and rebuilt when any of them changes; the role router's cache lives for one run, so each new run resolves afresh. The TUI's review command rebuilds before a review whenever the daemon's catalog fingerprint, its start id or either revision differs from what it last used, so a daemon restarted with a changed catalog is picked up too. A tier set to a model that is neither listed nor approved, to a listed Ollama model that is not installed, or to an Ollama model while Ollama does not answer, runs a tier default with a warning (user decision A); the Ollama tool loop runs a listed, installed model or fails with a clear message. One read-only IPC request serves the merged view; providers.listModels is drawn from it. Tier settings become global-only; role assignments stay persisted under `tasks` and coreFloor stays a tier name.

## 3. Architecture shape

Every model-running daemon thread: (1) a ModelRegistry built at thread start from the validated catalog file plus the current approved-model set, carrying a registry revision, the current settings revision and a fingerprint of the catalog contents; it answers every model question: families, listed models and aliases, accepted efforts, a model's input limit, a family's tier defaults and summariser model, the Ollama tool-loop default, the runner and CLI kind of a family, what a tier setting resolves to (with the fallback of decision A, including when Ollama does not answer) and which model the tool loop runs. (2) Every consumer asks the registry instead of DEFAULT_TIERS, TIER_EFFORTS, SUMMARISER_CLI_FALLBACK, CODEX_INPUT_BUDGET_CHARS and the global ollamaNumCtx: tier resolution (resolveTier and the role router's default fallback), shaper and summariser provider selection (including the summary worker's path, src/analyze/summariser/driver.ts:195 and :211), CliProvider's input budget, CLI kind and effort forwarding (src/agent/providers/cli-provider.ts:204), OllamaProvider's num_ctx (src/agent/providers/ollama.ts:444, set today at src/analyze/context/shaper-provider.ts:267, :303 and src/analyze/context/driver.ts:531, :833), and the tool-loop model choice (localToolLoopModel, src/analyze/context/driver.ts:1100-1104, today the cheap tier's Ollama model or models.local.coreModel). The output cap ollamaNumPredict is read as today. (3) Ollama availability is taken per operation: an operation that may run an Ollama model first asks Ollama for its installed list through the same bounded listing providers.listModels uses (src/daemon/list-models.ts:113), and the result (unreachable, or the set of installed listed models) feeds tier resolution and the tool-loop choice for that operation; an Ollama error inside a call (src/agent/providers/ollama.ts:375) still fails that call as today, and the next operation re-checks. (4) Every process-lifetime cache that holds a resolved model or a model choice is keyed by the registry revision, the settings revision and the Ollama availability of the operation, and rebuilt when any of them changes, so already-built providers are replaced: the analyze config (src/config/analyze.ts:234, today reset only by a test hook at src/config/analyze.ts:507), the docgen narrative generator's provider (src/docgen/extract/narrative-generator.ts:56-63) and the local tool-loop model choice read from models.local.coreModel (src/config/local.ts:67-90); for the local settings only the model choice is refreshed, while the embedding settings cached with it stay as they are. The role router's provider map lives for one run (src/analyze/context/role-router.ts:192-196): each new run builds it from the current registry, settings and Ollama availability, while a run already in progress keeps the providers it resolved when it started. Main thread only: (5) validation of the catalog file by the existing loader and boot hook, before the thread services start and before the socket listens, and a start id minted once per daemon start; (6) the approved-model store and the unknown-model check service, which probes the installed CLIs one call at a time, accepts an approval only for a check whose model ran without error, writes the store atomically and only then publishes the new registry revision to every worker over the hub channel (src/daemon/threads/main-services.ts:154, src/daemon/threads/channel.ts:124); (7) the settings revision: config.write and config.reload (src/daemon/handler-runtime.ts:1278-1299, :1305, which today start from an empty document when config.json cannot be read or parsed, write it in place and call the no-op reloadChatConfig, src/daemon/chat-handler.ts:52) instead refuse a save when an existing config.json cannot be read or parsed (a missing file is still created), replace the settings file atomically through the write-temp-then-rename seam the reconcile path already uses (src/config/reconcile-io.ts:63-64), advance the revision after the replace and push it to every worker over the same hub (workers already take pushes, src/daemon/threads/summary-worker.ts:34); a thread whose settings read fails to parse keeps its last good configuration instead of caching the defaults as today (src/config/analyze.ts:335-340); (8) the config reconcile rules that remove per-repo tier overrides and prune the retired ollamaNumCtx setting (src/config/reconcile.ts:316). Outside the daemon: (9) the TUI's review command, the one model-running path in another process (src/cli/services/workflow.ts:248-253), builds its registry from the models.definitions answer instead of reading model facts itself, and before each review asks the daemon again and rebuilds its registry and its resolved review model when the catalog fingerprint, the daemon start id, the registry revision or the settings revision differs from the ones it last used; it takes Ollama availability per review as in (3). IPC: models.definitions returns the merged view with each family's CLI kind, each Ollama model's installed state, both revisions, the catalog fingerprint and the daemon start id; providers.listModels keeps its shape but is drawn from the registry; models.check / models.approve / models.reject drive the unknown-model flow; each new method is classified in src/daemon/threads/method-class.ts. Clients: the TUI model-tiers pane, the VS Code model-tier picker and repo panel, and the JetBrains model-tiers and per-repo sections render models.definitions and call the check/approve requests; none keeps a runner, model or effort list. Installer: both copies of the install script take the chosen family's tier defaults from the catalog file.

## 4. Diagrams

- [ER model](docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/er-model.html)

## 5. Shared contracts

### 5.1 sc1: ModelDefinitionsFile (the curated catalog file, extended)

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`

**Purpose:** The shipped, versioned data format of src/assets/models/cloud-model-catalog.json, extended in place to list every selectable model of every family with its facts (k4): aliases, accepted efforts and input limit, plus each family's tier defaults and summariser model and the Ollama tool-loop default. It replaces the global ollamaNumCtx setting; Ollama models must be listed to be selectable. Validated by the existing loader and boot hook before the daemon starts its workers or listens (k7).

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
  readonly efforts: readonly EffortLevel[];      // required; accepted effort levels ([] = no effort passed)
  readonly inputLimit?: InputLimit | undefined;  // required for ollama models; absent on a CLI model = the CLI's own refusal decides
}
interface TierDefault { readonly model: string; readonly effort?: EffortLevel | undefined; } // model: an id or alias of THIS family
interface FamilyDefinition {
  readonly id: FamilyId;
  readonly cliKind?: 'claude' | 'codex' | undefined;  // required for the CLI families, absent for ollama
  readonly displayName: string;
  readonly models: readonly ModelDefinition[];        // required; the ONLY selectable models of the family, Ollama included
  readonly tierDefaults?: Readonly<Record<TierName, TierDefault>> | undefined; // required for the CLI families
  readonly summariserModel?: string | undefined;      // id or alias of this family; required for the CLI families
  readonly toolLoopModel?: string | undefined;        // ollama only, required: id of one of its listed models
}
interface ModelDefinitionsFile { // extends today's CloudModelCatalogFile (src/daemon/model-catalog.ts:48)
  readonly version: number;
  readonly defaultFamily: 'cli-claude' | 'cli-codex'; // the family a fresh install, an unset tier and every tier fallback use
  readonly families: readonly FamilyDefinition[];
}
```

**Assumptions cited:** [[c5]]

### 5.2 sc2: ModelRegistry (one per model-running thread or process, revisioned)

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`

**Purpose:** The only in-process source of model facts, built at the start of every model-running daemon thread from the validated sc1 file plus the current approved-model set, and in the TUI from the models.definitions answer, so every thread and process answers identically. It carries the registry revision, the settings revision and the catalog fingerprint; process-lifetime caches holding a resolved model key on the revisions together with the Ollama availability of the operation. It resolves aliases, applies user decision A to tiers (an unlisted or rejected model, a listed Ollama model that is not installed, or an Ollama model while Ollama does not answer, runs the tier default), and chooses the tool-loop model: the requested Ollama model (cheap tier's, else models.local.coreModel) when listed, else the Ollama family's tool-loop default, and only when installed.

**Interface sketch (type-level):**

```
interface ResolvedModel extends ModelDefinition {
  readonly family: FamilyId;
  readonly source: 'shipped' | 'user-approved';
}
interface ApprovedModelSet { readonly profiles: readonly ApprovedProfile[]; readonly revision: number; }
type FallbackReason = 'unlisted-model' | 'rejected-model' | 'not-installed' | 'ollama-unreachable';
interface TierResolution {
  readonly family: FamilyId;
  readonly model: ResolvedModel;               // canonical model actually run
  readonly effort?: EffortLevel | undefined;   // dropped when the model does not accept it (s3/ac2)
  readonly droppedEffort?: EffortLevel | undefined;
  readonly fallback?: { readonly reason: FallbackReason; readonly requested: string } | undefined; // decision A
}
type ToolLoopResolution =
  | { readonly ok: true; readonly model: ResolvedModel; readonly substitutedFor?: string | undefined } // substitutedFor: an unlisted requested model
  | { readonly ok: false; readonly reason: 'not-installed' | 'ollama-unreachable'; readonly model: string };
// Taken per operation from the bounded Ollama listing; never cached across operations.
type OllamaAvailability =
  | { readonly kind: 'unreachable' }                              // failure, timeout or malformed answer
  | { readonly kind: 'listed'; readonly installed: ReadonlySet<string> }; // may be empty: Ollama answered with no models
interface ResolvedModelCacheKey { // for process-lifetime caches; the role router's cache is per run
  readonly registryRevision: number;
  readonly settingsRevision: number;
  readonly ollama: string;                     // a stable fingerprint of the operation's OllamaAvailability
}
interface ModelRegistry {
  readonly revision: number;                   // changes on every published approved set
  readonly settingsRevision: number;           // changes on every settings-changed push (sc5)
  readonly catalogFingerprint: string;         // content hash of the validated catalog file
  families(): readonly FamilyDefinition[];
  defaultFamily(): 'cli-claude' | 'cli-codex';
  models(family: FamilyId): readonly ResolvedModel[];             // listed + approved overlay
  find(family: FamilyId, idOrAlias: string): ResolvedModel | undefined;
  acceptsEffort(family: FamilyId, idOrAlias: string, effort: EffortLevel): boolean;
  inputLimit(family: FamilyId, idOrAlias: string): InputLimit | undefined;
  tierDefault(family: FamilyId, tier: TierName): TierDefault | undefined; // undefined for ollama
  summariserModel(family: 'cli-claude' | 'cli-codex'): ResolvedModel;
  cliKind(family: FamilyId): 'claude' | 'codex' | undefined;
  resolveTier(setting: { family: FamilyId; model?: string | undefined; effort?: EffortLevel | undefined } | undefined, tier: TierName, ollama: OllamaAvailability): TierResolution;
  resolveToolLoopModel(requested: string, ollama: OllamaAvailability): ToolLoopResolution;
  applyApproved(set: ApprovedModelSet): void;  // replaces the overlay and advances revision; later revisions win
  applySettingsRevision(settingsRevision: number): void; // later revisions win
}
```

**Assumptions cited:** [[c5]] [[c12]]

### 5.3 sc3: models.definitions IPC request

**Owner Story:** `s2`
**Consumed by:** `s4`, `s5`, `s6`, `s7`

**Purpose:** The one read-only daemon request every client uses to learn families with their CLI kind, listed models with aliases, per-model efforts and limits, each family's tier defaults and summariser model, the Ollama tool-loop default, the default family, which listed Ollama models are installed, and what identifies this view: the registry and settings revisions, the catalog fingerprint and the daemon's start id (k2). It carries every fact a ModelRegistry holds, so a registry built from it equals the daemon's. Carries user-approved models marked as such (s4/ac5). providers.listModels is drawn from the same registry and agrees with it (s2/ac2). The TUI's review command builds its registry from this answer and compares the four identifying values before each review.

**Interface sketch (type-level):**

```
// request: 'models.definitions'  params: {}
interface ModelDefinitionsResult {
  readonly version: number;
  readonly revision: number;            // registry revision
  readonly settingsRevision: number;
  readonly catalogFingerprint: string;  // changes when an update ships different catalog contents
  readonly daemonStartId: string;       // new on every daemon start; revisions restart with it
  readonly defaultFamily: 'cli-claude' | 'cli-codex';
  readonly families: readonly {
    readonly id: FamilyId;
    readonly cliKind?: 'claude' | 'codex' | undefined; // present for the CLI families
    readonly displayName: string;
    readonly tierDefaults?: Readonly<Record<TierName, TierDefault>> | undefined;
    readonly summariserModel?: string | undefined;
    readonly toolLoopModel?: string | undefined;     // ollama only
    readonly models: readonly {
      readonly id: string;
      readonly aliases: readonly string[];
      readonly displayName?: string | undefined;
      readonly efforts: readonly EffortLevel[];
      readonly inputLimit?: InputLimit | undefined;
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

**Purpose:** The daemon flow that checks a Claude or Codex model not in the definitions through its CLI, one call at a time (k1, k3), returns per-effort evidence, and stores the user's decision in a per-user store (k5) outside the shipped file and config.json (k4). Ollama has no such flow: only listed Ollama models are selectable. An approval is accepted only for a check with runs = true and no error: a reachable CLI that refuses the model (Codex 'unsupported', Claude 'may not exist or not be accessible') or a check that could not reach the CLI is refused as model-did-not-run, whatever efforts are passed, including none. The store is written atomically; a new revision is published to every thread only after the write succeeds, and a failed write is reported, never acknowledged.

**Interface sketch (type-level):**

```
// request: 'models.check'   params: { family: 'cli-claude' | 'cli-codex'; modelId: string; claimedEfforts: EffortLevel[] }
type EffortVerdict = 'accepted' | 'rejected' | 'recognised-unconfirmed'; // last: Claude, support not confirmable by the CLI
interface ModelCheckResult {
  readonly family: 'cli-claude' | 'cli-codex';
  readonly modelId: string;
  readonly runs: boolean;                  // the model completed a run through its CLI
  readonly inputLimit?: InputLimit | undefined; // from the CLI's own output where it states one
  readonly efforts: readonly { readonly effort: EffortLevel; readonly verdict: EffortVerdict; readonly evidence: string }[];
  readonly checkId: string;
  readonly error?: string | undefined;     // the CLI could not be reached, or refused the model (s4/ac4)
}
type DecisionResult = { readonly ok: true; readonly revision: number } | { readonly ok: false; readonly reason: 'unknown-check' | 'model-did-not-run' | 'write-failed' | 'invalid-efforts'; readonly detail: string };
// request: 'models.approve' params: { checkId: string; efforts: EffortLevel[] } -> DecisionResult
//   refused with 'model-did-not-run' unless the check has runs = true and no error (any efforts, including [])
// request: 'models.reject'  params: { checkId: string }                         -> DecisionResult
interface ApprovedProfile {
  readonly family: 'cli-claude' | 'cli-codex';
  readonly modelId: string;
  readonly status: 'approved' | 'rejected';
  readonly efforts: readonly EffortLevel[];  // approved: only checked AND approved levels (s4/ac3)
  readonly inputLimit?: InputLimit | undefined;
  readonly decidedAt: string;               // ISO time
  readonly cliVersion: string;
}
// hub message main -> worker, sent only after the store write succeeded: { kind: 'approved-models'; set: ApprovedModelSet }
```

**Assumptions cited:** [[c11]]

### 5.5 sc5: Global-only tier settings (persisted shape), safe settings writes and settings revision

**Owner Story:** `s3`
**Consumed by:** `s5`, `s6`, `s7`

**Purpose:** The settings shape clients write after k6, matching today's on-disk keys: tier runner, model and effort exist only globally; a repo may only assign roles to tiers under `tasks` (src/config/analyze.ts:404) and set the core floor, which stays a tier name (src/config/analyze.ts:144). The daemon ignores and removes per-repo tier overrides (s3/ac5), keeps every existing `tasks` and coreFloor value, and prunes the retired ollamaNumCtx; ollamaNumPredict and models.local.coreModel stay as they are. config.write refuses a save when an existing config.json cannot be read or parsed (no write, no ok, no revision advance, an error naming the problem) and otherwise replaces the file atomically; a missing file is created. Every successful config.write or config.reload advances the settings revision, pushed to every worker and reported by models.definitions, so a saved tier takes effect in every thread and in the TUI's review command without a restart; a settings file that fails to parse never replaces a thread's last good configuration.

**Interface sketch (type-level):**

```
interface GlobalTierSetting { readonly runner: FamilyId; readonly model: string; readonly effort?: EffortLevel | undefined; } // model: id or alias
interface PersistedModels { // config.json `models`
  readonly tiers?: Partial<Record<TierName, GlobalTierSetting>> | undefined;
  readonly tasks?: Readonly<Record<string, TierName>> | undefined;      // role -> tier (parsed internally as roleTiers)
  readonly coreFloor?: TierName | undefined;
  readonly byRepo?: Readonly<Record<string, PersistedRepoModels>> | undefined;
  // kept: shaper.ollamaNumPredict (global output cap), local.coreModel (requested tool-loop model)
  // retired, pruned by reconcile: shaper.ollamaNumCtx
}
interface PersistedRepoModels { // models.byRepo[repo]
  readonly tasks?: Readonly<Record<string, TierName>> | undefined;
  readonly coreFloor?: TierName | undefined;
  // no `tiers`: a stale models.byRepo[repo].tiers entry is removed by reconcile
}
// config.write result (request shape unchanged)
type ConfigWriteResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason?: 'settings-unreadable' | 'settings-malformed' | 'invalid-path' | undefined; readonly detail?: string | undefined };
// hub message main -> worker, sent after config.write replaced, or config.reload re-read, the settings file:
//   { kind: 'settings-changed'; settingsRevision: number }
type SettingsReadOutcome =
  | { readonly kind: 'loaded' }
  | { readonly kind: 'kept-last-good'; readonly error: string }  // parse failed after a good read: previous config stays in use
  | { readonly kind: 'defaults'; readonly error: string };       // parse failed and no good read yet in this thread
```

**Assumptions cited:** [[c12]]

## 6. Story boundaries

### 6.1 Story E20261025ce99b720:S001

**Owns:** `sc1`, `sc2`

Extending the curated catalog in place: the file src/assets/models/cloud-model-catalog.json, its types (CloudModelCatalogFile, src/daemon/model-catalog.ts:48) and its validator (validateShape, src/daemon/model-catalog.ts:107, called by validateModelCatalog at src/daemon/model-catalog.ts:162 from the boot hook at src/daemon/index.ts:381) are extended rather than replaced. The file contents are refreshed with current ids such as the Claude haiku the CLI resolves today, the CLI aliases the tier defaults use, and the Ollama models insrc ships with, each with its context window taken from today's default, and the Ollama tool-loop default set to today's models.local.coreModel default. The validator refuses a missing file, malformed JSON, an unknown family, a CLI family without its CLI kind, a family without a models list or a model without an efforts list (an empty list is allowed), a duplicate id or alias in a family, a tier default or summariser model that is not an id or alias of its family, an Ollama model without a token input limit, an Ollama tool-loop default that is not one of its listed models, and a defaultFamily without tier defaults; each failure names the entry. The validator keeps running in the main thread before the thread services start and before the socket listens, and computes the catalog fingerprint from the validated contents. Building the revisioned registry at the start of the main thread and of each model-running worker, and from a models.definitions answer. Both installer copies take the chosen family's tier defaults from the file. Tests: a validator suite with one fixture per refusal reason (ac3); a data-only addition test that adds a model and alias to a fixture and reads them back through the registry with no code change (ac2); a boot-order test that the file is validated before thread services start and before listen (ac1, k7); the main thread and a worker build equal registries, and the fingerprint changes when, and only when, the catalog contents change; resolveTier on an Ollama tier distinguishes Ollama unreachable (fallback ollama-unreachable), a successful empty listing (not-installed) and a listing that includes the model (no fallback); the existing model-catalog and model-catalog-asset suites keep passing, adapted to the new fields.

### 6.2 Story E20261025ce99b720:S002

**Owns:** `sc3`
**Depends on:** `sc1`, `sc2`

The handler for models.definitions, the projection of the registry into the result (each family's CLI kind, each listed Ollama model's installed state from Ollama's live listing, both revisions and the catalog fingerprint), the daemon start id minted once when the daemon starts, its entry in src/daemon/threads/method-class.ts, and re-sourcing providers.listModels from the registry so the two answers agree; for Ollama, providers.listModels returns only listed models. Tests: models.definitions returns every family with its CLI kind, model, alias, effort list, limit, tier default, summariser model, the tool-loop default, both revisions, the fingerprint and the start id of a fixture file (ac1); a registry built from the answer equals the daemon's registry, CLI kind included, for both CLI families; the start id differs across two daemon starts with the same catalog; providers.listModels and models.definitions agree for every family, and an installed but unlisted Ollama model appears in neither (ac2); the method-class coverage test passes; the existing list-models suite is adapted.

### 6.3 Story E20261025ce99b720:S003

**Owns:** `sc5`
**Depends on:** `sc1`, `sc2`

Moving every daemon consumer, in the main thread and the workers, onto the registry: resolveTier and the role router's default fallback, the summariser selection including the summary worker's path, the effort list (TIER_EFFORTS and the config catalog's effort rows), CliProvider's input budget, CLI kind and effort forwarding, OllamaProvider's num_ctx, both tool-loop entry points' model choice (localToolLoopModel), and the runner/CLI-kind literals in routing, provider construction, attribution and workflow code. Taking Ollama availability per operation: every daemon operation that may run an Ollama model asks the bounded listing first and resolves its tiers and tool-loop model against that answer. Owns safe settings writes and the settings revision: config.write reads the existing config.json and, when it exists but cannot be read or parsed, refuses with settings-unreadable or settings-malformed and an error naming the file, writing nothing and advancing nothing (a missing file is created as today); otherwise it replaces the file atomically through the existing write-temp-then-rename seam. config.write and config.reload replace the no-op reloadChatConfig call with advancing the settings revision after the replace or re-read and pushing a settings-changed message to every worker; every model-running thread takes the push. A thread whose settings read fails to parse keeps its last good configuration and logs the error, using the defaults only when it has never read the file successfully. Keys every process-lifetime model cache on (registry revision, settings revision, Ollama availability) so a change of any rebuilds it: the analyze-config cache, the docgen narrative generator's provider, and the tool-loop model choice taken from the local settings (refreshing only that choice, not the embedding settings cached with it); the role router's per-run cache is built from the current values when each run starts. Applies decision A to tiers, logging the tier, the requested model, the reason (including that Ollama did not answer) and the default used; for the tool loop, substitutes the Ollama family's tool-loop default for an unlisted requested model with a warning, and fails the tool-loop analysis with a message naming the model and saying it is not installed (or that Ollama is unreachable) instead of falling back to a CLI. Also the settings parse and reconcile rules: read and keep `tasks` and coreFloor, stop reading then remove per-repo tier overrides with a warning naming repo and tier, and prune shaper.ollamaNumCtx with its config-catalog row; ollamaNumPredict is read as today. Tests: an unset tier resolves to the family's tier default from a fixture (ac1); an unsupported effort is not passed and a warning names model and effort (ac2); a source scan fails on runner or model literals outside the family implementations and on any remaining read of ollamaNumCtx (ac3); a repo's `tasks` choice applies while the tier's model comes from global settings (ac4); reconcile removes per-repo tier overrides, warns with repo and tier, keeps `tasks` and coreFloor, and prunes ollamaNumCtx (ac5); an unlisted model and a not-installed Ollama model fall back with the warning (decision A); an Ollama tier falls back with the ollama-unreachable warning when the listing fails, times out or is malformed, and with not-installed when Ollama answers with an empty list; with both revisions unchanged, an Ollama tier moves from its model to the fallback when the model is removed or Ollama stops, and back to its model when the model is pulled again or Ollama restarts, on the next operation; the tool loop runs a listed installed model, substitutes the default for an unlisted one, and fails with the stated message when the model is not installed or Ollama is unreachable, for both tool-loop entry points; changing a fixture Ollama model's input limit changes the num_ctx its provider is built with; for each of the three process-lifetime caches, populate it, change the registry revision, the settings revision or the Ollama availability, and check the next call uses the newly resolved model; a run started after a change resolves the new model while a run already in progress keeps its providers; a config.write of a tier makes the next call in the main thread and in a worker use the new model without a restart; the sequence approve, worker call, tier save via config.write, worker call ends on the newly saved model in the worker; config.reload after a hand edit of the settings file does the same; with config.json made unparsable, a config.write of an unrelated setting returns ok: false with settings-malformed, leaves the file byte-for-byte unchanged and advances no revision, and an unreadable file returns settings-unreadable the same way, while a missing file is created; a worker reading settings while config.write runs several writes in a row never sees a partial file; a settings file made unparsable after a good read keeps the previous configuration in use and logs the error; the embedding settings are unchanged after a settings change; the summariser in a worker resolves the same model as in the main thread; the existing analyze-tiering, tier-defaults and core-floor suites are adapted.

### 6.4 Story E20261025ce99b720:S004

**Owns:** `sc4`
**Depends on:** `sc1`, `sc2`, `sc3`

The per-family check procedures for the two CLI families (Codex: model list from the CLI plus a run; Claude: a run, input limit from the JSON output, recognised effort names), their serial execution, the classification of a reachable CLI that refuses the model (runs = false with the CLI's message as error) apart from an unreachable CLI, the approval gate that refuses models.approve with model-did-not-run unless the check has runs = true and no error, the approved-model store under the insrc home (approved and rejected profiles) with atomic write by temporary file and rename and its validation on read, publishing a new revision to the main thread's registry and over the hub channel to every worker only after a successful write, a later-started worker reading the store at its start, the method-class entries for models.check, models.approve and models.reject, and refusing to set a tier to a model whose profile is rejected or whose check could not reach the CLI. Tests: per-family checks against fake CLIs record each verdict and run one call at a time (ac1); results list each claimed level with evidence and nothing is usable before approval (ac2); an approved profile admits only the passed and approved levels (ac3); a rejected profile or an unreachable CLI refuses the model with a reason (ac4); a check where a fake CLI refuses the model returns runs = false with its message, and approving it is refused with model-did-not-run both with claimed efforts and with efforts = [], storing nothing and publishing no revision (ac4); an approved model appears in models.definitions marked user-approved (ac5); a failed store write returns write-failed, publishes no revision and leaves the previous store intact after a restart; an approval and a rejection reach a worker's registry; a malformed store is reported and ignored without stopping the daemon; the method-class coverage test passes.

### 6.5 Story E20261025ce99b720:S005

**Depends on:** `sc3`, `sc4`, `sc5`

The TUI model-tiers pane and its effort cycle driven by models.definitions (Ollama models offered only when listed, marked when not installed), the unknown-model check and approval screen for the CLI families (approval offered only when the check ran the model), the repo settings view limited to `tasks` and coreFloor (showing config.write's refusal reason when the settings file is unreadable or malformed), and the TUI's review command (src/cli/services/workflow.ts:248-253), the one model-running path outside the daemon: it builds its registry from the models.definitions answer instead of reading model facts itself, and before each review asks again and rebuilds its registry and resolved review model when the catalog fingerprint, the daemon start id, the registry revision or the settings revision differs from the ones it last used; it takes Ollama availability per review and builds its CLI provider with the CLI kind from the answer. Tests: the pane offers exactly the families, models and effort levels of a fake models.definitions answer and holds no list of its own (ac1); saving an unknown CLI model starts the check and shows its results for approval (ac2); the repo view edits only `tasks` and coreFloor (ac3); in a TUI process that has already run one review, approving a model and saving a tier to it, then running another review, uses the new model; with all four values unchanged the review command does not rebuild; across a daemon restart with a changed catalog and unchanged revision counters, the next review uses the new catalog's facts; the review command selects the claude and the codex CLI provider from the answer's CLI kind; the existing model-tiers pane suites are adapted.

### 6.6 Story E20261025ce99b720:S006

**Depends on:** `sc3`, `sc4`, `sc5`

The VS Code model-tier picker driven by models.definitions instead of its runner union and compiled config-catalog effort rows, the unknown-model check and approval prompt for the CLI families (approval offered only when the check ran the model), and the Repo Configuration panel without per-tier runner or model fields, writing role assignments under `tasks` and showing config.write's refusal reason. Tests: the picker offers exactly the options of a fake models.definitions answer and the extension bundle keeps no runner or model list (ac1); confirming an unknown CLI model shows the check results and saves only after approval (ac2); the repo panel shows only `tasks` and coreFloor (ac3); the existing model-tier-picker suite is adapted.

### 6.7 Story E20261025ce99b720:S007

**Depends on:** `sc3`, `sc4`, `sc5`

The JetBrains model-tiers settings section driven by models.definitions instead of ModelTiersModel.PROVIDERS, the unknown-model check and approval dialog for the CLI families (approval offered only when the check ran the model), and the per-repo settings without per-tier runner or model fields, writing role assignments under `tasks` and showing config.write's refusal reason. Tests: the section offers exactly the options of a fake models.definitions answer and the plugin keeps no runner or model list (ac1); applying an unknown CLI model shows the check results and saves only after approval (ac2); the per-repo settings show only `tasks` and coreFloor (ac3); the existing ModelTiersModel and settings tests are adapted.

## 7. Non-functional targets

- **Performance:** The catalog file is parsed, validated and fingerprinted once in the main thread at boot and read once more by each worker at its start; every later model question is an in-memory lookup. models.definitions touches no CLI; it asks Ollama for its installed list with the same bounded timeout providers.listModels uses today. Each operation that may run an Ollama model makes one such bounded listing call before it starts, and the TUI's review command makes one models.definitions call before each review. An approval or a settings change reaches every worker in one hub message, and process-lifetime caches are rebuilt only when the registry revision, the settings revision or the Ollama availability changes.
- **Security:** No cloud REST call is added (k1): checks run only through the installed claude and codex CLIs, and Ollama is only asked which models are installed. The approved-model store is a per-user file under the insrc home, written only by the daemon's main thread; clients reach it only through models.approve and models.reject (k2), and the TUI takes model facts only from models.definitions.
- **Observability:** A bad catalog file stops the daemon with a log naming the faulty entry (s1/ac3). Dropping an unsupported effort logs the model and effort (s3/ac2). Every tier fallback logs the tier, the requested model, the reason (unlisted, rejected, not installed, Ollama did not answer) and the default used (decision A); a tool-loop substitution logs the requested and substituted models, and a tool-loop failure names the model and whether it is not installed or Ollama is unreachable. Removing a per-repo tier override logs the repo and tier, and pruning ollamaNumCtx logs the path (s3/ac5). Each settings revision is logged with the method that advanced it; a settings read that fails to parse is logged with its error and whether the last good configuration was kept; a refused config.write is logged with the path it was asked to set and why the file could not be used. A rebuild of the TUI review command's registry logs which of the four identifying values changed. Each unknown-model check logs every CLI call and its verdict; a refused approval logs model-did-not-run with the check's error; a failed store write is logged with its cause.
- **Durability:** Approved and rejected profiles survive restarts and insrc updates because they live outside the shipped file and outside config.json; the store is replaced atomically, so a crash mid-write leaves the previous store, and a decision is acknowledged only after it is durable. When an update ships a model a user had approved, the shipped definition wins. A malformed store is reported and ignored rather than stopping the daemon. config.write never replaces a settings file it could not read or parse, and otherwise replaces it atomically, so neither a corrupt file nor a crash mid-write loses settings, and no thread or process ever reads a partial file; a settings revision is advanced only after the replace; a settings file that fails to parse never replaces a thread's last good configuration. Ollama availability is never persisted. Existing `tasks`, coreFloor, ollamaNumPredict and models.local.coreModel values are kept.

## 8. Rollout

**Phase A — extended catalog file and per-thread registry**

**Stories:** `s1`

s1 owns sc1 and sc2, which every other Story consumes; it has no dependencies.

**Backward compat:** The catalog file, its loader and its boot hook stay where they are and keep their fail-fast refusal, now running before the worker threads start. providers.listModels keeps answering the same Claude and Codex models: the file keeps today's entries (stale ids refreshed) and adds the aliases today's tier defaults use, so every tier already set to opus, sonnet, haiku or a catalogued Codex id still resolves. The Ollama models insrc ships with are listed with today's context window, and the tool-loop default is today's models.local.coreModel default, so analysis behaves as before.

**Phase B — daemon serves and runs by the definitions**

**Stories:** `s2`, `s3`

Both depend only on s1. s2 adds models.definitions (with CLI kind, both revisions, the catalog fingerprint and the daemon start id) and re-sources providers.listModels; s3 moves every daemon consumer, in every thread, onto the registry, takes Ollama availability per operation, makes config.write refuse to save over an unreadable or malformed settings file and otherwise write atomically, adds the settings revision so saved settings reach every thread, rebuilds every process-lifetime model cache on a change of either revision or of Ollama availability, retires ollamaNumCtx, applies the fallback, picks the tool-loop model from the registry and makes tiers global-only.

**Backward compat:** providers.listModels, config.write and config.reload keep their request shapes, and config.write keeps its { ok } result, adding a reason when it refuses; a saved tier now takes effect without a restart instead of after one, and config.json keeps the same content, now replaced atomically. The one behaviour change in config.write is deliberate: with an unreadable or malformed config.json a save is refused instead of silently replacing every setting with the one being saved. A tier set to a listed model or alias keeps running it; only an effort its model does not accept is dropped, with a warning. A tier set to a model that is neither listed nor approved, to an Ollama model that is listed but not installed, or to an Ollama model while Ollama does not answer, runs a tier default with a warning naming the tier, the requested model, the reason and the default (decision A), and returns to the requested Ollama model on the next operation once it is installed and Ollama answers. The tool loop keeps using models.local.coreModel when it is listed and installed. Per-repo tier overrides are removed with a warning naming repo and tier; `tasks`, coreFloor and ollamaNumPredict are kept. A user who had set ollamaNumCtx sees the prune logged; the context window is now set per model in the catalog file.

**Phase C — unknown-model check and approval**

**Stories:** `s4`

s4 depends on s2 (approved models appear in models.definitions) and must land before the client Stories that drive its check and approval requests.

**Backward compat:** Until a user approves a fallen-back Claude or Codex model, its tier keeps running the default; approving a model that ran in its check makes the tier run the requested model in every daemon thread without a restart.

**Phase D — clients render the daemon's definitions**

**Stories:** `s5`, `s6`, `s7`

Each client Story depends on s2, s3 and s4 and on nothing else from the others, so the TUI (including its review command), VS Code and JetBrains migrations can land in any order.

**Backward compat:** An older plugin keeps working against the new daemon because providers.listModels and the config write path keep their shapes and keys (including `tasks`); it simply shows its own lists until updated, and reports a refused save as a failed save. Until s5 lands, the TUI's review command keeps resolving its model as today and picks up a changed tier only when the TUI is restarted.

**Ordering rationale:** Owners land before consumers: s1 (sc1, sc2) first; then s2 (sc3) and s3 (sc5), which need only s1; then s4 (sc4), which needs sc3 to expose approved models; then the three clients, which consume sc3, sc4 and sc5. This follows the Epic's dependsOn edges exactly.

**Risky bits**

| Area | Why | Mitigation |
| :--- | :--- | :--- |
| Stale resolved models after an approval, a saved tier, an update or an Ollama change (s3, s4, s5) | Three daemon caches hold a resolved model or a model choice for the process lifetime and are reset only by test hooks (src/config/analyze.ts:234, src/docgen/extract/narrative-generator.ts:56-63, src/config/local.ts:67-90); CliProvider fixes its model at construction (src/agent/providers/cli-provider.ts:205-206); config.write today calls a no-op reload (src/daemon/chat-handler.ts:52); pulling or removing an Ollama model changes no revision; revision counters restart with the daemon while an update can change the catalog; and the TUI's review command resolves its model in its own process (src/cli/services/workflow.ts:253). | Every process-lifetime cache is keyed by the registry revision, the settings revision and the operation's Ollama availability and rebuilt when any changes, and each run builds its role router from the current values; the registry revision is published only after the store write succeeds and the settings revision only after the settings file is replaced; the TUI's review command compares the catalog fingerprint, the daemon start id and both revisions from models.definitions before each review. Tests populate each cache then change each key, run approve, worker call, tier save, worker call, flip Ollama between installed, removed, unreachable and recovered with revisions unchanged, run two reviews in one TUI process around an approval and tier save, and restart the daemon with a changed catalog under a running TUI. |
| Losing or tearing settings (s3) | config.write starts from an empty document when config.json cannot be read or parsed and writes it back in place (src/daemon/handler-runtime.ts:1284-1298), so one save over a corrupt file loses every other setting, and a thread whose read fails to parse caches the defaults (src/config/analyze.ts:335-340); with settings now re-read on every revision, a reader racing a write could also silently switch every tier to defaults. | config.write refuses to save when the existing file cannot be read or parsed, naming the problem and advancing nothing, and otherwise replaces the file atomically through the existing write-temp-then-rename seam (src/config/reconcile-io.ts:63-64); a failed parse keeps the thread's last good configuration and is logged; tests cover a corrupt file followed by an unrelated save (file unchanged, ok: false, no revision) and a worker reading while config.write writes several times in a row (never a partial file or defaults). |
| Tool-loop analysis on a machine without the expected Ollama model (s3) | Tool-calling analysis needs Ollama (src/analyze/context/driver.ts:1100-1104) and cannot fall back to a CLI; restricting it to listed models could stop analysis that runs today on an unlisted local model. | An unlisted requested model is replaced by the family's listed tool-loop default with a warning; only a model that is not installed fails, with a message naming the model so the user can pull it, and the next operation re-checks; both tool-loop entry points are tested for each case. |

## 9. Alternatives considered

### 9.1 a1: One definitions registry per model-running process and thread, extending the curated catalog in place — **CHOSEN**

Extend the curated cloud catalog file, its loader and boot hook in place into one shipped definitions file listing every selectable model of all three families with its own facts (replacing the global Ollama context-window setting), loaded into a revisioned registry in every thread and process that runs models, with user-approved CLI models in a separate daemon-owned store, every approval or settings change pushed to every thread, and Ollama availability checked per operation.

The curated catalog keeps its file, loader and boot hook and is extended into the single model-definitions file: per family its runner identity and CLI kind, and every model that may be selected, each with its aliases, accepted effort levels and input limit, plus the family's own tier defaults and summariser model, the Ollama family's tool-loop default model, and the family a fresh install defaults to. Ollama models are listed like the others; whether a listed Ollama model is installed, and whether Ollama answers at all, is asked through the bounded listing at the start of each operation that would run an Ollama model, so pulling or removing a model or stopping and restarting Ollama takes effect on the next operation; when Ollama does not answer, an Ollama tier falls back to a tier default with a warning that says so. The global ollamaNumCtx setting is retired: each Ollama call takes its context window from the model it runs; the output cap ollamaNumPredict stays a global setting. The main thread validates the file before it starts the worker threads and before it listens. Each model-running daemon thread builds the same registry from the validated file at its start; the registry carries a revision, and every saved settings change (config.write, config.reload) replaces the settings file atomically and advances a settings revision that the main thread also pushes to every worker; a settings file that fails to parse keeps the last good configuration, and a save never overwrites a settings file it could not read or parse. Every process-lifetime cache that holds a resolved model or a model choice (the analyze config, the docgen narrative provider, the local tool-loop model choice) is keyed on both revisions and on the Ollama availability seen by the operation, and rebuilt when any of them changes; the role router's cache already lives for one run, so each new run resolves afresh while a run in progress keeps what it resolved. The one model-running path outside the daemon, the TUI's review command, builds its registry from the daemon's definitions answer, which also carries each family's CLI kind, a fingerprint of the catalog contents and an id for the daemon's current start, and before each review it rebuilds when the fingerprint, the start id or either revision differs.

User-approved unknown Claude and Codex models are per-user facts, kept in a daemon-owned store under the insrc home and written atomically; the main thread publishes a new registry revision to every worker over the hub channel only after the write succeeds, and an approval is accepted only for a check in which the model actually ran without error. A tier set to a model that is neither listed nor approved runs a tier default from the definitions, with a warning, until the user approves it; the Ollama tool loop runs a listed, installed model or fails with a clear message. One read-only IPC request returns the merged view with both revisions, providers.listModels is derived from it, and the unknown-model check probes the CLIs one call at a time. Clients render the IPC answer; tiers become global-only, with the role assignments still persisted under `tasks`.

**Pros:**
- One source for every model fact: adding a model, alias, effort level or limit is a data-file edit and a daemon restart, with no code change and no user setting to keep in step; the existing catalog file, loader and boot hook stay, as the DEF decided.
- Every thread and the TUI resolve the same model, and an approval, a saved tier, a changed catalog after an update, or a change in what Ollama has installed takes effect on the next operation because every model cache follows the registry and settings revisions, the catalog fingerprint and start id, and the availability that operation saw.
- Clients reach facts only over IPC (k2), so a new model or effort level needs no VS Code or JetBrains release.
- Shipped facts (k4) and per-user approvals (k5) stay apart; an approval is never acknowledged before it is durable and never accepted for a model that did not run, and a half-written or broken settings file never replaces the last good configuration or gets overwritten by a save.

**Cons:**
- Widest migration: 30 non-test files import src/config/analyze.ts, 14 carry runner literals, and four call sites pass the global Ollama context window.
- Users who tuned ollamaNumCtx lose that knob; a different value needs a definitions-file edit.
- Each operation that may run an Ollama model asks Ollama for its installed list first (bounded by the existing listing timeout), and approvals and settings changes must reach worker threads and the TUI, adding two hub messages, a check before each TUI review and a rebuild path that tests must cover.
- A save is refused while config.json is unreadable or malformed, so the user must repair the file (the error names it) before settings can change.

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
- **[[c2]]** `step-output` `s1` — "HldContext analyze bundles (capability discovery, settings write and reload path, model caches and their lifetimes, out-of-daemon model paths, Ollama failure reporting and catalog parse timing, DEF ca"
- **[[c3]]** `code` `src/daemon/model-catalog.ts:162` — "export async function validateModelCatalog(): Promise<void> {"
- **[[c4]]** `code` `src/daemon/index.ts:381` — "await validateModelCatalog();"
- **[[c5]]** `code` `src/daemon/index.ts:377` — "missing/malformed catalog asset is a fail-fast startup refusal"
- **[[c6]]** `code` `src/daemon/index.ts:205` — "const threadServices = threadsEnabled()"
- **[[c7]]** `doc` `docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/evidence/def-cli-probes.md:40` — "So no Claude CLI run shows whether a given model supports a given level."
- **[[c8]]** `step-output` `s3` — "a1 is the only alternative that satisfies all seven constraints. a2 violates k2 and only partially meets k4 and k7; a3 violates k4 and only partially meets k5 and k7; a4 violates k2, k4 and k5."
- **[[c9]]** `code` `src/daemon/threads/main-services.ts:154` — "hubPort: port2"
- **[[c10]]** `stakeholder` `user 2026-10-25` — "go with A: a tier set to an unlisted, unapproved model falls back to the tier default from the definitions with a warning until the user approves it"
- **[[c11]]** `doc` `docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/evidence/def-cli-probes.md:20` — "For codex, a model's accepted levels must therefore come from `codex debug models`"
- **[[c12]]** `code` `src/cli/panes/model-tiers.ts:63` — "tiers[t] = resolveTier(tiering, t);"
- **[[c13]]** `code` `src/config/analyze.ts:144` — "readonly coreFloor?: TierName | undefined;"
- **[[c14]]** `code` `src/daemon/threads/method-class.ts:148` — "['providers.listModels', 'session', false],"
- **[[c15]]** `stakeholder` `user 2026-10-25` — "ollama models need to be pre-registered in the disributed config. only models specified in the config should be avaiable for selection"
- **[[c16]]** `stakeholder` `user 2026-10-25` — "remove the global settings, add per model settings"
- **[[c17]]** `stakeholder` `user 2026-10-25` — "this is a global setting and doesn't need to be moved to per model, can we leave it as is?"
- **[[c18]]** `code` `src/analyze/context/driver.ts:1100` — "function localToolLoopModel(cfg: AnalyzeConfig): string {"
- **[[c19]]** `code` `src/config/analyze.ts:404` — "if (isObject(src['tasks'])) {"
- **[[c20]]** `code` `src/daemon/handler-runtime.ts:1299` — "await reloadChatConfig();"
- **[[c21]]** `code` `src/daemon/chat-handler.ts:52` — "export async function reloadChatConfig(): Promise<number> {"
- **[[c22]]** `stakeholder` `user 2026-10-25` — "yes, go ahead"
- **[[c23]]** `code` `src/docgen/extract/narrative-generator.ts:56` — "let cachedProvider: LLMProvider | null | undefined;"
- **[[c24]]** `code` `src/config/local.ts:67` — "let cached: LocalProviderInfraConfig | undefined;"
- **[[c25]]** `code` `src/config/reconcile-io.ts:64` — "renameSync(from: string, to: string): void;"
- **[[c26]]** `code` `src/daemon/list-models.ts:44` — "available:false + models:[] means the source could not be listed right now"
- **[[c27]]** `stakeholder` `user 2026-10-25` — "yes, go with A"
- **[[c28]]** `code` `src/cli/services/workflow.ts:253` — "const { provider, resolution } = router.resolveProviderForRole('review', loadAnalyzeConfig(), repoPath);"
- **[[c29]]** `doc` `docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/DEF.md:69` — "The existing curated model catalog keeps its file (src/assets/models/cloud-model-catalog.json), its loader (validateModelCatalog, src/daemon/model-catalog.ts:162) and its boot hook (src/daemon/index.t"
- **[[c30]]** `stakeholder` `user 2026-10-25` — "go with A"
- **[[c31]]** `code` `src/daemon/handler-runtime.ts:1287` — "} catch { /* start fresh */ }"
- **[[c32]]** `code` `src/analyze/context/role-router.ts:192` — "* Construct a RoleRouter for one run. Holds a per-(role,repoPath) memo so"
