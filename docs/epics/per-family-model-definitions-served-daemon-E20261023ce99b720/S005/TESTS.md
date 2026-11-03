<!-- insrc:artifact TESTS-ce99b72065d03b1b-s5 -->

# Tests: ce99b72065d03b1b s5

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 52 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-26T13:12:41.329Z on commit `40b5dd49a`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: ipc-client.test.ts: a connection lost after the request (end/close or ECONNRESET then close) rejects with DaemonDisconnectedError; pre-connect refusal and replies unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ipc-client.test.ts: a connection lost after the request (end/close or ECONNRESET then close) rejects with DaemonDisconnectedError; pre-connect refusal and replies unchanged | `src/shared/__tests__/ipc-client.test.ts` |
| pass | rpc resolves the daemon result and writes the { label, pid } identity envelope on connect | `src/shared/__tests__/ipc-client.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/shared/__tests__/ipc-client.test.ts` | 0 | 9 | 0.4 s |  |

## t2

Run at 2026-10-26T13:20:50.614Z on commit `9129ff18a`. Tests check: **passed**. 8 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: model-catalog.test.ts: memoryMb accepted on Ollama models, refused when not a positive integer or on a CLI model**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | model-catalog.test.ts: memoryMb accepted on Ollama models, refused when not a positive integer or on a CLI model | `src/daemon/__tests__/model-catalog.test.ts` |
| pass | model-registry.test.ts: families/defaultFamily/models/find/tierDefault/summariserModel/toolLoopModel/cliKind against the minimal fixture | `src/daemon/__tests__/model-registry.test.ts` |
| pass | model-registry.test.ts: ac2 fixture after reset serves the new model, alias and 'turbo' through models(), find(), effortLevels(), resolveTier() and the models.definitions projection | `src/daemon/__tests__/model-registry.test.ts` |

**unit: model-definitions.test.ts: models.definitions carries memoryMb for an Ollama model that has it**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | model-definitions.test.ts: models.definitions carries memoryMb for an Ollama model that has it | `src/daemon/__tests__/model-definitions.test.ts` |

**unit: model-catalog-asset.test.ts: every shipped Ollama model has memoryMb and the build gate passes**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | model-catalog-asset.test.ts: every shipped Ollama model has memoryMb and the build gate passes | `src/daemon/__tests__/model-catalog-asset.test.ts` |
| pass | sync-manifest-catalog.test.ts: the committed manifest is in sync, and the script is idempotent on a stale copy | `vscode-plugin/src/config/__tests__/sync-manifest-catalog.test.ts` |
| pass | jetbrains-catalog-fixture.test.ts: the JetBrains catalog fixture equals buildConfigCatalog over its definitions | `src/config/__tests__/jetbrains-catalog-fixture.test.ts` |
| pass | CM-S3-INVENTORY: production boundaries have explicit reviewed classifications and unchanged baseline | `src/daemon/db/__tests__/session-source-inventory.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/config/__tests__/jetbrains-catalog-fixture.test.ts` | 0 | 1 | 0.4 s |  |
| `src/daemon/__tests__/model-catalog-asset.test.ts` | 0 | 3 | 0.7 s |  |
| `src/daemon/__tests__/model-catalog.test.ts` | 0 | 6 | 0.6 s |  |
| `src/daemon/__tests__/model-definitions.test.ts` | 0 | 4 | 0.5 s |  |
| `src/daemon/__tests__/model-registry.test.ts` | 0 | 7 | 0.5 s |  |
| `src/daemon/db/__tests__/session-source-inventory.test.ts` | 0 | 2 | 10.7 s |  |
| `vscode-plugin/src/config/__tests__/sync-manifest-catalog.test.ts` | 0 | 1 | 0.8 s |  |

## t3

