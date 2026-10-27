/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { LLMMessage } from '../../shared/types.js';

export function serialiseMessages(messages: readonly LLMMessage[]): string {
	const parts: string[] = [];
	for (const m of messages) {
		const content = typeof m.content === 'string'
			? m.content
			: m.content.map(b => 'text' in b ? b.text : '').join('');
		if (m.role === 'system') {
			parts.push(`## System\n${content}`);
		} else if (m.role === 'assistant') {
			parts.push(`## Assistant\n${content}`);
		} else {
			parts.push(content);
		}
	}
	return parts.join('\n\n');
}
