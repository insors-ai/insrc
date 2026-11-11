<!-- insrc:artifact LLD-66d4d41d99f805af-s1 -->

# LLD: STORY-66d4d41d99f805af-s1 — Scope code-review projection to the packet instead of walking every interleaved commit

## Summary

**Epic:** `code-review-refuses-correction-packet-because`
**HLD base run:** `wf-1794388416311-k9tkvg`
**HLD effective hash:** `d15c0d69afa2...`

Code-review admission proves that each selected change still exists at the pinned revision by checking that no unselected commit deleted or recreated the selected file. Today it does this by reading the file at every commit between the selected commit and the pin, so a busy branch with unrelated merges exhausts the projection budget. This Story asks git once per selected file for the commits that actually changed that file (full history, merges included) and checks only those, so cost follows changes to the reviewed files rather than unrelated work. Every existing outcome, limit and stored identity stays the same.

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

### 2.1 `git_path_history`

```typescript
git_path_history(input: { cwd?: string; path?: string; rev?: string; diffFilter?: 'A' | 'D' | 'M' | 'R'; firstParent?: boolean; reverse?: boolean; limit?: number; pickaxe?: string; fullHistory?: boolean }): ToolResult<GitPathHistoryData>
```

**Parameters:**
- `fullHistory: boolean` _(optional)_ — New. When true, pass --full-history so git does not simplify history: every commit whose path differs from at least one parent is listed, merges included, and side branches are followed even where a merge matches one parent. Absent or false keeps today's behaviour exactly.
- `rev: string` _(optional)_ — Existing. A ref or a range such as '<from>..<to>'.
- `path: string` _(optional)_ — Existing. Matched literally from the repository top (:(top,literal)).

**Returns:** `GitPathHistoryData` — Unchanged shape: { commits: [{ sha, committerTime, subject }] }.

**Errors:**
- `git failure (existing readGit / parseOutput failure kinds)` when git log exits non-zero, cannot spawn or times out, or its output is cut at the shell byte limit (parseOutput refuses a cut list); unchanged.

**Preconditions:**
- rev passes assertSafeArg('ref'); path passes assertSafeArg('path') (unchanged).

**Postconditions:**
- With fullHistory absent, argv is identical to today's, so existing callers (src/workflow/git-calls.ts) are unaffected.

### 2.2 `ReviewSources`

```typescript
interface ReviewSources { commit(oid: string, field?: string): Promise<readonly string[]>; isAncestor(origin: string, revision: string): Promise<boolean>; file(commit: string, path: string): Promise<PinnedBlob | null>; changedRanges(commit: string, parent: string | null, paths: readonly string[]): Promise<readonly ChangedRange[]>; pathChanges(from: string, to: string, path: string): Promise<readonly string[]> }
```

**Parameters:**
- `from: string` — Full commit OID where the lineage leg starts (excluded from the result).
- `to: string` — Full commit OID where the leg ends (included when it qualifies).
- `path: string` — Repository-relative path, matched literally.

**Returns:** `readonly string[]` — New required method pathChanges: the full OIDs of every commit reachable from `to` and not from `from` whose entry at `path` differs from at least one of its parents (git log --full-history from..to -- :(top,literal)path). Any commit not listed has the same entry at `path` as each of its parents. Order is not significant.

**Errors:**
- `TaskReviewInputError field=source` when The git listing fails (including output cut at the byte limit), or a listed line is not a full hexadecimal commit OID of the repository's hash length.

**Preconditions:**
- from and to are full commit OIDs already verified by the caller.

**Postconditions:**
- No file contents are read.

### 2.3 `RegistryReviewSources`

```typescript
class RegistryReviewSources implements ReviewSources { pathChanges(from: string, to: string, path: string): Promise<readonly string[]> }
```

**Returns:** `readonly string[]` — Implements pathChanges with callTool(gitPathHistoryTool, { cwd: this.deps.repoPath, rev: `${from}..${to}`, path, fullHistory: true }, this.deps), passing cwd explicitly exactly like its other methods (never relying on process.cwd()), and returns data.commits[].sha after validating each as a full OID.

**Errors:**
- `TaskReviewInputError field=source` when Tool call unsuccessful (git failure, timeout or cut output) or an invalid sha in the result (same field as the existing commit/file source errors).

