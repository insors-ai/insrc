<!-- insrc:artifact LLD-b220bb6174a2f5ed-s3 -->

# LLD: E20261030b220bb61:S003

## Summary

**Epic:** `run-claude-codex-ollama-models`
**HLD base run:** `wf-1793292978249-2ujf5k`
**HLD effective hash:** `ca5bac7aee60...`

This Story lets a terminal UI user set a tier to the Claude tool on an Ollama model from the Model Tiers screen. The Ollama runner already appears in the runner cycle because the screen lists every family the daemon declares; this Story labels each of its models cloud or local, keeps the 'type another model id' path away from it, and shows a tier whose model the definitions no longer declare as 'not supported, the tier will not run' instead of the vendor message that it runs a default. Everything comes from the daemon's definitions answer; the screen recognises the family by its host mark, never by name.

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
10. [Open questions](#10-open-questions)

## 1. HLD context

> See **HLD-b220bb6174a2f5ed** § 2. Framework summary

**Rollout phase:** Phase B — run on Ollama and expose in settings
**Consumes:** `sc1` (Ollama-hosted CLI families in the definitions answer), `sc2` (Tier resolution on an Ollama-hosted family)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The shipped definitions entry for the new family and its models (which cloud and local models are supported), the catalog validator's four-member check and the 'hosting required on host families' rule, the registry's mapping from a CLI client to its direct family only, and the refusal of the unknown-model check and the approved-model store for host families stay inside s1. — owns `sc1`, `sc2`
- `s2`: How the CLI provider points a run at Ollama (the claude environment, applied only to that subprocess), the pre-run checks that Ollama answers and the model is available or signed in for a cloud model, the failure messages that name the cause, and the time limit that keeps a run from waiting forever stay inside s2.
- `s4`: The VS Code tier picker's family and model steps, the settings write validation that refuses an undeclared model for a host family, the cloud/local labels and the withheld 'enter another id' item stay inside s4.
- `s5`: The JetBrains Settings page's family and model selectors, the cloud/local labels, the filter that keeps host families out of the model-check flow, and its display of the resolved tier stay inside s5.

## 2. Contract details

**Surface level:** internal

### 2.1 `computeEffectiveTiers`

```typescript
function computeEffectiveTiers(tiering: AnalyzeTiering, defs: ModelDefinitionsResult): EffectiveTiers  // EffectiveTier gains: readonly hosting?: 'cloud' | 'local'; readonly notSupported: boolean
```

**Parameters:**
- `tiering: AnalyzeTiering` — The configured tiers, as today.
- `defs: ModelDefinitionsResult` — The daemon's definitions answer, now read for each family's host and each model's hosting.

**Returns:** `EffectiveTiers` — As today, and each tier also carries `hosting` when its family has a host and serves the model, and `notSupported: true` when its family has a host and does not serve the configured model (served stays false). A vendor family's unserved model keeps notSupported false.

**Postconditions:**
- Pure; no I/O.
- Vendor and plain Ollama tiers compute exactly as before (hosting absent, notSupported false).

### 2.2 `resolveTypedModel`

```typescript
function resolveTypedModel(defs: ModelDefinitionsResult, familyId: string, typed: string): TypedModel
```

**Parameters:**
- `familyId: string` — The tier's family.
- `typed: string` — The id or alias the user typed.

**Returns:** `TypedModel` — served when the family serves it; refused ('only listed <displayName> models are selectable') when the family has a host and does not serve it, or has no CLI kind; check only for a vendor CLI family.

**Postconditions:**
- A host family never yields 'check', so the unknown-model check screen is never opened for it.

### 2.3 `effortChoices`

```typescript
function effortChoices(defs: ModelDefinitionsResult, current: TierModel): readonly string[]
```

**Parameters:**
- `current: TierModel` — The tier being edited.

**Returns:** `readonly string[]` — Unchanged: '' (CLI default) then the model's own efforts; for a model with no efforts only ''. The pane tells the user the model takes no effort setting instead of cycling.

**Postconditions:**
- Unchanged for every family.

### 2.4 `ModelTiersPane`

```typescript
function ModelTiersPane(): ReactElement
```

**Returns:** `ReactElement` — The Model Tiers screen. For a tier on a family with a host: the row shows the model followed by its hosting ('cloud' or 'local'); when notSupported it shows 'not supported by <family displayName>: the tier will not run; pick a listed model with m' instead of the vendor 'not served' note; the 'n' key hint is hidden and 'n' does nothing; 'e' on a model with no efforts toasts 'this model takes no effort setting'; 'e' on a notSupported tier toasts '<model> is not supported by <family>: pick a listed model with m' (the vendor 'pick one with m, or check it with n' toast at ModelTiersPane.tsx:184 stays for vendor families only). Other families render and behave as today.

**Postconditions:**
- Every family, model, effort and label comes from the definitions answer; no family id literal appears in src/cli (the literal scan stays green).
- Each edit still writes the whole tier object with one config.write.

## 3. Data model changes

### 3.1 `EffectiveTier` — field-add

Adds hosting?: 'cloud' | 'local' (a host family's served model) and notSupported: boolean (a host family not serving the configured model, mirroring the daemon's 'model-not-supported' resolution). served keeps its meaning.

```
+ readonly hosting?: 'cloud' | 'local' | undefined;
+ readonly notSupported: boolean;
```

**Call sites:**
- `src/cli/panes/model-tiers.ts:48-50`
- `src/cli/panes/model-tiers.ts:93-142`
- `src/cli/panes/ModelTiersPane.tsx`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | Reads `host` on a family and `hosting` on a model from the definitions answer (svc.models.definitions) to label models cloud/local and to recognise a family whose models are a closed list; the family is never named by id in src/cli. |
| `sc2` | consumes | Mirrors the daemon's tier resolution for a host family: a declared model runs as configured (an unlisted effort is shown as dropped, as today), an undeclared model resolves to 'model-not-supported' and is shown as not supported and not run, with no substitute shown. |

## 5. Error paths

**Error cases**

- **A tier is configured (hand-edited config, or a model removed in a later release) on the Ollama-hosted family with a model the definitions do not declare.** (recoverable)
  - Detection: computeEffectiveTiers finds the family has a host and servedModel returns undefined for the configured model, so it sets notSupported true.
  - Response: The tier row shows the configured model and 'not supported by <family>: the tier will not run; pick a listed model with m'; 'e' toasts '<model> is not supported by <family>: pick a listed model with m' (not the vendor 'check it with n' message, since 'n' is withheld for a host family).
  - User impact: The user sees the tier will not run (matching the daemon's 'model-not-supported' refusal) and fixes it with 'm', instead of being told it runs a default.
- **The user presses 'n' on a tier whose family has a host, or types an unlisted id into a prompt opened before switching family.** (recoverable)
  - Detection: The pane hides and ignores 'n' when the tier's family has a host; resolveTypedModel returns refused for a host family's unserved id.
  - Response: No prompt opens; a typed unlisted id is refused with 'only listed <family> models are selectable' and nothing is written or checked.
  - User impact: The user can only pick a declared model; the unknown-model check is never offered for the Ollama runner.
- **The daemon is down or an older daemon answers the definitions without host or hosting.** (recoverable)
  - Detection: svc.models.definitions rejects (existing daemonProblem path), or the family entry has no host field.
  - Response: Daemon down: the existing 'the daemon is not running' message. No host field: the family is treated as today's families (no labels, no refusal), so an older daemon behaves as before.
  - User impact: No new failure mode; labels and refusals appear once the daemon is s1 or later.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Switching a tier to the Ollama-hosted family with 'f'. | The tier takes the family's first declared model (it has no tier defaults) with the CLI-default effort, written as one whole tier. |
| A host model with no efforts (for example deepseek-v4-pro:cloud) and the 'e' key. | A toast 'this model takes no effort setting'; nothing is written. |
| A host model referenced by an alias in config. | Served (servedModel matches aliases); the row shows the canonical id and its hosting. |
| A tier on the host family with an effort its model does not list (hand-edited). | The existing yellow 'not accepted — runs at the CLI default' note, as the daemon drops the effort. |
| A local-hosting model. | The row shows 'local'. |

**Invariants to preserve**

- Every family, model and effort the pane offers comes from the daemon's definitions answer; the TUI names no family id (the literal scan over src/cli, extended to every CLI family id of the shipped definitions, stays green). [[c3]]
- Each tier edit writes the whole tier { runner, model, effort } with one config.write, as today. [[c1]]
- Tiers on today's families (vendor CLIs and plain Ollama) render, cycle and refuse exactly as before, including the 'not served: runs the default until approved' note and the unknown-model check for a vendor CLI family. [[c1]]
- The pane mirrors the daemon's resolution without asking for it, as its existing served flag does; nothing new is persisted. [[c2]]

## 6. Test strategy

**Test framework:** `node:test with node:assert/strict, run through tsx (src/cli/__tests__/*.test.ts); the pane is rendered with ink-testing-library over fake services, as in tui-models.test.ts`

**Test levels**

- **unit** — The pure tier logic over a fake definitions answer that includes a family with a host.
  - Subjects: `src/cli/__tests__/model-tiers.test.ts: computeEffectiveTiers sets hosting for a served host-family model and notSupported for an undeclared one; vendor and plain Ollama tiers carry no hosting and notSupported false.`, `src/cli/__tests__/model-tiers.test.ts: resolveTypedModel refuses an unlisted id for a host family (never 'check') and still returns 'check' for a vendor CLI family; switchFamily to the host family takes its first declared model.`
  - Fixtures: `A fake definitions answer adding a family with host 'ollama', cliKind 'claude', no tierDefaults, and models with hosting 'cloud' (with efforts) and 'local' (no efforts).`
- **integration** — The Model Tiers pane end to end with fake services.
  - Subjects: `src/cli/__tests__/tui-models.test.ts: 'f' reaches the Ollama-hosted runner next to today's runners and writes its first declared model as a whole tier; the row shows the model's cloud/local label.`, `src/cli/__tests__/tui-models.test.ts: on a host-family tier, 'm' cycles only declared models, 'n' is hidden and opens nothing, 'e' on a model with no efforts says it takes no effort setting and writes nothing.`, `src/cli/__tests__/tui-models.test.ts: a configured host-family tier with an undeclared model shows 'not supported by <family>: the tier will not run', not the vendor 'runs the default' note; a vendor unserved model still shows the vendor note.`, `src/cli/__tests__/tui-models.test.ts: after a tier is saved on the Ollama-hosted runner and the pane reloads (config.show returns the saved tier), the row shows that runner, the model with its cloud/local label and the effort the daemon uses (an effort the model does not list is marked as dropped).`
- **unit** — No family id in the TUI: the scan flags every CLI family id of the shipped definitions, including the Ollama-hosted one.
  - Subjects: `src/daemon/__tests__/model-literal-scan.test.ts: the CLI-family-id check is extended from the fixed cli-claude/cli-codex pattern to every family id that has a CLI kind in the shipped definitions file (so 'cli-vibe' and 'ollama-claude' are flagged outside the definitions' owners), with a fixture literal proving the new id is caught; the scan stays green on the tree.`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `tui-models.test.ts: 'f' reaches the Ollama-hosted runner next to today's runners and writes its first declared model as a whole tier` |
| `ac2` | `tui-models.test.ts: on a host-family tier 'm' cycles only declared models, 'n' is hidden, 'e' offers only the model's efforts`, `model-tiers.test.ts: resolveTypedModel refuses an unlisted id for a host family`, `tui-models.test.ts: the row shows the model's cloud/local label` |
| `ac3` | `tui-models.test.ts: after a tier is saved on the Ollama-hosted runner and the pane reloads, the row shows that runner, the model with its cloud/local label and the effort the daemon uses` |

## 7. Migration

**State before:** The Model Tiers pane (src/cli/panes/ModelTiersPane.tsx over src/cli/panes/model-tiers.ts) already cycles every family the definitions declare, including ollama-claude, but shows no cloud/local label, offers 'n' (type another id, then the unknown-model check the daemon refuses for a host family), and shows an undeclared host-family model with the vendor note 'not served: runs the default until approved', which is wrong for a host family (nothing runs).

**State after:** The pane recognises a family by its host mark: each host-family model is labelled cloud or local, 'n' is withheld for it, a typed unlisted id is refused, a model with no efforts says so on 'e', and an undeclared host-family model is shown as 'not supported: the tier will not run'. Vendor and plain Ollama tiers are unchanged.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add hosting and notSupported to EffectiveTier in the pure tier logic, and make the typed-id resolution refuse an unlisted id for a host family. — ↩ rollbackable
2. Render the cloud/local label and the 'not supported' note in the pane, withhold 'n' for a host family, and explain a model with no effort setting on 'e'. — ↩ rollbackable

**Backward compat:** Display-only change in the TUI: nothing persisted changes, tier writes keep their whole-tier shape, and an older daemon without host/hosting renders as today.

## 8. Alternatives considered

### 8.1 a1: Host-aware pane logic over the definitions answer — **CHOSEN**

Keep the pane's one data path (definitions + config): model-tiers.ts learns the host mark, so the tier row labels cloud/local, the typed-id path refuses a host family, and an undeclared host model is shown as 'not supported, will not run'.

In src/cli/panes/model-tiers.ts, EffectiveTier gains the host-family status (served, unserved for a vendor family, or not supported for a host family) derived from the family's host mark in the definitions answer, and `hosting` for a served host model. resolveTypedModel refuses a typed id that a host family does not serve ('only listed <displayName> models are selectable'), so the unknown-model check screen is never opened for it. effortChoices is unchanged (it already offers only the model's own efforts plus the CLI default).

In ModelTiersPane.tsx the tier row appends the model's hosting ('cloud' / 'local') for a host family, replaces the 'not served: runs the default until approved' note with 'not supported by <family>: the tier will not run; pick a listed model with m' when the model is not supported, the 'e' key says 'this model takes no effort setting' when the model lists none, and the 'n' key hint and prompt are withheld for a host family. Families are recognised by `host`, never by id, so the literal scan stays green. 'f' already offers every family, so ollama-claude appears next to today's runners; switching to it picks the family's first declared model (familyDefaultTier's existing fallback).

