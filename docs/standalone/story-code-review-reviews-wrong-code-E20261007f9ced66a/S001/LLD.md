<!-- insrc:artifact LLD-f9ced66a0e8835b8-s1 -->

# LLD: E20261008f9ced66a:S001

## Summary

**Epic:** `story-code-review-reviews-wrong-code`
**HLD base run:** `wf-1791444418716-bg9yxv`
**HLD effective hash:** `dde3c6427d60...`

A Story's code review now looks only at what the Story itself changed. Its changes are its own non-merge first-parent commits since its range base plus any edits made inside a merge commit; the reviewed diff carries only those changes, so a mid-build merge of upstream code no longer floods the review and no merged-in line reaches the reviewer. Build turns refuse to run while a merge is in progress, so every merge is committed before the next round of Story changes. The reviewer's model calls now start in the reviewed repository instead of the daemon's own checkout.

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

**Surface level:** internal

### 2.1 `storyChangeSet`

```typescript
export interface StoryChangeUnit { readonly kind: 'commit' | 'merge-edit'; readonly ref: string; readonly from: string; readonly to: string; readonly paths: readonly string[] }
export interface StoryChangeSet { readonly paths: readonly string[]; readonly units: readonly StoryChangeUnit[]; readonly sharedPaths: readonly string[]; readonly foldedPaths: readonly string[] }
export function storyChangeSet(repoPath: string, base: string): StoryChangeSet
```

**Parameters:**
- `repoPath: string` — The reviewed repository.
- `base: string` — The Story's range base (from resolveStoryRangeBase).

**Returns:** `StoryChangeSet` — The Story's own change units since the base, in first-parent order. A 'commit' unit is each commit from `git rev-list --first-parent --no-merges <base>..HEAD` (from = its parent, or the empty tree for a root commit; paths from `git diff-tree --no-commit-id --name-only -r --root`). A 'merge-edit' unit is each first-parent merge M whose committed tree differs from the clean auto-merge of its two parents: auto = the tree printed by `git merge-tree --write-tree M^1 M^2` (conflicted or not), from = auto, to = M, paths = `git diff --name-only auto M`. That difference is exactly what was edited inside the merge commit (Story edits folded in, or a conflict resolution). `paths` is the sorted union of all units' paths. `sharedPaths` are the paths that are also in some merge's merged-in side (`git diff --name-only M^1 auto`). `foldedPaths` are the paths of merge-edit units. An octopus merge (three or more parents), whose auto-merge merge-tree cannot compute, becomes ONE merge-edit unit over its whole change (from = M^1, to = M) with a warn log: the set over-includes rather than drops anything.

**Errors:**
- `NoBuildChangesError` when A git command fails (for example, the base cannot be resolved) — the same condition under which today's base..HEAD diff already fails.

**Preconditions:**
- repoPath is a git work tree.

**Postconditions:**
- No path appears that only a merge's merged-in side changed.
- Edits made inside a merge commit are never silently dropped: they are a merge-edit unit.
- Read-only: it never changes the repository (merge-tree --write-tree writes only objects, never refs, the index or the working tree).
- It applies no exclusions itself: its consumers keep excluding through git (git_diff exclude), so there is still one implementation of the glob semantics.

### 2.2 `mergeInProgress`

```typescript
export function mergeInProgress(repoPath: string): boolean
```

**Parameters:**
- `repoPath: string` — The repository the build turn runs in.

**Returns:** `boolean` — true when a merge has been started and not yet committed: `git rev-parse -q --verify MERGE_HEAD` succeeds, or the file at `git rev-parse --git-path SQUASH_MSG` exists (a `git merge --squash` not yet committed).

**Postconditions:**
- A git failure other than 'MERGE_HEAD not found' is logged and treated as false, so it never blocks a build on its own.

### 2.3 `changedFiles`

```typescript
export async function changedFiles(repoPath: string, opts?: ChangedFilesOptions): Promise<readonly string[]>
```

