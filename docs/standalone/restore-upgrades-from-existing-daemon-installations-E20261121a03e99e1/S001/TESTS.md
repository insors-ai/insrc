<!-- insrc:artifact TESTS-a03e99e17a364550-s1 -->

# Tests: a03e99e17a364550 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 25 pass, 0 fail, 0 skipped, 0 not found; 3 reported by the builder and not run by the gate.

## t1

Run at 2026-11-21T17:48:45.684Z on commit `80ace719b`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Portable source qualification rejects wrong channel/profile/floor before npm**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Portable source qualification rejects wrong channel/profile/floor before npm | `scripts/__tests__/source-upgrade-qualification-native.test.ts` |
| pass | Linux source promotion requires target-specific historical upgrade evidence | `scripts/__tests__/source-upgrade-qualification-native.test.ts` |

**integration: Independent staging uses absolute owned npm and preserves Mac signed behavior**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Independent staging uses absolute owned npm and preserves Mac signed behavior | `scripts/__tests__/source-upgrade-qualification-native.test.ts` |
| pass | Release provenance, changed bytes and absent legacy declaration | `src/daemon/__tests__/managed-release-staging.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `scripts/__tests__/source-upgrade-qualification-native.test.ts` | 0 | 3 | 37.8 s |  |
| `src/daemon/__tests__/managed-release-staging.test.ts` | 0 | 7 | 18.3 s |  |

## t2

Run at 2026-11-21T19:10:57.925Z on commit `50a172185`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: Linux selector/journal reject malformed, linked and nonprivate files**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Linux selector/journal reject malformed, linked and nonprivate files | `src/shared/__tests__/source-installation.test.ts` |
| pass | Portable source qualification rejects wrong channel/profile/floor before npm | `scripts/__tests__/source-upgrade-qualification-native.test.ts` |

**integration: Atomic publication with unknown fsync/rename outcome reconciles safely**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Atomic publication with unknown fsync/rename outcome reconciles safely | `src/shared/__tests__/source-installation.test.ts` |
| pass | Linux source journal serializes competing writers | `src/shared/__tests__/source-installation.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `scripts/__tests__/source-upgrade-qualification-native.test.ts` | 0 | 3 | 36.5 s |  |
| `src/shared/__tests__/source-installation.test.ts` | 0 | 3 | 52.4 s |  |

## t3

Run at 2026-11-21T19:43:49.953Z on commit `6f078b30d`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Source-ahead stale output and partial npm preserve incumbent and require qualified recovery**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Source-ahead stale output and partial npm preserve incumbent and require qualified recovery | `scripts/__tests__/source-predecessor-native.test.ts` |

**integration: Dirty lock/source preserved; independently staged rollback baseline admitted only by actual compatibility**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Dirty lock/source preserved; independently staged rollback baseline admitted only by actual compatibility | `scripts/__tests__/source-predecessor-native.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `scripts/__tests__/source-predecessor-native.test.ts` | 0 | 2 | 22.9 s |  |

## t4

Run at 2026-11-21T20:39:00.530Z on commit `f906e433f`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Linux original-process closure precedes selection and candidate start**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Linux original-process closure precedes selection and candidate start | `src/daemon/__tests__/source-update-transaction.test.ts` |

**integration: Interrupted cutover and failed readiness recover exact prior selection and running state**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Interrupted cutover and failed readiness recover exact prior selection and running state | `src/daemon/__tests__/source-update-transaction.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/source-update-transaction.test.ts` | 0 | 2 | 208 s |  |

## t5

Run at 2026-11-22T05:02:13.772Z on commit `3b4af8ead`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Current packaged installer upgrades existing legacy/bound target without old npm**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Current packaged installer upgrades existing legacy/bound target without old npm | `scripts/__tests__/source-entrypoints-native.test.ts` |
| pass | Current macOS installer authenticates managed source before candidate npm and bypasses old updater | `src/daemon/__tests__/managed-release-bootstrap.test.ts` |

**integration: Shell selected-root routing and update/restart semantics under hostile PATH**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Shell selected-root routing and update/restart semantics under hostile PATH | `scripts/__tests__/source-entrypoints-native.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `scripts/__tests__/source-entrypoints-native.test.ts` | 0 | 2 | 519 s |  |
| `src/daemon/__tests__/managed-release-bootstrap.test.ts` | 0 | 4 | 12.5 s |  |

## t6

Run at 2026-11-22T08:15:57.731Z on commit `67a432d7f`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: TUI and detached daemon update survive handoff and expose final outcome**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | TUI and detached daemon update survive handoff and expose final outcome | `scripts/__tests__/source-consumers-native.test.ts` |
| pass | Source update receipts retain update results and expose recovery-required under exclusion | `src/daemon/__tests__/source-update-outcomes.test.ts` |

