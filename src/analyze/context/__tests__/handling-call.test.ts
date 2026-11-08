/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The single-call layer of the handling helper (LLD-b9d5c5c40df5a574-s3,
 * task t6), against a scripted provider. No model.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { InputTooLargeError } from '../../../agent/providers/cli-provider.js';
import { ModelCallFailedError, ModelResponseShapeError } from '../../../agent/providers/model-call-error.js';
import type { LLMMessage, LLMProvider, StructuredCompletionOpts } from '../../../shared/types.js';
import { inputLimitFor } from '../handling.js';
import { MAX_REPAIR_NOTE_CHARS, callWithRepair, cappedErrors, classifyCallFailure } from '../handling-call.js';

const LOCAL = inputLimitFor({ kind: 'local', windowTokens: 32_768, singlePassOutputTokens: 20_480 }, 'part');
const SCHEMA = { type: 'object', properties: { ok: { type: 'boolean' } } };

interface Call { readonly messages: LLMMessage[]; readonly opts: StructuredCompletionOpts | undefined }

/** A provider that answers each call from `script` (a value, or an error to throw) and records the calls. */
function scripted(script: readonly (unknown | Error)[]): { provider: LLMProvider; calls: Call[] } {
	const calls: Call[] = [];
	const provider = {
		completeStructured: async (messages: LLMMessage[], _schema: unknown, opts?: StructuredCompletionOpts) => {
			calls.push({ messages, opts });
			const next = script[calls.length - 1];
			if (next instanceof Error) throw next;
			return next;
		},
	} as unknown as LLMProvider;
	return { provider, calls };
}

const user = (content: string): LLMMessage => ({ role: 'user', content });
const invalid = (...reasons: string[]): ModelResponseShapeError => new ModelResponseShapeError('reply failed validation', reasons);

test('provider called with {maxAttempts:1, internalRetry:false}, repair note capped at 8,000 characters, every attempt admitted before it is sent, no internal retry allowed', async () => {
	// Every call is sent with one attempt and no internal retry, whatever the caller's repair count.
	const ok = scripted([{ ok: true }]);
	const first = await callWithRepair<{ ok: boolean }>({ provider: ok.provider, messages: [user('q')], schema: SCHEMA, limit: LOCAL, maxAttempts: 3, maxTokens: 8_192 });
	assert.deepEqual(first, { kind: 'ok', value: { ok: true }, attempts: 1 });
	assert.equal(ok.calls[0]?.opts?.maxAttempts, 1);
	assert.equal(ok.calls[0]?.opts?.internalRetry, false);
	assert.equal(ok.calls[0]?.opts?.maxTokens, 8_192);

	// A CLI call carries no output cap.
	const noCap = scripted([{ ok: true }]);
	await callWithRepair({ provider: noCap.provider, messages: [user('q')], schema: SCHEMA, limit: LOCAL, maxAttempts: 1 });
	assert.equal('maxTokens' in (noCap.calls[0]?.opts ?? {}), false);

	// An invalid reply is re-asked with a repair note the helper builds; the note lists the errors, capped.
	const many = Array.from({ length: 2_000 }, (_, i) => `/field${i} must be a string`);
	const repaired = scripted([invalid(...many), { ok: true }]);
	const r = await callWithRepair({ provider: repaired.provider, messages: [user('q')], schema: SCHEMA, limit: LOCAL, maxAttempts: 3 });
	assert.equal(r.kind, 'ok');
	assert.equal(repaired.calls.length, 2);
	for (const c of repaired.calls) assert.equal(c.opts?.internalRetry, false);
	const second = repaired.calls[1]?.messages ?? [];
	assert.equal(second.length, 2, 'the original message and one repair note');
	assert.equal(second[0]?.content, 'q');
	const note = String(second[1]?.content);
	assert.match(note, /could not be parsed/);
	assert.match(note, /\/field0 must be a string/);
	assert.match(note, /more characters of errors not shown/);
	assert.ok(note.indexOf('not shown') < note.length);
	// The errors listed are at most the cap, and the rest is counted.
	const capped = cappedErrors(many);
	assert.equal(capped.length, 1);
	const joinedLength = many.join('\n').length;
	assert.ok((capped[0] as string).startsWith(many.join('\n').slice(0, MAX_REPAIR_NOTE_CHARS)));
	assert.match(capped[0] as string, new RegExp(`\\(${joinedLength - MAX_REPAIR_NOTE_CHARS} more characters`));
	assert.deepEqual(cappedErrors(['a', 'b']), ['a', 'b']);

	// Admission before every attempt: an input over the limit is never sent.
	const big = scripted([{ ok: true }]);
	const refused = await callWithRepair({ provider: big.provider, messages: [user('x'.repeat(LOCAL.limit + 1))], schema: SCHEMA, limit: LOCAL, maxAttempts: 3 });
	assert.equal(refused.kind, 'failed');
	assert.equal(refused.kind === 'failed' ? refused.failure : '', 'unadmittable');
	assert.equal(big.calls.length, 0);

	// A repair prompt that is not admitted is not sent: the first reply stays invalid and the call ends 'unadmittable'.
	const nearly = scripted([invalid('x'), { ok: true }]);
	const prompt = 'y'.repeat(LOCAL.limit - 50);
	const out = await callWithRepair({ provider: nearly.provider, messages: [user(prompt)], schema: SCHEMA, limit: LOCAL, maxAttempts: 3 });
	assert.equal(out.kind === 'failed' ? out.failure : out.kind, 'unadmittable');
	assert.equal(out.kind === 'failed' ? out.reason.startsWith('the repair prompt') : false, true);
	assert.equal(nearly.calls.length, 1, 'the repair attempt was not sent');

	// The attempts are bounded by maxAttempts, and the calls are made one after another.
	const stuck = scripted([invalid('a'), invalid('b'), invalid('c'), { ok: true }]);
	const end = await callWithRepair({ provider: stuck.provider, messages: [user('q')], schema: SCHEMA, limit: LOCAL, maxAttempts: 3 });
	assert.equal(end.kind === 'failed' ? end.failure : end.kind, 'invalid-reply');
	assert.equal(end.attempts, 3);
	assert.equal(stuck.calls.length, 3);
});

