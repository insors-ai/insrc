<!-- insrc:artifact LLD-914cbf5ea9026b92-s3 -->

# LLD: E20260807914cbf5e:S003

**Epic:** `work-framed-approved-spec-proceed-from`
**HLD base run:** `wf-1786031712974-qqqe5k`
**HLD effective hash:** `fd544bcd90a0...`

## HLD context

**Framework:** Pipeline-integrated external-service graph tracing. The graph gains one new node kind (ExternalEndpoint, carrying a protocol + resolved/unresolved tag) and four typed boundary edge kinds (CALLS_HTTP, PUBLISHES_TO, SUBSCRIBES_TO, CALLS_RPC), added once to the graph vocabulary and gated by a graph-schema migration so existing indexes evolve without a full re-index. Per-language outbound and inbound detectors run as thin plugins inside the existing tree-sitter parse; a shared protocol-agnostic resolution engine turns indirect/configured targets into a concrete identity (or an explicit unresolved marker) from layered config sources with a fixed precedence. Cross-repo linking is a separate daemon-side matching pass, keyed off a per-repo service-identity registry, that forms a real dependency edge onto the target repo's actual handler entity and inserts it into the DEPENDS_ON closure; the same pass, re-fired on repo register/re-index events, is the out-of-order backfill.
**Rollout phase:** Phase B — Detection: outbound classes + inbound handlers + service identity
**Consumes:** `sc1` (ExternalEndpoint graph vocabulary), `sc2` (Target resolution engine)

## Contract details

**Surface level:** internal

### `parse`

```typescript
parse(filePath: string, source: string, repo: string): ParseResult
```

**Parameters:**
- `filePath: string` — Absolute file path being parsed (unchanged).
- `source: string` — Full source text (unchanged).
- `repo: string` — Repo root, already threaded into makeEntityId (unchanged).

**Returns:** `ParseResult` — { entities, relations } — SIGNATURE UNCHANGED. S003 extends the existing call_expression visitors in each of the 5 parsers with a thin HTTP-client recognizer: when a call-site matches a known HTTP client shape, it pushes an UNRESOLVED CALLS_HTTP relation `{ kind:'CALLS_HTTP', from:<calling code entity id>, to:<raw URL argument expression>, resolved:false }` into relations. No new ParseResult field; no second parse pass (performance NF). Non-HTTP call-sites are unaffected (still emit CALLS).

**Preconditions:**
- The parser already visits call_expression nodes for CALLS emission (the recognizer hooks the same visit).

**Postconditions:**
- An HTTP call-site yields exactly one unresolved CALLS_HTTP relation whose `to` is the raw URL expression; a repo with no HTTP calls yields a byte-identical ParseResult to before.

### `resolve`

```typescript
resolve(repo: string, protocol: ExternalProtocol, rawExpression: string): Promise<ResolvedTarget>
```

**Parameters:**
- `repo: string` — Repo whose at-rest config sources scope resolution (sc2).
- `protocol: ExternalProtocol` — Always 'http' for this detector — carried onto the resolved endpoint.
- `rawExpression: string` — The raw URL argument expression captured at the call-site.

**Returns:** `Promise<ResolvedTarget>` — sc2 (S002) — CONSUMED unchanged. {resolved:true, protocol:'http', identity} for a pinnable URL, else {resolved:false, rawExpression}. Called once per repo in the async post-parse pass (sc2 memoizes the ConfigSourceMap per repo).

**Preconditions:**
- Runs in the async post-parse pass (not in the sync parse), so awaiting resolve is legal.

**Postconditions:**
- Deterministic: same (repo config, rawExpression) => same ResolvedTarget; never throws (unresolved is a value, not an error).

### `makeExternalEndpointId`

```typescript
makeExternalEndpointId(repo: string, protocol: string, target: string, rawExpression?: string): string
```

**Parameters:**
- `repo: string` — In the id so endpoints dedup per-repo (ac2) and differ across repos.
- `protocol: string` — 'http'.
- `target: string` — The resolved identity, or '' when unresolved.
- `rawExpression: string` _(optional)_ — Used for the id when target==='' (unresolved), so an unresolved endpoint still has a stable id.

**Returns:** `string` — sc1 (S001) — CONSUMED unchanged. The deterministic hex-32 per-repo endpoint id. N call-sites to one target+repo => one id => one node (ac2/k2).

