/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * E20260929e2c6705f:S003 t4+t5 — the sequence + component content-gate source-scan
 * guard. SEQUENCE_CONTENT_GATE_RULE + COMPONENT_CONTENT_GATE_RULE (the HARD RULES
 * telling the synthesizer WHEN to author a `sequenceDefinition` /
 * `componentDependencyDefinition`) MUST be injected into every design-document
 * synthesize prompt that admits the matching slot, mirroring their ER/UX twins — so
 * an author-gate can never silently drift out of a prompt again. Plus an
 * admit-but-never-force schema check: the HLD + LLD body schemas ADMIT both diagram
 * slots without ever requiring them. Mirrors ux-synth-schema.test.ts (k4).
 *
 * Run: npx tsx --test src/workflow/__tests__/diagram-synth-schema.test.ts
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
const HERE = dirname(fileURLToPath(import.meta.url));

function countMatches(src: string, re: RegExp): number {
	return (src.match(re) ?? []).length;
}

test('orchestrator.ts wires the sequence + component gate rules at every synthesizer prompt that admits the matching slot (source-scan)', () => {
	const src = readFileSync(resolve(HERE, '..', 'orchestrator.ts'), 'utf8');

	// (a) imported alongside the schema constants from their -schema.js modules.
	assert.match(src, /import \{[^}]*\bSEQUENCE_CONTENT_GATE_RULE\b[^}]*\} from '\.\/artifacts\/companion\/sequence-schema\.js'/);
	assert.match(src, /import \{[^}]*\bCOMPONENT_CONTENT_GATE_RULE\b[^}]*\} from '\.\/artifacts\/companion\/component-schema\.js'/);

	// (b) each slot is admitted at exactly the two synthesizer body schemas (HLD+LLD);
	//     the matching gate must be injected the same number of times.
	const seqSlots  = countMatches(src, /sequenceDefinition:\s*SEQUENCE_DEFINITION_PROPERTY_SCHEMA/g);
	const compSlots = countMatches(src, /componentDependencyDefinition:\s*COMPONENT_DEFINITION_PROPERTY_SCHEMA/g);
	assert.equal(seqSlots, 2, `expected 2 sequenceDefinition slot admissions (HLD+LLD), saw ${seqSlots}`);
	assert.equal(compSlots, 2, `expected 2 componentDependencyDefinition slot admissions (HLD+LLD), saw ${compSlots}`);

	// One bare-array-element injection per synthesizer prompt (== slot count).
	const seqInjections  = countMatches(src, /^\t+SEQUENCE_CONTENT_GATE_RULE,$/gm);
	const compInjections = countMatches(src, /^\t+COMPONENT_CONTENT_GATE_RULE,$/gm);
	assert.equal(seqInjections, seqSlots, `expected the sequence gate injected once per admitting prompt; saw ${seqInjections}`);
	assert.equal(compInjections, compSlots, `expected the component gate injected once per admitting prompt; saw ${compInjections}`);

	// Co-located with the ER twin they mirror (still intact).
	assert.ok(countMatches(src, /^\t+ER_CONTENT_GATE_RULE,$/gm) >= 2, 'the ER twin the diagram gates mirror is intact');
});

test('both runner step-prompt builders carry the sequence + component gates adjacent to the ER gate (source-scan)', () => {
	for (const runner of ['design-story', 'design-epic']) {
		const src = readFileSync(resolve(HERE, '..', 'runners', runner, 'index.ts'), 'utf8');
		assert.match(src, /import \{[^}]*\bSEQUENCE_CONTENT_GATE_RULE\b[^}]*\} from '\.\.\/\.\.\/artifacts\/companion\/sequence-schema\.js'/, `${runner}: sequence gate imported`);
		assert.match(src, /import \{[^}]*\bCOMPONENT_CONTENT_GATE_RULE\b[^}]*\} from '\.\.\/\.\.\/artifacts\/companion\/component-schema\.js'/, `${runner}: component gate imported`);
		assert.ok(countMatches(src, /^\t+SEQUENCE_CONTENT_GATE_RULE,$/gm) >= 1, `${runner}: sequence gate injected`);
		assert.ok(countMatches(src, /^\t+COMPONENT_CONTENT_GATE_RULE,$/gm) >= 1, `${runner}: component gate injected`);
	}
});

test('the HLD (design.epic) synthesize body schema ADMITS both diagram slots but never requires them', () => {
	const intent: WorkflowIntent = { workflow: 'design.epic', focus: 'x', repoPath: '/tmp/x', repoIndexedAt: null, params: {} };
	const { schema } = prepareSynthesize(intent, {});
	const bodySchema = (schema as { properties: { body: Record<string, unknown> } }).properties.body;

	assert.equal(bodySchema['additionalProperties'], false, 'body keeps additionalProperties:false');
	const props = bodySchema['properties'] as Record<string, unknown>;
	assert.ok(props['sequenceDefinition'] !== undefined, 'sequenceDefinition is an admitted body property');
	assert.ok(props['componentDependencyDefinition'] !== undefined, 'componentDependencyDefinition is an admitted body property');
	const required = (bodySchema['required'] as string[] | undefined) ?? [];
	assert.ok(!required.includes('sequenceDefinition'), 'sequenceDefinition is NOT required');
	assert.ok(!required.includes('componentDependencyDefinition'), 'componentDependencyDefinition is NOT required');
	assert.doesNotThrow(() => ajv.compile(bodySchema));
});

test('the LLD (design.story) synthesize body schema ADMITS both diagram slots but never requires them', () => {
	const intent: WorkflowIntent = {
		workflow: 'design.story', focus: 'x', repoPath: '/tmp/x', repoIndexedAt: null,
		params: { standalone: true, epicHash: 'e2c6705fd105d4ac', storyId: 'S003' },
	};
	const { schema } = prepareSynthesize(intent, {});
	const bodySchema = (schema as { properties: { body: Record<string, unknown> } }).properties.body;

	assert.equal(bodySchema['additionalProperties'], false, 'body keeps additionalProperties:false');
	const props = bodySchema['properties'] as Record<string, unknown>;
	assert.ok(props['sequenceDefinition'] !== undefined, 'sequenceDefinition is an admitted body property');
	assert.ok(props['componentDependencyDefinition'] !== undefined, 'componentDependencyDefinition is an admitted body property');
	const required = (bodySchema['required'] as string[] | undefined) ?? [];
	assert.ok(!required.includes('sequenceDefinition'), 'sequenceDefinition is NOT required');
	assert.ok(!required.includes('componentDependencyDefinition'), 'componentDependencyDefinition is NOT required');
	assert.doesNotThrow(() => ajv.compile(bodySchema));
});
