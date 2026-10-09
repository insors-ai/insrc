<!-- insrc:artifact TESTS-b9d5c5c40df5a574-s7 -->

# Tests: b9d5c5c40df5a574 s7

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 46 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-08T18:44:10.632Z on commit `be6abc9c`. Tests check: **passed**. 12 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: prepareScope and stepScope accept, refuse and return what they did, and prepareScope makes no pairing check in classification or task mode (mutation: make the check in every mode)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | runShaper refuses a pairing the table does not allow before resolving the scope | `src/analyze/context/__tests__/prepare-scope.test.ts` |
| pass | runShaper accepts every pairing in the corrected table | `src/analyze/context/__tests__/prepare-scope.test.ts` |
| pass | the pairing is checked for run mode only: classification and task inputs are not refused | `src/analyze/context/__tests__/prepare-scope.test.ts` |
| pass | resolveScopeForTarget: every pairing of the table resolves to what resolveScope gives; every other pairing is refused before a reader is touched | `src/analyze/context/__tests__/prepare-scope.test.ts` |
| pass | prepareScope makes no pairing check outside run mode: a refused pairing resolves to what resolveScope gives | `src/analyze/context/__tests__/prepare-scope.test.ts` |
| pass | step tool start phase: resolved workspace scope, and the pairing test refusing a stand-in scope | `src/mcp/__tests__/analyze-step-scope.test.ts` |

**unit: the indexed check reads the registry and entities through the readers it is given, and the real store when given none**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ensureNonEmptyClosure: given readers it reads the registry and the entities through them, not the real store | `src/analyze/context/__tests__/invariants.test.ts` |
| pass | ensureNonEmptyClosure: with readers the check keeps its leniency for a registry that cannot be read or holds no repo | `src/analyze/context/__tests__/invariants.test.ts` |
| pass | ensureNonEmptyClosure: pristine registry -> skipped silently, returns undefined | `src/analyze/context/__tests__/invariants.test.ts` |
| pass | ensureNonEmptyClosure: registered repo with entities -> returns repo path | `src/analyze/context/__tests__/invariants.test.ts` |
| pass | ensureNonEmptyClosure: registered repo with ZERO entities -> ScopeNotIndexedError | `src/analyze/context/__tests__/invariants.test.ts` |
| pass | ensureNonEmptyClosure: scope outside every registered repo -> ScopeNotIndexedError | `src/analyze/context/__tests__/invariants.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/context/__tests__/invariants.test.ts` | 0 | 15 | 1.6 s |  |
| `src/analyze/context/__tests__/prepare-scope.test.ts` | 0 | 8 | 0.8 s |  |
| `src/mcp/__tests__/analyze-step-scope.test.ts` | 0 | 3 | 0.7 s |  |

## t2

Run at 2026-10-09T05:22:18.063Z on commit `4093c5fa`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: a table test over four families and seven kinds of scope: pairings in the table resolve, the rest throw the mismatch error naming the kinds allowed (mutation: give a family a kind outside its row)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a table test over four families and seven kinds of scope: pairings in the table resolve, the rest throw the mismatch error naming the kinds allowed (mutation: give a family a kind outside its row) | `src/analyze/runtimes/shared/__tests__/task-scope.test.ts` |

**unit: a kind added to a row of a stand-in table is accepted**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a kind added to a row of a stand-in table is accepted | `src/analyze/runtimes/shared/__tests__/task-scope.test.ts` |

**unit: a module, a file, a symbol and a connection scope resolve to the registered repo and the area**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a module, a file, a symbol and a connection scope resolve to the registered repo and the area | `src/analyze/runtimes/shared/__tests__/task-scope.test.ts` |

**unit: a scope in no registered repo is not indexed for code and docs and resolves for infra and data**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a scope in no registered repo is not indexed for code and docs and resolves for infra and data | `src/analyze/runtimes/shared/__tests__/task-scope.test.ts` |

**unit: an unreadable or empty registry does not refuse a path scope; a symbol scope fails as resolveScope decides (mutation: treat a null repo as not indexed)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an unreadable or empty registry does not refuse a path scope; a symbol scope fails as resolveScope decides (mutation: treat a null repo as not indexed) | `src/analyze/runtimes/shared/__tests__/task-scope.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/runtimes/shared/__tests__/task-scope.test.ts` | 0 | 5 | 0.7 s |  |

## t3

Run at 2026-10-09T05:34:32.198Z on commit `4ebed9de`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: one function maps the three scope error classes to their codes and data, and both mapping functions return through it what they returned before (mutation: return the code alone)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | one function maps the three scope error classes to their codes and data, and both mapping functions return through it what they returned before (mutation: return the code alone) | `src/analyze/orchestrator/__tests__/shaper-error-mapping.test.ts` |
| pass | one list of ten error classes gives the same code from the plan tree's and the daemon's mapping | `src/analyze/orchestrator/__tests__/shaper-error-mapping.test.ts` |

