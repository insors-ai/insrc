<!-- insrc:artifact PLAN-c2ba6fa62a148ed1-s8 -->

# Plan: E20261102c2ba6fa6:S008

## Summary

**Epic:** `complete-consistent-richer-code-index-one`
**LLD run:** `wf-1793609472505-f09fso`
**LLD effective hash:** `85da4a2df479...`

Building s8 adds a store module and schema step for two subsystem tables, a pure deterministic grouping of a repository's code files, and a queued summary-lane pass. The pass groups a graph-complete repository from its evidence-weighted relationships and writes cheap-tier summaries one at a time. The rest is wiring: the job kind and its triggers after a full index, settle and clean-up; a read-only index.subsystems request; and a serve-time subsystem block in the analyzer's context. It ends with a full sweep and a smoke on the installed daemon.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Subsystem tables and schema 8 | M | — | integration: subsystem tables and migration to schema 8 | [[c6]] [[c8]] [[c4]] |
| 2 | **`t2`** Group files into subsystems | M | — | unit: subsystem grouping | [[c2]] |
| 3 | **`t3`** Run the grouping pass over the stored graph | M | `t1`, `t2` | integration: subsystem pass over a stored graph | [[c3]] [[c9]] |
| 4 | **`t4`** Write subsystem summaries with the cheap-tier model | M | `t3` | integration: subsystem summaries through the cheap-tier provider | [[c3]] [[c9]] |
| 5 | **`t5`** Queue the pass when the graph is complete | M | `t4` | integration: subsystems job queued and run in the summary lane | [[c7]] |
| 6 | **`t6`** The index.subsystems request | S | `t1` | integration: index.subsystems through IndexerService | [[c1]] |
| 7 | **`t7`** Subsystem context in the analyzer | M | `t1` | integration: analyzer subsystem context | [[c5]] |
| 8 | **`t8`** Ship and smoke on the installed daemon | S | `t5`, `t6`, `t7` | smoke: installed daemon: subsystems | [[c10]] [[c11]] |

### 1.1 E20261102c2ba6fa6:S008:T001 — Subsystem tables and schema 8

A store module for subsystems: the 'subsystem' and 'subsystem_by_file' databases opened by MIGRATION_V7_TO_V8 (SCHEMA_VERSION 8). It provides a write that replaces a repository's set in one transaction, stamped computedAtGeneration and keeping the stored summary of an unchanged id, plus readSubsystems(repoPath, { files? }). The namespace-count and module-state guards are updated.

**Acceptance checks:**
- a v7 store opens at version 8 with the two databases and its existing rows unchanged; a fresh store has them
- writing a set replaces the previous set in one transaction, stamped with the generation; a subsystem whose id was stored keeps its summary
- readSubsystems returns all of a repository's subsystems, or those holding the given files, and nothing of another repository
- a write that fails part-way leaves the previous set intact (one transaction)

### 1.2 E20261102c2ba6fa6:S008:T002 — Group files into subsystems

groupSubsystems(graph): a pure, deterministic Louvain-style modularity grouping of a FileGraph into a partition. Nodes are visited in path order, ties go to the smaller group, there is no randomness, and passes aggregate until no move improves modularity. A subsystem's id is the sha256 of its sorted members (hex-32) and its name their longest common directory; connections are summed per pair with kind counts.

**Acceptance checks:**
- every file is in exactly one group
- the same graph gives the same groups, also with its edges shuffled
- two densely connected clusters joined by one weak edge become two groups; an unconnected file joins its directory's group through the 0.1 edge
- ids are the hash of sorted members and names the longest common directory

### 1.3 E20261102c2ba6fa6:S008:T003 — Run the grouping pass over the stored graph

runSubsystemPass(repoPath) without summaries. It does nothing unless graphComplete, and nothing when the stored computedAtGeneration equals the generation. It builds the FileGraph from stored cross-file IMPORTS/CALLS/INHERITS/IMPLEMENTS/REFERENCES between code entities of the repository, weighted by kind (inheritance 2, the rest 1) and evidence (extracted 1, inferred 0.8, unknown 0.6), plus 0.1 same-directory edges. It groups and writes the tables stamped with the generation read.

**Acceptance checks:**
- an incomplete graph: ran false, reason graph-incomplete, nothing written
- the stored set matches the stored relationships and their evidence weights; module stubs, endpoints and other repositories are not edges
- a second pass at the same generation does nothing (up-to-date); at a new generation it rewrites the set
- every code entity of the repository has exactly one subsystem through its file

### 1.4 E20261102c2ba6fa6:S008:T004 — Write subsystem summaries with the cheap-tier model

