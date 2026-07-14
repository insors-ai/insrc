/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Synthesizer driver.
 *
 * plans/exploration-based-context-build.md Section 6. Takes an
 * `ExecutedPlan` (exploration outputs) + the classified intent
 * + the synthesis hint, and asks the shaper model to compose the
 * 7-layer `AnalyzeContextBundle`.
 *
 * Bounded input: the synthesizer NEVER runs tools or reads new
 * files. Its input is the pre-computed evidence pack. This bounds
 * output-token growth + eliminates the "LLM decided to look at X
 * instead of Y" failure mode.
 *
 * V1 only ships the code-target synthesizer prompt. Other targets
 * fall back to the legacy shaper. See analyze/context/driver.ts
 * for the dispatch logic.
 */

import { readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildShaperProvider } from './shaper-provider.js';
import { loadAnalyzeConfig } from '../../config/analyze.js';
import { validateAgainstSchema } from '../../agent/providers/structured-output.js';
import { getLogger } from '../../shared/logger.js';
import type {
	LLMMessage,
	LLMProvider,
	StructuredSchema,
} from '../../shared/types.js';
import type { ClassifiedIntent } from '../../shared/analyze-types.js';

import { ANALYZE_CONTEXT_BUNDLE_SCHEMA } from './schema.js';
import type { AnalyzeContextBundle } from './types.js';
import type {
	ExecutedPlan,
} from '../explore/index.js';

const log = getLogger('analyze:context:synthesizer');

const SYNTHESIZE_CODE_PROMPT_REL       = 'prompts/analyze/synthesize.code.system.md';
const SYNTHESIZE_DOCS_PROMPT_REL       = 'prompts/analyze/synthesize.docs.system.md';
const SYNTHESIZE_ADHERENCE_PROMPT_REL  = 'prompts/analyze/synthesize.adherence.system.md';
const SYNTHESIZE_CAPABILITY_PROMPT_REL = 'prompts/analyze/synthesize.capability.system.md';
const SYNTHESIZE_DATA_PROMPT_REL       = 'prompts/analyze/synthesize.data.system.md';
const SYNTHESIZE_INFRA_PROMPT_REL      = 'prompts/analyze/synthesize.infra.system.md';

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

export class SynthesizerLlmUnavailableError extends Error {
	constructor(cause: string) {
		super(`Local Ollama unavailable for synthesizer: ${cause}`);
		this.name = 'SynthesizerLlmUnavailableError';
	}
}

export class SynthesizerSchemaUnrecoverable extends Error {
	constructor(errors: readonly string[]) {
		super(`Synthesizer structured output unrecoverable: ${errors.join('; ')}`);
		this.name = 'SynthesizerSchemaUnrecoverable';
	}
}

export class SynthesizerPromptMissingError extends Error {
	constructor(path: string) {
		super(`Synthesizer prompt file missing: ${path}`);
		this.name = 'SynthesizerPromptMissingError';
	}
}

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

/** Which synthesizer prompt to load. Distinct from `intent.target`
 *  because the same target can use different bundle emphases (e.g.
 *  `target=code` picks 'code' for structural-map and 'adherence' for
 *  adherence-check). The driver derives this key from (target,
 *  answerType). */
export type SynthesizerPromptKey =
	| 'code'
	| 'docs'
	| 'adherence'
	| 'capability'
	| 'data'
	| 'infra';

export interface SynthesizeArgs {
	readonly runId:    string;
	readonly intent:   ClassifiedIntent;
	readonly executed: ExecutedPlan;
	/** Which synthesizer prompt to load. Unknown keys throw
	 *  `SynthesizerPromptMissingError` so the driver knows to fall
	 *  back to the legacy shaper. */
	readonly target:   SynthesizerPromptKey;
	readonly provider?: LLMProvider;
}

/**
 * Compose the run-mode `AnalyzeContextBundle` from the executed
 * plan. Returns the bundle WITHOUT `meta` -- the shaper driver
 * stamps `meta` from framework-side info (mode, shaperId, model,
 * schemaVersion, ...) after synthesis.
 */
