<!-- insrc:artifact DEF-ce99b72065d03b1b -->

# Epic: per-family-model-definitions-served-daemon

## Summary

**Flavor:** enhancement
**Seeded from:** `SPEC-1aa3094047d2617b`

insrc will hold one authoritative description of each model family it supports and of the models in it, kept by the background service and shared with every screen that shows or changes model settings. Updating to a new model or version becomes a data change rather than a code change, every client shows exactly what the service will run, and a model insrc does not yet know is checked and approved by the user before it is used.

## Contents

1. [Problem](#1-problem)
2. [Functional requirements](#2-functional-requirements)
3. [Non-goals](#3-non-goals)
4. [Assumptions](#4-assumptions)
5. [Constraints](#5-constraints)
6. [Stories](#6-stories)
7. [References](#7-references)

## 1. Problem

The facts that describe each model family insrc can run on (the Claude CLI, the Codex CLI and local Ollama) are scattered rather than held in one place. Runner identity and family-specific behaviour are repeated as literal strings and per-family branches across the daemon, the terminal UI and both IDE plugins. Model ids are written in several places: the tier defaults (src/config/analyze.ts:135-137), the config-catalog defaults (src/config/config-catalog.ts:116-118), the summariser fallback (src/analyze/context/shaper-provider.ts:271), the curated catalog asset (src/assets/models/cloud-model-catalog.json) and the installer's Codex tier block (scripts/insrc-daemon-install.sh:295-297, copied in vscode-plugin/assets/insrc-daemon-install.sh). Reasoning-effort levels are one fixed list shared by every model (src/config/analyze.ts:115), not a per-model fact. Input size is not described per model at all: every Ollama model gets one global context window (models.shaper.ollamaNumCtx, default 32768, src/config/analyze.ts:216), the CLI families declare none, and ModelParams.maxInputTokens (src/shared/types.ts:417) is declared but read nowhere. The same fact is therefore stated many times and can drift: a client can offer an effort level or a model the daemon will not honour, or the daemon can run a model with a capability it lacks, and nothing notices. Model releases arrive often (new versions, new effort levels that only some models support), and today each one needs edits in several of the places above, and a release of each client that keeps its own list, before anyone can use it. When a user picks a model that insrc does not know, there is no record of what that model can actually do: a tier stores only a runner, a model and an optional effort (src/config/analyze.ts:106-111) and a catalog entry only an id and a display name (src/daemon/model-catalog.ts:42-45), so its effort levels and limits are guessed rather than known. The cost falls on every model update and on every user who switches models: slow, error-prone changes, and settings screens that may not match what actually runs.

## 2. Functional requirements

- **E20261023ce99b720:FR001** — The system keeps one authoritative description of each built-in model family and of the models it offers, including tier defaults, the summariser model, the effort levels each model accepts and its input limit. _(Removes the repeated, drifting statements of the same facts [[c1]].)_
- **E20261023ce99b720:FR002** — Model-level facts can be added or changed without a code change, from a data file shipped with insrc and separate from the user's personal settings. _(Model versions change often [[c2]].)_
- **E20261023ce99b720:FR003** — The terminal UI and both IDE plugins obtain family and model descriptions from the background service and never keep their own copy. _(Keeps what clients show consistent with what runs [[c1]].)_
- **E20261023ce99b720:FR004** — A user-selected model that is not in the shipped descriptions is checked against its CLI for each effort level it claims, the results are shown to the user, and the model is used only after the user approves it. _(Unknown models need an explicit capability profile [[c3]].)_
- **E20261023ce99b720:FR005** — Every place that today names a runner, CLI kind or model by literal string reads it from the shared description instead, migrated in stages. _(All consumers, delivered in stages [[c1]].)_

**s1:**

- **E20261023ce99b720:S001:FR001** — The model definitions for the three built-in families are read from a data file shipped with insrc, separate from the user's settings.
- **E20261023ce99b720:S001:FR002** — An invalid definitions file stops the daemon at startup with a message naming the faulty entry.

**s2:**

- **E20261023ce99b720:S002:FR001** — Clients can request the complete family and model definitions from the daemon.
- **E20261023ce99b720:S002:FR002** — The existing per-provider model list agrees with the full definitions.

**s3:**

- **E20261023ce99b720:S003:FR001** — Tier defaults, the summariser model and per-model effort and input limits used at run time come from the definitions.
- **E20261023ce99b720:S003:FR002** — An effort level a model does not accept is never sent to its CLI.
- **E20261023ce99b720:S003:FR003** — Runner and model names are no longer written as literals across the daemon.
- **E20261023ce99b720:S003:FR004** — A repo can choose only which tier each role uses; per-repo tier runner, model and effort overrides are no longer honoured and are removed from settings.

**s4:**

- **E20261023ce99b720:S004:FR001** — An unknown model is checked against its CLI per claimed effort level and the results are shown to the user.
- **E20261023ce99b720:S004:FR002** — An unknown model is used only with the effort levels the user approved.

## 3. Non-goals

- **User-defined model families or runner implementations.** — Families and their transport stay built in [[c1]].
- **Migrating only the daemon and TUI.** — All consumers are in scope [[c1]].
- **Migrating every consumer in one coordinated release.** — Delivered in stages [[c1]].
- **Keeping model definitions in code.** — A model update must not need a code change [[c2]].
- **Making every model-level fact configurable (transport, structured-output handling).** — Configuration is limited to model selection and capability overrides [[c1]].
- **A shared versioned definition package, or mirrored definitions in each client.** — The daemon is the single authority over IPC [[c1]].
- **Silently treating an unknown model with conservative or inherited family defaults.** — An explicit, user-approved capability profile is required [[c3]].
- **Per-repo overrides of a tier's runner, model or effort.** — Tier settings are global; a repo only chooses which tier a role uses, and existing per-repo tier overrides are removed [[c13]].

## 4. Assumptions

- `high` The existing curated model catalog (src/assets/models/cloud-model-catalog.json, loaded by validateModelCatalog at src/daemon/model-catalog.ts:162) can be extended rather than replaced: it already carries a version field and a boot-time validator, and validateShape (src/daemon/model-catalog.ts:107) reads only id and displayName per entry and covers only the two CLI families, so carrying the per-model facts means adding fields and an Ollama family to that file and a stricter validator, under the same loader and boot hook. [[c5]]
- `high` Each CLI's response to an unknown model or effort is observable: both reject an unknown model with exit 1; codex rejects an unknown effort value with exit 1 while claude warns and exits 0; but codex runs a known effort level that a given model does not list without any error, so a codex model's accepted levels must come from `codex debug models` rather than from a test run. [[c11]]
- `high` The Codex CLI lists its models and each model's supported reasoning levels locally via `codex debug models`; the Claude CLI has no equivalent listing command. [[c11]]
- `high` Tier defaults are resolved through resolveTier, reached both from the config path (resolveTiers) and directly from the TUI's effective-tier view; every caller of resolveTier and every direct read of DEFAULT_TIERS must take the shared description. [[c12]]

## 5. Constraints

| ID | Type | Text | Source |
| :--- | :--- | :--- | :--- |
| `k1` | invariant | No direct cloud REST calls: model probing and listing go only through the locally installed claude and codex CLIs and local Ollama. | [[c4]] |
| `k2` | contract | The daemon owns the definitions; the CLI, MCP server and IDE plugins reach them only over daemon IPC. | [[c4]] |
| `k3` | convention | Probes that reach an LLM provider run serially, never concurrently. | [[c4]] |
| `k4` | stakeholder | Model-level facts live in a repo-shipped data file, not in code and not in the user's config.json. | [[c2]] |
| `k5` | stakeholder | An unknown model is usable only after the user approves its probed capability profile. | [[c3]] |
| `k6` | stakeholder | Tier settings (runner, model and effort) are global only; per-repo configuration may only choose which tier each role uses (and the core floor). Existing per-repo tier overrides are removed. | [[c13]] |
| `k7` | convention | A missing or malformed definitions file is a fail-fast startup refusal, as the curated catalog is today. The daemon awaits validateModelCatalog (src/daemon/index.ts:381) before it starts listening (src/daemon/index.ts:456), so no request is served before the file is validated. | [[c5]] |

## 6. Stories

### 6.1 E20261023ce99b720:S001 — Ship model definitions as data the daemon checks at startup

**User value:** `size: M`

A maintainer can add a new model, a new version or a new effort level by editing one shipped data file, with no code change, and a broken file is caught before the daemon serves anything.

**Extends:** [[c10]] [[c5]]

**Acceptance criteria:**

- **ac1:** Given the shipped definitions describe the Claude CLI, Codex CLI and Ollama families with their models, tier defaults, summariser model, per-model effort levels and input limits, when the daemon starts, then it loads those definitions once and holds them as the single source for every later request. _(operationalizes `k4`)_
- **ac2:** Given a maintainer adds a model with its effort levels to the shipped definitions file and changes nothing else, when the daemon is rebuilt and restarted, then the new model and its effort levels are available without any code change. _(operationalizes `k4`)_
- **ac3:** Given the definitions file is missing, malformed, names an unknown family, or gives a tier default that is not one of that family's models, when the daemon starts, then it refuses to start and logs which entry is wrong. _(operationalizes `k7`)_

### 6.2 E20261023ce99b720:S002 — Ask the daemon for family and model definitions

**User value:** `size: S`

Every client can show exactly the families, models, effort levels and limits the daemon will use, by asking the daemon instead of keeping its own list.

**Depends on:** `s1`

**Extends:** [[c10]]

**Acceptance criteria:**

- **ac1:** Given the daemon is running with valid definitions, when a client asks for the model definitions, then it receives every family with its models, each model's accepted effort levels and input limit, the tier defaults and the summariser model, in a shape that can also carry models the user approves later. _(operationalizes `k2`)_
- **ac2:** Given a client asks for the models of a family, when the existing model-list request is used, then its answer is drawn from the same definitions and agrees with the full definitions answer. _(operationalizes `k2`)_

### 6.3 E20261023ce99b720:S003 — The daemon runs every model by the shared definitions

**User value:** `size: L`

What the daemon actually runs (runner, default model per tier, summariser, effort passed to the CLI) always follows the definitions, so a model update takes effect everywhere at once and nothing runs with an effort level its model does not accept. A repo can still choose which tier each role uses, but no longer changes what a tier runs.

**Depends on:** `s1`

**Extends:** [[c10]] [[c14]] [[c8]]

**Acceptance criteria:**

- **ac1:** Given a tier has no model set in the user's settings, when the daemon resolves that tier, then it uses the tier default from the definitions, not a value written in code. _(operationalizes `k4`)_
- **ac2:** Given a tier is set to a model and an effort level that model does not accept, when the daemon resolves that tier, then it does not pass the unsupported effort to the CLI and logs a warning naming the model and the effort. _(operationalizes `k4`)_
- **ac3:** Given the daemon's routing, provider construction, attribution and workflow code, when they name a runner, CLI kind or model, then they take it from the definitions, and no runner or model name remains as a literal in that code outside the family implementations. _(operationalizes `k4`)_
- **ac4:** Given a repo's settings choose which tier a role uses, when the daemon resolves that role, then the repo's choice of tier applies, while the tier's runner, model and effort come only from the global tier settings and definitions. _(operationalizes `k6`)_
- **ac5:** Given a user's settings still carry a per-repo tier override (a runner, model or effort under a repo), when the daemon starts or its settings are reconciled, then the override is not used, a warning names the repo and tier, and the stale entry is removed from the settings. _(operationalizes `k6`)_

### 6.4 E20261023ce99b720:S004 — Approve an unknown model after checking it against its CLI

**User value:** `size: L`

A user can choose a model insrc does not yet know, see what it actually supports when checked against its CLI, and decide whether to use it, instead of insrc guessing its capabilities.

**Depends on:** `s2`

**Acceptance criteria:**

- **ac1:** Given a user selects a model that is not in the definitions for its family, when they ask to use it, then insrc checks the model through its CLI, one check at a time: for the Codex CLI it takes the model's supported effort levels from the CLI's own model list and confirms the model runs; for the Claude CLI it runs the model once per claimed effort level and records any rejection or warning. _(operationalizes `k1`, `k3`)_
- **ac2:** Given the checks have finished, when the results are shown to the user, then each claimed effort level is shown as accepted or rejected with the CLI's evidence, and the model is not used until the user approves. _(operationalizes `k5`)_
- **ac3:** Given the user approves the checked profile, when a tier is set to that model, then the daemon accepts it with only the effort levels that passed. _(operationalizes `k5`)_
- **ac4:** Given the user rejects the profile, or a check cannot reach the CLI, when a tier is set to that model, then the daemon refuses the model and says why. _(operationalizes `k5`)_
- **ac5:** Given the user has approved a checked profile for a model that is not in the shipped definitions, when a client asks the daemon for the model definitions, then that model appears under its family, marked as user-approved, with only its approved effort levels. _(operationalizes `k2`, `k5`)_

**Local constraints:**

- `lc1` (invariant) Checks reach the model only through the installed claude or codex CLI or local Ollama; no provider web API is called. [[c4]]
- `lc2` (invariant) A codex run succeeding at an effort level is not proof the model supports that level; the CLI's own model list is the authority for codex. [[c11]]

### 6.5 E20261023ce99b720:S005 — Pick tier models and efforts in the TUI from the daemon's definitions

**User value:** `size: M`

In the terminal UI a user only ever sees the models and effort levels the daemon will honour for each family, and can start the approval of an unknown model there.

**Depends on:** `s2`, `s3`, `s4`

**Extends:** [[c10]]

**Acceptance criteria:**

- **ac1:** Given the TUI's model-tiers view is open, when the user changes a tier's family, model or effort, then the choices offered are the ones from the daemon's definitions for that model, and the TUI holds no list of its own. _(operationalizes `k2`)_
- **ac2:** Given the user enters a model that is not in the definitions, when they save it, then the TUI starts the unknown-model check and shows its results for approval. _(operationalizes `k5`)_
- **ac3:** Given the TUI shows a repo's settings, when the user edits model settings for that repo, then only the tier per role can be changed, not a tier's runner, model or effort. _(operationalizes `k6`)_

### 6.6 E20261023ce99b720:S006 — Pick tier models and efforts in VS Code from the daemon's definitions

**User value:** `size: M`

In VS Code settings a user sees the same families, models and effort levels as every other client, taken from the daemon.

**Depends on:** `s2`, `s3`, `s4`

**Extends:** [[c10]]

**Acceptance criteria:**

- **ac1:** Given the VS Code model-tier picker is open, when the user picks a family, model or effort for a tier, then the options come from the daemon's definitions and no runner or model list is kept in the extension. _(operationalizes `k2`)_
- **ac2:** Given the user enters a model that is not in the definitions, when they confirm it, then the extension shows the daemon's check results and saves the model only after the user approves. _(operationalizes `k5`)_
- **ac3:** Given the VS Code Repo Configuration panel is open for a repo, when the user looks for model settings, then it offers only the choice of tier per role, and no per-tier runner or model field for the repo. _(operationalizes `k6`)_

### 6.7 E20261023ce99b720:S007 — Pick tier models and efforts in JetBrains from the daemon's definitions

**User value:** `size: M`

In JetBrains settings a user sees the same families, models and effort levels as every other client, taken from the daemon.

**Depends on:** `s2`, `s3`, `s4`

**Extends:** [[c10]]

**Acceptance criteria:**

- **ac1:** Given the JetBrains model-tiers settings section is open, when the user picks a family, model or effort for a tier, then the options come from the daemon's definitions and no runner or model list is kept in the plugin. _(operationalizes `k2`)_
- **ac2:** Given the user enters a model that is not in the definitions, when they apply it, then the plugin shows the daemon's check results and saves the model only after the user approves. _(operationalizes `k5`)_
- **ac3:** Given the JetBrains settings for a repo are open, when the user looks for model settings, then they offer only the choice of tier per role, and no per-tier runner or model field for the repo. _(operationalizes `k6`)_

## 7. References

- **[[c1]]** `prior-artifact` `SPEC-1aa3094047d2617b`
- **[[c2]]** `stakeholder` `user 2026-10-23` — "models especially their version get updated quite frequently, requiring a code change would be very cumbersome. separate config file in the repo, not user's config.json that stores the model structure"
- **[[c3]]** `stakeholder` `user 2026-10-23` — "test and approve or reject the unknown model"
- **[[c4]]** `doc` `CLAUDE.md` — "No direct cloud REST calls from our process. ... Daemon owns all DB access ... Never Promise.all anything that reaches an LLM provider"
- **[[c5]]** `code` `src/daemon/model-catalog.ts` — "loaded + validated at boot ... so a missing / malformed catalog is a fail-fast startup refusal"
- **[[c6]]** `stakeholder` `user 2026-10-23` — "no per-repo override, only the model tiers, per-repo can only override the functions these tiers are used for"
- **[[c7]]** `prior-artifact` `docs/standalone/add-per-tier-reasoning-effort-setting-E20261023a27df028/S001/evidence/t8-live-effort.md`
- **[[c8]]** `code` `src/config/analyze.ts:242` — "resolveTiers(tiering: AnalyzeTiering): Record<TierName, TierModel>"
- **[[c9]]** `step-output` `s1`
- **[[c10]]** `analyze-bundle` `s1.analyzeBundles[0]` — "No clear match. Partial, consumer-side slices in vscode-plugin/src/models/model-tier-picker.ts and src/cli/panes/model-tiers.ts."
- **[[c11]]** `doc` `docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/evidence/def-cli-probes.md` — "codex does not reject a known level that a given model does not list (probe 4). For codex, a model's accepted levels must therefore come from `codex debug models`"
- **[[c12]]** `code` `src/cli/panes/model-tiers.ts:63` — "tiers[t] = resolveTier(tiering, t);"
- **[[c13]]** `stakeholder` `user 2026-10-23` — "remove the per-repo override for tiers"
- **[[c14]]** `code` `src/analyze/context/role-router.ts:138` — "const configuredTier: TierModel | undefined = byRepo?.tiers?.[tier] ?? cfg.tiering.tiers?.[tier];"

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — define (define)

**0 HIGH · 18 MED · 57 LOW** · model `cli-codex:gpt-6.1-sol` · reviewed 2026-10-24T17:34:34.095Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| 1. Problem | semantic | MED | assisted | Model input limits are currently represented by repeated literals or per-family branches across model consumers. | UNVERIFIABLE: src/shared/types.ts:417 declares `maxInputTokens: number;`, but this does not establish repeated literals or per-family branches in model consumers. The broader probe is truncated at 50 matches; the supplied matches are documentation and recorded outputs, with no consumer implementation reads supporting the premise. No concrete build-breaking contradiction is established. | Gather source matches and surrounding reads showing model-limit literals or family branches in the anchored consumers, or qualify the premise as an unverified hypothesis. |
| 1. Problem; FR002 | semantic | MED | assisted | Adding model versions or capabilities currently requires edits to code-owned model facts in multiple consumers. | The supplied, capped grep results do not establish that adding a model version or capability requires edits in multiple consumers. docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/DEF.md:234 records this same verification gap; :248–249 contain earlier review assertions about SUMMARISER_CLI_FALLBACK and TIER_EFFORTS, but their underlying source reads were not supplied. Neither probe provides direct source evidence connecting a concrete addition to required changes across the named consumers. | Obtain scoped source reads of the named constants and consumers, then demonstrate a concrete addition requiring multiple edits or narrow the premise to the facts those reads establish. |
| 1. Problem; FR004 | semantic | MED | assisted | An unfamiliar user-selected model currently lacks a stored, explicitly approved per-model capability profile. | Unverifiable: src/config/analyze.ts:106 shows only `export interface TierModel {`; src/daemon/model-catalog.ts:40 shows only a catalog-entry comment. Neither read exposes capability fields, persistence, or approval behavior. Both grep results are truncated at 50 matches and predominantly show documentation, so they cannot establish the claimed absence of an approved per-model capability profile. | Inspect the complete model types and model-selection, persistence, and approval paths before retaining this current-state claim. |
| 4. Assumptions/c5 | semantic | MED | assisted | The existing curated model catalog asset and validator can be extended to carry per-model capability facts rather than replaced. | src/daemon/model-catalog.ts:10 identifies the curated JSON asset; :84 names its file; :107 and :162 confirm validateShape and validateModelCatalog exist. However, the supplied reads omit CatalogModel's fields and the validator implementations. The truncated symbol search primarily returns historical test logs. This confirms the existing catalog infrastructure, but does not verify that extending it supports per-model capability facts. | Inspect CatalogModel, the catalog asset, and validator implementations to establish the required extension and any compatibility constraints. |
| s1; k7/c5 | ordering | MED | assisted | The daemon awaits curated catalog validation during startup before the catalog is available to request handlers. | src/daemon/index.ts:380–381 imports validateModelCatalog and awaits it. src/daemon/model-catalog.ts:194 describes a boot-validated accessor, but :201 shows only a throw statement. No supplied source shows when request handling becomes available relative to validation, so the full ordering premise remains unverifiable. | Provide source showing validation completes before request handling becomes available, or narrow the premise to the confirmed await. |
| s2 | ordering | MED | assisted | Story s2 depends on s1 supplying validated daemon-owned model definitions. | DEF.md:108 explicitly records s2's dependency on s1. DEF.md:98 describes daemon startup loading model definitions once and retaining them as the single source for later requests. Neither supplied line establishes validation, so that qualification remains unverifiable. | Remove the unsupported validation qualification or supply evidence that s1 validates the definitions. |
| s1/ac2 | ordering | MED | assisted | Story s1 permits a model and its effort levels to become available through a shipped-data edit followed by rebuild and daemon restart without application-code changes. | src/daemon/model-catalog.ts:10,84,163 confirms the shipped catalog asset and path resolution. DEF.md:99 states the requested edit → rebuild → restart acceptance condition, but does not demonstrate it. The supplied evidence does not show effort-level parsing, downstream consumption, or restart loading, so the complete premise is unverifiable. | Provide source evidence covering effort-level definitions, their consumption, and the build/restart loading path, or explicitly frame this as a required future capability. |
| s3/FR002; s3/ac2 | closed-union | MED | assisted | An effort unsupported by the selected model must never be sent to its CLI, and resolution must warn with the model and effort. | DEF.md:47 and :130 confirm the proposed requirement. src/agent/providers/cli-provider.ts:530 forwards the configured effort into CLI arguments. The supplied evidence contains no resolveTier implementation demonstrating per-model support checks or warnings naming both model and effort; the universal filtering-and-warning claim is therefore unverifiable. This does not establish a defect in the prescribed change. | Clarify that this is proposed behavior and gather resolution-path evidence showing where model-specific effort validation and warning emission will occur. |
| s3/ac5 | ordering | MED | assisted | Startup or settings reconciliation must ignore stale per-repo tier overrides, warn with the repo and tier, and remove the persisted entries. | UNVERIFIABLE: docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/DEF.md:133 repeats ac5's required behavior. docs/daemon.md:474–485 documents per-repo override precedence, but supplies no evidence of stale-entry handling. Both grep results are truncated; no supplied source reads establish parseTieringOverride, startup/reconciliation ordering, repo-and-tier warnings, or persisted removal. | Supply source and test evidence tracing stale per-repo tier overrides through startup/settings reconciliation, exclusion from effective settings, warnings, and persisted deletion. |
| s5/ac1 | closed-union | MED | assisted | The TUI must derive all family, model and effort choices from daemon definitions and retain no independent list. | DEF.md:168 confirms the intended acceptance criterion. DEF.md:249 reports that EFFORT_CYCLE derives from TIER_EFFORTS, but the supplied evidence contains no direct TUI source reads establishing all family, model and effort choice sources or their daemon replacements. All three grep results are truncated. Complete migration coverage is therefore unverifiable; no concrete build-breaking contradiction is established. | Retain the acceptance criterion and obtain direct source evidence covering every TUI choice producer and the daemon definitions response it will consume. |
| s5/ac2 | ordering | MED | assisted | Saving an unknown model in the TUI must start the unknown-model check and show its results for user approval. | DEF.md:169 restates the required save → unknown-model check → results-for-approval sequence, but supplies no implementation grounding. Both grep results are truncated at 50 matches; the supplied matches do not show the TUI save handler, unknown-model check, or approval presentation. The ordering is therefore unverifiable from this evidence. | Gather targeted source reads establishing the TUI save path and its connection to the unknown-model check and approval display, distinguishing existing behavior from behavior to introduce. |
| s5/ac3 | closed-union | MED | assisted | The TUI's per-repo model settings must expose role-to-tier changes without per-tier runner, model or effort editing. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/DEF.md:170 states the requested role-to-tier-only restriction verbatim. However, neither truncated grep provides src/cli implementation evidence establishing the TUI's editable fields or write paths. docs/daemon.md:479 and :485 describe separate role-tier and tier-model resolution, but do not establish TUI restrictions. The premise is therefore unverifiable as an implementation constraint; no concrete build-breaking contradiction is demonstrated. | Obtain focused evidence from the TUI's per-repo model controls and write paths to verify role-to-tier editing and exclusion of runner, model and effort editing. |
| s6/ac1 | closed-union | MED | assisted | The VS Code model-tier picker must derive all family, model and effort choices from daemon definitions and keep no extension-owned runner or model list. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/DEF.md:184 states the requirement, but does not verify its implementation. Both grep results are truncated and provide no source reads from vscode-plugin/src/models/model-tier-picker.ts establishing how family, model and effort options are populated or whether extension-owned lists remain. The premise is unverifiable from the supplied evidence; no concrete build-breaking contradiction is established. | Provide source evidence for the picker, its daemon definitions request and all option-list sources, including any local runner, model or effort lists. |
| s6/ac2 | ordering | MED | assisted | VS Code must show daemon check results for an unknown model and save that model only after explicit user approval. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/DEF.md:185 states the required check-results → user-approval → save ordering. However, the truncated grep provides no relevant implementation evidence, and no read of vscode-plugin/src/models/model-tier-picker.ts was supplied. The ordering is therefore unverifiable; the evidence does not establish a concrete implementation failure. | Gather targeted picker and daemon-handler reads showing how unknown models are checked, results displayed, approval obtained, and persistence gated. |
| s6/ac3 | closed-union | MED | assisted | The VS Code Repo Configuration panel must offer role-to-tier selection without per-repo tier runner or model fields. | Unverifiable: DEF.md:186 states the acceptance criterion itself. docs/daemon.md:474–485 describes backend per-repo tasks and tier overrides, while the S005/LLD.md:241 match describes a PerRepoSection with runner/model editors. Neither establishes the VS Code Repo Configuration panel's controls. The truncated grep provides no implementation evidence for that panel. | Gather the VS Code Repo Configuration panel's rendering and persistence code to verify role-to-tier selection and the exclusion of per-repo runner/model fields. |
| s7/ac1 | closed-union | MED | assisted | JetBrains model-tier settings must derive all family, model and effort choices from daemon definitions and keep no plugin-owned runner or model list. | DEF.md:200 states the intended JetBrains acceptance criterion, but does not verify its implementation or feasibility. Both grep results are truncated at 50 matches and supply no JetBrains settings source establishing family, model and effort selection or the absence of plugin-owned lists. DEF.md:114 describes the planned daemon definitions response only. The premise is unverifiable from the supplied evidence; no concrete build-breaking contradiction is established. | Provide focused reads of the JetBrains model-tier settings, their IPC consumer, and the daemon definitions contract, plus a scoped inventory of plugin-owned runner/model choices. |
| s7/ac2 | ordering | MED | assisted | JetBrains must show daemon check results for an unknown model and save that model only after explicit user approval. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/DEF.md:201 states the required check-results → user approval → save ordering, but supplies no implementation evidence. The grep output is truncated at 50 matches and contains no relevant JetBrains model-settings handler demonstrating that ordering. The premise is therefore unverifiable, with no demonstrated contradiction or concrete build-breaking failure. | Provide targeted evidence for the JetBrains apply handler, daemon check response, result presentation, explicit approval, and subsequent save. |
| s7/ac3 | closed-union | MED | assisted | JetBrains repo settings must offer role-to-tier selection without per-repo tier runner or model fields. | DEF.md:202 repeats the requested role-to-tier-only behavior. The older expose-all-daemon-config-settings-via-E20260919b5f333f8/S005/LLD.md:241,256 describes per-repo runner/model editors, but is design documentation, not current JetBrains implementation evidence. The truncated grep supplies no current settings source or tests establishing the closed field set. The premise is therefore unverifiable; no concrete build-breaking contradiction is established. | Gather current JetBrains repo-settings rendering, persistence, and test evidence to verify role-to-tier selection and exclusion of per-repo runner/model fields. |
| Summary/c1 | cross-artifact | LOW | manual | DEF-ce99b72065d03b1b derives its scope from SPEC-1aa3094047d2617b. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/DEF.md:8 explicitly states **Seeded from:** `SPEC-1aa3094047d2617b`. docs/standalone/per-family-model-definitions-served-daemon-E202610231aa30940/SPEC.md:1 confirms that source artifact's ID as SPEC-1aa3094047d2617b. | none — verified sound |
| s1/FR001 | inventory | LOW | manual | The three built-in model families in scope are Claude CLI, Codex CLI and Ollama. | src/config/analyze.ts:88 defines AnalyzeShaperProviderKind as exactly 'ollama' \| 'cli-claude' \| 'cli-codex'; the validator at line 362 accepts exactly those three values. DEF.md:98 (ac1) explicitly names Claude CLI, Codex CLI and Ollama, confirming the stated scope. | none — verified sound |
| FR003/c1 | inventory | LOW | manual | The settings clients in migration scope are the terminal UI, the VS Code plugin and the JetBrains plugin. | docs/standalone/per-family-model-definitions-served-daemon-E202610231aa30940/SPEC.md:3 explicitly names the TUI, VS Code plugin, and JetBrains plugin as IPC consumers in the staged migration. Line 13 confirms that the TUI and both IDE plugins read daemon-owned definitions over IPC and keep no copy. This confirms the stated migration scope. | none — verified sound |
| 1. Problem; FR005 | semantic | LOW | manual | Runner and CLI-kind identities currently occur as repeated literals and family-specific branches across model consumers. | src/analyze/context/shaper-provider.ts:288–289 and src/daemon/steps/build-step/phases/validate.ts:188–189 repeat CLI runner literals and runner-to-kind conversions. src/agent/providers/cli-provider.ts:230,321,390,461,530 contains Claude-specific branches; src/analyze/context/driver.ts:1102 and src/daemon/list-models.ts:112 branch on 'ollama'. These source matches confirm repeated identities and family-specific branching across model consumers. | none — verified sound |
| 1. Problem; s3/FR001 | semantic | LOW | manual | Current tier defaults contain model and runner literals in application code. | src/config/analyze.ts:134 declares DEFAULT_TIERS. Lines 135–136 initialize core with runner 'cli-claude' and model 'opus', and mid with runner 'cli-claude' and model 'sonnet', confirming model and runner literals in application code. | none — verified sound |
| 1. Problem; s3/FR001 | semantic | LOW | manual | Current summariser selection contains family-specific model literals in application code. | src/analyze/context/shaper-provider.ts:271 defines SUMMARISER_CLI_FALLBACK with family-specific model literals 'haiku' for 'cli-claude' and 'gpt-6-luna' for 'cli-codex'. Line 296 uses that mapping in summariser selection: `const model = usable ? configured : SUMMARISER_CLI_FALLBACK[kind];`. This confirms the premise. | none — verified sound |
| 1. Problem; s3/FR001 | semantic | LOW | manual | Current effort selection uses a fixed shared list rather than a capability list indexed by model. | src/config/analyze.ts:115 defines the fixed TIER_EFFORTS list ['low', 'medium', 'high', 'xhigh', 'max']; :116 derives TierEffort from it, and :118 validates membership against it. src/cli/panes/model-tiers.ts:101 builds EFFORT_CYCLE directly from TIER_EFFORTS; :104–105 shows nextEffort accepts only the current effort and cycles that shared list without model-specific indexing. | none — verified sound |
| FR001/c1 | cross-artifact | LOW | manual | The seed SPEC requires daemon-owned definitions consolidating runner identity, tier defaults, summariser selection, effort capabilities and input limits. | docs/standalone/per-family-model-definitions-served-daemon-E202610231aa30940/SPEC.md:9 explicitly requires daemon-owned built-in definitions consolidating runner identity, tier defaults, summariser fallback, reasoning-effort transport and accepted levels, and input-size limits. This confirms the premise. | none — verified sound |
| FR005/c1 | cross-artifact | LOW | manual | The seed SPEC requires migration of every model consumer in stages rather than in one coordinated release. | SPEC.md:13 explicitly requires every hardcoded runner/model string to be migrated “in stages.” SPEC.md:31 selects “All consumers, delivered in stages,” and SPEC.md:32 explicitly rules out “All consumers in one coordinated release.” These reads from docs/standalone/per-family-model-definitions-served-daemon-E202610231aa30940/SPEC.md confirm the premise. | none — verified sound |
| 3. Non-goals/c1 | cross-artifact | LOW | manual | The seed SPEC keeps family implementations, transport and structured-output handling in code while allowing model-level data to change. | SPEC.md:13 explicitly keeps the three built-in families, transport, and structured-output handling in code while configuring models through the repo-shipped data file. SPEC.md:35 confirms configurable models without reopening family extensibility or migration scope. | none — verified sound |
| FR003; 3. Non-goals/c1 | cross-artifact | LOW | manual | The seed SPEC makes daemon IPC the definitions authority and excludes mirrored client definitions and a shared versioned definitions package. | docs/standalone/per-family-model-definitions-served-daemon-E202610231aa30940/SPEC.md:13 identifies the daemon as the single authority and says clients read definitions over IPC and keep no copy. Line 37 confirms daemon-owned definitions exposed through IPC; line 38 explicitly rules out a shared versioned definition package and mirrored definitions in each consumer. | none — verified sound |
| FR004; 3. Non-goals/c1 | cross-artifact | LOW | manual | The seed SPEC requires probing and explicit user approval for unfamiliar models instead of inheriting family capability defaults. | SPEC.md:13 explicitly requires CLI probing for each claimed effort level, displaying results, and user approval or rejection for models absent from built-in definitions. SPEC.md:39 requires an explicit capability profile, and :40 rules out conservative family defaults and inheriting the family's default model profile. | none — verified sound |
| FR002; k4/c2 | cross-artifact | LOW | manual | The stakeholder statement cited as c2 requires model structure in a repo-shipped data file separate from the user's config.json so model updates do not require code changes. | DEF.md:207 and SPEC.md:45 both identify c2 as the stakeholder statement from user 2026-10-23 and explicitly request a separate repo config file, distinct from the user's config.json, to store model structure because frequent model/version updates would make code changes cumbersome. | none — verified sound |
| FR004; k5/c3 | cross-artifact | LOW | manual | The stakeholder statement cited as c3 requires the user to approve or reject an unknown model after testing it. | DEF.md:208 and SPEC.md:46 both identify c3 as stakeholder input from user 2026-10-23 and quote: "test and approve or reject the unknown model". This confirms the premise. | none — verified sound |
| c6 | cross-artifact | LOW | manual | The stakeholder statement cited as c6 restricts per-repo model configuration to assigning functions to global tiers. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/DEF.md:211 identifies c6 as the stakeholder statement from user 2026-10-23: "no per-repo override, only the model tiers, per-repo can only override the functions these tiers are used for". This confirms that per-repo configuration is limited to assigning functions to global tiers. | none — verified sound |
| k6/c13 | cross-artifact | LOW | manual | The stakeholder statement cited as c13 explicitly requires removal of per-repo tier overrides. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/DEF.md:218 identifies [[c13]] as stakeholder input from user 2026-10-23 and explicitly states: "remove the per-repo override for tiers". | none — verified sound |
| k1; s4/lc1/c4 | citation | LOW | manual | CLAUDE.md prohibits direct cloud REST calls and requires cloud LLM access through the locally installed Claude and Codex CLIs. | CLAUDE.md:12 explicitly prohibits direct cloud REST calls and requires cloud LLM access through the locally installed claude and codex CLI binaries via CliProvider. CLAUDE.md:137 reiterates this rule. src/agent/providers/cli-provider.ts:183 confirms that CliProvider implements LLMProvider. | none — verified sound |
| k2/c4 | citation | LOW | manual | CLAUDE.md gives the daemon exclusive database ownership and requires CLI, MCP and IDE workbench database access to use daemon IPC. | CLAUDE.md:136 explicitly states: “Daemon owns all DB access” and requires CLI, MCP, and IDE workbench communication via IPC only. CLAUDE.md:132 independently confirms that CLI/MCP/workbench never open LMDB or LanceDB directly and always use daemon IPC. | none — verified sound |
| k3/c4 | citation | LOW | manual | CLAUDE.md requires sequential awaits for every operation reaching an LLM provider, including local Ollama calls. | CLAUDE.md:122 explicitly prohibits Promise.all for anything reaching an LLM provider, including cloud and local Ollama embed/complete calls, and requires serial for...of with sequential awaits. This directly confirms the premise. | none — verified sound |
| k7/c5 | citation | LOW | manual | src/daemon/model-catalog.ts documents missing or malformed catalog data as a fail-fast daemon startup refusal. | src/daemon/model-catalog.ts:12 documents loading and validation at boot; :14 explicitly calls a missing/malformed catalog a “fail-fast startup refusal.” Line 160 states missing/unreadable and non-JSON/schema-invalid files both throw, supported by ModelCatalogValidationError at :67 and throws at :171 and :178. | none — verified sound |
| s1/ac1/c5 | semantic | LOW | manual | The existing curated catalog accessor serves a cached frozen parse populated by boot-time validation. | src/daemon/model-catalog.ts:97 identifies the cache as the frozen, boot-validated catalog, undefined until validateModelCatalog runs. Line 181 populates it with `cached = validateShape(parsed, path);`, and line 206 reads it with `const catalog = cached;`. These lines support the premise. | none — verified sound |
| c8 | citation | LOW | manual | src/config/analyze.ts:242 declares resolveTiers(tiering: AnalyzeTiering): Record<TierName, TierModel>. | The grep match and direct read at src/config/analyze.ts:242 both confirm: function resolveTiers(tiering: AnalyzeTiering): Record<TierName, TierModel> { | none — verified sound |
| 4. Assumptions/c12 | ordering | LOW | manual | The config resolution path invokes resolveTiers, which resolves its tier entries through resolveTier. | src/config/analyze.ts:271 calls resolveTiers(tiering). Its declaration at :242 resolves core, mid, and cheap through resolveTier at :244–246, confirming the stated resolution chain. | none — verified sound |
| c12 | citation | LOW | manual | src/cli/panes/model-tiers.ts:63 directly assigns tiers[t] = resolveTier(tiering, t) in the TUI's effective-tier computation. | The source grep match and direct read at src/cli/panes/model-tiers.ts:63 both confirm `tiers[t] = resolveTier(tiering, t);`, exactly as cited. | none — verified sound |
| 4. Assumptions/c12 | closed-union | LOW | manual | Migrating tier defaults requires covering every resolveTier caller and every direct DEFAULT_TIERS read, including the TUI path outside resolveTiers. | src/config/analyze.ts:244–246 calls resolveTier for core, mid, and cheap; :254 reads DEFAULT_TIERS[tier] as its fallback. The TUI independently calls resolveTier at src/cli/panes/model-tiers.ts:63 and directly initializes from DEFAULT_TIERS at :59. src/analyze/context/role-router.ts:139 also directly reads DEFAULT_TIERS[tier]. These confirm the migration must cover callers and direct reads, including the TUI path outside resolveTiers. The capped DEFAULT_TIERS grep does not establish an exhaustive inventory, but the premise claims no fixed inventory. | none — verified sound |
| c14 | citation | LOW | manual | src/analyze/context/role-router.ts:138 resolves configuredTier from the repo tier override before the global tier setting. | The grep match and direct read at src/analyze/context/role-router.ts:138 both show `const configuredTier: TierModel \| undefined = byRepo?.tiers?.[tier] ?? cfg.tiering.tiers?.[tier];`, confirming the repo tier override takes precedence, with the global tier setting as the nullish fallback. | none — verified sound |
| s3/FR004; s3/ac5 | semantic | LOW | manual | Existing persisted per-repo tier settings can contain runner, model or effort fields that the proposed migration must identify and remove. | src/config/analyze.ts:155 types byRepo entries as TieringOverride, and :433 parses each per-repo entry with parseTieringOverride. Line 398 constructs tier settings with runner and model fields. Line 370 explicitly detects and ignores models.byRepo[repo].tiers[tier].effort, confirming persisted per-repo settings can contain stale effort fields even though they are ineffective at runtime. | none — verified sound |
| s2/FR002; s2/ac2 | semantic | LOW | manual | The daemon already exposes a per-provider model-list request that the proposed full-definitions response must agree with. | src/daemon/handler-runtime.ts:1430 registers 'providers.listModels' and delegates to listModels(params). src/daemon/list-models.ts:100 confirms the exported async function; :127 reads deps.catalog().modelsFor(provider).map(toModelInfo), confirming provider-specific catalog results. These source reads support the existing request as a consistency target for the proposed response. | none — verified sound |
| c7 | cross-artifact | LOW | manual | Reference c7 identifies the prior reasoning-effort story's t8-live-effort.md as an existing evidence artifact. | DEF.md:212 identifies [[c7]] as a prior-artifact pointing to docs/standalone/add-per-tier-reasoning-effort-setting-E20261023a27df028/S001/evidence/t8-live-effort.md. The target exists: line 1 reads '# S001/t8 live CLI effort checks'. | none — verified sound |
| c9; c10 | cross-artifact | LOW | manual | The analysis evidence cited as c10 is identified as the first analyze bundle of step-output s1 cited as c9. | DEF.md:214 identifies c9 as `step-output` `s1`; DEF.md:215 identifies c10 as `analyze-bundle` `s1.analyzeBundles[0]`, confirming it is the first analyze bundle of that step output. | none — verified sound |
| s1; s2; s3; s5; s6; s7/c10 | cross-artifact | LOW | manual | The cited analysis bundle reports no clear existing implementation match and supplies partial consumer implementations as extension evidence for s1, s2, s3, s5, s6 and s7. | DEF.md:215 identifies c10 as the analyze-bundle s1.analyzeBundles[0] and quotes: "No clear match. Partial, consumer-side slices in vscode-plugin/src/models/model-tier-picker.ts and src/cli/panes/model-tiers.ts." DEF.md:94, :110, :125, :164, :180 and :196 explicitly cite c10 under Extends for s1, s2, s3, s5, s6 and s7 respectively, confirming the premise about the bundle's reported findings and use as extension evidence. | none — verified sound |
| c10 | inventory | LOW | manual | The two partial consumer implementations named by c10 are vscode-plugin/src/models/model-tier-picker.ts and src/cli/panes/model-tiers.ts. | The direct read of docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/DEF.md:215 confirms c10 explicitly names both paths as “Partial, consumer-side slices.” Source matches at src/cli/panes/model-tiers.ts:19,63 additionally confirm that consumer imports and calls resolveTier. | none — verified sound |
| 4. Assumptions/c11 | external-contract | LOW | manual | The probed Codex CLI rejects an unknown model with exit status 1. | def-cli-probes.md:3 identifies the probed version as codex-cli 0.164.0. Line 11 records `codex exec -m gpt-nonexistent-9 "Reply with: ok"` returning exit status 1 with a model-not-supported error, confirming the premise. | none — verified sound |
| 4. Assumptions/c11 | external-contract | LOW | manual | The probed Claude CLI rejects an unknown model with exit status 1. | def-cli-probes.md:3 identifies Claude Code 2.1.287 as the probed version. Line 13 records `claude -p --model claude-nonexistent-9 "Reply with: ok"` exiting with status 1 and a selected-model error, confirming the premise. | none — verified sound |
| 4. Assumptions/c11 | external-contract | LOW | manual | The probed Codex CLI rejects an unrecognized reasoning-effort value with exit status 1. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/evidence/def-cli-probes.md:10 records `codex exec -m gpt-6.1-sol -c model_reasoning_effort=bogus "Reply with: ok"` exiting with status 1 and reporting `Invalid value: 'bogus'`, confirming the premise. | none — verified sound |
| 4. Assumptions/c11 | external-contract | LOW | manual | The probed Claude CLI warns about an unrecognized effort value, ignores it, runs with its default effort and exits successfully. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/evidence/def-cli-probes.md:14 records probe 6 with --effort bogus: Claude warns that it is ignoring the unknown value and using default effort, answers ok, and exits 0. Line 19 confirms the warning is on stderr and the exit status is 0. | none — verified sound |
| 4. Assumptions/c11 | external-contract | LOW | manual | The probed Codex CLI successfully runs a recognized effort level even when that effort is absent from the selected model's advertised supported levels. | def-cli-probes.md:9 lists gpt-6-luna's advertised reasoning levels without ultra. Line 12 records `codex exec -m gpt-6-luna -c model_reasoning_effort=ultra "Reply with: ok"` exiting 0, answering `ok`, and reporting `reasoning effort: ultra`, confirming the premise. | none — verified sound |
| 4. Assumptions; s4/ac1/c11 | external-contract | LOW | manual | The probed Codex CLI exposes a local codex debug models command whose model records include supported_reasoning_levels. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/evidence/def-cli-probes.md:9 records `codex debug models` exiting 0 and returning a JSON list whose model records include `slug`, `visibility`, and `supported_reasoning_levels`, confirming the premise. | none — verified sound |
| s4/lc2/c11 | external-contract | LOW | manual | Codex model-specific effort acceptance must be determined from the CLI's model list because a successful execution does not establish model support for that effort. | def-cli-probes.md:20 reports that Codex does not reject a known effort level absent from a model's list and identifies `codex debug models` as authoritative. DEF.md:154 states the same invariant under lc2/c11. Both support the premise. | none — verified sound |
| 4. Assumptions/c11 | external-contract | LOW | manual | The probed Claude CLI has no local model-listing command equivalent to codex debug models. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/evidence/def-cli-probes.md:21 explicitly states that Claude has no local model-listing command, confirming the premise about the probed CLI. | none — verified sound |
| s3 | ordering | LOW | manual | Story s3 depends on s1 supplying the definitions used for runtime model resolution. | DEF.md:123 explicitly records “Depends on: s1” for s3. DEF.md:98 states that the daemon loads the shipped family/model definitions once and retains them as the single source for every later request, supporting the stated dependency. | none — verified sound |
| s4 | ordering | LOW | manual | Story s4 depends on s2 supplying the definitions interface that can expose approved unknown models. | DEF.md:141 explicitly makes s4 depend on s2. At DEF.md:114, s2/ac1 supplies a definitions interface capable of carrying later user-approved models. At DEF.md:149, s4/ac5 requires that interface to expose approved models absent from shipped definitions, confirming the dependency. | none — verified sound |
| s5 | ordering | LOW | manual | Story s5 requires s2's definitions interface, s3's runtime resolution and s4's unknown-model approval flow. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/DEF.md:162 explicitly states “**Depends on:** `s2`, `s3`, `s4`”, confirming the stated dependency ordering. | none — verified sound |
| s6 | ordering | LOW | manual | Story s6 requires s2's definitions interface, s3's runtime resolution and s4's unknown-model approval flow. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/DEF.md:178 explicitly states “**Depends on:** `s2`, `s3`, `s4`”, confirming s6's stated dependency ordering. | none — verified sound |
| s7 | ordering | LOW | manual | Story s7 requires s2's definitions interface, s3's runtime resolution and s4's unknown-model approval flow. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/DEF.md:194 explicitly lists **Depends on:** `s2`, `s3`, `s4`, confirming the stated ordering dependencies for s7. | none — verified sound |
| FR001; s1/ac1; s2/ac1 | inventory | LOW | manual | The proposed shared definitions contain family identity, model membership, tier defaults, summariser selection, per-model accepted effort levels and per-model input limits. | DEF.md:28 (FR001) explicitly includes family/model identity, tier defaults, summariser model, per-model accepted effort levels and input limits. DEF.md:98 (s1/ac1) names the Claude CLI, Codex CLI and Ollama families and repeats that inventory; :114 (s2/ac1) requires clients to receive those fields. These reads confirm the proposed inventory. | none — verified sound |
| s1/ac1 | semantic | LOW | manual | Story s1 requires definitions to be loaded once at daemon startup and retained as the authority for every subsequent definitions request. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/DEF.md:98 explicitly states ac1 requires loading definitions once when the daemon starts and holding them as the single source for every later request, operationalizing k4. This directly confirms the premise's stated requirement. | none — verified sound |
| s1/ac3 | inventory | LOW | manual | Story s1 requires startup refusal for missing definitions, malformed definitions, an unknown family or a tier default outside its family's model membership. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/DEF.md:100 explicitly requires daemon startup refusal when definitions are missing, malformed, name an unknown family, or specify a tier default outside that family's models, confirming all four conditions in the premise. | none — verified sound |
| s2/ac1; s4/ac5 | semantic | LOW | manual | The full-definitions response must represent both shipped models and later user-approved models under their families. | DEF.md:114 (docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/DEF.md) requires every family with its models in a response shape supporting later user approvals. The same file at :149 explicitly requires an approved model absent from shipped definitions to appear under its family, marked user-approved, with only approved effort levels. These acceptance criteria confirm the premise. | none — verified sound |
| s2/ac2 | semantic | LOW | manual | The existing per-provider model-list response and the new full-definitions response must derive from the same definitions. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/DEF.md:115 explicitly requires the existing model-list answer to be drawn from the same definitions and agree with the full-definitions answer, operationalizing k2. This confirms the prescribed consistency requirement; it does not claim shared sourcing is already implemented. | none — verified sound |
| s3/FR001; s3/ac1 | semantic | LOW | manual | Story s3 requires runtime defaults, summariser selection, effort capabilities and input limits to derive from definitions, including fallback when the user's tier has no model. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/DEF.md:46 explicitly requires runtime tier defaults, the summariser model, and per-model effort and input limits to come from definitions (S003:FR001). Line 129 explicitly requires a tier with no model in user settings to resolve to the default from definitions (ac1, operationalizing k4). These reads confirm the premise. | none — verified sound |
| FR005; s3/ac3 | closed-union | LOW | manual | The literal-removal requirement covers daemon routing, provider construction, attribution and workflow code while exempting family implementations. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/DEF.md:32 defines FR005 as replacing literal runner, CLI-kind and model names with shared descriptions. The same file at :131 (ac3) explicitly covers daemon routing, provider construction, attribution and workflow code, with an exception for family implementations. These reads confirm the stated requirement; the truncated greps do not establish an exhaustive occurrence inventory. | none — verified sound |
| k6; s3/ac4 | closed-union | LOW | manual | Per-repo tier configuration may select role-to-tier assignments and the core floor, while runner, model and effort come exclusively from global settings and definitions. | DEF.md:83 explicitly requires global-only runner/model/effort and removal of existing per-repo tier overrides; DEF.md:132 states the corresponding acceptance check. role-router.ts:111 and :120 confirm separate per-repo roleTiers and coreFloor resolution. Line :138 currently prefers byRepo.tiers, identifying existing behavior the proposed change must remove. The premise is sound as the intended configuration contract. | none — verified sound |
| s4/ac1 | ordering | LOW | manual | Unknown-model checks run serially, using Codex's model list plus a model execution for Codex and one execution per claimed effort with warning capture for Claude. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/DEF.md:145 explicitly requires checks “one check at a time,” Codex model-list lookup plus execution, and one Claude execution per claimed effort with rejection or warning capture. The supplied evidence/def-cli-probes.md:9 and :20 also support using Codex's model list as the authority for supported effort levels. This confirms the prescribed ordering and checks; it does not establish implementation completion. | none — verified sound |
| s4/ac2 | semantic | LOW | manual | Unknown-model results must classify every claimed effort as accepted or rejected and retain CLI evidence for the user. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/DEF.md:146 explicitly requires each claimed effort level to be shown as accepted or rejected with the CLI's evidence, confirming the premise. | none — verified sound |
| s4/ac2; s4/ac4 | ordering | LOW | manual | An unknown model remains unusable before approval and must be refused with a reason after rejection or when its CLI cannot be reached. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/DEF.md:146 (ac2) explicitly states that the model is not used until the user approves. Line 148 (ac4) requires the daemon to refuse the model and say why when the user rejects the profile or a check cannot reach the CLI. These confirm the premise's approval ordering and refusal conditions. | none — verified sound |
| s4/FR002; s4/ac3; s4/ac5 | semantic | LOW | manual | An approved unknown-model profile restricts execution and the advertised capability set to effort levels that passed checks and were approved by the user. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/DEF.md:54 restricts unknown-model use to user-approved effort levels; :147 restricts daemon acceptance to effort levels that passed checks; :149 requires the advertised model definitions to expose only approved effort levels. Together these confirm the premise as a specified requirement. | none — verified sound |

#### Proposed fixes

- **1. Problem** (assisted) — The evidence establishes a type field but does not establish how consumers represent or select input limits.
  - option: Retain the premise pending targeted consumer source evidence demonstrating repeated literals or per-family branches.
  - option: Reword the premise as an unverified hypothesis requiring a consumer inventory before prescribing consolidation.

- **1. Problem; FR002** (assisted) — The multi-consumer requirement remains unverifiable; the supplied evidence does not support an exact factual replacement.
  - option: Retain the premise pending direct source evidence demonstrating one concrete model or capability addition that requires multiple consumer edits.
  - option: Reframe the premise as a hypothesis to verify before using it to justify the design.

- **1. Problem; FR004** (assisted) — The supplied evidence neither confirms nor contradicts the semantic absence claim; no mechanical correction is supported.
  - option: Gather source evidence covering model profiles, persistence, and approval, then reassess the premise.
  - option: Reframe the approved per-model profile as a proposed requirement and mark its current absence as unverified.

- **4. Assumptions/c5** (assisted) — The premise is plausible but its extension claim is not established by the supplied evidence; no concrete build-breaking contradiction is shown.
  - option: Retain the premise after gathering the model shape, validator bodies, and representative asset entries.
  - option: Reword it as a proposed reuse approach whose capability schema and compatibility remain to be validated.

- **s1; k7/c5** (assisted) — The await is confirmed; request-handler startup ordering is not shown.
  - option: Supply startup and request-listener source establishing the ordering.
  - option: Narrow the premise to: src/daemon/index.ts awaits validateModelCatalog().

- **s2** (assisted) — The dependency and daemon ownership are supported; validation is not established by the supplied evidence.
  - option: Reword the premise to describe s1 supplying daemon-loaded model definitions held as the single source for later requests.
  - option: Retain the premise and provide evidence that s1 validates the model definitions.

- **s1/ac2** (assisted) — The evidence establishes the catalog location and acceptance requirement, but cannot establish data-only extensibility for models and effort levels.
  - option: Retain ac2 as an acceptance requirement and add implementation evidence demonstrating the complete data-only update path.
  - option: Qualify the premise as intended behavior to be implemented and verified by Story s1.

- **s3/FR002; s3/ac2** (assisted) — The requirement is explicit, but the supplied evidence does not establish its enforcement or the relevant closed set of supported efforts.
  - option: Retain this as an explicit acceptance requirement and identify the resolution change needed to enforce it.
  - option: Provide targeted reads of resolveTier, model effort definitions, and warning emission to verify the complete enforcement path.

- **s3/ac5** (assisted) — The supplied evidence neither verifies nor contradicts the required behavior; no mechanical artifact correction is supported.
  - option: Retain ac5 and gather implementation/test evidence covering all required effects and their ordering.
  - option: Clarify that ac5 specifies behavior to implement, then require verification of startup and settings reconciliation paths.

- **s5/ac1** (assisted) — The requirement is clear, but the evidence does not establish exhaustive source coverage. No mechanical artifact correction is supported.
  - option: Keep ac1 and supply direct reads tracing every TUI family, model and effort choice to its proposed daemon source.
  - option: Mark exhaustive migration coverage as unverified until the TUI choice producers and daemon response contract are inspected.

- **s5/ac2** (assisted) — The evidence establishes the acceptance requirement but cannot establish implementation reachability or ordering; no mechanical correction is supported.
  - option: Retain the criterion and supply targeted source evidence for the save, check, and approval sequence.
  - option: Clarify that this sequence is new behavior to implement, with its integration points established before building.

- **s5/ac3** (assisted) — The evidence establishes the acceptance requirement, but does not establish the TUI implementation; no mechanical correction is supported.
  - option: Retain the requirement and gather targeted src/cli evidence before treating its grounding as verified.
  - option: Explicitly frame the premise as a prospective acceptance requirement grounded in DEF.md:170, with implementation verification pending.

- **s6/ac1** (assisted) — The supplied evidence repeats the acceptance criterion without grounding the picker implementation; no safe artifact correction follows.
  - option: Supply focused picker and daemon API source reads to verify the requirement's implementation basis.
  - option: Retain the acceptance criterion and mark its implementation grounding unverified until focused evidence is available.

- **s6/ac2** (assisted) — The requirement is documented, but implementation grounding is missing; no evidence-derived text correction is safe.
  - option: Retain the acceptance criterion and obtain targeted implementation evidence for the ordering.
  - option: Explicitly describe the ordering as required new behavior pending implementation verification.

- **s6/ac3** (assisted) — The supplied evidence cannot support a mechanical correction or establish a concrete implementation failure.
  - option: Keep the criterion and gather the VS Code panel implementation evidence.
  - option: Clarify that this is a proposed UI requirement, and document the panel changes needed to satisfy it.

- **s7/ac1** (assisted) — Additional implementation evidence is needed; no evidence-derived artifact correction is safe.
  - option: Gather focused JetBrains settings and IPC source evidence alongside the daemon definitions contract.
  - option: Retain the acceptance criterion as proposed behavior and mark its implementation grounding unverified pending those probes.

- **s7/ac2** (assisted) — The supplied acceptance criterion establishes intent but does not verify the implementation ordering; no mechanical correction is supported.
  - option: Gather targeted implementation reads showing the complete check → display → approval → save sequence.
  - option: Clarify that this is a new behavior to implement and require an acceptance test proving that saving is withheld until explicit approval.

- **s7/ac3** (assisted) — The evidence establishes the acceptance requirement but does not verify its implementation; no mechanical artifact correction is supported.
  - option: Retain the acceptance criterion and gather current JetBrains source and tests before judging it verified.
  - option: Clarify that this is required future behavior, with implementation verification pending JetBrains evidence.
