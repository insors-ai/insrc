<!-- insrc:artifact TESTS-c3d71313f34bce71-s3 -->

# Tests: c3d71313f34bce71 s3

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 140 pass, 0 fail, 0 skipped, 0 not found; 14 reported by the builder and not run by the gate.

## t1

Run at 2026-11-25T02:01:50.011Z on commit `40f1b0cb5`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: dependency-policy-and-offer-bind-exact-target-home-destination-and-side-effects**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | dependency-policy-and-offer-bind-exact-target-home-destination-and-side-effects | `src/installer/__tests__/dependency-policy.test.ts` |

**unit: private-context-preserves-public-wire-shapes-and-rejects-unowned-install**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | private-context-preserves-public-wire-shapes-and-rejects-unowned-install | `src/installer/__tests__/dependency-policy.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/installer/__tests__/dependency-policy.test.ts` | 0 | 2 | 0.4 s |  |

## t2

Run at 2026-11-25T02:19:55.427Z on commit `799932404`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: dependency-state-matrix-distinguishes-ready-stopped-missing-and-unavailable**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | dependency-state-matrix-distinguishes-ready-stopped-missing-and-unavailable | `src/installer/__tests__/dependencies.test.ts` |

**integration: healthy-service-without-path-binary-is-reused**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | healthy-service-without-path-binary-is-reused | `src/installer/__tests__/dependencies.test.ts` |

**integration: inspect-and-decline-have-zero-mutation-or-process-side-effects**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | inspect-and-decline-have-zero-mutation-or-process-side-effects | `src/installer/__tests__/dependencies.test.ts` |

**unit: stopped-existing-ollama-has-manual-guidance-without-start-action**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | stopped-existing-ollama-has-manual-guidance-without-start-action | `src/installer/__tests__/dependencies.test.ts` |

**unit: agent-zero-one-many-detection-never-spawns-auth-model-or-install**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | agent-zero-one-many-detection-never-spawns-auth-model-or-install | `src/installer/__tests__/dependencies.test.ts` |

**unit: private-runtime-provenance-rejects-path-node-and-wrong-target**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | private-runtime-provenance-rejects-path-node-and-wrong-target | `src/installer/__tests__/dependencies.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/installer/__tests__/dependencies.test.ts` | 0 | 6 | 1 s |  |

## t3

Run at 2026-11-25T02:42:24.379Z on commit `0a3e75f20`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: linux-zstd-large-window-truncation-and-output-bombs-refuse-before-unsafe-write**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | linux-zstd-large-window-truncation-and-output-bombs-refuse-before-unsafe-write | `src/installer/__tests__/ollama-tar.test.ts` |

**integration: linux-tar-path-collision-device-and-link-escape-inputs-stay-contained**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | linux-tar-path-collision-device-and-link-escape-inputs-stay-contained | `src/installer/__tests__/ollama-tar.test.ts` |

**integration: stream-decoding-cancellation-yields-and-leaves-no-published-payload**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | stream-decoding-cancellation-yields-and-leaves-no-published-payload | `src/installer/__tests__/ollama-tar.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/installer/__tests__/ollama-tar.test.ts` | 0 | 3 | 0.6 s |  |

## t4

Run at 2026-11-25T03:11:23.291Z on commit `3bf6dacc8`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: qualified-zip-app-layout-requires-correct-executable-and-library-closure**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | qualified-zip-app-layout-requires-correct-executable-and-library-closure | `src/installer/__tests__/ollama-archive.test.ts` |

**integration: internal-archive-links-materialize-only-qualified-contained-files**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | internal-archive-links-materialize-only-qualified-contained-files | `src/installer/__tests__/ollama-archive.test.ts` |

**integration: zip-and-layout-escapes-collisions-and-abort-preserve-existing-bytes**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | zip-and-layout-escapes-collisions-and-abort-preserve-existing-bytes | `src/installer/__tests__/ollama-archive.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/installer/__tests__/ollama-archive.test.ts` | 0 | 3 | 0.8 s |  |

## t5

Run at 2026-11-25T03:58:20.094Z on commit `75f18ecb4`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: stale-forged-and-cross-home-offers-reject-before-mutation**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | stale-forged-and-cross-home-offers-reject-before-mutation | `src/installer/__tests__/ollama-prepare.test.ts` |

**integration: consent-races-on-policy-destination-and-endpoint-never-overwrite-existing-state**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | consent-races-on-policy-destination-and-endpoint-never-overwrite-existing-state | `src/installer/__tests__/ollama-prepare.test.ts` |

**integration: download-size-digest-layout-and-fsync-failures-never-report-ready**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | download-size-digest-layout-and-fsync-failures-never-report-ready | `src/installer/__tests__/ollama-prepare.test.ts` |

