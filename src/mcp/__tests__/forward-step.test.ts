/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The MCP forwarders of the seven step tools (Epic c2ba6fa6, Story s11, task
 * t9). A stand-in daemon is the real IpcServer request handling on a temporary
 * socket; nothing here reaches the live daemon socket, a store or a model.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, linkSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createConnection, createServer } from 'node:net';
import type { Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { IpcServer } from '../../daemon/server.js';
import type { RpcHandlers, StreamHandler, StreamHandlers } from '../../daemon/server.js';
import { createStepCallHandler } from '../../daemon/steps/host.js';
import { STEP_TOOL_NAMES } from '../../shared/step-context.js';
import { _setForwardConnectForTests, forwardStep } from '../forward-step.js';
import type { StepMcpEnvelope } from '../forward-step.js';
import { buildInsrcMcpServer } from '../server.js';

const HERE = dirname(fileURLToPath(import.meta.url));

/** The real IpcServer request handling, served on a temporary socket. */
async function standInDaemon(stream: StreamHandlers, rpc: RpcHandlers = {}) {
	const ipc = new IpcServer(rpc, stream);
	const dir = mkdtempSync(join(tmpdir(), 'insrc-forward-'));
	const path = join(dir, 'd.sock');
	const server = createServer((socket: Socket) => {
		(ipc as unknown as { handleConnection(s: Socket): void }).handleConnection(socket);
	});
	await new Promise<void>(r => server.listen(path, () => r()));
	return {
		path,
		connect: (): Socket => createConnection(path),
		close: async (): Promise<void> => { await new Promise<void>(r => server.close(() => r())); rmSync(dir, { recursive: true, force: true }); },
	};
}

const parse = (env: StepMcpEnvelope): { next: string; error: { code: string; name: string; message: string; retryable: boolean } } =>
	JSON.parse(env.content[0]!.text) as never;

test('forwarder named errors: ENOENT/ECONNREFUSED give DaemonUnreachableError, unknown method or step-unknown-tool give DaemonTooOldError, and no handler runs', async () => {
	// --- no daemon: the socket file is missing (ENOENT) ---
	const dir = mkdtempSync(join(tmpdir(), 'insrc-forward-none-'));
	try {
		const missing = join(dir, 'absent.sock');
		for (const tool of STEP_TOOL_NAMES) {
			const env = await forwardStep(tool, { phase: 'start' }, {}, { connect: () => createConnection(missing) });
			assert.equal(env.isError, true, tool);
			const { error } = parse(env);
			assert.equal(error.code, 'daemon-unreachable', tool);
			assert.equal(error.name, 'DaemonUnreachableError', tool);
			assert.match(error.message, /ENOENT/);
			assert.match(error.message, /the insrc daemon is not running/);
			assert.equal(error.retryable, true);
		}
		// --- no daemon: a socket file that nobody listens on (ECONNREFUSED) ---
		// A hard link to a listening socket's file outlives the listener.
		const live = join(dir, 'live.sock');
		const dead = join(dir, 'dead.sock');
		const listener = createServer();
		await new Promise<void>(r => listener.listen(live, () => r()));
		linkSync(live, dead);
		await new Promise<void>(r => listener.close(() => r()));
		assert.ok(existsSync(dead), 'a socket file remains with no listener');
		for (const tool of STEP_TOOL_NAMES) {
			const refused = await forwardStep(tool, { phase: 'start' }, {}, { connect: () => createConnection(dead) });
			const { error } = parse(refused);
			assert.equal(error.code, 'daemon-unreachable', tool);
			assert.equal(error.name, 'DaemonUnreachableError');
			assert.match(error.message, /ECONNREFUSED/);
			assert.match(error.message, /the insrc daemon is not running/);
		}
	} finally { rmSync(dir, { recursive: true, force: true }); }

	// --- a daemon without step.call: every tool is DaemonTooOldError, and nothing it serves runs ---
	let ran = 0;
	const other: StreamHandler = async (_p, send) => { ran += 1; send({ id: 0, stream: 'done', data: {} }); };
	const old = await standInDaemon({ 'workflow.review': other }, { 'daemon.status': async () => { ran += 1; return {}; } });
	try {
		for (const tool of STEP_TOOL_NAMES) {
			const env = await forwardStep(tool, { phase: 'start' }, {}, { connect: old.connect });
			const { error } = parse(env);
			assert.equal(error.code, 'daemon-too-old', tool);
			assert.equal(error.name, 'DaemonTooOldError');
			assert.match(error.message, /unknown method: step\.call/);
			assert.equal(error.retryable, false);
		}
	} finally { await old.close(); }

	// --- a daemon with step.call but without this tool: step-unknown-tool -> DaemonTooOldError ---
	const calls: string[] = [];
	const spy = (name: string) => async () => { calls.push(name); return { content: [{ type: 'text', text: '{}' }] }; };
	const partial = await standInDaemon({ 'step.call': createStepCallHandler({ insrc_analyze_step: spy('insrc_analyze_step') }) });
	try {
		const env = await forwardStep('insrc_triage', { phase: 'start' }, {}, { connect: partial.connect });
		const { error } = parse(env);
		assert.equal(error.code, 'daemon-too-old');
		assert.match(error.message, /no tool 'insrc_triage'/);
	} finally { await partial.close(); }
	assert.equal(ran, 0, 'no handler of the old daemon ran');
	assert.deepEqual(calls, [], 'no step handler ran');
});

/** An MCP client of the real server, whose forwarders connect to `connect`. */
async function mcpClient(name: string) {
	const server = buildInsrcMcpServer();
	const [a, b] = InMemoryTransport.createLinkedPair();
	await server.connect(a);
	const client = new Client({ name, version: '0' });
	await client.connect(b);
	// Every progress notification that reaches the client, seen at its transport.
	const progressMessages: unknown[] = [];
	const deliver = b.onmessage;
	b.onmessage = (message, extra) => {
		if ((message as { method?: string }).method === 'notifications/progress') progressMessages.push(message);
		deliver?.(message, extra);
	};
	return { client, progressMessages, close: async () => { await client.close(); await server.close(); } };
}

test('forwarder progress: frames relayed only with a progress token; the done envelope returned unchanged', async () => {
	const ENVELOPE = { content: [{ type: 'text' as const, text: '{\n  "next": "emit_classification",\n  "state": "tok"\n}' }], extraField: { kept: [1, 2] } };
	const seen: unknown[] = [];
	const stepCall: StreamHandler = async (params, send) => {
		seen.push(params);
		send({ id: 0, stream: 'progress', data: { kind: 'stage', operation: 'workflow.run', stageId: 'a', stageLabel: 'first stage', index: 1, total: 2 } });
		send({ id: 0, stream: 'progress', data: 'a plain progress line' });
		send({ id: 0, stream: 'done', data: ENVELOPE });
	};
	const daemon = await standInDaemon({ 'step.call': stepCall });
	_setForwardConnectForTests(daemon.connect);
	try {
		// The forwarder returns the done frame's data unchanged.
		assert.deepEqual(await forwardStep('insrc_triage', { phase: 'start', focus: 'f' }), ENVELOPE);

		const { client, progressMessages, close } = await mcpClient('claude-code');
		try {
			// Without a progress token: no notification, and the reply is the daemon's envelope.
			const quiet = await client.callTool({ name: 'insrc_triage', arguments: { phase: 'start', focus: 'add a flag' } });
			assert.deepEqual(quiet.content, ENVELOPE.content);
			assert.deepEqual(progressMessages, [], 'no progress without a token');

			// With a token: both frames are relayed, in order, against that token.
			const got: { progress: number; message?: string | undefined }[] = [];
			const loud = await client.callTool({ name: 'insrc_triage', arguments: { phase: 'start', focus: 'add a flag' } }, undefined, { onprogress: (p) => { got.push({ progress: p.progress, message: p.message }); } });
			assert.deepEqual(loud.content, ENVELOPE.content);
			assert.deepEqual(got, [{ progress: 1, message: '▸ first stage' }, { progress: 2, message: '▸ a plain progress line' }]);
			assert.equal(progressMessages.length, 2, 'the transport saw exactly the two relayed frames');

			// The forwarded request: the raw arguments, this process's cwd, and the client as 'claude'.
			const last = seen[seen.length - 1] as { tool: string; args: unknown; context: { cwd: string; client?: string; envRepo?: string } };
			assert.equal(last.tool, 'insrc_triage');
			assert.deepEqual(last.args, { phase: 'start', focus: 'add a flag' });
			assert.equal(last.context.cwd, process.cwd());
			assert.equal(last.context.client, 'claude');
			assert.equal(last.context.envRepo, process.env['INSRC_REPO'] !== undefined && process.env['INSRC_REPO'] !== '' ? process.env['INSRC_REPO'] : undefined);
		} finally { await close(); }
	} finally {
		_setForwardConnectForTests(undefined);
		await daemon.close();
	}
});

test('MCP tool surface: the twelve tools keep their names, descriptions and input schemas', async () => {
	// The golden file was captured from the server before the tools became forwarders (at e30638e5).
	const golden = JSON.parse(readFileSync(join(HERE, 'fixtures', 'tool-surface.golden.json'), 'utf8')) as { name: string }[];
	assert.equal(golden.length, 12);
	const { client, close } = await mcpClient('surface-check');
	try {
		const { tools } = await client.listTools();
		const surface = tools
			.map(t => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema }))
			.sort((x, y) => x.name.localeCompare(y.name));
		assert.deepEqual(surface.map(t => t.name), golden.map(t => t.name));
		for (let i = 0; i < golden.length; i++) {
			assert.equal(JSON.stringify(surface[i]), JSON.stringify(golden[i]), `${golden[i]!.name} changed`);
		}
	} finally { await close(); }
});
