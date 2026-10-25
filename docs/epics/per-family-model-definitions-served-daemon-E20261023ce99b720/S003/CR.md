<!-- insrc:artifact CR-ce99b72065d03b1b-s3 -->

# Code review: ce99b72065d03b1b:s3

⚠️ **WARN** — HIGH 0 · MED 10 · LOW 16 · model `codex:gpt-6.1-sol`

**Changed files:** 87

**Reviewed on the diff:** the wait for a fresh index timed out after 125 s (code-index job in flight: no; queued: 0; stale files: src/daemon/db/__tests__/fixtures/session-source-inventory.json)

## adherence — 8 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/daemon/config-write.ts:37 | Including models.local.host makes a host-only write return restartRequired:true even when all five restart-sensitive settings listed in the approved contract are unchanged. This extends the contract despite its requirement that other paths retain their existing behavior. |
| LOW | src/daemon/model-definitions.ts:193 | Validation rejects empty role or repoPath strings, narrowing the approved contract, which specifies invalid-params only for missing or non-string values. Remove the empty-string checks so supplied strings reach role resolution. |
| MED | src/config/reconcile.ts:350 | The evidence establishes reconciliation defaults from the shipped CONFIG_CATALOG, but shows no daemon wiring to buildConfigCatalog(validateModelCatalog()) after main() validates. That required runtime integration remains unimplemented; daemon reconciliation must use the validated registry rather than the shipped display defaults. |
| LOW | src/daemon/steps/host.ts:88 | The evidence explicitly says the host only validates client identity and delegates family conversion to consumers. This departs from the approved requirement that the host use the daemon-owned familyForClient helper. |
| MED | src/daemon/steps/build-step/phases/validate.ts:184 | No supplied evidence note shows the required validation-provider implementation: reuse the router's CLI provider, or resolve the default family's build tier through the registry and construct it through the same factory, logging the substitution. This required portion is unimplemented on the stipulated evidence. |
| MED | src/daemon/handler-runtime.ts:1226 | No supplied evidence note shows claude.models switching to the registry's Claude-kind served models with the specified response shape, or removal of the Anthropic SDK import and direct REST call. This required portion is unimplemented on the stipulated evidence. |
| LOW | scripts/insrc-daemon-install.sh:289 | Malformed JSON throws an uncaught SyntaxError without naming the definitions file, departing from the required filename-bearing error response. Wrap the reader failure with a diagnostic containing MODEL_DEFS in both installer copies. |
| MED | src/workflow/attribution.ts:45 | The family-prefix branch strips `ollama:` from the historical label, producing model `qwen3.6:35b-a3b`. The approved edge case requires runner `ollama` with the raw model label `ollama:qwen3.6:35b-a3b` preserved. |

## conventions — 10 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | scripts/check-model-definitions.mjs:34 | The build gate reports success with console.log, violating the documented requirement to use getLogger. No script exception is established by the evidence. |
| LOW | src/agent/providers/__tests__/input-budget.test.ts:43 | The family lookup and models[0] use non-null assertions without checking either result, bypassing the documented requirement to handle undefined indexed values. Assert that the family and model exist before dereferencing them. |
| LOW | src/analyze/context/__tests__/role-router-global-tiers.test.ts:84 | The test shape declares `defaultModel?: string` without the explicitly required `\| undefined`. Use `defaultModel?: string \| undefined`; the same declaration appears in summariser-provider.test.ts. |
| LOW | src/config/__tests__/installer-defs.test.ts:80 | Fixture cast shapes declare tierDefaults and toolLoopModel as optional without explicit `\| undefined`; check-model-definitions.test.ts:43 does the same for tierDefaults. Add `\| undefined` to follow the documented optional-property convention. |
| LOW | src/config/__tests__/config-catalog-defs.test.ts:69 | Catalog lookups use non-null assertions and immediately dereference potentially missing rows. Assert that each row exists before accessing its properties so undefined is explicitly handled. |
| LOW | src/daemon/__tests__/config-write-models.test.ts:114 | The result type declares reason/detail as optional properties without the required explicit `\| undefined`. The noted aliases, toolLoopModel and defaultModel declarations repeat this documented convention violation. |
| LOW | src/daemon/__tests__/claude-models.test.ts:73 | The handler lookup uses a non-null assertion without checking that the indexed handler exists. Assert its presence before invoking it to satisfy the documented requirement to handle undefined index results. |
| LOW | vscode-plugin/scripts/sync-manifest-catalog.mjs:23 | The dynamic project import explicitly targets config-catalog.ts, violating the documented requirement to use .js extensions even for TypeScript sources. |
| LOW | vscode-plugin/scripts/sync-manifest-catalog.mjs:65 | The script uses console.log for status output here and at line 71 instead of the required getLogger logger. |
| LOW | vscode-plugin/src/config/__tests__/sync-manifest-catalog.test.ts:37 | Non-null assertions on the fixture section lookups and indexed property suppress possible undefined values without handling them. Assert that the sections and property exist before dereferencing them. |

## coverage — 0 finding(s)

_No findings._

## quality — 8 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/analyze/context/shaper-provider.ts:237 | Correctness: when the effective family is local but the requested model belongs to a CLI family, registry.find returns undefined and this branch still forwards the incompatible requested ID to Ollama. For example, an unset configuration with clientDefault='ollama' can send the default CLI core model to Ollama. Use a listed local fallback when the requested model belongs to another family. |
| LOW | src/daemon/__tests__/model-literal-scan.test.ts:66 | Complexity: the comment-stripping regex does not distinguish comments from string contents. Valid strings containing /* and */ can cause intervening executable code to disappear from the scan, allowing forbidden literals to pass. A token-based scan would avoid this ambiguity. |
| LOW | src/analyze/context/driver.ts:1102 | Duplication: local provider construction repeats the shared factory's host lookup, context-window selection and constructor call. The two paths already express different missing-limit fallbacks, increasing the maintenance needed to keep local provider behavior consistent. |
| MED | scripts/insrc-daemon-install.sh:292 | Error handling: family lookup can return undefined when no family runs the selected CLI, a configuration explicitly exercised by the supplied fixtures where both CLI families run Codex. Noninteractive installation still selects Claude, then dereferences fam.tierDefaults and aborts with a TypeError. Select an available CLI or reject the choice with an actionable error. |
| MED | vscode-plugin/assets/insrc-daemon-install.sh:293 | Error handling: the installer always offers claude and codex, but the definitions can lack a family for either CLI. In that case, fam is undefined and reading tierDefaults throws during installation. Validate the selected CLI's family before generating settings and report an actionable error. |
| LOW | src/daemon/code-review-rpc.ts:258 | Duplication: both RPC modules repeat the same provider-resolution and model-label logic. A shared helper would prevent attribution labels from diverging when resolution rules change. |
| MED | scripts/insrc-daemon-install.sh:286 | Both installers duplicate the catalog loading, default-family selection, tier serialization, and local-model selection logic verbatim. Future fixes must be maintained twice and can drift; keep one canonical installer and generate the packaged copy. |
| MED | src/daemon/workflow-rpc.ts:630 | modelLabelFor independently reconstructs the model-selection decision in buildShaperProvider, and the implementations have diverged: an explicit model outside the selected CLI family is reported here even though provider construction rejects it and uses the CLI default. Share a resolved provider/model descriptor between construction and labeling so meta.model reflects the actual selection. |

