/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The DEF/HLD/LLD/PLAN synthesizer body schemas do not admit feedback: a design record's body holds none, feedback is a Feedback
 * line stored beside the head, so a body that carries a `feedback` key is refused like any other unknown key
 * (`additionalProperties:false` is kept) and no synthesizer prompt mentions it.
 *
 * Run: npx tsx --test src/workflow/__tests__/feedback-synth-schema.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Ajv } from 'ajv';

import { prepareSynthesize } from '../orchestrator.js';
import type { WorkflowIntent } from '../types.js';

const ajv = new Ajv({ allErrors: true, strict: false });

test('the define synthesizer body schema refuses a body carrying feedback (additionalProperties:false preserved)', () => {
	const intent: WorkflowIntent = { workflow: 'define', focus: 'x', repoPath: '/tmp/x', repoIndexedAt: null, params: {} };
	const { schema } = prepareSynthesize(intent, {});
	const bodySchema = (schema as { properties: { body: Record<string, unknown> } }).properties.body;
	assert.equal(bodySchema['additionalProperties'], false, 'body keeps additionalProperties:false');
	assert.equal((bodySchema['properties'] as Record<string, unknown>)['feedback'], undefined, 'feedback is not an admitted property');

	const validate = ajv.compile(bodySchema);
	const body = {
		flavor: 'enhancement',
		problem: 'A sufficiently long problem statement for the schema.',
		nonGoals: [], assumptions: [], constraints: [],
		stories: [{ id: 's1' }],
		openQuestions: [],
	};
	assert.equal(validate(body), true, JSON.stringify(validate.errors));
	assert.equal(validate({ ...body, feedback: [{ id: 'f1', author: 'rev', timestamp: '2026-09-28T00:00:00Z', target: { file: 'f' }, comment: 'note' }] }), false);
	assert.equal(validate({ ...body, bogusKey: 1 }), false);
});

test('no synthesizer schema or prompt in the orchestrator names feedback (source-scan)', () => {
	const HERE = dirname(fileURLToPath(import.meta.url));
	const src = readFileSync(resolve(HERE, '..', 'orchestrator.ts'), 'utf8');
	assert.doesNotMatch(src, /FEEDBACK_PROPERTY_SCHEMA|FEEDBACK_NEVER_AUTHOR_RULE|provenance\/schema|provenance\/writer|priorFeedback/);
	assert.doesNotMatch(src, /feedback:\s*FEEDBACK/);
});
