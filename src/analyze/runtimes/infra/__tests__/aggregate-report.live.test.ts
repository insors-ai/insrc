/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Live test: infra.aggregate.report runtime against real Ollama.
 *
 * Synthetic upstream mimics what infra.discovery.families +
 * infra.inventory.kubernetes + infra.inventory.terraform would
 * produce for a small services repo. Verifies:
 *   - summary present + non-trivial
 *   - findings non-empty + every source references a real upstream id
 *   - metadata.target = 'infra'
 *
 * Gated behind INSRC_LIVE_TESTS=1.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { _resetAnalyzeConfigCacheForTests } from '../../../../config/analyze.js';
import { infraAggregateReportRuntime } from '../aggregate-report.js';
import type { ClassifiedIntent } from '../../../../shared/analyze-types.js';
import type { PlannedTask } from '../../../executor/types.js';

const GATE = process.env['INSRC_LIVE_TESTS'] === '1';
if (!GATE) {
	test('infra.aggregate.report.live: skipped (set INSRC_LIVE_TESTS=1)', { skip: true }, () => {});
}

test.before(() => {
	if (!GATE) return;
	_resetAnalyzeConfigCacheForTests();
});

const SYNTHETIC_UPSTREAM = new Map<string, unknown>([
	['t01', {
		families: [
			{ name: 'kubernetes',     fileCount: 4, sampleFiles: ['k8s/api-deployment.yaml', 'k8s/worker-deployment.yaml'] },
			{ name: 'terraform',      fileCount: 2, sampleFiles: ['tf/main.tf', 'tf/variables.tf'] },
			{ name: 'github-actions', fileCount: 1, sampleFiles: ['.github/workflows/ci.yml'] },
		],
	}],
	['t02', {
		'k8s-inventory': {
			files: [
				{ path: 'k8s/api-deployment.yaml',    resourceCount: 1, kinds: ['Deployment'] },
				{ path: 'k8s/api-service.yaml',       resourceCount: 1, kinds: ['Service'] },
				{ path: 'k8s/worker-deployment.yaml', resourceCount: 1, kinds: ['Deployment'] },
			],
			resources: [
				{ file: 'k8s/api-deployment.yaml',    apiVersion: 'apps/v1', kind: 'Deployment', name: 'api',    namespace: 'prod', labels: { app: 'api',    tier: 'web' } },
				{ file: 'k8s/api-service.yaml',       apiVersion: 'v1',      kind: 'Service',    name: 'api',    namespace: 'prod' },
				{ file: 'k8s/worker-deployment.yaml', apiVersion: 'apps/v1', kind: 'Deployment', name: 'worker', namespace: 'prod' },
			],
			truncated: false,
		},
	}],
	['t03', {
		'tf-inventory': {
			files: [
				{ path: 'tf/main.tf',      resourceCount: 2, providerCount: 1, moduleCount: 0, variableCount: 0, dataCount: 1, outputCount: 1 },
				{ path: 'tf/variables.tf', resourceCount: 0, providerCount: 0, moduleCount: 0, variableCount: 2, dataCount: 0, outputCount: 0 },
			],
			resources: [
				{ file: 'tf/main.tf', type: 'aws_iam_role',  name: 'app'  },
				{ file: 'tf/main.tf', type: 'aws_s3_bucket', name: 'logs' },
			],
			data:      [{ file: 'tf/main.tf', type: 'aws_iam_policy_document', name: 'assume' }],
			modules:   [],
			providers: [{ file: 'tf/main.tf', name: 'aws' }],
			variables: [{ file: 'tf/variables.tf', name: 'region' }, { file: 'tf/variables.tf', name: 'bucket_name' }],
			outputs:   [{ file: 'tf/main.tf', name: 'bucket_name' }],
			truncated: false,
		},
	}],
]);

const INTENT: ClassifiedIntent = {
	target:    'infra',
	scope:     'M',
	focused:   true,
	focus:     'What does this service look like end-to-end: k8s topology + AWS resources?',
	scopeRef:  { kind: 'repo', value: '/synthetic/infra-agg' },
	reasoning: 'infra aggregator live test',
};

const AGGREGATOR_TASK: PlannedTask = {
	taskId:    't04',
	template:  'infra.aggregate.report',
	kind:      'leaf',
	params:    {},
	produces:  ['report'],
	consumes:  ['families', 'k8s-inventory', 'tf-inventory'],
	rationale: 'terminal infra aggregator for the live test',
};

test('infra.aggregate.report.live: real Ollama -> validator-passing AggregateReport',
{ skip: !GATE }, async () => {
	const result = await infraAggregateReportRuntime.execute({
		task:            AGGREGATOR_TASK,
		intent:          INTENT,
		upstreamOutputs: SYNTHETIC_UPSTREAM,
		runId:           `infra-agg-live-${Math.floor(Math.random() * 1e9).toString(16)}`,
	});

	const report = result.outputs.get('report') as {
		summary: string;
		findings: Array<{ title: string; detail: string; sources: string[] }>;
		metadata: { target: string; scope: string; runId: string; tasksAnalyzed: number };
	};

	assert.ok(typeof report.summary === 'string' && report.summary.length >= 60,
		`summary too short: ${report.summary}`);
	assert.ok(report.findings.length >= 1, 'findings must be non-empty');

	const validUpstreamIds = new Set(SYNTHETIC_UPSTREAM.keys());
	for (const f of report.findings) {
		assert.ok(f.sources.length >= 1, `finding "${f.title}" must have >= 1 source`);
		for (const src of f.sources) {
			assert.ok(validUpstreamIds.has(src),
				`finding "${f.title}" cites unknown source "${src}"`);
		}
	}

	assert.equal(report.metadata.target, 'infra');
	assert.equal(report.metadata.scope,  'M');
	assert.equal(report.metadata.tasksAnalyzed, SYNTHETIC_UPSTREAM.size);
	assert.match(report.metadata.runId, /^infra-agg-live-/);
});
