<!-- insrc:artifact TESTS-17123b6d304af2a2-s2 -->

# Tests: 17123b6d304af2a2 s2

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 54 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

## t1

Run at 2026-11-02T11:39:57.149Z on commit `2688289f7`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: canonical-json-frame-length-checksum-and-bounded-decoding**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | canonical-json-frame-length-checksum-and-bounded-decoding | `packages/project-memory/src/__tests__/queue-codec.test.ts` |

**unit: immutable-policy-snapshot-before-persistence**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | immutable-policy-snapshot-before-persistence | `packages/project-memory/src/__tests__/queue-codec.test.ts` |

**unit: scoped-identity-exact-retry-and-conflicting-reuse**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | scoped-identity-exact-retry-and-conflicting-reuse | `packages/project-memory/src/__tests__/queue-codec.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `packages/project-memory/src/__tests__/queue-codec.test.ts` | 0 | 3 | 0.7 s |  |

## t2

Run at 2026-11-02T07:07:03.756Z on commit `e66611df5`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: owned-bootstrap-short-write-and-directory-sync**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | owned-bootstrap-short-write-and-directory-sync | `packages/project-memory/src/__tests__/queue-io.test.ts` |
| pass | uncertain-write-fences-without-unsafe-cleanup | `packages/project-memory/src/__tests__/queue-io.test.ts` |
| pass | unsafe-queue-files-and-directory-replacement-are-refused | `packages/project-memory/src/__tests__/queue-io.test.ts` |
| pass | file-sync-failure-preserves-written-bytes-and-ownership | `packages/project-memory/src/__tests__/queue-io.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `packages/project-memory/src/__tests__/queue-io.test.ts` | 0 | 4 | 1.9 s |  |

## t3

Run at 2026-11-02T07:11:12.268Z on commit `e2288ef98`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: retained-byte-and-worst-case-metadata-reservations**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | retained-byte-and-worst-case-metadata-reservations | `packages/project-memory/src/__tests__/queue-checkpoint.test.ts` |

**unit: checkpoint-schema-generation-and-retry-state-validation**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | checkpoint-schema-generation-and-retry-state-validation | `packages/project-memory/src/__tests__/queue-checkpoint.test.ts` |

**integration: rotation-orphan-successor-and-checkpoint-replacement-matrix**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | rotation-orphan-successor-and-checkpoint-replacement-matrix | `packages/project-memory/src/__tests__/queue-checkpoint.test.ts` |
| pass | checkpoint-publication-faults-preserve-current-or-complete-next | `packages/project-memory/src/__tests__/queue-checkpoint.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `packages/project-memory/src/__tests__/queue-checkpoint.test.ts` | 0 | 4 | 1.6 s |  |

## t4

Run at 2026-11-02T11:42:45.468Z on commit `2688289f7`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: recovery-frontier-complete-suffix-and-unaccepted-partial-tail**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | recovery-frontier-complete-suffix-and-unaccepted-partial-tail | `packages/project-memory/src/__tests__/queue-recovery.test.ts` |
| pass | partial-tail-intent-resumes-before-and-after-truncate | `packages/project-memory/src/__tests__/queue-recovery.test.ts` |

**integration: published-checkpoint-and-sealed-corruption-fail-closed**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | published-checkpoint-and-sealed-corruption-fail-closed | `packages/project-memory/src/__tests__/queue-recovery.test.ts` |
| pass | exact-header-only-orphan-recovers-event-bearing-orphan-does-not | `packages/project-memory/src/__tests__/queue-recovery.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `packages/project-memory/src/__tests__/queue-recovery.test.ts` | 0 | 4 | 2.9 s |  |

## t5

Run at 2026-11-02T07:27:05.062Z on commit `f14a8ef95`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: durable-append-frontier-and-full-queue-refusal**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | durable-append-frontier-and-full-queue-refusal | `packages/project-memory/src/__tests__/queue-append.test.ts` |
| pass | oversized-single-frame-rotates-without-exceeding-retained-budget | `packages/project-memory/src/__tests__/queue-append.test.ts` |
| pass | ambiguous-append-fences-and-reopen-deduplicates | `packages/project-memory/src/__tests__/queue-append.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `packages/project-memory/src/__tests__/queue-append.test.ts` | 0 | 3 | 1.5 s |  |

## t6

Run at 2026-11-02T07:30:49.857Z on commit `54e12c6af`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: concurrent-admission-fifo-and-idempotent-retry**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | concurrent-admission-fifo-and-idempotent-retry | `packages/project-memory/src/__tests__/queue-admission.test.ts` |
| pass | admission-quota-refunds-and-hanging-policy-drains-safely | `packages/project-memory/src/__tests__/queue-admission.test.ts` |

**integration: privacy-binding-and-scope-status-isolation-before-enqueue**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | privacy-binding-and-scope-status-isolation-before-enqueue | `packages/project-memory/src/__tests__/queue-admission.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `packages/project-memory/src/__tests__/queue-admission.test.ts` | 0 | 3 | 2.1 s |  |

