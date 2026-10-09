<!-- insrc:artifact PLAN-b9d5c5c40df5a574-s8 -->

# Plan: E20261009b9d5c5c4:S008

## Summary

**Epic:** `make-insrc-analysis-complete-used-right`
**LLD run:** `wf-1791542641489-vfpkwr`
**LLD effective hash:** `faa0f59939ce...`

The build adds one small file that says what a module is and how a module value is read, then moves the three code tasks to it one at a time, each with the tests that show a graph with no module entity now returns its source directories and a graph that holds module entities returns what it did. A baseline of the analyze suite is taken first and compared at the end. The last step is one live code request through the installed daemon, run only on the stakeholder's word.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** One definition of a module and the reading of a module value | M | — | unit: sourceModulesOf returns one module per directory that directly holds a source file, none for a directory of artifacts only, and none for a directory whose source is all in sub-directories (mutation: count artifact files as source); unit: sourceModulesOf keeps a stored module entity with its id and lists no directory in or under its directory as a module of its own, also when the entity lies above the area and is not itself listed (mutation: test rule (b) against the area's entities only); unit: sourceModulesOf names a module by its path relative to the repo, '.' for the repo's own directory, and does not take 'payments' for part of 'pay' (mutation: test the prefix without the slash); unit: moduleOfDirectory reads an absolute path, a relative path, a trailing slash and '.' as the same directory, and moduleOfEntityId reads a stored module entity's id with neither a scope nor a repo's entities (mutation: treat every value as an entity id, as before); unit: moduleOfDirectory fails for a directory with no stored source under it, for one outside the repo, for one outside the scope's area and for a directory path under a file or symbol scope, and moduleOfEntityId for the id of an entity of another kind, each with its own message; a relative value with no known repo is joined to the scope's own directory; smoke: the baseline of the analyze suite and of the gated file is recorded in the Story's folder before the first source change | [[c1]] [[c3]] [[c5]] [[c6]] |
| 2 | **`t2`** The module list returns the directories that hold source | M | `t1` | integration: on a graph with no module entity for the repository's directories, the module list returns the directories that hold source, and its record's rule says what a module is (mutation: keep only entities of kind 'module', as before); integration: the module list keeps a stored module entity with the fields it had and lists no directory in or under its directory; a file scope that names a module entity's own file returns that module; a run scoped under a stored module's directory lists none (mutation: make a directory module of the sub-directory); integration: under a module scope the module list keeps to the area, and under a file scope on a source file and a symbol scope it is empty; unit: the source scan asserts one read of the repo's entities kept whole in discovery-modules.ts and today's form in the tree and the entry-points runtimes (mutation: read the repo's entities a second time) | [[c1]] [[c4]] [[c7]] |
| 3 | **`t3`** The module tree is built from the same modules | M | `t1`, `t2` | integration: on the same graph the module tree has a node per source directory and an edge for an import between two directories, and none for an import inside one; integration: with two stored module entities and source in a sub-directory of the first, the tree has the two nodes and the one edge between them with its count, and the sub-directory is not a node (mutation: make a directory module of the sub-directory); integration: under a module scope the tree keeps to the area, a file whose owning stored module lies above the area is left out, and under a file scope on a source file and a symbol scope the tree is empty; unit: the source scan asserts the new form for structure-module-tree.ts; integration: the gated test of a repository with no module entity and one source file gives one node '.' and no edge | [[c2]] [[c4]] [[c7]] |
| 4 | **`t4`** The functional-surface task accepts a directory path | M | `t1`, `t2` | integration: the functional-surface task given a directory path returns the exports and helpers of every source file under it, including sub-directories, and names the directory in its output (mutation: require a stored module entity, as before); integration: the functional-surface task given a directory that holds source only in its sub-directories returns their surface; integration: the functional-surface task given a value that names nothing fails with a reason that says no stored source file lies under it, and the plan walk records the task as failed, not as an empty module; integration: a stored module entity's id returns the surface it returned before under every kind of scope and resolves no scope: with the scope function's readers set to throw the id still answers and a directory path fails (mutation: resolve the scope before the id is looked up); integration: a functional-surface task that names a directory outside the area of a module scope is refused, and a directory path under a file scope or a symbol scope is refused (mutation: test a directory against the area with the entity predicate); integration: a table test over every registered plan-task runtime still finds a completeness record on each result, with the functional-surface task given a directory path; unit: the source scan asserts that surface-functional.ts resolves the run's scope through the one scope function for a directory path; integration: the gated test of an unknown module value fails with the message that no stored source file lies under it | [[c3]] [[c4]] [[c5]] [[c7]] |
| 5 | **`t5`** The daemon guide, the suite comparison and the live check | S | `t2`, `t3`, `t4` | live: a code request at size S on this repository returns a final report in which every functional-surface task succeeded and the module list is not empty; smoke: no test of the analyze suite that passed before the Story's first change fails after its last, the gated file src/analyze/runtimes/code/__tests__/deterministic-runtimes.test.ts included, which is run whole with INSRC_LIVE_TESTS=1. Two of its tests change and are named: 'surface.functional: unknown module entity id -> throws' (the message for a value that names nothing) and 'structure.module-tree: repo with zero modules -> empty tree, not error' (one source file in the repo's own directory now gives one node '.' and no edge) | [[c6]] [[c7]] |

