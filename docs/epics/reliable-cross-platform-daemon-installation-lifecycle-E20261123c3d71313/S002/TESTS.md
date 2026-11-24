<!-- insrc:artifact TESTS-c3d71313f34bce71-s2 -->

# Tests: c3d71313f34bce71 s2

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 49 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-11-24T09:49:02.763Z on commit `b36684ab1`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: dev-source-offer-binds-repo-branch-commit-target-runtime-recipe-without-payload-hash**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | dev-source-offer-binds-repo-branch-commit-target-runtime-recipe-without-payload-hash | `src/installer/__tests__/dev-metadata.test.ts` |
| pass | preparation protocol binds paths source nonce run and bounded complete results | `src/installer/__tests__/dev-metadata.test.ts` |
| pass | commit migration metadata preserves order and rejects malformed or duplicate hooks | `src/installer/__tests__/dev-metadata.test.ts` |

**unit: dev-receipt-binds-final-manifest-inventory-and-contained-checkout-without-self-hash**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | dev-receipt-binds-final-manifest-inventory-and-contained-checkout-without-self-hash | `src/installer/__tests__/dev-metadata.test.ts` |

**unit: invalid-option-like-ref-source-and-ambiguous-receipts-rejected**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | invalid-option-like-ref-source-and-ambiguous-receipts-rejected | `src/installer/__tests__/dev-metadata.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/installer/__tests__/dev-metadata.test.ts` | 0 | 5 | 0.6 s |  |

## t2

Run at 2026-11-24T10:02:29.272Z on commit `da2cc200c`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**smoke: dev-private-node-and-explicit-npm-cli-work-with-no-host-npm-wrapper**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | dev-private-node-and-explicit-npm-cli-work-with-no-host-npm-wrapper | `src/installer/__tests__/dev-toolchain.test.ts` |

**smoke: dev-build-children-ignore-host-node-npm-and-preserve-explicit-cuda-setting**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | dev-build-children-ignore-host-node-npm-and-preserve-explicit-cuda-setting | `src/installer/__tests__/dev-toolchain.test.ts` |

**integration: missing-or-mismatched-private-toolchain-headers-and-prerequisites-refuse-without-elevation**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | missing-or-mismatched-private-toolchain-headers-and-prerequisites-refuse-without-elevation | `src/installer/__tests__/dev-toolchain.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/installer/__tests__/dev-toolchain.test.ts` | 0 | 3 | 18.5 s |  |

## t3

Run at 2026-11-24T16:16:44.229Z on commit `6b91c78e8`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: cancel-or-terminal-eof-drains-owned-preparation-actors-before-return**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | cancel-or-terminal-eof-drains-owned-preparation-actors-before-return | `src/installer/__tests__/dev-worker.test.ts` |

**integration: held-unknown-or-mismatched-preparation-result-blocks-retry-and-cleanup**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | held-unknown-or-mismatched-preparation-result-blocks-retry-and-cleanup | `src/installer/__tests__/dev-worker.test.ts` |
| pass | owned-process evidence excludes unregistered detached descendants | `src/installer/__tests__/dev-worker.test.ts` |

**integration: worker-protocol-rejects-foreign-checkpoint-and-empty-prepared-result**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | worker-protocol-rejects-foreign-checkpoint-and-empty-prepared-result | `src/installer/__tests__/dev-worker.test.ts` |
| pass | worker input rejects oversized launch and foreign cancellation frames | `src/installer/__tests__/dev-worker.test.ts` |
| pass | worker framing preserves fragmented UTF-8 and rejects malformed byte frames | `src/installer/__tests__/dev-worker.test.ts` |
| pass | worker completion durably flushes proof and refuses a failed result flush | `src/installer/__tests__/dev-worker.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/installer/__tests__/dev-worker.test.ts` | 0 | 7 | 14.8 s |  |

## t4

Run at 2026-11-24T11:11:07.640Z on commit `525f0498c`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: selected-repo-branch-exact-commit-and-unrelated-branch-never-selected**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | selected-repo-branch-exact-commit-and-unrelated-branch-never-selected | `src/installer/__tests__/dev-git.test.ts` |