**integration: a runtime that throws each typed scope error is a failed task with that code and no 'runtime-threw:' prefix; any other error has no code (mutation: drop the class check)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a runtime that throws each typed scope error is a failed task with that code and no 'runtime-threw:' prefix; any other error has no code (mutation: drop the class check) | `src/analyze/executor/__tests__/walker.test.ts` |
| pass | runExecutor: runtime throws -> failed status with reason; cascade | `src/analyze/executor/__tests__/walker.test.ts` |
| pass | the plan walk imports nothing from the run driver | `src/analyze/executor/__tests__/walker.test.ts` |

**integration: the plan's and the run's tasksFailed and the daemon's response carry the code**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the plan's and the run's tasksFailed and the daemon's response carry the code | `src/analyze/orchestrator/__tests__/run-report.test.ts` |
| pass | a runtime that throws each typed scope error is a failed task with that code and no 'runtime-threw:' prefix; any other error has no code (mutation: drop the class check) | `src/analyze/executor/__tests__/walker.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/executor/__tests__/walker.test.ts` | 0 | 24 | 0.8 s |  |
| `src/analyze/orchestrator/__tests__/run-report.test.ts` | 0 | 6 | 1 s |  |
| `src/analyze/orchestrator/__tests__/shaper-error-mapping.test.ts` | 0 | 7 | 0.8 s |  |

## t4

Run at 2026-10-09T05:51:37.184Z on commit `1603be22`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: a data task with a connection scope works on that connection only**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a data task with a connection scope works on that connection only | `src/analyze/runtimes/data/__tests__/data-runtimes.test.ts` |

**integration: a data task on an unregistered directory and on a manifest directory inside a registered repo opens its pool at that directory (mutation: open it at the containing repo)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a data task on an unregistered directory and on a manifest directory inside a registered repo opens its pool at that directory (mutation: open it at the containing repo) | `src/analyze/runtimes/data/__tests__/data-runtimes.test.ts` |

**integration: an infra task accepts its three kinds and refuses a file scope with the mismatch code; the connection-listing task gives the same result for a repo scope as before**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an infra task accepts its three kinds and refuses a file scope with the mismatch code; the connection-listing task gives the same result for a repo scope as before | `src/analyze/runtimes/infra/__tests__/infra-runtimes.test.ts` |
| pass | the connection-listing task gives the same result for a repo scope as before, its scopeRefValue parameter still takes precedence, and a kind outside the data row is refused with the mismatch code | `src/analyze/runtimes/data/__tests__/data-runtimes.test.ts` |

**unit: the infra and data scope functions are gone and no infra or data runtime uses the scope's value as a repo path**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the infra and data scope functions are gone and no infra or data runtime uses the scope's value as a repo path | `src/analyze/runtimes/__tests__/scope-sources.test.ts` |
| pass | the unrelated resolveRepoPath under src/mcp is untouched | `src/analyze/runtimes/__tests__/scope-sources.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/runtimes/__tests__/scope-sources.test.ts` | 0 | 2 | 0.4 s |  |
| `src/analyze/runtimes/data/__tests__/data-runtimes.test.ts` | 0 | 19 | 0.8 s |  |
| `src/analyze/runtimes/infra/__tests__/infra-runtimes.test.ts` | 0 | 24 | 1.4 s |  |

## t5

Run at 2026-10-09T06:23:32.912Z on commit `5726792b`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: a code task with a module scope uses only the entities under that directory, with a file scope only that file's, with a symbol scope the one entity**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a code task with a module scope uses only the entities under that directory, with a file scope only that file's, with a symbol scope the one entity | `src/analyze/runtimes/code/__tests__/scope-area.test.ts` |

**integration: the adherence check gives the same result for a repo scope as before, as a code, a data and an infra template, and as a data template on an unregistered directory is not refused**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the adherence check gives the same result for a repo scope as before, as a code, a data and an infra template, and as a data template on an unregistered directory is not refused | `src/analyze/runtimes/code/__tests__/scope-area.test.ts` |
| pass | an adherence check whose model call fails is recorded by the walk as a failed task | `src/analyze/runtimes/__tests__/dropped-or-failed.test.ts` |

**unit: the code family's scope function and its test hook are gone and no code runtime uses the scope's value as a repo path**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the code family's scope function and its test hook are gone and no code runtime uses the scope's value as a repo path | `src/analyze/runtimes/__tests__/scope-sources.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/runtimes/__tests__/dropped-or-failed.test.ts` | 0 | 3 | 0.9 s |  |
| `src/analyze/runtimes/__tests__/scope-sources.test.ts` | 0 | 3 | 0.4 s |  |
| `src/analyze/runtimes/code/__tests__/scope-area.test.ts` | 0 | 2 | 0.8 s |  |

## t6

