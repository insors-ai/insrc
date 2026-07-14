/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Live test: data.aggregate.report runtime against real Ollama.
 *
 * Synthetic upstream mimics what data.discovery.connections +
 * data.discovery.objects + data.schema.table would produce against
 * a small RDBMS. Verifies:
 *   - summary present + non-trivial
 *   - findings non-empty + every source references a real upstream id
 *   - metadata.target = 'data'
 *
 * Gated behind INSRC_LIVE_TESTS=1.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { _resetAnalyzeConfigCacheForTests } from '../../../../config/analyze.js';
import { dataAggregateReportRuntime } from '../aggregate-report.js';
import type { ClassifiedIntent } from '../../../../shared/analyze-types.js';
import type { PlannedTask } from '../../../executor/types.js';

const GATE = process.env['INSRC_LIVE_TESTS'] === '1';
if (!GATE) {
	test('data.aggregate.report.live: skipped (set INSRC_LIVE_TESTS=1)', { skip: true }, () => {});
}

test.before(() => {
	if (!GATE) return;
	_resetAnalyzeConfigCacheForTests();
});

const SYNTHETIC_UPSTREAM = new Map<string, unknown>([
	['t01', {
		connections: [
			{ id: 'app', kind: 'sqlite', family: 'rdbms', label: 'app sqlite', hasUrl: false, hasPath: true },
		],
	}],
	['t02', {
		objects: [
			{ kind: 'table', name: 'orders' },
			{ kind: 'table', name: 'users'  },
		],
	}],
	['t03', {
		'table-schema': {
			connectionId: 'app',
			table: 'users',
			source: 'introspect',
			columns: [
				{ name: 'id',    type: 'INTEGER', primaryKey: true, nullable: false },
				{ name: 'email', type: 'TEXT',                       nullable: false },
				{ name: 'name',  type: 'TEXT',                       nullable: true  },
			],
		},
	}],
	['t04', {
		'table-schema': {
			connectionId: 'app',
			table: 'orders',
			source: 'introspect',
			columns: [
				{ name: 'id',      type: 'INTEGER', primaryKey: true, nullable: false },
				{ name: 'user_id', type: 'INTEGER', nullable: false,
				  foreignKey: { table: 'users', column: 'id' } },
				{ name: 'total',   type: 'REAL',                       nullable: false },
			],
		},
	}],
]);

const INTENT: ClassifiedIntent = {
	target:    'data',
	scope:     'S',
	focused:   true,
	focus:     'What is the relationship between the users and orders tables?',
	scopeRef:  { kind: 'workspace', value: '/synthetic/data-agg' },
	reasoning: 'data aggregator live test',
};

const AGGREGATOR_TASK: PlannedTask = {
	taskId:    't05',
	template:  'data.aggregate.report',
	kind:      'leaf',
	params:    {},
	produces:  ['report'],
	consumes:  ['connections', 'objects', 'table-schema'],
	rationale: 'terminal data aggregator for the live test',
};

test('data.aggregate.report.live: real Ollama -> validator-passing AggregateReport',
{ skip: !GATE }, async () => {
	const result = await dataAggregateReportRuntime.execute({
		task:            AGGREGATOR_TASK,
		intent:          INTENT,
		upstreamOutputs: SYNTHETIC_UPSTREAM,
		runId:           `data-agg-live-${Math.floor(Math.random() * 1e9).toString(16)}`,
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

	assert.equal(report.metadata.target, 'data');
	assert.equal(report.metadata.scope,  'S');
	assert.equal(report.metadata.tasksAnalyzed, SYNTHETIC_UPSTREAM.size);
	assert.match(report.metadata.runId, /^data-agg-live-/);
});
