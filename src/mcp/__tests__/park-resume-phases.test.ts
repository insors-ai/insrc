/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Story s6: `insrc_workflow_step` accepts phase park and phase resume at every MCP exposure site. A stand-in daemon is the real
 * IpcServer on a temporary socket with a spy for the workflow-step handler; nothing here reaches the live daemon.
 *
 * Run: npx tsx --test src/mcp/__tests__/park-resume-phases.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createConnection, createServer } from 'node:net';
import type { Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { IpcServer } from '../../daemon/server.js';
import { createStepCallHandler } from '../../daemon/steps/host.js';
import { _setForwardConnectForTests } from '../forward-step.js';
import { handleInsrcSchema } from '../schema/handler.js';
import { buildInsrcMcpServer, buildInsrcMcpServerWithRegistry } from '../server.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const OTHER_PHASES = ['start', 'plan', 'step', 'synthesize', 'resolve_question', 'review_deferred'];

test('an MCP call with phase park and with phase resume passes validation and reaches the workflow-step handler, and the schema registry and the tool-surface fixture list both phases', async () => {
	const seen: unknown[] = [];
	const spy = async (args: unknown) => { seen.push(args); return { content: [{ type: 'text' as const, text: '{"next":"parked"}' }] }; };
	const ipc = new IpcServer({}, { 'step.call': createStepCallHandler({ insrc_workflow_step: spy as never }) });
	const dir = mkdtempSync(join(tmpdir(), 'insrc-park-phases-'));
	const path = join(dir, 'd.sock');
	const daemon = createServer((socket: Socket) => { (ipc as unknown as { handleConnection(s: Socket): void }).handleConnection(socket); });
	await new Promise<void>(r => daemon.listen(path, () => r()));
	_setForwardConnectForTests(() => createConnection(path));
	const server = buildInsrcMcpServer();
	const [a, b] = InMemoryTransport.createLinkedPair();
	await server.connect(a);
	const client = new Client({ name: 'park-phases', version: '0' });
	await client.connect(b);
	try {
		// both phases pass the tool's validation and reach the handler with their own fields intact
		const parked = await client.callTool({ name: 'insrc_workflow_step', arguments: { phase: 'park', epicHash: 'a3f4b8c9d1e2f3a4', storyId: 's1', runToken: 'tok', repo: '/r' } });
		assert.notEqual(parked.isError, true, JSON.stringify(parked));
		const resumed = await client.callTool({ name: 'insrc_workflow_step', arguments: { phase: 'resume', epicHash: 'a3f4b8c9d1e2f3a4', storyId: 's1', workflow: 'plan', repo: '/r' } });
		assert.notEqual(resumed.isError, true, JSON.stringify(resumed));
		assert.deepEqual(seen, [
			{ phase: 'park', epicHash: 'a3f4b8c9d1e2f3a4', storyId: 's1', runToken: 'tok', repo: '/r' },
			{ phase: 'resume', epicHash: 'a3f4b8c9d1e2f3a4', storyId: 's1', workflow: 'plan', repo: '/r' },
		]);

		// an unknown phase is still refused before the handler
		const bogus = await client.callTool({ name: 'insrc_workflow_step', arguments: { phase: 'bogus' } }).catch((e: unknown) => ({ isError: true, e }));
		assert.equal((bogus as { isError?: boolean }).isError, true);
		assert.equal(seen.length, 2, 'the handler saw only the two valid calls');
	} finally {
		_setForwardConnectForTests(undefined);
		await client.close(); await server.close();
		await new Promise<void>(r => daemon.close(() => r()));
		rmSync(dir, { recursive: true, force: true });
	}

	// the schema registry lists both phases and still lists the others
	const { schemaRegistry } = buildInsrcMcpServerWithRegistry();
	assert.deepEqual(schemaRegistry.get('insrc_workflow_step')?.phases, [...OTHER_PHASES, 'park', 'resume']);
	for (const phase of ['park', 'resume']) {
		const r = handleInsrcSchema({ tool: 'insrc_workflow_step', phase }, schemaRegistry);
		assert.ok(!('error' in r), `${phase}: ${JSON.stringify(r)}`);
	}

	// the tool-surface fixture lists both phases and the new fields, and keeps the other tools' schemas as they were
	const golden = JSON.parse(readFileSync(join(HERE, 'fixtures', 'tool-surface.golden.json'), 'utf8')) as { name: string; inputSchema: { properties: Record<string, { enum?: string[] }> } }[];
	const ws = golden.find(t => t.name === 'insrc_workflow_step')!;
	assert.deepEqual(ws.inputSchema.properties['phase']!.enum, [...OTHER_PHASES, 'park', 'resume']);
	for (const field of ['epicHash', 'storyId', 'runToken']) assert.ok(field in ws.inputSchema.properties, field);
	const bs = golden.find(t => t.name === 'insrc_build_step')!;
	assert.deepEqual(bs.inputSchema.properties['phase']!.enum, ['implement', 'validate']);
});
