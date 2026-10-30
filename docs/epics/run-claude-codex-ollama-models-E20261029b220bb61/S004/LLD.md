<!-- insrc:artifact LLD-b220bb6174a2f5ed-s4 -->

# LLD: E20261030b220bb61:S004

## Summary

**Epic:** `run-claude-codex-ollama-models`
**HLD base run:** `wf-1793292978249-2ujf5k`
**HLD effective hash:** `ca5bac7aee60...`

This Story lets a VS Code user set a tier to the Claude tool on an Ollama model, from the 'insrc: Set model tier' picker or the native insrc.models.tiers settings. The runner already appears because the picker lists every family the daemon declares; this Story marks each of its models cloud or local, removes 'Enter another model id' for it, shows a configured model it does not declare as 'not supported, the tier will not run', and makes the settings sync refuse such a model with the reason that only listed models can be used. The family is recognised by the definitions' host mark, never by name.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Interaction with shared contracts](#4-interaction-with-shared-contracts)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Migration](#7-migration)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)

## 1. HLD context

> See **HLD-b220bb6174a2f5ed** § 2. Framework summary

**Rollout phase:** Phase B — run on Ollama and expose in settings
**Consumes:** `sc1` (Ollama-hosted CLI families in the definitions answer), `sc2` (Tier resolution on an Ollama-hosted family)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The shipped definitions entry for the new family and its models (which cloud and local models are supported), the catalog validator's four-member check and the 'hosting required on host families' rule, the registry's mapping from a CLI client to its direct family only, and the refusal of the unknown-model check and the approved-model store for host families stay inside s1. — owns `sc1`, `sc2`
- `s2`: How the CLI provider points a run at Ollama (the claude environment, applied only to that subprocess), the pre-run checks that Ollama answers and the model is available or signed in for a cloud model, the failure messages that name the cause, and the time limit that keeps a run from waiting forever stay inside s2.
- `s3`: The terminal UI's runner list, model list with cloud/local labels, effort step and the withheld 'enter another id' path for host families, and its display of the resolved tier, stay inside s3.
- `s5`: The JetBrains Settings page's family and model selectors, the cloud/local labels, the filter that keeps host families out of the model-check flow, and its display of the resolved tier stay inside s5.

## 2. Contract details

**Surface level:** internal

### 2.1 `DefinedFamily`

```typescript
interface DefinedFamily { readonly id: string; readonly cliKind?: 'claude' | 'codex' | 'vibe' | undefined; /** Present when the family runs its CLI on a host (Ollama). */ readonly host?: 'ollama' | undefined; readonly displayName: string; readonly tierDefaults?: ...; readonly toolLoopModel?: string | undefined; readonly rejectedModels?: readonly string[] | undefined; readonly models: readonly DefinedModel[] }
```

**Returns:** `type` — The plugin's view of one family in the models.definitions answer, now carrying sc1's host mark.

**Postconditions:**
- An older daemon's answer without host parses as today (host undefined).

### 2.2 `DefinedModel`

```typescript
interface DefinedModel { readonly id: string; readonly aliases: readonly string[]; readonly displayName?: string | undefined; readonly efforts: readonly string[]; readonly source: 'shipped' | 'user-approved'; readonly installed?: boolean | undefined; /** Models of a family with a host: where the model runs. */ readonly hosting?: 'cloud' | 'local' | undefined }
```

**Returns:** `type` — The plugin's view of one model, now carrying sc1's hosting mark.

**Postconditions:**
- Absent for vendor and plain Ollama models.

### 2.3 `modelDescription`

```typescript
function modelDescription(m: DefinedModel, isCurrent: boolean): string | undefined
```

**Parameters:**
- `m: DefinedModel` — The model being listed.
- `isCurrent: boolean` — Whether it is the tier's current model.

**Returns:** `string | undefined` — As today (aliases, user-approved, not installed, current), and the model's hosting ('cloud' or 'local') when it has one.

**Postconditions:**
- Vendor and plain Ollama models get exactly today's marks.

### 2.4 `pickModel`

```typescript
async function pickModel(deps: SetModelTierDeps, family: DefinedFamily, models: readonly DefinedModel[], currentModel: string | undefined): Promise<PickItem | undefined>
```

**Parameters:**
- `family: DefinedFamily` — The chosen family.
- `models: readonly DefinedModel[]` — The family's declared models.
- `currentModel: string | undefined` _(optional)_ — The tier's current model when the family is unchanged.

**Returns:** `Promise<PickItem | undefined>` — The picked item. For a family with a host: the declared models with their cloud/local mark; no 'Enter another model id…' item; a current model the family does not declare is shown as '(current, not supported — the tier will not run): <id>' with description 'not supported by <displayName>'. Other families: unchanged ('Enter another model id…' for a CLI family, '(current, not listed — runs the default)').

