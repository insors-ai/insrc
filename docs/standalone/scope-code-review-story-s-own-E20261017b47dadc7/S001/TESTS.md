<!-- insrc:artifact TESTS-b47dadc7cf0cccb1-s1 -->

# Tests: b47dadc7cf0cccb1 S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 49 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

## t1

Run at 2026-10-18T14:40:48.627Z on commit `4dba12cc`. Tests check: **passed**. 10 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/daemon/steps/build-step/__tests__/render-trailer.test.ts: 'the implement prompt asks for the Insrc-Story trailer with the Story's epicHash and storyId'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the implement prompt asks for the Insrc-Story trailer with the Story's epicHash and storyId | `src/daemon/steps/build-step/__tests__/render-trailer.test.ts` |

**unit: src/daemon/steps/build-step/__tests__/render-trailer.test.ts: 'the no-plan standalone prompt asks for the Insrc-Story trailer with the Story's epicHash'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the no-plan standalone prompt asks for the Insrc-Story trailer with the Story's epicHash | `src/daemon/steps/build-step/__tests__/render-trailer.test.ts` |

**unit: src/daemon/steps/build-step/__tests__/render.test.ts (existing, still passes)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the implement prompts tell the implementer to merge upstream with --no-ff and commit the merge on its own | `src/daemon/steps/build-step/__tests__/render.test.ts` |
| pass | every implement prompt, plan-driven and standalone Small and Trivial, carries the smallest-complete-change section with the rule filled in and no placeholder left | `src/daemon/steps/build-step/__tests__/render.test.ts` |
| pass | the implement prompts keep every section and rule they had before the new section was added | `src/daemon/steps/build-step/__tests__/render.test.ts` |
| pass | admitStandaloneBuild: trivial (no LLD) is admitted directly | `src/daemon/steps/build-step/__tests__/standalone-implement.test.ts` |
| pass | admitStandaloneBuild: Small with a missing LLD refuses (plan-missing) | `src/daemon/steps/build-step/__tests__/standalone-implement.test.ts` |
| pass | trivial standalone build: admits, renders a scope-driven prompt, and persists a BUILD record | `src/daemon/steps/build-step/__tests__/standalone-implement.test.ts` |
| pass | trivial standalone build without a focus is an error (no-scope) | `src/daemon/steps/build-step/__tests__/standalone-implement.test.ts` |
| pass | Small standalone build without an epicHash is an error (no-identity) | `src/daemon/steps/build-step/__tests__/standalone-implement.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/steps/build-step/__tests__/render-trailer.test.ts` | 0 | 2 | 0.6 s |  |
| `src/daemon/steps/build-step/__tests__/render.test.ts` | 0 | 9 | 0.6 s |  |
| `src/daemon/steps/build-step/__tests__/standalone-implement.test.ts` | 0 | 5 | 0.6 s |  |

## t2

Run at 2026-10-18T14:43:51.782Z on commit `8d526792`. Tests check: **passed**. 11 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/workflow/runners/build/__tests__/story-commits-trailer.test.ts: 'with a story key, only commits carrying the Story's trailer and merge edits are units; another Story's interleaved commits are not'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | with a story key, only commits carrying the Story's trailer and merge edits are units; another Story's interleaved commits are not | `src/workflow/runners/build/__tests__/story-commits-trailer.test.ts` |

**integration: src/workflow/runners/build/__tests__/story-commits-trailer.test.ts: 'two standalone Stories both S001 are told apart by the trailer's epicHash'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | two standalone Stories both S001 are told apart by the trailer's epicHash | `src/workflow/runners/build/__tests__/story-commits-trailer.test.ts` |

**integration: src/workflow/runners/build/__tests__/story-commits-trailer.test.ts: 'with no trailered commit in the range, or when reading trailers fails, the set is today's and attribution is first-parent-range'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | with no trailered commit in the range, or when reading trailers fails, the set is today's and attribution is first-parent-range | `src/workflow/runners/build/__tests__/story-commits-trailer.test.ts` |