export async function synthesize(args: SynthesizeArgs): Promise<Omit<AnalyzeContextBundle, 'meta'>> {
	const cfg = loadAnalyzeConfig();
	const promptContent = loadPromptFile(args.target);
	const provider = args.provider ?? buildShaperProvider(cfg);

	const messages = buildMessages(promptContent, args.intent, args.executed);

	let raw: Omit<AnalyzeContextBundle, 'meta'>;
	try {
		raw = await provider.completeStructured<Omit<AnalyzeContextBundle, 'meta'>>(
			messages,
			// Reuse the bundle schema but drop the `meta` requirement --
			// the driver stamps `meta` post-synthesis.
			stripMetaFromSchema(ANALYZE_CONTEXT_BUNDLE_SCHEMA as Record<string, unknown>),
			{
				maxAttempts:     cfg.shaper.structuredOutputRetries,
				disableThinking: true,
				// Same output-token budget as the legacy shaper -- the
				// bundle shape is unchanged.
				maxTokens:       cfg.shaper.ollamaNumPredict,
			},
		);
	} catch (err) {
		const errClass = classifyError(err);
		throw errClass;
	}

	log.info(
		{
			runId:            args.runId,
			target:           args.target,
			explorationCount: args.executed.results.length,
			summaryLen:       raw.summary?.length ?? 0,
			structureLen:     raw.structure?.length ?? 0,
			surfaceLen:       raw.surface?.length ?? 0,
			artefactsLen:     raw.artefacts?.length ?? 0,
		},
		'synthesizer: bundle emitted',
	);

	return raw;
}

// ---------------------------------------------------------------------------
// Multi-turn MCP prepare / finalize split (plans/mcp-multi-turn-analyze.md)
//
// Same as decomposer's split: prepareSynthesize returns everything the
// outer client's LLM needs to emit the bundle directly (verbatim prompt
// + user turn + JSON Schema), and finalizeSynthesize applies the raw
// JSON the client emitted (re-validating against the same schema the
// wire layer would have enforced on the Ollama / CLI paths).
// ---------------------------------------------------------------------------

export interface SynthesizePrepared {
	readonly systemPrompt: string;
	readonly userTurn:     string;
	readonly schema:       StructuredSchema;
}

/**
 * Return the prompt content, user turn, and stripped bundle schema
 * for the synthesizer without invoking an LLM.
 */
export function prepareSynthesize(
	args: Omit<SynthesizeArgs, 'runId' | 'provider'>,
): SynthesizePrepared {
	const promptContent = loadPromptFile(args.target);
	const messages = buildMessages(promptContent, args.intent, args.executed);
	return {
		systemPrompt: messages[0]!.content as string,
		userTurn:     messages[1]!.content as string,
		schema:       stripMetaFromSchema(
			ANALYZE_CONTEXT_BUNDLE_SCHEMA as Record<string, unknown>,
		) as StructuredSchema,
	};
}

/**
 * Validate the raw JSON the outer client emitted for a bundle against
 * the stripped bundle schema (defensive check: the wire layer never
 * saw this JSON). Throws SynthesizerSchemaUnrecoverable on failure.
 * Meta stamping is the caller's responsibility -- same shape as the
 * driver's meta-stamp path today.
 */
export function finalizeSynthesize(raw: unknown): Omit<AnalyzeContextBundle, 'meta'> {
	const strippedSchema = stripMetaFromSchema(
		ANALYZE_CONTEXT_BUNDLE_SCHEMA as Record<string, unknown>,
	) as StructuredSchema;
	const result = validateAgainstSchema<Omit<AnalyzeContextBundle, 'meta'>>(
		strippedSchema, raw,
	);
	if (!result.ok) {
		throw new SynthesizerSchemaUnrecoverable(result.errors);
	}
	return result.value;
}

// ---------------------------------------------------------------------------
// Message composition
// ---------------------------------------------------------------------------

function buildMessages(
	promptContent: string,
	intent:        ClassifiedIntent,
	executed:      ExecutedPlan,
): LLMMessage[] {
	// Render the executed plan as a series of numbered blocks the LLM
	// can scan sequentially. Each block: id, type, purpose, output as
	// pretty-printed JSON.
	const evidenceBlocks = executed.results
		.map(r =>
			`### ${r.exploration.id} :: ${r.exploration.type}\n` +
			`purpose: ${r.exploration.purpose}\n` +
			`output:\n` +
			'```json\n' +
			JSON.stringify(r.output, null, 2) +
			'\n```',
		)
		.join('\n\n');

	const userContent =
		`Classified intent:\n` +
		'```json\n' +
		JSON.stringify(intent, null, 2) +
		'\n```\n' +
		`\n` +
		`Answer type: ${executed.plan.answerType}\n` +
		`Synthesis hint: ${executed.plan.synthesisHint}\n` +
		`\n` +
		`Executed explorations (${executed.results.length}):\n\n` +
		evidenceBlocks +
		`\n\n` +
		`Compose the AnalyzeContextBundle now. Emit the seven layers as strings. ` +
		`First char \`{\`, no markdown fence, no prose intro. Every string non-empty ` +
		`unless the layer's contract says empty is allowed (upstream = empty in ` +
		`run-mode). No claim without an exploration output.`;

	return [
		{ role: 'system', content: promptContent.trimEnd() },
		{ role: 'user',   content: userContent },
	];
}

