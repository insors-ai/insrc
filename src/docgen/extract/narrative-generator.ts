/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * docgen — graph-backed NarrativeGenerator (Epic 870ed3dd, Story s4).
 *
 * The production narrator seam: wraps the CORE-tier LLMProvider from
 * buildShaperProvider (Ollama-local by default, or the claude/codex CLI via
 * OAuth — NEVER a direct cloud REST call, k1) and produces raw narrated sections
 * via a single structured completion. Using the core tier (not the cheap
 * summariser) is the accuracy-first path (ac4). The provider is built lazily +
 * memoized so a missing/unconfigured provider surfaces as available()===false
 * (→ the extractor returns the derived diagram alone) rather than a boot failure.
 *
 * The prompt hands the model the derived diagram's graph-present vocabulary and
 * instructs it to name ONLY those entities; the extractor's groundSections then
 * VALIDATES that instruction rather than trusting it (grounding is enforced, not
 * hoped-for). Reads/generation happen inside the daemon (k2); one serial await,
 * never Promise.all over the provider.
 */

import type { LLMMessage, LLMProvider, StructuredSchema } from '../../shared/types.js';
import { buildShaperProvider } from '../../analyze/context/shaper-provider.js';
import { loadAnalyzeConfig } from '../../config/analyze.js';
import { getLogger } from '../../shared/logger.js';

import type { DocumentIR } from '../types.js';
import type { NarrativeGenerator, NarrationRequest, RawNarrativeSection } from './narrative.js';

const log = getLogger('docgen-narrative-generator');

/** The structured-output shape the model must return. */
const RAW_SECTIONS_SCHEMA: StructuredSchema = {
	type: 'object',
	additionalProperties: false,
	required: ['sections'],
	properties: {
		sections: {
			type: 'array',
			items: {
				type: 'object',
				additionalProperties: false,
				required: ['title', 'text', 'citedNames'],
				properties: {
					title:      { type: 'string' },
					text:       { type: 'string' },
					citedNames: { type: 'array', items: { type: 'string' } },
				},
			},
		},
	},
};

let cachedProvider: LLMProvider | null | undefined;

/** Build + memoize the core-tier provider. `null` means construction failed
 *  (treated as unavailable) so a missing provider never throws at import time. */
function getProvider(): LLMProvider | null {
	if (cachedProvider !== undefined) return cachedProvider;
	try {
		cachedProvider = buildShaperProvider(loadAnalyzeConfig());
	} catch (err) {
		log.warn({ err: (err as Error).message }, 'narrative generator: core-tier provider unavailable');
		cachedProvider = null;
	}
	return cachedProvider;
}

/** Reset the memoized provider (tests). */
export function _resetProviderForTests(): void { cachedProvider = undefined; }

/** Flatten the derived diagram into the graph-present vocabulary the model may
 *  name — the node labels, which groundSections later validates against. */
function vocabulary(derived: DocumentIR): string[] {
	return derived.derived.nodes.map(n => n.label);
}

function buildMessages(req: NarrationRequest): LLMMessage[] {
	const names = vocabulary(req.derived);
	const system =
		'You write a short, evidence-backed narrative about a software system for a design review. ' +
		'You are given a diagram DERIVED from the indexed code (a fixed list of real entities) plus a question. ' +
		'Rules: (1) name ONLY entities from the provided list — never invent a symbol, file, or component; ' +
		'(2) for each section, list in citedNames EXACTLY the entity names (from the list) that the section references; ' +
		'(3) keep it concise. Any section that names something not in the list will be discarded.';
	const user =
		`Question:\n${req.question}\n\n` +
		`Scope: ${req.scopeDescription}\n\n` +
		`Entities present in the indexed code (name ONLY these):\n${names.map(n => `- ${n}`).join('\n')}\n\n` +
		'Return narrative sections; each section lists the entity names it references in citedNames.';
	return [
		{ role: 'system', content: system },
		{ role: 'user',   content: user },
	];
}

/** The production narrator seam bound into the narrative registration. */
export const narrativeGenerator: NarrativeGenerator = {
	available(): boolean {
		const provider = getProvider();
		return provider !== null && provider.capabilities.structuredOutput;
	},

	async generate(req: NarrationRequest): Promise<readonly RawNarrativeSection[]> {
		const provider = getProvider();
		if (provider === null) return [];
		// One serial structured completion (never Promise.all over a provider).
		const out = await provider.completeStructured<{ sections: RawNarrativeSection[] }>(
			buildMessages(req),
			RAW_SECTIONS_SCHEMA,
			{ disableThinking: true, maxTokens: 4_096 },
		);
		return out.sections ?? [];
	},
};
