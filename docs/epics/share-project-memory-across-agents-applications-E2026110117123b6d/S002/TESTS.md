<!-- insrc:artifact TESTS-17123b6d304af2a2-s2 -->

# Tests: 17123b6d304af2a2 s2

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 36 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-11-02T07:02:24.067Z on commit `3aa3b89d1`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

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
| `packages/project-memory/src/__tests__/queue-codec.test.ts` | 0 | 3 | 0.5 s |  |

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

Run at 2026-11-02T07:21:34.621Z on commit `b7605021b`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

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
| `packages/project-memory/src/__tests__/queue-recovery.test.ts` | 0 | 4 | 2.7 s |  |

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

Run at 2026-11-02T08:17:35.066Z on commit `6a3cd8936`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: sc3-receipt-verifier-proof-and-causal-order-contract**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | sc3-receipt-verifier-proof-and-causal-order-contract | `packages/project-memory/src/__tests__/queue-receipts.test.ts` |
| pass | invalid-and-nonterminal-proofs-never-resolve-or-delete | `packages/project-memory/src/__tests__/queue-receipts.test.ts` |
| pass | queue-only-mode-cannot-ack-terminal-state | `packages/project-memory/src/__tests__/queue-receipts.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `packages/project-memory/src/__tests__/queue-receipts.test.ts` | 0 | 3 | 1.6 s |  |

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
