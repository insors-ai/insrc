<!-- insrc:artifact TESTS-446ae69566d352dd-s1 -->

# Tests: 446ae69566d352dd s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 132 pass, 0 fail, 0 skipped, 0 not found; 8 reported by the builder and not run by the gate.

## t1

Run at 2026-11-28T10:11:13.449Z on commit `0fa2f8c20`. Tests check: **passed**. 13 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: runtime-policy-exact-identity-target-baseline-profile-and-pinned-inventory**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | runtime policy pins all six official distribution identities without enabling targets | `src/installer/__tests__/runtime-policy.test.ts` |
| pass | runtime layout binds complete identity and rejects unsafe aliases without filesystem allocation | `src/installer/__tests__/runtime-policy.test.ts` |
| pass | runtime metadata has fixed finite bounds and locale independent inventory serialization | `src/installer/__tests__/runtime-policy.test.ts` |

**unit: runtime-profile-metadata-is-reproducible-from-pinned-official-assets-without-target-execution**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | official profile metadata reproduces all pinned assets without target execution or extraction | `src/installer/__tests__/runtime-policy.test.ts` |

**unit: ordinary-runtime-deadlines-ignore-qualification-env-and-trusted-qualifier-remains-bounded**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ordinary installer imports and action deadlines ignore every ambient qualification selector | `src/installer/__tests__/production-deadlines.test.ts` |
| pass | explicit trusted qualification admission preserves bounded runtime and manager deadlines | `src/installer/__tests__/production-deadlines.test.ts` |
| pass | qualification-profile-selects-frozen-normal-and-slow-vm-role-budgets | `src/installer/__tests__/qualification-time-budgets.test.ts` |
| pass | invalid-profile-fails-before-any-filesystem-or-worker-admission | `src/installer/__tests__/qualification-time-budgets.test.ts` |
| pass | profile-snapshot-cannot-change-after-module-import | `src/installer/__tests__/qualification-time-budgets.test.ts` |
| pass | copied-policy-asset-has-source-bytes-and-loads-from-installed-control | `src/installer/__tests__/qualification-time-budgets.test.ts` |
| pass | explicit-short-scope-overrides-remain-exact-under-slow-vm | `src/installer/__tests__/qualification-scopes.test.ts` |
| pass | omitted-child-profile-is-canonicalized-and-conflicting-profile-rejected | `src/installer/__tests__/qualification-scopes.test.ts` |
| pass | normal-coordinator-and-git-role-caps-remain-exact | `src/installer/__tests__/qualification-scopes.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/installer/__tests__/production-deadlines.test.ts` | 0 | 2 | 2.2 s |  |
| `src/installer/__tests__/qualification-scopes.test.ts` | 0 | 3 | 0.5 s |  |
| `src/installer/__tests__/qualification-time-budgets.test.ts` | 0 | 4 | 0.9 s |  |
| `src/installer/__tests__/runtime-policy.test.ts` | 0 | 4 | 4.9 s |  |

## t2

Run at 2026-11-28T10:48:53.443Z on commit `e6c98e204`. Tests check: **passed**. 22 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: resolver-import-boundary-excludes-application-paths-storage-provider-and-source-build**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | resolver import graph stays within installer-only read primitives | `src/installer/__tests__/runtime-store.test.ts` |

**unit: resolver-returns-canonical-node-npm-headers-and-win-library-from-exact-identity**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | resolver returns frozen canonical Node npm headers and platform library for the exact identity | `src/installer/__tests__/runtime-store.test.ts` |

**unit: resolver-rejects-missing-corrupt-extra-files-wrong-mode-target-digest-npm-headers-inventory-receipt**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | resolver rejects corrupt receipts inventories files modes targets aliases and extra members | `src/installer/__tests__/runtime-store.test.ts` |
| pass | strict POSIX runtime protection preserves pinned bytes and rejects every write or execute mode drift | `src/installer/__tests__/runtime-store.test.ts` |

**unit: rewritten-self-consistent-local-runtime-metadata-cannot-replace-policy-inventory-digest**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | rewritten self consistent receipt and inventory cannot replace independent pinned hashes | `src/installer/__tests__/runtime-store.test.ts` |

**unit: resolver-does-no-mkdir-download-lock-selection-db-or-provider-work**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | resolver performs only runtime reads without downloads allocation locks or application traversal | `src/installer/__tests__/runtime-store.test.ts` |

