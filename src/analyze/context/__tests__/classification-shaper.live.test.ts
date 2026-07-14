/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Live tests for the classification-shaper.
 *
 * Drives the real Ollama against three workspace configurations
 * (code-dominant / data-dominant / mixed) and the empty-workspace
 * cleanup, asserting the four classification edge-case matrix rows
 * from plans/analyze-context-builder.md:
 *
 *   CL1 -- code-dominant workspace: code surface mentioned; data +
 *          infra explicitly "none / not detected"
 *   CL2 -- data-dominant workspace: data surface mentioned; code +
 *          infra explicitly "none"
 *   CL3 -- mixed workspace: code + data + infra all surface
 *   CL4 -- bundle size budget: classification bundle stays small
 *          (< 10 KB serialized JSON -- the design's "~4 KB" target
 *          with slack for prose variance)
 *
 * Gated behind INSRC_LIVE_TESTS=1.
 *
 * Run:
 *   INSRC_LIVE_TESTS=1 npx tsx --test \
 *     src/insrc/analyze/context/__tests__/classification-shaper.live.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { basename, join } from 'node:path';

import { _resetAnalyzeConfigCacheForTests } from '../../../config/analyze.js';
import { registerBuiltinTools } from '../../../daemon/tools/builtins/index.js';
import { _resetRegistryForTests } from '../../../daemon/tools/registry.js';
import { shaperFor } from '../index.js';
import { cacheFilePathFor } from '../cache.js';
import { validateBundle } from '../schema.js';
import type {
	AnalyzeContextBundle,
	ClassificationShapeInput,
	ShapeOpts,
} from '../types.js';
import type { AnalyzeScopeRef } from '../../../shared/analyze-types.js';

import { setupFixtures, teardownFixtures, type FixtureSet } from './fixtures/setup.js';

const GATE = process.env['INSRC_LIVE_TESTS'] === '1';
if (!GATE) {
	test('classification-shaper.live: skipped (set INSRC_LIVE_TESTS=1)', { skip: true }, () => {});
}

// ---------------------------------------------------------------------------
// Suite-scoped setup -- shared fixtures + a derived "data-only" workspace
// ---------------------------------------------------------------------------

let fixtures:  FixtureSet;
let dataOnly:  string;

test.before(() => {
	if (!GATE) return;
	_resetAnalyzeConfigCacheForTests();
	_resetRegistryForTests();
	registerBuiltinTools();
	fixtures = setupFixtures();
	dataOnly = buildDataOnlyDir(fixtures);
});

test.after(() => {
	if (!GATE) return;
	if (fixtures) teardownFixtures(fixtures);
});

/**
 * Build a workspace dir containing ONLY seeded.sqlite -- no code, no
 * IaC. Used to test data-dominant classification (CL2).
 *
 * The shared fixtures dir holds code + data + infra side by side, so
 * we copy seeded.sqlite into a sibling dir for the data-isolated
 * case.
 */
