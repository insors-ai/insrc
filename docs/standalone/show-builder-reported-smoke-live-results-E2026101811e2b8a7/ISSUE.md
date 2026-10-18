<!-- insrc:artifact ISSUE-11e2b8a74bdff8c8 -->

# Show builder-reported smoke and live results to the coverage judge

## Reproduction

1. A Story's plan promises a smoke (or live) test, which the validate gate cannot run. 2. At validate the builder reports its result; the gate records it in the Story's TESTS record as reported by the builder (for ISSUE-b47dadc7 S001: docs/standalone/scope-code-review-story-s-own-E20261017b47dadc7/S001/TESTS.md:281-283, result pass). 3. Run the Story's code review. Observed: the coverage dimension reports a HIGH missing-promised-test finding for that test (ISSUE-b47dadc7 S001's review blocked on it in two rounds), because the test-record section of the coverage prompt does not mention the reported result. Expected: the coverage judge sees the reported result, marked as reported by the builder, and grades the promised test against it.

## Root cause

testRecordView (src/workflow/code-review/dimensions/test-record-view.ts:127-156) builds the view the coverage prompt shows only from each task's `files` runs and the BUILD record's task results; it never reads a task's named tests, where the record keeps the builder's reported result (TestRecordNamedTest.reported, src/workflow/runners/build/test-record.ts:68). The coverage prompt serialises that view as its only test evidence (src/workflow/code-review/dimensions/coverage.ts:213), so a promised smoke or live test has no evidence at all; normalizeCoverageFindings keeps a promised-test HIGH that names a promised test exactly, so the finding blocks.

## Fix intent

The test-record view also lists each named test that has a builder-reported result, with its name, result and evidence and marked as reported by the builder (not run by the gate), from the latest run that reported it. The coverage prompt tells the judge to grade a promised smoke or live test against that entry, treating a reported pass as present and passing-as-reported. With no reported results the view and the prompt are as before. Tests cover the view and the prompt.

## Citations

- **[[c1]]** `code` `src/workflow/code-review/dimensions/test-record-view.ts:127-156` — "return { files, buildTasks: buildTasksOf(subject), notes };"
- **[[c2]]** `code` `src/workflow/runners/build/test-record.ts:68` — "readonly reported?: TestRecordReported | undefined;"
- **[[c3]]** `code` `src/workflow/code-review/dimensions/coverage.ts:213` — "const view = testRecordView(subject);"
- **[[c4]]** `doc` `docs/standalone/scope-code-review-story-s-own-E20261017b47dadc7/S001/TESTS.md:281-283` — "Reported by the builder, not run by the gate: **pass**."
- **[[c5]]** `prior-artifact` `ISSUE-b47dadc7cf0cccb1` — "HIGH coverage promised-test: The promised smoke test has no corresponding entry in the supplied grounding or test-record results."
