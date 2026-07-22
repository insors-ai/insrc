/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for the async insrc_workflow_run client + dispatch:
 *   - the unary socket helpers (startRun / pollRun / abortRun) speak the
 *     `{ id, method, params }` → `{ id, result }` framing against a fake daemon;
 *   - handleWorkflowRun dispatches abort > poll > start and renders progress
 *     frames + terminal fields into its JSON text envelope.
 *
 * No real daemon — a temp-socket fake daemon answers the unary calls.
 *
 * Run: npx tsx --test src/mcp/__tests__/workflow-run-dispatch.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, createConnection, type Server, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';

import { startRun, pollRun, abortRun } from '../daemon-stream.js';
import { handleWorkflowRun } from '../server.js';

/** A fake daemon that answers unary `{ id, method, params }` requests by
 *  looking `method` up in `routes` and writing `{ id, result }`. */
function fakeDaemon(routes: Record<string, (params: Record<string, unknown>) => unknown>): {
	path: string; server: Server; close: () => Promise<void>;
} {
	const path = join(tmpdir(), `insrc-wfr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.sock`);
	try { rmSync(path); } catch { /* ignore */ }
	const server = createServer((socket: Socket) => {
		let buffer = '';
		socket.on('data', (chunk: Buffer) => {
			buffer += chunk.toString();
			const lines = buffer.split('\n');
			buffer = lines.pop() ?? '';
			for (const line of lines) {
				if (!line.trim()) continue;
				const req = JSON.parse(line) as { id: number; method: string; params: Record<string, unknown> };
				const handler = routes[req.method];
				const result = handler !== undefined ? handler(req.params ?? {}) : { error: `no route: ${req.method}` };
				socket.write(JSON.stringify({ id: req.id, result }) + '\n');
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

/** Parse the JSON dispatch result out of a handleWorkflowRun envelope. */
function envelopeJson(env: { content: ReadonlyArray<{ type: string; text: string }> }): Record<string, unknown> {
	return JSON.parse(env.content[0]!.text) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Unary client helpers
// ---------------------------------------------------------------------------

test('startRun / pollRun / abortRun speak the unary framing against a fake daemon', async () => {
	let sawStart: Record<string, unknown> | undefined;
	const daemon = fakeDaemon({
		'workflow.run.start': (p) => { sawStart = p; return { runId: 'wf-abc' }; },
		'workflow.run.poll':  (p) => ({ status: 'running', frames: [{ phase: 'decompose' }], cursor: 1, model: 'ollama:test', echo: p }),
		'workflow.run.abort': (p) => ({ ok: true, echo: p }),
	});
	await listen(daemon.server, daemon.path);
	const deps = { connect: () => createConnection(daemon.path) };
	try {
		const started = await startRun({ workflow: 'plan', focus: 'x', repo: '/r' }, deps);
		assert.deepEqual(started, { runId: 'wf-abc' });
		assert.equal(sawStart?.['workflow'], 'plan');
		assert.equal(sawStart?.['repo'], '/r');

		const polled = await pollRun('wf-abc', 0, deps);
		assert.equal(polled.status, 'running');
		assert.equal(polled.cursor, 1);
		assert.equal(polled.model, 'ollama:test');
		assert.equal(polled.frames.length, 1);

		const aborted = await abortRun('wf-abc', deps);
		assert.equal(aborted.ok, true);
	} finally { await daemon.close(); }
});

test('unaryRpc rejects when the daemon returns an error field', async () => {
	const daemon = fakeDaemon({ 'workflow.run.poll': () => ({}) });
	// Override: respond with a top-level error instead of result.
	const server = daemon.server;
	server.removeAllListeners('connection');
	server.on('connection', (socket: Socket) => {
		let buffer = '';
		socket.on('data', (chunk: Buffer) => {
			buffer += chunk.toString();
			for (const line of buffer.split('\n')) {
				if (!line.trim()) continue;
				const req = JSON.parse(line) as { id: number };
				socket.write(JSON.stringify({ id: req.id, error: 'boom' }) + '\n');
			}
			buffer = '';
		});
		socket.on('error', () => {});
	});
	await listen(server, daemon.path);
	try {
		await assert.rejects(pollRun('wf-x', 0, { connect: () => createConnection(daemon.path) }), /boom/);
	} finally { await daemon.close(); }
});

// ---------------------------------------------------------------------------
// handleWorkflowRun dispatch
// ---------------------------------------------------------------------------

test('handleWorkflowRun: START returns runId + next:poll + guidance', async () => {
	const daemon = fakeDaemon({ 'workflow.run.start': () => ({ runId: 'wf-1' }) });
	await listen(daemon.server, daemon.path);
	try {
		const env = await handleWorkflowRun({ workflow: 'plan', focus: 'do a thing' }, { connect: () => createConnection(daemon.path) });
		const out = envelopeJson(env);
		assert.equal(out['runId'], 'wf-1');
		assert.equal(out['next'], 'poll');
		assert.match(String(out['guidance']), /poll/i);
	} finally { await daemon.close(); }
});

test('handleWorkflowRun: POLL renders frames as short lines + status', async () => {
	const daemon = fakeDaemon({
		'workflow.run.poll': () => ({
			status: 'running',
			frames: [
				{ phase: 'decompose' },
				{ phase: 'step-start', stepId: 's1', runner: 'scope.assess' },
				{ phase: 'synthesize-attempt', attempt: 1 },
			],
			cursor: 3,
			model: 'ollama:test',
		}),
	});
	await listen(daemon.server, daemon.path);
	try {
		const env = await handleWorkflowRun({ poll: 'wf-1', cursor: 0 }, { connect: () => createConnection(daemon.path) });
		const out = envelopeJson(env);
		assert.equal(out['status'], 'running');
		assert.equal(out['cursor'], 3);
		const progress = out['progress'] as string[];
		assert.equal(progress.length, 3);
		assert.equal(progress[0], '▸ decompose');
		assert.match(progress[1]!, /▸ step-start — s1 · scope\.assess/);
		assert.match(progress[2]!, /▸ synthesize-attempt — attempt 1/);
		assert.equal(env.isError, undefined);
	} finally { await daemon.close(); }
});

test('handleWorkflowRun: POLL done surfaces artifact + runId + model + review', async () => {
	const daemon = fakeDaemon({
		'workflow.run.poll': () => ({
			status: 'done',
			frames: [{ phase: 'done' }],
			cursor: 5,
			model: 'ollama:test',
			result: { path: '/x/PLAN.md', artifact: { ok: true }, runId: 'wf-1', review: { verdict: 'pass', counts: { high: 0, med: 0, low: 1 } } },
		}),
	});
	await listen(daemon.server, daemon.path);
	try {
		const env = await handleWorkflowRun({ poll: 'wf-1', cursor: 4 }, { connect: () => createConnection(daemon.path) });
		const out = envelopeJson(env);
		assert.equal(out['status'], 'done');
		assert.equal(out['artifact'], '/x/PLAN.md');
		assert.equal(out['runId'], 'wf-1');
		assert.equal(out['model'], 'ollama:test');
		assert.deepEqual(out['review'], { verdict: 'pass', counts: { high: 0, med: 0, low: 1 } });
	} finally { await daemon.close(); }
});

test('handleWorkflowRun: POLL error surfaces the error + marks isError', async () => {
	const daemon = fakeDaemon({
		'workflow.run.poll': () => ({ status: 'error', frames: [], cursor: 2, model: 'ollama:test', error: 'synthesize rejected' }),
	});
	await listen(daemon.server, daemon.path);
	try {
		const env = await handleWorkflowRun({ poll: 'wf-1', cursor: 0 }, { connect: () => createConnection(daemon.path) });
		const out = envelopeJson(env);
		assert.equal(out['status'], 'error');
		assert.equal(out['error'], 'synthesize rejected');
		assert.equal(env.isError, true);
	} finally { await daemon.close(); }
});

test('handleWorkflowRun: ABORT returns aborted + runId', async () => {
	const daemon = fakeDaemon({ 'workflow.run.abort': () => ({ ok: true }) });
	await listen(daemon.server, daemon.path);
	try {
		const env = await handleWorkflowRun({ abort: 'wf-1' }, { connect: () => createConnection(daemon.path) });
		const out = envelopeJson(env);
		assert.equal(out['aborted'], true);
		assert.equal(out['runId'], 'wf-1');
	} finally { await daemon.close(); }
});

test('handleWorkflowRun: no phase args → guidance error', async () => {
	const env = await handleWorkflowRun({});
	const out = envelopeJson(env);
	assert.match(String(out['error']), /START.*POLL.*ABORT/s);
	assert.equal(env.isError, true);
});
