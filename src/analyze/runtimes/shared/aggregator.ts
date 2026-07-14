/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Aggregator base runner.
 *
 * Every per-target aggregator runtime delegates to runAggregator()
 * for the LLM call -- target-specific runtimes only construct the
 * args (their per-target prompt path + the upstreamOutputs the
 * executor handed them). This keeps the prompt path + provider
 * construction + structured-output retry + error classification +
 * metadata stamping in one place.
 *
 * Failure modes (thrown as plain Error so the executor's
 * runtime-threw path captures them; callers don't need to typed-
 * dispatch on these):
 *   - prompt-missing      : prompt file ENOENT on disk
 *   - llm-unavailable     : Ollama down / model not pulled / connection lost
 *   - schema-unrecoverable: provider.completeStructured retries exhausted
 */

import { readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadAnalyzeConfig } from '../../../config/analyze.js';
import { buildShaperProvider } from '../../context/shaper-provider.js';
import { getLogger } from '../../../shared/logger.js';
import type {
	AnalyzeScope,
	AnalyzeTarget,
} from '../../../shared/analyze-types.js';
import type { LLMMessage, LLMProvider } from '../../../shared/types.js';

import {
	AGGREGATE_LLM_SCHEMA,
	type AggregateLLMOutput,
	type AggregateReport,
} from './aggregate-types.js';

const log = getLogger('analyze:runtimes:shared:aggregator');

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

export interface RunAggregatorArgs {
	/** Path (relative to insrc root) to the per-target prompt .md file. */
	readonly promptRelPath: string;
	readonly target:        AnalyzeTarget;
	readonly scope:         AnalyzeScope;
	readonly runId:         string;
	/** Upstream output map (from the executor's TemplateExecuteArgs.upstreamOutputs). */
	readonly upstreamOutputs: ReadonlyMap<string, unknown>;
	/**
	 * Optional human-readable goal / focus to prepend to the user
	 * message (e.g., intent.focus for focused intents). Aggregators
	 * that don't carry a focus omit this.
	 */
	readonly focus?: string;
	/** Optional provider override (tests only -- production uses analyze config). */
	readonly provider?: LLMProvider;
}

/**
 * Run the aggregator LLM call + stamp the runtime metadata. Returns
 * the full AggregateReport. Caller wraps it in TemplateExecuteResult.outputs.
 */
export async function runAggregator(args: RunAggregatorArgs): Promise<AggregateReport> {
	const cfg = loadAnalyzeConfig();

	const promptContent = loadPromptFile(args.promptRelPath);
	const provider = args.provider ?? buildShaperProvider(cfg);

	const messages = buildMessages({
		promptContent,
		target:          args.target,
		scope:           args.scope,
		focus:           args.focus,
		upstreamOutputs: args.upstreamOutputs,
	});

	let llmOutput: AggregateLLMOutput;
	try {
		llmOutput = await provider.completeStructured<AggregateLLMOutput>(
			messages,
			AGGREGATE_LLM_SCHEMA as Record<string, unknown>,
			{
				maxAttempts:     cfg.shaper.structuredOutputRetries,
				disableThinking: true,
				// Final report can be multi-page markdown across summary +
				// findings[] entries. Lean on the same shaper budget so
				// long reports don't get truncated mid-finding.
				maxTokens:       cfg.shaper.ollamaNumPredict,
			},
		);
	} catch (err) {
		throw classifyError(err);
	}

	log.info(
		{
			runId:         args.runId,
			target:        args.target,
			scope:         args.scope,
			findingCount:  llmOutput.findings.length,
			upstreamTasks: args.upstreamOutputs.size,
		},
		'aggregator: LLM call ok',
	);

	return {
		summary:  llmOutput.summary,
		findings: llmOutput.findings,
		metadata: {
			target:        args.target,
			scope:         args.scope,
			runId:         args.runId,
			tasksAnalyzed: args.upstreamOutputs.size,
		},
	};
}

// ---------------------------------------------------------------------------
// Message composition
// ---------------------------------------------------------------------------

interface BuildMessagesArgs {
	readonly promptContent:   string;
	readonly target:          AnalyzeTarget;
	readonly scope:           AnalyzeScope;
	readonly focus?:          string | undefined;
	readonly upstreamOutputs: ReadonlyMap<string, unknown>;
}

