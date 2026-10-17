<!-- insrc:artifact LLD-bd1c6c9005ff6390-S001 -->

# LLD: E20261017bd1c6c90:S001

## Summary

**Epic:** `record-calls-made-module-level-statements`
**HLD base run:** `wf-1792227070384-yic1bf`
**HLD effective hash:** `ffb92ea69222...`

Every supported language records the calls its code makes, wherever they sit: in a function, a class body, an initializer or at the top of a file (credited to the nearest entity, or the file itself). Python and Go, which recorded no calls at all, now record them, and a call to code in the same package resolves without an import. The code review recognises test files in every supported language, so tests reach the code they exercise.

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
- `fileId: string` — The file entity id, now also the caller of calls with no enclosing entity.

**Returns:** `void` — Unchanged.

**Postconditions:**
- A program-level statement that is not an import, function, class, interface, type alias or lexical/variable declaration (expression_statement, if/for/while/try/block/labeled) has extractCalls run over it with fileId as caller; the walk into its children continues as today.
- For a lexical/variable declaration at program level or inside an export_statement, each declarator whose value is not an arrow_function, function_expression or generator_function_expression has extractCalls run over its value with fileId as caller; function-valued declarators keep today's entity and caller.
- An export_statement with a `value` (export default <expr>) has extractCalls run over the value with fileId as caller; an exported function or class declaration is walked as today and is never scanned with the file as caller.
- Calls inside function declarations, class bodies and function-valued declarators are not also credited to the file unless they are nested inside a statement the file is credited for.

### 2.2 `walkPythonNode`

```typescript
walkPythonNode(node: SyntaxNode, repo: string, repoId: number, filePath: string, fileId: string, now: string, entities: Entity[], relations: Relation[], allNames: Set<string> | null, hasAll: boolean, isTopLevel: boolean): void
```

**Parameters:**
- `fileId: string` — Caller of program-level calls.

**Returns:** `void` — Unchanged.

**Postconditions:**
- Each function/method entity's body emits CALLS {file, repo} per distinct callee name: an identifier callee as written, an attribute callee as its last attribute name; a small built-in set (print, len, range, isinstance, super, str, int, dict, list, set, tuple, ...) is skipped; nested defs and lambdas inside the body credit the enclosing entity.
- A program-level statement that is not a function/class definition, decorated definition or import has its calls emitted with fileId as caller.
- The existing HTTP and messaging walks are unchanged.

### 2.3 `walkGoNode`

```typescript
walkGoNode(node: SyntaxNode, repo: string, repoId: number, filePath: string, fileId: string, now: string, entities: Entity[], relations: Relation[]): void
```

**Parameters:**
- `fileId: string` — Caller of program-level initializer calls.

**Returns:** `void` — Unchanged.

**Postconditions:**
- Each function and method entity's body emits CALLS {file, repo} per distinct callee name: an identifier as written, a selector expression as its field name; Go built-ins (make, len, cap, append, new, panic, recover, copy, delete, print, println, close) are skipped; function literals inside the body credit the enclosing entity.
- Program-level var/const initializers have their calls emitted with fileId as caller.
- The existing HTTP and messaging walks are unchanged.

### 2.4 `isTestFile`

```typescript
isTestFile(file: string): boolean
```

**Parameters:**
- `file: string` — A repo-relative or absolute path.

**Returns:** `boolean` — True for the existing TS/JS conventions and also test_*.py, *_test.py, *_test.go, any src/test/ directory, *Test.java/.kt/.scala and *Spec.scala.

**Postconditions:**
- Every path the current predicate accepts is still accepted.

### 2.5 `walkTopLevel`

```typescript
walkTopLevel(node: SyntaxNode, ctx: WalkCtx, parent: ContainerCtx): void
```

**Parameters:**
- `parent: ContainerCtx` — The enclosing class (classId) or the top level (classId null).

**Returns:** `void` — Unchanged.

**Postconditions:**
- A Scala template-body or program-level statement that is not a declaration it handles has extractCalls run over it with parent.classId (or ctx.fileId at top level) as caller.
- handleValVar runs extractCalls over a val/var initializer with the variable entity as caller.
- Calls inside methods and functions keep their caller.

### 2.6 `walkNode (Kotlin)`

```typescript
walkNode(node: SyntaxNode, ctx: WalkCtx, parent: ContainerCtx): void
```

**Parameters:**
- `parent: ContainerCtx` — The enclosing class, or the top level.

**Returns:** `void` — Unchanged.

