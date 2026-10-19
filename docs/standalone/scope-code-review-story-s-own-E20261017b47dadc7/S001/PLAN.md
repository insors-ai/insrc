<!-- insrc:artifact PLAN-b47dadc7cf0cccb1-S001 -->

# Plan: E20261018b47dadc7:S001

## Summary

**Epic:** `scope-code-review-story-s-own`
**LLD run:** `wf-1792332750157-sxg6d6`
**LLD effective hash:** `fbdcc4de6d9b...`

Building this fix makes the code review judge only the reviewed Story's work. First the build prompts start asking for a commit trailer that names the Story; then the change-set derivation, the review subject, the diff review and the BUILD record use it, falling back to today's behaviour when no commit carries it. The coverage dimension then gets only functions, methods and classes in non-test files, each with an evidence class, and a shared normalization step keeps a HIGH only when the evidence supports it, on both the daemon and controller review paths. The last task ships it and re-runs two real reviews as smoke evidence.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Both build prompts ask for the Insrc-Story trailer | S | — | unit: src/daemon/steps/build-step/__tests__/render-trailer.test.ts: 'the implement prompt asks for the Insrc-Story trailer with the Story's epicHash and storyId'; unit: src/daemon/steps/build-step/__tests__/render-trailer.test.ts: 'the no-plan standalone prompt asks for the Insrc-Story trailer with the Story's epicHash'; unit: src/daemon/steps/build-step/__tests__/render.test.ts (existing, still passes) | [[c1]] |
| 2 | **`t2`** storyChangeSet attributes commits by the Story trailer | M | — | integration: src/workflow/runners/build/__tests__/story-commits-trailer.test.ts: 'with a story key, only commits carrying the Story's trailer and merge edits are units; another Story's interleaved commits are not'; integration: src/workflow/runners/build/__tests__/story-commits-trailer.test.ts: 'two standalone Stories both S001 are told apart by the trailer's epicHash'; integration: src/workflow/runners/build/__tests__/story-commits-trailer.test.ts: 'with no trailered commit in the range, or when reading trailers fails, the set is today's and attribution is first-parent-range'; integration: src/workflow/runners/build/__tests__/story-commits.test.ts (existing, still passes) | [[c2]] |
| 3 | **`t3`** The review subject is the Story's own files, with its attribution recorded | M | `t2` | integration: src/workflow/code-review/__tests__/subject-attribution.test.ts: 'the review subject holds only the Story's own files and records attribution story-trailer'; integration: src/workflow/runners/build/__tests__/story-commits-trailer.test.ts: 'a file one Story changed and another Story reverted stays in the first Story's subject and diff'; integration: src/workflow/code-review/__tests__/subject-attribution.test.ts: 'a dirty tree gives attribution working-tree and the step-down order is unchanged'; integration: src/workflow/code-review/__tests__/subject-attribution.test.ts: 'a file another Story's excluded commit also changed is listed in sharedWithExcluded on the subject and the record' | [[c3]] |
| 4 | **`t4`** The BUILD record names the Story's newest trailered commit | S | `t2` | integration: src/workflow/runners/build/__tests__/standalone-record-commit.test.ts: 'a BUILD record persisted after another Story's commits names the Story's newest trailered commit'; integration: src/workflow/runners/build/__tests__/standalone-record-commit.test.ts: 'with no trailered commit the record names HEAD, and an explicit commit wins' | [[c4]] |
| 5 | **`t5`** The diff review is attributed per commit | M | `t2`, `t3` | integration: src/workflow/code-review/__tests__/diff-attribution.test.ts: 'a diff review of a trailered Story shows only its own hunks in a file another Story also edited'; integration: src/workflow/code-review/__tests__/diff-attribution.test.ts: 'without a story key the diff is today's, and both diff callers record the attribution on the subject' | [[c5]] |
| 6 | **`t6`** Coverage eligibility and the judge context | S | — | unit: src/workflow/code-review/__tests__/grounding-eligibility.test.ts: 'sections, documents, config, types, interfaces and every entity of a test file are not coverage-eligible; functions, methods and classes in source files are'; unit: src/workflow/code-review/__tests__/grounding-eligibility.test.ts: 'every judge slot receives the run's groundingMode and the non-coverage judges see every symbol' | [[c6]] |
| 7 | **`t7`** Evidence classes, the coverage prompt and finding normalization (daemon path) | M | `t6` | unit: src/workflow/code-review/dimensions/__tests__/coverage-evidence.test.ts: 'evidence classes follow testsReaching and the test record'; unit: src/workflow/code-review/dimensions/__tests__/coverage-evidence.test.ts: 'with no test record, a malformed record, or no passing file, an edge-free symbol is no-edge-no-tests and its HIGH is kept'; unit: src/workflow/code-review/dimensions/__tests__/coverage-evidence.test.ts: 'a HIGH with no findingKind, an unknown or ambiguous symbolId, or on a diff review is lowered; a promised-test HIGH and a no-edge-no-tests symbol HIGH are kept'; unit: src/workflow/code-review/dimensions/__tests__/coverage-evidence.test.ts: 'a promised-test HIGH is kept only when its expectationRef is a test the approved plan promised; with no plan it is lowered'; unit: src/workflow/code-review/dimensions/__tests__/coverage-evidence.test.ts: 'the coverage prompt lists only eligible symbols'; unit: src/workflow/code-review/dimensions/__tests__/coverage-evidence.test.ts: 'a diff review lists no symbols and grades only the promised tests'; unit: src/workflow/code-review/dimensions/__tests__/coverage.test.ts (existing, updated only where it asserts the old empty-edge rule) | [[c7]] |
| 8 | **`t8`** The controller review path prepares and normalizes coverage the same way | M | `t7` | integration: src/daemon/steps/code-review-step/__tests__/coverage-normalized-paths.test.ts: 'on both the controller and daemon paths a lowered graph-gap finding is LOW and the folded verdict is not block'; integration: src/daemon/steps/code-review-step/__tests__/coverage-normalized-paths.test.ts: 'the daemon diff path reaches the coverage judge as degraded, also with an empty grounding' | [[c8]] |
| 9 | **`t9`** Ship and smoke on this repository | S | `t1`, `t3`, `t4`, `t5`, `t8` | smoke: docs/standalone/scope-code-review-story-s-own-E20261017b47dadc7/S001/smoke.md | [[c9]] |

