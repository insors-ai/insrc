<!-- insrc:artifact LLD-914cbf5ea9026b92-s4 -->

# LLD: E20260807914cbf5e:S004

**Epic:** `work-framed-approved-spec-proceed-from`
**HLD base run:** `wf-1786031712974-qqqe5k`
**HLD effective hash:** `fd544bcd90a0...`

## HLD context

**Framework:** Pipeline-integrated external-service graph tracing. The graph gains one new node kind (ExternalEndpoint, carrying a protocol + resolved/unresolved tag) and four typed boundary edge kinds (CALLS_HTTP, PUBLISHES_TO, SUBSCRIBES_TO, CALLS_RPC), added once to the graph vocabulary and gated by a graph-schema migration so existing indexes evolve without a full re-index. Per-language outbound and inbound detectors run as thin plugins inside the existing tree-sitter parse; a shared protocol-agnostic resolution engine turns indirect/configured targets into a concrete identity (or an explicit unresolved marker) from layered config sources with a fixed precedence. Cross-repo linking is a separate daemon-side matching pass, keyed off a per-repo service-identity registry, that forms a real dependency edge onto the target repo's actual handler entity and inserts it into the DEPENDS_ON closure; the same pass, re-fired on repo register/re-index events, is the out-of-order backfill.
**Rollout phase:** Phase B — Detection: outbound classes + inbound handlers + service identity
**Consumes:** `sc1` (ExternalEndpoint graph vocabulary), `sc2` (Target resolution engine)

## Contract details

**Surface level:** internal

### `matchMessagingClient`

```typescript
function matchMessagingClient(language: string, callee: string): { topicArg: number | { objectField: string }; direction: 'publish' | 'subscribe' } | null
```

**Parameters:**
- `language: string` — parser language tag selecting the MESSAGING_CLIENT_SHAPES table (typescript/javascript/python/go/java/scala)
- `callee: string` — raw or normalized callee path of a call-site (e.g. `producer.send`, `sns.publish`, `channel.basicConsume`); normalized internally

**Returns:** `{ topicArg: number | { objectField: string }; direction: 'publish' | 'subscribe' } | null` — on a shape match, how to extract the topic/queue arg (positional index OR a named field of the first object arg) + the coupling direction; null when the callee is not a recognized messaging client (mirrors matchHttpClient returning null)

**Postconditions:**
- Exact-match shapes compare the full normalized callee; 'method'-match shapes compare only the last dotted segment (identical semantics to matchHttpClient)
- A language absent from MESSAGING_CLIENT_SHAPES returns null (detects nothing — additive)

### `fileImportsMessagingLibrary`

```typescript
function fileImportsMessagingLibrary(language: string, importSpecifiers: Iterable<string>): boolean
```

**Parameters:**
- `language: string` — parser language tag selecting the MESSAGING_LIBRARY_IMPORT_MARKERS table
- `importSpecifiers: Iterable<string>` — the file's raw import specifier strings

**Returns:** `boolean` — true iff any import specifier references a known messaging library for the language (substring test)

**Postconditions:**
- UNLIKE fileImportsHttpLibrary (ungated for languages with no marker table), messaging is gated for ALL FIVE languages because messaging verbs (send/publish/subscribe/consume/emit/receive) collide with mainstream non-messaging APIs (RxJS .subscribe, EventEmitter .emit). A file importing no messaging library detects nothing.

### `emitMessaging`

```typescript
function emitMessaging(relations: Relation[], args: { readonly from: string; readonly repo: string; readonly file: string; readonly rawTopicExpr: string; readonly direction: 'publish' | 'subscribe' }): boolean
```

**Parameters:**
- `relations: Relation[]` — accumulator the recognizer pushes the boundary edge into
- `args: { from: string; repo: string; file: string; rawTopicExpr: string; direction: 'publish' | 'subscribe' }` — caller entity id, relation meta, raw topic/queue expression, and coupling direction

**Returns:** `boolean` — whether a relation was pushed; false when rawTopicExpr is empty/whitespace (unextractable-topic case, no empty-`to` node) — mirrors emitCallsHttp

