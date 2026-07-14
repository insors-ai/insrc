/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Live test: code.aggregate.report runtime against real Ollama.
 *
 * Builds a small synthetic upstream-output map (mimicking the
 * outputs that code.discovery.modules + code.surface.functional
 * would produce against the tiny-multi-lang-repo fixture) and runs
 * the aggregator's execute() against the default analyze model
 * (qwen3.6:35b-a3b).
 *
 * Asserts the structured report:
 *   - summary present + non-trivial length
 *   - findings array has >= 1 entry
 *   - every sources[] entry references a taskId that actually
 *     appears in the synthetic upstream
 *   - metadata fields correctly stamped by the runtime (target,
 *     scope, runId, tasksAnalyzed)
 *
 * Gated behind INSRC_LIVE_TESTS=1.
 *
 * Run:
 *   PATH=/opt/homebrew/opt/node@22/bin:$PATH INSRC_LIVE_TESTS=1 \
 *     npx tsx --test \
 *     src/insrc/analyze/runtimes/code/__tests__/aggregate-report.live.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { _resetAnalyzeConfigCacheForTests } from '../../../../config/analyze.js';
import { codeAggregateReportRuntime } from '../aggregate-report.js';
import type { ClassifiedIntent } from '../../../../shared/analyze-types.js';
import type { PlannedTask } from '../../../executor/types.js';

const GATE = process.env['INSRC_LIVE_TESTS'] === '1';
if (!GATE) {
	test('code.aggregate.report.live: skipped (set INSRC_LIVE_TESTS=1)', { skip: true }, () => {});
}

test.before(() => {
	if (!GATE) return;
	_resetAnalyzeConfigCacheForTests();
});

// ---------------------------------------------------------------------------
// Synthetic upstream (no graph / no fixture; aggregator is text-in -> text-out)
// ---------------------------------------------------------------------------

const SYNTHETIC_UPSTREAM = new Map<string, unknown>([
	['t01', {
		modules: [
			{ name: 'index.ts',   path: '/r/tiny/index.ts',   repo: '/r/tiny' },
			{ name: 'compute.py', path: '/r/tiny/compute.py', repo: '/r/tiny' },
			{ name: 'user.go',    path: '/r/tiny/user.go',    repo: '/r/tiny' },
		],
	}],
	['t02', {
		entrypoints: [
			{ kind: 'http-route', symbol: 'registerUsersRoute', file: 'index.ts' },
			{ kind: 'cli',        symbol: 'greetCommand',       file: 'index.ts' },
		],
	}],
	['t03', {
		'functional-surface': [
			{ module: 'index.ts',   exports: ['formatName', 'greetCommand', 'registerUsersRoute'] },
			{ module: 'compute.py', exports: ['normalize_email', 'normalize_name'] },
			{ module: 'user.go',    exports: ['User.DisplayName', 'User.IsActive'] },
		],
	}],
]);

const INTENT: ClassifiedIntent = {
	target:    'code',
	scope:     'S',
	focused:   false,
	scopeRef:  { kind: 'repo', value: '/r/tiny' },
	reasoning: 'aggregator live test -- synthesise the upstream into a report',
};

const AGGREGATOR_TASK: PlannedTask = {
	taskId:    't04',
	template:  'code.aggregate.report',
	kind:      'leaf',
	params:    {},
	produces:  ['report'],
	consumes:  ['modules', 'entrypoints', 'functional-surface'],
	rationale: 'terminal aggregator for the live test',
};

// ---------------------------------------------------------------------------
// Live: real Ollama
// ---------------------------------------------------------------------------

test('code.aggregate.report.live: real Ollama -> validator-passing AggregateReport',
{ skip: !GATE }, async () => {
	const result = await codeAggregateReportRuntime.execute({
		task:            AGGREGATOR_TASK,
		intent:          INTENT,
		upstreamOutputs: SYNTHETIC_UPSTREAM,
		runId:           `agg-live-${Math.floor(Math.random() * 1e9).toString(16)}`,
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

	// Findings: at least one + structurally valid + sources reference real upstream ids.
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

	// Metadata: runtime-stamped, must match the call site.
	assert.equal(report.metadata.target, 'code');
	assert.equal(report.metadata.scope,  'S');
	assert.equal(report.metadata.tasksAnalyzed, SYNTHETIC_UPSTREAM.size);
	assert.match(report.metadata.runId, /^agg-live-/);
});
