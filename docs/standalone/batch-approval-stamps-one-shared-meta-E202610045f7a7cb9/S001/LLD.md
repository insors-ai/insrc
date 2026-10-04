<!-- insrc:artifact LLD-5f7a7cb95b643ae5-S001 -->

# LLD: E202610045f7a7cb9:S001

## Summary

**Epic:** `batch-approval-stamps-one-shared-meta`
**HLD base run:** `wf-1791119881937-gnhhf8`
**HLD effective hash:** `ff519ad856f9...`

A Story's change set is everything between its range base and HEAD. Today that base is HEAD when the Story's plan was approved, so Stories approved together share one base and a Story built days later sweeps in every commit made since. This story records the base when the Story's build starts instead: the first `implement` call stamps HEAD on the Story's own BUILD record, once, and both the build record writers and the code review read it from there. The approval-time stamp is kept only as a fallback for a Story whose build was never started through `implement`.

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

**Surface level:** internal-shared

### 2.1 `resolveStoryRangeBase`

```typescript
(repoPath: string, epicHash: string, storyId: string) => string | undefined
```

**Parameters:**
- `repoPath: string` — The repository whose artifact store and git history are read.
- `epicHash: string` — The work item's hash.
- `storyId: string` — The Story within it.

**Returns:** `string | undefined` — The full 40-hex sha that starts the Story's committed range, or undefined when none can be established.

**Preconditions:**
- Signature unchanged; still synchronous, read-only and never throwing.

**Postconditions:**
- New FIRST step: the `meta.rangeBase` stamped on the Story's own BUILD record (the build-start stamp), when present and a well-formed 40-hex sha.
- Then, unchanged and in the same order: the approval-time `meta.rangeBase` on the PLAN, then the LLD; the commit that introduced the PLAN, then the LLD; otherwise a logged warning and undefined.
- No step substitutes a different range. HEAD^, the empty tree and 'the last commit' are never returned.
- The header comment is rewritten to state the new order and why the base moved to build start; the 'read at approval' rationale is recorded as the fallback's reason, not the primary one.

### 2.2 `handleImplement`

```typescript
(input: BuildStepInputImplement) => Promise<BuildStepImplement | BuildStepRefused | BuildStepError>
```

**Parameters:**
- `input: BuildStepInputImplement` — The implement request: a task target, or a standalone context.

**Returns:** `BuildStepImplement | BuildStepRefused | BuildStepError` — Unchanged: the prompt to execute, a refusal, or an error.

**Preconditions:**
- Runs for every route: plan-driven, standalone Small, and Trivial/bugfix.

**Postconditions:**
- When the build is ADMITTED, and before the prompt is returned, the Story's BUILD record is upserted carrying `meta.rangeBase` = HEAD's full sha at that moment (the build-start stamp). The plan-driven and Small routes did not write a record at implement before; they now write one with no tasks.
- A refused or errored implement writes nothing.
- The stamp is WRITE-ONCE: a later implement call for the same Story (its next task, or a retry) leaves an existing rangeBase exactly as it is.
- When HEAD cannot be read (not a git repository, unborn HEAD) no rangeBase key is written and the implement still succeeds.
- A failure to write the record is logged and swallowed; it never turns an admitted implement into an error.
- The returned prompt, task id and workflow id are byte-identical to today.

### 2.3 `persistBuildRecord`

```typescript
(repoPath: string, rec: BuildRecord) => { md: string; json: string }
```

**Parameters:**
- `repoPath: string` — The repository to write under.
- `rec: BuildRecord` — The record to upsert; may now carry meta.rangeBase.

**Returns:** `{ md: string; json: string }` — Unchanged: the written paths.

**Preconditions:**
- mergeWithPrior is the single merge both writers and the implement stamp go through.

**Postconditions:**
- `meta.rangeBase` joins the PRIOR-WINS fields: when the prior record carries one, no later write can change or remove it.
- A write that supplies a rangeBase onto a record that has none sets it.
- The validate and completion writers do not supply a rangeBase, so they can never create or move one.
- A record with no rangeBase renders and serialises exactly as before.

### 2.4 `resolveCodeReviewSubject`

