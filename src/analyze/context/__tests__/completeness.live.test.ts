/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Live checks for the completeness report (LLD-b9d5c5c40df5a574-s1, task t17).
 *
 * Each test sends one focused request through runShaper against THIS
 * repository's files. What is real: the scope resolution, the lookups (the
 * text search runs over this repository), the report derived from them, the
 * answer-writing call to the configured model, the bundle validation and the
 * markdown an agent is handed. What is fixed: the plan. A model's plan cannot
 * be relied on to pick a text search that reaches its limit, or a lookup that
 * fails, so the planning step returns a plan that does; everything after it
 * is the production path.
 *
 * The graph store is a temporary one in which this repository is registered,
 * so the daemon's own store is not opened.
 *
 * Gated INSRC_LIVE_TESTS=1. One model call per test.
 *
 * Run:
 *   PATH=/opt/homebrew/opt/node@22/bin:$PATH INSRC_LIVE_TESTS=1 \
 *     npx tsx --test --test-force-exit --test-timeout=900000 \
 *     src/analyze/context/__tests__/completeness.live.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { upsertEntities } from '../../../db/entities.js';
import { closeGraphStore, setGraphStorePath } from '../../../db/graph/store.js';
import { addRepo } from '../../../db/repos.js';
import { renderBundleAsMarkdown } from '../../../mcp/bundle-md.js';
import type { ClassifiedIntent } from '../../../shared/analyze-types.js';
import { PATHS } from '../../../shared/paths.js';
import type { Entity } from '../../../shared/types.js';
import { renderCompletenessLine } from '../../completeness.js';
import type { ExecutedPlan, ExplorationPlan, SearchTextOutput } from '../../explore/types.js';
import { runShaper, _realPipelineStepsForTest, type PipelineSteps } from '../driver.js';
import { SCHEMA_VERSION } from '../schema.js';

const GATE = process.env['INSRC_LIVE_TESTS'] === '1';
if (!GATE) {
	test('completeness.live: skipped (set INSRC_LIVE_TESTS=1)', { skip: true }, () => {});
}

/** This repository's root. */
const REPO = realpathSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..'));

let sandbox: string;
const runIds: string[] = [];

test.before(async () => {
	if (!GATE) return;
	await closeGraphStore();
	sandbox = mkdtempSync(join(tmpdir(), 'analyze-completeness-live-'));
	setGraphStorePath(join(sandbox, 'graph.lmdb'));
	await addRepo(null, { path: REPO, name: REPO, addedAt: '2026-10-08T00:00:00.000Z', status: 'ready' });
	// One stored entity: a repo scope resolves only when the repo has indexed entities.
	await upsertEntities(null, [{
		id: 'e-live-fixture', repo: REPO, file: join(REPO, 'src/analyze/completeness.ts'), kind: 'function', name: 'buildCompleteness',
		language: 'typescript', startLine: 1, endLine: 3,
	} as unknown as Entity]);
});

test.after(async () => {
	if (!GATE) return;
	await closeGraphStore();
	rmSync(sandbox, { recursive: true, force: true });
	for (const id of runIds) rmSync(PATHS.analyzeContext(id), { recursive: true, force: true });
});

function intent(focus: string): ClassifiedIntent {
	return { target: 'code', scope: 'M', focused: true, focus, scopeRef: { kind: 'repo', value: REPO }, reasoning: 'live completeness check' };
}

/** The production steps, with the plan fixed and the executed plan kept for the assertions. */
function stepsWith(plan: ExplorationPlan): { steps: PipelineSteps; executed: ExecutedPlan[] } {
	const executed: ExecutedPlan[] = [];
	const steps: PipelineSteps = {
		..._realPipelineStepsForTest,
		decompose: async () => plan,
		executePlan: async (a) => {
			const out = await _realPipelineStepsForTest.executePlan(a);
			executed.push(out);
			return out;
		},
	};
	return { steps, executed };
}

function send(focus: string, steps: PipelineSteps, tag: string) {
	const runId = `completeness-live-${tag}-${Math.floor(Math.random() * 1e9).toString(16)}`;
	runIds.push(runId);
	return runShaper({
		promptPath: 'prompts/analyze/code.system.md', invocationMode: 'run', shaperId: 'code',
		inputs: { intent: intent(focus) }, opts: { runId }, pipelineSteps: steps,
		// A run-mode request never reaches the tool loop; a provider used there would be a defect.
		provider: new Proxy({}, { get: (_t, prop) => (prop === 'then' ? undefined : () => { throw new Error(`the tool loop was reached (${String(prop)})`); }) }) as never,
	});
}

