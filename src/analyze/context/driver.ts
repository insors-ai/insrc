/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Shared LLM-driven shaper driver -- the heart of the Context Builder.
 *
 * Every shaper invocation (classification / run / task across the five
 * shaper ids) routes through `runShaper`. The driver is the only
 * LLM-touching surface in the Context Builder; per-shaper modules and
 * the `shaperFor` factory are thin wrappers that hand the driver a
 * prompt path, an invocation mode, and the inputs.
 *
 * Flow:
 *   1. Resolve cache key (prompt-content hash + schemaVersion +
 *      invocation-inputs hash).
 *   2. Check the on-disk cache. Hit -> return.
 *   3. Cache miss -> load the prompt file. Missing -> ShaperPromptMissingError.
 *   4. Build the LLM message list:
 *        system  = prompt content + CONTRACT_FOOTER_MD
 *        user    = JSON-serialized inputs in a fenced block
 *   5. Run the tool-loop. Each turn: OllamaProvider.complete with the
 *      read-only tool surface. If `stopReason === 'tool_use'`, execute
 *      each tool, append `tool_use` + `tool_result` blocks, and step.
 *      Turn cap: maxToolTurns from config. Overshoot -> ShaperToolLoopExhausted.
 *   6. Final emit: completeStructured against ANALYZE_CONTEXT_BUNDLE_SCHEMA
 *      with maxAttempts = structuredOutputRetries. Exhaustion ->
 *      ShaperSchemaUnrecoverable.
 *   7. Stamp meta { mode, shaper, toolCalls, modelId, emptyLayers,
 *      schemaVersion, repoLastIndexedAt }.
 *   8. Validate via Ajv (defensive backstop; OllamaProvider.completeStructured
 *      already validates, but bumping the schemaVersion-check here makes
 *      the cache layer's pinning meaningful).
 *   9. Persist to cache + return.
 *
 * Failure modes -- all surface as typed errors the run-orchestrator
 * dispatches on:
 *   - ShaperLlmUnavailableError      hard fail on Ollama down
 *   - ShaperToolLoopExhausted         tool-loop overshoot
 *   - ShaperSchemaUnrecoverable       structured-output retries exhausted
 *   - ShaperPromptMissingError        prompt file absent (boot validator
 *                                     in P5 catches this too)
 *
 * See: design/analyze-context-builder.md "Architecture", "Failure modes"
 *      docs/plans/analyze-context-builder.md Phase 3
 */

import { ConnectionExecutionError, assertExplicitConnectionExecution, requireConnectionExecution } from '../../shared/step-context.js';
import { emitStructuredAnswer, runReadOnlyToolLoop, type ReadOnlyToolLoopResult } from '../../agent/read-only-tool-loop.js';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { OllamaProvider } from '../../agent/providers/ollama.js';
import { loadAnalyzeConfig, type AnalyzeConfig } from '../../config/analyze.js';
import { loadLocalProviderConfig } from '../../config/local.js';
import { getModelRegistry, type ModelRegistry, type ResolvedModel } from '../../daemon/model-registry.js';
import type { ToolDeps } from '../../daemon/tools/types.js';
import { listRepos } from '../../db/repos.js';
import { getLogger } from '../../shared/logger.js';
import { isModelCallFailure, modelCallFailureDetail } from './model-failure.js';
import type { RegisteredRepo } from '../../shared/types.js';
import type {
	ContentBlock,
	LLMMessage,
	LLMProvider,
	LLMResponse,
} from '../../shared/types.js';
import { CONTRACT_FOOTER_MD } from '../contract.js';

import {
	cacheFilePathFor,
	invalidateBundle,
	isStaleByIndexer,
	readBundle,
	writeBundle,
	type CacheKey,
} from './cache.js';
import { ensureScopeQueryable } from '../runtimes/shared/task-scope.js';
import { assertSessionReuseNow, beginSessionReuse, assertSessionReuse } from '../session-reuse.js';
import { assertAnalysisConnectionExecution } from '../connection-access.js';
import { freshnessPathOf, resolveScope, resolveScopeForTarget } from './scope.js';
import type { ResolvedScope, ScopeDeps } from './scope.js';
import {
	modelFacingBundleSchema,
	SCHEMA_VERSION,
	validateBundleWithErrors,
} from './schema.js';
import { getReadOnlyTools, READ_ONLY_TOOL_IDS } from './tool-surface.js';
import { decompose, DecomposerLlmUnavailableError, DecomposerPromptMissingError } from './decomposer.js';
import { synthesize, SynthesizerLlmUnavailableError, SynthesizerPromptMissingError } from './synthesizer.js';
import { executePlan } from '../explore/index.js';
import type { ExecutedExploration, ExplorationPlan } from '../explore/index.js';
import type { AnswerReport, PartialFinding } from '../completeness.js';
import { reportFromLookups } from '../explore/answer-report.js';
import { measureLookupResults, measureResolvedScope } from '../measure.js';
import type { AnalyzeScopeRef, ClassifiedIntent } from '../../shared/analyze-types.js';
import type {
	AnalyzeContextBundle,
	BundleLayerName,
	ClassificationShapeInput,
	RunShapeInput,
	ShapeOpts,
	ShaperId,
	ShaperMode,
	ShaperTraceEvent,
	TaskShapeInput,
} from './types.js';

/** The tools the analyzer's tool loop may execute: the advertised read-only surface. */
const READ_ONLY_SET: ReadonlySet<string> = new Set(READ_ONLY_TOOL_IDS);

const log = getLogger('analyze:context:driver');

const BUNDLE_LAYERS: readonly BundleLayerName[] = Object.freeze([
	'system',
	'focus',
	'summary',
	'structure',
	'surface',
	'artefacts',
	'upstream',
]);

// ---------------------------------------------------------------------------
// Public types + errors
// ---------------------------------------------------------------------------

export interface RunShaperArgs {
	/** Trusted staged carrier; never reconstructed from serialized input. */
	readonly connectionExecution: import('../../shared/step-context.js').ConnectionExecutionContext;
	readonly promptPath:     string;
	readonly invocationMode: ShaperMode;
	readonly shaperId:       ShaperId;
	readonly inputs:
		| ClassificationShapeInput
		| RunShapeInput
		| TaskShapeInput;
	readonly opts: ShapeOpts;
	/**
	 * Optional injected provider, primarily for tests. Production
	 * callers leave this unset; the driver constructs an
	 * OllamaProvider from analyze config.
	 */
	readonly provider?: LLMProvider | undefined;
	/**
	 * Optional stand-ins for the lookup pipeline's steps and for the
	 * scope readers, for tests. Production callers leave both unset.
	 */
	readonly pipelineSteps?: PipelineSteps | undefined;
	readonly scopeDeps?:     ScopeDeps | undefined;
}

/** The shaper's model call that failed: the lookup pipeline's two calls,
 *  or the tool loop and its final structured emit. */
export type ShaperModelCall = 'planning' | 'answer writing' | 'tool loop' | 'final structured emit';

/** How each call is named in a message. */
const SHAPER_CALL_WORDING: Readonly<Record<ShaperModelCall, string>> = {
	'planning':              'planning',
	'answer writing':        'answer writing',
	'tool loop':             'the tool loop',
	'final structured emit': 'the final structured emit',
};

export class ShaperLlmUnavailableError extends Error {
	/**
	 * `call` names the call that failed. The message names no provider:
	 * every call is role-routed and need not be Ollama, so the provider
	 * appears only through the failure's own words in `cause`.
	 */
	constructor(cause: string, call: ShaperModelCall) {
		super(`The model call for ${SHAPER_CALL_WORDING[call]} failed: ${cause}`);
		this.name = 'ShaperLlmUnavailableError';
	}
}

/**
 * A tool's output as text, for the findings kept beside the conversation.
 * This is bookkeeping: a value that has no JSON form (undefined, a circular
 * structure, a BigInt) is described, never thrown from here into the tool loop.
 */
export function toolOutputText(output: unknown): string {
	if (typeof output === 'string') return output;
	try {
		return JSON.stringify(output) ?? `(the tool returned ${String(output)})`;
	} catch (err) {
		return `(the tool's output has no JSON form: ${err instanceof Error ? err.message : String(err)})`;
	}
}

/** Where the tool results gathered before a turn limit were written, and how much was written. */
export interface SavedToolResults {
	/** Absolute path of a JSON file: an array of `{ source, content }`, one per tool call, nothing cut. */
	readonly path:  string;
	readonly count: number;
	/** The total length of every result's content. */
	readonly chars: number;
}

export class ShaperToolLoopExhausted extends Error {
	/** Every tool call the loop made before it reached the limit, with what the tool returned. */
	readonly toolResults: readonly PartialFinding[];
	/**
	 * The file the results were written to. The results are not capped and can
	 * be large, so a failure reported to a caller names this file in its
	 * message and does not carry them. Absent when nothing was gathered or the
	 * file could not be written; the results are then carried in the failure.
	 */
	readonly saved: SavedToolResults | undefined;

	constructor(turns: number, toolResults: readonly PartialFinding[] = [], saved?: SavedToolResults) {
		super(
			`Shaper tool-loop exceeded maxToolTurns=${turns}`
			+ (saved !== undefined
				? `. The ${saved.count} tool result(s) gathered before the limit (${saved.chars} characters, nothing cut) are in ${saved.path}`
				: ''),
		);
		this.name = 'ShaperToolLoopExhausted';
		this.toolResults = toolResults;
		this.saved = saved;
	}
}

/**
 * The turn-limit error for a loop that gathered `toolResults`: they are
 * written in full to a temporary file, and the error's message names it.
 */
export function toolLoopExhausted(turns: number, toolResults: readonly PartialFinding[]): ShaperToolLoopExhausted {
	return new ShaperToolLoopExhausted(turns, toolResults, saveToolResults(toolResults));
}

/**
 * Write the gathered tool results to a temporary file, whole. Returns
 * undefined when there is nothing to write or the file cannot be written: the
 * caller then carries the results themselves, so nothing is lost either way.
 */
export function saveToolResults(
	toolResults: readonly PartialFinding[],
	dir: string = join(tmpdir(), 'insrc-analyze'),
): SavedToolResults | undefined {
	if (toolResults.length === 0) return undefined;
	try {
		mkdirSync(dir, { recursive: true });
		const path = join(dir, `tool-results-${randomUUID()}.json`);
		writeFileSync(path, JSON.stringify(toolResults, null, 2), 'utf8');
		return { path, count: toolResults.length, chars: toolResults.reduce((n, r) => n + r.content.length, 0) };
	} catch (err) {
		log.warn({ dir, err: err instanceof Error ? err.message : String(err) }, 'tool-loop results could not be written to a file; they stay in the failure');
		return undefined;
	}
}

/**
 * What a failure reported to a caller carries for this error: the file and
 * its size when the results were written to one, the results themselves when
 * they were not.
 */
export function toolLoopExhaustedData(err: ShaperToolLoopExhausted): Readonly<Record<string, unknown>> {
	return err.saved !== undefined
		? { toolResultsFile: err.saved.path, toolResultCount: err.saved.count, toolResultChars: err.saved.chars }
		: { toolResults: err.toolResults };
}

export class ShaperSchemaUnrecoverable extends Error {
	constructor(retries: number, lastErrors: readonly string[]) {
		super(
			`Shaper completeStructured exhausted ${retries} retries: ` +
				lastErrors.join('; '),
		);
		this.name = 'ShaperSchemaUnrecoverable';
	}
}

export class ShaperPromptMissingError extends Error {
	/**
	 * Set when the missing prompt is the answer-writing one: that prompt is
	 * loaded after the lookups ran, so what they found is carried with the
	 * failure. A missing planning prompt is found before any lookup and has none.
	 */
	readonly found: AnswerStepFound | undefined;

	constructor(promptPath: string, found?: AnswerStepFound) {
		super(`Shaper prompt file missing: ${promptPath}`);
		this.name = 'ShaperPromptMissingError';
		this.found = found;
	}
}

/** Run-mode inputs the pipeline cannot serve: an unknown kind of
 *  source, or inputs that carry no intent. A caller's mistake. */
export class ShaperInvalidInputError extends Error {
	constructor(detail: string) {
		super(`Shaper inputs are invalid: ${detail}`);
		this.name = 'ShaperInvalidInputError';
	}
}

/** A read of the scope's last-indexed time failed (a store error), so the
 *  freshness of a cached bundle or of a lookup could not be established. */
export class ShaperIndexStateReadError extends Error {
	constructor(detail: string) {
		super(`The repository's last-indexed time could not be read: ${detail}`);
		this.name = 'ShaperIndexStateReadError';
	}
}

/** The lookup executor itself failed (a lookup that crashed, a store error). */
export class ShaperLookupFailedError extends Error {
	constructor(detail: string) {
		super(`The lookups could not be run: ${detail}`);
		this.name = 'ShaperLookupFailedError';
	}
}

/** The plan about to be executed has no lookups. */
export class ShaperNoPlanError extends Error {
	constructor(detail: string) {
		super(`No plan could be made for this request: ${detail}`);
		this.name = 'ShaperNoPlanError';
	}
}

/** Why the answer-writing step failed, after the lookups ran. */
export type AnswerStepFailureReason = 'model-failed' | 'invalid-answer' | 'invalid-bundle';

const ANSWER_STEP_FAILURE_TEXT: Readonly<Record<AnswerStepFailureReason, string>> = {
	'model-failed':   'the model call for answer writing failed',
	'invalid-answer': 'the answer-writing output was invalid',
	'invalid-bundle': 'the bundle failed validation',
};

/**
 * The lookups ran and the answer could not be written. The request ends
 * here: no other way of answering is tried. The error carries what the
 * lookups returned and the report derived from them, with the report's
 * `answerFailure` set, so the findings are not lost with the failure.
 */
export class ShaperAnswerStepFailedError extends Error {
	readonly reason: AnswerStepFailureReason;
	readonly found:  AnswerStepFound;

	constructor(reason: AnswerStepFailureReason, detail: string, found: AnswerStepFound) {
		const failure = `${ANSWER_STEP_FAILURE_TEXT[reason]}: ${detail}`;
		super(`The answer could not be written after ${found.results.length} lookup(s) ran -- ${failure}`);
		this.name = 'ShaperAnswerStepFailedError';
		this.reason = reason;
		this.found = { results: found.results, report: { ...found.report, answerFailure: failure } };
	}
}

// ---------------------------------------------------------------------------
// runShaper -- public entry point
// ---------------------------------------------------------------------------

/** The registered repository a bundle is built over, or null for none. */
function bundleRepoPathOf(scope: ResolvedScope): string | null {
	return scope.kind === 'connection' ? null : scope.repoPath;
}

/**
 * Whether runShaper checks the index state of a request's scope itself: a run
 * of any source but the generic one, unless its caller checked the scope
 * already (runAnalyze, before it measured). Classification and task modes are
 * not checked: by the time a task fires, the run-mode invocation has checked
 * its scope. A cache hit and a miss decide by this one rule, so a warm cache
 * never answers differently from a cold one.
 */
function checksScopeState(invocationMode: RunShaperArgs['invocationMode'], shaperId: RunShaperArgs['shaperId'], opts: ShapeOpts): boolean {
	return invocationMode === 'run' && opts.scopeChecked !== true && shaperId !== 'generic';
}

/**
 * The check a checked request's scope gets, on a hit and on a miss alike: the
 * analyze run's own per-source rule (ensureScopeQueryable), so the sources
 * that read the stored graph (code and docs) need the scope indexed, and every
 * other checked source is refused only for a repository under index
 * (ISSUE-0c845762). Classification and generic requests are never checked
 * (checksScopeState).
 */
async function checkScopeState(shaperId: RunShaperArgs['shaperId'], scope: ResolvedScope): Promise<void> {
	if (shaperId === 'classification' || shaperId === 'generic') return;
	await ensureScopeQueryable(scope, shaperId);
}

/**
 * Whether a cached bundle may be served, judged from what it recorded,
 * without resolving the request's scope:
 *   - no repoPath key (written before it was recorded): a miss;
 *   - repoPath null (built over no repository): served, as today;
 *   - a repository: for a request whose scope runShaper checks
 *     (checksScopeState), the recorded repository gets the check a miss makes
 *     (checkScopeState): refused when it is under index, and for the code
 *     and docs sources when the index no longer holds it; a miss when its last-indexed
 *     time has moved past the bundle's.
 */
async function servedFromCache(
	bundle:        AnalyzeContextBundle,
	scopeCheck:    ((scope: ResolvedScope) => Promise<void>) | undefined,
	lastIndexedOf: (path: string) => Promise<number | undefined>,
): Promise<boolean> {
	const meta = bundle.meta;
	if (meta === undefined || !('repoPath' in meta) || meta.repoPath === undefined) return false;
	if (meta.repoPath === null) return true;
	const repo = meta.repoPath;
	if (scopeCheck !== undefined) {
		await scopeCheck({ kind: 'repo', value: repo, repoPath: repo, lookupPath: repo });
	}
	const current = await lastIndexedOf(repo);
	return current === undefined || !isStaleByIndexer(bundle, current);
}

type ShaperEntryArgs = Omit<RunShaperArgs, 'connectionExecution'>;

/** One cache implementation shared by a strict invocation and the unattached saved entry. */
async function prepareShaperCache(args: ShaperEntryArgs, execution?: import('../../shared/step-context.js').ConnectionExecutionContext) {
	const { promptPath, invocationMode, shaperId, inputs, opts } = args;
	const runId = opts.runId;
	// (1) Load prompt content; we need its hash for the cache key.
	const promptContent = loadPromptFile(promptPath);

	// (2) Compute cache key.
	const cacheKey: CacheKey = {
		mode:   invocationMode,
		hash:   computeCacheKey(promptContent, inputs),
		...(invocationMode === 'task'
			? { taskId: (inputs as TaskShapeInput).task.taskId }
			: {}),
	};

	// The last-indexed read goes through the same injectable reader as the
	// pipeline's, and a throw from it is the 'index-state-read-failed' cause.
	// `undefined` means the path is in no registered repo (or the registry
	// cannot be read): there is no freshness watermark to check.
	const steps = args.pipelineSteps ?? REAL_PIPELINE_STEPS;
	const lastIndexedOf = async (path: string): Promise<number | undefined> => {
		try {
			return await steps.lastIndexedAt(path);
		} catch (err) {
			throw errorForPipelineCause('index-state-read-failed', errorText(err));
		}
	};

	// (3) Cache lookup, BEFORE the scope is resolved: the key does not depend
	// on the resolved scope, so a hit needs none of it. A failure to resolve
	// something the cache does not depend on cannot make a hit unreachable.
	const cached = execution?.mode === 'session-memory' ? null : readBundle(runId, cacheKey, { ...opts, connectionExecution: execution ?? opts.connectionExecution });
	if (cached !== null) {
		const scopeCheck = checksScopeState(invocationMode, shaperId, opts)
			? (scope: ResolvedScope) => checkScopeState(shaperId, scope)
			: undefined;
		const served = await servedFromCache(cached, scopeCheck, lastIndexedOf);
		if (served) {
			log.debug(
				{ runId, mode: invocationMode, shaperId, file: cacheFilePathFor(runId, cacheKey) },
				'shaper cache hit',
			);
			return { promptContent, cacheKey, steps, lastIndexedOf, cachedBundle: withCurrentHint(cached, inputs) };
		}
		invalidateBundle(runId, cacheKey, execution);
	}

	return { promptContent, cacheKey, steps, lastIndexedOf, cachedBundle: null };
}

/** Cache-only saved front door: never constructs a provider or resolves a source on a hit. */
export async function readUnattachedSavedShaperCache(args: ShaperEntryArgs): Promise<AnalyzeContextBundle | null> {
	assertExplicitConnectionExecution(undefined);
	if (args.opts.connectionExecution !== undefined) throw new ConnectionExecutionError('session-expired');
	loadAnalyzeConfig();
	return (await prepareShaperCache(args)).cachedBundle;
}

export async function runShaper(args: RunShaperArgs): Promise<AnalyzeContextBundle> {
	assertAnalysisConnectionExecution(args.connectionExecution);
	const execution = requireConnectionExecution(args.connectionExecution);
	if (args.opts?.connectionExecution !== undefined && args.opts.connectionExecution !== execution) throw new ConnectionExecutionError('session-expired');
	if (execution.mode === 'session-memory' && execution.provider.mode !== 'verified-local') throw new ConnectionExecutionError('unsupported-temporary');
	await beginSessionReuse(execution);
	assertSessionReuseNow(execution);
	const cfg = loadAnalyzeConfig();
	const { promptPath, invocationMode, shaperId, inputs, opts } = args;
	const runId = opts.runId;

	const { promptContent, cacheKey, steps, lastIndexedOf, cachedBundle } = await prepareShaperCache(args, execution);
	if (cachedBundle !== null) return cachedBundle;

	// (4) A miss. Resolve the scope ONCE, for every mode. Everything below
	// that needs the scope's repo, its lookup directory, its entity or
	// its connection takes it from here. For run mode the pairing of
	// the scope's kind with the kind of source is checked first: a
	// request can arrive with a ready-made intent that no classifier
	// validated.
	const scope = await prepareScope(invocationMode, inputs, args.scopeDeps, opts.connectionExecution ?? args.connectionExecution);

	// (4.5) Before any model call, unless the caller made these checks
	// already (runAnalyze, before it measured):
	//   - a run of any source but the generic one is refused when the
	//     scope's repository is being indexed or its last index failed;
	//   - the code and docs sources also need a non-empty graph closure
	//     (the empty-closure check, which makes the under-index check first).
	// classification + task modes skip both: by the time a task fires,
	// the run-mode invocation has already checked its scope.
	if (checksScopeState(invocationMode, shaperId, opts)) await checkScopeState(shaperId, scope);

	// The scope's repo lastIndexedAt, stamped into meta for the next
	// invocation's freshness check.
	const currentLastIndexedAt = await lastIndexedOf(freshnessPathOf(scope));
	const repoPath = bundleRepoPathOf(scope);

	// (4.6) The lookup pipeline: plan lookups -> execute them -> write
	// the answer. Every run-mode request goes through it. It returns a
	// bundle, or the one cause for which it did not proceed, or
	// 'not-applicable' for a mode it does not serve.
	const outcome = await tryExplorationPipeline(
		{ invocationMode, shaperId, inputs, runId, scope, connectionExecution: execution },
		steps,
	);
	// A cause the pipeline names becomes its own typed error here, in
	// one place; an invalid bundle is one more cause. Only a mode the
	// pipeline does not serve (classification, task) continues to the
	// tool loop below. A run-mode request never does: its fallback is
	// the pipeline's own freeform.probe, which drives the same loop.
	const pipelineBundle = settlePipelineOutcome(outcome, (raw, explorationCount, report) => ({
		...raw,
		// Derived from the lookups' own records. Never taken from the model's answer.
		report,
		meta: {
			mode:          invocationMode,
			shaper:        shaperId,
			toolCalls:     explorationCount,
			modelId:       cfg.shaperModel,
			emptyLayers:   deriveEmptyLayers(raw),
			schemaVersion: SCHEMA_VERSION,
			...(currentLastIndexedAt !== undefined ? { repoLastIndexedAt: currentLastIndexedAt } : {}),
			repoPath,
		},
	}));
	if (pipelineBundle !== null) {
		await assertSessionReuse(execution);
		assertSessionReuseNow(execution);
		if (execution.mode !== 'session-memory') writeBundle(runId, cacheKey, pipelineBundle.bundle, execution);
		log.info(
			{
				runId,
				mode:              invocationMode,
				shaperId,
				pipeline:          'exploration',
				explorationCount:  pipelineBundle.explorationCount,
			},
			'shaper invocation complete (exploration pipeline)',
		);
		return pipelineBundle.bundle;
	}

	// (4) Build the LLM message list. Classification + task modes
	// still run the legacy tool loop here -- those flows are out of
	// scope for Phase 6.
	const messages = buildMessages(promptContent, inputs, invocationMode, shaperId);

	// (5) Resolve provider + tool deps.
	const provider = args.provider ?? buildLocalToolLoopProvider(cfg);
	const toolDeps = buildToolDeps({
		runId,
		shaperId,
		invocationMode,
		scope,
		provider,
		connectionExecution: execution,
	});

	// (6) Run the tool-loop + final structured emit.
	const onTrace = opts.onTrace;
	const { messages: finalMessages, toolCallCount } = await runToolLoop(
		provider,
		messages,
		toolDeps,
		cfg.shaper.maxToolTurns,
		onTrace,
	);

	const rawBundle = await runFinalStructuredEmit(
		provider,
		finalMessages,
		cfg.shaper.structuredOutputRetries,
		cfg.shaper.ollamaNumPredict,
		onTrace,
		execution,
	);

	// (7) Stamp meta + validate. `repoLastIndexedAt` carries the registry
	// watermark we read pre-Ollama-call. The next invocation's cache
	// read compares against the current watermark to detect a fresh
	// index cycle.
	const bundle: AnalyzeContextBundle = {
		...rawBundle,
		meta: {
			mode:          invocationMode,
			shaper:        shaperId,
			toolCalls:     toolCallCount,
			modelId:       cfg.shaperModel,
			emptyLayers:   deriveEmptyLayers(rawBundle),
			schemaVersion: SCHEMA_VERSION,
			...(currentLastIndexedAt !== undefined ? { repoLastIndexedAt: currentLastIndexedAt } : {}),
			repoPath,
		},
	};

	const v = validateBundleWithErrors(bundle);
	if (!v.ok) {
		// completeStructured should have caught this. If we land here the
		// schema or the meta stamp is wrong; surface loudly rather than
		// caching a malformed entry.
		throw new ShaperSchemaUnrecoverable(cfg.shaper.structuredOutputRetries, v.errors);
	}

	// (8) Persist + return.
	await assertSessionReuse(execution);
	assertSessionReuseNow(execution);
	if (execution.mode !== 'session-memory') writeBundle(runId, cacheKey, bundle, execution);
	log.info(
		{ runId, mode: invocationMode, shaperId, toolCalls: toolCallCount },
		'shaper invocation complete',
	);
	return bundle;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function loadPromptFile(promptPath: string): string {
	const abs = isAbsolute(promptPath) ? promptPath : resolveRelativeToInsrcRoot(promptPath);
	try {
		return readFileSync(abs, 'utf8');
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
			throw new ShaperPromptMissingError(abs);
		}
		throw err;
	}
}

/**
 * Resolve a prompt-relative path against the insrc root -- the
 * directory at the head of the compiled tree.
 *
 * Layouts handled (driver.js position in parens):
 *   - dev source (src/insrc/analyze/context/driver.ts)
 *       -> insrcRoot = src/insrc
 *   - compiled (out/insrc/analyze/context/driver.js)
 *       -> insrcRoot = out/insrc
 *   - production daemon (~/.insrc/daemon/out/insrc/analyze/context/driver.js)
 *       -> insrcRoot = ~/.insrc/daemon/out/insrc
 *
 * Prompt files live at `src/insrc/prompts/analyze/<shaper>.system.md`
 * and are mirrored to `out/insrc/prompts/analyze/...` by the build
 * script's *.md copy pass, so the same relative-from-insrc-root path
 * works in every layout.
 */
function resolveRelativeToInsrcRoot(relativePath: string): string {
	const thisFile = fileURLToPath(import.meta.url);
	// .../analyze/context/driver.js -> .../analyze/context -> .../analyze -> .../insrc
	const insrcRoot = resolve(thisFile, '..', '..', '..');
	return resolve(insrcRoot, relativePath);
}

function computeCacheKey(
	promptContent: string,
	inputs: RunShaperArgs['inputs'],
): string {
	const h = createHash('sha256');
	h.update('analyze-context-bundle:');
	h.update(String(SCHEMA_VERSION));
	h.update('|prompt:');
	h.update(promptContent);
	h.update('|inputs:');
	h.update(stableStringify(keyedInputs(inputs)));
	return h.digest('hex');
}

/**
 * What of a set of inputs the cache key is taken over.
 *
 * For a run-level request the intent's size, the stated size and a measure
 * the caller handed in are left out. The size the builder works with is measured: it is a function of the
 * scope, which is in the key, and of the index, whose state already
 * invalidates the cache. So two callers that state different sizes, or none,
 * share one cached bundle.
 */
function keyedInputs(inputs: RunShaperArgs['inputs']): unknown {
	if (!('intent' in inputs) || 'task' in inputs) return inputs;
	const { intent } = inputs as RunShapeInput;
	const { scope: _size, ...unsized } = intent;
	return { intent: unsized };
}

/** A cached bundle for the current call: the hint on its report's measure is this call's, not the one it was stored with. */
function withCurrentHint(bundle: AnalyzeContextBundle, inputs: RunShaperArgs['inputs']): AnalyzeContextBundle {
	const measure = bundle.report?.measure;
	if (bundle.report === undefined || measure === undefined || !('intent' in inputs) || 'task' in inputs) return bundle;
	const { sizeHint: _stored, ...counted } = measure;
	const sizeHint = (inputs as RunShapeInput).sizeHint;
	return { ...bundle, report: { ...bundle.report, measure: sizeHint !== undefined ? { ...counted, sizeHint } : counted } };
}

/**
 * Stable JSON stringification with sorted keys at every level. The
 * cache key must be deterministic for identical-input invocations,
 * so plain JSON.stringify (which preserves insertion order) is not
 * safe across runs.
 *
 * Map instances (TaskShapeInput.upstreamTasks) are serialized via
 * their entries(), sorted by key, so the map's insertion order does
 * not affect the cache key.
 */
function stableStringify(value: unknown): string {
	return JSON.stringify(value, (_k, v) => {
		if (v instanceof Map) {
			const obj: Record<string, unknown> = {};
			const entries: [string, unknown][] = [];
			for (const [k, val] of v.entries()) {
				entries.push([String(k), val]);
			}
			entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
			for (const [k, val] of entries) {
				obj[k] = val;
			}
			return obj;
		}
		if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
			const sorted: Record<string, unknown> = {};
			const keys = Object.keys(v as Record<string, unknown>).sort();
			for (const k of keys) {
				sorted[k] = (v as Record<string, unknown>)[k];
			}
			return sorted;
		}
		return v;
	});
}