**Postconditions:**
- The models.check flow (checkUnlisted) is never reachable for a family with a host.

### 2.5 `applyTier`

```typescript
const applyTier = async (tier: string, changes: readonly ChangedKey[]): Promise<readonly string[]>
```

**Parameters:**
- `tier: string` — The tier whose native keys changed.
- `changes: readonly ChangedKey[]` — The changed insrc.models.tiers.<tier>.* keys.

**Returns:** `Promise<readonly string[]>` — As today: the keys needing a restart, or [] after a refusal (the native keys reverted to their last-known values).

**Errors:**
- `refusal (notifier.error + revert)` when The model is not one the family declares and the family has a host: "insrc: '<model>' is not a listed <displayName> model; only listed <displayName> models can be used (<ids>) — <tier> tier not changed".
- `refusal (notifier.error + revert)` when The daemon's config.write refuses the tier (its own host-family gate): 'insrc: daemon rejected the <tier> tier — <reason>'.

**Postconditions:**
- A vendor CLI family keeps the 'run insrc: Set model tier to check and approve it' message; plain Ollama keeps the 'only listed' message.
- A refused edit writes nothing and the tier keeps its previous setting.

## 3. Data model changes

### 3.1 `DefinedFamily` — field-add

Adds host?: 'ollama' (sc1), read to recognise a family whose models are a closed list.

```
+ readonly host?: 'ollama' | undefined;
```

**Call sites:**
- `vscode-plugin/src/models/definitions.ts:26-35`
- `vscode-plugin/src/models/model-tier-picker.ts:323-345`
- `vscode-plugin/src/config/sync-engine.ts:187-190`

### 3.2 `DefinedModel` — field-add

Adds hosting?: 'cloud' | 'local' (sc1), shown in the model picker.

```
+ readonly hosting?: 'cloud' | 'local' | undefined;
```