function buildDataOnlyDir(set: FixtureSet): string {
	const dir = join(set.root, 'data-only-workspace');
	mkdirSync(dir, { recursive: true });
	copyFileSync(set.seededSqlite, join(dir, basename(set.seededSqlite)));
	return dir;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function uniqueRunId(label: string): string {
	const suffix = Math.floor(Math.random() * 1e9).toString(16);
	return `live-classify-${label}-${suffix}`;
}

async function classify(
	scopeValue: string,
	userPrompt: string,
	runId:      string,
): Promise<AnalyzeContextBundle> {
	const shaper = shaperFor('classification');
	const scopeRef: AnalyzeScopeRef = { kind: 'workspace', value: scopeValue };
	const input: ClassificationShapeInput = { scopeRef, userPrompt };
	const opts:  ShapeOpts = { runId };
	return shaper.buildClassificationBundle(input, opts);
}

function cleanupRun(runId: string): void {
	const path = cacheFilePathFor(runId, { mode: 'classification', hash: 'x' });
	if (existsSync(path)) {
		// eslint-disable-next-line no-empty
		try { rmSync(path); } catch {}
	}
}

/**
 * "Acknowledged-as-absent" matcher: layer text either is empty OR
 * contains an explicit negative declaration (none / no / not / absent
 * / without). Mirrors the prompt's instruction that absence be
 * declared, not silently omitted.
 *
 * Sentence-level rather than line-level: the model frequently puts the
 * negation token at the start of a long sentence that enumerates
 * multiple family names in a parenthetical (e.g. "no
 * infrastructure-as-code artifacts (terraform, kubernetes, helm, ...)
 * are present"). Line-level matchers miss this because the family
 * token appears far from the negation keyword; the sentence-level
 * walk plus a permissive negation alphabet captures the standard
 * variants the model uses.
 *
 * The classification shaper does not emit mixed-context sentences
 * (where one family is positively detected and another negated in the
 * same sentence) -- if it did, that would be a separate prompt-tuning
 * issue. So a permissive "any negation token on the same sentence"
 * rule is appropriate here.
 */
function declaresAbsent(haystack: string, family: RegExp): boolean {
	const haystackLower = haystack.toLowerCase();
	if (!family.test(haystackLower)) {
		// Family not mentioned at all -> trivially "absent" since we're
		// testing that the LLM didn't claim it was present.
		return true;
	}
	// Split into sentences on `.`, `;`, or newline. Walk every sentence
	// containing the family token; require a negation keyword.
	const sentences = haystackLower.split(/[.;\n]+/);
	for (const sentence of sentences) {
		if (!family.test(sentence)) continue;
		if (/\b(no|not|none|absent|without)\b/.test(sentence)) {
			return true;
		}
	}
	return false;
}

// ---------------------------------------------------------------------------
// CL1 -- code-dominant workspace
// ---------------------------------------------------------------------------

test('CL1: code-dominant workspace -- code surface mentioned; data + infra acknowledged absent', { skip: !GATE }, async () => {
	const runId = uniqueRunId('CL1');
	try {
		const bundle = await classify(
			fixtures.tinyMultiLangRepo,
			'What is in this workspace?',
			runId,
		);
		assert.ok(validateBundle(bundle));

		const haystack = `${bundle.summary}\n${bundle.surface}`.toLowerCase();

		// Positive: code is detected (some mention of TS / Py / Go / source
		// files / a language name).
		assert.match(
			haystack,
			/typescript|\bts\b|python|\.py\b|\bgo\b|\.go\b|source\s+code|programming|language/,
			`code must be acknowledged in summary/surface; got:\n${haystack.slice(0, 600)}`,
		);

		// Negative: data + infra should be acknowledged as absent. We use
		// the "absence declaration" matcher: either no mention at all, or
		// mentioned in a "none / not detected" context.
		assert.ok(
			declaresAbsent(haystack, /\b(connection|database|datasource|rdbms|sql|sqlite|postgres)\b/),
			`data should be acknowledged as absent; got:\n${haystack.slice(0, 600)}`,
		);
		assert.ok(
			declaresAbsent(
				haystack,
				/\b(terraform|kubernetes|k8s|helm|github\s*action|gitlab|ansible|docker\s*compose|pulumi|cloudformation)\b/,
			),
			`infra should be acknowledged as absent; got:\n${haystack.slice(0, 600)}`,
		);
	} finally {
		cleanupRun(runId);
	}
});

// ---------------------------------------------------------------------------
// CL2 -- data-dominant workspace
// ---------------------------------------------------------------------------

test('CL2: data-dominant workspace -- data surface mentioned; code + infra acknowledged absent', { skip: !GATE }, async () => {
	const runId = uniqueRunId('CL2');
	try {
		const bundle = await classify(
			dataOnly,
			'What is in this workspace?',
			runId,
		);
		assert.ok(validateBundle(bundle));

		const haystack = `${bundle.summary}\n${bundle.surface}`.toLowerCase();

		// Positive: data is detected (.sqlite / database / DB hint).
		assert.match(
			haystack,
			/\bsqlite\b|\bdatabase\b|\bdb\b|\bdatastore\b|\brdbms\b|\.sqlite\b/,
			`data must be acknowledged; got:\n${haystack.slice(0, 600)}`,
		);

		// Negative: no code repo, no infra.
		assert.ok(
			declaresAbsent(
				haystack,
				/\b(typescript|python|golang|\.ts\b|\.py\b|\.go\b|source\s+code|programming\s+language)\b/,
			),
			`code should be acknowledged as absent; got:\n${haystack.slice(0, 600)}`,
		);
		assert.ok(
			declaresAbsent(
				haystack,
				/\b(terraform|kubernetes|k8s|helm|github\s*action|gitlab|ansible|docker\s*compose|pulumi|cloudformation)\b/,
			),
			`infra should be acknowledged as absent; got:\n${haystack.slice(0, 600)}`,
		);
	} finally {
		cleanupRun(runId);
	}
});

// ---------------------------------------------------------------------------
// CL3 -- mixed workspace: code + data + infra all surface
// ---------------------------------------------------------------------------

test('CL3: mixed workspace -- code + data + infra all surface', { skip: !GATE }, async () => {
	const runId = uniqueRunId('CL3');
	try {
		const bundle = await classify(
			fixtures.root,
			'What is in this workspace?',
			runId,
		);
		assert.ok(validateBundle(bundle));

		const haystack = `${bundle.summary}\n${bundle.surface}`.toLowerCase();

		// All three surfaces should be positively acknowledged.
		assert.match(
			haystack,
			/typescript|\bts\b|python|\.py\b|\bgo\b|\.go\b/,
			`code must be acknowledged; got:\n${haystack.slice(0, 800)}`,
		);
		assert.match(
			haystack,
			/\bsqlite\b|\bdatabase\b|\bcsv\b|\bdata\s+files?\b/,
			`data must be acknowledged; got:\n${haystack.slice(0, 800)}`,
		);
		assert.match(
			haystack,
			/\bterraform\b|\bkubernetes\b|\bk8s\b|github\s*action|workflow/,
			`infra must be acknowledged; got:\n${haystack.slice(0, 800)}`,
		);
	} finally {
		cleanupRun(runId);
	}
});

// ---------------------------------------------------------------------------
// CL4 -- bundle size budget (run alongside CL3 for max payload)
// ---------------------------------------------------------------------------

test('CL4: classification bundle stays under 10 KB serialized', { skip: !GATE }, async () => {
	const runId = uniqueRunId('CL4');
	try {
		const bundle = await classify(
			fixtures.root,
			'Inventory this workspace.',
			runId,
		);
		assert.ok(validateBundle(bundle));

		// Serialize and size-check. The design target is ~4 KB; we
		// assert < 10 KB to leave room for prose variance across
		// classifier runs without making the test brittle.
		const serialized = JSON.stringify(bundle);
		const bytes = Buffer.byteLength(serialized, 'utf8');

		// Informational: print the actual byte count so subsequent
		// reviews can see the trend.
		console.error(`[CL4] classification bundle byte size: ${bytes}`);

		assert.ok(
			bytes < 10_000,
			`classification bundle should stay small (<10 KB); got ${bytes} bytes. ` +
				`Prompt tuning may be needed if this trend continues.`,
		);
	} finally {
		cleanupRun(runId);
	}
});