function buildMessages(
	promptContent: string,
	inputs:        RunShaperArgs['inputs'],
	mode:          ShaperMode,
	shaperId:      ShaperId,
): LLMMessage[] {
	const systemContent = `${promptContent.trimEnd()}\n\n${CONTRACT_FOOTER_MD}`;
	const serializedInputs = stableStringify(inputs);

	const upstreamSection = renderUpstreamSection(inputs);

	const userContent =
		`Mode: ${mode}\n` +
		`Shaper: ${shaperId}\n` +
		`SchemaVersion: ${SCHEMA_VERSION}\n` +
		`\n` +
		'Inputs:\n' +
		'```json\n' +
		serializedInputs +
		'\n```\n' +
		(upstreamSection.length > 0 ? `\n${upstreamSection}\n` : '') +
		'\n' +
		'Use the available tools as needed to gather context, then emit an ' +
		'`AnalyzeContextBundle` matching the schema. Layers you have nothing ' +
		'to report on should be emitted as the empty string -- the assembler ' +
		'will omit them from the rendered Markdown.';

	return [
		{ role: 'system', content: systemContent },
		{ role: 'user',   content: userContent },
	];
}

/**
 * Render the upstream-tasks section of the user message for task-mode
 * invocations. Each upstream task gets a dedicated block; tasks whose
 * stored output is `null` (the planner / orchestrator stamps null when
 * the upstream task failed or was skipped) get an explicit
 * `[unavailable: <taskId>]` marker the prompt is instructed to surface
 * in the `upstream` layer.
 *
 * Returns the empty string when the inputs aren't task-mode or when
 * there are no upstream tasks declared.
 */
