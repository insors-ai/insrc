<!-- insrc:artifact TESTS-c2ba6fa62a148ed1-s6 -->

# Tests: c2ba6fa62a148ed1 s6

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 59 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

## t1

Run at 2026-11-01T09:21:57.295Z on commit `e726a7f08`. Tests check: **passed**. 0 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

the gate ran no test: every named test of this Task was reported by the builder

**smoke: npm install resolves the ignore package and tsc --noEmit stays clean**

Reported by the builder, not run by the gate: **pass**. Evidence: package.json:51 lists "ignore": "^7.0.14"; npm install succeeded; npx tsc --noEmit produced no output

## t2

Run at 2026-11-01T11:40:52.254Z on commit `c8a1b9942`. Tests check: **passed**. 8 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: createFileFilter**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ac1: an anchored rule excludes the top-level directory it names, not a same-named directory deeper in the tree | `src/indexer/__tests__/file-filter.test.ts` |
| pass | error path: a broken .git directory degrades the tracked-file override to empty, not a throw | `src/indexer/__tests__/file-filter.test.ts` |

**unit: FileFilter.includes**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ac2: a tracked directory named 'target' (an old built-in bare name) not matched by any ignore rule is included | `src/indexer/__tests__/file-filter.test.ts` |
| pass | ac3: a subdirectory .gitignore rule scopes to that subdirectory, excluding a same-named file elsewhere in the tree | `src/indexer/__tests__/file-filter.test.ts` |
| pass | ac9 baseline: a non-git folder with no ignore files includes every file (only the built-ins apply) | `src/indexer/__tests__/file-filter.test.ts` |
| pass | a non-git folder with an ignore file is filtered by its rules alone (ac9) | `src/indexer/__tests__/file-filter.test.ts` |
| pass | a tracked file under .insrc is excluded (built-in override, even over the tracked-file union) | `src/indexer/__tests__/file-filter.test.ts` |

**unit: FileFilter.listFiles**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | listFiles() returns exactly the included files | `src/indexer/__tests__/file-filter.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/indexer/__tests__/file-filter.test.ts` | 0 | 17 | 1.1 s |  |

## t3

Run at 2026-11-01T09:42:47.660Z on commit `d638e86b5`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: refreshFileFilter**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ac5: refreshFileFilter, given an ignore file that gained one rule and lost another, returns the correct left/entered sets | `src/indexer/__tests__/file-filter.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/indexer/__tests__/file-filter.test.ts` | 0 | 9 | 0.9 s |  |

## t4

Run at 2026-11-01T11:42:15.530Z on commit `c8a1b9942`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: proposeIgnoreFile**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ac6: proposeIgnoreFile, given a repo with no root ignore file and a model stub that succeeds, writes the model-sourced file and returns {written:true, source:"model"} | `src/indexer/__tests__/file-filter.test.ts` |
| pass | ac7/lc2: proposeIgnoreFile, given a model stub that throws, still writes a fallback ignore file and returns {written:true, source:"fallback", reason} without throwing | `src/indexer/__tests__/file-filter.test.ts` |
| pass | ac8: proposeIgnoreFile given a repo whose root ignore file already exists leaves its bytes unchanged and never invokes the model | `src/indexer/__tests__/file-filter.test.ts` |
| pass | a malformed (prose) model response is treated as unusable and falls back, without throwing | `src/indexer/__tests__/file-filter.test.ts` |
| pass | a proposal wrapped in markdown fences is written without the fence lines | `src/indexer/__tests__/file-filter.test.ts` |
| pass | a proposal with a pattern that leaves out the whole repository is not written; the plain fallback is | `src/indexer/__tests__/file-filter.test.ts` |
| pass | a model that does not answer in time is aborted and the plain fallback is written | `src/indexer/__tests__/file-filter.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/indexer/__tests__/file-filter.test.ts` | 0 | 17 | 1.2 s |  |

## t6

Run at 2026-11-01T10:05:42.218Z on commit `0fa779e65`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/indexer/index.ts (full walk, single file event, clean-up pass, registration)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a create or update file job for a file under an ignored directory indexes nothing, and one for a file elsewhere is indexed | `src/indexer/__tests__/reconcile.test.ts` |
| pass | the clean-up removes a file that is gone and a file under an ignored directory, with their relations and unresolved relations, and leaves every other file of the repository and every file of another repository as it was | `src/indexer/__tests__/reconcile.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/indexer/__tests__/reconcile.test.ts` | 0 | 19 | 3.8 s |  |

## t5

