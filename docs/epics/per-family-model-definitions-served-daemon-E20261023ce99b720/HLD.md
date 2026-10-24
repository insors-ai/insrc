<!-- insrc:artifact HLD-ce99b72065d03b1b -->

# HLD: per-family-model-definitions-served-daemon

## Summary

Every fact about the model families insrc runs (Claude CLI, Codex CLI, Ollama) moves into one definitions file shipped with insrc, which the daemon loads and checks at startup and holds as a single registry. The daemon resolves tiers, the summariser model, effort levels and input limits only through that registry, serves the same view to every client over one IPC request, and adds models a user has checked and approved from a separate per-user store. The terminal UI and both IDE plugins stop keeping their own lists and render what the daemon returns.

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

A daemon-held model-definitions registry, grown from the existing curated cloud catalog. One shipped JSON file (replacing src/assets/models/cloud-model-catalog.json) describes each family's runner identity and CLI kind, its known models with per-model accepted effort levels and input limit, the tier defaults and the summariser model; Ollama is described at family level because its installed models are discovered live. The daemon validates the file at boot before it listens (as validateModelCatalog does today at src/daemon/index.ts:381), refuses to start on a bad file, and keeps a frozen registry. User-approved unknown models live in a separate daemon-owned store under the insrc home and are overlaid on the registry as user-approved entries. One read-only IPC request serves the merged view; providers.listModels is derived from it. Tier settings become global-only.

## 3. Architecture shape

Daemon side: (1) the definitions file and its loader/validator replace the curated catalog in the same boot slot; (2) a ModelRegistry module is the only place that answers model questions (families, models of a family, tier default, summariser model, whether a model accepts an effort, a model's input limit, runner and CLI kind of a family), reading the frozen shipped definitions plus an approved-model overlay; (3) tier resolution (resolveTier, the role router, the shaper and summariser provider selection, CliProvider's input budget) asks the registry instead of DEFAULT_TIERS, TIER_EFFORTS, SUMMARISER_CLI_FALLBACK and CODEX_INPUT_BUDGET_CHARS; (4) an unknown-model check service probes through the installed CLIs one call at a time and writes approved profiles to the approved-model store; (5) the existing config reconcile step removes per-repo tier overrides. IPC side: models.definitions returns the merged view; providers.listModels keeps its shape but is drawn from the registry (Ollama still listed live); models.check / models.approve / models.reject drive the unknown-model flow. Client side: the TUI model-tiers pane, the VS Code model-tier picker and repo panel, and the JetBrains model-tiers and per-repo sections render models.definitions and call the check/approve requests; none keeps a runner, model or effort list.

## 4. Diagrams

- [ER model](docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/er-model.html)

## 5. Shared contracts

### 5.1 sc1: ModelDefinitionsFile

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`

**Purpose:** The shipped, versioned data format for all model facts: the single place a maintainer edits to add a model, version or effort level (k4). Validated at daemon start (k7).

**Interface sketch (type-level):**

```
type FamilyId = 'cli-claude' | 'cli-codex' | 'ollama';
type EffortLevel = string; // e.g. 'low' | 'medium' | 'high' | 'xhigh' | 'max'; the file is the authority
interface InputLimit { readonly unit: 'chars' | 'tokens'; readonly max: number; }
interface ModelDefinition {
  readonly id: string;                       // exact id passed to the CLI
  readonly displayName?: string | undefined;
  readonly efforts: readonly EffortLevel[];   // accepted effort levels for THIS model ([] = effort not passed)
  readonly inputLimit?: InputLimit | undefined; // absent = the CLI's own size refusal decides
}
interface FamilyDefinition {
  readonly id: FamilyId;
  readonly cliKind?: 'claude' | 'codex' | undefined; // absent for ollama
  readonly displayName: string;
  readonly models: readonly ModelDefinition[];   // ollama: optional known models; installed ones are listed live
  readonly defaultInputLimit?: InputLimit | undefined; // family fallback, e.g. ollama context window
}
interface ModelDefinitionsFile {
  readonly version: number;
  readonly families: readonly FamilyDefinition[];
  readonly tierDefaults: Readonly<Record<'core' | 'mid' | 'cheap', { readonly family: FamilyId; readonly model: string; readonly effort?: EffortLevel | undefined }>>;
  readonly summariser: Readonly<Record<'cli-claude' | 'cli-codex', string>>; // cheap model per CLI family
}
```

**Assumptions cited:** [[c5]]

### 5.2 sc2: ModelRegistry

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`

