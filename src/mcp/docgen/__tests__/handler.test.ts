/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * insrc_docgen MCP handler tests (Story s6 · t5).
 *
 * The daemon socket is a FAKE (injected UnaryRpcDeps.connect), so the handler's
 * repo resolution, whole-input forwarding, outcome shaping, and non-ok /
 * unreachable → isError mapping are proven with NO live daemon (ac2/ac3). An
 * import-guard test proves the module never pulls in generateDocument or a
 * docgen extractor — the read stays daemon-side (ac2).
 *
 * Run: npx tsx --test src/mcp/docgen/__tests__/handler.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { handleDocgen } from '../handler.js';
import type { UnaryRpcDeps } from '../../daemon-stream.js';

type Behavior = { result: unknown } | { error: string } | { socketError: string };

/** A fake daemon socket: on write, captures the JSON-RPC request and replies per
 *  `behavior` (a result line, an error line, or a socket-level error event). */
function fakeDaemon(behavior: Behavior): { deps: UnaryRpcDeps; captured: () => { method?: string; params?: Record<string, unknown> } } {
	let captured: { method?: string; params?: Record<string, unknown> } = {};
	const connect = () => {
		const sock = new EventEmitter() as EventEmitter & { write: (l: string) => boolean; end: () => void };
		sock.write = (line: string) => {
			const req = JSON.parse(line) as { id: number; method: string; params: Record<string, unknown> };
			captured = { method: req.method, params: req.params };
			setImmediate(() => {
				if ('socketError' in behavior) {
					const e = new Error('socket') as NodeJS.ErrnoException;
					e.code = behavior.socketError;
					sock.emit('error', e);
					return;
				}
				const res = 'error' in behavior ? { id: req.id, error: behavior.error } : { id: req.id, result: behavior.result };
				sock.emit('data', Buffer.from(JSON.stringify(res) + '\n'));
			});
			return true;
		};
		sock.end = () => { /* no-op */ };
		setImmediate(() => sock.emit('connect'));
		return sock as unknown as import('node:net').Socket;
	};
	return { deps: { connect }, captured: () => captured };
}

const okShell = {
	status: 'ok',
	value: { docType: 'component-dependency', backend: 'primary-inline', html: '<!doctype html>', inlinedRuntimeVersion: '10.9.1', diagramFormat: 'svg', supportsZoomPan: true },
};

test('handleDocgen: missing docType → isError, no daemon call', async () => {
	const { deps, captured } = fakeDaemon({ result: okShell });
	const out = await handleDocgen({ repo: '/r' }, deps);
	assert.equal(out.isError, true);
	assert.match(out.content[0]!.text, /docType` is required/);
	assert.equal(captured().method, undefined, 'the daemon is never contacted for a malformed request');
});

test('handleDocgen: ok outcome → JSON content; forwards docType+repo+per-type fields to docgen.generate (ac1)', async () => {
	const { deps, captured } = fakeDaemon({ result: okShell });
	const out = await handleDocgen({ docType: 'call-sequence', repo: '/r', symbol: 'main', maxDepth: 3 }, deps);
	assert.notEqual(out.isError, true);
	assert.match(out.content[0]!.text, /"status":"ok"/);
	// the WHOLE input reached the daemon IPC (not a {repo,path} subset)
	const { method, params } = captured();
	assert.equal(method, 'docgen.generate');
	assert.equal(params!['docType'], 'call-sequence');
	assert.equal(params!['repo'], '/r');
	assert.equal(params!['symbol'], 'main');
	assert.equal(params!['maxDepth'], 3);
});

test('handleDocgen: non-ok outcome (source-not-ready) → isError carrying the reason (ac3)', async () => {
	const { deps } = fakeDaemon({ result: { status: 'source-not-ready', reason: 'repo not indexed' } });
	const out = await handleDocgen({ docType: 'type-structure', repo: '/r' }, deps);
	assert.equal(out.isError, true);
	assert.match(out.content[0]!.text, /source not ready: repo not indexed/);
});

test('handleDocgen: not-found outcome → isError naming the unknown type', async () => {
	const { deps } = fakeDaemon({ result: { status: 'not-found', symbol: 'nope' } });
	const out = await handleDocgen({ docType: 'nope', repo: '/r' }, deps);
	assert.equal(out.isError, true);
	assert.match(out.content[0]!.text, /unknown document type: nope/);
});

test('handleDocgen: daemon unreachable → actionable isError, never a fabricated document', async () => {
	const { deps } = fakeDaemon({ socketError: 'ENOENT' });
	const out = await handleDocgen({ docType: 'type-structure', repo: '/r' }, deps);
	assert.equal(out.isError, true);
	assert.match(out.content[0]!.text, /daemon is not running/);
});

// ── ac2 import-guard: the handler never pulls the read into the MCP process ──

test('handler module imports only the daemon IPC seam — never generateDocument or an extractor', () => {
	const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'handler.ts'), 'utf8');
	const imports = [...src.matchAll(/from\s+'([^']+)'/g)].map(m => m[1]!);
	// no import resolves into docgen/index (generateDocument) or a docgen extractor
	for (const spec of imports) {
		assert.doesNotMatch(spec, /docgen\/index/, `must not import generateDocument (${spec})`);
		assert.doesNotMatch(spec, /docgen\/extract/, `must not import an extractor (${spec})`);
	}
	// it DOES go through the daemon IPC client + the shared repo resolver
	assert.ok(imports.some(s => s.includes('daemon-stream')), 'uses the daemon IPC client');
	assert.ok(imports.some(s => s.includes('resolve-repo')), 'uses the shared repo resolver');
});
