/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * P0 acceptance test -- skeleton + factory dispatch.
 *
 * Verifies the structural contract of `shaperFor`:
 *   - returns a Shaper with the right method set per (mode, target)
 *   - rejects task-mode with target='generic' (task family namespace dispatch)
 *   - rejects 'run' / 'task' modes without a target argument
 *   - CONTRACT_FOOTER_MD is present + non-empty
 *   - PROMPT_PATHS has the expected five entries
 *
 * No LLM, no I/O, no Ollama dependency. Pure structural test.
 *
 * Earlier revisions of this file also asserted "stub throws on call".
 * Once P3 wired the real driver and P5 added the prompt files, that
 * assertion stopped being meaningful (the driver no longer throws a
 * stub-message; it makes a real Ollama call). End-to-end behaviour is
 * now covered by driver.live.test.ts + the per-shaper live tests.
 *
 * Run:
 *   npx tsx --test src/insrc/analyze/context/__tests__/p0-skeleton.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	CONTRACT_FOOTER_MD,
	PROMPT_PATHS,
	shaperFor,
} from '../../index.js';

// ---------------------------------------------------------------------------
// Contract footer
// ---------------------------------------------------------------------------

test('CONTRACT_FOOTER_MD is non-empty and references the three citation kinds', () => {
	assert.ok(CONTRACT_FOOTER_MD.length > 0);
	assert.match(CONTRACT_FOOTER_MD, /kind:\s*'source'/);
	assert.match(CONTRACT_FOOTER_MD, /kind:\s*'entity'/);
	assert.match(CONTRACT_FOOTER_MD, /kind:\s*'doc'/);
});

// ---------------------------------------------------------------------------
// PROMPT_PATHS catalog
// ---------------------------------------------------------------------------

test('PROMPT_PATHS has exactly the six expected shapers', () => {
	// docs was added when the docs-target shaper landed (Phase 2 of
	// plans/exploration-based-context-build.md); the six-key expectation
	// includes it alongside the five originals.
	const keys = Object.keys(PROMPT_PATHS).sort();
	assert.deepEqual(keys, ['classification', 'code', 'data', 'docs', 'generic', 'infra']);
});

test('PROMPT_PATHS values point at prompts/analyze/<shaper>.system.md', () => {
	for (const [shaperId, path] of Object.entries(PROMPT_PATHS)) {
		assert.equal(path, `prompts/analyze/${shaperId}.system.md`);
	}
});

// ---------------------------------------------------------------------------
// shaperFor -- classification
// ---------------------------------------------------------------------------

test("shaperFor('classification') returns a Shaper with buildClassificationBundle", () => {
	const shaper = shaperFor('classification');
	assert.equal(typeof shaper.buildClassificationBundle, 'function');
});

// (P0 had a "stub throws on call" test here; once P3 wired the real
// driver and P5 added the prompt files, the failure mode shifted from
// 'stub' -> 'ShaperPromptMissingError' -> 'real Ollama invocation'.
// End-to-end behaviour is now covered by driver.live.test.ts and the
// per-shaper live tests; what remains valuable here is the structural
// factory contract (return type + method presence), which the
// individual cases below pin.)

// ---------------------------------------------------------------------------
// shaperFor -- run-mode
// ---------------------------------------------------------------------------

for (const target of ['code', 'data', 'infra', 'generic'] as const) {
	test(`shaperFor('run', '${target}') returns a Shaper with buildRunBundle`, () => {
		const shaper = shaperFor('run', target);
		assert.equal(typeof shaper.buildRunBundle, 'function');
	});

	// (see classification note above; end-to-end behaviour covered
	// elsewhere)
}

test("shaperFor('run') without a target throws TypeError", () => {
	assert.throws(
		// @ts-expect-error -- deliberately bypass overload signature
		() => shaperFor('run'),
		{ name: 'TypeError', message: /target is required/ },
	);
});

// ---------------------------------------------------------------------------
// shaperFor -- task-mode
// ---------------------------------------------------------------------------

for (const target of ['code', 'data', 'infra'] as const) {
	test(`shaperFor('task', '${target}') returns a Shaper with buildTaskBundle`, () => {
		const shaper = shaperFor('task', target);
		assert.equal(typeof shaper.buildTaskBundle, 'function');
	});

	// (see classification note above; end-to-end behaviour covered
	// elsewhere)
}

test("shaperFor('task') without a target throws TypeError", () => {
	assert.throws(
		// @ts-expect-error -- deliberately bypass overload signature
		() => shaperFor('task'),
		{ name: 'TypeError', message: /target is required/ },
	);
});

test("shaperFor('task', 'generic') is rejected", () => {
	assert.throws(
		// @ts-expect-error -- deliberately bypass overload signature
		() => shaperFor('task', 'generic'),
		{ name: 'TypeError', message: /generic is invalid at task scope/ },
	);
});
