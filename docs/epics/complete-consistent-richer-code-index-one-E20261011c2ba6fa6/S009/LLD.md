<!-- insrc:artifact LLD-c2ba6fa62a148ed1-s9 -->

# LLD: E20261101c2ba6fa6:S009

## Summary

**Epic:** `complete-consistent-richer-code-index-one`
**HLD base run:** `wf-1791697214822-7bombm`
**HLD effective hash:** `85da4a2df479...`

The index learns to read Rust, C#, C and C++ code and to read SQL as structure: each language gets its own reader in the existing registry, loaded defensively so a grammar that cannot load on a machine skips only that language, with the reason kept. Code files yield the same entities (files, functions, methods, types) and relationships (includes and imports, calls, inheritance) as the languages read today; SQL files keep their whole-file document and add a table or view entity per definition with references to the tables they use. A daemon request lists every language the index reads and why any is skipped.

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
10. [Open questions](#10-open-questions)

## 1. HLD context

> See **HLD-c2ba6fa62a148ed1** § 2. Framework summary

**Rollout phase:** Phase D — evidence and more languages
**Consumes:** `sc2` (FileCommit)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The rule that a relationship with an absent target becomes pending instead of being skipped, at each of the six places in src/db/relations.ts where one is lost today (the resolved write's skip on a missing endpoint and its skip on a kind with no byte, promoteToResolved, promoteResolvedBatch, and the pending write's discard of a row without its file or repository and of a row whose repository is not registered), each either kept as pending or counted as unwritable with a reason; the set of files whose parse or commit failed in a full index, persisted with their paths until they next commit; which fields of the state are recounted on open and which are persisted and carried over; the classification of a pending relationship as awaiting-target, ambiguous or no-candidate, with the external-service rows classed apart and the two endpoint passes counted in when a full index is finished; the class is stored on the pending row itself, in its existing free-form record, so no stored form changes, a row the cross-file pass has not yet attempted counts as awaiting-target, and the recount on open reads the stored class and does not run resolution again; the extension of the cross-file pass to complete relationships awaiting a target by id, for imports and the other code-symbol kinds as well as calls and inheritance, and to follow a re-exporting file to the function it re-exports; the lookup of pending rows by the id they await, with its migration step, and the pass after a file event visiting the rows that await an entity of the files just committed; the change of the reindex request so that it deletes the repository's rows in the graph store and the vector store and builds them again from every file, in place of today's skip of unchanged files, with no separate repair request, returning to pending the relationships that other repositories hold into the deleted entities, and its queuing by the migration for every repository indexed before this change, which starts as not complete; the storing of the repository entity so that the manifest step's dependency relationships are written; the measurement on this repository, before and after a repair, of the awaiting-target, ambiguous, no-candidate and unwritable counts, with unwritable expected to be zero; the IndexState row, its migration step, its recount on open, and the derivation of repository status from it, as a completeness field returned beside the unchanged status by the daemon's status and stats requests and shown in the CLI's repository pane and in both editor plugins; and the analyzer's read of it: an analyzer lookup that reads relationships of a repository that is not complete says so in its result, with the counts, so that an answer over an incomplete graph is not returned as a plain fact. The choice, in this Story's design, of the function reached only through a re-exporting file that the repair is measured on, since the issue's own example (pickScope) has been removed from the source. Raising the log level of a refused relationship from debug is internal. Until Story s2 lands, s1 applies its rule inside the existing separate writes. — owns `sc1`
- `s2`: The extension of the existing whole-file replacement into the file commit (relationships and pending rows in the same transaction as entities; outgoing relationships of surviving entities replaced, not only those of entities that disappeared; incoming relationships of a removed entity returned to pending), the move of the indexer's refresh and delete paths and of the clean-up pass's removal of a stored file onto it, and the retirement of the separate delete-then-upsert sequence in the indexer. The handling of vectors after the commit: writing the entity row with its embedding marker empty and setting it in a second transaction only after the vector write succeeds, counting an entity with an empty marker in IndexState, comparing entity ids with the vector table on open in both directions, so that a vector left behind by a failed removal is deleted before a plain insert can meet it, and the extension of the existing reembed job to run on daemon start and after an index, with a vector write for an entity whose marker is empty made an upsert, except for an entity first allocated in the same commit, which keeps the plain insert. Three things in that job change with it: it applies the embed step's own selection instead of forcing every entity, so empty-body entities (external endpoints, module stubs) stay unselected and uncounted; its update of an embedding writes the vector first and sets the marker in a second transaction, where today it sets the marker first; and the marker carries the model of the backend that is active, not one fixed name. Which entities count as unembedded (those the embed step selects) and the separate recorded reason when the embedding backend is unavailable. The count of a file whose commit fails on a file event. The queue rule that index jobs go ahead of other jobs and that a long job yields between its units, so that a commit is not held behind a model pass. How a reader sees the old or the new set during a commit is the store's ordinary transaction isolation and needs no new mechanism. — owns `sc2`
- `s3`: The by-file and by-repository index of entity rows, its migration step that builds it for an existing store, and its upkeep. No single entity-row write exists today: there are seven raw put and remove sites across src/db/entities.ts and src/db/graph/migrations.ts, and the existing name index is kept in step by a helper each site must remember to call. This Story introduces one put and one remove function for entity rows that maintain the name index and the new index together, routes every raw site through them, and adds a test that fails when a raw put or remove appears outside them. Upkeep therefore sits beneath every caller, so that neither today's writers nor the file commit need to know of it and this Story does not depend on s2. The two reads (findEntitiesByFile, listEntitiesForRepo) keep their results and their callers; a new existence check answers whether a repository holds any entity, and the analyzer's scope check uses it.
- `s4`: The cause, which ISSUE-0d577569 records as not known, was reproduced on 2026-10-11 and is not the system's semaphore limit, which the library's message names, but the loss of the daemon's own file lock on the store's lock file, after which another process that opens and closes the store removes the store's semaphores; the daemon's next write then fails with the library's message about the limit, and its exit hangs in the library's close. What in the daemon closes a second descriptor on the lock file is not yet identified. First, therefore, the remedy that does not depend on finding it: the live store is opened by the daemon alone, and any other process is refused it. Second, a bound on the whole shutdown including the store's close, so that a close that hangs ends in an exit. Third, recording a store failure of this kind and stating it in the daemon's status. None of this is consumed by another Story.
- `s5`: The refusal, with a named error and its own code, of a search or analyze request about a repository whose status is indexing, at the analyzer's scope check and at the daemon's search requests, carrying the status and how far the run has got (files done of files selected, and when it began), read from the indexer's running job; the tools that rest on the analyzer (the workflow steps, triage, code review) pass that error on as it is. The order of the analyzer's run: the refusal of a scope the index does not hold comes before a size is announced, or the announcement says the size could not be counted. The named cause and error code for a failed read of the last-indexed time and for a failed lookup, and the three other defects of ISSUE-e2bcadd9 (the wrong provider named, the scope resolved before the cache, and failure text matched inside echoed output). This Story does not read IndexState: it works with the checks the analyzer has today, so that it stays independent of s1.
- `s6`: The in-process matcher of the gitignore grammar over nested ignore files and its conformance test against git; the move onto the one filter of every site that reads the list today in src/indexer/index.ts (the full walk, the start-up scan for changed files, the file event, the clean-up pass, and the two places that seed the list when a repository is registered), of the watcher, and of the analyzer's reader, its two exploration walkers and its infra walker (src/analyze/runtimes/infra/_shared.ts), each of which has its own list of names today, and of the indexer's source-root detection (src/indexer/source-roots.ts), whose own list would otherwise hide a package in a directory the filter includes; a search of the source for such lists found five more, in the daemon's four file-search tools (glob, grep, list-dir, recent under src/daemon/tools/builtins/search) and in the review probe (src/workflow/review/probe.ts), which search the working tree as text, do not decide what the index holds, and are deliberately left as they are; the filter keeps answering for a directory that holds an included file, as the analyzer's reader does now; the retirement of the bare-name list and of the ignore entry in the repository's .insrc config; the two built-in exclusions (generated or minified files, the .insrc directory) applied inside the filter so that the full walk and the file event no longer differ on them; the handling of a change to an ignore file as an event that removes and adds files, and the comparison by content hash of the clone's exclude file and the global ignore file, which the watcher cannot see, whenever the filter is used; the queued step that proposes a root ignore file with the cheap-tier model when a repository is added without one, its fallback, and the rule that an existing file is never written. Two points were decided by the stakeholder: the filter honours all three of git's ignore sources (the .gitignore files, the clone's exclude file, the user's global ignore file), and a file git tracks is indexed even when a rule matches it, so the filter takes git's list of tracked files as an input and a plain folder is filtered by the rules alone. — owns `sc4`
- `s7`: The one-byte encoding of evidence as the value of a relationship row; the points in the per-file resolver and the cross-file pass that decide 'extracted' or 'inferred' ('chosen' is reserved and not written, since an ambiguous relationship stays pending with its candidates); the passing of evidence as an argument to the store's resolved write and promote operations, so that the two endpoint passes write 'inferred' and the manifest step writes 'extracted' and no relationship written after this change reads 'unknown'; the carrying of evidence through the store's traversal reads and the daemon's caller and callee requests; the marking of inferred and chosen relationships in the analyzer's lookups and answers. No migration rewrites existing rows, since an empty value reads as 'unknown'. — owns `sc3`
- `s8`: The grouping of a complete repository's code entities into subsystems, its determinism, the tables for membership, connections and summaries and their migration step; the queued pass and its trigger on a new generation; the cheap-tier summary of a subsystem whose membership changed; the daemon request that returns subsystems; the addition of subsystem context to the analyzer's context builder; the statement that groups rest on an incomplete or older graph. Which relationships count toward grouping, and with what weight by evidence, is decided here.
- `s10`: The reading of links and references between documents, and from a document to code, as relationships of the existing REFERENCES kind written in the file commit with evidence 'extracted'; the queued mid-tier pass over new or changed documents and its own table of model-proposed relationships; the hand-checked set, the measurement, and the recorded figures that switch the capability on or leave it off; the merging of model-proposed relationships into reads with evidence 'model'; the status line when no CLI provider is available.
- `s11`: Private implementation of s11: The step tools run inside the daemon, and the MCP server opens no store
- `s12`: Private implementation of s12: Every supported parser records the calls its code makes, and calls resolve within a package
- `s13`: Private implementation of s13: Settling file changes does work proportional to the changed files, never a scan of the repository or the store

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `registerParser`

```typescript
function registerParser(parser: CodeParser): void; function registerUnavailableReader(language: Language, extensions: readonly string[], reason: string): void
```

**Parameters:**
- `parser: CodeParser` — a reader whose grammar loaded (unchanged)
- `reason: string` — the load error of a reader that could not be loaded, kept for the languages request

**Returns:** `void` — the registry (src/indexer/parser/registry.ts) also records readers that failed to load

**Preconditions:**
- called once per language module at import

**Postconditions:**
- a skipped language appears in the languages request with its reason; getParser never returns a reader for it

### 2.2 `getParser`

```typescript
function getParser(filePath: string): CodeParser | null
```

**Returns:** `CodeParser | null` — unchanged; '.sql' now resolves to the SQL reader (the artifact reader no longer lists '.sql'), and .rs, .cs, .c, .h, .cc, .cpp, .cxx, .hpp, .hh, .hxx resolve to the new readers

**Postconditions:**
- the indexer's supported set (supportedExtensions) includes the new extensions only for readers that loaded

### 2.3 `Language`

```typescript
type Language = ... | 'rust' | 'csharp' | 'c' | 'cpp' | 'sql' | ...
```

**Returns:** `type` — four values appended; 'sql' already present, now also a code-structure language

**Postconditions:**
- EXT_TO_LANG in src/indexer/resolver.ts maps the new extensions

### 2.4 `ENTITY_KIND_BYTE`

```typescript
const ENTITY_KIND_BYTE = { ..., externalEndpoint: 13, table: 14, view: 15 } as const
```

**Returns:** `const` — two slots appended (never renumbered); EntityKind gains 'table' | 'view'; SCHEMA_VERSION is bumped as the table's rule requires

**Postconditions:**
- existing rows decode unchanged

### 2.5 `SHARED_MODULES_NAMESPACE_BY_LANG`

```typescript
type SharedModulesNamespace = 'jvm' | 'npm' | 'python' | 'go' | 'cargo' | 'nuget' | 'native'; SHARED_MODULES_REPO_ID.cargo = 0xFFFFFFFA; .nuget = 0xFFFFFFF9; .native = 0xFFFFFFF8; SHARED_MODULES_NAMESPACE_BY_LANG += { rust: 'cargo', csharp: 'nuget', c: 'native', cpp: 'native' }
```

**Returns:** `const` — three namespaces with the next reserved ids, below which WORKSPACE_REPO_ID_MAX (0xFFFFFFF0) stays; their rows are provisioned by the forward-only migration step

**Postconditions:**
- a module stub of rust/csharp/c/cpp is stored under its namespace row instead of being refused

### 2.6 `resolveImportPath`

```typescript
function resolveImportPath(fromFile: string, specifier: string, repo: string, language: Language): string | null
```

**Returns:** `string | null` — EXTENSION_MAP gains candidates for rust (a `mod x;` -> x.rs | x/mod.rs beside the declaring file) and c/cpp (a quoted include is the path itself, relative to the including file); C# has no relative imports

**Postconditions:**
- a resolved include or mod is an IMPORTS to the file entity, evidence 'extracted' (s7)

### 2.7 `resolveRelations`

```typescript
function resolveRelations(relations: Relation[], filePath: string, repo: string, entities?: Entity[]): Relation[]
```

**Returns:** `Relation[]` — unchanged; same-file CALLS of the new languages resolve by name, relative imports through resolveImportPath

### 2.8 `system.info`

```typescript
IPC 'index.languages' {} -> { languages: Array<{ language: Language; extensions: string[]; available: boolean; reason?: string }> }
```

**Returns:** `object` — a new request beside system.info, answered by the code-indexing worker (method class 'indexing') from its registry: every code and SQL language, its extensions, whether its reader loaded, and the load error when not (ac4)

**Postconditions:**
- lists python, go, typescript, javascript, java, scala, kotlin, rust, csharp, c, cpp and sql

## 3. Data model changes

### 3.1 `Rust / C# / C / C++ readers` — new

Four modules beside src/indexer/parser/kotlin.ts, each a CodeParser registered behind the guarded createRequire load of tree-sitter and its grammar (tree-sitter-rust 0.24.0, tree-sitter-c-sharp 0.23.1 -- 0.23.5 is ESM with top-level await and cannot be required --, tree-sitter-c 0.24.1, tree-sitter-cpp 0.23.4, all probed under tree-sitter 0.25 / Node 22). Entities: file; function (free functions, Rust fn, C/C++ function definitions); method (functions in a Rust impl/trait, C#/C++ class members); class (C# class/record/struct, C++ class/struct with members, Rust struct/enum/union), interface (C# interface, Rust trait), type (C typedef/struct/enum/union, C# enum/delegate); module stubs for external imports. Relationships: DEFINES/CONTAINS (file and type to member), IMPORTS (Rust mod/use crate paths and C/C++ quoted includes to files; Rust extern crates, C# using namespaces and C/C++ angle includes to module stubs), CALLS by callee name (pending for the resolver and the cross-file pass), INHERITS/IMPLEMENTS (C# base list, C++ base_class_clause, Rust impl Trait for Type -> IMPLEMENTS from the type).

**Call sites:**
- `src/indexer/parser/registry.ts`
- `src/indexer/parser/kotlin.ts:630-645`
- `src/indexer/index.ts:36`
- `src/indexer/resolver.ts:63-118`

### 3.2 `SQL reader` — new

A module owning '.sql' (removed from the artifact reader's extensions) behind the guarded load of @derekstride/tree-sitter-sql 0.3.11. It keeps the whole-file document entity the artifact reader writes (same id rule, so retrieval and existing vectors are unaffected) and adds, per CREATE TABLE / CREATE VIEW, a table or view entity named by its (schema-qualified) name, DEFINES from the file, and REFERENCES from a view to each relation in its FROM/JOIN and from a table to each table its REFERENCES clauses name. A reference to an object defined in the same file is resolved by the reader itself (evidence 'extracted'); one to another file is written pending by name.

**Call sites:**
- `src/indexer/parser/artifact.ts`
- `src/indexer/parser/artifact.ts:40`
- `src/indexer/parser/artifact.ts:104`

### 3.3 `ENTITY_KIND_BYTE / EntityKind` — field-add

Append table (14) and view (15); keys of existing rows unchanged; SCHEMA_VERSION bumped with a migration step that is otherwise a no-op for entity rows.

```
ENTITY_KIND_BYTE: + table: 14, + view: 15
```

**Call sites:**
- `src/db/graph/keys.ts:65-84`
- `src/shared/types.ts:569-583`

### 3.4 `SharedModulesNamespace rows` — field-add

Three namespaces (cargo, nuget, native) with reserved ids 0xFFFFFFFA, 0xFFFFFFF9, 0xFFFFFFF8, provisioned by the same forward-only migration step; WORKSPACE_REPO_ID_MAX unchanged (0xFFFFFFF0, still below).

```
repo rows: + 0xFFFFFFFA cargo, + 0xFFFFFFF9 nuget, + 0xFFFFFFF8 native
```

**Call sites:**
- `src/shared/repo-namespaces.ts:30-50`
- `src/shared/repo-namespaces.ts:68-76`

### 3.5 `Language / EXT_TO_LANG / EXTENSION_MAP` — field-add

Language appends rust, csharp, c, cpp; EXT_TO_LANG maps .rs, .cs, .c, .h, .cc, .cpp, .cxx, .hpp, .hh, .hxx; EXTENSION_MAP gains the rust and c/cpp candidates.

**Call sites:**
- `src/shared/types.ts:564-567`
- `src/indexer/resolver.ts:231-236`
- `src/indexer/resolver.ts:265-280`

### 3.6 `unavailable-reader record and the languages request` — new

The registry keeps, per language whose grammar failed to load, its extensions and the load error; a request answered by the code-indexing worker lists every reader with availability and reason.

**Call sites:**
- `src/indexer/parser/registry.ts`
- `src/daemon/threads/method-class.ts`
- `src/daemon/handler-runtime.ts:1263-1266`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc2` | consumes | The readers return the Entity[] / Relation[] the indexer hands to commitFile; module stubs of the new languages are routed to their shared-modules rows by the commit (sharedModulesRepoIdOf), which the new namespaces make possible; relationships the readers or the resolver decide carry evidence 'extracted' (s7) and the cross-file pass's 'inferred'. |

## 5. Error paths

**Error cases**

- **A grammar's native binding cannot be loaded on this machine (no prebuild, ABI mismatch, missing package)** (recoverable)
  - Detection: The guarded createRequire of tree-sitter or the grammar throws inside the reader module's load
  - Response: The reader is not registered; registerUnavailableReader records the language, its extensions and the error message; a warn is logged; every other reader registers
  - User impact: That language's files are not indexed; the languages request shows it unavailable with the reason (ac3)
- **A file parses with error nodes (unsupported syntax, a dialect feature, a macro-heavy C file)** (recoverable)
  - Detection: tree.rootNode.hasError is true after parse
  - Response: Entities and relationships are taken from the well-formed parts as the existing readers do; the file is not skipped
  - User impact: Some declarations in the broken region may be missing
- **A module stub is written for a language with no namespace (a reader bug)** (recoverable)
  - Detection: sharedModulesRepoIdOf throws UnregisteredRepoError in commitFile
  - Response: The commit fails for that file and the indexer records it uncommitted (s1/s2), so the gap is visible in completeness
  - User impact: The file's rows stay as they were and the repository reads not complete
- **The migration step that provisions the new namespaces or bumps the schema fails** (recoverable)
  - Detection: The migration chain throws on open
  - Response: The store does not open, as for any failed migration step (existing behaviour)
  - User impact: The daemon reports the store failure; nothing is half-migrated

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A .h header in a repository that has both C and C++ sources | Read by the reader the resolved open question chooses; until then the C++ reader (C++ is a superset for declarations), language 'cpp' |
| A Rust file with `mod util;` and both util.rs and util/mod.rs present | util.rs is taken (Rust's own rule prefers the file beside); IMPORTS to it, evidence 'extracted' |
| A C quoted include that names a file outside the repository or not on disk | Kept pending with class no-candidate, reason target-file-missing, as the resolver does today |
| A C# file with several namespaces and partial classes across files | One class entity per declaration site; methods attach to the declaring class entity of their file |
| A SQL file with CREATE OR REPLACE VIEW, quoted identifiers and a CTE | The view is one entity named by its unquoted name; the CTE name is not a reference to a table |
| A SQL file that references a table defined in another file | REFERENCES written pending by name; resolved across files only if the open question on SQL cross-file resolution is decided so |
| A .sql file previously stored as a document by the artifact reader | Its document entity keeps the same id, so its vector and retrieval stay; table/view entities are added on its next commit |

**Invariants to preserve**

- A grammar that fails to load never stops the other readers from registering (the guarded-load rule) [[c2]]
- getParser keeps returning the first registered reader for an extension; '.sql' is owned by exactly one reader [[c5]]
- Entity and relation kind bytes are append-only: no existing slot is renumbered [[c4]]
- Module stubs live under shared-modules rows, never under a workspace (s2 review fix) [[c6]]
- The cross-file pass matches call targets only within one language [[c7]]

## 6. Test strategy

**Test framework:** `node:test with node:assert/strict, run with `npx tsx --test` (co-located __tests__ files)`

**Test levels**

- **unit** — Each reader on fixture source: entities, kinds, relationships and evidence-ready shapes
  - Subjects: `Rust reader`, `C# reader`, `C reader`, `C++ reader`, `SQL reader`
  - Fixtures: `one small multi-construct source per language, as kotlin.test.ts`
- **integration** — A mixed repository indexed through the real IndexerService: per language its entities and its includes/imports and calls are stored; SQL tables, views and references are stored
  - Subjects: `IndexerService over Rust/C#/C/C++/SQL files`
  - Fixtures: `a temporary repository with one file set per language`
- **integration** — A reader whose grammar cannot load is skipped with its reason and the others index
  - Subjects: `registerUnavailableReader`, `guarded grammar load`
  - Fixtures: `a load seam that makes one grammar's require throw`
- **integration** — The languages request lists every language with availability
  - Subjects: `languages request`
- **integration** — The migration step provisions the new namespaces and bumps the schema; module stubs of the new languages are stored under them
  - Subjects: `migration step for namespaces and kinds`
- **smoke** — On the installed daemon: a repository with files in all five languages indexes them and the languages request lists them
  - Subjects: `installed daemon: five languages`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `integration: a repository with Rust, C#, C and C++ files indexed through IndexerService stores, per language, file/function/type entities and IMPORTS (include/use/mod/using) and CALLS relationships`, `unit: each code reader's entities and relationships on its fixture` |
| `ac2` | `integration: SQL files defining tables and views store a table/view entity per definition and a REFERENCES per foreign key and per relation a view selects from, beside the document entity`, `unit: the SQL reader on CREATE TABLE/VIEW with REFERENCES, joins, quoted names and a CTE` |
| `ac3` | `integration: with one grammar's load made to fail, that language's files are not indexed, the languages request reports it unavailable with the load error, and every other language indexes` |
| `ac4` | `integration: the languages request lists python, go, typescript, javascript, java, scala, kotlin, rust, csharp, c, cpp and sql with their extensions and availability` |

## 7. Migration

**State before:** The registry holds seven code readers (python, go, typescript/javascript, java, scala, kotlin) plus the artifact reader, which stores a .sql file as one whole-file document (src/indexer/parser/artifact.ts:40, :104); Language has no rust/csharp/c/cpp (src/shared/types.ts:564-567); ENTITY_KIND_BYTE ends at externalEndpoint: 13 (src/db/graph/keys.ts:65-84); four shared-modules namespaces (src/shared/repo-namespaces.ts:35-50); no request lists the languages.

**State after:** Five more readers registered behind guarded loads (Rust, C#, C, C++, SQL); '.sql' owned by the SQL reader, which keeps the document entity and adds table/view entities and REFERENCES; ENTITY_KIND_BYTE ends at view: 15; namespaces cargo/nuget/native provisioned; the registry records unavailable readers; a request lists every language with availability.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the five grammar dependencies (tree-sitter-rust 0.24.0, tree-sitter-c-sharp 0.23.1, tree-sitter-c 0.24.1, tree-sitter-cpp 0.23.4, @derekstride/tree-sitter-sql 0.3.11) under the repository's .npmrc (Node 22 headers, legacy-peer-deps). — ↩ rollbackable
2. Append the Language values, the table/view kind slots and the three namespaces, with one forward-only migration step that provisions the namespace rows and bumps SCHEMA_VERSION; no existing row is rewritten. — ✕ non-rollbackable
3. Add the unavailable-reader record to the registry and the languages request; a reader that has not landed yet simply does not appear as available. — ↩ rollbackable
4. Land each reader on its own (C, C++, Rust, C#), registering behind its guarded load; files of a language are indexed from the next full index or file event once its reader is present. — ↩ rollbackable
5. Land the SQL reader and move '.sql' off the artifact reader in the same change, keeping the document entity's id so existing documents and vectors stay. — ↩ rollbackable
6. Repositories indexed before the change pick up the new languages on their next full index (repo.reindex) or as their files change; no forced re-index. — ↩ rollbackable

**Backward compat:** Additive for every client: no request or field is removed or renamed; the languages request is new. The store migration only appends (two kind slots, three namespace rows) and bumps SCHEMA_VERSION; an older daemon cannot open a store migrated forward (as with every forward-only step), which is the existing migration contract. A .sql document entity keeps its id, so search and existing vectors are unaffected. A machine where a grammar cannot load keeps working and reports that language unavailable.

## 8. Alternatives considered

### 8.1 a1: One tree-sitter reader per language, new SQL kinds and new module namespaces — **CHOSEN**

Rust, C#, C, C++ and SQL each get a reader in the registry behind a guarded grammar load; tables and views become new entity kinds; external imports become module stubs under new shared-modules namespaces; the registry keeps why a reader is missing and a daemon request lists the languages.

Five modules beside kotlin.ts (rust, csharp, c, cpp, sql) each load tree-sitter plus their grammar through the guarded createRequire pattern and register on success; on failure the registry records the language and the load error. Language gains rust, csharp, c, cpp ('sql' exists). Code readers emit file, function/method, class/interface/type entities and DEFINES/CONTAINS, IMPORTS (relative includes and Rust mod/use crate paths to files, external ones to module stubs), CALLS by name, INHERITS/IMPLEMENTS. ENTITY_KIND_BYTE appends table (14) and view (15); the SQL reader owns '.sql' (the artifact reader drops it), keeps the whole-file document entity for retrieval, and emits a table/view entity per CREATE plus REFERENCES from views to the relations they select from and from tables to the tables their foreign keys name. SharedModulesNamespace appends cargo, nuget and native with the next reserved ids, provisioned by a migration step with a SCHEMA_VERSION bump. A daemon request (code-indexing worker class) returns each language, its extensions and whether its reader loaded, with the reason when not.

### 8.2 a2: Same readers, no new kinds or namespaces

As a1 for the readers and the languages request, but SQL tables and views are stored as kind 'type' (the statement in the signature) and external imports of the added languages are left as pending relationships instead of module stubs, so no stored form changes.

Readers, guarded loads, Language additions, the unavailable-reader record and the request as in a1. The SQL reader writes CREATE TABLE/VIEW as entities of kind 'type' with signature 'table'/'view', so ENTITY_KIND_BYTE and SCHEMA_VERSION are untouched. An import of an external crate, namespace or system header is emitted as an unresolved IMPORTS that the cross-file pass classes no-candidate, so no shared-modules namespace is added.

**Rejected because:** Avoids a migration step but falls short on ac1 for external imports and blurs SQL objects into types.

### 8.3 a3: Code readers by tree-sitter, SQL by a statement scanner

The four code readers as in a1; SQL read by a small scanner of CREATE TABLE / CREATE VIEW statements and their FROM/JOIN/REFERENCES names instead of a SQL grammar.

Rust/C#/C/C++ readers as in a1. The SQL reader splits a file into statements and matches CREATE [OR REPLACE] TABLE|VIEW name, REFERENCES name and FROM/JOIN name with regular expressions over comment- and string-stripped text, emitting the same entities and REFERENCES as a1. No SQL grammar dependency.

**Rejected because:** Drops one dependency at the cost of SQL accuracy, against the project's accuracy rule.

## 9. References

- **[[c1]]** `analyze-bundle` `s1 symbol.locate: the parser registry and how a reader registers` — "src/indexer/parser/registry.ts holds one array of CodeParser; registerParser appends, getParser(filePath) returns the FIRST parser whose extensions include the file's extension, supportedExtensions() "
- **[[c2]]** `analyze-bundle` `s1 usage.example: the guarded grammar load` — "src/indexer/parser/kotlin.ts:630-645 loads tree-sitter and tree-sitter-kotlin through createRequire inside a try; on failure it logs a warn ('Kotlin files will not be indexed (other parsers unaffected"
- **[[c3]]** `analyze-bundle` `s1 docs: grammar packages for the added languages (probe 2026-11-02)` — "Probe in a scratch directory with tree-sitter@0.25.0 under Node 22 and the repo's .npmrc (legacy-peer-deps, Node 22.22.1 headers): tree-sitter-rust@0.24.0, tree-sitter-c@0.24.1, tree-sitter-cpp@0.23.4"
- **[[c4]]** `analyze-bundle` `s1 data-model.trace: Language union, entity kinds and relation kinds` — "Language (src/shared/types.ts:564-567) has python, go, typescript, javascript, java, scala, kotlin and document languages including 'sql'; no rust/csharp/c/cpp. ENTITY_KIND_BYTE (src/db/graph/keys.ts:"
- **[[c5]]** `analyze-bundle` `s1 symbol.locate: SQL today` — "The artifact reader (src/indexer/parser/artifact.ts) stores a .sql file as one whole-file document entity (header comment line 9; extension map '.sql' -> 'sql' at :40; listed in its extensions at :104"
- **[[c6]]** `analyze-bundle` `s1 data-model.trace: module stubs and the shared-modules namespaces` — "Module stubs (kind 'module', repo '') live under reserved shared-modules rows keyed by namespace: SharedModulesNamespace is 'jvm' | 'npm' | 'python' | 'go' with reserved repo ids 0xFFFFFFFE..0xFFFFFFF"
- **[[c7]]** `analyze-bundle` `s1 usage.example: per-file resolution the new readers rely on` — "resolveRelations (src/indexer/resolver.ts:63-118) resolves a CALLS by the callee's name to a unique entity of the same file for any language, and a relative IMPORTS through resolveImportPath with a pe"
- **[[c8]]** `analyze-bundle` `s1 symbol.locate: where a daemon request would list languages` — "No request lists the languages the index reads. system.info (src/daemon/handler-runtime.ts:1263-1266) returns host facts. Indexing runs in the code-indexing worker (the readers are imported there via "
- **[[c9]]** `analyze-bundle` `s1 test.locate: tests to extend` — "Per-language reader tests live in src/indexer/parser/__tests__/ (kotlin.test.ts, java.test.ts, scala.test.ts); indexer-level tests that run IndexerService on real files in src/indexer/__tests__/ (evid"
- **[[c10]]** `prior-artifact` `HLD-c2ba6fa62a148ed1 s9 boundary and sc2 FileCommit`
- **[[c11]]** `prior-artifact` `DEF-c2ba6fa62a148ed1 Story s9 acceptance criteria ac1-ac4 and lc1`
- **[[c12]]** `step-output` `s3 alternatives.judge: a1 chosen`
- **[[c13]]** `step-output` `s8 checklist.verify: cd1 partial, alt2 partial`

## 10. Open questions

- OPEN: which language a .h header belongs to. The cross-file pass matches calls only within one language, so a C caller and a header read as C++ never meet. Proposed: read .h with the C++ reader (a superset for declarations) and treat 'c' and 'cpp' as one family when the cross-file pass matches call targets; alternatives: read .h as C unless the repository has C++ sources, or as C always. Decide before the plan.
- OPEN: SQL references to objects defined in other files. The reader resolves same-file references itself; a reference to another file is written pending by name, and the cross-file pass (Story s1's) resolves only CALLS/INHERITS/IMPLEMENTS. Proposed: add REFERENCES-by-name for language 'sql' to the cross-file pass (match a schema-qualified or bare table/view name among the repository's SQL entities; several candidates stay ambiguous); alternative: leave them pending (no-candidate) in this Story. Decide before the plan.
- NOTE: C# 'using' imports a namespace, not a file, so a call into another file resolves across files only where the cross-file pass can map the namespace to files; this Story stores such calls pending and does not add namespace-to-file mapping.
- NOTE (s8 cd1 partial): registerUnavailableReader and the 'index.languages' request are new names this Story introduces (the HLD names the request only by purpose).
- NOTE (s8 alt2 partial): alternatives were scored against ac1-ac4, lc1 and sc2; the Epic constraints the criteria operationalize (k1, k2, k6) were not scored separately.

## Resolved questions

- `qdabf39b5` — OPEN: which language a .h header belongs to. The cross-file pass matches calls only within one language, so a C caller and a header read as C++ never meet. Proposed: read .h with the C++ reader (a superset for declarations) and treat 'c' and 'cpp' as one family when the cross-file pass matches call targets; alternatives: read .h as C unless the repository has C++ sources, or as C always. Decide before the plan.
  - **resolved**: Unify c/cpp as one family (proposed) — User decision 2026-11-02: C and C++ are one family. .h headers are read with the C++ reader, and the cross-file pass treats 'c' and 'cpp' as one language family when it matches call targets, so a C caller links to a declaration in a header. _(2026-11-02T04:46:40.906Z)_
- `qa7870f0b` — OPEN: SQL references to objects defined in other files. The reader resolves same-file references itself; a reference to another file is written pending by name, and the cross-file pass (Story s1's) resolves only CALLS/INHERITS/IMPLEMENTS. Proposed: add REFERENCES-by-name for language 'sql' to the cross-file pass (match a schema-qualified or bare table/view name among the repository's SQL entities; several candidates stay ambiguous); alternative: leave them pending (no-candidate) in this Story. Decide before the plan.
  - **resolved**: Leave all cross-file SQL references pending in this Story — User decision 2026-11-02: same-file SQL references are resolved by the reader; references to tables/views defined in other files stay pending by name in s9. Recorded as a pending item: teach the cross-file pass to match SQL table and view names (a small addition to Story s1's pass), with several candidates staying ambiguous. _(2026-11-02T04:48:31.406Z)_
- `q1e0c2c08` — NOTE: C# 'using' imports a namespace, not a file, so a call into another file resolves across files only where the cross-file pass can map the namespace to files; this Story stores such calls pending and does not add namespace-to-file mapping.
  - **resolved**: Ship with documented limitation — As stated in the approved LLD (2026-11-02): C# calls reached only through a 'using' namespace stay pending; no namespace-to-file mapping in s9. Default stated to the user. _(2026-11-02T04:49:44.386Z)_

## Citations

- **[[c1]]** `analyze-bundle` `s1 symbol.locate: the parser registry and how a reader registers` — "src/indexer/parser/registry.ts holds one array of CodeParser; registerParser appends, getParser(filePath) returns the FIRST parser whose extensions include the file's extension, supportedExtensions() "
- **[[c2]]** `analyze-bundle` `s1 usage.example: the guarded grammar load` — "src/indexer/parser/kotlin.ts:630-645 loads tree-sitter and tree-sitter-kotlin through createRequire inside a try; on failure it logs a warn ('Kotlin files will not be indexed (other parsers unaffected"
- **[[c3]]** `analyze-bundle` `s1 docs: grammar packages for the added languages (probe 2026-11-02)` — "Probe in a scratch directory with tree-sitter@0.25.0 under Node 22 and the repo's .npmrc (legacy-peer-deps, Node 22.22.1 headers): tree-sitter-rust@0.24.0, tree-sitter-c@0.24.1, tree-sitter-cpp@0.23.4"
- **[[c4]]** `analyze-bundle` `s1 data-model.trace: Language union, entity kinds and relation kinds` — "Language (src/shared/types.ts:564-567) has python, go, typescript, javascript, java, scala, kotlin and document languages including 'sql'; no rust/csharp/c/cpp. ENTITY_KIND_BYTE (src/db/graph/keys.ts:"
- **[[c5]]** `analyze-bundle` `s1 symbol.locate: SQL today` — "The artifact reader (src/indexer/parser/artifact.ts) stores a .sql file as one whole-file document entity (header comment line 9; extension map '.sql' -> 'sql' at :40; listed in its extensions at :104"
- **[[c6]]** `analyze-bundle` `s1 data-model.trace: module stubs and the shared-modules namespaces` — "Module stubs (kind 'module', repo '') live under reserved shared-modules rows keyed by namespace: SharedModulesNamespace is 'jvm' | 'npm' | 'python' | 'go' with reserved repo ids 0xFFFFFFFE..0xFFFFFFF"
- **[[c7]]** `analyze-bundle` `s1 usage.example: per-file resolution the new readers rely on` — "resolveRelations (src/indexer/resolver.ts:63-118) resolves a CALLS by the callee's name to a unique entity of the same file for any language, and a relative IMPORTS through resolveImportPath with a pe"
- **[[c8]]** `analyze-bundle` `s1 symbol.locate: where a daemon request would list languages` — "No request lists the languages the index reads. system.info (src/daemon/handler-runtime.ts:1263-1266) returns host facts. Indexing runs in the code-indexing worker (the readers are imported there via "
- **[[c9]]** `analyze-bundle` `s1 test.locate: tests to extend` — "Per-language reader tests live in src/indexer/parser/__tests__/ (kotlin.test.ts, java.test.ts, scala.test.ts); indexer-level tests that run IndexerService on real files in src/indexer/__tests__/ (evid"
- **[[c10]]** `prior-artifact` `HLD-c2ba6fa62a148ed1 s9 boundary and sc2 FileCommit`
- **[[c11]]** `prior-artifact` `DEF-c2ba6fa62a148ed1 Story s9 acceptance criteria ac1-ac4 and lc1`
- **[[c12]]** `step-output` `s3 alternatives.judge: a1 chosen`
- **[[c13]]** `step-output` `s8 checklist.verify: cd1 partial, alt2 partial`
