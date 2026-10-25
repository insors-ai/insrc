<!-- insrc:artifact HLD-ce99b72065d03b1b -->

# HLD: per-family-model-definitions-served-daemon

## Summary

Every fact about the model families insrc runs (Claude CLI, Codex CLI, Ollama), and every default model choice, moves into the curated catalog file shipped with insrc, extended to list every model that may be selected with its aliases, effort levels and input limit, plus each family's tier defaults, summariser model and, for Ollama, the default tool-loop model; no code or installer default for a model choice remains. When the daemon starts, its main thread checks the file, reads it together with the user's approved models and settings into one snapshot, and gives that same snapshot to every thread it runs, so every thread runs the same models; approvals, saved tiers, per-repo choices and catalog updates take effect at the next daemon restart, which every client offers right after the change. Only Ollama's installed models are checked live, at the start of each operation, and the global Ollama context-window setting is replaced by each model's own. Clients, including the terminal UI's review command and Setup, get everything from the daemon and keep no model lists or defaults of their own.

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

A model-definitions registry built from the curated cloud catalog, which keeps its file (src/assets/models/cloud-model-catalog.json), its loader (validateModelCatalog, src/daemon/model-catalog.ts:162) and its boot hook (src/daemon/index.ts:381) and is extended in place, as the DEF decided. The file holds exactly one entry for each built-in family and lists, per family, its runner identity and CLI kind and every selectable model with its aliases, accepted effort levels and input limit, plus the family's core/mid/cheap tier defaults and summariser model, the Ollama family's tool-loop default model, and the family a fresh install defaults to; it replaces the global models.shaper.ollamaNumCtx setting, while the output cap models.shaper.ollamaNumPredict stays a global setting (user decision 2026-10-25). It is the only source of default model choices: the settings catalog gains a row kind with no code default, which validation accepts and reconcile never fills, used by the tier runner and model rows and by models.local.coreModel (src/config/config-catalog.ts:113-118, :142); the local settings loader (src/config/local.ts:53) and both installers stop supplying a coreModel; so an unset tier resolves to the catalog file's tier default and an unset coreModel to its tool-loop default, while values a user or an earlier reconcile already wrote stay. Changes apply at daemon start (user decision B, 2026-10-25): at boot the main thread validates the catalog, reads the approved-model store and the settings (global and per-repo) once, and builds one immutable run snapshot before it starts the worker threads (src/daemon/index.ts:205) and before it listens; every worker it starts, including a replacement the supervisor starts later, receives that same snapshot in its start data, and the one per-repo setting read fresh from disk today (a repo's core runner/model override, which k6 removes) is no longer read at all, so every thread and code path resolves the same models for the life of the daemon. An approval, a rejection, a saved tier, a per-repo change, an updater run that changed model settings, or an updated catalog applies at the next daemon start; the daemon then reports that a restart is pending, and every client offers to apply it with the existing restart action. The one fact that changes while the daemon runs, which listed Ollama models are installed and whether Ollama answers, is taken through the bounded listing at the start of each operation that may run an Ollama model, and that operation resolves its Ollama tiers and tool-loop model against the answer. A tier set to a model that is neither listed nor approved, to a listed Ollama model that is not installed, or to an Ollama model while Ollama does not answer, runs a tier default with a warning (user decision A); the Ollama tool loop runs a listed, installed model or fails with a clear message. An approval is accepted only for a check in which the model ran without error. Settings are written by config.write, which refuses to save over a settings file it cannot read or parse and otherwise writes it atomically, and by the updater's reconcile, the one approved offline writer, which already writes atomically. One read-only IPC request serves the definitions; a second resolves a role for clients outside the daemon and returns everything needed to build either a CLI or an Ollama provider, which the TUI's review command uses instead of resolving its model from files; the TUI's Setup takes its recommended local model from the definitions and saves through config.write. Tier settings become global-only; role assignments stay persisted under `tasks` and coreFloor stays a tier name.

## 3. Architecture shape

