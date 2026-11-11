<!-- insrc:artifact ISSUE-7d2422c8f57fa483 -->

# Code-review reuse is refused when only provenance text in a test row changed

## Reproduction

1. Run a whole-story code review whose packet lists test rows with file, cases, command, result, executionDetails and evidenceReferences; let attempt 1 pass some tasks.
2. Start a correction attempt on the same pin whose test rows differ only in provenance text, for example one evidence reference removed, or executionDetails reworded after re-running the same tests.
3. Observed: every task whose assigned tests changed only in that text is refused reuse ("cannot reuse attempt 1: relevant task inputs changed (tests ...)"). The rejection names one task per submission, so a reviewer that reuses several such tasks exhausts the three-submission attribution budget and the attempt fails with no task assessed. Seen on review projection-scope-66d4-s1 (Story 66d4d41d99f805af/s1) on 2026-11-11: removing one unresolvable evidence reference from the three test rows made t1, t2 and t4, which passed in attempt 1, unreusable, and attempts 2 and 3 both failed in attribution.
4. Expected: a task whose sources, documents, requirements and assigned tests' committed file, cases and result are unchanged can reuse its earlier result; a real change to any of those still forces reassessment.

## Root cause

The reuse identity of a task is the hash of taskFinalInput (src/workflow/code-review/task-review/attribution-binding.ts:23-34), whose tests entry carries the whole submitted test row as detail (src/workflow/code-review/task-review/attribution-binding.ts:29). The row includes free-text provenance: command, executionDetails (which embeds the pin it was run on) and evidenceReferences. requireReuseIdentity compares the stored identity with the recomputed one (src/workflow/code-review/task-review/attribution-binding.ts:109-118), so any wording change in those fields makes reuse ineligible even though the committed test file blob (also in the identity), cases and result are unchanged. It throws at the first such task, and the attribution repair budget is three submissions (src/workflow/code-review/task-review/attribution-repair.ts:6), so several such tasks cannot all be corrected within one attempt.

## Fix intent

Make reuse eligibility follow what a task's review actually relied on: its committed sources, documents and requirements, and for each assigned test its committed file content, cases and result. Provenance-only wording in a test row (command text, execution details, evidence references) no longer blocks reuse; a real change to a test's file, cases or result still does. Saved attempts and stored task identities written before the change stay readable and keep validating, and admission refuses nothing it accepts today for unchanged inputs.

Constraints from related work:
- ISSUE-146084d04395b88b made rejected reuse actionable and kept the fingerprints as they were; this revises what the fingerprint covers, keeping its rejection feedback, the three-submission budget and fail-closed acceptance.
- ISSUE-e4af63128c7cbec2 (review worker isolation, in progress) is changing src/workflow/code-review/task-review/admission.ts; this fix avoids editing that file.

## Citations

- **[[c1]]** `code` `src/workflow/code-review/task-review/attribution-binding.ts:23-34` — "tests: assignment.tests.map(test => { ... return { detail: test, blobOid: prepared.finalTestBlobs![index] }; })"
- **[[c2]]** `code` `src/workflow/code-review/task-review/attribution-binding.ts:109-118` — "if(source.header.taskScopeIdentities?.find(b => b.taskId === assignment.taskId)?.identity !== taskFinalIdentity(review.prepared, assignment)){"
- **[[c3]]** `code` `src/workflow/code-review/task-review/attribution-repair.ts:6` — "export const MAX_ATTRIBUTION_SUBMISSIONS = 3;"
- **[[c4]]** `stakeholder` `Review projection-scope-66d4-s1 attempts 2 and 3, 2026-11-11` — "Task "t1" cannot reuse attempt 1: relevant task inputs changed (tests "src/workflow/code-review/task-review/__tests__/projection-lineage.test.ts")"
- **[[c5]]** `prior-artifact` `ISSUE-146084d04395b88b` — "Keep current fingerprints, three-submission budget and fail-closed scope acceptance."
- **[[c6]]** `prior-artifact` `ISSUE-e4af63128c7cbec2`
- **[[c7]]** `stakeholder` `User direction 2026-11-11` — "my packet edit made all reuse invalid <- this needs to be fixed."
