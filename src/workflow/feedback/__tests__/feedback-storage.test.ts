import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { History } from '../../artifact-core/history.js';
import { LifecycleService } from '../../artifact-core/lifecycle-service.js';
import type { Reference } from '../../artifact-core/types.js';
import { H, alice, artifact, bob } from '../../artifact-core/__tests__/store-kit.js';
import { durableKit } from '../../artifact-core/__tests__/durable-kit.js';
import { stubEvidence } from '../../artifact-core/__tests__/lifecycle-kit.js';
import { FeedbackService } from '../feedback-service.js';

const PLAN = `PLAN-${H}-s5`;
const LLD = `LLD-${H}-s5`;
const STORY = `STORY-${H}-s5`;
const TASK = `TASK-${H}-s5-t1`;
const TASK2 = `TASK-${H}-s5-t2`;
const body = (text: string) => ({ body: { text }, citations: [] });
const lines = (repo: string, rel: string): string[] => readFileSync(join(repo, rel), 'utf8').split('\n').filter(l => l !== '');

describe('feedback-storage', () => {
	it('feedback on a design, a plan and a single Task is recorded once as a framed line in the right file, survives a restart, and a Task\'s line lands in its Story\'s Tasks file and reads back for that Task only', async () => {
		let k = durableKit();
		try {
			const parent: Reference = { entityId: STORY, type: 'STORY', relation: 'derived-from' };
			await k.store.write(artifact(`DEF-${H}`), alice);
			for (const id of [LLD, PLAN, STORY]) await k.store.write(artifact(id), alice);
			for (const id of [TASK, TASK2]) await k.store.write(artifact(id, { parent }), alice);
			const svc = (kk: typeof k) => new FeedbackService({ history: new History(kk.sidecar), store: kk.store });
			const stored = [];
			for (const id of [LLD, PLAN, TASK]) stored.push(await svc(k).add(id, { text: `on ${id}` }, bob));

			// one framed line each: <bytes> TAB <json>
			for (const [id, f] of [[LLD, stored[0]!], [PLAN, stored[1]!]] as const) {
				const ls = lines(k.repo, k.sidecar.filesOf(id).feedback);
				assert.equal(ls.length, 1, id);
				const m = /^(\d+)\t(.*)$/s.exec(ls[0]!)!;
				assert.equal(Number(m[1]), Buffer.byteLength(m[2]!, 'utf8'));
				assert.equal(JSON.parse(m[2]!).entry.id, f.id);
			}
			// the Task's line is in the Story's Tasks file, and no file of its own
			const taskFile = k.sidecar.filesOf(TASK).feedback;
			assert.equal(taskFile, k.sidecar.filesOf(TASK2).feedback);
			assert.match(taskFile, /TASKS-/);
			assert.equal(lines(k.repo, taskFile).length, 1);

			// a restart: new store, journal and sidecar over the same directory
			k = k.restart();
			const h = new History(k.sidecar);
			assert.deepEqual((await h.feedback(LLD)).map(f => f.id), [stored[0]!.id]);
			assert.deepEqual((await h.feedback(PLAN)).map(f => f.id), [stored[1]!.id]);
			assert.deepEqual((await h.feedback(TASK)).map(f => f.id), [stored[2]!.id]);
			assert.deepEqual(await h.feedback(TASK2), [], 'reads back for that Task only');
		} finally { k.done(); }
	});

	it('a revision of an artifact addresses all its open feedback by default and only the listed roots when a list is given, in the shared (timestamp, id) order with the feedback file read first or last', async () => {
		const k = durableKit();
		try {
			await k.store.write(artifact(`DEF-${H}`), alice);
			await k.store.write(artifact(PLAN), alice);
			const history = new History(k.sidecar);
			// feedback is made just after the latest log entry, as it would be in life; the kit's clock is 2026-10-20 from 12:00
			let at = Date.parse('2026-10-20T11:00:00.000Z');
			const svc = new FeedbackService({ history, store: k.store, now: () => new Date(at++) });
			const lifecycle = new LifecycleService({ store: k.store, evidence: stubEvidence([]) });
			const open = async () => (await history.openFeedback(PLAN)).map(f => f.id).sort();
			const lastLog = async () => Date.parse((await history.log(PLAN)).at(-1)!.timestamp);

			await svc.add(PLAN, { text: 'a' }, bob);
			await svc.add(PLAN, { text: 'b' }, bob);
			await lifecycle.updateContent(PLAN, alice, body('rev two'));
			assert.deepEqual(await open(), [], 'a revision addresses all open feedback by default');

			at = (await lastLog()) + 1;
			const c = await svc.add(PLAN, { text: 'c' }, bob);
			const d = await svc.add(PLAN, { text: 'd' }, bob);
			await lifecycle.updateContent(PLAN, alice, body('rev three'), { addresses: [c.id] });
			assert.deepEqual(await open(), [d.id], 'only the listed root is addressed');

			// feedback made in the same instant as each other is ordered by id, and a later revision addresses both
			const instant = new Date(await lastLog() + 1).toISOString();
			await history.appendFeedback(PLAN, { id: '!first', text: 'x', actor: bob, timestamp: instant, feedback: [], kind: 'comment' });
			await history.appendFeedback(PLAN, { id: 'zlast', text: 'y', actor: bob, timestamp: instant, feedback: [], kind: 'comment' });
			assert.deepEqual((await history.feedback(PLAN)).slice(-2).map(f => f.id), ['!first', 'zlast'], 'one instant: ordered by id');
			assert.deepEqual(await open(), [d.id, '!first', 'zlast'].sort());
			await lifecycle.updateContent(PLAN, alice, body('rev four'));
			assert.deepEqual(await open(), [], 'the default revision addresses every root before it, whichever file is read first');
		} finally { k.done(); }
	});
});
