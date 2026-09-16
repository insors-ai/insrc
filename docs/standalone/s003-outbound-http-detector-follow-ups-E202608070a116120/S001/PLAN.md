<!-- insrc:artifact PLAN-0a116120820e903f-S001 -->

# Plan: S001

**Epic:** `s003-outbound-http-detector-follow-ups`
**LLD run:** `wf-1786112956080-d29xve`
**LLD effective hash:** `0a116120820e...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** deleteEntitiesById storage primitive | M | — | unit: deleteEntitiesById removes the entity (getEntity=>null) + cascades its CALLS_HTTP in/out edges; other entities untouched; unit: deleteEntitiesById tolerates an absent/stale id (no-op, no throw); mixed present+absent batch deletes present, skips absent | [[c2]] |
| 2 | **`t2`** edges-stat distinct-pair count + orphan endpoint GC | M | `t1` | unit: edges stat: one caller, two distinct raw exprs -> same identity => endpoints=1, edges=1 (distinct (from,to) pairs), not 2; unit: GC: orphan externalEndpoint (no in-edge) deleted while a live one (>=1 in-edge) survives the pass; unit: GC no-op when every endpoint has a live caller; GC full-clear leaves zero endpoint nodes when all CALLS_HTTP removed; unit: idempotency: re-run on identical sources => identical node/edge set + identical edges stat (GC deletes nothing) | [[c1]] [[c2]] |
| 3 | **`t3`** TS proven-receiver dataflow recall (+ shared HTTP-verb helper) | M | — | unit: TS: Angular this.http.get (HttpClient DI) + axios.create instance c.post each emit one CALLS_HTTP with the raw URL; unit: TS PRECISION: unproven-receiver foo.get + a param named http WITHOUT the HttpClient type emit zero CALLS_HTTP; unit: TS: module-rooted matches (fetch/axios.get) unchanged; no-HTTP file byte-identical; shared HTTP-verb set exported from http-client-shapes.ts | [[c3]] |
| 4 | **`t4`** Python proven-receiver dataflow recall | M | `t3` | unit: Python: requests.Session s.get + httpx.Client c.post each emit one CALLS_HTTP with the raw URL; unit: Python PRECISION: dict d.get('key') (no Session/Client proof) emits zero CALLS_HTTP; unit: Python: module-rooted matches (requests.get) unchanged; no-HTTP file byte-identical | [[c3]] |

### `t1` — deleteEntitiesById storage primitive

Add `export async function deleteEntitiesById(_db, ids: readonly string[]): Promise<void>` to src/db/entities.ts. In one write txn, for each id: resolve its u64 (skip if absent), delete the entity row, entityIdByString/entityStringByU64 maps, nameIndex entry, and cascade its incident out/in edges — reusing the same per-id removal core as deleteEntitiesForFile (:522) but keyed by explicit ids. Independent of the endpoint pass.

**Acceptance checks:**
- deleteEntitiesById([id]) removes the entity (getEntity=>null) and its incident CALLS_HTTP in/out edges (inNeighbors/outNeighbors empty); other entities + edges untouched.
- Deleting an absent/stale id is a no-op (no throw); a mixed batch of present+absent ids deletes the present ones and skips the rest.

### `t2` — edges-stat distinct-pair count + orphan endpoint GC

In src/indexer/external-endpoints.ts: (1) compute `edges` as the count of DISTINCT (unresolved.fromEntity, targetEntityId) pairs among promotes (not promotes.length). (2) After promoteResolvedBatch, run a GC step: list this repo's externalEndpoint entities (listEntitiesByKind filtered to repo), for each check inNeighbors(CALLS_HTTP); collect ids with zero in-edges and deleteEntitiesById them. GC runs strictly after the promote so current edges are written first; optional gcDeleted stat. Idempotent (no-op when nothing orphaned).

**Acceptance checks:**
- edges = distinct (from,to) pairs: one caller reaching one identity via two distinct raw exprs => endpoints=1, edges=1 (not 2).
- GC deletes an orphan externalEndpoint (zero CALLS_HTTP in-edges) while keeping a live one (>=1 in-edge); a repo whose HTTP calls were all removed ends with zero endpoint nodes.
- Idempotency: re-running on identical sources deletes nothing and yields a byte-identical node/edge set + identical edges stat. A still-called endpoint SURVIVES the pass (GC runs after promoteResolvedBatch and sees the just-written edge) — the survive-test seeds the caller+CALLS_HTTP via the real promote path, not a pre-seeded edge.

### `t3` — TS proven-receiver dataflow recall (+ shared HTTP-verb helper)

In src/indexer/parser/typescript.ts, build a per-file Set of receivers PROVEN to be HTTP clients: (a) a constructor/method param or class field with a `HttpClient` type annotation => `this.<name>`; (b) a `const x = axios.create(...)` lexical_declaration => `x`. In walkForCalls, a `<receiver>.<verb>(url)` call whose receiver text is in the Set AND verb is an HTTP verb emits CALLS_HTTP (reuse emitCallsHttp). Per the s3 critique, factor the shared HTTP-verb set (and any receiver-match helper) into http-client-shapes.ts so t4 (Python) reuses it and the two languages can't drift. Unproven receivers never match; module-rooted matches unchanged.

**Acceptance checks:**
- Angular DI `constructor(private http: HttpClient){}` + `this.http.get(url)` => one CALLS_HTTP with the raw URL; `const c = axios.create({...}); c.post(url,body)` => one CALLS_HTTP.
- PRECISION: `foo.get('key')` on an unproven receiver, and a param named `http` WITHOUT the HttpClient type annotation, emit ZERO CALLS_HTTP.
- Existing module-rooted matches (fetch/axios.get/http.request) unchanged; a no-HTTP file yields a byte-identical ParseResult.
- The shared HTTP-verb set lives in http-client-shapes.ts (exported) so the TS and Python recognizers consume one list.

### `t4` — Python proven-receiver dataflow recall

In src/indexer/parser/python.ts, build a per-scope Set of receivers PROVEN to be HTTP clients from assignments `x = requests.Session()` / `x = httpx.Client()` (RHS is a call whose function text is the exact factory). In walkPythonForHttpCalls, a `<receiver>.<verb>(url)` call whose receiver is in the Set AND verb is an HTTP verb emits CALLS_HTTP (reuse emitCallsHttp + the shared HTTP-verb list from http-client-shapes.ts introduced in t3). Unproven receivers (e.g. dict.get) never match; module-rooted matches (requests.get) unchanged.

**Acceptance checks:**
- `s = requests.Session(); s.get(url)` => one CALLS_HTTP with the raw URL; `c = httpx.Client(); c.post(url)` => one CALLS_HTTP.
- PRECISION: `d.get('key')` on a dict (no Session/Client proof) emits ZERO CALLS_HTTP.
- Existing module-rooted matches (requests.get/httpx.get) unchanged; a no-HTTP file yields a byte-identical ParseResult.
- Reuses the shared HTTP-verb set from http-client-shapes.ts (no duplicated verb list).

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| edges stat: one caller with two distinct raw exprs resolving to the SAME identity => endpoints=1, edges=1 (distinct (from,to) pairs), not 2 | `t2` |
| GC: seed an externalEndpoint node with NO incident CALLS_HTTP in-edge (orphan) + one WITH a live caller; after the pass the orphan is deleted (listEntitiesByKind no longer returns it) and the live one survives | `t2` |
| GC no-op: a pass where every endpoint has a live caller deletes nothing | `t2` |
| GC full-clear: after all CALLS_HTTP rows for a repo are gone, re-running leaves zero externalEndpoint nodes | `t2` |
| idempotency: re-run on identical sources => identical node/edge set + identical edges stat (GC deletes nothing) | `t2` |
| deleteEntitiesById([id]) removes the entity row (getEntity => null) and its incident CALLS_HTTP in/out edges (inNeighbors/outNeighbors empty) | `t1` |
| other entities + their edges are untouched | `t1` |
| deleting an absent/stale id is a no-op (no throw) | `t1` |
| Angular DI: `constructor(private http: HttpClient){} ... this.http.get(url)` => one CALLS_HTTP with the raw URL | `t3` |
| axios instance: `const c = axios.create({...}); c.post(url, body)` => one CALLS_HTTP | `t3` |
| PRECISION: `foo.get('key')` where foo is NOT a proven HTTP client (no HttpClient type, no axios.create) => zero CALLS_HTTP | `t3` |
| PRECISION: a param named `http` WITHOUT the HttpClient type annotation => its `.get()` does NOT match | `t3` |
| module-rooted matches (fetch/axios.get) still work unchanged; a no-HTTP file is byte-identical | `t3` |
| `s = requests.Session(); s.get(url)` => one CALLS_HTTP with the raw URL | `t4` |
| `c = httpx.Client(); c.post(url)` => one CALLS_HTTP | `t4` |
| PRECISION: `d.get('key')` on a dict (no Session/Client proof) => zero CALLS_HTTP | `t4` |
| module-rooted matches (requests.get) still work unchanged | `t4` |

## Citations

- **[[c1]]** `prior-artifact` `LLD S001 dataModel 'resolveExternalEndpoints edges-stat + orphan GC' + invariantsToPreserve (idempotent re-index; edges=distinct(from,to) pairs) — external-endpoints.ts ln 87/130/136` — "edges = distinct (fromEntity,targetEntityId) pair count (not promotes.length); and a post-pass GC that deletes externalEndpoint nodes in the repo with zero incident CALLS_HTTP in-edges. Idempotency pr"
- **[[c2]]** `prior-artifact` `LLD S001 api/dataModel 'deleteEntitiesById' — NEW per-id storage primitive in db/entities.ts (row + name_index + id-maps + edge cascade, mirroring deleteEntitiesForFile:522), tolerant of missing ids` — "NEW storage primitive in src/db/entities.ts. For each id: look up its u64, delete the entity row, its name_index entry, the id<->u64 maps, and cascade its incident out/in edges — mirroring the deleteE"
- **[[c3]]** `prior-artifact` `LLD S001 dataModel 'TS/Python HTTP recognizers — proven-receiver dataflow' + invariant 'zero false positives' — per-file provenHttpReceivers Set from concrete proof nodes (HttpClient type / axios.create / requests.Session / httpx.Client)` — "ALSO matches <receiver>.<verb>(url) when the receiver is in the file's proven-HTTP-client set ... only statically-proven receivers are tracked — unproven receivers never match, so S003's zero-false-po"
