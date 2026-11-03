<!-- insrc:artifact TESTS-17123b6d304af2a2-s3 -->

# Tests: 17123b6d304af2a2 s3

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 108 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-11-03T12:09:27.140Z on commit `0604e8443`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**smoke: store-runtime-package-qualification**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | packed-isolated-node22-consumer | `packages/project-memory/src/__tests__/packed.test.ts` |
| pass | tarball-public-dependency-and-asset-allowlist | `packages/project-memory/src/__tests__/packed.test.ts` |

**smoke: store-existing-packed-allowlists-and-native-absence**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | tarball-public-dependency-and-asset-allowlist | `packages/project-memory/src/__tests__/packed.test.ts` |
| pass | packed-native-missing-import-versus-open | `packages/project-memory/src/__tests__/packed.test.ts` |
| pass | packed-lance-dependency-stays-lazy-on-import | `packages/project-memory/src/__tests__/packed.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `packages/project-memory/src/__tests__/packed.test.ts` | 0 | 5 | 18.4 s |  |

## t2

Run at 2026-11-03T12:32:31.653Z on commit `6028061ce`. Tests check: **passed**. 9 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: store-row-codec-and-effect-reservations**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | store-codec-canonical-roundtrip-all-row-kinds | `packages/project-memory/src/__tests__/store-codec.test.ts` |
| pass | store-codec-reserves-bounded-immutable-effect-batches | `packages/project-memory/src/__tests__/store-codec.test.ts` |
| pass | store-codec-qualified-identities-and-explicit-arrow-schema | `packages/project-memory/src/__tests__/store-codec.test.ts` |

**unit: store-persisted-payload-v1-required-fields**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | store-codec-rejects-missing-extra-and-duplicated-envelope-fields | `packages/project-memory/src/__tests__/store-codec.test.ts` |
| pass | store-codec-validates-nested-lineage-outcomes-and-source-shapes | `packages/project-memory/src/__tests__/store-codec.test.ts` |

**unit: store-embedding-normalization-profile-v1**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | store-codec-vector-bearing-plan-requires-compatible-embedding-metadata | `packages/project-memory/src/__tests__/store-codec.test.ts` |
| pass | store-embedding-profile-preserves-text-and-converts-float32-once | `packages/project-memory/src/__tests__/store-embedding-profile.test.ts` |
| pass | store-embedding-profile-rejects-missing-or-mismatched-metadata | `packages/project-memory/src/__tests__/store-embedding-profile.test.ts` |
| pass | store-embedding-profile-rejects-unsafe-text-and-vectors | `packages/project-memory/src/__tests__/store-embedding-profile.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `packages/project-memory/src/__tests__/store-codec.test.ts` | 0 | 6 | 0.6 s |  |
| `packages/project-memory/src/__tests__/store-embedding-profile.test.ts` | 0 | 3 | 0.4 s |  |

## t3

Run at 2026-11-03T12:58:15.256Z on commit `5cd990bd1`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: store-runtime-package-qualification**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | native-store-primitives-process-crash-and-runtime-qualification | `packages/project-memory/src/__tests__/store-native.test.ts` |

**integration: store-one-mutation-effects-receipt-generation**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | native-store-primitives-process-crash-and-runtime-qualification | `packages/project-memory/src/__tests__/store-native.test.ts` |

**integration: store-null-vectors-version-pinned-reads**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | native-store-primitives-process-crash-and-runtime-qualification | `packages/project-memory/src/__tests__/store-native.test.ts` |

