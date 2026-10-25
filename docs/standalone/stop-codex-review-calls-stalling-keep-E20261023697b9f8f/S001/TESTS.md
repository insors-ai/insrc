<!-- insrc:artifact TESTS-697b9f8ff46b9deb-S001 -->

# Tests: 697b9f8ff46b9deb S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 30 pass, 0 fail, 0 skipped, 0 not found; 2 reported by the builder and not run by the gate.

## t1

Run at 2026-10-24T07:24:47.778Z on commit `31fc8410`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: a structured codex call with stallMs kills a run that prints no output and throws CliStallError**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a structured codex call with stallMs kills a run that prints no output and throws CliStallError | `src/agent/providers/__tests__/cli-review-session.test.ts` |

**unit: a structured codex call with stallMs kills a run that prints an item event and then goes silent, stallMs after its last output**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a structured codex call with stallMs kills a run that prints an item event and then goes silent, stallMs after its last output | `src/agent/providers/__tests__/cli-review-session.test.ts` |

**unit: a structured codex call that keeps printing within stallMs completes, and without stallMs no watchdog is armed**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a structured codex call that keeps printing within stallMs completes, and without stallMs no watchdog is armed | `src/agent/providers/__tests__/cli-review-session.test.ts` |

**unit: claude ignores stallMs and reviewer sessions keep the first-output watchdog**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | claude ignores stallMs and reviewer sessions keep the first-output watchdog | `src/agent/providers/__tests__/cli-review-session.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/agent/providers/__tests__/cli-review-session.test.ts` | 0 | 22 | 30 s |  |

## t2

Run at 2026-10-24T07:27:57.715Z on commit `c46a4e8b`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: a codex reply that breaks the caller's schema throws ModelResponseShapeError carrying the validation reasons**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a codex reply that breaks the caller's schema throws ModelResponseShapeError carrying the validation reasons | `src/agent/providers/__tests__/cli-codex-strict-schema.test.ts` |

**unit: a review call rejected by the reply check is classified invalid-answer and re-issued with a correction note carrying the reasons**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a review call rejected by the reply check is classified invalid-answer and re-issued with a correction note carrying the reasons | `src/workflow/review-pipeline/__tests__/pipeline-job.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/agent/providers/__tests__/cli-codex-strict-schema.test.ts` | 0 | 9 | 1.6 s |  |
| `src/workflow/review-pipeline/__tests__/pipeline-job.test.ts` | 0 | 23 | 0.6 s |  |

## t3

Run at 2026-10-24T07:31:50.261Z on commit `23a8c90a`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: VERIFY_SCHEMA and VERDICTS_SCHEMA bound evidence, action, rationale, edits and options, and an answer over a bound fails validation**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | VERIFY_SCHEMA and VERDICTS_SCHEMA bound evidence, action, rationale, edits and options, and an answer over a bound fails validation | `src/workflow/review/__tests__/verify-answer.test.ts` |

**unit: the verify SYSTEM rules ask for an always-present proposedFix with empty fields when there is no fix and no longer tell the model to omit fields, in both the single and batched prompts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the verify SYSTEM rules ask for an always-present proposedFix with empty fields when there is no fix and no longer tell the model to omit fields, in both the single and batched prompts | `src/workflow/review/__tests__/verify-answer.test.ts` |

**unit: a no-fix answer with an empty rationale normalises to a finding without proposedFix, and one with a rationale keeps a rationale-only proposedFix**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a no-fix answer with an empty rationale normalises to a finding without proposedFix, and one with a rationale keeps a rationale-only proposedFix | `src/workflow/review/__tests__/verify-answer.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review/__tests__/verify-answer.test.ts` | 0 | 3 | 0.7 s |  |

## t4

Run at 2026-10-24T07:36:00.828Z on commit `dcd6b674`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: a review pipeline call that stalls is re-issued up to three times, while an invalid answer is re-issued only once**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a review pipeline call that stalls is re-issued up to three times, while an invalid answer is re-issued only once | `src/workflow/review-pipeline/__tests__/pipeline-job.test.ts` |

