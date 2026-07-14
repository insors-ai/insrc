/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Exploration executor.
 *
 * plans/exploration-based-context-build.md Section 3. Takes an
 * `ExplorationPlan`, runs each exploration in order via the
 * type-registered runner, and returns an `ExecutedPlan` with typed
 * outputs.
 *
 * Deterministic explorations get cached via
 * db/exploration-cache.ts. Non-cacheable types (unsupported /
 * failed / freeform.probe) skip the cache. Cache misses run the
 * runner + write the output; cache hits skip the runner.
 *
 * `dependsOn` is enforced structurally: a later exploration reads
 * the outputs of its declared dependencies via
 * `ExplorationRunnerContext.readDep`. The executor guarantees
 * that dependencies are executed BEFORE their dependents by
 * respecting the plan's declared order (the decomposer's
 * responsibility to emit a valid topological ordering).
 */

import { getCachedExploration, putCachedExploration } from '../../db/exploration-cache.js';
import { getLogger } from '../../shared/logger.js';
import type { StructuredSchema } from '../../shared/types.js';
import { createRepoIgnoreFilter } from '../context/repo-ignore-filter.js';

import {
	prepareCapabilityReuseCheck,
	finalizeCapabilityReuseCheck,
	runCapabilityReuseCheck,
} from './capability-reuse-check.js';
import { runClassHierarchy } from './class-hierarchy.js';
import { runConceptResolve } from './concept-resolve.js';
import { runConfigTrace } from './config-trace.js';
import { runConventionDetect } from './convention-detect.js';
import { runDataModelTrace } from './data-model-trace.js';
import { runDbConnectionsList } from './db-connections-list.js';
import { runDbTableDescribe } from './db-table-describe.js';
import { runDbTablesList } from './db-tables-list.js';
import {
	prepareDocConstraintEnumerate,
	finalizeDocConstraintEnumerate,
	runDocConstraintEnumerate,
} from './doc-constraint-enumerate.js';
import {
	prepareDocDecisionTrace,
	finalizeDocDecisionTrace,
	runDocDecisionTrace,
} from './doc-decision-trace.js';
import { runDocMention } from './doc-mention.js';
import { runFreeformProbe } from './freeform-probe.js';
import { runImportGraph } from './import-graph.js';
import { runManifestsLocate } from './manifests-locate.js';
import { runModuleProfile } from './module-profile.js';
import { runSearchText } from './search-text.js';
import { runSymbolLocate } from './symbol-locate.js';
import { runTestLocate } from './test-locate.js';
import { runUsageExample } from './usage-example.js';
import { getDb } from '../../db/client.js';
import type {
	ExecutedExploration,
	ExecutedPlan,
	Exploration,
	ExplorationOutput,
	ExplorationPlan,
	ExplorationRunner,
	ExplorationRunnerContext,
	ExplorationType,
} from './types.js';

const log = getLogger('analyze:explore:executor');

// ---------------------------------------------------------------------------
// Runner registry
// ---------------------------------------------------------------------------

/** Which exploration types the V1 executor knows how to run. Types
 *  not in this map produce an `unsupported` output that the
 *  synthesizer renders as a diagnostic. */
const RUNNERS: Partial<Record<ExplorationType, ExplorationRunner>> = {
	'concept.resolve':          runConceptResolve,
	'module.profile':           runModuleProfile,
	'symbol.locate':            runSymbolLocate,
	'import.graph':             runImportGraph,
	'doc.mention':              runDocMention,
	'doc.decision.trace':       runDocDecisionTrace,
	'doc.constraint.enumerate': runDocConstraintEnumerate,
	'usage.example':            runUsageExample,
	'class.hierarchy':          runClassHierarchy,
	'capability.reuse-check':   runCapabilityReuseCheck,
	'search.text':              runSearchText,
	'convention.detect':        runConventionDetect,
	'config.trace':             runConfigTrace,
	'test.locate':              runTestLocate,
	'data-model.trace':         runDataModelTrace,
	'db.connections.list':      runDbConnectionsList,
	'db.tables.list':           runDbTablesList,
	'db.table.describe':        runDbTableDescribe,
	'manifests.locate':         runManifestsLocate,
	'freeform.probe':           runFreeformProbe,
};

