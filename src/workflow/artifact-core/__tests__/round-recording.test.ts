import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { buildArtifactId, testsArtifactId } from '../../storage.js';
import { LifecycleService } from '../lifecycle-service.js';
import { persistBuildRecord } from '../../runners/build/standalone-record.js';
import type { BuildRecord } from '../../runners/build/standalone-record.js';
import { persistTestRecordTask, testRecordPaths } from '../../runners/build/test-record.js';
import type { TestRecordTask } from '../../runners/build/test-record.js';
import type { RoundWriter } from '../../runners/build/round-writer.js';
import { H, alice, artifact } from './store-kit.js';
import { durableKit } from './durable-kit.js';
import type { DurableKit } from './durable-kit.js';
import { stubEvidence } from './lifecycle-kit.js';

const BUILD = buildArtifactId(H, 's1');
const TESTS = testsArtifactId(H, 's1');
const T1 = '2026-10-21T10:00:00.000Z';
const T2 = '2026-10-21T11:00:00.000Z';

const buildRec = (at: string, passed: boolean): BuildRecord => ({
	meta: { workflow: 'build', epicHash: H, storyId: 's1', createdAt: at, updatedAt: at },
	body: { tasks: [{ id: 't1', passed }] },
});
const testTask = (at: string, testsPassed: boolean): TestRecordTask => ({ taskId: 't1', ranAt: at, testsPassed, tests: [], files: [] });

async function seeded(): Promise<{ k: DurableKit; through: RoundWriter; service: LifecycleService }> {
	const k = durableKit();
	await k.store.write(artifact(`DEF-${H}`), alice);
	const service = new LifecycleService({ store: k.store, evidence: stubEvidence([]) });
	return { k, service, through: { writer: service, actor: { id: 'insrc:build', kind: 'system', properties: {} } } };
}
const logOf = async (k: DurableKit, id: string) => (await k.store.readWithHistory(id)).changeLog;
const bodyOf = async (k: DurableKit, id: string) => (await k.store.read(id)).payload.body as { tasks: { id?: string; taskId?: string; passed?: boolean; testsPassed?: boolean }[] };

describe('round-recording', () => {
	it('persistBuildRecord and persistTestRecordTask with a RoundWriter store the content through the service and log the round, and the earlier round stays readable in the log', async () => {
		const { k, through } = await seeded();
		try {
			// BUILD: the first round is created through the store, the second replaces it; both are in the log with their outcome.
			await persistBuildRecord(k.repo, buildRec(T1, false), through);
			await persistBuildRecord(k.repo, buildRec(T2, true), through);
			let log = await logOf(k, BUILD);
			assert.deepEqual(log.map(e => e.operation), ['create', 'update']);
			assert.equal(log[0]?.outcome?.result, 'failed');
			assert.equal(log[1]?.outcome?.result, 'passed');
			assert.equal(log[1]?.revision?.number, (log[0]?.revision?.number ?? 0) + 1);
			assert.equal((await bodyOf(k, BUILD)).tasks[0]?.passed, true);
			assert.equal((await k.store.read(BUILD)).lifecycle.revision.number, log[1]?.revision?.number, 'the raw refresh kept the head in step with the log');
			assert.equal((await k.store.read(BUILD)).lifecycle.status, 'draft');

			// TESTS: the same, and the rendered markdown follows.
			const first = await persistTestRecordTask(k.repo, { epicHash: H, storyId: 's1', now: T1 }, testTask(T1, false), {}, through);
			await persistTestRecordTask(k.repo, { epicHash: H, storyId: 's1', now: T2 }, testTask(T2, true), {}, through);
			log = await logOf(k, TESTS);
			assert.deepEqual(log.map(e => e.operation), ['create', 'update']);
			assert.deepEqual(log.map(e => e.outcome?.result), ['failed', 'passed']);
			assert.equal((await bodyOf(k, TESTS)).tasks[0]?.testsPassed, true);
			assert.ok(readFileSync(first.md, 'utf8').includes('TESTS'), 'the document is rendered');
			// the head still carries its lifecycle after the raw refresh
			assert.equal((await k.store.read(TESTS)).lifecycle.revision.number, log[1]?.revision?.number);
			assert.equal((await new LifecycleService({ store: k.store, evidence: stubEvidence([]) }).inspect(TESTS))?.integrity.ok, true);
		} finally { k.done(); }
	});

	it('a TESTS persist whose markdown fails after the content was stored keeps the committed content and entry, and the next persist renders the markdown', async () => {
		const { k, through } = await seeded();
		try {
			await persistTestRecordTask(k.repo, { epicHash: H, storyId: 's1', now: T1 }, testTask(T1, false), {}, through);
			const paths = testRecordPaths(k.repo, H, 's1', { now: T1 }, { kind: 'read' });
			// the document cannot be written: a directory sits where it goes
			rmSync(paths.md, { force: true });
			mkdirSync(paths.md);
			const before = (await logOf(k, TESTS)).length;
			await assert.rejects(persistTestRecordTask(k.repo, { epicHash: H, storyId: 's1', now: T2 }, testTask(T2, true), {}, through));
			// the content and its entry were committed and are not rolled back
			assert.equal((await bodyOf(k, TESTS)).tasks[0]?.testsPassed, true);
			assert.equal((await logOf(k, TESTS)).length, before + 1);
			// the next persist finds the content unchanged and renders the markdown
			rmSync(paths.md, { recursive: true, force: true });
			const again = await persistTestRecordTask(k.repo, { epicHash: H, storyId: 's1', now: T2 }, testTask(T2, true), {}, through);
			assert.ok(readFileSync(again.md, 'utf8').includes('TESTS'));
			assert.equal((await logOf(k, TESTS)).length, before + 1, 'no second entry for the same content');
		} finally { k.done(); }
	});

	it('a failed round log fails the persist, leaves the staged write in the journal, and the next update finishes it so the next approval is not refused', async () => {
		const { k, through, service } = await seeded();
		try {
			await persistBuildRecord(k.repo, buildRec(T1, false), through);
			k.faults.append = true;
			await assert.rejects(persistBuildRecord(k.repo, buildRec(T2, true), through), /injected append failure/);
			const staged = await k.journal.pending(BUILD);
			assert.ok(staged, 'the staged write stays in the journal');
			// the next update finishes it first, and the artifact can then be approved
			await persistBuildRecord(k.repo, buildRec(T2, true), through);
			assert.equal(await k.journal.pending(BUILD), undefined);
			const log = await logOf(k, BUILD);
			assert.equal(log.filter(e => e.id === staged.operationId).length, 1, 'the staged entry is logged once');
			assert.equal((await service.inspect(BUILD))?.integrity.ok, true);
			await service.apply(BUILD, 'approve', alice);
			assert.equal((await k.store.read(BUILD)).lifecycle.status, 'approved');
		} finally { k.done(); }
	});
});
