<!-- insrc:artifact PLAN-a697282df76a3c1d-s1 -->

# Plan: STORY-a697282df76a3c1d-s1

## Summary

**Epic:** `chain-ts-s-next-step-advisor`
**LLD run:** `wf-1795759421306-anlvic`
**LLD effective hash:** `5db5a4f35035...`

Building this Story is three small, independent code/doc edits to src/workflow/chain.ts and docs/workflow.md, followed by one test task that extends the existing chain.ts test suite. Nothing here needs new infrastructure: every fix reuses functions/imports already present (listAmendments, amendmentPath), and every test extends an existing fixture-backed test file. The riskiest piece is review-amendment's new real-artifact lookup (t2); everything else is a mechanical string swap.

## Contents

1. [Epic impact analysis](#1-epic-impact-analysis)
2. [Tasks](#2-tasks)
3. [Test-strategy coverage](#3-test-strategy-coverage)
4. [References](#4-references)

## 1. Epic impact analysis

**Does not apply**: Standalone Story, first and only Story of this Epic; no prior BUILD to analyse.

## 2. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** chain.ts: replace the 6 mechanical dead-string approve-*/sync-tracker sites with real MCP call shapes | S | — | — | unit: computeNextAction returns insrc_workflow_approve/insrc_workflow_step call shapes (not the dead insrc-workflow-CLI strings) for approve-define, approve-hld, approve-lld and sync-tracker, across both the main and issue-anchored branches | [[c1]] |
| 2 | **`t2`** chain.ts: thread firstPendingAmendment through buildChainReport/NextActionInput and fix review-amendment | M | — | — | unit: computeNextAction's review-amendment names a real pending AMD artifact's id and path, selects the FIRST when several are pending, is never entered when none are pending, and never throws in the race-case fallback | [[c2]] |
| 3 | **`t3`** docs/workflow.md: rewrite the two amendment sections' CLI examples to the real mechanism | S | — | — | smoke: Manual inspection: docs/workflow.md's two amendment sections no longer contain the string 'insrc workflow amend' and the surrounding AMD-lifecycle prose is unchanged (no automated test harness exists for this doc) | [[c3]] |
| 4 | **`t4`** Extend chain.test.ts to assert the corrected command content for t1 and t2 | M | — | `t1`, `t2` | unit: chain.test.ts's new/updated assertions for t1 and t2 pass, and chain-issue-anchored.test.ts's existing assertions (including line 225's DEF.md check) pass unmodified | [[c1]] [[c2]] [[c4]] |

### 2.1 TASK-a697282df76a3c1d-s1-t1 — chain.ts: replace the 6 mechanical dead-string approve-*/sync-tracker sites with real MCP call shapes

In computeNextAction, swap the 6 return sites at lines 341, 356, 378, 399, 422 (approve-define x2, approve-hld, approve-lld x2) and 438 (sync-tracker) from `insrc workflow approve/sync ...` to insrc_workflow_approve({artifactPath:"<real path>"}) / insrc_workflow_step(phase='start', workflow='tracker.sync', params={epicHash}) -- pure string swaps, no new data needed, no existing test's .command.includes(...) assertion content changes (the real path string is still embedded).

**Acceptance checks:**
- Every one of the 6 sites' command string matches insrc_workflow_approve({artifactPath:...}) or insrc_workflow_step(phase='start', workflow='tracker.sync', ...) and still contains the real artifact path / epicHash it always did.
- No other NextAction kind's command string (run-define, run-hld, run-lld, push-tracker) changes.

### 2.2 TASK-a697282df76a3c1d-s1-t2 — chain.ts: thread firstPendingAmendment through buildChainReport/NextActionInput and fix review-amendment

Add firstPendingAmendment to NextActionInput, computed in buildChainReport from listAmendments(repoPath, epicHash) filtered to status==='pending' (first in existing deterministic order) mapped via amendmentPath. Update computeNextAction's review-amendment branch (lines 382-388) to return the real amendmentId + a command naming insrc_present + insrc_workflow_approve with that real path, with the non-throwing placeholder fallback for the race case where firstPendingAmendment is undefined despite amendments.pending > 0.

**Acceptance checks:**
- With one pending AMD artifact present, review-amendment's amendmentId equals that artifact's real id and command names its real path.
- With two pending AMD artifacts present, review-amendment names the FIRST in AMD-<hash>-<n> ascending order.
- With zero pending amendments, review-amendment's branch is never entered (unchanged behavior).
- ChainReport.amendments's public shape ({pending,approved,rejected}) and countAmendments()'s return type are unchanged.
- The race-case fallback never throws.

### 2.3 TASK-a697282df76a3c1d-s1-t3 — docs/workflow.md: rewrite the two amendment sections' CLI examples to the real mechanism

Replace the invented `insrc workflow amend <h16> --list/--show/--approve/--reject` code blocks at lines 298-311 and 445-451 with the real mechanism (discover the pending AMD artifact, then insrc_present + insrc_workflow_approve), leaving the surrounding AMD-lifecycle prose unchanged.

**Acceptance checks:**
- Neither section contains the string 'insrc workflow amend' afterward.
- The surrounding prose describing the AMD pending/approved/rejected lifecycle is unchanged.

### 2.4 TASK-a697282df76a3c1d-s1-t4 — Extend chain.test.ts to assert the corrected command content for t1 and t2

Add/extend assertions in src/workflow/__tests__/chain.test.ts (reusing the existing fixture helper) proving t1's 6 corrected sites and t2's review-amendment fix, while confirming chain-issue-anchored.test.ts's existing assertions (notably line 225's `.command.includes('DEF.md')`) still pass unmodified.

**Acceptance checks:**
- New/updated test cases in chain.test.ts cover every acceptance check named in t1 and t2.
- chain-issue-anchored.test.ts is run and its existing assertions pass with zero edits.

## 3. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| src/workflow/chain.ts (computeNextAction, buildChainReport, NextActionInput) | `t1`, `t2`, `t4` |

## 4. References

- **[[c1]]** `code` `src/workflow/chain.ts:320-442`
- **[[c2]]** `prior-artifact` `LLD s1 dataModelChanges[0] NextActionInput field-add + dataModelChanges[1] NextAction review-amendment invariant-change`
- **[[c3]]** `prior-artifact` `LLD s1 dataModelChanges[2] docs/workflow.md amendment sections`
- **[[c4]]** `code` `src/workflow/__tests__/chain-issue-anchored.test.ts:225`
