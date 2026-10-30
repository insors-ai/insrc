<!-- insrc:artifact PLAN-b220bb6174a2f5ed-s3 -->

# Plan: E20261030b220bb61:S003

## Summary

**Epic:** `run-claude-codex-ollama-models`
**LLD run:** `wf-1793340689279-hnplkh`
**LLD effective hash:** `ca5bac7aee60...`

Building this Story teaches the terminal UI's Model Tiers screen about the Ollama-hosted Claude runner. The pure tier logic learns to read a family's host mark and a model's cloud/local hosting from the daemon's definitions answer, so it can label models, refuse typed ids the family does not list, and show an undeclared model as not supported. The screen then renders those labels and messages and withholds the 'type another id' key for that runner, and the existing literal scan is widened so no family id, including the new one, is ever hard-coded in the UI.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Host-aware tier logic in model-tiers.ts | S | — | unit: model-tiers.test.ts: computeEffectiveTiers marks a host family's served model with its hosting and an undeclared one as notSupported; vendor, plain Ollama and host-less families are unchanged; unit: model-tiers.test.ts: resolveTypedModel refuses an unlisted id for a host family and keeps 'check' for a vendor CLI family; switchFamily to the host family takes its first declared model | [[c1]] [[c2]] [[c5]] |
| 2 | **`t2`** Model Tiers pane: cloud/local label, not-supported note, withheld 'n', effort messages | M | `t1` | integration: tui-models.test.ts: 'f' reaches the Ollama-hosted runner and writes its first declared model as a whole tier, labelled cloud or local; integration: tui-models.test.ts: on a host-family tier 'm' and 'e' cycle only declared values, 'n' is hidden and opens nothing, and a model with no efforts says so; integration: tui-models.test.ts: an undeclared host-family model shows 'not supported ... will not run'; a vendor unserved model keeps the vendor note; integration: tui-models.test.ts: a tier saved on the Ollama-hosted runner shows its runner, model, cloud/local label and effort after reload | [[c3]] [[c5]] [[c6]] |
| 3 | **`t3`** Extend the literal scan to every CLI family id of the shipped definitions | S | — | unit: model-literal-scan.test.ts: every CLI family id of the shipped definitions, including ollama-claude and cli-vibe, is flagged outside the owners | [[c4]] |

### 1.1 E20261030b220bb61:S003:T001 — Host-aware tier logic in model-tiers.ts

EffectiveTier gains `hosting?: 'cloud' | 'local'` (a host family's served model) and `notSupported: boolean` (a host family not serving the configured model; served stays false). computeEffectiveTiers reads the family's `host` and the served model's `hosting` from the definitions answer; vendor and plain Ollama tiers keep hosting absent and notSupported false, and a family entry without `host` (an older daemon) computes as today. resolveTypedModel returns refused ('only listed <displayName> models are selectable') for an id a host family does not serve, so it never yields 'check' for it. switchFamily to a host family (no tier defaults) takes its first declared model with the CLI-default effort. effortChoices is unchanged. Unit tests in src/cli/__tests__/model-tiers.test.ts over a fake definitions answer with a host family (cloud model with efforts, local model without).

**Acceptance checks:**
- computeEffectiveTiers sets hosting for a served host-family model (cloud and local) and notSupported true for an undeclared one; vendor and plain Ollama tiers carry no hosting and notSupported false.
- A configured alias of a host model is served, reported with the canonical id and its hosting.
- A family entry without `host` (older daemon answer) computes as a vendor family: no hosting, notSupported false, and a typed unlisted id still yields 'check' when it has a CLI kind.
- resolveTypedModel refuses an unlisted id for a host family and still returns 'check' for a vendor CLI family; an alias of a host model resolves to served.
- Switching a tier to the host family takes its first declared model with the CLI-default effort.
- The family is recognised by `host`, never by id: no family id literal is added to src/cli.

### 1.2 E20261030b220bb61:S003:T002 — Model Tiers pane: cloud/local label, not-supported note, withheld 'n', effort messages

In src/cli/panes/ModelTiersPane.tsx the tier row appends the model's hosting ('cloud' / 'local') for a host family; a notSupported tier shows 'not supported by <family displayName>: the tier will not run; pick a listed model with m' instead of the vendor 'not served' note; the 'n' key hint is hidden and 'n' does nothing for a host family (so no typed id reaches the check path; resolveTypedModel's refusal from t1 backs any prompt path); 'e' on a model with no efforts toasts 'this model takes no effort setting' and writes nothing; 'e' on a notSupported tier toasts '<model> is not supported by <family>: pick a listed model with m' (the vendor toast at :184 stays for vendor families only). Integration tests in src/cli/__tests__/tui-models.test.ts with ink-testing-library over fake services, including the save-then-reload test for ac3.

