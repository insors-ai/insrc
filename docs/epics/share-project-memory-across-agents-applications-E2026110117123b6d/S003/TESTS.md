<!-- insrc:artifact TESTS-17123b6d304af2a2-s3 -->

# Tests: 17123b6d304af2a2 s3

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

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
