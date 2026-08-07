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
 *   - `number`         — the 0-based positional argument that carries the topic
 *                        (`kafka.send('orders', v)` -> 0; amqp
 *                        `channel.publish('exchange', 'rk', body)` -> 0, the
 *                        exchange; routing-key granularity is a recall gap).
 *   - `{ objectField }` — the topic is a string field of the first OBJECT
 *                        argument (`kafkajs producer.send({ topic })`,
 *                        SNS `publish({ TopicArn })`, SQS
 *                        `sendMessage({ QueueUrl })`). The recognizer reads that
 *                        field, and leniently falls back to the raw first-arg
 *                        text when the first arg is not an object literal (so a
 *                        positional call to the same verb — redis/nats
 *                        `publish(channel, msg)` — is still captured).
 */

import type { Relation } from '../../shared/types.js';

/** How to extract a call's topic/queue argument. A positional index, or a named
 *  field of the first object argument (with a lenient positional-0 fallback). */
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

/** TS/JS: kafkajs (object-arg `{topic}`), AWS SNS/SQS (object-arg
 *  `{TopicArn}`/`{QueueUrl}`), amqplib (positional exchange/queue), redis/nats
 *  (positional channel/subject). Object-field shapes fall back leniently to the
 *  raw first-arg text, so redis/nats `publish(channel)` is captured by the same
 *  `publish` shape as SNS `publish({TopicArn})`. */
const TS_JS_SHAPES: readonly MessagingClientShape[] = [
	{ callee: 'send',           topicArg: { objectField: 'topic' },    direction: 'publish',   match: 'method' }, // kafkajs producer.send({topic})
	{ callee: 'publish',        topicArg: { objectField: 'TopicArn' }, direction: 'publish',   match: 'method' }, // SNS publish({TopicArn}) + redis/nats publish(channel)
	{ callee: 'sendMessage',    topicArg: { objectField: 'QueueUrl' }, direction: 'publish',   match: 'method' }, // SQS sendMessage({QueueUrl})
	{ callee: 'sendToQueue',    topicArg: 0,                           direction: 'publish',   match: 'method' }, // amqplib channel.sendToQueue(queue, ...)
	{ callee: 'subscribe',      topicArg: { objectField: 'topic' },    direction: 'subscribe', match: 'method' }, // kafkajs consumer.subscribe({topic}) + redis subscribe(channel)
	{ callee: 'consume',        topicArg: 0,                           direction: 'subscribe', match: 'method' }, // amqplib channel.consume(queue, cb)
	{ callee: 'receiveMessage', topicArg: { objectField: 'QueueUrl' }, direction: 'subscribe', match: 'method' }, // SQS receiveMessage({QueueUrl})
];

/** Python: kafka-python / confluent_kafka (positional topic), pika
 *  (positional exchange/queue), redis-py (positional channel). */
const PYTHON_SHAPES: readonly MessagingClientShape[] = [
	{ callee: 'send',          topicArg: 0, direction: 'publish',   match: 'method' }, // kafka-python producer.send('t', v)
	{ callee: 'produce',       topicArg: 0, direction: 'publish',   match: 'method' }, // confluent_kafka producer.produce('t', v)
	{ callee: 'basic_publish', topicArg: 0, direction: 'publish',   match: 'method' }, // pika channel.basic_publish(exchange, rk, body)
	{ callee: 'publish',       topicArg: 0, direction: 'publish',   match: 'method' }, // redis-py r.publish(channel, msg)
	{ callee: 'subscribe',     topicArg: 0, direction: 'subscribe', match: 'method' }, // kafka-python consumer.subscribe(['t']) / redis pubsub.subscribe(ch)
	{ callee: 'basic_consume', topicArg: 0, direction: 'subscribe', match: 'method' }, // pika channel.basic_consume(queue, cb)
];

/** Go: NATS (`nc.Publish(subject, data)` / `nc.Subscribe(subject, cb)`) carry
 *  the subject positionally. Kafka producers (segmentio/kafka-go Writer, sarama
 *  ProducerMessage) keep the topic in a config struct — a documented recall gap. */
const GO_SHAPES: readonly MessagingClientShape[] = [
	{ callee: 'Publish',   topicArg: 0, direction: 'publish',   match: 'method' }, // nats.go nc.Publish(subj, data)
	{ callee: 'Subscribe', topicArg: 0, direction: 'subscribe', match: 'method' }, // nats.go nc.Subscribe(subj, cb)
];

/** Java: Spring `KafkaTemplate.send(topic, data)`, JMS/AMQP
 *  `*.convertAndSend(destination, msg)` carry the destination at index 0. Method-
 *  matched, so import-gated. Consumers are annotation-driven (inbound, S006). */
const JAVA_SHAPES: readonly MessagingClientShape[] = [
	{ callee: 'send',           topicArg: 0, direction: 'publish', match: 'method' }, // kafkaTemplate.send(topic, data)
	{ callee: 'convertAndSend', topicArg: 0, direction: 'publish', match: 'method' }, // jms/rabbit template.convertAndSend(dest, msg)
];

/** Scala: `producer.send(...)` (positional topic where present). Record-carried
 *  topics (fs2-kafka / akka-stream-kafka `ProducerRecord`) are a recall gap. */
const SCALA_SHAPES: readonly MessagingClientShape[] = [
	{ callee: 'send', topicArg: 0, direction: 'publish', match: 'method' },
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