**Parameters:**
- `repoPath: string` — Unchanged.
- `opts: ChangedFilesOptions` _(optional)_ — Unchanged shape. With opts.base on a clean tree, the committed-range branch still runs its existing git_diff {from: base, exclude: opts.excludeGlobs} (so the ledger exclusions stay in git, as today), and the result is then intersected with storyChangeSet(repoPath, base).paths before the existing `keep` filter.

**Returns:** `Promise<readonly string[]>` — The working-tree set when the tree is dirty (unchanged); otherwise the Story's own paths since the base. This also narrows the BUILD record's body.changeLog, which collectBuildChangeLog derives through changedFiles with the range base (validate.ts, completion-record.ts): the ledger then lists the Story's own files, not files a merge brought in. That is intended.

**Errors:**
- `NoBuildChangesError` when git failure, as before, including a storyChangeSet failure.

**Postconditions:**
- Without opts.base the result is byte-for-byte what it was before.

### 2.4 `realDiffGroundingDeps`

```typescript
export function realDiffGroundingDeps(): DiffGroundingDeps
```

**Returns:** `DiffGroundingDeps` — Its rangeDiff(repoPath, base, excludeGlobs) now computes storyChangeSet(repoPath, base). Every git_diff call below carries the same exclude: excludeGlobs, so the ledger exclusions apply to each one exactly as they do today. Paths no merge touched get one net diff: git_diff {from: base, paths: <those>, exclude}. Each shared path gets only the Story's own hunks: for every unit that touched it, in order, git_diff {from: unit.from, to: unit.to, paths: [<shared paths of that unit>], exclude}. rangeDiff splits every call's body per file itself and returns the per-file text in DiffResult.hunksByFile: a path seen in several calls gets their sections appended in unit order, never overwritten, and a folded path's own entry starts with '[edited inside merge commit <short sha>]'. files has one entry per path; truncated is true if any call was truncated. When the change set is empty it returns an empty DiffResult without calling git_diff.

**Errors:**
- `DiffUnavailableError` when storyChangeSet or a git_diff call fails; the assembler's existing step-down applies.

**Postconditions:**
- Every file in the range result is a Story path, so the byte bound is spent only on Story files.
- No hunk line comes from a merge's merged-in side.

### 2.5 `gitDiffTool`

```typescript
input: { cwd: string; from?: string; to?: string; staged?: boolean; path?: string; paths?: readonly string[]; exclude?: readonly string[]; maxBytes?: number }
```

**Parameters:**
- `paths: readonly string[]` _(optional)_ — New: repo-root-relative positive pathspecs, emitted as ':(top,literal)<p>' after '--'. Combines with from/to and exclude. Mutually exclusive with path (both set is invalid-input).

**Returns:** `ToolResult<GitDiffData>` — Unchanged shape; the body and the file list cover only the given paths.

**Errors:**
- `invalid-input` when paths is not an array of non-empty strings, is empty, or is given together with path.

**Postconditions:**
- Without paths the git command line is exactly as before.

### 2.6 `buildDiffSymbols`

```typescript
function buildDiffSymbols(diff: DiffResult): ChangedSymbolSummary[]
```

**Parameters:**
- `diff: DiffResult` — The resolved diff; may now carry hunksByFile.

**Returns:** `ChangedSymbolSummary[]` — Unchanged shape. A file's hunk text is diff.hunksByFile.get(path) when hunksByFile is present, else splitDiffByFile(diff.body) as today.

**Postconditions:**
- Without hunksByFile the result is exactly as before.
- With hunksByFile no section is overwritten and every marker stays on its own file.

### 2.7 `CliProvider.completeStructured`

```typescript
completeStructured<T>(messages: LLMMessage[], schema: StructuredSchema, opts?: StructuredCompletionOpts): Promise<T>
```

**Parameters:**
- `opts.cwd: string | undefined` _(optional)_ — New: working directory for the claude/codex subprocess. Passed as the ExecOverride {cwd, timeoutMs: this.timeoutMs} to runClaude/runCodex.

**Returns:** `Promise<T>` — Unchanged.

**Postconditions:**
- When opts.cwd is undefined, runClaude/runCodex are called with no override, exactly as before.

### 2.8 `CliProvider.complete`

