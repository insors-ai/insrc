/**
 * Tests for the insrc_present tool handler (handleInsrcPresent): the controller declares
 * the documents a turn presents, and the tool answers which are pending and openable.
 * The daemon is a tiny in-process socket server answering `workflow.pending`.
 *
 * Run: npx tsx --test src/mcp/__tests__/present-dispatch.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, createConnection, type Server, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';

import { handleInsrcPresent, PRESENT_MAX_DOCUMENTS } from '../server.js';

const text = (env: { content: { type: 'text'; text: string }[] }): string => env.content[0]!.text;

/** A daemon stand-in that records the requests and answers each with `result`. */
async function fakeDaemon(result: unknown): Promise<{ connect: () => Socket; seen: { method: string; params: unknown }[]; close: () => Promise<void> }> {
	const path = join(tmpdir(), `insrc-present-${process.pid}-${Math.random().toString(36).slice(2, 8)}.sock`);
	try { rmSync(path); } catch { /* ignore */ }
	const seen: { method: string; params: unknown }[] = [];
	const server: Server = createServer((socket) => {
		let buffer = '';
		socket.on('data', (chunk: Buffer) => {
			buffer += chunk.toString();
			const lines = buffer.split('\n');
			buffer = lines.pop() ?? '';
			for (const line of lines) {
				if (!line.trim()) continue;
				const req = JSON.parse(line) as { id: number; method: string; params: unknown };
				seen.push({ method: req.method, params: req.params });
				socket.write(JSON.stringify({ id: req.id, result }) + '\n');
			}
		});
		socket.on('error', () => { /* client vanished */ });
	});
	await new Promise<void>((res) => server.listen(path, () => res()));
	return {
		connect: () => createConnection(path),
		seen,
		close: () => new Promise<void>((res) => { server.close(() => { try { rmSync(path); } catch { /* ignore */ } res(); }); }),
	};
}

const PENDING = {
	artifacts: [
		{ artifactId: 'LLD-abc-s5', kind: 'LLD', title: 'lld', mdPath: '/repo/docs/standalone/x/S005/LLD.md', openQuestionCount: 0, state: 'pending' },
		{ artifactId: 'BUILD-abc-S001', kind: 'BUILD', title: 'build', mdPath: '', openQuestionCount: 0, state: 'pending' },
	],
};
const repoIs = (r: string) => async () => r;

test("insrc_present answers presented and notPending against the daemon's pending list and rejects an empty or oversized list", async () => {
	const daemon = await fakeDaemon(PENDING);
	try {
		const deps = { connect: daemon.connect, resolveRepo: repoIs('/repo') };
		// An id (story part in another case) and a repo-relative path are both presented, in the order given.
		const ok = await handleInsrcPresent({ documents: ['LLD-ABC-S5', 'docs/standalone/x/S005/LLD.md', 'LLD-nope-S001'] }, deps);
		assert.ok(!ok.isError, text(ok));
		assert.deepEqual(JSON.parse(text(ok)), { presented: ['LLD-ABC-S5', 'docs/standalone/x/S005/LLD.md'], notPending: ['LLD-nope-S001'] });
		assert.deepEqual(daemon.seen[0], { method: 'workflow.pending', params: { repo: '/repo' } });
		// A name given twice is answered once.
		const twice = await handleInsrcPresent({ documents: ['LLD-abc-s5', 'LLD-abc-s5'] }, deps);
		assert.deepEqual(JSON.parse(text(twice)), { presented: ['LLD-abc-s5'], notPending: [] });

		const before = daemon.seen.length;
		const empty = await handleInsrcPresent({ documents: [] }, deps);
		assert.equal(empty.isError, true);
		assert.match(text(empty), /one to 20 non-empty strings/);
		const tooMany = await handleInsrcPresent({ documents: Array.from({ length: PRESENT_MAX_DOCUMENTS + 1 }, (_, i) => `LLD-${i}`) }, deps);
		assert.equal(tooMany.isError, true);
		const nonString = await handleInsrcPresent({ documents: ['LLD-abc-s5', 7 as unknown as string] }, deps);
		assert.equal(nonString.isError, true);
		const blank = await handleInsrcPresent({ documents: [''] }, deps);
		assert.equal(blank.isError, true);
		assert.equal(daemon.seen.length, before, 'a rejected list never reaches the daemon');
	} finally { await daemon.close(); }
});

test('insrc_present with a resolver that finds no repo answers an error and presents nothing', async () => {
	const daemon = await fakeDaemon(PENDING);
	try {
		const out = await handleInsrcPresent({ documents: ['LLD-abc-s5'] }, { connect: daemon.connect, resolveRepo: async () => undefined });
		assert.equal(out.isError, true);
		assert.match(text(out), /no repo/);
		assert.ok(!text(out).includes('presented'));
		assert.equal(daemon.seen.length, 0, 'no pending list is read without a repo');
	} finally { await daemon.close(); }
});

test('a pending record with no document file is reported as not pending by the tool and by the chat', async () => {
	// The tool side: BUILD-abc-S001 is pending but has no .md (an empty mdPath), so it cannot be shown.
	const daemon = await fakeDaemon(PENDING);
	try {
		const out = await handleInsrcPresent({ documents: ['BUILD-abc-S001'] }, { connect: daemon.connect, resolveRepo: repoIs('/repo') });
		assert.deepEqual(JSON.parse(text(out)), { presented: [], notPending: ['BUILD-abc-S001'] });
	} finally { await daemon.close(); }
});

test('insrc_present: a daemon error or an unreachable daemon is answered as an error, never as presented', async () => {
	const failing = await fakeDaemon({ error: 'workflow.pending: `repo` is required' });
	try {
		const out = await handleInsrcPresent({ documents: ['LLD-abc-s5'] }, { connect: failing.connect, resolveRepo: repoIs('/repo') });
		assert.equal(out.isError, true);
		assert.match(text(out), /repo.*required/);
	} finally { await failing.close(); }
	const down = await handleInsrcPresent({ documents: ['LLD-abc-s5'] }, {
		connect: () => createConnection(join(tmpdir(), 'insrc-present-no-such.sock')),
		resolveRepo: repoIs('/repo'),
	});
	assert.equal(down.isError, true);
	assert.match(text(down), /daemon is not running/);
});

// Shared vector: vscode-plugin/src/chat/__tests__/review-presenter.test.ts applies the same rule
// to the same two pending documents (a name that matches more than one is ambiguous, never guessed).
test('a name that matches more than one pending document is not presented, and a full repo-relative path or an id is', async () => {
	const daemon = await fakeDaemon({
		artifacts: [
			{ artifactId: 'PLAN-aaa-S001', kind: 'PLAN', title: 'a', mdPath: '/repo/docs/standalone/a/S001/PLAN.md', openQuestionCount: 0, state: 'pending' },
			{ artifactId: 'PLAN-bbb-S001', kind: 'PLAN', title: 'b', mdPath: '/repo/docs/standalone/b/S001/PLAN.md', openQuestionCount: 0, state: 'pending' },
		],
	});
	try {
		const out = await handleInsrcPresent(
			{ documents: ['PLAN.md', 'S001/PLAN.md', 'docs/standalone/a/S001/PLAN.md', 'plan-bbb-s001'] },
			{ connect: daemon.connect, resolveRepo: repoIs('/repo') },
		);
		assert.deepEqual(JSON.parse(text(out)), {
			presented: ['docs/standalone/a/S001/PLAN.md', 'plan-bbb-s001'],
			notPending: ['PLAN.md', 'S001/PLAN.md'],
		});
	} finally { await daemon.close(); }
});
