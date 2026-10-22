<!-- insrc:artifact PLAN-bd1c6c9005ff6390-s1 -->

# Plan: E20261017bd1c6c90:S001

## Summary

**Epic:** `record-calls-made-module-level-statements`
**LLD run:** `wf-1792227721731-1vwusb`
**LLD effective hash:** `bf2048f4fa40...`

Building this is four small changes in the TypeScript parser and the review's test-file predicate: credit calls outside any function to the file, keep calls in class fields, constructors and generator declarators, teach isTestFile the other languages' conventions, and prove end to end that a test file now reaches the code it calls.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** TypeScript calls outside any function are credited to the file | M | — | unit: src/indexer/parser/__tests__/typescript-module-level-calls.test.ts: calls in a program-level expression statement (including nested describe/test callbacks), a non-function program-level or exported initializer, other program-level statements and export default, in both TypeScript (.ts) and JavaScript (.js) sources, are CALLS from the file entity; calls in function declarations, class methods, exported functions and classes and function-valued declarators keep their caller and are not credited to the file; built-ins are still skipped; a module-level HTTP call is a CALLS_HTTP from the file entity | [[c1]] |
| 2 | **`t2`** Class field initializers, constructors and generator declarators keep their calls | S | `t1` | unit: src/indexer/parser/__tests__/typescript-module-level-calls.test.ts: in both TypeScript and JavaScript sources, calls in class field initializers (public_field_definition, field_definition) and the constructor body are CALLS from the class entity, a function-valued field is not credited to the class, and a generator-valued declarator gets its own function entity whose calls are not credited to the file | [[c2]] |
| 3 | **`t3`** isTestFile recognises Python, Go and JVM test files | S | — | unit: src/workflow/code-review/__tests__/grounding.test.ts: isTestFile accepts test_*.py, *_test.py, *_test.go, src/test/ paths, *Test.java/.kt/.scala and *Spec.scala as well as every path it accepted before, and rejects ordinary source files | [[c3]] |
| 4 | **`t4`** A TypeScript test file reaches the code-review grounding end to end | S | `t1`, `t3` | integration: src/indexer/__tests__/test-callers-reach-grounding.test.ts: for a TypeScript test file whose test('...', () => { ... }) callback calls a function imported from another file, the real parser, the real cross-file resolver over a temporary graph store and assembleCodeReviewGrounding with the real graph deps list the test file's entity in the function's testsReaching | [[c4]] |

### 1.1 E20261017bd1c6c90:S001:T001 — TypeScript calls outside any function are credited to the file

walkNode extracts calls with the file entity as caller from program-level statements that are not declarations it handles, from each non-function declarator value of a program-level or exported lexical/variable declaration, and from an export_statement's value (export default <expr>); exported function and class declarations are walked as today and never scanned with the file as caller.

**Acceptance checks:**
- Calls in a program-level expression statement, including nested describe/test callbacks, are CALLS from the file entity, in .ts and .js sources.
- Non-function program-level and exported initializers, and export default, are CALLS from the file entity.
- Calls in function declarations, class methods, exported functions and classes and function-valued declarators keep their caller and are not credited to the file.
- Built-ins are skipped; a module-level HTTP call is a CALLS_HTTP from the file entity.

### 1.2 E20261017bd1c6c90:S001:T002 — Class field initializers, constructors and generator declarators keep their calls

extractClass extracts calls with the class entity as caller from non-function field initializers (public_field_definition and field_definition) and from the constructor body; extractArrowFunction treats a generator_function value as a function, so a generator-valued declarator gets its own function entity and caller.

**Acceptance checks:**
- Field-initializer and constructor-body calls are CALLS from the class entity in TS and JS sources.
- A function-valued field is not credited to the class.
- A generator-valued declarator gets a function entity whose calls are not credited to the file.

### 1.3 E20261017bd1c6c90:S001:T003 — isTestFile recognises Python, Go and JVM test files

isTestFile also matches test_*.py, *_test.py, *_test.go, a src/test/ directory, *Test.java/.kt/.scala and *Spec.scala, keeping both existing branches.

**Acceptance checks:**
- The new conventions are accepted.
- Every path accepted before, including any file under __tests__/, is still accepted.
- Ordinary source files are rejected.

### 1.4 E20261017bd1c6c90:S001:T004 — A TypeScript test file reaches the code-review grounding end to end

An integration test runs the real TypeScript parser, the real cross-file resolver over a temporary graph store and assembleCodeReviewGrounding with the real graph deps for a test file whose test callback calls an imported function, and asserts the test file's entity in that function's testsReaching.

**Acceptance checks:**
- The called function's testsReaching lists the test file's entity, produced without any fixture-supplied caller edge.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| src/indexer/parser/__tests__/typescript-module-level-calls.test.ts: calls in a program-level expression statement (including nested describe/test callbacks), a non-function program-level or exported initializer, other program-level statements and export default, in both TypeScript (.ts) and JavaScript (.js) sources, are CALLS from the file entity; calls in function declarations, class methods, exported functions and classes and function-valued declarators keep their caller and are not credited to the file; built-ins are still skipped; a module-level HTTP call is a CALLS_HTTP from the file entity | `t1` |
| src/indexer/parser/__tests__/typescript-module-level-calls.test.ts: in both TypeScript and JavaScript sources, calls in class field initializers (public_field_definition, field_definition) and the constructor body are CALLS from the class entity, a function-valued field is not credited to the class, and a generator-valued declarator gets its own function entity whose calls are not credited to the file | `t2` |
| src/workflow/code-review/__tests__/grounding.test.ts: isTestFile accepts test_*.py, *_test.py, *_test.go, src/test/ paths, *Test.java/.kt/.scala and *Spec.scala as well as every path it accepted before, and rejects ordinary source files | `t3` |
| src/indexer/__tests__/test-callers-reach-grounding.test.ts: for a TypeScript test file whose test('...', () => { ... }) callback calls a function imported from another file, the real parser, the real cross-file resolver over a temporary graph store and assembleCodeReviewGrounding with the real graph deps list the test file's entity in the function's testsReaching | `t4` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD S001 contractDetails.api walkNode`
- **[[c2]]** `prior-artifact` `LLD S001 contractDetails.api extractClass and the generator_function postcondition of walkNode`
- **[[c3]]** `prior-artifact` `LLD S001 contractDetails.api isTestFile`
- **[[c4]]** `prior-artifact` `LLD S001 testStrategy integration level`