**integration: MCP/start resolve source selection and reject malformed state**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | MCP/start resolve source selection and reject malformed state | `scripts/__tests__/source-consumers-native.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `scripts/__tests__/source-consumers-native.test.ts` | 0 | 2 | 347.2 s |  |
| `src/daemon/__tests__/source-update-outcomes.test.ts` | 0 | 1 | 29 s |  |

## t7

Run at 2026-11-22T09:52:23.988Z on commit `dcb92e3ff`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: VS Code controller reaches packaged current bootstrap and selected runtime**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | VS Code controller reaches packaged current bootstrap and selected runtime | `scripts/__tests__/ide-source-entrypoints-native.test.ts` |

**integration: JetBrains provisioner inherits owned native environment and packaged verifier**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | JetBrains provisioner inherits owned native environment and packaged verifier | `jetbrains-plugin/__tests__/source-bootstrap-gradle.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `jetbrains-plugin/__tests__/source-bootstrap-gradle.test.ts` | 0 | 1 | 14.1 s |  |
| `scripts/__tests__/ide-source-entrypoints-native.test.ts` | 0 | 1 | 525.3 s |  |

## t8

Run at 2026-11-22T10:58:52.304Z on commit `e75223d04`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

**integration: Every transaction phase crash/timeout and concurrent mutation preserves single daemon ownership**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Every transaction phase crash/timeout and concurrent mutation preserves single daemon ownership | `src/daemon/__tests__/source-interruption.test.ts` |

**integration: Corrupt source/runtime and wrong compatibility denied; package integration gate enforced**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Portable source qualification rejects wrong channel/profile/floor before npm | `scripts/__tests__/source-upgrade-qualification-native.test.ts` |
| pass | rejects cache corruption even when its cached inventory is rewritten | `scripts/__tests__/node-runtime-store.test.ts` |
| pass | Promotion requires passing source-built evidence for the exact signed head | `src/daemon/__tests__/source-release-promotion.test.ts` |
| pass | Published installer and both IDEs embed the same trusted verifier | `src/daemon/__tests__/source-release-promotion.test.ts` |

**smoke: Canonical coordinator cleanup confirms all owned test actors closed**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/plans/node-runtime-evidence/source-fault-gates.md#coordinator-closure — completed canonical runs 704dbbba-0e3e-42f9-b132-88fc87f29d8e, e21002de-60f9-4b41-bbf5-cab620972420 and bd6c6446-5956-4211-9788-c66bac3f0cf5 each recorded confirmedClosed:true, interrupted:false, empty cancellation/evidence errors in .insrc/tmp/test-harness/runs/<id>/cleanup.json. Both OrbStack fixtures stopped; native actor/process assertions passed. This final coordinator property is observed after each run, not run by the legacy build gate.

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `scripts/__tests__/node-runtime-store.test.ts` | 0 | 9 | 8.7 s |  |
| `scripts/__tests__/source-upgrade-qualification-native.test.ts` | 0 | 3 | 36 s |  |
| `src/daemon/__tests__/source-interruption.test.ts` | 0 | 1 | 373.9 s |  |
| `src/daemon/__tests__/source-release-promotion.test.ts` | 0 | 2 | 8.9 s |  |

## t9

Run at 2026-11-22T12:11:16.574Z on commit `ee97116b4`. Tests check: **passed**. 0 pass, 0 fail, 0 skipped, 0 not found; 2 reported by the builder and not run by the gate.

the gate ran no test: every named test of this Task was reported by the builder

**live: darwin-arm64 actual historical upgrade, subsequent update and qualified rollback/retry**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/plans/node-runtime-evidence/historical-macos-upgrade.md#canonical-live-run; canonical Node22 live run 5ec26117-36cd-4cba-bf58-1f8436543ca8: scripts/__tests__/historical-macos-upgrade-native.test.ts exact named case passed in 1339 seconds, no skips. Its cleanup.json confirmedClosed:true with no cancellation/evidence errors. Real fixture /private/tmp/insrc-historical-mac-dM4Z0T retains IPC snapshots, fault-receipts.json, mcp-route.json and qualification-summary.json (SHA256 fe388f9d59eaffc85488e417cf3e859152ba1b1a803bc78eecde8615db6e0e45); final process/open-path census zero. Surrounding legacy-cutover and managed-development proof cases passed; obsolete IDE in-place update fixture corrected and focused run dac378b8-8e0d-4aa2-b42b-89c31049632f passed both routing cases and JetBrains native bootstrap, no skips/cleanup errors. No production runtime changes after successful live run.

**live: Mac native dependency loads and owned Node/npm environment identities**

Reported by the builder, not run by the gate: **pass**. Evidence: Same canonical live run 5ec26117-36cd-4cba-bf58-1f8436543ca8, scripts/__tests__/historical-macos-upgrade-native.test.ts exact named case passed, no skips. /private/tmp/insrc-historical-mac-dM4Z0T/prior-native-modules.log proves actual tree-sitter/lmdb/fs-ext/Lance/Duck loads under owned Node22.22.1; owned-npm-version.log=10.9.4; prior-cpu-onnx.log and candidate-cpu-onnx.log prove real CPU Identity inference=42 under that executable. Actual npm ci/build logs and source commit/tree receipts retained. Before native compiler failure, full PID/start-time/executable identity was captured and verified unchanged; live MCP child identity/argv pointed at the selected release and owned Node. Fixtures do not claim embedding-model quality or production signing authority. Independent tsc --noEmit and git diff --check passed.