Run at 2026-10-26T13:48:10.175Z on commit `0c25d27c8`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: config-write-models.test.ts: writes adding or changing models.byRepo.<repo>.tiers (directly or through a parent object) are refused with 'per-repo-tier'; tasks / coreFloor and unrelated writes succeed**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | config-write-models.test.ts: writes adding or changing models.byRepo.<repo>.tiers (directly or through a parent object) are refused with 'per-repo-tier'; tasks / coreFloor and unrelated writes succeed | `src/daemon/__tests__/config-write-models.test.ts` |
| pass | CM-S3-INVENTORY: production boundaries have explicit reviewed classifications and unchanged baseline | `src/daemon/db/__tests__/session-source-inventory.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/config-write-models.test.ts` | 0 | 3 | 0.9 s |  |
| `src/daemon/db/__tests__/session-source-inventory.test.ts` | 0 | 2 | 10.4 s |  |

## t4

Run at 2026-10-26T13:29:36.022Z on commit `da8dc8db0`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: services.test.ts: Services.models calls the matching rpc methods with their params**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | services.test.ts: Services.models calls the matching rpc methods with their params | `src/cli/__tests__/services.test.ts` |
| pass | Daemon pane shows running status + uptime | `src/cli/__tests__/tui.test.ts` |
| pass | number keys switch panes (Daemon → Repos) | `src/cli/__tests__/tui.test.ts` |
| pass | Repos add flow drives repo.add with the entered path (+ per-file steering) | `src/cli/__tests__/tui.test.ts` |
| pass | the TUI tests run with fakeServices carrying the team entry | `src/cli/__tests__/tui.test.ts` |
| pass | help lists the command reference | `src/cli/__tests__/command.test.ts` |
| pass | workflow review renders verdict, counts, auto-fixes, and pending findings | `src/cli/__tests__/command.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/cli/__tests__/command.test.ts` | 0 | 28 | 0.4 s |  |
| `src/cli/__tests__/services.test.ts` | 0 | 8 | 0.6 s |  |
| `src/cli/__tests__/tui.test.ts` | 0 | 23 | 2.4 s |  |

## t6

Run at 2026-10-26T13:31:42.444Z on commit `e40c8c9f6`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: model-tiers.test.ts: computeEffectiveTiers over a fake definitions answer, with the daemon's effort precedence**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | model-tiers.test.ts: computeEffectiveTiers over a fake definitions answer, with the daemon's effort precedence | `src/cli/__tests__/model-tiers.test.ts` |
| pass | a critical role overridden below coreFloor is clamped UP to the floor (clamped=true) | `src/cli/__tests__/model-tiers.test.ts` |
| pass | a roleTiers key that is not a current taxonomy role is surfaced as a stale override | `src/cli/__tests__/model-tiers.test.ts` |

**unit: model-tiers.test.ts: tier edit helpers (family without tierDefaults, effort drop, alias, unserved ids)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | model-tiers.test.ts: tier edit helpers (family without tierDefaults, effort drop, alias, unserved ids) | `src/cli/__tests__/model-tiers.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/cli/__tests__/model-tiers.test.ts` | 0 | 17 | 0.5 s |  |

## t7

Run at 2026-10-26T13:36:35.334Z on commit `e40c8c9f6`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: tui-models.test.ts: Model Tiers pane cycles the fake answer's families, models and efforts and writes whole tiers; unserved model has no effort edit; refusals and restart shown**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | tui-models.test.ts: Model Tiers pane cycles the fake answer's families, models and efforts and writes whole tiers; unserved model has no effort edit; refusals and restart shown | `src/cli/__tests__/tui-models.test.ts` |
| pass | Model Tiers pane (5) renders effective tiers, coreFloor, and roles from config | `src/cli/__tests__/tui.test.ts` |
| pass | TUI ModelTiersPane shows the model definitions' tier defaults for an unset config | `src/cli/__tests__/tui.test.ts` |

**integration: tui-models.test.ts: daemon down shows the not-running message in the Model Tiers pane and Setup**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | tui-models.test.ts: daemon down shows the not-running message in the Model Tiers pane and Setup | `src/cli/__tests__/tui-models.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/cli/__tests__/tui-models.test.ts` | 0 | 5 | 4.2 s |  |
| `src/cli/__tests__/tui.test.ts` | 0 | 23 | 2.4 s |  |

