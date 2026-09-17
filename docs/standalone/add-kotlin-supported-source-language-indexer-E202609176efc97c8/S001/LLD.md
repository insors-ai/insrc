<!-- insrc:artifact LLD-6efc97c8dc73e0aa-S001 -->

# LLD: E202609176efc97c8:S001

**Epic:** `add-kotlin-supported-source-language-indexer`
**HLD base run:** `wf-1789669122761-famqd0`
**HLD effective hash:** `6efc97c8dc73...`

## HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## Contract details

**Surface level:** internal

### `KotlinParser`

```typescript
class KotlinParser implements CodeParser { readonly extensions: string[]; readonly language: Language; parse(filePath: string, source: string, repo: string, repoId: number): ParseResult }
```

**Returns:** `CodeParser` — A new parser (mirroring ScalaParser) that handles .kt/.kts, tags entities language='kotlin', and self-registers via registerParser at module load. extensions=['.kt','.kts']; language='kotlin' as const.

**Errors:**
- `(none surfaced from parse)` when parse() never throws on malformed Kotlin: a tree-sitter parse error still emits the package Module + cleanly-parsed top-level entities, with the file entity marked parse-error (same contract as ScalaParser).

**Preconditions:**
- The tree-sitter-kotlin grammar is loadable via _require and ABI-compatible with the pinned tree-sitter (^0.25); verified at build (openQuestion), a3 vendored-build is the fallback.

**Postconditions:**
- Registered in the parser registry so getParser('*.kt'/'*.kts') resolves to it.
- Emits typed Entity + Relation records: class/object/companion object/data class → Class (companion carries a '(companion of X)' signature suffix), interface → Interface, top-level fun → Function, member fun → Method, extension fun → Method (extension signature marker), val/var property → Variable, package → Module; DEFINES (file→top-level, container→member), IMPORTS (file→jvm Module stub), INHERITS (from the superclass constructor call in the supertype list), IMPLEMENTS (remaining supertypes), and CALLS/REFERENCES to HTTP/messaging endpoints via the shared client-shape helpers.

### `parse`

```typescript
parse(filePath: string, source: string, repo: string, repoId: number): ParseResult
```

**Parameters:**
- `filePath: string` — Absolute path to the .kt/.kts file.
- `source: string` — Full Kotlin source text to parse.
- `repo: string` — Repo root path, hashed into makeEntityId (stable hex-32 ids).
- `repoId: number` — u32 repo-registry id stamped onto every emitted Entity (strict-contract handle).

**Returns:** `ParseResult` — { entities: Entity[]; relations: Relation[] } — the same shape every parser returns; relations may be unresolved (to = raw name/import) for the Resolver to close.

**Preconditions:**
- Consumed unchanged from the CodeParser contract (base.ts); KotlinParser implements it, does not redefine it.

**Postconditions:**
- Kotlin import-stub Modules use MODULE_REPO_ID = SHARED_MODULES_REPO_ID['jvm'] so they dedup with Java/Scala imports (kotlin:'jvm' in the namespace map).

### `makeEntityId`

```typescript
makeEntityId(repo: string, file: string, kind: string, name: string): string
```

**Parameters:**
- `repo: string` — Repo root (part of the hash).
- `file: string` — File path (part of the hash).
- `kind: string` — Entity kind (part of the hash).
- `name: string` — Entity name (part of the hash).

**Returns:** `string` — Deterministic 32-char hex id = SHA256(repo\x00file\x00kind\x00name).slice(0,32). Consumed unchanged — KotlinParser calls it exactly like every other parser; no id-scheme change.

**Postconditions:**
- Consumed unchanged from base.ts; the Kotlin story introduces no new id construction.

### `registerParser`

```typescript
registerParser(parser: CodeParser): void
```

**Parameters:**
- `parser: CodeParser` — The KotlinParser instance to add to the extension-matched registry.

**Returns:** `void` — Adds the parser so getParser(filePath) matches it by extname. Consumed unchanged from registry.ts.

**Preconditions:**
- The kotlin.ts module must be imported for registration to fire (side-effect import in index.ts).

**Postconditions:**
- Consumed unchanged; kotlin.ts calls registerParser(kotlinParser) at module bottom exactly like scala.ts.