**unit: runtime-caps-and-cancellation-are-finite-and-do-not-trigger-app-or-Ollama-hashing**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | resolver bounds metadata and stops at cancellation without scanning application or Ollama data | `src/installer/__tests__/runtime-store.test.ts` |

**unit: runtime-rejection-matrix-proves-positive-baseline-and-exact-diagnostic-for-each-mutation**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | resolver rejects corrupt receipts inventories files modes targets aliases and extra members | `src/installer/__tests__/runtime-store.test.ts` |
| pass | strict POSIX runtime protection preserves pinned bytes and rejects every write or execute mode drift | `src/installer/__tests__/runtime-store.test.ts` |
| pass | rewritten self consistent receipt and inventory cannot replace independent pinned hashes | `src/installer/__tests__/runtime-store.test.ts` |

**unit: posix-runtime-protection-preserves-pinned-inventory-and-rejects-write-bits-or-execute-drift**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | strict POSIX runtime protection preserves pinned bytes and rejects every write or execute mode drift | `src/installer/__tests__/runtime-store.test.ts` |
| pass | verifier lanes reject mixed layouts and never grant canonical paths from a weaker flag | `src/installer/__tests__/runtime-store.test.ts` |

**unit: runtime-manual-unfinished-and-development-layout-diagnostics-preserve-entries-with-safe-path-guidance**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | verifier lanes reject mixed layouts and never grant canonical paths from a weaker flag | `src/installer/__tests__/runtime-store.test.ts` |
| pass | manual runtime diagnostics preserve corrupt entries and quote spaces Unicode and apostrophes safely | `src/installer/__tests__/runtime-store.test.ts` |

**integration: shared-runtime-fixture-cleanup-restores-owned-directory-write-after-positive-closure**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | owned runtime cleanup restores directory write only after positive resource and child closure | `src/installer/__tests__/owned-runtime-home.test.ts` |
| pass | owned runtime cleanup unlinks only declared fixture links without touching external targets | `src/installer/__tests__/owned-runtime-home.test.ts` |
| pass | owned runtime cleanup retains a root with an undeclared symlink before chmod | `src/installer/__tests__/owned-runtime-home.test.ts` |
| pass | owned runtime cleanup refuses replacement roots and never adopts a caller path | `src/installer/__tests__/owned-runtime-home.test.ts` |
| pass | owned runtime cleanup retains failed resource closure and explicit uncertainty | `src/installer/__tests__/owned-runtime-home.test.ts` |
| pass | owned runtime cleanup is awaited for a partially allocated protected fixture | `src/installer/__tests__/owned-runtime-home.test.ts` |
| pass | owned runtime cleanup retains unconfirmed resources after its bounded wait | `src/installer/__tests__/owned-runtime-home.test.ts` |
| pass | owned runtime cleanup bounds traversal before changing protected directory modes | `src/installer/__tests__/owned-runtime-home.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/installer/__tests__/owned-runtime-home.test.ts` | 0 | 8 | 5.3 s |  |
| `src/installer/__tests__/runtime-store.test.ts` | 0 | 9 | 150.6 s |  |

## t3

Run at 2026-11-28T11:16:33.816Z on commit `30ad3cc68`. Tests check: **passed**. 21 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: runtime-acquisition-checks-official-HTTPS-byte-hash-deadline-before-safe-extraction**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | runtime staging authenticates official assets and leaves only an owned unselected candidate | `src/installer/__tests__/runtime-acquire.test.ts` |
| pass | runtime download rejects HTTP redirects sizes and digest failures before extracting code | `src/installer/__tests__/runtime-acquire.test.ts` |
| pass | runtime download deadline expires before extraction and closes input before cleanup | `src/installer/__tests__/runtime-acquire.test.ts` |
| pass | ordinary installer imports and action deadlines ignore every ambient qualification selector | `src/installer/__tests__/production-deadlines.test.ts` |
| pass | explicit trusted qualification admission preserves bounded runtime and manager deadlines | `src/installer/__tests__/production-deadlines.test.ts` |
| pass | slow-vm-runtime-download-verification-and-decoder-drain-have-no-hidden-normal-cap | `src/installer/__tests__/qualification-runtime.test.ts` |
| pass | normal-runtime-identity-inventory-worker-wire-and-controller-schema-remain-unchanged | `src/installer/__tests__/qualification-runtime.test.ts` |

