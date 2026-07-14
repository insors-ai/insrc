/**
 * Unit tests for the V2 server-side state store used by
 * `insrc_analyze_step`. V2 replaced the base64+gzip wire blob with a
 * short opaque token backed by an in-memory store (see state-store.ts)
 * after live-test corruption from LLM transcription errors on the V1
 * blob.
 *
 * Regressing this file breaks every multi-turn run.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { ClassifiedIntent } from '../../shared/analyze-types.js';
import {
	assertStage,
	decodeState,
	encodeState,
	StepStateDecodeError,
	STATE_VERSION,
	type StepStatePayload,
} from '../analyze-step/state.js';
import {
	_clearStateStoreForTests,
	_stateStoreSize,
	releaseState,
} from '../analyze-step/state-store.js';

const INTENT: ClassifiedIntent = {
	target:    'code',
	scope:     'M',
	focused:   true,
	focus:     'map the payable module',
	scopeRef:  { kind: 'workspace', value: '/repo' },
	reasoning: 'test',
};

function samplePayload(overrides?: Partial<StepStatePayload>): StepStatePayload {
	return {
		version:        STATE_VERSION,
		runId:          'run-1',
		repoPath:       '/repo',
		repoIndexedAt:  1_720_000_000_000,
		intent:         INTENT,
		synthesizerKey: 'code',
		stage:          'awaiting_plan',
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// encodeState + decodeState round-trip
// ---------------------------------------------------------------------------

test('encodeState + decodeState round-trip preserves every field', () => {
	_clearStateStoreForTests();
	const p = samplePayload();
	const token = encodeState(p);
	const back = decodeState(token);
	assert.deepEqual(back, p);
});

test('encodeState mints a short URL-safe base64 token (22 chars, no padding)', () => {
	_clearStateStoreForTests();
	const p = samplePayload();
	const token = encodeState(p);
	// 16 random bytes URL-safe base64 without padding = 22 chars.
	assert.equal(token.length, 22);
	assert.match(token, /^[A-Za-z0-9_-]+$/);
	assert.doesNotMatch(token, /[=+/]/);   // no padding, no + or /
});

test('decodeState rejects a bogus token with StepStateDecodeError', () => {
	_clearStateStoreForTests();
	assert.throws(
		() => decodeState('this-token-was-never-issued'),
		(err: unknown) =>
			err instanceof StepStateDecodeError && err.code === 'malformed',
	);
});

test('decodeState rejects a token of the wrong shape (too short)', () => {
	_clearStateStoreForTests();
	assert.throws(
		() => decodeState('short'),
		(err: unknown) =>
			err instanceof StepStateDecodeError && err.code === 'malformed',
	);
});

// ---------------------------------------------------------------------------
// stage assertion
// ---------------------------------------------------------------------------

test('assertStage passes for a matching stage', () => {
	const p = samplePayload({ stage: 'awaiting_bundle' });
	assert.doesNotThrow(() => assertStage(p, 'awaiting_bundle'));
});

test('assertStage throws on a stage mismatch', () => {
	const p = samplePayload({ stage: 'awaiting_plan' });
	assert.throws(
		() => assertStage(p, 'awaiting_bundle'),
		(err: unknown) =>
			err instanceof StepStateDecodeError && err.code === 'wrong-stage',
	);
});

// ---------------------------------------------------------------------------
// Store hygiene
// ---------------------------------------------------------------------------

test('releaseState drops the entry so a subsequent decodeState fails', () => {
	_clearStateStoreForTests();
	const token = encodeState(samplePayload());
	assert.equal(_stateStoreSize(), 1);
	releaseState(token);
	assert.equal(_stateStoreSize(), 0);
	assert.throws(() => decodeState(token));
});

test('token round-trips a state with an executed plan attached', () => {
	_clearStateStoreForTests();
	const p = samplePayload({
		stage: 'awaiting_bundle',
		plan: {
			answerType:    'structural-map',
			synthesisHint: 'test hint',
			explorations: [
				{
					id:       'e1',
					type:     'concept.resolve',
					purpose:  'resolve the module',
					params:   { query: 'payable' },
				},
			],
		},
		executed: {
			plan: {
				answerType:    'structural-map',
				synthesisHint: 'test hint',
				explorations: [],
			},
			results:     [],
			totalMs:     0,
			totalCached: 0,
		},
	});
	const token = encodeState(p);
	const back = decodeState(token);
	assert.deepEqual(back, p);
});
