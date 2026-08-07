<!-- insrc:artifact PLAN-914cbf5ea9026b92-s4 -->

# Plan: E20260807914cbf5e:S004

**Epic:** `work-framed-approved-spec-proceed-from`
**LLD run:** `wf-1786117300928-eg9qoc`
**LLD effective hash:** `fd544bcd90a0...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** New messaging-client-shapes.ts shape module (mirror http-client-shapes.ts) | M | — | unit: messaging-client-shapes.test.ts: matchMessagingClient exact/method + topicArg (positional + objectField) + direction; null on unknown; unit: messaging-client-shapes.test.ts: fileImportsMessagingLibrary gating per language (no import -> false; marker import -> true); unit: messaging-client-shapes.test.ts: emitMessaging one PUBLISHES_TO/SUBSCRIBES_TO per direction; empty topic -> false/no push | [[c1]] [[c5]] |
| 2 | **`t2`** Wire the messaging recognizer into all five parsers | M | `t1` | unit: messaging-client-shapes.test.ts: TS recognizer via typescriptParser.parse()->messaging relations (Kafka-JS object-field send, SNS/SQS object-field, ioredis pub/sub; RxJS no-import negative); unit: http-recognizer-py-go.test.ts (extended): pythonParser.parse -> PUBLISHES_TO/SUBSCRIBES_TO (kafka-python send / consumer, pika basic_publish/basic_consume); unit: http-recognizer-py-go.test.ts (extended): goParser.parse -> messaging relations for a Go kafka client, import-gated | [[c1]] [[c5]] |
| 3 | **`t3`** resolveMessagingEndpoints pass + protocol-scoped gcOrphanEndpoints refactor + settle-pass wiring | M | `t1` | integration: messaging-endpoints.test.ts: resolveMessagingEndpoints with injected sc2 -> resolved topic mints one endpoint + promotes edge of the row's own kind; pub+sub to one topic = ONE node, TWO edges; integration: messaging-endpoints.test.ts: unresolvable topic -> resolved:false endpoint with rawExpression (not dropped); idempotency + distinct-edge counting; integration: messaging-endpoints.test.ts: protocol-scoped GC (messaging endpoint survives the HTTP pass and vice-versa; orphan messaging endpoint deleted; rows===0 full-clear); integration: external-endpoints.test.ts (unchanged): still passes after the gcOrphanEndpoints refactor + call-site updates (shipped-code regression gate) | [[c2]] [[c3]] [[c5]] |
| 4 | **`t4`** Tests: shape helper + per-language recognizers + resolution pass (incl cross-protocol GC) | M | `t1`, `t2`, `t3` | unit: ac1 recognizer coverage: producer->PUBLISHES_TO / consumer->SUBSCRIBES_TO across TS/Python/Go; integration: ac1 resolution coverage: one per-repo endpoint per distinct resolved topic, correct direction, pub+sub share one node; integration: ac2 coverage: config-built topic resolved -> resolved endpoint; unresolvable -> resolved:false with rawExpression preserved; integration: full indexer sweep green (npx tsx --test src/indexer/**/__tests__/*.test.ts) with no S003 HTTP regression | [[c4]] |

### E20260807914cbf5e:S004:T001 — New messaging-client-shapes.ts shape module (mirror http-client-shapes.ts)

Create src/indexer/parser/messaging-client-shapes.ts exporting: interface MessagingClientShape { callee; topicArg: number | { objectField: string }; direction: 'publish'|'subscribe'; match?: 'exact'|'method' }; per-language MESSAGING_CLIENT_SHAPES tables (Kafka / AMQP-RabbitMQ / AWS SQS+SNS / GCP Pub-Sub / NATS / Redis pub-sub); matchMessagingClient(language, callee) -> {topicArg, direction}|null (reusing normalizeCallee/lastSegment semantics); MESSAGING_LIBRARY_IMPORT_MARKERS + fileImportsMessagingLibrary (gated for ALL FIVE languages); emitMessaging(relations,{from,repo,file,rawTopicExpr,direction}) pushing ONE unresolved PUBLISHES_TO/SUBSCRIBES_TO and skipping an empty topic. No parser wiring yet.

**Acceptance checks:**
- matchMessagingClient resolves exact + method shapes with correct topicArg (positional index and {objectField}) and direction; returns null for an unknown language/callee
- fileImportsMessagingLibrary returns false for a file importing no messaging library in every one of the five languages, true when a marker library is imported
- emitMessaging pushes exactly one PUBLISHES_TO for direction 'publish' / SUBSCRIBES_TO for 'subscribe', and returns false pushing nothing on an empty/whitespace topic
- tsc clean; the module exports mirror http-client-shapes.ts's surface

### E20260807914cbf5e:S004:T002 — Wire the messaging recognizer into all five parsers

Wire matchMessagingClient/emitMessaging into each parser's call walk, mirroring the HTTP wiring: TS/JS inline in walkForCalls (typescript.ts); Python + Go focused walks (walkPythonForMessaging / walkGoForMessaging alongside the existing HTTP walks at go.ts:115/:198); Java + Scala under a new ctx.messagingEnabled import gate (parallel to ctx.httpEnabled) computed via fileImportsMessagingLibrary. Extract the topic arg per shape (positional index or object-field lookup on the first argument) and pass the raw expression text to emitMessaging with the shape's direction. Precision-over-recall: each language covers only its documented high-precision library subset; record that per-language covered-library set explicitly.

**Acceptance checks:**
- For each language's COVERED libraries, a producer call emits one unresolved PUBLISHES_TO to the topic expression and a consumer call emits one SUBSCRIBES_TO; the covered-library set per language is recorded explicitly and uncovered libraries are a documented recall gap (not a failure)
- Object-field shapes (Kafka-JS send({topic}), SNS publish({TopicArn}), SQS sendMessage({QueueUrl})) extract the field value; positional shapes (kafka-python send('t',...)) extract by index
- Java/Scala emit nothing unless the file imports a messaging library (ctx.messagingEnabled gate); an RxJS .subscribe with no messaging import emits nothing
- The existing HTTP recognizer output for each parser is unchanged (additive wiring); tsc clean

### E20260807914cbf5e:S004:T003 — resolveMessagingEndpoints pass + protocol-scoped gcOrphanEndpoints refactor + settle-pass wiring

Create src/indexer/messaging-endpoints.ts resolveMessagingEndpoints({db,repo,resolve?}) mirroring resolveExternalEndpoints: filter unresolved PUBLISHES_TO+SUBSCRIBES_TO, resolve each distinct rawTo via resolve(repo,'messaging',rawTo), mint one protocol:'messaging' externalEndpoint per distinct identity (makeExternalEndpointId, name `messaging:${identity}`, unresolved-not-dropped), promoteResolvedBatch (kind preserved). Refactor gcOrphanEndpoints in external-endpoints.ts: widen to (repo, protocol, kinds), EXPORT it, add the protocol filter on the endpoint list, update resolveExternalEndpoints's two call sites to ('http',['CALLS_HTTP']); call it from the messaging pass with ('messaging',['PUBLISHES_TO','SUBSCRIBES_TO']). Wire resolveMessagingEndpoints into src/indexer/index.ts at both :445 (settle-pass) and :587 (fullIndex) next to resolveExternalEndpoints. NOTE: end-to-end index coverage of messaging is realized only once t2+t3 are both merged; t3's own tests use seeded unresolved rows + an injected sc2, not real parses.

**Acceptance checks:**
- After the gcOrphanEndpoints signature/export refactor + the two resolveExternalEndpoints call-site updates, the existing external-endpoints.test.ts passes UNCHANGED (regression gate on the shipped code, verified before/independent of the new messaging behaviour)
- resolveMessagingEndpoints promotes unresolved PUBLISHES_TO/SUBSCRIBES_TO to resolved edges of their own kind onto one node per distinct topic; publish+subscribe to one topic share ONE endpoint node with two edges
- An unresolvable topic mints a resolved:false endpoint carrying rawExpression (not dropped); the pass is idempotent (second run a no-op)
- gcOrphanEndpoints is protocol-scoped: the messaging pass never deletes an HTTP endpoint and the HTTP pass never deletes a messaging endpoint; an orphaned messaging endpoint IS deleted
- resolveMessagingEndpoints runs at both index.ts settle-pass and fullIndex sites; tsc clean

### E20260807914cbf5e:S004:T004 — Tests: shape helper + per-language recognizers + resolution pass (incl cross-protocol GC)

Add src/indexer/parser/__tests__/messaging-client-shapes.test.ts (helper contract + TS recognizer, mirroring http-client-shapes.test.ts); extend src/indexer/parser/__tests__/http-recognizer-py-go.test.ts with Python + Go messaging cases; add src/indexer/__tests__/messaging-endpoints.test.ts mirroring external-endpoints.test.ts with an injected fake sc2 resolve (resolved + unresolved), the one-node-two-edges pub+sub case, unresolved-not-dropped, idempotency, and the cross-protocol GC regression (a co-located HTTP endpoint survives the messaging GC and vice-versa). The end-to-end assertions assume t2+t3 both merged.

**Acceptance checks:**
- All new tests pass under node:test; matchMessagingClient/fileImportsMessagingLibrary/emitMessaging + the TS/Python/Go recognizers are covered
- The resolution-pass integration test proves ac1 (one node per topic, correct direction) and ac2 (resolved + unresolved endpoints), plus the cross-protocol GC regression
- The full indexer test sweep stays green (no regression to the S003 HTTP tests)

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| matchMessagingClient(language, callee) -> {topicArg, direction}\|null (exact vs method; publish vs subscribe) | `t1`, `t4` |
| fileImportsMessagingLibrary gating for all five languages (RxJS .subscribe / EventEmitter .emit with no messaging import -> no emission) | `t1`, `t2`, `t4` |
| emitMessaging -> one PUBLISHES_TO for publish / one SUBSCRIBES_TO for subscribe; empty topic -> false/no push | `t1`, `t4` |
| the TS recognizer via typescriptParser.parse()->messaging relations (Kafka-JS object-field send, SNS/SQS object-field, ioredis publish/subscribe) | `t2`, `t4` |
| pythonParser.parse -> PUBLISHES_TO/SUBSCRIBES_TO for kafka-python producer.send('t',...) / consumer, pika channel.basic_publish/basic_consume | `t2`, `t4` |
| goParser.parse -> messaging relations for a Go messaging client (segmentio/kafka-go / sarama), import-gated | `t2`, `t4` |
| resolveMessagingEndpoints with an injected sc2 resolve: resolved topic mints one endpoint + promotes the edge of the row's own kind | `t3`, `t4` |
| publish+subscribe to the same topic -> ONE node, TWO edges | `t3`, `t4` |
| unresolvable topic -> endpoint resolved:false with rawExpression (not dropped) | `t3`, `t4` |
| protocol-scoped gcOrphanEndpoints: a messaging endpoint is NOT deleted by the http pass and vice-versa; an orphaned messaging endpoint IS deleted; rows===0 full-clear | `t3`, `t4` |
| idempotency + distinct-edge counting | `t3`, `t4` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s4 contractDetails.api — matchMessagingClient / fileImportsMessagingLibrary / emitMessaging (the per-language recognizer helpers)`
- **[[c2]]** `prior-artifact` `LLD s4 contractDetails.api — resolveMessagingEndpoints (the messaging resolution pass mirroring resolveExternalEndpoints)`
- **[[c3]]** `prior-artifact` `LLD s4 contractDetails.api — gcOrphanEndpoints reshaped to protocol-scoped (repo, protocol, kinds), exported + shared by both passes`
- **[[c4]]** `prior-artifact` `LLD s4 testStrategy — unit (shape helper + TS recognizer), unit (Python/Go focused walks), integration (resolution pass + cross-protocol GC)`
- **[[c5]]** `prior-artifact` `LLD s4 dataModelChanges — MessagingClientShape + MESSAGING_CLIENT_SHAPES tables, PUBLISHES_TO/SUBSCRIBES_TO emission, externalEndpoint(protocol 'messaging') node`
