<!-- insrc:artifact DEF-c2ba6fa62a148ed1 -->

# Epic: complete-consistent-richer-code-index-one

## Summary

**Flavor:** enhancement

Answers about a codebase are only as good as the index behind them. This Epic makes the index complete (no relationship is lost, nothing is left out that the repository did not ask to leave out, and a repository that is incomplete says so), consistent (a file's refresh either happens in full or not at all, and the daemon stays healthy while it works), and richer (each relationship says how it was found, related code is grouped into subsystems with summaries, Rust, C#, C and C++ are read, SQL is read in its structure where today it is stored as one whole document, and relationships between documents are recorded). It brings five filed issues under one design, so the changes they share are made once.

## Contents

1. [Problem](#1-problem)
2. [Functional requirements](#2-functional-requirements)
3. [Non-goals](#3-non-goals)
4. [Assumptions](#4-assumptions)
5. [Constraints](#5-constraints)
6. [Stories](#6-stories)
7. [References](#7-references)
8. [Feedback](#8-feedback)

## 1. Problem

The code index cannot be trusted to be complete or consistent, and it records less than it could. Relationships between files are lost while a repository is indexed and are never restored, yet the repository reports itself ready and answers are returned as plain facts with nothing to say they may be partial [[c4]]. A single file's refresh is a series of separate removals and writes, so an error or a crash part-way leaves the file with no entities, or with entities and no relationships [[c2]]. Reading the entities of one file or one repository passes over every stored row [[c5]], the daemon's store can be broken under it by another process, after which it cannot be stopped [[c12]], and the code that reads the index's state reports a scope the index does not hold as the largest size and lets a failed read of the last-indexed time escape as an unexplained error [[c13]] [[c14]]. What the index leaves out is decided twice, by two rules that disagree: a full walk follows the repository's own ignore files, and then a separate list of bare names is applied to every part of every path, so a source directory that the repository does not ignore can be hidden, a rule meant for the top level applies at every depth, later edits to the ignore files never reach the list, and a file event is checked against the list alone [[c16]] [[c17]] [[c18]]. Beyond these defects, a stored relationship carries no record of how it was established [[c1]], the index holds no grouping of related code into subsystems, and it reads the structure of only six programming languages (TypeScript with JavaScript, Python, Go, Java, Scala and Kotlin), stores an SQL file only as one whole document, and records no relationships between documents. These have been found and filed one at a time, with overlapping changes to the same store and the same refresh path, and no single statement of what a correct index is.

## 2. Functional requirements

- **E20261011c2ba6fa6:FR001** — Every relationship the indexer establishes between two indexed entities is stored, whatever order the files were indexed in. _(ISSUE-12f70133: edges to not-yet-stored targets are dropped.)_
- **E20261011c2ba6fa6:FR002** — An index that already lost relationships can be repaired without the user deleting and re-adding the repository. _(A reindex skips unchanged files today.)_
- **E20261011c2ba6fa6:FR003** — A repository whose graph is known to be incomplete does not report itself as fully ready, and a relationship that cannot be written is surfaced. _(Silent partial answers are the accuracy failure.)_
- **E20261011c2ba6fa6:FR004** — The refresh of one file is all-or-nothing in the graph store, and a refresh interrupted before its vectors are written is detected and completed.
- **E20261011c2ba6fa6:FR005** — The entities of one file, and of one repository, are read at a cost that grows with what is returned, and an existing store gains this without a user re-index. _(ISSUE-61045de9.)_
- **E20261011c2ba6fa6:FR006** — The daemon's store is not broken by another process, and the daemon always stops when asked, a failed store included. _(ISSUE-0d577569.)_
- **E20261011c2ba6fa6:FR007** — A request whose scope the index does not hold is refused without first being announced as the largest size, and every failure to read the index's state is a named cause. _(ISSUE-a6940f8a and ISSUE-e2bcadd9.)_
- **E20261011c2ba6fa6:FR008** — What the index leaves out is decided by one rule, taken from the repository's ignore files at every level of its tree, and applied the same way to a full walk and to a single file event.
- **E20261011c2ba6fa6:FR009** — A repository added without an ignore file at its root is given one, with entries that fit the project.
- **E20261011c2ba6fa6:FR010** — Every stored relationship records how it was established: read directly from the source, inferred by resolution, or chosen among several candidates.
- **E20261011c2ba6fa6:FR011** — The index groups related code into subsystems, and the analyzer's context includes a summary of each relevant subsystem and the connections between subsystems.
- **E20261011c2ba6fa6:FR012** — The index reads the structure of Rust, C#, SQL, C and C++ files in addition to today's six languages; an SQL file is stored today only as one whole document.
- **E20261011c2ba6fa6:FR013** — The index records relationships between documents; a relationship a model proposed is marked as such and is used only when measured quality meets the stated bar.

**s1:**

- **E20261011c2ba6fa6:S001:FR001** — A relationship whose target has not been indexed yet is kept and completed once the target exists.
- **E20261011c2ba6fa6:S001:FR002** — A reindex removes everything the index holds for the repository, in the graph store and in the vector store, and builds it again from every file; it is the one command for this, and there is no separate repair.
- **E20261011c2ba6fa6:S001:FR003** — A call that reaches a function through a re-exporting file is linked to that function.
- **E20261011c2ba6fa6:S001:FR004** — A repository whose graph is known to be incomplete does not report itself as fully ready, and a relationship that cannot be written is surfaced rather than skipped silently.

**s2:**

- **E20261011c2ba6fa6:S002:FR001** — The removal of a file's old entities, relationships and pending relationships and the writing of its new ones take effect together in the graph store.
- **E20261011c2ba6fa6:S002:FR002** — A refresh that fails before it completes leaves the file's previous entities and relationships readable.
- **E20261011c2ba6fa6:S002:FR003** — A refresh whose vectors were not written after the graph store was updated is detected and completed without the user asking.

**s3:**

- **E20261011c2ba6fa6:S003:FR001** — The entities of one file, and of one repository, are read without passing over the rows of other files and other repositories.
- **E20261011c2ba6fa6:S003:FR002** — Whether a repository holds any stored entity is answered without building the repository's entities.
- **E20261011c2ba6fa6:S003:FR003** — A store already on disk gains this when the daemon opens it, without the user re-indexing.

**s4:**

- **E20261011c2ba6fa6:S004:FR001** — No other process's opening or closing of a store takes the daemon's locks away: the live store is opened by the daemon alone.
- **E20261011c2ba6fa6:S004:FR002** — When a store operation fails, the daemon still stops when asked.
- **E20261011c2ba6fa6:S004:FR003** — A store failure of this kind is reported with its cause where the user looks for daemon status.

**s5:**

- **E20261011c2ba6fa6:S005:FR001** — A request whose scope will be refused is refused before it is announced with a size, or its announcement makes plain that its size could not be counted.
- **E20261011c2ba6fa6:S005:FR002** — A failure to read a repository's last-indexed time, or a failure inside a lookup, is one of the named causes of not proceeding.
- **E20261011c2ba6fa6:S005:FR003** — The remaining defects recorded in ISSUE-e2bcadd9 are closed as that issue states them.
- **E20261011c2ba6fa6:S005:FR004** — While a repository is being indexed or reindexed, a search or analyze request about it is refused with a named error that states the indexing state; no partial answer is returned. Only that repository is offline: requests about other repositories are answered as usual.

**s6:**

- **E20261011c2ba6fa6:S006:FR001** — A file is left out of the index when, and only when, git's ignore sources leave it out and git does not track it, with two named exceptions that are left out everywhere: a generated or minified file, and anything in the daemon's own .insrc directory.
- **E20261011c2ba6fa6:S006:FR002** — Ignore files in subdirectories are honoured, each for its own directory and below.
- **E20261011c2ba6fa6:S006:FR003** — A full walk, a single file event and the watcher apply the same rule.
- **E20261011c2ba6fa6:S006:FR004** — A change to an ignore file takes effect without the repository being removed and added again: newly ignored files leave the index and newly included files enter it.
- **E20261011c2ba6fa6:S006:FR005** — A repository added with no ignore file at its root is given one whose entries fit the project, proposed by a model that has looked at the repository.
- **E20261011c2ba6fa6:S006:FR006** — An ignore file that already exists is never changed.
- **E20261011c2ba6fa6:S006:FR007** — A folder that is not under version control is filtered by the same ignore files.

**s7:**

- **E20261011c2ba6fa6:S007:FR001** — Each stored relationship records whether it was read directly from the source, inferred by resolution, or chosen among several candidates.
- **E20261011c2ba6fa6:S007:FR002** — The record is returned with the relationship wherever relationships are read.
- **E20261011c2ba6fa6:S007:FR003** — A relationship stored before this change reads as of unknown origin until its file is next refreshed.

**s8:**

- **E20261011c2ba6fa6:S008:FR001** — Each indexed repository's code is grouped into subsystems from its stored relationships.
- **E20261011c2ba6fa6:S008:FR002** — Each subsystem has a summary and a list of its connections to other subsystems.
- **E20261011c2ba6fa6:S008:FR003** — The analyzer's context for a request includes the summaries of the subsystems the request touches.
- **E20261011c2ba6fa6:S008:FR004** — Grouping is repeatable: the same graph gives the same groups.
- **E20261011c2ba6fa6:S008:FR005** — Subsystem summaries are written by the local model.

**s9:**

- **E20261011c2ba6fa6:S009:FR001** — Files in Rust, C#, C and C++ produce entities and relationships of the same kinds as the languages read today.
- **E20261011c2ba6fa6:S009:FR002** — SQL files produce entities for the objects they define and relationships for the objects they refer to, where today an SQL file is stored as one whole document.
- **E20261011c2ba6fa6:S009:FR003** — A language whose reader cannot be loaded on a machine is skipped with a stated reason, and the other languages are unaffected.
- **E20261011c2ba6fa6:S009:FR004** — The languages the index reads are listed where the user can see them.

**s10:**

- **E20261011c2ba6fa6:S010:FR001** — Relationships between documents, and between a document and the code it describes, are stored.
- **E20261011c2ba6fa6:S010:FR002** — A relationship a model proposed is marked as such, apart from one read directly from a link or a reference in the text.
- **E20261011c2ba6fa6:S010:FR003** — Model-proposed relationships are extracted by the mid-tier model.
- **E20261011c2ba6fa6:S010:FR004** — Model-proposed relationships are used only when at least 95% of those proposed are right and at least 60% of the real ones are found, on at least 100 hand-checked links.
- **E20261011c2ba6fa6:S010:FR005** — Only new or changed documents are sent to the model.

**s11:**

- **E20261011c2ba6fa6:S011:FR001** — The temporary allowance for the MCP server's process to open the live store is removed with this Story.

## 3. Non-goals

- **Replacing LMDB or LanceDB, or adopting Graphify as a dependency or as the index.** — The comparison found additions to the ingestion and context layers; none requires a different store.
- **Exposing a graph query language.** — The project rule is a typed traversal API only.
- **Calling a cloud model service directly from the daemon.** — Model access beyond the local provider goes through the installed CLI providers only.
- **Sources of exclusion rules other than git's own ignore sources.** — The stakeholder limited the filter to those sources for now; the filter leaves room for other sources later but this Epic delivers none.
- **Changing an ignore file that already exists in a repository.** — The repository's own file is the user's statement of what to leave out; the daemon only creates one where none exists at the root.
- **The analyzer's own planning and report defects (Epic b9d5c5c40df5a574).** — That Epic owns the analyzer above the index; this Epic takes only the defects in how the index's state is read.
- **New entity and relation kinds for external services (Epic 914cbf5ea9026b92).** — Owned by that Epic; this Epic must not renumber the kinds it added.
- **Languages beyond Rust, C#, SQL, C and C++, and extraction from images, audio or video.** — The stakeholder named these languages for now; the rest is outside the ask.
- **Keeping the embedding model loaded during indexing.** — Checked on current code: every embedding call already asks for the model to stay loaded, so there is nothing to change.

## 4. Assumptions

- `high` Fixing the lost relationships first changes the graph that grouping and summaries are computed from, so enrichment built before it would be built on a wrong graph. [[c4]]
- `med` The unused whole-file replacement in the store is a sound base for an all-or-nothing refresh. It replaces a file's entities and removes the relationships of the entities it replaces, in one transaction; it does not write the file's new relationships and does not touch the unresolved queue, so it must be extended to both. [[c3]]
- `med` The store's edge rows can carry a value without changing their keys, so evidence can be added to existing stores by a migration. [[c1]]
- `med` The local model can propose a usable ignore file for a project and usable subsystem summaries; where it cannot, a plain fallback is acceptable. [[c11]]
- `med` The mid-tier model can reach 95% right and 60% found on document relationships; this is not known until it is measured. [[c11]]
- `high` The mid-tier model is reached through a CLI provider on the user's own session, so extracting document relationships spends that session's quota. [[c19]]

## 5. Constraints

| ID | Type | Text | Source |
| :--- | :--- | :--- | :--- |
| `k1` | stakeholder | Accuracy is chosen over cost: a slower index that is complete is preferred to a fast one that loses relationships. | [[c6]] |
| `k2` | invariant | Only the daemon opens the stores; every new read or write is reached through the daemon. | [[c7]] |
| `k3` | invariant | No direct cloud REST calls: a model is reached through the local provider or through the installed CLI providers. | [[c8]] |
| `k4` | convention | Calls that reach a model provider are made one after another, never in parallel. | [[c9]] |
| `k5` | contract | The store has a schema version; a change to what is stored comes with a migration applied when the daemon opens the store, without a user re-index. | [[c10]] |
| `k6` | contract | Entity and relation kinds are stored as fixed byte values; existing values are never renumbered. | [[c11]] |
| `k7` | stakeholder | The Stories that make the index complete and consistent are delivered before the Stories that enrich it. | [[c11]] |
| `k8` | stakeholder | Each absorbed issue keeps its identity: its Story names it, and the issue is marked as consolidated into this Epic rather than closed unfixed. | [[c11]] |
| `k9` | stakeholder | The proposal of an ignore file and the subsystem summaries use the local model, meaning the tier named cheap, which the local Ollama provider serves by default; the extraction of document relationships uses the mid-tier model; embeddings stay local. | [[c11]] |
| `k10` | stakeholder | Model-proposed document relationships are used only when at least 95% of those proposed are right and at least 60% of the real ones are found, measured on at least 100 hand-checked links. | [[c11]] |
| `k11` | stakeholder | The exclusion rule comes from git's own ignore sources only: the repository's .gitignore files, including those in subdirectories, each applying to its own directory and below, the clone's exclude file and the user's global ignore file. A file that git tracks is indexed even when a rule matches it. Two built-in exclusions stand beside git's sources and apply at every place that selects files: generated or minified files, and the daemon's own .insrc directory. | [[c11]] |

## 6. Stories

### 6.1 E20261011c2ba6fa6:S001 — No relationship between indexed files is lost, and a damaged index can be repaired (ISSUE-12f70133)

**User value:** `size: L`

Someone asking what calls or imports a piece of code gets every caller and importer the source contains, and a repository that cannot give that says so instead of answering with a partial count.

**Extends:** [[c15]]

**Acceptance criteria:**

- **ac1:** Given a repository in which a file that sorts earlier imports and calls into a file that sorts later, when the repository is indexed in full for the first time, then the import and the call are both stored, and asking for the callers of the later file's function returns the earlier file's call site. _(operationalizes `k1`)_
- **ac2:** Given this repository with an index that has already lost cross-file relationships, when a reindex of the repository is requested, without removing it, then the callers of runGrepSearch are 4, as the issue's reproduction expects, and the callers of one function that this repository reaches only through a re-exporting file, named in the Story's design with its count from a text search, match that count. _(operationalizes `k1`, `k8`)_
- **ac3:** Given a function that is reached only through a file that re-exports it, when the callers of that function are requested, then the call sites that go through the re-exporting file are returned. _(operationalizes `k1`)_
- **ac4:** Given a repository in which some relationships could not be written or remain unresolved after indexing, when the repository's status is read, then a completeness field shown wherever the status is shown says the graph is incomplete and gives the count, so the repository does not read as fully ready. _(operationalizes `k1`)_

**Local constraints:**

- `lc1` (stakeholder) This Story absorbs ISSUE-12f70133491114c9 in full, including its reproduction figures as the acceptance measure, except the figure for pickScope, a function since removed from the source. [[c4]]

### 6.2 E20261011c2ba6fa6:S002 — Refreshing one file happens in full or not at all

**User value:** `size: L`

A file being re-indexed never disappears from answers, and a failure or a crash during a refresh leaves the file as it was before, not half-written.

**Depends on:** `s1`

**Extends:** [[c15]]

**Acceptance criteria:**

- **ac1:** Given an indexed file and a refresh of it that fails after its content is parsed, when the file's entities and relationships are read afterwards, then they are the ones stored before the refresh began. _(operationalizes `k1`)_
- **ac2:** Given an indexed file whose refresh is in progress, when another request reads the file's entities during the refresh, then it sees either the complete old set or the complete new set, never an empty or partial set. _(operationalizes `k1`, `k2`)_
- **ac3:** Given a refresh that updated the graph store but whose vector write failed, when the daemon next starts or the repository is next checked, then the missing vectors are found and written, and the repository is not reported as fully ready until they are. _(operationalizes `k1`)_
- **ac4:** Given a file deleted from disk, when the deletion is indexed, then its entities, relationships and pending relationships are removed together. _(operationalizes `k1`)_

**Local constraints:**

- `lc1` (convention) The store already holds a whole-file replacement that nothing calls; the refresh builds on it rather than adding a second one. [[c3]]

### 6.3 E20261011c2ba6fa6:S003 — Reading one file's or one repository's entities does not pass over the whole store (ISSUE-61045de9)

**User value:** `size: M`

Requests about one file or one repository stay fast as more repositories are indexed, because their cost follows what they return.

**Acceptance criteria:**

- **ac1:** Given two indexed repositories, one much larger than the other, when the entities of one file of the smaller repository are read, then the read examines only that file's rows, and returns the same entities as before. _(operationalizes `k1`)_
- **ac2:** Given a store written before this change, when the daemon opens it, then the store is brought to the new form once, the reads work without a re-index, and a second open does no further work. _(operationalizes `k5`)_
- **ac3:** Given entities written, replaced and deleted for a file, when the file's entities are read after each change, then the result matches a full scan of the store every time. _(operationalizes `k1`, `k5`)_
- **ac4:** Given a repository with stored entities and one with none, when the scope check asks whether each holds any entity, then it answers yes and no without reading the repository's entities. _(operationalizes `k1`)_

**Local constraints:**

- `lc1` (stakeholder) This Story absorbs ISSUE-61045de91faef1a0 in full; the two reads return what they return today and their callers do not change. [[c5]]

### 6.4 E20261011c2ba6fa6:S004 — The daemon's store is not broken by another process, and the daemon always stops (ISSUE-0d577569)

**User value:** `size: M`

The daemon keeps running through long indexing and many requests, and when something does go wrong in the store it can still be stopped and restarted normally.

**Acceptance criteria:**

- **ac1:** Given a running daemon, and another process that tries to open the live store, when that process opens and closes a store and the daemon then writes, then the other process is refused the live store, and the daemon's write succeeds. _(operationalizes `k1`, `k2`)_
- **ac2:** Given a daemon in which a store operation has failed, when the daemon is asked to stop, then it stops within its normal stop time and can be started again without manual clean-up. _(operationalizes `k2`)_
- **ac3:** Given a store operation that fails because the store's locks were taken away, when the daemon's status is read, then the failure and its true cause are stated, not the library's message about a system limit. _(operationalizes `k1`)_

**Local constraints:**

- `lc1` (stakeholder) This Story absorbs ISSUE-0d577569 in full; that issue is already approved and its statement of the symptoms stands. Its cause, which the issue records as not established, was reproduced on 2026-10-11: not the system's semaphore limit, which the library's message names, but the loss of the daemon's own file lock on the store's lock file, after which another process that opens and closes the store removes the store's semaphores. [[c12]]

### 6.5 E20261011c2ba6fa6:S005 — Reads of the index's state give a named, truthful answer (ISSUE-a6940f8a, ISSUE-e2bcadd9)

**User value:** `size: M`

A request about code the index does not hold is refused for that reason, and never looks like a very large request or an unexplained internal error, and a request made while the repository is being indexed is told so instead of being answered from a half-built index.

**Acceptance criteria:**

- **ac1:** Given a request whose scope the index does not hold, when the request is run, then no event announces it as the largest size, and it is refused with the same code and message as today. _(operationalizes `k1`)_
- **ac2:** Given a read of a repository's last-indexed time that throws, when a context is being built for a request, then the request ends with a named cause and its own error code, not an internal error. _(operationalizes `k1`)_
- **ac3:** Given each of the four reproductions in ISSUE-e2bcadd9, when it is run, then the expected result that issue states is observed. _(operationalizes `k8`)_
- **ac4:** Given a repository whose index or reindex is in progress, or ended in an error before it completed, when a search request or an analyze request about that repository is made, then the request is refused with a named error and its own code that says the repository is being indexed and how far the run has got, and no partial result is returned. _(operationalizes `k1`, `k2`)_

**Local constraints:**

- `lc1` (stakeholder) This Story absorbs ISSUE-a6940f8a and all four defects of ISSUE-e2bcadd9; a refused request keeps the code and message it has today. [[c13]]

### 6.6 E20261011c2ba6fa6:S006 — One rule decides what the index leaves out, taken from the repository's ignore files

**User value:** `size: L`

The index holds exactly the files the repository does not ask to leave out: no source directory goes missing because of its name, an edit to an ignore file takes effect, and a repository that had no ignore file gets a sensible one when it is added.

**Extends:** [[c15]]

**Acceptance criteria:**

- **ac1:** Given a repository whose ignore file leaves out a top-level directory by an anchored rule, and which has a source directory of the same name deeper in its tree, when the repository is indexed, then the deeper directory's files are indexed and the top-level one's are not. _(operationalizes `k1`, `k11`)_
- **ac2:** Given a repository with a tracked source directory whose name is on today's built-in list of names but is not left out by any ignore file, when the repository is indexed, then that directory's files are indexed. _(operationalizes `k1`, `k11`)_
- **ac3:** Given a repository with an ignore file in a subdirectory that leaves out files under it, when the repository is indexed and when one of those files is later changed, then the files are left out both times, and files of the same name elsewhere in the tree are indexed. _(operationalizes `k11`)_
- **ac4:** Given a file left out by a pattern rule in an ignore file, when a change to that file arrives as a single file event, then the file is not indexed. _(operationalizes `k1`, `k11`)_
- **ac5:** Given an indexed repository, when a rule is added to one of its ignore files and another is removed, then the files the new rule covers leave the index and the files the removed rule covered enter it, without re-adding the repository. _(operationalizes `k1`)_
- **ac6:** Given a repository with no ignore file at its root, when it is added, then an ignore file is created at its root with entries that fit the project's languages and tools, proposed by the local model, before the first index runs. _(operationalizes `k3`, `k9`)_
- **ac7:** Given a repository with no ignore file at its root and a model call that fails, when it is added, then the repository is still added, a plain ignore file is written, and the result says the fallback was used. _(operationalizes `k1`)_
- **ac8:** Given a repository that already has an ignore file at its root, when it is added or indexed, then the file is byte-for-byte unchanged. _(operationalizes `k11`)_
- **ac9:** Given a folder that is not under version control and has ignore files at its root and in a subdirectory, when it is indexed, then the files its ignore files leave out are left out, as untracked files would be under version control. _(operationalizes `k11`)_

**Local constraints:**

- `lc1` (invariant) The separate list of bare names stops deciding what is left out; a repository that carries such a list from an earlier registration is not left with two rules. [[c16]]
- `lc2` (invariant) A failure of the model call that proposes an ignore file does not fail the adding of the repository; a plain ignore file is written instead and the fallback is stated. [[c11]]
- `lc3` (stakeholder) The filter is built so that a source of rules other than ignore files can be added later; this Story adds none. [[c11]]

### 6.7 E20261011c2ba6fa6:S007 — Every stored relationship says how it was established

**User value:** `size: M`

A reader of an answer can tell a relationship read straight from the source from one the indexer inferred or chose among candidates, and weigh it accordingly.

**Depends on:** `s1`, `s2`

**Extends:** [[c15]]

**Acceptance criteria:**

- **ac1:** Given a file with a call to a function in the same file and a call resolved across files, when the file is indexed and its relationships are read, then the first is marked as read from the source and the second as inferred. _(operationalizes `k1`)_
- **ac2:** Given a call that matches several candidate targets, when the relationship is read, then it is kept as pending with its candidates and reported as ambiguous, no target is guessed, and the value 'chosen among candidates' is reserved for a choosing rule that this Epic does not add. _(operationalizes `k1`)_
- **ac3:** Given a store written before this change, when the daemon opens it and a relationship is read, then the relationship is returned and marked as of unknown origin, with no re-index required. _(operationalizes `k5`, `k6`)_
- **ac4:** Given an analyzer answer that lists callers, when some of the listed callers rest on inferred or chosen relationships, then the answer says which. _(operationalizes `k1`)_

**Local constraints:**

- `lc1` (invariant) Relationships stored before this change are not presented as if their origin were known. [[c1]]

### 6.8 E20261011c2ba6fa6:S008 — The index groups related code into subsystems and the analyzer's context summarises them

**User value:** `size: L`

A question about an area of the code comes back with the subsystem it belongs to, what that subsystem does and what it connects to, not only a list of files.

**Depends on:** `s1`, `s7`

**Acceptance criteria:**

- **ac1:** Given a fully indexed repository, when its subsystems are requested through the daemon, then every code entity belongs to exactly one subsystem and each subsystem lists its connections to the others. _(operationalizes `k2`)_
- **ac2:** Given the same stored graph, when grouping is run twice, then the groups are the same. _(operationalizes `k1`)_
- **ac3:** Given a request about one module, when the analyzer builds its context, then the context names the subsystem the module belongs to, its summary and its connections, each traceable to stored entities. _(operationalizes `k1`)_
- **ac4:** Given subsystem summaries being written, when the model calls are made, then they go to the local model, one at a time. _(operationalizes `k3`, `k4`, `k9`)_
- **ac5:** Given a repository whose graph is reported incomplete, when its subsystems are requested, then the answer says the groups rest on an incomplete graph. _(operationalizes `k1`)_

**Local constraints:**

- `lc1` (invariant) Groups are computed from the stored graph only after it is complete; a repository whose graph is incomplete has no groups presented as settled. [[c4]]

### 6.9 E20261011c2ba6fa6:S009 — The index reads Rust, C#, SQL, C and C++

**User value:** `size: XL`

Repositories written in Rust, C#, SQL, C or C++ become answerable, with the same kinds of entities and relationships as the languages read today.

**Depends on:** `s2`

**Acceptance criteria:**

- **ac1:** Given a repository with files in Rust, C#, C and C++, when it is indexed, then for each of those languages its functions, types and files are stored as entities and its imports or includes and its calls as relationships. _(operationalizes `k1`, `k6`)_
- **ac2:** Given a repository with SQL files that define tables and views and refer to other tables, when it is indexed, then each defined object is stored as an entity and each reference to another object as a relationship. _(operationalizes `k1`, `k6`)_
- **ac3:** Given a machine on which the reader for one of the added languages cannot be loaded, when the daemon starts and indexes a mixed repository, then that language's files are skipped with a stated reason and every other language is indexed. _(operationalizes `k1`)_
- **ac4:** Given the set of languages the index reads, when a user asks for it through the daemon, then Rust, C#, SQL, C and C++ are listed with the six read today. _(operationalizes `k2`)_

**Local constraints:**

- `lc1` (stakeholder) The languages are those the stakeholder named: Rust, C#, SQL, C and C++. Each can be delivered and checked on its own. [[c11]]

### 6.10 E20261011c2ba6fa6:S010 — The index records relationships between documents, admitted only at a measured quality

**User value:** `size: L`

A question about a design or a rule finds the documents that bear on it through what they say about each other, and the reader can see which links a model proposed.

**Depends on:** `s7`

**Acceptance criteria:**

- **ac1:** Given two documents where one links to or names the other, when they are indexed, then the relationship is stored and marked as read from the source, with no model call. _(operationalizes `k1`)_
- **ac2:** Given a hand-checked set of at least 100 document relationships for this repository, when the mid-tier model's proposals are compared with it, then the share that are right and the share that are found are recorded, and the capability is on only if the first is at least 95% and the second at least 60%. _(operationalizes `k1`, `k10`)_
- **ac3:** Given model-proposed relationships that are stored, when they are read or used in an answer, then each is marked as proposed by a model. _(operationalizes `k1`)_
- **ac4:** Given documents being examined by a model, when the indexing run makes its model calls, then the calls go to the mid-tier model through a CLI provider, one at a time. _(operationalizes `k3`, `k4`, `k9`)_
- **ac5:** Given an indexed repository in which one document has changed, when it is indexed again, then only that document is sent to the model. _(operationalizes `k1`)_
- **ac6:** Given a machine with no CLI provider signed in, when a repository is indexed, then indexing completes, relationships read from the source are stored, and the status says model-proposed document relationships were not extracted and why. _(operationalizes `k1`, `k3`)_

**Local constraints:**

- `lc1` (stakeholder) If the measured quality does not meet the bar the capability stays off and the measured figures are recorded. [[c11]]
- `lc2` (invariant) Model extraction spends the user's CLI session quota, so it runs only for documents that are new or changed, and indexing completes without it when no CLI provider is available. [[c19]]

### 6.11 E20261011c2ba6fa6:S011 — The step tools run inside the daemon, and the MCP server opens no store

**User value:**

An analysis, a workflow step, a review or a triage asked for from a client session is carried out by the daemon, so no client session's process ever holds the live store open, and a run in progress is not lost when the session's MCP server process restarts.

**Acceptance criteria:**

- **ac1:** Given a client session and a running daemon, when an analyze step, a workflow step, a build step, a review step, a code-review step or a triage step is called from the session, then the step's lookups and its reads and writes of the store happen in the daemon, the result returned to the session is the same as before, and the MCP server's process holds no descriptor on the live store.
- **ac2:** Given a multi-turn run that has received its first reply, when the session's MCP server process exits and a new one starts before the next turn, then the next turn is accepted with the state token from the first reply and the run continues.
- **ac3:** Given a client session and no running daemon, or a daemon that does not know the request, when a step tool is called, then the call returns a named error that says the daemon is not reachable or is too old, and nothing is read from the store by the MCP server's process.
- **ac4:** Given the source tree after this change, when the files under the MCP server's directory and everything they import outside the daemon's request client are scanned, then none of them opens the graph store or the vector store.
- **ac5:** Given a step that needs the client's own model to answer a prompt, when the daemon returns that prompt, then the prompt, the schema and the state token reach the client unchanged, and the reasoning still happens in the session, as it does today.
- **ac6:** Given the temporary allowance that Story s4 gives the MCP server's process to open the live store (the permitted-reader declaration and its one call), when this Story is delivered, then the declaration and its call are deleted from the source, the MCP server's process is refused the live store like any other process that is not the daemon, and a test fails if the declaration is found anywhere in the source. _(operationalizes `k2`)_
- **ac7:** Given a process that is not the daemon (a test, a script, a client session's MCP server or any tool), when it asks to open the live vector store (the ~/.insrc/lance directory, reached directly, by a relative path or through a symbolic link), then it is refused with a named error before the directory is created or connected, while a temporary path set for a test opens as before, so only the daemon ever opens the live vector store, as Story s4 made true of the graph store. _(operationalizes `k2`)_

**Local constraints:**

- `lc1` (stakeholder) Removing the temporary allowance is part of this Story and not optional: by the stakeholder's decision of 2026-10-11 the allowance exists only until this Story lands, and Story s4's first acceptance criterion is met in full only when it is gone. [[c11]]

## 7. References

- **[[c1]]** `code` `src/db/relations.ts` — "s.outEdge.put(encodeOutEdgeKey(fromU64, kindByte, toU64), Buffer.alloc(0));"
- **[[c2]]** `code` `src/indexer/index.ts` — "await deleteRelationsForFile(this.db, filePath);"
- **[[c3]]** `code` `src/db/entities.ts` — "export async function reindexFile("
- **[[c4]]** `prior-artifact` `docs/standalone/bug-code-graph-missing-most-cross-E2026100712f70133/ISSUE.md` — "A resolved edge is silently dropped when its target is not stored yet."
- **[[c5]]** `prior-artifact` `docs/standalone/graph-store-has-no-index-entities-E2026101061045de9/ISSUE.md` — "The graph store keeps entity rows keyed by a numeric id and has no index by repository or by file."
- **[[c6]]** `doc` `CLAUDE.md` — "Accuracy is primary; cost is the least priority."
- **[[c7]]** `doc` `CLAUDE.md` — "Daemon owns all DB access"
- **[[c8]]** `doc` `CLAUDE.md` — "No direct cloud REST calls from our process."
- **[[c9]]** `doc` `CLAUDE.md` — "always serial `for...of` with sequential awaits."
- **[[c10]]** `code` `src/db/graph/store.ts` — "export const SCHEMA_VERSION = 4;"
- **[[c11]]** `stakeholder` `The stakeholder's request and decisions of 2026-10-10 and 2026-10-11: one Epic consolidating the indexing issues, the non-atomic refresh and three capabilities from the Graphify comparison; one exclusion filter from .gitignore files only, nested files honoured, a missing one created at repo add by an agent call on the local model; languages Rust, C#, SQL, C/C++; document relationships on the mid model at 95% right and 60% found; subsystem summaries on the local model.`
- **[[c12]]** `prior-artifact` `docs/standalone/defect-installed-daemon-runs-out-lmdb-E202610100d577569/ISSUE.md`
- **[[c13]]** `prior-artifact` `docs/standalone/request-whose-scope-cannot-counted-announced-E20261010a6940f8a/ISSUE.md`
- **[[c14]]** `prior-artifact` `docs/standalone/bug-four-defects-left-code-review-E20261007e2bcadd9/ISSUE.md`
- **[[c15]]** `analyze-bundle` `s1 analyze bundle (how-does-it-work): the per-file refresh, the store write helpers, 0 callers of reindexFile, no community detection, empty edge values`
- **[[c16]]** `code` `src/indexer/index.ts` — "return relative(repoPath, file).split(sep).some(seg => ignoreSet.has(seg));"
- **[[c17]]** `code` `src/indexer/index.ts` — "['ls-files', '--cached', '--others', '--exclude-standard', '-z'],"
- **[[c18]]** `code` `src/indexer/repo-ignore-config.ts` — "return existing.ignore;   // respect a user-authored / prior config"
- **[[c19]]** `doc` `docs/daemon.md` — "{ "runner": "cli-claude", "model": "sonnet" }"

## 8. Feedback

- **Subho Ghosh** (2026-10-11T05:34:54.178Z) `comment` — `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/DEF.md`: Resolution of the daemon review of 2026-10-11 (block: 0 HIGH, 20 MED, 17 LOW), made after that review and not re-reviewed. CORRECTED in the definition (4): (1) languages: SQL files are already indexed, as one whole-file document (src/indexer/parser/artifact.ts), so the problem, FR012 and Story s9 now say SQL moves from a whole document to its structure, and the summary no longer says "four more languages"; (2) the assumption on reindexFile: it also removes the relationships of the entities it replaces (detachDeleteEntitiesInTxn, src/db/entities.ts) and does not write new relationships or touch the unresolved queue; (3) k9 names the local model as the tier named cheap, served by Ollama by default (docs/daemon.md:382); (4) the file-event check is at src/indexer/index.ts:766 and the watcher is src/indexer/watcher.ts, not src/daemon/watcher.ts (the definition cites neither path wrongly; noted for the design stage). VERIFIED BY HAND (16), each left unfinished by the review because its searches stop at 50 matches: reindexFile has no caller outside src/db/entities.ts:363; a reindex skips a file whose stored hash is unchanged unless cleanFirst (src/indexer/index.ts:1004-1008); the quoted sentences of ISSUE-12f70133 (root cause 1, reproduction steps 1-2, the re-export gap) and of ISSUE-61045de9 are in those files; ISSUE-0d577569 carries approvedAt 2026-10-10T12:01:29.521Z; CLAUDE.md:122 and :135 hold the two quoted rules; the non-git walker (walkFilesLegacy) filters by the name list only; RelationKind has no member the indexer emits between documents (REFERENCES is declared and never emitted under src/indexer); the Story dependency edges and the constraint ids were checked by the define checklist step. NOT read by hand: the body of the daemon shutdown path (finding on s4) and the migration-on-open code (finding on k5); both rest on the filed issues and are for the design stage to confirm.
- **Subho Ghosh** (2026-10-11T07:31:05.256Z) `comment` — `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/DEF.md`: Amended after approval, on the stakeholder's decisions of 2026-10-11 made while the high-level design was reviewed. (1) k11 and Story s6: the filter honours all three of git's ignore sources (.gitignore files, the clone's exclude file, the global ignore file); a file git tracks is indexed even when a rule matches; two built-in exclusions apply everywhere (generated or minified files, the daemon's own .insrc directory); a plain folder is filtered by the rules alone (ac9 reworded). (2) Story s1: the pickScope figure is removed from ac2 because that function no longer exists in the source, and the Story's design names the re-export case instead; ac4 says completeness is a field shown beside the status, whose four values are kept. (3) Story s7 ac2: an ambiguous call stays pending with its candidates and is reported apart; the value "chosen among candidates" is reserved. These amendments were not re-reviewed as a definition.
- **Subho Ghosh** (2026-10-11T07:43:12.977Z) `comment` — `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/DEF.md`: Amended after approval, 2026-10-11, on the stakeholder's decision: reindex is the one command and indexes every file from scratch, whether or not its content has changed; there is no separate repair. Today repo.reindex skips every file whose stored content hash is unchanged (src/indexer/index.ts:628 and :1004-1008). Not re-reviewed. Open for the stakeholder to confirm: unchanged text with an unchanged embedding model keeps its vector.
- **Subho Ghosh** (2026-10-11T07:46:08.673Z) `comment` — `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/DEF.md`: Clarified by the stakeholder, 2026-10-11: a reindex calls the delete operations on the graph store and the vector store for the repository and builds everything again, vectors and document summaries included. This supersedes the earlier note that unchanged text keeps its vector. Not re-reviewed.
- **Subho Ghosh** (2026-10-11T07:53:00.814Z) `comment` — `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/DEF.md`: Amended after approval, 2026-10-11, on the stakeholder's decision: while a repository is being indexed or reindexed, search and analyze requests about it return a named error that states the indexing state, and no partial answer. Carried by Story s5 (a new requirement and acceptance criterion ac4 in the definition). Not re-reviewed.
- **Subho Ghosh** (2026-10-11T07:56:39.209Z) `comment` — `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/DEF.md`: Stakeholder decision, 2026-10-11: a reindex is queued at once, for a request and for the migration alike; only the repository being reindexed is offline, from the start of its own run until that run completes, and other repositories are answered as usual. Not re-reviewed.
- **Subho Ghosh** (2026-10-11T08:16:16.230Z) `comment` — `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/DEF.md`: Amended after approval, 2026-10-11, on the stakeholder's decision: Story s4 is reworded to the cause reproduced that day. The failure is not the semaphore limit: the daemon loses its file lock on the lock file when another descriptor on it is closed in-process, and another process that opens and closes the store then removes the semaphores. The title, the first and third criteria and the first requirement of s4 now speak of the store not being broken by another process. Not re-reviewed.
- **Subho Ghosh** (2026-10-11T09:27:55.689Z) `comment` — `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/DEF.md`: Stakeholder decision, 2026-10-11: the temporary allowance that lets the MCP server open the live store until Story s11 is kept, and its removal is a required part of Story s11 (a new acceptance criterion ac6, requirement and local constraint on s11 in the definition).
- **Subho Ghosh** (2026-10-12T11:20:36.148Z) `comment` — `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/DEF.md`: Amended 2026-10-12 by the stakeholder's decision at the start of the plan for Story s11: s11 gains acceptance criterion ac7, that only the daemon opens the live vector store (~/.insrc/lance) and any other process is refused before the directory is created or connected. It records decision D4 of the s11 design (the vector store gets the owner rule Story s4 gave the graph store), which went beyond s11's six criteria; the stakeholder chose to amend the definition now rather than after the build.
