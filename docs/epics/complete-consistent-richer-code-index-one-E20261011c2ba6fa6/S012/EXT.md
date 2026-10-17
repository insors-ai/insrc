<!-- insrc:artifact EXT-c2ba6fa62a148ed1-s12 -->

# Extend: complete-consistent-richer-code-index-one — Every supported parser records the calls its code makes, and calls resolve within a package

> **Extends Epic `complete-consistent-richer-code-index-one`** — this builds on existing docs + code; no new Epic was created.

**Scope:** L   ·   **New Story:** `s12`

Extends Epic `complete-consistent-richer-code-index-one` (c2ba6fa6): adds a Story for complete call extraction and resolution in every parser, building on DEF-c2ba6fa6, Story s1's pending-row classes and code in src/indexer/parser/*.ts and src/indexer/cross-file-resolver.ts.

## Added Story

### s12: Every supported parser records the calls its code makes, and calls resolve within a package

**User value:** Someone asking what calls a function, or a code review asking which tests reach a change, gets the true answer in every supported language, not only in TypeScript: Python and Go record calls at all, calls outside methods (class bodies, initializers, scripts) are recorded in every parser, JVM callee names match what resolution looks up, and calls between files of one package resolve without an import.

**Acceptance criteria:**
- **ac1:** Given a Python test function calling a function imported from another module, and a Go TestX calling a function in another file of the same package, when the repository is indexed and the callers of the called function are requested, then each test is returned as a caller, and the code-review grounding lists the test file in the function's testsReaching.
- **ac2:** Given a ScalaTest class-body test("x") { ... }, a Kotest FunSpec({ test("x") { ... } }) lambda, a Kotlin init block, a Java initializer block, a field or property initializer and a Python class-body statement, each calling a function, when the file is indexed, then each call is a CALLS relation from the nearest enclosing entity (the class, variable or property), never dropped.
- **ac3:** Given a Java qualified call obj.method() and a Scala receiver call x.method(s), where method is defined on a class in the repository, when the cross-file pass runs, then the call resolves to that method, or is reported ambiguous with its candidates; it is not left unresolved.
- **ac4:** Given a JUnit test under src/test/java/com/x calling a class in src/main/java/com/x, and a Kotlin test calling a function in another file of its package, when the cross-file pass runs, then both calls resolve without an import.

## Building on

- `prior-artifact` .insrc/artifacts/ISSUE-bd1c6c9005ff6390.json — Scope narrowed on the stakeholder's decision (2026-10-17, after LLD review rounds 1-3)
- `code` src/indexer/parser/python.ts:124-126 — Python emits no general CALLS today
- `code` src/indexer/parser/go.ts:114-116 — Go emits no general CALLS today
- `code` src/indexer/cross-file-resolver.ts:499 — if (importedFiles.size === 0) return UNRESOLVED;

## Next

Proposed HLD amendment `AMD-c2ba6fa62a148ed1-7` (pending approval — it adds the new Story's boundary).

Approve the HLD amendment (`AMD-c2ba6fa62a148ed1-7`) and the updated Epic, then run `design.story` for the new Story `s12` to produce its LLD.

```
insrc_workflow_step phase=start workflow=design.story params={"epicHash":"c2ba6fa62a148ed1","storyId":"s12"}
```