/** Types that should skip the cache. `unsupported` + `failed`
 *  are never cached (would be sticky wrong); `freeform.probe`
 *  reads from a live tool loop so is never deterministic. */
const NON_CACHEABLE: ReadonlySet<ExplorationType> = new Set([
	'freeform.probe',
]);

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

export interface ExecutePlanArgs {
	readonly runId:            string;
	readonly repoPath:         string;
	readonly closureRepos:     readonly string[];
	/** Milliseconds since epoch when the repo was last indexed.
	 *  Used as part of the cache key so a re-index invalidates
	 *  every cached exploration for the repo. */
	readonly repoLastIndexedAtMs: bigint;
	readonly plan:             ExplorationPlan;
}

export async function executePlan(args: ExecutePlanArgs): Promise<ExecutedPlan> {
	const start = Date.now();
	const results: ExecutedExploration[] = [];
	const outputsById = new Map<string, ExplorationOutput>();
	let totalCached = 0;

	// One filter per plan execution. Shared across every runner via
	// ExplorationRunnerContext so a single subprocess call to `git
	// ls-files` powers .gitignore-aware directory filtering across
	// the whole plan.
	const ignoreFilter = createRepoIgnoreFilter(args.repoPath);

	for (const originalExp of args.plan.explorations) {
		const runnerStart = Date.now();

		// Substitute placeholders like `$e1.hits[0].path` in params
		// against prior outputs BEFORE dispatch. Placeholders that
		// resolve to `undefined` (missing dep, bad accessor) or to
		// empty arrays (dependent output legitimately empty -- e.g.
		// a module.profile with no exports) return an
		// `unmetPrerequisites` marker so the executor skips the
		// runner cleanly instead of letting it throw a generic
		// "required" error. That keeps the Diagnostics section
		// readable: "prerequisite empty" vs "runtime failure".
		const { exp, unmetPrerequisites } = substitutePlaceholders(originalExp, outputsById);

		let output: ExplorationOutput = {
			type: 'failed',
			requested: exp.type,
			errorCode: 'not-executed',
			message: 'exploration was not executed (executor bug)',
		};
		let cached = false;

		const runner = RUNNERS[exp.type];
		if (runner === undefined) {
			output = {
				type: 'unsupported',
				requested: exp.type,
				reason: `V1 executor does not implement exploration type '${exp.type}'`,
			};
		} else if (unmetPrerequisites.length > 0) {
			// A placeholder resolved to nothing / to an empty array. The
			// decomposer emits many recipes with optional steps ("only
			// when profile.exports is non-empty") whose skip signal is
			// exactly this. Do NOT invoke the runner -- it would throw
			// a generic "required" error that the caller reads as a
			// framework bug rather than a designed skip.
			output = {
				type: 'failed',
				requested: exp.type,
				errorCode: 'prerequisite-empty',
				message:
					`skipped: placeholder(s) [${unmetPrerequisites.join(', ')}] ` +
					`resolved to empty/undefined against prior outputs. ` +
					`The dependent exploration produced no data for these accessors.`,
			};
		} else {
			const cacheable = !NON_CACHEABLE.has(exp.type);
			if (cacheable) {
				const hit = await getCachedExploration(
					args.repoPath, args.repoLastIndexedAtMs, exp,
				);
				if (hit !== null) {
					output = hit;
					cached = true;
					totalCached += 1;
				}
			}
			if (!cached) {
				try {
					const ctx: ExplorationRunnerContext = {
						runId:        args.runId,
						repoPath:     args.repoPath,
						closureRepos: args.closureRepos,
						readDep:      (id: string) => outputsById.get(id),
						ignoreFilter,
					};
					output = await runner(exp, ctx);
					if (cacheable) {
						await putCachedExploration(
							args.repoPath, args.repoLastIndexedAtMs, exp, output,
						);
					}
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err);
					log.warn(
						{ runId: args.runId, explorationId: exp.id, type: exp.type, err: msg },
						'exploration failed',
					);
					output = {
						type:      'failed',
						requested: exp.type,
						errorCode: classifyExplorationError(err),
						message:   msg,
					};
				}
			}
		}

		const elapsedMs = Date.now() - runnerStart;
		outputsById.set(exp.id, output);
		results.push({ exploration: exp, output, cached, elapsedMs });
	}

	const totalMs = Date.now() - start;
	log.info(
		{
			runId:       args.runId,
			answerType:  args.plan.answerType,
			total:       results.length,
			cached:      totalCached,
			failed:      results.filter(r => r.output.type === 'failed').length,
			unsupported: results.filter(r => r.output.type === 'unsupported').length,
			totalMs,
		},
		'plan executed',
	);

	return {
		plan:        args.plan,
		results,
		totalMs,
		totalCached,
	};
}