**Preconditions:**
- protocol/target derived from the ResolvedTarget returned by sc2.resolve.

**Postconditions:**
- Stable across re-index; identical for every call-site reaching the same target in the same repo.

### `upsertEntities`

```typescript
upsertEntities(_db: DbClient, entities: Entity[]): Promise<void>
```

**Parameters:**
- `_db: DbClient` — Daemon-side handle (k3).
- `entities: Entity[]` — The externalEndpoint node(s) minted for resolved+unresolved targets.

**Returns:** `Promise<void>` — Existing API (src/db/entities.ts) — UNCHANGED. The post-parse pass upserts one externalEndpoint Entity per distinct id; keying by id gives dedup (ac2) for free.

**Preconditions:**
- repo registered (k4).

**Postconditions:**
- One node per distinct endpoint id exists after the pass.

## Data model changes

### `HTTP-client recognizer in the 5 parsers' call_expression visitors (src/indexer/parser/*.ts)` — invariant-change

The invariant 'a call_expression visitor emits only intra-code CALLS relations' becomes 'it ALSO emits an unresolved CALLS_HTTP relation (to = raw URL expression) when the call-site matches a per-language HTTP-client shape' (TS: fetch/axios/got/node-fetch/http(s).request; Python: requests/httpx/urllib/aiohttp; Go: http.{Get,Post,NewRequest}/client.Do; Java: HttpClient/OkHttp/RestTemplate/WebClient/Apache; Scala: sttp/Akka-Pekko-HTTP/Play-WS). The recognition patterns + URL-argument extraction are entirely internal to S003 (HLD boundary). Additive: non-HTTP call-sites are unchanged.

```
each parser: call_expression visitor also pushes { kind:'CALLS_HTTP', from:callerId, to:rawUrlExpr, resolved:false } on an HTTP-client match
```

**Call sites:**
- `src/indexer/parser/typescript.ts`
- `src/indexer/parser/python.ts`
- `src/indexer/parser/go.ts`
- `src/indexer/parser/java.ts`
- `src/indexer/parser/scala.ts`

### `External-endpoint resolution pass (new module under src/indexer, wired into fullIndex)` — new

A new async per-repo pass, run after fullIndex parses every file (alongside/after runCrossFileResolver): read the repo's UNRESOLVED CALLS_HTTP relations; for each, await sc2.resolve(repo,'http', to) -> derive endpoint id via makeExternalEndpointId(repo,'http', identity||'' , rawExpression) -> collect one externalEndpoint Entity per distinct id (kind='externalEndpoint', repo, file='', protocol='http', resolved, target, rawExpression when unresolved) and upsert via upsertEntities (dedup by id, ac2) -> upsert the now-RESOLVED CALLS_HTTP edge (from callerId -> endpointId, resolved:true) via upsertRelations. An unresolved URL still mints a node (id from rawExpression) carrying rawExpression (k5). sc2.resolve runs once per repo (memoized ConfigSourceMap).

```
<new src/indexer module>: export async function resolveExternalEndpoints({ db, repo }): Promise<void>  + wire into index.ts fullIndex after runCrossFileResolver
```

**Call sites:**
- `src/indexer`
- `src/indexer/index.ts`
- `src/indexer/target-resolution/index.ts`
- `src/db/entities.ts`

### `Code-symbol resolver exclusion of boundary kinds (src/indexer/cross-file-resolver.ts / resolver.ts)` — invariant-change

The existing code-symbol Pass-2 (resolveRelations) resolves unresolved CALLS/INHERITS/IMPORTS `to` fields to entity ids. It must SKIP CALLS_HTTP (and the future boundary kinds) so it never tries to resolve a raw URL to a code entity — those are owned by the S003 endpoint-resolution pass. Additive filter: existing code-symbol resolution is unchanged.

```
src/indexer/cross-file-resolver.ts: the unresolved-relation walk excludes RelationKind CALLS_HTTP (leaves it for resolveExternalEndpoints)
```