## Data model changes

### `KotlinParser (src/indexer/parser/kotlin.ts)` — new

New CodeParser subclass mirroring ScalaParser: loads tree-sitter-kotlin via _require + setLanguage, MODULE_NAMESPACE='jvm', extensions=['.kt','.kts'], language='kotlin', walks the Kotlin AST emitting entities + relations, and self-registers. Reuses the shared http-client-shapes + messaging-client-shapes helpers for CALLS-to-endpoint detection.

**Call sites:**
- `src/indexer/parser/scala.ts`
- `src/indexer/parser/base.ts`
- `src/indexer/parser/registry.ts`
- `src/indexer/parser/http-client-shapes.ts`
- `src/indexer/parser/messaging-client-shapes.ts`

### `Language union (shared/types.ts)` — field-add

Add the literal 'kotlin' to the Language string-union type. Additive — every existing Language value is unchanged; a new accepted tag.

```
export type Language = 'python' | 'go' | ... | 'java' | 'scala' | 'kotlin' | 'markdown' | ...
```

**Call sites:**
- `src/shared/types.ts:510`

### `lang→namespace map (shared/repo-namespaces.ts)` — field-add

Add kotlin:'jvm' alongside java:'jvm', scala:'jvm' so Kotlin import-stub Modules dedup into the shared jvm modules repo id (SHARED_MODULES_REPO_ID.jvm). Additive.

```
{ java:'jvm', scala:'jvm', kotlin:'jvm', ... }
```

**Call sites:**
- `src/shared/repo-namespaces.ts:69`

### `VALID_LANGUAGES (config/frontmatter.ts)` — field-add

Add 'kotlin' to the frontmatter VALID_LANGUAGES set so kotlin is an accepted language tag. Additive.

**Call sites:**
- `src/config/frontmatter.ts:47`

### `VALID_LANGUAGES (daemon/tools/builtins/code/class-locate.ts)` — field-add

Add 'kotlin' to the class-locate tool's VALID_LANGUAGES set so the code_class_locate tool accepts kotlin. Additive.

**Call sites:**
- `src/daemon/tools/builtins/code/class-locate.ts:47`

### `parser registration import (src/indexer/index.ts)` — field-add

Add the side-effect import `import './parser/kotlin.js';` alongside the other parser imports so KotlinParser self-registers at indexer startup. Additive.

**Call sites:**
- `src/indexer/index.ts:26`

### `tree-sitter-kotlin dependency (package.json)` — field-add

Add tree-sitter-kotlin at an ABI-compatible version (verified against tree-sitter ^0.25 at build) to dependencies, next to the other tree-sitter grammars. Additive.

**Call sites:**
- `package.json:74`

## Error paths

### Error cases

- **The tree-sitter-kotlin native grammar fails to load at module init (ABI mismatch with the pinned tree-sitter, missing prebuild, or broken install).** (recoverable)
  - Detection: The `_require('tree-sitter-kotlin')` / `setLanguage(KotlinGrammar)` call throws when kotlin.ts is imported (a native binding load error).
  - Response: Guard the grammar load + registration in kotlin.ts: on a load error, log a warning and SKIP registering KotlinParser (do not rethrow), so the side-effect import in index.ts can't take down the other 5 parsers. This is a deliberate divergence from the first-party grammars' unguarded load because tree-sitter-kotlin is a less-maintained community grammar. Degrades to today's behaviour (Kotlin unindexed) instead of crashing the indexer.
  - User impact: If the grammar can't load, Kotlin files are simply not indexed (as today) and every other language keeps working; the warning tells the operator to fix the install. Recoverable by reinstalling an ABI-compatible grammar (or the a3 vendored build).
- **A Kotlin source file has syntax errors or uses grammar-unsupported bleeding-edge syntax, so tree-sitter produces ERROR nodes / a partial tree.** (recoverable)
  - Detection: The parsed tree's rootNode reports an error (hasError) / ERROR nodes appear during the walk.
  - Response: Mirror ScalaParser's parse-error contract: still emit the package Module + every cleanly-parsed top-level entity, and mark the file entity with a parse-error marker; never throw out of parse().
  - User impact: Partially-parseable Kotlin files still contribute their clean top-level symbols to the graph; only the unparseable regions are missed. The file is flagged parse-error for transparency.
