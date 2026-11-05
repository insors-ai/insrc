<!-- insrc:artifact ISSUE-599f1d0bd42e0c37 -->

# Reconcile later submitted fixes before reporting stale task-version defects

## Reproduction

Priority: HIGH. Run whole-story review code-review-9b04adb36cac716d-s3-r1 over all nine S3 commits. Task t3 reports a MED for history[0]?.report in commit f0d5da047 and says the included t9 commit 76d3d899a fixes it and adds a passing regression, yet the older defect remains blocking. Task t6 similarly discusses progress behavior already addressed by t8. Expected: judge the effective submitted story state while preserving explicit selected segments and commit provenance, not unrelated HEAD changes. Observed CR is failed after 37m35s. [[c1]] [[c2]]

## Root cause

The assessment accepted an intermediate task version as the final defect scope even after recognizing a later fix inside the same submitted review set. Task-specific commit attribution and final-story correctness were not reconciled in the resulting CR. This semantic failure is directly evidenced by t3 and t9; the precise packet/prompt/host policy correction still requires design, rather than assuming a generic HEAD diff. [[c1]] [[c2]] [[c3]]

## Fix intent

Make task-level assessment and whole-story completion account for later superseding changes within the explicitly submitted review set. Preserve commits as lookup pointers and selected after-blocks/deletion anchors as scope; never broaden to HEAD, ignore selected modules or erase genuine unresolved findings. Add a regression where task A introduces a defect, task B fixes it in the same packet, and final feedback distinguishes historical diagnosis from an unresolved final defect. Retain actual uncovered provenance-test cases as separate findings; this issue does not dismiss the valid S3 requiredReferences finding. Log only, pending approval. [[c1]] [[c2]] [[c3]]

## Citations

- **[[c1]]** `doc` `.insrc/tmp/code-review/code-review-9b04adb36cac716d-s3-r1.json`
- **[[c2]]** `doc` `docs/epics/review-evolving-designs-durable-checkpoints-E202611039b04adb3/S003/CR.md`
- **[[c3]]** `code` `src/workflow/code-review/task-review/assessment.ts`
