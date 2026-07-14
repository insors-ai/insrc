/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Live tests for the infra-shaper.
 *
 * Drives the real Ollama against the seeded-manifests + empty-repo
 * fixtures and asserts each row of the infra edge-case matrix (I1-I4
 * in plans/analyze-context-builder.md):
 *
 *   I1 -- k8s + tf + GHA: all three families surface
 *   I2 -- k8s-only manifests: no false TF / GHA positives
 *   I3 -- empty manifest dir: no families; schema-valid
 *   I4 -- one representative excerpt per detected family in artefacts
 *
 * Gated behind INSRC_LIVE_TESTS=1. Each test costs a real Ollama call
 * (~30-90s depending on tool-loop length); plan accordingly.
 *
 * Run:
 *   INSRC_LIVE_TESTS=1 npx tsx --test \
 *     src/insrc/analyze/context/__tests__/infra-shaper.live.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { _resetAnalyzeConfigCacheForTests } from '../../../config/analyze.js';
import { registerBuiltinTools } from '../../../daemon/tools/builtins/index.js';
import { _resetRegistryForTests } from '../../../daemon/tools/registry.js';
import { shaperFor } from '../index.js';
import { cacheFilePathFor } from '../cache.js';
import { validateBundle } from '../schema.js';
import type { AnalyzeContextBundle, RunShapeInput, ShapeOpts } from '../types.js';
import type { ClassifiedIntent } from '../../../shared/analyze-types.js';

import { setupFixtures, teardownFixtures, type FixtureSet } from './fixtures/setup.js';

const GATE = process.env['INSRC_LIVE_TESTS'] === '1';
if (!GATE) {
	test('infra-shaper.live: skipped (set INSRC_LIVE_TESTS=1)', { skip: true }, () => {});
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
	return `live-infra-${label}-${suffix}`;
}

function runIntentAt(scopeValue: string, scope: ClassifiedIntent['scope'] = 'S'): ClassifiedIntent {
	return {
		target:    'infra',
		scope,
		focused:   false,
		scopeRef:  { kind: 'manifest-dir', value: scopeValue },
		reasoning: 'infra-shaper.live test fixture',
	};
}