**integration: finite-actor-closure-uncertainty-blocks-retry-and-cleanup**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | finite-actor-closure-uncertainty-blocks-retry-and-cleanup | `src/installer/__tests__/ollama-prepare.test.ts` |

**integration: private-preparation-cancellation-blocks-later-publication**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | private-preparation-cancellation-blocks-later-publication | `src/installer/__tests__/ollama-prepare.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/installer/__tests__/ollama-prepare.test.ts` | 0 | 5 | 2.3 s |  |

## t6

Run at 2026-11-25T11:58:40.245Z on commit `230cffc6c`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: service-admission-is-durable-and-distinct-from-finite-preparation-drain**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | service-admission-is-durable-and-distinct-from-finite-preparation-drain | `src/installer/__tests__/ollama-service.test.ts` |

**integration: interrupted-attempt-reconciles-existing-receipt-without-duplicate-download-or-spawn**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | interrupted-attempt-reconciles-existing-receipt-without-duplicate-download-or-spawn | `src/installer/__tests__/ollama-service.test.ts` |

**integration: owned-service-start-port-conflict-and-readiness-failure-preserve-existing-listener**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | owned-service-start-port-conflict-and-readiness-failure-preserve-existing-listener | `src/installer/__tests__/ollama-service.test.ts` |

**integration: service-admission-cancellation-retains-only-explicitly-accepted-service-intent**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | service-admission-cancellation-retains-only-explicitly-accepted-service-intent | `src/installer/__tests__/ollama-service.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/installer/__tests__/ollama-service.test.ts` | 0 | 4 | 13.8 s |  |

## t7

Run at 2026-11-25T12:17:45.052Z on commit `bb6fc62b0`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: accepted-official-payload-is-user-only-and-discloses-install-and-start**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | accepted-official-payload-is-user-only-and-discloses-install-and-start | `src/installer/__tests__/dependency-integration.test.ts` |

**integration: cancellation-and-eof-block-later-publication-or-service-admission**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | cancellation-and-eof-block-later-publication-or-service-admission | `src/installer/__tests__/dependency-integration.test.ts` |

**integration: terminal-manager-dependency-context-preserves-stop-and-cancellation-regressions**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | terminal-manager-dependency-context-preserves-stop-and-cancellation-regressions | `src/installer/__tests__/dependency-integration.test.ts` |
| pass | stop and interrupted stop recovery bypass dependency health and payload checks | `src/installer/__tests__/manager.test.ts` |
| pass | ready commit and lock release precede same terminal installed TUI | `src/installer/__tests__/terminal-install.test.ts` |

**integration: dependency-uncertain-recovery-preserves-operation-and-prevents-duplicate-side-effects**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | dependency-uncertain-recovery-preserves-operation-and-prevents-duplicate-side-effects | `src/installer/__tests__/dependency-integration.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/installer/__tests__/dependency-integration.test.ts` | 0 | 4 | 13.5 s |  |
| `src/installer/__tests__/manager.test.ts` | 0 | 14 | 3.5 s |  |
| `src/installer/__tests__/terminal-install.test.ts` | 0 | 9 | 3.9 s |  |

## t8

Run at 2026-11-25T12:24:51.978Z on commit `9c6fbc1a8`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: production-dependencies-compose-with-real-delivery-and-no-fake-s4-s5**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | production-dependencies-compose-with-real-delivery-and-no-fake-s4-s5 | `src/installer/__tests__/production-peers.test.ts` |
| pass | bundle-offer-receipt-and-required-sibling-admission-regressions-preserved | `src/installer/__tests__/installed-dev.test.ts` |

**smoke: published-control-payload-includes-real-dependency-adapter-without-application-boot-imports**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | published-control-payload-includes-real-dependency-adapter-without-application-boot-imports | `src/installer/__tests__/production-peers.test.ts` |

**integration: both-control-entrypoints-use-identical-installation-bound-dependency-policy**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | both-control-entrypoints-use-identical-installation-bound-dependency-policy | `src/installer/__tests__/production-peers.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/installer/__tests__/installed-dev.test.ts` | 0 | 3 | 31.3 s |  |
| `src/installer/__tests__/production-peers.test.ts` | 0 | 3 | 8.8 s |  |

## t11

Run at 2026-11-25T13:49:58.938Z on commit `60a3752db`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: inspection-and-reconciliation-share-three-second-bound-without-payload-hashing**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | inspection-and-reconciliation-share-three-second-bound-without-payload-hashing | `src/installer/__tests__/ollama-validation.test.ts` |

**integration: receipt-closure-and-layout-errors-block-reuse-without-content-rehash**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | receipt-closure-and-layout-errors-block-reuse-without-content-rehash | `src/installer/__tests__/ollama-validation.test.ts` |

**integration: same-size-installed-content-change-does-not-trigger-digest-reverification**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | same-size-installed-content-change-does-not-trigger-digest-reverification | `src/installer/__tests__/ollama-validation.test.ts` |

