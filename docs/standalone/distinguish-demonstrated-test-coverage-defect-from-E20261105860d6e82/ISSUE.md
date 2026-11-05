<!-- insrc:artifact ISSUE-860d6e82ab04d314 -->

# Distinguish a demonstrated test coverage defect from an unfinished coverage review

## Reproduction

Priority: MED. In review code-review-9b04adb36cac716d-s3-r1, t7 identifies a concrete MED: consolidation rechecks results with requiredReferences=[] and tests omit that case. The reviewer says it inspected all four tests, traced assertions, ran the file and full S3 suite, and demonstrated the gap. It nevertheless sets testCoverage.assessment=partial and adds a mandatory limitation because a production test is missing, so the task becomes incomplete as well as containing a diagnosed defect. Expected: a completed evidence-backed coverage assessment may report a coverage defect as a finding; incomplete is reserved for mandatory review inspection/evidence actually unavailable. [[c1]] [[c2]]

## Root cause

The reviewer conflated completeness of the product's tests with completeness of the reviewer's coverage assessment. normalizeTaskResult conservatively turns non-verified coverage into incomplete, so the inaccurate semantic classification is preserved. The current guard should not simply promote arbitrary partial results: the policy/output meaning needs clarification and regression coverage. Optional inability to execute tests is separately advice and is not a mandatory inspection gap. [[c1]] [[c3]]

## Fix intent

Clarify and enforce the semantic distinction: demonstrated insufficient tests are findings with verified coverage-assessment evidence when inspection is complete; partial/unverified/unsupported means required review work could not be completed. Preserve real limitations and never infer a pass from prose. Add cases for reviewed-but-deficient tests, uninspected selected modules/tests, unavailable evidence and optional execution not performed. Do not dismiss the actual S3 consolidation-reference defect; this issue concerns review status classification. Log only. [[c1]] [[c2]] [[c3]]

## Citations

- **[[c1]]** `doc` `.insrc/tmp/code-review/code-review-9b04adb36cac716d-s3-r1.json`
- **[[c2]]** `doc` `docs/epics/review-evolving-designs-durable-checkpoints-E202611039b04adb3/S003/CR.md`
- **[[c3]]** `code` `src/workflow/code-review/task-review/results.ts`
