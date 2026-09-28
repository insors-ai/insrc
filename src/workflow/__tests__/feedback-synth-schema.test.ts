/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S001 (provenance/feedback) t6 — the DEF/HLD/LLD/PLAN synthesizer body schemas
 * ADMIT-BUT-NEVER-EMIT feedback: a body that already carries feedback validates
 * (so a re-synthesize of an artifact with appended feedback is not rejected),
 * `additionalProperties:false` is preserved, and every synthesizer prompt carries
 * the NEVER-author HARD RULE. Mirrors the companion admit-but-never-emit
 * (`erDefinition`/`companions`) wiring.
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
import { FEEDBACK_PROPERTY_SCHEMA } from '../artifacts/provenance/schema.js';
import type { WorkflowIntent } from '../types.js';

const ajv = new Ajv({ allErrors: true, strict: false });

test('FEEDBACK_PROPERTY_SCHEMA accepts a valid feedback array and rejects a malformed one', () => {
	const validate = ajv.compile(FEEDBACK_PROPERTY_SCHEMA);
	assert.equal(validate([{ id: 'x', author: 'a', timestamp: 't', target: { file: 'f' }, comment: 'c' }]), true);
	assert.equal(validate([{ id: 'x', author: 'a', timestamp: 't', target: { file: 'f' }, comment: 'c', bogus: 1 }]), false);
	assert.equal(validate([{ id: 'x', author: 'a', comment: 'c' }]), false); // missing timestamp + target
});

test('the define synthesizer body schema validates a body carrying feedback (additionalProperties:false preserved)', () => {
	const intent: WorkflowIntent = { workflow: 'define', focus: 'x', repoPath: '/tmp/x', repoIndexedAt: null, params: {} };
	const { schema } = prepareSynthesize(intent, {});
	const bodySchema = (schema as { properties: { body: Record<string, unknown> } }).properties.body;
	assert.equal(bodySchema['additionalProperties'], false, 'body keeps additionalProperties:false');
	assert.ok((bodySchema['properties'] as Record<string, unknown>)['feedback'] !== undefined, 'feedback is an admitted property');

	const validate = ajv.compile(bodySchema);
	const body = {
		flavor: 'enhancement',
		problem: 'A sufficiently long problem statement for the schema.',
		nonGoals: [], assumptions: [], constraints: [],
		stories: [{ id: 's1' }],
		openQuestions: [],
		feedback: [{ id: 'f1', author: 'rev', timestamp: '2026-09-28T00:00:00Z', target: { file: 'f' }, comment: 'note' }],
	};
	assert.equal(validate(body), true, JSON.stringify(validate.errors));
	// An UNKNOWN body key is still rejected (additionalProperties:false intact).
	assert.equal(validate({ ...body, bogusKey: 1 }), false);
});

test('all four synthesizer schemas wire feedback + carry the NEVER-author rule (source-scan)', () => {
	const HERE = dirname(fileURLToPath(import.meta.url));
	const src = readFileSync(resolve(HERE, '..', 'orchestrator.ts'), 'utf8');
	// The shared fragment + rule are imported once and referenced by each schema.
	assert.match(src, /import \{ FEEDBACK_PROPERTY_SCHEMA, FEEDBACK_NEVER_AUTHOR_RULE \} from '\.\/artifacts\/provenance\/schema\.js'/);
	const wired = src.match(/feedback:\s*FEEDBACK_PROPERTY_SCHEMA/g) ?? [];
	assert.ok(wired.length >= 4, `expected feedback wired into all 4 body schemas, saw ${wired.length}`);
	const ruled = src.match(/FEEDBACK_NEVER_AUTHOR_RULE/g) ?? [];
	// one import + one per synthesizer prompt (4).
	assert.ok(ruled.length >= 5, `expected the NEVER-author rule in all 4 prompts, saw ${ruled.length - 1}`);
});
