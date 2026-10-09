<!-- insrc:artifact TESTS-b9d5c5c40df5a574-s8 -->

# Tests: b9d5c5c40df5a574 s8

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 24 pass, 0 fail, 0 skipped, 0 not found; 3 reported by the builder and not run by the gate.

## t1

Run at 2026-10-09T13:08:04.779Z on commit `75899025`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

**unit: sourceModulesOf returns one module per directory that directly holds a source file, none for a directory of artifacts only, and none for a directory whose source is all in sub-directories (mutation: count artifact files as source)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | sourceModulesOf returns one module per directory that directly holds a source file, none for a directory of artifacts only, and none for a directory whose source is all in sub-directories (mutation: count artifact files as source) | `src/analyze/runtimes/shared/__tests__/source-modules.test.ts` |

**unit: sourceModulesOf keeps a stored module entity with its id and lists no directory in or under its directory as a module of its own, also when the entity lies above the area and is not itself listed (mutation: test rule (b) against the area's entities only)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | sourceModulesOf keeps a stored module entity with its id and lists no directory in or under its directory as a module of its own, also when the entity lies above the area and is not itself listed (mutation: test rule (b) against the area's entities only) | `src/analyze/runtimes/shared/__tests__/source-modules.test.ts` |

**unit: sourceModulesOf names a module by its path relative to the repo, '.' for the repo's own directory, and does not take 'payments' for part of 'pay' (mutation: test the prefix without the slash)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | sourceModulesOf names a module by its path relative to the repo, '.' for the repo's own directory, and does not take 'payments' for part of 'pay' (mutation: test the prefix without the slash) | `src/analyze/runtimes/shared/__tests__/source-modules.test.ts` |

**unit: moduleOfDirectory reads an absolute path, a relative path, a trailing slash and '.' as the same directory, and moduleOfEntityId reads a stored module entity's id with neither a scope nor a repo's entities (mutation: treat every value as an entity id, as before)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | moduleOfDirectory reads an absolute path, a relative path, a trailing slash and '.' as the same directory, and moduleOfEntityId reads a stored module entity's id with neither a scope nor a repo's entities (mutation: treat every value as an entity id, as before) | `src/analyze/runtimes/shared/__tests__/source-modules.test.ts` |

**unit: moduleOfDirectory fails for a directory with no stored source under it, for one outside the repo, for one outside the scope's area and for a directory path under a file or symbol scope, and moduleOfEntityId for the id of an entity of another kind, each with its own message; a relative value with no known repo is joined to the scope's own directory**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | moduleOfDirectory fails for a directory with no stored source under it, for one outside the repo, for one outside the scope's area and for a directory path under a file or symbol scope, and moduleOfEntityId for the id of an entity of another kind, each with its own message; a relative value with no known repo is joined to the scope's own directory | `src/analyze/runtimes/shared/__tests__/source-modules.test.ts` |