**integration: runtime-stage-cancellation-closes-owned-network-parser-actors-before-cleanup**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | runtime staging authenticates official assets and leaves only an owned unselected candidate | `src/installer/__tests__/runtime-acquire.test.ts` |
| pass | runtime acquisition deadline during extraction closes output before owned cleanup | `src/installer/__tests__/runtime-acquire.test.ts` |
| pass | runtime cancellation waits for output closure before owned stage cleanup | `src/installer/__tests__/runtime-acquire.test.ts` |
| pass | runtime download cancellation waits for the actual input stream close before cleanup | `src/installer/__tests__/runtime-acquire.test.ts` |
| pass | unresponsive runtime transport returns bounded uncertainty and retains its stage | `src/installer/__tests__/runtime-acquire.test.ts` |
| pass | runtime close uncertainty retains the stage even when cancellation also occurs | `src/installer/__tests__/runtime-acquire.test.ts` |
| pass | runtime discard restores protected directories only under its original closed stage capability | `src/installer/__tests__/runtime-acquire.test.ts` |
| pass | runtime discard retains a linked stage without chmodding an external runtime | `src/installer/__tests__/runtime-acquire.test.ts` |
| pass | runtime discard retains protected data if the original owner is lost after admission | `src/installer/__tests__/runtime-acquire.test.ts` |
| pass | runtime discard retains a stage marked uncertain after cleanup admission | `src/installer/__tests__/runtime-acquire.test.ts` |
| pass | profile-never-waives-positive-resource-or-process-closure | `src/installer/__tests__/qualification-runtime.test.ts` |

**integration: runtime-profile-rejects-unsafe-archive-collisions-links-and-missing-header-library-inputs**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Windows archive profiles require exact separate headers and architecture libraries | `src/installer/__tests__/runtime-acquire.test.ts` |
| pass | runtime gzip and ZIP parsers reject unsafe collisions links special entries and incomplete profiles | `src/installer/__tests__/runtime-acquire.test.ts` |
| pass | runtime staging authenticates official assets and leaves only an owned unselected candidate | `src/installer/__tests__/runtime-acquire.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/installer/__tests__/production-deadlines.test.ts` | 0 | 2 | 2.1 s |  |
| `src/installer/__tests__/qualification-runtime.test.ts` | 0 | 3 | 1.7 s |  |
| `src/installer/__tests__/runtime-acquire.test.ts` | 0 | 14 | 189 s |  |

## t4

Run at 2026-11-28T11:55:19.408Z on commit `50245f18a`. Tests check: **passed**. 18 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: runtime-native-lock-exclusive-durable-no-replace-publication-and-offline-entry-reuse**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | runtime publication uses the native exclusive lock durable namespace and verified offline reuse | `src/installer/__tests__/runtime-install.test.ts` |
| pass | runtime publication never overwrites an incomplete destination and retains its stage | `src/installer/__tests__/runtime-install.test.ts` |

**integration: runtime-publication-rejects-stale-owner-and-conflicting-incomplete-entry**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | runtime install rejects old unsealed and mixed canonical layouts without repair or network | `src/installer/__tests__/runtime-install.test.ts` |
| pass | runtime publication never overwrites an incomplete destination and retains its stage | `src/installer/__tests__/runtime-install.test.ts` |
| pass | runtime publication rejects stale original owners and forged or tampered stages | `src/installer/__tests__/runtime-install.test.ts` |
| pass | runtime publication verifies staged bytes and cannot publish a modified executable | `src/installer/__tests__/runtime-install.test.ts` |

**integration: runtime-publication-stage-is-not-running-node-or-loaded-native-library**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | runtime publication stage is distinct from running Node and the loaded native library | `src/installer/__tests__/runtime-install.test.ts` |

**integration: posix-runtime-root-only-interrupted-publication-recovery-and-closed-stage-discard**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | runtime root-only interrupted native publication is retained and finalized offline by a later controller | `src/installer/__tests__/runtime-install.test.ts` |
| pass | runtime install rejects old unsealed and mixed canonical layouts without repair or network | `src/installer/__tests__/runtime-install.test.ts` |
| pass | runtime publication never overwrites an incomplete destination and retains its stage | `src/installer/__tests__/runtime-install.test.ts` |
| pass | runtime publication retains verifier close uncertainty and refuses later discard | `src/installer/__tests__/runtime-install.test.ts` |

**integration: native-runtime-publication-keeps-root-writable-until-rename-and-finishes-root-seal**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | runtime publication uses the native exclusive lock durable namespace and verified offline reuse | `src/installer/__tests__/runtime-install.test.ts` |
| pass | runtime root-only interrupted native publication is retained and finalized offline by a later controller | `src/installer/__tests__/runtime-install.test.ts` |
| pass | runtime publication retains a root sealed before failing final durability and never reports success | `src/installer/__tests__/runtime-install.test.ts` |

