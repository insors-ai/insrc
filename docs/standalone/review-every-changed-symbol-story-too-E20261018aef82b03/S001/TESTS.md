<!-- insrc:artifact TESTS-aef82b034d7209fa-S001 -->

# Tests: aef82b034d7209fa S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 11 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-18T20:10:52.181Z on commit `c22234f1`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/agent/providers/__tests__/input-too-large.test.ts: 'codex input_too_large becomes an InputTooLargeError with maxChars and actualChars; the message is unchanged'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | codex input_too_large becomes an InputTooLargeError with maxChars and actualChars; the message is unchanged | `src/agent/providers/__tests__/input-too-large.test.ts` |

**unit: src/agent/providers/__tests__/input-too-large.test.ts: 'withStructuredRetry rethrows an InputTooLargeError after one call'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | withStructuredRetry rethrows an InputTooLargeError after one call | `src/agent/providers/__tests__/input-too-large.test.ts` |

**integration: src/agent/providers/__tests__/input-too-large-cli.test.ts: 'a fake codex emitting an input_too_large error event, or exiting non-zero with it on stderr, and a fake claude returning an is_error Prompt is too long envelope each surface an InputTooLargeError from completeStructured after one run'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a fake codex emitting an input_too_large error event, or exiting non-zero with it on stderr, and a fake claude returning an is_error Prompt is too long envelope each surface an InputTooLargeError from completeStructured after one run | `src/agent/providers/__tests__/input-too-large-cli.test.ts` |

**integration: src/agent/providers/__tests__/input-too-large-cli.test.ts: 'a size refusal whose text also matches the transient classifier (API Error: Prompt is too long) runs the CLI once'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a size refusal whose text also matches the transient classifier (API Error: Prompt is too long) runs the CLI once | `src/agent/providers/__tests__/input-too-large-cli.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/agent/providers/__tests__/input-too-large-cli.test.ts` | 0 | 2 | 3.1 s |  |
| `src/agent/providers/__tests__/input-too-large.test.ts` | 0 | 2 | 1.4 s |  |

## t2

Run at 2026-10-18T20:12:00.328Z on commit `9767b58f`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/agent/providers/__tests__/input-budget.test.ts: 'a codex CliProvider reports 1048576; claude and Ollama report undefined'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a codex CliProvider reports 1048576; claude and Ollama report undefined | `src/agent/providers/__tests__/input-budget.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/agent/providers/__tests__/input-budget.test.ts` | 0 | 1 | 0.9 s |  |

## t3

Run at 2026-10-18T20:13:13.101Z on commit `f05b54ef`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/code-review/__tests__/pack-into-batches.test.ts: 'every item in exactly one batch, every batch fits, and an item that alone does not fit raises AtomTooLargeError naming it'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | every item in exactly one batch, every batch fits, and an item that alone does not fit raises AtomTooLargeError naming it | `src/workflow/code-review/__tests__/pack-into-batches.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/__tests__/pack-into-batches.test.ts` | 0 | 1 | 0.4 s |  |

## t4

Run at 2026-10-18T20:28:25.244Z on commit `f398d2cd`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/code-review/__tests__/review-job.test.ts: 'a fitting dimension, or an unknown budget, is one call with today's prompt and schema'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a fitting dimension, or an unknown budget, is one call with today's prompt and schema | `src/workflow/code-review/__tests__/review-job.test.ts` |

**unit: src/workflow/code-review/__tests__/review-job.test.ts: 'every call the job issues fits the budget at every stage, for a Story many times the budget'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | every call the job issues fits the budget at every stage, for a Story many times the budget | `src/workflow/code-review/__tests__/review-job.test.ts` |

**unit: src/workflow/code-review/__tests__/review-job.test.ts: 'a refused call is re-planned and the job completes, sending no prompt twice'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a refused call is re-planned and the job completes, sending no prompt twice | `src/workflow/code-review/__tests__/review-job.test.ts` |

**unit: src/workflow/code-review/__tests__/review-job.test.ts: 'identical findings merge once; findings differing in any field are all kept'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | identical findings merge once; findings differing in any field are all kept | `src/workflow/code-review/__tests__/review-job.test.ts` |

**unit: src/workflow/code-review/__tests__/review-job.test.ts: 'every original symbol summary and clause is read whole by some call'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | every original symbol summary and clause is read whole by some call | `src/workflow/code-review/__tests__/review-job.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/__tests__/review-job.test.ts` | 0 | 5 | 1.1 s |  |
