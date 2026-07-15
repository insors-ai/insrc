/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * JSON schemas for the `plan` workflow's six step outputs. Each is the
 * structured contract the outer LLM's step response must satisfy.
 * Kept as data so the runner file stays readable.
 */

// A PlanTask without its tests[] (enumerate / critique / finalize). The
// `test-strategy.write` step re-emits the tasks WITH tests filled.
const taskCoreProps = {
	id:               { type: 'string', pattern: '^t\\d+$' },
	title:            { type: 'string', minLength: 1 },
	summary:          { type: 'string', minLength: 1 },
	size:             { enum: ['S', 'M', 'L'] },
	order:            { type: 'integer', minimum: 1 },
	dependsOn:        { type: 'array', items: { type: 'string' } },
	acceptanceChecks: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } },
	derivedFrom:      { type: 'array', minItems: 1, items: { type: 'string' } },
} as const;

const taskTestRef = {
	type: 'object',
	required: ['level', 'name'],
	additionalProperties: false,
	properties: {
		level: { enum: ['unit', 'integration', 'live', 'smoke'] },
		name:  { type: 'string', minLength: 1 },
	},
} as const;

const taskCoreSchema = {
	type: 'object',
	required: ['id', 'title', 'summary', 'size', 'order', 'dependsOn', 'acceptanceChecks', 'derivedFrom'],
	additionalProperties: false,
	properties: taskCoreProps,
} as const;

const taskWithTestsSchema = {
	type: 'object',
	required: ['id', 'title', 'summary', 'size', 'order', 'dependsOn', 'acceptanceChecks', 'derivedFrom', 'tests'],
	additionalProperties: false,
	properties: { ...taskCoreProps, tests: { type: 'array', items: taskTestRef } },
} as const;

export const planContextSchema = {
	type: 'object',
	required: ['analyzeBundles'],
	additionalProperties: false,
	properties: {
		analyzeBundles: {
			type: 'array',
			minItems: 1,
			items: {
				type: 'object',
				required: ['kind', 'focus', 'summary'],
				additionalProperties: false,
				properties: {
					kind:       { type: 'string', minLength: 1 },
					focus:      { type: 'string', minLength: 1 },
					summary:    { type: 'string', minLength: 1 },
					pathsCited: { type: 'array', items: { type: 'string', minLength: 1 } },
				},
			},
		},
		notes: { type: 'string' },
	},
} as const;

export const tasksEnumerateSchema = {
	type: 'object',
	required: ['tasks'],
	additionalProperties: false,
	properties: { tasks: { type: 'array', minItems: 1, items: taskCoreSchema } },
} as const;

export const tasksCritiqueSchema = {
	type: 'object',
	required: ['critiques', 'overallOk'],
	additionalProperties: false,
	properties: {
		critiques: {
			type: 'array',
			items: {
				type: 'object',
				required: ['issue', 'suggestion'],
				additionalProperties: false,
				properties: {
					taskId:     { type: 'string' },
					issue:      { type: 'string', minLength: 1 },
					suggestion: { type: 'string', minLength: 1 },
				},
			},
		},
		overallOk: { type: 'boolean' },
	},
} as const;

export const tasksFinalizeSchema = {
	type: 'object',
	required: ['tasks'],
	additionalProperties: false,
	properties: { tasks: { type: 'array', minItems: 1, items: taskCoreSchema } },
} as const;

export const testStrategyWriteSchema = {
	type: 'object',
	required: ['tasks', 'testStrategyCoverage'],
	additionalProperties: false,
	properties: {
		tasks: { type: 'array', minItems: 1, items: taskWithTestsSchema },
		testStrategyCoverage: {
			type: 'array',
			items: {
				type: 'object',
				required: ['lldStrategyItem', 'coveredByTaskIds'],
				additionalProperties: false,
				properties: {
					lldStrategyItem:  { type: 'string', minLength: 1 },
					coveredByTaskIds: { type: 'array', minItems: 1, items: { type: 'string' } },
				},
			},
		},
	},
} as const;

export const planChecklistSchema = {
	type: 'object',
	required: ['results'],
	additionalProperties: false,
	properties: {
		results: {
			type: 'array',
			minItems: 1,
			items: {
				type: 'object',
				required: ['itemId', 'verdict', 'evidence'],
				additionalProperties: false,
				properties: {
					itemId:  { type: 'string', minLength: 1 },
					verdict: { enum: ['passed', 'missed', 'partial', 'ambiguous'] },
					evidence: { type: 'string', minLength: 1 },
					notes:   { type: 'string' },
				},
			},
		},
	},
} as const;
