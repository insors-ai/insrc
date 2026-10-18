<!-- insrc:artifact LLD-b47dadc7cf0cccb1-S001 -->

# LLD: E20261018b47dadc7:S001

## Summary

**Epic:** `scope-code-review-story-s-own`
**HLD base run:** `wf-1792332750157-sxg6d6`
**HLD effective hash:** `fbdcc4de6d9b...`

The code review stops judging work that is not the Story's. Each build commit carries a trailer naming its Story, so the review's change set keeps only those commits even when other Stories commit on main in between, and the BUILD record names the Story's latest commit instead of whatever HEAD was. The coverage dimension judges only functions, methods and classes in non-test files, and each one arrives with an evidence class computed from its graph edges and the Story's test record: only a symbol with no edge and no passing Story test file can be a HIGH not-exercised finding, and a review grounded on the diff says its edges may be stale. Commits without the trailer fall back to today's derivation, so every existing Story stays reviewable.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)
9. [Open questions](#9-open-questions)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal

### 2.1 `storyChangeSet`

```typescript
storyChangeSet(repoPath: string, base: string, opts?: { readonly storyKey?: string | undefined }): StoryChangeSet & { readonly attribution: 'story-trailer' | 'first-parent-range' }
```

**Parameters:**
- `repoPath: string` — Unchanged.
- `base: string` — Unchanged: the Story's range base.
- `opts.storyKey: string | undefined` _(optional)_ — `<epicHash>/<storyId>`. When given, a non-merge commit counts as a Story unit only if its message carries the trailer `Insrc-Story: <storyKey>` (read with `git log --format=%(trailers:key=Insrc-Story,valueonly)`); merge edits are kept as today. When no commit in the range carries the trailer, the result is today's set.

**Returns:** `StoryChangeSet & { attribution }` — attribution says which derivation produced the units: 'story-trailer' (only commits carrying the Story's trailer, plus merge edits) or 'first-parent-range' (today's: every first-parent commit, used when no storyKey is given or no commit carries it). The result also lists sharedWithExcluded: the Story's paths that an excluded commit in the range also changed.

**Errors:**
- `NoBuildChangesError` when git fails, as today (an unresolvable base, for example).

**Preconditions:**
- base resolves to a commit.

**Postconditions:**
- Without storyKey the result's units and paths equal today's exactly.
- With storyKey and at least one trailer-carrying commit, no commit lacking the trailer contributes a unit; untrailed commits whose subject line names the Story's storyId/taskId form are logged as a warning (they may be the Story's, missed).

### 2.2 `changedFiles`

```typescript
changedFiles(repoPath: string, opts?: ChangedFilesOptions & { readonly storyKey?: string | undefined }): Promise<readonly string[]>
```

**Parameters:**
- `opts.storyKey: string | undefined` _(optional)_ — Passed through to storyChangeSet when the range base is used.

**Returns:** `readonly string[]` — Unchanged shape. With attribution 'story-trailer' the committed paths are the union of the retained units' paths (exclusions still applied through git), not the net base..HEAD diff narrowed to them, so a file the Story changed and another Story later reverted is still the Story's; with 'first-parent-range' the result is today's (net range narrowed to the Story's paths, src/workflow/runners/build/changed-files.ts:143-150).

**Errors:**
- `NoBuildChangesError` when As today.

**Preconditions:**
- As today.

**Postconditions:**
- Without storyKey the result is today's.
- A Story file changed by a retained commit and restored by another Story's commit is in the set.

### 2.3 `resolveCodeReviewSubject`

```typescript
resolveCodeReviewSubject(repoPath: string, epicHash: string, storyId: string, deps?: SubjectDeps): Promise<CodeReviewSubjectResult>  // the subject gains changeSetAttribution
```

**Parameters:**
- `epicHash / storyId: string` — Form the storyKey `<epicHash>/<storyId>` passed to changedFiles on the range-base attempt; the two step-down attempts stay as they are.

**Returns:** `CodeReviewSubjectResult` — CodeReviewSubject gains changeSetAttribution: 'story-trailer' | 'first-parent-range' | 'working-tree', recorded on the code-review body so a reader knows how the subject was scoped. The subject also carries sharedWithExcluded (from storyChangeSet), recorded on the code-review body: in a full (graph) review those files are judged whole, so their summaries may include another Story's symbols. This is a stated limit (stakeholder decision 2026-10-18, option A), not scoped further in this fix.

**Preconditions:**
- As today.

**Postconditions:**
- The review still never fails to start because of attribution: an attempt that throws steps down exactly as today.

### 2.4 `assembleCodeReviewGrounding`

```typescript
assembleCodeReviewGrounding(repoPath: string, changedFiles: readonly string[], deps: GroundingDeps): Promise<CodeReviewGrounding>  // each ChangedSymbolSummary gains coverageEligible
```

**Parameters:**
- `changedFiles: readonly string[]` — Unchanged.

**Returns:** `CodeReviewGrounding` — Each ChangedSymbolSummary gains coverageEligible: boolean = its kind is function, method or class AND its file is not a test file (isTestFile). Every symbol is still listed; nothing is dropped from other dimensions.

**Preconditions:**
- As today.

**Postconditions:**
- A Markdown section, document, config or manifest entity, a type or interface, and any entity of a test file is coverageEligible false.

### 2.5 `buildCoveragePrompt`

