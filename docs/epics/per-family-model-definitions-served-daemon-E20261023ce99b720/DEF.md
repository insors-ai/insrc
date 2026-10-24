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

The facts that describe each model family insrc can run on (the Claude CLI, the Codex CLI and local Ollama) are scattered rather than held in one place. Runner identity and family-specific behaviour are repeated as literal strings and per-family branches across the daemon, the terminal UI and both IDE plugins. Model ids are written in several places: the tier defaults (src/config/analyze.ts:135-137), the config-catalog defaults (src/config/config-catalog.ts:116-118), the summariser fallback (src/analyze/context/shaper-provider.ts:271), the curated catalog asset (src/assets/models/cloud-model-catalog.json:5 and src/assets/models/cloud-model-catalog.json:11) and the installer's Codex tier block (scripts/insrc-daemon-install.sh:295-297, copied at vscode-plugin/assets/insrc-daemon-install.sh:295-297). Reasoning-effort levels are one fixed list shared by every model (src/config/analyze.ts:115), not a per-model fact. Input size is described per family, not per model: every Codex model shares one fixed character budget (CODEX_INPUT_BUDGET_CHARS, src/agent/providers/cli-provider.ts:181, chosen by CLI kind at src/agent/providers/cli-provider.ts:204); no Claude model has one, so Claude's own size refusal decides (classifyInputTooLarge reads its "Prompt is too long" at src/agent/providers/cli-provider.ts:743); and every Ollama model used for analysis gets the one global context window (models.shaper.ollamaNumCtx, default 32768, src/config/analyze.ts:216), passed at src/analyze/context/shaper-provider.ts:267, src/analyze/context/shaper-provider.ts:303, src/analyze/context/driver.ts:531 and src/analyze/context/driver.ts:833. ModelParams.maxInputTokens (src/shared/types.ts:417) is declared but read nowhere. The same fact is therefore stated many times and can drift: a client can offer an effort level or a model the daemon will not honour, or the daemon can run a model with a capability it lacks, and nothing notices. Model releases arrive often (new versions, new effort levels that only some models support), and today each one needs edits in several of the places above before anyone can use it. The clients already take their model lists from the daemon's providers.listModels request (registered at src/daemon/handler-runtime.ts:1430, served from the catalog at src/daemon/list-models.ts:127, and called at vscode-plugin/src/extension.ts:436 and jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersSection.kt:195), but both IDE plugins keep their own runner list (vscode-plugin/src/models/model-tier-picker.ts:30 and vscode-plugin/src/models/model-tier-picker.ts:78-80; jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersModel.kt:34). The effort levels are themselves stated twice in the daemon: as TIER_EFFORTS (src/config/analyze.ts:115) and again as literal enum values in the config catalog's effort rows (src/config/config-catalog.ts:120). The VS Code plugin imports that config catalog into its own bundle (vscode-plugin/src/models/model-tier-picker.ts:25) and takes its effort choices from those rows (vscode-plugin/src/models/model-tier-picker.ts:199), so a new effort level also needs a VS Code release. When a user picks a model that insrc does not know, there is no record of what that model can actually do: a tier stores only a runner (src/config/analyze.ts:107), a model (src/config/analyze.ts:108) and an optional effort (src/config/analyze.ts:111), and a catalog entry only an id (src/daemon/model-catalog.ts:43) and a display name (src/daemon/model-catalog.ts:44), so its effort levels and limits are guessed rather than known. The cost falls on every model update and on every user who switches models: slow, error-prone changes, and settings screens that may not match what actually runs.

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

- `high` The existing curated model catalog keeps its file (src/assets/models/cloud-model-catalog.json), its loader (validateModelCatalog, src/daemon/model-catalog.ts:162) and its boot hook (src/daemon/index.ts:381); its types and validator are extended rather than replaced: today validateShape (src/daemon/model-catalog.ts:107) keeps only id and displayName per entry (src/daemon/model-catalog.ts:141-144) and only the two CLI families (iterated at src/daemon/model-catalog.ts:124 into a map typed to those two at src/daemon/model-catalog.ts:120 and returned at src/daemon/model-catalog.ts:151), so the per-model facts and an Ollama family need new fields in CloudModelCatalogFile (src/daemon/model-catalog.ts:48) and a stricter validateShape. [[c5]]
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

- **ac1:** Given a user selects a model that is not in the definitions for its family, when they ask to use it, then insrc checks the model through its CLI, one check at a time: for the Codex CLI it takes the model's supported effort levels from the CLI's own model list and confirms the model runs; for the Claude CLI it confirms the model runs, reads the model's input limit from the CLI's JSON output, and confirms each claimed effort name is one the CLI recognises, because no Claude CLI output shows whether a given model supports a given level. _(operationalizes `k1`, `k3`)_
- **ac2:** Given the checks have finished, when the results are shown to the user, then each claimed effort level is shown with the CLI's evidence, for Codex as accepted or rejected and for Claude as rejected or as recognised with support the CLI cannot confirm, and the model is not used until the user approves which levels to allow. _(operationalizes `k5`)_
- **ac3:** Given the user approves the checked profile, when a tier is set to that model, then the daemon accepts it with only the effort levels that passed their check and that the user approved. _(operationalizes `k5`)_
- **ac4:** Given the user rejects the profile, or a check cannot reach the CLI, when a tier is set to that model, then the daemon refuses the model and says why. _(operationalizes `k5`)_
- **ac5:** Given the user has approved a checked profile for a model that is not in the shipped definitions, when a client asks the daemon for the model definitions, then that model appears under its family, marked as user-approved, with only its approved effort levels. _(operationalizes `k2`, `k5`)_

**Local constraints:**

- `lc1` (invariant) Checks reach the model only through the installed claude or codex CLI or local Ollama; no provider web API is called. [[c4]]
- `lc2` (invariant) A codex run succeeding at an effort level is not proof the model supports that level; the CLI's own model list is the authority for codex. [[c11]]
- `lc3` (invariant) No Claude CLI run shows whether a model supports an effort level; for a Claude model the user's approval, not a test run, admits each level, and the results say so. [[c15]]

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
- **[[c5]]** `code` `src/daemon/index.ts:377` — "missing/malformed catalog asset is a fail-fast startup refusal"
- **[[c6]]** `stakeholder` `user 2026-10-23` — "no per-repo override, only the model tiers, per-repo can only override the functions these tiers are used for"
- **[[c7]]** `prior-artifact` `docs/standalone/add-per-tier-reasoning-effort-setting-E20261023a27df028/S001/evidence/t8-live-effort.md`
- **[[c8]]** `code` `src/config/analyze.ts:242` — "resolveTiers(tiering: AnalyzeTiering): Record<TierName, TierModel>"
- **[[c9]]** `step-output` `s1`
- **[[c10]]** `analyze-bundle` `s1.analyzeBundles[0]` — "No clear match. Partial, consumer-side slices in vscode-plugin/src/models/model-tier-picker.ts and src/cli/panes/model-tiers.ts."
- **[[c11]]** `doc` `docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/evidence/def-cli-probes.md` — "codex does not reject a known level that a given model does not list (probe 4). For codex, a model's accepted levels must therefore come from `codex debug models`"
- **[[c12]]** `code` `src/cli/panes/model-tiers.ts:63` — "tiers[t] = resolveTier(tiering, t);"
- **[[c13]]** `stakeholder` `user 2026-10-23` — "remove the per-repo override for tiers"
- **[[c14]]** `code` `src/analyze/context/role-router.ts:138` — "const configuredTier: TierModel | undefined = byRepo?.tiers?.[tier] ?? cfg.tiering.tiers?.[tier];"
- **[[c15]]** `doc` `docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/evidence/def-cli-probes.md:40` — "Every recognised level runs without a warning on every model tried (probes 8 to 10), and the output never states the effort used (probe 11). So no Claude CLI run shows whether a given model supports a given level."

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — define (define)