### 1.1 E20261018b47dadc7:S001:T001 — Both build prompts ask for the Insrc-Story trailer

Add the trailer rule `Insrc-Story: {{epicHash}}/{{storyId}}` to the commit step of src/prompts/build/implement-task.md and render epicHash in src/daemon/steps/build-step/render.ts; add epicHash to StandaloneBuildSpec and the trailer rule to renderStandaloneImplementPrompt (src/daemon/steps/build-step/render.ts:183-199), supplied by its caller (src/daemon/steps/build-step/phases/implement.ts:171). From this task on, every commit of this Story carries `Insrc-Story: b47dadc7cf0cccb1/S001` (written by hand until the installed daemon serves the new prompt).

**Acceptance checks:**
- The rendered task prompt asks for `Insrc-Story: <epicHash>/<storyId>` with the Story's real epicHash and storyId.
- The rendered no-plan standalone prompt asks for the same trailer with the standalone Story's epicHash.
- The subject-line format is unchanged.
- The existing render and standalone-implement tests pass, updated only where they assert the commit step.
- This task's commit carries `Insrc-Story: b47dadc7cf0cccb1/S001`.

### 1.2 E20261018b47dadc7:S001:T002 — storyChangeSet attributes commits by the Story trailer

Give storyChangeSet (src/workflow/runners/build/story-commits.ts:82-128) an optional storyKey: keep only non-merge commits whose message carries `Insrc-Story: <storyKey>` plus merge edits; return attribution 'story-trailer' | 'first-parent-range' and sharedWithExcluded (Story paths an excluded commit also changed); fall back to today's set when no commit carries the trailer or reading trailers fails; warn on untrailed commits whose subject names the Story's build format; update the module header's limits (octopus exception kept).

**Acceptance checks:**
- Without storyKey the units and paths equal today's exactly.
- With storyKey, another Story's interleaved commits contribute no unit; two standalone S001 Stories are told apart.
- With no trailered commit, or when trailer reading fails, the result is today's with attribution 'first-parent-range'.
- sharedWithExcluded lists the Story's paths an excluded commit also changed.

