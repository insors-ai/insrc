/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Live test: generic.aggregate.report runtime against real Ollama.
 *
 * Builds a synthetic upstream that mixes multiple domains (a few
 * code findings + a data-schema observation + an infra note) --
 * the kind of cross-domain shape that drove the generic target's
 * existence -- and runs the generic aggregator against real
 * Ollama.
 *
 * Asserts the structured report:
 *   - summary present + non-trivial
 *   - findings array has >= 1 entry
 *   - sources entries reference real upstream taskIds (no fabrication)
 *   - metadata.target = 'generic' (the wrapper's contribution)
 *
 * Gated behind INSRC_LIVE_TESTS=1.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { _resetAnalyzeConfigCacheForTests } from '../../../../config/analyze.js';
import { genericAggregateReportRuntime } from '../aggregate-report.js';
import type { ClassifiedIntent } from '../../../../shared/analyze-types.js';
import type { PlannedTask } from '../../../executor/types.js';

const GATE = process.env['INSRC_LIVE_TESTS'] === '1';
if (!GATE) {
	test('generic.aggregate.report.live: skipped (set INSRC_LIVE_TESTS=1)', { skip: true }, () => {});
}

test.before(() => {
	if (!GATE) return;
	_resetAnalyzeConfigCacheForTests();
});

// ---------------------------------------------------------------------------
// Synthetic upstream -- mixed domains
// ---------------------------------------------------------------------------

const SYNTHETIC_UPSTREAM = new Map<string, unknown>([
	['t01', {
		// code domain
		modules: [
			{ name: 'auth', path: '/r/svc/auth', repo: '/r/svc' },
			{ name: 'api',  path: '/r/svc/api',  repo: '/r/svc' },
		],
	}],
	['t02', {
		// code domain again
		entrypoints: [
			{ kind: 'http-route', symbol: 'POST /login', module: 'auth' },
			{ kind: 'http-route', symbol: 'GET /users',  module: 'api'  },
		],
	}],
	['t03', {
		// data domain
		schemas: [
			{ table: 'users',    columns: ['id', 'email', 'created_at'] },
			{ table: 'sessions', columns: ['id', 'user_id', 'expires_at'] },
		],
	}],
	['t04', {
		// infra domain
		manifests: [
			{ kind: 'Deployment', name: 'auth-svc', namespace: 'prod', replicas: 3 },
			{ kind: 'Service',    name: 'auth-svc', namespace: 'prod' },
		],
	}],
]);

const INTENT: ClassifiedIntent = {
	target:    'generic',
	scope:     'M',
	focused:   true,
	focus:     'How does the auth flow work end-to-end across code, data, and infra?',
	scopeRef:  { kind: 'workspace', value: '/r/svc' },
	reasoning: 'generic aggregator live test -- cross-domain synthesis',
};

const AGGREGATOR_TASK: PlannedTask = {
	taskId:    't05',
	template:  'generic.aggregate.report',
	kind:      'leaf',
	params:    {},
	produces:  ['report'],
	consumes:  ['modules', 'entrypoints', 'schemas', 'manifests'],
	rationale: 'terminal generic aggregator for the live test',
};

// ---------------------------------------------------------------------------
// Live
// ---------------------------------------------------------------------------

test('generic.aggregate.report.live: real Ollama -> validator-passing AggregateReport',
{ skip: !GATE }, async () => {
	const result = await genericAggregateReportRuntime.execute({
		task:            AGGREGATOR_TASK,
		intent:          INTENT,
		upstreamOutputs: SYNTHETIC_UPSTREAM,
		runId:           `gen-agg-live-${Math.floor(Math.random() * 1e9).toString(16)}`,
	});

	const reportRaw = result.outputs.get('report');
	assert.ok(reportRaw, 'outputs.report must be present');
	const report = reportRaw as {
		summary:  string;
		findings: Array<{ title: string; detail: string; sources: string[] }>;
		metadata: { target: string; scope: string; runId: string; tasksAnalyzed: number };
	};

	// Summary: non-trivial.
	assert.ok(typeof report.summary === 'string');
	assert.ok(report.summary.length >= 60,
		`summary too short (${report.summary.length} chars): ${report.summary}`);

	// Findings: at least one; every source references a real upstream id.
	assert.ok(Array.isArray(report.findings));
	assert.ok(report.findings.length >= 1, 'findings must have >= 1 entry');

	const validUpstreamIds = new Set(SYNTHETIC_UPSTREAM.keys());
	for (const f of report.findings) {
		assert.ok(typeof f.title  === 'string' && f.title.length  > 0);
		assert.ok(typeof f.detail === 'string' && f.detail.length > 0);
		assert.ok(Array.isArray(f.sources) && f.sources.length >= 1,
			`finding "${f.title}" must have >= 1 source`);
		for (const src of f.sources) {
			assert.ok(validUpstreamIds.has(src),
				`finding "${f.title}" cites unknown source "${src}" -- ` +
					`must be one of ${[...validUpstreamIds].join(', ')}`);
		}
	}

	// Metadata: runtime-stamped. Target is the wrapper's contribution.
	assert.equal(report.metadata.target, 'generic');
	assert.equal(report.metadata.scope,  'M');
	assert.equal(report.metadata.tasksAnalyzed, SYNTHETIC_UPSTREAM.size);
	assert.match(report.metadata.runId, /^gen-agg-live-/);
});
