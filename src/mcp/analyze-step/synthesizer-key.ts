/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Map a run target to its `SynthesizerPromptKey`.
 *
 * Phase A treats every request as a "structural map"-ish default:
 * code, docs, data, infra, generic each pick their target-native
 * synthesizer prompt. Answer-type-specific keys (adherence,
 * capability) require the client to have already emitted a plan
 * whose answerType we can inspect -- those get folded into Phase B
 * once narrow-LLM handoff lands. For MVP the structural path is
 * enough: it's what powers the "map me a module" flagship intent.
 */

import type { SynthesizerPromptKey } from '../../analyze/context/synthesizer.js';
import type { AnalyzeTarget } from '../../shared/analyze-types.js';

export function pickSynthesizerKey(target: AnalyzeTarget): SynthesizerPromptKey {
	switch (target) {
		case 'docs':    return 'docs';
		case 'data':    return 'data';
		case 'infra':   return 'infra';
		case 'code':    return 'code';
		case 'generic': return 'code';   // no dedicated 'generic' synthesizer; render as code
	}
}

/**
 * Refine the synthesizer key from the emitted plan's answerType.
 * Called after `phase='plan'` when we know whether the client picked
 * a code-target answer type that has a dedicated synthesizer prompt
 * (adherence-check, capability-discovery).
 */
export function refineSynthesizerKey(
	target:    AnalyzeTarget,
	answerType: string,
): SynthesizerPromptKey {
	if (target === 'code') {
		if (answerType === 'adherence-check')      return 'adherence';
		if (answerType === 'capability-discovery') return 'capability';
	}
	return pickSynthesizerKey(target);
}