Main thread at boot: (1) the existing loader and boot hook validate the extended catalog file, including exactly one entry for each built-in family, and refuse to start on a bad one (src/daemon/model-catalog.ts:107-162, src/daemon/index.ts:381), before the thread services start (src/daemon/index.ts:205) and before the socket listens; (2) the config reconcile step removes per-repo tier overrides and prunes the retired ollamaNumCtx setting (src/config/reconcile.ts:316); every settings-catalog row carries a default today (src/config/config-catalog.ts:33) that reconcile writes into any absent or invalid setting (src/config/reconcile.ts:379, :383), so the catalog gains a row kind with no default, which validation accepts and reconcile leaves absent (an invalid value is removed rather than replaced), and the tier runner and model rows and models.local.coreModel (src/config/config-catalog.ts:113-118, :142) use it; the local settings loader stops defaulting coreModel (src/config/local.ts:53) and both installer copies stop writing it (scripts/insrc-daemon-install.sh:324, :351, and the vscode-plugin copy); (3) the main thread reads the approved-model store and the settings, global and per-repo, once and builds the run snapshot (validated catalog, approved and rejected profiles, tier settings, per-repo `tasks` and coreFloor, local coreModel); every worker the main thread starts is handed this snapshot in its start data (read where worker-entry takes its init, src/daemon/threads/worker-entry.ts:59), including a replacement the supervisor starts after an exit (src/daemon/threads/supervisor.ts:136-139), so no thread reads the catalog, the store or config.json on its own and every thread builds an identical ModelRegistry. Per-repo `tasks` and coreFloor are already cached until restart today (src/config/analyze.ts:234); the only per-repo setting read fresh, a repo's core runner/model override (readRepoOverride, src/config/analyze.ts:444-463, used by workflow runs, src/daemon/workflow-rpc.ts:35, and code review, src/daemon/code-review-rpc.ts:194), is removed with the other per-repo tier overrides, and its fresh read goes with it. Every model-running thread: (4) the ModelRegistry built from the snapshot answers every model question: families, listed models and aliases, accepted efforts, a model's input limit, a family's tier defaults and summariser model, the Ollama tool-loop default, the runner and CLI kind of a family, and what a role resolves to for a repo; (5) every consumer asks the registry instead of DEFAULT_TIERS, TIER_EFFORTS, SUMMARISER_CLI_FALLBACK, CODEX_INPUT_BUDGET_CHARS and the global ollamaNumCtx: tier resolution (resolveTier and the role router's default fallback), shaper and summariser provider selection (including the summary worker's path, src/analyze/summariser/driver.ts:195 and :211), CliProvider's input budget, CLI kind and effort forwarding (src/agent/providers/cli-provider.ts:202-204), OllamaProvider's num_ctx (src/agent/providers/ollama.ts:444, set today at src/analyze/context/shaper-provider.ts:267, :303 and src/analyze/context/driver.ts:531, :833), and the tool-loop model choice (localToolLoopModel, src/analyze/context/driver.ts:1100-1104), where an absent coreModel now means the catalog file's tool-loop default; the output cap ollamaNumPredict is read as today; (6) Ollama availability is taken per operation: an operation that may run an Ollama model first asks Ollama for its installed list through the same bounded listing providers.listModels uses (src/daemon/list-models.ts:113), and resolves its Ollama tiers and tool-loop model against that answer; the role router already resolves per run (src/analyze/context/role-router.ts:192-196), and the docgen narrative generator, which memoises one built provider today (src/docgen/extract/narrative-generator.ts:56-63), resolves its provider per generation instead; process-lifetime caches (the analyze config, src/config/analyze.ts:234, and the local settings, src/config/local.ts:67-90) hold only snapshot facts and never a choice that depends on Ollama availability; an Ollama error inside a call (src/agent/providers/ollama.ts:375) still fails that call, and the next operation re-checks. Main thread while running: (7) config.write (src/daemon/handler-runtime.ts:1278-1299, which today starts from an empty document when config.json cannot be read or parsed and writes it in place) refuses a save when an existing config.json cannot be read or parsed (a missing file is still created), checks a tier's model against the snapshot plus the decisions recorded since boot, and replaces the file atomically through the write-temp-then-rename seam the reconcile path already uses (src/config/reconcile-io.ts:63-64); a successful save marks a restart pending; (8) the approved-model store and the unknown-model check service, which probes the installed CLIs one call at a time, accepts an approval only for a check whose model ran without error, writes the store atomically, acknowledges the decision only after it is durable, records it for later tier saves and marks a restart pending; (9) models.resolveRole resolves a role's model for a repo from the running snapshot and the current Ollama availability, for callers outside the daemon, and returns what either provider needs: the CLI kind for a CLI family, or the Ollama host, the model's context window and the ollamaNumPredict cap for Ollama. The updater: (10) the updater's reconcile (runUpdateReconcile, src/cli/services/maintenance.ts:157, :187, through reconcileConfigFile, src/config/reconcile-io.ts:63-64) is the one other settings writer, an approved offline exception that already writes atomically and may run while the daemon keeps running; it applies the same reconcile rules, and when it changed a model-affecting setting the updater's own restart prompt says so and, since the running daemon only reads settings at start, the change applies at the next restart. Outside the daemon, in the TUI process: (11) the review command (src/cli/services/workflow.ts:248-253) asks models.resolveRole for its review model instead of reading config.json and resolving it itself, and builds a CliProvider or an OllamaProvider from the answer; (12) the Setup pane and setup command (src/cli/panes/SetupPane.tsx:29-34, src/cli/command.ts:348-353, src/cli/services/setup.ts) take the local model they recommend and pull from the definitions' Ollama tool-loop default instead of the hard-coded DEFAULT_LOCAL_MODEL (src/shared/model-recommender.ts:22), keep the hardware detection, and save through config.write instead of writing config.json themselves (src/cli/services/setup.ts:40, :57); when the daemon cannot be reached, Setup recommends nothing and asks the user to start the daemon. IPC: models.definitions returns the running view with each family's CLI kind and rejected model ids, each Ollama model's installed state and whether a restart is pending; providers.listModels keeps its shape but is drawn from the registry; models.check / models.approve / models.reject drive the unknown-model flow; models.resolveRole serves the TUI review; each new method is classified in src/daemon/threads/method-class.ts. Clients: the TUI model-tiers pane, the VS Code model-tier picker and repo panel, and the JetBrains model-tiers and per-repo sections render models.definitions, call the check/approve requests and, after a save or an approval, offer to apply it with their existing daemon restart action (the TUI's maintenance.restart, src/cli/services/maintenance.ts:284; VS Code's insrc.daemon.restart, vscode-plugin/src/daemon/commands.ts:26); none keeps a runner, model or effort list. Installer: both copies of the install script take the chosen family's tier defaults from the catalog file and write no coreModel.

## 4. Diagrams

- [ER model](docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/er-model.html)

## 5. Shared contracts

### 5.1 sc1: ModelDefinitionsFile (the curated catalog file, extended)

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`

**Purpose:** The shipped, versioned data format of src/assets/models/cloud-model-catalog.json, extended in place to hold exactly one entry for each built-in family and to list every selectable model with its facts (k4): aliases, accepted efforts and input limit, plus each family's tier defaults and summariser model and the Ollama tool-loop default. It is the only source of default model choices: it replaces the global ollamaNumCtx setting, the settings catalog's code defaults for tier runners, tier models and the local coreModel, and the coreModel defaults in the local settings loader and the installers. Ollama models must be listed to be selectable. Validated by the existing loader and boot hook before the daemon starts its workers or listens (k7); a change to it applies at the next daemon start (s1/ac2).

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
  readonly toolLoopModel?: string | undefined;        // ollama only, required: id of one of its listed models; the default local model
}
interface ModelDefinitionsFile { // extends today's CloudModelCatalogFile (src/daemon/model-catalog.ts:48)
  readonly version: number;
  readonly defaultFamily: 'cli-claude' | 'cli-codex'; // the family a fresh install, an unset tier and every tier fallback use
  readonly families: readonly FamilyDefinition[];     // exactly one per FamilyId: none missing, none repeated
}
```

**Assumptions cited:** [[c5]]

### 5.2 sc2: Persisted inputs, run snapshot and ModelRegistry (fixed for the life of the daemon)

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`, `s5`, `s6`, `s7`

**Purpose:** The only in-process source of model facts, together with the persisted shapes it is built from. s1 owns the shapes and their readers: the approved-model store's profiles and the settings' model section (global tiers, per-repo `tasks` and coreFloor, local coreModel), read and validated by the main thread once at boot (a malformed store is reported and treated as empty). The main thread builds one immutable run snapshot from the validated sc1 file and those inputs and hands it to every worker it starts through the worker's start data, including a replacement the supervisor starts later, so every thread builds an identical registry and resolves the same models until the next daemon start; no thread or code path reads those files on its own. s3 owns how settings are written and reconciled and s4 how profiles are decided; both write the shapes defined here. Ollama availability is not part of the snapshot: it is passed in per operation, so Ollama tier and tool-loop resolution follow what is installed now. The registry resolves aliases and applies user decision A to tiers (an unlisted or rejected model, a listed Ollama model that is not installed, or an Ollama model while Ollama does not answer, runs the tier default), and chooses the tool-loop model: the requested Ollama model (cheap tier's, else a set models.local.coreModel) when listed, else the Ollama family's tool-loop default, and only when installed.

**Interface sketch (type-level):**

```
// --- persisted shapes (owned here, written by s3 / s4) ---
interface ApprovedProfile { // one entry of the per-user approved-model store
  readonly family: 'cli-claude' | 'cli-codex';
  readonly modelId: string;
  readonly status: 'approved' | 'rejected';
  readonly efforts: readonly EffortLevel[];  // approved: only checked AND approved levels (s4/ac3)
  readonly inputLimit?: InputLimit | undefined;
  readonly decidedAt: string;               // ISO time
  readonly cliVersion: string;
}
interface GlobalTierSetting { readonly runner: FamilyId; readonly model: string; readonly effort?: EffortLevel | undefined; } // model: id or alias
interface PersistedModels { // config.json `models`
  readonly tiers?: Partial<Record<TierName, GlobalTierSetting>> | undefined; // no code default: unset = catalog file's tier default
  readonly tasks?: Readonly<Record<string, TierName>> | undefined;          // role -> tier (parsed internally as roleTiers)
  readonly coreFloor?: TierName | undefined;
  readonly byRepo?: Readonly<Record<string, PersistedRepoModels>> | undefined;
  readonly local?: { readonly coreModel?: string | undefined } | undefined;  // no code default: unset = catalog file's tool-loop default
  // kept: shaper.ollamaNumPredict (global output cap); retired, pruned by reconcile: shaper.ollamaNumCtx
}
interface PersistedRepoModels { // models.byRepo[repo]
  readonly tasks?: Readonly<Record<string, TierName>> | undefined;
  readonly coreFloor?: TierName | undefined;
  // no `tiers`: a stale models.byRepo[repo].tiers entry is removed by reconcile
}
// --- snapshot and registry ---
interface ResolvedModel extends ModelDefinition {
  readonly family: FamilyId;
  readonly source: 'shipped' | 'user-approved';
}
interface RunSnapshot { // built once by the main thread at boot; carried in every worker's start data
  readonly catalog: ModelDefinitionsFile;            // validated
  readonly profiles: readonly ApprovedProfile[];     // approved and rejected, as stored at boot
  readonly settings: PersistedModels;                // after reconcile, global and per-repo
}
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
interface ModelRegistry { // built from a RunSnapshot; immutable
  families(): readonly FamilyDefinition[];
  defaultFamily(): 'cli-claude' | 'cli-codex';
  models(family: FamilyId): readonly ResolvedModel[];             // listed + approved at boot
  rejected(family: 'cli-claude' | 'cli-codex'): readonly string[]; // rejected at boot
  find(family: FamilyId, idOrAlias: string): ResolvedModel | undefined;
  acceptsEffort(family: FamilyId, idOrAlias: string, effort: EffortLevel): boolean;
  inputLimit(family: FamilyId, idOrAlias: string): InputLimit | undefined;
  tierDefault(family: FamilyId, tier: TierName): TierDefault | undefined; // undefined for ollama
  summariserModel(family: 'cli-claude' | 'cli-codex'): ResolvedModel;
  cliKind(family: FamilyId): 'claude' | 'codex' | undefined;
  tierForRole(role: string, repoPath: string): TierName;                          // snapshot's per-repo `tasks` and coreFloor
  resolveTier(tier: TierName, ollama: OllamaAvailability): TierResolution;       // snapshot's global tier settings
  resolveToolLoopModel(ollama: OllamaAvailability): ToolLoopResolution;          // requested = cheap Ollama tier, else set coreModel, else catalog default
}
```

**Assumptions cited:** [[c5]] [[c12]]

### 5.3 sc3: models.definitions IPC request

**Owner Story:** `s2`
**Consumed by:** `s4`, `s5`, `s6`, `s7`

**Purpose:** The one read-only daemon request every client uses to learn the running definitions: families with their CLI kind and rejected model ids, listed and approved models with aliases, per-model efforts and limits, each family's tier defaults and summariser model, the Ollama tool-loop default, the default family, which listed Ollama models are installed, and whether a saved change is waiting for a daemon restart (k2). Carries user-approved models marked as such (s4/ac5). providers.listModels is drawn from the same registry and agrees with it (s2/ac2). The TUI's Setup takes its recommended local model from it.

**Interface sketch (type-level):**

```
// request: 'models.definitions'  params: {}
interface ModelDefinitionsResult {
  readonly version: number;
  readonly defaultFamily: 'cli-claude' | 'cli-codex';
  readonly pendingRestart: boolean;     // a save, decision or updater change since this daemon started applies only after a restart
  readonly families: readonly {
    readonly id: FamilyId;
    readonly cliKind?: 'claude' | 'codex' | undefined; // present for the CLI families
    readonly displayName: string;
    readonly tierDefaults?: Readonly<Record<TierName, TierDefault>> | undefined;
    readonly summariserModel?: string | undefined;
    readonly toolLoopModel?: string | undefined;     // ollama only
    readonly rejectedModels?: readonly string[] | undefined; // CLI families: ids rejected as of this daemon's start
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

**Purpose:** The daemon flow that checks a Claude or Codex model not in the definitions through its CLI, one call at a time (k1, k3), returns per-effort evidence, and records the user's decision as an ApprovedProfile (sc2) in the per-user store (k5), outside the shipped file and config.json (k4). Ollama has no such flow: only listed Ollama models are selectable. An approval is accepted only for a check with runs = true and no error: a reachable CLI that refuses the model (Codex 'unsupported', Claude 'may not exist or not be accessible') or a check that could not reach the CLI is refused as model-did-not-run, whatever efforts are passed, including none. The store is written atomically and a decision is acknowledged only after it is durable; it is recorded at once so a tier can be saved to an approved model, and it applies to running models at the next daemon start, which the result says.

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
type DecisionResult =
  | { readonly ok: true; readonly restartRequired: true }   // durable; applies at the next daemon start
  | { readonly ok: false; readonly reason: 'unknown-check' | 'model-did-not-run' | 'write-failed' | 'invalid-efforts'; readonly detail: string };
// request: 'models.approve' params: { checkId: string; efforts: EffortLevel[] } -> DecisionResult  (writes an ApprovedProfile, sc2)
//   refused with 'model-did-not-run' unless the check has runs = true and no error (any efforts, including [])
// request: 'models.reject'  params: { checkId: string }                         -> DecisionResult
```

**Assumptions cited:** [[c11]]

### 5.5 sc5: Settings writes and reconcile rules, and role resolution for clients

**Owner Story:** `s3`
**Consumed by:** `s5`, `s6`, `s7`

**Purpose:** How the PersistedModels shape (sc2) is written and reconciled after k6. Tier runner, model and effort exist only globally and, like the local coreModel, have no code default: their settings-catalog rows are of a new kind that validation accepts without a default and reconcile never fills (an invalid value is removed rather than replaced). The daemon ignores and removes per-repo tier overrides (s3/ac5), keeps every existing `tasks`, coreFloor and explicitly written value, and prunes the retired ollamaNumCtx; ollamaNumPredict stays. config.write is the settings writer for clients, the TUI's Setup included: it refuses a save when an existing config.json cannot be read or parsed (no write, an error naming the problem), refuses a tier set to a rejected model (s4/ac4), otherwise replaces the file atomically (a missing file is created) and reports that the change applies at the next daemon start. The updater's reconcile is the one other, approved offline writer: it applies the same rules, writes atomically, and its restart prompt says when it changed a model-affecting setting. models.resolveRole lets a client outside the daemon run a role on the model the daemon would use, resolved from the running snapshot and the current Ollama availability, with everything needed to build a CLI or an Ollama provider.

**Interface sketch (type-level):**

```
// settings-catalog row (extends ConfigOption, src/config/config-catalog.ts:33)
type ConfigRowDefault =
  | { readonly kind: 'value'; readonly default: unknown }   // today's rows: reconcile fills / repairs with it
  | { readonly kind: 'none' };                             // new: never filled; an invalid value is removed
// used with kind 'none': models.tiers.{core,mid,cheap}.{runner,model}, models.local.coreModel
// config.write result (request shape unchanged)
type ConfigWriteResult =
  | { readonly ok: true; readonly restartRequired?: boolean | undefined } // true when the saved path affects which models run
  | { readonly ok: false; readonly reason?: 'settings-unreadable' | 'settings-malformed' | 'invalid-path' | 'rejected-model' | undefined; readonly detail?: string | undefined };
// updater reconcile summary gains:  modelSettingsChanged: boolean  (drives its restart prompt)
// request: 'models.resolveRole' params: { role: string; repoPath: string }
interface RoleResolution {
  readonly tier: TierName;
  readonly family: FamilyId;
  readonly model: string;                  // canonical id actually run
  readonly effort?: EffortLevel | undefined;
  readonly inputLimit?: InputLimit | undefined;
  readonly fallback?: { readonly reason: FallbackReason; readonly requested: string } | undefined;
  readonly cli?: { readonly kind: 'claude' | 'codex' } | undefined;                       // CLI families
  readonly ollama?: { readonly host: string; readonly numCtx: number; readonly numPredict: number } | undefined; // ollama: daemon's host, the model's context window, the global output cap
}
```

**Assumptions cited:** [[c12]]

## 6. Story boundaries

### 6.1 Story E20261025ce99b720:S001

**Owns:** `sc1`, `sc2`

Extending the curated catalog in place: the file src/assets/models/cloud-model-catalog.json, its types (CloudModelCatalogFile, src/daemon/model-catalog.ts:48) and its validator (validateShape, src/daemon/model-catalog.ts:107, called by validateModelCatalog at src/daemon/model-catalog.ts:162 from the boot hook at src/daemon/index.ts:381) are extended rather than replaced. The file contents are refreshed with current ids such as the Claude haiku the CLI resolves today, the CLI aliases the tier defaults use, and the Ollama models insrc ships with, each with its context window taken from today's default, and the Ollama tool-loop default set to today's DEFAULT_LOCAL_MODEL and coreModel default. The validator refuses a missing file, malformed JSON, an unknown family, a missing built-in family, a family listed twice, a CLI family without its CLI kind, a family without a models list or a model without an efforts list (an empty list is allowed), a duplicate id or alias in a family, a tier default or summariser model that is not an id or alias of its family, an Ollama model without a token input limit, an Ollama tool-loop default that is not one of its listed models, and a defaultFamily without tier defaults; each failure names the entry. Also owns the persisted shapes (ApprovedProfile, PersistedModels) and their boot readers: the main thread reads and validates the approved-model store (a malformed store is reported and treated as empty) and the reconciled settings, global and per-repo, once at boot, and builds the run snapshot before the thread services start and before the socket listens; the snapshot travels in every worker's start data, so a worker started at boot and a replacement the supervisor starts later both build their registry from it. Both installer copies take the chosen family's tier defaults from the file. Tests: a validator suite with one fixture per refusal reason, including a file without Ollama, one without the non-default CLI family and one with a family listed twice (ac3); a data-only addition test that adds a model and alias to a fixture and, after a restart, reads them back through the registry with no code change (ac2); a boot-order test that the file is validated and the snapshot built before thread services start and before listen (ac1, k7); a worker started at boot and a replacement worker started after config.json and the store were changed on disk both build a registry equal to the main thread's; a malformed store is reported and ignored without stopping the daemon; resolveTier distinguishes a rejected model (rejected-model) from an unchecked unlisted one (unlisted-model), and on an Ollama tier distinguishes Ollama unreachable (ollama-unreachable), a successful empty listing (not-installed) and a listing that includes the model (no fallback); resolveToolLoopModel with no coreModel set runs the catalog file's tool-loop default; the existing model-catalog and model-catalog-asset suites keep passing, adapted to the new fields.

### 6.2 Story E20261025ce99b720:S002

**Owns:** `sc3`
**Depends on:** `sc1`, `sc2`

The handler for models.definitions, the projection of the main thread's registry into the result (each family's CLI kind and rejected model ids, each listed Ollama model's installed state from Ollama's live listing), the pendingRestart flag, its entry in src/daemon/threads/method-class.ts, and re-sourcing providers.listModels from the registry so the two answers agree; for Ollama, providers.listModels returns only listed models. Tests: models.definitions returns every family with its CLI kind and rejected ids, model, alias, effort list, limit, tier default, summariser model and the tool-loop default of a fixture file, with pendingRestart false on a fresh start (ac1); providers.listModels and models.definitions agree for every family, and an installed but unlisted Ollama model appears in neither (ac2); the method-class coverage test passes; the existing list-models suite is adapted.

### 6.3 Story E20261025ce99b720:S003

**Owns:** `sc5`
**Depends on:** `sc1`, `sc2`

Moving every daemon consumer, in the main thread and the workers, onto the registry built from the run snapshot: resolveTier and the role router's default fallback, the summariser selection including the summary worker's path, the effort list (TIER_EFFORTS and the config catalog's effort rows), CliProvider's input budget, CLI kind and effort forwarding, OllamaProvider's num_ctx, both tool-loop entry points' model choice (localToolLoopModel), and the runner/CLI-kind literals in routing, provider construction, attribution and workflow code. Workers stop reading config.json and the catalog themselves and use the snapshot they are given; readRepoOverride and its callers in workflow runs and code review go away with the per-repo tier overrides. Adds the settings-catalog row kind without a default and its validation and reconcile handling (never filled; an invalid value removed rather than replaced), and moves the tier runner and model rows and models.local.coreModel to it; removes the coreModel default from the local settings loader and from both installer copies; values already written stay. Taking Ollama availability per operation: every daemon operation that may run an Ollama model asks the bounded listing first and resolves its tiers and tool-loop model against that answer; the docgen narrative generator resolves its provider per generation instead of memoising one; process-lifetime caches keep only snapshot facts. Owns safe settings writes: config.write, when an existing config.json cannot be read or parsed, refuses with settings-unreadable or settings-malformed and an error naming the file, writing nothing (a missing file is created as today); it refuses a tier set to a model whose profile is rejected, accepts a tier set to a listed model or to one approved since boot, replaces the file atomically through the existing write-temp-then-rename seam, reports restartRequired for paths that affect which models run, and marks a restart pending. Owns the updater-reconcile rules: the updater applies the same reconcile, reports modelSettingsChanged, and its restart prompt says so. Owns models.resolveRole, which returns the CLI kind for a CLI family and the Ollama host, the model's context window and the ollamaNumPredict cap for Ollama, and its method-class entry. Applies decision A to tiers, logging the tier, the requested model, the reason (including that Ollama did not answer) and the default used; for the tool loop, substitutes the Ollama family's tool-loop default for an unlisted requested model with a warning, and fails the tool-loop analysis with a message naming the model and saying it is not installed (or that Ollama is unreachable) instead of falling back to a CLI. Also the reconcile rules at boot: keep `tasks` and coreFloor, remove per-repo tier overrides with a warning naming repo and tier, and prune shaper.ollamaNumCtx with its config-catalog row; ollamaNumPredict is read as today. Tests: a settings-catalog row of the new kind passes validation and is never written by reconcile when absent, and an invalid value in it is removed rather than replaced; a fresh config reconciled against a fixture whose defaultFamily and tier defaults differ from today's runs the fixture's defaults with no tier written into config.json (ac1); with no coreModel set, a fixture whose tool-loop default was changed while the old default stays listed runs the new default, and an explicitly set coreModel still runs; an unset tier resolves to the family's tier default (ac1); an unsupported effort is not passed and a warning names model and effort (ac2); a source scan fails on runner or model literals outside the family implementations, on any remaining read of ollamaNumCtx, on any remaining code or installer default for a tier runner, tier model or coreModel, and on any worker read of config.json or the catalog (ac3); a repo's `tasks` choice applies while the tier's model comes from global settings (ac4); reconcile removes per-repo tier overrides, warns with repo and tier, keeps `tasks` and coreFloor, and prunes ollamaNumCtx (ac5); an unlisted model and a not-installed Ollama model fall back with the warning (decision A); an Ollama tier falls back with the ollama-unreachable warning when the listing fails, times out or is malformed, and with not-installed when Ollama answers with an empty list; within one daemon run an Ollama tier moves from its model to the fallback when the model is removed or Ollama stops, and back when the model is pulled again or Ollama restarts, on the next operation, for the role router, the summariser, docgen and both tool-loop entry points; the tool loop substitutes the default for an unlisted requested model and fails with the stated message when the model is not installed or Ollama is unreachable; changing a fixture Ollama model's input limit changes the num_ctx its provider is built with; a config.write of a tier leaves running models unchanged, reports restartRequired, sets pendingRestart, and after a daemon restart every thread runs the newly saved model; with config.json made unparsable, a config.write of an unrelated setting returns ok: false with settings-malformed and leaves the file byte-for-byte unchanged, an unreadable file returns settings-unreadable the same way, and a missing file is created; a tier set to a rejected model is refused with rejected-model; a reader of config.json while config.write writes several times in a row never sees a partial file; an updater reconcile that changes a model setting reports modelSettingsChanged and leaves running models unchanged until a restart; models.resolveRole returns the same model, effort, fallback and CLI kind or Ollama settings the daemon's own role resolution uses for the same role and repo, for a CLI tier and for a listed, installed Ollama tier; the summariser in a worker resolves the same model as in the main thread; the existing analyze-tiering, tier-defaults, core-floor, config-catalog and reconcile suites are adapted.

### 6.4 Story E20261025ce99b720:S004

**Owns:** `sc4`
**Depends on:** `sc1`, `sc2`, `sc3`

The per-family check procedures for the two CLI families (Codex: model list from the CLI plus a run; Claude: a run, input limit from the JSON output, recognised effort names), their serial execution, the classification of a reachable CLI that refuses the model (runs = false with the CLI's message as error) apart from an unreachable CLI, the approval gate that refuses models.approve with model-did-not-run unless the check has runs = true and no error, writing ApprovedProfile entries (sc2) to the store under the insrc home with atomic write by temporary file and rename, recording each durable decision in the main thread for later tier saves, marking a restart pending, and the method-class entries for models.check, models.approve and models.reject. Tests: per-family checks against fake CLIs record each verdict and run one call at a time (ac1); results list each claimed level with evidence and nothing is usable before approval (ac2); an approved profile, after a daemon restart, admits only the passed and approved levels (ac3); a rejected profile or an unreachable CLI refuses the model with a reason (ac4); a check where a fake CLI refuses the model returns runs = false with its message, and approving it is refused with model-did-not-run both with claimed efforts and with efforts = [], storing nothing (ac4); an approval returns restartRequired, sets pendingRestart, lets a tier be saved to the model at once, and after a restart the model appears in models.definitions marked user-approved and a rejected one appears in the family's rejected ids (ac5); a failed store write returns write-failed and leaves the previous store intact after a restart; the method-class coverage test passes.

### 6.5 Story E20261025ce99b720:S005

**Depends on:** `sc2`, `sc3`, `sc4`, `sc5`

The TUI model-tiers pane and its effort cycle driven by models.definitions (Ollama models offered only when listed, marked when not installed), the unknown-model check and approval screen for the CLI families (approval offered only when the check ran the model), the repo settings view limited to `tasks` and coreFloor (showing config.write's refusal reason), the offer to apply a saved change or decision with the existing maintenance.restart (src/cli/services/maintenance.ts:284) whenever restartRequired or pendingRestart is set, the TUI's review command (src/cli/services/workflow.ts:248-253), which asks models.resolveRole for its review model before each review and builds a CliProvider or an OllamaProvider from the answer instead of reading config.json and resolving the model itself, and the TUI's Setup pane and setup command (src/cli/panes/SetupPane.tsx:29-34, src/cli/command.ts:348-353, src/cli/services/setup.ts), which keep their hardware detection, take the local model they recommend and pull from the definitions' Ollama tool-loop default instead of DEFAULT_LOCAL_MODEL (src/shared/model-recommender.ts:22, retired), and save through config.write instead of reading and writing config.json themselves; when the daemon cannot be reached, Setup recommends nothing and asks the user to start the daemon. Tests: the pane offers exactly the families, models and effort levels of a fake models.definitions answer and holds no list of its own (ac1); saving an unknown CLI model starts the check and shows its results for approval (ac2); the repo view edits only `tasks` and coreFloor (ac3); after a save or an approval the pane offers the restart, and accepting it calls maintenance.restart; the review command runs on the model, effort and provider a fake models.resolveRole returns, for a Claude, a Codex and a listed, installed Ollama tier and for a fallback answer, and reads no config.json; Setup recommends and pulls the tool-loop default of a fake answer, saves through config.write and, with a malformed config.json, reports the refusal and leaves the file unchanged; with the daemon unreachable Setup shows the start-the-daemon message and writes nothing; the existing model-tiers pane and setup suites are adapted.

### 6.6 Story E20261025ce99b720:S006

**Depends on:** `sc2`, `sc3`, `sc4`, `sc5`

The VS Code model-tier picker driven by models.definitions instead of its runner union and compiled config-catalog effort rows, the unknown-model check and approval prompt for the CLI families (approval offered only when the check ran the model), the Repo Configuration panel without per-tier runner or model fields, writing role assignments under `tasks` and showing config.write's refusal reason, and the offer to apply a saved change or decision with the existing insrc.daemon.restart command (vscode-plugin/src/daemon/commands.ts:26). Tests: the picker offers exactly the options of a fake models.definitions answer and the extension bundle keeps no runner or model list (ac1); confirming an unknown CLI model shows the check results and saves only after approval (ac2); the repo panel shows only `tasks` and coreFloor (ac3); after a save or an approval the restart is offered and runs insrc.daemon.restart when accepted; the existing model-tier-picker suite is adapted.

### 6.7 Story E20261025ce99b720:S007

**Depends on:** `sc2`, `sc3`, `sc4`, `sc5`

The JetBrains model-tiers settings section driven by models.definitions instead of ModelTiersModel.PROVIDERS, the unknown-model check and approval dialog for the CLI families (approval offered only when the check ran the model), the per-repo settings without per-tier runner or model fields, writing role assignments under `tasks` and showing config.write's refusal reason, and the offer to apply a saved change or decision with the plugin's existing daemon restart action. Tests: the section offers exactly the options of a fake models.definitions answer and the plugin keeps no runner or model list (ac1); applying an unknown CLI model shows the check results and saves only after approval (ac2); the per-repo settings show only `tasks` and coreFloor (ac3); after a save or an approval the restart is offered and runs the restart action when accepted; the existing ModelTiersModel and settings tests are adapted.

## 7. Non-functional targets

- **Performance:** The catalog file is parsed and validated once at boot and the run snapshot built once; workers receive it in their start data instead of reading files; every later model question, per-repo ones included, is an in-memory lookup. models.definitions touches no CLI; it asks Ollama for its installed list with the same bounded timeout providers.listModels uses today. Each operation that may run an Ollama model makes one such bounded listing call before it starts; models.resolveRole makes at most one. Nothing is propagated between threads while the daemon runs.
- **Security:** No cloud REST call is added (k1): checks run only through the installed claude and codex CLIs, and Ollama is only asked which models are installed. The approved-model store is a per-user file under the insrc home, written only by the daemon's main thread; clients reach it only through models.approve and models.reject (k2). The TUI takes model facts only from models.definitions and models.resolveRole and writes settings only through config.write.
- **Observability:** A bad catalog file stops the daemon with a log naming the faulty entry, including a missing or repeated family (s1/ac3). Dropping an unsupported effort logs the model and effort (s3/ac2). Every tier fallback logs the tier, the requested model, the reason (unlisted, rejected, not installed, Ollama did not answer) and the default used (decision A); a tool-loop substitution logs the requested and substituted models, and a tool-loop failure names the model and whether it is not installed or Ollama is unreachable. Removing a per-repo tier override logs the repo and tier, pruning ollamaNumCtx logs the path, and removing an invalid value from a no-default row logs the path (s3/ac5). A refused config.write is logged with the path it was asked to set and why; each save, decision or updater reconcile that changes which models will run is logged with what will change at the restart. A malformed approved-model store is logged and treated as empty. Each unknown-model check logs every CLI call and its verdict; a refused approval logs model-did-not-run with the check's error; a failed store write is logged with its cause.
- **Durability:** Approved and rejected profiles survive restarts and insrc updates because they live outside the shipped file and outside config.json; the store is replaced atomically, so a crash mid-write leaves the previous store, and a decision is acknowledged only after it is durable. When an update ships a model a user had approved, the shipped definition wins at the next start. A malformed store is reported and treated as empty rather than stopping the daemon. config.write never replaces a settings file it could not read or parse and otherwise replaces it atomically, and the updater's reconcile, the only other writer, already writes atomically, so neither a corrupt file nor a crash mid-write loses settings and no reader sees a partial file. The running snapshot never changes underneath a running operation; Ollama availability is never persisted. Existing `tasks`, coreFloor, ollamaNumPredict and every tier or coreModel value a user or an earlier reconcile wrote are kept.

## 8. Rollout

**Phase A — extended catalog file and boot snapshot**

**Stories:** `s1`

s1 owns sc1 and sc2 (the catalog file format, the persisted settings and approved-model shapes, the boot readers and the run snapshot), which every other Story consumes; it has no dependencies.

**Backward compat:** The catalog file, its loader and its boot hook stay where they are and keep their fail-fast refusal, now running before the worker threads start and also refusing a file that lacks a built-in family or lists one twice; the shipped file lists all three families. providers.listModels keeps answering the same Claude and Codex models: the file keeps today's entries (stale ids refreshed) and adds the aliases today's tier defaults use, so every tier already set to opus, sonnet, haiku or a catalogued Codex id still resolves. The Ollama models insrc ships with are listed with today's context window, and the tool-loop default is today's DEFAULT_LOCAL_MODEL and coreModel default (qwen3.6:27b), so analysis and Setup behave as before. Global settings and per-repo `tasks` and coreFloor already apply at daemon start today (src/config/analyze.ts:234).

**Phase B — daemon serves and runs by the definitions**

**Stories:** `s2`, `s3`

Both depend only on s1. s2 adds models.definitions and re-sources providers.listModels; s3 moves every daemon consumer, in every thread, onto the snapshot registry, adds the settings-catalog row kind without a default and moves the tier runner and model rows and models.local.coreModel to it, removes the coreModel default from the local settings loader and both installers, removes the fresh per-repo core override read with the per-repo tier overrides, takes Ollama availability per operation, makes config.write refuse to save over an unreadable or malformed settings file and otherwise write atomically, makes the updater's reconcile report model-setting changes, adds models.resolveRole, retires ollamaNumCtx, applies the fallback, picks the tool-loop model from the registry and makes tiers global-only.

**Backward compat:** providers.listModels, config.write and config.reload keep their request shapes, and config.write keeps its { ok } result, adding restartRequired and a refusal reason. A saved global tier and a repo's `tasks` or coreFloor apply at the next daemon start, as today. Two behaviour changes are deliberate: a repo's core runner/model override, which today is read fresh by the next workflow run or code review (src/config/analyze.ts:444-463), is removed with the other per-repo tier overrides (k6), with a warning naming repo and tier; and with an unreadable or malformed config.json a save is refused instead of silently replacing every setting with the one being saved. Tier and coreModel values that reconcile, the installer or a user already wrote into config.json stay as explicit settings, so what runs does not change; only a fresh or unset tier now follows the catalog file's tier default and an unset coreModel its tool-loop default, and reconcile no longer fills those rows. A tier set to a listed model or alias keeps running it; only an effort its model does not accept is dropped, with a warning. A tier set to a model that is neither listed nor approved, to an Ollama model that is listed but not installed, or to an Ollama model while Ollama does not answer, runs a tier default with a warning naming the tier, the requested model, the reason and the default (decision A), and returns to the requested Ollama model on the next operation once it is installed and Ollama answers. The tool loop keeps using models.local.coreModel when it is set, listed and installed. `tasks`, coreFloor and ollamaNumPredict are kept. A user who had set ollamaNumCtx sees the prune logged; the context window is now set per model in the catalog file. The updater's reconcile keeps writing atomically and, when it changes a model setting, its restart prompt says so.

**Phase C — unknown-model check and approval**

**Stories:** `s4`

s4 depends on s2 (approved and rejected models appear in models.definitions) and must land before the client Stories that drive its check and approval requests.

**Backward compat:** Until a user approves a fallen-back Claude or Codex model, its tier keeps running the default; after the approval and a daemon restart the tier runs the requested model in every thread.

**Phase D — clients render the daemon's definitions**

**Stories:** `s5`, `s6`, `s7`

Each client Story depends on s2, s3 and s4 and on nothing else from the others, so the TUI (including its review command and Setup), VS Code and JetBrains migrations can land in any order.

**Backward compat:** An older plugin keeps working against the new daemon because providers.listModels and the config write path keep their shapes and keys (including `tasks`); it simply shows its own lists until updated, ignores restartRequired, and reports a refused save as a failed save. Until s5 lands, the TUI's review command keeps resolving its model from config.json as today and Setup keeps its hard-coded recommendation and direct write. After s5, Setup needs a running daemon and says so when it cannot reach one.

**Ordering rationale:** Owners land before consumers: s1 (sc1, sc2) first; then s2 (sc3) and s3 (sc5), which need only s1; then s4 (sc4), which needs sc3 to expose approved and rejected models; then the three clients, which consume sc3, sc4 and sc5. This follows the Epic's dependsOn edges exactly.

**Risky bits**

| Area | Why | Mitigation |
| :--- | :--- | :--- |
| A thread or code path running different models from the others (s1, s3) | Today each worker reads config.json through loadAnalyzeConfig on its own (src/config/analyze.ts:234), workflow runs and code review read a repo's core runner/model override fresh from disk (src/config/analyze.ts:444-463), the supervisor starts replacement workers after boot (src/daemon/threads/supervisor.ts:136-139), and the TUI's review command reads config.json itself (src/cli/services/workflow.ts:253), so a change on disk could make one path run different models from the rest. | Only the main thread reads the catalog, the store and the settings, once at boot; every worker, including a replacement, receives the snapshot in its start data (src/daemon/threads/worker-entry.ts:59); the fresh per-repo override read goes away with the per-repo tier overrides; the TUI review asks models.resolveRole; a source scan fails on any other read of config.json or the catalog; tests start a replacement worker after changing the files on disk and check its registry equals the main thread's. |
| Code defaults overriding the catalog file (s3) | Every settings-catalog row carries a default (src/config/config-catalog.ts:33) that reconcile writes into any absent or invalid setting (src/config/reconcile.ts:379, :383), the tier rows default to cli-claude/sonnet/haiku (src/config/config-catalog.ts:113-118), and the coreModel default qwen3.6:27b is set in the settings catalog (:142), the local settings loader (src/config/local.ts:53) and both installers (scripts/insrc-daemon-install.sh:324, :351); merely dropping a value would not stop reconcile, and any of these would silently override the catalog file's defaults and defeat k4. | A settings-catalog row kind with no default, which validation accepts and reconcile never fills (an invalid value is removed rather than replaced), is used for the tier runner and model rows and models.local.coreModel; the loader and installers stop supplying coreModel; values already written stay explicit, matching what runs today; tests reconcile a fresh config against a fixture with a different defaultFamily and tier defaults, and change the fixture's tool-loop default while the old one stays listed, and check the fixture's defaults run and nothing is written; the source scan fails on any remaining code or installer default for a tier runner, tier model or coreModel. |
| Losing or tearing settings, and Ollama changing while the daemon runs (s3, s5) | config.write (src/daemon/handler-runtime.ts:1284-1298) and the TUI's Setup (src/cli/services/setup.ts:40, :57) start from an empty document when config.json cannot be read or parsed and write it back in place; the updater's reconcile (src/cli/services/maintenance.ts:157, :187) also writes settings while the daemon may be running; and an Ollama model can be pulled or removed, or Ollama stopped, without a restart, while tool-calling analysis cannot fall back to a CLI (src/analyze/context/driver.ts:1100-1104). | config.write becomes the client settings writer, refuses to save over an unreadable or malformed file and otherwise replaces it atomically (src/config/reconcile-io.ts:63-64); the updater's reconcile, the one other approved writer, already writes atomically through the same seam and reports when it changed a model setting so its restart prompt says so; every operation that may run an Ollama model takes the installed list at its start and resolves against it, with nothing availability-dependent cached across operations; tests cover a corrupt file followed by an unrelated save from config.write and from Setup, a reader racing several writes, an updater reconcile changing a model setting, and Ollama flipping between installed, removed, unreachable and recovered within one daemon run for each Ollama-using path, including the TUI review. |

## 9. Alternatives considered

### 9.1 a1: One definitions registry from a boot snapshot, extending the curated catalog in place, applied at daemon start — **CHOSEN**

Extend the curated cloud catalog file, its loader and boot hook in place into one shipped definitions file listing every selectable model of all three families with its own facts (replacing the global Ollama context-window setting and every code default for a model choice); the main thread reads it with the approved-model store and the settings once at boot into a snapshot that every model-running thread receives, so approvals, saved tiers and catalog updates apply when the daemon restarts, while Ollama availability is checked per operation.

The curated catalog keeps its file, loader and boot hook and is extended into the single model-definitions file: per family (exactly one entry for each built-in family) its runner identity and CLI kind, and every model that may be selected, each with its aliases, accepted effort levels and input limit, plus the family's own tier defaults and summariser model, the Ollama family's tool-loop default model, and the family a fresh install defaults to. The global ollamaNumCtx setting is retired; the output cap ollamaNumPredict stays a global setting. The settings catalog gains rows that have no code default, which validation accepts and reconcile never fills; the tier runner and model rows and models.local.coreModel become such rows, and the local settings loader and both installers stop writing a coreModel, so an unset tier resolves to the catalog file's tier default and an unset coreModel to its tool-loop default, while values a user or an earlier reconcile already wrote stay. Only the main thread reads the validated file, the user's approved-model store and the settings (global and per-repo), once at boot, into one snapshot; it hands that snapshot to every worker it starts through the worker's start data, including a replacement the supervisor starts later, so every thread builds the same registry. An approval, a saved tier, a per-repo change or an updated catalog takes effect when the daemon restarts; after a save, an approval or an updater run that changed model settings the daemon reports that a restart is pending and every client offers to apply it with the existing restart action. What can change while the daemon runs, Ollama's installed models and whether it answers, is asked through the bounded listing at the start of each operation that may run an Ollama model, and that operation resolves its Ollama tiers and tool-loop model against the answer; when Ollama does not answer, an Ollama tier falls back to a tier default with a warning that says so.

User-approved unknown Claude and Codex models are per-user facts, kept in a daemon-owned store under the insrc home and written atomically; an approval is accepted only for a check in which the model actually ran without error. A tier set to a model that is neither listed nor approved runs a tier default from the definitions, with a warning, until the user approves it; the Ollama tool loop runs a listed, installed model or fails with a clear message. Settings are written only by config.write, which refuses to save over a settings file it cannot read or parse and otherwise writes it atomically, and by the updater's reconcile, the one approved offline writer, which already writes atomically. One read-only IPC request returns the running definitions, with each family's CLI kind and rejected model ids and whether a restart is pending; providers.listModels is derived from it, and the unknown-model check probes the CLIs one call at a time. A second request resolves a role for clients outside the daemon and returns everything needed to build either a CLI or an Ollama provider, so the TUI's review command runs on exactly the model the daemon would use; the TUI's Setup takes its recommended local model from the definitions and saves through config.write. Tiers become global-only, with the role assignments still persisted under `tasks`.

**Pros:**
- One source for every model fact and default: adding a model, alias, effort level or limit, or changing a default, is a data-file edit and a daemon restart (s1/ac2), with no code change and no code default left to override it; the existing catalog file, loader and boot hook stay, as the DEF decided.
- Only the main thread reads the inputs, once; every thread, including a later replacement worker, gets the same snapshot, so every thread resolves the same model with no cross-thread propagation, revision counters, job stamps or cache invalidation to get right.
- Clients reach facts only over IPC (k2), so a new model or effort level needs no VS Code or JetBrains release, and the TUI's review command and Setup no longer read model facts themselves, whichever family the review tier uses.
- Shipped facts (k4) and per-user approvals (k5) stay apart; an approval is never acknowledged before it is durable and never accepted for a model that did not run, and no save overwrites a settings file it could not read or parse.

**Cons:**
- Widest migration: 30 non-test files import src/config/analyze.ts, 14 carry runner literals, four call sites pass the global Ollama context window, and the settings catalog and reconcile gain a row kind without a default.
- An approval, a saved tier or a catalog update needs a daemon restart before it applies, and a repo's core runner/model override, read fresh today, is removed; clients must say so and offer the restart, and work running at the moment of the restart is interrupted as with any restart today.
- Users who tuned ollamaNumCtx lose that knob; a different value needs a definitions-file edit.
- Each operation that may run an Ollama model asks Ollama for its installed list first, and a save is refused while config.json is unreadable or malformed; the TUI's Setup now needs a running daemon.

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

### 9.4 a4: Live-updating registry without restarts

The same definitions registry as a1, but approvals, saved tiers and catalog changes take effect in every running thread and the TUI without a restart, through pushed revisions, revision-stamped jobs and revision-keyed caches.

Every saved settings change and every approval advances a revision that the main thread pushes to every worker; every job handed to a worker carries the revisions it needs and the worker catches up before running it; every cache that holds a resolved model is keyed on the revisions and rebuilt on change; the TUI compares the revisions, a catalog fingerprint and a daemon start id before each review.

This is the design of HLD revisions 4 to 8, reviewed through three cycles; each round found another channel or cache the propagation did not cover (worker-generated summary jobs, Setup, docgen and local-settings caches, restart-reset counters).

**Pros:**
- A change applies without restarting the daemon or interrupting running work.

**Cons:**
- Every channel that carries work and every cache that holds a model must take part in revision propagation; three review cycles kept finding new ones (for example summary jobs the indexing worker sends directly).
- Needs revision counters, hub pushes, job stamps, catch-up requests, cache keys and TUI rebuild rules, all of which tests must cover.
- Goes beyond the approved DEF, whose s1/ac2 already assumes a restart.

**Cost estimate:** L

**Rejected because:** Only partially meets k5: any work channel or cache missed by revision propagation can run a model the current approvals and settings no longer allow, and three review cycles kept finding such channels; it also exceeds the DEF (s1/ac2 assumes a restart), and the user chose a restart-applied design on 2026-10-25.

## 10. References

- **[[c1]]** `prior-artifact` `DEF-ce99b72065d03b1b` — "Approved Define for this Epic (approved with review override 2026-10-25)."
- **[[c2]]** `step-output` `s1` — "HldContext analyze bundles (capability discovery, settings defaults/write/read and daemon restart, worker start and replacement, model caches and out-of-daemon model paths, Ollama failure reporting an"
- **[[c3]]** `code` `src/daemon/model-catalog.ts:162` — "export async function validateModelCatalog(): Promise<void> {"
- **[[c4]]** `code` `src/daemon/index.ts:381` — "await validateModelCatalog();"
- **[[c5]]** `code` `src/daemon/index.ts:377` — "missing/malformed catalog asset is a fail-fast startup refusal"
- **[[c6]]** `code` `src/daemon/index.ts:205` — "const threadServices = threadsEnabled()"
- **[[c7]]** `doc` `docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/evidence/def-cli-probes.md:40` — "So no Claude CLI run shows whether a given model supports a given level."
- **[[c8]]** `step-output` `s3` — "a1 satisfies all seven constraints. a4 shares a1's facts and IPC but only partially meets k5, because every work channel and cache must join revision propagation and three review cycles kept finding o"
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
- **[[c23]]** `code` `src/docgen/extract/narrative-generator.ts:56` — "let cachedProvider: LLMProvider | null | undefined;"
- **[[c24]]** `code` `src/config/local.ts:67` — "let cached: LocalProviderInfraConfig | undefined;"
- **[[c25]]** `code` `src/config/reconcile-io.ts:64` — "renameSync(from: string, to: string): void;"
- **[[c26]]** `code` `src/daemon/list-models.ts:44` — "available:false + models:[] means the source could not be listed right now"
- **[[c28]]** `code` `src/cli/services/workflow.ts:253` — "const { provider, resolution } = router.resolveProviderForRole('review', loadAnalyzeConfig(), repoPath);"
- **[[c29]]** `doc` `docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/DEF.md:69` — "The existing curated model catalog keeps its file (src/assets/models/cloud-model-catalog.json), its loader (validateModelCatalog, src/daemon/model-catalog.ts:162) and its boot hook (src/daemon/index.t"
- **[[c31]]** `code` `src/daemon/handler-runtime.ts:1287` — "} catch { /* start fresh */ }"
- **[[c32]]** `code` `src/analyze/context/role-router.ts:192` — "* Construct a RoleRouter for one run. Holds a per-(role,repoPath) memo so"
- **[[c33]]** `code` `src/shared/model-recommender.ts:22` — "export const DEFAULT_LOCAL_MODEL = 'qwen3.6:27b';"
- **[[c34]]** `code` `src/cli/services/setup.ts:57` — "writeFileSync(PATHS.config, JSON.stringify(merged, null, 2) + '\n', 'utf-8');"
- **[[c37]]** `code` `src/cli/services/maintenance.ts:284` — "export async function restart(onLog: LogFn, deps: RestartDeps = { stopDaemon, startDaemon }): Promise<MaintenanceResult> {"
- **[[c38]]** `code` `vscode-plugin/src/daemon/commands.ts:26` — "{ id: 'insrc.daemon.restart', title: 'insrc: Restart daemon', action: 'restart' },"
- **[[c39]]** `stakeholder` `user 2026-10-25` — "yes, go with B"
- **[[c40]]** `code` `src/config/config-catalog.ts:116` — "{ path: 'models.tiers.mid.model',    type: 'string', default: 'sonnet',         desc: 'mid-tier model id (e.g. sonnet)', group: 'Models — tiers' },"
- **[[c41]]** `code` `src/config/reconcile.ts:379` — "writeLeaf(config, owned, keys, cloneDefault(opt.default));"
- **[[c42]]** `code` `src/daemon/threads/worker-entry.ts:59` — "const hub = new HubClient(init.hubPort);"
- **[[c43]]** `code` `src/daemon/threads/supervisor.ts:136` — "private async replace(spec: WorkerSpec): Promise<void> {"
- **[[c44]]** `code` `src/daemon/code-review-rpc.ts:194` — "const repoOverride = resolveRepoShaperProvider(repoPath);"
- **[[c45]]** `stakeholder` `user 2026-10-25` — "yes"
- **[[c46]]** `code` `src/config/config-catalog.ts:33` — "readonly default: unknown;"
- **[[c47]]** `code` `src/config/config-catalog.ts:142` — "{ path: 'models.local.coreModel',      type: 'string', default: 'qwen3.6:27b',"
- **[[c48]]** `code` `src/config/local.ts:53` — "coreModel:          'qwen3.6:27b',"
- **[[c49]]** `code` `src/cli/services/maintenance.ts:187` — "export async function runUpdateReconcile(root: string, onLog: LogFn, configPath?: string): Promise<ReconcileSummary> {"
- **[[c50]]** `code` `src/config/analyze.ts:463` — "const tiers = isObject(entry['tiers']) ? (entry['tiers'] as Record<string, unknown>) : {};"
- **[[c51]]** `code` `scripts/insrc-daemon-install.sh:324` — ""coreModel":      "qwen3.6:27b","
- **[[c52]]** `code` `src/config/reconcile.ts:383` — "writeLeaf(config, owned, keys, cloneDefault(opt.default));"
- **[[c53]]** `stakeholder` `user 2026-10-25` — "yes"
