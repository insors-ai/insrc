/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic c2ba6fa6, Story s5, Task t1 — every transport failure of the local
 * provider is a ModelCallFailedError (with the client's error as its cause),
 * and the structured retry helper keeps that type on its last attempt.
 * Exercised against a stand-in Ollama client; no live Ollama.
 *
 * Run: npx tsx --test src/agent/providers/__tests__/ollama-model-call-failure.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { OllamaProvider } from '../ollama.js';
import { ModelCallFailedError } from '../model-call-error.js';
import { withStructuredRetry } from '../structured-output.js';
import type { StructuredSchema } from '../../../shared/types.js';

/** The failures the Ollama client raises, as the client raises them. */
const FAILURES: ReadonlyArray<() => Error> = [
	() => new Error('connect ECONNREFUSED 127.0.0.1:11434'),
	() => new Error('socket hang up'),
	() => new TypeError('fetch failed'),
	() => new TypeError('terminated'),
	() => new Error('Did not receive done or success response in stream.'),
];

type Where = 'call' | 'iteration';

/** A stand-in client whose chat() rejects (`call`) or returns a stream that
 *  yields one chunk and then fails (`iteration`). */
function failingClient(make: () => Error, where: Where) {
	const thrown: Error[] = [];
	return {
		thrown,
		chat: async () => {
			const err = make();
			thrown.push(err);
			if (where === 'call') throw err;
			return (async function* () {
				yield { message: { content: '{"a":' }, done: false };
				throw err;
			})();
		},
	};
}

function providerWith(client: unknown): OllamaProvider {
	const p = new OllamaProvider();
	// readonly is compile-time only; override at runtime for the test.
	(p as unknown as { client: unknown }).client = client;
	return p;
}

function assertTyped(err: unknown, original: Error | undefined, label: string): void {
	assert.ok(err instanceof ModelCallFailedError, `${label}: expected ModelCallFailedError, got ${String(err)}`);
	assert.equal(err.cause, original, `${label}: the client's own error is kept as the cause`);
}

const SCHEMA: StructuredSchema = { type: 'object', properties: { a: { type: 'number' } }, required: ['a'] } as unknown as StructuredSchema;

test('OllamaProvider: stream creation and stream iteration failures are raised as ModelCallFailedError with the client error as cause', async () => {
	for (const make of FAILURES) {
		for (const where of ['call', 'iteration'] as const) {
			const client = failingClient(make, where);
			const p = providerWith(client);
			let caught: unknown;
			try {
				for await (const _ of p.stream([{ role: 'user', content: 'hi' }])) { /* drain */ }
			} catch (err) { caught = err; }
			assertTyped(caught, client.thrown[0], `stream ${where} ${make().message}`);
		}
	}
});

test('OllamaProvider: completeStructured failures on the call and during iteration are raised as ModelCallFailedError', async () => {
	for (const make of FAILURES) {
		for (const where of ['call', 'iteration'] as const) {
			const client = failingClient(make, where);
			const p = providerWith(client);
			let caught: unknown;
			try {
				await p.completeStructured([{ role: 'user', content: 'hi' }], SCHEMA, { maxAttempts: 1 });
			} catch (err) { caught = err; }
			assert.ok(caught instanceof ModelCallFailedError, `completeStructured ${where} ${make().message}: got ${String(caught)}`);
			// Behind the retry helper the provider's error is the cause.
			assertTyped((caught as Error).cause, client.thrown[0], `completeStructured ${where} cause`);
		}
	}
});

test('OllamaProvider: complete() raises a connection refused and a socket hang up (after its retry) as ModelCallFailedError', { timeout: 30_000 }, async () => {
	const refused = failingClient(() => new Error('connect ECONNREFUSED 127.0.0.1:11434'), 'call');
	let caught: unknown;
	try { await providerWith(refused).complete([{ role: 'user', content: 'hi' }]); } catch (err) { caught = err; }
	assertTyped(caught, refused.thrown[0], 'complete ECONNREFUSED');
	assert.match((caught as ModelCallFailedError).detail, /^Ollama is not running/);
	assert.equal(refused.thrown.length, 1, 'a refused connection is not retried');

	// socket hang up is transient: retried once, then raised typed.
	const hangup = failingClient(() => new Error('socket hang up'), 'iteration');
	caught = undefined;
	try { await providerWith(hangup).complete([{ role: 'user', content: 'hi' }]); } catch (err) { caught = err; }
	assert.equal(hangup.thrown.length, 2, 'the transient failure was retried once');
	assertTyped(caught, hangup.thrown[1], 'complete socket hang up');
	assert.equal((caught as ModelCallFailedError).detail, 'socket hang up');
});

test('retry helper: a ModelCallFailedError on the last attempt is re-thrown as a ModelCallFailedError with the attempt prefix', async () => {
	const last = new ModelCallFailedError('socket hang up');
	let calls = 0;
	let caught: unknown;
	try {
		await withStructuredRetry(async () => {
			calls += 1;
			if (calls < 3) return { wrong: true };   // a shape failure first ...
			throw last;                              // ... then the call fails
		}, () => ({ ok: false, errors: ['shape'] }), 3);
	} catch (err) { caught = err; }
	assert.ok(caught instanceof ModelCallFailedError);
	assert.equal(caught.detail, 'structured-output: validation failed after 3 attempts: socket hang up');
	assert.equal(caught.message, 'Model call failed: structured-output: validation failed after 3 attempts: socket hang up');
	assert.equal(caught.cause, last);
});

test('retry helper: a shape failure on the last attempt stays a plain Error even after an earlier failed call', async () => {
	let calls = 0;
	let caught: unknown;
	try {
		await withStructuredRetry(async () => {
			calls += 1;
			if (calls === 1) throw new ModelCallFailedError('socket hang up');
			return { wrong: true };
		}, () => ({ ok: false, errors: ['missing a'] }), 2);
	} catch (err) { caught = err; }
	assert.ok(caught instanceof Error);
	assert.ok(!(caught instanceof ModelCallFailedError), 'the last attempt failed on shape, not on the call');
	assert.equal(caught.message, 'structured-output: validation failed after 2 attempts: missing a');
});

test('OllamaProvider: a cancelled call (AbortError) reaches the caller as it was raised, on the call and during iteration, and is not taken for a failed model call', async () => {
	const { isModelCallFailure } = await import('../../../analyze/context/model-failure.js');
	const abort = (): Error => Object.assign(new Error('This operation was aborted'), { name: 'AbortError' });
	for (const where of ['call', 'iteration'] as const) {
		const runs: Array<[string, (p: OllamaProvider) => Promise<unknown>]> = [
			['stream', async p => { for await (const _ of p.stream([{ role: 'user', content: 'hi' }])) { /* drain */ } }],
			['complete', p => p.complete([{ role: 'user', content: 'hi' }])],
			['completeStructured', p => p.completeStructured([{ role: 'user', content: 'hi' }], SCHEMA, { maxAttempts: 1 })],
		];
		for (const [name, run] of runs) {
			const client = failingClient(abort, where);
			let caught: unknown;
			try { await run(providerWith(client)); } catch (err) { caught = err; }
			const label = `${name} ${where}`;
			assert.equal(caught, client.thrown[0], `${label}: the abort itself, unwrapped (got ${String(caught)})`);
			assert.ok(!(caught instanceof ModelCallFailedError), label);
			assert.equal(isModelCallFailure(caught), false, `${label}: not a failed model call`);
			assert.equal(client.thrown.length, 1, `${label}: a cancellation is not retried`);
		}
	}
});

test('retry helper: a cancelled attempt (AbortError) ends the helper at once and is re-thrown as it was raised, not retried and not reported as a failure of shape', async () => {
	const abort = Object.assign(new Error('This operation was aborted'), { name: 'AbortError' });
	let calls = 0;
	let caught: unknown;
	try {
		await withStructuredRetry(async () => { calls += 1; throw abort; }, () => ({ ok: true, value: 1 }), 3);
	} catch (err) { caught = err; }
	assert.equal(caught, abort);
	assert.equal(calls, 1, 'not retried');
});

/** The Ollama client's ResponseError, as the client raises it: name, message and the server's HTTP status. */
function responseError(status: number, message: string): Error {
	return Object.assign(new Error(message), { name: 'ResponseError', error: message, status_code: status });
}

test('OllamaProvider (ISSUE-fb584b48): a request the server rejected for its content (ResponseError 4xx) reaches the caller as it was raised, with its status, not as a failed model call; a 404 (model not found), a 408 or 429 (not reached in time) and a 5xx stay failed model calls', async () => {
	const { isModelCallFailure } = await import('../../../analyze/context/model-failure.js');
	for (const where of ['call', 'iteration'] as const) {
		const runs: Array<[string, (p: OllamaProvider) => Promise<unknown>]> = [
			['stream', async p => { for await (const _ of p.stream([{ role: 'user', content: 'hi' }])) { /* drain */ } }],
			['complete', p => p.complete([{ role: 'user', content: 'hi' }])],
		];
		for (const [name, run] of runs) {
			const rejected = failingClient(() => responseError(400, 'invalid format: schema is not valid JSON'), where);
			let caught: unknown;
			try { await run(providerWith(rejected)); } catch (err) { caught = err; }
			const label = `${name} ${where} 400`;
			assert.equal(caught, rejected.thrown[0], `${label}: the rejection itself (got ${String(caught)})`);
			assert.equal((caught as { status_code?: number }).status_code, 400, label);
			assert.equal(isModelCallFailure(caught), false, `${label}: not reported as an outage`);
			assert.equal(rejected.thrown.length, 1, `${label}: not retried`);

			const missing = failingClient(() => responseError(404, "model 'qwen-x' not found"), where);
			caught = undefined;
			try { await run(providerWith(missing)); } catch (err) { caught = err; }
			assertTyped(caught, missing.thrown[0], `${name} ${where} 404`);
			assert.match((caught as ModelCallFailedError).detail, /^Model not found in Ollama/);

			// A request timeout or a rate limit (a proxy in front of Ollama) is a failure to reach the model, not a rejection.
			for (const [status, text] of [[408, 'request timeout'], [429, 'too many requests']] as const) {
				const transient = failingClient(() => responseError(status, text), where);
				caught = undefined;
				try { await run(providerWith(transient)); } catch (err) { caught = err; }
				assert.ok(caught instanceof ModelCallFailedError, `${name} ${where} ${status}: got ${String(caught)}`);
				assert.equal(isModelCallFailure(caught), true, `${name} ${where} ${status}: a failed model call`);
			}

			const failing = failingClient(() => responseError(500, 'llama runner process has terminated'), where);
			caught = undefined;
			try { await run(providerWith(failing)); } catch (err) { caught = err; }
			assert.ok(caught instanceof ModelCallFailedError, `${name} ${where} 500: got ${String(caught)}`);
			assert.equal(isModelCallFailure(caught), true, `${name} ${where} 500: a failed model call`);
		}
	}

	// Behind the structured retry helper the rejection is kept as the final error's cause.
	const rejected = failingClient(() => responseError(400, 'invalid format: schema is not valid JSON'), 'call');
	let caught: unknown;
	try {
		await providerWith(rejected).completeStructured([{ role: 'user', content: 'hi' }], SCHEMA, { maxAttempts: 1 });
	} catch (err) { caught = err; }
	assert.ok(caught instanceof Error && !(caught instanceof ModelCallFailedError), String(caught));
	assert.equal(isModelCallFailure(caught), false, 'completeStructured: not reported as an outage');
	assert.equal((caught as Error).cause, rejected.thrown[0], 'the rejection, with its status, is the cause');
});
