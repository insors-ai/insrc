<!-- insrc:artifact TESTS-0765b3a578e43eec-s3 -->

# Tests: 0765b3a578e43eec s3

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 30 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-11-24T04:53:33.388Z on commit `78f2e8441`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: deriveReceiptIdentity: same contentIdentity re-derives the identical pair; a different identity derives a different pair**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | deriveReceiptIdentity: same contentIdentity re-derives the identical pair; a different identity derives a different pair | `src/workflow/security-review/__tests__/run-security-review.test.ts` |

**unit: deriveReceiptIdentity's output round-trips through a REAL persistVerificationReceipt + readReceiptRecord call without being rejected by the storage layer**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | deriveReceiptIdentity's output round-trips through a REAL persistVerificationReceipt + readReceiptRecord call without being rejected by the storage layer | `src/workflow/security-review/__tests__/run-security-review.test.ts` |

**unit: verifyContentIdentityMatch: resolves on a match with contentStable:true; throws on identity mismatch; throws on contentStable:false even when identity matches**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | verifyContentIdentityMatch: resolves on a match with contentStable:true; throws on identity mismatch; throws on contentStable:false even when identity matches | `src/workflow/security-review/__tests__/run-security-review.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/security-review/__tests__/run-security-review.test.ts` | 0 | 3 | 0.7 s |  |

## t2

Run at 2026-11-26T08:40:42.401Z on commit `015898b0e`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: buildSecurityRoundHooks: hooks.ground always resolves to [] without I/O; hooks.security delegates to the injected code-pass function**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | buildSecurityRoundHooks: hooks.ground always resolves to [] without I/O; hooks.security delegates to the injected code-pass function | `src/workflow/security-review/__tests__/security-round-hooks.test.ts` |

**unit: CapabilityQualificationTable lookup for 'cli-claude' (qualified), 'cli-codex' (not qualified), 'ollama' (qualified trivially)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CapabilityQualificationTable: 'claude' is qualified for strict-read-analyze | `src/agent/providers/__tests__/capability-qualification.test.ts` |
| pass | CapabilityQualificationTable: 'codex' is NOT qualified for strict-read-analyze | `src/agent/providers/__tests__/capability-qualification.test.ts` |
| pass | CapabilityQualificationTable: 'ollama' is qualified for strict-read-analyze | `src/agent/providers/__tests__/capability-qualification.test.ts` |

**unit: CliProvider.runReadOnlySession throwing UnqualifiedCapabilityPolicyError for an unqualified provider + capabilityPolicy:'strict-read-analyze' before spawning any subprocess**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | runReadOnlySession rejects an unqualified provider's strict-read-analyze request before spawning any subprocess | `src/agent/providers/__tests__/cli-readonly-session.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/agent/providers/__tests__/capability-qualification.test.ts` | 0 | 5 | 0.4 s |  |
| `src/agent/providers/__tests__/cli-readonly-session.test.ts` | 0 | 46 | 44.8 s |  |
| `src/workflow/security-review/__tests__/security-round-hooks.test.ts` | 0 | 1 | 0.6 s |  |

## t3

Run at 2026-11-25T15:35:16.751Z on commit `e08a38ca3`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: Already covered by the prior BUILD record's test run; no new test required by this re-plan.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | assembleSecurityReport: confirmed matches map to dependency-advisory SecurityFindings with checkId:'dependency-advisory' and NO receiptId; round-1/round-2 code findings keep whatever receiptId they already carry | `src/workflow/security-review/__tests__/run-security-review.test.ts` |
| pass | assembleSecurityReport: unresolvedDependencies/unavailableSources pass through verbatim; empty inputs produce an empty findings array | `src/workflow/security-review/__tests__/run-security-review.test.ts` |
| pass | assembleSecurityReport: effectiveModel equals modelSelection exactly as passed in, even when it differs from the repo-configured tier default | `src/workflow/security-review/__tests__/run-security-review.test.ts` |
| pass | assembleSecurityReport: reconciliation and receipts are carried through verbatim; baseReportMarkdown is the supplied base markdown | `src/workflow/security-review/__tests__/run-security-review.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/security-review/__tests__/run-security-review.test.ts` | 0 | 7 | 0.7 s |  |

## t4

Run at 2026-11-26T08:34:51.711Z on commit `015898b0e`. Tests check: **passed**. 11 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: a targets.entries path resolving outside repoPath throws synchronously before any I/O is attempted**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a targets.entries path resolving outside repoPath throws SYNCHRONOUSLY (never a rejected Promise) with no dispatch, before any receipt or round work | `src/workflow/security-review/__tests__/run-security-review-orchestrator.test.ts` |

**integration: runSecurityReview invoked from inside an ALREADY-BOUND step context (a real connectionExecution set via runInStepContext in the test) succeeds**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | runSecurityReview binds the call to a step context over repoPath, preserving an already-bound outer connectionExecution | `src/workflow/security-review/__tests__/run-security-review-orchestrator.test.ts` |

**integration: runSecurityReview refuses before any round dispatches on modelSelection.status:'unavailable', verified via the fake CLI session never being called**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | refuses before any round dispatches when modelSelection.status is 'unavailable'; the fake CLI session is never called | `src/workflow/security-review/__tests__/run-security-review-orchestrator.test.ts` |

**integration: runSecurityReview refuses before any round dispatches on a contentIdentity mismatch**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | refuses before any round dispatches when the pre-flight verifyContentIdentityMatch fails, and no receipt is persisted | `src/workflow/security-review/__tests__/run-security-review-orchestrator.test.ts` |

