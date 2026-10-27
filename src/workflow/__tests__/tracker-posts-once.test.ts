import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { autoPushEpicOnHld, autoPushStoryOnLld } from '../tracker-auto.js';
import { lldArtifactId } from '../storage.js';
import { readBinding } from '../tracker/binding.js';
import { HASH, fakeTracker, seed, via } from './approve-fallback-kit.js';

test('the approve-time pushes post each comment once: a crash after a successful post is reconciled by the marker on the next approve and posts nothing twice', async () => {
	const fx = seed();
	try {
		const t = fakeTracker();
		assert.equal((await via(t)(async () => await autoPushEpicOnHld(fx.hld))).status, 'created');

		// the crash: the comment reaches the issue, then the record of it cannot be written (a store write is staged for the STORY head)
		const journal = join(fx.repo, '.insrc', 'journal', `STORY-${HASH}-s1.json`);
		const ops = t.port.issueOps;
		const post = ops.comment.bind(ops);
		let crashed = false;
		(ops as { comment: typeof ops.comment }).comment = (ref, body) => {
			const r = post(ref, body);
			if (r.ok && !crashed && body.includes('insrc:post:')) { crashed = true; mkdirSync(dirname(journal), { recursive: true }); writeFileSync(journal, '{}'); }
			return r;
		};
		const first = await via(t)(async () => await autoPushStoryOnLld(fx.lld));
		assert.equal(first.status, 'created');
		const storyComments = () => t.log.comments.filter(([ref]) => ref === 'acme/demo#2');
		assert.equal(storyComments().length, 2, 'the design comment and the review comment were each posted once');
		assert.deepEqual(first.status === 'created' ? first.extrasFailed?.map(f => f.name).sort() : null, ['designComment', 'reviewComment'], 'posted but unrecorded is reported');
		assert.deepEqual(readBinding(fx.repo, `STORY-${HASH}-s1`)?.posted.map(p => p.kind), ['task-list'], 'nothing else was recorded');
		for (const [, body] of storyComments()) assert.match(body, /^<!-- insrc:post:STORY-[0-9a-f]{16}-s1:(design|review) -->\n/);

		// the next approve finds both posts by their markers, records them, and posts nothing
		rmSync(journal);
		const writes = t.log.writeBodies;
		const second = await via(t)(async () => await autoPushStoryOnLld(fx.lld));
		assert.equal(second.status, 'already-exists');
		assert.equal(second.status === 'already-exists' ? second.extrasFailed : undefined, undefined, 'nothing failed');
		assert.equal(storyComments().length, 2, 'no comment was posted twice');
		assert.equal(t.log.writeBodies, writes, 'nor was the task list written again');
		assert.deepEqual(readBinding(fx.repo, `STORY-${HASH}-s1`)?.posted.map(p => p.kind).sort(), ['design', 'review', 'task-list']);

		// and a third approve changes nothing
		const before = t.log.comments.length;
		await via(t)(async () => await autoPushStoryOnLld(fx.lld));
		assert.equal(t.log.comments.length, before);
	} finally { fx.cleanup(); }
});