// ---------------------------------------------------------------------------
// Multi-turn step function (used by the `insrc_analyze_step` MCP tool
// so narrow-LLM explorations pause out to the OUTER client's LLM
// instead of firing daemon-side).
//
// Design shape:
//   - `stepPlan` walks the plan in declared order (same as
//     executePlan). Deterministic explorations run inline through the
//     same RUNNERS registry + cache logic.
//   - For a narrow-LLM exploration, we invoke the runner's
//     `prepare(exp, ctx)` split. If prepare short-circuits, use the
//     short-circuit output. Otherwise return { kind: 'pending', ... }
//     with the prompt + schema the outer client's LLM should emit.
//   - The multi-turn phase handler serialises the resulting state and
//     hands prompt+schema to the outer client. On the next call it
//     invokes `finalizeNarrow` with the raw LLM output + the prepared
//     blob to produce the final ExplorationOutput, then re-enters
//     stepPlan with the resume state to continue.
// ---------------------------------------------------------------------------

/** Which exploration types call an LLM internally (would pause out to
 *  the outer client in multi-turn mode). Kept as a separate set so
 *  `stepPlan` can detect them without an instanceof branch. */
export const NARROW_LLM_TYPES: ReadonlySet<ExplorationType> = new Set([
	'doc.decision.trace',
	'doc.constraint.enumerate',
	'capability.reuse-check',
]);

/** Uniform shape a narrow runner's prepare() returns. Mirrors each
 *  runner's local `*PrepareResult` union but erases the specific
 *  prepared-blob type so the executor can carry it opaquely. */
export type NarrowPrepareResult =
	| { readonly kind: 'short-circuit'; readonly shortCircuit: ExplorationOutput }
	| {
		readonly kind:         'narrow-llm';
		readonly systemPrompt: string;
		readonly userTurn:     string;
		readonly schema:       StructuredSchema;
		readonly prepared:     unknown;   // opaque; runner-specific
	  };

interface NarrowRunnerEntry {
	readonly prepare:  (exp: Exploration, ctx: ExplorationRunnerContext) => Promise<NarrowPrepareResult>;
	readonly finalize: (prepared: unknown, raw: unknown, runId?: string) => ExplorationOutput;
}

/** Registry of the three narrow-LLM runners' prepare/finalize splits.
 *  Order-agnostic: keyed by exploration type. */
