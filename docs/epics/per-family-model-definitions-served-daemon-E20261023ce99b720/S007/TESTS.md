<!-- insrc:artifact TESTS-ce99b72065d03b1b-s7 -->

# Tests: ce99b72065d03b1b s7

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 11 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

## t1

Run at 2026-10-27T05:37:26.069Z on commit `6d1d934c6`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/daemon/SettingsWriteGatewayTest.kt: Saved(restartRequired) and Rejected(reason, detail) from config.write**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | SettingsWriteGatewayTest: Saved(restartRequired) and Rejected(reason, detail) from config-write | `jetbrains-plugin/__tests__/s7-gradle.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `jetbrains-plugin/__tests__/s7-gradle.test.ts` | 0 | 1 | 9.8 s |  |

## t2

Run at 2026-10-27T05:39:45.743Z on commit `ed38d4c1f`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/daemon/UnixSocketDaemonRpcParseTest.kt: parse with resultErrorIsFailure=false keeps a not-run check's error, checkId and efforts; default parse unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | UnixSocketDaemonRpcParseTest: parse with resultErrorIsFailure=false keeps a not-run check's error, checkId and efforts, default parse unchanged | `jetbrains-plugin/__tests__/s7-gradle.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `jetbrains-plugin/__tests__/s7-gradle.test.ts` | 0 | 2 | 15.6 s |  |

## t3

Run at 2026-10-27T05:43:00.292Z on commit `323802919`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/daemon/ModelDefinitionsGatewayTest.kt: modelDefinitions/checkModel/decideModel parsing and failure classification over a fake DaemonRpc**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ModelDefinitionsGatewayTest: modelDefinitions, checkModel and decideModel parse their answers and classify failures | `jetbrains-plugin/__tests__/s7-gradle.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `jetbrains-plugin/__tests__/s7-gradle.test.ts` | 0 | 3 | 22.7 s |  |

## t4

Run at 2026-10-27T05:52:19.558Z on commit `bc7819da2`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersModelTest.kt: choices exactly from a fake definitions answer; current-tier parity with the daemon's resolution; unaccepted stored effort shown as '' and not dirty**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ModelTiersModelTest: choices exactly from a fake definitions answer, current-tier parity with the daemon's resolution, an unaccepted stored effort shown as none and not dirty | `jetbrains-plugin/__tests__/s7-gradle.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `jetbrains-plugin/__tests__/s7-gradle.test.ts` | 0 | 4 | 24.3 s |  |

## t5

Run at 2026-10-27T05:54:47.781Z on commit `5abb2893a`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersModelTest.kt: runner switch defaults incl. a local family without tierDefaults; effort cleared on model change; whole-tier writes; not-listed model refused**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ModelTiersModelTest: runner switch defaults incl a local family without tierDefaults, effort cleared on model change, whole-tier writes, not-listed model refused | `jetbrains-plugin/__tests__/s7-gradle.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `jetbrains-plugin/__tests__/s7-gradle.test.ts` | 0 | 5 | 26.3 s |  |

## t6

Run at 2026-10-27T06:00:44.538Z on commit `2f0f1ea04`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersWiringSourceScanTest.kt: no PROVIDERS, no listModels use, no family or model literal in settings sources; definitions read on open and Refresh**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ModelTiersWiringSourceScanTest: no PROVIDERS, no listModels use, no family or model literal in settings sources, definitions read on open and Refresh | `jetbrains-plugin/__tests__/s7-gradle.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `jetbrains-plugin/__tests__/s7-gradle.test.ts` | 0 | 6 | 31.9 s |  |

## t7

Run at 2026-10-27T06:04:28.939Z on commit `139506814`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/ModelCheckFlowTest.kt: approve disabled when not run; reject with the check's id; only ticked non-rejected efforts sent; unknown-check offers check again; no tier write; restart confirmed then definitions re-read**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ModelCheckFlowTest: approve disabled when not run, reject with the check's id, only ticked non-rejected efforts sent, unknown-check offers check again, no tier write, restart confirmed then definitions re-read | `jetbrains-plugin/__tests__/s7-gradle.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `jetbrains-plugin/__tests__/s7-gradle.test.ts` | 0 | 7 | 41 s |  |

## t8

Run at 2026-10-27T06:08:05.862Z on commit `6c9078bf8`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/InsrcSettingsConfigurableRestartTest.kt: one prompt when any write needed a restart, also with a failure; none otherwise**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | InsrcSettingsConfigurableRestartTest: one prompt when any write needed a restart, also with a failure, none otherwise | `jetbrains-plugin/__tests__/s7-gradle.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `jetbrains-plugin/__tests__/s7-gradle.test.ts` | 0 | 8 | 49.3 s |  |

## t9

Run at 2026-10-27T06:12:57.710Z on commit `655cb085b`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/PerRepoOverridesModelTest.kt: only coreFloor and tasks state and writes**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | PerRepoOverridesModelTest: only coreFloor and tasks state and writes | `jetbrains-plugin/__tests__/s7-gradle.test.ts` |

**unit: jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/InsrcSettingsConfigurableTest.kt: per-repo editor has no tier runner/model field**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | InsrcSettingsConfigurableTest: per-repo editor has no tier runner or model field | `jetbrains-plugin/__tests__/s7-gradle.test.ts` |

**unit: jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/daemon/PerRepoOverridesGatewayTest.kt: a tiers leaf is ignored**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | PerRepoOverridesGatewayTest: a tiers leaf is ignored | `jetbrains-plugin/__tests__/s7-gradle.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `jetbrains-plugin/__tests__/s7-gradle.test.ts` | 0 | 11 | 60.2 s |  |

## t10

Run at 2026-10-27T06:15:00.759Z on commit `603f4728c`. Tests check: **passed**. 0 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

the gate ran no test: every named test of this Task was reported by the builder

**smoke: runIde against the live daemon: walk the LLD UX states and record screenshots**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/S007/evidence/s7-live-check.txt, docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/S007/evidence/s7-model-tiers-live.png, docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/S007/evidence/s7-per-repo-live.png (jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/S7LiveRenderTest.kt with INSRC_LIVE_TESTS=1 against the running daemon)