```typescript
complete(messages: LLMMessage[], opts?: CompletionOpts): Promise<LLMResponse>
```

**Parameters:**
- `opts.cwd: string | undefined` _(optional)_ — New: same as for completeStructured.

**Returns:** `Promise<LLMResponse>` — Unchanged.

**Postconditions:**
- When opts.cwd is undefined, behaviour is unchanged.

### 2.9 `judgeAdherence / judgeConventions / judgeCoverage / judgeFunctionalCoverage / judgeQuality`

```typescript
unchanged exported signatures
```

**Returns:** `Promise<DimensionResult>` — Unchanged; each judge's completeStructured call now passes { cwd: subject.repoPath }.

**Postconditions:**
- The reviewer's subprocess starts in the reviewed repository.

### 2.10 `handleImplement / handleValidate`

```typescript
unchanged
```

**Returns:** `Promise<BuildStepOutput>` — When mergeInProgress(repoPath) is true, returns { next: 'error', error: { code: 'merge-in-progress', message: <commit the merge on its own, then retry>, retryable: true } } before any other work.

**Errors:**
- `merge-in-progress` when A merge has been started and not committed.

**Postconditions:**
- No implement or validate turn runs on top of an uncommitted merge.

### 2.11 `implement prompts (implement-task.md, renderStandaloneImplementPrompt)`

```typescript
unchanged render signatures
```

**Returns:** `string` — Each implement prompt gains one rule: to bring upstream changes in during the Story, merge with `git merge --no-ff` (or `git pull --no-rebase --no-ff`), commit the merge on its own before any further Story change, and never squash-merge or fast-forward upstream into the Story.

**Postconditions:**
- The implementer is told the one integration form the review can separate from Story work.

## 3. Data model changes

### 3.1 `CompletionOpts` — field-add

cwd?: string | undefined — working directory for subprocess-backed providers; OllamaProvider ignores it.

**Call sites:**
- `src/shared/types.ts`
- `src/agent/providers/cli-provider.ts`

### 3.2 `StructuredCompletionOpts` — field-add

readonly cwd?: string | undefined — same meaning.

**Call sites:**
- `src/shared/types.ts`
- `src/agent/providers/cli-provider.ts`
- `src/workflow/code-review/dimensions/adherence.ts`
- `src/workflow/code-review/dimensions/conventions.ts`
- `src/workflow/code-review/dimensions/coverage.ts`
- `src/workflow/code-review/dimensions/functional-coverage.ts`
- `src/workflow/code-review/dimensions/quality.ts`

### 3.3 `git_diff input` — field-add

paths?: readonly string[] — positive repo-root pathspecs.

**Call sites:**
- `src/daemon/tools/builtins/git/diff.ts`
- `src/workflow/code-review/grounding.ts`

### 3.4 `DiffResult` — field-add

hunksByFile?: ReadonlyMap<string, string> — per-file hunk text already split by the producer; buildDiffSymbols prefers it over splitting body.

**Call sites:**
- `src/workflow/code-review/grounding.ts`

## 4. Error paths

**Error cases**

- **The range base cannot be resolved (rewritten history, shallow clone).** (recoverable)
  - Detection: git rev-list in storyChangeSet exits non-zero; the helper throws NoBuildChangesError (changedFiles) or DiffUnavailableError (rangeDiff).
  - Response: The callers' existing step-down runs: resolveCodeReviewSubject and assembleDiffCodeReviewGrounding fall back to their plainer attempts, as they do today for a bad base.
  - User impact: Same as today for a bad base: the subject steps down to the no-base derivation, which on a clean tree is empty, while the grounding steps down to the last commit. This Story does not change that path; the warn log names the failed attempt.
- **A merge is in progress when a build turn is called.** (recoverable)
  - Detection: mergeInProgress(repoPath): `git rev-parse -q --verify MERGE_HEAD` exits 0.
  - Response: handleImplement / handleValidate return error 'merge-in-progress' (retryable) before rendering a prompt, running checks or writing any record.
  - User impact: The user commits the merge on its own, then retries the turn.