**Postconditions:**
- A Kotlin anonymous_initializer (init block) and any other class-body statement that is not a declaration have their calls extracted with the class as caller.
- The lambda arguments of a superclass constructor invocation (class X : FunSpec({ ... })) have their calls extracted with the class as caller.
- handleProperty extracts a property initializer's calls with the property entity as caller.
- A .kts script's top-level statements have their calls extracted with the file entity as caller.

### 2.7 `resolveCall`

```typescript
resolveCall(opts: CrossFileResolveOpts, row: UnresolvedRelation, index: EntityIndex, importsByFile: Map<string, Set<string>>): ResolveIntent
```

**Parameters:**
- `row: UnresolvedRelation` — A CALLS row.

**Returns:** `ResolveIntent` — Resolved, ambiguous or unresolved, as today.

**Postconditions:**
- After the same-file step and before the imported-files step, a same-package step looks for candidates of the caller's language, a call-target kind and the callee name in other files of the caller's package: for Java and Scala by isExportedFromSamePackage; for Go and Kotlin by the caller's directory, where a Go caller in a <p>_test package file sees only exported names of package <p> files.
- One same-package candidate resolves; several are ambiguous with their candidate ids; none falls through to the imported-files step unchanged, which no longer returns early when the caller imports nothing if a same-package step applies.

## 3. Data model changes

### 3.1 `CALLS relation` — invariant-change

A CALLS (or CALLS_HTTP) relation may now have a file entity as its source (calls with no enclosing entity), and the Python and Go parsers now emit CALLS {meta:{file, repo}} with bare callee names, as the TS and JVM parsers do. No new entity kind, no new field, no store schema change. Scala and Kotlin now also emit CALLS from classes (class-body statements, init blocks, superclass-constructor lambdas), variables and properties (initializers) and the file entity (script statements). CALLS rows between files of one package now resolve.

**Call sites:**
- `src/indexer/parser/typescript.ts:150-200`
- `src/indexer/parser/typescript.ts:631`
- `src/indexer/parser/python.ts:124-126`
- `src/indexer/parser/go.ts:114-116`
- `src/indexer/cross-file-resolver.ts:474-510`
- `src/workflow/code-review/grounding.ts:81-92`
- `src/indexer/parser/scala.ts:258-295`
- `src/indexer/parser/scala.ts:554-597`
- `src/indexer/parser/kotlin.ts:187-215`
- `src/indexer/parser/kotlin.ts:437-475`
- `src/indexer/cross-file-resolver.ts:474-510`

## 4. Error paths

**Error cases**

- **A file is re-indexed or deleted after its calls were recorded.** (recoverable)
  - Detection: indexFile and fileEvent delete the file's entities (src/indexer/index.ts:1041, :785); the cascade removes incident edges and deleteUnresolvedForFile removes pending CALLS rows.
  - Response: Nothing new: CALLS from the file entity and from Python/Go entities follow the same clean-up.
  - User impact: No stale callers.
- **A Python or Go callee cannot be resolved by the cross-file pass (a library call, a dynamic call, a Go same-package call in another file).** (recoverable)
  - Detection: resolveCall returns unresolved, ambiguous or no-candidate as for TS and JVM rows today.
  - Response: The row is kept as pending, classed by the existing rules (Epic c2ba6fa6 s1); it does not block completeness unless it awaits a target.
  - User impact: Those calls are not graph edges yet; Go same-package calls are the named open question.
- **A same-package lookup finds the callee name in several files of the package (overloads, two types with the same method name).** (recoverable)
  - Detection: The same-package step collects more than one candidate.
  - Response: The row is ambiguous with every candidate id, as the imported-files step does today; nothing is guessed.
  - User impact: An ambiguous row, visible in the index state, rather than a wrong edge.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| describe('x', () => { test('y', () => { foo(); }); }) | One CALLS foo from the TS file entity. |