**Postconditions:**
- Pushes exactly ONE unresolved relation: 'PUBLISHES_TO' when direction==='publish', 'SUBSCRIBES_TO' when 'subscribe'; {from, to: rawTopicExpr.trim(), resolved:false, meta:{file,repo}}
- Returns false and pushes nothing when rawTopicExpr.trim() === ''

### `resolveMessagingEndpoints`

```typescript
function resolveMessagingEndpoints(opts: { readonly db: DbClient; readonly repo: string; readonly resolve?: (repo: string, protocol: ExternalProtocol, rawExpression: string) => Promise<ResolvedTarget> }): Promise<{ endpoints: number; edges: number; skipped: number; gcDeleted: number }>
```

**Parameters:**
- `opts.db: DbClient` — daemon graph client
- `opts.repo: string` — repo whose unresolved messaging edges are resolved
- `opts.resolve: (repo, protocol, rawExpression) => Promise<ResolvedTarget>` _(optional)_ — injectable sc2 resolver (default = the real memoized sc2 resolve)

**Returns:** `Promise<{ endpoints: number; edges: number; skipped: number; gcDeleted: number }>` — counts of distinct messaging endpoints minted, distinct (from,to) edges promoted, rows skipped, and orphan messaging endpoints GC'd — same result shape as resolveExternalEndpoints

**Preconditions:**
- sc1 vocabulary + sc2 resolver present (both shipped)

**Postconditions:**
- Reads listUnresolvedRelations(db,repo) filtered to kind IN ('PUBLISHES_TO','SUBSCRIBES_TO'); resolves each DISTINCT rawTo once via resolve(repo,'messaging',rawTo)
- Mints ONE externalEndpoint per distinct topic identity: id=makeExternalEndpointId(repo,'messaging',target,rawTo), name `messaging:${identity}`, protocol:'messaging', language:'config', resolved, target, +rawExpression only when unresolved — pub+sub to one topic dedups to ONE node
- promoteResolvedBatch preserves each row's ORIGINAL kind (publish->PUBLISHES_TO, subscribe->SUBSCRIBES_TO) onto the same node (direction on the edge)
- An unresolvable topic still mints an endpoint (resolved:false) rather than dropping the row (k5)
- Idempotent: promoting deletes the unresolved row; a second run is a no-op
- Runs orphan GC scoped to protocol 'messaging' + kinds ['PUBLISHES_TO','SUBSCRIBES_TO'] after the edge writes; also on the rows===0 full-clear path

### `gcOrphanEndpoints`

```typescript
function gcOrphanEndpoints(repo: string, protocol: ExternalProtocol, kinds: readonly RelationKind[]): Promise<number>
```

**Parameters:**
- `repo: string` — repo whose externalEndpoint nodes are swept
- `protocol: ExternalProtocol` — RESHAPED (was repo-only): restricts the sweep to endpoints of THIS protocol so the http and messaging passes never GC each other's nodes
- `kinds: readonly RelationKind[]` — boundary in-edge kinds that keep an endpoint alive (http: ['CALLS_HTTP']; messaging: ['PUBLISHES_TO','SUBSCRIBES_TO'])

**Returns:** `Promise<number>` — count of orphan endpoints deleted (protocol-scoped)

**Postconditions:**
- Lists externalEndpoint nodes for `repo` FILTERED to `protocol`, deletes those with zero inNeighbors(u64,{kindFilter: kinds}) via deleteEntitiesById
- Exported from external-endpoints.ts so the messaging pass reuses it; resolveExternalEndpoints now calls it with ('http',['CALLS_HTTP']) — fixing the latent cross-protocol GC hazard

## Data model changes

### `MessagingClientShape (interface + MESSAGING_CLIENT_SHAPES tables)` — new

New MessagingClientShape interface + per-language MESSAGING_CLIENT_SHAPES tables; topicArg is a positional index OR an object-field selector; direction is publish|subscribe. Mirrors HttpClientShape.

