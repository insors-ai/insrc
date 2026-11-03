<!-- insrc:artifact PLAN-b220bb6174a2f5ed-s4 -->

# Plan: E20261030b220bb61:S004

## Summary

**Epic:** `run-claude-codex-ollama-models`
**LLD run:** `wf-1793347664489-1sl1yl`
**LLD effective hash:** `ca5bac7aee60...`

Building this Story teaches the VS Code extension about the Claude-on-Ollama runner. The plugin's view of the daemon's definitions gains the host and hosting marks; the 'insrc: Set model tier' picker then labels that runner's models cloud or local, drops the 'enter another id' path for it and says plainly when a configured model will not run; and the native tier settings refuse an unlisted model for it with the right reason. Today's runners keep their current picker items and messages.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** host/hosting on the plugin's definitions types; host-aware tier picker | M | — | unit: model-tier-picker.test.ts: the host family is offered next to today's; its models carry cloud/local marks, no 'Enter another model id', efforts only where the model has them, one whole-tier write; unit: model-tier-picker.test.ts: an undeclared current model on the host family is 'not supported — the tier will not run'; a vendor family and a host-less answer keep today's items; unit: model-tier-picker.test.ts: reopening the picker after a save on the host family marks the saved family, model and effort as current | [[c1]] [[c2]] [[c4]] [[c5]] |
| 2 | **`t2`** Settings sync refuses an undeclared host-family model with the 'only listed' reason; tier setting descriptions | S | `t1` | unit: sync-engine.test.ts: an undeclared model for the host family is refused with 'only listed models can be used' and reverted; a vendor or host-less family keeps 'check and approve it'; a daemon refusal reverts; unit: sync-engine.test.ts: a runner-only switch to the host family writes its first declared model as the whole tier and mirrors the native keys; an alias is written canonically; an effort the model does not take is refused | [[c1]] [[c3]] [[c4]] [[c5]] |

### 1.1 E20261030b220bb61:S004:T001 — host/hosting on the plugin's definitions types; host-aware tier picker

vscode-plugin/src/models/definitions.ts: DefinedFamily gains host?: 'ollama' and DefinedModel gains hosting?: 'cloud' | 'local'. vscode-plugin/src/models/model-tier-picker.ts: modelDescription adds the model's hosting to its marks; pickModel adds 'Enter another model id…' only for a family with a cliKind and no host, and lists a current model a host family does not declare as '(current, not supported — the tier will not run): <id>' with 'not supported by <displayName>'. Vendor and plain Ollama families unchanged. Tests in vscode-plugin/src/models/__tests__/model-tier-picker.test.ts over a fake answer with a host family.

**Acceptance checks:**
- The family step offers the host family next to today's families; picking it lists only its declared models, each with 'cloud' or 'local' among its marks, plus Refresh and no 'Enter another model id…'.
- A host model with efforts offers '' plus its own levels; one with none skips the effort step; the pick writes the whole tier once.
- A configured undeclared model on the host family is listed as '(current, not supported — the tier will not run)'; a vendor family keeps '(current, not listed — runs the default)' and 'Enter another model id…'.
- An answer without host (older daemon) shows no marks and offers 'Enter another model id…' for that CLI family.
- Reopening the picker after a save marks the saved family, model (with its mark) and effort as current; an effort the model does not take shows as the CLI default.
- model-tier-picker.ts names no runner or model literal (the existing literal-scan test stays green).

### 1.2 E20261030b220bb61:S004:T002 — Settings sync refuses an undeclared host-family model with the 'only listed' reason; tier setting descriptions

vscode-plugin/src/config/sync-engine.ts applyTier: an undeclared model on a family with a host is refused with "insrc: '<model>' is not a listed <displayName> model; only listed <displayName> models can be used (<ids>) — <tier> tier not changed" and every changed key reverted; vendor CLI families keep the 'check and approve it' message. vscode-plugin/scripts/sync-manifest-catalog.mjs TIER_NOTE says (naming no family) that a family running its CLI on Ollama accepts only its listed models; vscode-plugin/package.json regenerated with npm run sync-manifest. Tests in vscode-plugin/src/config/__tests__/sync-engine.test.ts.

**Acceptance checks:**
- Setting a model the host family does not declare is refused with the 'only listed <family> models can be used (<ids>)' reason, every changed key is reverted and nothing is written to the daemon.
- A vendor CLI family's unlisted model keeps the 'run insrc: Set model tier to check and approve it' message, and so does the same family in an answer without host (older daemon).
- Setting only the runner to the host family writes its first declared model with effort '' as the whole tier and mirrors it into the native model/effort keys; a declared model given by alias is written with the canonical id.
- An effort the declared host model does not take is refused as today and reverted.
- A daemon refusal of the host-family write (ok:false) reverts every changed key with 'daemon rejected the <tier> tier — <reason>'.
- The tier setting descriptions in package.json match the regenerated TIER_NOTE (sync-manifest --check passes) and name no family, model or effort.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| vscode-plugin/src/models/__tests__/model-tier-picker.test.ts: the family step offers the Claude-on-Ollama family next to today's families; picking it lists only its declared models, each with its cloud/local mark, and no 'Enter another model id…'; picking a model with efforts offers '' plus its own levels, a model with none skips the effort step; one whole-tier write. | `t1` |
| vscode-plugin/src/models/__tests__/model-tier-picker.test.ts: a configured undeclared model on the host family is listed as '(current, not supported — the tier will not run)'; a vendor family keeps '(current, not listed — runs the default)' and 'Enter another model id…'; an answer without host shows no marks and offers 'Enter another model id…'. | `t1` |
| vscode-plugin/src/models/__tests__/model-tier-picker.test.ts: after a tier is saved on the Claude-on-Ollama family, reopening the picker (configShow returns the saved tier) marks that family and model as current with its cloud/local mark and the saved effort as current; an effort the model does not take is shown as the CLI default. | `t1` |
| vscode-plugin/src/config/__tests__/sync-engine.test.ts: setting insrc.models.tiers.<tier>.model to a model the Claude-on-Ollama family does not declare is refused with 'only listed <family> models can be used', reverts every changed key and writes nothing; a vendor family's unlisted model keeps the 'check and approve it' message. | `t2` |
| vscode-plugin/src/config/__tests__/sync-engine.test.ts: setting only the runner to the Claude-on-Ollama family takes its first declared model with effort '' and writes the whole tier, mirrored into the native model/effort keys; a declared model (or alias) with a listed effort is written with the canonical id. | `t2` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s4 dataModelChanges DefinedFamily + DefinedModel` — "+ readonly host?: 'ollama' | undefined;"
- **[[c2]]** `prior-artifact` `LLD s4 contractDetails.api modelDescription + pickModel` — "The models.check flow (checkUnlisted) is never reachable for a family with a host."
- **[[c3]]** `prior-artifact` `LLD s4 contractDetails.api applyTier + migration step 3` — "A vendor CLI family keeps the 'run insrc: Set model tier to check and approve it' message; plain Ollama keeps the 'only listed' message."
- **[[c4]]** `prior-artifact` `LLD s4 errorPaths errorCases + edgeCases + invariantsToPreserve` — "No host field: the family is treated as today's CLI families (no cloud/local marks, 'Enter another model id…' offered, the 'check and approve' settings message)."
- **[[c5]]** `prior-artifact` `LLD s4 testStrategy acceptanceMapping ac1-ac4` — "reopening the picker after a save shows the saved runner, model (with its mark) and effort as current"
