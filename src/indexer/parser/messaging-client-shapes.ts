/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Shared messaging-client call-site recognition tables + emit helper
 * (E20260807914cbf5e:S004 — sc1-consuming outbound messaging detector).
 *
 * The messaging analogue of `http-client-shapes.ts`. The per-language
 * recognizers extend their call walks with the SAME two-step contract, so the
 * detection surface stays uniform:
 *
 *   1. `matchMessagingClient(language, callee)` — given a normalized callee
 *      path, returns HOW to extract the topic/queue argument (a positional index
 *      OR a named field of the first object argument) + the coupling DIRECTION
 *      (publish / subscribe), or `null` when the call is not a known messaging
 *      client.
 *   2. `emitMessaging(relations, {...})` — pushes an UNRESOLVED PUBLISHES_TO
 *      (producers) or SUBSCRIBES_TO (consumers) relation
 *      `{ kind, from, to:<raw topic expr>, resolved:false }`, SKIPPING emission
 *      when the topic expression is empty (never mint an empty-`to` node).
 *
 * PRECISION: messaging verb names (send / publish / subscribe / consume /
 * produce / sendMessage) collide with mainstream non-messaging APIs — RxJS
 * `Observable.subscribe`, `EventEmitter.emit`, array/stream `.send`. So UNLIKE
 * the HTTP recognizer (which gates only Java/Scala), the messaging recognizer is
 * import-gated for ALL FIVE languages: a file is scanned only when it imports a
 * known messaging library (`fileImportsMessagingLibrary`). Coverage favours
 * precision — libraries whose topic lives behind a client-config object or a
 * typed record (Go kafka-go Writer topic, sarama/fs2-kafka `ProducerRecord`) are
 * a deliberate recall gap, not a false edge.
 *
 * Topic extraction (`topicArg`):
 *   - `number`         — the 0-based positional argument that carries the topic.
 *                        Reserved for shapes whose verb is SPECIFIC enough to be
 *                        safe on any receiver (pika `basic_publish`/`basic_consume`,
 *                        confluent `produce`, nats-go `Publish`/`Subscribe`,
 *                        JMS/AMQP `convertAndSend`).
 *   - `{ objectField }` — the topic is a string field of the first OBJECT-LITERAL
 *                        argument (`kafkajs producer.send({ topic })`, SNS
 *                        `publish({ TopicArn })`, SQS `sendMessage({ QueueUrl })`).
 *                        There is NO positional fallback: a `send`/`publish`/
 *                        `subscribe` whose first arg is not an object literal
 *                        carrying the field emits nothing. This is what keeps the
 *                        generic verbs safe — `res.send('x')`, RxJS
 *                        `obs.subscribe(cb)`, and AWS-v3 `client.send(cmd)` do not
 *                        false-positive.
 *
 * PRECISION > RECALL — documented recall gaps (deliberate, favouring zero false
 * positives over coverage of ambiguous positional verbs on unknown receivers):
 *   - kafka-python `producer.send('t', v)` and redis/nats `publish(channel)` in
 *     TS/Python (bare positional `send`/`publish`/`subscribe` on an un-proven
 *     receiver is indistinguishable from a generator/socket/EventEmitter call).
 *   - AWS SDK v3 `client.send(new PublishCommand({ TopicArn }))` (topic is nested
 *     in a command constructor). A proven-receiver dataflow (mirroring the S001
 *     axios/http proven-receiver) that would recover these safely is a follow-up.
 */

import type { Relation } from '../../shared/types.js';

/** How to extract a call's topic/queue argument. A positional index (safe only
 *  for specific verbs), or a named field of the first OBJECT-LITERAL argument
 *  (no positional fallback — a non-object first arg extracts nothing). */
export type TopicArgSelector = number | { readonly objectField: string };

/** One recognized messaging-client call shape: a callee token + how to reach the
 *  topic argument + the coupling direction + how the token is matched. */
export interface MessagingClientShape {
	/** Exact normalized callee path (`match:'exact'`) or the messaging-specific
	 *  method name to match as the callee's last segment (`match:'method'`). */
	readonly callee: string;
	/** How to extract the topic/queue expression from the call's arguments. */
	readonly topicArg: TopicArgSelector;
	/** Whether the call publishes to (producer) or subscribes from (consumer). */
	readonly direction: 'publish' | 'subscribe';
	/** Matching mode; defaults to `'exact'`. */
	readonly match?: 'exact' | 'method';
}

/** Collapse ALL internal whitespace so `producer . send` and `producer.send`
 *  compare equal (shared semantics with http-client-shapes' normalizeCallee). */
export function normalizeCallee(raw: string): string {
	return raw.replace(/\s+/g, '');
}

