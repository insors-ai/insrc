<!-- insrc:artifact LLD-5f7a7cb95b643ae5-S001 -->

# LLD: E202610045f7a7cb9:S001

## Summary

**Epic:** `batch-approval-stamps-one-shared-meta`
**HLD base run:** `wf-1791120578044-07z84e`
**HLD effective hash:** `0ce31bf94de5...`

A Story's change set is everything between its range base and HEAD. Today that base is HEAD when the Story's plan was approved, so Stories approved together share one base and a Story built days later sweeps in every commit made since. This story records the base when the Story's build starts: the first admitted `implement` call writes HEAD to a small build-start file that is not an artifact and cannot be approved, and the build record writers and the code review all resolve the base from it. The code review also stops treating the workflow's own ledger files as a dirty tree, so it reviews the Story's committed range instead of whatever ledger file happens to be uncommitted.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)

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
- `repoPath: string` — The repository whose stores and git history are read.
- `epicHash: string` — The work item's hash.
- `storyId: string` — The Story within it.

**Returns:** `string | undefined` — The full 40-hex sha that starts the Story's committed range, or undefined when none can be established.

**Preconditions:**
- Signature unchanged; still synchronous, read-only and never throwing.

**Postconditions:**
- New FIRST step: the base in the Story's build-start file, when the file parses and its base is a well-formed 40-hex sha.
- Then, unchanged and in the same order: the approval-time meta.rangeBase on the PLAN, then the LLD; the commit that introduced the PLAN, then the LLD; otherwise a logged warning and undefined.
- No step substitutes a different range: HEAD^, the empty tree and 'the last commit' are never returned.
- The header comment is rewritten to give the new order and why the base moved to build start; the 'read at approval' rationale is recorded as the fallback's reason.

### 2.2 `stampBuildStart`

```typescript
(repoPath: string, epicHash: string, storyId: string) => 'stamped' | 'kept' | 'skipped-work-exists' | 'no-head'
```

**Parameters:**
- `repoPath: string` — The repository to stamp in.
- `epicHash: string` — The work item's hash.
- `storyId: string` — The Story whose build is starting.

**Returns:** `'stamped' | 'kept' | 'skipped-work-exists' | 'no-head'` — What happened, for the caller to log; no caller branches on it.

**Errors:**
- `Error (thrown on an unwritable store only)` when The build-start file cannot be written. The implement phase catches it; nothing else is thrown.