// ---------------------------------------------------------------------------
// Schema: bundle schema minus the meta requirement
// ---------------------------------------------------------------------------

/**
 * Cache the stripped-and-$id-cleared schema at module load. Two
 * motivations:
 *   1. ajv keys compiled validators by `$id`. Calling this on every
 *      synthesize() invocation and letting the strip pass keep the
 *      original $id means the second run in a process throws
 *      "schema with key or id ... already exists" -- surfaced on
 *      T7b during Phase 5 live validation.
 *   2. We were re-allocating a large clone per call for no reason;
 *      the strip is deterministic given the input schema, so one
 *      cached value is enough.
 */
let cachedStrippedSchema: Record<string, unknown> | null = null;

function stripMetaFromSchema(schema: Record<string, unknown>): Record<string, unknown> {
	if (cachedStrippedSchema !== null) return cachedStrippedSchema;
	const cloned = JSON.parse(JSON.stringify(schema)) as Record<string, unknown>;
	if (Array.isArray(cloned['required'])) {
		cloned['required'] = (cloned['required'] as string[]).filter(k => k !== 'meta');
	}
	if (typeof cloned['properties'] === 'object' && cloned['properties'] !== null) {
		const props = cloned['properties'] as Record<string, unknown>;
		delete props['meta'];
	}
	// Drop the schema's $id so ajv doesn't keep the compiled
	// validator keyed by the original id -- otherwise the second
	// synthesize() in the same process fails with "schema with key
	// or id ... already exists".
	delete cloned['$id'];
	cachedStrippedSchema = cloned;
	return cloned;
}

// ---------------------------------------------------------------------------
// Prompt loading + provider construction
// ---------------------------------------------------------------------------

const PROMPT_PATHS: Readonly<Record<SynthesizerPromptKey, string>> = {
	code:       SYNTHESIZE_CODE_PROMPT_REL,
	docs:       SYNTHESIZE_DOCS_PROMPT_REL,
	adherence:  SYNTHESIZE_ADHERENCE_PROMPT_REL,
	capability: SYNTHESIZE_CAPABILITY_PROMPT_REL,
	data:       SYNTHESIZE_DATA_PROMPT_REL,
	infra:      SYNTHESIZE_INFRA_PROMPT_REL,
};

function loadPromptFile(target: keyof typeof PROMPT_PATHS): string {
	const rel = PROMPT_PATHS[target];
	if (rel === undefined) {
		throw new SynthesizerPromptMissingError(`no synthesizer prompt for target '${target}'`);
	}
	const abs = isAbsolute(rel) ? rel : resolveRelativeToInsrcRoot(rel);
	try {
		return readFileSync(abs, 'utf8');
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
			throw new SynthesizerPromptMissingError(abs);
		}
		throw err;
	}
}

function resolveRelativeToInsrcRoot(relativePath: string): string {
	const thisFile = fileURLToPath(import.meta.url);
	const insrcRoot = resolve(thisFile, '..', '..', '..');
	return resolve(insrcRoot, relativePath);
}

// ---------------------------------------------------------------------------
// Error classification
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
	if (!(err instanceof Error)) return new SynthesizerSchemaUnrecoverable([String(err)]);
	const msg = err.message;
	for (const pat of UNAVAILABLE_PATTERNS) {
		if (msg.includes(pat)) return new SynthesizerLlmUnavailableError(msg);
	}
	return new SynthesizerSchemaUnrecoverable([msg]);
}

// ---------------------------------------------------------------------------
// Boot validator hook
// ---------------------------------------------------------------------------

export const _stripMetaFromSchemaForTest = stripMetaFromSchema;
export function _resetStrippedSchemaCacheForTest(): void { cachedStrippedSchema = null; }

export const SYNTHESIZE_CODE_PROMPT_PATH       = SYNTHESIZE_CODE_PROMPT_REL;
export const SYNTHESIZE_DOCS_PROMPT_PATH       = SYNTHESIZE_DOCS_PROMPT_REL;
export const SYNTHESIZE_ADHERENCE_PROMPT_PATH  = SYNTHESIZE_ADHERENCE_PROMPT_REL;
export const SYNTHESIZE_CAPABILITY_PROMPT_PATH = SYNTHESIZE_CAPABILITY_PROMPT_REL;
export const SYNTHESIZE_DATA_PROMPT_PATH       = SYNTHESIZE_DATA_PROMPT_REL;
export const SYNTHESIZE_INFRA_PROMPT_PATH      = SYNTHESIZE_INFRA_PROMPT_REL;

export function getSynthesizerPromptPathForBoot(): string {
	return SYNTHESIZE_CODE_PROMPT_REL;
}
