<!-- insrc:artifact PLAN-03f4fd3b9102aab8-s4 -->

# Plan: STORY-03f4fd3b9102aab8-s4

## Summary

**Epic:** `review-rounds-reconciliation-recovery`
**LLD run:** `wf-1795155781279-hewvfb`
**LLD effective hash:** `6d57abfa68ac...`

Building s4 means adding one new module, src/workflow/review-round/review-report.ts, that composes a round's findings (plus s3's reconciliation verdicts, for round>1) into a persisted Markdown file and returns its path -- the same shape, conventions and test seams s3's reconciliation.ts already established in this Epic. t1 lands the type, the function, and its compile-time proof; t2 lands the full named test suite proving every acceptance criterion and error/edge case the LLD names.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add ReviewReportDocgenCall and renderReviewReport | M | — | — | unit: renderReviewReport writes a persisted Markdown file under the review's own .insrc/tmp/<reviewId>/ directory and returns its path | [[c1]] [[c2]] |
| 2 | **`t2`** Add the full named test suite for renderReviewReport/ReviewReportDocgenCall | M | — | `t1` | unit: the written Markdown renders every finding in this round's own findings array, each annotated with its category and severity; unit: for round 1, the rendered Markdown carries no reconciliation annotation section at all, since no prior round exists to reconcile against; unit: for round greater than 1, the rendered Markdown inlines each reconciliation result's verdict next to the prior finding it refers to (via priorFindings), limited to only the findings this round's own reconciliation classified -- never a running audit of all history; unit: a reviewId containing a path-traversal segment is rejected before any filesystem access; unit: a non-positive-integer round is rejected with a RangeError before any write; unit: when the reviewed repository cannot be resolved, renderReviewReport rejects rather than silently defaulting to the daemon process's own cwd; unit: a rejecting filesystem write propagates its rejection rather than returning a path to a file that was never actually written; unit: an empty findings array still renders successfully with an explicit statement that no findings were produced this round; unit: the returned markdown is exactly the persisted file's own content, which the caller presents directly to satisfy ac3 -- insrc_present (confirmed against its real handler) never applies to a review-report | [[c3]] |

### 1.1 TASK-03f4fd3b9102aab8-s4-t1 — Add ReviewReportDocgenCall and renderReviewReport

New module src/workflow/review-round/review-report.ts: ReviewReportDocgenCall{reviewId,round} (sc4's interfaceSketch), and renderReviewReport(call, findings, reconciliation, priorFindings) composing a Markdown string from findings (+ reconciliation annotations scoped to the adjacent round pair, for round>1) and persisting it under the reviewed repository's .insrc/tmp/<reviewId>/ directory, returning the written path. Reuses s3's established conventions verbatim: requireValidReviewId-style literal-identifier validation, RangeError for an invalid round (matching runReviewRound), resolveRepoPath-based canonical repo resolution (never process cwd), and a _setReviewReportDepsForTests test seam. Includes the compile-time typecheck fixture (__type-tests__/review-report.typecheck.ts) proving ReviewReportDocgenCall's exact field shape.

**Acceptance checks:**
- ReviewReportDocgenCall and renderReviewReport are exported exactly as contractDetails/dataModelChanges specify, with the corrected four-parameter signature (call, findings, reconciliation, priorFindings) per the resolved open question
- renderReviewReport validates call.reviewId (literal-identifier) and call.round (positive integer, RangeError) before any path join or filesystem write, per errorPaths
- renderReviewReport resolves the reviewed repository through the canonical resolver (never the daemon process's own cwd) and writes exactly one Markdown file under its .insrc/tmp/<call.reviewId>/ directory, returning that path
- the typecheck fixture rejects an added/removed ReviewReportDocgenCall key via @ts-expect-error / Equal<keyof ReviewReportDocgenCall,...>
- a rejecting filesystem write propagates its rejection unchanged rather than returning a path to a file that was never written

### 1.2 TASK-03f4fd3b9102aab8-s4-t2 — Add the full named test suite for renderReviewReport/ReviewReportDocgenCall

One it() per testStrategy.testLevels subject (10 total) in __tests__/review-report.test.ts, matching ac1-ac3's acceptanceMapping.provingTests verbatim, using _setReviewReportDepsForTests to inject a stub repo-resolution dependency and sample Finding/ReconciliationResult fixtures (including a reconciliation entry whose priorFindingRef has no matching priorFindings entry), plus a temp-directory fixture standing in for .insrc/tmp/<reviewId>/.

**Acceptance checks:**
- All 10 named test subjects from testStrategy.testLevels[0].subjects exist as individual it() cases with matching titles
- ac1, ac2 and ac3's acceptanceMapping.provingTests all pass
- npx tsx --test for the new test file passes with zero failures

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| renderReviewReport writes a persisted Markdown file under the review's own .insrc/tmp/<reviewId>/ directory and returns its path | `t1` |
| the written Markdown renders every finding in this round's own findings array, each annotated with its category and severity | `t2` |
| for round 1, the rendered Markdown carries no reconciliation annotation section at all, since no prior round exists to reconcile against | `t2` |
| for round greater than 1, the rendered Markdown inlines each reconciliation result's verdict next to the prior finding it refers to (via priorFindings), limited to only the findings this round's own reconciliation classified -- never a running audit of all history | `t2` |
| a reviewId containing a path-traversal segment is rejected before any filesystem access | `t2` |
| a non-positive-integer round is rejected with a RangeError before any write | `t2` |
| when the reviewed repository cannot be resolved, renderReviewReport rejects rather than silently defaulting to the daemon process's own cwd | `t2` |
| a rejecting filesystem write propagates its rejection rather than returning a path to a file that was never actually written | `t2` |
| an empty findings array still renders successfully with an explicit statement that no findings were produced this round | `t2` |
| the returned markdown is exactly the persisted file's own content, which the caller presents directly to satisfy ac3 -- insrc_present (confirmed against its real handler) never applies to a review-report | `t2` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s4 contractDetails`
- **[[c2]]** `prior-artifact` `LLD s4 errorPaths`
- **[[c3]]** `prior-artifact` `LLD s4 testStrategy`
