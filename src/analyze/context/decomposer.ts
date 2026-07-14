/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Decomposer driver.
 *
 * plans/exploration-based-context-build.md Section 5. Takes the
 * classified intent + repo path and asks the shaper model to emit
 * a structured `ExplorationPlan` from the fixed catalog. Tiny
 * LLM call, tight schema, ~30s.
 *
 * Failure modes:
 *   - LLM unavailable -> throw `DecomposerLlmUnavailableError`
 *   - Schema-unrecoverable after retries -> throw `DecomposerSchemaUnrecoverable`
 *   - Prompt missing -> throw `DecomposerPromptMissingError`
 *
 * Callers upstream fall back to the legacy shaper tool loop on any
 * of these -- the point of the decomposer is quality, not
 * availability. See analyze/context/driver.ts for the fallback
 * dispatch.
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

import type {
	AnswerType,
	Exploration,
	ExplorationPlan,
	ExplorationType,
} from '../explore/index.js';

const log = getLogger('analyze:context:decomposer');

const DECOMPOSE_PROMPT_REL = 'prompts/analyze/decompose.system.md';

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

export class DecomposerLlmUnavailableError extends Error {
	constructor(cause: string) {
		super(`Local Ollama unavailable for decomposer: ${cause}`);
		this.name = 'DecomposerLlmUnavailableError';
	}
}

export class DecomposerSchemaUnrecoverable extends Error {
	constructor(errors: readonly string[]) {
		super(`Decomposer structured output unrecoverable: ${errors.join('; ')}`);
		this.name = 'DecomposerSchemaUnrecoverable';
	}
}

export class DecomposerPromptMissingError extends Error {
	constructor(path: string) {
		super(`Decomposer prompt file missing: ${path}`);
		this.name = 'DecomposerPromptMissingError';
	}
}

// ---------------------------------------------------------------------------
// Structured schema -- exhaustive enum lists mirror types.ts
// ---------------------------------------------------------------------------

const ANSWER_TYPES: readonly AnswerType[] = [
	'structural-map',
	'adherence-check',
	'decision-trace',
	'capability-discovery',
	'how-does-it-work',
	'prose-retrieval',
	'data-inventory',
	'infra-inventory',
];

const EXPLORATION_TYPES: readonly ExplorationType[] = [
	'concept.resolve',
	'module.profile',
	'symbol.locate',
	'class.hierarchy',
	'import.graph',
	'test.locate',
	'usage.example',
	'capability.reuse-check',
	'search.text',
	'convention.detect',
	'config.trace',
	'data-model.trace',
	'doc.mention',
	'doc.decision.trace',
	'doc.constraint.enumerate',
	'db.connections.list',
	'db.tables.list',
	'db.table.describe',
	'manifests.locate',
	'freeform.probe',
];

export const DECOMPOSE_SCHEMA: StructuredSchema = {
	type:                 'object',
	additionalProperties: false,
	required:             ['answerType', 'explorations', 'synthesisHint'],
	properties: {
		answerType:    { type: 'string', enum: [...ANSWER_TYPES] },
		synthesisHint: { type: 'string', minLength: 1 },
		explorations:  {
			type:  'array',
			items: {
				type:                 'object',
				additionalProperties: false,
				required:             ['id', 'type', 'purpose', 'params'],
				properties: {
					id:      { type: 'string', minLength: 1 },
					type:    { type: 'string', enum: [...EXPLORATION_TYPES] },
					purpose: { type: 'string', minLength: 1 },
					params:  { type: 'object', additionalProperties: true },
					dependsOn: {
						type:  'array',
						items: { type: 'string', minLength: 1 },
					},
				},
			},
		},
	},
};

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

export interface DecomposeArgs {
	readonly intent:   ClassifiedIntent;
	readonly runId:    string;
	readonly provider?: LLMProvider;
}

/**
 * Ask the shaper model to emit an ExplorationPlan for the given
 * intent. Tight prompt, small output, ~30s on qwen3.6:35b-a3b.
 */
export async function decompose(args: DecomposeArgs): Promise<ExplorationPlan> {
	const cfg = loadAnalyzeConfig();
	const promptContent = loadPromptFile();
	const provider = args.provider ?? buildShaperProvider(cfg);

	const messages = buildMessages(promptContent, args.intent);

	let raw: {
		answerType:    AnswerType;
		explorations:  Exploration[];
		synthesisHint: string;
	};
	try {
		raw = await provider.completeStructured(
			messages,
			DECOMPOSE_SCHEMA,
			{
				maxAttempts:     cfg.shaper.structuredOutputRetries,
				disableThinking: true,
				// Tiny output: 1 top-level object + <=8 exploration
				// entries. 2048 tokens is generous.
				maxTokens:       2_048,
			},
		);
	} catch (err) {
		const errClass = classifyError(err);
		if (errClass instanceof DecomposerLlmUnavailableError) throw errClass;
		throw errClass;
	}

	// Validate id ordering + dependsOn topology (schema-level checks
	// aren't strong enough to enforce this).
	validatePlanTopology(raw.explorations);

	log.info(
		{
			runId:            args.runId,
			answerType:       raw.answerType,
			explorationCount: raw.explorations.length,
			target:           args.intent.target,
			scope:            args.intent.scope,
			focus:            args.intent.focus,
		},
		'decomposer: plan emitted',
	);

	return {
		answerType:    raw.answerType,
		explorations:  raw.explorations,
		synthesisHint: raw.synthesisHint,
	};
}