### 1.1 E20261009b9d5c5c4:S008:T001 — One definition of a module and the reading of a module value

Before any change, record the baseline: the result line of every top-level test of the analyze suite, run without the force-exit flag, and of the gated file src/analyze/runtimes/code/__tests__/deterministic-runtimes.test.ts run with INSRC_LIVE_TESTS=1, kept in the Story's folder. Then add a new file under src/analyze/runtimes/shared/ with sourceModulesOf, moduleOfEntityId and moduleOfDirectory and their types. sourceModulesOf takes the resolved scope, the area's entities and all the repo's stored module entities, and returns the modules of the area: the stored module entities the area contains, and every directory that directly holds a source file and lies in or under no stored module entity's directory; none of the second kind under a file or symbol scope. moduleOfEntityId looks a value up as an entity id through a lookup callback and needs no scope. moduleOfDirectory reads a directory path under a resolved scope. Nothing calls them yet.

**Acceptance checks:**
- The baseline is in the Story's folder before the first source change: the analyze suite's result lines and the gated file's, with the commit they were taken at
- A directory that directly holds a stored source file is a module; a directory of artifact files only, and one whose source is all in sub-directories, is not
- A stored module entity the area contains is kept with its id, and no directory in or under a stored module entity's directory is a module of its own, also when that entity lies above the area and is not itself listed
- A module is named by its path relative to the repo, '.' for the repo's own directory, and 'payments' is never taken for part of 'pay'
- Under a file scope and a symbol scope no directory is a module; a stored module entity the area contains is still returned
- moduleOfEntityId returns the module of a stored module entity's id, null for a value that is no entity's id, and throws today's message for an entity of another kind; it takes no scope and no entity list
- moduleOfDirectory reads an absolute path, a relative path, a trailing slash and '.' as the same directory, joins a relative value to graphRepoOf(scope) also when no repo is known, and refuses in this order with one message each: a file or symbol scope; a directory outside the repo or the scope's area; a directory with no stored source file under it
- The functions read no store and call no model

### 1.2 E20261009b9d5c5c4:S008:T002 — The module list returns the directories that hold source

Move code.discovery.modules to sourceModulesOf: one call of listEntitiesForRepo kept whole, the area's entities and the stored module entities both taken from it. Its records gain `directory` and `fileCount`, `entityId` becomes optional, and the completeness record's rule says what a module is. Correct the template's description in the planner's catalog. Rewrite the source scan (src/analyze/runtimes/__tests__/scope-sources.test.ts) so that each code runtime has its own expected form: the new form for discovery-modules.ts, today's form for structure-module-tree.ts and discovery-entrypoints.ts.

**Acceptance checks:**
- On a graph with no module entity for the repository's directories the list is the directories that directly hold a stored source file, sorted by directory, with no limit
- A stored module entity the area contains is returned with the fields it has today plus `directory` and `fileCount`, and no directory in or under its directory is listed
- Under a file scope on a source file and under a symbol scope the list is empty; a file scope that names a stored module entity's own file returns that module
- The completeness record keeps the basis 'graph' and its rule states what a module is and what a scope of one file or one symbol gives
- The runtime makes exactly one call of listEntitiesForRepo and uses its whole result only to pick the stored module entities; the source scan asserts this form for discovery-modules.ts and today's form for the tree and the entry-points runtimes, and passes
- The template's description says the directories of the scope that hold source files are returned
- The existing assertions of scope-area.test.ts on the module list hold unchanged

