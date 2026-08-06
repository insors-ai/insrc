/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * MCP-section service unit tests (Story s4, t4 + t5). Exercise mcpStatusWith /
 * attachedClientsWith against injected runList / rpc-fetch seams (no real
 * subprocess / socket), the makeServices() binding, and the rpc() client
 * identity envelope against a fake socket.
 *
 * Run: npx tsx --test src/cli/services/__tests__/debug-mcp.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { Socket } from 'node:net';

import { mcpStatusWith, attachedClientsWith } from '../debug.js';
import type { McpListRun } from '../debug.js';
import * as debugImpl from '../debug.js';
import { makeServices } from '../index.js';
import { rpc } from '../../client.js';
import type { AttachedClient, IpcRequest } from '../../../shared/types.js';

// --- mcpStatusWith -----------------------------------------------------------

/** A runner returning canned output per bin. */
function runner(map: Record<string, McpListRun>): (bin: string) => Promise<McpListRun> {
	return async bin => map[bin] ?? { code: -1, stdout: '', spawnError: 'not found' };
}

test('mcpStatusWith: canned claude+codex output -> per-client registered + connected', async () => {
	const out = await mcpStatusWith({
		runList: runner({
			claude: { code: 0, stdout: 'insrc: node /x/insrc-mcp.js - ✓ Connected\n' },
			codex:  { code: 0, stdout: 'insrc: node /x/insrc-mcp.js - connected\n' },
		}),
	});
	assert.deepEqual(out, [
		{ client: 'claude', available: true, registered: true, connected: true },
		{ client: 'codex',  available: true, registered: true, connected: true },
	]);
});

test('mcpStatusWith: no insrc line -> registered:false, connected:false (still available)', async () => {
	const out = await mcpStatusWith({
		runList: runner({ claude: { code: 0, stdout: 'someother: ...\n' }, codex: { code: 0, stdout: '' } }),
	});
	assert.deepEqual(out[0], { client: 'claude', available: true, registered: false, connected: false });
	assert.deepEqual(out[1], { client: 'codex', available: true, registered: false, connected: false });
});

test('mcpStatusWith: a registered-but-not-connected client reports connected:false', async () => {
	const out = await mcpStatusWith({
		runList: runner({
			claude: { code: 0, stdout: 'insrc: node /x - ✗ Failed to connect\n' },
			codex:  { code: 0, stdout: 'insrc: node /x - not connected\n' },
		}),
	});
	assert.equal(out[0]!.registered, true);
	assert.equal(out[0]!.connected, false);
	assert.equal(out[1]!.registered, true);
	assert.equal(out[1]!.connected, false);
});

test('mcpStatusWith: a spawnError/non-zero client -> available:false while the other still evaluates (never throws)', async () => {
	const out = await mcpStatusWith({
		runList: runner({
			claude: { code: -1, stdout: '', spawnError: 'ENOENT' },
			codex:  { code: 0, stdout: 'insrc: node /x - ✓ Connected\n' },
		}),
	});
	assert.deepEqual(out[0], { client: 'claude', available: false, registered: false, connected: false });
	assert.deepEqual(out[1], { client: 'codex', available: true, registered: true, connected: true });
});

test('mcpStatusWith: always exactly one entry per known client (claude, codex), never omitted', async () => {
	const out = await mcpStatusWith({ runList: runner({}) });
	assert.deepEqual(out.map(o => o.client), ['claude', 'codex']);
});

// --- attachedClientsWith -----------------------------------------------------

test('attachedClientsWith: a resolving rpc -> {reachable:true; clients} sorted by connectedAt', async () => {
	const clients: AttachedClient[] = [
		{ id: 2, label: 'mcp', connectedAt: 3000, pid: 20 },
		{ id: 1, label: 'cli', connectedAt: 1000, pid: 10 },
	];
	const model = await attachedClientsWith({ fetch: async () => ({ clients }) });
	assert.equal(model.reachable, true);
	assert.ok(model.reachable);
	assert.deepEqual(model.clients.map(c => c.connectedAt), [1000, 3000]);
});

test('attachedClientsWith: a rejecting rpc (daemon down) -> {reachable:false} without throwing', async () => {
	const model = await attachedClientsWith({ fetch: async () => { throw new Error('daemon is not running'); } });
	assert.deepEqual(model, { reachable: false });
});

// --- makeServices binding ----------------------------------------------------

test('makeServices().debug exposes attachedClients + mcpStatus bound to the real impls', () => {
	const { debug } = makeServices();
	assert.equal(debug.attachedClients, debugImpl.attachedClients);
	assert.equal(debug.mcpStatus, debugImpl.mcpStatus);
});

// --- t4: rpc() writes the client identity envelope ---------------------------

/** A fake Socket capturing the first write. */
class CapturingSocket extends EventEmitter {
	written: string[] = [];
	write(data: string): boolean { this.written.push(data); return true; }
	end(): void { /* no-op */ }
}

test('rpc() writes an IpcRequest carrying client={label:cli, pid:process.pid}', async () => {
	const sock = new CapturingSocket();
	const p = rpc('daemon.status', {}, () => sock as unknown as Socket);
	sock.emit('connect');
	// Feed a response so the promise resolves + the socket closes.
	sock.emit('data', Buffer.from(JSON.stringify({ id: 1, result: {} }) + '\n'));
	await p;

	assert.equal(sock.written.length, 1);
	const req = JSON.parse(sock.written[0]!) as IpcRequest;
	assert.deepEqual(req.client, { label: 'cli', pid: process.pid });
	assert.equal(req.method, 'daemon.status');
});