**integration: runtime-postpublication-uncertainty-and-canonical-stat-errors-are-coded-and-retained**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | runtime publication retains a root sealed before failing final durability and never reports success | `src/installer/__tests__/runtime-install.test.ts` |
| pass | runtime publication retains postpublication root close uncertainty until its captured descriptor closes | `src/installer/__tests__/runtime-install.test.ts` |
| pass | runtime canonical stat failures are actionable coded errors and never trigger download or mutation | `src/installer/__tests__/runtime-install.test.ts` |
| pass | runtime publication retains verifier close uncertainty and refuses later discard | `src/installer/__tests__/runtime-install.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/installer/__tests__/runtime-install.test.ts` | 0 | 11 | 481.4 s |  |

## t5

Run at 2026-11-28T06:35:35.180Z on commit `2f6bcaea7`. Tests check: **passed**. 20 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: bootstrap-no-host-node-verifies-archive-and-executable-before-execution**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | bootstrap authenticates archive executable and control bytes before running code and diagnoses prerequisites | `src/installer/__tests__/bootstrap.test.ts` |
| pass | bootstrap uses real native publication exact helper exit and a fresh manager lock without host Node | `src/installer/__tests__/bootstrap.test.ts` |
| pass | private runtime and PowerShell source preserve pinned policy nonmoving execution and fresh admission | `src/installer/__tests__/bootstrap.test.ts` |
| pass | bootstrap authenticates all canonical executable and control assets after publication | `src/installer/__tests__/bootstrap.test.ts` |

**integration: bootstrap-native-operation-lock-exclusive-publication-exact-helper-exit-then-fresh-manager-lock**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | bootstrap uses real native publication exact helper exit and a fresh manager lock without host Node | `src/installer/__tests__/bootstrap.test.ts` |
| pass | concurrent terminal bootstraps keep one native owner and publish one immutable foundation | `src/installer/__tests__/bootstrap.test.ts` |

**integration: bootstrap-publication-stage-distinct-from-running-node-and-loaded-native-library**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | bootstrap uses real native publication exact helper exit and a fresh manager lock without host Node | `src/installer/__tests__/bootstrap.test.ts` |
| pass | private runtime and PowerShell source preserve pinned policy nonmoving execution and fresh admission | `src/installer/__tests__/bootstrap.test.ts` |
| pass | runtime publication stage is distinct from running Node and the loaded native library | `src/installer/__tests__/runtime-install.test.ts` |

**integration: runtime-stage-cancellation-conflict-and-uncertain-closure-retain-safe-state**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | bootstrap preserves incomplete immutable entries and lock conflicts without installation | `src/installer/__tests__/bootstrap.test.ts` |
| pass | bootstrap cancellation closes its publication child before cleanup and never launches the manager | `src/installer/__tests__/bootstrap.test.ts` |
| pass | concurrent terminal bootstraps keep one native owner and publish one immutable foundation | `src/installer/__tests__/bootstrap.test.ts` |
| pass | bootstrap control close uncertainty is bounded and retains the only owned publication stage | `src/installer/__tests__/bootstrap-control.test.ts` |
| pass | bootstrap control late cancellation during positive close cannot report successful reuse | `src/installer/__tests__/bootstrap-control.test.ts` |
| pass | runtime publication retains verifier close uncertainty and refuses later discard | `src/installer/__tests__/runtime-install.test.ts` |

**integration: bootstrap-verified-cached-runtime-control-offline-with-host-node-trap-and-quoted-paths**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | bootstrap reuses verified cached runtime and control offline with quoted Unicode paths | `src/installer/__tests__/bootstrap.test.ts` |
| pass | POSIX terminal I O and fixture TUI use the canonical runtime after helper exit | `src/installer/__tests__/bootstrap.test.ts` |
| pass | private runtime and PowerShell source preserve pinned policy nonmoving execution and fresh admission | `src/installer/__tests__/bootstrap.test.ts` |
| pass | bootstrap canonicalizes trailing and repeated separators before publication and cached reuse | `src/installer/__tests__/bootstrap.test.ts` |
| pass | bootstrap refuses tampered cached bootstrap and native control offline before helper execution | `src/installer/__tests__/bootstrap.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/installer/__tests__/bootstrap-control.test.ts` | 0 | 4 | 5.5 s |  |
| `src/installer/__tests__/bootstrap.test.ts` | 0 | 11 | 359.2 s |  |
| `src/installer/__tests__/runtime-install.test.ts` | 0 | 6 | 135 s |  |

