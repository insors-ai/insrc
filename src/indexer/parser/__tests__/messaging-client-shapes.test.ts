/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S004 (t1/t2) — the shared messaging-client-shapes helper contract + the
 * TypeScript/JS recognizer wired into the parser's call walk.
 *
 * Run: npx tsx --test src/indexer/parser/__tests__/messaging-client-shapes.test.ts
 */

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

import {
	MESSAGING_CLIENT_SHAPES,
	matchMessagingClient,
	emitMessaging,
	fileImportsMessagingLibrary,
} from '../messaging-client-shapes.js';
import { typescriptParser } from '../typescript.js';
import type { Entity, Relation } from '../../../shared/types.js';

const REPO = '/repo';
const REPO_ID = 1;
const FILE = '/repo/src/producer.ts';

function parse(source: string): { entities: Entity[]; relations: Relation[] } {
	return typescriptParser.parse(FILE, source, REPO, REPO_ID);
}

function pub(r: { relations: Relation[] }): Relation[] {
	return r.relations.filter(rel => rel.kind === 'PUBLISHES_TO');
}
function sub(r: { relations: Relation[] }): Relation[] {
	return r.relations.filter(rel => rel.kind === 'SUBSCRIBES_TO');
}

// ---------------------------------------------------------------------------
// Helper contract
// ---------------------------------------------------------------------------

describe('messaging-client-shapes helper — stable contract', () => {
	it('exposes a per-language shape table for all six parser languages', () => {
		for (const lang of ['typescript', 'javascript', 'python', 'go', 'java', 'scala']) {
			const table = MESSAGING_CLIENT_SHAPES[lang];
			assert.ok(Array.isArray(table) && table.length > 0, `missing/empty table for ${lang}`);
			for (const shape of table) {
				assert.equal(typeof shape.callee, 'string');
				assert.ok(shape.direction === 'publish' || shape.direction === 'subscribe');
			}
		}
	});

	it('matchMessagingClient resolves method shapes with direction + topicArg (positional and object-field)', () => {
		assert.deepEqual(matchMessagingClient('python', 'channel.basic_publish'), { topicArg: 0, direction: 'publish' });
		assert.deepEqual(matchMessagingClient('python', 'channel.basic_consume'), { topicArg: 0, direction: 'subscribe' });
		assert.deepEqual(matchMessagingClient('typescript', 'producer.send'), { topicArg: { objectField: 'topic' }, direction: 'publish' });
		assert.deepEqual(matchMessagingClient('typescript', 'sns.publish'), { topicArg: { objectField: 'TopicArn' }, direction: 'publish' });
		assert.deepEqual(matchMessagingClient('go', 'nc.Subscribe'), { topicArg: 0, direction: 'subscribe' });
		assert.deepEqual(matchMessagingClient('java', 'jmsTemplate.convertAndSend'), { topicArg: 0, direction: 'publish' });
	});

	it('matchMessagingClient DROPS the generic positional verbs that collide with non-messaging APIs', () => {
		// send/publish/subscribe are precision-unsafe as bare positional verbs
		assert.equal(matchMessagingClient('python', 'producer.send'), null);     // generator/socket .send
		assert.equal(matchMessagingClient('python', 'redis.publish'), null);     // covered only via specific verbs
		assert.equal(matchMessagingClient('java', 'kafkaTemplate.send'), null);  // any .send
	});

	it('matchMessagingClient rejects unknown callees / languages', () => {
		assert.equal(matchMessagingClient('typescript', 'foo.bar'), null);
		assert.equal(matchMessagingClient('ruby', 'producer.send'), null);
		assert.equal(matchMessagingClient('typescript', ''), null);
	});

	it('fileImportsMessagingLibrary gates every language (no messaging import => false)', () => {
		assert.equal(fileImportsMessagingLibrary('typescript', [`'kafkajs'`]), true);
		assert.equal(fileImportsMessagingLibrary('typescript', [`'lodash'`, `'react'`]), false);
		assert.equal(fileImportsMessagingLibrary('python', ['pika']), true);
		assert.equal(fileImportsMessagingLibrary('python', ['os', 'sys']), false);
		assert.equal(fileImportsMessagingLibrary('go', ['github.com/nats-io/nats.go']), true);
		assert.equal(fileImportsMessagingLibrary('go', ['fmt', 'net/http']), false);
		assert.equal(fileImportsMessagingLibrary('java', ['import org.springframework.kafka.core.KafkaTemplate;']), true);
		assert.equal(fileImportsMessagingLibrary('java', ['import java.util.List;']), false);
		assert.equal(fileImportsMessagingLibrary('scala', ['import fs2.kafka._']), true);
	});

	it('emitMessaging pushes one PUBLISHES_TO/SUBSCRIBES_TO per direction, and skips an empty topic', () => {
		const rels: Relation[] = [];
		assert.equal(emitMessaging(rels, { from: 'c', repo: REPO, file: FILE, rawTopicExpr: `'orders'`, direction: 'publish' }), true);
		assert.equal(emitMessaging(rels, { from: 'c', repo: REPO, file: FILE, rawTopicExpr: `'events'`, direction: 'subscribe' }), true);
		assert.equal(emitMessaging(rels, { from: 'c', repo: REPO, file: FILE, rawTopicExpr: '   ', direction: 'publish' }), false);
		assert.equal(rels.length, 2);
		assert.deepEqual(rels[0], { kind: 'PUBLISHES_TO', from: 'c', to: `'orders'`, resolved: false, meta: { file: FILE, repo: REPO } });
		assert.equal(rels[1]!.kind, 'SUBSCRIBES_TO');
	});
});

