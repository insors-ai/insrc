<!-- insrc:artifact PLAN-c2ba6fa62a148ed1-s9 -->

# Plan: E20261102c2ba6fa6:S009

## Summary

**Epic:** `complete-consistent-richer-code-index-one`
**LLD run:** `wf-1793565101027-9glb2s`
**LLD effective hash:** `85da4a2df479...`

Building s9 starts with the shared ground -- the new languages, the table and view kinds, three namespaces for external libraries with their migration step, the grammar dependencies, a record of readers that cannot load and the request that lists languages, and C/C++ matched as one family -- and then adds one reader per language (C, C++, Rust, C#), each checkable on its own, and a structured SQL reader that keeps the document. It ends with a mixed repository indexed end to end and the installed daemon listing all twelve languages.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add the languages, the table/view kinds, the three namespaces and the grammar dependencies | M | — | integration: migration step for namespaces and kinds; unit: table/view kinds and new languages | [[c1]] [[c4]] [[c5]] |
| 2 | **`t2`** Record readers that cannot load and answer the languages request | S | `t1` | integration: guarded grammar load records an unavailable reader; integration: languages request | [[c6]] [[c2]] |
| 3 | **`t3`** Match C and C++ as one family in the cross-file pass | S | `t1` | integration: C/C++ family match in the cross-file pass | [[c7]] |
| 4 | **`t4`** Read C | L | `t1`, `t2` | unit: C reader | [[c2]] [[c3]] |
| 5 | **`t5`** Read C++ | L | `t3`, `t4` | unit: C++ reader; integration: C caller resolves to a C++ header declaration | [[c2]] [[c3]] [[c7]] |
| 6 | **`t6`** Read Rust | L | `t1`, `t2` | unit: Rust reader | [[c2]] [[c3]] |
| 7 | **`t7`** Read C# | L | `t1`, `t2`, `t5`, `t6` | unit: C# reader; integration: mixed Rust/C#/C/C++ repository through IndexerService | [[c2]] [[c3]] |
| 8 | **`t8`** Read SQL as structure | M | `t1`, `t2`, `t7` | unit: SQL reader; integration: SQL repository through IndexerService; integration: languages request lists all twelve | [[c2]] [[c3]] |
| 9 | **`t9`** Ship and smoke on the installed daemon | S | `t5`, `t6`, `t7`, `t8` | smoke: installed daemon: five languages | [[c8]] [[c9]] |

### 1.1 E20261102c2ba6fa6:S009:T001 — Add the languages, the table/view kinds, the three namespaces and the grammar dependencies

Language gains rust, csharp, c, cpp and EXT_TO_LANG maps .rs, .cs, .c, .h, .cc, .cpp, .cxx, .hpp, .hh, .hxx; ENTITY_KIND_BYTE appends table: 14, view: 15 (EntityKind too); SharedModulesNamespace appends cargo/nuget/native with ids 0xFFFFFFFA/0xFFFFFFF9/0xFFFFFFF8 and names, mapped from rust/csharp/c/cpp; a V6->V7 migration step provisions their rows (provisionSharedModulesRows) and SCHEMA_VERSION becomes 7; package.json adds tree-sitter-rust 0.24.0, tree-sitter-c-sharp 0.23.1, tree-sitter-c 0.24.1, tree-sitter-cpp 0.23.4, @derekstride/tree-sitter-sql 0.3.11.

**Acceptance checks:**
- a store at version 6 opens, migrates to 7 and holds the three namespace rows; a fresh store holds all seven
- existing entity and relation rows decode unchanged
- a module stub of rust/csharp/c/cpp is stored under its namespace row
- all five grammars install with the repository's .npmrc and load under Node 22
- tests that pin the schema version are updated to 7 and the inventory pins are refreshed

### 1.2 E20261102c2ba6fa6:S009:T002 — Record readers that cannot load and answer the languages request

registerUnavailableReader in src/indexer/parser/registry.ts records a language, its extensions and the load error; the existing readers' guarded loads (kotlin) call it on failure; a new 'index.languages' request, classed for the code-indexing worker, returns every code and SQL language with extensions, availability and reason.

**Acceptance checks:**
- a reader whose grammar require throws is not registered, is listed unavailable with the error, and the others register
- the request lists python, go, typescript, javascript, java, scala, kotlin with availability (the new languages appear as their readers land)
- the request is answered by the worker that holds the registry

### 1.3 E20261102c2ba6fa6:S009:T003 — Match C and C++ as one family in the cross-file pass

Where the cross-file pass compares a candidate's language with the caller's (same-file and cross-file call and inheritance targets), 'c' and 'cpp' match each other; every other language still matches only itself.

**Acceptance checks:**
- a C caller resolves to a function declared in a .h read as cpp
- a Python caller still never resolves to a Go function of the same name

### 1.4 E20261102c2ba6fa6:S009:T004 — Read C

A C reader (.c) behind the guarded load: file, function (definitions), type (struct/union/enum/typedef) entities; DEFINES; IMPORTS for quoted includes (resolved to the file relative to the including file) and angle includes (module stubs under 'native'); CALLS by callee name. resolveImportPath gains the c/cpp include candidates.

**Acceptance checks:**
- a .c fixture yields its functions and types and its include and call relationships
- a quoted include of a file on disk is an IMPORTS to that file (extracted); an angle include is an IMPORTS to a native module stub
- a same-file call is resolved (extracted)
- a fixture with a syntax error still yields the declarations outside the broken region

### 1.5 E20261102c2ba6fa6:S009:T005 — Read C++

A C++ reader (.cpp, .cc, .cxx, .hpp, .hh, .hxx and .h) behind the guarded load: file, function, method (class members and qualified definitions), class/type entities, namespaces folded into names; DEFINES/CONTAINS; IMPORTS as for C; CALLS by name; INHERITS from base_class_clause.

**Acceptance checks:**
- a .cpp/.h fixture yields classes, methods and functions and their include, call and inheritance relationships
- a C file calling a function declared in a .h resolves across files through the family rule
- a fixture with a syntax error still yields the declarations outside the broken region

### 1.6 E20261102c2ba6fa6:S009:T006 — Read Rust

A Rust reader (.rs) behind the guarded load: file, function, method (impl/trait members), class (struct/enum/union), interface (trait) entities; DEFINES/CONTAINS; IMPORTS for `mod x;` (x.rs, else x/mod.rs, beside the declaring file) and crate-relative `use` paths to files, external crates to module stubs under 'cargo'; CALLS by name; IMPLEMENTS from `impl Trait for Type`.

**Acceptance checks:**
- a .rs fixture yields its items and its mod/use, call and impl relationships
- `mod util;` resolves to util.rs over util/mod.rs when both exist
- a fixture with a syntax error still yields the declarations outside the broken region

### 1.7 E20261102c2ba6fa6:S009:T007 — Read C#

A C# reader (.cs) behind the guarded load of tree-sitter-c-sharp 0.23.1: file, class (class/record/struct), interface, type (enum/delegate), method entities with namespaces folded into names; DEFINES/CONTAINS; IMPORTS for using directives to module stubs under 'nuget'; CALLS by name (calls through a namespace stay pending -- the stated limitation); INHERITS/IMPLEMENTS from base lists.

**Acceptance checks:**
- a .cs fixture yields its types and members and its using, call and base-list relationships
- a same-file call resolves; a call into another file through a namespace stays pending
- a repository with Rust, C#, C and C++ files indexed through IndexerService stores, per language, file/function/type entities and IMPORTS and CALLS relationships (ac1)
- a fixture with a syntax error still yields the declarations outside the broken region

### 1.8 E20261102c2ba6fa6:S009:T008 — Read SQL as structure

A SQL reader owning '.sql' (removed from the artifact reader) behind the guarded load of @derekstride/tree-sitter-sql: the whole-file document entity with the same id as before, a table or view entity per CREATE TABLE / CREATE VIEW, DEFINES, and REFERENCES from views to relations they select from and from tables to tables their foreign keys name; same-file references resolved (extracted), others pending by name.

**Acceptance checks:**
- a SQL fixture yields the document, table and view entities and their REFERENCES (ac2)
- the document entity's id equals the artifact reader's for the same file
- a CTE name is not a reference; quoted identifiers are unquoted
- a reference to a table in another file stays pending
- the languages request lists all twelve languages available (ac4)
- a fixture with a syntax error still yields the declarations outside the broken region

### 1.9 E20261102c2ba6fa6:S009:T009 — Ship and smoke on the installed daemon

Full sweep once, update the installed daemon, and index a mixed repository with Rust, C#, C, C++ and SQL files: each language's entities and relationships are stored and the languages request lists all twelve as available.

**Acceptance checks:**
- full sweep shows no failure caused by this Story
- on the installed daemon: the mixed repository's five languages are indexed and the languages request lists them available (recorded)

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| Rust reader | `t6` |
| C# reader | `t7` |
| C reader | `t4` |
| C++ reader | `t5` |
| SQL reader | `t8` |
| IndexerService over Rust/C#/C/C++/SQL files | `t7`, `t8` |
| registerUnavailableReader | `t2` |
| guarded grammar load | `t2` |
| languages request | `t2`, `t8` |
| migration step for namespaces and kinds | `t1` |
| installed daemon: five languages | `t9` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s9 contract: Language, EXT_TO_LANG, ENTITY_KIND_BYTE table/view, SharedModulesNamespace cargo/nuget/native`
- **[[c2]]** `prior-artifact` `LLD s9 dataModel: the Rust / C# / C / C++ readers behind guarded loads`
- **[[c3]]** `prior-artifact` `LLD s9 contract: resolveImportPath / resolveRelations for the new languages (includes, mod/use)`
- **[[c4]]** `prior-artifact` `LLD s9 migration: the V6->V7 step provisioning the namespaces and bumping SCHEMA_VERSION`
- **[[c5]]** `prior-artifact` `LLD s9 migration step 1: grammar dependencies (tree-sitter-rust 0.24.0, tree-sitter-c-sharp 0.23.1, tree-sitter-c 0.24.1, tree-sitter-cpp 0.23.4, @derekstride/tree-sitter-sql 0.3.11)`
- **[[c6]]** `prior-artifact` `LLD s9 contract: registerUnavailableReader and the 'index.languages' request (resolved q0ed1e247)`
- **[[c7]]** `prior-artifact` `LLD s9 resolved question qdabf39b5: C and C++ are one family; .h read by the C++ reader (user, 2026-11-02)`
- **[[c8]]** `prior-artifact` `LLD s9 testStrategy (acceptanceMapping ac1-ac4)`
- **[[c9]]** `prior-artifact` `LLD s9 backwardCompat and errorPaths (guarded load, parse errors, .sql document id kept)`
