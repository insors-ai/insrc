<!-- insrc:artifact TESTS-17123b6d304af2a2-s3 -->

# Tests: 17123b6d304af2a2 s3

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 18 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

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
