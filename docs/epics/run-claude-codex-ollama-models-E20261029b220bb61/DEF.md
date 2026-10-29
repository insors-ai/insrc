<!-- insrc:artifact DEF-b220bb6174a2f5ed -->

# Epic: run-claude-codex-ollama-models

## Summary

**Flavor:** enhancement

insrc can run its model work on the Claude Code and Codex command-line tools or on local Ollama models, but it cannot run those command-line tools on models that Ollama serves, including Ollama's hosted cloud models. This Epic lets a user pick, for any model tier, the Claude tool running on an Ollama model, from a list of models insrc declares as supported, marked cloud or local. The choice is offered the same way in the terminal UI, the VS Code extension and the JetBrains plugin, and the daemon runs it with the same structured, checked answers it gets today.

## Contents

1. [Problem](#1-problem)
2. [Functional requirements](#2-functional-requirements)
3. [Non-goals](#3-non-goals)
4. [Assumptions](#4-assumptions)
5. [Constraints](#5-constraints)
6. [Stories](#6-stories)
7. [References](#7-references)

## 1. Problem

Every tier of insrc's model work resolves to one of three runners: the Claude command-line tool on Anthropic's service, the Codex command-line tool on OpenAI's service, or a local Ollama model called directly [[c1]]. A user who wants the agentic behaviour of the Claude or Codex tool but on models served through Ollama, most often Ollama's hosted cloud models, has no way to ask for it: the families insrc knows, the approved-model records and the tier settings all admit only those three runners [[c2]] [[c3]], and the settings screens in the terminal UI and both IDE plugins offer nothing else [[c5]]. Such a user must leave insrc's settings and hand-edit tool configuration outside it, with no check that the model chosen can serve insrc's requests, no indication of which models are expected to work, and no record in insrc of what is actually running. The combination works in practice: both tools returned schema-conforming answers through Ollama in a probe, while a local model on a typical laptop was too slow for the Claude tool's prompt [[c6]], so users need guidance on which models to choose rather than an open field.

## 2. Functional requirements

- **E20261029b220bb61:FR001** — A user can set any model tier to run the Claude command-line tool on an Ollama model. _(The core capability the Epic adds.)_
- **E20261029b220bb61:FR002** — For each new runner the user chooses only among the models insrc declares as supported, and each model is shown as cloud or local. _(Supported models come from the definitions, mostly cloud (user decision).)_
- **E20261029b220bb61:FR003** — Work routed to a tier on a new runner returns answers that are checked against the requested structure, as with today's runners. _(insrc's pipeline depends on structured answers.)_
- **E20261029b220bb61:FR004** — The runner and model choice can be made from the terminal UI, the VS Code extension and the JetBrains plugin, and each shows the setting the daemon actually uses. _(Every settings surface must expose the new runners.)_
- **E20261029b220bb61:FR005** — When a chosen model or Ollama itself cannot serve the tier (for example Ollama not running, not signed in for a cloud model, or the model missing), the user is told why rather than getting a silent failure. _(Users otherwise cannot tell a misconfiguration from a model failure.)_

**s1:**

- **E20261029b220bb61:S001:FR001** — The definitions answer names the new runner and its supported models, each with a cloud or local mark and its effort levels.
- **E20261029b220bb61:S001:FR002** — Tier resolution accepts a new runner only with a model the definitions declare for it.

**s2:**

- **E20261029b220bb61:S002:FR001** — A tier on a new runner starts the matching command-line tool against the local Ollama with the chosen model and effort.
- **E20261029b220bb61:S002:FR002** — Structured answers from the new runners are checked against the requested structure, as for today's runners.
- **E20261029b220bb61:S002:FR003** — A new-runner failure caused by Ollama or the model names its cause.

## 3. Non-goals

- **Changing how the daemon's embeddings or a local model share the GPU when both run at once.** — User decision: GPU contention between a local Ollama model and the daemon's embeddings is out of scope for this Epic [[c4]].
- **Offering the new runners in the installers' default model setup.** — User decision: the installers' defaults are out of scope; the runners are reached through settings only [[c4]].
- **Discovering and offering whatever models a user's Ollama happens to have installed.** — User decision: the supported models for each new runner come from insrc's model definitions, not from what is installed [[c4]].
- **Calling Ollama's or any provider's API directly from insrc's own process for these runners.** — Project principle: cloud model access goes through the locally installed Claude and Codex tools; direct REST providers must not be reintroduced [[c7]].
- **Running the Codex command-line tool on Ollama models.** — User decision 2026-10-29 after a probe of eight Ollama cloud models: Ollama's cloud models ignore a requested output format on every route (format, response_format, text.format, output_config.format; ollama/ollama#12362), and the Codex tool's structured output relies on that format, so it returned prose for every cloud model. The Claude tool returned schema-checked answers for all eight, because it asks for the structure as a tool call and validates the arguments itself [[c9]].

## 4. Assumptions

- `high` Users of the new runners will mostly pick Ollama cloud models reached through a signed-in local Ollama, rather than local models. [[c4]]
- `med` Both command-line tools keep returning answers that match a requested schema when run on a supported Ollama model, as they did in the 2026-10-29 probe. [[c6]]
- `med` A local model on a typical development laptop may be too slow for the Claude tool's prompt, so local entries need to be chosen with care. [[c6]]
- `med` The model families, models, efforts and per-tier settings that already exist can carry the new runners without a separate settings scheme. [[c3]]

## 5. Constraints

| ID | Type | Text | Source |
| :--- | :--- | :--- | :--- |
| `k1` | contract | The models offered for each new runner are exactly those declared as supported in insrc's model definitions, each marked cloud or local; no surface offers a model the definitions do not declare. | [[c4]] |
| `k2` | invariant | Model work on the new runners reaches Ollama only through the locally installed Claude and Codex tools started as subprocesses; insrc's process makes no direct call to a model API. | [[c7]] |
| `k3` | contract | The existing tier, model and effort settings are reused for the new runners; an effort is offered and applied only where the chosen model supports it. | [[c4]] |
| `k4` | contract | The terminal UI, the VS Code extension and the JetBrains plugin offer the same runners and the same supported models, all taken from the daemon's one definitions answer. | [[c5]] |
| `k5` | convention | Calls to a model provider stay serial, never issued concurrently. | [[c8]] |
| `k6` | invariant | Today's runners (the Claude tool, the Codex tool and plain Ollama) keep their current behaviour and settings unchanged. | [[c1]] |

## 6. Stories

### 6.1 E20261029b220bb61:S001 — The model definitions declare the supported Ollama models for the Claude tool

**User value:** `size: M`

As a user, I see exactly which Ollama models insrc supports for running the Claude tool, each marked cloud or local, so I choose a model that is expected to work rather than guessing.

**Extends:** [[c5]] [[c2]]

**Acceptance criteria:**

- **ac1:** Given insrc's shipped model definitions, when a client asks the daemon for the model definitions, then the answer lists a Claude-on-Ollama runner with its supported models, and every model is marked cloud or local. _(operationalizes `k1`, `k4`)_
- **ac2:** Given a supported model that accepts effort levels and one that does not, when the definitions are read, then the first lists the effort levels it accepts and the second lists none. _(operationalizes `k3`)_
- **ac3:** Given a tier set to a new runner with a model the definitions do not declare for it, when the daemon resolves that tier, then the model is not used and the tier's resolution reports that the model is not supported for that runner. _(operationalizes `k1`)_
- **ac4:** Given tiers set to the Claude tool, the Codex tool or plain Ollama as today, when the definitions and tier resolution are read after this change, then those tiers resolve and are described exactly as before. _(operationalizes `k6`)_

### 6.2 E20261029b220bb61:S002 — The daemon runs a tier's work on the Claude tool against an Ollama model

**User value:** `size: L`

As a user who set a tier to a new runner, my workflows and analysis run on the Ollama model I chose, through the Claude tool, and return the same checked, structured answers as today.

**Depends on:** `s1`

**Extends:** [[c5]]

**Acceptance criteria:**

- **ac1:** Given a tier set to the Claude tool on a supported Ollama cloud model, with Ollama running and signed in, when work routed to that tier asks for a structured answer, then the Claude tool is started against the local Ollama with that model and the answer returned matches the requested structure. _(operationalizes `k2`, `k3`)_
- **ac2:** Given a tier on a new runner when Ollama is not running, the model is not available, or a cloud model is chosen and Ollama is not signed in, when work is routed to that tier, then the work fails with a message naming which of these is the cause, and nothing waits indefinitely. _(operationalizes `k2`)_
- **ac3:** Given several pieces of work routed to tiers on new runners, when they run, then calls to the model provider are made one at a time, never concurrently. _(operationalizes `k5`)_
- **ac4:** Given a tier on the Claude tool on Anthropic's service or the Codex tool on OpenAI's service, when work runs on it after this change, then the tool is started exactly as before, with no Ollama settings applied. _(operationalizes `k6`)_

**Local constraints:**

- `lc1` (invariant) The Ollama settings for a run apply only to that run's tool process and never change the user's own tool configuration or environment. [[c7]]

### 6.3 E20261029b220bb61:S003 — The terminal UI offers the new runners and their supported models for each tier

**User value:** `size: M`

As a terminal UI user, I can set a tier to the Claude tool on an Ollama model from the model tiers screen, choosing from the supported models marked cloud or local.

**Depends on:** `s1`

**Acceptance criteria:**

- **ac1:** Given the model tiers screen in the terminal UI, when the user changes a tier's runner, then the Claude-on-Ollama runner is offered next to today's runners. _(operationalizes `k4`)_
- **ac2:** Given a tier with a new runner selected, when the user picks a model, then only the models the definitions declare for that runner are offered, each marked cloud or local, and an effort is offered only where the model supports it. _(operationalizes `k1`, `k3`)_
- **ac3:** Given a tier saved on a new runner, when the screen is reopened, then it shows the runner, model and effort the daemon actually uses for that tier. _(operationalizes `k4`)_

### 6.4 E20261029b220bb61:S004 — The VS Code extension offers the new runners and their supported models for each tier

**User value:** `size: M`

As a VS Code user, I can set a tier to the Claude tool on an Ollama model from insrc's settings and tier picker, choosing from the supported models marked cloud or local.

**Depends on:** `s1`

**Acceptance criteria:**

- **ac1:** Given insrc's tier picker or its settings in VS Code, when the user changes a tier's runner, then the Claude-on-Ollama runner is offered next to today's runners. _(operationalizes `k4`)_
- **ac2:** Given a tier with a new runner selected, when the user picks a model, then only the models the definitions declare for that runner are offered, each marked cloud or local, and an effort is offered only where the model supports it. _(operationalizes `k1`, `k3`)_
- **ac3:** Given a tier set on a new runner in VS Code settings to a model the definitions do not declare for it, when the setting is saved, then the change is refused with the reason and the tier keeps its previous setting. _(operationalizes `k1`)_
- **ac4:** Given a tier saved on a new runner, when the user reopens the picker or settings, then they show the runner, model and effort the daemon actually uses. _(operationalizes `k4`)_

### 6.5 E20261029b220bb61:S005 — The JetBrains plugin offers the new runners and their supported models for each tier

**User value:** `size: M`

As a JetBrains user, I can set a tier to the Claude tool on an Ollama model from insrc's Settings, choosing from the supported models marked cloud or local.

**Depends on:** `s1`

**Acceptance criteria:**

- **ac1:** Given insrc's model tiers page in JetBrains Settings, when the user changes a tier's runner, then the Claude-on-Ollama runner is offered next to today's runners. _(operationalizes `k4`)_
- **ac2:** Given a tier with a new runner selected, when the user picks a model, then only the models the definitions declare for that runner are offered, each marked cloud or local, and an effort is offered only where the model supports it. _(operationalizes `k1`, `k3`)_
- **ac3:** Given a tier saved on a new runner, when the Settings page is reopened, then it shows the runner, model and effort the daemon actually uses. _(operationalizes `k4`)_

## 7. References

- **[[c1]]** `doc` `docs/daemon.md:488` — "Every resolved `runner` is one of `ollama` | `cli-claude` | `cli-codex`;"
- **[[c2]]** `code` `src/daemon/model-registry.ts:142` — "if (p['family'] !== 'cli-claude' && p['family'] !== 'cli-codex') return `unknown family '${String(p['family'])}'`;"
- **[[c3]]** `code` `src/config/analyze.ts:216` — "tierSetting(tiering: TieringOverride, tier: TierName, registry: ModelRegistry): TierSetting"
- **[[c4]]** `stakeholder` `user decisions in chat, 2026-10-29` — "this will mostly use cloud models, the model schema we built earlier should specify supported models, cloud and local"
- **[[c5]]** `analyze-bundle` `insrc_analyze_step how-does-it-work bundle on runner families, 2026-10-29` — "the definitions answer (modelDefinitions/projectDefinitions) is what the clients read"
- **[[c6]]** `stakeholder` `live probe 2026-10-29 (Ollama 0.40.12, claude 2.1.310, codex 0.165.0)` — "codex --output-schema returned {"answer":42,"word":"blue"}; claude --json-schema returned structured_output with mistral-large-3:675b-cloud in 7 s; a local 27B model hit HTTP 500 after 2m50s on claude"
- **[[c7]]** `doc` `CLAUDE.md#project-principles` — "No direct cloud REST calls from our process. Cloud LLM access happens through the locally-installed `claude` and `codex` CLI binaries (via `CliProvider`)."
- **[[c8]]** `convention` `CLAUDE.md#llm-provider-abstraction` — "Never `Promise.all` anything that reaches an LLM provider (cloud or local Ollama embed / complete); always serial `for...of` with sequential awaits."
- **[[c9]]** `stakeholder` `probe of 8 Ollama cloud models and user decision in chat, 2026-10-29` — "claude --json-schema returned structured_output for all 8 cloud models; codex --output-schema returned prose for all 8; user: keep codex out, claude code is the only ollama option supported"

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — define (define)

**0 HIGH · 5 MED · 8 LOW** · model `cli-claude:claude-sonnet-5` · reviewed 2026-10-29T16:40:11.879Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| c5 | semantic | MED | manual | The daemon's model/project definitions answer (the modelDefinitions/projectDefinitions payload) is the single data source that client settings screens (terminal UI, VS Code extension, JetBrains plugin) read to populate runner and model choices. | The evidence confirms two of the three claimed clients: (1) daemon-side `src/daemon/model-definitions.ts` exports `projectDefinitions` (model-definitions.ts:98), consumed by `src/daemon/list-models.ts:116` and tested in `src/daemon/__tests__/model-registry.test.ts:241`; (2) the JetBrains plugin's `DaemonGateway.modelDefinitions()` is read by `InsrcSettingsConfigurable`, `ModelTiersSection` (`gateway.modelDefinitions()`), and `ModelCheckFlow` to build `ModelTiersModel` (per S7/LLD.md:414, PLAN.md:79, and the ModelTiersWiringSourceScanTest.class strings). There is NO corresponding match for the terminal UI (`src/cli/`) or the VS Code extension (`vscode-plugin/`) in either grep — the `modelDefinitions` grep hit its 50-match cap while still inside `jetbrains-plugin/build/classes/...` compiled-class noise, and the `projectDefinitions` grep (8 matches, not capped) only shows `docs/`, `src/daemon/__tests__`, and `src/daemon/list-models.ts`/`model-definitions.ts` — no `vscode-plugin/` or `src/cli/` hits at all. | Before relying on c5 as given, re-run the grep scoped separately to `vscode-plugin/` and `src/cli/` (excluding noisy `*/build/classes/**` compiled artifacts) to confirm whether the terminal UI and VS Code extension settings screens actually read the modelDefinitions/projectDefinitions payload directly, or instead consume it indirectly via the derived `listModels`/`models.list` RPC (a different shape). If VS Code/CLI turn out to only consume the derived per-family list rather than the raw definitions payload, reword c5 to scope the 'single data source' claim to what each client actually calls. |
| c6 | external-contract | MED | manual | In a live probe dated 2026-10-29 against Ollama 0.40.12, claude 2.1.310 and codex 0.165.0, codex --output-schema returned a schema-conforming JSON answer and claude --json-schema returned a structured_output using model mistral-large-3:675b-cloud within 7 seconds, while a local 27B model caused claude to receive an HTTP 500 after 2 minutes 50 seconds. | The grep sweeps for /output-schema/, /json-schema/, and /structured_output/ only surface the premise's own restatement (docs/epics/run-claude-codex-ollama-models-E20261029b220bb61/DEF.md:158 and the gate table at :175) plus generic, unrelated repo-wide usages of the two CLI flag names and the structured_output envelope field (e.g. src/agent/providers/cli-provider.ts:359-387, cli-provider.ts:974, assorted test files, and other standalone ISSUE/LLD docs about root-union schema rejection and codex strict-mode keyword handling). None of that evidence contains or corroborates the premise's specific live-probe facts: the 7s/2m50s timings, the HTTP 500, or the model name mistral-large-3:675b-cloud. Those are facts from a one-off external live session (hitting Ollama-served models through the claude/codex CLIs) that leave no trace in the source tree a grep/read probe could re-derive. Tellingly, DEF.md:175 itself records that the prior automated review of this exact row could not judge it: 'Not judged: the reviewing model call failed twice. Last error: claude exited with 1.' | Mark c6 as an attested-but-unverifiable external observation rather than something the static-evidence gate can confirm or refute. Either accept it on the stakeholder's authority (live CLI/Ollama timing and error-code claims are inherently outside repo-grounded verification) or re-run the live probe to reconfirm the exact figures (7s success, HTTP 500 after 2m50s, the mistral-large-3:675b-cloud model id) before any downstream design decision leans on the precise numbers. |
| s2 | cross-artifact | MED | manual | Story S002's acceptance criteria (ac1, ac2, ac3, ac4) cite constraints k2, k3, and k5, each of which is defined with matching semantics in the Epic's Constraints table in section 5. | No probes were run for this premise — the gathered evidence set is empty. There is no ripgrep match or path:line read confirming or contradicting that S002's ac1-ac4 cite k2, k3, k5, nor any confirming those constraint ids are defined with matching semantics in the Epic's section 5 Constraints table. | Re-run grounding probes for this premise: locate S002's LLD/story file and extract the literal constraint-id citations on ac1-ac4, then locate the Epic's section 5 Constraints table and compare the semantics of k2, k3, k5 against what S002 assumes. Until that evidence exists, treat the cross-artifact consistency claim as unverified rather than confirmed. |
| s2 | ordering | MED | manual | Story S002 declares 'Depends on: s1', meaning Story S001's model-definitions work (naming the two new runners and their supported models) must land before S002's runner-execution logic can resolve a model for those runners. | No probes were run for this premise — the gathered evidence block is empty, so there is nothing to confirm or contradict the claim that S002 ('Depends on: s1') requires S001's model-definitions work (naming the two new runners and their supported models) to land before S002's runner-execution logic can resolve a model. | Re-run grounding probes for this premise (e.g. locate S001's and S002's artifact text for the 'Depends on' declaration, and locate the runner-definition/model-resolution symbols S002 would call) before relying on this ordering claim; if the probes confirm the dependency as stated, no artifact change is needed. |
| c4 | external-contract | MED | manual | User decisions recorded in chat on 2026-10-29 establish that supported models for the new runners come only from insrc's model definitions (not from Ollama auto-discovery), that GPU contention between Ollama and daemon embeddings is out of scope, and that installer default model setup is out of scope. | No probes were run for this premise — the gathered evidence is explicitly empty ("no probes were run for this premise — treat as UNVERIFIABLE"). The premise asserts a historical fact (user decisions recorded in chat on 2026-10-29 about model-source restriction, GPU-contention scope exclusion, and installer-default scope exclusion) that is not groundable in source code via ripgrep/path:line probes — it is a claim about conversation history, not code structure. | Confirm the cited chat-decision claims against the actual 2026-10-29 conversation transcript (or an ADR/decision log if one was written) rather than source probes; if no durable record of the decision exists, have the author add a citation (transcript excerpt, decision doc, or linked issue) so the premise is independently checkable. Until then, flag this premise as unverified-by-engine in the artifact. |
| c1 | citation | LOW | manual | docs/daemon.md line 488 contains verbatim: "Every resolved `runner` is one of `ollama` \| `cli-claude` \| `cli-codex`;" | Direct read of docs/daemon.md:488 returns: "Every resolved `runner` is one of `ollama` \\\| `cli-claude` \\\| `cli-codex`;" which matches the premise's claimed verbatim text exactly, character for character. | none — verified sound |
| c1 | closed-union | LOW | manual | The set of runners insrc resolves model work to today is exactly {ollama, cli-claude, cli-codex} with no fourth runner present anywhere in the current codebase. | docs/daemon.md:488 states verbatim: Every resolved `runner` is one of `ollama` \| `cli-claude` \| `cli-codex`. This is corroborated across every other hit in both grep sweeps: docs/daemon.md:432-439 (three-tier table), docs/daemon.md:380-382/455-457 (tiers.core/mid/cheap config examples), the frame-epic-per-role-per-step HLD/S001/S003/S004/S005/S006 LLDs repeatedly typing runner: 'ollama' \| 'cli-claude' \| 'cli-codex' (e.g. HLD.md:29,139,171,253; S001/LLD.md:33,37,179,267,273,294; S003/LLD.md:41,110,144,147,275,307,314,356), the per-family-model-definitions epic's AnalyzeShaperProviderKind/ModelProvider type (work-framed-approved-spec DEF.md:128, S001/LLD.md:238, S002/LLD.md:85,88,153,248, S003/LLD.md:51, S004/LLD.md:31), the live test assertions in src/daemon/__tests__/list-models.test.ts:133,216,228 (invalid-params: provider must be one of 'ollama' \| 'cli-claude' \| 'cli-codex', explicitly rejecting a fourth value like 'cli-gemini'), and jetbrains-plugin/.../DaemonGateway.kt:696. Every citation across both 50-match-capped grep sweeps and the regex sweep enumerates exactly these three values; no fourth runner (e.g. an 'openai'/'gemini'/REST runner) appears anywhere as an admitted member. One hit (S003/LLD.md:307) even shows a non-member ('openai'/'cli-claud') being explicitly coerced away, reinforcing closure. | none — verified sound |
| c2 | citation | LOW | manual | src/daemon/model-registry.ts line 142 contains verbatim: "if (p['family'] !== 'cli-claude' && p['family'] !== 'cli-codex') return `unknown family '${String(p['family'])}'`;" | read src/daemon/model-registry.ts:142 → FOUND: 	if (p['family'] !== 'cli-claude' && p['family'] !== 'cli-codex') return `unknown family '${String(p['family'])}'`; — exact verbatim match of the cited line content and location. | none — verified sound |
| c2 | closed-union | LOW | manual | model-registry.ts's family validation at line 142 admits only the literal family values 'cli-claude' and 'cli-codex' as non-ollama families, rejecting every other family string. | read src/daemon/model-registry.ts:142 returns exactly: `if (p['family'] !== 'cli-claude' && p['family'] !== 'cli-codex') return \\`unknown family '${String(p['family'])}'\\`;` — a verbatim match of the premise's quoted citation. The grep for /family'\\]\\s*!==\\s*'cli-claude'/ confirms this is the only such check at that line, and the broader /unknown family/ grep shows no other branch in model-registry.ts admitting a third family literal. The premise's claim that the check accepts only 'cli-claude' and 'cli-codex' as non-ollama families is exactly what the code does. | none — verified sound |
| c3 | citation | LOW | manual | src/config/analyze.ts line 216 defines the function signature: tierSetting(tiering: TieringOverride, tier: TierName, registry: ModelRegistry): TierSetting | read src/config/analyze.ts:216 → FOUND: function tierSetting(tiering: TieringOverride, tier: TierName, registry: ModelRegistry): TierSetting { — exact verbatim match of the premise's claimed signature at the cited line. | none — verified sound |
| c7 | citation | LOW | manual | CLAUDE.md's project-principles section states verbatim: "No direct cloud REST calls from our process. Cloud LLM access happens through the locally-installed `claude` and `codex` CLI binaries (via `CliProvider`)." | CLAUDE.md:12 reads: "- **No direct cloud REST calls from our process.** Cloud LLM access happens through the locally-installed `claude` and `codex` CLI binaries (via `CliProvider`). Auth + quota stay with the user's CLI OAuth sessions. Direct REST providers to Anthropic / OpenAI / Gemini / Mistral must not be reintroduced." This sits under the 'Project principles' heading, matching anchor CLAUDE.md#project-principles, and the quoted sentence appears verbatim (modulo markdown bold markers), also mirrored in AGENTS.md:12. | none — verified sound |
| c8 | ordering | LOW | manual | CLAUDE.md's llm-provider-abstraction section states verbatim: "Never `Promise.all` anything that reaches an LLM provider (cloud or local Ollama embed / complete); always serial `for...of` with sequential awaits." | grep for the exact phrase "Never `Promise.all`" returns a match at CLAUDE.md:121: "- Never `Promise.all` anything that reaches an LLM provider (cloud or local Ollama embed / complete); always serial `for...of` with sequential awaits." This is character-for-character identical to the premise's quoted text, and the second grep ("always serial") confirms the same line. The anchor CLAUDE.md#llm-provider-abstraction correctly points at this section (the file's LLM provider abstraction subsection under Code conventions). | none — verified sound |
| epic | inventory | LOW | manual | The Epic's functional requirements, stories, and constraints name exactly two new runners throughout the document — the Claude command-line tool on an Ollama model, and the Codex command-line tool on an Ollama model — with no third new runner introduced anywhere in the artifact. | All 14 Claude-on-Ollama and 23 Codex-on-Ollama matches in run-claude-codex-ollama-models-E20261029b220bb61/DEF.md are consistent with exactly two new runners: ac1 (S001, line 81) states the definitions list 'a Claude-on-Ollama runner and a Codex-on-Ollama runner'; S001's ac1/ac4 (lines 118-132-147) repeat 'the Claude-on-Ollama and Codex-on-Ollama runners are offered next to today's runners' across TUI/VS Code/JetBrains; S002 (line 86) is titled 'The daemon runs a tier's work on the Claude or Codex tool against an Ollama model' with ac1/ac2 (lines 98-99) covering only those two; k6 (line 67) explicitly scopes 'today's runners (the Claude tool, the Codex tool and plain Ollama)' as the EXISTING, unchanged set, distinct from the two new ones; k1 (line 176) again names only 'the new Claude-on-Ollama and Codex-on-Ollama runners'. No match introduces a third new runner — the other hits are from an unrelated prior epic (per-family-model-definitions-served-daemon) or generic doc references to the three existing families. | none — verified sound |

#### Proposed fixes

- **c5** (manual) — The gap is an evidence-coverage problem (truncated/noisy grep), not a known-wrong fact, so there is no safe mechanical text substitution — it needs a targeted re-grep of vscode-plugin/ and src/cli/ to either confirm or correct the claim's scope.
  - option: Re-run grep scoped to vscode-plugin/ and src/cli/ excluding build artifacts, then confirm c5 as-is if both clients call 'models.definitions'/projectDefinitions directly
  - option: Narrow c5 to only the clients actually confirmed (daemon + JetBrains) and file the VS Code/terminal-UI claim as unverified pending its own probe
  - option: Leave c5 MED/manual as already marked in DEF.md (self-flagged 'not judged' previously) and re-attempt the review call

- **c6** (manual) — No repo artifact can confirm or deny live external-service timing/error-code behavior; this is a genuine evidence gap, not a wrong citation.
  - option: Accept the stakeholder-reported probe as authoritative and proceed without further verification.
  - option: Re-run the live probe (same CLI/model versions) to reconfirm the timings, HTTP 500, and model id before relying on exact figures.
  - option: Soften the premise to a qualitative claim (cloud-served models respond quickly, large local models can time out) if the exact numbers are not load-bearing for the design.

- **s2** (manual) — No evidence was gathered, so no mechanical text correction can be derived; a human or a follow-up grounding pass must supply the actual citations/definitions before any edit can be proposed.
  - option: Re-run the probe pipeline for this premise and re-review once evidence is gathered
  - option: Manually inspect S002's AC text and the Epic section 5 Constraints table for k2/k3/k5 and confirm/deny by hand
  - option: Accept as unverified and proceed, flagging it for a later audit pass

- **s2** (manual) — 
  - option: Re-run the grounding probes for s2/S001/S002 and re-judge once evidence exists
  - option: Leave as UNVERIFIABLE and proceed since dependency ordering (s2 depends on s1) is visible directly in the artifact's own 'Depends on' field, independent of this probe

- **c4** (manual) — This is a scope/decision claim grounded in conversation history, not in the code graph, so there is no mechanical text correction derivable from source evidence; a human needs to confirm the decision actually occurred as described or supply a citable record.
  - option: Accept as-is on the author's recollection of the 2026-10-29 chat (no change)
  - option: Add an explicit citation/link to a decision record (chat log excerpt, ADR, or tracker comment) substantiating the three scope decisions
  - option: Downgrade the premise from 'external-contract' to a narrative note pending confirmation, so it doesn't gate build/review as a hard contract
