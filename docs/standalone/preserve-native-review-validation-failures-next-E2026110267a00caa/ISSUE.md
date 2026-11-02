<!-- insrc:artifact ISSUE-67a00caafa8fcb3e -->

# Preserve native review validation failures as next-round feedback

## Reproduction

S2 review attempt 4 failed task t2 after Claude submitted feedback five times without a required root findings array. Each submission placed XML-like findings markup inside summary. Claude's schema tool reported the missing field, but the saved task contained only 'Review activity CLI failed'. The next review attempt therefore lacks pointed feedback about the previous output mistake. Codex malformed final JSON and schema-invalid candidates are likewise not retained as useful review diagnostics.

## Root cause

src/agent/providers/review-activity-stream.ts drops schema-invalid candidates, silently discards Codex JSON parse failures, and retains terminal success/failure state without structured failure details. src/agent/providers/cli-provider.ts turns nonzero activity CLI exit into a generic error. src/workflow/code-review/task-review/coordinator.ts and src/workflow/code-review/task-review/controller.ts record ordinary task failures; src/workflow/code-review/task-review/contracts.ts and prompt builders in assessment.ts/policy.ts lack explicit structured previousRoundFeedback. Detailed CLI validation failures therefore do not survive the provider-to-checkpoint-to-next-input path.

## Fix intent

For both Claude and Codex, preserve bounded JSON parse errors, schema violations, terminal CLI failure details and the last rejected feedback as diagnostics, without retaining reasoning or unbounded native output. Persist diagnostics with the failed task in the existing checkpoint and make concise structured previousRoundFeedback available in the subsequent attempt's reviewer input. Feedback should identify previous attempt/task, error code, affected field and pointed correction; do not repeat the schema or inject verbose explanations. Keep the full diagnostic evidence separate from concise prompt feedback. Preserve strict schema and semantic enforcement, finality and candidate acceptance, immutable previous attempts, truthful failed/incomplete statuses, same-party reuse provenance and daemon/controller behavior parity. Use existing validation machinery. No silent repair or promotion of rejected feedback, no automatic native retry, and no new S2 review as part of implementation. Add deterministic regressions for both providers, malformed and schema-invalid output, bounded diagnostics, checkpoint persistence/recovery, precise next-attempt feedback and successful later valid feedback.

## Citations

- **[[c1]]** `code` `src/agent/providers/review-activity-stream.ts`
- **[[c2]]** `code` `src/agent/providers/cli-provider.ts`
- **[[c3]]** `code` `src/workflow/code-review/task-review/contracts.ts`
- **[[c4]]** `code` `src/workflow/code-review/task-review/coordinator.ts`
- **[[c5]]** `code` `src/workflow/code-review/task-review/controller.ts`
- **[[c6]]** `code` `src/workflow/code-review/task-review/assessment.ts`
- **[[c7]]** `code` `src/workflow/code-review/task-review/policy.ts`
- **[[c8]]** `prior-artifact` `docs/epics/review-committed-work-task-checkpoints-E20261030e6ddcdcb/S002/CR.md`
- **[[c9]]** `stakeholder` `User: previous review round feedback in the input structure; pointed summaries of errors, not verbose explanations; support Codex too.`
