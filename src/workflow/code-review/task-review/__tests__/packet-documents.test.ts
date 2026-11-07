/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { CheckpointSchema, decodeReview, parsePacket, TaskReviewInputError } from '../contracts.js';
import { SummarySchema } from '../record.js';

const oid = (n: number): string => n.toString(16).repeat(40).slice(0, 40);
const doc = (path: string, n = 1) => ({ path, commit: oid(n) });
const ROLES = { story: doc('story.json'), lld: doc('lld.json'), plan: doc('plan.json'), issue: doc('issue.json') } as const;
const packet = (documents: Record<string, unknown>) => ({
	reviewRevision: oid(2), storyId: 's1', functionalSummary: 'Change behaviour', documents,
	reviewSet: [{ commit: oid(2), parent: oid(1), files: [{ path: 'src/a.ts', segments: [{ after: [1, 1] }] }] }],
	tests: [],
});

test('src/workflow/code-review/task-review/__tests__/packet-documents.test.ts: any subset of the four document roles decodes and a fifth key is refused', () => {
	const roles = Object.keys(ROLES) as (keyof typeof ROLES)[];
	for (let mask = 0; mask < 1 << roles.length; mask++) {
		const documents = Object.fromEntries(roles.filter((_, i) => mask & (1 << i)).map(r => [r, ROLES[r]]));
		const decoded = parsePacket(packet(documents));
		assert.deepEqual(Object.keys(decoded.documents).sort(), Object.keys(documents).sort(), `subset ${JSON.stringify(Object.keys(documents))}`);
	}
	assert.throws(() => parsePacket(packet({ ...ROLES, design: doc('design.json') })), TaskReviewInputError, 'a fifth key is refused');
	assert.throws(() => parsePacket(packet({ lld: doc('../lld.json') })), TaskReviewInputError, 'a present document path is still checked');
});

test('src/workflow/code-review/task-review/__tests__/packet-documents.test.ts: a packet, checkpoint and review summary written before the change still decode', () => {
	const before = packet({ story: ROLES.story, lld: ROLES.lld, plan: ROLES.plan });
	assert.deepEqual(parsePacket(before, true), before);
	const checkpoint = {
		schemaVersion: 1, reviewId: 'review-1', project: '/repo', storyId: 's1',
		attempts: [{
			header: { attempt: 1, reviewer: 'daemon', status: 'pending', createdAt: '2026-11-01T00:00:00.000Z', selectedTaskIds: ['t1'] },
			submitted: before,
			'review-response': { summary: 'Review admitted; CR publication pending.', tasks: [], crPublication: 'pending' },
		}],
	};
	assert.deepEqual(decodeReview(CheckpointSchema, checkpoint), checkpoint);
	const scope = { storyId: 's1', documents: before.documents, reviewSet: before.reviewSet };
	assert.deepEqual(decodeReview(SummarySchema.properties.scope, scope), scope);
});