Run at 2026-10-09T06:30:49.274Z on commit `214914ce`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: the docs tasks give the same result for a repo scope as before the change, and refuse a symbol scope with the mismatch code**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the docs tasks give the same result for a repo scope as before the change, and refuse a symbol scope with the mismatch code | `src/analyze/runtimes/docs/__tests__/docs-scope.test.ts` |

**integration: the family-summary task with a module scope keeps only the summaries of documents under that directory, and with a file scope only that file's**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the family-summary task with a module scope keeps only the summaries of documents under that directory, and with a file scope only that file's | `src/analyze/runtimes/docs/__tests__/docs-scope.test.ts` |

**unit: no docs runtime uses the scope's value as a repo path**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | no docs runtime uses the scope's value as a repo path | `src/analyze/runtimes/__tests__/scope-sources.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/runtimes/__tests__/scope-sources.test.ts` | 0 | 4 | 0.5 s |  |
| `src/analyze/runtimes/docs/__tests__/docs-scope.test.ts` | 0 | 2 | 1.1 s |  |

## t7

Run at 2026-10-09T06:37:15.408Z on commit `7d2ada00`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: a docs constraint task and a docs decision task with a module scope retrieve only sections under that directory and count within it; without an area the runners and the lookup pipeline's calls return what they did (mutation: drop the area at the hand-over from runner to prepare)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a docs constraint task and a docs decision task with a module scope retrieve only sections under that directory and count within it; without an area the runners and the lookup pipeline's calls return what they did (mutation: drop the area at the hand-over from runner to prepare) | `src/analyze/runtimes/docs/__tests__/docs-area-retrieval.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/runtimes/docs/__tests__/docs-area-retrieval.test.ts` | 0 | 1 | 1.4 s |  |

## t8

Run at 2026-10-09T06:50:14.917Z on commit `3dfa5044`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: a docs task with a module scope whose sections are not among the repository's nearest matches still gets them from the vector pass (mutation: search the whole repository and drop what lies outside)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a docs task with a module scope whose sections are not among the repository's nearest matches still gets them from the vector pass (mutation: search the whole repository and drop what lies outside) | `src/analyze/runtimes/docs/__tests__/docs-area-vector.test.ts` |

**integration: the vector search given an empty list of ids makes no query; given a large list it returns the nearest of them, in one query or in batches merged by distance; with no area the query is as before**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the vector search given an empty list of ids makes no query; given a large list it returns the nearest of them, in one query or in batches merged by distance; with no area the query is as before | `src/db/lance/__tests__/entity-vec.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/runtimes/docs/__tests__/docs-area-vector.test.ts` | 0 | 1 | 1 s |  |
| `src/db/lance/__tests__/entity-vec.test.ts` | 0 | 22 | 1.2 s |  |

## t9

Run at 2026-10-09T06:54:27.128Z on commit `10b075c0`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: the aggregator's prompt lists each absent input with its producer and reason after the outputs that exist, and is unchanged when nothing is absent**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the aggregator's prompt lists each absent input with its producer and reason after the outputs that exist, and is unchanged when nothing is absent | `src/analyze/runtimes/shared/__tests__/aggregator.test.ts` |

**integration: each of the five aggregate-report runtimes hands absentInputs to the aggregator**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | each of the five aggregate-report runtimes hands absentInputs to the aggregator | `src/analyze/runtimes/__tests__/aggregate-absent-inputs.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/runtimes/__tests__/aggregate-absent-inputs.test.ts` | 0 | 1 | 0.6 s |  |
| `src/analyze/runtimes/shared/__tests__/aggregator.test.ts` | 0 | 20 | 0.6 s |  |

## t10

Run at 2026-10-09T08:45:50.036Z on commit `7efc942b`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: a plan in which one of three producers failed has a final report written from the two that exist, with the third named as absent (mutation: skip the aggregate task as before)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a plan in which one of three producers failed has a final report written from the two that exist, with the third named as absent (mutation: skip the aggregate task as before) | `src/analyze/executor/__tests__/walker-aggregate.test.ts` |

**integration: a plan in which every producer failed has no final report; a task other than the aggregate task with a missing input is still skipped; an aggregate task that throws still fails the run**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a plan in which every producer failed has no final report; a task other than the aggregate task with a missing input is still skipped; an aggregate task that throws still fails the run | `src/analyze/executor/__tests__/walker-aggregate.test.ts` |

**integration: a plan whose aggregate task consumes nothing runs with and without a failed task before it (mutation: skip an aggregate task that consumes nothing)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a plan whose aggregate task consumes nothing runs with and without a failed task before it (mutation: skip an aggregate task that consumes nothing) | `src/analyze/executor/__tests__/walker-aggregate.test.ts` |

**integration: a nested plan in which one child task failed gives a root report, and the answer report names the child's task by its path**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a nested plan in which one child task failed gives a root report, and the answer report names the child's task by its path | `src/analyze/executor/__tests__/walker-aggregate.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/executor/__tests__/walker-aggregate.test.ts` | 0 | 4 | 0.9 s |  |
