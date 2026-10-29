<!-- insrc:artifact HLD-b220bb6174a2f5ed -->

# HLD: run-claude-codex-ollama-models

## Summary

The new runner is a new model family in insrc's shipped model definitions: the Claude command-line tool on Ollama. It declares that its tool runs on Ollama, and each of its models is marked cloud or local. A tier selects it exactly as it selects a family today. The daemon starts the same command-line tool it starts today, pointed at Ollama for that run only, and the three settings clients list the new family from the definitions answer they already read.

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
11. [Open questions](#11-open-questions)

## 1. Problem context

> See **DEF-b220bb6174a2f5ed** § 1. Problem

## 2. Framework summary

Model the new runner as a new family in the model definitions (alternative a1). The definitions file, its validator and the definitions answer gain one family, 'ollama-claude', with the CLI kind 'claude' and a host mark 'ollama'; every model of that family carries a hosting mark, 'cloud' or 'local'. Tier settings, effort filtering and provider construction keep their one per-family path. A family with the Ollama host mark builds the existing CLI provider with an Ollama target applied to that subprocess only, and clients use the host mark to show cloud/local and to never offer unlisted model ids for that family. Scope change 2026-10-29 (user decision): the Codex-on-Ollama family is withdrawn, because Ollama's cloud models ignore a requested output format and the Codex tool depends on it (DEF non-goal, citation c9 of the DEF).

## 3. Architecture shape

Three layers, each changed in one place. (1) Definitions layer (s1): the shipped definitions file and the catalog validator admit a four-member closed family set; the new family carries cliKind 'claude' and host 'ollama', have no tier defaults or summariser of their own, and every model carries hosting. The registry exposes host and hosting, resolves a tier on a host family only to a declared model (otherwise a 'model-not-supported' resolution), maps a CLI client to its direct family only, and refuses the unknown-model check and the approved-model store for host families. The definitions answer gains the two marks. (2) Run layer (s2): the per-family provider factory passes the family's host to the CLI provider; for host 'ollama' the provider starts the claude CLI with an environment pointing it at the local Ollama (base URL, placeholder token, empty API key), adds nothing for direct families, checks Ollama reachability and the model's availability before a run and names the cause on failure, and keeps calls serial. (3) Client layer (s3, s4, s5): the terminal UI, the VS Code picker and settings, and the JetBrains Settings page list the new family from the answer, label each model cloud or local, offer effort only from the model's efforts, withhold 'Enter another model id' for host families, and show the tier the daemon reports. The on-disk tier validator (isRunner, src/config/analyze.ts:371) checks family ids against the list derived from the shipped definitions file (src/config/model-defaults.ts:57-60), so it admits the two new families with no code change; s1 covers it with a regression test. Classification rule (s1): today the daemon decides family behaviour from two tests that the new families would pass the wrong way, 'the family is not ollama' and 'the family has a CLI kind'. s1 classifies every such site into one of two meanings and keys it accordingly: 'runs a CLI' stays on the CLI kind and includes the host families (provider kind in src/analyze/context/shaper-provider.ts:228, :274, :287, :339; src/analyze/context/driver.ts:1160; src/daemon/list-models.ts:92-105; src/daemon/model-definitions.ts:104, :203), while 'a vendor CLI family' keys on the host mark being absent and excludes the host families: tier defaults and summariser required by the validator (isCliFamily, src/daemon/model-catalog.ts:140-142, :186-191), the unknown-model check (src/daemon/model-check.ts:319-320), the approved-model store (src/daemon/model-registry.ts:142, already closed), the unlisted-model fallback (src/daemon/model-registry.ts:277-278), the tier write's model check (src/daemon/config-write.ts:74) and run attribution by CLI-kind label prefix (src/workflow/attribution.ts:49), which must name the family that ran, not the first family with that CLI kind. The validator's test fixtures (src/daemon/__tests__/model-catalog.test.ts:35) grow to the five-family set.

## 4. Diagrams

- [Sequence diagram](docs/epics/run-claude-codex-ollama-models-E20261029b220bb61/sequence-diagram.html)
- [Component dependencies](docs/epics/run-claude-codex-ollama-models-E20261029b220bb61/component-dependency.html)

## 5. Shared contracts

### 5.1 sc1: Ollama-hosted CLI families in the definitions answer

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`, `s5`

**Purpose:** The wire shape every consumer reads to know the new family, that it runs a CLI on Ollama, and which of its models are cloud or local.

**Interface sketch (type-level):**

```
type FamilyId = 'cli-claude' | 'cli-codex' | 'ollama' | 'ollama-claude';
type FamilyHost = 'ollama';
type ModelHosting = 'cloud' | 'local';
interface FamilyDefinitionEntry {
  readonly id: FamilyId;
  readonly displayName: string;
  readonly cliKind?: 'claude' | 'codex';
  /** Present only on the new family: the CLI runs against Ollama. */
  readonly host?: FamilyHost;
  readonly models: readonly ModelDefinitionEntry[];
}
interface ModelDefinitionEntry {
  readonly id: string;
  readonly displayName: string;
  readonly aliases?: readonly string[];
  readonly efforts: readonly string[];
  readonly inputLimit?: { readonly unit: 'chars' | 'tokens'; readonly max: number };
  /** Required on every model of a family with host; absent elsewhere. */
  readonly hosting?: ModelHosting;
}
```

**Assumptions cited:** [[c4]] [[c5]]

### 5.2 sc2: Tier resolution on an Ollama-hosted family

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`, `s5`

**Purpose:** How the daemon reports the tier it actually runs when the tier names a host family, including a model the definitions do not declare, so the run layer and every settings surface show the same outcome.

**Interface sketch (type-level):**

```
type FallbackReason = /* existing reasons */ string | 'model-not-supported';
interface TierResolution {
  readonly family: FamilyId;
  /** undefined when the configured model is not declared for a host family. */
  readonly model: ResolvedModel | undefined;
  readonly effort: string | undefined;
  readonly fallback?: { readonly reason: FallbackReason; readonly configured: string };
}
```

**Assumptions cited:** [[c3]]

## 6. Story boundaries

### 6.1 Story E20261029b220bb61:S001

**Owns:** `sc1`, `sc2`

The shipped definitions entry for the new family and its models (which cloud and local models are supported), the catalog validator's four-member check and the 'hosting required on host families' rule, the registry's mapping from a CLI client to its direct family only, and the refusal of the unknown-model check and the approved-model store for host families stay inside s1.

### 6.2 Story E20261029b220bb61:S002

**Depends on:** `sc1`, `sc2`

How the CLI provider points a run at Ollama (the claude environment, applied only to that subprocess), the pre-run checks that Ollama answers and the model is available or signed in for a cloud model, the failure messages that name the cause, and the time limit that keeps a run from waiting forever stay inside s2.

### 6.3 Story E20261029b220bb61:S003

**Depends on:** `sc1`, `sc2`

The terminal UI's runner list, model list with cloud/local labels, effort step and the withheld 'enter another id' path for host families, and its display of the resolved tier, stay inside s3.

### 6.4 Story E20261029b220bb61:S004

**Depends on:** `sc1`, `sc2`

The VS Code tier picker's family and model steps, the settings write validation that refuses an undeclared model for a host family, the cloud/local labels and the withheld 'enter another id' item stay inside s4.

### 6.5 Story E20261029b220bb61:S005

**Depends on:** `sc1`, `sc2`

The JetBrains Settings page's family and model selectors, the cloud/local labels, the filter that keeps host families out of the model-check flow, and its display of the resolved tier stay inside s5.

## 7. Non-functional targets

- **Performance:** No added cost on today's runners. A run on a host family adds one Ollama reachability and model-availability check before the CLI starts; a run never waits beyond the existing CLI time limit.
- **Security:** The Ollama settings are applied only to the started subprocess's environment or arguments; the user's own CLI configuration files and the daemon's environment are never changed. No API key is stored; the claude CLI gets the placeholder token Ollama accepts locally.
- **Observability:** The daemon logs the family, model, hosting and Ollama target of each host-family run, and a failed pre-run check logs which check failed; the tier resolution reported to clients names a 'model-not-supported' fallback.
- **Durability:** Nothing new is persisted: tier settings keep their stored shape, and the new families live in the shipped definitions file.

## 8. Rollout

**Phase A — definitions contract**

**Stories:** `s1`

s1 owns both shared contracts (sc1, sc2); every other Story consumes them.

**Backward compat:** The three existing families keep their entries, ids, tier defaults and resolution; a client that does not yet understand the host and hosting marks still reads the answer, because the marks are additive.

**Phase B — run on Ollama and expose in settings**

**Stories:** `s2`, `s3`, `s4`, `s5`

Each depends only on s1 and on sc1/sc2, so the daemon run path and the three client surfaces can land in any order after Phase A.

**Backward compat:** Direct-family runs start the CLI exactly as before (no Ollama environment or flags); clients keep their current behaviour for the three existing families, including 'Enter another model id' for the direct CLI families.

**Ordering rationale:** s1 is the only Story every other Story depends on and the owner of both shared contracts, so it lands first; s2-s5 have no edges between them and each consumes only sc1/sc2.

**Risky bits**

| Area | Why | Mitigation |
| :--- | :--- | :--- |
| Clients exposing the new families before the daemon can run them | If a client ships s3/s4/s5 before s2, a user could pick a host family the daemon cannot yet run. | The daemon only lists the new families once s1 lands, and s2's pre-run check reports a clear cause; release the daemon with s2 before announcing the client releases. |
| CLI-kind to family mapping | The new family shares the 'claude' CLI kind with cli-claude; code that maps a CLI kind back to a family could pick the Ollama family and change today's behaviour (k6). | s1 restricts the client-to-family mapping to direct families and adds a regression test that today's mapping is unchanged. |
| Supported model list going stale | Ollama's cloud model names change; a shipped entry may stop existing. | s2's pre-run check names a missing model as the cause; the list is data in the shipped definitions file and is updated with a daemon release. |

## 9. Alternatives considered

### 9.1 a1: A new model family in the definitions — **CHOSEN**

Add a Claude-on-Ollama family to the shipped definitions, marked as running its CLI on Ollama, with every model marked cloud or local. (Originally two families; the Codex-on-Ollama family was withdrawn on 2026-10-29.)

The definitions file and its validator gain two families next to the three existing ones. Each new family names the CLI it runs (the same claude/codex kind the existing CLI families carry) and additionally declares that the CLI is pointed at Ollama; each of its models carries the existing fields (id, display name, efforts, input limit) plus a hosting mark, cloud or local. The family set becomes five, still a closed list validated at load, and a tier selects one of the new families exactly as it selects a family today, so the tier, model and effort settings are reused unchanged.

The daemon turns a tier on a new family into the same CLI provider it builds for the existing CLI families, with one extra input: the Ollama endpoint that this run's CLI process is pointed at (an environment for the claude CLI, flags for the codex CLI), applied only to that subprocess. The definitions answer the clients already read carries the new families and the two new marks, so each client lists them through the code path it already has; each client uses the 'runs on Ollama' mark to show cloud/local and to withhold the 'enter another model id' path for those families.

**Pros:**
- Follows the per-family definitions shape Epic ce99b720 established: a runner is a family, so tier resolution, effort filtering and provider construction keep one code path.
- The three clients already iterate the answer's families, so a new family appears in every surface without a new endpoint; the client change is limited to reading two new marks.
- Today's three families keep their file entries, ids and settings byte for byte, which keeps k6 checkable by an unchanged-definitions test.

**Cons:**
- The closed family-id union and the 'exactly one entry per family' validation grow from three to five members, touching every exhaustive switch over family ids.
- Two families share a CLI kind with an existing family, so every place that maps a CLI kind back to a family (the client-to-family mapping) must pick the direct one, not the Ollama one.
- Clients that today equate 'has a CLI kind' with 'accepts unlisted model ids' must change that rule, in three codebases.

**Cost estimate:** M

### 9.2 a2: Ollama as a transport on the existing CLI families

Keep the two CLI families and add an 'on Ollama' transport choice to the tier setting, with each CLI family declaring a separate list of Ollama-served models.

The definitions keep three families. Each CLI family gains a second model list, the Ollama-served models its CLI can run, each marked cloud or local. A tier setting gains a transport field (the CLI's own service, or Ollama); the model is validated against the list that matches the transport.

The daemon builds the same CLI provider for either transport, adding the Ollama endpoint to the subprocess when the tier's transport is Ollama. Clients add a transport selector to the tier editor and switch the model list on it.

**Pros:**
- The family-id union and the client-to-family mapping stay unchanged.
- A user sees the Claude tool as one runner with two hosting choices, which matches how the CLI vendors describe it.

**Cons:**
- Changes the stored tier setting shape (a new field) in every client's write path and in the daemon's tier parser, which puts today's settings (k6) at risk and needs a migration story for tiers without the field.
- Two model lists per family break the one-list-per-family invariant every client and the effort filter rely on today.
- The 'enter another model id' rule now depends on transport as well as family, a two-variable condition in three codebases.

**Cost estimate:** L

**Rejected because:** Scores 'partial' on k3 and k6: it adds a transport field to the stored tier setting and needs a default rule for every existing tier, so today's settings shape changes.

### 9.3 a3: CLI front-ends on the Ollama family

Keep the Ollama family as the runner and let each of its models declare which CLI front-ends (claude, codex) may drive it.

The Ollama family's model list is extended with cloud models and a hosting mark; each model lists the CLI front-ends that can drive it. A tier on the Ollama family gains an optional front-end choice; with none it calls Ollama directly as today, with one it starts that CLI pointed at Ollama.

The daemon branches on the front-end inside the Ollama provider path; clients add a front-end selector under the Ollama family.

**Pros:**
- One model list for everything served by Ollama, so a model is declared once even if both CLIs can drive it.
- No new family ids.

**Cons:**
- Mixes a direct-API runner and two subprocess runners inside one family, so the family no longer tells the daemon which provider kind to build; the provider choice depends on a per-tier field instead.
- Cloud models would appear under the plain Ollama runner too unless separately excluded, contradicting the user decision that the plain runner stays as it is (k6).
- Adds a tier field like a2, with the same migration and k6 exposure.

**Cost estimate:** L

**Rejected because:** Violates k6 (the plain Ollama family's model list and behaviour change) and is 'partial' on k1, k2 and k3: one family would build a direct Ollama provider or a CLI subprocess depending on a per-tier field.

## 10. References

- **[[c1]]** `analyze-bundle` `s1 bundle: runner families in the registry and definitions` — "Families live in the model registry; each carries a CLI kind ('claude' | 'codex' | undefined) and familyForClient maps a CLI client to its family."
- **[[c2]]** `code` `src/daemon/model-catalog.ts:37` — "export type FamilyId = 'cli-claude' | 'cli-codex' | 'ollama';"
- **[[c3]]** `code` `src/daemon/model-catalog.ts:127` — "const FAMILY_IDS: readonly FamilyId[] = ['cli-claude', 'cli-codex', 'ollama'];"
- **[[c4]]** `code` `src/analyze/context/shaper-provider.ts:218` — "export function familyProvider("
- **[[c5]]** `code` `src/agent/providers/cli-provider.ts:144` — "export interface CliProviderOpts {"
- **[[c6]]** `code` `src/daemon/handler-runtime.ts:1452` — "'models.definitions':   () => modelDefinitions(),"
- **[[c7]]** `code` `vscode-plugin/src/models/model-tier-picker.ts:342` — "if (family.cliKind !== undefined) items.push({ label: 'Enter another model id…', description: 'checked by the daemon before it can be used', kind: 'enter-id' });"
- **[[c8]]** `code` `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/ModelCheckFlow.kt:63` — "fun families(): List<DefinedFamilyDto> = definitions.families.filter { it.cliKind != null }"
- **[[c9]]** `code` `src/daemon/model-registry.ts:105` — "familyForClient(client: StepClient | undefined, registry: ModelRegistry = getModelRegistry()): FamilyId | undefined"
- **[[c10]]** `code` `src/cli/panes/model-tiers.ts:189` — "if (family.cliKind === undefined) return { kind: 'refused', reason: `only listed ${family.displayName} models are selectable` };"
- **[[c11]]** `code` `src/config/analyze.ts:371` — "function isRunner(x: unknown): x is AnalyzeShaperProviderKind {"
- **[[c12]]** `code` `src/daemon/model-catalog.ts:140` — "function isCliFamily(id: FamilyId): id is CliFamilyId {"
- **[[c13]]** `code` `src/daemon/model-check.ts:319` — "const kind = typeof family === 'string' && registry.families().some(f => f.id === family) ? registry.cliKind(family as CliFamilyId) : undefined;"
- **[[c14]]** `code` `src/daemon/model-registry.ts:277` — "setting.runner !== 'ollama' && rejected(setting.runner).includes(setting.model) ? 'rejected-model' : 'unlisted-model';"
- **[[c15]]** `code` `src/workflow/attribution.ts:49` — "if (f.cliKind !== undefined && label.startsWith(f.cliKind)) return stamp(f.id, label);"
- **[[c16]]** `code` `src/daemon/__tests__/model-catalog.test.ts:35` — "/** A valid minimal fixture with all three families. */"

## 11. Open questions

- Item f2: architectureShape names the definitions file, validator, registry, provider factory, CLI provider and clients by role rather than quoting each s1 bundle path inline (partial).

## Resolved questions

- `qeb5df016` — Item f2: architectureShape names the definitions file, validator, registry, provider factory, CLI provider and clients by role rather than quoting each s1 bundle path inline (partial).
  - **resolved**: Leave role-only; defer paths to the LLD — The HLD already grounds the roles in paths: the component-dependency definition gives each component's repo path, and the section 3 classification rule lists every change site by path:line. The s1 LLD carries the remaining concrete paths. _(2026-10-29T17:40:48.348Z)_

## Citations

- **[[c1]]** `analyze-bundle` `s1 bundle: runner families in the registry and definitions` — "Families live in the model registry; each carries a CLI kind ('claude' | 'codex' | undefined) and familyForClient maps a CLI client to its family."
- **[[c2]]** `code` `src/daemon/model-catalog.ts:37` — "export type FamilyId = 'cli-claude' | 'cli-codex' | 'ollama';"
- **[[c3]]** `code` `src/daemon/model-catalog.ts:127` — "const FAMILY_IDS: readonly FamilyId[] = ['cli-claude', 'cli-codex', 'ollama'];"
- **[[c4]]** `code` `src/analyze/context/shaper-provider.ts:218` — "export function familyProvider("
- **[[c5]]** `code` `src/agent/providers/cli-provider.ts:144` — "export interface CliProviderOpts {"
- **[[c6]]** `code` `src/daemon/handler-runtime.ts:1452` — "'models.definitions':   () => modelDefinitions(),"
- **[[c7]]** `code` `vscode-plugin/src/models/model-tier-picker.ts:342` — "if (family.cliKind !== undefined) items.push({ label: 'Enter another model id…', description: 'checked by the daemon before it can be used', kind: 'enter-id' });"
- **[[c8]]** `code` `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/ModelCheckFlow.kt:63` — "fun families(): List<DefinedFamilyDto> = definitions.families.filter { it.cliKind != null }"
- **[[c9]]** `code` `src/daemon/model-registry.ts:105` — "familyForClient(client: StepClient | undefined, registry: ModelRegistry = getModelRegistry()): FamilyId | undefined"
- **[[c10]]** `code` `src/cli/panes/model-tiers.ts:189` — "if (family.cliKind === undefined) return { kind: 'refused', reason: `only listed ${family.displayName} models are selectable` };"
- **[[c11]]** `code` `src/config/analyze.ts:371` — "function isRunner(x: unknown): x is AnalyzeShaperProviderKind {"
- **[[c12]]** `code` `src/daemon/model-catalog.ts:140` — "function isCliFamily(id: FamilyId): id is CliFamilyId {"
- **[[c13]]** `code` `src/daemon/model-check.ts:319` — "const kind = typeof family === 'string' && registry.families().some(f => f.id === family) ? registry.cliKind(family as CliFamilyId) : undefined;"
- **[[c14]]** `code` `src/daemon/model-registry.ts:277` — "setting.runner !== 'ollama' && rejected(setting.runner).includes(setting.model) ? 'rejected-model' : 'unlisted-model';"
- **[[c15]]** `code` `src/workflow/attribution.ts:49` — "if (f.cliKind !== undefined && label.startsWith(f.cliKind)) return stamp(f.id, label);"
- **[[c16]]** `code` `src/daemon/__tests__/model-catalog.test.ts:35` — "/** A valid minimal fixture with all three families. */"
