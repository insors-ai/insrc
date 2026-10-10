<!-- insrc:artifact CR-0f17539c98aa78ee-S001 -->

# Code review: 0f17539c98aa78ee:S001

⚠️ **WARN** — HIGH 0 · MED 2 · LOW 10 · model `claude:opus`

**Changed files:** 20

## adherence — 0 finding(s)

_No findings._

## conventions — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/analyze/runtimes/shared/adherence-topic-constraints.ts:66 | `ConstraintsForTopicResult.record?: string` is declared optional without the explicit `\| undefined` the documented rule asks for. The sibling `ConstraintsForTopicArgs.maxSources?: number \| undefined` in the same file does follow the rule, so the file is inconsistent with itself. The omission looks deliberate (the value is set by conditional spread and a test asserts the key is absent), but it still departs from the stated rule. |
| LOW | src/analyze/runtimes/shared/adherence.ts:79 | The `documents` variant of the new `ConstraintSource` union declares `readonly record?: string` without the explicit `\| undefined` the documented rule asks for. The pre-existing `ConstraintInput` in this file (`heading?: string`) uses the same form, so this follows the file's local habit, but it departs from the stated rule. |

## coverage — 4 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/analyze/runtimes/shared/__tests__/adherence-topic-route.test.ts:1 | Present but unverified: all 17 promised tests have a corresponding test in the diff (templates.test.ts, adherence-constraints.test.ts, adherence-topic-constraints.test.ts, adherence-topic-route.test.ts, scope-sources.test.ts, dropped-or-failed.test.ts), but no build record was supplied, so no pass-state can be confirmed. The empty testsReaching on every entry is not evidence of a gap: the entries are file-level diff entities with no graph edges at all (callers and callees are empty too), and the test diffs import and drive the changed code directly (validatePlan, invariantFixHint, renderCatalog, the three adherence runtimes, constraintsForTopic, _resolveConstraintsForTest, runExecutor). No not-exercised HIGH is raised from this hollow grounding; the suite must be run to confirm green. |
| LOW | src/analyze/runtimes/__tests__/scope-sources.test.ts:86 | The promised unit test 'the adherence check resolves its repository once and reads neither constraintsSource nor upstreamOutputs' is not a test of that name. Its assertions (one adherenceRepoPath call, one repoPath assignment, no constraintsSource or upstreamOutputs in comment-stripped code) were added inside the existing test "the code family's scope function and its test hook are gone and no code ru...". Present as assertions but unverified, and it cannot be matched by name in a test record. |
| LOW | src/analyze/runtimes/shared/adherence-topic-constraints.ts:163 | Two new branches of readRecord/notThisRecord have no test in the diff: the read failure other than ENOENT ("the enumeration's record could not be read"), which dropped-or-failed.test.ts classifies by text but nothing triggers; and the 'it was made with another limit of sections' rejection, which the bad-record test's five cases (cut short, schema version, topic, repository, null output) do not include. The 'unreadable' case of the promised test exercises only the not-JSON branch. |
| LOW | src/analyze/runtimes/shared/adherence.ts:437 | Minor new branches of the constraint resolution are not exercised by any test in the diff: the clamp of maxConstraintSources to 1..30 for an out-of-range value (tests pass only 1 and 5); constraintIds whose entries are all non-strings or empty strings (the ids.length === 0 path to the 'none of the N ids' throw; the test uses two well-formed unknown ids); and a 'documents' constraintSource with no `record` when the record could not be written (covered at constraintsForTopic level only, not through the check's report). |

## quality — 6 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/analyze/runtimes/shared/adherence.ts:458 | Unhandled error path on a reused record. `constraintsFromDocuments` reads `output.completeness.limited`, `.partlyRead`, `.skipped` and `output.retrievedSectionCount` outside the try block, but `notThisRecord` (adherence-topic-constraints.ts:181) accepts any record whose `output.constraints` is an array. A record with the right version, repository and topic but no `output.completeness` (truncated by hand, or written by a later build under the same schemaVersion 1) makes the check fail with a bare TypeError instead of being treated as absent and enumerated again. Because the bad record is not overwritten, every sibling check on that topic in the run fails the same way. The constraint items are also unvalidated, so a non-string `constraint` flows into the judging prompt. Fix: have `notThisRecord` also require `output.completeness` to be an object and `retrievedSectionCount` to be a number. |
| LOW | src/analyze/runtimes/shared/adherence-topic-constraints.ts:196 | Duplication: `atomicWriteJson` (mkdir, write to a pid/time-stamped tmp file, rename) is the fourth private copy of the same routine in the analyze framework; the others are in planner/cache.ts:210, executor/cache.ts:108 and orchestrator/persistence.ts:168. Like the others, it leaves the tmp file behind when `renameSync` fails. A shared helper would give one place to fix that. |
| LOW | src/analyze/planner/validate.ts:117 | Duplication: the 'three ways to give constraints' wording is written out separately in `CONSTRAINT_WAYS` (validate.ts), in `ADHERENCE_CONSTRAINTS_DESCRIPTION` (shared-schemas.ts), in the INV-5 remedy string (invariant-fix-hints.ts:88) and in the runtime's 'no constraints to check against' throw (adherence.ts). The four can drift apart; the planner is shown three of them. Only the validate.ts copy is pinned verbatim by a test. |
| LOW | src/analyze/planner/validate.ts:151 | Correctness gap between plan validation and the runtime. `hasInline` and `hasIds` test only that the array is non-empty. A plan with `constraints: [{ constraint: '' }]` or `constraintIds: ['']` passes INV-5 and the schema (neither string has a minLength), then fails at run time with 'holds no usable constraint' or 'none of the N ids…', and a `constraintTopic` beside it is not tried. The planner gets no retry for a plan that validation could have refused. Fix: add `minLength: 1` to `constraint` and to the `constraintIds` items in `ADHERENCE_CONSTRAINT_PARAMS`, or test for usable content in `missingConstraintSource`. |
| LOW | src/analyze/runtimes/shared/adherence.ts:407 | The report's `constraintSource: { kind: 'stored-documents', ids }` lists every id passed in, including ids that `hydrateFromConstraintIds` skipped because they name no summarised document. A reader of the report cannot tell which documents the constraints came from, and the skipped ids are not added to the completeness record's `skipped` list. |
| LOW | src/analyze/runtimes/shared/adherence.ts:437 | The clamp `Math.max(1, Math.min(30, n))` repeats the 1..30 bounds already in `ADHERENCE_CONSTRAINT_PARAMS.maxConstraintSources` and does not guard a non-integer or NaN: NaN passes through, and 2.5 is used both in the record key and as the limit. This is reachable only when the runtime is called without plan validation. `Number.isInteger` in the type test would close it. |

