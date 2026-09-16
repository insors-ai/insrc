<!-- insrc:artifact PLAN-914cbf5ea9026b92-s3 -->

# Plan: E20260807914cbf5e:S003

**Epic:** `work-framed-approved-spec-proceed-from`
**LLD run:** `wf-1786079806522-5x0kom`
**LLD effective hash:** `fd544bcd90a0...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** External-endpoint resolution pass + fullIndex wiring | L | — | integration: resolveExternalEndpoints: one node per distinct resolved target with a CALLS_HTTP edge from each caller (ac1); integration: resolveExternalEndpoints: three call-sites to one target => one node + three edges (ac2 dedup); integration: resolveExternalEndpoints: two repos to the same target => two distinct nodes (ac2 per-repo); integration: resolveExternalEndpoints: a TS and a Python edge to the same resolved identity share one language-agnostic node; integration: resolveExternalEndpoints: interpolated URL resolving to the same host/path as a literal collapses to one node; integration: resolveExternalEndpoints: an un-pinnable URL mints an unresolved node carrying rawExpression + edge, never dropped (k5); integration: resolveExternalEndpoints: a CALLS_HTTP with a missing `from` entity is skipped (no dangling edge, no empty node); integration: resolveExternalEndpoints: re-run over identical sources is idempotent (byte-identical node/edge set) and sc2.resolve is invoked once per repo; integration: fullIndex wires resolveExternalEndpoints after runCrossFileResolver; a no-HTTP repo leaves the graph unchanged | [[c1]] [[c2]] |
| 2 | **`t2`** Exclude boundary kinds from the code-symbol resolver | S | — | unit: cross-file-resolver: a CALLS_HTTP row is left unresolved (never re-pointed at a code entity) while a sibling CALLS resolves; unit: cross-file-resolver: CALLS/INHERITS/IMPORTS resolution is unchanged in the presence of CALLS_HTTP rows | [[c2]] |
| 3 | **`t3`** TS/JS HTTP-client recognizer + shared client-shape helper | M | — | unit: typescript recognizer: fetch/axios.get/got/http.request each emit one CALLS_HTTP with the raw URL expr; unit: typescript recognizer: a local get()/post() emits no CALLS_HTTP (stays a plain CALLS edge); unit: typescript recognizer: an unextractable URL emits no CALLS_HTTP; a no-HTTP file yields a byte-identical ParseResult; unit: http-client-shapes helper: exposes a per-language shape table + emit utility with a stable signature | [[c1]] [[c2]] |
| 4 | **`t4`** Python + Go HTTP-client recognizers | M | `t3` | unit: python recognizer: requests/httpx/urllib.urlopen/aiohttp each emit one CALLS_HTTP with the raw URL expr; look-alike stays CALLS; unit: python recognizer: unextractable URL emits no CALLS_HTTP; no-HTTP file yields an unchanged ParseResult; unit: go recognizer: http.Get/http.NewRequest/client.Do each emit one CALLS_HTTP with the URL arg; non-HTTP call stays CALLS; unit: go recognizer: unextractable URL emits no CALLS_HTTP; no-HTTP file yields an unchanged ParseResult | [[c1]] [[c2]] |
| 5 | **`t5`** Java + Scala HTTP-client recognizers | M | `t3` | unit: java recognizer: HttpClient.send/OkHttp.newCall/RestTemplate/WebClient each emit one CALLS_HTTP with the URL arg; non-HTTP method_invocation stays CALLS; unit: java recognizer: unextractable URL emits no CALLS_HTTP; no-HTTP file yields an unchanged ParseResult; unit: scala recognizer: sttp/Akka-Pekko HTTP/Play WS each emit one CALLS_HTTP with the URL arg; non-HTTP call stays CALLS; unit: scala recognizer: unextractable URL emits no CALLS_HTTP; no-HTTP file yields an unchanged ParseResult | [[c1]] [[c2]] |

### E20260807914cbf5e:S003:T001 — External-endpoint resolution pass + fullIndex wiring

New async per-repo module `resolveExternalEndpoints({ db, repo })` under src/indexer: read the repo's UNRESOLVED CALLS_HTTP relations via listUnresolvedRelations (filter kind==='CALLS_HTTP'); for each distinct rawTo await sc2.resolve(repo,'http', rawTo) (once per unique expr; sc2 memoizes the ConfigSourceMap per repo); derive the endpoint id via makeExternalEndpointId(repo,'http', identity||'' , rawExpression); collect one externalEndpoint Entity per distinct id (kind='externalEndpoint', repo, file='', protocol='http', resolved, target=identity||'', rawExpression when unresolved) and upsert via upsertEntities (dedup by id); upsert the now-RESOLVED CALLS_HTTP edge (from callerId -> endpointId, resolved:true) via upsertRelations. Skip a call-site whose `from` entity no longer exists (mid-reindex race) and never mint an empty-target/empty-rawExpression node. Wire `await resolveExternalEndpoints({ db: this.db, repo: repoPath })` into fullIndex right after runCrossFileResolver (index.ts:435). Per the s3 critique, this stays one cohesive task but its integration test must exercise each behavior below as a separate, independently-failing case (dedup / per-repo split / cross-language / unresolved / idempotency / dangling-from).

**Acceptance checks:**
- A repo with HTTP call-sites yields exactly one externalEndpoint node (kind='externalEndpoint', protocol='http', resolved:true, target=identity) per distinct resolved target, each with a CALLS_HTTP edge from every calling entity (ac1).
- Dedup + per-repo split (each an independently-failing case): three call-sites to the same resolved target in one repo collapse to a single node with three CALLS_HTTP edges; two repos calling the same target get two distinct nodes because repo is in the id (ac2).
- Cross-language dedup: a TS CALLS_HTTP and a Python CALLS_HTTP to the SAME resolved identity in one repo share ONE language-agnostic node (id = repo+protocol+identity) with two edges — language does not fragment the endpoint.
- An un-pinnable URL mints an unresolved node (id derived from rawExpression) carrying rawExpression + a CALLS_HTTP edge — never dropped (k5).
- A CALLS_HTTP relation whose `from` entity no longer exists (mid-reindex race) is skipped rather than writing a dangling edge; no empty-target/empty-rawExpression node is ever minted.
- Re-running the pass on identical sources produces a byte-identical node/edge set (deterministic ids, idempotent); sc2.resolve is invoked once per repo, not per call-site.
- The pass is wired into fullIndex after runCrossFileResolver and awaited; a repo with no CALLS_HTTP relations produces no externalEndpoint nodes and leaves the graph unchanged.

### E20260807914cbf5e:S003:T002 — Exclude boundary kinds from the code-symbol resolver

In the existing code-symbol Pass-2 (runCrossFileResolver / resolveRelations, src/indexer/cross-file-resolver.ts + resolver.ts) filter out RelationKind CALLS_HTTP (and the sibling boundary kinds PUBLISHES_TO/SUBSCRIBES_TO/CALLS_RPC) from the unresolved-relation walk so a raw URL is never matched against a code-entity name and the CALLS_HTTP rows are left untouched for resolveExternalEndpoints. Additive filter — intra-code CALLS/INHERITS/IMPORTS resolution is unchanged.

**Acceptance checks:**
- A seeded set of unresolved relations mixing CALLS + CALLS_HTTP: after runCrossFileResolver the CALLS_HTTP row is still unresolved (never re-pointed at a code entity), while the CALLS row resolves as before.
- Existing CALLS/INHERITS/IMPORTS resolution is byte-identical in the presence of CALLS_HTTP rows (a regression that lets the resolver consume CALLS_HTTP fails the test).

### E20260807914cbf5e:S003:T003 — TS/JS HTTP-client recognizer + shared client-shape helper

Introduce a small shared helper (per-language HTTP-client shape tables + a common `emit CALLS_HTTP` utility with a stable signature that t4/t5 reuse without reshaping) and wire the TypeScript/JS recognizer into typescript.ts's existing call_expression visitor (walkForCalls): on a call-site matching a known client shape (fetch / axios.{get,post,request,…} / got / node-fetch / http(s).request), extract the URL argument node (childForFieldName('arguments') → URL arg → .text) and push { kind:'CALLS_HTTP', from: callerId, to: rawUrlExpr, resolved:false, meta:{file,repo} }. Key on the client shape (receiver/import + call pattern), not a bare method name, so a local get()/post() stays a plain CALLS edge. Skip emission when the URL arg can't be extracted (no empty-`to`). Non-HTTP call-sites are unaffected.

**Acceptance checks:**
- A TS/JS fixture with fetch(url) / axios.get(url) / got(url) / http.request(url) each yields exactly one CALLS_HTTP relation {from: caller, to: raw URL expr, resolved:false}; the raw `to` matches the source URL expression.
- A local function named get()/post() (not an HTTP client) emits NO CALLS_HTTP — it stays a plain CALLS edge (precision).
- A call-site whose URL argument can't be extracted emits no CALLS_HTTP relation (no empty-`to` node); a file with no HTTP calls yields a ParseResult byte-identical to before.
- The shared helper exposes a per-language client-shape table + a common emit utility with a stable signature (asserted directly) so t4/t5 wire in without reshaping it — the helper contract is explicit, not incidental to the TS recognizer.

### E20260807914cbf5e:S003:T004 — Python + Go HTTP-client recognizers

Wire the Python and Go recognizers into their respective call visitors using the shared client-shape helper from t3. Python (call node): requests.{get,post,…} / httpx.{get,post,Client…} / urllib.request.urlopen / aiohttp.ClientSession requests. Go (call_expression): http.{Get,Post,PostForm} / http.NewRequest(method,url,body) / client.Do(req) where the URL/req is traceable to a literal or config expr. Each emits an unresolved CALLS_HTTP { from: callerId, to: rawUrlExpr, resolved:false } on a client match; look-alike non-HTTP calls stay plain CALLS; unextractable URLs emit nothing.

**Acceptance checks:**
- Python fixtures: requests.get(url) / httpx.get(url) / urllib.request.urlopen(url) / aiohttp each emit one CALLS_HTTP with the raw URL expr; a non-HTTP look-alike stays a plain CALLS edge.
- Go fixtures: http.Get(url) / http.NewRequest(method,url,body) / client.Do(req) each emit one CALLS_HTTP with the URL arg; a non-HTTP call stays a plain CALLS edge.
- In both languages an unextractable URL emits no CALLS_HTTP and a no-HTTP file yields an unchanged ParseResult.

### E20260807914cbf5e:S003:T005 — Java + Scala HTTP-client recognizers

Wire the Java and Scala recognizers into their call visitors (Java method_invocation; Scala call_expression) using the shared client-shape helper from t3. Java: HttpClient.send / OkHttpClient.newCall(Request) / RestTemplate.{getForObject,exchange,…} / WebClient / Apache HttpClient. Scala: sttp / Akka-Pekko HTTP (Http().singleRequest) / Play WS (ws.url(...).get()). Each emits an unresolved CALLS_HTTP { from: callerId, to: rawUrlExpr, resolved:false } on a client match; look-alikes stay plain CALLS; unextractable URLs emit nothing.

**Acceptance checks:**
- Java fixtures: HttpClient.send / OkHttpClient.newCall / RestTemplate / WebClient each emit one CALLS_HTTP with the URL arg; a non-HTTP method_invocation stays a plain CALLS edge.
- Scala fixtures: sttp / Akka-Pekko HTTP / Play WS each emit one CALLS_HTTP with the URL arg; a non-HTTP call stays a plain CALLS edge.
- In both languages an unextractable URL emits no CALLS_HTTP and a no-HTTP file yields an unchanged ParseResult.

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| TypeScript/JS: fetch(url) / axios.get(url) / got(url) / http.request(url) → one CALLS_HTTP relation {from: caller, to: raw URL expr, resolved:false} | `t3` |
| Python: requests.get(url) / httpx.get(url) / urllib.request.urlopen(url) / aiohttp → CALLS_HTTP with the raw URL expr | `t4` |
| Go: http.Get(url) / http.NewRequest(method,url,body) / client.Do(req) → CALLS_HTTP with the URL arg | `t4` |
| Java: HttpClient.send / OkHttpClient.newCall / RestTemplate / WebClient → CALLS_HTTP with the URL arg | `t5` |
| Scala: sttp / Akka-Pekko HTTP / Play WS → CALLS_HTTP with the URL arg | `t5` |
| precision: a local function named get()/post() (not an HTTP client) does NOT emit CALLS_HTTP — stays a plain CALLS edge | `t3`, `t4`, `t5` |
| a call-site whose URL argument can't be extracted emits NO CALLS_HTTP relation (no empty-`to` node) | `t3`, `t4`, `t5` |
| a file with no HTTP calls yields a ParseResult byte-identical to before (no new relations) | `t3`, `t4`, `t5` |
| resolveRelations / cross-file-resolver excludes CALLS_HTTP from its unresolved-relation walk — a CALLS_HTTP row is left unresolved for the S003 pass, never re-pointed at a code entity | `t2` |
| existing CALLS/INHERITS/IMPORTS resolution is unchanged in the presence of CALLS_HTTP rows | `t2` |
| ac1: a repo with HTTP call-sites → each distinct resolved target is ONE externalEndpoint node (kind='externalEndpoint', protocol='http', resolved:true, target=identity) with a CALLS_HTTP edge from each caller | `t1` |
| ac2 dedup: three call-sites to the same target → one node, three CALLS_HTTP edges | `t1` |
| ac2 per-repo: two repos calling the same target → two distinct nodes (repo in the id) | `t1` |
| unresolved (k5): an un-pinnable URL → an unresolved node (id from rawExpression) carrying rawExpression + a CALLS_HTTP edge, never dropped | `t1` |
| resolved-vs-literal dedup: an interpolated URL that resolves to the same host/path as a literal call collapses to one node | `t1` |
| idempotency: re-running the pass on the same sources produces the identical node/edge set (deterministic ids) | `t1` |
| sc2 is invoked once per repo (memoized ConfigSourceMap), not per call-site | `t1` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s3 sc1 ExternalEndpoint graph vocabulary — makeExternalEndpointId deterministic per-repo id (repo + 'externalEndpoint' + protocol + ':' + target||rawExpression), the externalEndpoint node kind, and the CALLS_HTTP boundary edge; endpoint identity is minted only through makeExternalEndpointId so re-indexing is stable/idempotent and per-repo dedup holds (invariant source c1).` — "Endpoint identity is the sc1 deterministic per-repo id (repo + 'externalEndpoint' + protocol + ':' + target||rawExpression); S003 mints ids only through makeExternalEndpointId so re-indexing is stable"
- **[[c2]]** `prior-artifact` `LLD s3 sc2 Target resolution engine + the S003 invariants: resolve(repo,'http',rawExpression) turns each raw URL into a ResolvedTarget in the async post-parse pass (once per repo, memoized); detection adds NO second parse pass (recognizer runs inside the single existing call_expression walk); and the existing code-symbol relation resolution (CALLS/INHERITS/IMPORTS) is unchanged — a repo with no HTTP calls yields a byte-identical graph (invariant source c2).` — "The existing code-symbol relation resolution (CALLS/INHERITS/IMPORTS -> entity ids) is unchanged: adding CALLS_HTTP emission + its dedicated pass must not alter how intra-code relations are detected o"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — plan (plan)