| export const deps = makeDeps(); | CALLS makeDeps from the file entity. |
| export function f() { g(); } | Unchanged: CALLS g from f only, never from the file. |
| export class C { m() { h(); } } | Unchanged: CALLS h from C.m only. |
| export default foo(); | CALLS foo from the file entity. |
| const f = () => bar(); at program level | Unchanged: entity f with CALLS bar from f only. |
| test('t', () => { function helper() { qux(); } helper(); }) | As today helper is an entity with CALLS qux; the file entity also calls qux and helper (both inside the module-level statement). |
| Python: def test_x(): assert parse(src) == 1 | CALLS parse from test_x. |
| Python: obj.method(1) and len(x) inside a function | CALLS method; len skipped. |
| Python: if __name__ == '__main__': main() | CALLS main from the file entity. |
| Go: func TestX(t *testing.T) { got := Parse(s); t.Fatal(got) } | CALLS Parse and Fatal from TestX. |
| Go: var x = setup() at package level | CALLS setup from the file entity. |
| isTestFile on src/x.ts, pkg/a.go, app/models.py | false, as today. |
| Scala: class FooSpec extends AnyFunSuite { test("parses") { Parser.parse(s) } } | CALLS parse (and test) from FooSpec; FooSpec.scala is a test file. |
| Scala: val p = Parser.default() in a class | CALLS default from the variable entity. |
| Kotlin: class FooTest : FunSpec({ test("x") { parse(s) } }) | CALLS parse from FooTest. |
| Kotlin: init { register(this) } in a class | CALLS register from the class. |
| Go: TestX in x_test.go (package p) calls parse in x.go (package p) | Resolved to parse by the same-package step, although unexported and not imported. |
| Go: TestX in x_test.go (package p_test) calls Parse and parse of package p | Parse resolves; parse (unexported) does not. |
| Java: FooTest in src/test/java/com/x calls Foo.bar in src/main/java/com/x | Resolved by the same-package step (isExportedFromSamePackage); FooTest.java is a test file. |

**Invariants to preserve**

- Calls inside TS function declarations, class methods and function-valued declarators keep their current caller and are not duplicated onto the file. [[c1]]
- The Python and Go HTTP and messaging detection is unchanged. [[c2]]
- A CALLS row resolves by the caller's language and the callee's bare name (same file, then imported files). [[c3]]
- A file's edges and pending rows are removed with its entities on re-index or delete. [[c4]]
- Every path isTestFile accepts today is still accepted. [[c5]]
- resolveCall still resolves a same-file match first and an imported-file match as today; the same-package step only adds candidates where it applies. [[c3]]

## 5. Test strategy

**Test framework:** `node:test via npx tsx --test (assert/strict), run under Node 22`

**Test levels**

- **unit** — Each parser records the calls it was missing; existing attribution is unchanged.
  - Subjects: `src/indexer/parser/__tests__/typescript-module-level-calls.test.ts: calls in a program-level expression statement (including nested describe/test callbacks), a non-function program-level or exported initializer, other program-level statements and export default are CALLS from the file entity; calls in function declarations, class methods, exported functions and classes and function-valued declarators keep their caller and are not credited to the file; built-ins are still skipped; a module-level HTTP call is a CALLS_HTTP from the file entity`, `src/indexer/parser/__tests__/python-go-calls.test.ts: a Python function or method emits CALLS per distinct callee (identifier, or an attribute's last name), skips built-ins, credits nested defs and lambdas to the enclosing entity, credits program-level calls to the file entity, and keeps its HTTP detection`, `src/indexer/parser/__tests__/python-go-calls.test.ts: a Go function or method emits CALLS per distinct callee (identifier, or a selector's field name), skips Go built-ins, credits function literals to the enclosing entity, credits package-level initializer calls to the file entity, and keeps its HTTP detection`, `src/indexer/parser/__tests__/scala-kotlin-calls.test.ts: Scala class-body and program-level statements are CALLS from the class or the file, val/var initializers from the variable; Kotlin init blocks, class-body statements and superclass-constructor lambdas are CALLS from the class, property initializers from the property and .kts top-level statements from the file; calls in methods and functions keep their caller`, `src/indexer/__tests__/cross-file-resolver-same-package.test.ts: a CALLS row resolves to a same-package callee with no import for Go (same directory; a <p>_test caller sees only exported names), Kotlin (same directory) and Java and Scala (isExportedFromSamePackage); several candidates are ambiguous; same-file and imported-file resolution are unchanged`, `src/workflow/code-review/__tests__/grounding.test.ts: isTestFile accepts test_*.py, *_test.py, *_test.go, src/test/ paths, *Test.java/.kt/.scala and *Spec.scala as well as every path it accepted before, and rejects ordinary source files`
- **integration** — Test files in every supported language reach the code-review grounding through the real parser, resolver and grounding.
  - Subjects: `src/workflow/code-review/__tests__/grounding.test.ts: with the real TypeScript parser output for a test file that calls a function from inside test('...', () => { ... }), assembleCodeReviewGrounding lists that test file's entity in the function's testsReaching`, `src/indexer/__tests__/test-callers-reach-grounding.test.ts: for a TypeScript test(...) callback, a Python test function calling an imported function, a Go TestX calling a same-package function, a JUnit test calling a same-package class, a ScalaTest class-body test and a Kotest FunSpec lambda, the real parser, the real cross-file resolver over a temporary graph store and assembleCodeReviewGrounding with the real graph deps list the test file's caller in the called symbol's testsReaching`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `src/indexer/parser/__tests__/typescript-module-level-calls.test.ts: calls in a program-level expression statement (including nested describe/test callbacks), a non-function program-level or exported initializer, other program-level statements and export default are CALLS from the file entity; calls in function declarations, class methods, exported functions and classes and function-valued declarators keep their caller and are not credited to the file; built-ins are still skipped; a module-level HTTP call is a CALLS_HTTP from the file entity`, `src/indexer/parser/__tests__/scala-kotlin-calls.test.ts: Scala class-body and program-level statements are CALLS from the class or the file, val/var initializers from the variable; Kotlin init blocks, class-body statements and superclass-constructor lambdas are CALLS from the class, property initializers from the property and .kts top-level statements from the file; calls in methods and functions keep their caller` |