**Postconditions:**
- Uses no subprocess path other than the typed tool, so the daemon's tool authority and the review worker's spawn bridge apply unchanged.

### 2.4 `boundedProjectionSources`

```typescript
boundedProjectionSources(source: ReviewSources, budget: ProjectionBudget): ReviewSources
```

**Returns:** `ReviewSources` — The wrapper gains pathChanges: cached per JSON key [from, to, path]; an uncached call charges budget.read() once, like the other wrapped methods. No change to the other methods or to LIMITS.

**Errors:**
- `TaskReviewInputError field=projection_limit` when Existing read limit exceeded (unchanged message 'Projection object/diff read limit').

**Postconditions:**
- Reads are still awaited serially.

### 2.5 `pathContinuity`

```typescript
pathContinuity(path: string, from: string, to: string, origins: readonly SelectedChange[], sources: ReviewSources): Promise<void>
```

**Returns:** `Promise<void>` — Same outcome as today. New procedure: if from === to return. For each commit c in sources.pathChanges(from, to, path) with sources.isAncestor(from, c) true, and for each parent p of c (sources.commit(c)) with p === from or sources.isAncestor(from, p), read sources.file(p, path) and sources.file(c, path) and require equal existence unless c is a selected origin for this path (o.commit === c and o.path or o.previousPath equals path); otherwise scope_conflict.

**Errors:**
- `TaskReviewInputError field=scope_conflict` when Unchanged message 'Unselected path disappearance or recreation interrupts lineage' on an existence flip at an unselected commit.

**Preconditions:**
- Called by finalPath exactly as today.

**Postconditions:**
- The edge set examined equals today's edge set restricted to edges where the path differs, which are the only edges where existence can differ; the comment above the function is updated to say why the full-history listing replaces the walk.

## 3. Data model changes

### 3.1 `ReviewSources` — field-add

Adds required method pathChanges(from, to, path). Every implementer must provide it: RegistryReviewSources (production) and the test object literals that implement the interface; literals built from a fixture's sources bind it the same way they bind the other four methods, and stubs that throw when called add a throwing pathChanges.

**Call sites:**
- `src/workflow/code-review/task-review/sources.ts:44-98`
- `src/workflow/code-review/task-review/projection.ts:27-37`
- `src/workflow/code-review/task-review/__tests__/contracts.test.ts:69`
- `src/workflow/code-review/task-review/__tests__/selected-code.test.ts:24`
- `src/workflow/code-review/task-review/__tests__/admission-checkpoint.test.ts:43`
- `src/workflow/code-review/task-review/__tests__/projection-intervals.test.ts:75`
- `src/workflow/code-review/task-review/__tests__/projection.test.ts:141`
- `src/workflow/code-review/task-review/__tests__/coordinator.test.ts:31`
- `src/workflow/code-review/task-review/__tests__/history.test.ts:128`
- `src/workflow/code-review/task-review/__tests__/admission.test.ts:77`
- `src/workflow/code-review/task-review/__tests__/ownership.test.ts:59`

## 4. Error paths

**Error cases**

- **The full-history listing fails: git error, unreadable repository, timeout, or output cut at the shell byte limit.** (recoverable)
  - Detection: RegistryReviewSources.pathChanges sees callTool(gitPathHistoryTool, ...) return success false; git_path_history already fails on a non-zero exit, spawn error or timeout (readGit) and refuses stdout cut at the byte limit (parseOutput), so a partial list never reaches pathChanges.
  - Response: Throw TaskReviewInputError with field 'source' and the tool's message, the same field the existing commit/file reads use; it is never relabeled as projection_limit or as a lineage conflict.
  - User impact: Review start is refused with a source error naming the git failure; nothing is saved.
- **The listing returns a value that is not a full commit OID.** (terminal)
  - Detection: pathChanges checks every data.commits[].sha against /^[0-9a-f]{40}$|^[0-9a-f]{64}$/ and the length of the from/to OIDs.
  - Response: Throw TaskReviewInputError field 'source' ('Unexpected Git path history entry'); the listing is not used.
  - User impact: Refused start; no partial projection.
- **A listed commit or its parent cannot be read.** (recoverable)
  - Detection: Existing sources.commit / sources.file errors.
  - Response: Unchanged existing source errors.
  - User impact: Unchanged.
