/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Plan Validator -- the 15 invariants from
 * design/analyze-plan-builder.md "Invariants the validator enforces".
 *
 * Runs AFTER the Ajv shape check (schema.ts). Returns either `null`
 * (every invariant passes) or the first failure (so the corrective
 * retry has a single, actionable feedback note).
 *
 * The wrapper distinguishes between "wire-layer" failures (caught by
 * Ajv on the LLM's emit) and "semantic" failures (caught here). The
 * Plan Builder driver feeds the failure's invariant id + message
 * back into the LLM's next-turn user message for a corrective retry.
 *
 * Numbering matches the design doc. A few invariants have multi-step
 * sub-checks: INV-3 / INV-4 / INV-5 / INV-6 / INV-8 / INV-12 all
 * depend on the catalog; each emits the most specific failure the
 * inspection found.
 */

import { Ajv, type ErrorObject } from 'ajv';

import type {
	AnalyzeScope,
	AnalyzeScopeRef,
	AnalyzeTarget,
	AnalyzeTaskTemplate,
	PlanTask,
	PlannedTask,
} from '../../shared/analyze-types.js';
import { isKindCompatibleWithTarget, TARGET_TO_KINDS } from '../classifier/validate.js';

/** Catalog-key -> template, indexed once at the start of validation. */
type CatalogIndex = ReadonlyMap<string, AnalyzeTaskTemplate>;

export interface PlanValidationFailure {
	/** Invariant id matching the design doc ('INV-1' through 'INV-15'). */
	readonly invariantId: PlanInvariantId;
	readonly message:     string;
	/**
	 * Optional pointer into the plan -- e.g. taskIndex / taskId so the
	 * orchestrator + UI can highlight the offending task.
	 */
	readonly target?:     Readonly<Record<string, unknown>>;
}

export type PlanInvariantId =
	| 'INV-1'  | 'INV-2'  | 'INV-3'  | 'INV-4'  | 'INV-5'
	| 'INV-6'  | 'INV-7'  | 'INV-8'  | 'INV-9'  | 'INV-10'
	| 'INV-11' | 'INV-12' | 'INV-13' | 'INV-14' | 'INV-15';

/**
 * Scope-policy task-count bands from the design doc. Indexed by the
 * Plan's own scope bucket (not the root Run's). The cap is 80; the
 * floor is reduced by 50% for focused intents (see INV-13 note).
 */
export const SCOPE_BAND: Readonly<Record<AnalyzeScope, { readonly lo: number; readonly hi: number }>> = Object.freeze({
	XS: { lo: 3,  hi: 8  },
	S:  { lo: 10, hi: 20 },
	M:  { lo: 20, hi: 40 },
	L:  { lo: 30, hi: 60 },
	XL: { lo: 40, hi: 80 },
});

/**
 * A scope of the task whose kind does not go with its kind of source, or null:
 *   - the task's own `scopeRef`, against its template's family;
 *   - a subrun task's `childIntent.scopeRef`, against the child intent's own
 *     `target`, which is the family the child plan is built for.
 * The kinds come from the one table the classifier and the runtimes use, so a
 * plan that passes here is not refused for a scope's kind when it runs. Only a
 * parameter the template declares is checked; a value that is not an object
 * with a string `kind` (or a child intent with no known `target`) is left to
 * the schema.
 */
function refusedScopeKind(
	task: PlannedTask,
	tmpl: AnalyzeTaskTemplate,
): { readonly kind: string; readonly accepted: readonly string[]; readonly message: string } | null {
	const declared = tmpl.inputSchema?.['properties'] as Record<string, unknown> | undefined;
	const params = task.params as Record<string, unknown> | undefined;
	const refusal = (where: string, scopeRef: unknown, family: AnalyzeTarget) => {
		if (typeof scopeRef !== 'object' || scopeRef === null) return null;
		const kind = (scopeRef as Record<string, unknown>)['kind'];
		if (typeof kind !== 'string') return null;
		if (isKindCompatibleWithTarget(family, kind as AnalyzeScopeRef['kind'])) return null;
		const accepted: readonly string[] = TARGET_TO_KINDS[family];
		return {
			kind,
			accepted,
			message:
				`task ${task.taskId} (${task.template}): ${where}.kind='${kind}' is not a kind of scope ` +
				`the '${family}' family accepts. Accepted kinds: ${accepted.join(', ')}.`,
		};
	};

	if (declared?.['scopeRef'] !== undefined) {
		const own = refusal('scopeRef', params?.['scopeRef'], tmpl.target);
		if (own !== null) return own;
	}
	const childIntent = params?.['childIntent'];
	if (declared?.['childIntent'] !== undefined && typeof childIntent === 'object' && childIntent !== null) {
		const child = childIntent as Record<string, unknown>;
		const target = child['target'];
		if (typeof target === 'string' && Object.hasOwn(TARGET_TO_KINDS, target)) {
			return refusal('childIntent.scopeRef', child['scopeRef'], target as AnalyzeTarget);
		}
	}
	return null;
}

/** The three ways an adherence check is given its constraints, as the planner is told them. */
const CONSTRAINT_WAYS =
	'`constraintTopic` (the subject to look up in the repository\'s documents; the check finds the constraints itself), ' +
	'`constraints` (a non-empty inline list), or `constraintIds` (a non-empty list of ids of summarised documents)';

/**
 * An adherence-check task that cannot be run as planned, or null. Applies to a
 * template that declares a `constraintTopic` parameter (the adherence checks):
 *   - the task carries `constraintsSource`, which is no longer read: a check
 *     does not take its constraints from another task's output;
 *   - the task gives no source of constraints that is not empty. The schema's
 *     `anyOf` accepts an empty list; this check is what requires content.
 * The check itself reads an inline list, then ids, then the topic
 * (runtimes/shared/adherence.ts), and throws when it has none; a plan that
 * passes here does not reach that throw.
 */
function missingConstraintSource(
	task: PlannedTask,
	tmpl: AnalyzeTaskTemplate,
): { readonly problem: 'constraints-source-removed' | 'no-constraint-source'; readonly message: string } | null {
	const declared = tmpl.inputSchema?.['properties'] as Record<string, unknown> | undefined;
	if (declared?.['constraintTopic'] === undefined) return null;
	const params = (task.params ?? {}) as Record<string, unknown>;

	if (params['constraintsSource'] !== undefined) {
		return {
			problem: 'constraints-source-removed',
			message:
				`task ${task.taskId} (${task.template}): \`constraintsSource\` is no longer accepted: an adherence check does not take ` +
				`its constraints from another task's output. Remove it and give ${CONSTRAINT_WAYS}.`,
		};
	}

	const topic = params['constraintTopic'];
	const hasTopic  = typeof topic === 'string' && topic.trim().length > 0;
	const hasInline = Array.isArray(params['constraints']) && params['constraints'].length > 0;
	const hasIds    = Array.isArray(params['constraintIds']) && params['constraintIds'].length > 0;
	if (hasTopic || hasInline || hasIds) return null;
	return {
		problem: 'no-constraint-source',
		message:
			`task ${task.taskId} (${task.template}): an adherence check needs constraints to check against, and this task gives none. ` +
			`Give ${CONSTRAINT_WAYS}; or leave the task out of the plan.`,
	};
}

/** Reduce the lower bound for focused intents (INV-13 note). */
function focusedLowerBound(scope: AnalyzeScope): number {
	return Math.floor(SCOPE_BAND[scope].lo / 2);
}

export interface ValidateOpts {
	/**
	 * Pass `true` when the Plan was built for a focused-intent run.
	 * Reduces the INV-13 lower bound by 50%.
	 */
	readonly focused?: boolean;
	/**
	 * Whether the validator expects a non-root Plan (`parentTaskPath`
	 * required). Default `false` -- the Plan Builder stamps this from
	 * the call site.
	 */
	readonly isChildPlan?: boolean;
}

/**
 * Validate the plan against every invariant. Returns the first
 * failure or null.
 *
 * The order matches the design's numbering so test failures point at
 * a stable invariant. Within each invariant, multi-task scans report
 * the FIRST offender (not all of them) -- the corrective retry is
 * cheaper if the model has one specific thing to fix per attempt.
 */
export function validatePlan(
	plan:     PlanTask,
	catalog:  readonly AnalyzeTaskTemplate[],
	opts:    ValidateOpts = {},
): PlanValidationFailure | null {
	const index = indexCatalog(catalog);

	// INV-1: non-empty tasks list
	if (plan.tasks.length === 0) {
		return {
			invariantId: 'INV-1',
			message:     'tasks list must be non-empty',
		};
	}

	// INV-2: stable + monotonic task ids
	for (let i = 0; i < plan.tasks.length; i++) {
		const t = plan.tasks[i]!;
		const expected = makeTaskId(i + 1);
		if (t.taskId !== expected) {
			return {
				invariantId: 'INV-2',
				message:
					`task at index ${i} has taskId '${t.taskId}'; expected '${expected}' ` +
					'(taskIds must be monotonic t01, t02, ..., matching the array order)',
				target: { index: i, taskId: t.taskId, expected },
			};
		}
	}

	// INV-3: templates exist
	for (let i = 0; i < plan.tasks.length; i++) {
		const t = plan.tasks[i]!;
		if (!index.has(t.template)) {
			return {
				invariantId: 'INV-3',
				message:     `task ${t.taskId}: template '${t.template}' is not in the catalog`,
				target:      { index: i, taskId: t.taskId, template: t.template },
			};
		}
	}

	// INV-4: templates are target-correct
	for (let i = 0; i < plan.tasks.length; i++) {
		const t = plan.tasks[i]!;
		const tmpl = index.get(t.template)!;
		if (!isTargetCompatible(plan.target, tmpl.target)) {
			return {
				invariantId: 'INV-4',
				message:
					`task ${t.taskId}: template '${t.template}' target='${tmpl.target}' ` +
					`does not match plan target='${plan.target}'`,
				target: { index: i, taskId: t.taskId, planTarget: plan.target, templateTarget: tmpl.target },
			};
		}
	}

	// INV-5: params validate against template inputSchema
	const paramAjv = new Ajv({
		allErrors:        true,
		useDefaults:      false,
		removeAdditional: false,
		strict:           false,
	});
	for (let i = 0; i < plan.tasks.length; i++) {
		const t = plan.tasks[i]!;
		const tmpl = index.get(t.template)!;
		if (tmpl.inputSchema === undefined) continue; // no schema declared -> nothing to validate
		// A kind of scope the task's family (or its child intent's) does not accept:
		// said in words the planner can act on, before the schema's own (terser) enum error.
		const refusedKind = refusedScopeKind(t, tmpl);
		if (refusedKind !== null) {
			return {
				invariantId: 'INV-5',
				message:     refusedKind.message,
				target:      { index: i, taskId: t.taskId, template: t.template, kind: refusedKind.kind, accepted: refusedKind.accepted },
			};
		}
		// An adherence check with nothing to check against, or with the removed
		// upstream-task parameter: also said in words, before the schema's error.
		const noSource = missingConstraintSource(t, tmpl);
		if (noSource !== null) {
			return {
				invariantId: 'INV-5',
				message:     noSource.message,
				target:      { index: i, taskId: t.taskId, template: t.template, problem: noSource.problem },
			};
		}
		const v = paramAjv.compile(tmpl.inputSchema);
		const ok = v(t.params) as boolean;
		if (!ok) {
			const errs = (v.errors ?? []).map((e: ErrorObject) => `${e.instancePath || '<root>'}: ${e.message ?? '?'}`).join('; ');
			return {
				invariantId: 'INV-5',
				message:     `task ${t.taskId}: params failed inputSchema: ${errs}`,
				target:      { index: i, taskId: t.taskId, template: t.template, errors: errs },
			};
		}
	}

	// INV-6: produces matches template
	for (let i = 0; i < plan.tasks.length; i++) {
		const t = plan.tasks[i]!;
		const tmpl = index.get(t.template)!;
		if (tmpl.produces === undefined) continue;
		const planned   = [...t.produces].sort();
		const declared  = [...tmpl.produces].sort();
		if (planned.length !== declared.length || planned.some((v, i) => v !== declared[i])) {
			return {
				invariantId: 'INV-6',
				message:
					`task ${t.taskId}: produces=${JSON.stringify(t.produces)} does not match ` +
					`template '${t.template}' declared produces=${JSON.stringify(tmpl.produces)}`,
				target: { index: i, taskId: t.taskId, template: t.template },
			};
		}
	}

	// INV-7: consumes references valid producers earlier in this Plan
	const producedSoFar = new Set<string>();
	for (let i = 0; i < plan.tasks.length; i++) {
		const t = plan.tasks[i]!;
		const cons = t.consumes ?? [];
		for (const name of cons) {
			if (!producedSoFar.has(name)) {
				return {
					invariantId: 'INV-7',
					message:
						`task ${t.taskId}: consumes='${name}' is not produced by any earlier task ` +
						'in this Plan',
					target: { index: i, taskId: t.taskId, missingDependency: name },
				};
			}
		}
		for (const name of t.produces) {
			producedSoFar.add(name);
		}
	}

	// INV-8: kind matches template
	for (let i = 0; i < plan.tasks.length; i++) {
		const t = plan.tasks[i]!;
		const tmpl = index.get(t.template)!;
		if (t.kind !== tmpl.kind) {
			return {
				invariantId: 'INV-8',
				message:
					`task ${t.taskId}: kind='${t.kind}' does not match template kind='${tmpl.kind}'`,
				target: { index: i, taskId: t.taskId, planKind: t.kind, templateKind: tmpl.kind },
			};
		}
	}

	// INV-9: flat within the Plan -- no nested sub-task arrays inside params.
	for (let i = 0; i < plan.tasks.length; i++) {
		const t = plan.tasks[i]!;
		const nested = findNestedTaskArray(t.params);
		if (nested !== null) {
			return {
				invariantId: 'INV-9',
				message:
					`task ${t.taskId}: params contains a nested task-array at '${nested}' ` +
					'-- recursion happens via planner-kind templates, not nested params',
				target: { index: i, taskId: t.taskId, nestedAt: nested },
			};
		}
	}

	// INV-10: no cross-cycles in the produces -> consumes DAG.
	// Combined with INV-11 below: since the list is serial, INV-7's
	// "must be produced earlier" check already prevents cycles. We
	// double-check here so a future move to parallel scheduling
	// inherits the invariant for free.
	const cycle = findDagCycle(plan.tasks);
	if (cycle !== null) {
		return {
			invariantId: 'INV-10',
			message:     `dependency cycle detected: ${cycle.join(' -> ')}`,
			target:      { cycle },
		};
	}

	// INV-11: serial linearization is a valid topological sort.
	// This is implied by INV-7 (consumers come after producers). We
	// double-check explicitly so the design's "the list IS a topological
	// sort" guarantee is asserted in code.
	const topoFailure = checkTopologicalOrder(plan.tasks);
	if (topoFailure !== null) {
		return {
			invariantId: 'INV-11',
			message:     topoFailure,
		};
	}

	// INV-12: exactly one aggregator, must be last.
	const aggregatorIndices: number[] = [];
	for (let i = 0; i < plan.tasks.length; i++) {
		const t = plan.tasks[i]!;
		const tmpl = index.get(t.template)!;
		if (tmpl.isAggregator === true) {
			aggregatorIndices.push(i);
		}
	}
	if (aggregatorIndices.length === 0) {
		return {
			invariantId: 'INV-12',
			message:     'no aggregator task found; every Plan must end with a terminal aggregator template',
		};
	}
	if (aggregatorIndices.length > 1) {
		return {
			invariantId: 'INV-12',
			message:
				`exactly one aggregator task is allowed; found ${aggregatorIndices.length} at indices ` +
				JSON.stringify(aggregatorIndices),
			target: { aggregatorIndices },
		};
	}
	if (aggregatorIndices[0] !== plan.tasks.length - 1) {
		return {
			invariantId: 'INV-12',
			message:
				`aggregator task must be last; found at index ${aggregatorIndices[0]} of ` +
				`${plan.tasks.length - 1}`,
			target: { aggregatorIndex: aggregatorIndices[0], lastIndex: plan.tasks.length - 1 },
		};
	}

	// INV-13: scope policy adherence -- task count within the band.
	const band = SCOPE_BAND[plan.scope];
	const lo = opts.focused === true ? focusedLowerBound(plan.scope) : band.lo;
	const hi = band.hi;
	if (plan.tasks.length < lo || plan.tasks.length > hi) {
		return {
			invariantId: 'INV-13',
			message:
				`task count ${plan.tasks.length} is outside the scope band for ${plan.scope} ` +
				`(${lo}-${hi}${opts.focused === true ? ' focused' : ''})`,
			target: { count: plan.tasks.length, scope: plan.scope, band: { lo, hi } },
		};
	}

	// INV-14: reasoning non-empty. Wire-layer schema already caught
	// minLength but we re-check here to keep the invariant ids stable
	// in test failures.
	if (plan.reasoning.trim().length < 50) {
		return {
			invariantId: 'INV-14',
			message:     `plan reasoning must be >= 50 chars; got ${plan.reasoning.trim().length}`,
		};
	}
	for (let i = 0; i < plan.tasks.length; i++) {
		const t = plan.tasks[i]!;
		if (t.rationale.trim().length < 20) {
			return {
				invariantId: 'INV-14',
				message:     `task ${t.taskId}: rationale must be >= 20 chars; got ${t.rationale.trim().length}`,
				target:      { index: i, taskId: t.taskId },
			};
		}
	}

	// INV-15: parentTaskPath presence matches root/child status.
	if (opts.isChildPlan === true) {
		if (plan.parentTaskPath === undefined || plan.parentTaskPath.length === 0) {
			return {
				invariantId: 'INV-15',
				message:     'child Plan must have parentTaskPath set',
			};
		}
	} else {
		if (plan.parentTaskPath !== undefined) {
			return {
				invariantId: 'INV-15',
				message:
					`root Plan must not have parentTaskPath set; got '${plan.parentTaskPath}'`,
			};
		}
	}

	return null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function indexCatalog(catalog: readonly AnalyzeTaskTemplate[]): CatalogIndex {
	const m = new Map<string, AnalyzeTaskTemplate>();
	for (const t of catalog) {
		m.set(t.id, t);
	}
	return m;
}

function makeTaskId(n: number): string {
	return n < 100 ? `t${String(n).padStart(2, '0')}` : `t${n}`;
}

/**
 * Generic-target plans accept tasks from any per-target template
 * family (the planner is expected to spawn per-target sub-plans).
 * Otherwise the plan's target must equal the template's target.
 */
function isTargetCompatible(planTarget: AnalyzeTarget, templateTarget: AnalyzeTarget): boolean {
	if (planTarget === templateTarget) return true;
	if (planTarget === 'generic') return true;
	return false;
}

/**
 * Walk the params object looking for any value that is a non-empty
 * array of objects with a `template` or `taskId` field -- the
 * signature of a smuggled nested-plan. Returns the JSON pointer of
 * the offending field or null.
 */
function findNestedTaskArray(value: unknown, path: string = ''): string | null {
	if (Array.isArray(value)) {
		for (let i = 0; i < value.length; i++) {
			const elem = value[i];
			if (
				typeof elem === 'object' &&
				elem !== null &&
				!Array.isArray(elem) &&
				('template' in elem || 'taskId' in elem)
			) {
				return `${path}[${i}]`;
			}
			const nested = findNestedTaskArray(elem, `${path}[${i}]`);
			if (nested !== null) return nested;
		}
		return null;
	}
	if (typeof value === 'object' && value !== null) {
		for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
			const nested = findNestedTaskArray(v, `${path}.${k}`);
			if (nested !== null) return nested;
		}
	}
	return null;
}

/**
 * Build the produces -> consumes DAG and check for cycles via DFS.
 * Cycles are theoretically prevented by INV-7 (consumers come after
 * producers in serial order) but we double-check explicitly.
 */
function findDagCycle(tasks: readonly PlannedTask[]): string[] | null {
	const producerOf = new Map<string, string>();   // output name -> taskId
	for (const t of tasks) {
		for (const out of t.produces) {
			producerOf.set(out, t.taskId);
		}
	}

	const adj = new Map<string, Set<string>>();     // taskId -> tasks it depends on
	for (const t of tasks) {
		const deps = new Set<string>();
		for (const name of t.consumes ?? []) {
			const producer = producerOf.get(name);
			if (producer !== undefined && producer !== t.taskId) {
				deps.add(producer);
			}
		}
		adj.set(t.taskId, deps);
	}

	const WHITE = 0, GRAY = 1, BLACK = 2;
	const color = new Map<string, number>();
	for (const t of tasks) color.set(t.taskId, WHITE);

	const stack: string[] = [];
	function dfs(node: string): string[] | null {
		color.set(node, GRAY);
		stack.push(node);
		for (const dep of adj.get(node) ?? []) {
			const c = color.get(dep);
			if (c === GRAY) {
				// Cycle: build path from `dep` back to itself via the stack.
				const idx = stack.indexOf(dep);
				return [...stack.slice(idx), dep];
			}
			if (c === WHITE) {
				const cyc = dfs(dep);
				if (cyc !== null) return cyc;
			}
		}
		stack.pop();
		color.set(node, BLACK);
		return null;
	}

	for (const t of tasks) {
		if (color.get(t.taskId) === WHITE) {
			const cyc = dfs(t.taskId);
			if (cyc !== null) return cyc;
		}
	}
	return null;
}

/**
 * Confirm the array order is a valid topological sort: every
 * `consumes` reference resolves to a producer earlier in the list.
 * INV-7 already enforces this; we re-check explicitly to keep the
 * invariant id stable + so a future parallel scheduler inherits the
 * guarantee.
 */
function checkTopologicalOrder(tasks: readonly PlannedTask[]): string | null {
	const positionByOutput = new Map<string, number>();
	for (let i = 0; i < tasks.length; i++) {
		const t = tasks[i]!;
		for (const out of t.produces) {
			positionByOutput.set(out, i);
		}
	}
	for (let i = 0; i < tasks.length; i++) {
		const t = tasks[i]!;
		for (const name of t.consumes ?? []) {
			const pos = positionByOutput.get(name);
			if (pos === undefined) {
				return `task ${t.taskId}: consumes '${name}' has no producer in this Plan`;
			}
			if (pos >= i) {
				return `task ${t.taskId}: consumes '${name}' is produced at index ${pos}, not earlier than ${i}`;
			}
		}
	}
	return null;
}

// ---------------------------------------------------------------------------
// Test hooks
// ---------------------------------------------------------------------------

export const _findNestedTaskArrayForTest = findNestedTaskArray;
export const _findDagCycleForTest = findDagCycle;
export const _makeTaskIdForTest = makeTaskId;