**integration: store-macos-apfs-linux-ext4-qualification**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | native-store-primitives-process-crash-and-runtime-qualification | `packages/project-memory/src/__tests__/store-native.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `packages/project-memory/src/__tests__/store-native.test.ts` | 0 | 1 | 4 s |  |

## t4

Run at 2026-11-03T13:39:59.021Z on commit `ad4f1b289`. Tests check: **passed**. 11 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: store-directory-separation-and-no-empty-replacement**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | store-initialization-fresh-profile-and-read-only-reopen | `packages/project-memory/src/__tests__/store-initialization.test.ts` |
| pass | store-initialization-refuses-queue-only-and-unknown-roots-without-replacement | `packages/project-memory/src/__tests__/store-initialization.test.ts` |
| pass | store-initialization-never-replaces-ready-store-with-missing-control-or-extra-table | `packages/project-memory/src/__tests__/store-initialization.test.ts` |
| pass | store-initialization-validates-pending-markers-and-native-directory-identity | `packages/project-memory/src/__tests__/store-initialization.test.ts` |
| pass | store-initialization-gates-real-queue-recovery-on-validated-authority | `packages/project-memory/src/__tests__/store-initialization.test.ts` |

**integration: store-startup-rollback-every-open-boundary**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | store-initialization-resumes-only-recognized-generation-zero | `packages/project-memory/src/__tests__/store-initialization.test.ts` |
| pass | store-initialization-rolls-back-each-acquired-native-resource | `packages/project-memory/src/__tests__/store-initialization.test.ts` |
| pass | store-initialization-unverified-close-is-explicit-and-owner-stays-held | `packages/project-memory/src/__tests__/store-initialization.test.ts` |

**integration: store-embedding-profile-reopen-plan-query-compatibility**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | store-initialization-preserves-missing-corrupt-and-mismatched-profile-data | `packages/project-memory/src/__tests__/store-initialization.test.ts` |
| pass | store-initialization-reopened-profile-prepares-matching-plan-and-native-query | `packages/project-memory/src/__tests__/store-initialization.test.ts` |
| pass | store-initialization-gates-real-queue-recovery-on-validated-authority | `packages/project-memory/src/__tests__/store-initialization.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `packages/project-memory/src/__tests__/store-initialization.test.ts` | 0 | 10 | 7.4 s |  |

## t5

Run at 2026-11-03T13:57:17.082Z on commit `43b310c1b`. Tests check: **passed**. 16 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: store-row-codec-and-effect-reservations**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | store-plan-snapshots-bounds-protected-kinds-frame-and-profile | `packages/project-memory/src/__tests__/store-guards.test.ts` |

**unit: store-scope-epoch-predicate-escaping**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | store-plan-scope-epoch-predicates-never-interpolate-untrusted-text | `packages/project-memory/src/__tests__/store-guards.test.ts` |

**unit: store-revision-tombstone-reference-guards**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | store-plan-exact-generation-predecessor-reference-and-history-guards | `packages/project-memory/src/__tests__/store-guards.test.ts` |
| pass | store-plan-source-provenance-span-authority-and-evidence-sets | `packages/project-memory/src/__tests__/store-guards.test.ts` |
| pass | store-plan-exact-tombstones-supersession-and-no-effect-dispositions | `packages/project-memory/src/__tests__/store-guards.test.ts` |
| pass | store-plan-paired-supersession-is-atomic-and-acyclic | `packages/project-memory/src/__tests__/store-guards.test.ts` |
| pass | store-plan-logical-forget-requires-exact-monotone-marker | `packages/project-memory/src/__tests__/store-guards.test.ts` |

**unit: store-persisted-payload-v1-required-fields**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | store-plan-snapshots-bounds-protected-kinds-frame-and-profile | `packages/project-memory/src/__tests__/store-guards.test.ts` |
| pass | store-plan-source-provenance-span-authority-and-evidence-sets | `packages/project-memory/src/__tests__/store-guards.test.ts` |

**unit: store-lifecycle-transition-matrix**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | store-plan-lifecycle-complete-matrix-and-reason-constraints | `packages/project-memory/src/__tests__/store-guards.test.ts` |
| pass | store-plan-carried-evidence-preserves-vectors-and-complete-lineage | `packages/project-memory/src/__tests__/store-guards.test.ts` |
| pass | store-plan-paired-supersession-is-atomic-and-acyclic | `packages/project-memory/src/__tests__/store-guards.test.ts` |
| pass | store-plan-logical-forget-requires-exact-monotone-marker | `packages/project-memory/src/__tests__/store-guards.test.ts` |

