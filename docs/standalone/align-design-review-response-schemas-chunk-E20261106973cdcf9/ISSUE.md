<!-- insrc:artifact ISSUE-973cdcf99760c5c6 -->

# Align design review response schemas with chunk permissions

## Reproduction

Run a correction-attempt design review with a substantive chunk such as contracts. The assigned DesignResultSchema permits findingDecisions, and Codex's strict schema makes that optional property required with a null alternative. Native Codex responses for contracts included populated carry decisions. The response passed structural validation but the host rejected it with 'Finding decisions are allowed only on an impact final consistency chunk', spending technical retries instead of accepting the chunk. Expected: ordinary and initial-attempt consistency assignments do not expose or accept findingDecisions; only the impact attempt's designated final-consistency chunk exposes decisions. This mismatch applies to both providers, although Claude has often omitted the field. [[c1]] [[c2]] [[c3]] [[c4]]

## Root cause

The coordinator supplies the same broad DesignResultSchema for every chunk; designChunkPrompt independently embeds that same broad schema and does not explicitly prohibit decisions on ordinary chunks. assessDesignResult/reconcileDesignFindings applies a narrower semantic condition: decisions are allowed only when an impact context exists and the chunk ID equals the attempt plan's finalConsistencyChunkId. Assignment contracts therefore advertise outputs that the host rejects. The broad schema also serves persisted results and history, so globally deleting its property would break valid final-review data rather than fix per-assignment permissions. [[c1]] [[c2]] [[c3]] [[c4]]

## Fix intent

Make each live chunk's response contract agree with host permissions for finding decisions. Exclude and forbid the property on ordinary chunks and initial-attempt final consistency, exposing it only for the actual final-consistency chunk of an impact attempt. Keep native daemon and controller assignments, prompt structural references/guidance and result validation consistent; preserve historical checkpoint/result decoding and final reconciliation safeguards. Verify the observed failure with focused regressions, including Codex strict formatting and both assignment paths. Native CLI silence and concurrency diagnosis are outside this fix. [[c1]] [[c2]] [[c3]]

## Citations

- **[[c1]]** `code` `src/workflow/review/design-review/coordinator.ts:275-315`
- **[[c2]]** `code` `src/workflow/review/design-review/policy.ts:24-30`
- **[[c3]]** `code` `src/workflow/review/design-review/results.ts:84-112`
- **[[c4]]** `code` `src/workflow/review/design-review/contracts.ts:129-136`
- **[[c5]]** `analyze-bundle` `insrc_analyze_step: qhIJYR4oBNvtL8ibUKJ7ZQ`
- **[[c6]]** `stakeholder` `User instruction in this session: 'ok, let's go ahead with this fix'.`