**integration: runSecurityReview persists ONE VerificationReceipt per round (round1, round2), each with the correct result; a round-1 failure persists only round1's fail receipt and never dispatches round 2**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | persists exactly ONE VerificationReceipt per round, both 'pass' on a clean run; epicHash/storyId supplied are threaded through unchanged | `src/workflow/security-review/__tests__/run-security-review-orchestrator.test.ts` |
| pass | a round's own execution failure persists only that round's 'fail' receipt and never dispatches a later round | `src/workflow/security-review/__tests__/run-security-review-orchestrator.test.ts` |

**integration: runSecurityReview reverifies contentIdentity before round 2 and before finalization; a repository edit injected between round 1 and round 2 is caught and aborts with ContentIdentityMismatchError, with round1's receipt already durably persisted as 'pass' from before the edit**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | reverifies contentIdentity before round 2: a repository edit injected between round 1 and round 2 is caught and aborts with ContentIdentityMismatchError, with round 1's receipt already durably persisted as pass | `src/workflow/security-review/__tests__/run-security-review-orchestrator.test.ts` |
| pass | reverifies contentIdentity immediately before final persistence too: a repository edit injected after round 2 completes is caught and aborts with ContentIdentityMismatchError, with BOTH round receipts already durably persisted as pass | `src/workflow/security-review/__tests__/run-security-review-orchestrator.test.ts` |

**integration: runSecurityReview run with repoPath=B while the test harness's own ambient cwd is A: writeCheckpoint/reconcileRound/renderReviewReport/finalizeAndCleanup all read/write under B, never A**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | run with repoPath=B while the test harness's own ambient cwd is A: checkpoint/reconciliation/report-render/cleanup resolve the repo through runSecurityReview's OWN step-context binding, never through a test-hardcoded override, and never resolve to A | `src/workflow/security-review/__tests__/run-security-review-orchestrator.test.ts` |

**integration: SecurityReviewReport.effectiveModel matches the modelSelection actually passed in, in a case where it differs from the repo's currently-configured tier default**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | integration: SecurityReviewReport.effectiveModel matches the modelSelection actually passed in, in a case where it differs from the repo's currently-configured tier default | `src/workflow/security-review/__tests__/run-security-review-orchestrator.test.ts` |

**integration: two sequential runSecurityReview calls with the SAME reviewId -- the first failing a round, the second succeeding -- persist TWO distinct receipts per round slot (different attemptId); the first attempt's 'fail' receipt is never overwritten**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | two sequential calls with the SAME reviewId -- the first failing at ROUND 2, the second succeeding -- persist TWO distinct receipts in EACH round slot; neither attempt's receipt is ever overwritten | `src/workflow/security-review/__tests__/run-security-review-orchestrator.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/security-review/__tests__/run-security-review-orchestrator.test.ts` | 0 | 13 | 1.1 s |  |

## t5

Run at 2026-11-26T05:13:11.592Z on commit `5349cee4e`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: handleSecurityReviewStep: a stale-index fresh request returns confirm_wait with a state token, never runs a round; a resumed call with proceed:true or proceed:false both reach done; epicHash/storyId supplied on the request are threaded into the persisted receipt unchanged, while an omitted pair is derived via deriveReceiptIdentity with standalone:true**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a fresh request against a repo with a STALE index returns {next:"confirm_wait", state, guidance} without running resolveSecurityModel, collectDependencyAdvisories, or any round | `src/workflow/security-review/__tests__/handle-security-review-step.test.ts` |
| pass | a resumed call ({phase:'start', state, proceed:true}) waits for the index before running the review end-to-end to done, with degraded:false | `src/workflow/security-review/__tests__/handle-security-review-step.test.ts` |
| pass | a resumed call ({phase:'start', state, proceed:false}) runs the review against the index as-is (a degraded run) and still reaches done with a fully populated report, with degraded:true and a coverage-status note in the markdown | `src/workflow/security-review/__tests__/handle-security-review-step.test.ts` |
| pass | epicHash/storyId supplied on the ORIGINAL request are passed straight through into runSecurityReview's opts unchanged, never re-derived or second-guessed here | `src/workflow/security-review/__tests__/handle-security-review-step.test.ts` |
| pass | integration: handleSecurityReviewStep: a fresh-index request calls the REAL runSecurityReview; epicHash/storyId supplied on the request land unchanged in the persisted receipt, while an omitted pair is derived via deriveReceiptIdentity with standalone:true -- the repo IS genuinely registered here (via the SAME content-identity seam this test already wires), proving admission is not merely faked away | `src/workflow/security-review/__tests__/handle-security-review-step.test.ts` |
| pass | integration: a STALE-index request pauses at confirm_wait, then a resumed proceed:false call runs the REAL runSecurityReview degraded and persists receipts; a separate resumed proceed:true call waits for freshness before running it | `src/workflow/security-review/__tests__/handle-security-review-step.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/security-review/__tests__/handle-security-review-step.test.ts` | 0 | 22 | 1.1 s |  |

## t6

Run at 2026-11-25T18:31:09.247Z on commit `11e552c56`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**smoke: calling the registered insrc_security_review_step tool end-to-end (fresh request, fresh index) returns a next:'done' response with a real report and markdown**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | smoke: calling the REGISTERED insrc_security_review_step tool through the real step.call dispatch (createStepCallHandler + stepToolTable), with a fresh index, reaches {next:'done'} with a REAL report and markdown -- proving the registration -> handler wiring is live, not just type-checked | `src/daemon/steps/__tests__/security-review-step.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/steps/__tests__/security-review-step.test.ts` | 0 | 6 | 1.2 s |  |