**unit: a claim whose three attempts stall, or two stalls then a transient failure, is recorded as not judged with a message naming three attempts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a claim whose three attempts stall, or two stalls then a transient failure, is recorded as not judged with a message naming three attempts | `src/workflow/review-pipeline/__tests__/pipeline-job.test.ts` |

**unit: ReviewCallFailedError names the real attempt count and an older NotJudged without attempts still renders**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ReviewCallFailedError names the real attempt count and an older NotJudged without attempts still renders | `src/workflow/review-pipeline/__tests__/pipeline-job.test.ts` |

**unit: the pipeline driver forwards a structured call's stallMs to completeStructured**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the pipeline driver forwards a structured call's stallMs to completeStructured | `src/workflow/review-pipeline/__tests__/pipeline-job.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review-pipeline/__tests__/pipeline-job.test.ts` | 0 | 27 | 0.7 s |  |

## t5

Run at 2026-10-24T11:51:42.621Z on commit `5b3ac0e5d`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: a codex reviewer session given stallMs is killed after that much stdout silence, also after an early item event, and throws CliStallError**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a codex reviewer session given stallMs is killed after that much stdout silence, also after an early item event, and throws CliStallError | `src/agent/providers/__tests__/cli-review-session.test.ts` |

**unit: a codex reviewer session without stallMs keeps the first-output watchdog: model output printed early then a long silence is not a stall**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a codex reviewer session without stallMs keeps the first-output watchdog: model output printed early then a long silence is not a stall | `src/agent/providers/__tests__/cli-review-session.test.ts` |

**unit: the pipeline driver forwards a reviewer-session call's stallMs to runReviewSession**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the pipeline driver forwards a reviewer-session call's stallMs to runReviewSession | `src/workflow/review-pipeline/__tests__/pipeline-job.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/agent/providers/__tests__/cli-review-session.test.ts` | 0 | 24 | 37.1 s |  |
| `src/workflow/review-pipeline/__tests__/pipeline-job.test.ts` | 0 | 28 | 0.8 s |  |

## t6

Run at 2026-10-24T12:02:58.443Z on commit `b63b2c408`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: REVIEW_CALL_LIMITS holds the five call-type rows, every silence limit is below its call's total limit, and VERIFY_CALL_TIMEOUT_MS and VERIFY_CALL_STALL_MS come from the design-verify row**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | REVIEW_CALL_LIMITS holds the five call-type rows, every silence limit is below its call's total limit, and VERIFY_CALL_TIMEOUT_MS and VERIFY_CALL_STALL_MS come from the design-verify row | `src/workflow/review/__tests__/call-limits.test.ts` |
| pass | every premise judgement carries the design-verify cap and silence limit | `src/workflow/review/__tests__/review.test.ts` |

**unit: the design-review extract, verify and template-session executions send their REVIEW_CALL_LIMITS row's silence limit and cap**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the design-review extract, verify and template-session executions send their REVIEW_CALL_LIMITS row's silence limit and cap | `src/workflow/review/__tests__/call-limits.test.ts` |
| pass | an under-limit DEF review makes one extract call, a probe and one verify call per premise with the design-verify limits; extraction failing fails the review, a verify call failing twice records the premise as not judged | `src/workflow/review-pipeline/__tests__/single-chunk-parity.test.ts` |

**unit: every code-review execution, the controller's included, sends the code-review row's 300 s silence limit and 600 s cap**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | every code-review execution, the controller's included, sends the code-review row's 300 s silence limit and 600 s cap | `src/workflow/review/__tests__/call-limits.test.ts` |

**unit: verifyClaim sends stallMs 90 s and timeoutMs 600 s**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | verifyClaim sends stallMs 90 s and timeoutMs 600 s | `src/workflow/review/__tests__/call-limits.test.ts` |