```typescript
(repoPath: string, epicHash: string, storyId: string, deps?: SubjectDeps) => Promise<CodeReviewSubjectResult>
```

**Parameters:**
- `repoPath: string` — The repository under review.
- `epicHash: string` — The work item's hash.
- `storyId: string` — The Story under review.
- `deps: SubjectDeps` _(optional)_ — Injectable seams; `changedFiles` now receives the shared ChangedFilesOptions.

**Returns:** `Promise<CodeReviewSubjectResult>` — Unchanged shape; `subject.changedFiles` is now the Story's range when the tree is clean.

**Errors:**
- `NoBuildChangesError (mapped to reason 'no-build-record')` when The git derivation fails, exactly as today.

**Preconditions:**
- The Story's base is resolved with resolveStoryRangeBase, the same resolver the BUILD writers use.

**Postconditions:**
- The changed set is derived with the SAME changedFiles(repoPath, { base }) rule the BUILD writers use: the working tree when it has changes, otherwise `base..HEAD`. The derivation itself is not modified.
- With no resolvable base the result is today's working-tree set.
- The diff-only (degraded) review path diffs from the same base when one is resolvable and the tree is clean; with no base its existing last-commit fallback is unchanged.

## 3. Data model changes

### 3.1 `BuildRecord.meta.rangeBase` — field-add

Optional full 40-hex sha: HEAD when the Story's build was first started through implement. Written once by the implement phase, preserved by mergeWithPrior, read by resolveStoryRangeBase. Absent on records written before this change and on builds whose HEAD could not be read. Never an empty string. Not rendered in BUILD.md.

**Call sites:**
- `src/workflow/runners/build/standalone-record.ts`
- `src/mcp/build-step/phases/implement.ts`
- `src/workflow/runners/build/range-base.ts`

### 3.2 `ApprovableArtifactMeta.rangeBase (approval-time stamp)` — invariant-change

Still stamped exactly as today (HEAD at approval, write-once, only on a plan or a standalone LLD). Its MEANING changes from 'the Story's range base' to 'the fallback base for a Story whose build was not started through implement'. The invariant it might break, 'a re-approval never moves an existing base', is untouched because the stamping code is not modified; only the resolver's order and the comments are.

**Call sites:**
- `src/workflow/gates.ts`
- `src/workflow/runners/build/range-base.ts`

### 3.3 `SubjectDeps.changedFiles` — field-modify

The seam's type widens from (repoPath) to (repoPath, opts?: ChangedFilesOptions), matching the shared changedFiles it already points at. A one-parameter stub stays assignable, so existing test stubs compile unchanged. The invariant it might break: 'the review subject is the working tree'; that is the behaviour being corrected, and it still holds whenever the tree has changes.

**Call sites:**
- `src/workflow/code-review/subject.ts`
- `src/workflow/runners/build/changed-files.ts`

## 4. Error paths

**Error cases**

- **HEAD cannot be read when a build starts (not a git repository, unborn HEAD, git unavailable).** (recoverable)
  - Detection: The HEAD read in the implement phase returns nothing: the git call exits non-zero or its output is not a 40-hex sha.
  - Response: No rangeBase key is written; the implement turn proceeds and returns its prompt. The resolver later falls through to its existing steps.
  - User impact: The Story's change set falls back to the approval-time base, or is empty when there is none. Never a substituted range.
- **Writing the BUILD record at build start fails (unwritable store, disk error).** (recoverable)
  - Detection: The persist call throws inside a try/catch in the implement phase.
  - Response: Log a warning with the story id and the error; return the implement prompt exactly as today.
  - User impact: The build proceeds; the base falls back as above.
- **The BUILD record's rangeBase is malformed (hand-edited, truncated, an empty string).** (recoverable)
  - Detection: The resolver checks the stamped value is a string of exactly 40 hex characters before returning it.
  - Response: Treat it as absent and continue to the next resolution step.
  - User impact: Same as an unstamped record.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Two sibling Stories whose plans were approved in one sweep (identical approval-time base), built one after the other, each started through implement. | Each BUILD record carries its own build-start base. The second Story's change set contains only the second Story's files. |