**0 HIGH · 16 MED · 86 LOW** · model `cli-codex:gpt-6.1-sol` · reviewed 2026-10-24T19:07:50.914Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | inventory | MED | assisted | Runner identities and family-specific branches occur separately in the daemon, TUI, VS Code plugin and JetBrains plugin. | VS Code's model-tier-picker.ts:30 defines ModelProvider as 'ollama' \| 'cli-claude' \| 'cli-codex', and JetBrains' ModelTiersModel.kt:34 lists the same providers. However, src/cli/panes/model-tiers.ts:63 only calls resolveTier(tiering, t). The truncated grep supplies documentation and historical test output, with no daemon implementation matches or family-specific branches across the four surfaces. The complete inventory is therefore unverifiable from the supplied evidence. | Gather scoped implementation evidence for runner identities and family-specific branches in each surface, or narrow the premise to the verified plugin provider declarations. |
| 1 | closed-union | MED | assisted | Every Ollama model used for analysis receives the global context window rather than a model-specific context window. | src/analyze/context/shaper-provider.ts:267 and :303 pass cfg.shaper.ollamaNumCtx to the shaper and summariser OllamaProvider constructors. src/analyze/context/driver.ts:531 and :833 pass it to buildProvider only when args.provider is absent. These confirm the shown construction paths, but do not establish the context windows of supplied providers. The grep results are truncated, so they cannot establish the universal claim. No concrete build-breaking contradiction is demonstrated. | Narrow the premise to the verified construction paths, or gather exhaustive source evidence covering analysis providers and overrides. |
| 1 | closed-union | MED | assisted | A tier's stored model selection consists only of runner, model and optional effort. | src/config/analyze.ts:107, :108 and :111 confirm runner, model and optional effort respectively. However, the supplied reads do not show the complete TierModel declaration, and the truncated grep contains no TierModel definition. The claim that these are its only fields is unverifiable. | Supply the complete TierModel declaration to verify exclusivity, or narrow the premise to the three confirmed fields. |
| 1 | closed-union | MED | assisted | A curated catalog model entry contains only id and displayName. | src/daemon/model-catalog.ts:43 confirms `readonly id: string;` and :44 confirms `readonly displayName?: string;`. Neither the complete declaration nor its closing brace is supplied, and the grep results are truncated, so the evidence cannot establish that these are the only fields. | Supply the complete CatalogModel declaration to verify exclusivity, or narrow the premise to the confirmed fields. |
| 1 | semantic | MED | assisted | The current tier-selection and catalog-entry representations do not persist an unknown model's accepted effort levels or input limit. | UNVERIFIABLE: src/config/analyze.ts:107, :108 and :111 show runner, model and optional selected effort; src/daemon/model-catalog.ts:43–44 show id and optional displayName. The supplied reads omit the complete declarations and persistence logic. The truncated grep cannot establish that accepted effort levels and input limits are absent from these representations. | Supply complete declarations and relevant persistence logic, or narrow the premise to the fields directly confirmed by the evidence. |
| 4/c12; s3 | inventory | MED | assisted | The default-resolution migration surface includes every resolveTier caller and every direct DEFAULT_TIERS read. | The grep is truncated at 50 matches and its supplied matches are documentation, so it cannot establish exhaustive source coverage. src/cli/panes/model-tiers.ts:63 confirms `tiers[t] = resolveTier(tiering, t);`. src/config/analyze.ts:242 shows only the resolveTiers declaration, and :135 shows the core default value. These reads do not establish every resolveTier caller or direct DEFAULT_TIERS read. No concrete implementation failure is demonstrated. | Obtain an untruncated source inventory of resolveTier callers and direct DEFAULT_TIERS reads, then reconcile the migration surface; otherwise mark its completeness unverified. |
| 4/c11 | external-contract | MED | assisted | The Claude CLI has no local model-listing command equivalent to codex debug models. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/evidence/def-cli-probes.md:21 states that Claude has no local model-listing command, but the supplied evidence contains no CLI help or probe output establishing that absence or the comparison with `codex debug models`. The external contract is unverifiable from this assertion alone. | Provide CLI command-discovery evidence supporting the premise, or qualify it as a claim reported by the evidence document. |
| s1/c5 | cross-artifact | MED | assisted | Story s1 extends the existing curated-catalog startup-validation mechanism rather than replacing its file, loader or boot hook. | src/daemon/model-catalog.ts:162 declares validateModelCatalog, and src/daemon/index.ts:381 calls it. DEF.md:94 states “Extends: [[c10]] [[c5]]”. However, the supplied evidence contains neither s1/c5's substantive text nor the catalog loader body, so it cannot verify that s1 preserves the existing file, loader and boot hook. The truncated grep results mainly show historical test logs. | Supply the s1/c5 definitions and catalog-loading implementation to verify preservation, or narrow the premise to the verified validator declaration and daemon call. |
| s3 | ordering | MED | assisted | Story s3 depends on story s1 delivering the definitions consumed by runtime model resolution. | DEF.md:88 identifies S001 as shipping model definitions checked by the daemon at startup. DEF.md:123 states “Depends on: `s1`”, but the supplied lines do not identify that declaration as belonging to s3 or establish consumption by runtime model resolution. The full premise is unverifiable. | Supply s3's heading and description alongside its dependency declaration to verify the ordering and runtime consumption claim. |
| s1/ac3 | closed-union | MED | assisted | The definitions format admits only the built-in families and must reject an unknown family at startup. | Unverifiable. DEF.md:100 requires startup rejection of unknown families. src/daemon/model-catalog.ts:48 shows only the CloudModelCatalogFile declaration, and :124 shows iteration over ['cli-claude', 'cli-codex']; neither establishes a closed family type or rejection of unknown keys. The truncated grep supplies no validateShape implementation or startup validation path. | Provide the full family type, validateShape implementation, and startup caller to verify unknown-family rejection. |
| s1/ac1; s1/ac2 | ordering | MED | assisted | A shipped-definition data change becomes available after rebuilding and restarting the daemon without changing application code. | Unverifiable from the supplied evidence. src/daemon/index.ts:381 calls validateModelCatalog(), and src/daemon/model-catalog.ts:162 declares it. DEF.md:98 specifies loading definitions once at startup. The truncated grep includes historical test results describing catalog caching, but no supplied source shows that rebuilding ships changed definitions or that restarting exposes those changes without application-code edits. | Provide targeted evidence for asset copying during build, definition loading during startup, and consumption of the changed data after restart. |
| s2/ac2 | cross-artifact | MED | assisted | The existing per-family model-list response and the new complete-definitions response must derive from the same definitions. | src/daemon/list-models.ts:127 confirms the existing list derives from deps.catalog().modelsFor(provider).map(toModelInfo). DEF.md:114 specifies the proposed complete-definitions response, but supplies no shared-source linkage. Neither s2/ac2 nor implementation of the new response is shown. The truncated matches do not establish that both responses derive from the same definitions; the premise is unverifiable. | Provide s2/ac2 and focused evidence establishing the common definitions source for both responses. |
| s2/ac1; s4/ac5 | cross-artifact | MED | assisted | The complete-definitions response introduced by s2 must support the user-approved unknown models introduced by s4. | DEF.md:149 confirms s4/ac5 requires approved unknown models to appear under their family, marked user-approved, with only approved effort levels. The read at DEF.md:113 is blank and provides no evidence for s2/ac1 or its complete-definitions response. The cross-artifact dependency is therefore unverifiable. | Obtain the text of s2/ac1 and verify that its complete-definitions response accommodates the models required by s4/ac5. |
| s3/ac3 | closed-union | MED | assisted | The exception to s3's removal of daemon runner and model literals is limited to family implementations. | DEF.md:131 explicitly states that no runner or model literals may remain in the named daemon code outside family implementations. However, the grep is truncated at 50 matches and supplies no source matches from src/agent/providers or the relevant daemon code. Matches such as camon/src/camon/addon_runtime.py:88 and docs/daemon.md:380–382 do not establish the runtime exception boundary. Exclusivity is therefore unverifiable; no concrete build-breaking contradiction is demonstrated. | Gather scoped, untruncated evidence covering daemon routing, provider construction, attribution and workflow code, and identify which matching files are family implementations. |
| s3/ac5 | ordering | MED | manual | Existing per-repo tier overrides must be ignored and removed during startup or settings reconciliation with a warning identifying the repo and tier. | src/analyze/context/role-router.ts:138 reads byRepo?.tiers?.[tier] before global tiers, confirming per-repo overrides are currently consumed. DEF.md:133 states the requested ignore/warn/remove behavior, but repeats the requirement rather than proving its implementation or ordering. The truncated grep supplies no startup or reconciliation code establishing removal and warnings. | Ground the startup/settings reconciliation integration point and establish that overrides are ignored before routing, removed from persisted settings, and logged with repo and tier. |
| s5/ac2; s6/ac2; s7/ac2 | cross-artifact | MED | assisted | Each client migration relies on s4's unknown-model checking and approval flow when a user enters an unlisted model. | DEF.md:170 confirms the TUI starts an unknown-model check and presents results for approval; :186 and :202 confirm the extension and plugin show daemon check results and save only after approval. No evidence for s4 was supplied, so the claimed dependency on s4 is unverifiable. | Verify s4 defines the shared checking and approval flow, or narrow the premise to the client behaviors confirmed by the supplied acceptance criteria. |
| 1; s1/ac1 | inventory | LOW | manual | The built-in model families in scope are Claude CLI, Codex CLI and local Ollama. | docs/daemon.md:432–433 lists the runners as `ollama \| cli-claude \| cli-codex`, and docs/daemon.md:488 states that every resolved runner is one of these three, confirming the inventory. | none — verified sound |
| 1 | citation | LOW | manual | Tier defaults contain literal model IDs at src/config/analyze.ts:135-137. | src/config/analyze.ts:135-137 contains literal model values: core uses 'opus', mid uses 'sonnet', and cheap uses 'haiku', each with runner 'cli-claude'. These reads confirm the cited tier defaults. | none — verified sound |
| 1 | citation | LOW | manual | Config-catalog tier defaults contain literal model IDs at src/config/config-catalog.ts:116-118. | src/config/config-catalog.ts:116 defines models.tiers.mid.model with literal default 'sonnet'; :118 defines models.tiers.cheap.model with literal default 'haiku'. These confirm literal model IDs within the cited range. | none — verified sound |
| 1 | citation | LOW | manual | The summariser has a literal fallback model at src/analyze/context/shaper-provider.ts:271. | src/analyze/context/shaper-provider.ts:271 defines `const SUMMARISER_CLI_FALLBACK = { 'cli-claude': 'haiku', 'cli-codex': 'gpt-6-luna' } as const;`, confirming literal fallback models at the cited location. | none — verified sound |
| 1 | citation | LOW | manual | The curated catalog asset contains model IDs at src/assets/models/cloud-model-catalog.json:5 and :11. | Direct reads confirm model IDs in src/assets/models/cloud-model-catalog.json:5 ("claude-opus-5-5") and :11 ("gpt-6-astra"), verifying both cited anchors. | none — verified sound |
| 1 | citation | LOW | manual | The installer's Codex tier defaults at scripts/insrc-daemon-install.sh:295-297 are duplicated in vscode-plugin/assets/insrc-daemon-install.sh:295-297. | scripts/insrc-daemon-install.sh:295-297 and vscode-plugin/assets/insrc-daemon-install.sh:295-297 contain identical cli-codex defaults: core=gpt-6-astra, mid=gpt-6.1-sol, cheap=gpt-6-luna. | none — verified sound |
| 1 | closed-union | LOW | manual | TIER_EFFORTS at src/config/analyze.ts:115 defines one fixed effort-level list shared across models rather than model-specific lists. | src/config/analyze.ts:115 defines the fixed TIER_EFFORTS list ['low', 'medium', 'high', 'xhigh', 'max']; :116 derives TierEffort from it, and :118 validates membership in that list. src/cli/panes/model-tiers.ts:101 constructs EFFORT_CYCLE directly from TIER_EFFORTS without model-specific selection. This confirms the premise. | none — verified sound |
| 1 | citation | LOW | manual | CODEX_INPUT_BUDGET_CHARS is defined at src/agent/providers/cli-provider.ts:181. | The grep match and direct read at src/agent/providers/cli-provider.ts:181 both confirm: export const CODEX_INPUT_BUDGET_CHARS = 1_048_576; | none — verified sound |
| 1 | closed-union | LOW | manual | The input-budget selection at src/agent/providers/cli-provider.ts:204 applies the same character budget to every Codex model by selecting on CLI kind. | src/agent/providers/cli-provider.ts:181 defines CODEX_INPUT_BUDGET_CHARS = 1_048_576. The direct read at :204 assigns this.inputBudgetChars = opts.kind === 'codex' ? CODEX_INPUT_BUDGET_CHARS : undefined, selecting solely by CLI kind and applying the same character budget to every Codex model. | none — verified sound |
| 1 | closed-union | LOW | manual | The Claude branch has no locally enforced model input budget and relies on the Claude CLI's size refusal. | src/agent/providers/cli-provider.ts:204 assigns inputBudgetChars only for Codex, leaving it undefined for Claude. Line 743 recognizes /prompt is too long/i as an oversized-input refusal. The supplied shared-file-t12.json:9 record also reports an actual Claude CLI refusal: approximately 1,171,610 tokens against a 1,000,000-token limit. Together these support the premise. | none — verified sound |
| 1 | citation | LOW | manual | classifyInputTooLarge recognizes Claude's "Prompt is too long" response at src/agent/providers/cli-provider.ts:743. | src/agent/providers/cli-provider.ts:743 contains `if (/prompt is too long/i.test(said)) return {};`, confirming recognition of "Prompt is too long" at the cited location. | none — verified sound |
| 1 | external-contract | LOW | manual | The Claude CLI reports an oversized input with a response recognized as "Prompt is too long". | src/agent/providers/cli-provider.ts:743 recognizes the message with `/prompt is too long/i.test(said)`. docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/measurements/live/repo.run/children/shared-file-t12.json:9 records `claude exited with 1. Prompt is too long` and reports approximately 1,171,610 request tokens against a 1,000,000-token limit, confirming the oversized-input response. | none — verified sound |
| 1 | semantic | LOW | manual | models.shaper.ollamaNumCtx is a global analysis context-window setting whose default is 32768 at src/config/analyze.ts:216. | The read at src/config/analyze.ts:216 confirms `ollamaNumCtx: 32_768`. The supplied DEF.md:262–265 matches document cfg.shaper.ollamaNumCtx being passed to shaper, summariser, and default analysis providers, supporting its shared analysis context-window role. | none — verified sound |
| 1 | inventory | LOW | manual | The global Ollama context-window setting is forwarded at shaper-provider.ts:267, shaper-provider.ts:303, driver.ts:531 and driver.ts:833. | src/analyze/context/shaper-provider.ts:267 and :303 pass cfg.shaper.ollamaNumCtx to OllamaProvider. src/analyze/context/driver.ts:531 and :833 pass the same setting to buildProvider when args.provider is absent. All four supplied source reads confirm the stated forwarding sites. | none — verified sound |
| 1 | citation | LOW | manual | ModelParams declares maxInputTokens at src/shared/types.ts:417. | The grep finds `export interface ModelParams {` at src/shared/types.ts:415 and `maxInputTokens: number;` at src/shared/types.ts:417. The direct read of line 417 confirms the field declaration at the cited location. | none — verified sound |
| 1 | closed-union | LOW | manual | ModelParams.maxInputTokens has no runtime read in src/. | The /maxInputTokens/ probe returned five matches: four in documentation and one in src/ at src/shared/types.ts:417. The direct read confirms that source match is the declaration `maxInputTokens: number;`. No runtime read sites were found in src/. | none — verified sound |
| 1 | citation | LOW | manual | The providers.listModels IPC request is registered at src/daemon/handler-runtime.ts:1430. | The read at src/daemon/handler-runtime.ts:1430 confirms the registration: 'providers.listModels': (params) => listModels(params). | none — verified sound |
| 1 | semantic | LOW | manual | The cloud-provider model-list path at src/daemon/list-models.ts:127 obtains its models from the curated catalog. | src/daemon/list-models.ts:127 reads `deps.catalog().modelsFor(provider).map(toModelInfo)`. The gathered t2-suites.md:167 reports a passing integration test that cloud listModels sources from the real getCuratedCatalog after validateModelCatalog; lines 154–155 report curated lists for both CLI cloud providers. | none — verified sound |
| 1 | citation | LOW | manual | The VS Code extension requests model lists through providers.listModels at vscode-plugin/src/extension.ts:436. | vscode-plugin/src/extension.ts:436 reads `client.rpc<ModelListResult>('providers.listModels', { provider }),`, confirming the extension requests model lists through the cited RPC at the cited location. | none — verified sound |
| 1 | citation | LOW | manual | The JetBrains model-tier section requests daemon model lists at ModelTiersSection.kt:195. | jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersSection.kt:195 iterates ModelTiersModel.PROVIDERS and calls gateway.listModels(provider), confirming the cited model-list request. | none — verified sound |
| 1 | citation | LOW | manual | The VS Code model-tier picker maintains its own runner list at model-tier-picker.ts:30 and :78-80. | vscode-plugin/src/models/model-tier-picker.ts:30 defines ModelProvider as 'ollama' \| 'cli-claude' \| 'cli-codex'; lines 78–80 list those same three provider IDs with picker labels, confirming the cited runner list. | none — verified sound |
| 1 | citation | LOW | manual | The JetBrains model-tier model maintains its own runner list at ModelTiersModel.kt:34. | ModelTiersModel.kt:34 declares `val PROVIDERS: List<String> = listOf("ollama", "cli-claude", "cli-codex")`, confirming the model maintains its own runner/provider list at the cited location. | none — verified sound |
| 1 | citation | LOW | manual | The config catalog repeats effort-level values as literal enums in its effort rows at src/config/config-catalog.ts:120. | src/config/analyze.ts:115 defines TIER_EFFORTS as ['low', 'medium', 'high', 'xhigh', 'max']. src/config/config-catalog.ts:120–122 repeat those values as literal enumValues arrays, with an additional empty-string CLI default, for the core, mid, and cheap effort rows. The read at :120 confirms the cited core row. | none — verified sound |
| 1 | citation | LOW | manual | The VS Code model-tier picker imports the backend config catalog into its bundle at model-tier-picker.ts:25. | vscode-plugin/src/models/model-tier-picker.ts:25 contains `import { CONFIG_CATALOG } from '../../../src/config/config-catalog.js';`, confirming the picker statically imports the backend config catalog as stated. | none — verified sound |
| 1 | citation | LOW | manual | The VS Code model-tier picker derives effort choices from config-catalog rows at model-tier-picker.ts:199. | vscode-plugin/src/models/model-tier-picker.ts:199 returns the matching `models.tiers.${tier}.effort` CONFIG_CATALOG row's enumValues, falling back to []. src/config/config-catalog.ts:120–122 declares the core, mid, and cheap effort rows with enumValues ['', 'low', 'medium', 'high', 'xhigh', 'max']. This confirms the picker derives effort choices from config-catalog rows. | none — verified sound |
| 1 | ordering | LOW | manual | Making a newly added config-catalog effort level selectable in VS Code requires rebuilding and releasing the extension that bundles the catalog. | vscode-plugin/src/models/model-tier-picker.ts:25 statically imports CONFIG_CATALOG from '../../../src/config/config-catalog.js'. Line 199 derives selectable effort values directly from that catalog's enumValues. Exposing an added value therefore requires distributing an extension rebuilt with the updated catalog. | none — verified sound |
| 4/c5 | citation | LOW | manual | validateModelCatalog is the existing curated-catalog loader at src/daemon/model-catalog.ts:162. | src/daemon/model-catalog.ts:162 declares `export async function validateModelCatalog(): Promise<void>`. The supplied t2-suites.md:181 match reports that it resolves and caches the frozen catalog parse; :167 reports getCuratedCatalog integration after validation. These support the cited symbol, location, and loader role. | none — verified sound |
| 4/c5 | citation | LOW | manual | The daemon invokes validateModelCatalog from its startup hook at src/daemon/index.ts:381. | The read of src/daemon/index.ts:381 confirms the cited invocation: `await validateModelCatalog();`. | none — verified sound |
| 4/c5 | citation | LOW | manual | validateShape is defined at src/daemon/model-catalog.ts:107. | The read at src/daemon/model-catalog.ts:107 confirms `function validateShape(parsed: unknown, path: string): CloudModelCatalogFile {`, matching the cited symbol and location. | none — verified sound |
| 4/c5 | closed-union | LOW | manual | validateShape retains only id and displayName when constructing a validated model entry at src/daemon/model-catalog.ts:141-144. | src/daemon/model-catalog.ts:141 constructs a CatalogModel; lines 142–144 select either { id: e['id'], displayName: e['displayName'] } when displayName is a string, or { id: e['id'] } otherwise. Both branches retain only the stated fields. | none — verified sound |
| 4/c5 | inventory | LOW | manual | The existing catalog validator and its returned map cover only the Claude CLI and Codex CLI families. | src/daemon/model-catalog.ts:124 explicitly iterates only ['cli-claude', 'cli-codex']. Line 120 declares frozenProviders as Record<CloudProvider, readonly CatalogModel[]>, and line 151 returns that frozen map as CloudModelCatalogFile['providers'], confirming the stated two-family scope. | none — verified sound |
| 4/c5 | citation | LOW | manual | CloudModelCatalogFile is declared at src/daemon/model-catalog.ts:48. | The grep match and direct read at src/daemon/model-catalog.ts:48 both show `export interface CloudModelCatalogFile {`, confirming the declaration at the cited location. | none — verified sound |
| 4/c5; s1 | ordering | LOW | manual | Preserving the existing catalog loader while adding Ollama and per-model capability facts requires extending CloudModelCatalogFile and validateShape. | src/daemon/model-catalog.ts:48 declares CloudModelCatalogFile; :107 declares validateShape returning that type. The loader constructs Record<CloudProvider, readonly CatalogModel[]> at :120, explicitly iterates only cli-claude and cli-codex at :124, constructs CatalogModel entries at :141, and returns frozen providers typed through CloudModelCatalogFile at :151. These support extending the existing catalog shape and validation path for Ollama and model facts. | none — verified sound |
| k7; c5 | citation | LOW | manual | src/daemon/index.ts:377 describes a missing or malformed curated catalog asset as a fail-fast startup refusal. | The read of src/daemon/index.ts:377 confirms the comment: “missing/malformed catalog asset is a fail-fast startup refusal,” matching the premise. | none — verified sound |
| k7 | ordering | LOW | manual | The daemon awaits validateModelCatalog at index.ts:381 before starting its listener at index.ts:456. | src/daemon/index.ts:381 reads `await validateModelCatalog();`, preceding src/daemon/index.ts:456, which reads `await server.listen();`. Both anchors confirm the stated ordering. | none — verified sound |
| 4/c12; s3/c8 | ordering | LOW | manual | The config-path tier resolver resolveTiers delegates tier-default resolution to resolveTier. | src/config/analyze.ts:242 declares resolveTiers; lines 244–246 call resolveTier(tiering, 'core'), resolveTier(tiering, 'mid'), and resolveTier(tiering, 'cheap'). Line 271 calls resolveTiers(tiering), confirming the config-path delegation. | none — verified sound |
| 4/c12; c12 | citation | LOW | manual | The TUI effective-tier view directly calls resolveTier with tiers[t] = resolveTier(tiering, t) at src/cli/panes/model-tiers.ts:63. | The source grep match and direct read at src/cli/panes/model-tiers.ts:63 both confirm `tiers[t] = resolveTier(tiering, t);`, matching the cited expression and location. | none — verified sound |
| s3/c14; c14 | semantic | LOW | manual | Role routing currently gives a per-repo tier entry precedence over the global tier entry through byRepo?.tiers?.[tier] ?? cfg.tiering.tiers?.[tier]. | The grep match and direct read at src/analyze/context/role-router.ts:138 show `const configuredTier: TierModel \| undefined = byRepo?.tiers?.[tier] ?? cfg.tiering.tiers?.[tier];`, confirming per-repo precedence with the global entry as the nullish fallback. | none — verified sound |
| 4/c11 | external-contract | LOW | manual | The Codex CLI rejects an unknown model with exit status 1. | def-cli-probes.md:11 records `codex exec -m gpt-nonexistent-9 "Reply with: ok"` exiting with status 1 and an unsupported-model error. Line 18 explicitly confirms unknown-model rejection with exit 1. | none — verified sound |
| 4/c11 | external-contract | LOW | manual | The Claude CLI rejects an unknown model with exit status 1. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/evidence/def-cli-probes.md:13 records `claude -p --model claude-nonexistent-9 "Reply with: ok"` exiting with status 1 and a selected-model error. Line 18 confirms unknown-model rejection with exit 1. | none — verified sound |
| 4/c11 | external-contract | LOW | manual | The Codex CLI rejects an unrecognized reasoning-effort value with exit status 1. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/evidence/def-cli-probes.md:10 records `codex exec -m gpt-6.1-sol -c model_reasoning_effort=bogus "Reply with: ok"` exiting with status 1 and reporting `Invalid value: 'bogus'`. Line 19 confirms that Codex rejects unknown effort levels with exit 1. | none — verified sound |
| 4/c11 | external-contract | LOW | manual | The Claude CLI warns about an unrecognized effort value, ignores it and exits successfully. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/evidence/def-cli-probes.md:14 records `claude -p --model sonnet --effort bogus "Reply with: ok"` exiting 0, warning that the unknown effort is ignored in favor of the default, and answering `ok`. Line 19 confirms the warning is on stderr and the exit code is 0. | none — verified sound |
| 4/c11; s4/lc2 | external-contract | LOW | manual | A Codex run can succeed with a recognized effort level absent from that model's listed supported levels. | def-cli-probes.md:9 lists gpt-6-luna's supported levels without ultra. At :12, `codex exec -m gpt-6-luna -c model_reasoning_effort=ultra "Reply with: ok"` exits 0, answers `ok`, and reports `reasoning effort: ultra`. This confirms the premise; :20 records the same conclusion. | none — verified sound |
| 4/c11; s4/ac1 | external-contract | LOW | manual | codex debug models locally returns a model list containing each model's supported reasoning levels. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/evidence/def-cli-probes.md:9 records `codex debug models` exiting 0 and returning a JSON list where each model has `slug`, `visibility`, and `supported_reasoning_levels`, confirming the premise for the probed CLI. | none — verified sound |
| 4/c11; s4/lc2 | semantic | LOW | manual | A successful Codex test run alone is insufficient evidence of model-specific effort support, so the design treats the CLI's model list as authoritative. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/evidence/def-cli-probes.md:12 records a successful gpt-6-luna run with reasoning effort ultra despite ultra being absent from its listed levels. Line 20 explicitly concludes that accepted levels must come from `codex debug models`, confirming the premise. | none — verified sound |
| s4/ac1; s4/ac2; c15 | external-contract | LOW | manual | Claude's unknown-effort warning exposes recognized effort names rather than a model-specific support list. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/evidence/def-cli-probes.md:14 and :31 show identical unknown-effort warnings for sonnet and haiku, listing low, medium, high, xhigh, max. Line 39 explicitly identifies these as CLI effort names rather than per-model support. | none — verified sound |
| c15 | external-contract | LOW | manual | Every recognized effort level exercised by Claude probes 8 through 10 completed without a warning on the model tested. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/evidence/def-cli-probes.md:32–34 records probes 8–10: haiku/xhigh, haiku/max, and opus/max each exited 0 with `ok` and no warning. This confirms the premise for the combinations exercised. | none — verified sound |
| c15 | external-contract | LOW | manual | The Claude JSON output examined in probe 11 does not report the effort level used. | def-cli-probes.md:35 records probe 11's Claude JSON output and explicitly states, “It reports no effort level.” Line 40 reiterates that probe 11 does not state the effort used, confirming the premise. | none — verified sound |
| s4/ac1; s4/lc3; c15 | external-contract | LOW | manual | No Claude CLI run can establish whether a particular model supports a particular recognized effort level. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/evidence/def-cli-probes.md:39 states that valid effort names are model-independent. Line 40 reports that every recognized level runs without warnings on every model tried, output never states the effort used, and explicitly concludes that CLI runs do not reveal model-level effort support. | none — verified sound |
| s4/ac1 | external-contract | LOW | manual | Claude CLI JSON output exposes a model input limit that can be used when constructing an unknown model's capability profile. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/evidence/def-cli-probes.md:35 records a successful Claude JSON probe (exit 0) exposing modelUsage["claude-haiku-5-5"].contextWindow = 1000000 and maxOutputTokens = 128000. Line 41 explicitly identifies these fields as the basis for obtaining a Claude model's input limit, supporting the proposed capability-profile construction. | none — verified sound |
| k1; s4/lc1; c4 | citation | LOW | manual | CLAUDE.md prohibits direct cloud REST access and delegates cloud LLM access to the installed Claude and Codex CLIs. | CLAUDE.md:12 explicitly prohibits direct cloud REST calls and requires cloud LLM access through locally installed `claude` and `codex` CLI binaries via `CliProvider`. src/agent/providers/cli-provider.ts:183 declares `CliProvider implements LLMProvider`. The evidence confirms the premise. | none — verified sound |
| k2; c4 | citation | LOW | manual | CLAUDE.md assigns database ownership to the daemon and requires CLI, MCP and IDE workbench access through IPC. | CLAUDE.md:136 explicitly states: “Daemon owns all DB access — CLI, MCP, and the IDE workbench communicate via IPC only.” This directly confirms every clause of the premise. | none — verified sound |
| k2; c4 | cross-artifact | LOW | manual | The definition-ownership and IPC-only requirement in k2 is traced to c4's daemon-ownership convention. | DEF.md:79 states that k2 assigns definition ownership to the daemon, requires CLI/MCP/IDE access through daemon IPC, and explicitly references [[c4]]. CLAUDE.md:136 confirms the daemon-ownership convention and IPC-only access for those clients. | none — verified sound |
| k3; s4/ac1; c4 | citation | LOW | manual | CLAUDE.md requires sequential awaits for all calls reaching an LLM provider, including local Ollama calls. | CLAUDE.md:122 explicitly prohibits Promise.all for anything reaching an LLM provider, including cloud and local Ollama embed/complete calls, and requires serial for...of with sequential awaits. | none — verified sound |
| Summary; c1 | cross-artifact | LOW | manual | The DEF's seed reference resolves to SPEC-1aa3094047d2617b. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/DEF.md:8 names `SPEC-1aa3094047d2617b` as its seed. docs/standalone/per-family-model-definitions-served-daemon-E202610231aa30940/SPEC.md:1 declares that exact artifact ID, confirming the reference resolves. | none — verified sound |
| E20261023ce99b720:FR001/c1 | cross-artifact | LOW | manual | The seed SPEC requires consolidation of tier defaults, the summariser model, per-model effort levels and input limits into daemon-owned definitions. | SPEC.md:9 explicitly requires daemon-owned definitions and consolidation of tier defaults, the summariser model, per-model effort levels and input limits, with model-level facts stored in a repo-shipped data file. SPEC.md:13 names the daemon as the single authority serving definitions over IPC. DEF.md:28 (FR001) repeats the same required inventory. | none — verified sound |
| E20261023ce99b720:FR003/c1 | cross-artifact | LOW | manual | The seed SPEC requires the TUI and both IDE plugins to obtain definitions over daemon IPC without maintaining their own copies. | SPEC.md:13 explicitly states that the daemon is the single authority and that “the TUI and both IDE plugins read definitions over IPC and keep no copy.” SPEC.md:37 confirms daemon-owned definitions exposed through IPC. DEF.md:30, FR003, preserves that requirement for the terminal UI and both IDE plugins. | none — verified sound |
| E20261023ce99b720:FR005/c1 | cross-artifact | LOW | manual | The seed SPEC requires migration of every hardcoded runner/model string in stages rather than one coordinated consumer release. | SPEC.md:13 explicitly requires every hardcoded runner/model string to be migrated in stages. SPEC.md:31 names “All consumers, delivered in stages,” and :32 rules out “All consumers in one coordinated release.” DEF.md:32 (FR005) preserves that requirement. | none — verified sound |
| 3/c1 | cross-artifact | LOW | manual | The seed SPEC keeps model families, transports and structured-output handling built into code while allowing model-level data to change. | SPEC.md:13 explicitly states that families, transport and structured-output handling stay in code while models are configured through a repo-shipped data file. SPEC.md:33 reinforces this as “Built-in families, configurable models.” | none — verified sound |
| 3/c1 | cross-artifact | LOW | manual | The seed SPEC limits user configuration to model selection and capability overrides rather than configurable family implementations. | SPEC.md:33 identifies “Built-in families, configurable models.” SPEC.md:35 explicitly names “Model selection and capability overrides” and states that built-in families with configurable models is settled, without reopening family extensibility. These lines confirm the premise. | none — verified sound |
| 3/c1 | cross-artifact | LOW | manual | The seed SPEC rejects shared definition packages and client-side mirrors in favor of daemon-owned definitions exposed through IPC. | docs/standalone/per-family-model-definitions-served-daemon-E202610231aa30940/SPEC.md:37 selects “Daemon-owned definitions exposed through IPC”; line 38 explicitly rules out “Shared versioned definition package” and “Mirrored definitions in each consumer”. This confirms the premise. | none — verified sound |
| 3/c3 | cross-artifact | LOW | manual | The seed SPEC requires an explicit capability profile for an unknown model instead of silently inheriting family defaults. | SPEC.md:13 requires an explicit capability profile for any selected model absent from built-in definitions. SPEC.md:39 reiterates this requirement, and SPEC.md:40 explicitly rules out conservative family defaults and inheriting the family's default model profile. | none — verified sound |
| E20261023ce99b720:FR002; k4; c2 | cross-artifact | LOW | manual | Stakeholder citation c2 requests model structure in a separate repo-shipped data file so model-version updates do not require code changes or edits to the user's config.json. | SPEC.md:45 at docs/standalone/per-family-model-definitions-served-daemon-E202610231aa30940/SPEC.md and DEF.md:208 at docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/DEF.md both record c2 requesting model structure in a separate repo config file, excluding the user's config.json, because frequent model-version updates would make code changes cumbersome. Both citations confirm the premise. | none — verified sound |
| E20261023ce99b720:FR004; k5; c3 | cross-artifact | LOW | manual | Stakeholder citation c3 requests testing an unknown model and letting the user approve or reject it. | SPEC.md:46 at docs/standalone/per-family-model-definitions-served-daemon-E202610231aa30940/ and DEF.md:209 at docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/ both identify c3 as stakeholder input from the user and quote: "test and approve or reject the unknown model". This confirms the premise. | none — verified sound |
| c6 | citation | LOW | manual | Stakeholder citation c6 restricts per-repo model configuration to choosing which functions use the global model tiers. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/DEF.md:212 identifies [[c6]] as the stakeholder statement: "no per-repo override, only the model tiers, per-repo can only override the functions these tiers are used for". This confirms the premise. | none — verified sound |
| k6; c13 | citation | LOW | manual | Stakeholder citation c13 explicitly requests removal of per-repo tier overrides. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/DEF.md:219 identifies [[c13]] as a stakeholder citation and explicitly states: "remove the per-repo override for tiers". This confirms the premise. | none — verified sound |
| k6 | semantic | LOW | manual | k6 permits per-repo role-to-tier choices and the core floor while restricting tier runner, model and effort settings to global configuration. | DEF.md:83 explicitly makes runner, model and effort global-only while allowing per-repo role-to-tier choices and the core floor. DEF.md:49 (S003:FR004) requires removing per-repo tier overrides. src/analyze/context/role-router.ts:138 shows the existing override behavior targeted for removal, not a contradiction of the proposed constraint. | none — verified sound |
| c7 | cross-artifact | LOW | manual | Reference c7 resolves to the prior reasoning-effort story's t8-live-effort.md evidence artifact. | The read of docs/standalone/add-per-tier-reasoning-effort-setting-E20261023a27df028/S001/evidence/t8-live-effort.md:1 succeeded and returned '# S001/t8 live CLI effort checks', confirming the cited evidence artifact resolves. | none — verified sound |
| c9 | cross-artifact | LOW | manual | Reference c9 identifies the define workflow's step output s1. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/DEF.md:215 explicitly maps reference c9 to `step-output` `s1`: '- **[[c9]]** `step-output` `s1`'. | none — verified sound |
| c10 | cross-artifact | LOW | manual | Reference c10 identifies the first analyze bundle in define step output s1 as s1.analyzeBundles[0]. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/DEF.md:216 explicitly maps [[c10]] to `analyze-bundle` `s1.analyzeBundles[0]`, confirming the premise. | none — verified sound |
| s1/c10; s2/c10; s3/c10; s5/c10; s6/c10; s7/c10 | cross-artifact | LOW | manual | The c10 analyze bundle reports no clear existing match for centralized model definitions and identifies only partial consumer-side implementations in the VS Code picker and TUI model-tier pane. | DEF.md:216 explicitly records c10, anchored to s1.analyzeBundles[0], as “No clear match. Partial, consumer-side slices in vscode-plugin/src/models/model-tier-picker.ts and src/cli/panes/model-tiers.ts.” The supplied consumer reads show CONFIG_CATALOG imported at model-tier-picker.ts:25 and resolveTier called at model-tiers.ts:63. This verifies what the bundle reports; it does not establish implementation absence across the repository. | none — verified sound |
| s2 | ordering | LOW | manual | Story s2 depends on story s1 delivering startup-loaded model definitions. | DEF.md:88 identifies S001 as “Ship model definitions as data the daemon checks at startup”; DEF.md:108 explicitly states “**Depends on:** `s1`”, supporting the stated dependency ordering. | none — verified sound |
| s4 | ordering | LOW | manual | Story s4 depends on story s2 exposing the daemon's model definitions. | DEF.md:102 identifies S002 as “Ask the daemon for family and model definitions”; DEF.md:141 explicitly records “**Depends on:** `s2`”, confirming the stated ordering. | none — verified sound |
| s5 | ordering | LOW | manual | The TUI migration in story s5 depends on stories s2, s3 and s4. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/DEF.md:163 explicitly states: **Depends on:** `s2`, `s3`, `s4`, confirming the stated dependencies. | none — verified sound |
| s6 | ordering | LOW | manual | The VS Code migration in story s6 depends on stories s2, s3 and s4. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/DEF.md:179 explicitly states: **Depends on:** `s2`, `s3`, `s4`, confirming the stated dependencies for s6. | none — verified sound |
| s7 | ordering | LOW | manual | The JetBrains migration in story s7 depends on stories s2, s3 and s4. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/DEF.md:195 explicitly states: **Depends on:** `s2`, `s3`, `s4`, confirming the stated dependencies. | none — verified sound |
| s1/ac3 | semantic | LOW | manual | A valid tier default must reference a model belonging to that default's own family. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/DEF.md:100 explicitly requires startup rejection when a tier default is not one of that family's models, confirming the stated validity requirement. | none — verified sound |
| E20261023ce99b720:S003:FR001 | cross-artifact | LOW | manual | S003:FR001 assigns runtime consumption of per-model input limits to story s3. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/DEF.md:46 identifies E20261023ce99b720:S003:FR001 and requires that “per-model effort and input limits used at run time come from the definitions,” confirming assignment to story S003 (s3). src/shared/types.ts:417 confirms the maxInputTokens field declaration. | none — verified sound |
| s4/ac1; s4/ac2; s4/ac3 | ordering | LOW | manual | An unknown model's checks and presentation of their evidence must precede user approval and subsequent model use. | DEF.md:31 (FR004) requires CLI checks, presentation of results, and approval before model use. DEF.md:145–147 (s4/ac1–ac3) confirms the ordering: sequential checks; finished results shown with CLI evidence; user approval of allowed levels; daemon acceptance restricted to checked and approved levels. | none — verified sound |
| s4/ac1; s4/lc3 | semantic | LOW | manual | A passed Claude effort check establishes CLI recognition of the effort name rather than model-specific support. | def-cli-probes.md:39 states that `Valid values` lists CLI-recognised effort names and is not model-specific. Line 40 reports that every recognised level runs without warning on every model tried, while output never states the effort used. DEF.md:145 explicitly requires confirming CLI recognition because Claude CLI output does not establish per-model effort support. These lines confirm the premise. | none — verified sound |
| s4/ac2; s4/ac3; s4/lc3 | semantic | LOW | manual | For an unknown Claude model, user approval admits each recognized effort level despite the CLI being unable to confirm model-specific support. | DEF.md:146 explicitly permits user approval of Claude effort levels reported as recognised with model-specific support unconfirmed; DEF.md:147 limits use to checked, approved levels. evidence/def-cli-probes.md:40 confirms recognised levels run without warnings but the CLI cannot establish model-specific effort support. | none — verified sound |
| s4/ac3; s4/ac5 | semantic | LOW | manual | A user-approved unknown-model profile exposes only effort levels that passed the applicable check and were explicitly approved. | DEF.md:147 (s4/ac3) explicitly restricts accepted effort levels to those that passed their check and received user approval. DEF.md:149 (s4/ac5) requires an approved model absent from shipped definitions to appear under its family with only its approved effort levels. Both reads confirm the premise. | none — verified sound |
| s4/ac4 | ordering | LOW | manual | User rejection or inability to reach the CLI blocks use of the unknown model. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/DEF.md:148 explicitly requires the daemon to refuse the model and explain why when the user rejects the profile or a check cannot reach the CLI, confirming the premise. | none — verified sound |
| s4/ac1; s4/lc2 | semantic | LOW | manual | A Codex unknown-model check requires both model-list evidence for supported efforts and a separate confirmation that the model runs. | DEF.md:145 explicitly requires Codex to obtain supported efforts from its model list and separately confirm the model runs. evidence/def-cli-probes.md:9 records the model list's supported_reasoning_levels; :12 records a successful run with an effort absent from that model's listed levels. Line 20 therefore confirms that run success cannot establish supported efforts. | none — verified sound |
| E20261023ce99b720:FR003; s5; s6; s7 | cross-artifact | LOW | manual | The client migrations required by FR003 are assigned to s5 for the TUI, s6 for VS Code and s7 for JetBrains. | DEF.md:30 defines FR003 as requiring the terminal UI and both IDE plugins to obtain family/model descriptions from the daemon. DEF.md:157 assigns the TUI migration to S005; :173 assigns VS Code to S006; :189 assigns JetBrains to S007, confirming the stated mapping. | none — verified sound |
| s5/ac3; s6/ac3; s7/ac3 | cross-artifact | LOW | manual | The TUI, VS Code and JetBrains repo-settings changes must preserve role-to-tier selection while removing per-repo tier runner, model and effort editing under k6. | DEF.md:83 (k6) makes runner, model and effort global-only while retaining per-repo role-to-tier selection and the core floor. DEF.md:171 explicitly preserves role-to-tier editing and excludes repo runner/model/effort editing for the TUI. DEF.md:187 and :203 preserve role-to-tier selection and exclude repo runner/model fields for VS Code and JetBrains; both operationalize k6, which also excludes per-repo effort editing. | none — verified sound |

