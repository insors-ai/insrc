/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Workflow executor.
 *
 * Sequential loop over `plan.steps`. For each step:
 *
 *   1. Substitute `$sN.<accessor>` placeholders in the step's
 *      params from prior step outputs.
 *   2. Look up the runner in the registry.
 *   3. Call `runner.run(ctx)`.
 *   4. If the runner returns `type='output'`, store it under
 *      `stepOutputs[step.id]` and advance.
 *   5. If the runner returns `type='llm-pause'`, return a `paused`
 *      tick result. The caller stashes the executor state
 *      server-side (via the state store) and hands the prompt +
 *      schema out to the outer LLM. Resume is via `resume` below.
 *   6. If the runner returns `type='error'`, abort with an `error`
 *      tick result.
 *
 * NO PARALLEL LLM CALLS. Steps run one at a time in plan order,
 * awaits are sequential. That's the framework's non-negotiable —
 * see plans/meta-workflow-framework.md §7 + CLAUDE.md.
 */

import { getLogger } from '../shared/logger.js';
import type {
	ExecutorPause,
	ExecutorState,
	ExecutorTickResult,
	StepRunner,
	StepRunnerContext,
	StepRunnerFinalize,
	StepRunnerResult,
	WorkflowIntent,
	WorkflowPlan,
	WorkflowStep,
} from './types.js';
import { PLACEHOLDER_RE } from './types.js';
import { appendRunLog } from './storage.js';

const log = getLogger('workflow:executor');

// ---------------------------------------------------------------------------
// Runner registry
// ---------------------------------------------------------------------------

/** In-process registry keyed by `${workflow}/${runnerId}`. Runners
 *  register themselves at boot via `registerRunner` — either from
 *  `registerWorkflowRunners()` in the daemon boot path or from the
 *  MCP subprocess's tool-registration hook. */
const registry = new Map<string, StepRunner>();

export function registerRunner(r: StepRunner): void {
	const key = `${r.workflow}/${r.id}`;
	if (registry.has(key)) {
		throw new Error(`registerRunner: duplicate runner '${key}'`);
	}
	registry.set(key, r);
}

export function getRunner(workflow: string, runnerId: string): StepRunner {
	const key = `${workflow}/${runnerId}`;
	const r = registry.get(key);
	if (r === undefined) {
		throw new Error(`getRunner: no runner registered for '${key}'`);
	}
	return r;
}

export function hasRunner(workflow: string, runnerId: string): boolean {
	return registry.has(`${workflow}/${runnerId}`);
}

/** For unit tests. */
export function _clearRunnerRegistryForTests(): void {
	registry.clear();
}

// ---------------------------------------------------------------------------
// Public entry: fresh run
// ---------------------------------------------------------------------------

/** Kick off a workflow run. Returns either the completed step
 *  outputs (small workflows with only deterministic steps), the
 *  first `paused` state, or an error. */
export async function startRun(
	intent: WorkflowIntent,
	plan:   WorkflowPlan,
	runId:  string,
	slug:   string,
): Promise<ExecutorTickResult> {
	const state: ExecutorState = {
		intent,
		plan,
		runId,
		nextStepIndex: 0,
		stepOutputs:   {},
	};
	return runFrom(state, slug);
}

// ---------------------------------------------------------------------------
// Public entry: resume from an LLM pause
// ---------------------------------------------------------------------------

/** Resume a run that was paused waiting for an LLM turn. The caller
 *  supplies the LLM's structured response; the executor hands it to
 *  the runner's `finalize`, stores the resulting output, and
 *  continues from the next step. */