// ---------------------------------------------------------------------------
// Multi-turn MCP prepare / finalize split (plans/mcp-multi-turn-analyze.md)
//
// prepareDecompose returns the exact prompt + user turn + JSON Schema the
// outer client's LLM needs to emit an ExplorationPlan directly. The
// existing decompose() function still runs the in-process LLM path for
// Ollama / CliProvider / sampling; this split exposes the same building
// blocks so the MCP multi-turn tool can hand them to the client instead.
// ---------------------------------------------------------------------------

/**
 * Everything the outer client needs to emit an ExplorationPlan without
 * the server calling an LLM.
 */
export interface DecomposePrepared {
	readonly systemPrompt: string;
	readonly userTurn:     string;
	readonly schema:       StructuredSchema;
}

/**
 * Return the prompt content, user turn, and schema for the decomposer
 * without invoking an LLM. Same content the in-process decompose()
 * would have sent -- prompt is loaded verbatim from disk; user turn is
 * composed the same way `buildMessages` composes it.
 */
export function prepareDecompose(intent: ClassifiedIntent): DecomposePrepared {
	const promptContent = loadPromptFile();
	const messages = buildMessages(promptContent, intent);
	return {
		systemPrompt: messages[0]!.content as string,
		userTurn:     messages[1]!.content as string,
		schema:       DECOMPOSE_SCHEMA,
	};
}

/**
 * Take the raw JSON the outer client emitted for an ExplorationPlan,
 * defensively re-validate it against DECOMPOSE_SCHEMA (the wire schema
 * validation only fires on the Ollama / CLI path -- MCP multi-turn
 * skips that entirely), then run the topology check + return the
 * ExplorationPlan. Throws DecomposerSchemaUnrecoverable on either
 * failure so the outer handler can decide to retry vs give up.
 */
export function finalizeDecompose(raw: unknown): ExplorationPlan {
	const result = validateAgainstSchema<{
		answerType:    AnswerType;
		explorations:  Exploration[];
		synthesisHint: string;
	}>(DECOMPOSE_SCHEMA, raw);
	if (!result.ok) {
		throw new DecomposerSchemaUnrecoverable(result.errors);
	}
	validatePlanTopology(result.value.explorations);
	return {
		answerType:    result.value.answerType,
		explorations:  result.value.explorations,
		synthesisHint: result.value.synthesisHint,
	};
}

// ---------------------------------------------------------------------------
// Topology validation
// ---------------------------------------------------------------------------

function validatePlanTopology(explorations: readonly Exploration[]): void {
	const seenIds = new Set<string>();
	for (const exp of explorations) {
		if (seenIds.has(exp.id)) {
			throw new DecomposerSchemaUnrecoverable([
				`duplicate exploration id '${exp.id}'`,
			]);
		}
		for (const dep of exp.dependsOn ?? []) {
			if (!seenIds.has(dep)) {
				throw new DecomposerSchemaUnrecoverable([
					`exploration '${exp.id}' depends on '${dep}' but that id was not defined earlier in the plan`,
				]);
			}
		}
		seenIds.add(exp.id);
	}
}

// ---------------------------------------------------------------------------
// Message composition
// ---------------------------------------------------------------------------

function buildMessages(promptContent: string, intent: ClassifiedIntent): LLMMessage[] {
	const focusLine = intent.focused && intent.focus !== undefined
		? `focus: "${intent.focus}"`
		: 'focus: (unfocused -- broad understanding request)';

	const userContent =
		`Classified intent:\n` +
		'```json\n' +
		JSON.stringify(intent, null, 2) +
		'\n```\n' +
		`\n` +
		`Repo path: ${intent.scopeRef.value}\n` +
		`\n` +
		`Classify the answer type. Emit the ExplorationPlan JSON now. ` +
		`First char \`{\`, no markdown fence, no prose. Every array present ` +
		`(may be empty). Every exploration.id must be referenced ONCE before ` +
		`any dependsOn cites it.\n\n` +
		focusLine;

	return [
		{ role: 'system', content: promptContent.trimEnd() },
		{ role: 'user',   content: userContent },
	];
}

// ---------------------------------------------------------------------------
// Prompt loading + provider construction
// ---------------------------------------------------------------------------

function loadPromptFile(): string {
	const abs = isAbsolute(DECOMPOSE_PROMPT_REL)
		? DECOMPOSE_PROMPT_REL
		: resolveRelativeToInsrcRoot(DECOMPOSE_PROMPT_REL);
	try {
		return readFileSync(abs, 'utf8');
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
			throw new DecomposerPromptMissingError(abs);
		}
		throw err;
	}
}

function resolveRelativeToInsrcRoot(relativePath: string): string {
	const thisFile = fileURLToPath(import.meta.url);
	// .../analyze/context/decomposer.js -> .../context -> .../analyze -> .../insrc
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
	if (!(err instanceof Error)) return new DecomposerSchemaUnrecoverable([String(err)]);
	const msg = err.message;
	for (const pat of UNAVAILABLE_PATTERNS) {
		if (msg.includes(pat)) return new DecomposerLlmUnavailableError(msg);
	}
	return new DecomposerSchemaUnrecoverable([msg]);
}

// ---------------------------------------------------------------------------
// Boot validator hook
// ---------------------------------------------------------------------------

export const DECOMPOSE_PROMPT_PATH = DECOMPOSE_PROMPT_REL;
