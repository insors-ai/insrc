/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * capability.reuse-check exploration runner.
 *
 * plans/exploration-based-context-build.md Phase 3. Given a natural-
 * language capability query, find modules in the repo that already
 * plausibly deliver that capability. The synthesizer uses this to
 * surface "the codebase already does X" evidence before the planner
 * emits new-work tasks.
 *
 * Flow (hybrid: deterministic retrieval + narrow LLM verdict):
 *   1. concept.resolve(query=capability, includeKinds=['dir','file'])
 *   2. For each top candidate, module.profile the path
 *   3. Ask the Ollama shaper model to classify each candidate as
 *      clear-match / partial-match / unrelated with 1-line rationale
 *   4. Merge the LLM verdict back onto the candidate list
 *
 * The LLM pass is narrow (compact evidence block, tight schema) so
 * it stays predictable. Ollama unavailable / prompt missing degrades
 * gracefully: `llmSkipReason` is populated + every candidate gets
 * verdict='unrelated' + rationale='LLM verdict unavailable'.
 */

import { readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildShaperProvider } from '../context/shaper-provider.js';
import { loadAnalyzeConfig } from '../../config/analyze.js';
import { getLogger } from '../../shared/logger.js';
import type {
	LLMMessage,
	StructuredSchema,
} from '../../shared/types.js';

import { runConceptResolve } from './concept-resolve.js';
import { runModuleProfile } from './module-profile.js';
import type {
	CapabilityReuseCandidate,
	CapabilityReuseCheckOutput,
	Exploration,
	ExplorationRunnerContext,
	ModuleProfile,
} from './types.js';

const log = getLogger('analyze:explore:capability-reuse-check');

const PROMPT_REL = 'prompts/analyze/capability.reuse-check.system.md';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DEFAULT_LIMIT = 5;
const MAX_LIMIT     = 12;

// ---------------------------------------------------------------------------
// Structured-output schema
// ---------------------------------------------------------------------------

const VERDICTS_SCHEMA: StructuredSchema = {
	type:                 'object',
	additionalProperties: false,
	required:             ['capability', 'verdicts'],
	properties: {
		capability: { type: 'string' },
		verdicts:   {
			type:  'array',
			items: {
				type:                 'object',
				additionalProperties: false,
				required:             ['path', 'verdict', 'rationale'],
				properties: {
					path:      { type: 'string' },
					verdict:   { type: 'string', enum: ['clear-match', 'partial-match', 'unrelated'] },
					rationale: { type: 'string' },
				},
			},
		},
	},
};

// ---------------------------------------------------------------------------
// Params
// ---------------------------------------------------------------------------

interface CapabilityReuseCheckParams {
	readonly capability: string;
	readonly limit?:     number;
}

