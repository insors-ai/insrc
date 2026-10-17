<!-- insrc:artifact LLD-bd1c6c9005ff6390-S001 -->

# LLD: E20261017bd1c6c90:S001

## Summary

**Epic:** `record-calls-made-module-level-statements`
**HLD base run:** `wf-1792225824604-r1od88`
**HLD effective hash:** `efdb09f50850...`

Calls made in a file's top-level statements are recorded, credited to the file itself. Every test written as test('…', () => { … }) is such a statement, so after this change a test file's calls reach the functions they exercise, and the code review's test links reflect real tests.

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
- `node: SyntaxNode` — The node being walked; module-level handling applies when node.parent is the program node.
- `fileId: string` — The file entity id, now also the caller of module-level calls.

**Returns:** `void` — Unchanged.

**Postconditions:**
- For a program-level expression_statement, extractCalls runs over the statement with fileId as the caller, then the walk into its children continues as today.
- For a program-level lexical_declaration or variable_declaration, each declarator whose value is not an arrow_function, function_expression or generator_function_expression has extractCalls run over its value with fileId as the caller; function-valued declarators are unchanged (extractArrowFunction).
- For any other program-level statement that is not a declaration walkNode already handles (if/for/while/try/block/labeled statements), extractCalls runs over it with fileId as the caller.
- Calls inside function declarations, class bodies and function-valued declarators are not also credited to the file, unless they are nested inside a module-level statement.

### 2.2 `extractCalls`

```typescript
extractCalls(bodyNode: SyntaxNode, callerId: string, repo: string, filePath: string, relations: Relation[]): void
```

**Parameters:**
- `callerId: string` — Now also the file entity id for module-level calls.

**Returns:** `void` — Unchanged: CALLS (and CALLS_HTTP) relations from callerId.

**Postconditions:**
- Unchanged.

## 3. Data model changes

### 3.1 `CALLS relation` — invariant-change

A CALLS (or CALLS_HTTP) relation may now have the file entity as its source, for calls in module-level statements. No new entity kind, no new field, no store schema change.

**Call sites:**
- `src/indexer/parser/typescript.ts:150-200`
- `src/indexer/parser/typescript.ts:631`
- `src/workflow/code-review/grounding.ts:81-92`

## 4. Error paths

**Error cases**

- **A file is re-indexed or deleted after module-level calls were recorded from its file entity.** (recoverable)
  - Detection: indexFile and fileEvent delete the file's entities (src/indexer/index.ts:1041, :785); the entity cascade removes incident edges and deleteUnresolvedForFile removes the file's pending CALLS rows.
  - Response: Nothing new: the file entity is deleted with the file, so its CALLS go with it; the re-parse emits the current ones.
  - User impact: No stale callers.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| describe('x', () => { test('y', () => { foo(); }); }) | One CALLS foo from the file entity (nested callbacks are walked). |
| const deps = makeDeps(); at program level | CALLS makeDeps from the file entity. |
| const f = () => bar(); at program level | Unchanged: an entity f with CALLS bar from f; not also from the file. |
| function g() { baz(); } | Unchanged: CALLS baz from g only. |
| test('t', () => { function helper() { qux(); } helper(); }) | helper is an entity with CALLS qux (as today); the file entity also calls qux and helper, because both are inside the module-level statement. |
| A module-level call to console.log or another built-in | Skipped by the existing built-in filter, as inside functions. |
| export default foo(); | An export_statement with a value is treated as a module-level statement: CALLS foo from the file entity. |
| A module-level axios.get(url) call | A CALLS_HTTP from the file entity, as the HTTP recognizer already does inside functions. |

**Invariants to preserve**

- Calls inside function declarations, class methods and function-valued declarators keep their current caller and are not duplicated onto the file. [[c1]]
- A file's edges are removed with its entities on re-index or delete; module-level CALLS from the file entity must follow the same clean-up. [[c2]]
- The code review counts a caller as a test caller by its file (isTestFile). [[c3]]

## 5. Test strategy

**Test framework:** `node:test via npx tsx --test (assert/strict), run under Node 22`

**Test levels**

- **unit** — Module-level calls are credited to the file entity; existing attribution is unchanged.
  - Subjects: `src/indexer/parser/__tests__/typescript-module-level-calls.test.ts: calls in a program-level expression statement (including nested describe/test callbacks), a non-function program-level initializer, other program-level statements and export default are CALLS from the file entity; calls in function declarations, class methods and function-valued declarators keep their caller and are not credited to the file; built-ins are still skipped; a module-level HTTP call is a CALLS_HTTP from the file entity`