export async function resumeRun(
	state:       ExecutorState,
	llmResponse: Record<string, unknown>,
	slug:        string,
): Promise<ExecutorTickResult> {
	const { pause } = state;
	if (pause === undefined) {
		return errorTick(
			'?',
			'bad-resume',
			`resumeRun called on a state that is not paused`,
			false,
		);
	}
	const step   = state.plan.steps[state.nextStepIndex];
	if (step === undefined || step.id !== pause.stepId) {
		return errorTick(
			pause.stepId,
			'bad-resume',
			`resumeRun: paused step '${pause.stepId}' does not match plan[nextStepIndex]`,
			false,
		);
	}
	const runner = getRunner(state.plan.workflow, pause.runner);
	if (runner.finalize === undefined) {
		return errorTick(
			pause.stepId,
			'bad-runner',
			`resumeRun: runner '${pause.runner}' returned llm-pause but has no finalize()`,
			false,
		);
	}
	const params = substitutePlaceholders(step.params, state.stepOutputs);
	const ctx: StepRunnerContext = {
		intent:      state.intent,
		plan:        state.plan,
		runId:       state.runId,
		stepOutputs: state.stepOutputs,
		params,
	};
	const finalize: StepRunnerFinalize = runner.finalize;
	const result = await finalize(llmResponse, pause.preparedBlob, ctx);
	if (result.type === 'error') {
		return errorTick(step.id, result.code, result.message, result.retryable);
	}

	appendRunLog(slug, state.plan.workflow, state.runId, {
		ts:     new Date().toISOString(),
		event:  'step-finalized',
		stepId: step.id,
		runner: pause.runner,
	});

	const nextState: ExecutorState = {
		...state,
		nextStepIndex: state.nextStepIndex + 1,
		stepOutputs:   { ...state.stepOutputs, [step.id]: result.output },
	};
	// Clear the pause since we resumed past it. Rebuild without the
	// `pause` field.
	const clean: ExecutorState = {
		intent: nextState.intent,
		plan:   nextState.plan,
		runId:  nextState.runId,
		nextStepIndex: nextState.nextStepIndex,
		stepOutputs:   nextState.stepOutputs,
	};
	return runFrom(clean, slug);
}

// ---------------------------------------------------------------------------
// Core loop
// ---------------------------------------------------------------------------

async function runFrom(state: ExecutorState, slug: string): Promise<ExecutorTickResult> {
	let i = state.nextStepIndex;
	const outputs = { ...state.stepOutputs };
	while (i < state.plan.steps.length) {
		const step = state.plan.steps[i]!;
		const params = substitutePlaceholders(step.params, outputs);
		const runner = safeGetRunner(state.plan.workflow, step.runner);
		if (runner === null) {
			return errorTick(
				step.id,
				'no-runner',
				`workflow '${state.plan.workflow}' has no runner '${step.runner}'`,
				false,
			);
		}
		const ctx: StepRunnerContext = {
			intent:      state.intent,
			plan:        state.plan,
			runId:       state.runId,
			stepOutputs: outputs,
			params,
		};
		appendRunLog(slug, state.plan.workflow, state.runId, {
			ts:     new Date().toISOString(),
			event:  'step-start',
			stepId: step.id,
			runner: step.runner,
		});
		let result: StepRunnerResult;
		try {
			result = await runner.run(ctx);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			log.warn({ workflow: state.plan.workflow, step: step.id, err: msg }, 'runner threw');
			return errorTick(step.id, 'runner-threw', msg, false);
		}
		if (result.type === 'error') {
			return errorTick(step.id, result.code, result.message, result.retryable);
		}
		if (result.type === 'llm-pause') {
			const pause: ExecutorPause = {
				stepId:       step.id,
				runner:       step.runner,
				prompt:       result.prompt,
				userTurn:     result.userTurn,
				schema:       result.schema,
				preparedBlob: result.preparedBlob,
			};
			appendRunLog(slug, state.plan.workflow, state.runId, {
				ts:     new Date().toISOString(),
				event:  'step-paused',
				stepId: step.id,
				runner: step.runner,
			});
			return {
				type:  'paused',
				state: {
					intent:        state.intent,
					plan:          state.plan,
					runId:         state.runId,
					nextStepIndex: i,
					stepOutputs:   outputs,
					pause,
				},
			};
		}
		// output
		outputs[step.id] = result.output;
		appendRunLog(slug, state.plan.workflow, state.runId, {
			ts:      new Date().toISOString(),
			event:   'step-output',
			stepId:  step.id,
			runner:  step.runner,
			summary: result.summary ?? null,
		});
		i += 1;
	}
	return { type: 'complete', stepOutputs: outputs };
}

function safeGetRunner(workflow: string, runnerId: string): StepRunner | null {
	try { return getRunner(workflow, runnerId); }
	catch { return null; }
}

