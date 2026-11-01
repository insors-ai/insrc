/**
 * Story 64703b708590bd68/s1, task t3: the MCP approve sends the daemon an absolute repo and an absolute artifactPath.
 * Run: npx tsx --test-force-exit src/mcp/__tests__/approve-absolute-repo.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createConnection, createServer, type Server, type Socket } from 'node:net';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { handleWorkflowApprove } from '../server.js';
import { withExplicitRepo } from '../forward-step.js';

/** A daemon that records every request it gets and answers `{ approved: [] }`. */
function recordingDaemon(): { path: string; server: Server; seen: Array<{ method: string; params: Record<string, unknown> }>; close: () => Promise<void> } {
	const path = join(tmpdir(), `insrc-abs-${process.pid}-${Math.random().toString(36).slice(2, 8)}.sock`);
	const seen: Array<{ method: string; params: Record<string, unknown> }> = [];
	const server = createServer((socket: Socket) => {
		let buffer = '';
		socket.on('data', chunk => {
			buffer += chunk.toString();
			const lines = buffer.split('\n'); buffer = lines.pop() ?? '';
			for (const line of lines) {
				if (!line.trim()) continue;
				const req = JSON.parse(line) as { id: number; method: string; params: Record<string, unknown> };
				seen.push({ method: req.method, params: req.params });
				socket.write(JSON.stringify({ id: req.id, result: { approved: [], skipped: [], codeReview: [] } }) + '\n');
			}
		});
		socket.on('error', () => { /* client vanished */ });
	});
	return { path, server, seen, close: () => new Promise<void>(res => { server.close(() => { try { rmSync(path); } catch { /* ignore */ } res(); }); }) };
}
const listen = (server: Server, path: string): Promise<void> => new Promise(res => server.listen(path, () => res()));

test('approve-absolute-repo.test.ts: insrc_workflow_approve sends an absolute repo and an absolute artifactPath, and refuses when it cannot resolve an absolute repo', async () => {
	const daemon = recordingDaemon();
	await listen(daemon.server, daemon.path);
	const connect = (): Socket => createConnection(daemon.path);
	try {
		// a relative artifactPath is joined to the resolved repo, and the repo goes as the absolute path the resolver gave
		const ok = await handleWorkflowApprove({ artifactPath: '.insrc/artifacts/LLD-a-s1.json' }, { connect, resolveRepo: async () => '/work/repo' });
		assert.notEqual(ok.isError, true);
		assert.deepEqual(daemon.seen.map(s => s.method), ['workflow.approve']);
		assert.equal(daemon.seen[0]!.params['repo'], '/work/repo');
		assert.equal(daemon.seen[0]!.params['artifactPath'], '/work/repo/.insrc/artifacts/LLD-a-s1.json');

		// an absolute path is kept as given
		await handleWorkflowApprove({ artifactPath: '/work/repo/docs/LLD.md', repo: '/work/repo' }, { connect, resolveRepo: async e => e });
		assert.equal(daemon.seen[1]!.params['artifactPath'], '/work/repo/docs/LLD.md');

		// an epicHash batch gets the absolute repo too
		await handleWorkflowApprove({ epicHash: 'deadbeefdeadbeef' }, { connect, resolveRepo: async () => '/work/repo' });
		assert.equal(daemon.seen[2]!.params['repo'], '/work/repo');

		// no repo resolved, or a relative one: refused before any call
		const before = daemon.seen.length;
		for (const resolved of [undefined, '', 'relative/repo']) {
			const out = await handleWorkflowApprove({ artifactPath: '.insrc/artifacts/X.json' }, { connect, resolveRepo: async () => resolved });
			assert.equal(out.isError, true, String(resolved));
			assert.match(out.content[0]!.text, /no absolute repo/);
		}
		assert.equal(daemon.seen.length, before, 'a refused call reaches the daemon never');
	} finally { await daemon.close(); }
});

test('approve-absolute-repo.test.ts: the step forwarder makes the session repo explicit for a first phase and leaves a call with a repo or a run token alone', async () => {
	const resolve = async (): Promise<string | undefined> => '/work/repo';
	assert.deepEqual(await withExplicitRepo({ phase: 'start', workflow: 'plan' }, resolve), { phase: 'start', workflow: 'plan', repo: '/work/repo' });
	assert.deepEqual(await withExplicitRepo({ phase: 'start', repo: '/other' }, resolve), { phase: 'start', repo: '/other' });
	assert.deepEqual(await withExplicitRepo({ phase: 'plan', state: 'tok' }, resolve), { phase: 'plan', state: 'tok' });
	assert.deepEqual(await withExplicitRepo({ phase: 'start' }, async () => undefined), { phase: 'start' });
	assert.deepEqual(await withExplicitRepo({ phase: 'start' }, async () => 'relative'), { phase: 'start' });
	assert.equal(await withExplicitRepo('not an object', resolve), 'not an object');
});