function renderUpstreamSection(inputs: RunShaperArgs['inputs']): string {
	if (!('task' in inputs)) return '';
	const map = (inputs as TaskShapeInput).upstreamTasks;
	if (map.size === 0) return '';

	const blocks: string[] = ['Upstream task outputs:'];
	const ids = Array.from(map.keys()).sort();
	for (const id of ids) {
		const out = map.get(id);
		if (out === null || out === undefined) {
			blocks.push(
				`### ${id}\n` +
				`[unavailable: upstream task ${id} failed or produced no output; ` +
				`surface this in the bundle's \`upstream\` layer and note that ` +
				`downstream claims may be limited.]`,
			);
		} else {
			blocks.push(
				`### ${id}\n` +
				'```json\n' +
				stableStringify(out) +
				'\n```',
			);
		}
	}
	return blocks.join('\n\n');
}

// ---------------------------------------------------------------------------
// Public: tool-loop primitive shared by the driver's classification / task
// tail AND the freeform.probe exploration runner (Phase 6).
// ---------------------------------------------------------------------------

/**
 * Result of a raw tool-loop invocation. `rawBundle` is the bundle
 * WITHOUT `meta` (the caller stamps meta from framework-side info);
 * `toolCallCount` is the exact number of tool executions the loop
 * performed so the caller can carry it forward into `meta.toolCalls`.
 */
