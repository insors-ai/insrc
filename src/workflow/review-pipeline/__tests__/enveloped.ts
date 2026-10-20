/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Test helpers for fake providers behind the review pipeline (Epic 8315a11f):
 * every call is enveloped, so a fake answers `{ callId, answer }` with the id the
 * envelope's schema carries, and reads the adapter's own prompt without the
 * envelope's closing instruction.
 */

/** A fake's answer to an enveloped call: `answer` under the call's own id. */
export function enveloped(schema: unknown, answer: unknown): { callId: string; answer: unknown } {
	const id = (schema as { properties?: { callId?: { const?: unknown } } } | null)?.properties?.callId?.const;
	if (typeof id !== 'string') throw new Error('enveloped: the call carried no envelope schema');
	return { callId: id, answer };
}

/** The adapter's messages: the sent messages without the envelope instruction (always last). */
export function unenveloped<M>(messages: readonly M[]): M[] {
	return messages.slice(0, -1);
}

const ENVELOPE_LINE = 'This request\'s id is "';

function envelopeId(schema: unknown): string | undefined {
	const id = (schema as { properties?: { callId?: { const?: unknown } } } | null)?.properties?.callId?.const;
	return typeof id === 'string' ? id : undefined;
}

/**
 * Wrap a fake provider written for bare calls: an enveloped call reaches the fake
 * with the adapter's own messages (or session prompt) and schema, and its answer
 * goes back under the call's id. A call that carries no envelope passes through
 * untouched, so wrapping twice (a fake that calls its own earlier method) is harmless.
 */
export function envelopeProvider<P extends object>(provider: P): P {
	return new Proxy(provider, {
		get(target, prop, receiver) {
			const value: unknown = Reflect.get(target, prop, receiver);
			if (typeof value !== 'function') return value;
			if (prop === 'completeStructured') {
				return async (messages: readonly { content: unknown }[], schema: unknown, opts?: unknown) => {
					const id = envelopeId(schema);
					if (id === undefined) return (value as (...a: unknown[]) => unknown).call(target, messages, schema, opts);
					const last = messages.at(-1);
					const own = typeof last?.content === 'string' && last.content.startsWith(ENVELOPE_LINE) ? messages.slice(0, -1) : messages;
					const inner = (schema as { properties: { answer: unknown } }).properties.answer;
					return { callId: id, answer: await (value as (...a: unknown[]) => unknown).call(target, own, inner, opts) };
				};
			}
			if (prop === 'runReviewSession') {
				return async (prompt: string, schema: unknown, opts?: unknown) => {
					const id = envelopeId(schema);
					if (id === undefined) return (value as (...a: unknown[]) => unknown).call(target, prompt, schema, opts);
					const cut = prompt.lastIndexOf(`\n\n${ENVELOPE_LINE}`);
					const inner = (schema as { properties: { answer: unknown } }).properties.answer;
					return { callId: id, answer: await (value as (...a: unknown[]) => unknown).call(target, cut >= 0 ? prompt.slice(0, cut) : prompt, inner, opts) };
				};
			}
			return value;
		},
	});
}
