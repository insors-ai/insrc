import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { syncUnitComments } from '../comment-sync.js';
import { STORY, TASK, alice, comment, fakeTracker, syncKit } from './comment-sync-kit.js';

describe('comment-sync-inbound', () => {
	it('a human comment is recorded once as feedback with the tracker user as author, framework comments are never recorded, an edited comment is not mirrored, and a tracker failure is reported without failing the call', async () => {
		const s = await syncKit();
		try {
			const t = fakeTracker();
			t.comments = [
				comment(1, 'Please rename the helper', 'Carol-Dev'),
				comment(2, '/revise the title is too long', 'dave'),
				comment(3, 'Suggestion: split the task', 'erin'),
				comment(4, '<!-- insrc:post:LLD-x:design -->\n## LLD', 'subho'),
				comment(5, '<!-- insrc:attach:TASK-x -->\nAttached TASK `x`: https://x', 'subho'),
			];

			// the human comments are recorded with the tracker user as author, their kind and their source; the framework's are skipped
			const first = await syncUnitComments(s.task, t.port, s.deps);
			assert.deepEqual([first.recorded, first.framework, first.known, first.failed, first.note], [['1', '2', '3'], ['4', '5'], [], [], undefined]);
			assert.deepEqual([first.artifactId, first.issue], [TASK, 'acme/demo#7']);
			const stored = await s.history.feedback(TASK);
			assert.deepEqual(stored.map(f => [f.id, f.kind, f.actor.id, f.text.slice(0, 12)]), [
				['tracker:1', 'comment', 'github:carol-dev', 'Please renam'],
				['tracker:2', 'revision-request', 'github:dave', '/revise the '],
				['tracker:3', 'suggestion', 'github:erin', 'Suggestion: '],
			]);
			assert.deepEqual(stored[0]?.source, { system: 'github', externalId: '1', url: 'https://github.com/acme/demo/issues/7#issuecomment-1' });
			// a revision moves nowhere: the Task is untouched
			assert.equal((await s.k.store.read(TASK)).lifecycle.revision.number, 1);

			// a repeated sync records nothing
			const again = await syncUnitComments(s.task, t.port, s.deps);
			assert.deepEqual([again.recorded, again.known, again.failed], [[], ['1', '2', '3'], []]);
			assert.equal((await s.history.feedback(TASK)).length, 3);

			// a comment edited on the tracker after it was recorded is skipped, not mirrored, and does not fail later syncs
			t.comments[0] = comment(1, 'Please rename the helper, and the file', 'Carol-Dev');
			const edited = await syncUnitComments(s.task, t.port, s.deps);
			assert.deepEqual([edited.recorded, edited.failed], [[], []]);
			assert.equal((await s.history.feedback(TASK))[0]?.text, 'Please rename the helper');
			// a deleted comment is not mirrored either: the recorded entry stays
			t.comments.splice(1, 1);
			assert.deepEqual((await syncUnitComments(s.task, t.port, s.deps)).failed, []);
			assert.equal((await s.history.feedback(TASK)).length, 3);

			// a new comment is picked up by the next sync
			t.comments.push(comment(6, 'one more thing'));
			assert.deepEqual((await syncUnitComments(s.task, t.port, s.deps)).recorded, ['6']);

			// a tracker that cannot be read is reported and nothing is lost: the next sync reads it
			t.failList = true;
			const down = await syncUnitComments(s.task, t.port, s.deps);
			assert.deepEqual([down.recorded, down.failed], [[], [{ step: 'read', reason: 'offline' }]]);
			t.failList = false;
			t.comments.push(comment(7, 'after the outage'));
			assert.deepEqual((await syncUnitComments(s.task, t.port, s.deps)).recorded, ['7']);
		} finally { s.done(); }
	});

	it('a comment that failed to record is picked up on the next sync, and a unit with no binding or no artifact says so', async () => {
		const s = await syncKit();
		try {
			const t = fakeTracker();
			t.comments = [comment(1, 'first'), comment(2, 'second')];
			// the first record fails once (a transient write failure); the second is recorded
			let failOnce = true;
			const flaky = Object.assign(Object.create(s.feedback), {
				add: async (...args: Parameters<typeof s.feedback.add>) => {
					if (failOnce) { failOnce = false; throw new Error('the sidecar append failed'); }
					return s.feedback.add(...args);
				},
			}) as typeof s.feedback;
			const r = await syncUnitComments(s.task, t.port, { ...s.deps, feedback: flaky });
			assert.equal(r.failed.length, 1);
			assert.equal(r.failed[0]?.step, 'record');
			assert.equal(r.failed[0]?.id, '1');
			assert.deepEqual(r.recorded, ['2']);
			// nothing about the later comment hides the failed one: the next sync records it
			const next = await syncUnitComments(s.task, t.port, s.deps);
			assert.deepEqual([next.recorded, next.known, next.failed], [['1'], ['2'], []]);

			// a Story's comments are recorded on its STORY head, the artifact that holds its binding
			t.comments = [comment(31, 'on the story')];
			const story = await syncUnitComments(s.story, t.port, s.deps);
			assert.deepEqual([story.artifactId, story.issue, story.recorded], [STORY, 'acme/demo#2', ['31']]);
			assert.equal((await s.history.feedback(STORY)).length, 1);

			// no artifact, and an artifact with no binding: a note, nothing recorded, nothing thrown
			const none = await syncUnitComments({ ...s.task, taskId: 't9' }, t.port, s.deps);
			assert.match(none.note ?? '', /no artifact/);
			assert.deepEqual([none.recorded, none.failed], [[], []]);
			const unbound = `TASK-${'0123456789abcdef'}-s1-t2`;
			await s.k.store.write((await import('../../artifact-core/__tests__/store-kit.js')).artifact(unbound, { payload: { body: { title: 'a task', summary: 'one', size: 'S', order: 2, acceptanceChecks: ['done'], tests: [], planTaskId: 't2' }, citations: [] } }), alice);
			const noBinding = await syncUnitComments({ ...s.task, taskId: 't2' }, t.port, s.deps);
			assert.match(noBinding.note ?? '', /not bound to an issue/);
		} finally { s.done(); }
	});
});
