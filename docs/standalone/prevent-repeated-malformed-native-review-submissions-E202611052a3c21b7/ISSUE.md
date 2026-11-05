<!-- insrc:artifact ISSUE-2a3c21b73b79ef9c -->

# Prevent repeated malformed native review submissions and preserve actionable failure diagnostics

## Reproduction

Priority: HIGH. In review code-review-9b04adb36cac716d-s3-r1, t4 ends failed with generic 'Review activity CLI failed'. Saved diagnostics identify error_max_structured_output_retries, exitCode 1, after five StructuredOutput attempts; missing findings occurred five times, followed by missing testCoverage/limitations/advice/inspectedReferences/executedTests and one noncanonical reference. t1 and t5 also needed repairs for missing top-level fields; t1 preview includes XML-style parameter text inside summary and an invalid empty error field. t1/t5 eventually passed; t4 lost a completed usable assessment. Overall elapsed 37m35s; no token-cost total is established here. [[c1]] [[c2]]

## Root cause

Native output remained incompatible with the required structured result envelope despite supplied schema and CLI validation feedback. The checkpoint has specific native/schema diagnostics, but the task summary collapses them to a generic CLI failure. This is an observed output/diagnostic integration failure, not evidence of network timeout, quota or a concurrency block. The deeper model/tool serialization cause is not yet proven and must be investigated; do not invent it. Existing native execution and assessment boundaries are grounded in the analyze pass. [[c1]] [[c3]] [[c4]]

## Fix intent

Make the native submission path reliably produce the prescribed top-level JSON result, use pointed prior validation feedback to correct actual errors and stop recurring XML/parameter-fragment submissions. Relay terminal reason, exit code and bounded actionable schema issues in task/CR summaries while retaining full bounded diagnostics. Preserve accepted work and recover only according to explicit attempt/retry rules; never conceal failure with a fabricated pass or unbounded model loops. Include regression cases for the observed missing fields, empty optional error, malformed references and max structured-output exhaustion. Related observation: attribution omitted change index 38 (provenance.ts) once and host feedback repaired it; retain that successful repair as regression evidence, not an unresolved omission. Existing code-review history test expects one attribution call but observes three identically on pre-S3 baseline 19be6f17a; retain this baseline expectation mismatch for follow-up rather than blaming S3. Log only. [[c1]] [[c2]] [[c3]] [[c4]]

## Citations

- **[[c1]]** `doc` `.insrc/tmp/code-review/code-review-9b04adb36cac716d-s3-r1.json`
- **[[c2]]** `doc` `docs/epics/review-evolving-designs-durable-checkpoints-E202611039b04adb3/S003/CR.md`
- **[[c3]]** `code` `src/workflow/code-review/task-review/assessment.ts`
- **[[c4]]** `code` `src/agent/providers/cli-provider.ts`
