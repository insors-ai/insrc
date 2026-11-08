import type { ConnectionExecutionContext } from '../../shared/step-context.js';
import { captureAnalysisDiagnostics } from '../connection-access.js';
import { assertConnectionProviderAdmission } from '../../shared/connection-provider.js';
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Synthesizer driver.
 *
 * docs/plans/exploration-based-context-build.md Section 6. Takes an
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

import { assertAnalysisConnectionExecution } from '../connection-access.js';
import { ConnectionExecutionError } from '../../shared/step-context.js';
import { readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isModelCallFailure, modelCallFailureDetail } from './model-failure.js';
import type { HandlingReport } from '../completeness.js';
import { evidenceBlocks, selectSharedContext } from './dependency.js';
import { ShaperAnswerStepFailedError } from './answer-step-error.js';
import type { AnswerStepFound } from './driver.js';
import type { AdmissionTarget } from './handling.js';
import { assembleBundle } from './handling-adapters.js';
import { applyReply } from './answer-progress.js';
import type { AnswerProgress, FinalizedAnswerTurn } from './answer-progress.js';
import type { BundleLayers, BundleNarrative } from './handling-adapters.js';
import { runHandled } from './handling-parts.js';
import type { PartAdapter } from './handling-parts.js';
import { renderSection } from './sections.js';
import { resolveRoleProvider } from './shaper-provider.js';
import { loadAnalyzeConfig } from '../../config/analyze.js';
import { validateAgainstSchema } from '../../agent/providers/structured-output.js';
import { getLogger } from '../../shared/logger.js';
import type {
	LLMMessage,
	LLMProvider,
	StructuredSchema,
} from '../../shared/types.js';
import type { ClassifiedIntent } from '../../shared/analyze-types.js';

import { ANALYZE_CONTEXT_BUNDLE_SCHEMA, modelFacingBundleSchema } from './schema.js';
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
	/** The underlying failure's own message, without this error's prefix. */
	readonly detail: string;

	constructor(cause: string) {
		// Provider-neutral: the answer-writing provider is role-routed
		// and need not be Ollama.
		super(`The model call for answer writing failed: ${cause}`);
		this.name = 'SynthesizerLlmUnavailableError';
		this.detail = cause;
	}
}

export class SynthesizerSchemaUnrecoverable extends Error {
	constructor(errors: readonly string[]) {
		super(`Synthesizer structured output unrecoverable: ${errors.join('; ')}`);
		this.name = 'SynthesizerSchemaUnrecoverable';
	}
}

export class SynthesizerPromptMissingError extends Error {
	readonly path: string;

