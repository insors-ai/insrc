<!-- insrc:artifact ISSUE-146084d04395b88b -->

# Make rejected code-review reuse actionable

## Reproduction

Complete review attempt 2 with passed T2 and T5. Rerun corrective validation, changing the committed TESTS evidence file assigned to T5 while T2 inputs remain unchanged. Submit a subsequent attribution requesting reuse of both tasks. In design-s4-code-20261108 attempt 3, the host returned only 'origins: Relevant task inputs changed; reassessment required'. Three attribution submissions were rejected; no task scope was accepted and all tasks became unassessed. Expected: rejection identifies T5, source attempt 2 and the changed evidence path and directs reassessment, allowing correction within the existing budget while retaining eligible T2 reuse.

## Root cause

requireReuseIdentity in src/workflow/code-review/task-review/attribution-binding.ts correctly compares the saved exact task identity against taskFinalIdentity, which includes assigned source blobs/segments, document identities and test details/blob identities. Its mismatch error omits the task, source attempt and changed input. recordAttributionRejection persists that generic message for native/controller repair. previousRoundFeedback in src/workflow/code-review/task-review/previous-round-feedback.ts further reduces HOST_VALIDATION_ERROR on origins to a generic correction. The last rejected mapping in attempt 3 still requested T5 reuse despite the changed TESTS blob; T2's compared inputs were unchanged. This is a feedback/repair defect, not authorization to relax exact identity checks.

## Fix intent

Return bounded host-generated reuse rejection feedback naming the affected task, source attempt, concrete changed input categories/paths when determinable, and the required action reassess. Preserve useful actionable correction through existing native/controller immediate repair and subsequent-attempt feedback. Keep current fingerprints, three-submission budget and fail-closed scope acceptance. Add regression coverage for a changed T5 evidence blob alongside valid T2 reuse, persisted feedback and successful corrected reassessment mapping. Do not rewrite old review attempts or restart S4 reviews before this fix is built and deployed.

## Citations

- **[[c1]]** `code` `src/workflow/code-review/task-review/attribution-binding.ts:22-30`
- **[[c2]]** `code` `src/workflow/code-review/task-review/attribution-binding.ts:77-84`
- **[[c3]]** `code` `src/workflow/code-review/task-review/attribution-repair.ts:7-17`
- **[[c4]]** `code` `src/workflow/code-review/task-review/previous-round-feedback.ts`
- **[[c5]]** `prior-artifact` `.insrc/tmp/code-review/design-s4-code-20261108.json`
- **[[c6]]** `stakeholder` `User instruction: fix reuse-attribution feedback before resuming other reviews.`