/** The last dotted segment of a normalized callee path (`a.b.c` -> `c`). */
function lastSegment(callee: string): string {
	const i = callee.lastIndexOf('.');
	return i === -1 ? callee : callee.slice(i + 1);
}

// ---------------------------------------------------------------------------
// Per-language client-shape tables
// ---------------------------------------------------------------------------

/** TS/JS: OBJECT-LITERAL shapes only — kafkajs (`{topic}`) + AWS v2 SNS/SQS
 *  (`{TopicArn}`/`{QueueUrl}`). The topic must be a field of a first-arg object
 *  literal, so a generic `send`/`publish`/`subscribe` on a non-object arg
 *  (`res.send('x')`, RxJS `obs.subscribe(cb)`, AWS-v3 `client.send(cmd)`) never
 *  matches. Positional redis/nats/amqplib in TS is a documented recall gap. */
const TS_JS_SHAPES: readonly MessagingClientShape[] = [
	{ callee: 'send',           topicArg: { objectField: 'topic' },    direction: 'publish',   match: 'method' }, // kafkajs producer.send({topic})
	{ callee: 'publish',        topicArg: { objectField: 'TopicArn' }, direction: 'publish',   match: 'method' }, // AWS v2 SNS publish({TopicArn})
	{ callee: 'sendMessage',    topicArg: { objectField: 'QueueUrl' }, direction: 'publish',   match: 'method' }, // AWS v2 SQS sendMessage({QueueUrl})
	{ callee: 'subscribe',      topicArg: { objectField: 'topic' },    direction: 'subscribe', match: 'method' }, // kafkajs consumer.subscribe({topic})
	{ callee: 'receiveMessage', topicArg: { objectField: 'QueueUrl' }, direction: 'subscribe', match: 'method' }, // AWS v2 SQS receiveMessage({QueueUrl})
];

/** Python: SPECIFIC-verb positional shapes only — pika (`basic_publish` /
 *  `basic_consume`) + confluent (`produce`). The generic `send`/`publish`/
 *  `subscribe` are DROPPED: they collide with the generator/coroutine `.send`,
 *  socket `.send`, and redis-cache APIs (a documented kafka-python / redis-py
 *  recall gap) rather than risk a false positive. */
const PYTHON_SHAPES: readonly MessagingClientShape[] = [
	{ callee: 'produce',       topicArg: 0, direction: 'publish',   match: 'method' }, // confluent_kafka producer.produce('t', v)
	{ callee: 'basic_publish', topicArg: 0, direction: 'publish',   match: 'method' }, // pika channel.basic_publish(exchange, rk, body)
	{ callee: 'basic_consume', topicArg: 0, direction: 'subscribe', match: 'method' }, // pika channel.basic_consume(queue, cb)
];

/** Go: NATS (`nc.Publish(subject, data)` / `nc.Subscribe(subject, cb)`) carry
 *  the subject positionally. Kafka producers (segmentio/kafka-go Writer, sarama
 *  ProducerMessage) keep the topic in a config struct — a documented recall gap. */
const GO_SHAPES: readonly MessagingClientShape[] = [
	{ callee: 'Publish',   topicArg: 0, direction: 'publish',   match: 'method' }, // nats.go nc.Publish(subj, data)
	{ callee: 'Subscribe', topicArg: 0, direction: 'subscribe', match: 'method' }, // nats.go nc.Subscribe(subj, cb)
];

/** Java: JMS/AMQP `*.convertAndSend(destination, msg)` — a messaging-SPECIFIC
 *  verb, so safe under import-gating even though Spring templates are injected
 *  fields (no local factory to prove). The generic `KafkaTemplate.send(topic,..)`
 *  is DROPPED (collides with any `.send`) — a documented recall gap. */
const JAVA_SHAPES: readonly MessagingClientShape[] = [
	{ callee: 'convertAndSend', topicArg: 0, direction: 'publish', match: 'method' }, // jms/rabbit template.convertAndSend(dest, msg)
];

/** Scala: fs2-kafka / kafka `produce(...)` — a messaging-specific verb. The
 *  generic `send` is DROPPED. Record-carried topics (`ProducerRecord`) remain a
 *  recall gap. */
const SCALA_SHAPES: readonly MessagingClientShape[] = [
	{ callee: 'produce', topicArg: 0, direction: 'publish', match: 'method' },
];

/** Per-language tables, keyed on the parser `language` tag. A language absent
 *  here detects nothing (additive: no behaviour change for it). */
export const MESSAGING_CLIENT_SHAPES: Readonly<Record<string, readonly MessagingClientShape[]>> = {
	typescript: TS_JS_SHAPES,
	javascript: TS_JS_SHAPES,
	python:     PYTHON_SHAPES,
	go:         GO_SHAPES,
	java:       JAVA_SHAPES,
	scala:      SCALA_SHAPES,
};

