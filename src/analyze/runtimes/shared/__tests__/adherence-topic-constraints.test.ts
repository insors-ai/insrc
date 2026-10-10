/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The record of one enumeration of document constraints per run, repository
 * and topic (adherence-topic-constraints.ts): made once, kept under the run's
 * directory, read back by the next caller.
 *
 * The store is a real temporary one with document sections; the model that
 * reads the retrieved sections is a stand-in that counts its calls.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { getDb } from '../../../../db/client.js';
import { upsertEntities } from '../../../../db/entities.js';
import { closeGraphStore, setGraphStorePath } from '../../../../db/graph/store.js';
import { addRepo } from '../../../../db/repos.js';
import { makeEntityId } from '../../../../indexer/parser/base.js';
import { PATHS } from '../../../../shared/paths.js';
import type { Entity, LLMProvider } from '../../../../shared/types.js';
import { runWithRoutingContext } from '../../../context/shaper-provider.js';
import type { RoutingSeamContext } from '../../../context/shaper-provider.js';
import {
	_setConstraintEnumerateForTest,
	constraintRecordKey,
	constraintRecordPathFor,
	constraintsForTopic,
	purgeConstraintRecords,
} from '../adherence-topic-constraints.js';
import type { ConstraintRecord, ConstraintsForTopicResult } from '../adherence-topic-constraints.js';

const NOW = '2026-10-10T10:00:00.000Z';

let dir: string;
let REPO: string;
let sections: Entity[] = [];
let modelCalls = 0;
/** What the stand-in model answers: 'rules' (one constraint per section shown), 'none', or 'down'. */
let modelMode: 'rules' | 'none' | 'down' = 'rules';
const runs: string[] = [];

function section(name: string, rel: string, body: string): Entity {
	const file = join(REPO, rel);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, body);
	return {
		id: makeEntityId(REPO, file, 'section', name), kind: 'section', name, language: 'markdown', repoId: 0, repo: REPO, file,
		startLine: 1, endLine: 5, body, embedding: [], indexedAt: NOW, artifact: true,
	} as Entity;
}

const model = {
	completeStructured: async (messages: ReadonlyArray<{ content: unknown }>) => {
		modelCalls++;
		if (modelMode === 'down') throw new Error('the model is down');
		const prompt = String(messages[1]!.content);
		const constraints = modelMode === 'none' ? [] : sections
			.filter(s => prompt.includes(s.id))
			.map(s => ({ constraint: s.body, kind: 'must', sourceEntityId: s.id, file: s.file, heading: s.name, rationale: 'stated' }));
		return { subject: 'ci', constraints, notFoundNote: constraints.length === 0 ? 'nothing stated' : '' };
	},
} as unknown as LLMProvider;
const routing = { router: { resolveProviderForRole: () => ({ provider: model }) } } as unknown as RoutingSeamContext;

function uniqueRun(label: string): string {
	const runId = `topic-constraints-test-${label}-${Math.floor(Math.random() * 1e9).toString(16)}`;
	runs.push(runId);
	return runId;
}

async function ask(runId: string, topic: string, over: { taskId?: string; maxSources?: number; repoPath?: string } = {}): Promise<ConstraintsForTopicResult> {
	const db = await getDb();
	return runWithRoutingContext(routing, () => constraintsForTopic({
		runId, taskId: over.taskId ?? 't01', repoPath: over.repoPath ?? REPO, topic, db,
		...(over.maxSources !== undefined ? { maxSources: over.maxSources } : {}),
	}));
}

const readRecord = (path: string): ConstraintRecord => JSON.parse(readFileSync(path, 'utf8')) as ConstraintRecord;

test.beforeEach(async () => {
	await closeGraphStore();
	dir = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-topic-constraints-')));
	REPO = join(dir, 'repo');
	mkdirSync(REPO);
	setGraphStorePath(join(dir, 'graph.lmdb'));
	await addRepo(null, { path: REPO, name: '', addedAt: NOW, status: 'ready' });
	sections = [
		section('CI rules', 'docs/ci.md', 'Every CI workflow MUST run the test suite before a build.'),
		section('Release rules', 'docs/release.md', 'A CI release workflow MUST NOT publish from a branch other than main.'),
	];
	await upsertEntities(await getDb(), sections);
	modelCalls = 0;
	modelMode = 'rules';
});

