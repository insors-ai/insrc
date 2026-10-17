<!-- insrc:artifact TESTS-670419c4ad8bea8e-s1 -->

# Tests: 670419c4ad8bea8e s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 15 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-17T13:09:28.300Z on commit `cefc8ef4`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: Identity source precedence, authority separation and no automatic merge**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Identity precedence preserves authority, case and distinct accounts | `src/understanding/__tests__/identity.test.ts` |
| pass | Incomplete provider discovery never selects an apparently unique account | `src/understanding/__tests__/identity.test.ts` |

**integration: Provider source matrix and available/disconnected/missing/failed adapters; Git/OS fallback**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Provider adapters distinguish available, disconnected, missing and failed sources | `src/understanding/__tests__/identity.test.ts` |
| pass | Local adapter reads effective repository Git email and falls back to OS without author substitution | `src/understanding/__tests__/identity.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/understanding/__tests__/identity.test.ts` | 0 | 4 | 0.5 s |  |

## t2

Run at 2026-10-17T13:15:42.605Z on commit `68612a86`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: Scope fingerprint full-field vectors and strict schemas**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Scope fingerprint covers every exact field and strict validation rejects forged input | `src/understanding/__tests__/contracts.test.ts` |
| pass | Nested scopes and transport versions fail closed on every envelope | `src/understanding/__tests__/contracts.test.ts` |

**unit: sc4 confidence fidelity and public projection key exclusion**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Submitted confidence is preserved and public projections exclude private fields | `src/understanding/__tests__/contracts.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/understanding/__tests__/contracts.test.ts` | 0 | 3 | 0.5 s |  |

## t3

Run at 2026-10-17T13:18:35.728Z on commit `e89d309d`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Open complete namespace inventory fresh and existing; retain old data**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Complete namespace inventory opens fresh and existing stores without data loss | `src/understanding/__tests__/storage.test.ts` |

**integration: Reject missing/corrupt/future schema; owner-index pagination**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Schema corruption fails closed and owner pagination is isolated and bounded | `src/understanding/__tests__/storage.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/understanding/__tests__/storage.test.ts` | 0 | 2 | 1 s |  |

## t4

Run at 2026-10-17T13:21:22.313Z on commit `27e694bc`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Concurrent CAS, exact replay, request conflict and transaction rollback**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Concurrent updates, exact replay and request conflicts preserve atomic history | `src/understanding/__tests__/service.test.ts` |

**integration: Immutable original and assisted attempts resume after reopen**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Original and assisted answers survive reopen and resume without granting authorization | `src/understanding/__tests__/service.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/understanding/__tests__/service.test.ts` | 0 | 2 | 0.9 s |  |

## t5

Run at 2026-10-17T13:29:01.179Z on commit `909b4bc2`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Interrupted job recovery and late completion rejected**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Recovery interrupts jobs and rejects late completion without losing answers | `src/understanding/__tests__/service.test.ts` |

**integration: Deletion races, owner isolation, permission checks and log redaction**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Deletion isolates owners, rejects retries and late writes, and enforces private paths | `src/understanding/__tests__/service.test.ts` |
| pass | Assessment lifecycle logs omit private identity and answer content | `src/understanding/__tests__/service.test.ts` |
| pass | Privacy covers the active production file layout and its lock file | `src/understanding/__tests__/service.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/understanding/__tests__/service.test.ts` | 0 | 6 | 3.7 s |  |
