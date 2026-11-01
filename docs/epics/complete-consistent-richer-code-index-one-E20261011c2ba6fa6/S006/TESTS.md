<!-- insrc:artifact TESTS-c2ba6fa62a148ed1-s6 -->

# Tests: c2ba6fa62a148ed1 s6

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 21 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

## t1

Run at 2026-11-01T09:21:57.295Z on commit `e726a7f08`. Tests check: **passed**. 0 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

the gate ran no test: every named test of this Task was reported by the builder

**smoke: npm install resolves the ignore package and tsc --noEmit stays clean**

Reported by the builder, not run by the gate: **pass**. Evidence: package.json:51 lists "ignore": "^7.0.14"; npm install succeeded; npx tsc --noEmit produced no output

## t2

Run at 2026-11-01T09:27:24.952Z on commit `42f077889`. Tests check: **passed**. 8 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

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
| `src/indexer/__tests__/file-filter.test.ts` | 0 | 8 | 1.3 s |  |

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

Run at 2026-11-01T09:45:47.053Z on commit `4efa01a71`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: proposeIgnoreFile**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ac6: proposeIgnoreFile, given a repo with no root ignore file and a model stub that succeeds, writes the model-sourced file and returns {written:true, source:"model"} | `src/indexer/__tests__/file-filter.test.ts` |
| pass | ac7/lc2: proposeIgnoreFile, given a model stub that throws, still writes a fallback ignore file and returns {written:true, source:"fallback", reason} without throwing | `src/indexer/__tests__/file-filter.test.ts` |
| pass | a malformed (prose) model response is treated as unusable and falls back, without throwing | `src/indexer/__tests__/file-filter.test.ts` |
| pass | ac8: proposeIgnoreFile given a repo whose root ignore file already exists leaves its bytes unchanged and never invokes the model | `src/indexer/__tests__/file-filter.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/indexer/__tests__/file-filter.test.ts` | 0 | 13 | 1.1 s |  |

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

Run at 2026-11-01T10:19:27.313Z on commit `66e0566c0`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/indexer/index.ts (full walk, single file event, clean-up pass, registration)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ac6: adding a repo with no root ignore file results in one existing before the first index runs | `src/indexer/__tests__/reconcile.test.ts` |
| pass | ac6: a repo added with no root ignore file gets the cheap-tier model's proposal, resolved at call time | `src/indexer/__tests__/ignore-proposal-model.test.ts` |
| pass | ac7: a cheap tier that cannot be resolved still leaves a fallback root ignore file | `src/indexer/__tests__/ignore-proposal-model.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/indexer/__tests__/ignore-proposal-model.test.ts` | 0 | 2 | 0.5 s |  |
| `src/indexer/__tests__/reconcile.test.ts` | 0 | 20 | 4.4 s |  |

## t7

Run at 2026-11-01T10:20:34.811Z on commit `684b25450`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

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
| `src/indexer/__tests__/cross-file-modes.test.ts` | 0 | 4 | 1.5 s |  |
| `src/indexer/__tests__/source-roots.test.ts` | 0 | 25 | 0.6 s |  |
| `src/indexer/__tests__/watcher-file-filter.test.ts` | 0 | 1 | 0.6 s |  |