#### Proposed fixes

- **1** (assisted) — The evidence confirms provider declarations in both plugins but cannot establish the claimed four-surface inventory of identities and branches.
  - option: Retain the premise and obtain scoped source reads showing identities and family-specific branches in all four surfaces.
  - option: Narrow the premise to the verified VS Code and JetBrains provider declarations, removing the unsupported daemon, TUI and branching claims.

- **1** (assisted) — The evidence supports specific constructor arguments, but not every Ollama model used for analysis.
  - edit: `Every Ollama model used for analysis receives the global context window rather than a model-specific context window.` → `The shaper and summariser OllamaProvider constructors at src/analyze/context/shaper-provider.ts:267 and :303 receive cfg.shaper.ollamaNumCtx. The default buildProvider calls at src/analyze/context/driver.ts:531 and :833 also receive this value when args.provider is absent.`
  - option: Apply the narrower wording supported by the supplied source reads.
  - option: Retain the universal claim only after gathering complete source evidence for all analysis provider construction paths, including supplied providers.

- **1** (assisted) — The evidence establishes field presence, but not an exhaustive stored shape.
  - option: Provide the complete TierModel declaration and re-evaluate the exclusivity claim.
  - option: Reword the premise to state that the selection includes runner, model and optional effort, without claiming exclusivity.

