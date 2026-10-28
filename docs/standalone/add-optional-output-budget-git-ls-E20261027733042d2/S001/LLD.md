<!-- insrc:artifact LLD-733042d2e435fabd-s1 -->

# LLD: STORY-733042d2e435fabd-s1

## Summary

**Epic:** `add-optional-output-budget-git-ls`
**HLD base run:** `wf-1793101332930-dj9thi`
**HLD effective hash:** `733042d2e435...`

git_ls_files gets one optional integer input, maxBytes (1 to 52428800), that sets how much output the listing may hold. Without it nothing changes: the 10 MiB default of the shell helper still applies. A listing over the budget stays a rejected failure and is never returned cut. readGit gains the matching optional parameter, and git_rev_parse and git_hash_object now fail on a cut capture instead of reading a cut line (added to this Story on 2026-10-27); no other git tool or caller changes. The consumer is Story s9's ignore filter, which needs 50 MiB.

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

### 2.1 `gitLsFilesTool (input maxBytes added)`

```typescript
gitLsFilesTool.inputSchema: Type.Object({ cwd?, paths?, cached?, others?, ignored?, maxBytes?: number }, { additionalProperties: false }) with maxBytes: Type.Optional(Type.Integer({ minimum: 1, maximum: 52428800 })); execute(input: ToolInput): Promise<ToolResult>
```

**Parameters:**
- `maxBytes: number (integer, 1 to 52428800)` _(optional)_ — The most stdout the listing may produce; the default is runShell's 10 MiB.

**Returns:** `ToolResult with data { files: string[] }` — Unchanged: the listed files, exactly as git printed them.

**Errors:**
- `ToolFailure kind 'rejected'` when the listing is longer than the budget (parseOutput: 'git output was cut at the byte limit'), or maxBytes is outside 1 to 52428800 or not an integer (the input schema)

**Preconditions:**
- None.

**Postconditions:**
- With no maxBytes the call is exactly the call made today.
- A listing over the budget is never returned cut.

### 2.2 `readGit (parameter maxBytes added)`

```typescript
function readGit(label: string, argv: readonly string[], cwd: string, timeoutMs: number, signal?: AbortSignal, maxBytes?: number): Promise<{ ok: true; r: ShellResult } | { ok: false; failure: ToolResult }>
```

**Parameters:**
- `maxBytes: number` _(optional)_ — Passed to runShell as its stdout and stderr byte budget; absent means runShell's default.

**Returns:** `Promise<{ ok: true; r: ShellResult } | { ok: false; failure: ToolResult }>` — Unchanged.

**Preconditions:**
- None.

**Postconditions:**
- The six other callers (git_ls_tree, git_rev_parse, git_for_each_ref, git_path_history, git_rev_list and git_hash_object), which pass no maxBytes, run exactly as before.

### 2.3 `gitRevParseTool (cut capture fails)`

```typescript
gitRevParseTool.execute(input: ToolInput, deps?: ToolDeps): Promise<ToolResult>; output data: { values: string[] }
```

**Parameters:**
- `input: ToolInput` — Unchanged.

**Returns:** `ToolResult with data { values }` — Unchanged for output that fit the capture.

**Errors:**
- `ToolFailure kind 'rejected'` when the capture was cut (stdoutTruncated): 'git output was cut at the byte limit', from parseOutput

**Preconditions:**
- None.

**Postconditions:**
- Reads its output through parseOutput, so a cut capture is never split into values and returned as a success.
- Input, argv, timeout and the values of an uncut read are unchanged.

### 2.4 `gitHashObjectTool (cut capture fails)`

```typescript
gitHashObjectTool.execute(input: ToolInput): Promise<ToolResult>; output data: { sha: string }
```

**Parameters:**
- `input: ToolInput` — Unchanged.

**Returns:** `ToolResult with data { sha }` — Unchanged for output that fit the capture.

**Errors:**
- `ToolFailure kind 'rejected'` when the capture was cut (stdoutTruncated): 'git output was cut at the byte limit', from parseOutput, before the object-name check

**Preconditions:**
- None.

**Postconditions:**
- Reads its output through parseOutput; the object-name check runs only on an uncut read.
- Input, argv, timeout and the sha of an uncut read are unchanged.

## 3. Data model changes

### 3.1 `git_ls_files input schema` — field-add

One optional field maxBytes (integer, minimum 1, maximum 52428800). The schema stays additionalProperties false, so a caller that does not know the field is unaffected and a caller that sends it on an older daemon is refused by that daemon's schema.

```
+ maxBytes: Type.Optional(Type.Integer({ minimum: 1, maximum: 52428800 }))
```