**smoke: the baseline of the analyze suite and of the gated file is recorded in the Story's folder before the first source change**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S008/baseline/ (README.md, analyze.txt with 1077 result lines, deterministic-runtimes.gated.txt with 11), committed at 83b63484, the commit before the first source change 1ad06bb2.

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/runtimes/shared/__tests__/source-modules.test.ts` | 0 | 5 | 0.6 s |  |

## t2

Run at 2026-10-09T13:13:50.489Z on commit `5fdce3d2`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: on a graph with no module entity for the repository's directories, the module list returns the directories that hold source, and its record's rule says what a module is (mutation: keep only entities of kind 'module', as before)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | on a graph with no module entity for the repository's directories, the module list returns the directories that hold source, and its record's rule says what a module is (mutation: keep only entities of kind 'module', as before) | `src/analyze/runtimes/code/__tests__/module-directories.test.ts` |

**integration: the module list keeps a stored module entity with the fields it had and lists no directory in or under its directory; a file scope that names a module entity's own file returns that module; a run scoped under a stored module's directory lists none (mutation: make a directory module of the sub-directory)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the module list keeps a stored module entity with the fields it had and lists no directory in or under its directory; a file scope that names a module entity's own file returns that module; a run scoped under a stored module's directory lists none (mutation: make a directory module of the sub-directory) | `src/analyze/runtimes/code/__tests__/module-directories.test.ts` |
| pass | a code task with a module scope uses only the entities under that directory, with a file scope only that file's, with a symbol scope the one entity | `src/analyze/runtimes/code/__tests__/scope-area.test.ts` |

**integration: under a module scope the module list keeps to the area, and under a file scope on a source file and a symbol scope it is empty**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | under a module scope the module list keeps to the area, and under a file scope on a source file and a symbol scope it is empty | `src/analyze/runtimes/code/__tests__/module-directories.test.ts` |

**unit: the source scan asserts one read of the repo's entities kept whole in discovery-modules.ts and today's form in the tree and the entry-points runtimes (mutation: read the repo's entities a second time)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the source scan asserts one read of the repo's entities kept whole in discovery-modules.ts and today's form in the tree and the entry-points runtimes (mutation: read the repo's entities a second time) | `src/analyze/runtimes/__tests__/scope-sources.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/runtimes/__tests__/scope-sources.test.ts` | 0 | 5 | 0.4 s |  |
| `src/analyze/runtimes/code/__tests__/module-directories.test.ts` | 0 | 3 | 0.7 s |  |
| `src/analyze/runtimes/code/__tests__/scope-area.test.ts` | 0 | 2 | 0.9 s |  |

## t3

Run at 2026-10-09T13:22:16.899Z on commit `5ece4484`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: on the same graph the module tree has a node per source directory and an edge for an import between two directories, and none for an import inside one**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | on the same graph the module tree has a node per source directory and an edge for an import between two directories, and none for an import inside one | `src/analyze/runtimes/code/__tests__/module-directories.test.ts` |

**integration: with two stored module entities and source in a sub-directory of the first, the tree has the two nodes and the one edge between them with its count, and the sub-directory is not a node (mutation: make a directory module of the sub-directory)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | with two stored module entities and source in a sub-directory of the first, the tree has the two nodes and the one edge between them with its count, and the sub-directory is not a node (mutation: make a directory module of the sub-directory) | `src/analyze/runtimes/code/__tests__/module-directories.test.ts` |

**integration: under a module scope the tree keeps to the area, a file whose owning stored module lies above the area is left out, and under a file scope on a source file and a symbol scope the tree is empty**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | under a module scope the tree keeps to the area, a file whose owning stored module lies above the area is left out, and under a file scope on a source file and a symbol scope the tree is empty | `src/analyze/runtimes/code/__tests__/module-directories.test.ts` |
| pass | a code task with a module scope uses only the entities under that directory, with a file scope only that file's, with a symbol scope the one entity | `src/analyze/runtimes/code/__tests__/scope-area.test.ts` |

**unit: the source scan asserts the new form for structure-module-tree.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the source scan asserts one read of the repo's entities kept whole in discovery-modules.ts and today's form in the tree and the entry-points runtimes (mutation: read the repo's entities a second time) | `src/analyze/runtimes/__tests__/scope-sources.test.ts` |

**integration: the gated test of a repository with no module entity and one source file gives one node '.' and no edge**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a repository with no module entity and one source file gives one node '.' and no edge | `src/analyze/runtimes/code/__tests__/module-directories.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/runtimes/__tests__/scope-sources.test.ts` | 0 | 5 | 0.6 s |  |
| `src/analyze/runtimes/code/__tests__/module-directories.test.ts` | 0 | 7 | 3.5 s |  |
| `src/analyze/runtimes/code/__tests__/scope-area.test.ts` | 0 | 2 | 1.6 s |  |

## t4

Run at 2026-10-09T13:31:43.007Z on commit `ba4b5014`. Tests check: **passed**. 8 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: the functional-surface task given a directory path returns the exports and helpers of every source file under it, including sub-directories, and names the directory in its output (mutation: require a stored module entity, as before)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the functional-surface task given a directory path returns the exports and helpers of every source file under it, including sub-directories, and names the directory in its output (mutation: require a stored module entity, as before) | `src/analyze/runtimes/code/__tests__/module-directories.test.ts` |

**integration: the functional-surface task given a directory that holds source only in its sub-directories returns their surface**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the functional-surface task given a directory that holds source only in its sub-directories returns their surface | `src/analyze/runtimes/code/__tests__/module-directories.test.ts` |

**integration: the functional-surface task given a value that names nothing fails with a reason that says no stored source file lies under it, and the plan walk records the task as failed, not as an empty module**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the functional-surface task given a value that names nothing fails with a reason that says no stored source file lies under it, and the plan walk records the task as failed, not as an empty module | `src/analyze/runtimes/code/__tests__/module-directories.test.ts` |

**integration: a stored module entity's id returns the surface it returned before under every kind of scope and resolves no scope: with the scope function's readers set to throw the id still answers and a directory path fails (mutation: resolve the scope before the id is looked up)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a stored module entity's id returns the surface it returned before under every kind of scope and resolves no scope: with the scope function's readers set to throw the id still answers and a directory path fails (mutation: resolve the scope before the id is looked up) | `src/analyze/runtimes/code/__tests__/module-directories.test.ts` |

**integration: a functional-surface task that names a directory outside the area of a module scope is refused, and a directory path under a file scope or a symbol scope is refused (mutation: test a directory against the area with the entity predicate)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a functional-surface task that names a directory outside the area of a module scope is refused, and a directory path under a file scope or a symbol scope is refused (mutation: test a directory against the area with the entity predicate) | `src/analyze/runtimes/code/__tests__/module-directories.test.ts` |

**integration: a table test over every registered plan-task runtime still finds a completeness record on each result, with the functional-surface task given a directory path**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a table test over every registered plan-task runtime still finds a completeness record on each result, with the functional-surface task given a directory path | `src/analyze/runtimes/__tests__/completeness-all-runtimes.test.ts` |

**unit: the source scan asserts that surface-functional.ts resolves the run's scope through the one scope function for a directory path**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the source scan asserts that surface-functional.ts resolves the run's scope through the one scope function for a directory path | `src/analyze/runtimes/__tests__/scope-sources.test.ts` |

**integration: the gated test of an unknown module value fails with the message that no stored source file lies under it**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an unknown module value fails with the message that no stored source file lies under it | `src/analyze/runtimes/code/__tests__/module-directories.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/runtimes/__tests__/completeness-all-runtimes.test.ts` | 0 | 7 | 1.9 s |  |
| `src/analyze/runtimes/__tests__/scope-sources.test.ts` | 0 | 7 | 0.4 s |  |
| `src/analyze/runtimes/code/__tests__/module-directories.test.ts` | 0 | 13 | 2 s |  |

## t5

Run at 2026-10-09T13:39:55.182Z on commit `76fe7b55`. Tests check: **passed**. 0 pass, 0 fail, 0 skipped, 0 not found; 2 reported by the builder and not run by the gate.

the gate ran no test: every named test of this Task was reported by the builder

**live: a code request at size S on this repository returns a final report in which every functional-surface task succeeded and the module list is not empty**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S008/measurements/live-run-t5.md (run s8-live-code-S-mv10dmxn; frames, result, plan and the twelve task records under measurements/live/)

**smoke: no test of the analyze suite that passed before the Story's first change fails after its last, the gated file src/analyze/runtimes/code/__tests__/deterministic-runtimes.test.ts included, which is run whole with INSRC_LIVE_TESTS=1. Two of its tests change and are named: 'surface.functional: unknown module entity id -> throws' (the message for a value that names nothing) and 'structure.module-tree: repo with zero modules -> empty tree, not error' (one source file in the repo's own directory now gives one node '.' and no edge)**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S008/measurements/baseline-comparison-t5.md (result lines of every test under measurements/after/, baseline under baseline/)
