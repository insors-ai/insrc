/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The call envelope (Epic 8315a11f, sc4): every model call of a review carries a
 * fresh identifier its answer must echo, as `{ callId, answer }`. A re-issue is
 * a new call under a new identifier, so no prompt is ever sent twice.
 */

import { createHash, randomUUID } from 'node:crypto';

import type { LLMMessage, StructuredSchema } from '../../shared/types.js';

/** A fresh call identifier. */
export const newCallId = (): string => randomUUID();

/** The schema the model answers: the adapter's schema as `answer`, beside the call's own id. */
export function envelopeSchema(callId: string, schema: StructuredSchema): StructuredSchema {
	return {
		type:                 'object',
		required:             ['callId', 'answer'],
		additionalProperties: false,
		properties:           { callId: { type: 'string', const: callId }, answer: schema },
	} as unknown as StructuredSchema;
}

/** The instruction that closes every enveloped prompt (structural reference trails). */
export function envelopeInstruction(callId: string): string {
	return [
		`This request's id is "${callId}".`,
		'Reply with ONE JSON object of the form {"callId": "...", "answer": ...}:',
		`- "callId": exactly "${callId}";`,
		'- "answer": the answer the instructions above ask for, in the shape they give.',
	].join('\n');
}

/** The adapter's messages with the envelope instruction as the last user message. */
export function envelopeMessages(callId: string, messages: readonly LLMMessage[]): LLMMessage[] {
	return [...messages, { role: 'user', content: envelopeInstruction(callId) }];
}

/** Complete supplied input: serialized messages plus the separately supplied schema.
 *  Provider-specific schema normalization is checked again at dispatch. */
export function promptChars(messages: readonly LLMMessage[], schema?: StructuredSchema): number {
	let n = 0;
	for (const [i, m] of messages.entries()) {
		const content = typeof m.content === 'string' ? m.content : m.content.map(b => 'text' in b ? b.text : '').join('');
		n += content.length + (m.role === 'system' ? '## System\n'.length : m.role === 'assistant' ? '## Assistant\n'.length : 0) + (i > 0 ? 2 : 0);
	}
	return n + (schema === undefined ? 0 : 2 + JSON.stringify(schema).length);
}

/** A sent prompt's identity: its messages and schema. */
export function promptHash(messages: readonly LLMMessage[], schema: StructuredSchema): string {
	return createHash('sha256').update(JSON.stringify({ messages, schema })).digest('hex');
}

/** The inner answer when `raw` is an envelope carrying `callId`; undefined when the id is missing or another call's. */
export function openEnvelope(raw: unknown, callId: string): { readonly answer: unknown } | undefined {
	if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
	const r = raw as { callId?: unknown; answer?: unknown };
	return r.callId === callId && 'answer' in r ? { answer: r.answer } : undefined;
}