**Preconditions:**
- NEW function exported from src/workflow/runners/build/range-base.ts, beside the resolver that reads what it writes.
- Reads HEAD with its own full-sha reader (same contract as the approval site's private helper: a 40-hex sha or nothing).

**Postconditions:**
- KEPT: a build-start file with a well-formed base already exists and the Story has not been completed since it was written. Nothing is written.
- RE-STAMPED for a new cycle: the Story's BUILD record carries approvedAt later than the file's stampedAt (the Story was completed and is being built again). The file is rewritten with the current HEAD. Returns 'stamped'.
- SKIPPED: there is no usable build-start file AND the Story's BUILD record already carries at least one task and is not approved. Work has been validated, so HEAD is no longer before the Story's work; nothing is written and resolution keeps today's behaviour for that Story.
- NO-HEAD: HEAD cannot be read. Nothing is written.
- STAMPED otherwise: the file is written with HEAD's full sha and the current time.
- Never moves an existing base forward within one build cycle.

### 2.3 `handleImplement`

```typescript
(input: BuildStepInputImplement) => Promise<BuildStepImplement | BuildStepRefused | BuildStepError>
```

**Parameters:**
- `input: BuildStepInputImplement` — The implement request: a task target, or a standalone context.

**Returns:** `BuildStepImplement | BuildStepRefused | BuildStepError` — Unchanged.

**Preconditions:**
- Runs for every route: plan-driven, standalone Small, and Trivial/bugfix.

**Postconditions:**
- When the build is ADMITTED, stampBuildStart is called for the Story before the prompt is returned, on all three routes. On the Trivial route it is called BEFORE that route's existing BUILD record write.
- A refused or errored implement stamps nothing.
- A stampBuildStart failure is logged and swallowed; it never turns an admitted implement into an error.
- No BUILD record is written that is not written today: the plan-driven and Small routes still write none at implement.
- The returned prompt, task id and workflow id are byte-identical to today.

### 2.4 `changedFiles`

```typescript
(repoPath: string, opts?: ChangedFilesOptions) => Promise<readonly string[]>
```

**Parameters:**
- `repoPath: string` — The repository.
- `opts: ChangedFilesOptions` _(optional)_ — base and exclude as today, plus the new excludeUnder.

**Returns:** `Promise<readonly string[]>` — Unchanged: the working set when non-empty after exclusion, else base..HEAD when a base is given.

**Errors:**
- `NoBuildChangesError` when git fails, exactly as today.

**Preconditions:**
- The one filter closure is still applied to BOTH derivations.

**Postconditions:**
- A path is dropped when it equals an `exclude` entry (as today) OR lies under an `excludeUnder` directory prefix.
- Exclusion still runs BEFORE the emptiness check, so a tree dirty only with excluded paths falls through to the committed range.
- With no excludeUnder supplied the result is bit-for-bit today's, so both BUILD writers are unaffected.

### 2.5 `resolveCodeReviewSubject`

```typescript
(repoPath: string, epicHash: string, storyId: string, deps?: SubjectDeps) => Promise<CodeReviewSubjectResult>
```

**Parameters:**
- `repoPath: string` — The repository under review.
- `epicHash: string` — The work item's hash.
- `storyId: string` — The Story under review.
- `deps: SubjectDeps` _(optional)_ — Injectable seams; changedFiles now receives ChangedFilesOptions.

**Returns:** `Promise<CodeReviewSubjectResult>` — Unchanged shape.

**Errors:**
- `NoBuildChangesError (mapped to reason 'no-build-record')` when The git derivation fails, exactly as today.

**Preconditions:**
- The base comes from resolveStoryRangeBase, the same resolver the BUILD writers use.

**Postconditions:**
- The changed set is changedFiles(repoPath, { base, excludeUnder: LEDGER_PATHS }): the Story's uncommitted non-ledger work when there is any, otherwise the Story's base..HEAD range.
- Ledger paths never appear in the review subject.
- With no resolvable base and a tree with no non-ledger changes the subject is empty, as it is today for a clean tree.

### 2.6 `assembleDiffCodeReviewGrounding`

```typescript
(repoPath: string, deps?: DiffGroundingDeps, opts?: { base?: string | undefined; excludeUnder?: readonly string[] | undefined }) => Promise<{ grounding: CodeReviewGrounding; changedFiles: readonly string[] }>
```

**Parameters:**
- `repoPath: string` — The repository.
- `deps: DiffGroundingDeps` _(optional)_ — Diff seams; gains a `rangeDiff(repoPath, base)` member.
- `opts: { base?: string; excludeUnder?: readonly string[] }` _(optional)_ — The Story's base and the ledger prefixes, passed by the review-step handler.

**Returns:** `Promise<{ grounding: CodeReviewGrounding; changedFiles: readonly string[] }>` — Unchanged shape.

**Errors:**
- `DiffUnavailableError` when git fails on every path tried, as today.

**Preconditions:**
- Called by the review-step handler's degraded path, which resolves the Story's base and passes it with LEDGER_PATHS.

**Postconditions:**
- Working-tree diff files under an excludeUnder prefix are dropped before the emptiness check.
- When the remaining working set is empty AND a base is given, the diff is base..HEAD (with the same exclusion).
- When it is empty and NO base is given, the existing last-commit fallback is used, unchanged.
- Called with no opts it behaves exactly as today.

## 3. Data model changes

### 3.1 `Build-start file (.insrc/build-start/<epicHash>-<storyId>.json)` — new

One small json per Story: { epicHash, storyId, rangeBase (40-hex), stampedAt (ISO) }. Not an artifact: it lives outside .insrc/artifacts, matches no artifact id pattern, is not listed as pending and cannot be approved. Tracked like the artifact store unless a repo chooses to ignore it; if it is lost the resolver falls back as it does today.

**Call sites:**
- `src/workflow/runners/build/range-base.ts`
- `src/mcp/build-step/phases/implement.ts`

### 3.2 `ChangedFilesOptions.excludeUnder` — field-add

Optional list of repo-relative directory prefixes. Additive: omitted, the derivation is unchanged.

**Call sites:**
- `src/workflow/runners/build/changed-files.ts`
- `src/workflow/code-review/subject.ts`

### 3.3 `LEDGER_PATHS` — new

One exported constant naming the workflow's own ledger directories: `.insrc/`, `docs/epics/`, `docs/standalone/`. Used only by the code review's two paths. Defined once so the graph and degraded paths cannot disagree.

**Call sites:**
- `src/workflow/storage.ts`
- `src/workflow/code-review/subject.ts`
- `src/mcp/code-review-step/handler.ts`

### 3.4 `ApprovableArtifactMeta.rangeBase (approval-time stamp)` — invariant-change

Still stamped exactly as today. Its meaning changes from 'the Story's range base' to 'the fallback base for a Story with no build-start stamp'. The invariant it might break, 'a re-approval never moves an existing base', is untouched: the stamping code is not modified, only the resolver's order and the comments.

**Call sites:**
- `src/workflow/gates.ts`
- `src/workflow/runners/build/range-base.ts`

### 3.5 `SubjectDeps.changedFiles` — field-modify

Widens from (repoPath) to (repoPath, opts?: ChangedFilesOptions), matching the shared function it already points at; a one-parameter stub stays assignable. The invariant it might break, 'the review subject is the working tree', is the behaviour being corrected and still holds whenever the tree has non-ledger changes.

**Call sites:**
- `src/workflow/code-review/subject.ts`
- `src/workflow/runners/build/changed-files.ts`

## 4. Error paths

**Error cases**

- **HEAD cannot be read when a build starts (not a git repository, unborn HEAD, git unavailable).** (recoverable)
  - Detection: The git rev-parse call in stampBuildStart exits non-zero or its output is not a 40-hex sha.
  - Response: Return 'no-head' and write nothing. The implement turn proceeds; the resolver later falls through to its existing steps.
  - User impact: The Story's change set falls back to the approval-time base, or is empty when there is none. Never a substituted range.
- **The build-start file cannot be written (unwritable directory, disk error).** (recoverable)
  - Detection: The write throws; the implement phase wraps stampBuildStart in try/catch.
  - Response: Log a warning with the story id and the error; return the implement prompt exactly as today.
  - User impact: The build proceeds; the base falls back as above.
- **The build-start file is unparseable or its base is malformed (hand-edited, truncated).** (recoverable)
  - Detection: JSON.parse throws, or the base is not a string of exactly 40 hex characters; both the resolver and stampBuildStart apply the same check.
  - Response: The resolver treats it as absent and continues to its next step. stampBuildStart treats it as 'no usable file' and applies its normal rules, including the skip when validated work exists.
  - User impact: Same as an unstamped Story; a Story with validated work is not re-based.
- **The Story's BUILD record is unreadable when stampBuildStart consults it.** (recoverable)
  - Detection: Reading or parsing the record json fails inside a try/catch.
  - Response: Treated as 'no record': no tasks and no approval are assumed, so a missing stamp is written. Logged at warn.
  - User impact: If the Story did have validated work, its base moves to the current HEAD for that build. Rare, and only when the record is corrupt.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Two sibling Stories whose plans were approved in one sweep, built one after the other, each started through implement. | Each gets its own build-start file. The second Story's change set contains only the second Story's files. |
| A Story built days after its plan was approved, with unrelated commits landing in between. | Its base is HEAD at build start; the unrelated commits are outside its range. |
| A second implement call for the same Story after its first task's commits have landed. | 'kept': the file is not rewritten and the range still starts before the first task's commits. |
| A bugfix or Trivial build whose only upstream is an ISSUE, or nothing. | It is stamped at implement, so it has a base where today it has none. |
| A Story never started through implement (built by hand, or before this change) that has an approval-time base. | No build-start file exists; the resolver falls back to the approval-time base, exactly as today. |
| A Story that already has validated tasks on its BUILD record but no build-start file (mid-build when the update lands, or built by hand and later given an implement call). | 'skipped-work-exists': nothing is stamped and its resolution is unchanged. |
| A Story mid-build with commits landed but no validate run yet when the update lands. | It has no validated tasks, so its next implement stamps the current HEAD and its earlier commits fall outside the range for that build. A declared limitation: nothing on disk distinguishes this from a fresh start. |
| A completed Story (BUILD record approved) built again under the same id. | The stamp is older than the approval, so it is rewritten with the current HEAD: a new build cycle gets a new base. |
| A Story re-approved (PLAN or LLD) after its build has started. | The approval stamp's write-once rule is untouched and approval never writes the build-start file; nothing moves. |
| implement is refused by the admission gate. | Nothing is stamped. |
| Batch approval by epicHash while a Story's build is in progress. | The build-start file is not an artifact and is not swept. Exactly the BUILD records that are approvable today remain approvable; no new one exists. |
| Two Stories built interleaved: the second is started before the first's commits land. | The second Story's range includes the first's later commits. One range cannot separate interleaved work; a declared limitation. |
| The stamped base is no longer an ancestor of HEAD (history rewritten). | Not checked by the resolver. The existing diff either fails (caught, empty change set) or describes an unrelated range. A limitation the approval-time base already has. |
| A code review while the only uncommitted files are ledger files (an approval-stamped artifact json, a rendered artifact markdown, a build-start file). | They are excluded before the emptiness check, so the review subject is the Story's base..HEAD range. This is the state every review ran in on 2026-10-04. |
| A code review while the Story has uncommitted source changes as well as uncommitted ledger files. | The subject is the uncommitted source changes only; ledger files are dropped from it. |
| A code review of a Story with no resolvable base and no non-ledger changes in the tree. | Graph path: an empty subject, as today for a clean tree. Degraded path: the existing last-commit fallback, unchanged. |
| A Story whose own work is ledger files (a docs-only cleanup under docs/standalone). | Those files are excluded from the review subject. Accepted: ledger records are not reviewable code, and the BUILD record's change log (which does not use the ledger exclusion) still lists them. |

## 5. Test strategy

**Test framework:** `node:test via tsx, node:assert/strict, temp git repositories under os.tmpdir() (the existing mkCleanGitRepo idiom)`

**Test levels**

- **unit** — Pin the stamping rules, the resolver's order and the prefix exclusion in isolation. The story defines six acceptance criteria: ac1 siblings approved together get separate change sets; ac2 a build long after approval does not sweep intervening commits; ac3 a route with no stamped upstream gets a base; ac4 the preserved constraints hold (unresolvable means empty, never a substituted range; no stamp moves a base onto the Story's own work); ac5 no approvable record exists earlier than it does today; ac6 the code review is scoped to the Story's range, including when only ledger files are uncommitted. Each test is accepted only after its named mutation turns it red.
  - Subjects: `src/workflow/runners/build/__tests__/range-base.test.ts: the build-start base is returned ahead of an approval-time base on the PLAN (mutation: swap the order)`, `range-base.test.ts: with no build-start file the existing precedence is unchanged (PLAN stamp, LLD stamp, introducing commit, undefined)`, `range-base.test.ts: an unparseable file, or a base that is empty, short or non-hex, is ignored and resolution falls through (mutation: drop the 40-hex check)`, `range-base.test.ts: with nothing resolvable the result is undefined, never HEAD^ or a root commit`, `range-base.test.ts: stampBuildStart writes HEAD on first call and returns 'stamped'; a second call after a new commit returns 'kept' and the file is byte-identical (mutation: always write)`, `range-base.test.ts: stampBuildStart returns 'skipped-work-exists' and writes nothing when the BUILD record has a task and is unapproved and no stamp exists (mutation: drop the skip)`, `range-base.test.ts: stampBuildStart re-stamps when the BUILD record's approvedAt is later than the stamp's stampedAt, and keeps the stamp when approvedAt is earlier (mutation: drop the new-cycle rule; mutation: re-stamp whenever approved)`, `range-base.test.ts: stampBuildStart returns 'no-head' and writes nothing outside a git repository`, `src/workflow/runners/build/__tests__/changed-files.test.ts: a path under an excludeUnder prefix is dropped from the working set AND from the range set; a tree dirty only with such paths falls through to base..HEAD (mutation: apply the prefix after the emptiness check)`, `changed-files.test.ts: a sibling path that merely shares a name prefix with an excluded directory (docs/epics-notes.md vs docs/epics/) is kept (mutation: startsWith without the separator)`, `changed-files.test.ts: every existing test passes unmodified (no excludeUnder means today's result)`