- **The walk encounters a Kotlin AST node kind that has no entry in the node-kind→EntityKind mapping (an unusual or newer Kotlin construct).** (recoverable)
  - Detection: The recursive tree walk reaches a named node whose type is not in KotlinParser's kind map.
  - Response: Skip the unmapped node (emit no entity/relation for it) and continue walking its children; never throw. New mappings can be added later without breaking existing extraction.
  - User impact: A rare/unusual construct is simply not surfaced as an entity; the rest of the file indexes normally. No crash, no data loss for mapped kinds.

### Edge cases

| Input | Expected |
| :--- | :--- |
| A .kts script file (top-level statements, no package clause). | Parses; top-level declarations (funcs, properties, classes) are still emitted with file→DEFINES; no package Module is emitted when there is no package clause (like a Scala file with no package). |
| A companion object inside a class. | Emitted as a Class entity whose signature carries a '(companion of <ClassName>)' suffix, matching the ScalaParser companion-object convention (no separate edge). |
| A data class. | Emitted as a Class with a `data` marker folded into its signature prefix (like Scala's case class), plus DEFINES to its properties. |
| An extension function `fun Foo.bar()`. | Emitted as a Method with an `extension` signature marker; the receiver type (Foo) is recorded in the signature so analyzer queries can grep it (mirrors Scala's `extension method`). |
| A top-level `object Singleton` (Kotlin singleton). | Emitted as a Class with an `object` signature marker (mirrors Scala object_definition→Class). |
| A class supertype list `class A : Base(), Iface1, Iface2`. | INHERITS to Base (the supertype with a constructor call), IMPLEMENTS to Iface1 and Iface2 (the remaining supertypes) — the Kotlin analogue of Scala's `extends A with B with C`. |
| An aliased import `import a.b.Foo as Bar`. | IMPORTS edge to the jvm Module stub for a.b.Foo with the alias recorded in meta.alias (mirrors Scala's renamed selector). |
| A repo mixing Kotlin, Java and Scala files. | All three index; their import-stub Modules dedup into the single shared jvm modules repo id (kotlin/java/scala all map to 'jvm'), so a shared JVM dependency is one node. |
| A file whose extension is .kt but whose content is not valid Kotlin. | getParser routes it to KotlinParser by extension; parse() applies the parse-error contract (emits what it can, marks the file) rather than failing. |

### Invariants to preserve

- Entity ids remain the deterministic hex-32 makeEntityId(repo, file, kind, name) = SHA256(repo\x00file\x00kind\x00name).slice(0,32). KotlinParser calls makeEntityId unchanged — it introduces no new id construction, so ids stay stable across re-index and consistent with every other language. [[c1]]
- Adding Kotlin is purely additive to the parser registry: registry.ts matches by extension and .kt/.kts collide with no existing parser's extensions, so the 5 existing parsers' behaviour is unchanged. The only shared-type change (Language union, VALID_LANGUAGES sets, namespace map) is an added literal, breaking no existing value. [[c1]]
- Kotlin import-stub Modules use MODULE_REPO_ID = SHARED_MODULES_REPO_ID['jvm'] (kotlin→'jvm' in the namespace map), so a JVM dependency referenced from Kotlin, Java or Scala dedups to one shared-module node — preserving the cross-language JVM linking the Scala/Java parsers already rely on. [[c2]]

## Test strategy

**Test framework:** `node:test via `npx tsx --test 'src/**/__tests__/*.test.ts'` (Node's built-in test runner + node:assert), co-located in src/indexer/parser/__tests__/ — the established per-parser convention (kotlin.test.ts mirrors scala.test.ts / java.test.ts).`

### Test levels

- **unit** — Verify KotlinParser.parse over representative Kotlin source strings emits the right Entity kinds + Relation kinds, mirroring scala.test.ts — no daemon, no real repo, just the parser + grammar.
  - Subjects: `A class with a supertype list `class A : Base(), Iface1, Iface2` -> Class entity for A; INHERITS to Base; IMPLEMENTS to Iface1 and Iface2; DEFINES file->A`, `An interface -> Interface entity; a class implementing it -> IMPLEMENTS`, ``object Singleton` -> Class with an `object` signature marker; a `companion object` inside a class -> Class with a `(companion of <ClassName>)` signature suffix`, `A `data class` -> Class with a `data` signature marker + DEFINES to its properties (val/var -> Variable)`, `A top-level `fun` -> Function; a member `fun` -> Method; an extension `fun Foo.bar()` -> Method with an `extension` marker recording receiver Foo`, ``package a.b` -> Module; `import a.b.Foo` -> IMPORTS to a jvm Module stub; `import a.b.Foo as Bar` -> IMPORTS with meta.alias='Bar'`, `A file whose class calls a recognised HTTP/messaging client -> CALLS/REFERENCES via the shared http/messaging-client-shapes helpers`, `A Kotlin file with a syntax error still emits its package + cleanly-parsed top-level entities and marks the file parse-error (never throws)`, `makeEntityId output for a given (repo,file,kind,name) is the stable hex-32 hash — re-parsing the same source yields identical ids`
  - Fixtures: `The tree-sitter-kotlin grammar loadable in the test process (same _require path as production)`, `Representative inline Kotlin source strings (class/interface/object/companion/data class/funcs/extension/properties/imports/package/parse-error) — the scala.test.ts fixture shape adapted to Kotlin syntax`
- **integration** — Verify the registration wiring end-to-end: after importing the indexer, the registry routes .kt/.kts to KotlinParser and a real Kotlin file yields non-zero entities.
  - Subjects: `After `import '../index.js'` (or importing kotlin.js), getParser('X.kt') and getParser('X.kts') both return the KotlinParser (language='kotlin'); supportedExtensions() includes '.kt' and '.kts'`, `Parsing a small real .kt file (e.g. a jetbrains-plugin/ source or an inline fixture) through the registry-selected parser yields a non-empty entities array (proves the hollow-Kotlin gap is closed)`, `A repo mixing Kotlin + Java/Scala: their import-stub Modules for a shared JVM dependency share one repo id (SHARED_MODULES_REPO_ID.jvm) — kotlin/java/scala dedup`
  - Fixtures: `The built indexer module (side-effect imports registered)`, `A small Kotlin fixture file / inline source`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `Integration: getParser('X.kt') and getParser('X.kts') return KotlinParser (language='kotlin') after import; supportedExtensions() includes .kt/.kts`, `Unit: `new KotlinParser().extensions` == ['.kt','.kts'] and `.language` == 'kotlin'` |
| `ac2` | `Unit: class/interface/object/companion object/data class/top-level fun/member fun/extension fun/val-var property/package each map to the expected Entity kind + signature marker`, `Unit: DEFINES edges from file->top-level and container->member entities` |
| `ac3` | `Unit: a supertype list emits INHERITS (superclass constructor call) + IMPLEMENTS (remaining supertypes); imports emit IMPORTS to jvm Module stubs (alias in meta.alias); a recognised client emits CALLS/REFERENCES`, `Integration: Kotlin/Java/Scala import stubs for a shared JVM dependency dedup into the single jvm shared-modules repo id` |
| `ac4` | `Unit: a parse-error Kotlin file still emits its package + clean top-level entities and marks the file parse-error, never throwing`, `Unit: makeEntityId ids are the stable hex-32 SHA256 and identical on re-parse; an unmapped node kind is skipped without throwing`, `Integration: parsing a real Kotlin file yields a non-empty entities array (the hollow-Kotlin gap is closed)` |

## Migration

**State before:** The indexer supports 5 source languages (typescript/javascript, python, go, java, scala) plus doc/config formats; registry.ts matches parsers by extension and there is no parser whose extensions include .kt/.kts, so getParser('X.kt') returns null and Kotlin files produce zero entities (s1: base.ts CodeParser + registry.ts; the 5 parser files under src/indexer/parser). The Language union (shared/types.ts:510) and both VALID_LANGUAGES sets (config/frontmatter.ts:47, daemon/tools/builtins/code/class-locate.ts:47) do not include 'kotlin'. Consequence: the jetbrains-plugin/ Kotlin and any Kotlin repo are invisible to the graph, so insrc_analyze / insrc_code_review_step ground hollow on Kotlin.

**State after:** A KotlinParser (src/indexer/parser/kotlin.ts) is registered for .kt/.kts and emits typed Entity + Relation records; 'kotlin' is an accepted Language value (union + both VALID_LANGUAGES sets), maps to the jvm shared-modules namespace, and tree-sitter-kotlin is a declared dependency. After a re-index, Kotlin repos yield real symbols and Kotlin-targeted analyze/code-review ground on actual entities instead of hollow file stubs. The 5 existing languages are unchanged.

**Zero downtime:** yes — **Data rewrite:** yes

### Steps

1. Add the tree-sitter-kotlin dependency to package.json (ABI-compatible with tree-sitter ^0.25) and run install; verify the native binding loads with a smoke `_require('tree-sitter-kotlin')` + trivial parse. If it is ABI-incompatible, switch to the a3 vendored/built-grammar path before proceeding. — ↩ rollbackable
2. Add src/indexer/parser/kotlin.ts (KotlinParser) with a guarded grammar load that skips registration + logs on load failure, and wire the additive edits: 'kotlin' into the Language union, kotlin:'jvm' into the namespace map, 'kotlin' into both VALID_LANGUAGES sets, and the side-effect `import './parser/kotlin.js'` in index.ts. Add kotlin.test.ts. — ↩ rollbackable
3. Build (tsc + copy-assets) and run the test sweep; confirm the KotlinParser unit + registry integration tests pass and the existing suites are unaffected. — ↩ rollbackable
4. Deploy the updated daemon and trigger a re-index of any registered Kotlin-containing repo so its .kt/.kts files (previously skipped) are parsed into entities/relations. New Kotlin entities are additive; existing non-Kotlin entities and their ids are untouched. — ↩ rollbackable

**Backward compat:** Fully backward-compatible and additive. The Language union only WIDENS ('kotlin' added; no existing literal changed or removed), so every existing consumer keeps type-checking and every existing entity's language tag is unchanged. Entity ids stay the exact makeEntityId hex-32 scheme, so existing (non-Kotlin) entity ids do not move. The parser registry is extension-matched and .kt/.kts collide with no existing parser, so the 5 existing parsers behave identically. Rollback is clean: reverting the files + removing the dep returns to stateBefore (Kotlin files simply stop being parsed on the next index); the guarded grammar load means even a broken Kotlin grammar degrades to the pre-feature behaviour rather than breaking the other languages.

## Alternatives considered

### a1: Native tree-sitter-kotlin npm package + KotlinParser mirroring scala.ts — **CHOSEN**

Add the published tree-sitter-kotlin native grammar as an npm dep (pinned to an ABI-compatible version) and a kotlin.ts KotlinParser that loads it via `_require` + `setLanguage`, exactly like every existing parser.

Add `tree-sitter-kotlin` to package.json at a version whose native Node bindings are ABI-compatible with the pinned `tree-sitter` (^0.25). Introduce src/indexer/parser/kotlin.ts as a `class KotlinParser implements CodeParser` with `extensions = ['.kt','.kts']`, `language = 'kotlin' as const`, `MODULE_NAMESPACE = 'jvm'` (shares the jvm shared-modules repo id with Java/Scala), loading the grammar via `const KotlinGrammar = _require('tree-sitter-kotlin')` + `setLanguage(KotlinGrammar)` and walking the tree to emit typed Entity + Relation records for the Kotlin node kinds (class/object/companion object/data class → Class/Interface, top-level + member fun → Function/Method, extension fun → Method with an `extension` signature marker, val/var property → Variable, package → Module; DEFINES/IMPORTS, INHERITS from the superclass call, IMPLEMENTS from remaining supertypes, CALLS/REFERENCES via the shared http/messaging-client-shapes helpers). Ends with `export const kotlinParser = new KotlinParser(); registerParser(kotlinParser)` and a side-effect `import './parser/kotlin.js'` in index.ts. Wire the enum ('kotlin' in Language + kotlin:'jvm' in the namespace map) and both VALID_LANGUAGES sets. Deterministic ids via makeEntityId unchanged.

### a2: WASM grammar via web-tree-sitter

Load a tree-sitter-kotlin.wasm through web-tree-sitter instead of native bindings, sidestepping the native ABI question.

Bundle a prebuilt tree-sitter-kotlin.wasm and initialize it through web-tree-sitter's async Parser.init() + Language.load(), then extract entities/relations the same way. Because WASM init is asynchronous and the CodeParser.parse() contract is synchronous (all existing parsers construct + setLanguage at module load, synchronously), this requires either an async pre-init step gating the parser registry or a blocking init shim.

**Rejected because:** Dodges the native ABI question but breaks the synchronous CodeParser contract (async WASM init), adds a second tree-sitter runtime, and risks the shared http/messaging helpers — a large divergence for one language.

### a3: Vendored grammar built at install (git dependency / submodule + node-gyp)

Pull the tree-sitter-kotlin grammar source (git dep or vendored) and build the native binding locally in a postinstall step, then the same KotlinParser as a1.

If no npm-published tree-sitter-kotlin has ABI-compatible bindings, depend on the grammar via a git URL (or vendor its sources) and compile the native addon during install (node-gyp, against the repo's Node headers), producing the same `_require`-loadable native module a1 consumes. The kotlin.ts parser + all wiring are identical to a1; only the dependency-acquisition mechanism differs.

**Rejected because:** Same parser + wiring as a1 (parity + jvm-linking satisfied), but acquires the grammar via a from-source node-gyp build — heavier install + ongoing vendoring. The right FALLBACK when a1's published bindings are ABI-incompatible, not the default.

## Open questions

- Does a published tree-sitter-kotlin have Node bindings ABI-compatible with the pinned tree-sitter ^0.25? Verify at build via install + a smoke _require + trivial parse; if incompatible, use the a3 vendored/built-grammar fallback.

## Resolved questions

- `qefb5ae57` — Does a published tree-sitter-kotlin have Node bindings ABI-compatible with the pinned tree-sitter ^0.25? Verify at build via install + a smoke _require + trivial parse; if incompatible, use the a3 vendored/built-grammar fallback.
  - **resolved**: Spike now, pin one path — a1 CONFIRMED — Spiked empirically: tree-sitter@0.25.1 + tree-sitter-kotlin@0.3.8 install (with --legacy-peer-deps, since its peer-dep is tree-sitter ^0.21) and interoperate — setLanguage + parse work, real Kotlin AST produced (source_file/package_header/import_list/class_declaration/object_declaration/function_declaration). So a1 (native npm grammar) is the pinned path. The plan encodes a1 with tree-sitter-kotlin@0.3.8 + a legacy-peer-deps install note; the smoke require+parse stays as a permanent regression unit test (not a runtime branch); a3 (vendored build) is documented as fallback only. _(2026-09-17T18:41:43.373Z)_

## Citations

- **[[c1]]** `analyze-bundle` `symbol.locate: CodeParser contract + registry + makeEntityId (src/indexer/parser/base.ts, registry.ts) — extension-matched registration, deterministic hex-32 ids`
- **[[c2]]** `analyze-bundle` `capability-discovery: scala.ts JVM template (src/indexer/parser/scala.ts:794-795,862-863) — _require grammar load, MODULE_NAMESPACE='jvm' shared-modules dedup, entity/relation extraction, self-registration; http/messaging-client-shapes`
- **[[c3]]** `analyze-bundle` `boundary-scope: the additive edit sites — Language union (shared/types.ts:510), lang→namespace map (shared/repo-namespaces.ts:69), side-effect import (src/indexer/index.ts:26), VALID_LANGUAGES x2 (config/frontmatter.ts:47, daemon/tools/builtins/code/class-locate.ts:47), tree-sitter deps (package.json:74)`
- **[[c4]]** `analyze-bundle` `test.locate: per-parser tests in src/indexer/parser/__tests__/ (scala.test.ts, java.test.ts); node:test via `npx tsx --test``
- **[[c5]]** `code` `package.json:74-80 — the pinned tree-sitter ^0.25 + grammar versions (go/js/py/ts ^0.25, java 0.23.5, scala 0.24.0) the tree-sitter-kotlin binding must be ABI-compatible with`
- **[[c6]]** `doc` `CLAUDE.md — native modules built against Node 22 headers (.npmrc); no direct cloud path; tree-sitter parsing stack (TS/Python/Go/Java/Scala) the Kotlin addition extends`