**integration: src/workflow/runners/build/__tests__/story-commits.test.ts (existing, still passes)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | storyChangeSet lists the Story's non-merge first-parent commits and leaves out files only a merge brought in | `src/workflow/runners/build/__tests__/story-commits.test.ts` |
| pass | storyChangeSet records Story edits folded into a merge commit as a merge-edit unit | `src/workflow/runners/build/__tests__/story-commits.test.ts` |
| pass | storyChangeSet records a hand-resolved conflict as a merge-edit unit | `src/workflow/runners/build/__tests__/story-commits.test.ts` |
| pass | storyChangeSet includes a file the Story deleted and a root commit's files | `src/workflow/runners/build/__tests__/story-commits.test.ts` |
| pass | storyChangeSet is empty when the range holds only a clean merge | `src/workflow/runners/build/__tests__/story-commits.test.ts` |
| pass | storyChangeSet throws NoBuildChangesError for an unresolvable base | `src/workflow/runners/build/__tests__/story-commits.test.ts` |
| pass | known limit: upstream commits fast-forwarded or squash-merged into the Story are counted as Story work | `src/workflow/runners/build/__tests__/story-commits.test.ts` |
| pass | an octopus merge becomes one merge-edit unit over its whole change instead of a failure | `src/workflow/runners/build/__tests__/story-commits.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/runners/build/__tests__/story-commits-trailer.test.ts` | 0 | 3 | 1.4 s |  |
| `src/workflow/runners/build/__tests__/story-commits.test.ts` | 0 | 10 | 3.1 s |  |

## t3

Run at 2026-10-18T14:49:34.452Z on commit `163b6dfd`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/workflow/code-review/__tests__/subject-attribution.test.ts: 'the review subject holds only the Story's own files and records attribution story-trailer'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the review subject holds only the Story's own files and records attribution story-trailer | `src/workflow/code-review/__tests__/subject-attribution.test.ts` |

**integration: src/workflow/runners/build/__tests__/story-commits-trailer.test.ts: 'a file one Story changed and another Story reverted stays in the first Story's subject and diff'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a file one Story changed and another Story reverted stays in the first Story's subject and diff | `src/workflow/runners/build/__tests__/story-commits-trailer.test.ts` |

**integration: src/workflow/code-review/__tests__/subject-attribution.test.ts: 'a dirty tree gives attribution working-tree and the step-down order is unchanged'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a dirty tree gives attribution working-tree and the step-down order is unchanged | `src/workflow/code-review/__tests__/subject-attribution.test.ts` |
| pass | T42: a seam that throws whenever excludeGlobs is passed -> the THIRD attempt is called with no options and its result is returned | `src/workflow/code-review/__tests__/subject.test.ts` |

**integration: src/workflow/code-review/__tests__/subject-attribution.test.ts: 'a file another Story's excluded commit also changed is listed in sharedWithExcluded on the subject and the record'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a file another Story's excluded commit also changed is listed in sharedWithExcluded on the subject and the record | `src/workflow/code-review/__tests__/subject-attribution.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/__tests__/subject-attribution.test.ts` | 0 | 3 | 1.2 s |  |
| `src/workflow/code-review/__tests__/subject.test.ts` | 0 | 20 | 1.5 s |  |
| `src/workflow/runners/build/__tests__/story-commits-trailer.test.ts` | 0 | 4 | 1.9 s |  |

## t4

Run at 2026-10-18T14:53:25.157Z on commit `814f773f`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/workflow/runners/build/__tests__/standalone-record-commit.test.ts: 'a BUILD record persisted after another Story's commits names the Story's newest trailered commit'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a BUILD record persisted after another Story's commits names the Story's newest trailered commit | `src/workflow/runners/build/__tests__/standalone-record-commit.test.ts` |
| pass | with a story key, only commits carrying the Story's trailer and merge edits are units; another Story's interleaved commits are not | `src/workflow/runners/build/__tests__/story-commits-trailer.test.ts` |
| pass | with no trailered commit in the range, or when reading trailers fails, the set is today's and attribution is first-parent-range | `src/workflow/runners/build/__tests__/story-commits-trailer.test.ts` |