const NARROW_RUNNERS: Partial<Record<ExplorationType, NarrowRunnerEntry>> = {
	'doc.decision.trace': {
		async prepare(exp, ctx) {
			const params = exp.params as Record<string, unknown>;
			const topic = typeof params['topic'] === 'string' ? params['topic'] : '';
			return prepareDocDecisionTrace({
				topic,
				repoPath:  ctx.repoPath,
				db:        await getDb(),
				...(typeof params['maxSources'] === 'number' ? { maxSources: params['maxSources'] as number } : {}),
				...(ctx.runId !== undefined ? { runId: ctx.runId } : {}),
				logContext: 'exploration',
			});
		},
		finalize(prepared, raw, runId) {
			return finalizeDocDecisionTrace(
				prepared as Parameters<typeof finalizeDocDecisionTrace>[0],
				raw      as Parameters<typeof finalizeDocDecisionTrace>[1],
				runId,
				'exploration',
			);
		},
	},
	'doc.constraint.enumerate': {
		async prepare(exp, ctx) {
			const params = exp.params as Record<string, unknown>;
			const subject = typeof params['subject'] === 'string' ? params['subject'] : '';
			return prepareDocConstraintEnumerate({
				subject,
				repoPath:  ctx.repoPath,
				db:        await getDb(),
				...(typeof params['maxSources'] === 'number' ? { maxSources: params['maxSources'] as number } : {}),
				...(ctx.runId !== undefined ? { runId: ctx.runId } : {}),
				logContext: 'exploration',
			});
		},
		finalize(prepared, raw, runId) {
			return finalizeDocConstraintEnumerate(
				prepared as Parameters<typeof finalizeDocConstraintEnumerate>[0],
				raw      as Parameters<typeof finalizeDocConstraintEnumerate>[1],
				runId,
				'exploration',
			);
		},
	},
	'capability.reuse-check': {
		async prepare(exp, ctx) {
			return prepareCapabilityReuseCheck(exp, ctx);
		},
		finalize(prepared, raw, runId) {
			// Prepare uses no llmSkipReason because the outer LLM is the
			// only source. If raw is absent, tag it as "outer LLM
			// returned nothing" so the finalize can emit the placeholder.
			const skip = raw === null || raw === undefined ? 'outer LLM returned no verdict payload' : undefined;
			return finalizeCapabilityReuseCheck(
				prepared as Parameters<typeof finalizeCapabilityReuseCheck>[0],
				raw as Parameters<typeof finalizeCapabilityReuseCheck>[1],
				skip,
				runId,
			);
		},
	},
};

/** Structured public view of the narrow runners so the multi-turn
 *  handler can look up prepare/finalize without importing every
 *  runner file individually. */
export function getNarrowRunner(type: ExplorationType): NarrowRunnerEntry | undefined {
	return NARROW_RUNNERS[type];
}

/** Resume state carried across turns of the multi-turn loop. Held in
 *  the encoded state blob between MCP calls. */
export interface StepPlanResumeState {
	/** Prior deterministic + short-circuit results, in declared order. */
	readonly results: readonly ExecutedExploration[];
	/** outputsById flattened to an array so it's JSON-safe. */
	readonly outputs: ReadonlyArray<{ readonly id: string; readonly output: ExplorationOutput }>;
	readonly totalCached: number;
	readonly totalMsSoFar: number;
}

/** Continuation shape for a stepPlan pause -- carries every field the
 *  multi-turn phase handler needs to (a) emit an emit_narrow response
 *  and (b) resume on the next call. */
export interface StepPlanPending {
	readonly kind:            'pending';
	readonly explorationId:   string;
	readonly explorationType: ExplorationType;
	readonly systemPrompt:    string;
	readonly userTurn:        string;
	readonly schema:          StructuredSchema;
	readonly preparedBlob:    unknown;
	/** Everything below is what the next stepPlan call needs to resume
	 *  from AFTER the outer client returns the narrow LLM output. */
	readonly resumeState:     StepPlanResumeState;
	readonly elapsedForPause: number;
}

export interface StepPlanDone {
	readonly kind:     'done';
	readonly executed: ExecutedPlan;
}

export type StepPlanResult = StepPlanPending | StepPlanDone;

/**
 * Multi-turn analogue of `executePlan`. Runs the plan up to the first
 * narrow-LLM exploration that would need the outer client's LLM,
 * pauses there, and returns the prompt + schema for the client to
 * satisfy. Deterministic explorations are executed identically to
 * executePlan (same runner, same cache).
 *
 * `resumeState` (optional) carries prior-turn results. When provided,
 * stepPlan seeds outputsById + results from it and continues from the
 * next unprocessed exploration.
 */