- **integration** — Drive the real phases against real git history. Every fixture COMMITS the ledger files it produces (approval rewrites the PLAN json) before validating, so the committed range is actually consulted, and every change-log assertion is exact-set equality, not inclusion.
  - Subjects: `src/mcp/build-step/__tests__/build-step.test.ts: SIBLINGS: two plans approved in one batch, ledger committed; implement s1, commit s1's files, validate s1; implement s2, commit s2's files, validate s2; s2's change log equals exactly s2's files (mutation: remove the stamp call from implement, and s2's log also lists s1's files)`, `build-step.test.ts: DRIFT: approve and commit, land two unrelated commits, then implement, commit the Story's files, validate; the change log equals exactly the Story's files (mutation: resolver prefers the approval stamp)`, `build-step.test.ts: a second implement call after the first task's commit keeps the base; the change log equals both tasks' files`, `build-step.test.ts: a Trivial build and an ISSUE-only bugfix build get exactly their own files after commit, where today they get an empty log`, `build-step.test.ts: after implement on the plan-driven and Small routes NO BUILD record json exists, and a batch approval by epicHash at that point approves no BUILD record (mutation: write a BUILD record at implement)`, `build-step.test.ts: a refused implement writes no build-start file; an implement whose stamp write throws still returns its prompt; the implement response is deep-equal with and without stamping`, `build-step.test.ts: a Story with a validated task and no stamp is not stamped by a later implement, and its change log is what it was before`, `src/workflow/runners/build/__tests__/completion-record.test.ts: the completion writer resolves the build-start base and writes no build-start file`, `src/workflow/code-review/__tests__/subject.test.ts: Story work committed, tree dirty ONLY with a ledger json: subject.changedFiles equals exactly the Story's base..HEAD files (mutation: drop excludeUnder; mutation: drop the base)`, `subject.test.ts: Story work partly uncommitted plus a dirty ledger file: the subject equals the uncommitted source files only; and with no resolvable base and no non-ledger changes the subject is empty`, `src/workflow/code-review/__tests__/diff-grounding.test.ts: with a base and a tree dirty only with ledger files, the degraded grounding diffs base..HEAD and its changedFiles equals the Story's files; with no opts it behaves as today (existing tests unmodified); with no base it uses the last-commit fallback`, `src/mcp/code-review-step/__tests__/handler.test.ts: the degraded path passes the resolved base and LEDGER_PATHS to assembleDiffGrounding (asserted on the recorded call arguments)`
  - Fixtures: `a temp git repo helper that seeds two Stories under one epic (DEF + LLD + PLAN each), approves them, and commits named files between phases`, `a helper that commits all ledger files so the tree is clean before validate`
