/**
 * Unit tests for the Phase B narrow-phase machinery.
 *
 * These tests exercise:
 *  1. State codec: awaiting_narrow round-trip with a preparedBlob +
 *     resumeState survives encode/decode.
 *  2. Handler router: phase='narrow' with a garbage state -> error.
 *  3. Handler router: phase='narrow' with an awaiting_plan state ->
 *     wrong-stage error (state machine enforcement).
 *  4. Handler router: phase='narrow' when the echoed explorationId
 *     doesn't match the paused exploration -> wrong-exploration
 *     error (defence against stale state blob).
 *
 * The actual "run narrow finalize + resume stepPlan" path is exercised
 * by the standalone smoke test (mcp-step-narrow-smoke.mjs) because it
 * needs a real repo + a plan that emits a narrow-LLM exploration.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { ClassifiedIntent } from '../../shared/analyze-types.js';
import { handleAnalyzeStep } from '../analyze-step/handler.js';
import {
	assertStage,
	decodeState,
	encodeState,
	StepStateDecodeError,
	STATE_VERSION,
	type StepStatePayload,
} from '../analyze-step/state.js';
import type {
	StepOutputEmitPlan,
	StepOutputError,
} from '../analyze-step/types.js';

const DEV_REPO = '/Users/subhagho/work/projects/insors/insrc-ide';

const INTENT: ClassifiedIntent = {
	target:    'code',
	scope:     'M',
	focused:   true,
	focus:     'x',
	scopeRef:  { kind: 'workspace', value: DEV_REPO },
	reasoning: 'test',
};

function parseEnvelope<T = unknown>(envelope: { content: { text: string }[] }): T {
	return JSON.parse(envelope.content[0]!.text) as T;
}

// ---------------------------------------------------------------------------
// State codec: narrow-pause round-trip
// ---------------------------------------------------------------------------

test('state codec round-trips awaiting_narrow with preparedBlob + resumeState', () => {
	const original: StepStatePayload = {
		version:        STATE_VERSION,
		runId:          'test-run-narrow',
		repoPath:       DEV_REPO,
		repoIndexedAt:  1_720_000_000_000,
		intent:         INTENT,
		synthesizerKey: 'adherence',
		stage:          'awaiting_narrow',
		plan: {
			answerType:    'adherence-check',
			synthesisHint: 'test hint',
			explorations: [
				{
					id:      'e1',
					type:    'doc.decision.trace',
					purpose: 'resolve module',
					params:  { topic: 'test-topic' },
				},
			],
		},
		narrow: {
			explorationId:   'e1',
			explorationType: 'doc.decision.trace',
			preparedBlob: {
				topic:                 'test-topic',
				retrievedSectionCount: 3,
				validEntityIds:        ['id-1', 'id-2', 'id-3'],
			},
			resumeState: {
				results: [],
				outputs: [],
				totalCached:  0,
				totalMsSoFar: 42,
			},
		},
	};
	const blob = encodeState(original);
	const back = decodeState(blob);
	assert.deepEqual(back, original);
	assert.doesNotThrow(() => assertStage(back, 'awaiting_narrow'));
});

// ---------------------------------------------------------------------------
// Handler router: garbage state on phase='narrow'
// ---------------------------------------------------------------------------

test('handler rejects phase=narrow with a garbage state blob', async () => {
	const envelope = await handleAnalyzeStep({
		phase:         'narrow',
		explorationId: 'e1',
		narrow:        { topic: 'x', decisions: [], notFoundNote: '' },
		state:         'not-a-state',
	});
	const out = parseEnvelope<StepOutputError>(envelope);
	assert.equal(out.next,       'error');
	assert.equal(out.error.code, 'state-decode');
});

// ---------------------------------------------------------------------------
// Handler router: wrong-stage on phase='narrow' with awaiting_plan state
// ---------------------------------------------------------------------------

test('handler rejects phase=narrow when state stage is awaiting_plan', async () => {
	// Get a valid awaiting_plan state from start.
	const startEnvelope = await handleAnalyzeStep({
		phase:  'start',
		repo:   DEV_REPO,
		focus:  'x',
		target: 'code',
		scope:  'S',
	});
	const startOut = parseEnvelope<StepOutputEmitPlan>(startEnvelope);

	const envelope = await handleAnalyzeStep({
		phase:         'narrow',
		explorationId: 'e1',
		narrow:        { topic: 'x', decisions: [], notFoundNote: '' },
		state:         startOut.state,
	});
	const out = parseEnvelope<StepOutputError>(envelope);
	assert.equal(out.next,       'error');
	assert.equal(out.error.code, 'state-decode');
	assert.match(out.error.message, /awaiting_narrow/);
});

// ---------------------------------------------------------------------------
// Handler router: wrong explorationId echoed
// ---------------------------------------------------------------------------

test('handler rejects phase=narrow when explorationId does not match paused exp', async () => {
	// Hand-craft an awaiting_narrow state.
	const state: StepStatePayload = {
		version:        STATE_VERSION,
		runId:          'test-run-mismatch',
		repoPath:       DEV_REPO,
		repoIndexedAt:  1_720_000_000_000,
		intent:         INTENT,
		synthesizerKey: 'adherence',
		stage:          'awaiting_narrow',
		plan: {
			answerType:    'adherence-check',
			synthesisHint: 'test',
			explorations: [
				{ id: 'e1', type: 'doc.decision.trace', purpose: 'p', params: { topic: 't' } },
			],
		},
		narrow: {
			explorationId:   'e1',
			explorationType: 'doc.decision.trace',
			preparedBlob: {
				topic:                 't',
				retrievedSectionCount: 0,
				validEntityIds:        [],
			},
			resumeState: {
				results: [], outputs: [], totalCached: 0, totalMsSoFar: 0,
			},
		},
	};
	const stateBlob = encodeState(state);

	const envelope = await handleAnalyzeStep({
		phase:         'narrow',
		explorationId: 'DIFFERENT-ID',
		narrow:        { topic: 't', decisions: [], notFoundNote: '' },
		state:         stateBlob,
	});
	const out = parseEnvelope<StepOutputError>(envelope);
	assert.equal(out.next,       'error');
	assert.equal(out.error.code, 'wrong-exploration');
	assert.equal(out.error.retryable, true);
});
