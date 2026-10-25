/** Fake conversion providers: the answer is scripted, `calls` records the prompts. */

import type { ConversionProviders, ToolDeps } from '../../../types.js';

export function providers(answer: unknown): { conversion: ConversionProviders; calls: string[] } {
	const calls: string[] = [];
	const conversion: ConversionProviders = {
		resolveProvider: () => ({
			async completeStructured(messages: Array<{ content: unknown }>) { calls.push(String(messages[0]?.content)); return answer; },
		}) as never,
	};
	return { conversion, calls };
}

export const depsWith = (conversion?: ConversionProviders): ToolDeps => ({ sessionId: 't', repoPath: '/tmp', send: () => {}, requestId: 0, ...(conversion ? { conversion } : {}) });
