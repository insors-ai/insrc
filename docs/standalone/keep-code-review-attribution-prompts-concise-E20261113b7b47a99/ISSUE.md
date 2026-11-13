<!-- insrc:artifact ISSUE-b7b47a99a6c59f21 -->

# Keep code-review attribution prompts concise

## Reproduction

Submit the committed whole-story packet design/review-worker-isolation-e4af6312.packet.json as review worker-isolation-e4af6312-whole-story attempt 1. The Codex attribution session exits before assessing any code: input_too_large, actual_chars 1122790 versus max_chars 1048576. Expected: concise task-scope allocation instructions with pinned references and reviewer-driven detail lookup, followed by complete per-task review; no need to fit the whole story's content into the attribution input. Evidence is retained in .insrc/tmp/code-review/worker-isolation-e4af6312-whole-story.json.

## Root cause

The shared attributionPrompt in src/workflow/code-review/task-review/assessment.ts interpolates the full committed Plan, functional summary, selectedCode for every projected change, all test execution details, and serialized feedback history into one input before task allocation. Both src/workflow/code-review/task-review/coordinator.ts and src/workflow/code-review/task-review/controller.ts invoke this function. Consequently task-level review partitioning does not bound the preceding attribution input. The saved CLI diagnostic confirms rejection at turn/start, not exhausted model output.

## Fix intent

Make task-scope attribution a concise reference-based instruction shared by daemon and controller reviewers. Reference immutable pinned documents, packet/checkpoint input, indexed change/test inventory and prior feedback instead of embedding complete source, artifact bodies, test outputs or history. Let the reviewer inspect the pinned details required to allocate scope. Preserve exact change/test indexes, required replacement-witness relationships, complete-coverage validation, applicable-task rules and sequential-attempt/reuse semantics. Do not truncate selected scope, raise CLI limits, relax finding authorization, change checkpoint schemas, or redesign task assessment. Add regression coverage demonstrating that large source/artifact/test/history content does not inflate attribution prompts, reference resolution remains pinned and omitted scope is still rejected. Resume the blocked independent review only after this tracked correction is built and approved.

## Citations

- **[[c1]]** `code` `src/workflow/code-review/task-review/assessment.ts:18` — "attributionPrompt interpolates prepared.documents.plan, selectedCode for each change, full tests and feedbackHistory."
- **[[c2]]** `code` `src/workflow/code-review/task-review/controller.ts` — "Analyzer module profile and source lookup confirm controller scope uses the shared attributionPrompt."
- **[[c3]]** `code` `src/workflow/code-review/task-review/coordinator.ts` — "Analyzer module profile and source lookup confirm daemon runReviewSession uses the shared attributionPrompt."
- **[[c4]]** `prior-artifact` `.insrc/tmp/code-review/worker-isolation-e4af6312-whole-story.json` — "failureDiagnostics terminal cli_exit: input exceeds1048576; actual_chars1122790."
- **[[c5]]** `code` `src/workflow/code-review/task-review/attribution-binding.ts` — "Existing attribution binding requires every submitted change/test to be covered."