### 8.2 a2: Ask the daemon for each tier's resolution

Add a models.resolveTier IPC returning the daemon's TierResolution per tier, and have the pane show that instead of computing it.

A new daemon handler (next to models.resolveRole in src/daemon/model-definitions.ts) returns resolveTierWith's TierResolution for core/mid/cheap, including fallback 'model-not-supported'. The TUI's model service gains resolveTier, and the pane renders family/model/effort and the fallback from it, while the editing keys work as in a1 (cloud/local labels, refused typed ids for host families).

**Rejected because:** Equal on ac1-ac3 but partial on sc2 (a new daemon IPC outside s3's boundary) and strictly more work, since it still needs a1's editing logic.

## 9. References

- **[[c1]]** `analyze-bundle` `s1 bundle: The terminal UI's Model Tiers pane: how families, models and efforts are offered and how a tier is shown` — "Each edit writes the whole tier { runner, model, effort } to models.tiers.<tier> via config.write."
- **[[c2]]** `analyze-bundle` `s1 bundle: What the definitions answer and the daemon's tier resolution give the TUI for ollama-claude (s1, s2)` — "an undeclared one resolves to no model with fallback 'model-not-supported' and nothing runs"
- **[[c3]]** `analyze-bundle` `s1 bundle: Constraints and test patterns for the TUI change` — "the TUI must recognise a host family by its `host` field, not by id"

## 10. Open questions

- Item alt2: alternatives were scored against ac1-ac3, sc1 and sc2; Epic constraints k1-k6 are reflected in the notes but not as separate score entries (partial), as in the s1 and s2 LLDs where k1-k6 were treated as a pre-filter gate.

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 do not hold · 0 could not be verified · 14 hold** · template `design-spec` · model `cli-claude:claude-sonnet-5` · reviewed 2026-10-30T06:22:31.096Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

_None._