**Call sites:**
- `src/daemon/tools/builtins/git/ls-files.ts:14`
- `src/analyze/context/repo-ignore-filter.ts:111`

## 4. Error paths

**Error cases**

- **The listing is longer than the budget** (recoverable)
  - Detection: runShell sets stdoutTruncated when stdoutBytes passes maxBytes (src/daemon/tools/shell-helper.ts:207) and parseOutput returns the rejected failure 'git output was cut at the byte limit' (src/daemon/tools/builtins/git/parsers.ts:24)
  - Response: The failure is returned; no files are returned and the cut text rides only on failure.original.
  - User impact: The ignore filter degrades to permissive with its warning, as it does today past 50 MiB.
- **maxBytes is zero, negative, not an integer or above 52428800** (recoverable)
  - Detection: The input is checked against the tool's input schema (Type.Integer with minimum 1 and maximum 52428800) before execute runs
  - Response: The call is refused as an invalid input and no command runs.
  - User impact: The caller sees the schema's message.
- **git ls-files fails or is not installed** (recoverable)
  - Detection: readGit returns a failure for a spawn error or a non-zero exit (helpers.ts:107-108)
  - Response: Unchanged: that failure is returned.
  - User impact: As today.
- **git_rev_parse or git_hash_object prints more than the capture holds** (recoverable)
  - Detection: runShell sets stdoutTruncated (src/daemon/tools/shell-helper.ts:207); the tool passes its read through parseOutput (src/daemon/tools/builtins/git/parsers.ts:19), which fails a cut capture
  - Response: A rejected failure 'git output was cut at the byte limit' and no data. Before this change neither tool checked for a cut capture: git_rev_parse split the cut text into values and returned success, and git_hash_object checked only that the retained text is an object name, so it failed when the retained text was something else and succeeded when the retained text was a valid object name followed by dropped output (runShell keeps whole chunks and drops the rest).
  - User impact: A caller never receives cut values as if they were whole; outputs of one line or a few lines never reach the limit, so no existing use changes.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| No maxBytes | The call is exactly the call made today, under runShell's 10 MiB. |
| A listing of exactly maxBytes bytes | Accepted: runShell appends while stdoutBytes is at most maxBytes. |
| A listing one byte over maxBytes | Refused as above. |
| maxBytes 52428800 with a small listing | The same files as without it. |
| A unicode file name that counts more bytes than characters | The budget counts bytes, as runShell does. |

**Invariants to preserve**

- A listing that does not fit is a failure and is never returned cut. [[c3]]
- The six readGit callers other than git_ls_files (git_ls_tree, git_rev_parse, git_for_each_ref, git_path_history, git_rev_list and git_hash_object) pass no maxBytes and keep runShell's 10 MiB default. [[c3]]
- git_ls_files keeps its tool id, its other inputs, its arguments (--literal-pathspecs, -z, --exclude-standard with others or ignored) and the NUL check on paths. [[c3]]
- git_rev_parse and git_hash_object keep their inputs, argv, timeouts and results for output that fits the capture; only a cut capture changes, from a cut success (rev-parse), or a success or an object-name failure depending on the retained text (hash-object), to the one cut-capture failure. [[c3]]

## 5. Test strategy

**Test framework:** `node:test with tsx (npx tsx --test), assert/strict; git tool tests in src/daemon/tools/builtins/git/__tests__ with a stand-in git binary (installStandInBin from src/daemon/tools/__tests__/_bin.ts) for controlled output sizes and the temporary-repository helper _repo.ts; use --test-force-exit.`

**Test levels**

- **unit** — The input range, the default, the budget boundary and the unchanged callers, against a stand-in git.
  - Subjects: `src/daemon/tools/builtins/git/__tests__/git-ls-files-budget.test.ts: maxBytes is accepted as an integer from 1 to 52428800 and refused as 0, a negative, a fraction or 52428801 by the input schema, and every other input of the tool is unchanged`, `src/daemon/tools/builtins/git/__tests__/git-ls-files-budget.test.ts: with no maxBytes a listing over 10 MiB is a rejected failure, as before`, `src/daemon/tools/builtins/git/__tests__/git-ls-files-budget.test.ts: with maxBytes 52428800 a listing between 10 MiB and 50 MiB is returned whole`, `src/daemon/tools/builtins/git/__tests__/git-ls-files-budget.test.ts: a listing of exactly maxBytes bytes is returned and one of maxBytes plus one byte is a rejected failure that returns no files, with multibyte names counted in bytes`, `src/daemon/tools/builtins/git/__tests__/git-ls-files-budget.test.ts: each of the six other readGit-based tools (git_ls_tree, git_rev_parse, git_for_each_ref, git_path_history, git_rev_list and git_hash_object) still cuts at 10 MiB and passes no maxBytes, and git_ls_files still runs the same argv and refuses a NUL in a path before any command runs`, `src/daemon/tools/builtins/git/__tests__/git-read-cut.test.ts: git_rev_parse and git_hash_object return a rejected failure that says the output was cut and no data when the capture is cut (for git_hash_object also when the retained text is a valid object name followed by output that overflowed), and return the same results as before for output that fits`
  - Fixtures: `installStandInBin('git', ...) printing a controlled number of bytes`