export async function stepPlan(
	args: ExecutePlanArgs & {
		readonly resumeState?: StepPlanResumeState;
	},
): Promise<StepPlanResult> {
	const runStart = Date.now();
	const outputsById = new Map<string, ExplorationOutput>();
	const results: ExecutedExploration[] = [];
	let totalCached = 0;
	let priorMs = 0;

	if (args.resumeState !== undefined) {
		for (const { id, output } of args.resumeState.outputs) {
			outputsById.set(id, output);
		}
		for (const r of args.resumeState.results) results.push(r);
		totalCached = args.resumeState.totalCached;
		priorMs = args.resumeState.totalMsSoFar;
	}

	const ignoreFilter = createRepoIgnoreFilter(args.repoPath);

	for (const originalExp of args.plan.explorations) {
		// Skip explorations that already have an output from a prior
		// turn (resume path).
		if (outputsById.has(originalExp.id)) continue;

		const runnerStart = Date.now();
		const { exp, unmetPrerequisites } = substitutePlaceholders(originalExp, outputsById);

		let output: ExplorationOutput = {
			type: 'failed',
			requested: exp.type,
			errorCode: 'not-executed',
			message: 'exploration was not executed (executor bug)',
		};
		let cached = false;

		const runner = RUNNERS[exp.type];
		if (runner === undefined) {
			output = {
				type: 'unsupported',
				requested: exp.type,
				reason: `V1 executor does not implement exploration type '${exp.type}'`,
			};
		} else if (unmetPrerequisites.length > 0) {
			output = {
				type: 'failed',
				requested: exp.type,
				errorCode: 'prerequisite-empty',
				message:
					`skipped: placeholder(s) [${unmetPrerequisites.join(', ')}] ` +
					`resolved to empty/undefined against prior outputs. ` +
					`The dependent exploration produced no data for these accessors.`,
			};
		} else if (NARROW_LLM_TYPES.has(exp.type) && NARROW_RUNNERS[exp.type] !== undefined) {
			// Narrow-LLM exploration: try cache first (same key as
			// executePlan), else prepare + pause.
			const hit = await getCachedExploration(
				args.repoPath, args.repoLastIndexedAtMs, exp,
			);
			if (hit !== null) {
				output = hit;
				cached = true;
				totalCached += 1;
			} else {
				const narrow = NARROW_RUNNERS[exp.type]!;
				const ctx: ExplorationRunnerContext = {
					runId:        args.runId,
					repoPath:     args.repoPath,
					closureRepos: args.closureRepos,
					readDep:      (id: string) => outputsById.get(id),
					ignoreFilter,
				};
				const prep = await narrow.prepare(exp, ctx);
				if (prep.kind === 'short-circuit') {
					output = prep.shortCircuit;
					await putCachedExploration(
						args.repoPath, args.repoLastIndexedAtMs, exp, output,
					);
				} else {
					// PAUSE: return the prompt + schema, encode enough
					// resume state that the next call can pick up here.
					const elapsedForPause = Date.now() - runnerStart;
					return {
						kind:            'pending',
						explorationId:   exp.id,
						explorationType: exp.type,
						systemPrompt:    prep.systemPrompt,
						userTurn:        prep.userTurn,
						schema:          prep.schema,
						preparedBlob:    prep.prepared,
						resumeState: {
							results,
							outputs: [...outputsById.entries()].map(([id, out]) => ({ id, output: out })),
							totalCached,
							totalMsSoFar: priorMs + (Date.now() - runStart),
						},
						elapsedForPause,
					};
				}
			}
		} else {
			// Deterministic path -- identical to executePlan.
			const hit = await getCachedExploration(
				args.repoPath, args.repoLastIndexedAtMs, exp,
			);
			if (hit !== null) {
				output = hit;
				cached = true;
				totalCached += 1;
			} else {
				try {
					const ctx: ExplorationRunnerContext = {
						runId:        args.runId,
						repoPath:     args.repoPath,
						closureRepos: args.closureRepos,
						readDep:      (id: string) => outputsById.get(id),
						ignoreFilter,
					};
					output = await runner(exp, ctx);
					await putCachedExploration(
						args.repoPath, args.repoLastIndexedAtMs, exp, output,
					);
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err);
					log.warn(
						{ runId: args.runId, explorationId: exp.id, type: exp.type, err: msg },
						'multi-turn exploration failed',
					);
					output = {
						type:      'failed',
						requested: exp.type,
						errorCode: classifyExplorationError(err),
						message:   msg,
					};
				}
			}
		}

		const elapsedMs = Date.now() - runnerStart;
		outputsById.set(exp.id, output);
		results.push({ exploration: exp, output, cached, elapsedMs });
	}

	const totalMs = priorMs + (Date.now() - runStart);
	log.info(
		{
			runId:       args.runId,
			answerType:  args.plan.answerType,
			total:       results.length,
			cached:      totalCached,
			failed:      results.filter(r => r.output.type === 'failed').length,
			unsupported: results.filter(r => r.output.type === 'unsupported').length,
			totalMs,
		},
		'stepPlan: multi-turn plan executed',
	);

	return {
		kind: 'done',
		executed: {
			plan:        args.plan,
			results,
			totalMs,
			totalCached,
		},
	};
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function classifyExplorationError(err: unknown): string {
	if (!(err instanceof Error)) return 'unknown';
	const msg = err.message;
	if (msg.includes('ENOENT'))       return 'path-not-found';
	if (msg.includes('required'))     return 'invalid-params';
	if (msg.includes('cannot stat'))  return 'path-not-found';
	if (msg.includes('not registered')) return 'unregistered-repo';
	return 'runtime-error';
}

