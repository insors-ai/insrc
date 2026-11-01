<!-- insrc:artifact PLAN-c2ba6fa62a148ed1-s6 -->

# Plan: E20261101c2ba6fa6:S006

## Summary

**Epic:** `complete-consistent-richer-code-index-one`
**LLD run:** `wf-1793519701699-0od7dh`
**LLD effective hash:** `85da4a2df479...`

Building this Story means adding one new in-process module (FileFilter, backed by the `ignore` npm package plus git's own tracked-file list) and then migrating roughly a dozen scattered bare-name-list call sites across the indexer, the watcher, and the analyzer onto it, one family of call sites per task. The riskiest pieces are the live-refresh path (an ignore-file edit must take effect without re-registering the repo) and the model-backed ignore-file proposal for a repo with none, both of which get their own fallback-tested tasks before anything is wired to them. The last task proves the whole thing against real git over real fixture trees, including a non-git folder.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add the ignore npm dependency | S | — | smoke: npm install resolves the ignore package and tsc --noEmit stays clean | [[c1]] [[c2]] |
| 2 | **`t2`** Implement FileFilter/RuleSource/BuiltInExclusion/createFileFilter | L | `t1` | unit: createFileFilter; unit: FileFilter.includes; unit: FileFilter.listFiles | [[c3]] [[c4]] [[c5]] [[c6]] [[c7]] [[c8]] |
| 3 | **`t3`** Implement refreshFileFilter | M | `t2` | unit: refreshFileFilter | [[c9]] [[c7]] |
| 4 | **`t4`** Implement proposeIgnoreFile (model proposal + fallback) | M | `t2` | unit: proposeIgnoreFile | [[c10]] [[c11]] [[c12]] |
| 5 | **`t6`** Route src/indexer/index.ts's 6 call sites onto FileFilter | L | `t2` | integration: src/indexer/index.ts (full walk, single file event, clean-up pass, registration) | [[c6]] [[c13]] [[c14]] [[c15]] |
| 6 | **`t5`** Wire proposeIgnoreFile into repo registration | S | `t4`, `t6` | integration: src/indexer/index.ts (full walk, single file event, clean-up pass, registration) | [[c12]] |
| 7 | **`t7`** Route cross-file-resolver.ts, source-roots.ts, and watcher.ts addRepo onto FileFilter | M | `t2` | integration: src/indexer/watcher.ts; integration: src/indexer/cross-file-resolver.ts; integration: src/indexer/source-roots.ts | [[c13]] [[c16]] [[c17]] |
| 8 | **`t8`** Route the analyzer's reader, two exploration walkers, and infra walker onto FileFilter | M | `t2` | integration: src/analyze/explore/concept-resolve.ts; integration: src/analyze/explore/module-profile.ts; integration: src/analyze/runtimes/infra/_shared.ts | [[c6]] [[c18]] |
| 9 | **`t9`** Remove repo-ignore-config.ts and file-selection.ts's hasIgnoredSegment | M | `t6`, `t7` | integration: src/indexer/index.ts (full walk, single file event, clean-up pass, registration) | [[c13]] [[c19]] [[c20]] [[c21]] |
| 10 | **`t10`** Wire the watcher's ignore-file-edit detection to refreshFileFilter | M | `t3`, `t7` | integration: src/indexer/watcher.ts | [[c22]] [[c23]] |
| 11 | **`t11`** Reimplement createRepoIgnoreFilter as a thin wrapper over FileFilter | M | `t2` | integration: src/analyze/explore/concept-resolve.ts | [[c24]] [[c25]] |
| 12 | **`t12`** Conformance test against real git, full acceptance-criteria sweep | L | `t5`, `t6`, `t7`, `t8`, `t9`, `t10`, `t11` | integration: src/indexer/index.ts (full walk, single file event, clean-up pass, registration) | [[c26]] [[c27]] |

### 1.1 E20261101c2ba6fa6:S006:T001 — Add the ignore npm dependency

Add the `ignore` package to package.json as a new runtime dependency for in-process gitignore-grammar matching.

**Acceptance checks:**
- package.json lists `ignore` as a runtime dependency; npm install succeeds; tsc --noEmit stays clean

### 1.2 E20261101c2ba6fa6:S006:T002 — Implement FileFilter/RuleSource/BuiltInExclusion/createFileFilter

New module implementing the sc4 types and createFileFilter(repoPath): reads nested .gitignore files (root-first) via the ignore package, .git/info/exclude, and the user's global gitignore into one matcher per directory; unions with git ls-files --cached for the tracked-file override (empty for a non-git repoPath, ac9); applies the two built-in exclusions (generated-or-minified, insrc-directory) inside includes() regardless of rule-source content.

**Acceptance checks:**
- unit: createFileFilter/FileFilter.includes/.listFiles over fixture ignore-file trees match ac1, ac2, ac3, ac9's baseline case
- git ls-files failure is caught and treated as an empty tracked-file override, logged at warn (error path 3)

### 1.3 E20261101c2ba6fa6:S006:T003 — Implement refreshFileFilter

Live-update function: given a filter and the absolute path of a changed ignore file (a .gitignore, the clone exclude file, or the global ignore file compared by content hash), recomputes the matcher for the affected directory scope in place and returns FilterChange{left, entered} — no repo re-registration.

**Acceptance checks:**
- unit: refreshFileFilter given an ignore file that gained one rule and lost another returns correct left/entered sets (ac5)

### 1.4 E20261101c2ba6fa6:S006:T004 — Implement proposeIgnoreFile (model proposal + fallback)

proposeIgnoreFile(repoPath, model): called only when repoPath has no root ignore file; asks the cheap-tier model for entries fit to the repo's detected languages/tools, validates the response is non-empty line-based text before writing, and on model failure/timeout/malformed-content catches it and writes a plain fallback ignore file instead — never touches an existing root ignore file, never fails the repo add.

**Acceptance checks:**
- unit: success path writes a model-sourced file and returns {written:true, source:'model'} (ac6)
- unit: model-throw path still writes a fallback file and returns {written:true, source:'fallback', reason} without throwing (ac7, lc2)
- unit: an existing root ignore file is byte-for-byte untouched and the model is never invoked (ac8)

### 1.5 E20261101c2ba6fa6:S006:T006 — Route src/indexer/index.ts's 6 call sites onto FileFilter

Replace resolveRepoIgnore/initRepoIgnore/hasIgnoredSegment calls at index.ts:275,341,366,480,648,824 (full walk, start-up scan, the two registration seed sites, clean-up pass, single file event) with FileFilter.includes()/.listFiles(), so the full walk and the single file event agree.

**Acceptance checks:**
- integration: a single FileEvent for a file matched only by a pattern rule is not indexed (ac4), exercising the same code path index.ts:824 calls today
- integration: full walk and single file event give the same include/exclude answer for the same fixture tree (invariant: 'the full walk and the single file event path must agree')

### 1.6 E20261101c2ba6fa6:S006:T005 — Wire proposeIgnoreFile into repo registration

Call proposeIgnoreFile exactly when a repository is added with no root ignore file, before the first index runs, using it as the FileFilter is built for that repository (after t6 has already routed the registration seed sites onto FileFilter).

**Acceptance checks:**
- integration: adding a repo with no root ignore file results in one existing before the first index runs (ac6)

### 1.7 E20261101c2ba6fa6:S006:T007 — Route cross-file-resolver.ts, source-roots.ts, and watcher.ts addRepo onto FileFilter

Replace cross-file-resolver.ts:236's ignore read, source-roots.ts:245's bare-name list, and watcher.ts's IGNORE_DIRS constant; Watcher.addRepo's ignore parameter changes from a bare-name list to a FileFilter instance, filtering every emitted file event through it before the indexer sees it.

**Acceptance checks:**
- integration: source-roots.ts no longer hides a package in a directory FileFilter includes (ac2's source-root case)
- integration: a watcher-emitted event for a FileFilter-excluded file never reaches the indexer

### 1.8 E20261101c2ba6fa6:S006:T008 — Route the analyzer's reader, two exploration walkers, and infra walker onto FileFilter

Replace the bare-name list literals in concept-resolve.ts:324, module-profile.ts:51, and src/analyze/runtimes/infra/_shared.ts:57 with FileFilter.includes()/.listFiles().

**Acceptance checks:**
- integration: these three call sites agree with the conformance fixture's expected include/exclude set

### 1.9 E20261101c2ba6fa6:S006:T009 — Remove repo-ignore-config.ts and file-selection.ts's hasIgnoredSegment

Delete src/indexer/repo-ignore-config.ts (initRepoIgnore/resolveRepoIgnore/gitignoreDirs) entirely and remove hasIgnoredSegment from file-selection.ts; selectFile now calls FileFilter.includes() after its unchanged not-code/generated-file checks. A stale .insrc/config.json 'ignore' array from before this Story is left on disk untouched but no longer read by anything (lc1).

**Acceptance checks:**
- a repository carrying a persisted .insrc/config.json 'ignore' array is not double-filtered — only FileFilter decides (lc1 edge case)
- selectFile's existing not-code/generated-or-minified/artifact-skip checks are unchanged (invariant)

### 1.10 E20261101c2ba6fa6:S006:T010 — Wire the watcher's ignore-file-edit detection to refreshFileFilter

Inspect each watcher event batch for a path matching one of the filter's rule files (or the clone-exclude/global-ignore files compared by content hash) before evaluating the batch's other files; call refreshFileFilter first so the rest of the batch is evaluated against the refreshed filter.

**Acceptance checks:**
- integration: an ignore-file edit concurrent with edits to files it newly covers resolves consistently in one pass (ac5, error path 2)

### 1.11 E20261101c2ba6fa6:S006:T011 — Reimplement createRepoIgnoreFilter as a thin wrapper over FileFilter

src/analyze/context/repo-ignore-filter.ts's createRepoIgnoreFilter is rewritten to delegate isIncluded/include<T>/gitBacked to createFileFilter, removing its own git-ls-files subprocess call and its non-git permissive-degrade branch. The public RepoIgnoreFilter interface (isIncluded/include/repoPath/gitBacked) stays unchanged so its 9 exploration-file consumers (via executor.ts:170,506) need no changes; a non-git repo now gets FileFilter's correct ignore-rules-alone handling instead of today's permissive fallback.

**Acceptance checks:**
- none of the 9 RepoIgnoreFilter consumer files change
- a non-git repo's RepoIgnoreFilter answer matches the ac9 integration fixture instead of today's fully-permissive answer

### 1.12 E20261101c2ba6fa6:S006:T012 — Conformance test against real git, full acceptance-criteria sweep

A real temp git repository (git init + real nested .gitignore files + real git ls-files) proves FileFilter's in-process answer matches real git's own check-ignore/ls-files answer; a real temp non-git folder proves ac9. Runs every remaining acceptance criterion not already covered by an earlier task's own tests.

**Acceptance checks:**
- integration: FileFilter matches real git over the fixture tree for ac1 and ac3's negation/precedence case
- integration: the non-git fixture folder's ignore-file exclusions match the git-repo fixture's equivalent files (ac9)

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| createFileFilter | `t2` |
| FileFilter.includes | `t2` |
| FileFilter.listFiles | `t2` |
| refreshFileFilter | `t3`, `t10` |
| proposeIgnoreFile | `t4`, `t5` |
| src/indexer/index.ts (full walk, single file event, clean-up pass, registration) | `t6`, `t5`, `t9`, `t12` |
| src/indexer/watcher.ts | `t7`, `t10` |
| src/indexer/cross-file-resolver.ts | `t7` |
| src/indexer/source-roots.ts | `t7` |
| src/analyze/explore/concept-resolve.ts | `t8`, `t11` |
| src/analyze/explore/module-profile.ts | `t8` |
| src/analyze/runtimes/infra/_shared.ts | `t8` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s6 migration.migrationSteps[0] (add ignore package)`
- **[[c2]]** `prior-artifact` `LLD s6 alternativesConsidered[a1] (chosen: ignore npm package + git tracked-file union)`
- **[[c3]]** `prior-artifact` `LLD s6 contractDetails.api.FileFilter`
- **[[c4]]** `prior-artifact` `LLD s6 contractDetails.api.RuleSource`
- **[[c5]]** `prior-artifact` `LLD s6 contractDetails.api.createFileFilter`
- **[[c6]]** `prior-artifact` `LLD s6 dataModelChanges[0] (FileFilter/RuleSource/BuiltInExclusion/FilterChange/IgnoreFileProposal, new, 12 call sites)`
- **[[c7]]** `prior-artifact` `LLD s6 migration.migrationSteps[1] (implement createFileFilter/FileFilter/RuleSource/BuiltInExclusion/refreshFileFilter)`
- **[[c8]]** `prior-artifact` `LLD s6 errorPaths.errorCases[2] (git ls-files --cached fails)`
- **[[c9]]** `prior-artifact` `LLD s6 contractDetails.api.refreshFileFilter`
- **[[c10]]** `prior-artifact` `LLD s6 contractDetails.api.proposeIgnoreFile`
- **[[c11]]** `prior-artifact` `LLD s6 errorPaths.errorCases[0] (proposeIgnoreFile's model call fails/times out/malformed)`
- **[[c12]]** `prior-artifact` `LLD s6 migration.migrationSteps[2] (implement proposeIgnoreFile + wire into repo registration)`
- **[[c13]]** `prior-artifact` `LLD s6 dataModelChanges[1] (repo-ignore-config.ts field-remove)`
- **[[c14]]** `prior-artifact` `LLD s6 migration.migrationSteps[3] (route index.ts's 6 call sites)`
- **[[c15]]** `prior-artifact` `LLD s6 invariantsToPreserve[1] (full walk and single file event must agree)`
- **[[c16]]** `prior-artifact` `LLD s6 dataModelChanges[3] (watcher.ts IGNORE_DIRS, Watcher.addRepo field-modify)`
- **[[c17]]** `prior-artifact` `LLD s6 migration.migrationSteps[4] (route cross-file-resolver.ts/source-roots.ts/watcher.ts addRepo)`
- **[[c18]]** `prior-artifact` `LLD s6 migration.migrationSteps[5] (route the analyzer's reader/walkers/infra walker)`
- **[[c19]]** `prior-artifact` `LLD s6 dataModelChanges[2] (file-selection.ts hasIgnoredSegment field-remove)`
- **[[c20]]** `prior-artifact` `LLD s6 migration.migrationSteps[6] (remove repo-ignore-config.ts and hasIgnoredSegment)`
- **[[c21]]** `prior-artifact` `LLD s6 invariantsToPreserve[2] (selectFile's existing not-code/generated-file checks unchanged)`
- **[[c22]]** `prior-artifact` `LLD s6 errorPaths.errorCases[1] (ignore-file edit concurrent with a batch of other file events)`
- **[[c23]]** `prior-artifact` `LLD s6 migration.migrationSteps[7] (wire watcher's ignore-file-edit detection to refreshFileFilter)`
- **[[c24]]** `prior-artifact` `LLD s6 dataModelChanges[4] (repo-ignore-filter.ts createRepoIgnoreFilter/RepoIgnoreFilter field-modify)`
- **[[c25]]** `prior-artifact` `LLD s6 migration.migrationSteps[8] (reimplement createRepoIgnoreFilter as a thin wrapper over FileFilter)`
- **[[c26]]** `prior-artifact` `LLD s6 testStrategy.testLevels[1] (integration: conformance against real git)`
- **[[c27]]** `prior-artifact` `LLD s6 testStrategy.acceptanceMapping (ac1-ac9)`
