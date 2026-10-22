import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { durableKit } from '../../artifact-core/__tests__/durable-kit.js';
import type { DurableKit } from '../../artifact-core/__tests__/durable-kit.js';
import { History } from '../../artifact-core/history.js';
import type { Actor } from '../../artifact-core/types.js';
import { artifactJsonPath } from '../../storage.js';
import { backfillHead } from '../backfill.js';
import { applyFeedback, batchEntryId, feedbackRule, ownDocuments } from '../feedback-rule.js';
import { migratedEntryId } from '../entry-ids.js';
import { planConversion } from '../plan.js';
import { writeMigratedHead } from '../migrated-head.js';
import type { ConversionDeps, RawHead } from '../types.js';

const H = 'aaaaaaaaaaaaaaaa';
const ID = `LLD-${H}-s1`;
const NOW = '2026-10-23T09:00:00.000Z';
const DOC = 'docs/epics/e-E1/S001/LLD.md';
const MIGRATION: Actor = { id: 'insrc:migration', kind: 'system', properties: {} };

const FEEDBACK = [
	{ id: 'f1', author: 'Alice Smith', timestamp: '2026-10-20T10:00:00.000Z', comment: 'tighten this', target: { file: DOC }, kind: 'feedback', batchId: 'b1', decision: 'feedback' },
	{ id: 'f2', author: 'github:Bob', timestamp: '2026-10-20T10:00:05.000Z', comment: 'also this', target: { file: DOC, version: 'v2' }, kind: 'suggestion', batchId: 'b1', decision: 'feedback' },
	{ id: 'f3', author: 'Carol', timestamp: '2026-10-21T10:00:00.000Z', comment: 'on the plan', target: { file: 'docs/epics/e-E1/S001/PLAN.md' } },
	{ id: 'f4', author: 'Dave', timestamp: '2026-10-21T11:00:00.000Z', comment: '   ', target: { file: DOC } },
];

interface Rig { readonly kit: DurableKit; readonly history: History; readonly deps: ConversionDeps; readonly path: string; failAt(n: number): void }
function rig(): Rig {
	const kit = durableKit();
	const path = artifactJsonPath(kit.repo, ID);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, JSON.stringify({ meta: { workflow: 'design.story', epicHash: H, storyId: 's1', createdAt: '2026-10-19T00:00:00.000Z', revision: 2, approvedAt: '2026-10-22T00:00:00.000Z' }, body: { goal: 'g', feedback: FEEDBACK }, citations: [] }, null, 2) + '\n');
	mkdirSync(join(kit.repo, 'docs/epics/e-E1/S001'), { recursive: true });
	writeFileSync(join(kit.repo, DOC), `<!-- insrc:artifact ${ID} -->\n# LLD\n`);
	const history = new History(kit.sidecar);
	let failAt = 0; let calls = 0;
	const fail = (): void => { calls += 1; if (calls === failAt) throw new Error(`injected failure at ${calls}`); };
	const appendFeedback = history.appendFeedback.bind(history); const appendLog = history.appendLog.bind(history);
	history.appendFeedback = async (id, f) => { fail(); return appendFeedback(id, f); };
	history.appendLog = async (id, e) => { fail(); return appendLog(id, e); };
	return { kit, history, path, deps: { store: kit.store, history, now: () => new Date(NOW), actor: MIGRATION } as unknown as ConversionDeps, failAt: n => { failAt = n; calls = 0; } };
}

const raw = (r: Rig): RawHead => ({ artifactId: ID, json: JSON.parse(readFileSync(r.path, 'utf8')) });
async function finish(r: Rig): Promise<void> {
	await applyFeedback(r.kit.repo, r.deps);
	const converted = backfillHead({ head: raw(r), hasLog: (await r.history.log(ID)).length > 0, now: NOW, actor: MIGRATION }).converted;
	await writeMigratedHead(r.kit.repo, converted, r.deps);
}
const state = async (r: Rig) => ({
	lines: (await r.history.feedback(ID)).map(f => f.id).sort(),
	log: (await r.history.log(ID)).map(e => e.id).sort(),
	stripped: (JSON.parse(readFileSync(r.path, 'utf8')) as { body: Record<string, unknown> }).body['feedback'] === undefined,
});

