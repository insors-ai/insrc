/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The terminal author sees the draft hook's notice: runWorkflowStreaming keeps
 * issueReadiness and notice from the daemon's done frame, and `workflow run`
 * prints the notice only when the draft is not ready.
 *
 * Run: npx tsx --test src/cli/__tests__/run-readiness-notice.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, createConnection, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';

import { runCommand } from '../command.js';
import { runWorkflowStreaming } from '../services/workflow.js';

const NOT_READY = {
	status: 'not-ready', unit: 'epic', kind: 'missing-signin', outcomeKnown: true, reason: 'gh is not signed in', readyUnits: [],
	message: 'cannot be claimed yet: no issue was created for epic because gh is not signed in',
};

/** A tiny daemon that answers one workflow.run with the given done-frame data. */
async function withDaemon<T>(done: Record<string, unknown>, fn: (connect: () => Socket) => Promise<T>): Promise<T> {
	const path = join(tmpdir(), `insrc-rn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.sock`);
	const server = createServer((socket: Socket) => {
		socket.on('data', chunk => {
			const id = (JSON.parse(chunk.toString().split('\n')[0]!) as { id: number }).id;
			socket.write(JSON.stringify({ id, stream: 'done', data: { path: '/docs/def.md', runId: 'wf-1', model: 'ollama:test', artifact: {}, ...done } }) + '\n');
		});
		socket.on('error', () => undefined);
	});
	await new Promise<void>(res => server.listen(path, () => res()));
	try { return await fn(() => createConnection(path)); }
	finally { await new Promise<void>(res => server.close(() => { try { rmSync(path); } catch { /* ignore */ } res(); })); }
}

test('runWorkflowStreaming preserves the fields and the run command prints the notice only when not ready', async () => {
	// the service keeps both fields from the done frame
	const kept = await withDaemon({ issueReadiness: NOT_READY, notice: NOT_READY.message }, connect => runWorkflowStreaming('/repo', 'define', 'x', {}, () => undefined, { connect }));
	assert.deepEqual(kept.issueReadiness, NOT_READY);
	assert.equal(kept.notice, NOT_READY.message);
	const plain = await withDaemon({}, connect => runWorkflowStreaming('/repo', 'define', 'x', {}, () => undefined, { connect }));
	assert.equal('issueReadiness' in plain, false);
	assert.equal('notice' in plain, false);

	// the run command prints the notice after the done line only when there is one
	const run = async (result: unknown): Promise<string[]> => {
		const ctx = {
			repoPath: '/repo', onLog: () => undefined,
			services: { workflow: { runWorkflowStreaming: async () => result } },
		};
		return runCommand('workflow run define add a thing', ctx as never);
	};
	const bad = await run({ path: '/docs/def.md', runId: 'wf-1', issueReadiness: NOT_READY, notice: NOT_READY.message });
	assert.deepEqual(bad, ['✓ define done · /docs/def.md', `⚠ ${NOT_READY.message}`]);
	const ready = await run({ path: '/docs/def.md', runId: 'wf-1', issueReadiness: { status: 'ready', units: [] } });
	assert.deepEqual(ready, ['✓ define done · /docs/def.md']);
	const solo = await run({ path: '/docs/def.md', runId: 'wf-1' });
	assert.deepEqual(solo, ['✓ define done · /docs/def.md']);
});
