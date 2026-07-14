/**
 * Handler-level tests for `insrc_analyze_step`. Covers:
 *  - Phase router (bad phase / missing phase → error result)
 *  - `start` returns emit_plan with a valid state
 *  - `plan` with a garbled state → wrong-state error
 *  - `bundle` with a stage='awaiting_plan' state → wrong-stage error
 *  - Envelope shape: MCP { content: [{type:'text', text: JSON}] }
 *
 * `start` needs a repo path resolved via INSRC_REPO; it also calls
 * prepareDecompose (loads the decomposer prompt from disk). We use
 * the local insrc-ide repo path, which exists on the dev tree.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { handleAnalyzeStep } from '../analyze-step/handler.js';
import type {
	StepOutputEmitBundle,
	StepOutputEmitPlan,
	StepOutputError,
} from '../analyze-step/types.js';

// The dev tree; the analyze framework's `resolveRepoLastIndexedAt`
// returns undefined if the repo isn't registered, which is fine for
// unit-test coverage of the routing / state-decode paths.
const DEV_REPO = '/Users/subhagho/work/projects/insors/insrc-ide';

function parseEnvelope<T = unknown>(envelope: { content: { text: string }[] }): T {
	return JSON.parse(envelope.content[0]!.text) as T;
}

// ---------------------------------------------------------------------------
// Phase router
// ---------------------------------------------------------------------------

test('handler rejects non-object input', async () => {
	const envelope = await handleAnalyzeStep('not an object');
	assert.equal(envelope.isError, true);
	const out = parseEnvelope<StepOutputError>(envelope);
	assert.equal(out.next,        'error');
	assert.equal(out.error.code,  'bad-input');
	assert.equal(out.error.retryable, false);
});

test('handler rejects an unknown phase', async () => {
	const envelope = await handleAnalyzeStep({ phase: 'walk_dog' });
	assert.equal(envelope.isError, true);
	const out = parseEnvelope<StepOutputError>(envelope);
	assert.equal(out.next,       'error');
	assert.equal(out.error.code, 'bad-phase');
});

test('handler rejects missing phase field', async () => {
	const envelope = await handleAnalyzeStep({ focus: 'x' });
	assert.equal(envelope.isError, true);
	const out = parseEnvelope<StepOutputError>(envelope);
	assert.equal(out.error.code, 'bad-input');
});

// ---------------------------------------------------------------------------
// start phase
// ---------------------------------------------------------------------------

test('start returns emit_plan with a state blob + a real prompt', async () => {
	const envelope = await handleAnalyzeStep({
		phase:  'start',
		repo:   DEV_REPO,
		focus:  'map the analyze/context module',
		target: 'code',
		scope:  'S',
	});
	assert.notEqual(envelope.isError, true);
	const out = parseEnvelope<StepOutputEmitPlan>(envelope);
	assert.equal(out.next, 'emit_plan');
	// Decomposer prompt is expected content: the guidance references
	// the exploration catalog.
	assert.match(out.prompt, /exploration catalog|decomposer|answer type/i);
	assert.match(out.userTurn, /Classified intent/);
	assert.equal(typeof out.schema, 'object');
	// State token is 22 chars URL-safe base64 (V2 server-side store).
	assert.match(out.state, /^[A-Za-z0-9_-]+$/);
	assert.equal(out.state.length, 22);
	// Guidance names the next tool call.
	assert.match(out.guidance, /phase="plan"/);
});

test('start with no repo + no INSRC_REPO env throws a clear error', async () => {
	const priorEnv = process.env['INSRC_REPO'];
	delete process.env['INSRC_REPO'];
	try {
		const envelope = await handleAnalyzeStep({
			phase: 'start',
			focus: 'x',
		});
		const out = parseEnvelope<StepOutputError>(envelope);
		assert.equal(out.next, 'error');
		assert.match(out.error.message, /no repo/);
	} finally {
		if (priorEnv !== undefined) process.env['INSRC_REPO'] = priorEnv;
	}
});

// ---------------------------------------------------------------------------
// plan phase -- state validation before we hit executePlan
// ---------------------------------------------------------------------------

test('plan phase with a garbage state blob returns wrong-state error', async () => {
	const envelope = await handleAnalyzeStep({
		phase: 'plan',
		plan:  { answerType: 'structural-map', synthesisHint: 'x', explorations: [] },
		state: 'not-a-valid-state',
	});
	const out = parseEnvelope<StepOutputError>(envelope);
	assert.equal(out.next,       'error');
	assert.equal(out.error.code, 'state-decode');
});

// ---------------------------------------------------------------------------
// bundle phase -- state stage check
// ---------------------------------------------------------------------------

test('bundle phase with awaiting_plan state returns wrong-stage error', async () => {
	// Get a valid state from start.
	const startEnvelope = await handleAnalyzeStep({
		phase:  'start',
		repo:   DEV_REPO,
		focus:  'map the analyze/context module',
		target: 'code',
		scope:  'S',
	});
	const startOut = parseEnvelope<StepOutputEmitPlan>(startEnvelope);

	// Feed the start-emitted state into bundle -- wrong stage.
	const bundleEnvelope = await handleAnalyzeStep({
		phase:  'bundle',
		bundle: {
			system:    's', focus: 'f', summary: 'sum', structure: 'st',
			surface:   'sur', artefacts: 'a', upstream: '',
		},
		state:  startOut.state,
	});
	const bundleOut = parseEnvelope<StepOutputError>(bundleEnvelope);
	assert.equal(bundleOut.next,       'error');
	assert.equal(bundleOut.error.code, 'state-decode');
	assert.match(bundleOut.error.message, /out of order|awaiting_bundle/);
});

// ---------------------------------------------------------------------------
// Envelope shape
// ---------------------------------------------------------------------------

test('envelope is { content: [{type:"text", text: JSON}] }', async () => {
	const envelope = await handleAnalyzeStep({
		phase:  'start',
		repo:   DEV_REPO,
		focus:  'x',
		target: 'code',
		scope:  'S',
	});
	assert.ok(Array.isArray(envelope.content));
	assert.equal(envelope.content.length, 1);
	assert.equal(envelope.content[0]?.type, 'text');
	assert.doesNotThrow(() => JSON.parse(envelope.content[0]!.text));
});

// ---------------------------------------------------------------------------
// StepOutputEmitBundle type is referenced by the roundtrip smoke test;
// keep the import from getting tree-shaken.
// ---------------------------------------------------------------------------
void (null as unknown as StepOutputEmitBundle);
