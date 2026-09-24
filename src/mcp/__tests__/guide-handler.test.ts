/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Handler-level tests for the thin `insrc_guide` MCP wrapper (handleInsrcGuide).
 * A present workflow forwards to guide.get and wraps the InsrcGuideOk (ac1); an
 * omitted workflow forwards to guide.list and returns a structured
 * InsrcGuideError envelope (ac2), never throwing. Driven over an in-process fake
 * daemon injected via UnaryRpcDeps.connect (the daemon-stream test pattern).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, createConnection, type Server, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';

import { handleInsrcGuide } from '../guide/handler.js';
import type { InsrcGuideOk, InsrcGuideError } from '../../daemon/guide-sections.js';

/** A tiny in-process daemon answering guide.get / guide.list on a temp socket. */
function fakeDaemon(reply: (method: string, params: unknown) => unknown): {
	path: string; server: Server; close: () => Promise<void>;
} {
	const path = join(tmpdir(), `insrc-guide-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.sock`);
	try { rmSync(path); } catch { /* ignore */ }
	const server = createServer((socket: Socket) => {
		let buffer = '';
		socket.on('data', (chunk: Buffer) => {
			buffer += chunk.toString();
			const lines = buffer.split('\n');
			buffer = lines.pop() ?? '';
			for (const line of lines) {
				if (!line.trim()) continue;
				const req = JSON.parse(line) as { id: number; method: string; params: unknown };
				socket.write(JSON.stringify({ id: req.id, result: reply(req.method, req.params) }) + '\n');
			}
		});
		socket.on('error', () => { /* client vanished */ });
	});
	return {
		path,
		server,
		close: () => new Promise<void>((res) => { server.close(() => { try { rmSync(path); } catch { /* ignore */ } res(); }); }),
	};
}

function listen(server: Server, path: string): Promise<void> {
	return new Promise((res) => server.listen(path, () => res()));
}

function parse(envelope: { content: { type: 'text'; text: string }[] }): unknown {
	assert.equal(envelope.content.length, 1);
	assert.equal(envelope.content[0]?.type, 'text');
	return JSON.parse(envelope.content[0]!.text);
}

test('handleInsrcGuide({workflow}) forwards to guide.get and wraps Ok (ac1)', async () => {
	const daemon = fakeDaemon((method, params) => {
		assert.equal(method, 'guide.get');
		assert.deepEqual(params, { workflow: 'design.story' });
		return { workflow: 'design.story', guidance: 'DO THE THING' } satisfies InsrcGuideOk;
	});
	await listen(daemon.server, daemon.path);
	try {
		const env = await handleInsrcGuide({ workflow: 'design.story' }, { connect: () => createConnection(daemon.path) });
		const ok = parse(env) as InsrcGuideOk;
		assert.equal(ok.workflow, 'design.story');
		assert.equal(ok.guidance, 'DO THE THING');
	} finally {
		await daemon.close();
	}
});

test('handleInsrcGuide({}) forwards to guide.list and returns a structured Error (ac2)', async () => {
	const daemon = fakeDaemon((method) => {
		assert.equal(method, 'guide.list');
		return { workflows: ['define', 'plan'] };
	});
	await listen(daemon.server, daemon.path);
	try {
		const env = await handleInsrcGuide({}, { connect: () => createConnection(daemon.path) });
		const errResult = parse(env) as InsrcGuideError;
		assert.match(errResult.error, /workflow is required/);
		assert.deepEqual(errResult.validWorkflows, ['define', 'plan']);
	} finally {
		await daemon.close();
	}
});

test('handleInsrcGuide passes through an unknown-workflow error from guide.get', async () => {
	const daemon = fakeDaemon(() => ({ error: 'unknown workflow: nope', validWorkflows: ['define'] }));
	await listen(daemon.server, daemon.path);
	try {
		const env = await handleInsrcGuide({ workflow: 'nope' }, { connect: () => createConnection(daemon.path) });
		const errResult = parse(env) as InsrcGuideError;
		assert.match(errResult.error, /unknown workflow/);
		assert.deepEqual(errResult.validWorkflows, ['define']);
	} finally {
		await daemon.close();
	}
});

test('handleInsrcGuide surfaces a daemon-unreachable transport failure as an isError envelope (never throws)', async () => {
	// No daemon listening on this socket path -> the client rejects; the handler
	// must catch it and return a clean isError envelope, not propagate the throw.
	const deadPath = join(tmpdir(), `insrc-guide-dead-${Date.now()}.sock`);
	const env = await handleInsrcGuide({ workflow: 'plan' }, { connect: () => createConnection(deadPath) });
	assert.equal(env.isError, true);
	assert.equal(env.content[0]?.type, 'text');
	assert.match(env.content[0]!.text, /could not reach the daemon/i);
});

test('handleInsrcGuide treats a whitespace-only workflow as omitted (ac2)', async () => {
	const daemon = fakeDaemon((method) => {
		assert.equal(method, 'guide.list'); // whitespace-only must NOT hit guide.get
		return { workflows: ['define'] };
	});
	await listen(daemon.server, daemon.path);
	try {
		const env = await handleInsrcGuide({ workflow: '   ' }, { connect: () => createConnection(daemon.path) });
		const errResult = parse(env) as InsrcGuideError;
		assert.match(errResult.error, /workflow is required/);
	} finally {
		await daemon.close();
	}
});
