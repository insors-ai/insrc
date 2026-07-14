/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Live end-to-end test for runAnalyze.
 *
 * Drives the FULL pipeline (classify -> buildRunBundle -> plan ->
 * execute) against real Ollama, against the seeded-manifests
 * fixture (infra target). Infra was picked because:
 *   - Infra runtimes are filesystem-based (no LMDB graph needed)
 *   - The seeded-manifests fixture already exists from the shaper
 *     live tests + has enough surface for an XS plan to produce
 *     a meaningful report
 *
 * Asserts:
 *   - ok=true
 *   - finalReport carries summary + findings (the AggregateReport
 *     shape from R2)
 *   - <runRoot>/run.json on disk with status='ok', stage='done'
 *
 * Gated INSRC_LIVE_TESTS=1.
 *
 * Wall-clock: the full pipeline drives 4-5 LLM calls (classifier
 * shaper tool-loop + classifier completion + run-bundle shaper +
 * planner + aggregator). Each can take 30-90s; the planner +
 * shapers retry on schema mismatches. Plan ~10-15 min for a
 * normal run; ~20 min ceiling for runs where the LLM flakes on
 * structured output. Use --test-timeout=1200000 (20 min) when
 * running this directly.
 *
 * The orchestrator's CONTRACT (stage transitions, error
 * classifiers, run.json persistence) is unit-tested in
 * orchestrator.test.ts. This file just verifies the wiring
 * works end-to-end against a real Ollama; runtime failures are
 * acceptable as long as they surface through the orchestrator's
 * structured failure path (run.json mirrors the result, error
 * code is mapped not internal-error).
 *
 * Run:
 *   PATH=/opt/homebrew/opt/node@22/bin:$PATH INSRC_LIVE_TESTS=1 \
 *     npx tsx --test --test-timeout=1200000 \
 *     src/insrc/analyze/orchestrator/__tests__/orchestrator-e2e.live.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';

import { _resetAnalyzeConfigCacheForTests } from '../../../config/analyze.js';
import { _resetRegistryForTests } from '../../../daemon/tools/registry.js';
import { registerBuiltinTools } from '../../../daemon/tools/builtins/index.js';
import { registerBuiltinTemplates } from '../../planner/index.js';
import { _resetTemplateBootstrapLatchForTests } from '../../planner/templates/bootstrap.js';
import { _resetTemplateRegistryForTests } from '../../planner/templates/registry.js';
import {
	_resetRuntimeBootstrapLatchForTests,
	registerBuiltinRuntimes,
} from '../../runtimes/bootstrap.js';
import { runAnalyze } from '../driver.js';
import { purgeRunForTests, readRunRecord } from '../persistence.js';

import {
	setupFixtures,
	teardownFixtures,
	type FixtureSet,
} from '../../context/__tests__/fixtures/setup.js';

const GATE = process.env['INSRC_LIVE_TESTS'] === '1';
if (!GATE) {
	test('orchestrator-e2e.live: skipped (set INSRC_LIVE_TESTS=1)', { skip: true }, () => {});
}

let fixtures: FixtureSet;

test.before(() => {
	if (!GATE) return;
	_resetAnalyzeConfigCacheForTests();
	_resetRegistryForTests();
	registerBuiltinTools();
	_resetTemplateBootstrapLatchForTests();
	_resetTemplateRegistryForTests();
	registerBuiltinTemplates();
	_resetRuntimeBootstrapLatchForTests();
	registerBuiltinRuntimes();
	fixtures = setupFixtures();
});

test.after(() => {
	if (!GATE) return;
	if (fixtures) teardownFixtures(fixtures);
});

/**
 * What this test verifies:
 *   - runAnalyze drives the pipeline through whatever path Ollama
 *     happens to take this run (the infra shaper / classifier are
 *     known to occasionally flake on specific prompts -- e.g.
 *     artifacts/artefacts spelling)
 *   - run.json on disk mirrors whatever outcome the result reports
 *   - When the run DOES succeed end-to-end, the final report has
 *     the AggregateReport shape
 *
 * This is the orchestrator's contract: faithfully execute + persist.
 * Testing this is independent of whether an upstream stage's LLM
 * decided to comply this run -- if we coupled this test to ok=true,
 * we'd be flaking on transient LLM behavior, not on orchestrator
 * correctness. The deterministic stuff (error classifiers,
 * persistence round-trip) is unit-tested separately.
 */
test('orchestrator-e2e.live: infra XS end-to-end -> result mirrors run.json',
{ skip: !GATE }, async () => {
	const repoPath = realpathSync(fixtures.seededManifests);
	const runId = `e2e-${Math.floor(Math.random() * 1e9).toString(16)}`;

	try {
		const result = await runAnalyze({
			runId,
			userPrompt: 'Give me a brief inventory of the infrastructure in this repo.',
			scopeRef:   { kind: 'workspace', value: repoPath },
		});

		// run.json exists + reflects the result.
		const record = readRunRecord(runId);
		assert.ok(record, 'run.json must exist after runAnalyze');
		assert.equal(record!.runId, runId);
		assert.equal(record!.userPrompt, 'Give me a brief inventory of the infrastructure in this repo.');

		if (result.ok) {
			// Happy path -- assert AggregateReport shape + record matches.
			const report = result.finalReport as {
				summary: string;
				findings: Array<{ title: string; detail: string; sources: string[] }>;
				metadata: { target: string; scope: string; runId: string; tasksAnalyzed: number };
			};
			assert.ok(typeof report.summary === 'string' && report.summary.length >= 40,
				`summary too short: ${report.summary}`);
			assert.ok(Array.isArray(report.findings) && report.findings.length >= 1);
			assert.equal(report.metadata.target, 'infra');
			assert.equal(report.metadata.runId, runId);

			assert.equal(record!.status, 'ok');
			assert.equal(record!.stage,  'done');
			assert.equal(record!.intent?.target, 'infra');
			assert.ok(record!.finalReport !== undefined,
				'run.json must carry the finalReport when ok');
		} else {
			// Failure path -- assert run.json captures the same failure
			// the result returned, with a recognised error code.
			assert.equal(record!.status, 'failed');
			assert.equal(record!.stage, result.stage,
				`run.json stage should mirror result.stage`);
			assert.equal(record!.error?.code, result.error.code,
				`run.json error.code should mirror result.error.code`);
			// The error code must be one of the orchestrator's stable
			// codes -- catches accidental fallback to 'internal-error'
			// for typed errors that should have been mapped.
			assert.notEqual(result.error.code, 'internal-error',
				`runAnalyze produced an unmapped error: ${result.error.message}`);
		}
	} finally {
		purgeRunForTests(runId);
	}
});