| `ac2` | `src/indexer/parser/__tests__/python-go-calls.test.ts: a Python function or method emits CALLS per distinct callee (identifier, or an attribute's last name), skips built-ins, credits nested defs and lambdas to the enclosing entity, credits program-level calls to the file entity, and keeps its HTTP detection`, `src/indexer/parser/__tests__/python-go-calls.test.ts: a Go function or method emits CALLS per distinct callee (identifier, or a selector's field name), skips Go built-ins, credits function literals to the enclosing entity, credits package-level initializer calls to the file entity, and keeps its HTTP detection`, `src/indexer/__tests__/cross-file-resolver-same-package.test.ts: a CALLS row resolves to a same-package callee with no import for Go (same directory; a <p>_test caller sees only exported names), Kotlin (same directory) and Java and Scala (isExportedFromSamePackage); several candidates are ambiguous; same-file and imported-file resolution are unchanged` |
| `ac3` | `src/workflow/code-review/__tests__/grounding.test.ts: isTestFile accepts test_*.py, *_test.py, *_test.go, src/test/ paths, *Test.java/.kt/.scala and *Spec.scala as well as every path it accepted before, and rejects ordinary source files`, `src/workflow/code-review/__tests__/grounding.test.ts: with the real TypeScript parser output for a test file that calls a function from inside test('...', () => { ... }), assembleCodeReviewGrounding lists that test file's entity in the function's testsReaching`, `src/indexer/__tests__/test-callers-reach-grounding.test.ts: for a TypeScript test(...) callback, a Python test function calling an imported function, a Go TestX calling a same-package function, a JUnit test calling a same-package class, a ScalaTest class-body test and a Kotest FunSpec lambda, the real parser, the real cross-file resolver over a temporary graph store and assembleCodeReviewGrounding with the real graph deps list the test file's caller in the called symbol's testsReaching` |

## 6. Migration

**State before:** Per s1: the TS parser extracts calls only inside function declarations, class methods and function-valued declarators (src/indexer/parser/typescript.ts:259, :419, :552); the Python and Go parsers emit no CALLS (src/indexer/parser/python.ts:124-126, src/indexer/parser/go.ts:114-116); isTestFile recognises only TS/JS test files (src/workflow/code-review/grounding.ts:60-62). Scala and Kotlin record no calls outside methods and functions (src/indexer/parser/scala.ts:258-295, src/indexer/parser/kotlin.ts:187-215), and resolveCall has no same-package step (src/indexer/cross-file-resolver.ts:499-508).

**State after:** Calls are recorded with their nearest entity in every parser (the file entity where there is none); Python and Go emit CALLS; calls between files of one package resolve; isTestFile recognises Python, Go and JVM test files.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the TS module-level and export handling to walkNode. — ↩ rollbackable
2. Add the general CALLS walk to the Python parser, with program-level calls credited to the file. — ↩ rollbackable
3. Add the general CALLS walk to the Go parser, with package-level initializer calls credited to the file. — ↩ rollbackable
4. Extract Scala class-body, program-level and initializer calls, and Kotlin init-block, class-body, superclass-constructor-lambda, property-initializer and script calls. — ↩ rollbackable
5. Add the same-package step to resolveCall (Java/Scala by the existing helper, Go/Kotlin by directory). — ↩ rollbackable
6. Extend isTestFile with the Python, Go and JVM test conventions. — ↩ rollbackable
7. Update and restart the installed daemon, then reindex the registered repositories so every file gains its new CALLS and resolutions. — ↩ rollbackable

**Backward compat:** No store schema change and no new entity kind. Until a file is re-parsed it keeps its old edges, so a full reindex is needed. Python and Go repositories gain many pending CALLS rows on the first reindex; they are classed by the existing rules.

## 7. Alternatives considered

### 7.1 a1: Every call is recorded with its nearest entity; same-package calls resolve; the review knows every test convention — **CHOSEN**