export interface ShaperToolLoopResult {
	readonly rawBundle:     Omit<AnalyzeContextBundle, 'meta'>;
	readonly toolCallCount: number;
}

export interface RunShaperToolLoopArgs {
	/** Required normalized tuple, including explicit saved authority for legacy callers. */
	readonly connectionExecution: import('../../shared/step-context.js').ConnectionExecutionContext;
	readonly runId:          string;
	readonly shaperId:       ShaperId;
	readonly invocationMode: ShaperMode;
	readonly inputs:         RunShaperArgs['inputs'];
	/** The scope `inputs` carries, resolved. The loop's tools run in
	 *  its lookup directory. */
	readonly scope:          ResolvedScope;
	readonly promptPath:     string;
	readonly provider?:      LLMProvider;
	readonly onTrace?:       (event: ShaperTraceEvent) => void;
}

/**
 * docs/plans/exploration-based-context-build.md Phase 6. Run the target's
 * legacy tool loop bounded by `cfg.shaper.maxToolTurns` + the final
 * structured emit; return the raw bundle content.
 *
 * This is the same primitive that ran inside runShaper's tail for
 * un-recipe'd intents. Phase 6 extracts it as the freeform.probe
 * escape hatch -- only fires when the decomposer explicitly emits a
 * `freeform.probe` exploration. Un-recipe'd intents used to fall
 * into this path silently; now they surface a `freeform.probe`
 * exploration in the plan so the reader can see the pipeline made
 * the escape-hatch call.
 *
 * Does NOT stamp `meta` or write the run's bundle cache -- both are
 * the caller's responsibility. Does NOT run the exploration
 * pipeline check either -- the caller decides whether to route
 * through this primitive.
 */
export async function runShaperToolLoop(
	args: RunShaperToolLoopArgs,
): Promise<ShaperToolLoopResult> {
	assertAnalysisConnectionExecution(args.connectionExecution);
	const execution = requireConnectionExecution(args.connectionExecution);
	if (execution.mode === 'session-memory' && execution.provider.mode !== 'verified-local') throw new ConnectionExecutionError('unsupported-temporary');
	const cfg = loadAnalyzeConfig();
	const promptContent = loadPromptFile(args.promptPath);
	const messages = buildMessages(promptContent, args.inputs, args.invocationMode, args.shaperId);
	const provider = args.provider ?? buildLocalToolLoopProvider(cfg);
	const toolDeps = buildToolDeps({
		runId:          args.runId,
		shaperId:       args.shaperId,
		invocationMode: args.invocationMode,
		scope:          args.scope,
		provider,
		connectionExecution: execution,
	});
	const { messages: finalMessages, toolCallCount } = await runToolLoop(
		provider,
		messages,
		toolDeps,
		cfg.shaper.maxToolTurns,
		args.onTrace,
	);
	const rawBundle = await runFinalStructuredEmit(
		provider,
		finalMessages,
		cfg.shaper.structuredOutputRetries,
		cfg.shaper.ollamaNumPredict,
		args.onTrace,
		execution,
	);
	assertAnalysisConnectionExecution(execution);
	return { rawBundle, toolCallCount };
}

interface ToolLoopResult {
	readonly messages:      LLMMessage[];
	readonly toolCallCount: number;
}

/** Exported for tests; production reaches it through runShaper and runShaperToolLoop. */
export const _runToolLoopForTest = (...a: Parameters<typeof runToolLoop>): ReturnType<typeof runToolLoop> => runToolLoop(...a);

async function runToolLoop(
	provider:     LLMProvider,
	messages:     LLMMessage[],
	deps:         ToolDeps,
	maxToolTurns: number,
	onTrace?:     ((event: ShaperTraceEvent) => void) | undefined,
): Promise<ToolLoopResult> {
	assertAnalysisConnectionExecution(deps.connectionExecution);
	let result: ReadOnlyToolLoopResult;
	try {
		result = await runReadOnlyToolLoop({
			connectionExecution: deps.connectionExecution,
			provider,
			messages,
			tools:    getReadOnlyTools(),
			allow:    READ_ONLY_SET,
			deps,
			maxTurns: maxToolTurns,
			// Each call fires a paired trace event (call + response) so the UI's
			// LiveStepsWidget can grow a sub-row per tool interaction --
			// otherwise a 6+ minute tool loop looks like a single silent
			// stage row to the user (ISSUES.md I-002).
			onTrace: onTrace === undefined ? undefined : (event) => {
				if (event.type === 'tool-call') {
					onTrace({ type: 'tool-call', tool: event.tool, argsPreview: previewToolArgs(event.input) });
				} else {
					onTrace({ type: 'tool-response', tool: event.tool, ok: event.ok, notePreview: previewToolOutput(event.output) });
				}
			},
		});
	} catch (err) {
		assertAnalysisConnectionExecution(deps.connectionExecution);
		if (err instanceof ConnectionExecutionError) throw err;
		throw classifyOllamaError(err, 'tool loop');
	}
	assertAnalysisConnectionExecution(deps.connectionExecution);
	if (result.done) return { messages: result.messages, toolCallCount: result.toolCallCount };

	// The results are written to a file in full; the error's message names it.
	const gathered: PartialFinding[] = result.gathered.map(g => ({
		source:  `${g.tool}(${previewToolArgs(g.input)})`,
		content: toolOutputText(g.output),
	}));
	throw toolLoopExhausted(maxToolTurns, gathered);
}

