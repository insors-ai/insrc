<!-- insrc:artifact CR-ce99b72065d03b1b-s3 -->

# Code review: ce99b72065d03b1b:s3

⚠️ **WARN** — HIGH 0 · MED 7 · LOW 17 · model `codex:gpt-6.1-sol`

**Changed files:** 87

**Reviewed on the diff:** the wait for a fresh index timed out after 133 s (code-index job in flight: no; queued: 0; stale files: src/daemon/db/__tests__/fixtures/session-source-inventory.json)

## adherence — 4 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/daemon/model-definitions.ts:193 | Validation rejects empty role or repoPath strings, although the approved contract requires only that both parameters be present and strings. These inputs therefore return invalid-params instead of reaching role resolution. Remove the empty-string checks to match the approved parameter contract. |
| MED | src/daemon/config-write.ts:57 | The rejection guard adds an unapproved exception: a model in registry.rejected(family) is accepted when registry.find also serves it. In that case config.write succeeds and persists the candidate, whereas this clause requires rejected-model and unchanged config.json whenever the rejected list includes the model. Remove the registry.find condition from this guard. |
| MED | src/daemon/steps/build-step/phases/validate.ts:190 | The supplied evidence does not show build-step validation migrated to registry.cliKind. The provider-construction note covers shaper-provider.ts, but no note establishes implementation of this separately required validation consumer. |
| MED | vscode-plugin/scripts/sync-manifest-catalog.mjs:32 | The synchronizer regenerates every catalog-backed manifest setting, producing unrelated changes to thread/maintenance settings, review limits and analyzer timeout. These changes exceed s3's model-settings migration boundary. Limit synchronization to the model-related settings required by this Story and revert the unrelated manifest edits. |

## conventions — 13 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | scripts/check-model-definitions.mjs:34 | The build gate uses console.log for success and console.error for failure. Use getLogger('check-model-definitions') to follow the documented logging rule. |
| LOW | src/agent/providers/__tests__/input-budget.test.ts:43 | The family lookup and models[0] use non-null assertions without handling undefined. Assert that the family and first model exist before dereferencing them; the later input-limit check cannot guard these accesses. |
| LOW | src/analyze/context/__tests__/role-router-global-tiers.test.ts:84 | The cast declares `defaultModel?: string`, but the documented convention requires optional properties to explicitly include `\| undefined`. The same declaration appears in summariser-provider.test.ts at lines 45, 47 and 49. |
| LOW | src/config/__tests__/check-model-definitions.test.ts:44 | The fixture mutation suppresses possibly undefined family, tierDefaults and mid lookups with non-null assertions. Assert their existence before mutation to handle the undefined cases required by the documented strictness rule. |
| LOW | src/config/__tests__/config-catalog-defs.test.ts:69 | Catalog row and family lookups are repeatedly dereferenced with non-null assertions without existence checks. Assert the lookup results before reading their properties to satisfy the documented undefined-handling rule. |
| LOW | src/daemon/__tests__/config-write-models.test.ts:114 | The result assertion declares reason?: string and detail?: string without the explicit \| undefined required for optional properties. |
| LOW | src/daemon/__tests__/model-literal-scan.test.ts:59 | The fixture type declares aliases?: string[] without the required explicit \| undefined. |
| LOW | src/daemon/__tests__/models-daemon-s3.test.ts:127 | The fixture type declares toolLoopModel?: string without the required explicit \| undefined. |
| LOW | src/daemon/__tests__/model-catalog-asset.test.ts:86 | The provider assertion type declares defaultModel?: string without the required explicit \| undefined. |
| LOW | src/daemon/__tests__/boot-cold-import.test.ts:45 | The fixture's find() result is dereferenced without checking for undefined, with Record<string, any> hiding the missing check. The same pattern occurs at line 138. Assert that the family exists before modifying tierDefaults. |
| LOW | src/workflow/__tests__/attribution.test.ts:96 | The new stampOf helper suppresses indexed undefined with outputs[0]!, as do the legacy assertions at lines 109 and 112. Assert that each indexed element exists before accessing its fields to satisfy the documented strictness rule. |
| LOW | vscode-plugin/scripts/sync-manifest-catalog.mjs:65 | The up-to-date and regeneration branches call console.log directly (lines 65 and 71), violating the documented requirement to use getLogger('module-name'). |
| LOW | vscode-plugin/src/config/__tests__/sync-manifest-catalog.test.ts:37 | The stale-fixture construction uses non-null assertions for both configuration-section lookups and the indexed core-model property without checking existence. Assert these values exist before dereferencing them to handle their possible undefined results. |

## coverage — 0 finding(s)

_No findings._

## quality — 7 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/daemon/config-write.ts:34 | Correctness: models.local.host is excluded from restart-sensitive settings, although embedder.ts retains its first Ollama client indefinitely. An accepted host change therefore reports no restart requirement while embedding requests continue using the previous host. Include this setting or recreate the cached client. |
| MED | src/daemon/__tests__/model-literal-scan.test.ts:65 | Complexity: the regular-expression comment stripper approximates TypeScript tokenization without recognizing strings. For example, `const a = '/*'; const m = 'opus'; const b = '*/';` hides the forbidden model literal from the scan. Use a lexical scanner so quoted comment markers cannot disable this guard. |
| LOW | src/daemon/__tests__/models-daemon-s3.test.ts:45 | Duplication: this startup helper repeats the child spawning, stderr collection, socket polling, shutdown request and forced termination implemented by runDaemon in boot-cold-import.test.ts. A shared lifecycle helper would keep timeout and cleanup behavior consistent. |
| MED | src/daemon/__tests__/boot-cold-import.test.ts:95 | Error handling: child exit does not guarantee stderr has finished draining, but the helper returns its captured stderr immediately after observing exit. Startup-error assertions can consequently miss the validation diagnostic and fail intermittently. Await the child's close event before returning captured output. |
| LOW | src/config/__tests__/config-catalog-defs.test.ts:128 | Correctness: the import-closure guard recognizes only import-from declarations. Side-effect imports and re-exports can introduce prohibited dependencies while this check still passes. Include those declaration forms in the traversal. |
| LOW | src/analyze/context/driver.ts:1123 | Duplication: context-window resolution repeats the lookup in ollamaContextWindow, but returns zero when the chosen model lacks a limit, whereas the helper uses the tool-loop model's limit. Share the calculation or document why these provider paths need different defaults. |
| MED | scripts/insrc-daemon-install.sh:286 | Both scripts duplicate the same catalog parsing, default-family selection, validation, and tier/config generation logic. Maintaining these implementations separately requires every fix to be applied twice and risks inconsistent installer behavior. Keep one canonical script and generate or copy the packaged asset from it. |

