<!-- insrc:artifact LLD-bd1c6c9005ff6390-S001 -->

# LLD: E20261017bd1c6c90:S001

## Summary

**Epic:** `record-calls-made-module-level-statements`
**HLD base run:** `wf-1792227721731-1vwusb`
**HLD effective hash:** `bf2048f4fa40...`

In TypeScript and JavaScript, every call is now recorded with the nearest entity, even when it sits in no function: calls at the top of a file, in exported initializers and in export default go to the file, and calls in class field initializers and constructors go to the class. Every test('…', () => { … }) body is such a call, so test files reach the code they call. The code review also recognises Python, Go and JVM test files.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)
9. [Open questions](#9-open-questions)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal

### 2.1 `walkNode`

```typescript
walkNode(node: SyntaxNode, source: string, repo: string, repoId: number, filePath: string, lang: Language, fileId: string, now: string, entities: Entity[], relations: Relation[]): void
```

**Parameters:**
- `fileId: string` — The file entity id, also the caller of calls with no enclosing entity.

**Returns:** `void` — Unchanged.

**Postconditions:**
- A program-level statement that is not an import, function, class, interface, type alias or lexical/variable declaration (expression_statement, if/for/while/try/block/labeled) has extractCalls run over it with fileId as caller; the walk into its children continues as today.
- For a lexical/variable declaration at program level or as an export_statement's declaration, each declarator whose value is not an arrow_function, function_expression or generator_function has extractCalls run over its value with fileId as caller; function-valued declarators (including generator_function) keep or gain their own function entity and caller.
- An export_statement with a `value` (export default <expr>) has extractCalls run over the value with fileId as caller; an exported function or class declaration is walked as today and never scanned with the file as caller.
- Calls inside function declarations, class methods and function-valued declarators are not also credited to the file unless they are nested inside a statement the file is credited for.
- extractArrowFunction treats a generator_function value as a function: the declarator gets a function entity and its body's calls are CALLS from that entity, in TypeScript and JavaScript.

### 2.2 `extractClass`

```typescript
extractClass(node: SyntaxNode, source: string, repo: string, repoId: number, filePath: string, lang: Language, fileId: string, now: string, entities: Entity[], relations: Relation[]): void
```

**Parameters:**
- `node: SyntaxNode` — A class_declaration.

**Returns:** `void` — Unchanged.

**Postconditions:**
- Each class-body field (public_field_definition in TypeScript, field_definition in JavaScript) whose value is not a function has extractCalls run over the value with the class entity as caller.
- The constructor's body has extractCalls run over it with the class entity as caller; the constructor still creates no entity of its own (the class covers it, as today).
- Other methods keep their own entities and callers.

### 2.3 `isTestFile`

```typescript
isTestFile(file: string): boolean
```

**Parameters:**
- `file: string` — A repo-relative or absolute path.

**Returns:** `boolean` — True for the existing TS/JS conventions and also test_*.py, *_test.py, *_test.go, any src/test/ directory, *Test.java/.kt/.scala and *Spec.scala.

**Postconditions:**
- Both existing branches are kept: any file under a __tests__/ directory, whatever its language, and a TS/JS .test./.spec. suffix.
- Ordinary source files are rejected.

## 3. Data model changes

### 3.1 `CALLS relation` — invariant-change

A CALLS (or CALLS_HTTP) relation from the TypeScript parser may now have the file entity (calls outside any function) or a class entity (field initializers, constructor bodies) as its source. No new entity kind, no new field, no store schema change. A generator-valued declarator now gets a function entity, as other function-valued declarators do.

**Call sites:**
- `src/indexer/parser/typescript.ts:150-200`
- `src/indexer/parser/typescript.ts:313-320`
- `src/indexer/parser/typescript.ts:385-388`
- `src/indexer/parser/typescript.ts:631`
- `src/workflow/code-review/grounding.ts:81-92`

## 4. Error paths

**Error cases**

- **A file is re-indexed or deleted after its calls were recorded.** (recoverable)
  - Detection: indexFile and fileEvent delete the file's entities (src/indexer/index.ts:1041, :785); the cascade removes incident edges and deleteUnresolvedForFile removes pending CALLS rows.
  - Response: Nothing new: CALLS from the file and class entities follow the same clean-up.
  - User impact: No stale callers.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| describe('x', () => { test('y', () => { foo(); }); }) | One CALLS foo from the file entity. |
| export const deps = makeDeps(); | CALLS makeDeps from the file entity. |
| export function f() { g(); } | Unchanged: CALLS g from f only. |
| export class C { m() { h(); } } | Unchanged: CALLS h from C.m only. |
| export default foo(); | CALLS foo from the file entity. |
| const f = () => bar(); at program level | Unchanged: entity f with CALLS bar from f only. |
| class C { private readonly x = make(); constructor() { init(); } } | CALLS make and init from C. |
| class C { handler = () => run(); } | A function-valued field is not scanned as an initializer of C: run is not credited to C. |
| test('t', () => { function helper() { qux(); } helper(); }) | As today helper is an entity with CALLS qux; the file entity also calls qux and helper. |
| A module-level console.log | Skipped as a built-in, as inside functions. |
| A module-level axios.get(url) | A CALLS_HTTP from the file entity. |
| isTestFile on src/x.ts, pkg/a.go, app/models.py, src/main/java/Foo.java | false. |
| JavaScript: class C { x = make(); } | CALLS make from C (field_definition). |
| const g = function* () { foo(); }; (TS and JS) | An entity g with CALLS foo from g; foo is not credited to the file. |

**Invariants to preserve**

- Calls inside function declarations, class methods and function-valued declarators keep their current caller and are not duplicated onto the file. [[c1]]
- A file's edges and pending rows are removed with its entities on re-index or delete. [[c2]]
- Every path isTestFile accepts today is still accepted, including any file under a __tests__/ directory regardless of language. [[c3]]

## 5. Test strategy

**Test framework:** `node:test via npx tsx --test (assert/strict), run under Node 22`

**Test levels**

- **unit** — TS calls outside an extracted function are credited to the nearest entity; isTestFile knows every language.
  - Subjects: `src/indexer/parser/__tests__/typescript-module-level-calls.test.ts: calls in a program-level expression statement (including nested describe/test callbacks), a non-function program-level or exported initializer, other program-level statements and export default, in both TypeScript (.ts) and JavaScript (.js) sources, are CALLS from the file entity; calls in function declarations, class methods, exported functions and classes and function-valued declarators keep their caller and are not credited to the file; built-ins are still skipped; a module-level HTTP call is a CALLS_HTTP from the file entity`, `src/indexer/parser/__tests__/typescript-module-level-calls.test.ts: in both TypeScript and JavaScript sources, calls in class field initializers (public_field_definition, field_definition) and the constructor body are CALLS from the class entity, a function-valued field is not credited to the class, and a generator-valued declarator gets its own function entity whose calls are not credited to the file`, `src/workflow/code-review/__tests__/grounding.test.ts: isTestFile accepts test_*.py, *_test.py, *_test.go, src/test/ paths, *Test.java/.kt/.scala and *Spec.scala as well as every path it accepted before, and rejects ordinary source files`
- **integration** — A TS test file's calls reach the code-review grounding through the real parser, resolver and grounding.
  - Subjects: `src/indexer/__tests__/test-callers-reach-grounding.test.ts: for a TypeScript test file whose test('...', () => { ... }) callback calls a function imported from another file, the real parser, the real cross-file resolver over a temporary graph store and assembleCodeReviewGrounding with the real graph deps list the test file's entity in the function's testsReaching`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `src/indexer/parser/__tests__/typescript-module-level-calls.test.ts: calls in a program-level expression statement (including nested describe/test callbacks), a non-function program-level or exported initializer, other program-level statements and export default, in both TypeScript (.ts) and JavaScript (.js) sources, are CALLS from the file entity; calls in function declarations, class methods, exported functions and classes and function-valued declarators keep their caller and are not credited to the file; built-ins are still skipped; a module-level HTTP call is a CALLS_HTTP from the file entity`, `src/indexer/parser/__tests__/typescript-module-level-calls.test.ts: in both TypeScript and JavaScript sources, calls in class field initializers (public_field_definition, field_definition) and the constructor body are CALLS from the class entity, a function-valued field is not credited to the class, and a generator-valued declarator gets its own function entity whose calls are not credited to the file` |
| `ac2` | `src/indexer/__tests__/test-callers-reach-grounding.test.ts: for a TypeScript test file whose test('...', () => { ... }) callback calls a function imported from another file, the real parser, the real cross-file resolver over a temporary graph store and assembleCodeReviewGrounding with the real graph deps list the test file's entity in the function's testsReaching` |
| `ac3` | `src/workflow/code-review/__tests__/grounding.test.ts: isTestFile accepts test_*.py, *_test.py, *_test.go, src/test/ paths, *Test.java/.kt/.scala and *Spec.scala as well as every path it accepted before, and rejects ordinary source files` |

## 6. Migration

**State before:** Per s1: the TS parser extracts calls only inside function declarations, class methods and function-valued declarators (src/indexer/parser/typescript.ts:259, :419, :552); program-level statements, exported initializers, export default, class field initializers and constructors are never scanned (src/indexer/parser/typescript.ts:150-200, :313-320, :385-388); isTestFile recognises a __tests__/ directory of any language and TS/JS .test./.spec. suffixes only (src/workflow/code-review/grounding.ts:60-62).

**State after:** TS calls outside any extracted function are CALLS from the file or class entity; isTestFile recognises Python, Go and JVM test files.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the program-level and export handling to walkNode. — ↩ rollbackable
2. Extract field-initializer (public_field_definition and field_definition) and constructor-body calls in extractClass, and treat a generator_function value as a function in extractArrowFunction. — ↩ rollbackable
3. Extend isTestFile with the Python, Go and JVM test conventions. — ↩ rollbackable
4. Update and restart the installed daemon, then reindex the registered repositories so every TS file gains its new CALLS. — ↩ rollbackable

**Backward compat:** No store schema change and no new entity kind. Until a file is re-parsed it keeps its old edges, so a full reindex is needed for complete test links.

## 7. Alternatives considered

### 7.1 a1: Calls outside an extracted function go to the nearest entity — **CHOSEN**

TS program-level, exported-initializer and export-default calls are CALLS from the file entity; class field initializers and constructor bodies are CALLS from the class entity; isTestFile learns the other languages.

walkNode extracts calls with the file entity as caller for a program-level statement that is not a declaration it handles, for each non-function declarator value of a program-level or exported lexical/variable declaration, and for an export_statement's `value` (export default <expr>); export unwrapping passes the module-level context into the declaration and never scans an exported function or class wholesale. extractClass extracts calls with the class entity as caller from each field initializer (a public_field_definition value that is not a function; a function-valued field keeps or gains its own handling unchanged) and from the constructor body. isTestFile also matches test_*.py, *_test.py, *_test.go, a src/test/ directory, *Test.java/.kt/.scala and *Spec.scala.

### 7.2 a2: A synthetic entity per test call

As a1, but each program-level test('title', ...) becomes its own entity.

As a1, plus a new entity per recognised test-runner call named by its title.

**Rejected because:** Adds a new EntityKind and a store schema step on the live v5 store for test-title granularity the code review does not use (it joins callers to the test record per file).

### 7.3 a3: Program-level statements only

Only program-level expression statements.

The expression_statement part of a1 only.

**Rejected because:** Partial on fixIntent-1: exported initializers, export default, class fields and constructors keep dropping calls.

## 8. References

- **[[c1]]** `step-output` `s1 context.assemble bundle 1: where the TypeScript parser extracts calls (src/indexer/parser/typescript.ts:150-200, src/indexer/parser/typescript.ts:259, src/indexer/parser/typescript.ts:419)`
- **[[c2]]** `step-output` `s1 context.assemble bundle 2: the file and class entities and clean-up (src/indexer/parser/typescript.ts:123, src/indexer/index.ts:1041, src/indexer/index.ts:785)`
- **[[c3]]** `step-output` `s1 context.assemble bundle 3: how the code review recognises a test caller (src/workflow/code-review/grounding.ts:60-62, src/workflow/code-review/grounding.ts:81-92)`
- **[[c4]]** `step-output` `s1 context.assemble bundle 4: parser and grounding tests (src/indexer/parser/__tests__/http-client-shapes.test.ts, src/workflow/code-review/__tests__/grounding.test.ts, src/indexer/__tests__/cross-file-resolver-lmdb.test.ts)`
- **[[c5]]** `prior-artifact` `ISSUE-bd1c6c9005ff6390 fix intent, narrowed by the stakeholder (ISSUE feedback de8a2c97, 2026-10-17)`
- **[[c6]]** `prior-artifact` `Review rounds 1-3 of LLD-bd1c6c9005ff6390-S001 (2026-10-17): other parsers, export unwrapping, the current-behaviour claim (round 1; scope widened to Python and Go by the user); Scala/Kotlin class-body and initializer calls, same-package call resolution, end-to-end tests (round 2); further parser contexts, JVM callee naming and test-to-main roots (round 3); then on the narrowed design JS field_definition and the generator_function node type (cycle 2 round 1); the isTestFile current behaviour described exactly (cycle 2 round 2); all but the TS contexts and isTestFile moved to an Epic c2ba6fa6 Story`

## 9. Open questions

- ts1 (partial): the standalone story carries no acceptance criteria; the test strategy maps three derived from the narrowed issue's fix intent (ac1 TS calls outside an extracted function are credited to the nearest entity, ac2 a TS test file's calls reach the code-review grounding, ac3 the review recognises test files of every supported language) [c5].

<!-- insrc:review -->

## Review

### ⚠️ Review `WARN` — design.story (design.story)

**0 do not hold · 1 could not be verified · 5 hold** · template `design-issue` · model `cli-codex:gpt-6-astra` · reviewed 2026-10-17T09:02:37.523Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

| Check item | Premise | What was tried and what was missing | Action |
| --- | --- | --- | --- |
| fix-targets-defect | The narrowed scope leaves out none of the approved ISSUE fix intent. | The repository ISSUE still says: 'The same is checked, and fixed where it applies, for the other language parsers.' The supplied design cites stakeholder feedback de8a2c97 narrowing that scope, but the inspected repository artifacts do not contain that feedback or a corresponding scope transfer. Analyzer access also failed with invalid_json_schema. [files: docs/standalone/record-calls-made-module-level-statements-E20261017bd1c6c90/ISSUE.md, docs/standalone/record-calls-made-module-level-statements-E20261017bd1c6c90/S001/LLD.md] | Attach the narrowing decision or update the ISSUE and identify the destination Story for deferred parser work. |