**unit: store-embedding-profile-reopen-plan-query-compatibility**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | store-plan-snapshots-bounds-protected-kinds-frame-and-profile | `packages/project-memory/src/__tests__/store-guards.test.ts` |
| pass | store-plan-carried-evidence-preserves-vectors-and-complete-lineage | `packages/project-memory/src/__tests__/store-guards.test.ts` |
| pass | store-initialization-reopened-profile-prepares-matching-plan-and-native-query | `packages/project-memory/src/__tests__/store-initialization.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `packages/project-memory/src/__tests__/store-guards.test.ts` | 0 | 9 | 0.4 s |  |
| `packages/project-memory/src/__tests__/store-initialization.test.ts` | 0 | 10 | 6.6 s |  |

## t6

Run at 2026-11-03T14:13:08.824Z on commit `40b1b5ab1`. Tests check: **passed**. 9 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: store-one-mutation-effects-receipt-generation**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | store-writer-one-version-complete-effects-receipt-root-and-cold-replay | `packages/project-memory/src/__tests__/store-writer.test.ts` |
| pass | store-writer-no-effect-failure-and-quarantine-are-atomic-and-immutable | `packages/project-memory/src/__tests__/store-writer.test.ts` |
| pass | store-writer-cleanup-pending-is-logical-protection-with-one-atomic-proof | `packages/project-memory/src/__tests__/store-writer.test.ts` |

**integration: store-generation-revision-conflicts-and-exact-retry**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | store-writer-one-version-complete-effects-receipt-root-and-cold-replay | `packages/project-memory/src/__tests__/store-writer.test.ts` |
| pass | store-writer-serial-generation-revisions-conflicts-and-retained-identity | `packages/project-memory/src/__tests__/store-writer.test.ts` |
| pass | store-writer-bounds-admission-before-copy-and-drains-admitted-retries | `packages/project-memory/src/__tests__/store-writer.test.ts` |

**integration: store-native-uncertain-writes-fence**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | store-writer-native-rejection-fences-until-verified-close-and-reopen | `packages/project-memory/src/__tests__/store-writer.test.ts` |
| pass | store-writer-timeout-retains-lane-native-work-and-owner-through-close | `packages/project-memory/src/__tests__/store-writer.test.ts` |
| pass | store-writer-unverifiable-outcome-retains-process-owner-and-refuses-cold-corruption | `packages/project-memory/src/__tests__/store-writer.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `packages/project-memory/src/__tests__/store-writer.test.ts` | 0 | 8 | 6.7 s |  |

## t7

Run at 2026-11-03T14:35:41.123Z on commit `38bc67cfe`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: store-proof-port-retained-and-recycled**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | store-proof-real-queue-retained-ack-recycle-and-cold-authority | `packages/project-memory/src/__tests__/store-receipts.test.ts` |
| pass | store-proof-real-queue-rejects-retained-pending-and-terminal-conflicts | `packages/project-memory/src/__tests__/store-receipts.test.ts` |
| pass | store-proof-scope-epoch-and-projection-do-not-leak-domain-content | `packages/project-memory/src/__tests__/store-receipts.test.ts` |
| pass | store-proof-unavailable-duplicate-malformed-and-missing-authority-never-become-absent | `packages/project-memory/src/__tests__/store-receipts.test.ts` |
| pass | retained-identity-rejects-conflicting-authoritative-receipt | `packages/project-memory/src/__tests__/queue-retirement.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `packages/project-memory/src/__tests__/queue-retirement.test.ts` | 0 | 6 | 4.7 s |  |
| `packages/project-memory/src/__tests__/store-receipts.test.ts` | 0 | 4 | 4.9 s |  |

## t8

Run at 2026-11-03T14:57:31.085Z on commit `ef702f35b`. Tests check: **passed**. 12 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: store-revision-tombstone-reference-guards**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | store-barriers-exact-memory-source-subject-protect-qualified-lineage-without-broadening | `packages/project-memory/src/__tests__/store-barriers.test.ts` |
| pass | store-barriers-new-frame-cannot-carry-evidence-from-a-closed-source-lifecycle | `packages/project-memory/src/__tests__/store-barriers.test.ts` |
| pass | store-barriers-control-syntax-scope-and-frame-authority-fail-before-mutation | `packages/project-memory/src/__tests__/store-barriers.test.ts` |

**integration: store-broad-forget-selector-and-closed-lifecycle**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | store-barriers-selectors-distinguish-source-lifecycle-visibility-producer-and-project | `packages/project-memory/src/__tests__/store-barriers.test.ts` |
| pass | store-barriers-higher-sequence-stays-closed-and-only-host-registered-new-lifecycle-resumes | `packages/project-memory/src/__tests__/store-barriers.test.ts` |

**integration: store-replay-forget-no-resurrection-scoped**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | store-barriers-unseen-pending-plans-terminalize-without-effects-after-broad-forget | `packages/project-memory/src/__tests__/store-barriers.test.ts` |
| pass | store-barriers-exact-memory-source-subject-protect-qualified-lineage-without-broadening | `packages/project-memory/src/__tests__/store-barriers.test.ts` |

**integration: store-broad-forget-unseen-pending-event**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | store-barriers-unseen-pending-plans-terminalize-without-effects-after-broad-forget | `packages/project-memory/src/__tests__/store-barriers.test.ts` |

**integration: store-forget-after-plan-before-commit**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | store-barriers-unseen-pending-plans-terminalize-without-effects-after-broad-forget | `packages/project-memory/src/__tests__/store-barriers.test.ts` |
| pass | store-barriers-new-frame-cannot-carry-evidence-from-a-closed-source-lifecycle | `packages/project-memory/src/__tests__/store-barriers.test.ts` |

**integration: store-closed-lifecycle-explicit-new-activity**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | store-barriers-higher-sequence-stays-closed-and-only-host-registered-new-lifecycle-resumes | `packages/project-memory/src/__tests__/store-barriers.test.ts` |
| pass | store-barriers-selectors-distinguish-source-lifecycle-visibility-producer-and-project | `packages/project-memory/src/__tests__/store-barriers.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `packages/project-memory/src/__tests__/store-barriers.test.ts` | 0 | 7 | 8.6 s |  |

