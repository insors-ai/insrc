<!-- insrc:artifact TESTS-ce99b72065d03b1b-s6 -->

# Tests: ce99b72065d03b1b s6

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 26 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-26T19:38:28.714Z on commit `c6f35e07f`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: gateway.test.ts: writeKey and writeKeyPath pass through the daemon's restartRequired, reason and detail, and fall back to 'refused' for a bare { ok:false }**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | gateway.test.ts: writeKey and writeKeyPath pass through the daemon's restartRequired, reason and detail, and fall back to 'refused' for a bare { ok:false } | `vscode-plugin/src/config/__tests__/gateway.test.ts` |
| pass | applyChanges on a daemon {ok:false} reports a rejected write and does not advance the snapshot | `vscode-plugin/src/config/__tests__/sync-engine.test.ts` |
| pass | the per-role key-map + engine + gateway modules import no 'vscode' | `vscode-plugin/src/config/__tests__/per-role-engine.test.ts` |
| pass | createRepoConfigWriteHandler: {ok:false} refusal surfaces the reason via sc2 + refresh; a writeKeyPath rejection is caught, never throws | `vscode-plugin/src/panels/__tests__/repo-config.test.ts` |
| pass | model-tier-picker.test.ts: the family, model and effort steps offer exactly the fake answer's options and a pick writes the whole tier once; request failures are classified | `vscode-plugin/src/models/__tests__/model-tier-picker.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/config/__tests__/gateway.test.ts` | 0 | 1 | 0.4 s |  |
| `vscode-plugin/src/config/__tests__/per-role-engine.test.ts` | 0 | 9 | 0.4 s |  |
| `vscode-plugin/src/config/__tests__/sync-engine.test.ts` | 0 | 11 | 0.4 s |  |
| `vscode-plugin/src/models/__tests__/model-tier-picker.test.ts` | 0 | 3 | 0.4 s |  |
| `vscode-plugin/src/panels/__tests__/repo-config.test.ts` | 0 | 10 | 0.4 s |  |

## t2

Run at 2026-10-26T19:39:21.913Z on commit `c6f35e07f`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: commands.test.ts: restartDaemonAndReport resolves true only when the daemon is running again and reflects the result like the restart command**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | commands.test.ts: restartDaemonAndReport resolves true only when the daemon is running again and reflects the result like the restart command | `vscode-plugin/src/daemon/__tests__/commands.test.ts` |
| pass | registers exactly the five insrc.daemon.* commands | `vscode-plugin/src/daemon/__tests__/commands.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/daemon/__tests__/commands.test.ts` | 0 | 5 | 0.4 s |  |

## t3

Run at 2026-10-26T19:41:29.987Z on commit `c3e820454`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: key-map.test.ts: buildConfigKeyMap over a manifest fixture takes type / enum / default from the manifest, maps tier keys as plain strings, skips plugin-local keys, and key-map.ts does not import the settings catalog**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | key-map.test.ts: buildConfigKeyMap over a manifest fixture takes type / enum / default from the manifest, maps tier keys as plain strings, skips plugin-local keys, and key-map.ts does not import the settings catalog | `vscode-plugin/src/config/__tests__/key-map.test.ts` |

**unit: manifest-catalog.test.ts: package.json contributes every catalog row, the tier rows without enum and with default ''**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | declared global insrc.* keys EXACTLY cover the global CONFIG_CATALOG paths (no missing, no extra) | `vscode-plugin/src/config/__tests__/manifest-catalog.test.ts` |
| pass | each declared key's type/enum/default matches its ConfigOption, and scope is 'machine' | `vscode-plugin/src/config/__tests__/manifest-catalog.test.ts` |

**unit: sync-manifest-catalog.test.ts: the committed manifest is in sync with the generator and the generator is idempotent**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | sync-manifest-catalog.test.ts: the committed manifest is in sync, and the script is idempotent on a stale copy | `vscode-plugin/src/config/__tests__/sync-manifest-catalog.test.ts` |

**smoke: vscode-bundle-catalog.test.ts: the extension type-checks and bundles without the settings catalog**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | vscode-bundle-catalog.test.ts: the extension type-checks and bundles; its key map, loaded without backend node_modules, maps every settings-catalog row without bundling the catalog or the definitions file | `vscode-plugin/src/config/__tests__/vscode-bundle-catalog.test.ts` |
| pass | applyChanges rejects an invalid enum value without calling writeKey and reports a reason | `vscode-plugin/src/config/__tests__/sync-engine.test.ts` |
| pass | applyChanges on a valid per-role change calls writeKeyPath with the segment array exactly once, NOT writeKey | `vscode-plugin/src/config/__tests__/per-role-engine.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/config/__tests__/key-map.test.ts` | 0 | 1 | 0.4 s |  |
| `vscode-plugin/src/config/__tests__/manifest-catalog.test.ts` | 0 | 2 | 0.4 s |  |
| `vscode-plugin/src/config/__tests__/per-role-engine.test.ts` | 0 | 9 | 0.4 s |  |
| `vscode-plugin/src/config/__tests__/sync-engine.test.ts` | 0 | 11 | 0.4 s |  |
| `vscode-plugin/src/config/__tests__/sync-manifest-catalog.test.ts` | 0 | 1 | 0.8 s |  |
| `vscode-plugin/src/config/__tests__/vscode-bundle-catalog.test.ts` | 0 | 1 | 1.9 s |  |