TS, Python and Go record calls with no enclosing function (file entity); Python and Go emit CALLS; Scala and Kotlin record class-body, initializer and script calls; calls resolve within a package; isTestFile learns every language.

TypeScript: walkNode extracts calls with the file entity as caller for a program-level statement that is not a declaration it handles, for each non-function declarator value of a program-level or exported lexical/variable declaration, and for an export_statement's `value` (export default <expr>); export unwrapping passes the module-level context into the declaration and never scans an exported function or class wholesale. Python: a walk over each function/method body emits CALLS {file, repo} per distinct callee (bare name: identifier, or the attribute's last name), skipping a small built-in set, beside the existing HTTP walk; program-level statements that are not definitions or imports are walked with the file entity as caller. Go: the same walk over each function and method body (callee = identifier, or the selector's field name), and program-level var/const initializers with the file entity. isTestFile also matches test_*.py, *_test.py, *_test.go, a src/test/ directory, and *Test.java/.kt/.scala and *Spec.scala. Scala: a template-body or program-level statement that is not a declaration has its calls extracted with the enclosing class (or the file entity at top level) as caller, and a val/var initializer has its calls extracted with the variable entity as caller. Kotlin: init blocks, the lambda arguments of a superclass constructor invocation and statements in a class body are extracted with the class as caller; property initializers with the property entity; .kts top-level statements with the file entity. Resolution: resolveCall gains a same-package step after the same-file step: for Java and Scala, the existing isExportedFromSamePackage rule; for Go and Kotlin, files in the caller's directory (for Go, a caller in a package <p>_test file sees only exported names of the package <p> files). A same-package candidate set is resolved, ambiguous or none exactly as the imported-files candidates are.

### 7.2 a2: A synthetic entity per test call, plus Python/Go CALLS

As a1 for Python and Go, but each TS test('title', ...) becomes its own entity.

As a1, except the TS module-level calls inside a recognised test-runner call get a new entity per call named by its title.

**Rejected because:** Adds a new EntityKind and a store schema step on the live v5 store for test-title granularity the code review does not use (it joins callers to the test record per file).

### 7.3 a3: TypeScript only

Fix module-level TS calls and leave Python and Go without CALLS.

The TS part of a1 only.

**Rejected because:** Violates fixIntent-3: Python and Go still record no calls.

## 8. References

- **[[c1]]** `step-output` `s1 context.assemble bundle 1: where the TypeScript parser extracts calls (src/indexer/parser/typescript.ts:150-200, src/indexer/parser/typescript.ts:259, src/indexer/parser/typescript.ts:419)`
- **[[c2]]** `step-output` `s1 context.assemble bundle 2: the Python and Go parsers emit no CALLS (src/indexer/parser/python.ts:124-126, src/indexer/parser/python.ts:271-282, src/indexer/parser/go.ts:114-116)`
- **[[c3]]** `step-output` `s1 context.assemble bundle 3: how CALLS rows are resolved (src/indexer/cross-file-resolver.ts:474-510, src/indexer/cross-file-resolver.ts:499, src/indexer/cross-file-resolver.ts:500-508)`
- **[[c4]]** `step-output` `s1 context.assemble bundle 4: the file entity and clean-up (src/indexer/parser/typescript.ts:123, src/indexer/index.ts:1041, src/indexer/index.ts:785)`
- **[[c5]]** `step-output` `s1 context.assemble bundle 5: how the code review recognises a test caller (src/workflow/code-review/grounding.ts:60-62, src/workflow/code-review/grounding.ts:81-92)`
- **[[c6]]** `step-output` `s1 context.assemble bundle 6: parser and grounding tests (src/indexer/parser/__tests__/http-client-shapes.test.ts, src/indexer/parser/__tests__/http-recognizer-py-go.test.ts, src/workflow/code-review/__tests__/grounding.test.ts)`
- **[[c7]]** `prior-artifact` `ISSUE-bd1c6c9005ff6390 fix intent`
- **[[c8]]** `prior-artifact` `Review rounds 1-2 of LLD-bd1c6c9005ff6390-S001 (2026-10-17): other parsers, export unwrapping, the current-behaviour claim (round 1; scope widened to Python and Go by the user); Scala/Kotlin class-body and initializer calls, same-package call resolution, end-to-end tests (round 2; taken into scope by the user)`

## 9. Open questions

- ts1 (partial): the standalone story carries no acceptance criteria; the test strategy maps three derived from the approved issue's fix intent (ac1 calls are recorded with their nearest entity in every parser, ac2 Python and Go emit CALLS and same-package calls resolve, ac3 test callers in every supported language reach the code-review grounding) [c7].
