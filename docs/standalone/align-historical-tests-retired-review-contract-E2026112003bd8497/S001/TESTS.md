<!-- insrc:artifact TESTS-03bd849749a52b41-s1 -->

# Tests: 03bd849749a52b41 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 10 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

## t1

Run at 2026-11-20T08:39:08.930Z on commit `473d3f835`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Retired review surfaces reject before argument inspection, providers or IO**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Retired review surfaces reject before argument inspection, providers or IO | `src/daemon/steps/__tests__/in-daemon-client.test.ts` |

**integration: Generic client progress, synchronous errors and abort drains retain coverage on supported handlers**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Generic client progress, synchronous errors and abort drains retain coverage on supported handlers | `src/daemon/steps/__tests__/in-daemon-client.test.ts` |

**integration: Review-only label assertions reflect unavailable execution without changing active role tier tests**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | role-router-global-tiers.test.ts: the RoleResolution keeps role, tier, runner, model, effort, clampedByFloor and adds fallback; active workflow labels unchanged while retired review delegates to unavailable | `src/analyze/context/__tests__/role-router-global-tiers.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/context/__tests__/role-router-global-tiers.test.ts` | 0 | 3 | 1 s |  |
| `src/daemon/steps/__tests__/in-daemon-client.test.ts` | 0 | 5 | 0.3 s |  |

## t2

Run at 2026-11-20T08:44:23.509Z on commit `2fb3cd094`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Supported worker tokens survive idle release and preserve session isolation while retired kinds reject**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ac6: supported worker tokens survive idle release and preserve separate session payloads while retired kinds reject | `src/daemon/threads/__tests__/s3-acceptance.test.ts` |
| pass | indexing port gets the worker's real codeIndexWorkFor while retired freshness rejects without asking it | `src/daemon/threads/__tests__/indexing-port.test.ts` |
| pass | router: two sessions share model checks, retired reviews reject locally and supported steps retain session workers | `src/daemon/threads/__tests__/router-session.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/threads/__tests__/indexing-port.test.ts` | 0 | 5 | 4.6 s |  |
| `src/daemon/threads/__tests__/router-session.test.ts` | 0 | 22 | 1 s |  |
| `src/daemon/threads/__tests__/s3-acceptance.test.ts` | 0 | 9 | 45.8 s |  |

## t3

Run at 2026-11-20T08:58:37.964Z on commit `dab8398d8`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Temporary persistence canaries remain absent while saved artifact and history controls persist**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S3-CACHE: task/report/checkpoint/history/trace/Lance canaries, error repair, saved positive persistence | `src/daemon/steps/__tests__/task-persistence.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/steps/__tests__/task-persistence.test.ts` | 0 | 1 | 2.4 s |  |

## t4

Run at 2026-11-20T09:02:54.024Z on commit `efcdac77a`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Current isolation inventories execute real tests and detect deliberate default-store opening**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Current isolation inventories execute real tests and detect deliberate default-store opening | `src/db/graph/__tests__/review-store-isolation.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/db/graph/__tests__/review-store-isolation.test.ts` | 0 | 1 | 5.9 s |  |

## t5

Run at 2026-11-20T09:07:06.559Z on commit `59bd322ff`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

**integration: Retained review history and human lifecycle gates remain readable and enforced**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | historical review versions remain readable unchanged through an inert dependency closure | `src/workflow/review-history/__tests__/readers.test.ts` |
| pass | human approval and completion work without CR while remaining guards still refuse invalid work | `src/workflow/__tests__/review-retirement-workflow.test.ts` |

**smoke: Batch 04 assertion mapping, actual focused results and actor closure are recorded**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/plans/review-test-migration-2026-11-20.md and review-test-evidence-2026-11-20/final-results.json: final59pass/0fail/cancel/skip across16 serial files; Node22.23.2, full fresh build, fingerprints/hashes, cleanup confirmed and no matching test/compiler/source-test-daemon processes or active lease. Exact seven LLD subjects/ac1–4 mapped; t1–4 gates passed. Nine obsolete inventory entries replaced by seven current normally exiting suites with two real-store falsification controls. General graph parent failure from existing analyze fixtures remains recorded separately; vector audit earlier passed unchanged. Production diff fromaa76e132b is one line in storage, separately tracked blocker; schema/API/ownership unchanged, prose artifact assessment recorded without rendering claim. Both BUILD approvals still pending.

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/review-retirement-workflow.test.ts` | 0 | 1 | 0.6 s |  |
| `src/workflow/review-history/__tests__/readers.test.ts` | 0 | 1 | 0.7 s |  |