- **An unselected commit on any branch between origin and pin deletes or recreates the selected path.** (terminal)
  - Detection: That commit's entry differs from a parent, so the full-history listing includes it; the existence comparison on that edge differs.
  - Response: scope_conflict 'Unselected path disappearance or recreation interrupts lineage' (unchanged).
  - User impact: Unchanged outcome.
- **Read limit is reached because many commits really changed the selected files.** (terminal)
  - Detection: Existing ProjectionBudget.read / decode checks.
  - Response: Unchanged projection_limit errors; limits are not raised.
  - User impact: Refused start, now only when the reviewed files themselves changed that often.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| from equals to (selected commit is the pin). | No listing call; returns immediately, as today. |
| A merge whose path matches one parent and differs from the other, where the differing parent descends from the origin. | Listed by --full-history; the differing edge is compared; a flip fails with scope_conflict. |
| A merge whose path matches every parent. | Not listed; no reads; today's walk would also find equal existence on every edge, so the outcome is the same. |
| A listed commit on a side branch that forked before the origin (not a descendant of the origin). | Skipped by isAncestor(from, c), exactly as today's walk never reaches it. |
| A listed merge with one parent outside the origin's descendants. | That edge is skipped, as today. |
| A selected origin commit for this path that adds or deletes it (selected move boundaries). | Exempt exactly as today (origins.some(o => o.commit === c && (o.path === path \|\| o.previousPath === path))). |
| A path with characters git treats as glob or magic. | Matched literally through git_path_history's existing :(top,literal) pathspec. |
| Root commit in the range. | No parents, so nothing to compare, as today. |
| git_path_history called by existing callers without fullHistory. | Identical argv and output to today. |

**Invariants to preserve**

- Every descendant edge between origin and pin where the selected path's existence differs is examined, merges and side branches included; simplified or first-parent history must not be used (the comment above pathContinuity). [[c2]]
- Projection limits stay 10000 reads, 100000 fragments and 64 MiB decoded bytes, and every uncached source call is charged and awaited serially. [[c2]]
- The only production ReviewSources implementer reaches git through typed tools via callTool, passing cwd: this.deps.repoPath. [[c1]]
- projectReviewScope's result and projectionIdentity depend only on revision, review set, entries and dispositions, so saved attempts keep the same identity; admission refuses a saved attempt whose re-prepared identity differs. [[c1]]
- Existing git_path_history callers see no behaviour change, and a cut or failed git listing is refused rather than returned partially. [[c3]]

## 5. Test strategy

**Test framework:** `node:test with node:assert/strict, run through npx tsx --test (Node 22); real temporary git repositories as fixtures, as in the existing projection.test.ts`

**Test levels**

- **unit** — Pin git_path_history's new fullHistory flag against real git semantics and keep its default unchanged.
  - Subjects: `git_path_history`
  - Fixtures: `temporary repo: base commit with f; side branch deletes then recreates f, merged; second side branch deletes f, merged with -s ours`
- **integration** — Exercise pathContinuity through projectReviewScope with RegistryReviewSources on real repositories. The ac1 test measures cost directly: it builds two fixtures that are identical except for the number of interleaved commits and merges after the selected change that touch only other files (N = 4 and N = 40), runs projectReviewScope on each with RegistryReviewSources wrapped by a counting ReviewSources, and records (a) the number of file() calls whose path is the selected path, (b) the sum of bytes.byteLength those calls return (the decoded bytes), and (c) the number of pathChanges calls. It asserts (a), (b) and (c) are equal between N = 4 and N = 40, that (c) equals the number of lineage legs (one per selected origin with no selected move), and, as a control showing the measurement can detect growth, that the number of commits between origin and pin differs between the fixtures by at least 36. The ac2 tests assert scope_conflict with the existing message. The ac4 identity test builds a deterministic repository (fixed GIT_AUTHOR_NAME/EMAIL/DATE and GIT_COMMITTER_NAME/EMAIL/DATE, so every commit OID is stable) with a selected change, interleaved commits and a merge that leave the selected path untouched, and a selected rename; the projectionIdentity of its projection is computed with the pre-change code before pathContinuity is switched, written into the test as a constant, and asserted equal after the switch, so a change to the projection outcome fails the test.
  - Subjects: `pathContinuity`, `boundedProjectionSources`, `RegistryReviewSources`, `ReviewSources`, `projectReviewScope`
  - Fixtures: `two temporary repos built by one helper parameterised by N: a selected change to source.js, then N commits and two merges of a side branch that touch only other files (N = 4 and N = 40)`, `temporary repo where a side branch forked after the origin deletes the selected file and is merged back keeping it`, `temporary repo where a side branch deletes and recreates the selected file and is merged`, `deterministic temporary repo with fixed author and committer identity and dates, used for the pinned-identity test`