**Purpose:** The daemon's only in-process source of model facts, built once at boot from sc1 plus an approved-model overlay. Every daemon consumer asks it instead of keeping literals (s3/ac3); s4 plugs its approved models in through ApprovedModelSource.

**Interface sketch (type-level):**

```
interface ResolvedModel extends ModelDefinition {
  readonly family: FamilyId;
  readonly source: 'shipped' | 'user-approved';
}
interface ApprovedModelSource {
  approvedModels(family: FamilyId): readonly ResolvedModel[]; // source === 'user-approved'
}
interface ModelRegistry {
  families(): readonly FamilyDefinition[];
  models(family: FamilyId): readonly ResolvedModel[];          // shipped + approved overlay
  find(family: FamilyId, modelId: string): ResolvedModel | undefined;
  acceptsEffort(family: FamilyId, modelId: string, effort: EffortLevel): boolean;
  inputLimit(family: FamilyId, modelId: string): InputLimit | undefined;
  tierDefault(tier: 'core' | 'mid' | 'cheap'): { family: FamilyId; model: string; effort?: EffortLevel | undefined };
  summariserModel(family: 'cli-claude' | 'cli-codex'): string;
  cliKind(family: FamilyId): 'claude' | 'codex' | undefined;
}
type RegistryOverlayRegistration = (source: ApprovedModelSource) => void; // s4 registers its store
```

**Assumptions cited:** [[c5]] [[c12]]

### 5.3 sc3: models.definitions IPC request

**Owner Story:** `s2`
**Consumed by:** `s4`, `s5`, `s6`, `s7`

**Purpose:** The one read-only daemon request every client uses to learn families, models, per-model efforts and limits, tier defaults and the summariser model (k2). Carries user-approved models marked as such (s4/ac5). providers.listModels is drawn from the same registry and agrees with it (s2/ac2).

**Interface sketch (type-level):**

```
// request: 'models.definitions'  params: {}
interface ModelDefinitionsResult {
  readonly version: number;
  readonly families: readonly {
    readonly id: FamilyId;
    readonly displayName: string;
    readonly models: readonly {
      readonly id: string;
      readonly displayName?: string | undefined;
      readonly efforts: readonly EffortLevel[];
      readonly inputLimit?: InputLimit | undefined;
      readonly source: 'shipped' | 'user-approved';
    }[];
    readonly liveListed: boolean; // true for ollama: installed models come from providers.listModels
  }[];
  readonly tierDefaults: ModelDefinitionsFile['tierDefaults'];
  readonly summariser: ModelDefinitionsFile['summariser'];
}
```

**Assumptions cited:** [[c5]]

### 5.4 sc4: Unknown-model check and approval requests

**Owner Story:** `s4`
**Consumed by:** `s5`, `s6`, `s7`

**Purpose:** The daemon flow that checks a model not in the definitions through its CLI, one call at a time (k1, k3), returns per-effort evidence, and stores the user's approved profile in a per-user store (k5), never the shipped file or config.json (k4).

**Interface sketch (type-level):**

```
// request: 'models.check'   params: { family: 'cli-claude' | 'cli-codex'; modelId: string; claimedEfforts: EffortLevel[] }
type EffortVerdict = 'accepted' | 'rejected' | 'recognised-unconfirmed'; // the last: Claude, the CLI cannot confirm support
interface ModelCheckResult {
  readonly family: FamilyId;
  readonly modelId: string;
  readonly runs: boolean;                 // the model answered through its CLI
  readonly inputLimit?: InputLimit | undefined; // from the CLI's own output where it states one
  readonly efforts: readonly { readonly effort: EffortLevel; readonly verdict: EffortVerdict; readonly evidence: string }[];
  readonly checkId: string;               // ties an approval to this check
  readonly error?: string | undefined;    // the CLI could not be reached (s4/ac4)
}
// request: 'models.approve' params: { checkId: string; efforts: EffortLevel[] }  -> { ok: true } | { ok: false; reason: string }
// request: 'models.reject'  params: { checkId: string }                          -> { ok: true }
interface ApprovedProfile {
  readonly family: FamilyId;
  readonly modelId: string;
  readonly efforts: readonly EffortLevel[];   // only checked AND approved levels (s4/ac3)
  readonly inputLimit?: InputLimit | undefined;
  readonly approvedAt: string;               // ISO time
  readonly cliVersion: string;               // the CLI version the check ran against
}
```