```typescript
buildCoveragePrompt(subject: CodeReviewSubject, grounding: CodeReviewGrounding, extraNote: string | undefined, opts?: { readonly groundingMode?: 'full' | 'degraded' | undefined }): LLMMessage[]
```

**Parameters:**
- `grounding: CodeReviewGrounding` — Only coverageEligible symbols are listed, each with its coverageEvidence.
- `opts.groundingMode: 'full' | 'degraded' | undefined` _(optional)_ — On 'degraded' the grounding is synthetic per-file rows with no graph edges (buildDiffSymbols, src/workflow/code-review/grounding.ts:296-310): the prompt states that symbol coverage cannot be graded in a diff review, lists no symbols, and judges only the promised tests against the test record; no not-exercised finding is possible.

**Returns:** `LLMMessage[]` — The coverage rule grades by coverageEvidence: 'no-edge-no-tests' may be a HIGH not-exercised breach; 'no-edge-story-tests-pass' is reported only as an observation (the graph could not confirm the symbol is reached; the Story's test files pass); 'reached-passing' needs no finding; 'reached-not-passing' is present-but-failing/unverified as today. The promised-test rule is unchanged.

**Preconditions:**
- Each listed symbol carries coverageEvidence (computed by judgeCoverage before the prompt is built).

**Postconditions:**
- No symbol with coverageEligible false appears in the coverage prompt.
- Each symbol is listed as an independent entry, so a later split of the list into parts (ISSUE-aef82b034d7209fa) needs no change here.

### 2.6 `judgeCoverage`

```typescript
judgeCoverage(subject: CodeReviewSubject, grounding: CodeReviewGrounding, provider: LLMProvider, context?: JudgeContext): Promise<DimensionResult>
```

**Parameters:**
- `grounding: CodeReviewGrounding` — Filtered to coverageEligible symbols, and each given coverageEvidence from its testsReaching and the Story's test record (testRecordView), before the prompt is built.
- `context: JudgeContext | undefined` _(optional)_ — { groundingMode: 'full' | 'degraded' }, passed by the runner to every judge slot from its run options (src/workflow/code-review/runner.ts:97-100, :193); absent reads as 'full'. Other judges accept and ignore it.

**Returns:** `DimensionResult` — As today, normalised by normalizeCoverageFindings.

**Preconditions:**
- As today.

**Postconditions:**
- A Story with zero eligible symbols gets an empty coverage judgement for changed symbols (the promised-tests rule still applies).
- The folded verdict of a review whose only HIGH findings were lowered is not 'block'.

### 2.7 `prepareCoverageGrounding`

```typescript
prepareCoverageGrounding(subject: CodeReviewSubject, grounding: CodeReviewGrounding, groundingMode: 'full' | 'degraded'): CodeReviewGrounding
```

**Parameters:**
- `grounding: CodeReviewGrounding` — The review's grounding, every symbol.
- `groundingMode: 'full' | 'degraded'` — 'degraded' yields no symbols (symbol coverage unavailable).

**Returns:** `CodeReviewGrounding` — Only coverageEligible symbols, each with coverageEvidence from its testsReaching and the Story's test record. Every prepared symbol gets exactly one class: edges + a passing reaching test file -> 'reached-passing'; edges otherwise -> 'reached-not-passing'; no edge + a readable record with at least one passing Story test file -> 'no-edge-story-tests-pass'; no edge otherwise (no record, a malformed record, or no passing file) -> 'no-edge-no-tests'.

**Preconditions:**
- None.

**Postconditions:**
- Shared by judgeCoverage (daemon path) and the controller path, which builds the coverage prompt itself (src/daemon/steps/code-review-step/handler.ts:444).

### 2.8 `normalizeCoverageFindings`

```typescript
normalizeCoverageFindings(result: DimensionResult, prepared: CodeReviewGrounding, subject: CodeReviewSubject): DimensionResult
```

**Parameters:**
- `result: DimensionResult` — The coverage dimension's result from either path.
- `prepared: CodeReviewGrounding` — The prepared grounding whose coverageEvidence decides each finding.
- `subject: CodeReviewSubject` — Its approved plan gives the promised tests (promisedTestsOf(subject), from approvedPlan.body.tasks[].tests); a promised-test HIGH is kept only when its expectationRef equals one of those names exactly (after trimming). With no approved plan there are no promised tests, so every promised-test HIGH is lowered.

**Returns:** `DimensionResult` — A HIGH finding is kept only when it is (a) findingKind 'promised-test' whose expectationRef names a test the approved plan promised, or (b) findingKind 'symbol-coverage' whose symbolId is a prepared symbol with class 'no-edge-no-tests'. Every other HIGH (any other class, an absent, unknown or ambiguous symbolId, an absent findingKind, or any symbol-coverage finding in a degraded review, which has no prepared symbols) is lowered to LOW / 'observation' with the reason recorded. Non-HIGH findings are unchanged.

**Preconditions:**
- None.

**Postconditions:**
- Applied in judgeCoverage and in the controller path before its coverage result is injected into the runner (src/daemon/steps/code-review-step/handler.ts:528), so both paths fold the same verdict.
- Both execution paths pass the subject: judgeCoverage has it, and the controller path holds it when it injects its coverage result.

### 2.9 `renderStandaloneImplementPrompt`

```typescript
renderStandaloneImplementPrompt(spec: StandaloneBuildSpec & { readonly epicHash: string }): string
```

**Parameters:**
- `spec.epicHash: string` — The standalone Story's hash, passed by its caller in src/daemon/steps/build-step/phases/implement.ts, so the prompt asks for `Insrc-Story: <epicHash>/<storyId>` on every commit.

**Returns:** `string` — The no-plan standalone implement prompt, now with the same trailer rule as the task template.

**Preconditions:**
- None.

**Postconditions:**
- Both build prompts (src/prompts/build/implement-task.md and this one) ask for the trailer.

### 2.10 `assembleDiffCodeReviewGrounding`

```typescript
assembleDiffCodeReviewGrounding(repoPath: string, ..., opts: { ...; readonly storyKey?: string | undefined }): Promise<DiffGrounding & { readonly changeSetAttribution: 'story-trailer' | 'first-parent-range' | 'working-tree' }>
```

**Parameters:**
- `opts.storyKey: string | undefined` _(optional)_ — Passed by both diff-review callers (src/daemon/code-review-rpc.ts:146 and src/daemon/steps/code-review-step/handler.ts) to storyChangeSet (src/workflow/code-review/grounding.ts:433).

**Returns:** `diff grounding + changeSetAttribution` — When the attribution is 'story-trailer', storyRangeDiff builds every path's hunks from the kept units' own diffs (unit.from..unit.to), not from the net base..HEAD diff, so another Story's edits to a shared file are not shown; the attribution replaces the subject's along with its changedFiles.

**Errors:**
- `DiffUnavailableError` when As today.

**Preconditions:**
- As today.

**Postconditions:**
- A diff review of a trailered Story shows only the Story's own hunks, also in a file another Story edited in the same window.

### 2.11 `COVERAGE_FINDINGS_SCHEMA`

```typescript
finding: { severity; location; message; confidence?; expectationRef?; findingKind: 'symbol-coverage' | 'promised-test' | 'other'; symbolId?: string }
```

**Parameters:**
- `findingKind: 'symbol-coverage' | 'promised-test' | 'other'` — Required on every coverage finding (an object property enum, no root union), so symbol findings and promised-test findings are told apart.
- `symbolId: string | undefined` _(optional)_ — The entityId of the prepared symbol a symbol-coverage finding is about; the prompt lists each symbol with its entityId.

**Returns:** `schema` — Validated by the structured retry like today.

**Preconditions:**
- None.

**Postconditions:**
- The controller path's emit_judgements schema for the coverage dimension carries the same two fields.

### 2.12 `JudgeSlot.judge`

```typescript
judge(subject: CodeReviewSubject, grounding: CodeReviewGrounding, provider: LLMProvider, context?: JudgeContext): Promise<DimensionResult>
```

**Parameters:**
- `context: JudgeContext | undefined` _(optional)_ — { groundingMode } from the runner's options.

**Returns:** `Promise<DimensionResult>` — Unchanged.

**Preconditions:**
- None.

**Postconditions:**
- The daemon diff path (src/daemon/code-review-rpc.ts passes groundingMode 'degraded') reaches judgeCoverage as 'degraded'; an empty full grounding and an empty degraded grounding are told apart by the mode, not by the symbol count.

## 3. Data model changes

### 3.1 `Build commit message (implement prompt)` — field-add

The implement prompt's commit step requires a git trailer on every commit of a Task: `Insrc-Story: {{epicHash}}/{{storyId}}` (a blank line, then the trailer, after the message body), rendered with the Story's epicHash. The subject line format is unchanged.

```
+ Insrc-Story: <epicHash>/<storyId>   (git trailer)
```

**Call sites:**
- `src/prompts/build/implement-task.md:31-32`
- `src/daemon/steps/build-step/render.ts:26`

### 3.2 `BUILD record body.commit` — invariant-change

Persisting a BUILD record names the newest commit on the first-parent line from the range base that carries the Story's trailer; HEAD at persist time only when none does (today's value). An explicit body.commit still wins.