test('failure classification by cause: schema-invalid is invalid-reply, transport and Vibe exit are call-failed, size refusal divided before classification', async () => {
	const sizes = { maxChars: 100, actualChars: 200 };
	assert.equal(classifyCallFailure(invalid('x')), 'invalid-reply');
	assert.equal(classifyCallFailure(new Error('structured-output: validation failed after 1 attempts: bad json')), 'invalid-reply');
	assert.equal(classifyCallFailure(new ModelCallFailedError('connect ECONNREFUSED')), 'call-failed');
	assert.equal(classifyCallFailure(new Error('vibe exited with 1.')), 'call-failed');
	assert.equal(classifyCallFailure(new Error('structured-output: validation failed after 2 attempts: vibe exited with 1.')), 'call-failed');
	assert.equal(classifyCallFailure(new Error('claude exited with 1.')), 'call-failed');
	// A size refusal is divided first, bare or behind another error.
	const refusal = new InputTooLargeError('vibe exited with 1.', 'prompt is too long', sizes);
	assert.equal(classifyCallFailure(refusal), 'too-large');
	assert.equal(classifyCallFailure(new Error('wrapped', { cause: refusal })), 'too-large');

	// Through the loop: each cause ends the call as its own outcome, and only an invalid reply is re-asked.
	const run = async (script: (unknown | Error)[]): Promise<{ out: Awaited<ReturnType<typeof callWithRepair>>; sent: number }> => {
		const s = scripted(script);
		const out = await callWithRepair({ provider: s.provider, messages: [user('q')], schema: SCHEMA, limit: LOCAL, maxAttempts: 3 });
		return { out, sent: s.calls.length };
	};
	const transport = await run([new Error('vibe exited with 1.'), { ok: true }]);
	assert.equal(transport.out.kind === 'failed' ? transport.out.failure : '', 'call-failed');
	assert.equal(transport.sent, 1, 'a failed call is not repaired');
	const tooLarge = await run([refusal, { ok: true }]);
	assert.equal(tooLarge.out.kind, 'too-large');
	assert.equal(tooLarge.sent, 1);
	const shape = await run([invalid('a'), invalid('b'), invalid('c')]);
	assert.equal(shape.out.kind === 'failed' ? shape.out.failure : '', 'invalid-reply');
	assert.equal(shape.sent, 3);
	assert.ok(shape.out.kind === 'failed' && shape.out.cause instanceof ModelResponseShapeError);
});
