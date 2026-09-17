<!-- insrc:artifact PLAN-6efc97c8dc73e0aa-S001 -->

# Plan: E202609176efc97c8:S001

**Epic:** `add-kotlin-supported-source-language-indexer`
**LLD run:** `wf-1789669122761-famqd0`
**LLD effective hash:** `6efc97c8dc73...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add tree-sitter-kotlin dependency + install handling + smoke-verify | S | — | smoke: install-time: _require('tree-sitter-kotlin') + setLanguage + parse('package a\nclass A') yields a source_file root | [[c3]] [[c5]] |
| 2 | **`t2`** KotlinParser (src/indexer/parser/kotlin.ts) | L | `t1` | unit: KotlinParser.parse emits the expected entity + relation kinds over inline Kotlin (entity/relation extraction, in kotlin.test.ts) | [[c1]] [[c2]] [[c4]] [[c6]] |
| 3 | **`t3`** Additive wiring (Language union, namespace map, VALID_LANGUAGES x2, side-effect import) | S | `t2` | integration: after importing the indexer, getParser('X.kt'/'X.kts') returns KotlinParser + supportedExtensions() includes them (registration wiring) | [[c3]] |
| 4 | **`t4`** kotlin.test.ts (unit + registry integration + smoke regression) | M | `t3` | unit: kotlin.test.ts: class/interface/object/companion/data class/funcs/extension/property/package → correct Entity kinds + signature markers + DEFINES; unit: kotlin.test.ts: supertype INHERITS+IMPLEMENTS, imports (alias in meta.alias) → IMPORTS, a recognised client → CALLS/REFERENCES; unit: kotlin.test.ts: parse-error file emits package + clean top-level entities + marks file (never throws); unmapped node skipped; makeEntityId stable hex-32; integration: kotlin.test.ts: getParser routes .kt/.kts to KotlinParser + a real Kotlin fixture yields non-empty entities; kotlin/java/scala jvm import dedup; smoke: kotlin.test.ts: committed regression — the tree-sitter-kotlin grammar loads + parses (red on a broken dep bump) | [[c7]] |
| 5 | **`t5`** Build + full test sweep | S | `t4` | integration: full build (tsc + copy-assets) + `npx tsx --test 'src/**/__tests__/*.test.ts'` sweep green incl. kotlin.test.ts, no regressions | [[c1]] [[c7]] |

### E202609176efc97c8:S001:T001 — Add tree-sitter-kotlin dependency + install handling + smoke-verify

Add tree-sitter-kotlin@0.3.8 to package.json dependencies next to the other tree-sitter grammars. Because its peer-dep is tree-sitter ^0.21 while the repo pins ^0.25, make the install succeed deterministically — prefer a package.json `overrides` (or `.npmrc legacy-peer-deps=true`) so a plain `npm install` resolves; document the choice. Run install and a smoke check: `_require('tree-sitter-kotlin')` + `new Parser().setLanguage(grammar)` + parse a trivial Kotlin string, asserting a source_file root with real named children (the spike proved this works against tree-sitter 0.25.1). If the native binding fails to load for the daemon's Node ABI, fall to the a3 vendored/built-grammar path before proceeding.

**Acceptance checks:**
- package.json lists tree-sitter-kotlin@0.3.8 alongside the other tree-sitter grammars, and a fresh `npm install` resolves without an ERESOLVE failure (via overrides / legacy-peer-deps).
- A smoke `_require('tree-sitter-kotlin')` + setLanguage + parse('package a\nclass A') returns a source_file root with named children (grammar loads + parses under the installed tree-sitter).
- If the grammar cannot load for the target Node ABI, the a3 vendored-build fallback is used instead (documented).

### E202609176efc97c8:S001:T002 — KotlinParser (src/indexer/parser/kotlin.ts)

Add src/indexer/parser/kotlin.ts mirroring scala.ts, implemented in 3 layers on a compiling base (t4 unit tests gate each): LAYER 1 — _require('tree-sitter') + _require('tree-sitter-kotlin') GUARDED in try/catch (on load failure, log a warning + skip registration so index.ts's side-effect import can't crash the other 5 parsers), MODULE_NAMESPACE='jvm' + MODULE_REPO_ID=SHARED_MODULES_REPO_ID['jvm'], imports (makeEntityId from base.js, registerParser from registry.js, the http/messaging-client-shape helpers), class skeleton `class KotlinParser implements CodeParser { extensions=['.kt','.kts']; language='kotlin' as const; parse(filePath,source,repo,repoId) }` + `export const kotlinParser = new KotlinParser(); registerParser(kotlinParser)` inside the guard. LAYER 2 — entity extraction over the REAL tree-sitter-kotlin node kinds: package_header→Module; class_declaration→Class (interface class_modifier→Interface; data/sealed/abstract markers in signature); companion_object→Class '(companion of X)'; object_declaration→Class 'object'; function_declaration→Function (top-level)/Method (in class_body), leading user_type receiver→extension Method; property_declaration/class_parameter→Variable; DEFINES file→top-level + container→member; makeEntityId unchanged. LAYER 3 — relations + robustness: import_list→import_header(+import_alias→meta.alias)→IMPORTS to jvm Module stubs; delegation_specifier: constructor_invocation→INHERITS, user_type→IMPLEMENTS; CALLS/REFERENCES via the shared helpers; parse-error contract (rootNode.hasError → still emit package + clean top-level entities, mark file parse-error, never throw); unmapped node kinds skipped.

**Acceptance checks:**
- kotlin.ts exports KotlinParser with extensions ['.kt','.kts'], language 'kotlin', and self-registers inside a guarded grammar load (load failure logs + skips registration, never throws).
- parse() emits the correct Entity kind + signature marker for class/interface/object/companion object/data class, top-level/member/extension fun, val/var property, and package — mapping the real tree-sitter-kotlin node kinds.
- parse() emits DEFINES (file→top-level, container→member), IMPORTS (jvm Module stubs, alias in meta.alias), INHERITS (superclass constructor_invocation), IMPLEMENTS (remaining supertypes), and CALLS/REFERENCES via the shared helpers.
- makeEntityId is called unchanged (stable hex-32 ids); a parse-error file still emits its package + clean entities and marks the file, never throwing; unmapped node kinds are skipped.

### E202609176efc97c8:S001:T003 — Additive wiring (Language union, namespace map, VALID_LANGUAGES x2, side-effect import)

Wire the additive edits so kotlin is a first-class language: add 'kotlin' to the Language union (shared/types.ts:510, after 'scala'); add kotlin:'jvm' to the lang→namespace map (shared/repo-namespaces.ts:69-70, after java/scala); add `import './parser/kotlin.js';` to the side-effect imports in src/indexer/index.ts (so registration fires); add 'kotlin' to both VALID_LANGUAGES sets (config/frontmatter.ts:47 and daemon/tools/builtins/code/class-locate.ts:47). All additive — no existing value changed.

**Acceptance checks:**
- 'kotlin' is in the Language union and in both VALID_LANGUAGES sets; kotlin:'jvm' is in the namespace map (so Kotlin imports share the jvm shared-modules repo id).
- src/indexer/index.ts imports './parser/kotlin.js' among the side-effect parser imports so KotlinParser self-registers at startup.
- tsc typechecks clean after the edits (the widened union type-checks everywhere).

### E202609176efc97c8:S001:T004 — kotlin.test.ts (unit + registry integration + smoke regression)

Add src/indexer/parser/__tests__/kotlin.test.ts (node:test, mirroring scala.test.ts): unit tests feeding inline Kotlin source to `new KotlinParser().parse(...)` asserting the entity kinds + relation kinds (class/interface/object/companion/data class; top-level/member/extension fun; val/var property; package/import incl. alias; supertype INHERITS+IMPLEMENTS; a recognised HTTP/messaging client emits CALLS; a parse-error file emits clean entities + marks the file; makeEntityId stable). A registry integration test: after importing the indexer, getParser('X.kt'/'X.kts') returns the KotlinParser and supportedExtensions() includes .kt/.kts; a real Kotlin fixture yields a non-empty entities array. A smoke regression test: _require('tree-sitter-kotlin') + setLanguage + parse succeeds (guards a future dep bump that breaks loading).

**Acceptance checks:**
- kotlin.test.ts unit tests cover every entity kind + relation kind + the parse-error contract + makeEntityId stability, over inline Kotlin source.
- An integration test proves getParser routes .kt/.kts to KotlinParser (language 'kotlin'), supportedExtensions() includes them, and a real Kotlin fixture yields non-empty entities.
- A smoke regression test asserts the grammar loads + parses (turns red on a broken dep).

### E202609176efc97c8:S001:T005 — Build + full test sweep

Run `npm run build` (tsc + copy-assets.mjs) and the full test sweep `npx tsx --test 'src/**/__tests__/*.test.ts'`; confirm kotlin.test.ts passes and the existing suites (incl. the other parsers + repo-strict-contract) are unaffected. Fix any typecheck/test fallout from the additive edits.

**Acceptance checks:**
- `npm run build` (tsc --noEmit clean + copy-assets) succeeds with kotlin.ts + the edits.
- The full `npx tsx --test 'src/**/__tests__/*.test.ts'` sweep is green, including kotlin.test.ts and the pre-existing suites (no regressions).

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| A class with a supertype list `class A : Base(), Iface1, Iface2` -> Class entity for A; INHERITS to Base; IMPLEMENTS to Iface1 and Iface2; DEFINES file->A | `t4` |
| An interface -> Interface entity; a class implementing it -> IMPLEMENTS | `t4` |
| `object Singleton` -> Class with an `object` signature marker; a `companion object` inside a class -> Class with a `(companion of <ClassName>)` signature suffix | `t4` |
| A `data class` -> Class with a `data` signature marker + DEFINES to its properties (val/var -> Variable) | `t4` |
| A top-level `fun` -> Function; a member `fun` -> Method; an extension `fun Foo.bar()` -> Method with an `extension` marker recording receiver Foo | `t4` |
| `package a.b` -> Module; `import a.b.Foo` -> IMPORTS to a jvm Module stub; `import a.b.Foo as Bar` -> IMPORTS with meta.alias='Bar' | `t4` |
| A file whose class calls a recognised HTTP/messaging client -> CALLS/REFERENCES via the shared http/messaging-client-shapes helpers | `t4` |
| A Kotlin file with a syntax error still emits its package + cleanly-parsed top-level entities and marks the file parse-error (never throws) | `t4` |
| makeEntityId output for a given (repo,file,kind,name) is the stable hex-32 hash — re-parsing the same source yields identical ids | `t4` |
| After `import '../index.js'` (or importing kotlin.js), getParser('X.kt') and getParser('X.kts') both return the KotlinParser (language='kotlin'); supportedExtensions() includes '.kt' and '.kts' | `t4` |
| Parsing a small real .kt file (e.g. a jetbrains-plugin/ source or an inline fixture) through the registry-selected parser yields a non-empty entities array (proves the hollow-Kotlin gap is closed) | `t4` |
| A repo mixing Kotlin + Java/Scala: their import-stub Modules for a shared JVM dependency share one repo id (SHARED_MODULES_REPO_ID.jvm) — kotlin/java/scala dedup | `t4` |

## Citations

- **[[c1]]** `prior-artifact` `LLD S001 contractDetails — KotlinParser/parse + consumed CodeParser/makeEntityId/registerParser (stable hex-32 ids, extension-matched registry)`
- **[[c2]]** `analyze-bundle` `s1 capability-discovery — scala.ts template shape (src/indexer/parser/scala.ts:56,66,794-795,862-863): _require grammar load, MODULE_NAMESPACE='jvm', self-registration`
- **[[c3]]** `analyze-bundle` `s1 boundary-scope — additive edit sites: Language union (types.ts:510), namespace map (repo-namespaces.ts:69), index.ts:26 side-effect import, VALID_LANGUAGES x2 (frontmatter.ts:47, class-locate.ts:47)`
- **[[c4]]** `analyze-bundle` `s1 capability-discovery — the REAL tree-sitter-kotlin@0.3.8 node kinds from the spike (package_header/import_list/class_declaration/delegation_specifier/companion_object/object_declaration/function_declaration/property_declaration)`
- **[[c5]]** `code` `package.json:74-80 tree-sitter grammar deps + the tree-sitter-kotlin@0.3.8 peer-dep ^0.21 vs repo ^0.25 (spiked: works via --legacy-peer-deps)`
- **[[c6]]** `prior-artifact` `LLD S001 errorPaths + jvm-dedup invariant — guarded grammar load, parse-error contract, MODULE_REPO_ID jvm shared-modules dedup, client-shape CALLS helpers`
- **[[c7]]** `prior-artifact` `LLD S001 testStrategy — node:test unit + registry integration + smoke regression in src/indexer/parser/__tests__/`