- **contract** — Guard what must not change.
  - Subjects: `src/workflow/__tests__ approval-gate tests pass unmodified (the approval-time stamp and its write-once rule)`, `existing BUILD record tests and goldens pass unmodified (the record gains no field)`, `existing code-review handler and runner tests pass unmodified`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `build-step.test.ts: SIBLINGS` |
| `ac2` | `build-step.test.ts: DRIFT`, `range-base.test.ts: the build-start base is returned ahead of an approval-time base on the PLAN` |
| `ac3` | `build-step.test.ts: a Trivial build and an ISSUE-only bugfix build get exactly their own files after commit` |
| `ac4` | `range-base.test.ts: with nothing resolvable the result is undefined, never HEAD^ or a root commit`, `range-base.test.ts: a second call after a new commit returns 'kept' and the file is byte-identical`, `range-base.test.ts: stampBuildStart returns 'skipped-work-exists' and writes nothing when the BUILD record has a task`, `approval-gate tests pass unmodified` |
| `ac5` | `build-step.test.ts: after implement on the plan-driven and Small routes NO BUILD record json exists, and a batch approval by epicHash at that point approves no BUILD record` |
| `ac6` | `subject.test.ts: Story work committed, tree dirty ONLY with a ledger json`, `diff-grounding.test.ts: with a base and a tree dirty only with ledger files, the degraded grounding diffs base..HEAD`, `handler.test.ts: the degraded path passes the resolved base and LEDGER_PATHS to assembleDiffGrounding` |

