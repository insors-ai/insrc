/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The team-mode approve-time extras runner (sc3): each extra is its own step,
 * marked in the unit's record when it succeeds.
 *
 * Run: npx tsx --test src/workflow/tracker/__tests__/unit-extras.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { artifactJsonPath } from '../../storage.js';
import type { PortResult, TrackerComment } from '../port.js';
import type { UnitRef } from '../refs.js';
import { runUnitExtras, type ExtraName, type ExtraStep } from '../unit-issue.js';

const HASH = 'a3f4b8c9d1e2f3a4';
const AT = '2026-10-18T10:00:00.000Z';
const OK: PortResult<void> = { ok: true, value: undefined };

function withStory(fn: (unit: UnitRef, marks: () => Record<string, string>) => void): void {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-unit-extras-'));
	try {
		mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
		const path = artifactJsonPath(repo, `STORY-${HASH}-s1`);
		writeFileSync(path, JSON.stringify({
			meta: { workflow: 'design.story', epicHash: HASH, storyId: 's1', envelope: { binding: { reference: { entityId: 'acme/demo#8', type: 'github:issue', relation: 'tracked-by' }, createdAtRevision: 1, posted: [] } } },
			body: {}, citations: [],
		}));
		const NAME: Record<string, string> = { 'task-list': 'taskList', design: 'designComment', review: 'reviewComment', plan: 'planComment', milestone: 'milestone' };
		// what the binding records as posted, by the extra's name (s6: binding.posted replaces extrasDone)
		const marks = (): Record<string, string> => Object.fromEntries((JSON.parse(readFileSync(path, 'utf8')).meta.envelope.binding.posted as Array<{ kind: string; at: string }>).map(p => [NAME[p.kind]!, p.at]));
		fn({ unit: 'story', repoPath: repo, epicHash: HASH, storyId: 's1' }, marks);
	} finally { rmSync(repo, { recursive: true, force: true }); }
}

const marker = (name: ExtraName): string => `<!-- insrc:post:STORY-${HASH}-s1:${name === 'designComment' ? 'design' : name === 'reviewComment' ? 'review' : 'task-list'} -->`;

/** The unit's issue as a thread of comments: each comment step posts its marker into it, and the lister reads it back. */
function thread() {
	const comments: TrackerComment[] = [];
	return { comments, lists: { n: 0, fail: false } };
}

function steps(posted: string[], failing: ExtraName[] = [], t = thread()): ExtraStep[] {
	return (['taskList', 'designComment', 'reviewComment'] as ExtraName[]).map(name => ({
		name,
		...(name === 'taskList' ? {} : { marker: marker(name) }),
		run: (): PortResult<void> => {
			if (failing.includes(name)) return { ok: false, reason: `${name} rejected`, kind: 'rejected' };
			posted.push(name);
			if (name !== 'taskList') t.comments.push({ externalId: String(900 + t.comments.length), author: 'insrc', text: `${marker(name)}\nbody`, at: AT });
			return OK;
		},
	}));
}
const lister = (t: ReturnType<typeof thread>) => (): PortResult<TrackerComment[]> => { t.lists.n += 1; return t.lists.fail ? { ok: false, reason: 'offline', kind: 'unreachable' } : { ok: true, value: t.comments }; };

