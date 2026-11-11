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
function evidence(passed: string[], review: CodeReviewEvidence, over: Partial<CompletionEvidence> = {}): CompletionEvidence {
	return {
		taskBuildPassed: async id => passed.includes(id),
		storyCodeReview: async () => review,
		storyBuildApproved: async () => true,
		storyApprovalOverride: async () => undefined,
		declaredStories: async () => [],
		storyTasks: async () => ({ kind: 'none-required' }),
		...over,
	};
}
const listed = (...taskIds: string[]): Partial<CompletionEvidence> => ({ storyTasks: async () => ({ kind: 'listed', taskIds }) });
const overridden: Partial<CompletionEvidence> = { storyApprovalOverride: async () => 'accepted by the owner' };
const clean: CodeReviewEvidence = { kind: 'clean' };

describe('rollUp', () => {
	it('the Task, Story and Epic roll-up rules, the evidence mapping and the unreadable child', async () => {
		// a Task is completed when its build passed
		assert.equal(await rollUp(task(1), reader({}, {}), evidence([task(1)], clean)), 'completed');
		assert.equal(await rollUp(task(2), reader({}, {}), evidence([task(1)], clean)), undefined);

		// a Story needs an approved BUILD, a clean or overridden review and every listed Task's latest round to have passed
		const kids = { [STORY]: [task(1), task(2), `TASKS-${H}-s1`, `DIAG-${H}-s1-1`, task(3), task(4)] };
		const done = { [task(1)]: 'approved', [task(2)]: 'approved', [task(3)]: 'withdrawn', [task(4)]: 'superseded', [`TASKS-${H}-s1`]: 'draft', [`DIAG-${H}-s1-1`]: 'draft' } as const;
		const all = listed(task(1), task(2), task(3), task(4));
		const passed = [task(1), task(2)];
		assert.equal(await rollUp(STORY, reader(kids, done), evidence(passed, clean, all)), 'completed');
		assert.equal(await rollUp(STORY, reader(kids, done), evidence(passed, { kind: 'overridden', overrideReason: 'accepted' }, all)), 'completed');
		assert.equal(await rollUp(STORY, reader(kids, done), evidence(passed, { kind: 'blocked' }, all)), undefined);
		assert.equal(await rollUp(STORY, reader(kids, done), evidence(passed, { kind: 'missing' }, all)), undefined);
		assert.equal(await rollUp(STORY, reader(kids, done), evidence(passed, clean, { ...all, storyBuildApproved: async () => false })), undefined, 'the BUILD is not approved');
		assert.equal(await rollUp(STORY, reader(kids, done), evidence([task(1)], clean, all)), undefined, 'an unfinished Task holds the Story');

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
	});
	it('an unreadable head of another kind does not block a Story roll-up', async () => {
		const kids = { [STORY]: [task(1), task(2)] };
		const done = { [task(1)]: 'approved', [task(2)]: 'approved' } as const;
		// an amendment, a build record and a review that cannot be read are never children of a Story
		const other = [`AMD-${H}-1`, `BUILD-${H}-s9`, `CR-${H}-s9`];
		assert.equal(await rollUp(STORY, reader(kids, done, other), evidence([task(1), task(2)], clean, listed(task(1), task(2)))), 'completed');
		assert.equal(await rollUp(EPIC, reader({ [EPIC]: [STORY] }, { [STORY]: 'completed' }, other), evidence([], clean)), 'completed');
	});

	it('an unreadable head of the counted kind still blocks the roll-up', async () => {
		const kids = { [STORY]: [task(1)] };
		const done = { [task(1)]: 'completed' } as const;
		// a Task head that cannot be read blocks the Story even when other kinds are unreadable too
		await assert.rejects(rollUp(STORY, reader(kids, done, [`AMD-${H}-1`, task(7)]), evidence([], clean)), (e: unknown) => e instanceof UnreadableChildError && e.unreadable.length === 1 && e.unreadable[0] === task(7));
		// a Story head that cannot be read blocks the Epic
		await assert.rejects(rollUp(EPIC, reader({ [EPIC]: [STORY] }, { [STORY]: 'completed' }, [`STORY-${H}-s9`]), evidence([], clean)), UnreadableChildError);
	});

	const open = { [task(1)]: 'approved', [task(2)]: 'approved' } as const;
	const both = listed(task(1), task(2));

	it('rollUp for STORY: approved BUILD with clean review and all listed Tasks latest rounds passed completes', async () => {
		assert.equal(await rollUp(STORY, reader({}, open), evidence([task(1), task(2)], clean, both)), 'completed');
	});

	it('rollUp for STORY: an earlier pass followed by a failing latest round holds back, and an explicit override completes it', async () => {
		// a Task whose status says completed still holds the Story when its latest round did not pass
		const completedTask = { ...open, [task(2)]: 'completed' } as const;
		assert.equal(await rollUp(STORY, reader({}, completedTask), evidence([task(1)], clean, both)), undefined);
		assert.equal(await rollUp(STORY, reader({}, completedTask), evidence([task(1)], clean, { ...both, ...overridden })), 'completed');
	});

	it('rollUp for STORY: a listed Task with no head holds back', async () => {
		assert.equal(await rollUp(STORY, reader({}, { [task(1)]: 'approved' }), evidence([task(1), task(2)], clean, both)), undefined);
	});

	it('rollUp for STORY: an approved PLAN with no TASKS head holds back', async () => {
		const notCreated: Partial<CompletionEvidence> = { storyTasks: async () => ({ kind: 'not-created' }) };
		assert.equal(await rollUp(STORY, reader({}, open), evidence([task(1), task(2)], clean, notCreated)), undefined);
		assert.equal(await rollUp(STORY, reader({}, open), evidence([task(1), task(2)], clean, { ...notCreated, ...overridden })), 'completed');
	});

	it('rollUp for STORY: a Story with no PLAN and no Tasks completes', async () => {
		assert.equal(await rollUp(STORY, reader({}, {}), evidence([], clean)), 'completed');
	});

	it('rollUp for STORY: a listed withdrawn or superseded Task is not counted', async () => {
		const closed = { [task(1)]: 'withdrawn', [task(2)]: 'superseded' } as const;
		assert.equal(await rollUp(STORY, reader({}, closed), evidence([], clean, both)), 'completed');
	});

	it('rollUp for STORY: a clean review is not an override', async () => {
		assert.equal(await rollUp(STORY, reader({}, open), evidence([task(1)], clean, both)), undefined);
	});

	it('rollUp for EPIC: a declared Story without a terminal head holds it', async () => {
		const s2 = `STORY-${H}-s2`;
		const kids = { [EPIC]: [STORY] };
		const declared: Partial<CompletionEvidence> = { declaredStories: async () => ['s1', 's2'] };
		assert.equal(await rollUp(EPIC, reader(kids, { [STORY]: 'completed' }), evidence([], clean, declared)), undefined, 'no head');
		assert.equal(await rollUp(EPIC, reader(kids, { [STORY]: 'completed', [s2]: 'approved' }), evidence([], clean, declared)), undefined, 'still open');
		assert.equal(await rollUp(EPIC, reader(kids, { [STORY]: 'completed', [s2]: 'withdrawn' }), evidence([], clean, declared)), 'completed', 'withdrawn counts as settled');
	});

	it('rollUp for EPIC: an Epic with no DEF rolls up from its counted Stories', async () => {
		assert.equal(await rollUp(EPIC, reader({ [EPIC]: [STORY] }, { [STORY]: 'completed' }), evidence([], clean)), 'completed');
		assert.equal(await rollUp(EPIC, reader({ [EPIC]: [STORY] }, { [STORY]: 'approved' }), evidence([], clean)), undefined);
	});
});