**Call sites:**
- `src/workflow/runners/build/standalone-record.ts:300-316`

### 3.3 `ChangedSymbolSummary` — field-add

+ coverageEligible: boolean (set by grounding); + coverageEvidence?: 'reached-passing' | 'reached-not-passing' | 'no-edge-story-tests-pass' | 'no-edge-no-tests' (set by the coverage judge from testsReaching and the Story's test record: a file in the record is passing when its state is 'passing').

```
+ readonly coverageEligible: boolean;
+ readonly coverageEvidence?: 'reached-passing' | 'reached-not-passing' | 'no-edge-story-tests-pass' | 'no-edge-no-tests' | undefined;
```

**Call sites:**
- `src/workflow/code-review/types.ts:80-94`
- `src/workflow/code-review/grounding.ts:74-104`

### 3.4 `CodeReviewSubject / CodeReviewBody` — field-add

+ changeSetAttribution: 'story-trailer' | 'first-parent-range' | 'working-tree' on the subject, recorded on the body beside subject.changedFiles. Optional on read, so records written before it stay valid.

**Call sites:**
- `src/workflow/code-review/types.ts:119-180`
- `src/workflow/code-review/subject.ts:119-175`

### 3.5 `storyChangeSet units` — invariant-change

With a story key and at least one trailer-carrying commit in the range, only those commits (and merge edits) are units; the module header's known-limit note is updated.

**Call sites:**
- `src/workflow/runners/build/story-commits.ts:25-27`
- `src/workflow/runners/build/story-commits.ts:82-128`
- `src/workflow/runners/build/changed-files.ts:149`

### 3.6 `Code-review record writer and the diff-review subject` — invariant-change

The runner's record writer persists changeSetAttribution beside subject.changedFiles (today it writes only { changedFiles }); both diff-review callers replace the subject's changeSetAttribution together with its changedFiles; the controller path uses prepareCoverageGrounding and normalizeCoverageFindings so both execution paths judge coverage identically.

**Call sites:**
- `src/workflow/code-review/runner.ts:257`
- `src/daemon/steps/code-review-step/handler.ts:444`
- `src/daemon/steps/code-review-step/handler.ts:528`
- `src/daemon/code-review-rpc.ts:146`
- `src/workflow/code-review/grounding.ts:363-393`
- `src/workflow/code-review/grounding.ts:433`

### 3.7 `StandaloneBuildSpec` — field-add

+ epicHash: string, set by its caller in implement.ts, used for the trailer rule in renderStandaloneImplementPrompt.

```
+ readonly epicHash: string;
```

**Call sites:**
- `src/daemon/steps/build-step/render.ts:183-199`
- `src/daemon/steps/build-step/phases/implement.ts`

### 3.8 `Coverage finding and the judge context` — field-add

+ findingKind (required) and symbolId on coverage findings (DimensionFinding gains them as optional so other dimensions are unaffected); + JudgeContext { groundingMode } passed by the runner to every judge slot.

```
+ findingKind: 'symbol-coverage' | 'promised-test' | 'other';
+ symbolId?: string;
+ interface JudgeContext { readonly groundingMode: 'full' | 'degraded' }
```

**Call sites:**
- `src/workflow/code-review/dimensions/coverage.ts:63-75`
- `src/workflow/code-review/dimensions/coverage.ts:198`
- `src/workflow/code-review/runner.ts:69-71`
- `src/workflow/code-review/runner.ts:193`
- `src/daemon/code-review-rpc.ts:146`

### 3.9 `changedFiles committed-range derivation` — invariant-change

With 'story-trailer' attribution the committed paths are the retained units' own paths, not the net range narrowed to them.

**Call sites:**
- `src/workflow/runners/build/changed-files.ts:143-150`

### 3.10 `CodeReviewSubject / CodeReviewBody sharedWithExcluded` — field-add

+ sharedWithExcluded?: readonly string[]: the Story's paths an excluded commit in the range also changed; recorded on the body. Stated limit: such files are judged whole in a full review.

```
+ readonly sharedWithExcluded?: readonly string[] | undefined;
```

**Call sites:**
- `src/workflow/code-review/types.ts:119-180`
- `src/workflow/runners/build/story-commits.ts:82-128`
- `src/workflow/code-review/runner.ts:292`

## 4. Error paths

**Error cases**

- **Reading commit trailers fails (an old git without %(trailers) formatting, or the log call errors).** (recoverable)
  - Detection: The git call inside storyChangeSet throws NoBuildChangesError, as every git failure there does today.
  - Response: storyChangeSet with a storyKey retries without it, returning today's first-parent set with attribution 'first-parent-range', and logs the failure; the review records that attribution.
  - User impact: The review is scoped as before this fix; nothing fails to start.
- **A Story commit was made without the trailer while other Story commits carry it.** (recoverable)
  - Detection: storyChangeSet finds untrailed commits in the range whose subject line matches the build format for this Story's storyId (`feat(build): <storyId>/t<n>`, `fix(build): <storyId>/...`) and logs a warning naming them.
  - Response: The commit is left out of the change set (attribution stays 'story-trailer'); the warning and the attribution tell the reader why a file may be missing.
  - User impact: That commit's files are not reviewed; the log shows which commit was skipped.
- **The Story's test record cannot be read or is malformed.** (recoverable)
  - Detection: testRecordView returns null (as today) or notes.
  - Response: An edge-free eligible symbol is classed 'no-edge-story-tests-pass' only when the record is readable and lists at least one passing Story test file; when the record is absent (testRecordView returns null), malformed, or lists no passing file, it is 'no-edge-no-tests', exactly today's rule (a HIGH not-exercised finding is allowed). A symbol with edges whose test files the record does not list as passing is 'reached-not-passing' (unverified, as today).
  - User impact: With no usable record, coverage severity is exactly today's; the fix only relaxes severity when the record shows the Story's tests passing.
- **The coverage model returns a HIGH breach on a symbol whose class is 'no-edge-story-tests-pass' or 'reached-passing'.** (recoverable)
  - Detection: normalizeCoverageFindings, run on both execution paths, compares each finding's expectationRef symbol with its coverageEvidence.
  - Response: The finding is lowered from HIGH to LOW and from 'breach' to 'observation', and the change is recorded on the dimension result.
  - User impact: The verdict no longer blocks on graph gaps the test record contradicts.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A Story whose commits all predate this fix (no trailers). | attribution 'first-parent-range': the change set is exactly today's. |
| Two Stories commit on main in the same window, both with trailers. | Each review keeps only its own commits; the other Story's files are not reviewed. |
| Two standalone Stories, both S001, with different epicHash. | Told apart by the trailer's epicHash. |
| A merge of upstream inside the Story's range. | Merge edits are kept as today; merged-in code is still excluded. |
| A Story that changed only Markdown, manifests and tests. | No coverage-eligible symbol; the coverage dimension reports nothing about changed symbols (the promised-tests rule still runs). |
| A symbol reached by a test file the Story's record lists as failing. | Class 'reached-not-passing': present but failing/unverified, as today. |
| A degraded (diff-grounded) review. | The coverage prompt says the edges may be stale; a breach needs class 'no-edge-no-tests' and is still lowered by the post-check otherwise. |
| The working tree is dirty when the review runs (the working-tree derivation). | attribution 'working-tree'; trailers do not apply to uncommitted changes. |
| A BUILD record persisted after another Story's commits. | body.commit names the newest commit carrying this Story's trailer, not HEAD. |
| A diff review (degraded) of a Story. | The coverage prompt says symbol coverage cannot be graded without the graph and lists no symbols; only the promised tests are judged against the test record. |
| Two trailered Stories edit the same file in the same window, and the review is a diff review. | The Story's diff holds only its own commits' hunks for that file. |
| Story A changes a file in a trailered commit; Story B later restores it in the same window. | The file is in Story A's subject and diff (from A's unit), not lost to the net range. |
| A coverage HIGH with no findingKind, an unknown symbolId, or a symbolId matching more than one prepared symbol. | Lowered to LOW with the reason recorded; the verdict does not block on it. |
| An empty grounding in a full review and an empty grounding in a diff review. | Told apart by the judge context's groundingMode. |
| Two Stories change different symbols of the same file in the same window (full review). | Stated limit: the file is in the Story's subject and is judged whole; the code-review body lists it under sharedWithExcluded so a reader knows its findings may concern another Story's symbols. |
| A coverage HIGH of findingKind 'promised-test' whose expectationRef is not a promised test, or any promised-test HIGH when no plan was approved. | Lowered to LOW with the reason recorded. |

