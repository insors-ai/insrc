<!-- insrc:artifact TESTS-dae67bfc7da310cc-s1 -->

# Tests: dae67bfc7da310cc s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 16 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-11-16T13:48:42.350Z on commit `7c072cace`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: All preserved review operations and accepted MCP phases report exact rewrite errors without allocating review state**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | all preserved review operations and MCP phases return exact rewrite errors without review state | `src/daemon/__tests__/review-retirement-endpoints.test.ts` |

**integration: Repeated unavailable MCP calls allocate no persistent review connections and preserve transport error envelopes**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | repeated unavailable MCP calls allocate no connections and preserve error envelopes | `src/daemon/__tests__/review-retirement-endpoints.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/review-retirement-endpoints.test.ts` | 0 | 2 | 1.2 s |  |

## t2

Run at 2026-11-16T14:07:35.758Z on commit `0099d14a1`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Human approval and Story Epic completion work without CR while non-review integrity build task and team guards remain effective**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | human approval and completion work without CR while remaining guards still refuse invalid work | `src/workflow/__tests__/review-retirement-workflow.test.ts` |

**integration: Historical review versions remain readable unchanged through an inert dependency closure**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | historical review versions remain readable unchanged through an inert dependency closure | `src/workflow/review-history/__tests__/readers.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/review-retirement-workflow.test.ts` | 0 | 1 | 0.8 s |  |
| `src/workflow/review-history/__tests__/readers.test.ts` | 0 | 1 | 1 s |  |

## t3

Run at 2026-11-16T14:12:19.702Z on commit `868146fdd`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Daemon startup shutdown and dispatch create no review services workers progress producers or cleanup owners**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | daemon startup shutdown and dispatch allocate no review runtime or hooks | `src/daemon/threads/__tests__/review-retirement-runtime.test.ts` |

**integration: Normal ThreadServices worker routing step state provider broker and task progress continue without review hooks**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | shared worker hub step state and historical progress survive without review hooks | `src/daemon/threads/__tests__/review-retirement-runtime.test.ts` |
| pass | a structured call honours its own timeoutMs, so a silent CLI is killed at the caller's limit, not the provider default | `src/agent/providers/__tests__/cli-subprocess.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/agent/providers/__tests__/cli-subprocess.test.ts` | 0 | 6 | 4 s |  |
| `src/daemon/threads/__tests__/review-retirement-runtime.test.ts` | 0 | 2 | 0.8 s |  |

## t4

Run at 2026-11-16T14:29:49.468Z on commit `8d52490bc`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Production source import and asset audit retains only review endpoints inert historical readers and human decisions**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | production imports and assets retain only unavailable endpoints historical reads and human decisions | `src/daemon/__tests__/review-retirement-audit.test.ts` |

**integration: Review unavailability guidance and settings agree across backend VS Code and JetBrains contracts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | backend and current IDE guidance agree on review unavailability and human approval | `src/daemon/__tests__/review-retirement-audit.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/review-retirement-audit.test.ts` | 0 | 2 | 0.6 s |  |

## t5

Run at 2026-11-16T14:39:21.323Z on commit `16a5f85d4`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**smoke: Clean production build and package contain no deleted review implementation or planted stale review output**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | clean build and package remove retired runtime and planted stale output | `src/daemon/__tests__/review-retirement-package.test.ts` |

**integration: End-to-end unavailable review calls preserve historical data and do not start client polling or unrelated service regressions**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | real IPC unavailable calls preserve history and the VS Code client fails without polling | `src/daemon/__tests__/review-retirement-wire.test.ts` |
| pass | rewrite exceptions surface from real transport without review polling | `jetbrains-plugin/__tests__/review-retirement-gradle.test.ts` |
| pass | all preserved review operations and MCP phases return exact rewrite errors without review state | `src/daemon/__tests__/review-retirement-endpoints.test.ts` |
| pass | human approval and completion work without CR while remaining guards still refuse invalid work | `src/workflow/__tests__/review-retirement-workflow.test.ts` |
| pass | historical review versions remain readable unchanged through an inert dependency closure | `src/workflow/review-history/__tests__/readers.test.ts` |
| pass | shared worker hub step state and historical progress survive without review hooks | `src/daemon/threads/__tests__/review-retirement-runtime.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `jetbrains-plugin/__tests__/review-retirement-gradle.test.ts` | 0 | 1 | 9.3 s |  |
| `src/daemon/__tests__/review-retirement-endpoints.test.ts` | 0 | 2 | 1.2 s |  |
| `src/daemon/__tests__/review-retirement-package.test.ts` | 0 | 1 | 19.8 s |  |
| `src/daemon/__tests__/review-retirement-wire.test.ts` | 0 | 1 | 1.1 s |  |
| `src/daemon/threads/__tests__/review-retirement-runtime.test.ts` | 0 | 2 | 0.8 s |  |
| `src/workflow/__tests__/review-retirement-workflow.test.ts` | 0 | 1 | 0.8 s |  |
| `src/workflow/review-history/__tests__/readers.test.ts` | 0 | 1 | 1 s |  |
