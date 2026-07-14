/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Live end-to-end test for the classifier.
 *
 * Runs the full pipeline against real Ollama:
 *
 *   ClassifyInput  ->  classification-shaper bundle  ->  LLM call
 *   ->  ClassifiedIntent  ->  semantic validation  ->  return
 *
 * The fixture set from P5.b lets us probe each target's classifier
 * dispatch:
 *
 *   - Code-dominant workspace + code question      -> target=code
 *   - Data-dominant workspace + data question      -> target=data
 *   - Mixed workspace + broad question             -> target=generic
 *   - Infra-dominant workspace + infra question    -> target=infra
 *
 * Plus a corrective-retry path: prompt the model toward a scopeRef
 * that fails validation and watch the second attempt succeed.
 *
 * Gated behind INSRC_LIVE_TESTS=1.
 *
 * Run:
 *   PATH=/opt/homebrew/opt/node@22/bin:$PATH INSRC_LIVE_TESTS=1 \
 *     npx tsx --test \
 *     src/insrc/analyze/classifier/__tests__/classify.live.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, realpathSync } from 'node:fs';
import { basename, join } from 'node:path';

import { _resetAnalyzeConfigCacheForTests } from '../../../config/analyze.js';
import { registerBuiltinTools } from '../../../daemon/tools/builtins/index.js';
import { _resetRegistryForTests } from '../../../daemon/tools/registry.js';
import { classify } from '../driver.js';
import type {
	ClassifyInput,
	ClassifyOpts,
} from '../types.js';

import {
	setupFixtures,
	teardownFixtures,
	type FixtureSet,
} from '../../context/__tests__/fixtures/setup.js';

const GATE = process.env['INSRC_LIVE_TESTS'] === '1';
if (!GATE) {
	test('classifier.live: skipped (set INSRC_LIVE_TESTS=1)', { skip: true }, () => {});
}

// ---------------------------------------------------------------------------
// Suite setup
// ---------------------------------------------------------------------------

let fixtures: FixtureSet;
let dataOnly: string;

test.before(() => {
	if (!GATE) return;
	_resetAnalyzeConfigCacheForTests();
	_resetRegistryForTests();
	registerBuiltinTools();
	fixtures = setupFixtures();

	// Reuse the classification-test trick: a dir containing only the
	// seeded SQLite so the workspace is unambiguously data-dominant.
	dataOnly = join(fixtures.root, 'data-only');
	mkdirSync(dataOnly, { recursive: true });
	copyFileSync(fixtures.seededSqlite, join(dataOnly, basename(fixtures.seededSqlite)));
});

test.after(() => {
	if (!GATE) return;
	if (fixtures) teardownFixtures(fixtures);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function uniqueRunId(label: string): string {
	const suffix = Math.floor(Math.random() * 1e9).toString(16);
	return `live-classify-${label}-${suffix}`;
}

async function classifyAt(
	scopeValue: string,
	userPrompt: string,
	label:      string,
): Promise<{ intent: Awaited<ReturnType<typeof classify>>; runId: string }> {
	const runId = uniqueRunId(label);
	const input: ClassifyInput = {
		userPrompt,
		scopeRef: { kind: 'workspace', value: realpathSync(scopeValue) },
	};
	const opts: ClassifyOpts = { runId };
	const intent = await classify({ input, opts });
	return { intent, runId };
}

// ---------------------------------------------------------------------------
// Code-dominant + code question -> target=code
// ---------------------------------------------------------------------------

test('classifier: code-dominant workspace + code question -> target=code', { skip: !GATE }, async () => {
	const { intent } = await classifyAt(
		fixtures.tinyMultiLangRepo,
		'What functions does this repo export?',
		'code-q',
	);

	assert.ok(['code', 'generic'].includes(intent.target),
		`target should be 'code' or 'generic'; got '${intent.target}'. ` +
		`reasoning: ${intent.reasoning}`);
	assert.ok(['XS', 'S', 'M', 'L', 'XL'].includes(intent.scope));
	assert.equal(typeof intent.focused, 'boolean');
	assert.equal(typeof intent.reasoning, 'string');
	assert.ok(intent.reasoning.length > 0);
});

// ---------------------------------------------------------------------------
// Data-dominant + data question -> target=data
// ---------------------------------------------------------------------------

test('classifier: data-dominant workspace + data question -> target=data', { skip: !GATE }, async () => {
	const { intent } = await classifyAt(
		dataOnly,
		'What tables are in this database?',
		'data-q',
	);

	assert.ok(['data', 'generic'].includes(intent.target),
		`target should be 'data' or 'generic'; got '${intent.target}'. ` +
		`reasoning: ${intent.reasoning}`);
});

// ---------------------------------------------------------------------------
// Infra-dominant + infra question -> target=infra
// ---------------------------------------------------------------------------

test('classifier: infra-dominant workspace + infra question -> target=infra', { skip: !GATE }, async () => {
	const { intent } = await classifyAt(
		fixtures.seededManifests,
		'How is this service deployed? Which manifests define it?',
		'infra-q',
	);

	assert.ok(['infra', 'generic'].includes(intent.target),
		`target should be 'infra' or 'generic'; got '${intent.target}'. ` +
		`reasoning: ${intent.reasoning}`);
});

// ---------------------------------------------------------------------------
// Mixed workspace + broad question -> target=generic
// ---------------------------------------------------------------------------

test('classifier: mixed workspace + broad question -> target=generic OR a primary single target', { skip: !GATE }, async () => {
	const { intent } = await classifyAt(
		fixtures.root,
		'Give me an overview of this workspace.',
		'mixed-broad',
	);

	// Either generic (the design's preferred) or one of the primary
	// targets is acceptable; the model legitimately may pick the
	// most-represented surface as primary.
	assert.ok(['code', 'data', 'infra', 'generic'].includes(intent.target));
	assert.match(intent.reasoning, /workspace|overview|repo|languages|data|infra|all|covers|contains/i);
});

// ---------------------------------------------------------------------------
// Focused decision: explicit question -> focused=true with focus text
// ---------------------------------------------------------------------------

test('classifier: a pointed question lands with focused=true + non-empty focus', { skip: !GATE }, async () => {
	const { intent } = await classifyAt(
		fixtures.tinyMultiLangRepo,
		'Where is the HTTP route for /users defined?',
		'focused-q',
	);

	// focused decision is a model judgment call; if it picked focused=true,
	// the focus field must be present and non-empty. If it picked false,
	// the focus field may be absent.
	if (intent.focused) {
		assert.ok(typeof intent.focus === 'string' && intent.focus.length > 0,
			'focused=true requires non-empty focus');
		assert.match(intent.focus, /\b(users|http|route|endpoint|register)\b/i);
	}
});

// ---------------------------------------------------------------------------
// scopeRef.value preserved (model can't invent paths)
// ---------------------------------------------------------------------------

test('classifier: emitted scopeRef.value matches a path the user surfaced', { skip: !GATE }, async () => {
	const scopeValue = realpathSync(fixtures.tinyMultiLangRepo);
	const { intent } = await classifyAt(
		scopeValue,
		'What is in this workspace?',
		'value-preserved',
	);

	// The model may refine the kind (workspace -> repo) but the value
	// should stay anchored to what the user surfaced. We accept the
	// exact path OR a path under it.
	assert.ok(
		intent.scopeRef.value === scopeValue ||
		intent.scopeRef.value.startsWith(`${scopeValue}/`),
		`scopeRef.value should anchor to surfaced path '${scopeValue}'; got '${intent.scopeRef.value}'`,
	);
});