### 1.3 E20261009b9d5c5c4:S008:T003 — The module tree is built from the same modules

Move code.structure.module-tree to sourceModulesOf: one node per module of the area, each source file under the module with the longest directory that contains it, edges as today. A node's id is the entity's id for a stored module entity and the directory otherwise. Restate the completeness record's rule. In the source scan, move structure-module-tree.ts to the new form. Rewrite the gated test of a repository with no module.

**Acceptance checks:**
- On a graph with no module entity for the repository's directories the tree has a node per source directory, an edge with its count for imports between two directories, and none for an import inside one directory or to a file outside the area
- With two stored module entities, source in a sub-directory of the first and an import from that sub-directory to a file of the second, the tree has the two nodes and one edge from the first module to the second with its count, which is the result before this Story; the sub-directory is not a node
- A file whose owning stored module lies above the area is left out of the tree, and the record's rule says so
- Under a file scope on a source file and under a symbol scope the tree has no node and no edge
- A file whose imports cannot be read is named under `skipped`, as today
- The source scan asserts the new form for structure-module-tree.ts and passes
- The gated test 'structure.module-tree: repo with zero modules -> empty tree, not error' is rewritten to the new result (one node '.', no edge) and passes with INSRC_LIVE_TESTS=1
- The existing assertions of scope-area.test.ts on the tree hold unchanged

### 1.4 E20261009b9d5c5c4:S008:T004 — The functional-surface task accepts a directory path

Move code.surface.functional to the two reading functions: an entity id is read exactly as today, with no scope resolved and the entity's own repo read whole; any other value is a directory path under the run's resolved scope, read from the repo of that scope narrowed to its area. The output's module gains `directory` and its `entityId` becomes optional; the record's rule says the surface includes sub-directories. Describe the `module` parameter in the planner's catalog and correct the runtime's header comment. Add the source scan's assertion for this runtime and rewrite the gated test of an unknown id.

**Acceptance checks:**
- Given an absolute or a relative directory path the task returns the exports and internal helpers of every stored source file under it, at any depth, and names the directory in its output
- Given a directory that holds source only in its sub-directories it returns their surface
- Given a directory under which no stored source file lies it fails with a reason that says so and names the repo that was read; the plan walk records the task as failed, not as an empty module
- Given a directory outside the area of the run's scope, or a directory path under a file or symbol scope, it is refused with its own message
- Given a stored module entity's id it returns what it returned before this Story under every kind of scope, and resolves no scope: with the scope function's test readers set to throw, the id still returns its surface, and a directory path fails with the reader's error
- A source directory in which no function, method or class is stored returns an empty surface with a complete record
- The planner's catalog describes the three forms of the `module` value and the runtime's header comment no longer says it is an entity id only
- The source scan asserts that surface-functional.ts resolves `args.intent.scopeRef` through resolveTaskScope for the code family, and passes
- The gated test 'surface.functional: unknown module entity id -> throws' is rewritten to the new message and passes with INSRC_LIVE_TESTS=1
- The table test over every registered runtime still finds a completeness record on each result, with the functional-surface task also given a directory path

### 1.5 E20261009b9d5c5c4:S008:T005 — The daemon guide, the suite comparison and the live check

Add a subsection to docs/daemon.md, after 'The kinds of scope each family of tasks accepts', on what a module is for the code tasks: the definition, the three forms of the `module` value, and what a file or symbol scope gives. Compare the analyze suite by test name with the baseline of the first Task, and run the gated file deterministic-runtimes.test.ts whole. Then the live check: the push of the Story's commits, the update of the installed daemon and the run itself are each done only on the stakeholder's word; the run spends the stakeholder's model quota, is started detached from the session, and only after checking that no other session is running one. Record the result.

