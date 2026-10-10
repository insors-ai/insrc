<!-- insrc:artifact TESTS-2764c29d7ccb66a5-S001 -->

# Tests: 2764c29d7ccb66a5 S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 18 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

## t1

Run at 2026-10-10T15:41:06.406Z on commit `0d26867b`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: the read of a repository's stored files returns each file once, only that repository's files, and no empty path**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the read of a repository's stored files returns each file once, only that repository's files, and no empty path | `src/db/__tests__/entity-files-for-repo.test.ts` |

**unit: the removal of one repository's unresolved relations of a file leaves another repository's unresolved relations of the same path**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the removal of one repository's unresolved relations of a file leaves another repository's unresolved relations of the same path | `src/db/__tests__/entity-files-for-repo.test.ts` |

**unit: an unregistered repository has no stored files and its removal of unresolved relations does nothing**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an unregistered repository has no stored files and its removal of unresolved relations does nothing | `src/db/__tests__/entity-files-for-repo.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/db/__tests__/entity-files-for-repo.test.ts` | 0 | 3 | 1.4 s |  |

## t2

Run at 2026-10-10T15:43:41.783Z on commit `c8667e0b`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: a queued clean-up job is counted as pending for its repository, and a second one for the same repository is not queued**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a queued clean-up job is counted as pending for its repository, and a second one for the same repository is not queued | `src/daemon/__tests__/queue-depth-for-repo.test.ts` |

**integration: a clean-up job for a registered repository with nothing stored is processed without error**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a clean-up job for a registered repository with nothing stored is processed without error | `src/indexer/__tests__/reconcile.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/queue-depth-for-repo.test.ts` | 0 | 5 | 0.5 s |  |
| `src/indexer/__tests__/reconcile.test.ts` | 0 | 1 | 0.8 s |  |

## t3

Run at 2026-10-10T15:48:18.037Z on commit `f9041216`. Tests check: **passed**. 11 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: the clean-up removes a file that is gone and a file under an ignored directory, with their relations and unresolved relations, and leaves every other file of the repository and every file of another repository as it was**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the clean-up removes a file that is gone and a file under an ignored directory, with their relations and unresolved relations, and leaves every other file of the repository and every file of another repository as it was | `src/indexer/__tests__/reconcile.test.ts` |

**integration: a file that exists and is not ignored is kept although the file listing leaves it out, an entity with no file path is kept, and a file whose name only contains an ignored name is kept**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a file that exists and is not ignored is kept although the file listing leaves it out, an entity with no file path is kept, and a file whose name only contains an ignored name is kept | `src/indexer/__tests__/reconcile.test.ts` |

**integration: a repository whose directory is missing loses nothing, and a file whose presence cannot be told is kept**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a repository whose directory is missing loses nothing, and a file whose presence cannot be told is kept | `src/indexer/__tests__/reconcile.test.ts` |

**integration: running the clean-up a second time removes nothing, and a repository with nothing stale is left as it was**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | running the clean-up a second time removes nothing, and a repository with nothing stale is left as it was | `src/indexer/__tests__/reconcile.test.ts` |

**integration: a clean-up that removed files runs the resolver once inside the job, leaves no settle timer armed and removes the repository's cached exploration results, and one that removed nothing leaves them**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a clean-up that removed files runs the resolver once inside the job, leaves no settle timer armed and removes the repository's cached exploration results, and one that removed nothing leaves them | `src/indexer/__tests__/reconcile.test.ts` |

**integration: a file whose parent directory became a file is removed as absent**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a file whose parent directory became a file is removed as absent | `src/indexer/__tests__/reconcile.test.ts` |

**integration: the clean-up of a repository that ignores a directory leaves the entities a nested registered repository holds for the files under it**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the clean-up of a repository that ignores a directory leaves the entities a nested registered repository holds for the files under it | `src/indexer/__tests__/reconcile.test.ts` |

**integration: the vector rows of a removed file are gone after the clean-up and those of a kept file remain**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the vector rows of a removed file are gone after the clean-up and those of a kept file remain | `src/indexer/__tests__/reconcile.test.ts` |

**integration: a create or update file job for a file under an ignored directory indexes nothing, and one for a file elsewhere is indexed**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a create or update file job for a file under an ignored directory indexes nothing, and one for a file elsewhere is indexed | `src/indexer/__tests__/reconcile.test.ts` |

**integration: a kept file's link into a removed entity is removed with it, and the kept file's other links and entities stay**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a kept file's link into a removed entity is removed with it, and the kept file's other links and entities stay | `src/indexer/__tests__/reconcile.test.ts` |

**integration: the clean-up method called directly removes the stale files, runs no resolver and removes no cached result**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the clean-up method called directly removes the stale files, runs no resolver and removes no cached result | `src/indexer/__tests__/reconcile.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/indexer/__tests__/reconcile.test.ts` | 0 | 12 | 2 s |  |

## t4

Run at 2026-10-10T15:50:33.460Z on commit `4268017d`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: a ready repository gets a clean-up job at daemon start, one that gets a full index at start gets no separate one, and a full index runs the clean-up before it marks the repository ready**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a ready repository gets a clean-up job at daemon start, one that gets a full index at start gets no separate one, and a full index runs the clean-up before it marks the repository ready | `src/indexer/__tests__/reconcile.test.ts` |

**integration: a repository left indexing with a last-indexed time gets a clean-up job at daemon start**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a repository left indexing with a last-indexed time gets a clean-up job at daemon start | `src/indexer/__tests__/reconcile.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/indexer/__tests__/reconcile.test.ts` | 0 | 14 | 2.3 s |  |

## t5

Run at 2026-10-10T16:30:39.608Z on commit `53a6fc92`. Tests check: **passed**. 0 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

the gate ran no test: every named test of this Task was reported by the builder

**smoke: on the installed daemon after the update, the files under this repository's build output and the deleted test file have no entities, a source file still has its entities, and the repository's count of JavaScript files has fallen**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/standalone/index-never-reconciled-against-files-disk-E202610102764c29d/S001/smoke-installed-daemon.md (before and after readings from search.by_file and repo.stats, and the daemon's log line)