**Acceptance checks:**
- 'f' reaches the Ollama-hosted runner next to today's runners and writes its first declared model as one whole tier; the row shows the model's cloud/local label.
- On a host-family tier 'm' cycles only declared models and 'e' cycles only the model's efforts, each edit writing the whole tier { runner, model, effort } with one config.write.
- On a host-family tier 'n' is hidden from the key hints and pressing it opens no prompt and writes nothing; 'e' on a model with no efforts toasts 'this model takes no effort setting' and writes nothing.
- A configured host-family tier with an undeclared model shows the 'not supported ... will not run' note and its 'e' toast; a vendor unserved model still shows the vendor note and toast, and 'n' still opens the prompt for a vendor family.
- After a tier is saved on the Ollama-hosted runner and the pane reloads (config.show returns the saved tier), the row shows that runner, the model with its cloud/local label and the effort the daemon uses, with an unlisted effort marked as dropped.

### 1.3 E20261030b220bb61:S003:T003 — Extend the literal scan to every CLI family id of the shipped definitions

In src/daemon/__tests__/model-literal-scan.test.ts replace the fixed /cli-(claude|codex)/ family-id pattern with one built from every family that has a CLI kind in the shipped definitions file (cli-claude, cli-codex, cli-vibe, ollama-claude), read like modelNames(); add an injected fixture literal proving 'ollama-claude' is flagged outside the definitions' owners. The scan stays green on today's tree.

**Acceptance checks:**
- The scan flags a quoted 'ollama-claude' and 'cli-vibe' literal outside the owner files in an injected fixture.
- The family-id list is read from the shipped definitions file, not hard-coded in the test.
- The scan passes on the current tree (comments stay stripped).

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| src/cli/__tests__/model-tiers.test.ts: computeEffectiveTiers sets hosting for a served host-family model and notSupported for an undeclared one; vendor and plain Ollama tiers carry no hosting and notSupported false. | `t1` |
| src/cli/__tests__/model-tiers.test.ts: resolveTypedModel refuses an unlisted id for a host family (never 'check') and still returns 'check' for a vendor CLI family; switchFamily to the host family takes its first declared model. | `t1` |
| src/cli/__tests__/tui-models.test.ts: 'f' reaches the Ollama-hosted runner next to today's runners and writes its first declared model as a whole tier; the row shows the model's cloud/local label. | `t2` |
| src/cli/__tests__/tui-models.test.ts: on a host-family tier, 'm' cycles only declared models, 'n' is hidden and opens nothing, 'e' on a model with no efforts says it takes no effort setting and writes nothing. | `t2` |
| src/cli/__tests__/tui-models.test.ts: a configured host-family tier with an undeclared model shows 'not supported by <family>: the tier will not run', not the vendor 'runs the default' note; a vendor unserved model still shows the vendor note. | `t2` |
| src/cli/__tests__/tui-models.test.ts: after a tier is saved on the Ollama-hosted runner and the pane reloads (config.show returns the saved tier), the row shows that runner, the model with its cloud/local label and the effort the daemon uses (an effort the model does not list is marked as dropped). | `t2` |
| src/daemon/__tests__/model-literal-scan.test.ts: the CLI-family-id check is extended from the fixed cli-claude/cli-codex pattern to every family id that has a CLI kind in the shipped definitions file (so 'cli-vibe' and 'ollama-claude' are flagged outside the definitions' owners), with a fixture literal proving the new id is caught; the scan stays green on the tree. | `t3` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s3 contractDetails.api computeEffectiveTiers + dataModelChanges EffectiveTier` — "Adds hosting?: 'cloud' | 'local' (a host family's served model) and notSupported: boolean"
- **[[c2]]** `prior-artifact` `LLD s3 contractDetails.api resolveTypedModel` — "A host family never yields 'check', so the unknown-model check screen is never opened for it."
- **[[c3]]** `prior-artifact` `LLD s3 contractDetails.api ModelTiersPane` — "the 'n' key hint is hidden and 'n' does nothing; 'e' on a model with no efforts toasts 'this model takes no effort setting'"
- **[[c4]]** `prior-artifact` `LLD s3 errorPaths.invariantsToPreserve literal scan + testStrategy model-literal-scan subject` — "the literal scan over src/cli, extended to every CLI family id of the shipped definitions, stays green"
- **[[c5]]** `prior-artifact` `LLD s3 errorPaths errorCases + edgeCases` — "No host field: the family is treated as today's families (no labels, no refusal), so an older daemon behaves as before."
- **[[c6]]** `prior-artifact` `LLD s3 testStrategy acceptanceMapping ac1-ac3` — "after a tier is saved on the Ollama-hosted runner and the pane reloads, the row shows that runner, the model with its cloud/local label and the effort the daemon uses"