## t6

Run at 2026-11-26T23:37:45.573Z on commit `41954c71d`. Tests check: **passed**. 14 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: bundle-descriptor2-application-only-public-manifest1-and-legacy-descriptor-diagnostic**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | bundle descriptor2 and installed receipts preserve public manifest1 and reject embedded format1 | `src/installer/__tests__/bundle.test.ts` |
| pass | hostile ZIP corpus cannot escape staging or exceed bounded extraction | `src/installer/__tests__/bundle.test.ts` |
| pass | download digest target runtime cancellation and retry preserve incumbent | `src/installer/__tests__/bundle.test.ts` |

**integration: publisher-app-and-IDE-inventory-exclude-Node-Ollama-distributions-and-archives-including-renamed-contributions**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | app-only inventory rejects ordinary and renamed pinned Node Ollama archives executables and build inputs | `src/installer/__tests__/application-payload.test.ts` |
| pass | app-only inventory permits native application dependencies and runtime policy metadata | `src/installer/__tests__/application-payload.test.ts` |
| pass | publisher format2 binds app-only inventory public manifest1 source and exact external runtime identity | `src/installer/__tests__/publisher.test.ts` |
| pass | publisher rejects a real pinned Node archive even when renamed as an application resource | `src/installer/__tests__/publisher.test.ts` |
| pass | publisher source provenance excludes renamed runtime inputs and preserves native dependency contributions | `src/installer/__tests__/publisher.test.ts` |
| pass | published manual and both IDE installer script assets have exact byte parity | `src/installer/__tests__/publisher.test.ts` |
| pass | payload collector snapshots complete internal native build hardlink pairs without mutating source | `src/installer/__tests__/payload-source-links.test.ts` |
| pass | payload collector rejects unaccounted hardlink aliases inside or outside the source root | `src/installer/__tests__/payload-source-links.test.ts` |
| pass | payload collector does not count repeated directory symlink paths as distinct inode aliases | `src/installer/__tests__/payload-source-links.test.ts` |
| pass | payload collector rejects alias or content changes after collecting the complete hardlink group | `src/installer/__tests__/payload-source-links.test.ts` |

**integration: bundle-publisher-probes-use-shared-external-runtime-without-tools-node-copy**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | assemble actual complete foundation payload only after all entrypoints exist | `src/installer/__tests__/foundation-payload.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/installer/__tests__/application-payload.test.ts` | 0 | 3 | 0.5 s |  |
| `src/installer/__tests__/bundle.test.ts` | 0 | 5 | 83.5 s |  |
| `src/installer/__tests__/foundation-payload.test.ts` | 0 | 1 | 346.1 s |  |
| `src/installer/__tests__/payload-source-links.test.ts` | 0 | 4 | 0.7 s |  |
| `src/installer/__tests__/publisher.test.ts` | 0 | 8 | 2.9 s |  |

## t7

Run at 2026-11-26T15:21:56.575Z on commit `402d1db8c`. Tests check: **passed**. 13 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: private-dev-node-npm-headers-native-env-and-worker-source-closure-preserved**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | dev-private-node-and-explicit-npm-cli-work-with-no-host-npm-wrapper | `src/installer/__tests__/dev-toolchain.test.ts` |
| pass | dev-build-children-ignore-host-node-npm-and-preserve-explicit-cuda-setting | `src/installer/__tests__/dev-toolchain.test.ts` |
| pass | missing-or-mismatched-private-toolchain-headers-and-prerequisites-refuse-without-elevation | `src/installer/__tests__/dev-toolchain.test.ts` |
| pass | npm-build-fetch-and-native-probe-failure-preserve-incumbent | `src/installer/__tests__/dev-payload.test.ts` |
| pass | dev payload flushes its directory tree before prepared and fails closed on fsync error | `src/installer/__tests__/dev-payload.test.ts` |
| pass | preparation protocol binds paths source nonce run and bounded complete results | `src/installer/__tests__/dev-metadata.test.ts` |
| pass | native Python imports leave the private Node npm distribution unchanged | `src/installer/__tests__/dev-toolchain.test.ts` |