async function runFinalStructuredEmit(
	provider:                LLMProvider,
	messages:                LLMMessage[],
	structuredOutputRetries: number,
	maxOutputTokens:         number,
	onTrace?:                ((event: ShaperTraceEvent) => void) | undefined,
	execution?: import('../../shared/step-context.js').ConnectionExecutionContext,
): Promise<AnalyzeContextBundle> {
	assertAnalysisConnectionExecution(execution);
	// Per feedback_prompt_structure: structural reference goes trailing.
	// The final user turn carries the explicit schema reminder so the
	// model's recency-weighted attention lands on the required-fields
	// list right before it emits. Even though Ollama enforces format
	// schema at the wire layer, qwen3.6 in practice still:
	//   - omits "empty" fields (collapsing required strings to absent keys)
	//   - invents helper keys like `layers` or `bundle`
	//   - emits objects/arrays instead of strings for empty fields
	// The Ajv backstop catches all three, but retrying with a vague
	// "emit the bundle" prompt loses cycles. Explicit field-by-field
	// guidance turns ~3-retry failures into single-pass successes.
	const instruction =
		'Now emit the final AnalyzeContextBundle as a JSON object.\n' +
		'\n' +
		'The object MUST have EXACTLY these seven string fields, in any order:\n' +
		'  - "system"     (string, required)\n' +
		'  - "focus"      (string, required)\n' +
		'  - "summary"    (string, required)\n' +
		'  - "structure"  (string, required)\n' +
		'  - "surface"    (string, required)\n' +
		'  - "artefacts"  (string, required)\n' +
		'  - "upstream"   (string, required)\n' +
		'\n' +
		'Rules:\n' +
		'  - Every field is REQUIRED. Use "" (empty string) for any layer\n' +
		'    you have nothing to report on -- do not omit the key.\n' +
		'  - Each value MUST be a string -- never an object, array, number,\n' +
		'    or null. For empty layers use "".\n' +
		'  - DO NOT add any field outside the seven listed above. No\n' +
		'    `layers`, `bundle`, `meta`, `data`, or other wrapper keys.\n' +
		'\n' +
		'Respond with ONLY the JSON object -- no prose, no fenced block.';

	// Live-preview state: accumulate the incoming stream, keep the tail
	// visible, throttle emissions so a burst of small chunks doesn't
	// spam the IPC channel. The throttle is time-based (>= 250ms since
	// last emit) OR size-based (>= 400 chars new). Cap the preview at
	// 240 chars so IPC frames stay small.
	let acc = '';
	let lastEmit = 0;
	let lastEmitLen = 0;
	const onStreamToken = onTrace === undefined ? undefined : (delta: string) => {
		acc += delta;
		const now = Date.now();
		const bytesSince = acc.length - lastEmitLen;
		if (now - lastEmit >= 250 || bytesSince >= 400) {
			lastEmit = now;
			lastEmitLen = acc.length;
			onTrace({
				type:    'llm-token',
				preview: acc.length > 240 ? acc.slice(-240) : acc,
			});
		}
	};

	try {
		const raw = await emitStructuredAnswer<AnalyzeContextBundle>({
			connectionExecution: execution,
			provider,
			messages,
			instruction,
			// The stored schema without `report`: the report is derived by code.
			schema:      modelFacingBundleSchema({ withMeta: true }),
			maxAttempts: structuredOutputRetries,
			// Output-token budget. The shaper bundle has 7 fields each
			// of which can carry multi-section markdown; 8K is too
			// small for code-target M/L/XL scopes (truncates as
			// "Unterminated string in JSON"). Configured via
			// analyze.shaper.ollamaNumPredict (default 20480).
			maxTokens:   maxOutputTokens,
			onToken:     onStreamToken,
		});
		return raw;
	} catch (err) {
		assertAnalysisConnectionExecution(execution);
		if (err instanceof ConnectionExecutionError) throw err;
		const errClass = classifyOllamaError(err, 'final structured emit');
		// classifyOllamaError returns either a ShaperLlmUnavailableError or
		// the original error; if it's the original, treat it as a schema
		// failure that the retry budget already burned through.
		if (errClass instanceof ShaperLlmUnavailableError) {
			throw errClass;
		}
		const message = err instanceof Error ? err.message : String(err);
		throw new ShaperSchemaUnrecoverable(structuredOutputRetries, [message]);
	}
}

/**
 * Render tool-call input as a compact single-line preview for the
 * UI's LiveStepsWidget sub-row. Path / key values pass through raw;
 * everything else JSON.stringifies. Cap at 200 chars to keep IPC
 * frames small.
 */
function previewToolArgs(input: unknown): string {
	if (input === null || input === undefined) {
		return '';
	}
	if (typeof input === 'string') {
		return input.length > 200 ? input.slice(0, 197) + '...' : input;
	}
	if (typeof input === 'object') {
		const rec = input as Record<string, unknown>;
		// Prefer 'path' / 'file' / 'query' / 'name' as the salient
		// preview field when present -- reads better than dumped JSON.
		for (const salient of ['path', 'file', 'query', 'name', 'symbol', 'id']) {
			const v = rec[salient];
			if (typeof v === 'string' && v.length > 0) {
				return v.length > 200 ? v.slice(0, 197) + '...' : v;
			}
		}
	}
	try {
		const s = JSON.stringify(input);
		return s.length > 200 ? s.slice(0, 197) + '...' : s;
	} catch {
		return '(unrenderable)';
	}
}

/**
 * Render tool-call output as a single-line preview. Truncates hard --
 * many tool outputs are multi-KB and the sub-row only shows what
 * fits on one line.
 */
function previewToolOutput(output: unknown): string {
	if (output === null || output === undefined) {
		return '';
	}
	const s = typeof output === 'string' ? output : (() => {
		try { return JSON.stringify(output); } catch { return String(output); }
	})();
	const oneLine = s.replace(/\s+/g, ' ').trim();
	return oneLine.length > 200 ? oneLine.slice(0, 197) + '...' : oneLine;
}

function classifyOllamaError(err: unknown, call: ShaperModelCall): Error {
	if (!(err instanceof Error)) {
		return new Error(String(err));
	}
	// By the time an error reaches the driver, the provider's transient-
	// retry budget is gone -- so a failed call here means the model is
	// effectively unavailable to us, not "might recover next turn".
	// What counts as a failed call is decided in one place, for every
	// provider (model-failure.ts).
	if (isModelCallFailure(err)) {
		return new ShaperLlmUnavailableError(modelCallFailureDetail(err), call);
	}
	return err;
}

function deriveEmptyLayers(bundle: AnalyzeContextBundle): BundleLayerName[] {
	const empty: BundleLayerName[] = [];
	for (const layer of BUNDLE_LAYERS) {
		const body = bundle[layer];
		if (typeof body === 'string' && body.trim().length === 0) {
			empty.push(layer);
		}
	}
	return empty;
}

// ---------------------------------------------------------------------------
// Provider + tool-deps construction
// ---------------------------------------------------------------------------

/**
 * Tool-loop provider is intentionally Ollama-only. The classifier /
 * task-mode legacy tail + `runShaperToolLoop` (freeform.probe)
 * dispatch through this function; both drive multi-turn tool loops,
 * which `CliProvider.supportsTools === false` cannot power. The
 * MCP-integration shaperProvider config only routes the structured-
 * output call sites (decomposer, synthesizer, doc.decision.trace,
 * doc.constraint.enumerate, capability.reuse-check, classifier,
 * planner, summariser, adherence, aggregator) --
 * everything reachable via `buildShaperProvider(cfg)`. Tool-loop
 * callers stay on Ollama regardless of shaperProvider.
 */
function buildLocalToolLoopProvider(cfg: AnalyzeConfig): LLMProvider {
	const { model, numCtx } = localToolLoopModel(cfg);
	const local = loadLocalProviderConfig();
	return new OllamaProvider(model, local.host, numCtx);
}

/** The local Ollama model for the tool-loop path (classification / task modes),
 *  which REQUIRES an Ollama provider (`CliProvider.supportsTools === false`),
 *  and its context window (the model's token inputLimit). In order: the cheap
 *  tier's model when that tier resolved to the ollama family; else the local
 *  `coreModel` when the ollama family lists it; else the definitions'
 *  tool-loop model (logged when a coreModel was set but is not listed) —
 *  never a CLI-only model id (which would break OllamaProvider). */