- **smoke** — Replay Story eedc4519199b24b4/s1's correction packet (pin 92491bba9) against this repository: first through prepareReviewPacket with RegistryReviewSources and the default ProjectionBudget, then as a real start of attempt 4 of review board-common-model-s1 on the rebuilt daemon. Recorded at validate as reported { result, evidence }; the evidence is the replay output (projection entry count, reads and decoded bytes used, or the error) and the start result showing admission re-prepared saved attempts 1-3 to their stored final-scope identities (admission refuses a mismatch), because it depends on this repository's real history and saved checkpoint.
  - Subjects: `projectReviewScope`, `prepareReviewPacket`
  - Fixtures: `the attempt-4 packet saved from the refused start`, `.insrc/tmp/code-review/board-common-model-s1.json with its 3 saved attempts`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `src/workflow/code-review/task-review/__tests__/projection-lineage.test.ts: lineage reads do not grow with interleaved commits that leave the selected path untouched`, `src/daemon/tools/builtins/git/__tests__/git-path-history-full.test.ts: fullHistory lists a side-branch deletion and the merge that default history omits` |
| `ac2` | `src/workflow/code-review/task-review/__tests__/projection-lineage.test.ts: a side-branch deletion merged back with the file kept still interrupts lineage`, `src/workflow/code-review/task-review/__tests__/projection-lineage.test.ts: a side-branch deletion and recreation merged back still interrupts lineage`, `src/workflow/code-review/task-review/__tests__/projection.test.ts: identical final blobs cannot hide an unselected rename-away and recreation`, `src/workflow/code-review/task-review/__tests__/projection.test.ts: selected rename chains compare exact blobs independently of rename similarity and reject unselected moves` |
| `ac3` | `src/workflow/code-review/task-review/__tests__/projection-lineage.test.ts: a path history failure is a source error, not a projection limit or lineage conflict`, `src/workflow/code-review/task-review/__tests__/projection-lineage.test.ts: the read limit still refuses with projection_limit when the selected file itself changed too often`, `src/workflow/code-review/task-review/__tests__/projection.test.ts: production projection budgets accept their exact ceilings and refuse the next unit`, `src/daemon/tools/builtins/git/__tests__/git-path-history-full.test.ts: without fullHistory the listing is unchanged` |
| `ac4` | `src/workflow/code-review/task-review/__tests__/projection-lineage.test.ts: projection identity matches the identity pinned from the code before the change`, `smoke (reported): starting attempt 4 of board-common-model-s1 re-prepares saved attempts 1-3 to their stored final-scope identities`, `src/workflow/code-review/task-review/__tests__/history.test.ts: existing saved-attempt tests pass unchanged` |
| `ac5` | `smoke (reported at validate as { result, evidence }): the eedc4519199b24b4/s1 correction packet at pin 92491bba9 prepares through prepareReviewPacket with RegistryReviewSources and the default ProjectionBudget without projection_limit` |

## 6. Migration

**State before:** pathContinuity (src/workflow/code-review/task-review/projection.ts:51-64) walks every commit between a selected origin and the pin and reads the selected file at each commit and parent; reads are charged to ProjectionBudget (src/workflow/code-review/task-review/projection.ts:9), so a packet on a busy branch is refused with projection_limit (s1 bundles 1 and 2). git_path_history has no full-history option (s1 bundle 3).