describe('convert-feedback-rule', () => {
	it('convert-feedback-rule.test.ts: feedback lines are appended before the head is replaced and a crash loses no feedback', async () => {
		// the reference: an uninterrupted run
		const ref = rig();
		let expected: Awaited<ReturnType<typeof state>>;
		try {
			const result = await applyFeedback(ref.kit.repo, ref.deps);
			assert.deepEqual([result.appended, result.batches], [3, 1], 'three lines (the empty comment is not one) and the decision of batch b1');
			assert.ok(JSON.parse(readFileSync(ref.path, 'utf8')).body.feedback.length === 4, 'applyFeedback strips nothing: the head still holds body.feedback');
			assert.deepEqual(result.unmapped.map(u => [u.entryId, u.field]).sort(), [['f2', 'target.version'], ['f4', 'comment']]);
			const lines = await ref.history.feedback(ID);
			assert.deepEqual(lines.map(f => [f.id, f.kind, f.actor.id, f.actor.properties['name']]), [
				['f1', 'revision-request', 'legacy:alice-smith', 'Alice Smith'], ['f2', 'revision-request', 'github:bob', 'github:Bob'], ['f3', 'comment', 'legacy:carol', 'Carol'],
			]);
			assert.equal(lines[0]!.anchor, undefined, 'the artifact\'s own document adds no anchor');
			assert.equal(lines[2]!.anchor?.section, 'docs/epics/e-E1/S001/PLAN.md', 'another document goes to the section');
			const batch = (await ref.history.log(ID)).find(e => e.id === batchEntryId(ID, 'b1'));
			assert.deepEqual([batch?.operation, batch?.outcome?.result, batch?.timestamp, batch?.revision], ['review', 'feedback', '2026-10-20T10:00:00.000Z', undefined]);

			// a repeated run appends nothing twice
			assert.deepEqual(await applyFeedback(ref.kit.repo, ref.deps).then(r => [r.appended, r.batches]), [0, 0]);

			// then the migration write strips body.feedback, and the lines stay
			const converted = backfillHead({ head: raw(ref), hasLog: true, now: NOW, actor: MIGRATION }).converted;
			await writeMigratedHead(ref.kit.repo, converted, ref.deps);
			expected = await state(ref);
			assert.equal(expected.stripped, true);
			assert.deepEqual(expected.lines, ['f1', 'f2', 'f3']);
			assert.ok(expected.log.includes(migratedEntryId(ID)) && expected.log.includes(batchEntryId(ID, 'b1')));
		} finally { ref.kit.done(); }

		// a crash before each append (three lines, one batch entry), then a rerun: the same result, nothing lost
		for (let crashAt = 1; crashAt <= 4; crashAt++) {
			const r = rig();
			try {
				r.failAt(crashAt);
				await assert.rejects(applyFeedback(r.kit.repo, r.deps), /injected/);
				assert.ok(JSON.parse(readFileSync(r.path, 'utf8')).body.feedback.length === 4, `step ${crashAt}: the head still holds every entry`);
				r.failAt(0);
				await finish(r);
				assert.deepEqual(await state(r), expected, `crash at append ${crashAt}`);
			} finally { r.kit.done(); }
		}

		// a crash between the appends and the head write: the rerun appends nothing new and the head is then converted
		const r = rig();
		try {
			await applyFeedback(r.kit.repo, r.deps);
			const converted = backfillHead({ head: raw(r), hasLog: false, now: NOW, actor: MIGRATION }).converted;
			await assert.rejects(writeMigratedHead(r.kit.repo, converted, r.deps, { beforeHeadWrite: () => { throw new Error('crash before the head replace'); } }), /crash/);
			assert.ok(JSON.parse(readFileSync(r.path, 'utf8')).body.feedback.length === 4);
			await finish(r);
			assert.deepEqual(await state(r), expected);
		} finally { r.kit.done(); }
	});

	it('convert-feedback-rule.test.ts: the plan lists the heads that hold feedback and the values with no home', async () => {
		const r = rig();
		try {
			const { execFileSync } = await import('node:child_process');
			const git = (...a: string[]): void => { execFileSync('git', ['-C', r.kit.repo, ...a], { stdio: 'ignore' }); };
			git('init', '-q', '-b', 'main'); git('config', 'user.email', 't@e.com'); git('config', 'user.name', 'T'); git('add', '-A'); git('commit', '-q', '-m', 'x');
			const plan = await planConversion(r.kit.repo, { rules: [feedbackRule] });
			assert.deepEqual(plan.changes.filter(c => c.rule === 'convert-feedback'), [{ rule: 'convert-feedback', artifactId: ID, detail: '3 of 4 entries' }]);
			assert.deepEqual(plan.unmapped.map(u => [u.artifactId, u.entryId, u.field]), [[ID, 'f2', 'target.version'], [ID, 'f4', 'comment']]);
			assert.equal(ownDocuments(r.kit.repo).get(ID), DOC);
		} finally { r.kit.done(); }
	});
});
