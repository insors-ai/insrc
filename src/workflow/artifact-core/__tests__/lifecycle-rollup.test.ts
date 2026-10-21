import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { InvalidArtifactKeyError } from '../../artifact-ids.js';
import { rollUp } from '../lifecycle.js';
import type { ChildStatusReader, CodeReviewEvidence, CompletionEvidence } from '../lifecycle.js';
import { UnreadableChildError } from '../types.js';
import type { Status } from '../types.js';
import { H } from './store-kit.js';

const STORY = `STORY-${H}-s1`;
const EPIC = `EPIC-${H}`;
const task = (n: number) => `TASK-${H}-s1-t${n}`;

/** An in-memory reader: parents map to children, ids map to statuses, and `unreadable` lists what childrenOfStrict cannot read. */
function reader(children: Record<string, string[]>, statuses: Record<string, Status>, unreadable: string[] = []): ChildStatusReader {
	return {
		childrenOfStrict: async id => ({ children: children[id] ?? [], unreadable }),
		statusOf: async id => statuses[id],
	};
}
function evidence(passed: string[], review: CodeReviewEvidence): CompletionEvidence {
	return { taskBuildPassed: async id => passed.includes(id), storyCodeReview: async () => review };
}
const clean: CodeReviewEvidence = { kind: 'clean' };

describe('rollUp', () => {
	it('the Task, Story and Epic roll-up rules, the evidence mapping and the unreadable child', async () => {
		// a Task is completed when its build passed
		assert.equal(await rollUp(task(1), reader({}, {}), evidence([task(1)], clean)), 'completed');
		assert.equal(await rollUp(task(2), reader({}, {}), evidence([task(1)], clean)), undefined);

		// a Story needs at least one counted Task, all completed, and a clean or overridden review
		const kids = { [STORY]: [task(1), task(2), `TASKS-${H}-s1`, `DIAG-${H}-s1-1`, task(3), task(4)] };
		const done = { [task(1)]: 'completed', [task(2)]: 'completed', [task(3)]: 'withdrawn', [task(4)]: 'superseded', [`TASKS-${H}-s1`]: 'draft', [`DIAG-${H}-s1-1`]: 'draft' } as const;
		assert.equal(await rollUp(STORY, reader(kids, done), evidence([], clean)), 'completed', 'withdrawn, superseded, TASKS and DIAG are not counted');
		assert.equal(await rollUp(STORY, reader(kids, done), evidence([], { kind: 'overridden', overrideReason: 'accepted' })), 'completed');
		assert.equal(await rollUp(STORY, reader(kids, done), evidence([], { kind: 'blocked' })), undefined);
		assert.equal(await rollUp(STORY, reader(kids, done), evidence([], { kind: 'missing' })), undefined);
		assert.equal(await rollUp(STORY, reader(kids, { ...done, [task(2)]: 'approved' }), evidence([], clean)), undefined, 'an unfinished Task holds the Story');
		assert.equal(await rollUp(STORY, reader(kids, { ...done, [task(2)]: 'rejected' }), evidence([], clean)), undefined, 'a rejected Task is counted');
		assert.equal(await rollUp(STORY, reader({ [STORY]: [task(3), `TASKS-${H}-s1`] }, done), evidence([], clean)), undefined, 'no counted Task');
		assert.equal(await rollUp(STORY, reader({}, {}), evidence([], clean)), undefined, 'no Task at all');

		// an Epic needs at least one counted Story, all completed
		const epicKids = { [EPIC]: [STORY, `STORY-${H}-s2`, `STORY-${H}-s3`, `DEF-${H}`] };
		const stories = { [STORY]: 'completed', [`STORY-${H}-s2`]: 'withdrawn', [`STORY-${H}-s3`]: 'completed', [`DEF-${H}`]: 'draft' } as const;
		assert.equal(await rollUp(EPIC, reader(epicKids, stories), evidence([], clean)), 'completed');
		assert.equal(await rollUp(EPIC, reader(epicKids, { ...stories, [`STORY-${H}-s3`]: 'approved' }), evidence([], clean)), undefined);
		assert.equal(await rollUp(EPIC, reader({}, {}), evidence([], clean)), undefined);

		// any other kind answers undefined; a bad id is refused
		assert.equal(await rollUp(`LLD-${H}-s1`, reader({}, {}), evidence([], clean)), undefined);
		await assert.rejects(rollUp('nope', reader({}, {}), evidence([], clean)), InvalidArtifactKeyError);

		// an unreadable child is never counted as completed or as absent
		await assert.rejects(rollUp(STORY, reader(kids, done, [task(9)]), evidence([], clean)), (e: unknown) => e instanceof UnreadableChildError && e.unreadable[0] === task(9));
		await assert.rejects(rollUp(EPIC, reader(epicKids, stories, [`STORY-${H}-s9`]), evidence([], clean)), UnreadableChildError);
		// a child whose head vanished between the listing and the read is unreadable too
		await assert.rejects(rollUp(STORY, reader({ [STORY]: [task(1)] }, {}), evidence([], clean)), UnreadableChildError);
	});
});