test('runUnitExtras skips a kind already in the binding, reconciles a comment step through its marker without posting, reads the comment list once for several steps, fails a step when the list cannot be read, and reports a post whose record failed so the next run reconciles it', () => {
	withStory((unit, marks) => {
		// each step runs on its own and is recorded; a failed step is reported and unrecorded
		const t = thread();
		const posted: string[] = [];
		const first = runUnitExtras(unit, steps(posted, ['taskList'], t), { now: () => AT, comments: lister(t) });
		assert.deepEqual(first, { done: ['designComment', 'reviewComment'], skipped: [], reconciled: [], failed: [{ name: 'taskList', reason: 'taskList rejected' }] });
		assert.deepEqual(marks(), { designComment: AT, reviewComment: AT });
		assert.equal(t.lists.n, 1, 'the comment list is read once for the two comment steps');

		// a kind already in the binding is skipped with no read; only the missing step posts
		const again: string[] = [];
		t.lists.n = 0;
		const second = runUnitExtras(unit, steps(again, [], t), { now: () => AT, comments: lister(t) });
		assert.deepEqual(again, ['taskList']);
		assert.deepEqual(second, { done: ['taskList'], skipped: ['designComment', 'reviewComment'], reconciled: [], failed: [] });
		assert.equal(t.lists.n, 0, 'nothing to look for: no read');
		assert.deepEqual(Object.keys(marks()).sort(), ['designComment', 'reviewComment', 'taskList']);
		const third: string[] = [];
		assert.deepEqual(runUnitExtras(unit, steps(third, [], t), { now: () => AT, comments: lister(t) }).done, []);
		assert.deepEqual(third, []);
	});

	withStory((unit, marks) => {
		// the design comment is already on the issue (a post whose record was lost): recorded as reconciled, not posted; the review is posted
		const t = thread();
		t.comments.push({ externalId: '555', author: 'insrc', text: `${marker('designComment')}\nearlier`, at: AT });
		const posted: string[] = [];
		const out = runUnitExtras(unit, steps(posted, [], t), { now: () => AT, comments: lister(t) });
		assert.deepEqual(out, { done: ['taskList', 'reviewComment'], skipped: [], reconciled: ['designComment'], failed: [] });
		assert.deepEqual(posted, ['taskList', 'reviewComment'], 'the design comment was not posted again');
		assert.equal(t.lists.n, 1, 'one read for both comment steps');
		assert.equal(marks()['designComment'], AT);
	});

	withStory((unit, marks) => {
		// a list that cannot be read fails the comment steps and posts nothing for them; the task list still runs (it carries no marker)
		const t = thread();
		t.lists.fail = true;
		const posted: string[] = [];
		const out = runUnitExtras(unit, steps(posted, [], t), { now: () => AT, comments: lister(t) });
		assert.deepEqual(posted, ['taskList']);
		assert.deepEqual(out.done, ['taskList']);
		assert.deepEqual(out.failed.map(f => f.name), ['designComment', 'reviewComment']);
		assert.match(out.failed[0]!.reason, /could not be read \(unreachable\): offline/);
		assert.deepEqual(Object.keys(marks()), ['taskList'], 'nothing was recorded for a post that was not made');
		// no lister at all is the same: a comment step is never posted blind
		const none = runUnitExtras(unit, steps([], [], t), { now: () => AT });
		assert.deepEqual(none.failed.map(f => f.name), ['designComment', 'reviewComment']);
	});

	withStory((unit, marks) => {
		// a post whose record failed is reported; the next run finds it by its marker and does not post it again
		const t = thread();
		const posted: string[] = [];
		const failMark = (): void => { throw new Error('disk full'); };
		const one = runUnitExtras(unit, steps(posted, [], t), { now: () => AT, mark: failMark, comments: lister(t) });
		assert.deepEqual(one.done, []);
		assert.deepEqual(one.failed.map(f => f.name), ['taskList', 'designComment', 'reviewComment'], 'posted but unrecorded is reported, not success');
		assert.deepEqual(posted, ['taskList', 'designComment', 'reviewComment'], 'each was posted once');
		assert.deepEqual(marks(), {});
		const again: string[] = [];
		const two = runUnitExtras(unit, steps(again, [], t), { now: () => AT, comments: lister(t) });
		assert.deepEqual(two.reconciled, ['designComment', 'reviewComment'], 'found by their markers and recorded');
		assert.deepEqual(again, ['taskList'], 'only the step with no marker is run again (it is idempotent on the tracker)');
		assert.deepEqual(Object.keys(marks()).sort(), ['designComment', 'reviewComment', 'taskList']);
	});

	// no step goes through bestEffort
	const src = readFileSync(fileURLToPath(new URL('../unit-issue.js', import.meta.url).href.replace(/\.js$/, '.ts')), 'utf8');
	assert.doesNotMatch(src, /import[^;]*\bbestEffort\b|\bbestEffort\s*\(/);
	assert.doesNotMatch(src, /extrasDone/, 'extrasDone is gone');
});