function parseParams(exp: Exploration): CapabilityReuseCheckParams {
	const p = exp.params as Record<string, unknown>;
	const capability = typeof p['capability'] === 'string'
		? (p['capability'] as string).trim()
		: '';
	if (capability.length === 0) {
		throw new Error('capability.reuse-check: params.capability is required (non-empty string)');
	}
	const limit = typeof p['limit'] === 'number' && p['limit']! > 0
		? Math.min(MAX_LIMIT, Math.floor(p['limit'] as number))
		: DEFAULT_LIMIT;
	return { capability, limit };
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export async function runCapabilityReuseCheck(
	exp: Exploration,
	ctx: ExplorationRunnerContext,
): Promise<CapabilityReuseCheckOutput> {
	const prepared = await prepareCapabilityReuseCheck(exp, ctx);
	if (prepared.kind === 'short-circuit') return prepared.shortCircuit;

	// LLM narrow pass -- daemon-side shaperProvider. Skips gracefully
	// on unavailable Ollama / missing prompt: finalizer merges with
	// verdicts=undefined and emits `unrelated` placeholders.
	let raw: CapabilityReuseCheckLLMOutput | undefined;
	let llmSkipReason: string | undefined;
	try {
		const cfg = loadAnalyzeConfig();
		const provider = buildShaperProvider(cfg);
		raw = await provider.completeStructured<CapabilityReuseCheckLLMOutput>(
			[
				{ role: 'system', content: prepared.systemPrompt },
				{ role: 'user',   content: prepared.userTurn     },
			],
			VERDICTS_SCHEMA,
			{
				maxAttempts:     cfg.shaper.structuredOutputRetries,
				disableThinking: true,
				maxTokens:       2_048,
			},
		);
		log.info(
			{
				runId:      ctx.runId,
				capability: prepared.prepared.capability,
				returned:   raw.verdicts.length,
			},
			'capability.reuse-check: LLM verdicts received',
		);
	} catch (err) {
		llmSkipReason = (err as Error).message;
		log.info(
			{ runId: ctx.runId, capability: prepared.prepared.capability, err: llmSkipReason },
			'capability.reuse-check: LLM verdict pass skipped',
		);
	}

	return finalizeCapabilityReuseCheck(prepared.prepared, raw, llmSkipReason, ctx.runId);
}

// ---------------------------------------------------------------------------
// prepare / finalize split (used by the multi-turn MCP handler)
// ---------------------------------------------------------------------------

export interface CapabilityReuseCheckPrepared {
	readonly capability:    string;
	readonly profiles:      ReadonlyArray<{
		readonly path:    string;
		readonly profile: ModuleProfile | undefined;
		readonly score:   number;
	}>;
	readonly conceptHits:   number;
}

interface CapabilityReuseCheckLLMOutput {
	readonly capability: string;
	readonly verdicts:   ReadonlyArray<{
		readonly path:      string;
		readonly verdict:   CapabilityReuseCandidate['verdict'];
		readonly rationale: string;
	}>;
}

export type CapabilityReuseCheckPrepareResult =
	| {
		readonly kind:         'short-circuit';
		readonly shortCircuit: CapabilityReuseCheckOutput;
	  }
	| {
		readonly kind:         'narrow-llm';
		readonly systemPrompt: string;
		readonly userTurn:     string;
		readonly schema:       StructuredSchema;
		readonly prepared:     CapabilityReuseCheckPrepared;
	  };

/**
 * Deterministic prep for `capability.reuse-check`: runs concept.
 * resolve then module.profile for each top candidate, then builds
 * the LLM messages + schema. Short-circuits when concept.resolve
 * returns no hits (no LLM needed).
 */
export async function prepareCapabilityReuseCheck(
	exp: Exploration,
	ctx: ExplorationRunnerContext,
): Promise<CapabilityReuseCheckPrepareResult> {
	const params = parseParams(exp);
	const capability = params.capability;
	const limit = params.limit ?? DEFAULT_LIMIT;

	// (1) concept.resolve for module candidates.
	const conceptExp: Exploration = {
		id:      `${exp.id}-inner-concept`,
		type:    'concept.resolve',
		purpose: `capability.reuse-check inner concept.resolve for "${capability}"`,
		params: {
			query:        capability,
			limit:        Math.max(limit * 2, 10),
			includeKinds: ['dir', 'file'],
		},
	};
	const concept = await runConceptResolve(conceptExp, ctx);

	if (concept.hits.length === 0) {
		log.info(
			{ runId: ctx.runId, capability },
			'capability.reuse-check: concept.resolve returned no hits',
		);
		return {
			kind: 'short-circuit',
			shortCircuit: {
				type:         'capability.reuse-check',
				capability,
				candidates:   [],
				notFoundNote: `No modules matched "${capability}" via concept.resolve.`,
			},
		};
	}

	const topHits = pickTopDistinct(concept.hits, limit);

	// (2) module.profile each candidate serially.
	const profiles: Array<{ path: string; profile: ModuleProfile | undefined; score: number }> = [];
	for (const h of topHits) {
		const profileExp: Exploration = {
			id:      `${exp.id}-inner-profile-${h.path}`,
			type:    'module.profile',
			purpose: `capability.reuse-check inner module.profile for ${h.path}`,
			params:  { path: h.path },
		};
		try {
			const prof = await runModuleProfile(profileExp, ctx);
			profiles.push({ path: h.path, profile: prof.profile, score: h.score });
		} catch (err) {
			log.warn(
				{ runId: ctx.runId, path: h.path, err: (err as Error).message },
				'capability.reuse-check: module.profile failed for candidate; keeping as unrelated placeholder',
			);
			profiles.push({ path: h.path, profile: undefined, score: h.score });
		}
	}

	const promptContent = loadPromptFile();
	const messages = buildMessages(promptContent, capability, profiles);
	const systemMsg = messages[0]!.content as string;
	const userMsg   = messages[1]!.content as string;

	return {
		kind:         'narrow-llm',
		systemPrompt: systemMsg,
		userTurn:     userMsg,
		schema:       VERDICTS_SCHEMA,
		prepared: {
			capability,
			profiles,
			conceptHits: concept.hits.length,
		},
	};
}

/**
 * Merge the LLM verdicts (if any) with the deterministic profiles
 * and emit the final CapabilityReuseCheckOutput. Handles the
 * degraded case where the LLM is unavailable -- `raw` undefined and
 * `llmSkipReason` set produces `unrelated` placeholders.
 */
export function finalizeCapabilityReuseCheck(
	prepared:      CapabilityReuseCheckPrepared,
	raw:           CapabilityReuseCheckLLMOutput | undefined,
	llmSkipReason: string | undefined,
	runId?:        string,
): CapabilityReuseCheckOutput {
	const verdicts = new Map<string, { verdict: CapabilityReuseCandidate['verdict']; rationale: string }>();
	if (raw !== undefined) {
		for (const v of raw.verdicts) {
			if (typeof v.path !== 'string' || v.path.length === 0) continue;
			verdicts.set(v.path, { verdict: v.verdict, rationale: v.rationale });
		}
	}

	const candidates: CapabilityReuseCandidate[] = prepared.profiles.map(p => {
		const v = verdicts.get(p.path);
		const evidenceEntities = p.profile !== undefined
			? p.profile.exports.slice(0, 5)
			: [];
		return {
			path:             p.path,
			moduleName:       basenameOf(p.path),
			verdict:          v?.verdict ?? 'unrelated',
			rationale:        v?.rationale ?? (llmSkipReason !== undefined
				? 'LLM verdict unavailable; ranked purely by concept.resolve score.'
				: 'LLM emitted no verdict for this path.'),
			evidenceEntities,
			conceptScore:     Math.round(p.score * 1_000) / 1_000,
		};
	});

	log.info(
		{
			runId,
			capability: prepared.capability,
			hits:       prepared.conceptHits,
			candidates: candidates.length,
			skippedLLM: llmSkipReason !== undefined,
		},
		'capability.reuse-check: complete',
	);

	return {
		type:         'capability.reuse-check',
		capability:   prepared.capability,
		candidates,
		notFoundNote: '',
		...(llmSkipReason !== undefined ? { llmSkipReason } : {}),
	};
}

// ---------------------------------------------------------------------------
// LLM prompt assembly
// ---------------------------------------------------------------------------

function buildMessages(
	promptContent: string,
	capability:    string,
	profiles:      ReadonlyArray<{ path: string; profile: ModuleProfile | undefined; score: number }>,
): LLMMessage[] {
	const candidateBlocks = profiles.map((p, idx) => {
		const prof = p.profile;
		const exports = prof !== undefined ? prof.exports.slice(0, 8).join(', ') : '(unavailable)';
		const subdirs = prof !== undefined ? prof.subdirs.slice(0, 8).join(', ') : '(unavailable)';
		const files   = prof !== undefined ? prof.filesInDir.slice(0, 8).map(f => f.file).join(', ') : '(unavailable)';
		return `${idx + 1}. path: ${p.path}\n` +
			`   conceptScore: ${p.score.toFixed(3)}\n` +
			`   exports: ${exports}\n` +
			`   subdirs: ${subdirs}\n` +
			`   files:   ${files}\n` +
			`   entityCount: ${prof !== undefined ? prof.entityCount : 0}`;
	}).join('\n\n');

	const userContent =
		`Capability requested: ${capability}\n` +
		`\n` +
		`Candidate modules (${profiles.length}), ranked by concept score:\n\n` +
		candidateBlocks +
		`\n\n` +
		'Emit the VerdictList JSON now. First character `{`, no markdown ' +
		'fence, no prose intro. Every candidate path MUST appear in ' +
		'`verdicts`. Use `clear-match` only when the module clearly ' +
		'delivers the capability; `partial-match` when it delivers a ' +
		'related but incomplete slice; `unrelated` otherwise.';

	return [
		{ role: 'system', content: promptContent.trimEnd() },
		{ role: 'user',   content: userContent },
	];
}

function loadPromptFile(): string {
	const abs = isAbsolute(PROMPT_REL) ? PROMPT_REL : resolveRelativeToInsrcRoot(PROMPT_REL);
	return readFileSync(abs, 'utf8');
}

function resolveRelativeToInsrcRoot(relativePath: string): string {
	const thisFile = fileURLToPath(import.meta.url);
	// .../analyze/explore/capability-reuse-check.js -> ... -> .../insrc
	const insrcRoot = resolve(thisFile, '..', '..', '..');
	return resolve(insrcRoot, relativePath);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pickTopDistinct<T extends { path: string; kind: string; score: number }>(
	hits: readonly T[],
	limit: number,
): T[] {
	const chosen: T[] = [];
	const seen = new Set<string>();
	// Prefer dir hits over file hits for the same directory prefix.
	const sorted = [...hits].sort((a, b) => {
		if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
		return b.score - a.score;
	});
	for (const h of sorted) {
		if (seen.has(h.path)) continue;
		seen.add(h.path);
		chosen.push(h);
		if (chosen.length >= limit) break;
	}
	return chosen;
}

function basenameOf(path: string): string {
	const trimmed = path.replace(/\/$/, '');
	const idx = trimmed.lastIndexOf('/');
	return idx >= 0 ? trimmed.slice(idx + 1) : trimmed;
}

// ---------------------------------------------------------------------------
// Boot validator hook
// ---------------------------------------------------------------------------

export const CAPABILITY_REUSE_CHECK_PROMPT_PATH = PROMPT_REL;