function buildMessages(args: BuildMessagesArgs): LLMMessage[] {
	const upstreamSection = renderUpstreamSection(args.upstreamOutputs);
	const focusSection = args.focus !== undefined && args.focus.length > 0
		? `\nFocus: ${args.focus}\n`
		: '';

	const userContent =
		`Target: ${args.target}\n` +
		`Scope:  ${args.scope}\n` +
		focusSection +
		`\n` +
		upstreamSection +
		`\n\n` +
		`Compose the aggregate report. Respond with ONLY the JSON object ` +
		`matching the schema -- no markdown fences, no prose outside the JSON body.`;

	return [
		{ role: 'system', content: args.promptContent.trimEnd() },
		{ role: 'user',   content: userContent },
	];
}

function renderUpstreamSection(map: ReadonlyMap<string, unknown>): string {
	if (map.size === 0) {
		return 'No upstream outputs were available -- the aggregator must reflect this in its summary.';
	}
	const ids = Array.from(map.keys()).sort();
	const blocks: string[] = ['Upstream task outputs:'];
	for (const id of ids) {
		const out = map.get(id);
		if (out === null || out === undefined) {
			blocks.push(
				`### ${id}\n` +
					`[unavailable: upstream task ${id} produced no output; ` +
					`reflect this gap in the report rather than fabricating.]`,
			);
		} else {
			blocks.push(`### ${id}\n` + '```json\n' + stableStringify(out) + '\n```');
		}
	}
	return blocks.join('\n\n');
}

/**
 * Sort object keys + Map entries deterministically so prompt content
 * is stable across runs (helps cache + debug diffing).
 */
function stableStringify(value: unknown): string {
	return JSON.stringify(value, (_k, v) => {
		if (v instanceof Map) {
			const obj: Record<string, unknown> = {};
			const entries: [string, unknown][] = [];
			for (const [k, val] of v.entries()) entries.push([String(k), val]);
			entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
			for (const [k, val] of entries) obj[k] = val;
			return obj;
		}
		if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
			const sorted: Record<string, unknown> = {};
			const keys = Object.keys(v as Record<string, unknown>).sort();
			for (const k of keys) sorted[k] = (v as Record<string, unknown>)[k];
			return sorted;
		}
		return v;
	}, 2);
}

// ---------------------------------------------------------------------------
// Prompt loading + provider construction
// ---------------------------------------------------------------------------

function loadPromptFile(relPath: string): string {
	const abs = isAbsolute(relPath) ? relPath : resolveRelativeToInsrcRoot(relPath);
	try {
		return readFileSync(abs, 'utf8');
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
			throw new Error(`aggregator prompt missing: ${abs}`);
		}
		throw err;
	}
}

function resolveRelativeToInsrcRoot(relativePath: string): string {
	const thisFile = fileURLToPath(import.meta.url);
	// .../analyze/runtimes/shared/aggregator.js -> ... -> .../insrc
	return resolve(thisFile, '..', '..', '..', '..', relativePath);
}

// ---------------------------------------------------------------------------
// Error classification (mirrors planner/driver.ts + shaper patterns)
// ---------------------------------------------------------------------------

const UNAVAILABLE_PATTERNS = [
	'Ollama is not running',
	'Model not found',
	'ECONNREFUSED',
	'ECONNRESET',
	'fetch failed',
	'socket hang up',
	'EPIPE',
	'other side closed',
	'Did not receive done or success response in stream',
];

function classifyError(err: unknown): Error {
	if (!(err instanceof Error)) return new Error(`aggregator-internal: ${String(err)}`);
	const msg = err.message;
	for (const pat of UNAVAILABLE_PATTERNS) {
		if (msg.includes(pat)) return new Error(`aggregator-llm-unavailable: ${msg}`);
	}
	return new Error(`aggregator-schema-unrecoverable: ${msg}`);
}

// ---------------------------------------------------------------------------
// Test hooks
// ---------------------------------------------------------------------------

export const _buildMessagesForTest        = buildMessages;
export const _renderUpstreamSectionForTest = renderUpstreamSection;
export const _stableStringifyForTest       = stableStringify;
export const _classifyErrorForTest         = classifyError;