**Call sites:**
- `src/indexer/cross-file-resolver.ts`
- `src/indexer/resolver.ts`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | S003 consumes the sc1 vocabulary verbatim: it emits CALLS_HTTP boundary relations, and in the post-parse pass mints externalEndpoint Entity nodes via makeExternalEndpointId (deterministic per-repo id => dedup, ac2/k2) with the endpoint fields (protocol='http', resolved, target, rawExpression). It owns no contract and adds nothing to sc1; CALLS_HTTP already participates in the DEPENDS_ON closure (S001), so endpoints are reachable in-closure (k1). |
| `sc2` | consumes | S003 consumes sc2's resolve(repo,'http', rawUrlExpr) in the async post-parse pass to turn each captured raw URL expression into a ResolvedTarget (concrete identity or unresolved marker). Resolution runs once per repo (sc2 memoizes the ConfigSourceMap); sc2's at-rest-only sourcing keeps detection static (k6). The ResolvedTarget drives the endpoint id + node fields. |

## Error paths

### Error cases

- **An HTTP call-site's URL argument cannot be extracted as an expression at all (e.g. the client call is spread/applied dynamically, or the URL arg is missing in a malformed AST).** (recoverable)
  - Detection: The per-language recognizer matches the client shape but its URL-argument extractor returns no node / empty string for the argument position.
  - Response: Skip emitting a CALLS_HTTP relation for that call-site rather than emitting one with an empty `to` (an empty rawExpression would collide all such sites onto one meaningless node). The intra-code CALLS edge (if any) is still emitted normally.
  - User impact: That one dynamic call-site is not represented as an HTTP boundary (a recall gap), but no bogus/empty endpoint node is created; every extractable call-site is unaffected.
- **The post-parse endpoint-resolution pass references a calling entity id (the CALLS_HTTP `from`) that no longer exists (the file was deleted/re-indexed between parse and the pass).** (recoverable)
  - Detection: At edge-upsert time the pass looks up the `from` entity and finds no row (or the unresolved CALLS_HTTP relation has no live source entity).
  - Response: Skip that edge (upsert the endpoint node only if another live call-site references it; drop the dangling relation) rather than writing an edge from a non-existent entity. On the next re-index the relation is re-derived from the current source.
  - User impact: A transient mid-reindex race drops one edge; it reappears on the completed index. No crash, no dangling edge.
- **The existing code-symbol resolver (Pass 2) picks up an unresolved CALLS_HTTP relation and tries to resolve its raw URL to a code entity.** (recoverable)
  - Detection: A CALLS_HTTP relation appears in the code-symbol resolver's unresolved-relation walk (kind not excluded), and its `to` (a raw URL) matches no entity name.
  - Response: The code-symbol resolver EXCLUDES CALLS_HTTP (and the other boundary kinds) from its walk by design, so it never touches them; a regression is caught by a test asserting the resolver leaves CALLS_HTTP untouched for the S003 pass.
  - User impact: None when the exclusion holds; if it regressed, the endpoint edge would be mis-marked — which the exclusion test prevents at build time.

### Edge cases