Run at 2026-11-01T12:11:59.354Z on commit `e272bcc5f`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/indexer/index.ts (full walk, single file event, clean-up pass, registration)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ac6: adding a repo with no root ignore file results in one existing before the first index runs | `src/indexer/__tests__/reconcile.test.ts` |
| pass | a repository registered before s6 with no root ignore file gets one at start-up, before its filter is built | `src/indexer/__tests__/watcher-file-filter.test.ts` |
| pass | ac6: a repo added with no root ignore file gets the cheap-tier model's proposal, resolved at call time | `src/indexer/__tests__/ignore-proposal-model.test.ts` |
| pass | ac7: a cheap tier that cannot be resolved still leaves a fallback root ignore file | `src/indexer/__tests__/ignore-proposal-model.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/indexer/__tests__/ignore-proposal-model.test.ts` | 0 | 2 | 0.6 s |  |
| `src/indexer/__tests__/reconcile.test.ts` | 0 | 20 | 4.5 s |  |
| `src/indexer/__tests__/watcher-file-filter.test.ts` | 0 | 10 | 1.8 s |  |

## t7

Run at 2026-11-01T11:43:23.247Z on commit `c8a1b9942`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/indexer/watcher.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a watcher-emitted event for a FileFilter-excluded file never reaches a registered handler, while one for an included file does | `src/indexer/__tests__/watcher-file-filter.test.ts` |

**integration: src/indexer/cross-file-resolver.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | after a full index, rows awaiting a file are classed by the selection rule: not code is no-candidate, an ignored source file and a source file not stored stay awaiting with their reason | `src/indexer/__tests__/cross-file-modes.test.ts` |

**integration: src/indexer/source-roots.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | walks into a 'target' directory FileFilter includes and finds the package under it | `src/indexer/__tests__/source-roots.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/indexer/__tests__/cross-file-modes.test.ts` | 0 | 4 | 1.9 s |  |
| `src/indexer/__tests__/source-roots.test.ts` | 0 | 25 | 0.6 s |  |
| `src/indexer/__tests__/watcher-file-filter.test.ts` | 0 | 8 | 1.4 s |  |

## t8

Run at 2026-11-01T12:16:38.581Z on commit `e272bcc5f`. Tests check: **passed**. 10 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/analyze/explore/concept-resolve.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | concept.resolve enumerates only the directories FileFilter includes | `src/analyze/explore/__tests__/file-filter-walkers.test.ts` |
| pass | the fixture's include/exclude set is FileFilter's own answer | `src/analyze/explore/__tests__/file-filter-walkers.test.ts` |

**integration: src/analyze/explore/module-profile.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | module.profile lists only the subdirectories and files FileFilter includes | `src/analyze/explore/__tests__/file-filter-walkers.test.ts` |

**integration: src/analyze/runtimes/infra/_shared.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | infra walkFiles yields exactly the files FileFilter includes | `src/analyze/explore/__tests__/file-filter-walkers.test.ts` |
| pass | infra walkFiles of a directory inside the repository applies the repository's own rules | `src/analyze/explore/__tests__/file-filter-walkers.test.ts` |
| pass | infra walkFiles reports a directory it cannot read, and never descends into an ignored one | `src/analyze/explore/__tests__/file-filter-walkers.test.ts` |
| pass | the file walk goes to the end with a null cap and stops at its cap, as before, with a number or with none given | `src/analyze/runtimes/infra/__tests__/walk-files.test.ts` |
| pass | walkFiles: a node_modules directory the repository ignores is skipped; other files visible | `src/analyze/runtimes/infra/__tests__/infra-runtimes.test.ts` |
| pass | inside a run every consumer gets the same filter for a repository; outside, each call builds its own | `src/analyze/context/__tests__/run-file-filter.test.ts` |
| pass | the plan's RepoIgnoreFilter and the infra file walk judge by one snapshot inside a run, the current rules outside one | `src/analyze/context/__tests__/run-file-filter.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/context/__tests__/run-file-filter.test.ts` | 0 | 2 | 0.7 s |  |
| `src/analyze/explore/__tests__/file-filter-walkers.test.ts` | 0 | 6 | 1.5 s |  |
| `src/analyze/runtimes/infra/__tests__/infra-runtimes.test.ts` | 0 | 24 | 4 s |  |
| `src/analyze/runtimes/infra/__tests__/walk-files.test.ts` | 0 | 1 | 0.5 s |  |

## t9

Run at 2026-11-01T12:21:04.629Z on commit `e272bcc5f`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/indexer/index.ts (full walk, single file event, clean-up pass, registration)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | lc1: a stale .insrc/config.json ignore array from before Story s6 is read by nothing -- only FileFilter decides what the full index takes | `src/indexer/__tests__/file-selection.test.ts` |
| pass | the predicate classes a .png, a .min.js, a lock file and a JSON over 256 KB as not-code, a .ts under an ignored directory as excluded-by-ignore, and a .css and a .json under the limit as selected | `src/indexer/__tests__/file-selection.test.ts` |
| pass | on a mixed fixture the full index selects the files it selected before, less only the lock file and the oversized JSON the artifact parser skipped | `src/indexer/__tests__/file-selection.test.ts` |
| pass | a create or update file job for a file under an ignored directory indexes nothing, and one for a file elsewhere is indexed | `src/indexer/__tests__/reconcile.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/indexer/__tests__/file-selection.test.ts` | 0 | 4 | 1.7 s |  |
| `src/indexer/__tests__/reconcile.test.ts` | 0 | 20 | 4 s |  |

