<!-- insrc:artifact LLD-c2ba6fa62a148ed1-s6 -->

# LLD: E20261101c2ba6fa6:S006

## Summary

**Epic:** `complete-consistent-richer-code-index-one`
**HLD base run:** `wf-1791697214822-7bombm`
**HLD effective hash:** `85da4a2df479...`

This Story replaces the many separate bare-name ignore lists scattered across the indexer, the watcher, and three analyzer walkers with one FileFilter: an in-process gitignore-grammar matcher built from the repository's real .gitignore files (nested), its clone's own exclude file, and the user's global gitignore, unioned with git's own tracked-file list so a tracked file is always included. A repository added with no root ignore file gets one proposed by the local model, falling back to a plain file if the model call fails; an existing ignore file is never touched. Every site that decides what the index holds now asks the same filter, so a full walk, a single file event, and the live watcher agree.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Interaction with shared contracts](#4-interaction-with-shared-contracts)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Migration](#7-migration)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)

## 1. HLD context

> See **HLD-c2ba6fa62a148ed1** § 2. Framework summary

**Rollout phase:** Phase B — nothing lost, nothing wrongly left out, fast reads
**Owns:** `sc4` (FileFilter)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: s1's full boundary text, unchanged from the HLD. — owns `sc1`
- `s2`: s2's full boundary text, unchanged from the HLD. — owns `sc2`
- `s3`: s3's full boundary text, unchanged from the HLD.
- `s4`: s4's full boundary text, unchanged from the HLD.
- `s5`: s5's full boundary text, unchanged from the HLD.
- `s7`: s7's full boundary text, unchanged from the HLD. — owns `sc3`
- `s8`: s8's full boundary text, unchanged from the HLD.
- `s9`: s9's full boundary text, unchanged from the HLD.
- `s10`: s10's full boundary text, unchanged from the HLD.
- `s11`: Private implementation of s11: The step tools run inside the daemon, and the MCP server opens no store
- `s12`: Private implementation of s12: Every supported parser records the calls its code makes, and calls resolve within a package
- `s13`: Private implementation of s13: Settling file changes does work proportional to the changed files, never a scan of the repository or the store

## 2. Contract details

**Surface level:** internal

### 2.1 `FileFilter`

```typescript
interface FileFilter { repoPath: string; sources: RuleSource[]; builtIn: BuiltInExclusion[]; includes(absolutePath: string): boolean; listFiles(): string[]; }
```

**Returns:** `FileFilter` — The one rule for what the index leaves out, per the HLD's own sc4 interface sketch.

**Preconditions:**
- repoPath is an absolute, existing directory.

**Postconditions:**
- includes() returns true for a file git tracks even when a pattern rule would otherwise exclude it, and for a directory that holds any included file; listFiles() returns every included file under repoPath.

### 2.2 `RuleSource`

```typescript
interface RuleSource { name: string; ruleFiles: string[]; }
```

**Returns:** `RuleSource` — One named source of ignore rules, per sc4's interface sketch. This Story supplies exactly one: name 'git', ruleFiles the repo's nested .gitignore files root-first, the clone's .git/info/exclude, and the user's global gitignore.

**Postconditions:**
- This Story adds no second RuleSource (lc3); FileFilter.sources has exactly one entry.

### 2.3 `createFileFilter`

```typescript
function createFileFilter(repoPath: string): FileFilter
```

**Parameters:**
- `repoPath: string` — The repository's absolute root path.

**Returns:** `FileFilter` — Builds the filter by reading the repo's real ignore files from disk and (when repoPath/.git exists) the tracked-file set via `git ls-files --cached`.

**Postconditions:**
- For a non-git repoPath, the tracked-file override is simply empty and the ignore-file rules alone decide inclusion (ac9).

### 2.4 `refreshFileFilter`

```typescript
function refreshFileFilter(filter: FileFilter, changedIgnoreFile: string): FilterChange
```

**Parameters:**
- `filter: FileFilter` — The filter to update in place after one of its ignore files changed on disk.
- `changedIgnoreFile: string` — The absolute path of the ignore file (a .gitignore, the clone's exclude file, or the global ignore file) whose content changed.

**Returns:** `FilterChange` — { left: string[]; entered: string[]; } -- the files that newly left and newly entered the included set as a result, per sc4's own FilterChange shape.

**Preconditions:**
- changedIgnoreFile is one of filter.sources[0].ruleFiles, or the repo's clone-exclude/global-ignore file compared by content hash (the watcher cannot see edits to the global ignore file directly).

**Postconditions:**
- filter.includes() reflects the new rule content for every subsequent call; the repository is not re-added (ac5).

### 2.5 `proposeIgnoreFile`

```typescript
function proposeIgnoreFile(repoPath: string, model: CheapTierModel): Promise<IgnoreFileProposal>
```

**Parameters:**
- `repoPath: string` — The repository being added.
- `model: CheapTierModel` — The local cheap-tier model used to propose ignore entries that fit the repository's languages/tools (k9).

**Returns:** `Promise<IgnoreFileProposal>` — { written: boolean; source: 'model' | 'fallback'; reason?: string; } -- per sc4's own interface sketch.

**Errors:**
- `caught-and-reported` when The model call fails or times out -- caught, a plain fallback ignore file is written instead, and the proposal's source/reason record the fallback (ac7, lc2); the repository add is never failed by this.

**Preconditions:**
- Called only when repoPath has no root ignore file at all (functional requirement); an existing root ignore file is never read into or touched by this path (ac8).

**Postconditions:**
- written is true exactly when no root ignore file existed before the call and one now exists at repoPath's root, with entries fit to the repo's detected languages/tools when source is 'model', or a plain default set when source is 'fallback'.

## 3. Data model changes

### 3.1 `FileFilter / RuleSource / BuiltInExclusion / FilterChange / IgnoreFileProposal` — new

New in-process types per sc4's own interface sketch; BuiltInExclusion is a closed union of 'generated-or-minified' | 'insrc-directory', applied by FileFilter.includes() after the rule sources regardless of what they say (k11's built-in-exclusions clause). No existing stored row or schema changes -- these are runtime-only types, nothing persists to the graph store.

**Call sites:**
- `src/indexer/index.ts:275`
- `src/indexer/index.ts:341`
- `src/indexer/index.ts:366`
- `src/indexer/index.ts:480`
- `src/indexer/index.ts:648`
- `src/indexer/index.ts:824`
- `src/indexer/cross-file-resolver.ts:236`
- `src/indexer/source-roots.ts:245`
- `src/indexer/watcher.ts:13`
- `src/analyze/explore/concept-resolve.ts:324`
- `src/analyze/explore/module-profile.ts:51`
- `src/analyze/runtimes/infra/_shared.ts:57`

### 3.2 `src/indexer/repo-ignore-config.ts (initRepoIgnore / resolveRepoIgnore / gitignoreDirs)` — field-remove

Retired entirely: the per-repo .insrc/config.json 'ignore' array and every function that reads or writes it are removed, replaced by createFileFilter. A repository that carries a persisted 'ignore' array from before this Story reads it as dead config data -- the array is left in place on disk (never rewritten by this Story) but nothing reads it anymore, so there are no longer two disagreeing rules (lc1): only FileFilter decides.

**Call sites:**
- `src/indexer/repo-ignore-config.ts`
- `src/indexer/index.ts:275`
- `src/indexer/index.ts:341`
- `src/indexer/index.ts:366`
- `src/indexer/cross-file-resolver.ts:236`

### 3.3 `src/indexer/file-selection.ts (hasIgnoredSegment)` — field-remove

The bare-path-segment membership test is removed from selectFile's ignore check; selectFile now asks FileFilter.includes() instead, after its existing parser/generated-file checks (which stay -- Story s6 only replaces the ignore decision, not the not-code/generated-file decisions file-selection.ts already makes correctly).

**Call sites:**
- `src/indexer/file-selection.ts`

### 3.4 `src/indexer/watcher.ts (IGNORE_DIRS, Watcher.addRepo)` — field-modify

IGNORE_DIRS (the bare-name constant) is removed; Watcher.addRepo's ignore parameter changes from a bare-name list to a FileFilter instance, passed to @parcel/watcher's own 'ignore' option via FileFilter.listFiles()-derived exclusion, or via a post-filter on emitted events using FileFilter.includes() -- the exact mechanism is an implementation choice, not a contract change; either way every emitted file event is filtered through the same FileFilter before reaching the indexer.

**Call sites:**
- `src/indexer/watcher.ts:13`
- `src/indexer/index.ts:275`

### 3.5 `src/analyze/context/repo-ignore-filter.ts (createRepoIgnoreFilter, RepoIgnoreFilter)` — field-modify

A third pre-existing mechanism, found by review: `RepoIgnoreFilter` (`isIncluded(absPath): boolean`, `include<T>(items): T[]`, `repoPath: string`, `gitBacked: boolean`) is built once per analyze run in `executor.ts:170` and `:506` and distributed via `ExplorationRunnerContext.ignoreFilter` to 9 exploration files beyond module-profile.ts/concept-resolve.ts's own separate bare-name lists (which §3.1 already covers): `import-graph.ts`, `convention-detect.ts`, `test-locate.ts`, `usage-example.ts`, `class-hierarchy.ts`, `symbol-locate.ts`, `data-model-trace.ts`, `manifests-locate.ts`, and `module-profile.ts`'s own `ctx.ignoreFilter` use (distinct from its bare IGNORE_DIRS literal already in §3.1). Today it runs its own `git ls-files --cached --others --exclude-standard` subprocess call and degrades to fully permissive (no filtering at all) for a non-git repo or on a git failure. This Story retires that internal implementation and reimplements `createRepoIgnoreFilter(repoPath)` as a thin wrapper over `createFileFilter(repoPath)`: `isIncluded` delegates to `FileFilter.includes` (plus the existing ancestor-directory inclusion logic for directory queries, which `FileFilter.includes`'s own 'true ... for a directory that holds any included file' postcondition already provides), `include<T>` stays sugar over `isIncluded`, and `gitBacked` becomes true whenever `repoPath/.git` exists. The public `RepoIgnoreFilter` interface is UNCHANGED, so none of the 9 consumer files need to change -- they call the interface, not the git-ls-files implementation. One deliberate behavior change: a non-git repo no longer degrades to fully permissive (no filtering) -- it gets FileFilter's own correct ignore-file-rules-alone handling (ac9), which is strictly more correct than today's permissive fallback, consistent with this Story's and the Epic's intent.

**Call sites:**
- `src/analyze/context/repo-ignore-filter.ts`
- `src/analyze/explore/executor.ts:170`
- `src/analyze/explore/executor.ts:506`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc4` | implements | This Story is sc4's sole owner (HLD boundary text: 'ownedByStory: s6'); FileFilter, RuleSource, BuiltInExclusion, FilterChange and IgnoreFileProposal are implemented exactly per the HLD's own interface sketch, with git as the only RuleSource supplied (lc3: the shape allows a second source to be added later by another Story, but none is added here). |

## 5. Error paths

**Error cases**

- **proposeIgnoreFile's model call fails, times out, or returns content that is not valid ignore-file text.** (recoverable)
  - Detection: The call is wrapped in try/catch; a successful but malformed response is detected by a basic syntactic check (non-empty, line-based) before writing, failing that check the same way a thrown error does.
  - Response: Writes a plain fallback ignore file (the universal base entries) at the repo's root instead, and returns IgnoreFileProposal{ written: true, source: 'fallback', reason: <the failure or malformed-content reason> }; repo registration proceeds unchanged.
  - User impact: The repository is still added and indexed on schedule; the fallback ignore file may be coarser than a model-proposed one, but nothing fails or blocks.
- **A file event arrives for an ignore file itself (e.g. the repo's root .gitignore is edited) concurrently with a burst of other file events for files whose inclusion that edit changes.** (recoverable)
  - Detection: The watcher's event batch is inspected for a path matching one of filter.sources[0].ruleFiles (or the clone-exclude/global-ignore files compared by content hash) before the batch's other files are evaluated.
  - Response: refreshFileFilter runs first for the changed ignore file, producing a FilterChange; the batch's other file events are then evaluated against the REFRESHED filter, so newly-excluded files in the same batch are not indexed and newly-included ones are.
  - User impact: An edit to an ignore file and a simultaneous edit to a file it newly covers are handled consistently in one pass, matching ac5's intent.
- **git ls-files --cached fails (e.g. a corrupted .git directory, or git itself is not installed) while building the tracked-file override for a repository that does have a .git directory.** (recoverable)
  - Detection: The spawned process exits non-zero or throws (ENOENT for a missing git binary).
  - Response: The tracked-file override set is treated as empty for that repository (logged at warn) -- the filter falls back to ignore-file rules alone, the same behavior ac9 specifies for a genuinely non-git folder.
  - User impact: A tracked file that a pattern rule would otherwise exclude is, in this one failure case, excluded like an untracked file would be -- a narrower result than normal, not a crash or a hang.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A repository with .gitignore files at the root and in three nested subdirectories, where a deeper file re-includes (via a negation rule) something an ancestor's rule excludes. | Per-directory composition evaluates the deepest applicable directory's rules last, matching git's own precedence (later / more specific rules win) -- verified directly against real git in the conformance test (ac1, ac3). |
| A plain (non-git) folder with no ignore files anywhere. | FileFilter.sources[0].ruleFiles is empty; only the two built-in exclusions apply; every other file is included (ac9's baseline case). |
| A repository already carrying a persisted .insrc/config.json 'ignore' array from before this Story shipped. | The array is never read by any code path after this Story (repo-ignore-config.ts's reader is removed); FileFilter alone decides, so the repository is not filtered by two disagreeing rules (lc1). The stale array itself is left on disk untouched -- this Story does not rewrite or delete files outside its own scope. |
| A repository whose root ignore file already exists and whose content a model, if asked, would propose differently. | proposeIgnoreFile is never invoked at all when a root ignore file exists (the functional requirement gates on absence, not on content quality); the existing file is byte-for-byte unchanged (ac8). |

**Invariants to preserve**

- A file git tracks is indexed even when a pattern rule in an ignore file would otherwise exclude it -- the stakeholder-decided override (k11) that FileFilter's tracked-file union exists to enforce. [[c1]]
- The full walk and the single file event path must agree after this Story -- the exact 'two rules disagree' defect this Story fixes. [[c1]]
- selectFile's existing not-code / generated-or-minified / artifact-skip checks are unchanged by this Story -- only the ignore decision inside selectFile is replaced. [[c1]]

## 6. Test strategy

**Test framework:** `node:test (tsx --test), extending src/indexer/__tests__'s existing fixture-tree + mkdtempSync pattern used by the indexer's other full-walk/watcher tests`

**Test levels**

- **unit** — Verify FileFilter's matching, listFiles, and live-refresh behavior directly over fixture ignore-file trees, without touching real git or the daemon.
  - Subjects: `createFileFilter`, `FileFilter.includes`, `FileFilter.listFiles`, `refreshFileFilter`, `proposeIgnoreFile`
  - Fixtures: `A set of temp-directory fixture trees with nested .gitignore files, a .git/info/exclude, and a fake global-ignore path, each with a known expected included/excluded file set`, `A fake cheap-tier model stub for proposeIgnoreFile's success/failure/malformed-response paths`
- **integration** — Prove the conformance claim: FileFilter's in-process answer matches real git's own answer over the same fixture tree, and that every migrated call site now agrees.
  - Subjects: `src/indexer/index.ts (full walk, single file event, clean-up pass, registration)`, `src/indexer/watcher.ts`, `src/indexer/cross-file-resolver.ts`, `src/indexer/source-roots.ts`, `src/analyze/explore/concept-resolve.ts`, `src/analyze/explore/module-profile.ts`, `src/analyze/runtimes/infra/_shared.ts`
  - Fixtures: `A real temp git repository (git init + real .gitignore + real git ls-files) for the conformance comparison`, `A real temp non-git folder with ignore files for the ac9 case`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: FileFilter.includes returns false for a top-level directory matched by an anchored rule and true for a same-named directory deeper in the tree, over a fixture tree`, `integration: the conformance test asserts this matches real git's own check-ignore/ls-files result on the same fixture` |
| `ac2` | `integration: a full index of a fixture repo with a tracked directory named after a retired built-in bare name but not matched by any ignore rule includes that directory's files` |
| `ac3` | `unit: FileFilter.includes scopes a subdirectory's .gitignore rule to that subdirectory and below, excluding a same-named file elsewhere in the tree`, `integration: a single file event for a file under the subdirectory rule is excluded both at full-walk time and at file-event time` |
| `ac4` | `integration: a single FileEvent for a file matched only by a pattern rule in an ignore file results in the file not being indexed, exercising the same code path index.ts:824 calls today` |
| `ac5` | `unit: refreshFileFilter, given an ignore file whose content gained one rule and lost another, returns FilterChange.left and FilterChange.entered correctly, without any repo re-registration call` |
| `ac6` | `unit: proposeIgnoreFile, given a fixture repo with no root ignore file and a model stub that succeeds, writes a root ignore file before returning and returns IgnoreFileProposal{written:true, source:'model'}` |
| `ac7` | `unit: proposeIgnoreFile, given a model stub that throws, still writes a fallback ignore file and returns IgnoreFileProposal{written:true, source:'fallback', reason: <set>}, and the caller's repo-add flow does not throw` |
| `ac8` | `unit: proposeIgnoreFile given a fixture repo whose root ignore file already exists asserts the file's bytes are identical before and after the call, and that the model stub is never invoked` |
| `ac9` | `integration: a real temp non-git folder with root and subdirectory ignore files is indexed and the files those rules cover are excluded exactly as the git-repo fixture's equivalent files are` |

## 7. Migration

**State before:** 12 call sites across 3 mechanism families decide what the index/watcher/analyzer leaves out today: src/indexer/watcher.ts's bare-name IGNORE_DIRS constant; src/indexer/repo-ignore-config.ts's per-repo .insrc/config.json 'ignore' array (initRepoIgnore/resolveRepoIgnore); src/indexer/file-selection.ts's hasIgnoredSegment bare-path-segment test (called from listRepoFiles at index.ts:97 on top of git's own already-correct ls-files result, and alone at index.ts:824 for the single file event, which has no real gitignore grammar at all); src/indexer/source-roots.ts:245's own bare-name list; three separate analyzer-side bare-name list literals; AND a third, distinct mechanism -- src/analyze/context/repo-ignore-filter.ts's git-ls-files-based RepoIgnoreFilter, built once per analyze run and consumed via ExplorationRunnerContext.ignoreFilter by 9 exploration files, which today degrades to fully permissive (no filtering) for a non-git repo or on a git failure. No in-process gitignore-grammar matcher exists anywhere in the repo.

**State after:** One FileFilter per repository (sc4), built from the repo's real nested .gitignore files, its .git/info/exclude, and the user's global gitignore via the `ignore` npm package, unioned with git's own tracked-file list; the two built-in exclusions apply on top. All 12 call sites ask the same filter; repo-ignore-config.ts, hasIgnoredSegment, watcher.ts's IGNORE_DIRS, source-roots.ts's list, and the three analyzer-side lists are all removed. createRepoIgnoreFilter is reimplemented as a thin wrapper over FileFilter, with its public RepoIgnoreFilter interface unchanged, so its 9 consumer files need no changes; its non-git permissive fallback is replaced by FileFilter's correct ignore-file-rules-alone handling. A repository added with no root ignore file gets one proposed by the cheap-tier model, or a plain fallback on model failure; an existing root ignore file is never touched.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the `ignore` package as a new runtime dependency. — ↩ rollbackable
2. Implement createFileFilter/FileFilter/RuleSource/BuiltInExclusion/refreshFileFilter per the HLD's sc4 interface sketch, reading real ignore files and git's tracked-file list, with the two built-in exclusions applied inside includes(). — ↩ rollbackable
3. Implement proposeIgnoreFile (model proposal + fallback) and wire it into the repo-registration path to run exactly when no root ignore file exists. — ↩ rollbackable
4. Route the full walk, the single file event, the clean-up pass, and the two registration seed sites in src/indexer/index.ts (lines 275, 341, 366, 480, 648, 824) onto FileFilter, removing their resolveRepoIgnore/initRepoIgnore/hasIgnoredSegment calls. — ↩ rollbackable
5. Route src/indexer/cross-file-resolver.ts:236, src/indexer/source-roots.ts:245, and src/indexer/watcher.ts's addRepo (replacing IGNORE_DIRS) onto FileFilter. — ↩ rollbackable
6. Route the analyzer's reader, its two exploration walkers, and the infra walker onto FileFilter, removing their own bare-name list literals. — ↩ rollbackable
7. Remove src/indexer/repo-ignore-config.ts and src/indexer/file-selection.ts's hasIgnoredSegment entirely; selectFile calls FileFilter.includes() instead, after its unchanged not-code/generated-file checks. — ↩ rollbackable
8. Wire the watcher's ignore-file-edit detection to call refreshFileFilter before evaluating the rest of that event batch. — ↩ rollbackable
9. Reimplement createRepoIgnoreFilter (src/analyze/context/repo-ignore-filter.ts) as a thin wrapper over createFileFilter, keeping its public RepoIgnoreFilter interface (isIncluded/include/repoPath/gitBacked) unchanged so its 9 exploration-file consumers need no changes; remove its own git-ls-files subprocess call and its non-git permissive-degrade branch. — ↩ rollbackable

**Backward compat:** No stored schema or graph-store change -- every change is in-process runtime behavior, so there is no SCHEMA_VERSION migration step and no re-index is required for existing repositories. A repository carrying a stale .insrc/config.json 'ignore' array from before this Story is unaffected functionally (lc1) because nothing reads that key anymore, though the file itself is left on disk untouched. Watcher.addRepo's ignore parameter changes shape -- this is an internal signature change with exactly one caller, migrated in the same Story, not a public API break.

## 8. Alternatives considered

### 8.1 a1: In-process ignore-grammar library (the `ignore` npm package) fed from the repo's real ignore files, plus git's tracked-file list as an override — **CHOSEN**

Build FileFilter by reading each directory's .gitignore (nested, root-first), .git/info/exclude and the user's global gitignore into the `ignore` package's matcher per directory, unioned with `git ls-files --cached` for the tracked-file override; a conformance test runs both this and real git over the same fixture tree.



### 8.2 a2: Always shell out to real git (git check-ignore / git ls-files) for every filter decision, everywhere

Replace every site with calls into git itself, including the single file event and the watcher's live-update path.



**Rejected because:** Fails ac4 (process-spawn cost on the single-file-event hot path) and ac9 (no git repository to query in a non-git folder) outright, and only partially satisfies ac5 and sc4's implied performance shape.

### 8.3 a3: Hand-rolled in-process gitignore-grammar matcher (no new dependency)

Implement gitignore's pattern grammar directly in this codebase instead of depending on a library.



**Rejected because:** Behaviorally equivalent to a1 on every acceptance criterion and the sc4 contract, so the tie-break is cost/risk: a1 reuses a mature, correctness-focused grammar implementation instead of hand-rolling the same negation/anchor/double-star edge cases this project would otherwise have to get right and maintain itself.

## 9. References

- **[[c1]]** `code` `src/indexer/index.ts:64-117`
- **[[c2]]** `code` `src/indexer/index.ts:824`
- **[[c3]]** `code` `src/indexer/repo-ignore-config.ts`
- **[[c4]]** `code` `src/indexer/file-selection.ts`
- **[[c5]]** `code` `src/indexer/watcher.ts:13-16`
- **[[c6]]** `code` `src/indexer/source-roots.ts:245`
- **[[c7]]** `code` `src/analyze/context/repo-ignore-filter.ts`
- **[[c8]]** `code` `src/analyze/explore/executor.ts:170-506`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 do not hold · 0 could not be verified · 15 hold** · template `design-spec` · model `cli-claude:claude-sonnet-5` · reviewed 2026-11-01T08:12:08.176Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

_None._
