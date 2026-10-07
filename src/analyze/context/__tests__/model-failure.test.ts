/**
 * isModelCallFailure and its two first users: the planning call
 * (decompose) and the answer-writing call (synthesize). Each must
 * report a failed call as its model-unavailable error whichever
 * provider served it, and a wrong-shaped answer as its schema error.
 *
 * Stand-in providers only -- no LMDB, no LLM. The two calls read
 * their prompt files from disk, which is the real, shipped prompt.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ModelCallFailedError, ModelResponseShapeError } from '../../../agent/providers/model-call-error.js';
import type { ClassifiedIntent } from '../../../shared/analyze-types.js';
import type { LLMProvider } from '../../../shared/types.js';
import type { ExecutedPlan } from '../../explore/types.js';
import {
	decompose,
	DecomposerLlmUnavailableError,
	DecomposerPromptMissingError,
	DecomposerSchemaUnrecoverable,
} from '../decomposer.js';
import { isModelCallFailure, modelCallFailureDetail } from '../model-failure.js';
import {
	synthesize,
	SynthesizerLlmUnavailableError,
	SynthesizerPromptMissingError,
	SynthesizerSchemaUnrecoverable,
} from '../synthesizer.js';

const OLLAMA_TEXTS = [
	'Ollama is not running',
	'Model not found',
	'ECONNREFUSED',
	'ECONNRESET',
	'fetch failed',
	'socket hang up',
	'EPIPE',
	'other side closed',
	'Did not receive done or success response in stream',
];

/** The CLI provider's own wording for a failed call (cli-provider.ts). */
const CLI_CALL_FAILURES = [
	'claude --print failed: rate limited',
	'claude exited with 1. stderr=boom stdout=',
	'claude exited with -1. stderr=\nspawn error: spawn claude ENOENT stdout=',
	'codex emitted error event: {"type":"error"}',
	'codex exited with 2. stderr=boom',
];

/** Answers that arrived but are unusable: failures of shape, not of the call. */
const SHAPE_FAILURES = [
	'claude envelope had is_error=false but no structured_output field',
	'codex agent_message.text was not parseable JSON: Unexpected token. text=hello',
	'codex emitted no agent_message item',
	'structured-output: validation failed after 3 attempts: /answerType must be string',
	'McpSamplingProvider: response was not valid JSON: Unexpected end. text=',
];

const INTENT: ClassifiedIntent = {
	target:    'code',
	scope:     'M',
	focused:   true,
	focus:     'how does the payable pipeline work',
	scopeRef:  { kind: 'workspace', value: '/tmp/probe-repo' },
	reasoning: 'test',
};

const EXECUTED: ExecutedPlan = {
	plan:        { answerType: 'how-does-it-work', synthesisHint: 't', explorations: [] },
	results:     [],
	elapsedMs:   0,
	cacheHits:   0,
	cacheMisses: 0,
} as unknown as ExecutedPlan;

/** A provider whose structured call always rejects with `err`. */
function failingProvider(err: unknown): LLMProvider {
	return {
		completeStructured: async () => { throw err; },
	} as unknown as LLMProvider;
}

async function caught(run: () => Promise<unknown>): Promise<unknown> {
	try { await run(); } catch (err) { return err; }
	assert.fail('expected the call to reject');
}

// ---------------------------------------------------------------------------
// isModelCallFailure
// ---------------------------------------------------------------------------

test('isModelCallFailure: Ollama texts, CLI call failures, ModelCallFailedError are failures; shape failures are not', () => {
	for (const text of OLLAMA_TEXTS) {
		assert.equal(isModelCallFailure(new Error(text)), true, text);
		// The local provider's retry wrapper puts the text mid-message.
		assert.equal(isModelCallFailure(new Error(`structured-output: validation failed after 3 attempts: ${text}`)), true, text);
	}
	for (const text of CLI_CALL_FAILURES) {
		assert.equal(isModelCallFailure(new Error(text)), true, text);
	}
	assert.equal(isModelCallFailure(new ModelCallFailedError('client declined the request')), true);

	for (const text of SHAPE_FAILURES) {
		assert.equal(isModelCallFailure(new Error(text)), false, text);
	}
	assert.equal(isModelCallFailure(new ModelResponseShapeError('mcp sampling: response content was not text (type=image)')), false);
	assert.equal(isModelCallFailure('ECONNREFUSED'), false, 'a non-Error is not classified by text');
	assert.equal(isModelCallFailure(undefined), false);
});

test('modelCallFailureDetail returns the failure\'s own words', () => {
	assert.equal(modelCallFailureDetail(new ModelCallFailedError('client declined')), 'client declined');
	assert.equal(modelCallFailureDetail(new Error('claude exited with 1')), 'claude exited with 1');
});

