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

The facts that describe each model family insrc can run on (the Claude CLI, the Codex CLI and local Ollama) are scattered rather than held in one place. Which runner a family is, which model each capability tier defaults to, which model summarises, which reasoning-effort levels a given model accepts and how large an input it takes are written as repeated literal strings and per-family branches across the daemon, the terminal UI and both IDE plugins. The same fact is therefore stated many times and can drift: a client can offer an effort level or a model the daemon will not honour, or the daemon can run a model with a capability it lacks, and nothing notices. Model releases arrive often (new versions, new effort levels that only some models support), and today each one needs code edits in several places, and a release of each client that keeps its own list, before anyone can use it. When a user picks a model that insrc does not know, there is no record of what that model can actually do, so its effort levels and limits are guessed rather than known. The cost falls on every model update and on every user who switches models: slow, error-prone changes, and settings screens that may not match what actually runs.

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

- `med` The existing curated model catalog asset and its boot-time validation can be extended to carry the per-model facts rather than replaced. [[c5]]
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
| `k7` | convention | A missing or malformed definitions file is a fail-fast startup refusal, as the curated catalog is today. | [[c5]] |

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

**0 HIGH · 13 MED · 54 LOW** · model `cli-codex:gpt-6.1-sol` · reviewed 2026-10-23T12:47:54.840Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| Problem | semantic | MED | assisted | Runner identity and model identifiers are currently encoded as literals in multiple consumers rather than supplied exclusively by one daemon-owned definition. | Unverifiable from the supplied evidence. src/config/analyze.ts:134 shows only the DEFAULT_TIERS declaration, without its values. docs/daemon.md:380–382 shows runner/model literals in documentation, while DEF.md:24 repeats the problem claim. Neither truncated grep provides source matches from the other three anchors or establishes how consumers obtain these identifiers. The evidence therefore does not establish duplicated consumer definitions or exclusive daemon ownership. | Gather targeted source matches and surrounding reads from all four anchors, including imports and identifier resolution, before accepting the premise. |
| Problem | semantic | MED | assisted | Tier defaults, summariser selection, accepted effort levels and input limits currently depend on code literals or family-specific branches. | Partially verified. src/config/analyze.ts:115 defines TIER_EFFORTS as the literal list ['low', 'medium', 'high', 'xhigh', 'max']; :134 declares DEFAULT_TIERS but the supplied read omits its values. :277 assigns summariserProvider from tiers.cheap.runner. src/analyze/context/shaper-provider.ts:303 constructs OllamaProvider using cfg.summariserModel. The truncated input-limit search supplies no current production-source implementation establishing literal limits or family-specific limit branches. The full premise is therefore unverifiable; no concrete build-breaking contradiction is established. | Narrow the premise to the verified observations, or obtain production-source evidence for tier-default values, summariser model resolution, and input-limit handling before retaining the full claim. |
| Problem; FR002 | semantic | MED | assisted | Introducing model versions or capabilities currently requires edits to model facts embedded in code and updates to clients that retain those facts. | Unverifiable from the supplied evidence. Both greps are truncated at 50 matches and provide no production-source reads establishing that introducing models or capabilities requires code edits and client updates. DEF.md:24 repeats the premise; DEF.md:232 records an earlier unverifiable assessment. These artifact statements do not independently establish the claimed requirement. | Ground the premise with production-source reads showing embedded facts and how they restrict new models or capabilities, or qualify it as an unverified concern. |
| Problem; FR004 | semantic | MED | assisted | The existing system lacks an explicit user-approved per-model capability profile for a selected model absent from its known model descriptions. | UNVERIFIABLE. The capability/approval search is truncated at 50 matches and supplies documentation matches rather than relevant production implementation. src/daemon/model-catalog.ts:42 and src/config/analyze.ts:106 show only interface declarations, without their fields. src/config/analyze.ts:115,118 confirms a global effort list and membership check, but does not establish whether user-approved per-model profiles exist. DEF.md:24 repeats the claimed absence; it is not independent implementation evidence. | Gather focused source reads of the catalog/config interfaces, model persistence and approval handling before asserting that unknown models lack an explicit user-approved capability profile. |
| k7/c5; s1/ac3 | ordering | MED | assisted | Daemon startup invokes validateModelCatalog before serving requests that consume the catalog. | src/daemon/index.ts:377–378 imports and awaits validateModelCatalog(). src/daemon/model-catalog.ts:194 describes a boot-validated catalog accessor. However, no supplied source lines show when request serving starts or catalog consumers run relative to validation. The truncated grep contains historical test output, so the claimed ordering remains unverifiable. | Obtain source evidence establishing validation completes before request serving and catalog consumption, or narrow the premise to the verified awaited invocation. |
| Assumptions/c5; s1/ac1 | semantic | MED | assisted | The existing catalog loader caches a frozen validated parse that getCuratedCatalog exposes through modelsFor. | src/daemon/model-catalog.ts:181 confirms `cached = validateShape(parsed, path)`; :199 declares getCuratedCatalog(), and :208 declares modelsFor(). The supplied reads omit validateShape's return value and both accessors' bodies, so freezing and exposure of the cached parse remain unverified. The truncated grep contains documentation and historical test output, which do not establish the missing source behavior. | Obtain source reads showing validateShape's freezing and return behavior, plus getCuratedCatalog/modelsFor's access to cached, before relying on the full premise. |
| Assumptions/c5 | semantic | MED | assisted | The existing curated catalog asset, schema validator and boot integration can be extended to carry per-model capability facts without replacing the catalog mechanism. | src/daemon/model-catalog.ts:40 documents a catalogued model entry; :107 declares validateShape returning CloudModelCatalogFile; src/daemon/index.ts:378 calls validateModelCatalog at boot. These confirm catalog validation and boot integration exist, but the supplied lines omit the model fields, validator body and asset structure needed to verify capability extensibility. The truncated grep supplies historical test logs rather than those definitions. The extensibility premise remains unverifiable; no concrete failure is established. | Obtain the catalog interfaces, validator body and representative asset entry to verify that per-model capability facts can pass through the existing mechanism. |
| k6; s3/ac4/ac5 | semantic | MED | assisted | Existing repo configuration can carry tier runner, model or effort overrides that must be ignored and removed by the migration. | Partially verified: src/analyze/context/role-router.ts:138 reads `byRepo?.tiers?.[tier] ?? cfg.tiering.tiers?.[tier]`, confirming repo tier overrides take precedence. docs/daemon.md:474–485 describes repo tier settings and their resolution; the supplied S005/LLD.md:40 describes runner/model leaves. No supplied source read establishes an effort leaf in TierModel or its parsing. DEF.md:133 prescribes removing runner/model/effort overrides but does not independently verify their existing representation. No concrete build-breaking contradiction is established. | Confirm the stored representation and parsing of per-repo effort overrides, or narrow the existing-configuration claim to the verified runner/model overrides while retaining effort cleanup as a defensive migration requirement. |
| Assumptions/c11 | external-contract | MED | assisted | The installed Claude CLI has no local model-listing command equivalent to codex debug models. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/evidence/def-cli-probes.md:21 repeats that Claude has no local model-listing command, but the supplied evidence contains no installed CLI help or probe output establishing that external contract. The premise remains unverifiable. | Supply installed Claude CLI command-discovery evidence, or qualify the statement as an unverified assumption. |
| c10; s6 | citation | MED | assisted | The analyze-bundle citation names vscode-plugin/src/models/model-tier-picker.ts as an existing VS Code consumer-side model-tier implementation. | DEF.md:215 confirms c10 names vscode-plugin/src/models/model-tier-picker.ts as a partial consumer-side slice. However, the supplied grep is truncated at 50 matches and contains no implementation match or source read for that file. Its existence and model-tier behavior are therefore unverifiable; absence is not established either. | Obtain a targeted existence check and source read for the cited file, then substantiate or correct c10. |
| s2/Depends on | ordering | MED | assisted | S002 depends on S001 supplying validated daemon-owned definitions before the definitions IPC surface is delivered. | DEF.md:108 explicitly states “Depends on: `s1`”. DEF.md:98 requires daemon startup loading and retaining definitions as the single source for later requests. These support a dependency and daemon ownership, but do not establish S001's validation responsibility or S002's IPC delivery scope. The full ordering premise is therefore only partially verifiable. | Verify the S001 validation and S002 IPC responsibilities, or narrow the premise to the documented dependency. |
| s3/Depends on | ordering | MED | assisted | S003 depends on S001 supplying definitions before runtime model selection is migrated. | DEF.md:123 records “Depends on: `s1`”, and DEF.md:98 requires definitions loaded at daemon startup as the single source for later requests. Neither supplied line establishes that S001 supplies those definitions or that S003 migrates runtime model selection. The full ordering premise is unverifiable; no concrete implementation failure is demonstrated. | Verify the S001/S003 section identities and responsibilities before accepting the stated ordering rationale. |
| FR003; s5/ac1; s6/ac1; s7/ac1 | closed-union | MED | manual | The TUI, VS Code and JetBrains acceptance criteria uniformly require daemon-supplied model choices without client-owned runner or model lists. | Not judged: the reviewing model call failed twice. Last error: codex exited with -9. stderr=Reading prompt from stdin...  stdout={"type":"thread.started","thread_id":"01a168ec-1d4a-7963-90bf-df010cf05614"} {"type":"turn.started"}  | Re-run the review, or judge this premise by hand. |
| Summary/c1 | cross-artifact | LOW | manual | DEF-ce99b72065d03b1b is seeded from the artifact identified as SPEC-1aa3094047d2617b. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/DEF.md:8 explicitly states **Seeded from:** `SPEC-1aa3094047d2617b`. docs/standalone/per-family-model-definitions-served-daemon-E202610231aa30940/SPEC.md:1 confirms that exact artifact identifier in its insrc:artifact marker. | none — verified sound |
| Problem; s1/ac1 | inventory | LOW | manual | The supported built-in model families are exactly local Ollama, Claude CLI and Codex CLI. | src/config/analyze.ts:88 defines AnalyzeShaperProviderKind exactly as 'ollama' \| 'cli-claude' \| 'cli-codex', confirming the three supported families. Concrete implementations appear at src/agent/providers/ollama.ts:163 (OllamaProvider) and src/agent/providers/cli-provider.ts:182 (CliProvider). | none — verified sound |
| Problem; FR003; c1 | inventory | LOW | manual | The migration covers the daemon, terminal UI, VS Code plugin and JetBrains plugin. | SPEC.md:3 explicitly names daemon-owned definitions exposed through IPC to the TUI, VS Code plugin and JetBrains plugin, with staged migration. DEF.md:30 (FR003) explicitly requires the terminal UI and both IDE plugins to obtain descriptions from the background service. SPEC.md:31 records an earlier scope/coordination uncertainty; FR003 establishes the claimed coverage. | none — verified sound |
| FR001; c1 | cross-artifact | LOW | manual | SPEC-1aa3094047d2617b calls for consolidating family identity, tier defaults, summariser selection, reasoning capabilities and input limits into daemon-owned definitions. | SPEC.md:9 explicitly requires daemon-owned definitions consolidating runner identity, tier defaults, summariser fallback, reasoning-effort capabilities, and input-size limits. DEF.md:28 (E20261023ce99b720:FR001) confirms one authoritative family/model description covering tier defaults, summariser model, accepted effort levels, and input limits. Both support the premise. | none — verified sound |
| Non-goals/c1 | cross-artifact | LOW | manual | SPEC-1aa3094047d2617b keeps model families, transport and structured-output handling built into code while allowing model selection and capability overrides. | SPEC.md:13 explicitly keeps families, transport, and structured-output handling in code while configuring models through data; SPEC.md:35 confirms model selection and capability overrides. DEF.md:58 and :62 repeat these boundaries in Non-goals. The premise is confirmed. | none — verified sound |
| FR005; Non-goals/c1 | cross-artifact | LOW | manual | SPEC-1aa3094047d2617b requires migration of all consumers in stages rather than one coordinated release. | SPEC.md:13 explicitly states, “Every hardcoded runner/model string is migrated, in stages,” and identifies the TUI and both IDE plugins as consumers. SPEC.md:31 labels the scope “All consumers, delivered in stages,” while leaving coordination details unresolved. DEF.md:32 (E20261023ce99b720:FR005) likewise requires literal runner, CLI-kind and model references to use the shared description, “migrated in stages.” These lines support staged migration rather than a required single coordinated release. | none — verified sound |
| FR003; Non-goals/c1 | cross-artifact | LOW | manual | SPEC-1aa3094047d2617b makes the daemon the single definitions authority and requires clients to use IPC without mirrored definitions or a shared versioned definitions package. | SPEC.md:13 explicitly makes the daemon the single authority and requires the TUI and both IDE plugins to read definitions over IPC and keep no copy. SPEC.md:37 confirms daemon-owned definitions exposed through IPC. DEF.md:63 explicitly excludes a shared versioned definitions package and mirrored client definitions. These lines confirm the premise. | none — verified sound |
| FR004; Non-goals/c1/c3 | cross-artifact | LOW | manual | SPEC-1aa3094047d2617b requires an explicit probed and user-approved capability profile for an unfamiliar model instead of inherited or conservative family defaults. | SPEC.md:13 requires CLI probing for each claimed effort level, displaying results, and user approval or rejection for models absent from built-in definitions. SPEC.md:39 reiterates the explicit capability-profile requirement. DEF.md:64 explicitly excludes conservative or inherited family defaults for unknown models. These lines confirm the premise. | none — verified sound |
| FR002; k4; c2 | citation | LOW | manual | The stakeholder statement attributed to user 2026-10-23 requires model structure in a separate repository-shipped data file rather than the user's config.json. | DEF.md:207 and SPEC.md:45 both attribute [[c2]] to stakeholder user 2026-10-23 and explicitly request a “separate config file in the repo, not user's config.json that stores the model structure,” confirming the premise. | none — verified sound |
| FR002; c2 | citation | LOW | manual | The stakeholder statement attributed to user 2026-10-23 identifies frequent model-version updates as the reason model updates must not require code changes. | DEF.md:207 and SPEC.md:45 both identify [[c2]] as stakeholder testimony from user 2026-10-23, explicitly linking frequent model-version updates to code changes being cumbersome and requesting a separate repository configuration file. Both confirm the premise. | none — verified sound |
| FR004; k5; c3 | citation | LOW | manual | The stakeholder statement attributed to user 2026-10-23 requires testing an unknown model and letting the user approve or reject it. | DEF.md:208 and SPEC.md:46 at the supplied paths both identify [[c3]] as stakeholder `user 2026-10-23` and quote: "test and approve or reject the unknown model". This confirms the premise. | none — verified sound |
| c6; k6/c13 | citation | LOW | manual | The stakeholder statements attributed to user 2026-10-23 require removal of per-repo tier overrides while preserving repo-specific selection of tiers for functions. | DEF.md:211 (c6) explicitly states "no per-repo override, only the model tiers, per-repo can only override the functions these tiers are used for". DEF.md:218 (c13) confirms "remove the per-repo override for tiers". Both entries attribute the statements to user 2026-10-23 and support the premise. | none — verified sound |
| k1; s4/lc1; c4 | citation | LOW | manual | CLAUDE.md prohibits direct cloud REST calls from the process and delegates cloud LLM access to the locally installed Claude and Codex CLIs through CliProvider. | CLAUDE.md:12 explicitly prohibits direct cloud REST calls and delegates cloud LLM access to the locally installed claude/codex CLI binaries via CliProvider. src/agent/providers/cli-provider.ts:182 declares `export class CliProvider implements LLMProvider`, confirming the named provider exists. | none — verified sound |
| k2/c4 | citation | LOW | manual | CLAUDE.md assigns all database access to the daemon and requires CLI, MCP and IDE workbench communication through IPC. | CLAUDE.md:136 explicitly states: “Daemon owns all DB access” and “CLI, MCP, and the IDE workbench communicate via IPC only.” This confirms the premise. | none — verified sound |
| k2/c4 | cross-artifact | LOW | manual | Constraint k2 extends the daemon-ownership and IPC rule cited from CLAUDE.md to ownership and delivery of model definitions. | CLAUDE.md:136 establishes daemon-owned DB access through IPC. SPEC.md:13 extends that architecture to model definitions: the daemon is the single authority, and the TUI and both IDE plugins read definitions over IPC without keeping copies. DEF.md:79 explicitly states k2: daemon ownership of definitions with CLI, MCP server, and IDE plugin access only through daemon IPC. These lines confirm the stated extension. | none — verified sound |
| k3/c4 | citation | LOW | manual | CLAUDE.md requires sequential awaits for calls reaching any LLM provider and explicitly prohibits Promise.all for those calls. | CLAUDE.md:122 explicitly prohibits Promise.all for anything reaching an LLM provider and requires serial for...of with sequential awaits, confirming the premise. | none — verified sound |
| Assumptions/c5; s1 | semantic | LOW | manual | The daemon already has a curated model catalog backed by a shipped JSON asset and a structural validator. | src/daemon/model-catalog.ts:10 identifies the maintainer-curated JSON asset at src/assets/models/cloud-model-catalog.json. Lines 102–107 identify its structural validator, validateShape; lines 157–163 describe structural validation and expose validateModelCatalog(), which resolves CATALOG_FILE. src/daemon/__tests__/model-catalog.test.ts:195–202 references both built and source catalog assets and parses the built JSON. | none — verified sound |
| k7/c5 | citation | LOW | manual | src/daemon/model-catalog.ts documents missing or malformed catalog data as a fail-fast daemon startup refusal. | src/daemon/model-catalog.ts:12 documents loading and validation at boot; line 14 explicitly calls a missing/malformed catalog a “fail-fast startup refusal.” Lines 171 and 178 throw ModelCatalogValidationError, with line 178 explicitly identifying malformed JSON. | none — verified sound |
| s2/ac2 | semantic | LOW | manual | An existing daemon IPC request provides per-provider model lists and can be redirected to the shared definitions. | src/daemon/handler-runtime.ts:1429 registers 'providers.listModels' and delegates to listModels(params). src/daemon/list-models.ts:100 exports that function; :127 obtains provider-specific models through deps.catalog().modelsFor(provider).map(toModelInfo), confirming an existing dispatch and model-source seam that can be redirected to shared definitions. | none — verified sound |
| s3/Extends/c8 | citation | LOW | manual | src/config/analyze.ts:242 declares resolveTiers(tiering: AnalyzeTiering): Record<TierName, TierModel>. | The source grep match and direct read at src/config/analyze.ts:242 both confirm: function resolveTiers(tiering: AnalyzeTiering): Record<TierName, TierModel> { | none — verified sound |
| Assumptions/c12 | semantic | LOW | manual | resolveTier currently resolves a configured tier or falls back to DEFAULT_TIERS with the configured effort. | src/config/analyze.ts:254 returns tiering.tiers?.[tier] when configured; otherwise it spreads DEFAULT_TIERS[tier] and conditionally adds effort. The comment at line 250 explicitly describes the fallback as using the tier's configured effort. | none — verified sound |
| Assumptions/c12 | ordering | LOW | manual | The configuration path reaches resolveTier through resolveTiers. | src/config/analyze.ts:271 calls resolveTiers(tiering). resolveTiers is declared at :242 and calls resolveTier for core, mid, and cheap at :244–246, confirming the stated configuration resolution chain. | none — verified sound |
| Assumptions/c12 | citation | LOW | manual | The TUI effective-tier view directly assigns tiers[t] = resolveTier(tiering, t) at src/cli/panes/model-tiers.ts:63. | The source grep match and direct read of src/cli/panes/model-tiers.ts:63 both confirm `tiers[t] = resolveTier(tiering, t);`, exactly matching the cited assignment and location. | none — verified sound |
| Assumptions/c12; s3 | closed-union | LOW | manual | Migrating default-tier resolution requires covering every resolveTier caller and every direct DEFAULT_TIERS read, including consumers outside resolveTiers. | resolveTier callers appear at src/config/analyze.ts:244–246 and src/cli/panes/model-tiers.ts:63. Direct DEFAULT_TIERS reads outside resolveTiers are confirmed at src/cli/panes/model-tiers.ts:59 (initializing core, mid and cheap) and src/analyze/context/role-router.ts:139 (runtime fallback). These establish that migrating defaults must cover consumers beyond resolveTiers. | none — verified sound |
| s3/Extends/c14 | citation | LOW | manual | src/analyze/context/role-router.ts:138 selects byRepo?.tiers?.[tier] before cfg.tiering.tiers?.[tier] for configuredTier. | The read at src/analyze/context/role-router.ts:138 confirms: `const configuredTier: TierModel \| undefined = byRepo?.tiers?.[tier] ?? cfg.tiering.tiers?.[tier];`. The repository-specific tier takes precedence, with the global tier as the nullish fallback. | none — verified sound |
| Assumptions/c11 | external-contract | LOW | manual | The installed Codex CLI rejects an unknown model with exit status 1. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/evidence/def-cli-probes.md:11 records probe 3: `codex exec -m gpt-nonexistent-9 "Reply with: ok"` exited with status 1 and reported that the model is not supported when using Codex with a ChatGPT account. | none — verified sound |
| Assumptions/c11 | external-contract | LOW | manual | The installed Claude CLI rejects an unknown model with exit status 1. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/evidence/def-cli-probes.md:13 records probe 5: `claude -p --model claude-nonexistent-9 "Reply with: ok"` exited with status 1 and reported an issue with the selected model, confirming the premise. | none — verified sound |
| Assumptions/c11 | external-contract | LOW | manual | The installed Codex CLI rejects an unrecognized reasoning-effort value with exit status 1. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/evidence/def-cli-probes.md:10 records probe 2: `codex exec -m gpt-6.1-sol -c model_reasoning_effort=bogus "Reply with: ok"` exited with status 1 and reported `Invalid value: 'bogus'`, confirming the premise. | none — verified sound |
| Assumptions/c11 | external-contract | LOW | manual | The installed Claude CLI warns about an unknown effort value, substitutes its default effort and can finish with exit status 0. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/evidence/def-cli-probes.md:14 records probe 6: `claude --effort bogus` warns that it is using the default effort, answers `ok`, and exits 0. Line 19 independently summarizes the same behavior. | none — verified sound |
| Assumptions/c11; s4/lc2 | external-contract | LOW | manual | The installed Codex CLI can successfully run a model with a recognized effort level absent from that model's supported-level listing. | def-cli-probes.md:12 records probe 4 exiting 0 and answering `ok` with `reasoning effort: ultra`, although ultra is absent from gpt-6-luna’s listed levels. Line 20 explicitly confirms Codex does not reject this known but unlisted level. | none — verified sound |
| Assumptions/c11; s4/ac1 | external-contract | LOW | manual | codex debug models provides a local JSON model listing containing model slugs and supported_reasoning_levels. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/evidence/def-cli-probes.md:9 records `codex debug models` exiting 0 and returning a JSON list whose models contain `slug` and `supported_reasoning_levels`, confirming the premise. | none — verified sound |
| Problem; Assumptions/c11 | external-contract | LOW | manual | Supported reasoning-effort levels differ between models within the Codex family. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/evidence/def-cli-probes.md:9 records successful `codex debug models` output: gpt-6.1-sol lists low/medium/high/xhigh/max/ultra, while gpt-6-luna lists low/medium/high/xhigh/max without ultra. This confirms model-specific supported reasoning levels within Codex. | none — verified sound |
| s4/ac1/ac2; Assumptions/c11 | external-contract | LOW | manual | CLI probe results expose warnings and rejection evidence needed to distinguish accepted effort levels from silently substituted defaults. | def-cli-probes.md:10 records Codex rejecting effort 'bogus' with exit status 1 and an invalid-value diagnostic. The same file at :14 records Claude returning status 0 while warning that effort 'bogus' is ignored and the default used. These results expose rejection and substitution evidence, confirming that exit status alone cannot establish effort acceptance. | none — verified sound |
| s4/lc2; c11 | semantic | LOW | manual | A successful Codex execution is insufficient evidence of per-model effort support, so the Codex model listing must determine accepted effort levels. | def-cli-probes.md:9 lists gpt-6-luna's supported_reasoning_levels without ultra; :12 records a successful ultra execution anyway. This directly supports DEF.md:154 (lc2): execution success cannot establish per-model effort support, so validation must use the model listing. | none — verified sound |
| c11 | citation | LOW | manual | The CLI probe evidence document explicitly concludes that Codex accepted levels must come from codex debug models rather than successful test execution. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/evidence/def-cli-probes.md:20 explicitly states that Codex accepted levels must come from `codex debug models` (probe 1), not whether a test run succeeds, because Codex does not reject a known level absent from a model’s listed levels (probe 4). | none — verified sound |
| c7 | cross-artifact | LOW | manual | Reference c7 resolves to the earlier reasoning-effort story's live CLI effort evidence document. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/DEF.md:212 explicitly maps [[c7]] to the stated prior-artifact path. That document's line 1 identifies it as “S001/t8 live CLI effort checks”; line 3 records the live-test command and 2 of 2 passing. Lines 6–7 show the passing Codex and Claude effort checks. | none — verified sound |
| c9; c10 | cross-artifact | LOW | manual | Reference c10 identifies the first analyze bundle of step-output s1, which c9 identifies as a workflow step output. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/DEF.md:214 identifies c9 as `step-output` `s1`; line 215 identifies c10 as `analyze-bundle` `s1.analyzeBundles[0]`, confirming the stated relationship. | none — verified sound |
| s1/Extends; s2/Extends; s3/Extends; s5/Extends; s6/Extends; s7/Extends; c10 | cross-artifact | LOW | manual | The cited analyze bundle reports no clear existing implementation match and identifies only partial consumer-side slices. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/DEF.md:215 explicitly cites s1.analyzeBundles[0] and quotes: "No clear match. Partial, consumer-side slices in vscode-plugin/src/models/model-tier-picker.ts and src/cli/panes/model-tiers.ts." This confirms the premise's characterization of the cited report. | none — verified sound |
| c10; s5 | citation | LOW | manual | src/cli/panes/model-tiers.ts contains an existing TUI model-tier implementation that consumes local tier defaults and effort choices. | src/cli/panes/model-tiers.ts:19 imports DEFAULT_TIERS, resolveTier and TIER_EFFORTS; :59 initializes core, mid and cheap from DEFAULT_TIERS; :101 exports EFFORT_CYCLE as ['', ...TIER_EFFORTS]. These source reads confirm the existing model-tier implementation consumes local tier defaults and effort choices. | none — verified sound |
| s4/Depends on | ordering | LOW | manual | S004 depends on S002 providing the definitions contract that can represent subsequently approved unknown models. | DEF.md:141 explicitly declares `Depends on: s2`. DEF.md:114 (s2/ac1) requires a definitions shape that can carry models approved later; DEF.md:149 (s4/ac5) requires approved models absent from shipped definitions to appear under their family with approved effort levels. These confirm the stated dependency. | none — verified sound |
| s5/Depends on | ordering | LOW | manual | S005 depends on S002, S003 and S004 before the TUI migration is delivered. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/DEF.md:162 explicitly states '**Depends on:** `s2`, `s3`, `s4`', confirming the stated S005 dependencies. | none — verified sound |
| s6/Depends on | ordering | LOW | manual | S006 depends on S002, S003 and S004 before the VS Code migration is delivered. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/DEF.md:178 explicitly states '**Depends on:** `s2`, `s3`, `s4`', confirming the stated dependencies. | none — verified sound |
| s7/Depends on | ordering | LOW | manual | S007 depends on S002, S003 and S004 before the JetBrains migration is delivered. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/DEF.md:194 explicitly states **Depends on:** `s2`, `s3`, `s4`, confirming the stated dependency ordering. | none — verified sound |
| s1/ac1/ac3; k7 | ordering | LOW | manual | S001 requires definition loading and validation to complete before the daemon serves requests. | DEF.md:92 explicitly requires a broken definitions file to be caught before the daemon serves anything. DEF.md:98 (ac1) requires loading definitions once at startup; DEF.md:100 (ac3) requires refusing startup for missing or invalid definitions. These confirm the required ordering; they do not establish the current implementation's startup order. | none — verified sound |
| s2/ac1; s4/ac5 | semantic | LOW | manual | The definitions response required by S002 must represent both shipped models and later user-approved models with per-model effort levels. | DEF.md:114 (s2/ac1) requires every family and its models, each model’s accepted effort levels, and a response shape that accommodates later user-approved models. DEF.md:149 (s4/ac5) requires approved non-shipped models to appear under their family, marked user-approved, with only their approved effort levels. These directly confirm the premise. | none — verified sound |
| s2/ac2 | closed-union | LOW | manual | S002 requires the existing per-provider model-list response and the full definitions response to derive their models from the same authority. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/DEF.md:115 explicitly requires the existing model-list answer to be drawn from the same definitions and agree with the full definitions answer. This confirms the stated S002 requirement; it does not establish current implementation compliance. | none — verified sound |
| FR004; s4/ac1; s4/lc2 | cross-artifact | LOW | manual | S004 specializes FR004's per-effort checking requirement by using Codex model-list evidence plus a model execution check, while retaining per-effort executions for Claude. | DEF.md:31 requires checking each claimed effort level. S004 ac1 at DEF.md:145 specifies Codex CLI model-list evidence plus a model execution check, and per-effort executions for Claude. DEF.md:154 (lc2) and evidence/def-cli-probes.md:20 explain that successful Codex execution does not establish effort support, so the CLI model list is authoritative. These lines confirm the stated specialization. | none — verified sound |
| s4/ac1; k3 | ordering | LOW | manual | S004 requires each model check to finish before the next LLM-reaching check starts. | DEF.md:145 in docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720 explicitly requires CLI model checks to run “one check at a time” (ac1, operationalizing k3). CLAUDE.md:122 requires serial for...of with sequential awaits for anything reaching an LLM provider, confirming each check must finish before the next starts. | none — verified sound |
| s4/ac2/ac3/ac4; k5 | ordering | LOW | manual | An unknown model may enter normal use only after capability checks finish, their evidence is shown and the user approves the resulting profile. | DEF.md:146 requires completed checks, presentation of accepted/rejected effort levels with CLI evidence, and user approval before model use. Lines 147–148 permit only passed effort levels after approval and require refusal when the profile is rejected or the CLI is unreachable. These lines confirm the stated ordering. | none — verified sound |
| S004:FR002; s4/ac3/ac5 | semantic | LOW | manual | An approved unknown-model profile must preserve its family, user-approved status and approved effort levels for both runtime selection and definitions responses. | The supplied DEF.md reads confirm the requirement: line 54 restricts unknown-model use to user-approved effort levels; line 147 requires tier selection to accept the checked model with only passing effort levels; line 149 requires definitions responses to include the model under its family, marked user-approved, with only approved effort levels. The truncated grep adds no relevant implementation evidence, but the cited requirements directly support the premise. | none — verified sound |
| FR005; s3/ac3 | closed-union | LOW | manual | S003 narrows the literal-removal requirement by allowing runner and model literals inside family implementations while requiring definitions-derived values in routing, provider construction, attribution and workflow code. | DEF.md:32 states FR005 broadly: every runner, CLI kind or model literal must come from the shared description. DEF.md:131 explicitly scopes ac3 to routing, provider construction, attribution and workflow code, with an exception for family implementations. These reads confirm the stated narrowing; the truncated grep results establish no contradiction. | none — verified sound |
| S003:FR004; k6; s3/ac4; s5/ac3; s6/ac3; s7/ac3 | closed-union | LOW | manual | The repo-settings restrictions consistently require global tier runner, model and effort values while permitting repo-specific role-to-tier selection. | DEF.md:49 explicitly removes per-repo runner, model and effort overrides. DEF.md:83 requires those settings to be global, allowing repo-specific role-to-tier selection and core floor. DEF.md:132 requires resolution to use global runner, model and effort values. The repo settings criteria at DEF.md:170, :186 and :202 consistently permit only role-to-tier editing; :186 and :202 also explicitly exclude runner/model fields. Existing per-repo override support in the grep evidence is behavior the artifact explicitly proposes removing, so it does not contradict the requirement. | none — verified sound |
| k6 | semantic | LOW | manual | Constraint k6 explicitly permits a repo-specific core floor in addition to repo-specific role-to-tier selection. | docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/DEF.md:83 explicitly states in k6: “per-repo configuration may only choose which tier each role uses (and the core floor).” This directly confirms both repo-specific role-to-tier selection and a repo-specific core floor. | none — verified sound |
| FR004; s4/ac1; s4/lc1 | closed-union | LOW | manual | The artifact includes Ollama among the built-in families and permitted probe transports, but S004's concrete unknown-model checking procedure specifies only Codex and Claude. | DEF.md:98 includes Claude CLI, Codex CLI and Ollama among the shipped families. DEF.md:153 permits checks through claude, codex or local Ollama. However, S004 ac1 at DEF.md:145 specifies unknown-model checks only for Codex and Claude, confirming the stated omission. FR004 at DEF.md:31 requires checking unknown models. | none — verified sound |

#### Proposed fixes

- **Problem** (assisted) — The evidence supports neither verification nor a mechanical correction to the premise.
  - option: Retain the premise pending targeted evidence confirming duplicated literals and their use.
  - option: Qualify the premise as unverified until consumer definitions and daemon ownership are demonstrated.

- **Problem** (assisted) — The supplied evidence supports only part of this compound premise; completing or narrowing its meaning requires review.
  - option: Narrow the premise to the literal TIER_EFFORTS list and summariser provider selection through tiers.cheap.runner.
  - option: Retain the full premise pending source reads showing DEFAULT_TIERS values, summariser model resolution, and literal or family-specific input-limit handling.

- **Problem; FR002** (assisted) — The evidence neither verifies the update requirement nor establishes a concrete implementation failure. No mechanical correction is supported.
  - option: Retain the premise after obtaining source evidence for embedded model facts and the client update requirement.
  - option: Reword the premise as a concern to verify, rather than an established requirement for introducing models or capabilities.

- **Problem; FR004** (assisted) — The supplied evidence neither confirms nor contradicts the claimed absence; no safe factual replacement is established.
  - option: Retain the premise as unverified pending focused production-source evidence covering profile storage and approval handling.
  - option: Reword the premise as an FR004 requirement to provide explicit user-approved capability profiles for models absent from known descriptions, without asserting current absence.

- **k7/c5; s1/ac3** (assisted) — The invocation is supported; its ordering relative to request serving is not established by the supplied evidence.
  - option: Retain the premise and gather startup, server activation, and catalog-consumer source lines establishing the ordering.
  - option: Narrow the premise to: “src/daemon/index.ts imports and awaits validateModelCatalog().”

- **Assumptions/c5; s1/ac1** (assisted) — The evidence supports validation-result caching and accessor declarations, but neither confirms nor contradicts the complete data flow.
  - option: Retain the premise pending source-body evidence confirming freezing and cached-value access.
  - option: Narrow the premise to the verified assignment of validateShape's result to cached and the existence of the accessor declarations.

- **Assumptions/c5** (assisted) — The evidence supports the mechanism's existence but does not establish its proposed extensibility.
  - option: Retain the premise pending source evidence showing how capability fields would be represented and validated.
  - option: Narrow the premise to the verified existence of catalog validation and boot integration, leaving capability extensibility unresolved.

- **k6; s3/ac4/ac5** (assisted) — Runner/model overrides are supported by the evidence; existing effort support remains unverified. The evidence does not justify removing the migration requirement.
  - option: Obtain TierModel, TieringOverride, and parser reads establishing whether per-repo effort overrides are supported.
  - option: Reword the premise to distinguish verified runner/model overrides from defensive cleanup of any stale effort fields.

- **Assumptions/c11** (assisted) — The supplied documentation asserts the premise without exposing the CLI evidence needed to verify it.
  - option: Retain the premise after adding installed CLI version and command-discovery probe output.
  - option: Reword the premise as an unverified assumption pending CLI probing.

- **c10; s6** (assisted) — The evidence verifies the citation's wording but supplies no grounding for the claimed implementation. No replacement implementation is established.
  - option: Retain the citation pending a targeted source check that establishes the file and its behavior.
  - option: Qualify c10 to state that the reported VS Code consumer-side implementation remains unverified.

- **s2/Depends on** (assisted) — The dependency is supported, but the supplied reads do not establish its full stated prerequisite.
  - option: Provide evidence establishing S001's validation responsibility and S002's definitions IPC scope.
  - option: Narrow the premise to the explicit dependency on s1, omitting the unverified validation and IPC assertions.

- **s3/Depends on** (assisted) — The evidence supports a dependency on s1 but does not establish the attributed story responsibilities.
  - option: Provide the S001 and S003 headings and scope lines to verify the full premise.
  - option: Narrow the premise to the evidenced dependency on s1, pending verification of its rationale.
