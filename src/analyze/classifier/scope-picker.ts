/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Scope-only classifier -- cheap LLM call that picks the analyze
 * scope band (`XS | S | M | L | XL`) when a slash command has
 * already decided the `target`.
 *
 * Motivation (ISSUES.md I-001):
 * When the user types `/code map the architecture`, the orchestrator
 * skips the full classifier to save the ~3-min round-trip -- but that
 * also loses the scope decision. Falling back to a hardcoded 'M' was
 * wrong (too big on tiny repos, too small on monorepos). This picker
 * runs a bounded prompt against qwen3.6:35b-a3b with a two-field
 * response, targeting ~30-45 s.
 *
 * Design differences vs the full classifier:
 *   - Prompt is small (< 500 tokens) + scope-only.
 *   - No context-shaper prelude -- we synthesise a compact
 *     workspace-signals block from the repo registry + entity counts
 *     without an LLM tool loop.
 *   - No semantic-validation retry: the response is 2 fields
 *     (scope enum + reasoning string). If it fails schema, the
 *     structured-output retry loop in the provider handles it.
 *
 * Failure fallback:
 * If the picker throws (Ollama down, model returns garbage after
 * retries), the orchestrator falls back to scope='M' rather than
 * failing the whole run -- see runAnalyze() in orchestrator/driver.ts.
 * That preserves the slash-command promise ("cheap + fast; don't
 * block the user on infra hiccups").
 */

import { readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadAnalyzeConfig } from '../../config/analyze.js';
import { buildShaperProvider } from '../context/shaper-provider.js';
import { listRepos } from '../../db/repos.js';
import { listEntitiesForRepo } from '../../db/entities.js';
import { getLogger } from '../../shared/logger.js';
import type {
	LLMMessage,
	LLMProvider,
	StructuredSchema,
} from '../../shared/types.js';
import type {
	AnalyzeScope,
	AnalyzeScopeRef,
	AnalyzeTarget,
} from '../../shared/analyze-types.js';

const log = getLogger('analyze:classifier:scope-picker');

const SCOPE_PICKER_PROMPT_REL = 'prompts/analyze/scope-picker.system.md';

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

export interface PickScopeArgs {
	readonly userPrompt: string;
	readonly target:     AnalyzeTarget;
	readonly scopeRef:   AnalyzeScopeRef;
	readonly runId:      string;
	readonly provider?:  LLMProvider | undefined;
}

export interface PickScopeResult {
	readonly scope:     AnalyzeScope;
	readonly reasoning: string;
	/** Whether the workspace-signals gather succeeded; false when the
	 *  registry probe threw (e.g. LMDB read error). The picker still
	 *  runs but the LLM sees a "signals unavailable" note. */
	readonly signalsAvailable: boolean;
}

export class ScopePickerLlmUnavailableError extends Error {
	constructor(cause: string) {
		super(`Local Ollama unavailable for scope-picker: ${cause}`);
		this.name = 'ScopePickerLlmUnavailableError';
	}
}

export class ScopePickerSchemaUnrecoverable extends Error {
	constructor(errors: readonly string[]) {
		super(`Scope-picker structured output unrecoverable: ${errors.join('; ')}`);
		this.name = 'ScopePickerSchemaUnrecoverable';
	}
}

export class ScopePickerPromptMissingError extends Error {
	constructor(promptPath: string) {
		super(`Scope-picker prompt file missing: ${promptPath}`);
		this.name = 'ScopePickerPromptMissingError';
	}
}

/**
 * JSON schema for the scope-picker response. Deliberately tiny --
 * two fields, no nesting. Ollama's schema-constrained decoder is
 * reliable for shapes this shallow.
 */
const SCOPE_PICKER_SCHEMA: StructuredSchema = {
	type:                 'object',
	additionalProperties: false,
	required:             ['scope', 'reasoning'],
	properties:           {
		scope:     { type: 'string', enum: ['XS', 'S', 'M', 'L', 'XL'] },
		reasoning: { type: 'string', minLength: 1 },
	},
};

// ---------------------------------------------------------------------------
// pickScope -- public entry point
// ---------------------------------------------------------------------------

export async function pickScope(args: PickScopeArgs): Promise<PickScopeResult> {
	const cfg = loadAnalyzeConfig();

	const promptContent = loadPromptFile();
	const provider = args.provider ?? buildShaperProvider(cfg);

	// Gather cheap workspace signals -- no LLM tool loop involved. The
	// registry + entity counts are the only inputs beyond the user's
	// prompt + target.
	let signals: WorkspaceSignals | null;
	try {
		signals = await gatherWorkspaceSignals(args.scopeRef);
	} catch (err) {
		log.warn(
			{ runId: args.runId, err: (err as Error).message },
			'scope-picker: signal gather failed; running without workspace signals',
		);
		signals = null;
	}

	const messages = buildMessages(promptContent, args, signals);

	let raw: { scope: AnalyzeScope; reasoning: string };
	try {
		raw = await provider.completeStructured(
			messages,
			SCOPE_PICKER_SCHEMA,
			{
				maxAttempts:     cfg.shaper.structuredOutputRetries,
				disableThinking: true,
				// Tiny response -- 2 fields, one enum + one short string.
				// 512 is generous; caps runaway output if the model
				// forgets the schema.
				maxTokens:       512,
			},
		);
	} catch (err) {
		throw classifyError(err);
	}

	log.info(
		{
			runId:     args.runId,
			target:    args.target,
			scope:     raw.scope,
			reasoning: raw.reasoning,
		},
		'scope-picker: scope selected',
	);

	return {
		scope:            raw.scope,
		reasoning:        raw.reasoning,
		signalsAvailable: signals !== null,
	};
}

// ---------------------------------------------------------------------------
// Workspace signals
// ---------------------------------------------------------------------------

interface WorkspaceSignals {
	readonly registeredRepos:  number;
	readonly scopeEntityCount: number | null;
	readonly totalEntityCount: number;
}

async function gatherWorkspaceSignals(scopeRef: AnalyzeScopeRef): Promise<WorkspaceSignals> {
	const repos = await listRepos({} as never);
	const workspaceRepos = repos.filter(r => r.kind !== 'shared-modules');

	// Total entities across every registered workspace repo. Sums
	// per-repo counts sequentially -- the entity store is LMDB-backed
	// so iteration is cheap.
	let totalEntityCount = 0;
	for (const r of workspaceRepos) {
		const ents = await listEntitiesForRepo({} as never, r.path);
		totalEntityCount += ents.length;
	}

	// If the scope ref points at a single registered repo, compute
	// its per-repo entity count separately so the picker can tell
	// "big workspace, but this repo is small" apart from "small
	// workspace, this repo is the whole thing".
	let scopeEntityCount: number | null = null;
	if (scopeRef.kind === 'repo' || scopeRef.kind === 'module' || scopeRef.kind === 'file') {
		const matchedRepo = workspaceRepos.find(r => scopeRef.value.startsWith(r.path));
		if (matchedRepo !== undefined) {
			const ents = await listEntitiesForRepo({} as never, matchedRepo.path);
			scopeEntityCount = ents.length;
		}
	}

	return {
		registeredRepos: workspaceRepos.length,
		scopeEntityCount,
		totalEntityCount,
	};
}

function renderSignals(signals: WorkspaceSignals | null): string {
	if (signals === null) {
		return 'Workspace signals: (unavailable -- registry probe failed; pick based on the user prompt alone)';
	}
	const scopeLine = signals.scopeEntityCount !== null
		? `  - Entities in the scope-referenced repo: ${signals.scopeEntityCount}`
		: '  - Scope ref does not target a single indexed repo (workspace / connection / manifest-dir).';
	return (
		'Workspace signals:\n' +
		`  - Registered workspace repos: ${signals.registeredRepos}\n` +
		`  - Total indexed entities across the workspace: ${signals.totalEntityCount}\n` +
		scopeLine
	);
}

// ---------------------------------------------------------------------------
// Message composition
// ---------------------------------------------------------------------------

function buildMessages(
	promptContent: string,
	args:          PickScopeArgs,
	signals:       WorkspaceSignals | null,
): LLMMessage[] {
	const userContent =
		`Target (already decided by slash command): ${args.target}\n` +
		`\n` +
		`Surfaced scope reference:\n` +
		'```json\n' +
		JSON.stringify(args.scopeRef, null, 2) +
		'\n```\n' +
		`\n` +
		`User request (raw):\n` +
		'```\n' +
		args.userPrompt.trim() +
		'\n```\n' +
		`\n` +
		renderSignals(signals) +
		`\n\n` +
		'Now pick the scope band. Respond with ONLY the JSON object matching ' +
		'the schema -- first char `{`, no markdown fences, no prose. Required ' +
		'fields: scope (one of XS|S|M|L|XL), reasoning (1-2 sentences).';

	return [
		{ role: 'system', content: promptContent.trimEnd() },
		{ role: 'user',   content: userContent },
	];
}

// ---------------------------------------------------------------------------
// Prompt loading + provider construction
// ---------------------------------------------------------------------------

function loadPromptFile(): string {
	const abs = isAbsolute(SCOPE_PICKER_PROMPT_REL)
		? SCOPE_PICKER_PROMPT_REL
		: resolveRelativeToInsrcRoot(SCOPE_PICKER_PROMPT_REL);
	try {
		return readFileSync(abs, 'utf8');
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
			throw new ScopePickerPromptMissingError(abs);
		}
		throw err;
	}
}

function resolveRelativeToInsrcRoot(relativePath: string): string {
	const thisFile = fileURLToPath(import.meta.url);
	// .../analyze/classifier/scope-picker.js -> .../classifier -> .../analyze -> .../insrc
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
	if (!(err instanceof Error)) return new Error(String(err));
	const msg = err.message;
	for (const pat of UNAVAILABLE_PATTERNS) {
		if (msg.includes(pat)) return new ScopePickerLlmUnavailableError(msg);
	}
	return new ScopePickerSchemaUnrecoverable([msg]);
}

// ---------------------------------------------------------------------------
// Boot validator hook
// ---------------------------------------------------------------------------

export const SCOPE_PICKER_PROMPT_PATH = SCOPE_PICKER_PROMPT_REL;