| Input | Expected |
| :--- | :--- |
| Several call-sites in one repo call the same resolved HTTP target (e.g. three `fetch(cfg.apiBase + '/x')` reaching api.example.com/x). | One externalEndpoint node for that target (deduped by the deterministic per-repo id, ac2) with three separate CALLS_HTTP edges, one per calling entity. |
| Two different repos each call the same HTTP target (api.example.com). | Two distinct externalEndpoint nodes — one per repo — because repo is part of the deterministic id; S003 never merges across repos (cross-repo linking is s8/s9). |
| An HTTP call whose URL cannot be pinned from any config source (resolved:false), e.g. `fetch(userInput)`. | An unresolved externalEndpoint node (id derived from the rawExpression) carrying rawExpression, plus a CALLS_HTTP edge to it — never dropped (k5). A later config change can upgrade it on re-index. |
| A non-HTTP call that happens to share a name token with an HTTP client (e.g. a local function named `get` unrelated to axios). | The recognizer keys on the client shape (receiver/import + call pattern), not the bare method name, so a local `get()` is NOT flagged as HTTP — it stays a plain CALLS edge (precision over false positives). |
| The same literal URL appears in two languages within one repo (a TS and a Python call to https://api.example.com/v1). | One externalEndpoint node (the id is language-agnostic — repo+protocol+identity), with a CALLS_HTTP edge from each language's call-site; language does not fragment the endpoint. |
| An HTTP client call with an interpolated URL whose pieces all pin via sc2 (e.g. `${API_HOST}/users` with API_HOST in .env). | resolved:true with the concrete identity as target; one node keyed on the resolved identity (so it dedups with a literal call to the same resolved host/path). |

### Invariants to preserve

- The existing code-symbol relation resolution (CALLS/INHERITS/IMPORTS -> entity ids) is unchanged: adding CALLS_HTTP emission + its dedicated pass must not alter how intra-code relations are detected or resolved; a repo with no HTTP calls produces a byte-identical graph to before. [[c2]]
- Detection adds NO second parse pass — the HTTP recognizer runs inside the single existing tree-sitter call_expression walk; endpoint resolution is one bounded per-repo async pass, not a per-file or per-call-site rescan (performance NF). [[c2]]
- Endpoint identity is the sc1 deterministic per-repo id (repo + 'externalEndpoint' + protocol + ':' + target||rawExpression); S003 mints ids only through makeExternalEndpointId so re-indexing is stable/idempotent and per-repo dedup holds (k2). [[c1]]

## Test strategy

**Test framework:** `node:test via `npx tsx --test` (matching the existing src/indexer/parser/__tests__ + src/db/graph/__tests__ suites)`

### Test levels

- **unit** — Per-language recognizer: a known HTTP-client call-site in a source fixture yields exactly one unresolved CALLS_HTTP relation with the correct raw URL expression, and non-HTTP calls stay plain CALLS.
  - Subjects: `TypeScript/JS: fetch(url) / axios.get(url) / got(url) / http.request(url) → one CALLS_HTTP relation {from: caller, to: raw URL expr, resolved:false}`, `Python: requests.get(url) / httpx.get(url) / urllib.request.urlopen(url) / aiohttp → CALLS_HTTP with the raw URL expr`, `Go: http.Get(url) / http.NewRequest(method,url,body) / client.Do(req) → CALLS_HTTP with the URL arg`, `Java: HttpClient.send / OkHttpClient.newCall / RestTemplate / WebClient → CALLS_HTTP with the URL arg`, `Scala: sttp / Akka-Pekko HTTP / Play WS → CALLS_HTTP with the URL arg`, `precision: a local function named get()/post() (not an HTTP client) does NOT emit CALLS_HTTP — stays a plain CALLS edge`, `a call-site whose URL argument can't be extracted emits NO CALLS_HTTP relation (no empty-`to` node)`, `a file with no HTTP calls yields a ParseResult byte-identical to before (no new relations)`
  - Fixtures: `Small per-language source snippets: one HTTP-client call, one look-alike non-HTTP call, one unextractable-URL call`
- **unit** — The code-symbol resolver leaves CALLS_HTTP untouched (the exclusion invariant) so the boundary relation is not mis-resolved to a code entity.
  - Subjects: `resolveRelations / cross-file-resolver excludes CALLS_HTTP from its unresolved-relation walk — a CALLS_HTTP row is left unresolved for the S003 pass, never re-pointed at a code entity`, `existing CALLS/INHERITS/IMPORTS resolution is unchanged in the presence of CALLS_HTTP rows`
  - Fixtures: `A seeded set of unresolved relations mixing CALLS + CALLS_HTTP`
- **integration** — The post-parse endpoint-resolution pass over a temp graph store: resolve via sc2, mint deduped externalEndpoint nodes + per-call-site CALLS_HTTP edges, honoring per-repo dedup + unresolved preservation.
  - Subjects: `ac1: a repo with HTTP call-sites → each distinct resolved target is ONE externalEndpoint node (kind='externalEndpoint', protocol='http', resolved:true, target=identity) with a CALLS_HTTP edge from each caller`, `ac2 dedup: three call-sites to the same target → one node, three CALLS_HTTP edges`, `ac2 per-repo: two repos calling the same target → two distinct nodes (repo in the id)`, `unresolved (k5): an un-pinnable URL → an unresolved node (id from rawExpression) carrying rawExpression + a CALLS_HTTP edge, never dropped`, `resolved-vs-literal dedup: an interpolated URL that resolves to the same host/path as a literal call collapses to one node`, `idempotency: re-running the pass on the same sources produces the identical node/edge set (deterministic ids)`, `sc2 is invoked once per repo (memoized ConfigSourceMap), not per call-site`
  - Fixtures: `A temp graph store (src/db/graph test harness) seeded with a registered repo, code entities, and unresolved CALLS_HTTP relations`, `A repo fixture with config (.env / literal URLs) so sc2 resolves some targets and leaves others unresolved`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: each of the 5 language recognizers emits a CALLS_HTTP relation with the correct raw URL for a known client call-site`, `integration: the post-parse pass turns those into one externalEndpoint node per distinct resolved target with a CALLS_HTTP edge from every call-site (across languages)` |
| `ac2` | `integration: three call-sites to one target in a repo share a single externalEndpoint node with three CALLS_HTTP edges (dedup by deterministic per-repo id)`, `integration: two repos calling the same target each get their own externalEndpoint node (repo is part of the id)` |

## Alternatives considered

### a1: Unresolved-CALLS_HTTP relation channel + a new async post-parse endpoint-resolution pass — **CHOSEN**

Per-language call_expression visitors push an UNRESOLVED CALLS_HTTP relation {from: callerId, to: rawUrlExpr, resolved:false} during the existing sync parse; a new async per-repo pass (after full parse) resolves each via sc2, mints the deduped externalEndpoint node, and upserts the resolved edge — reusing the existing unresolved-relation plumbing with ParseResult unchanged.



### a2: Explicit httpCallSites[] intermediate on ParseResult + new async pass

Add a typed `httpCallSites: HttpCallSite[]` field to ParseResult; parsers populate it during the walk; the same async post-parse pass consumes it to resolve + mint nodes/edges — an explicit intermediate rather than overloading the relation channel.



**Rejected because:** Functionally equivalent to a1 and slightly cleaner typing (no overloaded unresolved relation), but changes the ParseResult contract (a new field every parser + the indexer must thread) and introduces a second in-flight persistence shape for pending call-sites — a wider blast radius than a1 for no acceptance-criterion gain, and diverging from the codebase's existing emit-unresolved-then-resolve pattern. (s3: winnerRank 2.)

### a3: Eager in-parse resolution (make the parse path async / add a sync resolver)

Resolve the URL and mint the endpoint node during the parse itself — either by making CodeParser.parse async so it can await sc2.resolve, or by exposing a synchronous resolver variant the parser can call inline.



**Rejected because:** Reaches the acceptance outcomes but only by either making all 5 parsers + the indexer async (a large surface change against the HLD 'thin plugin' boundary + performance NF) or coupling the pure per-file parse to a threaded ConfigSourceMap — partial on sc2, re-doing per-file what sc2 batches per-repo, for no benefit over a1's clean post-parse pass. (s3: violates/partial sc2.)

## Citations

- **[[c1]]** `analyze-bundle` `s1 data-model.trace + symbol.locate — sc1 vocabulary: makeExternalEndpointId (base.ts), externalEndpoint Entity + endpoint fields (shared/types.ts), CALLS_HTTP RelationKind` — "makeExternalEndpointId(repo,protocol,target,rawExpression) hex-32 per-repo dedup; externalEndpoint Entity with protocol/resolved/target/rawExpression; CALLS_HTTP already participates in the DEPENDS_ON"
- **[[c2]]** `analyze-bundle` `s1 usage.example + module.profile — CodeParser.parse (sync) emits ParseResult{entities,relations}; CALLS via call_expression walk; index.ts fullIndex -> runCrossFileResolver async Pass-2` — "parse is SYNC; relations pushed while walking call_expression; the indexer runs an async per-repo second pass (runCrossFileResolver) resolving unresolved code-symbol relations — where S003's endpoint "
- **[[c3]]** `analyze-bundle` `s1 symbol.locate — sc2 resolve(repo,protocol,rawExpression): Promise<ResolvedTarget> (async, per-repo memoized) in src/indexer/target-resolution/` — "sc2.resolve is async + per-repo memoized (ConfigSourceMap), returning {resolved:true,protocol,identity} | {resolved:false,rawExpression} — called once per repo in the post-parse pass, honoring the asy"
- **[[c4]]** `prior-artifact` `HLD 914cbf5ea9026b92 — s3 boundary (owns none; depends sc1+sc2; internal per-language HTTP recognition) + Phase B rollout` — "Per-language outbound detectors run as thin plugins inside the existing tree-sitter parse; the per-language HTTP-client recognition patterns are entirely internal to S003."
- **[[c5]]** `step-output` `s3 alternatives.judge — winner a1 over a2/a3` — "a1 satisfies ac1/ac2/sc1/sc2/k1-k6 with the smallest idiomatic surface (thin recognizer + one async post-parse pass); a2 wider blast radius; a3 partial sc2."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 9 LOW** · model `client` · reviewed 2026-08-07T05:27:57.499Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| data-model/parsers | inventory | LOW | auto | There are exactly five per-language CodeParser implementations (typescript, python, go, java, scala) under src/indexer/parser/, each emitting a ParseResult via a call_expression walk that pushes relations. | Confirmed: 5 language parsers exist with call_expression walks + relations.push (typescript.ts:667, scala.ts:740, go.ts:110, ParseResult at base.ts:54). PRECISION NOTE: the real parse signature includes a 4th param (artifact.ts:113 `parse(filePath, source, repo, repoId): ParseResult`), which the LLD's `parse(filePath, source, repo)` omits. The design point (signature UNCHANGED; the detector hooks the existing call_expression visit) is unaffected — build should just carry the real arity (incl. repoId). | At build, use the actual CodeParser.parse arity (verify repoId) — no design change. |
| api/makeExternalEndpointId | citation | LOW | auto | makeExternalEndpointId is exported from src/indexer/parser/base.ts (added by S001) and mints the deterministic per-repo endpoint id. | Confirmed: src/indexer/parser/base.ts:35 `export function makeExternalEndpointId(...)` (sc1/S001). The endpoint-id API the pass mints through is real. | None — citation verified. |
| vocab/CALLS_HTTP | citation | LOW | auto | CALLS_HTTP is a real RelationKind (added by S001) in shared/types.ts and byte-mapped in keys.ts. | Confirmed: CALLS_HTTP is a real RelationKind — src/shared/types.ts:541 in the union, src/db/graph/keys.ts:37 byte 13, and src/db/graph/traversal.ts:50 in DEPENDS_ON_CLOSURE_KINDS (so endpoints are in-closure, k1). | None — citation verified. |
| api/resolve | citation | LOW | auto | sc2's resolve(repo, protocol, rawExpression): Promise<ResolvedTarget> is exported from the src/indexer/target-resolution module (async, per-repo memoized). | Confirmed: src/indexer/target-resolution/index.ts:15 re-exports resolve from resolver.js (sc2/S002, async). The consumed resolver API is real. | None — citation verified. |
| flow/runCrossFileResolver | citation | LOW | auto | index.ts fullIndex runs an async per-repo second pass runCrossFileResolver after parsing every file — where S003's endpoint-resolution pass slots in. | Confirmed: runCrossFileResolver is the async per-repo Pass-2 (cross-file-resolver.ts; exercised in cross-file-resolver-lmdb.test.ts and called from index.ts fullIndex). The endpoint pass slots in after it. | None — citation verified. |
| api/upsert | citation | LOW | auto | upsertEntities and upsertRelations are existing async APIs (src/db/entities.ts, src/db/relations.ts) the pass uses to write the endpoint node + edge. | Confirmed: upsertEntities (src/db/entities.ts:196) + upsertRelations (src/db/relations.ts:108), both async — the write APIs the pass uses for the endpoint node + edge. | None — citation verified. |
| data-model/Relation | semantic | LOW | auto | A Relation carries { kind: RelationKind; from: string; to: string; resolved: boolean }, so an unresolved CALLS_HTTP with to=raw-URL is representable without a schema change. | Confirmed: src/shared/types.ts:625 `interface Relation` with `resolved: boolean` at :632 (and from/to/kind). An unresolved CALLS_HTTP with to=raw-URL is representable with no schema change — a1's premise holds. | None — citation verified. |
| flow/resolveRelations | citation | LOW | auto | The code-symbol Pass-2 resolver (resolveRelations in cross-file-resolver.ts / resolver.ts) resolves unresolved CALLS/INHERITS/IMPORTS to entity ids — the pass S003 must make exclude CALLS_HTTP. | Confirmed: resolveRelations (src/indexer/resolver.ts, imported in resolver-python.test) is the code-symbol resolver, and listUnresolvedRelations exists — the exclusion of CALLS_HTTP the LLD requires is a real, targetable change. | None — citation verified. |
| cross-artifact/s3-boundary | cross-artifact | LOW | auto | The HLD (914cbf5ea9026b92) declares s3 owns no shared contract and depends on sc1 + sc2 (consumes), matching this LLD's interactions. | The src-scoped evidence engine can't read the HLD artifact (greps hit only test fixtures). The committed HLD declares s3 owns no contract and depends on sc1+sc2 — authored + approved this session; this LLD's two 'consumes' interactions match. Low risk. | None — trace holds per the committed HLD. |
