/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The open-question gate helpers for `insrc_build_step`.
 *
 * Scope is the Story LLD ONLY — its `body.openQuestions` (the questions) and
 * `meta.questionResolutions` (the answers recorded so far). The gate computes
 * which questions are still unresolved, derives a stable id per question, and
 * (for `implement`) asks the daemon's shaper LLM to formalize each into
 * concrete options + a recommendation.
 */

import { createHash } from 'node:crypto';

import { loadAnalyzeConfig } from '../../config/analyze.js';
import { buildShaperProvider } from '../../analyze/context/shaper-provider.js';
import { getLogger } from '../../shared/logger.js';
import type { LLMProvider, StructuredSchema } from '../../shared/types.js';
import type { LldArtifact } from '../../workflow/artifacts/lld.js';
import type { BuildStepQuestion } from './types.js';

const log = getLogger('mcp:build-step:questions');

export interface UnresolvedQuestion {
	readonly questionId: string;
	readonly text:       string;
}

// ---------------------------------------------------------------------------
// questionId derivation
// ---------------------------------------------------------------------------

/** Leading `[id / verdict]` tag (e.g. `[sc2 / missed] ...` → `sc2`). */
const TAG_RE = /^\s*\[\s*([^\]\s/]+)\s*\//;

/** Derive a STABLE id for an open question: the leading `[id / verdict]` tag
 *  if present, else a short sha of the trimmed text. */
export function deriveQuestionId(text: string): string {
	const m = TAG_RE.exec(text);
	if (m !== null && m[1]!.length > 0) return m[1]!;
	return 'q' + createHash('sha256').update(text.trim()).digest('hex').slice(0, 8);
}

// ---------------------------------------------------------------------------
// unresolved computation
// ---------------------------------------------------------------------------

/** The open questions whose derived id is NOT yet present in
 *  `meta.questionResolutions`. */
export function unresolvedQuestions(lld: LldArtifact): UnresolvedQuestion[] {
	const resolutions = lld.meta.questionResolutions ?? {};
	const out: UnresolvedQuestion[] = [];
	for (const text of lld.body.openQuestions) {
		const questionId = deriveQuestionId(text);
		if (Object.prototype.hasOwnProperty.call(resolutions, questionId)) continue;
		out.push({ questionId, text });
	}
	return out;
}

// ---------------------------------------------------------------------------
// Option generation (daemon-side LLM call)
// ---------------------------------------------------------------------------

const OPTIONS_SCHEMA: StructuredSchema = {
	type: 'object',
	required: ['options', 'recommendation'],
	additionalProperties: false,
	properties: {
		options: {
			type: 'array',
			minItems: 2,
			maxItems: 4,
			items: {
				type: 'object',
				required: ['label', 'detail'],
				additionalProperties: false,
				properties: {
					label:  { type: 'string', minLength: 1 },
					detail: { type: 'string', minLength: 1 },
				},
			},
		},
		recommendation: { type: 'string', minLength: 1 },
	},
};

interface GeneratedOptions {
	readonly options:        readonly { readonly label: string; readonly detail: string }[];
	readonly recommendation: string;
}

/** Test seam: inject a fake provider for option generation so the gate is
 *  exercised without a live LLM. */
let providerOverride: LLMProvider | undefined;
export function _setBuildQuestionProviderForTests(p: LLMProvider | undefined): void {
	providerOverride = p;
}

function optionProvider(): LLMProvider {
	if (providerOverride !== undefined) return providerOverride;
	return buildShaperProvider(loadAnalyzeConfig(), {});
}

/** Formalize EACH unresolved question into 2-4 concrete options + a one-line
 *  recommendation. SERIAL by construction — never `Promise.all` over provider
 *  calls (CLAUDE.md). */
export async function questionsWithOptions(
	unresolved: readonly UnresolvedQuestion[],
	storyContext: string,
): Promise<BuildStepQuestion[]> {
	const provider = optionProvider();
	const out: BuildStepQuestion[] = [];
	for (const q of unresolved) {
		const systemPrompt = [
			'You are helping resolve an OPEN DESIGN QUESTION before a coding Task is implemented.',
			'Formalize the question below into 2-4 CONCRETE, mutually-distinct solution options,',
			'each with a short label and a one-to-two sentence detail, plus a one-line recommendation',
			'naming the option you would pick and why. Do not invent facts outside the given context.',
		].join('\n');
		const userTurn = [
			`Story context: ${storyContext}`,
			'',
			`Open question: ${q.text}`,
			'',
			'Emit the options JSON now.',
		].join('\n');
		const gen = await provider.completeStructured<GeneratedOptions>(
			[{ role: 'system', content: systemPrompt }, { role: 'user', content: userTurn }],
			OPTIONS_SCHEMA,
		);
		out.push({
			questionId:     q.questionId,
			text:           q.text,
			options:        gen.options,
			recommendation: gen.recommendation,
		});
	}
	log.info({ count: out.length }, 'insrc_build_step: generated options for unresolved questions');
	return out;
}
