/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Live tests for the generic-shaper.
 *
 * Drives the real Ollama against three workspace configurations and
 * asserts each row of the generic edge-case matrix (G1-G3 in
 * plans/analyze-context-builder.md):
 *
 *   G1 -- code-only workspace: code in summary; data + infra
 *         declared-absent
 *   G2 -- mixed workspace: all three surfaces (code + data + infra)
 *         positively acknowledged in summary + surface
 *   G3 -- empty workspace: bundle schema-valid; artefacts + upstream
 *         empty (per the generic prompt's contract); structure +
 *         surface either empty or declare-absent
 *
 * Gated behind INSRC_LIVE_TESTS=1.
 *
 * Run:
 *   INSRC_LIVE_TESTS=1 npx tsx --test \
 *     src/insrc/analyze/context/__tests__/generic-shaper.live.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'node:fs';

import { _resetAnalyzeConfigCacheForTests } from '../../../config/analyze.js';
import { registerBuiltinTools } from '../../../daemon/tools/builtins/index.js';
import { _resetRegistryForTests } from '../../../daemon/tools/registry.js';
import { shaperFor } from '../index.js';
import { cacheFilePathFor } from '../cache.js';
import { validateBundle } from '../schema.js';
import type {
	AnalyzeContextBundle,
	RunShapeInput,
	ShapeOpts,
} from '../types.js';
import type { ClassifiedIntent } from '../../../shared/analyze-types.js';

import { setupFixtures, teardownFixtures, type FixtureSet } from './fixtures/setup.js';

const GATE = process.env['INSRC_LIVE_TESTS'] === '1';
if (!GATE) {
	test('generic-shaper.live: skipped (set INSRC_LIVE_TESTS=1)', { skip: true }, () => {});
}

// ---------------------------------------------------------------------------
// Suite-scoped setup
// ---------------------------------------------------------------------------

let fixtures: FixtureSet;

test.before(() => {
	if (!GATE) return;
	_resetAnalyzeConfigCacheForTests();
	_resetRegistryForTests();
	registerBuiltinTools();
	fixtures = setupFixtures();
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
	return `live-generic-${label}-${suffix}`;
}

async function runGenericShaper(
	scopeValue: string,
	runId:      string,
): Promise<AnalyzeContextBundle> {
	const shaper = shaperFor('run', 'generic');
	const intent: ClassifiedIntent = {
		target:    'generic',
		scope:     'M',
		focused:   false,
		scopeRef:  { kind: 'workspace', value: scopeValue },
		reasoning: 'generic-shaper.live test fixture',
	};
	const inputs: RunShapeInput = { intent };
	const opts:   ShapeOpts     = { runId };
	return shaper.buildRunBundle(inputs, opts);
}

function cleanupRun(runId: string): void {
	const path = cacheFilePathFor(runId, { mode: 'run', hash: 'x' });
	if (existsSync(path)) {
		// eslint-disable-next-line no-empty
		try { rmSync(path); } catch {}
	}
}

/**
 * Sentence-level absence matcher (lifted from
 * classification-shaper.live.test.ts; same rationale).
 */
function declaresAbsent(haystack: string, family: RegExp): boolean {
	const lower = haystack.toLowerCase();
	if (!family.test(lower)) return true;
	for (const sentence of lower.split(/[.;\n]+/)) {
		if (!family.test(sentence)) continue;
		if (/\b(no|not|none|absent|without)\b/.test(sentence)) return true;
	}
	return false;
}

// ---------------------------------------------------------------------------
// G1 -- code-only workspace
// ---------------------------------------------------------------------------

test('G1: code-only workspace -- code in summary; data + infra declared-absent', { skip: !GATE }, async () => {
	const runId = uniqueRunId('G1');
	try {
		const bundle = await runGenericShaper(fixtures.tinyMultiLangRepo, runId);

		assert.ok(validateBundle(bundle), 'bundle must be schema-valid');

		const haystack = `${bundle.summary}\n${bundle.surface}`.toLowerCase();

		// Positive: code is acknowledged.
		assert.match(
			haystack,
			/typescript|\bts\b|python|\.py\b|\bgo\b|\.go\b|source\s+code|programming\s+language/,
			`code must be acknowledged in summary/surface; got:\n${haystack.slice(0, 600)}`,
		);

		// Negative: data + infra declared absent.
		assert.ok(
			declaresAbsent(haystack, /\b(database|datasource|rdbms|sql|sqlite|postgres|csv|parquet|connection)\b/),
			`data should be declared absent; got:\n${haystack.slice(0, 600)}`,
		);
		assert.ok(
			declaresAbsent(
				haystack,
				/\b(terraform|kubernetes|k8s|helm|github\s*action|gitlab|ansible|docker\s*compose|pulumi|cloudformation|infrastructure)\b/,
			),
			`infra should be declared absent; got:\n${haystack.slice(0, 600)}`,
		);
	} finally {
		cleanupRun(runId);
	}
});

// ---------------------------------------------------------------------------
// G2 -- mixed workspace: all three surfaces positively acknowledged
// ---------------------------------------------------------------------------

test('G2: mixed workspace -- code + data + infra all positively acknowledged', { skip: !GATE }, async () => {
	const runId = uniqueRunId('G2');
	try {
		const bundle = await runGenericShaper(fixtures.root, runId);

		assert.ok(validateBundle(bundle));

		const haystack = `${bundle.summary}\n${bundle.surface}\n${bundle.structure}`.toLowerCase();

		// All three surfaces should be positively acknowledged. Use a
		// permissive token list per surface (the generic prompt allows
		// the model to phrase findings naturally).
		assert.match(
			haystack,
			/typescript|\bts\b|python|\.py\b|\bgo\b|\.go\b|source\s+code|programming\s+language/,
			`code must be acknowledged; got:\n${haystack.slice(0, 800)}`,
		);
		assert.match(
			haystack,
			/\bsqlite\b|\bdatabase\b|\bcsv\b|\bdata\s+files?\b|parquet/,
			`data must be acknowledged; got:\n${haystack.slice(0, 800)}`,
		);
		assert.match(
			haystack,
			/\bterraform\b|\bkubernetes\b|\bk8s\b|github\s*action|workflow|deployment|infrastructure/,
			`infra must be acknowledged; got:\n${haystack.slice(0, 800)}`,
		);
	} finally {
		cleanupRun(runId);
	}
});

// ---------------------------------------------------------------------------
// G3 -- empty workspace
// ---------------------------------------------------------------------------

test('G3: empty workspace -- bundle valid; artefacts + upstream empty per prompt contract', { skip: !GATE }, async () => {
	const runId = uniqueRunId('G3');
	try {
		const bundle = await runGenericShaper(fixtures.emptyRepo, runId);

		assert.ok(validateBundle(bundle), 'bundle must be schema-valid even on an empty workspace');

		// artefacts + upstream are ALWAYS empty in generic run-mode
		// (per generic.system.md): generic is high-level, concrete
		// excerpts land in task-mode; run-mode has no upstream tasks.
		assert.equal(bundle.artefacts.trim().length, 0,
			`artefacts must be empty in generic run-mode; got:\n${bundle.artefacts.slice(0, 200)}`);
		assert.equal(bundle.upstream.trim().length, 0,
			`upstream must be empty in generic run-mode; got:\n${bundle.upstream.slice(0, 200)}`);
		assert.ok(bundle.meta);
		assert.ok(bundle.meta.emptyLayers.includes('artefacts'),
			'meta.emptyLayers must include artefacts');
		assert.ok(bundle.meta.emptyLayers.includes('upstream'),
			'meta.emptyLayers must include upstream');

		// system + focus + summary should be non-empty -- the shaper
		// always describes its role + the intent + a one-line workspace
		// summary even when the workspace is empty.
		assert.ok(bundle.system.trim().length > 0,   'system must be non-empty');
		assert.ok(bundle.focus.trim().length > 0,    'focus must be non-empty');
		assert.ok(bundle.summary.trim().length > 0,  'summary must be non-empty');

		// summary should ACKNOWLEDGE the workspace as empty. Permissive
		// matcher: any of the standard absence keywords or "only a README".
		const summary = bundle.summary.toLowerCase();
		assert.ok(
			/\bempty\b|\bno\s+(code|source|file|repo|database|connection|manifest|iac)\b|\bnone\s+(detected|found|present)|\bonly\s+(a\s+)?(readme|markdown)|\babsent\b/.test(summary),
			`summary should acknowledge the empty workspace; got:\n${summary.slice(0, 400)}`,
		);
	} finally {
		cleanupRun(runId);
	}
});