**Assumptions cited:** [[c11]]

### 5.5 sc5: Global-only tier settings

**Owner Story:** `s3`
**Consumed by:** `s5`, `s6`, `s7`

**Purpose:** The settings shape after k6: tier runner, model and effort exist only globally; a repo may only assign roles to tiers and set the core floor. Clients edit settings to this shape; the daemon ignores and removes per-repo tier overrides (s3/ac5).

**Interface sketch (type-level):**

```
interface GlobalTierSetting { readonly runner: FamilyId; readonly model: string; readonly effort?: EffortLevel | undefined; }
interface GlobalTiering {
  readonly tiers?: Partial<Record<'core' | 'mid' | 'cheap', GlobalTierSetting>> | undefined;
  readonly roleTiers?: Readonly<Record<string, 'core' | 'mid' | 'cheap'>> | undefined;
  readonly coreFloor?: boolean | undefined;
}
interface RepoTiering { // models.byRepo[repo]
  readonly roleTiers?: Readonly<Record<string, 'core' | 'mid' | 'cheap'>> | undefined;
  readonly coreFloor?: boolean | undefined;
  // no `tiers`: a stale models.byRepo[repo].tiers entry is removed by config reconcile
}
```

**Assumptions cited:** [[c12]]

## 6. Story boundaries

### 6.1 Story E20261024ce99b720:S001

**Owns:** `sc1`, `sc2`

The definitions file contents, the loader and validator (missing file, malformed JSON, unknown family, tier default or summariser model not among that family's models, all naming the faulty entry), the frozen registry construction and its boot slot (the slot validateModelCatalog holds today, before the socket listens), and the retirement of the curated catalog asset and its loader. The installer's Codex tier block is rewritten to take its defaults from the same file.

### 6.2 Story E20261024ce99b720:S002

**Owns:** `sc3`
**Depends on:** `sc1`, `sc2`

The handler for models.definitions, the projection of the registry into the result, and re-sourcing providers.listModels for the CLI families from the registry so the two answers agree; the live Ollama listing stays as it is.

### 6.3 Story E20261024ce99b720:S003

**Owns:** `sc5`
**Depends on:** `sc1`, `sc2`

Moving every daemon consumer onto the registry: resolveTier and the role router's default fallback (DEFAULT_TIERS), the summariser fallback (SUMMARISER_CLI_FALLBACK), the effort list (TIER_EFFORTS and the config catalog's effort rows), CliProvider's input budget and effort forwarding (dropping an effort the model does not accept, with a warning naming model and effort), and the runner/CLI-kind literals in routing, provider construction, attribution and workflow code. Also the settings parse and config reconcile rule that stop reading and then remove per-repo tier overrides with a warning naming repo and tier.

### 6.4 Story E20261024ce99b720:S004

**Owns:** `sc4`
**Depends on:** `sc1`, `sc2`, `sc3`

The per-family check procedures (Codex: model list from the CLI plus a run; Claude: a run, input limit from the JSON output, recognised effort names), their serial execution, the approved-model store file under the insrc home and its validation, registering the store with the registry as its approved-model overlay, and the daemon refusing a tier set to an unknown model that has no approved profile.

### 6.5 Story E20261024ce99b720:S005

**Depends on:** `sc3`, `sc4`, `sc5`

The TUI model-tiers pane and its effort cycle driven by models.definitions, the unknown-model check and approval screen, and the repo settings view limited to role-to-tier and the core floor.

### 6.6 Story E20261024ce99b720:S006

**Depends on:** `sc3`, `sc4`, `sc5`

