/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Every schema the analyzer hands to a model is valid JSON Schema draft
 * 2020-12 (ISSUE-7a3ab8dc4b9d39ea).
 *
 * A provider that validates a structured-output schema against that draft
 * rejects the whole call when the schema is not valid, before the model runs.
 * The planner's and the classifier's schema carried an identifier with a
 * fragment ('…/plan-task#1'), which the draft forbids: through the claude
 * CLI every planning call was refused with a 400.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import Ajv2020 from 'ajv/dist/2020.js';

import { CLASSIFIED_INTENT_SCHEMA, CLASSIFIER_SCHEMA_VERSION } from '../classifier/schema.js';
import { ClassifierLlmUnavailableError } from '../classifier/driver.js';
import { ScopePickerLlmUnavailableError } from '../classifier/scope-picker.js';
import { DECOMPOSE_SCHEMA } from '../context/decomposer.js';
import { ANALYZE_CONTEXT_BUNDLE_SCHEMA, modelFacingBundleSchema, SCHEMA_VERSION } from '../context/schema.js';
import { CAPABILITY_VERDICTS_SCHEMA } from '../explore/capability-reuse-check.js';
import { DOC_CONSTRAINTS_SCHEMA } from '../explore/doc-constraint-enumerate.js';
import { DOC_DECISIONS_SCHEMA } from '../explore/doc-decision-trace.js';
import { PlanBuilderLlmUnavailableError } from '../planner/driver.js';
import { PLAN_SCHEMA_VERSION, PLAN_TASK_SCHEMA, PLANNED_TASK_SCHEMA } from '../planner/schema.js';
import { AGGREGATE_LLM_SCHEMA } from '../runtimes/shared/aggregate-types.js';

const SCHEMAS: ReadonlyArray<readonly [string, unknown]> = [
	['the planner (PLAN_TASK_SCHEMA)',                    PLAN_TASK_SCHEMA],
	['one planned task (PLANNED_TASK_SCHEMA)',            PLANNED_TASK_SCHEMA],
	['the classifier (CLASSIFIED_INTENT_SCHEMA)',         CLASSIFIED_INTENT_SCHEMA],
	['the stored bundle (ANALYZE_CONTEXT_BUNDLE_SCHEMA)', ANALYZE_CONTEXT_BUNDLE_SCHEMA],
	['the bundle given to the answer-writing call',       modelFacingBundleSchema({ withMeta: false })],
	["the bundle given to the tool loop's final answer",  modelFacingBundleSchema({ withMeta: true })],
	['the lookup planner (DECOMPOSE_SCHEMA)',             DECOMPOSE_SCHEMA],
	['the aggregate report (AGGREGATE_LLM_SCHEMA)',       AGGREGATE_LLM_SCHEMA],
	['doc.constraint.enumerate',                          DOC_CONSTRAINTS_SCHEMA],
	['doc.decision.trace',                                DOC_DECISIONS_SCHEMA],
	['capability.reuse-check',                            CAPABILITY_VERDICTS_SCHEMA],
];

test('every schema handed to a model is valid under JSON Schema draft 2020-12', () => {
	const ajv = new (Ajv2020 as unknown as new (o: object) => { validateSchema(s: unknown): boolean; errors?: unknown })({ strict: false });
	for (const [name, schema] of SCHEMAS) {
		assert.ok(schema !== undefined && typeof schema === 'object', `${name} is exported`);
		assert.equal(ajv.validateSchema(schema), true, `${name}: ${JSON.stringify(ajv.errors)}`);
	}
	// The check does catch the defect: the identifier as it was is refused.
	assert.equal(ajv.validateSchema({ ...PLAN_TASK_SCHEMA as object, $id: 'https://procix.ai/insrc/plan-task#1' }), false);
});

test("a schema's identifier has no fragment and still carries the schema's version", () => {
	const ids: ReadonlyArray<readonly [unknown, string]> = [
		[PLAN_TASK_SCHEMA,              `https://procix.ai/insrc/plan-task/v${PLAN_SCHEMA_VERSION}`],
		[CLASSIFIED_INTENT_SCHEMA,      `https://procix.ai/insrc/classified-intent/v${CLASSIFIER_SCHEMA_VERSION}`],
		[ANALYZE_CONTEXT_BUNDLE_SCHEMA, `https://procix.ai/insrc/analyze-context-bundle/v${SCHEMA_VERSION}`],
	];
	for (const [schema, expected] of ids) {
		const id = (schema as { $id?: unknown }).$id;
		assert.equal(id, expected);
		assert.equal(String(id).includes('#'), false);
	}
	// No schema in the list has an identifier with a fragment.
	for (const [name, schema] of SCHEMAS) {
		const id = (schema as { $id?: unknown }).$id;
		if (id !== undefined) assert.equal(String(id).includes('#'), false, name);
	}
});

test('a failed model call for planning, classification or picking the size names the call and no provider', () => {
	const cause = 'claude exited with 1. API Error: 400 schema is invalid';
	const cases: ReadonlyArray<readonly [Error, string]> = [
		[new PlanBuilderLlmUnavailableError(cause), `The model call for the plan builder failed: ${cause}`],
		[new ClassifierLlmUnavailableError(cause),  `The model call for classification failed: ${cause}`],
		[new ScopePickerLlmUnavailableError(cause), `The model call for picking the size failed: ${cause}`],
	];
	for (const [err, expected] of cases) {
		assert.equal(err.message, expected);
		assert.doesNotMatch(err.message, /Ollama|Local/, err.name);
	}
});
