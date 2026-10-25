<!-- insrc:artifact TESTS-ce99b72065d03b1b-s3 -->

# Tests: ce99b72065d03b1b s3

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 34 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-25T20:01:03.859Z on commit `59060e68a`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: config-catalog-defs.test.ts: buildConfigCatalog(fixture) takes runner/model/effort defaults, effort enums and coreModel default from the fixture; CONFIG_CATALOG equals buildConfigCatalog(shipped); no ollamaNumCtx row; loadBuiltCatalog accepts the built catalog**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | config-catalog-defs.test.ts: buildConfigCatalog(fixture) takes runner/model/effort defaults, effort enums and coreModel default from the fixture; CONFIG_CATALOG equals buildConfigCatalog(shipped); no ollamaNumCtx row; loadBuiltCatalog accepts the built catalog | `src/config/__tests__/config-catalog-defs.test.ts` |
| pass | the real CONFIG_CATALOG has 47 rows (models.shaper.ollamaNumCtx retired; flat models.* surface; shaper*/summariser* now derived; + three models.tiers.*.effort rows + codeReview.enforce + codeReview.freshnessTimeoutMs + codeReview.daemonReviewCeilingMs + codeReview.daemonReviewIdleMs + models.local.embeddingKeepAlive + five designReview.* rows + analyzer.dataSourceListingTimeoutMs + review.chunkTokens + daemon.threads.enabled + four daemon.maintenance.* rows) | `src/config/__tests__/config-catalog-contract.test.ts` |

**unit: config-catalog-defs.test.ts: model-defaults and config-catalog import no logger, registry or file-I/O module and derive without throwing from a fixture missing fields**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | config-catalog-defs.test.ts: model-defaults and config-catalog import no logger, registry or file-I/O module and derive without throwing from a fixture missing fields | `src/config/__tests__/config-catalog-defs.test.ts` |

**unit: check-model-definitions.test.ts: the build gate exits non-zero naming the entry for a structurally invalid copy and zero for the shipped file**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | check-model-definitions.test.ts: the build gate exits non-zero naming the entry for a structurally invalid copy and zero for the shipped file | `src/config/__tests__/check-model-definitions.test.ts` |

**unit: model-catalog-asset.test.ts: Codex models carry the 1048576-char inputLimit**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | model-catalog-asset.test.ts: Codex models carry the 1048576-char inputLimit | `src/daemon/__tests__/model-catalog-asset.test.ts` |

**unit: session-source-inventory suite passes after t1**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S3-INVENTORY: production boundaries have explicit reviewed classifications and unchanged baseline | `src/daemon/db/__tests__/session-source-inventory.test.ts` |
| pass | CM-S3-INVENTORY: renamed and destructured provider resolver factory serializer and filesystem APIs are discovered | `src/daemon/db/__tests__/session-source-inventory.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/config/__tests__/check-model-definitions.test.ts` | 0 | 1 | 1.1 s |  |
| `src/config/__tests__/config-catalog-contract.test.ts` | 0 | 12 | 0.4 s |  |
| `src/config/__tests__/config-catalog-defs.test.ts` | 0 | 2 | 1.1 s |  |
| `src/daemon/__tests__/model-catalog-asset.test.ts` | 0 | 2 | 0.6 s |  |
| `src/daemon/db/__tests__/session-source-inventory.test.ts` | 0 | 2 | 13.2 s |  |

## t2

Run at 2026-10-25T20:07:53.406Z on commit `2968540e2`. Tests check: **passed**. 9 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: reconcile-defs.test.ts: a fresh config is filled with a fixture's differing defaults including non-empty default efforts; byRepo tiers removed and reported per repo and tier, tasks and coreFloor kept; ollamaNumCtx pruned**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | reconcile-defs.test.ts: a fresh config is filled with a fixture's differing defaults including non-empty default efforts; byRepo tiers removed and reported per repo and tier, tasks and coreFloor kept; ollamaNumCtx pruned | `src/config/__tests__/reconcile-defs.test.ts` |
| pass | captured legacy config → migrated to the flat models.* surface, residue pruned, orphan survives | `src/config/__tests__/config-reconcile.test.ts` |

**unit: settings-cache-reset.test.ts: a local and an analyze config cached before reconcile return the reconciled values after the production resets**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | settings-cache-reset.test.ts: a local and an analyze config cached before reconcile return the reconciled values after the production resets | `src/config/__tests__/settings-cache-reset.test.ts` |