The VS Code model-tier picker driven by models.definitions instead of its runner union and compiled config-catalog effort rows, the unknown-model check and approval prompt, and the Repo Configuration panel without per-tier runner or model fields.

### 6.7 Story E20261024ce99b720:S007

**Depends on:** `sc3`, `sc4`, `sc5`

The JetBrains model-tiers settings section driven by models.definitions instead of ModelTiersModel.PROVIDERS, the unknown-model check and approval dialog, and the per-repo settings without per-tier runner or model fields.

## 7. Non-functional targets

- **Performance:** The definitions file is read and validated once at boot; every later model question is an in-memory lookup on the frozen registry. models.definitions answers without touching a CLI or Ollama.
- **Security:** No cloud REST call is added (k1): checks run only through the installed claude and codex CLIs. The approved-model store is a per-user file under the insrc home, written only by the daemon; clients reach it only through models.approve and models.reject (k2).
- **Observability:** A bad definitions file stops the daemon with a log naming the faulty entry (s1/ac3). Dropping an unsupported effort logs a warning naming the model and effort (s3/ac2). Removing a per-repo tier override logs the repo and tier (s3/ac5). Each unknown-model check logs every CLI call and its verdict.
- **Durability:** Approved profiles survive daemon restarts and insrc updates because they live outside the shipped file and outside config.json; an insrc update that ships a model a user had approved prefers the shipped definition. A malformed approved-model store is reported and ignored rather than stopping the daemon, so a user file can never block startup.

## 8. Rollout

**Phase A — definitions file and registry**

**Stories:** `s1`

s1 owns sc1 and sc2, which every other Story consumes; it has no dependencies.

**Backward compat:** providers.listModels keeps answering the same models for cli-claude and cli-codex: the definitions file starts with exactly the curated catalog's entries, and the catalog's boot slot and fail-fast behaviour are kept.

**Phase B — daemon serves and runs by the definitions**

**Stories:** `s2`, `s3`

Both depend only on s1. s2 adds the models.definitions request and re-sources providers.listModels; s3 moves the daemon's tier resolution, effort forwarding, input limits and runner literals onto the registry and makes tiers global-only.

**Backward compat:** providers.listModels keeps its request and result shape for existing clients. A tier already set in config.json keeps running the same model; only an effort its model does not accept is dropped, with a warning. Per-repo tier overrides are ignored and removed with a logged warning naming repo and tier, never silently.

**Phase C — unknown-model check and approval**

**Stories:** `s4`

s4 depends on s2 (its approved models appear in models.definitions) and must land before the client Stories that drive its check and approval requests.

**Backward compat:** A tier already set to a model outside the definitions keeps running until the user reviews it: the daemon logs that the model has no approved profile rather than stopping existing work at upgrade.

**Phase D — clients render the daemon's definitions**

**Stories:** `s5`, `s6`, `s7`

Each client Story depends on s2, s3 and s4 and on nothing else from the others, so the TUI, VS Code and JetBrains migrations can land in any order.

**Backward compat:** An older plugin keeps working against the new daemon because providers.listModels and the config write path keep their shapes; it simply shows its own lists until updated.

**Ordering rationale:** Owners land before consumers: s1 (sc1, sc2) first; then s2 (sc3) and s3 (sc5), which need only s1; then s4 (sc4), which needs sc3 to expose approved models; then the three clients, which consume sc3, sc4 and sc5. This follows the Epic's dependsOn edges exactly.

**Risky bits**

| Area | Why | Mitigation |
| :--- | :--- | :--- |
| Daemon-wide literal removal (s3) | 30 non-test files import src/config/analyze.ts and 14 carry runner literals; a missed site keeps a stale default or effort and silently disagrees with the definitions. | s3 adds a source scan test that fails on runner or model literals outside the family implementations, and keeps resolveTier's signature so callers change only where they read literals. |
| Upgrade of existing user settings (s3, s4) | Users have per-repo tier overrides and tiers set to models outside the shipped list; removing or refusing them at upgrade could change what runs without notice. | Reconcile removes per-repo overrides only with a logged warning naming repo and tier; a tier on an unlisted model keeps running and is flagged for review rather than refused at upgrade. |
| Claude effort support cannot be confirmed (s4) | No Claude CLI output shows whether a model supports an effort level (evidence def-cli-probes.md probes 7-11), so an approved Claude level may be silently ignored by the model. | Claude levels are shown as recognised with support unconfirmed, and only the user's explicit approval admits them; the approved profile records the CLI version so a re-check can be offered after a CLI update. |