// ---------------------------------------------------------------------------
// Import-gating — required for ALL five languages
// ---------------------------------------------------------------------------

/**
 * Per-language import-specifier substrings that indicate a messaging library is
 * in scope. EVERY language is gated (unlike HTTP, which gates only Java/Scala):
 * the messaging method names above (`send`/`publish`/`subscribe`/`consume`/...)
 * are too generic to match safely without proof the file actually talks to a
 * broker. A language whose file imports none of these detects nothing.
 */
export const MESSAGING_LIBRARY_IMPORT_MARKERS: Readonly<Record<string, readonly string[]>> = {
	typescript: [
		'kafkajs',
		'@aws-sdk/client-sns', '@aws-sdk/client-sqs', 'aws-sdk',
		'amqplib', 'amqp-connection-manager',
		'ioredis', 'redis',
		'nats',
		'@google-cloud/pubsub',
	],
	javascript: [
		'kafkajs',
		'@aws-sdk/client-sns', '@aws-sdk/client-sqs', 'aws-sdk',
		'amqplib', 'amqp-connection-manager',
		'ioredis', 'redis',
		'nats',
		'@google-cloud/pubsub',
	],
	python: [
		'kafka',            // kafka-python
		'confluent_kafka',
		'pika',             // RabbitMQ
		'redis',
		'nats',
		'google.cloud.pubsub',
	],
	go: [
		'github.com/nats-io',
		'github.com/segmentio/kafka-go',
		'github.com/Shopify/sarama', 'github.com/IBM/sarama',
		'github.com/confluentinc/confluent-kafka-go',
		'cloud.google.com/go/pubsub',
	],
	java: [
		'org.springframework.kafka',
		'org.springframework.jms',
		'org.springframework.amqp',
		'javax.jms', 'jakarta.jms',
		'com.rabbitmq',
		'org.apache.kafka',
	],
	scala: [
		'akka.kafka',
		'fs2.kafka',
		'org.apache.kafka',
		'com.sksamuel.pulsar4s',
	],
};

/**
 * True if any of the file's raw import specifiers references a known messaging
 * library for `language` (substring test against the marker table). A language
 * with no marker table is treated as NOT gated (returns `true`) — but every
 * language above HAS a table, so messaging is effectively always gated.
 */
export function fileImportsMessagingLibrary(language: string, importSpecifiers: Iterable<string>): boolean {
	const markers = MESSAGING_LIBRARY_IMPORT_MARKERS[language];
	if (markers === undefined) return true;
	for (const spec of importSpecifiers) {
		for (const m of markers) if (spec.includes(m)) return true;
	}
	return false;
}

// ---------------------------------------------------------------------------
// Matching + emit — the stable contract each recognizer calls
// ---------------------------------------------------------------------------

/**
 * Match a call's callee path against `language`'s messaging-client table.
 * `callee` is normalized (whitespace collapsed) internally, so callers may pass
 * raw member/selector text. Returns `{ topicArg, direction }` on a match, else
 * `null` (not a known messaging client).
 */
export function matchMessagingClient(
	language: string,
	callee: string,
): { topicArg: TopicArgSelector; direction: 'publish' | 'subscribe' } | null {
	const table = MESSAGING_CLIENT_SHAPES[language];
	if (table === undefined) return null;
	const norm = normalizeCallee(callee);
	if (norm === '') return null;
	const seg = lastSegment(norm);
	for (const shape of table) {
		const hit = (shape.match ?? 'exact') === 'method'
			? seg === shape.callee
			: norm === shape.callee;
		if (hit) return { topicArg: shape.topicArg, direction: shape.direction };
	}
	return null;
}

/**
 * Push an UNRESOLVED boundary relation into `relations`: `PUBLISHES_TO` for a
 * producer (`direction:'publish'`), `SUBSCRIBES_TO` for a consumer
 * (`direction:'subscribe'`), `from` -> raw topic/queue expression. SKIPS emission
 * when `rawTopicExpr` is empty/whitespace (the "unextractable topic" case: never
 * mint an empty-`to` node). Returns whether a relation was emitted.
 */
export function emitMessaging(
	relations: Relation[],
	args: {
		readonly from: string;
		readonly repo: string;
		readonly file: string;
		readonly rawTopicExpr: string;
		readonly direction: 'publish' | 'subscribe';
	},
): boolean {
	const raw = args.rawTopicExpr.trim();
	if (raw === '') return false;
	relations.push({
		kind:     args.direction === 'publish' ? 'PUBLISHES_TO' : 'SUBSCRIBES_TO',
		from:     args.from,
		to:       raw,
		resolved: false,
		meta:     { file: args.file, repo: args.repo },
	});
	return true;
}