**unit: the build-validation session is run with stallMs 90 s and deadlineMs JUDGE_DEADLINE_MS**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the build-validation session is run with stallMs 90 s and deadlineMs JUDGE_DEADLINE_MS | `src/daemon/steps/build-step/__tests__/build-step.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/steps/build-step/__tests__/build-step.test.ts` | 0 | 65 | 15 s |  |
| `src/workflow/review-pipeline/__tests__/single-chunk-parity.test.ts` | 0 | 7 | 0.7 s |  |
| `src/workflow/review/__tests__/call-limits.test.ts` | 0 | 4 | 0.5 s |  |
| `src/workflow/review/__tests__/review.test.ts` | 0 | 11 | 0.6 s |  |

## t7

Run at 2026-10-24T12:05:33.665Z on commit `b54856692`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: a template review that stalls twice and then gets an invalid answer fails with a message naming three attempts, and two invalid answers report two attempts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a template review that stalls twice and then gets an invalid answer fails with a message naming three attempts, and two invalid answers report two attempts | `src/workflow/review/__tests__/template-review.test.ts` |
| pass | T10 a second invalid answer fails the review | `src/workflow/review/__tests__/template-review.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review/__tests__/template-review.test.ts` | 0 | 19 | 0.7 s |  |

## t8

Run at 2026-10-24T12:07:50.751Z on commit `03539ccc0`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: workflow.review sends a heartbeat frame every 60 s while a review runs and none after the terminal frame, and its stage frames are unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | workflow.review sends a heartbeat frame every 60 s while a review runs and none after the terminal frame, and its stage frames are unchanged | `src/daemon/__tests__/workflow-review-rpc.test.ts` |
| pass | T12 a controller-authored LLD: progress frames, then done with the verdict and reviewedBy daemon | `src/daemon/__tests__/workflow-review-rpc.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/workflow-review-rpc.test.ts` | 0 | 6 | 0.8 s |  |

## t9

Run at 2026-10-24T12:11:58.905Z on commit `18d2672b2`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: insrc_review_step through step.call relays every daemon progress frame, heartbeats included, as a 'progress' frame before 'done'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | insrc_review_step through step.call relays every daemon progress frame, heartbeats included, as a 'progress' frame before 'done' | `src/daemon/steps/__tests__/step-host.test.ts` |

**integration: a healthy design review longer than 15 minutes completes while heartbeats flow, and a daemon that sends no frame for 5 minutes fails with an idle timeout naming the idle limit**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a healthy design review longer than 15 minutes completes while heartbeats flow, and a daemon that sends no frame for 5 minutes fails with an idle timeout naming the idle limit | `src/daemon/steps/review-step/__tests__/review-step-routing.test.ts` |
| pass | T11 against an older daemon (a plain unknown-method line, socket kept open) the tool fails at once with the update message | `src/daemon/steps/review-step/__tests__/review-step-routing.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/steps/__tests__/step-host.test.ts` | 0 | 9 | 1.1 s |  |
| `src/daemon/steps/review-step/__tests__/review-step-routing.test.ts` | 0 | 21 | 0.6 s |  |

## t10

Run at 2026-10-24T17:54:57.031Z on commit `a3f10db3e`. Tests check: **passed**. 0 pass, 0 fail, 0 skipped, 0 not found; 2 reported by the builder and not run by the gate.

the gate ran no test: every named test of this Task was reported by the builder

**live: codex accepts the strict copy of the bounded VERIFY_SCHEMA and a real verify call returns a finding that passes the reply check**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/standalone/stop-codex-review-calls-stalling-keep-E20261023697b9f8f/S001/evidence/t10-live-verify.md (commit 4992fdc2)

**smoke: a real DEF review on the rebuilt daemon completes without a stall and relays progress to the controller**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/standalone/stop-codex-review-calls-stalling-keep-E20261023697b9f8f/S001/evidence/t10-def-smoke.md + t10-progress-capture.json (commit a3f10db3): 97 notifications received by an MCP client over a 19m53s real DEF review