## 9. Alternatives considered

### 9.1 a1: One daemon-held definitions registry grown from the curated catalog — **CHOSEN**

Replace the curated cloud catalog with one shipped definitions file covering all three families, loaded and validated at boot into a daemon registry that every daemon consumer and a new IPC request read, with user-approved profiles held in a separate daemon-owned store merged into the same view.

The existing curated catalog (one JSON asset, a boot-time loader and validator, a frozen cached parse) becomes the single model-definitions file: per family its runner identity and CLI kind, its known models with each model's accepted effort levels and input limit, the tier defaults and the summariser model; Ollama carries family-level facts (runner, default context window) because its installed models are discovered live. The daemon loads it once at boot, before it listens, and refuses to start on a bad file, exactly as the catalog does today. A registry module answers every question the daemon now answers from literals: tier defaults, the summariser model, whether a model accepts an effort, a model's input limit, the runner and CLI kind for a family.

User-approved unknown models are per-user facts, so they live in their own daemon-owned store under the insrc home, never in the shipped file or the user's config.json; the registry presents shipped and approved models as one view, marking approved ones. A new read-only IPC request returns that view, and the existing per-family model-list request is derived from it so the two always agree. The unknown-model check is a daemon IPC flow that probes through the installed CLIs one call at a time and records the user's approval. The TUI and both IDE plugins drop their own runner, model and effort lists and render the IPC answer; tier settings become global-only and stale per-repo tier overrides are removed by the existing config reconcile step.

**Pros:**
- One source for every model fact: a release adds or changes a model by editing one data file and restarting the daemon, with no code change in the daemon or any client.
- Reuses the shipped catalog's file, boot hook, fail-fast validation and frozen cache, so k7's startup behaviour is kept rather than rebuilt.
- Clients reach facts only over IPC (k2), so a new effort level or model no longer needs a VS Code or JetBrains release.
- Shipped facts (k4) and per-user approvals (k5) are kept apart, so updating insrc never overwrites a user's approvals and approvals never leak into the shipped file.

**Cons:**
- Widest migration: 30 non-test files import src/config/analyze.ts and 14 carry runner literals, so the daemon-side cut-over spans several stories.
- Clients that render the IPC answer cannot show model choices while the daemon is down; today the VS Code effort list works offline because it is compiled in.
- Introduces a second persistent store (approved profiles) with its own format, migration and validation.

**Cost estimate:** L

### 9.2 a2: Build-time code generation from one data file

Keep one shipped data file but compile it into generated TypeScript constants that the daemon and the VS Code extension import at build time, with JetBrains reading the same facts over IPC.

A build step turns the shipped definitions file into a generated module of typed constants (families, models, effort levels, limits, tier defaults). The daemon and the VS Code extension import the generated module, so every literal in code is replaced by a typed reference and the compiler catches a removed model. JetBrains, which cannot import TypeScript, receives the same facts over a daemon IPC request.

Unknown-model approvals are handled at runtime by the daemon in a separate store, and the generated constants are merged with them where the daemon resolves a tier. Clients other than VS Code render IPC answers; VS Code uses the generated constants for its lists and asks the daemon only for approved models.

**Pros:**
- Typed references: a model removed from the data file breaks the build where it was used, instead of failing at runtime.
- No startup parse cost and no new boot-time validation path in the daemon.

**Cons:**
- Breaks k2 for VS Code: the extension keeps its own compiled copy, so a model or effort change still needs a VS Code release, the exact drift the Epic removes.
- Two delivery paths for the same facts (generated constants for TypeScript, IPC for JetBrains), so clients can disagree between releases.
- A data-file edit is no longer a data-only change: it needs a regenerated module and a rebuild of every TypeScript consumer, weakening s1/ac2.

**Cost estimate:** M

