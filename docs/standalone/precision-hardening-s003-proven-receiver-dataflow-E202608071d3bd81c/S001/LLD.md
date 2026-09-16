<!-- insrc:artifact LLD-1d3bd81c5560de0d-S001 -->

# LLD: S001

**Epic:** `precision-hardening-s003-proven-receiver-dataflow`
**HLD base run:** `wf-1786115454112-4hu0n2`
**HLD effective hash:** `1d3bd81c5560...`

## HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## Contract details

**Surface level:** internal

### `walkForCalls`

```typescript
function walkForCalls(node: SyntaxNode, callerId: string, repo: string, filePath: string, relations: Relation[], seen: Set<string>, axiosScopes: Set<string>[]): void
```

**Parameters:**
- `node: SyntaxNode` — current AST node being walked
- `callerId: string` — entity id of the enclosing function/method (CALLS_HTTP.from)
- `repo: string` — repo path for relation meta
- `filePath: string` — file path for relation meta
- `relations: Relation[]` — accumulator the recognizer pushes CALLS/CALLS_HTTP into
- `seen: Set<string>` — CALLS dedup set
- `axiosScopes: Set<string>[]` — REPLACES the old flat `localHttp: Set<string>` param: a stack of per-lexical-scope axios-var proof frames (innermost last). A receiver is proven iff the nearest frame that declares the name proves it as an axios.create var; a nearer non-axios declaration of the same name shadows it. On entering a function/arrow/method scope, push that scope's collectLocalAxiosVars(scope) frame and pop on exit; captured (not re-declared) outer axios vars still resolve via an outer frame.

**Returns:** `void` — mutates `relations` in place; emits at most one CALLS_HTTP per proven receiver call-site

**Preconditions:**
- axiosScopes contains one frame per enclosing lexical scope from outermost to innermost

**Postconditions:**
- A `<recv>.<verb>(url)` emits CALLS_HTTP only when isHttpVerb(verb) AND (currentClassHttpFields.has(recv) for the NEAREST enclosing class OR recv resolves to an axios proof in its nearest declaring scope frame)
- A receiver whose name is re-declared (shadowed) by a non-axios binding in a nearer scope does NOT emit
- On entering a class/class_declaration node, currentClassHttpFields is saved, set to that inner class's collectClassHttpFields, and restored on exit (so a method-body-declared inner class no longer inherits the outer class's this.<field> proof)

### `collectLocalAxiosVars`

```typescript
function collectLocalAxiosVars(scope: SyntaxNode): Set<string>
```

**Parameters:**
- `scope: SyntaxNode` — a single lexical scope node (function/arrow/method body) whose DIRECTLY-declared axios.create vars are collected

**Returns:** `Set<string>` — names declared by `const x = axios.create(...)` directly within this scope; the DFS stops at nested function/arrow scope boundaries so each scope owns its own frame (mirrors collectClassHttpFields stopping at nested class boundaries)

**Postconditions:**
- A name declared in a nested inner scope is NOT included in the outer scope's frame
- Only axios.create declarators contribute; a same-named non-axios declarator in this scope does not add the name (and, being the nearest frame, shadows an outer proof at resolution time)

### `collectPyProvenHttpReceivers`

```typescript
function collectPyProvenHttpReceivers(root: SyntaxNode): Set<string>
```

**Parameters:**
- `root: SyntaxNode` — the function subtree whose requests.Session()/httpx.Client() proofs are collected

**Returns:** `Set<string>` — names PROVEN HTTP clients under last-binding-wins: a name whose LAST assignment in the subtree is the factory is proven; a name later reassigned with a non-factory RHS is removed

**Postconditions:**
- A proven name reassigned with a non-factory RHS later in the same function drops out of the set
- A name whose final binding is the factory stays proven even if an earlier binding was non-factory

### `walkPythonForHttpCalls`

```typescript
function walkPythonForHttpCalls(root: SyntaxNode, callerId: string, repo: string, filePath: string, relations: Relation[]): void
```

**Parameters:**
- `root: SyntaxNode` — function subtree
- `callerId: string` — enclosing function entity id
- `repo: string` — repo path
- `filePath: string` — file path
- `relations: Relation[]` — relation accumulator

**Returns:** `void` — unchanged signature; consumes the corrected (rebind-aware) proven set from collectPyProvenHttpReceivers

**Postconditions:**
- A `<obj>.<verb>(url)` emits CALLS_HTTP only when obj is in the rebind-corrected proven set

## Data model changes

### `CALLS_HTTP relation` — invariant-change

