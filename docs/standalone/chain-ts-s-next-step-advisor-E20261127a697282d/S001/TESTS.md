<!-- insrc:artifact TESTS-a697282df76a3c1d-s1 -->

# Tests: a697282df76a3c1d s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 20 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

## t1

Run at 2026-11-27T06:38:21.063Z on commit `7fe153d11`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: computeNextAction returns insrc_workflow_approve/insrc_workflow_step call shapes (not the dead insrc-workflow-CLI strings) for approve-define, approve-hld, approve-lld and sync-tracker, across both the main and issue-anchored branches**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | chain: unapproved Define → approve-define | `src/workflow/__tests__/chain.test.ts` |
| pass | chain: unapproved HLD → approve-hld | `src/workflow/__tests__/chain.test.ts` |
| pass | chain: unapproved LLD blocks the chain → approve-lld | `src/workflow/__tests__/chain.test.ts` |
| pass | unapproved ISSUE yields approve-define naming the ISSUE document | `src/workflow/__tests__/chain-issue-anchored.test.ts` |
| pass | next actions follow run-lld, approve-lld, chain-complete and never name an HLD, amendment, stale or tracker step | `src/workflow/__tests__/chain-issue-anchored.test.ts` |
| pass | the stored TrackerMeta gains no field and the sync-tracker next action names the explicit refresh | `src/workflow/__tests__/chain-report-tracker.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/chain-issue-anchored.test.ts` | 0 | 9 | 1.7 s |  |
| `src/workflow/__tests__/chain-report-tracker.test.ts` | 0 | 2 | 0.6 s |  |
| `src/workflow/__tests__/chain.test.ts` | 0 | 9 | 0.6 s |  |

## t2

Run at 2026-11-27T06:55:21.075Z on commit `589390622`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: computeNextAction's review-amendment names a real pending AMD artifact's id and path, selects the FIRST when several are pending, is never entered when none are pending, and never throws in the race-case fallback**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | chain: pending amendment surfaces before further LLDs | `src/workflow/__tests__/chain.test.ts` |
| pass | chain: two pending amendments → review-amendment names the first in ascending order | `src/workflow/__tests__/chain.test.ts` |
| pass | computeNextAction: review-amendment race fallback never throws when firstPendingAmendment is undefined | `src/workflow/__tests__/chain.test.ts` |
| pass | chain: unapproved LLD blocks the chain → approve-lld | `src/workflow/__tests__/chain.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/chain.test.ts` | 0 | 11 | 0.8 s |  |

## t3

Run at 2026-11-27T06:56:10.820Z on commit `589390622`. Tests check: **passed**. 0 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

the gate ran no test: every named test of this Task was reported by the builder

**smoke: Manual inspection: docs/workflow.md's two amendment sections no longer contain the string 'insrc workflow amend' and the surrounding AMD-lifecycle prose is unchanged (no automated test harness exists for this doc)**

Reported by the builder, not run by the gate: **pass**. Evidence: grep -n 'insrc workflow amend' docs/workflow.md returns no matches (exit 1); git diff docs/workflow.md shows only the two amendment code blocks replaced, with the AMD-lifecycle prose (pending/validated/persisted, folded into the effective HLD, LLDs marked stale) left unchanged

## t4

Run at 2026-11-27T06:57:11.881Z on commit `589390622`. Tests check: **passed**. 10 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: chain.test.ts's new/updated assertions for t1 and t2 pass, and chain-issue-anchored.test.ts's existing assertions (including line 225's DEF.md check) pass unmodified**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | chain: unapproved Define → approve-define | `src/workflow/__tests__/chain.test.ts` |
| pass | chain: unapproved HLD → approve-hld | `src/workflow/__tests__/chain.test.ts` |
| pass | chain: unapproved LLD blocks the chain → approve-lld | `src/workflow/__tests__/chain.test.ts` |
| pass | chain: pending amendment surfaces before further LLDs | `src/workflow/__tests__/chain.test.ts` |
| pass | chain: two pending amendments → review-amendment names the first in ascending order | `src/workflow/__tests__/chain.test.ts` |
| pass | computeNextAction: review-amendment race fallback never throws when firstPendingAmendment is undefined | `src/workflow/__tests__/chain.test.ts` |
| pass | unapproved ISSUE yields approve-define naming the ISSUE document | `src/workflow/__tests__/chain-issue-anchored.test.ts` |
| pass | next actions follow run-lld, approve-lld, chain-complete and never name an HLD, amendment, stale or tracker step | `src/workflow/__tests__/chain-issue-anchored.test.ts` |
| pass | the DEF-anchored next-action sequence is unchanged | `src/workflow/__tests__/chain-issue-anchored.test.ts` |
| pass | the stored TrackerMeta gains no field and the sync-tracker next action names the explicit refresh | `src/workflow/__tests__/chain-report-tracker.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/chain-issue-anchored.test.ts` | 0 | 9 | 1.1 s |  |
| `src/workflow/__tests__/chain-report-tracker.test.ts` | 0 | 2 | 0.7 s |  |
| `src/workflow/__tests__/chain.test.ts` | 0 | 11 | 0.6 s |  |