### 1.3 E20261018b47dadc7:S001:T003 — The review subject is the Story's own files, with its attribution recorded

changedFiles (src/workflow/runners/build/changed-files.ts:143-150) takes storyKey: with 'story-trailer' attribution the committed paths are the retained units' paths (exclusions kept), not the net range narrowed to them. resolveCodeReviewSubject (src/workflow/code-review/subject.ts:119-175) passes `<epicHash>/<storyId>` on the range-base attempt and sets changeSetAttribution ('working-tree' for the dirty-tree path) and sharedWithExcluded on the subject; the runner's record writer (src/workflow/code-review/runner.ts:289-292) persists both. Types in src/workflow/code-review/types.ts.

**Acceptance checks:**
- The subject holds only the Story's own files and records 'story-trailer'.
- A file the Story changed and another Story reverted stays in the subject.
- A dirty tree gives 'working-tree'; the step-down order is unchanged.
- The code-review record carries changeSetAttribution and sharedWithExcluded.

### 1.4 E20261018b47dadc7:S001:T004 — The BUILD record names the Story's newest trailered commit

In the BUILD record persist (src/workflow/runners/build/standalone-record.ts:313), derive body.commit as the newest first-parent commit since the range base that carries the Story's trailer; HEAD when none does; an explicit body.commit still wins.

**Acceptance checks:**
- A BUILD record persisted after another Story's commits names this Story's newest trailered commit.
- With no trailered commit, body.commit is HEAD as today; an explicit value wins.

### 1.5 E20261018b47dadc7:S001:T005 — The diff review is attributed per commit

Thread storyKey through assembleDiffCodeReviewGrounding from both callers (src/daemon/code-review-rpc.ts:146, src/daemon/steps/code-review-step/handler.ts:401) into realDiffGroundingDeps.rangeDiff (src/workflow/code-review/grounding.ts:430-433); with 'story-trailer' attribution storyRangeDiff (:363-393) builds every path's hunks from the kept units' own diffs; the diff grounding returns changeSetAttribution and sharedWithExcluded, which replace the subject's with its changedFiles.

**Acceptance checks:**
- A diff review of a trailered Story shows only its own hunks, also in a file another Story edited in the same window.
- Without storyKey the diff is today's.
- Both diff callers record the attribution on the subject.

### 1.6 E20261018b47dadc7:S001:T006 — Coverage eligibility and the judge context

assembleCodeReviewGrounding (src/workflow/code-review/grounding.ts:74-104) sets coverageEligible (function/method/class in a non-test file); buildDiffSymbols rows (:296-310) are not eligible; add JudgeContext { groundingMode } passed by the runner to every judge slot (src/workflow/code-review/runner.ts:69-71, :193) from its options; types in src/workflow/code-review/types.ts.

**Acceptance checks:**
- Sections, documents, config, types, interfaces and every test-file entity are not eligible; functions, methods and classes in source files are.
- Every judge slot receives the run's groundingMode; the daemon diff path reaches judges as 'degraded'.
- The grounding handed to the adherence, conventions and quality judges still holds every changed symbol, eligible and ineligible alike.

### 1.7 E20261018b47dadc7:S001:T007 — Evidence classes, the coverage prompt and finding normalization (daemon path)

Add prepareCoverageGrounding (eligible symbols with coverageEvidence from testsReaching and the test record, including the null/malformed-record rule) and normalizeCoverageFindings(result, prepared, subject) to src/workflow/code-review/dimensions/coverage.ts; add findingKind (required) and symbolId to COVERAGE_FINDINGS_SCHEMA and DimensionFinding; the prompt lists eligible symbols with entityId and class, and on 'degraded' states symbol coverage cannot be graded; judgeCoverage uses both helpers and its JudgeContext.

