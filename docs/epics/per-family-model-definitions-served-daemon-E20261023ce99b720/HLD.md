<!-- insrc:artifact HLD-ce99b72065d03b1b -->

# HLD: per-family-model-definitions-served-daemon

## Summary

Every fact about the model families insrc runs (Claude CLI, Codex CLI, Ollama) moves into one definitions file shipped with insrc: each family's models with their aliases, effort levels and input limits, and the family's own tier defaults and summariser model. The daemon checks the file at startup and every thread that runs models builds the same registry from it; a model the user has checked and approved is added from a separate per-user store, and a model that is neither shipped nor approved is never run, its tier falling back to the family default until the user approves it. Clients get the whole picture from one daemon request and keep no lists of their own.

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

A model-definitions registry, grown from the curated cloud catalog and built in every daemon thread that runs models. One shipped JSON file (replacing src/assets/models/cloud-model-catalog.json) describes, per family, its runner identity and CLI kind, its known models with aliases (e.g. the Claude CLI's opus/sonnet/haiku), accepted effort levels and input limit, its own core/mid/cheap tier defaults and its summariser model, plus which family a fresh install defaults to; Ollama is described at family level because its installed models are listed live. The main thread validates the file before it starts the worker threads (today created at src/daemon/index.ts:205) and before it listens; the file is then loaded by each model-running thread at its start. User-approved unknown models live in a per-user store owned by the main thread and are pushed to the workers over the existing hub channel. A tier set to a model that is neither shipped nor approved runs its family's tier default with a warning until approved (user decision A). One read-only IPC request serves the merged view; providers.listModels is drawn from it. Tier settings become global-only, with coreFloor kept as a tier name.

## 3. Architecture shape

Daemon, every model-running thread: (1) a ModelRegistry built at thread start from the validated definitions file plus the current approved-model set; it is the only answer to model questions: families, models and their aliases, whether a model accepts an effort, a model's input limit, a family's tier default and summariser model, the runner and CLI kind of a family, and the model a tier setting resolves to (with the fallback of decision A). (2) Tier resolution (resolveTier and the role router's default fallback), shaper and summariser provider selection (including the summary worker's summariseDoc path, src/analyze/summariser/driver.ts:195 and :211), CliProvider's input budget and effort forwarding all ask the registry instead of DEFAULT_TIERS, TIER_EFFORTS, SUMMARISER_CLI_FALLBACK and CODEX_INPUT_BUDGET_CHARS. Main thread only: (3) validation of the definitions file before the thread services start and before the socket listens; (4) the approved-model store and the unknown-model check service, which probes through the installed CLIs one call at a time and, after an approval or rejection, sends the new approved set to every worker over the hub channel (src/daemon/threads/main-services.ts:154, src/daemon/threads/channel.ts:124); (5) the config reconcile rule that removes per-repo tier overrides. IPC: models.definitions returns the merged view; providers.listModels keeps its shape but is drawn from the registry (Ollama still listed live); models.check / models.approve / models.reject drive the unknown-model flow; each new method is classified in src/daemon/threads/method-class.ts. Clients: the TUI model-tiers pane, the VS Code model-tier picker and repo panel, and the JetBrains model-tiers and per-repo sections render models.definitions and call the check/approve requests; none keeps a runner, model or effort list. Installer: both copies of the install script take the chosen family's tier defaults from the definitions file instead of their own blocks.

## 4. Diagrams

- [ER model](docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/er-model.html)

## 5. Shared contracts

### 5.1 sc1: ModelDefinitionsFile

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`

**Purpose:** The shipped, versioned data format for all model facts, edited to add a model, alias, version or effort level (k4); validated before the daemon starts its workers or listens (k7). Tier defaults and the summariser model are per family, so the installer's Claude and Codex mappings and the Codex summariser come from it.

**Interface sketch (type-level):**

```
type FamilyId = 'cli-claude' | 'cli-codex' | 'ollama';
type TierName = 'core' | 'mid' | 'cheap';
type EffortLevel = string; // the file is the authority for the level names
interface InputLimit { readonly unit: 'chars' | 'tokens'; readonly max: number; }
interface ModelDefinition {
  readonly id: string;                         // canonical id, unique within its family
  readonly aliases?: readonly string[] | undefined; // names the CLI also accepts (e.g. 'haiku'); unique within the family
  readonly displayName?: string | undefined;
  readonly efforts: readonly EffortLevel[];     // accepted effort levels ([] = no effort passed)
  readonly inputLimit?: InputLimit | undefined; // absent = the family default, else the CLI's own refusal decides
}
interface TierDefault { readonly model: string; readonly effort?: EffortLevel | undefined; } // model: an id or alias of THIS family
interface FamilyDefinition {
  readonly id: FamilyId;
  readonly cliKind?: 'claude' | 'codex' | undefined;  // absent for ollama
  readonly displayName: string;
  readonly models: readonly ModelDefinition[];        // ollama: optional known models; installed ones are listed live
  readonly defaultInputLimit?: InputLimit | undefined;
  readonly tierDefaults?: Readonly<Record<TierName, TierDefault>> | undefined; // required for the CLI families
  readonly summariserModel?: string | undefined;      // id or alias of this family; required for the CLI families
}
interface ModelDefinitionsFile {
  readonly version: number;
  readonly defaultFamily: 'cli-claude' | 'cli-codex'; // the family a fresh install and an unset tier use
  readonly families: readonly FamilyDefinition[];
}
```

**Assumptions cited:** [[c5]]

### 5.2 sc2: ModelRegistry (one per model-running thread)

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`

**Purpose:** The only in-process source of model facts, built at the start of every thread that runs models from the validated sc1 file plus the current approved-model set, so the main thread and the workers answer identically. It resolves aliases, and applies user decision A: a tier set to a model that is neither shipped nor approved resolves to the family's tier default, flagged as a fallback.

**Interface sketch (type-level):**

```
interface ResolvedModel extends ModelDefinition {
  readonly family: FamilyId;
  readonly source: 'shipped' | 'user-approved';
}
interface ApprovedModelSet { readonly profiles: readonly ApprovedProfile[]; readonly revision: number; }
interface TierResolution {
  readonly family: FamilyId;
  readonly model: ResolvedModel;               // canonical model actually run
  readonly effort?: EffortLevel | undefined;   // dropped when the model does not accept it (s3/ac2)
  readonly fallback?: { readonly reason: 'unknown-model' | 'rejected-model'; readonly requested: string } | undefined; // decision A
  readonly droppedEffort?: EffortLevel | undefined;
}
interface ModelRegistry {
  families(): readonly FamilyDefinition[];
  defaultFamily(): 'cli-claude' | 'cli-codex';
  models(family: FamilyId): readonly ResolvedModel[];             // shipped + approved overlay
  find(family: FamilyId, idOrAlias: string): ResolvedModel | undefined;
  acceptsEffort(family: FamilyId, idOrAlias: string, effort: EffortLevel): boolean;
  inputLimit(family: FamilyId, idOrAlias: string): InputLimit | undefined;
  tierDefault(family: FamilyId, tier: TierName): TierDefault;
  summariserModel(family: 'cli-claude' | 'cli-codex'): ResolvedModel;
  cliKind(family: FamilyId): 'claude' | 'codex' | undefined;
  resolveTier(setting: { family: FamilyId; model?: string | undefined; effort?: EffortLevel | undefined } | undefined, tier: TierName): TierResolution;
  applyApproved(set: ApprovedModelSet): void;  // replaces the overlay; later revisions win
}
```

**Assumptions cited:** [[c5]] [[c12]]

### 5.3 sc3: models.definitions IPC request

**Owner Story:** `s2`
**Consumed by:** `s4`, `s5`, `s6`, `s7`

**Purpose:** The one read-only daemon request every client uses to learn families, models with aliases, per-model efforts and limits, each family's tier defaults and summariser model, and the default family (k2). Carries user-approved models marked as such (s4/ac5). providers.listModels is drawn from the same registry and agrees with it (s2/ac2).

**Interface sketch (type-level):**

```
// request: 'models.definitions'  params: {}
interface ModelDefinitionsResult {
  readonly version: number;
  readonly defaultFamily: 'cli-claude' | 'cli-codex';
  readonly families: readonly {
    readonly id: FamilyId;
    readonly displayName: string;
    readonly liveListed: boolean;   // true for ollama: installed models come from providers.listModels
    readonly tierDefaults?: Readonly<Record<TierName, TierDefault>> | undefined;
    readonly summariserModel?: string | undefined;
    readonly models: readonly {
      readonly id: string;
      readonly aliases: readonly string[];
      readonly displayName?: string | undefined;
      readonly efforts: readonly EffortLevel[];
      readonly inputLimit?: InputLimit | undefined;
      readonly source: 'shipped' | 'user-approved';
    }[];
  }[];
}
```

**Assumptions cited:** [[c5]]

### 5.4 sc4: Unknown-model check and approval requests

**Owner Story:** `s4`
**Consumed by:** `s5`, `s6`, `s7`

**Purpose:** The daemon flow that checks a model not in the definitions through its CLI, one call at a time (k1, k3), returns per-effort evidence, and stores the user's approved profile in a per-user store (k5) outside the shipped file and config.json (k4). After every approval or rejection the main thread pushes the new approved set to each worker's registry.

**Interface sketch (type-level):**

```
// request: 'models.check'   params: { family: 'cli-claude' | 'cli-codex'; modelId: string; claimedEfforts: EffortLevel[] }
type EffortVerdict = 'accepted' | 'rejected' | 'recognised-unconfirmed'; // last: Claude, support not confirmable by the CLI
interface ModelCheckResult {
  readonly family: FamilyId;
  readonly modelId: string;
  readonly runs: boolean;
  readonly inputLimit?: InputLimit | undefined;
  readonly efforts: readonly { readonly effort: EffortLevel; readonly verdict: EffortVerdict; readonly evidence: string }[];
  readonly checkId: string;
  readonly error?: string | undefined;     // the CLI could not be reached (s4/ac4)
}
// request: 'models.approve' params: { checkId: string; efforts: EffortLevel[] }  -> { ok: true } | { ok: false; reason: string }
// request: 'models.reject'  params: { checkId: string }                          -> { ok: true }
interface ApprovedProfile {
  readonly family: FamilyId;
  readonly modelId: string;
  readonly status: 'approved' | 'rejected';
  readonly efforts: readonly EffortLevel[];  // approved: only checked AND approved levels (s4/ac3)
  readonly inputLimit?: InputLimit | undefined;
  readonly decidedAt: string;               // ISO time
  readonly cliVersion: string;
}
// hub message main -> worker: { kind: 'approved-models'; set: ApprovedModelSet }
```

**Assumptions cited:** [[c11]]

### 5.5 sc5: Global-only tier settings

**Owner Story:** `s3`
**Consumed by:** `s5`, `s6`, `s7`

**Purpose:** The settings shape after k6: tier runner, model and effort exist only globally; a repo may only assign roles to tiers and set the core floor, which stays a tier name as today (src/config/analyze.ts:144). Clients edit settings to this shape; the daemon ignores and removes per-repo tier overrides (s3/ac5) and keeps every existing coreFloor and roleTiers value.

**Interface sketch (type-level):**

```
interface GlobalTierSetting { readonly runner: FamilyId; readonly model: string; readonly effort?: EffortLevel | undefined; } // model: id or alias
interface GlobalTiering {
  readonly tiers?: Partial<Record<TierName, GlobalTierSetting>> | undefined;
  readonly roleTiers?: Readonly<Record<string, TierName>> | undefined;
  readonly coreFloor?: TierName | undefined;
}
interface RepoTiering { // models.byRepo[repo]
  readonly roleTiers?: Readonly<Record<string, TierName>> | undefined;
  readonly coreFloor?: TierName | undefined;
  // no `tiers`: a stale models.byRepo[repo].tiers entry is removed by config reconcile
}
```

**Assumptions cited:** [[c12]]

## 6. Story boundaries

### 6.1 Story E20261024ce99b720:S001

**Owns:** `sc1`, `sc2`

The definitions file contents (seeded from the curated catalog, with current model ids such as the Claude haiku the CLI resolves today, and with the CLI aliases the tier defaults use), the validator (missing file, malformed JSON, unknown family, duplicate id or alias in a family, a tier default or summariser model that is not an id or alias of its family, a defaultFamily without tier defaults; each failure names the entry), its run in the main thread before the thread services start and before the socket listens, and building the registry at the start of the main thread and of each worker that runs models. Both installer copies take the chosen family's tier defaults from the file. Retires the curated catalog asset and its loader. Tests: a validator suite with one fixture per refusal reason (ac3); a data-only addition test that adds a model and alias to a fixture file and reads it back through the registry with no code change (ac2); a boot-order test that the file is validated before thread services start and before listen (ac1, k7); a test that the main thread and a worker build equal registries; the existing model-catalog and model-catalog-asset suites are adapted to the new file.

### 6.2 Story E20261024ce99b720:S002

**Owns:** `sc3`
**Depends on:** `sc1`, `sc2`

The handler for models.definitions, the projection of the registry into the result, its entry in src/daemon/threads/method-class.ts, and re-sourcing providers.listModels for the CLI families from the registry so the two answers agree; the live Ollama listing stays as it is. Tests: models.definitions returns every family, model, alias, effort list, limit, tier default and summariser model of a fixture file (ac1); providers.listModels and models.definitions agree for each CLI family (ac2); the method-class coverage test passes with the new entry; the existing list-models suite is adapted.

### 6.3 Story E20261024ce99b720:S003

**Owns:** `sc5`
**Depends on:** `sc1`, `sc2`

Moving every daemon consumer, in the main thread and the workers, onto the registry: resolveTier and the role router's default fallback (DEFAULT_TIERS), the summariser selection (SUMMARISER_CLI_FALLBACK) including the summary worker's path, the effort list (TIER_EFFORTS and the config catalog's effort rows), CliProvider's input budget and effort forwarding, and the runner/CLI-kind literals in routing, provider construction, attribution and workflow code. Applies decision A at resolution: a tier set to a model that is neither shipped nor approved runs its family's tier default and logs a warning naming the tier, the requested model and the default used. Also the settings parse and config reconcile rule that stop reading, then remove, per-repo tier overrides with a warning naming repo and tier, keeping coreFloor and roleTiers. Tests: an unset tier resolves to the family's tier default from a fixture file (ac1); an unsupported effort is not passed and a warning names model and effort (ac2); a source scan fails on runner or model literals outside the family implementations (ac3); a repo's role-to-tier choice applies while the tier's model comes from global settings (ac4); reconcile removes per-repo tier overrides, warns with repo and tier and keeps coreFloor/roleTiers (ac5); an unlisted model falls back to the tier default with the warning (decision A); the summariser in a worker resolves the same model as in the main thread; the existing analyze-tiering, tier-defaults and core-floor suites are adapted.

### 6.4 Story E20261024ce99b720:S004

**Owns:** `sc4`
**Depends on:** `sc1`, `sc2`, `sc3`

The per-family check procedures (Codex: model list from the CLI plus a run; Claude: a run, input limit from the JSON output, recognised effort names), their serial execution, the approved-model store under the insrc home (approved and rejected profiles) and its validation, loading it into the main thread's registry, pushing every change to the workers over the hub channel and having a later-started worker read the store at its start, the method-class entries for models.check, models.approve and models.reject, and refusing to set a tier to a model whose profile is rejected or whose check could not reach the CLI. Tests: per-family checks against fake CLIs record each verdict and run one call at a time (ac1); results list each claimed level with evidence and nothing is usable before approval (ac2); an approved profile admits only the passed and approved levels (ac3); a rejected profile or an unreachable CLI refuses the model with a reason (ac4); an approved model appears in models.definitions marked user-approved (ac5); a worker's registry reflects an approval and a rejection; a malformed store is reported and ignored without stopping the daemon; the method-class coverage test passes.

### 6.5 Story E20261024ce99b720:S005

**Depends on:** `sc3`, `sc4`, `sc5`

The TUI model-tiers pane and its effort cycle driven by models.definitions, the unknown-model check and approval screen, and the repo settings view limited to role-to-tier and the core floor. Tests: the pane offers exactly the families, models and effort levels of a fake models.definitions answer and holds no list of its own (ac1); saving an unknown model starts the check and shows its results for approval (ac2); the repo view edits only role-to-tier and coreFloor (ac3); the existing model-tiers pane suites are adapted.

### 6.6 Story E20261024ce99b720:S006

**Depends on:** `sc3`, `sc4`, `sc5`

The VS Code model-tier picker driven by models.definitions instead of its runner union and compiled config-catalog effort rows, the unknown-model check and approval prompt, and the Repo Configuration panel without per-tier runner or model fields. Tests: the picker offers exactly the options of a fake models.definitions answer and the extension bundle keeps no runner or model list (ac1); confirming an unknown model shows the check results and saves only after approval (ac2); the repo panel shows only role-to-tier and coreFloor (ac3); the existing model-tier-picker suite is adapted.

### 6.7 Story E20261024ce99b720:S007

**Depends on:** `sc3`, `sc4`, `sc5`

The JetBrains model-tiers settings section driven by models.definitions instead of ModelTiersModel.PROVIDERS, the unknown-model check and approval dialog, and the per-repo settings without per-tier runner or model fields. Tests: the section offers exactly the options of a fake models.definitions answer and the plugin keeps no runner or model list (ac1); applying an unknown model shows the check results and saves only after approval (ac2); the per-repo settings show only role-to-tier and coreFloor (ac3); the existing ModelTiersModel and settings tests are adapted.

## 7. Non-functional targets

- **Performance:** The definitions file is parsed and validated once in the main thread at boot and read once more by each worker at its start; every later model question is an in-memory lookup. models.definitions answers without touching a CLI or Ollama. An approval reaches every worker in one hub message.
- **Security:** No cloud REST call is added (k1): checks run only through the installed claude and codex CLIs. The approved-model store is a per-user file under the insrc home, written only by the daemon's main thread; clients reach it only through models.approve and models.reject (k2).
- **Observability:** A bad definitions file stops the daemon with a log naming the faulty entry (s1/ac3). Dropping an unsupported effort logs the model and effort (s3/ac2). Falling back from an unlisted model logs the tier, the requested model and the default used (decision A). Removing a per-repo tier override logs the repo and tier (s3/ac5). Each unknown-model check logs every CLI call and its verdict.
- **Durability:** Approved and rejected profiles survive daemon restarts and insrc updates because they live outside the shipped file and outside config.json; when an update ships a model a user had approved, the shipped definition wins. A malformed approved-model store is reported and ignored rather than stopping the daemon. Existing coreFloor and roleTiers values are kept unchanged when per-repo tier overrides are removed.

## 8. Rollout

**Phase A — definitions file and per-thread registry**

**Stories:** `s1`

s1 owns sc1 and sc2, which every other Story consumes; it has no dependencies.

**Backward compat:** providers.listModels keeps answering the same Claude and Codex models: the definitions file is seeded from the curated catalog (with stale ids refreshed) and adds the aliases today's tier defaults use, so every tier already configured with opus, sonnet, haiku or a catalogued Codex id still resolves. The catalog's fail-fast startup behaviour is kept and now runs before the worker threads start.

**Phase B — daemon serves and runs by the definitions**

**Stories:** `s2`, `s3`

Both depend only on s1. s2 adds models.definitions and re-sources providers.listModels; s3 moves every daemon consumer, in every thread, onto the registry, applies the fallback for unlisted models and makes tiers global-only.

**Backward compat:** providers.listModels keeps its request and result shape. A tier set to a shipped model or alias keeps running it; only an effort its model does not accept is dropped, with a warning. A tier set to a model that is neither shipped nor approved runs its family's tier default with a warning naming the tier, the requested model and the default, until the user checks and approves it (decision A). Per-repo tier overrides are removed with a warning naming repo and tier; coreFloor and roleTiers values are kept.

**Phase C — unknown-model check and approval**

**Stories:** `s4`

s4 depends on s2 (approved models appear in models.definitions) and must land before the client Stories that drive its check and approval requests.

**Backward compat:** Until a user approves a fallen-back model, its tier keeps running the family default; approving it makes the tier run the requested model in every thread without a restart.

**Phase D — clients render the daemon's definitions**

**Stories:** `s5`, `s6`, `s7`

Each client Story depends on s2, s3 and s4 and on nothing else from the others, so the TUI, VS Code and JetBrains migrations can land in any order.

**Backward compat:** An older plugin keeps working against the new daemon because providers.listModels and the config write path keep their shapes; it simply shows its own lists until updated.

**Ordering rationale:** Owners land before consumers: s1 (sc1, sc2) first; then s2 (sc3) and s3 (sc5), which need only s1; then s4 (sc4), which needs sc3 to expose approved models; then the three clients, which consume sc3, sc4 and sc5. This follows the Epic's dependsOn edges exactly.

**Risky bits**

| Area | Why | Mitigation |
| :--- | :--- | :--- |
| Registries out of step across threads (s1, s4) | The indexing and summary workers start before the catalog is validated today (src/daemon/index.ts:205 vs :381) and keep their own module state, so a worker could run with no registry or with a stale approved set. | s1 moves validation ahead of the thread services and builds the registry at every model-running thread's start; s4 pushes each approval change over the hub channel with a revision number and a later-started worker reads the store at its start; tests compare a worker's resolution with the main thread's. |
| Daemon-wide literal removal (s3) | 30 non-test files import src/config/analyze.ts and 14 carry runner literals; a missed site keeps a stale default or effort and silently disagrees with the definitions. | s3 adds a source scan test that fails on runner or model literals outside the family implementations, and keeps resolveTier's signature so callers change only where they read literals. |
| Upgrade of existing settings (s1, s3) | Users have tiers set to aliases, to catalogued ids and to models outside any list; removing support for any of them, or running an unapproved model, would change what runs without notice or break k5. | The definitions keep today's aliases and catalogued ids; an unlisted model falls back to the family's tier default with a warning naming tier, requested model and default (decision A); per-repo overrides are removed only with a logged warning, keeping coreFloor and roleTiers. |

## 9. Alternatives considered

### 9.1 a1: One definitions registry per daemon thread, grown from the curated catalog — **CHOSEN**

Replace the curated cloud catalog with one shipped definitions file covering all three families, validated once at boot and loaded into a registry in every daemon thread that does model work, with user-approved profiles in a separate daemon-owned store pushed to every thread.

The curated catalog (one JSON asset, a boot-time loader and validator, a frozen cached parse) becomes the single model-definitions file: per family its runner identity and CLI kind, its known models with each model's aliases, accepted effort levels and input limit, the family's own tier defaults and summariser model, and which family a fresh install defaults to; Ollama carries family-level facts because its installed models are listed live. The main thread validates the file before it starts the worker threads and before it listens, and refuses to start on a bad file. Each thread that resolves models (the main thread and the indexing and document-summary workers) builds the same frozen registry from the validated file at its start, so no thread reads a literal and none waits on another.

User-approved unknown models are per-user facts, kept in their own daemon-owned store under the insrc home, never in the shipped file or config.json. The main thread owns that store and, after any approval or rejection, sends the new set to every worker over the existing hub channel; a worker started later reads the store at its start. A tier set to a model that is neither shipped nor approved runs the family's tier default from the definitions, with a warning, until the user approves it. One read-only IPC request returns the merged view, providers.listModels is derived from it, and the unknown-model check is a daemon IPC flow that probes through the installed CLIs one call at a time. Clients render the IPC answer; tiers become global-only and stale per-repo tier overrides are removed by config reconcile.

**Pros:**
- One source for every model fact: adding or renaming a model, alias or effort level is a data-file edit and a daemon restart, with no code change in the daemon or any client.
- Every thread that runs a model reads the same validated registry, so the summary worker and the main thread cannot disagree on a tier default or an effort level.
- Clients reach facts only over IPC (k2), so a new effort level or model needs no VS Code or JetBrains release.
- Shipped facts (k4) and per-user approvals (k5) stay apart, so an insrc update never overwrites a user's approvals.

**Cons:**
- Widest migration: 30 non-test files import src/config/analyze.ts and 14 carry runner literals, spanning several stories.
- Approval changes must reach worker threads through the hub channel, adding a message type and a restart path that tests must cover.
- Clients cannot show model choices while the daemon is down; today the VS Code effort list works offline because it is compiled in.

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

**Rejected because:** Typed constants, but VS Code keeps a compiled copy (violates k2) and a data edit needs a rebuild (partial k4), and a hand-edited installed file is not checked at start (partial k7).

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
- **[[c2]]** `step-output` `s1` — "HldContext analyze bundles (capability discovery, import graph, structural map, manifests, conventions)."
- **[[c3]]** `code` `src/daemon/model-catalog.ts:162` — "export async function validateModelCatalog(): Promise<void> {"
- **[[c4]]** `code` `src/daemon/index.ts:381` — "await validateModelCatalog();"
- **[[c5]]** `code` `src/daemon/index.ts:377` — "missing/malformed catalog asset is a fail-fast startup refusal"
- **[[c6]]** `code` `src/daemon/index.ts:205` — "const threadServices = threadsEnabled()"
- **[[c7]]** `doc` `docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/evidence/def-cli-probes.md:40` — "So no Claude CLI run shows whether a given model supports a given level."
- **[[c8]]** `step-output` `s3` — "a1 is the only alternative that satisfies all seven constraints. a2 violates k2 and only partially meets k4 and k7; a3 violates k4 and only partially meets k5 and k7; a4 violates k2, k4 and k5. Buildi"
- **[[c9]]** `code` `src/daemon/threads/main-services.ts:154` — "hubPort: port2"
- **[[c10]]** `stakeholder` `user 2026-10-25` — "go with A: a tier set to an unlisted, unapproved model falls back to the tier default from the definitions with a warning until the user approves it"
- **[[c11]]** `doc` `docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/evidence/def-cli-probes.md:20` — "For codex, a model's accepted levels must therefore come from `codex debug models`"
- **[[c12]]** `code` `src/cli/panes/model-tiers.ts:63` — "tiers[t] = resolveTier(tiering, t);"
- **[[c13]]** `code` `src/config/analyze.ts:144` — "readonly coreFloor?: TierName | undefined;"
- **[[c14]]** `code` `src/daemon/threads/method-class.ts:148` — "['providers.listModels', 'session', false],"
- **[[c15]]** `code` `scripts/insrc-daemon-install.sh:303` — ""core":  { "runner": "cli-claude", "model": "opus" },"
- **[[c16]]** `doc` `docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/evidence/def-cli-probes.md:35` — "claude -p --model haiku --effort xhigh --output-format json"