**integration: archive-digest-mismatch-still-rejects-live-acquisition**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | archive-digest-mismatch-still-rejects-live-acquisition | `src/installer/__tests__/ollama-validation.test.ts` |

**integration: reuse-and-service-admission-never-rehash-installed-files**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | reuse-and-service-admission-never-rehash-installed-files | `src/installer/__tests__/ollama-service.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/installer/__tests__/ollama-service.test.ts` | 0 | 5 | 16.8 s |  |
| `src/installer/__tests__/ollama-validation.test.ts` | 0 | 4 | 11.3 s |  |

## t9

Run at 2026-11-25T20:24:36.749Z on commit `fa394ad92`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 4 reported by the builder and not run by the gate.

**live: qualified-exact-ollama-payload-version-and-user-session-readiness-on-enabled-target**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/plans/s3-ollama-native-qualification-2026-11-26/qualification.json; current T17 final native run, supported by raw install/machine/upstream/cache/inspection/source-hash files and stopped VM record

**live: existing-installation-reuse-and-decline-preserve-platform-state**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/plans/s3-ollama-native-qualification-2026-11-26/qualification.json; current T17 final native run, supported by raw install/machine/upstream/cache/inspection/source-hash files and stopped VM record

**live: official-large-archive-streaming-and-library-layout-match-policy**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/plans/s3-ollama-native-qualification-2026-11-26/qualification.json; current T17 final native run, supported by raw install/machine/upstream/cache/inspection/source-hash files and stopped VM record

**unit: enabled-target-policy-requires-matching-native-evidence-and-mandatory-linux-route**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | enabled-target-policy-requires-matching-native-evidence-and-mandatory-linux-route | `src/installer/__tests__/ollama-catalog.test.ts` |
| pass | manual-user-level-guidance-preserves-disabled-target-status | `src/installer/__tests__/ollama-catalog.test.ts` |