- **1** (assisted) — The supplied reads confirm field presence but cannot prove field exclusivity.
  - option: Provide the complete CatalogModel declaration and reassess the exclusivity claim.
  - option: Reword the premise to: “A curated catalog model entry declares id and optional displayName.”

- **1** (assisted) — The evidence confirms individual fields but does not establish the claimed absence of persisted capability metadata.
  - option: Provide complete TierModel and CatalogModel declarations plus the serialization or validation paths needed to verify the persistence claim.
  - option: Reword the premise to state only that the cited tier-selection fields are runner, model and selected effort, and the cited catalog-entry fields are id and displayName.

- **4/c12; s3** (assisted) — The supplied evidence confirms one caller but cannot support an exhaustive inventory or a mechanical correction.
  - option: Retain the complete migration requirement and verify its inventory with untruncated source evidence.
  - option: Reword the premise to identify the confirmed TUI caller and explicitly mark remaining consumer coverage unverified.

- **4/c11** (assisted) — The supplied line repeats the premise without independently demonstrating the external CLI behavior.
  - option: Add versioned Claude CLI help/probe output and the corresponding Codex command output.
  - option: Qualify the premise to say that the cited evidence document reports no Claude local model-listing command.

- **s1/c5** (assisted) — The existing validator and call are supported; the cross-artifact preservation claim needs additional evidence.
  - option: Retain the premise and provide s1/c5 content plus the catalog loader implementation.
  - option: Narrow the premise to the existing validateModelCatalog declaration and its call at src/daemon/index.ts:381.