- **contract** — The coverage table and the existing git suites accept the new input.
  - Subjects: `src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts: the ls-files coverage case still passes and the git_ls_files input lists maxBytes`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `src/daemon/tools/builtins/git/__tests__/git-ls-files-budget.test.ts: maxBytes is accepted as an integer from 1 to 52428800 and refused as 0, a negative, a fraction or 52428801 by the input schema, and every other input of the tool is unchanged` |
| `ac2` | `src/daemon/tools/builtins/git/__tests__/git-ls-files-budget.test.ts: with no maxBytes a listing over 10 MiB is a rejected failure, as before`, `src/daemon/tools/builtins/git/__tests__/git-ls-files-budget.test.ts: with maxBytes 52428800 a listing between 10 MiB and 50 MiB is returned whole` |
| `ac3` | `src/daemon/tools/builtins/git/__tests__/git-ls-files-budget.test.ts: a listing of exactly maxBytes bytes is returned and one of maxBytes plus one byte is a rejected failure that returns no files, with multibyte names counted in bytes` |
| `ac4` | `src/daemon/tools/builtins/git/__tests__/git-ls-files-budget.test.ts: each of the six other readGit-based tools (git_ls_tree, git_rev_parse, git_for_each_ref, git_path_history, git_rev_list and git_hash_object) still cuts at 10 MiB and passes no maxBytes, and git_ls_files still runs the same argv and refuses a NUL in a path before any command runs` |
| `ac5` | `src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts: the ls-files coverage case still passes and the git_ls_files input lists maxBytes` |
| `ac6` | `src/daemon/tools/builtins/git/__tests__/git-read-cut.test.ts: git_rev_parse and git_hash_object return a rejected failure that says the output was cut and no data when the capture is cut (for git_hash_object also when the retained text is a valid object name followed by output that overflowed), and return the same results as before for output that fits` |

## 6. Migration

**State before:** git_ls_files has inputs cwd, paths, cached, others and ignored and reads under runShell's 10 MiB default; readGit takes no byte budget (s1 bundle 1). A listing over the budget is a rejected failure (s1 bundle 2). The consumer, createRepoIgnoreFilter, allows 50 MiB (s1 bundle 3).

**State after:** git_ls_files also accepts an optional maxBytes (1 to 52428800) that readGit hands to runShell. Without it every call is as before. A listing over the budget is still a rejected failure. git_rev_parse and git_hash_object also fail on a cut capture; no other tool or readGit caller changes. git_rev_parse and git_hash_object fail on a cut capture.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the optional maxBytes parameter to readGit and pass it into the runShell options. — ↩ rollbackable
2. Add the optional maxBytes input to git_ls_files and pass it to readGit. — ↩ rollbackable
3. Make git_rev_parse and git_hash_object read their output through parseOutput, so a cut capture is the one failure; keep their other behaviour. — ↩ rollbackable
4. Add the new test file, extend the coverage test, and run the git suites and the typecheck. — ↩ rollbackable

**Backward compat:** Additive: a new optional input on git_ls_files and a new optional last parameter on readGit. Existing calls, the tool id, the other inputs and the six other readGit callers are unchanged, and the default budget is unchanged. A caller that sends maxBytes to a daemon built before this change is refused by that daemon's schema (additionalProperties false). One behaviour change, for output over the 10 MiB capture only: git_rev_parse returned the cut text split into values as a success, and git_hash_object succeeded or failed with a different message depending on the retained text; both now fail with the cut-capture message. One-line and few-line outputs never reach that size.

## 7. Alternatives considered

### 7.1 a1: Optional maxBytes input on git_ls_files, passed through readGit — **CHOSEN**

git_ls_files takes an optional integer maxBytes (1 to 52428800); readGit takes an optional maxBytes and hands it to runShell.