**unit: embedder-lazy.test.ts: importing embedder.ts calls no settings loader; the first getter does; lifecycle.ts and reembed use the getters**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | embedder-lazy.test.ts: importing embedder.ts calls no settings loader; the first getter does; lifecycle.ts and reembed use the getters | `src/indexer/__tests__/embedder-lazy.test.ts` |
| pass | every ollama.embed(...) call in the indexer embedder passes keep_alive | `src/indexer/__tests__/embedder-keepalive.test.ts` |

**integration: boot-cold-import.test.ts: both catalog chains import with a valid, missing, malformed and structurally invalid INSRC_MODEL_CATALOG_DIR; registry first read in main(); invalid files refused with the named error before reconcile**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | boot-cold-import.test.ts: both catalog chains import with a valid, missing, malformed and structurally invalid INSRC_MODEL_CATALOG_DIR | `src/daemon/__tests__/boot-cold-import.test.ts` |
| pass | boot-cold-import.test.ts: registry first read in main(); invalid files refused with the named error before reconcile; a valid alternate file is what the reconcile fills | `src/daemon/__tests__/boot-cold-import.test.ts` |

**unit: session-source-inventory suite passes after t2**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S3-INVENTORY: production boundaries have explicit reviewed classifications and unchanged baseline | `src/daemon/db/__tests__/session-source-inventory.test.ts` |
| pass | CM-S3-INVENTORY: renamed and destructured provider resolver factory serializer and filesystem APIs are discovered | `src/daemon/db/__tests__/session-source-inventory.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/config/__tests__/config-reconcile.test.ts` | 0 | 28 | 3.1 s |  |
| `src/config/__tests__/reconcile-defs.test.ts` | 0 | 1 | 1.6 s |  |
| `src/config/__tests__/settings-cache-reset.test.ts` | 0 | 1 | 0.6 s |  |
| `src/daemon/__tests__/boot-cold-import.test.ts` | 0 | 2 | 7.3 s |  |
| `src/daemon/db/__tests__/session-source-inventory.test.ts` | 0 | 2 | 15.1 s |  |
| `src/indexer/__tests__/embedder-keepalive.test.ts` | 0 | 2 | 0.8 s |  |
| `src/indexer/__tests__/embedder-lazy.test.ts` | 0 | 1 | 0.7 s |  |

## t3

Run at 2026-10-25T20:16:58.847Z on commit `1658a515d`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: tier-resolution.test.ts: unset and '' tiers resolve to the fixture default with its effort; '' effort is the CLI default; aliases resolve to canonical ids**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | tier-resolution.test.ts: unset and '' tiers resolve to the fixture default with its effort; '' effort is the CLI default; aliases resolve to canonical ids | `src/config/__tests__/tier-resolution.test.ts` |

**unit: tier-resolution.test.ts: an unaccepted effort is dropped with a warning naming tier, model and effort**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | tier-resolution.test.ts: an unaccepted effort is dropped with a warning naming tier, model and effort | `src/config/__tests__/tier-resolution.test.ts` |

**unit: tier-resolution.test.ts: unlisted and rejected models fall back with a warning naming tier, requested model, reason and default, kept in tierResolutions**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | tier-resolution.test.ts: unlisted and rejected models fall back with a warning naming tier, requested model, reason and default, kept in tierResolutions | `src/config/__tests__/tier-resolution.test.ts` |

**unit: session-source-inventory suite passes after t3**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S3-INVENTORY: production boundaries have explicit reviewed classifications and unchanged baseline | `src/daemon/db/__tests__/session-source-inventory.test.ts` |
| pass | CM-S3-INVENTORY: renamed and destructured provider resolver factory serializer and filesystem APIs are discovered | `src/daemon/db/__tests__/session-source-inventory.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/config/__tests__/tier-resolution.test.ts` | 0 | 3 | 0.8 s |  |
| `src/daemon/db/__tests__/session-source-inventory.test.ts` | 0 | 2 | 12.3 s |  |

## t4

Run at 2026-10-25T20:25:26.517Z on commit `0fc29d4df`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: role-router-global-tiers.test.ts: a repo's tasks choice picks the tier while runner, model and effort come from the global tier; byRepo coreFloor still clamps**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | role-router-global-tiers.test.ts: a repo's tasks choice picks the tier while runner, model and effort come from the global tier; byRepo coreFloor still clamps | `src/analyze/context/__tests__/role-router-global-tiers.test.ts` |

