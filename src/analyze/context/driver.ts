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
 *      plans/analyze-context-builder.md Phase 3
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { OllamaProvider } from '../../agent/providers/ollama.js';
import { loadAnalyzeConfig } from '../../config/analyze.js';
import { loadLocalProviderConfig } from '../../config/local.js';
import { executeTool } from '../../daemon/tools/executor.js';
import type { ToolDeps } from '../../daemon/tools/types.js';
import { listRepos } from '../../db/repos.js';
import { getLogger } from '../../shared/logger.js';
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
	readBundle,
	writeBundle,
	type CacheKey,
} from './cache.js';
import { ensureNonEmptyClosure } from './invariants.js';
import {
	ANALYZE_CONTEXT_BUNDLE_SCHEMA,
	SCHEMA_VERSION,
	validateBundleWithErrors,
} from './schema.js';
import { getReadOnlyTools } from './tool-surface.js';
import { decompose, DecomposerLlmUnavailableError, DecomposerPromptMissingError } from './decomposer.js';
import { synthesize, SynthesizerLlmUnavailableError, SynthesizerPromptMissingError } from './synthesizer.js';
import { executePlan } from '../explore/index.js';
import type { ExplorationPlan } from '../explore/index.js';
import type { ClassifiedIntent } from '../../shared/analyze-types.js';
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
}

export class ShaperLlmUnavailableError extends Error {
	constructor(cause: string) {
		super(`Local Ollama unavailable for shaper invocation: ${cause}`);
		this.name = 'ShaperLlmUnavailableError';
	}
}

export class ShaperToolLoopExhausted extends Error {
	constructor(turns: number) {
		super(`Shaper tool-loop exceeded maxToolTurns=${turns}`);
		this.name = 'ShaperToolLoopExhausted';
	}
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
	constructor(promptPath: string) {
		super(`Shaper prompt file missing: ${promptPath}`);
		this.name = 'ShaperPromptMissingError';
	}
}

// ---------------------------------------------------------------------------
// runShaper -- public entry point
// ---------------------------------------------------------------------------

