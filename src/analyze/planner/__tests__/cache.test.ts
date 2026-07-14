/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Plan persistence tests -- pure file I/O against per-test unique
 * run-ids under PATHS.analyzeRun(runId).
 *
 * Covers:
 *   - Path computation for root vs child vs nested-child plans
 *   - Per-attempt + per-feedback + final writes
 *   - readPlanFinal returns null on miss
 *   - Atomic writes leave no .tmp- leftovers
 *   - purgePlan cleans the (runId, parentTaskPath?) slot
 *
 * Run:
 *   npx tsx --test src/insrc/analyze/planner/__tests__/cache.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

import {
	planAttemptPathFor,
	planAttemptsDirFor,
	planDirFor,
	planFeedbackPathFor,
	planFinalPathFor,
	purgePlan,
	readPlanFinal,
	writeAttempt,
	writeFeedback,
	writePlanFinal,
} from '../cache.js';
import type { PlanTask } from '../types.js';
import type { PlanValidationFailure } from '../validate.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function uniqueRunId(label: string): string {
	const suffix = Math.floor(Math.random() * 1e9).toString(16);
	return `cache-test-${label}-${suffix}`;
}

function mkPlan(over: Partial<PlanTask> = {}): PlanTask {
	return {
		planId:    'p-root',
		goal:      'happy path fixture',
		target:    'code',
		scope:     'M',
		reasoning: 'M-bucket plan: discovery + per-module summary + aggregator (test fixture)',
		tasks:     [
			{
				taskId:    't01',
				template:  'code.discovery.modules',
				kind:      'leaf',
				params:    {},
				produces:  ['modules'],
				rationale: 'enumerate modules for downstream summary tasks',
			},
		],
		...over,
	};
}

function mkFailure(): PlanValidationFailure {
	return { invariantId: 'INV-1', message: 'tasks list must be non-empty' };
}

// ---------------------------------------------------------------------------
// Path computation
// ---------------------------------------------------------------------------

test('planDirFor: root plan -> ~/.insrc/analyze/<runId>', () => {
	const dir = planDirFor({ runId: 'run-a' });
	assert.match(dir, /[/\\]analyze[/\\]run-a$/);
});

test('planDirFor: child plan for t02 -> tasks/t02', () => {
	const dir = planDirFor({ runId: 'run-a', parentTaskPath: 't02' });
	assert.match(dir, /[/\\]analyze[/\\]run-a[/\\]tasks[/\\]t02$/);
});

test('planDirFor: nested child plan for t02.t05 -> tasks/t02/tasks/t02.t05', () => {
	const dir = planDirFor({ runId: 'run-a', parentTaskPath: 't02.t05' });
	assert.match(dir, /[/\\]analyze[/\\]run-a[/\\]tasks[/\\]t02[/\\]tasks[/\\]t02\.t05$/);
});

test('planDirFor: deeply nested t02.t05.t01 -> three nested tasks/ dirs', () => {
	const dir = planDirFor({ runId: 'run-a', parentTaskPath: 't02.t05.t01' });
	assert.match(dir, /tasks[/\\]t02[/\\]tasks[/\\]t02\.t05[/\\]tasks[/\\]t02\.t05\.t01$/);
});

test('planFinalPathFor: root -> plan.json under run dir', () => {
	const path = planFinalPathFor({ runId: 'run-a' });
	assert.match(path, /[/\\]run-a[/\\]plan\.json$/);
});

test('planAttemptPathFor + planFeedbackPathFor: zero-padded N-digit naming', () => {
	const aPath = planAttemptPathFor({ runId: 'run-a' }, 7);
	const fPath = planFeedbackPathFor({ runId: 'run-a' }, 7);
	assert.match(aPath, /plan\.attempts[/\\]07\.plan\.json$/);
	assert.match(fPath, /plan\.attempts[/\\]07\.feedback\.json$/);
});

test('planAttemptPathFor: 10 doesn\'t zero-pad', () => {
	const path = planAttemptPathFor({ runId: 'run-a' }, 10);
	assert.match(path, /plan\.attempts[/\\]10\.plan\.json$/);
});

// ---------------------------------------------------------------------------
// Read miss
// ---------------------------------------------------------------------------

test('readPlanFinal: miss returns null', () => {
	const runId = uniqueRunId('miss');
	const r = readPlanFinal({ runId });
	assert.equal(r, null);
});

// ---------------------------------------------------------------------------
// Write + read round-trip (root plan)
// ---------------------------------------------------------------------------

test('writePlanFinal then readPlanFinal round-trips an identical plan', () => {
	const runId = uniqueRunId('final-root');
	const plan = mkPlan();
	try {
		const path = writePlanFinal({ runId }, plan);
		assert.ok(existsSync(path));
		const read = readPlanFinal({ runId });
		assert.deepEqual(read, plan);
	} finally {
		purgePlan({ runId });
	}
});

test('writePlanFinal overwrites a prior final (resume case)', () => {
	const runId = uniqueRunId('overwrite');
	try {
		writePlanFinal({ runId }, mkPlan({ goal: 'first' }));
		writePlanFinal({ runId }, mkPlan({ goal: 'second' }));
		const read = readPlanFinal({ runId });
		assert.equal(read!.goal, 'second');
	} finally {
		purgePlan({ runId });
	}
});

// ---------------------------------------------------------------------------
// Per-attempt writes
// ---------------------------------------------------------------------------