**State after:** pathContinuity examines only commits from a full-history listing of the selected path (ReviewSources.pathChanges via git_path_history fullHistory), with identical outcomes, limits and projection identities. No stored data changes.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Before changing pathContinuity, compute the projectionIdentity of the deterministic fixture with the current code and pin it in the new test. — ↩ rollbackable
2. Add the optional fullHistory flag to git_path_history; existing callers pass nothing and get the same argv. — ↩ rollbackable
3. Add pathChanges to ReviewSources, implement it in RegistryReviewSources (with cwd: this.deps.repoPath) and wrap it in boundedProjectionSources; bind it in every test literal. — ↩ rollbackable
4. Switch pathContinuity to the listing-driven edge set and update its comment; the pinned identity must still match. — ↩ rollbackable
5. Deploy by daemon update/restart; saved review attempts need no rewrite because their projection identity does not depend on the walk, which the real attempt-4 start re-checks for board-common-model-s1. — ↩ rollbackable

**Backward compat:** git_path_history: additive optional input; default behaviour unchanged. ReviewSources is internal to the daemon (no IPC or plugin exposure); its only production implementer is updated in the same change. Stored review checkpoints and history are not rewritten and re-prepare to the same identity.

## 7. Alternatives considered

### 7.1 a1: Full-history touch list through git_path_history — **CHOSEN**

One full-history, path-limited listing per lineage leg names the only commits whose edges can change the path's existence; only those edges are read.

Add an optional fullHistory flag to the typed git_path_history tool (passes --full-history). Add a required pathChanges(from, to, path) method to ReviewSources that returns the commits in from..to whose literal path differs from at least one parent; RegistryReviewSources implements it with git_path_history { cwd: repoPath, rev: 'from..to', path, fullHistory: true }. boundedProjectionSources caches it per (from, to, path) and charges one read. pathContinuity replaces its walk: for each listed commit that descends from the origin, and each parent that is the origin or descends from it, it compares existence exactly as today. Commits not listed leave the path identical on every edge, so they cannot interrupt lineage.

### 7.2 a2: Existence by object id, same walk

Keep the per-commit walk but test existence with a content-free object lookup instead of reading whole blobs.

Add a ReviewSources method that reports whether commit:path exists (object id only, no content), and make pathContinuity call it instead of file(). The walk still visits every commit from origin to pin; only the decoded bytes disappear.

**Rejected because:** Moves the failure from bytes to reads; does not fix the cause (violates ac1: reads still grow per commit).

### 7.3 a3: Commit graph plus per-commit diffs

List the ancestry-path graph once with git_rev_list, then diff each edge for the path with git_diff_tree.

Use git_rev_list --parents over from..to to get the graph and descendant set locally, then for each edge ask git_diff_tree whether the path was added or deleted.

**Rejected because:** Exact but still linear in interleaved commits, with more code than a1 (violates ac1: one diff per edge).

## 8. References

- **[[c1]]** `analyze-bundle` `s1 analyzeBundles[0]: callers of projectReviewScope and boundedProjectionSources; implementers of ReviewSources` — "The only production ReviewSources implementer is RegistryReviewSources"
- **[[c2]]** `analyze-bundle` `s1 analyzeBundles[1]: the continuity walk and its limits` — "Its comment requires inspecting every descendant edge, not log's simplified or first-parent history."
- **[[c3]]** `analyze-bundle` `s1 analyzeBundles[2]: typed git tools available for a path-limited history listing` — "parses through parseOutput, which refuses stdout cut at the shell byte limit (10 MiB default) rather than returning a partial list"
- **[[c4]]** `analyze-bundle` `s1 analyzeBundles[3]: existing projection tests, their fixture and the real saved review`
- **[[c5]]** `prior-artifact` `ISSUE-66d4d41d99f805af`
- **[[c6]]** `prior-artifact` `LLD-599f1d0bd42e0c37-s1` — "New internal projection counters are capped at 10000 distinct object/diff reads, 100000 projected fragments and 64 MiB cumulative decoded source bytes"
- **[[c7]]** `prior-artifact` `LLD-e4af63128c7cbec2-s1` — "projection budget increases/optimization"
- **[[c8]]** `code` `src/workflow/code-review/task-review/projection.ts:48-64`
- **[[c9]]** `stakeholder` `Design review round 1 (lld-66d4d41d99f805af-s1)` — "the LLD never states what quantity is measured or how the two runs are compared"
- **[[c10]]** `stakeholder` `Design review round 2 (controller self-review, user instruction 2026-11-11)` — "design review is broken, use the process defined to do a manual self-review"
