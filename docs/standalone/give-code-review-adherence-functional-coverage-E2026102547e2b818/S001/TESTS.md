<!-- insrc:artifact TESTS-47e2b81827433589-s1 -->

# Tests: 47e2b81827433589 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 36 pass, 0 fail, 0 skipped, 0 not found; 2 reported by the builder and not run by the gate.

## t1

Run at 2026-10-25T10:44:06.181Z on commit `573349c71`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Source-inspection opt-in reaches single, chunk, obligation, relation and reduction calls with bounded read-only sessions; unchanged dimensions retain structured mode.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | source inspection routes every review role through bounded read-only sessions | `src/workflow/review-pipeline/__tests__/code-review-source-inspection.test.ts` |
| pass | source-inspection driver propagates deadlines and retries sessions without structured fallback | `src/workflow/review-pipeline/__tests__/code-review-source-inspection.test.ts` |
| pass | source-inspection missing session fails rather than fabricating a pass | `src/workflow/review-pipeline/__tests__/code-review-source-inspection.test.ts` |

**unit: Shared prompts preserve source citations and uncertainty; no summary-only/closed-evidence assumptions for opted-in calls.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | source-inspecting divided prompts preserve citations and uncertainty instead of closing evidence | `src/workflow/review-pipeline/__tests__/code-review-source-inspection.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review-pipeline/__tests__/code-review-source-inspection.test.ts` | 0 | 4 | 0.6 s |  |

## t2

Run at 2026-10-25T10:51:47.757Z on commit `d3e2891aa`. Tests check: **passed**. 14 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: Both dimension prompts/schema/results distinguish proven breach, LOW observation and legacy missing confidence while preserving filters.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | adherence requires source inspection and preserves proven breaches while lowering unverified observations | `src/workflow/review-pipeline/__tests__/source-evidence-regression.test.ts` |
| pass | functional-coverage requires source inspection and preserves proven breaches while lowering unverified observations | `src/workflow/review-pipeline/__tests__/source-evidence-regression.test.ts` |

**integration: Both dimensions in single/divided pipeline: helper implementation missing from summaries passes, genuine omission remains HIGH, missing notes/unreadable source remain LOW.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | adherence single source evidence: implemented | `src/workflow/review-pipeline/__tests__/source-evidence-regression.test.ts` |
| pass | adherence single source evidence: omitted | `src/workflow/review-pipeline/__tests__/source-evidence-regression.test.ts` |
| pass | adherence single source evidence: unreadable | `src/workflow/review-pipeline/__tests__/source-evidence-regression.test.ts` |
| pass | adherence divided source evidence: implemented | `src/workflow/review-pipeline/__tests__/source-evidence-regression.test.ts` |
| pass | adherence divided source evidence: omitted | `src/workflow/review-pipeline/__tests__/source-evidence-regression.test.ts` |
| pass | adherence divided source evidence: unreadable | `src/workflow/review-pipeline/__tests__/source-evidence-regression.test.ts` |
| pass | functional-coverage single source evidence: implemented | `src/workflow/review-pipeline/__tests__/source-evidence-regression.test.ts` |
| pass | functional-coverage single source evidence: omitted | `src/workflow/review-pipeline/__tests__/source-evidence-regression.test.ts` |
| pass | functional-coverage single source evidence: unreadable | `src/workflow/review-pipeline/__tests__/source-evidence-regression.test.ts` |
| pass | functional-coverage divided source evidence: implemented | `src/workflow/review-pipeline/__tests__/source-evidence-regression.test.ts` |
| pass | functional-coverage divided source evidence: omitted | `src/workflow/review-pipeline/__tests__/source-evidence-regression.test.ts` |
| pass | functional-coverage divided source evidence: unreadable | `src/workflow/review-pipeline/__tests__/source-evidence-regression.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review-pipeline/__tests__/source-evidence-regression.test.ts` | 0 | 14 | 0.6 s |  |

## t3

Run at 2026-10-25T14:51:59.356Z on commit `b987f9b7a`. Tests check: **passed**. 18 pass, 0 fail, 0 skipped, 0 not found; 2 reported by the builder and not run by the gate.

