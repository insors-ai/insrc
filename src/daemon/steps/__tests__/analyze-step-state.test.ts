/**
 * Unit tests for the V2 server-side state store used by
 * `insrc_analyze_step`. V2 replaced the base64+gzip wire blob with a
 * short opaque token backed by an in-memory store (see state-store.ts)
 * after live-test corruption from LLM transcription errors on the V1
 * blob.
 *
 * Regressing this file breaks every multi-turn run.
 *
 * Runs against the hub-backed store (Epic 86197ac6 s1/t8): every call
 * crosses a MessageChannel to the shared store, as it does from a worker.
 */

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { MessageChannel } from 'node:worker_threads';

import type { ClassifiedIntent } from '../../../shared/analyze-types.js';
import {
	assertStage,
	decodeState,
	encodeState,
	reencodeState,
	StepStateDecodeError,
	STATE_VERSION,
	type StepStatePayload,
} from '../analyze-step/state.js';
import {
	_clearStateStoreForTests,
	_stateStoreSize,
	loadState,
	releaseState,
	replaceState,
	saveState,
} from '../analyze-step/state-store.js';
import { HubClient, serveHub } from '../../threads/channel.js';
import {
	HubStepStateStore,
	installStepStateStore,
	LocalStepStateStore,
	stepStateHubHandlers,
} from '../../threads/step-state.js';

const hubChannel = new MessageChannel();
before(() => {
	serveHub(hubChannel.port1, stepStateHubHandlers(new LocalStepStateStore()));
	installStepStateStore(new HubStepStateStore(new HubClient(hubChannel.port2)));
});
after(() => {
	installStepStateStore(new LocalStepStateStore());
	hubChannel.port1.close();
	hubChannel.port2.close();
});

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

test('encodeState + decodeState round-trip preserves every field', async () => {
	await _clearStateStoreForTests();
	const p = samplePayload();
	const token = await encodeState(p);
	const back = await decodeState(token);
	assert.deepEqual(back, p);
});

test('encodeState mints a short URL-safe base64 token (22 chars, no padding)', async () => {
	await _clearStateStoreForTests();
	const p = samplePayload();
	const token = await encodeState(p);
	// 16 random bytes URL-safe base64 without padding = 22 chars.
	assert.equal(token.length, 22);
	assert.match(token, /^[A-Za-z0-9_-]+$/);
	assert.doesNotMatch(token, /[=+/]/);   // no padding, no + or /
});

test('decodeState rejects a bogus token with StepStateDecodeError', async () => {
	await _clearStateStoreForTests();
	await assert.rejects(
		() => decodeState('this-token-was-never-issued'),
		(err: unknown) =>
			err instanceof StepStateDecodeError && err.code === 'malformed',
	);
});

test('decodeState rejects a token of the wrong shape (too short)', async () => {
	await _clearStateStoreForTests();
	await assert.rejects(
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

test('releaseState drops the entry so a subsequent decodeState fails', async () => {
	await _clearStateStoreForTests();
	const token = await encodeState(samplePayload());
	assert.equal(await _stateStoreSize(), 1);
	await releaseState(token);
	assert.equal(await _stateStoreSize(), 0);
	await assert.rejects(() => decodeState(token));
});

test('token round-trips a state with an executed plan attached', async () => {
	await _clearStateStoreForTests();
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
	const token = await encodeState(p);
	const back = await decodeState(token);
	assert.deepEqual(back, p);
});

// ---------------------------------------------------------------------------
// E20260929c71f7106:S001 — replaceState / reencodeState in the analyze-step peer
// store (the other leaking store). Same release-superseded-on-save invariant.
// ---------------------------------------------------------------------------

test('analyze replaceState: a > MAX_ENTRIES(100) run keeps ~1 live token; active token never LRU-evicted', async () => {
	await _clearStateStoreForTests();
	let token = await saveState(samplePayload());
	for (let i = 0; i < 150; i++) {
		const next = await replaceState(token, samplePayload());
		assert.notEqual(next, token);
		await assert.rejects(() => loadState(token));   // superseded token released (single-use)
		assert.equal((await loadState(next)).runId, 'run-1');   // fresh token resolves
		assert.equal(await _stateStoreSize(), 1);             // bounded — no per-turn leak
		token = next;
	}
});

test('analyze replaceState(undefined, ...) === saveState (first-mint, nothing released)', async () => {
	await _clearStateStoreForTests();
	const token = await replaceState(undefined, samplePayload());
	assert.equal(await _stateStoreSize(), 1);
	assert.equal((await loadState(token)).runId, 'run-1');
});

test('analyze reencodeState: version guard throws wrong-version, else delegates (releases prev)', async () => {
	await _clearStateStoreForTests();
	const prev = await encodeState(samplePayload());
	const next = await reencodeState(prev, samplePayload());
	assert.notEqual(next, prev);
	await assert.rejects(() => loadState(prev));        // prev released
	assert.equal((await loadState(next)).runId, 'run-1');
	try {
		await reencodeState(next, samplePayload({ version: 999 as unknown as typeof STATE_VERSION }));
		assert.fail('expected a wrong-version throw');
	} catch (e) {
		assert.ok(e instanceof StepStateDecodeError);
		assert.equal((e as StepStateDecodeError).code, 'wrong-version');
	}
});