test.afterEach(async () => {
	_setConstraintEnumerateForTest(undefined);
	for (const runId of runs.splice(0)) purgeConstraintRecords(runId);
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

test('one enumeration per run, repository and topic is made, recorded under the run\'s directory with its whole output, and read back; a topic that differs only in case or spacing reuses it; a different maxSources, topic or run does not; a failed enumeration is not recorded and one with no constraint is', async () => {
	const runId = uniqueRun('reuse');

	// --- the first call enumerates and records ---
	const first = await ask(runId, 'CI workflow rules', { taskId: 't07' });
	assert.equal(modelCalls, 1);
	assert.equal(first.reused, false);
	assert.deepEqual(first.output.constraints.map(c => c.sourceEntityId).sort(), sections.map(s => s.id).sort());
	assert.equal(first.output.retrievedSectionCount, 2);

	// The record is under the run's directory, at the key of repository, topic and limit.
	const path = constraintRecordPathFor(runId, REPO, 'CI workflow rules');
	assert.equal(first.record, path);
	assert.equal(path, join(PATHS.analyzeRun(runId), 'constraints', `${constraintRecordKey(REPO, 'CI workflow rules')}.json`));
	const record = readRecord(path);
	assert.deepEqual(
		{ ...record, enumeratedAt: typeof record.enumeratedAt },
		{ schemaVersion: 1, repoPath: REPO, topic: 'CI workflow rules', maxSources: null, enumeratedAt: 'string', enumeratedByTask: 't07', output: JSON.parse(JSON.stringify(first.output)) },
	);
	assert.ok(record.output.completeness !== undefined, 'the enumeration\'s completeness is in the record');

	// --- a second call, and one whose topic differs only in case and spacing, read it ---
	const second = await ask(runId, 'CI workflow rules', { taskId: 't08' });
	const respelt = await ask(runId, '  ci   WORKFLOW rules ', { taskId: 't09' });
	assert.equal(modelCalls, 1, 'no second enumeration');
	for (const again of [second, respelt]) {
		assert.equal(again.reused, true);
		assert.equal(again.record, path);
		assert.deepEqual(again.output, JSON.parse(JSON.stringify(first.output)));
	}
	// The record still names the task that made it and the topic as first written.
	assert.deepEqual([readRecord(path).enumeratedByTask, readRecord(path).topic], ['t07', 'CI workflow rules']);

	// --- another limit of sections, another topic, another run: each its own enumeration and record ---
	const limited = await ask(runId, 'CI workflow rules', { maxSources: 1 });
	const otherTopic = await ask(runId, 'release rules');
	const otherRun = await ask(uniqueRun('reuse-other'), 'CI workflow rules');
	assert.equal(modelCalls, 4);
	assert.equal(new Set([path, limited.record, otherTopic.record, otherRun.record]).size, 4);
	assert.equal(limited.output.retrievedSectionCount, 1);
	assert.equal(readRecord(limited.record!).maxSources, 1);

	// --- a failed enumeration is not recorded, and the next call tries again ---
	const failRun = uniqueRun('fail');
	modelMode = 'down';
	await assert.rejects(() => ask(failRun, 'CI workflow rules'), /the model call that reads the retrieved sections failed: the model is down/);
	assert.equal(existsSync(constraintRecordPathFor(failRun, REPO, 'CI workflow rules')), false);
	modelMode = 'rules';
	const recovered = await ask(failRun, 'CI workflow rules');
	assert.deepEqual([recovered.reused, recovered.output.constraints.length], [false, 2]);
	assert.equal(modelCalls, 6);

	// --- an enumeration that finds no constraint is recorded and reused ---
	const emptyRun = uniqueRun('empty');
	modelMode = 'none';
	const none = await ask(emptyRun, 'CI workflow rules');
	const noneAgain = await ask(emptyRun, 'CI workflow rules');
	assert.equal(modelCalls, 7, 'the empty enumeration was not made twice');
	assert.deepEqual([none.output.constraints.length, noneAgain.reused, noneAgain.output.notFoundNote], [0, true, 'nothing stated']);

	// --- purging a run removes its records ---
	purgeConstraintRecords(runId);
	for (const p of [path, limited.record!, otherTopic.record!]) assert.equal(existsSync(p), false, p);
	assert.equal(existsSync(otherRun.record!), true, 'another run\'s record stays');
});

test('a record that is unreadable, of another version or of another topic is enumerated again and overwritten; a record that cannot be written does not fail the check', async () => {
	const runId = uniqueRun('bad-record');
	const path = constraintRecordPathFor(runId, REPO, 'CI workflow rules');
	const good = await ask(runId, 'CI workflow rules');
	assert.equal(modelCalls, 1);
	const goodRecord = readRecord(path);

	const bad: ReadonlyArray<readonly [string, string]> = [
		['cut short', JSON.stringify(goodRecord).slice(0, 40)],
		['another schema version', JSON.stringify({ ...goodRecord, schemaVersion: 2 })],
		['another topic under the same key', JSON.stringify({ ...goodRecord, topic: 'release rules' })],
		['another repository under the same key', JSON.stringify({ ...goodRecord, repoPath: '/r/elsewhere' })],
		['no enumeration inside', JSON.stringify({ ...goodRecord, output: null })],
	];
	let expected = 1;
	for (const [what, text] of bad) {
		writeFileSync(path, text);
		const again = await ask(runId, 'CI workflow rules');
		expected++;
		assert.equal(modelCalls, expected, `${what}: enumerated again`);
		assert.equal(again.reused, false, what);
		assert.deepEqual(again.output.constraints, good.output.constraints, what);
		// ... and the file is a good record again.
		assert.deepEqual([readRecord(path).schemaVersion, readRecord(path).topic, readRecord(path).repoPath], [1, 'CI workflow rules', REPO], what);
	}
	// A good record is read, not made again.
	assert.equal((await ask(runId, 'CI workflow rules')).reused, true);
	assert.equal(modelCalls, expected);

	// --- the record cannot be written: a file stands where the records' directory would be ---
	const blocked = uniqueRun('unwritable');
	const blockedPath = constraintRecordPathFor(blocked, REPO, 'CI workflow rules');
	mkdirSync(dirname(dirname(blockedPath)), { recursive: true });
	writeFileSync(dirname(blockedPath), 'not a directory');
	try {
		const unwritten = await ask(blocked, 'CI workflow rules');
		assert.deepEqual([unwritten.reused, unwritten.record, unwritten.output.constraints.length], [false, undefined, 2]);
		assert.ok(!('record' in unwritten), 'no record path when none was written');
		// With no record, the next call enumerates again.
		const before = modelCalls;
		await ask(blocked, 'CI workflow rules');
		assert.equal(modelCalls, before + 1);
	} finally {
		rmSync(PATHS.analyzeRun(blocked), { recursive: true, force: true });
	}
});

test('the seam replaces the enumeration, and is handed the topic, the repository, the limit and no area', async () => {
	const seen: unknown[] = [];
	_setConstraintEnumerateForTest(async (args) => {
		seen.push({ subject: args.subject, repoPath: args.repoPath, maxSources: args.maxSources, area: args.area, runId: args.runId });
		return { type: 'doc.constraint.enumerate', completeness: { complete: true, returned: 0, basis: 'doc-index' }, subject: args.subject, constraints: [], notFoundNote: 'x', retrievedSectionCount: 0 } as never;
	});
	const runId = uniqueRun('seam');
	await ask(runId, 'CI workflow rules', { maxSources: 5 });
	assert.deepEqual(seen, [{ subject: 'CI workflow rules', repoPath: REPO, maxSources: 5, area: undefined, runId }]);
	assert.equal(modelCalls, 0);
});