After the grouping, for each subsystem with summary null: one completeStructured call through buildSummariserProvider (tiers.cheap; injectable for tests), with a prompt from src/prompts of the name, member paths, their exported entity names and the connections. Calls are made one at a time, with a yield between them. A failure is logged and counted, and the summary stays null. Before each write the generation is re-read, and the loop stops if it advanced. The prompt lives under src/prompts and is loaded as the summariser's prompts are, so a built daemon ships it.

**Acceptance checks:**
- summaries are written only for new ids; an unchanged subsystem keeps its summary and causes no call
- never two model calls at once (a recording provider sees concurrency 1)
- a failing call leaves that summary null and the others written
- a generation advance during the loop stops further writes

### 1.5 E20261102c2ba6fa6:S008:T005 — Queue the pass when the graph is complete

The job kind { kind: 'subsystems'; repoPath } in the IndexJob union. Both isSummaryJob predicates (queue lane and summary-link) route it to the summary lane, the summary worker runs runSubsystemPass, and a queued job per repository is deduped. It is enqueued at the end of a full index, after a settle and after a clean-up when readIndexState(repoPath).graphComplete is true.

**Acceptance checks:**
- the job runs in the summary lane on the summary worker, and only while the index lane is idle
- a full index of a complete repository enqueues one subsystems job; an incomplete one does not
- a settle and a clean-up that leave the repository complete enqueue it; queued duplicates collapse to one

### 1.6 E20261102c2ba6fa6:S008:T006 — The index.subsystems request

A request 'index.subsystems' { repoPath } classed 'indexing'. It returns generation, computedAtGeneration, graphComplete, stale, the note ('the groups rest on an incomplete graph' / 'the groups rest on an older graph' / 'not grouped yet') and the subsystems with files, entity counts, summaries and connections; an unregistered repository gets { error }. The method-class and handler-runtime lists are updated.

**Acceptance checks:**
- a complete, grouped repository returns its subsystems, each with its connections, and every code entity in exactly one (ac1)
- an incomplete graph returns the note 'the groups rest on an incomplete graph' (ac5); an older generation is reported stale
- the request is classed for the code-indexing worker

### 1.7 E20261102c2ba6fa6:S008:T007 — Subsystem context in the analyzer

withSubsystemContext wraps runShaper's result on every return path (cache hit, pipeline, legacy), after any cache read or write, and is never cached. It appends to the structure layer a code-written 'Subsystems' block for the subsystems holding a code file under the scope path or a file the bundle cites as path:line: name, summary, connections and member paths, followed by the staleness or incompleteness note. Without stored subsystems or a repository, the bundle is unchanged.

**Acceptance checks:**
- a request about one module names its subsystem, summary and connections, each a stored row (ac3)
- existing layer text is kept; the cache never holds the block, and a pass completed after caching shows on the next serve
- no stored subsystems or no repository: the bundle is unchanged
- only files with a stored subsystem_by_file row select a subsystem; other path-like text is ignored

### 1.8 E20261102c2ba6fa6:S008:T008 — Ship and smoke on the installed daemon

Run the full sweep once, update the installed daemon, index this repository, let the pass run, request index.subsystems, and build one analyzer context.

**Acceptance checks:**
- the full sweep shows no failure caused by this Story
- on the installed daemon the repository has subsystems with summaries, and one analyzer context names a subsystem (recorded)

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| subsystem grouping | `t2` |
| subsystem pass over a stored graph | `t1`, `t3`, `t4`, `t5` |
| index.subsystems through IndexerService | `t6` |
| analyzer subsystem context | `t7` |
| installed daemon: subsystems | `t8` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s8 contract: index.subsystems request`
- **[[c2]]** `prior-artifact` `LLD s8 contract: groupSubsystems`
- **[[c3]]** `prior-artifact` `LLD s8 contract: runSubsystemPass`
- **[[c4]]** `prior-artifact` `LLD s8 contract: readSubsystems`
- **[[c5]]** `prior-artifact` `LLD s8 contract: withSubsystemContext`
- **[[c6]]** `prior-artifact` `LLD s8 contract: MIGRATION_V7_TO_V8`
- **[[c7]]** `prior-artifact` `LLD s8 contract: IndexJob.subsystems`
- **[[c8]]** `prior-artifact` `LLD s8 data model: subsystem and subsystem_by_file tables, SCHEMA_VERSION 8`
- **[[c9]]** `prior-artifact` `LLD s8 error paths`
- **[[c10]]** `prior-artifact` `LLD s8 test strategy`
- **[[c11]]** `prior-artifact` `LLD s8 migration`