## t10

Run at 2026-11-01T12:14:51.238Z on commit `e272bcc5f`. Tests check: **passed**. 8 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/indexer/watcher.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ac5: an ignore-file edit that drops one rule and adds another, in one batch with edits to the files it moves, is judged by the new rules -- the newly covered file leaves, the uncovered one enters, once each | `src/indexer/__tests__/watcher-file-filter.test.ts` |
| pass | ac5: a file the removed rule covered enters the index even when the batch carries no event for it | `src/indexer/__tests__/watcher-file-filter.test.ts` |
| pass | a change to the clone's exclude file, which no event names, is found by its content and applied before the batch is judged | `src/indexer/__tests__/watcher-file-filter.test.ts` |
| pass | the real watcher applies an ignore-file edit and an edit to a file it newly covers consistently in one pass | `src/indexer/__tests__/watcher-file-filter.test.ts` |
| pass | a full index or re-registration refreshes the filter the watcher holds, in place, instead of handing out a new one | `src/indexer/__tests__/watcher-file-filter.test.ts` |
| pass | a refresh is reported, and a .gitignore a tool writes inside an ignored directory refreshes nothing | `src/indexer/__tests__/watcher-file-filter.test.ts` |
| pass | a live ignore-rule change queues the clean-up pass, which removes stored files the new rules leave out -- also one indexed after the filter was built | `src/indexer/__tests__/watcher-file-filter.test.ts` |
| pass | the watcher natively ignores what the filter leaves out -- pruned directories, nested repositories, .insrc -- and re-subscribes when the rules change | `src/indexer/__tests__/watcher-file-filter.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/indexer/__tests__/watcher-file-filter.test.ts` | 0 | 10 | 1.9 s |  |

## t11

Run at 2026-11-01T12:18:25.377Z on commit `e272bcc5f`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/analyze/explore/concept-resolve.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ac9: a non-git folder gets its ignore files' rules, the same answer as the equivalent git repository, not a permissive one | `src/analyze/context/__tests__/repo-ignore-filter.test.ts` |
| pass | every ancestor of a tracked file is considered included | `src/analyze/context/__tests__/repo-ignore-filter.test.ts` |
| pass | respects a subdirectory .gitignore | `src/analyze/context/__tests__/repo-ignore-filter.test.ts` |
| pass | concept.resolve enumerates only the directories FileFilter includes | `src/analyze/explore/__tests__/file-filter-walkers.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/context/__tests__/repo-ignore-filter.test.ts` | 0 | 6 | 0.9 s |  |
| `src/analyze/explore/__tests__/file-filter-walkers.test.ts` | 0 | 6 | 1.4 s |  |

## t12

Run at 2026-11-01T12:21:45.714Z on commit `e272bcc5f`. Tests check: **passed**. 8 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/indexer/index.ts (full walk, single file event, clean-up pass, registration)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ac1/ac3: FileFilter lists exactly the files real git includes, over anchored, nested, negation, precedence, directory-only and globstar rules | `src/indexer/__tests__/file-filter-git-conformance.test.ts` |
| pass | FileFilter.includes agrees with git check-ignore for every file of the fixture, tracked override included | `src/indexer/__tests__/file-filter-git-conformance.test.ts` |
| pass | ac9: a non-git folder holding the same tree leaves out the same files its ignore files leave out in the git repository | `src/indexer/__tests__/file-filter-git-conformance.test.ts` |
| pass | a repository registered at a subdirectory of a git working tree gets the tree's rules and tracked files, as git ls-files run there does | `src/indexer/__tests__/file-filter-git-conformance.test.ts` |
| pass | a symbolic link to a file is listed as git lists it, and one to a directory is not followed | `src/indexer/__tests__/file-filter-git-conformance.test.ts` |
| pass | a nested repository's files are not this repository's, as git does not list them | `src/indexer/__tests__/file-filter-git-conformance.test.ts` |
| pass | the clone's exclude file outranks the global ignore file, as in git, and the global file is found under XDG_CONFIG_HOME | `src/indexer/__tests__/file-filter-git-conformance.test.ts` |
| pass | on a mixed fixture the full index selects the files it selected before, less only the lock file and the oversized JSON the artifact parser skipped | `src/indexer/__tests__/file-selection.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/indexer/__tests__/file-filter-git-conformance.test.ts` | 0 | 7 | 1.3 s |  |
| `src/indexer/__tests__/file-selection.test.ts` | 0 | 4 | 1.5 s |  |
