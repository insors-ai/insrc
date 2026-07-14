/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Live end-to-end test for the Plan Builder.
 *
 * Pipeline exercised:
 *   ClassifyInput -> classification shaper bundle ->
 *   ClassifiedIntent -> runShaper('run', target) bundle ->
 *   runPlanner({ intent, contextBundle, catalog }) ->
 *   validated PlanTask
 *
 * The catalog is the registered builtins filtered to the intent's
 * target. Validates that the planner picks tasks from the catalog,
 * stays within the scope band, ends with the per-target aggregator,
 * and emits well-formed PlannedTask entries.
 *
 * Skipped scope-band coverage: this test exercises one happy-path
 * shape. Per-bucket band assertions live in the pure-function
 * validate.test.ts; this file confirms the LLM can produce a plan
 * the validator accepts.
 *
 * Gated behind INSRC_LIVE_TESTS=1.
 *
 * Run:
 *   PATH=/opt/homebrew/opt/node@22/bin:$PATH INSRC_LIVE_TESTS=1 \
 *     npx tsx --test \
 *     src/insrc/analyze/planner/__tests__/planner.live.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';

import { existsSync, readFileSync } from 'node:fs';

import { _resetAnalyzeConfigCacheForTests } from '../../../config/analyze.js';
import { registerBuiltinTools } from '../../../daemon/tools/builtins/index.js';
import { _resetRegistryForTests as _resetToolRegistryForTests } from '../../../daemon/tools/registry.js';
import { shaperFor } from '../../context/index.js';
import {
	planFinalPathFor,
	purgePlan,
	readPlanFinal,
} from '../cache.js';
import {
	_resetTemplateRegistryForTests,
	getTemplateCatalog,
	getTemplatesForTarget,
} from '../templates/registry.js';
import {
	_resetTemplateBootstrapLatchForTests,
	registerBuiltinTemplates,
} from '../templates/bootstrap.js';
import { runPlanner } from '../driver.js';
import { validatePlan } from '../validate.js';
import { validatePlanShape } from '../schema.js';
import type {
	PlanBuilderInput,
	PlanBuilderOpts,
} from '../types.js';
import type { AnalyzeContextBundle } from '../../context/types.js';
import type { ClassifiedIntent } from '../../../shared/analyze-types.js';

import {
	setupFixtures,
	teardownFixtures,
	type FixtureSet,
} from '../../context/__tests__/fixtures/setup.js';

const GATE = process.env['INSRC_LIVE_TESTS'] === '1';
if (!GATE) {
	test('planner.live: skipped (set INSRC_LIVE_TESTS=1)', { skip: true }, () => {});
}

// ---------------------------------------------------------------------------
// Suite setup
// ---------------------------------------------------------------------------

let fixtures: FixtureSet;