- **git itself cannot be run while checking for a merge (not a repo, git missing).** (recoverable)
  - Detection: execFileSync throws with an error other than exit status 1.
  - Response: Log a warning and return false; the turn's own later git use surfaces the real failure.
  - User impact: None from the gate; it never blocks a build by itself.
- **git_diff receives paths together with path, or an empty or non-string paths array.** (terminal)
  - Detection: Input validation in gitDiffTool.execute, alongside the existing exclude check.
  - Response: Return ok:false with '[git:diff] invalid-input: ...'.
  - User impact: A programming error is reported instead of silently diffing the whole repository.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| The Story's range holds no non-merge first-parent commit (only a merge, or nothing). | storyChangeSet has no units; changedFiles returns []; rangeDiff returns an empty DiffResult without calling git_diff. The review sees an empty change set rather than the merge's files. |
| A Story commit deleted a file. | The path is in the change set and shows as deleted in the range diff. |
| A file was changed both by a Story commit and by the merge. | The file is in the set and in sharedPaths; its hunk text is the Story's own per-unit diffs for that file, with no line from the merge's merged-in side. |
| A merged-in upstream file that no Story commit touched. | Absent from both the changed set and the reviewed hunks. |
| The working tree is dirty. | Unchanged: the working-tree set is used and the base is not consulted. |
| The range base is the repository's root commit's parent (empty tree) or the first Story commit is a root commit. | diff-tree is run with --root so a root commit's files are listed. |
| A path containing glob characters or spaces. | Passed as a ':(top,literal)' pathspec, so it matches only itself. |
| completeStructured / complete called without opts.cwd (every non-review caller). | runClaude / runCodex are called with no ExecOverride, exactly as before. |
| The Story branch was merged into main by the user and HEAD is on main after a fast-forward. | First-parent history still runs through the Story's commits, so they are listed. |
| Story edits staged into a merge commit (or amended into it) after the merge. | git merge-tree's clean auto-merge differs from the merge commit on those files, so they form a merge-edit unit: they are in the change set, reviewed with the hunks auto..M, and marked '[edited inside merge commit <sha>]'. |
| A merge with conflicts that were resolved by hand. | The resolution differs from merge-tree's conflicted auto-merge, so the resolved files form a merge-edit unit and the resolution is reviewed. |
| collectBuildChangeLog with a range base after a mid-build merge. | The BUILD record's changeLog lists only the Story's own paths. |
| KNOWN LIMIT — upstream brought in by a fast-forward (git pull / git merge with no merge commit) during the Story. | The upstream commits are first-parent non-merge commits and are counted as Story work; nothing in git marks them as foreign. The implement prompts tell the implementer to merge with --no-ff instead. A test pins this behaviour so a later fix is a visible change. |
| KNOWN LIMIT — upstream squash-merged (git merge --squash) and committed during the Story. | While the squash is uncommitted (SQUASH_MSG present) build turns refuse with merge-in-progress. Once committed, the squash commit is an ordinary commit and is counted as Story work. The implement prompts forbid squash-merging upstream. A test pins this behaviour. |
| Two Story commits touch the same shared path, and a folded path is not the first file in a diff body. | The shared path's hunk text holds both commits' sections in order; the folded path's marker heads that path's own text. |
| The range holds an octopus merge (three or more parents). | No throw: the merge's whole change (M^1..M) is one merge-edit unit, marked, with a warn log. The review covers more than the Story rather than nothing. |
| A Story commit also committed ledger files (.insrc/artifacts/*.json, docs/standalone/**) and the range holds a merge. | They are in storyChangeSet.paths but the git_diff exclude drops them, so they stay out of the review subject's changedFiles and the grounding (ISSUE-5f7a7cb9 preserved). The BUILD changeLog is unchanged in this respect: its writers pass only exact own-record paths, as today. |

**Invariants to preserve**

- The Story's range base is fixed by the first build-start stamp and never moves forward. [[c2]]
- resolveStoryRangeBase keeps returning the stamp's rangeBase first. [[c1]]
- The grounding still marks a truncated diff and steps down to plainer attempts on DiffUnavailableError. [[c3]]
- CliProvider callers that pass no cwd keep the inherited working directory. [[c4]]
- Ledger files stay out of the code-review change set and grounding; that exclusion is done by git through git_diff's exclude (LEDGER_EXCLUDE_GLOBS). The BUILD changeLog's exact-path exclusions are kept as they are. [[c5]]

## 5. Test strategy

**Test framework:** `node:test via `npx tsx --test` (node:assert/strict); git fixtures built in a mkdtemp repo with execFileSync('git', ...)`

**Test levels**

- **unit** — The Story's own path set and the merge check, against real temporary git repositories.
  - Subjects: `story-commits.test.ts: 'storyChangeSet lists the Story's non-merge first-parent commits and leaves out files only a merge brought in'`, `story-commits.test.ts: 'storyChangeSet records Story edits folded into a merge commit as a merge-edit unit'`, `story-commits.test.ts: 'storyChangeSet records a hand-resolved conflict as a merge-edit unit'`, `story-commits.test.ts: 'storyChangeSet includes a file the Story deleted and a root commit's files'`, `story-commits.test.ts: 'storyChangeSet is empty when the range holds only a clean merge'`, `story-commits.test.ts: 'storyChangeSet throws NoBuildChangesError for an unresolvable base'`, `story-commits.test.ts: 'mergeInProgress is true while MERGE_HEAD exists and false after the merge is committed'`, `story-commits.test.ts: 'mergeInProgress is true while an uncommitted squash merge leaves SQUASH_MSG'`, `story-commits.test.ts: 'known limit: upstream commits fast-forwarded or squash-merged into the Story are counted as Story work'`, `story-commits.test.ts: 'an octopus merge becomes one merge-edit unit over its whole change instead of a failure'`
  - Fixtures: `A temp repo with a base commit, a side branch with upstream commits, Story commits on main before and after a merge of the side branch; variants with a file both sides changed, with edits folded into the merge commit, with a resolved conflict, and with an octopus merge.`
- **unit** — The change-set and hunk consumers use the Story path set; git_diff accepts paths.
  - Subjects: `changed-files.test.ts: 'a clean tree with a base reports only the Story's own files, not files a merge brought in'`, `changed-files.test.ts: 'without a base the derivation is unchanged'`, `changed-files.test.ts: 'collectBuildChangeLog with a base lists only the Story's own files after a mid-build merge'`, `diff-grounding.test.ts: 'the range diff carries full hunks for the Story files and none for merged-in files'`, `diff-grounding.test.ts: 'a file changed by both a Story commit and the merge carries only the Story's own hunks'`, `diff-grounding.test.ts: 'edits folded into a merge commit are reviewed and marked'`, `diff-grounding.test.ts: 'a range with no Story change gives an empty grounding without calling git_diff'`, `git-diff-paths.test.ts: 'git_diff limits the body and file list to the given paths, literally'`, `git-diff-paths.test.ts: 'git_diff rejects paths together with path and an empty paths array'`, `diff-grounding.test.ts: 'a shared path touched by two Story commits keeps both commits' hunks and a folded marker stays on its own file when it is not first'`, `diff-grounding.test.ts: 'without hunksByFile buildDiffSymbols splits the body as before'`, `changed-files.test.ts: 'a committed ledger file stays out of the range result after a mid-build merge'`, `diff-grounding.test.ts: 'the range diff applies the exclusions to every per-unit call'`
- **unit** — The reviewer's subprocess starts in the reviewed repository; other callers are unchanged.
  - Subjects: `cli-subprocess.test.ts: 'completeStructured and complete run the CLI in opts.cwd when it is given'`, `cli-subprocess.test.ts: 'completeStructured without opts.cwd runs the CLI in the inherited working directory'`, `code-review-cwd.test.ts: 'every code-review dimension judge passes the reviewed repoPath as cwd'`
- **unit** — Build turns refuse to run on top of an uncommitted merge.
  - Subjects: `build-step.test.ts: 'implement and validate return merge-in-progress while a merge is uncommitted'`, `render.test.ts: 'the implement prompts tell the implementer to merge upstream with --no-ff and commit the merge on its own'`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `story-commits.test.ts: 'storyChangeSet lists the Story's non-merge first-parent commits and leaves out files only a merge brought in'`, `changed-files.test.ts: 'a clean tree with a base reports only the Story's own files, not files a merge brought in'`, `diff-grounding.test.ts: 'the range diff carries full hunks for the Story files and none for merged-in files'`, `diff-grounding.test.ts: 'a file changed by both a Story commit and the merge carries only the Story's own hunks'`, `diff-grounding.test.ts: 'a shared path touched by two Story commits keeps both commits' hunks and a folded marker stays on its own file when it is not first'` |
| `ac2` | `story-commits.test.ts: 'mergeInProgress is true while MERGE_HEAD exists and false after the merge is committed'`, `build-step.test.ts: 'implement and validate return merge-in-progress while a merge is uncommitted'`, `story-commits.test.ts: 'storyChangeSet records Story edits folded into a merge commit as a merge-edit unit'`, `diff-grounding.test.ts: 'edits folded into a merge commit are reviewed and marked'`, `story-commits.test.ts: 'mergeInProgress is true while an uncommitted squash merge leaves SQUASH_MSG'`, `render.test.ts: 'the implement prompts tell the implementer to merge upstream with --no-ff and commit the merge on its own'`, `story-commits.test.ts: 'known limit: upstream commits fast-forwarded or squash-merged into the Story are counted as Story work'` |
| `ac3` | `cli-subprocess.test.ts: 'completeStructured and complete run the CLI in opts.cwd when it is given'`, `code-review-cwd.test.ts: 'every code-review dimension judge passes the reviewed repoPath as cwd'` |
| `ac4` | `changed-files.test.ts: 'without a base the derivation is unchanged'`, `cli-subprocess.test.ts: 'completeStructured without opts.cwd runs the CLI in the inherited working directory'`, `gates.test.ts: 'CR-3: re-approving after the work has landed does NOT move rangeBase forward — the FIRST stamp wins'`, `changed-files.test.ts: 'collectBuildChangeLog with a base lists only the Story's own files after a mid-build merge'`, `diff-grounding.test.ts: 'without hunksByFile buildDiffSymbols splits the body as before'`, `changed-files.test.ts: 'a committed ledger file stays out of the range result after a mid-build merge'` |

## 6. Migration

**State before:** On a clean tree, the review change set and hunks are base..HEAD from the first-stamp range base, so files a mid-build merge brought in are reviewed as Story work (changed-files.ts, grounding.ts rangeDiff). Build turns run even with an uncommitted merge. The reviewer's claude/codex subprocess inherits the daemon's working directory (cli-provider.ts complete / completeStructuredOnce call runClaude/runCodex without an ExecOverride).

**State after:** On a clean tree, the change set and hunks cover only the Story's own changes since the base: its non-merge first-parent commits plus edits made inside merge commits; files a merge brought in are absent and shared files carry only the Story's hunks. The BUILD record's changeLog lists the same Story files. Build turns return merge-in-progress while MERGE_HEAD exists. The code-review judges' CLI subprocess starts in the reviewed repository.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the optional cwd field to CompletionOpts and StructuredCompletionOpts; CliProvider passes it to runClaude/runCodex when set. — ↩ rollbackable
2. Pass { cwd: subject.repoPath } from the five code-review dimension judges. — ↩ rollbackable
3. Add the paths input to git_diff and the storyChangeSet / mergeInProgress helpers. — ↩ rollbackable
4. Limit changedFiles' committed-range branch and the grounding's rangeDiff to storyChangeSet (shared paths through per-unit diffs). — ↩ rollbackable
5. Add DiffResult.hunksByFile and make buildDiffSymbols prefer it; add the --no-ff merge rule to the implement prompts. — ↩ rollbackable
6. Gate handleImplement / handleValidate on mergeInProgress. — ↩ rollbackable
7. Update the installed daemon (daemon.update) so reviews run the new code; no stored data changes. — ↩ rollbackable

**Backward compat:** All new fields are optional and absent behaviour is unchanged: callers without opts.cwd keep the inherited working directory, git_diff without paths builds the same command line, changedFiles without a base is unchanged. Stored build-start stamps, BUILD and CR records keep their shape. Behavioural changes, all intended: (1) the code-review change set and hunks after a clean tree narrow to the Story's own changes; (2) the BUILD record's body.changeLog, derived through changedFiles with the range base by validate and by completion-record, narrows the same way; (3) build turns refuse with merge-in-progress while a merge is uncommitted. (4) The implement prompts carry the merge rule. Known limits, stated and pinned by tests: upstream brought in by fast-forward or by a committed squash merge is indistinguishable from Story commits and is reviewed as Story work.

## 7. Alternatives considered

### 7.1 a1: Story change units + path-limited diffs — **CHOSEN**

Derive the Story's own change units (its non-merge first-parent commits plus edits made inside merge commits) and review only their hunks.

A new helper storyChangeSet(repoPath, base) in src/workflow/runners/build/story-commits.ts lists the Story's units: each commit from `git rev-list --first-parent --no-merges base..HEAD`, and each first-parent merge whose tree differs from `git merge-tree --write-tree M^1 M^2` (edits made inside the merge). changedFiles' committed-range branch reports the units' paths. git_diff gains an optional `paths` input. The grounding's rangeDiff reviews paths no merge touched with one net base..HEAD diff limited to them, and paths a merge also touched through per-unit diffs, so no merged-in line reaches the reviewer. Build turns refuse with 'merge-in-progress' while MERGE_HEAD exists. CompletionOpts and StructuredCompletionOpts gain `cwd?`; CliProvider passes it to runClaude/runCodex; the five dimension judges pass {cwd: subject.repoPath}.

### 7.2 a2: Per-commit diffs of the Story's commits

Review the concatenated `git show` of each non-merge first-parent Story commit instead of one net range diff.

Replace rangeDiff with a loop over `git rev-list --first-parent --no-merges base..HEAD`, collecting `git show <c>` per commit and merging per file. The change set is the union of the commits' files. The merge gate and cwd plumbing are as in a1.

**Rejected because:** Per-commit diffs for EVERY file fragment files no merge touched, and it would drop edits made inside a merge commit; a1 uses per-unit diffs only where a merge also touched the file.

### 7.3 a3: Move the range base past each merge

When a merge commit is found in the range, re-stamp the base to the merge commit.

resolveStoryRangeBase returns the latest first-parent merge commit in base..HEAD when one exists, so the range starts after the merge.

**Rejected because:** It loses Story work and breaks the CR-3 guarantee.

## 8. References

- **[[c1]]** `code` `src/workflow/runners/build/range-base.ts` — "const start = readBuildStart(repoPath, epicHash, storyId);
	if (start.kind === 'valid') return start.stamp.rangeBase;"
- **[[c2]]** `code` `src/workflow/__tests__/gates.test.ts` — "test('CR-3: re-approving after the work has landed does NOT move rangeBase forward — the FIRST stamp wins'"
- **[[c3]]** `code` `src/workflow/code-review/grounding.ts` — "const truncNote = diff.truncated ? '\n[diff truncated — reviewed over a bounded slice]' : '';"
- **[[c4]]** `code` `src/agent/providers/cli-provider.ts` — "const { envelope } = await this.runClaude(args, prompt);"
- **[[c5]]** `code` `src/workflow/runners/build/changed-files.ts` — "await collectDiff(repoPath, { from: opts.base, ...globs }, ranged);"
- **[[c6]]** `code` `src/daemon/tools/builtins/git/diff.ts` — "return ['--', o.path ? o.path : ':(top)', ...exclude.map(g => `:(top,exclude,glob)${g}`)];"
- **[[c7]]** `code` `src/workflow/code-review/dimensions/adherence.ts` — "provider.completeStructured<unknown>(buildAdherencePrompt(subject, grounding, note), ADHERENCE_FINDINGS_SCHEMA);"
- **[[c8]]** `prior-artifact` `ISSUE-f9ced66a0e8835b8`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 do not hold · 0 could not be verified · 8 hold** · template `design-issue` · model `cli-claude:opus` · reviewed 2026-10-08T07:52:31.699Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

_None._