**Call sites:**
- `vscode-plugin/src/models/definitions.ts:15-23`
- `vscode-plugin/src/models/model-tier-picker.ts:310-320`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | Reads host on a family and hosting on a model from models.definitions; the family is never named by id in the plugin (model-tier-picker.ts's literal-scan test stays green). |
| `sc2` | consumes | Mirrors the daemon's resolution for a host family in the picker: a declared model runs as configured (an effort it does not take is shown dropped, as currentTier does today); an undeclared model is shown as not supported and not run, with no substitute. |

## 5. Error paths

**Error cases**

- **A user types a model the Claude-on-Ollama runner does not declare into insrc.models.tiers.<tier>.model (or sets the runner and a foreign model together) in the Settings editor.** (recoverable)
  - Detection: applyTier finds the family has a host and servedModel(family, model) returns undefined.
  - Response: notifier.error("insrc: '<model>' is not a listed <displayName> model; only listed <displayName> models can be used (<ids>) — <tier> tier not changed"), then the changed native keys are reverted to their last-known values; nothing is written to the daemon.
  - User impact: The change is refused with the reason and the tier keeps its previous setting (ac3); the user is not sent to a model-check flow the daemon refuses for this runner.
- **The plugin's check passes but the daemon refuses the write (e.g. the definitions changed between the plugin's read and the write).** (recoverable)
  - Detection: gateway.writeKeyPath returns ok:false (the daemon's config.write gate refuses an undeclared host-family model).
  - Response: The existing path: 'insrc: daemon rejected the <tier> tier — <reason>' and the native keys are reverted.
  - User impact: Same outcome as above, with the daemon's own reason.
- **The tier is configured (hand-edited config) on the Claude-on-Ollama runner with a model it does not declare, and the user opens the picker and keeps that family.** (recoverable)
  - Detection: pickModel finds the current model is not among the family's models and the family has a host.
  - Response: The list shows '(current, not supported — the tier will not run): <id>' with 'not supported by <displayName>' above the declared models, and offers no 'Enter another model id…'.
  - User impact: The user sees the tier does not run (the daemon's model-not-supported refusal) and picks a listed model; they are not told it runs a default.
- **The daemon is down or an older daemon answers the definitions without host or hosting.** (recoverable)
  - Detection: deps.definitions() rejects (classifyDaemonFailure), or the family entry has no host field.
  - Response: Daemon down: the existing not-running / older-daemon messages. No host field: the family is treated as today's CLI families (no cloud/local marks, 'Enter another model id…' offered, the 'check and approve' settings message).
  - User impact: No new failure mode; marks and refusals appear once the daemon is s1 or later.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Picking the Claude-on-Ollama family in the picker. | The model list shows only its declared models, each with 'cloud' or 'local' among its marks, plus Refresh; no 'Enter another model id…'. |
| A declared host model with no efforts (e.g. deepseek-v4-pro:cloud). | pickEffort is skipped and the tier is written with effort '' (the CLI default), as for any model with no efforts. |
| Setting only insrc.models.tiers.<tier>.runner to the Claude-on-Ollama family id in settings. | A family switch: the tier takes the family's first declared model (familyDefault, no tierDefaults) with effort '', written as one whole tier and mirrored into the model/effort keys. |
| A host model given by an alias in settings. | Served (servedModel matches aliases); written with the canonical id. |
| An effort the declared host model does not take, set in settings. | Refused as today ('effort ... is not accepted by <model>'), or dropped on a family switch. |
| A saved Claude-on-Ollama tier, picker reopened. | currentTier reports the saved runner, model and effort (an effort the model does not take shown as ''); the model is marked '(current)' with its cloud/local mark. |

**Invariants to preserve**

- Every family, model and effort the picker and the settings sync offer or accept comes from the daemon's models.definitions answer; model-tier-picker.ts names no runner or model literal (its literal-scan test stays green). [[c1]]
- The picker writes the whole tier {runner, model, effort} once at ['models','tiers',tier]; the settings sync writes the whole tier and mirrors it into the native keys, and reverts every changed key on a refusal. [[c2]]
- Vendor CLI families keep 'Enter another model id…', the models.check / approve flow and the 'check and approve it' settings message; plain Ollama keeps the 'only listed models' message. [[c1]]
- The plugin's definitions types stay structural mirrors of the daemon's answer; an answer without the new fields parses unchanged. [[c3]]

## 6. Test strategy

**Test framework:** `node:test with node:assert/strict, run through tsx (vscode-plugin/src/**/__tests__/*.test.ts; npm test in vscode-plugin); the picker runs over the fake SetModelTierDeps seams and the settings sync over its fake gateway/settings/notifier, as in model-tier-picker.test.ts and sync-engine.test.ts`

**Test levels**

- **unit** — The tier picker over a fake definitions answer that includes a family with a host.
  - Subjects: `vscode-plugin/src/models/__tests__/model-tier-picker.test.ts: the family step offers the Claude-on-Ollama family next to today's families; picking it lists only its declared models, each with its cloud/local mark, and no 'Enter another model id…'; picking a model with efforts offers '' plus its own levels, a model with none skips the effort step; one whole-tier write.`, `vscode-plugin/src/models/__tests__/model-tier-picker.test.ts: a configured undeclared model on the host family is listed as '(current, not supported — the tier will not run)'; a vendor family keeps '(current, not listed — runs the default)' and 'Enter another model id…'; an answer without host shows no marks and offers 'Enter another model id…'.`, `vscode-plugin/src/models/__tests__/model-tier-picker.test.ts: after a tier is saved on the Claude-on-Ollama family, reopening the picker (configShow returns the saved tier) marks that family and model as current with its cloud/local mark and the saved effort as current; an effort the model does not take is shown as the CLI default.`
  - Fixtures: `A fake definitions answer adding a family with host 'ollama', cliKind 'claude', no tierDefaults, and models with hosting 'cloud' (with efforts, one with an alias) and 'local' (no efforts).`
- **unit** — The native settings sync for a host family.
  - Subjects: `vscode-plugin/src/config/__tests__/sync-engine.test.ts: setting insrc.models.tiers.<tier>.model to a model the Claude-on-Ollama family does not declare is refused with 'only listed <family> models can be used', reverts every changed key and writes nothing; a vendor family's unlisted model keeps the 'check and approve it' message.`, `vscode-plugin/src/config/__tests__/sync-engine.test.ts: setting only the runner to the Claude-on-Ollama family takes its first declared model with effort '' and writes the whole tier, mirrored into the native model/effort keys; a declared model (or alias) with a listed effort is written with the canonical id.`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `model-tier-picker.test.ts: the family step offers the Claude-on-Ollama family next to today's families`, `sync-engine.test.ts: setting only the runner to the Claude-on-Ollama family takes its first declared model and writes the whole tier` |
| `ac2` | `model-tier-picker.test.ts: picking the host family lists only its declared models with cloud/local marks and no 'Enter another model id…'; efforts only where the model has them` |
| `ac3` | `sync-engine.test.ts: an undeclared model for the Claude-on-Ollama family is refused with 'only listed models can be used', every changed key is reverted and nothing is written` |
| `ac4` | `model-tier-picker.test.ts: reopening the picker after a save shows the saved runner, model (with its mark) and effort as current`, `sync-engine.test.ts: the written tier is mirrored into the native runner/model/effort keys` |

## 7. Migration

**State before:** The VS Code picker (vscode-plugin/src/models/model-tier-picker.ts) already lists every family the definitions declare, including the Claude-on-Ollama one, but shows no cloud/local mark, offers 'Enter another model id…' (the models.check flow the daemon refuses for a host family) and shows an undeclared current model as '(current, not listed — runs the default)'. The settings sync (vscode-plugin/src/config/sync-engine.ts applyTier) refuses an undeclared model but tells the user to check and approve it with 'insrc: Set model tier', which is impossible for a host family. The plugin's definitions types (vscode-plugin/src/models/definitions.ts) do not carry host or hosting.

**State after:** The plugin reads host and hosting from the definitions answer: the picker marks each host-family model cloud or local, withholds 'Enter another model id…' for it and shows an undeclared current model as not supported (the tier will not run); the settings sync refuses an undeclared host-family model with 'only listed models can be used' and reverts. Vendor and plain Ollama families are unchanged.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the optional host field to the plugin's family type and the optional hosting field to its model type. — ↩ rollbackable
2. Make the picker show the cloud/local mark, withhold the enter-id item and show the not-supported current-model notice for a family with a host. — ↩ rollbackable
3. Make the settings sync's refusal of an undeclared model on a family with a host use the 'only listed models' reason, and note in the tier setting descriptions that the Claude-on-Ollama runner accepts only its listed models. — ↩ rollbackable

**Backward compat:** Client-only display and validation change: nothing persisted changes, the tier keys and the whole-tier write keep their shape, and an answer from an older daemon (no host/hosting) behaves as today.

## 8. Alternatives considered

### 8.1 a1: Host-aware picker and settings validation over the definitions answer — **CHOSEN**

Add host/hosting to the plugin's definitions types; the picker labels models cloud/local, withholds 'Enter another model id' and shows an undeclared current model as not supported for a host family; the settings sync refuses an undeclared host-family model with an 'only listed models' reason.

vscode-plugin/src/models/definitions.ts: DefinedFamily gains `host?: 'ollama'` and DefinedModel gains `hosting?: 'cloud' | 'local'`, mirroring sc1; the family is recognised by `host`, never by id. model-tier-picker.ts: modelDescription adds the model's hosting ('cloud' / 'local') to its marks; pickModel adds 'Enter another model id…' only for a family with a cliKind and no host; a configured model a host family does not declare is shown as '(current, not supported — the tier will not run)' instead of '(current, not listed — runs the default)'. pickFamily already lists every family, pickEffort already skips a model with no efforts and offers only the model's own, and saveTier already writes the whole tier once and reports the daemon's refusal. sync-engine.ts applyTier: an undeclared model on a family with a host is refused with 'only listed <displayName> models can be used (<ids>)' (the existing non-CLI wording) instead of the 'check and approve it' wording, then reverted to the last-known values as today. package.json tier setting descriptions mention that the Claude-on-Ollama runner accepts only its listed models.

### 8.2 a2: a1 plus dynamic enum dropdowns in the native settings

As a1, and additionally contribute the families and models as enum choices for the insrc.models.tiers.* settings so the Settings editor offers the runners and models as dropdowns.

Everything in a1, plus: the static package.json contributions cannot carry daemon-sourced enums, so the extension would have to register a dynamic configuration schema (not supported by the VS Code API for contributed settings) or replace the native keys with a webview settings page listing families and models with cloud/local labels. The sync engine would keep validating writes.

**Rejected because:** Adds nothing ac1-ac4 need, violates k4 (a second runner/model list) or requires a new settings surface (L); a1 satisfies ac1-ac4, sc1, sc2 and k1-k6 at cost S.

## 9. References

- **[[c1]]** `analyze-bundle` `s1 bundle: The VS Code tier picker (insrc: Set model tier) — vscode-plugin/src/models/model-tier-picker.ts:300-345` — "'Enter another model id…' (the models.check flow, checkUnlisted :353-445) is added for every family with a cliKind (:342)"
- **[[c2]]** `analyze-bundle` `s1 bundle: The native VS Code settings for tiers — vscode-plugin/src/config/sync-engine.ts:141-219` — "On success it writes the whole tier with gateway.writeKeyPath and mirrors the written value into the native keys; a daemon refusal (refusalText) reverts too."
- **[[c3]]** `analyze-bundle` `s1 bundle: The VS Code plugin's view of the definitions answer — vscode-plugin/src/models/definitions.ts:14-63` — "Neither type carries the daemon's `host` (family) or `hosting` (model) fields that s1 added to the definitions answer"
- **[[c4]]** `analyze-bundle` `s1 bundle: Tests to extend — vscode-plugin/src/models/__tests__/model-tier-picker.test.ts:81` — "drives the picker over fake seams ... with a fake definitions answer, asserting offered items and the single whole-tier write"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 do not hold · 0 could not be verified · 11 hold** · template `design-spec` · model `cli-claude:claude-sonnet-5` · reviewed 2026-10-30T08:11:25.609Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

_None._