export async function runShaper(args: RunShaperArgs): Promise<AnalyzeContextBundle> {
	const cfg = loadAnalyzeConfig();
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

	// (3) Resolve the scope's repo lastIndexedAt from the registry. Used
	// for both the cache freshness check below + stamping into meta on
	// write. `undefined` here means the scope target isn't a registered
	// repo (e.g. a 'connection' scope ref) -- the cache layer treats
	// that as "no freshness watermark to check" and skips the check.
	const currentLastIndexedAt = await resolveRepoLastIndexedAt(inferScopePath(inputs));

	// (4) Cache lookup.
	const cached = readBundle(runId, cacheKey, opts, currentLastIndexedAt);
	if (cached !== null) {
		log.debug(
			{ runId, mode: invocationMode, shaperId, file: cacheFilePathFor(runId, cacheKey) },
			'shaper cache hit',
		);
		return cached;
	}

	// (4.5) Pre-LLM invariant: code-shaper at run-mode against an
	// unindexed scope is a useless invocation (graph queries return
	// empty, dep-closure analysis is impossible) -- abort before
	// paying the Ollama cost. Only the code shaper depends on the
	// indexed graph; data + infra + classification + generic produce
	// reasonable bundles via the filesystem + DB-driver fallbacks
	// even without graph state, so we skip the invariant for them.
	// classification + task modes skip this check too -- by the time
	// a task fires, the run-mode invocation has already validated
	// the closure.
	if (invocationMode === 'run' && shaperId === 'code') {
		await ensureNonEmptyClosure((inputs as RunShapeInput).intent);
	}

	// (4.6) Exploration-based context build (plans/exploration-based-
	// context-build.md Phase 1). If the intent qualifies (V1: code
	// target + run mode + focused intent), run the new pipeline:
	// decompose -> execute explorations -> synthesize bundle. On
	// success, skip the legacy tool loop entirely + jump to meta
	// stamping. On failure (decomposer LLM down, unsupported
	// answer-type, exploration-only fallback disabled), fall through
	// to the legacy tool loop below -- no regression risk.
	const explorationBundle = await tryExplorationPipeline({
		invocationMode,
		shaperId,
		inputs,
		runId,
	});
	if (explorationBundle !== null) {
		const bundle: AnalyzeContextBundle = {
			...explorationBundle.raw,
			meta: {
				mode:          invocationMode,
				shaper:        shaperId,
				toolCalls:     explorationBundle.explorationCount,
				modelId:       cfg.shaperModel,
				emptyLayers:   deriveEmptyLayers(explorationBundle.raw),
				schemaVersion: SCHEMA_VERSION,
				...(currentLastIndexedAt !== undefined ? { repoLastIndexedAt: currentLastIndexedAt } : {}),
			},
		};
		const v = validateBundleWithErrors(bundle);
		if (!v.ok) {
			log.warn(
				{ runId, errors: v.errors },
				'exploration-based bundle failed validation; falling through to legacy shaper',
			);
			// Fall through to legacy path below.
		} else {
			writeBundle(runId, cacheKey, bundle);
			log.info(
				{
					runId,
					mode:              invocationMode,
					shaperId,
					pipeline:          'exploration',
					explorationCount:  explorationBundle.explorationCount,
				},
				'shaper invocation complete (exploration pipeline)',
			);
			return bundle;
		}
	}

	// (4.7) Retire the legacy tool loop from the shaper's happy path
	// for run mode (plans/exploration-based-context-build.md Phase 6).
	// The exploration pipeline emits a `freeform.probe` fallback plan
	// for any run-mode intent that no deterministic recipe covered,
	// which reuses the same tool-loop primitive `runShaperToolLoop`
	// exposes -- so a run-mode null here means the pipeline itself
	// short-circuited (decomposer LLM down, synthesizer LLM down).
	// Falling through to re-run the same LLM tool loop would only
	// fail again with a less-specific error. Surface the honest
	// LLM-unavailable state instead.
	if (invocationMode === 'run') {
		throw new ShaperLlmUnavailableError(
			`Run-mode exploration pipeline returned no bundle. ` +
			`See prior log lines for the specific failure (decomposer / ` +
			`synthesizer / freeform.probe tool loop).`,
		);
	}

	// (4) Build the LLM message list. Classification + task modes
	// still run the legacy tool loop here -- those flows are out of
	// scope for Phase 6.
	const messages = buildMessages(promptContent, inputs, invocationMode, shaperId);

	// (5) Resolve provider + tool deps.
	const provider = args.provider ?? buildProvider(cfg.shaperModel, cfg.shaper.ollamaNumCtx);
	const toolDeps = buildToolDeps({
		runId,
		shaperId,
		invocationMode,
		inputs,
		provider,
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
	writeBundle(runId, cacheKey, bundle);
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
	h.update(stableStringify(inputs));
	return h.digest('hex');
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
	readonly runId:          string;
	readonly shaperId:       ShaperId;
	readonly invocationMode: ShaperMode;
	readonly inputs:         RunShaperArgs['inputs'];
	readonly promptPath:     string;
	readonly provider?:      LLMProvider;
	readonly onTrace?:       (event: ShaperTraceEvent) => void;
}

/**
 * plans/exploration-based-context-build.md Phase 6. Run the target's
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
	const cfg = loadAnalyzeConfig();
	const promptContent = loadPromptFile(args.promptPath);
	const messages = buildMessages(promptContent, args.inputs, args.invocationMode, args.shaperId);
	const provider = args.provider ?? buildProvider(cfg.shaperModel, cfg.shaper.ollamaNumCtx);
	const toolDeps = buildToolDeps({
		runId:          args.runId,
		shaperId:       args.shaperId,
		invocationMode: args.invocationMode,
		inputs:         args.inputs,
		provider,
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
	);
	return { rawBundle, toolCallCount };
}

interface ToolLoopResult {
	readonly messages:      LLMMessage[];
	readonly toolCallCount: number;
}

async function runToolLoop(
	provider:     LLMProvider,
	messages:     LLMMessage[],
	deps:         ToolDeps,
	maxToolTurns: number,
	onTrace?:     ((event: ShaperTraceEvent) => void) | undefined,
): Promise<ToolLoopResult> {
	let toolCallCount = 0;
	const tools = getReadOnlyTools();
	const convo: LLMMessage[] = [...messages];

	for (let turn = 0; turn < maxToolTurns; turn++) {
		let response: LLMResponse;
		try {
			// disableThinking: true is critical for the qwen3.6 family --
			// without `think: false` on the Ollama wire body the model
			// emits empty bodies (memory: qwen3_6_needs_think_false). The
			// provider also auto-fires this when tools are present, but
			// passing it explicitly costs nothing and protects against a
			// future provider refactor.
			response = await provider.complete(convo, {
				tools,
				toolChoice:      'auto',
				disableThinking: true,
			});
		} catch (err) {
			throw classifyOllamaError(err);
		}

		const toolCalls = response.toolCalls ?? [];

		if (response.stopReason !== 'tool_use' || toolCalls.length === 0) {
			// Model is done with the tool-loop. Append its final assistant
			// text (if any) and break.
			if (response.text.length > 0) {
				convo.push({ role: 'assistant', content: response.text });
			}
			return { messages: convo, toolCallCount };
		}

		// Append the assistant's tool_use turn verbatim so the next round
		// sees its prior decisions in conversation history.
		const assistantBlocks: ContentBlock[] = [];
		if (response.text.length > 0) {
			assistantBlocks.push({ type: 'text', text: response.text });
		}
		for (const call of toolCalls) {
			assistantBlocks.push({
				type:  'tool_use',
				id:    call.id,
				name:  call.name,
				input: call.input,
			});
		}
		convo.push({ role: 'assistant', content: assistantBlocks });

		// Execute every tool call sequentially -- the project's
		// no-parallel-LLM-calls rule applies to provider calls; tool
		// execution is not LLM but we keep it serial for simplicity and
		// determinism (matches the existing executor's contract). Each
		// call fires a paired trace event (call + response) so the UI's
		// LiveStepsWidget can grow a sub-row per tool interaction --
		// otherwise a 6+ minute tool loop looks like a single silent
		// stage row to the user (ISSUES.md I-002).
		const resultBlocks: ContentBlock[] = [];
		for (const call of toolCalls) {
			toolCallCount += 1;
			if (onTrace !== undefined) {
				onTrace({
					type:         'tool-call',
					tool:         call.name,
					argsPreview:  previewToolArgs(call.input),
				});
			}
			const result = await executeTool(call.name, call.input, deps);
			if (onTrace !== undefined) {
				onTrace({
					type:         'tool-response',
					tool:         call.name,
					ok:           result.success !== false,
					notePreview:  previewToolOutput(result.output),
				});
			}
			resultBlocks.push({
				type:         'tool_result',
				tool_use_id:  call.id,
				content:      result.output,
				isError:      result.success === false,
			});
		}
		convo.push({ role: 'user', content: resultBlocks });
	}

	throw new ShaperToolLoopExhausted(maxToolTurns);
}

async function runFinalStructuredEmit(
	provider:                LLMProvider,
	messages:                LLMMessage[],
	structuredOutputRetries: number,
	maxOutputTokens:         number,
	onTrace?:                ((event: ShaperTraceEvent) => void) | undefined,
): Promise<AnalyzeContextBundle> {
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
	const finalMessages: LLMMessage[] = [
		...messages,
		{
			role:    'user',
			content:
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
				'Respond with ONLY the JSON object -- no prose, no fenced block.',
		},
	];

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
		const raw = await provider.completeStructured<AnalyzeContextBundle>(
			finalMessages,
			ANALYZE_CONTEXT_BUNDLE_SCHEMA as Record<string, unknown>,
			{
				maxAttempts:     structuredOutputRetries,
				// Critical for qwen3.6 -- without `think: false` the model
				// emits empty bodies (memory: qwen3_6_needs_think_false).
				// Harmless on other model families (the provider's wire
				// layer applies it conditionally).
				disableThinking: true,
				// Output-token budget. The shaper bundle has 7 fields each
				// of which can carry multi-section markdown; 8K is too
				// small for code-target M/L/XL scopes (truncates as
				// "Unterminated string in JSON"). Configured via
				// analyze.shaper.ollamaNumPredict (default 20480).
				maxTokens:       maxOutputTokens,
				...(onStreamToken !== undefined ? { onToken: onStreamToken } : {}),
			},
		);
		return raw;
	} catch (err) {
		const errClass = classifyOllamaError(err);
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

function classifyOllamaError(err: unknown): Error {
	if (!(err instanceof Error)) {
		return new Error(String(err));
	}
	const msg = err.message;
	// By the time an error reaches the driver, the provider's transient-
	// retry budget is gone -- so ANY connection-level error here means
	// Ollama is effectively unavailable to us, not "might recover next
	// turn". The provider wraps clean ECONNREFUSED / 404 into the
	// human-readable "Ollama is not running" / "Model not found"; raw
	// network errors (fetch failed, ECONNRESET, socket hang up) also
	// indicate the daemon is unreachable after retries.
	const unavailablePatterns = [
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
	for (const pat of unavailablePatterns) {
		if (msg.includes(pat)) {
			return new ShaperLlmUnavailableError(msg);
		}
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
 * scope-picker, planner, summariser, adherence, aggregator) --
 * everything reachable via `buildShaperProvider(cfg)`. Tool-loop
 * callers stay on Ollama regardless of shaperProvider.
 */
function buildProvider(modelId: string, numCtx: number): LLMProvider {
	const local = loadLocalProviderConfig();
	return new OllamaProvider(modelId, local.host, numCtx);
}

interface BuildToolDepsArgs {
	readonly runId:          string;
	readonly shaperId:       ShaperId;
	readonly invocationMode: ShaperMode;
	readonly inputs:         RunShaperArgs['inputs'];
	readonly provider:       LLMProvider;
}

function buildToolDeps(args: BuildToolDepsArgs): ToolDeps {
	const sessionId = `analyze-shaper-${args.runId}-${args.invocationMode}-${args.shaperId}`;
	const repoPath = inferRepoPath(args.inputs);
	return {
		sessionId,
		repoPath,
		// V1 shaper closure = the scope's containing repo only.
		// plans/docs-module.md Section 6.3 pins the docs retriever to
		// this policy; graph_search + docs_* tools use this to bound
		// their queries. A future revision may widen to the transitive
		// DEPENDS_ON closure, but doing so at the shaper boundary is
		// out of scope for the docs module.
		closureRepos:   [repoPath],
		send:           () => { /* shaper does not stream */ },
		requestId:      0,
		ollamaProvider: args.provider,
	};
}

function inferRepoPath(inputs: RunShaperArgs['inputs']): string {
	// Order: ClassificationShapeInput carries scopeRef directly;
	// RunShapeInput + TaskShapeInput nest it under intent.
	if ('scopeRef' in inputs) {
		return resolveRepoPath((inputs as ClassificationShapeInput).scopeRef);
	}
	if ('intent' in inputs) {
		return resolveRepoPath((inputs as RunShapeInput | TaskShapeInput).intent.scopeRef);
	}
	return process.cwd();
}

/**
 * Map a scopeRef onto the directory that should be used as the tool
 * deps' repoPath:
 *   - repo / workspace / manifest-dir / module: value is already a
 *     directory; use as-is.
 *   - file / symbol: value points at a file or symbol-in-file; walk
 *     up to the containing directory so tool-deps repoPath is a real
 *     directory. (search_glob, file_read with relative paths, the
 *     data-driver pool's repo-root check all assume a directory.)
 *   - connection: no filesystem path; fall back to cwd. Connection-
 *     scope tests should NOT rely on this path -- the driver routes
 *     data tools via the connection id, not repoPath.
 */
function resolveRepoPath(ref: { kind: string; value: string }): string {
	switch (ref.kind) {
		case 'file':
		case 'symbol': {
			// Walk up to the containing dir. If value already lacks a
			// trailing file segment (e.g. caller passed a dir by
			// mistake), dirname returns the dir itself; harmless.
			const dir = dirname(ref.value);
			return dir === '' || dir === '.' ? process.cwd() : dir;
		}
		case 'connection':
			return process.cwd();
		default:
			return ref.value;
	}
}

/**
 * For freshness checking, we want the filesystem path that should be
 * matched against the registry. Differs from inferRepoPath only on
 * 'connection' kind: there we return an empty string to signal "no
 * registered repo to check" rather than substituting cwd (which would
 * accidentally pick up any registered repo containing the process's
 * working directory).
 */
function inferScopePath(inputs: RunShaperArgs['inputs']): string {
	if ('scopeRef' in inputs) {
		return (inputs as ClassificationShapeInput).scopeRef.value;
	}
	if ('intent' in inputs) {
		const intent = (inputs as RunShapeInput | TaskShapeInput).intent;
		if (intent.scopeRef.kind === 'connection') return '';
		return intent.scopeRef.value;
	}
	return '';
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
// Exploration-based pipeline (plans/exploration-based-context-build.md)
// ---------------------------------------------------------------------------

interface ExplorationPipelineResult {
	readonly raw:              Omit<AnalyzeContextBundle, 'meta'>;
	readonly explorationCount: number;
}

/**
 * Try the exploration-based pipeline. Returns the composed bundle
 * (minus meta) on success. Returns null when the pipeline should
 * be skipped -- either the intent doesn't qualify for V1 (only
 * run-mode + code target + focused=true) OR the decomposer /
 * synthesizer LLM was unavailable / their prompts are missing.
 *
 * On null return, the caller falls through to the legacy shaper
 * tool loop. On non-null return, the caller uses the bundle
 * directly + skips the tool loop entirely.
 *
 * V1 qualification (plans/exploration-based-context-build.md
 * Section 8 Phase 1):
 *   - invocationMode === 'run'
 *   - shaperId === 'code'
 *   - inputs.intent.focused === true
 *   - inputs.intent.scopeRef.value must be a directory path
 *     (not a connection / manifest-dir / etc.)
 *
 * Later phases relax this: Phase 3 adds adherence-check for code,
 * Phase 5 adds data + infra, etc.
 */
async function tryExplorationPipeline(args: {
	invocationMode: ShaperMode;
	shaperId:       ShaperId;
	inputs:         RunShaperArgs['inputs'];
	runId:          string;
}): Promise<ExplorationPipelineResult | null> {
	if (args.invocationMode !== 'run') return null;
	// Every run-mode shaper flows through the exploration pipeline
	// (plans/exploration-based-context-build.md Phase 6). Recipe-less
	// shapers (generic) or recipe-less intents land in the
	// freeform.probe fallback below rather than dropping to the
	// retired legacy tool-loop tail.
	if (args.shaperId       !== 'code'
	 && args.shaperId       !== 'docs'
	 && args.shaperId       !== 'data'
	 && args.shaperId       !== 'infra'
	 && args.shaperId       !== 'generic') return null;
	if (!('intent' in args.inputs))     return null;
	const intent = (args.inputs as RunShapeInput).intent;
	if (intent.focused !== true) return null;

	// V1..V5 requires a directory-shaped scope so concept.resolve /
	// doc retrieval / manifests walk / pool acquisition all have a
	// repo path. `repo | module | file | workspace` all resolve to
	// a filesystem path.
	const scopeKind = intent.scopeRef.kind;
	if (scopeKind !== 'repo' && scopeKind !== 'module' && scopeKind !== 'workspace') {
		return null;
	}

	// (a) Decompose. LLM unavailable / prompt missing -> fall through
	// (there is no LLM to run anyway). Schema-unrecoverable OR an
	// out-of-recipe answer type gets converted into a
	// `freeform.probe`-only fallback plan so the target's legacy tool
	// loop still answers the intent (plans/exploration-based-context-
	// build.md Phase 6 escape hatch).
	let plan: ExplorationPlan;
	let usedFallback = false;
	try {
		plan = await decompose({ intent, runId: args.runId });
	} catch (err) {
		if (err instanceof DecomposerLlmUnavailableError
		 || err instanceof DecomposerPromptMissingError) {
			log.info(
				{ runId: args.runId, err: (err as Error).message },
				'exploration pipeline: decomposer unavailable; falling through',
			);
			return null;
		}
		log.warn(
			{ runId: args.runId, err: (err as Error).message },
			'exploration pipeline: decomposer failed; using freeform.probe fallback',
		);
		plan = fallbackFreeformPlan(intent, args.shaperId);
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
		plan = fallbackFreeformPlan(intent, args.shaperId);
		usedFallback = true;
	}

	// (b) Execute the plan.
	const repoPath = resolveRepoPath(intent.scopeRef);
	const lastIndexedMs = await resolveRepoLastIndexedAt(inferScopePath(args.inputs));
	const lastIndexedBigInt = BigInt(lastIndexedMs ?? 0);
	const executed = await executePlan({
		runId:            args.runId,
		repoPath,
		closureRepos:     [repoPath],
		repoLastIndexedAtMs: lastIndexedBigInt,
		plan,
	});

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
			raw:              freeformOnly.rawBundle,
			explorationCount: freeformOnly.toolCallCount,
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
		const raw = await synthesize({
			runId:    args.runId,
			intent,
			executed,
			target:   synthesizeTarget,
		});
		return {
			raw,
			explorationCount: executed.results.length,
		};
	} catch (err) {
		if (err instanceof SynthesizerLlmUnavailableError
		 || err instanceof SynthesizerPromptMissingError) {
			log.info(
				{ runId: args.runId, err: (err as Error).message },
				'exploration pipeline: synthesizer unavailable; falling through',
			);
			return null;
		}
		log.warn(
			{ runId: args.runId, err: (err as Error).message },
			'exploration pipeline: synthesizer failed; falling through',
		);
		return null;
	}
}

/**
 * Emit a freeform.probe-only plan for intents that don't map to any
 * deterministic recipe (plans/exploration-based-context-build.md
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
					`legacy tool loop: ${intent.focus ?? intent.reasoning}`,
				params: {
					purpose:  intent.focus ?? intent.reasoning,
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
export const _classifyOllamaErrorForTest = classifyOllamaError;
export const _deriveEmptyLayersForTest = deriveEmptyLayers;
export const _resolveRepoLastIndexedAtForTest = resolveRepoLastIndexedAt;
export const _inferScopePathForTest = inferScopePath;
export const _renderUpstreamSectionForTest = renderUpstreamSection;
export const _fallbackFreeformPlanForTest = fallbackFreeformPlan;
export const _extractSoleFreeformResultForTest = extractSoleFreeformResult;