## t8

Run at 2026-10-26T13:46:44.192Z on commit `0c25d27c8`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: tui-models.test.ts: unknown model check, approve then restart then save, reject, runs:false**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | tui-models.test.ts: unknown model check, approve then restart then save, reject, runs:false | `src/cli/__tests__/tui-models.test.ts` |

**integration: tui-models.test.ts: interrupted check and outcome-unknown decision**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | tui-models.test.ts: interrupted check and outcome-unknown decision | `src/cli/__tests__/tui-models.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/cli/__tests__/tui-models.test.ts` | 0 | 5 | 4.2 s |  |

## t5

Run at 2026-10-26T13:51:57.061Z on commit `0c25d27c8`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: model-recommender.test.ts: recommendModels uses the passed local model, installed flag and memoryMb, falling back to the generic estimate**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | model-recommender.test.ts: recommendModels uses the passed local model, installed flag and memoryMb, falling back to the generic estimate | `src/shared/__tests__/model-recommender.test.ts` |

**unit: command.test.ts: setup show|apply|pull recommend the definitions' tool-loop model and stop with the not-running line when the daemon is down**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | command.test.ts: setup show\|apply\|pull recommend the definitions' tool-loop model and stop with the not-running line when the daemon is down | `src/cli/__tests__/command.test.ts` |
| pass | tui-models.test.ts: daemon down shows the not-running message in the Model Tiers pane and Setup | `src/cli/__tests__/tui-models.test.ts` |

**integration: system-recommend.test.ts: the daemon's system.recommend recommends a fixture file's tool-loop model**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | system-recommend.test.ts: the daemon's system.recommend recommends a fixture file's tool-loop model | `src/daemon/__tests__/system-recommend.test.ts` |
| pass | CM-S3-INVENTORY: production boundaries have explicit reviewed classifications and unchanged baseline | `src/daemon/db/__tests__/session-source-inventory.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/cli/__tests__/command.test.ts` | 0 | 28 | 0.4 s |  |
| `src/cli/__tests__/tui-models.test.ts` | 0 | 5 | 4.3 s |  |
| `src/daemon/__tests__/system-recommend.test.ts` | 0 | 1 | 1 s |  |
| `src/daemon/db/__tests__/session-source-inventory.test.ts` | 0 | 2 | 10.8 s |  |
| `src/shared/__tests__/model-recommender.test.ts` | 0 | 1 | 0.6 s |  |

## t9

Run at 2026-10-26T13:53:23.031Z on commit `0c25d27c8`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: tui-models.test.ts: repo models view edits only tasks and coreFloor**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | tui-models.test.ts: repo models view edits only tasks and coreFloor | `src/cli/__tests__/tui-models.test.ts` |
| pass | Repos add flow drives repo.add with the entered path (+ per-file steering) | `src/cli/__tests__/tui.test.ts` |
| pass | Repos pane: the tracker modal dismisses on any key back to the list | `src/cli/__tests__/tui.test.ts` |

**unit: command.test.ts: config set / unset refuse model keys and report refusals and restartRequired**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | command.test.ts: config set / unset refuse model keys and report refusals and restartRequired | `src/cli/__tests__/command.test.ts` |
| pass | CM-S3-INVENTORY: production boundaries have explicit reviewed classifications and unchanged baseline | `src/daemon/db/__tests__/session-source-inventory.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/cli/__tests__/command.test.ts` | 0 | 28 | 0.4 s |  |
| `src/cli/__tests__/tui-models.test.ts` | 0 | 5 | 4.2 s |  |
| `src/cli/__tests__/tui.test.ts` | 0 | 23 | 2.4 s |  |
| `src/daemon/db/__tests__/session-source-inventory.test.ts` | 0 | 2 | 9.3 s |  |

## t10

