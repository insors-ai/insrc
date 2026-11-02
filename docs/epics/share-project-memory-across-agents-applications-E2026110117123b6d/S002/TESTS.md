<!-- insrc:artifact TESTS-17123b6d304af2a2-s2 -->

# Tests: 17123b6d304af2a2 s2

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

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
