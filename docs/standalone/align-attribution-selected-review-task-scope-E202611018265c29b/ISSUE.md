<!-- insrc:artifact ISSUE-8265c29b742709db -->

# Align attribution with the selected review task scope

## Reproduction

Review review-e6ddcdcb-s4-t4-live-20261101 attempt2 targeted only task t4 from a five-task Plan, but failed before assessment with 'attribution: Every applicable task needs exactly one derived scope'. A model-free reproduction confirms the generic reassessment schema accepts rows for all five Plan tasks while host selection accepts only t4. The exact native returned task IDs were not retained, so those IDs are not asserted. [[c1]] [[c2]] [[c3]]

## Root cause

attributionPrompt requests every Plan task even for a task-scoped packet. attributionSchema selects only initial versus reassessment format and does not bind task IDs or row count to the selected scope. deriveTaskAssignments correctly filters by packet.taskId and rejects mismatching scope sets. Daemon and controller consume the same inconsistent prompt/schema contract. [[c1]] [[c2]]

## Fix intent

Make attribution instructions and native output constraints agree with the exact applicable task selection on initial and subsequent attempts: only the selected task for task reviews, all applicable tasks for story reviews. Retain strict host rejection of missing, extra, foreign or duplicate scopes and omitted change/test attribution. Preserve historical attempts, reassess/reuse policy and reviewer independence. Add focused deterministic single-task re-review, whole-story and route-parity regressions; do not start another live review or change stored result shapes. [[c1]] [[c2]]

## Citations

- **[[c1]]** `code` `src/workflow/code-review/task-review/assessment.ts`
- **[[c2]]** `code` `src/workflow/code-review/task-review/packet.ts`
- **[[c3]]** `stakeholder` `User requested fixing the scope mismatch before rerunning the review.`