No shape change to the CALLS_HTTP relation (kind/from/to/resolved/meta unchanged). The EMISSION invariant is tightened: an instance-client CALLS_HTTP is minted only when the receiver resolves to a proof in its NEAREST lexical scope (axios var frame or nearest-class this.<field>), and in Python only when the receiver's final binding is a factory. Strictly narrows false positives; never widens.

**Call sites:**
- `src/indexer/parser/typescript.ts (walkForCalls -> emitCallsHttp instance-client branch)`
- `src/indexer/parser/python.ts (walkPythonForHttpCalls -> emitCallsHttp attribute branch)`

## Error paths

### Error cases

- **A scope/class node lacks the expected child fields (e.g. childForFieldName('type')/('name')/('value')/('function') returns null on an incomplete or error node)** (recoverable)
  - Detection: The optional-chained field reads (`typeNode`, `nameNode`, `value?.type`, `fn?.text`) evaluate to null/undefined and the guard is false
  - Response: Skip that binding — do not add a proof, do not emit; continue the walk (fail-closed, no throw)
  - User impact: The one ambiguous call-site is simply not recognized as HTTP; no crash, no bogus edge
- **axiosScopes stack underflow — a receiver referenced with no enclosing scope frame pushed (e.g. top-level module code)** (recoverable)
  - Detection: The resolution loop finds no frame declaring the name; the stack may be empty
  - Response: Treat as unproven (no frame proves it) — emit nothing rather than throwing on an empty stack
  - User impact: Top-level (non-function) axios usage that was never in scope of the local-var proof is unaffected — same as today

### Edge cases

| Input | Expected |
| :--- | :--- |
| Outer `const client = axios.create()`; a nested callback does `arr.forEach(() => client.get(url))` WITHOUT re-declaring client | Emits one CALLS_HTTP — the closure captures the outer axios var; no nearer frame shadows `client`, so it resolves to the outer axios proof |
| Outer `const client = axios.create()`; a nested callback does `arr.forEach(() => { const client = new Map(); client.get(k); })` | No CALLS_HTTP for the nested `client.get` — the inner scope frame declares `client` (non-axios), shadowing the outer proof at its nearest declaration |
| Same body: outer `client.get(url)` (axios) AND a nested shadow `const client = new Map(); client.get(k)` | Exactly one CALLS_HTTP — for the outer axios call only; the nested shadowed read does not emit (outer capture preserved, inner shadow subtracted) |
| class Outer { constructor(private http: HttpClient){} m(){ class Inner { http = new Map(); go(){ return this.http.get('k'); } } } } | No CALLS_HTTP for Inner.go — entering the Inner class node saves+switches currentClassHttpFields to Inner's (empty) set; restored to Outer's on exit |
| class Outer { constructor(private http: HttpClient){} m(){ return this.http.get('https://api/x'); class Inner { http = new Map(); } } } | One CALLS_HTTP — Outer.m's this.http.get still emits (Outer frame active); the inner class declaration does not disturb the outer proof after restore |
| Python: `s = requests.Session(); s.get('https://a'); s = {}; s.get('k')` | One CALLS_HTTP — for the first `s.get` while the final binding logic must still credit the factory-proven use; the post-rebind `s.get('k')` (dict) does not emit |
| Python: `s = {}; s = requests.Session(); s.get('https://a')` (proven is the FINAL binding) | One CALLS_HTTP — last-binding-wins keeps `s` proven because its final assignment is the factory |
| A receiver named like an axios var but never declared in any enclosing scope (free/imported identifier) | No CALLS_HTTP — unproven; unchanged from today |

### Invariants to preserve

- The Angular `this.http.get(url)` HttpClient-DI happy path still emits exactly one CALLS_HTTP with the raw URL for the class that actually declares an HttpClient-typed field/ctor-param. [[c1]]
- The `const c = axios.create(); c.post(url)` local-instance happy path still emits one CALLS_HTTP when c is not shadowed. [[c1]]
- An unproven receiver (`foo.get`, `new Map().get`, a param named http typed as SomethingElse) still emits ZERO CALLS_HTTP. [[c1]]
- Python `s = requests.Session(); s.get(url)` / `httpx.Client()` happy path still emits one CALLS_HTTP. [[c2]]
- emitCallsHttp still pushes exactly one unresolved CALLS_HTTP per proven call-site and skips an empty URL expression (no empty-`to` node); matchHttpClient module-rooted matches (fetch/axios.get/http.request) are unaffected. [[c3]]
- Existing precision tests (cross-method lexical scope, cross-class field scope) continue to pass unchanged under the same parse()->httpRels() harness. [[c4]]

## Test strategy