**0 HIGH · 0 MED · 12 LOW** · model `client` · reviewed 2026-08-07T05:48:06.029Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| t1 | citation | LOW | auto | fullIndex calls runCrossFileResolver at src/indexer/index.ts around line 435 (the wiring point for resolveExternalEndpoints). | CONFIRMED verbatim: src/indexer/index.ts:435 reads `const cf = await runCrossFileResolver({ db: this.db, repoRoot: repoPath, sourceRoots });` — the exact wiring point t1 targets. | None — wiring point verified. |
| t1 | citation | LOW | auto | listUnresolvedRelations exists in src/db/relations.ts and returns unresolved relations carrying a RelationKind + rawTo, so the pass can filter kind==='CALLS_HTTP'. | Supported: listUnresolvedRelations is a real db/relations.ts export (plans/storage-migration-lmdb-lance.md records it landed alongside UnresolvedRelation + makeUnresolvedRelationId), and rawTo is the documented raw-`to` field on unresolved rows. The pass can filter kind==='CALLS_HTTP'. | None — read API exists. |
| t1 | citation | LOW | auto | makeExternalEndpointId(repo, protocol, target, rawExpression?) exists in src/indexer/parser/base.ts and mints the deterministic per-repo endpoint id. | Supported: makeExternalEndpointId(repo,protocol,target,rawExpression?) was added to src/indexer/parser/base.ts by the shipped S001 (sc1) build; the LLD contract restates the exact signature. Symbol is real and in-tree. | None — sc1 primitive in place. |
| t1 | citation | LOW | auto | upsertEntities and upsertRelations exist in src/db/entities.ts and src/db/relations.ts respectively and are the write APIs the pass uses. | CONFIRMED verbatim: src/db/entities.ts:196 `export async function upsertEntities(_db, entities)` and src/db/relations.ts:108 `export async function upsertRelations(_db, relations)` — the write APIs t1 uses. | None — write APIs verified. |
| t1 | external-contract | LOW | auto | sc2's async resolve(repo, protocol, rawExpression): Promise<ResolvedTarget> exists in src/indexer/target-resolution (index.ts/resolver.ts) and memoizes the per-repo ConfigSourceMap. | Supported: src/indexer/target-resolution/resolver.ts exports the async resolve + invalidateRepoConfig (imported by __tests__/adapter.test.ts:27), the shipped S002 (sc2) engine with per-repo ConfigSourceMap memoization. Contract matches. | None — sc2 resolve available. |
| t1 | semantic | LOW | auto | The Entity type carries the endpoint fields (kind 'externalEndpoint', protocol, resolved, target, rawExpression) so an externalEndpoint Entity can be constructed and upserted. | Supported: the externalEndpoint Entity fields (kind, protocol, resolved, target, rawExpression) were added to src/shared/types.ts Entity by the shipped S001; HLD/LLD restate them. An externalEndpoint Entity is constructible without a schema change. | None — Entity fields present. |
| t2 | closed-union | LOW | auto | RelationKind includes the four boundary kinds CALLS_HTTP / PUBLISHES_TO / SUBSCRIBES_TO / CALLS_RPC, byte-mapped in src/db/graph/keys.ts, so the resolver can exclude them. | Supported: RelationKind's four boundary kinds (CALLS_HTTP/PUBLISHES_TO/SUBSCRIBES_TO/CALLS_RPC) were byte-mapped into src/db/graph/keys.ts by the shipped S001 (bytes 13-16). The DEF-era 'zero src hits' note predates S001; they now exist in-tree, so the exclusion in t2 is a real, targetable filter. | None — boundary kinds in the vocabulary. |
| t2 | citation | LOW | auto | The code-symbol Pass-2 resolver lives in src/indexer/cross-file-resolver.ts + src/indexer/resolver.ts (runCrossFileResolver / resolveRelations) — the exclusion site. | CONFIRMED: src/indexer/cross-file-resolver.ts:93 `export async function runCrossFileResolver(` and resolveRelations (src/indexer/resolver.ts) are the code-symbol Pass-2 — the exact exclusion site t2 edits. | None — exclusion site verified. |
| t3 | citation | LOW | auto | src/indexer/parser/typescript.ts has a call_expression visitor (walkForCalls) that emits CALLS relations — the hook point for the TS/JS HTTP recognizer. | CONFIRMED verbatim: src/indexer/parser/typescript.ts:622 calls walkForCalls and :659 defines it — the call_expression visitor emitting CALLS, the exact hook for the t3 TS/JS recognizer. | None — hook point verified. |
| t3/t4/t5 | inventory | LOW | auto | All five parsers named by the plan exist as source files under src/indexer/parser/ (typescript, python, go, java, scala), each with a call-site visitor to extend. | Supported: src/indexer/parser/go.ts:343 `class GoParser implements CodeParser` confirmed; typescript/python/java/scala parser files are established siblings under src/indexer/parser (java uses method_invocation, scala call_expression). All five call-site visitors t3/t4/t5 extend exist. | None — five parsers present. |
| t1 | semantic | LOW | auto | A Relation carries kind + from + to + resolved:boolean (plus optional meta), so an unresolved CALLS_HTTP relation {kind:'CALLS_HTTP', from, to:rawUrlExpr, resolved:false} is a valid relation the recognizer can push. | CONFIRMED verbatim: src/shared/types.ts:625 `export interface Relation` with `resolved: boolean` at :632 (plus kind/from/to). An unresolved CALLS_HTTP {to: rawUrlExpr, resolved:false} is representable with no schema change. | None — Relation shape verified. |
| t4/t5 | ordering | LOW | auto | Tasks t4 and t5 depend on t3 (the shared client-shape helper); t1/t2/t3 have no intra-story dependency, giving an acyclic order t1..t5. | Correctly non-existent: `http-client-shapes`/`clientShapes` returns 0 in-tree hits because t3 CREATES that shared helper — it is a new module, not a pre-existing citation. The ordering claim itself (t4/t5 dependsOn t3; t1/t2/t3 independent) is acyclic and internally consistent, verified structurally in the plan's dependsOn graph. | None — the module is a t3 deliverable, not a missing dependency; ordering is sound. |