**integration: dev-receipt2-recipe-offer-compatibility-and-application-only-payload**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | dev receipt2 and recipe reject legacy embedded formats without changing public manifest1 | `src/installer/__tests__/dev-metadata.test.ts` |
| pass | dev-receipt-binds-final-manifest-inventory-and-contained-checkout-without-self-hash | `src/installer/__tests__/dev-metadata.test.ts` |
| pass | staged-dev-payload-requires-all-control-application-assets-and-external-runtime-and-clean-worker-result | `src/installer/__tests__/dev-payload.test.ts` |
| pass | immutable-dev-payload-tamper-or-existing-id-conflict-refuses-before-shutdown | `src/installer/__tests__/dev-payload.test.ts` |
| pass | durable legacy dev offer recovery preserves compatibility diagnostics without preparation or shutdown | `src/installer/__tests__/dev-manager.test.ts` |

**integration: dev-candidate-open-has-no-implicit-runtime-acquisition-or-foreign-directory-trust**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | dev candidate opening reuses the bundle runtime read-only and rejects missing runtime or foreign process | `src/installer/__tests__/dev-runtime.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/installer/__tests__/dev-manager.test.ts` | 0 | 7 | 189 s |  |
| `src/installer/__tests__/dev-metadata.test.ts` | 0 | 6 | 0.7 s |  |
| `src/installer/__tests__/dev-payload.test.ts` | 0 | 4 | 143.2 s |  |
| `src/installer/__tests__/dev-runtime.test.ts` | 0 | 1 | 33.9 s |  |
| `src/installer/__tests__/dev-toolchain.test.ts` | 0 | 4 | 209.2 s |  |

## t8

Run at 2026-11-26T19:21:41.423Z on commit `7e4100147`. Tests check: **passed**. 8 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: bundle-dev-manager-terminal-TUI-Retry-and-publisher-probes-use-shared-resolver**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | dev-common-handoff-selects-candidate-bootstrap-runtime-and-retains-mode | `src/installer/__tests__/installed-dev.test.ts` |
| pass | published-control-payload-includes-real-dependency-adapter-without-application-boot-imports | `src/installer/__tests__/production-peers.test.ts` |

**integration: status-readiness-and-control-checks-do-not-scan-full-app-Ollama-payload**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | dev candidate opening reuses the bundle runtime read-only and rejects missing runtime or foreign process | `src/installer/__tests__/dev-runtime.test.ts` |
| pass | prepared Ollama inspection reads completion records without walking or opening payload contents | `src/installer/__tests__/installed-status.test.ts` |
| pass | legal service fact publication during reconciliation preserves causal consistency and rejects persistent contradictions | `src/installer/__tests__/ollama-service-snapshot.test.ts` |
| pass | exit published during reconciliation rechecks surviving and closed endpoints before recording the terminal result | `src/installer/__tests__/ollama-service-snapshot.test.ts` |

**integration: installed-consumer-process-executable-and-manifest-identity-bound-to-real-resolver**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | dev-open-verify-and-fresh-manager-reopen-never-fetch-or-build | `src/installer/__tests__/installed-dev.test.ts` |
| pass | bundle-offer-receipt-and-required-sibling-admission-regressions-preserved | `src/installer/__tests__/installed-dev.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/installer/__tests__/dev-runtime.test.ts` | 0 | 1 | 31.4 s |  |
| `src/installer/__tests__/installed-dev.test.ts` | 0 | 3 | 105 s |  |
| `src/installer/__tests__/installed-status.test.ts` | 0 | 1 | 25.6 s |  |
| `src/installer/__tests__/ollama-service-snapshot.test.ts` | 0 | 2 | 102.2 s |  |
| `src/installer/__tests__/production-peers.test.ts` | 0 | 3 | 85.4 s |  |

## t9

Run at 2026-11-27T10:09:12.054Z on commit `888dfe714`. Tests check: **passed**. 0 pass, 0 fail, 0 skipped, 0 not found; 6 reported by the builder and not run by the gate.

the gate ran no test: every named test of this Task was reported by the builder