**Invariants to preserve**

- The review never fails to start because of how its subject is derived: each derivation that throws steps down, and only the last failing yields 'no-build-record' (src/workflow/code-review/subject.ts:119-175). [[c1]]
- Code merged in from upstream through an ordinary two-parent merge is not reviewed as Story work (storyChangeSet's merge-edit rule, src/workflow/runners/build/story-commits.ts:82-128). Exception kept as today: an octopus merge (more than two parents) is reviewed over its whole change, because git merge-tree cannot compute its auto-merge (src/workflow/runners/build/story-commits.ts:107-114). [[c1]]
- Every dimension other than coverage keeps seeing every changed symbol; the grounding lists every entity of every changed file (src/workflow/code-review/grounding.ts:74-104). [[c3]]
- The coverage judge never asserts a pass-state the test record does not support (src/workflow/code-review/dimensions/coverage.ts:100-135). [[c3]]
- An explicit body.commit on a BUILD record write wins over any derived value (src/workflow/runners/build/standalone-record.ts:300-316). [[c2]]

## 5. Test strategy

**Test framework:** `node:test with node:assert/strict, run with npx tsx --test under Node 22 (PATH=/opt/homebrew/opt/node@22/bin:$PATH); temp git repositories with git maintenance and gc.auto disabled; the coverage judge driven by a stand-in provider`

**Test levels**

- **integration** — Attribution over real git: a temp repository with two Stories committing interleaved on one branch (trailers on each), an upstream merge, untrailed old commits and two standalone Stories both S001; storyChangeSet with and without a storyKey, the warning for an untrailed Story-subject commit, and the fallback when trailer reading fails.
  - Subjects: `src/workflow/runners/build/__tests__/story-commits-trailer.test.ts: storyChangeSet({ storyKey }) and its attribution`
  - Fixtures: `A temp git repository built by the test with commits whose messages carry or lack `Insrc-Story: <epicHash>/<storyId>``
- **integration** — The review subject end to end: resolveCodeReviewSubject over a temp repository returns only the Story's own files with changeSetAttribution 'story-trailer', today's set with 'first-parent-range' when no commit carries the trailer, 'working-tree' when the tree is dirty; and a BUILD record persisted after another Story's commits names the Story's newest trailered commit.
  - Subjects: `src/workflow/code-review/__tests__/subject-attribution.test.ts: resolveCodeReviewSubject's changed set and attribution`, `src/workflow/runners/build/__tests__/standalone-record-commit.test.ts: the BUILD record's body.commit`
  - Fixtures: `The temp repository of the story-commits test plus a build-start file fixing the range base`
- **unit** — Coverage scope and severity: assembleCodeReviewGrounding marks coverageEligible (function/method/class in a non-test file only); judgeCoverage lists only eligible symbols, computes coverageEvidence from testsReaching and the test record, lowers a model HIGH breach on a symbol that is not 'no-edge-no-tests', and the degraded prompt states the edges may be stale; the build prompt renders the trailer.
  - Subjects: `src/workflow/code-review/__tests__/grounding-eligibility.test.ts: coverageEligible`, `src/workflow/code-review/dimensions/__tests__/coverage-evidence.test.ts: coverageEvidence, the prompt and the post-check`, `src/daemon/steps/build-step/__tests__/render-trailer.test.ts: the implement prompt's trailer`
  - Fixtures: `Stand-in GroundingDeps and a stand-in LLMProvider that returns a scripted finding list`, `Test records with passing, failing and missing files`
- **smoke** — On this repository after shipping: re-run the code review of ISSUE-ae864466 (whose review covered Story 0f0e4f45's files) and record that its change set and coverage findings are its own; build one small change with the trailer and record its review's attribution.
  - Subjects: `docs/standalone/scope-code-review-story-s-own-E20261017b47dadc7/S001/smoke.md`
- **integration** — Every execution path: a controller-path review (handler builds the coverage prompt and injects results) and a daemon-path review both lower a graph-gap HIGH and fold a non-block verdict; a diff review of two trailered Stories editing one file shows only the reviewed Story's hunks; the no-plan standalone prompt asks for the trailer.
  - Subjects: `src/daemon/steps/code-review-step/__tests__/coverage-normalized-paths.test.ts: both review paths`, `src/workflow/code-review/__tests__/diff-attribution.test.ts: storyRangeDiff with a story key`, `src/daemon/steps/build-step/__tests__/render-trailer.test.ts: both build prompts`
  - Fixtures: `A temp git repository with two trailered Stories editing one file; stand-in providers for the daemon path; a scripted controller judgement`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `src/workflow/runners/build/__tests__/story-commits-trailer.test.ts: 'with a story key, only commits carrying the Story's trailer and merge edits are units; another Story's interleaved commits are not'`, `src/workflow/runners/build/__tests__/story-commits-trailer.test.ts: 'two standalone Stories both S001 are told apart by the trailer's epicHash'`, `src/workflow/code-review/__tests__/subject-attribution.test.ts: 'the review subject holds only the Story's own files and records attribution story-trailer'`, `src/workflow/runners/build/__tests__/standalone-record-commit.test.ts: 'a BUILD record persisted after another Story's commits names the Story's newest trailered commit'`, `src/workflow/code-review/__tests__/diff-attribution.test.ts: 'a diff review of a trailered Story shows only its own hunks in a file another Story also edited'`, `src/workflow/runners/build/__tests__/story-commits-trailer.test.ts: 'a file one Story changed and another Story reverted stays in the first Story's subject and diff'`, `src/workflow/code-review/__tests__/subject-attribution.test.ts: 'a file another Story's excluded commit also changed is listed in sharedWithExcluded on the subject and the record'` |
| `ac2` | `src/workflow/runners/build/__tests__/story-commits-trailer.test.ts: 'with no trailered commit in the range, or when reading trailers fails, the set is today's and attribution is first-parent-range'`, `src/workflow/code-review/__tests__/subject-attribution.test.ts: 'a dirty tree gives attribution working-tree and the step-down order is unchanged'` |
| `ac3` | `src/workflow/code-review/__tests__/grounding-eligibility.test.ts: 'sections, documents, config, types, interfaces and every entity of a test file are not coverage-eligible; functions, methods and classes in source files are'`, `src/workflow/code-review/dimensions/__tests__/coverage-evidence.test.ts: 'the coverage prompt lists only eligible symbols'` |
| `ac4` | `src/workflow/code-review/dimensions/__tests__/coverage-evidence.test.ts: 'evidence classes follow testsReaching and the test record'`, `src/workflow/code-review/dimensions/__tests__/coverage-evidence.test.ts: 'a model HIGH breach on a symbol that is not no-edge-no-tests is lowered to an observation'`, `src/workflow/code-review/dimensions/__tests__/coverage-evidence.test.ts: 'a degraded review's prompt says the edges may be stale'`, `src/daemon/steps/code-review-step/__tests__/coverage-normalized-paths.test.ts: 'on both the controller and daemon paths a lowered graph-gap finding is LOW and the folded verdict is not block'`, `src/workflow/code-review/dimensions/__tests__/coverage-evidence.test.ts: 'a diff review lists no symbols and grades only the promised tests'`, `src/workflow/code-review/dimensions/__tests__/coverage-evidence.test.ts: 'a HIGH with no findingKind, an unknown or ambiguous symbolId, or on a diff review is lowered; a promised-test HIGH and a no-edge-no-tests symbol HIGH are kept'`, `src/daemon/steps/code-review-step/__tests__/coverage-normalized-paths.test.ts: 'the daemon diff path reaches the coverage judge as degraded, also with an empty grounding'`, `src/workflow/code-review/dimensions/__tests__/coverage-evidence.test.ts: 'a promised-test HIGH is kept only when its expectationRef is a test the approved plan promised; with no plan it is lowered'`, `src/workflow/code-review/dimensions/__tests__/coverage-evidence.test.ts: 'with no test record, a malformed record, or no passing file, an edge-free symbol is no-edge-no-tests and its HIGH is kept'` |
| `ac5` | `src/daemon/steps/build-step/__tests__/render-trailer.test.ts: 'the implement prompt asks for the Insrc-Story trailer with the Story's epicHash and storyId'`, `docs/standalone/scope-code-review-story-s-own-E20261017b47dadc7/S001/smoke.md`, `src/daemon/steps/build-step/__tests__/render-trailer.test.ts: 'the no-plan standalone prompt asks for the Insrc-Story trailer with the Story's epicHash'` |

## 6. Migration

**State before:** The review's change set is every first-parent commit from the Story's range base to HEAD plus merge edits (src/workflow/runners/build/story-commits.ts:82-128, used by src/workflow/runners/build/changed-files.ts:149 and src/workflow/code-review/subject.ts:119-175); build commits name only storyId/taskId (src/prompts/build/implement-task.md:31-32); the BUILD record's commit is HEAD at persist time (src/workflow/runners/build/standalone-record.ts:300-316); every entity of every changed file goes to the coverage judge, which grades an empty testsReaching as a HIGH breach whatever the test record says (src/workflow/code-review/grounding.ts:74-104, src/workflow/code-review/dimensions/coverage.ts:113-135).

**State after:** New build commits carry `Insrc-Story: <epicHash>/<storyId>`; a review keeps only the Story's trailered commits (today's set when none carry it) and records how it scoped its subject; the BUILD record names the Story's newest trailered commit; the coverage judge sees only functions, methods and classes in non-test files, each with an evidence class, and only 'no-edge-no-tests' can block as a HIGH breach.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Ship the build prompt change first (with the rest of the code in one daemon update): Stories built after it carry the trailer; nothing reads it until the review change is in the same build. — ↩ rollbackable
2. Ship the review changes (attribution, eligibility, evidence classes, post-check). No stored data is rewritten: old commits have no trailer and keep today's scoping; old code-review records lack changeSetAttribution, which readers treat as absent. — ↩ rollbackable
3. Smoke on this repository: re-run ISSUE-ae864466's code review (falls back, attribution first-parent-range, but coverage now excludes Markdown and tests) and review one Story built with the trailer; record both in S001/smoke.md. — ↩ rollbackable

**Backward compat:** storyChangeSet and changedFiles gain an optional storyKey; without it their results are byte-for-byte today's (their other callers, including the build validate path, pass none). ChangedSymbolSummary gains coverageEligible (required on new grounding; grounding is built per review and never stored across versions) and an optional coverageEvidence. CodeReviewSubject and CodeReviewBody gain an optional changeSetAttribution; records written before it stay readable. The BUILD record's body.commit keeps its type; only its derivation changes, and an explicit value still wins. No IDE plugin reads these fields. StandaloneBuildSpec gains a required epicHash; its one caller (src/daemon/steps/build-step/phases/implement.ts) supplies it. assembleDiffCodeReviewGrounding gains an optional storyKey; without it its output is today's. JudgeSlot.judge gains an optional fourth context argument; existing judges ignore it. DimensionFinding gains optional findingKind and symbolId; the coverage schema requires findingKind, so the controller path's coverage judgement schema changes with it.

## 7. Alternatives considered

### 7.1 a1: A Story trailer on every build commit, a coverage-eligible flag and evidence class per symbol — **CHOSEN**

The build prompt requires a git trailer naming the Story on each commit; the change set keeps only commits carrying it (today's derivation when none does); grounding marks each symbol coverage-eligible and classes its test evidence, which the coverage prompt grades by.

(1) Attribution: the implement prompt (src/prompts/build/implement-task.md) requires every commit of a Task to end with a trailer `Insrc-Story: <epicHash>/<storyId>`. storyChangeSet gains an optional story key: when given, it keeps the commit units whose message carries that trailer (read with git's trailer parser) and merge edits as today; when no commit in the range carries it, the change set is today's, and the review records which derivation it used. The BUILD record's commit is the newest commit carrying the trailer, else HEAD as today. (2) Eligibility: assembleCodeReviewGrounding stamps each ChangedSymbolSummary with coverageEligible = the entity is code (not a document, section, config or manifest entity) in a file that is not a test file (isTestFile); the coverage judge receives only eligible symbols, every other dimension all of them. (3) Evidence: each eligible symbol carries a deterministic evidence class computed from its testsReaching and the Story's test record: 'reached-passing', 'reached-not-passing', 'no-edge-story-tests-pass' (empty testsReaching while the Story's test record has passing files), 'no-edge-no-tests'. The coverage prompt grades by the class: only 'no-edge-no-tests' may be a HIGH not-exercised breach; 'no-edge-story-tests-pass' is an observation that the graph could not confirm it; a degraded (diff) review's prompt states that edges may be stale. Each symbol stays an independent summary, so ISSUE-aef82b03 can judge them in parts.

### 7.2 a2: Commits captured at each validate turn

The validate gate records, per Task, the commits added since the Story's previous validation; the change set is the union of recorded commits; coverage as in a1.

At each validate turn the daemon reads the commits on the first-parent line since the Story's previous validated HEAD and stores them on the BUILD record's task entry with the validated HEAD. The review's change set is the union of those commits (today's derivation when the record has none); the BUILD record's commit is the latest validated HEAD. Eligibility and evidence classes as in a1.

**Rejected because:** Independent of the builder, but fails the issue's own reproduction.

### 7.3 a3: Paths named by the Story's design

Keep only changed files the Story's LLD or plan names; coverage as in a1.

Intersect the range's changed files with the files cited by the approved LLD's call sites and the plan's tasks; fall back to today's set when the Story has no design. Eligibility and evidence classes as in a1.

**Rejected because:** Smallest, but wrong in both directions for attribution.

## 8. References

- **[[c1]]** `code` `src/workflow/code-review/subject.ts:119-175` — "const base = (deps.resolveRangeBase ?? resolveStoryRangeBase)(repoPath, epicHash, storyId);"
- **[[c2]]** `code` `src/workflow/runners/build/standalone-record.ts:300-316` — "const commit = rec.body.commit ?? headShortSha(repoPath);"
- **[[c3]]** `code` `src/workflow/code-review/grounding.ts:74-104` — "for (const file of changedFiles) {"
- **[[c4]]** `code` `src/workflow/runners/build/story-commits.ts:25-27` — "ordinary commits on the first-parent line, so those commits are counted as Story work."
- **[[c5]]** `code` `src/workflow/code-review/dimensions/coverage.ts:113-135` — "a changed symbol with an EMPTY testsReaching is a not-exercised gap — report it HIGH"
- **[[c6]]** `prior-artifact` `docs/standalone/scope-code-review-story-s-own-E20261017b47dadc7/ISSUE.md` — "The reviewed change set holds only the Story's own commits"
- **[[c7]]** `prior-artifact` `docs/standalone/review-every-changed-symbol-story-too-E20261018aef82b03/ISSUE.md` — "the review covers it in parts that each fit"
- **[[c8]]** `code` `src/prompts/build/implement-task.md:31-32` — "`feat(build): {{storyId}}/{{taskId}} … ({{issueRef}})`"
- **[[c9]]** `step-output` `s3` — "a1 is the only alternative that satisfies fix-intent 1: a2 violates it on the issue's own reproduction (another Story's commits between two validate turns) and a3 violates it both ways. All three shar"

## 9. Open questions

- Acceptance criteria (the Story carries none; derived from the ISSUE's fix intent, c1-c6): ac1 a review's change set holds only the Story's own (trailer-carrying) commits, two Stories committing on main in the same window and two standalone S001 Stories are told apart, and the BUILD record names the Story's newest trailered commit; ac2 with no trailered commit, or when trailers cannot be read, the change set is today's and the review records how it was scoped, and the step-down order is unchanged; ac3 the coverage judge sees only functions, methods and classes in non-test files; ac4 coverage severity follows the evidence class on every execution path (only no-edge-no-tests may be a HIGH breach; any other is lowered to LOW and the verdict does not block on it), and a diff review states that symbol coverage cannot be graded; ac5 both build prompts ask for the Insrc-Story trailer, and the live smoke shows a trailered Story's review scoped to its own commits.
- cd1: prepareCoverageGrounding, normalizeCoverageFindings and JudgeContext are new names (no HLD to own them; standalone fix).
- Stated limit (stakeholder decision 2026-10-18, option A): in a full (graph) review a file that another Story's commit in the same window also changed is judged whole, so its symbol summaries may include that Story's symbols; the review records such files as sharedWithExcluded. Scoping symbols to the Story's own changed lines is left out of this fix.

## Resolved questions

- `q6a577664` — Stated limit (stakeholder decision 2026-10-18, option A): in a full (graph) review a file that another Story's commit in the same window also changed is judged whole, so its symbol summaries may include that Story's symbols; the review records such files as sharedWithExcluded. Scoping symbols to the Story's own changed lines is left out of this fix.
  - **resolved**: Accept whole-file review — Stakeholder decision 2026-10-18 (option A at the end of the first review cycle): shared files are judged whole and listed as sharedWithExcluded; changed-line scoping is out of this fix. _(2026-10-18T14:30:59.107Z)_
- `qe025d6d0` — Acceptance criteria (the Story carries none; derived from the ISSUE's fix intent, c1-c6): ac1 a review's change set holds only the Story's own (trailer-carrying) commits, two Stories committing on main in the same window and two standalone S001 Stories are told apart, and the BUILD record names the Story's newest trailered commit; ac2 with no trailered commit, or when trailers cannot be read, the change set is today's and the review records how it was scoped, and the step-down order is unchanged; ac3 the coverage judge sees only functions, methods and classes in non-test files; ac4 coverage severity follows the evidence class on every execution path (only no-edge-no-tests may be a HIGH breach; any other is lowered to LOW and the verdict does not block on it), and a diff review states that symbol coverage cannot be graded; ac5 both build prompts ask for the Insrc-Story trailer, and the live smoke shows a trailered Story's review scoped to its own commits.
  - **resolved**: Adopt ac1–ac5 as written — Stakeholder decision 2026-10-18: ac1-ac5 as stated; the approved LLD's test mapping already maps every proving test to them. _(2026-10-18T14:32:37.165Z)_

## Citations

- **[[c1]]** `code` `src/workflow/code-review/subject.ts:119-175` — "const base = (deps.resolveRangeBase ?? resolveStoryRangeBase)(repoPath, epicHash, storyId);"
- **[[c2]]** `code` `src/workflow/runners/build/standalone-record.ts:300-316` — "const commit = rec.body.commit ?? headShortSha(repoPath);"
- **[[c3]]** `code` `src/workflow/code-review/grounding.ts:74-104` — "for (const file of changedFiles) {"
- **[[c4]]** `code` `src/workflow/runners/build/story-commits.ts:25-27` — "ordinary commits on the first-parent line, so those commits are counted as Story work."
- **[[c5]]** `code` `src/workflow/code-review/dimensions/coverage.ts:113-135` — "a changed symbol with an EMPTY testsReaching is a not-exercised gap — report it HIGH"
- **[[c6]]** `prior-artifact` `docs/standalone/scope-code-review-story-s-own-E20261017b47dadc7/ISSUE.md` — "The reviewed change set holds only the Story's own commits"
- **[[c7]]** `prior-artifact` `docs/standalone/review-every-changed-symbol-story-too-E20261018aef82b03/ISSUE.md` — "the review covers it in parts that each fit"
- **[[c8]]** `code` `src/prompts/build/implement-task.md:31-32` — "`feat(build): {{storyId}}/{{taskId}} … ({{issueRef}})`"
- **[[c9]]** `step-output` `s3` — "a1 is the only alternative that satisfies fix-intent 1: a2 violates it on the issue's own reproduction (another Story's commits between two validate turns) and a3 violates it both ways. All three shar"