**Test framework:** `node:test (node --test / tsx --test) with node:assert/strict, matching src/indexer/parser/__tests__/http-client-shapes.test.ts and http-recognizer-py-go.test.ts`

### Test levels

- **unit** — Prove each residual is closed and every happy-path/precision invariant still holds, using the existing parse()->httpRels() harness over inline source strings.
  - Subjects: `typescriptParser.parse -> walkForCalls axios-scope resolution (nested-closure shadow subtract + outer-capture preserved)`, `typescriptParser.parse -> currentClassHttpFields save/switch/restore for a class declared inside a method body`, `collectPyProvenHttpReceivers last-binding-wins rebind handling via typescriptParser/pythonParser.parse`
  - Fixtures: `Inline TS source: outer axios.create + nested closure that (a) captures and (b) shadows with new Map()`, `Inline TS source: Outer class with HttpClient ctor-param + Inner class declared in a method with an http:Map field`, `Inline Python source: s = requests.Session(); s.get(url); s = {}; s.get(k)  and the reversed final-binding form`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `PRECISION (nested shadow): outer `const client = axios.create()` captured in a closure emits one CALLS_HTTP, but a nested `const client = new Map(); client.get(k)` in a callback emits ZERO`, `PRECISION (outer capture preserved): a closure that references the un-redeclared outer axios var still emits one CALLS_HTTP` |
| `ac2` | `PRECISION (inner class in method): an Inner class declared inside a method, whose `http` field is a Map, emits ZERO CALLS_HTTP for this.http.get; the Outer HttpClient this.http.get in the same method still emits one` |
| `ac3` | `PRECISION (python rebind): `s = requests.Session(); s.get(url); s = {}; s.get(k)` does not emit for the post-rebind dict read; `s = {}; s = requests.Session(); s.get(url)` (final binding is factory) emits one` |

## Migration

**State before:** Per s1: the TS recognizer proves instance receivers from a body-wide flat `localHttp` set (collectLocalAxiosVars descends into nested closures, typescript.ts:713) and a module-level `currentClassHttpFields` that is switched only via extractClass (:304) — so a class DECLARED inside a method body (walked only by walkForCalls) inherits the outer class's this.<field> proof. The Python recognizer (collectPyProvenHttpReceivers, python.ts:330) collects every factory-assigned name into a flat set with no rebind handling. Net effect: three name-keyed false-positive cases — nested-closure shadow of an axios var, method-body-declared inner class, and Python same-function rebind — can emit spurious CALLS_HTTP.

**State after:** Receiver-proof resolves to the NEAREST lexical declaration: axios proofs are per-scope frames (a nested non-axios re-declaration shadows the outer proof; a plain outer-capture still resolves), currentClassHttpFields is saved/switched/restored when walkForCalls enters ANY class node (including one declared in a method body), and Python proofs follow last-binding-wins (a rebound name drops out). Strictly fewer CALLS_HTTP edges; all happy paths and existing precision tests unchanged.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Ship the recognizer changes (typescript.ts scope-frame axios resolution + inner-class save/restore; python.ts last-binding-wins) behind no flag — the parsers are pure functions invoked during indexing. — ↩ rollbackable
2. On next index / re-index of any affected source file, the parser naturally re-emits the narrowed CALLS_HTTP set for that file; stale false-positive edges from the prior heuristic are replaced during the normal per-file upsert. No manual backfill or bulk edge rewrite is required — coverage refreshes as files are re-parsed. — ↩ rollbackable
3. Optionally trigger a full re-index of repos that heavily use the affected patterns to purge any lingering pre-fix false-positive CALLS_HTTP edges immediately rather than on next file touch. — ↩ rollbackable

**Backward compat:** All four functions are module-internal (surfaceLevel internal); no exported/public API changes shape. walkForCalls's private param changes from `localHttp: Set<string>` to an axios scope stack — internal only, no external caller. The CALLS_HTTP relation shape (kind/from/to/resolved/meta) is unchanged, so downstream graph consumers and stored edges remain format-compatible; the only observable difference is fewer spurious edges. Reverting the commit fully restores prior behaviour.

## Alternatives considered

### a1: Lexical proof-frame stack in the walk

Turn the two flat name-sets into a stack of proof frames pushed/popped as walkForCalls descends into each new lexical scope; a receiver resolves against the nearest frame.



**Rejected because:** Rank 2: correct-by-construction and removes the module-level mutable, but M-cost and a walkForCalls rewrite over-scope a 2-MED-1-LOW fix; scored only 'partial' on regression-safety and does not unify the Python path anyway.