## 6. Migration

**State before:** Per the s1 bundles: a Story's range base is HEAD at approval, stamped write-once on its PLAN or standalone LLD and read by resolveStoryRangeBase. Batch approval gives sibling plans one shared base and a base ages for as long as the build is delayed. An ISSUE-only bugfix and a Trivial build have no base. The implement phase writes a BUILD record only on the Trivial route. The code review derives its changed set from the working tree with no base and no exclusion, on both its graph path and its degraded path, so an uncommitted ledger file becomes the whole review subject.

**State after:** The first admitted implement call for a Story writes HEAD to a build-start file that is not an artifact; the resolver reads it first and falls back to the approval-time base. No BUILD record is written earlier than today. The shared changed-set derivation accepts directory-prefix exclusions; the code review passes the Story's base and the ledger directories on both its paths, so it reviews the Story's uncommitted source work, or else its committed range.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the directory-prefix exclusion to the shared changed-set derivation (additive; no caller passes it yet). — ↩ rollbackable
2. Add the build-start stamp writer beside the resolver, and have the resolver read the stamp ahead of its existing steps; rewrite the resolver's header comment and the approval-site comment to describe the build-start base as primary and the approval-time base as the fallback. — ↩ rollbackable
3. Call the stamp writer from the implement phase on every admitted route, fail-open. — ↩ rollbackable
4. Define the ledger-directory constant once; pass the Story's base and the ledger exclusion from the code review's graph path, and add the base and exclusion to the degraded diff grounding with the review-step handler supplying them. — ↩ rollbackable
5. Add the unit and integration tests, with fixtures that commit ledger files before validating and exact-set assertions; run the approval-gate, BUILD-record and existing code-review suites unmodified. — ↩ rollbackable
6. Ship with the daemon update. No backfill: existing Stories have no build-start file and resolve exactly as they do today until their next admitted implement call, which stamps only when the Story has no validated work. — ↩ rollbackable

**Backward compat:** resolveStoryRangeBase, handleImplement, changedFiles and resolveCodeReviewSubject keep their signatures; assembleDiffCodeReviewGrounding gains an optional third parameter and behaves as today without it. The implement response is unchanged and no BUILD record appears earlier than today, so approval and completion behave as they do now. Observable differences: (1) a new .insrc/build-start/ directory appears in repositories that run builds; (2) a Story started through implement gets a narrower, correct change set; (3) a code review no longer lists ledger files and, when the Story's work is committed, covers the Story's whole range instead of an uncommitted ledger file or the last commit. A Story with commits but no validated task when the update lands is stamped at its next implement, so its change set for that build can miss the earlier commits. Rolling back leaves the build-start files on disk, where the old code ignores them.

