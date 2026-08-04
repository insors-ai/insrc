/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for the insrc_workflow_approve tool normalizer (handleWorkflowApprove):
 * the exactly-one-of {artifactPath | epicHash} gate that short-circuits BEFORE
 * any daemon IPC. The daemon round-trip + approval logic is covered by
 * approve-workflow-target.test.ts and verified live.
 *
 * Run: npx tsx --test src/mcp/__tests__/workflow-approve-dispatch.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, createConnection, type Server, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';

import { handleWorkflowApprove } from '../server.js';

const text = (env: { content: { type: 'text'; text: string }[] }): string => env.content[0]!.text;

/** A tiny in-process daemon that answers one JSON-RPC request with `result`. */
function fakeDaemon(result: unknown): { path: string; server: Server; close: () => Promise<void> } {
	const path = join(tmpdir(), `insrc-approve-${process.pid}-${Math.random().toString(36).slice(2, 8)}.sock`);
	try { rmSync(path); } catch { /* ignore */ }
	const server = createServer((socket: Socket) => {
		let buffer = '';
		socket.on('data', (chunk: Buffer) => {
			buffer += chunk.toString();
			const lines = buffer.split('\n');
			buffer = lines.pop() ?? '';
			for (const line of lines) {
				if (!line.trim()) continue;
				const id = (JSON.parse(line) as { id: number }).id;
				socket.write(JSON.stringify({ id, result }) + '\n');
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

test('handleWorkflowApprove: NEITHER artifactPath nor epicHash → InvalidTarget error, no IPC', async () => {
	const out = await handleWorkflowApprove({});
	assert.equal(out.isError, true);
	assert.match(text(out), /exactly one of `artifactPath` or `epicHash`/);
});

test('handleWorkflowApprove: BOTH artifactPath and epicHash → InvalidTarget error, no IPC', async () => {
	const out = await handleWorkflowApprove({ artifactPath: '/x/HLD.md', epicHash: 'deadbeef' });
	assert.equal(out.isError, true);
	assert.match(text(out), /exactly one of `artifactPath` or `epicHash`/);
});

test('handleWorkflowApprove: empty-string target fields count as absent (neither) → error', async () => {
	const out = await handleWorkflowApprove({ artifactPath: '', epicHash: '' });
	assert.equal(out.isError, true);
	assert.match(text(out), /exactly one of/);
});

test('handleWorkflowApprove: the daemon result (incl. codeReview[]) is relayed verbatim in the JSON response', async () => {
	// The new additive code-review gate outcome is produced daemon-side in
	// approveWorkflowTarget; the dispatch adds no logic — it must forward it as-is.
	const canned = {
		approved: [{ path: '/x/.insrc/artifacts/BUILD-abc-s1.json', result: { workflow: 'build', path: '/x/.insrc/artifacts/BUILD-abc-s1.json', approvedAt: '2026-01-01T00:00:00.000Z' } }],
		skipped: [],
		codeReview: [{ path: '/x/.insrc/artifacts/BUILD-abc-s1.json', storyId: 's1', status: 'overridden', counts: { high: 1, med: 0, low: 2 }, overrideReason: 'verified sound', at: '2026-01-01T00:00:00.000Z' }],
	};
	const daemon = fakeDaemon(canned);
	await listen(daemon.server, daemon.path);
	try {
		// explicit `repo` short-circuits resolveRepoPath (no CWD/daemon lookup);
		// the injected `connect` points the unary RPC at the fake daemon.
		const out = await handleWorkflowApprove(
			{ artifactPath: '/x/docs/builds/BUILD-abc-s1.md', repo: '/x' },
			{ connect: () => createConnection(daemon.path) },
		);
		assert.notEqual(out.isError, true);
		const relayed = JSON.parse(text(out)) as typeof canned;
		assert.deepEqual(relayed, canned, 'approved + skipped + codeReview forwarded verbatim');
		assert.equal(relayed.codeReview[0]!.status, 'overridden');
		assert.equal(relayed.codeReview[0]!.overrideReason, 'verified sound');
	} finally {
		await daemon.close();
	}
});