**smoke: descriptor2-and-dev-receipt2-application-only-with-public-manifest1-unchanged**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/standalone/complete-shared-external-node-runtime-foundation-E20261126446ae695/S001/evidence/t9.md#current-source-final-scoped-regression-and-independent-post-run-audit-pass; canonicalRoot=/private/tmp/.insrc/installer-validation-f607312b8; run=71b814b1-1d39-422d-9ccd-aa5108d3b5f0; source=a27375313b4518d0520c8f5c51ee9bdd80b3da5f; 57files/275PASS/0fail-cancel-skip-todo/incomplete=false; 66 matching closed groups, inner+outer strict confirmed cleanup; readonly post-run exact-coverage/fingerprint/closure audit PASS without rebuild; registered-repo input fingerprint equals isolated tested input a1f8d6dd56a77b5ae8555c6884f2df498ebc97cb99ed274dd9e50afb805577d6; original output not claimed tested; exact raw logs archived .insrc/tmp/runtime-foundation-t9-final-71b814b1.tar.gz SHA256 5212707abaa0542004770c5483109bf68a320e7bf29d93c84eb812806ec7f756; machine summary .insrc/tmp/runtime-foundation-t9-final-71b814b1.json

**smoke: legacy-embedded-runtime-formats-rejected-without-adoption**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/standalone/complete-shared-external-node-runtime-foundation-E20261126446ae695/S001/evidence/t9.md#current-source-final-scoped-regression-and-independent-post-run-audit-pass; canonicalRoot=/private/tmp/.insrc/installer-validation-f607312b8; run=71b814b1-1d39-422d-9ccd-aa5108d3b5f0; source=a27375313b4518d0520c8f5c51ee9bdd80b3da5f; 57files/275PASS/0fail-cancel-skip-todo/incomplete=false; 66 matching closed groups, inner+outer strict confirmed cleanup; readonly post-run exact-coverage/fingerprint/closure audit PASS without rebuild; registered-repo input fingerprint equals isolated tested input a1f8d6dd56a77b5ae8555c6884f2df498ebc97cb99ed274dd9e50afb805577d6; original output not claimed tested; exact raw logs archived .insrc/tmp/runtime-foundation-t9-final-71b814b1.tar.gz SHA256 5212707abaa0542004770c5483109bf68a320e7bf29d93c84eb812806ec7f756; machine summary .insrc/tmp/runtime-foundation-t9-final-71b814b1.json

**smoke: verified-runtime-and-control-reuse-offline-across-bundle-and-dev**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/standalone/complete-shared-external-node-runtime-foundation-E20261126446ae695/S001/evidence/t9.md#current-source-final-scoped-regression-and-independent-post-run-audit-pass; canonicalRoot=/private/tmp/.insrc/installer-validation-f607312b8; run=71b814b1-1d39-422d-9ccd-aa5108d3b5f0; source=a27375313b4518d0520c8f5c51ee9bdd80b3da5f; 57files/275PASS/0fail-cancel-skip-todo/incomplete=false; 66 matching closed groups, inner+outer strict confirmed cleanup; readonly post-run exact-coverage/fingerprint/closure audit PASS without rebuild; registered-repo input fingerprint equals isolated tested input a1f8d6dd56a77b5ae8555c6884f2df498ebc97cb99ed274dd9e50afb805577d6; original output not claimed tested; exact raw logs archived .insrc/tmp/runtime-foundation-t9-final-71b814b1.tar.gz SHA256 5212707abaa0542004770c5483109bf68a320e7bf29d93c84eb812806ec7f756; machine summary .insrc/tmp/runtime-foundation-t9-final-71b814b1.json

**smoke: S3-Ollama-consent-retention-agent-recommendations-and-install-only-Retry-preserved**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/standalone/complete-shared-external-node-runtime-foundation-E20261126446ae695/S001/evidence/t9.md#current-source-final-scoped-regression-and-independent-post-run-audit-pass; canonicalRoot=/private/tmp/.insrc/installer-validation-f607312b8; run=71b814b1-1d39-422d-9ccd-aa5108d3b5f0; source=a27375313b4518d0520c8f5c51ee9bdd80b3da5f; 57files/275PASS/0fail-cancel-skip-todo/incomplete=false; 66 matching closed groups, inner+outer strict confirmed cleanup; readonly post-run exact-coverage/fingerprint/closure audit PASS without rebuild; registered-repo input fingerprint equals isolated tested input a1f8d6dd56a77b5ae8555c6884f2df498ebc97cb99ed274dd9e50afb805577d6; original output not claimed tested; exact raw logs archived .insrc/tmp/runtime-foundation-t9-final-71b814b1.tar.gz SHA256 5212707abaa0542004770c5483109bf68a320e7bf29d93c84eb812806ec7f756; machine summary .insrc/tmp/runtime-foundation-t9-final-71b814b1.json