**unit: role-router-global-tiers.test.ts: the RoleResolution keeps role, tier, runner, model, effort, clampedByFloor and adds fallback; workflow-rpc and workflow-review-rpc labels unchanged for a CLI and an Ollama tier**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | role-router-global-tiers.test.ts: the RoleResolution keeps role, tier, runner, model, effort, clampedByFloor and adds fallback; workflow-rpc and workflow-review-rpc labels unchanged for a CLI and an Ollama tier | `src/analyze/context/__tests__/role-router-global-tiers.test.ts` |

**unit: role-router-global-tiers.test.ts: no source references readRepoOverride or resolveRepoShaper***

| Result | Test | File |
| :--- | :--- | :--- |
| pass | role-router-global-tiers.test.ts: no source references readRepoOverride or resolveRepoShaper* | `src/analyze/context/__tests__/role-router-global-tiers.test.ts` |

**unit: session-source-inventory suite passes after t4**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S3-INVENTORY: production boundaries have explicit reviewed classifications and unchanged baseline | `src/daemon/db/__tests__/session-source-inventory.test.ts` |
| pass | CM-S3-INVENTORY: renamed and destructured provider resolver factory serializer and filesystem APIs are discovered | `src/daemon/db/__tests__/session-source-inventory.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/context/__tests__/role-router-global-tiers.test.ts` | 0 | 3 | 0.9 s |  |
| `src/daemon/db/__tests__/session-source-inventory.test.ts` | 0 | 2 | 12.1 s |  |

## t5

Run at 2026-10-25T20:41:44.108Z on commit `b0b37ecbe`. Tests check: **passed**. 8 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: provider-from-registry.test.ts: CLI kind, effort acceptance (CliProvider gets no unaccepted effort), Codex chars budget, no haiku budget and Ollama num_ctx come from the registry; summariser uses the family's summariserModel**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | provider-from-registry.test.ts: CLI kind, effort acceptance (CliProvider gets no unaccepted effort), Codex chars budget, no haiku budget and Ollama num_ctx come from the registry; summariser uses the family's summariserModel | `src/analyze/context/__tests__/provider-from-registry.test.ts` |
| pass | buildSummariserProvider: a CLI summariser pins the cheap tier's model, and replaces a model of another family with the family's summariser model | `src/analyze/context/__tests__/summariser-provider.test.ts` |

**unit: provider-from-registry.test.ts: tool loop follows ollama cheap tier, then listed coreModel, then toolLoopModel with a warning; num_ctx is the chosen model's limit**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | provider-from-registry.test.ts: tool loop follows ollama cheap tier, then listed coreModel, then toolLoopModel with a warning; num_ctx is the chosen model's limit | `src/analyze/context/__tests__/provider-from-registry.test.ts` |

**unit: provider-from-registry.test.ts: resolveValidateProvider reuses the router's CLI provider and builds the default family's tier default for an ollama resolution**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | provider-from-registry.test.ts: resolveValidateProvider reuses the router's CLI provider and builds the default family's tier default for an ollama resolution | `src/analyze/context/__tests__/provider-from-registry.test.ts` |

**unit: input-budget.test.ts: a CliProvider reports the budget it is given and a registry-built Codex provider reports the file's chars limit**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a CliProvider reports the budget it is given (absent when not given); Ollama reports undefined | `src/agent/providers/__tests__/input-budget.test.ts` |
| pass | a provider built through the registry for a Codex model reports the definitions file's chars limit; haiku (a token limit) none | `src/agent/providers/__tests__/input-budget.test.ts` |

**unit: session-source-inventory suite passes after t5**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S3-INVENTORY: production boundaries have explicit reviewed classifications and unchanged baseline | `src/daemon/db/__tests__/session-source-inventory.test.ts` |
| pass | CM-S3-INVENTORY: renamed and destructured provider resolver factory serializer and filesystem APIs are discovered | `src/daemon/db/__tests__/session-source-inventory.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/agent/providers/__tests__/input-budget.test.ts` | 0 | 2 | 0.7 s |  |
| `src/analyze/context/__tests__/provider-from-registry.test.ts` | 0 | 3 | 0.8 s |  |
| `src/analyze/context/__tests__/summariser-provider.test.ts` | 0 | 4 | 0.5 s |  |
| `src/daemon/db/__tests__/session-source-inventory.test.ts` | 0 | 2 | 12.9 s |  |