Add `maxBytes: Type.Optional(Type.Integer({ minimum: 1, maximum: 52428800 }))` to the input schema of src/daemon/tools/builtins/git/ls-files.ts. execute reads it and passes it to readGit, whose new optional last parameter (after signal) goes into the runShell options. When it is absent nothing changes (runShell's 10 MiB default). A listing over the budget is already a rejected failure through parseOutput ('git output was cut at the byte limit'), never a cut result. Separately, git_rev_parse and git_hash_object read through parseOutput so a cut capture is a failure; no other tool and no other readGit caller changes.

### 7.2 a2: Raise git_ls_files' fixed budget to 50 MiB

Give git_ls_files a fixed 50 MiB read budget with no new input.

Pass a constant 50 MiB maxBytes from ls-files.ts to readGit for every call; no input is added.

**Rejected because:** Violates the optional-input and unchanged-default requirements (req1, req2).

### 7.3 a3: A budget option on every readGit tool

Add the same optional maxBytes to the other readGit-based tools (rev-list, ls-tree, path-history and others).

Give every tool that calls readGit an optional maxBytes input and pass it through, so the family is uniform.

**Rejected because:** Violates the stated scope (req4) and multiplies the test surface (req5).

## 8. References

- **[[c1]]** `analyze-bundle` `git_ls_files and the read helper it uses (read from the files; the analyzer call graph was not run)` — "readGit is readGit(label, argv, cwd, timeoutMs, signal?) and calls runShell(argv, { cwd, timeoutMs, signal }) with no maxBytes"
- **[[c2]]** `analyze-bundle` `what happens when the output passes the budget` — "parseOutput returns a rejected failure 'git output was cut at the byte limit' when stdoutTruncated is true"
- **[[c3]]** `analyze-bundle` `git_ls_files and the read helper it uses; what happens when the output passes the budget` — "Eight production call sites use readGit; a listing over the budget is already a failure and is never returned cut"
- **[[c4]]** `analyze-bundle` `the consumer` — "createRepoIgnoreFilter runs git ls-files with maxBuffer 50 * 1024 * 1024"
- **[[c5]]** `code` `src/daemon/tools/shell-helper.ts:51` — "const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;"
- **[[c6]]** `code` `src/daemon/tools/builtins/git/parsers.ts:24` — "if (r.stdoutTruncated) {"

## 9. Open questions

- The Story record has no acceptance criteria; ac1 to ac5 were written in the test strategy from the Story text and each has a proving test. Confirm them as the acceptance baseline. The originating request is the Story's userValue text (the user's 2026-10-27 answer 'A' to add the budget option for Story s9 of the one-tool-registry epic).
- Whether any test pins the input-schema field list of git tools was not read; the build should search for one (a table of inputs per tool) before adding the field.
- Alternative scoring (alt2): there are no Story criteria, shared contracts or Epic constraints, so the alternatives were scored against five requirements read from the Story text (req1 to req5).
- Invariant sources (ep3): all three invariants cite c3; the evidence is in s1 bundles 1 and 2.
- Review round 1 corrected the caller count: readGit( appears eight times including its definition, so seven tools call it and six besides git_ls_files (git_ls_tree, git_rev_parse, git_for_each_ref, git_path_history, git_rev_list and git_hash_object); the regression test names all six. The content was changed by hand through the lifecycle service, revision 2, and is not yet re-reviewed.
- Scope extended on 2026-10-27 at the user's request (after the first build of this Story): git_rev_parse and git_hash_object now fail on a cut capture. Neither tool checked for a cut capture before: git_rev_parse returned cut text as a success, and git_hash_object succeeded when the retained text was a valid object name followed by dropped output and otherwise failed with an object-name message (review round 3 corrected an earlier claim that it always failed). The ac6 above covers it. The content was changed by hand through the lifecycle service (revision 3) and is not yet re-reviewed; the BUILD already made for revisions 1 and 2 needs the extra change, a new gate run and a new code review.

<!-- insrc:review -->

## Review

### ⚠️ Review `WARN` — design.story (design.story)

**0 do not hold · 1 could not be verified · 7 hold** · template `design-spec` · model `cli-codex:gpt-6.1-sol` · reviewed 2026-10-27T12:05:17.531Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

| Check item | Premise | What was tried and what was missing | Action |
| --- | --- | --- | --- |
| coverage-of-intent | The design covers every upstream requirement and the authorized scope extension. | Located the LLD, build baseline, and adjacent s9 design, but no independent originating Story record or acceptance baseline. The LLD itself says 'The Story record has no acceptance criteria'. The analyzer request returned no bundle during this review. Code supports the proposed mechanism, but cannot establish the complete upstream intent. [files: .insrc/artifacts/LLD-733042d2e435fabd-s1.json, .insrc/build-start/733042d2e435fabd-s1.json] | Attach the originating userValue and scope-extension decision, and establish ac1–ac6 as the acceptance baseline. |