- **integration** — A test file's calls reach the code-review grounding.
  - Subjects: `src/workflow/code-review/__tests__/grounding.test.ts: with the real TypeScript parser output for a test file that calls a function from inside test('...', () => { ... }), assembleCodeReviewGrounding lists that test file's entity in the function's testsReaching`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `src/indexer/parser/__tests__/typescript-module-level-calls.test.ts: calls in a program-level expression statement (including nested describe/test callbacks), a non-function program-level initializer, other program-level statements and export default are CALLS from the file entity; calls in function declarations, class methods and function-valued declarators keep their caller and are not credited to the file; built-ins are still skipped; a module-level HTTP call is a CALLS_HTTP from the file entity` |
| `ac2` | `src/workflow/code-review/__tests__/grounding.test.ts: with the real TypeScript parser output for a test file that calls a function from inside test('...', () => { ... }), assembleCodeReviewGrounding lists that test file's entity in the function's testsReaching` |

## 6. Migration

**State before:** Per s1: the TypeScript parser extracts calls only inside function declarations, class methods and function-valued declarators (src/indexer/parser/typescript.ts:259, :419, :552); calls in program-level statements are never recorded, so no test file reaches any symbol.

**State after:** Calls in program-level statements are CALLS (or CALLS_HTTP) from the file entity; existing attribution is unchanged.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the module-level handling to walkNode. — ↩ rollbackable
2. Update and restart the installed daemon, then reindex the repositories (or let the watcher re-parse changed files) so existing files gain their module-level CALLS. — ↩ rollbackable

**Backward compat:** No store schema change and no new entity kind. Until a file is re-parsed it keeps its old edges, so a full reindex is needed for complete test links.

## 7. Alternatives considered

### 7.1 a1: Credit module-level calls to the file entity — **CHOSEN**

A call in a program-level statement that is not a declaration, or in a program-level non-function initializer, is emitted as CALLS from the file entity.

walkNode gains a case for a program-level expression_statement (and any other program-level statement that is not a declaration the walker already handles) and for a program-level const/let whose value is not a function: extractCalls runs over it with the file entity as the caller. The walk into its children continues as today, so nested named declarations still become entities with their own CALLS. No new entity kind and no store change; the file entity already exists, is a test file's entity for test files, and is deleted with the file.

### 7.2 a2: A synthetic entity per top-level test call

Each test('title', ...) / it(...) at program level becomes an entity named by its title that owns the calls in its callback.

Recognise test-runner calls (test, it, describe and their variants) at program level, create an entity per call named by its title, and credit the callback's calls to it; other module-level calls go to the file entity.

**Rejected because:** Adds a new EntityKind and a store schema step on the live v5 store for test-title granularity the code review does not use (it joins callers to the test record per file).

### 7.3 a3: File-entity credit for test files only

As a1, but only in files isTestFile matches.

Same mechanism as a1, guarded by the test-file predicate.

**Rejected because:** Partial on fixIntent-1: production module-level calls stay unrecorded.

## 8. References

- **[[c1]]** `step-output` `s1 context.assemble bundle 1: where the TypeScript parser extracts calls (src/indexer/parser/typescript.ts:150-200, src/indexer/parser/typescript.ts:259, src/indexer/parser/typescript.ts:419)`
- **[[c2]]** `step-output` `s1 context.assemble bundle 2: the file entity and how its edges are cleaned up (src/indexer/parser/typescript.ts:123, src/indexer/index.ts:1041, src/indexer/index.ts:785)`
- **[[c3]]** `step-output` `s1 context.assemble bundle 3: how the code review reads test callers (src/workflow/code-review/grounding.ts:81-92)`
- **[[c4]]** `step-output` `s1 context.assemble bundle 4: other parsers and test styles (src/indexer/parser/python.ts, src/indexer/parser/go.ts, src/indexer/parser/java.ts)`
- **[[c5]]** `step-output` `s1 context.assemble bundle 5: TypeScript parser tests (src/indexer/parser/__tests__/http-client-shapes.test.ts, src/workflow/code-review/__tests__/grounding.test.ts)`
- **[[c6]]** `prior-artifact` `ISSUE-bd1c6c9005ff6390 fix intent`

## 9. Open questions

- ts1 (partial): the standalone story carries no acceptance criteria; the test strategy maps two derived from the approved issue's fix intent (ac1 module-level calls are CALLS from the file entity, ac2 a test file reaches the symbols it calls in the code-review grounding) [c6].
- Kotlin and Scala DSL-style tests written in a class body (test("x") { ... }) were not checked; out of scope here [c4].