**smoke: terminal-install-success-ready-lock-release-same-terminal-TUI-and-failure-no-TUI-preserved**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/standalone/complete-shared-external-node-runtime-foundation-E20261126446ae695/S001/evidence/t9.md#current-source-final-scoped-regression-and-independent-post-run-audit-pass; canonicalRoot=/private/tmp/.insrc/installer-validation-f607312b8; run=71b814b1-1d39-422d-9ccd-aa5108d3b5f0; source=a27375313b4518d0520c8f5c51ee9bdd80b3da5f; 57files/275PASS/0fail-cancel-skip-todo/incomplete=false; 66 matching closed groups, inner+outer strict confirmed cleanup; readonly post-run exact-coverage/fingerprint/closure audit PASS without rebuild; registered-repo input fingerprint equals isolated tested input a1f8d6dd56a77b5ae8555c6884f2df498ebc97cb99ed274dd9e50afb805577d6; original output not claimed tested; exact raw logs archived .insrc/tmp/runtime-foundation-t9-final-71b814b1.tar.gz SHA256 5212707abaa0542004770c5483109bf68a320e7bf29d93c84eb812806ec7f756; machine summary .insrc/tmp/runtime-foundation-t9-final-71b814b1.json

**smoke: final-scoped-installer-publisher-bootstrap-dev-dependencies-terminal-regression**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/standalone/complete-shared-external-node-runtime-foundation-E20261126446ae695/S001/evidence/t9.md#current-source-final-scoped-regression-and-independent-post-run-audit-pass; canonicalRoot=/private/tmp/.insrc/installer-validation-f607312b8; run=71b814b1-1d39-422d-9ccd-aa5108d3b5f0; source=a27375313b4518d0520c8f5c51ee9bdd80b3da5f; 57files/275PASS/0fail-cancel-skip-todo/incomplete=false; 66 matching closed groups, inner+outer strict confirmed cleanup; readonly post-run exact-coverage/fingerprint/closure audit PASS without rebuild; registered-repo input fingerprint equals isolated tested input a1f8d6dd56a77b5ae8555c6884f2df498ebc97cb99ed274dd9e50afb805577d6; original output not claimed tested; exact raw logs archived .insrc/tmp/runtime-foundation-t9-final-71b814b1.tar.gz SHA256 5212707abaa0542004770c5483109bf68a320e7bf29d93c84eb812806ec7f756; machine summary .insrc/tmp/runtime-foundation-t9-final-71b814b1.json

## t10

Run at 2026-11-28T05:30:09.056Z on commit `9afcc4c63`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 2 reported by the builder and not run by the gate.

**live: UTM-macOS-fresh-live-acquisition-offline-reuse-and-isolated-installed-consumer-smoke**

Reported by the builder, not run by the gate: **pass**. Evidence: Retained actual UTM source2fca011a69ec3b0ce5e9e53e9074928baec02495: approved budget Story S001/evidence/t6-native-result.json, t6-supervisor.json and t6-audit.json; foundation S001/evidence/posix-20261128/macos-equivalence.json proves only separately validated controller tests differ from current production source.11/9/25 closed groups; live Node22.22.1/npm10.9.4, same-inode zero-network reuse and real installed native consumers; no daemon activation or release enablement.

**live: OrbStack-Linux-fresh-live-acquisition-native-build-and-offline-reuse-smoke**

Reported by the builder, not run by the gate: **pass**. Evidence: Foundation S001/evidence/posix-20261128/linux-native-result.json, linux-supervisor.json, linux-audit.json and linux-raw-metadata.json: actual OrbStack Ubuntu22.04.5/glibc2.35 ARM64 source0938af2dcbc631960d64946fa3cd6a446b3aafef; live Node22.22.1/npm10.9.4, same-inode zero-network reuse,55202-file app-only payload/native consumers/fresh manager;11/9/25 matching zero-exit closed groups, no actors/leases. Current production paths unchanged; source pin retained.

**live: unsupported-or-unavailable-target-is-not-enabled-by-cross-archive-metadata-or-foreign-tests**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | runtime policy pins all six official distribution identities without enabling targets | `src/installer/__tests__/runtime-policy.test.ts` |
| pass | native publication remains gated without exact target runtime and live qualification | `src/installer/__tests__/controller-store.test.ts` |
| pass | native publisher denies unqualified output before publishing target artifacts | `src/installer/__tests__/controller-store.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/installer/__tests__/controller-store.test.ts` | 0 | 7 | 1.8 s |  |
| `src/installer/__tests__/runtime-policy.test.ts` | 0 | 4 | 4.7 s |  |
