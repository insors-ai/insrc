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
