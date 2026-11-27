/**
 * Tests for the insrc_present tool handler (handleInsrcPresent): the controller declares
 * the documents a turn presents, and the tool answers which are openable. Presenting a
 * document is a display concern, independent of its lifecycle status or the
 * BUILD/CR-sibling precondition workflow.pending applies (ISSUE-9c95950064e4b916).
 * The daemon is a tiny in-process socket server answering `workflow.openable`.
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
import { resolveOpenableArtifacts } from '../../workflow/pending.js';
import { proposeAmendment, approveAmendment, rejectAmendment } from '../../workflow/amendments/store.js';
import { mkAmendmentRepo } from '../../workflow/amendments/__tests__/epic-head.js';
import { writeRepoSchema } from '../../workflow/artifact-core/repo-schema.js';

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
		{ artifactId: 'LLD-abc-s5', mdPath: '/repo/docs/standalone/x/S005/LLD.md' },
		{ artifactId: 'BUILD-abc-S001', mdPath: '' },
	],
};
const repoIs = (r: string) => async () => r;

test('writer-created AMD heads are presented regardless of lifecycle status (draft, approved or rejected)', async () => {
	const hash = '9b56cf09824e7110';
	const repo = mkAmendmentRepo(hash);
	try {
		writeRepoSchema(repo, { version: 2 });
		const ids = [1, 2, 3].map(n => `AMD-${hash}-${n}`);
		for (const id of ids) {
			await proposeAmendment(repo, {
				id, epicHash: hash, epicSlug: 'pending-amendments', hldBaseRunId: 'base-1',
				amendment: { type: 'sharedContract.fieldAdd', contractId: 'sc1', breaking: false,
					field: { name: 'sortBy', type: 'string', optional: true, purpose: 'Sort order' } },
				rationale: 'Exercise the real amendment writer and openable reader together.', citations: [],
				proposedBy: { workflow: 'design.story', runId: 'lld-1', storyId: 's1', stepId: 's4' },
				proposedAt: '2026-11-23T00:00:00Z', status: 'pending',
			});
		}
		// Decisions affect only this disposable fixture, never workspace artifacts.
		await approveAmendment(repo, ids[1]!, 'test-reviewer');
		await rejectAmendment(repo, ids[2]!, 'Fixture rejection');
		const openable = { artifacts: resolveOpenableArtifacts(repo) };
		assert.deepEqual(openable.artifacts.filter(a => a.artifactId.startsWith('AMD-')).map(a => a.artifactId).sort(), [...ids].sort());
		const daemon = await fakeDaemon(openable);
		try {
			const result = await handleInsrcPresent({ documents: ids }, { connect: daemon.connect, resolveRepo: repoIs(repo) });
			assert.ok(!result.isError, text(result));
			assert.deepEqual(JSON.parse(text(result)), { presented: ids, notPending: [] });
		} finally { await daemon.close(); }
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test("insrc_present answers presented and notPending against the daemon's openable list and rejects an empty or oversized list", async () => {
	const daemon = await fakeDaemon(PENDING);
	try {
		const deps = { connect: daemon.connect, resolveRepo: repoIs('/repo') };
		// An id (story part in another case) and a repo-relative path are both presented, in the order given.
		// LLD-abc-s5 stands in for an already-approved artifact: handleInsrcPresent itself never reads
		// lifecycle status (the WorkflowOpenableResult carries no status field at all) -- resolveOpenableArtifacts
		// is where approved/rejected inclusion is actually decided and unit-tested (pending.test.ts).
		const ok = await handleInsrcPresent({ documents: ['LLD-ABC-S5', 'docs/standalone/x/S005/LLD.md', 'LLD-nope-S001'] }, deps);
		assert.ok(!ok.isError, text(ok));
		assert.deepEqual(JSON.parse(text(ok)), { presented: ['LLD-ABC-S5', 'docs/standalone/x/S005/LLD.md'], notPending: ['LLD-nope-S001'] });
		// handleInsrcPresent calls the daemon's 'workflow.openable' method, not 'workflow.pending'.
		assert.deepEqual(daemon.seen[0], { method: 'workflow.openable', params: { repo: '/repo' } });
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

// ISSUE-6dbf14435972af7a / ISSUE-9c95950064e4b916: a tracked-epic BUILD record with no CR
// sibling -- the reported defect's exact case -- is openable and presentable BY ID, with an
// empty mdPath (document-less; the pane opens it through the evidence read).
test('handleInsrcPresent presents a tracked-epic BUILD by artifact id with no CR sibling (the reported defect\'s exact case)', async () => {
	const daemon = await fakeDaemon(PENDING);
	try {
		const out = await handleInsrcPresent({ documents: ['BUILD-abc-S001'] }, { connect: daemon.connect, resolveRepo: repoIs('/repo') });
		assert.deepEqual(JSON.parse(text(out)), { presented: ['BUILD-abc-S001'], notPending: [] });
	} finally { await daemon.close(); }
});

const OPENABLE_TRACKED_BUILD = {
	artifacts: [
		{ artifactId: 'BUILD-690f38931e7d3b57-s1', mdPath: '/repo/docs/epics/core-base-infrastructure-E20261126690f3893/S001/BUILD.md' },
	],
};

test('handleInsrcPresent presents the same BUILD by its repo-relative doc path', async () => {
	const daemon = await fakeDaemon(OPENABLE_TRACKED_BUILD);
	try {
		const out = await handleInsrcPresent(
			{ documents: ['docs/epics/core-base-infrastructure-E20261126690f3893/S001/BUILD.md'] },
			{ connect: daemon.connect, resolveRepo: repoIs('/repo') },
		);
		assert.deepEqual(JSON.parse(text(out)), {
			presented: ['docs/epics/core-base-infrastructure-E20261126690f3893/S001/BUILD.md'],
			notPending: [],
		});
	} finally { await daemon.close(); }
});

test('handleInsrcPresent answers a daemon error or an unreachable daemon as an explicit error, never as presented', async () => {
	const failing = await fakeDaemon({ error: 'workflow.openable: `repo` is required' });
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
// to the same two documents (a name that matches more than one is ambiguous, never guessed).
test('handleInsrcPresent reports notPending for a bare filename matching more than one document (ambiguity preserved)', async () => {
	const daemon = await fakeDaemon({
		artifacts: [
			{ artifactId: 'PLAN-aaa-S001', mdPath: '/repo/docs/standalone/a/S001/PLAN.md' },
			{ artifactId: 'PLAN-bbb-S001', mdPath: '/repo/docs/standalone/b/S001/PLAN.md' },
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