**Call sites:**
- `src/indexer/parser/messaging-client-shapes.ts`

### `PUBLISHES_TO / SUBSCRIBES_TO boundary relations` — invariant-change

sc1 kinds (bytes 14/15) begin being emitted (unresolved) by the recognizers and promoted (resolved) by resolveMessagingEndpoints. No Relation-shape change.

**Call sites:**
- `src/indexer/parser/messaging-client-shapes.ts (emitMessaging)`
- `src/indexer/parser/typescript.ts / python.ts / go.ts / java.ts / scala.ts`
- `src/indexer/messaging-endpoints.ts`

### `externalEndpoint node (protocol 'messaging')` — new

New instances of the sc1 externalEndpoint kind with protocol:'messaging'; one node per topic; deterministic id; unresolved-not-dropped.

**Call sites:**
- `src/indexer/messaging-endpoints.ts`
- `src/indexer/external-endpoints.ts`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | Emits PUBLISHES_TO/SUBSCRIBES_TO + mints protocol:'messaging' externalEndpoint nodes via makeExternalEndpointId; participates in the DEPENDS_ON closure per sc1. No amendment. |
| `sc2` | consumes | resolve(repo,'messaging',rawTopicExpr) for identity resolution / unresolved marking (ac2/k5). No amendment. |

## Error paths

### Error cases

- **An object-arg messaging call whose topic field is absent or non-literal (e.g. `producer.send({ partition: 0 })` with no topic field, or `send({ topic: dynamicVar })`)** (recoverable)
  - Detection: The objectField lookup on the first argument's object node returns no matching property (or a non-string-literal value); the extracted rawTopicExpr is empty/whitespace
  - Response: emitMessaging returns false and pushes NOTHING for a truly-empty expr; a present-but-non-literal field yields the raw expression text and is emitted unresolved — never an empty-`to` node
  - User impact: A call whose topic cannot be located is silently not linked (no bogus node), or captured as an unresolved endpoint when an expression exists
- **The calling entity for an unresolved messaging row no longer exists at resolution time** (recoverable)
  - Detection: entityU64ForId(row.fromEntity) returns undefined in resolveMessagingEndpoints
  - Response: Skip that row (skipped++), never write a dangling edge — identical to resolveExternalEndpoints
  - User impact: The stale coupling is dropped; a subsequent clean index re-derives it
- **resolveMessagingEndpoints is run for a repo not in the registry** (recoverable)
  - Detection: lookupRepoId(repo) returns undefined
  - Response: Skip all rows and return { skipped: rows.length, endpoints:0, edges:0, gcDeleted:0 } (mirrors S003)
  - User impact: No endpoints minted for an unregistered repo; expected under the repo-registry contract (k4)
- **The injected/real sc2 resolve rejects for a topic expression** (recoverable)
  - Detection: The awaited resolve(...) call rejects inside the per-distinct-expr loop
  - Response: The rejection propagates to the indexer's pass-level error handling (mirrors resolveExternalEndpoints, no per-row catch); no partial dangling edge is written because promotion happens only after successful resolution
  - User impact: Messaging endpoints for that repo are not updated until the next successful pass; HTTP endpoints (a separate pass) unaffected

### Edge cases