// ---------------------------------------------------------------------------
// Placeholder substitution
// ---------------------------------------------------------------------------

/**
 * Replace `$eN.<accessor>` placeholders in an exploration's params
 * with concrete values from prior explorations' outputs. The
 * decomposer emits placeholders as strings; the executor resolves
 * them here before dispatching to the runner.
 *
 * Accessor grammar:
 *   $e1.hits[0].path             -- pick index 0's `path` field
 *   $e1.hits[0..2].name          -- pick indices [0, 1, 2]'s `name` fields; returns an array
 *   $e2.profile.exports[0..2]    -- pick indices [0, 1, 2] from an array field
 *   $e1.hits                     -- return the whole `hits` array
 *
 * The substitution is applied recursively to string values in
 * params. String values NOT starting with `$e` are passed through
 * verbatim.
 *
 * Returns the substituted Exploration alongside an
 * `unmetPrerequisites` list. A prerequisite is "unmet" when a
 * placeholder resolved to `undefined` (missing dep / bad accessor)
 * OR to an empty array (dependent output was legitimately empty --
 * common when a recipe's optional step depends on `$eN.field[0..K]`
 * and the field is empty). The outer executor loop uses this list
 * to skip the runner cleanly instead of dispatching with garbage
 * params.
 */
interface SubstituteResult {
	readonly exp:                 Exploration;
	readonly unmetPrerequisites:  readonly string[];
}

function substitutePlaceholders(
	exp:            Exploration,
	outputsById:    ReadonlyMap<string, ExplorationOutput>,
): SubstituteResult {
	const unmet: string[] = [];
	const params = substituteValue(exp.params, outputsById, unmet) as Record<string, unknown>;
	// If nothing changed, keep the original object so cache hashing
	// stays stable.
	const finalExp = params === exp.params ? exp : { ...exp, params };
	return { exp: finalExp, unmetPrerequisites: unmet };
}

function substituteValue(
	value:       unknown,
	outputsById: ReadonlyMap<string, ExplorationOutput>,
	unmet:       string[],
): unknown {
	if (typeof value === 'string') {
		if (!value.startsWith('$e')) return value;
		const resolved = resolvePlaceholder(value, outputsById);
		if (resolved === undefined) {
			unmet.push(value);
			return resolved;
		}
		// An empty array signals a legitimate "the dependent output
		// carries no value for this accessor" -- treat it as an unmet
		// prerequisite so the outer loop skips the exploration cleanly.
		if (Array.isArray(resolved) && resolved.length === 0) {
			unmet.push(value);
		}
		return resolved;
	}
	if (Array.isArray(value)) {
		let mutated = false;
		const out: unknown[] = [];
		for (const item of value) {
			const sub = substituteValue(item, outputsById, unmet);
			if (sub !== item) mutated = true;
			out.push(sub);
		}
		return mutated ? out : value;
	}
	if (typeof value === 'object' && value !== null) {
		const obj = value as Record<string, unknown>;
		let mutated = false;
		const out: Record<string, unknown> = {};
		for (const k of Object.keys(obj)) {
			const sub = substituteValue(obj[k], outputsById, unmet);
			if (sub !== obj[k]) mutated = true;
			out[k] = sub;
		}
		return mutated ? out : value;
	}
	return value;
}