| A Story built days after its plan was approved, with unrelated commits landing in between. | Its base is HEAD at build start, so the unrelated commits are outside its range. |
| A second implement call for the same Story after its first task's commits have landed. | The base is unchanged; the range still starts before the first task's commits. |
| A bugfix or Trivial build whose only upstream is an ISSUE, or nothing. | Its BUILD record is stamped at implement, so it has a base where today it has none. |
| A Story whose build was never started through implement (built by hand, or before this change), with an approval-time base on its PLAN or LLD. | The resolver falls back to the approval-time base, exactly today's behaviour for that Story. |
| A Story with a BUILD record written before this change (no rangeBase), now re-validated or completed. | The validate and completion writers supply no rangeBase, so none is added; resolution falls back as above. |
| A Story re-approved after its build has started. | The approval stamp's write-once rule is untouched, and the build-start stamp is not written by approval at all, so nothing moves. |
| implement is refused by the admission gate (plan missing, unapproved or stale). | No BUILD record is written and no base is stamped. |
| Two Stories built interleaved: the second is started before the first's commits land. | The second Story's range includes the first's later commits. A single range cannot separate interleaved work; recorded as a limitation. |
| The stamped base is no longer an ancestor of HEAD (history rewritten, branch switched). | Not checked by the resolver: validating ancestry belongs to how the change set is derived, which is out of scope. The existing diff either fails (caught, empty change set) or describes an unrelated range. A limitation the approval-time base already has. |
| A code review of a Story whose work is committed and whose tree is clean. | The review subject is the Story's base..HEAD set instead of an empty working tree, and the degraded diff path diffs from the same base rather than from the last commit. |
| A code review run while the only uncommitted files are the workflow's own ledger files (an approval-stamped artifact json). | Unchanged by this design: a dirty tree is used as-is, so the review is still scoped to those files. Raised as an open question, because fixing it means changing how the set is derived. |

## 5. Test strategy

**Test framework:** `node:test via tsx, node:assert/strict, temp git repositories under os.tmpdir() (the existing mkCleanGitRepo idiom)`

**Test levels**

- **unit** — Pin the resolver's new order and the record's write-once rule in isolation. The story defines five acceptance criteria: ac1 siblings approved together get separate change sets; ac2 a build long after approval does not sweep intervening commits; ac3 a route with no stamped upstream gets a base; ac4 the two preserved constraints hold (unresolvable means empty, never a substituted range; nothing moves an existing base forward); ac5 the code review is scoped to the Story's range. Each test is accepted only after its named mutation turns it red.
  - Subjects: `src/workflow/runners/build/__tests__/range-base.test.ts: the BUILD record's rangeBase is returned ahead of an approval-time base on the PLAN (mutation: swap the order)`, `range-base.test.ts: with no BUILD stamp the approval-time base is returned, PLAN before LLD, then the introducing commit, then undefined (existing precedence unchanged)`, `range-base.test.ts: a malformed BUILD stamp (empty, short, non-hex) is ignored and resolution falls through (mutation: drop the 40-hex check)`, `range-base.test.ts: with nothing resolvable the result is undefined, never HEAD^ or a root commit`, `src/workflow/runners/build/__tests__/build-record.test.ts: a second persist supplying a different rangeBase leaves the first one in place (mutation: remove rangeBase from the prior-wins fields)`, `build-record.test.ts: a persist that omits rangeBase keeps the prior one; a persist onto a record without one sets it; a record with none serialises and renders byte-identically to today`