**Acceptance checks:**
- docs/daemon.md has the new subsection with the definition, the three forms of the value and the file and symbol scope rule
- No test of the analyze suite that passed in the baseline fails after the last Task; the two gated tests that change are named with their new result
- The gated file src/analyze/runtimes/code/__tests__/deterministic-runtimes.test.ts passes whole with INSRC_LIVE_TESTS=1
- Live: a code request at size S on this repository returns a final report in which every functional-surface task succeeded and the module list is not empty; its date and result are in the build record

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| sourceModulesOf returns one module per directory that directly holds a source file, none for a directory of artifacts only, and none for a directory whose source is all in sub-directories (mutation: count artifact files as source) | `t1` |
| sourceModulesOf keeps a stored module entity with its id and lists no directory in or under its directory as a module of its own, also when the entity lies above the area and is not itself listed (mutation: test rule (b) against the area's entities only) | `t1` |
| sourceModulesOf names a module by its path relative to the repo, '.' for the repo's own directory, and does not take 'payments' for part of 'pay' (mutation: test the prefix without the slash) | `t1` |
| moduleOfDirectory reads an absolute path, a relative path, a trailing slash and '.' as the same directory, and moduleOfEntityId reads a stored module entity's id with neither a scope nor a repo's entities (mutation: treat every value as an entity id, as before) | `t1` |
| moduleOfDirectory fails for a directory with no stored source under it, for one outside the repo, for one outside the scope's area and for a directory path under a file or symbol scope, and moduleOfEntityId for the id of an entity of another kind, each with its own message; a relative value with no known repo is joined to the scope's own directory | `t1` |
| the source scan over the code runtimes (src/analyze/runtimes/__tests__/scope-sources.test.ts) still holds for the two module tasks, and names the functional-surface task as resolving the run's scope through the one scope function for a directory path | `t2`, `t3`, `t4` |
| on a graph with no module entity for the repository's directories, the module list returns the directories that hold source, and its record's rule says what a module is (mutation: keep only entities of kind 'module', as before) | `t2` |
| on the same graph the module tree has a node per source directory and an edge for an import between two directories, and none for an import inside one | `t3` |
| the functional-surface task given a directory path returns the exports and helpers of every source file under it, including sub-directories, and names the directory in its output (mutation: require a stored module entity, as before) | `t4` |
| the functional-surface task given a directory that holds source only in its sub-directories returns their surface | `t4` |
| the functional-surface task given a value that names nothing fails with a reason that says no stored source file lies under it, and the plan walk records the task as failed, not as an empty module | `t4` |
| on a graph that holds stored module entities inside the repository, with source in a sub-directory of a stored module's directory, the three tasks return every record, node, edge and surface they return today; the entity's id is read as today under every kind of scope, also one that is refused or not indexed; a file scope that names a module entity's own file still returns that module; and a run scoped under a stored module's directory lists no directory module (mutation: make a directory module of the sub-directory) | `t2`, `t3`, `t4` |
| under a module scope the module list and the tree keep to the area and a functional-surface task that names a directory outside the area is refused; under a file scope and a symbol scope no directory is listed and a directory path is refused (mutation: test a directory against the area with the entity predicate) | `t2`, `t3`, `t4` |
| a table test over every registered plan-task runtime still finds a completeness record on each result, with the functional-surface task given a directory path | `t4` |
| a code request at size S on this repository returns a final report in which every functional-surface task succeeded and the module list is not empty | `t5` |
| no test of the analyze suite that passed before the Story's first change fails after its last, the gated file src/analyze/runtimes/code/__tests__/deterministic-runtimes.test.ts included, which is run whole with INSRC_LIVE_TESTS=1. Two of its tests change and are named: 'surface.functional: unknown module entity id -> throws' (the message for a value that names nothing) and 'structure.module-tree: repo with zero modules -> empty tree, not error' (one source file in the repo's own directory now gives one node '.' and no edge) | `t1`, `t5` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s8 section 2.1 code.discovery.modules`
- **[[c2]]** `prior-artifact` `LLD s8 section 2.2 code.structure.module-tree`
- **[[c3]]** `prior-artifact` `LLD s8 section 2.3 code.surface.functional`
- **[[c4]]** `prior-artifact` `LLD s8 section 3 data model changes`
- **[[c5]]** `prior-artifact` `LLD s8 section 4 error paths`
- **[[c6]]** `prior-artifact` `LLD s8 section 5 test strategy`
- **[[c7]]** `prior-artifact` `LLD s8 section 6 migration`