test('live: a focused request whose text search reaches its limit returns a bundle whose first line says it is incomplete and names that lookup',
{ skip: !GATE }, async () => {
	// `import` occurs in every source file of this repository: five hits cannot be all of them.
	const { steps, executed } = stepsWith({
		answerType: 'how-does-it-work', synthesisHint: 'say where the word occurs',
		explorations: [{ id: 'e1', type: 'search.text', purpose: 'find where the word occurs', params: { pattern: 'import', topK: 5 } }],
	} as unknown as ExplorationPlan);

	const bundle = await send('where is the word import used in this repository', steps, 'limit');

	// The lookup really ran over this repository and really stopped at its limit.
	const output = executed[0]!.results[0]!.output as SearchTextOutput;
	assert.equal(output.type, 'search.text');
	assert.equal(output.root, REPO);
	assert.equal(output.hits.length, 5);
	assert.equal(output.completeness.complete, false);
	assert.equal(output.completeness.limited?.[0]?.limit, 5);

	// The bundle carries the report code derived from it.
	assert.equal(bundle.meta.schemaVersion, SCHEMA_VERSION);
	assert.equal(bundle.report?.completeness.complete, false);
	assert.deepEqual(bundle.report?.completeness.incomplete.map(n => n.sourceId), ['search.text [e1]']);
	assert.match(bundle.report?.completeness.incomplete[0]?.reason ?? '', /limit of 5 /);
	assert.deepEqual(bundle.report?.completeness.failed, []);
	assert.ok(bundle.summary.trim().length > 0, 'the model wrote the answer');

	// What an agent reads: the first line says the answer is incomplete and names the lookup.
	const first = renderBundleAsMarkdown(bundle).split('\n')[0] ?? '';
	assert.equal(first, renderCompletenessLine(bundle.report!));
	assert.match(first, /^Incomplete: 1 incomplete: search\.text \[e1\] — limit of 5 /);
});

test('live: a request with a lookup made to fail returns a bundle that lists it as failed, not as empty',
{ skip: !GATE }, async () => {
	const { steps, executed } = stepsWith({
		answerType: 'how-does-it-work', synthesisHint: 'say what was found',
		explorations: [
			// A name that occurs a handful of times under src/analyze: found in full.
			// (Searched from the repository root, the same lookup is honestly incomplete:
			// this repository holds generated HTML files over the search's 2 MB limit,
			// and each is named as skipped.)
			{ id: 'e1', type: 'search.text', purpose: 'find the constant', params: { pattern: 'RUN_COMPLETENESS_NOT_RECORDED', topK: 50, path: join(REPO, 'src/analyze') } },
			// An unterminated group: the search cannot run.
			{ id: 'e2', type: 'search.text', purpose: 'find the call sites', params: { pattern: 'renderCompletenessLine(', topK: 50 } },
		],
	} as unknown as ExplorationPlan);

	const bundle = await send('where is the not-recorded line written', steps, 'failed');

	const [found, failed] = executed[0]!.results;
	assert.equal(found!.output.type, 'search.text');
	assert.ok((found!.output as SearchTextOutput).hits.length > 0);
	assert.equal((found!.output as SearchTextOutput).completeness.complete, true, JSON.stringify((found!.output as SearchTextOutput).completeness));
	// Failed, with its reason; not a text search that returned no hits.
	assert.equal(failed!.output.type, 'failed');
	assert.equal('hits' in failed!.output, false);

	assert.equal(bundle.report?.completeness.complete, false);
	assert.deepEqual(bundle.report?.completeness.failed.map(n => n.sourceId), ['search.text [e2]']);
	assert.ok((bundle.report?.completeness.failed[0]?.reason ?? '').length > 0);
	// The lookup that ran in full is not named as incomplete or failed.
	assert.equal(bundle.report?.completeness.incomplete.some(n => n.sourceId === 'search.text [e1]'), false);

	const first = renderBundleAsMarkdown(bundle).split('\n')[0] ?? '';
	assert.match(first, /^Incomplete: .*1 failed: search\.text \[e2\] — /);
});