test.before(async () => {
	if (!GATE) return;
	_resetAnalyzeConfigCacheForTests();
	_resetToolRegistryForTests();
	registerBuiltinTools();
	_resetTemplateBootstrapLatchForTests();
	_resetTemplateRegistryForTests();
	registerBuiltinTemplates();
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
	return `live-planner-${label}-${suffix}`;
}

async function buildRunBundleFor(
	intent: ClassifiedIntent,
	runId:  string,
): Promise<AnalyzeContextBundle> {
	const shaper = shaperFor('run', intent.target);
	return shaper.buildRunBundle({ intent }, { runId });
}

// ---------------------------------------------------------------------------
// Infra-target happy path -- smallest realistic catalog (3 inventory
// templates + 1 aggregator), easiest for the model to plan around.
// Target a scope bucket that's compatible with the small catalog
// (XS / S work; bigger buckets need more templates than we have
// registered today).
// ---------------------------------------------------------------------------

test('runPlanner: infra target + XS scope -> validated PlanTask using the registered catalog', { skip: !GATE }, async () => {
	const runId = uniqueRunId('infra-xs');
	const intent: ClassifiedIntent = {
		target:    'infra',
		scope:     'XS',
		focused:   false,
		scopeRef:  { kind: 'manifest-dir', value: realpathSync(fixtures.seededManifests) },
		reasoning: 'live planner fixture: infra-XS scope to keep task count low',
	};

	const bundle = await buildRunBundleFor(intent, runId);
	assert.ok(bundle.system.length > 0, 'shaper should emit a non-empty bundle');

	const input: PlanBuilderInput = {
		intent,
		contextBundle: bundle,
		catalog:       getTemplatesForTarget('infra'),
	};
	const opts: PlanBuilderOpts = { runId };

	try {
		const plan = await runPlanner({ input, opts });

		// Wire-layer shape check.
		assert.ok(validatePlanShape(plan), 'returned plan must satisfy the wire schema');

		// Persistence: the driver should have written plan.json + at least
		// one attempt under plan.attempts/ for the run-id.
		const finalPath = planFinalPathFor({ runId });
		assert.ok(existsSync(finalPath), `final plan.json should exist at ${finalPath}`);
		const persisted = readPlanFinal({ runId });
		assert.deepEqual(persisted, plan,
			'persisted plan.json should match the returned plan exactly');
		// Spot-check via readFileSync that the file is JSON (catches encoding bugs).
		assert.doesNotThrow(() => JSON.parse(readFileSync(finalPath, 'utf8')));

		// Semantic invariants: re-run validate -- the driver ran it
		// already, but the live test pins that the returned plan is
		// PASSING the same checks the driver gates on.
		const failure = validatePlan(plan, getTemplatesForTarget('infra'), {
			focused:     intent.focused,
			isChildPlan: false,
		});
		assert.equal(failure, null,
			`plan should pass every invariant; got: ${JSON.stringify(failure)}`);

		// Spot checks per the design's expectations:
		assert.equal(plan.target, 'infra');
		assert.equal(plan.scope,  'XS');
		assert.equal(plan.parentTaskPath, undefined);
		assert.ok(plan.tasks.length >= 3 && plan.tasks.length <= 8,
			`XS task count should be 3-8; got ${plan.tasks.length}`);

		// Last task must be the infra aggregator (INV-12).
		const last = plan.tasks[plan.tasks.length - 1]!;
		assert.equal(last.template, 'infra.aggregate.report');
		assert.equal(last.kind, 'leaf');

		// First task is typically discovery.families to bring the catalog
		// into structured form. We don't pin this rigidly -- the LLM may
		// pick a different ordering -- but if it's not discovery, the
		// downstream inventory tasks have less to fan out over. Soft
		// assertion: the plan references at least one discovery template.
		const usesDiscovery = plan.tasks.some(t => t.template.startsWith('infra.discovery.'));
		assert.ok(usesDiscovery,
			`plan should reference at least one discovery template; got templates: ${plan.tasks.map(t => t.template).join(', ')}`);

	// Every task's template must be in the registered catalog
	// (INV-3 -- already enforced by validatePlan above, but assert
	// explicitly as a sanity check the test framework is wired
		// correctly).
		const validIds = new Set(getTemplatesForTarget('infra').map(t => t.id));
		for (const t of plan.tasks) {
			assert.ok(validIds.has(t.template),
				`task ${t.taskId}: template '${t.template}' not in registered catalog`);
		}

		// Plan reasoning + per-task rationale meet length floors (INV-14).
		assert.ok(plan.reasoning.trim().length >= 50,
			`plan reasoning should be >= 50 chars; got ${plan.reasoning.trim().length}`);
		for (const t of plan.tasks) {
			assert.ok(t.rationale.trim().length >= 20,
				`task ${t.taskId} rationale should be >= 20 chars; got ${t.rationale.trim().length}`);
		}
	} finally {
		purgePlan({ runId });
	}
});

// ---------------------------------------------------------------------------
// Catalog sanity (cheap; runs even when no Ollama call happens above)
// ---------------------------------------------------------------------------

test('planner.live setup: registered catalog covers every target with an aggregator', { skip: !GATE }, () => {
	const all = getTemplateCatalog();
	assert.ok(all.length >= 14, `expected >= 14 registered templates; got ${all.length}`);

	for (const target of ['code', 'data', 'infra', 'generic'] as const) {
		const agg = all.find(t => t.target === target && t.isAggregator === true);
		assert.ok(agg, `target=${target} should have a registered aggregator`);
	}
});