- **integration** — Drive the real phases against real git history, which is where the defect lives. These are the two reproductions the issue says have never been run.
  - Subjects: `src/mcp/build-step/__tests__/build-step.test.ts: SIBLINGS: two plans approved in one batch (same approval-time base), implement+commit+validate s1, then implement+commit+validate s2; s2's change log lists only s2's files (mutation: stop stamping at implement, and s2 lists s1's files too)`, `build-step.test.ts: DRIFT: approve, land unrelated commits, then implement+commit+validate; the change log lists only the Story's files (mutation: resolver prefers the approval stamp)`, `build-step.test.ts: a second implement call after the first task's commit does not move the base; the change log still includes the first task's files`, `build-step.test.ts: a Trivial build and an ISSUE-only bugfix build get a non-empty change log after commit, where today they get an empty one`, `build-step.test.ts: a refused implement writes no BUILD record; an implement in a non-git directory writes no rangeBase and still returns its prompt`, `build-step.test.ts: the implement response (prompt, taskId, workflowId) is identical with and without the stamp`, `src/workflow/runners/build/__tests__/completion-record.test.ts: the completion writer reads the build-start base and never writes one`, `src/workflow/code-review/__tests__/subject.test.ts: with the Story's work committed and a clean tree, subject.changedFiles is the Story's base..HEAD set; with a dirty tree it is the working set; with no base it is today's working set`, `src/mcp/code-review-step/__tests__/handler.test.ts: the degraded diff path receives the Story's base and no longer reviews only the last commit when a base is resolvable`
  - Fixtures: `a temp git repo helper that can approve two plans, and commit named files between phases`, `a plan + LLD + DEF seed for two Stories under one epic`
- **contract** — Guard what must not change.
  - Subjects: `src/workflow/__tests__ approval-gate tests: the approval-time stamp and its write-once rule pass unmodified`, `src/workflow/runners/build/__tests__/changed-files.test.ts passes unmodified (the derivation is out of scope)`, `existing BUILD record goldens pass unmodified (no rangeBase in rendered markdown)`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `build-step.test.ts: SIBLINGS` |
| `ac2` | `build-step.test.ts: DRIFT`, `range-base.test.ts: the BUILD record's rangeBase is returned ahead of an approval-time base` |
| `ac3` | `build-step.test.ts: a Trivial build and an ISSUE-only bugfix build get a non-empty change log after commit` |
| `ac4` | `range-base.test.ts: with nothing resolvable the result is undefined, never HEAD^ or a root commit`, `build-record.test.ts: a second persist supplying a different rangeBase leaves the first one in place`, `build-step.test.ts: a second implement call after the first task's commit does not move the base`, `approval-gate tests pass unmodified` |
| `ac5` | `subject.test.ts: with the Story's work committed and a clean tree, subject.changedFiles is the Story's base..HEAD set`, `handler.test.ts: the degraded diff path receives the Story's base` |

## 6. Migration

**State before:** Per the s1 bundles: a Story's range base is HEAD at approval, stamped write-once on its PLAN or standalone LLD and read by resolveStoryRangeBase (stamp, then introducing commit, then nothing). Batch approval gives sibling plans one shared base, and a base ages for as long as the build is delayed. The implement phase writes a BUILD record only on the Trivial route. A bugfix with only an ISSUE and a Trivial build have no base at all. The code review derives its changed set from the working tree with no base and falls back to the last commit.

**State after:** The implement phase stamps HEAD on the Story's BUILD record the first time the Story's build is started, on every route, and that stamp can never be moved. The resolver reads it first and keeps the approval-time stamp as the fallback. The code review resolves the same base. Records written before the change carry no build-start stamp and resolve exactly as they do today.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the optional rangeBase field to the BUILD record's meta and make it prior-wins in the record merge. — ↩ rollbackable
2. Have the resolver read the BUILD record's base ahead of its existing steps, and rewrite its header comment and the approval-site comment to describe the build-start base as primary and the approval-time base as the fallback. — ↩ rollbackable
3. Stamp the base from the implement phase on every admitted route, fail-open. — ↩ rollbackable
4. Pass the resolved base into the code review's changed-set seam and its degraded diff path. — ↩ rollbackable
5. Add the sibling and drift integration tests and the unit tests; run the existing approval-gate, changed-files and BUILD-golden suites unmodified. — ↩ rollbackable
6. Ship with the daemon update. No backfill: existing records are not rewritten and gain a build-start base only if their Story is started through implement again, which for a record without one sets it to HEAD at that moment. — ↩ rollbackable

**Backward compat:** resolveStoryRangeBase, handleImplement, persistBuildRecord and resolveCodeReviewSubject keep their signatures. The implement response is unchanged. Observable differences: (1) the plan-driven and Small routes now leave a pending BUILD record with no tasks as soon as implement is called, where before the record first appeared at validate; (2) a Story started through implement gets a narrower, correct change set; (3) a code review of committed work is scoped to the Story's range instead of the last commit. A Story that is mid-build when the update lands has no build-start stamp; its next implement call stamps HEAD at that point, which would cut off work it has already committed, so its change set for that one build can be short. Rolling back leaves the extra meta field on records, where the old code ignores it.