## t7

Run at 2026-11-02T08:10:27.157Z on commit `08549be1f`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: pinned-replay-and-qualified-operation-status**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | pinned-replay-and-qualified-operation-status | `packages/project-memory/src/__tests__/queue-replay.test.ts` |

**integration: retry-holes-do-not-authorize-mixed-segment-deletion**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | retry-holes-do-not-authorize-mixed-segment-deletion | `packages/project-memory/src/__tests__/queue-replay.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `packages/project-memory/src/__tests__/queue-replay.test.ts` | 0 | 2 | 1.2 s |  |

## t8

Run at 2026-11-03T08:20:27.094Z on commit `a0d1fe628`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: sc3-receipt-verifier-proof-and-causal-order-contract**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | sc3-receipt-verifier-proof-and-causal-order-contract | `packages/project-memory/src/__tests__/queue-receipts.test.ts` |
| pass | invalid-and-nonterminal-proofs-never-resolve-or-delete | `packages/project-memory/src/__tests__/queue-receipts.test.ts` |
| pass | queue-only-mode-cannot-ack-terminal-state | `packages/project-memory/src/__tests__/queue-receipts.test.ts` |
| pass | retained-identity-rejects-conflicting-authoritative-receipt | `packages/project-memory/src/__tests__/queue-retirement.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `packages/project-memory/src/__tests__/queue-receipts.test.ts` | 0 | 3 | 1.5 s |  |
| `packages/project-memory/src/__tests__/queue-retirement.test.ts` | 0 | 6 | 4.7 s |  |

## t9

Run at 2026-11-02T08:30:08.709Z on commit `3b404c77a`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: verified-terminal-ack-retirement-and-reader-pins**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | verified-terminal-ack-retirement-and-reader-pins | `packages/project-memory/src/__tests__/queue-retirement.test.ts` |
| pass | mixed-pending-prefix-keeps-later-terminal-segments | `packages/project-memory/src/__tests__/queue-retirement.test.ts` |
| pass | retirement-resumes-after-intent-unlink-and-successor-creation | `packages/project-memory/src/__tests__/queue-retirement.test.ts` |
| pass | full-terminal-active-segment-recycles-without-extra-headroom | `packages/project-memory/src/__tests__/queue-retirement.test.ts` |

**integration: recycled-identity-requires-authoritative-receipt-capability**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | recycled-identity-requires-authoritative-receipt-capability | `packages/project-memory/src/__tests__/queue-retirement.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `packages/project-memory/src/__tests__/queue-retirement.test.ts` | 0 | 5 | 4.2 s |  |

## t10

Run at 2026-11-02T08:35:50.529Z on commit `5cebe413a`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: drain-close-startup-failure-preserve-backlog-and-ownership**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | drain-close-startup-failure-preserve-backlog-and-ownership | `packages/project-memory/src/__tests__/runtime.test.ts` |
| pass | queue-limit-validation-precedes-directory-ownership | `packages/project-memory/src/__tests__/runtime.test.ts` |
| pass | all-quiescent-participants-close-before-unverified-ownership-is-retained | `packages/project-memory/src/__tests__/runtime.test.ts` |
| pass | idempotent-drain-close-and-provider-ownership | `packages/project-memory/src/__tests__/runtime.test.ts` |

**integration: public-service-accepted-status-and-unavailable-semantic-capabilities**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | public-service-accepted-status-and-unavailable-semantic-capabilities | `packages/project-memory/src/__tests__/runtime.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `packages/project-memory/src/__tests__/runtime.test.ts` | 0 | 5 | 1.6 s |  |

## t11