- **s3** (assisted) — The evidence partially supports the premise but does not safely establish the complete dependency relationship.
  - option: Provide s3's section context confirming its dependency on s1 and use of the definitions.
  - option: Narrow the premise to the dependency relationship once the declaration is verified as belonging to s3.

- **s1/ac3** (assisted) — The supplied evidence establishes the requirement but does not establish or contradict its implementation; no safe artifact correction is supported.
  - option: Supply complete type, validator, and startup-path evidence to verify the premise.
  - option: Reword the premise as an acceptance requirement whose current implementation remains unverified.

- **s1/ac1; s1/ac2** (assisted) — The evidence partially supports startup ordering but cannot establish the complete rebuild-and-restart claim or justify an exact correction.
  - option: Retain the premise and supply build-copy, loader, and consumer evidence demonstrating a data-only update after restart.
  - option: Recast the premise as an acceptance requirement and verify it with a data-only change followed by rebuild and daemon restart.

- **s2/ac2** (assisted) — The existing catalog source is confirmed, but the proposed response's connection to it is not evidenced.
  - option: Retain the requirement and supply ac2 plus implementation or design evidence identifying the common definitions source.
  - option: Explicitly distinguish the verified existing catalog source from the proposed shared-source requirement pending verification.

- **s2/ac1; s4/ac5** (assisted) — The s4 requirement is evidenced, but the s2 contract is missing; no safe exact artifact correction is supported.
  - option: Provide a nonempty read of s2/ac1 to verify the dependency.
  - option: Narrow the premise to the verified s4/ac5 requirement pending evidence for s2/ac1.

- **s3/ac3** (assisted) — The evidence confirms the documented requirement but cannot establish its exhaustive implementation boundary; no evidence-derived artifact correction is safe.
  - option: Retain the premise pending scoped source evidence that verifies the exception boundary.
  - option: Clarify the intended family-implementation boundary in ac3, then verify all relevant literal occurrences against it.

- **s3/ac5** (manual) — The evidence establishes the existing override read but cannot establish the lifecycle integration or ordering; no safe artifact correction follows.
  - option: Retain ac5 and supply targeted startup, reconciliation, persistence, and warning evidence.
  - option: Specify the migration integration and ordering explicitly, then gather evidence for those paths.

- **s5/ac2; s6/ac2; s7/ac2** (assisted) — The client behaviors are supported, but their attribution to s4 requires additional evidence.
  - option: Supply s4 evidence establishing the shared checking and approval flow.
  - option: Reword the premise to describe the verified client acceptance criteria without attributing them to s4.