## 7. Alternatives considered

### 7.1 a1: Stamp the base at build start, on the Story's own BUILD record — **CHOSEN**

The first `implement` call for a Story records HEAD as `meta.rangeBase` on that Story's BUILD record, write-once; the resolver reads it first and keeps the approval-time stamp as a fallback.

Move the authoritative base to build time. Every admitted implement entry (plan-driven, standalone Small, Trivial/bugfix) upserts the Story's BUILD record with meta.rangeBase = HEAD's full sha, and the record merge treats rangeBase as prior-wins so a later implement call never moves it. resolveStoryRangeBase gains a first step that reads the BUILD record's base; its existing steps follow unchanged. The approval-time stamp and its write-once rule are untouched and serve as the fallback for a Story never started through implement. The code review resolves the same base.

### 7.2 a2: Keep the base at approval, but separate siblings and bound drift

Stay with HEAD-at-approval and, when resolving, advance a Story's base past commits recorded by sibling Stories' builds.

Leave the stamp at approval. At resolve time read the sibling Stories' BUILD records under the same epic and move this Story's effective base forward to the latest sibling completion commit that is an ancestor of HEAD; bound drift outside the epic the same way using other work items' recorded commits.

**Rejected because:** Keeps the approval-time rationale but only narrows the defect: commits belonging to no work item still drift in, unstamped routes stay uncovered, and correctness comes to depend on other Stories' records.

### 7.3 a3: Derive the Story's commits from commit metadata instead of a base

Identify the Story's commits by a message trailer and take the union of their files, with no range.

Have the implement prompt require a Story trailer on each commit and derive the change set as the union of files touched by commits carrying it. The stored base is no longer consulted.

**Rejected because:** The only one that separates interleaved Stories, but it replaces the derivation the issue declares out of scope and depends on a commit-message instruction being followed every time.

## 8. References

- **[[c1]]** `code` `src/workflow/runners/build/range-base.ts` — "export function resolveStoryRangeBase(repoPath: string, epicHash: string, storyId: string): string | undefined {"
- **[[c2]]** `code` `src/workflow/gates.ts` — ": stampsRangeBase(artifact.meta) ? headFullSha(dirname(jsonPath)) : undefined;"
- **[[c3]]** `code` `src/mcp/build-step/phases/implement.ts` — "function handleStandaloneImplement("
- **[[c4]]** `code` `src/workflow/runners/build/standalone-record.ts` — "function mergeWithPrior(jsonPath: string, rec: BuildRecord): BuildRecord {"
- **[[c5]]** `code` `src/workflow/runners/build/changed-files.ts` — "export async function changedFiles(repoPath: string, opts?: ChangedFilesOptions): Promise<readonly string[]> {"
- **[[c6]]** `code` `src/workflow/code-review/subject.ts` — "changedFiles = await deps.changedFiles(repoPath);"
- **[[c7]]** `prior-artifact` `ISSUE-5f7a7cb95b643ae5` — "Make each Story's change set describe only that Story, even when its plan was approved in the same sweep as its siblings'."
- **[[c8]]** `step-output` `s1`
- **[[c9]]** `step-output` `s3`

## 9. Open questions

- Scope: the ISSUE places 'how the change set is derived once a base is known' out of scope. This design passes the Story's base into the code review's changed-set seam and its degraded diff path, on the reading that the review has NO base today, so this supplies provenance rather than changing the derivation rule. Confirm that reading, or drop the code-review half and file it separately.
- Should a code review treat a tree that is dirty ONLY with the workflow's own ledger files (for example an approval-stamped artifact json under .insrc/artifacts) as clean, so the Story's committed range is used? Today's empty reviews came from exactly that state. Doing so changes the derivation rule (an exclusion applied before the emptiness check, as the BUILD writers already do for their own record), so it is left out of this design and needs a decision: include it here, or file it as its own issue.

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.story (design.story)