Run at 2026-10-26T13:55:01.669Z on commit `0c25d27c8`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: review-resolve-role.test.ts: reviewArtifact builds its provider from a fake models.resolveRole answer and refuses without one**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | review-resolve-role.test.ts: reviewArtifact builds its provider from a fake models.resolveRole answer and refuses without one | `src/cli/services/__tests__/review-resolve-role.test.ts` |
| pass | T15 the TUI review service surfaces the refusal, naming a controller review or an override | `src/workflow/review/__tests__/same-party-refusal.test.ts` |
| pass | CM-S3-INVENTORY: production boundaries have explicit reviewed classifications and unchanged baseline | `src/daemon/db/__tests__/session-source-inventory.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/cli/services/__tests__/review-resolve-role.test.ts` | 0 | 1 | 0.6 s |  |
| `src/daemon/db/__tests__/session-source-inventory.test.ts` | 0 | 2 | 10.3 s |  |
| `src/workflow/review/__tests__/same-party-refusal.test.ts` | 0 | 9 | 0.9 s |  |

## t11

Run at 2026-10-26T14:03:28.205Z on commit `d98774911`. Tests check: **passed**. 10 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: no-default-tiers.test.ts: no file under src imports or exports DEFAULT_TIERS / TIER_EFFORTS**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | no-default-tiers.test.ts: no file under src imports or exports DEFAULT_TIERS / TIER_EFFORTS | `src/__tests__/no-default-tiers.test.ts` |
| pass | src/config/__tests__/tier-defaults.test.ts: the config catalog's cheap and mid tier defaults equal DEFAULT_TIERS | `src/config/__tests__/tier-defaults.test.ts` |
| pass | config-catalog-defs.test.ts: buildConfigCatalog(fixture) takes runner/model/effort defaults, effort enums and coreModel default from the fixture; CONFIG_CATALOG equals buildConfigCatalog(shipped); no ollamaNumCtx row; loadBuiltCatalog accepts the built catalog | `src/config/__tests__/config-catalog-defs.test.ts` |
| pass | model-catalog-asset.test.ts: shipped asset validates, ships via copy-assets, lists today's models and aliases; its tier defaults equal DEFAULT_TIERS; the installer reads its defaults from the file; the summariser comes from summariserModel | `src/daemon/__tests__/model-catalog-asset.test.ts` |

**unit: model-literal-scan.test.ts: the scan covers src/cli and the recommender**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | model-literal-scan.test.ts: the scan covers src/cli and the recommender | `src/daemon/__tests__/model-literal-scan.test.ts` |
| pass | model-literal-scan.test.ts: the scan passes on the tree and fails on an injected literal; exclusions name their owning Story | `src/daemon/__tests__/model-literal-scan.test.ts` |

**smoke: tsc over src and the changed TUI tests; tui.test.ts passes**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s5-tests-typecheck.test.ts: tsc over the TUI and model tests s5 changed reports no errors | `src/cli/__tests__/s5-tests-typecheck.test.ts` |
| pass | Model Tiers pane (5) renders effective tiers, coreFloor, and roles from config | `src/cli/__tests__/tui.test.ts` |
| pass | TUI ModelTiersPane shows the model definitions' tier defaults for an unset config | `src/cli/__tests__/tui.test.ts` |
| pass | CM-S3-INVENTORY: production boundaries have explicit reviewed classifications and unchanged baseline | `src/daemon/db/__tests__/session-source-inventory.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/__tests__/no-default-tiers.test.ts` | 0 | 1 | 0.5 s |  |
| `src/cli/__tests__/s5-tests-typecheck.test.ts` | 0 | 1 | 3.9 s |  |
| `src/cli/__tests__/tui.test.ts` | 0 | 23 | 2.4 s |  |
| `src/config/__tests__/config-catalog-defs.test.ts` | 0 | 2 | 1 s |  |
| `src/config/__tests__/tier-defaults.test.ts` | 0 | 5 | 0.5 s |  |
| `src/daemon/__tests__/model-catalog-asset.test.ts` | 0 | 3 | 0.7 s |  |
| `src/daemon/__tests__/model-literal-scan.test.ts` | 0 | 2 | 1.6 s |  |
| `src/daemon/db/__tests__/session-source-inventory.test.ts` | 0 | 2 | 9.7 s |  |
