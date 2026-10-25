<!-- insrc:artifact TESTS-484fcef7efaf229e-s3 -->

# Tests: 484fcef7efaf229e s3

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-25T16:39:17.098Z on commit `fe5850574`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S3-INVENTORY: TypeScript-resolved alias/injection/factory/serializer baseline and missing-policy fail-closed tests**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S3-INVENTORY: production boundaries have explicit reviewed classifications and unchanged baseline | `src/daemon/db/__tests__/session-source-inventory.test.ts` |
| pass | CM-S3-INVENTORY: renamed and destructured provider resolver factory serializer and filesystem APIs are discovered | `src/daemon/db/__tests__/session-source-inventory.test.ts` |
| pass | CM-S3-INVENTORY: missing or forged execution never defaults to saved | `src/shared/__tests__/connection-execution.test.ts` |
| pass | CM-S3-INVENTORY: explicit saved tuple is immutable, nonserializable and cancellation-bound | `src/shared/__tests__/connection-execution.test.ts` |
| pass | CM-S3-INVENTORY: production analysis entry installs saved authority and rejects forged policy before source access | `src/shared/__tests__/connection-execution.test.ts` |
| pass | CM-S3-INVENTORY: staged production executors refuse supplied unadmitted policy before loading state | `src/shared/__tests__/connection-execution.test.ts` |
| pass | CM-S3-INVENTORY: lost carrier in a bound call cannot become saved or enter a provider | `src/shared/__tests__/connection-execution.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/session-source-inventory.test.ts` | 0 | 2 | 12.9 s |  |
| `src/shared/__tests__/connection-execution.test.ts` | 0 | 5 | 1.1 s |  |