**Acceptance checks:**
- Evidence classes follow testsReaching and the record; with no record, a malformed record or no passing file an edge-free symbol is 'no-edge-no-tests'.
- A HIGH is kept only for a promised test the plan lists or a symbol of class 'no-edge-no-tests'; every other HIGH (no findingKind, unknown or ambiguous symbolId, degraded symbol finding, unknown promised test) is lowered to LOW with the reason recorded.
- A review whose only HIGHs were lowered does not fold to 'block'.
- A diff review's prompt lists no symbols and says symbol coverage cannot be graded.

### 1.8 E20261018b47dadc7:S001:T008 — The controller review path prepares and normalizes coverage the same way

In src/daemon/steps/code-review-step/handler.ts, build the coverage prompt from prepareCoverageGrounding with the review's groundingMode (:444), give the controller's coverage judgement schema findingKind/symbolId, and apply normalizeCoverageFindings with the subject before injecting the coverage result into the runner (:528).

**Acceptance checks:**
- On the controller path a graph-gap HIGH is lowered and the folded verdict is not 'block', as on the daemon path.
- The controller's coverage prompt is the same prepared list the daemon path uses.

### 1.9 E20261018b47dadc7:S001:T009 — Ship and smoke on this repository

Check with git that every commit of this Story from t1 on carries `Insrc-Story: b47dadc7cf0cccb1/S001`; update the installed daemon; re-run the code review of ISSUE-ae864466 and record its attribution and coverage findings; review this Story and record that its subject is its own commits; record in docs/standalone/scope-code-review-story-s-own-E20261017b47dadc7/S001/smoke.md.

**Acceptance checks:**
- Every commit of this Story from t1 on carries the trailer (git log check recorded).
- smoke.md records ISSUE-ae864466's re-review (attribution, coverage findings no longer on Markdown or tests).
- smoke.md records this Story's review with attribution 'story-trailer' and only its own files.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| src/workflow/runners/build/__tests__/story-commits-trailer.test.ts: storyChangeSet({ storyKey }) and its attribution | `t2`, `t3` |
| src/workflow/code-review/__tests__/subject-attribution.test.ts: resolveCodeReviewSubject's changed set and attribution | `t3` |
| src/workflow/runners/build/__tests__/standalone-record-commit.test.ts: the BUILD record's body.commit | `t4` |
| src/workflow/code-review/__tests__/grounding-eligibility.test.ts: coverageEligible | `t6` |
| src/workflow/code-review/dimensions/__tests__/coverage-evidence.test.ts: coverageEvidence, the prompt and the post-check | `t7` |
| src/daemon/steps/build-step/__tests__/render-trailer.test.ts: the implement prompt's trailer | `t1` |
| docs/standalone/scope-code-review-story-s-own-E20261017b47dadc7/S001/smoke.md | `t9` |
| src/daemon/steps/code-review-step/__tests__/coverage-normalized-paths.test.ts: both review paths | `t8` |
| src/workflow/code-review/__tests__/diff-attribution.test.ts: storyRangeDiff with a story key | `t5` |
| src/daemon/steps/build-step/__tests__/render-trailer.test.ts: both build prompts | `t1` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD S001 contractDetails: renderStandaloneImplementPrompt and dataModelChanges: Build commit message (implement prompt)`
- **[[c2]]** `prior-artifact` `LLD S001 contractDetails: storyChangeSet`
- **[[c3]]** `prior-artifact` `LLD S001 contractDetails: changedFiles, resolveCodeReviewSubject; dataModelChanges: CodeReviewSubject / CodeReviewBody`
- **[[c4]]** `prior-artifact` `LLD S001 dataModelChanges: BUILD record body.commit`
- **[[c5]]** `prior-artifact` `LLD S001 contractDetails: assembleDiffCodeReviewGrounding`
- **[[c6]]** `prior-artifact` `LLD S001 contractDetails: assembleCodeReviewGrounding, JudgeSlot.judge`
- **[[c7]]** `prior-artifact` `LLD S001 contractDetails: prepareCoverageGrounding, normalizeCoverageFindings, buildCoveragePrompt, judgeCoverage, COVERAGE_FINDINGS_SCHEMA`
- **[[c8]]** `prior-artifact` `LLD S001 dataModelChanges: Code-review record writer and the diff-review subject (the controller path)`
- **[[c9]]** `prior-artifact` `LLD S001 migration: migrationSteps 1-3`