export function localToolLoopModel(cfg: AnalyzeConfig, registry: ModelRegistry = getModelRegistry()): { model: string; numCtx: number } {
	const cheap = cfg.tierResolutions?.cheap;
	const coreModel = loadLocalProviderConfig().coreModel;
	let chosen: ResolvedModel | undefined;
	if (cheap !== undefined && registry.cliKind(cheap.family) === undefined) chosen = cheap.model;
	// The local family is the tool-loop model's.
	chosen ??= registry.find(registry.toolLoopModel().family, coreModel);
	if (chosen === undefined) {
		chosen = registry.toolLoopModel();
		if (coreModel !== '') log.warn({ requested: coreModel, model: chosen.id }, `models.local.coreModel '${coreModel}' is not a listed Ollama model; the tool loop runs ${chosen.id}`);
	}
	return { model: chosen.id, numCtx: chosen.inputLimit?.max ?? 0 };
}

interface BuildToolDepsArgs {
	readonly connectionExecution: import('../../shared/step-context.js').ConnectionExecutionContext;
	readonly runId:          string;
	readonly shaperId:       ShaperId;
	readonly invocationMode: ShaperMode;
	readonly scope:          ResolvedScope;
	readonly provider:       LLMProvider;
}

function buildToolDeps(args: BuildToolDepsArgs): ToolDeps {
	assertAnalysisConnectionExecution(args.connectionExecution);
	requireConnectionExecution(args.connectionExecution);
	const sessionId = `analyze-shaper-${args.runId}-${args.invocationMode}-${args.shaperId}`;
	// The directory the tools run in: the scope's own directory for a
	// repo / module / manifest directory / workspace; the containing
	// repo for a file or a symbol; the declaring repo for a connection.
	const repoPath = args.scope.lookupPath;
	return {
		sessionId,
		repoPath,
		connectionExecution: args.connectionExecution,
		signal: args.connectionExecution.lifetime.signal,
		// V1 shaper closure = the scope's containing repo only.
		// docs/plans/docs-module.md Section 6.3 pins the docs retriever to
		// this policy; graph_search + docs_* tools use this to bound
		// their queries. A future revision may widen to the transitive
		// DEPENDS_ON closure, but doing so at the shaper boundary is
		// out of scope for the docs module.
		closureRepos:   [repoPath],
		send:           () => { /* shaper does not stream */ },
		requestId:      0,
		ollamaProvider: args.provider,
		caller:         'agent',
	};
}

/** The scope a set of inputs carries: classification inputs hold it
 *  directly; run and task inputs hold it on the intent. */
function scopeRefOf(inputs: RunShaperArgs['inputs']): AnalyzeScopeRef {
	if ('scopeRef' in inputs) return (inputs as ClassificationShapeInput).scopeRef;
	if ('intent' in inputs) return (inputs as RunShapeInput | TaskShapeInput).intent.scopeRef;
	// Inputs that carry neither are a caller's mistake: say so, with
	// the code for it, where a bare property access used to throw.
	throw new ShaperInvalidInputError('inputs carry neither a scope nor an intent');
}

/**
 * Check the pairing (run mode) and resolve the scope.
 *
 * The pairing of a kind of scope with a kind of source is validated
 * by the classifier -- but a request can reach the context builder
 * with a ready-made intent no classifier saw (the daemon's run-context
 * and plan requests, the one-shot agent tool). So run mode makes the
 * same test here, BEFORE the scope is resolved, against the same table.
 */
export async function prepareScope(
	invocationMode: ShaperMode,
	inputs:         RunShaperArgs['inputs'],
	deps?:          ScopeDeps,
	execution?: import('../../shared/step-context.js').ConnectionExecutionContext,
): Promise<ResolvedScope> {
	assertAnalysisConnectionExecution(execution);
	const ref = scopeRefOf(inputs);
	if ('intent' in inputs && (invocationMode === 'run' || (execution?.mode === 'session-memory' && inputs.intent.target === 'data'))) {
		const target = (inputs as RunShapeInput).intent.target;
		return resolveScopeForTarget(ref, target, deps, undefined, execution);
	}
	return resolveScope(ref, deps, execution);
}

/**
 * Resolve the registry's `lastIndexed` timestamp for the repo that
 * contains `scopePath`. Returns the ms-epoch value, or `undefined`
 * when:
 *   - `scopePath` is empty (e.g. 'connection' scope ref)
 *   - no registered repo's path is a prefix of `scopePath`
 *   - the matching repo has no `lastIndexed` yet (never indexed)
 *
 * The "containing repo" is the registered repo with the longest
 * path that is a prefix of `scopePath` (handles nested registered
 * repos cleanly -- inner wins).
 *
 * Errors reading the registry (e.g. graph store not initialised
 * in a test environment) are swallowed and return `undefined`; the
 * cache layer then skips the freshness check, falling back to the
 * key-hash check alone. This is the conservative choice: if we
 * can't read the registry, we don't pretend the cache is fresh.
 */
export async function resolveRepoLastIndexedAt(scopePath: string): Promise<number | undefined> {
	if (scopePath.length === 0) return undefined;

	let repos: readonly RegisteredRepo[];
	try {
		repos = await listRepos(null);
	} catch (err) {
		log.debug(
			{ scopePath, err: (err as Error).message },
			'resolveRepoLastIndexedAt: registry read failed; skipping freshness check',
		);
		return undefined;
	}

	let best: RegisteredRepo | undefined;
	for (const r of repos) {
		const isPrefix = scopePath === r.path || scopePath.startsWith(`${r.path}/`);
		if (!isPrefix) continue;
		if (best === undefined || r.path.length > best.path.length) {
			best = r;
		}
	}

	if (best === undefined || best.lastIndexed === undefined) {
		return undefined;
	}

	const ms = Date.parse(best.lastIndexed);
	return Number.isNaN(ms) ? undefined : ms;
}

// ---------------------------------------------------------------------------
// Exploration-based pipeline (docs/plans/exploration-based-context-build.md)
// ---------------------------------------------------------------------------

/**
 * Every way the pipeline declines to proceed. The list is the whole
 * contract: `errorForPipelineCause` has one case per member, so a new
 * way of not proceeding cannot fall into a default error.
 */
export const PIPELINE_CAUSES = [
	'invalid-input',           // unknown kind of source, or inputs with no intent
	'planner-prompt-missing',
	'planner-model-failed',
	'answer-prompt-missing',
	'answer-model-failed',
	'answer-invalid',          // the answer-writing step failed for any other reason
	'empty-plan',              // the plan that would be executed has no lookups
	'bundle-invalid',          // the pipeline's bundle fails validation (set by settlePipelineOutcome)
	'index-state-read-failed', // the read of the scope's last-indexed time threw
	'lookup-failed',           // the lookup executor threw
] as const;
export type PipelineCause = (typeof PIPELINE_CAUSES)[number];

/** What the lookups returned, and the answer report derived from it. */
export interface AnswerStepFound {
	readonly results: readonly ExecutedExploration[];
	readonly report:  AnswerReport;
}

/** The seven layers a model writes: a bundle without the two parts code adds. */
export type BundleLayers = Omit<AnalyzeContextBundle, 'meta' | 'report'>;

export type PipelineOutcome =
	| {
		readonly kind: 'bundle';
		readonly raw:  BundleLayers;
		readonly explorationCount: number;
		/** The executed lookups and the report derived from them; the report goes on the bundle. */
		readonly found: AnswerStepFound;
	}
	/** Not run mode: the caller continues to its tool loop. */
	| { readonly kind: 'not-applicable' }
	| {
		readonly kind:    'did-not-proceed';
		readonly cause:   PipelineCause;
		readonly message: string;
		/** For the two prompt-missing causes. */
		readonly promptPath?: string | undefined;
		/** For the causes that arise after the lookups ran: what the lookups found. */
		readonly found?: AnswerStepFound | undefined;
	};

/** What a cause carries besides its message. */
export interface PipelineCauseExtra {
	/** For the two prompt-missing causes. */
	readonly promptPath?: string | undefined;
	/** What the lookups returned and the report derived from them, for the causes that arise after they ran. */
	readonly found?: AnswerStepFound | undefined;
}

/**
 * The pipeline's four steps. Production uses the real ones; a test
 * passes stand-ins so the pipeline can be driven without a model, a
 * store or a prompt file.
 */
export interface PipelineSteps {
	readonly decompose:            typeof decompose;
	readonly executePlan:          typeof executePlan;
	readonly synthesize:           typeof synthesize;
	readonly fallbackFreeformPlan: (intent: ClassifiedIntent, shaperId: ShaperId) => ExplorationPlan;
	/** The repo's last-indexed time, part of the lookup cache key. */
	readonly lastIndexedAt:        (scopePath: string) => Promise<number | undefined>;
	/** The measure of the area the scope names; the real measuring pass when a set of steps gives none. */
	readonly measureArea?:         typeof measureResolvedScope | undefined;
}

/** The ONE table from a cause to its typed error. */
export function errorForPipelineCause(
	cause:   PipelineCause,
	message: string,
	extra:   PipelineCauseExtra = {},
): Error {
	// The three answer-step causes arise only after the lookups ran, so each
	// has the lookups' results. One raised without them is a defect of the
	// caller, reported as such and not as a failure with nothing found.
	const answerStepFailed = (reason: AnswerStepFailureReason): Error => {
		if (extra.found === undefined) {
			throw new Error(`errorForPipelineCause: cause '${cause}' arises after the lookups ran and was raised without their results`);
		}
		return new ShaperAnswerStepFailedError(reason, message, extra.found);
	};
	switch (cause) {
		case 'invalid-input':
			return new ShaperInvalidInputError(message);
		case 'planner-prompt-missing':
			// Found before any lookup ran: nothing to carry.
			return new ShaperPromptMissingError(extra.promptPath ?? message);
		case 'answer-prompt-missing':
			// A fault of the installation, named as one, with what the lookups found.
			return new ShaperPromptMissingError(extra.promptPath ?? message, extra.found);
		case 'planner-model-failed':
			return new ShaperLlmUnavailableError(message, 'planning');
		case 'answer-model-failed':
			return answerStepFailed('model-failed');
		case 'answer-invalid':
			return answerStepFailed('invalid-answer');
		case 'bundle-invalid':
			return answerStepFailed('invalid-bundle');
		case 'empty-plan':
			return new ShaperNoPlanError(message);
		case 'index-state-read-failed':
			return new ShaperIndexStateReadError(message);
		case 'lookup-failed':
			return new ShaperLookupFailedError(message);
		default: {
			const unreachable: never = cause;
			throw new Error(`errorForPipelineCause: unhandled cause ${String(unreachable)}`);
		}
	}
}

