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

import { artifactJsonPath, lldArtifactId } from '../../storage.js';
import type { PortResult } from '../port.js';
import type { UnitRef } from '../refs.js';
import { runUnitExtras, type ExtraName, type ExtraStep } from '../unit-issue.js';

const HASH = 'a3f4b8c9d1e2f3a4';
const AT = '2026-10-18T10:00:00.000Z';
const OK: PortResult<void> = { ok: true, value: undefined };

function withStory(fn: (unit: UnitRef, marks: () => Record<string, string>) => void): void {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-unit-extras-'));
	try {
		mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
		const path = artifactJsonPath(repo, lldArtifactId(HASH, 's1'));
		writeFileSync(path, JSON.stringify({
			meta: { workflow: 'design.story', epicHash: HASH, storyId: 's1', tracker: { adapter: 'github', units: { 'story:s1': { unit: 'story', unitId: 's1', issue: 'acme/demo#8', createdAtRevision: 1 } } } },
			body: {}, citations: [],
		}));
		const marks = (): Record<string, string> => JSON.parse(readFileSync(path, 'utf8')).meta.tracker.units['story:s1'].extrasDone ?? {};
		fn({ unit: 'story', repoPath: repo, epicHash: HASH, storyId: 's1' }, marks);
	} finally { rmSync(repo, { recursive: true, force: true }); }
}

function steps(posted: string[], failing: ExtraName[] = []): ExtraStep[] {
	return (['taskList', 'designComment', 'reviewComment'] as ExtraName[]).map(name => ({
		name,
		run: (): PortResult<void> => {
			if (failing.includes(name)) return { ok: false, reason: `${name} rejected`, kind: 'rejected' };
			posted.push(name); return OK;
		},
	}));
}

test('runUnitExtras marks, skips, reports failures, retries only missing steps and repeats only after a marker failure', () => {
	withStory((unit, marks) => {
		// each step runs on its own and is marked; a failed step is reported and unmarked
		const posted: string[] = [];
		const first = runUnitExtras(unit, steps(posted, ['taskList']), { now: () => AT });
		assert.deepEqual(first, { done: ['designComment', 'reviewComment'], skipped: [], failed: [{ name: 'taskList', reason: 'taskList rejected' }] });
		assert.deepEqual(marks(), { designComment: AT, reviewComment: AT });

		// a second run posts only the missing extra; marked steps are skipped
		const again: string[] = [];
		const second = runUnitExtras(unit, steps(again), { now: () => AT });
		assert.deepEqual(again, ['taskList']);
		assert.deepEqual(second, { done: ['taskList'], skipped: ['designComment', 'reviewComment'], failed: [] });
		assert.deepEqual(Object.keys(marks()).sort(), ['designComment', 'reviewComment', 'taskList']);

		// a third run posts nothing
		const third: string[] = [];
		assert.deepEqual(runUnitExtras(unit, steps(third), { now: () => AT }).done, []);
		assert.deepEqual(third, []);
	});

	withStory((unit, marks) => {
		// the residual: the mark write fails after a successful post, so the next run posts that step again
		const posted: string[] = [];
		const failMark = (): void => { throw new Error('disk full'); };
		const one = runUnitExtras(unit, steps(posted), { now: () => AT, mark: failMark });
		assert.deepEqual(one.done, []);
		assert.deepEqual(one.failed.map(f => f.name), ['taskList', 'designComment', 'reviewComment'], 'posted but unmarked is reported, not success');
		assert.deepEqual(posted, ['taskList', 'designComment', 'reviewComment'], 'each was posted once');
		assert.deepEqual(marks(), {});
		const again: string[] = [];
		runUnitExtras(unit, steps(again), { now: () => AT });
		assert.deepEqual(again, ['taskList', 'designComment', 'reviewComment']);
		assert.deepEqual(Object.keys(marks()).length, 3);
	});

	// no step goes through bestEffort
	const src = readFileSync(fileURLToPath(new URL('../unit-issue.js', import.meta.url).href.replace(/\.js$/, '.ts')), 'utf8');
	assert.doesNotMatch(src, /import[^;]*\bbestEffort\b|\bbestEffort\s*\(/);
});