// ---------------------------------------------------------------------------
// TypeScript/JS recognizer (import-gated)
// ---------------------------------------------------------------------------

describe('TypeScript/JS messaging recognizer', () => {
	it('kafkajs object-field send/subscribe emit PUBLISHES_TO / SUBSCRIBES_TO to the topic', () => {
		const r = parse(`
import { Kafka } from 'kafkajs';
async function run() {
  const producer = kafka.producer();
  await producer.send({ topic: 'orders', messages: [] });
  const consumer = kafka.consumer();
  await consumer.subscribe({ topic: 'events' });
}
`);
		assert.deepEqual(pub(r).map(x => x.to), [`'orders'`]);
		assert.deepEqual(sub(r).map(x => x.to), [`'events'`]);
		for (const x of [...pub(r), ...sub(r)]) assert.equal(x.resolved, false);
	});

	it('AWS SNS/SQS object-field publish/sendMessage/receiveMessage extract the arn/url field', () => {
		const r = parse(`
import { SNSClient } from '@aws-sdk/client-sns';
import { SQSClient } from '@aws-sdk/client-sqs';
function f() {
  sns.publish({ TopicArn: 'arn:aws:sns:orders' });
  sqs.sendMessage({ QueueUrl: 'https://sqs/q1', MessageBody: 'x' });
  sqs.receiveMessage({ QueueUrl: 'https://sqs/q1' });
}
`);
		assert.deepEqual(pub(r).map(x => x.to).sort(), [`'arn:aws:sns:orders'`, `'https://sqs/q1'`]);
		assert.deepEqual(sub(r).map(x => x.to), [`'https://sqs/q1'`]);
	});

	it('PRECISION: a positional redis/nats publish(channel) is a documented recall gap (no object literal => no emit)', () => {
		const r = parse(`
import IORedis from 'ioredis';
function f() {
  redis.publish('news', 'hello');
  redis.subscribe('news');
}
`);
		assert.equal(pub(r).length + sub(r).length, 0, 'no positional fallback: precision over recall');
	});

	it('PRECISION: an RxJS observable.subscribe() in a file with NO messaging import emits nothing', () => {
		const r = parse(`
import { Observable } from 'rxjs';
function f(obs) { return obs.subscribe(v => console.log(v)); }
`);
		assert.equal(pub(r).length + sub(r).length, 0);
	});

	it('PRECISION: RxJS obs.subscribe(cb) even in a MESSAGING-imported file emits nothing (no object literal)', () => {
		const r = parse(`
import { Kafka } from 'kafkajs';
import { interval } from 'rxjs';
function f() { return interval(1000).subscribe(v => console.log(v)); }
`);
		assert.equal(sub(r).length, 0, 'the arrow arg is not an object literal with a topic field');
	});

	it('PRECISION: Express res.send(string) in a redis-session file emits nothing', () => {
		const r = parse(`
import RedisStore from 'connect-redis';
function handler(req, res) { return res.send('hello world'); }
`);
		assert.equal(pub(r).length, 0, 'a string arg is not an object literal => no PUBLISHES_TO');
	});

	it('PRECISION: AWS SDK v3 client.send(new PublishCommand({...})) emits nothing (command is not an object literal)', () => {
		const r = parse(`
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
async function f() { return snsClient.send(new PublishCommand({ TopicArn: 'arn:x', Message: 'hi' })); }
`);
		assert.equal(pub(r).length, 0, 'the new-expression arg is not an object literal => no false endpoint');
	});

	it('PRECISION: a bare send()/publish() local call (not a receiver.verb) emits nothing even in a messaging file', () => {
		const r = parse(`
import { Kafka } from 'kafkajs';
function send(x) { return x; }
function f() { return send('not a topic'); }
`);
		assert.equal(pub(r).length + sub(r).length, 0);
	});

	it('an object arg WITHOUT the topic field yields no PUBLISHES_TO (no empty-to node)', () => {
		const r = parse(`
import { Kafka } from 'kafkajs';
function f() { return producer.send({ messages: [] }); }
`);
		assert.equal(pub(r).length, 0);
	});
});
