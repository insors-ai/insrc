<!-- insrc:artifact TESTS-9b04adb36cac716d-s4 -->

# Tests: 9b04adb36cac716d s4

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 23 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-11-07T19:47:05.310Z on commit `5e7f04ef8`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: U1 permanent payload integrity and digest; aggregate schemas**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | permanent payload validates exact history, party, binding, digest and version | `src/workflow/review/design-review/__tests__/history-aggregate.test.ts` |
| pass | host coverage diagnostics remain bounded without expanding model limitations | `src/workflow/review/design-review/__tests__/history-aggregate.test.ts` |

**integration: I8 full/impact 8194 limitations, >256 finding origins and bounded host diagnostics**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | full and impact consolidation preserve 8194 limitations across checkpoint restart | `src/workflow/review/design-review/__tests__/history-aggregate.test.ts` |
| pass | impact consolidation carries more than 256 origins without weakening per-chunk findings | `src/workflow/review/design-review/__tests__/history-aggregate.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review/design-review/__tests__/history-aggregate.test.ts` | 0 | 4 | 0.9 s |  |

## t2

Run at 2026-11-08T05:23:36.631Z on commit `870fa0c4b`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: I8 exact-byte dispatch reservations, consolidation duplication, refusal and restart**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | coordinator dispatches maximum feedback at the real ceiling and durably refuses one byte over | `src/workflow/review/design-review/__tests__/capacity.test.ts` |
| pass | real checkpoint ceiling reserves maximum byte-valid feedback through consolidation and restart | `src/workflow/review/design-review/__tests__/capacity.test.ts` |
| pass | encoded dispatch reservation accepts exact bound and refuses one byte below without expanding the ceiling | `src/workflow/review/design-review/__tests__/capacity.test.ts` |
| pass | capacity refusal is durable before provider construction and does not spend retries | `src/workflow/review/design-review/__tests__/capacity.test.ts` |
| pass | automatic retry and explicit recovery reserve capacity before charging dispatch counters | `src/workflow/review/design-review/__tests__/capacity.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review/design-review/__tests__/capacity.test.ts` | 0 | 5 | 11.6 s |  |

## t3

Run at 2026-11-08T05:11:22.727Z on commit `6d3865ff9`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: U2 UTF-8 frame/journal boundaries and unknown-kind limits**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | design history alone receives a bounded UTF-8 allowance in sync and async readers | `src/workflow/artifact-core/__tests__/design-history-storage.test.ts` |

**integration: I1 deterministic-id journal crash replay**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | deterministic history id survives append and replace crashes and rejects conflicting replay | `src/workflow/artifact-core/__tests__/design-history-storage.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/artifact-core/__tests__/design-history-storage.test.ts` | 0 | 2 | 0.8 s |  |

## t4

Run at 2026-11-08T05:38:31.971Z on commit `6a661d6bf`. Tests check: **passed**. 8 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: I1 publication receipt fault recovery and zero model reruns**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | journalled publication and lost-receipt recovery preserve one exact full history without model calls | `src/workflow/review/design-review/__tests__/publication.test.ts` |
| pass | publication capacity stays pending and a raised history allowance retries persistence only | `src/workflow/review/design-review/__tests__/publication.test.ts` |
| pass | native review waits for durable publication and recovers failed receipt persistence without rerunning models | `src/workflow/review/design-review/__tests__/publication.test.ts` |
| pass | publication append and head-replace crashes replay the same complete history entry | `src/workflow/review/design-review/__tests__/publication.test.ts` |
| pass | known permanent-history minimum refuses before model work and explicitly resumes after the allowance is raised | `src/workflow/review/design-review/__tests__/publication.test.ts` |

**integration: I2 immutable baseline, exact owned delta and source mutation**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | publication refuses changed subject before write and additional edits after its exact owned delta | `src/workflow/review/design-review/__tests__/publication.test.ts` |
| pass | canonical edits during journal staging or log append are preserved and refuse publication | `src/workflow/review/design-review/__tests__/publication.test.ts` |
| pass | journalled publication and lost-receipt recovery preserve one exact full history without model calls | `src/workflow/review/design-review/__tests__/publication.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review/design-review/__tests__/publication.test.ts` | 0 | 7 | 1.3 s |  |

## t5

Run at 2026-11-08T06:07:40.976Z on commit `d83eecf71`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: U3 versioned readers and current IDE common fields**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | versioned readers preserve legacy shape and expose real chunk feedback through current common fields | `src/workflow/review/design-review/__tests__/readers.test.ts` |
| pass | legacy display stays unchanged and read-only across artifact content delivery and CLI | `src/workflow/review/design-review/__tests__/readers.test.ts` |
| pass | shared current IDE wire fixture preserves common fields and versioned chunk data | `src/workflow/review/design-review/__tests__/readers.test.ts` |

**integration: I6 permanent retrieval after cleanup/restart and missing locator**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | fresh coordinator retrieves permanent pages without checkpoint, scan or provider and requires an exact artifact locator | `src/workflow/review/design-review/__tests__/readers.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review/design-review/__tests__/readers.test.ts` | 0 | 4 | 0.9 s |  |