/**
 * Parse + resolve a single placeholder string against outputs.
 * Grammar (informal):
 *   $ID(.FIELD | [INT] | [INT..INT])+
 * where ID is a decomposer-emitted exploration id (`e1`, `e2`, ...)
 * and FIELD is a JS identifier. Ranges select multiple array
 * elements + return an array.
 *
 * Returns `undefined` on any resolution failure. The caller decides
 * how to render undefined (runner throws "required" -> failed
 * exploration; string param becomes undefined + runner surfaces
 * "required").
 */
function resolvePlaceholder(
	expr:        string,
	outputsById: ReadonlyMap<string, ExplorationOutput>,
): unknown {
	// Strip leading `$`. Split the head off before the first `.` or
	// `[` -- that's the exploration id.
	const raw = expr.startsWith('$') ? expr.slice(1) : expr;
	const idEnd = firstIndexOfAny(raw, ['.', '[']);
	const id = idEnd === -1 ? raw : raw.slice(0, idEnd);
	const rest = idEnd === -1 ? '' : raw.slice(idEnd);
	const dep = outputsById.get(id);
	if (dep === undefined) return undefined;

	// Tokenise `rest` into a sequence of accessor steps.
	const steps: AccessorStep[] = [];
	let i = 0;
	while (i < rest.length) {
		const ch = rest[i];
		if (ch === '.') {
			i += 1;
			const end = firstIndexOfAny(rest.slice(i), ['.', '[']);
			const field = end === -1 ? rest.slice(i) : rest.slice(i, i + end);
			if (field.length === 0) return undefined;
			steps.push({ kind: 'field', name: field });
			i = end === -1 ? rest.length : i + end;
		} else if (ch === '[') {
			const close = rest.indexOf(']', i);
			if (close === -1) return undefined;
			const inside = rest.slice(i + 1, close);
			if (inside.includes('..')) {
				const [aRaw, bRaw] = inside.split('..');
				const a = Number.parseInt(aRaw!, 10);
				const b = Number.parseInt(bRaw!, 10);
				if (Number.isNaN(a) || Number.isNaN(b) || b < a) return undefined;
				steps.push({ kind: 'range', from: a, to: b });
			} else {
				const idx = Number.parseInt(inside, 10);
				if (Number.isNaN(idx)) return undefined;
				steps.push({ kind: 'index', index: idx });
			}
			i = close + 1;
		} else {
			return undefined;
		}
	}

	let cur: unknown = dep;
	for (const step of steps) {
		if (cur === null || cur === undefined) return undefined;
		if (step.kind === 'field') {
			if (typeof cur !== 'object' || Array.isArray(cur)) return undefined;
			cur = (cur as Record<string, unknown>)[step.name];
		} else if (step.kind === 'index') {
			if (!Array.isArray(cur)) return undefined;
			cur = cur[step.index];
		} else {
			if (!Array.isArray(cur)) return undefined;
			const slice: unknown[] = [];
			for (let j = step.from; j <= step.to; j++) {
				if (j < 0 || j >= cur.length) continue;
				slice.push(cur[j]);
			}
			cur = slice;
		}
	}
	return cur;
}

interface FieldStep  { kind: 'field'; name: string }
interface IndexStep  { kind: 'index'; index: number }
interface RangeStep  { kind: 'range'; from: number; to: number }
type AccessorStep = FieldStep | IndexStep | RangeStep;

function firstIndexOfAny(s: string, needles: readonly string[]): number {
	let best = -1;
	for (const n of needles) {
		const idx = s.indexOf(n);
		if (idx === -1) continue;
		if (best === -1 || idx < best) best = idx;
	}
	return best;
}

// ---------------------------------------------------------------------------
// Test hooks -- allows in-test overriding of the runner registry
// ---------------------------------------------------------------------------

export function _overrideRunnerForTest(
	type:   ExplorationType,
	runner: ExplorationRunner | undefined,
): void {
	if (runner === undefined) delete RUNNERS[type];
	else RUNNERS[type] = runner;
}

/** Return the current runner registry. Read-only for tests. */
export function _getRunnersForTest(): Readonly<Partial<Record<ExplorationType, ExplorationRunner>>> {
	return RUNNERS;
}

// Reference the type in the exported surface so it appears in JSDoc.
export type { ExplorationRunner as _ExplorationRunnerRef } from './types.js';
void 0 as unknown as Exploration;