**integration: src/workflow/runners/build/__tests__/standalone-record-commit.test.ts: 'with no trailered commit the record names HEAD, and an explicit commit wins'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | with no trailered commit the record names HEAD, and an explicit commit wins | `src/workflow/runners/build/__tests__/standalone-record-commit.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/runners/build/__tests__/standalone-record-commit.test.ts` | 0 | 2 | 0.9 s |  |
| `src/workflow/runners/build/__tests__/story-commits-trailer.test.ts` | 0 | 4 | 1.6 s |  |

## t5

Run at 2026-10-18T14:58:03.094Z on commit `edb8aafe`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/workflow/code-review/__tests__/diff-attribution.test.ts: 'a diff review of a trailered Story shows only its own hunks in a file another Story also edited'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a diff review of a trailered Story shows only its own hunks in a file another Story also edited | `src/workflow/code-review/__tests__/diff-attribution.test.ts` |

**integration: src/workflow/code-review/__tests__/diff-attribution.test.ts: 'without a story key the diff is today's, and both diff callers record the attribution on the subject'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | without a story key the diff is today's, and both diff callers record the attribution on the subject | `src/workflow/code-review/__tests__/diff-attribution.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/__tests__/diff-attribution.test.ts` | 0 | 2 | 1.1 s |  |

## t6

Run at 2026-10-18T15:00:53.124Z on commit `7ddfc7eb`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/code-review/__tests__/grounding-eligibility.test.ts: 'sections, documents, config, types, interfaces and every entity of a test file are not coverage-eligible; functions, methods and classes in source files are'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | sections, documents, config, types, interfaces and every entity of a test file are not coverage-eligible; functions, methods and classes in source files are | `src/workflow/code-review/__tests__/grounding-eligibility.test.ts` |

**unit: src/workflow/code-review/__tests__/grounding-eligibility.test.ts: 'every judge slot receives the run's groundingMode and the non-coverage judges see every symbol'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | every judge slot receives the run's groundingMode and the non-coverage judges see every symbol | `src/workflow/code-review/__tests__/grounding-eligibility.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/__tests__/grounding-eligibility.test.ts` | 0 | 2 | 0.6 s |  |

## t7

Run at 2026-10-18T15:19:24.395Z on commit `440e3c1a`. Tests check: **passed**. 13 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/code-review/dimensions/__tests__/coverage-evidence.test.ts: 'evidence classes follow testsReaching and the test record'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | evidence classes follow testsReaching and the test record | `src/workflow/code-review/dimensions/__tests__/coverage-evidence.test.ts` |

**unit: src/workflow/code-review/dimensions/__tests__/coverage-evidence.test.ts: 'with no test record, a malformed record, or no passing file, an edge-free symbol is no-edge-no-tests and its HIGH is kept'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | with no test record, a malformed record, or no passing file, an edge-free symbol is no-edge-no-tests and its HIGH is kept | `src/workflow/code-review/dimensions/__tests__/coverage-evidence.test.ts` |

**unit: src/workflow/code-review/dimensions/__tests__/coverage-evidence.test.ts: 'a HIGH with no findingKind, an unknown or ambiguous symbolId, or on a diff review is lowered; a promised-test HIGH and a no-edge-no-tests symbol HIGH are kept'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a HIGH with no findingKind, an unknown or ambiguous symbolId, or on a diff review is lowered; a promised-test HIGH and a no-edge-no-tests symbol HIGH are kept | `src/workflow/code-review/dimensions/__tests__/coverage-evidence.test.ts` |

**unit: src/workflow/code-review/dimensions/__tests__/coverage-evidence.test.ts: 'a promised-test HIGH is kept only when its expectationRef is a test the approved plan promised; with no plan it is lowered'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a promised-test HIGH is kept only when its expectationRef is a test the approved plan promised; with no plan it is lowered | `src/workflow/code-review/dimensions/__tests__/coverage-evidence.test.ts` |

