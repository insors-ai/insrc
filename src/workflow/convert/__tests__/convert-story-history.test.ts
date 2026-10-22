import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { durableKit } from '../../artifact-core/__tests__/durable-kit.js';
import { History } from '../../artifact-core/history.js';
import type { Actor, ChangeLogEntry, Feedback } from '../../artifact-core/types.js';
import { artifactJsonPath } from '../../storage.js';
import type { TrackerPort } from '../../tracker/port.js';
import { readRawHeads } from '../raw-heads.js';
import { applyStoryHistory, storyHistoryRule } from '../story-history.js';
import { applyUnits } from '../units.js';
import type { ConversionDeps } from '../types.js';

const H = 'cccccccccccccccc';
const LLD = `LLD-${H}-s1`;
const STORY = `STORY-${H}-s1`;
const MIGRATION: Actor = { id: 'insrc:migration', kind: 'system', properties: {} };
const person: Actor = { id: 'github:alice', kind: 'person', properties: {} };

function put(repo: string, id: string, meta: Record<string, unknown>, body: Record<string, unknown>): void {
	const path = artifactJsonPath(repo, id);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, JSON.stringify({ meta: { createdAt: '2026-10-01T00:00:00.000Z', epicCreatedAt: '2026-10-01T00:00:00.000Z', epicHash: H, revision: 1, ...meta }, body, citations: [] }, null, 2) + '\n');
}
const line = (id: string, extra: Partial<Feedback> = {}): Feedback =>
	({ id, text: `text of ${id}`, actor: person, timestamp: '2026-10-05T00:00:00.000Z', feedback: [], kind: 'comment', ...extra }) as Feedback;
const receipt = (id: string, feedbackId: string): ChangeLogEntry => ({
	id, actor: MIGRATION, timestamp: '2026-10-06T00:00:00.000Z', operation: 'update',
	outcome: { result: 'posted', summary: `feedback ${feedbackId} posted`, data: { kind: 'feedback-post', feedbackId, externalId: '9', issue: 'o/r#2' } },
});

describe('convert-story-history', () => {
	it('convert-story-history.test.ts: tracker feedback lines and receipts move to the STORY head and attach comments are listed', async () => {
		const kit = durableKit();
		try {
			const history = new History(kit.sidecar);
			const deps = { store: kit.store, history, now: () => new Date(), actor: MIGRATION } as unknown as ConversionDeps;
			put(kit.repo, `DEF-${H}`, { workflow: 'define' }, { stories: [{ id: 's1', title: 'First' }] });
			put(kit.repo, LLD, { workflow: 'design.story', storyId: 's1', envelope: { description: '', references: [], binding: { reference: { entityId: 'o/r#2', type: 'github:issue', relation: 'tracked-by' }, createdAtRevision: 1, posted: [] } } }, { goal: 'g' });
			await history.appendFeedback(LLD, line('tracker:11', { source: { system: 'github', externalId: '11' } }));
			await history.appendFeedback(LLD, line('tracker:12', { source: { system: 'github', externalId: '12' } }));
			await history.appendFeedback(LLD, line('local-1'));
			await history.appendLog(LLD, receipt('receipt-1', 'local-1'));

			const comments = [
				{ externalId: '100', author: 'a', text: 'Attached LLD `x`: link', at: '2026-09-01T00:00:00.000Z' },
				{ externalId: '101', author: 'a', text: '<!-- insrc:attach:LLD-x -->\nAttached LLD `x`: link', at: '2026-10-01T00:00:00.000Z' },
				{ externalId: '102', author: 'bob', text: 'a person wrote this', at: '2026-10-02T00:00:00.000Z' },
			];
			const tracker = { listComments: (issue: string) => ({ ok: true, value: issue === 'o/r#2' ? comments : [] }) } as unknown as TrackerPort;
			const heads = readRawHeads(kit.repo).heads;
			const plan = await storyHistoryRule({ repo: kit.repo, heads, tracker });
			assert.deepEqual(plan.changes?.map(c => [c.rule, c.artifactId, c.detail]), [['move-story-history', LLD, `2 tracker lines and 1 receipts to ${STORY}`]]);
			assert.deepEqual(plan.legacyAttachComments, [{ issue: 'o/r#2', commentId: '100' }], 'only the unmarked pre-s8 comment is listed');
			assert.deepEqual((await storyHistoryRule({ repo: kit.repo, heads })).legacyAttachComments, [], 'without a tracker port nothing is listed');

			await applyUnits(kit.repo, deps);
			const before = readFileSync(artifactJsonPath(kit.repo, LLD), 'utf8');
			assert.deepEqual(await applyStoryHistory(kit.repo, deps), { lines: 2, receipts: 1 });
			assert.deepEqual((await history.feedback(STORY)).map(f => f.id), ['tracker:11', 'tracker:12']);
			assert.deepEqual((await history.log(STORY)).filter(e => e.id === 'receipt-1').length, 1);
			assert.deepEqual((await history.feedback(LLD)).map(f => f.id), ['local-1', 'tracker:11', 'tracker:12'], 'the LLD keeps its lines as history');
			assert.equal(readFileSync(artifactJsonPath(kit.repo, LLD), 'utf8'), before, 'the comments are not rewritten and the LLD head is not touched');

			// a repeat de-duplicates by id and a plan finds nothing more to move
			assert.deepEqual(await applyStoryHistory(kit.repo, deps), { lines: 0, receipts: 0 });
			assert.deepEqual((await history.feedback(STORY)).length, 2);
			assert.deepEqual((await storyHistoryRule({ repo: kit.repo, heads, tracker })).changes, []);
		} finally { kit.done(); }
	});
});