/**
 * Turn a pipeline outcome into what runShaper does with it:
 *   - 'bundle'          -> stamp meta, validate, return it; an invalid
 *                          bundle is the 'bundle-invalid' cause.
 *   - 'did-not-proceed' -> throw the cause's typed error.
 *   - 'not-applicable'  -> null: the caller continues to its tool loop.
 */
export function settlePipelineOutcome(
	outcome: PipelineOutcome,
	stamp:   (raw: BundleLayers, explorationCount: number, report: AnswerReport) => AnalyzeContextBundle,
): { bundle: AnalyzeContextBundle; explorationCount: number } | null {
	if (outcome.kind === 'not-applicable') return null;
	if (outcome.kind === 'did-not-proceed') {
		throw errorForPipelineCause(outcome.cause, outcome.message, { promptPath: outcome.promptPath, found: outcome.found });
	}
	const bundle = stamp(outcome.raw, outcome.explorationCount, outcome.found.report);
	const v = validateBundleWithErrors(bundle);
	if (!v.ok) {
		throw errorForPipelineCause('bundle-invalid', v.errors.join('; '), { found: outcome.found });
	}
	return { bundle, explorationCount: outcome.explorationCount };
}

/** A thrown value's own words. */
function errorText(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

function didNotProceed(cause: PipelineCause, message: string, extra: PipelineCauseExtra = {}): PipelineOutcome {
	return { kind: 'did-not-proceed', cause, message, promptPath: extra.promptPath, found: extra.found };
}

/**
 * The lookup pipeline: plan lookups, execute them, write the answer.
 *
 * Returns one of three outcomes:
 *   - 'bundle'          the composed bundle (minus meta);
 *   - 'not-applicable'  for a mode it does not serve (classification,
 *                       task) -- the caller continues to its tool loop;
 *   - 'did-not-proceed' with the one cause for which it stopped.
 *
 * Every run-mode request is served: any kind of source, any of the
 * seven kinds of scope, with or without a focus.
 */
async function tryExplorationPipeline(
	args: {
		connectionExecution?: import('../../shared/step-context.js').ConnectionExecutionContext | undefined;
		invocationMode: ShaperMode;
		shaperId:       ShaperId;
		inputs:         RunShaperArgs['inputs'];
		runId:          string;
		/** The scope, already resolved (resolveScope). */
		scope:          ResolvedScope;
	},
	steps: PipelineSteps = REAL_PIPELINE_STEPS,
): Promise<PipelineOutcome> {
	assertAnalysisConnectionExecution(args.connectionExecution);
	const execution = requireConnectionExecution(args.connectionExecution);
	if (args.invocationMode !== 'run') return { kind: 'not-applicable' };
	// Every run-mode shaper flows through the exploration pipeline
	// (docs/plans/exploration-based-context-build.md Phase 6). Recipe-less
	// shapers (generic) or recipe-less intents land in the
	// freeform.probe fallback below rather than dropping to the
	// retired legacy tool-loop tail.
	if (args.shaperId       !== 'code'
	 && args.shaperId       !== 'docs'
	 && args.shaperId       !== 'data'
	 && args.shaperId       !== 'infra'
	 && args.shaperId       !== 'generic') {
		return didNotProceed('invalid-input', `unknown kind of source '${String(args.shaperId)}'`);
	}
	if (!('intent' in args.inputs)) {
		return didNotProceed('invalid-input', 'run-mode inputs carry no intent');
	}
	// What the request is. A size on the intent it came with is not read: the
	// builder is the one writer of the size in this pipeline.
	const { intent: given, sizeHint, measure: handed } = args.inputs as RunShapeInput;
	const { scope: _notRead, ...unsized } = given;

	// (a.0) The size for the planning call: counted from the area the scope
	// names. A caller that has already measured that area hands its measure
	// in, and it is used as it is, also when it is not determined: the area is
	// then not measured a second time. A measure of lookup results is not a
	// measure of a named area and is not used. Otherwise the pass measures; it
	// does not throw, and an area it cannot count is the largest size, with
	// the reason.
	const reused = handed !== undefined && handed.source !== 'lookup-results';
	const area = reused
		? handed
		: await (steps.measureArea ?? measureResolvedScope)(args.scope, unsized.target, sizeHint, { connectionExecution: execution, signal: execution.lifetime.signal });
	assertAnalysisConnectionExecution(execution);
	const intent: ClassifiedIntent = { ...unsized, scope: area.size };
	log.info(
		{ runId: args.runId, size: area.size, determined: area.determined, files: area.files, items: area.items, sizeHint, note: area.note, reused },
		reused ? "exploration pipeline: the caller's measure of the named area was used" : 'exploration pipeline: the named area was measured',
	);

	// (a) Decompose. LLM unavailable / prompt missing -> fall through
	// (there is no LLM to run anyway). Schema-unrecoverable OR an
	// out-of-recipe answer type gets converted into a
	// `freeform.probe`-only fallback plan so the target's legacy tool
	// loop still answers the intent (plans/exploration-based-context-
	// build.md Phase 6 escape hatch).
	let plan: ExplorationPlan;
	let usedFallback = false;
	try {
		plan = await steps.decompose({ intent, runId: args.runId, scope: args.scope, connectionExecution: execution });
		assertAnalysisConnectionExecution(execution);
	} catch (err) {
		assertAnalysisConnectionExecution(execution);
		if (err instanceof ConnectionExecutionError) throw err;
		if (err instanceof DecomposerLlmUnavailableError) {
			log.info(
				{ runId: args.runId, err: err.message },
				'exploration pipeline: the planning call failed',
			);
			return didNotProceed('planner-model-failed', err.detail);
		}
		if (err instanceof DecomposerPromptMissingError) {
			log.info(
				{ runId: args.runId, err: err.message },
				'exploration pipeline: the planning prompt is missing',
			);
			return didNotProceed('planner-prompt-missing', err.message, { promptPath: err.path });
		}
		log.warn(
			{ runId: args.runId, err: (err as Error).message },
			'exploration pipeline: decomposer failed; using freeform.probe fallback',
		);
		plan = steps.fallbackFreeformPlan(intent, args.shaperId);
		usedFallback = true;
	}

	// Answer types by target (Phases 1-5):
	//   code shaper  -> structural-map | adherence-check | capability-discovery | how-does-it-work
	//   docs shaper  -> decision-trace | prose-retrieval
	//   data shaper  -> data-inventory
	//   infra shaper -> infra-inventory
	// Any other combination (or empty explorations) triggers the
	// Phase 6 freeform.probe fallback rather than dropping to the
	// legacy tail. Plans that already emit `freeform.probe` (as a
	// standalone or as the sole exploration) are accepted here so the
	// decomposer's own escape-hatch signal isn't second-guessed.
	const codeAnswerTypes  = new Set(['structural-map', 'adherence-check', 'capability-discovery', 'how-does-it-work']);
	const docsAnswerTypes  = new Set(['decision-trace', 'prose-retrieval']);
	const dataAnswerTypes  = new Set(['data-inventory']);
	const infraAnswerTypes = new Set(['infra-inventory']);
	const isCodeAnswer  = args.shaperId === 'code'  && codeAnswerTypes.has(plan.answerType);
	const isDocsAnswer  = args.shaperId === 'docs'  && docsAnswerTypes.has(plan.answerType);
	const isDataAnswer  = args.shaperId === 'data'  && dataAnswerTypes.has(plan.answerType);
	const isInfraAnswer = args.shaperId === 'infra' && infraAnswerTypes.has(plan.answerType);
	const isRecipedAnswer = isCodeAnswer || isDocsAnswer || isDataAnswer || isInfraAnswer;
	const hasExplorations = plan.explorations.length > 0;
	const hasFreeformProbe = plan.explorations.some(e => e.type === 'freeform.probe');
	if ((!isRecipedAnswer && !hasFreeformProbe) || !hasExplorations) {
		log.info(
			{
				runId:            args.runId,
				shaperId:         args.shaperId,
				answerType:       plan.answerType,
				explorationCount: plan.explorations.length,
			},
			'exploration pipeline: answer type not covered by any recipe; using freeform.probe fallback',
		);
		plan = steps.fallbackFreeformPlan(intent, args.shaperId);
		usedFallback = true;
	}

	// The replacement above always yields one lookup today. This check
	// stands behind it so that a later change to the replacement cannot
	// turn an empty plan into a silent nothing.
	if (plan.explorations.length === 0) {
		return didNotProceed('empty-plan', `the plan for this request has no lookups (answer type '${plan.answerType}')`);
	}

	// (b) Execute the plan.
	// All seven kinds of scope are served: the lookups run in the
	// directory the scope resolved to.
	const repoPath = args.scope.lookupPath;
	// A throw from either read is a named cause, never a raw rejection.
	let lastIndexedMs: number | undefined;
	try {
		lastIndexedMs = await steps.lastIndexedAt(freshnessPathOf(args.scope));
	} catch (err) {
		assertAnalysisConnectionExecution(execution);
		if (err instanceof ConnectionExecutionError) throw err;
		return didNotProceed('index-state-read-failed', errorText(err));
	}
	const lastIndexedBigInt = BigInt(lastIndexedMs ?? 0);
	let executed: Awaited<ReturnType<PipelineSteps['executePlan']>>;
	try {
		executed = await steps.executePlan({
			connectionExecution: execution,
			runId:            args.runId,
			repoPath,
			closureRepos:     [repoPath],
			repoLastIndexedAtMs: lastIndexedBigInt,
			plan,
			scope:            args.scope,
			// A lookup that sizes its own work (the free-form one) takes the request's size from here.
			requestSize:      area.size,
		});
	} catch (err) {
		assertAnalysisConnectionExecution(execution);
		if (err instanceof ConnectionExecutionError) throw err;
		return didNotProceed('lookup-failed', errorText(err));
	}

	assertAnalysisConnectionExecution(execution);
	// (c.0) The answer report, derived from the lookups' own records before any
	// answer is written. It does not depend on the answer. A lookup output
	// that states nothing about its completeness is a defect of that lookup:
	// it is listed as a failed source, and the answer is written from the rest.
	//
	// The request's measure is taken here too, from what the lookups returned:
	// it is the report's measure, and its size is the size the answer step is given.
	const measure = measureLookupResults(executed.results, sizeHint);
	const found: AnswerStepFound = { results: executed.results, report: reportFromLookups(executed.results, measure) };
	const answerIntent: ClassifiedIntent = { ...unsized, scope: measure.size };

	// (c.1) Freeform.probe short-circuit: when a plan's SOLE
	// exploration is `freeform.probe`, the runner already emitted a
	// complete 7-layer bundle via the target's legacy tool loop. There
	// is nothing to synthesize -- an extra LLM pass would only risk
	// paraphrasing the tool loop's honest output. Return the runner's
	// rawBundle directly + carry its actual toolCallCount so the meta
	// stamp reflects the real work done.
	const freeformOnly = extractSoleFreeformResult(executed);
	if (freeformOnly !== null) {
		log.info(
			{
				runId:         args.runId,
				shaperId:      args.shaperId,
				usedFallback,
				toolCallCount: freeformOnly.toolCallCount,
			},
			'exploration pipeline: freeform.probe short-circuit',
		);
		return {
			kind:             'bundle',
			raw:              freeformOnly.rawBundle,
			explorationCount: freeformOnly.toolCallCount,
			// One source: the free-form lookup, whose record is never complete.
			found,
		};
	}

	// (c.2) Synthesize. Pick the synthesizer prompt keyed by
	// (shaperId, answerType):
	//   docs shaper                            -> 'docs'
	//   data shaper                            -> 'data'
	//   infra shaper                           -> 'infra'
	//   code shaper + adherence-check          -> 'adherence'
	//   code shaper + capability-discovery     -> 'capability'
	//   code shaper + <anything else>          -> 'code'
	// The synthesize() call throws SynthesizerPromptMissingError if
	// the key is unregistered; the catch below rolls us back to the
	// legacy shaper.
	const synthesizeTarget: 'code' | 'docs' | 'adherence' | 'capability' | 'data' | 'infra' =
		args.shaperId === 'docs'
			? 'docs'
			: args.shaperId === 'data'
				? 'data'
				: args.shaperId === 'infra'
					? 'infra'
					: plan.answerType === 'adherence-check'
						? 'adherence'
						: plan.answerType === 'capability-discovery'
							? 'capability'
							: 'code';
	try {
		const raw = await steps.synthesize({
			connectionExecution: execution,
			runId:    args.runId,
			intent:   answerIntent,
			executed,
			target:   synthesizeTarget,
		});
		assertAnalysisConnectionExecution(execution);
		return {
			kind:             'bundle',
			raw,
			explorationCount: executed.results.length,
			found,
		};
	} catch (err) {
		assertAnalysisConnectionExecution(execution);
		if (err instanceof ConnectionExecutionError) throw err;
		if (err instanceof SynthesizerLlmUnavailableError) {
			log.info(
				{ runId: args.runId, err: err.message },
				'exploration pipeline: the answer-writing call failed',
			);
			return didNotProceed('answer-model-failed', err.detail, { found });
		}
		if (err instanceof SynthesizerPromptMissingError) {
			log.info(
				{ runId: args.runId, err: err.message },
				'exploration pipeline: the answer-writing prompt is missing',
			);
			return didNotProceed('answer-prompt-missing', err.message, { promptPath: err.path, found });
		}
		// Anything else the answer-writing step raises (for example its
		// output never took the required shape) is its own cause -- not
		// a failed model call.
		const message = err instanceof Error ? err.message : String(err);
		log.warn({ runId: args.runId, err: message }, 'exploration pipeline: the answer-writing step failed');
		return didNotProceed('answer-invalid', message, { found });
	}
}

const REAL_PIPELINE_STEPS: PipelineSteps = {
	decompose,
	executePlan,
	synthesize,
	fallbackFreeformPlan,
	lastIndexedAt: resolveRepoLastIndexedAt,
};

/**
 * Emit a freeform.probe-only plan for intents that don't map to any
 * deterministic recipe (docs/plans/exploration-based-context-build.md
 * Phase 6). The plan's `answerType` is stamped as the intent's
 * target-natural default so downstream logs stay readable; the
 * runner reads only `params.purpose` + `params.shaperId`.
 */
function fallbackFreeformPlan(
	intent:   ClassifiedIntent,
	shaperId: ShaperId,
): ExplorationPlan {
	const fallbackShaperId: 'code' | 'docs' | 'data' | 'infra' | 'generic' =
		shaperId === 'code'  || shaperId === 'docs'
	 || shaperId === 'data'  || shaperId === 'infra'
	 || shaperId === 'generic' ? shaperId : 'generic';
	// An intent with no focus has no question to hand the loop. The
	// classifier's reasoning is a note about how it classified, not a
	// question, so the loop is given a stated purpose instead.
	const purpose = intent.focus
		?? `Broad survey of the ${intent.scopeRef.kind} ${intent.scopeRef.value}`;
	return {
		answerType:    inferAnswerTypeForFallback(shaperId),
		synthesisHint:
			'Escape-hatch: no deterministic recipe matched this intent, so ' +
			'freeform.probe drives the target\'s legacy tool loop for a bounded ' +
			'number of turns. The runner returns the bundle layers verbatim.',
		explorations: [
			{
				id:      'e1',
				type:    'freeform.probe',
				purpose:
					`Answer the intent via the ${fallbackShaperId} shaper's ` +
					`legacy tool loop: ${purpose}`,
				params: {
					purpose,
					shaperId: fallbackShaperId,
				},
			},
		],
	};
}

function inferAnswerTypeForFallback(shaperId: ShaperId): ExplorationPlan['answerType'] {
	if (shaperId === 'docs')  return 'prose-retrieval';
	if (shaperId === 'data')  return 'data-inventory';
	if (shaperId === 'infra') return 'infra-inventory';
	return 'how-does-it-work';
}

/**
 * If the executed plan's SOLE exploration is a successful
 * freeform.probe, return its bundle + actual tool call count so the
 * driver can short-circuit synthesis. Any other shape (mixed plan,
 * failed freeform, etc.) returns null.
 */
function extractSoleFreeformResult(
	executed: Awaited<ReturnType<typeof executePlan>>,
): { rawBundle: Omit<AnalyzeContextBundle, 'meta'>; toolCallCount: number } | null {
	if (executed.results.length !== 1) return null;
	const sole = executed.results[0]!.output;
	if (sole.type !== 'freeform.probe') return null;
	// The raw bundle is only meaningful when the tool loop settled.
	// Exhausted / failed runs still emit the empty-layers bundle; the
	// synthesizer path is a better place to surface those.
	const layers = sole.rawBundle;
	const allEmpty = layers.system.length === 0
		&& layers.summary.length === 0
		&& layers.structure.length === 0;
	if (allEmpty) return null;
	return {
		rawBundle: {
			system:    layers.system,
			focus:     layers.focus,
			summary:   layers.summary,
			structure: layers.structure,
			surface:   layers.surface,
			artefacts: layers.artefacts,
			upstream:  layers.upstream,
		},
		toolCallCount: sole.toolCallCount,
	};
}

// ---------------------------------------------------------------------------
// Test hooks
// ---------------------------------------------------------------------------

/**
 * Re-export the internal stable-stringify so tests can pin cache-key
 * stability without re-implementing the algorithm.
 */
export const _stableStringifyForTest = stableStringify;
export const _computeCacheKeyForTest = computeCacheKey;
export const _classifyOllamaErrorForTest = classifyOllamaError;
export const _runFinalStructuredEmitForTest = runFinalStructuredEmit;
export const _deriveEmptyLayersForTest = deriveEmptyLayers;
export const _resolveRepoLastIndexedAtForTest = resolveRepoLastIndexedAt;
export const _buildToolDepsForTest = buildToolDeps;
export const _renderUpstreamSectionForTest = renderUpstreamSection;
export const _fallbackFreeformPlanForTest = fallbackFreeformPlan;
export const _runExplorationPipelineForTest = tryExplorationPipeline;
/** The pipeline's real steps, for a test that replaces just one. */
export const _realPipelineStepsForTest: PipelineSteps = REAL_PIPELINE_STEPS;
export const _extractSoleFreeformResultForTest = extractSoleFreeformResult;