### a2: Targeted shadow/rebind subtraction at scope boundaries — **CHOSEN**

Keep the current flat-set design but subtract proofs where a nearer binding overrides them: closure-local shadow kills, inner-class clear, Python same-function rebind drop.



### a3: Full per-scope symbol table with binding kinds

Build a proper scoped symbol table (binding name -> kind: httpClient | other) for each parsed file and resolve every receiver against it.



**Rejected because:** Rank 3: 'violates' regression-safety — a new symbol-resolution subsystem far exceeds the story's small size, and tree-sitter carries no type info so the httpClient binding kind stays heuristic (negligible precision gain over a2).

## Citations

- **[[c1]]** `analyze-bundle` `s1 symbol.locate — TS proven-receiver dataflow (typescript.ts:733/:713/:688/:683/:304); root-cause of MED1 nested-closure shadow + MED2 inner-class-in-method` — "a class DECLARED inside a method body is walked by walkForCalls (not extractClass), so currentClassHttpFields is NOT switched for it"
- **[[c2]]** `analyze-bundle` `s1 symbol.locate — Python proven-receiver dataflow (python.ts:289/:298/:314/:330); root-cause of LOW same-function rebind` — "No rebind handling: a later `s = {}` reassigning a proven name does not remove it from the set"
- **[[c3]]** `analyze-bundle` `s1 usage.example — isHttpVerb/matchHttpClient/emitCallsHttp helper contract (http-client-shapes.ts), untouched by this story` — "the fix is purely in how each recognizer decides `recv/obj is proven` before calling emitCallsHttp"
- **[[c4]]** `analyze-bundle` `s1 test.locate — existing precision tests (http-client-shapes.test.ts / http-recognizer-py-go.test.ts) extended with the new scope cases` — "New precision cases (nested-closure shadow, inner-class-in-method, Python same-function rebind) extend these existing describe blocks with the same parse()->httpRels() harness"

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.story (design.story)

**0 HIGH · 7 MED · 0 LOW** · model `client` · reviewed 2026-08-07T15:18:08.317Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| cl1 | citation | MED | manual | walkForCalls exists in typescript.ts and today takes a flat `localHttp: Set<string>` param that the LLD replaces with a scope stack. | typescript.ts:733 `function walkForCalls(` with param `localHttp: Set<string>` at :740 — confirms the current flat param the LLD replaces. |  |
| cl2 | citation | MED | manual | collectLocalAxiosVars exists in typescript.ts and today collects axios.create declarator names into one flat body-wide set. | typescript.ts:713 `function collectLocalAxiosVars(body: SyntaxNode)` matching `normalizeCallee(fn.text) === 'axios.create'` at :722 — confirms body-wide axios.create collection. |  |
| cl3 | citation | MED | manual | currentClassHttpFields is a module-level var set in extractClass with save/restore, and collectClassHttpFields stops at nested class boundaries. | typescript.ts:683 `let currentClassHttpFields`, :688 `function collectClassHttpFields`, :694 stops at nested `class_declaration`/`class`. extractClass save/restore confirmed earlier at :303-:316. |  |
| cl4 | citation | MED | manual | collectPyProvenHttpReceivers and walkPythonForHttpCalls exist in python.ts; the proven set is built without rebind handling and is consumed at the attribute-call match. | python.ts:289 walkPythonForHttpCalls, :330 collectPyProvenHttpReceivers, :314 gate `isHttpVerb(attr.text) && proven.has(obj.text)` — confirms the flat proven-set consumption with no rebind removal. |  |
| cl5 | citation | MED | manual | The isHttpVerb / matchHttpClient / emitCallsHttp helper contract lives in http-client-shapes.ts and is reused unchanged by both recognizers. | http-client-shapes.ts exports isHttpVerb (:80), matchHttpClient (:213), emitCallsHttp (:236) — helper contract exists and is stable. |  |
| cl6 | citation | MED | manual | The existing precision tests the story extends live in http-client-shapes.test.ts and http-recognizer-py-go.test.ts and use the parse()->httpRels() harness under node:test. | Both test files exist and match on the proven-receiver dataflow / httpRels / node:test patterns. |  |
| cl7 | semantic | MED | manual | The instance-client CALLS_HTTP is emitted in walkForCalls only inside the member_expression branch gated on isHttpVerb(prop) && (currentClassHttpFields.has(recv) \|\| localHttp.has(recv)) — the exact gate the LLD tightens. | typescript.ts:761-762 is exactly `isHttpVerb(prop.text) && (currentClassHttpFields.has(recv) \|\| localHttp.has(recv))` — the precise gate the LLD tightens. |  |
