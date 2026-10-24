import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { Socket } from 'node:net';
import { guideGet, runWorkflowStream, reviewArtifactStream } from '../daemon-stream.js';

class FakeSocket extends EventEmitter {
	write(): boolean { return true; }
	end(): void {}
	destroy(): void {}
	get socket(): Socket { return this as unknown as Socket; }
	feed(frame: unknown): void {
		for (const byte of Buffer.from(JSON.stringify(frame) + '\n')) this.emit('data', Buffer.from([byte]));
	}
}
const TEXT = '—é🙂';
test('MCP unary replies preserve UTF-8 characters split at every byte', async () => {
	const s = new FakeSocket();
	const promise = guideGet({ workflow: 'build' }, { connect: () => s.socket });
	s.feed({ id: 1, result: { workflow: 'build', guidance: TEXT } });
	assert.deepEqual(await promise, { workflow: 'build', guidance: TEXT });
});
test('MCP workflow streams preserve split UTF-8 in both progress and done frames', async () => {
	const s = new FakeSocket(), progress: unknown[] = [];
	const promise = runWorkflowStream({ workflow: 'stub', focus: 'utf8' }, { onFrame: (_k, data) => progress.push(data) }, { connect: () => s.socket });
	s.feed({ id: 1, stream: 'progress', data: TEXT });
	s.feed({ id: 1, stream: 'done', data: { path: TEXT, artifact: {}, runId: 'r', model: 'test' } });
	assert.deepEqual(progress, [TEXT]); assert.equal((await promise).path, TEXT);
});
test('MCP review streams preserve split UTF-8 in done frames', async () => {
	const s = new FakeSocket();
	const promise = reviewArtifactStream({ artifactPath: '/repo/LLD.md' }, { timeoutMs: 1000 }, { connect: () => s.socket });
	s.feed({ id: 1, stream: 'done', data: { note: TEXT } });
	assert.deepEqual(await promise, { note: TEXT });
});