	constructor(path: string) {
		super(`Synthesizer prompt file missing: ${path}`);
		this.name = 'SynthesizerPromptMissingError';
		this.path = path;
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
	readonly connectionExecution?: import('../../shared/step-context.js').ConnectionExecutionContext | undefined;
	readonly runId:    string;
	readonly intent:   ClassifiedIntent;
	readonly executed: ExecutedPlan;
	/** Which synthesizer prompt to load. Unknown keys throw
	 *  `SynthesizerPromptMissingError` so the driver knows to fall
	 *  back to the legacy shaper. */
	readonly target:   SynthesizerPromptKey;
	readonly provider?: LLMProvider;
	/** What the lookups returned and the report derived from them, carried by a typed failure. Defaults to the executed results and an empty report. */
	readonly found?: AnswerStepFound | undefined;
}

/**
 * Compose the run-mode `AnalyzeContextBundle` from the executed
 * plan. Returns the bundle WITHOUT `meta` -- the shaper driver
 * stamps `meta` from framework-side info (mode, shaperId, model,
 * schemaVersion, ...) after synthesis.
 */
export async function synthesize(args: SynthesizeArgs): Promise<Omit<AnalyzeContextBundle, 'meta'>> {
	return (await synthesizeHandled(args)).layers;
}

/** What an answer-writing provider is, as far as the admission rule is concerned. */
export function admissionTargetOf(provider: LLMProvider, singlePassOutputTokens: number): AdmissionTarget {
	const numCtx = (provider as { numCtx?: unknown }).numCtx;
	if (typeof numCtx === 'number') return { kind: 'local', windowTokens: numCtx, singlePassOutputTokens };
	return { kind: 'cli', inputBudgetChars: provider.inputBudgetChars };
}

/** A part reply holds the seven layers and keeps its summary short; a combine reply holds the narrative layers. */
const SUMMARY_CAP = 2_000;
export function partSchema(): StructuredSchema {
	const schema = structuredClone(stripMetaFromSchema(ANALYZE_CONTEXT_BUNDLE_SCHEMA as Record<string, unknown>)) as { properties: Record<string, Record<string, unknown>> };
	schema.properties['summary'] = { type: 'string', maxLength: SUMMARY_CAP };
	return schema as unknown as StructuredSchema;
}
export const COMBINE_SCHEMA: StructuredSchema = {
	type: 'object', additionalProperties: false, required: ['system', 'focus', 'summary'],
	properties: { system: { type: 'string' }, focus: { type: 'string' }, summary: { type: 'string', maxLength: SUMMARY_CAP } },
};

/** The intent, answer type and hint every call of one answer carries. */
function answerHeader(intent: ClassifiedIntent, executed: ExecutedPlan): string {
	return `Classified intent:\n` + '```json\n' + JSON.stringify(intent, null, 2) + '\n```\n\n'
		+ (intent.context !== undefined && intent.context.length > 0
			? `Background context from the caller (it is background only and never changes what the bundle is about): ${intent.context.replace(/\s+/g, ' ').trim()}\n\n`
			: '')
		+ `Answer type: ${executed.plan.answerType}\nSynthesis hint: ${executed.plan.synthesisHint}\n\n`;
}

/** The adapter that turns parts into prompts for one answer. */
export function bundleAdapter(promptContent: string, intent: ClassifiedIntent, executed: ExecutedPlan): PartAdapter<BundleLayers & { summary: string }, BundleNarrative> {
	const system = promptContent.trimEnd();
	const header = answerHeader(intent, executed);
	const reference = (round: { readonly rendered: string }, more: number): string => (round.rendered.length === 0 ? '' : (
		'Reference evidence (shared by every part; judge the part\'s evidence against it and do not repeat it as evidence'
		+ (more > 0 ? `; it continues in ${more} more round(s) of the same part` : '') + '):\n' + round.rendered + '\n\n'));
	return {
		partSchema: partSchema(), combineSchema: COMBINE_SCHEMA,
		renderPart: (part, round) => [
			{ role: 'system', content: system },
			{ role: 'user', content: header + reference(round, 0) + `Evidence of this part (${part.id}); the answer is divided into parts and this is one of them:\n\n`
				+ part.sections.map(renderSection).join('\n\n')
				+ `\n\nCompose the AnalyzeContextBundle for THIS PART only: the seven layers as strings, from the evidence above. First char \`{\`, no markdown fence, no prose intro. Keep summary under ${SUMMARY_CAP} characters. No claim without evidence.` },
		],
		renderCombine: (summaries, round, more) => [
			{ role: 'system', content: system },
			{ role: 'user', content: header + reference(round, more) + 'The answer was written in parts. Part summaries:\n\n'
				+ summaries.map(x => `### ${x.id}\n${x.summary}`).join('\n\n')
				+ `\n\nEmit the narrative layers of the whole answer as JSON {system, focus, summary}: one line system, one paragraph focus, a summary under ${SUMMARY_CAP} characters that covers every part. The evidence layers are assembled from the parts; do not write them.` },
		],
		summaryOf: r => r.summary, summaryOfCombine: c => c.summary,
		mergeRounds: rs => ({ ...(rs[0] as BundleLayers & { summary: string }), summary: rs.map(r => r.summary).join(' ').slice(0, SUMMARY_CAP),
			structure: rs.map(r => r.structure).join('\n'), surface: rs.map(r => r.surface).join('\n'), artefacts: rs.map(r => r.artefacts).join('\n'), upstream: rs.map(r => r.upstream).join('\n') }),
	};
}

/**
 * Compose the bundle layers and say how the answer was handled: in one pass
 * when the request is XS or S and its input is admitted, else in parts.
 */
export async function synthesizeHandled(args: SynthesizeArgs): Promise<{ readonly layers: Omit<AnalyzeContextBundle, 'meta'>; readonly handling: HandlingReport }> {
	assertConnectionProviderAdmission(args.connectionExecution);
	assertAnalysisConnectionExecution(args.connectionExecution);
	const cfg = loadAnalyzeConfig();
	const promptContent = loadPromptFile(args.target);
	const provider = args.provider ?? resolveRoleProvider('analyze.synthesize', cfg, undefined, args.connectionExecution);

	const messages = buildMessages(promptContent, args.intent, args.executed);
	const found: AnswerStepFound = args.found ?? { results: args.executed.results, report: { completeness: { complete: true, incomplete: [], failed: [] } } };

	let layers: Omit<AnalyzeContextBundle, 'meta'>;
	let handling: HandlingReport;
	try {
		const handled = await runHandled<BundleLayers & { summary: string }, BundleNarrative>({
			provider, target: admissionTargetOf(provider, cfg.shaper.ollamaNumPredict), adapter: bundleAdapter(promptContent, args.intent, args.executed),
			blocks: evidenceBlocks(args.target, args.executed), reference: selectSharedContext(args.target, args.executed),
			found, maxAttempts: cfg.shaper.structuredOutputRetries, connectionExecution: args.connectionExecution,
			size: args.intent.scope, singleMessages: messages,
			// Reuse the bundle schema but drop the `meta` requirement -- the driver stamps `meta` post-synthesis.
			singleSchema: stripMetaFromSchema(ANALYZE_CONTEXT_BUNDLE_SCHEMA as Record<string, unknown>) as StructuredSchema,
		});
		if (handled.kind === 'single') {
			layers = handled.reply;
		} else {
			layers = assembleBundle(args.target, handled.covered, handled.combine);
		}
		handling = handled.handling;
	} catch (err) {
		// A typed failure of a divided call is already the right error; a single pass keeps the legacy classification.
		if (err instanceof ShaperAnswerStepFailedError) throw err;
		throw classifyError(err);
	}

	captureAnalysisDiagnostics(log, args.connectionExecution).emit('info', () => [{
			runId:            args.runId,
			target:           args.target,
			explorationCount: args.executed.results.length,
			method:           handling.method,
			parts:            handling.parts,
			summaryLen:       layers.summary?.length ?? 0,
			structureLen:     layers.structure?.length ?? 0,
			surfaceLen:       layers.surface?.length ?? 0,
			artefactsLen:     layers.artefacts?.length ?? 0,
	}, 'synthesizer: bundle emitted']);

	return { layers, handling };
}

// ---------------------------------------------------------------------------
// Multi-turn MCP prepare / finalize split (docs/plans/mcp-multi-turn-analyze.md)
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
export function finalizeSynthesize(raw: unknown, execution?: ConnectionExecutionContext): Omit<AnalyzeContextBundle, 'meta'>;
/**
 * With the stored progress of an answer written in parts: the reply is for the pending part or combine, and the result
 * is the finished answer with how it was handled, or the progress for the next turn.
 */
export function finalizeSynthesize(raw: unknown, execution: ConnectionExecutionContext | undefined, progress: AnswerProgress, ctx?: { readonly executed: ExecutedPlan }): FinalizedAnswerTurn;
export function finalizeSynthesize(raw: unknown, execution?: ConnectionExecutionContext, progress?: AnswerProgress, ctx?: { readonly executed: ExecutedPlan }): Omit<AnalyzeContextBundle, 'meta'> | FinalizedAnswerTurn {
	if (progress !== undefined && progress.mode === 'partitioned') {
		return applyReply(progress, raw, ctx ?? { executed: { plan: { answerType: '', synthesisHint: '', explorations: [] }, results: [], totalMs: 0, totalCached: 0 } as unknown as ExecutedPlan });
	}
	const strippedSchema = stripMetaFromSchema(
		ANALYZE_CONTEXT_BUNDLE_SCHEMA as Record<string, unknown>,
	) as StructuredSchema;
	const result = validateAgainstSchema<Omit<AnalyzeContextBundle, 'meta'>>(
		strippedSchema, raw, execution,
	);
	if (!result.ok) {
		throw new SynthesizerSchemaUnrecoverable(result.errors);
	}
	return result.value;
}

// ---------------------------------------------------------------------------
// Message composition
// ---------------------------------------------------------------------------

/** The lookups that look at a whole file or directory rather than at one entity. */
const FILE_LEVEL_TYPES: ReadonlySet<string> = new Set(['module.profile', 'convention.detect', 'import.graph']);

interface SymbolAnchor { readonly path: string; readonly entityId: string | undefined }

/** The symbol anchors the executed concept.resolve lookups returned: the request (or the top hit) is ONE entity. */
function symbolAnchorsOf(executed: ExecutedPlan): readonly SymbolAnchor[] {
	const out: SymbolAnchor[] = [];
	for (const r of executed.results) {
		if (r.exploration.type !== 'concept.resolve') continue;
		const anchor = (r.output as { anchor?: { kind?: string; path?: string; entityId?: string } }).anchor;
		if (anchor?.kind === 'symbol' && typeof anchor.path === 'string') out.push({ path: anchor.path, entityId: anchor.entityId });
	}
	return out;
}

/**
 * The purpose line of a lookup as the synthesizer reads it. A file-level
 * lookup on the file a symbol anchor lies in is stated as contextual file
 * expansion: it describes the whole file, not the one entity the answer is about.
 */
function purposeOf(exp: { readonly type: string; readonly purpose: string; readonly params: Record<string, unknown> }, anchors: readonly SymbolAnchor[]): string {
	if (!FILE_LEVEL_TYPES.has(exp.type)) return exp.purpose;
	const path = exp.params['path'];
	const anchor = anchors.find(a => a.path === path);
	if (anchor === undefined) return exp.purpose;
	return `Contextual file expansion: this describes the whole file ${anchor.path}, not only the symbol ${anchor.entityId ?? ''} the answer is about. ${exp.purpose}`;
}

function buildMessages(
	promptContent: string,
	intent:        ClassifiedIntent,
	executed:      ExecutedPlan,
): LLMMessage[] {
	// Render the executed plan as a series of numbered blocks the LLM
	// can scan sequentially. Each block: id, type, purpose, output as
	// pretty-printed JSON.
	const symbolAnchors = symbolAnchorsOf(executed);
	const evidenceBlocks = executed.results
		.map(r =>
			`### ${r.exploration.id} :: ${r.exploration.type}\n` +
			`purpose: ${purposeOf(r.exploration, symbolAnchors)}\n` +
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
		(intent.context !== undefined && intent.context.length > 0
			? `Background context from the caller (it is background only and never changes what the bundle is about): ${intent.context.replace(/\s+/g, ' ').trim()}\n\n`
			: '') +
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
/**
 * The schema the answer-writing model is given: the seven layers only. `meta`
 * is stamped by the caller and `report` is derived by code, so neither is in
 * it. (The argument is kept for the call sites; the schema is the bundle's.)
 */
function stripMetaFromSchema(_schema: Record<string, unknown>): Record<string, unknown> {
	return modelFacingBundleSchema({ withMeta: false });
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

/** Test hook: prompt paths that stand in for the registered ones. */
const promptPathOverrides = new Map<SynthesizerPromptKey, string>();

/** Test hook: point one answer prompt at another path; `undefined` restores the registered one. */
export function _setSynthesizerPromptPathForTest(target: SynthesizerPromptKey, path: string | undefined): void {
	if (path === undefined) promptPathOverrides.delete(target);
	else promptPathOverrides.set(target, path);
}

/** The answer prompt of a synthesize target, as loaded for a call. */
export function loadSynthesizePrompt(target: SynthesizerPromptKey): string {
	return loadPromptFile(target);
}

function loadPromptFile(target: keyof typeof PROMPT_PATHS): string {
	const rel = promptPathOverrides.get(target) ?? PROMPT_PATHS[target];
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

function classifyError(err: unknown): Error {
	if (isModelCallFailure(err)) return new SynthesizerLlmUnavailableError(modelCallFailureDetail(err));
	if (!(err instanceof Error)) return new SynthesizerSchemaUnrecoverable([String(err)]);
	return new SynthesizerSchemaUnrecoverable([err.message]);
}

// ---------------------------------------------------------------------------
// Boot validator hook
// ---------------------------------------------------------------------------

export const _stripMetaFromSchemaForTest = stripMetaFromSchema;
/** Kept for callers; the model-facing schema is built once in schema.ts and is not reset. */
export function _resetStrippedSchemaCacheForTest(): void { /* nothing to reset */ }

export const SYNTHESIZE_CODE_PROMPT_PATH       = SYNTHESIZE_CODE_PROMPT_REL;
export const SYNTHESIZE_DOCS_PROMPT_PATH       = SYNTHESIZE_DOCS_PROMPT_REL;
export const SYNTHESIZE_ADHERENCE_PROMPT_PATH  = SYNTHESIZE_ADHERENCE_PROMPT_REL;
export const SYNTHESIZE_CAPABILITY_PROMPT_PATH = SYNTHESIZE_CAPABILITY_PROMPT_REL;
export const SYNTHESIZE_DATA_PROMPT_PATH       = SYNTHESIZE_DATA_PROMPT_REL;
export const SYNTHESIZE_INFRA_PROMPT_PATH      = SYNTHESIZE_INFRA_PROMPT_REL;

export function getSynthesizerPromptPathForBoot(): string {
	return SYNTHESIZE_CODE_PROMPT_REL;
}