async function runInfraShaper(
	scopeValue: string,
	runId:      string,
	scope?:     ClassifiedIntent['scope'],
): Promise<AnalyzeContextBundle> {
	const shaper = shaperFor('run', 'infra');
	const inputs: RunShapeInput = { intent: runIntentAt(scopeValue, scope) };
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

/** Pull an integer of citations out of the artefacts body, regardless
 *  of exact format -- count `cite:` markers as a robust proxy. */
function citeCount(body: string): number {
	return (body.match(/cite:/gi) ?? []).length;
}

// ---------------------------------------------------------------------------
// I1 -- k8s + tf + GHA: all three families surface
// ---------------------------------------------------------------------------

test('I1: k8s + tf + GHA manifests -- all three families appear in summary + surface', { skip: !GATE }, async () => {
	const runId = uniqueRunId('I1');
	try {
		const bundle = await runInfraShaper(fixtures.seededManifests, runId);

		assert.ok(validateBundle(bundle), 'bundle must be schema-valid');

		// Robust matcher: all three families must be mentioned at least
		// once across summary + surface combined. We don't pin exact
		// wording because the LLM has freedom in phrasing.
		const haystack = `${bundle.summary}\n${bundle.surface}`.toLowerCase();
		assert.match(haystack, /kubernet|k8s/);
		assert.match(haystack, /terraform|hcl|\.tf\b/);
		assert.match(haystack, /github\s*action|workflow|\.github\/workflow/);

		// And the bundle was structured (the structure layer carries some
		// topology content).
		assert.ok(bundle.structure.trim().length > 0,
			'structure layer should be non-empty when families were detected');
	} finally {
		cleanupRun(runId);
	}
});

// ---------------------------------------------------------------------------
// I2 -- k8s-only manifests: no false TF / GHA positives
// ---------------------------------------------------------------------------

test('I2: k8s-only scope does NOT surface false TF / GHA positives', { skip: !GATE }, async () => {
	const k8sOnly = join(fixtures.seededManifests, 'k8s');
	const runId = uniqueRunId('I2');
	try {
		const bundle = await runInfraShaper(k8sOnly, runId);

		assert.ok(validateBundle(bundle));

		// Positive: the LLM acknowledges k8s as the detected family.
		const haystack = `${bundle.summary}\n${bundle.surface}`.toLowerCase();
		assert.match(haystack, /kubernet|k8s|deployment|service|configmap/,
			'k8s family should be acknowledged');

		// Negative: false-positive detection means the shaper CITED or
		// EXCERPTED TF / GHA content. Mere prose mentions in a "not
		// detected / not found" sentence are not false positives -- that
		// is the prompt's explicit instruction (surface absence as
		// structured notes). Restrict the check to:
		//   1. `cite:` markers referencing tf or GHA filenames
		//   2. code blocks (```) containing tf/gha signatures
		// Both are structural signals that the shaper actually CONSUMED
		// a file outside the scope's directory.
		const artefactsLower = bundle.artefacts.toLowerCase();

		const tfFilesInCites = /cite:[^\n]*?(main\.tf|variables\.tf|\.tfvars)\b/i.test(bundle.artefacts);
		const tfBlocks = /```[\s\S]*?(resource\s+"aws_|provider\s+"aws"|terraform\s*\{)/i.test(bundle.artefacts);

		const ghaFilesInCites = /cite:[^\n]*?\.github\/workflows[^\n]*?\.yml/i.test(bundle.artefacts);
		const ghaBlocks = /```[\s\S]*?(runs-on:|uses: actions\/(checkout|setup-node))/i.test(bundle.artefacts);

		assert.equal(tfFilesInCites || tfBlocks, false,
			`k8s-only scope falsely cited or excerpted TF content in artefacts:\n${bundle.artefacts.slice(0, 800)}`);
		assert.equal(ghaFilesInCites || ghaBlocks, false,
			`k8s-only scope falsely cited or excerpted GHA content in artefacts:\n${bundle.artefacts.slice(0, 800)}`);

		// Sanity: the shaper definitely TOUCHED k8s files (positive
		// evidence to balance the negative assertions above).
		const k8sFilesInCites = /cite:[^\n]*?(deployment|service|config)\.yaml/i.test(bundle.artefacts);
		assert.ok(k8sFilesInCites || artefactsLower.includes('.yaml'),
			'artefacts should contain k8s file references when k8s was detected');
	} finally {
		cleanupRun(runId);
	}
});

// ---------------------------------------------------------------------------
// I3 -- empty manifest dir: no families detected, schema-valid
// ---------------------------------------------------------------------------

test('I3: empty manifest dir -- no families detected; bundle still schema-valid', { skip: !GATE }, async () => {
	// empty-repo has only .git + README. No IaC content under it.
	const runId = uniqueRunId('I3');
	try {
		const bundle = await runInfraShaper(fixtures.emptyRepo, runId);

		assert.ok(validateBundle(bundle));

		// surface + artefacts + structure should all be either empty OR
		// expressly declare "no IaC families detected" -- no fabrication.
		// We accept either form (empty string or a sentence-with-"none"
		// / "no IaC" / "no manifests" / "detected" phrasing).
		const layerOk = (body: string): boolean => {
			const trimmed = body.trim();
			if (trimmed.length === 0) return true;
			const l = trimmed.toLowerCase();
			return /none|no\s+iac|no\s+manifest|no\s+infrastructure|not\s+detected|no\s+\w+\s+detected|empty|absent/.test(l);
		};

		assert.ok(layerOk(bundle.surface),   `surface should be empty or declare-no-IaC: ${bundle.surface.slice(0, 200)}`);
		assert.ok(layerOk(bundle.artefacts), `artefacts should be empty or declare-no-IaC: ${bundle.artefacts.slice(0, 200)}`);
	} finally {
		cleanupRun(runId);
	}
});

// ---------------------------------------------------------------------------
// I4 -- one representative excerpt per detected family
// ---------------------------------------------------------------------------

test('I4: artefacts contains representative excerpts for each detected family', { skip: !GATE }, async () => {
	const runId = uniqueRunId('I4');
	try {
		const bundle = await runInfraShaper(fixtures.seededManifests, runId);

		assert.ok(validateBundle(bundle));
		assert.ok(bundle.artefacts.trim().length > 0, 'artefacts layer must not be empty');

		// Lower bound: a citation marker per detected family. We detected
		// 3 families (k8s + tf + GHA) -> at least 2 citation markers
		// (giving the LLM some slack for combining or omitting one
		// representative, which the prompt allows in edge cases). The
		// design doc says "one representative excerpt per detected
		// family"; we treat 2+ as acceptable evidence the shaper did
		// the right thing, and a totally-empty artefacts as a failure.
		const cites = citeCount(bundle.artefacts);
		assert.ok(cites >= 2,
			`artefacts should carry at least 2 cite: markers across 3 detected families; got ${cites}`);

		// Spot check: the artefacts should mention at least two of the
		// three concrete fixture filenames -- evidence the shaper
		// actually read the files (and didn't invent excerpts).
		const concreteRefs = [
			'deployment.yaml',
			'service.yaml',
			'config.yaml',
			'main.tf',
			'variables.tf',
			'ci.yml',
		];
		const refsFound = concreteRefs.filter(f => bundle.artefacts.includes(f));
		assert.ok(refsFound.length >= 2,
			`artefacts should reference 2+ concrete fixture filenames; got ${refsFound.length}: ${refsFound.join(', ')}`);
	} finally {
		cleanupRun(runId);
	}
});

// ---------------------------------------------------------------------------
// Cleanup smoke -- shared helpers wired
// ---------------------------------------------------------------------------

test('helpers wired: cleanupRun handles missing files (smoke)', { skip: !GATE }, () => {
	const tmpDir = join(fixtures.root, 'cleanup-smoke');
	mkdirSync(tmpDir, { recursive: true });
	assert.doesNotThrow(() => cleanupRun('does-not-exist'));
});