**integration: dirty-conflicting-missing-or-foreign-selected-checkout-preserved**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | dirty-conflicting-missing-or-foreign-selected-checkout-preserved | `src/installer/__tests__/dev-git.test.ts` |

**integration: read-only-dev-check-never-fetches-builds-or-writes-install-state**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | read-only-dev-check-never-fetches-builds-or-writes-install-state | `src/installer/__tests__/dev-git.test.ts` |

**integration: offer-moves-before-acceptance-is-stale-after-acceptance-remains-pinned**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | offer-moves-before-acceptance-is-stale-after-acceptance-remains-pinned | `src/installer/__tests__/dev-git.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/installer/__tests__/dev-git.test.ts` | 0 | 4 | 3.8 s |  |

## t5

Run at 2026-11-24T16:27:27.551Z on commit `168b622f6`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: staged-dev-payload-requires-all-control-runtime-assets-and-clean-worker-result**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | staged-dev-payload-requires-all-control-runtime-assets-and-clean-worker-result | `src/installer/__tests__/dev-payload.test.ts` |
| pass | dev payload flushes its directory tree before prepared and fails closed on fsync error | `src/installer/__tests__/dev-payload.test.ts` |
| pass | worker completion durably flushes proof and refuses a failed result flush | `src/installer/__tests__/dev-worker.test.ts` |

**integration: npm-build-fetch-and-native-probe-failure-preserve-incumbent**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | npm-build-fetch-and-native-probe-failure-preserve-incumbent | `src/installer/__tests__/dev-payload.test.ts` |

**integration: immutable-dev-payload-tamper-or-existing-id-conflict-refuses-before-shutdown**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | immutable-dev-payload-tamper-or-existing-id-conflict-refuses-before-shutdown | `src/installer/__tests__/dev-payload.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/installer/__tests__/dev-payload.test.ts` | 0 | 4 | 202.8 s |  |
| `src/installer/__tests__/dev-worker.test.ts` | 0 | 7 | 15 s |  |

## t6

Run at 2026-11-24T16:32:16.288Z on commit `168b622f6`. Tests check: **passed**. 11 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: dev-manager-separates-accepted-source-offer-from-final-artifact-and-publishes-once**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | dev-manager-separates-accepted-source-offer-from-final-artifact-and-publishes-once | `src/installer/__tests__/dev-manager.test.ts` |
| pass | manager checkpoint rejects source mutation after durable acceptance | `src/installer/__tests__/dev-manager.test.ts` |

**integration: offer-moves-before-acceptance-is-stale-after-acceptance-remains-pinned**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | offer-moves-before-acceptance-is-stale-after-acceptance-remains-pinned | `src/installer/__tests__/dev-manager.test.ts` |

**integration: dev-open-verify-and-fresh-manager-reopen-never-fetch-or-build**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | dev-open-verify-and-fresh-manager-reopen-never-fetch-or-build | `src/installer/__tests__/dev-manager.test.ts` |

**integration: bundle-offer-receipt-and-required-sibling-admission-regressions-preserved**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | bundle-offer-receipt-and-required-sibling-admission-regressions-preserved | `src/installer/__tests__/dev-manager.test.ts` |
| pass | bundled manager metadata does not start source preparation | `src/installer/__tests__/dev-manager.test.ts` |
| pass | required peer admission and exact offer state transitions fail closed | `src/installer/__tests__/manager.test.ts` |
| pass | install is rejected even with a forged source/bootstrap marker | `src/installer/__tests__/manager.test.ts` |
| pass | preparation receives no controller writer and post-drain tampering blocks migration | `src/installer/__tests__/manager.test.ts` |
| pass | stop and interrupted stop recovery bypass dependency health and payload checks | `src/installer/__tests__/manager.test.ts` |
| pass | cancellation at pre-shutdown observation and control admission sends no shutdown | `src/installer/__tests__/manager.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/installer/__tests__/dev-manager.test.ts` | 0 | 6 | 188.7 s |  |
| `src/installer/__tests__/manager.test.ts` | 0 | 14 | 3.8 s |  |