**Rejected because:** Violates k2 (the VS Code extension keeps a compiled copy of the facts) and only partially meets k4 and k7. Strong typing, but VS Code keeps a compiled copy of the facts, which violates k2 and makes a data edit need a rebuild, partially breaking k4's no-code-change intent.

### 9.3 a3: Definitions seeded into the user's settings

Ship a defaults file whose contents the config reconcile step copies into each user's config.json, then let every consumer read model facts from the settings it already loads.

The shipped defaults describe families, models, effort levels and limits; on daemon boot and update the existing config reconcile step fills those values into the user's config.json, and every consumer reads them through the settings path it already uses. Clients read them through the existing config catalog and config read requests.

User-approved models are added to the same settings section, so shipped and approved models sit side by side, and the per-repo tier override removal is another reconcile rule.

**Pros:**
- Reuses the existing settings load and reconcile path end to end, so few new modules.
- Users can see and edit every model fact in one place.

**Cons:**
- Violates k4: model-level facts would live in the user's config.json, the place the stakeholder ruled out.
- A shipped model update must be merged into every user's edited copy, so the drift the Epic removes moves into each user's settings.
- Users can hand-edit a model's effort levels, so the daemon could again run a model with a capability it lacks.

**Cost estimate:** M

**Rejected because:** Violates k4 (model facts would live in the user's config.json) and only partially meets k5 and k7. Puts model facts in the user's config.json, which k4 rules out, and lets users edit capabilities the daemon then trusts, weakening k5.

### 9.4 a4: Keep facts in place and add a consistency check

Leave the literals where they are and add a test that fails when the daemon, the config catalog, the installer and the clients disagree.

No new source of truth: the existing literals stay in the daemon, the config catalog, the installer and both plugins, and a cross-file test compares them and fails the build when they drift. Per-model effort levels and input limits are added as further literals next to the existing ones.

Unknown models are handled by letting the user pick any effort the CLI recognises, with no stored profile.

**Pros:**
- Smallest change; nothing moves and no client behaviour changes.
- Drift between the existing copies is caught in CI rather than by users.

**Cons:**
- Does not meet k4 or k2: facts stay in code and clients keep their own lists, so every model release still needs code edits in several places and client releases.
- Cannot satisfy s4 or k5: there is nowhere to store a user's approved profile.
- The check only compares copies it knows about, so a new copy added later is not covered.

**Cost estimate:** S

**Rejected because:** Violates k2, k4 and k5: facts stay in code and in each client, and there is nowhere to store an approval. Leaves facts in code and in each client and has nowhere to keep an approval, so it fails k2, k4 and k5.

## 10. References

- **[[c1]]** `prior-artifact` `DEF-ce99b72065d03b1b` — "Approved Define for this Epic (approved with review override 2026-10-25)."
- **[[c2]]** `step-output` `s1` — "HldContext analyze bundles (capability discovery, import graph, structural map, conventions)."
- **[[c3]]** `code` `src/daemon/model-catalog.ts:162` — "export async function validateModelCatalog(): Promise<void> {"
- **[[c4]]** `code` `src/daemon/index.ts:381` — "await validateModelCatalog();"
- **[[c5]]** `code` `src/daemon/index.ts:377` — "missing/malformed catalog asset is a fail-fast startup refusal"
- **[[c6]]** `code` `src/config/analyze.ts:252` — "resolveTier(tiering: TieringOverride, tier: TierName): TierModel"
- **[[c7]]** `doc` `docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/evidence/def-cli-probes.md:40` — "So no Claude CLI run shows whether a given model supports a given level."
- **[[c8]]** `step-output` `s3` — "a1 is the only alternative that satisfies all seven constraints. a2 violates k2 (VS Code keeps a compiled copy) and only partially meets k4 and k7; a3 violates k4 (facts in config.json) and only parti"
- **[[c9]]** `code` `src/daemon/list-models.ts:127` — "const models = deps.catalog().modelsFor(provider).map(toModelInfo);"
- **[[c11]]** `doc` `docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/evidence/def-cli-probes.md:20` — "For codex, a model's accepted levels must therefore come from `codex debug models`"
- **[[c12]]** `code` `src/cli/panes/model-tiers.ts:63` — "tiers[t] = resolveTier(tiering, t);"