**integration: Affected review-pipeline and dimension suites plus npm run build pass.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | source inspection routes every review role through bounded read-only sessions | `src/workflow/review-pipeline/__tests__/code-review-source-inspection.test.ts` |
| pass | source-inspecting divided prompts preserve citations and uncertainty instead of closing evidence | `src/workflow/review-pipeline/__tests__/code-review-source-inspection.test.ts` |
| pass | source-inspection driver propagates deadlines and retries sessions without structured fallback | `src/workflow/review-pipeline/__tests__/code-review-source-inspection.test.ts` |
| pass | source-inspection missing session fails rather than fabricating a pass | `src/workflow/review-pipeline/__tests__/code-review-source-inspection.test.ts` |
| pass | adherence requires source inspection and preserves proven breaches while lowering unverified observations | `src/workflow/review-pipeline/__tests__/source-evidence-regression.test.ts` |
| pass | adherence single source evidence: implemented | `src/workflow/review-pipeline/__tests__/source-evidence-regression.test.ts` |
| pass | adherence single source evidence: omitted | `src/workflow/review-pipeline/__tests__/source-evidence-regression.test.ts` |
| pass | adherence single source evidence: unreadable | `src/workflow/review-pipeline/__tests__/source-evidence-regression.test.ts` |
| pass | adherence divided source evidence: implemented | `src/workflow/review-pipeline/__tests__/source-evidence-regression.test.ts` |
| pass | adherence divided source evidence: omitted | `src/workflow/review-pipeline/__tests__/source-evidence-regression.test.ts` |
| pass | adherence divided source evidence: unreadable | `src/workflow/review-pipeline/__tests__/source-evidence-regression.test.ts` |
| pass | functional-coverage requires source inspection and preserves proven breaches while lowering unverified observations | `src/workflow/review-pipeline/__tests__/source-evidence-regression.test.ts` |
| pass | functional-coverage single source evidence: implemented | `src/workflow/review-pipeline/__tests__/source-evidence-regression.test.ts` |
| pass | functional-coverage single source evidence: omitted | `src/workflow/review-pipeline/__tests__/source-evidence-regression.test.ts` |
| pass | functional-coverage single source evidence: unreadable | `src/workflow/review-pipeline/__tests__/source-evidence-regression.test.ts` |
| pass | functional-coverage divided source evidence: implemented | `src/workflow/review-pipeline/__tests__/source-evidence-regression.test.ts` |
| pass | functional-coverage divided source evidence: omitted | `src/workflow/review-pipeline/__tests__/source-evidence-regression.test.ts` |
| pass | functional-coverage divided source evidence: unreadable | `src/workflow/review-pipeline/__tests__/source-evidence-regression.test.ts` |

**live: Updated-code b7a68147dcf72034 s4 re-review: all four prior false HIGH findings absent, with source-backed dispositions.**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/standalone/give-code-review-adherence-functional-coverage-E2026102547e2b818/S001/evidence/four-highs-result.json; docs/standalone/give-code-review-adherence-functional-coverage-E2026102547e2b818/S001/evidence/validation.md: targeted production-judge four-clause re-review returned zero findings; original full s4 CR preserved.

**smoke: Build/regression evidence and successful BUILD/CR presentation are recorded; final review and approval remain mandatory downstream gates.**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/standalone/give-code-review-adherence-functional-coverage-E2026102547e2b818/S001/evidence/validation.md records build/test evidence; four-highs-result.json records real source-inspecting regression; approval-presentation.md records successful insrc_present responses. Current CR is WARN 0 HIGH/1 MED solely for t3's prior status. No BUILD approval granted; final current-BUILD review and explicit user approval remain mandatory downstream framework gates.

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review-pipeline/__tests__/code-review-source-inspection.test.ts` | 0 | 4 | 0.6 s |  |
| `src/workflow/review-pipeline/__tests__/source-evidence-regression.test.ts` | 0 | 14 | 0.5 s |  |