## t7

Run at 2026-11-24T12:18:30.276Z on commit `9efe4891b`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: manager-self-exit-before-candidate-recovers-same-source-with-no-duplicate-worker**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | manager-self-exit-before-candidate-recovers-same-source-with-no-duplicate-worker | `src/installer/__tests__/dev-recovery.test.ts` |

**integration: held-unknown-or-mismatched-preparation-result-blocks-retry-and-cleanup**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | held-unknown-or-mismatched-preparation-result-blocks-retry-and-cleanup | `src/installer/__tests__/dev-recovery.test.ts` |
| pass | held-unknown-or-mismatched-preparation-result-blocks-retry-and-cleanup | `src/installer/__tests__/dev-worker.test.ts` |

**integration: published-release-before-candidate-record-reconciles-without-rebuild**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | published-release-before-candidate-record-reconciles-without-rebuild | `src/installer/__tests__/dev-recovery.test.ts` |

**integration: cancel-or-terminal-eof-drains-owned-preparation-actors-before-return**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | cancel-or-terminal-eof-drains-owned-preparation-actors-before-return | `src/installer/__tests__/dev-recovery.test.ts` |
| pass | cancel-or-terminal-eof-drains-owned-preparation-actors-before-return | `src/installer/__tests__/dev-worker.test.ts` |
| pass | terminal cancellation settles owned work and suppresses later TUI handoff | `src/installer/__tests__/terminal-install.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/installer/__tests__/dev-recovery.test.ts` | 0 | 4 | 237.6 s |  |
| `src/installer/__tests__/dev-worker.test.ts` | 0 | 5 | 13.4 s |  |
| `src/installer/__tests__/terminal-install.test.ts` | 0 | 9 | 3.6 s |  |

## t8

Run at 2026-11-24T12:38:55.314Z on commit `a9a918172`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: dev-open-verify-and-fresh-manager-reopen-never-fetch-or-build**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | dev-open-verify-and-fresh-manager-reopen-never-fetch-or-build | `src/installer/__tests__/installed-dev.test.ts` |

**integration: dev-common-handoff-selects-candidate-bootstrap-runtime-and-retains-mode**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | dev-common-handoff-selects-candidate-bootstrap-runtime-and-retains-mode | `src/installer/__tests__/installed-dev.test.ts` |

**integration: bundle-offer-receipt-and-required-sibling-admission-regressions-preserved**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | bundle-offer-receipt-and-required-sibling-admission-regressions-preserved | `src/installer/__tests__/installed-dev.test.ts` |
| pass | install is rejected even with a forged source/bootstrap marker | `src/installer/__tests__/manager.test.ts` |
| pass | terminal cancellation settles owned work and suppresses later TUI handoff | `src/installer/__tests__/terminal-install.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/installer/__tests__/installed-dev.test.ts` | 0 | 3 | 32.1 s |  |
| `src/installer/__tests__/manager.test.ts` | 0 | 13 | 3.5 s |  |
| `src/installer/__tests__/terminal-install.test.ts` | 0 | 9 | 3.2 s |  |

## t9

Run at 2026-11-24T17:49:45.924Z on commit `a3fcced89`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**smoke: dev-complete-payload-native-probe-and-fresh-installed-manager-inspect**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | dev-complete-payload-native-probe-and-fresh-installed-manager-inspect | `src/installer/__tests__/dev-complete-payload.test.ts` |

**integration: combined-s1-s2-installer-regression-has-complete-coverage-and-confirmed-cleanup**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | combined-s1-s2-installer-regression-has-complete-coverage-and-confirmed-cleanup | `scripts/__tests__/installer-s2-qualification.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `scripts/__tests__/installer-s2-qualification.test.ts` | 0 | 1 | 1.6 s |  |
| `src/installer/__tests__/dev-complete-payload.test.ts` | 0 | 1 | 550.2 s |  |