## t4

Run at 2026-10-26T19:44:36.093Z on commit `f45e8d4e2`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: manifest-key-map-engine.test.ts: native tier edits over the real merged key map are validated against the definitions and written whole; invalid edits revert; restartRequired calls onRestartRequired once**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | manifest-key-map-engine.test.ts: native tier edits over the real merged key map are validated against the definitions and written whole; invalid edits revert; restartRequired calls onRestartRequired once | `vscode-plugin/src/config/__tests__/manifest-key-map-engine.test.ts` |

**integration: sync-engine.test.ts and per-role-engine.test.ts: existing engine behaviour unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | applyChanges on a valid change maps native key -> path and writes exactly once | `vscode-plugin/src/config/__tests__/sync-engine.test.ts` |
| pass | pull publishes the snapshot for EVERY key so an echoed re-apply of the pulled values writes nothing (MED-1: activation echo suppression) | `vscode-plugin/src/config/__tests__/sync-engine.test.ts` |
| pass | applyChanges on a valid per-role change calls writeKeyPath with the segment array exactly once, NOT writeKey | `vscode-plugin/src/config/__tests__/per-role-engine.test.ts` |
| pass | applyChanges on a daemon {ok:false} reports the reason AND reverts, without advancing the snapshot | `vscode-plugin/src/config/__tests__/truthful-sync.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/config/__tests__/manifest-key-map-engine.test.ts` | 0 | 1 | 0.4 s |  |
| `vscode-plugin/src/config/__tests__/per-role-engine.test.ts` | 0 | 9 | 0.4 s |  |
| `vscode-plugin/src/config/__tests__/sync-engine.test.ts` | 0 | 11 | 0.4 s |  |
| `vscode-plugin/src/config/__tests__/truthful-sync.test.ts` | 0 | 12 | 0.4 s |  |

## t5

Run at 2026-10-26T19:49:31.356Z on commit `2b0929a14`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: model-tier-picker.test.ts: the family, model and effort steps offer exactly the fake answer's options and a pick writes the whole tier once; request failures are classified**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | model-tier-picker.test.ts: the family, model and effort steps offer exactly the fake answer's options and a pick writes the whole tier once; request failures are classified | `vscode-plugin/src/models/__tests__/model-tier-picker.test.ts` |

**unit: model-tier-picker.test.ts: model-tier-picker.ts names no runner or model literal and imports nothing from src/config**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | model-tier-picker.test.ts: model-tier-picker.ts names no runner or model literal and imports nothing from src/config | `vscode-plugin/src/models/__tests__/model-tier-picker.test.ts` |
| pass | vscode-bundle-catalog.test.ts: the extension type-checks and bundles; its key map, loaded without backend node_modules, maps every settings-catalog row without bundling the catalog or the definitions file | `vscode-plugin/src/config/__tests__/vscode-bundle-catalog.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/config/__tests__/vscode-bundle-catalog.test.ts` | 0 | 1 | 1.9 s |  |
| `vscode-plugin/src/models/__tests__/model-tier-picker.test.ts` | 0 | 3 | 0.4 s |  |

## t6

Run at 2026-10-26T19:50:45.493Z on commit `2b0929a14`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: model-tier-picker.test.ts: unknown model — check results shown; approve writes nothing; the tier is written only after a successful restart; reject writes nothing; runs:false offers no approve**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | model-tier-picker.test.ts: unknown model — check results shown; approve writes nothing; the tier is written only after a successful restart; reject writes nothing; runs:false offers no approve | `vscode-plugin/src/models/__tests__/model-tier-picker.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/models/__tests__/model-tier-picker.test.ts` | 0 | 3 | 0.4 s |  |

## t7

Run at 2026-10-26T19:51:41.424Z on commit `2b0929a14`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: repo-config.test.ts: the form has role tier selects and a coreFloor select only; the handler writes tasks / coreFloor after consent, drops tiers writes, shows reason and detail and offers a restart**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | repo-config.test.ts: the form has role tier selects and a coreFloor select only; the handler writes tasks / coreFloor after consent, drops tiers writes, shows reason and detail and offers a restart | `vscode-plugin/src/panels/__tests__/repo-config.test.ts` |
| pass | createRepoConfigWriteHandler: declined/dismissed consent writes NEVER (k4); unregistered/malformed write dropped without consent | `vscode-plugin/src/panels/__tests__/repo-config.test.ts` |
| pass | renderRepoConfig: discrete per-repo form fields from models.byRepo[repoPath] tasks and coreFloor (NOT raw JSON); missing entry -> all-global | `vscode-plugin/src/panels/__tests__/repo-config.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/panels/__tests__/repo-config.test.ts` | 0 | 10 | 0.4 s |  |
