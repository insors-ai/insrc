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

**0 HIGH · 18 MED · 67 LOW** · model `cli-codex:gpt-6.1-sol` · reviewed 2026-10-24T18:46:16.414Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | inventory | MED | assisted | Runner identities and family-specific branches are duplicated across the daemon, TUI, VS Code plugin and JetBrains plugin. | vscode-plugin/src/models/model-tier-picker.ts:30 declares 'ollama' \| 'cli-claude' \| 'cli-codex', and ModelTiersModel.kt:34 repeats those identities in PROVIDERS. model-tier-picker.ts:78 also lists Ollama. These reads confirm duplicated provider identities in the two plugins, but do not establish family-specific branches or duplication in src/daemon and src/cli. The truncated grep results provide no direct source evidence for those remaining claims. | Narrow the premise to the confirmed plugin identity duplication, or gather targeted source evidence for daemon/TUI identities and family-specific branches across all four surfaces. |
| 1 | inventory | MED | assisted | Model-ID literals occur in tier defaults, config-catalog defaults, the summariser fallback, the curated catalog asset and installer tier blocks. | Model literals are confirmed at src/config/analyze.ts:135 ('opus'), src/config/config-catalog.ts:116 ('sonnet'), src/analyze/context/shaper-provider.ts:271 ('haiku' and 'gpt-6-luna'), and scripts/insrc-daemon-install.sh:295 ('gpt-6-astra'). However, src/assets/models/cloud-model-catalog.json:1 shows only '{', and vscode-plugin/assets/insrc-daemon-install.sh:1 shows only a shebang. The truncated grep results do not establish model literals in those two files. The full inventory is therefore unverifiable, not contradicted. | Gather focused model-ID reads from the curated catalog asset and the plugin installer tier blocks, or narrow the premise to the four demonstrated locations. |
| 1 | closed-union | MED | assisted | Claude models have no insrc-side input budget and rely on the Claude CLI to refuse oversized input. | src/agent/providers/cli-provider.ts:204 sets inputBudgetChars to CODEX_INPUT_BUDGET_CHARS only for codex and otherwise undefined, confirming Claude has no declared provider input budget. The supplied evidence does not show oversized Claude input handling or establish reliance on CLI refusal. | Narrow the premise to the verified budget assignment, or provide evidence of Claude oversized-input handling. |
| 1 | closed-union | MED | assisted | Every Ollama model used for analysis receives the global models.shaper.ollamaNumCtx value rather than a per-model context limit. | src/analyze/context/shaper-provider.ts:267 and :303 pass cfg.shaper.ollamaNumCtx to the shaper and summariser OllamaProvider constructors. src/analyze/context/driver.ts:531 and :833 pass the same value to buildProvider, whose constructor at :1091 forwards numCtx. These support the shown default paths, but :531 and :833 also accept args.provider, whose configuration is not supplied. The context-limit search is truncated, so the evidence does not establish the universal claim. No concrete build-breaking failure is demonstrated. | Narrow the premise to the verified construction paths, or gather evidence covering injected providers and all buildProvider callers before retaining “Every”. |
| 1 | citation | MED | assisted | The existing daemon model-list surface is providers.listModels, referenced at src/daemon/list-models.ts:127. | src/daemon/list-models.ts:127 maps deps.catalog().modelsFor(provider) through toModelInfo; it does not show registration of providers.listModels. docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S001/evidence/t2-suites.md:166 records a passing handler-delegation test, but the truncated matches contain no current handler source. The model-list concept is supported; the exact current IPC surface remains unverified. | Cite the current providers.listModels handler registration, or narrow the premise to the implementation shown. |
| 1 | closed-union | MED | assisted | The existing clients obtain their model lists from the daemon through providers.listModels. | Unverifiable: src/daemon/list-models.ts:127 maps deps.catalog().modelsFor(provider), but shows no client call. The reads at vscode-plugin/src/models/model-tier-picker.ts:1 and jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersModel.kt:1 contain only a comment opener and package declaration. The truncated grep supplies historical test logs, including t2-suites.md:166 describing handler delegation, but no source call sites establishing that all existing clients use providers.listModels. | Gather source call sites for CLI, VSCode, and JetBrains model-list retrieval, plus the daemon handler registration, before asserting a shared route. |
| 1 | citation | MED | auto | The VS Code picker imports the daemon effort list at model-tier-picker.ts:25 and uses that compiled list at :199. | model-tier-picker.ts:25 imports CONFIG_CATALOG, not TIER_EFFORTS. At :199 it returns the matching models.tiers.${tier}.effort catalog entry's enumValues, falling back to []. src/config/analyze.ts:115 defines TIER_EFFORTS, but the supplied evidence does not establish that the catalog derives its enumValues from that list. This is an inaccurate description; no concrete build failure is established. | Correct the premise to describe the verified catalog import and enumValues lookup. |
| 1 | ordering | MED | assisted | Making a newly added effort level available in the existing VS Code picker requires rebuilding and releasing the plugin because its effort list is compiled into the plugin. | model-tier-picker.ts:25 imports CONFIG_CATALOG from '../../../src/config/config-catalog.js'; line 199 retrieves effort enumValues from that catalog. These lines establish the list's source, but do not establish how the catalog is packaged or whether adding an effort level requires rebuilding and releasing the plugin. | Verify the plugin's build and distribution behavior, or narrow the premise to the demonstrated catalog lookup. |
| 1 | closed-union | MED | assisted | TierModel stores only a runner, model and optional effort, without a model capability profile. | src/config/analyze.ts:106 declares TierModel; reads at :107, :108 and :111 confirm runner, model and optional effort. The complete interface body is not provided, and the field grep is truncated, so the evidence cannot establish that these are its only fields or exclude a capability profile. | Provide the complete TierModel declaration to verify the exclusion, or narrow the premise to the three confirmed fields. |
| 1 | closed-union | MED | assisted | A current model-catalog entry stores only id and displayName. | src/daemon/model-catalog.ts:42 identifies CatalogModel; reads at :43 and :44 confirm readonly id: string and readonly displayName?: string. The supplied evidence omits the complete interface body and closing brace, so it cannot establish that these are the only fields. | Supply the complete CatalogModel declaration to verify exclusivity, or narrow the premise to the two confirmed fields. |
| 1 | semantic | MED | assisted | Selecting an unknown model currently creates no record of that model’s supported effort levels and input limit. | UNVERIFIABLE: src/config/analyze.ts:107–108 and :111 show runner, model and an optional selected effort, but do not establish whether supported efforts or input limits are recorded elsewhere during selection. src/daemon/model-catalog.ts:43–44 show only id and displayName. The maxInputTokens declaration at src/shared/types.ts:417 has no supplied connection to unknown-model selection. The truncated TierModel search cannot establish absence across that flow. | Supply complete relevant type definitions and the unknown-model selection and persistence paths to establish whether capability metadata is recorded. |
| 1 | closed-union | MED | assisted | The existing model-selection path does not validate an effort level against the selected model’s own supported levels. | Unverifiable. src/config/analyze.ts:115 defines TIER_EFFORTS, but does not show how validation uses it. Line 242 shows only the resolveTiers signature; src/daemon/model-catalog.ts:43 shows only an id field. No cli-provider.ts implementation was supplied, and the truncated grep provides no relevant validation evidence. | Obtain focused reads of model selection, effort validation, CLI argument construction, and catalog capability fields before asserting that model-specific validation is absent. |
| 1 | closed-union | MED | assisted | Introducing each new model release currently requires editing multiple hardcoded model-definition locations before it can be used. | src/config/analyze.ts:135 hardcodes core model 'opus'; src/config/config-catalog.ts:116 defines a string model setting defaulting to 'sonnet'; src/analyze/context/shaper-provider.ts:271 hardcodes summariser fallbacks; scripts/insrc-daemon-install.sh:295 hardcodes 'gpt-6-astra'. These establish hardcoded identifiers, but do not establish that each new release requires multiple edits before use. The catalog read at src/assets/models/cloud-model-catalog.json:1 contains only '{', and both grep results are truncated and dominated by documentation. The claimed requirement is unverifiable; no concrete build-breaking failure is established. | Narrow the premise to the verified hardcoded defaults and fallbacks, or gather model-selection and validation evidence demonstrating why each new release requires multiple edits before use. |
| 4/c5 | inventory | MED | assisted | The existing catalog validator accepts only the Claude and Codex CLI families. | src/daemon/model-catalog.ts:124 explicitly loops over ['cli-claude', 'cli-codex'], but the supplied evidence omits surrounding validation and return logic. It establishes those two iteration targets, not whether other families are rejected, ignored, or preserved. Line 48 establishes only the CloudModelCatalogFile declaration. | Narrow the premise to the verified iteration targets, or obtain the validator body to verify exclusive acceptance. |
| c5 | citation | MED | assisted | src/daemon/model-catalog.ts:12 documents boot-time catalog validation as a fail-fast refusal for a missing or malformed catalog. | src/daemon/model-catalog.ts:12 confirms only that the catalog is “loaded + validated at boot.” The supplied source evidence does not establish fail-fast refusal for missing or malformed catalogs. DEF.md:211 repeats that claim, but does not independently verify it; the grep results are truncated. | Read the surrounding source comment and validation/boot error handling to verify startup refusal, or narrow the premise to boot-time loading and validation. |
| 4/c12 | closed-union | MED | assisted | Migrating all tier-default consumers requires covering every resolveTier caller and every direct DEFAULT_TIERS read. | src/cli/panes/model-tiers.ts:63 confirms `tiers[t] = resolveTier(tiering, t);`. src/config/analyze.ts:242 confirms the resolveTiers declaration, and :135 shows the core default. However, the grep is truncated at 50 matches and the supplied matches are documentation, so it does not establish exhaustive source coverage of resolveTier callers or direct DEFAULT_TIERS reads. The closed-union claim is unverifiable; no concrete build-breaking contradiction is demonstrated. | Gather an untruncated source inventory of resolveTier callers and DEFAULT_TIERS reads, then verify each consumer's migration coverage. |
| c10 | closed-union | MED | assisted | The existing code has no complete implementation of the proposed authoritative family-and-model definitions, as reported by analyze bundle c10. | DEF.md:216 confirms c10 reports “No clear match” and partial consumer-side slices. That supports the bundle's reported uncertainty, but does not establish implementation absence. The definitions-name grep finds only DEF.md:292, a prior review entry; the CloudModelCatalogFile/DEFAULT_TIERS search is truncated. src/daemon/model-catalog.ts:43, :48 and src/config/analyze.ts:135 show an id field, an interface declaration and one tier default, insufficient to establish whether a complete authoritative implementation exists. | Qualify the premise as the bundle's inconclusive finding, or gather source-level evidence establishing the missing authoritative definitions. |
| c10 | citation | MED | assisted | The consumer-side partial implementations named by c10 exist in vscode-plugin/src/models/model-tier-picker.ts and src/cli/panes/model-tiers.ts. | Reads at vscode-plugin/src/models/model-tier-picker.ts:1 and src/cli/panes/model-tiers.ts:1 confirm both paths exist, but expose only opening comments. DEF.md:216 repeats c10's claim. The truncated grep provides no implementation evidence from either file, so their claimed consumer-side partial implementations remain unverifiable. | Read the relevant implementation bodies to substantiate c10, or narrow the premise to confirmed file existence. |
| 1 | inventory | LOW | manual | The supported built-in model families are Claude CLI, Codex CLI and local Ollama. | src/agent/providers/cli-provider.ts:68 defines CliKind = 'claude' \| 'codex', and :183 declares CliProvider implements LLMProvider. src/agent/providers/ollama.ts:163 declares OllamaProvider implements LLMProvider. docs/daemon.md:69–70 identifies local Ollama and the cli-claude / cli-codex runners, confirming the three named built-in families. | none — verified sound |
| 1 | citation | LOW | manual | src/config/analyze.ts:135-137 contains hardcoded model IDs for tier defaults. | The supplied reads confirm hardcoded tier model IDs at src/config/analyze.ts:135–137: core uses 'opus', mid uses 'sonnet', and cheap uses 'haiku', each with runner 'cli-claude'. | none — verified sound |
| 1 | citation | LOW | manual | src/config/config-catalog.ts:116-118 contains model IDs in config-catalog defaults. | src/config/config-catalog.ts:116 defines models.tiers.mid.model with default 'sonnet'; line 118 defines models.tiers.cheap.model with default 'haiku'. The cited range contains model IDs in config-catalog defaults. | none — verified sound |
| 1 | citation | LOW | manual | src/analyze/context/shaper-provider.ts:271 contains a hardcoded summariser fallback model. | The supplied read of src/analyze/context/shaper-provider.ts:271 confirms: const SUMMARISER_CLI_FALLBACK = { 'cli-claude': 'haiku', 'cli-codex': 'gpt-6-luna' } as const; These are hardcoded summariser fallback models. | none — verified sound |
| 1 | citation | LOW | manual | The curated model catalog is stored in src/assets/models/cloud-model-catalog.json. | src/daemon/model-catalog.ts:10 identifies src/assets/models/cloud-model-catalog.json as the maintainer-curated JSON asset. The read of src/assets/models/cloud-model-catalog.json:1 succeeds and returns '{', confirming the file exists at the cited path. | none — verified sound |
| 1 | citation | LOW | manual | scripts/insrc-daemon-install.sh:295-297 contains a hardcoded Codex tier block. | scripts/insrc-daemon-install.sh:295-297 hardcodes three cli-codex tiers: core uses gpt-6-astra, mid uses gpt-6.1-sol, and cheap uses gpt-6-luna. The cited lines confirm the premise. | none — verified sound |
| 1 | semantic | LOW | manual | vscode-plugin/assets/insrc-daemon-install.sh contains a copy of the installer’s Codex tier defaults. | scripts/insrc-daemon-install.sh:295 and vscode-plugin/assets/insrc-daemon-install.sh:295 both contain the identical Codex core default: "core": { "runner": "cli-codex", "model": "gpt-6-astra" }, confirming the copied default. | none — verified sound |
| 1 | closed-union | LOW | manual | Reasoning-effort choices are defined by one fixed list at src/config/analyze.ts:115 rather than by individual models. | src/config/analyze.ts:115 defines TIER_EFFORTS as ['low', 'medium', 'high', 'xhigh', 'max']; :116 derives TierEffort from that list, and :118 validates membership. src/cli/panes/model-tiers.ts:101 constructs EFFORT_CYCLE directly from TIER_EFFORTS, and :105 cycles it without model-specific selection. These matches confirm the shared fixed list governs effort choices. | none — verified sound |
| 1 | citation | LOW | manual | CODEX_INPUT_BUDGET_CHARS is defined at src/agent/providers/cli-provider.ts:181. | The grep match and direct read at src/agent/providers/cli-provider.ts:181 both confirm: export const CODEX_INPUT_BUDGET_CHARS = 1_048_576; | none — verified sound |
| 1 | closed-union | LOW | manual | All Codex models receive the same character input budget because src/agent/providers/cli-provider.ts:204 selects that budget by CLI kind. | src/agent/providers/cli-provider.ts:181 defines CODEX_INPUT_BUDGET_CHARS = 1_048_576. The supplied read at :204 assigns this.inputBudgetChars using only opts.kind === 'codex', confirming the same character input budget for all Codex models. | none — verified sound |
| 1 | citation | LOW | manual | models.shaper.ollamaNumCtx has a default value of 32768 at src/config/analyze.ts:216. | src/config/analyze.ts:216 contains `ollamaNumCtx: 32_768`, confirming the cited default value of 32768 and location. | none — verified sound |
| 1 | citation | LOW | manual | src/analyze/context/shaper-provider.ts:267 passes the global Ollama context-window setting. | src/analyze/context/shaper-provider.ts:267 reads `return new OllamaProvider(ollamaModel, local.host, cfg.shaper.ollamaNumCtx);`, confirming that the constructor receives the configured global shaper context-window setting. | none — verified sound |
| 1 | citation | LOW | manual | src/analyze/context/shaper-provider.ts:303 passes the global Ollama context-window setting. | src/analyze/context/shaper-provider.ts:303 reads `return new OllamaProvider(cfg.summariserModel, local.host, cfg.shaper.ollamaNumCtx);`, confirming that the summariser constructor receives the global shaper context-window setting. | none — verified sound |
| 1 | citation | LOW | manual | src/analyze/context/driver.ts:531 passes the global Ollama context-window setting. | src/analyze/context/driver.ts:531 reads `const provider = args.provider ?? buildProvider(localToolLoopModel(cfg), cfg.shaper.ollamaNumCtx);`, confirming that the default provider construction passes the global shaper context-window setting. | none — verified sound |
| 1 | citation | LOW | manual | src/analyze/context/driver.ts:833 passes the global Ollama context-window setting. | src/analyze/context/driver.ts:833 reads `const provider = args.provider ?? buildProvider(localToolLoopModel(cfg), cfg.shaper.ollamaNumCtx);`, confirming that the fallback provider construction receives the global shaper Ollama context-window setting. | none — verified sound |
| 1 | citation | LOW | manual | ModelParams declares maxInputTokens at src/shared/types.ts:417. | The supplied grep identifies `export interface ModelParams {` at src/shared/types.ts:415 and `maxInputTokens: number;` at src/shared/types.ts:417. The direct read of line 417 confirms the declaration, verifying the cited field and location. | none — verified sound |
| 1 | closed-union | LOW | manual | No source code reads ModelParams.maxInputTokens. | The /\\bmaxInputTokens\\b/ probe returned five matches: four in documentation and one in source at src/shared/types.ts:417. The supplied read confirms that source match is the declaration `maxInputTokens: number;`, not a read site. No source read sites were found. | none — verified sound |
| 1 | citation | LOW | manual | The VS Code model-tier picker maintains its own runner list at src/models/model-tier-picker.ts:30 and :78-80. | vscode-plugin/src/models/model-tier-picker.ts:30 defines ModelProvider as 'ollama' \| 'cli-claude' \| 'cli-codex'; lines 78–80 list matching picker entries for Ollama, Claude CLI, and Codex CLI, confirming the premise. | none — verified sound |
| 1 | citation | LOW | manual | The JetBrains plugin maintains its own runner list at ModelTiersModel.kt:34. | jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersModel.kt:34 defines its own provider/runner list: `val PROVIDERS: List<String> = listOf("ollama", "cli-claude", "cli-codex")`, confirming the premise. | none — verified sound |
| 4/c5 | citation | LOW | manual | validateModelCatalog is the existing curated-catalog loader at src/daemon/model-catalog.ts:162. | src/daemon/model-catalog.ts:162 declares `export async function validateModelCatalog(): Promise<void>`. docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S001/evidence/t2-suites.md:181 records a passing test that it loads a valid catalog fixture and caches the frozen parse, corroborating the stated role. | none — verified sound |
| 4/c5 | citation | LOW | manual | validateShape is the existing curated-catalog shape validator at src/daemon/model-catalog.ts:107. | src/daemon/model-catalog.ts:107 declares `function validateShape(parsed: unknown, path: string): CloudModelCatalogFile`, confirming the cited symbol and location. The source match at line 181 calls it as `cached = validateShape(parsed, path);`, supporting its role in catalog validation. | none — verified sound |
| 4/c5 | semantic | LOW | manual | validateShape retains only id and displayName when constructing validated catalog entries at src/daemon/model-catalog.ts:141-144. | src/daemon/model-catalog.ts:141–144 constructs a CatalogModel as { id: e['id'], displayName: e['displayName'] } when displayName is a string, otherwise { id: e['id'] }. These object literals retain only id and optional displayName, confirming the premise. | none — verified sound |
| 4/c5 | citation | LOW | manual | CloudModelCatalogFile is declared at src/daemon/model-catalog.ts:48. | The grep match and direct read at src/daemon/model-catalog.ts:48 both show `export interface CloudModelCatalogFile {`, confirming the declaration at the cited location. | none — verified sound |
| k7 | ordering | LOW | manual | The daemon awaits validateModelCatalog at src/daemon/index.ts:381 before beginning to listen at :456. | src/daemon/index.ts:381 contains `await validateModelCatalog();`, preceding `await server.listen();` at src/daemon/index.ts:456, confirming the stated ordering. | none — verified sound |
| k7 | semantic | LOW | manual | A missing or malformed curated catalog prevents daemon startup rather than allowing requests to be served. | src/daemon/index.ts:381 awaits validateModelCatalog() before server.listen() at :456. The supplied S001/evidence/t2-suites.md:182–184 records passing tests confirming that missing, non-JSON, and schema-invalid catalogs throw. Together these support validation blocking startup before requests are served. | none — verified sound |
| c8 | citation | LOW | manual | src/config/analyze.ts:242 declares resolveTiers(tiering: AnalyzeTiering): Record<TierName, TierModel>. | The source grep match and direct read at src/config/analyze.ts:242 both confirm: function resolveTiers(tiering: AnalyzeTiering): Record<TierName, TierModel> { | none — verified sound |
| 4/c12 | ordering | LOW | manual | The config-path resolveTiers function obtains individual tier defaults through resolveTier. | src/config/analyze.ts:242 declares resolveTiers; lines 244–246 call resolveTier for core, mid, and cheap respectively. Line 271 calls resolveTiers(tiering), confirming the config-path resolution chain. | none — verified sound |
| c12 | citation | LOW | manual | The TUI effective-tier view directly calls resolveTier with the expression tiers[t] = resolveTier(tiering, t) at src/cli/panes/model-tiers.ts:63. | The source grep match and direct read at src/cli/panes/model-tiers.ts:63 both confirm `tiers[t] = resolveTier(tiering, t);`, exactly matching the cited expression and location. | none — verified sound |
| c14 | citation | LOW | manual | src/analyze/context/role-router.ts:138 gives a per-repo tier override precedence over the global tier through byRepo?.tiers?.[tier] ?? cfg.tiering.tiers?.[tier]. | The source grep match and direct read at src/analyze/context/role-router.ts:138 both show `const configuredTier: TierModel \| undefined = byRepo?.tiers?.[tier] ?? cfg.tiering.tiers?.[tier];`, confirming that the per-repo tier override takes precedence, with the global tier as the nullish fallback. | none — verified sound |
| 4/c11 | external-contract | LOW | manual | The Codex CLI rejects an unknown model with exit status 1. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/evidence/def-cli-probes.md:11 records `codex exec -m gpt-nonexistent-9 "Reply with: ok"` returning exit status 1 with a message that the model is not supported when using Codex with a ChatGPT account. | none — verified sound |
| 4/c11 | external-contract | LOW | manual | The Claude CLI rejects an unknown model with exit status 1. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/evidence/def-cli-probes.md:13 records `claude -p --model claude-nonexistent-9 "Reply with: ok"` exiting with status 1 and reporting an issue with the selected model. This confirms the premise for the recorded probe. | none — verified sound |
| 4/c11 | external-contract | LOW | manual | The Codex CLI rejects an unrecognized reasoning-effort name with exit status 1. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/evidence/def-cli-probes.md:10 records `codex exec -m gpt-6.1-sol -c model_reasoning_effort=bogus "Reply with: ok"` exiting with status 1 and reporting `Invalid value: 'bogus'`, confirming the premise. | none — verified sound |
| 4/c11 | external-contract | LOW | manual | The Claude CLI warns about an unrecognized effort name, ignores it and can still exit with status 0. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/evidence/def-cli-probes.md:14 records `claude -p --model sonnet --effort bogus "Reply with: ok"` exiting 0, warning that the unknown effort value is ignored in favor of the default effort, and then answering `ok`. Line 31 records the same behavior for haiku. | none — verified sound |
| s4/lc2 | external-contract | LOW | manual | A Codex run can succeed with a recognized effort name that the selected model does not list as supported. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/evidence/def-cli-probes.md:9 lists gpt-6-luna's supported reasoning levels without ultra. Line 12 records `codex exec -m gpt-6-luna -c model_reasoning_effort=ultra "Reply with: ok"` exiting 0 and answering `ok` with `reasoning effort: ultra`, confirming the premise. | none — verified sound |
| 4/c11 | external-contract | LOW | manual | codex debug models locally returns model descriptions containing each model’s supported reasoning levels. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/evidence/def-cli-probes.md:9 records `codex debug models` exiting 0 and returning a JSON list in which each model has `supported_reasoning_levels`, confirming the premise for the probed CLI. | none — verified sound |
| 4/c11 | external-contract | LOW | manual | The Claude CLI has no local model-listing command equivalent to codex debug models. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/evidence/def-cli-probes.md:21 explicitly states: “claude has no local model-listing command,” confirming the premise. | none — verified sound |
| s4/lc3 | external-contract | LOW | manual | Claude CLI run output cannot establish whether a particular model supports a recognized effort level. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/evidence/def-cli-probes.md:32–34 records successful runs without warnings for haiku/xhigh, haiku/max, and opus/max. Line 35 records JSON output with no reported effort level. These results support line 40: successful execution does not establish model-specific support for the requested effort. | none — verified sound |
| s4/ac1 | external-contract | LOW | manual | The Claude CLI warning’s Valid values list identifies CLI-recognized effort names rather than model-specific supported levels. | def-cli-probes.md:14 and :31 show sonnet and haiku receiving the identical warning list, `low, medium, high, xhigh, max`, for `--effort bogus`; both fall back to default effort and exit 0. Line 39 explicitly identifies this as the CLI's effort-name list, not a per-model support list, confirming the premise. | none — verified sound |
| s4/ac1 | external-contract | LOW | manual | The Claude CLI’s JSON output exposes per-model context-window and output-limit values from which the artifact expects to obtain the model’s input limit. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/evidence/def-cli-probes.md:35 records a successful Claude JSON probe exposing modelUsage["claude-haiku-5-5"].contextWindow = 1000000 and maxOutputTokens = 128000. Line 41 explicitly identifies these fields as the basis for obtaining the model's input limit, confirming the premise. | none — verified sound |
| s4/lc2 | semantic | LOW | manual | Codex effort-support decisions use membership in the CLI’s model-specific supported-level list rather than successful execution as their evidence. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/evidence/def-cli-probes.md:9 records gpt-6-luna's supported_reasoning_levels excluding ultra; :12 records an ultra run nevertheless exiting 0. Line 20 explicitly identifies the model list as the authority for supported levels. DEF.md:145 and :154 prescribe that same distinction between supported-level membership and successful execution. | none — verified sound |
| s4/ac3 | semantic | LOW | manual | For Claude, an effort level passing the check in s4/ac3 means CLI recognition plus user approval, without a claim of verified model support. | DEF.md:145 (s4/ac1) checks Claude effort-name recognition while explicitly stating that CLI output cannot establish model support. DEF.md:146 (s4/ac2) requires that uncertainty to be shown and user approval obtained. DEF.md:147 (s4/ac3) admits only checked, approved levels; DEF.md:155 (s4/lc3) explicitly confirms that user approval admits Claude effort levels without verified model support. | none — verified sound |
| Summary/c1 | cross-artifact | LOW | manual | DEF-ce99b72065d03b1b is seeded from the existing artifact SPEC-1aa3094047d2617b. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/DEF.md:8 explicitly states **Seeded from:** `SPEC-1aa3094047d2617b`. docs/standalone/per-family-model-definitions-served-daemon-E202610231aa30940/SPEC.md:1 confirms that artifact ID exists. | none — verified sound |
| 3/c1 | cross-artifact | LOW | manual | The seed SPEC restricts extensibility to configurable models while retaining built-in families, transport and structured-output handling in code. | SPEC.md:13 explicitly limits scope to three built-in families, retains transport and structured-output handling in code, and configures models through a repo-shipped data file. SPEC.md:33 confirms “Built-in families, configurable models.” DEF.md:58 and :62 consistently exclude user-defined families/runners and configurable transport or structured-output handling. | none — verified sound |
| E20261023ce99b720:FR003/c1 | cross-artifact | LOW | manual | The seed SPEC requires all-consumer migration in stages with clients obtaining definitions over daemon IPC. | SPEC.md:13 explicitly requires the TUI and both IDE plugins to read definitions over daemon IPC, keep no copy, and migrate every hardcoded runner/model string in stages. SPEC.md:37 confirms all four consumers are in scope. DEF.md:30 (FR003) and :32 (FR005) preserve these requirements. | none — verified sound |
| E20261023ce99b720:FR001/c1 | cross-artifact | LOW | manual | FR001’s authoritative model definitions trace to the seed SPEC’s consolidation of tier defaults, summariser selection, per-model effort levels and input limits. | SPEC.md:9 at docs/standalone/per-family-model-definitions-served-daemon-E202610231aa30940 explicitly consolidates tier defaults, summariser selection, per-model effort levels and input limits into a repo-shipped data file. DEF.md:28 at docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720 carries those same facts into FR001’s authoritative family/model descriptions and cites c1. The premise is supported. | none — verified sound |
| E20261023ce99b720:FR002/c2 | cross-artifact | LOW | manual | Stakeholder citation c2 requires model structure in a separate repo-shipped data file so model-version updates do not require code changes. | SPEC.md:45 at docs/standalone/per-family-model-definitions-served-daemon-E202610231aa30940/ and DEF.md:208 at docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/ both record stakeholder citation c2 requesting a separate repo config file storing model structure, explicitly excluding the user's config.json, because frequent model-version updates would make code changes cumbersome. Both confirm the premise. | none — verified sound |
| E20261023ce99b720:FR004/c3 | cross-artifact | LOW | manual | Stakeholder citation c3 requires testing an unknown model and letting the user approve or reject it. | Both docs/standalone/per-family-model-definitions-served-daemon-E202610231aa30940/SPEC.md:46 and docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/DEF.md:209 identify c3 as stakeholder input from user 2026-10-23: "test and approve or reject the unknown model". This confirms the premise. | none — verified sound |
| k1/c4 | cross-artifact | LOW | manual | CLAUDE.md prohibits direct cloud REST calls and requires cloud model access through the installed Claude and Codex CLIs. | CLAUDE.md:12 explicitly prohibits direct cloud REST calls and requires cloud LLM access through the locally installed claude and codex CLI binaries via CliProvider. CLAUDE.md:137 reiterates this requirement. src/agent/providers/cli-provider.ts:183 declares CliProvider implements LLMProvider. | none — verified sound |
| k2/c4 | cross-artifact | LOW | manual | k2 cites CLAUDE.md’s daemon-ownership and IPC-only architectural rule as the basis for clients accessing definitions through the daemon. | CLAUDE.md:132 requires CLI/MCP/workbench database access through daemon IPC; CLAUDE.md:136 states daemon ownership of all DB access. DEF.md:79 states k2’s daemon ownership and IPC-only access contract and explicitly cites [[c4]], confirming the premise. | none — verified sound |
| k3/c4 | cross-artifact | LOW | manual | CLAUDE.md requires serial awaited execution for operations reaching an LLM provider, supporting k3’s prohibition on concurrent probes. | CLAUDE.md:122 explicitly requires serial for...of execution with sequential awaits for anything reaching an LLM provider. DEF.md:80 states k3’s matching prohibition on concurrent provider probes, and DEF.md:145 operationalizes k3 as CLI checks performed “one check at a time.” | none — verified sound |
| c6 | citation | LOW | manual | Stakeholder citation c6 restricts per-repo overrides to choosing the functions or roles that use each globally configured tier. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/DEF.md:212 identifies c6 as stakeholder input from user 2026-10-23 and states: "no per-repo override, only the model tiers, per-repo can only override the functions these tiers are used for". This confirms the stated restriction. | none — verified sound |
| k6/c13 | citation | LOW | manual | Stakeholder citation c13 explicitly requests removal of per-repo tier overrides. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/DEF.md:219 identifies [[c13]] as stakeholder input from user 2026-10-23 and explicitly states: "remove the per-repo override for tiers". | none — verified sound |
| c7 | cross-artifact | LOW | manual | Reference c7 resolves to the prior reasoning-effort story’s t8-live-effort.md evidence artifact. | DEF.md:213 maps [[c7]] to the exact prior-artifact path stated in the premise. That path resolves successfully at line 1 to “# S001/t8 live CLI effort checks”, confirming the referenced evidence artifact exists. | none — verified sound |
| c9 | cross-artifact | LOW | manual | Reference c9 denotes the define workflow’s step output s1. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/DEF.md:215 explicitly declares `- **[[c9]]** `step-output` `s1``, confirming the reference mapping. .insrc/artifacts/DEF-ce99b72065d03b1b.json:1466 also identifies citation `c9`. | none — verified sound |
| c10 | cross-artifact | LOW | manual | Reference c10 denotes the first analyze bundle in define step output s1. | DEF.md:216 explicitly maps [[c10]] to `analyze-bundle` `s1.analyzeBundles[0]`; DEF.md:215 maps [[c9]] to step output `s1`. .insrc/artifacts/DEF-ce99b72065d03b1b.json:1473 corroborates the reference `s1.analyzeBundles[0]`. | none — verified sound |
| s2 | ordering | LOW | manual | Story s2 depends on story s1 delivering startup-loaded model definitions. | DEF.md:88 identifies S001 as shipping model definitions as data the daemon checks at startup. DEF.md:102 identifies S002 as asking the daemon for family and model definitions, and DEF.md:108 explicitly states **Depends on:** `s1`, confirming the ordering. | none — verified sound |
| s3 | ordering | LOW | manual | Story s3 depends on story s1 delivering the shared definitions that runtime model selection consumes. | DEF.md:88 identifies S001 as shipping model definitions checked by the daemon at startup; DEF.md:117 identifies S003 as running every model by the shared definitions; DEF.md:123 explicitly states S003 depends on `s1`. These confirm the stated ordering. | none — verified sound |
| s4 | ordering | LOW | manual | Story s4 depends on story s2 providing the definitions interface used to expose approved unknown models. | DEF.md:102 identifies S002 as asking the daemon for family and model definitions. S004 explicitly depends on `s2` at line 141, and its ac5 at line 149 requires approved unknown models to appear in daemon-served definitions under their family with only approved effort levels. This confirms the stated dependency. | none — verified sound |
| s5 | ordering | LOW | manual | The TUI migration in s5 depends on completion of s2, s3 and s4. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/DEF.md:157 identifies S005 as the TUI task; line 163 explicitly states **Depends on:** `s2`, `s3`, `s4`, confirming the premise. | none — verified sound |
| s6 | ordering | LOW | manual | The VS Code migration in s6 depends on completion of s2, s3 and s4. | DEF.md:173 identifies S006 as the VS Code model-and-effort selection migration; DEF.md:179 explicitly states **Depends on:** `s2`, `s3`, `s4`, confirming the premise. | none — verified sound |
| s7 | ordering | LOW | manual | The JetBrains migration in s7 depends on completion of s2, s3 and s4. | DEF.md:189 identifies S007 as the JetBrains migration; DEF.md:195 explicitly lists **Depends on:** `s2`, `s3`, `s4`, confirming the premise. | none — verified sound |
| s2/ac1 | semantic | LOW | manual | The definitions response designed in s2 can represent user-approved unknown models, as required by s4/ac5. | DEF.md:114 (s2/ac1) explicitly requires a response shape that can carry models the user approves later. DEF.md:149 (s4/ac5) specifies those unshipped models appear under their family, marked user-approved, with only approved effort levels. These requirements support the premise. | none — verified sound |
| s4/ac2 | ordering | LOW | manual | An unknown model’s capability checks and explicit user approval must precede its use. | DEF.md:31 (FR004) requires CLI capability checks, presentation of results, and approval before model use. DEF.md:82 (k5) repeats the approval prerequisite. DEF.md:145–147 establish the sequence: sequential checks (ac1), results and explicit approval of allowed levels before use (ac2), then tier assignment restricted to checked and approved levels (ac3). | none — verified sound |
| k6 | semantic | LOW | manual | k6 permits per-repo role-to-tier choices and the core floor while restricting tier runner, model and effort settings to global configuration. | DEF.md:83 explicitly states that k6 allows per-repo role-to-tier choices and the core floor, while runner, model and effort are global only. DEF.md:49 (S003:FR004) requires removing per-repo tier overrides; DEF.md:132 (ac4) requires resolving runner, model and effort from global settings and definitions. These directly confirm the premise. | none — verified sound |
| s1/ac3 | semantic | LOW | manual | A valid tier default must identify a model belonging to the default’s own family. | DEF.md:100 (s1/ac3) explicitly requires startup rejection when a tier default is not one of that family's models, confirming the premise. DEF.md:37 (E20261023ce99b720:S001:FR002) requires invalid definitions to stop startup and identify the faulty entry. | none — verified sound |
| s3/ac3 | cross-artifact | LOW | manual | s3/ac3 limits the removal of runner and model literals to code outside family implementations, consistent with the seed SPEC retaining family implementations in code. | DEF.md:131 explicitly limits ac3's literal-removal requirement to code “outside the family implementations.” The seed SPEC.md:13 retains families, transport and structured-output handling in code while configuring models through data. DEF.md:32 describes the broader staged consumer migration. These supplied reads support the claimed scope and consistency. | none — verified sound |
| E20261023ce99b720:S003:FR001 | cross-artifact | LOW | manual | S003:FR001 assigns runtime consumption of per-model input limits to story s3. | DEF.md:46 explicitly states E20261023ce99b720:S003:FR001: “Tier defaults, the summariser model and per-model effort and input limits used at run time come from the definitions.” DEF.md:117 identifies S003 as “The daemon runs every model by the shared definitions.” Together these confirm that story s3 owns runtime consumption of per-model input limits. | none — verified sound |

#### Proposed fixes

- **1** (assisted) — The inventory is only partially verified; the supplied evidence establishes neither a contradiction nor a concrete build failure.
  - option: Narrow the premise to duplicated provider identities in the VS Code and JetBrains plugins.
  - option: Retain the broader premise pending targeted reads showing identities and family-specific branches in each named surface.

- **1** (assisted) — The evidence supports only part of the inventory; it does not establish that the remaining entries are incorrect.
  - option: Retain the inventory after gathering model-ID evidence from the curated catalog and plugin installer.
  - option: Narrow the premise to tier defaults, config-catalog defaults, the summariser fallback, and scripts/insrc-daemon-install.sh tier blocks.

- **1** (assisted) — The budget assignment is verified; the claimed refusal behavior is not established by the supplied evidence.
  - option: Reword: CliProvider leaves inputBudgetChars undefined for Claude.
  - option: Supply the Claude invocation and oversized-input handling evidence to verify the full premise.

- **1** (assisted) — The supplied evidence supports specific default construction paths but does not establish coverage of every analysis provider.
  - edit: `Every Ollama model used for analysis receives the global models.shaper.ollamaNumCtx value rather than a per-model context limit.` → `The shaper and summariser OllamaProvider constructors in src/analyze/context/shaper-provider.ts receive cfg.shaper.ollamaNumCtx; the default buildProvider calls at src/analyze/context/driver.ts:531 and :833 also receive this value.`
  - option: Narrow the premise to the verified constructor and default-provider paths using the proposed edit.
  - option: Retain the universal claim only after verifying all buildProvider callers and the configuration of injected analysis providers.

- **1** (assisted) — The supplied evidence supports a narrower implementation claim but supplies no replacement handler-registration anchor.
  - edit: `The existing daemon model-list surface is providers.listModels, referenced at src/daemon/list-models.ts:127.` → `The daemon model-list implementation maps deps.catalog().modelsFor(provider) through toModelInfo at src/daemon/list-models.ts:127.`
  - option: Retain the IPC-surface claim after obtaining its current handler-registration source citation.
  - option: Use the proposed narrower statement supported directly by the supplied source line.

- **1** (assisted) — The supplied evidence neither establishes complete client coverage nor contradicts the premise; no mechanical correction is supported.
  - option: Retain the premise after obtaining source evidence for each client's providers.listModels call path.
  - option: Narrow the premise to the daemon catalog mapping shown at src/daemon/list-models.ts:127 and mark client routing as unverified.

- **1** (auto) — The supplied reads directly establish the import and lookup, supporting a mechanical correction.
  - edit: `The VS Code picker imports the daemon effort list at model-tier-picker.ts:25 and uses that compiled list at :199.` → `The VS Code picker imports CONFIG_CATALOG at model-tier-picker.ts:25 and reads the matching models.tiers.${tier}.effort entry's enumValues at :199, falling back to an empty array.`

- **1** (assisted) — The supplied evidence supports catalog-based lookup but leaves the claimed rebuild-and-release requirement unverifiable.
  - option: Gather build and packaging evidence establishing that catalog changes require a plugin rebuild and release.
  - option: Reword the premise to state only that the existing picker reads effort values from CONFIG_CATALOG.

- **1** (assisted) — The listed fields are confirmed, but the exclusive inventory remains unverifiable.
  - option: Gather the complete TierModel declaration, including its closing brace, and reassess.
  - option: Reword the premise to state only that TierModel declares runner, model and optional effort.

- **1** (assisted) — Field presence is verified; field exclusivity remains unverified.
  - option: Provide the complete CatalogModel declaration and reassess the word “only”.
  - option: Reword the premise: “CatalogModel declares readonly id: string and optional readonly displayName?: string.”

- **1** (assisted) — The supplied fields support a narrower observation, but the behavioral absence claim needs selection and persistence evidence.
  - option: Gather the complete types and unknown-model selection/persistence paths, then reassess the premise.
  - option: Narrow the premise to the supplied reads: TierModel exposes runner, model and optional effort; these reads do not demonstrate capability metadata recording.

- **1** (assisted) — The supplied evidence neither confirms nor contradicts the claimed absence of validation; no mechanical correction is supported.
  - option: Gather focused implementation evidence and reassess the original premise.
  - option: Qualify the premise: a global effort enum exists, but model-specific effort validation remains unverified.

- **1** (assisted) — The evidence supports hardcoded identifiers but does not establish mandatory registration or an exhaustive model set.
  - option: Reword the premise to describe hardcoded model defaults and summariser fallbacks at the verified locations.
  - option: Retain the release-blocking claim only after gathering evidence of model acceptance constraints and the required edits.

- **4/c5** (assisted) — The two-family loop is verified; exclusive acceptance remains unverifiable.
  - option: Reword the premise to state that the validator explicitly iterates over cli-claude and cli-codex.
  - option: Inspect the full validator body and returned provider map before retaining the exclusive-acceptance claim.

- **c5** (assisted) — Boot-time loading and validation are supported; the claimed failure behavior remains unverified.
  - option: Narrow the premise to: src/daemon/model-catalog.ts:12 documents boot-time catalog loading and validation.
  - option: Gather surrounding source and boot error-handling evidence before retaining the fail-fast refusal claim.

- **4/c12** (assisted) — The evidence confirms a direct TUI caller but cannot establish the complete consumer set.
  - option: Retain the exhaustive migration requirement and gather complete source evidence before declaring coverage.
  - option: Narrow the grounded claim to the confirmed TUI resolveTier call and explicitly mark the remaining consumer inventory unverified.

- **c10** (assisted) — The evidence supports an inconclusive analysis report, not the stronger assertion that no complete implementation exists.
  - option: Reword to: “Analyze bundle c10 reports no clear implementation match and identifies partial consumer-side slices; absence of a complete authoritative implementation remains unverified.”
  - option: Retain the stronger premise only after inspecting the catalog/config implementations and gathering an untruncated, source-scoped search for equivalent definitions.

- **c10** (assisted) — The evidence establishes file existence but does not establish implementation content; no concrete build failure is demonstrated.
  - option: Gather implementation-body reads from both files and reassess c10.
  - option: Narrow the premise to file existence, leaving the claimed partial implementations unverified.