**unit: src/workflow/code-review/dimensions/__tests__/coverage-evidence.test.ts: 'the coverage prompt lists only eligible symbols'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the coverage prompt lists only eligible symbols | `src/workflow/code-review/dimensions/__tests__/coverage-evidence.test.ts` |

**unit: src/workflow/code-review/dimensions/__tests__/coverage-evidence.test.ts: 'a diff review lists no symbols and grades only the promised tests'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a diff review lists no symbols and grades only the promised tests | `src/workflow/code-review/dimensions/__tests__/coverage-evidence.test.ts` |

**unit: src/workflow/code-review/dimensions/__tests__/coverage.test.ts (existing, updated only where it asserts the old empty-edge rule)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | judgeCoverage: a promised test absent from the grounding is a HIGH missing-promised-test finding (ac1) | `src/workflow/code-review/dimensions/__tests__/coverage.test.ts` |
| pass | judgeCoverage: a changed symbol with testsReaching.length===0 is a HIGH not-exercised finding (ac2) | `src/workflow/code-review/dimensions/__tests__/coverage.test.ts` |
| pass | judgeCoverage: a present-but-failing/unverified test (observation) is distinct from a wholly-missing test (breach) (ac3) | `src/workflow/code-review/dimensions/__tests__/coverage.test.ts` |
| pass | judgeCoverage: a finding whose location file is outside changedFiles is dropped (ac4) | `src/workflow/code-review/dimensions/__tests__/coverage.test.ts` |
| pass | COVERAGE_FINDINGS_SCHEMA: per-finding requires severity/location/message; expectationRef + confidence optional | `src/workflow/code-review/dimensions/__tests__/coverage.test.ts` |
| pass | judgeCoverage: a changed symbol WITH testsReaching yields no not-exercised finding (ac2) | `src/workflow/code-review/dimensions/__tests__/coverage.test.ts` |
| pass | judgeCoverage: empty grounding + no promised tests yields a valid empty result (edge) | `src/workflow/code-review/dimensions/__tests__/coverage.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/dimensions/__tests__/coverage-evidence.test.ts` | 0 | 6 | 0.9 s |  |
| `src/workflow/code-review/dimensions/__tests__/coverage.test.ts` | 0 | 20 | 0.6 s |  |

## t8

Run at 2026-10-18T15:22:31.209Z on commit `32dfd033`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/daemon/steps/code-review-step/__tests__/coverage-normalized-paths.test.ts: 'on both the controller and daemon paths a lowered graph-gap finding is LOW and the folded verdict is not block'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | on both the controller and daemon paths a lowered graph-gap finding is LOW and the folded verdict is not block | `src/daemon/steps/code-review-step/__tests__/coverage-normalized-paths.test.ts` |

**integration: src/daemon/steps/code-review-step/__tests__/coverage-normalized-paths.test.ts: 'the daemon diff path reaches the coverage judge as degraded, also with an empty grounding'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the daemon diff path reaches the coverage judge as degraded, also with an empty grounding | `src/daemon/steps/code-review-step/__tests__/coverage-normalized-paths.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/steps/code-review-step/__tests__/coverage-normalized-paths.test.ts` | 0 | 2 | 0.7 s |  |

## t9

Run at 2026-10-18T15:51:16.396Z on commit `b7ad69db`. Tests check: **passed**. 0 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

the gate ran no test: every named test of this Task was reported by the builder

**smoke: docs/standalone/scope-code-review-story-s-own-E20261017b47dadc7/S001/smoke.md**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/standalone/scope-code-review-story-s-own-E20261017b47dadc7/S001/smoke.md: 'Trailer check' (t1-t8 all carry Insrc-Story: b47dadc7cf0cccb1/S001), 'Re-review of ISSUE-ae864466' (first-parent-range, 0 coverage findings vs 6 Markdown/test HIGHs before), 'This Story's own review' (story-trailer, 26 own files); records .insrc/artifacts/CR-b47dadc7cf0cccb1-s1.json and /tmp/CR-ae864466-rereview.json
