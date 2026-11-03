import type { LLMMessage, StructuredSchema } from './types.js';

/** Application-controlled text supplied to a CLI, including explicit history. */
export function serialiseMessages(messages: readonly LLMMessage[]): string {
	return messages.map(m => {
		const text = typeof m.content === 'string' ? m.content : m.content.map(b => {
			if (!('text' in b)) throw new Error('Bounded text input cannot account for non-text content');
			return b.text;
		}).join('');
		return m.role === 'system' ? `## System\n${text}` : m.role === 'assistant' ? `## Assistant\n${text}` : text;
	}).join('\n\n');
}

/** Existing three-characters/token estimate, including separately supplied schema. */
export function completeInputChars(messages: readonly LLMMessage[], schema?: StructuredSchema): number {
	return serialiseMessages(messages).length + (schema === undefined ? 0 : 2 + JSON.stringify(schema).length);
}