**live: native-large-payload-inspection-avoids-content-reads-within-three-seconds**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/plans/s3-ollama-native-qualification-2026-11-26/qualification.json; current T17 final native run, supported by raw install/machine/upstream/cache/inspection/source-hash files and stopped VM record

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/installer/__tests__/ollama-catalog.test.ts` | 0 | 2 | 3.2 s |  |

## t10

Run at 2026-11-25T15:13:05.297Z on commit `c3e167d66`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

**smoke: combined-s1-s2-s3-installer-regression-has-exact-coverage-and-confirmed-cleanup**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/plans/s3-dependency-setup-validation-2026-11-25.json

**integration: terminal-install-upgrade-consent-and-ready-before-tui-regressions**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ready commit and lock release precede same terminal installed TUI | `src/installer/__tests__/terminal-install.test.ts` |
| pass | terminal consent binds exact dependency offer and never installs coding CLIs | `src/installer/__tests__/terminal-install.test.ts` |
| pass | terminal upgrade retains delivery and rejects stale dependency consent before disruption | `src/installer/__tests__/terminal-install.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/installer/__tests__/terminal-install.test.ts` | 0 | 9 | 3.7 s |  |

## t12

Run at 2026-11-25T17:27:30.533Z on commit `e580dbaa7`. Tests check: **passed**. 22 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: stale-forged-and-cross-home-offers-reject-before-mutation**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | stale-forged-and-cross-home-offers-reject-before-mutation | `src/installer/__tests__/ollama-prepare.test.ts` |
| pass | legacy-closed-attempt-copied-to-another-home-cannot-authorize-deletion | `src/installer/__tests__/ollama-recovery.test.ts` |

**integration: consent-races-on-policy-destination-and-endpoint-never-overwrite-existing-state**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | consent-races-on-policy-destination-and-endpoint-never-overwrite-existing-state | `src/installer/__tests__/ollama-prepare.test.ts` |

**integration: download-size-digest-layout-and-fsync-failures-never-report-ready**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | download-size-digest-layout-and-fsync-failures-never-report-ready | `src/installer/__tests__/ollama-prepare.test.ts` |

**integration: cancellation-and-eof-block-later-publication-or-service-admission**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | cancellation-and-eof-block-later-publication-or-service-admission | `src/installer/__tests__/dependency-integration.test.ts` |

**integration: unknown-actor-proof-blocks-install-retry-cleanup**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | unknown-actor-proof-blocks-install-retry-cleanup | `src/installer/__tests__/ollama-recovery.test.ts` |
| pass | malformed-utf8-historical-policy-never-authorizes-cleanup | `src/installer/__tests__/ollama-recovery.test.ts` |
| pass | orphan-evidence-in-empty-attempt-directory-blocks-fresh-preparation | `src/installer/__tests__/ollama-recovery.test.ts` |

**integration: cleanup-cancellation-or-partial-failure-prevents-every-new-install-side-effect**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | cleanup-cancellation-or-partial-failure-prevents-every-new-install-side-effect | `src/installer/__tests__/ollama-recovery.test.ts` |
| pass | cleanup-deadline-retains-actor-until-close-and-retry-finishes-disposal | `src/installer/__tests__/ollama-recovery.test.ts` |
| pass | retry-reconciles-interruption-at-every-stage-disposal-boundary | `src/installer/__tests__/ollama-recovery.test.ts` |
| pass | malformed-or-incomplete-retry-journals-block-fresh-preparation | `src/installer/__tests__/ollama-recovery.test.ts` |

**integration: repeated-retry-after-death-is-idempotent-and-finishes-cleanup-first**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | repeated-retry-after-death-is-idempotent-and-finishes-cleanup-first | `src/installer/__tests__/ollama-recovery.test.ts` |
| pass | temporary-disposal-intent-survives-unlink-completion-crash-gap | `src/installer/__tests__/ollama-recovery.test.ts` |

**integration: qualified-in-process-lock-proof-excludes-live-inherited-and-unknown-actors**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | qualified-in-process-lock-proof-excludes-live-inherited-and-unknown-actors | `src/installer/__tests__/ollama-recovery.test.ts` |
| pass | replacement-free-lock-cannot-authorize-cleanup-of-original-actor | `src/installer/__tests__/ollama-recovery.test.ts` |
| pass | native-preparation-lock-is-not-inherited-by-live-exec-child | `src/installer/__tests__/ollama-recovery.test.ts` |
| pass | disposal-descriptor-close-uncertainty-retains-lock-until-observed-process-exit | `src/installer/__tests__/ollama-recovery.test.ts` |

**integration: late-settlement-records-true-outcome-and-completes-disposal-under-held-handle**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | late-settlement-records-true-outcome-and-completes-disposal-under-held-handle | `src/installer/__tests__/ollama-recovery.test.ts` |

**integration: policy-change-reconciles-exact-accepted-copy-without-current-policy-substitution**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | policy-change-reconciles-exact-accepted-copy-without-current-policy-substitution | `src/installer/__tests__/ollama-recovery.test.ts` |
| pass | interrupted-attempt-reconciles-existing-receipt-without-duplicate-download-or-spawn | `src/installer/__tests__/ollama-service.test.ts` |

**integration: immutable-record-publication-never-replaces-existing-target-and-cleans-owned-temp**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | immutable-record-publication-never-replaces-existing-target-and-cleans-owned-temp | `src/installer/__tests__/ollama-recovery.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/installer/__tests__/dependency-integration.test.ts` | 0 | 4 | 11.7 s |  |
| `src/installer/__tests__/ollama-prepare.test.ts` | 0 | 5 | 15.3 s |  |
| `src/installer/__tests__/ollama-recovery.test.ts` | 0 | 17 | 43.8 s |  |
| `src/installer/__tests__/ollama-service.test.ts` | 0 | 6 | 22.8 s |  |

## t13

Run at 2026-11-25T18:07:52.061Z on commit `ecfd94321`. Tests check: **passed**. 16 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: inspect-and-decline-have-zero-mutation-or-process-side-effects**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | inspect-and-decline-have-zero-mutation-or-process-side-effects | `src/installer/__tests__/dependencies.test.ts` |

**integration: stale-forged-and-cross-home-offers-reject-before-mutation**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | stale-forged-and-cross-home-offers-reject-before-mutation | `src/installer/__tests__/ollama-prepare.test.ts` |

**integration: accepted-official-payload-is-user-only-and-discloses-install-and-start**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | accepted-official-payload-is-user-only-and-discloses-install-and-start | `src/installer/__tests__/dependency-integration.test.ts` |

**integration: consent-races-on-policy-destination-and-endpoint-never-overwrite-existing-state**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | consent-races-on-policy-destination-and-endpoint-never-overwrite-existing-state | `src/installer/__tests__/ollama-prepare.test.ts` |

**integration: explicit-install-retry-completes-cleanup-before-fresh-install**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | explicit-install-retry-completes-cleanup-before-fresh-install | `src/installer/__tests__/install-retry.test.ts` |
| pass | real-install-retry-waits-for-owned-actor-closure-and-cleans-original-policy | `src/installer/__tests__/dependency-integration.test.ts` |

**integration: terminal-manager-dependency-context-preserves-stop-and-cancellation-regressions**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | terminal-manager-dependency-context-preserves-stop-and-cancellation-regressions | `src/installer/__tests__/dependency-integration.test.ts` |

**integration: install-retry-requires-explicit-terminal-admission-and-original-install-intent**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | install-retry-requires-explicit-terminal-admission-and-original-install-intent | `src/installer/__tests__/install-retry.test.ts` |
| pass | install-cleanup-rejects-every-other-owner-admission-before-writes | `src/installer/__tests__/install-retry.test.ts` |

**integration: upgrade-retry-never-enters-install-cleanup-or-changes-selected-release**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | upgrade-retry-never-enters-install-cleanup-or-changes-selected-release | `src/installer/__tests__/install-retry.test.ts` |

**integration: cleanup-cancellation-or-partial-failure-prevents-every-new-install-side-effect**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | cleanup-cancellation-or-partial-failure-prevents-every-new-install-side-effect | `src/installer/__tests__/install-retry.test.ts` |

**integration: repeated-retry-after-death-is-idempotent-and-finishes-cleanup-first**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | repeated-retry-after-death-is-idempotent-and-finishes-cleanup-first | `src/installer/__tests__/install-retry.test.ts` |
| pass | actual-cleanup-process-death-retries-missing-items-with-fresh-manager-and-delivery | `src/installer/__tests__/install-retry.test.ts` |

**integration: fresh-bundle-peer-validates-durable-descriptor-without-resolve-map**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | fresh-bundle-peer-validates-durable-descriptor-without-resolve-map | `src/installer/__tests__/bundle-recovery.test.ts` |
| pass | private-release-offer-bound-supports-full-descriptors-without-widening-other-records | `src/installer/__tests__/bundle-recovery.test.ts` |

**integration: decline-creates-no-dependency-context-record-or-process-and-remains-certain**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | decline-creates-no-dependency-context-record-or-process-and-remains-certain | `src/installer/__tests__/install-retry.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/installer/__tests__/bundle-recovery.test.ts` | 0 | 2 | 38.8 s |  |
| `src/installer/__tests__/dependencies.test.ts` | 0 | 6 | 14.3 s |  |
| `src/installer/__tests__/dependency-integration.test.ts` | 0 | 5 | 13.9 s |  |
| `src/installer/__tests__/install-retry.test.ts` | 0 | 8 | 21.8 s |  |
| `src/installer/__tests__/ollama-prepare.test.ts` | 0 | 5 | 14.8 s |  |

## t14

Run at 2026-11-25T20:01:14.040Z on commit `94a2a2ac7`. Tests check: **passed**. 18 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: cancellation-and-eof-block-later-publication-or-service-admission**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | cancellation-and-eof-block-later-publication-or-service-admission | `src/installer/__tests__/dependency-integration.test.ts` |
| pass | terminal-eof-and-interrupt-request-one-drain-and-restore-handlers | `src/installer/__tests__/terminal-abort.test.ts` |

**integration: service-admission-is-durable-and-distinct-from-finite-preparation-drain**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | service-admission-is-durable-and-distinct-from-finite-preparation-drain | `src/installer/__tests__/ollama-service.test.ts` |
| pass | retained-facts-survive-stale-finite-marker-without-repair-or-replay | `src/installer/__tests__/ollama-service.test.ts` |
| pass | explicit-retry-closes-qualified-dead-handoff-and-owned-temporary-writes | `src/installer/__tests__/ollama-recovery.test.ts` |
| pass | legacy-preparation-closure-does-not-authorize-unknown-handoff-disposal | `src/installer/__tests__/ollama-recovery.test.ts` |

**integration: owned-service-start-port-conflict-and-readiness-failure-preserve-existing-listener**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | owned-service-start-port-conflict-and-readiness-failure-preserve-existing-listener | `src/installer/__tests__/ollama-service.test.ts` |

**integration: terminal-manager-dependency-context-preserves-stop-and-cancellation-regressions**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | terminal-manager-dependency-context-preserves-stop-and-cancellation-regressions | `src/installer/__tests__/dependency-integration.test.ts` |
| pass | normal-terminal-close-removes-install-handlers-before-tui-handoff | `src/installer/__tests__/terminal-abort.test.ts` |

**integration: sighup-sigterm-and-sigkill-at-preparation-and-handoff-preserve-correct-evidence**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | sighup-sigterm-and-sigkill-at-preparation-and-handoff-preserve-correct-evidence | `src/installer/__tests__/ollama-signals.test.ts` |

**integration: supervisor-log-validation-and-pre-spawn-failures-have-bounded-not-started-diagnostics**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | supervisor-log-validation-and-pre-spawn-failures-have-bounded-not-started-diagnostics | `src/installer/__tests__/ollama-service.test.ts` |
| pass | supervisor-control-entrypoint-link-check-is-identical-before-and-after-admission | `src/installer/__tests__/ollama-production-worker.test.ts` |
| pass | pre-launch-failure-and-cancelled-failed-spawn-keep-bound-not-started-diagnostics | `src/installer/__tests__/ollama-service.test.ts` |

**integration: production-worker-dispatch-argv-path-and-sanitized-environment-with-seeded-sentinels**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | production-worker-dispatch-argv-path-and-sanitized-environment-with-seeded-sentinels | `src/installer/__tests__/ollama-production-worker.test.ts` |

**integration: supervisor-death-does-not-imply-retained-service-death-or-authorize-replay**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | supervisor-death-does-not-imply-retained-service-death-or-authorize-replay | `src/installer/__tests__/ollama-production-worker.test.ts` |

**integration: retained-service-cancellation-is-explicit-and-total-deadline-bounds-readiness**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | retained-service-cancellation-is-explicit-and-total-deadline-bounds-readiness | `src/installer/__tests__/ollama-service.test.ts` |
| pass | cancellation-after-ready-dependency-report-still-discloses-retained-service | `src/installer/__tests__/dependency-integration.test.ts` |
| pass | transient-presence-probe-timeout-preserves-service-readiness-window | `src/installer/__tests__/ollama-service.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/installer/__tests__/dependency-integration.test.ts` | 0 | 6 | 17.5 s |  |
| `src/installer/__tests__/ollama-production-worker.test.ts` | 0 | 3 | 11 s |  |
| `src/installer/__tests__/ollama-recovery.test.ts` | 0 | 19 | 48.1 s |  |
| `src/installer/__tests__/ollama-service.test.ts` | 0 | 10 | 36.5 s |  |
| `src/installer/__tests__/ollama-signals.test.ts` | 0 | 1 | 7.1 s |  |
| `src/installer/__tests__/terminal-abort.test.ts` | 0 | 2 | 0.5 s |  |

## t15

Run at 2026-11-25T19:41:56.944Z on commit `079a1f46f`. Tests check: **passed**. 15 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: hostile-archive-and-large-zstd-window-fail-before-unsafe-write-or-allocation**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | linux-zstd-large-window-truncation-and-output-bombs-refuse-before-unsafe-write | `src/installer/__tests__/ollama-tar.test.ts` |
| pass | zstd-reserved-dictionary-size-skippable-and-dual-decoder-boundary-matrix | `src/installer/__tests__/ollama-archive-matrix.test.ts` |

**integration: internal-archive-links-materialize-only-qualified-contained-files**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | internal-archive-links-materialize-only-qualified-contained-files | `src/installer/__tests__/ollama-archive.test.ts` |

**integration: download-size-digest-layout-and-fsync-failures-never-report-ready**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | download-size-digest-layout-and-fsync-failures-never-report-ready | `src/installer/__tests__/ollama-prepare.test.ts` |

**integration: archive-digest-mismatch-still-rejects-live-acquisition**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | archive-digest-mismatch-still-rejects-live-acquisition | `src/installer/__tests__/ollama-validation.test.ts` |

**integration: zip-extraction-uses-verified-descriptor-across-path-swap-and-positive-close**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | zip-extraction-uses-verified-descriptor-across-path-swap-and-positive-close | `src/installer/__tests__/ollama-zip-boundaries.test.ts` |
| pass | cancelled-zip-waits-for-pending-descriptor-read-before-positive-close | `src/installer/__tests__/ollama-zip-boundaries.test.ts` |
| pass | zip-close-error-is-resource-uncertainty-and-never-false-completion | `src/installer/__tests__/ollama-zip-boundaries.test.ts` |
| pass | abort-during-zip-close-cancels-after-positive-descriptor-release | `src/installer/__tests__/ollama-zip-boundaries.test.ts` |
| pass | zip-cancellation-cannot-erase-unclosed-output-resource-evidence | `src/installer/__tests__/ollama-zip-boundaries.test.ts` |
| pass | large-deflated-zip-consumes-coalesced-output-with-fixed-read-bounds | `src/installer/__tests__/ollama-zip-boundaries.test.ts` |

**integration: hostile-tar-zstd-zip-boundary-matrix-rejects-before-unsafe-write**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | tar-gnu-numeric-pax-padding-terminator-and-reserved-name-boundary-matrix | `src/installer/__tests__/ollama-archive-matrix.test.ts` |
| pass | zstd-reserved-dictionary-size-skippable-and-dual-decoder-boundary-matrix | `src/installer/__tests__/ollama-archive-matrix.test.ts` |
| pass | zip64-descriptor-comment-unicode-gap-and-overlap-boundary-matrix | `src/installer/__tests__/ollama-archive-matrix.test.ts` |

**integration: alias-copy-cancellation-closes-before-owned-cleanup**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | alias-copy-cancellation-closes-before-owned-cleanup | `src/installer/__tests__/ollama-archive-matrix.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/installer/__tests__/ollama-archive-matrix.test.ts` | 0 | 4 | 9.9 s |  |
| `src/installer/__tests__/ollama-archive.test.ts` | 0 | 3 | 7.2 s |  |
| `src/installer/__tests__/ollama-prepare.test.ts` | 0 | 5 | 14.1 s |  |
| `src/installer/__tests__/ollama-tar.test.ts` | 0 | 3 | 7.6 s |  |
| `src/installer/__tests__/ollama-validation.test.ts` | 0 | 4 | 11.4 s |  |
| `src/installer/__tests__/ollama-zip-boundaries.test.ts` | 0 | 6 | 14.6 s |  |

## t16

Run at 2026-11-25T20:04:10.480Z on commit `94a2a2ac7`. Tests check: **passed**. 15 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: dependency-state-matrix-distinguishes-ready-stopped-missing-and-unavailable**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | dependency-state-matrix-distinguishes-ready-stopped-missing-and-unavailable | `src/installer/__tests__/dependencies.test.ts` |

**integration: healthy-service-without-path-binary-is-reused**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | healthy-service-without-path-binary-is-reused | `src/installer/__tests__/dependencies.test.ts` |

**integration: inspect-and-decline-have-zero-mutation-or-process-side-effects**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | inspect-and-decline-have-zero-mutation-or-process-side-effects | `src/installer/__tests__/dependencies.test.ts` |

**integration: stopped-existing-ollama-has-manual-guidance-without-start-action**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | stopped-existing-ollama-has-manual-guidance-without-start-action | `src/installer/__tests__/dependencies.test.ts` |
| pass | ancestor-alias-blocker-preserves-canonical-home-authority | `src/installer/__tests__/dependencies.test.ts` |

**integration: agent-zero-one-many-detection-never-spawns-auth-model-or-install**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | agent-zero-one-many-detection-never-spawns-auth-model-or-install | `src/installer/__tests__/dependencies.test.ts` |

**integration: inspection-and-reconciliation-share-three-second-bound-without-payload-hashing**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | inspection-and-reconciliation-share-three-second-bound-without-payload-hashing | `src/installer/__tests__/ollama-validation.test.ts` |
| pass | private-preparation-cancellation-blocks-later-publication | `src/installer/__tests__/ollama-prepare.test.ts` |

**integration: receipt-closure-and-layout-errors-block-reuse-without-content-rehash**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | receipt-closure-and-layout-errors-block-reuse-without-content-rehash | `src/installer/__tests__/ollama-validation.test.ts` |

**integration: same-size-installed-content-change-does-not-trigger-digest-reverification**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | same-size-installed-content-change-does-not-trigger-digest-reverification | `src/installer/__tests__/ollama-validation.test.ts` |

**integration: reuse-and-service-admission-never-rehash-installed-files**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | reuse-and-service-admission-never-rehash-installed-files | `src/installer/__tests__/ollama-service.test.ts` |

**integration: invalid-receipt-closure-layout-reject-with-specific-code-and-zero-transport-calls**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | receipt-closure-and-layout-errors-block-reuse-without-content-rehash | `src/installer/__tests__/ollama-validation.test.ts` |

**integration: payload-read-sentinel-covers-sync-async-stream-and-path-read-entrypoints**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | payload-read-sentinel-covers-sync-async-stream-and-path-read-entrypoints | `src/installer/__tests__/ollama-read-sentinel.test.ts` |

**integration: redirect-target-local-listener-is-never-contacted**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | redirect-target-local-listener-is-never-contacted | `src/installer/__tests__/dependencies.test.ts` |

**integration: coding-cli-advice-emitted-once-and-install-spawn-sentinels-remain-zero**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | coding-cli-advice-emitted-once-and-install-spawn-sentinels-remain-zero | `src/installer/__tests__/terminal-install.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/installer/__tests__/dependencies.test.ts` | 0 | 8 | 19.1 s |  |
| `src/installer/__tests__/ollama-prepare.test.ts` | 0 | 5 | 17 s |  |
| `src/installer/__tests__/ollama-read-sentinel.test.ts` | 0 | 1 | 0.6 s |  |
| `src/installer/__tests__/ollama-service.test.ts` | 0 | 10 | 38.2 s |  |
| `src/installer/__tests__/ollama-validation.test.ts` | 0 | 4 | 11.7 s |  |
| `src/installer/__tests__/terminal-install.test.ts` | 0 | 10 | 4.1 s |  |

## t17

Run at 2026-11-25T20:22:24.648Z on commit `dfc25b808`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 6 reported by the builder and not run by the gate.

**integration: accepted-official-payload-is-user-only-and-discloses-install-and-start**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | accepted-official-payload-is-user-only-and-discloses-install-and-start | `src/installer/__tests__/dependency-integration.test.ts` |

**live: qualified-exact-ollama-payload-version-and-user-session-readiness-on-enabled-target**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/plans/s3-ollama-native-qualification-2026-11-26/native-install.json; docs/plans/s3-ollama-native-qualification-2026-11-26/qualification.json

**live: existing-installation-reuse-and-decline-preserve-platform-state**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/plans/s3-ollama-native-qualification-2026-11-26/decline.json; docs/plans/s3-ollama-native-qualification-2026-11-26/native-install.json

**live: official-large-archive-streaming-and-library-layout-match-policy**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/plans/s3-ollama-native-qualification-2026-11-26/native-install.json; docs/plans/s3-ollama-native-qualification-2026-11-26/source-hashes.json

**live: native-large-payload-inspection-avoids-content-reads-within-three-seconds**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/plans/s3-ollama-native-qualification-2026-11-26/fresh-inspection-after-cache-advice.json; docs/plans/s3-ollama-native-qualification-2026-11-26/cache-advice.json

**live: native-platform-glibc-translation-and-upstream-digest-provenance-are-observed**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | native-evidence-validator-rejects-wrong-platform-glibc-digest-and-translated-observations | `src/installer/__tests__/ollama-qualification.test.ts` |
| pass | enabled-target-policy-requires-matching-native-evidence-and-mandatory-linux-route | `src/installer/__tests__/ollama-catalog.test.ts` |
| pass | manual-user-level-guidance-preserves-disabled-target-status | `src/installer/__tests__/ollama-catalog.test.ts` |
| pass | native-evidence-validator-rejects-raw-response-inconsistency | `src/installer/__tests__/ollama-qualification.test.ts` |

Reported by the builder, not run by the gate: **pass**. Evidence: docs/plans/s3-ollama-native-qualification-2026-11-26/install-machine.json; docs/plans/s3-ollama-native-qualification-2026-11-26/install-upstream.json; docs/plans/s3-ollama-native-qualification-2026-11-26/source-hashes.json

**live: native-write-observations-and-cache-advice-are-recorded-with-limits**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/plans/s3-ollama-native-qualification-2026-11-26/install-write-observations.json; docs/plans/s3-ollama-native-qualification-2026-11-26/cache-advice.json; docs/plans/s3-ollama-native-qualification-2026-11-26/cleanup-vm.json

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/installer/__tests__/dependency-integration.test.ts` | 0 | 6 | 17 s |  |
| `src/installer/__tests__/ollama-catalog.test.ts` | 0 | 2 | 2.8 s |  |
| `src/installer/__tests__/ollama-qualification.test.ts` | 0 | 2 | 0.4 s |  |

