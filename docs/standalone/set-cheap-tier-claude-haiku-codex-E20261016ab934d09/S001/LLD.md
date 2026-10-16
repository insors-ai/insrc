<!-- insrc:artifact LLD-ab934d0926ef5dc7-S001 -->

# LLD: E20261016ab934d09:S001

## Summary

**Epic:** `set-cheap-tier-claude-haiku-codex`
**HLD base run:** `wf-1792143109008-jgu0pi`
**HLD effective hash:** `ab934d0926ef...`

A fresh install, and a machine with no tiers configured, now uses Claude haiku for the cheap tier instead of a local Ollama model. A fresh Codex install uses gpt-6-astra for core, gpt-6.1-sol for mid and gpt-6-luna for cheap, and the model picker lists those three Codex models. Config files that already name their tiers are not changed, so existing installs keep the models they have until their owner changes them.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)
9. [Open questions](#9-open-questions)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal

### 2.1 `DEFAULT_TIERS`

```typescript
export const DEFAULT_TIERS: Readonly<Record<TierName, TierModel>>
```

**Returns:** `Readonly<Record<TierName, TierModel>>` — The built-in model for each tier: core cli-claude/opus, mid cli-claude/sonnet and cheap cli-claude/haiku, used by the role router when a tier is configured neither globally nor per repo

**Preconditions:**
- A tier is not named by the config: resolveTiers fills every tier the parsed override does not name (or names without a model) from DEFAULT_TIERS before the role router reads it (src/config/analyze.ts:225-231, 257)

**Postconditions:**
- core and mid are unchanged
- cheap is { runner: 'cli-claude', model: 'haiku' }
- The type and the readers of DEFAULT_TIERS (the role router and the tiers pane) are unchanged
- The built-in cheap default reaches every role-routed cheap call and the background summariser on a machine whose config names no cheap tier, whatever the per-repo override, per-run client default or legacy shaperProvider key; those legacy signals are only consulted by the router's fallback branch, which assembled configs never reach

## 3. Data model changes

### 3.1 `DEFAULT_TIERS.cheap` — field-modify

The cheap tier's built-in value changes from { runner: 'ollama', model: 'qwen3.6:27b' } to { runner: 'cli-claude', model: 'haiku' }. A machine whose config names no cheap tier now sends classification, narrow probes, tracker rendering and summaries to the Claude CLI instead of local Ollama. The comment above the constant, which names stale Codex models, is corrected. resolveTiers fills any unnamed tier from DEFAULT_TIERS, so the router's per-repo and client-default fallback branch is not reached by assembled configs and the default applies regardless of them.

**Call sites:**
- `src/config/analyze.ts`
- `src/analyze/context/role-router.ts`
- `src/cli/panes/model-tiers.ts`

### 3.2 `Summariser provider derivation` — invariant-change

assembleConfig derives summariserProvider and summariserModel from the resolved cheap tier (src/config/analyze.ts:252-254), and buildSummariserProvider (src/analyze/context/shaper-provider.ts:264-285) says the background summariser must not spawn a claude or codex process per document, which held only because the cheap default was Ollama. The owner's decision is that the summariser follows the cheap tier, because not every machine can run even a small local model (about 18 GB of memory), so on the new default it runs on the Claude CLI per document. That is kept, with one correction: buildSummariserProvider pinned a CLI model only when summariserModelExplicit was true, so on a machine taking the built-in default it would spawn claude with no model and run the CLI's own default model, not haiku. The correction is that a CLI summariser always pins the cheap tier's model when it is non-empty, so the summariser runs on haiku (or gpt-6-luna for Codex) and never on the CLI default. The doc comment is rewritten to say the summariser follows the cheap tier and why. A machine whose config already names an Ollama cheap tier keeps a local summariser, as before.

**Call sites:**
- `src/config/analyze.ts`
- `src/analyze/context/shaper-provider.ts`

### 3.3 `Tier options in the config catalog and the plugin manifest` — field-modify

The catalog's cheap.runner default becomes 'cli-claude' and cheap.model default 'haiku', and their descriptions stop saying 'local by default'. The plugin manifest's insrc.models.tiers.cheap.runner and cheap.model defaults change to match, which the manifest-catalog test pins. models.local.coreModel and its default qwen3.6:27b are not touched, since that is the local embedder-side summariser and not a tier.

**Call sites:**
- `src/config/config-catalog.ts`
- `vscode-plugin/package.json`

### 3.4 `Installer tier maps` — field-modify

In the claude choice the cheap entry becomes cli-claude/haiku and the 'ok' line says so. In the codex choice core becomes cli-codex/gpt-6-astra, mid cli-codex/gpt-6.1-sol and cheap cli-codex/gpt-6-luna, and the 'ok' line names them. The plugin's copy of the script is updated to match. A config.json the installer wrote earlier holds its tiers explicitly, so it keeps its values; the installer only writes tiers when it creates the file.

**Call sites:**
- `scripts/insrc-daemon-install.sh`
- `vscode-plugin/assets/insrc-daemon-install.sh`

### 3.5 `Cloud model catalog (cli-codex)` — field-modify

The cli-codex list changes from gpt-5-codex, gpt-5 and o4-mini to gpt-6-astra, gpt-6.1-sol and gpt-6-luna, with display names GPT-6 Astra, GPT-6.1 Sol and GPT-6 Luna. The cli-claude list already holds claude-haiku-4-5-20251001 and is unchanged. Tier model ids are free strings in the config catalog, so a config that names a model no longer listed still works.

**Call sites:**
- `src/assets/models/cloud-model-catalog.json`
- `src/daemon/model-catalog.ts`

### 3.6 `Docs and comments naming the defaults` — field-modify

docs/installation.md (the line that says Codex uses gpt-5.5 and cheap stays local), docs/index.html (the same sentence), docs/daemon.md (the tier table, the sentence about the installer's Codex choice, both config examples at the top of the models section and in the tiering section, the line that says the summariser is derived from tiers.cheap, and the line that says summaries run on a cheap local model), the comment in src/daemon/steps/build-step/phases/validate.ts that names gpt-5.5 as the Codex default, the AnalyzeConfig field docs in src/config/analyze.ts that say summarising stays local by default (lines 170-178), the comments in src/analyze/context/role-router.ts that say peripheral roles go to local and the summariser stays local (lines 80 and 132), the indexing note in src/config/role-taxonomy.ts that says cheap is already local, the sync note in src/shared/model-recommender.ts that names DEFAULT_TIERS.cheap, the doc comment of buildSummariserProvider, the header comment and the claude 'ok' line of the installer's tier step, and the sentence in vscode-plugin/README.md that frames the cheap tier as local are brought in line with the new values and with the summariser following the cheap tier. site/cli.html, whose tiers-pane text describes peripheral roles on cheaper local models, is updated too. CLAUDE.md and AGENTS.md state the principle that peripheral roles may trade capability for cost on cheaper models; their wording about local models is left as it is, since the principle holds for a cloud cheap model as well and changing project principles is not part of this Story.

**Call sites:**
- `docs/daemon.md`
- `src/daemon/steps/build-step/phases/validate.ts`
- `src/analyze/context/shaper-provider.ts`
- `src/shared/model-recommender.ts`
- `src/analyze/context/role-router.ts`
- `src/config/analyze.ts`
- `src/config/role-taxonomy.ts`
- `vscode-plugin/README.md`
- `scripts/insrc-daemon-install.sh`
- `docs/installation.md`
- `docs/index.html`
- `site/cli.html`

## 4. Error paths

**Error cases**

- **A machine with no cheap tier configured has no claude binary (for example a Codex-only user whose config names no tiers, or a machine where the install did not write them), so the new cheap default points at a CLI that is not there.** (recoverable)
  - Detection: The CLI provider retries one spurious spawn failure (ENOENT) in runSubprocess and then returns the non-zero result, which the provider turns into an error for the caller (src/agent/providers/cli-provider.ts), so the role that resolved to the cheap tier ends in an error and not an empty answer.
  - Response: The failure is reported by the role that needed the cheap model, as any unreachable provider is today. The Story adds no pre-check; the Codex install writes cheap tiers that name Codex, and the Claude install assumes the claude binary the user chose.
  - User impact: Classification, probes and summaries fail on that machine until the user installs the CLI or sets the cheap tier in the TUI or settings.
- **The cheap tier's model id is rejected by the CLI (an id the account does not accept).** (recoverable)
  - Detection: The CLI answers with an error for the model, as it does for an unknown Codex id; the three Codex ids and the haiku alias were each run once against the CLIs on this machine and accepted.
  - Response: The error reaches the caller of that role; the id can be changed in the config.
  - User impact: The same as an unreachable provider until the id is corrected.
- **Indexing summarises many documents, and the background summariser follows the cheap tier, which now defaults to a cloud CLI, so each summarised document is one CLI call.** (recoverable)
  - Detection: Not detected as an error: the calls succeed and use the user's quota. The model the summariser runs on is logged by buildSummariserProvider ('summariser provider: routing through CliProvider') with the pinned model, which the tests check is haiku and not the CLI default.
  - Response: None beyond the pin: the cost is the accepted price of a default that works on machines that cannot run a local model. A user with a local model sets the cheap tier to ollama in the TUI or settings, which also moves classification and probes local.
  - User impact: Indexing summaries use Claude quota (or Codex quota on a Codex install) on a machine that takes the new default; the work is serial per document, so a large first index is slower than a local model on a capable machine.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| An existing ~/.insrc/config.json that names the tiers explicitly (the installer wrote it) | Unchanged: the explicit cheap tier, still ollama/qwen3.6:27b on this machine, wins over the built-in default, so nothing changes until the owner edits it. |
| A config that sets only models.tiers.core and leaves cheap unset | The cheap tier falls back to the new built-in default, cli-claude/haiku. |
| A Codex install | The installer writes core cli-codex/gpt-6-astra, mid cli-codex/gpt-6.1-sol and cheap cli-codex/gpt-6-luna, with coreFloor 'core' as before. |
| A per-repo override of the cheap tier under models.byRepo | Wins over both the global value and the built-in default, as before. |
| models.local.coreModel and the embedder-side summariser | Still qwen3.6:27b on Ollama; they are not tiers and are not changed. |
| A config that names gpt-5.5 or another model no longer listed in the cloud catalog | Still works: tier model ids are free strings, and the catalog is only the picker's list. |
| The indexer summarises a document on a machine that takes the built-in or installer default | The summariser spawns the Claude CLI with the model pinned to haiku (gpt-6-luna on a Codex install), not the CLI's default model. |
| The cheap tier names a runner with an empty or missing model (the JetBrains settings write only a runner when the user switches it) | The tier is ignored at parse time with a warning, and the built-in cheap default (cli-claude/haiku) applies; the summariser then pins haiku, and the CLI's own default model never runs. |
| A config that names cheap on ollama with qwen3.6:27b (every install made before this change) | The summariser stays on local Ollama, as before. |
| A Codex MCP client runs on a machine whose config names no cheap tier | Cheap roles go to the built-in cheap default, cli-claude/haiku, and so to the claude binary, not to codex; this is accepted. A Codex install names its own tiers, so it is not affected. |

**Invariants to preserve**

- A tier configured globally, per repo or by the legacy shaperProvider key wins over the built-in default; DEFAULT_TIERS is a fallback only. [[c1]]
- core and mid built-in defaults, and the coreFloor behaviour for critical roles, are unchanged. [[c1]]
- The plugin manifest's tier defaults equal the config catalog's, as the manifest-catalog test requires. [[c2]]
- The two copies of the installer script stay identical, and an existing config.json is never rewritten by the installer. [[c2]]
- The cloud model catalog stays a picker list only: no behaviour depends on a model being in it. [[c3]]
- The summariser and the role router read the same cheap tier, so a user changes both by changing one setting; neither falls back to a model the user did not choose. [[c1]]

## 5. Test strategy

**Test framework:** `node:test run with tsx (npx tsx --test), tests under __tests__ beside the code, as the existing model-tiers and role-router tests`

**Test levels**

- **unit** — The built-in default and the options that repeat it resolve the cheap tier to Claude haiku (the catalog's core model default is empty, meaning the CLI default, and is not compared), the summariser follows it, and an explicit config still wins.
  - Subjects: `src/cli/__tests__/model-tiers.test.ts: empty tiering: tiers = DEFAULT_TIERS (source default), coreFloor = mid (default)`, `src/config/__tests__/tier-defaults.test.ts: the config catalog's cheap and mid tier defaults equal DEFAULT_TIERS`, `src/analyze/context/__tests__/role-router.test.ts: a configured cheap tier wins over the built-in cheap default`, `src/config/__tests__/tier-defaults.test.ts: the summariser follows the cheap tier and pins its model for a CLI, so the built-in default runs the Claude CLI on haiku`
- **contract** — The installer and the shipped catalog name the intended models for each CLI choice, and the plugin's installer copy is the script.
  - Subjects: `src/config/__tests__/tier-defaults.test.ts: the installer's claude choice writes cheap cli-claude haiku and its codex choice writes gpt-6-astra, gpt-6.1-sol and gpt-6-luna`, `src/config/__tests__/tier-defaults.test.ts: the plugin's copy of the installer is identical to the script`, `src/daemon/__tests__/model-catalog-asset.test.ts: the shipped cloud model catalog lists the three GPT-6 Codex models`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `src/cli/__tests__/model-tiers.test.ts: empty tiering: tiers = DEFAULT_TIERS (source default), coreFloor = mid (default)`, `src/config/__tests__/tier-defaults.test.ts: the config catalog's cheap and mid tier defaults equal DEFAULT_TIERS`, `src/config/__tests__/tier-defaults.test.ts: the summariser follows the cheap tier and pins its model for a CLI, so the built-in default runs the Claude CLI on haiku` |
| `ac2` | `src/config/__tests__/tier-defaults.test.ts: the installer's claude choice writes cheap cli-claude haiku and its codex choice writes gpt-6-astra, gpt-6.1-sol and gpt-6-luna`, `src/config/__tests__/tier-defaults.test.ts: the plugin's copy of the installer is identical to the script`, `src/daemon/__tests__/model-catalog-asset.test.ts: the shipped cloud model catalog lists the three GPT-6 Codex models` |
| `ac3` | `src/analyze/context/__tests__/role-router.test.ts: a configured cheap tier wins over the built-in cheap default`, `src/config/__tests__/tier-defaults.test.ts: the summariser follows the cheap tier and pins its model for a CLI, so the built-in default runs the Claude CLI on haiku` |

## 6. Migration

**State before:** DEFAULT_TIERS in src/config/analyze.ts gives the cheap tier ollama/qwen3.6:27b, the config catalog and the plugin manifest repeat that default with 'local by default' wording, the installer writes cheap on Ollama for both CLI choices and gpt-5.5 for core and mid in the Codex choice, and the shipped cloud catalog lists gpt-5-codex, gpt-5 and o4-mini for Codex (s1 bundles 1 to 3).

**State after:** DEFAULT_TIERS and the config catalog default the cheap tier to cli-claude/haiku, the plugin manifest matches, the installer's claude choice writes cheap cli-claude/haiku, its codex choice writes core cli-codex/gpt-6-astra, mid cli-codex/gpt-6.1-sol and cheap cli-codex/gpt-6-luna, the shipped cloud catalog lists those three Codex models, and the docs and comments say so. Existing config.json files keep the tiers they name. The background summariser follows the cheap tier, so on the new default it runs on the Claude CLI pinned to haiku.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Flip the cheap default in DEFAULT_TIERS, the config catalog entries and their descriptions, and the plugin manifest defaults, correct the stale comment above DEFAULT_TIERS, and make the CLI summariser pin the cheap tier's model when it is non-empty so it never runs on the CLI default model. — ↩ rollbackable
2. Change the installer's claude and codex tier maps and their 'ok' lines, and copy the script into the plugin's assets. — ↩ rollbackable
3. Replace the cli-codex entries of the shipped cloud model catalog with the three GPT-6 models. — ↩ rollbackable
4. Update docs/daemon.md, docs/installation.md and docs/index.html and site/cli.html, the comments named in the data model section, and the comment in the build validate phase, and update or add the tests that pin the defaults. docs/release-notes-daemon-0.2.1.md is historical and is left as it is. — ↩ rollbackable

**Backward compat:** An existing ~/.insrc/config.json is not rewritten, and a tier it names wins over the built-in default, so installed machines keep the models they use; only a machine with no cheap tier configured, and fresh installs, take the new default. Config values and keys keep their names and types, so a config that names gpt-5.5, gpt-5 or o4-mini still resolves, since tier model ids are free strings and the shipped catalog only fills the picker. The daemon, the plugin and the JetBrains plugin read the same keys as before. A fresh install or an unconfigured machine now needs the claude binary for the cheap tier, for classification, probes, tracker rendering and indexing summaries, and spends CLI quota on them.

## 7. Alternatives considered

### 7.1 a1: Change each literal in place — **CHOSEN**

Edit the default wherever it is written: DEFAULT_TIERS, the config catalog, the plugin manifest, the two installer copies, the cloud model catalog, the docs and the tests that pin them.

Replace the cheap default with cli-claude / haiku in DEFAULT_TIERS, the config catalog entries (runner, model and their 'local by default' descriptions) and the plugin manifest defaults. In the installer, change the claude choice's cheap entry and the codex choice to core gpt-6-astra, mid gpt-6.1-sol and cheap gpt-6-luna, in both copies. Replace the cli-codex entries of the cloud model catalog with the three GPT-6 models, correct the stale comments that name gpt-5.4 and gpt-5.5, update docs/daemon.md, and update the tests that pin the old values. Nothing is added that checks the places agree.

### 7.2 a2: Name the defaults once and read them everywhere

Move the tier defaults to one JSON asset that DEFAULT_TIERS, the config catalog, the plugin manifest check and the installer all read.

Create a single asset holding the claude and codex tier maps, load it for DEFAULT_TIERS and the config catalog, have a build step generate the plugin manifest defaults from it, and have the installer script read it with a small JSON helper instead of its own heredocs. Then change the values once in that file.

**Rejected because:** Removes the repeated data, but rebuilds how the daemon, the plugin and a shell installer obtain their defaults, which is far beyond a change of values and adds a loading path that can fail at install time.

### 7.3 a3: Change the literals, and add a drift check

Do a1, and add one test that compares the installer's tier maps and the plugin manifest with DEFAULT_TIERS and the cloud model catalog.

Do a1. Add a contract test that reads scripts/insrc-daemon-install.sh and checks that its claude tier map equals DEFAULT_TIERS, that its codex tier map names the three GPT-6 models, that the vscode-plugin/assets copy is identical to the script, and that every model the installer writes for a cli-codex or cli-claude tier is listed in the cloud model catalog. The test fails when one place is changed without the others.

**Rejected because:** The part of a3 that matters is already in the plan as plain string checks (what each installer choice writes, and that the plugin's copy equals the script). What is not built is the rest of a3: comparing the installer's whole tier map with DEFAULT_TIERS and with the catalog by parsing shell text, which breaks whenever the installer's layout changes; that can be raised as its own item.

## 8. References

- **[[c1]]** `analyze-bundle` `The built-in tier defaults and who reads them`
- **[[c2]]** `analyze-bundle` `Where the same defaults are repeated as data`
- **[[c3]]** `analyze-bundle` `The cloud model catalog and the docs`
- **[[c4]]** `analyze-bundle` `Tests that pin the defaults`
- **[[c5]]** `code` `src/config/analyze.ts:123` — "export const DEFAULT_TIERS: Readonly<Record<TierName, TierModel>> = {"

## 9. Open questions

- Acceptance criteria are derived from the Story's user value (the Story has none): ac1 the built-in and catalog defaults make the cheap tier cli-claude haiku; ac2 the Codex install and the shipped catalog name the three GPT-6 models and the plugin's installer copy equals the script; ac3 a configured cheap tier still wins over the built-in default.
- Known gap: the plugin's manifest-catalog test compares each manifest default with the config catalog, so it covers the manifest's new cheap defaults once it passes; it was failing in a run earlier this session (two tests), so whether it fails before this Story is to be confirmed by running it before and after the build.
- The installer's tier map for a Codex install now names GPT-6 ids that were each run against the Codex CLI on the build machine; an account that does not accept one of them fails on that tier until the id is changed.
- Audit partial (dm2): the data model entries state the invariant they must keep, which s5 cites, but carry no citation id of their own.
- Audit partial (ts2): the node:test framework comes from the existing tests listed in an s1 bundle and the documented command; test.locate was not run.
- Decided by the owner: the summariser follows the cheap tier and runs on the Claude CLI pinned to haiku by default, because not every machine can run even a small local model (about 18 GB of memory). The cost is CLI quota per indexed document and a slower first index than a capable local model.
- Open: how a missing claude binary is reported was read in src/agent/providers/cli-provider.ts (runSubprocess retries one ENOENT and returns the non-zero result, which the provider turns into an error), so the cheap-tier roles fail loudly and not empty; no pre-check is added.

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 do not hold · 0 could not be verified · 10 hold** · template `design-spec` · model `cli-claude:opus` · reviewed 2026-10-16T10:48:57.207Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

_None._
