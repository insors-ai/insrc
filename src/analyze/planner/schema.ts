/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Ajv JSON schemas for PlanTask + PlannedTask.
 *
 * The wire-layer schema enforces shape (every field present, right
 * type, right enum). The 15 invariants (validate.ts) enforce
 * semantics (catalog matches, DAG acyclic, aggregator last, scope
 * band, etc.).
 *
 * Bumping SCHEMA_VERSION pairs with a Plan Builder prompt revision
 * and a re-iteration of every persisted plan.json cache entry.
 *
 * See: design/analyze-plan-builder.md "Plan Task contract"
 *      design/analyze-plan-builder.md "Invariants the validator enforces" (INV-1, INV-2, INV-14)
 */

import { Ajv, type ErrorObject, type ValidateFunction } from 'ajv';

import type { PlanTask, PlannedTask } from '../../shared/analyze-types.js';

export const PLAN_SCHEMA_VERSION = 1;

export const TARGET_ENUM = ['code', 'data', 'infra', 'generic'] as const;
export const SCOPE_BUCKET_ENUM = ['XS', 'S', 'M', 'L', 'XL'] as const;
export const TASK_KIND_ENUM = ['leaf', 'planner'] as const;

/** Stable id pattern for `PlannedTask.taskId` (INV-2). */
export const TASK_ID_PATTERN = '^t\\d{2,3}$';

/**
 * `PlannedTask.rationale` minLength + `PlanTask.reasoning` minLength
 * pinned at the schema level so cargo-cult prompts get caught early
 * by the wire layer instead of leaking into the semantic validator.
 * Mirrors INV-14.
 */
export const RATIONALE_MIN_LENGTH = 20;
export const PLAN_REASONING_MIN_LENGTH = 50;
export const GOAL_MAX_LENGTH = 200;
export const REASONING_MAX_LENGTH = 1000;
export const RATIONALE_MAX_LENGTH = 300;

export const PLANNED_TASK_SCHEMA = {
	type:                 'object',
	additionalProperties: false,
	required:             ['taskId', 'template', 'kind', 'params', 'produces', 'rationale'],
	properties: {
		taskId:   { type: 'string', pattern: TASK_ID_PATTERN },
		taskPath: { type: 'string', minLength: 1 },
		template: { type: 'string', minLength: 1 },
		kind:     { type: 'string', enum: [...TASK_KIND_ENUM] },
		params:   { type: 'object' },
		produces: {
			type:        'array',
			items:       { type: 'string', minLength: 1 },
			minItems:    1,
			uniqueItems: true,
		},
		consumes: {
			type:        'array',
			items:       { type: 'string', minLength: 1 },
			uniqueItems: true,
		},
		rationale: {
			type:      'string',
			minLength: RATIONALE_MIN_LENGTH,
			maxLength: RATIONALE_MAX_LENGTH,
		},
	},
} as const;

export const PLAN_TASK_SCHEMA = {
	$id:        `https://procix.ai/insrc/plan-task#${PLAN_SCHEMA_VERSION}`,
	title:      'PlanTask',
	type:       'object',
	additionalProperties: false,
	required:   ['planId', 'goal', 'target', 'scope', 'tasks', 'reasoning'],
	properties: {
		planId:         { type: 'string', minLength: 1 },
		parentTaskPath: { type: 'string', minLength: 1 },
		goal:           {
			type:      'string',
			minLength: 1,
			maxLength: GOAL_MAX_LENGTH,
		},
		target: { type: 'string', enum: [...TARGET_ENUM] },
		scope:  { type: 'string', enum: [...SCOPE_BUCKET_ENUM] },
		tasks:  {
			type:     'array',
			minItems: 1,
			items:    PLANNED_TASK_SCHEMA,
		},
		reasoning: {
			type:      'string',
			minLength: PLAN_REASONING_MIN_LENGTH,
			maxLength: REASONING_MAX_LENGTH,
		},
	},
} as const;

const ajv = new Ajv({
	allErrors:        true,
	useDefaults:      false,
	removeAdditional: false,
	strict:           false,
});

let _planValidator: ValidateFunction | null = null;
let _plannedTaskValidator: ValidateFunction | null = null;

function planValidator(): ValidateFunction {
	if (_planValidator === null) {
		_planValidator = ajv.compile(PLAN_TASK_SCHEMA);
	}
	return _planValidator;
}

function plannedTaskValidator(): ValidateFunction {
	if (_plannedTaskValidator === null) {
		_plannedTaskValidator = ajv.compile(PLANNED_TASK_SCHEMA);
	}
	return _plannedTaskValidator;
}

export interface PlanValidationResult {
	readonly ok:     boolean;
	readonly errors: readonly string[];
}

export function validatePlanShape(value: unknown): value is PlanTask {
	const v = planValidator();
	return v(value) as boolean;
}

export function validatePlanShapeWithErrors(value: unknown): PlanValidationResult {
	const v = planValidator();
	const ok = v(value) as boolean;
	if (ok) {
		return { ok: true, errors: [] };
	}
	return { ok: false, errors: (v.errors ?? []).map(formatError) };
}

export function validatePlannedTaskShape(value: unknown): value is PlannedTask {
	const v = plannedTaskValidator();
	return v(value) as boolean;
}

export function validatePlannedTaskShapeWithErrors(value: unknown): PlanValidationResult {
	const v = plannedTaskValidator();
	const ok = v(value) as boolean;
	if (ok) {
		return { ok: true, errors: [] };
	}
	return { ok: false, errors: (v.errors ?? []).map(formatError) };
}

function formatError(e: ErrorObject): string {
	const path = e.instancePath === '' ? '<root>' : e.instancePath;
	const params = JSON.stringify(e.params);
	return `${path}: ${e.message ?? '(no message)'} ${params}`;
}