## 7. Alternatives considered

### 7.1 a1: Build-start stamp in its own non-approvable file — **CHOSEN**

The first admitted implement call for a Story writes a small build-start file outside the artifact store; the resolver reads it first; the code review resolves the same base and ignores the workflow's ledger paths.

Carry the build-start base in a dedicated file under .insrc/build-start/, keyed by epic hash and story id, that is not an artifact: it matches no artifact id pattern, is never listed as pending and cannot be approved. The implement phase stamps it on every route when the build is admitted, subject to two rules: an existing valid stamp is never rewritten, and no first stamp is taken when the Story's BUILD record already carries validated tasks (work has landed, so HEAD is no longer before the Story's work). A completed Story that is built again gets a fresh stamp. resolveStoryRangeBase reads the stamp first, then its existing steps unchanged. The shared changed-set derivation gains a directory-prefix exclusion; the code review, on both its graph and degraded paths, passes the Story's base and excludes the ledger paths, so a tree dirty only with ledger files falls through to the Story's committed range.

### 7.2 a2: Build-start stamp on the BUILD record, with the approval sweep skipping task-less records

Stamp meta.rangeBase on the Story's BUILD record at implement and change batch approval so a BUILD record with no validated tasks is never approved.

Keep the first draft's carrier (the BUILD record, written at implement on every route, rangeBase prior-wins in the merge) and close the early-completion path by having the pending sweep and the single-artifact approval refuse a BUILD record whose body has no tasks. The code-review half is the same as a1.

**Rejected because:** Fixes the same triggers and keeps the base on the record it describes, but does so by changing approval behaviour on every route and by putting task-less BUILD records in front of every reader of the store. The blast radius is larger than the defect.

### 7.3 a3: Keep the base at approval and advance it past sibling builds

Stay with HEAD-at-approval and move a Story's effective base past commits recorded by other Stories' builds.

Leave the stamp at approval. At resolve time read other Stories' BUILD records and advance this Story's base to the latest recorded completion commit that is an ancestor of HEAD.

**Rejected because:** Narrows the defect instead of removing it and leaves the unstamped routes uncovered.

## 8. References

- **[[c1]]** `code` `src/workflow/runners/build/range-base.ts` — "export function resolveStoryRangeBase(repoPath: string, epicHash: string, storyId: string): string | undefined {"
- **[[c2]]** `code` `src/workflow/gates.ts` — "const re = new RegExp(`^(DEF|HLD|LLD|PLAN|BUILD)-${epicHash}(-.*)?\\.json$`);"
- **[[c3]]** `code` `src/mcp/build-step/phases/implement.ts` — "function handleStandaloneImplement("
- **[[c4]]** `code` `src/workflow/runners/build/changed-files.ts` — "export async function changedFiles(repoPath: string, opts?: ChangedFilesOptions): Promise<readonly string[]> {"
- **[[c5]]** `code` `src/workflow/code-review/subject.ts` — "changedFiles = await deps.changedFiles(repoPath);"
- **[[c6]]** `code` `src/workflow/code-review/grounding.ts` — "export async function assembleDiffCodeReviewGrounding("
- **[[c7]]** `code` `src/mcp/code-review-step/handler.ts` — "const diff = await deps.assembleDiffGrounding(repo);"
- **[[c8]]** `prior-artifact` `ISSUE-5f7a7cb95b643ae5` — "Make each Story's change set describe only that Story, even when its plan was approved in the same sweep as its siblings'."
- **[[c9]]** `stakeholder` `user decision, 2026-10-04` — "go ahead this the recos"
- **[[c10]]** `step-output` `s1`
- **[[c11]]** `step-output` `s3`

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.story (design.story)

