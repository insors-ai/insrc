/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `insrc_analyze_step` phase='start' handler.
 *
 * 1. Build the ClassifiedIntent from the client-provided focus + target
 *    + scope (no classifier call; matches the one-shot MCP tool's
 *    intent hand-build).
 * 2. Compute the cache key + look up any prior bundle. If a fresh
 *    bundle is cached, return `next: 'done'` immediately -- the client
 *    skips the plan/bundle round trips entirely.
 * 3. Otherwise, load the decomposer prompt + schema via prepareDecompose
 *    and seed the state blob with stage='awaiting_plan'.
 */

import { prepareDecompose } from '../../../analyze/context/decomposer.js';
import { resolveRepoLastIndexedAt } from '../../../analyze/context/driver.js';
import { renderBundleAsMarkdown } from '../../bundle-md.js';
import { readBundleForStep } from '../cache-lookup.js';
import { encodeState, STATE_VERSION, type StepStatePayload } from '../state.js';
import { pickSynthesizerKey } from '../synthesizer-key.js';
import type { StepInputStart, StepOutputDone, StepOutputEmitPlan } from '../types.js';
import type { ClassifiedIntent } from '../../../shared/analyze-types.js';
import { getLogger } from '../../../shared/logger.js';

const log = getLogger('mcp:analyze-step:start');

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

export async function handleStart(
	input: StepInputStart,
): Promise<StepOutputEmitPlan | StepOutputDone> {
	const repoPath = resolveRepoPath(input.repo);
	if (repoPath === undefined) {
		throw new Error(
			`insrc_analyze_step[start]: no repo. Pass \`repo\` explicitly or set INSRC_REPO ` +
			`in the MCP server's environment.`,
		);
	}

	const runId  = `mcp-step-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	const target = input.target ?? 'code';
	const scope  = input.scope  ?? 'M';

	const intent: ClassifiedIntent = {
		target,
		scope,
		focused:  true,
		focus:    input.focus,
		scopeRef: { kind: 'workspace', value: repoPath },
		reasoning: `insrc_analyze_step invocation: ${input.focus}`,
	};

	const synthesizerKey = pickSynthesizerKey(target);
	const repoIndexedAt  = (await resolveRepoLastIndexedAt(repoPath)) ?? null;

	// (2) Cache-hit short-circuit. Same cache key the one-shot pipeline
	// uses -- a hit here means the outer client is asking for a bundle
	// we already have; skip both LLM turns.
	const cachedBundle = readBundleForStep({
		repoPath,
		intent,
		...(repoIndexedAt !== null ? { repoIndexedAt } : {}),
	});
	if (cachedBundle !== null) {
		log.info(
			{ runId, repoPath, target, scope, focus: input.focus },
			'insrc_analyze_step[start]: cache hit; returning done',
		);
		return {
			next:     'done',
			markdown: renderBundleAsMarkdown(cachedBundle),
			meta:     cachedBundle.meta ?? {
				mode:          'run',
				shaper:        target === 'generic' ? 'generic' : target,
				toolCalls:     0,
				modelId:       'client',
				emptyLayers:   [],
				schemaVersion: 1,
			},
		};
	}

	// (3) Fresh run. Load decomposer prompt + schema; seed state.
	const prepared = prepareDecompose(intent);

	const state: StepStatePayload = {
		version:        STATE_VERSION,
		runId,
		repoPath,
		repoIndexedAt,
		intent,
		synthesizerKey,
		stage:          'awaiting_plan',
	};

	log.info(
		{ runId, repoPath, target, scope, focus: input.focus, synthesizerKey },
		'insrc_analyze_step[start]: emitting decomposer prompt',
	);

	return {
		next:     'emit_plan',
		guidance:
			'Emit an ExplorationPlan JSON matching the schema below, then call ' +
			'insrc_analyze_step again with phase="plan", plan=<your JSON>, ' +
			'state=<the state field verbatim>.',
		prompt:   prepared.systemPrompt,
		userTurn: prepared.userTurn,
		schema:   prepared.schema as Record<string, unknown>,
		state:    encodeState(state),
	};
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveRepoPath(explicit: string | undefined): string | undefined {
	if (explicit !== undefined && explicit.length > 0) return explicit;
	const env = process.env['INSRC_REPO'];
	if (env !== undefined && env.length > 0) return env;
	return undefined;
}