function errorTick(
	stepId:    string,
	code:      string,
	message:   string,
	retryable: boolean,
): ExecutorTickResult {
	return { type: 'error', stepId, code, message, retryable };
}

// ---------------------------------------------------------------------------
// Placeholder substitution
// ---------------------------------------------------------------------------

/** Walk `params` recursively, substituting any string that matches
 *  `PLACEHOLDER_RE` with a value from `stepOutputs`.
 *
 *  Placeholders may be:
 *    - `$s1`          — the entire output of step `s1`
 *    - `$s1.foo`      — the `foo` property of `s1`'s output
 *    - `$s1.foo.bar`  — nested property access
 *    - `$s1.foo[0]`   — array indexing (also `$s1.foo.0`)
 *
 *  Unresolved placeholders (missing step, missing accessor path)
 *  throw so a bad plan fails fast rather than silently threading
 *  `undefined` into a runner.
 */
export function substitutePlaceholders(
	params:      unknown,
	stepOutputs: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
	const substituted = walk(params, stepOutputs);
	if (typeof substituted !== 'object' || substituted === null || Array.isArray(substituted)) {
		throw new Error(`substitutePlaceholders: params must be an object; got ${typeof substituted}`);
	}
	return substituted as Record<string, unknown>;
}

function walk(v: unknown, outputs: Readonly<Record<string, unknown>>): unknown {
	if (typeof v === 'string') {
		return maybeResolvePlaceholder(v, outputs);
	}
	if (Array.isArray(v)) {
		return v.map(x => walk(x, outputs));
	}
	if (typeof v === 'object' && v !== null) {
		const out: Record<string, unknown> = {};
		for (const [k, val] of Object.entries(v)) {
			out[k] = walk(val, outputs);
		}
		return out;
	}
	return v;
}

function maybeResolvePlaceholder(
	s:       string,
	outputs: Readonly<Record<string, unknown>>,
): unknown {
	const m = PLACEHOLDER_RE.exec(s);
	if (m === null) return s;
	const stepId = `s${m[1]!}`;
	const accessor = m[2];
	if (!(stepId in outputs)) {
		throw new Error(
			`substitutePlaceholders: '${s}' references unknown step '${stepId}'`,
		);
	}
	const rootValue = outputs[stepId];
	if (accessor === undefined) return rootValue;
	return accessValue(rootValue, accessor, s);
}

function accessValue(root: unknown, accessor: string, original: string): unknown {
	// Split on `.` OR `[N]`, e.g. `foo.bar[2].baz` => ['foo','bar','2','baz']
	const parts: string[] = [];
	// Match either .foo or [N] pieces at the head, iteratively.
	const re = /^(?:\.?([^.[\]]+)|\[(\d+)\])/;
	let rest = accessor;
	// Special-case the head — accessor doesn't lead with a dot but the
	// first piece is still a name.
	{
		const head = re.exec(rest);
		if (head === null) {
			throw new Error(`substitutePlaceholders: could not parse accessor '${accessor}'`);
		}
		parts.push(head[1] ?? head[2]!);
		rest = rest.slice(head[0].length);
	}
	while (rest.length > 0) {
		const m = re.exec(rest);
		if (m === null) {
			throw new Error(`substitutePlaceholders: could not parse accessor '${accessor}' near '${rest}'`);
		}
		parts.push(m[1] ?? m[2]!);
		rest = rest.slice(m[0].length);
	}
	let cur: unknown = root;
	for (const p of parts) {
		if (cur === null || cur === undefined) {
			throw new Error(
				`substitutePlaceholders: '${original}' — path hit null/undefined at '${p}'`,
			);
		}
		if (Array.isArray(cur)) {
			const idx = Number(p);
			if (!Number.isInteger(idx) || idx < 0 || idx >= cur.length) {
				throw new Error(
					`substitutePlaceholders: '${original}' — '${p}' out of bounds`,
				);
			}
			cur = cur[idx];
		} else if (typeof cur === 'object') {
			const rec = cur as Record<string, unknown>;
			if (!(p in rec)) {
				throw new Error(
					`substitutePlaceholders: '${original}' — no key '${p}'`,
				);
			}
			cur = rec[p];
		} else {
			throw new Error(
				`substitutePlaceholders: '${original}' — cannot descend into ${typeof cur}`,
			);
		}
	}
	return cur;
}