**1 HIGH · 3 MED · 6 LOW** · model `client` · reviewed 2026-10-04T13:37:26.891Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| 2.4 postcondition 3 / 4 edge row 1 | ordering | HIGH | assisted | With no excludeUnder supplied both BUILD writers are unaffected by the new build-start file, and after implement, commit and validate a Story's change log contains only the Story's own files. | Contradicted. Both BUILD writers exclude only the record's own json and md (validate.ts:250, completion-record.ts:74) and the design says they pass no excludeUnder, so the build-start file is an ordinary path to them. Two ways it reaches the change log. (a) Tracked and modified: the design's own new-cycle rule rewrites an existing, committed build-start file at implement. If that rewrite is not committed before validate, changed-files.ts:95-105 finds it in the working set and returns at :105, so the base is never consulted and the rebuilt Story's change log is the build-start file alone. (b) Committed with the Story's work: the implement prompt mandates a commit (implement-task.md:26) and the design says the file is tracked like the artifact store, so it sits inside base..HEAD and :112 returns it; the change log then lists .insrc/build-start/<epic>-<story>.json beside the Story's files, which contradicts 'contains only the second Story's files'. A first stamp that is never added to git is invisible, because the tool runs plain `git diff` (diff.ts:167), which does not report untracked files; that is the one state in which the claim holds. | Have both BUILD writers add the Story's build-start path to their existing `exclude` list (it runs before the emptiness check), and state it in sections 2 and 3. Add an integration test for a re-stamped (tracked, modified) build-start file at validate. |
| 2.6 / c6 / c7 | semantic | MED | manual | On the degraded path, dropping ledger FILES from the diff's file list before the emptiness check, and diffing base..HEAD with the same file exclusion, yields a grounding that carries the Story's source hunks; the handler passes the base and LEDGER_PATHS at its single assembleDiffGrounding call. | The mechanism is now designed (the earlier finding is resolved): grounding.ts:208 is the function, handler.ts:344 the single call, :356 the subject re-key. One gap. The diff body is capped before any exclusion can apply: diff.ts:51 sets a 256 KB default and :104 applies it in the shell call; grounding.ts:276 returns that already-truncated body and :225-226 split it per file and only append a truncation note. A Story's base..HEAD range includes its committed ledger files, and git emits paths in order, so '.insrc/...' and 'docs/...' come before 'src/...'. Dropping ledger entries from the FILE list afterwards does not give the source files their hunks back; they are kept in the list with an empty or cut-off diff. The design specifies the exclusion on files only. | Specify the exclusion at the git level for rangeDiff and the working-tree diff (a pathspec exclude, or per-path diffs for the kept files), or raise the cap for these calls, and add a test with a large ledger diff ahead of a small source diff. |
| 3.3 / 4 edge row 17 | semantic | MED | assisted | Excluding everything under .insrc/, docs/epics/ and docs/standalone/ from the review subject drops only workflow ledger files and no reviewable work. | The three prefixes cover more than ledger records. template-loader.ts:59 and format/template-loader.ts:51 load user-authored templates and formats from .insrc/artifacts/templates and .insrc/artifacts/formats, and feedback.ts:75 reads .insrc/feedback; a Story that changes those would have that work excluded from its review, and any finding on them dropped as out of scope. Under docs/epics and docs/standalone the same applies to deliverables kept beside the artifacts (for example a Story's reference mock html). The design accepts the docs-only case in its edge table; it does not mention the .insrc configuration directories. The prefix match itself is specified with a separator and has a test for a sibling name. | Either narrow the .insrc entry to the ledger parts (.insrc/artifacts/*.json and .insrc/build-start/) or state that templates, formats and feedback are knowingly unreviewed. |
| 5 integration | semantic | MED | assisted | The integration tests as described (ledger committed before validate, exact-set equality on the change log, and 'no BUILD record after implement') fail without the change, pass with it, and would expose a build-start file that keeps the tree dirty or leaks into the change log. | The earlier test finding is addressed in wording (ledger committed before validate, exact-set equality, a no-BUILD-record-after-implement test). Two problems remain. First, the fixtures and the design disagree: a helper that 'commits all ledger files so the tree is clean before validate' commits the build-start file after the stamp was taken, which puts it inside base..HEAD (changed-files.ts:112); with the writers excluding only their own record (validate.ts:250), 'the change log equals exactly s2's files' then fails with the design as written. If the helper instead leaves the file untracked, the tests pass and never exercise a tracked build-start file. Second, no integration test covers the new-cycle re-stamp followed by a validate, which is where the modified tracked file returns at changed-files.ts:105 and the range is never consulted. | Decide the build-start file's handling in the BUILD writers (see q3), then say in the fixtures whether it is committed, and add an integration test: completed Story, implement again (re-stamp), commit source only, validate, change log equals exactly the new files. |
| 3.1 / 4 edge row 11 / c2 | closed-union | LOW | manual | A file at .insrc/build-start/<epicHash>-<storyId>.json is outside every approval and pending scan: the batch sweep and the pending listing read only .insrc/artifacts, so no new approvable record exists and no BUILD record is written earlier than today. | gates.ts:691 scans join(repoPath, ARTIFACTS_DIR) and :693 matches only `^(DEF\|HLD\|LLD\|PLAN\|BUILD)-<epicHash>`; storage.ts:53 sets ARTIFACTS_DIR to '.insrc/artifacts'. A file under .insrc/build-start/ is in neither the directory nor the pattern. implement.ts:126-133 shows the only record write at implement is still the Trivial branch. The earlier HIGH (a task-less BUILD record approvable from build start) is resolved by the change of carrier, not moved. | none — verified sound |
| 3.1 | closed-union | LOW | manual | Nothing enumerates the .insrc directory as a whole or assumes it holds only artifacts and config: the indexer ignores it, the docs-tree migration scans only .insrc/artifacts, and .gitignore ignores only .insrc/config.json, so a new .insrc/build-start/ directory is tracked and otherwise inert. | indexer/watcher.ts:15 lists '.insrc' in IGNORE_DIRS; migrate-docs-tree.ts:320 reads artifactsDir only; .gitignore:24-25 ignores only .insrc/config.json and notes the artifact store stays tracked. A new .insrc/build-start/ directory is therefore tracked by default and not enumerated by these readers. | none — verified sound |
| 2.2 | ordering | LOW | manual | stampBuildStart's four outcomes never move a base onto a Story's own work within one build cycle, on every route including Trivial where implement itself writes a BUILD record: an existing valid stamp is kept, a Story with a validated task and no stamp is skipped, and a Story completed since the stamp is re-stamped. | Traced against the reads. Trivial, first implement: no stamp and no record, so it stamps, then implement.ts:133 writes a record whose body (:139) has no tasks. Second implement before validate: the stamp exists, so 'kept'. After a validate has written tasks (validate.ts:234): the stamp still exists, so 'kept', not 'skipped'. A Story completed before this change with no stamp: its record is approved, so the skip rule (which requires an unapproved record) does not fire and it is stamped as a new cycle. Within a re-stamped cycle the old approvedAt stays on the record (standalone-record.ts:364, prior wins) and is earlier than the new stampedAt, so later calls return 'kept'. Both timestamps are written by the same host's clock in the normal flow. Not covered, and worth listing as a limitation: a build that was started, never validated or approved, and resumed much later keeps its old stamp, so the drift returns for that Story. | none — verified sound (optional: list the abandoned-then-resumed build as a limitation) |
| 2.1 / c1 | ordering | LOW | manual | resolveStoryRangeBase can read the build-start file as a new first step ahead of its unchanged existing steps (PLAN stamp, LLD stamp, introducing commits, undefined), and both BUILD writers resolve through it. | range-base.ts:90 is the resolver, :96 begins its first existing step and :114 is the undefined return; validate.ts:248 and completion-record.ts:72 both call it, so a new first step reaches both writers with no change at the call sites. | none — verified sound |
| 2.4 / 2.5 / c4 / c5 | semantic | LOW | manual | Adding excludeUnder to the single filter closure in changedFiles, applied before the emptiness check, makes the code review's graph path fall through to base..HEAD when the tree is dirty only with ledger files, and subject.ts passes the options through its changedFiles seam. | changed-files.ts:91-92 build one `drop` set and one `keep` closure, applied at :104 before the emptiness check and again to the range; :110 consults the base only after that. A prefix test added to the same closure gives the stated behaviour. subject.ts:56 and :97 are the seam and its single call, which today passes no options. | none — verified sound |
| 2.5 / handler | semantic | LOW | manual | The code review's freshness gate and scope filter consume subject.changedFiles, so removing ledger paths from the subject also removes them from the stale-file check and the findings scope. | handler.ts:257 builds the freshness parameters from subject.changedFiles and :289 waits while any of them is stale; watcher.ts:15 shows the indexer ignores .insrc, so a ledger path in the subject can never become fresh. Removing ledger paths from the subject therefore also removes the permanent stale-file wait seen in today's reviews. A side benefit the design does not claim. | none — verified sound |

#### Proposed fixes

- **2.4 postcondition 3 / 4 edge row 1** (assisted) — The exclusion mechanism already exists and already carries the record's own paths for the same reason.
  - option: Add the build-start file path to `exclude` in validate.ts and completion-record.ts
  - option: Keep the build-start directory out of git (write a .gitignore entry) so it can never be dirty or in a range, and accept that it does not travel with the repo
  - option: Give the BUILD writers the ledger exclusion for the emptiness check only, so no uncommitted ledger file can stand in for work

- **2.6 / c6 / c7** (manual) — Filtering the file list after a size-capped read cannot recover hunks the cap removed.
  - option: Pass the excluded prefixes to git as pathspec exclusions so ledger hunks are never read
  - option: Diff only the kept files, one call each
  - option: Keep post-hoc filtering and raise maxBytes to the 2 MB cap for the degraded path, accepting truncation beyond it

- **3.3 / 4 edge row 17** (assisted) — The exclusion is broader than the thing it names.
  - option: Narrow to .insrc/artifacts/ json records and .insrc/build-start/, keeping templates and formats reviewable
  - option: Keep .insrc/ whole and add the configuration directories to the accepted-limitations row

- **5 integration** (assisted) — As described, the suite either fails on the design or passes without touching the failing state.
  - option: Exclude the build-start path in the writers and have fixtures commit it; add the re-stamp integration test
  - option: Keep the file untracked by design and assert that in a test