Run at 2026-11-02T08:49:31.404Z on commit `4d882859c`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: write-sync-rename-unlink-failure-fences-the-lane**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | write-sync-rename-unlink-failure-fences-the-lane | `packages/project-memory/src/__tests__/queue-fault-matrix.test.ts` |
| pass | partial-bootstrap-header-and-event-writes-recover-explicitly | `packages/project-memory/src/__tests__/queue-fault-matrix.test.ts` |
| pass | retirement-resumes-after-intent-unlink-and-successor-creation | `packages/project-memory/src/__tests__/queue-retirement.test.ts` |

**integration: adversarial-admission-and-recycled-scope-isolation**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | maximum-qualified-identities-preserve-scope-and-epoch | `packages/project-memory/src/__tests__/queue-fault-matrix.test.ts` |
| pass | wall-clock-changes-preserve-sequence-and-clamp-age | `packages/project-memory/src/__tests__/queue-fault-matrix.test.ts` |
| pass | verified-terminal-ack-retirement-and-reader-pins | `packages/project-memory/src/__tests__/queue-retirement.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `packages/project-memory/src/__tests__/queue-fault-matrix.test.ts` | 0 | 4 | 4.7 s |  |
| `packages/project-memory/src/__tests__/queue-retirement.test.ts` | 0 | 5 | 3.7 s |  |

## t13

Run at 2026-11-02T11:48:51.653Z on commit `8e9b2be7d`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: queue-resource-and-fsync-cost-measurement**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | queue-resource-and-fsync-cost-measurement | `packages/project-memory/src/__tests__/queue-cost.test.ts` |
| pass | full-current-source-queue-resource-study-evidence | `scripts/__tests__/project-memory-s2-performance.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `packages/project-memory/src/__tests__/queue-cost.test.ts` | 0 | 1 | 1.6 s |  |
| `scripts/__tests__/project-memory-s2-performance.test.ts` | 0 | 1 | 0.4 s |  |

## t12

Run at 2026-11-02T11:51:06.132Z on commit `8e9b2be7d`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: accepted-set-survives-process-kill-at-every-boundary**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | accepted-set-survives-process-kill-at-every-boundary | `packages/project-memory/src/__tests__/queue-crash.test.ts` |

**integration: macos-apfs-linux-ext4-node22-queue-qualification**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | macos-apfs-linux-ext4-node22-queue-qualification | `packages/project-memory/src/__tests__/queue-crash.test.ts` |
| pass | current-source-macos-apfs-node22-crash-qualification | `scripts/__tests__/project-memory-s2-qualification.test.ts` |
| pass | current-source-linux-ext4-node22-crash-qualification | `scripts/__tests__/project-memory-s2-qualification.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `packages/project-memory/src/__tests__/queue-crash.test.ts` | 0 | 2 | 15.6 s |  |
| `scripts/__tests__/project-memory-s2-qualification.test.ts` | 0 | 2 | 0.7 s |  |

## t14

Run at 2026-11-03T08:28:52.463Z on commit `74dd4e383`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

**smoke: packed-external-submit-crash-reopen-and-operation**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | packed-external-submit-crash-reopen-and-operation | `packages/project-memory/src/__tests__/packed.test.ts` |

**smoke: pure-import-and-no-daemon-or-backend-storage-dependency**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | public-v1-types-and-emitted-boundary | `packages/project-memory/src/__tests__/contracts.test.ts` |
| pass | pure-public-import-without-native-or-daemon | `packages/project-memory/src/__tests__/contracts.test.ts` |
| pass | packed-native-missing-import-versus-open | `packages/project-memory/src/__tests__/packed.test.ts` |
| pass | tarball-public-dependency-and-asset-allowlist | `packages/project-memory/src/__tests__/packed.test.ts` |

**smoke: package-suite-root-build-and-current-source-ci-evidence**

Reported by the builder, not run by the gate: **pass**. Evidence: S002/evidence/backend/local-validation.json, root-build.log and SELF-REVIEW.md: source0f4ee7724 full local memory suite63/63; Linux full CI https://github.com/insors-ai/insrc/actions/runs/41602463831 passed14 lifecycle+4 packed+45 queue, no skips,55 actual SIGKILL boundaries on each platform. Current-source Mac/Linux/performance proof tests3/3 pass; benchmark rerun and root build pass. Prior backend full-sweep.json remains separately disclosed with18 failures,2 cancellations and source-change caveat; no clean current backend-wide pass is claimed.

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `packages/project-memory/src/__tests__/contracts.test.ts` | 0 | 2 | 1.6 s |  |
| `packages/project-memory/src/__tests__/packed.test.ts` | 0 | 4 | 19.3 s |  |
