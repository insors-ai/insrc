<!-- insrc:artifact TESTS-36cbeeac485c0af7-s1 -->

# Tests: 36cbeeac485c0af7 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 28 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-11-08T07:49:04.360Z on commit `bc3dc7b86`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: title: the H1 shows id and title**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | title: the H1 shows id and title | `src/workflow/__tests__/lld-authoring-gates.test.ts` |

**unit: title: a title with a line break renders on one line**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | title: a title with a line break renders on one line | `src/workflow/__tests__/lld-authoring-gates.test.ts` |

**integration: title: the H1 shows id and title on both finalize paths**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | title: the H1 shows id and title on both finalize paths | `src/workflow/__tests__/lld-authoring-gates.test.ts` |

**integration: stored: a stored LLD with no storyTitle renders byte-identically**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | stored: a stored LLD with no storyTitle renders byte-identically | `src/workflow/__tests__/lld-authoring-gates.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/lld-authoring-gates.test.ts` | 0 | 4 | 1.1 s |  |

## t2

Run at 2026-11-08T08:08:45.706Z on commit `bd2d8319a`. Tests check: **passed**. 11 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: overlay: a submission with only ids and reasonRejected stores every s2 field**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | overlay: a submission with only ids and reasonRejected stores every s2 field | `src/workflow/__tests__/lld-authoring-gates.test.ts` |

**unit: overlay: a submission that alters s2's content stores s2's values**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | overlay: a submission that alters s2's content stores s2's values | `src/workflow/__tests__/lld-authoring-gates.test.ts` |

**unit: finalize: duplicate submitted ids are refused as retryable**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | finalize: duplicate submitted ids are refused as retryable | `src/workflow/__tests__/lld-authoring-gates.test.ts` |

**unit: finalize: an id absent from s2 is refused as retryable**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | finalize: an id absent from s2 is refused as retryable | `src/workflow/__tests__/lld-authoring-gates.test.ts` |

**unit: finalize: an s2 alternative missing from the submission is refused as retryable**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | finalize: an s2 alternative missing from the submission is refused as retryable | `src/workflow/__tests__/lld-authoring-gates.test.ts` |

**unit: finalize: duplicate s2 ids are refused as non-retryable**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | finalize: duplicate s2 ids are refused as non-retryable | `src/workflow/__tests__/lld-authoring-gates.test.ts` |

**unit: fallback: a run with no s2 output accepts complete submitted alternatives**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | fallback: a run with no s2 output accepts complete submitted alternatives | `src/workflow/__tests__/lld-authoring-gates.test.ts` |

**unit: fallback: a run with no s2 output refuses an id-only submission**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | fallback: a run with no s2 output refuses an id-only submission | `src/workflow/__tests__/lld-authoring-gates.test.ts` |

**integration: finalize: both the Epic and the standalone path apply the overlay**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | finalize: both the Epic and the standalone path apply the overlay | `src/workflow/__tests__/lld-authoring-gates.test.ts` |

**integration: finalize: an incomplete s2 record is refused as non-retryable, naming a restart, and writes nothing**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | finalize: an incomplete s2 record is refused as non-retryable, naming a restart, and writes nothing | `src/workflow/__tests__/lld-authoring-gates.test.ts` |

**integration: stored: isLldBody still accepts a stored LLD with partial alternatives**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | stored: isLldBody still accepts a stored LLD with partial alternatives | `src/workflow/__tests__/lld-authoring-gates.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/lld-authoring-gates.test.ts` | 0 | 23 | 1.4 s |  |

## t3

Run at 2026-11-08T11:03:34.072Z on commit `c9908d7d7`. Tests check: **passed**. 8 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: citations: the DeepSeek LLD's actual refs are refused**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | citations: the DeepSeek LLD's actual refs are refused | `src/workflow/__tests__/lld-authoring-gates.test.ts` |

**unit: citations: a badly formed path-only ref under analyze-bundle is refused, as under code**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | citations: a badly formed path-only ref under analyze-bundle is refused, as under code | `src/workflow/__tests__/lld-authoring-gates.test.ts` |

**unit: citations: a root-level file name alongside prose is refused**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | citations: a root-level file name alongside prose is refused | `src/workflow/__tests__/lld-authoring-gates.test.ts` |

**unit: citations: a URL alongside prose is refused**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | citations: a URL alongside prose is refused | `src/workflow/__tests__/lld-authoring-gates.test.ts` |

**unit: citations: a text-only label, a well-formed path and a standalone URL all pass**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | citations: a text-only label, a well-formed path and a standalone URL all pass | `src/workflow/__tests__/lld-authoring-gates.test.ts` |

**integration: citations: a refused citation names its id, writes nothing and succeeds when corrected**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | citations: a refused citation names its id, writes nothing and succeeds when corrected | `src/workflow/__tests__/lld-authoring-gates.test.ts` |

**integration: citations: other artifact kinds are unaffected**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | citations: other artifact kinds are unaffected | `src/workflow/__tests__/lld-authoring-gates.test.ts` |

**integration: stored: checkPathForms behaviour for other artifact kinds is unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | stored: checkPathForms behaviour for other artifact kinds is unchanged | `src/workflow/__tests__/lld-authoring-gates.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/lld-authoring-gates.test.ts` | 0 | 27 | 1.2 s |  |

## t4

Run at 2026-11-08T08:13:53.728Z on commit `0af712793`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: attribution: absent, blank and multiline authorModel stamp unknown**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | attribution: absent, blank and multiline authorModel stamp unknown | `src/workflow/__tests__/lld-authoring-gates.test.ts` |

**unit: attribution: a client with no family stamps runner unknown**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | attribution: a client with no family stamps runner unknown | `src/workflow/__tests__/lld-authoring-gates.test.ts` |

**unit: attribution: modelSummary prints an unknown stamp**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | attribution: modelSummary prints an unknown stamp | `src/workflow/__tests__/lld-authoring-gates.test.ts` |

**integration: attribution: a Codex client with a reported model stamps cli-codex and that model**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | attribution: a Codex client with a reported model stamps cli-codex and that model | `src/daemon/steps/workflow-step/__tests__/questions-gate-e2e.test.ts` |

**integration: attribution: a supplied multi-output attribution stays unchanged on both finalize paths**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | attribution: a supplied multi-output attribution stays unchanged on both finalize paths | `src/workflow/__tests__/lld-authoring-gates.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/steps/workflow-step/__tests__/questions-gate-e2e.test.ts` | 0 | 8 | 2.7 s |  |
| `src/workflow/__tests__/lld-authoring-gates.test.ts` | 0 | 27 | 0.9 s |  |