// ---------------------------------------------------------------------------
// The planning and answer-writing classifiers
// ---------------------------------------------------------------------------

test('planning and answer-writing classifiers raise their model-unavailable error for a CLI call failure', async () => {
	for (const text of CLI_CALL_FAILURES) {
		const planning = await caught(() => decompose({ intent: INTENT, runId: 'r', provider: failingProvider(new Error(text)) }));
		assert.ok(planning instanceof DecomposerLlmUnavailableError, `planning: ${text} -> ${(planning as Error).name}`);
		assert.ok(!(planning instanceof DecomposerSchemaUnrecoverable));

		const answer = await caught(() => synthesize({
			intent: INTENT, executed: EXECUTED, runId: 'r', target: 'code',
			provider: failingProvider(new Error(text)),
		}));
		assert.ok(answer instanceof SynthesizerLlmUnavailableError, `answer writing: ${text} -> ${(answer as Error).name}`);
		assert.ok(!(answer instanceof SynthesizerSchemaUnrecoverable));
	}
});

test('planning and answer-writing classifiers raise their model-unavailable error for a typed sampling failure', async () => {
	const failure = new ModelCallFailedError('client declined the sampling request');
	const planning = await caught(() => decompose({ intent: INTENT, runId: 'r', provider: failingProvider(failure) }));
	assert.ok(planning instanceof DecomposerLlmUnavailableError);
	const answer = await caught(() => synthesize({
		intent: INTENT, executed: EXECUTED, runId: 'r', target: 'code', provider: failingProvider(failure),
	}));
	assert.ok(answer instanceof SynthesizerLlmUnavailableError);
});

test('a shape failure stays a schema error for both calls', async () => {
	for (const text of SHAPE_FAILURES) {
		const planning = await caught(() => decompose({ intent: INTENT, runId: 'r', provider: failingProvider(new Error(text)) }));
		assert.ok(planning instanceof DecomposerSchemaUnrecoverable, `planning: ${text} -> ${(planning as Error).name}`);
		const answer = await caught(() => synthesize({
			intent: INTENT, executed: EXECUTED, runId: 'r', target: 'code',
			provider: failingProvider(new Error(text)),
		}));
		assert.ok(answer instanceof SynthesizerSchemaUnrecoverable, `answer writing: ${text} -> ${(answer as Error).name}`);
	}
});

test('model-unavailable messages are provider-neutral and carry the underlying message in a field', async () => {
	const cli = 'claude exited with 1. stderr=overloaded';
	const planning = await caught(() => decompose({ intent: INTENT, runId: 'r', provider: failingProvider(new Error(cli)) })) as DecomposerLlmUnavailableError;
	assert.equal(planning.message, `The model call for planning failed: ${cli}`);
	assert.equal(planning.detail, cli);
	assert.ok(!planning.message.includes('Ollama'));

	const answer = await caught(() => synthesize({
		intent: INTENT, executed: EXECUTED, runId: 'r', target: 'code', provider: failingProvider(new Error(cli)),
	})) as SynthesizerLlmUnavailableError;
	assert.equal(answer.message, `The model call for answer writing failed: ${cli}`);
	assert.equal(answer.detail, cli);
	assert.ok(!answer.message.includes('Ollama'));

	// A typed sampling failure: the detail is the client's own words,
	// without the typed error's prefix.
	const sampled = await caught(() => decompose({
		intent: INTENT, runId: 'r', provider: failingProvider(new ModelCallFailedError('client declined')),
	})) as DecomposerLlmUnavailableError;
	assert.equal(sampled.detail, 'client declined');
	assert.equal(sampled.message, 'The model call for planning failed: client declined');

	// A failure that DID come from Ollama still says so, through the
	// underlying message -- the prefix no longer asserts it.
	const local = await caught(() => decompose({
		intent: INTENT, runId: 'r', provider: failingProvider(new Error('Ollama is not running at http://localhost:11434')),
	})) as DecomposerLlmUnavailableError;
	assert.match(local.message, /^The model call for planning failed: Ollama is not running/);
});

test('the two prompt-missing errors carry the prompt path', () => {
	const d = new DecomposerPromptMissingError('/x/decompose.system.md');
	assert.equal(d.path, '/x/decompose.system.md');
	assert.match(d.message, /\/x\/decompose\.system\.md/);
	const s = new SynthesizerPromptMissingError('/x/synthesize.code.system.md');
	assert.equal(s.path, '/x/synthesize.code.system.md');
	assert.match(s.message, /\/x\/synthesize\.code\.system\.md/);
});