## t9

Run at 2026-11-03T16:09:45.971Z on commit `6a9165318`. Tests check: **passed**. 14 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: store-scope-epoch-predicate-escaping**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | store-reads-scope-subsets-epoch-and-sql-like-qualifiers-stay-isolated | `packages/project-memory/src/__tests__/store-reads.test.ts` |
| pass | store-reads-binding-change-during-projection-is-rechecked-before-return | `packages/project-memory/src/__tests__/store-reads.test.ts` |
| pass | store-reads-cold-filter-column-corruption-cannot-hide-content-or-protection | `packages/project-memory/src/__tests__/store-reads.test.ts` |

**integration: store-null-vectors-version-pinned-reads**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | store-reads-scalar-snapshot-is-bound-pinned-and-consumed-without-native-handle | `packages/project-memory/src/__tests__/store-reads.test.ts` |
| pass | store-reads-mixed-null-vectors-use-distinct-pinned-handles-and-reject-cross-instance-leases | `packages/project-memory/src/__tests__/store-reads.test.ts` |

**integration: store-reader-expiry-delete-race**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | store-reads-concurrent-forget-and-generation-change-discard-pinned-old-content | `packages/project-memory/src/__tests__/store-reads.test.ts` |
| pass | store-reads-binding-change-during-projection-is-rechecked-before-return | `packages/project-memory/src/__tests__/store-reads.test.ts` |
| pass | store-reads-time-boundaries-expire-sources-without-a-generation-change | `packages/project-memory/src/__tests__/store-reads.test.ts` |
| pass | store-reads-future-validity-is-published-as-a-cache-boundary | `packages/project-memory/src/__tests__/store-reads.test.ts` |
| pass | store-reads-lease-cap-idempotent-release-idle-expiry-and-active-deadline | `packages/project-memory/src/__tests__/store-reads.test.ts` |
| pass | store-reads-result-reference-and-byte-overflow-return-no-truncated-projection | `packages/project-memory/src/__tests__/store-reads.test.ts` |
| pass | store-reads-cleanup-wait-cannot-return-forgotten-rebound-expired-or-overdue-content | `packages/project-memory/src/__tests__/store-reads.test.ts` |