test('writeAttempt + writeFeedback land at zero-padded paths', () => {
	const runId = uniqueRunId('attempts');
	try {
		const aPath = writeAttempt({ runId }, 1, mkPlan());
		const fPath = writeFeedback({ runId }, 1, mkFailure());
		assert.ok(existsSync(aPath));
		assert.ok(existsSync(fPath));
		assert.match(aPath, /[/\\]01\.plan\.json$/);
		assert.match(fPath, /[/\\]01\.feedback\.json$/);

		const aRead = JSON.parse(readFileSync(aPath, 'utf8'));
		assert.equal(aRead.planId, 'p-root');

		const fRead = JSON.parse(readFileSync(fPath, 'utf8'));
		assert.equal(fRead.invariantId, 'INV-1');
	} finally {
		purgePlan({ runId });
	}
});

test('multiple attempts persist independently (no overwriting between attempts)', () => {
	const runId = uniqueRunId('multi');
	try {
		writeAttempt({ runId }, 1, mkPlan({ goal: 'attempt-1' }));
		writeAttempt({ runId }, 2, mkPlan({ goal: 'attempt-2' }));
		writeAttempt({ runId }, 3, mkPlan({ goal: 'attempt-3' }));
		const dir = planAttemptsDirFor({ runId });
		const files = readdirSync(dir).sort();
		assert.deepEqual(files, ['01.plan.json', '02.plan.json', '03.plan.json']);

		const a1 = JSON.parse(readFileSync(planAttemptPathFor({ runId }, 1), 'utf8'));
		const a2 = JSON.parse(readFileSync(planAttemptPathFor({ runId }, 2), 'utf8'));
		const a3 = JSON.parse(readFileSync(planAttemptPathFor({ runId }, 3), 'utf8'));
		assert.equal(a1.goal, 'attempt-1');
		assert.equal(a2.goal, 'attempt-2');
		assert.equal(a3.goal, 'attempt-3');
	} finally {
		purgePlan({ runId });
	}
});

// ---------------------------------------------------------------------------
// Child-plan layout
// ---------------------------------------------------------------------------

test('child plan persists under tasks/<parentTaskPath>/', () => {
	const runId = uniqueRunId('child');
	const child = mkPlan({ planId: 'p-t02', parentTaskPath: 't02' });
	try {
		writePlanFinal({ runId, parentTaskPath: 't02' }, child);
		const path = planFinalPathFor({ runId, parentTaskPath: 't02' });
		assert.match(path, /tasks[/\\]t02[/\\]plan\.json$/);
		assert.ok(existsSync(path));
		const read = readPlanFinal({ runId, parentTaskPath: 't02' });
		assert.equal(read?.planId, 'p-t02');

		// Root plan slot should be untouched.
		assert.equal(readPlanFinal({ runId }), null);
	} finally {
		purgePlan({ runId, parentTaskPath: 't02' });
	}
});

test('nested child plan (t02.t05) lands at the right depth', () => {
	const runId = uniqueRunId('nested');
	try {
		writePlanFinal({ runId, parentTaskPath: 't02.t05' }, mkPlan({ planId: 'p-t02.t05' }));
		const path = planFinalPathFor({ runId, parentTaskPath: 't02.t05' });
		assert.match(path, /tasks[/\\]t02[/\\]tasks[/\\]t02\.t05[/\\]plan\.json$/);
		assert.ok(existsSync(path));
	} finally {
		purgePlan({ runId, parentTaskPath: 't02.t05' });
	}
});

// ---------------------------------------------------------------------------
// Atomic write -- no .tmp- leftovers
// ---------------------------------------------------------------------------

test('writePlanFinal leaves no .tmp- file behind', () => {
	const runId = uniqueRunId('atomic');
	try {
		writePlanFinal({ runId }, mkPlan());
		const dir = planDirFor({ runId });
		const tmps = readdirSync(dir).filter(f => f.includes('.tmp-'));
		assert.deepEqual(tmps, []);
	} finally {
		purgePlan({ runId });
	}
});

// ---------------------------------------------------------------------------
// purgePlan
// ---------------------------------------------------------------------------

test('purgePlan removes plan.json + plan.attempts/ for the given slot', () => {
	const runId = uniqueRunId('purge');
	try {
		writeAttempt({ runId }, 1, mkPlan());
		writeFeedback({ runId }, 1, mkFailure());
		writePlanFinal({ runId }, mkPlan());

		const final = planFinalPathFor({ runId });
		const attempts = planAttemptsDirFor({ runId });
		assert.ok(existsSync(final));
		assert.ok(existsSync(attempts));

		purgePlan({ runId });

		assert.equal(existsSync(final), false);
		assert.equal(existsSync(attempts), false);
	} finally {
		purgePlan({ runId });
	}
});

test('purgePlan: child plan purge does NOT affect root plan', () => {
	const runId = uniqueRunId('purge-isolation');
	try {
		writePlanFinal({ runId }, mkPlan({ planId: 'root' }));
		writePlanFinal({ runId, parentTaskPath: 't02' }, mkPlan({ planId: 'child' }));

		purgePlan({ runId, parentTaskPath: 't02' });

		const root = readPlanFinal({ runId });
		assert.equal(root?.planId, 'root');
		assert.equal(readPlanFinal({ runId, parentTaskPath: 't02' }), null);
	} finally {
		purgePlan({ runId });
		purgePlan({ runId, parentTaskPath: 't02' });
	}
});
