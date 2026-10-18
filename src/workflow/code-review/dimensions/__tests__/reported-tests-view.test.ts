/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-11e2b8a7 — the coverage judge sees a promised smoke or live test's
 * builder-reported result: testRecordView lists it (latest run per name, a fail
 * winning a tie), and the coverage prompt tells the judge to grade the promised
 * test against it. With no reported result the view and the prompt are as before.
 *
 * Run: npx tsx --test src/workflow/code-review/dimensions/__tests__/reported-tests-view.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { testRecordView } from '../test-record-view.js';
import { buildCoveragePrompt } from '../coverage.js';
import type { CodeReviewSubject } from '../../types.js';

const SMOKE = 'docs/standalone/x/S001/smoke.md';
const T1 = '2026-10-18T10:00:00.000Z';
const T2 = '2026-10-18T11:00:00.000Z';

const named = (name: string, reported?: unknown) => ({ name, source: 'mapping', cases: [], files: [], ...(reported !== undefined ? { reported } : {}) });
const task = (taskId: string, ranAt: string | undefined, tests: readonly unknown[]) =>
	({ taskId, ...(ranAt !== undefined ? { ranAt } : {}), testsPassed: true, tests, files: [] });

const subject = (tasks: readonly unknown[]): CodeReviewSubject => ({
	repoPath: '/repo', epicHash: 'e', storyId: 'S001', changedFiles: ['src/a.ts'],
	approvedLld: null,
	approvedPlan: { body: { tasks: [{ tests: [{ level: 'smoke', name: SMOKE }] }] } } as unknown as CodeReviewSubject['approvedPlan'],
	buildRecord: null,
	testRecord: { meta: {}, body: { tasks } } as unknown as CodeReviewSubject['testRecord'],
});

test('the test-record view lists each builder-reported named test from its latest run, a fail winning a tie, and omits the list when there is none', () => {
	const view = testRecordView(subject([
		task('t1', T1, [named(SMOKE, { result: 'fail', evidence: 'first try' }), named('live: x', { result: 'pass', evidence: 'log.txt' })]),
		task('t9', T2, [named(SMOKE, { result: 'pass', evidence: 'smoke.md#ship' }), named('unit: y')]),
		task('t3', undefined, [named(SMOKE, { result: 'pass', evidence: 'no time' })]),
		task('t4', T2, [named('live: x', { result: 'pass', evidence: 'tie pass' }), named('live: x', { result: 'fail', evidence: 'tie' })]),
		task('t5', T1, [named('bad', { result: 'maybe', evidence: 'x' }), named('bad2', { result: 'pass' }), 'garbage']),
	]));
	assert.deepEqual(view?.reportedTests, [
		{ name: SMOKE, result: 'pass', evidence: 'smoke.md#ship', source: 'reported by the builder, not run by the gate', decidedBy: { taskId: 't9', ranAt: T2 } },
		{ name: 'live: x', result: 'fail', evidence: 'tie', source: 'reported by the builder, not run by the gate', decidedBy: { taskId: 't4', ranAt: T2 } },
	].sort((a, b) => a.name.localeCompare(b.name)));

	const none = testRecordView(subject([task('t1', T1, [named('unit: y')])]));
	assert.ok(none !== null);
	assert.equal('reportedTests' in none, false, 'no reported result: the view has no reportedTests key');
});

test('the coverage prompt grades a promised smoke test against its reported result, and is unchanged with none reported', () => {
	const withReport = buildCoveragePrompt(subject([task('t9', T2, [named(SMOKE, { result: 'pass', evidence: 'smoke.md#ship' })])]), { symbols: [] }, undefined);
	const sys = withReport.find(m => m.role === 'system')!.content as string;
	const user = withReport.find(m => m.role === 'user')!.content as string;
	assert.ok(sys.includes('a reported pass means the test is present and passed as reported by the builder'), 'the rule is in the system prompt');
	assert.ok(user.includes('"reportedTests"') && user.includes('"evidence": "smoke.md#ship"'), 'the reported result is in the test-record section');

	const without = buildCoveragePrompt(subject([task('t1', T1, [named('unit: y')])]), { symbols: [] }, undefined);
	for (const m of without) assert.ok(!(m.content as string).includes('reportedTests'), `${m.role}: no reportedTests text when none was reported`);
});
