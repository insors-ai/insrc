import type { LLMMessage } from '../../../shared/types.js';
export function promptChars(messages: readonly LLMMessage[]): number {
	let n = 0;
	for (const [i, m] of messages.entries()) {
		const content = typeof m.content === 'string' ? m.content : m.content.map(b => 'text' in b ? b.text : '').join('');
		n += content.length + (m.role === 'system' ? '## System\n'.length : m.role === 'assistant' ? '## Assistant\n'.length : 0) + (i > 0 ? 2 : 0);
	}
	return n;
}