## t18

Run at 2026-11-25T21:02:40.581Z on commit `69f9dc03d`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 3 reported by the builder and not run by the gate.

**integration: private-runtime-provenance-rejects-path-node-and-wrong-target**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | private-runtime-provenance-rejects-path-node-and-wrong-target | `src/installer/__tests__/dependencies.test.ts` |

**integration: production-dependencies-compose-with-real-delivery-and-no-fake-s4-s5**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | production-dependencies-compose-with-real-delivery-and-no-fake-s4-s5 | `src/installer/__tests__/production-peers.test.ts` |

**smoke: combined-s1-s2-s3-installer-regression-has-exact-coverage-and-confirmed-cleanup**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | combined-s1-s2-s3-installer-regression-has-exact-coverage-and-confirmed-cleanup | `scripts/__tests__/installer-s2-qualification.test.ts` |

Reported by the builder, not run by the gate: **pass**. Evidence: docs/plans/s3-final-regression-2026-11-26.json; .insrc/tmp/s3-final-audit.log; raw final run 3cdda64a-f71b-40ea-a4c7-336a32dce819

**smoke: published-control-payload-includes-real-dependency-adapter-without-application-boot-imports**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | published-control-payload-includes-real-dependency-adapter-without-application-boot-imports | `src/installer/__tests__/production-peers.test.ts` |

Reported by the builder, not run by the gate: **pass**. Evidence: docs/plans/s3-final-regression-2026-11-26.json; final production-peers and publisher TAP logs

**smoke: terminal-install-upgrade-consent-and-ready-before-tui-regressions**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ready commit and lock release precede same terminal installed TUI | `src/installer/__tests__/terminal-install.test.ts` |
| pass | terminal upgrade retains delivery and rejects stale dependency consent before disruption | `src/installer/__tests__/terminal-install.test.ts` |

Reported by the builder, not run by the gate: **pass**. Evidence: docs/plans/s3-final-regression-2026-11-26.json; final terminal-install and install-retry TAP logs

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `scripts/__tests__/installer-s2-qualification.test.ts` | 0 | 1 | 1.3 s |  |
| `src/installer/__tests__/dependencies.test.ts` | 0 | 8 | 18 s |  |
| `src/installer/__tests__/production-peers.test.ts` | 0 | 3 | 7.4 s |  |
| `src/installer/__tests__/terminal-install.test.ts` | 0 | 10 | 3.6 s |  |