**integration: store-embedding-profile-reopen-plan-query-compatibility**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | store-reads-profile-query-text-float32-and-cold-current-projection-agree | `packages/project-memory/src/__tests__/store-reads.test.ts` |
| pass | store-reads-scalar-snapshot-is-bound-pinned-and-consumed-without-native-handle | `packages/project-memory/src/__tests__/store-reads.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `packages/project-memory/src/__tests__/store-reads.test.ts` | 0 | 12 | 5.1 s |  |

## t10

Run at 2026-11-03T16:35:37.180Z on commit `eb6afe27e`. Tests check: **passed**. 16 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: store-proof-port-retained-and-recycled**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | store-proof-real-queue-retained-ack-recycle-and-cold-authority | `packages/project-memory/src/__tests__/store-receipts.test.ts` |
| pass | production-store-queue-process-crash-replay-and-forget-qualification | `packages/project-memory/src/__tests__/store-crash.test.ts` |

**integration: store-one-mutation-effects-receipt-generation**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | production-store-queue-process-crash-replay-and-forget-qualification | `packages/project-memory/src/__tests__/store-crash.test.ts` |

**integration: store-generation-revision-conflicts-and-exact-retry**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | store-writer-serial-generation-revisions-conflicts-and-retained-identity | `packages/project-memory/src/__tests__/store-writer.test.ts` |
| pass | production-store-queue-process-crash-replay-and-forget-qualification | `packages/project-memory/src/__tests__/store-crash.test.ts` |

**integration: store-replay-forget-no-resurrection-scoped**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | production-store-queue-process-crash-replay-and-forget-qualification | `packages/project-memory/src/__tests__/store-crash.test.ts` |

**integration: store-reader-expiry-delete-race**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | store-reads-cleanup-wait-cannot-return-forgotten-rebound-expired-or-overdue-content | `packages/project-memory/src/__tests__/store-reads.test.ts` |
| pass | production-store-queue-process-crash-replay-and-forget-qualification | `packages/project-memory/src/__tests__/store-crash.test.ts` |

**integration: store-native-uncertain-writes-fence**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | store-writer-timeout-retains-lane-native-work-and-owner-through-close | `packages/project-memory/src/__tests__/store-writer.test.ts` |
| pass | store-writer-native-rejection-fences-until-verified-close-and-reopen | `packages/project-memory/src/__tests__/store-writer.test.ts` |
| pass | production-store-queue-process-crash-replay-and-forget-qualification | `packages/project-memory/src/__tests__/store-crash.test.ts` |

**integration: store-commit-kill-before-after-receipt-ack**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | production-store-queue-process-crash-replay-and-forget-qualification | `packages/project-memory/src/__tests__/store-crash.test.ts` |

**integration: store-broad-forget-unseen-pending-event**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | production-store-queue-process-crash-replay-and-forget-qualification | `packages/project-memory/src/__tests__/store-crash.test.ts` |

**integration: store-forget-after-plan-before-commit**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | production-store-queue-process-crash-replay-and-forget-qualification | `packages/project-memory/src/__tests__/store-crash.test.ts` |

**integration: store-macos-apfs-linux-ext4-qualification**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | store-macos-apfs-linux-ext4-production-evidence-matches-current-source | `src/shared/__tests__/project-memory-platform-evidence.test.ts` |
| pass | production-store-queue-process-crash-replay-and-forget-qualification | `packages/project-memory/src/__tests__/store-crash.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `packages/project-memory/src/__tests__/store-crash.test.ts` | 0 | 1 | 11.3 s |  |
| `packages/project-memory/src/__tests__/store-reads.test.ts` | 0 | 12 | 9 s |  |
| `packages/project-memory/src/__tests__/store-receipts.test.ts` | 0 | 4 | 7.9 s |  |
| `packages/project-memory/src/__tests__/store-writer.test.ts` | 0 | 8 | 2.7 s |  |
| `src/shared/__tests__/project-memory-platform-evidence.test.ts` | 0 | 1 | 1 s |  |

## t11

Run at 2026-11-03T16:41:37.530Z on commit `34419fe94`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: store-admitted-provenance-v1-derivation**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | store-admission-real-queue-derived-redacted-hash-time-and-deterministic-terminal-retries | `packages/project-memory/src/__tests__/store-admission.test.ts` |
| pass | store-plan-source-provenance-span-authority-and-evidence-sets | `packages/project-memory/src/__tests__/store-guards.test.ts` |

**integration: store-closed-lifecycle-explicit-new-activity**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | store-admission-host-registered-new-source-lifecycle-is-required-after-forget | `packages/project-memory/src/__tests__/store-admission.test.ts` |

**integration: store-admission-policy-wrapper-through-real-queue**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | store-admission-real-queue-derived-redacted-hash-time-and-deterministic-terminal-retries | `packages/project-memory/src/__tests__/store-admission.test.ts` |
| pass | store-admission-attestation-envelope-size-and-verified-time-fail-before-persist | `packages/project-memory/src/__tests__/store-admission.test.ts` |

**integration: store-public-submit-module-errors-outside-policy-catch**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | store-admission-public-submit-protected-input-and-host-errors-preserve-queue-bytes | `packages/project-memory/src/__tests__/store-admission.test.ts` |
| pass | store-admission-real-queue-derived-redacted-hash-time-and-deterministic-terminal-retries | `packages/project-memory/src/__tests__/store-admission.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `packages/project-memory/src/__tests__/store-admission.test.ts` | 0 | 4 | 2.1 s |  |
| `packages/project-memory/src/__tests__/store-guards.test.ts` | 0 | 9 | 0.5 s |  |
