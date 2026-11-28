<!-- insrc:artifact TESTS-a5d5b2bb021655d0-s1 -->

# Tests: a5d5b2bb021655d0 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 24 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

## t1

Run at 2026-11-27T14:38:00.812Z on commit `ae1b93f79`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: qualification-profile-selects-frozen-normal-and-slow-vm-role-budgets**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | qualification-profile-selects-frozen-normal-and-slow-vm-role-budgets | `src/installer/__tests__/qualification-time-budgets.test.ts` |

**unit: invalid-profile-fails-before-any-filesystem-or-worker-admission**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | invalid-profile-fails-before-any-filesystem-or-worker-admission | `src/installer/__tests__/qualification-time-budgets.test.ts` |

**unit: profile-snapshot-cannot-change-after-module-import**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | profile-snapshot-cannot-change-after-module-import | `src/installer/__tests__/qualification-time-budgets.test.ts` |

**integration: copied-policy-asset-has-source-bytes-and-loads-from-installed-control**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | copied-policy-asset-has-source-bytes-and-loads-from-installed-control | `src/installer/__tests__/qualification-time-budgets.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/installer/__tests__/qualification-time-budgets.test.ts` | 0 | 4 | 1.2 s |  |

## t2

Run at 2026-11-27T15:08:07.341Z on commit `a7f3eab9c`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: explicit-short-scope-overrides-remain-exact-under-slow-vm**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | explicit-short-scope-overrides-remain-exact-under-slow-vm | `src/installer/__tests__/qualification-scopes.test.ts` |

**integration: omitted-child-profile-is-canonicalized-and-conflicting-profile-rejected**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | omitted-child-profile-is-canonicalized-and-conflicting-profile-rejected | `src/installer/__tests__/qualification-scopes.test.ts` |

**integration: qualification-profile-reaches-manager-worker-private-npm-and-runtime-helpers**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | qualification-profile-reaches-manager-worker-private-npm-and-runtime-helpers | `src/installer/__tests__/dev-toolchain.test.ts` |
| pass | slow-profile-reaches-real-manager-worker-and-private-npm | `src/installer/__tests__/qualification-manager.test.ts` |

**integration: normal-coordinator-and-git-role-caps-remain-exact**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | normal-coordinator-and-git-role-caps-remain-exact | `src/installer/__tests__/qualification-scopes.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/installer/__tests__/dev-toolchain.test.ts` | 0 | 5 | 213 s |  |
| `src/installer/__tests__/qualification-manager.test.ts` | 0 | 1 | 38.8 s |  |
| `src/installer/__tests__/qualification-scopes.test.ts` | 0 | 3 | 4.8 s |  |

## t3

Run at 2026-11-27T15:27:44.497Z on commit `09c276593`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: slow-vm-runtime-download-verification-and-decoder-drain-have-no-hidden-normal-cap**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | slow-vm-runtime-download-verification-and-decoder-drain-have-no-hidden-normal-cap | `src/installer/__tests__/qualification-runtime.test.ts` |

**integration: profile-never-waives-positive-resource-or-process-closure**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | profile-never-waives-positive-resource-or-process-closure | `src/installer/__tests__/qualification-runtime.test.ts` |

**integration: normal-runtime-identity-inventory-worker-wire-and-controller-schema-remain-unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | normal-runtime-identity-inventory-worker-wire-and-controller-schema-remain-unchanged | `src/installer/__tests__/qualification-runtime.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/installer/__tests__/qualification-runtime.test.ts` | 0 | 3 | 5.3 s |  |

## t4

Run at 2026-11-27T16:20:58.772Z on commit `3fdfaa0d7`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: child-budget-is-parent-remaining-minus-reserve-after-runtime-setup**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | child-budget-is-parent-remaining-minus-reserve-after-runtime-setup | `src/installer/__tests__/qualification-worker.test.ts` |

