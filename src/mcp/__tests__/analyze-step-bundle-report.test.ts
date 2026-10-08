/**
 * The step tool's bundle phase attaches the answer report it derives from
 * the lookups it executed, and does not take one from the agent
 * (LLD-b9d5c5c40df5a574-s1, task t12).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildCompleteness } from '../../analyze/completeness.js';
import type { ExecutedPlan, ExplorationPlan } from '../../analyze/explore/types.js';
import type { ClassifiedIntent } from '../../shared/analyze-types.js';
import { handleBundle } from '../analyze-step/phases/bundle.js';
import { encodeState, STATE_VERSION, type StepStatePayload } from '../analyze-step/state.js';
import type { StepInputBundle, StepOutputDone, StepOutputError } from '../analyze-step/types.js';

const REPO = '/work/app';
const LAYERS = { system: 's', focus: 'f', summary: 'sum', structure: 'st', surface: 'su', artefacts: 'a', upstream: 'u' };

const INTENT: ClassifiedIntent = { target: 'code', scope: 'M', focused: true, focus: 'charges', scopeRef: { kind: 'workspace', value: REPO }, reasoning: 't' };

const PLAN: ExplorationPlan = {
	answerType: 'structural-map', synthesisHint: 'h',
	explorations: [
		{ id: 'e1', type: 'module.profile', purpose: 'p', params: { path: '/x' } },
		{ id: 'e2', type: 'search.text',    purpose: 'p', params: { pattern: 'charge' } },
		{ id: 'e3', type: 'symbol.locate',  purpose: 'p', params: { names: ['charge'] } },
	],
} as unknown as ExplorationPlan;

/** A state as the tool holds it when it asks the agent for the bundle. */
function awaitingBundle(outputs: readonly unknown[]): string {
	const executed = {
		plan: PLAN,
		results: PLAN.explorations.slice(0, outputs.length).map((e, i) => ({ exploration: e, output: outputs[i], cached: false, elapsedMs: 0 })),
		totalMs: 0, totalCached: 0,
	} as unknown as ExecutedPlan;
	const payload: StepStatePayload = {
		version: STATE_VERSION, runId: 'r1', repoPath: REPO, repoIndexedAt: 1_790_000_000_000,
		intent: INTENT, synthesizerKey: 'code', plan: PLAN, executed, stage: 'awaiting_bundle',
	};
	return encodeState(payload);
}

const WHOLE = { type: 'module.profile', completeness: buildCompleteness({ returned: 4, basis: 'filesystem' }) };
const LIMITED = {
	type: 'search.text',
	completeness: buildCompleteness({
		returned: 30, basis: 'text',
		limited: [{ what: 'hits', limit: 30, scope: 'overall', reason: 'the search stops at 30 hits' }],
	}),
};
const FAILED = { type: 'failed', requested: 'symbol.locate', errorCode: 'runtime-error', message: 'the graph store is closed' };

test("the step tool's bundle phase attaches the report it derives from its state and rejects an agent-supplied one as 'bundle-schema'", async () => {
	// One complete, one limited and one failed lookup in the tool's state.
	const out = await handleBundle({ phase: 'bundle', bundle: LAYERS, state: awaitingBundle([WHOLE, LIMITED, FAILED]) } as StepInputBundle) as StepOutputDone;
	assert.equal(out.next, 'done');
	assert.deepEqual(out.report, {
		completeness: {
			complete:   false,
			incomplete: [{ sourceId: 'search.text [e2]', sourceKind: 'lookup', reason: 'limit of 30 hits reached (the search stops at 30 hits)' }],
			failed:     [{ sourceId: 'symbol.locate [e3]', sourceKind: 'lookup', reason: 'the graph store is closed' }],
		},
	});
	assert.equal(out.meta.schemaVersion, 2);
	assert.equal(out.meta.toolCalls, 3);

	// Every lookup complete: the report says so.
	const whole = await handleBundle({ phase: 'bundle', bundle: LAYERS, state: awaitingBundle([WHOLE]) } as StepInputBundle) as StepOutputDone;
	assert.deepEqual(whole.report, { completeness: { complete: true, incomplete: [], failed: [] } });

	// The agent writes the seven layers. A bundle in which it also states its
	// completeness is rejected, and the state is kept for a corrected bundle.
	const token = awaitingBundle([WHOLE, LIMITED, FAILED]);
	const forged = { ...LAYERS, report: { completeness: { complete: true, incomplete: [], failed: [] } } };
	const rejected = await handleBundle({ phase: 'bundle', bundle: forged, state: token } as unknown as StepInputBundle) as StepOutputError;
	assert.equal(rejected.next, 'error');
	assert.equal(rejected.error.code, 'bundle-schema');
	assert.equal(rejected.error.retryable, true);
	const retried = await handleBundle({ phase: 'bundle', bundle: LAYERS, state: token } as StepInputBundle) as StepOutputDone;
	assert.equal(retried.next, 'done');
	assert.equal(retried.report?.completeness.complete, false, 'the derived report, not the one the agent offered');
});
