/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for the `build` stage's registration + discoverability
 * (Story s1, ac1 + ac3).
 *
 *   ac1 — 'build' enumerates as a first-class stage in WORKFLOW_NAMES,
 *         positioned between 'plan' and the first 'tracker.*' entry,
 *         exactly once, no gaps or duplicates.
 *   ac3 — registerBuildRunners() adds build/<id> StepRunners tagged
 *         workflow:'build' via the executor registry, is idempotent, and
 *         leaves sibling stages' registry entries unchanged.
 *
 * Run: npx tsx --test src/workflow/__tests__/build-runners.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { WORKFLOW_NAMES } from '../types.js';
import { hasRunner, getRunner } from '../executor.js';
import { registerBuildRunners } from '../runners/build/index.js';
import { registerWorkflowRunners } from '../index.js';

// ---------------------------------------------------------------------------
// ac1 — discoverability in WORKFLOW_NAMES
// ---------------------------------------------------------------------------

test("ac1: 'build' is in WORKFLOW_NAMES exactly once, between 'plan' and the 'tracker.*' entries", () => {
	const names = WORKFLOW_NAMES as readonly string[];
	const occurrences = names.filter(n => n === 'build');
	assert.equal(occurrences.length, 1, `expected 'build' exactly once, got ${occurrences.length}`);
	const planIdx    = names.indexOf('plan');
	const buildIdx   = names.indexOf('build');
	const trackerIdx = names.indexOf('tracker.push');
	assert.ok(planIdx >= 0 && trackerIdx >= 0, 'plan / tracker.push must be present');
	assert.ok(buildIdx > planIdx, "'build' must come after 'plan'");
	assert.ok(buildIdx < trackerIdx, "'build' must come before the 'tracker.*' entries");
});

test("ac1: 'build' enumerates alongside its sibling doc-producing stages", () => {
	const names = WORKFLOW_NAMES as readonly string[];
	for (const sibling of ['define', 'design.epic', 'design.story', 'plan', 'build']) {
		assert.ok(names.includes(sibling), `WORKFLOW_NAMES missing '${sibling}'`);
	}
});

// ---------------------------------------------------------------------------
// ac3 — registration + idempotency + siblings untouched
// ---------------------------------------------------------------------------

test("ac3: registerBuildRunners() adds build/<id> StepRunners tagged workflow:'build'", () => {
	registerBuildRunners();
	for (const id of ['context.assemble', 'tasks.implement']) {
		assert.ok(hasRunner('build', id), `build/${id} not registered`);
		const runner = getRunner('build', id);
		assert.equal(runner.workflow, 'build', `build/${id} not tagged workflow:'build'`);
		assert.equal(runner.id, id);
	}
});

test('ac3: registerBuildRunners() is idempotent — a repeat call is a silent no-op (no throw, no duplicate)', () => {
	registerBuildRunners();
	// Second + third invocations must not throw (registerRunner throws on a
	// duplicate key; the module-level `registered` guard prevents re-entry).
	assert.doesNotThrow(() => { registerBuildRunners(); registerBuildRunners(); });
	assert.ok(hasRunner('build', 'context.assemble'));
});

test('ac3: registerWorkflowRunners() wires build alongside its siblings, leaving them registered', () => {
	registerWorkflowRunners();
	// build resolvable...
	assert.ok(hasRunner('build', 'context.assemble'));
	assert.ok(hasRunner('build', 'tasks.implement'));
	// ...and every sibling stage's runners still register (unchanged by the addition).
	assert.ok(hasRunner('plan', 'context.assemble'));
	assert.ok(hasRunner('plan', 'tasks.enumerate'));
	assert.ok(hasRunner('design.story', 'context.assemble'));
	assert.ok(hasRunner('define', 'scope.assess'));
	// idempotent + order-independent: a repeat call registers nothing twice.
	assert.doesNotThrow(() => registerWorkflowRunners());
});