**integration: parent-cooperative-reserve-covers-worker-drain-and-final-evidence**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | parent-cooperative-reserve-covers-worker-drain-and-final-evidence | `src/installer/__tests__/qualification-worker.test.ts` |

**integration: qualification-profile-reaches-manager-worker-private-npm-and-runtime-helpers**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | slow-profile-reaches-real-manager-worker-and-private-npm | `src/installer/__tests__/qualification-manager.test.ts` |

**integration: profile-never-waives-positive-resource-or-process-closure**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | closed-worker-without-final-proof-cannot-produce-prepared-result | `src/installer/__tests__/qualification-worker.test.ts` |
| pass | profile-never-waives-positive-resource-or-process-closure | `src/installer/__tests__/qualification-runtime.test.ts` |

**integration: normal-runtime-identity-inventory-worker-wire-and-controller-schema-remain-unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | normal-runtime-identity-inventory-worker-wire-and-controller-schema-remain-unchanged | `src/installer/__tests__/qualification-runtime.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/installer/__tests__/qualification-manager.test.ts` | 0 | 1 | 40.3 s |  |
| `src/installer/__tests__/qualification-runtime.test.ts` | 0 | 3 | 5.3 s |  |
| `src/installer/__tests__/qualification-worker.test.ts` | 0 | 3 | 48.9 s |  |

## t5

Run at 2026-11-27T16:50:20.312Z on commit `39bdade3d`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: outer-deadline-cancels-independent-in-process-preparation**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | outer-deadline-cancels-independent-in-process-preparation | `scripts/__tests__/qualification-containment.test.ts` |
| pass | qualification-invalid-profile-refuses-before-root-or-lease-allocation | `scripts/__tests__/qualification-containment.test.ts` |
| pass | qualification-evidence-records-selected-caps-before-resource-copy-without-success-claim | `scripts/__tests__/qualification-containment.test.ts` |

**unit: ci-and-operator-containment-admit-only-sufficient-native-work-and-cleanup-headroom**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ci-and-operator-containment-admit-only-sufficient-native-work-and-cleanup-headroom | `scripts/__tests__/qualification-containment.test.ts` |

**integration: copied-policy-asset-has-source-bytes-and-loads-from-installed-control**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | copied-policy-asset-has-source-bytes-and-loads-from-installed-control | `src/installer/__tests__/qualification-installed.test.ts` |

**integration: qualification-profile-reaches-manager-worker-private-npm-and-runtime-helpers**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | slow-profile-reaches-real-manager-worker-and-private-npm | `src/installer/__tests__/qualification-manager.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `scripts/__tests__/qualification-containment.test.ts` | 0 | 4 | 5.8 s |  |
| `src/installer/__tests__/qualification-installed.test.ts` | 0 | 1 | 72.8 s |  |
| `src/installer/__tests__/qualification-manager.test.ts` | 0 | 1 | 39.3 s |  |

## t6

Run at 2026-11-27T19:54:57.983Z on commit `9c805a8bd`. Tests check: **passed**. 0 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

the gate ran no test: every named test of this Task was reported by the builder

**live: fresh-UTM-macOS-slow-vm-profile-completes-native-foundation-and-confirmed-closure**

Reported by the builder, not run by the gate: **pass**. Evidence: Commit 9c805a8bd; docs/standalone/propagate-longer-time-budgets-through-installer-E20261127a5d5b2bb/S001/evidence/t6.md, t6-audit.json, t6-native-result.json, t6-supervisor.json, t6-actual-budgets.json and t6-retired-vm-closure.json. Actual run eac466ab-18ee-431e-a09e-252206144f1e, worker 46bae4d3-1541-4374-bc8a-577f9912b817, finished 2026-11-27T19:33:53.812Z; source/worker input fingerprint 8a7b77214a67430f3793bee26fe8982eefa8451757d92c6a43ef51ddff530668. Exact source2fca011a6. All owned-group cleanup confirmed and leases released.