| Input | Expected |
| :--- | :--- |
| A repo that BOTH publishes to and subscribes from the same topic `orders` (resolved) | Exactly ONE externalEndpoint node (messaging:orders) with TWO incident edges — a PUBLISHES_TO and a SUBSCRIBES_TO (direction on the edge, one node per topic) |
| Kafka-JS `producer.send({ topic: 'orders' })` vs Kafka-Python `producer.send('orders', value)` | Both emit PUBLISHES_TO to `orders`; JS via {objectField:'topic'}, Python via topicArg index 0 |
| AWS `sns.publish({ TopicArn: arn })` and `sqs.sendMessage({ QueueUrl: url })` | PUBLISHES_TO whose raw topic expr is the TopicArn / QueueUrl field value, handed to sc2 resolve('messaging',...) |
| AMQP `channel.consume('work-queue', cb)` and `channel.publish('exchange', 'routingKey', buf)` | consume -> SUBSCRIBES_TO to `work-queue` (arg 0); publish -> PUBLISHES_TO whose identity is the exchange arg (arg 0) — exchange-as-topic; routing-key granularity is a documented recall gap |
| An RxJS `observable.subscribe(cb)` in a file that imports NO messaging library | NO SUBSCRIBES_TO emitted — fileImportsMessagingLibrary gates every language, so the generic `.subscribe` verb does not false-positive |
| A file importing a messaging library that also calls a same-named non-messaging method | A residual false positive is accepted (precision-over-recall stance, mirroring S003's Java gating caveat) — rare; gating removes the common case |
| A messaging topic built from config, unresolvable (`kafka.send(process.env.MISSING_TOPIC, ...)`) | Still minted as an externalEndpoint tagged resolved:false with rawExpression = the raw config expression (ac2/k5) — not dropped |
| Re-index removes a producer whose topic endpoint now has zero incident messaging in-edges, while a co-located HTTP endpoint exists | The messaging-scoped GC deletes the orphaned messaging endpoint but leaves the HTTP endpoint untouched; symmetrically the HTTP GC never deletes a messaging endpoint |
| The same distinct topic expression appears at many call-sites | sc2 resolve invoked ONCE per distinct expression (memoized); edges counts DISTINCT (from,to) pairs |

### Invariants to preserve

- The shipped S003 HTTP recognizer and resolveExternalEndpoints continue to emit and resolve CALLS_HTTP exactly as before — the messaging additions are additive. [[c1]]
- gcOrphanEndpoints, reshaped to be protocol-scoped, preserves the HTTP GC behaviour identically for protocol 'http' endpoints (zero-CALLS_HTTP-in-edge still GC'd; live-edge kept) — it only stops considering other protocols' endpoints. [[c2]]
- makeExternalEndpointId determinism and per-repo dedup are unchanged; messaging endpoints key deterministically on (repo, 'messaging', identity) (k2). [[c3]]
- Non-endpoint Entity rows stay byte-identical — protocol/resolved/target/rawExpression attach only to externalEndpoint rows. [[c3]]

## Test strategy

**Test framework:** `node:test (node --test / tsx --test) with node:assert/strict, matching src/indexer/parser/__tests__/http-client-shapes.test.ts, http-recognizer-py-go.test.ts, and src/indexer/__tests__/external-endpoints.test.ts`

### Test levels

- **unit** — Prove the messaging shape helper contract + per-language recognizers in isolation, mirroring http-client-shapes.test.ts: shape table present per language, matchMessagingClient exact/method + direction, topic extraction (positional + object-field), import-gating across all five languages, emitMessaging single-emit/empty-skip with correct kind per direction.
  - Subjects: `matchMessagingClient(language, callee) -> {topicArg, direction}|null (exact vs method; publish vs subscribe)`, `fileImportsMessagingLibrary gating for all five languages (RxJS .subscribe / EventEmitter .emit with no messaging import -> no emission)`, `emitMessaging -> one PUBLISHES_TO for publish / one SUBSCRIBES_TO for subscribe; empty topic -> false/no push`, `the TS recognizer via typescriptParser.parse()->messaging relations (Kafka-JS object-field send, SNS/SQS object-field, ioredis publish/subscribe)`
  - Fixtures: `Inline TS importing kafkajs/@aws-sdk/ioredis with producer.send({topic}), sns.publish({TopicArn}), sqs.sendMessage({QueueUrl}), redis.subscribe('ch')`, `Inline TS with an RxJS observable.subscribe(cb) and NO messaging import (negative / gating)`, `Callee-string fixtures for matchMessagingClient exact + method per language`
- **unit** — Prove the Python + Go focused messaging walks (mirroring http-recognizer-py-go.test.ts): positional topic extraction and direction, import-gated.
  - Subjects: `pythonParser.parse -> PUBLISHES_TO/SUBSCRIBES_TO for kafka-python producer.send('t',...) / consumer, pika channel.basic_publish/basic_consume`, `goParser.parse -> messaging relations for a Go messaging client (segmentio/kafka-go / sarama), import-gated`
  - Fixtures: `Inline Python importing kafka / pika with positional-topic publish + subscribe`, `Inline Go importing a kafka client with a producer write + a consumer read`
- **integration** — Prove the resolution pass end-to-end over a real graph, mirroring external-endpoints.test.ts: unresolved PUBLISHES_TO/SUBSCRIBES_TO -> resolved edges + one node per topic; unresolved-not-dropped; protocol-scoped GC including the cross-protocol regression.
  - Subjects: `resolveMessagingEndpoints with an injected sc2 resolve: resolved topic mints one endpoint + promotes the edge of the row's own kind`, `publish+subscribe to the same topic -> ONE node, TWO edges`, `unresolvable topic -> endpoint resolved:false with rawExpression (not dropped)`, `protocol-scoped gcOrphanEndpoints: a messaging endpoint is NOT deleted by the http pass and vice-versa; an orphaned messaging endpoint IS deleted; rows===0 full-clear`, `idempotency + distinct-edge counting`
  - Fixtures: `A registered temp repo graph seeded with unresolved PUBLISHES_TO/SUBSCRIBES_TO rows + a co-located HTTP endpoint (for the cross-protocol GC assertion)`, `An injectable fake sc2 resolve returning resolved for one expr and unresolved for another`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `TS/Python/Go recognizer tests: a producer call emits PUBLISHES_TO and a consumer call emits SUBSCRIBES_TO to the topic expression, in each language`, `integration: resolveMessagingEndpoints mints one per-repo externalEndpoint per distinct resolved topic and promotes the call-site edge with the correct direction; publish+subscribe to the same topic share ONE node with the two distinct edge kinds` |
| `ac2` | `integration: a config-built topic resolved via the injected sc2 becomes a resolved endpoint (target = resolved identity); an unresolvable topic still mints an endpoint tagged resolved:false with rawExpression preserved (not dropped)` |

## Alternatives considered

### a1: Sibling mirror: messaging-client-shapes.ts + messaging-endpoints.ts, protocol-scoped GC — **CHOSEN**

A dedicated messaging shape module + a dedicated messaging resolution pass, each a direct mirror of its S003 counterpart, with the shared orphan-GC refactored to be protocol-scoped so the two protocols never GC each other's endpoints.



### a2: Generalize to a protocol-agnostic boundary layer

Rename/extend http-client-shapes -> a generic boundary-client-shapes and generalize resolveExternalEndpoints to loop over all protocols.



**Rejected because:** Rank 3: 'partial' on sc2 — invasively rewrites shipped, reviewed S003 code (rename + signature change) and pre-empts S005's own design turn; the DRY win is deferred to when S005 actually needs it.

### a3: Minimal in-file extension (fewest new files)

Add messaging shape tables as a second export inside http-client-shapes.ts and a resolveMessagingEndpoints inside external-endpoints.ts.



**Rejected because:** Rank 2: behaviourally equal to a1 but couples S004's private recognition into S003's `http`/`external`-named files, muddying module identity and the 'private to S004' boundary (scored 'partial' on sc2).

## Citations

- **[[c1]]** `analyze-bundle` `s1 symbol.locate — http-client-shapes.ts (HttpClientShape/matchHttpClient/emitCallsHttp/import-gating), the S003 template S004 mirrors` — "S004 mirrors this exactly as messaging-client-shapes.ts, adding a `direction:'publish'|'subscribe'` field on the shape and topicArgIndex instead of urlArgIndex"
- **[[c2]]** `analyze-bundle` `s1 symbol.locate — external-endpoints.ts resolveExternalEndpoints + gcOrphanEndpoints; the cross-protocol GC hazard` — "a messaging endpoint has zero CALLS_HTTP in-edges, so the EXISTING HTTP gc would wrongly delete S004's endpoints — gcOrphanEndpoints must become protocol-scoped"
- **[[c3]]** `analyze-bundle` `s1 data-model.trace — sc1 vocabulary (PUBLISHES_TO 14 / SUBSCRIBES_TO 15 / externalEndpoint 13) + ExternalProtocol 'messaging' + makeExternalEndpointId protocol param` — "S004 adds NO new graph kinds ... makeExternalEndpointId(repo, protocol:string, target, rawExpression='') already generic over protocol"
- **[[c4]]** `analyze-bundle` `s1 usage.example — per-parser HTTP recognizer wiring + the precision note that messaging verbs are generic (import-gate all five languages)` — "the messaging recognizer must be import-gated for ALL five languages (not just Java/Scala) and prefer module-rooted/object-arg shapes"

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.story (design.story)

**0 HIGH · 7 MED · 0 LOW** · model `client` · reviewed 2026-08-07T15:51:45.697Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| cl1 | citation | MED | manual | http-client-shapes.ts is the S003 template with HttpClientShape + matchHttpClient + emitCallsHttp + fileImportsHttpLibrary that S004 mirrors. | http-client-shapes.ts exports matchHttpClient, emitCallsHttp, fileImportsHttpLibrary and interface HttpClientShape (4/4 matched) — the template S004 mirrors exists as described. |  |
| cl2 | citation | MED | manual | external-endpoints.ts resolveExternalEndpoints filters CALLS_HTTP and its gcOrphanEndpoints is protocol-BLIND (lists all externalEndpoint nodes, GCs by CALLS_HTTP in-edges only) — the latent cross-protocol hazard S004 fixes. | external-endpoints.ts:77 resolveExternalEndpoints filters kind==='CALLS_HTTP'; :166 gcOrphanEndpoints(repo) lists ALL externalEndpoint nodes (:167 listEntitiesByKind(null,'externalEndpoint')) and gates on kindFilter:['CALLS_HTTP'] (:174) — protocol-blind, confirming the cross-protocol GC hazard S004 fixes. |  |
| cl3 | semantic | MED | manual | promoteResolvedBatch preserves each unresolved row's ORIGINAL kind via RELATION_KIND_BYTE[unresolved.kind], so a PUBLISHES_TO/SUBSCRIBES_TO row promotes to a resolved edge of that same kind (not hardcoded to CALLS_HTTP). | relations.ts:405 promoteResolvedBatch uses RELATION_KIND_BYTE[unresolved.kind] — the promoted edge kind is the row's own kind, so PUBLISHES_TO/SUBSCRIBES_TO survive promotion (not hardcoded to CALLS_HTTP). |  |
| cl4 | semantic | MED | manual | The sc1 vocabulary already carries PUBLISHES_TO=14 / SUBSCRIBES_TO=15 relation bytes + externalEndpoint entity byte, so S004 adds no new graph kinds. | keys.ts: PUBLISHES_TO:14, SUBSCRIBES_TO:15, externalEndpoint:13 — sc1 vocabulary already carries the messaging kinds; S004 adds none. |  |
| cl5 | external-contract | MED | manual | sc2 resolve accepts protocol 'messaging' (ExternalProtocol = 'http'\|'messaging'\|'rpc'), and makeExternalEndpointId takes a generic protocol param, so a messaging pass reuses both unchanged. | shared/types.ts:551 `type ExternalProtocol = 'http' \| 'messaging' \| 'rpc'`; base.ts:35 makeExternalEndpointId is generic over a protocol param — both reusable for 'messaging' unchanged. |  |
| cl6 | citation | MED | manual | The Java parser carries an import-gate flag (ctx.httpEnabled) computed from fileImportsHttpLibrary that S004's messagingEnabled mirrors. | java.ts has 6 references to httpEnabled/fileImportsHttpLibrary — the import-gate flag S004's messagingEnabled mirrors exists. |  |
| cl7 | citation | MED | manual | The S003 test files S004 extends exist and use the parse()->relations harness under node:test. | All three test files (http-client-shapes.test.ts, http-recognizer-py-go.test.ts, external-endpoints.test.ts) exist — the harness S004 extends is present. |  |