**1 HIGH · 5 MED · 6 LOW** · model `client` · reviewed 2026-10-04T13:24:47.666Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| 2.2/6 backward compat (1) | closed-union | HIGH | manual | Leaving a pending (unapproved) tasks-less BUILD record from the moment implement is called has no effect on any other reader of BUILD records: it cannot be approved, and so mark a Story complete, before any work has been validated. | Contradicted. gates.ts:693 sweeps `^(DEF\|HLD\|LLD\|PLAN\|BUILD)-<epicHash>` and :700 treats any record with no approvedAt as pending, so the tasks-less BUILD record the design writes at implement joins every batch approval under its epic. :783-788 then runs ensureBuildRecordOnCompletion and approveOne on it, and the only withhold for a BUILD with no code review (:749-755) applies only when enforcement is on, which is off by default. Built as written: start s1 with implement, then run insrc_workflow_approve({ epicHash }) to approve a sibling's LLD or PLAN, and BUILD-<epic>-s1 is stamped approved, which is the Story-completion act, before a single task has been validated. For a bugfix it also fires the bugfix-complete follow-on (bugfix/mount.ts:156). Today a plan-driven or Small Story has no BUILD record until validate, so this path opens earlier than it does now; the Trivial route and any Story between validate and review already have it. The review-panel listing is unaffected (pending.ts:39 excludes BUILD). | Decide how a build-start record is kept out of completion: exclude a BUILD with no validated tasks from the batch sweep, or carry the build-start base somewhere other than a pending BUILD record. State the choice and add a test that a batch approve between implement and validate does not approve the BUILD. |
| 2.3/c4 | semantic | MED | assisted | mergeWithPrior is the single merge every BUILD writer goes through; making meta.rangeBase a prior-wins field there is sufficient for the stamp to be write-once, and no later write can move or remove it. | standalone-record.ts:346-361: mergeWithPrior spreads prior meta, then the new write's, then re-asserts prior-wins fields from :361; adding rangeBase there does make a later implement call unable to move it. Two gaps the design does not cover. (1) :348 returns the new record untouched when there is no prior, and readPriorRecord treats a corrupt or identity-less prior as absent (:325 fail-open), so a deleted, regenerated or unreadable record is re-stamped at the next implement, after the Story's commits. (2) Write-once has no end: a Story that was completed and is later built again under the same id keeps its first base forever, so its second change set spans everything since the first build, which is the drift defect this issue records. The design also does not say what meta and body the implement write carries on the plan-driven and Small routes (createdAt, standalone, updatedAt, body.commit are all refreshed or defaulted by a persist), nor that the record and BUILD.md are rewritten on every implement call. | Specify the record the implement phase writes; say what happens to the stamp when the prior record is approved (completed) or unreadable. |
| 6 backward compat / step 6 | ordering | MED | assisted | The two preserved constraints hold by construction: an unresolvable base still yields an empty change set, and nothing can move a Story's existing base forward onto its own work, including for a Story that is mid-build or already built when the change lands. | The first constraint holds: range-base.ts:114 still returns undefined and no step substitutes a range. The second does not hold by construction. gates.ts:598-602 records the failure it guards against: a later stamp taken after the Story's work has landed moves the base onto the Story's own commits and the range collapses. The design reintroduces that shape through the new first step: any Story with commits already landed and no build-start stamp (mid-build when the update ships, built by hand and then given an implement call, or an older completed Story) gets HEAD stamped at its next implement, and because the BUILD stamp outranks the approval-time base, the effective base moves forward past work already committed. The design says so itself ('would cut off work it has already committed') and migration step 6 makes it the rule for every existing record. completion-record.ts:72 and validate.ts:253 read through the same resolver, so both writers would then report the shortened set. | Do not take a first stamp for a record that already shows work: skip it when the prior BUILD record has tasks (or a commit), so those Stories keep today's resolution. Add a test for implement called after a validate on an unstamped record. |
| 2.4 postcondition 3 | semantic | MED | manual | The degraded (diff-only) review path can be made to diff from the Story's resolved base by passing it through the existing seams listed in the design's call sites (subject.ts and changed-files.ts); today that path uses the working-tree diff and otherwise the last commit. | The degraded path does not go through subject.changedFiles; it replaces it. handler.ts:344 calls deps.assembleDiffGrounding(repo) with the repo only, and :356 rebuilds the subject with the diff-derived set. grounding.ts:208 takes (repoPath, deps), reads the working-tree diff at :212 and otherwise the last commit (:295, HEAD^). Making that path diff from the Story's base means changing the signature and body of assembleDiffCodeReviewGrounding and its call in the handler, and the design lists neither grounding.ts nor handler.ts as a call site or a contract; section 3.3 covers only the SubjectDeps seam. | Add the degraded-path contract: the function that receives the base, its fallback order (working tree, base..HEAD, then last commit or not), and the handler change. Or drop the degraded-path sentence from 2.4. |
| 4 edge row 12 / 9 OQ2 / ac5 | semantic | MED | manual | With the design as written (no ledger-file exclusion), a code review of committed Story work is scoped to the Story's range; the empty reviews observed today would have been fixed by it. | As designed, the code-review half would not have changed any of today's reviews. changed-files.ts:105 returns the working set whenever it is non-empty, and the review seam passes no exclusion (the BUILD writers do: completion-record.ts:74). In every review run today the tree held modified tracked ledger files (approval-stamped ISSUE json), so the working set was those files, the base would never have been consulted, and the degraded path would have done the same at grounding.ts:212. The design states this in its edge table and in open question 2, so it is not hidden; but ac5 as specified is proven only on a clean tree, which is not the state the reviews run in, because an approval writes a tracked file (see p10) immediately before the review. | Decide open question 2 inside this design or take the code-review half out of it. If it stays, ac5 needs a test with a dirty ledger file. |
| 5 integration | semantic | MED | assisted | The SIBLINGS and DRIFT integration tests as described (approve plans, implement, commit, validate, assert the change log lists only the Story's files) fail without the change and pass with it. | The tests can fail for the wrong reason as described. Approval rewrites the PLAN json (gates.ts:618), a tracked file in the fixture, so after 'approve two plans' the tree is dirty unless the test commits it. changed-files.ts:105 then returns the working set and never reads the base, so the validate change log lists ledger files whichever base is stamped. An assertion written as 'does not list s1's files' passes with and without the change; an assertion of the exact set fails with and without it. The design's rule that each test must go red under its named mutation would catch this, but the described steps do not include committing the approval and record files, and 'lists only the Story's files' does not say exact-set equality. | State in the test descriptions that the approval-stamped artifacts and the build-start record are committed (or excluded) before validate, and that the assertion is exact-set equality on the change log. |
| 2.1/c1 | ordering | LOW | manual | resolveStoryRangeBase today resolves in the order: stamped meta.rangeBase on the PLAN then the LLD, the introducing commit of the PLAN then the LLD, else a logged warning and undefined; it never returns HEAD^ or the empty tree, and a BUILD-record read can be added as a new first step without changing its signature. | range-base.ts:90 is the resolver; :96 loops the stamped base over upstreamIds (PLAN then LLD, :55-56 in p11's evidence), :104 loops the introducing commit, :114 returns undefined. No HEAD^ or empty-tree substitution exists. A BUILD-record read can precede :96 without a signature change. | none — verified sound |
| 3.2/c2 | citation | LOW | manual | The approval-time base is stamped write-once in approveArtifactByJsonPath, only for a plan or a standalone design.story LLD (stampsRangeBase), from headFullSha; this code is left unmodified by the design. | gates.ts:533-534 stamp only for workflow 'plan' or a standalone 'design.story'; :605-607 keep a prior base and otherwise call headFullSha, matching citation c2 verbatim. Note headFullSha (:548) is module-private, so the implement phase needs its own reader or an export; the design does not say which. | none — verified sound (state where the implement phase gets its full-sha HEAD reader) |
| 2.2/c3 | semantic | LOW | manual | Today the implement phase writes a BUILD record only on the Trivial standalone route (persistStandaloneBuildRecord); the plan-driven and Small routes write none at implement, so the design adds a new tasks-less BUILD record write for those routes on every admitted implement call. | implement.ts:133 persistStandaloneBuildRecord is the only record write in the phase and sits in the non-LLD (Trivial) branch after :126; the plan-driven path (:62 admitBuild onward) writes nothing. The design's description of today's behaviour is accurate. | none — verified sound |
| 2.4/c5/c6 | semantic | LOW | manual | The code review derives its changed set with deps.changedFiles(repoPath) and no base; passing { base } through the shared changedFiles gives the Story's base..HEAD set when the tree is clean, and the working tree otherwise, without modifying the derivation. | subject.ts:97 calls deps.changedFiles(repoPath) with no options; changed-files.ts:104-105 returns the working set when it is non-empty and :110 consults the base only otherwise. Passing { base } therefore gives base..HEAD on a clean tree and changes nothing on a dirty one, with no edit to the derivation. | none — verified sound |
| 4 edge rows 4-6 | semantic | LOW | manual | A Trivial or ISSUE-only bugfix build has no base today and gains one when started through implement; a Story never started through implement (validate first, built by hand) resolves exactly as today. | range-base.ts:55-56 consults only the PLAN and the LLD, and gates.ts:533-534 stamps only those, so a Trivial or ISSUE-only build has no base today; implement.ts:133 already writes a record on that route, so adding the stamp there gives it one. A Story whose first call is validate has no build-start stamp and falls to the existing steps, unchanged. | none — verified sound |
| 3.3 | citation | LOW | manual | SubjectDeps.changedFiles is typed (repoPath) => Promise<readonly string[]> today and its default points at the shared changedFiles, so widening it to accept ChangedFilesOptions keeps one-parameter stubs assignable. | subject.ts:56 types the seam as (repoPath) => Promise<readonly string[]> and :64 points it at the shared changedFiles; changed-files.ts:151 already declares the two-parameter form with the note that a one-parameter stub stays assignable. | none — verified sound |

#### Proposed fixes

- **2.2/6 backward compat (1)** (manual) — The design creates an approvable completion record at build start; the sweep that approves it exists today and is unguarded by default.
  - option: Keep the BUILD-record carrier and make pendingArtifactJsonPaths skip a BUILD whose body has no passed task
  - option: Store the build-start base on the Story's PLAN/LLD meta under a separate key (e.g. buildStartBase), so no BUILD record exists before validate
  - option: Store it in a sidecar outside the approvable artifact set
  - option: Accept the risk explicitly and document it as a known hole alongside the existing post-validate one

- **2.3/c4** (assisted) — Prior-wins is right for the normal path; the lifetime of the stamp and the no-prior case need a stated rule.
  - option: Write-once per build cycle: a prior record carrying approvedAt starts a new cycle and takes a fresh stamp
  - option: Write-once forever, and document that a re-opened Story must use a new story id
  - option: Leave as designed and list both cases as limitations

- **6 backward compat / step 6** (assisted) — A stamp taken after work has landed is the exact defect the write-once rule at the approval site exists to prevent; the trade the design accepts is avoidable.
  - option: Stamp only when there is no prior record, or the prior has no tasks
  - option: Stamp only when the approval-time base (if any) is an ancestor of HEAD and no commit since it touches the Story's record
  - option: Keep as designed and accept a short change set for in-flight Stories

- **2.4 postcondition 3** (manual) — A stated postcondition has no designed mechanism behind it.
  - option: Add assembleDiffCodeReviewGrounding(repoPath, { base }) and the handler call to section 2 and 3
  - option: Limit this Story to the graph path and file the degraded path separately

- **4 edge row 12 / 9 OQ2 / ac5** (manual) — Shipping the code-review half without the exclusion delivers a change that passes its tests and does not affect the case that motivated it.
  - option: Include a ledger-file exclusion (.insrc/artifacts and the work item's docs folder) before the emptiness check for the review seam and the degraded path
  - option: Drop section 2.4 and ac5 from this Story and file the review scoping, with the exclusion, as its own issue
  - option: Keep 2.4 as designed and record that it only takes effect on a clean tree

- **5 integration** (assisted) — The reproduction lives in the interaction between a dirty tree and the base; the fixture has to control it.
  - option: Commit ledger files after each approval and after implement in the fixture; assert deepEqual on the file list
  - option: Additionally add a variant with a dirty ledger file to document today's behaviour
