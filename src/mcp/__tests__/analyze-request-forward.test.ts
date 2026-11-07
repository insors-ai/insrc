/**
 * Both analyze registrations accept a request-only, a prompt-only and a mixed
 * call, forward the request to the daemon's step handler unchanged, and refuse
 * a malformed request with the schema message (Story 65b643840a294422/s1,
 * task t17). The real MCP server over an in-memory transport, the real
 * IpcServer on a temporary socket; only the step handlers are stand-ins.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { createConnection, createServer } from 'node:net';
import type { Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { IpcServer, directDispatch } from '../../daemon/server.js';
import { createStepCallHandler } from '../../daemon/steps/host.js';
import { _setForwardConnectForTests } from '../forward-step.js';
import { buildInsrcMcpServer } from '../server.js';

const REQUEST = {
	question: 'how does settlement pick a ledger',
	scopeRef: { kind: 'module', value: '/work/app/src/pay' },
	target: 'code',
	sizeHint: 'M',
	context: 'we are about to change the ledger choice',
};

test('both analyze tools accept request-only, prompt-only and mixed calls, forward the request unchanged, and refuse a malformed request with the schema message', async () => {
	const seen: Array<{ tool: string; args: Record<string, unknown> }> = [];
	const spy = (tool: string) => async (args: unknown) => {
		seen.push({ tool, args: args as Record<string, unknown> });
		return { content: [{ type: 'text' as const, text: JSON.stringify({ next: 'done' }) }] };
	};
	const ipc = new IpcServer(directDispatch(
		{ 'daemon.status': async () => ({ uptime: 1, repos: [], queueDepth: 0, embeddingsPending: 0, installedCommit: '', features: ['analyze-request'] }) },
		{ 'step.call': createStepCallHandler({ insrc_analyze_step: spy('insrc_analyze_step'), insrc_analyze: spy('insrc_analyze') }) },
	));
	const dir = mkdtempSync(join(tmpdir(), 'insrc-analyze-request-'));
	const path = join(dir, 'd.sock');
	const sock = createServer((s: Socket) => { (ipc as unknown as { handleConnection(s: Socket): void }).handleConnection(s); });
	await new Promise<void>(r => sock.listen(path, () => r()));
	_setForwardConnectForTests(() => createConnection(path));

	const server = buildInsrcMcpServer();
	const [a, b] = InMemoryTransport.createLinkedPair();
	await server.connect(a);
	const client = new Client({ name: 'request-forward', version: '0' });
	await client.connect(b);
	try {
		const startArgs = (tool: string, rest: Record<string, unknown>) => (tool === 'insrc_analyze_step' ? { phase: 'start', ...rest } : rest);
		for (const tool of ['insrc_analyze_step', 'insrc_analyze'] as const) {
			seen.length = 0;

			// request-only: no focus at all, and the request arrives as sent
			let out = await client.callTool({ name: tool, arguments: startArgs(tool, { request: REQUEST }) });
			assert.equal(out.isError === true, false, `${tool} request-only`);
			assert.equal(seen.length, 1);
			assert.deepEqual(seen[0]!.args['request'], REQUEST, `${tool} forwards the request unchanged`);
			assert.equal(seen[0]!.args['focus'], undefined);

			// prompt-only: focus alone, no request
			out = await client.callTool({ name: tool, arguments: startArgs(tool, { focus: 'what does the repo do' }) });
			assert.equal(out.isError === true, false, `${tool} prompt-only`);
			assert.equal(seen[1]!.args['focus'], 'what does the repo do');
			assert.equal(seen[1]!.args['request'], undefined);

			// mixed: both, the focus matching the question
			out = await client.callTool({ name: tool, arguments: startArgs(tool, { request: REQUEST, focus: REQUEST.question }) });
			assert.equal(out.isError === true, false, `${tool} mixed`);
			assert.deepEqual(seen[2]!.args['request'], REQUEST);
			assert.equal(seen[2]!.args['focus'], REQUEST.question);

			// malformed: a scope kind that does not exist, refused at the schema with its message, no handler run
			const before = seen.length;
			const bad = { ...REQUEST, scopeRef: { kind: 'folder', value: '/work/app' } };
			const refused = await client.callTool({ name: tool, arguments: startArgs(tool, { request: bad }) }).then(
				r => (r.isError ? JSON.stringify(r.content) : 'accepted'),
				(e: unknown) => String(e instanceof Error ? e.message : e),
			);
			assert.notEqual(refused, 'accepted', `${tool} refuses a bad scope kind`);
			assert.match(refused, /scopeRef|kind|enum|Invalid/i);
			assert.equal(seen.length, before, `${tool} ran no handler for a malformed request`);

			// a missing question is refused the same way
			const noQuestion = await client.callTool({ name: tool, arguments: startArgs(tool, { request: { scopeRef: REQUEST.scopeRef } }) }).then(
				r => (r.isError ? JSON.stringify(r.content) : 'accepted'),
				(e: unknown) => String(e instanceof Error ? e.message : e),
			);
			assert.match(noQuestion, /question/i);
			assert.equal(seen.length, before);
		}
	} finally {
		_setForwardConnectForTests(undefined);
		await client.close();
		await server.close();
		await new Promise<void>(r => sock.close(() => r()));
		rmSync(dir, { recursive: true, force: true });
	}
});
