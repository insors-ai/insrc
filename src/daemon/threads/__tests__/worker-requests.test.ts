/**
 * Epic 86197ac6, Story s2 / t8: a worker's request entry. A stream frame that cannot be
 * cloned ends the stream with a named error in its place; the handler is cancelled and its
 * later frames are not sent.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MessageChannel } from 'node:worker_threads';

import { directDispatch } from '../../server.js';
import { serveRequests } from '../worker-requests.js';
import type { FrameEnvelope, RequestEnvelope } from '../channel.js';

const tick = (ms = 50): Promise<void> => new Promise(r => setTimeout(r, ms));

test('a nonterminal stream frame that cannot be cloned ends the stream with one named error; the handler is cancelled and its later frames are dropped', async () => {
	const { port1, port2 } = new MessageChannel();
	const received: FrameEnvelope[] = [];
	port1.on('message', m => received.push(m as FrameEnvelope));
	let signal: AbortSignal | undefined;
	let sentAfter = false;
	const stop = serveRequests(port2, directDispatch({}, {
		feed: async (_params, send, abort) => {
			signal = abort;
			send({ id: 1, stream: 'data', data: { cannotClone: () => 1 } });
			await tick();
			send({ id: 2, stream: 'data', data: 'later' });
			send({ id: 3, stream: 'done', data: null });
			sentAfter = true;
		},
	}));
	try {
		port1.postMessage({ kind: 'request', requestId: 'r1', method: 'feed', params: {}, stream: true } satisfies RequestEnvelope);
		await tick(250);
		assert.equal(sentAfter, true, 'the handler ran to its end');
		assert.equal(signal?.aborted, true, 'the handler was cancelled when its frame could not be sent');
		assert.equal(received.length, 1, `one envelope reached the main thread: ${JSON.stringify(received)}`);
		const frame = received[0]!.frame as { stream: string; data: { error: string } };
		assert.equal(frame.stream, 'error');
		assert.match(frame.data.error, /^the result of feed could not be returned: /);
	} finally {
		stop();
		port1.close();
		port2.close();
	}
});
