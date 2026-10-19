<!-- insrc:artifact ISSUE-aef82b034d7209fa -->

# Review every changed symbol of a Story too large for one review prompt

## Reproduction

Run the code review (insrc_code_review_step) on a Story with a large change set. Seen 2026-10-18 on Epic c2ba6fa6 Story s1 (17 build tasks): the daemon built a 1,247,701-character review prompt; the codex CLI refused it with 'Input exceeds the maximum length of 1048576 characters' (input_too_large); the structured retry sent the same prompt three times; the review ended with daemon-review-daemon-error and recorded nothing. Expected: the review completes and judges every changed symbol, whatever the size of the Story. Observed: no review at all, so the Story's BUILD had to be approved with an override and no code review.

## Root cause

Each review dimension's judge sends the Story's whole changed-symbol set, with its grounding, in one structured model call: adherence (src/workflow/code-review/dimensions/adherence.ts:147), conventions (src/workflow/code-review/dimensions/conventions.ts:156), coverage (src/workflow/code-review/dimensions/coverage.ts:180), functional coverage (src/workflow/code-review/dimensions/functional-coverage.ts:149) and quality (src/workflow/code-review/dimensions/quality.ts:132). Nothing measures the prompt against the reviewing CLI's input limit or divides the work, so a Story whose summaries exceed the limit can never be reviewed. The structured retry (src/agent/providers/structured-output.ts:186-190) treats the refusal like a schema failure and repeats the identical oversized call. The runner drives one call per dimension and folds those results into one verdict (src/workflow/code-review/runner.ts:8-19), with no notion of a dimension judged in parts.

## Fix intent

The code review of a Story of any size completes and judges every changed symbol: when one dimension's material does not fit the reviewing model's input, the review covers it in parts that each fit, and the parts' findings make up that dimension's single result and the Story's one verdict. Nothing is dropped or truncated to fit. A refusal for input size is not retried as if it were a malformed answer. A Story that fits in one call is reviewed as today.

## Citations

- **[[c1]]** `code` `src/workflow/code-review/dimensions/adherence.ts:147` — "provider.completeStructured<unknown>(buildAdherencePrompt(subject, grounding, note), ADHERENCE_FINDINGS_SCHEMA, { cwd: subject.repoPath });"
- **[[c2]]** `code` `src/workflow/code-review/dimensions/conventions.ts:156` — "provider.completeStructured<unknown>(buildConventionsPrompt(subject, grounding, note), CONVENTIONS_FINDINGS_SCHEMA, { cwd: subject.repoPath });"
- **[[c3]]** `code` `src/workflow/code-review/dimensions/coverage.ts:180` — "provider.completeStructured<unknown>(buildCoveragePrompt(subject, grounding, note), COVERAGE_FINDINGS_SCHEMA, { cwd: subject.repoPath });"
- **[[c4]]** `code` `src/workflow/code-review/dimensions/functional-coverage.ts:149` — "provider.completeStructured<unknown>(buildFunctionalCoveragePrompt(subject, grounding, note), FUNCTIONAL_COVERAGE_FINDINGS_SCHEMA, { cwd: subject.repoPath });"
- **[[c5]]** `code` `src/workflow/code-review/dimensions/quality.ts:132` — "provider.completeStructured<unknown>(buildQualityPrompt(subject, grounding, note), QUALITY_FINDINGS_SCHEMA, { cwd: subject.repoPath });"
- **[[c6]]** `code` `src/agent/providers/structured-output.ts:186-190` — "export async function withStructuredRetry<T>(call, validate, maxAttempts): Promise<T>"
- **[[c7]]** `code` `src/workflow/code-review/runner.ts:8-19` — "dimension judges into ONE persisted `CodeReviewArtifact` ... drives the four judges"
- **[[c8]]** `step-output` `insrc_code_review_step start, Epic c2ba6fa62a148ed1 Story s1, 2026-10-18` — "Input exceeds the maximum length of 1048576 characters. (code -32602), data: {"input_error_code":"input_too_large","max_chars":1048576,"actual_chars":1247701}"
- **[[c9]]** `stakeholder` `user rule 2026-10-08 (no payload caps)` — "never cap/truncate a large payload"
